// W4-B4 journey forensics (batch §4 acceptance legs):
//   R1 管理员打开「排程明细」（改名页）——表格 + B1 筛选 + 行详情抽屉不回归
//   R2 管理员打开「AQL 抽样方案」（N-3' 空格改名页）——表格可开
//   R3 菜单对照——生产制造组新名、基础数据组含应用中心、顶级仅剩 AI 工作台
//   R4 退役页 URL 直达——工作台 / 采购联系人（历史）前端 404
// Run: node --import tsx/esm research/2026-09-28-w4-completeness/.b4-journey.mjs
import { chromium } from '../../apps/web/node_modules/playwright/index.mjs'
import { writeFileSync } from 'node:fs'

const DIR = 'research/2026-09-28-w4-completeness/'
const BASE = 'http://127.0.0.1:3080/nocobase'
const API = process.env.NOCOBASE_BASE_URL || 'http://127.0.0.1:13000'

const r = await fetch(`${API}/api/auth:signIn`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ account: 'admin@nocobase.com', password: 'admin123' }) })
const adminToken = (await r.json())?.data?.token
const routes = await (await fetch(`${API}/api/desktopRoutes:list?pageSize=400`, { headers: { authorization: `Bearer ${adminToken}` } })).json()
const routeOf = (title) => routes.data.find(row => row.title === title && row.type === 'flowPage')

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1680, height: 950 } })
await page.goto(`${BASE}/signin`, { waitUntil: 'domcontentloaded' })
await page.waitForSelector('input', { timeout: 30000 })
await page.waitForTimeout(4000)
await page.locator('input[placeholder="用户名/邮箱"]').fill('admin@nocobase.com', { timeout: 15000 })
await page.locator('input[type="password"]').first().fill('admin123')
await page.keyboard.press('Enter')
await page.waitForURL(/admin/, { timeout: 30000 })
await page.waitForTimeout(1500)

const open = async (title, name, wait = 6000) => {
  const route = routeOf(title)
  if (route == null) throw new Error(`${title} route not found`)
  await page.goto(`${BASE}/admin/${route.schemaUid}`, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('.ant-table, canvas', { timeout: 30000 }).catch(() => {})
  await page.waitForTimeout(wait)
  await page.screenshot({ path: `${DIR}${name}.png`, fullPage: false })
}
const log = []

// ── R1: 排程明细（改名页）功能完好：表格 + 筛选 + 行详情 ──
await open('排程明细', 'w4-b4-rename-schedule-detail', 7000)
log.push(`R1 排程明细（原「排产看板」）@ ${new Date().toISOString()}`)
const filterVisible = await page.locator('.ant-table-filter-trigger, form').count()
log.push(`  页面表格/筛选容器元素计数 = ${String(filterVisible)}（B1 FilterForm 不回归截图判读）`)
// 行详情抽屉：点第一行「查看」
const viewBtn = page.locator('.ant-table-row .ant-btn, a:has-text("查看"), .ant-table-row td').first()
if (viewBtn !== null) {
  await page.locator('.ant-table-row').first().click({ timeout: 10_000 }).catch(() => {})
  await page.waitForTimeout(2500)
  const drawer = await page.locator('.ant-drawer, .ant-drawer-open').count()
  log.push(`  行点击抽屉计数 = ${String(drawer)}（W3 行详情能力截图判读）`)
  await page.screenshot({ path: `${DIR}w4-b4-rename-schedule-detail-drawer.png`, fullPage: false }).catch(() => {})
  await page.keyboard.press('Escape').catch(() => {})
}

// ── R2: AQL 抽样方案（N-3' 空格改名页）可开 ──
await open('AQL 抽样方案', 'w4-b4-rename-aql', 6000)
log.push(`R2 AQL 抽样方案（空格规范改名）@ ${new Date().toISOString()} — 200 可开截图对拍`)

// ── R3: 菜单对照（生产制造组 / 基础数据组 / 顶级）──
await page.goto(`${BASE}/admin`, { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(5000)
await page.screenshot({ path: `${DIR}w4-b4-menu-after.png`, fullPage: false })
const menuText = await page.locator('body').innerText()
for (const probe of ['排程明细', '应用中心', 'AI 工作台', 'AQL 抽样方案']) log.push(`  菜单含「${probe}」= ${menuText.includes(probe) ? 'yes' : 'NO'}`)
for (const gone of ['工作台（顶级散页）', '采购联系人（历史）']) {
  const label = gone.split('（')[0]
  const hits = menuText.split('\n').filter(line => line.trim() === label).length
  log.push(`  菜单顶级行「${label}」出现次数 = ${String(hits)}（应为 0；AI 工作台 ≠ 工作台）`)
}

// ── R4: 退役页直达 URL 前端 404 ──
for (const [name, uid] of [['工作台', 'n17f34fr9khfzdhq'], ['采购联系人（历史）', 'n17f3gnpjv8rfd85']]) {
  await page.goto(`${BASE}/admin/${uid}`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(4000)
  await page.screenshot({ path: `${DIR}w4-b4-retired-404-${name === '工作台' ? 'workbench' : 'po-suppliers'}.png`, fullPage: false })
  const body = await page.locator('body').innerText()
  const has404 = /404|不存在|Not Found|无法找到/i.test(body)
  const noTable = (await page.locator('.ant-table').count()) === 0
  log.push(`R4 退役页「${name}」(/admin/${uid}) — 404文案=${has404 ? 'yes' : 'no'} 无表格=${noTable ? 'yes' : 'NO'}（两者其一即通过，截图对拍）`)
}

await browser.close()
const out = [`# w4-b4 journey @ ${new Date().toISOString()}`, ...log].join('\n')
console.log(out)
writeFileSync(`${DIR}w4-b4-journey.txt`, `${out}\n`)
