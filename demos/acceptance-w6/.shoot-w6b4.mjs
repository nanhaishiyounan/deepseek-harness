/**
 * W6-B4 screenshot driver (demos artifact): boots nothing itself — targets the
 * running engine (:13110) and NocoBase (:13000). Headless Chrome over CDP
 * (the .shoot-b6 precedent). Legs:
 *   w6-b4-01-cards-signin.png   — 卡片流终端签到面板（左签到+右舞台）
 *   w6-b4-02-cards-queue.png    — shop_lead 会话签到后我的队列（MO 卡三段）
 *   w6-b4-03-cards-executing.png— 执行中卡（SOP 要点 + CCP 采集 CL 判定）
 *   w6-b4-04-cards-report.png   — 报工 sheet（三数等式 + CCP 值）
 *   w6-b4-05-cards-submitted.png— 提交成功回执（服务端 JR 单号 + CCP 汇总）
 *   w6-b4-07-plm-console.png    — 配方版本与变更（时间线+蓝黑红 diff+影响面板）
 *   w6-b4-08-eco-table.png      — 工程变更单表格页
 *   w6-b4-09-ccp-config.png     — CCP 监控配置页
 *   w6-b4-10-ccp-records.png    — CCP 监控记录页（含越限行）
 *
 * Usage: node demos/acceptance-w6/.shoot-w6b4.mjs
 */
import { spawn } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import { setTimeout as sleep } from 'node:timers/promises'

const OUT = new URL('.', import.meta.url).pathname
const ENGINE = 'http://127.0.0.1:13110'
const NOCO = 'http://127.0.0.1:13000'
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const EMAIL = 'admin@nocobase.com'
const PASSWORD = 'admin123'

const PORT = 9352
const chrome = spawn(CHROME, [
  '--headless=new',
  `--remote-debugging-port=${String(PORT)}`,
  '--user-data-dir=/tmp/dsh-w6b4-shoot-profile',
  '--no-first-run',
  '--disable-gpu',
  '--window-size=1480,980',
  'about:blank',
], { stdio: 'ignore' })
const cleanup = () => { try { chrome.kill() } catch { /* already gone */ } }
process.on('exit', cleanup)
process.on('SIGINT', () => { cleanup(); process.exit(130) })

let seq = 0
let ws
const pending = new Map()
const listeners = new Map()

function send(method, params = {}) {
  const id = ++seq
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject })
    ws.send(JSON.stringify({ id, method, params }))
  })
}

function on(event, handler) {
  const list = listeners.get(event) ?? []
  list.push(handler)
  listeners.set(event, list)
}

async function connect(wsUrl) {
  ws = new WebSocket(wsUrl)
  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve, { once: true })
    ws.addEventListener('error', reject, { once: true })
  })
  ws.addEventListener('message', (event) => {
    const msg = JSON.parse(event.data)
    if (msg.id !== undefined) {
      const entry = pending.get(msg.id)
      if (entry === undefined) return
      pending.delete(msg.id)
      if (msg.error !== undefined) entry.reject(new Error(`${msg.error.message} ${msg.error.data ?? ''}`))
      else entry.resolve(msg.result)
      return
    }
    for (const handler of listeners.get(msg.method) ?? []) handler(msg.params)
  })
}

async function evaluate(expression) {
  const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
  if (result.exceptionDetails !== undefined) {
    throw new Error(`eval failed: ${JSON.stringify(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text)}`)
  }
  return result.result.value
}

async function shot(name) {
  const result = await send('Page.captureScreenshot', { format: 'png' })
  writeFileSync(`${OUT}${name}`, Buffer.from(result.data, 'base64'))
  console.log(`saved ${name}`)
}

async function goto(url) {
  await send('Page.navigate', { url })
  await new Promise((resolve) => {
    const timer = setTimeout(resolve, 20000)
    on('Page.loadEventFired', () => { clearTimeout(timer); resolve() })
  })
  await sleep(1200)
}

async function waitFor(expression, { timeout = 30000, interval = 400 } = {}) {
  const deadline = Date.now() + timeout
  for (;;) {
    const value = await evaluate(expression)
    if (value === true) return
    if (Date.now() > deadline) throw new Error(`timeout waiting for: ${expression}`)
    await sleep(interval)
  }
}

let tabs
for (let attempt = 0; ; attempt++) {
  try {
    tabs = await (await fetch(`http://127.0.0.1:${String(PORT)}/json/list`)).json()
    break
  } catch (cause) {
    if (attempt > 30) throw cause
    await sleep(500)
  }
}
const page = tabs.find((tab) => tab.type === 'page')
await connect(page.webSocketDebuggerUrl)
await send('Page.enable')
await send('Runtime.enable')

// ── leg 1: the shop-floor card flow terminal ──
await goto(`${ENGINE}/terminals/cards.html`)
await waitFor('document.querySelector("#acct") !== null')
await shot('w6-b4-01-cards-signin.png')
await evaluate(`(() => {
  document.querySelector('#acct').value = 'shop_lead'
  document.querySelector('#passwd').value = 'Lead#2026'
  document.querySelector('#signin-btn').click()
  return true
})()`)
await waitFor('document.querySelector(".fullcard") !== null', { timeout: 30000, interval: 800 })
await sleep(900)
await shot('w6-b4-02-cards-queue.png')
// open the first card that carries an open operation (MO-2026-0002 preferred)
const opened = await evaluate(`(() => {
  const btn = [...document.querySelectorAll('[data-start]')]
  const moCard = btn.find(b => b.closest('[data-card]') !== null && b.closest('.fullcard').innerText.includes('MO-W6B4-FLOW'))
  const target = moCard ?? btn[0]
  if (target === undefined) return 'no-open-card'
  target.click()
  return 'ok'
})()`)
if (opened !== 'ok') throw new Error(`card open failed: ${opened}`)
await waitFor('document.body.innerText.includes("SOP 要点")', { timeout: 20000, interval: 600 })
await sleep(700)
await shot('w6-b4-03-cards-executing.png')
// open the report sheet and fill the equation + the CCP reading
await evaluate(`(() => { document.querySelector('#open-report').click(); return true })()`)
await waitFor('document.querySelector("#qty-good") !== null && document.querySelector(".sheet").classList.contains("open")')
const cycle = await evaluate(`(() => {
  const text = document.querySelector('#equation')?.innerText ?? ''
  const match = text.match(/本循环 (\\d+)/)
  return match === null ? 0 : Number(match[1])
})()`)
await sleep(500)
await shot('w6-b4-04-cards-report.png')

if (cycle <= 0) throw new Error(`no cycle plan parsed from equation: ${cycle}`)
await evaluate(`(async () => {
  // Parse the displayed CL bracket, pick an in-band value, fill CCP first
  // (judge runs), then the qty trio, then click submit once enabled — one
  // evaluate so no external re-render can race the fill.
  const row = document.querySelector('.ccp-row')
  const ccpInput = row === null ? null : row.querySelector('[data-ccp-value]')
  if (ccpInput !== null) {
    const bracket = (row.querySelector('.cl').textContent.match(/\\[([^\\]]+)\\]/) ?? [])[1] ?? ''
    const parts = bracket.split(',').map(s => Number(s.trim())).filter(n => Number.isFinite(n))
    ccpInput.value = String(parts.length === 2 ? (parts[0] + parts[1]) / 2 : parts[0] / 2)
    ccpInput.dispatchEvent(new Event('input', { bubbles: true }))
  }
  document.querySelector('#qty-good').value = String(${String(cycle)})
  document.querySelector('#qty-pending').value = '0'
  document.querySelector('#qty-scrap').value = '0'
  for (const sel of ['#qty-good', '#qty-pending', '#qty-scrap']) {
    document.querySelector(sel).dispatchEvent(new Event('input', { bubbles: true }))
  }
  for (let i = 0; i < 40; i++) {
    const btn = document.querySelector('#sheet-submit')
    if (btn !== null && btn.disabled === false) { btn.click(); return 'clicked' }
    if (ccpInput !== null && ccpInput.value === '') {
      const bracket = (row.querySelector('.cl').textContent.match(/\\[([^\\]]+)\\]/) ?? [])[1] ?? ''
      const parts = bracket.split(',').map(s => Number(s.trim())).filter(n => Number.isFinite(n))
      ccpInput.value = String(parts.length === 2 ? (parts[0] + parts[1]) / 2 : parts[0] / 2)
      ccpInput.dispatchEvent(new Event('input', { bubbles: true }))
      for (const sel of ['#qty-good', '#qty-pending', '#qty-scrap']) {
        document.querySelector(sel).dispatchEvent(new Event('input', { bubbles: true }))
      }
    }
    await new Promise(r => setTimeout(r, 100))
  }
  return 'gave-up: ' + JSON.stringify({ ccp: ccpInput === null ? null : ccpInput.value, judge: row.querySelector('[data-ccp-judge]').className, disabled: document.querySelector('#sheet-submit')?.disabled })
})()`)
await waitFor(`(() => { const n = document.querySelector('#note'); return n !== null && (n.innerText.includes('报工成功') || n.innerText.includes('报工被拒')) })()`, { timeout: 30000, interval: 800 })
console.log(`note: ${String(await evaluate("(document.querySelector('#note') ?? {innerText: ''}).innerText"))}`)
await sleep(900)

await shot('w6-b4-05-cards-submitted.png')

// ── leg 2: the NocoBase governance pages (admin session injection) ──
const signIn = await fetch(`${NOCO}/api/auth:signIn`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
}).then(response => response.json()).catch(error => ({ error: String(error) }))
const sessionToken = signIn?.data?.token
if (typeof sessionToken !== 'string' || sessionToken === '') {
  throw new Error(`auth:signIn refused: ${JSON.stringify(signIn).slice(0, 200)}`)
}
await send('Page.addScriptToEvaluateOnNewDocument', {
  source: `localStorage.setItem('NOCOBASE_TOKEN', ${JSON.stringify(sessionToken)}); localStorage.setItem('NOCOBASE_LOCALE', 'zh-CN');`,
})

// PLM console: product11 → v1 vs latest diff + the latest ECO impact
await goto(`${NOCO}/admin/w6b4bnn0n7n2p2i`)
await waitFor('document.querySelector(\'[data-w6b4="plm-console"] select\') !== null', { timeout: 45000, interval: 1000 })
await sleep(1500)
await evaluate(`(() => {
  const root = document.querySelector('[data-w6b4="plm-console"]')
  const prod = root.querySelector('[data-w6b4-prod]')
  const option = [...prod.options].find(o => o.textContent.includes('水饺'))
  if (option !== undefined) { prod.value = option.value }
  if (typeof window.__w6b4PlmRender === 'function') window.__w6b4PlmRender()
  return true
})()`)
await sleep(900)
await evaluate(`(() => {
  const root = document.querySelector('[data-w6b4="plm-console"]')
  const a = root.querySelector('[data-w6b4-diff-a]')
  const b = root.querySelector('[data-w6b4-diff-b]')
  if (a.options.length > 1) { a.value = a.options[1].value }
  if (b.options.length > 1) { b.value = b.options[b.options.length - 1].value }
  const eco = root.querySelector('[data-w6b4-eco]')
  if (eco.options.length > 1) { eco.value = eco.options[1].value }
  if (typeof window.__w6b4PlmRender === 'function') window.__w6b4PlmRender()
  return true
})()`)
await sleep(1200)
await shot('w6-b4-07-plm-console.png')

await goto(`${NOCO}/admin/w6b4bcr7wfgjxww`)
await waitFor('document.querySelector(".ant-table-row") !== null || document.body.innerText.includes("ECO-")', { timeout: 45000, interval: 1000 })
await sleep(2000)
await shot('w6-b4-08-eco-table.png')

await goto(`${NOCO}/admin/w6b4c4t709ypn92m`)
await waitFor('document.body.innerText.includes("CCP-")', { timeout: 45000, interval: 1000 })
await sleep(1800)
await shot('w6-b4-09-ccp-config.png')

await goto(`${NOCO}/admin/w6b4ce752lctbwp8`)
await waitFor('document.querySelector(".ant-table-row") !== null || document.body.innerText.includes("CCP-XT-01")', { timeout: 45000, interval: 1000 })
await sleep(1800)
await shot('w6-b4-10-ccp-records.png')

console.log('w6b4 shoot: done')
cleanup()
