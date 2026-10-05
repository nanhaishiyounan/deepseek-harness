// W9-B4 shell evidence shots: the amber-foundation shell on both tracks at
// 375px — home (tab tray + hero card + stat ledger) so the warm-paper canvas,
// the persimmon heartbeats, and the amber tab slot are all in frame. Real
// dev-server shots against the rebuilt dist (never the mocks).
// Usage (repo root): node demos/acceptance-w9/.shoot-w9b4.mjs
import { chromium } from '../../apps/web/node_modules/playwright/index.mjs'

const BASE = 'http://127.0.0.1:3080/mobile.html'
const OUT = 'demos/acceptance-w9'
const sleep = (ms) => new Promise((resolve) => { setTimeout(resolve, ms) })

const browser = await chromium.launch()
async function leg(theme, file) {
  const page = await browser.newPage({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 2 })
  await page.goto(`${BASE}#/login`, { waitUntil: 'domcontentloaded' })
  await page.evaluate((key) => {
    localStorage.clear()
    localStorage.setItem('dsh-mobile-theme', key)
  }, theme)
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.getByText('食链通').first().waitFor({ timeout: 15_000 })
  await page.getByPlaceholder('业务账号（如 buyer）').fill('qc_inspector')
  await page.getByPlaceholder('业务账号密码').fill('Qc#2026')
  await page.getByRole('button', { name: '登录' }).click()
  await page.waitForSelector('nav[aria-label="底部导航"]', { timeout: 30_000 })
  await sleep(1500)
  await page.screenshot({ path: `${OUT}/${file}` })
  console.log(`shot: ${file}`)
  await page.close()
}
await leg('light', 'w9-b4-01-shell-light-375.png')
await leg('dark', 'w9-b4-02-shell-dark-375.png')
await browser.close()
console.log('done')
