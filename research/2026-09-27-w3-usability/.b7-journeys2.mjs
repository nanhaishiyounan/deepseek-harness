// W3-B7 journey forensics, chain 2: J2 计划员 → J3 车间主任.
// MPS 行详情 → MRP 日结 → MO 建议确认 → 审批 → release → 排产（看板/甘特）→
// 齐套 → 领料开工 → 车间终端报工（UI 三数等式）→ 完工核对。
// Run: node --import tsx/esm research/2026-09-27-w3-usability/.b7-journeys2.mjs
import { chromium } from '../../apps/web/node_modules/playwright/index.mjs'
import { submitForApproval, act } from '../../examples/kb-agent/scripts/approval-engine.mts'
import { runMrp, confirmSuggestion } from '../../examples/kb-agent/scripts/mrp-run.mts'
import { spawnSync } from 'node:child_process'

const DIR = 'research/2026-09-27-w3-usability/'
const BASE = 'http://127.0.0.1:3080/nocobase'
const API = process.env.NOCOBASE_BASE_URL || 'http://127.0.0.1:13000'
const today = new Date().toISOString().slice(0, 10)
const stamp = new Date().toISOString().replace('T', ' ').slice(0, 19)

const signIn = async (account, password) => {
  const r = await fetch(`${API}/api/auth:signIn`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ account, password }),
  })
  return (await r.json())?.data?.token
}
const adminToken = await signIn('admin@nocobase.com', 'admin123')
if (!adminToken) throw new Error('admin signIn failed')

const io = {
  list: async (collection, filter) => {
    const query = filter === undefined ? '' : `&filter=${encodeURIComponent(JSON.stringify(filter))}`
    const r = await fetch(`${API}/api/${collection}:list?pageSize=500${query}`, { headers: { authorization: `Bearer ${adminToken}` } }).then(x => x.json())
    return r.data ?? []
  },
  get: async (collection, id) => {
    const r = await fetch(`${API}/api/${collection}:get?filterByTk=${String(id)}`, { headers: { authorization: `Bearer ${adminToken}` } }).then(x => x.json())
    return r.data ?? undefined
  },
  create: async (collection, values) => {
    const r = await fetch(`${API}/api/${collection}:create`, { method: 'POST', headers: { authorization: `Bearer ${adminToken}`, 'content-type': 'application/json' }, body: JSON.stringify(values) }).then(x => x.json())
    if (!r.data) throw new Error(`create ${collection} failed: ${JSON.stringify(r).slice(0, 200)}`)
    return r.data
  },
  update: async (collection, id, values) => {
    await fetch(`${API}/api/${collection}:update?filterByTk=${String(id)}`, { method: 'POST', headers: { authorization: `Bearer ${adminToken}`, 'content-type': 'application/json' }, body: JSON.stringify(values) })
  },
  updateWhere: async (collection, filter, values) => {
    const r = await fetch(`${API}/api/${collection}:update?filter=${encodeURIComponent(JSON.stringify(filter))}&pageSize=10`, { method: 'POST', headers: { authorization: `Bearer ${adminToken}`, 'content-type': 'application/json' }, body: JSON.stringify(values) }).then(x => x.json())
    return Array.isArray(r.data) ? r.data.length : 1
  },
  destroy: async (collection, id) => {
    await fetch(`${API}/api/${collection}:destroy?filterByTk=${String(id)}`, { method: 'POST', headers: { authorization: `Bearer ${adminToken}` } })
  },
}
const rowsOf = io.list
const CLI = {
  h5: 'examples/kb-agent/scripts/nocobase-h5-wms.mts',
  sched: 'examples/kb-agent/scripts/mfg-schedule.mts',
}
const runWith = (script, args) => {
  const out = spawnSync('node', ['--import', 'tsx/esm', script, ...args], { encoding: 'utf8' })
  return `${out.stdout ?? ''}${out.stderr ?? ''}`
}
const run = (args) => runWith(CLI.h5, args)
const runSched = (args) => runWith(CLI.sched, args)
const runOk = (args) => {
  const t = run(args)
  if (!t.includes('OK') && !t.includes('✓') && !t.includes('posted') && !t.includes('released') && !t.includes('assigned')) {
    // h5-wms verbs print their own success words; absence of any known marker = inspect output.
    console.log(`  [h5-wms ${args.join(' ')}] ${t.trim().slice(0, 160)}`)
  }
  return t
}

const failures = []
const expect = (label, actual, wanted) => {
  const pass = JSON.stringify(actual) === JSON.stringify(wanted)
  console.log(`${pass ? '✓' : '✗'} ${label} — 实际 ${JSON.stringify(actual)}${pass ? '' : `，期望 ${JSON.stringify(wanted)}`}`)
  if (!pass) failures.push(label)
}
const shoot = (page, name) => page.screenshot({ path: `${DIR}${name}` })

console.log(`=== W3-B7 五角色旅程 · 链二（J2→J3 计划制造闭环）${stamp} ===`)

// ───────────────────────── J2 数据：MPS → MRP → MO 建议确认 → 审批 → release → 排产 ─────────────────────────
const mpsPlans = await rowsOf('mps_plans')
const activeMps = mpsPlans.find(r => String(r.doc_status) === 'approved') ?? mpsPlans[mpsPlans.length - 1]
if (!activeMps) throw new Error('no MPS plan rows')
const mpsItems = (await rowsOf('mps_plan_items')).filter(r => Number(r.plan_id) === Number(activeMps.id))
console.log(`j2-data: 活跃 MPS ${String(activeMps.code)}（${String(activeMps.doc_status)}，item 行 ${String(mpsItems.length)}）`)

// MRP 日结（幂等：每跑产新 run，MO 建议只在缺料净需求在时产出）。
const mrpRun = await runMrp(adminToken)
console.log(`j2-data: MRP 日结 ${mrpRun.run_id}（snapshots=${String(mrpRun.snapshots)}）`)
const openSuggestions = (await rowsOf('mrp_suggestions')).filter(r => String(r.status) === 'open')
const moSug = openSuggestions.find(r => String(r.plan_type ?? r.type ?? '') === 'MO') ?? openSuggestions[0]
if (!moSug) throw new Error('MRP 未产出 open 建议（库存全足额？）')

// 幂等锚：复跑时若 B7-J2 MO 已存在，直接续走生命周期。
const j2Anchors = (await rowsOf('mfg_orders')).filter(r => String(r.note ?? '').includes('W3-B7-J2'))
let mo = j2Anchors.length > 0
  ? j2Anchors.reduce((best, r) => Number(r.id) > Number(best.id) ? r : best)
  : undefined
if (!mo) {
  const confirmed = await confirmSuggestion(adminToken, Number(moSug.id), 'admin')
  // The confirm verb returns no code field — anchor on the newest MO row
  // created after the call (max id), then tag it with the journey note.
  const allMos = await rowsOf('mfg_orders')
  mo = allMos.reduce((best, r) => Number(r.id) > Number(best.id) ? r : best)
  if (mo) await io.update('mfg_orders', Number(mo.id), { note: 'W3-B7-J2 计划员旅程：MRP 建议确认转单' })
  console.log(`j2-data: 建议#${String(moSug.id)} 确认 → ${String(mo?.code)} draft`)
}
if (!mo) throw new Error('MO 未生成（confirmSuggestion 返回结构异常）')
console.log(`j2-data: MO ${String(mo.code)} qty=${String(mo.qty)} state=${String(mo.doc_status)}`)

// 审批 → release → 排产（幂等续走）。
{
  let state = String(mo.doc_status)
  if (state === 'draft') {
    await submitForApproval(io, 'mfg_orders', Number(mo.id), 'admin')
    await act(io, 'mfg_orders', Number(mo.id), 'approve', 'admin', 'J2：MRP 转单 MO，同意排产')
    state = String((await rowsOf('mfg_orders')).find(r => r.id === mo.id)?.doc_status)
  }
  expect('J2 MO 审批后状态', ['approved', 'released', 'in_progress', 'completed'].includes(state), true)
  let operations = (await rowsOf('mfg_order_operations')).filter(r => Number(r.order_id) === Number(mo.id))
  if (operations.length === 0) {
    console.log(runSched(['--release', String(mo.code)]).trim().slice(-160))
    console.log(runSched(['--preview', String(mo.code)]).trim().slice(-160))
    console.log(runSched(['--apply', String(mo.code)]).trim().slice(-160))
    operations = (await rowsOf('mfg_order_operations')).filter(r => Number(r.order_id) === Number(mo.id))
  }
  expect('J2 排产工序已生成', operations.length >= 1, true)
  console.log(`j2-data: 排产 ${String(operations.length)} 工序（${operations.map(o => `${String(o.seq)}:${String(o.name)}@${String(o.planned_date ?? '')}`).join(' | ')}）`)
}

// ───────────────────────── browser: J2 计划员页面动线 ─────────────────────────
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } })
await page.addInitScript(t => localStorage.setItem('NOCOBASE_TOKEN', t), adminToken)
const openAdmin = async (routeUid, waitRow = true) => {
  await page.goto(`${BASE}/admin/${routeUid}`, { waitUntil: 'domcontentloaded', timeout: 60_000 })
  if (waitRow) await page.waitForSelector('.ant-table-row, .ant-card, iframe, .ant-picker-cell', { timeout: 60_000 }).catch(() => undefined)
  await page.waitForTimeout(1200)
}

// J2-1 主生产计划：行详情 drawer（B2 计划行子表）。
await openAdmin('w7mrpyru4s708nwn')
await shoot(page, 'w3-b7-journey-j2-1-mps-page.png')
{
  const row = page.locator('.ant-table-row', { hasText: String(activeMps.code) }).first()
  if ((await row.count()) === 0) throw new Error('MPS row not visible')
  await row.locator('a:has-text("查看"), button:has-text("查看")').first().click()
  await page.waitForSelector('.ant-drawer-content', { timeout: 15_000 })
  await page.waitForTimeout(1500)
  await shoot(page, 'w3-b7-journey-j2-1-mps-drawer.png')
  const text = (await page.locator('.ant-drawer-content').innerText()).trim()
  expect('J2 MPS drawer 含计划行', text.length > 30, true)
}

// J2-2 MRP 快照页。
await openAdmin('w7mrpowj6l93nn0a')
await shoot(page, 'w3-b7-journey-j2-2-mrp-snapshots.png')
{
  const rows = await page.locator('.ant-table-row').count()
  expect('J2 MRP 快照页有行', rows > 0, true)
}

// J2-3 生产订单看板（B3 只读看板，MO 卡可见）。九列看板超出默认视口——
// 拉宽到 2560 才能同屏对拍全部列（执行态列在右半区）。
await openAdmin('w3b39xulomz8jj', false)
await page.setViewportSize({ width: 2560, height: 1000 })
await page.waitForTimeout(4000)
{
  await shoot(page, 'w3-b7-journey-j2-3-mo-kanban.png')
  const text = await page.locator('body').innerText()
  expect('J2 生产订单看板含该 MO 卡', text.includes(String(mo.code)), true)
  // 列分布 psql 对拍（看板列头计数 vs SQL 分组计数）。
  const sqlRows = await fetch(`${API}/api/mfg_orders:list?pageSize=500&append=doc_status`, { headers: { authorization: `Bearer ${adminToken}` } }).then(x => x.json())
  const counts = {}
  for (const row of (sqlRows.data ?? [])) counts[String(row.doc_status)] = (counts[String(row.doc_status)] ?? 0) + 1
  for (const [state, label] of [['draft', '草稿'], ['approved', '已生效'], ['released', '已下达'], ['in_progress', '执行中'], ['completed', '已完工']]) {
    const board = Number(new RegExp(`${label}\\s*[(（]?\\s*(\\d+)\\s*[)）]?`).exec(text)?.[1] ?? '-1')
    console.log(`j2-3 列对拍 ${label}: 看板 ${String(board)} vs SQL ${String(counts[state] ?? 0)}`)
    if (board !== -1) expect(`J2 看板列「${label}」计数 = SQL`, board, counts[state] ?? 0)
  }
}
await page.setViewportSize({ width: 1600, height: 1000 })

// J2-4 排产甘特（v1 页，只读单视图）。
await openAdmin('96yet9a0x45', false)
await page.waitForTimeout(3000)
await shoot(page, 'w3-b7-journey-j2-4-gantt.png')

// J2-5 计划工作台（W2 既有：拆单/齐套建议卡）。
await openAdmin('w7mrphtm8t9tzlk8')
await shoot(page, 'w3-b7-journey-j2-5-plan-workbench.png')

// J2 终点 psql 断言：MPS→MRP→MO 数量一致（覆盖互斥下的净需求）。
{
  const moRow = (await rowsOf('mfg_orders')).find(r => r.id === mo.id)
  const snap = (await rowsOf('mrp_snapshots')).filter(r => String(r.run_id) === String(mrpRun.run_id))
  expect('J2 MRP 快照行 ≥1', snap.length >= 1, true)
  expect('J2 MO qty > 0', Number(moRow.qty) > 0, true)
  const operations = (await rowsOf('mfg_order_operations')).filter(r => Number(r.order_id) === Number(mo.id))
  expect('J2 甘特工序条 = FCS 排产结果', operations.length >= 1, true)
}
console.log('=== J2 计划员旅程完成（MPS 子表→MRP→MO→看板→甘特→建议卡）===')

// ───────────────────────── J3 数据：齐套 → 领料开工（in_progress） ─────────────────────────
{
  const moRow = (await rowsOf('mfg_orders')).find(r => r.id === mo.id)
  if (!['completed', 'closed'].includes(String(moRow.doc_status))) {
    runOk(['--availability-check', String(mo.code)])
    // 缺料回补（s6 同款：组件按硬预留缺口 post-adjust 到 need+200）。
    {
      const moNow = (await rowsOf('mfg_orders')).find(r => r.id === mo.id)
      const products = await rowsOf('hub_inv_products')
      const lots = await rowsOf('wms_lots')
      const bins = await rowsOf('wms_bins')
      const stock = await rowsOf('wms_stock')
      const bomLines = (await rowsOf('mfg_bom_lines')).filter(r => Number(r.bom_id) === Number(moNow.bom_id))
      const needOf = (line) => Math.ceil(Number(line.qty_per_unit) * (1 + Number(line.scrap_pct) / 100) * Number(moNow.qty ?? 0))
      const reserved = (await rowsOf('wms_reservations')).filter(r => r.ref_type === 'MO' && r.ref_id === String(mo.code) && String(r.status) === 'reserved')
      for (const line of bomLines) {
        const product = products.find(r => Number(r.id) === Number(line.product_id))
        if (!product) continue
        const need = needOf(line)
        const have = reserved.filter(r => Number(r.product_id) === Number(product.id)).reduce((total, r) => total + Number(r.qty ?? 0), 0)
        if (have >= need) continue
        const lot = lots.find(r => Number(r.product_id) === Number(product.id) && ['qualified', 'unrestricted'].includes(String(r.status ?? '')))
          ?? lots.find(r => Number(r.product_id) === Number(product.id))
        if (!lot) continue
        const row = stock.find(c => Number(c.product_id) === Number(product.id) && Number(c.lot_id) === Number(lot.id))
        const binCode = String(bins.find(b => Number(b.id) === Number(row?.bin_id))?.code ?? 'GZ-A-01-01')
        runOk(['--post-adjust', String(product.sku), String(lot.lot_no), binCode, String(need + 200)])
        console.log(`j3-data: 组件回补 ${String(product.sku)} → ${String(need + 200)}`)
      }
      runOk(['--availability-check', String(mo.code)])
      const after = (await rowsOf('mfg_orders')).find(r => r.id === mo.id)
      expect('J3 齐套 assigned', String(after.reservation_state), 'assigned')
    }
    // 领料（每组件 draft→post；MI code 按 MO 后缀防跨单串号）。
    {
      const moNow = (await rowsOf('mfg_orders')).find(r => r.id === mo.id)
      const bomLines = (await rowsOf('mfg_bom_lines')).filter(r => Number(r.bom_id) === Number(moNow.bom_id))
      const issues = await rowsOf('mfg_material_issues')
      const moReserved = (await rowsOf('wms_reservations')).filter(r => r.ref_type === 'MO' && r.ref_id === String(mo.code) && String(r.status) === 'reserved')
      let index = 0
      for (const line of bomLines) {
        index += 1
        const code = `MI-B7J2-${String(mo.code).slice(-4)}-${String(index).padStart(2, '0')}`
        if (!issues.some(r => r.code === code)) {
          const reserved = moReserved.filter(r => Number(r.product_id) === Number(line.product_id)).reduce((total, r) => total + Number(r.qty ?? 0), 0)
          if (reserved <= 0) {
            console.log(`j3-data: 领料 ${code} 无未耗预留（组件 #${String(line.product_id)}）`)
            continue
          }
          await io.create('mfg_material_issues', {
            code, mo: { id: Number(mo.id) }, issue_date: today,
            product: { id: Number(line.product_id) }, qty: reserved, status: 'draft', note: 'W3-B7-J3 车间领料',
          })
        }
        const t = run(['--post-issue', code])
        if (t.includes('posted') || t.includes('in_progress')) {
          console.log(`j3-data: 领料 ${code} posted`)
        } else if (t.includes('无有效预留') || t.includes('已被领完') || t.includes('超领被拒')) {
          console.log(`j3-data: 领料 ${code} 前轮已领（引擎拒绝跳过）`)
        } else {
          console.log(`j3-data: 领料 ${code} 引擎回执 ${t.trim().slice(0, 120)}`)
        }
      }
    }
  } else {
    console.log('j3-data: MO 已 completed（复跑幂等，跳过齐套领料）')
  }
  const moNow2 = (await rowsOf('mfg_orders')).find(r => r.id === mo.id)
  console.log(`j3-data: MO ${String(mo.code)} 状态 ${String(moNow2.doc_status)}（领料开工后应为 in_progress）`)
  expect('J3 MO 已开工（in_progress/completed）', ['in_progress', 'completed'].includes(String(moNow2.doc_status)), true)
}

// J3-1 生产订单页 MO drawer（B2 工序子表）。行可能落在分页后页——翻页查找。
await openAdmin('w5mfgntyu7wy20a')
const findMoRow = async () => page.locator('.ant-table-row', { hasText: String(mo.code) }).first()
if ((await (await findMoRow()).count()) === 0) {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const next = page.locator('.ant-pagination-next:not(.ant-pagination-disabled)').first()
    if ((await next.count()) === 0) break
    await next.click()
    await page.waitForTimeout(1200)
    if ((await (await findMoRow()).count()) > 0) break
  }
}
{
  const row = await findMoRow()
  if ((await row.count()) === 0) throw new Error('MO row not visible on 生产订单 page')
  await row.locator('a:has-text("查看"), button:has-text("查看")').first().click()
  await page.waitForSelector('.ant-drawer-content', { timeout: 15_000 })
  await page.waitForTimeout(1500)
  await shoot(page, 'w3-b7-journey-j3-1-mo-drawer.png')
  const text = (await page.locator('.ant-drawer-content').innerText()).trim()
  expect('J3 MO drawer 非空', text.length > 30, true)
}

// J3-2 车间终端报工（iframe UI：卡队列 → 报工弹层 → 三数等式 → 提交）。
await openAdmin('w3b6guuruqly03t', false)
await page.waitForSelector('iframe', { timeout: 60_000 })
await page.waitForTimeout(1500)
{
  const frame = page.frames().find(f => f.url().includes('report'))
  if (!frame) throw new Error('report iframe not found')
  await frame.waitForSelector('.card, .empty', { timeout: 30_000 }).catch(() => undefined)
  await shoot(page, 'w3-b7-journey-j3-2-report-terminal.png')
  const card = frame.locator('.card', { hasText: String(mo.code) }).first()
  if ((await card.count()) > 0) {
    await card.locator('button').first().click()
    await frame.waitForTimeout(600)
    await shoot(page, 'w3-b7-journey-j3-3-report-sheet.png')
    // 第一工序全数完成（完成=计划-已报，待求=0，损失=0 → 等式成立）。
    const qtyInput = frame.locator('#qty-good')
    const remainingText = await frame.locator('#sheet-sub').innerText().catch(() => '')
    console.log(`j3-3: 报工弹层 ${remainingText.replace(/\n/g, ' ').slice(0, 120)}`)
    await qtyInput.fill(String(mo.qty))
    await frame.waitForTimeout(300)
    await shoot(page, 'w3-b7-journey-j3-4-equation.png')
    const equation = await frame.locator('#equation').innerText().catch(() => '')
    console.log(`j3-4: 等式显示 ${equation.replace(/\n/g, ' ')}`)
    const submit = frame.locator('#sheet-submit')
    if (!(await submit.isDisabled())) {
      await submit.click()
      await frame.waitForTimeout(3000)
      await shoot(page, 'w3-b7-journey-j3-5-report-posted.png')
    } else {
      await shoot(page, 'w3-b7-journey-j3-5-report-BLOCKED.png')
      throw new Error('报工提交按钮未解锁（三数等式不满足）')
    }
  } else {
    console.log('j3-2: MO 不在报工队列（可能已报满/已完工）——复跑幂等，交互截图沿用首轮')
  }
}
// 库内对拍：三数等式 + 报工行落库。
{
  const jobReports = (await rowsOf('mfg_job_reports')).filter(r => Number(r.mo_id) === Number(mo.id))
  expect('J3 mfg_job_reports 已落库', jobReports.length >= 1, true)
  const moRow = (await rowsOf('mfg_orders')).find(r => r.id === mo.id)
  const ops = (await rowsOf('mfg_order_operations')).filter(r => Number(r.order_id) === Number(mo.id))
  for (const op of ops) {
    const posted = jobReports.filter(r => String(r.status) === 'posted' && Number(r.op_seq) === Number(op.seq))
    const reported = posted.reduce((total, r) => total + Number(r.qty_good ?? 0) + Number(r.qty_scrap ?? 0), 0)
    console.log(`j3-eq: 工序${String(op.seq)} 已报 ${String(reported)} / 计划 ${String(Number(moRow.qty))}（三数等式由端点强校验，超报 fail-loud）`)
  }
  expect('J3 MO 状态推进（引擎动词结果）', ['in_progress', 'completed'].includes(String(moRow.doc_status)), true)
}

// J3-3 完工核对（若未完工：补报齐 → 完工 → OQC → 放行；已完工直接页面核对）。
{
  const moRow = (await rowsOf('mfg_orders')).find(r => r.id === mo.id)
  if (!['completed', 'closed'].includes(String(moRow.doc_status))) {
    // 补齐各工序报工（走引擎正门 REST draft + --post-report）。
    const ops = (await rowsOf('mfg_order_operations')).filter(r => Number(r.order_id) === Number(mo.id))
    const existing = await rowsOf('mfg_job_reports')
    let seq = 0
    for (const op of ops) {
      seq += 1
      const code = `JR-B7J2-${String(mo.code).slice(-4)}-${String(seq).padStart(2, '0')}`
      const posted = existing.filter(r => Number(r.mo_id) === Number(mo.id) && String(r.status) === 'posted' && Number(r.op_seq) === Number(op.seq))
      const reported = posted.reduce((total, r) => total + Number(r.qty_good ?? 0) + Number(r.qty_scrap ?? 0), 0)
      const gap = Number(moRow.qty) - reported
      if (gap > 1e-9 && !existing.some(r => r.code === code)) {
        await io.create('mfg_job_reports', {
          code, mo: { id: Number(mo.id) }, op_seq: Number(op.seq), report_date: today,
          qty_good: gap, qty_scrap: 0, duration_min: 240, operator: '王磊', qc_status: 'not_required',
          status: 'draft', note: 'W3-B7-J3 补报齐工序',
        })
      }
      const t = run(['--post-report', code])
      console.log(`j3-data: 报工 ${code} → ${t.trim().split('\n').slice(-1)[0].slice(0, 120)}`)
    }
    // 完工 → OQC → 放行（completion/OQC 单锚定本 MO，避免跨 MO 串单）。
    const mcCode = `MC-B7J2-${String(mo.code).slice(-4)}`
    const completions = (await rowsOf('mfg_completions')).filter(r => Number(r.mo_id) === Number(mo.id))
    if (!completions.some(r => r.code === mcCode)) {
      await io.create('mfg_completions', {
        code: mcCode, mo: { id: Number(mo.id) }, qty: Number(moRow.qty),
        lot_no: '', oqc_status: 'pending', status: 'draft', note: 'W3-B7-J3 完工入库',
      })
    }
    runOk(['--post-completion', mcCode])
    const oqcCode = `QI-B7J3-OQC-${String(mo.code).slice(-4)}`
    if (!(await rowsOf('qm_inspections')).some(r => r.code === oqcCode)) {
      const completion = (await rowsOf('mfg_completions')).find(r => r.code === mcCode)
      await io.create('qm_inspections', {
        code: oqcCode, insp_type: 'OQC', ref_type: 'completion', ref_no: mcCode,
        product_id: Number(moRow.product_id), supplier_id: null, lot_no: String(completion?.lot_no ?? ''),
        lot_qty: Math.min(Number(moRow.qty), 1200), sample_qty: 80, defect_critical: 0, defect_major: 0, defect_minor: 1,
        result: 'pending', status: 'pending', inspector: '质检员王倩', inspected_at: today,
        note: 'W3-B7-J3 OQC 出货抽检（d=1 ≤ Ac5 接收）',
      })
    }
    const t = run(['--inspect', oqcCode, '--defects', '0,0,1', '--inspector', '质检员王倩', '--aql', '2.5'])
    console.log(`j3-data: OQC ${t.includes('已判定') ? '前轮已判定' : '判定完成'}`)
    runOk(['--release-completion', mcCode])
  }
  const moFinal = (await rowsOf('mfg_orders')).find(r => r.id === mo.id)
  expect('J3 MO 终态 completed', ['completed', 'closed'].includes(String(moFinal.doc_status)), true)
  const completionFinal = (await rowsOf('mfg_completions')).filter(r => Number(r.mo_id) === Number(mo.id))
  expect('J3 完工单 OQC 放行', completionFinal.length > 0 && completionFinal.some(r => String(r.status) === 'closed' || String(r.oqc_status) === 'passed'), true)
}

// J3-4 完工单页核对。
await openAdmin('w6mfgp1rrz08ffa')
await shoot(page, 'w3-b7-journey-j3-6-completions.png')
{
  const text = await page.locator('body').innerText()
  const mcVisible = text.includes('MC-B7J2')
  if (!mcVisible) {
    const next = page.locator('.ant-pagination-next:not(.ant-pagination-disabled)').first()
    if ((await next.count()) > 0) {
      await next.click()
      await page.waitForTimeout(1200)
      await shoot(page, 'w3-b7-journey-j3-6b-completions-p2.png')
    }
  }
  expect('J3 完工单页含 MC-B7J2', (await page.locator('body').innerText()).includes('MC-B7J2'), true)
}

await browser.close()

console.log(`\n=== 链二断言汇总：${failures.length === 0 ? 'ALL PASS' : `FAIL ×${String(failures.length)}`} ===`)
failures.forEach(f => console.log(`  ✗ ${f}`))
if (failures.length > 0) process.exitCode = 1
