/**
 * One-shot computed-style probe for the v6 tab bar (research artifact).
 * Usage: node research/2026-09-23-mobile-v6-uidesign/.probe.mjs
 */
import { spawn } from 'node:child_process'
import { setTimeout as sleep } from 'node:timers/promises'

const BASE = 'http://127.0.0.1:3080'
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const PORT = 9338

const chrome = spawn(CHROME, [
  '--headless=new',
  `--remote-debugging-port=${String(PORT)}`,
  '--user-data-dir=/tmp/dsh-v6-b1-probe-profile',
  '--no-first-run',
  '--disable-gpu',
  'about:blank',
], { stdio: 'ignore' })
process.on('exit', () => { try { chrome.kill() } catch { /* already gone */ } })

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
  if (result.exceptionDetails !== undefined) {
    throw new Error(`eval failed: ${JSON.stringify(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text)}`)
  }
  return result.result.value
}

async function waitFor(expression, { timeout = 30000, interval = 400 } = {}) {
  const deadline = Date.now() + timeout
  for (;;) {
    if (await evaluate(expression) === true) return
    if (Date.now() > deadline) throw new Error(`timeout: ${expression}`)
    await sleep(interval)
  }
}

let tabs
for (let attempt = 0; ; attempt++) {
  try {
    tabs = await (await fetch(`http://127.0.0.1:${String(PORT)}/json/list`)).json()
    break
  } catch (cause) {
    if (attempt > 30) throw cause
    await sleep(500)
  }
}
ws = new WebSocket(tabs.find(tab => tab.type === 'page').webSocketDebuggerUrl)
await new Promise((resolve) => { ws.addEventListener('open', resolve, { once: true }) })
ws.addEventListener('message', (event) => {
  const msg = JSON.parse(event.data)
  if (msg.id === undefined) return
  const entry = pending.get(msg.id)
  if (entry === undefined) return
  pending.delete(msg.id)
  if (msg.error !== undefined) entry.reject(new Error(msg.error.message))
  else entry.resolve(msg.result)
})
await send('Page.enable')
await send('Runtime.enable')
await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true })
await send('Page.navigate', { url: `${BASE}/mobile.html` })
await sleep(2500)

// Reset any identity a previous probe run left in this profile, then log in
// through the demo card.
await evaluate(`localStorage.clear()`)
await evaluate(`location.reload()`)
await sleep(2000)
await waitFor(`document.querySelector('input[inputmode="numeric"]') !== null`)
await evaluate(`(() => {
  const input = document.querySelector('input[inputmode="numeric"]')
  const proto = HTMLInputElement.prototype
  Object.getOwnPropertyDescriptor(proto, 'value').set.call(input, '123456')
  input.dispatchEvent(new Event('input', { bubbles: true }))
})()`)
await evaluate(`[...document.querySelectorAll('button')].find(b => b.textContent === '登录')?.click()`)
await sleep(2500)

for (const theme of ['light', 'dark']) {
  await evaluate(`localStorage.setItem('dsh-mobile-theme', ${JSON.stringify(theme)})`)
  await evaluate(`localStorage.setItem('dsh-mobile-runmode', 'demo')`)
  await evaluate(`location.reload()`)
  await sleep(2500)
  const metrics = await evaluate(`(() => {
    const nav = document.querySelector('nav[aria-label="底部导航"]')
    if (nav === null) return null
    const bar = nav.querySelector('.adm-tab-bar')
    const active = nav.querySelector('.adm-tab-bar-item-active .adm-tab-bar-item-title')
    const icon = nav.querySelector('.adm-tab-bar-item-icon svg')
    const labels = [...nav.querySelectorAll('.adm-tab-bar-item-title')].map(el => el.textContent)
    const cs = getComputedStyle(nav)
    const item = nav.querySelector('.adm-tab-bar-item')
    return {
      labels,
      barHeight: getComputedStyle(bar).height,
      navBg: cs.backgroundColor,
      navBorderTop: cs.borderTopWidth + ' ' + cs.borderTopColor,
      activeColor: getComputedStyle(active).color,
      labelFont: getComputedStyle(active).fontSize + ' / w' + getComputedStyle(active).fontWeight,
      iconBox: icon === null ? null : getComputedStyle(icon).width + ' x ' + getComputedStyle(icon).height,
      iconStroke: icon === null ? null : icon.getAttribute('stroke-width'),
      itemColor: getComputedStyle(item).color,
    }
  })()`)
  console.log(`[${theme}] ${JSON.stringify(metrics)}`)
}
chrome.kill()
process.exit(0)
