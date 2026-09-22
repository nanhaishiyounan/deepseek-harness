/**
 * The SQLite `KgStore` provider: the seven-table property graph (schema v2)
 * with merge-shaped idempotent upserts, k-hop subgraph walks (recursive CTE),
 * source-run watermarks, aliases, and tombstoning — plus the v1 `GraphStore`
 * face (`putTriples` translates internally onto the node/edge merges).
 * @module @deepseek-ai/dsh-kb-graph-sqlite/store
 */

import { resolve } from 'node:path'
import type { DatabaseSync } from 'node:sqlite'
import {
  KbGraphError, kgNodeTypeId, kgRelationId,
  type KbGraphEntity, type KbGraphStoredTriple, type KbGraphTriple,
  type KgBuildRunInput, type KgBuildRunRow, type KgEdge, type KgEdgeMention,
  type KgEpisodeInput, type KgEpisodeRow, type KgNode, type KgNodeHit,
  type KgNodeTypeId, type KgNodeType, type KgOntologyRevision,
  type KgOntologyRevisionInput, type KgOntologyXref, type KgPropDef,
  type KgProvenance, type KgRelation, type KgRelationConstraint, type KgRelationId,
  type KgSourceRun, type KgStore, type KgSubgraph, type KgSubgraphLimits, type KgSubgraphNode,
} from '@deepseek-ai/dsh-kb-graph'
import { validateSchema } from './schema.ts'
import { sql } from './sql.ts'

type DatabaseSyncConstructor = typeof import('node:sqlite')['DatabaseSync']

/** One kg_nodes row (id resolution only). */
interface NodeIdRow { id: string }

/** One kg_build_runs row as the ledger read shapes it. */
interface BuildRunSqlRow {
  id: number
  tenant_id: string
  started_at: string
  finished_at: string
  report_json: string
  metrics_json: string
}

/** One kg_ontology_revisions row as the audit read shapes it. */
interface RevisionRow {
  id: number
  ontology_version: string
  summary: string
  changes_json: string
  created_at: string
}

/** One v1-facing stored-triple projection row. */
interface TripleProjectionRow {
  row_id: number
  tenant_id: string
  source_system: string
  source_id: string
  relation_id: string
  subject_type: string
  subject_id: string
  object_type: string
  object_id: string
}

/** One `select-nodes` projection row (the bulk node-listing read). */
interface NodeListRow {
  id: string
  tenant_id: string
  type_id: string
  natural_key: string | null
  name: string
  summary: string | null
  props: string | null
  created_at: string
  updated_at: string
}

/** One kg_edges row for the v2 face. */
interface EdgeRow {
  id: string
  tenant_id: string
  src_id: string
  dst_id: string
  relation_id: string
  fact: string | null
  props: string | null
  confidence: number
  source_system: string
  source_id: string
  extracted_at: string
  valid_from: string
  valid_until: string | null
  expired_at: string | null
  recorded_at: string
}

/** One subgraph walk row. */
interface WalkRow { id: string; type_id: string; name: string; natural_key: string | null; depth: number }

/** One kg_source_runs row. */
interface SourceRunRow {
  source_system: string
  scope: string
  watermark: string | null
  content_hash: string | null
  run_config: string | null
  last_run_at: string
}

/** One kg_node_types row. */
interface NodeTypeRow {
  readonly type_id: string
  readonly label: string
  readonly description: string | null
  readonly layer: string
  readonly extends_type: string | null
  readonly props_schema: string
  readonly natural_key: string | null
  readonly foodon_uri: string | null
  readonly foodon_id: string | null
  readonly synonyms_json: string | null
  readonly source: string
  readonly status: string
  readonly created_at: string
  readonly updated_at: string
}

/** One kg_relations row. */
interface RelationRow {
  readonly relation_id: string
  readonly label: string
  readonly description: string | null
  readonly domain_type: string | null
  readonly range_type: string | null
  readonly constraints_json: string
  readonly kind: string
  readonly inverse_of: string | null
  readonly foodon_prop_uri: string | null
  readonly source: string
  readonly created_at: string
  readonly updated_at: string
}

/** One kg_episode row joined with its mention count. */
interface EpisodeSqlRow {
  readonly uuid: string
  readonly tenant_id: string
  readonly source: string
  readonly name: string
  readonly content: string
  readonly valid_at: string
  readonly created_at: string
  readonly metadata: string | null
  readonly mention_count: number
}

/** One kg_mention row joined with its episode (the edge-first read). */
interface EdgeMentionSqlRow {
  readonly episode_uuid: string
  readonly edge_id: string
  readonly created_at: string
  readonly episode_tenant: string
  readonly episode_source: string
  readonly episode_name: string
  readonly episode_content: string
  readonly episode_valid_at: string
  readonly episode_created_at: string
  readonly episode_metadata: string | null
}

/** Narrow one stored registry string onto its closed runtime union, fail-loud on corruption. */
function closedRegistryValue<T extends string>(value: string, members: readonly T[], what: string): T {
  const hit = members.find(entry => entry === value)
  if (hit === undefined) {
    throw new KbGraphError(`stored registry row has unknown ${what} "${value}"`, 'KB_GRAPH_SQLITE_REGISTRY_CORRUPT')
  }
  return hit
}

const ONTOLOGY_LAYERS = ['top', 'domain'] as const
const NODE_TYPE_STATUSES = ['draft', 'active', 'deprecated'] as const
const ONTOLOGY_SOURCES = ['builtin-ontology', 'builtin-food', 'foodon-imported', 'nocobase-derived', 'agent-defined'] as const
const RELATION_KINDS = ['object', 'hierarchical'] as const
const EPISODE_SOURCES = ['ingest', 'ai-edit', 'human-edit', 'rollback'] as const

/** Rebuild one {@link KgNodeType} from a kg_node_types row (durable-boundary parse). */
function rowToNodeType(row: NodeTypeRow): KgNodeType {
  let props: unknown
  try {
    props = JSON.parse(row.props_schema)
  } catch (error: unknown) {
    throw new KbGraphError(
      /* v8 ignore next -- JSON.parse throws SyntaxError only. */
      `stored node type "${row.type_id}" has an unreadable props schema: ${error instanceof Error ? error.message : String(error)}`,
      'KB_GRAPH_SQLITE_REGISTRY_CORRUPT',
    )
  }
  if (!Array.isArray(props)) {
    throw new KbGraphError(`stored node type "${row.type_id}" props schema is not an array`, 'KB_GRAPH_SQLITE_REGISTRY_CORRUPT')
  }
  const synonyms = (() => {
    if (row.synonyms_json === null) return undefined
    let parsed: unknown
    try {
      parsed = JSON.parse(row.synonyms_json)
    } catch (error: unknown) {
      throw new KbGraphError(
        /* v8 ignore next -- JSON.parse throws SyntaxError only. */
        `stored node type "${row.type_id}" has unreadable synonyms: ${error instanceof Error ? error.message : String(error)}`,
        'KB_GRAPH_SQLITE_REGISTRY_CORRUPT',
      )
    }
    if (!Array.isArray(parsed) || !parsed.every(entry => typeof entry === 'string')) {
      throw new KbGraphError(`stored node type "${row.type_id}" synonyms are not a string array`, 'KB_GRAPH_SQLITE_REGISTRY_CORRUPT')
    }
    return parsed as readonly string[]
  })()
  return {
    id: kgNodeTypeId(row.type_id),
    label: row.label,
    ...(row.description === null ? {} : { description: row.description }),
    layer: closedRegistryValue(row.layer, ONTOLOGY_LAYERS, 'layer'),
    ...(row.extends_type === null ? {} : { extends: kgNodeTypeId(row.extends_type) }),
    props: props as readonly KgPropDef[],
    ...(row.natural_key === null ? {} : { naturalKey: row.natural_key }),
    ...(row.foodon_uri === null ? {} : { foodonUri: row.foodon_uri }),
    ...(row.foodon_id === null ? {} : { foodonId: row.foodon_id }),
    ...(synonyms === undefined ? {} : { synonyms }),
    source: closedRegistryValue(row.source, ONTOLOGY_SOURCES, 'source'),
    status: closedRegistryValue(row.status, NODE_TYPE_STATUSES, 'status'),
  }
}

/** Rebuild one {@link KgRelation} from a kg_relations row (durable-boundary parse). */
function rowToRelation(row: RelationRow): KgRelation {
  let constraints: unknown
  try {
    constraints = JSON.parse(row.constraints_json)
  } catch (error: unknown) {
    throw new KbGraphError(
      /* v8 ignore next -- JSON.parse throws SyntaxError only. */
      `stored relation "${row.relation_id}" has unreadable constraints: ${error instanceof Error ? error.message : String(error)}`,
      'KB_GRAPH_SQLITE_REGISTRY_CORRUPT',
    )
  }
  if (!Array.isArray(constraints)) {
    throw new KbGraphError(`stored relation "${row.relation_id}" constraints are not an array`, 'KB_GRAPH_SQLITE_REGISTRY_CORRUPT')
  }
  return {
    id: kgRelationId(row.relation_id),
    label: row.label,
    ...(row.description === null ? {} : { description: row.description }),
    constraints: constraints.map(pair => pair as KgRelationConstraint),
    kind: closedRegistryValue(row.kind, RELATION_KINDS, 'kind'),
    ...(row.inverse_of === null ? {} : { inverseOf: kgRelationId(row.inverse_of) }),
    ...(row.foodon_prop_uri === null ? {} : { foodonPropUri: row.foodon_prop_uri }),
    source: closedRegistryValue(row.source, ONTOLOGY_SOURCES, 'source'),
  }
}

/** Rebuild one {@link KgEpisodeRow} from an episodes join row. */
function rowToEpisode(row: EpisodeSqlRow): KgEpisodeRow {
  return {
    uuid: row.uuid,
    tenantId: row.tenant_id,
    source: closedRegistryValue(row.source, EPISODE_SOURCES, 'episode source'),
    name: row.name,
    content: row.content,
    validAt: row.valid_at,
    createdAt: row.created_at,
    ...(row.metadata === null ? {} : { metadata: JSON.parse(row.metadata) as unknown }),
    mentionCount: row.mention_count,
  }
}

/** Constructor options for {@link SqliteGraphStore}. */
export interface SqliteGraphStoreOptions {
  /** Database path (`:memory:` supported) or cwd-relative path. */
  readonly path: string
  /** Maximum wait for another SQLite connection's lock. */
  readonly busyTimeoutMs: number
}

function throwIfAborted(signal: AbortSignal | undefined): void {
  // An aborted AbortSignal always carries a reason per the WHATWG standard.
  /* v8 ignore next 2 */
  if (signal?.aborted) throw signal.reason ?? new DOMException('The operation was aborted', 'AbortError')
}

/** Mint the compat node id for a v1 entity: `kb:<type>:<id>`, both parts escaped. */
function compatNodeId(entity: KbGraphEntity): string {
  return `kb:${encodeURIComponent(String(entity.type))}:${encodeURIComponent(entity.id)}`
}

/**
 * Rebuild a v1 stored triple from a projection row. The compat provenance
 * address is the sourcePath when one was given; the `graph:`-prefixed
 * derived anchor marks triples asserted without a citation.
 */
function rowToStoredTriple(row: TripleProjectionRow): KbGraphStoredTriple {
  const hasCitation = row.source_system === 'kb' && !row.source_id.startsWith('graph:')
  return {
    rowId: row.row_id,
    tenantId: row.tenant_id,
    subject: { type: kgNodeTypeId(row.subject_type), id: row.subject_id },
    predicate: kgRelationId(row.relation_id),
    object: { type: kgNodeTypeId(row.object_type), id: row.object_id },
    ...(hasCitation ? { sourcePath: row.source_id } : {}),
  }
}

/** Map one kg_source_runs row onto the seam shape. */
function rowToSourceRun(row: SourceRunRow): KgSourceRun {
  return {
    sourceSystem: row.source_system,
    scope: row.scope,
    ...(row.watermark === null ? {} : { watermark: row.watermark }),
    ...(row.content_hash === null ? {} : { contentHash: row.content_hash }),
    ...(row.run_config === null ? {} : { runConfig: row.run_config }),
    lastRunAt: row.last_run_at,
  }
}

/** Rebuild one v2 edge from a kg_edges row. */
function rowToEdge(row: EdgeRow): KgEdge {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    srcId: row.src_id,
    dstId: row.dst_id,
    relation: kgRelationId(row.relation_id),
    ...(row.fact === null ? {} : { fact: row.fact }),
    ...(row.props === null ? {} : { props: JSON.parse(row.props) as Record<string, unknown> }),
    confidence: row.confidence,
    provenance: {
      sourceSystem: row.source_system as KgProvenance['sourceSystem'],
      sourceId: row.source_id,
      extractedAt: row.extracted_at,
    },
    validFrom: row.valid_from,
    // Every read face filters live edges only, so valid_until is always NULL
    // here; the tombstone value stays queryable through SQL until a v2 read
    // face for historical edges exists.
    /* v8 ignore next 1 -- live-edge reads always leave valid_until NULL here. */
    ...(row.valid_until === null ? {} : { validUntil: row.valid_until }),
    /* v8 ignore next 1 -- the read face never projects expiry; SQL still can. */
    ...(row.expired_at === null ? {} : { expiredAt: row.expired_at }),
  }
}

/* jscpd:ignore-start */
// jscpd: intentional symmetry — the SQLite store open/validate/close lifecycle;
// the kb and session groups stay cross-dependency-free
// (Agent Note 2026-08-29-duplication-gate-intentional-symmetry).
/**
 * The `node:sqlite`-backed graph store (schema v2). Opens and validates the
 * database in the constructor (fail-loud on schema mismatch, including the
 * no-migration rejection of v1 `triples` databases); one instance owns one
 * connection until {@link SqliteGraphStore.close}.
 */
export class SqliteGraphStore implements KgStore {
  readonly id = 'kb-graph-sqlite'
  private readonly db: DatabaseSync
  private closed = false

  constructor(options: SqliteGraphStoreOptions, Database: DatabaseSyncConstructor) {
    this.db = new Database(options.path === ':memory:' ? ':memory:' : resolve(options.path), {
      timeout: options.busyTimeoutMs,
    })
    try {
      validateSchema(this.db, options.path)
    } catch (error: unknown) {
      this.db.close()
      throw error
    }
  }

  available(): boolean {
    return !this.closed
  }

  /** Close the owned connection; idempotent. */
  close(): void {
    if (this.closed) return
    this.closed = true
    this.db.close()
  }
  /* jscpd:ignore-end */

  /** Reject use of a closed store. */
  private assertLive(): void {
    if (this.closed) {
      throw new KbGraphError('the kb-graph-sqlite store connection is closed', 'KB_GRAPH_SQLITE_CLOSED')
    }
  }

  /** Run `fn` inside one immediate write transaction, rolling back on failure. */
  private write<T>(fn: () => T): T {
    this.db.exec(sql('begin-immediate'))
    try {
      const result = fn()
      this.db.exec(sql('commit'))
      return result
    } catch (error: unknown) {
      this.rollback()
      throw error
    }
  }

  /**
   * Ensure one registry row exists for the node type (the persistent half of
   * the two-layer registry: runtime registrations materialize on first
   * write). Existing rows win.
   */
  private ensureNodeTypeRow(type: KgNodeTypeId, at: string): void {
    const id = String(type)
    this.db.prepare(sql('insert-node-type')).run(
      id, id, null, 'domain', null, '[]', null, null, null, null, 'agent-defined', 'active', at, at,
    )
  }

  /**
   * Ensure one registry row exists for the relation; see
   * {@link ensureNodeTypeRow}.
   */
  private ensureRelationRow(relation: KgRelationId, at: string): void {
    const id = String(relation)
    this.db.prepare(sql('insert-relation')).run(
      id, id, null, null, null, '[]', 'object', null, null, 'agent-defined', at, at,
    )
  }

  /** Resolve the minted node id of a v1 entity under one tenant, if stored. */
  private compatNodeIdRow(tenantId: string, entity: KbGraphEntity): NodeIdRow | undefined {
    return this.db.prepare(sql('select-node-by-anchor')).get(tenantId, String(entity.type), entity.id) as unknown as NodeIdRow | undefined
  }

  /**
   * Merge one node onto its anchors (natural key first, then id); returns
   * whether an existing row took the update.
   */
  private mergeNodeRaw(node: KgNode): boolean {
    const byAnchor = node.naturalKey === undefined
      ? undefined
      : this.db.prepare(sql('select-node-by-anchor')).get(node.tenantId, String(node.type), node.naturalKey) as unknown as NodeIdRow | undefined
    const target = byAnchor?.id ?? (this.db.prepare(sql('select-node-by-id')).get(node.id) as unknown as NodeIdRow | undefined)?.id
    if (target !== undefined) {
      this.db.prepare(sql('update-node-by-id')).run(
        node.name,
        node.summary ?? null,
        node.props === undefined ? null : JSON.stringify(node.props),
        node.updatedAt,
        target,
      )
      return true
    }
    this.db.prepare(sql('insert-node')).run(
      node.id, node.tenantId, String(node.type), node.naturalKey ?? null,
      node.name, node.summary ?? null,
      node.props === undefined ? null : JSON.stringify(node.props),
      node.createdAt, node.updatedAt,
    )
    return false
  }

  /**
   * Merge one edge onto the seven-column anchor: fresh rows insert; known
   * anchors converge confidence, keep the newest fact, and revive
   * tombstones. Returns whether a row was newly inserted.
   */
  private mergeEdgeRaw(edge: KgEdge): boolean {
    const existing = this.db.prepare(sql('select-edge-by-anchor')).get(
      edge.tenantId, edge.srcId, edge.dstId, String(edge.relation),
      edge.provenance.sourceSystem, edge.provenance.sourceId,
    ) as unknown as NodeIdRow | undefined
    if (existing === undefined) {
      this.db.prepare(sql('insert-edge')).run(
        edge.id, edge.tenantId, edge.srcId, edge.dstId, String(edge.relation),
        edge.fact ?? null, edge.props === undefined ? null : JSON.stringify(edge.props),
        edge.confidence, edge.provenance.sourceSystem, edge.provenance.sourceId,
        edge.provenance.extractedAt, edge.validFrom, new Date().toISOString(),
      )
      return true
    }
    this.db.prepare(sql('merge-edge')).run(
      edge.confidence, edge.fact ?? null,
      edge.props === undefined ? null : JSON.stringify(edge.props),
      edge.provenance.extractedAt, new Date().toISOString(), existing.id,
    )
    return false
  }

  /** The v1 `putTriples` face: translate onto node/edge merges in one transaction. */
  async putTriples(tenantId: string, triples: readonly KbGraphTriple[], signal?: AbortSignal): Promise<number> {
    // node:sqlite is synchronous; the await keeps the store contract a promise.
    await Promise.resolve()
    this.assertLive()
    throwIfAborted(signal)
    const now = new Date().toISOString()
    return this.write(() => {
      let inserted = 0
      for (const triple of triples) {
        throwIfAborted(signal)
        const srcId = compatNodeId(triple.subject)
        const dstId = compatNodeId(triple.object)
        this.ensureNodeTypeRow(triple.subject.type, now)
        this.ensureNodeTypeRow(triple.object.type, now)
        this.mergeNodeRaw({
          id: srcId, tenantId, type: triple.subject.type,
          name: triple.subject.id, naturalKey: triple.subject.id,
          createdAt: now, updatedAt: now,
        })
        this.mergeNodeRaw({
          id: dstId, tenantId, type: triple.object.type,
          name: triple.object.id, naturalKey: triple.object.id,
          createdAt: now, updatedAt: now,
        })
        const sourceId = triple.sourcePath ?? `graph:${srcId}:${dstId}`
        inserted += this.mergeEdgeRaw({
          id: `kb:${sourceId}:${srcId}:${String(triple.predicate)}:${dstId}`,
          tenantId, srcId, dstId, relation: triple.predicate,
          confidence: 1.0,
          provenance: { sourceSystem: 'kb', sourceId, extractedAt: now },
          validFrom: now,
        }) ? 1 : 0
      }
      return inserted
    })
  }

  async neighbors(tenantId: string, entity: KbGraphEntity, _signal?: AbortSignal): Promise<KbGraphStoredTriple[]> {
    await Promise.resolve()
    this.assertLive()
    const rows = this.db.prepare(sql('select-neighbor-edges')).all(
      tenantId, String(entity.type), entity.id, String(entity.type), entity.id,
    ) as unknown as TripleProjectionRow[]
    return rows.map(rowToStoredTriple)
  }

  async twoHopPaths(tenantId: string, entity: KbGraphEntity, target: KbGraphEntity, _signal?: AbortSignal): Promise<KbGraphStoredTriple[]> {
    await Promise.resolve()
    this.assertLive()
    const src = this.compatNodeIdRow(tenantId, entity)
    const dst = this.compatNodeIdRow(tenantId, target)
    if (src === undefined || dst === undefined) return []
    const rowIds = new Set<number>()
    const endpoints = [src.id, dst.id]
    const branch = [...endpoints, ...endpoints]
    const pairs = this.db.prepare(sql('select-two-hop-pairs')).all(
      tenantId, ...branch, ...branch, ...branch, ...branch,
    ) as unknown as Array<{ first_id: number; second_id: number }>
    for (const path of pairs) {
      rowIds.add(path.first_id)
      rowIds.add(path.second_id)
    }
    // A direct edge is itself a path of at most two edges; include it in
    // either direction.
    const direct = this.db.prepare(sql('select-edges-between')).all(
      tenantId, src.id, dst.id, dst.id, src.id,
    ) as unknown as TripleProjectionRow[]
    for (const row of direct) {
      rowIds.add(row.row_id)
    }
    if (rowIds.size === 0) return []
    const fetch = this.db.prepare(sql('select-edges-by-rowids'))
    const seen = new Map<number, KbGraphStoredTriple>()
    for (const rowId of rowIds) {
      // The ids come from queries on this same synchronous connection, so
      // every fetch lands.
      seen.set(rowId, rowToStoredTriple(fetch.get(rowId) as unknown as TripleProjectionRow))
    }
    return [...seen.values()].sort((a, b) => a.rowId - b.rowId)
  }

  async searchEntities(
    tenantId: string,
    query: string,
    type: KgNodeTypeId | undefined,
    k: number,
    _signal?: AbortSignal,
  ): Promise<KbGraphEntity[]> {
    await Promise.resolve()
    this.assertLive()
    const needle = query.toLowerCase()
    const entities = new Map<string, KbGraphEntity>()
    for (const row of this.db.prepare(sql('select-nodes-for-search')).all(tenantId, type === undefined ? null : String(type), type === undefined ? null : String(type)) as unknown as Array<{ type_id: string; entity_key: string; name: string }>) {
      if (!row.entity_key.toLowerCase().includes(needle) && !row.name.toLowerCase().includes(needle)) continue
      entities.set(`${row.type_id}:${row.entity_key}`, { type: kgNodeTypeId(row.type_id), id: row.entity_key })
      if (entities.size >= k) return [...entities.values()]
    }
    // Aliases resolve to their binding node's entity key; the primary-key
    // pass above already deduplicated type/key pairs.
    for (const row of this.db.prepare(sql('select-aliases-for-search')).all(tenantId, type === undefined ? null : String(type), type === undefined ? null : String(type)) as unknown as Array<{ type_id: string; entity_key: string; alias: string }>) {
      if (!row.alias.toLowerCase().includes(needle)) continue
      entities.set(`${row.type_id}:${row.entity_key}`, { type: kgNodeTypeId(row.type_id), id: row.entity_key })
      if (entities.size >= k) break
    }
    return [...entities.values()]
  }

  async stats(tenantId: string | undefined, _signal?: AbortSignal): Promise<{ triples: number; entities: number }> {
    await Promise.resolve()
    this.assertLive()
    const triples = (this.db.prepare(sql('count-edges')).get(tenantId ?? null, tenantId ?? null) as { n: number }).n
    const entities = (this.db.prepare(sql('count-nodes')).get(tenantId ?? null, tenantId ?? null) as { n: number }).n
    return { triples, entities }
  }

  async upsertNode(node: KgNode): Promise<{ merged: boolean }> {
    await Promise.resolve()
    this.assertLive()
    return this.write(() => {
      this.ensureNodeTypeRow(node.type, new Date().toISOString())
      return { merged: this.mergeNodeRaw(node) }
    })
  }

  async upsertEdges(edges: readonly KgEdge[]): Promise<number> {
    await Promise.resolve()
    this.assertLive()
    return this.write(() => {
      let inserted = 0
      for (const edge of edges) {
        this.ensureRelationRow(edge.relation, new Date().toISOString())
        inserted += this.mergeEdgeRaw(edge) ? 1 : 0
      }
      return inserted
    })
  }

  async subgraph(tenantId: string, seedIds: readonly string[], hops: number, limits?: KgSubgraphLimits): Promise<KgSubgraph> {
    await Promise.resolve()
    this.assertLive()
    if (!Number.isInteger(hops) || hops < 0) {
      throw new KbGraphError(`subgraph hops must be a non-negative integer, got ${String(hops)}`, 'KB_GRAPH_SQLITE_INVALID_HOPS')
    }
    if (seedIds.length === 0) return { nodes: [], edges: [], truncated: false }
    const maxNodes = Math.min(Math.max(limits?.maxNodes ?? 200, 1), 2_000)
    const maxEdges = Math.min(Math.max(limits?.maxEdges ?? 1_000, 0), 10_000)
    const walkRows = this.db.prepare(sql('select-subgraph-nodes')).all(
      JSON.stringify([...seedIds]), tenantId, hops, tenantId, maxNodes + 1,
    ) as unknown as WalkRow[]
    const truncatedNodes = walkRows.length > maxNodes
    const nodes: KgSubgraphNode[] = walkRows.slice(0, maxNodes).map(row => ({
      id: row.id,
      type: kgNodeTypeId(row.type_id),
      name: row.name,
      ...(row.natural_key === null ? {} : { naturalKey: row.natural_key }),
      depth: row.depth,
    }))
    if (nodes.length === 0) return { nodes: [], edges: [], truncated: false }
    const nodeIds = JSON.stringify(nodes.map(node => node.id))
    const edgeRows = this.db.prepare(sql('select-edges-by-nodes')).all(
      tenantId, nodeIds, nodeIds, maxEdges + 1,
    ) as unknown as EdgeRow[]
    return {
      nodes,
      edges: edgeRows.slice(0, maxEdges).map(rowToEdge),
      truncated: truncatedNodes || edgeRows.length > maxEdges,
    }
  }

  async expand(tenantId: string, nodeId: string, limit?: number): Promise<KgSubgraph> {
    return await this.subgraph(tenantId, [nodeId], 1, { maxNodes: limit ?? 200 })
  }

  async tombstoneBySource(sourceSystem: string, sourceId: string, at: string): Promise<number> {
    await Promise.resolve()
    this.assertLive()
    return this.write(() => {
      const result = this.db.prepare(sql('tombstone-by-source')).run(
        at, sourceSystem, sourceId,
      ) as { changes: number | bigint }
      return Number(result.changes)
    })
  }

  async putAlias(tenantId: string, typeId: KgNodeTypeId, alias: string, nodeId: string): Promise<void> {
    await Promise.resolve()
    this.assertLive()
    this.write(() => {
      const existing = this.db.prepare(sql('select-alias')).get(tenantId, String(typeId), alias) as unknown as NodeIdRow | undefined
      if (existing !== undefined) {
        if (existing.id !== nodeId) {
          throw new KbGraphError(
            `alias "${alias}" already resolves to node "${existing.id}" under ${String(typeId)}`,
            'KB_GRAPH_ALIAS_CONFLICT',
          )
        }
        return
      }
      this.db.prepare(sql('insert-alias')).run(tenantId, String(typeId), alias, nodeId)
    })
  }

  async putSourceRun(run: KgSourceRun): Promise<void> {
    await Promise.resolve()
    this.assertLive()
    this.write(() => {
      this.db.prepare(sql('upsert-source-run')).run(
        run.sourceSystem, run.scope, run.watermark ?? null, run.contentHash ?? null, run.runConfig ?? null, run.lastRunAt,
      )
    })
  }

  async getSourceRun(sourceSystem: string, scope: string): Promise<KgSourceRun | undefined> {
    await Promise.resolve()
    this.assertLive()
    const row = this.db.prepare(sql('select-source-run')).get(sourceSystem, scope) as unknown as SourceRunRow | undefined
    if (row === undefined) return undefined
    return rowToSourceRun(row)
  }

  async listSourceRuns(sourceSystem: string): Promise<readonly KgSourceRun[]> {
    await Promise.resolve()
    this.assertLive()
    const rows = this.db.prepare(sql('list-source-runs')).all(sourceSystem) as unknown as SourceRunRow[]
    return rows.map(rowToSourceRun)
  }

  async deleteSourceRun(sourceSystem: string, scope: string): Promise<void> {
    await Promise.resolve()
    this.assertLive()
    this.write(() => {
      this.db.prepare(sql('delete-source-run')).run(sourceSystem, scope)
    })
  }

  async upsertNodeType(type: KgNodeType): Promise<void> {
    await Promise.resolve()
    this.assertLive()
    this.write(() => {
      const now = new Date().toISOString()
      this.db.prepare(sql('upsert-node-type')).run(
        String(type.id), type.label, type.description ?? null, type.layer,
        type.extends === undefined ? null : String(type.extends),
        JSON.stringify(type.props), type.naturalKey ?? null,
        type.foodonUri ?? null, type.foodonId ?? null,
        type.synonyms === undefined || type.synonyms.length === 0 ? null : JSON.stringify(type.synonyms),
        type.source, type.status, now, now,
      )
    })
  }

  async upsertRelation(relation: KgRelation): Promise<void> {
    await Promise.resolve()
    this.assertLive()
    this.write(() => {
      const now = new Date().toISOString()
      const [primary] = relation.constraints
      this.db.prepare(sql('upsert-relation')).run(
        String(relation.id), relation.label, relation.description ?? null,
        primary === undefined ? null : String(primary.domain),
        primary === undefined ? null : String(primary.range),
        JSON.stringify(relation.constraints.map(constraint => ({
          domain: String(constraint.domain),
          range: String(constraint.range),
          ...(constraint.cardinality === undefined ? {} : { cardinality: constraint.cardinality }),
        }))),
        relation.kind,
        relation.inverseOf === undefined ? null : String(relation.inverseOf),
        relation.foodonPropUri ?? null,
        relation.source, now, now,
      )
    })
  }

  async listStoredNodeTypes(): Promise<readonly KgNodeType[]> {
    await Promise.resolve()
    this.assertLive()
    return (this.db.prepare(sql('select-node-types')).all() as unknown as NodeTypeRow[]).map(rowToNodeType)
  }

  async listStoredRelations(): Promise<readonly KgRelation[]> {
    await Promise.resolve()
    this.assertLive()
    return (this.db.prepare(sql('select-relations')).all() as unknown as RelationRow[]).map(rowToRelation)
  }

  async recordOntologyRevision(revision: KgOntologyRevisionInput): Promise<number> {
    await Promise.resolve()
    this.assertLive()
    return this.write(() => {
      const result = this.db.prepare(sql('insert-ontology-revision')).run(
        revision.ontologyVersion, revision.summary, JSON.stringify(revision.changes), revision.createdAt,
      )
      return Number(result.lastInsertRowid)
    })
  }

  async recordBuildRun(run: KgBuildRunInput): Promise<number> {
    await Promise.resolve()
    this.assertLive()
    return this.write(() => {
      const result = this.db.prepare(sql('insert-build-run')).run(
        run.tenantId, run.startedAt, run.finishedAt,
        JSON.stringify(run.report), JSON.stringify(run.metrics), run.createdAt,
      )
      return Number(result.lastInsertRowid)
    })
  }

  async latestBuildRun(tenantId: string): Promise<KgBuildRunRow | undefined> {
    await Promise.resolve()
    this.assertLive()
    const row = this.db.prepare(sql('select-latest-build-run')).get(tenantId) as unknown as BuildRunSqlRow | undefined
    if (row === undefined) return undefined
    return {
      id: row.id,
      tenantId: row.tenant_id,
      startedAt: row.started_at,
      finishedAt: row.finished_at,
      report: JSON.parse(row.report_json) as unknown,
      metrics: JSON.parse(row.metrics_json) as unknown,
    }
  }

  async islandNodes(tenantId: string): Promise<number> {
    await Promise.resolve()
    this.assertLive()
    return (this.db.prepare(sql('count-island-nodes')).get(tenantId) as { islands: number }).islands
  }

  async conflictingFacts(tenantId: string): Promise<number> {
    await Promise.resolve()
    this.assertLive()
    return (this.db.prepare(sql('count-conflicting-facts')).get(tenantId) as { conflicts: number }).conflicts
  }

  async nodeCountByType(tenantId: string, typeId: KgNodeTypeId): Promise<number> {
    await Promise.resolve()
    this.assertLive()
    return (this.db.prepare(sql('count-nodes-by-type')).get(tenantId, String(typeId)) as { n: number }).n
  }

  async ontologyRevisions(limit: number): Promise<readonly KgOntologyRevision[]> {
    await Promise.resolve()
    this.assertLive()
    const rows = this.db.prepare(sql('select-ontology-revisions')).all(limit) as unknown as readonly RevisionRow[]
    return rows.map(row => ({
      id: row.id,
      ontologyVersion: row.ontology_version,
      summary: row.summary,
      changes: JSON.parse(row.changes_json) as unknown,
      createdAt: row.created_at,
    }))
  }

  async searchNodes(tenantId: string, query: string, type: KgNodeTypeId | undefined, k: number): Promise<readonly KgNodeHit[]> {
    await Promise.resolve()
    this.assertLive()
    const needle = query.toLowerCase()
    const hits: KgNodeHit[] = []
    for (const row of this.db.prepare(sql('select-nodes-by-type')).all(
      tenantId, type === undefined ? null : String(type), type === undefined ? null : String(type),
    ) as unknown as Array<{ id: string; type_id: string; name: string; natural_key: string | null }>) {
      const hay = `${row.name}\n${row.natural_key ?? ''}\n${row.id}`.toLowerCase()
      if (!hay.includes(needle)) continue
      hits.push({
        id: row.id,
        type: kgNodeTypeId(row.type_id),
        name: row.name,
        ...(row.natural_key === null ? {} : { naturalKey: row.natural_key }),
      })
      if (hits.length >= k) break
    }
    // Alias pass (the v1 search's own second round): a query matching a bound
    // alias resolves to its binding node, deduplicated against the name pass.
    if (hits.length < k) {
      const seen = new Set(hits.map(hit => hit.id))
      for (const row of this.db.prepare(sql('select-aliases-for-search')).all(
        tenantId, type === undefined ? null : String(type), type === undefined ? null : String(type),
      ) as unknown as Array<{ alias: string; node_id: string; node_name: string; node_type: string }>) {
        if (!row.alias.toLowerCase().includes(needle)) continue
        if (seen.has(row.node_id)) continue
        seen.add(row.node_id)
        hits.push({ id: row.node_id, type: kgNodeTypeId(row.node_type), name: row.node_name })
        if (hits.length >= k) break
      }
    }
    return hits
  }

  async listNodes(tenantId: string, k: number): Promise<readonly KgNode[]> {
    await Promise.resolve()
    this.assertLive()
    const rows = this.db.prepare(sql('select-nodes')).all(tenantId, k) as unknown as readonly NodeListRow[]
    return rows.map(row => ({
      id: row.id,
      tenantId: row.tenant_id,
      type: kgNodeTypeId(row.type_id),
      ...(row.natural_key === null ? {} : { naturalKey: row.natural_key }),
      name: row.name,
      ...(row.summary === null ? {} : { summary: row.summary }),
      ...(row.props === null ? {} : { props: JSON.parse(row.props) as Record<string, unknown> }),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }))
  }

  async putEpisode(episode: KgEpisodeInput): Promise<void> {
    await Promise.resolve()
    this.assertLive()
    this.write(() => {
      this.db.prepare(sql('insert-episode')).run(
        episode.uuid, episode.tenantId, episode.source, episode.name, episode.content,
        episode.validAt, episode.createdAt,
        episode.metadata === undefined ? null : JSON.stringify(episode.metadata),
      )
    })
  }

  async linkMentions(episodeUuid: string, edgeIds: readonly string[]): Promise<number> {
    await Promise.resolve()
    this.assertLive()
    return this.write(() => {
      let inserted = 0
      const statement = this.db.prepare(sql('link-mentions'))
      for (const edgeId of edgeIds) {
        const result = statement.run(episodeUuid, edgeId, new Date().toISOString()) as { changes: number | bigint }
        inserted += Number(result.changes)
      }
      return inserted
    })
  }

  async listEpisodes(tenantId: string, limit: number): Promise<readonly KgEpisodeRow[]> {
    await Promise.resolve()
    this.assertLive()
    return (this.db.prepare(sql('select-episodes')).all(tenantId, limit) as unknown as readonly EpisodeSqlRow[]).map(rowToEpisode)
  }

  async edgeMentions(edgeId: string): Promise<readonly KgEdgeMention[]> {
    await Promise.resolve()
    this.assertLive()
    const rows = this.db.prepare(sql('select-edge-mentions')).all(edgeId) as unknown as readonly EdgeMentionSqlRow[]
    return rows.map((row) => {
      return {
        episodeUuid: row.episode_uuid,
        edgeId: row.edge_id,
        createdAt: row.created_at,
        episode: {
          uuid: row.episode_uuid,
          tenantId: row.episode_tenant,
          source: closedRegistryValue(row.episode_source, EPISODE_SOURCES, 'episode source'),
          name: row.episode_name,
          content: row.episode_content,
          validAt: row.episode_valid_at,
          createdAt: row.episode_created_at,
          ...(row.episode_metadata === null ? {} : { metadata: JSON.parse(row.episode_metadata) as unknown }),
        },
      }
    })
  }

  async edgeIdsOfEpisode(episodeUuid: string): Promise<readonly string[]> {
    await Promise.resolve()
    this.assertLive()
    return (this.db.prepare(sql('select-episode-edges')).all(episodeUuid) as unknown as Array<{ edge_id: string }>).map(row => row.edge_id)
  }

  async expireEdges(edgeIds: readonly string[], at: string): Promise<number> {
    await Promise.resolve()
    this.assertLive()
    return this.write(() => {
      let changed = 0
      const statement = this.db.prepare(sql('expire-edges'))
      for (const edgeId of edgeIds) {
        const result = statement.run(at, edgeId) as { changes: number | bigint }
        changed += Number(result.changes)
      }
      return changed
    })
  }

  async restoreEdges(edgeIds: readonly string[], at: string): Promise<number> {
    // The `at` timestamp rides the call for the audit contract; the row
    // records the restore through the rollback episode's mention join.
    void at
    await Promise.resolve()
    this.assertLive()
    return this.write(() => {
      let changed = 0
      const statement = this.db.prepare(sql('restore-edges'))
      for (const edgeId of edgeIds) {
        const result = statement.run(edgeId) as { changes: number | bigint }
        changed += Number(result.changes)
      }
      return changed
    })
  }

  async edgesByIds(edgeIds: readonly string[]): Promise<readonly KgEdge[]> {
    await Promise.resolve()
    this.assertLive()
    if (edgeIds.length === 0) return []
    const rows = this.db.prepare(sql('select-edges-by-ids')).all(JSON.stringify([...edgeIds])) as unknown as readonly EdgeRow[]
    return rows.map(rowToEdge)
  }

  async liveEdgesBetween(tenantId: string, srcId: string, dstId: string, relation?: KgRelationId): Promise<readonly KgEdge[]> {
    await Promise.resolve()
    this.assertLive()
    const relationText = relation === undefined ? null : String(relation)
    const rows = this.db.prepare(sql('select-live-edges-between')).all(
      tenantId, srcId, dstId, dstId, srcId, relationText, relationText,
    ) as unknown as readonly EdgeRow[]
    return rows.map(rowToEdge)
  }

  async liveAdjacency(
    tenantId: string,
    cap: number,
  ): Promise<{ nodeIds: readonly string[]; pairs: readonly (readonly [string, string])[] }> {
    await Promise.resolve()
    this.assertLive()
    const nodeIds = (this.db.prepare(sql('select-node-ids')).all(tenantId) as unknown as Array<{ id: string }>).map(row => row.id)
    const pairs = (this.db.prepare(sql('select-live-adjacency')).all(tenantId, cap) as unknown as Array<{ src_id: string; dst_id: string }>)
      .map(row => [row.src_id, row.dst_id] as const)
    return { nodeIds, pairs }
  }

  async snapshotAt(tenantId: string, asOf: string, limits?: KgSubgraphLimits): Promise<KgSubgraph> {
    await Promise.resolve()
    this.assertLive()
    const maxNodes = Math.min(Math.max(limits?.maxNodes ?? 200, 1), 2_000)
    const maxEdges = Math.min(Math.max(limits?.maxEdges ?? 1_000, 0), 10_000)
    const nodeRows = this.db.prepare(sql('select-snapshot-nodes')).all(
      tenantId, asOf, maxNodes + 1,
    ) as unknown as WalkRow[]
    const truncatedNodes = nodeRows.length > maxNodes
    const nodes: KgSubgraphNode[] = nodeRows.slice(0, maxNodes).map(row => ({
      id: row.id,
      type: kgNodeTypeId(row.type_id),
      name: row.name,
      ...(row.natural_key === null ? {} : { naturalKey: row.natural_key }),
      depth: 0,
    }))
    if (nodes.length === 0) return { nodes: [], edges: [], truncated: false }
    const nodeIds = JSON.stringify(nodes.map(node => node.id))
    const edgeRows = this.db.prepare(sql('select-snapshot-edges')).all(
      tenantId, asOf, asOf, asOf, nodeIds, nodeIds, maxEdges + 1,
    ) as unknown as EdgeRow[]
    return {
      nodes,
      edges: edgeRows.slice(0, maxEdges).map(rowToEdge),
      truncated: truncatedNodes || edgeRows.length > maxEdges,
    }
  }

  async putOntologyXrefs(entries: readonly KgOntologyXref[]): Promise<number> {
    await Promise.resolve()
    this.assertLive()
    return this.write(() => {
      let inserted = 0
      const statement = this.db.prepare(sql('insert-xref'))
      for (const entry of entries) {
        const result = statement.run(
          entry.subjectId, entry.predicateId, entry.objectId, entry.mappingJustification ?? null,
        ) as { changes: number | bigint }
        inserted += Number(result.changes)
      }
      return inserted
    })
  }

  async putCorefRejects(
    entries: readonly { pairKey: string; docId: string; rowId: string; reason: string; decidedAt: string }[],
  ): Promise<number> {
    await Promise.resolve()
    this.assertLive()
    return this.write(() => {
      let inserted = 0
      const statement = this.db.prepare(sql('insert-align-reject'))
      for (const entry of entries) {
        const result = statement.run(entry.pairKey, entry.docId, entry.rowId, entry.reason, entry.decidedAt) as { changes: number | bigint }
        inserted += Number(result.changes)
      }
      return inserted
    })
  }

  async listCorefRejects(): Promise<ReadonlySet<string>> {
    await Promise.resolve()
    this.assertLive()
    return new Set((this.db.prepare(sql('select-align-rejects')).all() as unknown as Array<{ pair_key: string }>).map(row => row.pair_key))
  }

  async listOntologyXrefs(limit: number): Promise<readonly KgOntologyXref[]> {
    await Promise.resolve()
    this.assertLive()
    return (this.db.prepare(sql('select-xrefs')).all(limit) as unknown as Array<{
      subject_id: string
      predicate_id: string
      object_id: string
      mapping_justification: string | null
    }>).map(row => ({
      subjectId: row.subject_id,
      predicateId: row.predicate_id,
      objectId: row.object_id,
      ...(row.mapping_justification === null ? {} : { mappingJustification: row.mapping_justification }),
    }))
  }

  /** Roll back the open transaction, retaining the original failure. */
  private rollback(): void {
    try {
      this.db.exec(sql('rollback'))
    } catch {
      // The original statement failure remains actionable.
    }
  }
}
