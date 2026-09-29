/**
 * W6/B6: the manufacturing-execution domain's NocoBase side
 * (plans/2026-09-25-mfg-closure/07-b6-mfg-execution.md). One script, every
 * step idempotent:
 *
 * 1. Four mfg_* collections: material_issues / material_returns (one row per
 *    component, draft→posted through the h5 engine only), job_reports (the
 *    operation progress engine's input: qty_good/qty_scrap/duration_min +
 *    the IPQC qc_status anchor B8 deepens), and completions (finished-goods
 *    receipts that quarantine before OQC).
 * 2. mfg_orders grows the execution columns (qty_transferred / qty_consumed
 *    — the three-quantity view with qty, actual_cost / cost_variance next to
 *    the completion-settled std_cost, kit_data for the mobile kit card) and
 *    the doc_status enum gains in_progress / completed.
 * 3. Seeds: the eight BOM components' stock lots (receipt-aligned so the
 *    ledger gate stays green), the MO-2026-0001 execution documents in
 *    draft, and the MO-2026-0002 partial-kit material (SKN/VEG short).
 * 4. Five 生产制造 v2 flowPages: 领料单 / 退料单 / 报工记录 / 完工单 + the
 *    MO 执行视图 (three quantities + dual cost columns + operation progress).
 * 5. The demo chain (--demo-chain): draft-MO kit refusal → MO-1 kit assigned
 *    (4 hard reservations) → MO-2 partial with the shortfall ladder →
 *    partial-MO issue refusal → MO-1 four issues (WIP, released→in_progress)
 *    → over-issue refusal → return to warehouse → three job reports (ops
 *    done, qty_consumed) → over-completion refusal → completion (待检区 +
 *    RECEIPT_MFG + completed + dual cost settled) → OQC release → ledger
 *    assertion.
 *
 * W2-B6 (plans/2026-09-27-w2-evolution/06-b6-execution-policy.md): mfg_orders
 * grows the MO-level execution-policy columns kit_policy (full_lock default /
 * partial_allowed) and overissue_ratio (0 default — both defaults keep the
 * W-round behavior); the reservation_state axis gains partial_allowed; the
 * already-built 生产订单 / MO 执行视图 tables gain the policy columns; the
 * 排产看板 heading declares the never-straddle scope. A separate light
 * rollback --rollback-w2b6 (prefix w2b6-) undoes exactly this batch.
 *
 * Rollback: --rollback destroys the w6mfg* flowModels tree (+ orphaned
 * n18ai- sweep), the five pages, the execution seeds, the mfg_orders columns,
 * and the four collections.
 *
 * Usage (repo root, tsx loader):
 *   node --import tsx/esm examples/kb-agent/scripts/nocobase-w6-mfg-exec.mts
 *   node --import tsx/esm examples/kb-agent/scripts/nocobase-w6-mfg-exec.mts --demo-chain
 *   node --import tsx/esm examples/kb-agent/scripts/nocobase-w6-mfg-exec.mts --rollback
 *   node --import tsx/esm examples/kb-agent/scripts/nocobase-w6-mfg-exec.mts --rollback-w2b6
 */
import { spawnSync } from 'node:child_process'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { call, dataOf, ensureTableRowDetail, listFlowModels, listRoutes, signInWithRetry, withN17Prefix } from './nocobase-flow-page-lib.mts'
import { appendMovement } from './nocobase-h5-wms.mts'

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
const json = (name: string, title: string): object => ({ name, type: 'json', interface: 'json', uiSchema: { type: 'object', 'x-component': 'Input.TextArea', title } })
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
/** B6: the MO axis grows the two execution terminals (first issue starts, completion finishes). */
const MO_STATUS = [...STATE_OPTS, ...opts([
  ['released', '已下达', 'blue'], ['in_progress', '执行中', 'orange'],
  ['completed', '已完工', 'green'], ['closed', '已关闭', 'default'],
])]
/** Draft→posted rides the engine only (the single inventory-writer invariant). */
const EXEC_DOC_STATUS = opts([['draft', '草稿', 'default'], ['posted', '已过账', 'green']])
/** B6: the IPQC anchor on job reports (B8 deepens into inspection documents). */
const QC_STATUS = opts([
  ['not_required', '免检', 'default'], ['pending', '待检', 'orange'],
  ['passed', '放行', 'green'], ['failed', '不合格', 'red'],
])
/** B6: the OQC anchor on completions — pending gates the release to qualified stock. */
const OQC_STATUS = opts([
  ['not_required', '免检', 'default'], ['pending', '待检', 'orange'],
  ['passed', '放行', 'green'], ['failed', '不合格', 'red'], ['concession', '让步接收', 'purple'],
])
/** W2-B6: the MO-level kit policy — full_lock (default) keeps the W-round blocking behavior. */
const KIT_POLICY = opts([['full_lock', '齐套全锁', 'default'], ['partial_allowed', '允许部分投料', 'blue']])
/** W2-B6: the reservation axis grows partial_allowed (covered components hold hard reservations). */
const RESERVATION_AXIS_W2B6 = opts([
  ['none', '未齐套', 'default'], ['partial', '部分齐套(阻断)', 'orange'], ['partial_allowed', '部分投料已预留', 'purple'], ['assigned', '已齐套', 'green'],
])
/** W2-B6: the scheduling-scope declaration the 排产看板 heading carries (same text as mfg-schedule's module header). */
const SCHEDULE_SCOPE_TITLE = 'MO 工序排程（计划日期 × 工作中心）· 口径：工序不跨天——超日产能工序给拆单建议（见 note），需人工拆 MO 或外协'
/** W2-B6: the uid prefix every page increment this batch mints (the light rollback key). */
const W2B6_PREFIX = 'w2b6-'

// ─── the four collections ───

const COLLECTIONS: ReadonlyArray<{ name: string, title: string, titleField?: string, fields: object[] }> = [
  {
    // One row per component per issue; posting rides the engine's --post-issue.
    name: 'mfg_material_issues', title: '生产领料单', titleField: 'code', fields: [
      input('code', '领料单号'), belongsTo('mo', '生产订单', 'mfg_orders', 'mo_id', 'code'),
      date('issue_date', '领料日期'), belongsTo('product', '组件物料', 'hub_inv_products', 'product_id'),
      number('qty', '领料数量'), belongsTo('lot', '批次(FEFO)', 'wms_lots', 'lot_id', 'lot_no'),
      select('status', '状态', EXEC_DOC_STATUS), textarea('note', '备注'),
    ],
  },
  {
    // WIP pulls back onto a qualified bin through --post-return.
    name: 'mfg_material_returns', title: '生产退料单', titleField: 'code', fields: [
      input('code', '退料单号'), belongsTo('mo', '生产订单', 'mfg_orders', 'mo_id', 'code'),
      date('return_date', '退料日期'), belongsTo('product', '组件物料', 'hub_inv_products', 'product_id'),
      number('qty', '退料数量'), belongsTo('lot', '批次', 'wms_lots', 'lot_id', 'lot_no'),
      select('status', '状态', EXEC_DOC_STATUS), textarea('note', '备注'),
    ],
  },
  {
    // The operation report — qty/duration drive progress and the labor cost.
    name: 'mfg_job_reports', title: '工序报工单', titleField: 'code', fields: [
      input('code', '报工单号'), belongsTo('mo', '生产订单', 'mfg_orders', 'mo_id', 'code'),
      integer('op_seq', '工序号'), date('report_date', '报工日期'),
      number('qty_good', '合格数量'), number('qty_scrap', '不合格数量'), integer('duration_min', '工时(分)'),
      input('operator', '报工人'), select('qc_status', 'IPQC 状态', QC_STATUS),
      select('status', '状态', EXEC_DOC_STATUS), textarea('remark', '备注'), json('ccp_params', 'CCP 参数'),
    ],
  },
  {
    // The finished-goods receipt — quarantines on the 待检区 until OQC releases.
    name: 'mfg_completions', title: '完工入库单', titleField: 'code', fields: [
      input('code', '完工单号'), belongsTo('mo', '生产订单', 'mfg_orders', 'mo_id', 'code'),
      number('qty', '完工数量'), input('lot_no', '成品批次'),
      select('oqc_status', 'OQC 状态', OQC_STATUS), select('status', '状态', EXEC_DOC_STATUS),
      date('completed_at', '完工日期'), textarea('note', '备注'),
    ],
  },
]

/** The mfg_orders columns B6 owns (fields:create when missing, enum re-write on drift). W2-B6 appends the two policy columns. */
const MO_COLUMNS: ReadonlyArray<{ field: object, enumRewrite?: object }> = [
  { field: number('qty_transferred', '已转数量(当量)') },
  { field: number('qty_consumed', '已报工产出') },
  { field: number('actual_cost', '实际成本') },
  { field: number('cost_variance', '成本差异') },
  { field: textarea('kit_data', '齐套明细') },
  { field: { name: 'kit_policy', type: 'string', interface: 'select', uiSchema: { type: 'string', 'x-component': 'Select', title: '齐套策略', enum: KIT_POLICY, default: 'full_lock' } } },
  { field: { name: 'overissue_ratio', type: 'float', interface: 'number', uiSchema: { type: 'number', 'x-component': 'InputNumber', title: '超领比例(如0.05)', default: 0, 'x-component-props': { min: 0, max: 1, step: 0.01 } } } },
]

const MENU_GROUP_TITLE = '生产与计划'

// ─── REST helpers ───

async function rowsOf(token: string, collection: string, pageSize = 500): Promise<Array<Record<string, any>>> {
  const payload = await call(token, 'GET', `/api/${collection}:list?pageSize=${pageSize}`)
  const rows = (payload?.data ?? null) as Array<Record<string, any>> | null
  if (rows === null) return []
  const total = payload?.meta?.total
  if (typeof total === 'number' ? total > rows.length : rows.length === pageSize) {
    throw new Error(`${collection}:list returned ${String(rows.length)} of ${String(total)} rows (pageSize=${String(pageSize)}); raise the page size or paginate`)
  }
  return rows
}

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
      console.log(`nocobase-w6: collection ${collection.name} exists (kept)`)
      continue
    }
    await dataOf(token, 'POST', '/api/collections:create', { name: collection.name, title: collection.title, titleField: collection.titleField, fields: collection.fields })
    console.log(`nocobase-w6: collection ${collection.name} created`)
  }
}

/**
 * The mfg_orders execution columns + the doc_status enum growth. Every step
 * is an idempotent presence check (fields:create when missing; the enum
 * re-writes when the stored options lack in_progress).
 */
async function ensureMfgColumns(token: string): Promise<void> {
  const fieldNames = await dataOf(token, 'GET', `/api/fields:list?filter=${encodeURIComponent(JSON.stringify({ collectionName: { $eq: 'mfg_orders' } }))}&pageSize=200`) as Array<{ name?: string }> | null
  const names = new Set((fieldNames ?? []).map(field => field.name))
  let added = 0
  for (const column of MO_COLUMNS) {
    const name = (column.field as { name: string }).name
    if (names.has(name)) continue
    await dataOf(token, 'POST', '/api/fields:create', { collectionName: 'mfg_orders', ...column.field })
    added += 1
  }
  if (added > 0) console.log(`nocobase-w6: mfg_orders execution columns +${added} (三量/成本双列/齐套明细)`)
  const statusField = await dataOf(token, 'GET', `/api/fields:list?filter=${encodeURIComponent(JSON.stringify({ collectionName: { $eq: 'mfg_orders' }, name: { $eq: 'doc_status' } }))}&pageSize=1`) as Array<{ uiSchema?: { enum?: Array<{ value?: string }> } }> | null
  const stored = statusField?.[0]?.uiSchema?.enum ?? []
  if (!stored.some(option => option.value === 'in_progress')) {
    await call(token, 'POST', `/api/collections/mfg_orders/fields:update?filterByTk=doc_status`, {
      uiSchema: { type: 'string', 'x-component': 'Select', title: '审批状态', enum: MO_STATUS },
    })
    console.log('nocobase-w6: mfg_orders.doc_status enum re-written with the B6 terminals (in_progress/completed)')
  }
  // W2-B6: the reservation axis enum rewrite (partial_allowed joins).
  const kitStateField = await dataOf(token, 'GET', `/api/fields:list?filter=${encodeURIComponent(JSON.stringify({ collectionName: { $eq: 'mfg_orders' }, name: { $eq: 'reservation_state' } }))}&pageSize=1`) as Array<{ uiSchema?: { enum?: Array<{ value?: string }> } }> | null
  const kitStored = kitStateField?.[0]?.uiSchema?.enum ?? []
  if (!kitStored.some(option => option.value === 'partial_allowed')) {
    await call(token, 'POST', `/api/collections/mfg_orders/fields:update?filterByTk=reservation_state`, {
      uiSchema: { type: 'string', 'x-component': 'Select', title: '齐套状态', enum: RESERVATION_AXIS_W2B6 },
    })
    console.log('nocobase-w6: mfg_orders.reservation_state enum re-written with partial_allowed (W2-B6)')
  }
  // W2-B6: backfill every existing row to the policy defaults so the columns
  // never carry NULL (full_lock / 0 — the W-round behavior).
  let backfilled = 0
  for (const mo of await rowsOf(token, 'mfg_orders')) {
    const policyMissing = mo.kit_policy === null || mo.kit_policy === undefined || String(mo.kit_policy) === ''
    const ratioMissing = mo.overissue_ratio === null || mo.overissue_ratio === undefined || String(mo.overissue_ratio) === ''
    if (!policyMissing && !ratioMissing) continue
    await dataOf(token, 'POST', `/api/mfg_orders:update?filterByTk=${mo.id}`, {
      ...(policyMissing ? { kit_policy: 'full_lock' } : {}),
      ...(ratioMissing ? { overissue_ratio: 0 } : {}),
    })
    backfilled += 1
  }
  if (backfilled > 0) console.log(`nocobase-w6: [w2b6] mfg_orders 策略缺省回填 ${backfilled} 行（full_lock / 0）`)
}

/**
 * W2-B6: the page increments on already-built flowPages — the two policy
 * columns on both mfg_orders tables (生产订单 wants both; MO 执行视图 shows
 * the policy only) and the 排产看板 heading scope declaration. Table columns
 * are standalone flowModels rows, so the mount is additive (the n18ai-
 * isomorph); the CreateForm grid tree is embedded and unreadable through the
 * API, so form editing stays with the field defaults + REST (recorded in the
 * batch note). Idempotent by fieldPath.
 */
async function ensureW2b6PageIncrements(token: string): Promise<void> {
  const catalog = await call(token, 'GET', '/api/flowModels:list?pageSize=6000') as { data?: Array<Record<string, any>> }
  const rows = catalog?.data ?? []
  if (rows.length === 6000) throw new Error('flowModels:list is truncated at 6000; raise the page size before the w2b6 increments')
  const tables = rows.filter(row => row.use === 'TableBlockModel'
    && row.stepParams?.resourceSettings?.init?.collectionName === 'mfg_orders')
  let added = 0
  for (const table of tables) {
    const title = String(table.props?.title ?? '')
    const wants: ReadonlyArray<{ name: string, title: string, kind: 'select' | 'number', options?: object[] }> = title.includes('三量')
      ? [{ name: 'kit_policy', title: '齐套策略', kind: 'select', options: KIT_POLICY }]
      : [
          { name: 'kit_policy', title: '齐套策略', kind: 'select', options: KIT_POLICY },
          { name: 'overissue_ratio', title: '超领比例', kind: 'number' },
        ]
    for (const want of wants) {
      const exists = rows.some(row => row.parentId === table.uid && row.subKey === 'columns'
        && row.stepParams?.fieldSettings?.init?.fieldPath === want.name)
      if (exists) continue
      const uid = `${W2B6_PREFIX}${table.uid}-${want.name}`
      const model = want.kind === 'select' ? 'DisplayEnumFieldModel' : 'DisplayNumberFieldModel'
      const shared = want.options === undefined ? {} : { options: want.options }
      await call(token, 'POST', '/api/flowModels:save', {
        uid, parentId: table.uid, subKey: 'columns', subType: 'array', sortIndex: 99, use: 'TableColumnModel',
        props: { title: want.title, dataIndex: want.name, width: 140, editable: false, sorter: false, fixed: 'none', ...shared },
        stepParams: {
          fieldSettings: { init: { dataSourceKey: 'main', collectionName: 'mfg_orders', fieldPath: want.name } },
          tableColumnSettings: { model: { use: model } },
        },
      })
      await call(token, 'POST', '/api/flowModels:save', {
        uid: `${uid}f`, parentId: uid, subKey: 'field', subType: 'object', sortIndex: 0, use: model,
        stepParams: { popupSettings: { openView: { collectionName: 'mfg_orders', dataSourceKey: 'main' } } },
        props: { displayStyle: 'text', overflowMode: 'ellipsis', clickToOpen: false, displayCopyButton: false, ...shared },
      })
      added += 1
    }
  }
  if (added > 0) console.log(`nocobase-w6: [w2b6] mfg_orders 表格策略列 +${added}（${W2B6_PREFIX} 前缀，--rollback-w2b6 可撤）`)
  // The 排产看板 scope declaration (the never-straddle 口径, one of the three
  // places declaring it together with mfg-schedule's header and the note).
  const board = rows.find(row => row.use === 'TableBlockModel'
    && row.stepParams?.resourceSettings?.init?.collectionName === 'mfg_order_operations'
    && String(row.props?.title ?? '').startsWith('MO 工序排程'))
  if (board !== undefined && !String(board.props?.title ?? '').includes('工序不跨天')) {
    await call(token, 'POST', '/api/flowModels:save', {
      uid: board.uid, parentId: board.parentId, subKey: board.subKey, subType: board.subType,
      sortIndex: board.sortIndex, use: 'TableBlockModel', props: { ...board.props, title: SCHEDULE_SCOPE_TITLE },
      stepParams: board.stepParams,
    })
    console.log('nocobase-w6: [w2b6] 排产看板 heading 增口径声明（工序不跨天）')
  }
}

/**
 * W2-B6: the light rollback — destroy every w2b6- prefixed flowModels row,
 * drop the two policy columns, revert the reservation_state enum, and
 * restore the 排产看板 heading. Dropping the columns discards their values
 * with them; data rows and movements stay untouched.
 */
async function rollbackW2b6(token: string): Promise<void> {
  const catalog = await call(token, 'GET', '/api/flowModels:list?pageSize=6000') as { data?: Array<Record<string, any>> }
  const rows = catalog?.data ?? []
  let destroyed = 0
  for (const row of rows.filter(item => String(item.uid ?? '').startsWith(W2B6_PREFIX))) {
    await call(token, 'POST', `/api/flowModels:destroy?filterByTk=${encodeURIComponent(String(row.uid))}`)
    destroyed += 1
  }
  for (const name of ['kit_policy', 'overissue_ratio']) {
    try {
      await call(token, 'POST', `/api/collections/mfg_orders/fields:destroy?filterByTk=${encodeURIComponent(name)}`)
    } catch {
      // A fresh tree never ran the batch; the miss is fine.
    }
  }
  await call(token, 'POST', `/api/collections/mfg_orders/fields:update?filterByTk=reservation_state`, {
    uiSchema: { type: 'string', 'x-component': 'Select', title: '齐套状态', enum: opts([['none', '未齐套', 'default'], ['partial', '部分齐套', 'orange'], ['assigned', '已齐套', 'green']]) },
  })
  const board = rows.find(row => row.use === 'TableBlockModel'
    && row.stepParams?.resourceSettings?.init?.collectionName === 'mfg_order_operations'
    && String(row.props?.title ?? '').includes('工序不跨天'))
  if (board !== undefined) {
    await call(token, 'POST', '/api/flowModels:save', {
      uid: board.uid, parentId: board.parentId, subKey: board.subKey, subType: board.subType,
      sortIndex: board.sortIndex, use: 'TableBlockModel', props: { ...board.props, title: 'MO 工序排程（计划日期 × 工作中心）' },
      stepParams: board.stepParams,
    })
  }
  console.log(`nocobase-w6: [w2b6] rollback done — ${destroyed} flowModels rows, both policy columns, enum revert, heading restore`)
}

// ─── seeds ───

const iso = (offsetDays: number): string => new Date(Date.now() + offsetDays * 86_400_000).toISOString().slice(0, 10)

/**
 * The eight components' stock lots — one lot + one stock row + one RECEIPT
 * movement each, sized so MO-2026-0001 kits fully and MO-2026-0002 falls
 * short on SKN/VEG (the partial ladder's material). Quantities: MO-1 needs
 * MIFU 758.88 / HAI 37.08 / CHE 97.92 / PKG 12120; MO-2 needs SKN 2937.6 /
 * PRK 3460.8 / VEG 1497.6 / DMP-PKG 16160.
 */
const COMPONENT_STOCK: ReadonlyArray<{ sku: string, lot: string, bin: string, qty: number, supplier: string }> = [
  { sku: 'RM-SNA-MIFU', lot: 'RM-260920-M1', bin: 'SH-A-02-01', qty: 900, supplier: '山东鲁丰食品配料有限公司' },
  { sku: 'RM-SNA-HAI', lot: 'RM-260920-H1', bin: 'SH-A-02-02', qty: 60, supplier: '山东鲁丰食品配料有限公司' },
  { sku: 'RM-SNA-CHE', lot: 'RM-260920-C1', bin: 'SH-A-02-03', qty: 150, supplier: '山东鲁丰食品配料有限公司' },
  { sku: 'RM-SNA-PKG', lot: 'RM-260920-P1', bin: 'SH-A-02-04', qty: 15_000, supplier: '绿源包装材料有限公司' },
  { sku: 'RM-DMP-SKN', lot: 'RM-260920-S1', bin: 'SH-A-02-05', qty: 1500, supplier: '山东鲁丰食品配料有限公司' },
  { sku: 'RM-DMP-PRK', lot: 'RM-260920-K1', bin: 'SH-A-02-06', qty: 4000, supplier: '山东鲁丰食品配料有限公司' },
  { sku: 'RM-DMP-VEG', lot: 'RM-260920-V1', bin: 'SH-A-02-07', qty: 800, supplier: '山东鲁丰食品配料有限公司' },
  { sku: 'RM-DMP-PKG', lot: 'RM-260920-P2', bin: 'SH-A-02-08', qty: 20_000, supplier: '绿源包装材料有限公司' },
]

/** The MO-2026-0001 execution documents in draft (the demo chain posts them). */
const SEED_ISSUES: ReadonlyArray<{ code: string, mo: string, sku: string, qty: number, note: string }> = [
  { code: 'MI-2026-0001', mo: 'MO-2026-0001', sku: 'RM-SNA-MIFU', qty: 758.88, note: '齐套全额领料（0.062×1.02×12000）' },
  { code: 'MI-2026-0002', mo: 'MO-2026-0001', sku: 'RM-SNA-HAI', qty: 37.08, note: '齐套全额领料（0.003×1.03×12000）' },
  { code: 'MI-2026-0003', mo: 'MO-2026-0001', sku: 'RM-SNA-CHE', qty: 97.92, note: '齐套全额领料（0.008×1.02×12000）' },
  { code: 'MI-2026-0004', mo: 'MO-2026-0001', sku: 'RM-SNA-PKG', qty: 12_120, note: '齐套全额领料（1×1.01×12000）' },
]
const SEED_RETURNS: ReadonlyArray<{ code: string, mo: string, sku: string, qty: number, note: string }> = [
  { code: 'MR-2026-0001', mo: 'MO-2026-0001', sku: 'RM-SNA-PKG', qty: 100, note: '线边余料退回（包装袋多领）' },
]
const SEED_REPORTS: ReadonlyArray<{ code: string, mo: string, opSeq: number, qtyGood: number, qtyScrap: number, durationMin: number, operator: string, remark: string }> = [
  { code: 'JR-2026-0001', mo: 'MO-2026-0001', opSeq: 1, qtyGood: 12_000, qtyScrap: 0, durationMin: 240, operator: '王磊', remark: '混合搅拌全批完工' },
  { code: 'JR-2026-0002', mo: 'MO-2026-0001', opSeq: 2, qtyGood: 11_800, qtyScrap: 200, durationMin: 300, operator: '赵敏', remark: '烘焙膨化破边 200（计入损耗）' },
  { code: 'JR-2026-0003', mo: 'MO-2026-0001', opSeq: 3, qtyGood: 12_000, qtyScrap: 0, durationMin: 180, operator: '钱芳', remark: '调味包装末工序报齐' },
]
const SEED_COMPLETIONS: ReadonlyArray<{ code: string, mo: string, qty: number, note: string }> = [
  { code: 'MC-2026-0001', mo: 'MO-2026-0001', qty: 12_000, note: '末工序报齐后整批完工入库' },
]

async function seedRows(token: string): Promise<void> {
  const products = await rowsOf(token, 'hub_inv_products', 200)
  const suppliers = await rowsOf(token, 'srm_suppliers')
  const bins = await rowsOf(token, 'wms_bins', 200)
  const productBy = (sku: string): Record<string, any> | undefined => products.find(row => row.sku === sku)
  const binBy = (code: string): Record<string, any> | undefined => bins.find(row => row.code === code)
  const supplierBy = (name: string): Record<string, any> | undefined => suppliers.find(row => row.name === name)

  // Component lots (four dates off a 365d default; the raw materials carry
  // no shelf_life_days) + stock rows + the opening RECEIPT legs.
  const lots = await rowsOf(token, 'wms_lots')
  let lotsAdded = 0
  for (const component of COMPONENT_STOCK) {
    if (lots.some(row => row.lot_no === component.lot)) continue
    await dataOf(token, 'POST', '/api/wms_lots:create', {
      product: { id: Number(productBy(component.sku)?.id) }, lot_no: component.lot,
      production_date: iso(-14), expiry_date: iso(351), removal_date: iso(321), alert_date: iso(291),
      supplier: { id: Number(supplierBy(component.supplier)?.id) }, status: 'qualified',
    })
    lotsAdded += 1
  }
  const lotsNow = await rowsOf(token, 'wms_lots')
  const lotBy = (no: string): Record<string, any> | undefined => lotsNow.find(row => row.lot_no === no)
  const stocks = await rowsOf(token, 'wms_stock', 500)
  const movementsBefore = await rowsOf(token, 'wms_movements', 1000)
  let stockAdded = 0
  for (const component of COMPONENT_STOCK) {
    // Two re-seed guards (W2-B6): a missing bin row must never reach the
    // create call (Number(undefined) = NaN makes NocoBase mint an empty
    // shell bin and silently double the stock), and a component whose seed
    // RECEIPT already rides the ledger must not regain a stock row — either
    // would break the stock == Σmovements gate.
    if (binBy(component.bin) === undefined) {
      console.log(`nocobase-w6: [w2b6-guard] 库位 ${component.bin} 缺失（${component.sku}）——跳过补种（先补 wms_bins 有效行，防空壳 bin 重复库存）`)
      continue
    }
    if (movementsBefore.some(row => row.doc_no === `RCV-B6-${component.lot.slice(-2)}` && row.move_type === 'RECEIPT')
      && !stocks.some(row => Number(row.product_id) === Number(productBy(component.sku)?.id) && Number(row.lot_id) === Number(lotBy(component.lot)?.id))) {
      console.log(`nocobase-w6: [w2b6-guard] ${component.sku} 种子流水已在而库存行缺——环境损坏，跳过自动补种（防 stock == Σmovements 破坏）`)
      continue
    }
    const key = { productId: Number(productBy(component.sku)?.id), binId: Number(binBy(component.bin)?.id), lotId: Number(lotBy(component.lot)?.id) }
    if (stocks.some(row => row.product_id === key.productId && row.bin_id === key.binId && row.lot_id === key.lotId)) continue
    await dataOf(token, 'POST', '/api/wms_stock:create', {
      product: { id: key.productId }, bin: { id: key.binId }, lot: { id: key.lotId }, status: 'good',
      qty_on_hand: component.qty, qty_allocated: 0, qty_locked: 0, qty_available: component.qty, version: 1,
    })
    stockAdded += 1
  }
  const movements = await rowsOf(token, 'wms_movements', 1000)
  let movesAdded = 0
  for (const component of COMPONENT_STOCK) {
    const docNo = `RCV-B6-${component.lot.slice(-2)}`
    if (movements.some(row => row.doc_no === docNo && row.move_type === 'RECEIPT')) continue
    // W2-B3: the seed movement rides the engine's single writer (biz_date filled).
    await appendMovement(token, {
      move_type: 'RECEIPT', doc_no: docNo,
      product: { id: Number(productBy(component.sku)?.id) }, lot: { id: Number(lotBy(component.lot)?.id) },
      to_bin: { id: Number(binBy(component.bin)?.id) },
      qty: component.qty, note: 'B6 生产组件备料入库（齐套物料面）',
    })
    movesAdded += 1
  }
  console.log(`nocobase-w6: seed components +${lotsAdded} lots / +${stockAdded} stock / +${movesAdded} movements（MO-1 全齐、MO-2 SKN/VEG 缺口）`)

  // The execution documents in draft.
  const mos = await rowsOf(token, 'mfg_orders')
  const moBy = (code: string): Record<string, any> | undefined => mos.find(row => row.code === code)
  const lotOf = (sku: string): Record<string, any> | undefined => lotBy(COMPONENT_STOCK.find(row => row.sku === sku)?.lot ?? '')
  const upsertDoc = async (collection: string, code: string, values: Record<string, unknown>): Promise<void> => {
    if ((await rowsOf(token, collection)).some(row => row.code === code)) return
    await dataOf(token, 'POST', `/api/${collection}:create`, { code, ...values })
  }
  for (const issue of SEED_ISSUES) {
    await upsertDoc('mfg_material_issues', issue.code, {
      mo: { id: Number(moBy(issue.mo)?.id) }, issue_date: iso(0),
      product: { id: Number(productBy(issue.sku)?.id) }, qty: issue.qty,
      lot: { id: Number(lotOf(issue.sku)?.id) }, status: 'draft', note: issue.note,
    })
  }
  for (const back of SEED_RETURNS) {
    await upsertDoc('mfg_material_returns', back.code, {
      mo: { id: Number(moBy(back.mo)?.id) }, return_date: iso(0),
      product: { id: Number(productBy(back.sku)?.id) }, qty: back.qty,
      lot: { id: Number(lotOf(back.sku)?.id) }, status: 'draft', note: back.note,
    })
  }
  for (const report of SEED_REPORTS) {
    await upsertDoc('mfg_job_reports', report.code, {
      mo: { id: Number(moBy(report.mo)?.id) }, op_seq: report.opSeq, report_date: iso(0),
      qty_good: report.qtyGood, qty_scrap: report.qtyScrap, duration_min: report.durationMin,
      operator: report.operator, qc_status: 'not_required', status: 'draft', remark: report.remark,
    })
  }
  for (const completion of SEED_COMPLETIONS) {
    await upsertDoc('mfg_completions', completion.code, {
      mo: { id: Number(moBy(completion.mo)?.id) }, qty: completion.qty,
      oqc_status: 'not_required', status: 'draft', note: completion.note,
    })
  }
  console.log(`nocobase-w6: seed execution docs — issues ${String(SEED_ISSUES.length)} / returns ${String(SEED_RETURNS.length)} / reports ${String(SEED_REPORTS.length)} / completions ${String(SEED_COMPLETIONS.length)}（draft）`)
}

// ─── the five 生产制造 v2 pages (E1 table spine, uid prefix w6mfg) ───

type FieldKind = 'input' | 'select' | 'number' | 'm2o' | 'date' | 'boolean' | 'textarea'
type FieldSpec = { name: string, title: string, kind: FieldKind, options?: object[], required?: boolean }
type BlockSpec = {
  heading: string
  collection: string
  columns: ReadonlyArray<FieldSpec>
  formFields?: ReadonlyArray<FieldSpec>
}
type PageSpec = { title: string, icon: string, blocks: ReadonlyArray<BlockSpec> }

const PAGES: ReadonlyArray<PageSpec> = [
  {
    title: '领料单', icon: 'ExportOutlined', blocks: [
      {
        heading: '生产领料（齐套后经引擎过账 → 车间线边）', collection: 'mfg_material_issues',
        columns: [
          { name: 'code', title: '领料单号', kind: 'input' },
          { name: 'mo', title: '生产订单', kind: 'm2o' },
          { name: 'issue_date', title: '领料日期', kind: 'date' },
          { name: 'product', title: '组件物料', kind: 'm2o' },
          { name: 'qty', title: '领料数量', kind: 'number' },
          { name: 'lot', title: '批次(FEFO)', kind: 'm2o' },
          { name: 'status', title: '状态', kind: 'select', options: EXEC_DOC_STATUS },
          { name: 'note', title: '备注', kind: 'input' },
        ],
        formFields: [
          { name: 'code', title: '领料单号', kind: 'input', required: true },
          { name: 'mo', title: '生产订单', kind: 'm2o', required: true },
          { name: 'issue_date', title: '领料日期', kind: 'date' },
          { name: 'product', title: '组件物料', kind: 'm2o', required: true },
          { name: 'qty', title: '领料数量', kind: 'number' },
          { name: 'lot', title: '批次(FEFO)', kind: 'm2o' },
          { name: 'status', title: '状态', kind: 'select', options: EXEC_DOC_STATUS },
          { name: 'note', title: '备注', kind: 'textarea' },
        ],
      },
    ],
  },
  {
    title: '退料单', icon: 'RollbackOutlined', blocks: [
      {
        heading: '生产退料（线边 → 仓库，负向流水）', collection: 'mfg_material_returns',
        columns: [
          { name: 'code', title: '退料单号', kind: 'input' },
          { name: 'mo', title: '生产订单', kind: 'm2o' },
          { name: 'return_date', title: '退料日期', kind: 'date' },
          { name: 'product', title: '组件物料', kind: 'm2o' },
          { name: 'qty', title: '退料数量', kind: 'number' },
          { name: 'lot', title: '批次', kind: 'm2o' },
          { name: 'status', title: '状态', kind: 'select', options: EXEC_DOC_STATUS },
          { name: 'note', title: '备注', kind: 'input' },
        ],
        formFields: [
          { name: 'code', title: '退料单号', kind: 'input', required: true },
          { name: 'mo', title: '生产订单', kind: 'm2o', required: true },
          { name: 'return_date', title: '退料日期', kind: 'date' },
          { name: 'product', title: '组件物料', kind: 'm2o', required: true },
          { name: 'qty', title: '退料数量', kind: 'number' },
          { name: 'lot', title: '批次', kind: 'm2o' },
          { name: 'status', title: '状态', kind: 'select', options: EXEC_DOC_STATUS },
          { name: 'note', title: '备注', kind: 'textarea' },
        ],
      },
    ],
  },
  {
    title: '报工记录', icon: 'FormOutlined', blocks: [
      {
        heading: '工序报工（合格/不合格/工时 → 工序进度）', collection: 'mfg_job_reports',
        columns: [
          { name: 'code', title: '报工单号', kind: 'input' },
          { name: 'mo', title: '生产订单', kind: 'm2o' },
          { name: 'op_seq', title: '工序号', kind: 'number' },
          { name: 'report_date', title: '报工日期', kind: 'date' },
          { name: 'qty_good', title: '合格数量', kind: 'number' },
          { name: 'qty_scrap', title: '不合格数量', kind: 'number' },
          { name: 'duration_min', title: '工时(分)', kind: 'number' },
          { name: 'operator', title: '报工人', kind: 'input' },
          { name: 'qc_status', title: 'IPQC 状态', kind: 'select', options: QC_STATUS },
          { name: 'status', title: '状态', kind: 'select', options: EXEC_DOC_STATUS },
        ],
        formFields: [
          { name: 'code', title: '报工单号', kind: 'input', required: true },
          { name: 'mo', title: '生产订单', kind: 'm2o', required: true },
          { name: 'op_seq', title: '工序号', kind: 'number', required: true },
          { name: 'report_date', title: '报工日期', kind: 'date' },
          { name: 'qty_good', title: '合格数量', kind: 'number' },
          { name: 'qty_scrap', title: '不合格数量', kind: 'number' },
          { name: 'duration_min', title: '工时(分)', kind: 'number' },
          { name: 'operator', title: '报工人', kind: 'input' },
          { name: 'qc_status', title: 'IPQC 状态', kind: 'select', options: QC_STATUS },
          { name: 'status', title: '状态', kind: 'select', options: EXEC_DOC_STATUS },
          { name: 'remark', title: '备注', kind: 'textarea' },
        ],
      },
    ],
  },
  {
    title: '完工单', icon: 'CheckCircleOutlined', blocks: [
      {
        heading: '完工入库（成品 → 待检区 → OQC 放行）', collection: 'mfg_completions',
        columns: [
          { name: 'code', title: '完工单号', kind: 'input' },
          { name: 'mo', title: '生产订单', kind: 'm2o' },
          { name: 'qty', title: '完工数量', kind: 'number' },
          { name: 'lot_no', title: '成品批次', kind: 'input' },
          { name: 'oqc_status', title: 'OQC 状态', kind: 'select', options: OQC_STATUS },
          { name: 'status', title: '状态', kind: 'select', options: EXEC_DOC_STATUS },
          { name: 'completed_at', title: '完工日期', kind: 'date' },
          { name: 'note', title: '备注', kind: 'input' },
        ],
        formFields: [
          { name: 'code', title: '完工单号', kind: 'input', required: true },
          { name: 'mo', title: '生产订单', kind: 'm2o', required: true },
          { name: 'qty', title: '完工数量', kind: 'number' },
          { name: 'lot_no', title: '成品批次', kind: 'input' },
          { name: 'oqc_status', title: 'OQC 状态', kind: 'select', options: OQC_STATUS },
          { name: 'status', title: '状态', kind: 'select', options: EXEC_DOC_STATUS },
          { name: 'note', title: '备注', kind: 'textarea' },
        ],
      },
    ],
  },
  {
    title: 'MO 执行视图', icon: 'DashboardOutlined', blocks: [
      {
        heading: 'MO 三量 + 成本双列（released → in_progress → completed）', collection: 'mfg_orders',
        columns: [
          { name: 'code', title: '订单号', kind: 'input' },
          { name: 'product', title: '成品物料', kind: 'm2o' },
          { name: 'qty', title: '需求数量', kind: 'number' },
          { name: 'doc_status', title: '状态', kind: 'select', options: MO_STATUS },
          { name: 'reservation_state', title: '齐套状态', kind: 'select', options: opts([['none', '未齐套', 'default'], ['partial', '部分齐套', 'orange'], ['assigned', '已齐套', 'green']]) },
          { name: 'qty_transferred', title: '已转数量(当量)', kind: 'number' },
          { name: 'qty_consumed', title: '已报工产出', kind: 'number' },
          { name: 'std_cost', title: '标准成本(卷算)', kind: 'number' },
          { name: 'actual_cost', title: '实际成本', kind: 'number' },
          { name: 'cost_variance', title: '成本差异', kind: 'number' },
        ],
      },
      {
        heading: '工序进度（planned → started → done）', collection: 'mfg_order_operations',
        columns: [
          { name: 'order', title: '生产订单', kind: 'm2o' },
          { name: 'seq', title: '顺序', kind: 'number' },
          { name: 'name', title: '工序名', kind: 'input' },
          { name: 'workcenter', title: '工作中心', kind: 'm2o' },
          { name: 'planned_date', title: '计划日期', kind: 'date' },
          { name: 'planned_min', title: '计划工时(分)', kind: 'number' },
          { name: 'status', title: '状态', kind: 'select', options: opts([['planned', '已排产', 'blue'], ['started', '已开工', 'orange'], ['done', '已完工', 'green']]) },
        ],
      },
    ],
  },
]

const listModels = (token: string): Promise<FlowModelRow[]> => listFlowModels(token, 'W6')
const listAllRoutes = (token: string): Promise<RouteRow[]> => listRoutes(token, 'W6')

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
    // No TextArea edit model exists in the client registry (verified live:
    // "Model class 'TextAreaFieldModel' not found"); the field's own
    // uiSchema (Input.TextArea) shapes the multiline rendering.
    case 'boolean': return 'CheckboxFieldModel'
    default: return 'InputFieldModel'
  }
}

function formGrid(collection: string, fields: ReadonlyArray<FieldSpec>): Record<string, unknown> {
  const itemUids = fields.map(() => withN17Prefix('w6mfg', 'i'))
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

/** The 生产制造 group w5 owns; create only when missing (a standalone first run). */
async function ensureMenuGroup(token: string): Promise<{ id: number }> {
  const existing = (await listAllRoutes(token)).find(row => row.title === MENU_GROUP_TITLE && row.type === 'group')
  if (existing !== undefined) {
    console.log(`nocobase-w6: menu group "${MENU_GROUP_TITLE}" exists (kept)`)
    return { id: existing.id }
  }
  const row = await dataOf(token, 'POST', '/api/desktopRoutes:create', { title: MENU_GROUP_TITLE, icon: 'ExperimentOutlined', type: 'group' })
  console.log(`nocobase-w6: menu group "${MENU_GROUP_TITLE}" created`)
  return { id: Number(row.id) }
}

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
    console.log(`nocobase-w6: v2 page "${spec.title}" exists (kept)`)
    return
  }
  if ((await listAllRoutes(token)).some(row => row.title === spec.title && row.type === 'page')) {
    throw new Error(`a v1 page named "${spec.title}" already exists; rename it first`)
  }
  const routeUid = withN17Prefix('w6mfg', '')
  const page = await dataOf(token, 'POST', '/api/desktopRoutes:create', { title: spec.title, icon: spec.icon, type: 'flowPage', parentId: groupId, sort, schemaUid: routeUid })
  const tabUid = withN17Prefix('w6mfg', 't')
  await dataOf(token, 'POST', '/api/desktopRoutes:create', { title: '', type: 'tabs', parentId: page.id, schemaUid: tabUid, tabSchemaName: withN17Prefix('w6mfg', 'ts') })

  const save = (model: Record<string, unknown>) => dataOf(token, 'POST', '/api/flowModels:save', model)
  await save({ uid: routeUid, schema: { use: 'RouteModel' } })
  await save({ uid: tabUid, schema: { use: 'RouteModel' } })
  const pageUid = withN17Prefix('w6mfg', 'p')
  await save({ uid: pageUid, parentId: routeUid, subKey: 'page', subType: 'object', use: 'RootPageModel', props: { title: spec.title, displayTitle: true, enableTabs: false }, stepParams: { pageSettings: { general: { title: spec.title, displayTitle: true, enableTabs: false } } } })
  const gridUid = withN17Prefix('w6mfg', 'g')
  await save({ uid: gridUid, parentId: tabUid, subKey: 'grid', subType: 'object', use: 'BlockGridModel', props: {}, filterManager: [] })

  let blockIndex = 0
  for (const block of spec.blocks) {
    blockIndex += 1
    const tableUid = withN17Prefix('w6mfg', 'tb')
    await save({
      uid: tableUid, use: 'TableBlockModel', parentId: gridUid, subKey: 'items', subType: 'array', sortIndex: blockIndex,
      props: { title: block.heading },
      stepParams: { resourceSettings: { init: { dataSourceKey: 'main', collectionName: block.collection } } },
    })
    let sortIndex = 1
    for (const column of block.columns) {
      const uid = withN17Prefix('w6mfg', 'c')
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
        uid: withN17Prefix('w6mfg', 'rf'), parentId: tableUid, subKey: 'actions', subType: 'array', sortIndex: 2, use: 'RefreshActionModel',
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
      uid: withN17Prefix('w6mfg', 'fa'), parentId: tableUid, subKey: 'actions', subType: 'array', sortIndex: 1,
      use: 'FilterActionModel', props: {},
      stepParams: { buttonSettings: { general: { title: '{{t("Filter")}}' } } },
    })
    await save({
      uid: withN17Prefix('w6mfg', 'an'), parentId: tableUid, subKey: 'actions', subType: 'array', sortIndex: 2, use: 'AddNewActionModel', props: {},
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
      uid: withN17Prefix('w6mfg', 'rf'), parentId: tableUid, subKey: 'actions', subType: 'array', sortIndex: 3, use: 'RefreshActionModel',
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
  console.log(`nocobase-w6: v2 page "${spec.title}" created (/admin/${routeUid}) with ${spec.blocks.length} block(s)`)
}

// ─── the demo chain (07-b6 验收 checkbox 1:1; idempotent replay) ───

async function expectRefusal(label: string, body: () => Promise<unknown>): Promise<string> {
  try {
    await body()
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.log(`nocobase-w6: [chain] 卡口负例 ✓ ${label} → ${message.slice(0, 110)}`)
    return message
  }
  throw new Error(`卡口负例未拦截：${label}（本应被拒绝却成功了）`)
}

async function demoChain(token: string): Promise<void> {
  const mos = await rowsOf(token, 'mfg_orders')
  const mo1 = mos.find(row => row.code === 'MO-2026-0001')
  const mo2 = mos.find(row => row.code === 'MO-2026-0002')
  const mo3 = mos.find(row => row.code === 'MO-2026-0003')
  if (mo1 === undefined || mo2 === undefined) throw new Error('种子缺失：MO-2026-0001/0002（先跑本脚本主流程 + nocobase-w5-mfg.mts --demo-chain）')

  console.log('nocobase-w6: [chain] ══ 生产执行链演示（齐套→领料→退料→报工→完工→OQC→成本双列）══')

  // Replay guard: once MO-1 sits completed the chain has already run — the
  // posting legs are single-shot, so replay verifies the terminal state and
  // the ledger instead of re-walking the gates.
  if (String(mo1.doc_status) === 'completed') {
    const final1 = (await rowsOf(token, 'mfg_orders')).find(row => row.code === 'MO-2026-0001')
    for (const column of ['std_cost', 'actual_cost', 'cost_variance']) {
      if (final1?.[column] === null || final1?.[column] === undefined || Number(final1[column]) === 0) {
        throw new Error(`重放校验失败：MO-1 ${column} 未结算（${String(final1?.[column])}）`)
      }
    }
    runScript('nocobase-h5-wms.mts', ['--assert-ledger'])
    console.log(`nocobase-w6: [chain] 重放校验 ✓ MO-1 ${String(final1?.doc_status)}（成本 std ${String(final1?.std_cost)} / actual ${String(final1?.actual_cost)} / 差异 ${String(final1?.cost_variance)}），对账绿——链已完整走过（单张重放走 kept）`)
    return
  }

  // S0 卡口负例：draft MO 不能齐套（MO-0003 留 draft 的复用位）。
  if (mo3 !== undefined && String(mo3.doc_status) === 'draft') {
    runScript('nocobase-h5-wms.mts', ['--availability-check', 'MO-2026-0003'], '齐套被拒')
    console.log('nocobase-w6: [chain] 卡口负例 ✓ draft MO 齐套被拒（未生效不得驱动执行）')
  }

  // S1 MO-1 齐套：assigned + 4 行硬预留（同源 wms_reservations）。
  runScript('nocobase-h5-wms.mts', ['--availability-check', 'MO-2026-0001'])
  {
    const mo1Now = (await rowsOf(token, 'mfg_orders')).find(row => row.code === 'MO-2026-0001')
    if (String(mo1Now?.reservation_state) !== 'assigned') throw new Error(`MO-1 齐套断言失败（${String(mo1Now?.reservation_state)}）`)
    const reserved = (await rowsOf(token, 'wms_reservations')).filter(row => row.ref_type === 'MO' && row.ref_id === 'MO-2026-0001' && row.status === 'reserved')
    if (reserved.length !== 4) throw new Error(`MO-1 硬预留断言失败（${String(reserved.length)} 行 ≠ BOM 组件数 4）`)
    console.log(`nocobase-w6: [chain] 齐套 ✓ MO-1 assigned，硬预留 ${String(reserved.length)} 行（BOM 组件数）`)
  }

  // S2 MO-2 齐套：partial + 缺料清单（SKN/VEG 短缺）。
  runScript('nocobase-h5-wms.mts', ['--availability-check', 'MO-2026-0002'])
  {
    const mo2Now = (await rowsOf(token, 'mfg_orders')).find(row => row.code === 'MO-2026-0002')
    if (String(mo2Now?.reservation_state) !== 'partial') throw new Error(`MO-2 齐套断言失败（${String(mo2Now?.reservation_state)} ≠ partial）`)
    const kit = JSON.parse(String(mo2Now?.kit_data ?? '{}')) as { rows?: Array<{ sku?: string, shortfall?: number }> }
    const short = (kit.rows ?? []).filter(row => Number(row.shortfall) > 0).map(row => String(row.sku))
    if (short.length !== 2 || !short.includes('RM-DMP-SKN') || !short.includes('RM-DMP-VEG')) {
      throw new Error(`MO-2 缺料清单断言失败（${short.join('、')} ≠ RM-DMP-SKN/RM-DMP-VEG）`)
    }
    console.log(`nocobase-w6: [chain] 齐套 ✓ MO-2 partial，缺料清单 ${short.join('、')}（kit_data JSON）`)
  }

  // S3 卡口负例：partial MO 不能领料。
  {
    const issues = await rowsOf(token, 'mfg_material_issues')
    if (!issues.some(row => row.code === 'MI-2026-0006')) {
      await dataOf(token, 'POST', '/api/mfg_material_issues:create', {
        code: 'MI-2026-0006', mo: { id: Number(mo2.id) }, issue_date: iso(0),
        product: { id: Number((await rowsOf(token, 'hub_inv_products', 200)).find(row => row.sku === 'RM-DMP-PRK')?.id) },
        qty: 3000, status: 'draft', note: '负例素材：partial MO 领料',
      })
    }
    runScript('nocobase-h5-wms.mts', ['--post-issue', 'MI-2026-0006'], '领料被拒')
    console.log('nocobase-w6: [chain] 卡口负例 ✓ partial MO 领料被拒（未齐套不能领料）')
  }

  // S4 MO-1 四行领料：预留转 consumed + ISSUE_WIP ±对 + WIP 线边 + released→in_progress。
  for (const code of ['MI-2026-0001', 'MI-2026-0002', 'MI-2026-0003', 'MI-2026-0004']) {
    runScript('nocobase-h5-wms.mts', ['--post-issue', code])
  }
  {
    const mo1Now = (await rowsOf(token, 'mfg_orders')).find(row => row.code === 'MO-2026-0001')
    if (String(mo1Now?.doc_status) !== 'in_progress') throw new Error(`MO-1 领料后状态断言失败（${String(mo1Now?.doc_status)} ≠ in_progress）`)
    if (Number(mo1Now?.qty_transferred ?? 0) + 1e-9 < 12_000) throw new Error(`MO-1 qty_transferred 断言失败（${String(mo1Now?.qty_transferred)} < 12000）`)
    const consumed = (await rowsOf(token, 'wms_reservations')).filter(row => row.ref_type === 'MO' && row.ref_id === 'MO-2026-0001' && row.status === 'consumed')
    if (consumed.length !== 4) throw new Error(`MO-1 预留消耗断言失败（${String(consumed.length)} ≠ 4）`)
    console.log(`nocobase-w6: [chain] 领料 ✓ 4 行 posted，预留 consumed ×4，MO-1 → in_progress，qty_transferred=${String(mo1Now?.qty_transferred)}`)
  }

  // S5 卡口负例：超领（预留已全额消耗，再领被拒）。
  {
    const issues = await rowsOf(token, 'mfg_material_issues')
    if (!issues.some(row => row.code === 'MI-2026-0005')) {
      await dataOf(token, 'POST', '/api/mfg_material_issues:create', {
        code: 'MI-2026-0005', mo: { id: Number(mo1.id) }, issue_date: iso(0),
        product: { id: Number((await rowsOf(token, 'hub_inv_products', 200)).find(row => row.sku === 'RM-SNA-PKG')?.id) },
        qty: 100, status: 'draft', note: '负例素材：超领（预留已领完）',
      })
    }
    runScript('nocobase-h5-wms.mts', ['--post-issue', 'MI-2026-0005'], '领料被拒')
    console.log('nocobase-w6: [chain] 卡口负例 ✓ 超领被拒（累计不可超预留需求）')
  }

  // S6 退料：WIP → 仓库（RETURN_WIP ±对，qty_transferred 重算）。
  runScript('nocobase-h5-wms.mts', ['--post-return', 'MR-2026-0001'])
  {
    const mo1Now = (await rowsOf(token, 'mfg_orders')).find(row => row.code === 'MO-2026-0001')
    const expected = Math.round((12_120 - 100) / 1.01 * 100) / 100
    if (Math.abs(Number(mo1Now?.qty_transferred ?? 0) - expected) > 0.01) {
      throw new Error(`MO-1 退料后 qty_transferred 断言失败（${String(mo1Now?.qty_transferred)} ≠ ${String(expected)}）`)
    }
    console.log(`nocobase-w6: [chain] 退料 ✓ PKG −100 回库，qty_transferred 重算 ${String(mo1Now?.qty_transferred)}`)
  }

  // S7 三工序报工：planned → started → done，末工序报齐（qty_consumed=12000）。
  for (const code of ['JR-2026-0001', 'JR-2026-0002', 'JR-2026-0003']) {
    runScript('nocobase-h5-wms.mts', ['--post-report', code])
  }
  {
    const mo1Now = (await rowsOf(token, 'mfg_orders')).find(row => row.code === 'MO-2026-0001')
    if (Number(mo1Now?.qty_consumed ?? 0) !== 12_000) throw new Error(`MO-1 qty_consumed 断言失败（${String(mo1Now?.qty_consumed)} ≠ 12000）`)
    const ops = (await rowsOf(token, 'mfg_order_operations')).filter(row => Number(row.order_id) === Number(mo1.id))
    const done = ops.filter(row => String(row.status) === 'done')
    if (done.length !== ops.length || ops.length < 3) throw new Error(`MO-1 工序推进断言失败（${String(done.length)}/${String(ops.length)} done）`)
    console.log(`nocobase-w6: [chain] 报工 ✓ 3 工序 done，qty_consumed=${String(mo1Now?.qty_consumed)}（末工序报齐）`)
  }

  // S8 卡口负例：完工数量 > 报工合格累计被拒。
  {
    const completions = await rowsOf(token, 'mfg_completions')
    if (!completions.some(row => row.code === 'MC-2026-0002')) {
      await dataOf(token, 'POST', '/api/mfg_completions:create', {
        code: 'MC-2026-0002', mo: { id: Number(mo1.id) }, qty: 13_000,
        oqc_status: 'not_required', status: 'draft', note: '负例素材：完工超报工',
      })
    }
    runScript('nocobase-h5-wms.mts', ['--post-completion', 'MC-2026-0002'], '完工被拒')
    console.log('nocobase-w6: [chain] 卡口负例 ✓ 完工 13000 > 报工合格 12000 被拒')
  }

  // S9 完工：新批次四日期 → 待检区 hold + RECEIPT_MFG + MO completed + 成本双列结算。
  runScript('nocobase-h5-wms.mts', ['--post-completion', 'MC-2026-0001'])
  {
    const mo1Now = (await rowsOf(token, 'mfg_orders')).find(row => row.code === 'MO-2026-0001')
    if (String(mo1Now?.doc_status) !== 'completed') throw new Error(`MO-1 完工后状态断言失败（${String(mo1Now?.doc_status)} ≠ completed）`)
    for (const column of ['std_cost', 'actual_cost', 'cost_variance']) {
      if (mo1Now?.[column] === null || mo1Now?.[column] === undefined || Number(mo1Now[column]) === 0) {
        throw new Error(`MO-1 成本列 ${column} 未结算（${String(mo1Now?.[column])}）`)
      }
    }
    const std = Number(mo1Now?.std_cost)
    const actual = Number(mo1Now?.actual_cost)
    const variance = Number(mo1Now?.cost_variance)
    if (Math.abs(variance - Math.round((actual - std) * 100) / 100) > 0.01) {
      throw new Error(`MO-1 成本差异断言失败（variance ${String(variance)} ≠ actual ${String(actual)} − std ${String(std)}）`)
    }
    const completion = (await rowsOf(token, 'mfg_completions')).find(row => row.code === 'MC-2026-0001')
    if (String(completion?.oqc_status) !== 'pending') throw new Error(`完工单 OQC 状态断言失败（${String(completion?.oqc_status)} ≠ pending）`)
    const lot = (await rowsOf(token, 'wms_lots')).find(row => row.lot_no === String(completion?.lot_no))
    if (lot === undefined || String(lot.status) !== 'quarantined') throw new Error('完工批次未落待检（lot 缺失或非隔离）')
    console.log(`nocobase-w6: [chain] 完工 ✓ 批次 ${String(completion?.lot_no)} → 待检区（hold/quarantined），MO-1 → completed`)
    console.log(`nocobase-w6: [chain] 成本双列 ✓ std=${String(std)} actual=${String(actual)} variance=${String(variance)}（差异=Σ材料差+Σ工时差）`)
  }

  // S10 OQC 放行：待检 → 合格区（±MOVE 对，lot qualified，oqc passed）。
  runScript('nocobase-h5-wms.mts', ['--release-completion', 'MC-2026-0001'])
  {
    const completion = (await rowsOf(token, 'mfg_completions')).find(row => row.code === 'MC-2026-0001')
    const lot = (await rowsOf(token, 'wms_lots')).find(row => row.lot_no === String(completion?.lot_no))
    if (String(completion?.oqc_status) !== 'passed' || String(lot?.status) !== 'qualified') {
      throw new Error(`OQC 放行断言失败（oqc=${String(completion?.oqc_status)} lot=${String(lot?.status)}）`)
    }
    console.log('nocobase-w6: [chain] OQC 放行 ✓ hold→good，lot qualified，合格区可发（SO 预留挂点 B7）')
  }

  // S11 对账：stock == Σmovements 全链后仍绿。
  runScript('nocobase-h5-wms.mts', ['--assert-ledger'])

  // S12 终态快照（psql 复核口径）。
  const final1 = (await rowsOf(token, 'mfg_orders')).find(row => row.code === 'MO-2026-0001')
  console.log('nocobase-w6: [chain] ══ 终态 ══')
  console.log(`nocobase-w6: [chain] MO-1: ${String(final1?.doc_status)} / 齐套 ${String(final1?.reservation_state)} / 三量 ${String(final1?.qty)}→${String(final1?.qty_transferred)}→${String(final1?.qty_consumed)} / 成本 std ${String(final1?.std_cost)} vs actual ${String(final1?.actual_cost)}（差异 ${String(final1?.cost_variance)}）`)
  console.log('nocobase-w6: [chain] done — 齐套硬预留/领退料/报工/完工/OQC/成本双列 全通（对账绿）')
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
  const missingPages = ['领料单', '退料单', '报工记录', '完工单', 'MO 执行视图'].filter(title => !flowPageTitles.has(title))
  if (missingPages.length > 0) failures.push(`生产执行 v2 pages missing: ${missingPages.join(', ')}`)
  if (!routes.some(row => row.title === MENU_GROUP_TITLE && row.type === 'group')) failures.push(`menu group ${MENU_GROUP_TITLE} missing`)
  const fieldNames = new Set(((await dataOf(token, 'GET', `/api/fields:list?filter=${encodeURIComponent(JSON.stringify({ collectionName: { $eq: 'mfg_orders' } }))}&pageSize=200`) as Array<{ name?: string }> | null) ?? []).map(field => field.name))
  for (const column of ['qty_transferred', 'qty_consumed', 'actual_cost', 'cost_variance', 'kit_data']) {
    if (!fieldNames.has(column)) failures.push(`mfg_orders.${column} missing`)
  }
  const statusField = await dataOf(token, 'GET', `/api/fields:list?filter=${encodeURIComponent(JSON.stringify({ collectionName: { $eq: 'mfg_orders' }, name: { $eq: 'doc_status' } }))}&pageSize=1`) as Array<{ uiSchema?: { enum?: Array<{ value?: string }> } }> | null
  const stored = statusField?.[0]?.uiSchema?.enum ?? []
  for (const value of ['in_progress', 'completed']) {
    if (!stored.some(option => option.value === value)) failures.push(`mfg_orders.doc_status enum lacks ${value}`)
  }
  const wipBin = (await rowsOf(token, 'wms_bins', 200)).find(row => row.code === 'SH-WIP-01-01')
  if (wipBin === undefined) failures.push('WIP 线边库位 SH-WIP-01-01 missing (run nocobase-h5-wms.mts for the B6 virtual zone)')
  const moveField = await dataOf(token, 'GET', `/api/fields:list?filter=${encodeURIComponent(JSON.stringify({ collectionName: { $eq: 'wms_movements' }, name: { $eq: 'move_type' } }))}&pageSize=1`) as Array<{ uiSchema?: { enum?: Array<{ value?: string }> } }> | null
  const moveEnum = moveField?.[0]?.uiSchema?.enum ?? []
  for (const leg of ['ISSUE_WIP', 'RETURN_WIP', 'RECEIPT_MFG']) {
    if (!moveEnum.some(option => option.value === leg)) failures.push(`wms_movements.move_type enum lacks ${leg}`)
  }
  // Seed floors (the execution documents the demo chain posts).
  for (const [collection, floor] of [
    ['mfg_material_issues', 4], ['mfg_material_returns', 1],
    ['mfg_job_reports', 3], ['mfg_completions', 1],
  ] as const) {
    const count = (await rowsOf(token, collection)).length
    if (count < floor) failures.push(`${collection} has ${String(count)} rows (< ${String(floor)})`)
  }
  // The B5 handover invariant: MO-2026-0003 stays draft for the full-chain replay.
  const mo3 = (await rowsOf(token, 'mfg_orders')).find(row => row.code === 'MO-2026-0003')
  if (mo3 !== undefined && String(mo3.doc_status) !== 'draft') failures.push(`MO-2026-0003 must stay draft（复用走全链；当前 ${String(mo3.doc_status)}）`)
  if (failures.length > 0) {
    throw new Error(`nocobase-w6 verify FAILED:\n  - ${failures.join('\n  - ')}`)
  }
  console.log('nocobase-w6: verify OK — 4 collections + 5 pages + mfg_orders 执行列/枚举 + WIP/流水枚举 + seeds（MO-0003 draft 保持）')
}

// ─── rollback ───

async function rollback(token: string): Promise<void> {
  let destroyedModels = 0
  for (const row of await listModels(token)) {
    if (String(row.uid ?? '').startsWith('w6mfg')) {
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
    console.log(`nocobase-w6: ${destroyedModels} w6mfg flowModels destroyed, ${swept} orphaned n18ai- buttons swept`)
  }
  for (const spec of PAGES) {
    const flow = (await listAllRoutes(token)).find(row => row.title === spec.title && row.type === 'flowPage')
    if (flow === undefined) continue
    for (const tab of (await listAllRoutes(token)).filter(row => row.parentId === flow.id && row.type === 'tabs')) {
      await call(token, 'DELETE', `/api/desktopRoutes:destroy?filterByTk=${tab.id}`)
    }
    await call(token, 'DELETE', `/api/desktopRoutes:destroy?filterByTk=${flow.id}`)
  }
  // The B6 seed stock/lots/movements/reservations on the shared WMS plane
  // (business-key scoped so B4's own seeds survive).
  for (const row of (await rowsOf(token, 'wms_reservations')).filter(item => String(item.code ?? '').startsWith('RSV-MO-'))) {
    await call(token, 'POST', `/api/wms_reservations:destroy?filterByTk=${row.id}`)
  }
  for (const row of (await rowsOf(token, 'wms_movements', 1000)).filter(item => String(item.doc_no ?? '').startsWith('RCV-B6-'))) {
    await call(token, 'POST', `/api/wms_movements:destroy?filterByTk=${row.id}`)
  }
  {
    const products = await rowsOf(token, 'hub_inv_products', 200)
    const componentIds = new Set(COMPONENT_STOCK.map(component => Number(products.find(row => row.sku === component.sku)?.id)))
    for (const row of (await rowsOf(token, 'wms_stock', 500)).filter(item => componentIds.has(Number(item.product_id)))) {
      await call(token, 'POST', `/api/wms_stock:destroy?filterByTk=${row.id}`)
    }
    const componentLots = new Set(COMPONENT_STOCK.map(component => component.lot))
    for (const row of (await rowsOf(token, 'wms_lots')).filter(item => componentLots.has(String(item.lot_no)))) {
      await call(token, 'POST', `/api/wms_lots:destroy?filterByTk=${row.id}`)
    }
  }
  // mfg_orders execution columns (the enum growth stays — it is additive).
  for (const column of MO_COLUMNS) {
    const name = (column.field as { name: string }).name
    try {
      await call(token, 'POST', `/api/collections/mfg_orders/fields:destroy?filterByTk=${encodeURIComponent(name)}`)
    } catch {
      // A fresh install that never ran B6 lacks the column; the miss is fine.
    }
  }
  for (const collection of [...COLLECTIONS].reverse()) {
    const existing = await dataOf(token, 'GET', `/api/collections/${collection.name}`)
    if (existing !== null) {
      await call(token, 'POST', `/api/collections:destroy?filterByTk=${collection.name}&cascade=true&drop=true&skipChildren=true`)
    }
  }
  console.log('nocobase-w6: rollback done — pages/columns/collections + B6 WMS seeds removed')
}

// ─── main ───

async function main(): Promise<void> {
  const args = process.argv.slice(2)
  const token = await signInWithRetry()
  if (args.includes('--rollback-w2b6')) {
    await rollbackW2b6(token)
    console.log('nocobase-w6: done (rollback-w2b6)')
    return
  }
  if (args.includes('--rollback')) {
    await rollback(token)
    console.log('nocobase-w6: done (rollback)')
    return
  }
  if (args.includes('--demo-chain')) {
    await demoChain(token)
    return
  }
  await ensureCollections(token)
  await ensureMfgColumns(token)
  await ensureW2b6PageIncrements(token)
  await seedRows(token)
  const group = await ensureMenuGroup(token)
  let sort = 6
  for (const spec of PAGES) {
    await ensureV2Page(token, spec, group.id, sort++)
  }
  await verify(token)
  console.log('nocobase-w6: done')
}

await main()