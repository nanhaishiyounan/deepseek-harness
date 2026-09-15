/**
 * Vocabulary for the knowledge-graph capability seam (`ctx.kbGraph`): the
 * runtime ontology registry types (branded node-type and relation ids, node
 * types, relations, shape validation), the triple model over those branded
 * ids, the `GraphStore`/`KgStore` provider contracts, and the property-graph
 * v2 instance shapes (nodes, edges, subgraphs, source-run watermarks).
 * @module @deepseek-ai/dsh-kb-graph/types
 */

import type { Branded } from '@deepseek-ai/dsh-brand'
import { HarnessError } from '@deepseek-ai/dsh-llm'

/**
 * Runtime ontology registry key for a node type. An open set — any string can
 * be branded here — but membership is governed by the registry: writes
 * validate entity types against registered ids (fail-loud on unknown ids),
 * and the sqlite v2 schema enforces the same closed set at the table level.
 * Registering a new type is a plugin extension (`ctx.kbGraph.registerNodeType`),
 * not a coordinated change across packages.
 */
export type KgNodeTypeId = Branded<'KgNodeTypeId'>

/**
 * Runtime ontology registry key for a relation. Same open-set semantics as
 * {@link KgNodeTypeId}; direction constraints live on the registry entry, not
 * in prose.
 */
export type KgRelationId = Branded<'KgRelationId'>

/**
 * Brand a plain string as a {@link KgNodeTypeId}. The owning-package factory
 * for wire/parser boundaries; the cast is the entire runtime cost.
 * @param id - the registry key text.
 * @returns the branded node-type id.
 */
export function kgNodeTypeId(id: string): KgNodeTypeId {
  return id as KgNodeTypeId
}

/**
 * Brand a plain string as a {@link KgRelationId}; see {@link kgNodeTypeId}.
 * @param id - the registry key text.
 * @returns the branded relation id.
 */
export function kgRelationId(id: string): KgRelationId {
  return id as KgRelationId
}

/** Where a registered type or relation came from. */
export type KgOntologySource = 'builtin-ontology' | 'builtin-food' | 'nocobase-derived' | 'agent-defined'

/** Ontology layer: schema.org-style top anchors or a business domain module. */
export type KgOntologyLayer = 'top' | 'domain'

/** Lifecycle gate for registered node types: draft types are writable but not model-visible. */
export type KgNodeTypeStatus = 'draft' | 'active'

/** One property definition on a node type (closed shape metadata). */
export interface KgPropDef {
  readonly key: string
  readonly datatype: 'string' | 'number' | 'boolean' | 'date' | 'json'
  readonly required?: boolean
  /** Exhaustive legal values when the value domain is a small enumeration. */
  readonly enumValues?: readonly string[]
  readonly description?: string
}

/**
 * A node type in the runtime ontology registry. Type hierarchy uses
 * `extends` (owl:subClassOf semantics); vocabulary aliases use `aliases`
 * (skos:altLabel semantics) — two registry fields, not two systems.
 */
export interface KgNodeType {
  readonly id: KgNodeTypeId
  /** Display label (zh preferred; from a NocoBase collection title or hand-written). */
  readonly label: string
  readonly description?: string
  readonly layer: KgOntologyLayer
  /** Parent type (owl:subClassOf semantics); domain types must extend a top or domain type. */
  readonly extends?: KgNodeTypeId
  /** Property definitions (part of the closed shape). */
  readonly props: readonly KgPropDef[]
  /** Business natural-key property name — the idempotent merge anchor. */
  readonly naturalKey?: string
  /** Static aliases (skos:altLabel); dynamic aliases live in the store's alias table. */
  readonly aliases?: readonly string[]
  readonly source: KgOntologySource
  /** Draft types accept writes but stay out of model-facing enumerations. */
  readonly status: KgNodeTypeStatus
}

/** One legal (domain, range) pair for a relation — the direction constraint unit. */
export interface KgRelationConstraint {
  readonly domain: KgNodeTypeId
  readonly range: KgNodeTypeId
}

/**
 * A relation in the runtime ontology registry. The v1 prose direction
 * constraints (produces: company→product, …) became `constraints` entries;
 * `hierarchical` relations (broader/related) with no constraints accept any
 * two registered node types.
 */
export interface KgRelation {
  readonly id: KgRelationId
  readonly label: string
  readonly description?: string
  /** At least one legal (domain, range) pair; empty means unrestricted endpoints. */
  readonly constraints: readonly KgRelationConstraint[]
  /** object = business relation; hierarchical = broader/narrower (SKOS semantics). */
  readonly kind: 'object' | 'hierarchical'
  /** Declared inverse (a reverse edge stored under another relation), when known. */
  readonly inverseOf?: KgRelationId
  readonly source: KgOntologySource
}

/** One closed-set shape violation from registry validation. */
export interface KgShapeViolation {
  readonly code: 'KG_UNKNOWN_RELATION' | 'KG_UNKNOWN_NODE_TYPE' | 'KG_DIRECTION_VIOLATION'
  readonly message: string
}

/**
 * Typed knowledge-graph error with a machine-routable, open-string `code`.
 * Shared codes cover unavailable, missing, duplicate providers, registry
 * duplicates, and closed-set rejections; store implementations add their own.
 */
export class KbGraphError extends HarnessError {}

/** One entity node: a registered type plus a stable local id. */
export interface KbGraphEntity {
  readonly type: KgNodeTypeId
  /** Stable entity id inside the tenant (a name, slug, or standard number). */
  readonly id: string
}

/** One subject-predicate-object triple with optional citation provenance. */
export interface KbGraphTriple {
  readonly subject: KbGraphEntity
  readonly predicate: KgRelationId
  readonly object: KbGraphEntity
  /** Optional citation identity (the document the fact came from). */
  readonly sourcePath?: string
}

/** One stored triple with its tenant and stable row id. */
export interface KbGraphStoredTriple extends KbGraphTriple {
  readonly rowId: number
  readonly tenantId: string
}

/** Provenance of one graph fact: which source system asserted it, when. */
export interface KgProvenance {
  readonly sourceSystem: 'nocobase' | 'lakehouse' | 'connector' | 'kb'
  /** Row primary key, sourcePath, or datasetId — the assertion's address in the source. */
  readonly sourceId: string
  readonly extractedAt: string
}

/** One property-graph node. `KbGraphEntity {type, id}` widens to this: id keeps doubling as the name. */
export interface KgNode {
  /** Minted per source: `<source_system>:<collection>:<pk>` or the seam's `kb:` compat form. */
  readonly id: string
  readonly tenantId: string
  readonly type: KgNodeTypeId
  /** Primary display label. */
  readonly name: string
  /** Idempotent merge anchor; nodes without one merge by id only. */
  readonly naturalKey?: string
  readonly summary?: string
  /** JSON-object scalar properties. */
  readonly props?: Readonly<Record<string, unknown>>
  readonly createdAt: string
  readonly updatedAt: string
}

/** One property-graph edge: bitemporal, provenance-carrying, merge-anchored on a seven-column key. */
export interface KgEdge {
  /** Stable edge id; the store keys rows on it and on the seven-column anchor. */
  readonly id: string
  readonly tenantId: string
  readonly srcId: string
  readonly dstId: string
  readonly relation: KgRelationId
  /** Relation description text (for retrieval and summarization). */
  readonly fact?: string
  /** JSON-object edge properties (quantity, time, …). */
  readonly props?: Readonly<Record<string, unknown>>
  /** Deterministic mappings pin 1.0; LLM extractions stay below it. */
  readonly confidence: number
  readonly provenance: KgProvenance
  readonly validFrom: string
  /** Set on tombstone; re-asserting the same anchor revives the edge (NULL again). */
  readonly validUntil?: string
}

/** Size bounds for a subgraph read; both are clamped server-side. */
export interface KgSubgraphLimits {
  /** Maximum nodes returned; defaults to 200, hard-capped at 2,000. */
  readonly maxNodes?: number
  /** Maximum edges returned; defaults to 1,000. */
  readonly maxEdges?: number
}

/** One node hit from a name/id search: the minted id with display fields. */
export interface KgNodeHit {
  readonly id: string
  readonly type: KgNodeTypeId
  readonly name: string
  readonly naturalKey?: string
}

/** One node inside a subgraph result, with its walk depth from the seeds. */
export interface KgSubgraphNode {
  readonly id: string
  readonly type: KgNodeTypeId
  readonly name: string
  readonly naturalKey?: string
  readonly depth: number
}

/** k-hop neighborhood read result; `truncated` signals a hit size bound. */
export interface KgSubgraph {
  readonly nodes: readonly KgSubgraphNode[]
  /** Edges whose endpoints both made the node cut, in walk order. */
  readonly edges: readonly KgEdge[]
  readonly truncated: boolean
}

/** One source-run watermark row: the incremental scheduling cursor. */
export interface KgSourceRun {
  readonly sourceSystem: string
  /** Collection name, table name, or sourcePath prefix. */
  readonly scope: string
  /** Last observed updatedAt (ISO) for polling increments. */
  readonly watermark?: string
  /** Schema/content fingerprint for change detection. */
  readonly contentHash?: string
  /** JSON pipeline-parameter snapshot for reproducibility. */
  readonly runConfig?: string
  readonly lastRunAt: string
}

/** One ontology-revision audit row a pipeline run appends (input half). */
export interface KgOntologyRevisionInput {
  /** The built-in ontology's semver the pipeline ran against. */
  readonly ontologyVersion: string
  /** Human-readable one-liner (what changed and why the row exists). */
  readonly summary: string
  /** The {added, removed, changed}×{types, relations} diff document. */
  readonly changes: unknown
  readonly createdAt: string
}

/** One persisted ontology-revision audit row (read half). */
export interface KgOntologyRevision {
  readonly id: number
  readonly ontologyVersion: string
  readonly summary: string
  readonly changes: unknown
  readonly createdAt: string
}

/**
 * A storage backend for the knowledge graph. Registered with
 * `ctx.kbGraph.registerStoreProvider`. `putTriples` is idempotent per
 * `(tenantId, triple)`: re-putting an existing triple is a no-op. The v2
 * property-graph face (`upsertNode` … `putSourceRun`) carries the merge,
 * subgraph, tombstone, alias, and watermark semantics.
 */
export interface GraphStore {
  /** Stable string, unique among registered graph stores. */
  readonly id: string
  /** Cheap local usability check; must not perform I/O. */
  available(): boolean
  /**
   * Store triples idempotently under one tenant.
   * @param tenantId - owning tenant; the hard isolation key.
   * @param triples - the triples to store.
   * @param signal - cancellation signal honored between statements.
   * @returns how many triples were newly inserted (duplicates are no-ops).
   */
  putTriples(
    tenantId: string,
    triples: readonly KbGraphTriple[],
    signal?: AbortSignal,
  ): Promise<number>
  /**
   * One-hop neighbors of one entity: every stored triple whose subject or
   * object is the entity, within the tenant.
   * @param tenantId - owning tenant.
   * @param entity - the entity to expand.
   * @param signal - cancellation signal.
   * @returns the touching triples.
   */
  neighbors(tenantId: string, entity: KbGraphEntity, signal?: AbortSignal): Promise<KbGraphStoredTriple[]>
  /**
   * Two-hop paths between two entities: triples forming a path of at most two
   * edges `entity → … → target`, within the tenant.
   * @param tenantId - owning tenant.
   * @param entity - the path start.
   * @param target - the path end.
   * @param signal - cancellation signal.
   * @returns the triples of every matching path, deduplicated.
   */
  twoHopPaths(tenantId: string, entity: KbGraphEntity, target: KbGraphEntity, signal?: AbortSignal): Promise<KbGraphStoredTriple[]>
  /**
   * Search entities by id substring and optional type.
   * @param tenantId - owning tenant.
   * @param query - case-insensitive substring of the entity id.
   * @param type - optional entity-type restriction.
   * @param k - maximum distinct entities to return.
   * @param signal - cancellation signal.
   * @returns the matching entities, at most `k`.
   */
  searchEntities(
    tenantId: string,
    query: string,
    type: KgNodeTypeId | undefined,
    k: number,
    signal?: AbortSignal,
  ): Promise<KbGraphEntity[]>
  /** Count stored triples and distinct entities under one tenant (or all). */
  stats(tenantId: string | undefined, signal?: AbortSignal): Promise<{ triples: number; entities: number }>
  /** Close the owned connection; idempotent. */
  close(): void
}

/**
 * The property-graph v2 storage face: merge-shaped upserts, k-hop subgraph
 * reads, tombstoning, aliases, and source-run watermarks. `putTriples`
 * (the v1 face) translates internally onto `upsertNode`/`upsertEdges`.
 */
export interface KgStore extends GraphStore {
  /**
   * Merge one node onto its anchors: an existing node with the same
   * `(tenant, type, natural_key)` — or the same id — takes the mutable
   * fields; otherwise a row is created.
   * @param node - the node to merge.
   * @returns whether an existing row was merged (false = fresh insert).
   */
  upsertNode(node: KgNode): Promise<{ merged: boolean }>
  /**
   * Merge edges onto the seven-column anchor `(tenant, src, dst, relation,
   * source_system, source_id)`: fresh rows insert; known anchors converge
   * confidence upward, keep the newest fact, and revive tombstones.
   * @param edges - the edges to merge.
   * @returns how many edges were newly inserted.
   */
  upsertEdges(edges: readonly KgEdge[]): Promise<number>
  /**
   * Read the k-hop neighborhood around the seeds over live edges,
   * undirected, cycle-safe (recursive CTE union).
   * @param tenantId - owning tenant.
   * @param seedIds - minted node ids the walk starts from.
   * @param hops - maximum walk depth; 0 returns just the seeds.
   * @param limits - optional size bounds; defaults apply.
   * @returns the subgraph with a truncation signal.
   */
  subgraph(tenantId: string, seedIds: readonly string[], hops: number, limits?: KgSubgraphLimits): Promise<KgSubgraph>
  /**
   * Read the one-hop neighborhood of one node (the visualization
   * load-on-demand primitive).
   * @param tenantId - owning tenant.
   * @param nodeId - the minted node id to expand.
   * @param limit - maximum nodes returned.
   * @returns the one-hop subgraph.
   */
  expand(tenantId: string, nodeId: string, limit?: number): Promise<KgSubgraph>
  /**
   * Tombstone every live edge one source currently asserts. Parallel
   * assertions from other sources survive.
   * @param sourceSystem - the asserting system ('nocobase' | 'lakehouse' | 'connector' | 'kb').
   * @param sourceId - the assertion address inside that system.
   * @param at - ISO timestamp written into `valid_until`.
   * @returns how many edges were tombstoned.
   */
  tombstoneBySource(sourceSystem: string, sourceId: string, at: string): Promise<number>
  /**
   * Bind one alias for entity resolution. Idempotent per alias→node; an
   * alias already bound to a different node refuses.
   * @param tenantId - owning tenant.
   * @param typeId - the node type the alias narrows within.
   * @param alias - the alias text.
   * @param nodeId - the minted node id the alias resolves to.
   */
  putAlias(tenantId: string, typeId: KgNodeTypeId, alias: string, nodeId: string): Promise<void>
  /**
   * Advance (or create) one source-run watermark row.
   * @param run - the run snapshot to persist.
   */
  putSourceRun(run: KgSourceRun): Promise<void>
  /**
   * Read one source-run watermark row.
   * @param sourceSystem - the asserting system.
   * @param scope - the collection/table/prefix scope.
   * @returns the stored run, or `undefined` when never run.
   */
  getSourceRun(sourceSystem: string, scope: string): Promise<KgSourceRun | undefined>
  /**
   * Merge one node-type registration row (the persistent half of the
   * two-layer registry; runtime registrations materialize here). The store
   * keeps an existing row's identity columns and refreshes the mutable
   * description, shape, and lifecycle fields.
   * @param type - the registry entry to persist.
   */
  upsertNodeType(type: KgNodeType): Promise<void>
  /**
   * Merge one relation registration row; see {@link upsertNodeType}.
   * @param relation - the registry entry to persist.
   */
  upsertRelation(relation: KgRelation): Promise<void>
  /**
   * Read every persisted node-type row.
   * @returns the stored registry entries in insertion order.
   */
  listStoredNodeTypes(): Promise<readonly KgNodeType[]>
  /**
   * Read every persisted relation row.
   * @returns the stored registry entries in insertion order.
   */
  listStoredRelations(): Promise<readonly KgRelation[]>
  /**
   * Search nodes by name / natural-key substring within one tenant and
   * optional type — the name→id resolution primitive behind seed lookup and
   * entity alignment.
   * @param tenantId - owning tenant; the hard isolation key.
   * @param query - case-insensitive substring of the name or natural key.
   * @param type - optional node-type restriction.
   * @param k - maximum nodes to return.
   * @returns the matching node hits.
   */
  searchNodes(tenantId: string, query: string, type: KgNodeTypeId | undefined, k: number): Promise<readonly KgNodeHit[]>
  /**
   * Append one ontology-revision audit row. A registry-changing pipeline
   * run records its diff; an idempotent no-change run appends nothing (the
   * caller decides — the store only journals).
   * @param revision - the revision snapshot.
   * @returns the inserted revision id.
   */
  recordOntologyRevision(revision: KgOntologyRevisionInput): Promise<number>
  /**
   * Read the newest ontology-revision audit rows.
   * @param limit - maximum rows to return.
   * @returns the revisions, newest first.
   */
  ontologyRevisions(limit: number): Promise<readonly KgOntologyRevision[]>
}
