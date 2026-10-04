#!/usr/bin/env node
/**
 * W6-R6 evidence 02: the cockpit fence symmetry assertion the R6 verdict
 * asked for — planner (non-finance) reads GET /fin/cockpit and gets the
 * aggregate KPIs with the customer-dimension details masked server-side
 * (tops.customers/aging drill rows emptied, masked flags true), while
 * finance gets the full customer rows; the money-detail face /fin/aging
 * answers 403 for planner. Runs against the live engine (:13110) with real
 * platform sessions. Output: demos/acceptance-w6/w6-r6-02-cockpit-mask.log.
 */
const NC = 'http://127.0.0.1:13000'
const ENGINE = 'http://127.0.0.1:13110'

const signIn = async (account, password) => {
  const res = await fetch(`${NC}/api/auth:signIn`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ account, password }),
  })
  const body = await res.json()
  if (!res.ok) throw new Error(`signIn ${account} -> ${String(res.status)}`)
  return body.data.token
}

const get = async (token, path) => {
  const res = await fetch(`${ENGINE}${path}`, { headers: { authorization: `Bearer ${token}` } })
  return { status: res.status, body: await res.json().catch(() => null) }
}

const [plannerToken, financeToken] = await Promise.all([
  signIn('planner', 'Planner#2026'), signIn('finance', 'Finance#2026'),
])

const planner = await get(plannerToken, '/fin/cockpit?days=30')
const finance = await get(financeToken, '/fin/cockpit?days=30')
const agingPlanner = await get(plannerToken, '/fin/aging')

const lines = []
const check = (name, ok, detail) => {
  lines.push(`  ${ok ? '✓' : '✗'} ${name}${detail === undefined ? '' : ` — ${detail}`}`)
  if (!ok) process.exitCode = 1
}
const pCockpit = planner.body ?? {}
const fCockpit = finance.body ?? {}
lines.push(`planner GET /fin/cockpit -> HTTP ${String(planner.status)}`)
check('planner 聚合面可读（HTTP 200）', planner.status === 200)
check('planner KPI 卡片可见', Array.isArray(pCockpit.cards) && pCockpit.cards.length === 5, `cards=${String(pCockpit.cards?.length ?? 'n/a')}`)
check('planner Top 客户明细服务端脱敏（customers=[] + masked=true）', Array.isArray(pCockpit.tops?.customers) && pCockpit.tops.customers.length === 0 && pCockpit.tops?.masked === true)
check('planner 账龄客户钻取行脱敏（buckets[].customers 全空 + masked=true）', Array.isArray(pCockpit.aging?.buckets) && pCockpit.aging.buckets.every(bucket => Array.isArray(bucket.customers) && bucket.customers.length === 0) && pCockpit.aging?.masked === true)
check('planner 聚合数值仍在（逾期应收 KPI 非空）', typeof pCockpit.cards?.find(card => card.key === 'ar_overdue')?.value === 'number')
lines.push(`finance GET /fin/cockpit -> HTTP ${String(finance.status)}`)
check('finance Top 客户全量（customers≥1 + masked=false）', Array.isArray(fCockpit.tops?.customers) && fCockpit.tops.customers.length >= 1 && fCockpit.tops?.masked === false, `customers=${String(fCockpit.tops?.customers?.length ?? 'n/a')}`)
check('finance 账龄钻取行全量（masked=false）', fCockpit.aging?.masked === false)
lines.push(`planner GET /fin/aging -> HTTP ${String(agingPlanner.status)}`)
check('planner 明细钱面 /fin/aging 围栏 403', agingPlanner.status === 403, String(agingPlanner.body?.message ?? '').slice(0, 60))

const sample = fCockpit.tops?.customers?.slice(0, 2).map(row => `${String(row.name)}¥${String(row.amount)}`).join(' / ') ?? ''
lines.push(`finance 全量样例：${sample}`)
console.log(lines.join('\n'))
console.log(process.exitCode === 1 ? 'w6-r6-02: FAIL' : 'w6-r6-02: ALL PASS')
