/**
 * W2-R1 evidence shooter: re-shoot the AR/AP reconciliation page's detail
 * blocks (w2-b7-arap-details.png) from the block region — the previous file
 * duplicated the page-top sha256 of w2-b7-arap-page.png. Enters through the
 * :3080 gateway (the bare :13000 admin deep link 404s — QUICKSTART.zh.md
 * portal section) on the page's schemaUid route, signs in, wheels down until
 * the 采购发票明细 block (anchored by its 发票金额 column header) renders,
 * and captures the viewport there.
 */
import { chromium } from '../../apps/web/node_modules/playwright/index.mjs'

const base = 'http://127.0.0.1:3080/nocobase'
const out = 'research/2026-09-27-w2-evolution/w2-b7-arap-details.png'

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
await page.goto(`${base}/admin/w9kpisldougonly`, { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(3_000)
if (page.url().includes('signin')) {
  await page.locator('input').first().fill('admin@nocobase.com')
  await page.locator('input[type="password"], input').nth(1).fill('admin123')
  await page.getByRole('button', { name: /登录|Sign in/i }).click()
  await page.waitForURL(/admin/, { timeout: 60_000 })
}

// The page-top blocks render first; wheel the content pane down until the
// third ledger block (anchored by its 发票金额 column header) is visible.
let visible = false
for (let hop = 0; hop < 20 && !visible; hop += 1) {
  await page.mouse.move(720, 500)
  await page.mouse.wheel(0, 600)
  await page.waitForTimeout(500)
  visible = await page.getByText('发票金额', { exact: false }).first().isVisible().catch(() => false)
}
if (!visible) throw new Error('发票金额 block never became visible after scrolling')

// Settle the block fully inside the viewport, then shoot the detail region.
const block = page.getByText('发票金额', { exact: false }).first()
await block.scrollIntoViewIfNeeded()
await page.waitForTimeout(1_000)
// Dismiss any stray notice popover (the bell keeps unread badges) before shooting.
await page.keyboard.press('Escape')
await page.mouse.click(60, 60)
await page.waitForTimeout(500)
await page.screenshot({ path: out })
console.log(`w2-r1: details shot saved — ${out}`)
await browser.close()
