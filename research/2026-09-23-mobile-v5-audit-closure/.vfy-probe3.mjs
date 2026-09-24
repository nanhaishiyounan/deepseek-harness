#!/usr/bin/env node
/** Probe 3: inspect #/chats DOM to find how a session row is entered. */
import { spawn } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import { setTimeout as sleep } from 'node:timers/promises'

const PORT = 9344
const BASE = 'http://localhost:3080'
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const OUT = 'research/2026-09-23-mobile-v5-audit-closure/'

const chrome = spawn(CHROME, [
  '--headless=new', `--remote-debugging-port=${String(PORT)}`,
  '--user-data-dir=/tmp/dsh-vfy-probe3', '--no-first-run', '--disable-gpu',
  '--window-size=430,900', 'about:blank',
], { stdio: 'ignore' })
process.on('exit', () => { try { chrome.kill() } catch { /* gone */ } })

let seq = 0
let ws
const pending = new Map()
function send(method, params = {}) {
  const id = ++seq
  return new Promise((resolve, reject) => { pending.set(id, { resolve, reject }); ws.send(JSON.stringify({ id, method, params })) })
}
async function evaluate(expression) {
  const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
  if (result.exceptionDetails !== undefined) throw new Error(JSON.stringify(result.exceptionDetails.exception?.description ?? ''))
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
await sleep(2500)
await evaluate(`(() => {
  const el = document.querySelector('input[placeholder*="验证码"], input[inputmode="numeric"]')
  if (el !== null) {
    const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype
    Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, '123456')
    el.dispatchEvent(new Event('input', { bubbles: true }))
  }
  return true
})()`)
await evaluate(`[...document.querySelectorAll('button')].find(b => b.textContent === '登录')?.click()`)
await sleep(4000)
await send('Page.navigate', { url: `${BASE}/mobile.html#/chats` })
await sleep(3500)
console.log('hash:', await evaluate('location.hash'))
console.log('--- text ---')
console.log(await evaluate(`document.body.innerText.slice(0, 500)`))
console.log('--- clickable candidates ---')
console.log(await evaluate(`(() => {
  const out = []
  for (const sel of ['a[href*="#/chat/"]', 'li', '[class*="row"]', '[class*="Row"]', '[data-testid]']) {
    out.push(sel + ' => ' + document.querySelectorAll(sel).length)
  }
  return out.join(' ; ')
})()`)
)
console.log('--- first li html ---')
console.log(await evaluate(`document.querySelector('li')?.outerHTML.slice(0, 300) ?? 'no li'`))
const shot = await send('Page.captureScreenshot', { format: 'png' })
writeFileSync(`${OUT}vfy-ac-00c-chats-probe.png`, Buffer.from(shot.data, 'base64'))
console.log('saved vfy-ac-00c-chats-probe.png')
chrome.kill()
process.exit(0)
