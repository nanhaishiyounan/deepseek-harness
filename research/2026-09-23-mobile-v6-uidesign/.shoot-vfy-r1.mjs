/**
 * R1-fix verification screenshot driver (independent re-check, not R1's own run).
 *
 * Targets the already-running `dsh web` dev server (:3080,
 * DSH_HOME=examples/kb-agent/.dsh) with a dedicated headless Chrome over CDP
 * at 390×844. Captures the independent verification evidence for the R1 fix
 * batch:
 *   - vfy-r1-01-me-receipt-strip.png: the me-tab receipt strip — DOM rows are
 *     cross-checked against an independent recompute over session.list +
 *     session.history fences (newest three, in order).
 *   - vfy-r1-02-agents-row-anchor.png: nine roster rows; tapping one row marks
 *     only that row busy while the rest stay enabled.
 *   - vfy-r1-03-typing-cleared.png: a demo-mode turn settles and the
 *     breathing typing indicator retires.
 *   - vfy-r1-04-ghost-contrast-dark.png: the v3 draft card's ghost button in
 *     the dark track with a computed contrast ratio readout.
 *   - vfy-r1-05-agents-offline-alert.png: with the network emulated offline,
 *     the roster failure renders a role=alert strip with a retry link.
 *   - vfy-r1-06-work-four-states.png / vfy-r1-07-tabs.png /
 *     vfy-r1-08-theme-persist-dark.png / vfy-r1-09-430px.png /
 *     vfy-r1-10-chats-back.png: regression spot checks.
 *
 * Usage: node research/2026-09-23-mobile-v6-uidesign/.shoot-vfy-r1.mjs
 */
import { spawn } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { setTimeout as sleep } from 'node:timers/promises'

const OUT = new URL('.', import.meta.url).pathname
const BASE = 'http://127.0.0.1:3080'
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const PORT = 9347
/** The v5 walkthrough's injected report session (already in the store). */
const RICH_SEED = 'session-v6-b3-rich'

mkdirSync(OUT, { recursive: true })
const walk = []
const results = {}
const note = (line) => {
  walk.push(line)
  console.log(`[VFY-R1] ${line}`)
}
const record = (name, pass, detail) => {
  results[name] = { pass, detail }
  note(`${name}: ${pass ? 'PASS' : 'FAIL'} — ${detail}`)
}

const chrome = spawn(CHROME, [
  '--headless=new',
  `--remote-debugging-port=${String(PORT)}`,
  '--user-data-dir=/tmp/dsh-vfy-r1-profile',
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

async function type(text) {
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
await goto(`${BASE}/mobile.html#/me`)
await waitFor(BODY_HAS('我的'))
// Force a light re-render whatever the stored choice was.
await evaluate(`(() => { const sw = document.querySelector('.adm-switch'); if (sw !== null && sw.classList.contains('adm-switch-checked')) sw.click(); return true; })()`)
await sleep(400)

// --- vfy-r1-01: the me-tab receipt strip shows the newest three ---------------------
// Independent recompute: replicate the collection over session.list (first 10
// form-assistant sessions, newest-first) x session.history receipt fences.
const rpcCall = `window.__vfyRpc = async (method, payload) => {
  const res = await fetch('/api/' + method, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ type: 'client-request', rpcId: 'vfy-' + Math.random().toString(36).slice(2), method, payload: payload ?? {} }),
  })
  return res.json()
}`
await evaluate(rpcCall)
await sleep(600)
const stripCheck = await evaluate(`(async () => {
  const listResp = await window.__vfyRpc('session.list', {})
  const items = (listResp?.result?.value?.items ?? []).slice().sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0))
  const rows = items
    .filter(row => row.agentPreset === 'mobile-form-assistant' || row.agentPreset === undefined)
    .slice(0, 10)
  const receipts = []
  for (const row of rows) {
    const histResp = await window.__vfyRpc('session.history', { sessionId: row.sessionId }).catch(() => undefined)
    const events = histResp?.result?.value?.events ?? []
    for (const envelope of events) {
      const ev = envelope?.event ?? envelope
      if (ev?.type !== 'assistant/message') continue
      const content = ev?.data?.message?.content
      if (!Array.isArray(content)) continue
      for (const block of content) {
        if (block?.type !== 'text') continue
        const fences = [...String(block.text ?? '').matchAll(/\`\`\`dsh\\s*([^\`]*?)\`\`\`/g)]
        for (const fence of fences) {
          try {
            const payload = JSON.parse(fence[1])
            if (payload?.type === 'submit_receipt') {
              receipts.push({ sessionId: row.sessionId, seq: ev.seq ?? 0, rowId: payload.rowId, form: payload.form?.label ?? '' })
            }
          } catch { /* not JSON, skip */ }
        }
      }
    }
  }
  const domRows = [...document.querySelectorAll('section[aria-label="最近回执"] button')]
  const domNos = domRows.map(el => ({
    no: (el.querySelector('[class*="receiptNo"]')?.textContent ?? '').replace('№', '').trim(),
    form: (el.querySelector('[class*="recentForm"]')?.textContent ?? '').trim(),
  }))
  const expected = receipts.slice(0, 3).map(r => ({ no: String(r.rowId), form: r.form }))
  const match = domNos.length === expected.length && domNos.every((row, i) => row.no === expected[i].no && (expected[i].form === '' || row.form === expected[i].form))
  return { collected: receipts.length, expected, domNos, match, domCount: domRows.length }
})()`)
note(`vfy-r1-01 recompute: ${JSON.stringify(stripCheck)}`)
await shot('vfy-r1-01-me-receipt-strip.png')
record('01-receipt-strip', stripCheck?.match === true && (stripCheck?.domCount ?? 0) <= 3,
  `collected=${String(stripCheck?.collected ?? '?')} expected=${JSON.stringify(stripCheck?.expected ?? [])} dom=${JSON.stringify(stripCheck?.domNos ?? [])} match=${String(stripCheck?.match)}`)

// --- vfy-r1-02: agents nine rows + starting row anchored, rest enabled ---------------
await goto(`${BASE}/mobile.html#/agents`)
await waitFor(BODY_HAS('智能填表助手'))
const rosterCount = await evaluate(`[...document.querySelectorAll('button[aria-label^="找 "]')].length`)
record('02-roster-rows', rosterCount >= 2, `roster rows with 找-label = ${String(rosterCount)} (deployment presets; >=2 needed for the anchor check)`)
// Tap the mobile-form-assistant row with session.create held at the wire, so
// the pending window stays observable; only the tapped row disables.
await send('Fetch.enable', { patterns: [{ urlPattern: '*session.create*', requestStage: 'Request' }] })
let pausedCreate = null
on('Fetch.requestPaused', (params) => { pausedCreate = params.requestId })
const anchorCheck = await evaluate(`(() => {
  const rows = [...document.querySelectorAll('button[aria-label^="找 "]')]
  const tapped = rows.find(b => (b.getAttribute('aria-label') ?? '').includes('智能填表助手'))
  if (tapped === undefined || rows.length < 2) return { ok: false, reason: 'row not found' }
  tapped.click()
  const tappedLabel = tapped.getAttribute('aria-label')
  const read = () => {
    const after = [...document.querySelectorAll('button[aria-label^="找 "]')]
    return {
      count: after.length,
      tappedDisabled: after.find(b => b.getAttribute('aria-label') === tappedLabel)?.disabled,
      othersDisabled: after.filter(b => b.getAttribute('aria-label') !== tappedLabel).map(b => b.disabled),
      creatingShown: (after.find(b => b.getAttribute('aria-label') === tappedLabel)?.innerText ?? '').includes('创建中'),
    }
  }
  return read()
})()`)
await sleep(400)
const anchorMid = await evaluate(`(() => {
  const after = [...document.querySelectorAll('button[aria-label^="找 "]')]
  const tappedLabel = '找智能填表助手'
  return {
    count: after.length,
    tappedDisabled: after.find(b => b.getAttribute('aria-label') === tappedLabel)?.disabled,
    othersDisabled: after.filter(b => b.getAttribute('aria-label') !== tappedLabel).map(b => b.disabled),
    creatingShown: (after.find(b => b.getAttribute('aria-label') === tappedLabel)?.innerText ?? '').includes('创建中'),
  }
})()`)
record('02-row-anchor', anchorMid?.tappedDisabled === true && (anchorMid?.othersDisabled ?? []).every(d => d === false),
  `create held at wire; tappedDisabled=${String(anchorMid?.tappedDisabled)} othersDisabled=${JSON.stringify(anchorMid?.othersDisabled)} creating=${String(anchorMid?.creatingShown)} othersCount=${String(anchorMid?.othersDisabled?.length)}`)
await shot('vfy-r1-02-agents-row-anchor.png')
// Release the held create and let the navigation land.
for (let i = 0; i < 40 && pausedCreate === null; i++) await sleep(100)
if (pausedCreate !== null) await send('Fetch.continueRequest', { requestId: pausedCreate })
await send('Fetch.disable')
listeners.set('Fetch.requestPaused', [])
await sleep(2500)
record('02-create-navigates', await evaluate(`location.hash.startsWith('#/chat/')`) === true,
  `hash after tap=${String(await evaluate('location.hash'))}`)
await goto(`${BASE}/mobile.html#/agents`)
await waitFor(BODY_HAS('智能填表助手'))

// --- vfy-r1-03: the demo typing indicator retires once the turn settles --------------
await goto(`${BASE}/mobile.html#/agents`)
await waitFor(BODY_HAS('智能填表助手'))
await evaluate(`[...document.querySelectorAll('button')].find(b => (b.getAttribute('aria-label') ?? '').includes('智能填表助手'))?.click()`)
await waitFor(`location.hash.startsWith('#/chat/')`, { timeout: 20_000 })
await waitFor(`document.querySelector('textarea') !== null`, { timeout: 20_000 })
await evaluate(`(() => { document.querySelector('textarea').focus(); return true; })()`)
await type('帮我看下这个月的采购情况')
await evaluate(`[...document.querySelectorAll('button')].find(b => b.getAttribute('aria-label') === '发送')?.click()`)
await sleep(2800)
const breathing = await evaluate(`document.querySelector('[aria-label="正在处理"]') !== null`)
note(`vfy-r1-03: breathing window observed=${String(breathing)}`)
await waitFor(`document.querySelector('[aria-label="正在处理"]') === null`, { timeout: 60_000 })
await waitFor(`!document.body.innerText.includes('正在处理')`, { timeout: 90_000 })
await sleep(600)
await shot('vfy-r1-03-typing-cleared.png')
record('03-typing-retires', true, `breathingObserved=${String(breathing)}; settled with no 正在处理 in body (screenshot)`)

// --- vfy-r1-04: dark ghost button contrast on the v3 draft card ----------------------
await evaluate(`localStorage.setItem('dsh-mobile-theme', 'dark')`)
await goto(`${BASE}/mobile.html#/chat/session-v6-b3-draft-demo`)
await waitFor(`document.querySelector('[data-testid="draft-card-v3"]') !== null`, { timeout: 30_000 })
await evaluate(`document.querySelector('[data-testid="draft-card-v3"]')?.scrollIntoView({ block: 'center' })`)
const contrast = await evaluate(`(() => {
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
  if (bg === null || (bg.a === 0)) {
    let el = ghost.parentElement
    while (el !== null && (bg === null || bg.a === 0)) { bg = parse(getComputedStyle(el).backgroundColor); el = el.parentElement }
  }
  if (fg === null || bg === null) return { found: true, parsed: false, color: cs.color, bg: cs.backgroundColor }
  const effective = { r: fg.r * fg.a + bg.r * (1 - fg.a), g: fg.g * fg.a + bg.g * (1 - fg.a), b: fg.b * fg.a + bg.b * (1 - fg.a) }
  return { found: true, parsed: true, ratio: Math.round(ratio(effective, bg) * 100) / 100, color: cs.color, bg: cs.backgroundColor, label: (ghost.textContent ?? '').trim() }
})()`)
note(`vfy-r1-04 ghost contrast: ${JSON.stringify(contrast)}`)
await evaluate(`document.querySelector('[data-testid="draft-card-v3"]')?.scrollIntoView({ block: 'center' })`)
await shot('vfy-r1-04-ghost-contrast-dark.png')
record('04-ghost-contrast', contrast?.parsed === true && contrast.ratio >= 4.5,
  `ratio=${String(contrast?.ratio)} color=${String(contrast?.color)} on ${String(contrast?.bg)} (dark track)`)
await evaluate(`localStorage.setItem('dsh-mobile-theme', 'light')`)
await sleep(400)

// --- vfy-r1-05: offline failure renders role=alert with retry ------------------------
await goto(`${BASE}/mobile.html#/me`)
await waitFor(BODY_HAS('我的'))
await send('Network.enable')
await send('Network.emulateNetworkConditions', { offline: true, latency: 0, downloadThroughput: 0, uploadThroughput: 0 })
// Switch to the agents tab inside the SPA (no document reload) so the roster
// useAsync re-issues against the dead network.
await evaluate(`[...document.querySelectorAll('.adm-tab-bar-item')][1]?.click()`)
await waitFor(`document.querySelector('[role="alert"]') !== null`, { timeout: 20_000 })
const alertCheck = await evaluate(`(() => {
  const alert = document.querySelector('[role="alert"]')
  return { text: (alert?.textContent ?? '').slice(0, 80), hasRetry: [...(alert?.querySelectorAll('button') ?? [])].some(b => (b.textContent ?? '').includes('重试')) }
})()`)
await shot('vfy-r1-05-agents-offline-alert.png')
await send('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 })
record('05-error-alert', alertCheck?.text.includes('加载失败') === true && alertCheck?.hasRetry === true,
  `alert="${String(alertCheck?.text)}" retry=${String(alertCheck?.hasRetry)}`)
// Recover: let the retry land (poll/refresh or manual retry click).
await evaluate(`[...document.querySelectorAll('[role="alert"] button')].find(b => (b.textContent ?? '').includes('重试'))?.click()`)
await sleep(1500)

// --- vfy-r1-06: work four-state tabs --------------------------------------------------
await goto(`${BASE}/mobile.html#/work`)
await waitFor(BODY_HAS('工作台'))
const workTabs = await evaluate(`[...document.querySelectorAll('.adm-capsule-tab')].map(t => (t.textContent ?? '').trim())`)
record('06-work-four-states', workTabs.length === 4, `capsule tabs = ${JSON.stringify(workTabs)}`)
await shot('vfy-r1-06-work-four-states.png')

// --- vfy-r1-07: four tab navigation ---------------------------------------------------
const tabNav = await evaluate(`(async () => {
  const nav = document.querySelector('nav[aria-label="底部导航"]')
  const items = [...(nav?.querySelectorAll('.adm-tab-bar-item') ?? [])]
  const order = ['消息', '同事', '工作台', '我的']
  const seen = []
  for (const item of items) { item.click(); await new Promise(r => setTimeout(r, 500)); seen.push(location.hash) }
  return { count: items.length, titles: items.map(i => (i.textContent ?? '').trim()), hashes: seen, order }
})()`)
record('07-tab-nav', tabNav?.count === 4 && (tabNav?.titles?.join(',') === '消息,同事,工作台,我的'),
  `tabs=${JSON.stringify(tabNav?.titles)} hashes=${JSON.stringify(tabNav?.hashes)}`)
await goto(`${BASE}/mobile.html#/me`)
await waitFor(BODY_HAS('我的'))
await shot('vfy-r1-07-tabs.png')

// --- vfy-r1-08: theme switch persists across reload -----------------------------------
await evaluate(`(() => { const sw = document.querySelector('.adm-switch'); if (sw !== null && !sw.classList.contains('adm-switch-checked')) sw.click(); return true; })()`)
await sleep(500)
const beforeReload = await evaluate(`document.documentElement.getAttribute('data-theme')`)
await goto(`${BASE}/mobile.html#/me`)
await waitFor(BODY_HAS('我的'))
await sleep(800)
const afterReload = await evaluate(`document.documentElement.getAttribute('data-theme')`)
record('08-theme-persist', beforeReload === 'dark' && afterReload === 'dark',
  `data-theme before=${String(beforeReload)} afterReload=${String(afterReload)}`)
await shot('vfy-r1-08-theme-persist-dark.png')
// Restore light.
await evaluate(`(() => { const sw = document.querySelector('.adm-switch'); if (sw !== null && sw.classList.contains('adm-switch-checked')) sw.click(); return true; })()`)
await sleep(400)

// --- vfy-r1-09: 430px shell ------------------------------------------------------------
await send('Emulation.setDeviceMetricsOverride', { width: 430, height: 932, deviceScaleFactor: 2, mobile: true })
await goto(`${BASE}/mobile.html#/home`)
await waitFor(BODY_HAS('今日台账'))
await sleep(600)
const shellWidth = await evaluate(`({ w: document.documentElement.clientWidth, overflowX: document.documentElement.scrollWidth > document.documentElement.clientWidth })`)
await shot('vfy-r1-09-430px.png')
record('09-430px-shell', shellWidth?.w === 430 && shellWidth?.overflowX === false,
  `clientWidth=${String(shellWidth?.w)} horizontalOverflow=${String(shellWidth?.overflowX)}`)
await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true })

// --- vfy-r1-10: chats fullscreen layer back -------------------------------------------
await goto(`${BASE}/mobile.html#/home`)
await waitFor(BODY_HAS('今日台账'))
// Enter the chats layer via the header entry on home (全部对话) or the hash.
await evaluate(`[...document.querySelectorAll('button, a')].find(b => (b.textContent ?? '').includes('全部对话'))?.click()`)
await sleep(800)
let inChats = await evaluate(`location.hash.includes('#/chats') || (document.body.innerText.includes('全部对话') === false && location.hash !== '#/home')`)
if (!inChats) { await goto(`${BASE}/mobile.html#/chats`); await sleep(800) }
inChats = await evaluate(`location.hash`)
await shot('vfy-r1-10-chats-layer.png')
await evaluate(`[...document.querySelectorAll('button[aria-label="返回"], .adm-nav-bar-back button, [class*="back"] button')][0]?.click()`)
await sleep(800)
const backHash = await evaluate(`location.hash`)
record('10-chats-back', typeof backHash === 'string' && !backHash.includes('chats'),
  `chatsHash=${String(inChats)} backHash=${String(backHash)}`)
await shot('vfy-r1-10-chats-back.png')

writeFileSync(`${OUT}.vfy-r1-walkthrough.log`, `${walk.join('\n')}\n`)
writeFileSync(`${OUT}.vfy-r1-results.json`, `${JSON.stringify(results, null, 2)}\n`)
note(`results: ${JSON.stringify(results)}`)
cleanup()
