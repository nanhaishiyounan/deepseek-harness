// W7 mobile v6 aesthetic audit shots: real login (nocobase.signIn through the
// login card) → per-route 390×844 captures over the live 3080 gateway.
// Usage (repo root): node research/2026-10-03-w7-audit/.m-shot.mjs
// Evidence lands in research/2026-10-03-w7-audit/shots-mobile/.
// Precedent: research/2026-10-01-w6-rework/.b1shot.mjs (Playwright import path,
// mobile login), demos/acceptance-w6 w6-b10 role accounts (qc_inspector/Qc#2026).
import { chromium } from '../../apps/web/node_modules/playwright/index.mjs'
import { mkdirSync } from 'node:fs'

const BASE = 'http://127.0.0.1:3080/mobile.html'
const OUT = 'research/2026-10-03-w7-audit/shots-mobile'
const ACCOUNT = process.env.M_ACCOUNT ?? 'qc_inspector'
const PASSWORD = process.env.M_PASSWORD ?? 'Qc#2026'

const log = (line) => console.log(line)
const sleep = (ms) => new Promise((resolve) => { setTimeout(resolve, ms) })

mkdirSync(OUT, { recursive: true })
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 })

// -- 01: logged-out login gate -------------------------------------------------
await page.goto(`${BASE}#/login`, { waitUntil: 'domcontentloaded' })
await page.evaluate(() => { localStorage.clear() })
await page.goto(`${BASE}#/login`, { waitUntil: 'domcontentloaded' })
await page.getByText('食链通').first().waitFor({ timeout: 15_000 })
await sleep(500)
await page.screenshot({ path: `${OUT}/01-login.png` })
log('shot 01-login')

// -- real sign-in (W6-B0: nocobase.signIn over the real NocoBase account) -----
await page.getByPlaceholder('业务账号（如 buyer）').fill(ACCOUNT)
await page.getByPlaceholder('业务账号密码').fill(PASSWORD)
await page.getByRole('button', { name: '登录' }).click()
await page.waitForSelector('nav[aria-label="底部导航"]', { timeout: 30_000 })
await sleep(900)
const who = await page.evaluate(() => JSON.parse(localStorage.getItem('dsh-mobile-auth') ?? '{}').username)
log(`signed in: ${String(who)}`)

const shoot = async (name, hash, marker, wait = 900) => {
  await page.goto(`${BASE}${hash}`, { waitUntil: 'domcontentloaded' })
  if (marker !== undefined) {
    await page.waitForSelector(marker, { timeout: 15_000 }).catch(() => { log(`  [warn] ${name}: marker miss ${marker}`) })
  }
  await sleep(wait)
  await page.screenshot({ path: `${OUT}/${name}.png` })
  log(`shot ${name}`)
}

// -- tab surfaces (light track) ------------------------------------------------
await shoot('02-home-light', '#/', 'text=今日台账')
await shoot('03-agents-light', '#/agents', '[aria-label="AI 同事目录"]')
await shoot('04-work-light', '#/work', '[aria-label="工作列表"]')
await shoot('05-me-light', '#/me', 'text=深色模式')
await shoot('06-chats-light', '#/chats', '[aria-label="会话列表"]')

// -- 07: chat detail — open the first session row ------------------------------
await page.goto(`${BASE}#/chats`, { waitUntil: 'domcontentloaded' })
await page.waitForSelector('[aria-label="会话列表"] button', { timeout: 15_000 })
await page.locator('[aria-label="会话列表"] button').first().click()
await page.waitForURL(/#\/chat\//, { timeout: 15_000 })
await sleep(1600)
await page.screenshot({ path: `${OUT}/07-chat-light.png` })
log('shot 07-chat-light')

// -- computed-style probes (hard numbers for the audit report) -----------------
await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' })
await page.waitForSelector('text=今日台账', { timeout: 15_000 })
await sleep(600)
const probe = await page.evaluate(() => {
  const pick = (selector, props) => {
    const el = document.querySelector(selector)
    if (el === null) return null
    const cs = getComputedStyle(el)
    return Object.fromEntries(props.map((p) => [p, cs[p]]))
  }
  return {
    rootBg: pick('.dshm-root', ['background-color', 'font-family', 'color']),
    hero: pick('[class*="heroTitle"]', ['font-size', 'font-weight', 'color']),
    statValue: pick('[class*="statValue"]', ['font-size', 'font-family']),
    statLabel: pick('[class*="statLabel"]', ['font-size', 'color']),
    tabTitle: pick('.adm-tab-bar-item-title', ['font-size', 'font-weight']),
    tabActive: pick('.adm-tab-bar-item-active', ['color']),
    card: pick('[class*="statsCard"]', ['border-radius', 'box-shadow', 'border-color']),
  }
})
log(`probe(light): ${JSON.stringify(probe, null, 2)}`)
await page.goto(`${BASE}#/chats`, { waitUntil: 'domcontentloaded' })
await page.waitForSelector('[aria-label="会话列表"] button', { timeout: 15_000 })
await page.locator('[aria-label="会话列表"] button').first().click()
await page.waitForURL(/#\/chat\//, { timeout: 15_000 })
await sleep(1000)
const chatProbe = await page.evaluate(() => {
  const pick = (selector, props) => {
    const el = document.querySelector(selector)
    if (el === null) return null
    const cs = getComputedStyle(el)
    return Object.fromEntries(props.map((p) => [p, cs[p]]))
  }
  return {
    aiBubble: pick('[class*="assistantBubble"]', ['background-color', 'border-radius', 'padding', 'font-size', 'line-height', 'color']),
    composer: pick('[class*="inputBar"], [class*="composer"]', ['background-color', 'padding']),
  }
})
log(`probe(chat): ${JSON.stringify(chatProbe, null, 2)}`)

// -- 08: work detail — click the first card button in the work list ------------
await page.goto(`${BASE}#/work`, { waitUntil: 'domcontentloaded' })
await page.waitForSelector('[aria-label="工作列表"]', { timeout: 15_000 })
const cardButton = page.locator('[aria-label="工作列表"] button').first()
if (await cardButton.count() > 0) {
  await cardButton.click().catch(() => { log('  [warn] work card click failed') })
  await sleep(1400)
  await page.screenshot({ path: `${OUT}/08-work-detail-light.png` })
  log('shot 08-work-detail-light')
} else {
  log('  [warn] no work card button; skipping detail')
}

// -- secondary surfaces (light track) -------------------------------------------
await shoot('09-todos-light', '#/todos', undefined, 1600)
await shoot('10-docs-light', '#/docs', '[data-testid="docs-collection"]', 1400)
await shoot('11-alerts-light', '#/alerts', undefined, 1600)
await shoot('12-tasks-light', '#/tasks', undefined, 1400)
await shoot('13-files-light', '#/files', undefined, 1400)

// -- dark track: flip the persisted theme, reload, re-shoot the trio ------------
await page.evaluate(() => { localStorage.setItem('dsh-mobile-theme', 'dark') })
await page.goto(`${BASE}#/me`, { waitUntil: 'domcontentloaded' })
await page.reload({ waitUntil: 'domcontentloaded' })
await page.waitForSelector('text=深色模式', { timeout: 15_000 })
await sleep(900)
await page.screenshot({ path: `${OUT}/16-me-dark.png` })
log('shot 16-me-dark')
await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' })
await page.waitForSelector('text=今日台账', { timeout: 15_000 })
await sleep(900)
await page.screenshot({ path: `${OUT}/14-home-dark.png` })
log('shot 14-home-dark')
await page.goto(`${BASE}#/chats`, { waitUntil: 'domcontentloaded' })
await page.waitForSelector('[aria-label="会话列表"] button', { timeout: 15_000 })
await page.locator('[aria-label="会话列表"] button').first().click()
await page.waitForURL(/#\/chat\//, { timeout: 15_000 })
await sleep(1400)
await page.screenshot({ path: `${OUT}/15-chat-dark.png` })
log('shot 15-chat-dark')

await page.evaluate(() => { localStorage.removeItem('dsh-mobile-theme') })
await browser.close()
log('done')
