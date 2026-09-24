/**
 * B1 screenshot driver (research artifact, not product code).
 *
 * Boots nothing itself: it targets the already-running `dsh web` dev server
 * (:3080, DSH_HOME=examples/kb-agent/.dsh) and drives a dedicated headless
 * Chrome over CDP through the v6 shell: demo login → the four tabs
 * (消息/同事/工作台/我的) in both tracks at 390×844 → the all-chats
 * full-screen layer → the 430px desktop phone-shell form at 1280×832.
 * Also probes the computed tab-bar metrics (height/active color/desk color)
 * as machine-readable evidence alongside the PNGs.
 *
 * Usage: node research/2026-09-23-mobile-v6-uidesign/.shoot.mjs
 */
import { spawn } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { setTimeout as sleep } from 'node:timers/promises'

const OUT = new URL('.', import.meta.url).pathname
const BASE = 'http://127.0.0.1:3080'
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'

/** Collected walkthrough evidence lines (mirrored into .walkthrough.log). */
const walk = []
const note = (line) => {
  walk.push(line)
  console.log(`[WALK] ${line}`)
}

mkdirSync(OUT, { recursive: true })

// --- 1. headless chrome over CDP -------------------------------------------
const PORT = 9337
const chrome = spawn(CHROME, [
  '--headless=new',
  `--remote-debugging-port=${String(PORT)}`,
  '--user-data-dir=/tmp/dsh-v6-b1-shoot-profile',
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
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true })
}

async function setDesktopViewport() {
  await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 832, deviceScaleFactor: 1, mobile: false })
}

const BODY_HAS = (text) => `document.body.innerText.includes(${JSON.stringify(text)})`

/** Login through the demo card and land the home tab under the given theme. */
async function boot(theme) {
  await goto(`${BASE}/mobile.html`)
  await evaluate(`localStorage.clear()`)
  await evaluate(`localStorage.setItem('dsh-mobile-theme', ${JSON.stringify(theme)})`)
  await evaluate(`localStorage.setItem('dsh-mobile-runmode', 'demo')`)
  // A hash-only navigation would keep the mounted app (and its identity) —
  // blank first so the next goto is a full reload under the new storage.
  await send('Page.navigate', { url: 'about:blank' })
  await sleep(300)
  await goto(`${BASE}/mobile.html#/login`)
  await waitFor(BODY_HAS('食链通'))
  await TYPE('input[inputmode="numeric"]', '123456')
  await CLICK_TEXT('登录')
  await waitFor(BODY_HAS('今日台账'))
}

/** One tab capture: hash, marker wait, shot. */
async function captureTab(hash, marker, name) {
  await goto(`${BASE}/mobile.html${hash}`)
  await waitFor(marker)
  await sleep(400)
  await shot(name)
  note(`${name}: ${hash} under ${await evaluate("document.querySelector('.dshm-root')?.dataset.theme ?? 'light'")} track`)
}

// --- 2. light track: the four tabs ------------------------------------------
await setMobileViewport()
await boot('light')
await captureTab('#/', BODY_HAS('今日台账'), 'b1-01-home-light.png')
await captureTab('#/agents', `document.querySelector('[aria-label="AI 同事目录"]') !== null`, 'b1-02-agents-light.png')
await captureTab('#/work', BODY_HAS('待处理'), 'b1-03-work-light.png')
await captureTab('#/me', BODY_HAS('本月登记'), 'b1-04-me-light.png')

// --- 3. dark track: the same four tabs ---------------------------------------
await boot('dark')
await captureTab('#/', BODY_HAS('今日台账'), 'b1-05-home-dark.png')
await captureTab('#/agents', `document.querySelector('[aria-label="AI 同事目录"]') !== null`, 'b1-06-agents-dark.png')
await captureTab('#/work', BODY_HAS('待处理'), 'b1-07-work-dark.png')
await captureTab('#/me', BODY_HAS('本月登记'), 'b1-08-me-dark.png')

// --- 4. the all-chats full-screen layer (light) ------------------------------
await boot('light')
await goto(`${BASE}/mobile.html#/chats`)
await waitFor(`document.querySelector('[aria-label="返回"]') !== null`)
await waitFor(`document.querySelector('nav[aria-label="底部导航"]') === null`)
await waitFor(BODY_HAS('消息'))
await shot('b1-09-chats-layer-light.png')
note('b1-09: #/chats renders as the full-screen layer — PageNav 返回头 present, tab bar absent')

// --- 5. computed-metric probe (the plan's 核对点) -----------------------------
const metrics = await evaluate(`(() => {
  const nav = document.querySelector('nav[aria-label="底部导航"]')
  const bar = nav?.querySelector('.adm-tab-bar')
  const active = nav?.querySelector('.adm-tab-bar-item-active .adm-tab-bar-item-title')
  const root = document.querySelector('.dshm-root')
  const rs = getComputedStyle(root)
  return {
    tabbarHeight: bar === null || bar === undefined ? null : getComputedStyle(bar).height,
    tabbarBg: nav === null || nav === undefined ? null : getComputedStyle(nav).backgroundColor,
    activeColor: active === null || active === undefined ? null : getComputedStyle(active).color,
    activeFont: active === null || active === undefined ? null : getComputedStyle(active).fontSize + ' / ' + getComputedStyle(active).fontWeight,
    rootBg: rs.backgroundColor,
    cardVar: rs.getPropertyValue('--dshm-card').trim(),
    brandVar: rs.getPropertyValue('--dshm-primary').trim(),
    deskBg: getComputedStyle(document.body).backgroundColor,
  }
})()`)
note(`metrics: ${JSON.stringify(metrics)}`)

// --- 6. the 430px desktop phone-shell form (light) ----------------------------
await setDesktopViewport()
await goto(`${BASE}/mobile.html#/`)
await waitFor(BODY_HAS('今日台账'))
await sleep(500)
await shot('b1-10-desktop-shell-light.png')
const shellBox = await evaluate(`(() => {
  const rect = document.querySelector('.dshm-root').getBoundingClientRect()
  const rs = getComputedStyle(document.querySelector('.dshm-root'))
  return { width: rect.width, radius: rs.borderRadius, centered: Math.abs((rect.left + rect.right) / 2 - innerWidth / 2) < 1 }
})()`)
note(`b1-10: desktop shell ${JSON.stringify(shellBox)}`)

writeFileSync(`${OUT}.walkthrough.log`, `${walk.join('\n')}\n`)
console.log('done')
cleanup()
process.exit(0)
