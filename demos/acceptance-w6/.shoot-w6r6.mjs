#!/usr/bin/env node
/**
 * W6-R6 evidence 03: keeper (member role) opens the 预警列表 page — capture
 * every 4xx network response (the "No permissions" toast + the four empty
 * "请配置图表" stat cards seen in vfy-w6b10-s2-r5). Headed Chrome (the B2
 * headless-canvas trap), CDP Network capture, screenshot before any fix.
 * Output: w6-r6-03-member-charts-before.png + stdout probe lines.
 */
import { spawn, execSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const NC = 'http://localhost:13000'
const PORT = 9361
const OUT = new URL('./', import.meta.url).pathname
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const ALERTS_PAGE = '/admin/w6b2dwgwk6zc3i'
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

const chromeProc = spawn(CHROME, [
  `--remote-debugging-port=${PORT}`, '--no-first-run', '--no-default-browser-check',
  '--user-data-dir=/tmp/w6-r6-profile', '--window-size=1440,900', 'about:blank',
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
const responses = new Map() // requestId -> {url, status}
const served = []
ws.onmessage = (event) => {
  const message = JSON.parse(event.data)
  if (message.id != null && pending.has(message.id)) {
    const { resolve, reject } = pending.get(message.id)
    pending.delete(message.id)
    message.error ? reject(new Error(JSON.stringify(message.error))) : resolve(message.result)
  } else if (message.method === 'Network.responseReceived') {
    responses.set(message.params.requestId, { url: message.params.response.url, status: message.params.response.status })
  }
}
await new Promise((resolve) => (ws.onopen = resolve))
await send('Page.enable')
await send('Network.enable')
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
    set(inputs[0], 'keeper'); set(pass[0], 'Keeper#2026'); return true
  })()`)
}
if (filled !== true) throw new Error('sign-in form did not render')
await evaluate(`[...document.querySelectorAll('button')].find(b => b.textContent.includes('登录'))?.click()`)
await sleep(6000)
const identity = await evaluate(`fetch('/api/auth:check', { headers: { authorization: 'Bearer ' + localStorage.getItem('NOCOBASE_TOKEN') } }).then(r => r.json()).then(j => String(j.data?.username ?? '')).catch(() => '')`)
console.log(`w6-r6-03: keeper identity=${identity}`)

await send('Page.navigate', { url: `${NC}${ALERTS_PAGE}` })
let cards = 0
let emptyCards = 0
for (let attempt = 0; attempt < 45 && emptyCards < 4 && attempt < 44; attempt++) {
  await sleep(2000)
  cards = await evaluate(`[...document.querySelectorAll('.ant-card canvas')].filter(c => c.width > 0).length`)
  emptyCards = await evaluate(`[...document.querySelectorAll('.ant-card')].filter(c => c.textContent.includes('请配置图表')).length`)
}
const rows = await evaluate(`[...document.querySelectorAll('.ant-table-tbody tr')].filter(r => r.offsetHeight > 10).length`)
const noPerm = await evaluate(`document.body.textContent.includes('No permissions')`)
const captured = await send('Page.captureScreenshot', { format: 'png' })
execSync(`echo ${captured.data} | base64 -d > ${OUT}w6-r6-03-member-charts-before.png`)
console.log(`w6-r6-03: stat-card canvases=${String(cards)} emptyCards(请配置图表)=${String(emptyCards)} tableRows=${String(rows)} NoPermissionsToast=${String(noPerm)}`)
for (const [, entry] of responses) {
  if (entry.status >= 400) served.push(`${String(entry.status)} ${entry.url.replace(NC, '')}`)
}
const uniq = [...new Set(served)]
console.log(`w6-r6-03: 4xx responses (${String(uniq.length)} uniq):`)
for (const line of uniq) console.log(`  ${line}`)
console.log('w6-r6-03: w6-r6-03-member-charts-before.png written')
execSync(`pkill -f "remote-debugging-port=${PORT}" || true`)
process.exit(0)
