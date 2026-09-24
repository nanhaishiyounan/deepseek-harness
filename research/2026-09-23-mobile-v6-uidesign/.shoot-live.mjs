/**
 * Live-service capture for the v6 preview hand-off (research artifact, not
 * product code). Targets the already-running `dsh web` server on :3080 and
 * produces the two `live-*.png` shots plus machine-readable probes:
 *
 *   live-01-mobile-home.png   390×844, demo login → 今日台账 home tab
 *   live-02-pc-preview.png    1280×832 phone-shell form (desktop-end
 *                             `mobile-preview` conversation view when
 *                             reachable, else the /mobile.html shell form)
 *   live-03-mobile-agents.png 390×844, #/agents roster (non-empty evidence)
 *
 * Usage: node research/2026-09-23-mobile-v6-uidesign/.shoot-live.mjs
 */
import { spawn } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import { setTimeout as sleep } from 'node:timers/promises'

const OUT = new URL('.', import.meta.url).pathname
const BASE = 'http://127.0.0.1:3080'
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const PORT = 9351

const chrome = spawn(CHROME, [
  '--headless=new',
  `--remote-debugging-port=${String(PORT)}`,
  '--user-data-dir=/tmp/dsh-v6-live-profile',
  '--no-first-run',
  '--disable-gpu',
  '--window-size=420,900',
  'about:blank',
], { stdio: 'ignore' })
const cleanup = () => { try { chrome.kill() } catch { /* already gone */ } }
process.on('exit', cleanup)
process.on('SIGINT', () => { cleanup(); process.exit(130) })

const evidence = []
const note = (line) => {
  evidence.push(line)
  console.log(`[LIVE] ${line}`)
}

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
    const timer = setTimeout(resolve, 15000)
    on('Page.loadEventFired', () => { clearTimeout(timer); resolve() })
  })
  await sleep(700)
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

/**
 * Fails the capture when a mandatory condition never turns true. Unlike the
 * best-effort `waitFor` probes (desktop preview has a fallback), these guard
 * shots that must not be written to disk half-rendered.
 *
 * @param {string} expression evaluated until `true` or timeout
 * @param {string} stage human label naming the capture step that failed
 * @param {{ timeout?: number, interval?: number }} [options]
 */
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
  await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 832, deviceScaleFactor: 1, mobile: false })
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

// --- 1. mobile home (light, demo login) --------------------------------------
await setMobileViewport()
await goto(`${BASE}/mobile.html`)
await evaluate('localStorage.clear()')
await evaluate(`localStorage.setItem('dsh-mobile-theme', 'light')`)
await evaluate(`localStorage.setItem('dsh-mobile-runmode', 'demo')`)
// Blank hop isolates storage state so the next goto is a full reload under the new storage; removing it distorts the screenshots.
await send('Page.navigate', { url: 'about:blank' })
await sleep(300)
await goto(`${BASE}/mobile.html#/login`)
await waitForStage(BODY_HAS('食链通'), 'login screen')
await TYPE('input[inputmode="numeric"]', '123456')
await evaluate(`[...document.querySelectorAll('button')].find(b => (b.textContent ?? '').includes('登录'))?.click()`)
await waitForStage(BODY_HAS('今日台账'), 'mobile home after login')
await sleep(500)
await shot('live-01-mobile-home.png')

// --- 2. probes: brand blue + four tabs ----------------------------------------
const homeMetrics = await evaluate(`(() => {
  const nav = document.querySelector('nav[aria-label="底部导航"]')
  const items = nav ? [...nav.querySelectorAll('.adm-tab-bar-item')] : []
  const active = nav?.querySelector('.adm-tab-bar-item-active .adm-tab-bar-item-title')
  const root = document.querySelector('.dshm-root')
  const rs = getComputedStyle(root)
  return {
    brandPrimary: rs.getPropertyValue('--dshm-primary').trim(),
    rootBg: rs.backgroundColor,
    tabLabels: items.map((el) => (el.textContent ?? '').trim()),
    activeColor: active === null || active === undefined ? null : getComputedStyle(active).color,
    homeMarker: document.body.innerText.includes('今日台账'),
  }
})()`)
note(`home metrics: ${JSON.stringify(homeMetrics)}`)

// --- 3. agents roster (presets effect) ----------------------------------------
await goto(`${BASE}/mobile.html#/agents`)
await waitForStage(`document.querySelector('[aria-label="AI 同事目录"]') !== null`, 'agents roster', { timeout: 15000 })
await sleep(400)
const roster = await evaluate(`(() => {
  const rows = [...document.querySelectorAll('button[aria-label^="找 "]')]
  return {
    rowCount: rows.length,
    rowLabels: rows.map((b) => (b.getAttribute('aria-label') ?? '').replace(/^找 /, '')),
  }
})()`)
note(`roster: ${JSON.stringify(roster)}`)
await shot('live-03-mobile-agents.png')

// --- 4. PC phone-shell preview -------------------------------------------------
await setDesktopViewport()
// Prefer the desktop workbench's mobile-preview conversation view.
await goto(`${BASE}/`)
await sleep(1500)
let previewMode = 'desktop-view'
const desktopReached = await waitFor(`document.body.innerText.trim().length > 0`, { timeout: 8000 })
if (desktopReached) {
  const clicked = await evaluate(`(() => {
    const candidates = [...document.querySelectorAll('button, [role="tab"], [role="menuitem"], a, li')]
      .filter((el) => /移动预览|Mobile preview/i.test((el.textContent ?? '').trim()))
    const el = candidates[0]
    if (el === undefined) return false
    el.click()
    return true
  })()`)
  if (clicked) {
    const shellUp = await waitFor(
      `document.querySelector('iframe[src*="/mobile"]') !== null || document.querySelector('.dshm-root') !== null`,
      { timeout: 10000 },
    )
    if (shellUp) {
      previewMode = 'desktop-conversation-view'
      await sleep(1200)
      await shot('live-02-pc-preview.png')
    }
  }
}
if (previewMode !== 'desktop-conversation-view') {
  // Fallback: the /mobile.html phone-shell form in a desktop viewport — the
  // same shell surface the desktop view embeds.
  await goto(`${BASE}/mobile.html#/`)
  await waitForStage(BODY_HAS('今日台账'), 'pc preview fallback home', { timeout: 15000 })
  await sleep(500)
  await shot('live-02-pc-preview.png')
  previewMode = 'mobile-html-desktop-shell'
}
note(`pc preview mode: ${previewMode}`)

writeFileSync(`${OUT}.live-evidence.json`, `${JSON.stringify({ capturedAt: new Date().toISOString(), base: BASE, evidence }, null, 2)}\n`)
cleanup()
process.exit(0)
