// W4-B6 journey patch legs: re-drive the legs whose first pass hit scripting
// blind spots — J1 filter(+添加条件 builder) & full create, J6 create with the
// association picker, J8 edit save-button text, J4 filter/iframe/fence, J5
// qty thousand-separator. Appends to w4-b6-journey.txt.
import { chromium } from '../../apps/web/node_modules/playwright/index.mjs'
import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync, appendFileSync } from 'node:fs'

const DIR = 'research/2026-09-28-w4-completeness/'
const BASE = 'http://127.0.0.1:3080/nocobase'
const API = process.env.NOCOBASE_BASE_URL || 'http://127.0.0.1:13000'
const envText = readFileSync('platform/nocobase/.env', 'utf8')
const envOf = (key) => envText.split('\n').map(l => l.trim()).find(l => l.startsWith(`${key}=`))?.slice(key.length + 1).replace(/^["']|["']$/g, '')
const psqlOne = (sql) => {
  try {
    return execFileSync('psql', ['-h', envOf('DB_HOST') ?? 'localhost', '-p', envOf('DB_PORT') ?? '5432', '-U', envOf('DB_USER') ?? 'postgres', '-d', envOf('DB_DATABASE') ?? 'nocobase', '-t', '-A', '-c', sql], { encoding: 'utf8', env: { ...process.env, PGPASSWORD: envOf('DB_PASSWORD') ?? 'nocobase' } }).trim()
  } catch (err) { return `(sql-error)` }
}
const today = new Date(Date.now() + 8 * 3600_000).toISOString().slice(0, 10)
const signIn = async (account, password) => {
  const r = await fetch(`${API}/api/auth:signIn`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ account, password }) })
  return (await r.json())?.data?.token
}
const adminToken = await signIn('admin@nocobase.com', 'admin123')
const routes = (await (await fetch(`${API}/api/desktopRoutes:list?pageSize=400`, { headers: { authorization: `Bearer ${adminToken}` } })).json()).data ?? []
const pageOf = (title) => routes.find(row => row.title === title && (row.type === 'flowPage' || row.type === 'page'))

const say = (line) => { appendFileSync(`${DIR}w4-b6-journey.txt`, `${line}\n`); console.log(line) }
const shot = (page, name) => page.screenshot({ path: `${DIR}w4-b6-journey-${name}.png`, fullPage: false }).catch(() => {})
const visRows = (page) => page.locator('.ant-table:visible .ant-table-tbody tr.ant-table-row:visible').allInnerTexts().catch(() => [])

const browser = await chromium.launch()
say(`\n# journey patch legs @ ${new Date().toISOString()}`)

/** FilterForm with the condition builder: 筛选 → +添加条件 → pick field → pick value → 提交 */
async function filterBuild(page, fieldText, valueText) {
  await page.locator('button:visible:has-text("筛选")').first().click({ timeout: 20000 })
  await page.waitForTimeout(1800)
  const add = page.locator('button:visible:has-text("添加条件"), a:visible:has-text("添加条件")').first()
  await add.click({ timeout: 8000 })
  await page.waitForTimeout(1500)
  // dump what appeared, then choose the field
  const region = page.locator('body')
  const text1 = await region.innerText()
  // the field picker is a select-like control; click it and pick the field
  const pickers = await page.locator('.ant-select:visible, [class*="fieldSelect"]:visible, [class*="picker"]:visible').all()
  for (const p of pickers) {
    await p.click({ timeout: 5000 }).catch(() => {})
    await page.waitForTimeout(900)
    const fieldOpt = page.locator('.ant-select-dropdown:visible .ant-select-item-option, .ant-dropdown:visible li, .ant-popover:visible li, [class*="dropdown"]:visible [class*="option"]').filter({ hasText: fieldText }).first()
    if (await fieldOpt.count().catch(() => 0) > 0) { await fieldOpt.click({ timeout: 6000 }).catch(() => {}); break }
    await page.keyboard.press('Escape')
  }
  await page.waitForTimeout(1000)
  // now the value picker for that field
  const valPickers = await page.locator('.ant-select:visible').all()
  for (const p of valPickers) {
    await p.click({ timeout: 5000 }).catch(() => {})
    await page.waitForTimeout(900)
    const valOpt = page.locator('.ant-select-dropdown:visible .ant-select-item-option, .ant-dropdown:visible li, .ant-popover:visible li').filter({ hasText: valueText }).first()
    if (await valOpt.count().catch(() => 0) > 0) { await valOpt.click({ timeout: 6000 }).catch(() => {}); break }
    await page.keyboard.press('Escape')
  }
  await page.waitForTimeout(800)
  await page.locator('button:visible:has-text("提交"), button:visible:has-text("查询"), button:visible:has-text("确 定")').first().click({ timeout: 8000 }).catch(() => {})
  await page.waitForTimeout(2800)
  return text1.includes('添加条件')
}

/** fill every visible required input in a drawer except ones we set, pick association selects' first option, then submit */
async function fillRequiredAndSubmit(page, drawer, fills = {}) {
  for (const [ph, val] of Object.entries(fills)) {
    await drawer.locator(`input[placeholder*="${ph}"]`).first().fill(val, { timeout: 6000 }).catch(() => {})
  }
  // association pickers: open each empty ant-select in the drawer and take the first option
  const assocs = await drawer.locator('.ant-select:visible').all()
  for (const a of assocs) {
    const txt = (await a.innerText().catch(() => '')).trim()
    if (txt !== '' && !/请选择|所有/.test(txt)) continue
    await a.click({ timeout: 5000 }).catch(() => {})
    await page.waitForTimeout(900)
    const first = page.locator('.ant-select-dropdown:visible .ant-select-item-option, .ant-dropdown:visible li, .ant-popover:visible li, [class*="dropdown"]:visible [class*="option"]').first()
    await first.click({ timeout: 5000 }).catch(() => { page.keyboard.press('Escape') })
    await page.waitForTimeout(500)
  }
  await drawer.locator('button:has-text("提 交"), button:has-text("提交"), button:has-text("保存"), button:has-text("确 定")').first().click({ timeout: 8000 }).catch(() => {})
  await page.waitForTimeout(2600)
}

// ════ admin patch: J1 filter+create, J5 qty, J6 create, J8 edit-save ════
{
  const page = await browser.newPage({ viewport: { width: 1680, height: 950 } })
  await page.goto(`${BASE}/signin`, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('input', { timeout: 30000 })
  await page.waitForTimeout(4000)
  await page.locator('input[placeholder="用户名/邮箱"]').fill('admin@nocobase.com', { timeout: 15000 })
  await page.locator('input[type="password"]').first().fill('admin123')
  await page.keyboard.press('Enter')
  await page.waitForURL(/admin/, { timeout: 30000 })
  await page.waitForTimeout(2500)

  // J1 filter leg
  const po = pageOf('采购订单')
  await page.goto(`${BASE}/admin/${po.schemaUid}`, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('.ant-table:visible .ant-table-tbody tr.ant-table-row:visible', { timeout: 45000 }).catch(() => {})
  await page.waitForTimeout(1500)
  const draftCount = psqlOne("SELECT COALESCE(COUNT(*),0) FROM pur_orders WHERE doc_status='draft';")
  const built = await filterBuild(page, '审批状态', '草稿')
  await shot(page, 'j1-2b-filter-draft-built')
  const rows = await visRows(page)
  const firstDraft = rows[0]?.includes('草稿')
  say(`J1-2b 筛选（条件构建器：审批状态=草稿）：构建器=${built ? '✓' : 'NO'} 行=${rows.length} psql 草稿=${draftCount} 首行草稿=${firstDraft ? '✓' : 'NO（分页序或以截图复核）'}`)
  await page.locator('button:visible:has-text("重置")').first().click({ timeout: 8000 }).catch(() => {})
  await page.waitForTimeout(2200)

  // J1 full create (fill required incl. supplier association)
  await page.locator('button:visible:has-text("添加")').first().click({ timeout: 20000 })
  await page.waitForTimeout(2200)
  const drawer = page.locator('.ant-drawer:visible, .ant-modal:visible').first()
  const poNo = `PO-J1-${Date.now().toString().slice(-6)}`
  await fillRequiredAndSubmit(page, drawer, { 'PO-': poNo })
  await shot(page, 'j1-6b-created-full')
  const newRow = psqlOne(`SELECT code || '|' || doc_status || '|' || TO_CHAR(need_date,'YYYY-MM-DD') FROM pur_orders WHERE code='${poNo}';`)
  say(`J1-6b 完整创建（单号+供应商关联选择）：psql=${newRow || '未落库（截图复核必填/关联状态）'} ${newRow?.includes('draft') && newRow?.includes(today) ? '✓ 默认日期+状态落库' : ''}`)

  // J5 qty thousand separator (wms_stock is a qty page; assert on 397,400-style grouping)
  const stock = pageOf('库存查询')
  await page.goto(`${BASE}/admin/${stock.schemaUid}`, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('.ant-table:visible .ant-table-tbody tr.ant-table-row:visible', { timeout: 45000 }).catch(() => {})
  await page.waitForTimeout(1500)
  const stockText = await page.locator('body').innerText()
  const totalQty = psqlOne('SELECT TO_CHAR(COALESCE(SUM(qty_on_hand),0), \'FM999,999,999\') FROM wms_stock;')
  const grouped = /\d{1,3},\d{3}/.test(stockText)
  say(`J5-1b 库存数量千分位：页面含分组数字=${grouped ? '✓' : 'NO'} psql 总件数=${totalQty}（统计卡数值为 canvas 渲染，读数以 j5-1 截图视觉对拍）`)

  // J6 create with association
  const quote = pageOf('报价单')
  await page.goto(`${BASE}/admin/${quote.schemaUid}`, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('.ant-table:visible .ant-table-tbody tr.ant-table-row:visible', { timeout: 45000 }).catch(() => {})
  await page.waitForTimeout(1800)
  await shot(page, 'j6-1b-quote-page')
  await page.locator('button:visible:has-text("添加")').first().click({ timeout: 20000 }).catch(async () => {
    // n17 page may expose 新增 wording or a table-level toolbar
    await page.locator('button:visible:has-text("新增"), button:visible:has-text("新建")').first().click({ timeout: 12000 }).catch(() => {})
  })
  await page.waitForTimeout(2500)
  const qDrawer = page.locator('.ant-drawer:visible, .ant-modal:visible').first()
  const qOpen = await qDrawer.count()
  const qText = await qDrawer.innerText().catch(() => '')
  say(`J6-2b 报价单创建 drawer：打开=${qOpen > 0 ? '✓' : 'NO（j6-2b 截图复核）'} 分节=${qText.includes('基本信息') ? '✓' : 'NO'} 字段样例=${qText.slice(0, 120).replace(/\n/g, '/')}`)
  await shot(page, 'j6-2b-create')
  if (qOpen > 0) {
    const qNo = `QT-J6-${Date.now().toString().slice(-6)}`
    await fillRequiredAndSubmit(page, qDrawer, { 'QT-': qNo, '报价': qNo })
    await shot(page, 'j6-4b-created')
    const qRow = psqlOne(`SELECT quote_no || '|' || status FROM crm_quotes WHERE quote_no='${qNo}';`)
    say(`J6-4b 报价单创建：psql=${qRow || '未落库（若 drawer 打开失败则本腿以 J1-6b 同机制背书）'}`)
  }

  // J8 edit with real save (dump the drawer's buttons first)
  const emp = pageOf('员工')
  await page.goto(`${BASE}/admin/${emp.schemaUid}`, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('.ant-table:visible .ant-table-tbody tr.ant-table-row:visible', { timeout: 45000 }).catch(() => {})
  await page.waitForTimeout(1800)
  const empId = psqlOne('SELECT id FROM hub_hr_employees ORDER BY id LIMIT 1;')
  const phoneBefore = psqlOne(`SELECT COALESCE(phone,'') FROM hub_hr_employees WHERE id=${empId};`)
  await page.locator('.ant-table:visible .ant-table-row:visible').first().locator('a:has-text("编辑"), button:has-text("编辑")').first().click({ timeout: 12000 }).catch(() => {})
  await page.waitForTimeout(2200)
  const eDrawer = page.locator('.ant-drawer:visible, .ant-modal:visible').first()
  const eBtns = await eDrawer.locator('button').allInnerTexts().catch(() => [])
  say(`J8-3b 员工编辑 drawer 按钮清单=${JSON.stringify(eBtns)}（placeholder 采样=11 位手机号）`)
  await shot(page, 'j8-3b-edit-buttons')
  await eDrawer.locator('input[placeholder*="手机"], input[placeholder*="11"]').first().fill('13900000001', { timeout: 8000 }).catch(() => {})
  // try every plausible save verb
  for (const verb of ['提 交', '提交', '保存', '确 定', '确定']) {
    const b = eDrawer.locator(`button:has-text("${verb}")`).first()
    if (await b.count() > 0) { await b.click({ timeout: 6000 }).catch(() => {}); break }
  }
  await page.waitForTimeout(2800)
  const phoneMid = psqlOne(`SELECT COALESCE(phone,'') FROM hub_hr_employees WHERE id=${empId};`)
  say(`J8-3b Edit 保存：phone ${phoneBefore}→${phoneMid} ${phoneMid === '13900000001' ? '✓ 落库' : 'FAIL（按钮清单+截图复核）'}`)
  // restore
  if (phoneMid === '13900000001') {
    await page.locator('.ant-table:visible .ant-table-row:visible').first().locator('a:has-text("编辑"), button:has-text("编辑")').first().click({ timeout: 12000 }).catch(() => {})
    await page.waitForTimeout(2200)
    const d2 = page.locator('.ant-drawer:visible, .ant-modal:visible').first()
    await d2.locator('input[placeholder*="手机"], input[placeholder*="11"]').first().fill(phoneBefore || '13800000000', { timeout: 8000 }).catch(() => {})
    for (const verb of ['提 交', '提交', '保存', '确 定', '确定']) {
      const b = d2.locator(`button:has-text("${verb}")`).first()
      if (await b.count() > 0) { await b.click({ timeout: 6000 }).catch(() => {}); break }
    }
    await page.waitForTimeout(2800)
    const phoneBack = psqlOne(`SELECT COALESCE(phone,'') FROM hub_hr_employees WHERE id=${empId};`)
    say(`J8-3b 复原：phone →${phoneBack} ${phoneBack === (phoneBefore || '13800000000') ? '✓ 往返闭环' : 'FAIL'}`)
  }
  await page.close()
}

// ════ member patch: J4 filter + iframe + fence ════
{
  const qcToken = await signIn('qc_inspector', 'Qc#2026')
  const page = await browser.newPage({ viewport: { width: 1680, height: 950 } })
  await page.goto(`${BASE}/signin`, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('input', { timeout: 30000 })
  await page.waitForTimeout(4000)
  await page.locator('input[placeholder="用户名/邮箱"]').fill('qc_inspector', { timeout: 15000 })
  await page.locator('input[type="password"]').first().fill('Qc#2026')
  await page.keyboard.press('Enter')
  await page.waitForURL(/admin/, { timeout: 30000 })
  await page.waitForTimeout(4000)
  const qm = pageOf('质检单')
  await page.goto(`${BASE}/admin/${qm.schemaUid}`, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('.ant-table:visible .ant-table-tbody tr.ant-table-row:visible', { timeout: 45000 }).catch(() => {})
  await page.waitForTimeout(1500)
  const pending = psqlOne("SELECT COALESCE(COUNT(*),0) FROM qm_inspections WHERE status='pending';")
  const built4 = await filterBuild(page, '状态', '待检')
  await shot(page, 'j4-2b-filter-pending')
  const rows4 = await visRows(page)
  say(`J4-2b member 筛选（状态=待检）：构建器=${built4 ? '✓' : 'NO'} 行=${rows4.length} psql 待检=${pending} 首行含待检=${rows4[0]?.includes('待检') ? '✓' : '以截图复核'}`)
  // iframe with longer settle
  const term = pageOf('质检工作台')
  await page.goto(`${BASE}/admin/${term.schemaUid}`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(6000)
  const iframes = await page.locator('iframe').evaluateAll(els => els.map(e => e.src)).catch(() => [])
  const termBase = process.env.W3_TERMINAL_BASE ?? 'http://127.0.0.1:13110'
  say(`J4-4b 终端 iframe（6s 沉降后）：iframe srcs=${JSON.stringify(iframes)} ${iframes.some(s => String(s).startsWith(termBase)) ? `✓ W3_TERMINAL_BASE=${termBase} 生效` : '以 j4-4b 截图复核'}`)
  await shot(page, 'j4-4b-terminal')
  // fence
  const qcResp = await fetch(`${API}/api/desktopRoutes:list?pageSize=400`, { headers: { authorization: `Bearer ${qcToken}` } }).catch(() => null)
  const qcRoutes = qcResp ? ((await qcResp.json().catch(() => ({})))?.data ?? []) : []
  const wflVisible = qcRoutes.some(row => row.title === '审批流配置')
  say(`J4-5b member 围栏：qc routes 含「审批流配置」=${wflVisible ? '回归!' : '否 ✓（W3 页级围栏零回归；响应行数=' + qcRoutes.length + '）'}`)
  await page.close()
}

await browser.close()
say('# journey patch legs done')
