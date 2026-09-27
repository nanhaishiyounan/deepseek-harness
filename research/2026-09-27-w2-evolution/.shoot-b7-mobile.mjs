/**
 * W2-B7 mobile five-shot driver (research artifact): the business-advisor
 * persona answers 「经营怎么样」 five times in fresh sessions — each turn
 * must render the report card with ZERO degradedNotice collapses (99 #12),
 * then one single-metric OTIF turn for stability. Headless Chrome + CDP,
 * the .b8-shoot.mjs pattern, live LLM through the running gateway (:3080).
 *
 * Usage: node research/2026-09-27-w2-evolution/.shoot-b7-mobile.mjs
 */
import { spawn } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import { setTimeout as sleep } from 'node:timers/promises'

const OUT = new URL('.', import.meta.url).pathname
const BASE = 'http://127.0.0.1:3080'
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const PORT = 9351

const chrome = spawn(CHROME, [
  '--headless=new',
  `--remote-debugging-port=${String(PORT)}`,
  '--user-data-dir=/tmp/dsh-w2b7-mobile-profile',
  '--no-first-run',
  '--disable-gpu',
  '--window-size=390,844',
  'about:blank',
], { stdio: 'ignore' })
const cleanup = () => { try { chrome.kill() } catch { /* already gone */ } }
process.on('exit', cleanup)
process.on('SIGINT', () => { cleanup(); process.exit(130) })

const evidence = []
const note = (line) => { evidence.push(line); console.log(`[B7] ${line}`) }

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
      if (msg.error !== undefined) entry.reject(new Error(`${msg.error.message} ${msg.error.data ?? ''}`))
      else entry.resolve(msg.result)
      return
    }
    for (const handler of listeners.get(msg.method) ?? []) handler(msg.params)
  })
}

async function evaluate(expression) {
  const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
  if (result.exceptionDetails !== undefined) {
    throw new Error(`eval failed: ${JSON.stringify(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text)}`)
  }
  return result.result.value
}

async function shot(name) {
  const result = await send('Page.captureScreenshot', { format: 'png' })
  writeFileSync(`${OUT}${name}`, Buffer.from(result.data, 'base64'))
  console.log(`saved ${name}`)
}

async function goto(url) {
  await send('Page.navigate', { url })
  await new Promise((resolve) => {
    const timer = setTimeout(resolve, 20000)
    on('Page.loadEventFired', () => { clearTimeout(timer); resolve() })
  })
  await sleep(800)
}

async function waitFor(expression, { timeout = 30000, interval = 400 } = {}) {
  const deadline = Date.now() + timeout
  for (;;) {
    const value = await evaluate(expression)
    if (value === true) return true
    if (Date.now() > deadline) return false
    await sleep(interval)
  }
}

async function waitForStage(expression, stage, options) {
  if (!(await waitFor(expression, options))) {
    throw new Error(`timeout waiting for ${stage}: ${expression}`)
  }
}

const TYPE = (selector, value) => evaluate(`(() => {
  const el = document.querySelector(${JSON.stringify(selector)})
  if (el === null) return 'missing'
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype
  Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, ${JSON.stringify(value)})
  el.dispatchEvent(new Event('input', { bubbles: true }))
  return 'ok'
})()`)

const BODY_HAS = (text) => `document.body.innerText.includes(${JSON.stringify(text)})`

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
const page = tabs.find((tab) => tab.type === 'page')
await connect(page.webSocketDebuggerUrl)
await send('Page.enable')
await send('Runtime.enable')
await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true })

// ─── sign in and enter the business-advisor chat ───
await goto(`${BASE}/mobile.html`)
await evaluate('localStorage.clear()')
await evaluate(`localStorage.setItem('dsh-mobile-theme', 'light')`)
await send('Page.navigate', { url: 'about:blank' })
await sleep(300)
await goto(`${BASE}/mobile.html#/login`)
await waitForStage(BODY_HAS('食链通'), 'login screen')
await TYPE('input[inputmode="numeric"]', '123456')
await evaluate(`[...document.querySelectorAll('button')].find(b => (b.textContent ?? '').includes('登录'))?.click()`)
await waitForStage(BODY_HAS('今日台账'), 'mobile home after login')

const enterAdvisorChat = async () => {
  await goto(`${BASE}/mobile.html#/agents`)
  await waitForStage(`document.querySelector('button[aria-label^="找 "]') !== null`, 'agents roster', { timeout: 15000 })
  const labels = await evaluate(`[...document.querySelectorAll('button[aria-label^="找 "]')].map(b => b.getAttribute('aria-label')).join(' | ')`)
  note(`roster: ${labels}`)
  const tapped = await evaluate(`(() => {
    const rows = [...document.querySelectorAll('button[aria-label^="找 "]')]
    const target = rows.find(b => (b.getAttribute('aria-label') ?? '').includes('填表')) ?? rows[0]
    if (target === undefined) return false
    target.click(); return target.getAttribute('aria-label')
  })()`)
  note(`chat entered via roster: ${String(tapped)}`)
  await waitForStage(`location.hash.startsWith('#/chat/')`, 'chat route', { timeout: 20000 })
  await waitForStage(`document.querySelector('textarea') !== null`, 'chat textarea', { timeout: 20000 })
  await sleep(800)
}

const sendTurn = async (message) => {
  await evaluate(`(() => { document.querySelector('textarea').focus(); return true; })()`)
  await TYPE('textarea', message)
  await evaluate(`[...document.querySelectorAll('button')].find(b => b.getAttribute('aria-label') === '发送')?.click()`)
  await waitFor(BODY_HAS('正在处理') || BODY_HAS('思考'), { timeout: 20000 })
  await waitForStage(`!document.body.innerText.includes('正在处理') && !document.body.innerText.includes('思考中')`, 'llm turn settled', { timeout: 180000 })
  await sleep(1200)
}

// ─── the five wide-question shots (99 #12: no degraded collapse allowed) ───
let degradedTotal = 0
let cardsTotal = 0
for (let round = 1; round <= 5; round += 1) {
  await enterAdvisorChat()
  await sendTurn('经营怎么样')
  const degraded = await evaluate('document.querySelectorAll("details.degradedNotice").length')
  const card = await evaluate(`${BODY_HAS('T+1')} || ${BODY_HAS('经营看板')} || ${BODY_HAS('计算日')}`)
  const metricsHint = await evaluate('document.body.innerText.slice(0, 600).replace(/\\n/g, " ").slice(0, 160)')
  degradedTotal += degraded
  if (card === true) cardsTotal += 1
  note(`round ${String(round)}: degraded=${String(degraded)} report-card=${String(card)} | ${metricsHint}`)
  await shot(`w2-b7-mobile-bizhow-${String(round)}.png`)
}

// ─── one single-metric stability shot ───
await enterAdvisorChat()
await sendTurn('这周 OTIF 多少')
const otifDegraded = await evaluate('document.querySelectorAll("details.degradedNotice").length')
const otifCard = await evaluate(`${BODY_HAS('OTIF')} || ${BODY_HAS('准时')}`)
degradedTotal += otifDegraded
note(`otif: degraded=${String(otifDegraded)} card-ish=${String(otifCard)}`)
await shot('w2-b7-mobile-otif.png')

note(`SUMMARY: five-shot degraded total=${String(degradedTotal)} (expect 0), report cards=${String(cardsTotal)}/5, otif degraded=${String(otifDegraded)}`)
writeFileSync(`${OUT}.shoot-b7-mobile-evidence.json`, `${JSON.stringify({ capturedAt: new Date().toISOString(), base: BASE, evidence }, null, 2)}\n`)
cleanup()
process.exit(0)
