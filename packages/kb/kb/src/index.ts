/**
 * Service Definition for the knowledge-base capability seam (`ctx.kb`): store
 * and embed provider registries, registration-order-independent selection, and
 * the ingest/search orchestration (chunk → embed → store; text + vector
 * retrieval fused with RRF). A missing embed provider is a documented degraded
 * mode — search runs on the text path alone and says so through its result
 * `mode` and `stats`.
 * @module @deepseek-ai/dsh-kb
 */

import { createHash } from 'node:crypto'
import { Context, Service } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { chunkMarkdown } from './chunker.ts'
import { fuseRrf } from './rrf.ts'
import { KbError } from './types.ts'
import type { EmbedProvider, KbChunkInput, KbDocumentInput, KbIngestRequest, KbIngestResult, KbSearchHit, KbSearchRequest, KbSearchResult, KbStats, KbStore, KbUsage, KbUsageDelta } from './types.ts'

export { chunkMarkdown, estimateTokens } from './chunker.ts'
export type { ChunkDraft, ChunkerOptions } from './chunker.ts'
export { fuseRrf } from './rrf.ts'
export type { RrfEntry } from './rrf.ts'
export { KB_DOC_KINDS, KB_SCOPES, KbError } from './types.ts'
export type { EmbedProvider, KbChunkInput, KbDocumentInput, KbDocKind, KbIngestRequest, KbIngestResult, KbProvenance, KbScope, KbSearchFilter, KbSearchHit, KbSearchRequest, KbSearchResult, KbStats, KbStore, KbStoreStats, KbUsage, KbUsageDelta } from './types.ts'

declare module '@deepseek-ai/cordis' {
  interface Context {
    kb: KbRuntime
  }
}

/** Default maximum approximate tokens per chunk. */
const DEFAULT_CHUNK_MAX_TOKENS = 512
/** Default approximate overlap tokens between adjacent chunks. */
const DEFAULT_CHUNK_OVERLAP_TOKENS = 50
/** Default RRF rank-damping constant. */
const DEFAULT_RRF_K = 60
/** Default minimum fused RRF score for a hit to survive a search. */
const DEFAULT_MIN_RELEVANCE_SCORE = 0
/** Default vector-path candidates fetched per search. */
const DEFAULT_VECTOR_TOP_K = 32
/** Default text-path candidates fetched per search. */
const DEFAULT_TEXT_TOP_K = 32
/** Default result cap per search. */
const DEFAULT_MAX_RESULTS = 8

/**
 * Config for the kb seam. `storeProvider` / `embedProvider` pin which provider
 * wins for each capability; both are optional (a single registered usable
 * provider auto-selects).
 */
export interface KbRuntimeConfig {
  /** Explicit store provider id. Omitted = auto-select when exactly one usable. */
  readonly storeProvider?: string
  /** Explicit embed provider id. Omitted = auto-select when exactly one usable. */
  readonly embedProvider?: string
  /** Maximum approximate tokens per chunk. Defaults to 512. */
  readonly chunkMaxTokens?: number
  /** Approximate overlap tokens between adjacent chunks. Defaults to 50. */
  readonly chunkOverlapTokens?: number
  /** RRF rank-damping constant. Defaults to 60. */
  readonly rrfK?: number
  /**
   * Minimum fused RRF score for a hit to survive a search; hits scoring below
   * it are dropped in both modes. RRF scores are rank-damped reciprocals: a
   * hit one path alone ranked produces at most `1/(rrfK+1)`, a hit both paths
   * rank produces at most `2/(rrfK+1)`, so a threshold above `1/(rrfK+1)`
   * keeps only dual-path hits. Defaults to 0 — keep every hit.
   */
  readonly minRelevanceScore?: number
  /** Vector-path candidates fetched per search. Defaults to 32. */
  readonly vectorTopK?: number
  /** Text-path candidates fetched per search. Defaults to 32. */
  readonly textTopK?: number
  /** Default result cap per search. Defaults to 8. */
  readonly maxResults?: number
}

/** Every tunable resolved to its effective value. */
interface ResolvedKbConfig {
  readonly chunkMaxTokens: number
  readonly chunkOverlapTokens: number
  readonly rrfK: number
  readonly minRelevanceScore: number
  readonly vectorTopK: number
  readonly textTopK: number
  readonly maxResults: number
}

function resolveKbConfig(config: KbRuntimeConfig | undefined): ResolvedKbConfig {
  return {
    chunkMaxTokens: config?.chunkMaxTokens ?? DEFAULT_CHUNK_MAX_TOKENS,
    chunkOverlapTokens: config?.chunkOverlapTokens ?? DEFAULT_CHUNK_OVERLAP_TOKENS,
    rrfK: config?.rrfK ?? DEFAULT_RRF_K,
    minRelevanceScore: config?.minRelevanceScore ?? DEFAULT_MIN_RELEVANCE_SCORE,
    vectorTopK: config?.vectorTopK ?? DEFAULT_VECTOR_TOP_K,
    textTopK: config?.textTopK ?? DEFAULT_TEXT_TOP_K,
    maxResults: config?.maxResults ?? DEFAULT_MAX_RESULTS,
  }
}

/** One registered provider with a string id and a local usability check. */
interface ProviderLike {
  readonly id: string
  available(): boolean
}

/**
 * The knowledge-base service. Registered as `ctx.kb` (one instance per
 * context).
 *
 * Store selection (resolved at execution time, never order-dependent):
 * - A configured id that is registered and `available()` → that store.
 * - A configured id not registered → `KB_STORE_CONFIGURED_MISSING`.
 * - A configured id registered but unavailable →
 *   `KB_STORE_CONFIGURED_UNAVAILABLE`.
 * - No id configured, exactly one registered usable store → that store.
 * - No id configured, multiple usable stores → `KB_STORE_AMBIGUOUS`.
 * - No id configured, no usable store → `KB_STORE_UNAVAILABLE`.
 *
 * Embed selection adds the degraded mode: an available provider participates
 * in hybrid retrieval, while NO usable provider (never configured, or
 * configured-but-unavailable, or registered-but-unavailable) degrades search
 * to the text path with `mode: 'text'`. Only a configured id that is not
 * registered at all throws (`KB_EMBED_CONFIGURED_MISSING`) — that is a
 * composition error, not a runtime condition.
 */
export class KbRuntime extends Service {
  static Config: z<KbRuntimeConfig> = z.object({
    storeProvider: z.string(),
    embedProvider: z.string(),
    chunkMaxTokens: z.number().step(1).min(1).default(DEFAULT_CHUNK_MAX_TOKENS),
    chunkOverlapTokens: z.number().step(1).min(0).default(DEFAULT_CHUNK_OVERLAP_TOKENS),
    rrfK: z.number().step(1).min(1).default(DEFAULT_RRF_K),
    minRelevanceScore: z.number().min(0).default(DEFAULT_MIN_RELEVANCE_SCORE),
    vectorTopK: z.number().step(1).min(1).default(DEFAULT_VECTOR_TOP_K),
    textTopK: z.number().step(1).min(1).default(DEFAULT_TEXT_TOP_K),
    maxResults: z.number().step(1).min(1).default(DEFAULT_MAX_RESULTS),
  })

  private readonly storeProviders = new Map<string, KbStore>()
  private readonly embedProviders = new Map<string, EmbedProvider>()
  private readonly storeProviderId: string | undefined
  private readonly embedProviderId: string | undefined
  private readonly resolved: ResolvedKbConfig
  private lastEmbedDegraded = false

  constructor(ctx: Context, config?: KbRuntimeConfig) {
    super(ctx, 'kb')
    this.storeProviderId = config?.storeProvider
    this.embedProviderId = config?.embedProvider
    this.resolved = resolveKbConfig(config)
  }

  /**
   * Register a store provider. Throws {@link KbError} `KB_DUPLICATE_PROVIDER`
   * if its id is already registered. Returns a disposer; disposed with the
   * calling fiber.
   * @param store - the store; its `id` is the registry key.
   * @returns the disposer that unregisters the store.
   */
  registerStoreProvider(store: KbStore): () => void {
    return this.registerProvider(this.storeProviders, store, 'store')
  }

  /**
   * Register an embed provider. Throws {@link KbError}
   * `KB_DUPLICATE_PROVIDER` if its id is already registered. Returns a
   * disposer; disposed with the calling fiber.
   * @param provider - the embed provider; its `id` is the registry key.
   * @returns the disposer that unregisters the provider.
   */
  registerEmbedProvider(provider: EmbedProvider): () => void {
    return this.registerProvider(this.embedProviders, provider, 'embed')
  }

  /** Shared registry insert with duplicate rejection and fiber-scoped disposal. */
  private registerProvider<T extends ProviderLike>(registry: Map<string, T>, provider: T, label: string): () => void {
    if (registry.has(provider.id)) {
      throw new KbError(`${label} provider "${provider.id}" is already registered`, 'KB_DUPLICATE_PROVIDER')
    }
    registry.set(provider.id, provider)
    const dispose = this.ctx.effect(() => () => {
      registry.delete(provider.id)
    }, `kb.register${label.charAt(0).toUpperCase()}${label.slice(1)}Provider()`)
    return () => void dispose()
  }

  /** Resolve the store or throw the matching {@link KbError}; see class doc. */
  private resolveStore(): KbStore {
    if (this.storeProviderId !== undefined) {
      const store = this.storeProviders.get(this.storeProviderId)
      if (store === undefined) {
        throw new KbError(
          `configured store provider "${this.storeProviderId}" is not registered`,
          'KB_STORE_CONFIGURED_MISSING',
        )
      }
      if (!store.available()) {
        throw new KbError(
          `configured store provider "${this.storeProviderId}" is registered but unavailable`,
          'KB_STORE_CONFIGURED_UNAVAILABLE',
        )
      }
      return store
    }
    return this.resolveUsable(this.storeProviders)
  }

  /** Resolve the single usable provider or throw; used when nothing is configured. */
  private resolveUsable(registry: Map<string, KbStore>): KbStore {
    const usable = [...registry.values()].filter(store => store.available())
    const [sole] = usable
    if (sole !== undefined && usable.length === 1) return sole
    if (usable.length > 1) {
      throw new KbError(
        `multiple usable knowledge-base stores are registered (${usable.map(store => store.id).join(', ')}); configure storeProvider explicitly`,
        'KB_STORE_AMBIGUOUS',
      )
    }
    throw new KbError('no usable knowledge-base store is registered', 'KB_STORE_UNAVAILABLE')
  }

  /**
   * Resolve the embed provider, or `undefined` for the degraded text-only
   * mode; see class doc. Logs one line per degradation transition so the
   * degraded mode is observable in operations, not just in results.
   */
  private resolveEmbed(): EmbedProvider | undefined {
    if (this.embedProviderId !== undefined) {
      const provider = this.embedProviders.get(this.embedProviderId)
      if (provider === undefined) {
        throw new KbError(
          `configured embed provider "${this.embedProviderId}" is not registered`,
          'KB_EMBED_CONFIGURED_MISSING',
        )
      }
      return provider.available() ? provider : undefined
    }
    for (const provider of this.embedProviders.values()) {
      if (provider.available()) return provider
    }
    return undefined
  }

  /** Log the degraded-mode entry transition once, not per call. */
  private noteEmbedDegradation(): void {
    if (this.lastEmbedDegraded) return
    this.lastEmbedDegraded = true
    this.ctx.logger.warn('kb: no usable embed provider; retrieval runs in text-only degraded mode')
  }

  /** Log the degraded-mode exit transition once. */
  private noteEmbedRecovered(): void {
    if (!this.lastEmbedDegraded) return
    this.lastEmbedDegraded = false
    this.ctx.logger.info('kb: an embed provider is usable again; hybrid retrieval resumed')
  }

  /** Observe one embed-resolution outcome through the transition loggers. */
  private noteEmbedResolution(embed: EmbedProvider | undefined): void {
    if (embed === undefined) this.noteEmbedDegradation()
    else this.noteEmbedRecovered()
  }

  /**
   * Record one completed operation's usage increments. Metering is
   * observability: a failed counter write is logged and swallowed so it can
   * never fail the data operation that already succeeded — nothing else
   * reaches this catch.
   * @param store - the already-resolved store that owns the counters.
   * @param tenantId - owning tenant.
   * @param delta - the operation's increments.
   * @param signal - cancellation signal.
   */
  private async meter(store: KbStore, tenantId: string, delta: KbUsageDelta, signal: AbortSignal | undefined): Promise<void> {
    try {
      await store.recordUsage(tenantId, delta, signal)
    } catch (error: unknown) {
      this.ctx.logger.warn(`kb: usage recording failed for tenant "${tenantId}": ${String(error)}`)
    }
  }

  /** Reject an already-aborted signal before any provider work. */
  private throwIfAborted(signal: AbortSignal | undefined): void {
    // An aborted AbortSignal always carries a reason per the WHATWG standard.
    /* v8 ignore next 2 */
    if (signal?.aborted) throw signal.reason ?? new DOMException('The operation was aborted', 'AbortError')
  }

  /**
   * Chunk and store one document, embedding chunks when a usable embed
   * provider exists. Re-ingesting the same `(tenantId, sourcePath)` replaces
   * the prior document.
   * @param request - document identity plus full content.
   * @param signal - cancellation signal forwarded to the embed provider and store.
   * @returns the store's ingest outcome (doc id, chunk count, embedded flag).
   */
  async ingest(request: KbIngestRequest, signal?: AbortSignal): Promise<KbIngestResult> {
    this.throwIfAborted(signal)
    const store = this.resolveStore()
    const embed = this.resolveEmbed()
    this.noteEmbedResolution(embed)
    // The attribution triple (hash + character length + source) is an
    // integrity fact the seam owns: computed here, never trusted from callers.
    const doc: KbDocumentInput = {
      ...request,
      contentHash: createHash('sha256').update(request.content, 'utf8').digest('hex'),
      // oxlint-disable-next-line typescript/no-misused-spread -- code points are the documented length unit.
      contentLength: [...request.content].length,
    }
    const drafts = chunkMarkdown(request.content, {
      maxChunkTokens: this.resolved.chunkMaxTokens,
      overlapTokens: this.resolved.chunkOverlapTokens,
    })
    let chunks: KbChunkInput[]
    if (embed === undefined) {
      chunks = drafts.map(draft => ({
        ...(draft.headingPath === undefined ? {} : { headingPath: draft.headingPath }),
        chunkIdx: draft.chunkIdx,
        content: draft.content,
        embedding: null,
      }))
    } else {
      let vectors: Float32Array[]
      try {
        vectors = await embed.embed(drafts.map(draft => draft.content), signal)
      } catch (cause: unknown) {
        throw new KbError(
          `embed provider "${embed.id}" failed while embedding an ingest`,
          'KB_EMBED_FAILED',
          { cause },
        )
      }
      const embedModel = `${embed.id}:${embed.modelId}`
      chunks = []
      for (const [index, draft] of drafts.entries()) {
        const embedding = vectors[index]
        if (embedding === undefined) {
          throw new KbError(
            `embed provider "${embed.id}" returned ${vectors.length} vectors for ${drafts.length} chunks`,
            'KB_EMBED_FAILED',
          )
        }
        chunks.push({
          ...(draft.headingPath === undefined ? {} : { headingPath: draft.headingPath }),
          chunkIdx: draft.chunkIdx,
          content: draft.content,
          embedding,
          embedModel,
        })
      }
    }
    const result = await store.putDocument(doc, chunks, signal)
    await this.meter(store, request.tenantId, {
      searches: 0,
      ingestedDocuments: 1,
      ingestedChunks: result.chunks,
      embedTexts: result.embedded ? result.chunks : 0,
      embedTokens: 0,
    }, signal)
    return result
  }

  /**
   * Run one hybrid retrieval: the text path always runs; the vector path adds
   * a second ranking when a usable embed provider exists, and the two fuse
   * through RRF. With no usable embed provider — or one that fails at runtime
   * on the query — the result is the text ranking alone with `mode: 'text'`
   * (a runtime failure logs a warning; ingest keeps failing loud on the same
   * fault so partial vectors never enter the store).
   * @param request - query, optional tenant/kind filters, optional result cap.
   * @param signal - cancellation signal forwarded to both paths.
   * @returns the fused (or text-only) hits with citation metadata; hits whose
   *   fused score falls below `minRelevanceScore` are dropped in both modes,
   *   so an unrelated query can resolve to zero results.
   */
  async search(request: KbSearchRequest, signal?: AbortSignal): Promise<KbSearchResult> {
    this.throwIfAborted(signal)
    const store = this.resolveStore()
    const embed = this.resolveEmbed()
    this.noteEmbedResolution(embed)
    const filter = request.docKind === undefined ? undefined : { docKind: request.docKind }
    const cap = request.maxResults ?? this.resolved.maxResults
    const textHits = await store.textSearch(request.query, request.tenantId, this.resolved.textTopK, filter, signal)
    // The text-only ranking passes through the same single-path RRF scoring as
    // the hybrid fusion, so one `minRelevanceScore` threshold has one meaning
    // in both modes.
    const degraded = (): KbSearchResult => {
      const hitById = new Map(textHits.map(storedHit => [storedHit.chunkId, storedHit]))
      const results = fuseRrf([...hitById.keys()], [], this.resolved.rrfK)
        .filter(entry => entry.score >= this.resolved.minRelevanceScore)
        .flatMap((entry): KbSearchHit[] => {
          const storedHit = hitById.get(entry.id)
          /* v8 ignore next -- the fused ids come from hitById itself, so a miss is unreachable; the guard totals the narrowing. */
          return storedHit === undefined ? [] : [{ ...storedHit, score: entry.score }]
        })
        .slice(0, cap)
      return { mode: 'text' as const, results }
    }
    if (embed !== undefined) {
      const vectors = await embed.embed([request.query], signal).then(
        (output: Float32Array[]) => output,
        (cause: unknown) => {
          // Retrieval stays available on a runtime embed fault; the degraded
          // mode is observable and the fault is logged for the operator.
          this.ctx.logger.warn(
            `kb search degraded to text mode: embed provider "${embed.id}" failed (${cause instanceof Error ? cause.message : String(cause)})`,
          )
          return undefined
        },
      )
      const embedded = vectors === undefined ? undefined : vectors[0]
      if (embedded !== undefined) {
        const vectorHits = await store.vectorSearch(embedded, request.tenantId, this.resolved.vectorTopK, filter, signal)
        const fused = fuseRrf(
          textHits.map(hit => hit.chunkId),
          vectorHits.map(hit => hit.chunkId),
          this.resolved.rrfK,
        )
        const hitsById = new Map<number, KbSearchHit>()
        for (const hit of [...textHits, ...vectorHits]) {
          if (!hitsById.has(hit.chunkId)) hitsById.set(hit.chunkId, hit)
        }
        const results = fused
          .filter(entry => entry.score >= this.resolved.minRelevanceScore)
          .flatMap((entry): KbSearchHit[] => {
            const hit = hitsById.get(entry.id)
            /* v8 ignore next -- the fused ids come from hitsById itself, so a miss is unreachable; the guard totals the narrowing. */
            return hit === undefined ? [] : [{ ...hit, score: entry.score }]
          })
          .slice(0, cap)
        if (request.tenantId !== undefined) {
          await this.meter(store, request.tenantId, {
            searches: 1, ingestedDocuments: 0, ingestedChunks: 0, embedTexts: 1, embedTokens: 0,
          }, signal)
        }
        return { mode: 'hybrid', embedModel: `${embed.id}:${embed.modelId}`, results }
      }
    }
    const degradedResult = degraded()
    if (request.tenantId !== undefined) {
      await this.meter(store, request.tenantId, {
        searches: 1, ingestedDocuments: 0, ingestedChunks: 0, embedTexts: 0, embedTokens: 0,
      }, signal)
    }
    return degradedResult
  }

  /**
   * Read one tenant's cumulative usage counters through the resolved store.
   * @param tenantId - owning tenant.
   * @param signal - cancellation signal.
   * @returns the tenant's counters; all zeros when none were recorded.
   */
  async usage(tenantId: string, signal?: AbortSignal): Promise<KbUsage> {
    this.throwIfAborted(signal)
    return this.resolveStore().usage(tenantId, signal)
  }

  /**
   * Report store counts plus embed-route observability for `kb_stats`.
   * @param tenantId - tenant filter; `undefined` counts across tenants.
   * @param signal - cancellation signal.
   * @returns store counts plus embed availability and identity.
   */
  async stats(tenantId?: string, signal?: AbortSignal): Promise<KbStats> {
    this.throwIfAborted(signal)
    const store = this.resolveStore()
    const embed = this.resolveEmbed()
    this.noteEmbedResolution(embed)
    const storeStats = await store.stats(tenantId, signal)
    if (embed === undefined) return { ...storeStats, embedAvailable: false }
    return { ...storeStats, embedAvailable: true, embedModel: `${embed.id}:${embed.modelId}` }
  }

  /**
   * Delete one document by identity through the resolved store.
   * @param tenantId - owning tenant.
   * @param sourcePath - stable source identity.
   * @param signal - cancellation signal.
   * @returns whether a document was deleted.
   */
  async deleteDocument(tenantId: string, sourcePath: string, signal?: AbortSignal): Promise<boolean> {
    this.throwIfAborted(signal)
    return this.resolveStore().deleteDocument(tenantId, sourcePath, signal)
  }
}

export default KbRuntime
