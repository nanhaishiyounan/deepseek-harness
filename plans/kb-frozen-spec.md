# KB 残留规格冻结 v2（重建权威基线）

> 来源：packages/kb 四包 lib/types/*.d.ts 构建残留（并行会话产物，源码未入库）。
> v1 冻结：2026-08-28 10:55 CST（四包残留，探测静止后清理）。
> v2 冻结：2026-08-29 09:08 CST。中断期间并行会话于 08-28 11:18–22:34 又重建了 kb 与 kb-sqlite 两包（编译出新 lib 后再次删除 src）；对比 v1：API 契约实质未变，差异为 import 风格、私有方法补 JSDoc、新增私有 throwIfAborted（调用前拒绝已中止 signal）。v2 采用该更完整产物作为 kb/kb-sqlite 权威规格；kb-embed-dashscope/tool-kb 无新产物，沿用 v1。
> 探测结论（v2 时点）：最后写入 08-28 22:34:06（距今约 10.5 小时），无活跃进程，git 无 worktree/stash。
> 本文件是 P0-2..P0-5 重建的类型契约权威；源码 JSDoc 直接采用规格注释。
> 同批源资产（直接采用，未重新设计）：packages/kb/kb-sqlite/resources/sql/*.sql（24 个）与 tests/resources/sql/*.sql（7 个测试 fixtures）。

## `packages/kb/kb/lib/types/chunker.d.ts`

```typescript
/**
 * Structure-aware Markdown chunking for knowledge-base ingestion: split into
 * heading sections first (carrying the heading path), then recursively split
 * oversized sections on Chinese-aware separators, keeping Markdown table rows
 * intact, and merge pieces into bounded chunks with tail overlap.
 * @module @deepseek-ai/dsh-kb/chunker
 */
/** Chunking tunables (the seam's `chunkMaxTokens` / `chunkOverlapTokens` config). */
export interface ChunkerOptions {
    /** Maximum approximate tokens per chunk. */
    readonly maxChunkTokens: number;
    /** Approximate tokens of trailing context repeated across adjacent chunks. */
    readonly overlapTokens: number;
}
/** One chunk as produced by {@link chunkMarkdown}, before storage. */
export interface ChunkDraft {
    /** Markdown heading chain, for example `三、成本分析>原料成本`. */
    readonly headingPath?: string;
    /** Document-sequence index. */
    readonly chunkIdx: number;
    readonly content: string;
}
/**
 * Approximate token count: one token per CJK character, one per four
 * non-CJK characters. Exact tokenizer agreement is not a retrieval input, so
 * a stable cheap approximation is the right precision.
 * @param text - the text to measure.
 * @returns the approximate token count.
 */
export declare function estimateTokens(text: string): number;
/**
 * Chunk one Markdown document.
 * @param content - the full document text.
 * @param options - chunk budget and overlap.
 * @returns non-empty drafts in document order, each carrying its heading path.
 */
export declare function chunkMarkdown(content: string, options: ChunkerOptions): ChunkDraft[];
//# sourceMappingURL=chunker.d.ts.map
```

## `packages/kb/kb/lib/types/index.d.ts`

```typescript
/**
 * Service Definition for the knowledge-base capability seam (`ctx.kb`): store
 * and embed provider registries, registration-order-independent selection, and
 * the ingest/search orchestration (chunk → embed → store; text + vector
 * retrieval fused with RRF). A missing embed provider is a documented degraded
 * mode — search runs on the text path alone and says so through its result
 * `mode` and `stats`.
 * @module @deepseek-ai/dsh-kb
 */
import { Context, Service } from '@deepseek-ai/cordis';
import z from '@deepseek-ai/schemastery';
import { type EmbedProvider, type KbIngestRequest, type KbIngestResult, type KbSearchRequest, type KbSearchResult, type KbStats, type KbStore } from './types.ts';
export { chunkMarkdown, estimateTokens } from './chunker.ts';
export type { ChunkDraft, ChunkerOptions } from './chunker.ts';
export { fuseRrf } from './rrf.ts';
export type { RrfEntry } from './rrf.ts';
export { KB_DOC_KINDS, KbError } from './types.ts';
export type { EmbedProvider, KbChunkInput, KbDocumentInput, KbDocKind, KbIngestRequest, KbIngestResult, KbSearchFilter, KbSearchHit, KbSearchRequest, KbSearchResult, KbStats, KbStore, KbStoreStats } from './types.ts';
declare module '@deepseek-ai/cordis' {
    interface Context {
        kb: KbRuntime;
    }
}
/**
 * Config for the kb seam. `storeProvider` / `embedProvider` pin which provider
 * wins for each capability; both are optional (a single registered usable
 * provider auto-selects).
 */
export interface KbRuntimeConfig {
    /** Explicit store provider id. Omitted = auto-select when exactly one usable. */
    readonly storeProvider?: string;
    /** Explicit embed provider id. Omitted = auto-select when exactly one usable. */
    readonly embedProvider?: string;
    /** Maximum approximate tokens per chunk. Defaults to 512. */
    readonly chunkMaxTokens?: number;
    /** Approximate overlap tokens between adjacent chunks. Defaults to 50. */
    readonly chunkOverlapTokens?: number;
    /** RRF rank-damping constant. Defaults to 60. */
    readonly rrfK?: number;
    /** Vector-path candidates fetched per search. Defaults to 32. */
    readonly vectorTopK?: number;
    /** Text-path candidates fetched per search. Defaults to 32. */
    readonly textTopK?: number;
    /** Default result cap per search. Defaults to 8. */
    readonly maxResults?: number;
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
export declare class KbRuntime extends Service {
    static Config: z<KbRuntimeConfig>;
    private readonly storeProviders;
    private readonly embedProviders;
    private readonly storeProviderId;
    private readonly embedProviderId;
    private readonly resolved;
    private lastEmbedDegraded;
    constructor(ctx: Context, config?: KbRuntimeConfig);
    /**
     * Register a store provider. Throws {@link KbError} `KB_DUPLICATE_PROVIDER`
     * if its id is already registered. Returns a disposer; disposed with the
     * calling fiber.
     * @param store - the store; its `id` is the registry key.
     * @returns the disposer that unregisters the store.
     */
    registerStoreProvider(store: KbStore): () => void;
    /**
     * Register an embed provider. Throws {@link KbError}
     * `KB_DUPLICATE_PROVIDER` if its id is already registered. Returns a
     * disposer; disposed with the calling fiber.
     * @param provider - the embed provider; its `id` is the registry key.
     * @returns the disposer that unregisters the provider.
     */
    registerEmbedProvider(provider: EmbedProvider): () => void;
    /** Shared registry insert with duplicate rejection and fiber-scoped disposal. */
    private registerProvider;
    /** Resolve the store or throw the matching {@link KbError}; see class doc. */
    private resolveStore;
    /** Resolve the single usable provider or throw; used when nothing is configured. */
    private resolveUsable;
    /**
     * Resolve the embed provider, or `undefined` for the degraded text-only
     * mode; see class doc. Logs one line per degradation transition so the
     * degraded mode is observable in operations, not just in results.
     */
    private resolveEmbed;
    /** Log the degraded-mode entry transition once, not per call. */
    private noteEmbedDegradation;
    /** Log the degraded-mode exit transition once. */
    private noteEmbedRecovered;
    /** Reject an already-aborted signal before any provider work. */
    private throwIfAborted;
    /**
     * Chunk and store one document, embedding chunks when a usable embed
     * provider exists. Re-ingesting the same `(tenantId, sourcePath)` replaces
     * the prior document.
     * @param request - document identity plus full content.
     * @param signal - cancellation signal forwarded to the embed provider and store.
     * @returns the store's ingest outcome (doc id, chunk count, embedded flag).
     */
    ingest(request: KbIngestRequest, signal?: AbortSignal): Promise<KbIngestResult>;
    /**
     * Run one hybrid retrieval: the text path always runs; the vector path adds
     * a second ranking when a usable embed provider exists, and the two fuse
     * through RRF. With no usable embed provider the result is the text ranking
     * alone with `mode: 'text'`.
     * @param request - query, optional tenant/kind filters, optional result cap.
     * @param signal - cancellation signal forwarded to both paths.
     * @returns the fused (or text-only) hits with citation metadata.
     */
    search(request: KbSearchRequest, signal?: AbortSignal): Promise<KbSearchResult>;
    /**
     * Report store counts plus embed-route observability for `kb_stats`.
     * @param tenantId - tenant filter; `undefined` counts across tenants.
     * @param signal - cancellation signal.
     * @returns store counts plus embed availability and identity.
     */
    stats(tenantId?: string, signal?: AbortSignal): Promise<KbStats>;
    /**
     * Delete one document by identity through the resolved store.
     * @param tenantId - owning tenant.
     * @param sourcePath - stable source identity.
     * @param signal - cancellation signal.
     * @returns whether a document was deleted.
     */
    deleteDocument(tenantId: string, sourcePath: string, signal?: AbortSignal): Promise<boolean>;
}
export default KbRuntime;
//# sourceMappingURL=index.d.ts.map
```

## `packages/kb/kb/lib/types/invariant.d.ts`

```typescript
/**
 * Package-owned invariant companion for `@deepseek-ai/dsh-kb`.
 * @module @deepseek-ai/dsh-kb/invariant
 */
import type { Context } from '@deepseek-ai/cordis';
/** Cordis companion plugin name. */
export declare const name = "kb-invariant";
/** Service required before the companion can reserve package ownership. */
export declare const inject: string[];
/**
 * Register this package's invariant companion.
 * @param ctx - Cordis context carrying the invariant service.
 * @returns the installed registration's disposer after setup succeeds.
 */
export declare const apply: (ctx: Context) => Promise<() => void>;
//# sourceMappingURL=invariant.d.ts.map
```

## `packages/kb/kb/lib/types/rrf.d.ts`

```typescript
/**
 * Reciprocal-rank fusion for the knowledge-base hybrid retrieval: combine the
 * full-text and vector rankings without score normalization.
 * @module @deepseek-ai/dsh-kb/rrf
 */
/** One fused candidate with its RRF score. */
export interface RrfEntry {
    readonly id: number;
    readonly score: number;
}
/**
 * Fuse two ranked id lists with reciprocal-rank fusion.
 * @param textIds - full-text ranking, best first.
 * @param vectorIds - vector ranking, best first.
 * @param k - rank-damping constant (the seam's `rrfK` config); larger values
 *   flatten the contribution gap between adjacent ranks.
 * @returns candidates ordered by descending fused score, ties broken by id.
 */
export declare function fuseRrf(textIds: readonly number[], vectorIds: readonly number[], k: number): RrfEntry[];
//# sourceMappingURL=rrf.d.ts.map
```

## `packages/kb/kb/lib/types/types.d.ts`

```typescript
/**
 * Vocabulary for the knowledge-base capability seam (`ctx.kb`): documents,
 * chunks, search hits, the `KbStore` and `EmbedProvider` provider contracts,
 * and the `KbError` taxonomy.
 * @module @deepseek-ai/dsh-kb/types
 */
import { HarnessError } from '@deepseek-ai/dsh-llm';
/**
 * Closed union of ingested document kinds. Consumers `switch` on the value
 * ending in `assertNever`; a new kind is a coordinated change across this
 * package and its consumers, not a plugin extension.
 */
export type KbDocKind = 'meeting' | 'interview' | 'report' | 'regulation' | 'profile' | 'table' | 'other';
/** Every member of {@link KbDocKind}, for boundary validation loops. */
export declare const KB_DOC_KINDS: readonly KbDocKind[];
/**
 * Typed knowledge-base error with a machine-routable, open-string `code` and
 * chained `cause`. Shared codes cover unavailable, missing, unusable,
 * ambiguous, or duplicate providers and embed-provider failures; store
 * implementations add their own codes (the SQLite store distinguishes schema
 * and search failures).
 */
export declare class KbError extends HarnessError {
}
/**
 * One document to store. `(tenantId, sourcePath)` is the document identity:
 * re-ingesting the same pair replaces the previous document and its chunks.
 * `sourcePath` is the stable citation identity (the workspace-relative path
 * the consumer supplied), not a resolved absolute path.
 */
export interface KbDocumentInput {
    /** Owning tenant slug (for example `hongfa-food`); the hard isolation key. */
    readonly tenantId: string;
    /** Stable source identity used in citations and overwrite matching. */
    readonly sourcePath: string;
    readonly title?: string;
    readonly docKind: KbDocKind;
    /** Collection date (ISO-8601) for same-tenant recency disambiguation. */
    readonly collectedAt?: string;
}
/** One chunk of a document, as handed to the store by the seam's chunker. */
export interface KbChunkInput {
    /** Markdown heading chain, for example `三、成本分析>原料成本`. */
    readonly headingPath?: string;
    /** Document-sequence index used to restore chunk order. */
    readonly chunkIdx: number;
    readonly content: string;
    /** Dense vector, or `null` when no embed provider was usable (degraded mode). */
    readonly embedding: Float32Array | null;
    /** Embed identity (`<providerId>:<modelId>`) covering every embedding of this ingest. */
    readonly embedModel?: string;
}
/** Restriction applied to both retrieval paths. */
export interface KbSearchFilter {
    readonly docKind?: KbDocKind;
}
/**
 * One retrieved chunk with the citation metadata a consumer needs to render a
 * numbered reference: source path, title, document kind, collection date, and
 * heading path.
 */
export interface KbSearchHit {
    readonly chunkId: number;
    readonly docId: number;
    readonly tenantId: string;
    readonly sourcePath: string;
    readonly title?: string;
    readonly docKind: KbDocKind;
    readonly collectedAt?: string;
    readonly headingPath?: string;
    readonly chunkIdx: number;
    readonly content: string;
}
/** Store-level counts; the seam adds embed-availability facts for `kb_stats`. */
export interface KbStoreStats {
    readonly documents: number;
    readonly chunks: number;
    readonly embeddedChunks: number;
}
/** Complete `kb_stats` projection: store counts plus embed-route observability. */
export interface KbStats extends KbStoreStats {
    /** False in the documented degraded mode (pure text search). */
    readonly embedAvailable: boolean;
    /** Embed identity in use, when a usable embed provider is registered. */
    readonly embedModel?: string;
}
/**
 * A storage backend for the knowledge base. Registered with
 * `ctx.kb.registerStoreProvider`. `putDocument` is transactional and
 * overwrite-shaped: an existing `(tenantId, sourcePath)` document is deleted
 * (chunks and full-text rows included) before the new rows are inserted.
 */
export interface KbStore {
    /** Stable string, unique among registered stores. */
    readonly id: string;
    /** Cheap local usability check; must not perform I/O. */
    available(): boolean;
    /**
     * Store one document and its chunks atomically, replacing any prior document
     * with the same `(tenantId, sourcePath)`.
     * @param doc - the document identity and citation metadata.
     * @param chunks - chunker output with embeddings (or `null` in degraded mode).
     * @param signal - cancellation signal honored between statements.
     * @returns the stored document id, chunk count, and whether embeddings landed.
     */
    putDocument(doc: KbDocumentInput, chunks: readonly KbChunkInput[], signal?: AbortSignal): Promise<KbIngestResult>;
    /**
     * Delete one document by identity, cascading its chunks and full-text rows.
     * @param tenantId - owning tenant.
     * @param sourcePath - stable source identity.
     * @param signal - cancellation signal.
     * @returns whether a document was deleted.
     */
    deleteDocument(tenantId: string, sourcePath: string, signal?: AbortSignal): Promise<boolean>;
    /**
     * Full-text search over chunk contents.
     * @param query - raw query text; the store owns tokenizer-appropriate matching.
     * @param tenantId - tenant filter; `undefined` searches across tenants.
     * @param k - maximum hits to return.
     * @param filter - optional document-kind restriction.
     * @param signal - cancellation signal.
     * @returns ranked hits with citation metadata.
     */
    textSearch(query: string, tenantId: string | undefined, k: number, filter: KbSearchFilter | undefined, signal?: AbortSignal): Promise<KbSearchHit[]>;
    /**
     * Dense-vector search over stored embeddings.
     * @param vector - the query embedding.
     * @param tenantId - tenant filter; `undefined` searches across tenants.
     * @param k - maximum hits to return.
     * @param filter - optional document-kind restriction.
     * @param signal - cancellation signal.
     * @returns ranked hits with citation metadata.
     */
    vectorSearch(vector: Float32Array, tenantId: string | undefined, k: number, filter: KbSearchFilter | undefined, signal?: AbortSignal): Promise<KbSearchHit[]>;
    /**
     * Count documents, chunks, and embedded chunks.
     * @param tenantId - tenant filter; `undefined` counts across tenants.
     * @param signal - cancellation signal.
     */
    stats(tenantId: string | undefined, signal?: AbortSignal): Promise<KbStoreStats>;
}
/**
 * A text-embedding backend. Registered with
 * `ctx.kb.registerEmbedProvider`. An unavailable provider (for example a
 * missing credential) is the documented degraded-mode trigger: the seam keeps
 * running on text search alone.
 */
export interface EmbedProvider {
    /** Stable string, unique among registered embed providers. */
    readonly id: string;
    /** Model identifier reported through stats and stored per chunk. */
    readonly modelId: string;
    /** Vector dimensionality every result must match. */
    readonly dimensions: number;
    /** Cheap local usability check (credential presence); must not perform I/O. */
    available(): boolean;
    /**
     * Embed texts in order.
     * @param texts - non-empty batch of input texts.
     * @param signal - cancellation signal honored across batches and retries.
     * @returns one vector per input, each of length `dimensions`.
     */
    embed(texts: readonly string[], signal?: AbortSignal): Promise<Float32Array[]>;
}
/** One ingest request through the seam: content plus document identity. */
export interface KbIngestRequest extends KbDocumentInput {
    /** Full UTF-8 document text; the seam chunks it before storage. */
    readonly content: string;
}
/** Ingest outcome stored in and surfaced from the store. */
export interface KbIngestResult {
    readonly docId: number;
    readonly chunks: number;
    /** Whether any embedding was stored (false in degraded mode). */
    readonly embedded: boolean;
    /** Embed identity covering the stored embeddings, when any. */
    readonly embedModel?: string;
}
/** One hybrid-retrieval request through the seam. */
export interface KbSearchRequest {
    readonly query: string;
    /** Tenant filter; `undefined` searches across tenants. */
    readonly tenantId?: string;
    readonly docKind?: KbDocKind;
    /** Result cap; defaults to the seam's `maxResults` config. */
    readonly maxResults?: number;
}
/**
 * Hybrid-retrieval outcome. `mode` makes the degraded path observable:
 * `'text'` means no usable embed provider existed, so only the full-text path
 * ran.
 */
export interface KbSearchResult {
    readonly mode: 'hybrid' | 'text';
    /** Embed identity used for the query vector, in hybrid mode. */
    readonly embedModel?: string;
    readonly results: readonly KbSearchHit[];
}
//# sourceMappingURL=types.d.ts.map
```

## `packages/kb/kb-sqlite/lib/types/index.d.ts`

```typescript
/**
 * SQLite store provider for the knowledge-base seam: opens and validates one
 * `node:sqlite` database at load (fail-loud on schema mismatch) and registers
 * it on `ctx.kb`.
 * @module @deepseek-ai/dsh-kb-sqlite
 */
import type { Context } from '@deepseek-ai/cordis';
import z from '@deepseek-ai/schemastery';
export { SCHEMA_VERSION } from './schema.ts';
export { SqliteKbStore, ftsMatchExpression, likePattern } from './store.ts';
export type { SqliteKbStoreOptions } from './store.ts';
/** Cordis plugin name used by loader diagnostics. */
export declare const name = "kb-sqlite";
/** Services required by the store provider. */
export declare const inject: string[];
/** Default wait for another SQLite connection's write reservation. */
export declare const DEFAULT_BUSY_TIMEOUT_MS = 5000;
/** Plugin configuration. */
export interface Config {
    /** SQLite database path (`:memory:` supported), resolved against the process cwd when relative. */
    path: string;
    /** Maximum wait for another SQLite connection's lock; defaults to 5,000 ms. */
    busyTimeoutMs?: number;
}
export declare const Config: z<Config>;
/**
 * Open the configured database and register it as the kb store provider. The
 * open itself is eager: an unwritable path or a foreign on-disk schema fails
 * composition load instead of the first tool call.
 * @param ctx - context whose `kb` service receives the registration.
 * @param config - validated plugin configuration.
 */
export declare function apply(ctx: Context, config: Config): Promise<void>;
//# sourceMappingURL=index.d.ts.map
```

## `packages/kb/kb-sqlite/lib/types/invariant.d.ts`

```typescript
/**
 * Package-owned invariant companion for `@deepseek-ai/dsh-kb-sqlite`.
 * @module @deepseek-ai/dsh-kb-sqlite/invariant
 */
import type { Context } from '@deepseek-ai/cordis';
/** Cordis companion plugin name. */
export declare const name = "kb-sqlite-invariant";
/** Service required before the companion can reserve package ownership. */
export declare const inject: string[];
/**
 * Register this package's invariant companion.
 * @param ctx - Cordis context carrying the invariant service.
 * @returns the installed registration's disposer after setup succeeds.
 */
export declare const apply: (ctx: Context) => Promise<() => void>;
//# sourceMappingURL=invariant.d.ts.map
```

## `packages/kb/kb-sqlite/lib/types/schema.d.ts`

```typescript
/**
 * SQLite schema ownership and version validation for the kb store.
 * @module @deepseek-ai/dsh-kb-sqlite/schema
 */
import type { DatabaseSync } from 'node:sqlite';
/** Current kb store schema version; pre-release builds reject any other on-disk version. */
export declare const SCHEMA_VERSION = 1;
/** Application id reserved for DeepSeek Harness knowledge-base databases ("DSHK"). */
export declare const KB_SQLITE_APPLICATION_ID = 1146308683;
/**
 * Open and validate a kb SQLite database: secure connection pragmas, then an
 * immediate transaction that initializes a fresh database or rejects any
 * on-disk schema this build does not own.
 * @param db - an open `node:sqlite` database handle.
 * @param path - the database location used in ownership diagnostics.
 * @throws when the on-disk schema version or application identity is foreign.
 */
export declare function validateSchema(db: DatabaseSync, path: string): void;
//# sourceMappingURL=schema.d.ts.map
```

## `packages/kb/kb-sqlite/lib/types/sql.d.ts`

```typescript
/**
 * Closed, package-owned SQL resource loading for the kb SQLite store.
 * @module @deepseek-ai/dsh-kb-sqlite/sql
 */
declare const SQL_RESOURCES: readonly ["begin-immediate", "commit", "delete-chunk-fts-by-doc", "delete-document-by-id", "foreign-keys-on", "insert-chunk", "insert-chunk-fts", "insert-document", "journal-mode-wal", "rollback", "schema", "select-application-id", "select-doc-id-by-source", "select-hit-by-chunk-id", "select-user-version", "select-vector-candidates", "set-application-id", "set-user-version-1", "stats-chunks", "stats-documents", "synchronous-full", "text-search", "text-search-like", "trusted-schema-off"];
/** A resource basename selected exclusively by package code. */
export type SqlResourceName = typeof SQL_RESOURCES[number];
/**
 * Load an immutable SQL statement by closed resource name.
 * @param name - package-owned resource basename.
 * @returns the resource text.
 */
export declare function sql(name: SqlResourceName): string;
export {};
//# sourceMappingURL=sql.d.ts.map
```

## `packages/kb/kb-sqlite/lib/types/store.d.ts`

```typescript
/**
 * The SQLite `KbStore` provider: single-file storage with an FTS5 trigram
 * full-text index, JSON-independent BLOB embeddings scanned in JS, and
 * transactional overwrite-shaped ingest.
 * @module @deepseek-ai/dsh-kb-sqlite/store
 */
import { type KbChunkInput, type KbDocumentInput, type KbIngestResult, type KbSearchFilter, type KbSearchHit, type KbStore, type KbStoreStats } from '@deepseek-ai/dsh-kb';
/** Constructor options for {@link SqliteKbStore}. */
export interface SqliteKbStoreOptions {
    /** Database path (`:memory:` supported) or cwd-relative path. */
    readonly path: string;
    /** Maximum wait for another SQLite connection's lock. */
    readonly busyTimeoutMs: number;
}
type DatabaseSyncConstructor = typeof import('node:sqlite')['DatabaseSync'];
/**
 * The `node:sqlite`-backed `KbStore`. Opens and validates the database in the
 * constructor (fail-loud on schema mismatch); one instance owns one
 * connection until {@link SqliteKbStore.close}.
 */
export declare class SqliteKbStore implements KbStore {
    readonly id = "kb-sqlite";
    private readonly db;
    private closed;
    constructor(options: SqliteKbStoreOptions, Database: DatabaseSyncConstructor);
    available(): boolean;
    /** Close the owned connection; idempotent. */
    close(): void;
    putDocument(doc: KbDocumentInput, chunks: readonly KbChunkInput[], signal?: AbortSignal): Promise<KbIngestResult>;
    deleteDocument(tenantId: string, sourcePath: string, _signal?: AbortSignal): Promise<boolean>;
    /** Delete one document's FTS rows then the document row (cascading chunks); caller owns the transaction. */
    private deleteDocumentRows;
    textSearch(query: string, tenantId: string | undefined, k: number, filter: KbSearchFilter | undefined, _signal?: AbortSignal): Promise<KbSearchHit[]>;
    vectorSearch(vector: Float32Array, tenantId: string | undefined, k: number, filter: KbSearchFilter | undefined, signal?: AbortSignal): Promise<KbSearchHit[]>;
    stats(tenantId: string | undefined, _signal?: AbortSignal): Promise<KbStoreStats>;
    /** Reject use of a closed store. */
    private assertLive;
}
/**
 * Build the FTS5 MATCH expression for one raw query: a single quoted string
 * literal, so trigram substring matching applies and query syntax cannot
 * inject.
 * @param query - the trimmed query text.
 * @returns the quoted, inner-quote-doubled MATCH argument.
 */
export declare function ftsMatchExpression(query: string): string;
/**
 * Build the LIKE pattern for one raw query with `%`/`_`/`\` escaped.
 * @param query - the trimmed query text.
 * @returns the escaped `%query%` pattern.
 */
export declare function likePattern(query: string): string;
export {};
//# sourceMappingURL=store.d.ts.map
```

## `packages/kb/kb-embed-dashscope/lib/types/index.d.ts`

```typescript
/**
 * DashScope embed provider for the knowledge-base seam: `text-embedding-v4`
 * through the OpenAI-compatible `/embeddings` endpoint, batched, retried with
 * exponential backoff, and credential-gated — a missing credential makes the
 * provider unavailable, which is the seam's documented text-only degradation.
 * @module @deepseek-ai/dsh-kb-embed-dashscope
 */
import type { Context } from '@deepseek-ai/cordis';
import z from '@deepseek-ai/schemastery';
import type { EmbedProvider } from '@deepseek-ai/dsh-kb';
/** Cordis plugin name used by loader diagnostics. */
export declare const name = "kb-embed-dashscope";
/** Services required by the embed provider. */
export declare const inject: string[];
/** Registry id of this provider. */
export declare const DASHSCOPE_PROVIDER_ID = "dashscope";
/** Default credential reference resolved through the launch environment. */
export declare const DEFAULT_API_KEY_ENV = "DASHSCOPE_API_KEY";
/** Default OpenAI-compatible DashScope endpoint. */
export declare const DEFAULT_BASE_URL = "https://dashscope.aliyuncs.com/compatible-mode/v1";
/** Default embedding model. */
export declare const DEFAULT_MODEL = "text-embedding-v4";
/** Default and only supported vector dimensionality. */
export declare const DEFAULT_DIMENSIONS = 1024;
/** DashScope accepts at most ten input texts per embeddings request. */
export declare const MAX_BATCH_SIZE = 10;
/** Default per-request timeout. */
export declare const DEFAULT_TIMEOUT_MS = 30000;
/** Default retry budget for transient failures. */
export declare const DEFAULT_MAX_RETRIES = 3;
/** Plugin configuration. */
export interface Config {
    /** Credential reference resolved per request from the launch environment. */
    apiKeyEnv: string;
    /** OpenAI-compatible DashScope base URL. */
    baseURL: string;
    /** Embedding model id. */
    model: string;
    /** Vector dimensionality every result must match. */
    dimensions: number;
    /** Input texts per embeddings request (DashScope caps at 10). */
    batchSize: number;
    /** Per-request timeout in milliseconds. */
    timeoutMs: number;
    /** Retries for transient failures (HTTP 429/5xx and network errors). */
    maxRetries: number;
}
export declare const Config: z<Config>;
/** Resolved provider options after schemastery applies every field default. */
export interface DashScopeEmbedOptions {
    readonly baseURL: string;
    readonly model: string;
    readonly dimensions: number;
    readonly batchSize: number;
    readonly timeoutMs: number;
    readonly maxRetries: number;
    /** Synchronous credential lookup; `undefined` means the provider is unavailable. */
    readonly resolveKey: () => string | undefined;
    /** Fetch implementation, overridable in tests. */
    readonly fetch: typeof globalThis.fetch;
}
/**
 * The DashScope `EmbedProvider`. `available()` is the cheap synchronous
 * credential check that drives the seam's degraded mode; the network is only
 * touched inside `embed()`.
 */
export declare class DashScopeEmbedProvider implements EmbedProvider {
    readonly id = "dashscope";
    readonly modelId: string;
    readonly dimensions: number;
    private readonly options;
    constructor(options: DashScopeEmbedOptions);
    available(): boolean;
    embed(texts: readonly string[], signal?: AbortSignal): Promise<Float32Array[]>;
    private embedBatch;
    private requestOnce;
}
/**
 * Validate and decode one embeddings response at the wire boundary.
 * @param payload - the parsed JSON response body.
 * @param expectedCount - the batch size the request sent.
 * @param dimensions - the configured dimensionality.
 * @returns one vector per input, in input order.
 */
export declare function decodeEmbeddings(payload: unknown, expectedCount: number, dimensions: number): Float32Array[];
/**
 * Register the DashScope embed provider on `ctx.kb`. Credential resolution is
 * the synchronous launch-environment lookup over `apiKeyEnv`; a missing key
 * leaves the provider registered but unavailable, which the seam reports as
 * text-only degraded retrieval.
 * @param ctx - context whose `kb` service receives the registration.
 * @param config - validated plugin configuration.
 */
export declare function apply(ctx: Context, config: Config): void;
//# sourceMappingURL=index.d.ts.map
```

## `packages/kb/kb-embed-dashscope/lib/types/invariant.d.ts`

```typescript
/**
 * Package-owned invariant companion for `@deepseek-ai/dsh-kb-embed-dashscope`.
 * @module @deepseek-ai/dsh-kb-embed-dashscope/invariant
 */
import type { Context } from '@deepseek-ai/cordis';
/** Cordis companion plugin name. */
export declare const name = "kb-embed-dashscope-invariant";
/** Service required before the companion can reserve package ownership. */
export declare const inject: string[];
/**
 * Register this package's invariant companion.
 * @param ctx - Cordis context carrying the invariant service.
 * @returns the installed registration's disposer after setup succeeds.
 */
export declare const apply: (ctx: Context) => Promise<() => void>;
//# sourceMappingURL=invariant.d.ts.map
```

## `packages/kb/tool-kb/lib/types/index.d.ts`

```typescript
/**
 * Model-facing `kb_search`, `kb_ingest`, and `kb_stats` tools over `ctx.kb`.
 * This package owns schemas, validation, prompt guidance, limits, and
 * presentation, never concrete store or embed providers. Enablement controls
 * tool registration; an enabled tool remains visible when its store is
 * unavailable and fails with a structured error at execution time.
 * @module @deepseek-ai/dsh-tool-kb
 */
import type { Context } from '@deepseek-ai/cordis';
import z from '@deepseek-ai/schemastery';
export { formatIngestOutput, INGEST_EXTENSIONS, parseIngestArgs, presentIngestCall, presentIngestResult, } from './ingest.ts';
export type { KbIngestArgs, KbIngestInput, KbIngestToolValue } from './ingest.ts';
export { formatSearchOutput, KB_SEARCH_MAX_RESULTS, parseSearchArgs, presentSearchCall, presentSearchResult, searchMetaFromResult, searchValueFromResult, } from './search.ts';
export type { KbSearchArgs, KbSearchInput, KbSearchMetaView, KbSearchToolValue } from './search.ts';
export { formatStatsOutput, presentStatsCall, presentStatsResult, statsValueFromResult } from './stats.ts';
export type { KbStatsArgs, KbStatsToolValue } from './stats.ts';
/** Cordis plugin name used by loader diagnostics. */
export declare const name = "tool-kb";
/** Services required by the kb tool suite. */
export declare const inject: string[];
/** Default cooperative tool-call timeout budget (ms) for kb_search and kb_stats. */
export declare const DEFAULT_KB_TOOL_TIMEOUT_MS = 30000;
/** Default cooperative tool-call timeout budget (ms) for kb_ingest (embedding batches). */
export declare const DEFAULT_KB_INGEST_TIMEOUT_MS = 300000;
/** Plugin config: which kb tools to register, per-tool budgets, the citation cap, and the default tenant. */
export interface Config {
    /** Register `kb_search`. Defaults to true. */
    search?: boolean;
    /** Register `kb_ingest`. Defaults to true. */
    ingest?: boolean;
    /** Register `kb_stats`. Defaults to true. */
    stats?: boolean;
    /** Upper bound on citations returned by one `kb_search` call. Defaults to 8. */
    maxResults?: number;
    /** Composition-level default tenant applied when a call omits `tenant`. */
    defaultTenant?: string;
    /** Cooperative timeout budget (ms) for `kb_search`. Defaults to 30000. */
    searchTimeoutMs?: number;
    /** Cooperative timeout budget (ms) for `kb_ingest`. Defaults to 300000. */
    ingestTimeoutMs?: number;
    /** Cooperative timeout budget (ms) for `kb_stats`. Defaults to 10000. */
    statsTimeoutMs?: number;
}
export declare const Config: z<Config>;
/**
 * Register the enabled kb tools. `search`/`ingest`/`stats` default to true; a
 * product that wants a subset disables the others in config. Each tool's
 * cooperative timeout budget is attached to the tool as `ToolDefinition.timeoutMs`
 * for `@deepseek-ai/dsh-tool-call-timeout-policy` to enforce. The tools'
 * disposers are fiber-scoped, so no manual teardown is needed.
 * @param ctx - context whose registries receive the registrations.
 * @param config - validated plugin configuration.
 */
export declare function apply(ctx: Context, config: Config): void;
//# sourceMappingURL=index.d.ts.map
```

## `packages/kb/tool-kb/lib/types/ingest.d.ts`

```typescript
/**
 * The model-facing `kb_ingest` tool: read one workspace UTF-8 text file,
 * chunk it, and store it in the knowledge base under a tenant. Execution goes
 * through `ctx.fs` for path resolution and `ctx.kb` for the ingest pipeline.
 */
import type { Context } from '@deepseek-ai/cordis';
import type { GenericCallView, GenericResultView, ToolResult } from '@deepseek-ai/dsh-tools';
import type { KbDocKind } from '@deepseek-ai/dsh-kb';
/** File extensions accepted for ingestion (UTF-8 text only in the MVP). */
export declare const INGEST_EXTENSIONS: readonly [".md", ".txt"];
/** Model-facing `kb_ingest` arguments. */
export interface KbIngestArgs {
    path: string;
    tenant?: string;
    doc_kind?: string;
    title?: string;
    collected_at?: string;
}
/** Validated `kb_ingest` input after defaulting. */
export interface KbIngestInput {
    path: string;
    tenant: string;
    docKind: KbDocKind;
    title: string | undefined;
    collectedAt: string | undefined;
}
/**
 * Validate value constraints the schema DSL can't express: a non-blank
 * `.md`/`.txt` path, a tenant (required unless the composition default
 * supplies one), a known `doc_kind`, and an ISO-8601 `collected_at` when given.
 * @param args - the schema-validated `kb_ingest` arguments.
 * @param defaultTenant - the composition-level default tenant, when configured.
 * @returns the validated ingest input.
 */
export declare function parseIngestArgs(args: KbIngestArgs, defaultTenant: string | undefined): KbIngestInput;
/** The canonical `kb_ingest` output value. */
export interface KbIngestToolValue {
    doc_id: number;
    chunks: number;
    embedded: boolean;
    embed_model?: string;
    path: string;
    tenant: string;
}
/**
 * Format an ingest outcome as the model-facing text.
 * @param value - the tool's canonical output value.
 * @returns the rendered summary.
 */
export declare function formatIngestOutput(value: KbIngestToolValue): string;
/** Pending-call presentation: a generic card titled by the ingest path. */
export declare function presentIngestCall(args: KbIngestArgs): GenericCallView;
/** Completed-call presentation: a generic card restating the stored summary. */
export declare function presentIngestResult(_args: KbIngestArgs, result: ToolResult): GenericResultView | undefined;
/**
 * Register the `kb_ingest` tool.
 * @param ctx - context whose `tools` registry receives the registration; execution uses its `fs` and `kb` services.
 * @param defaultTenant - the composition-level default tenant, when configured.
 * @param timeoutMs - cooperative tool-call budget attached as `ToolDefinition.timeoutMs`.
 */
export declare function applyKbIngestTool(ctx: Context, defaultTenant: string | undefined, timeoutMs: number): void;
//# sourceMappingURL=ingest.d.ts.map
```

## `packages/kb/tool-kb/lib/types/invariant.d.ts`

```typescript
/**
 * Package-owned invariant companion for `@deepseek-ai/dsh-tool-kb`.
 * @module @deepseek-ai/dsh-tool-kb/invariant
 */
import type { Context } from '@deepseek-ai/cordis';
/** Cordis companion plugin name. */
export declare const name = "tool-kb-invariant";
/** Service required before the companion can reserve package ownership. */
export declare const inject: string[];
/**
 * Register this package's invariant companion.
 * @param ctx - Cordis context carrying the invariant service.
 * @returns the installed registration's disposer after setup succeeds.
 */
export declare const apply: (ctx: Context) => Promise<() => void>;
//# sourceMappingURL=invariant.d.ts.map
```

## `packages/kb/tool-kb/lib/types/search.d.ts`

```typescript
/**
 * The model-facing `kb_search` tool: hybrid retrieval over the ingested
 * knowledge base with numbered citations. Execution goes through `ctx.kb` —
 * this module owns only the model-facing schema, argument validation, the
 * result cap, and citation formatting.
 */
import type { Context } from '@deepseek-ai/cordis';
import type { GenericCallView, GenericResultView, ToolResult } from '@deepseek-ai/dsh-tools';
import type { KbDocKind, KbSearchResult } from '@deepseek-ai/dsh-kb';
/** Default upper bound on returned citations (the `maxResults` config). */
export declare const KB_SEARCH_MAX_RESULTS = 8;
/** Model-facing `kb_search` arguments. */
export interface KbSearchArgs {
    query: string;
    tenant?: string;
    doc_kind?: string;
    max_results?: number;
}
/** Validated `kb_search` input after defaulting. */
export interface KbSearchInput {
    query: string;
    tenant: string | undefined;
    docKind: KbDocKind | undefined;
    maxResults: number;
}
/**
 * Validate value constraints the schema DSL can't express: a non-blank query,
 * a known `doc_kind`, and a result cap within the deployment bound. The
 * tenant defaults to the composition's `defaultTenant` when configured.
 * @param args - the schema-validated `kb_search` arguments.
 * @param maxResults - the deployment's upper bound on returned citations.
 * @param defaultTenant - the composition-level default tenant, when configured.
 * @returns the validated search input.
 */
export declare function parseSearchArgs(args: KbSearchArgs, maxResults: number, defaultTenant: string | undefined): KbSearchInput;
/**
 * Format a search outcome as the model-facing text: the numbered citations,
 * the degraded-mode note, and the standing citation instruction.
 * @param value - the seam's search outcome.
 * @returns the rendered citation list.
 */
export declare function formatSearchOutput(value: KbSearchToolValue): string;
/** The canonical `kb_search` output value (the projection the schema declares). */
export interface KbSearchToolValue {
    query: string;
    mode: 'hybrid' | 'text';
    embed_model?: string;
    results: Array<{
        chunk_id: number;
        doc_id: number;
        tenant: string;
        source_path: string;
        title?: string;
        doc_kind: string;
        collected_at?: string;
        heading_path?: string;
        chunk_idx: number;
        content: string;
    }>;
    truncated: boolean;
}
/** Project a seam outcome into the canonical tool value. */
export declare function searchValueFromResult(input: KbSearchInput, result: KbSearchResult): KbSearchToolValue;
/** Presentation-ready projection of replayed search metadata. */
export interface KbSearchMetaView {
    readonly query: string;
    readonly mode: 'hybrid' | 'text';
    readonly truncated: boolean;
    readonly hits: number;
}
/**
 * Narrow opaque live or replayed result metadata for presentation. Malformed
 * metadata returns `undefined` so presentation falls back to the generic card.
 * @param meta - result metadata.
 * @returns the validated search meta, or `undefined`.
 */
export declare function searchMetaFromResult(meta: unknown): KbSearchMetaView | undefined;
/** Pending-call presentation: a generic search card titled by the query. */
export declare function presentSearchCall(args: KbSearchArgs): GenericCallView;
/** Completed-call presentation: a generic card restating the query and hit count. */
export declare function presentSearchResult(_args: KbSearchArgs, result: ToolResult): GenericResultView | undefined;
/**
 * Register the `kb_search` tool and its system-prompt guidance.
 * @param ctx - context whose `tools` and `systemPrompt` registries receive the registrations.
 * @param maxResults - the deployment's citation cap.
 * @param defaultTenant - the composition-level default tenant, when configured.
 * @param timeoutMs - cooperative tool-call budget attached as `ToolDefinition.timeoutMs`.
 */
export declare function applyKbSearchTool(ctx: Context, maxResults: number, defaultTenant: string | undefined, timeoutMs: number): void;
//# sourceMappingURL=search.d.ts.map
```

## `packages/kb/tool-kb/lib/types/stats.d.ts`

```typescript
/**
 * The model-facing `kb_stats` tool: report knowledge-base coverage — document,
 * chunk, and embedding counts plus embed-route availability — through `ctx.kb`.
 */
import type { Context } from '@deepseek-ai/cordis';
import type { GenericCallView, GenericResultView, ToolResult } from '@deepseek-ai/dsh-tools';
import type { KbStats } from '@deepseek-ai/dsh-kb';
/** Model-facing `kb_stats` arguments. */
export interface KbStatsArgs {
    tenant?: string;
}
/** The canonical `kb_stats` output value. */
export interface KbStatsToolValue {
    tenant?: string;
    documents: number;
    chunks: number;
    embedded_chunks: number;
    embed_available: boolean;
    embed_model?: string;
}
/**
 * Format a stats outcome as the model-facing text.
 * @param value - the tool's canonical output value.
 * @returns the rendered summary.
 */
export declare function formatStatsOutput(value: KbStatsToolValue): string;
/** Pending-call presentation: a generic card titled by the scope. */
export declare function presentStatsCall(args: KbStatsArgs): GenericCallView;
/** Completed-call presentation: a generic card restating the coverage summary. */
export declare function presentStatsResult(_args: KbStatsArgs, result: ToolResult): GenericResultView | undefined;
/** Project a seam stats outcome into the canonical tool value. */
export declare function statsValueFromResult(tenant: string | undefined, stats: KbStats): KbStatsToolValue;
/**
 * Register the `kb_stats` tool.
 * @param ctx - context whose `tools` registry receives the registration.
 * @param defaultTenant - the composition-level default tenant, when configured.
 * @param timeoutMs - cooperative tool-call budget attached as `ToolDefinition.timeoutMs`.
 */
export declare function applyKbStatsTool(ctx: Context, defaultTenant: string | undefined, timeoutMs: number): void;
//# sourceMappingURL=stats.d.ts.map
```
