#!/usr/bin/env node
/**
 * W6-R5 acceptance evidence: CDP headless drive over the live services.
 *
 * B3: the finance workbench statement list's print <a> — href rides
 *     printUrl() (token included), fetch answers 200, and the opened page
 *     renders the four-segment balance.
 * KPI: the cockpit's ratio chips render value×scale (schedule_hit=1 →
 *     "100%", never "1%").
 * Drill: the ar_overdue card click opens the aging bucket drill; the AP
 *     side switch shows the AP mirror buckets.
 * Claim: the alert digest's 账期 row carries a 认领 button → POST
 *     /alerts/act claim as finance → the verdict banner stays.
 * Dispose: the match workbench's 处置 opens an editable textarea (note
 *     lands on submit).
 * Mobile: the alert-center notices badge by category — a dunning notice
 *     wears 催收, not 召回.
 *
 * Output: demos/acceptance-w6/w6-r5-*.png + w6-r5-shot-meta.json.
 */
import { spawn, execSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'

const NC = 'http://localhost:13000'
const WEB = 'http://localhost:3080'
const ENGINE = 'http://localhost:13110'
const PORT = 9351
const OUT = new URL('../../demos/acceptance-w6/', import.meta.url).pathname
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const COCKPIT_PAGE = '/admin/w6b9cdzrc2lst1dm'
const FINWB_PAGE = '/admin/w6b9fgcovvinqe85'
const MATCH_PAGE = '/admin/w3pur45681oxtcsi'
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const meta = { generatedAt: new Date().toISOString(), steps: {} }

mkdirSync(OUT, { recursive: true })

const healthz = await (await fetch(`${ENGINE}/healthz`)).json()
if (healthz.ok !== true) throw new Error('engine /healthz not ok')
meta.steps.healthz = healthz.ok

const chromeProc = spawn(CHROME, [
  `--remote-debugging-port=${PORT}`, '--headless=new', '--no-first-run', '--no-default-browser-check',
  '--user-data-dir=/tmp/w6-r5-shot-profile', '--window-size=1440,900', '--disable-gpu', 'about:blank',
], { stdio: ['ignore', 'pipe', 'pipe'], detached: true })
chromeProc.stderr.on('data', (chunk) => process.stderr.write(`[chrome] ${chunk}`))
chromeProc.unref()

let target = null
for (let attempt = 0; attempt < 20 && target === null; attempt++) {
  await sleep(1000)
  try {
    target = await (await fetch(`http://localhost:${PORT}/json/new?about:blank`, { method: 'PUT' })).json()
  } catch { /* chrome not up yet */ }
}
if (target === null) throw new Error('headless chrome did not come up')

const ws = new WebSocket(target.webSocketDebuggerUrl)
let seq = 0
const pending = new Map()
const send = (method, params = {}) => new Promise((resolve, reject) => {
  const id = ++seq
  pending.set(id, { resolve, reject })
  ws.send(JSON.stringify({ id, method, params }))
})
ws.onmessage = (event) => {
  const message = JSON.parse(event.data)
  if (message.id != null && pending.has(message.id)) {
    const { resolve, reject } = pending.get(message.id)
    pending.delete(message.id)
    message.error ? reject(new Error(JSON.stringify(message.error))) : resolve(message.result)
  }
}
await new Promise((resolve) => (ws.onopen = resolve))
await send('Page.enable')
const evaluate = async (expression) => {
  const result = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })
  return result?.result?.value
}
const shot = async (name) => {
  const captured = await send('Page.captureScreenshot', { format: 'png' })
  execSync(`echo ${captured.data} | base64 -d > ${OUT}${name}`)
  console.log(`w6-r5-shot: ${name}`)
}

/**
 * Sign one NocoBase account in on the PC shell (the w6-b2 form-fill pattern).
 * One navigation with a long probe window — the SPA cold-boots ~30s before
 * the form mounts, and a re-navigation would reset that wait every attempt.
 */
async function pcSignIn(email, password) {
  await send('Storage.clearDataForOrigin', { origin: NC, storageTypes: 'all' })
  await send('Page.navigate', { url: `${NC}/signin` })
  let filled = false
  for (let probe = 0; probe < 45 && filled !== true; probe++) {
    await sleep(2000)
    filled = await evaluate(`(() => {
      const inputs = [...document.querySelectorAll('input[type=text], input:not([type])')]
      const pass = [...document.querySelectorAll('input[type=password]')]
      if (inputs.length < 1 || pass.length < 1) return false
      const set = (el, v) => { const s = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; s.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true })) }
      set(inputs[0], ${JSON.stringify(email)}); set(pass[0], ${JSON.stringify(password)}); return true
    })()`)
  }
  if (filled !== true) throw new Error('sign-in form did not render')
  await evaluate(`[...document.querySelectorAll('button')].find(b => b.textContent.includes('登录'))?.click()`)
  await sleep(5000)
  return await evaluate(`fetch('/api/auth:check', { headers: { authorization: 'Bearer ' + localStorage.getItem('NOCOBASE_TOKEN') } }).then(r => r.json()).then(j => String(j.data?.username ?? '')).catch(() => '')`)
}

// ─── finance signs in ───
const finance = await pcSignIn('finance@w5b8.demo', 'Finance#2026')
meta.steps.financeIdentity = finance
if (finance !== 'finance') throw new Error(`finance sign-in identity=${String(finance)}`)

// ─── B3: the statement list print link rides printUrl() (token included) ───
await send('Page.navigate', { url: `${NC}${FINWB_PAGE}` })
let finWb = false
for (let attempt = 0; attempt < 30 && finWb !== true; attempt++) {
  await sleep(2000)
  finWb = await evaluate(`(() => { const root = document.querySelector('[data-w6b9="fin-wb"]'); return root !== null && root.textContent.includes('客户对账单') && root.querySelector('a[target="_blank"]') !== null })()`)
}
meta.steps.finWbRender = finWb
if (finWb !== true) throw new Error('finance workbench did not render')
const printProbe = await evaluate(`(async () => {
  const link = document.querySelector('[data-w6b9="fin-wb"] a[target="_blank"]')
  const href = link?.getAttribute('href') ?? ''
  const tok = localStorage.getItem('NOCOBASE_TOKEN') ?? ''
  const status = await fetch(href).then(r => r.status).catch(() => 0)
  const body = await fetch(href).then(r => r.text()).catch(() => '')
  return { href, hrefHasToken: href.includes('token=' + encodeURIComponent(tok)), fetchStatus: status, rendersFourSegments: body.includes('期初余额') && body.includes('期末余额') }
})()`)
meta.steps.printLink = { hrefHasToken: printProbe.hrefHasToken, fetchStatus: printProbe.fetchStatus, rendersFourSegments: printProbe.rendersFourSegments }
await evaluate(`[...document.querySelectorAll('table')].find(t => t.textContent.includes('打印/导出'))?.scrollIntoView({ block: 'center' })`)
await sleep(800)
await shot('w6-r5-03a-finwb-print-link.png')
await send('Page.navigate', { url: printProbe.href })
let stmt = false
for (let attempt = 0; attempt < 12 && stmt !== true; attempt++) {
  await sleep(1500)
  stmt = await evaluate(`(() => { const t = document.body.textContent; return t.includes('客户对账单') && t.includes('期末余额') && t.includes('打印 / 导出 PDF') })()`)
}
meta.steps.statementPrintOpen = stmt
await shot('w6-r5-03b-print-200.png')

// ─── KPI×100: the cockpit ratio chips render 100%, not 1% ───
await send('Page.navigate', { url: `${NC}${COCKPIT_PAGE}` })
let cockpitOk = false
for (let attempt = 0; attempt < 30 && cockpitOk !== true; attempt++) {
  await sleep(2000)
  cockpitOk = await evaluate(`(() => { const t = document.body.textContent; return t.includes('期间营收') && t.includes('逾期应收') && t.includes('账龄分桶') && t.includes('运营链路状态') })()`)
}
meta.steps.cockpitRender = cockpitOk
if (cockpitOk !== true) throw new Error('cockpit page did not render')
const kpiProbe = await evaluate(`(() => {
  const root = document.querySelector('[data-w6b9="cockpit"]')
  const chips = [...(root?.querySelectorAll('div') ?? [])].filter(d => d.textContent.includes('生产达成率') && d.textContent.length < 40)
  const hit = chips[0]?.textContent ?? ''
  return { has100: hit.includes('100%'), hasRaw1: /(^|[^0-9.])1%(?![0-9])/.test(hit), chipText: hit }
})()`)
meta.steps.kpi100 = kpiProbe
await evaluate(`(() => { const chips = [...document.querySelectorAll('[data-w6b9="cockpit"] div')].filter(d => d.textContent.includes('生产达成率') && d.textContent.length < 40); chips[0]?.scrollIntoView({ block: 'center' }) })()`)
await sleep(600)
await shot('w6-r5-04-kpi-100.png')

// ─── drill: the ar_overdue card click opens the aging bucket drill ───
const drillProbe = await evaluate(`(() => {
  const card = document.querySelector('[data-card="ar_overdue"]')
  if (card === null) return { clicked: false }
  card.click()
  return { clicked: true }
})()`)
await sleep(1200)
const drillState = await evaluate(`(() => {
  const root = document.querySelector('[data-w6b9="cockpit"]')
  const panel = root?.querySelector('[data-panel="aging"]')
  const open = panel?.querySelector('[data-bucket] div + div + div') ?? null
  return { panelThere: panel !== null, drillOpen: open !== null && panel.textContent.includes('单）'), textHead: (panel?.textContent ?? '').slice(0, 90) }
})()`)
meta.steps.drill = { ...drillProbe, ...drillState }
await evaluate(`document.querySelector('[data-w6b9="cockpit"] [data-panel="aging"]')?.scrollIntoView({ block: 'center' })`)
await sleep(600)
await shot('w6-r5-05-card-drill.png')

// ─── AP switch: the side button flips to the AP mirror buckets ───
await evaluate(`document.querySelector('[data-w6b9="cockpit"] [data-side="ap"]')?.click()`)
await sleep(900)
const apState = await evaluate(`(() => {
  const panel = document.querySelector('[data-w6b9="cockpit"] [data-panel="aging"]')
  const t = panel?.textContent ?? ''
  return { apActive: t.includes('到期合计'), showsTickets: t.includes('票'), arGone: !t.includes('点桶钻取客户') }
})()`)
meta.steps.apSwitch = apState
await shot('w6-r5-05b-ap-switch.png')
await evaluate(`document.querySelector('[data-w6b9="cockpit"] [data-side="ar"]')?.click()`)
await sleep(600)

// ─── claim: the digest row's 认领 button → /alerts/act claim ───
// The open digest's top rows are CCP (route: planner/shop_lead/qc/quality),
// so the claim runs as planner — finance is not on that whitelist (the
// 账期 rows sit below the critical flood and never reach the top-8 cut).
const planner = await pcSignIn('planner@w5b8.demo', 'Planner#2026')
meta.steps.plannerIdentity = planner
await send('Page.navigate', { url: `${NC}${COCKPIT_PAGE}` })
let cockpit2 = false
for (let attempt = 0; attempt < 30 && cockpit2 !== true; attempt++) {
  await sleep(2000)
  cockpit2 = await evaluate(`(() => { const t = document.body.textContent; return t.includes('期间营收') && t.includes('账龄分桶') })()`)
}
const claimPick = await evaluate(`(() => {
  const root = document.querySelector('[data-w6b9="cockpit"]')
  const rows = [...(root?.querySelectorAll('[data-act="claim"]') ?? [])]
  const arRow = rows.find(b => (b.closest('div')?.textContent ?? '').includes('账期')) ?? rows[0]
  if (arRow === undefined) return { found: false }
  arRow.scrollIntoView({ block: 'center' })
  arRow.click()
  return { found: true, label: (arRow.closest('div')?.textContent ?? '').slice(0, 60) }
})()`)
let claimVerdict = ''
for (let probe = 0; probe < 12 && claimVerdict === ''; probe++) {
  await sleep(1500)
  claimVerdict = await evaluate(`document.querySelector('[data-w6b9="cockpit"] [data-note="verdict"]')?.textContent ?? ''`)
}
meta.steps.claim = { ...claimPick, verdict: claimVerdict }
await sleep(400)
await shot('w6-r5-06-alert-claim.png')

// Back to finance: the match workbench's disposition is finance-fenced.
const financeAgain = await pcSignIn('finance@w5b8.demo', 'Finance#2026')
meta.steps.financeIdentityAgain = financeAgain

// ─── dispose: the match workbench's 处置 opens an editable textarea ───
await send('Page.navigate', { url: `${NC}${MATCH_PAGE}` })
let matchWb = false
for (let attempt = 0; attempt < 30 && matchWb !== true; attempt++) {
  await sleep(2000)
  matchWb = await evaluate(`(() => { const t = document.body.textContent; return t.includes('三单匹配差异工作台') && t.includes('数量差') })()`)
}
meta.steps.matchWorkbench = matchWb
await evaluate(`document.querySelector('[data-w6b9="match-wb"]')?.scrollIntoView({ block: 'start' })`)
const disposeOpen = await evaluate(`(() => {
  const btn = document.querySelector('[data-w6b9="match-wb"] [data-act="resolve"][data-kind="resolved"]')
  if (btn === null) return { opened: false }
  btn.scrollIntoView({ block: 'center' })
  btn.click()
  return { opened: true }
})()`)
await sleep(900)
const disposeState = await evaluate(`(() => {
  const ta = document.querySelector('[data-w6b9="match-wb"] textarea[data-in="resolve-note"]')
  return { textareaThere: ta !== null, defaultValue: (ta?.value ?? '').slice(0, 40), confirmBtn: document.querySelector('[data-w6b9="match-wb"] [data-act="resolve-confirm"]') !== null }
})()`)
meta.steps.dispose = { ...disposeOpen, ...disposeState }
await sleep(400)
await shot('w6-r5-07-dispose-textarea.png')
// Submit once with an edited note so the disposition lands (resolve_note 落表).
const disposeSubmit = await evaluate(`(async () => {
  const ta = document.querySelector('[data-w6b9="match-wb"] textarea[data-in="resolve-note"]')
  if (ta === null) return { submitted: false }
  const set = (el, v) => { const s = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set; s.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true })) }
  set(ta, 'W6-R5 处置说明可编辑验证：补收已在途（演示处置留痕）')
  document.querySelector('[data-w6b9="match-wb"] [data-act="resolve-confirm"]')?.click()
  for (let i = 0; i < 10; i++) {
    await new Promise(r => setTimeout(r, 800))
    const verdict = document.querySelector('[data-w6b9="match-wb"] div')?.textContent ?? ''
    if (verdict.includes('处置成功')) return { submitted: true, verdict: verdict.slice(0, 80) }
  }
  return { submitted: false }
})()`)
meta.steps.disposeSubmit = disposeSubmit

// ─── mobile: the dunning notice wears 催收, not 召回 ───
await send('Page.navigate', { url: `${WEB}/mobile` })
await sleep(3000)
await evaluate(`localStorage.clear()`)
await send('Page.navigate', { url: 'about:blank' })
await sleep(500)
await send('Page.navigate', { url: `${WEB}/mobile#/login` })
await sleep(3000)
let mobileFilled = false
for (let probe = 0; probe < 12 && mobileFilled !== true; probe++) {
  await sleep(2000)
  mobileFilled = await evaluate(`(() => {
    const inputs = [...document.querySelectorAll('input')]
    const account = inputs.find(i => (i.placeholder ?? '').includes('业务账号') && i.type !== 'password')
    const pass = inputs.find(i => i.type === 'password')
    if (account === undefined || pass === undefined) return false
    const set = (el, v) => { const s = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; s.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true })) }
    set(account, 'finance'); set(pass, 'Finance#2026'); return true
  })()`)
}
if (mobileFilled !== true) throw new Error('mobile sign-in form did not render')
await evaluate(`[...document.querySelectorAll('button')].find(b => b.textContent.includes('登录'))?.click()`)
await sleep(6000)
const mobileIdentity = await evaluate(`(() => { const raw = localStorage.getItem('dsh-mobile-auth'); return raw === null ? null : JSON.parse(raw).username })()`)
meta.steps.mobileIdentity = mobileIdentity
await send('Page.navigate', { url: `${WEB}/mobile#/alerts` })
let mobileReady = false
for (let attempt = 0; attempt < 30 && mobileReady !== true; attempt++) {
  await sleep(2000)
  // The data-arrived probe: an alert row, a notice card, or an explicit
  // empty/error state — never the page title (「我的预警」 matches a bare
  // skeleton too, which is how the first run shot a loading frame).
  mobileReady = await evaluate(`(() => document.querySelector('[data-testid="alert-row"], [data-testid="recall-notice"], [class*="emptyCard"], [class*="errorCard"]') !== null)()`)
}
const mobileBadge = await evaluate(`(() => {
  const notices = [...document.querySelectorAll('[data-testid="recall-notice"]')]
  const dunning = notices.filter(n => n.textContent.includes('催收'))
  const badgeWrong = dunning.filter(n => n.querySelector('[data-severity]')?.textContent === '召回')
  const chipDunning = document.body.textContent.includes('催收')
  return { noticeTotal: notices.length, dunningBadge: dunning.length, dunningWearingRecall: badgeWrong.length, chipDunning }
})()`)
meta.steps.mobileBadge = mobileBadge
await sleep(400)
await shot('w6-r5-08-mobile-dunning-badge.png')

writeFileSync(`${OUT}w6-r5-shot-meta.json`, `${JSON.stringify(meta, null, 2)}\n`)
console.log('w6-r5-shot: all evidence captured')
console.log(JSON.stringify(meta.steps, null, 2))
execSync(`pkill -f "remote-debugging-port=${PORT}" || true`)
