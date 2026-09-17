/**
 * Service Definition for the knowledge-graph capability seam (`ctx.kbGraph`):
 * a store provider registry, the runtime ontology registry (three-layer
 * built-in seed plus plugin registrations), and the query orchestration over
 * entity-relation triples. The graph is a sibling of the document seam
 * (`ctx.kb`), not a store inside it — triples and retrieval hits have
 * different contracts, so each owns its seam; both share the tenant
 * isolation model. Closed-set validation lives at the registry boundary:
 * writes with unregistered entity types or predicates fail loud with
 * machine-routable codes.
 * @module @deepseek-ai/dsh-kb-graph
 */

import { Context, Service } from '@deepseek-ai/cordis'
import { builtinOntology, ONTOLOGY_VERSION, validateOntology } from './ontology.ts'
import { KbGraphError } from './types.ts'
import type {
  GraphStore, KbGraphEntity, KbGraphStoredTriple, KbGraphTriple,
  KgBuildRunInput, KgBuildRunRow, KgEdge,
  KgNode, KgNodeHit, KgNodeTypeId, KgNodeType, KgOntologyLayer, KgOntologyRevision,
  KgOntologyRevisionInput, KgRelation, KgRelationId,
  KgShapeViolation, KgSourceRun, KgStore, KgSubgraph, KgSubgraphLimits,
} from './types.ts'

export { builtinOntology, exportOntology, validateOntology, ONTOLOGY_VERSION } from './ontology.ts'
export type { KgBuiltinOntology, KgOntologyDocument } from './ontology.ts'
export {
  kgNodeTypeId, kgRelationId, KbGraphError,
} from './types.ts'
export { compileKgQuery, KG_QUERY_EXAMPLES } from './kg-nl.ts'
export type { KgQueryPlan, KgQueryVocabulary } from './kg-nl.ts'
export type {
  GraphStore, KbGraphEntity, KbGraphStoredTriple, KbGraphTriple,
  KgBuildRunInput, KgBuildRunRow, KgEdge,
  KgNode, KgNodeHit, KgNodeTypeId, KgNodeType, KgNodeTypeStatus, KgOntologyLayer,
  KgOntologyRevision, KgOntologyRevisionInput, KgOntologySource, KgPropDef, KgProvenance,
  KgRelation, KgRelationConstraint, KgRelationId, KgShapeViolation, KgSourceRun, KgStore,
  KgSubgraph, KgSubgraphLimits, KgSubgraphNode,
} from './types.ts'

declare module '@deepseek-ai/cordis' {
  interface Context {
    kbGraph: KbGraphRuntime
  }
}

/** Default cap on entities returned by one search. */
const DEFAULT_SEARCH_LIMIT = 10

/**
 * The knowledge-graph service. Registered as `ctx.kbGraph` (one instance per
 * context). Owns two registries: graph store providers and the ontology
 * (node types and relations, seeded with the built-in three-layer model).
 *
 * Store selection (resolved at execution time, never order-dependent):
 * - Exactly one registered usable store → that store.
 * - Multiple usable stores → `KB_GRAPH_STORE_AMBIGUOUS`.
 * - No usable store → `KB_GRAPH_STORE_UNAVAILABLE`.
 */
export class KbGraphRuntime extends Service {
  private readonly stores = new Map<string, GraphStore>()
  private readonly nodeTypes = new Map<KgNodeTypeId, KgNodeType>()
  private readonly relations = new Map<KgRelationId, KgRelation>()

  constructor(ctx: Context) {
    super(ctx, 'kbGraph')
    const seed = builtinOntology()
    // The seed is the typed TS boundary's own document; its referential
    // invariants assert here so an ontology edit that dangles an extends or
    // constraint fails at construction, never at first write.
    validateOntology({ version: ONTOLOGY_VERSION, ...seed })
    for (const type of seed.nodeTypes) this.nodeTypes.set(type.id, type)
    for (const relation of seed.relations) this.relations.set(relation.id, relation)
  }

  /**
   * Register a graph store provider. Throws {@link KbGraphError}
   * `KB_GRAPH_DUPLICATE_PROVIDER` if its id is already registered. Returns a
   * disposer; disposed with the calling fiber.
   * @param store - the store; its `id` is the registry key.
   * @returns the disposer that unregisters the store.
   */
  registerStoreProvider(store: GraphStore): () => void {
    if (this.stores.has(store.id)) {
      throw new KbGraphError(`graph store provider "${store.id}" is already registered`, 'KB_GRAPH_DUPLICATE_PROVIDER')
    }
    this.stores.set(store.id, store)
    const dispose = this.ctx.effect(() => () => {
      this.stores.delete(store.id)
    }, 'kbGraph.registerStoreProvider()')
    return () => void dispose()
  }

  /**
   * Register one node type. The `extends` parent must already be registered;
   * a duplicate id refuses. Returns a disposer; disposed with the calling
   * fiber.
   * @param type - the node-type registration entry.
   * @returns the disposer that unregisters the type.
   */
  registerNodeType(type: KgNodeType): () => void {
    if (this.nodeTypes.has(type.id)) {
      throw new KbGraphError(`node type "${String(type.id)}" is already registered`, 'KB_GRAPH_DUPLICATE_NODE_TYPE')
    }
    if (type.extends !== undefined && !this.nodeTypes.has(type.extends)) {
      throw new KbGraphError(
        `node type "${String(type.id)}" extends unregistered "${String(type.extends)}"; register the parent first`,
        'KB_GRAPH_UNKNOWN_NODE_TYPE',
      )
    }
    this.nodeTypes.set(type.id, type)
    const dispose = this.ctx.effect(() => () => {
      this.nodeTypes.delete(type.id)
    }, 'kbGraph.registerNodeType()')
    return () => void dispose()
  }

  /**
   * Register one relation. Every constraint endpoint and a declared
   * `inverseOf` must already be registered; a duplicate id refuses. Returns
   * a disposer; disposed with the calling fiber.
   * @param relation - the relation registration entry.
   * @returns the disposer that unregisters the relation.
   */
  registerRelation(relation: KgRelation): () => void {
    if (this.relations.has(relation.id)) {
      throw new KbGraphError(`relation "${String(relation.id)}" is already registered`, 'KB_GRAPH_DUPLICATE_RELATION')
    }
    for (const constraint of relation.constraints) {
      if (!this.nodeTypes.has(constraint.domain) || !this.nodeTypes.has(constraint.range)) {
        throw new KbGraphError(
          `relation "${String(relation.id)}" constrains an unregistered endpoint (${String(constraint.domain)} → ${String(constraint.range)})`,
          'KG_UNKNOWN_NODE_TYPE',
        )
      }
    }
    if (relation.inverseOf !== undefined && !this.relations.has(relation.inverseOf)) {
      throw new KbGraphError(
        `relation "${String(relation.id)}" declares unregistered inverseOf "${String(relation.inverseOf)}"`,
        'KG_UNKNOWN_RELATION',
      )
    }
    this.relations.set(relation.id, relation)
    const dispose = this.ctx.effect(() => () => {
      this.relations.delete(relation.id)
    }, 'kbGraph.registerRelation()')
    return () => void dispose()
  }

  /**
   * Look up one registered node type.
   * @param id - the registry key.
   * @returns the registered entry, or `undefined` when absent.
   */
  nodeType(id: KgNodeTypeId): KgNodeType | undefined {
    return this.nodeTypes.get(id)
  }

  /**
   * Look up one registered relation.
   * @param id - the registry key.
   * @returns the registered entry, or `undefined` when absent.
   */
  relation(id: KgRelationId): KgRelation | undefined {
    return this.relations.get(id)
  }

  /**
   * List registered node types, optionally narrowed to one layer, in
   * registration order (top layer first, then domain, then later plugins).
   * @param layer - optional layer filter.
   * @returns the matching registry entries.
   */
  listNodeTypes(layer?: KgOntologyLayer): readonly KgNodeType[] {
    const all = [...this.nodeTypes.values()]
    return layer === undefined ? all : all.filter(type => type.layer === layer)
  }

  /**
   * List registered relations in registration order.
   * @returns the registry entries.
   */
  listRelations(): readonly KgRelation[] {
    return [...this.relations.values()]
  }

  /**
   * Closed-set shape validation for one edge: unknown relation, unknown
   * endpoint types, and (for constrained relations) direction violations.
   * Unrestricted hierarchical relations accept any two registered endpoints.
   * @param relationId - the relation to check.
   * @param src - the subject node type.
   * @param dst - the object node type.
   * @returns the violations (empty when the edge shape is legal).
   */
  validateEdge(relationId: KgRelationId, src: KgNodeTypeId, dst: KgNodeTypeId): KgShapeViolation[] {
    const relation = this.relations.get(relationId)
    if (relation === undefined) {
      return [{ code: 'KG_UNKNOWN_RELATION', message: `relation "${String(relationId)}" is not registered` }]
    }
    const violations: KgShapeViolation[] = []
    if (!this.nodeTypes.has(src)) {
      violations.push({ code: 'KG_UNKNOWN_NODE_TYPE', message: `node type "${String(src)}" is not registered` })
    }
    if (!this.nodeTypes.has(dst)) {
      violations.push({ code: 'KG_UNKNOWN_NODE_TYPE', message: `node type "${String(dst)}" is not registered` })
    }
    if (violations.length > 0) return violations
    if (relation.constraints.length === 0) return []
    const matches = relation.constraints.some(c => c.domain === src && c.range === dst)
    if (!matches) {
      violations.push({
        code: 'KG_DIRECTION_VIOLATION',
        message: `relation "${String(relationId)}" allows ${relation.constraints
          .map(c => `${String(c.domain)}→${String(c.range)}`)
          .join(', ')}, not ${String(src)}→${String(dst)}`,
      })
    }
    return violations
  }

  /** Resolve the single usable store or throw; see class doc. */
  private resolveStore(): GraphStore {
    const usable = [...this.stores.values()].filter(store => store.available())
    const [sole] = usable
    if (sole !== undefined && usable.length === 1) return sole
    if (usable.length > 1) {
      throw new KbGraphError(
        `multiple usable knowledge-graph stores are registered (${usable.map(store => store.id).join(', ')}); configure one explicitly`,
        'KB_GRAPH_STORE_AMBIGUOUS',
      )
    }
    throw new KbGraphError('no usable knowledge-graph store is registered', 'KB_GRAPH_STORE_UNAVAILABLE')
  }

  /** Reject an already-aborted signal before any provider work. */
  private throwIfAborted(signal: AbortSignal | undefined): void {
    // An aborted AbortSignal always carries a reason per the WHATWG standard.
    /* v8 ignore next 2 */
    if (signal?.aborted) throw signal.reason ?? new DOMException('The operation was aborted', 'AbortError')
  }

  /**
   * Closed-set validation for one triple against the registry: every entity
   * type and predicate must be registered (existence only — direction
   * constraints are advisory for the v1 face; use {@link validateEdge} for
   * strict checks).
   * @param triple - the triple about to be stored.
   */
  private assertTripleKnown(triple: KbGraphTriple): void {
    for (const entity of [triple.subject, triple.object]) {
      if (!this.nodeTypes.has(entity.type)) {
        throw new KbGraphError(
          `entity type "${String(entity.type)}" is not registered`,
          'KB_GRAPH_UNKNOWN_ENTITY_TYPE',
        )
      }
    }
    if (!this.relations.has(triple.predicate)) {
      throw new KbGraphError(
        `predicate "${String(triple.predicate)}" is not registered`,
        'KB_GRAPH_UNKNOWN_PREDICATE',
      )
    }
  }

  /**
   * Store triples idempotently under one tenant.
   * @param tenantId - owning tenant; the hard isolation key.
   * @param triples - the triples to store.
   * @param signal - cancellation signal forwarded to the store.
   * @returns how many triples were newly inserted.
   */
  async putTriples(
    tenantId: string,
    triples: readonly KbGraphTriple[],
    signal?: AbortSignal,
  ): Promise<number> {
    this.throwIfAborted(signal)
    for (const triple of triples) this.assertTripleKnown(triple)
    return await this.resolveStore().putTriples(tenantId, triples, signal)
  }

  /**
   * One-hop neighbors of one entity.
   * @param tenantId - owning tenant.
   * @param entity - the entity to expand.
   * @param signal - cancellation signal.
   * @returns the touching triples.
   */
  async neighbors(tenantId: string, entity: KbGraphEntity, signal?: AbortSignal): Promise<KbGraphStoredTriple[]> {
    this.throwIfAborted(signal)
    return await this.resolveStore().neighbors(tenantId, entity, signal)
  }

  /**
   * Two-hop paths between two entities.
   * @param tenantId - owning tenant.
   * @param entity - the path start.
   * @param target - the path end.
   * @param signal - cancellation signal.
   * @returns the triples of every matching path, deduplicated.
   */
  async twoHopPaths(tenantId: string, entity: KbGraphEntity, target: KbGraphEntity, signal?: AbortSignal): Promise<KbGraphStoredTriple[]> {
    this.throwIfAborted(signal)
    return await this.resolveStore().twoHopPaths(tenantId, entity, target, signal)
  }

  /**
   * Search entities by id substring and optional type.
   * @param tenantId - owning tenant.
   * @param query - case-insensitive substring of the entity id.
   * @param type - optional entity-type restriction.
   * @param limit - maximum entities to return; defaults to 10.
   * @param signal - cancellation signal.
   * @returns the matching entities.
   */
  async searchEntities(
    tenantId: string,
    query: string,
    type?: KgNodeTypeId,
    limit?: number,
    signal?: AbortSignal,
  ): Promise<KbGraphEntity[]> {
    this.throwIfAborted(signal)
    return await this.resolveStore().searchEntities(tenantId, query, type, limit ?? DEFAULT_SEARCH_LIMIT, signal)
  }

  /**
   * Count stored triples and distinct entities.
   * @param tenantId - tenant filter; `undefined` counts across tenants.
   * @param signal - cancellation signal.
   * @returns the triple count and the distinct-entity count.
   */
  async stats(tenantId?: string, signal?: AbortSignal): Promise<{ triples: number; entities: number }> {
    this.throwIfAborted(signal)
    return await this.resolveStore().stats(tenantId, signal)
  }

  /**
   * Resolve the single usable store narrowed to the property-graph v2 face.
   * A store without the v2 methods fails loud — the v1 `GraphStore` face has
   * no merge/subgraph semantics to forward to.
   * @returns the sole usable store as a {@link KgStore}.
   */
  private resolveKgStore(): KgStore {
    const store = this.resolveStore()
    if (typeof (store as KgStore).upsertNode !== 'function') {
      throw new KbGraphError(
        `graph store "${store.id}" does not implement the property-graph v2 face`,
        'KB_GRAPH_STORE_NOT_V2',
      )
    }
    return store as KgStore
  }

  /**
   * Closed-set pre-write check for one v2 node: its type must be registered.
   * @param node - the node about to be merged.
   */
  private assertNodeKnown(node: KgNode): void {
    if (!this.nodeTypes.has(node.type)) {
      throw new KbGraphError(
        `node type "${String(node.type)}" is not registered`,
        'KB_GRAPH_UNKNOWN_ENTITY_TYPE',
      )
    }
  }

  /**
   * Closed-set pre-write check for one v2 edge: the predicate must be
   * registered. Endpoint types are not carried on the wire edge, so the
   * store's registry tables (kg_nodes.type_id / kg_edges.relation_id
   * foreign keys) remain the authoritative endpoint closed set.
   * @param edge - the edge about to be merged.
   */
  private assertEdgeKnown(edge: KgEdge): void {
    if (!this.relations.has(edge.relation)) {
      throw new KbGraphError(
        `predicate "${String(edge.relation)}" is not registered`,
        'KB_GRAPH_UNKNOWN_PREDICATE',
      )
    }
  }

  /**
   * Search nodes by name / natural-key substring — the name→id resolution
   * primitive behind seed lookup and entity alignment.
   * @param tenantId - owning tenant; the hard isolation key.
   * @param query - case-insensitive substring of the name or natural key.
   * @param type - optional node-type restriction.
   * @param k - maximum nodes to return; defaults to 10.
   * @returns the matching node hits.
   */
  async searchNodes(tenantId: string, query: string, type?: KgNodeTypeId, k: number = 10): Promise<readonly KgNodeHit[]> {
    return await this.resolveKgStore().searchNodes(tenantId, query, type, k)
  }

  /**
   * List one tenant's nodes capped at `k` — the bulk enumeration primitive
   * for passes that must see every node (cross-source alignment). Prefer
   * {@link KbGraphRuntime.searchNodes} whenever a name or id can narrow the
   * read.
   * @param tenantId - owning tenant; the hard isolation key.
   * @param k - maximum nodes to return.
   * @returns the nodes (no embeddings), insertion-ordered.
   */
  async listNodes(tenantId: string, k: number): Promise<readonly KgNode[]> {
    return await this.resolveKgStore().listNodes(tenantId, k)
  }

  /**
   * Merge one node onto its anchors through the v2 store face.
   * @param node - the node to merge.
   * @returns whether an existing row was merged (false = fresh insert).
   */
  async upsertNode(node: KgNode): Promise<{ merged: boolean }> {
    this.assertNodeKnown(node)
    return await this.resolveKgStore().upsertNode(node)
  }

  /**
   * Merge edges onto their seven-column anchors through the v2 store face.
   * @param edges - the edges to merge.
   * @returns how many edges were newly inserted.
   */
  async upsertEdges(edges: readonly KgEdge[]): Promise<number> {
    for (const edge of edges) this.assertEdgeKnown(edge)
    return await this.resolveKgStore().upsertEdges(edges)
  }

  /**
   * Read the k-hop neighborhood around seed nodes (undirected, cycle-safe).
   * @param tenantId - owning tenant; the hard isolation key.
   * @param seedIds - minted node ids the walk starts from.
   * @param hops - maximum walk depth; 0 returns just the seeds.
   * @param limits - optional size bounds; defaults apply.
   * @returns the subgraph with a truncation signal.
   */
  async subgraph(tenantId: string, seedIds: readonly string[], hops: number, limits?: KgSubgraphLimits): Promise<KgSubgraph> {
    return await this.resolveKgStore().subgraph(tenantId, seedIds, hops, limits)
  }

  /**
   * Read the one-hop neighborhood of one node (the visualization
   * load-on-demand primitive).
   * @param tenantId - owning tenant.
   * @param nodeId - the minted node id to expand.
   * @param limit - maximum nodes returned.
   * @returns the one-hop subgraph.
   */
  async expand(tenantId: string, nodeId: string, limit?: number): Promise<KgSubgraph> {
    return await this.resolveKgStore().expand(tenantId, nodeId, limit)
  }

  /**
   * Tombstone every live edge one source currently asserts; parallel
   * assertions from other sources survive.
   * @param sourceSystem - the asserting system.
   * @param sourceId - the assertion address inside that system.
   * @param at - ISO timestamp written into `valid_until`.
   * @returns how many edges were tombstoned.
   */
  async tombstoneBySource(sourceSystem: string, sourceId: string, at: string): Promise<number> {
    return await this.resolveKgStore().tombstoneBySource(sourceSystem, sourceId, at)
  }

  /**
   * Bind one alias for entity resolution; refuses an alias already bound to
   * a different node.
   * @param tenantId - owning tenant.
   * @param typeId - the node type the alias narrows within.
   * @param alias - the alias text.
   * @param nodeId - the minted node id the alias resolves to.
   */
  async putAlias(tenantId: string, typeId: KgNodeTypeId, alias: string, nodeId: string): Promise<void> {
    await this.resolveKgStore().putAlias(tenantId, typeId, alias, nodeId)
  }

  /**
   * Advance (or create) one source-run watermark row.
   * @param run - the run snapshot to persist.
   */
  async putSourceRun(run: KgSourceRun): Promise<void> {
    await this.resolveKgStore().putSourceRun(run)
  }

  /**
   * Read one source-run watermark row.
   * @param sourceSystem - the asserting system.
   * @param scope - the collection/table/prefix scope.
   * @returns the stored run, or `undefined` when never run.
   */
  async getSourceRun(sourceSystem: string, scope: string): Promise<KgSourceRun | undefined> {
    return await this.resolveKgStore().getSourceRun(sourceSystem, scope)
  }

  /**
   * List every source-run watermark row one system owns.
   * @param sourceSystem - the asserting system.
   * @returns the stored runs, scope-ordered.
   */
  async listSourceRuns(sourceSystem: string): Promise<readonly KgSourceRun[]> {
    return await this.resolveKgStore().listSourceRuns(sourceSystem)
  }

  /**
   * Delete one retired source-run watermark row; a never-run scope is a no-op.
   * @param sourceSystem - the asserting system.
   * @param scope - the collection/table/prefix scope.
   */
  async deleteSourceRun(sourceSystem: string, scope: string): Promise<void> {
    await this.resolveKgStore().deleteSourceRun(sourceSystem, scope)
  }

  /**
   * Register one node type in the runtime registry AND persist it as a
   * registry row (the two-layer registry's write path). Idempotent per id:
   * an already-registered id skips the runtime registration and refreshes
   * only the persisted row.
   * @param type - the node-type registration entry.
   */
  async persistNodeType(type: KgNodeType): Promise<void> {
    if (this.nodeTypes.has(type.id)) {
      // Runtime re-registration would throw the duplicate code; the persisted
      // row still refreshes so pipeline re-runs converge.
    } else {
      this.registerNodeType(type)
    }
    const store = this.resolveKgStore()
    // The store's registry tables foreign-key extends_type, so ancestors
    // persist top-down before the row that references them.
    const chain: KgNodeType[] = []
    let cursor: KgNodeType | undefined = type
    while (cursor !== undefined && !chain.includes(cursor)) {
      chain.unshift(cursor)
      cursor = cursor.extends === undefined ? undefined : this.nodeTypes.get(cursor.extends)
    }
    for (const entry of chain) {
      await store.upsertNodeType(entry)
    }
  }

  /**
   * Register one relation in the runtime registry AND persist it as a
   * registry row; see {@link persistNodeType}. Constraint endpoint types
   * persist first (the registry tables foreign-key them), as does a declared
   * inverse other than the relation itself.
   * @param relation - the relation registration entry.
   */
  async persistRelation(relation: KgRelation): Promise<void> {
    for (const constraint of relation.constraints) {
      if (this.nodeTypes.get(constraint.domain) === undefined || this.nodeTypes.get(constraint.range) === undefined) {
        throw new KbGraphError(
          `relation "${String(relation.id)}" constrains an endpoint that is not registered; persist the endpoint node types first`,
          'KG_UNKNOWN_NODE_TYPE',
        )
      }
    }
    if (!this.relations.has(relation.id)) {
      this.registerRelation(relation)
    }
    // Endpoint types and a declared inverse persist first: the store's
    // registry tables foreign-key all three.
    for (const constraint of relation.constraints) {
      await this.resolveKgStore().upsertNodeType(this.nodeTypes.get(constraint.domain) as KgNodeType)
      await this.resolveKgStore().upsertNodeType(this.nodeTypes.get(constraint.range) as KgNodeType)
    }
    const inverse = relation.inverseOf === undefined ? undefined : this.relations.get(relation.inverseOf)
    if (inverse !== undefined && inverse.id !== relation.id) {
      await this.resolveKgStore().upsertRelation(inverse)
    }
    await this.resolveKgStore().upsertRelation(relation)
  }

  /**
   * The built-in ontology's semantic version — the TS seed is the single
   * source of truth; derived registrations (nocobase-derived, agent-defined)
   * ride the store's revision audit instead.
   * @returns the seed's semver string.
   */
  ontologyVersion(): string {
    return ONTOLOGY_VERSION
  }

  /**
   * Read every persisted registry row (the two-layer registry's read path;
   * store providers re-register these at boot).
   * @returns the stored node types and relations.
   */
  async storedRegistry(): Promise<{ nodeTypes: readonly KgNodeType[]; relations: readonly KgRelation[] }> {
    const store = this.resolveKgStore()
    return {
      nodeTypes: await store.listStoredNodeTypes(),
      relations: await store.listStoredRelations(),
    }
  }

  /**
   * Append one ontology-revision audit row (the pipeline's registry diff).
   * @param revision - the revision snapshot.
   * @returns the inserted revision id.
   */
  async recordOntologyRevision(revision: KgOntologyRevisionInput): Promise<number> {
    return await this.resolveKgStore().recordOntologyRevision(revision)
  }

  /**
   * Read the newest ontology-revision audit rows.
   * @param limit - maximum rows to return.
   * @returns the revisions, newest first.
   */
  async ontologyRevisions(limit: number): Promise<readonly KgOntologyRevision[]> {
    return await this.resolveKgStore().ontologyRevisions(limit)
  }

  /**
   * Append one build-run ledger row (report + metrics JSON).
   * @param run - the ledger snapshot.
   * @returns the inserted row id.
   */
  async recordBuildRun(run: KgBuildRunInput): Promise<number> {
    return await this.resolveKgStore().recordBuildRun(run)
  }

  /**
   * Read the newest build-run ledger row for one tenant.
   * @param tenantId - owning tenant.
   * @returns the row, or undefined before the first persisted run.
   */
  async latestBuildRun(tenantId: string): Promise<KgBuildRunRow | undefined> {
    return await this.resolveKgStore().latestBuildRun(tenantId)
  }

  /**
   * Count live nodes with zero live edges (the island metric).
   * @param tenantId - owning tenant.
   * @returns the island-node count.
   */
  async islandNodes(tenantId: string): Promise<number> {
    return await this.resolveKgStore().islandNodes(tenantId)
  }

  /**
   * Count (src, dst, relation) groups asserting more than one distinct fact.
   * @param tenantId - owning tenant.
   * @returns the conflicting-fact group count.
   */
  async conflictingFacts(tenantId: string): Promise<number> {
    return await this.resolveKgStore().conflictingFacts(tenantId)
  }

  /**
   * Count live nodes of one type under one tenant (the coverage numerator).
   * @param tenantId - owning tenant.
   * @param typeId - the node type to count.
   * @returns the live-node count for that type.
   */
  async nodeCountByType(tenantId: string, typeId: KgNodeTypeId): Promise<number> {
    return await this.resolveKgStore().nodeCountByType(tenantId, typeId)
  }
}

export default KbGraphRuntime
