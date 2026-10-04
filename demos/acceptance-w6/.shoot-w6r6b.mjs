#!/usr/bin/env node
/**
 * W6-R6 evidence 04: two UX-fix screenshots. (a) admin opens 预警规则 — the
 * enabled column now renders 是/否 Tag chips (was eight blank text cells);
 * (b) the mobile login at an empty submit — the 请输入账号和密码 toast (was
 * a silent disabled button). Headed Chrome + CDP (the stat-card canvas trap
 * does not apply but the shape stays the round's). Outputs: w6-r6-04a/b pngs.
 */
import { spawn, execSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const NC = 'http://localhost:13000'
const WEB = 'http://127.0.0.1:3080'
const PORT = 9362
const OUT = new URL('./', import.meta.url).pathname
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const RULES_PAGE = '/admin/w6b2rdacw363qjf7'
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

const chromeProc = spawn(CHROME, [
  `--remote-debugging-port=${PORT}`, '--no-first-run', '--no-default-browser-check',
  '--user-data-dir=/tmp/w6-r6-profile2', '--window-size=1440,900', 'about:blank',
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
const evaluate = async (expression) => (await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }))?.result?.value
const shot = async (file) => {
  const captured = await send('Page.captureScreenshot', { format: 'png' })
  execSync(`echo ${captured.data} | base64 -d > ${OUT}${file}`)
  console.log(`w6-r6-04: ${file} written`)
}
const setViewport = async (width, height, mobile) => send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 2, mobile })

// ── leg a: the rules page enabled column (admin) ──
await setViewport(1440, 900, false)
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
await send('Page.navigate', { url: `${NC}${RULES_PAGE}` })
let yesNo = 0
let blankCells = 0
for (let attempt = 0; attempt < 30 && yesNo < 8; attempt++) {
  await sleep(2000)
  yesNo = await evaluate(`[...document.querySelectorAll('.ant-table-tbody .ant-tag')].filter(t => t.textContent.trim() === '是' || t.textContent.trim() === '否').length`)
}
const rows = await evaluate(`[...document.querySelectorAll('.ant-table-tbody tr')].filter(r => r.offsetHeight > 10).length`)
blankCells = await evaluate(`(() => { const cols = [...document.querySelectorAll('.ant-table-thead th')]; const idx = cols.findIndex(th => th.textContent.includes('启用')); if (idx < 0) return -1; return [...document.querySelectorAll('.ant-table-tbody tr')].filter(r => r.offsetHeight > 10).filter(r => (r.children[idx]?.textContent ?? '').trim() === '').length })()`)
await shot('w6-r6-04a-rules-enabled-yesno.png')
console.log(`w6-r6-04a: rules rows=${String(rows)} 是/否Tag=${String(yesNo)} 启用列空白格=${String(blankCells)}`)

// ── leg b: the mobile empty-submit toast ──
await setViewport(375, 812, true)
await send('Page.navigate', { url: `${WEB}/mobile.html#/login` })
let loginBtn = null
for (let probe = 0; probe < 20 && loginBtn == null; probe++) {
  await sleep(1500)
  loginBtn = await evaluate(`(() => { const btn = [...document.querySelectorAll('button')].find(b => b.textContent.includes('登录')); return btn === undefined ? null : { disabled: btn.disabled } })()`)
}
if (loginBtn == null) throw new Error('mobile login button did not render')
await evaluate(`[...document.querySelectorAll('button')].find(b => b.textContent.includes('登录'))?.click()`)
let toastText = ''
for (let probe = 0; probe < 10 && toastText === ''; probe++) {
  await sleep(700)
  toastText = await evaluate(`(() => { const toast = document.querySelector('.adm-toast-wrap'); return toast === null ? '' : toast.textContent })()`)
}
await shot('w6-r6-04b-mobile-empty-toast.png')
console.log(`w6-r6-04b: empty-submit button disabled=${String(loginBtn.disabled)} toast="${toastText}"`)
execSync(`pkill -f "remote-debugging-port=${PORT}" || true`)
process.exit(0)
