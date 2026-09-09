/**
 * Minimal NocoBase 2.x REST client: action-style list (`/api/<collection>:list`
 * with URL-encoded JSON filter and pagination), action-style create/update
 * (`POST /api/<collection>:create` and `/api/<collection>/<index>:update` —
 * the request body's top level IS the action's values; v2's resourcer never
 * unwraps a `{values}` envelope), REST-style get (`/api/<collection>/<index>`),
 * and the file-manager's multipart `attachments:upload`. Every JSON response
 * arrives `{data, ...}`-wrapped and is unwrapped here. All requests carry
 * `Authorization: Bearer <token>`. Timeouts combine with the caller's signal;
 * a network-level fetch failure retries once before surfacing. HTTP failures
 * carry the status and a body excerpt for loud, machine-routable diagnostics.
 * @module @deepseek-ai/dsh-connector-nocobase/client
 */

/** Client failure taxonomy: transport errors and non-2xx responses. */
export class NocoBaseError extends Error {
  constructor(
    message: string,
    readonly code: 'NOCOBASE_NETWORK_ERROR' | 'NOCOBASE_HTTP_ERROR',
    readonly status?: number,
  ) {
    super(message)
    this.name = 'NocoBaseError'
  }
}

/** Client construction options. */
export interface NocoBaseClientOptions {
  /** Server origin, for example `http://127.0.0.1:13000`. */
  readonly baseUrl: string
  /** Bearer API token (a NocoBase API key bound to a role). */
  readonly token: string
  /** Per-request timeout; defaults to 15000 ms. */
  readonly timeoutMs?: number
  /** Injectable fetch for tests; defaults to the global fetch. */
  readonly fetch?: typeof fetch
}

/** List options mapped onto the resourcer's query parameters. */
export interface NocoBaseListOptions {
  /** NocoBase filter tree, URL-encoded as JSON on the wire. */
  readonly filter?: Record<string, unknown>
  readonly page?: number
  readonly pageSize?: number
  /** Sort keys; a leading `-` is NocoBase's descending marker (comma-joined on the wire). */
  readonly sort?: readonly string[]
  /** Field projection; restricts the returned columns (comma-joined on the wire). */
  readonly fields?: readonly string[]
  /** Relation fields expanded into the returned rows (comma-joined on the wire). */
  readonly appends?: readonly string[]
}

/**
 * One collection definition as `collections:listMeta` serves it: the storage
 * semantics (name, fields, filterTargetKey) plus the display title. The
 * UI-oriented members of the server's answer (`interface`, `uiSchema`) are not
 * modeled — consumers of this type need schema facts, not UI configuration.
 */
export interface NocoBaseCollectionMeta {
  readonly name: string
  readonly title?: string
  readonly filterTargetKey?: string
  readonly hidden?: boolean
  readonly inherits?: string
  readonly fields?: readonly NocoBaseFieldMeta[]
}

/** One field definition inside a collection's meta. */
export interface NocoBaseFieldMeta {
  readonly name: string
  readonly type: string
  readonly title?: string
  /** Relation fields: the target collection's name. */
  readonly target?: string
  /** Relation fields: the foreign-key column on the owning side. */
  readonly foreignKey?: string
}

/** Paged list envelope NocoBase's list action returns. */
export interface NocoBaseListResult<Row> {
  readonly count: number
  readonly rows: Row[]
  readonly page: number
  readonly pageSize: number
}

/** Default per-request timeout. */
export const DEFAULT_NOCOBASE_TIMEOUT_MS = 15_000

/**
 * Unwrap one NocoBase i18n template title: system collections and fields carry
 * `{{t("Roles")}}`-style keys that the backend UI renders through its own
 * translator. Consumers without a translator display the inner key instead.
 * @param title - the raw title string from the NocoBase wire.
 * @returns the inner key for the template form, the title unchanged otherwise.
 */
export function unwrapNbTitle(title: string): string {
  const match = /^\{\{t\("([^"]+)"\)\}\}$/u.exec(title)
  return match?.[1] ?? title
}

/**
 * One uploaded attachment row as the file-manager's upload action returns it:
 * the server-assigned id plus the display metadata (filename, served url).
 */
export interface NocoBaseAttachmentRow {
  readonly id: number
  readonly title?: string
  readonly filename?: string
  readonly extname?: string
  readonly mimetype?: string
  readonly size?: number
  /** Storage-relative url the attachment is served under (for example `/storage/uploads/x.pdf`). */
  readonly url?: string
}

/** One request's observed shape, recorded for tests and diagnostics. */
export interface ObservedRequest {
  readonly method: string
  readonly path: string
  readonly query: URLSearchParams
  readonly authorization: string
}

/**
 * The REST client. One instance serves one NocoBase server and one token;
 * requests are stateless.
 */
export class NocoBaseClient {
  private readonly baseUrl: string
  private readonly token: string
  private readonly timeoutMs: number
  private readonly fetchImpl: typeof fetch
  /** Every request seen, in order — the test surface for wire-shape assertions. */
  readonly observed: ObservedRequest[] = []

  constructor(options: NocoBaseClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/+$/u, '')
    this.token = options.token
    this.timeoutMs = options.timeoutMs ?? DEFAULT_NOCOBASE_TIMEOUT_MS
    this.fetchImpl = options.fetch ?? fetch
  }

  /**
   * One raw request with timeout, single network retry, and loud HTTP errors.
   * @param method - HTTP method.
   * @param path - path under the server origin, including its query string.
   * @param body - JSON body for POST requests.
   * @param signal - caller cancellation, combined with the timeout.
   * @returns the decoded JSON body.
   */
  private async request(method: 'GET' | 'POST', path: string, body?: unknown, signal?: AbortSignal): Promise<unknown> {
    const url = `${this.baseUrl}${path}`
    const timed = AbortSignal.any([signal ?? new AbortController().signal, AbortSignal.timeout(this.timeoutMs)])
    const send = (): Promise<Response> => this.fetchImpl(url, {
      method,
      headers: { authorization: `Bearer ${this.token}`, ...(body === undefined ? {} : { 'content-type': 'application/json' }) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: timed,
    })
    let response: Response
    // The first attempt's transport error (connection reset, DNS blip) is
    // consumed by the retry itself; a second consecutive failure surfaces.
    try {
      response = await send()
    } catch {
      try {
        response = await send()
      } catch (retryError: unknown) {
        throw new NocoBaseError(
          `request to ${path} failed at the transport layer: ${retryError instanceof Error ? retryError.message : String(retryError)}`,
          'NOCOBASE_NETWORK_ERROR',
        )
      }
    }
    if (!response.ok) {
      /* v8 ignore next 1 -- reading a fully-buffered text body no longer fails in practice. */
      const body = await response.text().catch(() => '')
      throw new NocoBaseError(
        `${method} ${path} returned HTTP ${response.status}: ${body.slice(0, 200)}`,
        'NOCOBASE_HTTP_ERROR',
        response.status,
      )
    }
    return response.json()
  }

  /** Record one served request (callers pass bare paths; query parameters attach after) for wire-shape assertions. */
  private observe(method: string, path: string): URLSearchParams {
    const search = new URLSearchParams()
    this.observed.push({ method, path, query: search, authorization: `Bearer ${this.token}` })
    return search
  }

  /**
   * List one collection's rows. The v2 wire answers `{data: rows, meta: {count,
   * page, pageSize, totalPage}}`; the paged envelope is reassembled from it.
   * @param collection - collection name (for example `experts`).
   * @param options - filter tree and pagination.
   * @param signal - caller cancellation.
   * @returns the paged envelope.
   */
  async list<Row>(collection: string, options: NocoBaseListOptions, signal?: AbortSignal): Promise<NocoBaseListResult<Row>> {
    const query = this.observe('GET', `/api/${collection}:list`)
    if (options.filter !== undefined) query.set('filter', JSON.stringify(options.filter))
    if (options.page !== undefined) query.set('page', String(options.page))
    if (options.pageSize !== undefined) query.set('pageSize', String(options.pageSize))
    if (options.sort !== undefined && options.sort.length > 0) query.set('sort', options.sort.join(','))
    if (options.fields !== undefined && options.fields.length > 0) query.set('fields', options.fields.join(','))
    if (options.appends !== undefined && options.appends.length > 0) query.set('appends', options.appends.join(','))
    const body = await this.request('GET', `/api/${collection}:list?${query.toString()}`, undefined, signal) as { data?: unknown; meta?: { count?: unknown; page?: unknown; pageSize?: unknown } } | null
    if (body === null || typeof body !== 'object' || !Array.isArray(body.data)) {
      throw new NocoBaseError(`list ${collection} returned no data array`, 'NOCOBASE_HTTP_ERROR')
    }
    const rows = body.data as Row[]
    return {
      count: typeof body.meta?.count === 'number' ? body.meta.count : rows.length,
      rows,
      page: typeof body.meta?.page === 'number' ? body.meta.page : 1,
      pageSize: typeof body.meta?.pageSize === 'number' ? body.meta.pageSize : rows.length,
    }
  }

  /**
   * Get one row by its primary key. The v2 wire answers a missing row with
   * HTTP 200 and `{data: null}` — never a 404 — so absence resolves to
   * `undefined` here.
   * @param collection - collection name.
   * @param index - row primary key.
   * @param options - optional relation fields to append into the returned row.
   * @param signal - caller cancellation.
   * @returns the row object, or `undefined` when the collection has no such row.
   */
  async get<Row>(
    collection: string,
    index: string | number,
    options?: { appends?: readonly string[] },
    signal?: AbortSignal,
  ): Promise<Row | undefined> {
    const query = this.observe('GET', `/api/${collection}/${index}`)
    if (options?.appends !== undefined && options.appends.length > 0) query.set('appends', options.appends.join(','))
    const body = await this.request('GET', `/api/${collection}/${index}?${query.toString()}`, undefined, signal) as { data?: unknown } | null
    return (body === null || typeof body !== 'object' || body.data === null) ? undefined : body.data as Row
  }

  /**
   * List every runtime collection definition through the data-source
   * manager's `collections:listMeta` action: one unpaginated answer whose
   * `data` array carries each collection's storage semantics and display
   * title. This is the schema-discovery surface business-tool and BFF
   * consumers project onto their own views.
   * @param signal - caller cancellation.
   * @returns every collection definition the server reports.
   */
  async listMeta(signal?: AbortSignal): Promise<readonly NocoBaseCollectionMeta[]> {
    this.observe('GET', '/api/collections:listMeta')
    const body = await this.request('GET', '/api/collections:listMeta', undefined, signal) as { data?: unknown } | null
    if (body === null || typeof body !== 'object' || !Array.isArray(body.data)) {
      throw new NocoBaseError('collections:listMeta returned no data array', 'NOCOBASE_HTTP_ERROR')
    }
    return body.data as NocoBaseCollectionMeta[]
  }

  /**
   * Create one row through the resourcer's create action. The request body's
   * top level IS the action's values (v2's resourcer never unwraps a
   * `{values}` envelope — a wrapped body would store a literal `values`
   * field); the server assigns the primary key and returns the stored row
   * inside the standard `data` wrapper.
   * @param collection - collection name (for example `experts`).
   * @param values - the new row's fields (no `id`).
   * @param signal - caller cancellation.
   * @returns the stored row, server-assigned id included.
   */
  async create<Row extends object>(collection: string, values: Row, signal?: AbortSignal): Promise<Row & { id: number }> {
    this.observe('POST', `/api/${collection}:create`)
    const body = await this.request('POST', `/api/${collection}:create`, values, signal) as { data?: unknown }
    return body.data as Row & { id: number }
  }

  /**
   * Patch one row through the resourcer's update action addressed by the
   * `filterByTk` query parameter (the v1-style `/<index>:update` path is not
   * registered in v2). The request body's top level IS the changed fields
   * (same rule as create); the server answers `{data: [row]}` and the first
   * element is the stored row after the merge.
   * @param collection - collection name (for example `orders`).
   * @param index - row primary key.
   * @param values - the fields to change (no `id`).
   * @param signal - caller cancellation.
   * @returns the stored row after the merge, id included.
   */
  async update<Row extends object>(
    collection: string,
    index: string | number,
    values: Partial<Row>,
    signal?: AbortSignal,
  ): Promise<Row & { id: number }> {
    const query = this.observe('POST', `/api/${collection}:update`)
    query.set('filterByTk', String(index))
    const body = await this.request('POST', `/api/${collection}:update?${query.toString()}`, values, signal) as { data?: unknown }
    const rows = body.data
    return (Array.isArray(rows) ? rows[0] : rows) as Row & { id: number }
  }

  /**
   * Upload one file as a NocoBase attachment through the file-manager's
   * multipart `attachments:upload` action (form field `file`). The same
   * timeout, single network retry, and loud HTTP-error semantics as the JSON
   * requests apply; the boundary is left to the runtime FormData serializer.
   * @param filename - the attachment's filename, for example `ORD-1.pdf`.
   * @param bytes - the file bytes.
   * @param mimeType - the file's media type; defaults to `application/pdf`.
   * @param signal - caller cancellation.
   * @returns the stored attachment row, server-assigned id and served url included.
   */
  async upload(
    filename: string,
    bytes: Uint8Array,
    mimeType?: string,
    signal?: AbortSignal,
  ): Promise<NocoBaseAttachmentRow> {
    this.observe('POST', '/api/attachments:upload')
    const url = `${this.baseUrl}/api/attachments:upload`
    const timed = AbortSignal.any([signal ?? new AbortController().signal, AbortSignal.timeout(this.timeoutMs)])
    const form = new FormData()
    // Copy into a fresh ArrayBuffer-backed view: BlobPart rejects a
    // SharedArrayBuffer-backed view, and the copy is trivial next to the upload.
    form.append('file', new Blob([new Uint8Array(bytes)], { type: mimeType ?? 'application/pdf' }), filename)
    const send = (): Promise<Response> => fetch(url, {
      method: 'POST',
      headers: { authorization: `Bearer ${this.token}` },
      body: form,
      signal: timed,
    })
    let response: Response
    try {
      response = await send()
    } catch {
      try {
        response = await send()
      } catch (retryError: unknown) {
        throw new NocoBaseError(
          `request to /api/attachments:upload failed at the transport layer: ${retryError instanceof Error ? retryError.message : String(retryError)}`,
          'NOCOBASE_NETWORK_ERROR',
        )
      }
    }
    if (!response.ok) {
      /* v8 ignore next 1 -- reading a fully-buffered text body no longer fails in practice. */
      const body = await response.text().catch(() => '')
      throw new NocoBaseError(
        `POST /api/attachments:upload returned HTTP ${response.status}: ${body.slice(0, 200)}`,
        'NOCOBASE_HTTP_ERROR',
        response.status,
      )
    }
    const body = await response.json() as { data?: unknown }
    return body.data as NocoBaseAttachmentRow
  }
}
