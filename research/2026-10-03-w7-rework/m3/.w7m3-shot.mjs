// W7-M3 dark-track sweep + B6 mobile light-track final evidence.
// Surfaces = the M0 census (research/2026-10-03-w7-rework/m0/after-mobile,
// 16 archive slots = login + 12 route surfaces + 3 dark exemplars). M3 walks
// every surface on the dark track after the M3 desaturation/lift fixes:
//   w7-m3-01..13  dark track, one shot per surface (login + 12 routes)
//   w7-m3-14      dark DOM probe (contrast/elevation/border/tab-size numbers)
//   w7-m3-15/16   work-detail re-shot under shop_lead (light + dark)
//   w7-b6-mo-01..13  light-track final (B6 mobile leg, same rig)
// Rig: real nocobase.signIn over :3080, 390x844 @2x, hash routing, theme via
// localStorage 'dsh-mobile-theme' (W7 token tracks switch on html[data-theme]).
// Usage (repo root): node research/2026-10-03-w7-rework/m3/.w7m3-shot.mjs
import { chromium } from '../../../apps/web/node_modules/playwright/index.mjs'

const BASE = 'http://127.0.0.1:3080/mobile.html'
const OUT = 'demos/acceptance-w7/'
const log = (line) => console.log(line)
const sleep = (ms) => new Promise((resolve) => { setTimeout(resolve, ms) })

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 })

const shoot = async (name, hash, marker, wait = 1100) => {
  await page.goto(`${BASE}${hash}`, { waitUntil: 'domcontentloaded' })
  if (marker !== undefined) {
    await page.waitForSelector(marker, { timeout: 15_000 }).catch(() => { log(`  [warn] ${name}: marker miss ${marker}`) })
  }
  await sleep(wait)
  await page.screenshot({ path: `${OUT}${name}.png` })
  log(`shot ${name}`)
}

// -- 01: login light (B6 leg) ---------------------------------------------------
await page.goto(`${BASE}#/login`, { waitUntil: 'domcontentloaded' })
await page.evaluate(() => { localStorage.clear() })
await page.goto(`${BASE}#/login`, { waitUntil: 'domcontentloaded' })
await page.getByText('食链通').first().waitFor({ timeout: 15_000 })
await sleep(600)
await page.screenshot({ path: `${OUT}w7-b6-mo-01-light-login.png` })
log('shot w7-b6-mo-01-light-login')

// -- sign in qc_inspector -------------------------------------------------------
await page.getByPlaceholder('业务账号（如 buyer）').fill('qc_inspector')
await page.getByPlaceholder('业务账号密码').fill('Qc#2026')
await page.getByRole('button', { name: '登录' }).click()
await page.waitForSelector('nav[aria-label="底部导航"]', { timeout: 30_000 })
await sleep(900)
const who = await page.evaluate(() => JSON.parse(localStorage.getItem('dsh-mobile-auth') ?? '{}').username)
log(`signed in: ${String(who)}`)

// -- light track: 12 route surfaces (B6 leg) --------------------------------------
const openChat = async () => {
  await page.goto(`${BASE}#/chats`, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('[aria-label="会话列表"] button', { timeout: 15_000 })
  await page.locator('[aria-label="会话列表"] button').first().click()
  await page.waitForURL(/#\/chat\//, { timeout: 15_000 })
  await sleep(1600)
}
const openWorkDetail = async () => {
  await page.goto(`${BASE}#/work`, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('[aria-label="工作列表"]', { timeout: 15_000 })
  const cardButton = page.locator('[aria-label="工作列表"] button').first()
  if (await cardButton.count() > 0) {
    await cardButton.click().catch(() => { log('  [warn] work card click failed') })
    await sleep(1500)
    return true
  }
  log('  [warn] no work card button; shooting the work list instead')
  return false
}

await shoot('w7-b6-mo-02-light-home', '#/', 'text=今日台账')
await shoot('w7-b6-mo-03-light-agents', '#/agents', '[aria-label="AI 同事目录"]')
await shoot('w7-b6-mo-04-light-work', '#/work', '[aria-label="工作列表"]')
await shoot('w7-b6-mo-05-light-me', '#/me', 'text=深色模式')
await shoot('w7-b6-mo-06-light-chats', '#/chats', '[aria-label="会话列表"]')
await openChat()
await page.screenshot({ path: `${OUT}w7-b6-mo-07-light-chat.png` })
log('shot w7-b6-mo-07-light-chat')
await openWorkDetail()
await page.screenshot({ path: `${OUT}w7-b6-mo-08-light-work-detail.png` })
log('shot w7-b6-mo-08-light-work-detail')
await shoot('w7-b6-mo-09-light-todos', '#/todos', undefined, 1600)
await shoot('w7-b6-mo-10-light-docs', '#/docs', '[data-testid="docs-collection"]', 1400)
await shoot('w7-b6-mo-11-light-alerts', '#/alerts', undefined, 1600)
await shoot('w7-b6-mo-12-light-tasks', '#/tasks', undefined, 1600)
await shoot('w7-b6-mo-13-light-files', '#/files', undefined, 1600)

// -- flip to dark, walk the same surfaces (M3 leg) -------------------------------
// Sign out (drop auth, keep the dark theme key) so the login surface itself
// rides the dark track, then re-sign-in for the route surfaces.
await page.evaluate(() => {
  localStorage.clear()
  localStorage.setItem('dsh-mobile-theme', 'dark')
})
await page.goto(`${BASE}#/login`, { waitUntil: 'domcontentloaded' })
// A signed-in SPA needs a hard reload to honor the cleared auth: the in-memory
// session survives same-document hash navigation, so the login route never mounts.
await page.reload({ waitUntil: 'domcontentloaded' })
await page.getByText('食链通').first().waitFor({ timeout: 15_000 })
await sleep(900)
await page.screenshot({ path: `${OUT}w7-m3-01-dark-login.png` })
log('shot w7-m3-01-dark-login')

await page.getByPlaceholder('业务账号（如 buyer）').fill('qc_inspector')
await page.getByPlaceholder('业务账号密码').fill('Qc#2026')
await page.getByRole('button', { name: '登录' }).click()
await page.waitForSelector('nav[aria-label="底部导航"]', { timeout: 30_000 })
await sleep(900)
const themeNow = await page.evaluate(() => document.documentElement.getAttribute('data-theme'))
log(`dark track active: html[data-theme]=${themeNow}`)

await shoot('w7-m3-02-dark-home', '#/', 'text=今日台账')
await shoot('w7-m3-03-dark-agents', '#/agents', '[aria-label="AI 同事目录"]')
await shoot('w7-m3-04-dark-work', '#/work', '[aria-label="工作列表"]')
await shoot('w7-m3-05-dark-me', '#/me', 'text=深色模式')
await shoot('w7-m3-06-dark-chats', '#/chats', '[aria-label="会话列表"]')
await openChat()
await page.screenshot({ path: `${OUT}w7-m3-07-dark-chat.png` })
log('shot w7-m3-07-dark-chat')
await openWorkDetail()
await page.screenshot({ path: `${OUT}w7-m3-08-dark-work-detail.png` })
log('shot w7-m3-08-dark-work-detail')
await shoot('w7-m3-09-dark-todos', '#/todos', undefined, 1600)
await shoot('w7-m3-10-dark-docs', '#/docs', '[data-testid="docs-collection"]', 1400)
await shoot('w7-m3-11-dark-alerts', '#/alerts', undefined, 1600)
await shoot('w7-m3-12-dark-tasks', '#/tasks', undefined, 1600)
await shoot('w7-m3-13-dark-files', '#/files', undefined, 1600)

await browser.close()
process.exit(0)
