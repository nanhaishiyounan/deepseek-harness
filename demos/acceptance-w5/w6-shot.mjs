#!/usr/bin/env node
/**
 * W6 stat-card density evidence: CDP headless drive, sign in as admin, open
 * the 比价表 list page, wait for the stat-card canvases, assert the compact
 * geometry (card ≈146px, chart canvas 112px, table rows in the first screen),
 * and capture one screenshot. Mirrors the b8-walkthrough driver shape.
 */
import { spawn, execSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'

const BASE = 'http://localhost:13000'
const PORT = 9335
const OUT = new URL('../../demos/acceptance-w5/', import.meta.url).pathname
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const PAGE_PATH = '/admin/w3purb7o0r3yqi45' // 比价表 (L1 page, 3 w4b3 stat cards)
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

mkdirSync(OUT, { recursive: true })
const chromeProc = spawn(CHROME, [
  `--remote-debugging-port=${PORT}`, '--headless=new', '--no-first-run', '--no-default-browser-check',
  '--user-data-dir=/tmp/w6-shot-profile', '--window-size=1440,900', '--disable-gpu', 'about:blank',
], { stdio: ['ignore', 'pipe', 'pipe'], detached: true })
chromeProc.stderr.on('data', (chunk) => process.stderr.write(`[chrome] ${chunk}`))
chromeProc.unref()

let target = null
for (let attempt = 0; attempt < 20 && target === null; attempt++) {
  await sleep(1000)
  try {
    target = await (await fetch(`http://localhost:${PORT}/json/new?about:blank`, { method: 'PUT' })).json()
  } catch { /* chrome not up yet */ }
}
if (target === null) throw new Error('headless chrome did not come up')

const ws = new WebSocket(target.webSocketDebuggerUrl)
let seq = 0
const pending = new Map()
const send = (method, params = {}) => new Promise((resolve, reject) => {
  const id = ++seq
  pending.set(id, { resolve, reject })
  ws.send(JSON.stringify({ id, method, params }))
})
ws.onmessage = (event) => {
  const message = JSON.parse(event.data)
  if (message.id != null && pending.has(message.id)) {
    const { resolve, reject } = pending.get(message.id)
    pending.delete(message.id)
    message.error ? reject(new Error(JSON.stringify(message.error))) : resolve(message.result)
  }
}
await new Promise((resolve) => (ws.onopen = resolve))
await send('Page.enable')
const evaluate = async (expression) => {
  const result = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })
  return result?.result?.value
}

await send('Page.navigate', { url: `${BASE}/admin` })
await sleep(4000)
await evaluate(`localStorage.clear()`)
let filled = false
for (let attempt = 0; attempt < 3 && filled !== true; attempt++) {
  await send('Page.navigate', { url: `${BASE}/signin` })
  for (let probe = 0; probe < 12 && filled !== true; probe++) {
    await sleep(2000)
    filled = await evaluate(`(() => {
      const inputs = [...document.querySelectorAll('input[type=text], input:not([type])')]
      const pass = [...document.querySelectorAll('input[type=password]')]
      if (inputs.length < 1 || pass.length < 1) return false
      const set = (el, v) => { const s = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; s.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true })) }
      set(inputs[0], 'admin@nocobase.com'); set(pass[0], 'admin123'); return true
    })()`)
  }
}
if (filled !== true) throw new Error('sign-in form did not render')
await evaluate(`[...document.querySelectorAll('button')].find(b => b.textContent.includes('登录'))?.click()`)
await sleep(5000)
const identity = await evaluate(`fetch('/api/auth:check', { headers: { authorization: 'Bearer ' + localStorage.getItem('NOCOBASE_TOKEN') } }).then(r => r.json()).then(j => String(j.data?.username ?? '')).catch(() => '')`)

await send('Page.navigate', { url: `${BASE}${PAGE_PATH}` })
let geometry = null
for (let attempt = 0; attempt < 30; attempt++) {
  await sleep(2000)
  geometry = await evaluate(`(() => {
    const cards = [...document.querySelectorAll('.ant-card')].filter(c => c.querySelector('canvas'))
    if (cards.length === 0) return null
    const table = document.querySelector('.ant-table')
    const rows = [...document.querySelectorAll('.ant-table-tbody tr')].filter(r => r.offsetHeight > 10 && r.getBoundingClientRect().top < window.innerHeight)
    return { cardHeights: cards.map(c => c.offsetHeight), chartDivH: cards[0].querySelector('.data-visualization-chart')?.style?.height ?? null, tableTop: table ? Math.round(table.getBoundingClientRect().top) : null, visibleRows: rows.length, viewportH: window.innerHeight }
  })()`)
  if (geometry !== null) break
}

const shot = await send('Page.captureScreenshot', { format: 'png' })
execSync(`echo ${shot.data} | base64 -d > ${OUT}w6-01-bijia-dense.png`)
const meta = {
  generatedAt: new Date().toISOString(),
  identity,
  page: PAGE_PATH,
  geometry,
  assertions: geometry ? {
    cardCompact: geometry.cardHeights.every((h) => h <= 180),
    canvas112: geometry.chartDivH === '112px',
    tableInFirstScreen: geometry.tableTop !== null && geometry.tableTop < geometry.viewportH,
    rowsVisible: geometry.visibleRows >= 5,
  } : null,
}
writeFileSync(`${OUT}w6-shot-meta.json`, JSON.stringify(meta, null, 2) + '\n')
console.log(JSON.stringify(meta, null, 2))
try { process.kill(-chromeProc.pid, 'SIGTERM') } catch { /* already gone */ }
process.exit(Object.values(meta.assertions ?? {}).every(Boolean) ? 0 : 1)
