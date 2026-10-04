#!/usr/bin/env node
/**
 * W6-R5 mobile evidence, retake: the same #/alerts page as w6-r5-shot.mjs's
 * mobile leg, but the capture scrolls the first dunning notice card into
 * the viewport (the full-run shot left them below the fold while the DOM
 * probe already proved dunningBadge=2 / dunningWearingRecall=0).
 */
import { spawn, execSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'

const WEB = 'http://localhost:3080'
const PORT = 9356
const OUT = new URL('../../demos/acceptance-w6/', import.meta.url).pathname
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const meta = { generatedAt: new Date().toISOString() }

const chromeProc = spawn(CHROME, [
  `--remote-debugging-port=${PORT}`, '--headless=new', '--no-first-run', '--no-default-browser-check',
  '--user-data-dir=/tmp/w6-r5-mob-profile', '--window-size=390,844', '--disable-gpu', 'about:blank',
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
await new Promise((resolve) => (ws.onopen = resolve))
await send('Page.enable')
const evaluate = async (expression) => {
  const result = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })
  return result?.result?.value
}
const shot = async (name) => {
  const captured = await send('Page.captureScreenshot', { format: 'png' })
  execSync(`echo ${captured.data} | base64 -d > ${OUT}${name}`)
  console.log(`w6-r5-mob: ${name}`)
}

await send('Page.navigate', { url: `${WEB}/mobile#/login` })
await sleep(3000)
let mobileFilled = false
for (let probe = 0; probe < 15 && mobileFilled !== true; probe++) {
  await sleep(2000)
  mobileFilled = await evaluate(`(() => {
    const inputs = [...document.querySelectorAll('input')]
    const account = inputs.find(i => (i.placeholder ?? '').includes('业务账号') && i.type !== 'password')
    const pass = inputs.find(i => i.type === 'password')
    if (account === undefined || pass === undefined) return false
    const set = (el, v) => { const s = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; s.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true })) }
    set(account, 'finance'); set(pass, 'Finance#2026'); return true
  })()`)
}
if (mobileFilled !== true) throw new Error('mobile sign-in form did not render')
await evaluate(`[...document.querySelectorAll('button')].find(b => b.textContent.includes('登录'))?.click()`)
await sleep(6000)
meta.mobileIdentity = await evaluate(`(() => { const raw = localStorage.getItem('dsh-mobile-auth'); return raw === null ? null : JSON.parse(raw).username })()`)
await send('Page.navigate', { url: `${WEB}/mobile#/alerts` })
let mobileReady = false
for (let attempt = 0; attempt < 30 && mobileReady !== true; attempt++) {
  await sleep(2000)
  mobileReady = await evaluate(`(() => document.querySelector('[data-testid="alert-row"], [data-testid="recall-notice"], [class*="emptyCard"], [class*="errorCard"]') !== null)()`)
}
await sleep(1500)
const badge = await evaluate(`(() => {
  const notices = [...document.querySelectorAll('[data-testid="recall-notice"]')]
  const dunning = notices.filter(n => n.textContent.includes('催收任务'))
  dunning[0]?.scrollIntoView({ block: 'center' })
  return { noticeTotal: notices.length, dunningCards: dunning.length, dunningWearingRecall: dunning.filter(n => n.querySelector('[data-severity]')?.textContent === '召回').length, firstDunningHead: (dunning[0]?.textContent ?? '').slice(0, 80) }
})()`)
meta.mobileBadge = badge
await sleep(700)
await shot('w6-r5-08-mobile-dunning-badge.png')

writeFileSync(`${OUT}w6-r5-shot-mobile-meta.json`, `${JSON.stringify(meta, null, 2)}\n`)
console.log(JSON.stringify(meta, null, 2))
execSync(`pkill -f "remote-debugging-port=${PORT}" || true`)
