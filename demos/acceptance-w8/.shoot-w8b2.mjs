// W8-B2 evidence shots (375px): the post-split chat page (visual no-regression),
// the alerts group card folded and expanded, the folded 4-chip home row, and
// the v3 required-field error state (the nearby 此项必填 line after a blocked
// confirm). The chat legs ride the real :3080 build with the history/alerts
// reads intercepted to deterministic fixtures (the live roster and session
// shell stay real); writes w8-b2-*.png next to this script.
// Usage (repo root): node demos/acceptance-w8/.shoot-w8b2.mjs
import { chromium } from '../../apps/web/node_modules/playwright/index.mjs'

const BASE = 'http://127.0.0.1:3080/mobile.html'
const OUT = 'demos/acceptance-w8'
const sleep = (ms) => new Promise((resolve) => { setTimeout(resolve, ms) })

/** One user message event, `ago` milliseconds back. */
const userEvent = (seq, ago, text) => ({
  event: { type: 'user/message', seq, time: Date.now() - ago, data: { source: { kind: 'user' }, content: [{ type: 'text', text }] } },
})

/** One assistant message event, `ago` milliseconds back. */
const assistantEvent = (seq, ago, text) => ({
  event: { type: 'assistant/message', seq, time: Date.now() - ago, data: { message: { content: [{ type: 'text', text }] } } },
})

const askFence = '```dsh\n{"v":3,"type":"ask_choice","id":"c1","mode":"single","variant":"buttons","question":"这笔要登记成什么单据？","options":[{"label":"采购单","value":"hub_po","send":"是采购单"},{"label":"出库单","value":"hub_out"}],"allowFreeText":true}\n```'
const draftFence = '```dsh\n{"v":3,"type":"form_draft","draftId":"d_b2","revision":1,"form":{"collection":"hub_po_purchase_orders","label":"采购单"},"title":"鲜丰冷链箱采购","fields":[{"name":"quantity","label":"数量","value":null,"tier":"required","widget":"number"},{"name":"order_date","label":"日期","value":"2026-10-04","tier":"derived","rationale":"今天","widget":"date"}]}\n```'

// The synthetic chat history: a user ask, the answered ask capsule, a link
// narrative, and the v3 three-tier draft card with a blank required quantity
// (the blocked-confirm fixture).
const historyFixture = {
  events: [
    userEvent(1, 400_000, '帮我登记一下，刚和鲜丰谈好一批冷链箱'),
    assistantEvent(2, 300_000, `两个方向，请点选：\n${askFence}`),
    userEvent(3, 200_000, '是采购单'),
    assistantEvent(4, 100_000, '已按 [采购目录](#/docs) 预填草稿，请核对数量。'),
    assistantEvent(5, 90_000, draftFence),
  ],
}

const browser = await chromium.launch()
const results = []
const page = await browser.newPage({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 2 })
await page.goto(`${BASE}#/login`, { waitUntil: 'domcontentloaded' })
await page.evaluate(() => { localStorage.clear() })
await page.reload({ waitUntil: 'domcontentloaded' })
await page.getByText('食链通').first().waitFor({ timeout: 15_000 })
await page.getByPlaceholder('业务账号（如 buyer）').fill('qc_inspector')
await page.getByPlaceholder('业务账号密码').fill('Qc#2026')
await page.getByRole('button', { name: '登录' }).click()
await page.waitForSelector('nav[aria-label="底部导航"]', { timeout: 30_000 })
await sleep(1200)

// 1. Home with the folded 4-chip quick row (W8-B2 7→4).
await page.screenshot({ path: `${OUT}/w8-b2-01-home-chips4-light.png` })
const chipTexts = await page.evaluate(() =>
  Array.from(document.querySelectorAll('[class*="quickRow"] button')).map(node => node.textContent?.trim()))
results.push(`home chips: ${JSON.stringify(chipTexts)} (expect 4, no 问经营/查看工作/找 AI 同事)`)

const echoOk = (route, value) => {
  const rpcId = JSON.parse(route.request().postData() ?? '{}').rpcId ?? 'stub'
  return route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ rpcId, result: { ok: true, value } }),
  })
}
await page.route('**/api/session.history', (route) => echoOk(route, historyFixture))
await page.route('**/api/nocobase.listMeta', (route) => echoOk(route, { collections: [] }))

// 2. The post-split chat page: bubbles, the answered ask capsule, the link
// grade, the narrative, and the three-tier card — one tree, five modules.
await page.goto(`${BASE}#/chat/w8-b2-shot`, { waitUntil: 'domcontentloaded' })
await page.getByTestId('draft-card-v3').waitFor({ timeout: 15_000 })
await sleep(600)
await page.screenshot({ path: `${OUT}/w8-b2-02-chat-flow-split-light.png`, fullPage: false })
const flowSignals = await page.evaluate(() => ({
  daySeparator: document.querySelectorAll('[class*="daySeparator"]').length,
  userBubble: document.querySelectorAll('[class*="userBubble"]').length,
  askAnswered: document.querySelectorAll('[class*="askAnswered"]').length,
  cardRow: document.querySelectorAll('[class*="cardRow"]').length,
}))
results.push(`chat flow: ${JSON.stringify(flowSignals)} (expect daySeparator≥1, userBubble≥2, askAnswered=1, cardRow≥1)`)

// 3. The v3 required-field error state: the blocked confirm paints the
// nearby 此项必填 line under the blank quantity and focuses it.
await page.getByRole('button', { name: '确认写入' }).click()
await sleep(400)
await page.screenshot({ path: `${OUT}/w8-b2-03-v3-required-error-light.png` })
const errorState = await page.evaluate(() => ({
  errors: Array.from(document.querySelectorAll('[class*="fieldError"]')).map(node => node.textContent),
  focusedIsBlankInput: document.activeElement?.tagName === 'INPUT',
}))
results.push(`v3 blocked confirm: ${JSON.stringify(errorState)} (expect 此项必填 + focused input)`)

// 4./5. The alerts group card folded and expanded: intercept the wfl_alerts
// read with three same-title open CCP rows plus one claimed row.
const now = Date.now()
const ccpRow = (id, agoMs) => ({
  id,
  rule_type: 'ccp_deviation',
  severity: 'critical',
  title: 'CCP 杀菌温度偏离设定值',
  entity_code: `BATCH-${String(id).padStart(4, '0')}`,
  status: 'open',
  owner: null,
  notify_users: ['qc_inspector'],
  detail: {},
  created_at: new Date(now - agoMs).toISOString(),
})
const alertRows = [
  ccpRow(31, 40_000),
  ccpRow(30, 70_000),
  ccpRow(29, 100_000),
  {
    id: 28,
    rule_type: 'expiry',
    severity: 'warning',
    title: '证照 CERT-9 12 天后到期',
    entity_code: 'CERT-9',
    status: 'acknowledged',
    owner: 'qc_inspector',
    notify_users: ['qc_inspector'],
    detail: { days_left: 12 },
    created_at: new Date(now - 3_600_000).toISOString(),
  },
]
await page.unroute('**/api/session.history')
await page.route('**/api/nocobase.list', (route) => {
  const payload = JSON.parse(route.request().postData() ?? '{}')?.payload ?? {}
  if (payload.collection === 'wfl_alerts') {
    return echoOk(route, { count: alertRows.length, page: 1, page_size: 200, rows: alertRows })
  }
  return echoOk(route, { count: 0, page: 1, page_size: 1, rows: [] })
})
await page.goto(`${BASE}#/alerts`, { waitUntil: 'domcontentloaded' })
await page.getByTestId('alert-group').waitFor({ timeout: 15_000 })
await sleep(400)
await page.screenshot({ path: `${OUT}/w8-b2-04-alerts-group-folded-light.png` })
const folded = await page.evaluate(() => ({
  groups: document.querySelectorAll('[data-testid="alert-group"]').length,
  rows: document.querySelectorAll('[data-testid="alert-row"]').length,
  head: document.querySelector('[data-testid="alert-group"]')?.textContent ?? '',
}))
results.push(`alerts folded: groups=${folded.groups} standaloneRows=${folded.rows} head=${JSON.stringify(folded.head.slice(0, 60))}`)
await page.locator('[data-testid="alert-group"] > button').first().click()
await sleep(500)
await page.screenshot({ path: `${OUT}/w8-b2-05-alerts-group-expanded-light.png` })
const expanded = await page.evaluate(() => ({
  rows: document.querySelectorAll('[data-testid="alert-row"]').length,
  expandedState: document.querySelector('[data-testid="alert-group"] > button')?.getAttribute('aria-expanded'),
}))
results.push(`alerts expanded: ${JSON.stringify(expanded)} (expect rows=4, aria-expanded=true)`)

await browser.close()
console.log(results.join('\n'))
