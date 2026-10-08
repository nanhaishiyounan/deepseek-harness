// @vitest-environment jsdom
/**
 * The W6-B2/R2 alerts page over a stubbed gateway: the rows the server's
 * row scope returned render with the red/yellow tiers, the segment counts,
 * and the days-left wording; every row carries its own action (认领 for a
 * routed user, 关闭 for the claimant) through nocobase.alertAct, and the
 * engine's refusal toasts its fact instead of silently dropping the act; a
 * failed read leaves the error card plus a client_error trace.
 */

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AlertsView } from '../src/client/alerts/AlertsView.tsx'
import { actMyAlert, listMyAlerts } from '../src/client/ledgerService.ts'

// Toast's motion loop never settles in jsdom (it busy-spins the worker); the
// assertions ride the wire calls, so the toast surface stays a spy here.
vi.mock('antd-mobile', async importOriginal => ({
  ...(await importOriginal<typeof import('antd-mobile')>()),
  Toast: { show: vi.fn() },
}))

let calls: { method: string; payload: Record<string, unknown> }[]

/**
 * Install the gateway fetch stub (the todos spec's shared pattern): `routes`
 * maps method names to values or per-call producers; an unmapped method
 * answers ok:false.
 */
function stubGateway(routes: Record<string, unknown>): void {
  calls = []
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    const body = JSON.parse((init?.body ?? '{}') as string) as { rpcId?: string; payload?: Record<string, unknown> }
    const method = url.replace('/api/', '')
    calls.push({ method, payload: body.payload ?? {} })
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

/** Seed the signed-in identity the page reads. */
function signInAs(username: string): void {
  localStorage.setItem('dsh-mobile-auth', JSON.stringify({ username, nickname: username, token: 'tok-t', loggedAt: 1 }))
}

/** The wfl_alerts rows the gateway's keeper-scoped page carries (row scope is the server's since W6-R2). */
const KEEPER_ROWS = [
  { id: 21, rule_type: 'expiry', severity: 'critical', title: '批次 LOT-2026-09-01 已过期 18 天', entity_code: 'LOT-2026-09-01', status: 'open', owner: null, notify_users: ['keeper', 'b4guard'], detail: { days_left: -18 } },
  { id: 23, rule_type: 'cert_due', severity: 'warning', title: '证照 CERT-9（食品经营许可）12 天后到期', entity_code: 'CERT-9', status: 'acknowledged', owner: 'keeper', notify_users: ['buyer'], detail: { days_left: 12 } },
]

describe('alerts view', () => {
  it('renders the scoped rows with tiers, segments, the days wording, and the per-row actions', async () => {
    signInAs('keeper')
    stubGateway({
      'nocobase.list': { count: KEEPER_ROWS.length, page: 1, page_size: 200, rows: KEEPER_ROWS },
    })
    render(<AlertsView />)
    const rows = await screen.findAllByTestId('alert-row')
    // The gateway already scoped the page (keeper's routed + owned rows);
    // the page maps what crossed the wire and adds the row actions.
    expect(rows).toHaveLength(2)
    expect(rows[0]?.textContent).toContain('已过期 18 天')
    expect(rows[0]?.querySelector('[data-severity="critical"]')?.textContent).toBe('紧急')
    expect(rows[0]?.textContent).toContain('效期预警')
    expect(rows[0]?.textContent).toContain('待认领')
    expect(rows[1]?.textContent).toContain('已认领 · keeper')
    // The open row offers 认领 to its routed user; only the claimant's
    // acknowledged row offers 关闭.
    expect(rows[0]?.textContent).toContain('认领')
    expect(rows[0]?.querySelector('[aria-label="关闭预警 LOT-2026-09-01"]')).toBeNull()
    expect(rows[1]?.querySelector('[aria-label="关闭预警 CERT-9"]')).not.toBeNull()
    // The segment counts read the rendered set: 1 紧急 + 效期 1 + 资质 1.
    const segText = screen.getByLabelText('按规则类型').textContent ?? ''
    expect(segText).toContain('紧急')
    expect(segText).toContain('效期')
    expect(segText).toContain('资质')
    // The read rides the open/acknowledged filter over wfl_alerts.
    expect(calls[0]?.payload['collection']).toBe('wfl_alerts')
  })

  it('folds adjacent same-rule open rows into one collapsible group and keeps claimed rows out (W8-B2)', async () => {
    signInAs('b4guard')
    const now = Date.now()
    const ccpRow = (id: number, status: string, owner: string | null): Record<string, unknown> => ({
      id,
      rule_type: 'ccp_deviation',
      severity: 'critical',
      title: 'CCP 杀菌温度偏离设定值',
      entity_code: `BATCH-${String(id)}`,
      status,
      owner,
      notify_users: ['b4guard'],
      detail: {},
      created_at: new Date(now - (32 - id) * 10_000).toISOString(),
    })
    stubGateway({
      'nocobase.list': { count: 4, page: 1, page_size: 200, rows: [
        ccpRow(31, 'open', null),
        ccpRow(30, 'open', null),
        ccpRow(29, 'open', null),
        ccpRow(28, 'acknowledged', 'b4guard'),
      ] },
    })
    render(<AlertsView />)
    // One folded group card carries the rule name, the ×3 count, and the
    // newest raised time on its header; the acknowledged same-title row
    // stays outside as its own plain row.
    const group = await screen.findByTestId('alert-group')
    expect(group.textContent).toContain('CCP预警')
    expect(group.textContent).toContain('×3')
    expect(group.textContent).toContain('最新 刚刚')
    expect(screen.getAllByTestId('alert-row')).toHaveLength(1)
    expect(screen.getAllByTestId('alert-row')[0]?.textContent).toContain('已认领 · b4guard')
    // The folded body renders no detail row; expanding reveals the three.
    const head = group.querySelector('button[aria-expanded="false"]') as HTMLButtonElement
    expect(group.querySelectorAll('[data-testid="alert-row"]')).toHaveLength(0)
    fireEvent.click(head)
    const open = await screen.findAllByTestId('alert-row')
    expect(open).toHaveLength(4)
    expect(open[0]?.textContent).toContain('BATCH-31')
    expect(open[2]?.textContent).toContain('BATCH-29')
    // The raised-time cell renders on a standalone row too.
    expect(open[3]?.textContent).toContain('刚刚')
  })

  it('bands by urgency: urgent first, near labeled, far collapsed behind the fold (W23-B2)', async () => {
    signInAs('keeper')
    stubGateway({
      'nocobase.list': { count: 4, page: 1, page_size: 200, rows: [
        { id: 41, rule_type: 'cert_due', severity: 'warning', title: '证照 CERT-F 72 天后到期', entity_code: 'CERT-F', status: 'open', owner: null, notify_users: ['keeper'], detail: { days_left: 72 } },
        { id: 42, rule_type: 'cert_due', severity: 'warning', title: '证照 CERT-F 73 天后到期', entity_code: 'CERT-F', status: 'open', owner: null, notify_users: ['keeper'], detail: { days_left: 73 } },
        { id: 43, rule_type: 'expiry', severity: 'warning', title: '批次 LOT-N 12 天后到期', entity_code: 'LOT-N', status: 'open', owner: null, notify_users: ['keeper'], detail: { days_left: 12 } },
        { id: 44, rule_type: 'expiry', severity: 'critical', title: '批次 LOT-U 已过期 3 天', entity_code: 'LOT-U', status: 'open', owner: null, notify_users: ['keeper'], detail: { days_left: -3 } },
      ] },
    })
    render(<AlertsView />)
    // The far band stays behind one collapsed fold with its count.
    const fold = await screen.findByRole('button', { name: /2 条远期提醒/ })
    expect(screen.queryByTestId('alert-group')).toBeNull()
    // The near band's labeled section and the urgent row render openly.
    expect(screen.getByRole('heading', { name: '近期关注' })).toBeTruthy()
    expect(screen.getByText('逾期 3 天')).toBeTruthy()
    fireEvent.click(fold)
    // The two far scans of one certificate fold into one group whose header
    // carries the day range, not one row per scan day.
    const group = screen.getByTestId('alert-group')
    expect(group.textContent).toContain('×2')
    expect(group.textContent).toContain('72~73 天后到期')
  })

  it('keys two empty-code title folds of one band+rule apart: no expansion cross-talk (W23-R5)', async () => {
    signInAs('keeper')
    const row = (id: number, title: string): Record<string, unknown> => ({
      id,
      rule_type: 'expiry',
      severity: 'warning',
      title,
      entity_code: '',
      status: 'open',
      owner: null,
      notify_users: ['keeper'],
      detail: { days_left: 12 },
    })
    stubGateway({
      'nocobase.list': { count: 4, page: 1, page_size: 200, rows: [
        row(51, '一批次 12 天后到期'),
        row(52, '一批次 12 天后到期'),
        row(53, '二批次 12 天后到期'),
        row(54, '二批次 12 天后到期'),
      ] },
    })
    render(<AlertsView />)
    // Two same-band, same-rule groups whose heads carry an empty entity
    // code both render as group cards; the pre-R5 key `near::expiry::` was
    // shared, so React rendered duplicate keys and one toggle drove both.
    const groups = await screen.findAllByTestId('alert-group')
    expect(groups).toHaveLength(2)
    fireEvent.click(groups[0]?.querySelector('button[aria-expanded]') as HTMLButtonElement)
    // Only the clicked group opens; the other stays collapsed with no rows.
    expect(groups[0]?.querySelector('button[aria-expanded]')?.getAttribute('aria-expanded')).toBe('true')
    expect(groups[1]?.querySelector('button[aria-expanded]')?.getAttribute('aria-expanded')).toBe('false')
    expect(groups[0]?.querySelectorAll('[data-testid="alert-row"]')).toHaveLength(2)
    expect(groups[1]?.querySelectorAll('[data-testid="alert-row"]')).toHaveLength(0)
  })

  it('keys two same-title empty-code groups an intervening other-rule row splits apart (W23-R5)', async () => {
    signInAs('keeper')
    const expiry = (id: number): Record<string, unknown> => ({
      id,
      rule_type: 'expiry',
      severity: 'warning',
      title: '同题批次 12 天后到期',
      entity_code: '',
      status: 'open',
      owner: null,
      notify_users: ['keeper'],
      detail: { days_left: 12 },
    })
    stubGateway({
      'nocobase.list': { count: 5, page: 1, page_size: 200, rows: [
        expiry(61),
        expiry(62),
        { id: 63, rule_type: 'cert_due', severity: 'warning', title: '证照 CERT-Z 20 天后到期', entity_code: '', status: 'open', owner: null, notify_users: ['keeper'], detail: { days_left: 20 } },
        expiry(64),
        expiry(65),
      ] },
    })
    render(<AlertsView />)
    // The intervening cert_due row breaks the fold chain: two same-title
    // groups plus one plain row. A title-only fallback segment would key
    // them alike again; the head row id keeps them apart.
    const groups = await screen.findAllByTestId('alert-group')
    expect(groups).toHaveLength(2)
    expect(screen.getAllByTestId('alert-row')).toHaveLength(1)
    fireEvent.click(groups[1]?.querySelector('button[aria-expanded]') as HTMLButtonElement)
    expect(groups[0]?.querySelector('button[aria-expanded]')?.getAttribute('aria-expanded')).toBe('false')
    expect(groups[1]?.querySelectorAll('[data-testid="alert-row"]')).toHaveLength(2)
  })

  it('renders an empty-code single open row as a plain row: the group card needs two members', async () => {
    signInAs('keeper')
    stubGateway({
      'nocobase.list': { count: 1, page: 1, page_size: 200, rows: [
        { id: 71, rule_type: 'expiry', severity: 'warning', title: '孤立批次 12 天后到期', entity_code: '', status: 'open', owner: null, notify_users: ['keeper'], detail: { days_left: 12 } },
      ] },
    })
    render(<AlertsView />)
    expect(await screen.findAllByTestId('alert-row')).toHaveLength(1)
    expect(screen.queryByTestId('alert-group')).toBeNull()
  })

  it('resets a title fold expansion when a re-read re-orders its members (W23-R5 semantics lock)', async () => {
    signInAs('keeper')
    const foldRow = (id: number): Record<string, unknown> => ({
      id,
      rule_type: 'expiry',
      severity: 'warning',
      title: '同题到期批次',
      entity_code: '',
      status: 'open',
      owner: null,
      notify_users: ['keeper'],
      detail: { days_left: 12 },
    })
    let rows = [foldRow(81), foldRow(82)]
    stubGateway({
      'nocobase.list': () => ({ count: rows.length, page: 1, page_size: 200, rows }),
    })
    vi.useFakeTimers()
    try {
      render(<AlertsView />)
      await vi.advanceTimersByTimeAsync(0)
      const group = screen.getByTestId('alert-group')
      fireEvent.click(group.querySelector('button[aria-expanded]') as HTMLButtonElement)
      expect(group.querySelectorAll('[data-testid="alert-row"]')).toHaveLength(2)
      // The next poll re-orders the members: the head row changes, the
      // title-fold key follows the head, and the opened state resets —
      // the locked contract for groups not folded on a shared code.
      rows = [rows[1]!, rows[0]!]
      await vi.advanceTimersByTimeAsync(30_000)
      const reRead = screen.getByTestId('alert-group')
      expect(reRead.querySelector('button[aria-expanded]')?.getAttribute('aria-expanded')).toBe('false')
      expect(reRead.querySelectorAll('[data-testid="alert-row"]')).toHaveLength(0)
    } finally {
      vi.useRealTimers()
    }
  })

  it('keeps a code-fold expansion when a re-read re-orders its members (W23-R6 dual anchor)', async () => {
    signInAs('keeper')
    const codeRow = (id: number, title: string, days: number): Record<string, unknown> => ({
      id,
      rule_type: 'expiry',
      severity: 'warning',
      title,
      entity_code: 'LOT-K',
      status: 'open',
      owner: null,
      notify_users: ['keeper'],
      detail: { days_left: days },
    })
    // Distinct titles fold this pair on the shared entity code, not on a
    // shared title — the fold the reset test above never covers.
    let rows = [codeRow(91, '甲批 LOT-K 12 天后到期', 12), codeRow(92, '乙批 LOT-K 15 天后到期', 15)]
    stubGateway({
      'nocobase.list': () => ({ count: rows.length, page: 1, page_size: 200, rows }),
    })
    vi.useFakeTimers()
    try {
      render(<AlertsView />)
      await vi.advanceTimersByTimeAsync(0)
      const group = screen.getByTestId('alert-group')
      fireEvent.click(group.querySelector('button[aria-expanded]') as HTMLButtonElement)
      expect(group.querySelectorAll('[data-testid="alert-row"]')).toHaveLength(2)
      // The next poll re-orders the members: the head row changes, but the
      // shared code — not the head identity — keys the group, so the opened
      // state survives. The dual anchor of the title-fold reset above.
      rows = [rows[1]!, rows[0]!]
      await vi.advanceTimersByTimeAsync(30_000)
      const reRead = screen.getByTestId('alert-group')
      expect(reRead.querySelector('button[aria-expanded]')?.getAttribute('aria-expanded')).toBe('true')
      expect(reRead.querySelectorAll('[data-testid="alert-row"]')).toHaveLength(2)
    } finally {
      vi.useRealTimers()
    }
  })

  // NOTE: the button→act wiring is NOT jsdom-click-tested here — antd-mobile's
  // button click never reaches the handler under this environment and spins
  // the worker. The live four-step smoke (demos/acceptance-w6/w6-r2-01: real
  // browser click → engine → psql owner/status → both-end readback) owns
  // that wiring; these tests pin the render contract and the service layer.

  it('leaves the error card and a client_error trace on a failed read (never a silent dash)', async () => {
    signInAs('keeper')
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    stubGateway({ 'nocobase.list': new Error('网关不可达') })
    render(<AlertsView />)
    await waitFor(() => { expect(screen.getByRole('alert').textContent).toContain('网关不可达') })
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('"scope":"alerts.list"'))
  })
})

describe('listMyAlerts (the server-scoped read)', () => {
  it('maps the wire page verbatim (the routed-user cut is the gateway row scope)', async () => {
    signInAs('keeper')
    stubGateway({
      'nocobase.list': { count: KEEPER_ROWS.length, page: 1, page_size: 200, rows: KEEPER_ROWS },
    })
    const mine = await listMyAlerts()
    expect(mine).toHaveLength(2)
    expect(mine[0]?.id).toBe(21)
    expect(mine[0]?.severity).toBe('critical')
    expect(mine[0]?.daysLeft).toBe(-18)
    expect(mine[0]?.owner).toBeUndefined()
    expect(mine[1]?.id).toBe(23)
    expect(mine[1]?.owner).toBe('keeper')
    expect(mine[1]?.daysLeft).toBe(12)
  })
})

describe("actMyAlert (the row action's service contract)", () => {
  it('sends id/action plus the session token and no client-narrated user', async () => {
    signInAs('keeper')
    stubGateway({ 'nocobase.alertAct': { id: 21, action: 'claim', user: 'keeper' } })
    const outcome = await actMyAlert({ id: 21, ruleType: 'expiry', severity: 'critical', title: '', entityCode: '', owner: undefined, status: 'open', daysLeft: undefined, createdAt: undefined }, 'claim')
    expect(outcome).toMatchObject({ id: 21, action: 'claim', user: 'keeper' })
    const call = calls.find(entry => entry.method === 'nocobase.alertAct')
    expect(call?.payload).toMatchObject({ id: 21, action: 'claim' })
    expect(call?.payload['authToken']).toBe('tok-t')
    expect(call?.payload['user']).toBeUndefined()
    expect(call?.payload['note']).toBeUndefined()
  })

  it('trims a non-empty resolve note onto the wire and throws the engine refusal fact', async () => {
    signInAs('keeper')
    stubGateway({ 'nocobase.alertAct': new Error('动作被拒（id=21 claim by keeper）——不在路由责任人白名单或状态流不匹配（认领→关闭）') })
    const row = { id: 21, ruleType: 'expiry', severity: 'critical' as const, title: '', entityCode: '', owner: undefined, status: 'open', daysLeft: undefined, createdAt: undefined }
    await expect(actMyAlert(row, 'resolve', '  已处理  ')).rejects.toThrow('不在路由责任人白名单')
    const call = calls.find(entry => entry.method === 'nocobase.alertAct')
    expect(call?.payload['note']).toBe('已处理')
  })
})
