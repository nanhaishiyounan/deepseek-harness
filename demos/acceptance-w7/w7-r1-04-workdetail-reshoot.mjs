// W7-R1 P1-7 evidence: re-shoot the work-detail surface on both tracks after
// the --dshm-stamp-doing token build, so the doing seal's dark-track lift
// (#2a5fa6 → #5783bc, 2.38 → 3.89:1 on the ticket card) is visible as images
// at the R1 point in time. Routes to a real #/work/:id whose item is `doing`
// (the device store is demo-seeded fresh per cleared profile; a doing item is
// asserted, not assumed). Complements the DOM figures in
// demos/acceptance-w7/w7-r1-04-dark-probe.json.
// Usage (repo root): node demos/acceptance-w7/w7-r1-04-workdetail-reshoot.mjs
import { chromium } from '../../apps/web/node_modules/playwright/index.mjs'

const BASE = 'http://127.0.0.1:3080/mobile.html'
const OUT = 'demos/acceptance-w7/'
const sleep = (ms) => new Promise((resolve) => { setTimeout(resolve, ms) })

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 })
await page.goto(`${BASE}#/login`, { waitUntil: 'domcontentloaded' })
await page.evaluate(() => {
  localStorage.clear()
  localStorage.setItem('dsh-mobile-theme', 'light')
})
await page.reload({ waitUntil: 'domcontentloaded' })
await page.getByText('食链通').first().waitFor({ timeout: 15_000 })
await page.getByPlaceholder('业务账号（如 buyer）').fill('qc_inspector')
await page.getByPlaceholder('业务账号密码').fill('Qc#2026')
await page.getByRole('button', { name: '登录' }).click()
await page.waitForSelector('nav[aria-label="底部导航"]', { timeout: 30_000 })
await sleep(1000)

await page.goto(`${BASE}#/work`, { waitUntil: 'domcontentloaded' })
await page.waitForSelector('[aria-label="工作列表"]', { timeout: 15_000 })
await sleep(900)
const doingId = await page.evaluate(() => {
  const shape = JSON.parse(localStorage.getItem('dsh-mobile-work') ?? '{"items":[]}')
  const doing = (Array.isArray(shape.items) ? shape.items : []).find((item) => item.status === 'doing')
  return doing === undefined ? null : String(doing.id)
})
if (doingId === null) {
  console.error('no doing item in the demo-seeded work store — cannot shoot the doing seal')
  process.exit(1)
}
await page.goto(`${BASE}#/work/${doingId}`, { waitUntil: 'domcontentloaded' })
await sleep(1400)
const stampLight = await page.evaluate(() => {
  const stamp = document.querySelector('[data-testid="work-stamp"][data-status="doing"]')
  return stamp === null ? null : getComputedStyle(stamp).color
})
await page.screenshot({ path: `${OUT}w7-r1-04-work-detail-light.png` })
console.log(`light #/work/${doingId} stamp=${stampLight}`)

await page.evaluate(() => { localStorage.setItem('dsh-mobile-theme', 'dark') })
await page.reload({ waitUntil: 'domcontentloaded' })
await sleep(1400)
const stampDark = await page.evaluate(() => {
  const stamp = document.querySelector('[data-testid="work-stamp"][data-status="doing"]')
  return stamp === null ? null : getComputedStyle(stamp).color
})
await page.screenshot({ path: `${OUT}w7-r1-04-work-detail-dark.png` })
console.log(`dark #/work/${doingId} stamp=${stampDark}`)

await browser.close()
process.exit(0)
