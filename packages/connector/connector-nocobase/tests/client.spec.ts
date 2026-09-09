/**
 * The REST client's wire behavior over the local mock server and an
 * injectable fetch: bearer-token header on every request, action-style list
 * paths with URL-encoded JSON filters and pagination, REST-style gets, loud
 * HTTP errors with status and body excerpt, transport retries, and timeouts.
 */

import { afterEach, describe, expect, it } from 'vitest'
import { NocoBaseClient, NocoBaseError, unwrapNbTitle } from '../src/client.ts'
import { compileNbFilter, describeNbFilterCondition, parseNbFilterCondition } from '../src/filter.ts'
import { closeMockServers, EXPERT_ROWS, mockNocoBaseServer, MOCK_TOKEN } from './mock-server.ts'

afterEach(closeMockServers)

describe('NocoBaseClient over the mock server', () => {
  it('sends the bearer token, the action-style path, and the URL-encoded JSON filter', async () => {
    const server = await mockNocoBaseServer()
    const client = new NocoBaseClient({ baseUrl: server.url, token: MOCK_TOKEN })
    const result = await client.list('experts', { filter: { $or: [{ name: { $includes: '张' } }] }, page: 1, pageSize: 20 })
    expect(result.rows).toHaveLength(1)
    expect(result.count).toBe(1)
    const served = server.served[0]
    expect(served?.path).toBe('/api/experts:list')
    expect(served?.authorization).toBe(`Bearer ${MOCK_TOKEN}`)
    expect(JSON.parse(served?.query.get('filter') ?? '{}')).toEqual({ $or: [{ name: { $includes: '张' } }] })
    expect(served?.query.get('page')).toBe('1')
    expect(served?.query.get('pageSize')).toBe('20')
  })

  it('gets one row REST-style; a missing row resolves undefined (the v2 `{data: null}` wire)', async () => {
    const server = await mockNocoBaseServer()
    const client = new NocoBaseClient({ baseUrl: server.url, token: MOCK_TOKEN })
    const row = await client.get<{ id: number; name: string }>('experts', 1)
    expect(row?.name).toBe('张红喜')
    expect(server.served[0]?.path).toBe('/api/experts/1')
    expect(await client.get('experts', 99)).toBeUndefined()
  })

  it('refuses a wrong token with the surfaced 401', async () => {
    const server = await mockNocoBaseServer()
    const client = new NocoBaseClient({ baseUrl: server.url, token: 'wrong-token' })
    await expect(client.list('experts', {})).rejects.toMatchObject({ code: 'NOCOBASE_HTTP_ERROR', status: 401 })
  })

  it('creates a row through the action-style path with the fields at the body top level and reads back the server-assigned id', async () => {
    const server = await mockNocoBaseServer()
    const client = new NocoBaseClient({ baseUrl: server.url, token: MOCK_TOKEN })
    try {
      const created = await client.create('experts', { name: '王顾问', org: '测试机构' })
      expect(created.id).toBeGreaterThan(1)
      expect(created.name).toBe('王顾问')
      const served = server.served.find(request => request.path === '/api/experts:create')
      expect(served?.method).toBe('POST')
      expect(served?.body).toEqual({ name: '王顾问', org: '测试机构' })
      // The created row is durable on the collection the mock serves.
      const readBack = await client.get<{ name: string }>('experts', created.id)
      expect(readBack?.name).toBe('王顾问')
    } finally {
      // The mock's collections are module-level: drop the created row so later
      // specs see the fixture source untouched.
      EXPERT_ROWS.splice(EXPERT_ROWS.findIndex(row => row.name === '王顾问'), 1)
    }
  })

  it('applies $eq and bare-value filters as equality conjunctions', async () => {
    const server = await mockNocoBaseServer()
    const client = new NocoBaseClient({ baseUrl: server.url, token: MOCK_TOKEN })
    const explicit = await client.list('expert_services', { filter: { expertId: { $eq: 1 } } })
    expect(explicit.rows).toHaveLength(3)
    const bare = await client.list('customs_export', { filter: { region: '中亚' } })
    expect(bare.rows).toHaveLength(2)
  })

  it('sends sort, fields, and appends as comma-joined query parameters and applies them server-side', async () => {
    const server = await mockNocoBaseServer()
    const client = new NocoBaseClient({ baseUrl: server.url, token: MOCK_TOKEN })
    const result = await client.list<{ id: number; region: string; month: string }>('customs_export', {
      sort: ['-month', 'region'],
      fields: ['region', 'month'],
      appends: ['deliverable'],
      page: 1,
      pageSize: 10,
    })
    const served = server.served[0]
    expect(served?.query.get('sort')).toBe('-month,region')
    expect(served?.query.get('fields')).toBe('region,month')
    expect(served?.query.get('appends')).toBe('deliverable')
    // Sorted descending by month; the projection keeps exactly the named
    // fields (the fixture rows carry no ids to re-add).
    expect(result.rows.map(row => row.month)).toEqual([...result.rows.map(row => row.month)].sort().reverse())
    for (const row of result.rows) {
      expect(Object.keys(row).sort()).toEqual(['month', 'region'])
    }
  })

  it('sends appends on the REST-style get', async () => {
    const server = await mockNocoBaseServer()
    const client = new NocoBaseClient({ baseUrl: server.url, token: MOCK_TOKEN })
    const row = await client.get<{ name: string }>('experts', 1, { appends: ['org'] })
    expect(row?.name).toBe('张红喜')
    const served = server.served[0]
    expect(served?.path).toBe('/api/experts/1')
    expect(served?.query.get('appends')).toBe('org')
  })

  it('omits empty sort, fields, and appends arrays from the wire', async () => {
    const server = await mockNocoBaseServer()
    const client = new NocoBaseClient({ baseUrl: server.url, token: MOCK_TOKEN })
    await client.list('customs_export', { sort: [], fields: [], appends: [] })
    expect(server.served[0]?.query.has('sort')).toBe(false)
    expect(server.served[0]?.query.has('fields')).toBe(false)
    expect(server.served[0]?.query.has('appends')).toBe(false)
    await client.get('experts', 1, { appends: [] })
    expect(server.served[1]?.query.has('appends')).toBe(false)
  })

  it('refuses a listMeta answer whose data is not an array', async () => {
    const client = new NocoBaseClient({
      baseUrl: 'http://mock',
      token: 't',
      fetch: async () => new Response('{"data":{"name":"orders"}}', { status: 200, headers: { 'content-type': 'application/json' } }),
    })
    await expect(client.listMeta()).rejects.toMatchObject({ code: 'NOCOBASE_HTTP_ERROR' })
  })

  it('lists the collection definitions through collections:listMeta unpaginated', async () => {
    const server = await mockNocoBaseServer()
    const client = new NocoBaseClient({ baseUrl: server.url, token: MOCK_TOKEN })
    const meta = await client.listMeta()
    const experts = meta.find(entry => entry.name === 'experts')
    expect(experts?.title).toBe('专家')
    expect(experts?.fields?.some(field => field.name === 'name' && field.type === 'string')).toBe(true)
    const served = server.served[0]
    expect(served?.path).toBe('/api/collections:listMeta')
    expect(served?.authorization).toBe(`Bearer ${MOCK_TOKEN}`)
  })

  it('unwraps i18n template titles and passes plain titles through', () => {
    expect(unwrapNbTitle('{{t("Roles")}}')).toBe('Roles')
    expect(unwrapNbTitle('{{t("Users")}}')).toBe('Users')
    expect(unwrapNbTitle('专家')).toBe('专家')
    // Only the exact template form unwraps; anything else is opaque data.
    expect(unwrapNbTitle('{{t("Roles")}} extra')).toBe('{{t("Roles")}} extra')
  })

  it('creates, updates, and reads back an orders row through the primary-key action paths', async () => {
    const server = await mockNocoBaseServer()
    const client = new NocoBaseClient({ baseUrl: server.url, token: MOCK_TOKEN })
    const created = await client.create('orders', { orderNo: 'ORD-1', serviceId: 'expert_services/2', status: 'pending' })
    expect(created.id).toBeGreaterThan(0)
    const updated = await client.update<{ orderNo: string; status: string; deliverablePath: string }>('orders', created.id, { status: 'delivered', deliverablePath: 'workspace/deliverables/ORD-1.pdf' })
    expect(updated.status).toBe('delivered')
    expect(updated.orderNo).toBe('ORD-1')
    const served = server.served.find(request => request.path === '/api/orders:update')
    expect(served?.method).toBe('POST')
    expect(served?.query.get('filterByTk')).toBe(String(created.id))
    expect(served?.body).toEqual({ status: 'delivered', deliverablePath: 'workspace/deliverables/ORD-1.pdf' })
    const readBack = await client.get<{ status: string }>('orders', created.id)
    expect(readBack?.status).toBe('delivered')
    await expect(client.update('orders', 99_999, { status: 'failed' })).rejects.toMatchObject({ code: 'NOCOBASE_HTTP_ERROR', status: 404 })
  })

  it('uploads one file as a multipart attachment and unwraps the returned row', async () => {
    const server = await mockNocoBaseServer()
    const client = new NocoBaseClient({ baseUrl: server.url, token: MOCK_TOKEN })
    const bytes = new TextEncoder().encode('%PDF-1.7 fake-order-pdf')
    const attachment = await client.upload('ORD-20260905-ab12.pdf', bytes, 'application/pdf')
    expect(attachment.id).toBeGreaterThan(0)
    expect(attachment.filename).toBe('ORD-20260905-ab12.pdf')
    expect(attachment.url).toBe('/storage/uploads/ORD-20260905-ab12.pdf')
    const served = server.served.find(request => request.path === '/api/attachments:upload')
    expect(served?.method).toBe('POST')
    expect(served?.authorization).toBe(`Bearer ${MOCK_TOKEN}`)
  })

  it('refuses an upload with a wrong token with the surfaced 401', async () => {
    const server = await mockNocoBaseServer()
    const client = new NocoBaseClient({ baseUrl: server.url, token: 'wrong-token' })
    await expect(client.upload('x.pdf', new Uint8Array([1]))).rejects.toMatchObject({ code: 'NOCOBASE_HTTP_ERROR', status: 401 })
  })
})

describe('restricted filter vocabulary', () => {
  it('compiles the restricted conditions onto the NocoBase filter tree', () => {
    expect(compileNbFilter([{ field: 'status', op: 'eq', value: 'pending' }])).toEqual({ status: { $eq: 'pending' } })
    expect(compileNbFilter([
      { field: 'amount', op: 'gt', value: 10 },
      { field: 'amount', op: 'lt', value: 99 },
    ])).toEqual({ amount: { $gt: 10, $lt: 99 } })
    expect(compileNbFilter([
      { field: 'status', op: 'in', value: ['a', 'b'] },
      { field: 'region', op: 'eq', value: '中亚' },
    ], 'or')).toEqual({ $or: [{ status: { $in: ['a', 'b'] } }, { region: { $eq: '中亚' } }] })
    expect(compileNbFilter([])).toEqual({})
  })

  it('validates conditions: empty fields, in without arrays, scalar ops fed arrays all refuse', () => {
    expect(parseNbFilterCondition({ field: '  ', op: 'eq', value: 1 })).toMatchObject({ ok: false })
    expect(parseNbFilterCondition({ field: 's', op: 'in', value: 'x' })).toMatchObject({ ok: false })
    expect(parseNbFilterCondition({ field: 's', op: 'in', value: [] })).toMatchObject({ ok: false })
    expect(parseNbFilterCondition({ field: 's', op: 'in', value: [1, {}, true] })).toMatchObject({ ok: false })
    expect(parseNbFilterCondition({ field: 's', op: 'eq', value: null })).toMatchObject({ ok: false })
    expect(parseNbFilterCondition({ field: 's', op: 'eq', value: { nested: true } })).toMatchObject({ ok: false })
    expect(parseNbFilterCondition({ field: 's', op: 'gt', value: ['x'] })).toMatchObject({ ok: false })
    expect(parseNbFilterCondition({ field: ' s ', op: 'lt', value: 5 })).toEqual({ ok: true, value: { field: 's', op: 'lt', value: 5 } })
    expect(describeNbFilterCondition({ field: 's', op: 'in', value: ['a', 1] })).toBe('s in [a, 1]')
  })
})

describe('NocoBaseClient transport behavior (injected fetch)', () => {
  /** A fetch double whose first N calls reject at the transport layer. */
  function flakyFetch(failures: { calls: number }): typeof fetch {
    let calls = 0
    return (async (_input: RequestInfo | URL) => {
      calls += 1
      if (calls <= failures.calls) throw new TypeError('fetch failed')
      return new Response('{"data":[],"meta":{"count":0,"page":1,"pageSize":20,"totalPage":0}}', { status: 200, headers: { 'content-type': 'application/json' } })
    })
  }

  it('retries once on a transport failure and succeeds', async () => {
    const client = new NocoBaseClient({ baseUrl: 'http://mock', token: 't', fetch: flakyFetch({ calls: 1 }) })
    await expect(client.list('experts', {})).resolves.toMatchObject({ count: 0 })
  })

  it('surfaces consecutive transport failures as a network error', async () => {
    const client = new NocoBaseClient({ baseUrl: 'http://mock', token: 't', fetch: flakyFetch({ calls: 5 }) })
    await expect(client.list('experts', {})).rejects.toMatchObject({ code: 'NOCOBASE_NETWORK_ERROR' })
  })

  it('never retries an HTTP-status failure', async () => {
    let calls = 0
    const fetchOnce = (async () => {
      calls += 1
      return new Response('{"error":"boom"}', { status: 500 })
    }) as typeof fetch
    const client = new NocoBaseClient({ baseUrl: 'http://mock', token: 't', fetch: fetchOnce })
    await expect(client.list('experts', {})).rejects.toMatchObject({ code: 'NOCOBASE_HTTP_ERROR', status: 500 })
    expect(calls).toBe(1)
  })

  it('stringifies a non-Error transport rejection in the network error', async () => {
    let calls = 0
    const throws: typeof fetch = async (): Promise<never> => {
      calls += 1
      throw 'socket hang up'
    }
    const client = new NocoBaseClient({ baseUrl: 'http://mock', token: 't', fetch: throws })
    const failure = await client.list('experts', {}).then(
      () => { throw new Error('expected a transport refusal') },
      (thrown: unknown): NocoBaseError => thrown as NocoBaseError,
    )
    expect(failure.code).toBe('NOCOBASE_NETWORK_ERROR')
    expect(failure.message).toContain('socket hang up')
    expect(calls).toBe(2)
  })

  it('omits the filter and pagination query parameters when the options carry none', async () => {
    const server = await mockNocoBaseServer()
    const client = new NocoBaseClient({ baseUrl: server.url, token: MOCK_TOKEN })
    await client.list('experts', {})
    const query = server.served[0]?.query
    expect(query?.has('filter')).toBe(false)
    expect(query?.has('page')).toBe(false)
    expect(query?.has('pageSize')).toBe(false)
  })

  it('refuses a list body that is not a JSON object', async () => {
    const nullBody = (async () => new Response('null', { status: 200, headers: { 'content-type': 'application/json' } })) as typeof fetch
    const client = new NocoBaseClient({ baseUrl: 'http://mock', token: 't', fetch: nullBody })
    await expect(client.list('experts', {})).rejects.toMatchObject({ code: 'NOCOBASE_HTTP_ERROR' })
  })

  it('times out a hanging response', async () => {
    // The double honors the request signal the way the real fetch does: the
    // abort (including one that fired before the call) rejects the pending
    // promise instead of waiting out a sleep.
    const hanging = ((_input: RequestInfo | URL, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      const signal = init?.signal
      const abort = (): void => {
        reject(signal?.reason instanceof Error ? signal.reason : new Error('aborted'))
      }
      if (signal?.aborted) {
        abort()
        return
      }
      signal?.addEventListener('abort', abort)
    }))
    const client = new NocoBaseClient({ baseUrl: 'http://mock', token: 't', timeoutMs: 50, fetch: hanging })
    await expect(client.list('experts', {})).rejects.toMatchObject({ code: 'NOCOBASE_NETWORK_ERROR' })
  })
})
