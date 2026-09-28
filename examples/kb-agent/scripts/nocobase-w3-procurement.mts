/**
 * W3/B3: the procurement full chain's NocoBase side
 * (plans/2026-09-25-mfg-closure/04-b3-procurement.md). One script, every step
 * idempotent:
 *
 * 1. Nine pur_* collections: requests (+lines), rfqs (+supplier
 *    allocations), quotes, orders (+lines, the canonical PO table), invoices
 *    (three-way match), payments — each approval document rides the B1
 *    six-state doc_status axis with orthogonal progress columns (Odoo dual
 *    axis: receiving_status / invoice_status).
 * 2. wms_receipts gains po_id (m2o) + iqc_status — here, not in h5, because
 *    the m2o target pur_orders must exist first on the all chain's order
 *    (h5 runs before w3; the Agent Note records the decision).
 * 3. Four flows via approval-engine's seedDocFlow: pur_requests (no amount
 *    routing), pur_rfqs (none), pur_orders (amount; W2-B5 rides the flow
 *    extras — amount_threshold 200000, invoice_match_tolerance 0.1, and a
 *    two-person manager tier admin+quality_lead), pur_payments (amount,
 *    default threshold).
 * 4. Six gate rows: rfq→PR(approved), orders→supplier(lifecycle set),
 *    orders→rfq(approved), invoices→orders(approved), payments→invoices
 *    (match_result=confirmed), wms_receipts(po_id)→orders(approved).
 * 5. Seeds (before any workflow mounts — 坑④): 2 PR (one approved chain
 *    head, one draft negative-control), 1 RFQ approved + 3 qualified-supplier
 *    allocations, 3 submitted quotes, 2 PO (approved legacy + draft
 *    negative-control) + one order line, 1 unposted PO-sourced receipt.
 * 6. Seven 采购管理 v2 flowPages (E1 table spine; RFQ/比价/订单 pages carry
 *    multi-block comparison views).
 * 7. The demo chain (--demo-chain): PR→RFQ→quotes→award→PO two-level
 *    approval→receipt→IQC→quarantine release→invoice match (ok + over
 *    tolerance)→payment, with the gate negatives asserted along the way.
 *
 * Business endpoints beyond the approval engine (send/award/match/confirm/
 * pay) live here as CLI verbs; stock postings always delegate to the h5
 * engine CLI (--post-receipt / --iqc / --release-receipt), never bypassing it.
 *
 * Rollback: --rollback destroys the w3pur* flowModels tree (+ orphaned
 * n18ai- sweep), the seven pages + menu group, the two receipt columns, the
 * flows/gates/quotes/seeds, and the nine collections.
 *
 * Usage (repo root, tsx loader):
 *   node --import tsx/esm examples/kb-agent/scripts/nocobase-w3-procurement.mts
 *   node --import tsx/esm examples/kb-agent/scripts/nocobase-w3-procurement.mts --demo-chain
 *   node --import tsx/esm examples/kb-agent/scripts/nocobase-w3-procurement.mts --match-invoice INV-2026-0001
 *   node --import tsx/esm examples/kb-agent/scripts/nocobase-w3-procurement.mts --confirm-invoice INV-2026-0002
 *   node --import tsx/esm examples/kb-agent/scripts/nocobase-w3-procurement.mts --pay PAY-2026-0001
 *   node --import tsx/esm examples/kb-agent/scripts/nocobase-w3-procurement.mts --send-rfq RFQ-2026-0001
 *   node --import tsx/esm examples/kb-agent/scripts/nocobase-w3-procurement.mts --award-rfq RFQ-2026-0001 [--quote <报价行id>]
 *   node --import tsx/esm examples/kb-agent/scripts/nocobase-w3-procurement.mts --rollback
 */
import { spawnSync } from 'node:child_process'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { call, dataOf, ensureTableRowDetail, listFlowModels, listRoutes, signInWithRetry, withN17Prefix } from './nocobase-flow-page-lib.mts'
import { act, enforceGates, loadFlow, seedDocFlow, submitForApproval, type NocoIO } from './approval-engine.mts'
import { QUARANTINE_ZONE_CODE } from './nocobase-h5-wms.mts'

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
/** PR's doc_status grows the two post-approval business terminals (converted once a PO exists). */
const PR_STATUS = [...STATE_OPTS, ...opts([['converted', '已转单', 'cyan'], ['closed', '已关闭', 'default']])]
const RFQ_STATUS = [...STATE_OPTS, ...opts([['sent', '已发出', 'blue'], ['closed', '已关闭', 'default']])]
const QUOTE_STATUS = opts([['draft', '草稿', 'default'], ['submitted', '已报价', 'green']])
const RECEIVING_AXIS = opts([['none', '未收货', 'default'], ['partial', '部分收货', 'orange'], ['received', '收货完成', 'green']])
const INVOICE_AXIS = opts([['no_invoice', '未开票', 'default'], ['to_invoice', '待开票', 'orange'], ['invoiced', '已开票', 'green']])
/** The invoice's own verification axis (draft→matched/exception→confirmed; confirmed opens payments). */
const MATCH_RESULT = opts([
  ['draft', '待匹配', 'default'], ['pending', '匹配中', 'orange'], ['matched', '匹配通过', 'green'],
  ['exception', '匹配异常', 'red'], ['confirmed', '已确认', 'cyan'],
])
const PAY_STATUS = [...STATE_OPTS, ...opts([['paid', '已付款', 'green']])]
const PAY_METHOD = opts([['bank', '银行转账', 'blue'], ['bill', '承兑汇票', 'purple'], ['cash', '现金', 'default']])
const IQC_STATUS = opts([
  ['not_required', '免检', 'default'], ['pending', '待检', 'orange'],
  ['passed', '放行', 'green'], ['failed', '不合格', 'red'], ['concession', '让步接收', 'purple'],
])
/** The three-way-match tolerance default: |invoice_amount − Σlines(qty×price)| may not exceed this (04-b3 §集合设计). A flow's extras.invoice_match_tolerance overrides it (W2-B5); malformed values fail loud. */
export const MATCH_TOLERANCE = 0.05

// ─── the nine collections ───

const COLLECTIONS: ReadonlyArray<{ name: string, title: string, titleField?: string, fields: object[] }> = [
  {
    name: 'pur_requests', title: '采购申请', titleField: 'code', fields: [
      input('code', '申请单号'), input('requester', '申请人'), input('department', '部门'),
      date('need_date', '需求日期'), textarea('reason', '申请理由'), number('total_est', '预估总额'),
      select('doc_status', '审批状态', PR_STATUS),
    ],
  },
  {
    name: 'pur_request_lines', title: '采购申请行', fields: [
      belongsTo('request', '请购单', 'pur_requests', 'request_id', 'code'),
      belongsTo('product', '物料', 'hub_inv_products', 'product_id'),
      number('qty', '数量'), input('uom', '单位'), number('est_price', '预估单价'),
    ],
  },
  {
    name: 'pur_rfqs', title: '询价单', titleField: 'code', fields: [
      input('code', '询价单号'), belongsTo('pr', '来源请购', 'pur_requests', 'pr_id', 'code'),
      date('deadline', '报价截止'), select('doc_status', '审批状态', RFQ_STATUS),
    ],
  },
  {
    name: 'pur_rfq_suppliers', title: '询价分配', fields: [
      belongsTo('rfq', '询价单', 'pur_rfqs', 'rfq_id', 'code'),
      belongsTo('supplier', '供应商', 'srm_suppliers', 'supplier_id'),
      date('sent_at', '发出日期'),
    ],
  },
  {
    name: 'pur_quotes', title: '供应商报价', fields: [
      belongsTo('rfq', '询价单', 'pur_rfqs', 'rfq_id', 'code'),
      belongsTo('supplier', '供应商', 'srm_suppliers', 'supplier_id'),
      belongsTo('product', '物料', 'hub_inv_products', 'product_id'),
      number('qty', '数量'), number('unit_price', '单价'), integer('lead_time_days', '交期(天)'),
      date('valid_until', '有效期至'), boolean('is_won', '中标'), select('status', '状态', QUOTE_STATUS),
    ],
  },
  {
    name: 'pur_orders', title: '采购订单', titleField: 'code', fields: [
      input('code', '订单号'), belongsTo('supplier', '供应商', 'srm_suppliers', 'supplier_id'),
      belongsTo('rfq', '来源询价', 'pur_rfqs', 'rfq_id', 'code'),
      number('amount', '金额'), input('currency', '币种'), date('need_date', '需求日期'),
      textarea('compare_note', '比价依据'),
      select('doc_status', '审批状态', STATE_OPTS),
      select('receiving_status', '收货进度', RECEIVING_AXIS),
      select('invoice_status', '发票进度', INVOICE_AXIS),
      input('approved_by', '审批人'), date('approved_at', '生效日'),
    ],
  },
  {
    name: 'pur_order_lines', title: '采购订单行', fields: [
      belongsTo('order', '采购订单', 'pur_orders', 'order_id', 'code'),
      belongsTo('product', '物料', 'hub_inv_products', 'product_id'),
      number('qty', '数量'), number('unit_price', '单价'), number('qty_received', '已收数量'),
    ],
  },
  {
    name: 'pur_invoices', title: '采购发票', titleField: 'code', fields: [
      input('code', '发票编号'), belongsTo('po', '采购订单', 'pur_orders', 'po_id', 'code'),
      input('invoice_no', '发票号'), number('invoice_amount', '发票金额'), number('qty_billed', '开票数量'),
      date('billed_at', '开票日期'),
      select('match_result', '匹配结果', MATCH_RESULT), textarea('match_note', '匹配说明'),
    ],
  },
  {
    name: 'pur_payments', title: '付款申请', titleField: 'code', fields: [
      input('code', '付款单号'), belongsTo('invoice', '发票', 'pur_invoices', 'invoice_id', 'code'),
      number('amount', '金额'), date('pay_date', '付款日期'), select('pay_method', '付款方式', PAY_METHOD),
      select('doc_status', '审批状态', PAY_STATUS), input('approved_by', '审批人'), date('approved_at', '生效日'),
    ],
  },
]

/** The two wms_receipts columns B3 adds (here, after pur_orders exists — see the module docs). */
const RECEIPT_FIELDS: ReadonlyArray<object> = [
  belongsTo('po', '采购订单', 'pur_orders', 'po_id', 'code'),
  select('iqc_status', 'IQC 状态', IQC_STATUS),
]

/**
 * The six gate rows (downstream → upstream; the engine + nb_create both read
 * wfl_gate_configs). Every downstream column stores the upstream row id, so
 * upstream_ref_field stays null (the id path) — a code-ref gate would filter
 * the upstream's string code column by a number and 500.
 */
const GATES: ReadonlyArray<Record<string, unknown>> = [
  { downstream_collection: 'pur_rfqs', upstream_collection: 'pur_requests', upstream_field: 'pr_id', upstream_ref_field: null, upstream_label: '采购申请', required_status: 'approved' },
  { downstream_collection: 'pur_orders', upstream_collection: 'srm_suppliers', upstream_field: 'supplier_id', upstream_ref_field: null, upstream_label: '供应商', upstream_state_field: 'lifecycle_status', required_status: 'qualified,preferred' },
  { downstream_collection: 'pur_orders', upstream_collection: 'pur_rfqs', upstream_field: 'rfq_id', upstream_ref_field: null, upstream_label: '询价单', required_status: 'approved' },
  { downstream_collection: 'pur_invoices', upstream_collection: 'pur_orders', upstream_field: 'po_id', upstream_ref_field: null, upstream_label: '采购订单', required_status: 'approved' },
  { downstream_collection: 'pur_payments', upstream_collection: 'pur_invoices', upstream_field: 'invoice_id', upstream_ref_field: null, upstream_label: '发票', upstream_state_field: 'match_result', required_status: 'confirmed' },
  { downstream_collection: 'wms_receipts', upstream_collection: 'pur_orders', upstream_field: 'po_id', upstream_ref_field: null, upstream_label: '采购订单', required_status: 'approved' },
]

const MENU_GROUP = { title: '采购管理', icon: 'ShoppingOutlined' }

// ─── REST helpers ───

async function rowsOf(token: string, collection: string, pageSize = 500): Promise<Array<Record<string, any>>> {
  const rows = await dataOf(token, 'GET', `/api/${collection}:list?pageSize=${pageSize}`) as Array<Record<string, any>> | null
  return rows ?? []
}

/** The next code in a PREFIX-YYYY-NNNN series over the existing rows. */
function nextCode(rows: ReadonlyArray<Record<string, any>>, field: string, prefix: string): string {
  const year = new Date().getFullYear()
  const pattern = new RegExp(`^${prefix}-${String(year)}-(\\d{4})$`)
  let max = 0
  for (const row of rows) {
    const value = row[field]
    if (typeof value !== 'string') continue
    const suffix = Number(pattern.exec(value)?.[1])
    if (Number.isInteger(suffix) && suffix > max) max = suffix
  }
  return `${prefix}-${String(year)}-${String(max + 1).padStart(4, '0')}`
}

/** One REST-backed NocoIO the approval-engine functions run over. */
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

/** Run one sibling script (the h5 posting engine CLI) as a child, failing loud on a non-zero exit. */
function runScript(script: string, args: readonly string[]): void {
  const result = spawnSync('node', ['--import', 'tsx/esm', join(here, script), ...args], { stdio: 'inherit' })
  if (result.status !== 0) {
    throw new Error(`${script} ${args.join(' ')} failed (exit ${String(result.status)})`)
  }
}

// ─── structural steps ───

async function ensureCollections(token: string): Promise<void> {
  for (const collection of COLLECTIONS) {
    const existing = await dataOf(token, 'GET', `/api/collections/${collection.name}`)
    if (existing !== null) {
      console.log(`nocobase-w3: collection ${collection.name} exists (kept)`)
      continue
    }
    await dataOf(token, 'POST', '/api/collections:create', { name: collection.name, title: collection.title, ...(collection.titleField === undefined ? {} : { titleField: collection.titleField }), fields: collection.fields })
    console.log(`nocobase-w3: collection ${collection.name} created`)
  }
}

/** Add wms_receipts.po_id / iqc_status when missing (pur_orders must already exist). */
async function ensureReceiptColumns(token: string): Promise<void> {
  const fields = await dataOf(token, 'GET', `/api/fields:list?filter=${encodeURIComponent(JSON.stringify({ collectionName: { $eq: 'wms_receipts' } }))}&pageSize=200`) as Array<{ name?: string }> | null
  const names = new Set((fields ?? []).map(field => field.name))
  for (const field of RECEIPT_FIELDS) {
    const name = (field as { name: string }).name
    if (names.has(name)) {
      console.log(`nocobase-w3: wms_receipts.${name} exists (kept)`)
      continue
    }
    await dataOf(token, 'POST', '/api/fields:create', { collectionName: 'wms_receipts', ...field })
    console.log(`nocobase-w3: wms_receipts.${name} added`)
  }
  const zones = await rowsOf(token, 'wms_zones')
  if (!zones.some(zone => zone.code === QUARANTINE_ZONE_CODE)) {
    throw new Error(`待检区 ${QUARANTINE_ZONE_CODE} 不存在——先跑 nocobase-h5-wms.mts 补种子（B3 收货分流依赖待检区）`)
  }
}

async function ensureFlows(token: string): Promise<void> {
  // W2-B5: the demo approver user and the config-note audit column must
  // exist before the flow seeds reference them (the engine's
  // approver-existence check reads users; seedDocFlow writes config_note).
  await ensureApproverUsers(token)
  await ensureFlowConfigNoteColumn(token)
  const io = tokenIO(token)
  await seedDocFlow(io, 'pur_requests', '采购申请审批')
  await seedDocFlow(io, 'pur_rfqs', '询价单审批')
  // W2-B5: the configured flow — amount_threshold 200000, a two-person
  // manager tier (either may act), invoice_match_tolerance 0.1 — rides the
  // flow row's extras (PLAN D7: the config seat is the data row, not
  // cordis.yml; approval-engine is a scripts-side process, not a plugin).
  await seedDocFlow(io, 'pur_orders', '采购订单审批', {
    amountField: 'amount', amountThreshold: 200_000, invoiceMatchTolerance: 0.1,
    approverMap: { manager: ['admin', 'quality_lead'], gm: 'admin' },
  })
  await seedDocFlow(io, 'pur_payments', '付款申请审批', { amountField: 'amount' })
}

/**
 * The demo approver users the seeded maps name. The W-round maps have
 * referenced `admin` as a plain string since B1 (the super admin of this
 * snapshot is `nocobase`, so no users row ever carried that username); the
 * engine's fail-loud approver-existence check now requires every mapped
 * name to exist, so both `admin` and `quality_lead` land as real users.
 */
async function ensureApproverUsers(token: string): Promise<void> {
  const users = await rowsOf(token, 'users')
  const missing: ReadonlyArray<[string, string, string]> = [
    ['admin', '管理员（审批演示）', 'Admin#2026'],
    ['quality_lead', '质量主管', 'Quality#2026'],
  ]
  for (const [username, nickname, password] of missing) {
    if (users.some(row => row.username === username)) continue
    await dataOf(token, 'POST', '/api/users:create', {
      username, nickname, email: `${username}@w2b5.demo`, password,
    })
    console.log(`nocobase-w3: ${username} demo approver user created (W2-B5 tier)`)
  }
}

/** The W2-B5 wfl_flow_configs.config_note audit column (who/when/old→new on every seeded config change). */
async function ensureFlowConfigNoteColumn(token: string): Promise<void> {
  const fields = await dataOf(token, 'GET', `/api/fields:list?filter=${encodeURIComponent(JSON.stringify({ collectionName: { $eq: 'wfl_flow_configs' } }))}&pageSize=200`) as Array<{ name?: string }> | null
  if ((fields ?? []).some(field => field.name === 'config_note')) return
  await dataOf(token, 'POST', '/api/fields:create', { collectionName: 'wfl_flow_configs', ...textarea('config_note', '配置变更留痕') })
  console.log('nocobase-w3: wfl_flow_configs.config_note audit column added (W2-B5)')
}

async function ensureGates(token: string): Promise<void> {
  const gates = await rowsOf(token, 'wfl_gate_configs')
  let added = 0
  let repaired = 0
  for (const gate of GATES) {
    const existing = gates.find(row =>
      row.downstream_collection === gate.downstream_collection
      && row.upstream_collection === gate.upstream_collection
      && row.upstream_field === gate.upstream_field)
    if (existing === undefined) {
      await dataOf(token, 'POST', '/api/wfl_gate_configs:create', { ...gate })
      added += 1
      continue
    }
    // Repair a drifted row (the first seed rode upstream_ref_field='code',
    // which 500s on the numeric id refs the chain writes).
    const drifted = (existing.upstream_ref_field ?? null) !== (gate.upstream_ref_field ?? null)
      || (existing.upstream_state_field ?? null) !== (gate.upstream_state_field ?? null)
      || existing.required_status !== gate.required_status
    if (drifted) {
      await dataOf(token, 'POST', `/api/wfl_gate_configs:update?filterByTk=${existing.id}`, {
        upstream_ref_field: gate.upstream_ref_field, upstream_state_field: gate.upstream_state_field, required_status: gate.required_status,
      })
      repaired += 1
    }
  }
  console.log(`nocobase-w3: gate rows ${added > 0 ? `+${added} of ${GATES.length}` : `all ${GATES.length} in place`}${repaired > 0 ? ` (${repaired} repaired to id-ref)` : ''}`)
}

/** The supplier rows the RFQ seeds allocate (qualified/preferred, name-ordered for determinism). */
async function qualifiedSuppliers(token: string, count: number): Promise<Array<Record<string, any>>> {
  const suppliers = (await rowsOf(token, 'srm_suppliers'))
    .filter(row => row.lifecycle_status === 'qualified' || row.lifecycle_status === 'preferred')
    .sort((a, b) => String(a.name).localeCompare(String(b.name), 'zh-Hans-CN'))
  if (suppliers.length < count) {
    throw new Error(`合格供方不足：询价演示需要 ${count} 家，srm_suppliers 里 qualified/preferred 只有 ${suppliers.length} 家（先跑 nocobase-h4-srm.mts / nocobase-w2-supplier.mts）`)
  }
  return suppliers.slice(0, count)
}

async function seedRows(token: string): Promise<void> {
  const year = new Date().getFullYear()
  const suppliers = await qualifiedSuppliers(token, 3)
  const products = await rowsOf(token, 'hub_inv_products', 200)
  const product = products.find(row => row.sku === 'FD-SOY-500')
  if (product === undefined) throw new Error('hub_inv_products 缺 FD-SOY-500（先跑 the all chain 补 hub 种子）')
  const productId = Number(product.id)
  const today = new Date().toISOString().slice(0, 10)
  const iso = (offsetDays: number): string => new Date(Date.now() + offsetDays * 86_400_000).toISOString().slice(0, 10)

  const pr1Code = `PR-${String(year)}-0001`
  const pr2Code = `PR-${String(year)}-0002`
  const rfq1Code = `RFQ-${String(year)}-0001`
  const po1Code = `PO-${String(year)}-0001`
  const po2Code = `PO-${String(year)}-0002`

  /** Idempotent create keyed by an explicit business key; null when the row already exists. */
  const upsert = async (collection: string, key: string, values: Record<string, unknown>): Promise<Record<string, any> | null> => {
    const rows = await rowsOf(token, collection)
    const existing = rows.find(row => seedKeyOf(row) === key)
    if (existing !== undefined) return null
    return await dataOf(token, 'POST', `/api/${collection}:create`, values) as Record<string, any> | null
  }

  const pr1 = await upsert('pur_requests', `code:${pr1Code}`, {
    code: pr1Code, requester: '陈立群', department: '生产部',
    need_date: iso(21), reason: '十月黄豆酱油生产备料（链路演示主请购）', total_est: 128_000, doc_status: 'approved',
  })
  await upsert('pur_requests', `code:${pr2Code}`, {
    code: pr2Code, requester: '李贺', department: '品控部',
    need_date: iso(30), reason: '化验室耗材补充（负例素材：草稿未审批）', total_est: 6_800, doc_status: 'draft',
  })
  const pr1Id = Number((pr1 ?? (await rowsOf(token, 'pur_requests')).find(row => row.code === pr1Code))?.id)
  await upsert('pur_request_lines', `refs:${pr1Id}:${productId}`, {
    request: { id: pr1Id }, product: { id: productId },
    qty: 1000, uom: '桶', est_price: 126,
  })
  const rfq1 = await upsert('pur_rfqs', `code:${rfq1Code}`, {
    code: rfq1Code, pr: { id: pr1Id },
    deadline: iso(5), doc_status: 'approved',
  })
  const rfq1Id = Number((rfq1 ?? (await rowsOf(token, 'pur_rfqs')).find(row => row.code === rfq1Code))?.id)
  for (const supplier of suppliers) {
    await upsert('pur_rfq_suppliers', `refs:${rfq1Id}:${String(supplier.id)}`, {
      rfq: { id: rfq1Id }, supplier: { id: Number(supplier.id) },
    })
  }
  // Three quotes over the winning-price ladder; the demo chain awards the lowest.
  const prices = [120, 125, 128]
  for (let index = 0; index < suppliers.length; index += 1) {
    const supplier = suppliers[index]
    if (supplier === undefined) continue
    await upsert('pur_quotes', `refs:${rfq1Id}:${String(supplier.id)}`, {
      rfq: { id: rfq1Id }, supplier: { id: Number(supplier.id) }, product: { id: productId },
      qty: 1000, unit_price: prices[index], lead_time_days: 7 + index * 2, valid_until: iso(14),
      is_won: false, status: 'submitted',
    })
  }
  const po1 = await upsert('pur_orders', `code:${po1Code}`, {
    code: po1Code, supplier: { id: Number(suppliers[0]?.id) },
    amount: 36_000, currency: 'CNY', need_date: iso(14), compare_note: '历史存量单（B1 时期种子，进度轴为空演示）',
    doc_status: 'approved', receiving_status: 'none', invoice_status: 'no_invoice',
    approved_by: 'admin', approved_at: iso(-3),
  })
  const po1Id = Number((po1 ?? (await rowsOf(token, 'pur_orders')).find(row => row.code === po1Code))?.id)
  await upsert('pur_order_lines', `refs:${po1Id}:${productId}`, {
    order: { id: po1Id }, product: { id: productId },
    qty: 300, unit_price: 120, qty_received: 0,
  })
  const po2 = await upsert('pur_orders', `code:${po2Code}`, {
    code: po2Code, supplier: { id: Number(suppliers[1]?.id ?? suppliers[0]?.id) },
    amount: 9_600, currency: 'CNY', need_date: iso(28), compare_note: '负例素材：草稿未审批，收货应被卡口拒绝',
    doc_status: 'draft', receiving_status: 'none', invoice_status: 'no_invoice',
  })
  const po2Id = Number((po2 ?? (await rowsOf(token, 'pur_orders')).find(row => row.code === po2Code))?.id)
  await upsert('pur_order_lines', `refs:${po2Id}:${productId}`, {
    order: { id: po2Id }, product: { id: productId },
    qty: 80, unit_price: 120, qty_received: 0,
  })
  // One unposted PO-sourced receipt (the quarantine demo posts it on demand).
  await upsert('wms_receipts', 'receipt:RCV-B3-DEMO-1', {
    receipt_no: 'RCV-B3-DEMO-1', receipt_type: 'purchase',
    supplier: { id: Number(suppliers[0]?.id) }, po: { id: po1Id },
    product: { id: productId }, lot_no: 'SOY-W3-DEMO-01', qty: 120, status: 'pending', iqc_status: 'pending',
    note: `B3 种子收货链（挂 ${po1Code}；postReceipt 落 ${QUARANTINE_ZONE_CODE} 待检区）`, today,
  })
  console.log('nocobase-w3: seeds in place (2 PR / 1 RFQ / 3 allocations / 3 quotes / 2 PO / 1 receipt)')
}

/** The one business key a seeded row carries: its code, its receipt_no, or a composite of the two refs. */
function seedKeyOf(row: Record<string, any>): string {
  if (typeof row.code === 'string' && row.code !== '') return `code:${row.code}`
  if (typeof row.receipt_no === 'string' && row.receipt_no !== '') return `receipt:${row.receipt_no}`
  return `refs:${String(row.request_id ?? row.rfq_id ?? row.order_id ?? '')}:${String(row.supplier_id ?? row.product_id ?? '')}`
}

// ─── the seven 采购管理 v2 pages (E1 table spine, multi-block capable) ───

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
    title: '采购申请', icon: 'FileTextOutlined', blocks: [
      {
        heading: '请购单', collection: 'pur_requests',
        columns: [
          { name: 'code', title: '申请单号', kind: 'input' },
          { name: 'requester', title: '申请人', kind: 'input' },
          { name: 'department', title: '部门', kind: 'input' },
          { name: 'need_date', title: '需求日期', kind: 'date' },
          { name: 'total_est', title: '预估总额', kind: 'number' },
          { name: 'doc_status', title: '审批状态', kind: 'select', options: PR_STATUS },
        ],
        formFields: [
          { name: 'code', title: '申请单号', kind: 'input', required: true },
          { name: 'requester', title: '申请人', kind: 'input' },
          { name: 'department', title: '部门', kind: 'input' },
          { name: 'need_date', title: '需求日期', kind: 'date' },
          { name: 'reason', title: '申请理由', kind: 'input' },
          { name: 'total_est', title: '预估总额', kind: 'number' },
          { name: 'doc_status', title: '审批状态', kind: 'select', options: PR_STATUS },
        ],
      },
      {
        heading: '请购明细', collection: 'pur_request_lines',
        columns: [
          { name: 'request', title: '请购单', kind: 'm2o' },
          { name: 'product', title: '物料', kind: 'm2o' },
          { name: 'qty', title: '数量', kind: 'number' },
          { name: 'uom', title: '单位', kind: 'input' },
          { name: 'est_price', title: '预估单价', kind: 'number' },
        ],
        formFields: [
          { name: 'request', title: '请购单', kind: 'm2o', required: true },
          { name: 'product', title: '物料', kind: 'm2o', required: true },
          { name: 'qty', title: '数量', kind: 'number' },
          { name: 'uom', title: '单位', kind: 'input' },
          { name: 'est_price', title: '预估单价', kind: 'number' },
        ],
      },
    ],
  },
  {
    title: '询价管理', icon: 'MailOutlined', blocks: [
      {
        heading: '询价单', collection: 'pur_rfqs',
        columns: [
          { name: 'code', title: '询价单号', kind: 'input' },
          { name: 'pr', title: '来源请购', kind: 'm2o' },
          { name: 'deadline', title: '报价截止', kind: 'date' },
          { name: 'doc_status', title: '审批状态', kind: 'select', options: RFQ_STATUS },
        ],
        formFields: [
          { name: 'code', title: '询价单号', kind: 'input', required: true },
          { name: 'pr', title: '来源请购', kind: 'm2o' },
          { name: 'deadline', title: '报价截止', kind: 'date' },
          { name: 'doc_status', title: '审批状态', kind: 'select', options: RFQ_STATUS },
        ],
      },
      {
        heading: '供应商分配', collection: 'pur_rfq_suppliers',
        columns: [
          { name: 'rfq', title: '询价单', kind: 'm2o' },
          { name: 'supplier', title: '供应商', kind: 'm2o' },
          { name: 'sent_at', title: '发出日期', kind: 'date' },
        ],
        formFields: [
          { name: 'rfq', title: '询价单', kind: 'm2o', required: true },
          { name: 'supplier', title: '供应商', kind: 'm2o', required: true },
          { name: 'sent_at', title: '发出日期', kind: 'date' },
        ],
      },
    ],
  },
  {
    title: '供应商报价', icon: 'ProfileOutlined', blocks: [
      {
        heading: '报价录入', collection: 'pur_quotes',
        columns: [
          { name: 'rfq', title: '询价单', kind: 'm2o' },
          { name: 'supplier', title: '供应商', kind: 'm2o' },
          { name: 'product', title: '物料', kind: 'm2o' },
          { name: 'qty', title: '数量', kind: 'number' },
          { name: 'unit_price', title: '单价', kind: 'number' },
          { name: 'lead_time_days', title: '交期(天)', kind: 'number' },
          { name: 'valid_until', title: '有效期至', kind: 'date' },
          { name: 'is_won', title: '中标', kind: 'boolean' },
          { name: 'status', title: '状态', kind: 'select', options: QUOTE_STATUS },
        ],
        formFields: [
          { name: 'rfq', title: '询价单', kind: 'm2o', required: true },
          { name: 'supplier', title: '供应商', kind: 'm2o', required: true },
          { name: 'product', title: '物料', kind: 'm2o' },
          { name: 'qty', title: '数量', kind: 'number' },
          { name: 'unit_price', title: '单价', kind: 'number' },
          { name: 'lead_time_days', title: '交期(天)', kind: 'number' },
          { name: 'valid_until', title: '有效期至', kind: 'date' },
          { name: 'is_won', title: '中标', kind: 'boolean' },
          { name: 'status', title: '状态', kind: 'select', options: QUOTE_STATUS },
        ],
      },
    ],
  },
  {
    title: '比价表', icon: 'TableOutlined', blocks: [
      {
        heading: '全部报价（按询价单比价）', collection: 'pur_quotes',
        columns: [
          { name: 'rfq', title: '询价单', kind: 'm2o' },
          { name: 'supplier', title: '供应商', kind: 'm2o' },
          { name: 'qty', title: '数量', kind: 'number' },
          { name: 'unit_price', title: '单价', kind: 'number' },
          { name: 'lead_time_days', title: '交期(天)', kind: 'number' },
          { name: 'status', title: '状态', kind: 'select', options: QUOTE_STATUS },
        ],
      },
      {
        heading: '授标结果（中标报价）', collection: 'pur_quotes', defaultFilter: { is_won: true },
        columns: [
          { name: 'rfq', title: '询价单', kind: 'm2o' },
          { name: 'supplier', title: '中标供应商', kind: 'm2o' },
          { name: 'unit_price', title: '中标单价', kind: 'number' },
          { name: 'is_won', title: '中标', kind: 'boolean' },
        ],
      },
    ],
  },
  {
    title: '采购订单', icon: 'ShoppingCartOutlined', blocks: [
      {
        heading: '订单（三轴状态）', collection: 'pur_orders',
        columns: [
          { name: 'code', title: '订单号', kind: 'input' },
          { name: 'supplier', title: '供应商', kind: 'm2o' },
          { name: 'rfq', title: '来源询价', kind: 'm2o' },
          { name: 'amount', title: '金额', kind: 'number' },
          { name: 'need_date', title: '需求日期', kind: 'date' },
          { name: 'doc_status', title: '审批状态', kind: 'select', options: STATE_OPTS },
          { name: 'receiving_status', title: '收货进度', kind: 'select', options: RECEIVING_AXIS },
          { name: 'invoice_status', title: '发票进度', kind: 'select', options: INVOICE_AXIS },
        ],
        formFields: [
          { name: 'code', title: '订单号', kind: 'input', required: true },
          { name: 'supplier', title: '供应商', kind: 'm2o', required: true },
          { name: 'rfq', title: '来源询价', kind: 'm2o' },
          { name: 'amount', title: '金额', kind: 'number' },
          { name: 'currency', title: '币种', kind: 'input' },
          { name: 'need_date', title: '需求日期', kind: 'date' },
          { name: 'compare_note', title: '比价依据', kind: 'input' },
          { name: 'doc_status', title: '审批状态', kind: 'select', options: STATE_OPTS },
          { name: 'receiving_status', title: '收货进度', kind: 'select', options: RECEIVING_AXIS },
          { name: 'invoice_status', title: '发票进度', kind: 'select', options: INVOICE_AXIS },
        ],
      },
      {
        heading: '订单明细（收货进度列）', collection: 'pur_order_lines',
        columns: [
          { name: 'order', title: '采购订单', kind: 'm2o' },
          { name: 'product', title: '物料', kind: 'm2o' },
          { name: 'qty', title: '数量', kind: 'number' },
          { name: 'unit_price', title: '单价', kind: 'number' },
          { name: 'qty_received', title: '已收数量', kind: 'number' },
        ],
        formFields: [
          { name: 'order', title: '采购订单', kind: 'm2o', required: true },
          { name: 'product', title: '物料', kind: 'm2o', required: true },
          { name: 'qty', title: '数量', kind: 'number' },
          { name: 'unit_price', title: '单价', kind: 'number' },
          { name: 'qty_received', title: '已收数量', kind: 'number' },
        ],
      },
    ],
  },
  {
    title: '发票匹配', icon: 'AuditOutlined', blocks: [
      {
        heading: '采购发票（三方匹配）', collection: 'pur_invoices',
        columns: [
          { name: 'code', title: '发票编号', kind: 'input' },
          { name: 'po', title: '采购订单', kind: 'm2o' },
          { name: 'invoice_no', title: '发票号', kind: 'input' },
          { name: 'invoice_amount', title: '发票金额', kind: 'number' },
          { name: 'qty_billed', title: '开票数量', kind: 'number' },
          { name: 'match_result', title: '匹配结果', kind: 'select', options: MATCH_RESULT },
          { name: 'match_note', title: '匹配说明', kind: 'input' },
        ],
        formFields: [
          { name: 'code', title: '发票编号', kind: 'input', required: true },
          { name: 'po', title: '采购订单', kind: 'm2o', required: true },
          { name: 'invoice_no', title: '发票号', kind: 'input' },
          { name: 'invoice_amount', title: '发票金额', kind: 'number' },
          { name: 'qty_billed', title: '开票数量', kind: 'number' },
          { name: 'billed_at', title: '开票日期', kind: 'date' },
          { name: 'match_result', title: '匹配结果', kind: 'select', options: MATCH_RESULT },
          { name: 'match_note', title: '匹配说明', kind: 'input' },
        ],
      },
    ],
  },
  {
    title: '付款申请', icon: ' DollarOutlined', blocks: [
      {
        heading: '付款单（发票确认后）', collection: 'pur_payments',
        columns: [
          { name: 'code', title: '付款单号', kind: 'input' },
          { name: 'invoice', title: '发票', kind: 'm2o' },
          { name: 'amount', title: '金额', kind: 'number' },
          { name: 'pay_date', title: '付款日期', kind: 'date' },
          { name: 'pay_method', title: '付款方式', kind: 'select', options: PAY_METHOD },
          { name: 'doc_status', title: '审批状态', kind: 'select', options: PAY_STATUS },
        ],
        formFields: [
          { name: 'code', title: '付款单号', kind: 'input', required: true },
          { name: 'invoice', title: '发票', kind: 'm2o', required: true },
          { name: 'amount', title: '金额', kind: 'number' },
          { name: 'pay_date', title: '付款日期', kind: 'date' },
          { name: 'pay_method', title: '付款方式', kind: 'select', options: PAY_METHOD },
          { name: 'doc_status', title: '审批状态', kind: 'select', options: PAY_STATUS },
        ],
      },
    ],
  },
]

const listModels = (token: string): Promise<FlowModelRow[]> => listFlowModels(token, 'W3')
const listAllRoutes = (token: string): Promise<RouteRow[]> => listRoutes(token, 'W3')

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
  const itemUids = fields.map(() => withN17Prefix('w3pur', 'i'))
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
    console.log(`nocobase-w3: menu group "${MENU_GROUP.title}" exists (kept)`)
    return { id: existing.id }
  }
  const row = await dataOf(token, 'POST', '/api/desktopRoutes:create', { title: MENU_GROUP.title, icon: MENU_GROUP.icon, type: 'group' })
  console.log(`nocobase-w3: menu group "${MENU_GROUP.title}" created`)
  return { id: Number(row.id) }
}

/** Whether the page already carries a w3pur table block for one collection. */
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
    console.log(`nocobase-w3: v2 page "${spec.title}" exists (kept)`)
    return
  }
  if ((await listAllRoutes(token)).some(row => row.title === spec.title && row.type === 'page')) {
    throw new Error(`a v1 page named "${spec.title}" already exists; rename it first`)
  }
  const routeUid = withN17Prefix('w3pur', '')
  const page = await dataOf(token, 'POST', '/api/desktopRoutes:create', { title: spec.title, icon: spec.icon, type: 'flowPage', parentId: groupId, sort, schemaUid: routeUid })
  const tabUid = withN17Prefix('w3pur', 't')
  await dataOf(token, 'POST', '/api/desktopRoutes:create', { title: '', type: 'tabs', parentId: page.id, schemaUid: tabUid, tabSchemaName: withN17Prefix('w3pur', 'ts') })

  const save = (model: Record<string, unknown>) => dataOf(token, 'POST', '/api/flowModels:save', model)
  await save({ uid: routeUid, schema: { use: 'RouteModel' } })
  await save({ uid: tabUid, schema: { use: 'RouteModel' } })
  const pageUid = withN17Prefix('w3pur', 'p')
  await save({ uid: pageUid, parentId: routeUid, subKey: 'page', subType: 'object', use: 'RootPageModel', props: { title: spec.title, displayTitle: true, enableTabs: false }, stepParams: { pageSettings: { general: { title: spec.title, displayTitle: true, enableTabs: false } } } })
  const gridUid = withN17Prefix('w3pur', 'g')
  await save({ uid: gridUid, parentId: tabUid, subKey: 'grid', subType: 'object', use: 'BlockGridModel', props: {}, filterManager: [] })

  let blockIndex = 0
  for (const block of spec.blocks) {
    blockIndex += 1
    const tableUid = withN17Prefix('w3pur', 'tb')
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
      const uid = withN17Prefix('w3pur', 'c')
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
        uid: withN17Prefix('w3pur', 'rf'), parentId: tableUid, subKey: 'actions', subType: 'array', sortIndex: 2, use: 'RefreshActionModel',
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
      uid: withN17Prefix('w3pur', 'fa'), parentId: tableUid, subKey: 'actions', subType: 'array', sortIndex: 1,
      use: 'FilterActionModel', props: {},
      stepParams: { buttonSettings: { general: { title: '{{t("Filter")}}' } } },
    })
    await save({
      uid: withN17Prefix('w3pur', 'an'), parentId: tableUid, subKey: 'actions', subType: 'array', sortIndex: 2, use: 'AddNewActionModel', props: {},
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
      uid: withN17Prefix('w3pur', 'rf'), parentId: tableUid, subKey: 'actions', subType: 'array', sortIndex: 3, use: 'RefreshActionModel',
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
  console.log(`nocobase-w3: v2 page "${spec.title}" created (/admin/${routeUid}) with ${spec.blocks.length} block(s)`)
}

// ─── business chain verbs ───

/** Expect one async body to refuse; return its message (fail loud when it resolves). */
async function expectRefusal(label: string, body: () => Promise<unknown>): Promise<string> {
  try {
    await body()
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.log(`nocobase-w3: [chain] 卡口负例 ✓ ${label} → ${message.slice(0, 90)}`)
    return message
  }
  throw new Error(`卡口负例未拦截：${label}（本应被拒绝却成功了）`)
}

/** RFQ 发出: approved → sent (a business-advance write; approvals stay engine-owned). */
async function sendRfq(token: string, code: string): Promise<void> {
  const rfqs = await rowsOf(token, 'pur_rfqs')
  const rfq = rfqs.find(row => row.code === code)
  if (rfq === undefined) throw new Error(`no rfq ${code}`)
  if (rfq.doc_status === 'sent' || rfq.doc_status === 'closed') {
    console.log(`nocobase-w3: rfq ${code} already ${String(rfq.doc_status)} (kept)`)
    return
  }
  if (rfq.doc_status !== 'approved') throw new Error(`询价单 ${code} 状态为 ${String(rfq.doc_status)}，仅已生效的询价可发出`)
  const io = tokenIO(token)
  const moved = await io.updateWhere('pur_rfqs', { id: rfq.id, doc_status: 'approved' }, { doc_status: 'sent' })
  if (moved === 0) throw new Error(`询价单 ${code} 状态并发变化（未发出）`)
  const today = new Date().toISOString().slice(0, 10)
  const allocations = (await rowsOf(token, 'pur_rfq_suppliers')).filter(row => Number(row.rfq_id) === Number(rfq.id))
  for (const allocation of allocations) {
    if (allocation.sent_at === null || allocation.sent_at === undefined) {
      await dataOf(token, 'POST', `/api/pur_rfq_suppliers:update?filterByTk=${allocation.id}`, { sent_at: today })
    }
  }
  console.log(`nocobase-w3: rfq ${code} sent (${allocations.length} 家分配回填 sent_at)`)
}

/**
 * 比价授标: mark the winning quote, generate the PO (+line) from it, close
 * RFQ/PR. The winner is the lowest submitted quote; an explicit winnerQuoteId
 * (the quote row's id — the collection carries no code column) overrides the
 * ladder (must be a submitted quote of this RFQ — the CLI's --quote).
 */
async function awardRfq(token: string, code: string, winnerQuoteId?: string): Promise<{ poCode: string, poId: number }> {
  const rfqs = await rowsOf(token, 'pur_rfqs')
  const rfq = rfqs.find(row => row.code === code)
  if (rfq === undefined) throw new Error(`no rfq ${code}`)
  if (rfq.doc_status !== 'sent' && rfq.doc_status !== 'approved' && rfq.doc_status !== 'closed') {
    throw new Error(`询价单 ${code} 状态为 ${String(rfq.doc_status)}，比价授标需已发出（sent；closed 为幂等重放）`)
  }
  const quotes = (await rowsOf(token, 'pur_quotes'))
    .filter(row => Number(row.rfq_id) === Number(rfq.id) && row.status === 'submitted')
    .sort((a, b) => Number(a.unit_price) - Number(b.unit_price))
  if (quotes.length < 2) throw new Error(`询价单 ${code} 有效报价不足两家（${quotes.length}），无法比价`)
  const winner = winnerQuoteId === undefined
    ? quotes[0]
    : quotes.find(row => String(row.id) === winnerQuoteId)
  if (winner === undefined) {
    throw new Error(winnerQuoteId === undefined
      ? `询价单 ${code} 无最低价报价`
      : `报价行 ${winnerQuoteId} 不是询价单 ${code} 的有效已提交报价（或不存在）`)
  }
  const wonAlready = quotes.some(row => row.is_won === true)
  const existingPos = (await rowsOf(token, 'pur_orders')).filter(row => Number(row.rfq_id) === Number(rfq.id))
  if (wonAlready && existingPos.length > 0) {
    const existing = existingPos[0]
    console.log(`nocobase-w3: rfq ${code} already awarded (PO ${String(existing?.code)} kept)`)
    return { poCode: String(existing?.code), poId: Number(existing?.id) }
  }
  // The comparison record: every quote's price ladder plus the award rationale.
  const suppliers = await rowsOf(token, 'srm_suppliers')
  const supplierName = (id: unknown): string => String(suppliers.find(row => Number(row.id) === Number(id))?.name ?? id)
  const ladder = quotes.map(row => `${supplierName(row.supplier_id)}@¥${String(row.unit_price)}`).join(' / ')
  const qty = Number(winner.qty ?? 0)
  const price = Number(winner.unit_price ?? 0)
  const poRows = await rowsOf(token, 'pur_orders')
  const poCode = nextCode(poRows, 'code', 'PO')
  const created = await dataOf(token, 'POST', '/api/pur_orders:create', {
    code: poCode, supplier: { id: Number(winner.supplier_id) }, rfq: { id: Number(rfq.id) },
    amount: qty * price, currency: 'CNY',
    need_date: new Date(Date.now() + 21 * 86_400_000).toISOString().slice(0, 10),
    compare_note: `比价依据：${ladder}；最低价授标 ${supplierName(winner.supplier_id)}（¥${String(price)}×${String(qty)}）`,
    doc_status: 'draft', receiving_status: 'none', invoice_status: 'no_invoice',
  }) as { id: number }
  await dataOf(token, 'POST', '/api/pur_order_lines:create', {
    order: { id: Number(created.id) }, product: { id: Number(winner.product_id) },
    qty, unit_price: price, qty_received: 0,
  })
  await dataOf(token, 'POST', `/api/pur_quotes:update?filterByTk=${winner.id}`, { is_won: true })
  const io = tokenIO(token)
  await io.updateWhere('pur_rfqs', { id: rfq.id, doc_status: 'sent' }, { doc_status: 'closed' })
  if (rfq.pr_id !== null && rfq.pr_id !== undefined) {
    const moved = await io.updateWhere('pur_requests', { id: Number(rfq.pr_id), doc_status: 'approved' }, { doc_status: 'converted' })
    if (moved > 0) console.log(`nocobase-w3: pr #${String(rfq.pr_id)} converted (PO ${poCode} generated)`)
  }
  console.log(`nocobase-w3: rfq ${code} awarded → PO ${poCode} (amount ¥${String(qty * price)}; ladder ${ladder})`)
  return { poCode, poId: Number(created.id) }
}

/**
 * The pur_orders flow's three-way-match tolerance: the extras
 * invoice_match_tolerance key when present (a non-negative number; anything
 * else fails loud), the MATCH_TOLERANCE default when the key is absent.
 */
async function matchTolerance(io: NocoIO): Promise<number> {
  const flow = await loadFlow(io, 'pur_orders')
  const raw = flow.extras?.invoice_match_tolerance
  if (raw === undefined || raw === null) return MATCH_TOLERANCE
  if (typeof raw !== 'number' || !Number.isFinite(raw) || raw < 0) {
    throw new Error(`pur_orders 流 extras.invoice_match_tolerance 非法：${JSON.stringify(raw)}（应为非负数；删除该键回退缺省 ${String(MATCH_TOLERANCE)}）`)
  }
  return raw
}

/**
 * The three-way match (qty ≤ PO qty, |amount − Σlines(qty×price)| ≤ the
 * flow's tolerance — extras.invoice_match_tolerance, default
 * MATCH_TOLERANCE): both ok → matched, else exception (Odoo 口径: 不阻断，
 * 人工确认放行). Advances match_result draft/pending → matched/exception.
 */
async function matchInvoice(token: string, code: string): Promise<'matched' | 'exception'> {
  const invoices = await rowsOf(token, 'pur_invoices')
  const invoice = invoices.find(row => row.code === code)
  if (invoice === undefined) throw new Error(`no invoice ${code}`)
  if (invoice.match_result === 'confirmed') {
    // Replay: the original verdict rides the note (超容差 marks the exception path).
    const wasException = String(invoice.match_note ?? '').includes('超容差')
    console.log(`nocobase-w3: invoice ${code} already confirmed (kept; was ${wasException ? 'exception' : 'matched'})`)
    return wasException ? 'exception' : 'matched'
  }
  if (invoice.match_result === 'matched' || invoice.match_result === 'exception') {
    console.log(`nocobase-w3: invoice ${code} already ${String(invoice.match_result)} (kept; re-match after a draft reset)`)
    return invoice.match_result === 'matched' ? 'matched' : 'exception'
  }
  const lines = (await rowsOf(token, 'pur_order_lines')).filter(row => Number(row.order_id) === Number(invoice.po_id))
  if (lines.length === 0) throw new Error(`发票 ${code} 的采购订单无明细行，无法三方匹配`)
  const orderedQty = lines.reduce((sum, row) => sum + Number(row.qty ?? 0), 0)
  const expectedAmount = lines.reduce((sum, row) => sum + Number(row.qty ?? 0) * Number(row.unit_price ?? 0), 0)
  const qtyOk = Number(invoice.qty_billed ?? 0) <= orderedQty
  const delta = Math.abs(Number(invoice.invoice_amount ?? 0) - expectedAmount)
  const io = tokenIO(token)
  const tolerance = await matchTolerance(io)
  const amountOk = delta <= tolerance
  const result = qtyOk && amountOk ? 'matched' : 'exception'
  const note = `三方匹配：开票 ${String(invoice.qty_billed)}/${String(orderedQty)}（${qtyOk ? 'ok' : '超量'}）；金额 ¥${String(invoice.invoice_amount)} vs 订单 ¥${String(expectedAmount)}，差 ¥${delta.toFixed(2)}（容差 ¥${String(tolerance)}，${amountOk ? 'ok' : '超容差'}）`
  await dataOf(token, 'POST', `/api/pur_invoices:update?filterByTk=${invoice.id}`, { match_result: result, match_note: note })
  // The PO's invoice axis moves the moment a invoice registers against it.
  await io.updateWhere('pur_orders', { id: Number(invoice.po_id), invoice_status: 'no_invoice' }, { invoice_status: 'to_invoice' })
  console.log(`nocobase-w3: invoice ${code} match → ${result}（${note}）`)
  return result
}

/** 人工确认放行: matched/exception → confirmed (the payment gate opens). */
async function confirmInvoice(token: string, code: string): Promise<void> {
  const invoices = await rowsOf(token, 'pur_invoices')
  const invoice = invoices.find(row => row.code === code)
  if (invoice === undefined) throw new Error(`no invoice ${code}`)
  if (invoice.match_result === 'confirmed') {
    console.log(`nocobase-w3: invoice ${code} already confirmed (kept)`)
    return
  }
  if (invoice.match_result === 'draft' || invoice.match_result === 'pending') {
    throw new Error(`发票 ${code} 尚未匹配（${String(invoice.match_result)}），先 --match-invoice`)
  }
  const note = `${String(invoice.match_note ?? '')}；人工确认放行（${new Date().toISOString().slice(0, 10)}）`
  await dataOf(token, 'POST', `/api/pur_invoices:update?filterByTk=${invoice.id}`, { match_result: 'confirmed', match_note: note })
  const io = tokenIO(token)
  await io.updateWhere('pur_orders', { id: Number(invoice.po_id), invoice_status: 'to_invoice' }, { invoice_status: 'invoiced' })
  console.log(`nocobase-w3: invoice ${code} confirmed (PO invoice_status=invoiced)`)
}

/**
 * The W2-B5 threshold-routing demo pair (idempotent): PO-B5-A ¥150,000 —
 * one approval round on the configured 200k threshold, quality_lead acting
 * for the two-person manager tier — and PO-B5-B ¥250,000 — first approval
 * routes to the gm sign-off. The transition conditions, the two-row todo
 * expansion, and the records trail are the batch's psql对拍 objects.
 */
async function b5ApprovalDemo(token: string): Promise<void> {
  const io = tokenIO(token)
  const supplier = (await rowsOf(token, 'srm_suppliers'))
    .filter(row => row.lifecycle_status === 'qualified' || row.lifecycle_status === 'preferred')
    .sort((a, b) => String(a.name).localeCompare(b.name, 'zh-Hans-CN'))[0]
  if (supplier === undefined) throw new Error('W2-B5 演示需要至少一家合格供方（先跑 the all chain 补 SRM 种子）')
  const pos = await rowsOf(token, 'pur_orders')
  const upsertPo = async (code: string, amount: number, tier?: string): Promise<Record<string, any>> => {
    const existing = pos.find(row => row.code === code)
    if (existing !== undefined) return existing
    return await dataOf(token, 'POST', '/api/pur_orders:create', {
      code, supplier: { id: Number(supplier.id) }, amount, currency: 'CNY',
      need_date: new Date(Date.now() + 21 * 86_400_000).toISOString().slice(0, 10),
      compare_note: `W2-B5 阈值演示（extras.amount_threshold=200000；金额 ¥${String(amount)} ${amount > 200_000 ? '超限走两级' : '一审'}${tier ?? ''}）`,
      doc_status: 'draft', receiving_status: 'none', invoice_status: 'no_invoice',
    }) as Record<string, any>
  }
  const small = await upsertPo('PO-B5-A', 150_000)
  const large = await upsertPo('PO-B5-B', 250_000)
  /** The demo document's live state (re-read; a crashed earlier run may have left it mid-chain). */
  const stateOf = async (code: string, fallback: Record<string, any>): Promise<string> =>
    String(((await rowsOf(token, 'pur_orders')).find(row => row.code === code) ?? fallback).doc_status ?? 'draft')
  // ¥150,000 ≤ 200,000: one round, quality_lead acting for the manager tier.
  let smallState = await stateOf('PO-B5-A', small)
  if (smallState === 'draft' || smallState === 'rejected') {
    await submitForApproval(io, 'pur_orders', Number(small.id), '陈立群')
    smallState = 'pending'
  }
  if (smallState === 'pending') {
    const first = await act(io, 'pur_orders', Number(small.id), 'approve', 'quality_lead', 'W2-B5：15 万 ≤ 20 万阈值，一审生效')
    console.log(`nocobase-w3: [b5] PO-B5-A ¥150,000 → ${first.to_state}（quality_lead 一审；todos 两行已作废）`)
  }
  // ¥250,000 > 200,000: first approval routes to the gm sign-off.
  let largeState = await stateOf('PO-B5-B', large)
  if (largeState === 'draft' || largeState === 'rejected') {
    await submitForApproval(io, 'pur_orders', Number(large.id), '陈立群')
    largeState = 'pending'
  }
  if (largeState === 'pending') {
    const first = await act(io, 'pur_orders', Number(large.id), 'approve', 'quality_lead', 'W2-B5：25 万超阈值，报总经理加签')
    console.log(`nocobase-w3: [b5] PO-B5-B ¥250,000 一审 → ${first.to_state}`)
    largeState = first.to_state
  }
  if (largeState === 'pending_level2') {
    const second = await act(io, 'pur_orders', Number(large.id), 'approve', 'admin', 'W2-B5：总经理签核通过')
    console.log(`nocobase-w3: [b5] PO-B5-B 二审 → ${second.to_state}`)
  }
  // PO-B5-C: the todo-expansion witness — same 150k one-round walk; its
  // two-row tier expansion (admin+quality_lead, completed by quality_lead's
  // act) is what verify and the psql对拍 read.
  const witness = await upsertPo('PO-B5-C', 150_000, '；多审批人展开实证')
  let witnessState = await stateOf('PO-B5-C', witness)
  if (witnessState === 'draft' || witnessState === 'rejected') {
    await submitForApproval(io, 'pur_orders', Number(witness.id), '陈立群')
    witnessState = 'pending'
  }
  if (witnessState === 'pending') {
    const first = await act(io, 'pur_orders', Number(witness.id), 'approve', 'quality_lead', 'W2-B5：多审批人档任一人可审（quality_lead）')
    console.log(`nocobase-w3: [b5] PO-B5-C ¥150,000 → ${first.to_state}（todos 两行展开后由 quality_lead 作废）`)
  }
  console.log('nocobase-w3: [b5] threshold demo pair ready（条件串/todos 展开/records 留痕由 verify 与 psql 对拍复核）')
}

/** One payment request's full life: draft → submit → approve(s) → paid. */
async function payInvoice(token: string, code: string): Promise<void> {
  const payments = await rowsOf(token, 'pur_payments')
  const payment = payments.find(row => row.code === code)
  if (payment === undefined) throw new Error(`no payment ${code}`)
  if (payment.doc_status === 'paid') {
    console.log(`nocobase-w3: payment ${code} already paid (kept)`)
    return
  }
  const io = tokenIO(token)
  let current = String(payment.doc_status)
  if (current === 'draft' || current === 'rejected') {
    await submitForApproval(io, 'pur_payments', Number(payment.id), '陈立群')
    current = 'pending'
    console.log(`nocobase-w3: [chain] payment ${code} submitted (draft→pending)`)
  }
  while (current === 'pending' || current === 'pending_level2') {
    const result = await act(io, 'pur_payments', Number(payment.id), 'approve', 'admin', '付款审批（链路演示）')
    current = result.to_state
    console.log(`nocobase-w3: [chain] payment ${code} approve → ${result.to_state}`)
  }
  if (current !== 'approved') throw new Error(`付款 ${code} 审批未生效（${current}）`)
  const today = new Date().toISOString().slice(0, 10)
  await dataOf(token, 'POST', `/api/pur_payments:update?filterByTk=${payment.id}`, { doc_status: 'paid', pay_date: today })
  console.log(`nocobase-w3: [chain] payment ${code} paid（结算闭环，pay_date=${today}）`)
}

// ─── the end-to-end demo chain (04-b3 验收 checkbox 1:1) ───

async function demoChain(token: string): Promise<void> {
  const io = tokenIO(token)
  const year = new Date().getFullYear()
  const prs = await rowsOf(token, 'pur_requests')
  const pr1 = prs.find(row => row.code === `PR-${String(year)}-0001`)
  const pr2 = prs.find(row => row.code === `PR-${String(year)}-0002`)
  if (pr1 === undefined || pr2 === undefined) throw new Error('种子缺失：PR-0001/PR-0002（先跑本脚本主流程）')
  const rfq1 = (await rowsOf(token, 'pur_rfqs')).find(row => row.code === `RFQ-${String(year)}-0001`)
  if (rfq1 === undefined) throw new Error('种子缺失：RFQ-0001（先跑本脚本主流程）')
  const po2 = (await rowsOf(token, 'pur_orders')).find(row => row.code === `PO-${String(year)}-0002`)
  if (po2 === undefined) throw new Error('种子缺失：PO-0002（先跑本脚本主流程）')

  console.log('nocobase-w3: [chain] ══ 采购全链演示（PR→RFQ→比价→PO→收货→IQC→入库→发票→匹配→付款）══')

  // S1 卡口负例①：草稿 PR 不能发起询价。
  await expectRefusal('对草稿 PR 建 RFQ', () => enforceGates(io, 'pur_rfqs', { pr_id: Number(pr2.id) }))

  // S2 RFQ 发出（approved → sent；分配回填 sent_at）。
  await sendRfq(token, `RFQ-${String(year)}-0001`)

  // S3 报价在种子里（三家 submitted）；S4 比价授标 → 生成 PO（120,000 超限走两级）。
  const { poCode, poId } = await awardRfq(token, `RFQ-${String(year)}-0001`)

  // S5 PO 两级审批：submit → approve（>100k → pending_level2）→ approve → approved。
  // Idempotent replay: steps an earlier run already passed simply skip.
  let poState = String((await rowsOf(token, 'pur_orders')).find(row => row.id === poId)?.doc_status ?? 'draft')
  if (poState === 'draft' || poState === 'rejected') {
    await submitForApproval(io, 'pur_orders', poId, '陈立群')
    poState = 'pending'
    console.log(`nocobase-w3: [chain] PO ${poCode} submitted (draft→pending)`)
  }
  if (poState === 'pending') {
    const first = await act(io, 'pur_orders', poId, 'approve', 'admin', '金额超限，报总经理加签')
    poState = first.to_state
    console.log(`nocobase-w3: [chain] PO ${poCode} approve → ${first.to_state}（金额阈值路由）`)
    if (first.to_state !== 'pending_level2') throw new Error(`PO ${poCode} 金额应路由二级审批，实际 ${first.to_state}`)
  }
  if (poState === 'pending_level2') {
    const second = await act(io, 'pur_orders', poId, 'approve', 'admin', '总经理加签通过')
    poState = second.to_state
    console.log(`nocobase-w3: [chain] PO ${poCode} approve → ${second.to_state}（生效，可收货）`)
  }
  if (poState !== 'approved') throw new Error(`PO ${poCode} 二级审批未生效（${poState}）`)

  // S6 卡口负例②：未生效 PO 不能收货（draft PO-0002）。
  await expectRefusal('对草稿 PO 建收货单', () => enforceGates(io, 'wms_receipts', { po_id: Number(po2.id) }))

  // S7 收货①（800/1000）：过账落待检区（hold）。
  const receipts = await rowsOf(token, 'wms_receipts')
  const rc1Code = 'RCV-W3-CHAIN-1'
  if (!receipts.some(row => row.receipt_no === rc1Code)) {
    const po = (await rowsOf(token, 'pur_orders')).find(row => row.id === poId)
    const lines = (await rowsOf(token, 'pur_order_lines')).filter(row => Number(row.order_id) === poId)
    const line = lines[0]
    await dataOf(token, 'POST', '/api/wms_receipts:create', {
      receipt_no: rc1Code, receipt_type: 'purchase',
      supplier: { id: Number(po?.supplier_id) }, po: { id: poId },
      product: { id: Number(line?.product_id) }, lot_no: `SOY-W3-${new Date().toISOString().slice(0, 10).replaceAll('-', '')}-A`,
      qty: 800, status: 'pending', iqc_status: 'pending', note: `B3 链路收货①（${poCode} 800/1000 部分收货）`,
    })
  }
  await enforceGates(io, 'wms_receipts', { po_id: poId })
  console.log('nocobase-w3: [chain] 收货单 RCV-W3-CHAIN-1 过卡口（PO approved）✓')
  runScript('nocobase-h5-wms.mts', ['--post-receipt', rc1Code])

  // S7b 卡口负例③：IQC 未放行不能过账入库（release 应拒）。首跑用刚过账的
  // CHAIN-1；重放（CHAIN-1 已 closed）改用种子 RCV-B3-DEMO-1（post 到待检区，保持 pending）。
  let quarantineReceipt = rc1Code
  const rc1Now = (await rowsOf(token, 'wms_receipts')).find(row => row.receipt_no === rc1Code)
  if (rc1Now !== undefined && rc1Now.status === 'closed') {
    quarantineReceipt = 'RCV-B3-DEMO-1'
    const demo = (await rowsOf(token, 'wms_receipts')).find(row => row.receipt_no === quarantineReceipt)
    if (demo !== undefined && demo.status !== 'posted' && demo.status !== 'closed') {
      runScript('nocobase-h5-wms.mts', ['--post-receipt', quarantineReceipt])
    }
    if ((await rowsOf(token, 'wms_receipts')).find(row => row.receipt_no === quarantineReceipt)?.status === 'closed') {
      console.log('nocobase-w3: [chain] 卡口负例③跳过（无待检收货可用；首跑已验证）')
      quarantineReceipt = ''
    }
  }
  if (quarantineReceipt !== '') {
    const refusal = spawnSync('node', ['--import', 'tsx/esm', join(here, 'nocobase-h5-wms.mts'), '--release-receipt', quarantineReceipt], { encoding: 'utf8' })
    const refusalText = `${refusal.stdout ?? ''}${refusal.stderr ?? ''}`
    if (refusal.status === 0 || !refusalText.includes('IQC 未放行')) {
      throw new Error(`卡口负例未拦截：待检收货 ${quarantineReceipt} 的放行应被 IQC 卡口拒绝（exit ${String(refusal.status)}）`)
    }
    console.log(`nocobase-w3: [chain] 卡口负例 ✓ IQC 未放行拒入库（${quarantineReceipt}）→ ${refusalText.trim().split('\n').filter(line => line.includes('IQC')).slice(-1)[0]?.slice(0, 90)}`)
  }

  // S8 IQC 放行；S9 待检区 → 合格区（TRANSFER + lot qualified + receipt closed）。
  runScript('nocobase-h5-wms.mts', ['--iqc', rc1Code, 'passed'])
  runScript('nocobase-h5-wms.mts', ['--release-receipt', rc1Code])

  // S10 收货②（200/1000 免检直放）：receiving_status → received。
  const rc2Code = 'RCV-W3-CHAIN-2'
  if (!receipts.some(row => row.receipt_no === rc2Code)) {
    const po = (await rowsOf(token, 'pur_orders')).find(row => row.id === poId)
    const lines = (await rowsOf(token, 'pur_order_lines')).filter(row => Number(row.order_id) === poId)
    const line = lines[0]
    await dataOf(token, 'POST', '/api/wms_receipts:create', {
      receipt_no: rc2Code, receipt_type: 'purchase',
      supplier: { id: Number(po?.supplier_id) }, po: { id: poId },
      product: { id: Number(line?.product_id) }, lot_no: `SOY-W3-${new Date().toISOString().slice(0, 10).replaceAll('-', '')}-B`,
      qty: 200, status: 'pending', iqc_status: 'not_required', note: `B3 链路收货②（${poCode} 补齐 200/1000，免检）`,
    })
  }
  runScript('nocobase-h5-wms.mts', ['--post-receipt', rc2Code])
  // A previous run that crashed between post and release left this receipt
  // posted with iqc pending (the pre-fix overwrite); restore its 免检 intent.
  const rc2Stale = (await rowsOf(token, 'wms_receipts')).find(row => row.receipt_no === rc2Code)
  if (rc2Stale !== undefined && rc2Stale.status === 'posted' && rc2Stale.iqc_status === 'pending') {
    await dataOf(token, 'POST', `/api/wms_receipts:update?filterByTk=${rc2Stale.id}`, { iqc_status: 'not_required' })
    console.log('nocobase-w3: [chain] 残留恢复：RCV-W3-CHAIN-2 iqc_status 回 not_required')
  }
  runScript('nocobase-h5-wms.mts', ['--release-receipt', rc2Code])

  // S11 发票正例：金额相符 → matched → confirmed。
  const invoices = await rowsOf(token, 'pur_invoices')
  const inv1Code = `INV-${String(year)}-0001`
  if (!invoices.some(row => row.code === inv1Code)) {
    await dataOf(token, 'POST', '/api/pur_invoices:create', {
      code: inv1Code, po: { id: poId }, invoice_no: `INV-NO-${String(year)}-088`, invoice_amount: 120_000, qty_billed: 1000,
      billed_at: new Date().toISOString().slice(0, 10), match_result: 'draft', match_note: '',
    })
  }
  await enforceGates(io, 'pur_invoices', { po_id: poId })
  if (await matchInvoice(token, inv1Code) !== 'matched') throw new Error(`发票 ${inv1Code} 应匹配通过（正例失败）`)
  await confirmInvoice(token, inv1Code)

  // S12 发票反例：金额超容差 → exception；未确认前付款被卡口拒绝 → 人工确认放行。
  const inv2Code = `INV-${String(year)}-0002`
  if (!invoices.some(row => row.code === inv2Code)) {
    await dataOf(token, 'POST', '/api/pur_invoices:create', {
      code: inv2Code, po: { id: poId }, invoice_no: `INV-NO-${String(year)}-089`, invoice_amount: 121_000, qty_billed: 1000,
      billed_at: new Date().toISOString().slice(0, 10), match_result: 'draft', match_note: '',
    })
  }
  if (await matchInvoice(token, inv2Code) !== 'exception') throw new Error(`发票 ${inv2Code} 应匹配异常（反例失败）`)
  const inv2 = (await rowsOf(token, 'pur_invoices')).find(row => row.code === inv2Code)
  if (inv2?.match_result === 'confirmed') {
    console.log('nocobase-w3: [chain] 卡口负例④跳过（发票已人工确认放行；首跑已验证）')
  } else {
    await expectRefusal('对匹配异常发票建付款', () => enforceGates(io, 'pur_payments', { invoice_id: Number(inv2?.id) }))
  }
  await confirmInvoice(token, inv2Code)

  // S13 付款（对 INV-1）：submit → 两级 approve → paid。
  const pay1Code = `PAY-${String(year)}-0001`
  const payments = await rowsOf(token, 'pur_payments')
  if (!payments.some(row => row.code === pay1Code)) {
    const inv1 = (await rowsOf(token, 'pur_invoices')).find(row => row.code === inv1Code)
    await dataOf(token, 'POST', '/api/pur_payments:create', {
      code: pay1Code, invoice: { id: Number(inv1?.id) }, amount: 120_000, pay_method: 'bank',
      doc_status: 'draft',
    })
  }
  await enforceGates(io, 'pur_payments', { invoice_id: Number((await rowsOf(token, 'pur_invoices')).find(row => row.code === inv1Code)?.id) })
  await payInvoice(token, pay1Code)

  // S14 三轴终态快照（psql 只读复核用）。
  const poFinal = (await rowsOf(token, 'pur_orders')).find(row => row.id === poId)
  console.log('nocobase-w3: [chain] ══ 三轴终态 ══')
  console.log(`nocobase-w3: [chain] PO ${poCode}: doc_status=${String(poFinal?.doc_status)} receiving_status=${String(poFinal?.receiving_status)} invoice_status=${String(poFinal?.invoice_status)}`)
  const pr1Final = (await rowsOf(token, 'pur_requests')).find(row => row.id === Number(pr1.id))
  const rfq1Final = (await rowsOf(token, 'pur_rfqs')).find(row => row.id === Number(rfq1.id))
  console.log(`nocobase-w3: [chain] PR ${String(pr1.code)}: ${String(pr1Final?.doc_status)} · RFQ ${String(rfq1.code)}: ${String(rfq1Final?.doc_status)}`)
  console.log('nocobase-w3: [chain] done — 全链（含卡口负例×3、容差正反例、两级审批）走通')
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
  const missingPages = ['采购申请', '询价管理', '供应商报价', '比价表', '采购订单', '发票匹配', '付款申请'].filter(title => !flowPageTitles.has(title))
  if (missingPages.length > 0) failures.push(`采购域 v2 pages missing: ${missingPages.join(', ')}`)
  if (!routes.some(row => row.title === MENU_GROUP.title && row.type === 'group')) failures.push(`menu group ${MENU_GROUP.title} missing`)
  const gates = await rowsOf(token, 'wfl_gate_configs')
  for (const gate of GATES) {
    const exists = gates.some(row =>
      row.downstream_collection === gate.downstream_collection
      && row.upstream_collection === gate.upstream_collection
      && row.upstream_field === gate.upstream_field)
    if (!exists) failures.push(`gate ${String(gate.downstream_collection)}→${String(gate.upstream_collection)} missing`)
  }
  for (const docType of ['pur_requests', 'pur_rfqs', 'pur_orders', 'pur_payments']) {
    const flows = await rowsOf(token, 'wfl_flow_configs')
    if (!flows.some(row => row.doc_type === docType && row.is_active === true)) failures.push(`flow config ${docType} missing`)
  }
  const receiptFields = await dataOf(token, 'GET', `/api/fields:list?filter=${encodeURIComponent(JSON.stringify({ collectionName: { $eq: 'wms_receipts' } }))}&pageSize=200`) as Array<{ name?: string }> | null
  const receiptFieldNames = new Set((receiptFields ?? []).map(field => field.name))
  for (const name of ['po_id', 'iqc_status']) {
    if (!receiptFieldNames.has(name)) failures.push(`wms_receipts.${name} missing`)
  }
  const zones = await rowsOf(token, 'wms_zones')
  if (!zones.some(zone => zone.code === QUARANTINE_ZONE_CODE)) failures.push(`待检区 ${QUARANTINE_ZONE_CODE} missing`)
  // W2-B5: the configured flow — extras keys, array-form approver_map, the
  // threshold condition literal, the demo pair's audit trail, and the demo
  // approver user.
  {
    const flowConfigs = await rowsOf(token, 'wfl_flow_configs')
    const purFlow = flowConfigs.find(row => row.doc_type === 'pur_orders' && row.is_active === true)
    if (purFlow === undefined) failures.push('pur_orders flow config missing')
    else {
      const extras = JSON.parse(String(purFlow.extras ?? '{}')) as { amount_threshold?: unknown, invoice_match_tolerance?: unknown }
      if (extras.amount_threshold !== 200_000) failures.push(`pur_orders extras.amount_threshold ${JSON.stringify(extras.amount_threshold)} ≠ 200000 (W2-B5)`)
      if (extras.invoice_match_tolerance !== 0.1) failures.push(`pur_orders extras.invoice_match_tolerance ${JSON.stringify(extras.invoice_match_tolerance)} ≠ 0.1 (W2-B5)`)
      const approverMap = JSON.parse(String(purFlow.approver_map ?? '{}')) as Record<string, unknown>
      const manager = approverMap['manager']
      if (!Array.isArray(manager) || !manager.includes('admin') || !manager.includes('quality_lead')) {
        failures.push(`pur_orders approver_map.manager must be ["admin","quality_lead"] (got ${JSON.stringify(manager)})`)
      }
      const purTransitions = await rowsOf(token, 'wfl_flow_transitions')
      const expected = purTransitions.find(row => Number(row.flow_id) === Number(purFlow.id)
        && row.state === 'pending' && row.action === 'approve' && row.next_state === 'approved')
      if (expected?.condition_expr !== 'amount <= 200000') {
        failures.push(`pur_orders threshold condition ${JSON.stringify(String(expected?.condition_expr ?? ''))} ≠ 'amount <= 200000' (W2-B5)`)
      }
      if (typeof purFlow.config_note !== 'string' || !purFlow.config_note.includes('w2b5')) {
        failures.push('pur_orders flow config_note audit trail missing (W2-B5)')
      }
    }
    const users = await rowsOf(token, 'users')
    if (!users.some(row => row.username === 'quality_lead')) failures.push('quality_lead demo approver user missing (W2-B5)')
    const pos = await rowsOf(token, 'pur_orders')
    const demoSmall = pos.find(row => row.code === 'PO-B5-A')
    const demoLarge = pos.find(row => row.code === 'PO-B5-B')
    const demoWitness = pos.find(row => row.code === 'PO-B5-C')
    if (demoWitness?.doc_status !== 'approved') failures.push(`PO-B5-C must sit approved (got ${String(demoWitness?.doc_status)}) — the todo-expansion witness`)
    const witnessTodos = (await rowsOf(token, 'wfl_approval_todos')).filter(row => row.doc_type === 'pur_orders' && String(row.doc_id) === String(demoWitness?.id))
    if (witnessTodos.length !== 2 || !witnessTodos.every(row => row.status === 'completed') || !witnessTodos.some(row => row.user === 'quality_lead') || !witnessTodos.some(row => row.user === 'admin')) {
      failures.push(`PO-B5-C todos must be the two-person expansion (admin+quality_lead) completed (${JSON.stringify(witnessTodos.map(row => [row.user, row.status]))})`)
    }
    if (demoSmall?.doc_status !== 'approved') failures.push(`PO-B5-A must sit approved (got ${String(demoSmall?.doc_status)}) — the 150k one-round demo`)
    if (demoLarge?.doc_status !== 'approved') failures.push(`PO-B5-B must sit approved (got ${String(demoLarge?.doc_status)}) — the 250k two-round demo`)
    const records = await rowsOf(token, 'wfl_approval_records')
    const smallActs = records.filter(row => row.doc_type === 'pur_orders' && String(row.doc_id) === String(demoSmall?.id))
    const largeActs = records.filter(row => row.doc_type === 'pur_orders' && String(row.doc_id) === String(demoLarge?.id))
    if (!smallActs.some(row => row.approver === 'quality_lead' && row.to_state === 'approved')) {
      failures.push('PO-B5-A records must carry quality_lead one-round approval (W2-B5)')
    }
    if (!largeActs.some(row => row.to_state === 'pending_level2') || !largeActs.some(row => row.approver === 'admin' && row.to_state === 'approved')) {
      failures.push('PO-B5-B records must carry the two-level route (pending_level2 then gm approved; W2-B5)')
    }
  }
  if (failures.length > 0) {
    throw new Error(`nocobase-w3 verify FAILED:\n  - ${failures.join('\n  - ')}`)
  }
  console.log('nocobase-w3: verify OK — 9 collections + 7 pages + group + 6 gates + 4 flows + receipt columns + 待检区 + W2-B5 配置化（阈值/容差/多审批人/审计）')
}

// ─── rollback ───

async function rollback(token: string): Promise<void> {
  let destroyedModels = 0
  for (const row of await listModels(token)) {
    if (String(row.uid ?? '').startsWith('w3pur')) {
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
    console.log(`nocobase-w3: ${destroyedModels} w3pur flowModels destroyed, ${swept} orphaned n18ai- buttons swept`)
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
  // Receipt columns (the w2 field-update channel: collection-scoped fields:destroy).
  for (const name of ['po_id', 'iqc_status']) {
    try {
      await call(token, 'POST', `/api/collections/wms_receipts/fields:destroy?filterByTk=${encodeURIComponent(name)}`)
    } catch {
      // A fresh install that never ran w3 has neither column; the miss is fine.
    }
  }
  // Flow configs (states/transitions hang off flow_id).
  for (const docType of ['pur_requests', 'pur_rfqs', 'pur_orders', 'pur_payments']) {
    const configs = (await rowsOf(token, 'wfl_flow_configs')).filter(row => row.doc_type === docType)
    for (const config of configs) {
      const states = (await rowsOf(token, 'wfl_flow_states')).filter(row => Number(row.flow_id) === Number(config.id))
      for (const state of states) await call(token, 'POST', `/api/wfl_flow_states:destroy?filterByTk=${state.id}`)
      const transitions = (await rowsOf(token, 'wfl_flow_transitions')).filter(row => Number(row.flow_id) === Number(config.id))
      for (const transition of transitions) await call(token, 'POST', `/api/wfl_flow_transitions:destroy?filterByTk=${transition.id}`)
      await call(token, 'POST', `/api/wfl_flow_configs:destroy?filterByTk=${config.id}`)
    }
  }
  // W2-B5: the threshold-demo pair (documents, todos, records) and the demo
  // approver user (the flow configs themselves die in the sweep below).
  {
    const demoPos = (await rowsOf(token, 'pur_orders')).filter(row => String(row.code ?? '').startsWith('PO-B5-'))
    for (const row of demoPos) {
      for (const todo of (await rowsOf(token, 'wfl_approval_todos')).filter(t => String(t.doc_id) === String(row.id) && t.doc_type === 'pur_orders')) {
        await call(token, 'POST', `/api/wfl_approval_todos:destroy?filterByTk=${todo.id}`)
      }
      for (const record of (await rowsOf(token, 'wfl_approval_records')).filter(r => String(r.doc_id) === String(row.id) && r.doc_type === 'pur_orders')) {
        await call(token, 'POST', `/api/wfl_approval_records:destroy?filterByTk=${record.id}`)
      }
      await call(token, 'POST', `/api/pur_orders:destroy?filterByTk=${row.id}`)
    }
    const qualityLead = (await rowsOf(token, 'users')).find(row => row.username === 'quality_lead')
    if (qualityLead !== undefined) await call(token, 'POST', `/api/users:destroy?filterByTk=${qualityLead.id}`)
    console.log('nocobase-w3: W2-B5 demo pair + quality_lead user removed')
  }
  // Gate rows scoped to this batch.
  for (const gate of GATES) {
    const rows = (await rowsOf(token, 'wfl_gate_configs')).filter(row =>
      row.downstream_collection === gate.downstream_collection
      && row.upstream_collection === gate.upstream_collection
      && row.upstream_field === gate.upstream_field)
    for (const row of rows) await call(token, 'POST', `/api/wfl_gate_configs:destroy?filterByTk=${row.id}`)
  }
  // Coded seed rows by prefix, then every row of the ref-only tables (the
  // collections themselves drop right after, so the sweep only tidies audit).
  for (const [collection, codePrefix] of [
    ['pur_payments', 'PAY-'], ['pur_invoices', 'INV-'], ['pur_orders', 'PO-'], ['pur_rfqs', 'RFQ-'], ['pur_requests', 'PR-'],
  ] as const) {
    const rows = (await rowsOf(token, collection)).filter(row => String(row.code ?? '').startsWith(codePrefix))
    for (const row of rows) await call(token, 'POST', `/api/${collection}:destroy?filterByTk=${row.id}`)
  }
  for (const collection of ['pur_rfq_suppliers', 'pur_quotes', 'pur_order_lines', 'pur_request_lines']) {
    for (const row of await rowsOf(token, collection)) {
      await call(token, 'POST', `/api/${collection}:destroy?filterByTk=${row.id}`)
    }
  }
  const receipt = (await rowsOf(token, 'wms_receipts')).filter(row => String(row.receipt_no ?? '').startsWith('RCV-W3-') || String(row.receipt_no ?? '') === 'RCV-B3-DEMO-1')
  for (const row of receipt) await call(token, 'POST', `/api/wms_receipts:destroy?filterByTk=${row.id}`)
  for (const collection of [...COLLECTIONS].reverse()) {
    const existing = await dataOf(token, 'GET', `/api/collections/${collection.name}`)
    if (existing !== null) {
      await call(token, 'POST', `/api/collections:destroy?filterByTk=${collection.name}&cascade=true&drop=true&skipChildren=true`)
    }
  }
  console.log('nocobase-w3: rollback done — pages/group/columns/flows/gates/seeds/collections removed（待检区与 posted 库存流水保留为 WMS 数据）')
}

// ─── main ───

async function main(): Promise<void> {
  const args = process.argv.slice(2)
  const token = await signInWithRetry()
  if (args.includes('--rollback')) {
    await rollback(token)
    console.log('nocobase-w3: done (rollback)')
    return
  }
  const matchIndex = args.indexOf('--match-invoice')
  if (matchIndex >= 0) {
    await matchInvoice(token, String(args[matchIndex + 1]))
    return
  }
  const confirmIndex = args.indexOf('--confirm-invoice')
  if (confirmIndex >= 0) {
    await confirmInvoice(token, String(args[confirmIndex + 1]))
    return
  }
  const payIndex = args.indexOf('--pay')
  if (payIndex >= 0) {
    await payInvoice(token, String(args[payIndex + 1]))
    return
  }
  // W2-B5: the RFQ verbs stand alone (no chain replay needed).
  const sendRfqIndex = args.indexOf('--send-rfq')
  if (sendRfqIndex >= 0) {
    await sendRfq(token, String(args[sendRfqIndex + 1]))
    return
  }
  const awardRfqIndex = args.indexOf('--award-rfq')
  if (awardRfqIndex >= 0) {
    const quoteIndex = args.indexOf('--quote')
    const winnerQuoteId = quoteIndex >= 0 ? String(args[quoteIndex + 1]) : undefined
    await awardRfq(token, String(args[awardRfqIndex + 1]), winnerQuoteId)
    return
  }
  if (args.includes('--demo-chain')) {
    await demoChain(token)
    return
  }
  await ensureCollections(token)
  await ensureReceiptColumns(token)
  await ensureFlows(token)
  await ensureGates(token)
  await seedRows(token)
  await b5ApprovalDemo(token)
  const group = await ensureMenuGroup(token)
  let sort = 1
  for (const spec of PAGES) {
    await ensureV2Page(token, spec, group.id, sort++)
  }
  await verify(token)
  console.log('nocobase-w3: done')
}

await main()