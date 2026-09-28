// W3-B2 targeted evidence: pick the row that actually carries child rows
// (BOM with lines/ops, inspection with seeded readings) and prove the counts.
import { chromium } from '../../apps/web/node_modules/playwright/index.mjs'

const BASE = 'http://127.0.0.1:3080/nocobase'
const API = 'http://127.0.0.1:13000'
const signIn = await fetch(`${API}/api/auth:signIn`, {
  method: 'POST', headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ account: 'admin@nocobase.com', password: 'admin123' }),
})
const token = (await signIn.json())?.data?.token

const browser = await chromium.launch()
const run = async (route, out, rowHasText, expectSubs) => {
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } })
  await page.addInitScript(t => localStorage.setItem('NOCOBASE_TOKEN', t), token)
  await page.goto(`${BASE}/admin/${route}`, { waitUntil: 'domcontentloaded', timeout: 60_000 })
  await page.waitForSelector('.ant-table-row', { timeout: 60_000 })
  await page.waitForTimeout(800)
  // Paginate (up to 5 pages) until the target row renders.
  let row = page.locator('.ant-table-row', { hasText: rowHasText }).first()
  for (let pageNo = 1; (await row.count()) === 0 && pageNo < 5; pageNo += 1) {
    const next = page.locator('.ant-pagination-next').first()
    if ((await next.count()) === 0 || (await next.getAttribute('aria-disabled')) === 'true') break
    await next.click()
    await page.waitForTimeout(1200)
    row = page.locator('.ant-table-row', { hasText: rowHasText }).first()
  }
  if ((await row.count()) === 0) { console.log(`${out}: row with "${rowHasText}" not visible`); await page.close(); return }
  const head = (await row.innerText()).replace(/\s+/g, ' ').slice(0, 80)
  await row.scrollIntoViewIfNeeded()
  await page.screenshot({ path: `research/2026-09-27-w3-usability/${out}-1-page.png` })
  await row.locator('a:has-text("查看"), button:has-text("查看")').first().click()
  await page.waitForSelector('.ant-drawer-content', { timeout: 15_000 })
  await page.waitForTimeout(2500)
  const drawer = page.locator('.ant-drawer-content').last()
  const tables = drawer.locator('.ant-table')
  const counts = []
  for (let i = 0; i < await tables.count(); i += 1) counts.push(await tables.nth(i).locator('.ant-table-row').count())
  await page.screenshot({ path: `research/2026-09-27-w3-usability/${out}-2-drawer.png` })
  console.log(`${out}: row="${head}" subtables=${await tables.count()}/${expectSubs} rows=[${counts.join(',')}]`)
  await page.close()
}
await run('w5mfga37ztlt6orc', 'w3-b2-mfg-bom2', 'BOM-0002', 2)
await run('w8qmjvyv8p5j7j', 'w3-b2-qm-insp2', 'QI-2026-0010', 1)
await browser.close()
