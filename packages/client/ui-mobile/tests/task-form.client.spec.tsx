// @vitest-environment jsdom
/**
 * The task-form bottom sheet (02 §6): the prefilled open, the required-title
 * validation, the submit side-effect chain in order (create → M1 to the
 * source chat when present → toast → navigate), the failed-notice path that
 * never rolls back, the manual-creation skip of M1, and the 立即执行 switch
 * riding the shared execution kickoff.
 */

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { TaskFormModal } from '../src/client/work/TaskFormModal.tsx'
import { deleteWorkItem, workSnapshot } from '../src/client/workStore.ts'

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

const routes = { 'session.prompt': {} }

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

/** The created item from the store (the single item of the case). */
function onlyItem() {
  return workSnapshot().items[0]
}

describe('TaskFormModal', () => {
  it('opens with the prefill and shows the source strip and suggestion', async () => {
    stubGateway(routes)
    render(
      <TaskFormModal
        visible
        onClose={() => {}}
        identityName="业务员"
        prefill={{ title: '接口联调延期处理', suggestion: '今天确认联调时间' }}
        sourceSessionId="s_src"
        sourceAnchor="7"
      />,
    )
    expect(screen.getByLabelText<HTMLInputElement>('任务标题').value).toBe('接口联调延期处理')
    expect(screen.getByText('AI 建议')).toBeTruthy()
    expect(screen.getByText('今天确认联调时间')).toBeTruthy()
    expect(screen.getByText(/来自：接口联调延期处理/)).toBeTruthy()
    // The team picker lists 我自己 plus the demo team with the duty tails.
    expect(screen.getByText(/我自己（业务员）/)).toBeTruthy()
  })

  it('blocks submit on an empty title with the inline error, then edits clear it', async () => {
    stubGateway(routes)
    render(
      <TaskFormModal visible onClose={() => {}} identityName="业务员" prefill={{ title: '', suggestion: undefined }} sourceSessionId={undefined} sourceAnchor={undefined} />,
    )
    fireEvent.click(screen.getByRole('button', { name: '创建任务' }))
    expect(screen.getByText('标题必填')).toBeTruthy()
    expect(workSnapshot().items).toHaveLength(0)
    const input = screen.getByLabelText('任务标题') as HTMLInputElement
    fireEvent.change(input, { target: { value: '补上标题' } })
    expect(screen.queryByText('标题必填')).toBeNull()
  })

  it('runs the chain in order: create, M1, toast, navigate', async () => {
    stubGateway(routes)
    render(
      <TaskFormModal
        visible
        onClose={() => {}}
        identityName="业务员"
        prefill={{ title: '跟进供应商资质', suggestion: undefined }}
        sourceSessionId="s_src"
        sourceAnchor="9"
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: '创建任务' }))
    await waitFor(() => { expect(location.hash).toMatch(/^#\/work\/w_/) })
    const item = onlyItem()
    expect(item?.title).toBe('跟进供应商资质')
    expect(item?.owner).toBe('业务员')
    expect(item?.status).toBe('todo')
    expect(item?.sourceSessionId).toBe('s_src')
    expect(item?.sourceAnchor).toBe('9')
    expect(item?.suggestion).toBeUndefined()
    expect(item?.due).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    // The M1 notice rode the source chat before the navigate.
    const sent = calls.find(call => call.url === '/api/session.prompt')
    expect(sent?.payload).toMatchObject({ sessionId: 's_src', mode: 'queue' })
    expect((sent?.payload?.['content'] as { text: string }[])[0]?.text)
      .toBe(`已创建处理任务：跟进供应商资质，负责人 业务员，截止 ${item?.due ?? ''}。请知悉。`)
    expect(await screen.findByText(/已创建任务 · 跟进供应商资质/)).toBeTruthy()
  })

  it('keeps the created item when the M1 notice fails', async () => {
    stubGateway({ 'session.prompt': () => { throw new Error('通道关闭') } })
    render(
      <TaskFormModal visible onClose={() => {}} identityName="业务员" prefill={{ title: '通知失败任务', suggestion: undefined }} sourceSessionId="s_src" sourceAnchor={undefined} />,
    )
    fireEvent.click(screen.getByRole('button', { name: '创建任务' }))
    await waitFor(() => { expect(location.hash).toMatch(/^#\/work\/w_/) })
    // The local truth stands (never rolled back); the success toast replaces
    // the transient notice (antd Toast is a singleton).
    expect(onlyItem()?.title).toBe('通知失败任务')
    await waitFor(() => {
      expect(document.querySelector('.adm-toast-main')?.textContent ?? '').toContain('已创建任务 · 通知失败任务')
    })
  })

  it('walks the owner picker, the due picker, the clear key, and the suggestion carry', async () => {
    stubGateway(routes)
    render(
      <TaskFormModal
        visible
        onClose={() => {}}
        identityName="业务员"
        prefill={{ title: '控件任务', suggestion: '带上建议' }}
        sourceSessionId={undefined}
        sourceAnchor={undefined}
      />,
    )
    // The owner picker opens and confirms (the wheel's touch re-selection is
    // an e2e gesture; jsdom exercises the confirm callback with the default).
    fireEvent.click(screen.getByText('负责人'))
    const confirmOwner = await screen.findAllByRole('button', { name: '确定' })
    fireEvent.click(confirmOwner[confirmOwner.length - 1] as HTMLElement)
    await waitFor(() => { expect(screen.getAllByText(/我自己（业务员）/).length).toBeGreaterThan(0) })
    // The due picker opens, confirms a chosen day, and the clear key resets.
    fireEvent.click(screen.getByText('截止时间'))
    const confirmDue = await screen.findAllByRole('button', { name: '确定' })
    fireEvent.click(confirmDue[confirmDue.length - 1] as HTMLElement)
    // The keyboard path clears the due date.
    // An unrelated key never clears the due date.
    fireEvent.keyDown(screen.getByRole('button', { name: '清除截止时间' }), { key: 'Escape' })
    fireEvent.keyDown(screen.getByRole('button', { name: '清除截止时间' }), { key: 'Enter' })
    await waitFor(() => { expect(screen.getByText('未定')).toBeTruthy() })
    // Submitting carries the suggestion onto the created item.
    fireEvent.click(screen.getByRole('button', { name: '创建任务' }))
    await waitFor(() => { expect(workSnapshot().items).toHaveLength(1) })
    expect(onlyItem()?.owner).toBe('业务员')
    expect(onlyItem()?.due).toBeUndefined()
    expect(onlyItem()?.suggestion).toBe('带上建议')
  })

  it('names a failed immediate execution from a live create failure', async () => {
    stubGateway({ 'session.prompt': {}, 'session.create': () => { throw new Error('会话创建通道关闭') } })
    localStorage.setItem('dsh-mobile-runmode', 'live')
    render(
      <TaskFormModal visible onClose={() => {}} identityName="业务员" prefill={{ title: '立即失败任务', suggestion: undefined }} sourceSessionId={undefined} sourceAnchor={undefined} />,
    )
    fireEvent.click(screen.getByRole('switch', { name: '立即执行' }))
    fireEvent.click(screen.getByRole('button', { name: '创建任务' }))
    // The failure toast is transient (the success toast replaces it); the
    // durable outcome is the item standing on todo.
    await waitFor(() => {
      expect(document.querySelector('.adm-toast-main')?.textContent ?? '').toContain('已创建任务 · 立即失败任务')
    })
    await waitFor(() => { expect(workSnapshot().items[0]?.status).toBe('todo') })
  })

  it('keeps the closed sheet inert and submits an undated task', async () => {
    stubGateway(routes)
    const { rerender } = render(
      <TaskFormModal visible={false} onClose={() => {}} identityName="业务员" prefill={undefined} sourceSessionId={undefined} sourceAnchor={undefined} />,
    )
    // The closed mount skips the re-seed effect without touching the form.
    rerender(
      <TaskFormModal visible onClose={() => {}} identityName="业务员" prefill={{ title: '无截止任务', suggestion: undefined }} sourceSessionId="s_src" sourceAnchor={undefined} />,
    )
    // Clear the default due date, then submit.
    fireEvent.click(screen.getByRole('button', { name: '清除截止时间' }))
    fireEvent.click(screen.getByRole('button', { name: '创建任务' }))
    await waitFor(() => { expect(workSnapshot().items).toHaveLength(1) })
    expect(onlyItem()?.due).toBeUndefined()
    expect(screen.getByText('未定')).toBeTruthy()
    // M1 carries the 未定 due.
    await waitFor(() => {
      const sent = calls.find(call => call.url === '/api/session.prompt')
      expect((sent?.payload?.['content'] as { text: string }[])[0]?.text)
        .toBe('已创建处理任务：无截止任务，负责人 业务员，截止 未定。请知悉。')
    })
  })

  it('leads the sheet head with the business seal (W9-B6)', () => {
    stubGateway(routes)
    const { rerender } = render(
      <TaskFormModal visible onClose={() => {}} identityName="业务员" prefill={undefined} sourceSessionId={undefined} sourceAnchor={undefined} />,
    )
    // No prefill → the plain task word 任.
    expect(screen.getByLabelText('创建处理任务').querySelector('[class*="sheetSeal"]')?.textContent).toBe('任')
    rerender(
      <TaskFormModal
        visible
        onClose={() => {}}
        identityName="业务员"
        prefill={{ title: '采购单 №1042 供应商资质跟进', suggestion: undefined }}
        sourceSessionId="s_src"
        sourceAnchor="3"
      />,
    )
    expect(screen.getByLabelText('创建处理任务').querySelector('[class*="sheetSeal"]')?.textContent).toBe('采')
  })

  it('skips M1 on manual creation (no source session)', async () => {
    stubGateway(routes)
    render(
      <TaskFormModal visible onClose={() => {}} identityName="业务员" prefill={undefined} sourceSessionId={undefined} sourceAnchor={undefined} />,
    )
    const input = screen.getByLabelText('任务标题') as HTMLInputElement
    fireEvent.change(input, { target: { value: '手动任务' } })
    fireEvent.click(screen.getByRole('button', { name: '创建任务' }))
    await waitFor(() => { expect(workSnapshot().items).toHaveLength(1) })
    expect(calls.filter(call => call.url === '/api/session.prompt')).toHaveLength(0)
    expect(await screen.findByText(/已创建任务 · 手动任务/)).toBeTruthy()
  })

  it('rides the immediate-run switch: create → M1 → doing', async () => {
    stubGateway(routes)
    render(
      <TaskFormModal
        visible
        onClose={() => {}}
        identityName="业务员"
        prefill={{ title: '立即执行任务', suggestion: undefined }}
        sourceSessionId="s_src"
        sourceAnchor="3"
      />,
    )
    fireEvent.click(screen.getByRole('switch', { name: '立即执行' }))
    fireEvent.click(screen.getByRole('button', { name: '创建任务' }))
    await waitFor(() => { expect(workSnapshot().items).toHaveLength(1) })
    await waitFor(() => { expect(onlyItem()?.status).toBe('doing') })
    await waitFor(() => { expect(location.hash).toMatch(/^#\/work\/w_/) })
  })
})
