/**
 * Vocabulary for the knowledge-graph capability seam (`ctx.kbGraph`): the
 * food-industry ontology's closed entity and predicate unions, the triple
 * model, the `GraphStore` provider contract, and the query surface.
 * @module @deepseek-ai/dsh-kb-graph/types
 */

import { HarnessError } from '@deepseek-ai/dsh-llm'

/**
 * Closed union of food-industry entity types. Consumers `switch` on the value
 * ending in `assertNever`; a new type is a coordinated change across this
 * package and its consumers, not a plugin extension.
 */
export type KbGraphEntityType = 'company' | 'product' | 'ingredient' | 'additive' | 'standard' | 'process' | 'risk'

/** Every member of {@link KbGraphEntityType}, for boundary validation loops. */
export const KB_GRAPH_ENTITY_TYPES: readonly KbGraphEntityType[] = [
  'company',
  'product',
  'ingredient',
  'additive',
  'standard',
  'process',
  'risk',
]

/**
 * Closed union of relation predicates. `subject → object` directions:
 * `produces` company→product, `uses` product→ingredient/additive,
 * `contains` product→additive (declared additive content),
 * `complies_with` product/process→standard, `follows` company→process,
 * `flags` standard/process→risk, `supplies` company→ingredient.
 */
export type KbGraphPredicate = 'produces' | 'uses' | 'contains' | 'complies_with' | 'follows' | 'flags' | 'supplies'

/** Every member of {@link KbGraphPredicate}, for boundary validation loops. */
export const KB_GRAPH_PREDICATES: readonly KbGraphPredicate[] = [
  'produces',
  'uses',
  'contains',
  'complies_with',
  'follows',
  'flags',
  'supplies',
]

/**
 * Typed knowledge-graph error with a machine-routable, open-string `code`.
 * Shared codes cover unavailable, missing, and duplicate providers; store
 * implementations add their own.
 */
export class KbGraphError extends HarnessError {}

/** One entity node: a type from the closed ontology plus a stable local id. */
export interface KbGraphEntity {
  readonly type: KbGraphEntityType
  /** Stable entity id inside the tenant (a name, slug, or standard number). */
  readonly id: string
}

/** One subject-predicate-object triple with optional citation provenance. */
export interface KbGraphTriple {
  readonly subject: KbGraphEntity
  readonly predicate: KbGraphPredicate
  readonly object: KbGraphEntity
  /** Optional citation identity (the document the fact came from). */
  readonly sourcePath?: string
}

/** One stored triple with its tenant and stable row id. */
export interface KbGraphStoredTriple extends KbGraphTriple {
  readonly rowId: number
  readonly tenantId: string
}

/**
 * A storage backend for the knowledge graph. Registered with
 * `ctx.kbGraph.registerStoreProvider`. `putTriples` is idempotent per
 * `(tenantId, triple)`: re-putting an existing triple is a no-op.
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
    type: KbGraphEntityType | undefined,
    k: number,
    signal?: AbortSignal,
  ): Promise<KbGraphEntity[]>
  /** Count stored triples and distinct entities under one tenant (or all). */
  stats(tenantId: string | undefined, signal?: AbortSignal): Promise<{ triples: number; entities: number }>
  /** Close the owned connection; idempotent. */
  close(): void
}
