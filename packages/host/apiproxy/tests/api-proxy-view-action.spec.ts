/**
 * Gateway view-actions channel: the question channel's automatic sibling.
 * Pins the wire round-trip (view-action/requested → client-response →
 * resolve), the fail-loud gates (unknown action vs the reported catalog,
 * timeout), the browser-failure mapping, and the malformed-answer rejection.
 */
import { describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import AgentRegistry, { type Agent } from '@deepseek-ai/dsh-agent'
import SessionStore from '@deepseek-ai/dsh-session'
import UserQuestionService from '@deepseek-ai/dsh-user-questions'
import ViewActionService, { ViewActionError } from '@deepseek-ai/dsh-view-actions'
import { ViewStateService } from '@deepseek-ai/dsh-view-context'
import type { ApiProxy, MuxFrame, RpcRequest } from '@deepseek-ai/dsh-host-apiproxy/api'
import { RpcId } from '@deepseek-ai/dsh-host-apiproxy/api/rpc'
import { createApiProxy, DEFAULT_VIEW_ACTION_TIMEOUT_MS } from '../src/api-proxy.ts'

async function harness(viewActionTimeoutMs?: number): Promise<{ ctx: Context; api: ApiProxy }> {
  const ctx = new Context()
  await ctx.plugin(SessionStore)
  await ctx.plugin(AgentRegistry)
  await ctx.plugin(UserQuestionService)
  await ctx.plugin(ViewActionService)
  new ViewStateService(ctx)
  return {
    ctx,
    api: createApiProxy(ctx, {
      defaultModelSelection: () => ({ provider: 'p', model: 'm' }),
      cwd: '/tmp',
      ...(viewActionTimeoutMs === undefined ? {} : { viewActionTimeoutMs }),
    }),
  }
}

function agent(ctx: Context, catalog: Record<string, readonly string[]>): Agent {
  const session = ctx.sessions.create()
  // `inbox.hasPending: false` keeps the mux-open queue baseline (which reads
  // every listed session's inbox) satisfied for this stub.
  const value = { id: session.id, session, status: 'idle', ctx, inbox: { hasPending: false } } as Agent
  ctx.agents.register(value)
  ctx.viewState.report(session.id, { view: 'kg', snapshot: {}, actions: catalog })
  return value
}

function openMux(api: ApiProxy, abort: AbortController): {
  waitForAction(): Promise<RpcRequest<Extract<MuxFrame, { type: 'view-action/requested' }>>>
} {
  let resolveAction!: (value: RpcRequest<Extract<MuxFrame, { type: 'view-action/requested' }>>) => void
  const action = new Promise<RpcRequest<Extract<MuxFrame, { type: 'view-action/requested' }>>>((resolve) => {
    resolveAction = resolve
  })
  void (async () => {
    for await (const envelope of api.events.mux({ rpcId: RpcId('view-mux'), payload: {} }, abort.signal)) {
      if (envelope.payload.type === 'view-action/requested') {
        resolveAction(envelope as RpcRequest<Extract<MuxFrame, { type: 'view-action/requested' }>>)
      }
    }
  })()
  return { waitForAction: () => action }
}

function applied(
  envelope: RpcRequest<Extract<MuxFrame, { type: 'view-action/requested' }>>,
  summary: string,
): Parameters<ApiProxy['respond']>[0] {
  return {
    type: 'client-response',
    rpcId: envelope.rpcId,
    result: { ok: true, value: { sessionId: envelope.payload.sessionId, summary } },
  }
}

describe('view-actions gateway channel', () => {
  it('round-trips a whitelisted action and resolves with the browser summary', async () => {
    const { ctx, api } = await harness()
    const owner = agent(ctx, { kg: ['set_type_filter'] })
    const abort = new AbortController()
    const mux = openMux(api, abort)

    const result = ctx.viewActions.apply({
      view: 'kg', action: 'set_type_filter', args: { types: ['Supplier'] }, agent: owner,
    })
    const requested = await mux.waitForAction()
    expect(requested.payload).toMatchObject({
      type: 'view-action/requested',
      view: 'kg', action: 'set_type_filter',
      args: { types: ['Supplier'] },
    })
    expect(await api.respond(applied(requested, '已将图谱类型过滤为 [Supplier]'))).toEqual({ accepted: true })
    await expect(result).resolves.toEqual({ summary: '已将图谱类型过滤为 [Supplier]' })
    abort.abort()
  })

  it('rejects an unknown action before the wire using the reported catalog', async () => {
    const { ctx, api } = await harness()
    void api
    const owner = agent(ctx, { kg: ['set_type_filter'] })
    await expect(ctx.viewActions.apply({
      view: 'kg', action: 'focus_entity', args: {}, agent: owner,
    })).rejects.toMatchObject({ code: 'UNKNOWN_ACTION' })
  })

  it('switch_view bypasses the catalog gate (host built-in navigation)', async () => {
    const { ctx, api } = await harness()
    const owner = agent(ctx, {})
    const abort = new AbortController()
    const mux = openMux(api, abort)
    const result = ctx.viewActions.apply({ view: 'kg', action: 'switch_view', args: {}, agent: owner })
    const requested = await mux.waitForAction()
    expect(requested.payload.action).toBe('switch_view')
    expect(await api.respond(applied(requested, '已切换到视图 kg'))).toEqual({ accepted: true })
    await expect(result).resolves.toEqual({ summary: '已切换到视图 kg' })
    abort.abort()
  })

  it('times out fail-loud when the browser never answers', async () => {
    vi.useFakeTimers()
    try {
      const { ctx, api } = await harness(1_000)
      const owner = agent(ctx, { kg: ['set_type_filter'] })
      const abort = new AbortController()
      const mux = openMux(api, abort)
      const result = ctx.viewActions.apply({
        view: 'kg', action: 'set_type_filter', args: {}, agent: owner,
      })
      // Attach the consumer before the timer fires, or the rejection reads as unhandled.
      const settled = result.then(
        (value: { summary: string }) => { throw new Error(`unexpected success: ${value.summary}`) },
        (error: unknown) => error as { code?: string },
      )
      await mux.waitForAction()
      await vi.advanceTimersByTimeAsync(DEFAULT_VIEW_ACTION_TIMEOUT_MS)
      await expect(settled).resolves.toMatchObject({ code: 'APPLY_TIMEOUT' })
      abort.abort()
    } finally {
      vi.useRealTimers()
    }
  })

  it('maps a browser execution failure to a readable rejection', async () => {
    const { ctx, api } = await harness()
    const owner = agent(ctx, { kg: ['set_type_filter'] })
    const abort = new AbortController()
    const mux = openMux(api, abort)
    const result = ctx.viewActions.apply({
      view: 'kg', action: 'set_type_filter', args: {}, agent: owner,
    })
    const requested = await mux.waitForAction()
    expect(await api.respond({
      type: 'client-response',
      rpcId: requested.rpcId,
      result: { ok: false, error: { code: 'view-action-failed', message: '当前画布中找不到实体', details: {} } },
    })).toEqual({ accepted: true })
    await expect(result).rejects.toBeInstanceOf(ViewActionError)
    abort.abort()
  })

  it('rejects a session-mismatched answer as bad-response (audit correlation)', async () => {
    vi.useFakeTimers()
    const { ctx, api } = await harness(1_000)
    const owner = agent(ctx, { kg: ['set_type_filter'] })
    const abort = new AbortController()
    const mux = openMux(api, abort)
    const result = ctx.viewActions.apply({
      view: 'kg', action: 'set_type_filter', args: {}, agent: owner,
    })
    // Attach the consumer before the timer fires, or the rejection reads as unhandled.
    const settled = result.then(
      (value: { summary: string }) => { throw new Error(`unexpected success: ${value.summary}`) },
      (error: unknown) => error as { code?: string },
    )
    const requested = await mux.waitForAction()
    expect(await api.respond({
      type: 'client-response',
      rpcId: requested.rpcId,
      result: { ok: true, value: { sessionId: 'not-the-session', summary: 'x' } },
    })).toEqual({ accepted: false, reason: 'bad-response' })
    abort.abort()
    // Advance past the configured timeout so the still-pending entry settles
    // inside the test instead of leaking its rejection afterwards.
    await vi.advanceTimersByTimeAsync(2_000)
    await expect(settled).resolves.toMatchObject({ code: 'APPLY_TIMEOUT' })
    vi.useRealTimers()
    void ctx
  })
})
