// W3-B1 kanban card-drawer forensics: open a kanban page, click the first
// card (located by its real row title fetched from the API so the click
// lands on content, not chrome), capture the drawer. Usage:
//   node research/2026-09-27-w3-usability/.shot-kanban.mjs <routeUid> <collection> <outPng> [account password]
import { chromium } from '../../apps/web/node_modules/playwright/index.mjs'

const [routeUid, collection, outPng, account = 'admin@nocobase.com', password = 'admin123'] = process.argv.slice(2)
if (!routeUid || !collection || !outPng) throw new Error('usage: node .shot-kanban.mjs <routeUid> <collection> <outPng> [account password]')
const BASE = 'http://127.0.0.1:3080/nocobase'
const API = process.env.NOCOBASE_BASE_URL || 'http://127.0.0.1:13000'

const signIn = await fetch(`${API}/api/auth:signIn`, {
  method: 'POST', headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ account, password }),
})
const token = (await signIn.json())?.data?.token
if (typeof token !== 'string' || token.length === 0) throw new Error(`sign-in as ${account} returned no token`)
const firstRow = await (await fetch(`${API}/api/${collection}:list?page=1&pageSize=1`, { headers: { authorization: `Bearer ${token}` } })).json()
const titleField = collection === 'srm_capas' ? 'title' : 'code'
const cardTitle = firstRow?.data?.[0]?.[titleField]
if (typeof cardTitle !== 'string' || cardTitle.length === 0) throw new Error(`no ${collection} row to anchor a card click`)

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } })
await page.addInitScript(t => localStorage.setItem('NOCOBASE_TOKEN', t), token)
await page.goto(`${BASE}/admin/${routeUid}`, { waitUntil: 'domcontentloaded', timeout: 60_000 })
await page.getByText(cardTitle, { exact: false }).first().waitFor({ timeout: 60_000 })
await page.waitForTimeout(800)
await page.screenshot({ path: outPng.replace('.png', '-1-board.png') })
await page.getByText(cardTitle, { exact: false }).first().click()
await page.waitForSelector('.ant-drawer-content', { timeout: 15_000 })
await page.waitForTimeout(1500)
const drawerText = (await page.locator('.ant-drawer-content').innerText()).trim()
await page.screenshot({ path: outPng })
console.log(`CARD-DRAWER-OPEN ${routeUid} (${collection} "${cardTitle}") as ${account}: drawerTextLen=${drawerText.length}`)
console.log(`drawer head: ${drawerText.slice(0, 160).replace(/\n/g, ' | ')}`)
if (drawerText.length < 20) process.exitCode = 1
await browser.close()
