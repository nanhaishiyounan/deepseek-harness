#!/usr/bin/env node
/**
 * D1/O1 closure verification (research artifact, not product code): after the
 * `--height` fix, asserts the chat page's `.adm-nav-bar` computes 52px tall,
 * carries the card face, and rims with `--dshm-nav-line` (dark track deeper).
 * Screenshots: vfy-ac-13-navheight.png (light), vfy-ac-14-nav-dark.png (dark).
 * Usage: node research/2026-09-23-mobile-v5-audit-closure/.vfy-ac-nav.mjs
 */
import { spawn } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { setTimeout as sleep } from 'node:timers/promises'

const OUT = new URL('.', import.meta.url).pathname
const PORT = 9342
const BASE = 'http://localhost:3080'
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'

mkdirSync(OUT, { recursive: true })

const chrome = spawn(CHROME, [
  '--headless=new',
  `--remote-debugging-port=${String(PORT)}`,
  '--user-data-dir=/tmp/dsh-vfy-ac-nav-profile',
  '--no-first-run',
  '--disable-gpu',
  '--window-size=430,900',
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

const TYPE = (selector, value) => evaluate(`(() => {
  const el = document.querySelector(${JSON.stringify(selector)})
  if (el === null) return 'missing'
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype
  Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, ${JSON.stringify(value)})
  el.dispatchEvent(new Event('input', { bubbles: true }))
  return 'ok'
})()`)

const results = []
const record = (id, ok, detail) => {
  results.push({ id, ok: Boolean(ok), detail })
  console.log(`${ok ? 'PASS' : 'FAIL'} | ${id} | ${detail}`)
}

const NAV_PROBE = `(() => {
  const nav = document.querySelector('.adm-nav-bar')
  if (nav === null) return { present: false }
  const cs = getComputedStyle(nav)
  const root = document.querySelector('.dshm-root')
  return {
    present: true,
    height: cs.height,
    backgroundColor: cs.backgroundColor,
    borderBottomColor: cs.borderBottomColor,
    borderBottomWidth: cs.borderBottomWidth,
    theme: root === null ? null : root.getAttribute('data-theme'),
    navLineVar: nav.getBoundingClientRect().height,
  }
})()`

let tabs
for (let attempt = 0; ; attempt++) {
  try {
    tabs = await (await fetch(`http://127.0.0.1:${String(PORT)}/json/list`)).json()
    break
  } catch (cause) {
    if (attempt > 40) throw cause
    await sleep(500)
  }
}
const page = tabs.find((tab) => tab.type === 'page')
await connect(page.webSocketDebuggerUrl)
await send('Page.enable')
await send('Runtime.enable')
await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 3, mobile: true })

// --- fresh login -------------------------------------------------------------
await goto(`${BASE}/mobile.html`)
await evaluate(`(() => { try { localStorage.clear() } catch { /* not on the app origin yet */ } return true })()`)
await goto(`${BASE}/mobile.html`)
await waitFor(`document.body.innerText.includes('食链通')`)
await TYPE('input[inputmode="numeric"]', '123456')
await evaluate(`[...document.querySelectorAll('button')].find(b => b.textContent === '登录')?.click()`)
await waitFor(`document.querySelector('.adm-tab-bar') !== null || document.body.innerText.includes('今日台账')`)
await sleep(1500)

// --- N1 (vfy-ac-13): chat page NavBar computes 52px, card face, light rim ----
let chatHash = ''
await goto(`${BASE}/mobile.html#/chats`)
await waitFor(`document.body.innerText.includes('消息') || document.querySelectorAll('a[href*="#/chat/"]').length > 0`)
await sleep(1500)
const entered = await evaluate(`(() => {
  const link = document.querySelector('a[href*="#/chat/"]')
  if (link !== null) { link.click(); return 'link' }
  const row = document.querySelector('[class*="sessionRow"]') ?? document.querySelector('[class*="chatRow"]')
  if (row !== null) { row.click(); return 'sessionRow' }
  return 'none'
})()`)
if (entered === 'none') throw new Error('could not enter a chat session')
await waitFor(`location.hash.startsWith('#/chat/')`, { timeout: 20000 })
await sleep(2500)
chatHash = await evaluate('location.hash')
const n1 = await evaluate(NAV_PROBE)
record('N1-height-52px', n1.present === true && n1.height === '52px', `getComputedStyle(.adm-nav-bar).height=${n1.height}`)
record('N1-card-face', n1.backgroundColor === 'rgb(255, 255, 255)', `backgroundColor=${n1.backgroundColor} (expect frost #ffffff)`)
record('N1-light-rim', n1.borderBottomColor === 'rgb(213, 224, 221)', `borderBottomColor=${n1.borderBottomColor} (expect --dshm-border #d5e0dd), width=${n1.borderBottomWidth}`)
await shot('vfy-ac-13-navheight.png')

// --- N2 (vfy-ac-14): dark track — rim deeper than the standard border --------
await goto(`${BASE}/mobile.html#/me`)
await waitFor(`document.body.innerText.includes('深色模式')`)
await evaluate(`[...document.querySelectorAll('[role="switch"]')].find(s => s.getAttribute('aria-label') === '深色模式')?.click()`)
await sleep(600)
await goto(`${BASE}/mobile.html${chatHash}`)
await waitFor(`document.querySelector('.adm-nav-bar') !== null`, { timeout: 20000 })
await sleep(2000)
const n2 = await evaluate(NAV_PROBE)
record('N2-dark-theme', n2.theme === 'dark', `data-theme=${n2.theme}`)
record('N2-dark-rim-deeper', n2.borderBottomColor === 'rgb(34, 46, 43)', `borderBottomColor=${n2.borderBottomColor} (expect --dshm-nav-line #222e2b, deeper than --dshm-border #2a3835)`)
record('N2-dark-card-face', n2.backgroundColor === 'rgb(23, 34, 32)', `backgroundColor=${n2.backgroundColor} (expect dark frost #172220)`)
record('N2-height-52px', n2.height === '52px', `dark track height=${n2.height}`)
await shot('vfy-ac-14-nav-dark.png')

writeFileSync(`${OUT}.vfy-ac-nav-results.json`, JSON.stringify({ base: BASE, chatHash, results }, null, 2))
console.log('done')
chrome.kill()
process.exit(results.every(r => r.ok) ? 0 : 1)
