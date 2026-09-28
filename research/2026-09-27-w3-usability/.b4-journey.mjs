// W3-B4 the edit-journey evidence script: the threshold edit loop rides the
// exact REST write path the EditFormModel submits (wfl_flow_configs:update),
// then the engine hot-effect runs real submits through submitForApproval/act
// (the same engine functions the serve :13110 exposes).
import { signInWithRetry, call, dataOf } from '../../examples/kb-agent/scripts/nocobase-flow-page-lib.mts'
import { submitForApproval, act } from '../../examples/kb-agent/scripts/approval-engine.mts'

const token = await signInWithRetry()
const base = process.env.NOCOBASE_BASE_URL ?? 'http://127.0.0.1:13000'
const stamp = new Date().toISOString().replace('T', ' ').slice(0, 19)

const tokenIO = {
  list: async (collection, filter) => {
    const query = filter === undefined ? '' : `&filter=${encodeURIComponent(JSON.stringify(filter))}`
    return (await dataOf(token, 'GET', `/api/${collection}:list?pageSize=500${query}`)) ?? []
  },
  get: async (collection, id) => await dataOf(token, 'GET', `/api/${collection}:get?filterByTk=${id}`) ?? undefined,
  create: async (collection, values) => await dataOf(token, 'POST', `/api/${collection}:create`, values),
  update: async (collection, id, values) => { await dataOf(token, 'POST', `/api/${collection}:update?filterByTk=${id}`, values) },
  updateWhere: async (collection, filter, values) => {
    const rows = await dataOf(token, 'POST', `/api/${collection}:update?filter=${encodeURIComponent(JSON.stringify(filter))}&pageSize=10`, values)
    return Array.isArray(rows) ? rows.length : rows === null || rows === undefined ? 0 : 1
  },
  destroy: async (collection, id) => { await call(token, 'POST', `/api/${collection}:destroy?filterByTk=${id}`) },
}

const rowsOf = async (collection, filter) => tokenIO.list(collection, filter)
const flowOf = async (docType) => (await rowsOf('wfl_flow_configs', { doc_type: docType }))[0]
const conditionRowOf = async (flowId) => (await rowsOf('wfl_flow_transitions', { flow_id: flowId })).filter(row => String(row.condition_expr ?? '').includes('<='))

const probe = async () => {
  const result = await fetch(base + '/api/wfl_flow_configs:list?pageSize=500', { headers: { authorization: `Bearer ${token}` } }).then(r => r.json())
  return result.data ?? []
}

const failures = []
const expect = (label, actual, wanted) => {
  const pass = JSON.stringify(actual) === JSON.stringify(wanted)
  console.log(`${pass ? '✓' : '✗'} ${label} — 实际 ${JSON.stringify(actual)}${pass ? '' : `，期望 ${JSON.stringify(wanted)}`}`)
  if (!pass) failures.push(label)
}

console.log(`=== W3-B4 编辑旅程（REST 直写 = EditFormModel 提交通道）${stamp} ===`)

// ── 1) pur_orders: 200000 → 150000 (extras + condition literal, audit line) ──
const pur = await flowOf('pur_orders')
const purExtras = JSON.parse(pur.extras)
if (purExtras.amount_threshold === 150000) {
  // A previous half-run already moved the gate; converge back to the 200000
  // baseline first so the journey replays from its documented start.
  const backConditions = await conditionRowOf(pur.id)
  for (const row of backConditions) {
    await dataOf(token, 'POST', `/api/wfl_flow_transitions:update?filterByTk=${row.id}`, {
      condition_expr: String(row.condition_expr).replace('150000', '200000'),
    })
  }
  const backRows = await rowsOf('wfl_flow_configs', { doc_type: 'pur_orders' })
  for (const row of backRows) {
    const extras = JSON.parse(row.extras)
    delete extras.amount_threshold
    await dataOf(token, 'POST', `/api/wfl_flow_configs:update?filterByTk=${row.id}`, { extras: JSON.stringify(extras) })
  }
  const freshPur = await flowOf('pur_orders')
  const freshExtras = JSON.parse(freshPur.extras)
  delete freshExtras.amount_threshold
  await dataOf(token, 'POST', `/api/wfl_flow_configs:update?filterByTk=${freshPur.id}`, {
    extras: JSON.stringify({ ...freshExtras, amount_threshold: 200000 }),
  })
  Object.assign(purExtras, freshExtras, { amount_threshold: 200000 })
  pur.extras = JSON.stringify(purExtras)
  pur.config_note = freshPur.config_note
  console.log('（检测到上轮半程 150000 态，已收敛回 200000 基线重放）')
}
expect('pur_orders 起点阈值', purExtras.amount_threshold, 200000)
const purNote = `${pur.config_note}\n${stamp} w3b4 config-center: extras.amount_threshold 200000→150000 + 转移条件同步（UI 表单同款 REST 写路径）(operator=admin)`
await dataOf(token, 'POST', `/api/wfl_flow_configs:update?filterByTk=${pur.id}`, {
  extras: JSON.stringify({ ...purExtras, amount_threshold: 150000 }),
  config_note: purNote,
})
const purConditions = await conditionRowOf(pur.id)
expect('pur_orders 待同步条件行数', purConditions.length, 1)
for (const row of purConditions) {
  await dataOf(token, 'POST', `/api/wfl_flow_transitions:update?filterByTk=${row.id}`, {
    condition_expr: String(row.condition_expr).replace('200000', '150000'),
  })
}
const purAfter = await flowOf('pur_orders')
expect('pur_orders extras 已改 150000', JSON.parse(purAfter.extras).amount_threshold, 150000)
expect('pur_orders 审计行含 200000→150000', purAfter.config_note.includes('200000→150000'), true)

// ── 2) the consistency probe must stay green after the two-place edit ──
const probeRun = await import('../../examples/kb-agent/scripts/nocobase-w3-approval-visual.mts')
const consistencyNow = await probeRun.assertWflConsistency(token)
expect('两处同写后探针绿', consistencyNow.length, 0)

// ── 3) hot effect: a fresh ¥180,000 PO routes to level 2 under the 150k gate ──
const existingPo = (await rowsOf('pur_orders', {}))[0]
const po = await tokenIO.create('pur_orders', {
  code: `PO-B4T-${Date.now().toString().slice(-6)}`, supplier_id: existingPo?.supplier_id ?? null, amount: 180_000,
  currency: 'CNY', doc_status: 'draft', note: 'W3-B4 编辑旅程：15万阈值下 18 万单据应走二级',
})
const submit1 = await submitForApproval(tokenIO, 'pur_orders', Number(po.id), 'quality_lead')
expect('18万 PO 提交后状态', submit1.to_state, 'pending')
const approve1 = await act(tokenIO, 'pur_orders', Number(po.id), 'approve', 'admin', 'W3-B4：18 万 > 15 万阈值，一审后报总经理加签')
expect('18万 PO 一审路由（150k 阈值下走二级）', approve1.to_state, 'pending_level2')
const poRow = await tokenIO.get('pur_orders', Number(po.id))
expect('PO 行 doc_status 已是二级审批中', poRow.doc_status, 'pending_level2')
const level2Todos = (await rowsOf('wfl_approval_todos', { doc_type: 'pur_orders', doc_id: Number(po.id), state: 'pending_level2', status: 'open' }))
expect('二级待办已开给 gm(admin)', level2Todos.map(row => row.user).sort(), ['admin'])

// ── 4) so_orders: configure 500000 (the batch-doc positive), a fresh ¥550,000 SO still routes level 2 ──
const so = await flowOf('so_orders')
const soExtras = JSON.parse(so.extras)
expect('so_orders 起点无阈值键（默认10万）', soExtras.amount_threshold, undefined)
await dataOf(token, 'POST', `/api/wfl_flow_configs:update?filterByTk=${so.id}`, {
  extras: JSON.stringify({ ...soExtras, amount_threshold: 500000 }),
  config_note: `${so.config_note}\n${stamp} w3b4 config-center: extras.amount_threshold null→500000（55 万单据 gm 档对拍）(operator=admin)`,
})
const soConditions = await conditionRowOf(so.id)
for (const row of soConditions) {
  await dataOf(token, 'POST', `/api/wfl_flow_transitions:update?filterByTk=${row.id}`, {
    condition_expr: String(row.condition_expr).replace('100000', '500000'),
  })
}
const consistencySo = await probeRun.assertWflConsistency(token)
expect('so_orders 配置后探针绿', consistencySo.length, 0)
const existingSo = (await rowsOf('so_orders', {}))[0]
const soDoc = await tokenIO.create('so_orders', {
  code: `SO-B4T-${Date.now().toString().slice(-6)}`, customer_id: existingSo?.customer_id ?? null, amount: 550_000,
  currency: 'CNY', doc_status: 'draft', note: 'W3-B4：50万阈值下 55 万单据走 gm 档',
})
await submitForApproval(tokenIO, 'so_orders', Number(soDoc.id), 'quality_lead')
const soApprove = await act(tokenIO, 'so_orders', Number(soDoc.id), 'approve', 'admin', 'W3-B4：55 万 > 50 万阈值，报总经理加签')
expect('55万 SO 一审路由（500k 阈值下走二级）', soApprove.to_state, 'pending_level2')
const soRow = await tokenIO.get('so_orders', Number(soDoc.id))
expect('SO 行 doc_status 已是二级审批中', soRow.doc_status, 'pending_level2')

// ── 5) restore the baseline (缺省零漂移): pur_orders back to 200000, so_orders key dropped ──
await dataOf(token, 'POST', `/api/wfl_flow_configs:update?filterByTk=${pur.id}`, {
  extras: JSON.stringify({ ...purExtras }),
  config_note: `${purAfter.config_note}\n${stamp} w3b4 config-center: extras.amount_threshold 150000→200000 复原（旅程结束回基线）(operator=admin)`,
})
for (const row of purConditions) {
  await dataOf(token, 'POST', `/api/wfl_flow_transitions:update?filterByTk=${row.id}`, {
    condition_expr: String(row.condition_expr).replace('150000', '200000'),
  })
}
const soAfter = await flowOf('so_orders')
await dataOf(token, 'POST', `/api/wfl_flow_configs:update?filterByTk=${so.id}`, {
  extras: JSON.stringify({ ...soExtras }),
  config_note: `${soAfter.config_note}\n${stamp} w3b4 config-center: extras.amount_threshold 500000→复原移除键（回默认10万基线）(operator=admin)`,
})
for (const row of soConditions) {
  await dataOf(token, 'POST', `/api/wfl_flow_transitions:update?filterByTk=${row.id}`, {
    condition_expr: String(row.condition_expr).replace('500000', '100000'),
  })
}
const baseline = await probeRun.assertWflConsistency(token)
expect('复原后探针绿', baseline.length, 0)
const purFinal = await flowOf('pur_orders')
const soFinal = await flowOf('so_orders')
expect('pur_orders 阈值回到 200000', JSON.parse(purFinal.extras).amount_threshold, 200000)
expect('pur_orders 容差未漂移', JSON.parse(purFinal.extras).invoice_match_tolerance, 0.1)
expect('so_orders 阈值键已移除（默认10万）', JSON.parse(soFinal.extras).amount_threshold, undefined)
// w2b5's two seed audit lines were concatenated without a newline (a pre-batch
// seed fact), so the line count floor counts them as one physical line.
expect('审计链行数（pur_orders ≥4：w2b5连写×1 + 配置中心追加×3+）', purFinal.config_note.split('\n').length >= 4, true)
expect('审计链含本次复原行', purFinal.config_note.includes('150000→200000 复原'), true)
expect('审计链含 so_orders 键移除行', (await flowOf('so_orders')).config_note.includes('500000→复原移除键'), true)

// ── 6) the psql twin of the final state ──
const configs = await probe()
console.log('\n=== 旅程终点各流快照（psql 对拍源）===')
for (const row of configs) {
  const extras = JSON.parse(row.extras ?? '{}')
  console.log(`#${row.id} ${row.doc_type} threshold=${String(extras.amount_threshold ?? '(默认100000)')} tolerance=${String(extras.invoice_match_tolerance ?? '-')} noteLines=${String(row.config_note ?? '').split('\n').length}`)
}

if (failures.length > 0) {
  console.error(`\nW3-B4 旅程 FAILED: ${failures.join('；')}`)
  process.exitCode = 1
} else {
  console.log('\nW3-B4 编辑旅程全绿：阈值下调走二级 / 阈值配置走二级 / 探针全程绿 / 复原零漂移 / 审计链完整')
}
