#!/usr/bin/env node
/**
 * W6-B9 acceptance evidence: CDP headless drive over the live services.
 *
 * 1. Engine live triple: /healthz + one POST /scan-alerts pass + the
 *    /fin/cockpit pack read as finance (the numbers the page renders).
 * 2. The 经营总览 cockpit page (cards/trend/tops/aging/chain/alerts) with
 *    the 30/90/180/365 period switch (two shots) and the aging bucket
 *    click-through customer drill.
 * 3. The 财务工作台 page (dunning candidates + task cards with the follow-up
 *    trail open) and the printable four-segment statement page.
 * 4. The 发票匹配 page's three-way-match issue workbench (diff classes +
 *    dispositions).
 * 5. Mobile visibility: finance signs in on :3080/mobile, the #/alerts page
 *    carries the 账期 (ar_overdue) rows routed to finance.
 *
 * Output: demos/acceptance-w6/w6-b9-*.png + w6-b9-shot-meta.json.
 */
import { spawn, execSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'

const NC = 'http://localhost:13000'
const WEB = 'http://localhost:3080'
const ENGINE = 'http://localhost:13110'
const PORT = 9349
const OUT = new URL('../../demos/acceptance-w6/', import.meta.url).pathname
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const COCKPIT_PAGE = '/admin/w6b9cdzrc2lst1dm'
const FINWB_PAGE = '/admin/w6b9fgcovvinqe85'
const MATCH_PAGE = '/admin/w3pur45681oxtcsi'
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const meta = { generatedAt: new Date().toISOString(), steps: {} }

mkdirSync(OUT, { recursive: true })

// The live triple, before any browser opens.
const healthz = await (await fetch(`${ENGINE}/healthz`)).json()
const scan = await (await fetch(`${ENGINE}/scan-alerts`, { method: 'POST' })).json()
meta.steps.liveTriple = { healthz, scanSummary: scan.rules?.map(rule => `${rule.rule}+${rule.created}/~${rule.updated}/-${rule.resolved}`).join(' '), notified: scan.notified }
if (healthz.ok !== true) throw new Error('engine /healthz not ok')
if (scan.ok !== true) throw new Error('engine POST /scan-alerts not ok')

const chromeProc = spawn(CHROME, [
  `--remote-debugging-port=${PORT}`, '--headless=new', '--no-first-run', '--no-default-browser-check',
  '--user-data-dir=/tmp/w6-b9-shot-profile', '--window-size=1440,900', '--disable-gpu', 'about:blank',
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
const shot = async (name, fullPage = false) => {
  const captured = await send('Page.captureScreenshot', { format: 'png', ...(fullPage ? { captureBeyondViewport: true } : {}) })
  execSync(`echo ${captured.data} | base64 -d > ${OUT}${name}`)
  console.log(`w6-b9-shot: ${name}`)
}

/** Sign one NocoBase account in on the PC shell (the w6-b2 form-fill pattern). */
async function pcSignIn(email, password) {
  await evaluate(`localStorage.clear()`)
  let filled = false
  for (let attempt = 0; attempt < 3 && filled !== true; attempt++) {
    await send('Page.navigate', { url: `${NC}/signin` })
    for (let probe = 0; probe < 12 && filled !== true; probe++) {
      await sleep(2000)
      filled = await evaluate(`(() => {
        const inputs = [...document.querySelectorAll('input[type=text], input:not([type])')]
        const pass = [...document.querySelectorAll('input[type=password]')]
        if (inputs.length < 1 || pass.length < 1) return false
        const set = (el, v) => { const s = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; s.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true })) }
        set(inputs[0], ${JSON.stringify(email)}); set(pass[0], ${JSON.stringify(password)}); return true
      })()`)
    }
  }
  if (filled !== true) throw new Error('sign-in form did not render')
  await evaluate(`[...document.querySelectorAll('button')].find(b => b.textContent.includes('登录'))?.click()`)
  await sleep(5000)
  return await evaluate(`fetch('/api/auth:check', { headers: { authorization: 'Bearer ' + localStorage.getItem('NOCOBASE_TOKEN') } }).then(r => r.json()).then(j => String(j.data?.username ?? '')).catch(() => '')`)
}

// ─── A. finance: the cockpit page + period switch + aging drill ───
const finance = await pcSignIn('finance@w5b8.demo', 'Finance#2026')
meta.steps.financeIdentity = finance
const pack = await evaluate(`fetch('${ENGINE}/fin/cockpit?days=90', { headers: { authorization: 'Bearer ' + localStorage.getItem('NOCOBASE_TOKEN') } }).then(r => r.json())`)
meta.steps.cockpitPack = { cards: pack.cards?.map(c => ({ key: c.key, value: c.value })), agingTotal: pack.aging?.total, chain: pack.chain?.length }
if (pack.ok !== true || (pack.cards ?? []).length !== 5) throw new Error('cockpit pack not ok')
await send('Page.navigate', { url: `${NC}${COCKPIT_PAGE}` })
let cockpitOk = false
for (let attempt = 0; attempt < 30 && cockpitOk !== true; attempt++) {
  await sleep(2000)
  cockpitOk = await evaluate(`(() => { const t = document.body.textContent; return t.includes('期间营收') && t.includes('逾期应收') && t.includes('账龄分桶') && t.includes('运营链路状态') })()`)
}
meta.steps.cockpitRender = cockpitOk
if (cockpitOk !== true) throw new Error('cockpit page did not render')
await shot('w6-b9-01-cockpit.png')

// The period switch: 近30天 re-fetches and the header label follows. The
// root re-renders on every fetch (innerHTML rewrite), so the button probe
// retries across any redraw window instead of failing on one gap.
let click30 = 'missing'
for (let probe = 0; probe < 8 && click30 === 'missing'; probe++) {
  await sleep(1500)
  click30 = await evaluate(`(() => { const root = document.querySelector('[data-w6b9="cockpit"]'); if (root === null) return 'missing'; const b = [...root.querySelectorAll('[data-days]')].find(el => el.getAttribute('data-days') === '30'); if (b === undefined) return 'missing'; b.click(); return 'clicked' })()`)
}
console.log(`w6-b9-shot: click30 → ${String(click30)}`)
meta.steps.click30 = click30
if (click30 !== 'clicked') {
  const dump = await evaluate(`document.querySelector('[data-w6b9="cockpit"]')?.innerText.slice(0, 160) ?? '(root missing)'`)
  console.log(`w6-b9-shot: cockpit dump → ${String(dump).replaceAll('\n', ' | ').slice(0, 220)}`)
}
let period30 = false
for (let attempt = 0; attempt < 15 && period30 !== true; attempt++) {
  await sleep(1500)
  period30 = await evaluate(`document.body.textContent.includes('近30天（')`)
}
meta.steps.periodSwitch = period30
if (period30 !== true) throw new Error('period switch to 30d did not re-render')
await shot('w6-b9-02-cockpit-period30.png')

// Back to 90d, then the aging bucket click-through customer drill.
await evaluate(`[...document.querySelectorAll('[data-w6b9="cockpit"] [data-days]')].find(b => b.getAttribute('data-days') === '90')?.click()`)
await sleep(3000)
await evaluate(`(() => { const b = document.querySelector('[data-w6b9="cockpit"] [data-bucket="31-60"]'); if (b) b.click(); return b !== null })()`)
let drill = false
for (let attempt = 0; attempt < 12 && drill !== true; attempt++) {
  await sleep(1500)
  drill = await evaluate(`(() => { const open = document.querySelector('[data-w6b9="cockpit"] [data-bucket="31-60"] > div[style*="border:1px solid #eee"]'); return open !== null && open.textContent.length > 4 })()`)
}
meta.steps.agingDrill = drill
await shot('w6-b9-04-aging-drill.png')

// ─── B. the finance workbench: candidates + task trail + statement ───
await send('Page.navigate', { url: `${NC}${FINWB_PAGE}` })
let finWb = false
for (let attempt = 0; attempt < 30 && finWb !== true; attempt++) {
  await sleep(2000)
  finWb = await evaluate(`(() => { const t = document.body.textContent; return t.includes('催收待办') && t.includes('催收任务') && t.includes('客户对账单') })()`)
}
meta.steps.finWorkbench = finWb
if (finWb !== true) throw new Error('finance workbench did not render')
// Open the seeded task's follow-up trail (the card header click).
await evaluate(`(() => { const card = [...document.querySelectorAll('[data-w6b9="fin-wb"] [data-act="sel"]')].find(el => el.textContent.includes('SO-W6B2-SEED')); if (card) card.click(); return card !== null })()`)
await sleep(1500)
const trailText = await evaluate(`document.querySelector('[data-w6b9="fin-wb"]')?.textContent.includes('承诺')`)
meta.steps.dunningTrailOpen = trailText
await shot('w6-b9-07-dunning-workbench.png')

// The printable statement page (same session, direct navigate).
const finToken = await evaluate(`localStorage.getItem('NOCOBASE_TOKEN') ?? ''`)
await send('Page.navigate', { url: `${ENGINE}/fin/statement/print?statement_no=ST-2026-0001&token=${String(finToken)}`, })
let stmt = false
for (let attempt = 0; attempt < 12 && stmt !== true; attempt++) {
  await sleep(1500)
  stmt = await evaluate(`(() => { const t = document.body.textContent; return t.includes('客户对账单') && t.includes('期初余额') && t.includes('期末余额') && t.includes('打印 / 导出 PDF') })()`)
}
meta.steps.statementPrint = stmt
if (stmt !== true) throw new Error('statement print page did not render')
await shot('w6-b9-05-statement-print.png')

// ─── C. the three-way-match issue workbench on 发票匹配 ───
await send('Page.navigate', { url: `${NC}${MATCH_PAGE}` })
let matchWb = false
for (let attempt = 0; attempt < 30 && matchWb !== true; attempt++) {
  await sleep(2000)
  matchWb = await evaluate(`(() => { const t = document.body.textContent; return t.includes('三单匹配差异工作台') && t.includes('数量差') && t.includes('价格差') })()`)
}
meta.steps.matchWorkbench = matchWb
if (matchWb !== true) throw new Error('match workbench did not render')
// The JSBlock sits below the B7 table on this page — scroll it into the
// viewport before the capture (the seat-top move never landed here).
await evaluate(`document.querySelector('[data-w6b9="match-wb"]')?.scrollIntoView({ block: 'start' })`)
await sleep(1200)
await shot('w6-b9-09-match-workbench.png')

// ─── D. mobile: finance signs in, #/alerts carries the 账期 rows ───
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
if (mobileIdentity !== 'finance') throw new Error(`mobile sign-in identity=${String(mobileIdentity)}`)
await send('Page.navigate', { url: `${WEB}/mobile#/alerts` })
let mobileRows = -1
for (let attempt = 0; attempt < 20 && mobileRows === -1; attempt++) {
  await sleep(2000)
  mobileRows = await evaluate(`(() => {
    const rows = [...document.querySelectorAll('[data-testid=alert-row], article')]
    if (rows.length === 0) return document.querySelector('[class*=emptyCard]') !== null || document.querySelector('[class*=errorCard]') !== null ? 0 : -1
    return rows.length
  })()`)
}
const mobileText = await evaluate(`(() => { const t = document.body.textContent; return { dunning: t.includes('催收任务'), arLabel: t.includes('账期') } })()`)
meta.steps.mobileAlerts = { mobileRows, ...mobileText }
await shot('w6-b9-11-mobile-finance-alerts.png')

writeFileSync(`${OUT}w6-b9-shot-meta.json`, `${JSON.stringify(meta, null, 2)}\n`)
console.log('w6-b9-shot: all evidence captured')
execSync(`pkill -f "remote-debugging-port=${PORT}" || true`)
