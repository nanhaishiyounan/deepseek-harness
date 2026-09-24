/**
 * B1-stage-5 screenshot driver, part 2 (research artifact, not product code).
 * Resumes after the closed loop: reload persistence check on #/work, the
 * secondary routes (tasks/files/agents/me), the dark track (home + report
 * chat), and the PC mobile-preview tab. Reuses the part-1 profile so the
 * demo login, the pinned demo runmode, and the walkthrough's workStore state
 * survive. Usage: node .shoot2.mjs (requires .seed-id from part 1).
 */
import { spawn } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { setTimeout as sleep } from 'node:timers/promises'

const OUT = new URL('.', import.meta.url).pathname
const BASE = 'http://127.0.0.1:3080'
const SEED_ID = readFileSync(`${OUT}.seed-id`, 'utf8').trim()
const PORT = 9337
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'

const walk = []
const note = (line) => {
  walk.push(line)
  console.log(`[WALK] ${line}`)
}

const chrome = spawn(CHROME, [
  '--headless=new', `--remote-debugging-port=${String(PORT)}`,
  '--user-data-dir=/tmp/dsh-v5-audit-profile', '--no-first-run', '--disable-gpu',
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
async function shot(name, { fullPage = false } = {}) {
  const params = { format: 'png' }
  if (fullPage) params.captureBeyondViewport = true
  const result = await send('Page.captureScreenshot', params)
  writeFileSync(`${OUT}${name}`, Buffer.from(result.data, 'base64'))
  console.log(`saved ${name}`)
}
async function goto(url) {
  await send('Page.navigate', { url })
  await new Promise((resolve) => {
    const timer = setTimeout(resolve, 15000)
    on('Page.loadEventFired', () => { clearTimeout(timer); resolve() })
  })
  await sleep(700)
}
async function waitFor(expression, { timeout = 30000, interval = 500 } = {}) {
  const deadline = Date.now() + timeout
  for (;;) {
    const value = await evaluate(expression)
    if (value === true) return
    if (Date.now() > deadline) throw new Error(`timeout waiting for: ${expression}`)
    await sleep(interval)
  }
}
const CLICK_TEXT = (text, scope = 'button') => evaluate(`(() => {
  const el = [...document.querySelectorAll(${JSON.stringify(scope)})].find(b => (b.textContent ?? '').includes(${JSON.stringify(text)}))
  if (el === undefined) return 'missing'
  el.click()
  return 'ok'
})()`)
const SCROLL_INTO = (selector) => evaluate(`(() => {
  const el = document.querySelector(${JSON.stringify(selector)})
  if (el === null) return 'missing'
  el.scrollIntoView({ block: 'center' })
  return 'ok'
})()`)
const BODY_HAS = (text) => `document.body.innerText.includes(${JSON.stringify(text)})`

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

// --- resume: reload persistence on #/work -----------------------------------
await goto(`${BASE}/mobile#/work`)
await waitFor(BODY_HAS('待处理') && BODY_HAS('进行中') && BODY_HAS('已完成'))
await send('Page.reload', {})
await sleep(2000)
await waitFor(BODY_HAS('待处理') && BODY_HAS('进行中') && BODY_HAS('已完成'))
await CLICK_TEXT('已完成', '.adm-capsule-tabs-tab')
await sleep(400)
await waitFor(BODY_HAS('本月经营概览'))
await waitFor(BODY_HAS('跟进鲜丰冷链箱交期'))
note('walkthrough: full page reload kept the workStore (four capsules + demo cards + walkthrough item intact) — localStorage persistence verified')

// --- secondary routes ---------------------------------------------------------
await goto(`${BASE}/mobile#/tasks`)
await waitFor(BODY_HAS('我的任务'))
await waitFor(BODY_HAS('团队'))
// The demo 示例 tags ride the team tab's rows; switch before asserting.
await CLICK_TEXT('团队', '.adm-capsule-tabs-tab')
await sleep(400)
await waitFor(BODY_HAS('示例'))
await shot('verify-08-tasks.png')
note('verify-08: #/tasks renders 我的/团队 split; team tab carries the demo 示例 tags')

await goto(`${BASE}/mobile#/files`)
await waitFor(BODY_HAS('最近文件'))
await waitFor(BODY_HAS('收藏'))
await shot('verify-09-files.png')
note('verify-09: #/files renders AI 生成 / 最近文件 / 收藏 sections')

await goto(`${BASE}/mobile#/agents`)
await waitFor(BODY_HAS('AI 同事') || BODY_HAS('发消息'))
await shot('verify-10-agents.png')
note('verify-10: #/agents renders the colleague role cards (roster-driven)')

await goto(`${BASE}/mobile#/me`)
await waitFor(BODY_HAS('工作空间'))
await waitFor(BODY_HAS('真实模式'))
await waitFor(BODY_HAS('清除演示数据') || BODY_HAS('演示数据'))
await shot('verify-11-me.png')
note('verify-11: #/me renders workspace stats + AI preference (真实模式 switch off = demo) + notifications + demo-data cleanup')

// --- dark track -----------------------------------------------------------------
await evaluate(`[...document.querySelectorAll('[role="switch"]')].find(s => s.getAttribute('aria-label') === '深色模式')?.click()`)
await sleep(400)
await goto(`${BASE}/mobile#/`)
await waitFor(BODY_HAS('今日台账'))
await sleep(500)
await shot('verify-12-home-dark.png')
note('verify-12: home in dark track (data-theme dark via the profile switch)')
await goto(`${BASE}/mobile#/chat/${SEED_ID}`)
await waitFor(`document.querySelector('[data-testid="report-card"]') !== null`)
await SCROLL_INTO('[data-testid="report-card"]')
await sleep(400)
await shot('verify-13-chat-report-dark.png')
note('verify-13: chat report card on the dark track')

// --- PC mobile preview -------------------------------------------------------------
await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 832, deviceScaleFactor: 1, mobile: false })
await goto(`${BASE}/`)
await waitFor(`[...document.querySelectorAll('[role="tab"]')].some(t => (t.textContent ?? '').includes('移动端预览'))`)
await evaluate(`[...document.querySelectorAll('[role="tab"]')].find(t => (t.textContent ?? '').includes('移动端预览'))?.click()`)
await waitFor(`document.querySelector('iframe') !== null`)
await sleep(1500)
await shot('verify-14-pc-mobile-preview.png')
note('verify-14: PC 移动端预览 tab renders the 390×844 iframe shell over /mobile')

writeFileSync(`${OUT}.walkthrough-part2.log`, walk.join('\n') + '\n')
console.log('done')
chrome.kill()
process.exit(0)
