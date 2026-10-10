/**
 * Carbon PostgREST Data API session client: GoTrue password grant exchanges
 * email/password for a 1h JWT (plus a long-lived refresh token), every request
 * carries the double header (`apikey` + `Authorization: Bearer`), and the
 * session refreshes itself ahead of expiry through the refresh grant — falling
 * back to a fresh password grant when the refresh token no longer satisfies
 * the server. INSERT bodies gain the tenant `companyId` automatically (the
 * RLS `WITH CHECK` stays the enforcement floor), and row-level-security
 * rejections surface as `CarbonError` with the structured
 * `CARBON_RLS_VIOLATION` code carrying the server's `{code, message, hint}`
 * body. Table names are camelCase (`/rest/v1/salesOrder`); primary keys are
 * prefixed strings (`item_WgSb…`), never numbers.
 * @module @deepseek-ai/dsh-connector-carbon/client
 */

/** Client failure taxonomy: transport errors, auth rejections, HTTP errors, and RLS violations. */
export class CarbonError extends Error {
  constructor(
    message: string,
    readonly code:
      | 'CARBON_NETWORK_ERROR'
      | 'CARBON_AUTH_REJECTED'
      | 'CARBON_HTTP_ERROR'
      | 'CARBON_RLS_VIOLATION',
    readonly status?: number,
    /** The decoded JSON error body when one was present (PostgREST/GoTrue shape). */
    readonly body?: Record<string, unknown>,
  ) {
    super(message)
    this.name = 'CarbonError'
  }
}

/** Client construction options. */
export interface CarbonClientOptions {
  /** Kong gateway origin, for example `http://127.0.0.1:54321` (the API entrypoint of the carbon stack). */
  readonly baseUrl: string
  /** The stack's GoTrue anon key; rides the `apikey` header on every request. */
  readonly anonKey: string
  /** GoTrue login (email form; the dev stack seeds `test@carbon.ms`). */
  readonly email: string
  /** GoTrue login password. */
  readonly password: string
  /** Per-request timeout; defaults to 15000 ms. */
  readonly timeoutMs?: number
  /** Refresh this long before JWT expiry; defaults to 120000 ms. */
  readonly refreshSkewMs?: number
  /** Injectable fetch for tests; defaults to the global fetch. */
  readonly fetch?: typeof fetch
}

/** One live GoTrue session. `expiresAtMs` is epoch milliseconds. */
export interface CarbonSession {
  readonly accessToken: string
  readonly refreshToken: string
  readonly expiresAtMs: number
  /** The GoTrue user id (JWT `sub`). */
  readonly userId: string
  readonly email: string
}

/** One restricted filter condition (the vocabulary the cb_* tools and the wire RPC accept). */
export interface CarbonFilterCondition {
  readonly field: string
  readonly op: 'eq' | 'neq' | 'gt' | 'lt' | 'gte' | 'lte' | 'like' | 'ilike' | 'in' | 'is'
  /** Scalar for the comparison ops; `true`/`false`/`null` for is; a non-empty array for in; a wildcard pattern for like/ilike. */
  readonly value: string | number | boolean | null | readonly (string | number | boolean)[]
}

/** List options mapped onto PostgREST query parameters. */
export interface CarbonListOptions {
  /** Restricted conditions; `and`-joined on the wire (PostgREST same-column params intersect). */
  readonly filter?: readonly CarbonFilterCondition[]
  /** Sort keys in `column` / `column.desc` form. */
  readonly order?: readonly string[]
  /** Row ceiling; PostgREST caps at the server config, the client stays defensive. */
  readonly limit?: number
  /** Row offset. */
  readonly offset?: number
  /** Column projection (comma-joined `select`); omitted selects everything. */
  readonly select?: readonly string[]
}

/** Paged list result; `count` comes from the exact-count `Prefer` header. */
export interface CarbonListResult<Row> {
  readonly count: number
  readonly rows: Row[]
}

/** Default per-request timeout. */
export const DEFAULT_CARBON_TIMEOUT_MS = 15_000

/** Default refresh lead time before JWT expiry. */
export const DEFAULT_CARBON_REFRESH_SKEW_MS = 120_000

/** Upper bound the client clamps a list `limit` to. */
export const CARBON_LIST_MAX_LIMIT = 1000

/**
 * Quote one PostgREST in-list member: bare tokens stay bare, everything with
 * whitespace, commas, or parens gains double quotes (escaping inner quotes).
 * @param value - the member to serialize.
 * @returns the wire form.
 */
function quoteInMember(value: string | number | boolean): string {
  const text = String(value)
  return /^[\w.-]+$/u.test(text) ? text : `"${text.replaceAll('"', '\\"')}"`
}

/**
 * Serialize one condition onto its PostgREST query entry.
 * @param condition - the validated condition.
 * @returns the `[key, value]` pair, or `undefined` for the array form (the caller spreads `in`).
 */
function compileCondition(condition: CarbonFilterCondition): [string, string] | undefined {
  const { field, op, value } = condition
  switch (op) {
    case 'in': {
      const members = Array.isArray(value) ? value : [value]
      if (members.length === 0) throw new Error(`carbon filter: in on ${field} needs a non-empty value array`)
      return [field, `in.(${members.map(quoteInMember).join(',')})`]
    }
    case 'is':
      if (value !== null && value !== true && value !== false) {
        throw new Error(`carbon filter: is on ${field} accepts null/true/false only`)
      }
      return [field, `is.${String(value)}`]
    case 'like':
    case 'ilike': {
      if (typeof value !== 'string') throw new Error(`carbon filter: ${op} on ${field} accepts a string pattern`)
      // PostgREST patterns wrap in * — the value's own asterisks ride through.
      return [field, `${op}.*${value}`]
    }
    default:
      if (value === null || Array.isArray(value)) {
        throw new Error(`carbon filter: ${op} on ${field} accepts a scalar`)
      }
      return [field, `${op}.${String(value)}`]
  }
}

/**
 * Compile the restricted conditions into PostgREST query parameters. The
 * vocabulary is closed; values are scalars, wildcard patterns, or in-lists —
 * never free SQL.
 * @param filter - the conditions.
 * @returns URL search parameters (repeatable keys preserved).
 */
export function compileCarbonFilter(filter: readonly CarbonFilterCondition[]): URLSearchParams {
  const params = new URLSearchParams()
  for (const condition of filter) {
    const entry = compileCondition(condition)
    if (entry !== undefined) params.append(entry[0], entry[1])
  }
  return params
}

/** The decoded GoTrue token response. */
interface GotrueTokenResponse {
  access_token: string
  refresh_token: string
  expires_in: number
  user?: { id?: string; email?: string }
}

/** The decoded PostgREST error body. */
interface PostgrestErrorBody {
  code?: string
  message?: string
  details?: string | null
  hint?: string | null
}

/**
 * The session client. One instance serves one carbon stack and one service
 * account; every data call resolves a live session first, so the 1h JWT
 * lifetime is invisible to callers.
 */
export class CarbonClient {
  private readonly baseUrl: string
  private readonly anonKey: string
  private readonly email: string
  private readonly password: string
  private readonly timeoutMs: number
  private readonly refreshSkewMs: number
  private readonly fetchImpl: typeof fetch
  private session: CarbonSession | undefined
  private inflight: Promise<CarbonSession> | undefined
  private cachedCompanyId: string | undefined

  constructor(options: CarbonClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/+$/u, '')
    this.anonKey = options.anonKey
    this.email = options.email
    this.password = options.password
    this.timeoutMs = options.timeoutMs ?? DEFAULT_CARBON_TIMEOUT_MS
    this.refreshSkewMs = options.refreshSkewMs ?? DEFAULT_CARBON_REFRESH_SKEW_MS
    this.fetchImpl = options.fetch ?? fetch
  }

  /**
   * Exchange email/password for a fresh session (password grant).
   * @param signal - caller cancellation.
   * @returns the live session.
   */
  async authenticate(signal?: AbortSignal): Promise<CarbonSession> {
    const body = await this.gotrue('password', this.password, signal)
    this.adopt(body)
    return this.ensureAdopted()
  }

  /**
   * Resolve a live session, refreshing ahead of expiry. Concurrent callers
   * share one in-flight grant round.
   * @param signal - caller cancellation.
   * @returns the live session.
   */
  async ensureSession(signal?: AbortSignal): Promise<CarbonSession> {
    const now = Date.now()
    if (this.session !== undefined && this.session.expiresAtMs - this.refreshSkewMs > now) return this.session
    this.inflight ??= (async () => {
      try {
        if (this.session === undefined) return await this.authenticate(signal)
        try {
          const body = await this.gotrue('refresh_token', this.session.refreshToken, signal)
          this.adopt(body)
          return this.ensureAdopted()
        } catch {
          // Any refresh rejection — a consumed token, a rotation mismatch, a
          // server-side purge — falls back to the password grant, the
          // long-lived programmatic session the B0 verdict validated. A
          // password rejection then escalates from `authenticate` itself.
          return await this.authenticate(signal)
        }
      } finally {
        this.inflight = undefined
      }
    })()
    return this.inflight
  }

  /** Narrow to the just-adopted session (the grant callbacks set it immediately). */
  private ensureAdopted(): CarbonSession {
    if (this.session === undefined) throw new CarbonError('carbon session missing after grant', 'CARBON_AUTH_REJECTED')
    return this.session
  }

  /** Adopt one GoTrue token response as the live session. */
  private adopt(body: GotrueTokenResponse): void {
    this.session = {
      accessToken: body.access_token,
      refreshToken: body.refresh_token,
      // `expires_in` is seconds from the response, not an absolute epoch.
      expiresAtMs: Date.now() + body.expires_in * 1000,
      userId: body.user?.id ?? '',
      email: body.user?.email ?? this.email,
    }
  }

  /**
   * One GoTrue token grant round.
   * @param grantType - `password` or `refresh_token`.
   * @param credential - the password or the refresh token.
   * @param signal - caller cancellation.
   * @returns the decoded token response.
   */
  private async gotrue(grantType: 'password' | 'refresh_token', credential: string, signal?: AbortSignal): Promise<GotrueTokenResponse> {
    const timeout = AbortSignal.timeout(this.timeoutMs)
    const composed = signal === undefined ? timeout : AbortSignal.any([signal, timeout])
    let response: Response
    try {
      response = await this.fetchImpl(`${this.baseUrl}/auth/v1/token?grant_type=${grantType}`, {
        method: 'POST',
        headers: { apikey: this.anonKey, 'content-type': 'application/json' },
        body: JSON.stringify(grantType === 'password' ? { email: this.email, password: credential } : { refresh_token: credential }),
        signal: composed,
      })
    } catch (cause) {
      throw new CarbonError(`carbon auth unreachable (${grantType}): ${cause instanceof Error ? cause.message : String(cause)}`, 'CARBON_NETWORK_ERROR')
    }
    if (!response.ok) {
      const text = await response.text().catch(() => '')
      throw new CarbonError(`carbon auth rejected (${grantType}, HTTP ${response.status}): ${text.slice(0, 200)}`, 'CARBON_AUTH_REJECTED', response.status)
    }
    return await response.json() as GotrueTokenResponse
  }

  /**
   * One authorized data request. The double header (`apikey` + session
   * bearer) rides every call; a 401 mid-session re-authenticates once (the
   * server may have rotated keys under us) before surfacing.
   * @param method - HTTP method.
   * @param path - path under the gateway origin (including its query string).
   * @param options - body, prefer header, cancellation.
   * @returns the raw response (the caller decodes).
   */
  private async dataRequest(
    method: string,
    path: string,
    options: { body?: unknown; prefer?: string; signal?: AbortSignal | undefined; retried?: boolean } = {},
  ): Promise<Response> {
    const session = await this.ensureSession(options.signal)
    const timeout = AbortSignal.timeout(this.timeoutMs)
    const composed = options.signal === undefined ? timeout : AbortSignal.any([options.signal, timeout])
    const headers: Record<string, string> = {
      apikey: this.anonKey,
      authorization: `Bearer ${session.accessToken}`,
    }
    if (options.body !== undefined) headers['content-type'] = 'application/json'
    if (options.prefer !== undefined) headers.prefer = options.prefer
    let response: Response
    try {
      response = await this.fetchImpl(`${this.baseUrl}${path}`, {
        method,
        headers,
        ...options.body === undefined ? {} : { body: JSON.stringify(options.body) },
        signal: composed,
      })
    } catch (cause) {
      throw new CarbonError(`carbon data unreachable (${method} ${path.split('?')[0]}): ${cause instanceof Error ? cause.message : String(cause)}`, 'CARBON_NETWORK_ERROR')
    }
    if (response.status === 401 && options.retried !== true) {
      // Force a full re-authentication and retry exactly once.
      this.session = undefined
      return await this.dataRequest(method, path, { ...options, retried: true })
    }
    return response
  }

  /**
   * Decode one data response, translating PostgREST error bodies into the
   * structured taxonomy (RLS 403/42501 first).
   * @param response - the raw response.
   * @param method - HTTP method (for the failure message).
   * @param path - request path (for the failure message).
   */
  private async decode(response: Response, method: string, path: string): Promise<unknown> {
    if (response.ok || response.status === 204) {
      if (response.status === 204) return null
      const text = await response.text()
      return text.length === 0 ? null : JSON.parse(text)
    }
    const body = await response.text().catch(() => '')
    let decoded: PostgrestErrorBody | undefined
    try {
      decoded = JSON.parse(body) as PostgrestErrorBody
    } catch {
      decoded = undefined
    }
    const pgCode = decoded?.code
    if (response.status === 403 || pgCode === '42501') {
      throw new CarbonError(
        `carbon RLS rejected ${method} ${path.split('?')[0]}: ${decoded?.message ?? body.slice(0, 200)}`,
        'CARBON_RLS_VIOLATION',
        response.status,
        decoded === undefined ? undefined : { ...decoded },
      )
    }
    throw new CarbonError(
      `carbon HTTP ${response.status} on ${method} ${path.split('?')[0]}: ${(decoded?.message ?? body).slice(0, 200)}`,
      'CARBON_HTTP_ERROR',
      response.status,
      decoded === undefined ? undefined : { ...decoded },
    )
  }

  /**
   * Query one table's rows with the restricted vocabulary, exact count, and
   * paging.
   * @param table - the camelCase table name (`salesOrder`).
   * @param options - filters, ordering, paging, projection.
   * @param signal - caller cancellation.
   * @returns the count and the decoded rows.
   */
  async list<Row = Record<string, unknown>>(
    table: string,
    options: CarbonListOptions = {},
    signal?: AbortSignal,
  ): Promise<CarbonListResult<Row>> {
    const params = compileCarbonFilter(options.filter ?? [])
    if (options.order !== undefined && options.order.length > 0) params.set('order', options.order.join(','))
    if (options.limit !== undefined) params.set('limit', String(Math.min(options.limit, CARBON_LIST_MAX_LIMIT)))
    if (options.offset !== undefined) params.set('offset', String(options.offset))
    if (options.select !== undefined && options.select.length > 0) params.set('select', options.select.join(','))
    const path = `/rest/v1/${table}${params.size > 0 ? `?${params.toString()}` : ''}`
    const response = await this.dataRequest('GET', path, {
      prefer: 'count=exact',
      signal,
    })
    const rows = await this.decode(response, 'GET', path) as Row[]
    // Content-Range: `0-19/357` (total present with count=exact), `*/0` for
    // the empty set.
    const range = response.headers.get('content-range')
    const total = range?.split('/')[1]
    return {
      count: total === undefined || total === '*' ? rows.length : Number(total),
      rows: Array.isArray(rows) ? rows : [],
    }
  }

  /**
   * Read one row by its prefixed string id.
   * @param table - the camelCase table name.
   * @param id - the row id (`item_WgSb…`).
   * @param signal - caller cancellation.
   * @returns the row, or `undefined` when the id matches nothing.
   */
  async get<Row = Record<string, unknown>>(table: string, id: string, signal?: AbortSignal): Promise<Row | undefined> {
    const path = `/rest/v1/${table}?id=eq.${encodeURIComponent(id)}&limit=1`
    const response = await this.dataRequest('GET', path, { signal })
    const rows = await this.decode(response, 'GET', path) as Row[]
    return Array.isArray(rows) ? rows[0] : undefined
  }

  /**
   * Insert one row. The tenant `companyId` is injected when the caller has
   * not supplied it (the RLS `WITH CHECK` remains the floor — a mismatched
   * tenant still fails with the structured RLS violation).
   * @param table - the camelCase table name.
   * @param values - the row's column values.
   * @param signal - caller cancellation.
   * @returns the created row (representation requested).
   */
  async create<Row = Record<string, unknown>>(table: string, values: Record<string, unknown>, signal?: AbortSignal): Promise<Row> {
    const companyId = values.companyId ?? await this.resolveCompanyId(signal)
    const body = { ...values, companyId }
    const path = `/rest/v1/${table}`
    const response = await this.dataRequest('POST', path, { body, prefer: 'return=representation', signal })
    const decoded = await this.decode(response, 'POST', path)
    return (Array.isArray(decoded) ? decoded[0] : decoded) as Row
  }

  /**
   * Patch one row's columns.
   * @param table - the camelCase table name.
   * @param id - the row id.
   * @param values - the columns to change.
   * @param signal - caller cancellation.
   * @returns the updated row (representation requested).
   */
  async update<Row = Record<string, unknown>>(
    table: string,
    id: string,
    values: Record<string, unknown>,
    signal?: AbortSignal,
  ): Promise<Row> {
    const path = `/rest/v1/${table}?id=eq.${encodeURIComponent(id)}`
    const response = await this.dataRequest('PATCH', path, { body: values, prefer: 'return=representation', signal })
    const decoded = await this.decode(response, 'PATCH', path)
    return (Array.isArray(decoded) ? decoded[0] : decoded) as Row
  }

  /**
   * Resolve the service account's tenant once and cache it: the employee
   * table's primary key IS the GoTrue user id (no separate userId column),
   * so the signed-in session's `sub` addresses the binding row directly. A
   * config-supplied default short-circuits the probe.
   * @param signal - caller cancellation.
   * @returns the companyId every insert will carry.
   */
  async resolveCompanyId(signal?: AbortSignal): Promise<string> {
    if (this.cachedCompanyId !== undefined) return this.cachedCompanyId
    const session = await this.ensureSession(signal)
    const path = `/rest/v1/employee?select=companyId&id=eq.${encodeURIComponent(session.userId)}&limit=1`
    const response = await this.dataRequest('GET', path, { signal })
    const rows = await this.decode(response, 'GET', path) as { companyId?: unknown }[]
    const companyId = Array.isArray(rows) && typeof rows[0]?.companyId === 'string' ? rows[0].companyId : undefined
    if (companyId === undefined) {
      throw new CarbonError(`carbon tenant unresolved: employee row for ${session.email} carries no companyId`, 'CARBON_HTTP_ERROR')
    }
    this.cachedCompanyId = companyId
    return companyId
  }

  /**
   * Override the cached tenant (config-supplied default).
   * @param companyId - the tenant every insert will carry.
   */
  pinCompanyId(companyId: string): void {
    this.cachedCompanyId = companyId
  }
}
