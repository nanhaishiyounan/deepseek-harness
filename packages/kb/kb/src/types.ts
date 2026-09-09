/**
 * Vocabulary for the knowledge-base capability seam (`ctx.kb`): documents,
 * chunks, search hits, the `KbStore` and `EmbedProvider` provider contracts,
 * and the `KbError` taxonomy.
 * @module @deepseek-ai/dsh-kb/types
 */

import { HarnessError } from '@deepseek-ai/dsh-llm'

/**
 * Closed union of ingested document kinds. Consumers `switch` on the value
 * ending in `assertNever`; a new kind is a coordinated change across this
 * package and its consumers, not a plugin extension.
 */
export type KbDocKind = 'meeting' | 'interview' | 'report' | 'regulation' | 'profile' | 'table' | 'other'

/** Every member of {@link KbDocKind}, for boundary validation loops. */
export const KB_DOC_KINDS: readonly KbDocKind[] = [
  'meeting',
  'interview',
  'report',
  'regulation',
  'profile',
  'table',
  'other',
]

/**
 * Typed knowledge-base error with a machine-routable, open-string `code` and
 * chained `cause`. Shared codes cover unavailable, missing, unusable,
 * ambiguous, or duplicate providers and embed-provider failures; store
 * implementations add their own codes (the SQLite store distinguishes schema
 * and search failures).
 */
export class KbError extends HarnessError {}

/**
 * One document to store. `(tenantId, sourcePath)` is the document identity:
 * re-ingesting the same pair replaces the previous document and its chunks.
 * `sourcePath` is the stable citation identity (the workspace-relative path
 * the consumer supplied), not a resolved absolute path.
 */
export interface KbDocumentInput {
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

/**
 * Closed union of authorization scopes. `search` keeps a document inside its
 * own tenant's retrieval; `derive` additionally allows derived work products
 * inside the tenant; `share` lets OTHER tenants retrieve the document too
 * (cross-tenant search results). Consumers `switch` on the value ending in
 * `assertNever`.
 */
export type KbScope = 'search' | 'derive' | 'share'

/** Every member of {@link KbScope}, for boundary validation loops. */
export const KB_SCOPES: readonly KbScope[] = ['search', 'derive', 'share']

/**
 * The trusted-data-space provenance record carried on every ingested
 * document: the provider/consumer/scope triple plus the content-integrity
 * facts (hash + character length) that back later attribution claims
 * (数据二十条 三权分置; 可信数据空间发展行动计划).
 */
export interface KbProvenance {
  /** Data provider identity (the party that contributed the document). */
  readonly provider: string
  /** How far retrieval may spread; defaults to `search` when omitted. */
  readonly scope?: KbScope
  /** Where the document was collected from (visit, upload, URL, system). */
  readonly collectedSource?: string
}

/** One chunk of a document, as handed to the store by the seam's chunker. */
export interface KbChunkInput {
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

/** Restriction applied to both retrieval paths. */
export interface KbSearchFilter {
  readonly docKind?: KbDocKind
}

/**
 * One retrieved chunk with the citation metadata a consumer needs to render a
 * numbered reference: source path, title, document kind, collection date, and
 * heading path.
 */
export interface KbSearchHit {
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
  /**
   * Fused RRF relevance score, attached by `search()` (stores rank; they do
   * not score). One meaning in both modes — the threshold's score basis.
   */
  readonly score?: number
}

/** Store-level counts; the seam adds embed-availability facts for `kb_stats`. */
export interface KbStoreStats {
  readonly documents: number
  readonly chunks: number
  readonly embeddedChunks: number
}

/**
 * One tenant's cumulative usage counters — the metering infrastructure behind
 * quota and billing projections. Counters are per tenant and monotonic; no
 * consumer resets them.
 */
export interface KbUsage {
  /** Completed `search` operations. */
  readonly searches: number
  /** Documents stored through `ingest` (re-ingest replacements count again). */
  readonly ingestedDocuments: number
  /** Chunks stored through `ingest`. */
  readonly ingestedChunks: number
  /** Texts sent to embed providers (ingest chunks plus hybrid search queries). */
  readonly embedTexts: number
  /** Embed tokens reported by providers; counted per text until a provider reports usage. */
  readonly embedTokens: number
}

/** Usage increments for one completed operation; omitted fields add zero. */
export interface KbUsageDelta {
  readonly searches?: number
  readonly ingestedDocuments?: number
  readonly ingestedChunks?: number
  readonly embedTexts?: number
  readonly embedTokens?: number
}

/** Complete `kb_stats` projection: store counts plus embed-route observability. */
export interface KbStats extends KbStoreStats {
  /** False in the documented degraded mode (pure text search). */
  readonly embedAvailable: boolean
  /** Embed identity in use, when a usable embed provider is registered. */
  readonly embedModel?: string
}

/**
 * A storage backend for the knowledge base. Registered with
 * `ctx.kb.registerStoreProvider`. `putDocument` is transactional and
 * overwrite-shaped: an existing `(tenantId, sourcePath)` document is deleted
 * (chunks and full-text rows included) before the new rows are inserted.
 */
export interface KbStore {
  /** Stable string, unique among registered stores. */
  readonly id: string
  /** Cheap local usability check; must not perform I/O. */
  available(): boolean
  /**
   * Store one document and its chunks atomically, replacing any prior document
   * with the same `(tenantId, sourcePath)`.
   * @param doc - the document identity and citation metadata.
   * @param chunks - chunker output with embeddings (or `null` in degraded mode).
   * @param signal - cancellation signal honored between statements.
   * @returns the stored document id, chunk count, and whether embeddings landed.
   */
  putDocument(doc: KbDocumentInput, chunks: readonly KbChunkInput[], signal?: AbortSignal): Promise<KbIngestResult>
  /**
   * Delete one document by identity, cascading its chunks and full-text rows.
   * @param tenantId - owning tenant.
   * @param sourcePath - stable source identity.
   * @param signal - cancellation signal.
   * @returns whether a document was deleted.
   */
  deleteDocument(tenantId: string, sourcePath: string, signal?: AbortSignal): Promise<boolean>
  /**
   * Full-text search over chunk contents.
   * @param query - raw query text; the store owns tokenizer-appropriate matching.
   * @param tenantId - tenant filter; `undefined` searches across tenants.
   * @param k - maximum hits to return.
   * @param filter - optional document-kind restriction.
   * @param signal - cancellation signal.
   * @returns ranked hits with citation metadata.
   */
  textSearch(
    query: string,
    tenantId: string | undefined,
    k: number,
    filter: KbSearchFilter | undefined,
    signal?: AbortSignal,
  ): Promise<KbSearchHit[]>
  /**
   * Dense-vector search over stored embeddings.
   * @param vector - the query embedding.
   * @param tenantId - tenant filter; `undefined` searches across tenants.
   * @param k - maximum hits to return.
   * @param filter - optional document-kind restriction.
   * @param signal - cancellation signal.
   * @returns ranked hits with citation metadata.
   */
  vectorSearch(
    vector: Float32Array,
    tenantId: string | undefined,
    k: number,
    filter: KbSearchFilter | undefined,
    signal?: AbortSignal,
  ): Promise<KbSearchHit[]>
  /**
   * Count documents, chunks, and embedded chunks.
   * @param tenantId - tenant filter; `undefined` counts across tenants.
   * @param signal - cancellation signal.
   */
  stats(tenantId: string | undefined, signal?: AbortSignal): Promise<KbStoreStats>
  /**
   * Atomically add one operation's usage increments to a tenant's counters.
   * @param tenantId - owning tenant.
   * @param delta - the increments; omitted fields add zero.
   * @param signal - cancellation signal.
   */
  recordUsage(tenantId: string, delta: KbUsageDelta, signal?: AbortSignal): Promise<void>
  /**
   * Read one tenant's cumulative usage counters; a tenant with no recorded
   * usage reads as all zeros.
   * @param tenantId - owning tenant.
   * @param signal - cancellation signal.
   */
  usage(tenantId: string, signal?: AbortSignal): Promise<KbUsage>
}

/**
 * A text-embedding backend. Registered with
 * `ctx.kb.registerEmbedProvider`. An unavailable provider (for example a
 * missing credential) is the documented degraded-mode trigger: the seam keeps
 * running on text search alone.
 */
export interface EmbedProvider {
  /** Stable string, unique among registered embed providers. */
  readonly id: string
  /** Model identifier reported through stats and stored per chunk. */
  readonly modelId: string
  /** Vector dimensionality every result must match. */
  readonly dimensions: number
  /** Cheap local usability check (credential presence); must not perform I/O. */
  available(): boolean
  /**
   * Embed texts in order.
   * @param texts - non-empty batch of input texts.
   * @param signal - cancellation signal honored across batches and retries.
   * @returns one vector per input, each of length `dimensions`.
   */
  embed(texts: readonly string[], signal?: AbortSignal): Promise<Float32Array[]>
}

/** One ingest request through the seam: content plus document identity. */
export interface KbIngestRequest extends KbDocumentInput {
  /** Full UTF-8 document text; the seam chunks it before storage. */
  readonly content: string
}

/** Ingest outcome stored in and surfaced from the store. */
export interface KbIngestResult {
  readonly docId: number
  readonly chunks: number
  /** Whether any embedding was stored (false in degraded mode). */
  readonly embedded: boolean
  /** Embed identity covering the stored embeddings, when any. */
  readonly embedModel?: string
}

/** One hybrid-retrieval request through the seam. */
export interface KbSearchRequest {
  readonly query: string
  /** Tenant filter; `undefined` searches across tenants. */
  readonly tenantId?: string
  readonly docKind?: KbDocKind
  /** Result cap; defaults to the seam's `maxResults` config. */
  readonly maxResults?: number
}

/**
 * Hybrid-retrieval outcome. `mode` makes the degraded path observable:
 * `'text'` means no usable embed provider existed, so only the full-text path
 * ran.
 */
export interface KbSearchResult {
  readonly mode: 'hybrid' | 'text'
  /** Embed identity used for the query vector, in hybrid mode. */
  readonly embedModel?: string
  readonly results: readonly KbSearchHit[]
}
