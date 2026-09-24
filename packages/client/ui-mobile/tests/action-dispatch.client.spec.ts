// @vitest-environment jsdom
/**
 * The action executor (02 §5): the four dispatch kinds' happy paths and error
 * paths (route whitelist, send failure, invalid url), the M1–M4 template
 * interpolation, and the shared execution kickoff's live/demo split — demo
 * flips the status without a session, live creates the isolated session,
 * registers it before flipping, and a failed create leaves the item on todo.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  buildExecDirectiveMessage,
  buildReworkMessage,
  buildTaskCreatedMessage,
  buildWorkDoneMessage,
  type DispatchResult,
  dispatchReportAction,
  isProductRoute,
  startWorkExecution,
} from '../src/client/actions.ts'
import { createWorkItem, deleteWorkItem, workSnapshot } from '../src/client/workStore.ts'

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

const CTX = { sessionId: 's_1', onCreateTask: vi.fn() }

beforeEach(() => {
  localStorage.clear()
  // The work store is a module singleton; clear its items between cases.
  for (const item of workSnapshot().items) deleteWorkItem(item.id)
  localStorage.setItem('dsh-mobile-runmode', 'demo')
  stubGateway({})
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('dispatchReportAction', () => {
  it('navigates a whitelisted in-product route', async () => {
    location.hash = ''
    const result = await dispatchReportAction({ kind: 'view', label: '查看工作', route: '#/work' }, CTX)
    expect(result).toEqual({ ok: true })
    expect(location.hash).toBe('#/work')
  })

  it('accepts a param route head and rejects foreign hashes', async () => {
    expect(isProductRoute('#/chat/s_1')).toBe(true)
    expect(isProductRoute('#/agents')).toBe(true)
    expect(isProductRoute('#/')).toBe(true)
    expect(isProductRoute('https://example.com')).toBe(false)
    expect(isProductRoute('#/evil')).toBe(false)
    expect(isProductRoute('work')).toBe(false)
    location.hash = '#/work'
    const result: DispatchResult = await dispatchReportAction({ kind: 'view', label: 'x', route: '#/outside' }, CTX)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toContain('#/outside')
    expect(location.hash).toBe('#/work')
  })

  it('opens the host modal with the create-task prefill', async () => {
    const onCreateTask = vi.fn()
    const result = await dispatchReportAction(
      { kind: 'create-task', label: '创建', title: '接口联调', suggestion: '今天确认' },
      { sessionId: 's_1', onCreateTask },
    )
    expect(result).toEqual({ ok: true })
    expect(onCreateTask).toHaveBeenCalledWith({ title: '接口联调', suggestion: '今天确认' })
  })

  it('sends the text as the user message through promptSession', async () => {
    stubGateway({ 'session.prompt': {} })
    const result = await dispatchReportAction({ kind: 'send', label: '追问', text: '按供应商拆开看' }, CTX)
    expect(result).toEqual({ ok: true })
    expect(calls[0]?.url).toBe('/api/session.prompt')
    expect(calls[0]?.payload).toMatchObject({ sessionId: 's_1', mode: 'queue' })
    expect((calls[0]?.payload?.['content'] as { text: string }[])[0]?.text).toBe('按供应商拆开看')
  })

  it('toasts and reports a failed send', async () => {
    stubGateway({ 'session.prompt': () => { throw new Error('推送通道拒绝') } })
    const result = await dispatchReportAction({ kind: 'send', label: '追问', text: 'x' }, CTX)
    expect(result).toEqual({ ok: false, reason: '推送通道拒绝' })
  })

  it('rejects non-http link schemes before any window.open call', async () => {
    const open = vi.fn()
    vi.stubGlobal('open', open)
    for (const url of ['javascript:alert(1)', 'data:text/html;base64,PHNjcmlwdD4=', 'vbscript:msgbox', 'file:///etc/hosts']) {
      const result: DispatchResult = await dispatchReportAction({ kind: 'link', label: '危险链', url }, CTX)
      expect(result.ok, url).toBe(false)
      if (!result.ok) expect(result.reason, url).toContain('协议')
    }
    expect(open).not.toHaveBeenCalled()
    await vi.waitFor(() => { expect(document.querySelector('.adm-toast-main')?.textContent ?? '').toContain('不支持') })
  })

  it('opens a valid link externally and rejects an invalid url', async () => {
    const open = vi.fn()
    vi.stubGlobal('open', open)
    const ok = await dispatchReportAction({ kind: 'link', label: '外链', url: 'https://example.com/doc' }, CTX)
    expect(ok).toEqual({ ok: true })
    expect(open).toHaveBeenCalledWith('https://example.com/doc', '_blank', 'noopener')
    const bad: DispatchResult = await dispatchReportAction({ kind: 'link', label: '坏链', url: 'not a url' }, CTX)
    expect(bad.ok).toBe(false)
    if (!bad.ok) expect(bad.reason).toContain('not a url')
  })
})

describe('action message templates', () => {
  it('interpolates M1 with the due fallback', () => {
    expect(buildTaskCreatedMessage({ title: '跟进供应商', owner: '陈晨', due: '2026-09-30', suggestion: undefined }))
      .toBe('已创建处理任务：跟进供应商，负责人 陈晨，截止 2026-09-30。请知悉。')
    expect(buildTaskCreatedMessage({ title: '跟进', owner: '我', due: undefined, suggestion: undefined }))
      .toBe('已创建处理任务：跟进，负责人 我，截止 未定。请知悉。')
  })

  it('interpolates M2 with the suggestion fallback', () => {
    expect(buildExecDirectiveMessage({ title: '任务A', suggestion: '先打电话' }))
      .toBe('执行工作任务：任务A。背景：先打电话。完成后给出结果摘要。')
    expect(buildExecDirectiveMessage({ title: '任务B', suggestion: undefined }))
      .toBe('执行工作任务：任务B。背景：无。完成后给出结果摘要。')
  })

  it('interpolates M3', () => {
    expect(buildWorkDoneMessage({ title: '任务A' }, '已约定明天联调'))
      .toBe('工作已完成：任务A。结果摘要：已约定明天联调。请确认。')
  })

  it('interpolates M4 with the default reason', () => {
    expect(buildReworkMessage('数据口径不对')).toBe('该工作需要返工：数据口径不对。')
    expect(buildReworkMessage()).toBe('该工作需要返工：请复核并修正。')
    expect(buildReworkMessage('   ')).toBe('该工作需要返工：请复核并修正。')
  })
})

describe('startWorkExecution', () => {
  it('flips the status only in demo mode (no session, no directive)', async () => {
    const item = createWorkItem({ title: '演示任务', owner: '业务员' })
    const outcome = await startWorkExecution(item)
    expect(outcome).toEqual({ ok: true, message: '已开始执行' })
    expect(workSnapshot().items[0]?.status).toBe('doing')
    expect(workSnapshot().execSessionIds).toHaveLength(0)
    expect(calls).toHaveLength(0)
  })

  it('creates, registers, flips, and directs the exec session in live mode', async () => {
    localStorage.setItem('dsh-mobile-runmode', 'live')
    stubGateway({ 'session.create': { sessionId: 'exec-9' }, 'session.prompt': {} })
    const item = createWorkItem({ title: '真实任务', owner: '业务员', suggestion: '背景说明' })
    const outcome = await startWorkExecution(item)
    expect(outcome).toEqual({ ok: true, message: '已开始执行' })
    // Register precedes the flip: the isolation set and the item agree.
    expect(workSnapshot().items[0]?.execSessionId).toBe('exec-9')
    expect(workSnapshot().execSessionIds).toContain('exec-9')
    expect(workSnapshot().items[0]?.status).toBe('doing')
    const directive = calls.find(call => call.url === '/api/session.prompt')
    expect((directive?.payload?.['content'] as { text: string }[])[0]?.text)
      .toBe('执行工作任务：真实任务。背景：背景说明。完成后给出结果摘要。')
  })

  it('leaves the item on todo when the session create fails', async () => {
    localStorage.setItem('dsh-mobile-runmode', 'live')
    stubGateway({ 'session.create': () => { throw new Error('会话创建通道关闭') } })
    const item = createWorkItem({ title: '失败任务', owner: '业务员' })
    const isolationBefore = workSnapshot().execSessionIds.length
    const outcome = await startWorkExecution(item)
    expect(outcome).toEqual({ ok: false, message: '会话创建通道关闭' })
    expect(workSnapshot().items[0]?.status).toBe('todo')
    expect(workSnapshot().execSessionIds).toHaveLength(isolationBefore)
  })

  it('flips anyway and names a failed directive send', async () => {
    localStorage.setItem('dsh-mobile-runmode', 'live')
    stubGateway({ 'session.create': { sessionId: 'exec-10' }, 'session.prompt': () => { throw new Error('指令失败') } })
    const item = createWorkItem({ title: '指令失败任务', owner: '业务员' })
    const outcome = await startWorkExecution(item)
    expect(outcome).toEqual({ ok: true, message: '已开始执行，但指令发送失败：指令失败' })
    expect(workSnapshot().items[0]?.status).toBe('doing')
    // The isolation registration still holds for the created session.
    expect(workSnapshot().execSessionIds).toContain('exec-10')
  })
})
