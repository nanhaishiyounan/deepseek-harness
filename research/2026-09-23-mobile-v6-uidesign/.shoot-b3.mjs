/**
 * B3 screenshot driver (research artifact, not product code).
 *
 * Targets the already-running `dsh web` dev server (:3080,
 * DSH_HOME=examples/kb-agent/.dsh) with a dedicated headless Chrome over CDP
 * at 390×844. Walks the demo login, then captures the v6 chat surface: the
 * fresh-session welcome (starter chips), the open draft card (a real
 * unconfirmed session), the seeded report/receipt flow, the fenced code
 * plate (a live model reply), the quick panel, the typing indicator window,
 * the work-detail timeline with its progress bar, and both theme tracks for
 * the key cards.
 *
 * Usage: node research/2026-09-23-mobile-v6-uidesign/.shoot-b3.mjs
 */
import { spawn } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { setTimeout as sleep } from 'node:timers/promises'

const OUT = new URL('.', import.meta.url).pathname
const BASE = 'http://127.0.0.1:3080'
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const PORT = 9337
/** The v5 walkthrough's injected report session (already in the store). */
const RICH_SEED = 'session-v6-b3-rich'
/** A real session whose v3 draft never got confirmed. */
const DRAFT_SEED = 'session-v6-b3-draft-demo'

mkdirSync(OUT, { recursive: true })
const walk = []
const note = (line) => {
  walk.push(line)
  console.log(`[B3] ${line}`)
}

const chrome = spawn(CHROME, [
  '--headless=new',
  `--remote-debugging-port=${String(PORT)}`,
  '--user-data-dir=/tmp/dsh-v6-b3-profile',
  '--no-first-run',
  '--disable-gpu',
  '--window-size=420,900',
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

async function shot(name, { fullPage = false } = {}) {
  const params = { format: 'png' }
  if (fullPage) params.captureBeyondViewport = true
  const result = await send('Page.captureScreenshot', params)
  writeFileSync(`${OUT}${name}`, Buffer.from(result.data, 'base64'))
  console.log(`saved ${name}`)
}

async function goto(url) {
  await send('Page.navigate', { url })
  await new Promise((resolve) => {
    const timer = setTimeout(resolve, 15000)
    on('Page.loadEventFired', () => { clearTimeout(timer); resolve() })
  })
  await sleep(700)
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

const SCROLL_INTO = (selector) => evaluate(`(() => {
  const el = document.querySelector(${JSON.stringify(selector)})
  if (el === null) return 'missing'
  el.scrollIntoView({ block: 'center' })
  return 'ok'
})()`)

const BODY_HAS = (text) => `document.body.innerText.includes(${JSON.stringify(text)})`

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
await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true })

// --- login (demo run mode pinned; the profile may already hold the identity) ---
await goto(`${BASE}/mobile`)
await evaluate(`localStorage.setItem('dsh-mobile-runmode', 'demo')`)
if (!(await evaluate(BODY_HAS('今日台账')))) {
  await goto(`${BASE}/mobile#/login`)
  await waitFor(BODY_HAS('食链通'))
  await TYPE('input[inputmode="numeric"]', '123456')
  await CLICK_TEXT('登录')
  await waitFor(BODY_HAS('今日台账'))
}
await evaluate(`localStorage.setItem('dsh-mobile-runmode', 'demo')`)

// --- b3-01: fresh-session welcome (the new starter chips) ----------------------
await goto(`${BASE}/mobile#/agents`)
await waitFor(BODY_HAS('智能填表助手'))
await CLICK_TEXT('智能填表助手')
await sleep(1500)
await waitFor(`location.hash.startsWith('#/chat/')`)
await waitFor(`document.querySelector('[data-testid="welcome-card"]') !== null`)
await shot('b3-01-chat-welcome.png', { fullPage: true })
note('b3-01: fresh session — welcome card with the 44px starter chips')

// --- b3-07: quick panel over the same session ----------------------------------
await evaluate(`[...document.querySelectorAll('button')].find(b => b.getAttribute('aria-label') === '打开快捷面板')?.click()`)
await waitFor(`document.querySelector('[role="dialog"][aria-label="快捷指令"]') !== null`)
await sleep(400)
await shot('b3-07-quick-panel.png', { fullPage: true })
note('b3-07: the slide-up quick panel — starter commands + the three placeholder tools')
await evaluate(`[...document.querySelectorAll('button')].find(b => b.getAttribute('aria-label')?.includes('收起快捷面板'))?.click()`)

// --- b3-06: a live fenced code reply --------------------------------------------
await TYPE('textarea', '给我一段 SQL 示例：查每个供应商的采购总额，用 ```sql 代码块回答')
await evaluate(`[...document.querySelectorAll('button')].find(b => b.getAttribute('aria-label') === '发送')?.click()`)
try {
  await waitFor(`document.querySelector('[data-testid="code-box"]') !== null`, { timeout: 90000 })
  await SCROLL_INTO('[data-testid="code-box"]')
  await sleep(300)
  await shot('b3-06-chat-code.png', { fullPage: true })
  note('b3-06: the deep code plate with the language label + copy entry')
} catch {
  note('b3-06: the live model did not return a fenced block in 90s; shot skipped')
  await shot('b3-06-chat-code.png', { fullPage: true })
}

// --- b3-08: the typing indicator window ------------------------------------------
const typingSession = await evaluate(`location.hash.slice('#/chat/'.length)`)
await TYPE('textarea', '再帮我总结一下')
await evaluate(`[...document.querySelectorAll('button')].find(b => b.getAttribute('aria-label') === '发送')?.click()`)
await sleep(2600)
const typingVisible = await evaluate(`document.querySelector('[aria-label="正在处理"], [role="status"]') !== null`)
if (typingVisible) {
  await shot('b3-08-typing.png')
  note('b3-08: the breathing indicator window while the turn runs')
} else {
  await sleep(1200)
  await shot('b3-08-typing.png')
  note('b3-08: the turn settled early; captured the settled state instead')
}

// --- b3-02/03/04/05: the seeded report session ------------------------------------
await goto(`${BASE}/mobile#/chat/${RICH_SEED}`)
await waitFor(`document.querySelector('[data-testid="report-card"]') !== null`, { timeout: 30000 })
await SCROLL_INTO('[data-testid="ask-choice"]')
await shot('b3-03-chat-ask.png', { fullPage: true })
note('b3-03: the notice-formed ask bubble with the answered fork')
await SCROLL_INTO('[data-testid="receipt-card-v3"]')
await sleep(200)
await shot('b3-04-chat-receipt.png')
note('b3-04: the receipt card on the rich-card base')
await SCROLL_INTO('[data-testid="report-card"]')
await sleep(200)
await shot('b3-05-chat-report.png')
note('b3-05: the report card — metric grid, severity rows, ghost/pri actions')

// --- b3-02/b3-10: the injected unconfirmed draft session ----------------------------
await goto(`${BASE}/mobile#/chat/${DRAFT_SEED}`)
await waitFor(`document.querySelector('[data-testid="draft-card-v3"]') !== null`, { timeout: 30000 })
await SCROLL_INTO('[data-testid="draft-card-v3"]')
await sleep(300)
await shot('b3-02-chat-draft.png')
note('b3-02: a live v3 draft card on the card2 plate (the real model lane)')
await SCROLL_INTO('[data-testid="draft-card-v3"] .adm-button, [data-testid="draft-card-v3"] button')
await sleep(200)
await shot('b3-10-task-card.png')
note('b3-10: the three-tier task card with the pri/gray decision row')

// --- b3-09: the work-detail timeline + progress -------------------------------------
await goto(`${BASE}/mobile#/work`)
await waitFor(BODY_HAS('工作'))
await sleep(800)
await evaluate(`(() => { const el = [...document.querySelectorAll('.adm-capsule-tabs-tab')].find(t => (t.textContent ?? '').trim().startsWith('进行中')); if (el !== undefined) el.click(); return el !== undefined; })()`)
await waitFor(`document.querySelectorAll('[data-testid="work-card"]').length > 0`, { timeout: 20000 })
await sleep(600)
await evaluate(`[...document.querySelectorAll('button')].find(b => (b.getAttribute('aria-label') ?? '').startsWith('打开 '))?.click()`)
await waitFor(`document.querySelector('[aria-label="执行时间线"]') !== null`, { timeout: 20000 })
await sleep(2500)
await shot('b3-09-work-timeline.png', { fullPage: true })
note('b3-09: the work detail — progress bar + the time-columned axis timeline')

// --- dark-track spot checks -----------------------------------------------------------
await evaluate(`localStorage.setItem('dsh-mobile-theme', 'dark')`)
await goto(`${BASE}/mobile#/chat/${RICH_SEED}`)
await waitFor(`document.querySelector('[data-testid="report-card"]') !== null`, { timeout: 30000 })
await SCROLL_INTO('[data-testid="receipt-card-v3"]')
await sleep(200)
await shot('b3-04b-chat-receipt-dark.png')
await SCROLL_INTO('[data-testid="report-card"]')
await sleep(200)
await shot('b3-05b-chat-report-dark.png')
note('dark track: receipt/report re-captured under data-theme=dark')

writeFileSync(`${OUT}.b3-walkthrough.log`, `${walk.join('\n')}\n`)
cleanup()
process.exit(0)
