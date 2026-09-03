/**
 * Service Definition for the knowledge-graph capability seam (`ctx.kbGraph`):
 * a store provider registry and the query orchestration over entity-relation
 * triples. The graph is a sibling of the document seam (`ctx.kb`), not a
 * store inside it — triples and retrieval hits have different contracts, so
 * each owns its seam; both share the tenant isolation model.
 * @module @deepseek-ai/dsh-kb-graph
 */

import { Context, Service } from '@deepseek-ai/cordis'
import { KbGraphError } from './types.ts'
import type { GraphStore, KbGraphEntity, KbGraphEntityType, KbGraphStoredTriple, KbGraphTriple } from './types.ts'

export {
  KB_GRAPH_ENTITY_TYPES, KB_GRAPH_PREDICATES, KbGraphError,
} from './types.ts'
export type {
  GraphStore, KbGraphEntity, KbGraphEntityType, KbGraphPredicate, KbGraphStoredTriple, KbGraphTriple,
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
 * context).
 *
 * Store selection (resolved at execution time, never order-dependent):
 * - Exactly one registered usable store → that store.
 * - Multiple usable stores → `KB_GRAPH_STORE_AMBIGUOUS`.
 * - No usable store → `KB_GRAPH_STORE_UNAVAILABLE`.
 */
export class KbGraphRuntime extends Service {
  private readonly stores = new Map<string, GraphStore>()

  constructor(ctx: Context) {
    super(ctx, 'kbGraph')
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
    type?: KbGraphEntityType,
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
}

export default KbGraphRuntime
