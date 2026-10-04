#!/usr/bin/env node
/**
 * W6-R2 evidence 07: one DESKTOP-valid screenshot of the PC alert center —
 * an interactive (non-headless) chrome window, where the ECharts stat cards
 * mount (the headless canvas trap the B2 note pinned), admin-signed-in at
 * NocoBase :13000, after the R2 claim smoke (keeper's acknowledged row on
 * screen). Output: demos/acceptance-w6/w6-r2-07-pc-alert-center-desktop.png.
 */
import { spawn, execSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const NC = 'http://localhost:13000'
const PORT = 9347
const OUT = new URL('./', import.meta.url).pathname
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const ALERTS_PAGE = '/admin/w6b2dwgwk6zc3i'
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

const chromeProc = spawn(CHROME, [
  `--remote-debugging-port=${PORT}`, '--no-first-run', '--no-default-browser-check',
  '--user-data-dir=/tmp/w6-r2-desktop-profile', '--window-size=1440,900', 'about:blank',
], { stdio: ['ignore', 'pipe', 'pipe'], detached: true })
chromeProc.unref()

let target0 = null
for (let attempt = 0; attempt < 20 && target0 === null; attempt++) {
  await sleep(1000)
  try { target0 = await (await fetch(`http://localhost:${PORT}/json/new?about:blank`, { method: 'PUT' })).json() } catch { /* not up yet */ }
}
if (target0 === null) throw new Error('interactive chrome did not come up')
const ws = new WebSocket(target0.webSocketDebuggerUrl)
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
await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 2, mobile: false })
const evaluate = async (expression) => (await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }))?.result?.value

await send('Page.navigate', { url: `${NC}/signin` })
let filled = false
for (let probe = 0; probe < 15 && filled !== true; probe++) {
  await sleep(2000)
  filled = await evaluate(`(() => {
    const inputs = [...document.querySelectorAll('input[type=text], input:not([type])')]
    const pass = [...document.querySelectorAll('input[type=password]')]
    if (inputs.length < 1 || pass.length < 1) return false
    const set = (el, v) => { const s = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; s.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true })) }
    set(inputs[0], 'admin@nocobase.com'); set(pass[0], 'admin123'); return true
  })()`)
}
if (filled !== true) throw new Error('sign-in form did not render')
await evaluate(`[...document.querySelectorAll('button')].find(b => b.textContent.includes('登录'))?.click()`)
await sleep(6000)
const identity = await evaluate(`fetch('/api/auth:check', { headers: { authorization: 'Bearer ' + localStorage.getItem('NOCOBASE_TOKEN') } }).then(r => r.json()).then(j => String(j.data?.username ?? '')).catch(() => '')`)
console.log(`w6-r2-07: PC admin identity=${identity}`)

await send('Page.navigate', { url: `${NC}${ALERTS_PAGE}` })
let canvases = 0
for (let attempt = 0; attempt < 45 && canvases < 4; attempt++) {
  await sleep(2000)
  await evaluate(`(() => {
    let el = document.querySelector('.ant-table')
    while (el !== null && el.scrollHeight <= el.clientHeight + 50) el = el.parentElement
    if (el !== null) el.scrollTop = el.scrollHeight
    else window.scrollTo(0, document.body.scrollHeight)
  })()`)
  canvases = await evaluate(`[...document.querySelectorAll('.ant-card canvas')].filter(c => c.width > 0).length`)
}
await evaluate(`window.scrollTo(0, 0)`)
const rows = await evaluate(`[...document.querySelectorAll('.ant-table-tbody tr')].filter(r => r.offsetHeight > 10).length`)
const keeperSeen = await evaluate(`document.body.textContent.includes('keeper') && document.body.textContent.includes('已认领')`)
console.log(`w6-r2-07: stat-card canvases=${String(canvases)} tableRows=${String(rows)} keeper回显=${String(keeperSeen)}`)
const captured = await send('Page.captureScreenshot', { format: 'png' })
execSync(`echo ${captured.data} | base64 -d > ${OUT}w6-r2-07-pc-alert-center-desktop.png`)
console.log('w6-r2-07: w6-r2-07-pc-alert-center-desktop.png written')
execSync(`pkill -f "remote-debugging-port=${PORT}" || true`)
process.exit(0)
