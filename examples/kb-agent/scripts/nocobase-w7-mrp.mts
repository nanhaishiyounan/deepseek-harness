/**
 * W7/B7: the sales→MRP domain's NocoBase side
 * (plans/2026-09-25-mfg-closure/08-b7-sales-mrp.md). One script, every step
 * idempotent:
 *
 * 1. Five collections: so_orders (code SO-YYYY-NNNN, customer m2o
 *    crm_customers, optional deal m2o crm_deals, need_date, amount, the
 *    six-state doc_status + the orthogonal shipping_status
 *    none/partial/shipped), so_order_lines (qty / unit_price / qty_shipped),
 *    mrp_suggestions (plan_type MO|PR, status open/converted/dismissed, the
 *    converted-doc back-reference chain), mrp_snapshots (one audit row per
 *    product per close: gross/safety/on_hand/inbound/wip/reserved/net), and
 *    mrp_confirm_intents (the plan-workbench intent row the workflow
 *    consumes — the w1 page-approval pattern).
 * 2. mfg_orders and pur_requests grow the driver columns
 *    (driver_suggestion_id / driver_so_code); wms_movements.move_type gains
 *    SHIPMENT_SO.
 * 3. The so_orders approval flow via seedDocFlow (amount routing; 超 10 万
 *    加签总经理).
 * 4. Three gates: mrp_suggestions.driver_so_id → so_orders (approved —
 *    draft SO 不进 MRP), mfg_orders/pur_requests.driver_suggestion_id →
 *    mrp_suggestions (status=open — 未确认建议不能转单 + 转单后防重复转).
 *    The SO-facing finished-goods reservation gate rides the engine
 *    (reserveForSo asserts approved) because wms_reservations.ref_id is
 *    polymorphic (SO|MO|SHIPMENT) and a table gate would refuse MO rows.
 * 5. Seeds: SO-0001 approved (two buyable lines — the reserve→ship
 *    walkthrough), SO-0002 draft at ¥200k (two-round approval + the 米果
 *    shortage + a +90d JIT-out-of-window line), SO-0003 draft (excluded).
 * 6. Four 销售管理 v2 flowPages: 销售订单 / 计划工作台 (suggestions + the
 *    confirm-intent Add-new form) / MRP 快照 / 主生产计划 (W2-B2: mps_plans
 *    + the mps_plan_items forecast grid; forecast_qty editable, planned_qty
 *    engine-written).
 * 7. The 计划单确认 workflow: mrp_confirm_intents create → request callback
 *    on the engine serve /confirm-suggestion (坑③ toggle pair; the engine
 *    consumes the intent row on success).
 * 8. W2-B2 MPS: mps_plans/mps_plan_items collections, the mps_plans approval
 *    flow (six-state, no amount branch), the seed plan (3 periods × 4
 *    products) with the two hand-check SOs, mrp_suggestions.mps_plan
 *    back-link column, and the --demo-mps end-to-end chain (draft gate →
 *    recalc hand-check → approve lock-in → covered exclusivity → horizon
 *    override → confirm → PO/MO → void teardown; the post-void close stays
 *    byte-identical to the W-round baseline).
 *
 * Usage (repo root, tsx loader):
 *   node --import tsx/esm examples/kb-agent/scripts/nocobase-w7-mrp.mts
 *   node --import tsx/esm examples/kb-agent/scripts/nocobase-w7-mrp.mts --demo-chain
 *   node --import tsx/esm examples/kb-agent/scripts/nocobase-w7-mrp.mts --rollback
 */
import { spawnSync } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { call, dataOf, ensureTableRowDetail, listFlowModels, listRoutes, signInWithRetry, withN17Prefix } from './nocobase-flow-page-lib.mts'
import { act, enforceGates, seedDocFlow, seedMpsFlow, submitForApproval, type NocoIO } from './approval-engine.mts'
import { confirmSuggestion, recalcPlan, reserveForSo, runMrp, shipSo } from './mrp-run.mts'

type RouteRow = import('./nocobase-flow-page-lib.mts').RouteRow
type FlowModelRow = import('./nocobase-flow-page-lib.mts').FlowModelRow

const here = dirname(fileURLToPath(import.meta.url))

// ─── field factories (the w5 wire shapes) ───

const input = (name: string, title: string): object => ({ name, type: 'string', interface: 'input', uiSchema: { type: 'string', 'x-component': 'Input', title } })
const textarea = (name: string, title: string): object => ({ name, type: 'text', interface: 'textarea', uiSchema: { type: 'string', 'x-component': 'Input.TextArea', title } })
const select = (name: string, title: string, enumOptions: object[]): object => ({ name, type: 'string', interface: 'select', uiSchema: { type: 'string', 'x-component': 'Select', title, enum: enumOptions } })
const number = (name: string, title: string): object => ({ name, type: 'float', interface: 'number', uiSchema: { type: 'number', 'x-component': 'InputNumber', title } })
const integer = (name: string, title: string): object => ({ name, type: 'integer', interface: 'number', uiSchema: { type: 'number', 'x-component': 'InputNumber', title } })
const date = (name: string, title: string): object => ({ name, type: 'dateOnly', interface: 'date', uiSchema: { type: 'string', 'x-component': 'DatePicker', title, 'x-component-props': { dateFormat: 'YYYY-MM-DD' } } })
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
const SHIPPING_STATUS = opts([
  ['none', '未发货', 'default'], ['partial', '部分交付', 'orange'], ['shipped', '全部交付', 'green'],
])
const PLAN_TYPE = opts([['MO', '生产建议', 'purple'], ['PR', '采购建议', 'blue']])
const SUGGESTION_STATUS = opts([
  ['open', '待确认', 'orange'], ['converted', '已转单', 'green'], ['dismissed', '已忽略', 'default'],
])
const CONFIRM_ACTION = opts([['confirm', '确认转单', 'green'], ['dismiss', '忽略', 'default']])
// W2-B2: which side won the item-period max merge (planned_qty's lineage).
const MPS_DRIVER = opts([['so', '销售订单取大', 'purple'], ['forecast', '预测取大', 'blue']])

// ─── the five collections ───

const COLLECTIONS: ReadonlyArray<{ name: string, title: string, titleField?: string, fields: object[] }> = [
  {
    // The sales order header — the OTC chain's entry. doc_status rides the
    // shared six-state engine vocabulary (amount-routed approval);
    // shipping_status is the orthogonal progress axis (D2).
    name: 'so_orders', title: '销售订单', titleField: 'code', fields: [
      input('code', '订单号'), belongsTo('customer', '客户', 'crm_customers', 'customer_id'),
      belongsTo('deal', '关联商机', 'crm_deals', 'deal_id'),
      date('need_date', '交货日期'), number('amount', '金额'),
      select('doc_status', '审批状态', STATE_OPTS), select('shipping_status', '发货进度', SHIPPING_STATUS),
      input('approved_by', '审批人'), date('approved_at', '生效日'), textarea('note', '备注'),
    ],
  },
  {
    name: 'so_order_lines', title: '销售订单行', fields: [
      belongsTo('order', '销售订单', 'so_orders', 'order_id', 'code'),
      belongsTo('product', '产品', 'hub_inv_products', 'product_id'),
      number('qty', '数量'), number('unit_price', '单价'), number('qty_shipped', '已交付数量'),
    ],
  },
  {
    // The plan order (ERPNext's 计划单): open until a human confirms, then
    // converted with the doc back-reference chain.
    name: 'mrp_suggestions', title: 'MRP 计划建议', titleField: 'id', fields: [
      input('run_id', '日结批次'), select('plan_type', '建议类型', PLAN_TYPE),
      belongsTo('product', '物料', 'hub_inv_products', 'product_id'),
      number('qty', '建议数量'), date('need_date', '需求日期'), date('suggest_date', '建议下单日'),
      input('driver_so_id', '驱动销售订单'), select('status', '状态', SUGGESTION_STATUS),
      input('converted_doc_type', '转单类型'), integer('converted_doc_id', '转单ID'),
      input('converted_doc_code', '转单编号'), input('converted_by', '确认人'), date('converted_at', '确认日期'),
      textarea('note', '说明'),
    ],
  },
  {
    // The nightly close's append-only audit: one row per product per level
    // per run — the psql hand-check re-derives net from the six terms.
    name: 'mrp_snapshots', title: 'MRP 日结快照', titleField: 'id', fields: [
      input('run_id', '日结批次'), date('run_date', '日结日期'),
      belongsTo('product', '物料', 'hub_inv_products', 'product_id'), input('sku', 'SKU'),
      number('gross', '毛需求'), number('safety', '安全库存'), number('on_hand', '现有量'),
      number('inbound', '在途量'), number('wip', '在制量'), number('reserved', '已预留'),
      number('net', '净需求'), date('need_date', '需求日期'), input('driver_so', '驱动销售订单'),
      integer('bom_level', 'BOM 层级'),
    ],
  },
  {
    // The plan workbench's intent row (the w1 page-approval pattern): the
    // Add-new form writes one row, the workflow curls the engine, the
    // engine consumes the row on success.
    name: 'mrp_confirm_intents', title: '计划确认意图', titleField: 'id', fields: [
      integer('suggestion_id', '建议ID'), select('action', '动作', CONFIRM_ACTION),
      input('operator', '操作人'), textarea('note', '意见'),
    ],
  },
  {
    // W2-B2 the MPS header: one planning-bucket container (3–6 monthly
    // periods). doc_status rides the shared six-state vocabulary — only an
    // approved plan drives the MRP close; approving locks the item snapshot
    // (the soft time fence: later SO shifts need --refresh-mps).
    name: 'mps_plans', title: '主生产计划', titleField: 'code', fields: [
      input('code', '计划号'), date('period_from', '展望期起'), date('period_to', '展望期止'),
      select('doc_status', '审批状态', STATE_OPTS),
      input('approved_by', '审批人'), date('approved_at', '生效日'), textarea('note', '备注'),
    ],
  },
  {
    // W2-B2 the MPS rows: item × monthly period. forecast_qty is the
    // planner's input; so_open_qty is the merge-moment SO snapshot;
    // planned_qty = max(so_open, forecast) is engine-written (recalcPlan /
    // the approval lock-in) — never hand-edited.
    name: 'mps_plan_items', title: '主生产计划行', titleField: 'id', fields: [
      belongsTo('plan', '主生产计划', 'mps_plans', 'plan_id', 'code'),
      belongsTo('product', '产品', 'hub_inv_products', 'product_id'),
      input('period', '时段（YYYY-MM）'),
      number('forecast_qty', '预测数量'), number('so_open_qty', 'SO 未交量快照'),
      number('planned_qty', '计划量（引擎写）'), select('driver', '取大来源', MPS_DRIVER),
      textarea('note', '备注'),
    ],
  },
]

/** Columns the conversion writes onto the two downstream doc tables. */
const DRIVER_COLUMNS: ReadonlyArray<{ collection: string, fields: object[] }> = [
  { collection: 'mfg_orders', fields: [integer('driver_suggestion_id', '驱动建议ID'), input('driver_so_code', '驱动销售订单')] },
  { collection: 'pur_requests', fields: [integer('driver_suggestion_id', '驱动建议ID'), input('driver_so_code', '驱动销售订单')] },
  // W2-B2: the plan back-link on MPS-driven suggestions (nullable text —
  // SO-driven rows carry nothing).
  { collection: 'mrp_suggestions', fields: [input('mps_plan', '驱动 MPS 计划')] },
]

const GATES: ReadonlyArray<Record<string, unknown>> = [
  // draft SO 不进 MRP：建议行的驱动 SO 必须已生效。
  { downstream_collection: 'mrp_suggestions', upstream_collection: 'so_orders', upstream_field: 'driver_so_id', upstream_ref_field: 'code', upstream_label: '销售订单', required_status: 'approved' },
  // 未确认建议不能转单 + 转单后防重复转：转出单的驱动建议必须仍处 open。
  { downstream_collection: 'mfg_orders', upstream_collection: 'mrp_suggestions', upstream_field: 'driver_suggestion_id', upstream_label: 'MRP 建议', upstream_state_field: 'status', required_status: 'open' },
  { downstream_collection: 'pur_requests', upstream_collection: 'mrp_suggestions', upstream_field: 'driver_suggestion_id', upstream_label: 'MRP 建议', upstream_state_field: 'status', required_status: 'open' },
]

const MENU_GROUP = { title: '销售管理', icon: 'ShopOutlined' }
const WORKFLOW_TITLE = 'MRP 计划单确认'
/** The engine-side callback the workflow's request node hits (B1 --serve). */
const ENGINE_CALLBACK = 'http://127.0.0.1:13110/confirm-suggestion'

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

// ─── structural steps ───

async function ensureCollections(token: string): Promise<void> {
  for (const collection of COLLECTIONS) {
    const existing = await dataOf(token, 'GET', `/api/collections/${collection.name}`)
    if (existing !== null) {
      console.log(`nocobase-w7: collection ${collection.name} exists (kept)`)
      continue
    }
    await dataOf(token, 'POST', '/api/collections:create', { name: collection.name, title: collection.title, ...(collection.titleField === undefined ? {} : { titleField: collection.titleField }), fields: collection.fields })
    console.log(`nocobase-w7: collection ${collection.name} created`)
  }
  for (const spec of DRIVER_COLUMNS) {
    const names = new Set(((await dataOf(token, 'GET', `/api/fields:list?filter=${encodeURIComponent(JSON.stringify({ collectionName: { $eq: spec.collection } }))}&pageSize=200`) as Array<{ name?: string }> | null) ?? []).map(field => field.name))
    for (const field of spec.fields) {
      const name = (field as { name: string }).name
      if (names.has(name)) {
        console.log(`nocobase-w7: ${spec.collection}.${name} exists (kept)`)
        continue
      }
      await dataOf(token, 'POST', '/api/fields:create', { collectionName: spec.collection, ...field })
      console.log(`nocobase-w7: ${spec.collection}.${name} added`)
    }
  }
  const moveField = await dataOf(token, 'GET', `/api/fields:list?filter=${encodeURIComponent(JSON.stringify({ collectionName: { $eq: 'wms_movements' }, name: { $eq: 'move_type' } }))}&pageSize=1`) as Array<{ uiSchema?: { enum?: object[] } }> | null
  const enumRows = moveField?.[0]?.uiSchema?.enum ?? []
  if (!enumRows.some(row => (row as { value?: string }).value === 'SHIPMENT_SO')) {
    await dataOf(token, 'POST', `/api/fields:update?filterByTk=${encodeURIComponent(JSON.stringify({ collectionName: 'wms_movements', name: 'move_type' }))}`, {
      uiSchema: { enum: [...enumRows, { value: 'SHIPMENT_SO', label: '销售发货', color: 'cyan' }] },
    })
    console.log('nocobase-w7: wms_movements.move_type + SHIPMENT_SO')
  }
}

async function ensureFlows(token: string): Promise<void> {
  // Amount routing on amount = Σ line qty × unit_price (超 10 万加签总经理).
  await seedDocFlow(tokenIO(token), 'so_orders', '销售订单审批', { amountField: 'amount' })
  // W2-B2: the MPS plan flow — no amount column, one round, engine hooks the
  // approval transition into the snapshot lock-in recalc.
  await seedMpsFlow(tokenIO(token))
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
      console.log(`nocobase-w7: gate ${String(gate.downstream_collection)}→${String(gate.upstream_collection)} (${String(gate.upstream_field)}) created`)
      continue
    }
    if ((existing.upstream_state_field ?? null) !== (gate.upstream_state_field ?? null) || existing.required_status !== gate.required_status) {
      await dataOf(token, 'POST', `/api/wfl_gate_configs:update?filterByTk=${existing.id}`, {
        upstream_state_field: gate.upstream_state_field, required_status: gate.required_status,
      })
      console.log(`nocobase-w7: gate ${String(gate.downstream_collection)}→${String(gate.upstream_collection)} repaired`)
    }
  }
}

async function ensureWorkflow(token: string): Promise<void> {
  const found = await dataOf(token, 'GET', `/api/workflows:list?filter=${encodeURIComponent(JSON.stringify({ title: { $eq: WORKFLOW_TITLE } }))}&pageSize=5`) as Array<{ id: number }> | null
  if ((found ?? []).length > 0) {
    console.log(`nocobase-w7: workflow "${WORKFLOW_TITLE}" exists (kept)`)
    return
  }
  const workflow = await dataOf(token, 'POST', '/api/workflows:create', {
    title: WORKFLOW_TITLE, enabled: true, type: 'collection',
    config: { collection: 'mrp_confirm_intents', mode: 1 },
  }) as { id: number }
  // 坑③: the create-then-toggle pair mounts the db hook.
  await call(token, 'POST', `/api/workflows:toggle?filterByTk=${workflow.id}`)
  await call(token, 'POST', `/api/workflows:toggle?filterByTk=${workflow.id}`)
  await dataOf(token, 'POST', '/api/flow_nodes:create', {
    workflow: workflow.id, title: '回调 MRP 引擎确认', type: 'request',
    config: {
      url: ENGINE_CALLBACK, method: 'POST', contentType: 'application/json',
      data: {
        suggestion_id: '{{$context.data.suggestion_id}}', action: '{{$context.data.action}}',
        operator: '{{$context.data.operator}}', intent_record_id: '{{$context.data.id}}',
      },
      timeout: 30000,
    },
  })
  console.log(`nocobase-w7: workflow "${WORKFLOW_TITLE}" created (intents:create → request ${ENGINE_CALLBACK})`)
}

// ─── seeds ───

const iso = (offsetDays: number): string => new Date(Date.now() + offsetDays * 86_400_000).toISOString().slice(0, 10)

/**
 * Three SOs: SO-0001 approved with two buyable lines (the reserve→ship
 * walkthrough), SO-0002 draft at ¥200k (two-round approval + the 米果
 * shortage driving an MO suggestion + component PRs, plus the +90d
 * JIT-out-of-window line), SO-0003 draft (never enters demand).
 */
const SEED_SOS: ReadonlyArray<{ code: string, customerIndex: number, needInDays: number, docStatus: string, amount: number,
  lines: ReadonlyArray<{ sku: string, qty: number, unitPrice: number, needInDays: number }> }> = [
  {
    code: 'SO-2026-0001', customerIndex: 0, needInDays: 10, docStatus: 'approved', amount: 2_420,
    lines: [
      { sku: 'FD-BEV-1000', qty: 60, unitPrice: 22, needInDays: 10 },
      { sku: 'FD-SOY-500', qty: 50, unitPrice: 12.5, needInDays: 10 },
    ],
  },
  {
    code: 'SO-2026-0002', customerIndex: 1, needInDays: 21, docStatus: 'draft', amount: 200_000,
    lines: [
      { sku: 'FD-SNA-080', qty: 20_000, unitPrice: 9.8, needInDays: 21 },
      { sku: 'FD-FRZ-450', qty: 300, unitPrice: 18.9, needInDays: 90 },
    ],
  },
  {
    code: 'SO-2026-0003', customerIndex: 0, needInDays: 14, docStatus: 'draft', amount: 1_470,
    lines: [
      { sku: 'FD-SNA-080', qty: 150, unitPrice: 9.8, needInDays: 14 },
    ],
  },
]

async function seedRows(token: string): Promise<void> {
  const customers = await rowsOf(token, 'crm_customers', 20)
  if (customers.length < 2) throw new Error('crm_customers 种子不足 2 行（先跑 nocobase-crm-modules.mts）')
  const products = await rowsOf(token, 'hub_inv_products', 200)
  for (const so of SEED_SOS) {
    const customer = customers[so.customerIndex]
    if (customer === undefined) throw new Error('SO 种子素材缺失（客户行）')
    let header = (await rowsOf(token, 'so_orders')).find(row => row.code === so.code)
    if (header === undefined) {
      header = await dataOf(token, 'POST', '/api/so_orders:create', {
        code: so.code, customer: { id: Number(customer.id) },
        need_date: iso(so.needInDays), amount: so.amount,
        doc_status: so.docStatus, shipping_status: 'none',
        approved_by: so.docStatus === 'approved' ? 'admin' : null,
        approved_at: so.docStatus === 'approved' ? iso(0) : null,
        note: 'B7 种子（销售→MRP 联动）',
      }) as Record<string, any>
      console.log(`nocobase-w7: seed ${so.code} (${so.docStatus}) created`)
    }
    for (const line of so.lines) {
      const product = products.find(row => row.sku === line.sku)
      if (product === undefined) throw new Error(`SO 种子物料缺失：${line.sku}`)
      const exists = (await rowsOf(token, 'so_order_lines')).some(row => Number(row.order_id) === Number(header!.id) && Number(row.product_id) === Number(product.id))
      if (exists) continue
      await dataOf(token, 'POST', '/api/so_order_lines:create', {
        order: { id: Number(header.id) }, product: { id: Number(product.id) },
        qty: line.qty, unit_price: line.unitPrice, qty_shipped: 0,
      })
    }
  }
  console.log(`nocobase-w7: ${String(SEED_SOS.length)} seed SOs with ${String(SEED_SOS.reduce((total, so) => total + so.lines.length, 0))} lines in place`)
}

// ─── W2-B2: the MPS seeds ───

/** The seed plan's code (one live demo plan; the month rides period 1). */
const mpsSeedCode = (): string => `MPS-${monthOffset(1).replace('-', '')}-01`

/** The YYYY-MM `offset` months from today (offset 1 = next month). */
function monthOffset(offset: number): string {
  const now = new Date()
  const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + offset, 1))
  return date.toISOString().slice(0, 7)
}

/**
 * Seed the W2-B2 MPS demo set (idempotent): the 3-period plan MPS-<p1>-01
 * (SNA × 3 periods as the exclusivity body, BEV/FRZ × period 1 for the
 * max-merge hand-checks; SOY stays OUT of the plan so its direct-feed line
 * remains the uncovered counterexample and the far-period window case), its
 * item rows (forecast only — planned_qty stays engine-written), and three
 * draft SOs the chain approves then voids back out so the resting demand
 * set keeps the W-round shape.
 */
async function seedMpsRows(token: string): Promise<void> {
  const customers = await rowsOf(token, 'crm_customers', 20)
  const products = await rowsOf(token, 'hub_inv_products', 200)
  const periods = [monthOffset(1), monthOffset(2), monthOffset(3)]
  const p1 = periods[0]!
  const p3 = periods[2]!
  // forecast rows: [sku, periodIndex, forecast]. FRZ rides period 2 — the
  // live SO-2026-0002 FRZ line (header need 2026-10-17) falls in period 1,
  // and the so-side hand-check needs a period with exactly one 700-qty SO.
  const seedItems: ReadonlyArray<readonly [string, number, number]> = [
    ['FD-SNA-080', 0, 5_000], ['FD-SNA-080', 1, 6_000], ['FD-SNA-080', 2, 4_000],
    ['FD-BEV-1000', 0, 500], ['FD-FRZ-450', 1, 400],
  ]
  // hand-check SOs: [code, customerIndex, sku, qty, needDate]
  const seedSos: ReadonlyArray<readonly [string, number, string, number, string]> = [
    ['SO-2026-0091', 0, 'FD-BEV-1000', 300, `${p1}-08`],
    ['SO-2026-0092', 1, 'FD-FRZ-450', 700, `${monthOffset(2)}-05`],
    ['SO-2026-0093', 0, 'FD-SOY-500', 3_000, `${p3}-05`],
  ]
  const code = mpsSeedCode()
  let plan = (await rowsOf(token, 'mps_plans')).find(row => row.code === code)
  if (plan === undefined) {
    plan = await dataOf(token, 'POST', '/api/mps_plans:create', {
      code, period_from: `${p1}-01`, period_to: `${p3}-28`,
      doc_status: 'draft', note: 'W2-B2 种子（3 期展望：米果 3 期 + 饮品/酱油首期对拍 + 汤圆远期窗例）',
    }) as Record<string, any>
    console.log(`nocobase-w7: seed ${code} (draft, ${p1}..${p3}) created`)
  }
  for (const [sku, periodIndex, forecast] of seedItems) {
    const product = products.find(row => row.sku === sku)
    if (product === undefined) throw new Error(`MPS 种子物料缺失：${sku}`)
    const period = periods[periodIndex]!
    const exists = (await rowsOf(token, 'mps_plan_items')).some(row =>
      Number(row.plan_id) === Number(plan!.id) && Number(row.product_id) === Number(product.id) && String(row.period) === period)
    if (exists) continue
    await dataOf(token, 'POST', '/api/mps_plan_items:create', {
      plan: { id: Number(plan.id) }, product: { id: Number(product.id) },
      period, forecast_qty: forecast, note: 'W2-B2 种子行',
    })
  }
  for (const [soCode, customerIndex, sku, qty, needDate] of seedSos) {
    const customer = customers[customerIndex]
    const product = products.find(row => row.sku === sku)
    if (customer === undefined || product === undefined) throw new Error(`MPS 对拍 SO 素材缺失：${soCode}`)
    const header = (await rowsOf(token, 'so_orders')).find(row => row.code === soCode)
    const orderId = header === undefined
      ? Number((await dataOf(token, 'POST', '/api/so_orders:create', {
          code: soCode, customer: { id: Number(customer.id) }, need_date: needDate,
          amount: 0, doc_status: 'draft', shipping_status: 'none', note: 'W2-B2 对拍 SO（max 合并手算素材）',
        }) as Record<string, any>).id)
      : Number(header.id)
    const lineExists = (await rowsOf(token, 'so_order_lines')).some(row => Number(row.order_id) === orderId && Number(row.product_id) === Number(product.id))
    if (!lineExists) {
      await dataOf(token, 'POST', '/api/so_order_lines:create', {
        order: { id: orderId }, product: { id: Number(product.id) }, qty, unit_price: 1, qty_shipped: 0,
      })
    }
  }
  console.log(`nocobase-w7: MPS seed ${code} — ${String(seedItems.length)} item row(s) + ${String(seedSos.length)} hand-check SOs (draft) in place`)
}

// ─── the three 销售管理 v2 pages (E1 table spine) ───

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
    title: '销售订单', icon: 'ShoppingCartOutlined', blocks: [
      {
        heading: 'SO（审批生效 + 发货进度双轴）', collection: 'so_orders',
        columns: [
          { name: 'code', title: '订单号', kind: 'input' },
          { name: 'customer', title: '客户', kind: 'm2o' },
          { name: 'need_date', title: '交货日期', kind: 'date' },
          { name: 'amount', title: '金额', kind: 'number' },
          { name: 'doc_status', title: '审批状态', kind: 'select', options: STATE_OPTS },
          { name: 'shipping_status', title: '发货进度', kind: 'select', options: SHIPPING_STATUS },
          { name: 'approved_by', title: '审批人', kind: 'input' },
          { name: 'approved_at', title: '生效日', kind: 'date' },
        ],
        formFields: [
          { name: 'code', title: '订单号', kind: 'input', required: true },
          { name: 'customer', title: '客户', kind: 'm2o', required: true },
          { name: 'deal', title: '关联商机', kind: 'm2o' },
          { name: 'need_date', title: '交货日期', kind: 'date' },
          { name: 'amount', title: '金额', kind: 'number' },
          { name: 'doc_status', title: '审批状态', kind: 'select', options: STATE_OPTS },
          { name: 'shipping_status', title: '发货进度', kind: 'select', options: SHIPPING_STATUS },
          { name: 'note', title: '备注', kind: 'input' },
        ],
      },
      {
        heading: '订单行（产品 × 数量 × 单价 × 已交付）', collection: 'so_order_lines',
        columns: [
          { name: 'order', title: '销售订单', kind: 'm2o' },
          { name: 'product', title: '产品', kind: 'm2o' },
          { name: 'qty', title: '数量', kind: 'number' },
          { name: 'unit_price', title: '单价', kind: 'number' },
          { name: 'qty_shipped', title: '已交付数量', kind: 'number' },
        ],
        formFields: [
          { name: 'order', title: '销售订单', kind: 'm2o', required: true },
          { name: 'product', title: '产品', kind: 'm2o', required: true },
          { name: 'qty', title: '数量', kind: 'number', required: true },
          { name: 'unit_price', title: '单价', kind: 'number' },
        ],
      },
    ],
  },
  {
    title: '计划工作台', icon: 'CompassOutlined', blocks: [
      {
        heading: 'MRP 计划建议（待确认 → 人工转单）', collection: 'mrp_suggestions',
        columns: [
          { name: 'run_id', title: '日结批次', kind: 'input' },
          { name: 'plan_type', title: '建议类型', kind: 'select', options: PLAN_TYPE },
          { name: 'product', title: '物料', kind: 'm2o' },
          { name: 'qty', title: '建议数量', kind: 'number' },
          { name: 'need_date', title: '需求日期', kind: 'date' },
          { name: 'suggest_date', title: '建议下单日', kind: 'date' },
          { name: 'driver_so_id', title: '驱动销售订单', kind: 'input' },
          { name: 'status', title: '状态', kind: 'select', options: SUGGESTION_STATUS },
          { name: 'converted_doc_code', title: '转单编号', kind: 'input' },
          { name: 'converted_by', title: '确认人', kind: 'input' },
        ],
        defaultFilter: { status: 'open' },
      },
      {
        heading: '确认意图（填建议ID + 动作 → 引擎转单）', collection: 'mrp_confirm_intents',
        columns: [
          { name: 'suggestion_id', title: '建议ID', kind: 'number' },
          { name: 'action', title: '动作', kind: 'select', options: CONFIRM_ACTION },
          { name: 'operator', title: '操作人', kind: 'input' },
          { name: 'note', title: '意见', kind: 'input' },
        ],
        formFields: [
          { name: 'suggestion_id', title: '建议ID', kind: 'number', required: true },
          { name: 'action', title: '动作', kind: 'select', options: CONFIRM_ACTION, required: true },
          { name: 'operator', title: '操作人', kind: 'input' },
          { name: 'note', title: '意见', kind: 'input' },
        ],
      },
    ],
  },
  {
    // W2-B2: the MPS workbench — plan headers with the six-state approval
    // axis plus the item×period forecast grid (forecast_qty editable;
    // planned_qty/so_open_qty/driver are engine-written merge outputs).
    title: '主生产计划', icon: 'FieldTimeOutlined', blocks: [
      {
        heading: 'MPS 计划（draft→批准驱动 MRP；批准即锁快照）', collection: 'mps_plans',
        columns: [
          { name: 'code', title: '计划号', kind: 'input' },
          { name: 'period_from', title: '展望期起', kind: 'date' },
          { name: 'period_to', title: '展望期止', kind: 'date' },
          { name: 'doc_status', title: '审批状态', kind: 'select', options: STATE_OPTS },
          { name: 'approved_by', title: '审批人', kind: 'input' },
          { name: 'approved_at', title: '生效日', kind: 'date' },
          { name: 'note', title: '备注', kind: 'input' },
        ],
        formFields: [
          { name: 'code', title: '计划号', kind: 'input', required: true },
          { name: 'period_from', title: '展望期起', kind: 'date', required: true },
          { name: 'period_to', title: '展望期止', kind: 'date', required: true },
          { name: 'doc_status', title: '审批状态', kind: 'select', options: STATE_OPTS },
          { name: 'note', title: '备注', kind: 'input' },
        ],
      },
      {
        heading: '计划行（产品 × 月度时段；计划量 = max(SO 未交量, 预测量)，引擎写）', collection: 'mps_plan_items',
        columns: [
          { name: 'plan', title: '主生产计划', kind: 'm2o' },
          { name: 'product', title: '产品', kind: 'm2o' },
          { name: 'period', title: '时段', kind: 'input' },
          { name: 'forecast_qty', title: '预测数量', kind: 'number' },
          { name: 'so_open_qty', title: 'SO 未交量快照', kind: 'number' },
          { name: 'planned_qty', title: '计划量（引擎写）', kind: 'number' },
          { name: 'driver', title: '取大来源', kind: 'select', options: MPS_DRIVER },
          { name: 'note', title: '备注', kind: 'input' },
        ],
        formFields: [
          { name: 'plan', title: '主生产计划', kind: 'm2o', required: true },
          { name: 'product', title: '产品', kind: 'm2o', required: true },
          { name: 'period', title: '时段（YYYY-MM）', kind: 'input', required: true },
          { name: 'forecast_qty', title: '预测数量', kind: 'number', required: true },
          { name: 'note', title: '备注', kind: 'input' },
        ],
      },
    ],
  },
  {
    title: 'MRP 快照', icon: 'HistoryOutlined', blocks: [
      {
        heading: '日结快照（毛需求 → 净需求六项复算）', collection: 'mrp_snapshots',
        columns: [
          { name: 'run_id', title: '日结批次', kind: 'input' },
          { name: 'run_date', title: '日结日期', kind: 'date' },
          { name: 'sku', title: 'SKU', kind: 'input' },
          { name: 'gross', title: '毛需求', kind: 'number' },
          { name: 'safety', title: '安全库存', kind: 'number' },
          { name: 'on_hand', title: '现有量', kind: 'number' },
          { name: 'inbound', title: '在途量', kind: 'number' },
          { name: 'wip', title: '在制量', kind: 'number' },
          { name: 'reserved', title: '已预留', kind: 'number' },
          { name: 'net', title: '净需求', kind: 'number' },
          { name: 'driver_so', title: '驱动销售订单', kind: 'input' },
          { name: 'bom_level', title: 'BOM 层级', kind: 'number' },
        ],
      },
    ],
  },
]

const listModels = (token: string): Promise<FlowModelRow[]> => listFlowModels(token, 'W7')
const listAllRoutes = (token: string): Promise<RouteRow[]> => listRoutes(token, 'W7')

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
  const itemUids = fields.map(() => withN17Prefix('w7mrp', 'i'))
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
    console.log(`nocobase-w7: menu group "${MENU_GROUP.title}" exists (kept)`)
    return { id: existing.id }
  }
  const row = await dataOf(token, 'POST', '/api/desktopRoutes:create', { title: MENU_GROUP.title, icon: MENU_GROUP.icon, type: 'group' })
  console.log(`nocobase-w7: menu group "${MENU_GROUP.title}" created`)
  return { id: Number(row.id) }
}

/** Whether the page already carries a w7mrp table block for one collection. */
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
    console.log(`nocobase-w7: v2 page "${spec.title}" exists (kept)`)
    return
  }
  if ((await listAllRoutes(token)).some(row => row.title === spec.title && row.type === 'page')) {
    throw new Error(`a v1 page named "${spec.title}" already exists; rename it first`)
  }
  const routeUid = withN17Prefix('w7mrp', '')
  const page = await dataOf(token, 'POST', '/api/desktopRoutes:create', { title: spec.title, icon: spec.icon, type: 'flowPage', parentId: groupId, sort, schemaUid: routeUid })
  const tabUid = withN17Prefix('w7mrp', 't')
  await dataOf(token, 'POST', '/api/desktopRoutes:create', { title: '', type: 'tabs', parentId: page.id, schemaUid: tabUid, tabSchemaName: withN17Prefix('w7mrp', 'ts') })

  const save = (model: Record<string, unknown>) => dataOf(token, 'POST', '/api/flowModels:save', model)
  await save({ uid: routeUid, schema: { use: 'RouteModel' } })
  await save({ uid: tabUid, schema: { use: 'RouteModel' } })
  const pageUid = withN17Prefix('w7mrp', 'p')
  await save({ uid: pageUid, parentId: routeUid, subKey: 'page', subType: 'object', use: 'RootPageModel', props: { title: spec.title, displayTitle: true, enableTabs: false }, stepParams: { pageSettings: { general: { title: spec.title, displayTitle: true, enableTabs: false } } } })
  const gridUid = withN17Prefix('w7mrp', 'g')
  await save({ uid: gridUid, parentId: tabUid, subKey: 'grid', subType: 'object', use: 'BlockGridModel', props: {}, filterManager: [] })

  let blockIndex = 0
  for (const block of spec.blocks) {
    blockIndex += 1
    const tableUid = withN17Prefix('w7mrp', 'tb')
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
      const uid = withN17Prefix('w7mrp', 'c')
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
        uid: withN17Prefix('w7mrp', 'rf'), parentId: tableUid, subKey: 'actions', subType: 'array', sortIndex: 2, use: 'RefreshActionModel',
        props: { title: '', icon: 'ReloadOutlined' },
        stepParams: { buttonSettings: { general: { title: '', icon: 'ReloadOutlined' } } },
      })
      // W3-B1: row-detail triple on every fresh table (P0 root cause ① fix).
      await ensureTableRowDetail(token, tableUid, {
        collection: block.collection,
        fields: block.columns.map(column => ({ fieldPath: column.name, modelUse: displayModelFor(column.kind), ...(column.options === undefined || column.options.length === 0 ? {} : { options: column.options }) })),
        tabTitle: '详情',
        actionsColumnSortIndex: block.columns.length + 1,
      })
      continue
    }
    await save({
      uid: withN17Prefix('w7mrp', 'fa'), parentId: tableUid, subKey: 'actions', subType: 'array', sortIndex: 1,
      use: 'FilterActionModel', props: {},
      stepParams: { buttonSettings: { general: { title: '{{t("Filter")}}' } } },
    })
    await save({
      uid: withN17Prefix('w7mrp', 'an'), parentId: tableUid, subKey: 'actions', subType: 'array', sortIndex: 2, use: 'AddNewActionModel', props: {},
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
      uid: withN17Prefix('w7mrp', 'rf'), parentId: tableUid, subKey: 'actions', subType: 'array', sortIndex: 3, use: 'RefreshActionModel',
      props: { title: '', icon: 'ReloadOutlined' },
      stepParams: { buttonSettings: { general: { title: '', icon: 'ReloadOutlined' } } },
    })
    // W3-B1: row-detail triple on every fresh table (P0 root cause ① fix).
    await ensureTableRowDetail(token, tableUid, {
      collection: block.collection,
      fields: block.columns.map(column => ({ fieldPath: column.name, modelUse: displayModelFor(column.kind), ...(column.options === undefined || column.options.length === 0 ? {} : { options: column.options }) })),
      tabTitle: '详情',
      actionsColumnSortIndex: block.columns.length + 1,
    })
  }
  console.log(`nocobase-w7: v2 page "${spec.title}" created (/admin/${routeUid}) with ${spec.blocks.length} block(s)`)
}

// ─── the demo chain (08-b7 验收 checkbox 1:1) ───

/** Expect one async body to refuse; return its message (fail loud when it resolves). */
async function expectRefusal(label: string, body: () => Promise<unknown>): Promise<string> {
  try {
    await body()
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.log(`nocobase-w7: [chain] 卡口负例 ✓ ${label} → ${message.slice(0, 90)}`)
    return message
  }
  throw new Error(`卡口负例未拦截：${label}（本应被拒绝却成功了）`)
}

/** Run one sibling script as a child (the w5 runScript pattern). */
function runScript(script: string, args: readonly string[], env: Readonly<Record<string, string>> = {}): string {
  const result = spawnSync('node', ['--import', 'tsx/esm', join(here, script), ...args], { encoding: 'utf8', env: { ...process.env, ...env } })
  const text = `${result.stdout ?? ''}${result.stderr ?? ''}`
  if (result.status !== 0) {
    throw new Error(`${script} ${args.join(' ')} failed (exit ${String(result.status)})\n${text.slice(0, 400)}`)
  }
  return text
}

async function demoChain(token: string): Promise<void> {
  const io = tokenIO(token)
  const sos = await rowsOf(token, 'so_orders')
  const so1 = sos.find(row => row.code === 'SO-2026-0001')
  const so2 = sos.find(row => row.code === 'SO-2026-0002')
  const so3 = sos.find(row => row.code === 'SO-2026-0003')
  if (so1 === undefined || so2 === undefined || so3 === undefined) throw new Error('种子缺失：SO-2026-0001/0002/0003（先跑本脚本主流程）')
  const productsAll = await rowsOf(token, 'hub_inv_products', 200)

  console.log('nocobase-w7: [chain] ══ 销售→MRP 链演示（SO 审批 → 预留 → 日结 → 确认转单 → 交付推进）══')

  // S0 卡口负例：draft SO 不能驱动 MRP 建议（enforceGates 层）。
  await expectRefusal('对 draft SO 建建议行', () => enforceGates(io, 'mrp_suggestions', { driver_so_id: 'SO-2026-0003' }))

  // S1 SO-2 两级审批：draft → pending → pending_level2（¥200,000 > 10 万）→ approved。
  let so2State = String(so2.doc_status)
  if (so2State === 'draft' || so2State === 'rejected') {
    await submitForApproval(io, 'so_orders', Number(so2.id), '陈立群')
    so2State = 'pending'
    console.log('nocobase-w7: [chain] SO-2026-0002 submitted (draft→pending)')
  }
  if (so2State === 'pending') {
    const first = await act(io, 'so_orders', Number(so2.id), 'approve', 'admin', '金额超限，报总经理加签')
    so2State = first.to_state
    console.log(`nocobase-w7: [chain] SO-2026-0002 一审 → ${first.to_state}`)
  }
  if (so2State === 'pending_level2') {
    const second = await act(io, 'so_orders', Number(so2.id), 'approve', 'admin', '总经理签核，同意接单')
    so2State = second.to_state
  }
  if (so2State !== 'approved') throw new Error(`SO-2026-0002 审批未达 approved（${so2State}）`)
  console.log('nocobase-w7: [chain] SO-2026-0002 approved（两级审批 + 加签留痕）')

  // S2 生效即预留：SO-1（approved 种子）成品预留——可用则 assigned。
  const reserve1 = await reserveForSo(token, 'SO-2026-0001')
  if (reserve1.lines.length !== 2) throw new Error(`SO-1 预留行数断言失败（${String(reserve1.lines.length)} ≠ 2）`)
  const shortLines = reserve1.lines.filter(row => row.shortfall > 0)
  console.log(`nocobase-w7: [chain] SO-1 预留 ✓（${shortLines.length === 0 ? '两行足额 assigned' : `缺料 ${String(shortLines.length)} 行（partial 预留）`}）`)

  // S3 日结：draft SO 的需求被排除（引擎只收 approved）+ 快照六项复算。
  const result = await runMrp(token)
  const snapshots = (await rowsOf(token, 'mrp_snapshots')).filter(row => row.run_id === result.run_id)
  const snaSnap = snapshots.find(row => row.sku === 'FD-SNA-080' && Number(row.bom_level) === 0)
  if (snaSnap === undefined) throw new Error('FD-SNA-080 快照行缺失（日结未覆盖米果需求）')
  const recomputed = Number(snaSnap.gross) + Number(snaSnap.safety) - Number(snaSnap.on_hand) - Number(snaSnap.inbound) - Number(snaSnap.wip) + Number(snaSnap.reserved)
  if (Math.abs(recomputed - Number(snaSnap.net)) > 0.01) {
    throw new Error(`净需求对账失败：${String(recomputed)} ≠ ${String(snaSnap.net)}（快照六项不自洽）`)
  }
  if (Number(snaSnap.gross) !== 20_000) {
    throw new Error(`draft SO 排除断言失败：毛需求 ${String(snaSnap.gross)} ≠ 20000（SO-3 的 150 混入或 SO-2 缺行）`)
  }
  console.log(`nocobase-w7: [chain] 日结 ${result.run_id} ✓ 快照复算一致（FD-SNA-080: ${String(snaSnap.gross)}+${String(snaSnap.safety)}−${String(snaSnap.on_hand)}−${String(snaSnap.inbound)}−${String(snaSnap.wip)}+${String(snaSnap.reserved)}=${String(snaSnap.net)}），draft SO 排除 ✓`)

  // S4 建议形态：MO ≥1（米果有 BOM）+ 组件 PR ≥1 + JIT 窗外不生成（BEV +90d 行）。
  const suggestions = (await rowsOf(token, 'mrp_suggestions')).filter(row => row.run_id === result.run_id && String(row.status) === 'open')
  const moSug = suggestions.filter(row => String(row.plan_type) === 'MO')
  const prSug = suggestions.filter(row => String(row.plan_type) === 'PR')
  if (moSug.length < 1) throw new Error(`MO 建议缺失（${String(moSug.length)} < 1）`)
  // The PR floor counts open rows plus ones an earlier run/mobile session
  // already converted — a replay after the mobile walkthrough legitimately
  // has no open PR left (the suggestion closed on conversion).
  const prEver = (await rowsOf(token, 'mrp_suggestions')).filter(row => String(row.plan_type) === 'PR').length
  if (prSug.length < 1 && prEver < 1) throw new Error(`PR 建议缺失（open 0 且历史 0）`)
  const frzId = Number(productsAll.find(row => row.sku === 'FD-FRZ-450')?.id ?? 0)
  const frzSuggestion = suggestions.find(row => Number(row.product_id) === frzId)
  if (frzSuggestion !== undefined) throw new Error('JIT 窗外负例失败：+90d 的 FD-FRZ-450 生成了建议')
  console.log(`nocobase-w7: [chain] 建议 ✓ MO×${String(moSug.length)} PR×${String(prSug.length)}（历史 PR×${String(prEver)}），JIT 窗外（FRZ +90d）无建议 ✓`)

  // S5 确认转单：MO 建议 → mfg_orders draft（driver 链回建议与 SO）。
  const target = moSug[0]!
  const confirmed = await confirmSuggestion(token, Number(target.id), '计划员甲')
  if (confirmed.doc_type !== 'mfg_orders') throw new Error(`转单类型断言失败（${confirmed.doc_type}）`)
  const convertedMo = (await rowsOf(token, 'mfg_orders')).find(row => Number(row.id) === confirmed.doc_id)
  if (convertedMo === undefined || String(convertedMo.code) !== confirmed.doc_code || String(convertedMo.doc_status) !== 'draft') throw new Error('转出 MO 断言失败（code/draft）')
  if (Number(convertedMo.driver_suggestion_id) !== Number(target.id) || String(convertedMo.driver_so_code ?? '') !== String(target.driver_so_id ?? '')) {
    throw new Error('转出 MO driver 链断言失败（建议→MO→SO）')
  }
  const after = (await rowsOf(token, 'mrp_suggestions')).find(row => Number(row.id) === Number(target.id))
  if (String(after?.status) !== 'converted' || String(after?.converted_doc_code) !== confirmed.doc_code) throw new Error('建议 converted 断言失败')
  console.log(`nocobase-w7: [chain] 确认转单 ✓ ${confirmed.doc_code} draft（driver→#${String(target.id)}→${String(target.driver_so_id)}），suggestion→converted`)

  // S6 防重复转：converted 建议再 confirm 被拒；nb 旁路（enforceGates）也被拒。
  await expectRefusal('重复 confirm 已转建议', () => confirmSuggestion(token, Number(target.id), '计划员甲'))
  await expectRefusal('nb_create 绕开引擎对 converted 建议转单', () => enforceGates(io, 'mfg_orders', { driver_suggestion_id: Number(target.id) }))

  // S7 转出 MO 走 B5 审批链回归：draft → pending → approved。
  await submitForApproval(io, 'mfg_orders', confirmed.doc_id, '计划员甲')
  await act(io, 'mfg_orders', confirmed.doc_id, 'approve', 'admin', 'MRP 转单 MO 审批（链路回归）')
  const moFinal = (await rowsOf(token, 'mfg_orders')).find(row => Number(row.id) === confirmed.doc_id)
  if (String(moFinal?.doc_status) !== 'approved') throw new Error(`转出 MO 审批回归失败（${String(moFinal?.doc_status)}）`)
  console.log('nocobase-w7: [chain] 转出 MO 审批 ✓ draft→pending→approved（B5 链可排产）')

  // S8 交付推进（两段式）：客户延后 SOY 行（释放预留）→ 首发只发 BEV →
  // partial → top-up 重新预留 → 再发 → shipped。已 shipped 时跳过（幂等重跑）。
  let so1Now = (await rowsOf(token, 'so_orders')).find(row => row.code === 'SO-2026-0001')
  if (String(so1Now?.shipping_status) === 'shipped') {
    console.log('nocobase-w7: [chain] SO-1 已 shipped（幂等跳过交付演示）')
  } else {
    const soyReservation = (await rowsOf(token, 'wms_reservations')).find(row => row.ref_type === 'SO' && String(row.ref_id) === 'SO-2026-0001' && String(row.status) === 'reserved')
    if (soyReservation !== undefined) {
      runScript('nocobase-h5-wms.mts', ['--release-reservation', String(soyReservation.code)])
      console.log(`nocobase-w7: [chain] 客户延后一行：释放预留 ${String(soyReservation.code)}（可用量恢复）`)
    }
    const linesNow = (await rowsOf(token, 'so_order_lines')).filter(row => Number(row.order_id) === Number(so1.id) && Number(row.qty_shipped ?? 0) > 0)
    if (linesNow.length === 0) {
      await shipSo(token, 'SO-2026-0001')
      so1Now = (await rowsOf(token, 'so_orders')).find(row => row.code === 'SO-2026-0001')
      if (String(so1Now?.shipping_status) !== 'partial') throw new Error(`SO-1 首发后应 partial（实际 ${String(so1Now?.shipping_status)}——释放后应仍有另一行预留）`)
      console.log('nocobase-w7: [chain] SO-1 部分交付 ✓ shipping_status=partial（延后行未发）')
    }
    // 模拟到货回补（B4 --post-adjust 是引擎正门）：给缺料行补足差额再 top-up。
    const lines = await rowsOf(token, 'so_order_lines')
    const lacking = lines.filter(row => Number(row.order_id) === Number(so1.id) && Number(row.qty_shipped ?? 0) + 1e-9 < Number(row.qty))
    for (const line of lacking) {
      const product = productsAll.find(row => Number(row.id) === Number(line.product_id))
      if (product === undefined) continue
      const lots = (await rowsOf(token, 'wms_lots')).filter(row => Number(row.product_id) === Number(line.product_id))
      const lot = lots.find(row => String(row.status) === 'qualified') ?? lots[0]
      if (lot === undefined) continue
      const bins = await rowsOf(token, 'wms_bins', 200)
      const stock = (await rowsOf(token, 'wms_stock', 500)).find(row => Number(row.product_id) === Number(line.product_id) && Number(row.lot_id) === Number(lot.id))
      const binCode = String(bins.find(bin => Number(bin.id) === Number(stock?.bin_id))?.code ?? 'GZ-A-01-01')
      runScript('nocobase-h5-wms.mts', ['--post-adjust', String(product.sku), String(lot.lot_no), binCode, String(Math.ceil(Number(line.qty) - Number(line.qty_shipped ?? 0)) + 40)])
    }
    await reserveForSo(token, 'SO-2026-0001')
    const ship2 = await shipSo(token, 'SO-2026-0001')
    if (ship2.shipping_status !== 'shipped') throw new Error(`SO-1 全部交付失败（${JSON.stringify(ship2)}）`)
  }
  so1Now = (await rowsOf(token, 'so_orders')).find(row => row.code === 'SO-2026-0001')
  if (String(so1Now?.shipping_status) !== 'shipped') throw new Error(`SO-1 终态应 shipped（${String(so1Now?.shipping_status)}）`)
  console.log('nocobase-w7: [chain] SO-1 全部交付 ✓ shipping_status=shipped（部分→全部推进）')

  // S9 报价版本：--revise-quote-current 后 version+1 且旧版 is_current=false。
  runScript('nocobase-crm-modules.mts', ['--revise-quote-current'])

  // S10 终态快照（psql 只读复核用）。
  const finalSo2 = (await rowsOf(token, 'so_orders')).find(row => row.code === 'SO-2026-0002')
  console.log('nocobase-w7: [chain] ══ 终态 ══')
  console.log(`nocobase-w7: [chain] SO-1: doc_status=${String(so1Now?.doc_status)} shipping=${String(so1Now?.shipping_status)}`)
  console.log(`nocobase-w7: [chain] SO-2: doc_status=${String(finalSo2?.doc_status)} shipping=${String(finalSo2?.shipping_status)}`)
  console.log(`nocobase-w7: [chain] run ${result.run_id}: snapshots=${String(result.snapshots)} suggestions=${String(result.suggestions)} stale_closed=${String(result.stale_closed)}`)
  console.log('nocobase-w7: [chain] done — 全链（含卡口负例×3、两级审批、日结对账、JIT 负例、确认转单、防重复转、B5 回归、部分→全部交付）走通')
}

// ─── the W2-B2 MPS end-to-end chain (02-b2 验收 checkbox 1:1) ───

/** q4-sum a list of quantities (the snapshot gross identity helper). */
function q4Sum(values: ReadonlyArray<number>): number {
  return Math.round(values.reduce((total, value) => total + value, 0) * 10_000) / 10_000
}

/** The repo root (three levels above this script's directory). */
function repoRoot(): string {
  return join(here, '..', '..', '..')
}

/**
 * The MPS acceptance chain: draft gate → hand-check SOs go effective → the
 * max-merge recalc hand-check → plan approval (the engine's lock-in hook)
 * → the covered-exclusivity close → the 120-day horizon run (the far SOY
 * line enters) → the fail-loud horizon negative → the mps:-driven confirm
 * → the void teardown restoring the W-round resting demand set, ending
 * with the row-level zero-drift diff against the pre-batch baseline export.
 * @param token - the root API token.
 */
async function demoMpsChain(token: string): Promise<void> {
  const io = tokenIO(token)
  const code = mpsSeedCode()
  console.log('nocobase-w7: [mps] ══ W2-B2 MPS 链（draft 卡口 → 对拍 SO 生效 → max 合并 → 批准锁定 → 互斥日结 → JIT 窗 → 确认转单 → void 复原 + 零漂移）══')

  // Seed self-heal first (idempotent): the chain owns its material — the
  // plan rows and the three draft hand-check SOs exist whatever the
  // surrounding environment ran last.
  await seedMpsRows(token)

  // M0 replay self-heal: a previous run left the demo set void/approved —
  // the seed rows ride the direct-write precedent (SEED_SOS writes
  // doc_status directly); the flow-audited transitions happen below.
  const plan = (await rowsOf(token, 'mps_plans')).find(row => row.code === code)
  if (plan === undefined) throw new Error(`种子缺失：${code}（先跑本脚本主流程）`)
  if (['void', 'approved'].includes(String(plan.doc_status))) {
    await dataOf(token, 'POST', `/api/mps_plans:update?filterByTk=${plan.id}`, { doc_status: 'draft', note: 'W2-B2 演示链重放：种子自愈回 draft' })
    console.log(`nocobase-w7: [mps] M0 ${code} ${String(plan.doc_status)}→draft（重放自愈）`)
  }
  const handCheckSos = ['SO-2026-0091', 'SO-2026-0092', 'SO-2026-0093']
  for (const soCode of handCheckSos) {
    const so = (await rowsOf(token, 'so_orders')).find(row => row.code === soCode)
    if (so !== undefined && ['void', 'approved'].includes(String(so.doc_status))) {
      await dataOf(token, 'POST', `/api/so_orders:update?filterByTk=${so.id}`, { doc_status: 'draft' })
      console.log(`nocobase-w7: [mps] M0 ${soCode} ${String(so.doc_status)}→draft（重放自愈）`)
    }
  }

  // M1 the draft gate: a draft MPS plan never drives the close (no mps:
  // snapshot rows this run; the still-draft SOs enter no demand either).
  const gateRun = await runMrp(token)
  const gateSnaps = (await rowsOf(token, 'mrp_snapshots')).filter(row => row.run_id === gateRun.run_id)
  if (gateSnaps.some(row => String(row.driver_so ?? '').startsWith('mps:'))) {
    throw new Error('M1 draft MPS 卡口失败：本轮快照出现 mps: 驱动行（draft 计划不得驱动 MRP）')
  }
  console.log(`nocobase-w7: [mps] M1 draft 卡口 ✓ ${gateRun.run_id} 无 mps: 驱动行`)

  // M2 the hand-check SOs go effective through the engine (amount 0 = one
  // round; the library act() carries no serve hooks, so no reservations
  // disturb the ledger between the runs).
  for (const soCode of handCheckSos) {
    const so = (await rowsOf(token, 'so_orders')).find(row => row.code === soCode)
    if (so === undefined) throw new Error(`种子缺失：${soCode}`)
    if (String(so.doc_status) === 'draft') {
      await submitForApproval(io, 'so_orders', Number(so.id), '计划员乙')
      const result = await act(io, 'so_orders', Number(so.id), 'approve', 'admin', 'W2-B2 演示链：对拍 SO 生效')
      if (result.to_state !== 'approved') throw new Error(`${soCode} 审批未达 approved（${result.to_state}）`)
    }
  }
  console.log('nocobase-w7: [mps] M2 对拍 SO ×3 approved ✓（引擎 submit→approve）')

  // M3 the max-merge hand-checks (acceptance §1): BEV max(300,500)=500
  // forecast; FRZ max(700,400)=700 so.
  const outcomes = await recalcPlan(token, Number(plan.id))
  const bev = outcomes.find(row => row.sku === 'FD-BEV-1000')
  if (bev === undefined || bev.so_open !== 300 || bev.forecast !== 500 || bev.planned !== 500 || bev.driver !== 'forecast') {
    throw new Error(`M3 对拍例1失败（BEV max(300,500)=500/forecast）：${JSON.stringify(bev)}`)
  }
  const frz = outcomes.find(row => row.sku === 'FD-FRZ-450' && row.period === monthOffset(2))
  if (frz === undefined || frz.so_open !== 700 || frz.forecast !== 400 || frz.planned !== 700 || frz.driver !== 'so') {
    throw new Error(`M3 对拍例2失败（FRZ 期2 max(700,400)=700/so）：${JSON.stringify(frz)}`)
  }
  console.log('nocobase-w7: [mps] M3 max 合并对拍 ✓ BEV max(300,500)=500（forecast）；FRZ 期2 max(700,400)=700（so）')

  // M4 plan approval through the engine (the effective hook re-runs the
  // merge once — the lock-in; recalc here equals M3's values). The chain
  // rides the library act() + the explicit recalc instead of spawning the
  // engine CLI: its post-act dynamic-import hook parks an unsettled
  // top-level await once the event loop drains (tsx/esm + TLA module; the
  // serve path keeps the loop alive and works — the serve /act probe below
  // in acceptance evidence).
  await submitForApproval(io, 'mps_plans', Number(plan.id), '计划员乙')
  const m4 = await act(io, 'mps_plans', Number(plan.id), 'approve', 'admin', 'W2-B2 演示链：MPS 批准（生效锁定快照）')
  if (!m4.effective) throw new Error(`M4 MPS 审批未生效（${m4.to_state}）`)
  await recalcPlan(token, Number(plan.id))
  const approvedPlan = (await rowsOf(token, 'mps_plans')).find(row => row.code === code)
  if (String(approvedPlan?.doc_status) !== 'approved') throw new Error(`M4 MPS 审批未达 approved（${String(approvedPlan?.doc_status)}）`)
  const products = await rowsOf(token, 'hub_inv_products', 200)
  const lockedItems = (await rowsOf(token, 'mps_plan_items')).filter(row => Number(row.plan_id) === Number(plan.id))
  const bevId = Number(products.find(row => row.sku === 'FD-BEV-1000')?.id ?? 0)
  const bevLocked = lockedItems.find(row => Number(row.product_id) === bevId)
  if (bevLocked === undefined || Number(bevLocked.planned_qty) !== 500) throw new Error('M4 锁定重算失败：BEV planned_qty 应为 500')
  console.log(`nocobase-w7: [mps] M4 MPS 批准 ✓ ${code} approved（生效钩子 recalc 锁定：BEV planned=500）`)

  // M5 the covered-exclusivity close: every covered item's level-0 row
  // rides the mps: driver with gross = Σ planned_qty; the uncovered SOY
  // keeps its direct SO feed; no SOY suggestion under the 60-day window.
  const mpsRun = await runMrp(token)
  const mpsSnaps = (await rowsOf(token, 'mrp_snapshots')).filter(row => row.run_id === mpsRun.run_id)
  const coveredIds = new Set(lockedItems.map(row => Number(row.product_id)))
  for (const id of coveredIds) {
    const row = mpsSnaps.find(r => Number(r.product_id) === id && Number(r.bom_level) === 0)
    if (row === undefined) throw new Error(`M5 covered item #${String(id)} 缺 level0 快照行`)
    if (String(row.driver_so) !== `mps:${code}`) {
      throw new Error(`M5 互斥破口：item #${String(id)} level0 driver=${String(row.driver_so)}（应为 mps:${code}）`)
    }
  }
  const snaId = Number(products.find(row => row.sku === 'FD-SNA-080')?.id ?? 0)
  const plannedSum = q4Sum(lockedItems.filter(row => Number(row.product_id) === snaId).map(row => Number(row.planned_qty ?? 0)))
  const snaSnap = mpsSnaps.find(r => Number(r.product_id) === snaId && Number(r.bom_level) === 0)
  if (snaSnap === undefined || Math.abs(Number(snaSnap.gross) - plannedSum) > 0.01) {
    throw new Error(`M5 gross 恒等式失败：SNA gross ${String(snaSnap?.gross)} ≠ Σplanned ${String(plannedSum)}`)
  }
  const soyId = Number(products.find(row => row.sku === 'FD-SOY-500')?.id ?? 0)
  const soySnap = mpsSnaps.find(r => Number(r.product_id) === soyId && Number(r.bom_level) === 0)
  if (soySnap === undefined || Number(soySnap.gross) !== 3_000 || String(soySnap.driver_so) !== 'SO-2026-0093') {
    throw new Error(`M5 未覆盖反例失败：SOY 应直纳 3000/SO-2026-0093（实际 ${String(soySnap?.gross)}/${String(soySnap?.driver_so)}）`)
  }
  const soySuggestion = (await rowsOf(token, 'mrp_suggestions')).find(row => row.run_id === mpsRun.run_id && String(row.status) === 'open' && Number(row.product_id) === soyId)
  if (soySuggestion !== undefined) throw new Error('M5 JIT 窗负例失败：SOY（远期）在 60 天窗内生成了建议')
  console.log(`nocobase-w7: [mps] M5 互斥日结 ✓ ${mpsRun.run_id}：covered ${String(coveredIds.size)} item 全 mps: 驱动；SNA gross=${String(snaSnap?.gross)}=Σplanned；SOY 直纳照旧且窗外无建议`)

  // M6 the 120-day horizon: the far SOY line (p3-05) enters the window and
  // lands an open PR suggestion this run.
  runScript('mrp-run.mts', ['--run-mrp'], { MRP_HORIZON_DAYS: '120' })
  const allSnaps = await rowsOf(token, 'mrp_snapshots')
  const horizonRunId = String(allSnaps.reduce((max, row) => Number(row.id) > Number(max.id ?? 0) ? row : max, allSnaps[0]!)?.run_id ?? '')
  const horizonSoy = (await rowsOf(token, 'mrp_suggestions')).find(row => row.run_id === horizonRunId && String(row.status) === 'open' && Number(row.product_id) === soyId)
  if (horizonSoy === undefined || String(horizonSoy.plan_type) !== 'PR') {
    throw new Error(`M6 JIT 窗断言失败：120 天窗 run ${horizonRunId} 无 SOY open PR 建议`)
  }
  console.log(`nocobase-w7: [mps] M6 JIT 窗 ✓ MRP_HORIZON_DAYS=120 → ${horizonRunId}：SOY 远期行进窗生成 PR 建议`)

  // M7 the fail-loud horizon negative: a non-numeric override refuses.
  const bad = spawnSync('node', ['--import', 'tsx/esm', join(here, 'mrp-run.mts'), '--run-mrp'], { encoding: 'utf8', env: { ...process.env, MRP_HORIZON_DAYS: 'abc' } })
  const badText = `${bad.stdout ?? ''}${bad.stderr ?? ''}`
  if (bad.status === 0 || !badText.includes('必须是正整数')) {
    throw new Error(`M7 fail-loud 失败：MRP_HORIZON_DAYS=abc 未被拒绝（exit ${String(bad.status)}）`)
  }
  console.log('nocobase-w7: [mps] M7 fail-loud ✓ MRP_HORIZON_DAYS=abc 拒绝且无落库')

  // M8 the mps:-driven confirm: the open SNA MO suggestion converts with
  // the plan back-link chain (suggestion.mps_plan + MO.driver_so_code).
  const snaSuggestion = (await rowsOf(token, 'mrp_suggestions')).find(row =>
    String(row.status) === 'open' && Number(row.product_id) === snaId && String(row.plan_type) === 'MO' && String(row.driver_so_id ?? '') === `mps:${code}`)
  if (snaSuggestion === undefined) throw new Error('M8 缺素材：无 mps: 驱动的 SNA open MO 建议')
  const confirmed = await confirmSuggestion(token, Number(snaSuggestion.id), '计划员乙')
  const convertedMo = (await rowsOf(token, 'mfg_orders')).find(row => Number(row.id) === confirmed.doc_id)
  const convertedSuggestion = (await rowsOf(token, 'mrp_suggestions')).find(row => Number(row.id) === Number(snaSuggestion.id))
  if (String(convertedMo?.driver_so_code) !== `mps:${code}`) {
    throw new Error(`M8 MO 回链失败：driver_so_code=${String(convertedMo?.driver_so_code)}（应为 mps:${code}）`)
  }
  if (String(convertedSuggestion?.mps_plan) !== code || String(convertedSuggestion?.status) !== 'converted') {
    throw new Error(`M8 建议回链失败：mps_plan=${String(convertedSuggestion?.mps_plan)} status=${String(convertedSuggestion?.status)}`)
  }
  console.log(`nocobase-w7: [mps] M8 确认转单 ✓ 建议 #${String(snaSuggestion.id)} → ${confirmed.doc_code}（mps_plan=${code} 回链，driver=mps:${code}）`)

  // M9 the void teardown: plan + hand-check SOs void through the engine,
  // the close sweeps the stale suggestions, and the resting snapshots diff
  // row-by-row against the pre-batch baseline export.
  for (const soCode of handCheckSos) {
    const so = (await rowsOf(token, 'so_orders')).find(row => row.code === soCode)
    if (String(so?.doc_status) === 'approved') {
      await act(io, 'so_orders', Number(so!.id), 'void', 'admin', 'W2-B2 演示链：对拍 SO 复原')
    }
  }
  const planNow = (await rowsOf(token, 'mps_plans')).find(row => row.code === code)
  if (String(planNow?.doc_status) === 'approved') {
    await act(io, 'mps_plans', Number(planNow!.id), 'void', 'admin', 'W2-B2 演示链：MPS 复原（保持 W 轮需求集）')
  }
  const restingRun = await runMrp(token)
  const restingSnaps = (await rowsOf(token, 'mrp_snapshots')).filter(row => row.run_id === restingRun.run_id)
  if (restingSnaps.some(row => String(row.driver_so ?? '').startsWith('mps:'))) {
    throw new Error('M9 复原失败：void 后快照仍有 mps: 驱动行')
  }
  const baseline = (await readFile(join(repoRoot(), 'research/2026-09-27-w2-evolution/w2-b2-baseline-snapshots.txt'), 'utf8'))
    .split('\n').map(line => line.trim()).filter(line => line !== '')
  const actual = restingSnaps
    .map(row => [row.product_id, row.sku, row.gross, row.safety, row.on_hand, row.inbound, row.wip, row.reserved, row.net, String(row.need_date ?? ''), String(row.driver_so ?? ''), String(row.bom_level)].join('|'))
    .sort()
  const expected = [...baseline].sort()
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`M9 零漂移失败：void 后快照与基线不一致\n  基线: ${expected.join(' / ')}\n  实际: ${actual.join(' / ')}`)
  }
  console.log(`nocobase-w7: [mps] M9 void 复原 + 零漂移 ✓ ${restingRun.run_id} 与批前基线 ${String(expected.length)} 行逐行一致`)
  console.log('nocobase-w7: [mps] done — 全链（draft 卡口/对拍生效/max 手算两例/批准锁定/互斥+gross 恒等/JIT 窗 120+abc/确认转单回链/void 复原零漂移）走通')
}

// ─── verify ───

async function verify(token: string): Promise<void> {
  const failures: string[] = []
  for (const collection of COLLECTIONS) {
    const row = await dataOf(token, 'GET', `/api/collections/${collection.name}`)
    if (row === null) failures.push(`collection ${collection.name} missing`)
  }
  const routes = await listAllRoutes(token)
  const flowPageTitles = new Set(routes.filter(row => row.type === 'flowPage').map(row => row.title ?? ''))
  const missingPages = ['销售订单', '计划工作台', 'MRP 快照', '主生产计划'].filter(title => !flowPageTitles.has(title))
  if (missingPages.length > 0) failures.push(`销售域 v2 pages missing: ${missingPages.join(', ')}`)
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
  if (!flows.some(row => row.doc_type === 'so_orders' && row.is_active === true)) failures.push('flow config so_orders missing')
  const workflows = await dataOf(token, 'GET', `/api/workflows:list?filter=${encodeURIComponent(JSON.stringify({ title: { $eq: WORKFLOW_TITLE } }))}&pageSize=5`) as Array<{ enabled?: boolean }> | null
  if ((workflows ?? []).length === 0) failures.push(`workflow ${WORKFLOW_TITLE} missing`)
  for (const spec of DRIVER_COLUMNS) {
    const names = new Set(((await dataOf(token, 'GET', `/api/fields:list?filter=${encodeURIComponent(JSON.stringify({ collectionName: { $eq: spec.collection } }))}&pageSize=200`) as Array<{ name?: string }> | null) ?? []).map(field => field.name))
    for (const field of spec.fields) {
      if (!names.has((field as { name: string }).name)) failures.push(`${spec.collection}.${(field as { name: string }).name} missing`)
    }
  }
  const soRows = await rowsOf(token, 'so_orders')
  for (const code of ['SO-2026-0001', 'SO-2026-0002', 'SO-2026-0003']) {
    if (!soRows.some(row => row.code === code)) failures.push(`seed ${code} missing`)
  }
  const lineCount = (await rowsOf(token, 'so_order_lines')).length
  if (lineCount < 4) failures.push(`so_order_lines rows < 4 (${String(lineCount)})`)
  // W2-B2: the MPS layer — plan/items seeds, the mps_plans flow, the
  // suggestion back-link column, and the historical covered-exclusivity
  // invariant (any run with an mps:-driven level-0 row must carry mps:
  // exclusively for that item — a mixed run means SO+MPS double-counted).
  if (!flows.some(row => row.doc_type === 'mps_plans' && row.is_active === true)) failures.push('flow config mps_plans missing (run nocobase-w7-mrp.mts)')
  const mpsPlan = (await rowsOf(token, 'mps_plans')).find(row => row.code === mpsSeedCode())
  if (mpsPlan === undefined) failures.push(`seed MPS plan ${mpsSeedCode()} missing (run nocobase-w7-mrp.mts)`)
  else {
    const mpsItems = (await rowsOf(token, 'mps_plan_items')).filter(row => Number(row.plan_id) === Number(mpsPlan.id))
    if (mpsItems.length < 5) failures.push(`mps_plan_items rows < 5 for ${mpsSeedCode()} (${String(mpsItems.length)})`)
    const unmerged = mpsItems.filter(row => row.planned_qty === null || row.planned_qty === undefined)
    if (unmerged.length > 0) failures.push(`mps_plan_items carries ${String(unmerged.length)} never-recalculated row(s) (planned_qty null — run --refresh-mps or the demo chain)`)
  }
  for (const code of ['SO-2026-0091', 'SO-2026-0092', 'SO-2026-0093']) {
    if (!soRows.some(row => row.code === code)) failures.push(`seed ${code} missing (W2-B2 hand-check SO)`)
  }
  const suggestFields = new Set(((await dataOf(token, 'GET', `/api/fields:list?filter=${encodeURIComponent(JSON.stringify({ collectionName: { $eq: 'mrp_suggestions' } }))}&pageSize=200`) as Array<{ name?: string }> | null) ?? []).map(field => field.name))
  if (!suggestFields.has('mps_plan')) failures.push('mrp_suggestions.mps_plan missing (run nocobase-w7-mrp.mts)')
  const snapshotsAll = await rowsOf(token, 'mrp_snapshots')
  const mpsRowsByRun = new Map<string, Set<string>>()
  for (const row of snapshotsAll.filter(r => Number(r.bom_level) === 0 && String(r.driver_so ?? '').startsWith('mps:'))) {
    const runId = String(row.run_id)
    mpsRowsByRun.set(runId, (mpsRowsByRun.get(runId) ?? new Set<string>()).add(String(row.product_id)))
  }
  for (const [runId, mpsProducts] of mpsRowsByRun) {
    for (const row of snapshotsAll.filter(r => String(r.run_id) === runId && Number(r.bom_level) === 0 && !String(r.driver_so ?? '').startsWith('mps:'))) {
      if (mpsProducts.has(String(row.product_id))) {
        failures.push(`covered-exclusivity violated in run ${runId}: item #${String(row.product_id)} carries both mps: and ${String(row.driver_so)} drivers`)
      }
    }
  }
  if (failures.length > 0) {
    throw new Error(`nocobase-w7 verify FAILED:\n  - ${failures.join('\n  - ')}`)
  }
  console.log('nocobase-w7: verify OK — 7 collections + 4 pages + group + 2 flows + 3 gates + workflow + driver columns + seeds + MPS layer (W2-B2: plan/items/back-link/exclusivity invariant)')
}

// ─── rollback ───

async function rollback(token: string): Promise<void> {
  let destroyedModels = 0
  for (const row of await listModels(token)) {
    if (String(row.uid ?? '').startsWith('w7mrp')) {
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
    console.log(`nocobase-w7: ${destroyedModels} w7mrp flowModels destroyed, ${swept} orphaned n18ai- buttons swept`)
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
  const workflows = await dataOf(token, 'GET', `/api/workflows:list?filter=${encodeURIComponent(JSON.stringify({ title: { $eq: WORKFLOW_TITLE } }))}&pageSize=5`) as Array<{ id: number }> | null
  for (const row of workflows ?? []) {
    await call(token, 'DELETE', `/api/workflows:destroy?filterByTk=${row.id}`)
  }
  for (const config of (await rowsOf(token, 'wfl_flow_configs')).filter(row => row.doc_type === 'so_orders' || row.doc_type === 'mps_plans')) {
    for (const state of (await rowsOf(token, 'wfl_flow_states')).filter(row => Number(row.flow_id) === Number(config.id))) {
      await call(token, 'POST', `/api/wfl_flow_states:destroy?filterByTk=${state.id}`)
    }
    for (const transition of (await rowsOf(token, 'wfl_flow_transitions')).filter(row => Number(row.flow_id) === Number(config.id))) {
      await call(token, 'POST', `/api/wfl_flow_transitions:destroy?filterByTk=${transition.id}`)
    }
    await call(token, 'POST', `/api/wfl_flow_configs:destroy?filterByTk=${config.id}`)
  }
  for (const gate of GATES) {
    const rows = (await rowsOf(token, 'wfl_gate_configs')).filter(row =>
      row.downstream_collection === gate.downstream_collection
      && row.upstream_collection === gate.upstream_collection
      && row.upstream_field === gate.upstream_field)
    for (const row of rows) await call(token, 'POST', `/api/wfl_gate_configs:destroy?filterByTk=${row.id}`)
  }
  for (const collection of [...COLLECTIONS].reverse()) {
    const existing = await dataOf(token, 'GET', `/api/collections/${collection.name}`)
    if (existing !== null) {
      await call(token, 'POST', `/api/collections:destroy?filterByTk=${collection.name}&cascade=true&drop=true&skipChildren=true`)
    }
  }
  console.log('nocobase-w7: rollback done — pages/group/workflow/flow/gate/seeds/collections removed')
}

// ─── main ───

async function main(): Promise<void> {
  const args = process.argv.slice(2)
  const token = await signInWithRetry()
  if (args.includes('--rollback')) {
    await rollback(token)
    console.log('nocobase-w7: done (rollback)')
    return
  }
  if (args.includes('--demo-chain')) {
    await demoChain(token)
    return
  }
  if (args.includes('--demo-mps')) {
    await demoMpsChain(token)
    return
  }
  await ensureCollections(token)
  await ensureFlows(token)
  await ensureGates(token)
  await seedRows(token)
  await seedMpsRows(token)
  // The seed lands forecast rows with planned_qty unset — one recalc makes
  // the page self-explanatory (idempotent; the demo chain recalcs again).
  const seededPlan = (await rowsOf(token, 'mps_plans')).find(row => row.code === mpsSeedCode())
  if (seededPlan !== undefined) await recalcPlan(token, Number(seededPlan.id))
  await ensureWorkflow(token)
  const group = await ensureMenuGroup(token)
  let sort = 1
  for (const spec of PAGES) {
    await ensureV2Page(token, spec, group.id, sort++)
  }
  await verify(token)
  console.log('nocobase-w7: done')
}

await main()
