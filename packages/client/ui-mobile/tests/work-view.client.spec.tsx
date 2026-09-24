// @vitest-environment jsdom
/**
 * The work tab (02 §2.4, 03 §6.2): the four-status capsule tabs with live
 * counts, the work cards (stamp, meta, demo tag, source back-link), the
 * per-status quick actions flipping states in place, the empty state's agents
 * route, and the tasks/files entries.
 */

import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { WorkView } from '../src/client/work/WorkView.tsx'
import {
  createWorkItem, deleteWorkItem, registerExecSession, transitionWorkItem, updateWorkItem, workSnapshot,
} from '../src/client/workStore.ts'

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

const routes = { 'session.prompt': {}, 'session.create': { sessionId: 'exec-1' } }

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

/** One item moved onto the given status through the legal path. */
function itemAt(title: string, status: 'todo' | 'doing' | 'review' | 'done') {
  const item = createWorkItem({ title, owner: '业务员' })
  if (status === 'todo') return item
  updateWorkItem(item.id, { status: 'doing' })
  if (status === 'doing') return item
  transitionWorkItem(item.id, 'review')
  if (status === 'review') return item
  return transitionWorkItem(item.id, 'done')
}

describe('WorkView', () => {
  it('renders the empty state per status with the agents route', () => {
    stubGateway(routes)
    render(<WorkView />)
    expect(screen.getByText('这个状态还没有工作')).toBeTruthy()
    expect(screen.getByText('去聊天里让 AI 同事帮你处理')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '去找 AI 同事' }))
    expect(location.hash).toBe('#/agents')
  })

  it('routes the tasks and files entries', () => {
    stubGateway(routes)
    render(<WorkView />)
    fireEvent.click(screen.getByRole('button', { name: '任务' }))
    expect(location.hash).toBe('#/tasks')
    location.hash = ''
    fireEvent.click(screen.getByRole('button', { name: '文件' }))
    expect(location.hash).toBe('#/files')
  })

  it('starts a tool card over createSession with the starter opener', async () => {
    stubGateway({
      ...routes,
      'agentPreset.list': { presets: [
        { id: 'mobile-form-assistant', name: '智能填表助手', description: '', isDefault: true },
        { id: 'business-advisor', name: '经营参谋', description: '', isDefault: false },
        { id: 'enterprise-data-assistant', name: '企业数据助手', description: '', isDefault: false },
        { id: 'food-compliance-officer', name: 'AI 食安合规官', description: '', isDefault: false },
      ] },
      'session.create': (payload: Record<string, unknown>) => ({ sessionId: `tool:${payload.agentPreset as string}` }),
    })
    render(<WorkView />)
    const card = await screen.findByRole('button', { name: '去聊聊 经营参谋' })
    expect(card.textContent).toContain('经营洞察问答（只读）')
    fireEvent.click(card)
    await waitFor(() => { expect(location.hash).toBe('#/chat/tool:business-advisor') })
    // The colleague's first starter rides the same promptSession lane the composer uses.
    const sent = calls.find(call => call.url === '/api/session.prompt')
    expect((sent?.payload?.['content'] as { text: string }[])[0]?.text).toBe('本月经营概览和风险提示')
  })

  it('ignores a busy double tap on a tool card', async () => {
    stubGateway({
      ...routes,
      'agentPreset.list': { presets: [{ id: 'business-advisor', name: '经营参谋', description: '', isDefault: false }] },
      'session.create': () => new Promise(() => {}),
    })
    render(<WorkView />)
    const card = await screen.findByRole('button', { name: '去聊聊 经营参谋' }) as HTMLButtonElement
    fireEvent.click(card)
    // A second tap while the first create is in flight never re-enters.
    fireEvent.click(card)
    expect(calls.filter(call => call.url === '/api/session.create')).toHaveLength(1)
  })

  it('ignores a same-frame double dispatch on a tool card', async () => {
    stubGateway({
      ...routes,
      'agentPreset.list': { presets: [{ id: 'business-advisor', name: '经营参谋', description: '', isDefault: false }] },
      'session.create': () => new Promise(() => {}),
    })
    render(<WorkView />)
    const card = await screen.findByRole('button', { name: '去聊聊 经营参谋' }) as HTMLButtonElement
    // Two native dispatches inside one frame: no React flush between them,
    // so both handlers read the pre-start state and only the ref lock holds.
    act(() => {
      card.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      card.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    expect(calls.filter(call => call.url === '/api/session.create')).toHaveLength(1)
  })

  it('toasts a failed tool start and releases the cards', async () => {
    stubGateway({
      ...routes,
      'agentPreset.list': { presets: [{ id: 'business-advisor', name: '经营参谋', description: '', isDefault: false }] },
      'session.create': () => { throw new Error('创建通道关闭') },
    })
    render(<WorkView />)
    fireEvent.click(await screen.findByRole('button', { name: '去聊聊 经营参谋' }))
    await waitFor(() => {
      expect(document.querySelector('.adm-toast-main')?.textContent ?? '').toContain('创建通道关闭')
    })
    // The lock released: the tool card is clickable again.
    await waitFor(() => {
      expect(screen.getByRole<HTMLButtonElement>('button', { name: '去聊聊 经营参谋' }).disabled).toBe(false)
    })
  })

  it('starts a starter-less tool card without a prompt', async () => {
    stubGateway({
      ...routes,
      'agentPreset.list': { presets: [{ id: 'unknown-preset', name: '未知同事', description: '不在视觉表里', isDefault: false }] },
      'session.create': () => ({ sessionId: 'tool:bare' }),
    })
    render(<WorkView />)
    fireEvent.click(await screen.findByRole('button', { name: '去聊聊 未知同事' }))
    await waitFor(() => { expect(location.hash).toBe('#/chat/tool:bare') })
    expect(calls.filter(call => call.url === '/api/session.prompt')).toHaveLength(0)
  })

  it('counts each status on its tab and switches the filter', () => {
    stubGateway(routes)
    createWorkItem({ title: '待办甲', owner: '业务员' })
    createWorkItem({ title: '待办乙', owner: '业务员' })
    render(<WorkView />)
    expect(screen.getByText('待处理 2')).toBeTruthy()
    expect(screen.getByText('进行中 0')).toBeTruthy()
    expect(screen.getAllByTestId('work-card')).toHaveLength(2)
    fireEvent.click(screen.getByText('进行中 0'))
    expect(screen.getByText('这个状态还没有工作')).toBeTruthy()
    // Restore the default tab (the remembered selection is module state).
    fireEvent.click(screen.getByText('待处理 2'))
  })

  it('flips todo to doing in place through 开始执行 (demo)', async () => {
    stubGateway(routes)
    const item = createWorkItem({ title: '跟进事项', owner: '业务员' })
    render(<WorkView />)
    fireEvent.click(screen.getByRole('button', { name: '开始执行' }))
    await waitFor(() => { expect(workSnapshot().items[0]?.status).toBe('doing') })
    // The flipped card moved onto the doing tab; follow it there.
    fireEvent.click(screen.getByText('进行中 1'))
    await waitFor(() => { expect(screen.getByText('AI 同事执行中')).toBeTruthy() })
    fireEvent.click(screen.getByRole('button', { name: '查看进度' }))
    expect(location.hash).toBe(`#/work/${item.id}`)
  })

  it('keeps the selected status filter across route remounts', () => {
    stubGateway(routes)
    itemAt('待办留存', 'todo')
    itemAt('执行留存', 'doing')
    const first = render(<WorkView />)
    fireEvent.click(screen.getByText('进行中 1'))
    expect(screen.getByText('执行留存')).toBeTruthy()
    expect(screen.queryByText('待办留存')).toBeNull()
    // Leaving and re-entering the work tab (the shell remounts the view) must
    // not reset the capsule filter back to todo.
    first.unmount()
    render(<WorkView />)
    expect(screen.getByText('执行留存')).toBeTruthy()
    expect(screen.queryByText('待办留存')).toBeNull()
    // Restore the default selection so later cases in this file start on todo.
    fireEvent.click(screen.getByText('待处理 1'))
    expect(screen.getByText('待办留存')).toBeTruthy()
  })

  it('confirms from the review row without a message', async () => {
    stubGateway(routes)
    itemAt('复核事项', 'review')
    render(<WorkView />)
    fireEvent.click(screen.getByText('待确认 1'))
    fireEvent.click(screen.getByRole('button', { name: '确认完成' }))
    await waitFor(() => { expect(workSnapshot().items[0]?.status).toBe('done') })
    expect(calls.filter(call => call.url === '/api/session.prompt')).toHaveLength(0)
  })

  it('rejects from the review row, sending M4 only with an exec session', async () => {
    stubGateway(routes)
    const item = itemAt('返工事项', 'review')
    render(<WorkView />)
    fireEvent.click(screen.getByText('待确认 1'))
    fireEvent.click(screen.getByRole('button', { name: '打回' }))
    await waitFor(() => { expect(workSnapshot().items[0]?.status).toBe('doing') })
    // Demo reject (no exec session) sends nothing.
    expect(calls.filter(call => call.url === '/api/session.prompt')).toHaveLength(0)
    // Registering an exec session routes the rework directive there.
    registerExecSession(item.id, 'exec-rework')
    const fresh = itemAt('再打回', 'review')
    registerExecSession(fresh.id, 'exec-rework-2')
    await waitFor(() => { expect(screen.getByRole('button', { name: '打回' })).toBeTruthy() })
    fireEvent.click(screen.getByRole('button', { name: '打回' }))
    await waitFor(() => { expect(calls.some(call => call.url === '/api/session.prompt')).toBe(true) })
    const sent = calls.find(call => call.url === '/api/session.prompt')
    expect((sent?.payload?.['content'] as { text: string }[])[0]?.text).toBe('该工作需要返工：请复核并修正。')
  })

  it('shows the done summary row and routes through the card head', () => {
    stubGateway(routes)
    const item = itemAt('归档事项', 'done')
    updateWorkItem(item.id, { result: { summary: '已完成归档', finishedAt: Date.now() } })
    render(<WorkView />)
    fireEvent.click(screen.getByText('已完成 1'))
    expect(screen.getByText('已完成归档')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '查看结果' }))
    expect(location.hash).toBe(`#/work/${item.id}`)
    location.hash = ''
    // The card head routes the same way.
    fireEvent.click(screen.getByRole('button', { name: '打开 归档事项' }))
    expect(location.hash).toBe(`#/work/${item.id}`)
  })

  it('toasts a failed rework directive', async () => {
    stubGateway({ 'session.prompt': () => { throw new Error('通道关闭') }, 'session.create': { sessionId: 'x' } })
    const item = itemAt('通知失败打回', 'review')
    registerExecSession(item.id, 'exec-fail')
    render(<WorkView />)
    fireEvent.click(screen.getByText('待确认 1'))
    fireEvent.click(screen.getByRole('button', { name: '打回' }))
    await waitFor(() => {
      expect(document.querySelector('.adm-toast-main')?.textContent ?? '').toContain('通道关闭')
    })
  })

  it('falls back to the plain done copy without a result summary', () => {
    stubGateway(routes)
    itemAt('无摘要事项', 'done')
    render(<WorkView />)
    fireEvent.click(screen.getByText('已完成 1'))
    expect(screen.getByText('已完成')).toBeTruthy()
    // Restore the default tab (the remembered selection is module state).
    fireEvent.click(screen.getByText('待处理 0'))
  })

  it('carries the demo tag, the meta line, and the source back-link on a card', () => {
    stubGateway(routes)
    createWorkItem({ title: '示例事项', owner: '陈晨', due: '2030-01-02', demo: true, sourceSessionId: 's_src' })
    render(<WorkView />)
    expect(screen.getByText('示例')).toBeTruthy()
    expect(screen.getByText('负责人 陈晨')).toBeTruthy()
    expect(screen.getByText(/截止 2030-01-02/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '来自对话' }))
    expect(location.hash).toBe('#/chat/s_src')
  })
})
