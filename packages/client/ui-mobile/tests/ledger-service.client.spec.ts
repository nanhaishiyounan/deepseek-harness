// @vitest-environment jsdom
/**
 * The ledger services (G2/G3) over a stubbed gateway: the todo read and its
 * enrichment, and the month projection — its filter rides `acted_at` with a
 * local-calendar month start (the W6-R1 column/timezone pair), never a
 * UTC-sliced date.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { enrichTodoRows, listMyTodos, myMonthlyRegistrations } from '../src/client/ledgerService.ts'

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
      const failure = { rpcId: body.rpcId, result: { ok: false, error: { message: produced.message } } }
      return new Response(JSON.stringify(failure), { status: 200 })
    }
    return new Response(JSON.stringify({ rpcId: body.rpcId, result: { ok: true, value: produced } }), { status: 200 })
  })
  vi.stubGlobal('fetch', fetchMock)
}

beforeEach(() => {
  localStorage.clear()
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('listMyTodos (G2)', () => {
  it('reads the open rows for the user with todo-kind first ordering inputs', async () => {
    stubGateway({
      'nocobase.list': { count: 2, page: 1, page_size: 100, rows: [
        { id: 9, doc_type: 'qm_inspections', doc_id: 15, user: 'qc_inspector', state: 'pending', status: 'open', kind: 'todo' },
        { id: 10, doc_type: 'pur_orders', doc_id: 43, user: 'qc_inspector', state: 'pending', status: 'open', kind: 'cc' },
      ] },
    })
    const rows = await listMyTodos('qc_inspector')
    expect(rows).toHaveLength(2)
    expect(rows[0]).toMatchObject({ id: 9, docType: 'qm_inspections', docId: 15, kind: 'todo', docLabel: '质检单' })
    expect(rows[1]?.kind).toBe('cc')
    const listCall = calls.find(call => call.url === '/api/nocobase.list')
    expect(listCall?.payload['collection']).toBe('wfl_approval_todos')
    expect(listCall?.payload['filter']).toEqual([
      { field: 'user', op: 'eq', value: 'qc_inspector' },
      { field: 'status', op: 'eq', value: 'open' },
    ])
  })

  it('propagates the read failure (the page renders the error card)', async () => {
    stubGateway({ 'nocobase.list': () => { throw new Error('待办 503') } })
    await expect(listMyTodos('qc_inspector')).rejects.toThrow('待办 503')
  })

  it('enriches titles and degrades a missing document to the raw id', async () => {
    stubGateway({
      'nocobase.get': (payload: Record<string, unknown>) => {
        if (payload['id'] === 15) return { row: { id: 15, code: 'QM-2026-0009' } }
        throw new Error('nocobase-row-missing')
      },
    })
    const enriched = await enrichTodoRows([
      { id: 9, docType: 'qm_inspections', docId: 15, user: 'qc', state: 'pending', kind: 'todo', docTitle: undefined, docLabel: '质检单' },
      { id: 11, docType: 'qm_nc_dispositions', docId: 404, user: 'qc', state: 'pending', kind: 'todo', docTitle: undefined, docLabel: '不合格处置单' },
    ])
    expect(enriched[0]?.docTitle).toBe('QM-2026-0009')
    expect(enriched[1]?.docTitle).toBe('#404')
  })
})

describe('myMonthlyRegistrations (G3, the W6-R1 column/boundary pair)', () => {
  it('windows acted_at by local-month date-only strings (the column compares dates, not instants)', async () => {
    stubGateway({ 'nocobase.list': { count: 7, page: 1, page_size: 1, rows: [] } })
    const count = await myMonthlyRegistrations('buyer')
    expect(count).toBe(7)
    const listCall = calls.find(call => call.url === '/api/nocobase.list')
    expect(listCall?.payload['collection']).toBe('wfl_approval_records')
    const filter = listCall?.payload['filter'] as { field: string; op: string; value: string }[]
    expect(filter).toEqual([
      { field: 'approver', op: 'eq', value: 'buyer' },
      { field: 'action', op: 'eq', value: 'submit' },
      { field: 'acted_at', op: 'gt', value: expect.any(String) },
      { field: 'acted_at', op: 'lt', value: expect.any(String) },
    ])
    const now = new Date()
    const pad = (value: number): string => String(value).padStart(2, '0')
    const dayBefore = new Date(now.getFullYear(), now.getMonth(), 0)
    const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1)
    // gt the local day before the month start, lt the local next-month first
    // day — date-only strings the engine column actually compares (a full
    // ISO instant matches nothing against date-only values).
    expect(filter[2]?.value).toBe(`${String(dayBefore.getFullYear())}-${pad(dayBefore.getMonth() + 1)}-${pad(dayBefore.getDate())}`)
    expect(filter[3]?.value).toBe(`${String(nextMonth.getFullYear())}-${pad(nextMonth.getMonth() + 1)}-${pad(nextMonth.getDate())}`)
    expect(filter[2]?.value ?? '').toMatch(/^\d{4}-\d{2}-\d{2}$/u)
    expect(filter[3]?.value ?? '').toMatch(/^\d{4}-\d{2}-\d{2}$/u)
  })

  it('propagates the projection failure (the metric reads 读取失败, never a wrong count)', async () => {
    stubGateway({ 'nocobase.list': () => { throw new Error('台账 503') } })
    await expect(myMonthlyRegistrations('buyer')).rejects.toThrow('台账 503')
  })
})
