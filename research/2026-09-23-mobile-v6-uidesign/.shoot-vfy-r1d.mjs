/**
 * R1-fix verification part D: the dark-track re-checks through a full
 * location.reload() (the theme rides .dshm-root[data-theme], which only a
 * remount re-reads from localStorage) and the switch click re-read at the
 * correct mount point.
 *
 * Usage: node research/2026-09-23-mobile-v6-uidesign/.shoot-vfy-r1d.mjs
 */
import { spawn } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { setTimeout as sleep } from 'node:timers/promises'

const OUT = new URL('.', import.meta.url).pathname
const BASE = 'http://127.0.0.1:3080'
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const PORT = 9351

mkdirSync(OUT, { recursive: true })
const walk = []
const results = {}
const note = (line) => { walk.push(line); console.log(`[VFY-R1D] ${line}`) }
const record = (name, pass, detail) => { results[name] = { pass, detail }; note(`${name}: ${pass ? 'PASS' : 'FAIL'} — ${detail}`) }

const chrome = spawn(CHROME, [
  '--headless=new', `--remote-debugging-port=${String(PORT)}`,
  '--user-data-dir=/tmp/dsh-vfy-r1d-profile', '--no-first-run', '--disable-gpu',
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
async function navigate(url) {
  await send('Page.navigate', { url })
  await new Promise((resolve) => {
    const done = () => { listeners.set('Page.loadEventFired', []); resolve() }
    listeners.set('Page.loadEventFired', [done])
    setTimeout(resolve, 2500)
  })
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
async function realClick(selectorJs) {
  const box = await evaluate(`(() => { const el = ${selectorJs}; if (el === null || el === undefined) return null; const r = el.getBoundingClientRect(); return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) } })()`)
  if (box === null || box === undefined) throw new Error(`realClick: element not found`)
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: box.x, y: box.y, button: 'left', clickCount: 1 })
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: box.x, y: box.y, button: 'left', clickCount: 1 })
}

let tabs = []
for (let attempt = 0; attempt < 40; attempt++) {
  try { tabs = await (await fetch(`http://127.0.0.1:${String(PORT)}/json/list`)).json(); break }
  catch (cause) { if (attempt > 30) throw cause; await sleep(500) }
}
await connect(tabs.find(t => t.type === 'page').webSocketDebuggerUrl)
await send('Page.enable')
await send('Runtime.enable')
await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true })

// Login (demo + light).
await navigate(`${BASE}/mobile.html#/`)
await evaluate(`localStorage.setItem('dsh-mobile-runmode', 'demo'); localStorage.setItem('dsh-mobile-theme', 'light')`)
if (!(await evaluate(BODY_HAS('今日台账')))) {
  await navigate(`${BASE}/mobile.html#/login`)
  await waitFor(BODY_HAS('食链通'))
  await evaluate(`(() => { const el = document.querySelector('input[inputmode="numeric"]'); el.focus(); return true; })()`)
  await type('123456')
  await evaluate(`[...document.querySelectorAll('button')].find(b => (b.textContent ?? '').trim() === '登录')?.click()`)
  await waitFor(BODY_HAS('今日台账'))
}

// --- 04d: dark ghost contrast via localStorage + full reload ----------------------------
await evaluate(`location.hash = '#/chat/session-v6-b3-draft-demo'`)
await sleep(600)
await evaluate(`localStorage.setItem('dsh-mobile-theme', 'dark')`)
await evaluate(`location.reload()`)
await sleep(3500)
await waitFor(`document.querySelector('[data-testid="draft-card-v3"]') !== null`, { timeout: 30_000 })
await evaluate(`document.querySelector('[data-testid="draft-card-v3"]')?.scrollIntoView({ block: 'center' })`)
await sleep(400)
const darkState = await evaluate(`document.querySelector('.dshm-root')?.getAttribute('data-theme')`)
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
  return { found: true, parsed: true, ratio: Math.round(ratio(effective, bg) * 100) / 100, color: cs.color, bg: cs.backgroundColor, label: (ghost.textContent ?? '').trim() }
})()`)
note(`04d dshm-root theme=${String(darkState)} contrast: ${JSON.stringify(contrastDark)}`)
await shot('vfy-r1-04d-ghost-contrast-dark.png')
record('04d-ghost-contrast-dark', darkState === 'dark' && contrastDark?.parsed === true && contrastDark.ratio >= 4.5,
  `dshm-root=${String(darkState)} ratio=${String(contrastDark?.ratio)} color=${String(contrastDark?.color)} on ${String(contrastDark?.bg)}`)

// --- 08d: dark switch real click + persistence across a full reload ----------------------
await evaluate(`localStorage.setItem('dsh-mobile-theme', 'light')`)
await evaluate(`location.hash = '#/me'`)
await evaluate(`location.reload()`)
await sleep(3500)
await waitFor(BODY_HAS('我的'))
await sleep(600)
const swBefore = await evaluate(`(() => {
  const row = [...document.querySelectorAll('[class*="item"], [class*="row"], li, div')].find(el => (el.childNodes.length > 0) && (el.textContent ?? '').startsWith('深色模式') && (el.textContent ?? '').length < 12)
  const sw = row?.querySelector('.adm-switch') ?? null
  return { found: sw !== null, checked: sw?.classList.contains('adm-switch-checked') ?? null, theme: document.querySelector('.dshm-root')?.getAttribute('data-theme') }
})()`)
note(`08d switch before: ${JSON.stringify(swBefore)}`)
if (swBefore?.found === true && swBefore?.checked === false) {
  await realClick(`[...document.querySelectorAll('[class*="item"], [class*="row"], li, div')].find(el => (el.childNodes.length > 0) && (el.textContent ?? '').startsWith('深色模式') && (el.textContent ?? '').length < 12)?.querySelector('.adm-switch')`)
}
await sleep(800)
const afterClick = await evaluate(`document.querySelector('.dshm-root')?.getAttribute('data-theme')`)
await evaluate(`location.reload()`)
await sleep(3500)
await waitFor(BODY_HAS('我的'))
await sleep(800)
const afterReload = await evaluate(`document.querySelector('.dshm-root')?.getAttribute('data-theme')`)
await shot('vfy-r1-08d-theme-persist-dark.png')
record('08d-theme-persist', afterClick === 'dark' && afterReload === 'dark',
  `click→${String(afterClick)} reload→${String(afterReload)}`)
// Restore light.
await evaluate(`localStorage.setItem('dsh-mobile-theme', 'light')`)
await evaluate(`location.reload()`)
await sleep(2500)

writeFileSync(`${OUT}.vfy-r1d-walkthrough.log`, `${walk.join('\n')}\n`)
writeFileSync(`${OUT}.vfy-r1d-results.json`, `${JSON.stringify(results, null, 2)}\n`)
note(`results: ${JSON.stringify(results)}`)
cleanup()
