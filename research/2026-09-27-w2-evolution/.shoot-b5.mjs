/**
 * W2-B5 screenshot driver (research artifact): boots nothing itself —
 * targets the running `dsh web` gateway (:3080). Headless Chrome over CDP,
 * admin sign-in (root), then two PNGs:
 *   w2-b5-approval-center.png  — the 审批中心 flowPage (records/todos tables)
 *   w2-b5-flow-configs.png     — wfl_flow_configs records (extras 阈值/容差,
 *                                approver_map 数组, config_note 审计)
 *
 * Usage: node research/2026-09-27-w2-evolution/.shoot-b5.mjs
 */
import { spawn } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import { setTimeout as sleep } from 'node:timers/promises'

const OUT = new URL('.', import.meta.url).pathname
const BASE = 'http://127.0.0.1:3080/nocobase'
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const EMAIL = 'admin@nocobase.com'
const PASSWORD = 'admin123'

const PORT = 9341
const chrome = spawn(CHROME, [
  '--headless=new',
  `--remote-debugging-port=${String(PORT)}`,
  '--user-data-dir=/tmp/dsh-w2b5-shoot-profile',
  '--no-first-run',
  '--disable-gpu',
  '--window-size=1600,1000',
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

const TYPE = (selector, value) => evaluate(`(() => {
  const el = document.querySelector(${JSON.stringify(selector)})
  if (el === null) return 'missing'
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype
  Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, ${JSON.stringify(value)})
  el.dispatchEvent(new Event('input', { bubbles: true }))
  return 'ok'
})()`)

const CLICK_TEXT = (text, scope = 'button') => evaluate(`(() => {
  const el = [...document.querySelectorAll(${JSON.stringify(scope)})].find(b => (b.textContent ?? '').includes(${JSON.stringify(text)}))
  if (el === undefined) return 'missing'
  el.click()
  return 'ok'
})()`)

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

// A live pending document keeps two open todo rows visible in the 审批中心
// table (PO-B5-D ¥150k, submitted and left waiting; never approved here).
{
  const root = new URL('../..', `file://${OUT}`).pathname
  const { readFileSync } = await import('node:fs')
  const key = process.env.NOCOBASE_API_KEY
    ?? readFileSync(`${root}/.env`, 'utf8').split('\n').find(line => line.startsWith('NOCOBASE_API_KEY='))?.slice('NOCOBASE_API_KEY='.length).trim()
  const api = (path, init = {}) => fetch(`http://127.0.0.1:13000${path}`, { ...init, headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' } }).then(response => response.json())
  const orders = await api('/api/pur_orders:list?pageSize=500')
  const existing = orders.data?.find(row => row.code === 'PO-B5-D')
  if (existing === undefined) {
    const suppliers = await api('/api/srm_suppliers:list?pageSize=500')
    const qualified = suppliers.data?.filter(row => row.lifecycle_status === 'qualified' || row.lifecycle_status === 'preferred')?.[0]
    await api('/api/pur_orders:create', { method: 'POST', body: JSON.stringify({
      code: 'PO-B5-D', supplier: { id: qualified.id }, amount: 150_000, currency: 'CNY',
      need_date: new Date(Date.now() + 21 * 86_400_000).toISOString().slice(0, 10),
      compare_note: 'W2-B5 待办展开活样（两行 open 待办留档）',
      doc_status: 'draft', receiving_status: 'none', invoice_status: 'no_invoice',
    }) })
  }
  const fresh = await api('/api/pur_orders:list?pageSize=500')
  const doc = fresh.data?.find(row => row.code === 'PO-B5-D')
  if (doc?.doc_status === 'draft') {
    const { spawnSync } = await import('node:child_process')
    const result = spawnSync('node', ['--import', 'tsx/esm', `${root}examples/kb-agent/scripts/approval-engine.mts`, '--submit', 'pur_orders', String(doc.id), '陈立群'], { stdio: 'inherit' })
    if (result.status !== 0) throw new Error('PO-B5-D submit failed')
  }
  console.log('PO-B5-D pending (two open todos live)')
}
// ── sign in (API token → localStorage injection; the UI form's selectors drift) ──
const signIn = await fetch('http://127.0.0.1:13000/api/auth:signIn', {
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
console.log('session token acquired')

// ── shot 1: the 审批中心 flowPage (its schemaUid route) ──
await goto(`${BASE}/admin/w1w167h6joi0ck6`)
try {
  await waitFor('document.querySelector(".ant-table-row") !== null || document.body.innerText.includes("PO-B5")', { timeout: 45000, interval: 1000 })
  await sleep(2500)
} catch {
  const href = await evaluate('location.href')
  const text = await evaluate('document.body.innerText.slice(0, 300)')
  console.log(`warn: approval center still thin at ${href}: ${text.replace(/\n/g, ' ').slice(0, 160)}`)
}
// The fresh PO-B5-D rows sit on the last page (id-ordered table): page there.
const lastPage = await evaluate('(() => { const el = document.querySelector(".ant-pagination-last"); if (el === null) return "none"; el.click(); return "ok" })()')
if (lastPage === 'ok') {
  await sleep(2500)
  const fresh = await evaluate('document.body.innerText.includes("quality_lead")')
  if (fresh !== true) {
    // Fall back one page if the last page overshot (single-row page).
    await evaluate('(() => document.querySelector(".ant-pagination-prev")?.click())()')
    await sleep(2000)
  }
}
const centerText = await evaluate('document.body.innerText.slice(0, 400)')
console.log(`approval-center url: ${await evaluate('location.href')}`)
console.log(`approval-center text: ${centerText.replace(/\n/g, ' ').slice(0, 160)}`)
await shot('w2-b5-approval-center.png')

// ── shot 2: wfl_flow_configs records (collection manager candidates) ──
const candidates = [
  `${BASE}/admin/settings/data-source-manager/main/wfl_flow_configs/records`,
  `${BASE}/admin/settings/collection-manager/collections/wfl_flow_configs/records`,
  `${BASE}/admin/collections/wfl_flow_configs`,
  `${BASE}/admin/wfl_flow_configs`,
]
let landed = false
for (const url of candidates) {
  await goto(url)
  await sleep(2500)
  const text = await evaluate('document.body.innerText')
  if (text.includes('扩展配置') || text.includes('amount_threshold') || text.includes('采购订单审批') || text.includes('配置变更留痕')) {
    landed = true
    break
  }
}
if (!landed) console.log('warn: wfl_flow_configs records page not reached; falling back to the approval-center shot only')
else await shot('w2-b5-flow-configs.png')

cleanup()
console.log('done')
