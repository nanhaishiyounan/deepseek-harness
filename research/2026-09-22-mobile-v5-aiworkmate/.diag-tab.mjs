/** One-off diagnostic: why does clicking the 进行中 capsule tab not reveal the doing card. */
import { spawn } from 'node:child_process'
import { setTimeout as sleep } from 'node:timers/promises'

const PORT = 9336
const BASE = 'http://127.0.0.1:3080'
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const chrome = spawn(CHROME, [
  '--headless=new', `--remote-debugging-port=${String(PORT)}`,
  '--user-data-dir=/tmp/dsh-v5-diag', '--no-first-run', '--disable-gpu',
  '--window-size=420,900', 'about:blank',
], { stdio: 'ignore' })
process.on('exit', () => { try { chrome.kill() } catch { /* gone */ } })

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
      if (msg.error !== undefined) entry.reject(new Error(msg.error.message))
      else entry.resolve(msg.result)
      return
    }
    for (const handler of listeners.get(msg.method) ?? []) handler(msg.params)
  })
}
async function evaluate(expression) {
  const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
  if (result.exceptionDetails !== undefined) throw new Error(JSON.stringify(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text))
  return result.result.value
}
async function goto(url) {
  await send('Page.navigate', { url })
  await new Promise((resolve) => {
    const timer = setTimeout(resolve, 15000)
    on('Page.loadEventFired', () => { clearTimeout(timer); resolve() })
  })
  await sleep(700)
}

let tabs
for (let attempt = 0; ; attempt++) {
  try { tabs = await (await fetch(`http://127.0.0.1:${String(PORT)}/json/list`)).json(); break } catch (cause) {
    if (attempt > 30) throw cause
    await sleep(500)
  }
}
const page = tabs.find((tab) => tab.type === 'page')
await connect(page.webSocketDebuggerUrl)
await send('Page.enable')
await send('Runtime.enable')
await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true })

await goto(`${BASE}/mobile#/login`)
await evaluate(`(() => {
  const el = document.querySelector('input[inputmode="numeric"]')
  const proto = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set
  proto.call(el, '123456')
  el.dispatchEvent(new Event('input', { bubbles: true }))
  ;[...document.querySelectorAll('button')].find(b => b.textContent === '登录')?.click()
})()`)
await evaluate(`new Promise(r => { const t = setInterval(() => { if (document.body.innerText.includes('今日台账')) { clearInterval(t); r(true) } }, 300) })`)
await goto(`${BASE}/mobile#/work`)
await evaluate(`new Promise(r => { const t = setInterval(() => { if (document.body.innerText.includes('待处理')) { clearInterval(t); r(true) } }, 300) })`)
await sleep(500)

const before = await evaluate(`({
  tabs: [...document.querySelectorAll('.adm-capsule-tab')].map(el => ({ text: el.textContent, cls: el.className })),
  active: document.querySelector('.adm-capsule-tab-active')?.textContent,
  body: document.body.innerText.slice(0, 120),
})`)
console.log('BEFORE:', JSON.stringify(before, null, 1))

const clicked = await evaluate(`(() => {
  const el = [...document.querySelectorAll('.adm-capsule-tab')].find(b => (b.textContent ?? '').includes('进行中'))
  if (el === undefined) return 'no-tab'
  el.click()
  return 'clicked'
})()`)
console.log('CLICK:', clicked)
await sleep(1200)
const after = await evaluate(`({
  active: document.querySelector('.adm-capsule-tab-active')?.textContent,
  body: document.body.innerText.slice(0, 300),
  paneCount: document.querySelectorAll('[class*="capsule-tabs"]').length,
})`)
console.log('AFTER:', JSON.stringify(after, null, 1))
chrome.kill()
process.exit(0)
