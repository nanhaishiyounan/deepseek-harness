// W4-B3 journey forensics (batch §4 acceptance legs):
//   J1 财务 — 发票匹配页统计卡数值 psql 手算对拍（发票金额合计 = SELECT sum()；卡上口径文字可见）
//   J2 仓管 — 库存查询页统计卡 + 一句话说明 + 测试筛选制造空列表（空态引导可见）
//   抽查 — 质检单 / 处置看板(kanban 页) / 生产订单 / 供应商档案(L2) / 经营看板(图表标题)
// Run: node --import tsx/esm research/2026-09-28-w4-completeness/.b3-journey.mjs
import { chromium } from '../../apps/web/node_modules/playwright/index.mjs'
import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'

const DIR = 'research/2026-09-28-w4-completeness/'
const BASE = 'http://127.0.0.1:3080/nocobase'
const API = process.env.NOCOBASE_BASE_URL || 'http://127.0.0.1:13000'

const env = readFileSync('platform/nocobase/.env', 'utf8')
const envOf = (key) => env.split('\n').map(l => l.trim()).find(l => l.startsWith(`${key}=`))?.slice(key.length + 1)
const psqlOne = (sql) => execFileSync('psql', [
  '-h', envOf('DB_HOST') ?? 'localhost', '-p', envOf('DB_PORT') ?? '5432', '-U', envOf('DB_USER') ?? 'postgres',
  '-d', envOf('DB_NAME') ?? 'nocobase', '-t', '-A', '-c', sql,
], { encoding: 'utf8', env: { ...process.env, PGPASSWORD: envOf('DB_PASSWORD') ?? 'nocobase' } }).trim()

const signIn = async (account, password) => {
  const r = await fetch(`${API}/api/auth:signIn`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ account, password }) })
  return (await r.json())?.data?.token
}
const adminToken = await signIn('admin@nocobase.com', 'admin123')
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

// ── J1: 财务 · 发票匹配（采购发票）统计卡 psql 对拍 ──
await open('发票匹配', 'w4-b3-journey-finance-invoice', 7000)
log.push(`J1 财务-发票匹配 @ ${new Date().toISOString()}`)
log.push(`  psql 发票金额合计 = ${psqlOne('SELECT COALESCE(SUM(invoice_amount), 0) FROM pur_invoices;')} ¥`)
log.push(`  psql 匹配异常数   = ${psqlOne("SELECT COUNT(*) FROM pur_invoices WHERE match_result = 'exception';")}`)
log.push(`  psql 发票总数     = ${psqlOne('SELECT COUNT(*) FROM pur_invoices;')}`)
log.push('  卡上口径文字与截图 w4-b3-journey-finance-invoice.png 对拍（人工判读）')

// ── J2: 仓管 · 库存查询统计卡 + 说明 + 空态 ──
await open('库存查询', 'w4-b3-journey-stock-cards', 7000)
log.push(`J2 仓管-库存查询 @ ${new Date().toISOString()}`)
log.push(`  psql 库存总件数 = ${psqlOne('SELECT COALESCE(SUM(qty_on_hand), 0) FROM wms_stock;')}`)
log.push(`  psql 可用量合计 = ${psqlOne('SELECT COALESCE(SUM(qty_available), 0) FROM wms_stock;')}`)
log.push(`  psql 占用件数   = ${psqlOne('SELECT COALESCE(SUM(qty_allocated), 0) FROM wms_stock;')}`)
// 空态：库存查询的筛选是动作条按钮形态（h5 wire）——单字段状态下拉，
// 选一个 wms_stock 无行的状态（good/hold 之外，如 冻结/待检）→ 表格空
await page.getByRole('button', { name: /筛\s*选/ }).first().click().catch(() => {})
await page.waitForTimeout(1500)
const statusSelect = page.locator('.ant-select').filter({ hasText: '所有' }).first()
await statusSelect.click({ timeout: 10000 })
await page.waitForTimeout(1200)
const optionTexts = await page.locator('.ant-select-dropdown:visible .ant-select-item-option').allInnerTexts()
const emptyOption = optionTexts.find(text => text !== '所有' && !/良品|good|hold|占用/i.test(text)) ?? optionTexts.find(text => text !== '所有')
if (emptyOption === undefined) throw new Error(`no filter option to pick (options=${JSON.stringify(optionTexts)})`)
await page.locator('.ant-select-dropdown:visible .ant-select-item-option').filter({ hasText: emptyOption }).first().click()
await page.waitForTimeout(3500)
log.push(`  空态筛选: 下拉选项 ${JSON.stringify(optionTexts)} → 选中「${emptyOption}」(无库存行)`)
await page.screenshot({ path: `${DIR}w4-b3-journey-stock-empty.png`, fullPage: false })
const emptyAudit = await page.evaluate(() => ({
  emptyTable: document.body.innerText.includes('暂无数据') || document.querySelectorAll('.ant-table-tbody tr td').length <= 1,
  hintVisible: document.body.innerText.includes('列表为空时') || document.body.innerText.includes('重置筛选'),
}))
log.push(`  空态筛选后: emptyTable=${String(emptyAudit.emptyTable)} hint/重置可见=${String(emptyAudit.hintVisible)}（w4-b3-journey-stock-empty.png）`)
// 重置回全量
const resetBtn = page.getByRole('button', { name: /重\s*置/ }).first()
if (await resetBtn.count() > 0) { await resetBtn.click(); await page.waitForTimeout(2500) }

// ── J2b: 空态补充 — 请假审批 FilterForm 选一个无数据状态（已驳回）制造真实空列表 ──
await open('请假审批', 'w4-b3-journey-leave-filtered-pre', 5000)
const formSelect = page.locator('.ant-select').nth(1)
await formSelect.click({ timeout: 10000 })
await page.waitForTimeout(1200)
const leaveOptions = await page.locator('.ant-select-dropdown:visible .ant-select-item-option').allInnerTexts()
const deadOption = leaveOptions.find(text => /驳回|拒绝|取消/.test(text)) ?? leaveOptions.find(text => !/待审批|已审批|pending|approved|所有/.test(text))
if (deadOption === undefined) throw new Error(`请假审批 filter options give no empty state: ${JSON.stringify(leaveOptions)}`)
await page.locator('.ant-select-dropdown:visible .ant-select-item-option').filter({ hasText: deadOption }).first().click()
await page.waitForTimeout(1200)
const submitBtn = page.getByRole('button', { name: /提\s*交|查\s*询|确\s*定/ }).first()
if (await submitBtn.count() > 0) { await submitBtn.click().catch(() => {}) }
await page.waitForTimeout(3500)
await page.screenshot({ path: `${DIR}w4-b3-journey-leave-empty.png`, fullPage: false })
const leaveAudit = await page.evaluate(() => ({
  emptyTable: document.body.innerText.includes('暂无数据') || document.querySelectorAll('.ant-table-tbody tr.ant-table-placeholder').length > 0,
  hintVisible: document.body.innerText.includes('请假'),
}))
log.push(`J2b 请假审批空态: 选项 ${JSON.stringify(leaveOptions)} →「${deadOption}」 emptyTable=${String(leaveAudit.emptyTable)}（w4-b3-journey-leave-empty.png）`)

// ── 抽查五页 ──
await open('质检单', 'w4-b3-statcard-quality', 6000)
await open('处置看板', 'w4-b3-statcard-kanban-page', 6000)
await open('生产订单', 'w4-b3-statcard-mfg', 6000)
await open('供应商档案', 'w4-b3-statcard-l2-master', 6000)
await open('经营看板', 'w4-b3-titled-charts-w9', 8000)
const boardTitles = await page.evaluate(() => [...document.querySelectorAll('canvas')].length)
log.push(`抽查: 质检单/处置看板(kanban)/生产订单/供应商档案(L2) 各截图；经营看板 canvas=${String(boardTitles)}`)

await browser.close()
writeFileSync(`${DIR}w4-b3-journey.txt`, `${log.join('\n')}\n`)
console.log(log.join('\n'))
console.log('b3 journey: OK')
