/**
 * The W6-R1 unified sign-in session (P1-1) over the nocobase domain and the
 * prompt wire: signIn issues a gateway token, the token's user scope gates
 * nocobase reads (buyer cannot list an out-of-scope collection — the docs
 * deep-link guard's server layer), nocobase.update refuses without a live
 * token, session.prompt derives the acting identity from the token only (a
 * bare loginUser binds nothing), and a repeated clientMsgId answers
 * accepted without a second dispatch (the outbox double-send window).
 */

import { afterEach, describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import AgentRegistry from '@deepseek-ai/dsh-agent'
import SessionStore from '@deepseek-ai/dsh-session'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import UserQuestionService from '@deepseek-ai/dsh-user-questions'
import ViewActionService from '@deepseek-ai/dsh-view-actions'
import { createApiProxy } from '../src/api-proxy.ts'
import type { RpcRequest } from '../src/api/rpc.ts'

const NC_TOKEN = 'nocobase-auth-spec-token'

/** The mock wire's engine-stub descriptor (origin + the shared request log). */
interface EngineStub { origin: string; requests: Array<{ url: string; method: string }> }

/** Install the mock NocoBase wire (sign-in + rows); the optional engine stub answers /alerts/act on a distinct origin. */
function stubNocoBaseFetch(engine: EngineStub | undefined): { requests: Array<{ url: string; method: string; body?: unknown }> } {
  const requests: Array<{ url: string; method: string; body?: unknown }> = []
  vi.stubGlobal('fetch', vi.fn(async (input: string | URL, init?: RequestInit): Promise<Response> => {
    const url = typeof input === 'string' ? input : input.href
    const method = (init?.method ?? 'GET').toUpperCase()
    const body = init?.body === undefined ? undefined : JSON.parse(init.body as string) as Record<string, unknown>
    requests.push({ url, method, body })
    const parsed = new URL(url)
    if (engine !== undefined && parsed.origin === engine.origin && parsed.pathname === '/alerts/act') {
      // The engine's transition-table whitelist: buyer claims move, keeper's attempt refuses.
      if (body?.['user'] === 'buyer' && body?.['action'] === 'claim') {
        return Response.json({ ok: true, id: body?.['id'], action: 'claim', user: 'buyer', moved: 1 })
      }
      return Response.json({ ok: false, error: `动作被拒（id=${String(body?.['id'])} ${String(body?.['action'])} by ${String(body?.['user'])}）` }, { status: 403 })
    }
    if (parsed.pathname === '/api/auth:signIn') {
      const credentials = JSON.parse((init?.body ?? '{}') as string) as { account?: string; password?: string }
      const known: Record<string, { username: string; nickname: string }> = {
        'buyer': { username: 'buyer', nickname: '采购员·蔡俊' },
        'keeper': { username: 'keeper', nickname: '仓管员·高远' },
        'admin': { username: 'admin', nickname: '管理员' },
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
    if (parsed.pathname === '/api/orders:list') {
      return Response.json({ data: [{ id: 12, status: 'shipped' }], meta: { count: 1, page: 1, pageSize: 20 } })
    }
    if (parsed.pathname === '/api/wfl_approval_todos:list') {
      return Response.json({ data: [], meta: { count: 0, page: 1, pageSize: 20 } })
    }
    if (parsed.pathname === '/api/wfl_alerts:list') {
      return Response.json({ data: [
        { id: 1, notify_users: ['buyer'], owner: null },
        { id: 2, notify_users: ['finance'], owner: null },
        { id: 3, notify_users: [], owner: 'admin' },
      ], meta: { count: 3, page: 1, pageSize: 20 } })
    }
    if (parsed.pathname === '/api/auditLog:list') {
      return Response.json({ data: [], meta: { count: 0, page: 1, pageSize: 20 } })
    }
    if (parsed.pathname === '/api/orders:update') {
      return Response.json({ data: { id: 12, status: 'patched' } })
    }
    if (parsed.pathname === '/api/wfl_alerts:update') {
      return Response.json({ data: { id: 9, status: 'resolved' } })
    }
    return new Response('{"error":"not found"}', { status: 404 })
  }))
  return { requests }
}

async function harness(defaults: {
  nocobaseCollectionScopes?: Readonly<Record<string, readonly string[]>>
  nocobaseWflWriteScopes?: Readonly<Record<string, readonly string[]>>
  alertEngineUrl?: string
} = {}) {
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
    ...defaults.nocobaseCollectionScopes === undefined ? {} : { nocobaseCollectionScopes: defaults.nocobaseCollectionScopes },
    ...defaults.nocobaseWflWriteScopes === undefined ? {} : { nocobaseWflWriteScopes: defaults.nocobaseWflWriteScopes },
    ...defaults.alertEngineUrl === undefined ? {} : { alertEngineUrl: defaults.alertEngineUrl },
  })
  return { api, ctx }
}

afterEach(() => {
  vi.unstubAllGlobals()
  delete process.env.NOCOBASE_API_KEY
  delete process.env.NOCOBASE_BASE_URL
  delete process.env.W6_ALERT_ENGINE_URL
})

/** One typed RPC request envelope. */
function request<P>(rpcId: string, payload: P): RpcRequest<P> {
  return { rpcId: rpcId as never, payload }
}

describe('nocobase signIn issues the gateway session token', () => {
  it('answers the verified profile plus a token; wrong credentials refuse', async () => {
    process.env.NOCOBASE_API_KEY = NC_TOKEN
    stubNocoBaseFetch(undefined)
    const { api, ctx } = await harness()
    const good = await api.nocobase.signIn(request('r', { account: 'buyer', password: 'Buyer#2026' }))
    expect(good.result).toMatchObject({ ok: true, value: { username: 'buyer', nickname: '采购员·蔡俊' } })
    const token = good.result.ok ? good.result.value.token : ''
    expect(typeof token).toBe('string')
    expect(token.length).toBeGreaterThan(0)
    const bad = await api.nocobase.signIn(request('r', { account: 'buyer', password: 'wrong' }))
    expect(bad.result).toMatchObject({ ok: false, error: { code: 'nocobase-signin-rejected' } })
    await ctx.fiber.dispose()
  })
})

describe('nocobase reads enforce the signed-in collection scope', () => {
  it("refuses buyer's out-of-scope collection, passes the scoped one and anonymous reads", async () => {
    process.env.NOCOBASE_API_KEY = NC_TOKEN
    stubNocoBaseFetch(undefined)
    const { api, ctx } = await harness({ nocobaseCollectionScopes: { buyer: ['orders'] } })
    const signedIn = await api.nocobase.signIn(request('r', { account: 'buyer', password: 'Buyer#2026' }))
    const token = signedIn.result.ok ? signedIn.result.value.token : undefined
    expect(token).toBeDefined()
    const forbidden = await api.nocobase.list(request('r', { collection: 'auditLog', ...(token === undefined ? {} : { authToken: token }) }))
    expect(forbidden.result).toMatchObject({
      ok: false,
      error: { code: 'nocobase-collection-forbidden', details: { collection: 'auditLog', username: 'buyer' } },
    })
    const allowed = await api.nocobase.list(request('r', { collection: 'orders', ...(token === undefined ? {} : { authToken: token }) }))
    expect(allowed.result).toMatchObject({ ok: true, value: { count: 1 } })
    const anonymous = await api.nocobase.list(request('r', { collection: 'auditLog' }))
    expect(anonymous.result).toMatchObject({ ok: true })
    const stale = await api.nocobase.list(request('r', { collection: 'orders', authToken: 'not-a-token' }))
    expect(stale.result).toMatchObject({ ok: false, error: { code: 'nocobase-unauthorized' } })
    // The wfl_* engine tables (todos/records) are every role's shared
    // workflow surface — the scope table governs business collections only.
    const todos = await api.nocobase.list(request('r', { collection: 'wfl_approval_todos', ...(token === undefined ? {} : { authToken: token }) }))
    expect(todos.result).toMatchObject({ ok: true, value: { count: 0 } })
    await ctx.fiber.dispose()
  })
})

describe('nocobase.update requires a live sign-in token', () => {
  it('refuses the anonymous write and passes the signed-in scoped one', async () => {
    process.env.NOCOBASE_API_KEY = NC_TOKEN
    stubNocoBaseFetch(undefined)
    const { api, ctx } = await harness({ nocobaseCollectionScopes: { buyer: ['orders'] } })
    const refused = await api.nocobase.update(request('r', { collection: 'orders', id: 12, values: { status: 'x' } }))
    expect(refused.result).toMatchObject({ ok: false, error: { code: 'nocobase-unauthorized' } })
    const signedIn = await api.nocobase.signIn(request('r', { account: 'buyer', password: 'Buyer#2026' }))
    const token = signedIn.result.ok ? signedIn.result.value.token : undefined
    const allowed = await api.nocobase.update(request('r', { collection: 'orders', id: 12, values: { status: 'x' }, ...(token === undefined ? {} : { authToken: token }) }))
    expect(allowed.result).toMatchObject({ ok: true, value: { row: { id: 12, status: 'patched' } } })
    await ctx.fiber.dispose()
  })
})

describe('nocobase.update splits the wfl_ exemption by verb (W6-R2 C-2)', () => {
  it('refuses a signed-in wfl_ write by default; the reads stay open; the explicit whitelist admits one', async () => {
    process.env.NOCOBASE_API_KEY = NC_TOKEN
    stubNocoBaseFetch(undefined)
    const { api, ctx } = await harness({ nocobaseCollectionScopes: { buyer: ['orders'] } })
    const signedIn = await api.nocobase.signIn(request('r', { account: 'buyer', password: 'Buyer#2026' }))
    const token = signedIn.result.ok ? signedIn.result.value.token : undefined
    expect(token).toBeDefined()
    // The perm-probe path: a logged-in keeper-class token patching someone
    // else's alert row through the gateway must refuse, not forward.
    const refused = await api.nocobase.update(request('r', { collection: 'wfl_alerts', id: 9, values: { status: 'resolved' }, ...(token === undefined ? {} : { authToken: token }) }))
    expect(refused.result).toMatchObject({
      ok: false,
      error: { code: 'nocobase-collection-forbidden', details: { collection: 'wfl_alerts', username: 'buyer' } },
    })
    // Regression: the shared workflow READS every signed-in role still owns.
    const todos = await api.nocobase.list(request('r', { collection: 'wfl_approval_todos', ...(token === undefined ? {} : { authToken: token }) }))
    expect(todos.result).toMatchObject({ ok: true, value: { count: 0 } })
    // The explicit per-user whitelist (the rare business case) forwards.
    const whitelisted = await harness({ nocobaseWflWriteScopes: { buyer: ['wfl_alerts'] } })
    const allowed = await whitelisted.api.nocobase.update(request('r', { collection: 'wfl_alerts', id: 9, values: { resolve_note: '对账备注' }, ...(token === undefined ? {} : { authToken: token }) }))
    expect(allowed.result).toMatchObject({ ok: true, value: { row: { id: 9 } } })
    await ctx.fiber.dispose()
    await whitelisted.ctx.fiber.dispose()
  })
})

describe('wfl_alerts reads scope by the signed-in row face (W6-R2 C-2 IDOR)', () => {
  it('refuses anonymous reads, filters rows to the routed/owner set, admin reads all', async () => {
    process.env.NOCOBASE_API_KEY = NC_TOKEN
    stubNocoBaseFetch(undefined)
    const { api, ctx } = await harness()
    const anonymous = await api.nocobase.list(request('r', { collection: 'wfl_alerts' }))
    expect(anonymous.result).toMatchObject({ ok: false, error: { code: 'nocobase-unauthorized' } })
    const buyerIn = await api.nocobase.signIn(request('b', { account: 'buyer', password: 'Buyer#2026' }))
    const buyerToken = buyerIn.result.ok ? buyerIn.result.value.token : undefined
    const buyerRows = await api.nocobase.list(request('r', { collection: 'wfl_alerts', ...(buyerToken === undefined ? {} : { authToken: buyerToken }) }))
    expect(buyerRows.result).toMatchObject({ ok: true, value: { count: 1 } })
    if (buyerRows.result.ok) {
      expect(buyerRows.result.value.rows.every(row => (row['notify_users'] as unknown[]).includes('buyer') || row['owner'] === 'buyer')).toBe(true)
    }
    const adminIn = await api.nocobase.signIn(request('a', { account: 'admin', password: 'Buyer#2026' }))
    const adminToken = adminIn.result.ok ? adminIn.result.value.token : undefined
    const adminRows = await api.nocobase.list(request('r', { collection: 'wfl_alerts', ...(adminToken === undefined ? {} : { authToken: adminToken }) }))
    expect(adminRows.result).toMatchObject({ ok: true, value: { count: 3 } })
    await ctx.fiber.dispose()
  })
})

describe('nocobase.alertAct rides the session identity to the engine entrance (W6-R2 C-1)', () => {
  it('refuses unconfigured/anonymous calls, derives user from the token, surfaces the engine 403', async () => {
    process.env.NOCOBASE_API_KEY = NC_TOKEN
    const engine: EngineStub = { origin: 'http://engine.test', requests: [] }
    const wire = stubNocoBaseFetch(engine)
    const bare = await harness()
    // Identity gates first: a signed-in caller on an engine-less deployment
    // meets the structured unconfigured refusal (the anonymous probe follows
    // on the configured harness below).
    const bareIn = await bare.api.nocobase.signIn(request('b0', { account: 'buyer', password: 'Buyer#2026' }))
    const bareToken = bareIn.result.ok ? bareIn.result.value.token : undefined
    const unconfigured = await bare.api.nocobase.alertAct(request('u', { id: 7, action: 'claim', ...(bareToken === undefined ? {} : { authToken: bareToken }) }))
    expect(unconfigured.result).toMatchObject({ ok: false, error: { code: 'alert-engine-unconfigured' } })
    await bare.ctx.fiber.dispose()
    const { api, ctx } = await harness({ alertEngineUrl: 'http://engine.test' })
    const anonymous = await api.nocobase.alertAct(request('a', { id: 7, action: 'claim' }))
    expect(anonymous.result).toMatchObject({ ok: false, error: { code: 'nocobase-unauthorized' } })
    const signedIn = await api.nocobase.signIn(request('s', { account: 'buyer', password: 'Buyer#2026' }))
    const token = signedIn.result.ok ? signedIn.result.value.token : undefined
    const claimed = await api.nocobase.alertAct(request('c', { id: 7, action: 'claim', ...(token === undefined ? {} : { authToken: token }) }))
    expect(claimed.result).toMatchObject({ ok: true, value: { id: 7, action: 'claim', user: 'buyer' } })
    // The engine saw the token-derived identity, never a wire-narrated one.
    const engineCall = wire.requests.find(entry => entry.url === 'http://engine.test/alerts/act')
    expect(engineCall?.body).toMatchObject({ id: 7, action: 'claim', user: 'buyer' })
    const keeperIn = await api.nocobase.signIn(request('k', { account: 'keeper', password: 'Buyer#2026' }))
    const keeperToken = keeperIn.result.ok ? keeperIn.result.value.token : undefined
    const refused = await api.nocobase.alertAct(request('r', { id: 7, action: 'claim', ...(keeperToken === undefined ? {} : { authToken: keeperToken }) }))
    expect(refused.result).toMatchObject({ ok: false, error: { code: 'nocobase-alert-refused' } })
    await ctx.fiber.dispose()
  })
})

describe('session.prompt derives identity from the token and dedups clientMsgId', () => {
  /** Create one idle agent session the prompt wire can address (the cold-spec pattern). */
  function sessionOf(ctx: Context): { id: string; followup: ReturnType<typeof vi.fn> } {
    const session = ctx.sessions.create()
    const followup = vi.fn()
    ctx.agents.register({ id: session.id, session, status: 'idle', ctx, followup } as never)
    return { id: String(session.id), followup }
  }

  it('binds nothing from a bare loginUser (identity is never client-narrated)', async () => {
    const { api, ctx } = await harness()
    const { id: sessionId, followup } = sessionOf(ctx)
    const prompted = await api.sessions.prompt(request('r', {
      sessionId: sessionId as never,
      mode: 'queue',
      content: [{ type: 'text', text: '帮我在采购单上签字' }],
      loginUser: { username: 'chenliqun', nickname: '总经理' },
    }))
    expect(prompted.result).toMatchObject({ ok: true, value: { accepted: true } })
    // The dispatched message carries no identity stamp: a forged loginUser
    // bound nothing server-side (nb_approve will refuse the anonymous turn).
    const dispatched = JSON.stringify(followup.mock.calls)
    expect(dispatched).not.toContain('【登录身份】')
    expect(dispatched).not.toContain('chenliqun')
    await ctx.fiber.dispose()
  })

  it('refuses a presented-but-invalid token and stamps the credential identity', async () => {
    process.env.NOCOBASE_API_KEY = NC_TOKEN
    stubNocoBaseFetch(undefined)
    const { api, ctx } = await harness()
    const { id: sessionId, followup } = sessionOf(ctx)
    const stale = await api.sessions.prompt(request('r', {
      sessionId: sessionId as never,
      mode: 'queue',
      content: [{ type: 'text', text: '帮我登记' }],
      loginUser: { username: 'buyer', nickname: '采购员·蔡俊' },
      authToken: 'not-a-token',
    }))
    expect(stale.result).toMatchObject({ ok: false, error: { code: 'nocobase-unauthorized' } })
    const signedIn = await api.nocobase.signIn(request('s', { account: 'buyer', password: 'Buyer#2026' }))
    const token = signedIn.result.ok ? signedIn.result.value.token : undefined
    const second = await api.sessions.prompt(request('r2', {
      sessionId: sessionId as never,
      mode: 'queue',
      content: [{ type: 'text', text: '帮我登记采购单' }],
      loginUser: { username: 'buyer', nickname: '采购员·蔡俊' },
      ...(token === undefined ? {} : { authToken: token }),
    }))
    expect(second.result).toMatchObject({ ok: true, value: { accepted: true } })
    // The opening message carries the credential-derived identity stamp.
    expect(JSON.stringify(followup.mock.calls)).toContain('【登录身份】buyer（采购员·蔡俊）')
    await ctx.fiber.dispose()
  })

  it('answers a repeated clientMsgId accepted without a second dispatch', async () => {
    const { api, ctx } = await harness()
    const { id: sessionId, followup } = sessionOf(ctx)
    const payload = {
      sessionId: sessionId as never,
      mode: 'queue' as const,
      content: [{ type: 'text' as const, text: '确认写入' }],
      clientMsgId: 'm_dedup_1',
    }
    const first = await api.sessions.prompt(request('r1', payload))
    expect(first.result).toMatchObject({ ok: true, value: { accepted: true } })
    const second = await api.sessions.prompt(request('r2', payload))
    expect(second.result).toMatchObject({ ok: true, value: { accepted: true } })
    // The duplicate collapsed before the agent: exactly one dispatch.
    expect(followup).toHaveBeenCalledOnce()
    await ctx.fiber.dispose()
  })
})
