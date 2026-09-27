/**
 * B8 dual-end capture (research artifact, not product code) — headless
 * Chrome + CDP, the .shoot-live.mjs pattern.
 *
 *   b8-admin-disposition-kanban.png  处置看板（质量管理组）
 *   b8-admin-inspections.png         质检单列表（AQL 缓存列）
 *   b8-admin-scorecard.png           季度绩效物化（2026Q3 68/C）
 *   b8-mobile-aql-card.png           mobile 真实 LLM 对话：AQL 判定建议卡
 *   b8-mobile-qc-query.png           mobile 真实 LLM 对话：质检单查询卡
 *
 * Usage: node research/2026-09-25-w-round/.b8-shoot.mjs
 */
import { spawn } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import { setTimeout as sleep } from 'node:timers/promises'

const OUT = new URL('.', import.meta.url).pathname
const BASE = 'http://127.0.0.1:3080'
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const PORT = 9371

const chrome = spawn(CHROME, [
  '--headless=new',
  `--remote-debugging-port=${String(PORT)}`,
  '--user-data-dir=/tmp/dsh-b8-shoot-profile',
  '--no-first-run',
  '--disable-gpu',
  '--window-size=1280,860',
  'about:blank',
], { stdio: 'ignore' })
const cleanup = () => { try { chrome.kill() } catch { /* already gone */ } }
process.on('exit', cleanup)
process.on('SIGINT', () => { cleanup(); process.exit(130) })

const evidence = []
const note = (line) => { evidence.push(line); console.log(`[B8] ${line}`) }

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
  await sleep(800)
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

async function waitForStage(expression, stage, options) {
  if (!(await waitFor(expression, options))) {
    throw new Error(`timeout waiting for ${stage}: ${expression}`)
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

const BODY_HAS = (text) => `document.body.innerText.includes(${JSON.stringify(text)})`

async function setMobileViewport() {
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true })
}

async function setDesktopViewport() {
  await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 860, deviceScaleFactor: 1, mobile: false })
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

// ─── Part 1: admin 质量管理三页（desktop, NocoBase root sign-in）──────────────
await setDesktopViewport()
await goto(`${BASE}/nocobase`)
await sleep(2000)
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
  note('admin sign-in submitted')
}
await waitFor(BODY_HAS('质量管理') || BODY_HAS('首页') || BODY_HAS('仪表盘'), { timeout: 20000 })
await sleep(1500)
const menuHasQuality = await evaluate(BODY_HAS('质量管理'))
note(`admin menu shows 质量管理: ${String(menuHasQuality)}`)

for (const [name, path, stageText] of [
  ['b8-admin-inspections.png', '/nocobase/admin/w8qmjvyv8p5j7j', '质检单'],
  ['b8-admin-disposition-kanban.png', '/nocobase/admin/w8qm472nluqt32x', '处置看板'],
  ['b8-admin-scorecard.png', '/nocobase/admin/w8qm8sx2tj9j0kb', '季度绩效物化'],
]) {
  await goto(`${BASE}${path}`)
  await waitForStage(BODY_HAS(stageText), `admin page ${stageText}`, { timeout: 25000 })
  await sleep(2500)
  await shot(name)
  note(`admin ${stageText} captured`)
}

// ─── Part 2: mobile 真实 LLM 对话（live runmode：探测到模型即 live）────────────
await setMobileViewport()
await goto(`${BASE}/mobile.html`)
await evaluate('localStorage.clear()')
await evaluate(`localStorage.setItem('dsh-mobile-theme', 'light')`)
await send('Page.navigate', { url: 'about:blank' })
await sleep(300)
await goto(`${BASE}/mobile.html#/login`)
await waitForStage(BODY_HAS('食链通'), 'login screen')
await TYPE('input[inputmode="numeric"]', '123456')
await evaluate(`[...document.querySelectorAll('button')].find(b => (b.textContent ?? '').includes('登录'))?.click()`)
await waitForStage(BODY_HAS('今日台账'), 'mobile home after login')

// Enter the form assistant chat via the agents roster (live LLM turn).
await goto(`${BASE}/mobile.html#/agents`)
await waitForStage(`document.querySelector('button[aria-label^="找 "]') !== null`, 'agents roster', { timeout: 15000 })
const tapped = await evaluate(`(() => {
  const rows = [...document.querySelectorAll('button[aria-label^="找 "]')]
  const target = rows.find(b => (b.getAttribute('aria-label') ?? '').includes('智能填表助手')) ?? rows[0]
  if (target === undefined) return false
  target.click(); return target.getAttribute('aria-label')
})()`)
note(`chat entered via roster: ${String(tapped)}`)
await waitForStage(`location.hash.startsWith('#/chat/')`, 'chat route', { timeout: 20000 })
await waitForStage(`document.querySelector('textarea') !== null`, 'chat textarea', { timeout: 20000 })
await sleep(1000)

const sendTurn = async (message) => {
  await evaluate(`(() => { document.querySelector('textarea').focus(); return true; })()`)
  await TYPE('textarea', message)
  await evaluate(`[...document.querySelectorAll('button')].find(b => b.getAttribute('aria-label') === '发送')?.click()`)
  // Wait for the turn to settle: the typing indicator appears then retires.
  await waitFor(BODY_HAS('正在处理') || BODY_HAS('思考'), { timeout: 20000 })
  await waitForStage(`!document.body.innerText.includes('正在处理') && !document.body.innerText.includes('思考中')`, 'llm turn settled', { timeout: 150000 })
  await sleep(1200)
}

await sendTurn('来料一批批量 200，抽检了 32 件发现 2 个次要不合格，帮我按 AQL 判定一下该不该收')
const aqlCard = await evaluate(BODY_HAS('AQL') || BODY_HAS('接收') || BODY_HAS('判定'))
note(`mobile AQL 判定卡出现: ${String(aqlCard)}`)
await shot('b8-mobile-aql-card.png')

await sendTurn('再帮我查一下质检单 QI-2026-0004 判得怎么样')
const queryCard = await evaluate(BODY_HAS('QI-2026-0004') || BODY_HAS('不合格'))
note(`mobile 质检查询卡出现: ${String(queryCard)}`)
await shot('b8-mobile-qc-query.png')

writeFileSync(`${OUT}.b8-shoot-evidence.json`, `${JSON.stringify({ capturedAt: new Date().toISOString(), base: BASE, evidence }, null, 2)}\n`)
cleanup()
process.exit(0)
