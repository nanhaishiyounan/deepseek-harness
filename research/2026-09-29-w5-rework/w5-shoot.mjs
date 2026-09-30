/**
 * W5 B6/B7 acceptance screenshot driver (research artifact, not product code).
 * Drives a headless Chrome over CDP against the running NocoBase :13000,
 * signs in, and captures the B6/B7 acceptance frames: the themed list pages
 * across domains (palette + right-aligned money + collapsed filter bar) and
 * the three-tab document drawers (header facts / approval timeline /
 * connections). PNGs land in demos/acceptance-w5/ with b6-/b7- prefixes.
 *
 * Usage: node research/2026-09-29-w5-rework/w5-shoot.mjs
 */
import { spawn, execSync } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import { setTimeout as sleep } from 'node:timers/promises'

const OUT = new URL('../../demos/acceptance-w5/', import.meta.url).pathname
const PORT = 9335
const BASE = 'http://localhost:13000'
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'

mkdirSync(OUT, { recursive: true })
const chromeProc = spawn(CHROME, [
  `--remote-debugging-port=${PORT}`, '--headless=new', '--no-first-run', '--no-default-browser-check',
  '--user-data-dir=/tmp/w5-shoot-profile', '--window-size=1600,1000', '--disable-gpu', 'about:blank',
], { stdio: ['ignore', 'pipe', 'pipe'], detached: true })
chromeProc.stderr.on('data', chunk => process.stderr.write(`[chrome] ${chunk}`))
chromeProc.unref()
let target = null
for (let attempt = 0; attempt < 20 && target === null; attempt++) {
  await sleep(1000)
  try {
    const created = await (await fetch(`http://localhost:${PORT}/json/new?about:blank`, { method: 'PUT' })).json()
    target = created
  } catch { /* chrome not up yet */ }
}
if (target === null) throw new Error('headless chrome did not come up on port ' + PORT)

// minimal CDP client
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
await new Promise(resolve => (ws.onopen = resolve))
await send('Page.enable')
await send('Runtime.enable')
const evaluate = async (expression) => {
  const result = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })
  return result?.result?.value
}
const goto = async (url, waitText = null, timeoutMs = 45000) => {
  await send('Page.navigate', { url })
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    await sleep(800)
    if (waitText === null) continue
    const hit = await evaluate(`document.body.innerText.includes(${JSON.stringify(waitText)})`)
    if (hit === true) break
  }
  await sleep(1200)
}
const shot = async (name) => {
  await send('Page.captureScreenshot', { format: 'png' }).then(result => {
    execSync(`echo ${result.data} | base64 -d > ${OUT}${name}.png`)
  })
  console.log('shot', name)
}

// sign in
await goto(`${BASE}/signin`, '登录')
await evaluate(`(() => {
  const inputs = [...document.querySelectorAll('input')]
  const set = (el, v) => { const s = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; s.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true })) }
  set(inputs[0], 'admin@nocobase.com'); set(inputs[1], 'admin123')
})()`)
await evaluate(`[...document.querySelectorAll('button')].find(b => b.textContent.includes('登录'))?.click()`)
await sleep(3000)

// B6: themed list pages across domains (palette + right-align + collapsed filter)
const listPages = [
  ['b6-01-pur-orders', '/admin/w3puryzkva06iuhh', 'PO-2026-0003'],
  ['b6-02-so-orders', '/admin/w7mrp4w590rm0ws8', '订单'],
  ['b6-03-mfg-orders', '/admin/w5mfgntyu7wy20a', '工单'],
  ['b6-04-qm-inspections', '/admin/w8qmjvyv8p5j7j', '检验'],
  ['b6-05-wms-receipts', '/admin/h5wmsrh8ls7pkv5i', '收货'],
  ['b6-06-pur-payments', '/admin/w3pur3an4pwnr1eo', '付款'],
]
for (const [name, path, waitText] of listPages) {
  await goto(`${BASE}${path}`, waitText)
  await shot(name)
}

// B7: the three-tab PO drawer (filterbytk=3 = PO-2026-0003, 3 timeline records)
await goto(`${BASE}/admin/w3puryzkva06iuhh`, 'PO-2026-0003')
await evaluate(`(() => {
  const row = [...document.querySelectorAll('.ant-table-tbody tr')].find(tr => tr.innerText.includes('PO-2026-0003'))
  ;[...row.querySelectorAll('button')].find(b => b.textContent.trim() === '查看')?.click()
})()`)
await sleep(3500)
await shot('b7-01-po-header-facts')
await evaluate(`[...document.querySelectorAll('[role="tab"]')].find(t => t.textContent.includes('审批记录'))?.click()`)
await sleep(2800)
await shot('b7-02-po-timeline')
await evaluate(`[...document.querySelectorAll('[role="tab"]')].find(t => t.textContent.includes('关联单据'))?.click()`)
await sleep(2800)
await shot('b7-03-po-connections')

// B7: the countersign-heavy SO drawer (so_orders/8 — 18 records per psql)
await goto(`${BASE}/admin/w7mrp4w590rm0ws8`, '订单')
const soClicked = await evaluate(`(() => {
  const rows = [...document.querySelectorAll('.ant-table-tbody tr')]
  const row = rows.find(tr => tr.querySelectorAll('td').length > 3)
  if (!row) return false
  const btn = [...row.querySelectorAll('button')].find(b => b.textContent.trim() === '查看')
  if (!btn) return false
  btn.click(); return true
})()`)
if (soClicked === true) {
  await sleep(3500)
  await evaluate(`[...document.querySelectorAll('[role="tab"]')].find(t => t.textContent.includes('审批记录'))?.click()`)
  await sleep(2800)
  await shot('b7-04-so-timeline')
}

console.log('done ->', OUT)
ws.close()
process.exit(0)
