/**
 * The W8-B3 mobile work projection over the nocobase domain: wfl_mobile_work
 * reads are owner-scoped by row (an anonymous read refuses; the gateway
 * pushes the acting username into the row filter, so a client-narrated
 * foreign filter cannot widen it), mobileWorkSave forces the acting account
 * onto the row and only touches the caller's own row, and mobileWorkDelete
 * stays idempotent — a row another account owns is invisible, never
 * destroyed.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import AgentRegistry from '@deepseek-ai/dsh-agent'
import SessionStore from '@deepseek-ai/dsh-session'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import UserQuestionService from '@deepseek-ai/dsh-user-questions'
import ViewActionService from '@deepseek-ai/dsh-view-actions'
import { createApiProxy } from '../src/api-proxy.ts'
import type { RpcRequest } from '../src/api/rpc.ts'

const NC_TOKEN = 'nocobase-mobile-work-spec-token'

/** One projection row as the stub table stores it. */
interface WorkRow {
  id: number
  user: string
  client_id: string
  title: string
  status: string
  created_at: number
  updated_at: number
}

/** The mutable stub table (the spec's rows land and leave here; every test re-seeds it). */
const table: WorkRow[] = []

/** Re-seed the two fixture rows (a cross-test leak would turn the owner-scope assertions meaningless). */
function resetTable(): void {
  table.length = 0
  table.push(
    { id: 1, user: 'buyer', client_id: 'w_buyer_1', title: 'buyer 的工作项', status: 'todo', created_at: 100, updated_at: 100 },
    { id: 2, user: 'keeper', client_id: 'w_keeper_1', title: 'keeper 的工作项', status: 'doing', created_at: 100, updated_at: 100 },
  )
}

/** Install the mock NocoBase wire (sign-in + the projection table's CRUD). */
function stubNocoBaseFetch(): { requests: Array<{ url: string; method: string }> } {
  const requests: Array<{ url: string; method: string }> = []
  let nextId = 3
  vi.stubGlobal('fetch', vi.fn(async (input: string | URL, init?: RequestInit): Promise<Response> => {
    const url = typeof input === 'string' ? input : input.href
    const method = (init?.method ?? 'GET').toUpperCase()
    requests.push({ url, method })
    const parsed = new URL(url)
    if (parsed.pathname === '/api/auth:signIn') {
      const credentials = JSON.parse((init?.body ?? '{}') as string) as { account?: string; password?: string }
      const known: Record<string, { username: string; nickname: string }> = {
        'buyer': { username: 'buyer', nickname: '采购员·蔡俊' },
        'keeper': { username: 'keeper', nickname: '仓管员·高远' },
      }
      const profile = known[credentials.account ?? '']
      if (profile !== undefined && credentials.password === 'Buyer#2026') {
        return Response.json({ data: { user: profile } })
      }
      return Response.json({ errors: [{ message: '用户名/邮箱或密码有误，请重新输入' }] }, { status: 401 })
    }
    if ((init?.headers as Record<string, unknown> | undefined)?.authorization !== `Bearer ${NC_TOKEN}`) {
      return new Response('{"error":{"code":"INVALID_TOKEN"}}', { status: 401 })
    }
    if (parsed.pathname === '/api/wfl_mobile_work:list') {
      // The server-side half of the row scope: the gateway's injected user
      // condition (AND-ed with the caller's client_id condition) decides
      // what comes back, exactly like the real backend executing the filter.
      const filter = JSON.parse(parsed.searchParams.get('filter') ?? '{}') as {
        user?: { $eq?: string }
        client_id?: { $eq?: string }
      }
      const rows = table.filter(row =>
        (filter.user?.$eq === undefined || row.user === filter.user.$eq)
        && (filter.client_id?.$eq === undefined || row.client_id === filter.client_id.$eq))
      return Response.json({ data: rows, meta: { count: rows.length, page: 1, pageSize: 100 } })
    }
    if (parsed.pathname.startsWith('/api/wfl_mobile_work/')) {
      const id = Number(parsed.pathname.split('/').at(-1))
      const row = table.find(entry => entry.id === id)
      return row === undefined ? new Response('{"error":"not found"}', { status: 404 }) : Response.json({ data: row })
    }
    if (parsed.pathname === '/api/wfl_mobile_work:create') {
      const values = JSON.parse((init?.body ?? '{}') as string) as Partial<WorkRow>
      const row: WorkRow = {
        id: nextId++,
        user: String(values['user'] ?? ''),
        client_id: String(values['client_id'] ?? ''),
        title: String(values['title'] ?? ''),
        status: String(values['status'] ?? 'todo'),
        created_at: Number(values['created_at'] ?? 0),
        updated_at: Number(values['updated_at'] ?? 0),
      }
      table.push(row)
      return Response.json({ data: row })
    }
    if (parsed.pathname === '/api/wfl_mobile_work:update') {
      const id = Number(parsed.searchParams.get('filterByTk'))
      const values = JSON.parse((init?.body ?? '{}') as string) as Partial<WorkRow>
      const row = table.find(entry => entry.id === id)
      if (row !== undefined) Object.assign(row, values)
      return Response.json({ data: row ?? null })
    }
    if (parsed.pathname === '/api/wfl_mobile_work:destroy') {
      const id = Number(parsed.searchParams.get('filterByTk'))
      const index = table.findIndex(entry => entry.id === id)
      if (index !== -1) table.splice(index, 1)
      return Response.json({ data: null })
    }
    return new Response('{"error":"not found"}', { status: 404 })
  }))
  return { requests }
}

async function harness() {
  const ctx = new Context()
  await ctx.plugin(SessionStore)
  await ctx.plugin(SystemPrompt, { persona: '' })
  await ctx.plugin(UserQuestionService)
  await ctx.plugin(ViewActionService)
  await ctx.plugin(AgentRegistry)
  const api = createApiProxy(ctx, {
    defaultModelSelection: () => ({ provider: 'p', model: 'm' }),
    saveDefaultModelSelection: async () => {},
    cwd: '/tmp',
    nocobaseEnabled: true,
    nocobaseBaseUrl: 'http://nc.test',
    nocobaseWriteEnabled: true,
  })
  return { api, ctx }
}

afterEach(() => {
  vi.unstubAllGlobals()
  delete process.env.NOCOBASE_API_KEY
})

/** One typed RPC request envelope. */
function request<P>(rpcId: string, payload: P): RpcRequest<P> {
  return { rpcId: rpcId as never, payload }
}

beforeEach(() => {
  resetTable()
})

beforeEach(() => {
  resetTable()
})

beforeEach(() => {
  resetTable()
})

const VALUES = { title: '同步项', status: 'todo' as const, created_at: 1, updated_at: 1 }

describe('wfl_mobile_work reads are owner-scoped by row', () => {
  it('refuses anonymous reads; the acting username rides the pushed-down filter; a narrated foreign filter cannot widen it', async () => {
    process.env.NOCOBASE_API_KEY = NC_TOKEN
    const { requests } = stubNocoBaseFetch()
    const { api, ctx } = await harness()
    const anonymous = await api.nocobase.list(request('r', { collection: 'wfl_mobile_work' }))
    expect(anonymous.result).toMatchObject({ ok: false, error: { code: 'nocobase-unauthorized' } })

    const signedIn = await api.nocobase.signIn(request('r', { account: 'buyer', password: 'Buyer#2026' }))
    const token = signedIn.result.ok ? signedIn.result.value.token : undefined
    expect(token).toBeDefined()
    const mine = await api.nocobase.list(request('r', {
      collection: 'wfl_mobile_work',
      // A client-narrated foreign filter stays AND-ed under the pushed-down owner condition.
      filter: [{ field: 'user', op: 'eq', value: 'keeper' }],
      ...(token === undefined ? {} : { authToken: token }),
    }))
    expect(mine.result).toMatchObject({ ok: true, value: { count: 1 } })
    expect(mine.result.ok && mine.result.value.rows[0]?.['client_id']).toBe('w_buyer_1')
    const listCall = requests.find(entry => entry.url.includes('/api/wfl_mobile_work:list'))
    expect(listCall).toBeDefined()
    expect(listCall?.url).toContain(encodeURIComponent('"user"'))
    await ctx.fiber.dispose()
  })
})

describe('nocobase.mobileWorkSave forces the acting account', () => {
  it('refuses without a session, creates with the token-derived owner, and updates only the caller row', async () => {
    process.env.NOCOBASE_API_KEY = NC_TOKEN
    stubNocoBaseFetch()
    const { api, ctx } = await harness()
    const refused = await api.nocobase.mobileWorkSave(request('r', { clientId: 'w_new', values: VALUES }))
    expect(refused.result).toMatchObject({ ok: false, error: { code: 'nocobase-unauthorized' } })

    const signedIn = await api.nocobase.signIn(request('r', { account: 'buyer', password: 'Buyer#2026' }))
    const token = signedIn.result.ok ? signedIn.result.value.token : undefined
    const created = await api.nocobase.mobileWorkSave(request('r', {
      clientId: 'w_buyer_new', values: VALUES, ...(token === undefined ? {} : { authToken: token }),
    }))
    expect(created.result).toMatchObject({ ok: true, value: { clientId: 'w_buyer_new', user: 'buyer' } })
    const stored = table.find(row => row.client_id === 'w_buyer_new')
    expect(stored?.['user']).toBe('buyer')

    // A save naming keeper's clientId creates buyer's own row (the lookup
    // is user-scoped), never rewrites keeper's.
    const cross = await api.nocobase.mobileWorkSave(request('r', {
      clientId: 'w_keeper_1', values: { ...VALUES, title: '越权改写' }, ...(token === undefined ? {} : { authToken: token }),
    }))
    expect(cross.result).toMatchObject({ ok: true })
    expect(table.find(row => row.client_id === 'w_keeper_1')?.['title']).toBe('keeper 的工作项')
    expect(table.filter(row => row.client_id === 'w_keeper_1').length).toBe(2)
    await ctx.fiber.dispose()
  })
})

describe('nocobase.mobileWorkDelete stays owner-scoped and idempotent', () => {
  it("never destroys another account's row; a missing row answers success", async () => {
    process.env.NOCOBASE_API_KEY = NC_TOKEN
    const { requests } = stubNocoBaseFetch()
    const { api, ctx } = await harness()
    const anonymous = await api.nocobase.mobileWorkDelete(request('r', { clientId: 'w_buyer_1' }))
    expect(anonymous.result).toMatchObject({ ok: false, error: { code: 'nocobase-unauthorized' } })

    const signedIn = await api.nocobase.signIn(request('r', { account: 'keeper', password: 'Buyer#2026' }))
    const token = signedIn.result.ok ? signedIn.result.value.token : undefined
    const foreign = await api.nocobase.mobileWorkDelete(request('r', { clientId: 'w_buyer_1', ...(token === undefined ? {} : { authToken: token }) }))
    expect(foreign.result).toMatchObject({ ok: true, value: { clientId: 'w_buyer_1', user: 'keeper' } })
    expect(requests.some(entry => entry.url.includes('/api/wfl_mobile_work:destroy'))).toBe(false)
    expect(table.find(row => row.client_id === 'w_buyer_1')).toBeDefined()

    const own = await api.nocobase.mobileWorkDelete(request('r', { clientId: 'w_keeper_1', ...(token === undefined ? {} : { authToken: token }) }))
    expect(own.result).toMatchObject({ ok: true })
    expect(table.find(row => row.client_id === 'w_keeper_1')).toBeUndefined()
    // The replayed delete converges without error.
    const replay = await api.nocobase.mobileWorkDelete(request('r', { clientId: 'w_keeper_1', ...(token === undefined ? {} : { authToken: token }) }))
    expect(replay.result).toMatchObject({ ok: true })
    await ctx.fiber.dispose()
  })
})

describe('wfl_mobile_work single-row reads keep the owner scope', () => {
  it('refuses a row another account owns', async () => {
    process.env.NOCOBASE_API_KEY = NC_TOKEN
    stubNocoBaseFetch()
    const { api, ctx } = await harness()
    const signedIn = await api.nocobase.signIn(request('r', { account: 'buyer', password: 'Buyer#2026' }))
    const token = signedIn.result.ok ? signedIn.result.value.token : undefined
    const own = await api.nocobase.get(request('r', { collection: 'wfl_mobile_work', id: 1, ...(token === undefined ? {} : { authToken: token }) }))
    expect(own.result).toMatchObject({ ok: true })
    const foreign = await api.nocobase.get(request('r', { collection: 'wfl_mobile_work', id: 2, ...(token === undefined ? {} : { authToken: token }) }))
    expect(foreign.result).toMatchObject({ ok: false, error: { code: 'nocobase-collection-forbidden' } })
    await ctx.fiber.dispose()
  })
})
