// W4-B4 R3 supplement: probe the sidebar text on each target page's own
// context (the /admin landing folds unopened groups, so the earlier body-text
// probe missed them; the sidebar always renders the current page's group).
import { chromium } from '../../apps/web/node_modules/playwright/index.mjs'
import { writeFileSync, readFileSync } from 'node:fs'

const DIR = 'research/2026-09-28-w4-completeness/'
const BASE = 'http://127.0.0.1:3080/nocobase'
const API = process.env.NOCOBASE_BASE_URL || 'http://127.0.0.1:13000'
const r = await fetch(`${API}/api/auth:signIn`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ account: 'admin@nocobase.com', password: 'admin123' }) })
const token = (await r.json())?.data?.token
const routes = (await (await fetch(`${API}/api/desktopRoutes:list?pageSize=400`, { headers: { authorization: `Bearer ${token}` } })).json()).data

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1680, height: 950 } })
await page.goto(`${BASE}/signin`, { waitUntil: 'domcontentloaded' })
await page.waitForSelector('input', { timeout: 30000 })
await page.waitForTimeout(4000)
await page.locator('input[placeholder="用户名/邮箱"]').fill('admin@nocobase.com', { timeout: 15000 })
await page.locator('input[type="password"]').first().fill('admin123')
await page.keyboard.press('Enter')
await page.waitForURL(/admin/, { timeout: 30000 })
await page.waitForTimeout(2000)

const log = []
// 生产制造组展开（排程明细所在）——侧栏应含新名
const sched = routes.find(x => x.title === '排程明细')
await page.goto(`${BASE}/admin/${sched.schemaUid}`, { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(6000)
let text = await page.locator('body').innerText()
log.push(`排程明细页上下文：侧栏含「生产制造」=${text.includes('生产制造') ? 'yes' : 'NO'} 「排程明细」=${text.includes('排程明细') ? 'yes' : 'NO'} 「排产看板」=${text.includes('排产看板') ? 'STILL-THERE' : 'gone'} 「排产甘特」=${text.includes('排产甘特') ? 'yes' : 'NO'}（v1 保留对照）`)
await page.screenshot({ path: `${DIR}w4-b4-menu-mfg-group.png`, fullPage: false })

// 基础数据组展开（应用中心新家）
const appHub = routes.find(x => x.schemaUid === 'c9c6wzppejk')
await page.goto(`${BASE}/admin/${appHub.schemaUid}`, { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(6000)
text = await page.locator('body').innerText()
log.push(`应用中心页上下文：侧栏含「基础数据」=${text.includes('基础数据') ? 'yes' : 'NO'} 「分类维护」=${text.includes('分类维护') ? 'yes' : 'NO'} 「应用中心」=${text.includes('应用中心') ? 'yes' : 'NO'}`)
await page.screenshot({ path: `${DIR}w4-b4-menu-basedata-group.png`, fullPage: false })

// 质量管理组（AQL 抽样方案新名）
const aql = routes.find(x => x.title === 'AQL 抽样方案')
await page.goto(`${BASE}/admin/${aql.schemaUid}`, { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(6000)
text = await page.locator('body').innerText()
log.push(`AQL 页上下文：侧栏含「AQL 抽样方案」=${text.includes('AQL 抽样方案') ? 'yes' : 'NO'} 「AQL抽样方案」(无空格旧名)=${text.includes('AQL抽样方案') ? 'STILL-THERE' : 'gone'}`)
await page.screenshot({ path: `${DIR}w4-b4-menu-qm-group.png`, fullPage: false })

await browser.close()
const out = [`# w4-b4 R3 sidebar supplement @ ${new Date().toISOString()}`, ...log].join('\n')
console.log(out)
writeFileSync(`${DIR}w4-b4-menu-probe.txt`, `${out}\n`)
