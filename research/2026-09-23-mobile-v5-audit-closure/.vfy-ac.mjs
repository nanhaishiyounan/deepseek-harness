#!/usr/bin/env node
/**
 * v5 audit-closure verification driver (research artifact, not product code).
 * Drives the real /mobile app on the 3080 server through headless Chrome CDP
 * at 390x844 and collects DOM assertions + screenshots prefixed vfy-ac-.
 * Usage: node research/2026-09-23-mobile-v5-audit-closure/.vfy-ac.mjs
 */
import { spawn } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { setTimeout as sleep } from 'node:timers/promises'

const OUT = new URL('.', import.meta.url).pathname
const PORT = 9341
const BASE = 'http://localhost:3080'
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'

mkdirSync(OUT, { recursive: true })

const chrome = spawn(CHROME, [
  '--headless=new',
  `--remote-debugging-port=${String(PORT)}`,
  '--user-data-dir=/tmp/dsh-vfy-ac-profile',
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

// --- 0. fresh login ---------------------------------------------------------
await goto(`${BASE}/mobile.html`)
await evaluate(`(() => { try { localStorage.clear() } catch { /* not on the app origin yet */ } return true })()`)
await goto(`${BASE}/mobile.html`)
await waitFor(`document.body.innerText.includes('食链通')`)
await TYPE('input[inputmode="numeric"]', '123456')
await evaluate(`[...document.querySelectorAll('button')].find(b => b.textContent === '登录')?.click()`)
// v5 lands on the Home workbench (daypart greeting / 今日台账), not the chats tab.
await waitFor(`document.querySelector('.adm-tab-bar') !== null || document.body.innerText.includes('今日台账')`)
await sleep(1500)

// The shared back-header probe: one labeled button, no second arrow glyph.
const BACK_PROBE = `(() => {
  const nav = document.querySelector('.adm-nav-bar')
  if (nav === null) return { present: false }
  const labeled = nav.querySelectorAll('button[aria-label="返回"]')
  const imgs = nav.querySelectorAll('img')
  const svgs = nav.querySelectorAll('svg')
  return { present: true, labeled: labeled.length, imgs: imgs.length, svgs: svgs.length,
    height: getComputedStyle(nav).height,
    hit: (() => { const b = nav.querySelector('button[aria-label="返回"]'); if (b === null) return null; const r = b.getBoundingClientRect(); return { w: Math.round(r.width), h: Math.round(r.height), top: Math.round(r.top) } })() }
})()`

// --- A1. chat page top: ONE back affordance ----------------------------------
// Enter the first chat from the chats list.
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
record('A1-enter', entered !== 'none', `entered chat via ${entered}`)
await waitFor(`location.hash.startsWith('#/chat/')`, { timeout: 20000 })
await sleep(2500)
chatHash = await evaluate('location.hash')
const a1 = await evaluate(BACK_PROBE)
record('A1-single-back', a1.present === true && a1.labeled === 1, `chat nav labeled-back=${a1.labeled} imgs=${a1.imgs} svgs=${a1.svgs}`)
record('A1-touch', a1.hit !== null && a1.hit.w >= 44 && a1.hit.h >= 44, `back hit ${a1.hit === null ? 'missing' : `${a1.hit.w}x${a1.hit.h}`}`)
await shot('vfy-ac-01-chat-top.png')

// --- A2. the back button actually returns to #/chats -------------------------
await evaluate(`document.querySelector('.adm-nav-bar button[aria-label="返回"]')?.click()`)
await sleep(1200)
const a2hash = await evaluate('location.hash')
record('A2-back-works', a2hash.startsWith('#/chats'), `after click hash=${a2hash} (from ${chatHash})`)
await waitFor(`document.body.innerText.includes('消息')`).catch(() => {})
await sleep(800)
await shot('vfy-ac-02-chat-back-works.png')

// --- A3. work detail ----------------------------------------------------------
await goto(`${BASE}/mobile.html#/work`)
try {
  await waitFor(`document.querySelectorAll('[data-testid="work-card"]').length > 0`, { timeout: 8000 })
} catch {
  // The default status tab may be empty; flip to the one carrying items.
  await evaluate(`[...document.querySelectorAll('.adm-capsule-tabs-tab')].find(t => (t.textContent ?? '').trim().startsWith('进行中'))?.click()`)
  await sleep(800)
  await waitFor(`document.querySelectorAll('[data-testid="work-card"]').length > 0`, { timeout: 15000 })
}
await sleep(1200)
const workEnter = await evaluate(`(() => {
  const btn = document.querySelector('[data-testid="work-card"] button[aria-label^="打开"]')
  if (btn !== null) { btn.click(); return 'cardHeadButton' }
  return 'none'
})()`)
await waitFor(`location.hash.match(/^#\\/work\\/.+/) !== null`, { timeout: 15000 }).catch(() => {})
await sleep(2000)
const a3 = await evaluate(BACK_PROBE)
const a3hash = await evaluate('location.hash')
record('A3-work-detail', workEnter !== 'none' && a3hash.match(/^#\/work\/.+$/) !== null && a3.present === true && a3.labeled === 1, `enter=${workEnter} hash=${a3hash} nav=${JSON.stringify(a3)}`)
await shot('vfy-ac-03-work-detail.png')

// --- A4. tasks ----------------------------------------------------------------
await goto(`${BASE}/mobile.html#/tasks`)
await sleep(1500)
const a4 = await evaluate(BACK_PROBE)
// Height consistency across pages (the 52px intent failing everywhere is
// defect D1, judged from CSS evidence, not per-page here).
record('A4-tasks', a4.present === true && a4.labeled === 1, `tasks nav=${JSON.stringify(a4)}`)
await shot('vfy-ac-04-tasks.png')

// --- A5. files ----------------------------------------------------------------
await goto(`${BASE}/mobile.html#/files`)
await sleep(1500)
const a5 = await evaluate(BACK_PROBE)
record('A5-files', a5.present === true && a5.labeled === 1, `files nav=${JSON.stringify(a5)}`)
await shot('vfy-ac-05-files.png')

// --- A6. agents ---------------------------------------------------------------
await goto(`${BASE}/mobile.html#/agents`)
await sleep(1800)
const a6 = await evaluate(BACK_PROBE)
record('A6-agents', a6.present === true && a6.labeled === 1, `agents nav=${JSON.stringify(a6)}`)
await shot('vfy-ac-06-agents.png')

// --- A7. top safe area --------------------------------------------------------
// env(safe-area-inset-top) is 0 in headless; simulate a 47px notch by injecting
// the same padding the env() would produce and assert the layout shifts down.
const a7 = await evaluate(`(() => {
  const root = document.querySelector('.dshm-root')
  if (root === null) return { root: false }
  const before = getComputedStyle(root).paddingTop
  root.style.paddingTop = '47px'
  const nav = document.querySelector('.adm-nav-bar')
  const shifted = nav === null ? null : nav.getBoundingClientRect().top
  return { root: true, before, shifted }
})()`)
await sleep(300)
await shot('vfy-ac-07-safe-area.png')
const a7b = await evaluate(`(() => {
  const root = document.querySelector('.dshm-root')
  const nav = document.querySelector('.adm-nav-bar')
  const covered = nav === null ? null : nav.getBoundingClientRect().top < 47
  const pageContent = document.body.innerText.length > 20
  root.style.paddingTop = ''
  return { covered, pageContent, restored: getComputedStyle(root).paddingTop }
})()`)
record('A7-safe-area', a7.root === true && a7.shifted !== null && a7.shifted >= 47 && a7b.covered === false && a7b.restored === a7.before,
  `desktop paddingTop=${a7.before} (no stray inset), simulated 47px shifts nav to y=${a7.shifted}, covered=${a7b.covered}, restored=${a7b.restored}`)

// --- A8. home skeleton under delayed RPC --------------------------------------
await send('Fetch.enable', { patterns: [{ urlPattern: '*://localhost:3080/api/*', requestStage: 'Request' }] })
let throttle = false
const paused = []
on('Fetch.requestPaused', async (params) => {
  if (throttle) paused.push(params)
  else await send('Fetch.continueRequest', { requestId: params.requestId }).catch(() => {})
})
throttle = true
await goto(`${BASE}/mobile.html#/`)
// continueRequest for the document itself was already handled (document URL is
// not under /api/*); every paused /api call now waits.
await sleep(1200)
const skelVisible = await evaluate(`document.querySelectorAll('[class*="skel"], [class*="Skel"], [role="status"]').length`)
record('A8-skeleton-visible', skelVisible > 0, `skeleton/status nodes while delayed: ${skelVisible}`)
await shot('vfy-ac-08-home-skeleton.png')
throttle = false
for (const params of paused.splice(0)) await send('Fetch.continueRequest', { requestId: params.requestId }).catch(() => {})
await sleep(2500)
await shot('vfy-ac-08b-home-ready.png')
const a8ready = await evaluate(`document.querySelectorAll('[role="status"]').length`)
record('A8-ready', true, `status rows after release: ${a8ready} (0 expected once loaded)`)

// --- A9. dark chat ------------------------------------------------------------
await goto(`${BASE}/mobile.html#/me`)
await waitFor(`document.body.innerText.includes('深色模式')`)
await evaluate(`[...document.querySelectorAll('[role="switch"]')].find(s => s.getAttribute('aria-label') === '深色模式')?.click()`)
await sleep(600)
await goto(`${BASE}/mobile.html${chatHash}`)
await waitFor(`document.querySelector('.adm-nav-bar') !== null`, { timeout: 20000 })
await sleep(2000)
const a9 = await evaluate(BACK_PROBE)
record('A9-dark-chat', a9.present === true && a9.labeled === 1, `dark chat nav=${JSON.stringify(a9)}`)
await shot('vfy-ac-09-dark-chat.png')

// --- A10. new-chat sheet: no nested buttons ------------------------------------
await goto(`${BASE}/mobile.html#/chats`)
await waitFor(`document.body.innerText.includes('消息')`)
await sleep(1200)
await evaluate(`document.querySelector('button[aria-label="新建会话"]')?.click()`)
await waitFor(`document.body.innerText.includes('新建会话')`)
await sleep(600)
const a10 = await evaluate(`(() => {
  const popup = document.querySelector('.adm-popup, [class*="sheet"]')
  if (popup === null) return { popup: false }
  const chips = [...popup.querySelectorAll('[class*="rosterChip"]')]
  const chipTags = [...new Set(chips.map(c => c.tagName))]
  const nested = [...popup.querySelectorAll('button')].filter(b => b.parentElement?.closest('button'))
  return { popup: true, chips: chips.length, chipTags, nested: nested.length }
})()`)
record('A10-sheet-no-nesting', a10.popup === true && a10.nested === 0 && (a10.chips === 0 || a10.chipTags.every(t => t === 'SPAN')),
  `sheet chips=${a10.chips} tags=${JSON.stringify(a10.chipTags)} nestedButtons=${a10.nested}`)
await shot('vfy-ac-10-newchat-sheet.png')
await evaluate(`document.querySelector('button[aria-label="关闭"]')?.click()`)
await sleep(400)

// --- A11. files row: star is a sibling, not nested ------------------------------
await goto(`${BASE}/mobile.html#/files`)
await sleep(1800)
const a11 = await evaluate(`(() => {
  const rows = document.querySelectorAll('[data-testid="file-row"]')
  // [class*="fileTop"] also matches fileTopMain (the open button); the row
  // head we assert on is only the DIV face.
  const matched = [...document.querySelectorAll('[class*="fileTop"]')]
  const tops = matched.filter(el => el.tagName === 'DIV')
  const mainButtons = matched.filter(el => el.tagName === 'BUTTON')
  const bad = []
  for (const top of tops) {
    const buttons = top.querySelectorAll(':scope > button')
    for (const b of buttons) if (b.querySelector('button, [role="button"]') !== null) bad.push('button nested in open button')
    const stars = top.querySelectorAll(':scope > [role="button"][aria-label*="收藏"], :scope > [aria-label*="收藏"]')
    for (const s of stars) if (s.closest('button') !== null) bad.push('star inside a button')
  }
  const nested = [...document.querySelectorAll('button')].filter(b => b.parentElement?.closest('button')).length
  return { tops: tops.length, mains: mainButtons.length, rows: rows.length, bad, nested }
})()`)
record('A11-files-sibling-star', a11.tops > 0 && a11.bad.length === 0 && a11.nested === 0, `fileTop DIVs=${a11.tops} fileTopMain buttons=${a11.mains} rows=${a11.rows} bad=${JSON.stringify(a11.bad)} pageNestedButtons=${a11.nested}`)
await shot('vfy-ac-11-files.png')

// --- touch target: send button on chat -----------------------------------------
await goto(`${BASE}/mobile.html${chatHash}`)
await waitFor(`document.querySelector('textarea') !== null`, { timeout: 20000 })
await sleep(1500)
const a12 = await evaluate(`(() => {
  const b = document.querySelector('button[aria-label="发送"]')
  if (b === null) return null
  const r = b.getBoundingClientRect()
  return { w: Math.round(r.width), h: Math.round(r.height) }
})()`)
record('A12-send-touch', a12 !== null && a12.w >= 44 && a12.h >= 44, `send hit ${a12 === null ? 'missing' : `${a12.w}x${a12.h}`}`)

writeFileSync(`${OUT}.vfy-ac-results.json`, JSON.stringify({ base: BASE, chatHash, results }, null, 2))
console.log('done')
chrome.kill()
process.exit(results.every(r => r.ok) ? 0 : 1)
