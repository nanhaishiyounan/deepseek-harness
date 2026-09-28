// W3-B7 journey forensics, chain 3: J6 管理员（治理动线）+ J7 member（只读抽查）.
// J6: 审批流配置中心（SVG 图 + EditForm 改流 → config_note 留痕 → 一致性探针 →
// 复原）→ 权限矩阵 → 组织架构。J7: member（qc_inspector，质检部）URL 直达——
// 行详情 drawer 可见 / 生产订单看板只读 / 审批流配置 404。
// Run: node --import tsx/esm research/2026-09-27-w3-usability/.b7-journeys3.mjs
import { chromium } from '../../apps/web/node_modules/playwright/index.mjs'

const DIR = 'research/2026-09-27-w3-usability/'
const BASE = 'http://127.0.0.1:3080/nocobase'
const API = process.env.NOCOBASE_BASE_URL || 'http://127.0.0.1:13000'
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
  update: async (collection, id, values) => {
    await fetch(`${API}/api/${collection}:update?filterByTk=${String(id)}`, { method: 'POST', headers: { authorization: `Bearer ${adminToken}`, 'content-type': 'application/json' }, body: JSON.stringify(values) })
  },
}
const rowsOf = io.list

const failures = []
const expect = (label, actual, wanted) => {
  const pass = JSON.stringify(actual) === JSON.stringify(wanted)
  console.log(`${pass ? '✓' : '✗'} ${label} — 实际 ${JSON.stringify(actual)}${pass ? '' : `，期望 ${JSON.stringify(wanted)}`}`)
  if (!pass) failures.push(label)
}
const shoot = (page, name) => page.screenshot({ path: `${DIR}${name}` })

console.log(`=== W3-B7 五角色旅程 · 链三（J6 治理 + J7 member 抽查）${stamp} ===`)

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } })
await page.addInitScript(t => localStorage.setItem('NOCOBASE_TOKEN', t), adminToken)
const openAdmin = async (routeUid, waitRow = true) => {
  const t0 = Date.now()
  await page.goto(`${BASE}/admin/${routeUid}`, { waitUntil: 'domcontentloaded', timeout: 60_000 })
  if (waitRow) await page.waitForSelector('.ant-table-row, .ant-card, .ant-picker-cell, iframe, svg', { timeout: 60_000 }).catch(() => undefined)
  await page.waitForTimeout(1500)
  return Date.now() - t0
}

// ───────────────────────── J6 管理员：审批流配置中心 ─────────────────────────
const purFlow = (await rowsOf('wfl_flow_configs')).find(r => r.doc_type === 'pur_orders')
const beforeExtras = JSON.parse(purFlow.extras)
const baseThreshold = Number(beforeExtras.amount_threshold ?? 200000)

// J6-1 配置中心：SVG 状态图 + 流列表（JSBlock 图渲染偶发慢——等 svg 出现）。
await openAdmin('w3b4u2r9nnjqvi', false)
await page.waitForSelector('svg', { timeout: 20_000 }).catch(() => undefined)
await page.waitForTimeout(3000)
await shoot(page, 'w3-b7-journey-j6-1-config-center.png')
{
  const svg = await page.locator('svg').count()
  expect('J6 配置中心渲染 SVG 状态图', svg > 0, true)
}

// J6-2 EditForm 改流：pur_orders 阈值 200000 → 250000（REST 直写 = EditForm 同通道），config_note 留痕。
const editStamp = new Date().toISOString().replace('T', ' ').slice(0, 19)
{
  const extras = { ...beforeExtras, amount_threshold: 250_000 }
  await io.update('wfl_flow_configs', Number(purFlow.id), {
    extras: JSON.stringify(extras),
    config_note: `${purFlow.config_note}\n${editStamp} w3b7-j6 config-center: extras.amount_threshold ${String(baseThreshold)}→250000（管理员旅程改流，验后复原）(operator=admin)`,
  })
  // 转移条件同步（与 extras 两处同写，B4 语义）。
  const transitions = (await rowsOf('wfl_flow_transitions')).filter(r => Number(r.flow_id) === Number(purFlow.id))
  for (const row of transitions) {
    if (String(row.condition_expr ?? '').includes(String(baseThreshold))) {
      const { dataOf } = await import('../../examples/kb-agent/scripts/nocobase-flow-page-lib.mts')
      await dataOf(adminToken, 'POST', `/api/wfl_flow_transitions:update?filterByTk=${String(row.id)}`, {
        condition_expr: String(row.condition_expr).replaceAll(String(baseThreshold), '250000'),
      })
    }
  }
  const after = (await rowsOf('wfl_flow_configs')).find(r => r.doc_type === 'pur_orders')
  expect('J6 阈值已改 250000', JSON.parse(after.extras).amount_threshold, 250_000)
  expect('J6 config_note 留痕', String(after.config_note).includes('w3b7-j6'), true)
  console.log(`j6-2: 改流 ${String(baseThreshold)} → 250000（extras + 转移条件两处同写）`)
}
// J6-3 一致性探针（保存后 fail-loud 探针必须仍绿）。
{
  const probeRun = await import('../../examples/kb-agent/scripts/nocobase-w3-approval-visual.mts')
  const issues = await probeRun.assertWflConsistency(adminToken)
  expect('J6 改流后一致性探针 0 问题', issues.length, 0)
}
await openAdmin('w3b4u2r9nnjqvi', false)
await page.waitForTimeout(2000)
await shoot(page, 'w3-b7-journey-j6-2-config-edited.png')
// J6-4 复原（config_note 再留一行）。
{
  const current = (await rowsOf('wfl_flow_configs')).find(r => r.doc_type === 'pur_orders')
  const extras = { ...JSON.parse(current.extras), amount_threshold: baseThreshold }
  await io.update('wfl_flow_configs', Number(current.id), {
    extras: JSON.stringify(extras),
    config_note: `${current.config_note}\n${editStamp} w3b7-j6 config-center: 阈值复原 250000→${String(baseThreshold)}(operator=admin)`,
  })
  const transitions = (await rowsOf('wfl_flow_transitions')).filter(r => Number(r.flow_id) === Number(current.id))
  for (const row of transitions) {
    if (String(row.condition_expr ?? '').includes('250000')) {
      const { dataOf } = await import('../../examples/kb-agent/scripts/nocobase-flow-page-lib.mts')
      await dataOf(adminToken, 'POST', `/api/wfl_flow_transitions:update?filterByTk=${String(row.id)}`, {
        condition_expr: String(row.condition_expr).replaceAll('250000', String(baseThreshold)),
      })
    }
  }
  const restored = (await rowsOf('wfl_flow_configs')).find(r => r.doc_type === 'pur_orders')
  expect('J6 阈值复原', JSON.parse(restored.extras).amount_threshold, baseThreshold)
}

// J6-5 权限矩阵页（B5）。
await openAdmin('w3b5m8kwiakieq', false)
await page.waitForTimeout(2500)
await shoot(page, 'w3-b7-journey-j6-3-acl-matrix.png')
{
  const text = await page.locator('body').innerText()
  expect('J6 权限矩阵渲染', text.includes('member') || text.includes('角色'), true)
}
// J6-6 组织架构页（B5 部门树）。
await openAdmin('w3b57ix4086om95', false)
await page.waitForTimeout(2500)
await shoot(page, 'w3-b7-journey-j6-4-org-chart.png')
{
  const text = await page.locator('body').innerText()
  expect('J6 组织架构含部门树', text.includes('新源食品集团') || text.includes('质检部'), true)
}
// J6 终点 psql 断言面（config_note 双行留痕 + wfl 完整性）。
{
  const flows = await rowsOf('wfl_flow_configs')
  expect('J6 wfl 流配置完整（≥6 流）', flows.length >= 6, true)
  const note = String((await rowsOf('wfl_flow_configs')).find(r => r.doc_type === 'pur_orders').config_note)
  expect('J6 config_note 双向留痕（改+复原）', (note.match(/w3b7-j6/g) ?? []).length >= 2, true)
}
console.log('=== J6 管理员旅程完成（配置中心改流→矩阵→组织架构）===')

// ───────────────────────── J7 member 视角抽查（qc_inspector@w3b5.demo，质检部） ─────────────────────────
// Token swap rides a fresh browser context (the B1 member-shot pattern: a
// live localStorage write can lose the race against the SPA boot read).
const memberToken = await signIn('qc_inspector@w3b5.demo', 'Qc#2026')
if (!memberToken) throw new Error('member (qc_inspector) signIn failed')
const memberContext = await browser.newContext({ viewport: { width: 1600, height: 1000 } })
const memberPage = await memberContext.newPage()
await memberPage.addInitScript(t => localStorage.setItem('NOCOBASE_TOKEN', t), memberToken)
await memberPage.goto(`${BASE}/admin/w3puryzkva06iuhh`, { waitUntil: 'domcontentloaded', timeout: 60_000 })
await memberPage.waitForSelector('.ant-table-row', { timeout: 60_000 }).catch(() => undefined)
await memberPage.waitForTimeout(1500)
await shoot(memberPage, 'w3-b7-journey-j7-1-member-po-page.png')
{
  const rows = await memberPage.locator('.ant-table-row').count()
  console.log(`j7-1: member 采购订单页行数 ${String(rows)}`)
  const row = memberPage.locator('.ant-table-row', { hasText: 'PO-B7J1' }).first()
  if ((await row.count()) > 0) {
    await row.locator('a:has-text("查看"), button:has-text("查看")').first().click()
    await memberPage.waitForSelector('.ant-drawer-content', { timeout: 15_000 })
    await memberPage.waitForTimeout(1500)
    await shoot(memberPage, 'w3-b7-journey-j7-1b-member-po-drawer.png')
    const text = (await memberPage.locator('.ant-drawer-content').innerText()).trim()
    expect('J7 member 行详情 drawer 可见（B1 ACL）', text.length > 30, true)
  } else {
    expect('J7 member 行详情 drawer 可见（B1 ACL）', false, true)
  }
}
// J7-2 生产订单看板只读（B3 只读 + member 可见）。
await memberPage.setViewportSize({ width: 2560, height: 1000 })
await memberPage.goto(`${BASE}/admin/w3b39xulomz8jj`, { waitUntil: 'domcontentloaded', timeout: 60_000 })
await memberPage.waitForTimeout(4000)
await shoot(memberPage, 'w3-b7-journey-j7-2-member-mo-kanban.png')
{
  const text = await memberPage.locator('body').innerText()
  expect('J7 member 看板可见', text.includes('草稿') || text.includes('已生效'), true)
}
await memberPage.setViewportSize({ width: 1600, height: 1000 })
// J7-3 审批流配置对 member 404（B4 admin-only 页面 ACL；B1 的全域 view 授权是
// 集合级读权限——治理边界在页面入口与写路径，不在读）。
await memberPage.goto(`${BASE}/admin/w3b4u2r9nnjqvi`, { waitUntil: 'domcontentloaded', timeout: 60_000 })
await memberPage.waitForTimeout(2500)
await shoot(memberPage, 'w3-b7-journey-j7-3-member-config-404.png')
{
  const text = await memberPage.locator('body').innerText()
  const denied = text.includes('404') || text.includes('Not Found') || text.includes('无权') || text.includes('不存在') || text.length < 400
  expect('J7 member 审批流配置不可达（404/空）', denied, true)
}
await memberContext.close()
// J7 终点 psql 断言面：member 的 rolesResources 视图授权在位、wfl 配置无授权。
{
  const { dataOf } = await import('../../examples/kb-agent/scripts/nocobase-flow-page-lib.mts')
  const resources = await dataOf(adminToken, 'GET', '/api/rolesResources:list?pageSize=500&filter=' + encodeURIComponent(JSON.stringify({ roleName: 'member' })))
  const names = (Array.isArray(resources) ? resources : resources?.data ?? []).map(r => String(r.name))
  expect('J7 member 有集合 view 授权（≥1）', names.length >= 1, true)
  // Write-path fencing: B1 granted collection-wide *view* to member (all 83);
  // the governance boundary is the page entry (404 above) plus the REST write
  // path — assert a direct member update on wfl_flow_configs is refused.
  const probe = await fetch(`${API}/api/wfl_flow_configs:update?filterByTk=${String(purFlow.id)}`, {
    method: 'POST', headers: { authorization: `Bearer ${memberToken}`, 'content-type': 'application/json' },
    body: JSON.stringify({ config_note: 'j7-write-probe（应被拒）' }),
  })
  const probeBody = await probe.json().catch(() => ({}))
  expect('J7 member 直写 wfl 配置被拒（403/400）', probe.status === 403 || probe.status === 400 || probeBody?.errors?.length > 0, true)
  console.log(`j7-psql面: member 授权集合 ${String(names.length)} 个（pur_orders ${names.includes('pur_orders') ? '在' : '缺'} / mfg_orders ${names.includes('mfg_orders') ? '在' : '缺'}），写探针 http=${String(probe.status)}`)
}
console.log('=== J7 member 抽查完成（行详情可见 / 看板只读 / 配置不可达）===')

await browser.close()

console.log(`\n=== 链三断言汇总：${failures.length === 0 ? 'ALL PASS' : `FAIL ×${String(failures.length)}`} ===`)
failures.forEach(f => console.log(`  ✗ ${f}`))
if (failures.length > 0) process.exitCode = 1
