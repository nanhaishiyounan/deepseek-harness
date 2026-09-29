/**
 * W5-B3/B4/B5 evidence capture (research artifact) — headless Chrome + CDP
 * over the :3080 gateway (the .b8-shoot.mjs pattern). Three pages, one per
 * batch: the supplier grades (B3), the reorder suggestions with their new
 * conversion columns (B4), and the payments list whose paid terminal now
 * rides the engine (B5).
 *
 * Usage: node research/2026-09-29-w5-rework/.w5-shoot.mjs
 */
import { spawn } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import { setTimeout as sleep } from 'node:timers/promises'

const OUT = new URL('.', import.meta.url).pathname
const BASE = 'http://127.0.0.1:3080'
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const PORT = 9377

const chrome = spawn(CHROME, [
  '--headless=new',
  `--remote-debugging-port=${String(PORT)}`,
  '--user-data-dir=/tmp/dsh-w5-shoot-profile',
  '--no-first-run',
  '--disable-gpu',
  '--window-size=1280,860',
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
const on = (event, handler) => {
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
  await sleep(1000)
}
async function waitFor(expression, { timeout = 30000, interval = 400 } = {}) {
  const deadline = Date.now() + timeout
  for (;;) {
    const value = await evaluate(expression)
    if (value === true) return true
    if (Date.now() > deadline) return false
    await sleep(interval)
  }
}
const BODY_HAS = (text) => `document.body.innerText.includes(${JSON.stringify(text)})`

/** Click the first menu (or any clickable) node whose text matches exactly. */
const CLICK_TEXT = (text) => `(() => {
  const nodes = [...document.querySelectorAll('li,span,a,div')]
  const hit = nodes.find(n => (n.textContent ?? '').trim() === ${JSON.stringify(text)} && n.offsetParent !== null)
  if (hit === undefined) return false
  hit.scrollIntoView({ block: 'center' })
  hit.click()
  return true
})()`

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
await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 860, deviceScaleFactor: 1, mobile: false })

await goto(`${BASE}/nocobase`)
await sleep(2500)
if (await waitFor(`document.querySelector('input') !== null && (document.body.innerText.includes('登录') || document.body.innerText.toLowerCase().includes('sign in'))`, { timeout: 12000 })) {
  await evaluate(`(() => {
    const inputs = [...document.querySelectorAll('input')]
    const email = inputs.find(i => i.type === 'email' || i.type === 'text' || i.name === 'email' || i.placeholder?.includes('邮箱'))
    const password = inputs.find(i => i.type === 'password')
    const set = (el, value) => {
      const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype
      Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, value)
      el.dispatchEvent(new Event('input', { bubbles: true }))
    }
    if (email !== undefined) set(email, 'admin@nocobase.com')
    if (password !== undefined) set(password, 'admin123')
    return { email: email !== undefined, password: password !== undefined }
  })()`)
  await evaluate(`[...document.querySelectorAll('button')].find(b => (b.textContent ?? '').includes('登录') || /sign in/i.test(b.textContent ?? ''))?.click()`)
  console.log('admin sign-in submitted')
}
await waitFor(BODY_HAS('首页') || BODY_HAS('仪表盘') || BODY_HAS('采购'), { timeout: 25000 })
await sleep(1500)

// Direct URL navigation (the b8 pattern): the schemaUid IS the admin path.
const PAGES = [
  ['b3-01-supplier-grades-engine-driven.png', '/nocobase/admin/h4srm2u9xiqx09jb', '供应商档案'],
  ['b4-01-reorder-converted-backref.png', '/nocobase/admin/h5wmstw8iug4upxs', '补货'],
  ['b4-02-shipments-so-ledger.png', '/nocobase/admin/h5wmsvwkqjiiaxdj', '出库单'],
  ['b5-01-payments-paid-terminal.png', '/nocobase/admin/w3pur3an4pwnr1eo', '付款'],
]
for (const [name, path, stageText] of PAGES) {
  await goto(`${BASE}${path}`)
  if (!(await waitFor(BODY_HAS(stageText), { timeout: 25000 }))) {
    console.log(`stage text ${stageText} not seen — capturing anyway`)
  }
  await sleep(2500)
  await shot(name)
  console.log(`captured ${name} (${stageText})`)
}

cleanup()
console.log('w5 shoot done')
