#!/usr/bin/env node
/** Probe 2: walk the login and report every step. */
import { spawn } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import { setTimeout as sleep } from 'node:timers/promises'

const PORT = 9343
const BASE = 'http://localhost:3080'
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const OUT = 'research/2026-09-23-mobile-v5-audit-closure/'

const chrome = spawn(CHROME, [
  '--headless=new', `--remote-debugging-port=${String(PORT)}`,
  '--user-data-dir=/tmp/dsh-vfy-probe2', '--no-first-run', '--disable-gpu',
  '--window-size=430,900', 'about:blank',
], { stdio: 'ignore' })
process.on('exit', () => { try { chrome.kill() } catch { /* gone */ } })

let seq = 0
let ws
const pending = new Map()
const listeners = new Map()
function send(method, params = {}) {
  const id = ++seq
  return new Promise((resolve, reject) => { pending.set(id, { resolve, reject }); ws.send(JSON.stringify({ id, method, params })) })
}
function on(event, handler) { const l = listeners.get(event) ?? []; l.push(handler); listeners.set(event, l) }
async function evaluate(expression) {
  const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
  if (result.exceptionDetails !== undefined) throw new Error(JSON.stringify(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text))
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
    return
  }
  for (const h of listeners.get(msg.method) ?? []) h(msg.params)
})
await send('Page.enable')
await send('Runtime.enable')
await send('Log.enable').catch(() => {})
on('Log.entryAdded', (p) => { const e = p.entry; if (e.level === 'error' || e.level === 'warning') console.log(`[console:${e.level}]`, e.text.slice(0, 200)) })
await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 3, mobile: true })

await send('Page.navigate', { url: `${BASE}/mobile.html` })
await sleep(3000)
console.log('login btn disabled?', await evaluate(`[...document.querySelectorAll('button')].find(b => b.textContent === '登录')?.disabled`))
const code = await evaluate(`(() => {
  const el = document.querySelector('input[placeholder*="验证码"], input[inputmode="numeric"]')
  if (el === null) return 'missing'
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype
  Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, '123456')
  el.dispatchEvent(new Event('input', { bubbles: true }))
  return el.value
})()`)
console.log('code filled:', code)
console.log('login btn disabled now?', await evaluate(`[...document.querySelectorAll('button')].find(b => b.textContent === '登录')?.disabled`))
await evaluate(`[...document.querySelectorAll('button')].find(b => b.textContent === '登录')?.click()`)
for (let i = 0; i < 12; i++) {
  await sleep(2500)
  const state = await evaluate(`({ hash: location.hash, text: document.body.innerText.slice(0, 120).replace(/\\n/g, '|') })`)
  console.log(`t+${(i + 1) * 2.5}s`, JSON.stringify(state))
  if (state.hash !== '' && !state.hash.includes('login') && state.text.includes('消息')) break
}
const shot = await send('Page.captureScreenshot', { format: 'png' })
writeFileSync(`${OUT}vfy-ac-00b-login-after.png`, Buffer.from(shot.data, 'base64'))
console.log('saved vfy-ac-00b-login-after.png')
chrome.kill()
process.exit(0)
