// @vitest-environment jsdom
/**
 * The work detail page (02 §2.5, 03 §6.3): the ticket head and status bar,
 * the context card's suggestion quote and source link, the demo timeline's
 * full doing→review completion chain (result recorded, M3 to the source
 * chat), the review actions (rework dialog with a reason, confirm), the done
 * page's back-to-chat, the live timeline over a registered exec session, and
 * the missing-item fallback.
 */

import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { WorkDetailView, workNumberOf } from '../src/client/work/WorkDetailView.tsx'
import {
  createWorkItem, deleteWorkItem, registerExecSession, transitionWorkItem, updateWorkItem, workOf, workSnapshot,
} from '../src/client/workStore.ts'
import type { ReportPayload } from '../src/client/protocol.ts'

/** One artifact payload for the inline report preview. */
const DEMO_REPORT: ReportPayload = {
  v: 3,
  type: 'report',
  id: 'r_art',
  title: '本月经营概览',
  metrics: [{ label: '采购额', value: '¥1', kind: 'money' }],
}

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

const routes = { 'session.prompt': {}, 'session.create': { sessionId: 'exec-live' }, 'session.history': { events: [] } }

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

describe('workNumberOf', () => {
  it('derives the creation ordinal into the WK number', () => {
    const first = createWorkItem({ title: '一', owner: '我' })
    const second = createWorkItem({ title: '二', owner: '我' })
    const items = workSnapshot().items
    expect(workNumberOf(first, items)).toMatch(/^WK-\d{4}-0001$/)
    expect(workNumberOf(second, items)).toMatch(/^WK-\d{4}-0002$/)
  })
})

describe('WorkDetailView', () => {
  it('names a missing item and fires its back arm', async () => {
    stubGateway(routes)
    // Lay a prior entry so history.back() lands on the work tab.
    location.hash = '#/work'
    location.hash = '#/work/w_missing'
    render(<WorkDetailView workId="w_missing" />)
    expect(screen.getByText('该工作不存在或已删除')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '返回' }))
    await waitFor(() => { expect(location.hash).toBe('#/work') })
  })

  it('ignores a run-mode read that settles after unmount', async () => {
    stubGateway(routes)
    const { unmount } = render(<WorkDetailView workId="w_none" />)
    // The mode promise resolves after the cleanup flipped the alive flag.
    unmount()
    await act(async () => { await Promise.resolve() })
  })

  it('renders the ticket head, context quote, and the todo action row', () => {
    stubGateway(routes)
    const item = createWorkItem({
      title: '接口联调延期处理', owner: '陈晨', due: '2030-06-01',
      suggestion: '建议今天与技术负责人确认新的联调时间', sourceSessionId: 's_src', demo: true,
    })
    render(<WorkDetailView workId={item.id} />)
    expect(screen.getByText(/WK-\d{4}-\d{4}/)).toBeTruthy()
    expect(screen.getByText('演示数据 · 可在「我的 · 设置」清除')).toBeTruthy()
    expect(screen.getByText('建议今天与技术负责人确认新的联调时间')).toBeTruthy()
    expect(screen.getByText('陈晨')).toBeTruthy()
    expect(screen.getByText(/2030-06-01/)).toBeTruthy()
    expect(screen.getByText('尚未开始执行')).toBeTruthy()
    expect(screen.getByTestId('work-stamp').getAttribute('data-status')).toBe('todo')
    fireEvent.click(screen.getByRole('button', { name: '回到源对话 ›' }))
    expect(location.hash).toBe('#/chat/s_src')
  })

  it('renders the no-suggestion copy when the item carried none', () => {
    stubGateway(routes)
    const item = createWorkItem({ title: '手动新建', owner: '业务员' })
    render(<WorkDetailView workId={item.id} />)
    expect(screen.getByText('创建时未附 AI 建议')).toBeTruthy()
    expect(screen.queryByRole('button', { name: '回到源对话 ›' })).toBeNull()
  })

  it('completes the demo doing chain: review flip, result, M3 to the source chat', async () => {
    stubGateway(routes)
    const item = createWorkItem({
      title: '模拟执行任务', owner: '业务员', suggestion: '背景', sourceSessionId: 's_src', status: 'doing',
    })
    render(<WorkDetailView workId={item.id} />)
    await waitFor(
      () => { expect(screen.getAllByText(/读取工作上下文|汇总关键信息|起草处理结果|核对并定稿/).length).toBeGreaterThan(0) },
      { timeout: 4000 },
    )
    await waitFor(() => { expect(workSnapshot().items[0]?.status).toBe('review') }, { timeout: 8000 })
    const done = workSnapshot().items[0]
    expect(done?.result?.summary).toContain('模拟执行任务')
    // The M3 notice reached the source chat.
    const sent = calls.find(call => call.url === '/api/session.prompt')
    expect((sent?.payload?.['content'] as { text: string }[])[0]?.text)
      .toBe(`工作已完成：模拟执行任务。结果摘要：${done?.result?.summary ?? ''}。请确认。`)
    // The result card renders for review.
    expect(screen.getByText('结果')).toBeTruthy()
    expect(screen.getByText(done?.result?.summary ?? '')).toBeTruthy()
  }, 12_000)

  it('keeps the timeline static for a finished demo item', () => {
    stubGateway(routes)
    const item = createWorkItem({ title: '已完成事项', owner: '业务员' })
    updateWorkItem(item.id, { status: 'doing' })
    transitionWorkItem(item.id, 'review')
    updateWorkItem(item.id, { result: { summary: '早前完成', finishedAt: Date.now() - 1000 } })
    transitionWorkItem(item.id, 'done')
    render(<WorkDetailView workId={item.id} />)
    expect(screen.getByText('核对并定稿')).toBeTruthy()
    expect(screen.getByText('早前完成')).toBeTruthy()
  })

  it('reworks through the reason dialog with M4 to the exec session', async () => {
    stubGateway(routes)
    const item = createWorkItem({ title: '返工任务', owner: '业务员' })
    updateWorkItem(item.id, { status: 'doing' })
    transitionWorkItem(item.id, 'review')
    registerExecSession(item.id, 'exec-rw')
    render(<WorkDetailView workId={item.id} />)
    fireEvent.click(screen.getByRole('button', { name: '打回修改' }))
    const textarea = screen.getByPlaceholderText('补充返工原因（可选）') as HTMLTextAreaElement
    fireEvent.change(textarea, { target: { value: '数据口径不对' } })
    fireEvent.click(screen.getByRole('button', { name: '确认打回' }))
    await waitFor(() => { expect(workSnapshot().items[0]?.status).toBe('doing') })
    const sent = calls.find(call => call.url === '/api/session.prompt')
    expect((sent?.payload?.['content'] as { text: string }[])[0]?.text).toBe('该工作需要返工：数据口径不对。')
  })

  it('closes the rework dialog through the cancel action without flipping', async () => {
    stubGateway(routes)
    const item = createWorkItem({ title: '打回窗口', owner: '业务员' })
    updateWorkItem(item.id, { status: 'doing' })
    transitionWorkItem(item.id, 'review')
    render(<WorkDetailView workId={item.id} />)
    fireEvent.click(screen.getByRole('button', { name: '打回修改' }))
    // The cancel action only closes; the item stays under review and nothing was prompted.
    fireEvent.click(screen.getByRole('button', { name: '取消' }))
    await waitFor(() => { expect(workSnapshot().items[0]?.status).toBe('review') })
    expect(calls.filter(call => call.url === '/api/session.prompt')).toHaveLength(0)
  })

  it('reworks without an exec session by flipping states only', async () => {
    stubGateway(routes)
    const item = createWorkItem({ title: '无会话打回', owner: '业务员' })
    updateWorkItem(item.id, { status: 'doing' })
    transitionWorkItem(item.id, 'review')
    render(<WorkDetailView workId={item.id} />)
    fireEvent.click(screen.getByRole('button', { name: '打回修改' }))
    fireEvent.click(screen.getByRole('button', { name: '确认打回' }))
    await waitFor(() => { expect(workSnapshot().items[0]?.status).toBe('doing') })
    // No exec session means no M4 lane: nothing was prompted.
    expect(calls.filter(call => call.url === '/api/session.prompt')).toHaveLength(0)
  })

  it('toasts a failed rework directive from the dialog', async () => {
    stubGateway({ 'session.prompt': () => { throw new Error('返工通道关闭') }, 'session.create': { sessionId: 'x' } })
    const item = createWorkItem({ title: '返工失败', owner: '业务员' })
    updateWorkItem(item.id, { status: 'doing' })
    registerExecSession(item.id, 'exec-rw-fail')
    transitionWorkItem(item.id, 'review')
    render(<WorkDetailView workId={item.id} />)
    fireEvent.click(screen.getByRole('button', { name: '打回修改' }))
    fireEvent.click(screen.getByRole('button', { name: '确认打回' }))
    await waitFor(() => {
      expect(document.querySelector('.adm-toast-main')?.textContent ?? '').toContain('返工通道关闭')
    })
    // The state flip still landed despite the failed notice.
    expect(workSnapshot().items[0]?.status).toBe('doing')
  })

  it('renders a due-soon date through the amber mark', () => {
    stubGateway(routes)
    const tomorrow = new Date(Date.now() + 86_400_000)
    const due = `${String(tomorrow.getFullYear())}-${String(tomorrow.getMonth() + 1).padStart(2, '0')}-${String(tomorrow.getDate()).padStart(2, '0')}`
    const item = createWorkItem({ title: '临期事项', owner: '业务员', due })
    const { container } = render(<WorkDetailView workId={item.id} />)
    expect(container.textContent).toContain(due)
  })

  it('confirms to done and returns to the source chat', async () => {
    stubGateway(routes)
    const item = createWorkItem({ title: '确认任务', owner: '业务员', sourceSessionId: 's_back' })
    updateWorkItem(item.id, { status: 'doing' })
    transitionWorkItem(item.id, 'review')
    updateWorkItem(item.id, { result: { summary: '结果一句话', finishedAt: Date.now() } })
    render(<WorkDetailView workId={item.id} />)
    fireEvent.click(screen.getByRole('button', { name: '确认完成' }))
    await waitFor(() => { expect(workSnapshot().items[0]?.status).toBe('done') })
    fireEvent.click(screen.getByRole('button', { name: '回到聊天' }))
    expect(location.hash).toBe('#/chat/s_back')
  })

  it('starts execution from the todo row (demo flips to doing)', async () => {
    stubGateway(routes)
    const item = createWorkItem({ title: '开始任务', owner: '业务员' })
    render(<WorkDetailView workId={item.id} />)
    fireEvent.click(screen.getByRole('button', { name: '开始执行' }))
    await waitFor(() => { expect(workSnapshot().items[0]?.status).toBe('doing') })
    expect(calls).toHaveLength(0)
  })

  it('runs the live timeline over a registered exec session and completes', async () => {
    stubGateway({
      'session.prompt': {},
      'session.history': { events: [
        { event: { type: 'tool/call', seq: 1, time: 1, data: { callId: 'c1', name: 'nb_list', arguments: '{}' } } },
        { event: { type: 'tool/result', seq: 2, time: 2, data: { message: { content: [{ toolCallId: 'c1' }] } } } },
        { event: { type: 'turn/start', seq: 3, time: 3, data: { turn: 1 } } },
        { event: { type: 'turn/end', seq: 4, time: 4, data: { turn: 1 } } },
        {
          event: {
            type: 'assistant/message', seq: 5, time: 5,
            data: { message: { content: [{ type: 'text', text: '已与负责人约好联调时间。其余细节稍后补' }] } },
          },
        },
      ] },
    })
    localStorage.setItem('dsh-mobile-runmode', 'live')
    const item = createWorkItem({ title: '真实执行', owner: '业务员', sourceSessionId: 's_live', status: 'doing' })
    registerExecSession(item.id, 'exec-live')
    render(<WorkDetailView workId={item.id} />)
    await waitFor(() => { expect(screen.getByText('查询业务记录')).toBeTruthy() })
    await waitFor(() => { expect(workSnapshot().items[0]?.status).toBe('review') }, { timeout: 6000 })
    const sent = calls.find(call => call.url === '/api/session.prompt')
    expect((sent?.payload?.['content'] as { text: string }[])[0]?.text).toContain('工作已完成：真实执行。结果摘要：已与负责人约好联调时间。')
  }, 12_000)

  it('renders a failed live tool step without finishing the item', async () => {
    stubGateway({
      'session.prompt': {},
      'session.history': { events: [
        { event: { type: 'turn/start', seq: 1, time: 1, data: { turn: 1 } } },
        { event: { type: 'tool/call', seq: 2, time: 2, data: { callId: 'c9', name: 'nb_list', arguments: '{}' } } },
        {
          event: {
            type: 'tool/result', seq: 3, time: 3,
            data: { message: { content: [{ toolCallId: 'c9', isError: true }] } },
          },
        },
        { event: { type: 'turn/end', seq: 4, time: 4, data: { turn: 1 } } },
      ] },
    })
    localStorage.setItem('dsh-mobile-runmode', 'live')
    const item = createWorkItem({ title: '真实失败执行', owner: '业务员', status: 'doing' })
    registerExecSession(item.id, 'exec-err')
    render(<WorkDetailView workId={item.id} />)
    // The error step renders its dot class and never completes the item.
    await waitFor(() => { expect(screen.getByText('查询业务记录')).toBeTruthy() })
    await new Promise((resolve) => { setTimeout(resolve, 300) })
    expect(workSnapshot().items[0]?.status).toBe('doing')
  })

  it('links a live doing item to its exec session', async () => {
    stubGateway({ 'session.prompt': {}, 'session.history': { events: [] } })
    localStorage.setItem('dsh-mobile-runmode', 'live')
    const item = createWorkItem({ title: '执行中无结果', owner: '业务员', status: 'doing' })
    registerExecSession(item.id, 'exec-open')
    render(<WorkDetailView workId={item.id} />)
    fireEvent.click(await screen.findByRole('button', { name: '查看执行会话' }))
    expect(location.hash).toBe('#/chat/exec-open')
  })

  it('names the missing exec session for a live doing item', async () => {
    stubGateway({ 'session.prompt': {}, 'session.history': { events: [] } })
    localStorage.setItem('dsh-mobile-runmode', 'live')
    const item = createWorkItem({ title: '无执行会话', owner: '业务员', status: 'doing' })
    render(<WorkDetailView workId={item.id} />)
    await waitFor(() => { expect(screen.getByText('执行会话未建立')).toBeTruthy() })
    // The doing row still shows the executing note without the link button.
    expect(screen.getByText('AI 同事执行中…')).toBeTruthy()
    expect(screen.queryByRole('button', { name: '查看执行会话' })).toBeNull()
  })

  it('manually completes a stuck doing item into review with the M3 notice', async () => {
    stubGateway({ 'session.prompt': {}, 'session.history': { events: [] } })
    localStorage.setItem('dsh-mobile-runmode', 'live')
    const item = createWorkItem({ title: '挂起任务', owner: '业务员', sourceSessionId: 's_stuck', status: 'doing' })
    render(<WorkDetailView workId={item.id} />)
    fireEvent.click(screen.getByRole('button', { name: '手动完成' }))
    await waitFor(() => { expect(workSnapshot().items[0]?.status).toBe('review') })
    const done = workSnapshot().items[0]
    expect(done?.result?.summary).toContain('人工确认完成')
    const sent = calls.find(call => call.url === '/api/session.prompt')
    expect((sent?.payload?.['content'] as { text: string }[])[0]?.text)
      .toBe(`工作已完成：挂起任务。结果摘要：${done?.result?.summary ?? ''}。请确认。`)
  })

  it('manually completes without a source chat and toasts a failed notice', async () => {
    stubGateway({ 'session.prompt': () => { throw new Error('通知失败') }, 'session.history': { events: [] } })
    localStorage.setItem('dsh-mobile-runmode', 'live')
    const withSource = createWorkItem({ title: '通知失败挂起', owner: '业务员', sourceSessionId: 's_m3x', status: 'doing' })
    render(<WorkDetailView workId={withSource.id} />)
    fireEvent.click(screen.getByRole('button', { name: '手动完成' }))
    await waitFor(() => { expect(workSnapshot().items[0]?.status).toBe('review') })
    await waitFor(() => { expect(document.querySelector('.adm-toast-main')?.textContent ?? '').toContain('通知失败') })
    cleanup()
    stubGateway({ 'session.prompt': {}, 'session.history': { events: [] } })
    const orphan = createWorkItem({ title: '无源挂起', owner: '业务员', status: 'doing' })
    render(<WorkDetailView workId={orphan.id} />)
    fireEvent.click(screen.getByRole('button', { name: '手动完成' }))
    await waitFor(() => { expect(workOf(workSnapshot().items, orphan.id)?.status).toBe('review') })
  })

  it('requeues a stuck doing item by re-sending the exec directive', async () => {
    stubGateway({ 'session.prompt': {}, 'session.history': { events: [] } })
    localStorage.setItem('dsh-mobile-runmode', 'live')
    const item = createWorkItem({ title: '重启任务', owner: '业务员', suggestion: '背景一句', status: 'doing' })
    registerExecSession(item.id, 'exec-stuck')
    render(<WorkDetailView workId={item.id} />)
    fireEvent.click(screen.getByRole('button', { name: '重新执行' }))
    await waitFor(() => { expect(calls.some(call => call.url === '/api/session.prompt')).toBe(true) })
    const sent = calls.find(call => call.url === '/api/session.prompt')
    expect(sent?.payload?.['sessionId']).toBe('exec-stuck')
    expect((sent?.payload?.['content'] as { text: string }[])[0]?.text)
      .toBe('执行工作任务：重启任务。背景：背景一句。完成后给出结果摘要。')
    expect(workOf(workSnapshot().items, item.id)?.status).toBe('doing')
  })

  it('requeues without an exec session by creating one, and toasts a failed kick', async () => {
    stubGateway({
      'session.prompt': {},
      'session.create': { sessionId: 'exec-fresh' },
      'session.history': { events: [] },
    })
    localStorage.setItem('dsh-mobile-runmode', 'live')
    const item = createWorkItem({ title: '无会话重启', owner: '业务员', status: 'doing' })
    render(<WorkDetailView workId={item.id} />)
    fireEvent.click(screen.getByRole('button', { name: '重新执行' }))
    await waitFor(() => {
      expect(workOf(workSnapshot().items, item.id)?.execSessionId).toBe('exec-fresh')
    })
    const sent = calls.find(call => call.url === '/api/session.prompt')
    expect(sent?.payload?.['sessionId']).toBe('exec-fresh')
    cleanup()
    stubGateway({ 'session.prompt': () => { throw new Error('指令下发失败') }, 'session.history': { events: [] } })
    const second = createWorkItem({ title: '再重启', owner: '业务员', status: 'doing' })
    registerExecSession(second.id, 'exec-rq2')
    render(<WorkDetailView workId={second.id} />)
    fireEvent.click(screen.getByRole('button', { name: '重新执行' }))
    await waitFor(() => { expect(document.querySelector('.adm-toast-main')?.textContent ?? '').toContain('指令下发失败') })
  })

  it('toasts a failed M3 notice and still flips to review', async () => {
    stubGateway({ 'session.prompt': () => { throw new Error('通知失败') }, 'session.history': { events: [] } })
    const item = createWorkItem({ title: '通知失败任务', owner: '业务员', sourceSessionId: 's_m3', status: 'doing' })
    render(<WorkDetailView workId={item.id} />)
    await waitFor(() => { expect(workSnapshot().items[0]?.status).toBe('review') }, { timeout: 8000 })
    await waitFor(() => {
      expect(document.querySelector('.adm-toast-main')?.textContent ?? '').toContain('通知失败')
    })
  }, 12_000)

  it('fires the nav back through the domain fallback', () => {
    stubGateway(routes)
    const item = createWorkItem({ title: '返回任务', owner: '业务员' })
    const realBack = history.back.bind(history)
    const back = vi.fn()
    history.back = back
    try {
      const { container } = render(<WorkDetailView workId={item.id} />)
      fireEvent.click(container.querySelector('.adm-nav-bar-back') as HTMLElement)
      expect(back).toHaveBeenCalled()
    } finally {
      history.back = realBack
    }
  })

  it('sanitizes the artifact preview: expanding 查看完整报告 leaks no casing variant into the DOM (W23-R5)', async () => {
    stubGateway(routes)
    const item = createWorkItem({ title: '待办概览', owner: '业务员' })
    transitionWorkItem(item.id, 'doing')
    transitionWorkItem(item.id, 'review')
    updateWorkItem(item.id, {
      result: { summary: '已生成报告', finishedAt: Date.now() },
      artifact: {
        v: 3, type: 'report', id: 'r_detail_preview_leak', title: 'WFL_Approval_Todos 待办概览',
        subtitle: '实时查询 · 待办表 WFL_Approval_Todos 已清空',
        metrics: [{ label: '指标', value: '1', kind: 'count' }],
      },
    })
    render(<WorkDetailView workId={item.id} />)
    fireEvent.click(screen.getByRole('button', { name: '查看完整报告 ›' }))
    await waitFor(() => { expect(screen.getByTestId('report-card')).toBeTruthy() })
    expect(/wfl_approval_todos/i.test(document.body.textContent ?? '')).toBe(false)
    // The ticket head and the preview card both carry the sanitized title.
    expect(screen.getAllByText('待办概览').length).toBeGreaterThan(1)
    expect(screen.getByText('实时查询 · 待办表 已清空')).toBeTruthy()
  })

  it('expands the artifact report inline from the result card', async () => {
    stubGateway(routes)
    const item = createWorkItem({ title: '带报告任务', owner: '业务员' })
    updateWorkItem(item.id, { status: 'doing' })
    transitionWorkItem(item.id, 'review')
    updateWorkItem(item.id, { result: { summary: '已生成报告', finishedAt: Date.now() }, artifact: DEMO_REPORT })
    render(<WorkDetailView workId={item.id} />)
    fireEvent.click(screen.getByRole('button', { name: '查看完整报告 ›' }))
    await waitFor(() => { expect(screen.getByTestId('report-card')).toBeTruthy() })
    expect(screen.getByText('本月经营概览')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '收起报告' }))
    expect(screen.queryByTestId('report-card')).toBeNull()
  })
})
