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
