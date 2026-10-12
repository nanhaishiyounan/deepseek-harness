/**
 * WeKnora store provider for the knowledge-base seam. Documents land in one
 * WeKnora knowledge base per `(tenant, category)` pair — the category is the
 * first segment of the document's source path — and identity round-trips
 * through the WeKnora document title as `[docKind] sourcePath`. A transport
 * failure (sidecar down) fails loud unless `allowFallback` is configured, in
 * which case an embedded fallback store serves the operation and every
 * returned hit carries a `notice` the seam hoists into the search result.
 * @module @deepseek-ai/dsh-kb-weknora/store
 */

import { KB_DOC_KINDS, KbError } from '@deepseek-ai/dsh-kb'
import type { KbChunkInput, KbDocumentInput, KbIngestResult, KbSearchFilter, KbSearchHit, KbStore, KbStoreStats, KbUsage, KbUsageDelta } from '@deepseek-ai/dsh-kb'
import { WeknoraApiError, WeknoraClient } from './client.ts'
import type { WeknoraClientOptions, WeknoraSearchHit } from './client.ts'

/** Logger surface the store uses for fallback transition logging. */
export interface WeknoraStoreLogger {
  warn(message: string): void
  info(message: string): void
}

/** Options for {@link WeknoraKbStore}. */
export interface WeknoraKbStoreOptions extends WeknoraClientOptions {
  /**
   * Serve operations from `fallbackStore` when the WeKnora sidecar is
   * unreachable (transport failure or HTTP 5xx). Rejected requests (4xx —
   * bad credential, bad scope) still fail loud: those are configuration
   * errors a fallback would hide. Defaults to `false`.
   */
  readonly allowFallback?: boolean | undefined
  /** Store used when degraded; also receives writes so the copy stays warm. */
  readonly fallbackStore?: KbStore | undefined
  /** Retrieval depth per knowledge base per path; defaults to 32. */
  readonly topK?: number | undefined
  /** Logger for degradation/recovery transitions. */
  readonly logger?: WeknoraStoreLogger | undefined
}

/** Store id registered on the kb seam. */
export const WEKNORA_STORE_ID = 'weknora'

/** Category used when a source path has no directory segment. */
const GENERAL_CATEGORY = 'general'

/** FNV-1a 32-bit hash as an unsigned int; WeKnora's string ids become the seam's numeric ids. */
function hash32(value: string): number {
  let hash = 0x811c9dc5
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }
  return hash >>> 0
}

/** Category segment of a source path: its first `/`-separated segment, or `general` for pathless names. */
function categoryOf(sourcePath: string): string {
  const slash = sourcePath.indexOf('/')
  if (slash === -1) return GENERAL_CATEGORY
  const head = sourcePath.slice(0, slash)
  return head.trim() === '' ? GENERAL_CATEGORY : head
}

/** Knowledge-base name for one tenant category: `tenant/category`. */
function kbNameFor(tenantId: string, category: string): string {
  return `${tenantId}/${category}`
}

/**
 * Encode the seam document identity into the WeKnora manual-entry title:
 * `[docKind] sourcePath`. The round trip is lossless for the fields the
 * citation protocol renders.
 */
function encodeTitle(doc: KbDocumentInput): string {
  return `[${doc.docKind}] ${doc.sourcePath}`
}

/** Decoded identity recovered from a WeKnora title. */
interface DecodedTitle {
  readonly docKind: string
  readonly sourcePath: string
}

/** Reverse {@link encodeTitle}; foreign titles decode with kind `other`. */
function decodeTitle(title: string): DecodedTitle {
  const match = /^\[([a-z]+)\] (.+)$/s.exec(title)
  const kind = match?.[1]
  const path = match?.[2]
  if (kind !== undefined && path !== undefined && (KB_DOC_KINDS as readonly string[]).includes(kind)) {
    // Oversized documents land as `path#2`, `path#3`… segments; the suffix is
    // transport, not identity — strip it so every segment cites one source.
    return { docKind: kind, sourcePath: path.replace(/#\d+$/, '') }
  }
  return { docKind: 'other', sourcePath: title }
}

/** Basename of a path, used as the display title of a hit. */
function basenameOf(path: string): string | undefined {
  const slash = path.lastIndexOf('/')
  const base = slash === -1 ? path : path.slice(slash + 1)
  return base === '' ? undefined : base
}

/** Split text into single Unicode code points (surrogate pairs kept whole). */
function codePoints(content: string): string[] {
  const points: string[] = []
  for (const point of content) points.push(point)
  return points
}

/**
 * The WeKnora kb store. See the module doc for the tenant/category mapping,
 * the title identity encoding, and the fallback contract.
 */
export class WeknoraKbStore implements KbStore {
  readonly id = WEKNORA_STORE_ID

  private readonly apiKey: string | undefined
  private readonly client: WeknoraClient
  private readonly allowFallback: boolean
  private readonly fallbackStore: KbStore | undefined
  private readonly topK: number
  private readonly logger: WeknoraStoreLogger | undefined
  private lastDegraded = false
  /**
   * The query of the in-flight seam retrieval: the seam always runs
   * `textSearch` before `vectorSearch` for one `kb.search` call, and
   * WeKnora's hybrid-search endpoint requires the raw query text, so the
   * text path hands it to the vector path through this slot.
   */
  private lastQueryText = ''

  /**
   * @param options - client options plus the fallback wiring.
   */
  constructor(options: WeknoraKbStoreOptions) {
    this.apiKey = options.apiKey
    this.client = new WeknoraClient(options)
    this.allowFallback = options.allowFallback ?? false
    this.fallbackStore = options.fallbackStore
    this.topK = options.topK ?? 32
    this.logger = options.logger
  }

  /** Local usability check: a non-blank API key is configured; no I/O. */
  available(): boolean {
    return this.apiKey !== undefined && this.apiKey.trim() !== ''
  }

  /** Log the degradation entry transition once, not per call. */
  private noteDegraded(reason: string): void {
    if (this.lastDegraded) return
    this.lastDegraded = true
    this.logger?.warn(`kb-weknora: WeKnora is unreachable (${reason}); serving from the fallback store`)
  }

  /** Log the recovery transition once. */
  private noteRecovered(): void {
    if (!this.lastDegraded) return
    this.lastDegraded = false
    this.logger?.info('kb-weknora: WeKnora is reachable again; primary retrieval resumed')
  }

  /**
   * Classify a WeKnora failure: transport failures and 5xx are degradable
   * outages; anything else (4xx) is a configuration error that must fail loud
   * even when a fallback is configured.
   */
  private isOutage(error: WeknoraApiError): boolean {
    return error.status === undefined || error.status >= 500
  }

  /**
   * Run one WeKnora operation with the fallback contract applied.
   * @param operation - label used in error messages.
   * @param run - the WeKnora-backed operation.
   * @param fallback - the fallback store's equivalent operation.
   * @returns whichever store served the operation.
   */
  private async withFallback<T>(operation: string, run: () => Promise<T>, fallback: (store: KbStore) => Promise<T>): Promise<T> {
    try {
      const value = await run()
      this.noteRecovered()
      return value
    } catch (error: unknown) {
      const { fallbackStore } = this
      if (error instanceof WeknoraApiError && this.isOutage(error) && this.allowFallback && fallbackStore !== undefined) {
        this.noteDegraded(error.message)
        return await fallback(fallbackStore)
      }
      if (error instanceof WeknoraApiError) {
        throw new KbError(`weknora ${operation} failed: ${error.message}`, 'KB_WEKNORA_UNAVAILABLE', { cause: error })
      }
      throw error
    }
  }

  /**
   * Resolve the knowledge-base id for one tenant category, creating the
   * knowledge base when it does not exist yet.
   * @param tenantId - owning tenant.
   * @param category - category segment.
   * @param signal - cancellation signal.
   * @returns the knowledge-base id.
   */
  private async resolveKbId(tenantId: string, category: string, signal: AbortSignal | undefined): Promise<string> {
    const name = kbNameFor(tenantId, category)
    const bases = await this.client.listKnowledgeBases(signal)
    const existing = bases.find(base => base.name === name)
    if (existing !== undefined) return existing.id
    const created = await this.client.createKnowledgeBase(name, signal)
    return created.id
  }

  /**
   * Store one document: the chunks are reassembled into one text (WeKnora
   * owns chunking and embedding), any prior entry with the same title is
   * deleted first, and the manual entry is created. `chunks` in the result is
   * the submitted chunk count — WeKnora re-chunks asynchronously, so the
   * stored count converges later.
   * @param doc - the document identity and citation metadata.
   * @param chunks - the seam's chunker output.
   * @param signal - cancellation signal.
   * @returns the ingest outcome.
   */
  async putDocument(doc: KbDocumentInput, chunks: readonly KbChunkInput[], signal?: AbortSignal): Promise<KbIngestResult> {
    return this.withFallback('ingest', async (): Promise<KbIngestResult> => {
      const category = categoryOf(doc.sourcePath)
      const kbId = await this.resolveKbId(doc.tenantId, category, signal)
      const title = encodeTitle(doc)
      for (const knowledge of await this.client.listDocuments(kbId, signal)) {
        if (knowledge.title !== undefined && decodeTitle(knowledge.title).sourcePath === doc.sourcePath) {
          await this.client.deleteKnowledge(knowledge.id, signal)
        }
      }
      const content = [...chunks]
        .sort((left, right) => left.chunkIdx - right.chunkIdx)
        .map(chunk => chunk.content)
        .join('\n\n')
      // WeKnora's manual endpoint caps one entry at 200k characters; longer
      // documents split into `path#N` segments (decodeTitle strips the suffix).
      const SEGMENT = 190_000
      const segments = [...Array(Math.ceil(codePoints(content).length / SEGMENT)).keys()]
      let firstKnowledgeId = ''
      for (const index of segments) {
        const segmentContent = codePoints(content).slice(index * SEGMENT, (index + 1) * SEGMENT).join('')
        const segmentTitle = index === 0 ? title : `${title}#${index + 1}`
        const knowledgeId = await this.client.createManualKnowledge(kbId, segmentTitle, segmentContent, signal)
        if (index === 0) firstKnowledgeId = knowledgeId
      }
      return { docId: hash32(firstKnowledgeId), chunks: chunks.length, embedded: true }
    }, store => store.putDocument(doc, chunks, signal))
  }

  /**
   * Delete one document by identity: locate the category's knowledge base,
   * find the entry whose title decodes to the same source path, delete it.
   * @param tenantId - owning tenant.
   * @param sourcePath - stable source identity.
   * @param signal - cancellation signal.
   * @returns whether a document was deleted.
   */
  async deleteDocument(tenantId: string, sourcePath: string, signal?: AbortSignal): Promise<boolean> {
    return this.withFallback('delete', async () => {
      const name = kbNameFor(tenantId, categoryOf(sourcePath))
      const bases = await this.client.listKnowledgeBases(signal)
      const base = bases.find(entry => entry.name === name)
      if (base === undefined) return false
      let deleted = false
      for (const knowledge of await this.client.listDocuments(base.id, signal)) {
        if (knowledge.title !== undefined && decodeTitle(knowledge.title).sourcePath === sourcePath) {
          await this.client.deleteKnowledge(knowledge.id, signal)
          deleted = true
        }
      }
      return deleted
    }, store => store.deleteDocument(tenantId, sourcePath, signal))
  }

  /** Knowledge-base ids of every category knowledge base of one tenant. */
  private async tenantKbIds(tenantId: string, signal: AbortSignal | undefined): Promise<string[]> {
    const prefix = `${tenantId}/`
    const bases = await this.client.listKnowledgeBases(signal)
    return bases.filter(base => base.name.startsWith(prefix)).map(base => base.id)
  }

  /**
   * Project one WeKnora retrieval hit into the seam's hit shape.
   * @param hit - the WeKnora hit.
   * @param tenantId - tenant the search was scoped to.
   */
  private static projectHit(hit: WeknoraSearchHit, tenantId: string): KbSearchHit {
    const rawTitle = typeof hit.knowledge_title === 'string' && hit.knowledge_title !== ''
      ? hit.knowledge_title
      : typeof hit.knowledge_filename === 'string' && hit.knowledge_filename !== ''
        ? hit.knowledge_filename
        : ''
    const decoded = decodeTitle(rawTitle)
    const knowledgeIdText = typeof hit.knowledge_id === 'string' ? hit.knowledge_id : ''
    const chunkIdxText = typeof hit.chunk_index === 'number' ? hit.chunk_index : 0
    const chunkUid = typeof hit.id === 'string' ? hit.id : `${knowledgeIdText}:${chunkIdxText}`
    const knowledgeId = typeof hit.knowledge_id === 'string' ? hit.knowledge_id : chunkUid
    const breadcrumb = typeof hit.breadcrumb === 'string' && hit.breadcrumb !== '' ? hit.breadcrumb : undefined
    const score = typeof hit.score === 'number' && Number.isFinite(hit.score) ? hit.score : undefined
    const title = basenameOf(decoded.sourcePath)
    return {
      chunkId: hash32(chunkUid),
      docId: hash32(knowledgeId),
      tenantId,
      sourcePath: decoded.sourcePath,
      ...(title === undefined ? {} : { title }),
      docKind: decoded.docKind as KbSearchHit['docKind'],
      chunkIdx: typeof hit.chunk_index === 'number' ? hit.chunk_index : 0,
      content: typeof hit.content === 'string' ? hit.content : '',
      ...(breadcrumb === undefined ? {} : { headingPath: breadcrumb }),
      ...(score === undefined ? {} : { score }),
    }
  }

  /**
   * Full-text path of the seam's hybrid retrieval: WeKnora's product-pipeline
   * search (hybrid recall plus rerank when configured) across the tenant's
   * knowledge bases.
   * @param query - raw query text.
   * @param tenantId - tenant filter; must be defined (the API key is tenant-bound).
   * @param k - maximum hits to return.
   * @param filter - optional document-kind restriction, applied after retrieval.
   * @param signal - cancellation signal.
   * @returns ranked hits with citation metadata.
   */
  async textSearch(
    query: string,
    tenantId: string | undefined,
    k: number,
    filter: KbSearchFilter | undefined,
    signal?: AbortSignal,
  ): Promise<KbSearchHit[]> {
    if (tenantId === undefined) {
      throw new KbError('the weknora store is tenant-bound; a tenant filter is required', 'KB_WEKNORA_TENANT_REQUIRED')
    }
    const fallback = (store: KbStore): Promise<KbSearchHit[]> => {
      return store.textSearch(query, tenantId, k, filter, signal).then(hits => hits.map(hit => (
        hit.notice === undefined ? { ...hit, notice: FALLBACK_NOTICE } : hit
      )))
    }
    return this.withFallback('search', async () => {
      const kbIds = await this.tenantKbIds(tenantId, signal)
      if (kbIds.length === 0) return []
      this.lastQueryText = query
      const hits = await this.client.knowledgeSearch(query, kbIds, Math.max(k, this.topK), signal)
      return hits
        .map(hit => WeknoraKbStore.projectHit(hit, tenantId))
        .filter(hit => filter === undefined || filter.docKind === undefined || hit.docKind === filter.docKind)
        .slice(0, k)
    }, fallback)
  }

  /**
   * Vector path of the seam's hybrid retrieval: WeKnora's low-level hybrid
   * recall per knowledge base with the pre-computed query embedding.
   * @param vector - the query embedding.
   * @param tenantId - tenant filter; must be defined.
   * @param k - maximum hits to return.
   * @param filter - optional document-kind restriction, applied after retrieval.
   * @param signal - cancellation signal.
   * @returns ranked hits with citation metadata.
   */
  async vectorSearch(
    vector: Float32Array,
    tenantId: string | undefined,
    k: number,
    filter: KbSearchFilter | undefined,
    signal?: AbortSignal,
  ): Promise<KbSearchHit[]> {
    if (tenantId === undefined) {
      throw new KbError('the weknora store is tenant-bound; a tenant filter is required', 'KB_WEKNORA_TENANT_REQUIRED')
    }
    const fallback = (store: KbStore): Promise<KbSearchHit[]> => {
      return store.vectorSearch(vector, tenantId, k, filter, signal).then(hits => hits.map(hit => (
        hit.notice === undefined ? { ...hit, notice: FALLBACK_NOTICE } : hit
      )))
    }
    return this.withFallback('vector search', async () => {
      const kbIds = await this.tenantKbIds(tenantId, signal)
      if (kbIds.length === 0) return []
      const depth = Math.max(k, this.topK)
      const queryText = this.lastQueryText
      this.lastQueryText = ''
      const perKb = await Promise.all(kbIds.map(kbId => this.client.hybridSearch(kbId, queryText, vector, depth, signal)))
      const hits = perKb.flat().map(hit => WeknoraKbStore.projectHit(hit, tenantId))
      const seen = new Set<number>()
      const unique: KbSearchHit[] = []
      for (const hit of hits) {
        if (seen.has(hit.chunkId)) continue
        seen.add(hit.chunkId)
        unique.push(hit)
      }
      return unique
        .filter(hit => filter === undefined || filter.docKind === undefined || hit.docKind === filter.docKind)
        .slice(0, k)
    }, fallback)
  }

  /**
   * Count documents across the tenant's knowledge bases. Chunks are not
   * counted: WeKnora chunks asynchronously and exposes no per-tenant chunk
   * total, so the chunk fields read zero.
   * @param tenantId - tenant filter; must be defined.
   * @param signal - cancellation signal.
   * @returns document count with zero chunk fields.
   */
  async stats(tenantId: string | undefined, signal?: AbortSignal): Promise<KbStoreStats> {
    if (tenantId === undefined) {
      throw new KbError('the weknora store is tenant-bound; a tenant filter is required', 'KB_WEKNORA_TENANT_REQUIRED')
    }
    return this.withFallback('stats', async () => {
      const prefix = `${tenantId}/`
      const bases = await this.client.listKnowledgeBases(signal)
      let documents = 0
      for (const base of bases) {
        if (!base.name.startsWith(prefix)) continue
        documents += base.knowledge_count ?? 0
      }
      return { documents, chunks: 0, embeddedChunks: 0 }
    }, store => store.stats(tenantId, signal))
  }

  /**
   * Usage metering is a no-op: WeKnora meters on its own audit surface and
   * the seam's counters have no WeKnora-side equivalent.
   * @param _tenantId - owning tenant (unused).
   * @param _delta - the increments (unused).
   * @param _signal - cancellation signal (unused).
   */
  async recordUsage(_tenantId: string, _delta: KbUsageDelta, _signal?: AbortSignal): Promise<void> {
    await Promise.resolve()
  }

  /**
   * Read one tenant's usage counters; WeKnora carries none, so all zeros.
   * @param _tenantId - owning tenant (unused).
   * @param _signal - cancellation signal (unused).
   * @returns all-zero counters.
   */
  async usage(_tenantId: string, _signal?: AbortSignal): Promise<KbUsage> {
    await Promise.resolve()
    return { searches: 0, ingestedDocuments: 0, ingestedChunks: 0, embedTexts: 0, embedTokens: 0 }
  }

  /**
   * Close the embedded fallback store, if one was wired.
   */
  close(): void {
    const fallback = this.fallbackStore as { close?: () => void } | undefined
    fallback?.close?.()
  }
}

/** Notice stamped on hits served by the fallback store. */
export const FALLBACK_NOTICE = 'WeKnora is unreachable; results come from the local fallback store'
