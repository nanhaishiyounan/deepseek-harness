// W23-B2 live verification pass 2: admin alerts (the far fold + day-range
// groups need the admin's full routed set) and the hero count line.
import { writeFileSync } from 'node:fs'
import { chromium } from '../../apps/web/node_modules/playwright/index.mjs'

const BASE = 'http://127.0.0.1:3080/mobile.html'
const OUT = 'demos/acceptance-w23'

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 375, height: 812 } })
const login = async (user, pass) => {
  await page.goto(`${BASE}#/login`, { waitUntil: 'domcontentloaded' })
  await page.evaluate(() => { localStorage.clear(); localStorage.setItem('dsh-mobile-theme', 'light') })
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.getByPlaceholder('业务账号（如 buyer）').fill(user)
  await page.getByPlaceholder('业务账号密码').fill(pass)
  await page.getByRole('button', { name: '登录' }).click()
  await page.waitForSelector('nav[aria-label="底部导航"]', 30_000)
}
await login('admin', 'Admin#2026')
console.log('logged in as admin')
await page.goto(`${BASE}#/alerts`, { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(2600)
const probe = {}
probe.bands = await page.evaluate(() => [...document.querySelectorAll('h2')].map(h => h.textContent ?? ''))
const farButton = page.locator('button', { hasText: '条远期提醒' }).first()
if (await farButton.count() > 0) {
  probe.farFold = (await farButton.textContent())?.trim()
  await farButton.click().catch(() => {})
  await page.waitForTimeout(800)
  const ranged = page.locator('[data-testid="alert-group"]').filter({ hasText: /~\d+ 天后到期/ })
  probe.rangedGroups = Math.min(await ranged.count(), 8)
  probe.rangedSample = (await ranged.first().textContent())?.slice(0, 110)
}
await page.screenshot({ path: `${OUT}/b2-07-admin-alerts-far.png`, fullPage: true })
console.log('admin alerts:', JSON.stringify(probe))

// buyer hero line recheck (the count vocabulary).
await login('buyer', 'Buyer#2026')
await page.goto(`${BASE}#/`, { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(2000)
probe.heroLines = await page.evaluate(() =>
  [...document.querySelectorAll('p,span,small,b')].map(el => (el.textContent ?? '').trim())
    .filter(t => /今天|项预警待看/.test(t) && t.length < 60).slice(0, 4))
await page.screenshot({ path: `${OUT}/b2-08-buyer-hero-line.png`, fullPage: false })
console.log('buyer hero:', JSON.stringify(probe.heroLines))
writeFileSync(`${OUT}/b2-live2-probe.json`, JSON.stringify(probe, null, 2))
await browser.close()
console.log('done')
