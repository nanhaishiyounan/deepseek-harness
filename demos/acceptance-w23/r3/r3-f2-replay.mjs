// W23-R3 F2 scenario (c): a fresh replay of the leak question in the z2
// session — persona discipline + the render-side denylist on a new turn.
// Usage: node demos/acceptance-w23/r3/r3-f2-replay.mjs
import { writeFileSync } from 'node:fs'
import { chromium } from '../../../apps/web/node_modules/playwright/index.mjs'

const BASE = 'http://127.0.0.1:3080/mobile.html'
const OUT = 'demos/acceptance-w23/r3'
const TOKEN_RE = /wfl_[A-Za-z0-9_]+|ask_[a-z_]+|suggestions|nb_[a-z_]+|kg_[a-z_]+|kb_search|lakehouse_[a-z_]+|connector_[a-z_]+|form_draft|form_confirm|reject_flow|submit_receipt|present_card/

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 375, height: 812 } })
const wait = (ms) => new Promise((resolve) => { setTimeout(resolve, ms) })
const login = async (user, pass) => {
  await page.goto(`${BASE}#/login`, { waitUntil: 'domcontentloaded' })
  await page.evaluate(() => { localStorage.clear(); localStorage.setItem('dsh-mobile-theme', 'light') })
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.getByPlaceholder('业务账号（如 buyer）').fill(user)
  await page.getByPlaceholder('业务账号密码').fill(pass)
  await page.getByRole('button', { name: '登录' }).click()
  await page.waitForSelector('nav[aria-label="底部导航"]', 30_000)
}
await login('buyer', 'Buyer#2026')
const probe = { at: new Date().toISOString() }

await page.goto(`${BASE}#/chat/session-453ee9d6-3da6-4417-9a9b-9234b0f7eb21`, { waitUntil: 'domcontentloaded' })
// The history must land first: the存量 cards render before the send.
await page.waitForSelector('[class*="reportSubtitle"]', 30_000)
await wait(1500)
const before = await page.locator('[class*="reportSubtitle"]').count()
await page.getByPlaceholder('问我任何经营问题...').fill('再查一遍我名下的待审批明细，出一张卡')
await page.keyboard.press('Enter')
// The sent bubble proves the send; then the turn settles (running row leaves).
await page.waitForSelector('text=再查一遍我名下的待审批明细', { timeout: 30_000 })
await page.waitForSelector('[aria-label="AI 同事正在处理…"]', { timeout: 30_000 }).catch(() => {})
await page.waitForFunction(
  () => !document.querySelector('[aria-label="AI 同事正在处理…"]'),
  { timeout: 300_000 },
)
await wait(2500)
probe.subtitlesBefore = before
probe.result = await page.evaluate((re) => {
  const re2 = new RegExp(re)
  const subs = [...document.querySelectorAll('[class*="reportSubtitle"]')].map(el => el.textContent ?? '')
  return {
    subtitles: subs,
    newSubtitle: subs.length,
    subtitleTokenLeaks: subs.filter(s => re2.test(s)),
    newBodyLeakTail: ((document.body.textContent ?? '').match(re2) ?? []).length,
  }
}, TOKEN_RE.source)
await page.screenshot({ path: `${OUT}/r3-f2-fresh-replay-clean.png`, fullPage: false })
writeFileSync(`${OUT}/r3-f2-replay-probe.json`, JSON.stringify(probe, null, 2))
console.log(JSON.stringify(probe, null, 2))
await browser.close()
console.log('done')
