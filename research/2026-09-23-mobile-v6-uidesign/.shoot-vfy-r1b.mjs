/**
 * R1-fix verification part B: dark-track contrast, home offline alert, and the
 * regression spot checks (work tabs, tab nav, theme persistence, 430px shell,
 * chats-layer back). Runs after part A proved 01–04-light.
 *
 * Usage: node research/2026-09-23-mobile-v6-uidesign/.shoot-vfy-r1b.mjs
 */
import { spawn } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { setTimeout as sleep } from 'node:timers/promises'

const OUT = new URL('.', import.meta.url).pathname
const BASE = 'http://127.0.0.1:3080'
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const PORT = 9349

mkdirSync(OUT, { recursive: true })
const walk = []
const results = {}
const note = (line) => { walk.push(line); console.log(`[VFY-R1B] ${line}`) }
const record = (name, pass, detail) => { results[name] = { pass, detail }; note(`${name}: ${pass ? 'PASS' : 'FAIL'} — ${detail}`) }

const chrome = spawn(CHROME, [
  '--headless=new', `--remote-debugging-port=${String(PORT)}`,
  '--user-data-dir=/tmp/dsh-vfy-r1b-profile', '--no-first-run', '--disable-gpu',
  '--window-size=420,900', 'about:blank',
], { stdio: 'ignore' })
const cleanup = () => { try { chrome.kill() } catch { /* gone */ } }
process.on('exit', cleanup)
process.on('SIGINT', () => { cleanup(); process.exit(130) })

let seq = 0
let ws
const pending = new Map()
const listeners = new Map()
function send(method, params = {}) {
  const id = ++seq
  return new Promise((resolve, reject) => { pending.set(id, { resolve, reject }); ws.send(JSON.stringify({ id, method, params })) })
}
function on(event, handler) { const list = listeners.get(event) ?? []; list.push(handler); listeners.set(event, list) }
async function connect(wsUrl) {
  ws = new WebSocket(wsUrl)
  await new Promise((resolve, reject) => { ws.addEventListener('open', resolve, { once: true }); ws.addEventListener('error', reject, { once: true }) })
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
async function type(text) { await send('Input.insertText', { text }) }

let tabs = []
for (let attempt = 0; attempt < 40; attempt++) {
  try { tabs = await (await fetch(`http://127.0.0.1:${String(PORT)}/json/list`)).json(); break }
  catch (cause) { if (attempt > 30) throw cause; await sleep(500) }
}
await connect(tabs.find(t => t.type === 'page').webSocketDebuggerUrl)
await send('Page.enable')
await send('Runtime.enable')
await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true })

// Login (demo + light pinned).
await goto(`${BASE}/mobile.html#/`)
await evaluate(`localStorage.setItem('dsh-mobile-runmode', 'demo'); localStorage.setItem('dsh-mobile-theme', 'light')`)
if (!(await evaluate(BODY_HAS('今日台账')))) {
  await goto(`${BASE}/mobile.html#/login`)
  await waitFor(BODY_HAS('食链通'))
  await evaluate(`(() => { const el = document.querySelector('input[inputmode="numeric"]'); el.focus(); return true; })()`)
  await type('123456')
  await evaluate(`[...document.querySelectorAll('button')].find(b => (b.textContent ?? '').trim() === '登录')?.click()`)
  await waitFor(BODY_HAS('今日台账'))
}

// --- 04b: dark-track ghost contrast (attribute flip is immediate for tokens) ----------
await goto(`${BASE}/mobile.html#/chat/session-v6-b3-draft-demo`)
await waitFor(`document.querySelector('[data-testid="draft-card-v3"]') !== null`, { timeout: 30_000 })
await evaluate(`document.documentElement.setAttribute('data-theme', 'dark')`)
await evaluate(`document.querySelector('[data-testid="draft-card-v3"]')?.scrollIntoView({ block: 'center' })`)
await sleep(400)
const contrastDark = await evaluate(`(() => {
  const card = document.querySelector('[data-testid="draft-card-v3"]')
  const buttons = [...(card?.querySelectorAll('button') ?? [])]
  const ghost = buttons.find(b => (b.textContent ?? '').includes('重新起草') || (b.textContent ?? '').includes('驳回'))
  if (ghost === undefined) return { found: false }
  const cs = getComputedStyle(ghost)
  const parse = (value) => {
    const m = value.match(/rgba?\\(([^)]+)\\)/)
    if (m === null) return null
    const parts = m[1].split(',').map(s => Number.parseFloat(s.trim()))
    return { r: parts[0], g: parts[1], b: parts[2], a: parts.length > 3 ? parts[3] : 1 }
  }
  const lum = (c) => {
    const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4 }
    return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b)
  }
  const ratio = (a, b) => { const l1 = lum(a); const l2 = lum(b); return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05) }
  const fg = parse(cs.color)
  let bg = parse(cs.backgroundColor)
  if (bg === null || bg.a === 0) {
    let el = ghost.parentElement
    while (el !== null && (bg === null || bg.a === 0)) { bg = parse(getComputedStyle(el).backgroundColor); el = el.parentElement }
  }
  if (fg === null || bg === null) return { found: true, parsed: false, color: cs.color, bg: cs.backgroundColor }
  const effective = { r: fg.r * fg.a + bg.r * (1 - fg.a), g: fg.g * fg.a + bg.g * (1 - fg.a), b: fg.b * fg.a + bg.b * (1 - fg.a) }
  return { found: true, parsed: true, ratio: Math.round(ratio(effective, bg) * 100) / 100, color: cs.color, bg: cs.backgroundColor, theme: document.documentElement.getAttribute('data-theme'), label: (ghost.textContent ?? '').trim() }
})()`)
note(`04b dark ghost contrast: ${JSON.stringify(contrastDark)}`)
await shot('vfy-r1-04b-ghost-contrast-dark.png')
record('04b-ghost-contrast-dark', contrastDark?.parsed === true && contrastDark.ratio >= 4.5,
  `ratio=${String(contrastDark?.ratio)} color=${String(contrastDark?.color)} on ${String(contrastDark?.bg)} theme=${String(contrastDark?.theme)}`)
await evaluate(`document.documentElement.setAttribute('data-theme', 'light')`)

// --- 05: home offline alert with retry ------------------------------------------------
await goto(`${BASE}/mobile.html#/me`)
await waitFor(BODY_HAS('我的'))
await send('Network.enable')
await send('Network.emulateNetworkConditions', { offline: true, latency: 0, downloadThroughput: 0, uploadThroughput: 0 })
// Switch to the home tab inside the SPA so the roster/sessions polls re-issue.
await evaluate(`[...document.querySelectorAll('.adm-tab-bar-item')][0]?.click()`)
await waitFor(`document.querySelector('section[role="alert"], [role="alert"]') !== null`, { timeout: 20_000 })
const alertCheck = await evaluate(`(() => {
  const alerts = [...document.querySelectorAll('[role="alert"]')]
  return { count: alerts.length, texts: alerts.map(a => (a.textContent ?? '').slice(0, 60)), hasRetry: alerts.some(a => [...a.querySelectorAll('button')].some(b => (b.textContent ?? '').includes('重试'))) }
})()`)
await shot('vfy-r1-05-home-offline-alert.png')
await send('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 })
record('05-error-alert', alertCheck?.count > 0 && alertCheck?.hasRetry === true,
  `alerts=${JSON.stringify(alertCheck?.texts)} retry=${String(alertCheck?.hasRetry)}`)
// Recover via the retry link.
await evaluate(`[...document.querySelectorAll('[role="alert"] button')].find(b => (b.textContent ?? '').includes('重试'))?.click()`)
await sleep(2000)

// --- 06: work four-state tabs ----------------------------------------------------------
await goto(`${BASE}/mobile.html#/work`)
await waitFor(BODY_HAS('工作台'))
await sleep(600)
const workTabs = await evaluate(`[...document.querySelectorAll('.adm-capsule-tab')].map(t => (t.textContent ?? '').trim())`)
record('06-work-four-states', workTabs.length === 4, `capsule tabs = ${JSON.stringify(workTabs)}`)
await shot('vfy-r1-06-work-four-states.png')

// --- 07: four tab navigation -----------------------------------------------------------
const tabNav = await evaluate(`(async () => {
  const items = [...document.querySelectorAll('.adm-tab-bar-item')]
  const seen = []
  for (const item of items) { item.click(); await new Promise(r => setTimeout(r, 600)); seen.push(location.hash) }
  return { count: items.length, titles: items.map(i => (i.textContent ?? '').trim()), hashes: seen }
})()`)
record('07-tab-nav', tabNav?.count === 4 && tabNav?.titles?.join(',') === '消息,同事,工作台,我的',
  `tabs=${JSON.stringify(tabNav?.titles)} hashes=${JSON.stringify(tabNav?.hashes)}`)
await goto(`${BASE}/mobile.html#/me`)
await waitFor(BODY_HAS('我的'))
await sleep(500)
await shot('vfy-r1-07-tabs.png')

// --- 08: theme switch persists across reload -------------------------------------------
await evaluate(`(() => { const sw = document.querySelector('.adm-switch'); if (sw !== null && !sw.classList.contains('adm-switch-checked')) sw.click(); return true; })()`)
await sleep(500)
const beforeReload = await evaluate(`document.documentElement.getAttribute('data-theme')`)
await goto(`${BASE}/mobile.html#/me`)
await waitFor(BODY_HAS('我的'))
await sleep(900)
const afterReload = await evaluate(`document.documentElement.getAttribute('data-theme')`)
record('08-theme-persist', beforeReload === 'dark' && afterReload === 'dark',
  `data-theme before=${String(beforeReload)} afterReload=${String(afterReload)}`)
await shot('vfy-r1-08-theme-persist-dark.png')
await evaluate(`(() => { const sw = document.querySelector('.adm-switch'); if (sw !== null && sw.classList.contains('adm-switch-checked')) sw.click(); return true; })()`)
await sleep(400)

// --- 09: 430px shell --------------------------------------------------------------------
await send('Emulation.setDeviceMetricsOverride', { width: 430, height: 932, deviceScaleFactor: 2, mobile: true })
await goto(`${BASE}/mobile.html#/home`)
await waitFor(BODY_HAS('今日台账'))
await sleep(700)
const shellWidth = await evaluate(`({ w: document.documentElement.clientWidth, overflowX: document.documentElement.scrollWidth > document.documentElement.clientWidth })`)
await shot('vfy-r1-09-430px.png')
record('09-430px-shell', shellWidth?.w === 430 && shellWidth?.overflowX === false,
  `clientWidth=${String(shellWidth?.w)} horizontalOverflow=${String(shellWidth?.overflowX)}`)
await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true })

// --- 10: chats fullscreen layer back ----------------------------------------------------
await goto(`${BASE}/mobile.html#/home`)
await waitFor(BODY_HAS('今日台账'))
await evaluate(`[...document.querySelectorAll('button, a')].find(b => (b.textContent ?? '').includes('全部对话'))?.click()`)
await sleep(900)
let chatsHash = await evaluate(`location.hash`)
if (!String(chatsHash).includes('chats')) { await goto(`${BASE}/mobile.html#/chats`); await sleep(900); chatsHash = await evaluate('location.hash') }
await shot('vfy-r1-10-chats-layer.png')
await evaluate(`[...document.querySelectorAll('button[aria-label="返回"], .adm-nav-bar-back button, [class*="back"] button')][0]?.click()`)
await sleep(900)
const backHash = await evaluate(`location.hash`)
record('10-chats-back', !String(backHash).includes('chats'),
  `chatsHash=${String(chatsHash)} backHash=${String(backHash)}`)
await shot('vfy-r1-10-chats-back.png')

writeFileSync(`${OUT}.vfy-r1b-walkthrough.log`, `${walk.join('\n')}\n`)
writeFileSync(`${OUT}.vfy-r1b-results.json`, `${JSON.stringify(results, null, 2)}\n`)
note(`results: ${JSON.stringify(results)}`)
cleanup()
