/**
 * W6-B10: verify the 预警列表 stat cards now render ABOVE the table —
 * headless shot + a DOM y-position probe (card block top < table top).
 * Output: w6-b10-05b-statcard-seated.png + w6-b10-05b-statcard-dom.log.
 */
import { spawn, execSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import { setTimeout as sleep } from 'node:timers/promises'

const OUT = new URL('.', import.meta.url).pathname
const PORT = 9351
const NC = 'http://localhost:13000'
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const chromeProc = spawn(CHROME, [
  `--remote-debugging-port=${PORT}`, '--headless=new', '--no-first-run', '--no-default-browser-check',
  '--user-data-dir=/tmp/w6b10-statcard-verify', '--window-size=1600,1000', '--disable-gpu', 'about:blank',
], { stdio: ['ignore', 'ignore', 'ignore'], detached: true })
chromeProc.unref()
let target = null
for (let i = 0; i < 20 && target === null; i++) {
  await sleep(1000)
  try { target = await (await fetch(`http://localhost:${PORT}/json/new?about:blank`, { method: 'PUT' })).json() } catch { }
}
const ws = new WebSocket(target.webSocketDebuggerUrl)
let seq = 0
const pending = new Map()
const send = (method, params = {}) => new Promise((resolve, reject) => {
  const id = ++seq; pending.set(id, { resolve, reject }); ws.send(JSON.stringify({ id, method, params }))
})
ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id != null && pending.has(m.id)) { const { resolve, reject } = pending.get(m.id); pending.delete(m.id); m.error ? reject(new Error(JSON.stringify(m.error))) : resolve(m.result) } }
await new Promise(r => (ws.onopen = r))
await send('Page.enable')
const evaluate = async (expression) => (await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }))?.result?.value

await send('Page.navigate', { url: `${NC}/signin` })
await sleep(6000)
await evaluate(`(() => {
  const inputs = [...document.querySelectorAll('input[type=text], input:not([type])')]
  const pass = [...document.querySelectorAll('input[type=password]')]
  if (inputs.length < 1 || pass.length < 1) return false
  const set = (el, v) => { const s = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; s.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true })) }
  set(inputs[0], 'admin@nocobase.com'); set(pass[0], 'admin123'); return true
})()`)
await evaluate(`[...document.querySelectorAll('button')].find(b => b.textContent.includes('登录'))?.click()`)
await sleep(5000)
await send('Page.navigate', { url: `${NC}/admin/w6b2dwgwk6zc3i` })
let ready = false
for (let i = 0; i < 30 && ready !== true; i++) {
  await sleep(1500)
  ready = await evaluate(`document.body.innerText.includes('待处理') && document.querySelectorAll('.ant-table-tbody tr').length > 0`)
}
await sleep(2000)
const probe = await evaluate(`(() => {
  const stats = [...document.querySelectorAll('.ant-statistic')]
  const cards = stats.length > 0 ? stats : [...document.querySelectorAll('*')].filter(el => (el.textContent ?? '').includes('待处理') && el.children.length === 0)
  const cardTop = cards.length > 0 ? Math.min(...cards.map(el => el.getBoundingClientRect().top)) : null
  const cardLefts = [...new Set(cards.map(el => Math.round(el.getBoundingClientRect().left)))]
  const table = document.querySelector('.ant-table')
  const tableTop = table ? table.getBoundingClientRect().top : null
  return { cards: cards.length, cardTop, cardColumns: cardLefts.length, tableTop, above: cardTop !== null && tableTop !== null && cardTop < tableTop }
})()`)
const shot = await send('Page.captureScreenshot', { format: 'png' })
execSync(`echo ${shot.data} | base64 -d > ${OUT}w6-b10-05b-statcard-seated.png`)
writeFileSync(`${OUT}w6-b10-05b-statcard-dom.log`, `w6-b10 statcard seating DOM probe — ${new Date().toISOString()}\n${JSON.stringify(probe, null, 2)}\nverdict: ${probe.above === true ? '统计卡位于表格上方（cardTop < tableTop）' : '统计卡仍不在表格上方'}\n`)
console.log('probe', JSON.stringify(probe))
process.kill(-chromeProc.pid, 'SIGTERM')
