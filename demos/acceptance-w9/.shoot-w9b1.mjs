// W9-B1 live evidence probe (375px): the assist-input fill semantics over the
// real gateway on :3080 (NocoBase :13000, engine :13110). All shots are real
// UI over the real /api lane — the mobile bundles carry this batch's
// fillDraft build.
//   Leg A — a starter pick fills the box (PNG01 + the GIF frames): value
//     equals the send-text, box focused with the caret at the end, no
//     session.prompt goes out, the welcome card stays; an edit + send tap
//     then carries the modified text (the one-tap path).
//   Leg B — a half-typed draft is replaced whole by the next starter pick
//     (PNG02, F1).
//   Leg C — a fenced ask_choice pick still fires at once (PNG03; the model
//     leg is best-effort — the spec-level coverage lives in views spec).
// Usage (repo root): node demos/acceptance-w9/.shoot-w9b1.mjs
import { existsSync, rmSync, writeFileSync } from 'node:fs'
import { chromium } from '../../apps/web/node_modules/playwright/index.mjs'

const BASE = 'http://127.0.0.1:3080/mobile.html'
const OUT = 'demos/acceptance-w9'
const FRAMES = `${OUT}/.frames-w9b1`
const LOG = []
const sleep = (ms) => new Promise((resolve) => { setTimeout(resolve, ms) })
const check = (name, ok, detail = '') => {
  const line = `${ok ? 'PASS' : 'FAIL'} ${name}${detail === '' ? '' : ` — ${detail}`}`
  console.log(line)
  LOG.push(line)
  if (!ok) process.exitCode = 1
}

/** Create a fresh fill-assistant session over the wire and return its id. */
const createSession = async (rpcId) => {
  const created = await fetch('http://127.0.0.1:3080/api/session.create', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ type: 'client-request', rpcId, method: 'session.create', payload: { agentPreset: 'mobile-form-assistant' } }),
  }).then(async response => response.json())
  return created?.result?.ok === true ? created.result.value.sessionId : undefined
}

const login = async (page) => {
  await page.goto(`${BASE}#/login`, { waitUntil: 'domcontentloaded' })
  await page.evaluate(() => { localStorage.clear() })
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.getByPlaceholder('业务账号（如 buyer）').fill('buyer')
  await page.getByPlaceholder('业务账号密码').fill('Buyer#2026')
  await page.getByRole('button', { name: '登录' }).click()
  await page.waitForSelector('nav[aria-label="底部导航"]', { timeout: 30_000 })
}

/** One chat page with the prompt-call counter installed; resolves on the welcome card. */
const openChat = async (context, sessionId) => {
  const page = await context.newPage()
  const prompts = []
  page.on('request', (request) => {
    if (request.url().includes('/api/session.prompt')) prompts.push(request.postData() ?? '')
  })
  await page.goto(`${BASE}#/chat/${sessionId}`, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('[data-testid="welcome-card"]', { timeout: 20_000 })
  return { page, prompts }
}

const browser = await chromium.launch()
rmSync(FRAMES, { recursive: true, force: true })

// ── Leg A: a starter pick fills the box, the user edits, then sends ──
{
  const context = await browser.newContext({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 2 })
  const page = await context.newPage()
  await login(page)
  const sessionId = await createSession('w9b1-a')
  check('Leg A 探针会话创建', sessionId !== undefined, `id=${String(sessionId)}`)
  await page.goto(`${BASE}#/chat/${sessionId}`, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('[data-testid="welcome-card"]', { timeout: 20_000 })
  const prompts = []
  page.on('request', (request) => {
    if (request.url().includes('/api/session.prompt')) prompts.push(request.postData() ?? '')
  })
  const box = page.getByPlaceholder('问我任何经营问题...')
  await box.waitFor({ timeout: 10_000 })
  let frame = 0
  const snap = async () => { frame += 1; await page.screenshot({ path: `${FRAMES}/f${String(frame).padStart(2, '0')}.png` }) }
  await sleep(600)
  await snap()
  // The pick: fills, focuses, caret at the end, sends nothing.
  await page.locator('[data-testid="welcome-card"] button', { hasText: '登记一条采购单' }).click()
  await sleep(250)
  const filled = await box.evaluate((el) => ({
    value: el.value, focused: document.activeElement === el,
    start: el.selectionStart, end: el.selectionEnd,
    fillFlag: el.closest('[data-fill]') !== null,
  }))
  check('A1 点击欢迎卡 starter → 输入框值 = send 文本（未发送）', filled.value === '向宏发食品采购 500kg 面粉，单价 3.2', JSON.stringify(filled))
  check('A2 输入框聚焦', filled.focused === true)
  check('A3 光标位于末尾', filled.start === filled.value.length && filled.end === filled.value.length, `start=${String(filled.start)} end=${String(filled.end)} len=${String(filled.value.length)}`)
  check('A4 消息列表无新消息（未发送）', await page.locator('div[class*="userBubble"]').count() === 0)
  check('A5 无 session.prompt 发出', prompts.length === 0, `prompts=${String(prompts.length)}`)
  check('A6 欢迎屏仍在（填入不是消息）', await page.locator('[data-testid="welcome-card"]').count() === 1)
  check('A7 data-fill 反馈已挂载', filled.fillFlag === true)
  await page.screenshot({ path: `${OUT}/w9-b1-01-tag-fill-input-375.png` })
  await snap()
  // The user's edit rides the focused box; then one send tap carries it.
  await box.pressSequentially('，供应商鲜丰，数量200箱', { delay: 24 })
  await sleep(300)
  await snap()
  const sendBtn = page.getByRole('button', { name: '发送' })
  check('A8 发送按钮随填入激活', await sendBtn.isEnabled())
  await sendBtn.click()
  await sleep(300)
  await snap()
  await page.waitForSelector('div[class*="userBubble"]:has-text("供应商鲜丰")', { timeout: 15_000 })
  const sentPayload = prompts.at(-1) ?? ''
  check('A9 用户点发送后消息发出（含改写文本）', sentPayload.includes('供应商鲜丰'), `prompts=${String(prompts.length)}`)
  await sleep(2400)
  await snap()
  await context.close()
}

// ── Leg B: a half-typed draft is replaced whole by the next pick (F1) ──
{
  const context = await browser.newContext({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 2 })
  const page = await context.newPage()
  await login(page)
  const sessionId = await createSession('w9b1-b')
  await page.goto(`${BASE}#/chat/${sessionId}`, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('[data-testid="welcome-card"]', { timeout: 20_000 })
  const box = page.getByPlaceholder('问我任何经营问题...')
  await box.waitFor({ timeout: 10_000 })
  await box.fill('先记半句话的旧草稿')
  await sleep(300)
  await page.locator('[data-testid="welcome-card"] button', { hasText: '查一下库存' }).click()
  await sleep(300)
  const value = await box.inputValue()
  check('B1 已有草稿时点击 tag → 草稿被整体替换', value === '查一下酱油还有多少库存', `value=${value}`)
  check('B2 替换后仍未发送', await page.locator('div[class*="userBubble"]').count() === 0)
  await page.screenshot({ path: `${OUT}/w9-b1-02-draft-replaced-375.png` })
  await context.close()
}

// ── Leg C (best-effort): a fenced ask_choice pick still fires at once ──
{
  const context = await browser.newContext({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 2 })
  const page = await context.newPage()
  await login(page)
  const sessionId = await createSession('w9b1-c')
  await page.goto(`${BASE}#/chat/${sessionId}`, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('[data-testid="welcome-card"]', { timeout: 20_000 })
  const box = page.getByPlaceholder('问我任何经营问题...')
  await box.waitFor({ timeout: 10_000 })
  const prompts = []
  page.on('request', (request) => {
    if (request.url().includes('/api/session.prompt')) prompts.push(request.postData() ?? '')
  })
  await box.fill('这笔业务该开哪种单据你拿不准就直接问我：刚和鲜丰谈好一批冷链货要入库，先给我可点选的单据类型选项，别急着出草稿')
  await page.getByRole('button', { name: '发送' }).click()
  const choice = page.locator('[data-testid="ask-choice"], [role="radio"]').first()
  let asked = true
  try { await choice.waitFor({ timeout: 45_000 }) } catch { asked = false }
  if (asked) {
    await sleep(400)
    await page.locator('[role="radio"]').first().click()
    await sleep(600)
    check('C1 围栏选项点击仍即时发送', prompts.length >= 2, `prompts=${String(prompts.length)}`)
    await page.screenshot({ path: `${OUT}/w9-b1-03-choice-still-sends-375.png` })
  } else {
    LOG.push('SKIP C1 — 模型未走 ask_choice 路径（围栏回归由 views.client.spec.tsx ask 集成断言覆盖）')
    console.log(LOG.at(-1))
  }
  await context.close()
}

await browser.close()

// ── The GIF: the fill → edit → send walkthrough over the Leg A frames ──
const gif = `${OUT}/w9-b1-tag-fill.gif`
const cp = await import('node:child_process')
cp.execFileSync('ffmpeg', [
  '-y', '-framerate', '1.1', '-i', `${FRAMES}/f%02d.png`,
  '-vf', 'scale=375:-2:flags=lanczos,split[s0][s1];[s0]palettegen=max_colors=96[p];[s1][p]paletteuse=dither=bayer:bayer_scale=4',
  '-loop', '0', gif,
], { stdio: ['ignore', 'ignore', 'pipe'] })
check('GIF 合成（点击→填入→改写→发送）', existsSync(gif), gif)

writeFileSync(`${OUT}/w9-b1-live-probe.log`, `${LOG.join('\n')}\n`)
console.log(`\n${LOG.join('\n')}`)
