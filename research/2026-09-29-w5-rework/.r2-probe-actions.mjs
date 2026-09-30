/**
 * W5-R2 probe (research artifact): drive headless Chrome over CDP as admin
 * and dump every candidate write-action surface (page buttons, row action
 * buttons, table headers) for the eight role-journey pages, so the R2
 * action legs can cite real channels instead of guesses.
 * Usage: node research/2026-09-29-w5-rework/.r2-probe-actions.mjs
 */
import { spawn } from 'node:child_process'
import { setTimeout as sleep } from 'node:timers/promises'

const PORT = 9337
const BASE = 'http://localhost:13000'
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'

const PAGES = [
  { name: 'MRP 快照', path: '/admin/w7mrpowj6l93nn0a' },
  { name: '主生产计划', path: '/admin/w7mrpyru4s708nwn' },
  { name: '报工记录', path: '/admin/w6mfglmxq9mhbkur' },
  { name: '质检单', path: '/admin/w8qmjvyv8p5j7j' },
  { name: '收货单', path: '/admin/h5wmsrh8ls7pkv5i' },
  { name: '销售订单', path: '/admin/w7mrp4w590rm0ws8' },
  { name: '付款申请', path: '/admin/w3pur3an4pwnr1eo' },
  { name: '生产订单', path: '/admin/w5mfgntyu7wy20a' },
]

const chromeProc = spawn(CHROME, [
  `--remote-debugging-port=${PORT}`, '--headless=new', '--no-first-run', '--no-default-browser-check',
  '--user-data-dir=/tmp/r2-probe-profile', '--window-size=1600,1000', '--disable-gpu', 'about:blank',
], { stdio: ['ignore', 'ignore', 'ignore'], detached: true })
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
await new Promise(resolve => (ws.onopen = resolve))
await send('Page.enable')
const evaluate = async (expression) => {
  const result = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })
  return result?.result?.value
}
const goto = async (url, waitText, timeoutMs = 30000) => {
  await send('Page.navigate', { url })
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    await sleep(800)
    if (waitText === null) continue
    if (await evaluate(`document.body.innerText.includes(${JSON.stringify(waitText)})`) === true) break
  }
  await sleep(1500)
}

try {
  // sign in as admin (the superset role; write surfaces are probed once)
  await goto(`${BASE}/signin`, '登录')
  await evaluate(`(() => {
    const inputs = [...document.querySelectorAll('input[type=text], input:not([type])')]
    const pass = [...document.querySelectorAll('input[type=password]')]
    const set = (el, v) => { const s = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; s.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true })) }
    set(inputs[0], 'admin@nocobase.com'); set(pass[0], 'admin123'); return true
  })()`)
  await evaluate(`[...document.querySelectorAll('button')].find(b => b.textContent.includes('登录'))?.click()`)
  await sleep(3500)

  for (const page of PAGES) {
    await goto(`${BASE}${page.path}`, null, 25000)
    const probe = await evaluate(`(() => {
      const uniq = (arr) => [...new Set(arr)]
      const buttons = uniq([...document.querySelectorAll('button')].map(b => b.textContent.trim()).filter(t => t && t.length < 16)).slice(0, 30)
      const firstRow = document.querySelector('.ant-table-tbody tr')
      const rowButtons = firstRow ? uniq([...firstRow.querySelectorAll('button')].map(b => b.textContent.trim()).filter(t => t)) : []
      const headers = [...document.querySelectorAll('.ant-table-thead th')].map(th => th.textContent.trim()).slice(0, 14)
      const links = uniq([...document.querySelectorAll('a')].map(a => a.textContent.trim()).filter(t => t && t.length < 12)).slice(0, 12)
      return { title: document.title, buttons, rowButtons, headers, links }
    })()`)
    console.log(`\n══ ${page.name} (${page.path}) ══`)
    console.log(JSON.stringify(probe, null, 1))
  }
} finally {
  try { process.kill(-chromeProc.pid, 'SIGTERM') } catch (error) {
    if (String(error?.code) !== 'ESRCH') chromeProc.kill('SIGKILL')
  }
}
