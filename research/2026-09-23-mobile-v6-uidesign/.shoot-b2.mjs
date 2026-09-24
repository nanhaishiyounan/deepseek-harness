/**
 * B2 screenshot driver (research artifact, not product code).
 *
 * Targets the already-running `dsh web` dev server (:3080,
 * DSH_HOME=examples/kb-agent/.dsh) with a dedicated headless Chrome over CDP
 * at the 390×844 viewport, walks the demo login, and captures the v6 page
 * set (home/chats/agents/work/me + tasks/files/login spot checks) in both
 * theme tracks. The recent-chats rows ride the store's real sessions.
 *
 * Usage: node research/2026-09-23-mobile-v6-uidesign/.shoot-b2.mjs
 */
import { spawn } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { setTimeout as sleep } from 'node:timers/promises'

const OUT = new URL('.', import.meta.url).pathname
const BASE = 'http://127.0.0.1:3080'
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const PORT = 9336

mkdirSync(OUT, { recursive: true })
const walk = []
const note = (line) => {
  walk.push(line)
  console.log(`[B2] ${line}`)
}

// --- headless chrome over CDP -------------------------------------------------
const chrome = spawn(CHROME, [
  '--headless=new',
  `--remote-debugging-port=${String(PORT)}`,
  '--user-data-dir=/tmp/dsh-v6-b2-profile',
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

async function waitFor(expression, { timeout = 30000, interval = 500 } = {}) {
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

/** Capture one route in one theme track (the theme attr rides the reload). */
async function captureAt(hash, name, marker, { fullPage = true } = {}) {
  await goto(`${BASE}/mobile#${hash}`)
  await waitFor(marker)
  await sleep(400)
  await shot(name, { fullPage })
}

// --- login -------------------------------------------------------------------
await goto(`${BASE}/mobile`)
await evaluate(`localStorage.clear()`)
await goto(`${BASE}/mobile#/login`)
await waitFor(BODY_HAS('食链通'))
await shot('b2-06-login-light.png')
note('b2-06: #/login keeps the brand card on the v6 tokens')

await TYPE('input[inputmode="numeric"]', '123456')
await CLICK_TEXT('登录')
await waitFor(BODY_HAS('今日台账'))
await evaluate(`localStorage.setItem('dsh-mobile-runmode', 'demo')`)

// --- light track ---------------------------------------------------------------
await captureAt('/', 'b2-01-home-light.png', BODY_HAS('最近对话'))
note('b2-01: home — gradient hero, search entry, ledger chips, quick chips, colleague rail, recent conv rows')

await captureAt('/chats', 'b2-02-chats-light.png', BODY_HAS('全部'))
note('b2-02: #/chats — the all-chats full-screen layer with filter capsules')

await captureAt('/agents', 'b2-03-agents-light.png', BODY_HAS('AI 同事'))
note('b2-03: #/agents — capability bands, skill pills, presence chips')

await captureAt('/work', 'b2-04-work-light.png', BODY_HAS('待处理'))
note('b2-04: #/work — the tool grid over the four-status ledger')

await captureAt('/me', 'b2-05-me-light.png', BODY_HAS('深色模式'))
note('b2-05: #/me — me-card, set-group cards, 46×27 switches, dashed note')

await captureAt('/tasks', 'b2-06-tasks-light.png', BODY_HAS('我的任务'))
await captureAt('/files', 'b2-06-files-light.png', BODY_HAS('文件'))
note('b2-06: tasks/files follow the v6 tokens')

// --- dark track -----------------------------------------------------------------
await evaluate(`localStorage.setItem('dsh-mobile-theme', 'dark')`)
await captureAt('/', 'b2-01b-home-dark.png', BODY_HAS('最近对话'))
await captureAt('/chats', 'b2-02b-chats-dark.png', BODY_HAS('全部'))
await captureAt('/agents', 'b2-03b-agents-dark.png', BODY_HAS('AI 同事'))
await captureAt('/work', 'b2-04b-work-dark.png', BODY_HAS('待处理'))
await captureAt('/me', 'b2-05b-me-dark.png', BODY_HAS('深色模式'))
note('dark track: the same five pages re-captured under data-theme=dark')

writeFileSync(`${OUT}.b2-walkthrough.log`, `${walk.join('\n')}\n`)
cleanup()
process.exit(0)
