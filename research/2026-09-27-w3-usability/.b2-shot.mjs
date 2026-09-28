// W3-B2 pilot forensics: open one flow page, click a row's 查看, verify the
// drawer renders the association-bound subtable, drill into a subtable row,
// and capture each step. Usage:
//   node research/2026-09-27-w3-usability/.b2-shot.mjs <routeUid> <outPrefix> [account password]
import { chromium } from '../../apps/web/node_modules/playwright/index.mjs'

const [routeUid, outPrefix, account = 'admin@nocobase.com', password = 'admin123'] = process.argv.slice(2)
if (!routeUid || !outPrefix) throw new Error('usage: node .b2-shot.mjs <routeUid> <outPrefix> [account password]')
const BASE = 'http://127.0.0.1:3080/nocobase'
const API = process.env.NOCOBASE_BASE_URL || 'http://127.0.0.1:13000'

const signIn = await fetch(`${API}/api/auth:signIn`, {
  method: 'POST', headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ account, password }),
})
const token = (await signIn.json())?.data?.token
if (typeof token !== 'string' || token.length === 0) throw new Error(`sign-in as ${account} returned no token`)

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } })
const netLog = []
page.on('response', async res => {
  const url = res.request().url()
  if (url.includes('/api/pur_order_lines') || url.includes('resourcer')) {
    netLog.push(`${res.status()} ${res.request().method()} ${url.slice(0, 180)}`)
  }
})
await page.addInitScript(tokenValue => {
  localStorage.setItem('NOCOBASE_TOKEN', tokenValue)
}, token)
const t0 = Date.now()
await page.goto(`${BASE}/admin/${routeUid}`, { waitUntil: 'domcontentloaded', timeout: 60_000 })
await page.waitForSelector('.ant-table-row', { timeout: 60_000 })
await page.waitForTimeout(800)
await page.screenshot({ path: `${outPrefix}-1-page.png` })

// Open the first row's drawer.
const viewLink = page.locator('.ant-table-row').first()
  .locator('a:has-text("查看"), button:has-text("查看"), a:has-text("View"), button:has-text("View")').first()
await viewLink.click()
await page.waitForSelector('.ant-drawer-content', { timeout: 15_000 })
await page.waitForTimeout(2500)
await page.screenshot({ path: `${outPrefix}-2-drawer.png`, fullPage: false })

const drawer = page.locator('.ant-drawer-content').last()
const drawerText = (await drawer.innerText()).trim()
// The subtable renders as a second ant-table inside the drawer (after the Details descriptions).
const drawerTables = drawer.locator('.ant-table')
const subtableCount = await drawerTables.count()
let subtableRows = -1
if (subtableCount > 0) {
  subtableRows = await drawerTables.last().locator('.ant-table-row').count()
}
console.log(`DRAWER subtableBlocks=${subtableCount} subtableRows=${subtableRows} textLen=${drawerText.length} elapsedMs=${Date.now() - t0}`)

// Drill down: click the subtable row's 查看 (second-level drawer).
if (subtableCount > 0) {
  const subView = drawerTables.last().locator('.ant-table-row').first()
    .locator('a:has-text("查看"), button:has-text("查看"), a:has-text("View"), button:has-text("View")').first()
  if ((await subView.count()) > 0) {
    await subView.click()
    await page.waitForTimeout(2500)
    const drawers = page.locator('.ant-drawer-content')
    const levels = await drawers.count()
    const innerText = (await drawers.last().innerText()).trim()
    await page.screenshot({ path: `${outPrefix}-3-subrow-drawer.png` })
    console.log(`DRILLDOWN drawerLevels=${levels} innerTextLen=${innerText.length} innerHead=${JSON.stringify(innerText.slice(0, 160))}`)
  } else {
    console.log('DRILLDOWN no 查看 action on subtable row')
    await page.screenshot({ path: `${outPrefix}-3-subrow-noview.png` })
  }
}

// Back to a clean page state for the row-level Edit/Jump checks (closing
// stacked antd drawers reliably beats reloading).
await page.goto(`${BASE}/admin/${routeUid}`, { waitUntil: 'domcontentloaded', timeout: 60_000 })
await page.waitForSelector('.ant-table-row', { timeout: 60_000 })
await page.waitForTimeout(800)

// Guarded Edit: open the row's 编辑, list the form field labels, assert no state field.
const editBtn = page.locator('.ant-table-row').first()
  .locator('a:has-text("编辑"), button:has-text("编辑"), a:has-text("Edit"), button:has-text("Edit")').first()
if ((await editBtn.count()) > 0) {
  await editBtn.click({ timeout: 10_000 })
  await page.waitForTimeout(2000)
  const editDrawer = page.locator('.ant-drawer-content').last()
  const labels = await editDrawer.locator('.ant-form-item-label').allInnerTexts()
  await page.screenshot({ path: `${outPrefix}-4-edit-form.png` })
  console.log(`EDIT formLabels=${JSON.stringify(labels)}`)
} else {
  console.log('EDIT no 编辑 action on row')
}

// Jump action presence (审批进度 on biz rows / 前往单据 on todo rows).
const rowText = await page.locator('.ant-table-row').first().innerText()
const hasJump = await page.locator('.ant-table-row').first()
  .locator('a:has-text("审批进度"), button:has-text("审批进度"), a:has-text("前往单据"), button:has-text("前往单据")').count()
console.log(`JUMP actionPresent=${hasJump} rowHead=${JSON.stringify(rowText.slice(0, 120))}`)

console.log(`NET ${netLog.slice(0, 8).join(' | ')}`)
await browser.close()
