/**
 * W3-B1: idempotent heal that wires row details onto every flow-engine
 * table block, repairs the three broken view links, and grants the member
 * role per-collection view ACL. Root cause (P0 report): the 13 v2 factory
 * scripts replicate the E1 table template with AddNew+Refresh only — 94 of
 * 95 table blocks have no row actions at all; the one hand-built actions
 * column on the 项目 page carries a pointer-only ViewActionModel (subModels
 * empty, openView missing mode/pageModelClass/filterByTk), so every drawer
 * opens empty.
 *
 * W3-B2 (same entry, appended phase): subtable drill-down (parallel
 * association-bound table blocks inside each healed row drawer), guarded
 * row actions (Edit with the engine-state blacklist, confirm-gated Delete
 * on free-state collections only), and the two-way approval jump (todo →
 * business page, engine-governed row → 审批中心). All B2 nodes use the
 * w3b2 uid prefix (--rollback w3b2); the four line-item pages (入库单/
 * 出库单/盘点管理/领料单) have no child collection in the model — receipts,
 * counts, and issues are line-level documents (fields:list probe 2026-09-27)
 * — so no subtable is fabricated for them.
 *
 * Modes:
 *   node --import tsx/esm examples/kb-agent/scripts/w3-heal-row-details.mts --dry-run
 *       Print the change plan (table triples to add, broken actions to
 *       rewrite, card drawers to backfill, ACL grants) without writing.
 *   node --import tsx/esm examples/kb-agent/scripts/w3-heal-row-details.mts [--only col1,col2]
 *       Execute the plan, then grant member view ACL for every affected
 *       collection, then print the wire-health probe summary. Idempotent:
 *       blocks that already carry a healthy actions column are kept.
 *   node --import tsx/esm examples/kb-agent/scripts/w3-heal-row-details.mts --rollback w3b1
 *       Destroy every w3b1-prefixed flowModels row (children first).
 *
 * All created nodes use the w3b1 uid prefix (rollback anchor). Detail
 * fields mirror each table's existing columns — no extra field reads.
 */
import {
  type DetailFieldSpec,
  type EditFieldSpec,
  type FlowModelRow,
  type SubtableSpec,
  APPROVAL_CENTER_ROUTE,
  APPROVAL_JUMP_ROUTES,
  call,
  dataOf,
  drawerPageTreeFor,
  ensureParentHasMany,
  listFlowModels,
  saveRowDeleteAction,
  saveRowEditAction,
  saveRowJumpAction,
  saveRowViewAction,
  signInWithRetry,
} from './nocobase-flow-page-lib.mts'

// ─── CLI ───

const argv = process.argv.slice(2)
const dryRun = argv.includes('--dry-run')
const rollbackAt = argv.indexOf('--rollback')
const rollbackPrefix = rollbackAt >= 0 ? (argv[rollbackAt + 1] ?? '') : ''
if (rollbackAt >= 0 && !/^[a-z0-9]+$/.test(rollbackPrefix)) {
  throw new Error('--rollback needs an alphanumeric uid prefix argument (e.g. --rollback w3b1)')
}
const onlyAt = argv.indexOf('--only')
const onlyCollections = onlyAt >= 0
  ? new Set((argv[onlyAt + 1] ?? '').split(',').map(name => name.trim()).filter(name => name.length > 0))
  : null
if (onlyAt >= 0 && (onlyCollections === null || onlyCollections.size === 0)) {
  throw new Error('--only needs a comma-separated collection list (e.g. --only pur_orders,pur_order_lines)')
}

// ─── read-only scan ───

type WirePlan = {
  tableUid: string
  collection: string
  fields: DetailFieldSpec[]
  /** Existing healthy actions column — the triple is skipped. */
  healthy: boolean
  /** Existing actions column to reuse for the rewritten view action. */
  actionsColumnUid?: string
  /** Broken View/Edit action rows to destroy before rewriting (empty unless repairing). */
  brokenActionUids: string[]
  /** Trailing sortIndex for a newly created actions column. */
  actionsColumnSortIndex: number
}

type CardDrawerPlan = {
  actionUid: string
  use: string
  collection: string
  fields: DetailFieldSpec[]
}

const healthyOpenView = (row: FlowModelRow, collection: string): boolean => {
  const openView = row?.stepParams?.popupSettings?.openView
  return openView?.mode === 'drawer' && openView?.pageModelClass === 'ChildPageModel'
    && typeof openView?.filterByTk === 'string' && openView?.collectionName === collection
}

const tableFieldsFromColumns = (rows: ReadonlyArray<FlowModelRow>, byParent: ReadonlyMap<string, FlowModelRow[]>, tableUid: string): DetailFieldSpec[] => {
  const columns = (byParent.get(tableUid) ?? [])
    .filter(row => row?.use === 'TableColumnModel' && row?.subKey === 'columns')
    .sort((a, b) => Number(a.sortIndex ?? 0) - Number(b.sortIndex ?? 0))
  const fields: DetailFieldSpec[] = []
  for (const column of columns) {
    const fieldPath = column?.stepParams?.fieldSettings?.init?.fieldPath
    if (typeof fieldPath !== 'string' || fieldPath.length === 0) continue
    const fieldRow = (byParent.get(String(column.uid)) ?? []).find(row => row?.subKey === 'field')
    fields.push({
      fieldPath,
      modelUse: typeof fieldRow?.use === 'string' ? fieldRow.use : 'DisplayTextFieldModel',
      ...(Array.isArray(fieldRow?.props?.options) ? { options: fieldRow.props.options as object[] } : {}),
    })
  }
  return fields
}

/**
 * Probe one action's persisted page subtree (the load-only contract's
 * content half). 204 / empty payload means the drawer would open empty.
 */
async function pageSubtreeExists(token: string, actionUid: string): Promise<boolean> {
  const row = await dataOf(token, 'GET', `/api/flowModels:findOne?parentId=${encodeURIComponent(actionUid)}&subKey=page`)
  return row?.uid != null
}

/** Walk one persisted tree collecting every (node, parentKey) pair depth-first. */
function walkTree(node: unknown, visit: (node: Record<string, any>) => void): void {
  if (Array.isArray(node)) {
    for (const item of node) walkTree(item, visit)
    return
  }
  if (node === null || typeof node !== 'object') return
  const row = node as Record<string, any>
  visit(row)
  for (const child of Object.values(row.subModels ?? {})) walkTree(child, visit)
}

/**
 * The drawer's field list read back from its own DetailsItemModel chain
 * (fieldPath + display model + enum options), ordered by sortIndex — the
 * rebuild source for {@link rescopeDrawers} so a rebuild never drops or
 * reorders fields.
 */
function drawerFieldsOf(pageTree: unknown): DetailFieldSpec[] {
  const items: Array<{ sortIndex: number, spec: DetailFieldSpec }> = []
  walkTree(pageTree, node => {
    if (node.use !== 'DetailsItemModel') return
    const fieldPath = node?.stepParams?.fieldSettings?.init?.fieldPath
    if (typeof fieldPath !== 'string' || fieldPath.length === 0) return
    const field = node?.subModels?.field
    items.push({
      sortIndex: Number(node.sortIndex ?? 0),
      spec: {
        fieldPath,
        modelUse: typeof field?.use === 'string' ? field.use : 'DisplayTextFieldModel',
        ...(Array.isArray(field?.props?.options) ? { options: field.props.options as object[] } : {}),
      },
    })
  })
  return items.sort((a, b) => a.sortIndex - b.sortIndex).map(item => item.spec)
}

/** Subtable specs read back from a drawer tree (association-bound TableBlockModels), so a rebuild keeps its drill-down blocks. */
function subtableSpecsOf(pageTree: unknown): SubtableSpec[] {
  const specs: SubtableSpec[] = []
  walkTree(pageTree, node => {
    if (node.use !== 'TableBlockModel') return
    const init = node?.stepParams?.resourceSettings?.init ?? {}
    if (typeof init.associationName !== 'string' || init.associationName.length === 0) return
    const columns = ((node?.subModels?.columns ?? []) as Array<Record<string, any>>).map(col => {
      const fieldPath = String(col?.stepParams?.fieldSettings?.init?.fieldPath ?? col?.props?.dataIndex ?? '')
      return {
        fieldPath,
        title: String(col?.props?.title ?? fieldPath),
        modelUse: String(col?.stepParams?.tableColumnSettings?.model?.use ?? 'DisplayTextFieldModel'),
        ...(Array.isArray(col?.props?.options) ? { options: col.props.options as object[] } : {}),
      }
    }).filter(col => col.fieldPath.length > 0)
    specs.push({
      collection: String(init.collectionName ?? ''),
      association: String(init.associationName),
      title: String(node?.props?.title ?? '子表'),
      columns,
    })
  })
  return specs
}

/** Whether a persisted drawer tree's DetailsBlockModel init carries the filterByTk scoping key (EditFormModel trees scope by construction). */
function detailsBlockScoped(pageTree: unknown): boolean {
  let scoped = true
  walkTree(pageTree, node => {
    if (node.use !== 'DetailsBlockModel') return
    const init = node?.stepParams?.resourceSettings?.init ?? {}
    if (typeof init.filterByTk !== 'string') scoped = false
  })
  return scoped
}

/**
 * W3-B3 rescope pass. Drawers built before the filterByTk fix render the
 * collection's FIRST record — DetailsBlockModel.createResource builds a
 * MultiRecordResource (pageSize 1) whenever the init params lack the
 * filterByTk key, so every drawer shows record 1 with a 1/N pager no matter
 * which row/card was clicked (found live on the 生产订单 row drawer and the
 * B3 kanban card drawer). Every persisted page subtree whose
 * DetailsBlockModel init lacks the key is destroyed and rebuilt from its own
 * field list (and its own subtable blocks), keeping the action row intact.
 * Idempotent: already-scoped trees are kept untouched.
 */
async function rescopeDrawers(token: string): Promise<void> {
  const rows = await listFlowModels(token, 'w3-heal rescope')
  const actions = rows.filter(row => row?.use === 'ViewActionModel' || row?.use === 'KanbanCardViewActionModel' || row?.use === 'CalendarEventViewActionModel')
  let rebuilt = 0
  for (const action of actions) {
    const actionUid = String(action.uid ?? '')
    if (actionUid.length === 0) continue
    const page = await dataOf(token, 'GET', `/api/flowModels:findOne?parentId=${encodeURIComponent(actionUid)}&subKey=page`)
    if (page?.uid == null) continue
    if (detailsBlockScoped(page)) continue
    const fields = drawerFieldsOf(page)
    const collection = String(action?.stepParams?.popupSettings?.openView?.collectionName ?? '')
    if (fields.length === 0 || collection.length === 0) continue
    const children = subtableSpecsOf(page)
    await call(token, 'POST', `/api/flowModels:destroy?filterByTk=${encodeURIComponent(String(page.uid))}`)
    await dataOf(token, 'POST', '/api/flowModels:save', drawerPageTreeFor(actionUid, {
      collection, fields, tabTitle: '详情', ...(children.length > 0 ? { children } : {}),
    }))
    rebuilt += 1
  }
  console.log(`w3-heal rescope: ${rebuilt > 0 ? `${rebuilt} unscoped drawer(s) rebuilt with filterByTk (${actions.length} actions scanned)` : `all ${actions.length} drawer(s) already scoped (kept)`}`)
}

async function buildPlan(token: string): Promise<{ wires: WirePlan[], cards: CardDrawerPlan[], skipped: string[], byParent: Map<string, FlowModelRow[]> }> {
  const rows = await listFlowModels(token, 'w3-heal-row-details')
  const byParent = new Map<string, FlowModelRow[]>()
  for (const row of rows) {
    const key = String(row.parentId ?? '')
    if (key.length === 0) continue
    const bucket = byParent.get(key)
    if (bucket === undefined) byParent.set(key, [row])
    else bucket.push(row)
  }
  const childrenOf = (uid: string): FlowModelRow[] => byParent.get(String(uid)) ?? []

  const wires: WirePlan[] = []
  const skipped: string[] = []
  for (const table of rows.filter(row => row?.use === 'TableBlockModel')) {
    const collection = table?.stepParams?.resourceSettings?.init?.collectionName
    const tableUid = String(table.uid ?? '')
    if (typeof collection !== 'string' || collection.length === 0) {
      skipped.push(`${tableUid} (no collectionName)`)
      continue
    }
    if (onlyCollections !== null && !onlyCollections.has(collection)) continue
    const columnChildren = childrenOf(tableUid).filter(row => row?.subKey === 'columns')
    const fields = tableFieldsFromColumns(rows, byParent, tableUid)
    if (fields.length === 0) {
      skipped.push(`${tableUid} ${collection} (no readable columns to mirror)`)
      continue
    }
    const actionsColumn = columnChildren.find(row => row?.use === 'TableActionsColumnModel')
    if (actionsColumn === undefined) {
      wires.push({ tableUid, collection, fields, healthy: false, brokenActionUids: [], actionsColumnSortIndex: columnChildren.length + 1 })
      continue
    }
    // Actions column exists: healthy ⇔ some view action carries the full
    // openView payload AND a persisted page subtree. Broken View/Edit
    // actions (the 7f141 remnant shape) are destroyed and rewritten.
    const columnUid = String(actionsColumn.uid)
    const actions = childrenOf(columnUid).filter(row => row?.subKey === 'actions')
    const viewActions = actions.filter(row => row?.use === 'ViewActionModel')
    const healthyViews: FlowModelRow[] = []
    const brokenActionUids: string[] = []
    for (const action of viewActions) {
      if (healthyOpenView(action, collection) && await pageSubtreeExists(token, String(action.uid))) {
        healthyViews.push(action)
      } else {
        brokenActionUids.push(String(action.uid))
      }
    }
    for (const action of actions.filter(row => row?.use === 'EditActionModel')) {
      // Edit popups share the load-only path; a missing page subtree means
      // the same empty-drawer defect. B2 rebuilds a real edit wire — here
      // the broken one is removed so no dead button ships.
      if (!(await pageSubtreeExists(token, String(action.uid)))) brokenActionUids.push(String(action.uid))
    }
    if (healthyViews.length > 0 && brokenActionUids.length === 0) {
      skipped.push(`${tableUid} ${collection} (healthy row actions kept)`)
      continue
    }
    wires.push({ tableUid, collection, fields, healthy: false, actionsColumnUid: columnUid, brokenActionUids, actionsColumnSortIndex: columnChildren.length + 1 })
  }

  // Card/event drawers: every kanban/calendar view action needs a persisted
  // page subtree (f1's ensureCardDrawers generalized beyond the n17f1 prefix).
  const cards: CardDrawerPlan[] = []
  for (const action of rows.filter(row => row?.use === 'KanbanCardViewActionModel' || row?.use === 'CalendarEventViewActionModel')) {
    const actionUid = String(action.uid ?? '')
    if (actionUid.length === 0) continue
    if (await pageSubtreeExists(token, actionUid)) continue
    // Fields mirror the card's own DetailsItemModel subtree; the collection
    // rides on the kanban/calendar block row itself (the action's parent).
    // Card subtrees are saved nested, so flat rows carry no descendants —
    // walk the persisted layers instead: card item → grid (layout rows name
    // the item uids in order) → per-item field layer (fieldPath + model).
    const blockChildren = childrenOf(String(action.parentId ?? ''))
    const blockRow = rows.find(row => String(row.uid ?? '') === String(action.parentId ?? ''))
    const cardItem = blockChildren.find(row => row?.subKey === 'item' || row?.subKey === 'card')
    const fields: DetailFieldSpec[] = []
    const collection = String(blockRow?.stepParams?.resourceSettings?.init?.collectionName
      ?? action?.stepParams?.popupSettings?.openView?.collectionName ?? '')
    if (cardItem !== undefined && collection.length > 0) {
      const grid = await dataOf(token, 'GET', `/api/flowModels:findOne?parentId=${encodeURIComponent(String(cardItem.uid))}&subKey=grid`)
      const layoutRows: Array<{ cells?: Array<{ items?: unknown[] }> }> = grid?.props?.layout?.rows ?? []
      const itemUids = layoutRows.flatMap(row => row.cells ?? []).flatMap(cell => cell.items ?? []).filter((uid): uid is string => typeof uid === 'string')
      for (const itemUid of itemUids) {
        const fieldModel = await dataOf(token, 'GET', `/api/flowModels:findOne?parentId=${encodeURIComponent(itemUid)}&subKey=field`)
        const fieldPath = fieldModel?.stepParams?.fieldSettings?.init?.fieldPath
        if (typeof fieldPath !== 'string' || fieldPath.length === 0) continue
        fields.push({
          fieldPath,
          modelUse: typeof fieldModel?.use === 'string' ? fieldModel.use : 'DisplayTextFieldModel',
          ...(Array.isArray(fieldModel?.props?.options) ? { options: fieldModel.props.options as object[] } : {}),
        })
      }
    }
    if (fields.length === 0 || collection.length === 0) {
      skipped.push(`${actionUid} ${action.use} (card drawer field source missing)`)
      continue
    }
    cards.push({ actionUid, use: String(action.use), collection, fields })
  }
  return { wires, cards, skipped, byParent }
}

// ─── W3-B2 config: subtables, state blacklist, delete/jump surfaces ───

const text = (fieldPath: string, title: string): DetailFieldSpec & { title: string } => ({ fieldPath, title, modelUse: 'DisplayTextFieldModel' })
const num = (fieldPath: string, title: string): DetailFieldSpec & { title: string } => ({ fieldPath, title, modelUse: 'DisplayNumberFieldModel' })
const dateCol = (fieldPath: string, title: string): DetailFieldSpec & { title: string } => ({ fieldPath, title, modelUse: 'DisplayDateTimeFieldModel' })
const boolCol = (fieldPath: string, title: string): DetailFieldSpec & { title: string } => ({ fieldPath, title, modelUse: 'DisplayCheckboxFieldModel' })

/** The 12 subtable blocks (B2 §1). Columns stay scalar-plus-m2o; the row drawer mirrors them for the drill-down. */
const SUBTABLE_SPECS: ReadonlyArray<{ parent: string, subs: ReadonlyArray<SubtableSpec> }> = [
  { parent: 'pur_orders', subs: [{ collection: 'pur_order_lines', association: 'pur_orders.order_lines', title: '订单行', columns: [text('product', '产品'), num('qty', '数量'), num('unit_price', '单价'), num('qty_received', '已收数量')] }] },
  { parent: 'pur_requests', subs: [{ collection: 'pur_request_lines', association: 'pur_requests.request_lines', title: '申请行', columns: [text('product', '产品'), num('qty', '数量'), text('uom', '单位'), num('est_price', '估价')] }] },
  { parent: 'pur_rfqs', subs: [
    { collection: 'pur_rfq_suppliers', association: 'pur_rfqs.rfq_suppliers', title: '邀请供应商', columns: [text('supplier', '供应商'), dateCol('sent_at', '发出时间')] },
    { collection: 'pur_quotes', association: 'pur_rfqs.quotes', title: '报价', columns: [text('supplier', '供应商'), text('product', '产品'), num('qty', '数量'), num('unit_price', '单价'), num('lead_time_days', '交期(天)'), dateCol('valid_until', '报价有效期'), boolCol('is_won', '中标'), text('status', '状态')] },
  ] },
  { parent: 'so_orders', subs: [{ collection: 'so_order_lines', association: 'so_orders.order_lines', title: '订单行', columns: [text('product', '产品'), num('qty', '数量'), num('qty_shipped', '已发数量'), num('unit_price', '单价')] }] },
  { parent: 'mps_plans', subs: [{ collection: 'mps_plan_items', association: 'mps_plans.plan_items', title: '计划行', columns: [text('period', '时段'), text('product', '产品'), num('forecast_qty', '预测量'), num('planned_qty', '计划量'), num('so_open_qty', 'SO缺口'), text('driver', '驱动')] }] },
  { parent: 'mfg_boms', subs: [
    { collection: 'mfg_bom_lines', association: 'mfg_boms.bom_lines', title: '组件物料', columns: [text('product', '组件物料'), num('qty_per_unit', '单件用量'), text('uom', '单位'), num('scrap_pct', '损耗率')] },
    { collection: 'mfg_bom_operations', association: 'mfg_boms.bom_operations', title: '工序', columns: [num('seq', '序号'), text('name', '工序名'), text('workcenter', '工作中心'), num('setup_min', '准备分钟'), num('run_min', '加工分钟'), num('batch_size', '批量')] },
  ] },
  { parent: 'qm_inspections', subs: [{ collection: 'qm_inspection_readings', association: 'qm_inspections.inspection_readings', title: '检验读数', columns: [text('parameter', '参数'), num('spec_min', '规格下限'), num('actual', '实测值'), num('spec_max', '规格上限'), boolCol('pass', '判定')] }] },
  { parent: 'srm_suppliers', subs: [
    { collection: 'srm_certificates', association: 'srm_suppliers.certificates', title: '资质证书', columns: [text('cert_type', '证书类型'), text('cert_no', '证书号'), text('issuer', '发证机构'), dateCol('issued_at', '发证日'), dateCol('expires_at', '到期日'), text('warn_status', '预警')] },
    { collection: 'srm_audit_records', association: 'srm_suppliers.audit_records', title: '审核记录', columns: [dateCol('audit_date', '审核日期'), text('auditor', '审核员'), text('grade', '等级'), num('total_score', '总分'), text('nonconformities', '不合格项')] },
    { collection: 'srm_score_cards', association: 'srm_suppliers.score_cards', title: '绩效评分卡', columns: [text('period', '周期'), text('rating', '评级'), num('total_score', '总分'), text('rating_change', '评级变动')] },
  ] },
]

/** Explicit per-collection engine-state blacklist plus generic state-name fallback (mfg_orders et al. were never field-probed). */
const ENGINE_STATE_FIELDS: Readonly<Record<string, string[]>> = {
  pur_orders: ['doc_status', 'invoice_status', 'receiving_status', 'approved_by', 'approved_at'],
  pur_requests: ['doc_status'],
  pur_rfqs: ['doc_status'],
  so_orders: ['doc_status', 'shipping_status', 'approved_by', 'approved_at'],
  mps_plans: ['doc_status', 'approved_by', 'approved_at'],
  mfg_boms: ['bom_status'],
  mfg_orders: ['status'],
  qm_inspections: ['status', 'result'],
  wms_receipts: ['status', 'iqc_status'],
  wms_shipments: ['status'],
  wms_counts: ['status'],
  mfg_material_issues: ['status'],
  pur_quotes: ['status', 'is_won'],
  srm_suppliers: ['lifecycle_status', 'is_blacklisted', 'blacklist_reason', 'audit_grade', 'iqc_level', 'reject_streak', 'switch_score'],
}
const GENERIC_STATE_NAMES = new Set(['doc_status', 'status', 'result', 'bom_status', 'invoice_status', 'receiving_status', 'shipping_status', 'iqc_status', 'lifecycle_status'])

const isEngineStateField = (collection: string, name: string): boolean =>
  (ENGINE_STATE_FIELDS[collection] ?? []).includes(name) || GENERIC_STATE_NAMES.has(name)

/** Engine-governed collections that gain the guarded Edit action (state fields excluded). */
const ENGINE_EDIT_COLLECTIONS: ReadonlyArray<string> = [
  'pur_orders', 'pur_requests', 'pur_rfqs', 'so_orders', 'mps_plans', 'mfg_boms', 'mfg_orders',
  'qm_inspections', 'wms_receipts', 'wms_shipments', 'wms_counts', 'mfg_material_issues', 'srm_suppliers',
]

/** Free-state collections that gain the confirm-gated Delete (tasks/milestones/kb/contacts/maintenance). */
const FREE_DELETE_COLLECTIONS: ReadonlyArray<string> = ['hub_pj_tasks', 'hub_pj_milestones', 'hub_kb_articles', 'crm_contacts', 'hub_as_maintenance']

const RELATION_TYPES = new Set(['belongsTo', 'hasMany', 'belongsToMany', 'hasOne'])
const SYSTEM_FIELDS = new Set(['id', 'createdAt', 'updatedAt', 'sort'])

const editModelForFieldType = (type: string): string => {
  switch (type) {
    case 'boolean': return 'CheckboxFieldModel'
    case 'float': case 'double': case 'integer': case 'bigInt': return 'NumberFieldModel'
    case 'date': case 'dateOnly': return 'DateOnlyFieldModel'
    // type 'text' is the textarea column: the registered multiline model is
    // TextareaFieldModel (the exact spelling is load-bearing).
    case 'text': return 'TextareaFieldModel'
    default: return 'InputFieldModel'
  }
}

const displayModelForFieldType = (type: string): string => {
  switch (type) {
    case 'boolean': return 'DisplayCheckboxFieldModel'
    case 'float': case 'double': case 'integer': case 'bigInt': return 'DisplayNumberFieldModel'
    case 'date': case 'dateOnly': return 'DisplayDateTimeFieldModel'
    default: return 'DisplayTextFieldModel'
  }
}

// ─── write paths ───

/** Destroy one row and all its descendants, children first. */
async function destroySubtree(token: string, byParent: ReadonlyMap<string, FlowModelRow[]>, uid: string): Promise<number> {
  let destroyed = 0
  for (const child of byParent.get(uid) ?? []) {
    destroyed += await destroySubtree(token, byParent, String(child.uid))
  }
  await call(token, 'POST', `/api/flowModels:destroy?filterByTk=${encodeURIComponent(uid)}`)
  return destroyed + 1
}

async function executeWires(token: string, wires: ReadonlyArray<WirePlan>, byParent: ReadonlyMap<string, FlowModelRow[]>): Promise<void> {
  for (const wire of wires) {
    if (wire.brokenActionUids.length > 0) {
      for (const brokenUid of wire.brokenActionUids) {
        await destroySubtree(token, byParent, brokenUid)
      }
      console.log(`w3-heal: ${wire.collection} ${wire.tableUid} — ${wire.brokenActionUids.length} broken action(s) destroyed (rewriting)`)
    }
    if (wire.actionsColumnUid === undefined) {
      const columnUid = `w3b1tac${Math.random().toString(36).slice(2, 13)}`
      await dataOf(token, 'POST', '/api/flowModels:save', {
        uid: columnUid, use: 'TableActionsColumnModel', parentId: wire.tableUid, subKey: 'columns', subType: 'array',
        sortIndex: wire.actionsColumnSortIndex,
        props: { title: '操作', width: 150, fixed: 'none' },
        stepParams: { tableColumnSettings: { title: { title: '{{t("Actions")}}' } } },
      })
      await saveRowViewAction(token, columnUid, { collection: wire.collection, fields: wire.fields, tabTitle: '详情' })
      console.log(`w3-heal: ${wire.collection} ${wire.tableUid} — actions column + view drawer wired (${wire.fields.length} fields)`)
    } else {
      await saveRowViewAction(token, wire.actionsColumnUid, { collection: wire.collection, fields: wire.fields, tabTitle: '详情' })
      console.log(`w3-heal: ${wire.collection} ${wire.tableUid} — view drawer rewritten onto existing actions column (${wire.fields.length} fields)`)
    }
  }
}

async function executeCards(token: string, cards: ReadonlyArray<CardDrawerPlan>): Promise<void> {
  for (const card of cards) {
    await dataOf(token, 'POST', '/api/flowModels:save', drawerPageTreeFor(card.actionUid, {
      collection: card.collection, fields: card.fields, tabTitle: '详情',
    }))
    console.log(`w3-heal: ${card.use} ${card.actionUid} (${card.collection}) — card drawer page subtree backfilled (${card.fields.length} fields)`)
  }
}

// ─── W3-B2 execution: subtables + guarded actions + jumps ───

/** Collect every associationName in a persisted drawer tree (deep nodes live only inside the nested payload). */
const collectAssociationNames = (node: unknown, into: Set<string> = new Set()): Set<string> => {
  if (Array.isArray(node)) {
    for (const item of node) collectAssociationNames(item, into)
    return into
  }
  if (node === null || typeof node !== 'object') return into
  const row = node as Record<string, any>
  const association = row?.stepParams?.resourceSettings?.init?.associationName
  if (typeof association === 'string' && association.length > 0) into.add(association)
  if (row?.subModels !== null && typeof row?.subModels === 'object') collectAssociationNames(row.subModels, into)
  return into
}

const fieldsListOf = async (token: string, collection: string): Promise<Array<{ name?: string, type?: string, target?: string, foreignKey?: string, uiSchema?: { title?: string, enum?: object[] } }>> =>
  ((await dataOf(token, 'GET', `/api/fields:list?pageSize=200&filter=${encodeURIComponent(JSON.stringify({ collectionName: { $eq: collection } }))}`)) ?? []) as Array<{ name?: string, type?: string, target?: string, foreignKey?: string, uiSchema?: { title?: string, enum?: object[] } }>

/**
 * Seed inspection-reading rows onto the W8 demo inspections so the 质检单
 * drawer's readings subtable renders real rows. Seeding rides closed/pending
 * documents only; status/result stay engine-owned (the closed row's failing
 * reading matches its failed verdict — history, not a state write).
 */
async function seedInspectionReadings(token: string): Promise<void> {
  const targets: ReadonlyArray<{ code: string, rows: ReadonlyArray<Record<string, unknown>> }> = [
    { code: 'QI-W2B1-B10', rows: [
      { parameter: '水分含量(%)', spec_min: 0, spec_max: 5.5, actual: 6.2, pass: false, criteria: '≤5.5' },
      { parameter: '菌落总数(CFU/g)', spec_min: 0, spec_max: 10000, actual: 8600, pass: true, criteria: '≤10000' },
      { parameter: '净含量偏差(%)', spec_min: -3, spec_max: 3, actual: 1.1, pass: true, criteria: '±3' },
    ] },
    { code: 'QI-2026-0010', rows: [
      { parameter: '水分含量(%)', spec_min: 0, spec_max: 5.5, actual: 4.8, pass: true, criteria: '≤5.5' },
      { parameter: '酸价(mg/g)', spec_min: 0, spec_max: 3, actual: 2.4, pass: true, criteria: '≤3' },
    ] },
  ]
  for (const target of targets) {
    const insp = ((await dataOf(token, 'GET', `/api/qm_inspections:list?pageSize=5&filter=${encodeURIComponent(JSON.stringify({ code: { $eq: target.code } }))}`)) ?? [])[0] as { id?: number } | undefined
    if (insp?.id === undefined) {
      console.log(`w3-heal B2: inspection ${target.code} not found (readings seed skipped)`)
      continue
    }
    const existing = ((await dataOf(token, 'GET', `/api/qm_inspection_readings:list?pageSize=50&filter=${encodeURIComponent(JSON.stringify({ inspection_id: { $eq: insp.id } }))}`)) ?? []) as unknown[]
    if (existing.length > 0) {
      console.log(`w3-heal B2: ${target.code} (id ${insp.id}) already carries ${existing.length} reading row(s) (kept)`)
      continue
    }
    for (const row of target.rows) {
      await dataOf(token, 'POST', '/api/qm_inspection_readings:create', { ...row, inspection_id: insp.id })
    }
    console.log(`w3-heal B2: seeded ${target.rows.length} reading row(s) onto ${target.code} (id ${insp.id})`)
  }
}

async function executeB2(token: string): Promise<void> {
  const rows = await listFlowModels(token, 'w3-heal B2')
  const byParent = new Map<string, FlowModelRow[]>()
  for (const row of rows) {
    const key = String(row.parentId ?? '')
    if (key.length === 0) continue
    const bucket = byParent.get(key)
    if (bucket === undefined) byParent.set(key, [row])
    else bucket.push(row)
  }
  const childrenOf = (uid: string): FlowModelRow[] => byParent.get(String(uid)) ?? []
  const tablesOf = (collection: string): FlowModelRow[] => rows.filter(row => row?.use === 'TableBlockModel'
    && row?.stepParams?.resourceSettings?.init?.collectionName === collection)
  const actionColumnOf = (tableUid: string): FlowModelRow | undefined =>
    childrenOf(tableUid).find(row => row?.use === 'TableActionsColumnModel' && row?.subKey === 'columns')
  const inScope = (collection: string): boolean => onlyCollections === null || onlyCollections.has(collection)

  // 1) parent hasMany fields (the association the subtable blocks ride on).
  for (const { parent, subs } of SUBTABLE_SPECS) {
    if (!inScope(parent) && !subs.some(sub => inScope(sub.collection))) continue
    for (const sub of subs) {
      const [parentColl, field] = sub.association.split('.')
      const childFields = await fieldsListOf(token, sub.collection)
      const fk = childFields.find(fieldRow => fieldRow?.type === 'belongsTo' && fieldRow?.target === parentColl)?.foreignKey
      if (typeof fk !== 'string' || fk.length === 0) {
        throw new Error(`w3-heal B2: ${sub.collection} has no belongsTo → ${parentColl}; association ${sub.association} is unwirable`)
      }
      const created = await ensureParentHasMany(token, parentColl, field, sub.collection, fk)
      console.log(`w3-heal B2: relation ${sub.association} (fk ${fk}) ${created ? 'created' : 'exists (kept)'}`)
    }
  }

  // 2) parallel subtable blocks inside every healed parent drawer.
  for (const { parent, subs } of SUBTABLE_SPECS) {
    if (!inScope(parent) && !subs.some(sub => inScope(sub.collection))) continue
    for (const table of tablesOf(parent)) {
      const tableUid = String(table.uid)
      const column = actionColumnOf(tableUid)
      if (column === undefined) {
        console.log(`w3-heal B2: skip subtables on ${parent} ${tableUid} (no actions column — run the B1 pass first)`)
        continue
      }
      const viewAction = childrenOf(String(column.uid)).find(row => row?.use === 'ViewActionModel' && String(row.uid).startsWith('w3b1'))
      if (viewAction === undefined) {
        console.log(`w3-heal B2: skip subtables on ${parent} ${tableUid} (no w3b1 view action)`)
        continue
      }
      // Deep drawer nodes never appear as flat flowModels rows, so presence
      // rides the persisted nested tree and the block lands by rewriting the
      // whole drawer tree with children (see subtableBlockNode's contract).
      const pageTree = await dataOf(token, 'GET', `/api/flowModels:findOne?parentId=${encodeURIComponent(String(viewAction.uid))}&subKey=page`)
      const present = collectAssociationNames(pageTree)
      const missing = subs.filter(sub => !present.has(sub.association))
      // An unscoped Details block also forces the rewrite — the rebuilt tree
      // carries both the subtables and the filterByTk scoping key.
      if (missing.length === 0 && detailsBlockScoped(pageTree)) {
        console.log(`w3-heal B2: subtables in ${parent} ${tableUid} drawer exist (kept: ${subs.map(sub => sub.association).join(', ')})`)
        continue
      }
      const fields = tableFieldsFromColumns(rows, byParent, tableUid)
      if (fields.length === 0) {
        console.log(`w3-heal B2: skip subtables on ${parent} ${tableUid} (no mirrored columns to rebuild the Details block)`)
        continue
      }
      if (pageTree?.uid != null) {
        await call(token, 'POST', `/api/flowModels:destroy?filterByTk=${encodeURIComponent(String(pageTree.uid))}`)
      }
      await dataOf(token, 'POST', '/api/flowModels:save', drawerPageTreeFor(String(viewAction.uid), {
        collection: parent, fields, tabTitle: '详情', children: subs,
      }))
      console.log(`w3-heal B2: ${parent} ${tableUid} drawer rewritten — Details (${fields.length} fields) + subtables [${subs.map(sub => sub.association).join(', ')}]`)
    }
  }

  // 3) guarded Edit: engine collections minus the state blacklist, per table.
  for (const collection of ENGINE_EDIT_COLLECTIONS) {
    if (!inScope(collection)) continue
    const fields = await fieldsListOf(token, collection)
    const excluded = fields.filter(fieldRow => isEngineStateField(collection, String(fieldRow?.name ?? ''))).map(fieldRow => String(fieldRow?.name))
    const editFields: EditFieldSpec[] = fields
      .filter(fieldRow => typeof fieldRow?.name === 'string' && fieldRow.name.length > 0
        && !RELATION_TYPES.has(String(fieldRow?.type)) && !SYSTEM_FIELDS.has(fieldRow.name)
        && !isEngineStateField(collection, fieldRow.name))
      .map(fieldRow => ({
        name: String(fieldRow.name),
        title: String(fieldRow?.uiSchema?.title ?? fieldRow.name),
        modelUse: editModelForFieldType(String(fieldRow?.type)),
        ...(Array.isArray(fieldRow?.uiSchema?.enum) ? { options: fieldRow.uiSchema.enum as object[] } : {}),
      }))
    if (editFields.length === 0) {
      console.log(`w3-heal B2: skip Edit on ${collection} (no editable fields left after the blacklist)`)
      continue
    }
    for (const table of tablesOf(collection)) {
      const column = actionColumnOf(String(table.uid))
      if (column === undefined) continue
      if (childrenOf(String(column.uid)).some(row => String(row.uid).startsWith('w3b2ea'))) {
        console.log(`w3-heal B2: guarded Edit on ${collection} ${table.uid} exists (kept)`)
        continue
      }
      await saveRowEditAction(token, String(column.uid), { collection, fields: editFields })
      console.log(`w3-heal B2: guarded Edit on ${collection} ${table.uid} (${editFields.length} fields; state excluded: ${excluded.join(',') || 'none'})`)
    }
  }

  // 4) confirm-gated Delete on free-state collections only.
  for (const collection of FREE_DELETE_COLLECTIONS) {
    if (!inScope(collection)) continue
    for (const table of tablesOf(collection)) {
      const column = actionColumnOf(String(table.uid))
      if (column === undefined) continue
      if (childrenOf(String(column.uid)).some(row => String(row.uid).startsWith('w3b2da'))) {
        console.log(`w3-heal B2: confirm Delete on ${collection} ${table.uid} exists (kept)`)
        continue
      }
      await saveRowDeleteAction(token, String(column.uid))
      console.log(`w3-heal B2: confirm-gated Delete on ${collection} ${table.uid}`)
    }
  }

  // 5) the two-way approval jump.
  for (const collection of Object.keys(APPROVAL_JUMP_ROUTES)) {
    if (!inScope(collection)) continue
    for (const table of tablesOf(collection)) {
      const column = actionColumnOf(String(table.uid))
      if (column === undefined) continue
      if (childrenOf(String(column.uid)).some(row => String(row.uid).startsWith('w3b2ja'))) continue
      await saveRowJumpAction(token, String(column.uid), { title: '审批进度', path: APPROVAL_CENTER_ROUTE, docType: collection, sortIndex: 4 })
      console.log(`w3-heal B2: 审批进度 jump on ${collection} ${table.uid}`)
    }
  }
  for (const table of tablesOf('wfl_approval_todos')) {
    const column = actionColumnOf(String(table.uid))
    if (column === undefined) continue
    if (childrenOf(String(column.uid)).some(row => String(row.uid).startsWith('w3b2ja'))) continue
    await saveRowJumpAction(token, String(column.uid), { title: '前往单据', docTypeMap: { ...APPROVAL_JUMP_ROUTES }, docType: null, sortIndex: 5 })
    console.log(`w3-heal B2: 前往单据 jump on wfl_approval_todos ${table.uid}`)
  }

  // 6) member ACL refresh: the relation fields changed every touched
  // collection's field list, and the explicit whitelist must follow (the
  // B1 three-state trap).
  const touched = [...new Set([
    ...SUBTABLE_SPECS.flatMap(spec => [spec.parent, ...spec.subs.map(sub => sub.collection)]),
    ...ENGINE_EDIT_COLLECTIONS, ...FREE_DELETE_COLLECTIONS, 'wfl_approval_todos',
  ])].filter(inScope).sort()
  await grantMemberViewAcl(token, touched)

  // 7) readings seed (idempotent per inspection).
  await seedInspectionReadings(token)
}

// ─── member ACL ───

/**
 * Grant the member role an explicit per-collection view/list/get
 * rolesResources row for every collection a healed block renders (the
 * w9 kpi_snapshots read-only-guard shape). member's strategy stays as-is;
 * without these rows the fixed drawers stay invisible to member users
 * (P0 §5 — "admin fixed, member still blind" would recur). Idempotent: an
 * existing row for the pair is kept.
 */
async function grantMemberViewAcl(token: string, collections: ReadonlyArray<string>): Promise<void> {
  let granted = 0
  let refreshed = 0
  for (const collection of collections) {
    const existing = await dataOf(token, 'GET', `/api/rolesResources:list?pageSize=100&filter=${encodeURIComponent(JSON.stringify({ roleName: { $eq: 'member' }, name: { $eq: collection } }))}`) as Array<Record<string, unknown>> | null
    let resourceId = existing?.[0]?.id as number | undefined
    if (resourceId === undefined) {
      const created = await dataOf(token, 'POST', '/api/rolesResources:create', {
        role: { name: 'member' }, name: collection, usingActionsConfig: true,
        actions: [{ name: 'view' }, { name: 'list' }, { name: 'get' }],
      })
      resourceId = created?.id as number | undefined
      granted += 1
    }
    if (resourceId === undefined) continue
    // Field permissions must be an EXPLICIT full field list. Two traps found
    // live: (a) the REST create persists actions with fields=[] — an empty
    // whitelist that strips every business column (drawer shows id only);
    // (b) fields:null fixes the server side but the client renderer treats
    // the roles:check snapshot's null fields as "no fields allowed" and
    // skips the DetailsBlock entirely (drawer keeps rendering empty even
    // with data flowing). Only the explicit list passes both sides. The
    // update must ride the API — afterUpdateWithAssociations is what
    // reloads the in-memory ACL, so raw SQL never takes effect live.
    const fieldRows = (await dataOf(token, 'GET', `/api/fields:list?pageSize=200&filter=${encodeURIComponent(JSON.stringify({ collectionName: { $eq: collection } }))}`)) as Array<{ name?: string }> | null
    const fieldNames = (fieldRows ?? []).map(field => String(field.name)).filter(name => name.length > 0)
    const actions = (await dataOf(token, 'GET', `/api/rolesResourcesActions:list?pageSize=50&filter=${encodeURIComponent(JSON.stringify({ rolesResourceId: { $eq: resourceId } }))}`)) as Array<Record<string, unknown>> | null
    for (const action of actions ?? []) {
      if (action.id === undefined || action.id === null) continue
      const current = Array.isArray(action.fields) ? (action.fields as string[]).slice().sort().join(',') : null
      if (current === fieldNames.slice().sort().join(',')) continue
      await dataOf(token, 'POST', `/api/rolesResourcesActions:update?filterByTk=${action.id}`, { fields: fieldNames })
      refreshed += 1
    }
  }
  console.log(`w3-heal: member view ACL — ${granted > 0 ? `${granted} collection(s) granted (view/list/get)` : 'rows in place'}${refreshed > 0 ? `, ${refreshed} action row(s) set to explicit full field lists` : ''}`)
}

// ─── wire-health probe ───

async function probeSummary(token: string): Promise<string[]> {
  const rows = await listFlowModels(token, 'w3-heal-row-details (probe)')
  const lines: string[] = []
  // w3b2stb rows are drawer-embedded subtable blocks (their actions column
  // lives in the nested tree) — excluded from the flat coverage check.
  const tables = rows.filter(row => row?.use === 'TableBlockModel' && !String(row.uid ?? '').startsWith('w3b2stb'))
  const actionsColumns = rows.filter(row => row?.use === 'TableActionsColumnModel')
  const viewActions = rows.filter(row => row?.use === 'ViewActionModel')
  const addNews = rows.filter(row => row?.use === 'AddNewActionModel')
  lines.push(`TableBlockModel=${tables.length} TableActionsColumnModel=${actionsColumns.length} ViewActionModel=${viewActions.length} AddNewActionModel=${addNews.length}`)
  let viewMissingPage = 0
  for (const action of viewActions) {
    if (!(await pageSubtreeExists(token, String(action.uid)))) viewMissingPage += 1
  }
  let addNewMissingPage = 0
  for (const action of addNews) {
    if (!(await pageSubtreeExists(token, String(action.uid)))) addNewMissingPage += 1
  }
  const cardActions = rows.filter(row => row?.use === 'KanbanCardViewActionModel' || row?.use === 'CalendarEventViewActionModel')
  let cardMissingPage = 0
  for (const action of cardActions) {
    if (!(await pageSubtreeExists(token, String(action.uid)))) cardMissingPage += 1
  }
  lines.push(`viewAction page subtree missing=${viewMissingPage} addNew page subtree missing=${addNewMissingPage} card/event page subtree missing=${cardMissingPage}`)
  const uncovered = tables.filter(table => {
    const children = rows.filter(row => String(row.parentId ?? '') === String(table.uid) && row?.subKey === 'columns')
    return !children.some(row => row?.use === 'TableActionsColumnModel')
  })
  lines.push(`table blocks without an actions column=${uncovered.length}${uncovered.length > 0 ? ` (${uncovered.map(row => `${row.uid}:${row?.stepParams?.resourceSettings?.init?.collectionName ?? '?'}`).join(', ')})` : ''}`)
  return lines
}

// ─── rollback ───

async function rollback(token: string, prefix: string): Promise<void> {
  const rows = await listFlowModels(token, `w3-heal-row-details (rollback ${prefix})`)
  const byParent = new Map<string, FlowModelRow[]>()
  for (const row of rows) {
    const key = String(row.parentId ?? '')
    if (key.length === 0) continue
    const bucket = byParent.get(key)
    if (bucket === undefined) byParent.set(key, [row])
    else bucket.push(row)
  }
  const targets = rows.filter(row => String(row.uid ?? '').startsWith(prefix))
  if (targets.length === 0) {
    console.log(`w3-heal: rollback ${prefix} — nothing to destroy (0 rows)`)
    return
  }
  let destroyed = 0
  for (const target of targets) {
    if (!String(target.uid ?? '').startsWith(prefix)) continue
    destroyed += await destroySubtree(token, byParent, String(target.uid))
  }
  console.log(`w3-heal: rollback ${prefix} — ${destroyed} row(s) destroyed (children first)`)
}

// ─── main ───

const token = await signInWithRetry()

if (rollbackPrefix.length > 0) {
  await rollback(token, rollbackPrefix)
  process.exit(0)
}

// W3-B3: rescope drawers built before the filterByTk fix (runs before the
// wire plan so freshly rebuilt trees count as healthy).
await rescopeDrawers(token)
const { wires, cards, skipped, byParent } = await buildPlan(token)
console.log(`w3-heal: plan — ${wires.length} table wire(s), ${cards.length} card drawer(s), ${skipped.length} skipped`)
for (const skip of skipped) console.log(`  skip: ${skip}`)

if (dryRun) {
  for (const wire of wires) {
    const mode = wire.actionsColumnUid !== undefined ? `repair (reuse column ${wire.actionsColumnUid}, destroy ${wire.brokenActionUids.join(',') || '-'})` : 'add triple'
    console.log(`  wire: ${wire.collection} ${wire.tableUid} — ${mode}, ${wire.fields.length} fields [${wire.fields.map(field => field.fieldPath).join(', ')}]`)
  }
  for (const card of cards) {
    console.log(`  card: ${card.use} ${card.actionUid} (${card.collection}) — ${card.fields.length} fields [${card.fields.map(field => field.fieldPath).join(', ')}]`)
  }
  const b2Subtables = SUBTABLE_SPECS
    .filter(spec => onlyCollections === null || onlyCollections.has(spec.parent) || spec.subs.some(sub => onlyCollections.has(sub.collection)))
    .flatMap(spec => spec.subs.map(sub => sub.association))
  const b2Edits = ENGINE_EDIT_COLLECTIONS.filter(collection => onlyCollections === null || onlyCollections.has(collection))
  const b2Deletes = FREE_DELETE_COLLECTIONS.filter(collection => onlyCollections === null || onlyCollections.has(collection))
  console.log(`  b2: ${b2Subtables.length} subtable block(s) [${b2Subtables.join(', ')}]`)
  console.log(`  b2: guarded Edit on ${b2Edits.length} collection(s); confirm Delete on ${b2Deletes.length} collection(s); approval jumps on ${Object.keys(APPROVAL_JUMP_ROUTES).length} collection(s) + todo`)
  console.log('w3-heal: dry-run complete (nothing written)')
  process.exit(0)
}

await executeWires(token, wires, byParent)
await executeCards(token, cards)
// W3-B2 phase: subtable drill-down + guarded row actions + approval jumps.
await executeB2(token)

// The ACL grant/refresh runs even on a fully-healed pass (all wires kept):
// idempotency there is per-action-row (explicit field list already set),
// so re-running keeps repairing field whitelists for collections that
// gained fields since the last pass.
const aclCollections = wires.length + cards.length > 0
  ? [...new Set([...wires.map(wire => wire.collection), ...cards.map(card => card.collection)])]
  : ((await dataOf(token, 'GET', `/api/rolesResources:list?pageSize=200&filter=${encodeURIComponent(JSON.stringify({ roleName: { $eq: 'member' } }))}`)) as Array<{ name?: string }> | null ?? [])
    .map(row => String(row.name)).filter(name => name.length > 0)
if (aclCollections.length > 0) await grantMemberViewAcl(token, [...new Set(aclCollections)].sort())

console.log('w3-heal: probe summary after heal')
for (const line of await probeSummary(token)) console.log(`  ${line}`)
