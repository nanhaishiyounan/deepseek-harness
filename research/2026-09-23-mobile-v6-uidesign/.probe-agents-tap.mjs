/** One-off probe: tap an agents roster row and sample hash/disabled over time. */
import { spawn } from 'node:child_process'
import { setTimeout as sleep } from 'node:timers/promises'

const BASE = 'http://127.0.0.1:3080'
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const PORT = 9348

const chrome = spawn(CHROME, [
  '--headless=new', `--remote-debugging-port=${String(PORT)}`,
  '--user-data-dir=/tmp/dsh-vfy-probe-profile', '--no-first-run', '--disable-gpu',
  '--window-size=420,900', 'about:blank',
], { stdio: 'ignore' })
process.on('exit', () => { try { chrome.kill() } catch { /* gone */ } })

let seq = 0
let ws
const pending = new Map()
function send(method, params = {}) {
  const id = ++seq
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject })
    ws.send(JSON.stringify({ id, method, params }))
  })
}
async function evaluate(expression) {
  const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
  return result.result.value
}

let tabs = []
for (let attempt = 0; attempt < 40; attempt++) {
  try { tabs = await (await fetch(`http://127.0.0.1:${String(PORT)}/json/list`)).json(); break }
  catch { if (attempt > 30) throw new Error('chrome not up'); await sleep(500) }
}
ws = new WebSocket(tabs.find(t => t.type === 'page').webSocketDebuggerUrl)
await new Promise((resolve, reject) => { ws.addEventListener('open', resolve, { once: true }); ws.addEventListener('error', reject, { once: true }) })
ws.addEventListener('message', (event) => {
  const msg = JSON.parse(event.data)
  if (msg.id !== undefined) {
    const entry = pending.get(msg.id)
    if (entry === undefined) return
    pending.delete(msg.id)
    if (msg.error !== undefined) entry.reject(new Error(msg.error.message))
    else entry.resolve(msg.result)
  }
})
await send('Page.enable')
await send('Runtime.enable')
await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true })

await send('Page.navigate', { url: `${BASE}/mobile.html#/agents` })
await sleep(2500)
console.log('hash:', await evaluate('location.hash'))
console.log('rows:', await evaluate(`[...document.querySelectorAll('button[aria-label^="找 "]')].length`))
console.log('has 智能填表助手:', await evaluate(`document.body.innerText.includes('智能填表助手')`))
// Tap the row whose aria-label names 智能填表助手, then sample.
const tap = await evaluate(`(() => {
  const row = [...document.querySelectorAll('button[aria-label^="找 "]')].find(b => (b.getAttribute('aria-label') ?? '').includes('智能填表助手'))
  if (row === undefined) return { tapped: false }
  row.click()
  return { tapped: true, label: row.getAttribute('aria-label') }
})()`)
console.log('tap:', JSON.stringify(tap))
for (const delay of [80, 200, 400, 800, 1500, 3000]) {
  await sleep(delay === 80 ? 80 : delay - [80, 200, 400, 800, 1500, 3000][[80, 200, 400, 800, 1500, 3000].indexOf(delay) - 1])
  const sample = await evaluate(`(() => {
    const rows = [...document.querySelectorAll('button[aria-label^="找 "]')]
    return { hash: location.hash, count: rows.length, disabled: rows.map(b => b.disabled), creating: document.body.innerText.includes('创建中') }
  })()`)
  console.log(`t+${String(delay)}ms:`, JSON.stringify(sample))
}
try { chrome.kill() } catch { /* gone */ }
