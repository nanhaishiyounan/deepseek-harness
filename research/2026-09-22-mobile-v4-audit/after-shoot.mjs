/**
 * E2 visual-batch after-screenshot driver (research artifact, not product
 * code). Replays and drives the real /mobile flows against the 3080 dev
 * server: login → chats (projection subtitles, Badge/Tag, SearchBar,
 * CapsuleTabs) → welcome screen → a fresh real-API registration turn
 * (ask card → draft card → confirm → receipt) → me tab → dark mode → the PC
 * mobile-preview tab. Saves after-*.png next to this script.
 *
 * Usage: node research/2026-09-22-mobile-v4-audit/after-shoot.mjs
 */
import { spawn } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { setTimeout as sleep } from 'node:timers/promises'

const OUT = new URL('.', import.meta.url).pathname
const PORT = 9336
const BASE = 'http://localhost:3080'
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'

mkdirSync(OUT, { recursive: true })

const chrome = spawn(CHROME, [
  '--headless=new',
  `--remote-debugging-port=${String(PORT)}`,
  '--user-data-dir=/tmp/dsh-v4-after-profile',
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
  await new Promise((resolve) => {
    const timer = setTimeout(resolve, 15000)
    on('Page.loadEventFired', () => { clearTimeout(timer); resolve() })
  })
  await sleep(600)
}

async function waitFor(expression, { timeout = 30000, interval = 600 } = {}) {
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

// --- session setup ------------------------------------------------------
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

// --- 1. login page --------------------------------------------------------
await setMobileViewport()
await goto(`${BASE}/mobile.html`)
await evaluate(`(() => { try { localStorage.clear() } catch { /* not on the app origin yet */ } return true })()`)
await goto(`${BASE}/mobile.html`)
await waitFor(`document.body.innerText.includes('食链通')`)
await shot('after-01-login.png')

// --- 2. demo login → chats (projection subtitles, Badge, Tag, SearchBar) --
await TYPE('input[inputmode="numeric"]', '123456')
await evaluate(`[...document.querySelectorAll('button')].find(b => b.textContent === '登录')?.click()`)
await waitFor(`document.body.innerText.includes('消息') && document.body.innerText.includes('全部')`)
// The projection subtitles stream in over the tail reads; give them a beat.
await sleep(7000)
await shot('after-02-chats-light.png')

// --- 3. empty search state -------------------------------------------------
await TYPE('input[type="search"]', 'zzz无匹配')
await sleep(500)
await shot('after-03-chats-empty.png')
await TYPE('input[type="search"]', '')

// --- 4. new-chat sheet → welcome screen ------------------------------------
// The deployment's roster carries the CLI presets; any row starts a fresh
// session whose empty state renders the centered welcome screen.
await evaluate(`document.querySelector('button[aria-label="新建会话"]')?.click()`)
await waitFor(`document.body.innerText.includes('新建会话')`)
await sleep(400)
await shot('after-04-newchat-sheet.png')
await evaluate(`document.querySelector('.adm-popup li button')?.click()`)
await waitFor(`document.querySelector('[data-testid="welcome-card"]') !== null`, { timeout: 30000 })
await sleep(600)
await shot('after-05-welcome.png')

// --- 5. the audited real-API session replay (ask / draft / receipt) ---------
const SESSION = 'session-b1398077-3501-497e-a3c3-091ea5fcc8b4'
await goto(`${BASE}/mobile.html#/chat/${SESSION}`)
await waitFor(`document.querySelector('[data-testid="receipt-card-v3"]') !== null`, { timeout: 60000 })
await sleep(800)
await evaluate(`document.querySelector('[data-testid="draft-card-v3"]')?.scrollIntoView({ block: 'center' })`)
await sleep(300)
// Open the system fold so the generated number shows in the shot.
await evaluate(`document.querySelector('.adm-collapse-panel-header')?.click()`)
await sleep(400)
await shot('after-06-draft-card.png')
await evaluate(`document.querySelector('[data-testid="ask-choice"]')?.scrollIntoView({ block: 'center' })`)
await sleep(300)
await shot('after-07-ask-choice.png')
await evaluate(`document.querySelector('[data-testid="receipt-card-v3"]')?.scrollIntoView({ block: 'center' })`)
await sleep(300)
await shot('after-08-receipt.png')
await shot('after-08b-chat-full.png', { fullPage: true })

// --- 5b. live real-API question over the MiniMax channel ---------------------
const CHAT_INPUT = 'textarea'
await TYPE(CHAT_INPUT, '用一句话说明这张采购单登记了什么。')
await evaluate(`document.querySelector('button[aria-label="发送"]')?.click()`)
await sleep(2500)
await shot('after-09-running.png')
await waitFor(`(() => {
  const busy = document.body.innerText.includes('正在处理')
  return !busy
})()`, { timeout: 180000 })
await sleep(600)
await evaluate(`window.scrollTo !== undefined ? true : true`)
await evaluate(`(() => { const flow = document.querySelector('[class*="flow_"]'); if (flow !== null) flow.scrollTop = flow.scrollHeight; return true })()`)
await sleep(400)
await shot('after-09b-answered.png')

// --- 6. me tab ---------------------------------------------------------------
await goto(`${BASE}/mobile.html#/me`)
await waitFor(`document.body.innerText.includes('深色模式')`)
await sleep(1500)
await shot('after-10-me.png')

// --- 7. dark mode (me, chats, chat) ------------------------------------------
await evaluate(`[...document.querySelectorAll('[role="switch"]')].find(s => s.getAttribute('aria-label') === '深色模式')?.click()`)
await sleep(400)
await shot('after-11-me-dark.png')
await goto(`${BASE}/mobile.html#/chats`)
await sleep(1500)
await shot('after-12-chats-dark.png')
await evaluate(`history.back()`)
await sleep(400)
await goto(await evaluate(`location.hash.startsWith('#/chat/') ? location.href : '${BASE}/mobile.html#/chats'`))
await waitFor(`document.body.innerText.includes('消息')`)
await sleep(1200)
await shot('after-13-chat-dark.png')

// --- 8. PC mobile-preview tab (desktop viewport) ------------------------------
await setDesktopViewport()
await goto(`${BASE}/`)
await waitFor(`[...document.querySelectorAll('[role="tab"]')].some(t => (t.textContent ?? '').includes('移动端预览'))`)
await evaluate(`[...document.querySelectorAll('[role="tab"]')].find(t => (t.textContent ?? '').includes('移动端预览'))?.click()`)
await waitFor(`document.querySelector('iframe') !== null`)
await sleep(1200)
await shot('after-14-pc-preview.png')

console.log('done')
chrome.kill()
process.exit(0)
