// W7-M3 work-detail re-shot under shop_lead (车间主任) — the M2 capture rode
// qc_inspector whose work list skews inspection items; shop_lead surfaces the
// approval/stamp grade of the work-detail surface. Light + dark, same rig.
// Usage (repo root): node research/2026-10-03-w7-rework/m3/.w7m3-workdetail.mjs
import { chromium } from '../../../apps/web/node_modules/playwright/index.mjs'

const BASE = 'http://127.0.0.1:3080/mobile.html'
const OUT = 'demos/acceptance-w7/'
const log = (line) => console.log(line)
const sleep = (ms) => new Promise((resolve) => { setTimeout(resolve, ms) })

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 })

const signIn = async () => {
  await page.goto(`${BASE}#/login`, { waitUntil: 'domcontentloaded' })
  await page.evaluate(() => { localStorage.clear() })
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.getByText('食链通').first().waitFor({ timeout: 15_000 })
  await page.getByPlaceholder('业务账号（如 buyer）').fill('shop_lead')
  await page.getByPlaceholder('业务账号密码').fill('Lead#2026')
  await page.getByRole('button', { name: '登录' }).click()
  await page.waitForSelector('nav[aria-label="底部导航"]', { timeout: 30_000 })
  await sleep(1000)
}

const captureWorkDetail = async (suffix) => {
  await page.goto(`${BASE}#/work`, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('[aria-label="工作列表"]', { timeout: 15_000 })
  await sleep(900)
  // The list's first button may be an agent-referral card (it navigates to
  // #/agents), not a work item: walk the buttons until the route lands on a
  // real work detail (#/work/:id).
  const buttons = page.locator('[aria-label="工作列表"] button')
  const total = await buttons.count()
  for (let i = 0; i < Math.min(total, 6); i += 1) {
    await buttons.nth(i).click().catch(() => {})
    const landed = await page.waitForURL(/#\/work\/.+/, { timeout: 2500 }).then(() => true).catch(() => false)
    if (landed) {
      await sleep(1500)
      await page.screenshot({ path: `${OUT}w7-m3-15-workdetail-shoplead-${suffix}.png` })
      log(`shot w7-m3-15-workdetail-shoplead-${suffix} (button #${i})`)
      return
    }
    await page.goto(`${BASE}#/work`, { waitUntil: 'domcontentloaded' })
    await sleep(600)
  }
  log(`  [warn] no work item button opened a detail; shooting the list only (${suffix})`)
  await page.screenshot({ path: `${OUT}w7-m3-15-workdetail-shoplead-${suffix}.png` })
}

// light
await signIn()
await captureWorkDetail('light')

// dark (hard reload honors the theme key + keeps the session)
await page.evaluate(() => { localStorage.setItem('dsh-mobile-theme', 'dark') })
await page.reload({ waitUntil: 'domcontentloaded' })
await sleep(1200)
await captureWorkDetail('dark')

await browser.close()
process.exit(0)
