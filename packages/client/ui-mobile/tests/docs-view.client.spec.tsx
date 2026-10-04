// @vitest-environment jsdom
/**
 * The W6-B1/W6-R1 documents pages over a stubbed gateway: the deep-link role
 * guard bounces a configured role out of an out-of-scope collection, the
 * list renders rows plus the fifty-row truncation notice, the detail reads
 * its trail off `acted_at` with zh field titles, and read failures leave the
 * error card plus a client_error trace.
 */

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DocsView } from '../src/client/docs/DocsView.tsx'
import { navigate } from '../src/client/router.ts'

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

/** Seed the signed-in identity the guard reads. */
function signInAs(username: string): void {
  localStorage.setItem('dsh-mobile-auth', JSON.stringify({ username, nickname: username, token: 'tok-d', loggedAt: 1 }))
}

/** Route one hash then fire the router's hashchange (the shell's pattern). */
function routeHash(hash: string): void {
  navigate(hash)
  fireEvent(window, new HashChangeEvent('hashchange'))
}

describe('docs view: the deep-link role guard (W6-R1 P0-2 layer 1)', () => {
  it('bounces buyer out of qm_inspections back onto the directory', async () => {
    signInAs('buyer')
    stubGateway({ 'nocobase.list': { count: 0, page: 1, page_size: 50, rows: [] } })
    render(<DocsView collection="qm_inspections" rowId={undefined} />)
    // The guard redirects to the directory with the refusal toast, and the
    // bounced list's rows never render (the server's scope table owns the
    // zero-row guarantee; the child's effect may race one fetch out).
    await waitFor(() => { expect(location.hash).toBe('#/docs') })
    await waitFor(() => { expect(document.querySelector('.adm-toast-main')?.textContent ?? '').toContain('无权访问') })
    expect(screen.queryByTestId('docs-row')).toBeNull()
    // The directory (not the bounced list) owns the tree now.
    expect(screen.getAllByTestId('docs-collection').length).toBe(3)
  })

  it('lets buyer into pur_orders and stays fail-open for unconfigured accounts', async () => {
    signInAs('buyer')
    stubGateway({
      'nocobase.list': { count: 1, page: 1, page_size: 50, rows: [{ id: 43, code: 'PO-2026-1053', doc_status: 'pending' }] },
    })
    render(<DocsView collection="pur_orders" rowId={undefined} />)
    await waitFor(() => { expect(screen.getByTestId('docs-row').textContent).toContain('PO-2026-1053') })
    expect(location.hash).toBe('')
    cleanup()
    // chenliqun (a real supervisor outside the role table) reads freely.
    signInAs('chenliqun')
    stubGateway({
      'nocobase.list': { count: 1, page: 1, page_size: 50, rows: [{ id: 15, code: 'QM-2026-0009', doc_status: 'approved' }] },
    })
    render(<DocsView collection="qm_inspections" rowId={undefined} />)
    await waitFor(() => { expect(screen.getByTestId('docs-row').textContent).toContain('QM-2026-0009') })
    expect(location.hash).toBe('')
  })
})

describe('docs view: the list face', () => {
  it('renders rows, the posting-state words, and the fifty-row truncation notice', async () => {
    signInAs('keeper')
    stubGateway({
      'nocobase.list': {
        count: 82,
        page: 1,
        page_size: 50,
        rows: Array.from({ length: 50 }, (_, index) => ({ id: 50 - index, receipt_no: `RCV-${String(50 - index)}`, lifecycle_status: 'draft' })),
      },
    })
    render(<DocsView collection="wms_receipts" rowId={undefined} />)
    await waitFor(() => { expect(screen.getAllByTestId('docs-row')).toHaveLength(50) })
    // A posting collection's draft reads 待过账 (never approval words).
    expect(screen.getAllByText('待过账').length).toBeGreaterThan(0)
    // The capped page says so.
    expect(screen.getByText(/仅显示最新 50 条/)).toBeTruthy()
  })

  it('leaves the error card and a client_error trace on a failed read (never a silent dash)', async () => {
    signInAs('keeper')
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    stubGateway({ 'nocobase.list': () => { throw new Error('单据服务 503') } })
    render(<DocsView collection="wms_receipts" rowId={undefined} />)
    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain('单据加载失败')
    expect(alert.textContent).toContain('单据服务 503')
    expect(warnSpy.mock.calls.some(call => String(call[0]).includes('docs.list'))).toBe(true)
    warnSpy.mockRestore()
  })

  it('routes a row tap onto the detail hash', async () => {
    signInAs('keeper')
    stubGateway({ 'nocobase.list': { count: 1, page: 1, page_size: 50, rows: [{ id: 7, receipt_no: 'RCV-7', lifecycle_status: 'posted' }] } })
    render(<DocsView collection="wms_receipts" rowId={undefined} />)
    fireEvent.click(await screen.findByTestId('docs-row'))
    expect(location.hash).toBe('#/docs/wms_receipts/7')
  })
})

describe('docs view: the detail face', () => {
  it('renders the zh field titles and the trail read off acted_at', async () => {
    signInAs('qc_inspector')
    stubGateway({
      'nocobase.get': { row: { id: 15, code: 'QM-2026-0009', doc_status: 'approved' } },
      'nocobase.list': (payload: Record<string, unknown>) => {
        if (payload['collection'] === 'wfl_approval_records') {
          expect(payload['filter']).toEqual([
            { field: 'doc_type', op: 'eq', value: 'qm_inspections' },
            { field: 'doc_id', op: 'eq', value: 15 },
          ])
          return { count: 1, page: 1, page_size: 30, rows: [
            { action: 'submit', approver: 'qc_inspector', from_state: 'draft', to_state: 'pending', comment: '', acted_at: '2026-10-01T02:00:00.000Z' },
          ] }
        }
        throw new Error('unexpected list')
      },
      'nocobase.listMeta': { collections: [
        { name: 'qm_inspections', fields: [
          { name: 'code', type: 'string', title: '质检单号' },
          { name: 'doc_status', type: 'string', title: '单据状态' },
        ] },
      ] },
    })
    render(<DocsView collection="qm_inspections" rowId="15" />)
    // The zh titles land over the raw snake_case names.
    await waitFor(() => { expect(screen.getByText('质检单号')).toBeTruthy() })
    expect(screen.getByText('单据状态')).toBeTruthy()
    expect(screen.queryByText('code')).toBeNull()
    // The trail row renders with its acted_at timestamp.
    await waitFor(() => { expect(screen.getByText(/提交送审/)).toBeTruthy() })
    expect(document.querySelector('[aria-label="审批轨迹"]')?.textContent).toContain('2026-10-01')
  })

  it('degrades to raw field names and an empty trail when the side reads fail', async () => {
    signInAs('qc_inspector')
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    stubGateway({
      'nocobase.get': { row: { id: 15, code: 'QM-2026-0009' } },
      'nocobase.list': () => { throw new Error('轨迹 503') },
      'nocobase.listMeta': () => { throw new Error('元数据 503') },
    })
    render(<DocsView collection="qm_inspections" rowId="15" />)
    await waitFor(() => { expect(screen.getByText('code')).toBeTruthy() })
    expect(screen.getByText(/无审批记录/)).toBeTruthy()
    expect(warnSpy.mock.calls.some(call => String(call[0]).includes('docs.trail'))).toBe(true)
    warnSpy.mockRestore()
  })
})

describe('docs view: routing faces', () => {
  it('renders the index for the bare hash and keeps guard state local', async () => {
    signInAs('buyer')
    stubGateway({})
    render(<DocsView collection={undefined} rowId={undefined} />)
    expect(screen.getAllByTestId('docs-collection').length).toBe(3)
    routeHash('#/docs')
    expect(screen.getAllByTestId('docs-collection').length).toBe(3)
  })
})
