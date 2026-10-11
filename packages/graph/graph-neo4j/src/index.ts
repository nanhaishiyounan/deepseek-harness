/**
 * Service Definition and neo4j-driver provider for the graph store capability
 * (`ctx.neo4jGraph`): bolt connection lifecycle (password through the
 * credentials env chain), guarded read-only Cypher for model-facing queries,
 * the graph-page reads (global/local/search/node detail), whole-graph island
 * stats, the append-only ontology version chain, and the batched write face
 * the business ETL uses. Consumers are the tool suite (`tool-graph`), the
 * apiproxy kg domain, and the kb-agent ETL/induction scripts.
 * @module @deepseek-ai/dsh-graph-neo4j
 */

import type { Context } from '@deepseek-ai/cordis'
import { Service } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import neo4j from 'neo4j-driver'
import { countIslands } from './etl.ts'
import { assertReadOnlyCypher } from './cypher-guard.ts'
import { GraphNeo4jError } from './types.ts'
import type {
  GraphEdgeView, GraphNodeDetail, GraphNodeHit, GraphNodeRelation,
  GraphNodeView, GraphPropValue, GraphStatsView, OntologyJsonLdDocument, OntologyVersionMeta,
} from './types.ts'

export { assertReadOnlyCypher, CypherGuardError, readOnlyCypherVerdict } from './cypher-guard.ts'
export type { CypherGuardCode, CypherGuardVerdict } from './cypher-guard.ts'
export {
  BUSINESS_MANIFEST, countIslands, edgeUpsertCypher, nodeUpsertCypher, planGraph,
  projectScalar, reconcileGraph,
} from './etl.ts'
export type {
  GraphEdgeTableMapping, GraphEdgeMapping, GraphMappingManifest, GraphTableMapping,
  PlannedEdge, PlannedGraph, PlannedNode, PlannedPropValue, ReconciliationReport,
  ReconciliationRow, SourceRow,
} from './etl.ts'
export { GraphNeo4jError } from './types.ts'
export type {
  GraphEdgeView, GraphNeo4jErrorCode, GraphNodeDetail, GraphNodeHit, GraphNodeRelation,
  GraphNodeView, GraphPropValue, GraphStatsView, JsonLdGraphNode, OntologyJsonLdDocument,
  OntologyVersionMeta,
} from './types.ts'

declare module '@deepseek-ai/cordis' {
  interface Context {
    neo4jGraph: Neo4jGraphService
  }
}

/** Default bolt endpoint (the docker port is deployment config). */
const DEFAULT_URL = 'bolt://localhost:7687'

/** Default user. */
const DEFAULT_USER = 'neo4j'

/** Default password env var (the credentials env chain's key). */
const DEFAULT_PASSWORD_ENV = 'DSH_NEO4J_PASSWORD'

/** Default database. */
const DEFAULT_DATABASE = 'neo4j'

/** Default row cap for one read-only query. */
const DEFAULT_MAX_ROWS = 500

/** Default node cap for the global graph page. */
const DEFAULT_GLOBAL_CAP = 1200

/** Plugin configuration. */
export interface Config {
  /** Bolt endpoint; defaults to `bolt://localhost:7687`. */
  readonly url?: string
  /** Auth user; defaults to `neo4j`. */
  readonly user?: string
  /** Env var the password is read from; defaults to `DSH_NEO4J_PASSWORD`. */
  readonly passwordEnv?: string
  /** Database name; defaults to `neo4j`. */
  readonly database?: string
  /** Read-only query row cap; defaults to 500. */
  readonly maxRows?: number
  /** Global graph page node cap; defaults to 1200. */
  readonly globalCap?: number
}

export const Config: z<Config> = z.object({
  url: z.string().default(DEFAULT_URL),
  user: z.string().default(DEFAULT_USER),
  passwordEnv: z.string().default(DEFAULT_PASSWORD_ENV),
  database: z.string().default(DEFAULT_DATABASE),
  maxRows: z.number().step(1).min(1).default(DEFAULT_MAX_ROWS),
  globalCap: z.number().step(1).min(1).default(DEFAULT_GLOBAL_CAP),
})

/** Connection options the service carries. */
export interface Neo4jGraphOptions {
  readonly url: string
  readonly user: string
  readonly password: string | undefined
  readonly database: string
  readonly maxRows: number
  readonly globalCap: number
}

/**
 * Normalize one driver value for JSON-shaped consumers: Neo4j integers
 * become numbers inside the safe range and strings beyond it; temporal and
 * spatial values fall back to their string form.
 * @param value - the driver-returned value.
 * @returns the JSON-safe value.
 */
function normalizeDriverValue(value: unknown): unknown {
  if (neo4j.isInt(value)) {
    const asNumber = value.toNumber()
    return Number.isSafeInteger(asNumber) ? asNumber : value.toString()
  }
  if (typeof value === 'bigint') return Number.isSafeInteger(value) ? Number(value) : value.toString()
  if (Array.isArray(value)) return value.map(normalizeDriverValue)
  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
      out[key] = normalizeDriverValue(entry)
    }
    return out
  }
  return value
}

/** Project a node property bag onto the scalar wire set. */
function projectProps(raw: Record<string, unknown>): Record<string, GraphPropValue> {
  const props: Record<string, GraphPropValue> = {}
  for (const [key, value] of Object.entries(normalizeDriverValue(raw) as Record<string, unknown>)) {
    if (key === 'gid' || key === 'name' || key === 'nodeType') continue
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      props[key] = value
    }
  }
  return props
}

/**
 * The Neo4j graph store service. One instance per context; the driver opens
 * lazily-resilient at `open()` and every method fails loud with
 * `NEO4J_DRIVER_UNAVAILABLE` while a missing password or unreachable server
 * keeps the service degraded (one operator warning at composition).
 */
export class Neo4jGraphService extends Service {
  private readonly options: Neo4jGraphOptions
  private driver: ReturnType<typeof neo4j.driver> | undefined
  private openFailureText: string | undefined

  constructor(ctx: Context, options: Neo4jGraphOptions) {
    super(ctx, 'neo4jGraph')
    this.options = options
  }

  /** True when the driver is live.
   * @returns driver liveness.
   */
  available(): boolean {
    return this.driver !== undefined
  }

  /** The read-only query row cap (the truncation marker's threshold).
   * @returns the configured row cap.
   */
  rowCap(): number {
    return this.options.maxRows
  }

  /** The recorded open failure (the degraded-mode operator warning's text).
   * @returns the failure text, or undefined after a healthy open.
   */
  openFailure(): string | undefined {
    return this.openFailureText
  }

  /**
   * Open the driver and verify connectivity. A missing password or an
   * unreachable server records the failure instead of throwing: the
   * composition stays up and every method fails loud on use.
   */
  async open(): Promise<void> {
    if (this.options.password === undefined) {
      this.openFailureText = 'neo4j-graph: the password env is not set; the graph store is unavailable'
      return
    }
    try {
      const driver = neo4j.driver(this.options.url, neo4j.auth.basic(this.options.user, this.options.password))
      await driver.verifyConnectivity()
      this.driver = driver
    } catch (error) {
      this.openFailureText = `neo4j-graph: cannot reach ${this.options.url}: ${error instanceof Error ? error.message : String(error)}`
    }
  }

  /** Close the driver (idempotent). */
  close(): void {
    const driver = this.driver
    this.driver = undefined
    if (driver !== undefined) void driver.close()
  }

  /** The live driver or the structured unavailable error. */
  private requireDriver(): ReturnType<typeof neo4j.driver> {
    if (this.driver === undefined) {
      throw new GraphNeo4jError(
        this.openFailureText ?? 'the Neo4j driver is not open',
        'NEO4J_DRIVER_UNAVAILABLE',
      )
    }
    return this.driver
  }

  /**
   * Run one guarded read-only Cypher statement and collect rows.
   * @param cypher - the statement text (guard-refused statements throw).
   * @param params - the statement parameters.
   * @returns the collected rows (capped at the configured max).
   * @throws {@link GraphNeo4jError} `NEO4J_DRIVER_UNAVAILABLE` when degraded,
   * `NEO4J_QUERY_FAILED` on driver errors.
   */
  async runReadOnly(cypher: string, params?: Readonly<Record<string, unknown>>): Promise<readonly Record<string, unknown>[]> {
    assertReadOnlyCypher(cypher)
    const session = this.requireDriver().session({ database: this.options.database })
    try {
      const result = await session.run(cypher, { ...params })
      return result.records.slice(0, this.options.maxRows).map((record) => {
        const out: Record<string, unknown> = {}
        for (const [key, value] of Object.entries(record.toObject())) {
          out[key] = normalizeDriverValue(value)
        }
        return out
      })
    } catch (error) {
      if (error instanceof GraphNeo4jError) throw error
      throw new GraphNeo4jError(
        `the read-only Cypher failed: ${error instanceof Error ? error.message : String(error)}`,
        'NEO4J_QUERY_FAILED',
      )
    } finally {
      await session.close()
    }
  }

  /**
   * Run one write statement (the ETL and ontology-store face; never
   * model-facing).
   * @param cypher - the write statement.
   * @param params - the statement parameters.
   * @returns the affected counters.
   * @throws {@link GraphNeo4jError} on the same two codes as reads.
   */
  async runWrite(cypher: string, params: Readonly<Record<string, unknown>>): Promise<{ readonly applied: number }> {
    const session = this.requireDriver().session({ database: this.options.database })
    try {
      const result = await session.executeWrite(tx => tx.run(cypher, { ...params }))
      return { applied: result.summary.counters.updates().propertiesSet }
    } catch (error) {
      throw new GraphNeo4jError(
        `the write Cypher failed: ${error instanceof Error ? error.message : String(error)}`,
        'NEO4J_QUERY_FAILED',
      )
    } finally {
      await session.close()
    }
  }

  /** Health probe: connectivity plus a one-row round trip.
   * @returns the probe outcome.
   */
  async health(): Promise<{ readonly ok: boolean; readonly server?: string }> {
    const driver = this.driver
    if (driver === undefined) return { ok: false }
    try {
      const session = driver.session({ database: this.options.database })
      try {
        const result = await session.run('RETURN 1 AS ok')
        return result.records.length === 1 ? { ok: true } : { ok: false }
      } finally {
        await session.close()
      }
    } catch {
      return { ok: false }
    }
  }

  /**
   * Read the global graph (capped at the configured node cap).
   * @param limit - an explicit cap override.
   * @returns nodes and edges with computed degrees.
   */
  async graphGlobal(
    limit?: number,
  ): Promise<{ readonly nodes: readonly GraphNodeView[]; readonly edges: readonly GraphEdgeView[]; readonly truncated: boolean }> {
    const cap = Math.min(limit ?? this.options.globalCap, this.options.globalCap * 4)
    const nodeRows = await this.runReadOnly(
      'MATCH (n:__Entity) RETURN n.gid AS gid, n.nodeType AS nodeType, n.name AS name, properties(n) AS props,'
        + ' COUNT { (n)--() } AS degree ORDER BY degree DESC, gid LIMIT $cap',
      { cap: neo4j.int(cap) },
    )
    const gids = new Set(nodeRows.map(row => String(row['gid'])))
    const edgeRows = await this.runReadOnly(
      'MATCH (a:__Entity)-[r]->(b:__Entity) WHERE a.gid IN $gids AND b.gid IN $gids'
        + ' RETURN elementId(r) AS eid, type(r) AS relation, a.gid AS source, b.gid AS target LIMIT $cap',
      { gids: [...gids], cap: neo4j.int(cap * 4) },
    )
    const totalRows = await this.runReadOnly('MATCH (n:__Entity) RETURN count(n) AS total')
    const total = Number(totalRows[0]?.['total'] ?? 0)
    return {
      nodes: nodeRows.map(row => this.nodeViewOf(row)),
      edges: edgeRows.map(row => ({
        id: String(row['eid']),
        relation: String(row['relation']),
        source: String(row['source']),
        target: String(row['target']),
      })),
      truncated: total > cap,
    }
  }

  /**
   * Read one node's k-hop neighborhood (the Local Graph query).
   * @param gid - the seed node's gid.
   * @param hops - the walk depth (1..3, clamped).
   * @param limit - the node cap.
   * @returns the neighborhood's nodes, edges, and truncation flag.
   */
  async graphLocal(
    gid: string,
    hops: number,
    limit?: number,
  ): Promise<{ readonly nodes: readonly GraphNodeView[]; readonly edges: readonly GraphEdgeView[]; readonly truncated: boolean }> {
    const depth = Math.max(1, Math.min(3, Math.trunc(hops)))
    const cap = Math.min(limit ?? this.options.maxRows, this.options.globalCap)
    const nodeRows = await this.runReadOnly(
      `MATCH (seed:__Entity {gid: $gid}) MATCH (seed)-[*1..${String(depth)}]-(n:__Entity) RETURN DISTINCT n.gid AS gid, n.nodeType AS nodeType, n.name AS name, properties(n) AS props, COUNT { (n)--() } AS degree LIMIT $cap`,
      { gid, cap: neo4j.int(cap) },
    )
    const seedRow = await this.runReadOnly(
      'MATCH (seed:__Entity {gid: $gid}) RETURN seed.gid AS gid, seed.nodeType AS nodeType, seed.name AS name, properties(seed) AS props, COUNT { (seed)--() } AS degree',
      { gid },
    )
    const nodes = [...nodeRows, ...seedRow].reduce<GraphNodeView[]>((acc, row) => {
      const view = this.nodeViewOf(row)
      if (!acc.some(entry => entry.id === view.id)) acc.push(view)
      return acc
    }, [])
    const gids = nodes.map(node => node.id)
    const edgeRows = await this.runReadOnly(
      'MATCH (a:__Entity)-[r]->(b:__Entity) WHERE a.gid IN $gids AND b.gid IN $gids'
        + ' RETURN elementId(r) AS eid, type(r) AS relation, a.gid AS source, b.gid AS target LIMIT $cap',
      { gids, cap: neo4j.int(cap * 4) },
    )
    return {
      nodes,
      edges: edgeRows.map(row => ({
        id: String(row['eid']),
        relation: String(row['relation']),
        source: String(row['source']),
        target: String(row['target']),
      })),
      truncated: nodeRows.length >= cap,
    }
  }

  /**
   * Search nodes by name/gid substring (the graph page's locate box).
   * @param query - the substring.
   * @param k - the result cap.
   * @returns the name/gid substring hits.
   */
  async graphSearch(query: string, k = 10): Promise<readonly GraphNodeHit[]> {
    const rows = await this.runReadOnly(
      'MATCH (n:__Entity) WHERE n.name CONTAINS $q OR n.gid CONTAINS $q RETURN n.gid AS gid, n.nodeType AS nodeType, n.name AS name, COUNT { (n)--() } AS degree ORDER BY degree DESC, gid LIMIT $k',
      { q: query, k: neo4j.int(k) },
    )
    return rows.map(row => ({
      id: String(row['gid']),
      type: String(row['nodeType'] ?? ''),
      name: String(row['name'] ?? ''),
      degree: Number(row['degree'] ?? 0),
    }))
  }

  /**
   * Read one node's detail: properties plus both incident-relation lists
   * (the relations/backlink panel's data).
   * @param gid - the node's gid.
   * @returns the node with both relation lists, or undefined when absent.
   */
  async nodeDetail(gid: string): Promise<GraphNodeDetail | undefined> {
    const nodeRows = await this.runReadOnly(
      'MATCH (n:__Entity {gid: $gid}) RETURN n.gid AS gid, n.nodeType AS nodeType, n.name AS name, properties(n) AS props, COUNT { (n)--() } AS degree',
      { gid },
    )
    if (nodeRows.length === 0) return undefined
    const outRows = await this.runReadOnly(
      'MATCH (n:__Entity {gid: $gid})-[r]->(m:__Entity) RETURN type(r) AS relation, m.gid AS otherId, m.name AS otherName, m.nodeType AS otherType LIMIT $cap',
      { gid, cap: neo4j.int(100) },
    )
    const inRows = await this.runReadOnly(
      'MATCH (m:__Entity)-[r]->(n:__Entity {gid: $gid}) RETURN type(r) AS relation, m.gid AS otherId, m.name AS otherName, m.nodeType AS otherType LIMIT $cap',
      { gid, cap: neo4j.int(100) },
    )
    const relationOf = (row: Record<string, unknown>, direction: 'out' | 'in'): GraphNodeRelation => ({
      relation: String(row['relation']),
      direction,
      otherId: String(row['otherId']),
      otherName: String(row['otherName'] ?? ''),
      otherType: String(row['otherType'] ?? ''),
    })
    const nodeRow = nodeRows[0]
    if (nodeRow === undefined) return undefined
    return {
      node: this.nodeViewOf(nodeRow),
      outRelations: outRows.map(row => relationOf(row, 'out')),
      inRelations: inRows.map(row => relationOf(row, 'in')),
    }
  }

  /**
   * Whole-graph stats with the island metric (union-find in TS over the
   * live edge list — the GDS-free connected-component count).
   * @returns the whole-graph counters.
   */
  async graphStats(): Promise<GraphStatsView> {
    const session = this.requireDriver().session({ database: this.options.database })
    try {
      // The island metric needs the whole edge list; this read deliberately
      // bypasses the model-facing row cap (hard-bounded at 200k rows).
      const nodes = await session.run('MATCH (n:__Entity) RETURN n.gid AS gid LIMIT 200000')
      const edges = await session.run('MATCH (a:__Entity)-[r]->(b:__Entity) RETURN a.gid AS source, b.gid AS target LIMIT 400000')
      return countIslands(
        nodes.records.map(record => String(record.get('gid'))),
        edges.records.map(record => ({ source: String(record.get('source')), target: String(record.get('target')) })),
      )
    } finally {
      await session.close()
    }
  }

  /**
   * Append one ontology version to the version chain (never overwrites:
   * the previous head loses its `head` flag and gains a `PREV` link from
   * the new head).
   * @param doc - the serialized JSON-LD document.
   * @param meta - the version's identity (id/version/name/source).
   * @returns the stored version row (with the minted version number).
   */
  async storeOntologyVersion(doc: OntologyJsonLdDocument, meta: Pick<OntologyVersionMeta, 'id' | 'name' | 'source'>): Promise<OntologyVersionMeta> {
    const session = this.requireDriver().session({ database: this.options.database })
    const createdAt = new Date().toISOString()
    try {
      const version = await session.executeWrite(async (tx) => {
        const head = await tx.run(
          'MATCH (p:__OntologyVersion) RETURN max(p.version) AS maxVersion, collect(CASE WHEN p.head THEN p.id END) AS headIds',
        )
        const next = Number(head.records[0]?.get('maxVersion') ?? 0) + 1
        const headIds = (head.records[0]?.get('headIds') ?? []).map((value: unknown) => String(value))
        await tx.run(
          [
            'CREATE (v:__OntologyVersion {id: $id, version: $version, name: $name, source: $source, jsonld: $jsonld, createdAt: $createdAt, head: true})',
            'WITH v',
            'UNWIND $headIds AS headId',
            'MATCH (p:__OntologyVersion {id: headId})',
            'SET p.head = false',
            'CREATE (v)-[:PREV]->(p)',
          ].join('\n'),
          { id: meta.id, version: neo4j.int(next), name: meta.name, source: meta.source, jsonld: JSON.stringify(doc), createdAt, headIds },
        )
        return next
      })
      return { ...meta, version, createdAt }
    } catch (error) {
      throw new GraphNeo4jError(
        `storing the ontology version failed: ${error instanceof Error ? error.message : String(error)}`,
        'NEO4J_QUERY_FAILED',
      )
    } finally {
      await session.close()
    }
  }

  /**
   * List the ontology version chain (newest first).
   * @returns the chain rows, newest first.
   */
  async listOntologyVersions(): Promise<readonly OntologyVersionMeta[]> {
    const rows = await this.runReadOnly(
      'MATCH (v:__OntologyVersion) OPTIONAL MATCH (v)-[:PREV]->(p:__OntologyVersion) RETURN v.id AS id, v.version AS version, v.name AS name, v.source AS source, v.createdAt AS createdAt, p.id AS prev ORDER BY version DESC',
    )
    return rows.map(row => ({
      id: String(row['id']),
      version: Number(row['version'] ?? 0),
      name: String(row['name'] ?? ''),
      source: String(row['source'] ?? ''),
      createdAt: String(row['createdAt'] ?? ''),
      ...(row['prev'] === null || row['prev'] === undefined ? {} : { prev: String(row['prev']) }),
    }))
  }

  /**
   * Fetch one stored ontology document by version id.
   * @param id - the version id.
   * @returns the stored JSON-LD document, or undefined when absent.
   */
  async getOntologyVersion(id: string): Promise<OntologyJsonLdDocument | undefined> {
    const rows = await this.runReadOnly('MATCH (v:__OntologyVersion {id: $id}) RETURN v.jsonld AS jsonld', { id })
    const raw = rows[0]?.['jsonld']
    if (typeof raw !== 'string') return undefined
    return JSON.parse(raw) as OntologyJsonLdDocument
  }

  /** Project one query row into the node view. */
  private nodeViewOf(row: Record<string, unknown>): GraphNodeView {
    const propsRaw = row['props']
    return {
      id: String(row['gid']),
      type: String(row['nodeType'] ?? ''),
      name: String(row['name'] ?? ''),
      props: propsRaw !== null && typeof propsRaw === 'object' ? projectProps(propsRaw as Record<string, unknown>) : {},
      degree: Number(row['degree'] ?? 0),
    }
  }
}

/**
 * Register the graph store service and open it. A missing password or an
 * unreachable server degrades to an unavailable store (one operator
 * warning; every surface method then fails loud with
 * `NEO4J_DRIVER_UNAVAILABLE`) — the engine's degraded-mode convention.
 * @param ctx - context whose `neo4jGraph` service this registers.
 * @param config - validated plugin configuration.
 */
export async function apply(ctx: Context, config: Config): Promise<void> {
  const password = process.env[config.passwordEnv ?? DEFAULT_PASSWORD_ENV]
  const service = new Neo4jGraphService(ctx, {
    url: config.url ?? DEFAULT_URL,
    user: config.user ?? DEFAULT_USER,
    password,
    database: config.database ?? DEFAULT_DATABASE,
    maxRows: config.maxRows ?? DEFAULT_MAX_ROWS,
    globalCap: config.globalCap ?? DEFAULT_GLOBAL_CAP,
  })
  ctx.effect(() => () => {
    service.close()
  }, 'neo4j-graph.dispose')
  await service.open()
  if (!service.available() && service.openFailure() !== undefined) {
    ctx.logger.warn(service.openFailure())
  }
}
