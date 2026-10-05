// W11-B3 route re-sweep: the key-route quick scan on the same :3080 dist the
// B2 evidence rode (chats/home/me light+dark, one fresh chat face) — feeds the
// B3 VLM re-audit alongside the B2 new-surface shots, and doubles as the W10
// baseline spot-check source (chats/home compared against the B1 matrix).
// Usage (repo root): node demos/acceptance-w11/.shoot-w11b3-routes.mjs
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
const shot = (page, file) => page.screenshot({ path: `${OUT}/w11-b3-${file}.png` }).then(() => console.log(`shot: w11-b3-${file}.png`))

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
  await page.waitForSelector('nav[aria-label="底部导航"]', timeoutOpt(30_000))
}
const timeoutOpt = (ms) => ({ timeout: ms })

const browser = await chromium.launch()

// ── chats/home/me × light+dark @375 ──
{
  const context = await browser.newContext({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 2 })
  const page = await context.newPage()
  await login(page, 'light')
  for (const [hash, file, settle] of [
    ['#/home', 'home-375-light', 1800],
    ['#/chats', 'chats-375-light', 2000],
    ['#/me', 'me-375-light', 1800],
  ]) {
    await page.goto(`${BASE}${hash}`, { waitUntil: 'domcontentloaded' })
    await sleep(settle)
    await shot(page, file)
  }
  // Fresh chat face (the composer strip at rest after the B2 lanes landed).
  const created = await fetch('http://127.0.0.1:3080/api/session.create', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ type: 'client-request', rpcId: 'w11b3-routes', method: 'session.create', payload: { agentPreset: 'mobile-form-assistant' } }),
  }).then(async response => response.json())
  const sid = created?.result?.ok === true ? created.result.value.sessionId : undefined
  check('chat 会话就绪', sid !== undefined, String(sid))
  await page.goto(`${BASE}#/chat/${sid}`, { waitUntil: 'domcontentloaded' })
  await page.getByPlaceholder('问我任何经营问题...').waitFor({ timeout: 15_000 })
  await sleep(1200)
  await shot(page, 'chat-fresh-375-light')
  await context.close()
}

// ── dark leg: home + chats ──
{
  const context = await browser.newContext({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 2 })
  const page = await context.newPage()
  await login(page, 'dark')
  for (const [hash, file, settle] of [
    ['#/home', 'home-375-dark', 1800],
    ['#/chats', 'chats-375-dark', 2000],
  ]) {
    await page.goto(`${BASE}${hash}`, { waitUntil: 'domcontentloaded' })
    await sleep(settle)
    await shot(page, file)
  }
  await context.close()
}

await browser.close()
writeFileSync(`${OUT}/w11-b3-routes-shoot.log`, `${LOG.join('\n')}\n`)
console.log(`\n${LOG.join('\n')}\n`)
