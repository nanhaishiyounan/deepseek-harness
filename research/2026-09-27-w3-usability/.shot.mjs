// W3-B1 journey forensics: open one flow page as a given account, click the
// first row's 查看 action, and capture the drawer. Usage:
//   node research/2026-09-27-w3-usability/.shot.mjs <routeUid> <outPng> [account password]
// Evidence naming: w3-b1-<domain>-*.png (admin default; pass member creds for
// the perspective-flip shots). Auth = API signIn + localStorage seed: the UI
// login form is a hydration race (a pre-mount fill gets wiped by React), and
// the ?redirect= URL already contains /admin/, which fools URL-based
// sign-in detection — the token injection sidesteps both. The UI rides the
// :3080 dsh web gateway (the bare :13000 admin deep link 404s).
import { chromium } from '../../apps/web/node_modules/playwright/index.mjs'

const [routeUid, outPng, account = 'admin@nocobase.com', password = 'admin123'] = process.argv.slice(2)
if (!routeUid || !outPng) throw new Error('usage: node .shot.mjs <routeUid> <outPng> [account password]')
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
await page.addInitScript(tokenValue => {
  localStorage.setItem('NOCOBASE_TOKEN', tokenValue)
}, token)
const t0 = Date.now()
await page.goto(`${BASE}/admin/${routeUid}`, { waitUntil: 'domcontentloaded', timeout: 60_000 })

// Wait for the table rows (flow-engine canvas renders async).
await page.waitForSelector('.ant-table-row', { timeout: 60_000 }).catch(async error => {
  console.error(`NO-TABLE on ${routeUid} as ${account} (${page.url()})`)
  await page.screenshot({ path: outPng.replace('.png', '-FAIL-no-table.png') })
  throw error
})
await page.waitForTimeout(800)

// Journey shot 1: the page with rows visible.
await page.screenshot({ path: outPng.replace('.png', '-1-page.png') })

// Click the first row's 查看 link inside the actions column — antd link
// buttons render as <button class="ant-btn-link">, not <a>.
const viewLink = page.locator('.ant-table-row').first()
  .locator('a:has-text("查看"), button:has-text("查看"), a:has-text("View"), button:has-text("View")').first()
if ((await viewLink.count()) === 0) {
  console.error(`NO-VIEW-ACTION on ${routeUid} as ${account}`)
  await page.screenshot({ path: outPng.replace('.png', '-FAIL-no-view-action.png') })
  process.exitCode = 1
} else {
  await viewLink.click()
  // Drawer must appear AND render non-empty detail fields.
  await page.waitForSelector('.ant-drawer-content', { timeout: 15_000 })
  await page.waitForTimeout(1500)
  const drawerText = (await page.locator('.ant-drawer-content').innerText()).trim()
  const fieldCount = await page.locator('.ant-drawer-content .ant-descriptions-item, .ant-drawer-content [class*="details-item"], .ant-drawer-content form .ant-form-item').count()
  const elapsed = Date.now() - t0
  await page.screenshot({ path: outPng })
  console.log(`DRAWER-OPEN ${routeUid} as ${account}: drawerTextLen=${drawerText.length} fieldNodes=${fieldCount} elapsedMs=${elapsed}`)
  console.log(`drawer head: ${drawerText.slice(0, 160).replace(/\n/g, ' | ')}`)
  if (drawerText.length < 20) process.exitCode = 1
}

await browser.close()
