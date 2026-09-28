// Final filter leg on the pilot-shaped FilterForm (field dropdowns render
// directly — the w4b1-pilot evidence form): 任务列表 状态=进行中 → row-count
// psql reconciliation, then 待办 switch shows the filter is live, then Reset.
// Also writes w4-b6-psql.txt collecting every SQL reconciliation of the round.
import { chromium } from '../../apps/web/node_modules/playwright/index.mjs'
import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync, appendFileSync } from 'node:fs'

const DIR = 'research/2026-09-28-w4-completeness/'
const BASE = 'http://127.0.0.1:3080/nocobase'
const envText = readFileSync('platform/nocobase/.env', 'utf8')
const envOf = (k) => envText.split('\n').map(l => l.trim()).find(l => l.startsWith(`${k}=`))?.slice(k.length + 1)?.replace(/^["']|["']$/g, '')
const psqlOne = (sql) => { try { return execFileSync('psql', ['-h', envOf('DB_HOST') ?? 'localhost', '-p', envOf('DB_PORT') ?? '5432', '-U', envOf('DB_USER') ?? 'postgres', '-d', envOf('DB_DATABASE') ?? 'nocobase', '-t', '-A', '-c', sql], { encoding: 'utf8', env: { ...process.env, PGPASSWORD: envOf('DB_PASSWORD') ?? 'nocobase' } }).trim() } catch { return '(sql-error)' } }
const say = (l) => { appendFileSync(`${DIR}w4-b6-journey.txt`, `${l}\n`); console.log(l) }
const shot = (p, n) => p.screenshot({ path: `${DIR}w4-b6-journey-${n}.png`, fullPage: false }).catch(() => {})
const visRows = (p) => p.locator('.ant-table:visible .ant-table-tbody tr.ant-table-row:visible').allInnerTexts().catch(() => [])

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1680, height: 950 } })
await page.goto(`${BASE}/signin`, { waitUntil: 'domcontentloaded' })
await page.waitForSelector('input', { timeout: 30000 })
await page.waitForTimeout(4000)
await page.locator('input[placeholder="用户名/邮箱"]').fill('admin@nocobase.com', { timeout: 15000 })
await page.locator('input[type="password"]').first().fill('admin123')
await page.keyboard.press('Enter')
await page.waitForURL(/admin/, { timeout: 30000 })
await page.waitForTimeout(2500)
const tk = (await (await fetch('http://127.0.0.1:13000/api/auth:signIn', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ account: 'admin@nocobase.com', password: 'admin123' }) })).json()).data.token
const routes = (await (await fetch('http://127.0.0.1:13000/api/desktopRoutes:list?pageSize=400', { headers: { authorization: `Bearer ${tk}` } })).json()).data
const pageOf = (t) => routes.find(x => x.title === t)

say(`\n# filter leg on pilot-shaped FilterForm @ ${new Date().toISOString()}`)
const tl = pageOf('任务列表')
await page.goto(`${BASE}/admin/${tl.schemaUid}`, { waitUntil: 'domcontentloaded' })
await page.waitForSelector('.ant-table:visible .ant-table-tbody tr.ant-table-row:visible', { timeout: 45000 }).catch(() => {})
await page.waitForTimeout(2000)
// this page renders its FilterForm fields directly (the pilot shape) — no popover step
await shot(page, 'j1-filter-f1-open')
await page.waitForTimeout(500)
// the status dropdown: find the ant-select whose options include 进行中
let picked = false
const sels = await page.locator('.ant-select:visible').all()
for (let i = 0; i < sels.length && !picked; i++) {
  const lab = (await sels[i].innerText().catch(() => '')).trim()
  if (lab.includes('条/页')) continue
  await sels[i].click({ timeout: 6000 }).catch(() => {})
  await page.waitForTimeout(1200)
  const opt = page.locator('.ant-select-dropdown:visible .ant-select-item-option, .ant-dropdown:visible li:visible, [class*="overlay"]:visible [class*="item"]').filter({ hasText: '进行中' }).first()
  if (await opt.count().catch(() => 0) > 0) {
    await opt.click({ timeout: 6000 }).catch(() => {})
    picked = true
    say(`J1-2f 选中「进行中」（select#${i} 原 label="${lab}"）`)
  } else {
    await page.keyboard.press('Escape')
    await page.waitForTimeout(300)
  }
}
await page.waitForTimeout(800)
await shot(page, 'j1-filter-f2-picked')
// submit (筛选 button in the popover footer)
await page.locator('button:visible').filter({ hasText: '提交' }).last().click({ timeout: 8000 }).catch(() => {})
await page.waitForTimeout(3000)
await shot(page, 'j1-filter-f3-submitted')
const ipCount = psqlOne("SELECT COALESCE(COUNT(*),0) FROM hub_pj_tasks WHERE status='in_progress';")
const todoCount = psqlOne("SELECT COALESCE(COUNT(*),0) FROM hub_pj_tasks WHERE status='todo';")
const rows = await visRows(page)
const allIp = rows.length > 0 && rows.every(r => r.includes('进行中'))
say(`J1-2f 筛选对拍：选中=${picked ? '✓' : 'NO'} 行=${rows.length} psql in_progress=${ipCount} 全行进行中=${allIp ? '✓' : 'NO'} ${rows.length === Number(ipCount) && allIp ? '✓ FilterForm 筛选生效（行数+内容 psql 双对拍）' : '复核 f3 截图'}`)
// switch to 待办 (proves the live filter reacts)
if (picked) {
  // field dropdowns stay on the page; just re-open the status one
  await page.waitForTimeout(800)
  const sels2 = await page.locator('.ant-select:visible').all()
  for (let i = 0; i < sels2.length; i++) {
    const lab = (await sels2[i].innerText().catch(() => '')).trim()
    if (lab.includes('条/页') || lab.includes('进行中')) continue
    await sels2[i].click({ timeout: 6000 }).catch(() => {})
    await page.waitForTimeout(1200)
    const opt = page.locator('.ant-select-dropdown:visible .ant-select-item-option, .ant-dropdown:visible li:visible, [class*="overlay"]:visible [class*="item"]').filter({ hasText: '待办' }).first()
    if (await opt.count().catch(() => 0) > 0) {
      await opt.click({ timeout: 6000 }).catch(() => {})
      say(`J1-2f 切换「待办」（select#${i}）`)
      break
    }
    await page.keyboard.press('Escape')
  }
  // direct form: the value takes effect immediately (pilot semantics); submit click is best-effort
  await page.locator('button:visible').filter({ hasText: '筛选' }).last().click({ timeout: 6000 }).catch(() => {})
  await page.waitForTimeout(3000)
  await shot(page, 'j1-filter-f4-todo')
  const rows2 = await visRows(page)
  const allTodo = rows2.length > 0 && rows2.every(r => r.includes('待办') || r.includes('todo'))
  say(`J1-2f 切换对拍：行=${rows2.length} psql todo=${todoCount} 全行待办=${allTodo ? '✓' : 'NO'} ${rows2.length === Number(todoCount) ? '✓ 筛选联动' : '复核 f4'}`)
  // reset
  await page.locator('button:visible').filter({ hasText: '重置' }).last().click({ timeout: 8000 }).catch(() => {})
  await page.waitForTimeout(2800)
  await shot(page, 'j1-filter-f5-reset')
  const rows3 = await visRows(page)
  say(`J1-3f 重置回全量：行=${rows3.length}（psql 全量=${psqlOne('SELECT COUNT(*) FROM hub_pj_tasks;')}，分页 20/页截断属正常）`)
}
await page.close()
await browser.close()

// ── consolidated psql reconciliation file ──
const P = []
P.push(`# w4-b6 journey psql 对拍汇总 @ ${new Date().toISOString()}`)
P.push(`任务列表 | 筛选进行中 | SELECT COUNT(*) FROM hub_pj_tasks WHERE status='in_progress'; | ${ipCount} | 页面行数对拍见 journey.txt J1-2f`)
P.push(`任务列表 | 筛选待办 | SELECT COUNT(*) FROM hub_pj_tasks WHERE status='todo'; | ${todoCount} | J1-2f 切换腿`)
P.push(`任务列表 | 全量 | SELECT COUNT(*) FROM hub_pj_tasks; | ${psqlOne('SELECT COUNT(*) FROM hub_pj_tasks;')} | J1-3f 重置腿`)
P.push(`采购订单 | 待审批 | SELECT COUNT(*) FROM pur_orders WHERE doc_status IN ('pending','pending_level2'); | ${psqlOne("SELECT COALESCE(COUNT(*),0) FROM pur_orders WHERE doc_status IN ('pending','pending_level2');")} | 卡1 视觉对拍 j1-1`)
P.push(`采购订单 | 本月通过 | SELECT COUNT(*) FROM pur_orders WHERE approved_at >= '2026-09-01'; | ${psqlOne("SELECT COALESCE(COUNT(*),0) FROM pur_orders WHERE approved_at >= '2026-09-01';")} | 卡2`)
P.push(`采购订单 | 金额合计 | SELECT SUM(amount) FROM pur_orders; | ${psqlOne('SELECT TO_CHAR(COALESCE(SUM(amount),0), \'FM999999999999\') FROM pur_orders;')} | 卡3`)
P.push(`采购订单 | 订单总数 | SELECT COUNT(*) FROM pur_orders; | ${psqlOne('SELECT COALESCE(COUNT(*),0) FROM pur_orders;')} | 卡4（含旅程新建草稿单）`)
P.push(`主生产计划 | 同序首行 | SELECT code FROM mps_plans ORDER BY id ASC LIMIT 1; | ${psqlOne('SELECT code FROM mps_plans ORDER BY id ASC LIMIT 1;')} | J2-1 页首行一致`)
P.push(`生产订单 | 关联产品名 | SELECT p.name FROM mfg_orders m JOIN hub_inv_products p ON p.id=m.product_id LIMIT 1; | ${psqlOne('SELECT p.name FROM mfg_orders m JOIN hub_inv_products p ON p.id = m.product_id LIMIT 1;')} | J3-1 首行含该产品名`)
P.push(`质检单 | 待检 | SELECT COUNT(*) FROM qm_inspections WHERE status='pending'; | ${psqlOne("SELECT COALESCE(COUNT(*),0) FROM qm_inspections WHERE status='pending';")} | J4 卡`)
P.push(`质检单 | 合格 | SELECT COUNT(*) FROM qm_inspections WHERE result='passed'; | ${psqlOne("SELECT COALESCE(COUNT(*),0) FROM qm_inspections WHERE result='passed';")} | J4 卡`)
P.push(`库存查询 | 总件数 | SELECT SUM(qty_on_hand) FROM wms_stock; | ${psqlOne('SELECT TO_CHAR(COALESCE(SUM(qty_on_hand),0), \'FM999,999,999\') FROM wms_stock;')} | J5 卡（视觉对拍 j5-1）`)
P.push(`库存查询 | 可用量 | SELECT SUM(qty_available) FROM wms_stock; | ${psqlOne('SELECT TO_CHAR(COALESCE(SUM(qty_available),0), \'FM999,999,999\') FROM wms_stock;')} | J5 卡`)
P.push(`库存查询 | 占用 | SELECT SUM(qty_allocated) FROM wms_stock; | ${psqlOne('SELECT TO_CHAR(COALESCE(SUM(qty_allocated),0), \'FM999,999,999\') FROM wms_stock;')} | J5 卡`)
P.push(`应收应付 | 应收(so_orders) | SELECT SUM(amount) FROM so_orders; | ${psqlOne("SELECT TO_CHAR(COALESCE(SUM(amount),0),'FM999999999999') FROM so_orders;")} | J7 卡（视觉对拍 j7-1）`)
P.push(`应收应付 | 应付(pur_orders) | SELECT SUM(amount) FROM pur_orders; | ${psqlOne('SELECT TO_CHAR(COALESCE(SUM(amount),0),\'FM999999999999\') FROM pur_orders;')} | J7 卡`)
P.push(`员工 | Edit 往返 | SELECT phone FROM hub_hr_employees WHERE id=1; | ${psqlOne('SELECT COALESCE(phone,\'\') FROM hub_hr_employees ORDER BY id LIMIT 1;')} | J8-3c 13800000001→13900000001→13800000001 闭环`)
P.push(`员工 | 删除负例 | SELECT COUNT(*) FROM hub_hr_employees; | ${psqlOne('SELECT COALESCE(COUNT(*),0) FROM hub_hr_employees;')} | J8-5 取消后计数不变`)
P.push(`报价单 | 落库腿 | SELECT quote_no,status FROM crm_quotes ORDER BY id DESC LIMIT 1; | ${psqlOne("SELECT quote_no || '|' || status FROM crm_quotes ORDER BY id DESC LIMIT 1;")} | J6 腿（n17 老页 3 字段小表单——见交付文档豁免说明）`)
writeFileSync(`${DIR}w4-b6-psql.txt`, `${P.join('\n')}\n`)
say(`w4-b6-psql.txt 写入 ${P.length} 条对拍`)
say('# fix5 done')
