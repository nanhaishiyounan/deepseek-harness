// W10-B3 vision-audit shoot: fresh live screenshots over the rebuilt :3080
// gateway (build verified to carry w9-r1 tokens). The matrix: the 13-route
// light@375 dozen + login, four dark spot-checks, a 390 leg, and three
// interaction states (form focus / ask-choice open / long-content scroll).
// Usage (repo root): node demos/acceptance-w10/.shoot-w10b1.mjs
import { writeFileSync, readFileSync } from 'node:fs'
import { chromium } from '../../apps/web/node_modules/playwright/index.mjs'

const BASE = 'http://127.0.0.1:3080/mobile.html'
const OUT = 'demos/acceptance-w10'
const LOG = []
const sleep = (ms) => new Promise((resolve) => { setTimeout(resolve, ms) })
const check = (name, ok, detail = '') => {
  const line = `${ok ? 'PASS' : 'FAIL'} ${name}${detail === '' ? '' : ` — ${detail}`}`
  console.log(line)
  LOG.push(line)
  if (!ok) process.exitCode = 1
}
const shot = (page, file) => {
  const full = `${OUT}/w10-b3-${file}.png`
  return page.screenshot({ path: full }).then(() => console.log(`shot: w10-b3-${file}.png`))
}

const login = async (page, theme, account = 'qc_inspector', password = 'Qc#2026') => {
  await page.goto(`${BASE}#/login`, { waitUntil: 'domcontentloaded' })
  await page.evaluate((key) => {
    localStorage.clear()
    localStorage.setItem('dsh-mobile-theme', key)
  }, theme)
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.getByPlaceholder('业务账号（如 buyer）').fill(account)
  await page.getByPlaceholder('业务账号密码').fill(password)
  await page.getByRole('button', { name: '登录' }).click()
  await page.waitForSelector('nav[aria-label="底部导航"]', { timeout: 30_000 })
}

const createSession = async (rpcId) => {
  const created = await fetch('http://127.0.0.1:3080/api/session.create', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ type: 'client-request', rpcId, method: 'session.create', payload: { agentPreset: 'mobile-form-assistant' } }),
  }).then(async response => response.json())
  return created?.result?.ok === true ? created.result.value.sessionId : undefined
}

const browser = await chromium.launch()

// ── Light @375: the route dozen ──
const lightRoutes = [
  ['#/home', 'home-375-light', 1800],
  ['#/chats', 'chats-375-light', 2000],
  ['#/work', 'work-375-light', 2200],
  ['#/tasks', 'tasks-375-light', 2000],
  ['#/files', 'files-375-light', 2000],
  ['#/agents', 'agents-375-light', 2000],
  ['#/me', 'me-375-light', 1800],
  ['#/todos', 'todos-375-light', 2200],
  ['#/alerts', 'alerts-375-light', 2200],
  ['#/docs', 'docs-375-light', 2200],
]
{
  const context = await browser.newContext({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 2 })
  const page = await context.newPage()
  await login(page, 'light')
  for (const [hash, file, settle] of lightRoutes) {
    await page.goto(`${BASE}${hash}`, { waitUntil: 'domcontentloaded' })
    await sleep(settle)
    await shot(page, file)
  }
  // A live chat face (fresh register turn — captures whichever tier the real
  // model turn produces: prose, ask-choice, or draft card).
  const chatSession = process.env['W10B1_CHAT'] ?? await createSession('w10b1-shot')
  check('chat 会话就绪', chatSession !== undefined, String(chatSession))
  await page.goto(`${BASE}#/chat/${chatSession}`, { waitUntil: 'domcontentloaded' })
  await page.getByPlaceholder('问我任何经营问题...').waitFor({ timeout: 15_000 })
  await page.getByPlaceholder('问我任何经营问题...').fill('帮我登记一条采购单：供应商宏发食品，高筋面粉 500kg，单价 3.2')
  await page.getByRole('button', { name: '发送' }).click()
  const card = page.locator('[data-testid="draft-card-v3"], [data-testid="field-ask"], [data-testid="ask-choice"], [data-testid="receipt-card-v3"]').first()
  let cardShown = true
  try { await card.waitFor({ timeout: 90_000 }) } catch { cardShown = false }
  await sleep(1200)
  await shot(page, 'chat-375-light')
  check('chat 回合卡面出现', cardShown, cardShown ? '' : '模型走纯文本路径（卡片渲染由 v3 spec 覆盖）')
  writeFileSync(`${OUT}/.w10b1-chat-session`, String(chatSession))

  // Interaction state 1: the ask/draft tier with an open control if present,
  // else the composer focused. Long-content scroll: docs to mid-page.
  const askChoice = page.locator('[data-testid="ask-choice"] button, .dshm-choice, [data-testid="field-ask"] button').first()
  let choiceOpen = false
  if (await askChoice.count() > 0) {
    try { await askChoice.click({ timeout: 5000 }); choiceOpen = true; await sleep(900) } catch { /* keep composer fallback */ }
  }
  if (!choiceOpen) {
    await page.getByPlaceholder('问我任何经营问题...').focus().catch(() => {})
    await sleep(600)
  }
  await shot(page, `ix-${choiceOpen ? 'choice-open' : 'composer-focus'}-375-light`)

  // Interaction state 2: long-content scroll (docs mid-page exposes sticky
  // headers, list dividers and reading rhythm under scroll).
  await page.goto(`${BASE}#/docs`, { waitUntil: 'domcontentloaded' })
  await sleep(1800)
  await page.mouse.wheel(0, 900)
  await sleep(700)
  await shot(page, 'ix-docs-scroll-375-light')
  await context.close()
}

// ── Work detail @375 light over the buyer account (routed wfl rows) ──
{
  const context = await browser.newContext({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 2 })
  const page = await context.newPage()
  await login(page, 'light', 'buyer', 'Buyer#2026')
  await page.goto(`${BASE}#/work`, { waitUntil: 'domcontentloaded' })
  await sleep(2600)
  const row = page.locator('[aria-label="工作列表"] button[aria-label^="打开"]').first()
  if (await row.count() > 0) {
    await row.click()
    await sleep(2400)
  }
  check('work 详情路由进入', /#\/work\/.+/.test(page.url()), page.url())
  await shot(page, 'work-detail-375-light')
  await context.close()
}

// ── Dark spot-checks @375 ──
{
  const context = await browser.newContext({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 2 })
  const page = await context.newPage()
  await login(page, 'dark')
  for (const [hash, file, settle] of [
    ['#/home', 'home-375-dark', 1800],
    ['#/work', 'work-375-dark', 2400],
    ['#/me', 'me-375-dark', 1800],
  ]) {
    await page.goto(`${BASE}${hash}`, { waitUntil: 'domcontentloaded' })
    await sleep(settle)
    await shot(page, file)
  }
  // Dark chat face on the light-leg session (content already in place).
  const chatSession = process.env['W10B1_CHAT'] ?? readFileSync(`${OUT}/.w10b1-chat-session`, 'utf8').trim()
  if (chatSession !== undefined && chatSession !== '') {
    await page.goto(`${BASE}#/chat/${chatSession}`, { waitUntil: 'domcontentloaded' })
    await sleep(1800)
    await shot(page, 'chat-375-dark')
  }
  await context.close()
}

// ── Login (logged-out face) both tracks ──
for (const theme of ['light', 'dark']) {
  const context = await browser.newContext({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 2 })
  const page = await context.newPage()
  await page.goto(`${BASE}#/login`, { waitUntil: 'domcontentloaded' })
  await page.evaluate((key) => {
    localStorage.clear()
    localStorage.setItem('dsh-mobile-theme', key)
  }, theme)
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.getByText('食链通').first().waitFor({ timeout: 15_000 })
  await sleep(900)
  await shot(page, `login-375-${theme}`)
  await context.close()
}

// ── 390 leg (light) ──
{
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 })
  const page = await context.newPage()
  await login(page, 'light')
  for (const [hash, file, settle] of [
    ['#/home', 'home-390-light', 1800],
    ['#/todos', 'todos-390-light', 2200],
  ]) {
    await page.goto(`${BASE}${hash}`, { waitUntil: 'domcontentloaded' })
    await sleep(settle)
    await shot(page, file)
  }
  await context.close()
}

await browser.close()
writeFileSync(`${OUT}/w10-b3-shoot.log`, `${LOG.join('\n')}\n`)
console.log(`\n${LOG.join('\n')}\n`)
