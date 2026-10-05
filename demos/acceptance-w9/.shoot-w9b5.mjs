// W9-B5 evidence shoot (home hero + chat flow, Sauce Amber): four-quadrant
// shots (375/390 × light/dark) of home and a live chat, the legacy
// stamp-title strip assertion (S4), the chat-flow GIF frames (B1 fill + B2
// clean bubble in one frame), all over the real gateway on :3080.
// Usage (repo root): node demos/acceptance-w9/.shoot-w9b5.mjs
import { existsSync, rmSync, writeFileSync } from 'node:fs'
import { chromium } from '../../apps/web/node_modules/playwright/index.mjs'

const BASE = 'http://127.0.0.1:3080/mobile.html'
const OUT = 'demos/acceptance-w9'
const FRAMES = `${OUT}/.frames-w9b5`
const LOG = []
const sleep = (ms) => new Promise((resolve) => { setTimeout(resolve, ms) })
const check = (name, ok, detail = '') => {
  const line = `${ok ? 'PASS' : 'FAIL'} ${name}${detail === '' ? '' : ` — ${detail}`}`
  console.log(line)
  LOG.push(line)
  if (!ok) process.exitCode = 1
}

const api = async (rpcId, method, payload) => {
  const response = await fetch(`http://127.0.0.1:3080/api/${method}`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ type: 'client-request', rpcId, method, payload }),
  }).then(async r => r.json())
  return response
}

/** Create a fresh fill-assistant session over the wire; returns its id. */
const createSession = async (rpcId) => {
  const created = await fetch('http://127.0.0.1:3080/api/session.create', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ type: 'client-request', rpcId, method: 'session.create', payload: { agentPreset: 'mobile-form-assistant' } }),
  }).then(async response => response.json())
  return created?.result?.ok === true ? created.result.value.sessionId : undefined
}

const login = async (page, theme) => {
  await page.goto(`${BASE}#/login`, { waitUntil: 'domcontentloaded' })
  await page.evaluate((key) => {
    localStorage.clear()
    if (key !== undefined) localStorage.setItem('dsh-mobile-theme', key)
  }, theme)
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.getByPlaceholder('业务账号（如 buyer）').fill('qc_inspector')
  await page.getByPlaceholder('业务账号密码').fill('Qc#2026')
  await page.getByRole('button', { name: '登录' }).click()
  await page.waitForSelector('nav[aria-label="底部导航"]', { timeout: 30_000 })
}

const browser = await chromium.launch()

// ── Leg A: home quadrants (375/390 × light/dark) + hero assertions ──
{
  const context = await browser.newContext({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 2 })
  const page = await context.newPage()
  await login(page, 'light')
  await sleep(1600)
  const seal = page.locator('[aria-label="今日酱印"]')
  check('A1 hero 酱印在位', await seal.count() === 1)
  const sealText = (await seal.textContent()) ?? ''
  const batch = `B-${String(new Date().getMonth() + 1).padStart(2, '0')}${String(new Date().getDate()).padStart(2, '0')}`
  check('A2 酱印含竖排「鲜酿」+ 当日批次号', sealText.includes('鲜酿') && sealText.includes(batch), `text=${sealText} batch=${batch}`)
  check('A3 节气文案派生自真实日期', /时节|今日[\u4e00-\u9fa5]{2}/.test((await page.locator('h1').first().textContent()) ?? ''), await page.locator('h1').first().textContent() ?? '')
  check('A4 两列大卡统计（4 格独立白卡）', await page.locator('[class*="statCell"]').count() === 4)
  check('A5 唯一实底 CTA 胶囊章', await page.locator('button[class*="dshm-seal-cta"]').count() === 1)
  check('A6 中性 chips 胶囊章', await page.locator('button[class*="dshm-seal-chip"]').count() === 3)
  await page.screenshot({ path: `${OUT}/w9-b5-01-home-375-light.png` })
  await context.close()
}
{
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 })
  const page = await context.newPage()
  await login(page, 'light')
  await sleep(1400)
  await page.screenshot({ path: `${OUT}/w9-b5-01-home-390-light.png` })
  await context.close()
}
{
  for (const [w, h, size] of [[375, 812, '375'], [390, 844, '390']]) {
    const context = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 2 })
    const page = await context.newPage()
    await login(page, 'dark')
    await sleep(1400)
    await page.screenshot({ path: `${OUT}/w9-b5-01-home-${size}-dark.png` })
    await context.close()
  }
}

// ── Leg B: a live chat (one real turn), then the four quadrants over it ──
const reuse = process.env['W9B5_SESSION']
let liveSession
{
  const context = await browser.newContext({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 2 })
  const page = await context.newPage()
  await login(page, 'light')
  liveSession = reuse ?? await createSession('w9b5-live')
  check('B1 会话就绪', liveSession !== undefined, `id=${String(liveSession)}${reuse === undefined ? '' : ' (reused)'}`)
  await page.goto(`${BASE}#/chat/${liveSession}`, { waitUntil: 'domcontentloaded' })
  await page.getByPlaceholder('问我任何经营问题...').waitFor({ timeout: 15_000 })
  // The send button's stamp form is only visible while idle (a running turn
  // swaps it for the stop control), so assert before the send.
  check('B2 发送钮为圆形柿橙印章（dshm-stamp-solid）', await page.locator('button[class*="dshm-stamp-solid"][aria-label="发送"]').count() === 1)
  if (reuse === undefined) {
    await page.getByPlaceholder('问我任何经营问题...').fill('查一下酱油还有多少库存')
    await page.getByRole('button', { name: '发送' }).click()
  }
  await page.locator('div[class*="userBubble"]').first().waitFor({ timeout: 20_000 })
  // The model reply (real stream): any assistant bubble beyond the welcome.
  await page.locator('div[class*="assistantBubble"]').first().waitFor({ timeout: 60_000 })
  await sleep(2600)
  const userText = (await page.locator('div[class*="userBubble"]').first().textContent()) ?? ''
  check('B3 用户气泡正文无身份行', !userText.includes('【登录身份】'), userText.slice(0, 40))
  // Frame the whole turn: scroll the flow to its top so the user bubble and
  // the turn's avatar column land in the shot.
  await page.evaluate(() => {
    const flow = document.querySelector('[class*="flowPanelOpen"], [class*="flow"]')
    if (flow !== null && flow instanceof HTMLElement) flow.scrollTop = 0
  })
  await sleep(400)
  await page.screenshot({ path: `${OUT}/w9-b5-02-chat-375-light.png` })
  console.log(`W9B5_SESSION=${liveSession}`)
  await context.close()
}
{
  for (const [w, h, size, theme] of [[375, 812, '375', 'dark'], [390, 844, '390', 'light'], [390, 844, '390', 'dark']]) {
    const context = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 2 })
    const page = await context.newPage()
    await login(page, theme)
    await page.goto(`${BASE}#/chat/${liveSession}`, { waitUntil: 'domcontentloaded' })
    await page.locator('div[class*="userBubble"]').first().waitFor({ timeout: 20_000 })
    await sleep(1200)
    await page.evaluate(() => {
      const flow = document.querySelector('[class*="flowPanelOpen"], [class*="flow"]')
      if (flow !== null && flow instanceof HTMLElement) flow.scrollTop = 0
    })
    await sleep(300)
    await page.screenshot({ path: `${OUT}/w9-b5-02-chat-${size}-${theme}.png` })
    await context.close()
  }
}

// ── Leg C: the legacy stamp-title strip (S4) — pin a stamped title, then
//    read it back through the chats list and the chat header ──
{
  const context = await browser.newContext({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 2 })
  const page = await context.newPage()
  await login(page, 'light')
  const session = await createSession('w9b5-title')
  const stamped = '【登录身份】张红喜（张红喜）——本行由系统注入：当前用户=张红喜，凡「当前用户/提交人」一律取该用户名，查待办只看该用户的待办。帮我登记一条采购单'
  const renamed = await api('w9b5-rename', 'session.rename', { sessionId: session, title: stamped })
  check('C1 stamp 标题落库（rename 成角）', renamed?.result?.ok === true)
  // The title projection truncates long pins at ~40 chars, so a legacy stamp
  // title (the stamp sentence alone already overflows) strips to nothing and
  // the display falls back — the residue is gone, which is the S4 contract.
  await page.goto(`${BASE}#/chats`, { waitUntil: 'domcontentloaded' })
  await sleep(2500)
  const listText = (await page.locator('main, [class*="list"]').first().textContent()) ?? ''
  check('C2 chats 列表标题残影剥离（stamp 不可见，降级 fallback）', !listText.includes('【登录身份】'))
  await page.screenshot({ path: `${OUT}/w9-b5-05-title-stripped-chats-375.png` })
  await page.goto(`${BASE}#/chat/${session}`, { waitUntil: 'domcontentloaded' })
  await sleep(2200)
  const headerText = (await page.locator('[class*="headerTitle"]').first().textContent()) ?? ''
  check('C3 顶栏标题残影剥离', !headerText.includes('【登录身份】') && (headerText === '新会话' || headerText === '未命名会话' || headerText.includes('帮我登记')), `header=${headerText}`)
  await page.screenshot({ path: `${OUT}/w9-b5-06-title-stripped-header-375.png` })
  await context.close()
}

// ── Leg D: the GIF frames — the B1 fill and the B2 clean bubble in one
//    continuous shot (welcome → tap starter → filled box → send → reply) ──
{
  rmSync(FRAMES, { recursive: true, force: true })
  const context = await browser.newContext({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 2 })
  const page = await context.newPage()
  await login(page, 'light')
  const session = await createSession('w9b5-gif')
  await page.goto(`${BASE}#/chat/${session}`, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('[data-testid="welcome-card"]', { timeout: 20_000 })
  const box = page.getByPlaceholder('问我任何经营问题...')
  await box.waitFor({ timeout: 10_000 })
  let frame = 0
  const snap = async () => { frame += 1; await page.screenshot({ path: `${FRAMES}/f${String(frame).padStart(2, '0')}.png` }) }
  await sleep(700)
  await snap()
  await page.locator('[data-testid="welcome-card"] button', { hasText: '查一下库存' }).click()
  await sleep(200)
  await snap()
  await sleep(700)
  await snap()
  await page.getByRole('button', { name: '发送' }).click()
  await sleep(500)
  await snap()
  await page.locator('div[class*="userBubble"]').first().waitFor({ timeout: 20_000 })
  await sleep(400)
  await snap()
  await page.locator('div[class*="assistantBubble"]').first().waitFor({ timeout: 60_000 })
  await sleep(2400)
  await snap()
  const userText = (await page.locator('div[class*="userBubble"]').first().textContent()) ?? ''
  check('D1 GIF 尾帧：纯净用户气泡（无身份行）', !userText.includes('【登录身份】'))
  await snap()
  await context.close()
}

await browser.close()

// ── The GIF over the Leg D frames ──
const gif = `${OUT}/w9-b5-chat-flow.gif`
const cp = await import('node:child_process')
cp.execFileSync('ffmpeg', [
  '-y', '-framerate', '1.1', '-i', `${FRAMES}/f%02d.png`,
  '-vf', 'scale=375:-2:flags=lanczos,split[s0][s1];[s0]palettegen=max_colors=96[p];[s1][p]paletteuse=dither=bayer:bayer_scale=4',
  '-loop', '0', gif,
], { stdio: ['ignore', 'ignore', 'pipe'] })
check('GIF 合成（B1 填入 + B2 纯净气泡同框）', existsSync(gif), gif)

// ── Before/after montages: the W8 archive shots vs today's same-viewport ──
const montage = (before, after, out) => {
  cp.execFileSync('ffmpeg', [
    '-y', '-i', before, '-i', after,
    '-filter_complex', '[0:v]scale=375:-2[a];[1:v]scale=375:-2[b];[a][b]hstack',
    '-frames:v', '1', out,
  ], { stdio: ['ignore', 'ignore', 'pipe'] })
  check(`before/after 拼图 ${out.split('/').pop()}`, existsSync(out), out)
}
montage('demos/acceptance-w8/w8-b1-02-home-light.png', `${OUT}/w9-b5-01-home-375-light.png`, `${OUT}/w9-b5-03-home-before-after-375.png`)
montage('demos/acceptance-w8/w8-b2-02-chat-flow-split-light.png', `${OUT}/w9-b5-02-chat-375-light.png`, `${OUT}/w9-b5-04-chat-before-after-375.png`)

writeFileSync(`${OUT}/w9-b5-live-probe.log`, `${LOG.join('\n')}\n`)
console.log(`\n${LOG.join('\n')}`)
