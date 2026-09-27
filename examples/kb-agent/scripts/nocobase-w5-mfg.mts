/**
 * W5/B5: the manufacturing planning domain's NocoBase side
 * (plans/2026-09-25-mfg-closure/06-b5-mfg-planning.md). One script, every step
 * idempotent:
 *
 * 1. Seven mfg_* collections: boms (+lines, +inline operations — the Odoo
 *    scheme, 主报告 §3.1), work centers (capacity/efficiency/shift span/
 *    holiday calendar), holidays, orders (the six-state doc_status axis grown
 *    with the post-approval released/closed terminals, plus the orthogonal
 *    reservation_state column B6 writes), order operations (the applied FCS
 *    plan rows).
 * 2. Eight component materials on hub_inv_products (BOM lines reference them).
 * 3. Seeds BEFORE any workflow mounts (坑④): 2 work centers, the 2026 holiday
 *    calendar (国庆中秋 + 元旦), 3 BOMs (米果 v1 retired → v2 active — version
 *    switching keeps the old row; 水饺 active; each active BOM carries 3
 *    operations / 4 components), 2 draft MOs (one ≤ threshold single-round,
 *    one > threshold two-round).
 * 4. The mfg_orders flow via approval-engine's seedDocFlow (amount routing on
 *    estimated_cost = qty × std_cost) and the BOM gate: an MO may only
 *    reference an active BOM (bom_status ∈ {active}).
 * 5. Five 生产制造 v2 flowPages (E1 table spine): BOM 管理（头+行编辑）/
 *    BOM 工序 / 工作中心（+节假日）/ 生产订单 / 排产看板（planned_date × wc）.
 * 6. The demo chain (--demo-chain): gate negative (retired BOM) → MO approval
 *    (single + two-round) → release (approved ≠ released, preview push) →
 *    preview → apply → draft-apply refusal → cross-MO conflict queue →
 *    freeze/void/re-apply → latest-start negative slack.
 *
 * Scheduling itself never happens here — mfg-schedule.mts owns it.
 *
 * Rollback: --rollback destroys the w5mfg* flowModels tree (+ orphaned n18ai-
 * sweep), the five pages + menu group, the flow/gate, the seeds (incl. the
 * eight component materials), and the seven collections.
 *
 * Usage (repo root, tsx loader):
 *   node --import tsx/esm examples/kb-agent/scripts/nocobase-w5-mfg.mts
 *   node --import tsx/esm examples/kb-agent/scripts/nocobase-w5-mfg.mts --demo-chain
 *   node --import tsx/esm examples/kb-agent/scripts/nocobase-w5-mfg.mts --rollback
 */
import { spawnSync } from 'node:child_process'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { call, dataOf, listFlowModels, listRoutes, signInWithRetry, withN17Prefix } from './nocobase-flow-page-lib.mts'
import { act, enforceGates, seedDocFlow, submitForApproval, type NocoIO } from './approval-engine.mts'

type RouteRow = import('./nocobase-flow-page-lib.mts').RouteRow
type FlowModelRow = import('./nocobase-flow-page-lib.mts').FlowModelRow

const here = dirname(fileURLToPath(import.meta.url))

// ─── field factories (the h5 wire shapes; every field inline interface+uiSchema, N14) ───

const input = (name: string, title: string): object => ({ name, type: 'string', interface: 'input', uiSchema: { type: 'string', 'x-component': 'Input', title } })
const textarea = (name: string, title: string): object => ({ name, type: 'text', interface: 'textarea', uiSchema: { type: 'string', 'x-component': 'Input.TextArea', title } })
const select = (name: string, title: string, enumOptions: object[]): object => ({ name, type: 'string', interface: 'select', uiSchema: { type: 'string', 'x-component': 'Select', title, enum: enumOptions } })
const number = (name: string, title: string): object => ({ name, type: 'float', interface: 'number', uiSchema: { type: 'number', 'x-component': 'InputNumber', title } })
const integer = (name: string, title: string): object => ({ name, type: 'integer', interface: 'number', uiSchema: { type: 'number', 'x-component': 'InputNumber', title } })
const date = (name: string, title: string): object => ({ name, type: 'dateOnly', interface: 'date', uiSchema: { type: 'string', 'x-component': 'DatePicker', title, 'x-component-props': { dateFormat: 'YYYY-MM-DD' } } })
const boolean = (name: string, title: string): object => ({ name, type: 'boolean', interface: 'boolean', uiSchema: { type: 'boolean', 'x-component': 'Checkbox', title } })
const belongsTo = (name: string, title: string, target: string, foreignKey: string, labelField = 'name'): object => ({
  name, type: 'belongsTo', interface: 'm2o', target, foreignKey,
  uiSchema: { type: 'object', 'x-component': 'AssociationField', title, 'x-component-props': { multiple: false, fieldNames: { label: labelField, value: 'id' } } },
})

const opts = (pairs: ReadonlyArray<[string, string, string]>): object[] => pairs.map(([value, label, color]) => ({ value, label, color }))

// ─── option sets ───

const STATE_OPTS = opts([
  ['draft', '草稿', 'default'], ['pending', '待审批', 'orange'], ['pending_level2', '二级审批中', 'purple'],
  ['approved', '已生效', 'green'], ['rejected', '已驳回', 'red'], ['void', '已作废', 'default'],
])
/**
 * MO's doc_status grows the two post-approval business terminals: released
 * (下达 — approved ≠ released, the deliberate two-step) and closed (完工 —
 * B6 writes it). The approval engine still rides the six-state vocabulary;
 * release/close advance through the scheduling engine CLI, never nb_update.
 */
const MO_STATUS = [...STATE_OPTS, ...opts([['released', '已下达', 'blue'], ['closed', '已关闭', 'default']])]
/** The orthogonal kit-readiness axis (Odoo reservation_state; B6 writes it, B5 only seeds none). W2-B6 adds partial_allowed — the non-blocking partial whose covered components keep hard reservations. */
const RESERVATION_AXIS = opts([
  ['none', '未齐套', 'default'], ['partial', '部分齐套(阻断)', 'orange'], ['partial_allowed', '部分投料已预留', 'purple'], ['assigned', '已齐套', 'green'],
])
/**
 * W2-B6: the MO-level kit policy — full_lock (default, the W-round behavior:
 * a partial kit blocks issuing) or partial_allowed (covered components
 * reserve and issue; the shortfall ladder hangs with its ETA).
 */
const KIT_POLICY = opts([['full_lock', '齐套全锁', 'default'], ['partial_allowed', '允许部分投料', 'blue']])
/** W2-B6: the over-issue ratio field — [0,1], 0 keeps the W-round 超领全拒. */
const overissueRatioField = (): object => ({
  name: 'overissue_ratio', type: 'float', interface: 'number',
  uiSchema: { type: 'number', 'x-component': 'InputNumber', title: '超领比例(如0.05)', default: 0, 'x-component-props': { min: 0, max: 1, step: 0.01 } },
})
/** W2-B6: the kit-policy select with the W-round default baked in. */
const kitPolicyField = (): object => ({
  name: 'kit_policy', type: 'string', interface: 'select',
  uiSchema: { type: 'string', 'x-component': 'Select', title: '齐套策略', enum: KIT_POLICY, default: 'full_lock' },
})
const BOM_STATUS = opts([['draft', '草稿', 'default'], ['active', '生效', 'green'], ['retired', '已退役', 'default']])
const WC_STATUS = opts([['active', '运行中', 'green'], ['inactive', '已停用', 'default']])
const OP_STATUS = opts([['planned', '已排产', 'blue'], ['started', '已开工', 'orange'], ['done', '已完工', 'green']])

// ─── the seven collections ───

const COLLECTIONS: ReadonlyArray<{ name: string, title: string, titleField?: string, fields: object[] }> = [
  {
    name: 'mfg_boms', title: 'BOM 配方', titleField: 'code', fields: [
      input('code', 'BOM 编号'), belongsTo('product', '成品物料', 'hub_inv_products', 'product_id'),
      integer('version', '版本'), boolean('is_default', '默认版本'), select('bom_status', '状态', BOM_STATUS),
      textarea('remark', '备注'),
    ],
  },
  {
    name: 'mfg_bom_lines', title: 'BOM 组件行', fields: [
      belongsTo('bom', 'BOM', 'mfg_boms', 'bom_id', 'code'),
      belongsTo('product', '组件物料', 'hub_inv_products', 'product_id'),
      number('qty_per_unit', '单位用量'), number('scrap_pct', '损耗率(%)'), input('uom', '单位'),
    ],
  },
  {
    name: 'mfg_bom_operations', title: 'BOM 工序', fields: [
      belongsTo('bom', 'BOM', 'mfg_boms', 'bom_id', 'code'),
      integer('seq', '顺序'), input('name', '工序名'),
      belongsTo('workcenter', '工作中心', 'mfg_work_centers', 'workcenter_id', 'code'),
      integer('setup_min', '准备(分)'), integer('run_min', '单批加工(分)'), integer('batch_size', '批量'),
      belongsTo('alt_workcenter', '替代工作中心', 'mfg_work_centers', 'alt_workcenter_id', 'code'),
    ],
  },
  {
    name: 'mfg_work_centers', title: '工作中心', titleField: 'code', fields: [
      input('code', '编码'), input('name', '名称'), integer('capacity_parallel', '并行产能'),
      integer('efficiency_pct', '效率(%)'), number('cost_per_hour', '费率(元/时)'),
      input('working_hours', '班次(如 08:00-17:00)'), input('holiday_calendar_id', '节假日日历'), select('status', '状态', WC_STATUS),
    ],
  },
  {
    name: 'mfg_holidays', title: '节假日', fields: [
      date('date', '日期'), input('name', '名称'), input('calendar', '日历'),
    ],
  },
  {
    name: 'mfg_orders', title: '生产订单', titleField: 'code', fields: [
      input('code', '订单号'), belongsTo('product', '成品物料', 'hub_inv_products', 'product_id'),
      integer('qty', '数量'), belongsTo('bom', 'BOM', 'mfg_boms', 'bom_id', 'code'),
      date('need_date', '需求日期'), number('std_cost', '标准单位成本'), number('estimated_cost', '预估总额'),
      select('doc_status', '审批状态', MO_STATUS), select('reservation_state', '齐套状态', RESERVATION_AXIS),
      kitPolicyField(), overissueRatioField(),
      date('released_at', '下达日'), date('planned_start', '建议开工'), date('planned_end', '建议完工'),
      textarea('preview_data', '排产预览'), input('approved_by', '审批人'), date('approved_at', '生效日'),
    ],
  },
  {
    name: 'mfg_order_operations', title: 'MO 工序排程', fields: [
      belongsTo('order', '生产订单', 'mfg_orders', 'order_id', 'code'),
      integer('seq', '顺序'), input('name', '工序名'),
      belongsTo('workcenter', '工作中心', 'mfg_work_centers', 'workcenter_id', 'code'),
      date('planned_date', '计划日期'), integer('planned_min', '计划工时(分)'),
      select('status', '状态', OP_STATUS), input('note', '说明'),
    ],
  },
]

/**
 * The one gate: an MO may only reference an active BOM (bom_status ∈ {active})
 * — the retired v1 row the demo chain feeds refuses with the set-gate text.
 */
const GATES: ReadonlyArray<Record<string, unknown>> = [
  { downstream_collection: 'mfg_orders', upstream_collection: 'mfg_boms', upstream_field: 'bom_id', upstream_ref_field: null, upstream_label: 'BOM', upstream_state_field: 'bom_status', required_status: 'active' },
]

const MENU_GROUP = { title: '生产制造', icon: 'ExperimentOutlined' }

// ─── REST helpers ───

async function rowsOf(token: string, collection: string, pageSize = 500): Promise<Array<Record<string, any>>> {
  const rows = await dataOf(token, 'GET', `/api/${collection}:list?pageSize=${pageSize}`) as Array<Record<string, any>> | null
  return rows ?? []
}

const tokenIO = (token: string): NocoIO => ({
  list: async (collection, filter) => {
    const query = filter === undefined ? '' : `&filter=${encodeURIComponent(JSON.stringify(filter))}`
    return await dataOf(token, 'GET', `/api/${collection}:list?pageSize=500${query}`) ?? []
  },
  get: async (collection, id) => await dataOf(token, 'GET', `/api/${collection}:get?filterByTk=${id}`) ?? undefined,
  create: async (collection, values) => await dataOf(token, 'POST', `/api/${collection}:create`, values),
  update: async (collection, id, values) => {
    await dataOf(token, 'POST', `/api/${collection}:update?filterByTk=${id}`, values)
  },
  updateWhere: async (collection, filter, values) => {
    const rows = await dataOf(token, 'POST', `/api/${collection}:update?filter=${encodeURIComponent(JSON.stringify(filter))}&pageSize=10`, values)
    return Array.isArray(rows) ? rows.length : rows === null || rows === undefined ? 0 : 1
  },
  destroy: async (collection, id) => {
    await call(token, 'POST', `/api/${collection}:destroy?filterByTk=${id}`)
  },
})

/**
 * Run one sibling script (the scheduling engine CLI) as a child. With
 * expectFailureHint the run must exit non-zero with that text in the output
 * (a gate negative); otherwise any non-zero exit fails loud.
 */
function runScript(script: string, args: readonly string[], expectFailureHint?: string): string {
  const result = spawnSync('node', ['--import', 'tsx/esm', join(here, script), ...args], { encoding: 'utf8' })
  const text = `${result.stdout ?? ''}${result.stderr ?? ''}`
  if (expectFailureHint !== undefined) {
    if (result.status === 0 || !text.includes(expectFailureHint)) {
      throw new Error(`卡口负例未拦截：${script} ${args.join(' ')} 应被拒（期望「${expectFailureHint}」，exit ${String(result.status)}）`)
    }
    return text
  }
  if (result.status !== 0) {
    throw new Error(`${script} ${args.join(' ')} failed (exit ${String(result.status)})\n${text.slice(0, 400)}`)
  }
  return text
}

// ─── structural steps ───

async function ensureCollections(token: string): Promise<void> {
  for (const collection of COLLECTIONS) {
    const existing = await dataOf(token, 'GET', `/api/collections/${collection.name}`)
    if (existing !== null) {
      console.log(`nocobase-w5: collection ${collection.name} exists (kept)`)
      continue
    }
    await dataOf(token, 'POST', '/api/collections:create', { name: collection.name, title: collection.title, ...(collection.titleField === undefined ? {} : { titleField: collection.titleField }), fields: collection.fields })
    console.log(`nocobase-w5: collection ${collection.name} created`)
  }
}

async function ensureFlows(token: string): Promise<void> {
  const io = tokenIO(token)
  // Amount routing on estimated_cost = qty × std_cost (06-b5: 超 10 万加签).
  await seedDocFlow(io, 'mfg_orders', '生产订单审批', { amountField: 'estimated_cost' })
}

async function ensureGates(token: string): Promise<void> {
  const gates = await rowsOf(token, 'wfl_gate_configs')
  for (const gate of GATES) {
    const existing = gates.find(row =>
      row.downstream_collection === gate.downstream_collection
      && row.upstream_collection === gate.upstream_collection
      && row.upstream_field === gate.upstream_field)
    if (existing === undefined) {
      await dataOf(token, 'POST', '/api/wfl_gate_configs:create', { ...gate })
      console.log('nocobase-w5: gate mfg_orders→mfg_boms (bom_status=active) created')
      continue
    }
    if ((existing.upstream_state_field ?? null) !== (gate.upstream_state_field ?? null) || existing.required_status !== gate.required_status) {
      await dataOf(token, 'POST', `/api/wfl_gate_configs:update?filterByTk=${existing.id}`, {
        upstream_state_field: gate.upstream_state_field, required_status: gate.required_status,
      })
      console.log('nocobase-w5: gate mfg_orders→mfg_boms repaired')
    }
  }
}

// ─── seeds (before the workflow mounts — 坑④) ───

/** The eight component materials the two BOMs consume (idempotent by sku). */
const COMPONENT_MATERIALS: ReadonlyArray<Record<string, unknown>> = [
  { name: '水磨糯米粉 25kg', sku: 'RM-SNA-MIFU', category: '原料', unit_price: 180, status: 'active' },
  { name: '即食海苔粉 5kg', sku: 'RM-SNA-HAI', category: '原料', unit_price: 320, status: 'active' },
  { name: '马苏里拉芝士粉 10kg', sku: 'RM-SNA-CHE', category: '原料', unit_price: 560, status: 'active' },
  { name: '米果复合包装袋', sku: 'RM-SNA-PKG', category: '包材', unit_price: 0.35, status: 'active' },
  { name: '速冻水饺皮 10kg', sku: 'RM-DMP-SKN', category: '原料', unit_price: 95, status: 'active' },
  { name: '冷鲜猪后腿肉馅 20kg', sku: 'RM-DMP-PRK', category: '原料', unit_price: 520, status: 'active' },
  { name: '速冻荠菜 10kg', sku: 'RM-DMP-VEG', category: '原料', unit_price: 160, status: 'active' },
  { name: '速冻水饺包装盒', sku: 'RM-DMP-PKG', category: '包材', unit_price: 0.8, status: 'active' },
]

const WORK_CENTERS: ReadonlyArray<Record<string, unknown>> = [
  { code: 'WC-ASSY', name: '混合成型线', capacity_parallel: 1, efficiency_pct: 90, cost_per_hour: 260, working_hours: '08:00-17:00', holiday_calendar_id: 'CN-2026', status: 'active' },
  { code: 'WC-PACK', name: '包装线', capacity_parallel: 1, efficiency_pct: 100, cost_per_hour: 180, working_hours: '08:00-17:00', holiday_calendar_id: 'CN-2026', status: 'active' },
]

/** The 2026 holiday calendar both work centers share (国庆中秋 8 天 + 2027 元旦). */
const HOLIDAYS: ReadonlyArray<Record<string, unknown>> = [
  ...['2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04', '2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08']
    .map(iso => ({ date: iso, name: '国庆·中秋', calendar: 'CN-2026' })),
  { date: '2027-01-01', name: '元旦', calendar: 'CN-2026' },
]

/**
 * The three BOMs: 米果 keeps its retired v1 row (version switching never
 * deletes), its active v2 carries 3 operations / 4 components, and the 水饺
 * BOM mirrors the shape. Durations land the demo MOs one per working day on
 * the 540-minute shifts so the cross-MO conflict queue stays visible.
 */
const BOMS: ReadonlyArray<{ code: string, sku: string, version: number, is_default: boolean, bom_status: string, remark: string,
  lines: ReadonlyArray<{ sku: string, qty_per_unit: number, scrap_pct: number, uom: string }>,
  operations: ReadonlyArray<{ seq: number, name: string, wc: string, setup_min: number, run_min: number, batch_size: number, alt: string | null }> }> = [
  {
    code: 'BOM-0001', sku: 'FD-SNA-080', version: 1, is_default: false, bom_status: 'retired',
    remark: '米果 v1（2026 春季配方；已退役，保留审计）', lines: [], operations: [],
  },
  {
    code: 'BOM-0002', sku: 'FD-SNA-080', version: 2, is_default: true, bom_status: 'active',
    remark: '米果 v2（芝士加量 8%；当前默认）',
    lines: [
      { sku: 'RM-SNA-MIFU', qty_per_unit: 0.062, scrap_pct: 2, uom: 'kg' },
      { sku: 'RM-SNA-HAI', qty_per_unit: 0.003, scrap_pct: 3, uom: 'kg' },
      { sku: 'RM-SNA-CHE', qty_per_unit: 0.008, scrap_pct: 2, uom: 'kg' },
      { sku: 'RM-SNA-PKG', qty_per_unit: 1, scrap_pct: 1, uom: '个' },
    ],
    operations: [
      { seq: 1, name: '混合搅拌', wc: 'WC-ASSY', setup_min: 60, run_min: 5, batch_size: 500, alt: null },
      { seq: 2, name: '烘焙膨化', wc: 'WC-ASSY', setup_min: 90, run_min: 8, batch_size: 1000, alt: null },
      { seq: 3, name: '调味包装', wc: 'WC-PACK', setup_min: 45, run_min: 3, batch_size: 250, alt: 'WC-ASSY' },
    ],
  },
  {
    code: 'BOM-0003', sku: 'FD-FRZ-450', version: 1, is_default: true, bom_status: 'active',
    remark: '速冻水饺 v1（荠菜猪肉馅）',
    lines: [
      { sku: 'RM-DMP-SKN', qty_per_unit: 0.18, scrap_pct: 2, uom: 'kg' },
      { sku: 'RM-DMP-PRK', qty_per_unit: 0.21, scrap_pct: 3, uom: 'kg' },
      { sku: 'RM-DMP-VEG', qty_per_unit: 0.09, scrap_pct: 4, uom: 'kg' },
      { sku: 'RM-DMP-PKG', qty_per_unit: 1, scrap_pct: 1, uom: '个' },
    ],
    operations: [
      { seq: 1, name: '和馅', wc: 'WC-ASSY', setup_min: 80, run_min: 6, batch_size: 800, alt: null },
      { seq: 2, name: '成型速冻', wc: 'WC-ASSY', setup_min: 120, run_min: 10, batch_size: 1000, alt: null },
      { seq: 3, name: '内包装', wc: 'WC-PACK', setup_min: 45, run_min: 3, batch_size: 200, alt: 'WC-ASSY' },
    ],
  },
]

/**
 * The two seed MOs: MO-1 rides the single-round route (¥78,000 ≤ threshold),
 * MO-2 the two-round one (¥224,000 > threshold); both start draft so the demo
 * chain walks the whole approval axis.
 */
const SEED_MO: ReadonlyArray<{ code: string, sku: string, qty: number, needInDays: number, stdCost: number, bom: string }> = [
  { code: 'MO-2026-0001', sku: 'FD-SNA-080', qty: 12_000, needInDays: 24, stdCost: 6.5, bom: 'BOM-0002' },
  { code: 'MO-2026-0002', sku: 'FD-FRZ-450', qty: 16_000, needInDays: 29, stdCost: 14, bom: 'BOM-0003' },
]

async function seedRows(token: string): Promise<void> {
  const products = await rowsOf(token, 'hub_inv_products', 200)
  for (const material of COMPONENT_MATERIALS) {
    if (!products.some(row => row.sku === material.sku)) {
      await dataOf(token, 'POST', '/api/hub_inv_products:create', { ...material })
    }
  }
  const refreshed = await rowsOf(token, 'hub_inv_products', 200)
  const refreshedBy = (sku: string): Record<string, any> | undefined => refreshed.find(row => row.sku === sku)

  for (const center of WORK_CENTERS) {
    const existing = (await rowsOf(token, 'mfg_work_centers')).find(row => row.code === center.code)
    if (existing === undefined) await dataOf(token, 'POST', '/api/mfg_work_centers:create', { ...center })
  }
  const centers = await rowsOf(token, 'mfg_work_centers')
  const centerBy = (code: string): Record<string, any> | undefined => centers.find(row => row.code === code)

  for (const holiday of HOLIDAYS) {
    const existing = (await rowsOf(token, 'mfg_holidays')).find(row => String(row.date ?? '').slice(0, 10) === String(holiday.date))
    if (existing === undefined) await dataOf(token, 'POST', '/api/mfg_holidays:create', { ...holiday })
  }

  for (const bom of BOMS) {
    const product = refreshedBy(bom.sku)
    if (product === undefined) throw new Error(`hub_inv_products 缺 ${bom.sku}（先跑 the all chain 补 hub 种子）`)
    if (!(await rowsOf(token, 'mfg_boms')).some(row => row.code === bom.code)) {
      await dataOf(token, 'POST', '/api/mfg_boms:create', {
        code: bom.code, product: { id: Number(product.id) }, version: bom.version,
        is_default: bom.is_default, bom_status: bom.bom_status, remark: bom.remark,
      })
    }
    const bomRow = (await rowsOf(token, 'mfg_boms')).find(row => row.code === bom.code)
    if (bomRow === undefined) throw new Error(`BOM 种子失败：${bom.code}`)
    const bomId = Number(bomRow.id)
    const bomLines = await rowsOf(token, 'mfg_bom_lines')
    for (const line of bom.lines) {
      const component = refreshedBy(line.sku)
      if (component === undefined) throw new Error(`组件物料缺 ${line.sku}`)
      if (!bomLines.some(row => Number(row.bom_id) === bomId && Number(row.product_id) === Number(component.id))) {
        await dataOf(token, 'POST', '/api/mfg_bom_lines:create', {
          bom: { id: bomId }, product: { id: Number(component.id) },
          qty_per_unit: line.qty_per_unit, scrap_pct: line.scrap_pct, uom: line.uom,
        })
      }
    }
    const bomOps = await rowsOf(token, 'mfg_bom_operations')
    for (const operation of bom.operations) {
      const wc = centerBy(operation.wc)
      if (wc === undefined) throw new Error(`工作中心缺 ${operation.wc}`)
      const alt = operation.alt === null ? null : centerBy(operation.alt)
      if (operation.alt !== null && alt === undefined) throw new Error(`替代工作中心缺 ${String(operation.alt)}`)
      if (!bomOps.some(row => Number(row.bom_id) === bomId && Number(row.seq) === operation.seq)) {
        await dataOf(token, 'POST', '/api/mfg_bom_operations:create', {
          bom: { id: bomId }, seq: operation.seq, name: operation.name,
          workcenter: { id: Number(wc.id) }, setup_min: operation.setup_min,
          run_min: operation.run_min, batch_size: operation.batch_size,
          ...(alt === null ? {} : { alt_workcenter: { id: Number(alt.id) } }),
        })
      }
    }
  }
  const boms = await rowsOf(token, 'mfg_boms')
  for (const mo of SEED_MO) {
    const product = refreshedBy(mo.sku)
    const bom = boms.find(row => row.code === mo.bom)
    if (product === undefined || bom === undefined) throw new Error(`MO 种子素材缺：${mo.sku}/${mo.bom}`)
    if (!(await rowsOf(token, 'mfg_orders')).some(row => row.code === mo.code)) {
      await dataOf(token, 'POST', '/api/mfg_orders:create', {
        code: mo.code, product: { id: Number(product.id) }, qty: mo.qty, bom: { id: Number(bom.id) },
        need_date: new Date(Date.now() + mo.needInDays * 86_400_000).toISOString().slice(0, 10),
        std_cost: mo.stdCost, estimated_cost: mo.qty * mo.stdCost,
        doc_status: 'draft', reservation_state: 'none',
      })
    }
  }
  console.log(`nocobase-w5: seeds in place (${String(COMPONENT_MATERIALS.length)} components / ${String(WORK_CENTERS.length)} work centers / ${String(HOLIDAYS.length)} holidays / ${String(BOMS.length)} BOMs / ${String(SEED_MO.length)} draft MOs)`)
}

// ─── the five 生产制造 v2 pages (E1 table spine) ───

type FieldKind = 'input' | 'select' | 'number' | 'm2o' | 'date' | 'boolean'
type FieldSpec = { name: string, title: string, kind: FieldKind, options?: object[], required?: boolean }
type BlockSpec = {
  heading: string
  collection: string
  columns: ReadonlyArray<FieldSpec>
  formFields?: ReadonlyArray<FieldSpec>
  defaultFilter?: Record<string, unknown>
}
type PageSpec = { title: string, icon: string, blocks: ReadonlyArray<BlockSpec> }

const PAGES: ReadonlyArray<PageSpec> = [
  {
    title: 'BOM 管理', icon: 'ProfileOutlined', blocks: [
      {
        heading: 'BOM（版本与生效）', collection: 'mfg_boms',
        columns: [
          { name: 'code', title: 'BOM 编号', kind: 'input' },
          { name: 'product', title: '成品物料', kind: 'm2o' },
          { name: 'version', title: '版本', kind: 'number' },
          { name: 'is_default', title: '默认版本', kind: 'boolean' },
          { name: 'bom_status', title: '状态', kind: 'select', options: BOM_STATUS },
          { name: 'remark', title: '备注', kind: 'input' },
        ],
        formFields: [
          { name: 'code', title: 'BOM 编号', kind: 'input', required: true },
          { name: 'product', title: '成品物料', kind: 'm2o', required: true },
          { name: 'version', title: '版本', kind: 'number' },
          { name: 'is_default', title: '默认版本', kind: 'boolean' },
          { name: 'bom_status', title: '状态', kind: 'select', options: BOM_STATUS },
          { name: 'remark', title: '备注', kind: 'input' },
        ],
      },
      {
        heading: '组件行（用量与损耗率）', collection: 'mfg_bom_lines',
        columns: [
          { name: 'bom', title: 'BOM', kind: 'm2o' },
          { name: 'product', title: '组件物料', kind: 'm2o' },
          { name: 'qty_per_unit', title: '单位用量', kind: 'number' },
          { name: 'scrap_pct', title: '损耗率(%)', kind: 'number' },
          { name: 'uom', title: '单位', kind: 'input' },
        ],
        formFields: [
          { name: 'bom', title: 'BOM', kind: 'm2o', required: true },
          { name: 'product', title: '组件物料', kind: 'm2o', required: true },
          { name: 'qty_per_unit', title: '单位用量', kind: 'number' },
          { name: 'scrap_pct', title: '损耗率(%)', kind: 'number' },
          { name: 'uom', title: '单位', kind: 'input' },
        ],
      },
    ],
  },
  {
    title: 'BOM 工序', icon: 'NodeIndexOutlined', blocks: [
      {
        heading: '工艺路线（工序顺序与工时）', collection: 'mfg_bom_operations',
        columns: [
          { name: 'bom', title: 'BOM', kind: 'm2o' },
          { name: 'seq', title: '顺序', kind: 'number' },
          { name: 'name', title: '工序名', kind: 'input' },
          { name: 'workcenter', title: '工作中心', kind: 'm2o' },
          { name: 'setup_min', title: '准备(分)', kind: 'number' },
          { name: 'run_min', title: '单批加工(分)', kind: 'number' },
          { name: 'batch_size', title: '批量', kind: 'number' },
          { name: 'alt_workcenter', title: '替代工作中心', kind: 'm2o' },
        ],
        formFields: [
          { name: 'bom', title: 'BOM', kind: 'm2o', required: true },
          { name: 'seq', title: '顺序', kind: 'number', required: true },
          { name: 'name', title: '工序名', kind: 'input', required: true },
          { name: 'workcenter', title: '工作中心', kind: 'm2o', required: true },
          { name: 'setup_min', title: '准备(分)', kind: 'number' },
          { name: 'run_min', title: '单批加工(分)', kind: 'number' },
          { name: 'batch_size', title: '批量', kind: 'number' },
          { name: 'alt_workcenter', title: '替代工作中心', kind: 'm2o' },
        ],
      },
    ],
  },
  {
    title: '工作中心', icon: 'SettingOutlined', blocks: [
      {
        heading: '工作中心（产能/效率/班次）', collection: 'mfg_work_centers',
        columns: [
          { name: 'code', title: '编码', kind: 'input' },
          { name: 'name', title: '名称', kind: 'input' },
          { name: 'capacity_parallel', title: '并行产能', kind: 'number' },
          { name: 'efficiency_pct', title: '效率(%)', kind: 'number' },
          { name: 'cost_per_hour', title: '费率(元/时)', kind: 'number' },
          { name: 'working_hours', title: '班次', kind: 'input' },
          { name: 'holiday_calendar_id', title: '节假日日历', kind: 'input' },
          { name: 'status', title: '状态', kind: 'select', options: WC_STATUS },
        ],
        formFields: [
          { name: 'code', title: '编码', kind: 'input', required: true },
          { name: 'name', title: '名称', kind: 'input', required: true },
          { name: 'capacity_parallel', title: '并行产能', kind: 'number' },
          { name: 'efficiency_pct', title: '效率(%)', kind: 'number' },
          { name: 'cost_per_hour', title: '费率(元/时)', kind: 'number' },
          { name: 'working_hours', title: '班次', kind: 'input' },
          { name: 'holiday_calendar_id', title: '节假日日历', kind: 'input' },
          { name: 'status', title: '状态', kind: 'select', options: WC_STATUS },
        ],
      },
      {
        heading: '节假日（产能日历）', collection: 'mfg_holidays',
        columns: [
          { name: 'date', title: '日期', kind: 'date' },
          { name: 'name', title: '名称', kind: 'input' },
          { name: 'calendar', title: '日历', kind: 'input' },
        ],
        formFields: [
          { name: 'date', title: '日期', kind: 'date', required: true },
          { name: 'name', title: '名称', kind: 'input' },
          { name: 'calendar', title: '日历', kind: 'input' },
        ],
      },
    ],
  },
  {
    title: '生产订单', icon: 'ContainerOutlined', blocks: [
      {
        heading: 'MO（审批 + 下达 + 齐套三轴）', collection: 'mfg_orders',
        columns: [
          { name: 'code', title: '订单号', kind: 'input' },
          { name: 'product', title: '成品物料', kind: 'm2o' },
          { name: 'qty', title: '数量', kind: 'number' },
          { name: 'bom', title: 'BOM', kind: 'm2o' },
          { name: 'need_date', title: '需求日期', kind: 'date' },
          { name: 'estimated_cost', title: '预估总额', kind: 'number' },
          { name: 'doc_status', title: '审批状态', kind: 'select', options: MO_STATUS },
          { name: 'reservation_state', title: '齐套状态', kind: 'select', options: RESERVATION_AXIS },
          { name: 'kit_policy', title: '齐套策略', kind: 'select', options: KIT_POLICY },
          { name: 'overissue_ratio', title: '超领比例', kind: 'number' },
          { name: 'released_at', title: '下达日', kind: 'date' },
          { name: 'planned_start', title: '建议开工', kind: 'date' },
          { name: 'planned_end', title: '建议完工', kind: 'date' },
        ],
        formFields: [
          { name: 'code', title: '订单号', kind: 'input', required: true },
          { name: 'product', title: '成品物料', kind: 'm2o', required: true },
          { name: 'qty', title: '数量', kind: 'number', required: true },
          { name: 'bom', title: 'BOM', kind: 'm2o', required: true },
          { name: 'need_date', title: '需求日期', kind: 'date' },
          { name: 'std_cost', title: '标准单位成本', kind: 'number' },
          { name: 'estimated_cost', title: '预估总额', kind: 'number' },
          { name: 'doc_status', title: '审批状态', kind: 'select', options: MO_STATUS },
          { name: 'reservation_state', title: '齐套状态', kind: 'select', options: RESERVATION_AXIS },
          { name: 'kit_policy', title: '齐套策略', kind: 'select', options: KIT_POLICY },
          { name: 'overissue_ratio', title: '超领比例(如0.05=5%)', kind: 'number' },
        ],
      },
    ],
  },
  {
    title: '排产看板', icon: 'CalendarOutlined', blocks: [
      {
        heading: 'MO 工序排程（计划日期 × 工作中心）· 口径：工序不跨天——超日产能工序给拆单建议（见 note），需人工拆 MO 或外协', collection: 'mfg_order_operations',
        columns: [
          { name: 'order', title: '生产订单', kind: 'm2o' },
          { name: 'seq', title: '顺序', kind: 'number' },
          { name: 'name', title: '工序名', kind: 'input' },
          { name: 'workcenter', title: '工作中心', kind: 'm2o' },
          { name: 'planned_date', title: '计划日期', kind: 'date' },
          { name: 'planned_min', title: '计划工时(分)', kind: 'number' },
          { name: 'status', title: '状态', kind: 'select', options: OP_STATUS },
          { name: 'note', title: '说明', kind: 'input' },
        ],
      },
    ],
  },
]

const listModels = (token: string): Promise<FlowModelRow[]> => listFlowModels(token, 'W5')
const listAllRoutes = (token: string): Promise<RouteRow[]> => listRoutes(token, 'W5')

const displayModelFor = (kind: FieldKind): string => {
  switch (kind) {
    case 'select': return 'DisplayEnumFieldModel'
    case 'number': return 'DisplayNumberFieldModel'
    case 'm2o': return 'DisplayTextFieldModel'
    case 'date': return 'DisplayDateTimeFieldModel'
    case 'boolean': return 'DisplayCheckboxFieldModel'
    default: return 'DisplayTextFieldModel'
  }
}

const editModelFor = (kind: FieldKind): string => {
  switch (kind) {
    case 'select': return 'SelectFieldModel'
    case 'number': return 'NumberFieldModel'
    case 'm2o': return 'RecordSelectFieldModel'
    case 'date': return 'DateOnlyFieldModel'
    case 'boolean': return 'CheckboxFieldModel'
    default: return 'InputFieldModel'
  }
}

function formGrid(collection: string, fields: ReadonlyArray<FieldSpec>): Record<string, unknown> {
  const itemUids = fields.map(() => withN17Prefix('w5mfg', 'i'))
  const rows = itemUids.map((itemUid, index) => ({
    id: `r${index}`,
    cells: [{ id: `r${index}:cell:0`, items: [itemUid] }],
    sizes: [24],
  }))
  return {
    use: 'FormGridModel', subKey: 'grid', subType: 'object', sortIndex: 0,
    props: { layout: { version: 2, rows, rowGap: 0, colGap: 16, sizes: {}, rowOrder: rows.map(row => row.id) } },
    stepParams: { gridSettings: { grid: { layout: { version: 2, rows } } } },
    subModels: {
      items: fields.map((field, index) => ({
        uid: itemUids[index], use: 'FormItemModel', subKey: 'items', subType: 'array', sortIndex: index + 1,
        props: field.required === true ? { required: true } : {},
        stepParams: { fieldSettings: { init: { dataSourceKey: 'main', collectionName: collection, fieldPath: field.name } } },
        subModels: {
          field: {
            use: editModelFor(field.kind), subKey: 'field', subType: 'object', sortIndex: 0,
            props: field.options === undefined || field.options.length === 0 ? {} : { allowClear: true, options: field.options },
          },
        },
      })),
    },
  }
}

async function ensureMenuGroup(token: string): Promise<{ id: number }> {
  const existing = (await listAllRoutes(token)).find(row => row.title === MENU_GROUP.title && row.type === 'group')
  if (existing !== undefined) {
    console.log(`nocobase-w5: menu group "${MENU_GROUP.title}" exists (kept)`)
    return { id: existing.id }
  }
  const row = await dataOf(token, 'POST', '/api/desktopRoutes:create', { title: MENU_GROUP.title, icon: MENU_GROUP.icon, type: 'group' })
  console.log(`nocobase-w5: menu group "${MENU_GROUP.title}" created`)
  return { id: Number(row.id) }
}

/** Whether the page already carries a w5mfg table block for one collection. */
async function pageHasBlock(token: string, pageTitle: string, collection: string): Promise<boolean> {
  const models = await listModels(token)
  return models.some(row => row.use === 'TableBlockModel'
    && String(row.stepParams?.resourceSettings?.init?.collectionName ?? '') === collection)
}

async function ensureV2Page(token: string, spec: PageSpec, groupId: number, sort: number): Promise<void> {
  const flow = (await listAllRoutes(token)).find(row => row.title === spec.title && row.type === 'flowPage')
  if (flow !== undefined) {
    for (const block of spec.blocks) {
      if (!(await pageHasBlock(token, spec.title, block.collection))) {
        throw new Error(`v2 page "${spec.title}" is truncated (missing ${block.collection}); run --rollback to tear the batch down and rebuild`)
      }
    }
    console.log(`nocobase-w5: v2 page "${spec.title}" exists (kept)`)
    return
  }
  if ((await listAllRoutes(token)).some(row => row.title === spec.title && row.type === 'page')) {
    throw new Error(`a v1 page named "${spec.title}" already exists; rename it first`)
  }
  const routeUid = withN17Prefix('w5mfg', '')
  const page = await dataOf(token, 'POST', '/api/desktopRoutes:create', { title: spec.title, icon: spec.icon, type: 'flowPage', parentId: groupId, sort, schemaUid: routeUid })
  const tabUid = withN17Prefix('w5mfg', 't')
  await dataOf(token, 'POST', '/api/desktopRoutes:create', { title: '', type: 'tabs', parentId: page.id, schemaUid: tabUid, tabSchemaName: withN17Prefix('w5mfg', 'ts') })

  const save = (model: Record<string, unknown>) => dataOf(token, 'POST', '/api/flowModels:save', model)
  await save({ uid: routeUid, schema: { use: 'RouteModel' } })
  await save({ uid: tabUid, schema: { use: 'RouteModel' } })
  const pageUid = withN17Prefix('w5mfg', 'p')
  await save({ uid: pageUid, parentId: routeUid, subKey: 'page', subType: 'object', use: 'RootPageModel', props: { title: spec.title, displayTitle: true, enableTabs: false }, stepParams: { pageSettings: { general: { title: spec.title, displayTitle: true, enableTabs: false } } } })
  const gridUid = withN17Prefix('w5mfg', 'g')
  await save({ uid: gridUid, parentId: tabUid, subKey: 'grid', subType: 'object', use: 'BlockGridModel', props: {}, filterManager: [] })

  let blockIndex = 0
  for (const block of spec.blocks) {
    blockIndex += 1
    const tableUid = withN17Prefix('w5mfg', 'tb')
    await save({
      uid: tableUid, use: 'TableBlockModel', parentId: gridUid, subKey: 'items', subType: 'array', sortIndex: blockIndex,
      props: { title: block.heading },
      stepParams: {
        resourceSettings: {
          init: {
            dataSourceKey: 'main', collectionName: block.collection,
            ...(block.defaultFilter === undefined ? {} : { filter: block.defaultFilter }),
          },
        },
      },
    })
    let sortIndex = 1
    for (const column of block.columns) {
      const uid = withN17Prefix('w5mfg', 'c')
      const model = displayModelFor(column.kind)
      await save({
        uid, use: 'TableColumnModel', parentId: tableUid, subKey: 'columns', subType: 'array', sortIndex,
        stepParams: {
          fieldSettings: { init: { dataSourceKey: 'main', collectionName: block.collection, fieldPath: column.name } },
          tableColumnSettings: { model: { use: model } },
        },
        props: { title: column.title, dataIndex: column.name, width: 150, editable: false, sorter: false, fixed: 'none', ...(column.options === undefined || column.options.length === 0 ? {} : { options: column.options }) },
      })
      await save({
        uid: `${uid}f`, use: model, parentId: uid, subKey: 'field', subType: 'object', sortIndex: 0,
        stepParams: { popupSettings: { openView: { collectionName: block.collection, dataSourceKey: 'main' } } },
        props: { displayStyle: 'text', overflowMode: 'ellipsis', clickToOpen: false, displayCopyButton: false, ...(column.options === undefined || column.options.length === 0 ? {} : { options: column.options }) },
      })
      sortIndex += 1
    }
    if (block.formFields === undefined) {
      await save({
        uid: withN17Prefix('w5mfg', 'rf'), parentId: tableUid, subKey: 'actions', subType: 'array', sortIndex: 2, use: 'RefreshActionModel',
        props: { title: '', icon: 'ReloadOutlined' },
        stepParams: { buttonSettings: { general: { title: '', icon: 'ReloadOutlined' } } },
      })
      continue
    }
    await save({
      uid: withN17Prefix('w5mfg', 'fa'), parentId: tableUid, subKey: 'actions', subType: 'array', sortIndex: 1,
      use: 'FilterActionModel', props: {},
      stepParams: { buttonSettings: { general: { title: '{{t("Filter")}}' } } },
    })
    await save({
      uid: withN17Prefix('w5mfg', 'an'), parentId: tableUid, subKey: 'actions', subType: 'array', sortIndex: 2, use: 'AddNewActionModel', props: {},
      stepParams: { popupSettings: { openView: { collectionName: block.collection, dataSourceKey: 'main' } } },
      subModels: {
        page: {
          use: 'ChildPageModel', subKey: 'page', subType: 'object', sortIndex: 0, props: {},
          stepParams: { pageSettings: { general: { displayTitle: false, enableTabs: true } } },
          subModels: {
            tabs: [{
              use: 'ChildPageTabModel', subKey: 'tabs', subType: 'array', sortIndex: 0, props: {},
              stepParams: { pageTabSettings: { tab: { title: '{{t("Add new")}}' } } },
              subModels: {
                grid: {
                  use: 'BlockGridModel', subKey: 'grid', subType: 'object', sortIndex: 0, props: {},
                  subModels: {
                    items: [{
                      use: 'CreateFormModel', subKey: 'items', subType: 'array', sortIndex: 1, props: {},
                      stepParams: { resourceSettings: { init: { dataSourceKey: 'main', collectionName: block.collection } } },
                      subModels: { grid: formGrid(block.collection, block.formFields) },
                    }],
                  },
                },
              },
            }],
          },
        },
      },
    })
    await save({
      uid: withN17Prefix('w5mfg', 'rf'), parentId: tableUid, subKey: 'actions', subType: 'array', sortIndex: 3, use: 'RefreshActionModel',
      props: { title: '', icon: 'ReloadOutlined' },
      stepParams: { buttonSettings: { general: { title: '', icon: 'ReloadOutlined' } } },
    })
  }
  console.log(`nocobase-w5: v2 page "${spec.title}" created (/admin/${routeUid}) with ${spec.blocks.length} block(s)`)
}

// ─── the demo chain (06-b5 验收 checkbox 1:1) ───

/** Expect one async body to refuse; return its message (fail loud when it resolves). */
async function expectRefusal(label: string, body: () => Promise<unknown>): Promise<string> {
  try {
    await body()
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.log(`nocobase-w5: [chain] 卡口负例 ✓ ${label} → ${message.slice(0, 90)}`)
    return message
  }
  throw new Error(`卡口负例未拦截：${label}（本应被拒绝却成功了）`)
}

async function demoChain(token: string): Promise<void> {
  const io = tokenIO(token)
  const mos = await rowsOf(token, 'mfg_orders')
  const mo1 = mos.find(row => row.code === 'MO-2026-0001')
  const mo2 = mos.find(row => row.code === 'MO-2026-0002')
  if (mo1 === undefined || mo2 === undefined) throw new Error('种子缺失：MO-2026-0001/0002（先跑本脚本主流程）')
  const boms = await rowsOf(token, 'mfg_boms')
  const retired = boms.find(row => row.code === 'BOM-0001')
  if (retired === undefined) throw new Error('种子缺失：BOM-0001（retired 负例素材）')

  console.log('nocobase-w5: [chain] ══ 生产计划链演示（建 MO 卡口 → 审批 → 下达 → 排产 → 冲突排队 → 冻结/重排 → 后推）══')

  // S0 卡口负例：无有效 BOM 不能建 MO（retired v1）。
  await expectRefusal('对退役 BOM 建生产订单', () => enforceGates(io, 'mfg_orders', { bom_id: Number(retired.id) }))

  // S1 MO-1 审批：draft → pending → approved（¥78,000 ≤ 10 万单轮）。
  let mo1State = String(mo1.doc_status)
  if (mo1State === 'draft' || mo1State === 'rejected') {
    await submitForApproval(io, 'mfg_orders', Number(mo1.id), '陈立群')
    mo1State = 'pending'
    console.log('nocobase-w5: [chain] MO-2026-0001 submitted (draft→pending)')
  }
  if (mo1State === 'pending') {
    const result = await act(io, 'mfg_orders', Number(mo1.id), 'approve', 'admin', '生产计划审批（链路演示）')
    mo1State = result.to_state
    console.log(`nocobase-w5: [chain] MO-2026-0001 approve → ${result.to_state}`)
  }
  if (mo1State !== 'approved' && mo1State !== 'released') throw new Error(`MO-2026-0001 审批未生效（${mo1State}）`)

  // S2 下达（approved ≠ released 两步分离）：released_at 回写 + 排产预览推送。
  runScript('mfg-schedule.mts', ['--release', 'MO-2026-0001'])

  // S3 排产预览（what-if 纯预览；JSON 落终端证据 b5-schedule.json）。
  const previewText = runScript('mfg-schedule.mts', ['--preview', 'MO-2026-0001'])
  const plannedStart1 = String(/"planned_start": "([^"]+)"/.exec(previewText)?.[1] ?? '')
  console.log(`nocobase-w5: [chain] MO-2026-0001 preview planned_start=${plannedStart1}`)

  // S4 正式排产：写 mfg_order_operations + planned_start/end（重放已排则跳过）。
  const appliedBefore = async (moId: number): Promise<number> =>
    (await rowsOf(token, 'mfg_order_operations')).filter(row => Number(row.order_id) === moId).length
  if (await appliedBefore(Number(mo1.id)) === 0) {
    runScript('mfg-schedule.mts', ['--apply', 'MO-2026-0001'])
  } else {
    console.log('nocobase-w5: [chain] MO-2026-0001 already applied (kept)')
  }

  // S5 卡口负例：draft MO 不能排产（MO-0002 仍 draft）。
  const draftMo2 = (await rowsOf(token, 'mfg_orders')).find(row => row.code === 'MO-2026-0002')
  if (draftMo2 !== undefined && String(draftMo2.doc_status) === 'draft') {
    runScript('mfg-schedule.mts', ['--apply', 'MO-2026-0002'], '排产被拒')
    console.log('nocobase-w5: [chain] 卡口负例 ✓ draft MO --apply 被拒（未生效不得排产）')
  }

  // S6 MO-2 两级审批（¥224,000 > 10 万加签）→ 下达 → 排产（与 MO-1 抢 WC-ASSY，排队顺延）。
  let mo2State = String((await rowsOf(token, 'mfg_orders')).find(row => row.code === 'MO-2026-0002')?.doc_status)
  if (mo2State === 'draft' || mo2State === 'rejected') {
    await submitForApproval(io, 'mfg_orders', Number(mo2.id), '李贺')
    mo2State = 'pending'
    console.log('nocobase-w5: [chain] MO-2026-0002 submitted (draft→pending)')
  }
  if (mo2State === 'pending') {
    const first = await act(io, 'mfg_orders', Number(mo2.id), 'approve', 'admin', '金额超限，报总经理加签')
    mo2State = first.to_state
    if (first.to_state !== 'pending_level2') throw new Error(`MO-2026-0002 金额应路由二级审批，实际 ${first.to_state}`)
    console.log(`nocobase-w5: [chain] MO-2026-0002 approve → ${first.to_state}（金额阈值路由）`)
  }
  if (mo2State === 'pending_level2') {
    const second = await act(io, 'mfg_orders', Number(mo2.id), 'approve', 'admin', '总经理加签通过')
    mo2State = second.to_state
    console.log(`nocobase-w5: [chain] MO-2026-0002 approve → ${second.to_state}`)
  }
  if (mo2State !== 'approved' && mo2State !== 'released') throw new Error(`MO-2026-0002 审批未生效（${mo2State}）`)
  if (mo2State === 'approved') runScript('mfg-schedule.mts', ['--release', 'MO-2026-0002'])
  if (await appliedBefore(Number(mo2.id)) === 0) {
    runScript('mfg-schedule.mts', ['--apply', 'MO-2026-0002'])
  } else {
    console.log('nocobase-w5: [chain] MO-2026-0002 already applied (kept)')
  }

  // 冲突排队对照：两单的计划日期 × 工作中心。
  const centers = await rowsOf(token, 'mfg_work_centers')
  const wcCode = (id: unknown): string => String(centers.find(row => Number(row.id) === Number(id))?.code ?? id)
  const operations = await rowsOf(token, 'mfg_order_operations')
  const show = (moId: number): string => operations.filter(row => Number(row.order_id) === moId)
    .sort((a, b) => Number(a.seq) - Number(b.seq))
    .map(row => `${String(row.seq)}@${wcCode(row.workcenter_id)} ${String(row.planned_date).slice(0, 10)} (${String(row.planned_min)}分)`)
    .join(' → ')
  console.log(`nocobase-w5: [chain] MO-1 排程：${show(Number(mo1.id))}`)
  console.log(`nocobase-w5: [chain] MO-2 排程：${show(Number(mo2.id))}（同 WC 冲突排队顺延）`)

  // S7 冻结语义：已 apply 的 MO 再 apply 被拒 → void → 重排（改期重算）。
  runScript('mfg-schedule.mts', ['--apply', 'MO-2026-0001'], '已冻结')
  console.log('nocobase-w5: [chain] 卡口负例 ✓ 已排 MO 重复 apply 被拒（冻结语义）')
  runScript('mfg-schedule.mts', ['--void', 'MO-2026-0001'])
  runScript('mfg-schedule.mts', ['--apply', 'MO-2026-0001'])
  console.log('nocobase-w5: [chain] MO-2026-0001 void → 重排完成（改期重算）')

  // S8 后推最晚开工 + 负向时间告警：need_date 临时压到后天必负向，验完还原。
  const mo2Row = (await rowsOf(token, 'mfg_orders')).find(row => row.code === 'MO-2026-0002')
  if (mo2Row === undefined) throw new Error('MO-2026-0002 缺失')
  const originalNeed = String(mo2Row.need_date ?? '').slice(0, 10)
  // Tomorrow: MO-2's three one-shift operations cannot walk back past today
  // against MO-1's frozen buckets — the negative slack fires.
  const tightNeed = new Date(Date.now() + 1 * 86_400_000).toISOString().slice(0, 10)
  await dataOf(token, 'POST', `/api/mfg_orders:update?filterByTk=${mo2Row.id}`, { need_date: tightNeed })
  const latestText = runScript('mfg-schedule.mts', ['--latest-start', 'MO-2026-0002'])
  if (!latestText.includes('"negative_slack": true')) {
    throw new Error('后推负向告警未触发：need_date 压缩后 latest-start 应为 negative_slack=true')
  }
  console.log('nocobase-w5: [chain] 后推负向告警 ✓（最晚开工早于今天——建议改期/拆单/外协）')
  // Restore the need date; a crash-leftover tight date self-heals to the seed
  // offset (today + 29d) instead of persisting the compression.
  const todayIso = new Date().toISOString().slice(0, 10)
  const restore = originalNeed > todayIso ? originalNeed : new Date(Date.now() + SEED_MO[1]!.needInDays * 86_400_000).toISOString().slice(0, 10)
  await dataOf(token, 'POST', `/api/mfg_orders:update?filterByTk=${mo2Row.id}`, { need_date: restore })

  // S9 终态快照（psql 只读复核用）。
  const final1 = (await rowsOf(token, 'mfg_orders')).find(row => row.code === 'MO-2026-0001')
  const final2 = (await rowsOf(token, 'mfg_orders')).find(row => row.code === 'MO-2026-0002')
  console.log('nocobase-w5: [chain] ══ 终态 ══')
  console.log(`nocobase-w5: [chain] MO-1: doc_status=${String(final1?.doc_status)} released_at=${String(final1?.released_at)} planned=${String(final1?.planned_start)}→${String(final1?.planned_end)} reservation_state=${String(final1?.reservation_state)}`)
  console.log(`nocobase-w5: [chain] MO-2: doc_status=${String(final2?.doc_status)} released_at=${String(final2?.released_at)} planned=${String(final2?.planned_start)}→${String(final2?.planned_end)} need_date=${originalNeed}`)
  console.log('nocobase-w5: [chain] done — 全链（含卡口负例×3、两级审批、冲突排队、冻结/重排、后推告警）走通')
}

// ─── verify (self-check; setup-nocobase owns the cross-batch gates) ───

async function verify(token: string): Promise<void> {
  const failures: string[] = []
  for (const collection of COLLECTIONS) {
    const row = await dataOf(token, 'GET', `/api/collections/${collection.name}`)
    if (row === null) failures.push(`collection ${collection.name} missing`)
  }
  const routes = await listAllRoutes(token)
  const flowPageTitles = new Set(routes.filter(row => row.type === 'flowPage').map(row => row.title ?? ''))
  const missingPages = ['BOM 管理', 'BOM 工序', '工作中心', '生产订单', '排产看板'].filter(title => !flowPageTitles.has(title))
  if (missingPages.length > 0) failures.push(`生产域 v2 pages missing: ${missingPages.join(', ')}`)
  if (!routes.some(row => row.title === MENU_GROUP.title && row.type === 'group')) failures.push(`menu group ${MENU_GROUP.title} missing`)
  const gates = await rowsOf(token, 'wfl_gate_configs')
  for (const gate of GATES) {
    const exists = gates.some(row =>
      row.downstream_collection === gate.downstream_collection
      && row.upstream_collection === gate.upstream_collection
      && row.upstream_field === gate.upstream_field)
    if (!exists) failures.push(`gate ${String(gate.downstream_collection)}→${String(gate.upstream_collection)} missing`)
  }
  const flows = await rowsOf(token, 'wfl_flow_configs')
  if (!flows.some(row => row.doc_type === 'mfg_orders' && row.is_active === true)) failures.push('flow config mfg_orders missing')
  const bomRows = await rowsOf(token, 'mfg_boms')
  if (!bomRows.some(row => row.code === 'BOM-0001' && row.bom_status === 'retired')) failures.push('BOM-0001 retired version row missing (版本切换不删旧版)')
  if (!bomRows.some(row => row.code === 'BOM-0002' && row.bom_status === 'active' && row.is_default === true)) failures.push('BOM-0002 active default missing')
  const bomLineCount = (await rowsOf(token, 'mfg_bom_lines')).length
  if (bomLineCount < 8) failures.push(`BOM 组件行不足（${String(bomLineCount)} < 8；每 active BOM 4 组件）`)
  const bomOpCount = (await rowsOf(token, 'mfg_bom_operations')).length
  if (bomOpCount < 6) failures.push(`BOM 工序行不足（${String(bomOpCount)} < 6；每 active BOM 3 工序）`)
  if ((await rowsOf(token, 'mfg_work_centers')).length < 2) failures.push('work centers missing (< 2)')
  if ((await rowsOf(token, 'mfg_holidays')).length < 9) failures.push('holidays missing (< 9)')
  const moRows = await rowsOf(token, 'mfg_orders')
  if (!moRows.some(row => row.code === 'MO-2026-0001')) failures.push('seed MO-2026-0001 missing')
  if (!moRows.some(row => row.code === 'MO-2026-0002')) failures.push('seed MO-2026-0002 missing')
  if (failures.length > 0) {
    throw new Error(`nocobase-w5 verify FAILED:\n  - ${failures.join('\n  - ')}`)
  }
  console.log('nocobase-w5: verify OK — 7 collections + 5 pages + group + gate + flow + seeds（BOM 版本/工序/组件/日历/MO）')
}

// ─── rollback ───

async function rollback(token: string): Promise<void> {
  let destroyedModels = 0
  for (const row of await listModels(token)) {
    if (String(row.uid ?? '').startsWith('w5mfg')) {
      await call(token, 'POST', `/api/flowModels:destroy?filterByTk=${encodeURIComponent(String(row.uid))}`)
      destroyedModels += 1
    }
  }
  if (destroyedModels > 0) {
    const survivors = await listModels(token)
    const liveForms = new Set(survivors.filter(row => row.use === 'CreateFormModel').map(row => String(row.uid ?? '')))
    let swept = 0
    for (const row of survivors) {
      const uid = String(row.uid ?? '')
      if (uid.startsWith('n18ai-') && !liveForms.has(uid.slice('n18ai-'.length))) {
        await call(token, 'POST', `/api/flowModels:destroy?filterByTk=${encodeURIComponent(uid)}`)
        swept += 1
      }
    }
    console.log(`nocobase-w5: ${destroyedModels} w5mfg flowModels destroyed, ${swept} orphaned n18ai- buttons swept`)
  }
  for (const spec of PAGES) {
    const flow = (await listAllRoutes(token)).find(row => row.title === spec.title && row.type === 'flowPage')
    if (flow === undefined) continue
    for (const tab of (await listAllRoutes(token)).filter(row => row.parentId === flow.id && row.type === 'tabs')) {
      await call(token, 'DELETE', `/api/desktopRoutes:destroy?filterByTk=${tab.id}`)
    }
    await call(token, 'DELETE', `/api/desktopRoutes:destroy?filterByTk=${flow.id}`)
  }
  const group = (await listAllRoutes(token)).find(row => row.title === MENU_GROUP.title && row.type === 'group')
  if (group !== undefined) await call(token, 'DELETE', `/api/desktopRoutes:destroy?filterByTk=${group.id}`)
  // Flow config (states/transitions hang off flow_id).
  for (const config of (await rowsOf(token, 'wfl_flow_configs')).filter(row => row.doc_type === 'mfg_orders')) {
    const states = (await rowsOf(token, 'wfl_flow_states')).filter(row => Number(row.flow_id) === Number(config.id))
    for (const state of states) await call(token, 'POST', `/api/wfl_flow_states:destroy?filterByTk=${state.id}`)
    const transitions = (await rowsOf(token, 'wfl_flow_transitions')).filter(row => Number(row.flow_id) === Number(config.id))
    for (const transition of transitions) await call(token, 'POST', `/api/wfl_flow_transitions:destroy?filterByTk=${transition.id}`)
    await call(token, 'POST', `/api/wfl_flow_configs:destroy?filterByTk=${config.id}`)
  }
  for (const gate of GATES) {
    const rows = (await rowsOf(token, 'wfl_gate_configs')).filter(row =>
      row.downstream_collection === gate.downstream_collection
      && row.upstream_collection === gate.upstream_collection
      && row.upstream_field === gate.upstream_field)
    for (const row of rows) await call(token, 'POST', `/api/wfl_gate_configs:destroy?filterByTk=${row.id}`)
  }
  // The eight component materials (sku-scoped).
  for (const material of COMPONENT_MATERIALS) {
    const rows = (await rowsOf(token, 'hub_inv_products', 200)).filter(row => row.sku === material.sku)
    for (const row of rows) await call(token, 'POST', `/api/hub_inv_products:destroy?filterByTk=${row.id}`)
  }
  for (const collection of [...COLLECTIONS].reverse()) {
    const existing = await dataOf(token, 'GET', `/api/collections/${collection.name}`)
    if (existing !== null) {
      await call(token, 'POST', `/api/collections:destroy?filterByTk=${collection.name}&cascade=true&drop=true&skipChildren=true`)
    }
  }
  console.log('nocobase-w5: rollback done — pages/group/flow/gate/seeds/collections removed')
}

// ─── main ───

async function main(): Promise<void> {
  const args = process.argv.slice(2)
  const token = await signInWithRetry()
  if (args.includes('--rollback')) {
    await rollback(token)
    console.log('nocobase-w5: done (rollback)')
    return
  }
  if (args.includes('--demo-chain')) {
    await demoChain(token)
    return
  }
  await ensureCollections(token)
  await ensureFlows(token)
  await ensureGates(token)
  await seedRows(token)
  const group = await ensureMenuGroup(token)
  let sort = 1
  for (const spec of PAGES) {
    await ensureV2Page(token, spec, group.id, sort++)
  }
  await verify(token)
  console.log('nocobase-w5: done')
}

await main()
