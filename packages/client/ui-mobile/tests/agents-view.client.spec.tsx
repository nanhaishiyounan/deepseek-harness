// @vitest-environment jsdom
/**
 * The agents tab (v6 roster): the capability-band roster (group headings off
 * the colleagues table; ungrouped presets collect under 更多 AI 同事), the
 * roster items' avatar/duty/skill pills/presence chip, the local search
 * filter, a tap starting that colleague's chat over the real createSession
 * path, and the empty/failure states.
 */

import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AgentsView } from '../src/client/agents/AgentsView.tsx'
import { statusLabelOf } from '../src/client/colleagues.ts'

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

beforeEach(() => {
  localStorage.clear()
  location.hash = ''
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  cleanup()
})

describe('AgentsView', () => {
  it('renders the banded roster with skills and presence chips', async () => {
    stubGateway({
      'agentPreset.list': { presets: [
        { id: 'mobile-form-assistant', name: '智能填表助手', description: '', isDefault: true },
        { id: 'business-advisor', name: '经营参谋', description: '', isDefault: false },
        { id: 'enterprise-data-assistant', name: '企业数据助手', description: '数据问答', isDefault: false },
        { id: 'food-compliance-officer', name: 'AI 食安合规官', description: '', isDefault: false },
      ] },
    })
    render(<AgentsView />)
    await waitFor(() => { expect(screen.getByText('智能填表助手')).toBeTruthy() })
    expect(screen.getByText('经营参谋')).toBeTruthy()
    expect(screen.getByText('企业数据助手')).toBeTruthy()
    expect(screen.getByText('AI 食安合规官')).toBeTruthy()
    // The roster description wins over the duty table; the table fills the rest.
    expect(screen.getByText('数据问答')).toBeTruthy()
    expect(screen.getByText('单据登记与任务执行')).toBeTruthy()
    // The capability bands render their headings (内容与创意 stays empty → no heading).
    expect(screen.getByText('数据与技术')).toBeTruthy()
    expect(screen.getByText('职能与效率')).toBeTruthy()
    expect(screen.queryByText('内容与创意')).toBeNull()
    // The avatar acronym, the skill pills, and the online chips render.
    expect(screen.getAllByText('表单').length).toBeGreaterThan(0)
    expect(screen.getByText('企业档案')).toBeTruthy()
    expect(screen.getByText('法规问答')).toBeTruthy()
    expect(screen.getAllByText('在线').length).toBe(4)
  })

  it('filters the roster through the local search box', async () => {
    stubGateway({
      'agentPreset.list': { presets: [
        { id: 'mobile-form-assistant', name: '智能填表助手', description: '', isDefault: true },
        { id: 'business-advisor', name: '经营参谋', description: '', isDefault: false },
      ] },
    })
    render(<AgentsView />)
    await waitFor(() => { expect(screen.getByText('智能填表助手')).toBeTruthy() })
    fireEvent.change(screen.getByPlaceholderText('搜索姓名 / 职能 / 技能'), { target: { value: '经营' } })
    expect(screen.getByText('经营参谋')).toBeTruthy()
    expect(screen.queryByText('智能填表助手')).toBeNull()
    // A needle matching nothing shows the miss note.
    fireEvent.change(screen.getByPlaceholderText('搜索姓名 / 职能 / 技能'), { target: { value: '不存在的技能' } })
    await waitFor(() => { expect(screen.getByText('没有找到匹配的同事')).toBeTruthy() })
  })

  it('starts the colleague chat over createSession', async () => {
    stubGateway({
      'agentPreset.list': { presets: [{ id: 'business-advisor', name: '经营参谋', description: '', isDefault: false }] },
      'session.create': { sessionId: 'chat-42' },
    })
    render(<AgentsView />)
    fireEvent.click(await screen.findByRole('button', { name: /找 经营参谋/ }))
    await waitFor(() => { expect(location.hash).toBe('#/chat/chat-42') })
    const created = calls.find(call => call.url === '/api/session.create')
    expect(created?.payload).toMatchObject({ agentPreset: 'business-advisor' })
  })

  it('ignores a busy double tap on a roster item', async () => {
    stubGateway({
      'agentPreset.list': { presets: [{ id: 'business-advisor', name: '经营参谋', description: '', isDefault: false }] },
      'session.create': () => new Promise(() => {}),
    })
    render(<AgentsView />)
    const card = await screen.findByRole('button', { name: /找 经营参谋/ }) as HTMLButtonElement
    fireEvent.click(card)
    // A second tap while the first create is in flight never re-enters.
    fireEvent.click(card)
    expect(calls.filter(call => call.url === '/api/session.create')).toHaveLength(1)
  })

  it('ignores a same-frame double dispatch on a roster item', async () => {
    stubGateway({
      'agentPreset.list': { presets: [{ id: 'business-advisor', name: '经营参谋', description: '', isDefault: false }] },
      'session.create': () => new Promise(() => {}),
    })
    render(<AgentsView />)
    const card = await screen.findByRole('button', { name: /找 经营参谋/ }) as HTMLButtonElement
    // Two native dispatches inside one frame: no React flush between them,
    // so both handlers read the pre-start state and only the ref lock holds.
    act(() => {
      card.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      card.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    expect(calls.filter(call => call.url === '/api/session.create')).toHaveLength(1)
  })

  it('anchors the starting mark to the tapped row while the rest stay enabled', async () => {
    stubGateway({
      'agentPreset.list': { presets: [
        { id: 'business-advisor', name: '经营参谋', description: '', isDefault: false },
        { id: 'mobile-form-assistant', name: '智能填表助手', description: '', isDefault: true },
      ] },
      'session.create': () => new Promise(() => {}),
    })
    render(<AgentsView />)
    const advisor = await screen.findByRole('button', { name: /找 经营参谋/ }) as HTMLButtonElement
    const filler = screen.getByRole('button', { name: /找 智能填表助手/ }) as HTMLButtonElement
    fireEvent.click(advisor)
    await waitFor(() => { expect(screen.getByText('创建中')).toBeTruthy() })
    // Only the tapped row carries the disabled mark and the creating dots.
    expect(advisor.disabled).toBe(true)
    expect(filler.disabled).toBe(false)
    expect(screen.getAllByText('创建中')).toHaveLength(1)
  })

  it('collects an untabled preset under 更多 AI 同事 with the fallback visual', async () => {
    stubGateway({
      'agentPreset.list': { presets: [
        { id: 'mobile-form-assistant', name: '智能填表助手', description: '', isDefault: true },
        { id: 'custom-auditor', name: '定制审计员', description: '专用链路审计', isDefault: false },
      ] },
    })
    render(<AgentsView />)
    await waitFor(() => { expect(screen.getByText('定制审计员')).toBeTruthy() })
    // The ungrouped preset collects under its own band; the default presence chip renders.
    expect(screen.getByText('更多 AI 同事')).toBeTruthy()
    // The roster description wins the tag line; the skill pills stay absent on the fallback visual.
    expect(screen.getByText('专用链路审计')).toBeTruthy()
    expect(screen.queryByText('企业档案')).toBeNull()
    // The duty word still matches through the local search.
    fireEvent.change(screen.getByPlaceholderText('搜索姓名 / 职能 / 技能'), { target: { value: '审计' } })
    await waitFor(() => { expect(screen.getByText('定制审计员')).toBeTruthy() })
    expect(screen.queryByText('智能填表助手')).toBeNull()
  })

  it('toasts a create failure without navigating', async () => {
    stubGateway({
      'agentPreset.list': { presets: [{ id: 'business-advisor', name: '经营参谋', description: '', isDefault: false }] },
      'session.create': () => { throw new Error('会话创建通道关闭') },
    })
    render(<AgentsView />)
    fireEvent.click(await screen.findByRole('button', { name: /找 经营参谋/ }))
    await waitFor(() => {
      expect(document.querySelector('.adm-toast-main')?.textContent ?? '').toContain('会话创建通道关闭')
    })
    expect(location.hash).toBe('')
  })

  it('renders the empty roster and the roster failure', async () => {
    stubGateway({ 'agentPreset.list': { presets: [] } })
    render(<AgentsView />)
    await waitFor(() => { expect(screen.getByText('部署未配置 AI 同事预设')).toBeTruthy() })
    stubGateway({ 'agentPreset.list': () => { throw new Error('通讯录服务 502') } })
    cleanup()
    const second = render(<AgentsView />)
    await waitFor(() => { expect(second.container.textContent ?? '').toContain('通讯录服务 502') })
  })
})

describe('statusLabelOf', () => {
  it('labels every presence kind', () => {
    expect(statusLabelOf('online')).toBe('在线')
    expect(statusLabelOf('busy')).toBe('忙碌')
    expect(statusLabelOf('meeting')).toBe('会议中')
  })
})
