/**
 * Minimal REST client for a WeKnora v0.8.2 sidecar: the eight endpoints the
 * kb provider needs (health, knowledge-base list/create, document list,
 * manual create, document delete, knowledge-search, hybrid-search). Errors
 * carry the HTTP status when one arrived, so callers can tell a transport
 * failure (no status) from a rejected request (4xx/5xx).
 * @module @deepseek-ai/dsh-kb-weknora/client
 */

/** Options for {@link WeknoraClient}. */
export interface WeknoraClientOptions {
  /** WeKnora app origin, for example `http://localhost:18081` (no `/api/v1` suffix). */
  readonly baseUrl: string
  /** Scoped API key sent as `X-API-Key`; required by every API endpoint. */
  readonly apiKey?: string | undefined
  /** Fetch implementation; defaults to the global one. Tests inject a stub here. */
  readonly fetch?: typeof fetch | undefined
  /** Per-request timeout in milliseconds; defaults to 15,000. */
  readonly timeoutMs?: number | undefined
}

/** One WeKnora knowledge base as returned by the list/create endpoints. */
export interface WeknoraKnowledgeBase {
  readonly id: string
  readonly name: string
  readonly knowledge_count?: number
}

/** One WeKnora document (knowledge entry) inside a knowledge base. */
export interface WeknoraKnowledge {
  readonly id: string
  readonly title?: string
  readonly file_name?: string
}

/**
 * Error from a WeKnora HTTP call. `status` is set for HTTP responses and
 * `undefined` for transport failures (DNS, connection refused, timeout), the
 * distinction the fallback chain keys on.
 */
export class WeknoraApiError extends Error {
  /** HTTP status code, or `undefined` when the request never got a response. */
  readonly status: number | undefined

  /**
   * @param message - human-readable failure description.
   * @param status - HTTP status when a response arrived; omit for transport failures.
   */
  constructor(message: string, status?: number) {
    super(message)
    this.name = 'WeknoraApiError'
    this.status = status
  }
}

/** Default per-request timeout. */
export const DEFAULT_REQUEST_TIMEOUT_MS = 15_000

/** Page size used when walking a knowledge base's document list. */
export const DOCUMENT_PAGE_SIZE = 100

/**
 * One retrieval hit from knowledge-search / hybrid-search. The API ships a
 * wide JSON object; consumers narrow the fields they read.
 */
export type WeknoraSearchHit = Record<string, unknown>

/** Combine the caller's signal with the per-request timeout into one signal. */
function withTimeout(signal: AbortSignal | undefined, timeoutMs: number): { signal: AbortSignal; done: () => void } {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(new DOMException('WeKnora request timed out', 'TimeoutError')), timeoutMs)
  const forward = (): void => controller.abort(signal?.reason)
  if (signal !== undefined) {
    if (signal.aborted) forward()
    else signal.addEventListener('abort', forward, { once: true })
  }
  return {
    signal: controller.signal,
    done: () => {
      clearTimeout(timer)
      signal?.removeEventListener('abort', forward)
    },
  }
}

/**
 * REST client bound to one WeKnora deployment. Stateless across calls; safe
 * to share. Every non-2xx response and every transport failure throws
 * {@link WeknoraApiError}.
 */
export class WeknoraClient {
  private readonly baseUrl: string
  private readonly apiKey: string | undefined
  private readonly fetchImpl: typeof fetch
  private readonly timeoutMs: number

  /**
   * @param options - base URL, API key, fetch implementation, timeout.
   */
  constructor(options: WeknoraClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/+$/, '')
    this.apiKey = options.apiKey
    this.fetchImpl = options.fetch ?? fetch
    this.timeoutMs = options.timeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS
  }

  /**
   * Issue one JSON request against the API root and return the response body.
   * @param method - HTTP method.
   * @param path - path under `/api/v1`, starting with `/`.
   * @param body - JSON-serializable request body, or `undefined` for none.
   * @param signal - cancellation signal.
   * @returns the parsed response body.
   */
  private async request(method: string, path: string, body?: unknown, signal?: AbortSignal): Promise<unknown> {
    const timeout = withTimeout(signal, this.timeoutMs)
    let response: Response
    try {
      response = await this.fetchImpl(`${this.baseUrl}/api/v1${path}`, {
        method,
        headers: {
          ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
          ...(this.apiKey === undefined ? {} : { 'X-API-Key': this.apiKey }),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        signal: timeout.signal,
      })
    } catch (cause: unknown) {
      throw new WeknoraApiError(
        `${method} ${path} failed before a response arrived (${cause instanceof Error ? cause.message : String(cause)})`,
      )
    } finally {
      timeout.done()
    }
    if (!response.ok) {
      const detail = (await response.text()).slice(0, 200)
      throw new WeknoraApiError(`${method} ${path} returned HTTP ${response.status}: ${detail}`, response.status)
    }
    const text = await response.text()
    return text === '' ? {} : JSON.parse(text) as unknown
  }

  /**
   * Probe the sidecar's liveness endpoint (no `/api/v1` prefix, no auth).
   * @param signal - cancellation signal.
   * @returns whether the endpoint answered with a 2xx status.
   */
  async healthy(signal?: AbortSignal): Promise<boolean> {
    const timeout = withTimeout(signal, this.timeoutMs)
    try {
      const response = await this.fetchImpl(`${this.baseUrl}/health`, { signal: timeout.signal })
      return response.ok
    } catch {
      return false
    } finally {
      timeout.done()
    }
  }

  /**
   * Read the `data` array out of a WeKnora `{success, data}` envelope.
   * @param envelope - parsed response body.
   * @returns the array the endpoint shipped.
   */
  private dataArray(envelope: unknown): unknown[] {
    if (Array.isArray(envelope)) return envelope
    if (typeof envelope === 'object' && envelope !== null && Array.isArray((envelope as { data?: unknown }).data)) {
      return (envelope as { data: unknown[] }).data
    }
    return []
  }

  /**
   * List every knowledge base the credential can see.
   * @param signal - cancellation signal.
   * @returns the knowledge bases, id and name first of all.
   */
  async listKnowledgeBases(signal?: AbortSignal): Promise<WeknoraKnowledgeBase[]> {
    const envelope = await this.request('GET', '/knowledge-bases', undefined, signal)
    return this.dataArray(envelope).flatMap((entry): WeknoraKnowledgeBase[] => {
      if (typeof entry !== 'object' || entry === null) return []
      const record = entry as Record<string, unknown>
      const id = record.id
      const name = record.name
      if (typeof id !== 'string' || typeof name !== 'string') return []
      const knowledgeCount = record.knowledge_count
      return [{
        id,
        name,
        ...(typeof knowledgeCount === 'number' ? { knowledge_count: knowledgeCount } : {}),
      }]
    })
  }

  /**
   * Create one knowledge base.
   * @param name - unique knowledge-base name.
   * @param signal - cancellation signal.
   * @returns the created knowledge base.
   */
  async createKnowledgeBase(name: string, signal?: AbortSignal): Promise<WeknoraKnowledgeBase> {
    const envelope = await this.request('POST', '/knowledge-bases', { name }, signal)
    const record = (typeof envelope === 'object' && envelope !== null ? envelope : {}) as Record<string, unknown>
    const data = (typeof record.data === 'object' && record.data !== null ? record.data : record) as Record<string, unknown>
    const id = data.id
    if (typeof id !== 'string') {
      throw new WeknoraApiError('POST /knowledge-bases response carried no knowledge base id')
    }
    return { id, name: typeof data.name === 'string' ? data.name : name }
  }

  /**
   * List one knowledge base's documents, walking every page.
   * @param kbId - knowledge base id.
   * @param signal - cancellation signal.
   * @returns every document in the knowledge base.
   */
  async listDocuments(kbId: string, signal?: AbortSignal): Promise<WeknoraKnowledge[]> {
    const documents: WeknoraKnowledge[] = []
    for (let page = 1; ; page += 1) {
      const envelope = await this.request('GET',
        `/knowledge-bases/${encodeURIComponent(kbId)}/knowledge?page=${page}&page_size=${DOCUMENT_PAGE_SIZE}`, undefined, signal)
      const entries = this.dataArray(envelope).flatMap((entry): WeknoraKnowledge[] => {
        if (typeof entry !== 'object' || entry === null) return []
        const record = entry as Record<string, unknown>
        const id = record.id
        if (typeof id !== 'string') return []
        const title = record.title
        const fileName = record.file_name
        return [{
          id,
          ...(typeof title === 'string' ? { title } : {}),
          ...(typeof fileName === 'string' ? { file_name: fileName } : {}),
        }]
      })
      documents.push(...entries)
      if (entries.length < DOCUMENT_PAGE_SIZE) return documents
    }
  }

  /**
   * Create one manual knowledge entry; WeKnora re-chunks and embeds it
   * asynchronously after the call returns.
   * @param kbId - knowledge base id.
   * @param title - entry title (the provider encodes identity here).
   * @param content - full document text.
   * @param signal - cancellation signal.
   * @returns the created knowledge id.
   */
  async createManualKnowledge(kbId: string, title: string, content: string, signal?: AbortSignal): Promise<string> {
    const envelope = await this.request('POST',
      `/knowledge-bases/${encodeURIComponent(kbId)}/knowledge/manual`, { title, content, status: 'publish' }, signal)
    const record = (typeof envelope === 'object' && envelope !== null ? envelope : {}) as Record<string, unknown>
    const data = (typeof record.data === 'object' && record.data !== null ? record.data : record) as Record<string, unknown>
    const id = data.id
    if (typeof id !== 'string') {
      throw new WeknoraApiError('POST .../knowledge/manual response carried no knowledge id')
    }
    return id
  }

  /**
   * Delete one knowledge entry.
   * @param knowledgeId - knowledge entry id.
   * @param signal - cancellation signal.
   */
  async deleteKnowledge(knowledgeId: string, signal?: AbortSignal): Promise<void> {
    await this.request('DELETE', `/knowledge/${encodeURIComponent(knowledgeId)}`, undefined, signal)
  }

  /**
   * Run the product-pipeline retrieval (hybrid recall, rerank when the tenant
   * configures one) across a set of knowledge bases.
   * @param query - raw query text.
   * @param kbIds - knowledge base ids to search; must be non-empty.
   * @param matchCount - maximum hits to return.
   * @param signal - cancellation signal.
   * @returns the retrieval hits.
   */
  async knowledgeSearch(query: string, kbIds: readonly string[], matchCount: number, signal?: AbortSignal): Promise<WeknoraSearchHit[]> {
    const envelope = await this.request('POST', '/knowledge-search', {
      query,
      knowledge_base_ids: [...kbIds],
      match_count: matchCount,
    }, signal)
    return this.dataArray(envelope).filter((entry): entry is Record<string, unknown> => typeof entry === 'object' && entry !== null)
  }

  /**
   * Run the low-level hybrid recall for one knowledge base (no rerank stage).
   * v0.8.2 requires `query_text`; `query_embedding` rides along as the
   * pre-computed vector so the recall skips re-embedding the query.
   * @param kbId - knowledge base id.
   * @param queryText - raw query text (required by the endpoint).
   * @param queryEmbedding - query vector, element type float.
   * @param topK - maximum hits to return.
   * @param signal - cancellation signal.
   * @returns the retrieval hits.
   */
  async hybridSearch(
    kbId: string,
    queryText: string,
    queryEmbedding: Float32Array,
    topK: number,
    signal?: AbortSignal,
  ): Promise<WeknoraSearchHit[]> {
    const envelope = await this.request('POST', `/knowledge-bases/${encodeURIComponent(kbId)}/hybrid-search`, {
      query_text: queryText,
      query_embedding: Array.from(queryEmbedding),
      top_k: topK,
    }, signal)
    return this.dataArray(envelope).filter((entry): entry is Record<string, unknown> => typeof entry === 'object' && entry !== null)
  }
}
