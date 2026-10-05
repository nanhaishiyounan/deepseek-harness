// W11-B1 T4 route sweep: the W10-B3 matrix re-shot on the rebuilt :3080 dist
// (post padding/focus fixes) — the 10-route light dozen + work detail, dark
// spot-checks, login faces, and the 390 leg — feeding the mmx vision audit.
// Usage (repo root): node demos/acceptance-w11/.shoot-w11b1-routes.mjs
import { writeFileSync } from 'node:fs'
import { chromium } from '../../apps/web/node_modules/playwright/index.mjs'

const BASE = 'http://127.0.0.1:3080/mobile.html'
const OUT = 'demos/acceptance-w11'
const LOG = []
const sleep = (ms) => new Promise((resolve) => { setTimeout(resolve, ms) })
const check = (name, ok, detail = '') => {
  const line = `${ok ? 'PASS' : 'FAIL'} ${name}${detail === '' ? '' : ` — ${detail}`}`
  console.log(line)
  LOG.push(line)
  if (!ok) process.exitCode = 1
}
const shot = (page, file) => page.screenshot({ path: `${OUT}/w11-b1-${file}.png` }).then(() => console.log(`shot: w11-b1-${file}.png`))

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

// ── Light@375 route dozen (no model turn: the ix matrix already covers chat) ──
{
  const context = await browser.newContext({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 2 })
  const page = await context.newPage()
  await login(page, 'light')
  for (const [hash, file, settle] of [
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
  ]) {
    await page.goto(`${BASE}${hash}`, { waitUntil: 'domcontentloaded' })
    await sleep(settle)
    await shot(page, file)
  }
  // Chat idle face (fresh session, welcome card + empty composer at rest).
  const sid = await createSession('w11b1-routes')
  check('chat 会话就绪', sid !== undefined, String(sid))
  await page.goto(`${BASE}#/chat/${sid}`, { waitUntil: 'domcontentloaded' })
  await page.getByPlaceholder('问我任何经营问题...').waitFor({ timeout: 15_000 })
  await sleep(1200)
  await shot(page, 'chat-375-light')
  // Long-content scroll on docs (mid-page).
  await page.goto(`${BASE}#/docs`, { waitUntil: 'domcontentloaded' })
  await sleep(1800)
  await page.mouse.wheel(0, 900)
  await sleep(700)
  await shot(page, 'ix-docs-scroll-375-light')
  await context.close()
}

// ── Work detail@375 light over buyer ──
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

// ── Dark@375 spot-checks ──
{
  const context = await browser.newContext({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 2 })
  const page = await context.newPage()
  await login(page, 'dark')
  for (const [hash, file, settle] of [
    ['#/home', 'home-375-dark', 1800],
    ['#/work', 'work-375-dark', 2400],
    ['#/me', 'me-375-dark', 1800],
    ['#/chats', 'chats-375-dark', 2000],
  ]) {
    await page.goto(`${BASE}${hash}`, { waitUntil: 'domcontentloaded' })
    await sleep(settle)
    await shot(page, file)
  }
  await context.close()
}

// ── Login faces + 390 leg ──
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
writeFileSync(`${OUT}/w11-b1-routes-shoot.log`, `${LOG.join('\n')}\n`)
console.log(`\n${LOG.join('\n')}\n`)
