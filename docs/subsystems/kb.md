# Knowledge Base

English | [中文](kb.zh.md)

The knowledge-base seam separates retrieval capability from storage and embedding backends. [`ctx.kb`](#ctxkb--kbruntime) owns provider registries and the ingest/search orchestration: documents chunk (structure-aware Markdown splitting), embed when a usable provider exists, and store transactionally; search always runs the full-text path, optionally adds a vector ranking, and fuses the two through reciprocal-rank fusion.

`tenantId` is the hard isolation key on every retrieval path, count, and usage counter; `(tenantId, sourcePath)` is the document identity used for citations and overwrite. The model-facing tools bind the tenant deployment-side (`tool-kb` `Config.tenant`, required) — the model never supplies one. A structurally missing embed provider degrades search to text-only with an observable `mode: 'text'`, while a runtime embed failure throws `KbError` `KB_EMBED_FAILED` — degradation is a configuration state, never a swallowed fault. Store selection resolves at execution time with one dedicated error code per failure mode (`KB_STORE_CONFIGURED_MISSING`, `KB_STORE_CONFIGURED_UNAVAILABLE`, `KB_STORE_AMBIGUOUS`, `KB_STORE_UNAVAILABLE`).

Every completed ingest and search records per-tenant usage counters (`searches`, `ingestedDocuments`, `ingestedChunks`, `embedTexts`, `embedTokens`) through the store; a failed counter write logs a warning and never fails the data operation. `ctx.kb.usage(tenantId)` reads a tenant's cumulative counters, and `kb_stats` reports them.

Source: [`packages/kb/kb/src/index.ts`](../../packages/kb/kb/src/index.ts)

## Provider contracts

```ts type-equiv
/**
 * Closed union of ingested document kinds. Consumers `switch` on the value
 * ending in `assertNever`; a new kind is a coordinated change across this
 * package and its consumers, not a plugin extension.
 */
type KbDocKind = 'meeting' | 'interview' | 'report' | 'regulation' | 'profile' | 'table' | 'other'
```

```ts type-equiv
/**
 * One document to store. `(tenantId, sourcePath)` is the document identity:
 * re-ingesting the same pair replaces the previous document and its chunks.
 * `sourcePath` is the stable citation identity (the workspace-relative path
 * the consumer supplied), not a resolved absolute path.
 */
interface KbDocumentInput {
  /** Owning tenant slug (for example `hongfa-food`); the hard isolation key. */
  readonly tenantId: string
  /** Stable source identity used in citations and overwrite matching. */
  readonly sourcePath: string
  readonly title?: string
  readonly docKind: KbDocKind
  /** Collection date (ISO-8601) for same-tenant recency disambiguation. */
  readonly collectedAt?: string
  /**
   * Data-space provenance: who provided the document and how far its use may
   * spread. Absent on legacy ingests (the pre-dataspace default: tenant-only
   * retrieval, no provider attribution).
   */
  readonly provenance?: KbProvenance
  /**
   * SHA-256 hex digest of the UTF-8 document content. The seam computes and
   * fills this on every `ingest`; a caller-supplied value is overwritten (the
   * seam owns the integrity fact, not the caller).
   */
  readonly contentHash?: string
  /** Character length of the document content; filled by the seam on ingest. */
  readonly contentLength?: number
}
```

```ts type-equiv
/** One chunk of a document, as handed to the store by the seam's chunker. */
interface KbChunkInput {
  /** Markdown heading chain, for example `三、成本分析>原料成本`. */
  readonly headingPath?: string
  /** Document-sequence index used to restore chunk order. */
  readonly chunkIdx: number
  readonly content: string
  /** Dense vector, or `null` when no embed provider was usable (degraded mode). */
  readonly embedding: Float32Array | null
  /** Embed identity (`<providerId>:<modelId>`) covering every embedding of this ingest. */
  readonly embedModel?: string
}
```

```ts type-equiv
/**
 * One retrieved chunk with the citation metadata a consumer needs to render a
 * numbered reference: source path, title, document kind, collection date, and
 * heading path.
 */
interface KbSearchHit {
  readonly chunkId: number
  readonly docId: number
  readonly tenantId: string
  readonly sourcePath: string
  readonly title?: string
  readonly docKind: KbDocKind
  readonly collectedAt?: string
  readonly headingPath?: string
  readonly chunkIdx: number
  readonly content: string
  /** Data-space provenance, when the ingest carried it. */
  readonly provenance?: KbProvenance
}
```

```ts type-equiv
/**
 * Hybrid-retrieval outcome. `mode` makes the degraded path observable:
 * `'text'` means no usable embed provider existed, so only the full-text path
 * ran.
 */
interface KbSearchResult {
  readonly mode: 'hybrid' | 'text'
  /** Embed identity used for the query vector, in hybrid mode. */
  readonly embedModel?: string
  readonly results: readonly KbSearchHit[]
}
```

A `KbStore` implements transactional overwrite-shaped storage (`putDocument`, `deleteDocument`, `textSearch`, `vectorSearch`, `stats`); an `EmbedProvider` implements batched embedding behind a cheap local availability check.

Backends and consumers:

- Store: [`packages/kb/kb-sqlite`](../../packages/kb/kb-sqlite/README.md) — one `node:sqlite` database with an FTS5 trigram index (queries build OR-joined phrase literals, so natural-language questions match prose) and BLOB-stored vectors scanned in JS.
- Embed: [`packages/kb/kb-embed-minimax`](../../packages/kb/kb-embed-minimax/README.md) — `embo-01` (1536 dimensions) through the MiniMax-native `/embeddings` wire; [`packages/kb/kb-embed-dashscope`](../../packages/kb/kb-embed-dashscope/README.md) — `text-embedding-v4` (1024 dimensions) through the OpenAI-compatible endpoint. Both resolve credentials from the launch environment; a missing key keeps the provider registered but unavailable, which is the degraded mode above.
- Tools: [`packages/kb/tool-kb`](../../packages/kb/tool-kb/README.md) — the model-facing `kb_search` (numbered citations plus the degraded-mode note), `kb_ingest` (workspace `.md`/`.txt` as text, `.pdf`/`.docx` through unpdf/mammoth), `kb_ingest_url` (pages through the optional `ctx.web` service, with the SSRF private-network gate), and `kb_stats` (coverage, embed-route observability, and cumulative usage) — all bound to the deployment's tenant.
- Example: [`examples/kb-agent`](../../examples/kb-agent/README.md) — the runnable closed loop over desensitized food-industry corpus, keyless-snapshotted in its text-only mode.

<!-- BEGIN GENERATED cordis-surface (gen-cordis-catalog.ts) — do not edit between markers -->

<a id="cordis-surface"></a>

## Cordis API

Generated from source by `scripts/gen-cordis-catalog.ts` (verified fresh by `pnpm run verify-cordis-catalog` in doc-sync; regenerate with `pnpm run gen-cordis-catalog`) — the language sides differ only in locale-specific paired document paths. Signature blocks use a `ts cordis-catalog` fence and keep the original source JSDoc; dispatch modes are defined in the [primer](../cordis-primer.md#dispatch-modes), and the framework-inherited `ctx` API lives in [cordis-api/inherited.md](../cordis-api/inherited.md).

<a id="ctxkb--kbruntime"></a>

### `ctx.kb` — `KbRuntime`

The knowledge-base service. Registered as `ctx.kb` (one instance per context).

Store selection (resolved at execution time, never order-dependent):

- A configured id that is registered and `available()` → that store.
- A configured id not registered → `KB_STORE_CONFIGURED_MISSING`.
- A configured id registered but unavailable → `KB_STORE_CONFIGURED_UNAVAILABLE`.
- No id configured, exactly one registered usable store → that store.
- No id configured, multiple usable stores → `KB_STORE_AMBIGUOUS`.
- No id configured, no usable store → `KB_STORE_UNAVAILABLE`.

Embed selection adds the degraded mode: an available provider participates in hybrid retrieval, while NO usable provider (never configured, or configured-but-unavailable, or registered-but-unavailable) degrades search to the text path with `mode: 'text'`. Only a configured id that is not registered at all throws (`KB_EMBED_CONFIGURED_MISSING`) — that is a composition error, not a runtime condition.

```ts cordis-catalog
/**
 * Register a store provider. Throws {@link KbError} `KB_DUPLICATE_PROVIDER`
 * if its id is already registered. Returns a disposer; disposed with the
 * calling fiber.
 * @param store - the store; its `id` is the registry key.
 * @returns the disposer that unregisters the store.
 */
registerStoreProvider(store: KbStore): () => void

/**
 * Register an embed provider. Throws {@link KbError}
 * `KB_DUPLICATE_PROVIDER` if its id is already registered. Returns a
 * disposer; disposed with the calling fiber.
 * @param provider - the embed provider; its `id` is the registry key.
 * @returns the disposer that unregisters the provider.
 */
registerEmbedProvider(provider: EmbedProvider): () => void

/**
 * Chunk and store one document, embedding chunks when a usable embed
 * provider exists. Re-ingesting the same `(tenantId, sourcePath)` replaces
 * the prior document.
 * @param request - document identity plus full content.
 * @param signal - cancellation signal forwarded to the embed provider and store.
 * @returns the store's ingest outcome (doc id, chunk count, embedded flag).
 */
async ingest(request: KbIngestRequest, signal?: AbortSignal): Promise<KbIngestResult>

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
async search(request: KbSearchRequest, signal?: AbortSignal): Promise<KbSearchResult>

/**
 * Read one tenant's cumulative usage counters through the resolved store.
 * @param tenantId - owning tenant.
 * @param signal - cancellation signal.
 * @returns the tenant's counters; all zeros when none were recorded.
 */
async usage(tenantId: string, signal?: AbortSignal): Promise<KbUsage>

/**
 * Report store counts plus embed-route observability for `kb_stats`.
 * @param tenantId - tenant filter; `undefined` counts across tenants.
 * @param signal - cancellation signal.
 * @returns store counts plus embed availability and identity.
 */
async stats(tenantId?: string, signal?: AbortSignal): Promise<KbStats>

/**
 * Delete one document by identity through the resolved store.
 * @param tenantId - owning tenant.
 * @param sourcePath - stable source identity.
 * @param signal - cancellation signal.
 * @returns whether a document was deleted.
 */
async deleteDocument(tenantId: string, sourcePath: string, signal?: AbortSignal): Promise<boolean>
```

Source: [`packages/kb/kb/src/index.ts`](../../packages/kb/kb/src/index.ts)

<a id="ctxkbgraph--kbgraphruntime"></a>

### `ctx.kbGraph` — `KbGraphRuntime`

The knowledge-graph service. Registered as `ctx.kbGraph` (one instance per context).

Store selection (resolved at execution time, never order-dependent):

- Exactly one registered usable store → that store.
- Multiple usable stores → `KB_GRAPH_STORE_AMBIGUOUS`.
- No usable store → `KB_GRAPH_STORE_UNAVAILABLE`.

```ts cordis-catalog
/**
 * Register a graph store provider. Throws {@link KbGraphError}
 * `KB_GRAPH_DUPLICATE_PROVIDER` if its id is already registered. Returns a
 * disposer; disposed with the calling fiber.
 * @param store - the store; its `id` is the registry key.
 * @returns the disposer that unregisters the store.
 */
registerStoreProvider(store: GraphStore): () => void

/**
 * Store triples idempotently under one tenant.
 * @param tenantId - owning tenant; the hard isolation key.
 * @param triples - the triples to store.
 * @param signal - cancellation signal forwarded to the store.
 * @returns how many triples were newly inserted.
 */
async putTriples( tenantId: string, triples: readonly KbGraphTriple[], signal?: AbortSignal, ): Promise<number>

/**
 * One-hop neighbors of one entity.
 * @param tenantId - owning tenant.
 * @param entity - the entity to expand.
 * @param signal - cancellation signal.
 * @returns the touching triples.
 */
async neighbors(tenantId: string, entity: KbGraphEntity, signal?: AbortSignal): Promise<KbGraphStoredTriple[]>

/**
 * Two-hop paths between two entities.
 * @param tenantId - owning tenant.
 * @param entity - the path start.
 * @param target - the path end.
 * @param signal - cancellation signal.
 * @returns the triples of every matching path, deduplicated.
 */
async twoHopPaths(tenantId: string, entity: KbGraphEntity, target: KbGraphEntity, signal?: AbortSignal): Promise<KbGraphStoredTriple[]>

/**
 * Search entities by id substring and optional type.
 * @param tenantId - owning tenant.
 * @param query - case-insensitive substring of the entity id.
 * @param type - optional entity-type restriction.
 * @param limit - maximum entities to return; defaults to 10.
 * @param signal - cancellation signal.
 * @returns the matching entities.
 */
async searchEntities( tenantId: string, query: string, type?: KbGraphEntityType, limit?: number, signal?: AbortSignal, ): Promise<KbGraphEntity[]>

/**
 * Count stored triples and distinct entities.
 * @param tenantId - tenant filter; `undefined` counts across tenants.
 * @param signal - cancellation signal.
 * @returns the triple count and the distinct-entity count.
 */
async stats(tenantId?: string, signal?: AbortSignal): Promise<{ triples: number; entities: number }>
```

Source: [`packages/kb/kb-graph/src/index.ts`](../../packages/kb/kb-graph/src/index.ts)
<!-- END GENERATED cordis-surface -->

## Trusted data space linkage

Every ingested document may carry a provenance record — the data provider, an authorization scope, and the collection source — alongside the integrity facts the seam computes itself: a SHA-256 content hash and the character length (the attribution triple: hash + length + source). The SQLite store persists them (schema version 3) and returns them on every hit, so a citation can name its provider.

The scope is a closed union (`search` | `derive` | `share`) enforced on both retrieval paths: `share` documents stay retrievable from other tenants (cross-tenant search), while `search` and `derive` documents — and every legacy document ingested without provenance — remain tenant-private. This is the repository-level landing of the trusted-data-space policy chain: 数据二十条 (three-rights separation of data property), the "数据要素×" three-year action plan (industry-chain data circulation), and the Trusted Data Space development action plan 2024–2028 (数据二十条 → 数据要素× → 可信数据空间). Deriving work products and registering data assets remain consumer-side processes; the seam's obligation is the honest provenance record and the scope-honoring filter.
