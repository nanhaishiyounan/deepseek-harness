/**
 * The session client's behavior over an injectable fetch: the password grant
 * and double header, the refresh-ahead-of-expiry lifecycle with the
 * password-grant fallback, structured RLS violations, tenant injection from
 * the employee row, and the restricted filter vocabulary's wire form.
 */

import { describe, expect, it } from 'vitest'
import { CarbonClient, CarbonError, compileCarbonFilter } from '../src/client.ts'

/** One recorded fetch call (method, url, headers, body). */
interface Served {
  method: string
  url: string
  headers: Record<string, string>
  body: unknown
}

/** One scripted route. */
type ScriptedRoute = {
  match: (served: Served) => boolean
  respond: () => { status: number; body?: unknown; headers?: Record<string, string> }
}

/** Scripted-response fetch factory: each route matches once, in order. */
function scripted(routes: ScriptedRoute[]): { fetch: typeof fetch; served: Served[] } {
  const served: Served[] = []
  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    const headers: Record<string, string> = {}
    for (const [name, value] of Object.entries(init?.headers ?? {})) headers[name] = String(value)
    const call: Served = { method: init?.method ?? 'GET', url, headers, body: init?.body === undefined ? undefined : JSON.parse(String(init.body)) }
    served.push(call)
    const route = routes.find(route => route.match(call))
    if (route === undefined) return new Response('no scripted route', { status: 599 })
    const answer = route.respond()
    return new Response(answer.body === undefined ? null : JSON.stringify(answer.body), {
      status: answer.status,
      headers: { 'content-type': 'application/json', ...answer.headers },
    })
  }) as typeof fetch
  return { fetch: fetchImpl, served }
}

/** A token grant the script serves. */
function grant(
  overrides: Partial<{ access_token: string; refresh_token: string; expires_in: number }> = {},
): { status: number; body: unknown } {
  return {
    status: 200,
    body: {
      access_token: 'jwt-a',
      refresh_token: 'refresh-a',
      expires_in: 3600,
      user: { id: 'user-1', email: 'test@carbon.ms' },
      ...overrides,
    },
  }
}

const BASE = { baseUrl: 'http://carbon.test', anonKey: 'anon-key', email: 'test@carbon.ms', password: 'secret' }

describe('CarbonClient session lifecycle', () => {
  it('authenticates through the password grant and rides the double header on data calls', async () => {
    const http = scripted([
      { match: s => s.url.includes('/auth/v1/token?grant_type=password'), respond: () => grant() },
      { match: s => s.url.includes('/rest/v1/item'), respond: () => ({ status: 200, body: [{ id: 'item_1', name: 'X' }], headers: { 'content-range': '0-0/1' } }) },
    ])
    const client = new CarbonClient({ ...BASE, fetch: http.fetch })
    const result = await client.list('item', {})
    expect(result.count).toBe(1)
    expect(result.rows[0]).toMatchObject({ id: 'item_1' })
    const auth = http.served[0]!
    expect(auth.headers.apikey).toBe('anon-key')
    expect(auth.body).toEqual({ email: 'test@carbon.ms', password: 'secret' })
    const data = http.served[1]!
    expect(data.headers.apikey).toBe('anon-key')
    expect(data.headers.authorization).toBe('Bearer jwt-a')
    expect(data.headers.prefer).toBe('count=exact')
  })

  it('reuses the live session within the refresh skew and refreshes once it closes', async () => {
    let grants = 0
    const http = scripted([
      { match: s => s.url.includes('grant_type=password'), respond: () => { grants++; return grant() } },
      { match: s => s.url.includes('grant_type=refresh_token'), respond: () => grant({ access_token: 'jwt-b', refresh_token: 'refresh-b' }) },
      { match: s => s.url.includes('/rest/v1/item'), respond: () => ({ status: 200, body: [], headers: { 'content-range': '*/0' } }) },
    ])
    // A skew covering the whole 1h lifetime: the first list lands inside the
    // fresh grant, the second is already past the refresh horizon.
    const client = new CarbonClient({ ...BASE, fetch: http.fetch, refreshSkewMs: 3600 * 1000 })
    await client.list('item', {})
    await client.list('item', {})
    // One password grant (the initial login) plus one refresh grant — the
    // password grant never repeats while the refresh token satisfies.
    expect(http.served.filter(s => s.url.includes('/auth/'))).toHaveLength(2)
    expect(http.served.find(s => s.url.includes('grant_type=refresh_token'))?.body).toEqual({ refresh_token: 'refresh-a' })
    expect(grants).toBe(1)
    const session = await client.ensureSession()
    expect(session.accessToken).toBe('jwt-b')
  })

  it('falls back to the password grant when the refresh token no longer satisfies the server', async () => {
    const http = scripted([
      { match: s => s.url.includes('grant_type=password'), respond: () => grant({ access_token: 'jwt-c' }) },
      { match: s => s.url.includes('grant_type=refresh_token'), respond: () => ({ status: 400, body: { error: 'invalid_request' } }) },
    ])
    const client = new CarbonClient({ ...BASE, fetch: http.fetch, refreshSkewMs: 3600 * 1000 })
    await client.authenticate()
    const session = await client.ensureSession()
    expect(session.accessToken).toBe('jwt-c')
  })

  it('surfaces a password rejection as CARBON_AUTH_REJECTED without the fallback loop', async () => {
    const http = scripted([
      { match: s => s.url.includes('grant_type=password'), respond: () => ({ status: 401, body: { error: 'invalid_credentials' } }) },
    ])
    const client = new CarbonClient({ ...BASE, fetch: http.fetch })
    await expect(client.list('item', {})).rejects.toMatchObject({ code: 'CARBON_AUTH_REJECTED', status: 401 })
  })

  it('translates the PostgREST 42501 body into the structured RLS violation', async () => {
    const http = scripted([
      { match: s => s.url.includes('grant_type=password'), respond: () => grant() },
      { match: s => s.url.includes('/rest/v1/customer') && s.method === 'POST', respond: () => ({ status: 403, body: { code: '42501', message: 'new row violates row-level security policy for table "customer"', hint: null } }) },
    ])
    const client = new CarbonClient({ ...BASE, fetch: http.fetch })
    const error = await client.create('customer', { name: 'X', companyId: 'comp_other' }).catch((cause: unknown) => cause)
    expect(error).toBeInstanceOf(CarbonError)
    expect(error).toMatchObject({ code: 'CARBON_RLS_VIOLATION', status: 403 })
    expect((error as CarbonError).body).toMatchObject({ code: '42501' })
  })
})

describe('CarbonClient data surface', () => {
  it('injects the employee-resolved companyId into inserts and caches it', async () => {
    const http = scripted([
      { match: s => s.url.includes('grant_type=password'), respond: () => grant() },
      { match: s => s.url.includes('/rest/v1/employee'), respond: () => ({ status: 200, body: [{ companyId: 'comp_main' }] }) },
      { match: s => s.url.includes('/rest/v1/customer') && s.method === 'POST', respond: () => ({ status: 201, body: [{ id: 'cust_new', companyId: 'comp_main' }] }) },
      { match: s => s.url.includes('/rest/v1/customer') && s.method === 'POST' && JSON.stringify(s.body ?? {}).includes('comp_main'), respond: () => ({ status: 201, body: [{ id: 'cust_new2' }] }) },
    ])
    const client = new CarbonClient({ ...BASE, fetch: http.fetch })
    const created = await client.create('customer', { name: 'X' })
    expect(created).toMatchObject({ id: 'cust_new' })
    expect(http.served.find(s => s.method === 'POST' && s.url.includes('/rest/v1/customer'))?.body).toMatchObject({ name: 'X', companyId: 'comp_main' })
    // The second insert reuses the cached tenant without a second employee probe.
    await client.create('customer', { name: 'Y' })
    expect(http.served.filter(s => s.url.includes('/rest/v1/employee'))).toHaveLength(1)
  })

  it('pins a config-supplied companyId without the employee probe', async () => {
    const http = scripted([
      { match: s => s.url.includes('grant_type=password'), respond: () => grant() },
      { match: s => s.url.includes('/rest/v1/customer') && s.method === 'POST', respond: () => ({ status: 201, body: [{ id: 'cust_new' }] }) },
    ])
    const client = new CarbonClient({ ...BASE, fetch: http.fetch })
    client.pinCompanyId('comp_pinned')
    await client.create('customer', { name: 'X' })
    expect(http.served.find(s => s.url.includes('/rest/v1/employee'))).toBeUndefined()
    expect(http.served.find(s => s.method === 'POST' && s.url.includes('/rest/v1/customer'))?.body).toMatchObject({ companyId: 'comp_pinned' })
  })

  it('reads one row by string id and resolves undefined on misses', async () => {
    const http = scripted([
      { match: s => s.url.includes('grant_type=password'), respond: () => grant() },
      { match: s => s.url.includes('/rest/v1/item') && s.url.includes('id=eq.item_1'), respond: () => ({ status: 200, body: [{ id: 'item_1', name: 'X' }] }) },
      { match: s => s.url.includes('/rest/v1/item') && s.url.includes('id=eq.item_missing'), respond: () => ({ status: 200, body: [], headers: { 'content-range': '*/0' } }) },
    ])
    const client = new CarbonClient({ ...BASE, fetch: http.fetch })
    expect(await client.get('item', 'item_1')).toMatchObject({ id: 'item_1' })
    expect(await client.get('item', 'item_missing')).toBeUndefined()
  })

  it('re-authenticates once when the server answers 401 mid-session', async () => {
    let dataCalls = 0
    const http = scripted([
      { match: s => s.url.includes('grant_type=password'), respond: () => grant({ access_token: 'jwt-old' }) },
      { match: s => s.url.includes('/rest/v1/item') && ++dataCalls === 1, respond: () => ({ status: 401, body: { message: 'JWT expired' } }) },
      { match: s => s.url.includes('/rest/v1/item'), respond: () => ({ status: 200, body: [{ id: 'item_1' }], headers: { 'content-range': '0-0/1' } }) },
    ])
    const client = new CarbonClient({ ...BASE, fetch: http.fetch })
    const result = await client.list('item', {})
    expect(result.rows[0]).toMatchObject({ id: 'item_1' })
    expect(http.served.filter(s => s.url.includes('grant_type=password'))).toHaveLength(2)
  })
})

describe('compileCarbonFilter', () => {
  it('compiles the restricted vocabulary onto PostgREST parameters', () => {
    const params = compileCarbonFilter([
      { field: 'status', op: 'eq', value: 'Confirmed' },
      { field: 'name', op: 'ilike', value: 'antenna' },
      { field: 'totalAmount', op: 'gte', value: 1000 },
      { field: 'id', op: 'in', value: ['item_1', 'item_2'] },
      { field: 'notes', op: 'is', value: null },
    ])
    expect(params.get('status')).toBe('eq.Confirmed')
    expect(params.get('name')).toBe('ilike.*antenna')
    expect(params.get('totalAmount')).toBe('gte.1000')
    expect(params.get('id')).toBe('in.(item_1,item_2)')
    expect(params.get('notes')).toBe('is.null')
  })

  it('quotes in-list members carrying separators', () => {
    const params = compileCarbonFilter([{ field: 'name', op: 'in', value: ['A, B', 'plain'] }])
    expect(params.get('name')).toBe('in.("A, B",plain)')
  })

  it('refuses the invalid operand shapes loudly', () => {
    expect(() => compileCarbonFilter([{ field: 'x', op: 'in', value: [] }])).toThrow()
    expect(() => compileCarbonFilter([{ field: 'x', op: 'is', value: 'null' }])).toThrow()
    expect(() => compileCarbonFilter([{ field: 'x', op: 'gt', value: [1] }])).toThrow()
  })
})
