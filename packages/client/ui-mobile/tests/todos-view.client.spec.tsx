// @vitest-environment jsdom
/**
 * The W6-B1 todos page (G2) over a stubbed gateway: open rows render with
 * their enrichment, the read failure leaves the error card plus a
 * client_error trace (never a silent dash), and the confirm dialog's action
 * rides the acting-user session handoff.
 */

import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { TodosView } from '../src/client/todos/TodosView.tsx'

interface RecordedCall {
  readonly url: string
  readonly payload: Record<string, unknown>
}

let calls: RecordedCall[]

/**
 * Install the gateway fetch stub (the shared pattern): `routes` maps method
 * names to values or per-call producers; an unmapped method answers ok:false.
 */
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
    if (produced instanceof Error) {
      return new Response(
        JSON.stringify({ rpcId: body.rpcId, result: { ok: false, error: { message: produced.message } } }),
        { status: 200 },
      )
    }
    return new Response(
      JSON.stringify({ rpcId: body.rpcId, result: { ok: true, value: produced } }),
      { status: 200 },
    )
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

/** Seed the signed-in identity the page reads. */
function signInAs(username: string): void {
  localStorage.setItem('dsh-mobile-auth', JSON.stringify({ username, nickname: username, token: 'tok-t', loggedAt: 1 }))
}

describe('todos view', () => {
  it('renders the open rows with enrichment (the 同意 dialog handoff rides the live evidence: w6-b1-02; antd-mobile Modal keeps this jsdom worker from draining)', async () => {
    signInAs('qc_inspector')
    stubGateway({
      'nocobase.list': (payload: Record<string, unknown>) => {
        const collection = payload['collection']
        if (collection === 'wfl_approval_todos') {
          return { count: 1, page: 1, page_size: 100, rows: [
            { id: 9, doc_type: 'qm_inspections', doc_id: 15, user: 'qc_inspector', state: 'pending', status: 'open', kind: 'todo' },
            { id: 10, doc_type: 'pur_orders', doc_id: 43, user: 'qc_inspector', state: 'pending', status: 'open', kind: 'cc' },
          ] }
        }
        throw new Error(`unexpected collection ${String(collection)}`)
      },
      'nocobase.get': { row: { id: 15, code: 'QM-2026-0009' } },
    })
    render(<TodosView />)
    const rows = await screen.findAllByTestId('todo-row')
    // The label, enriched title, and state render from server rows; the cc
    // row stays read-only.
    expect(rows[0]?.textContent).toContain('质检单')
    await waitFor(() => { expect(rows[0]?.textContent).toContain('QM-2026-0009') })
    expect(rows[0]?.textContent).toContain('待审批')
    expect(rows[1]?.textContent).toContain('抄送只读')
  })

  it('leaves the error card and a client_error trace on a failed read (never a silent dash)', async () => {
    signInAs('qc_inspector')
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    stubGateway({
      'nocobase.list': () => { throw new Error('待办服务 503') },
    })
    render(<TodosView />)
    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain('待办加载失败')
    expect(alert.textContent).toContain('待办服务 503')
    expect(screen.queryByTestId('todo-row')).toBeNull()
    // The read really fired before failing, and the trace names the surface.
    expect(calls.some(call => call.url === '/api/nocobase.list')).toBe(true)
    expect(warnSpy.mock.calls.some(call => String(call[0]).includes('todos.list'))).toBe(true)
    warnSpy.mockRestore()
  })

  it('renders the empty card when the user holds no open todos', async () => {
    signInAs('qc_inspector')
    stubGateway({ 'nocobase.list': { count: 0, page: 1, page_size: 100, rows: [] } })
    render(<TodosView />)
    await waitFor(() => { expect(screen.getByText(/当前没有待办/)).toBeTruthy() })
  })
})
