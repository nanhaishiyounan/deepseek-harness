/**
 * B1-stage-5 screenshot driver (research artifact, not product code).
 *
 * Boots nothing itself: it targets the already-running `dsh web` dev server
 * (:3080, DSH_HOME=examples/kb-agent/.dsh). It first injects one seeded
 * report-fence session into the server's durable session store (the same
 * seed.jsonl the keyless e2e replays, trimmed to the report turn so the M1/M3
 * action messages are produced live by the walkthrough itself), then drives a
 * dedicated headless Chrome over CDP through the demo-mode closed loop:
 * login → home → chats → report card → TaskFormModal → work detail → demo
 * timeline → review → confirm → back to source chat → reload persistence,
 * and captures verify-01..verify-16 PNGs next to this script.
 *
 * Usage: node research/2026-09-22-mobile-v5-aiworkmate/.shoot.mjs
 */
import { spawn, spawnSync } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { setTimeout as sleep } from 'node:timers/promises'
import { fileURLToPath } from 'node:url'

const OUT = new URL('.', import.meta.url).pathname
const REPO = new URL('../../', import.meta.url).pathname.replace(/\/$/, '')
const BASE = 'http://127.0.0.1:3080'
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const SEED_SRC = `${REPO}/apps/web/tests/snapshots/mobile-assistant/seed.jsonl`
const SESSIONS_ROOT = `${REPO}/examples/kb-agent/.dsh/sessions`
// The cwd-encoded bucket the dev server already uses for this repository.
const BUCKET = '--Users-mac-Documents-github-deepseek-harness--'

/** Collected walkthrough evidence lines (mirrored into .walkthrough.log). */
const walk = []
const note = (line) => {
  walk.push(line)
  console.log(`[WALK] ${line}`)
}

mkdirSync(OUT, { recursive: true })

// --- 1. seed injection -----------------------------------------------------
// The seed carries the v3 form flow (turns 1-3) plus the v5 report fence
// (turn 4); turns 5-6 (M1/M3 notices) are cut so the walkthrough produces
// them for real through the TaskFormModal / WorkDetailView code paths.
// The dev server builds its session index at boot, so the flow is two-phase:
// a bare run injects and exits (then restart the server), and a SEED_ID=<id>
// run skips injection and drives the walkthrough against the visible seed.
const seedId = process.env.SEED_ID ?? `session-${randomUUID()}`
if (process.env.SEED_ID === undefined) {
  const lines = readFileSync(SEED_SRC, 'utf8').split('\n').filter(line => line.trim() !== '')
  const kept = lines.slice(0, 28) // through the report turn's turn/end
  if (kept[kept.length - 1].includes('turn/end') !== true) throw new Error('seed trim failed: last kept line is not turn/end')
  const anchor = Date.now() - 60_000
  const realized = kept
    .map(line => line
      .split('{{sessionId}}').join(seedId)
      .split('{{cwd}}').join(REPO)
      .split('{{rpcId}}').join('v5-shoot'))
    .map(line => line.split(`${REPO}/workspace`).join(REPO))
  const header = JSON.parse(realized[0])
  header.createdAt = anchor
  // parseHeaderMeta requires a non-negative integer delegationDepth; the
  // fixture header omits it (the e2e seeder adds it in SessionHeader form).
  header.delegationDepth = 0
  const body = realized.slice(1).map((line, index) => {
    // Preserve every top-level event field (type/data/surfaceOp/...); only
    // seq and time are injected — the same shape the append path writes.
    const event = JSON.parse(line)
    return JSON.stringify({ ...event, seq: index, time: anchor + index })
  })
  const sessionDir = `${SESSIONS_ROOT}/${BUCKET}/${seedId}`
  mkdirSync(sessionDir, { recursive: true, mode: 0o700 })
  // The backend's frame protocol: one checksummed zstd frame per JSONL line,
  // first frame exactly the header record (index.ts assertFirstFrameIsHeader).
  // The zstd CLI emits one checksummed frame per invocation; concatenate.
  const frameTmp = `${sessionDir}/.frame-tmp`
  const frameOf = (line) => {
    // The zstd CLI appends a trailing newline when compressing stdin; the
    // file-argument mode compresses the exact bytes (verified single 0x0A).
    writeFileSync(frameTmp, `${line}\n`)
    const z = spawnSync('zstd', ['-q', '-c', frameTmp], { maxBuffer: 1 << 24 })
    if (z.status !== 0) throw new Error(`zstd failed: ${String(z.stderr)}`)
    return z.stdout
  }
  const payload = Buffer.concat([JSON.stringify(header), ...body].map(line => frameOf(line)))
  rmSync(frameTmp)
  writeFileSync(`${sessionDir}/session.jsonl.zstd`, payload, { mode: 0o600 })
  note(`seed injected: ${seedId} (${kept.length} lines, report fence at turn 4, per-line zstd frames)`)
// Leave the pickup assertion to the operator's post-restart check; a running
// server will not see a freshly created session directory.
writeFileSync(`${OUT}.seed-id`, `${seedId}\n`)
console.log(`seed ${seedId} injected; RESTART the dev server, then re-run with SEED_ID=${seedId}`)
process.exit(0)
}
{
  const response = await fetch(`${BASE}/api/session.list`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ type: 'client-request', rpcId: 'v5-shoot', method: 'session.list', payload: {} }),
  })
  const payload = await response.json()
  const found = payload.result.ok && payload.result.value.items.some(item => item.sessionId === seedId)
  if (!found) throw new Error('seeded session not visible through session.list')
  note('seed visible through session.list (server directory scan picked it up)')
}

// --- 2. headless chrome over CDP -------------------------------------------
const PORT = 9335
const chrome = spawn(CHROME, [
  '--headless=new',
  `--remote-debugging-port=${String(PORT)}`,
  '--user-data-dir=/tmp/dsh-v5-audit-profile',
  '--no-first-run',
  '--disable-gpu',
  '--window-size=420,900',
  'about:blank',
], { stdio: 'ignore' })
const cleanup = () => { try { chrome.kill() } catch { /* already gone */ } }
process.on('exit', cleanup)
process.on('SIGINT', () => { cleanup(); process.exit(130) })

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

const TYPE = (selector, value) => evaluate(`(() => {
  const el = document.querySelector(${JSON.stringify(selector)})
  if (el === null) return 'missing'
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype
  Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, ${JSON.stringify(value)})
  el.dispatchEvent(new Event('input', { bubbles: true }))
  return 'ok'
})()`)

const CLICK = (selector) => evaluate(`(() => {
  const el = document.querySelector(${JSON.stringify(selector)})
  if (el === null) return 'missing'
  el.click()
  return 'ok'
})()`)

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

async function setMobileViewport() {
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true })
}

async function setDesktopViewport() {
  await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 832, deviceScaleFactor: 1, mobile: false })
}

const HASH = () => evaluate('location.hash')
const BODY_HAS = (text) => `document.body.innerText.includes(${JSON.stringify(text)})`

// --- 3. login page ----------------------------------------------------------
await setMobileViewport()
await goto(`${BASE}/mobile`)
await evaluate(`localStorage.clear()`)
await goto(`${BASE}/mobile#/login`)
await waitFor(BODY_HAS('食链通'))
await shot('verify-01-login.png')
note('verify-01: #/login renders the demo-auth login card (食链通 branding)')

// --- 4. demo login + pin demo run mode --------------------------------------
await TYPE('input[inputmode="numeric"]', '123456')
await CLICK_TEXT('登录')
await waitFor(BODY_HAS('今日台账'))
await evaluate(`localStorage.setItem('dsh-mobile-runmode', 'demo')`)
await goto(`${BASE}/mobile#/`)
await waitFor(BODY_HAS('今日台账'))
await waitFor(BODY_HAS('快捷任务'))
await waitFor(BODY_HAS('最近对话'))
await shot('verify-02-home-light.png')
note('verify-02: #/ home renders greeting + 今日台账 stats + quick chips + colleague rail + recent chats (runmode pinned to demo)')

// --- 5. chats list ------------------------------------------------------------
await goto(`${BASE}/mobile#/chats`)
await waitFor(`document.body.innerText.length > 200`)
await shot('verify-03-chats.png')
note(`verify-03: #/chats renders the session list (hash ${await HASH()})`)

// --- 6. the seeded report chat -------------------------------------------------
await goto(`${BASE}/mobile#/chat/${seedId}`)
await waitFor(`document.querySelector('[data-testid="report-card"]') !== null`)
await waitFor(BODY_HAS('项目风险'))
await SCROLL_INTO('[data-testid="report-card"]')
await sleep(400)
await shot('verify-04-chat-report.png')
note('verify-04: seeded chat renders ask/draft/receipt (v3 flow) and the report card in one stream')

// --- 7. TaskFormModal from the report action ------------------------------------
await CLICK_TEXT('创建处理任务', '[data-testid="report-card"] button')
await waitFor(`document.querySelector('[aria-label="创建处理任务"]') !== null`)
await waitFor(`document.querySelector('#task-title') !== null && document.querySelector('#task-title').value.includes('跟进鲜丰冷链箱交期')`)
await waitFor(BODY_HAS('AI 建议'))
await shot('verify-05-taskform-modal.png')
note('verify-05: TaskFormModal opens with AI-prefilled title (跟进鲜丰冷链箱交期) and the read-only AI suggestion block')

// --- 8. submit → work detail (todo) ---------------------------------------------
await CLICK_TEXT('创建任务', '[aria-label="创建处理任务"] button')
await waitFor(`location.hash.startsWith('#/work/')`)
await waitFor(BODY_HAS('执行时间线'))
await waitFor(BODY_HAS('尚未开始执行'))
await sleep(400)
note(`walkthrough: submitted → navigated to ${await HASH()} in todo state (M1 notice sent to source chat through the real gateway)`)

// --- 9. work tab: four states ------------------------------------------------------
await goto(`${BASE}/mobile#/work`)
await waitFor(BODY_HAS('待处理') && BODY_HAS('进行中') && BODY_HAS('待确认') && BODY_HAS('已完成'))
await waitFor(BODY_HAS('跟进鲜丰冷链箱交期'))
await shot('verify-06-work-four-states.png')
// DOM-assert every capsule state holds its card (demo seed + the walkthrough task).
for (const [tab, card] of [['待处理', '跟进鲜丰冷链箱交期'], ['进行中', '供应商资质到期提醒'], ['待确认', '本月采购月报整理'], ['已完成', '本月经营概览']]) {
  await CLICK_TEXT(tab, '.adm-capsule-tabs-tab')
  await sleep(300)
  await waitFor(BODY_HAS(card))
  note(`verify-06 DOM: capsule tab ${tab} shows card ${card}`)
}
await CLICK_TEXT('待处理', '.adm-capsule-tabs-tab')
await sleep(300)

// --- 10. work detail: start execution, demo timeline, review ------------------------
await goto(`${BASE}/mobile#/work`)
await waitFor(BODY_HAS('跟进鲜丰冷链箱交期'))
await CLICK('[aria-label="打开 跟进鲜丰冷链箱交期"]')
await waitFor(`location.hash.startsWith('#/work/')`)
await waitFor(BODY_HAS('尚未开始执行'))
await shot('verify-07-work-detail-todo.png')
note('verify-07 (pre): work detail renders ticket head + context card + timeline empty state + 开始执行 action')
await CLICK_TEXT('开始执行')
await sleep(1600)
await waitFor(BODY_HAS('AI 同事执行中') || `document.querySelectorAll('[class*="stepRunning"]').length > 0`)
await shot('verify-15-timeline-running.png')
note('verify-15: demo timeline mid-flight (breathing running step, timers only, nothing in the durable log)')
await waitFor(BODY_HAS('确认完成'), { timeout: 30000 })
await waitFor(BODY_HAS('结果'), { timeout: 10000 })
await sleep(400)
await shot('verify-07-work-detail-review.png')
note('verify-07: timeline settled → item flipped to review with the result card (M3 notice sent to source chat)')

// --- 11. confirm done → back to chat -------------------------------------------------
await CLICK_TEXT('确认完成', 'div button')
await sleep(600)
await waitFor(BODY_HAS('回到聊天'))
await shot('verify-07b-work-detail-done.png')
note('walkthrough: confirmed done; action row switched to 回到聊天')
await CLICK_TEXT('回到聊天')
await waitFor(`location.hash.includes('#/chat/${seedId}')`)
await waitFor(`document.querySelector('[data-testid="report-card"]') !== null`)
// M1/M3 rode the durable log as real user messages; the AI answered for real.
await waitFor(BODY_HAS('已创建处理任务：跟进鲜丰冷链箱交期'), { timeout: 60000 })
await waitFor(BODY_HAS('工作已完成：跟进鲜丰冷链箱交期'), { timeout: 60000 })
await evaluate(`[...document.querySelectorAll('main *')].filter(el => (el.textContent ?? '').startsWith('工作已完成：跟进鲜丰冷链箱交期')).pop()?.scrollIntoView({ block: 'center' })`)
await sleep(400)
await shot('verify-16-back-to-chat.png')
note('verify-16: back in the source chat, M1 and M3 render as ordinary user bubbles (真实 user 消息进 durable log)')

// --- 12. reload persistence -----------------------------------------------------------
await goto(`${BASE}/mobile#/work`)
await waitFor(BODY_HAS('待处理') && BODY_HAS('已完成'))
await send('Page.reload', {})
await sleep(1800)
await waitFor(BODY_HAS('本月经营概览'))
await CLICK_TEXT('已完成', '.adm-capsule-tabs-tab')
await waitFor(BODY_HAS('跟进鲜丰冷链箱交期'))
note('walkthrough: full page reload kept the workStore (four states + walkthrough item intact) — localStorage persistence verified')

// --- 13. secondary routes ---------------------------------------------------------------
await goto(`${BASE}/mobile#/tasks`)
await waitFor(BODY_HAS('我的任务'))
await waitFor(BODY_HAS('团队'))
await waitFor(BODY_HAS('示例'))
await shot('verify-08-tasks.png')
note('verify-08: #/tasks renders 我的/团队 split with demo 示例 tags')

await goto(`${BASE}/mobile#/files`)
await waitFor(BODY_HAS('最近文件'))
await waitFor(BODY_HAS('收藏'))
await shot('verify-09-files.png')
note('verify-09: #/files renders AI 生成 / 最近文件 / 收藏 sections')

await goto(`${BASE}/mobile#/agents`)
await waitFor(BODY_HAS('同事目录') || BODY_HAS('发消息'))
await shot('verify-10-agents.png')
note('verify-10: #/agents renders the colleague role cards (roster-driven)')

await goto(`${BASE}/mobile#/me`)
await waitFor(BODY_HAS('工作空间'))
await waitFor(BODY_HAS('真实模式'))
await waitFor(BODY_HAS('清除演示数据') || BODY_HAS('演示数据'))
await shot('verify-11-me.png')
note('verify-11: #/me renders workspace stats + AI preference (真实模式 switch off = demo) + notifications + demo-data cleanup')

// --- 14. dark mode ------------------------------------------------------------------------
await goto(`${BASE}/mobile#/me`)
await waitFor(BODY_HAS('深色模式'))
await evaluate(`[...document.querySelectorAll('[role="switch"]')].find(s => s.getAttribute('aria-label') === '深色模式')?.click()`)
await sleep(400)
await goto(`${BASE}/mobile#/`)
await waitFor(BODY_HAS('今日台账'))
await sleep(400)
await shot('verify-12-home-dark.png')
note('verify-12: home in dark track (data-theme dark via the profile switch)')
await goto(`${BASE}/mobile#/chat/${seedId}`)
await waitFor(`document.querySelector('[data-testid="report-card"]') !== null`)
await SCROLL_INTO('[data-testid="report-card"]')
await sleep(400)
await shot('verify-13-chat-report-dark.png')
note('verify-13: chat report card on the dark track')

// --- 15. PC mobile preview ------------------------------------------------------------------
await setDesktopViewport()
await goto(`${BASE}/`)
await waitFor(`[...document.querySelectorAll('[role="tab"]')].some(t => (t.textContent ?? '').includes('移动端预览'))`)
await evaluate(`[...document.querySelectorAll('[role="tab"]')].find(t => (t.textContent ?? '').includes('移动端预览'))?.click()`)
await waitFor(`document.querySelector('iframe') !== null`)
await sleep(1500)
await shot('verify-14-pc-mobile-preview.png')
note('verify-14: PC 移动端预览 tab renders the 390×844 iframe shell over /mobile')

writeFileSync(`${OUT}.walkthrough.log`, walk.join('\n') + '\n')
console.log('done')
chrome.kill()
process.exit(0)
