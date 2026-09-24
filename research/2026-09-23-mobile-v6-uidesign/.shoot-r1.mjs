/**
 * R1 fix-iteration screenshot driver (research artifact, not product code).
 *
 * Targets the already-running `dsh web` dev server (:3080,
 * DSH_HOME=examples/kb-agent/.dsh) with a dedicated headless Chrome over CDP
 * at 390×844. Captures the R1 verification evidence:
 *   - r1-01-chat-receipt-light.png: the seeded receipt card re-shot in the
 *     light track (the b3-04 file had carried the dark surface).
 *   - r1-02-typing-cleared.png: after a demo-mode prompt the turn settles and
 *     the breathing typing indicator retires (the raw-event-count fix).
 *
 * Usage: node research/2026-09-23-mobile-v6-uidesign/.shoot-r1.mjs
 */
import { spawn } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { setTimeout as sleep } from 'node:timers/promises'

const OUT = new URL('.', import.meta.url).pathname
const BASE = 'http://127.0.0.1:3080'
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const PORT = 9341
/** The v5 walkthrough's injected report session (already in the store). */
const RICH_SEED = 'session-v6-b3-rich'

mkdirSync(OUT, { recursive: true })
const walk = []
const note = (line) => {
  walk.push(line)
  console.log(`[R1] ${line}`)
}

const chrome = spawn(CHROME, [
  '--headless=new',
  `--remote-debugging-port=${String(PORT)}`,
  '--user-data-dir=/tmp/dsh-v6-r1-profile',
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
    } else if (msg.method !== undefined) {
      for (const handler of listeners.get(msg.method) ?? []) handler(msg.params)
    }
  })
}

async function evaluate(expression) {
  const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
  return result.result.value
}

async function goto(url) {
  // Hash-only moves stay same-document (no load event); drive the location
  // directly and settle on the URL taking effect.
  await send('Page.navigate', { url })
  await new Promise((resolve) => {
    const done = () => { listeners.set('Page.loadEventFired', []); resolve() }
    listeners.set('Page.loadEventFired', [done])
    setTimeout(resolve, 1500)
  })
  for (let i = 0; i < 40; i++) {
    const current = await evaluate('location.href')
    if (current === url || current.startsWith(url)) return
    await sleep(300)
  }
}

const BODY_HAS = (text) => `document.body && document.body.innerText.includes(${JSON.stringify(text)})`

async function waitFor(expression, { timeout = 30_000 } = {}) {
  const deadline = Date.now() + timeout
  for (;;) {
    if (await evaluate(expression)) return true
    if (Date.now() > deadline) throw new Error(`waitFor timeout: ${expression}`)
    await sleep(300)
  }
}

async function shot(name) {
  const image = await send('Page.captureScreenshot', { format: 'png' })
  writeFileSync(`${OUT}${name}`, Buffer.from(image.data, 'base64'))
  note(`shot ${name}`)
}

async function type(selector, text) {
  await send('Input.insertText', { text })
}

// Boot the debugger connection.
let tabs = []
for (let attempt = 0; attempt < 40; attempt++) {
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

// --- login (demo run mode + light theme pinned) -------------------------------------
await goto(`${BASE}/mobile`)
await evaluate(`localStorage.setItem('dsh-mobile-runmode', 'demo'); localStorage.setItem('dsh-mobile-theme', 'light')`)
if (!(await evaluate(BODY_HAS('今日台账')))) {
  await goto(`${BASE}/mobile#/login`)
  await waitFor(BODY_HAS('食链通'))
  await send('Runtime.evaluate', { expression: `(() => { const el = document.querySelector('input[inputmode="numeric"]'); el.focus(); return true; })()` })
  await type('input[inputmode="numeric"]', '123456')
  await evaluate(`[...document.querySelectorAll('button')].find(b => (b.textContent ?? '').trim() === '登录')?.click()`)
  await waitFor(BODY_HAS('今日台账'))
}
// Force a light re-render whatever the stored choice was.
await evaluate(`localStorage.setItem('dsh-mobile-theme', 'light')`)
await goto(`${BASE}/mobile#/me`)
await waitFor(BODY_HAS('我的'))
await evaluate(`(() => { const sw = document.querySelector('.adm-switch'); if (sw !== null && sw.classList.contains('adm-switch-checked')) sw.click(); return true; })()`)
await sleep(400)

// --- r1-01: the receipt card in the light track (b3-04 re-shot) ---------------------
await goto(`${BASE}/mobile#/chat/${RICH_SEED}`)
await waitFor(`document.querySelector('[data-testid="receipt-card-v3"]') !== null`, { timeout: 30_000 })
await evaluate(`document.querySelector('[data-testid="receipt-card-v3"]')?.scrollIntoView({ block: 'center' })`)
await sleep(300)
await shot('r1-01-chat-receipt-light.png')
note('r1-01: the receipt card re-shot in the light track')

// --- r1-02: the typing indicator retires once the turn settles ----------------------
await goto(`${BASE}/mobile#/agents`)
await waitFor(BODY_HAS('智能填表助手'))
await evaluate(`[...document.querySelectorAll('button')].find(b => (b.getAttribute('aria-label') ?? '').startsWith('找 '))?.click()`)
await waitFor(`location.hash.startsWith('#/chat/')`, { timeout: 20_000 })
await waitFor(`document.querySelector('textarea') !== null`, { timeout: 20_000 })
await send('Runtime.evaluate', { expression: `(() => { document.querySelector('textarea').focus(); return true; })()` })
await type('textarea', '帮我看下这个月的采购情况')
await evaluate(`[...document.querySelectorAll('button')].find(b => b.getAttribute('aria-label') === '发送')?.click()`)
await sleep(2800)
const breathing = await evaluate(`document.querySelector('[aria-label="正在处理"]') !== null`)
note(`r1-02: breathing window observed=${String(breathing)}`)
// The demo turn settles; both the breathing bubble and the running row retire
// (the fold<raw fix clears the indicator the moment raw events arrive).
await waitFor(`document.querySelector('[aria-label="正在处理"]') === null`, { timeout: 60_000 })
await waitFor(`!document.body.innerText.includes('正在处理')`, { timeout: 90_000 })
await sleep(600)
await shot('r1-02-typing-cleared.png')
note('r1-02: the turn settled — no breathing indicator or running row remains')

writeFileSync(`${OUT}.r1-walkthrough.log`, `${walk.join('\n')}\n`)
cleanup()
process.exit(0)
