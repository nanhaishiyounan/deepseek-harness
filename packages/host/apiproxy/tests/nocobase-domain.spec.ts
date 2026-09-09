/**
 * The nocobase domain's deployment-side gates and read paths: an
 * opted-out deployment refuses every method with `nocobase-not-composed`,
 * an opted-in deployment without resolvable credentials refuses with
 * `nocobase-unavailable`, and the three read methods answer over a
 * stubbed NocoBase wire — schema projection (hidden flag, relation
 * targets), the restricted filter vocabulary's compilation, paging, the
 * missing-row refusal, and the request-failure fold.
 */

import { afterEach, describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import AgentRegistry from '@deepseek-ai/dsh-agent'
import SessionStore from '@deepseek-ai/dsh-session'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import UserQuestionService from '@deepseek-ai/dsh-user-questions'
import { createApiProxy } from '../src/api-proxy.ts'
import type { RpcRequest } from '../src/api/rpc.ts'

const NC_TOKEN = 'nocobase-domain-spec-token'

/** The mock backend's listMeta answer (the wire's raw collection definitions). */
const RAW_META = [
  { name: 'orders', title: '订单', filterTargetKey: 'id', fields: [
    { name: 'id', type: 'bigInt' },
    { name: 'status', type: 'string', title: '状态' },
    { name: 'customer', type: 'belongsTo', target: 'customers', foreignKey: 'customerId', title: '客户' },
  ] },
  { name: 'auditLog', hidden: true, fields: [{ name: 'id', type: 'bigInt' }] },
]

/** The mock backend's orders rows. */
const ORDER_ROWS = [
  { id: 11, status: 'pending', amount: 100 },
  { id: 12, status: 'shipped', amount: 250 },
]

/** Install a fetch stub serving the resourcer's wire semantics. */
function stubNocoBaseFetch(options: { fail?: boolean } = {}): { requests: Array<{ url: string; method: string; body?: unknown }> } {
  const requests: Array<{ url: string; method: string; body?: unknown }> = []
  vi.stubGlobal('fetch', vi.fn(async (input: string | URL, init?: RequestInit): Promise<Response> => {
    const url = typeof input === 'string' ? input : input.href
    requests.push({ url, method: (init?.method ?? 'GET').toUpperCase(), ...(init?.body === undefined ? {} : { body: JSON.parse(init.body as string) }) })
    if (options.fail === true) return new Response('{"error":"boom"}', { status: 500 })
    if ((init?.headers as Record<string, unknown> | undefined)?.authorization !== `Bearer ${NC_TOKEN}`) {
      return new Response('{"error":{"code":"INVALID_TOKEN"}}', { status: 401 })
    }
    const parsed = new URL(url)
    if (parsed.pathname === '/api/collections:listMeta') {
      return Response.json({ data: RAW_META })
    }
    if (parsed.pathname === '/api/orders:list') {
      const filterRaw = parsed.searchParams.get('filter')
      let filtered = ORDER_ROWS
      if (filterRaw !== null) {
        const filter = JSON.parse(filterRaw) as Record<string, Record<string, unknown>>
        for (const [field, cell] of Object.entries(filter)) {
          if ('$eq' in cell) filtered = filtered.filter(row => row[field as keyof typeof row] === cell.$eq)
          if ('$gt' in cell) filtered = filtered.filter(row => typeof row.amount === 'number' && row.amount > (cell.$gt as number))
        }
      }
      const page = Number(parsed.searchParams.get('page') ?? 1)
      const pageSize = Number(parsed.searchParams.get('pageSize') ?? 20)
      const pageRows = filtered.slice((page - 1) * pageSize, page * pageSize)
      return Response.json({ data: pageRows, meta: { count: filtered.length, page, pageSize } })
    }
    const getMatch = /^\/api\/orders\/(\d+)$/u.exec(parsed.pathname)
    if (getMatch !== null) {
      const row = ORDER_ROWS.find(entry => String(entry.id) === getMatch?.[1])
      return Response.json({ data: row ?? null })
    }
    return new Response('{"error":"not found"}', { status: 404 })
  }))
  return { requests }
}

async function harness(defaults: { nocobaseEnabled?: boolean; nocobaseBaseUrl?: string }) {
  const ctx = new Context()
  await ctx.plugin(SessionStore)
  await ctx.plugin(SystemPrompt, { persona: '' })
  await ctx.plugin(UserQuestionService)
  await ctx.plugin(AgentRegistry)
  const api = createApiProxy(ctx, {
    defaultModelSelection: () => ({ provider: 'p', model: 'm' }),
    saveDefaultModelSelection: async () => {},
    cwd: '/tmp',
    ...defaults.nocobaseEnabled === undefined ? {} : { nocobaseEnabled: defaults.nocobaseEnabled },
    ...defaults.nocobaseBaseUrl === undefined ? {} : { nocobaseBaseUrl: defaults.nocobaseBaseUrl },
  })
  return { api, ctx }
}

afterEach(() => {
  vi.unstubAllGlobals()
  delete process.env.NOCOBASE_API_KEY
  delete process.env.NOCOBASE_BASE_URL
})

/** One typed RPC request envelope. */
function request<P>(rpcId: string, payload: P): RpcRequest<P> {
  return { rpcId: rpcId as never, payload }
}

describe('nocobase domain deployment gates', () => {
  it('refuses every method when the deployment did not opt in', async () => {
    const { api, ctx } = await harness({})
    for (const refusal of [
      await api.nocobase.listMeta(request('r', {})),
      await api.nocobase.list(request('r', { collection: 'orders' })),
      await api.nocobase.get(request('r', { collection: 'orders', id: 1 })),
    ]) {
      expect(refusal.result).toMatchObject({ ok: false, error: { code: 'nocobase-not-composed' } })
    }
    await ctx.fiber.dispose()
  })

  it('refuses with nocobase-unavailable when no service account resolves', async () => {
    delete process.env.NOCOBASE_BASE_URL
    delete process.env.NOCOBASE_API_KEY
    const { api, ctx } = await harness({ nocobaseEnabled: true })
    const refusal = await api.nocobase.listMeta(request('r', {}))
    expect(refusal.result).toMatchObject({ ok: false, error: { code: 'nocobase-unavailable' } })
    await ctx.fiber.dispose()
  })
})

describe('nocobase domain reads over the stubbed wire', () => {
  it('projects the collection schema (hidden flag and relation targets included)', async () => {
    process.env.NOCOBASE_API_KEY = NC_TOKEN
    stubNocoBaseFetch()
    const { api, ctx } = await harness({ nocobaseEnabled: true, nocobaseBaseUrl: 'http://nc.test' })
    const result = await api.nocobase.listMeta(request('r', {}))
    expect(result.result).toMatchObject({ ok: true, value: { collections: [
      { name: 'orders', title: '订单', filter_target_key: 'id', fields: [
        { name: 'id', type: 'bigInt' },
        { name: 'status', type: 'string', title: '状态' },
        { name: 'customer', type: 'belongsTo', target: 'customers', title: '客户' },
      ] },
      { name: 'auditLog', hidden: true, fields: [{ name: 'id', type: 'bigInt' }] },
    ] } })
    await ctx.fiber.dispose()
  })

  it('compiles the restricted filters onto the wire and answers the page', async () => {
    process.env.NOCOBASE_API_KEY = NC_TOKEN
    const { requests } = stubNocoBaseFetch()
    const { api, ctx } = await harness({ nocobaseEnabled: true, nocobaseBaseUrl: 'http://nc.test' })
    const result = await api.nocobase.list(request('r', {
      collection: 'orders',
      filter: [{ field: 'amount', op: 'gt', value: 150 }],
      page: 1,
      page_size: 10,
      sort: ['-amount'],
      fields: ['status'],
    }))
    expect(result.result).toMatchObject({ ok: true, value: { count: 1, page: 1, page_size: 10, rows: [{ id: 12, status: 'shipped', amount: 250 }] } })
    const query = new URL(requests[0]!.url).searchParams
    expect(JSON.parse(query.get('filter') ?? 'null')).toEqual({ amount: { $gt: 150 } })
    expect(query.get('sort')).toBe('-amount')
    expect(query.get('fields')).toBe('status')
    await ctx.fiber.dispose()
  })

  it('reads one row and refuses a missing row with nocobase-row-missing', async () => {
    process.env.NOCOBASE_API_KEY = NC_TOKEN
    stubNocoBaseFetch()
    const { api, ctx } = await harness({ nocobaseEnabled: true, nocobaseBaseUrl: 'http://nc.test' })
    const found = await api.nocobase.get(request('r', { collection: 'orders', id: 12 }))
    expect(found.result).toMatchObject({ ok: true, value: { collection: 'orders', row: { id: 12, status: 'shipped' } } })
    const missing = await api.nocobase.get(request('r', { collection: 'orders', id: 999 }))
    expect(missing.result).toMatchObject({ ok: false, error: { code: 'nocobase-row-missing', details: { collection: 'orders', id: 999 } } })
    await ctx.fiber.dispose()
  })

  it('folds a backend failure into nocobase-request-failed', async () => {
    process.env.NOCOBASE_API_KEY = NC_TOKEN
    stubNocoBaseFetch({ fail: true })
    const { api, ctx } = await harness({ nocobaseEnabled: true, nocobaseBaseUrl: 'http://nc.test' })
    const refusal = await api.nocobase.listMeta(request('r', {}))
    expect(refusal.result).toMatchObject({ ok: false, error: { code: 'nocobase-request-failed' } })
    await ctx.fiber.dispose()
  })

  it('refuses a malformed filter condition as a business error, not a throw', async () => {
    process.env.NOCOBASE_API_KEY = NC_TOKEN
    stubNocoBaseFetch()
    const { api, ctx } = await harness({ nocobaseEnabled: true, nocobaseBaseUrl: 'http://nc.test' })
    // The zod layer already rejects an unknown op at the carrier boundary;
    // the business layer's own guard covers the in-array emptiness.
    const refusal = await api.nocobase.list(request('r', {
      collection: 'orders',
      filter: [{ field: 'status', op: 'in', value: [] }],
    }))
    expect(refusal.result).toMatchObject({ ok: false, error: { code: 'nocobase-request-failed' } })
    await ctx.fiber.dispose()
  })
})
