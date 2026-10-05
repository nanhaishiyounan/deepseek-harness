// @vitest-environment jsdom
/**
 * The home tab (02 §2.1): the greeting line and the pending count, the stats
 * card's four status-colored cells and its route to work, the quick-task
 * chips' real actions (W8-B2: the register direct plus the route chips),
 * the colleagues' role-stamp scroller starting a chat, and the recent-chats
 * rows filtering the registered work sessions.
 */

import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { HomeView, batchOf, greetingWordOf, solarTermOf, solarTermPhraseOf } from '../src/client/home/HomeView.tsx'
import { createWorkItem, deleteWorkItem, registerExecSession, workSnapshot } from '../src/client/workStore.ts'
import { loadProjection as warmProjection } from '../src/client/messages/projection.ts'

/** One recorded gateway call. */
interface RecordedCall {
  readonly url: string
  readonly payload: Record<string, unknown>
}

let calls: RecordedCall[]

/** The fetch stub over the /api gateway (the views spec's convention). */
function stubGateway(routes: Record<string, unknown>): void {
  calls = []
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    const body = JSON.parse((init?.body ?? '{}') as string) as { rpcId?: string; payload?: Record<string, unknown> }
    calls.push({ url, payload: body.payload ?? {} })
    const method = url.replace('/api/', '')
    const route = routes[method]
    if (route === undefined) {
      return new Response(JSON.stringify({ rpcId: body.rpcId, result: { ok: false, error: { message: `no stub for ${method}` } } }), { status: 200 })
    }
    const produced = typeof route === 'function'
      ? await (route as (payload: Record<string, unknown>) => Promise<unknown>)(body.payload ?? {})
      : route
    return new Response(JSON.stringify({ rpcId: body.rpcId, result: { ok: true, value: produced } }), { status: 200 })
  })
  vi.stubGlobal('fetch', fetchMock)
}

const emptyRoutes = {
  'agentPreset.list': { presets: [] },
  'session.list': { items: [] },
  'session.create': (payload: Record<string, unknown>) => ({ sessionId: `new:${payload.agentPreset as string}` }),
  'session.prompt': {},
}

beforeEach(() => {
  localStorage.clear()
  localStorage.setItem('dsh-mobile-runmode', 'demo')
  for (const item of workSnapshot().items) deleteWorkItem(item.id)
  location.hash = ''
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  cleanup()
})

describe('greetingWordOf', () => {
  it('splits the dayparts', () => {
    expect(greetingWordOf(6)).toBe('早上好')
    expect(greetingWordOf(11)).toBe('下午好')
    expect(greetingWordOf(17)).toBe('下午好')
    expect(greetingWordOf(18)).toBe('晚上好')
    expect(greetingWordOf(2)).toBe('晚上好')
  })
})

describe('solarTermOf / batchOf (W9-B5)', () => {
  it('pins the known 2026 crossing days from the sun longitude', () => {
    expect(solarTermOf(new Date(2026, 9, 23))).toEqual({ name: '霜降', day: 1 })
    expect(solarTermOf(new Date(2026, 9, 8))).toEqual({ name: '寒露', day: 1 })
    expect(solarTermOf(new Date(2026, 1, 4))).toEqual({ name: '立春', day: 1 })
    expect(solarTermOf(new Date(2025, 9, 23))).toEqual({ name: '霜降', day: 1 })
  })

  it('reports the term the in-between days sit in', () => {
    expect(solarTermOf(new Date(2026, 9, 5))).toEqual({ name: '秋分', day: 13 })
    expect(solarTermOf(new Date(2026, 11, 31))).toEqual({ name: '冬至', day: 10 })
  })

  it('phrases the crossing day as 今日X and the rest as X时节', () => {
    expect(solarTermPhraseOf(new Date(2026, 9, 23))).toBe('今日霜降')
    expect(solarTermPhraseOf(new Date(2026, 9, 5))).toBe('秋分时节')
  })

  it('derives the hero seal batch from the local calendar day', () => {
    expect(batchOf(new Date(2026, 9, 5))).toBe('B-1005')
    expect(batchOf(new Date(2026, 0, 3))).toBe('B-0103')
  })
})

describe('HomeView', () => {
  it('renders the greeting, the empty-day sub, and the stats cells routing to work', () => {
    stubGateway(emptyRoutes)
    const { container } = render(<HomeView identityName="王经理" />)
    // W9-B5 hero: the daypart word rides its own line above the name+term line.
    expect(container.textContent).toMatch(/(早上好|下午好|晚上好)/)
    expect(container.textContent).toContain('王经理')
    // Empty store: zero counts and the quiet-day copy.
    expect(screen.getByText(/今天没有待办，随时找 AI 同事聊聊/)).toBeTruthy()
    const cells = screen.getAllByText(/^0$/)
    expect(cells.length).toBe(4)
    expect(screen.getByText('待处理').tagName).toBe('SPAN')
    expect(screen.getByText('已完成')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '今日台账' }))
    expect(location.hash).toBe('#/work')
  })

  it('counts the pending statuses in the sub line', () => {
    createWorkItem({ title: '甲', owner: '业务员' })
    createWorkItem({ title: '乙', owner: '业务员' })
    stubGateway(emptyRoutes)
    render(<HomeView identityName="业务员" />)
    // Two todo items: the sub line counts todo+review.
    expect(screen.getByText(/今天有 2 件事等你/)).toBeTruthy()
  })

  it('runs the quick-task chips: the preset direct and the route chips', async () => {
    stubGateway(emptyRoutes)
    render(<HomeView identityName="业务员" />)
    // W8-B2: the set folded 7→4 — the register direct (the one primary) plus
    // one route chip per ledger/alert/doc surface; the Tab/directory
    // duplicates (查看工作 / 找 AI 同事 / 问经营) left the set.
    fireEvent.click(screen.getByRole('button', { name: '登记一条单据' }))
    await waitFor(() => { expect(location.hash).toBe('#/chat/new:mobile-form-assistant') })
    location.hash = ''
    fireEvent.click(screen.getByRole('button', { name: '我的待办' }))
    expect(location.hash).toBe('#/todos')
    location.hash = ''
    fireEvent.click(screen.getByRole('button', { name: '我的预警' }))
    expect(location.hash).toBe('#/alerts')
    location.hash = ''
    fireEvent.click(screen.getByRole('button', { name: '看单据' }))
    expect(location.hash).toBe('#/docs')
    expect(screen.queryByRole('button', { name: '问经营' })).toBeNull()
    expect(screen.queryByRole('button', { name: '查看工作' })).toBeNull()
    expect(screen.queryByRole('button', { name: '找 AI 同事' })).toBeNull()
  })

  it('starts a chat from a colleague card and routes to the whole roster', async () => {
    stubGateway({
      ...emptyRoutes,
      'agentPreset.list': { presets: [
        { id: 'mobile-form-assistant', name: '智能填表助手', description: '', isDefault: true },
        { id: 'business-advisor', name: '经营参谋', description: '', isDefault: false },
      ] },
    })
    render(<HomeView identityName="业务员" />)
    await waitFor(() => { expect(screen.getByText('智能填表助手')).toBeTruthy() })
    expect(screen.getByText('经营参谋')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '找 经营参谋' }))
    await waitFor(() => { expect(location.hash).toBe('#/chat/new:business-advisor') })
    // The colleagues section's 全部 link (the first of the two section links).
    fireEvent.click(screen.getAllByRole('button', { name: '查看全部 ›' })[0] as HTMLButtonElement)
    expect(location.hash).toBe('#/agents')
  })

  it('toasts a failed chip or colleague start instead of failing silent', async () => {
    stubGateway({
      ...emptyRoutes,
      'agentPreset.list': { presets: [{ id: 'business-advisor', name: '经营参谋', description: '', isDefault: false }] },
      'session.create': () => { throw new Error('会话服务不可用') },
    })
    render(<HomeView identityName="业务员" />)
    await waitFor(() => { expect(screen.getByText('经营参谋')).toBeTruthy() })
    fireEvent.click(screen.getByRole('button', { name: '找 经营参谋' }))
    await waitFor(() => { expect(document.querySelector('.adm-toast-main')?.textContent ?? '').toContain('会话服务不可用') })
    expect(location.hash).toBe('')
  })

  it('shows the roster-empty note', async () => {
    stubGateway(emptyRoutes)
    render(<HomeView identityName="业务员" />)
    await waitFor(() => { expect(screen.getByText('部署未配置 AI 同事预设')).toBeTruthy() })
  })

  it('lists the three most recent chats with work sessions filtered', async () => {
    const now = Date.now()
    const work = createWorkItem({ title: '执行中任务', owner: '业务员' })
    registerExecSession(work.id, 'exec-hidden')
    stubGateway({
      ...emptyRoutes,
      'session.list': { items: [
        { sessionId: 's1', updatedAt: now, projections: { values: { title: '最近的对话' } } },
        { sessionId: 'exec-hidden', updatedAt: now - 1000, projections: { values: { title: '执行会话' } } },
      ] },
      'session.history': { events: [] },
    })
    render(<HomeView identityName="业务员" />)
    await waitFor(() => { expect(screen.getByText('最近的对话')).toBeTruthy() })
    // The exec session never surfaces in the recent rows (02 §9).
    expect(screen.queryByText('执行会话')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /最近的对话/ }))
    expect(location.hash).toBe('#/chat/s1')
  })

  it('starts a chat from the quick chip and stays home on a create failure', async () => {
    stubGateway({ ...emptyRoutes, 'session.create': () => { throw new Error('会话创建通道关闭') } })
    render(<HomeView identityName="业务员" />)
    fireEvent.click(screen.getByRole('button', { name: '登记一条单据' }))
    await act(async () => { await Promise.resolve() })
    expect(location.hash).toBe('')
  })

  it('reads a pre-warmed projection cache on the first render', async () => {
    const now = Date.now()
    stubGateway({
      ...emptyRoutes,
      'session.list': { items: [{ sessionId: 's1', updatedAt: now, agentPreset: 'business-advisor' }] },
      'session.history': () => ({
        events: [{
          event: { type: 'assistant/message', seq: 1, time: 1, data: { message: { content: [{ type: 'text', text: '答复一句话' }] } } },
        }],
      }),
    })
    // Warm the module-level projection cache before the component mounts.
    await warmProjection('s1', now)
    render(<HomeView identityName="业务员" />)
    await waitFor(() => { expect(screen.getByText('答复一句话')).toBeTruthy() })
  })

  it('keeps the roster-duty subtitle when a projection read fails', async () => {
    const now = Date.now()
    stubGateway({
      ...emptyRoutes,
      'session.list': { items: [
        { sessionId: 's1', updatedAt: now, agentPreset: 'business-advisor' },
      ] },
      'session.history': () => { throw new Error('窗口 503') },
    })
    render(<HomeView identityName="业务员" />)
    // The failed tail read leaves the row on its colleague-duty subtitle.
    await waitFor(() => { expect(screen.getByText('经营洞察问答（只读）')).toBeTruthy() })
  })

  it('shows the empty copy with no chats and links to the full list', async () => {
    stubGateway(emptyRoutes)
    render(<HomeView identityName="业务员" />)
    // The session read runs async: the skeleton shows first, the empty copy
    // only once the ready read reports no chats.
    await waitFor(() => { expect(screen.getByText('还没有对话')).toBeTruthy() })
    fireEvent.click(screen.getAllByRole('button', { name: '查看全部 ›' })[1] as HTMLButtonElement)
    expect(location.hash).toBe('#/chats')
  })

  it('routes the search entry onto the all-chats layer', async () => {
    stubGateway(emptyRoutes)
    render(<HomeView identityName="业务员" />)
    await waitFor(() => { expect(screen.getByRole('button', { name: '搜索会话与同事' })).toBeTruthy() })
    fireEvent.click(screen.getByRole('button', { name: '搜索会话与同事' }))
    expect(location.hash).toBe('#/chats')
  })

  it('names a failed roster read with a retry that recovers', async () => {
    let failRoster = true
    stubGateway({
      ...emptyRoutes,
      'agentPreset.list': () => {
        if (failRoster) throw new Error('通讯录 502')
        return { presets: [{ id: 'business-advisor', name: '经营参谋', description: '', isDefault: false }] }
      },
    })
    render(<HomeView identityName="业务员" />)
    // The failure surfaces as its own alert strip, never as the empty note.
    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain('同事目录加载失败：通讯录 502')
    expect(screen.queryByText('部署未配置 AI 同事预设')).toBeNull()
    failRoster = false
    fireEvent.click(screen.getByRole('button', { name: '重试' }))
    await waitFor(() => { expect(screen.getByText('经营参谋')).toBeTruthy() })
  })

  it('names a failed session read with a retry instead of the empty copy', async () => {
    let failSessions = true
    stubGateway({
      ...emptyRoutes,
      'session.list': () => {
        if (failSessions) throw new Error('会话目录 503')
        return { items: [] }
      },
    })
    render(<HomeView identityName="业务员" />)
    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain('最近对话加载失败：会话目录 503')
    // The failure is not the empty state: the empty copy never shows.
    expect(screen.queryByText('还没有对话')).toBeNull()
    failSessions = false
    fireEvent.click(screen.getByRole('button', { name: '重试' }))
    await waitFor(() => { expect(screen.getByText('还没有对话')).toBeTruthy() })
  })
})
