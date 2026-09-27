/**
 * W2-B7 screenshot driver (research artifact): boots nothing itself —
 * targets the running `dsh web` gateway (:3080). Headless Chrome over CDP,
 * admin sign-in (root), then two PNGs of the 应收应付对账 flowPage:
 *   w2-b7-arap-page.png     — page head: the ar/ap balance trend charts
 *   w2-b7-arap-details.png  — the four read-only ledger blocks
 *
 * Usage: node research/2026-09-27-w2-evolution/.shoot-b7.mjs
 */
import { spawn } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import { setTimeout as sleep } from 'node:timers/promises'

const OUT = new URL('.', import.meta.url).pathname
const BASE = 'http://127.0.0.1:3080/nocobase'
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const EMAIL = 'admin@nocobase.com'
const PASSWORD = 'admin123'

const PORT = 9347
const chrome = spawn(CHROME, [
  '--headless=new',
  `--remote-debugging-port=${String(PORT)}`,
  '--user-data-dir=/tmp/dsh-w2b7-shoot-profile',
  '--no-first-run',
  '--disable-gpu',
  '--window-size=1600,1200',
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

async function waitFor(expression, { timeout = 45000, interval = 800 } = {}) {
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

// ── shot 1: the reconciliation page head (the two trend charts) ──
await goto(`${BASE}/admin/w9kpisldougonly`)
try {
  await waitFor('document.body.innerText.includes("应收应付对账") && (document.querySelectorAll(".ant-table-row").length > 0)', { timeout: 45000 })
  await sleep(4000)
} catch {
  const text = await evaluate('document.body.innerText.slice(0, 300)')
  console.log(`warn: recon page still thin: ${text.replace(/\n/g, ' ').slice(0, 160)}`)
}
console.log(`recon url: ${await evaluate('location.href')}`)
await shot('w2-b7-arap-page.png')

// ── shot 2: the four ledger blocks (scroll past the charts) ──
await evaluate('window.scrollTo(0, 900)')
await sleep(2500)
await shot('w2-b7-arap-details.png')
const blocks = await evaluate('document.body.innerText.includes("回款明细") && document.body.innerText.includes("采购发票明细")')
console.log(`all four ledger headings visible after scroll: ${String(blocks)}`)

cleanup()
console.log('done')
