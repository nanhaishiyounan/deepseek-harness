/**
 * E1 audit screenshot driver (research artifact, not product code).
 * Drives a dedicated headless Chrome over CDP, replays the real /mobile flows
 * (local demo login → chats → the real-API chat session recorded by the
 * MCP pass → dark mode → PC mobile-preview tab), and saves PNGs next to this
 * script. Every frame is a real render of the running 3080 dev server.
 *
 * Usage: node research/2026-09-22-mobile-v4-audit/shoot.mjs
 */
import { spawn } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { setTimeout as sleep } from 'node:timers/promises'

const OUT = new URL('.', import.meta.url).pathname
const PORT = 9334
const BASE = 'http://localhost:3080'
const SESSION = 'session-b1398077-3501-497e-a3c3-091ea5fcc8b4'
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'

mkdirSync(OUT, { recursive: true })

const chrome = spawn(CHROME, [
  '--headless=new',
  `--remote-debugging-port=${String(PORT)}`,
  '--user-data-dir=/tmp/dsh-audit-profile',
  '--no-first-run',
  '--disable-gpu',
  '--window-size=420,900',
  'about:blank',
], { stdio: 'ignore' })

const cleanup = () => { try { chrome.kill() } catch { /* already gone */ } }
process.on('exit', cleanup)
process.on('SIGINT', () => { cleanup(); process.exit(130) })

// --- minimal CDP client -------------------------------------------------
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

// --- helpers ------------------------------------------------------------
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
  // Wait for the load event, then let React settle one paint.
  await new Promise((resolve) => {
    const timer = setTimeout(resolve, 15000)
    on('Page.loadEventFired', () => { clearTimeout(timer); resolve() })
  })
  await sleep(600)
}

async function waitFor(expression, { timeout = 30000, interval = 500 } = {}) {
  const deadline = Date.now() + timeout
  for (;;) {
    const value = await evaluate(expression)
    if (value === true) return
    if (Date.now() > deadline) throw new Error(`timeout waiting for: ${expression}`)
    await sleep(interval)
  }
}

/** Type into a React controlled input via the native setter + input event. */
const TYPE = (selector, value) => evaluate(`(() => {
  const el = document.querySelector(${JSON.stringify(selector)})
  if (el === null) return 'missing'
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype
  Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, ${JSON.stringify(value)})
  el.dispatchEvent(new Event('input', { bubbles: true }))
  return 'ok'
})()`)

const CLICK = (selector) => evaluate(`(() => {
  const el = document.querySelector(${JSON.stringify(selector)})
  if (el === null) return 'missing'
  el.click()
  return 'ok'
})()`)

const SCROLL_INTO = (selector) => evaluate(`(() => {
  const el = document.querySelector(${JSON.stringify(selector)})
  if (el === null) return 'missing'
  el.scrollIntoView({ block: 'center' })
  return 'ok'
})()`)

// --- session setup ------------------------------------------------------
// Chrome needs a moment to open the debugging port; poll until it answers.
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

async function setMobileViewport() {
  await send('Emulation.setDeviceMetricsOverride', {
    width: 375, height: 812, deviceScaleFactor: 2, mobile: true,
  })
}

async function setDesktopViewport() {
  await send('Emulation.setDeviceMetricsOverride', {
    width: 1280, height: 832, deviceScaleFactor: 1, mobile: false,
  })
}

// --- 1. login page (pre-identity) ---------------------------------------
await setMobileViewport()
await goto(`${BASE}/mobile`)
// The audit profile is fresh, but clear any residual identity so the login
// page renders; the page keeps its own localStorage between runs otherwise.
await evaluate(`localStorage.clear()`)
await goto(`${BASE}/mobile`)
await waitFor(`document.body.innerText.includes('食链通')`)
await shot('01-login.png')

// --- 2. log in with the demo handshake ----------------------------------
await TYPE('input[inputmode="numeric"]', '123456')
await evaluate(`[...document.querySelectorAll('button')].find(b => b.textContent === '登录')?.click()`)
await waitFor(`document.body.innerText.includes('消息') && document.body.innerText.includes('全部')`)
await sleep(400)
await shot('02-chats-light.png')

// --- 3. empty filter state (chips + empty notice) ------------------------
await TYPE('input[type="search"]', 'zzz无匹配')
await sleep(400)
await shot('03-chats-empty-filter.png')
await TYPE('input[type="search"]', '')

// --- 4. new-chat sheet ----------------------------------------------------
await evaluate(`document.querySelector('button[aria-label="新建会话"]')?.click()`)
await waitFor(`document.body.innerText.includes('最近') || document.body.innerText.includes('AI 同事')`)
await sleep(400)
await shot('04-newchat-sheet.png')
await evaluate(`document.querySelector('button[aria-label="关闭"]')?.click()`)

// --- 5. the real-API chat session (full history replay) ------------------
await goto(`${BASE}/mobile#/chat/${SESSION}`)
await waitFor(`document.body.innerText.includes('采购单')`)
await sleep(600)
await shot('05-chat-top-light.png')
await SCROLL_INTO('[aria-label="落库回执卡"], [role="region"]')
await sleep(300)
await shot('06-chat-receipt-light.png')
await shot('07-chat-full-light.png', { fullPage: true })

// --- 6. live running state (real prompt through the MiniMax API) ----------
const CHAT_INPUT = 'textarea'
await TYPE(CHAT_INPUT, '这张采购单的合计金额是多少？')
await evaluate(`document.querySelector('button[aria-label="发送"]')?.click()`)
await sleep(2500)
await shot('08-chat-running.png')
await waitFor(`(() => {
  const busy = document.body.innerText.includes('正在处理')
  const answered = document.body.innerText.includes('4,500') || document.body.innerText.includes('4500')
  return !busy && answered
})()`, { timeout: 120000 })
await sleep(600)
await shot('09-chat-answered-light.png')

// --- 7. dark mode ---------------------------------------------------------
await goto(`${BASE}/mobile#/me`)
await waitFor(`document.body.innerText.includes('深色模式')`)
await shot('10-me-light.png')
await evaluate(`[...document.querySelectorAll('[role="switch"]')].find(s => s.getAttribute('aria-label') === '深色模式')?.click()`)
await sleep(400)
await shot('11-me-dark.png')
await goto(`${BASE}/mobile#/chats`)
await sleep(800)
await shot('12-chats-dark.png')
await goto(`${BASE}/mobile#/chat/${SESSION}`)
await waitFor(`document.body.innerText.includes('采购单')`)
await sleep(600)
await shot('13-chat-dark.png')

// --- 8. PC mobile-preview tab (desktop viewport) ---------------------------
await setDesktopViewport()
await goto(`${BASE}/`)
await waitFor(`[...document.querySelectorAll('[role="tab"]')].some(t => (t.textContent ?? '').includes('移动端预览'))`)
await evaluate(`[...document.querySelectorAll('[role="tab"]')].find(t => (t.textContent ?? '').includes('移动端预览'))?.click()`)
await waitFor(`document.querySelector('iframe') !== null`)
await sleep(1200)
await shot('14-pc-mobile-preview.png')

console.log('done')
chrome.kill()
process.exit(0)
