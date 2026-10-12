/**
 * The cb_* tool rows over a scripted PostgREST backend: catalog discovery,
 * restricted-filter reads with exact counts, key-addressed gets, the
 * write-tier gating (read-tier refusals, companyId injection), and the
 * degraded-mode refusals when the carbon service carries no client.
 */

import { afterEach, describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { CallId } from '@deepseek-ai/dsh-llm'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import * as ConnectorCarbon from '@deepseek-ai/dsh-connector-carbon'
import * as ToolCarbon from '../src/index.ts'

const contexts: Context[] = []

afterEach(async () => {
  await Promise.all(contexts.splice(0).map(ctx => ctx.fiber.dispose()))
})

/** One recorded fetch call. */
interface Served {
  method: string
  url: string
  headers: Record<string, string>
  body: unknown
}

/** One scripted route (the connector client's test surface). */
type ScriptedRoute = {
  match: (served: Served) => boolean
  respond: () => { status: number; body?: unknown; headers?: Record<string, string> }
}

/** Scripted-response fetch factory. */
function scripted(routes: ScriptedRoute[]): { fetch: typeof fetch; served: Served[] } {
  const served: Served[] = []
  const fetchImpl = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = input instanceof Request ? input.url : String(input)
    const headers: Record<string, string> = {}
    for (const [name, value] of Object.entries(init?.headers ?? {})) headers[name] = String(value)
    const call: Served = { method: init?.method ?? 'GET', url, headers, body: typeof init?.body === 'string' ? JSON.parse(init.body) : undefined }
    served.push(call)
    const route = routes.find(route => route.match(call))
    if (route === undefined) return new Response('no scripted route', { status: 599 })
    const answer = route.respond()
    return new Response(answer.body === undefined ? null : JSON.stringify(answer.body), {
      status: answer.status,
      headers: { 'content-type': 'application/json', ...answer.headers },
    })
  }
  return { fetch: fetchImpl, served }
}

interface ExecuteResult {
  isError: boolean
  value: unknown
  text: string
  meta?: unknown
}

/** Mount the suite over a scripted backend (or degraded without a client). */
async function mount(
  options: { degraded?: boolean; fetch?: typeof fetch } = {},
): Promise<{ execute: (name: string, args: unknown) => Promise<ExecuteResult>; served: Served[] }> {
  const ctx = new Context()
  contexts.push(ctx)
  await ctx.plugin(SystemPrompt)
  await ctx.plugin(ToolRuntime)
  let served: Served[] = []
  if (options.degraded === true) {
    await ctx.plugin(ConnectorCarbon, {})
  } else {
    const http = scripted([
      { match: s => s.url.includes('grant_type=password'), respond: () => ({ status: 200, body: { access_token: 'jwt-a', refresh_token: 'r-a', expires_in: 3600, user: { id: 'user-1', email: 'test@carbon.ms' } } }) },
      { match: s => s.url.includes('/rest/v1/employee'), respond: () => ({ status: 200, body: [{ companyId: 'comp_main' }] }) },
      { match: s => s.url.includes('/rest/v1/item') && s.url.includes('name=ilike'), respond: () => ({ status: 200, body: [{ id: 'item_1', readableId: 'SKU-1', name: '天线', type: 'Part', active: true }], headers: { 'content-range': '0-0/1' } }) },
      { match: s => s.url.includes('/rest/v1/item') && s.method === 'POST', respond: () => ({ status: 201, body: [{ id: 'item_new', name: '杀菌乳', companyId: 'comp_main' }] }) },
      { match: s => s.url.includes('/rest/v1/customer') && s.method === 'PATCH', respond: () => ({ status: 200, body: [{ id: 'cust_1', name: '新名字' }] }) },
      { match: s => s.url.includes('/rest/v1/customer') && s.url.includes('id=eq.cust_1'), respond: () => ({ status: 200, body: [{ id: 'cust_1', name: '旧名字', phone: '010' }], headers: { 'content-range': '0-0/1' } }) },
      { match: s => s.url.includes('/rest/v1/customer') && s.url.includes('id=eq.cust_missing'), respond: () => ({ status: 200, body: [], headers: { 'content-range': '*/0' } }) },
      { match: s => s.url.includes('/rest/v1/salesOrder'), respond: () => ({ status: 200, body: [{ id: 'so_1', salesOrderId: 'SO000001', status: 'Confirmed' }], headers: { 'content-range': '0-0/5' } }) },
      { match: s => s.url.includes('/rest/v1/receipt'), respond: () => ({ status: 200, body: [], headers: { 'content-range': '*/0' } }) },
    ])
    served = http.served
    const client = new ConnectorCarbon.CarbonClient({
      baseUrl: 'http://carbon.test',
      anonKey: 'anon',
      email: 'test@carbon.ms',
      password: 'password',
      fetch: http.fetch,
    })
    await ctx.plugin(ConnectorCarbon, {})
    // Replace the service's client with the scripted one (the plugin built
    // a degraded service without credentials).
    Object.defineProperty(ctx.carbon, 'client', { value: client, configurable: true })
  }
  await ctx.plugin(ToolCarbon, {})
  let counter = 0
  const signal = AbortSignal.timeout(5000)
  const execute = async (name: string, args: unknown): Promise<ExecuteResult> => {
    const result = await ctx.tools.execute({ signal, callId: CallId(`call-${++counter}`), name, arguments: args })
    const text = result.content.find(block => block.type === 'text')
    return { isError: result.isError, value: result.value, text: text?.type === 'text' ? text.text : '', meta: result.meta }
  }
  return { execute, served }
}

describe('cb_collections', () => {
  it('lists the business catalog with module, risk tier, and key columns', async () => {
    const { execute } = await mount()
    const result = await execute('cb_collections', {})
    expect(result.isError).toBe(false)
    expect(result.text).toContain('salesOrder（销售订单｜可读可写')
    expect(result.text).toContain('itemStockQuantities（库存数量｜只读')
  })

  it('refuses with the structured no-credentials text in the degraded mode', async () => {
    const { execute } = await mount({ degraded: true })
    const result = await execute('cb_collections', {})
    expect(result.isError).toBe(true)
    expect(result.text).toContain('carbon: this deployment resolves no carbon credentials')
  })
})

describe('cb_list', () => {
  it('queries with the restricted filter, rides the catalog projection, and reports the exact count', async () => {
    const { execute, served } = await mount()
    const result = await execute('cb_list', { table: 'item', filter: [{ field: 'name', op: 'ilike', value: '天线' }], limit: 20 })
    expect(result.isError).toBe(false)
    expect(result.text).toContain('item（共 1 行，返回 1 行）')
    expect(result.text).toContain('天线')
    const data = served.find(s => s.url.includes('/rest/v1/item'))
    expect(data?.url).toContain('name=ilike.')
    expect(data?.url).toContain('select=')
    expect(data?.headers.prefer).toBe('count=exact')
  })

  it('refuses tables outside the catalog', async () => {
    const { execute } = await mount()
    const result = await execute('cb_list', { table: 'secretTable' })
    expect(result.isError).toBe(true)
    expect(result.text).toContain('not on the business catalog')
  })

  it('bounds the limit at parse time', async () => {
    const { execute } = await mount()
    const result = await execute('cb_list', { table: 'item', limit: 1000 })
    expect(result.isError).toBe(true)
    expect(result.text).toContain('limit must be an integer 1-100')
  })
})

describe('cb_get', () => {
  it('reads one row by string id', async () => {
    const { execute } = await mount()
    const result = await execute('cb_get', { table: 'customer', id: 'cust_1' })
    expect(result.isError).toBe(false)
    expect(result.text).toContain('旧名字')
  })

  it('answers null for a missing row (not an error)', async () => {
    const { execute } = await mount()
    const result = await execute('cb_get', { table: 'customer', id: 'cust_missing' })
    expect(result.isError).toBe(false)
    expect(result.text).toContain('没有这一行')
  })
})

describe('cb_create', () => {
  it('lands a write-tier row and reports the receipt', async () => {
    const { execute, served } = await mount()
    const result = await execute('cb_create', { table: 'item', values: { name: '杀菌乳', type: 'Part' } })
    expect(result.isError).toBe(false)
    expect(result.text).toContain('item_new')
    const call = served.find(s => s.method === 'POST' && s.url.includes('/rest/v1/item'))
    expect(call?.body).toMatchObject({ name: '杀菌乳', type: 'Part', companyId: 'comp_main' })
  })

  it('refuses read-tier tables (the posting surface)', async () => {
    const { execute } = await mount()
    const result = await execute('cb_create', { table: 'receipt', values: { status: 'Draft' } })
    expect(result.isError).toBe(true)
    expect(result.text).toContain('只读层')
  })

  it('refuses a model-supplied companyId (the deployment owns the tenant)', async () => {
    const { execute } = await mount()
    const result = await execute('cb_create', { table: 'customer', values: { name: 'X', companyId: 'comp_other' } })
    expect(result.isError).toBe(true)
    expect(result.text).toContain('companyId')
  })
})

describe('cb_update', () => {
  it('patches named columns and returns the before→after diff', async () => {
    const { execute } = await mount()
    const result = await execute('cb_update', { table: 'customer', id: 'cust_1', values: { name: '新名字' } })
    expect(result.isError).toBe(false)
    expect(result.text).toContain('name: "旧名字" → "新名字"')
  })

  it('refuses an empty values object', async () => {
    const { execute } = await mount()
    const result = await execute('cb_update', { table: 'customer', id: 'cust_1', values: {} })
    expect(result.isError).toBe(true)
    expect(result.text).toContain('at least one column')
  })

  it('refuses a row that does not exist', async () => {
    const { execute } = await mount()
    const result = await execute('cb_update', { table: 'customer', id: 'cust_missing', values: { name: 'X' } })
    expect(result.isError).toBe(true)
    expect(result.text).toContain('does not exist')
  })
})
