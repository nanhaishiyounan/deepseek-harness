// W7-M3 work-detail capture, v2 — navigate straight to `#/work/:id` using the
// device-local work store (dsh-mobile-work, demo-seeded on first shell mount),
// instead of clicking the list's first button (which is the agents referral).
// Re-shoots the 08 slots (qc_inspector light + dark) and the shop_lead legs.
// Note for the evidence index: the work store is device-level (not per-user);
// the shop_lead legs prove the role can reach the same detail surface.
// Usage (repo root): node research/2026-10-03-w7-rework/m3/.w7m3-workdetail2.mjs
import { chromium } from '../../../apps/web/node_modules/playwright/index.mjs'

const BASE = 'http://127.0.0.1:3080/mobile.html'
const OUT = 'demos/acceptance-w7/'
const log = (line) => console.log(line)
const sleep = (ms) => new Promise((resolve) => { setTimeout(resolve, ms) })

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 })

const signIn = async (account, password) => {
  await page.goto(`${BASE}#/login`, { waitUntil: 'domcontentloaded' })
  await page.getByText('食链通').first().waitFor({ timeout: 15_000 })
  await page.getByPlaceholder('业务账号（如 buyer）').fill(account)
  await page.getByPlaceholder('业务账号密码').fill(password)
  await page.getByRole('button', { name: '登录' }).click()
  await page.waitForSelector('nav[aria-label="底部导航"]', { timeout: 30_000 })
  await sleep(1000)
}

/** Open #/work so the shell mounts (seeding the store on a fresh device),
 * then read the first item id from the store and route to its detail. */
const openFirstWorkDetail = async () => {
  await page.goto(`${BASE}#/work`, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('[aria-label="工作列表"]', { timeout: 15_000 })
  await sleep(900)
  const id = await page.evaluate(() => {
    const raw = localStorage.getItem('dsh-mobile-work') ?? ''
    try {
      const shape = JSON.parse(raw)
      const first = Array.isArray(shape.items) ? shape.items[0] : undefined
      return first === undefined ? null : String(first.id)
    } catch { return null }
  })
  if (id === null) { log('  [warn] work store has no items'); return false }
  await page.goto(`${BASE}#/work/${id}`, { waitUntil: 'domcontentloaded' })
  await sleep(1400)
  log(`  routed to #/work/${id}`)
  return true
}

// -- qc_inspector: the canonical 08 slots (light + dark) -------------------------
await signIn('qc_inspector', 'Qc#2026')
if (await openFirstWorkDetail()) {
  await page.screenshot({ path: `${OUT}w7-b6-mo-08-light-work-detail.png` })
  log('shot w7-b6-mo-08-light-work-detail')
  await page.evaluate(() => { localStorage.setItem('dsh-mobile-theme', 'dark') })
  await page.reload({ waitUntil: 'domcontentloaded' })
  await sleep(1400)
  await page.screenshot({ path: `${OUT}w7-m3-08-dark-work-detail.png` })
  log('shot w7-m3-08-dark-work-detail')
}

// -- shop_lead: the M3 re-shot legs ----------------------------------------------
await page.evaluate(() => {
  localStorage.removeItem('dsh-mobile-auth')
  localStorage.setItem('dsh-mobile-theme', 'light')
})
await page.goto(`${BASE}#/login`, { waitUntil: 'domcontentloaded' })
await page.reload({ waitUntil: 'domcontentloaded' })
await signIn('shop_lead', 'Lead#2026')
if (await openFirstWorkDetail()) {
  await page.screenshot({ path: `${OUT}w7-m3-15-workdetail-shoplead-light.png` })
  log('shot w7-m3-15-workdetail-shoplead-light')
  await page.evaluate(() => { localStorage.setItem('dsh-mobile-theme', 'dark') })
  await page.reload({ waitUntil: 'domcontentloaded' })
  await sleep(1400)
  await page.screenshot({ path: `${OUT}w7-m3-16-workdetail-shoplead-dark.png` })
  log('shot w7-m3-16-workdetail-shoplead-dark')
}

await browser.close()
process.exit(0)
