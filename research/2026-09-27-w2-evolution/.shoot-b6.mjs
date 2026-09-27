/**
 * W2-B6 screenshot driver (research artifact): boots nothing itself —
 * targets the running `dsh web` gateway (:3080). Headless Chrome over CDP,
 * admin sign-in (root), then three PNGs:
 *   w2-b6-mo-policy.png     — 生产订单 flowPage (kit_policy/overissue_ratio
 *                             columns + the MO-W2B6 demo rows)
 *   w2-b6-split-card.png    — 排产看板 (never-straddle 口径 heading + the
 *                             MO-W2B6-05 overload row's 拆单建议卡 note)
 *   w2-b6-mo-exec-policy.png— MO 执行视图 (kit_policy column)
 *
 * Usage: node research/2026-09-27-w2-evolution/.shoot-b6.mjs
 */
import { spawn } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import { setTimeout as sleep } from 'node:timers/promises'

const OUT = new URL('.', import.meta.url).pathname
const BASE = 'http://127.0.0.1:3080/nocobase'
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const EMAIL = 'admin@nocobase.com'
const PASSWORD = 'admin123'

const PORT = 9346
const chrome = spawn(CHROME, [
  '--headless=new',
  `--remote-debugging-port=${String(PORT)}`,
  '--user-data-dir=/tmp/dsh-w2b6-shoot-profile',
  '--no-first-run',
  '--disable-gpu',
  '--window-size=1680,1000',
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

/** Page the id-ordered table to the block that carries the anchor text (last pages first). */
async function pageToAnchor(anchor) {
  for (let attempt = 0; attempt < 6; attempt += 1) {
    if (await evaluate(`document.body.innerText.includes(${JSON.stringify(anchor)})`)) return true
    const moved = await evaluate('(() => { const el = document.querySelector(".ant-pagination-next"); if (el === null || el.getAttribute("aria-disabled") === "true") return "end"; el.click(); return "ok" })()')
    if (moved !== 'ok') return false
    await sleep(1800)
  }
  return false
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

// ── shot 1: 生产订单 — the policy columns + the demo rows (MO-W2B6-01/02/03) ──
await goto(`${BASE}/admin/w5mfgntyu7wy20a`)
try {
  await waitFor('document.querySelector(".ant-table-row") !== null', { timeout: 45000, interval: 1000 })
  await sleep(2500)
} catch {
  console.log(`warn: 生产订单 thin at ${await evaluate('location.href')}`)
}
const policyHeaderSeen = await evaluate('document.body.innerText.includes("齐套策略")')
if (policyHeaderSeen !== true) console.log('warn: 齐套策略 column not visible — check the w2b6 column mounts')
const demoFound = await pageToAnchor('MO-W2B6-02')
if (demoFound !== true) console.log('warn: MO-W2B6 demo rows not on any page')
console.log(`生产订单: 齐套策略列=${String(policyHeaderSeen)} MO-W2B6行=${String(demoFound)}`)
await shot('w2-b6-mo-policy.png')

// ── shot 2: 排产看板 — the never-straddle 口径 heading + the split-card note ──
await goto(`${BASE}/admin/w5mfgp352sily7f`)
try {
  await waitFor('document.querySelector(".ant-table-row") !== null', { timeout: 45000, interval: 1000 })
  await sleep(2500)
} catch {
  console.log(`warn: 排产看板 thin at ${await evaluate('location.href')}`)
}
// A hard reload (cache bypass) — the gateway may serve a cached schema aggregate.
await send('Page.reload', { ignoreCache: true })
await sleep(4500)
const scopeSeen = await evaluate('document.body.innerText.includes("工序不跨天")')
const cardFound = await pageToAnchor('MO-W2B6-05')
const cardNoteSeen = cardFound ? await evaluate('document.body.innerText.includes("拆 3 份") || document.body.innerText.includes("432")') : false
console.log(`排产看板: 口径声明=${String(scopeSeen)} 建议卡行=${String(cardFound)} 卡数字=${String(cardNoteSeen)}`)
if (scopeSeen !== true) console.log('warn: 口径声明 heading missing — rerun nocobase-w6-mfg-exec.mts')
await shot('w2-b6-split-card.png')

// ── shot 3: MO 执行视图 — the kit_policy column ──
await goto(`${BASE}/admin/w6mfgmct2tf2braf`)
try {
  await waitFor('document.querySelector(".ant-table-row") !== null', { timeout: 45000, interval: 1000 })
  await sleep(2500)
} catch {
  console.log(`warn: MO 执行视图 thin at ${await evaluate('location.href')}`)
}
await pageToAnchor('MO-W2B6-01')
const execPolicySeen = await evaluate('document.body.innerText.includes("齐套策略")')
console.log(`MO 执行视图: 齐套策略列=${String(execPolicySeen)}`)
await shot('w2-b6-mo-exec-policy.png')

cleanup()
console.log('done')
