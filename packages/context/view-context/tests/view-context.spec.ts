import { describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import { Session, SessionId } from '@deepseek-ai/dsh-session'
import AgentRegistry, { agentEvents, Inbox, type Agent } from '@deepseek-ai/dsh-agent'
import * as viewContext from '@deepseek-ai/dsh-view-context'
import { MAX_REPORT_JSON_BYTES } from '@deepseek-ai/dsh-view-context'
import type { ViewReport } from '@deepseek-ai/dsh-view-context'

const SIGNAL = new AbortController().signal

async function mount(config: viewContext.Config = {}) {
  const ctx = new Context()
  await ctx.plugin(AgentRegistry)
  await ctx.plugin(viewContext, config)
  return ctx
}

function sessionAgent(session: Session, id = 'agent'): Agent {
  return {
    id: SessionId(id),
    options: {},
    session,
    inbox: new Inbox(session, { inserted: () => {}, discarded: () => {}, claimed: () => {} }),
    status: 'running',
    ctx: new Context(),
    send: () => {},
    followup: () => {},
    steer: () => {},
    inject: () => { throw new Error('view-context must append directly to the open step') },
    cancel() {},
    runMaintenance: task => task(new AbortController().signal),
    whenIdle: () => Promise.resolve(),
  }
}

function report(overrides: Partial<ViewReport> = {}): ViewReport {
  return { view: 'kg', snapshot: { '选中实体': '海天味业' }, actions: {}, ...overrides }
}

async function fire(ctx: Context, agent: Agent, step = 1): Promise<void> {
  const proposed = createUserMessage({
    content: [{ type: 'text', text: 'request proposal' }],
    source: { kind: 'plugin', plugin: 'view-context-test' },
  })
  const decision = await agentEvents(ctx, agent).waterfall(
    'agent/pre-step',
    { messages: [proposed], turn: 1, step, signal: SIGNAL },
    () => Promise.resolve({ kind: 'enter' as const, messages: [proposed] }),
  )
  if (decision.kind === 'enter') {
    for (const message of decision.messages) {
      if (message === proposed) continue
      agent.session.append('user/message', message, { surfaceOp: 'append' })
    }
  }
}

function injectionTexts(session: Session): string[] {
  const texts: string[] = []
  for (const event of session.events) {
    if (event.type === 'user/message'
      && event.data.source.kind === 'plugin'
      && event.data.source.plugin === 'view-context') {
      texts.push(event.data.content.find(block => block.type === 'text')?.text ?? '')
    }
  }
  return texts
}

describe('view-context cache', () => {
  it('stores the latest report per session and reads it back', async () => {
    const ctx = await mount()
    const service = ctx.viewState
    const id = SessionId('s1')
    service.report(id, report())
    expect(service.read(id)?.snapshot).toEqual({ '选中实体': '海天味业' })
    service.report(id, report({ view: 'market', snapshot: { '资产目录': '3 项' } }))
    expect(service.read(id)?.view).toBe('market')
  })

  it('clears per session and wholesale', async () => {
    const ctx = await mount()
    const one = SessionId('one')
    const two = SessionId('two')
    ctx.viewState.report(one, report())
    ctx.viewState.report(two, report())
    ctx.viewState.clear(one)
    expect(ctx.viewState.read(one)).toBeUndefined()
    expect(ctx.viewState.read(two)).toBeDefined()
    ctx.viewState.clearAll()
    expect(ctx.viewState.read(two)).toBeUndefined()
  })

  it('treats entries older than maxAgeMs as absent', async () => {
    vi.useFakeTimers()
    try {
      const ctx = await mount()
      const id = SessionId('s')
      ctx.viewState.report(id, report())
      expect(ctx.viewState.read(id, 60_000)).toBeDefined()
      vi.advanceTimersByTime(61_000)
      expect(ctx.viewState.read(id, 60_000)).toBeUndefined()
      expect(ctx.viewState.read(id, 0)).toBeDefined()
    } finally {
      vi.useRealTimers()
    }
  })

  it('rejects empty view ids and oversized snapshots', async () => {
    const ctx = await mount()
    const id = SessionId('s')
    expect(() => { ctx.viewState.report(id, report({ view: '' })) }).toThrow(TypeError)
    const big = 'x'.repeat(MAX_REPORT_JSON_BYTES)
    expect(() => { ctx.viewState.report(id, report({ snapshot: { big } })) }).toThrow(TypeError)
  })
})

describe('view-context injection', () => {
  it('injects the minimal block when no report exists', async () => {
    const ctx = await mount()
    const session = Session.create(SessionId('agent'))
    session.append('turn/start', { turn: 1 })
    await fire(ctx, sessionAgent(session))
    expect(injectionTexts(session)).toEqual(['【当前工作台视图】当前为对话视图(chat)。'])
  })

  it('injects the cached business-view block and skips unchanged text', async () => {
    const ctx = await mount()
    const session = Session.create(SessionId('agent'))
    session.append('turn/start', { turn: 1 })
    ctx.viewState.report(SessionId('agent'), report({ label: '知识图谱' }))
    await fire(ctx, sessionAgent(session), 1)
    await fire(ctx, sessionAgent(session), 2)
    // Unchanged view + snapshot: the second step reuses the same durable
    // injection instead of appending a duplicate block.
    expect(injectionTexts(session)).toHaveLength(1)
    expect(injectionTexts(session)[0]).toContain('tab=知识图谱(kg)')
    ctx.viewState.report(SessionId('agent'), report({ snapshot: { '选中实体': '味事达' } }))
    await fire(ctx, sessionAgent(session), 3)
    expect(injectionTexts(session)).toHaveLength(2)
  })

  it('stays silent when disabled', async () => {
    const ctx = await mount({ enabled: false })
    const session = Session.create(SessionId('agent'))
    session.append('turn/start', { turn: 1 })
    ctx.viewState.report(SessionId('agent'), report())
    await fire(ctx, sessionAgent(session))
    expect(injectionTexts(session)).toHaveLength(0)
  })
})
