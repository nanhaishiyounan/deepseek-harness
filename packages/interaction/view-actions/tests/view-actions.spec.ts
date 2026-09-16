import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it, vi } from 'vitest'
import AgentRegistry, { type Agent } from '@deepseek-ai/dsh-agent'
import ViewActionService, {
  ViewActionError,
  type ViewActionProvider,
  type ViewActionRequest,
} from '@deepseek-ai/dsh-view-actions'

function stubAgent(id: string): Agent {
  const agentId = id as Agent['id']
  return { id: agentId, session: { id: agentId, header: { delegationDepth: 0 } } } as unknown as Agent
}

function recordingProvider(summary = 'ok'): ViewActionProvider & { seen: ViewActionRequest[] } {
  const seen: ViewActionRequest[] = []
  return {
    seen,
    async apply(request) {
      seen.push(request)
      return { summary }
    },
  }
}

async function mount() {
  const ctx = new Context()
  await ctx.plugin(ViewActionService)
  return ctx
}

describe('ViewActionService', () => {
  it('forwards the trimmed request and returns the summary', async () => {
    const ctx = await mount()
    const p = recordingProvider('已将图谱过滤为 [Supplier]')
    ctx.viewActions.registerProvider(p)

    const result = await ctx.viewActions.apply({
      view: 'kg',
      action: 'set_type_filter',
      args: { types: ['Supplier'] },
    })

    expect(result).toEqual({ summary: '已将图谱过滤为 [Supplier]' })
    expect(p.seen).toEqual([{ view: 'kg', action: 'set_type_filter', args: { types: ['Supplier'] } }])
  })

  it('rejects before any provider registers', async () => {
    const ctx = await mount()
    await expect(ctx.viewActions.apply({ view: 'kg', action: 'set_type_filter', args: {} }))
      .rejects.toMatchObject({ name: 'ViewActionError', code: 'NO_PROVIDER' })
  })

  it('registers providers with HMR-safe disposal', async () => {
    const ctx = await mount()
    const dispose = ctx.viewActions.registerProvider(recordingProvider())
    dispose()
    dispose()
    await expect(ctx.viewActions.apply({ view: 'kg', action: 'set_type_filter', args: {} }))
      .rejects.toMatchObject({ code: 'NO_PROVIDER' })
  })

  it('rejects duplicate providers instead of replacing the active UI', async () => {
    const ctx = await mount()
    ctx.viewActions.registerProvider(recordingProvider('first'))
    expect(() => ctx.viewActions.registerProvider(recordingProvider('second'))).toThrow(ViewActionError)
  })

  it('fails before reaching the provider when the signal is already aborted', async () => {
    const ctx = await mount()
    const p = { apply: vi.fn(async () => ({ summary: 'too late' })) }
    ctx.viewActions.registerProvider(p)
    const controller = new AbortController()
    controller.abort()
    await expect(ctx.viewActions.apply({
      view: 'kg', action: 'set_type_filter', args: {}, signal: controller.signal,
    })).rejects.toMatchObject({ code: 'APPLY_ABORTED' })
    expect(p.apply).not.toHaveBeenCalled()
  })

  it('rejects empty view or action names before reaching the provider', async () => {
    const ctx = await mount()
    const p = { apply: vi.fn(async () => ({ summary: 'unreachable' })) }
    ctx.viewActions.registerProvider(p)
    await expect(ctx.viewActions.apply({ view: '', action: 'x', args: {} }))
      .rejects.toMatchObject({ code: 'BAD_REQUEST_SHAPE' })
    await expect(ctx.viewActions.apply({ view: 'kg', action: '', args: {} }))
      .rejects.toMatchObject({ code: 'BAD_REQUEST_SHAPE' })
    expect(p.apply).not.toHaveBeenCalled()
  })

  it('rejects a live runtime-owned agent before reaching the provider', async () => {
    const ctx = new Context()
    await ctx.plugin(AgentRegistry)
    await ctx.plugin(ViewActionService)
    const p = { apply: vi.fn(async () => ({ summary: 'unreachable' })) }
    ctx.viewActions.registerProvider(p)
    const root = stubAgent('root')
    const child = stubAgent('child')
    ctx.agents.enter(root, undefined)
    ctx.agents.enter(child, root)

    await expect(ctx.viewActions.apply({
      view: 'kg', action: 'set_type_filter', args: {}, agent: child,
    })).rejects.toMatchObject({ name: 'ViewActionError', code: 'DELEGATED_CALLER' })
    expect(p.apply).not.toHaveBeenCalled()
  })

  it('reaches the provider for the exact live runtime root and refuses a stale instance', async () => {
    const ctx = new Context()
    await ctx.plugin(AgentRegistry)
    await ctx.plugin(ViewActionService)
    ctx.viewActions.registerProvider(recordingProvider('switched'))
    const root = stubAgent('root')
    ctx.agents.enter(root, undefined)
    await expect(ctx.viewActions.apply({
      view: 'kg', action: 'switch_view', args: {}, agent: root,
    })).resolves.toEqual({ summary: 'switched' })
    await expect(ctx.viewActions.apply({
      view: 'kg', action: 'switch_view', args: {}, agent: stubAgent('root'),
    })).rejects.toMatchObject({ code: 'CALLER_NOT_LIVE' })
  })
})
