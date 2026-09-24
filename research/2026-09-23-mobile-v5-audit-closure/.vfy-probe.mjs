#!/usr/bin/env node
/** Quick probe: what does the login page look like right now? */
import { spawn } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import { setTimeout as sleep } from 'node:timers/promises'

const PORT = 9342
const BASE = 'http://localhost:3080'
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const OUT = 'research/2026-09-23-mobile-v5-audit-closure/'

const chrome = spawn(CHROME, [
  '--headless=new', `--remote-debugging-port=${String(PORT)}`,
  '--user-data-dir=/tmp/dsh-vfy-probe', '--no-first-run', '--disable-gpu',
  '--window-size=430,900', 'about:blank',
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
  if (result.exceptionDetails !== undefined) throw new Error(JSON.stringify(result.exceptionDetails))
  return result.result.value
}

let tabs
for (let attempt = 0; ; attempt++) {
  try { tabs = await (await fetch(`http://127.0.0.1:${String(PORT)}/json/list`)).json(); break }
  catch (cause) { if (attempt > 40) throw cause; await sleep(500) }
}
ws = new WebSocket(tabs.find((t) => t.type === 'page').webSocketDebuggerUrl)
await new Promise((resolve) => { ws.addEventListener('open', resolve, { once: true }) })
ws.addEventListener('message', (event) => {
  const msg = JSON.parse(event.data)
  if (msg.id !== undefined) {
    const entry = pending.get(msg.id)
    if (entry !== undefined) { pending.delete(msg.id); msg.error !== undefined ? entry.reject(new Error(msg.error.message)) : entry.resolve(msg.result) }
  }
})
await send('Page.enable')
await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 3, mobile: true })

await send('Page.navigate', { url: `${BASE}/mobile.html` })
await sleep(3000)
console.log('--- inputs ---')
console.log(await evaluate(`[...document.querySelectorAll('input')].map(i => ({ mode: i.inputMode, placeholder: i.placeholder, value: i.value, type: i.type }))`))
console.log('--- buttons ---')
console.log(await evaluate(`[...document.querySelectorAll('button')].map(b => b.textContent)`))
console.log('--- text head ---')
console.log(await evaluate(`document.body.innerText.slice(0, 400)`))
const shot = await send('Page.captureScreenshot', { format: 'png' })
writeFileSync(`${OUT}vfy-ac-00-login-probe.png`, Buffer.from(shot.data, 'base64'))
console.log('saved vfy-ac-00-login-probe.png')
chrome.kill()
process.exit(0)
