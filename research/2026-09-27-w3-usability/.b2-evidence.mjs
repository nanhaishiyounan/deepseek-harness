// W3-B2 evidence sweep: for each journey page, open the first row's drawer,
// count the subtable blocks/rows, drill one level, and screenshot. Pairs with
// the psql reconciliation in w3-b2-psql.txt.
import { chromium } from '../../apps/web/node_modules/playwright/index.mjs'

const BASE = 'http://127.0.0.1:3080/nocobase'
const API = 'http://127.0.0.1:13000'
const signIn = await fetch(`${API}/api/auth:signIn`, {
  method: 'POST', headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ account: process.env.B2_ACCOUNT ?? 'admin@nocobase.com', password: process.env.B2_PASSWORD ?? 'admin123' }),
})
const token = (await signIn.json())?.data?.token
if (typeof token !== 'string' || token.length === 0) throw new Error('sign-in returned no token')

const journeys = [
  { route: 'w3puryzkva06iuhh', out: 'w3-b2-pur-po', expectSubs: 1 },          // 采购订单 → 订单行
  { route: 'w5mfga37ztlt6orc', out: 'w3-b2-mfg-bom', expectSubs: 2 },         // BOM → 组件+工序双子表
  { route: 'w8qmjvyv8p5j7j', out: 'w3-b2-qm-insp', expectSubs: 1 },           // 质检单 → 检验读数
  { route: 'h4srm2u9xiqx09jb', out: 'w3-b2-srm-supplier', expectSubs: 3 },    // 供应商 → 证书+审核+评分卡
]

const browser = await chromium.launch()
for (const journey of journeys) {
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } })
  await page.addInitScript(t => localStorage.setItem('NOCOBASE_TOKEN', t), token)
  const t0 = Date.now()
  await page.goto(`${BASE}/admin/${journey.route}`, { waitUntil: 'domcontentloaded', timeout: 60_000 })
  const firstRow = page.locator('.ant-table-row').first()
  try {
    await page.waitForSelector('.ant-table-row', { timeout: 60_000 })
  } catch {
    console.log(`${journey.out}: NO-TABLE-ROWS`)
    await page.screenshot({ path: `research/2026-09-27-w3-usability/${journey.out}-0-no-rows.png` })
    await page.close()
    continue
  }
  await page.waitForTimeout(800)
  const rowHead = (await firstRow.innerText()).replace(/\s+/g, ' ').slice(0, 90)
  await page.screenshot({ path: `research/2026-09-27-w3-usability/${journey.out}-1-page.png` })
  await firstRow.locator('a:has-text("查看"), button:has-text("查看"), a:has-text("View"), button:has-text("View")').first().click()
  await page.waitForSelector('.ant-drawer-content', { timeout: 15_000 })
  await page.waitForTimeout(2500)
  const drawer = page.locator('.ant-drawer-content').last()
  const tables = drawer.locator('.ant-table')
  const subCount = await tables.count()
  const rowCounts = []
  for (let i = 0; i < subCount; i += 1) rowCounts.push(await tables.nth(i).locator('.ant-table-row').count())
  await page.screenshot({ path: `research/2026-09-27-w3-usability/${journey.out}-2-drawer.png` })
  // Drill into the LAST subtable's first row (two-level drill-down proof).
  let drill = 'none'
  if (subCount > 0) {
    const subView = tables.last().locator('.ant-table-row').first()
      .locator('a:has-text("查看"), button:has-text("查看")').first()
    if ((await subView.count()) > 0) {
      await subView.click()
      await page.waitForTimeout(2000)
      const levels = await page.locator('.ant-drawer-content').count()
      const head = (await page.locator('.ant-drawer-content').last().innerText()).replace(/\s+/g, ' ').slice(0, 110)
      await page.screenshot({ path: `research/2026-09-27-w3-usability/${journey.out}-3-subrow-drawer.png` })
      drill = `levels=${levels} head=${JSON.stringify(head)}`
    }
  }
  console.log(`${journey.out}: row="${rowHead}" subtables=${subCount}/${journey.expectSubs} rows=[${rowCounts.join(',')}] drill=${drill} elapsedMs=${Date.now() - t0}`)
  await page.close()
}
await browser.close()
