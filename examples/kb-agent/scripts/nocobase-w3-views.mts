/**
 * W3-B3: read-only multi-view surfaces for the engine-governed core objects —
 * four status kanbans (PO/MO/SO/质检), the MO scheduling gantt (v1 official
 * plugin-gantt channel), and two planning/delivery calendars.
 *
 * D4 boundary (PLAN §6): engine-governed status is never written from the
 * UI. Kanban drag = `collection:move` writing the group field directly
 * (bypassing wfl anchors / FCS ownership / quality single-shot), so these
 * boards ship `dragEnabled:false`, no quick-create, no Add-new — the board
 * is a status overview + B1 drawer entry; transitions ride the engine verbs
 * (approval center, operator terminals, chain scripts) exclusively.
 * Free-state boards (srm_capas / qm_nc_dispositions) keep their drag.
 *
 * D5 boundary: the gantt rides the official v1 uiSchemas channel
 * (GanttBlockProvider, the live 任务甘特 shape) over mfg_order_operations
 * (planned_date one-day bars), read-only via
 * `enableDragToReschedule:false` — FCS keeps sole reschedule ownership; no
 * self-built SVG.
 *
 * Kanban/card/drawer chains reuse the proven wires: w8's kanban factory
 * (B8 处置看板), f1's calendar page (task calendar), and the B1
 * drawerPageTreeFor load-only subtree. The MO board drawer embeds the
 * operations subtable (the planner journey's drill-down anchor).
 *
 * W3-B6 appends the three operator-terminal pages (车间终端/质检工作台/收货终端,
 * uid prefix w3b6): one flowPage per business menu group carrying a single
 * iframe block (mode:url) pointed at approval-engine --serve :13110's static
 * touch pages. The pages write exclusively through the serve verbs
 * (/report-job, /inspect-submit, /receive-goods) — never NocoBase forms; the
 * URL 直开 fallback stays available by design (PLAN risk table).
 *
 * Calendars: one CalendarBlockModel per source collection stacked in the
 * page grid (heightMode specifyValue). `init.filter` is not a sanctioned
 * resourceSettings key in the flow-engine catalog, so the delivery calendar
 * shows every dated order; the未完成 subsets are asserted in psql evidence
 * instead of a UI filter.
 *
 * Idempotent per page (existing route + w3b3 block ⇒ kept); --rollback
 * destroys the w3b3 flowModels rows, the six route rows (+tabs children),
 * and the v1 gantt page's uiSchemas tree. All new uids carry the w3b3
 * prefix (the --rollback w3b3 anchor).
 *
 * Usage:
 *   node --import tsx/esm examples/kb-agent/scripts/nocobase-w3-views.mts            # build all six pages
 *   node --import tsx/esm examples/kb-agent/scripts/nocobase-w3-views.mts --assert    # API-side对拍 + drag-negative probes
 *   node --import tsx/esm examples/kb-agent/scripts/nocobase-w3-views.mts --rollback
 */
import { call, dataOf, drawerPageTreeFor, ensureParentHasMany, listFlowModels, listRoutes, signInWithRetry, subtableBlockNode, withN17Prefix } from './nocobase-flow-page-lib.mts'
import type { DetailFieldSpec, FlowModelRow, RouteRow, SubtableSpec } from './nocobase-flow-page-lib.mts'
import { ganttBlock } from './nocobase-hub-modules.mts'
import { fileURLToPath, pathToFileURL } from 'node:url'

type FieldKind = 'input' | 'select' | 'number' | 'm2o' | 'date' | 'boolean' | 'textarea'
type FieldSpec = { name: string, title: string, kind: FieldKind, options?: object[] }

const PUR_DOC_STATUS = [
  { value: 'draft', label: '草稿', color: 'default' }, { value: 'pending', label: '待审批', color: 'orange' },
  { value: 'pending_level2', label: '二级审批中', color: 'purple' }, { value: 'approved', label: '已生效', color: 'green' },
  { value: 'rejected', label: '已驳回', color: 'red' }, { value: 'void', label: '已作废', color: 'default' },
]
const MFG_DOC_STATUS = [
  ...PUR_DOC_STATUS.slice(0, 6),
  { value: 'released', label: '已下达', color: 'blue' }, { value: 'in_progress', label: '执行中', color: 'orange' },
  { value: 'completed', label: '已完工', color: 'green' }, { value: 'closed', label: '已关闭', color: 'default' },
]
const QM_STATUS = [
  { value: 'draft', label: '草稿', color: 'default' }, { value: 'pending', label: '待检', color: 'blue' },
  { value: 'closed', label: '已判定', color: 'green' },
]
const OPS_STATUS = [
  { value: 'planned', label: '已计划', color: 'blue' }, { value: 'started', label: '已开工', color: 'orange' },
  { value: 'done', label: '已完成', color: 'green' },
]

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

type KanbanBoardSpec = {
  title: string
  icon: string
  menuGroup: string
  collection: string
  groupField: string
  groupOptions: object[]
  cardFields: FieldSpec[]
  drawerFields: FieldSpec[]
  drawerSubtables?: SubtableSpec[]
}

type CalendarPageSpec = {
  title: string
  icon: string
  menuGroup: string
  blocks: ReadonlyArray<{
    collection: string
    start: string
    end: string
    titleField: string
    drawerFields: FieldSpec[]
  }>
}

const MO_OPERATIONS_SUBTABLE: SubtableSpec = {
  collection: 'mfg_order_operations',
  association: 'mfg_orders.order_operations',
  title: '工序排程（计划日期 × 工作中心）',
  columns: [
    { fieldPath: 'seq', title: '序号', modelUse: 'DisplayNumberFieldModel' },
    { fieldPath: 'name', title: '工序名', modelUse: 'DisplayTextFieldModel' },
    { fieldPath: 'workcenter', title: '工作中心', modelUse: 'DisplayTextFieldModel' },
    { fieldPath: 'planned_date', title: '计划日期', modelUse: 'DisplayDateTimeFieldModel' },
    { fieldPath: 'planned_min', title: '计划工时(分)', modelUse: 'DisplayNumberFieldModel' },
    { fieldPath: 'status', title: '状态', modelUse: 'DisplayEnumFieldModel', options: OPS_STATUS },
  ],
}

const KANBAN_BOARDS: ReadonlyArray<KanbanBoardSpec> = [
  {
    title: '采购看板', icon: 'ShoppingCartOutlined', menuGroup: '采购管理',
    collection: 'pur_orders', groupField: 'doc_status', groupOptions: PUR_DOC_STATUS,
    cardFields: [
      { name: 'code', title: '订单号', kind: 'input' },
      { name: 'supplier', title: '供应商', kind: 'm2o' },
      { name: 'amount', title: '金额', kind: 'number' },
      { name: 'need_date', title: '需求日期', kind: 'date' },
      { name: 'expected_date', title: '承诺到货日', kind: 'date' },
      { name: 'receiving_status', title: '收货进度', kind: 'select' },
    ],
    drawerFields: [
      { name: 'code', title: '订单号', kind: 'input' }, { name: 'supplier', title: '供应商', kind: 'm2o' },
      { name: 'amount', title: '金额', kind: 'number' }, { name: 'need_date', title: '需求日期', kind: 'date' },
      { name: 'expected_date', title: '承诺到货日', kind: 'date' }, { name: 'receiving_status', title: '收货进度', kind: 'select' },
      { name: 'invoice_status', title: '发票进度', kind: 'select' }, { name: 'doc_status', title: '审批状态', kind: 'select', options: PUR_DOC_STATUS },
      { name: 'approved_by', title: '审批人', kind: 'input' }, { name: 'approved_at', title: '生效日', kind: 'date' },
    ],
  },
  {
    // Title distinct from B9 经营分析's 生产看板 KPI dashboard — the first
    // build's title collision made --rollback destroy B9's page by title
    // match (routes are cascade-deleted with their flowModels trees).
    title: '生产订单看板', icon: 'ToolOutlined', menuGroup: '生产与计划',
    collection: 'mfg_orders', groupField: 'doc_status', groupOptions: MFG_DOC_STATUS,
    cardFields: [
      { name: 'code', title: '订单号', kind: 'input' },
      { name: 'product', title: '成品物料', kind: 'm2o' },
      { name: 'qty', title: '数量', kind: 'number' },
      { name: 'need_date', title: '需求日期', kind: 'date' },
      { name: 'planned_start', title: '建议开工', kind: 'date' },
      { name: 'planned_end', title: '建议完工', kind: 'date' },
    ],
    drawerFields: [
      { name: 'code', title: '订单号', kind: 'input' }, { name: 'product', title: '成品物料', kind: 'm2o' },
      { name: 'bom', title: 'BOM', kind: 'm2o' }, { name: 'qty', title: '数量', kind: 'number' },
      { name: 'source', title: '工单来源', kind: 'input' }, { name: 'driver_so_code', title: '驱动销售订单', kind: 'input' },
      { name: 'need_date', title: '需求日期', kind: 'date' }, { name: 'planned_start', title: '建议开工', kind: 'date' },
      { name: 'planned_end', title: '建议完工', kind: 'date' }, { name: 'doc_status', title: '审批状态', kind: 'select', options: MFG_DOC_STATUS },
      { name: 'released_at', title: '下达日', kind: 'date' }, { name: 'approved_by', title: '审批人', kind: 'input' },
      { name: 'approved_at', title: '生效日', kind: 'date' }, { name: 'reservation_state', title: '齐套状态', kind: 'input' },
      { name: 'kit_policy', title: '齐套策略', kind: 'input' },
    ],
    drawerSubtables: [MO_OPERATIONS_SUBTABLE],
  },
  {
    title: '销售看板', icon: 'ShoppingOutlined', menuGroup: '销售管理',
    collection: 'so_orders', groupField: 'doc_status', groupOptions: PUR_DOC_STATUS,
    cardFields: [
      { name: 'code', title: '订单号', kind: 'input' },
      { name: 'customer', title: '客户', kind: 'm2o' },
      { name: 'amount', title: '金额', kind: 'number' },
      { name: 'need_date', title: '交货日期', kind: 'date' },
      { name: 'shipping_status', title: '发货进度', kind: 'select' },
    ],
    drawerFields: [
      { name: 'code', title: '订单号', kind: 'input' }, { name: 'customer', title: '客户', kind: 'm2o' },
      { name: 'deal', title: '关联商机', kind: 'm2o' }, { name: 'amount', title: '金额', kind: 'number' },
      { name: 'need_date', title: '交货日期', kind: 'date' }, { name: 'shipping_status', title: '发货进度', kind: 'select' },
      { name: 'shipped_at', title: '发货日', kind: 'date' }, { name: 'doc_status', title: '审批状态', kind: 'select', options: PUR_DOC_STATUS },
      { name: 'approved_by', title: '审批人', kind: 'input' }, { name: 'approved_at', title: '生效日', kind: 'date' },
      { name: 'note', title: '备注', kind: 'textarea' },
    ],
  },
  {
    title: '质检看板', icon: 'AuditOutlined', menuGroup: '质量管理',
    collection: 'qm_inspections', groupField: 'status', groupOptions: QM_STATUS,
    cardFields: [
      { name: 'code', title: '质检单号', kind: 'input' },
      { name: 'product', title: '物料', kind: 'm2o' },
      { name: 'supplier', title: '供应商', kind: 'm2o' },
      { name: 'insp_type', title: '检验类型', kind: 'select' },
      { name: 'lot_qty', title: '批量', kind: 'number' },
      { name: 'inspected_at', title: '检验日期', kind: 'date' },
      { name: 'result', title: '判定结果', kind: 'select' },
    ],
    drawerFields: [
      { name: 'code', title: '质检单号', kind: 'input' }, { name: 'insp_type', title: '检验类型', kind: 'select' },
      { name: 'ref_type', title: '来源类型', kind: 'select' }, { name: 'ref_no', title: '来源单号', kind: 'input' },
      { name: 'product', title: '物料', kind: 'm2o' }, { name: 'supplier', title: '供应商', kind: 'm2o' },
      { name: 'lot_no', title: '批次号', kind: 'input' }, { name: 'lot_qty', title: '批量', kind: 'number' },
      { name: 'sample_qty', title: '样本量', kind: 'number' }, { name: 'rigor', title: '判定严格度', kind: 'select' },
      { name: 'aql_target', title: 'AQL档', kind: 'input' }, { name: 'aql_code', title: '样本字码', kind: 'input' },
      { name: 'aql_n', title: 'n', kind: 'number' }, { name: 'aql_ac', title: 'Ac', kind: 'number' },
      { name: 'aql_re', title: 'Re', kind: 'number' }, { name: 'defect_critical', title: '严重缺陷数', kind: 'number' },
      { name: 'defect_major', title: '主要缺陷数', kind: 'number' }, { name: 'defect_minor', title: '次要缺陷数', kind: 'number' },
      { name: 'result', title: '判定结果', kind: 'select' }, { name: 'status', title: '单据状态', kind: 'select', options: QM_STATUS },
      { name: 'inspector', title: '检验员', kind: 'input' }, { name: 'inspected_at', title: '检验日期', kind: 'date' },
      { name: 'note', title: '判定说明', kind: 'textarea' },
    ],
  },
]

const CALENDAR_PAGES: ReadonlyArray<CalendarPageSpec> = [
  {
    title: '交期日历', icon: 'CalendarOutlined', menuGroup: '销售管理',
    blocks: [
      {
        collection: 'so_orders', start: 'need_date', end: 'need_date', titleField: 'code',
        drawerFields: [
          { name: 'code', title: '订单号', kind: 'input' }, { name: 'customer', title: '客户', kind: 'm2o' },
          { name: 'amount', title: '金额', kind: 'number' }, { name: 'need_date', title: '交货日期', kind: 'date' },
          { name: 'shipping_status', title: '发货进度', kind: 'select' }, { name: 'shipped_at', title: '发货日', kind: 'date' },
          { name: 'doc_status', title: '审批状态', kind: 'select', options: PUR_DOC_STATUS },
          { name: 'approved_by', title: '审批人', kind: 'input' }, { name: 'approved_at', title: '生效日', kind: 'date' },
          { name: 'note', title: '备注', kind: 'textarea' },
        ],
      },
      {
        collection: 'pur_orders', start: 'need_date', end: 'need_date', titleField: 'code',
        drawerFields: [
          { name: 'code', title: '订单号', kind: 'input' }, { name: 'supplier', title: '供应商', kind: 'm2o' },
          { name: 'amount', title: '金额', kind: 'number' }, { name: 'need_date', title: '需求日期', kind: 'date' },
          { name: 'expected_date', title: '承诺到货日', kind: 'date' }, { name: 'receiving_status', title: '收货进度', kind: 'select' },
          { name: 'invoice_status', title: '发票进度', kind: 'select' }, { name: 'doc_status', title: '审批状态', kind: 'select', options: PUR_DOC_STATUS },
          { name: 'approved_by', title: '审批人', kind: 'input' }, { name: 'approved_at', title: '生效日', kind: 'date' },
        ],
      },
    ],
  },
  {
    title: '计划日历', icon: 'ScheduleOutlined', menuGroup: '销售管理',
    blocks: [
      {
        collection: 'mps_plans', start: 'period_from', end: 'period_to', titleField: 'code',
        drawerFields: [
          { name: 'code', title: '计划号', kind: 'input' }, { name: 'period_from', title: '展望期起', kind: 'date' },
          { name: 'period_to', title: '展望期止', kind: 'date' }, { name: 'doc_status', title: '审批状态', kind: 'select', options: PUR_DOC_STATUS },
          { name: 'approved_by', title: '审批人', kind: 'input' }, { name: 'approved_at', title: '生效日', kind: 'date' },
          { name: 'note', title: '备注', kind: 'textarea' },
        ],
      },
      {
        collection: 'mrp_suggestions', start: 'suggest_date', end: 'need_date', titleField: 'plan_type',
        drawerFields: [
          { name: 'run_id', title: '日结批次', kind: 'input' }, { name: 'plan_type', title: '建议类型', kind: 'select' },
          { name: 'product', title: '物料', kind: 'm2o' }, { name: 'qty', title: '建议数量', kind: 'number' },
          { name: 'suggest_date', title: '建议下单日', kind: 'date' }, { name: 'need_date', title: '需求日期', kind: 'date' },
          { name: 'driver_so_id', title: '驱动销售订单', kind: 'input' }, { name: 'status', title: '状态', kind: 'select' },
          { name: 'converted_doc_type', title: '转单类型', kind: 'input' }, { name: 'converted_doc_code', title: '转单编号', kind: 'input' },
          { name: 'converted_by', title: '确认人', kind: 'input' }, { name: 'converted_at', title: '确认日期', kind: 'date' },
          { name: 'note', title: '说明', kind: 'textarea' },
        ],
      },
    ],
  },
]

const GANTT_PAGE = { title: '排产甘特', icon: 'FieldTimeOutlined', menuGroup: '生产与计划', collection: 'mfg_order_operations' } as const

// ─── W3-B6: the three operator-terminal iframe pages ───

type TerminalPageSpec = {
  title: string
  icon: string
  menuGroup: string
  page: 'report' | 'inspect' | 'receive'
  /** The default operator the embedded URL pins (the page's selector can still switch). */
  operator: string
}

const TERMINAL_PAGES: ReadonlyArray<TerminalPageSpec> = [
  { title: '车间终端', icon: 'ToolOutlined', menuGroup: '生产与计划', page: 'report', operator: 'linjingyi' },
  { title: '质检工作台', icon: 'AuditOutlined', menuGroup: '质量管理', page: 'inspect', operator: 'quality_lead' },
  { title: '收货终端', icon: 'DatabaseOutlined', menuGroup: '仓储管理', page: 'receive', operator: 'b4guard' },
]

/**
 * The engine-serve origin the terminal iframes point at (approval-engine
 * --serve). W4-B3 (D10) made W3_TERMINAL_BASE the canonical override; the
 * older W3_TERMINAL_ORIGIN still wins over the built-in default so existing
 * deployments keep working.
 */
const TERMINAL_SERVE_ORIGIN = process.env['W3_TERMINAL_BASE'] ?? process.env['W3_TERMINAL_ORIGIN'] ?? 'http://127.0.0.1:13110'

const terminalUrl = (spec: TerminalPageSpec): string =>
  `${TERMINAL_SERVE_ORIGIN}/terminals/${spec.page}.html?operator=${spec.operator}`

/**
 * The real BlockGridModel uid a terminal page's blocks hang under — found by
 * resolving the tabs row then its grid child (gridUidOfExistingPage returns
 * the tabs schemaUid, which is the grid's *parent*, not the block mount).
 */
async function terminalGridUid(token: string, routes: ReadonlyArray<RouteRow>, title: string): Promise<string> {
  const flow = routes.find(row => row.title === title && row.type === 'flowPage')
  if (flow === undefined) throw new Error(`flowPage "${title}" not found`)
  const tab = routes.find(row => row.type === 'tabs' && row.parentId === flow.id)
  if (tab?.schemaUid == null) throw new Error(`"${title}" flowPage has no tabs grid row`)
  const grid = await dataOf(token, 'GET', `/api/flowModels:findOne?parentId=${tab.schemaUid}&subKey=grid`)
  if (grid?.uid == null) throw new Error(`"${title}" BlockGridModel not found under tabs ${tab.schemaUid}`)
  return String(grid.uid)
}

/**
 * One flowPage per terminal spec carrying a single iframe block (mode:url).
 * Idempotent per page (existing route + an IframeBlockModel under its grid
 * ⇒ kept); the URL 直开 fallback is inherent — the page is plain HTTP.
 */
async function ensureTerminalPages(token: string, groups: ReadonlyMap<string, number>): Promise<void> {
  for (const spec of TERMINAL_PAGES) {
    const groupId = groups.get(spec.menuGroup)
    if (groupId === undefined) throw new Error(`menu group "${spec.menuGroup}" not found; run the domain script that owns it first`)
    const routes = await listRoutes(token, 'w3-views terminals')
    const flow = routes.find(row => row.title === spec.title && row.type === 'flowPage')
    const gridUid = flow === undefined
      ? await ensureV2RouteShell(token, spec.title, spec.icon, groupId, 'w3b6')
      : await terminalGridUid(token, routes, spec.title)
    const models = await listFlowModels(token, 'w3-views terminals')
    if (models.some(row => row.use === 'IframeBlockModel' && row.parentId === gridUid)) {
      console.log(`nocobase-w3-views: terminal page "${spec.title}" exists (kept)`)
      continue
    }
    const url = terminalUrl(spec)
    const block = await dataOf(token, 'POST', '/api/flowSurfaces:addBlock', {
      target: { uid: gridUid },
      type: 'iframe',
      settings: { mode: 'url', url, height: 640 },
    })
    const blockUid = block?.uid ?? block?.tree?.uid
    if (typeof blockUid !== 'string') throw new Error(`addBlock returned no uid for terminal ${spec.page}: ${JSON.stringify(block).slice(0, 200)}`)
    console.log(`nocobase-w3-views: terminal page "${spec.title}" built (iframe uid ${blockUid} → ${url})`)
  }
}

/** Every select field without hardcoded options picks the live field enum up (single fields:list per collection). */
async function selectOptionsOf(token: string, collection: string, field: string): Promise<object[] | undefined> {
  const rows = (await dataOf(token, 'GET', `/api/fields:list?pageSize=200&filter=${encodeURIComponent(JSON.stringify({ collectionName: { $eq: collection }, name: { $eq: field } }))}`)) as Array<{ uiSchema?: { enum?: object[] } }> | null
  const options = rows?.[0]?.uiSchema?.enum
  return Array.isArray(options) && options.length > 0 ? options : undefined
}

async function enrichSelectFields(token: string, collection: string, fields: FieldSpec[]): Promise<FieldSpec[]> {
  const missing = fields.filter(field => field.kind === 'select' && field.options === undefined).map(field => field.name)
  const enriched = [...fields]
  for (const name of missing) {
    const options = await selectOptionsOf(token, collection, name)
    if (options === undefined) continue
    const field = enriched.find(row => row.name === name)
    if (field !== undefined) field.options = options
  }
  return enriched
}

const toDetailSpec = (fields: ReadonlyArray<FieldSpec>): DetailFieldSpec[] =>
  fields.map(field => ({ fieldPath: field.name, modelUse: displayModelFor(field.kind), ...(field.options === undefined ? {} : { options: field.options }) }))

function kanbanCard(collection: string, fields: ReadonlyArray<FieldSpec>): Record<string, unknown> {
  const itemUids = fields.map(() => withN17Prefix('w3b3', 'di'))
  const rows = itemUids.map((itemUid, index) => ({
    id: `r${index}`,
    cells: [{ id: `r${index}:cell:0`, items: [itemUid] }],
    sizes: [24],
  }))
  return {
    use: 'KanbanCardItemModel', subKey: 'item', subType: 'object', sortIndex: 1, props: {}, stepParams: {},
    subModels: {
      grid: {
        use: 'DetailsGridModel', subKey: 'grid', subType: 'object', sortIndex: 1,
        props: { layout: { version: 2, rows, rowGap: 0, colGap: 8, sizes: {}, rowOrder: rows.map(row => row.id) } },
        stepParams: { gridSettings: { grid: { layout: { version: 2, rows } } } },
        subModels: {
          items: fields.map((field, index) => ({
            uid: itemUids[index], use: 'DetailsItemModel', subKey: 'items', subType: 'array', sortIndex: index + 1, props: {},
            stepParams: {
              fieldSettings: { init: { dataSourceKey: 'main', collectionName: collection, fieldPath: field.name } },
              detailItemSettings: { showLabel: { showLabel: true } },
            },
            subModels: {
              field: {
                use: displayModelFor(field.kind), subKey: 'field', subType: 'object', sortIndex: 1,
                props: field.options === undefined ? {} : { options: field.options },
                stepParams: {
                  fieldSettings: { init: { dataSourceKey: 'main', collectionName: collection, fieldPath: field.name } },
                  popupSettings: { openView: { collectionName: collection, dataSourceKey: 'main' } },
                },
              },
            },
          })),
        },
      },
    },
  }
}

async function menuGroupId(token: string, title: string): Promise<number> {
  const group = (await listRoutes(token, 'w3-views')).find(row => row.title === title && row.type === 'group')
  if (group === undefined) throw new Error(`menu group "${title}" not found; run the domain script that owns it first`)
  return group.id
}

/** Next free sort position among the group's direct children. */
async function nextSortInGroup(token: string, groupId: number): Promise<number> {
  const children = (await listRoutes(token, 'w3-views')).filter(row => row.parentId === groupId)
  return children.reduce((max, row) => Math.max(max, row.sort ?? 0), 0) + 1
}

/**
 * Resolve the grid uid for an already-existing flowPage (partial-rebuild
 * recovery): the tabs route row's schemaUid is the BlockGridModel parentId.
 */
async function gridUidOfExistingPage(token: string, title: string): Promise<string> {
  const routes = await listRoutes(token, 'w3-views')
  const flow = routes.find(row => row.title === title && row.type === 'flowPage')
  const tab = flow === undefined ? undefined : routes.find(row => row.type === 'tabs' && row.parentId === flow.id)
  if (tab?.schemaUid == null) {
    throw new Error(`"${title}" flowPage exists but has no tabs grid row (truncated build); run --rollback and rebuild`)
  }
  return String(tab.schemaUid)
}

/**
 * Create the flowPage route shell and return the grid uid blocks hang under.
 * The created grid uid is returned from the save path itself — re-listing
 * flowModels right after heavy schema writes races NocoBase's write
 * visibility (the first board built fine; the second read a stale snapshot).
 */
async function ensureV2RouteShell(token: string, title: string, icon: string, groupId: number, prefix = 'w3b3'): Promise<string> {
  const routes = await listRoutes(token, 'w3-views')
  const flow = routes.find(row => row.title === title && row.type === 'flowPage')
  if (flow !== undefined) return gridUidOfExistingPage(token, title)
  if (routes.some(row => row.title === title && row.type === 'page')) {
    throw new Error(`a v1 page named "${title}" already exists; rename it first (this batch only owns flowPages for v2 views)`)
  }
  const sort = await nextSortInGroup(token, groupId)
  const routeUid = withN17Prefix(prefix, '')
  const page = await dataOf(token, 'POST', '/api/desktopRoutes:create', { title, icon, type: 'flowPage', parentId: groupId, sort, schemaUid: routeUid })
  const tabUid = withN17Prefix(prefix, 't')
  await dataOf(token, 'POST', '/api/desktopRoutes:create', { title: '', type: 'tabs', parentId: page.id, schemaUid: tabUid, tabSchemaName: withN17Prefix(prefix, 'ts') })
  const save = (model: Record<string, unknown>) => dataOf(token, 'POST', '/api/flowModels:save', model)
  await save({ uid: routeUid, schema: { use: 'RouteModel' } })
  await save({ uid: tabUid, schema: { use: 'RouteModel' } })
  const pageUid = withN17Prefix(prefix, 'p')
  await save({ uid: pageUid, parentId: routeUid, subKey: 'page', subType: 'object', use: 'RootPageModel', props: { title, displayTitle: true, enableTabs: false }, stepParams: { pageSettings: { general: { title, displayTitle: true, enableTabs: false } } } })
  const gridUid = withN17Prefix(prefix, 'g')
  await save({ uid: gridUid, parentId: tabUid, subKey: 'grid', subType: 'object', use: 'BlockGridModel', props: {}, filterManager: [] })
  console.log(`nocobase-w3-views: v2 route shell "${title}" created (/admin/${routeUid})`)
  return gridUid
}

async function boardHasKanban(rows: ReadonlyArray<FlowModelRow>, collection: string): boolean {
  return rows.some(row => row.use === 'KanbanBlockModel'
    && String(row.uid ?? '').startsWith('w3b3')
    && row.stepParams?.resourceSettings?.init?.collectionName === collection)
}

async function ensureKanbanBoard(token: string, spec: KanbanBoardSpec, groupId: number): Promise<void> {
  const models = await listFlowModels(token, 'w3-views')
  if (await boardHasKanban(models, spec.collection)) {
    console.log(`nocobase-w3-views: kanban board "${spec.title}" exists (kept)`)
    return
  }
  const gridUid = await ensureV2RouteShell(token, spec.title, spec.icon, groupId)
  const save = (model: Record<string, unknown>) => dataOf(token, 'POST', '/api/flowModels:save', model)

  const mainUid = withN17Prefix('w3b3', 'kb')
  await save({
    uid: mainUid, use: 'KanbanBlockModel', parentId: gridUid, subKey: 'items', subType: 'array', sortIndex: 1,
    // D4: dragEnabled false — collection:move must never write doc_status.
    props: { groupField: spec.groupField, groupOptions: spec.groupOptions, styleVariant: 'color', quickCreateEnabled: false, dragEnabled: false },
    stepParams: { resourceSettings: { init: { dataSourceKey: 'main', collectionName: spec.collection } } },
  })
  await save({
    uid: withN17Prefix('w3b3', 'fa'), parentId: mainUid, subKey: 'actions', subType: 'array', sortIndex: 1,
    use: 'FilterActionModel', props: {},
    stepParams: { buttonSettings: { general: { title: '{{t("Filter")}}' } } },
  })
  await save({
    uid: withN17Prefix('w3b3', 'rf'), parentId: mainUid, subKey: 'actions', subType: 'array', sortIndex: 2,
    use: 'RefreshActionModel', props: { title: '', icon: 'ReloadOutlined' },
    stepParams: { buttonSettings: { general: { title: '', icon: 'ReloadOutlined' } } },
  })
  const cardViewUid = withN17Prefix('w3b3', 'cva')
  await save({
    uid: cardViewUid, parentId: mainUid, subKey: 'cardViewAction', subType: 'object', sortIndex: 1,
    use: 'KanbanCardViewActionModel', props: {},
    stepParams: {
      popupSettings: { openView: { mode: 'drawer', size: 'medium', pageModelClass: 'ChildPageModel', collectionName: spec.collection, dataSourceKey: 'main' } },
    },
    // B1 load-only contract: the card drawer's persisted page subtree (plus
    // the MO operations subtable — the planner journey's drill-down anchor).
    subModels: {
      page: drawerPageTreeFor(cardViewUid, {
        collection: spec.collection,
        fields: toDetailSpec(await enrichSelectFields(token, spec.collection, spec.drawerFields)),
        tabTitle: '详情',
        uidPrefix: (tag: string) => withN17Prefix('w3b3', tag),
        ...(spec.drawerSubtables === undefined ? {} : { children: spec.drawerSubtables }),
      }),
    },
  })
  await save({ uid: withN17Prefix('w3b3', 'ci'), parentId: mainUid, ...kanbanCard(spec.collection, spec.cardFields) })
  console.log(`nocobase-w3-views: kanban board "${spec.title}" built (${spec.collection} × ${spec.groupField}, dragEnabled:false, card drawer + ${spec.drawerSubtables === undefined ? 0 : spec.drawerSubtables.length} subtable(s))`)
}

async function ensureCalendarPage(token: string, spec: CalendarPageSpec, groupId: number): Promise<void> {
  const models = await listFlowModels(token, 'w3-views')
  const built = spec.blocks.filter(block => models.some(row => row.use === 'CalendarBlockModel'
    && String(row.uid ?? '').startsWith('w3b3')
    && row.stepParams?.resourceSettings?.init?.collectionName === block.collection))
  if (built.length === spec.blocks.length) {
    console.log(`nocobase-w3-views: calendar page "${spec.title}" exists (kept)`)
    return
  }
  const gridUid = await ensureV2RouteShell(token, spec.title, spec.icon, groupId)
  const save = (model: Record<string, unknown>) => dataOf(token, 'POST', '/api/flowModels:save', model)

  for (const [index, block] of spec.blocks.entries()) {
    const mainUid = withN17Prefix('w3b3', 'cd')
    await save({
      uid: mainUid, use: 'CalendarBlockModel', parentId: gridUid, subKey: 'items', subType: 'array', sortIndex: index + 1,
      props: {
        fieldNames: { id: 'id', title: block.titleField, start: block.start, end: block.end },
        defaultView: 'month', enableQuickCreateEvent: false, weekStart: 1,
      },
      stepParams: {
        resourceSettings: { init: { dataSourceKey: 'main', collectionName: block.collection } },
        // Two stacked calendars per page: fixed height keeps both visible.
        cardSettings: { blockHeight: { heightMode: 'specifyValue', height: 520 } },
        calendarSettings: { eventPopupSettings: { filterByTk: '{{ctx.record.id}}' } },
      },
    })
    await save({
      uid: withN17Prefix('w3b3', 'fa'), parentId: mainUid, subKey: 'actions', subType: 'array', sortIndex: 1,
      use: 'FilterActionModel', props: {},
      stepParams: { buttonSettings: { general: { title: '{{t("Filter")}}' } } },
    })
    await save({ uid: withN17Prefix('w3b3', 'cn'), parentId: mainUid, subKey: 'actions', subType: 'array', sortIndex: 2, use: 'CalendarNavActionModel', props: {} })
    await save({ uid: withN17Prefix('w3b3', 'cv'), parentId: mainUid, subKey: 'actions', subType: 'array', sortIndex: 3, use: 'CalendarViewSelectActionModel', props: {} })
    await save({
      uid: withN17Prefix('w3b3', 'rf'), parentId: mainUid, subKey: 'actions', subType: 'array', sortIndex: 4,
      use: 'RefreshActionModel', props: { title: '', icon: 'ReloadOutlined' },
      stepParams: { buttonSettings: { general: { title: '', icon: 'ReloadOutlined' } } },
    })
    const eventViewUid = withN17Prefix('w3b3', 'eva')
    await save({
      uid: eventViewUid, parentId: mainUid, subKey: 'eventViewAction', subType: 'object', sortIndex: 1,
      use: 'CalendarEventViewActionModel', props: {},
      stepParams: {
        popupSettings: { openView: { mode: 'drawer', size: 'medium', pageModelClass: 'ChildPageModel', collectionName: block.collection, dataSourceKey: 'main', filterByTk: '{{ctx.record.id}}' } },
      },
      subModels: {
        page: drawerPageTreeFor(eventViewUid, {
          collection: block.collection,
          fields: toDetailSpec(await enrichSelectFields(token, block.collection, block.drawerFields)),
          tabTitle: '详情',
          uidPrefix: (tag: string) => withN17Prefix('w3b3', tag),
        }),
      },
    })
    console.log(`nocobase-w3-views: calendar block ${block.collection} on "${spec.title}" built (${block.start}→${block.end}, event drawer wired)`)
  }
}

/**
 * The v1 gantt page: desktopRoutes 'page' row + uiSchemas Page→Grid + tabs
 * child (the hub ensureMenus pattern, N14) + the official GanttBlockProvider
 * schema. Read-only: enableDragToReschedule false (FCS owns rescheduling).
 */
async function ensureGanttPage(token: string): Promise<void> {
  const routes = await listRoutes(token, 'w3-views')
  const groupId = (await menuGroupId(token, GANTT_PAGE.menuGroup))
  let pageRow = routes.find(row => row.title === GANTT_PAGE.title && row.type === 'page')
  if (pageRow === undefined) {
    if (routes.some(row => row.title === GANTT_PAGE.title && row.type === 'flowPage')) {
      throw new Error(`a flowPage named "${GANTT_PAGE.title}" already exists; this batch owns the v1 page channel for it`)
    }
    const sort = await nextSortInGroup(token, groupId)
    pageRow = await dataOf(token, 'POST', '/api/desktopRoutes:create', { title: GANTT_PAGE.title, icon: GANTT_PAGE.icon, type: 'page', parentId: groupId, sort }) as RouteRow
    console.log(`nocobase-w3-views: v1 page "${GANTT_PAGE.title}" row created`)
  }
  if (pageRow.schemaUid != null) {
    const tree = await dataOf(token, 'GET', `/api/uiSchemas:getJsonSchema/${pageRow.schemaUid}`)
    if (schemaHasComponent(tree, 'Gantt')) {
      console.log(`nocobase-w3-views: gantt page "${GANTT_PAGE.title}" exists (kept)`)
      return
    }
  }
  const schema = await dataOf(token, 'POST', '/api/uiSchemas:create', { type: 'void', 'x-component': 'Page' })
  const inserted = await dataOf(token, 'POST', `/api/uiSchemas:insertAdjacent/${schema['x-uid']}?position=afterBegin`, {
    schema: { type: 'void', 'x-component': 'Grid', 'x-initializer': 'page:addBlock' },
  }) as Record<string, unknown>
  await call(token, 'POST', `/api/desktopRoutes:update?filterByTk=${pageRow.id}`, { schemaUid: schema['x-uid'] })
  const gridUid = inserted?.['x-uid'] as string | undefined
  if (typeof gridUid === 'string') {
    await call(token, 'POST', '/api/desktopRoutes:create', {
      title: '', type: 'tabs', parentId: pageRow.id, schemaUid: gridUid, tabSchemaName: (inserted?.name as string | undefined) ?? gridUid,
    })
  }
  const nodeKey = (): string => Math.random().toString(36).slice(2, 13)
  const gantt = ganttBlock(GANTT_PAGE.collection, 'planned_date', 'planned_date', 'name', { enableDragToReschedule: false })
  await call(token, 'POST', `/api/uiSchemas:insertAdjacent/${gridUid}?position=beforeEnd`, {
    schema: { type: 'void', 'x-component': 'Grid.Row', properties: { [nodeKey()]: { type: 'void', 'x-component': 'Grid.Col', properties: { [nodeKey()]: gantt } } } },
  })
  console.log(`nocobase-w3-views: gantt page "${GANTT_PAGE.title}" built (${GANTT_PAGE.collection} planned_date one-day bars, enableDragToReschedule:false)`)
}

function schemaHasComponent(node: unknown, component: string): boolean {
  if (node === null || typeof node !== 'object') return false
  const record = node as Record<string, unknown>
  if (record['x-component'] === component) return true
  for (const child of Object.values(record.properties ?? {})) {
    if (schemaHasComponent(child, component)) return true
  }
  return false
}

/**
 * member view ACL for the collections only this batch surfaces (the w3-heal
 * grantMemberViewAcl contract; re-implemented here because the heal script
 * executes its whole pipeline on import). Explicit full field lists — the
 * fields=[]/null trap strips columns client-side otherwise.
 */
async function grantMemberViewAcl(token: string, collections: ReadonlyArray<string>): Promise<void> {
  let granted = 0
  for (const collection of collections) {
    const existing = (await dataOf(token, 'GET', `/api/rolesResources:list?pageSize=100&filter=${encodeURIComponent(JSON.stringify({ roleName: { $eq: 'member' }, name: { $eq: collection } }))}`)) as Array<{ id?: number }> | null
    let resourceId = existing?.[0]?.id
    if (resourceId === undefined) {
      const created = await dataOf(token, 'POST', '/api/rolesResources:create', {
        role: { name: 'member' }, name: collection, usingActionsConfig: true,
        actions: [{ name: 'view' }, { name: 'list' }, { name: 'get' }],
      })
      resourceId = created?.id
      granted += 1
    }
    if (resourceId === undefined) continue
    const fieldRows = (await dataOf(token, 'GET', `/api/fields:list?pageSize=200&filter=${encodeURIComponent(JSON.stringify({ collectionName: { $eq: collection } }))}`)) as Array<{ name?: string }> | null
    const fieldNames = (fieldRows ?? []).map(field => String(field.name)).filter(name => name.length > 0)
    const actions = (await dataOf(token, 'GET', `/api/rolesResourcesActions:list?pageSize=50&filter=${encodeURIComponent(JSON.stringify({ rolesResourceId: { $eq: resourceId } }))}`)) as Array<{ id?: number, fields?: string[] }> | null
    for (const action of actions ?? []) {
      if (action.id === undefined || action.id === null) continue
      const current = Array.isArray(action.fields) ? action.fields.slice().sort().join(',') : null
      if (current === fieldNames.slice().sort().join(',')) continue
      await dataOf(token, 'POST', `/api/rolesResourcesActions:update?filterByTk=${action.id}`, { fields: fieldNames })
    }
  }
  console.log(`nocobase-w3-views: member view ACL — ${granted > 0 ? `${granted} collection(s) granted (view/list/get, full field lists)` : 'rows in place'}`)
}

// ─── --assert: API-side对拍 + read-only negative probes ───

async function assertViews(token: string): Promise<void> {
  const failures: string[] = []
  const models = await listFlowModels(token, 'w3-views assert')
  const routes = await listRoutes(token, 'w3-views assert')

  // 1) board column distribution vs the list API (the psql twin lives in the
  //    evidence file; both must agree because they read the same rows).
  for (const spec of KANBAN_BOARDS) {
    const rows = (await dataOf(token, 'GET', `/api/${spec.collection}:list?pageSize=500`)) as Array<Record<string, unknown>> | null
    const counts = new Map<string, number>()
    for (const row of rows ?? []) {
      const key = String(row[spec.groupField] ?? '(null)')
      counts.set(key, (counts.get(key) ?? 0) + 1)
    }
    console.log(`assert: ${spec.title} (${spec.collection}.${spec.groupField}) — ${[...counts.entries()].map(([k, v]) => `${k}=${v}`).join(' ') || '(empty)'}`)
    const declared = new Set(spec.groupOptions.map(option => String((option as { value: string }).value)))
    const undeclared = [...counts.keys()].filter(key => key !== '(null)' && !declared.has(key))
    if (undeclared.length > 0) failures.push(`${spec.title}: rows carry group values outside groupOptions: ${undeclared.join(',')}`)
    const board = models.find(row => row.use === 'KanbanBlockModel' && String(row.uid ?? '').startsWith('w3b3')
      && row.stepParams?.resourceSettings?.init?.collectionName === spec.collection)
    if (board === undefined) {
      failures.push(`${spec.title}: w3b3 KanbanBlockModel missing`)
    } else if (board.props?.dragEnabled !== false) {
      failures.push(`${spec.title}: dragEnabled is ${String(board.props?.dragEnabled)} (D4 read-only violation)`)
    }
    const route = routes.find(row => row.title === spec.title && row.type === 'flowPage')
    if (route === undefined) failures.push(`${spec.title}: flowPage route missing`)
  }

  // 2) engine-collection boards are read-only everywhere (any uid prefix).
  const engineCollections = KANBAN_BOARDS.map(spec => spec.collection)
  for (const row of models.filter(candidate => candidate.use === 'KanbanBlockModel')
    .filter(candidate => engineCollections.includes(String(candidate.stepParams?.resourceSettings?.init?.collectionName ?? '')))) {
    if (row.props?.dragEnabled !== false) {
      failures.push(`engine-collection kanban ${String(row.uid)} on ${String(row.stepParams?.resourceSettings?.init?.collectionName)} has dragEnabled !== false (D4)`)
    }
  }
  // Free-state boards keep drag (regression guard for B1's fixed cards).
  for (const collection of ['srm_capas', 'qm_nc_dispositions']) {
    const board = models.find(row => row.use === 'KanbanBlockModel'
      && String(row.stepParams?.resourceSettings?.init?.collectionName ?? '') === collection)
    if (board !== undefined && board.props?.dragEnabled !== true) {
      failures.push(`free-state kanban ${collection} lost dragEnabled:true (regression)`)
    }
  }

  // 3) no create paths under w3b3 boards (read-only: engine verbs elsewhere).
  const w3b3KanbanUids = new Set(models.filter(row => row.use === 'KanbanBlockModel' && String(row.uid ?? '').startsWith('w3b3')).map(row => String(row.uid)))
  for (const row of models) {
    if (!w3b3KanbanUids.has(String(row.parentId ?? ''))) continue
    if (row.use === 'AddNewActionModel' || row.use === 'KanbanQuickCreateActionModel') {
      failures.push(`read-only board carries ${String(row.use)} (${String(row.uid)})`)
    }
  }

  // 4) the collection:move drag path is absent on every engine board
  //    collection (no sort field ⇒ no :move server action; negative probe).
  for (const collection of engineCollections) {
    const fields = (await dataOf(token, 'GET', `/api/fields:list?pageSize=200&filter=${encodeURIComponent(JSON.stringify({ collectionName: { $eq: collection }, name: { $eq: 'sort' } }))}`)) as Array<{ name?: string }> | null
    if ((fields ?? []).length > 0) failures.push(`${collection} carries a sort field — the :move drag path exists (D4 violation)`)
    const moved = await call(token, 'POST', `/api/${collection}:move?filterByTk=1&field=doc_status&targetGroup=draft`).catch((error: unknown) => error as Error)
    if (!(moved instanceof Error)) failures.push(`${collection}:move resolved without error (drag write path live)`)
    else console.log(`assert: ${collection}:move refused ✓ (${moved.message.slice(0, 80)})`)
  }

  // 5) gantt page: v1 route + uiSchemas carries the read-only GanttBlockProvider.
  const ganttRoute = routes.find(row => row.title === GANTT_PAGE.title && row.type === 'page')
  if (ganttRoute === undefined || ganttRoute.schemaUid == null) {
    failures.push('排产甘特 v1 page route/schemaUid missing')
  } else {
    const tree = await dataOf(token, 'GET', `/api/uiSchemas:getJsonSchema/${ganttRoute.schemaUid}`)
    if (!schemaHasComponent(tree, 'Gantt')) failures.push('排产甘特 uiSchemas carries no Gantt component')
    const found = findDecorator(tree, 'GanttBlockProvider') as Record<string, any> | undefined
    if (found === undefined) {
      failures.push('排产甘特 GanttBlockProvider decorator not found')
    } else {
      const fieldNames = found['x-decorator-props']?.fieldNames ?? {}
      if (fieldNames.start !== 'planned_date' || fieldNames.end !== 'planned_date' || fieldNames.title !== 'name') {
        failures.push(`排产甘特 fieldNames wrong: ${JSON.stringify(fieldNames)}`)
      }
      if (found['x-decorator-props']?.enableDragToReschedule !== false) {
        failures.push('排产甘特 enableDragToReschedule !== false (D5 read-only violation)')
      }
      const ops = (await dataOf(token, 'GET', '/api/mfg_order_operations:list?pageSize=500&filter=' + encodeURIComponent(JSON.stringify({ planned_date: { $ne: null } })))) as Array<Record<string, unknown>> | null
      console.log(`assert: 排产甘特 data source mfg_order_operations(planned_date≠null) = ${(ops ?? []).length} row(s); first bar ${JSON.stringify((ops ?? [])[0]?.planned_date ?? null)}`)
    }
  }

  // 6) calendars: four w3b3 blocks + event drawers resolve.
  for (const page of CALENDAR_PAGES) {
    const route = routes.find(row => row.title === page.title && row.type === 'flowPage')
    if (route === undefined) failures.push(`${page.title}: flowPage route missing`)
    for (const block of page.blocks) {
      const row = models.find(candidate => candidate.use === 'CalendarBlockModel' && String(candidate.uid ?? '').startsWith('w3b3')
        && candidate.stepParams?.resourceSettings?.init?.collectionName === block.collection)
      if (row === undefined) {
        failures.push(`${page.title}: w3b3 CalendarBlockModel on ${block.collection} missing`)
        continue
      }
      if (row.props?.enableQuickCreateEvent !== false) failures.push(`${block.collection} calendar allows quick-create events (read-only violation)`)
      const events = (await dataOf(token, 'GET', `/api/${block.collection}:list?pageSize=500&filter=${encodeURIComponent(JSON.stringify({ [block.start]: { $ne: null } }))}`)) as Array<Record<string, unknown>> | null
      console.log(`assert: ${page.title}/${block.collection} events(${block.start}≠null) = ${(events ?? []).length}`)
    }
  }

  // 7) W3-B6 terminals: three w3b6 flowPages carry an iframe block pinned
  //    at the engine-serve URL (the page itself is served by --serve).
  for (const spec of TERMINAL_PAGES) {
    const route = routes.find(row => row.title === spec.title && row.type === 'flowPage')
    if (route === undefined) {
      failures.push(`${spec.title}: flowPage route missing`)
      continue
    }
    const gridUid = await terminalGridUid(token, routes, spec.title)
    const block = models.find(row => row.use === 'IframeBlockModel' && row.parentId === gridUid)
    if (block === undefined) {
      failures.push(`${spec.title}: IframeBlockModel under the page grid missing`)
    } else if (String(block.props?.url ?? '') !== terminalUrl(spec)) {
      failures.push(`${spec.title}: iframe url ${JSON.stringify(String(block.props?.url ?? ''))} ≠ ${terminalUrl(spec)}`)
    }
  }

  if (failures.length > 0) throw new Error(`--assert FAILED:\n  - ${failures.join('\n  - ')}`)
  console.log('nocobase-w3-views: --assert OK (column distributions + read-only negatives + gantt source + calendar events + terminal iframes)')
}

function findDecorator(node: unknown, decorator: string): unknown {
  if (node === null || typeof node !== 'object') return undefined
  const record = node as Record<string, unknown>
  if (record['x-decorator'] === decorator) return record
  for (const child of Object.values(record.properties ?? {})) {
    const found = findDecorator(child, decorator)
    if (found !== undefined) return found
  }
  return undefined
}

// ─── --rollback: w3b3 prefix destroy + route rows + v1 uiSchemas tree ───

async function rollback(token: string): Promise<void> {
  const routes = await listRoutes(token, 'w3-views rollback')
  const pageTitles = [...KANBAN_BOARDS.map(spec => spec.title), ...CALENDAR_PAGES.map(spec => spec.title), GANTT_PAGE.title, ...TERMINAL_PAGES.map(spec => spec.title)]
  for (const title of pageTitles) {
    // Ownership guard: v2 flowPages are destroyed only when their schemaUid
    // carries this batch's w3b3 prefix — a same-titled page from another
    // batch (B9's 生产看板 KPI dashboard was the live casualty) must never
    // ride a title match into cascade destruction.
    const own = routes.filter(row => row.title === title
      && (row.type === 'page' || String(row.schemaUid ?? '').startsWith('w3b3') || String(row.schemaUid ?? '').startsWith('w3b6')))
    if (own.length === 0) continue
    const tabsRows = routes.filter(row => row.type === 'tabs' && own.some(parent => row.parentId === parent.id))
    for (const row of [...tabsRows, ...own]) {
      // The v1 gantt page's uiSchemas tree dies with its root schemaUid.
      if (row.type === 'page' && row.schemaUid != null && row.title === GANTT_PAGE.title) {
        await call(token, 'POST', `/api/uiSchemas:destroy?filterByTk=${row.schemaUid}`).catch(() => undefined)
      }
      await call(token, 'DELETE', `/api/desktopRoutes:destroy?filterByTk=${row.id}`)
    }
    console.log(`nocobase-w3-views: rollback destroyed route "${title}" (+tabs)`)
  }
  const models = await listFlowModels(token, 'w3-views rollback')
  const mine = models.filter(row => String(row.uid ?? '').startsWith('w3b3') || String(row.uid ?? '').startsWith('w3b6'))
  for (const row of mine) {
    // POST is the working verb here (f1's destroyF1Trees); desktopRoutes
    // destroy already cascaded the route-owned trees — this loop sweeps
    // any stragglers left outside a route tree.
    await call(token, 'POST', `/api/flowModels:destroy?filterByTk=${encodeURIComponent(String(row.uid))}`).catch(() => undefined)
  }
  console.log(`nocobase-w3-views: rollback destroyed ${mine.length} w3b3 flowModels row(s)`)
}

async function main(): Promise<void> {
  const args = process.argv.slice(2)
  const token = await signInWithRetry()
  if (args.includes('--rollback')) {
    await rollback(token)
    console.log('nocobase-w3-views: done (rollback)')
    return
  }
  if (args.includes('--assert')) {
    await assertViews(token)
    return
  }
  // The MO drawer's operations subtable rides a hasMany that no earlier
  // batch registered (B2's SUBTABLE_SPECS has no mfg_orders entry).
  await ensureParentHasMany(token, 'mfg_orders', 'order_operations', 'mfg_order_operations', 'order_id')
  const groups = new Map<string, number>()
  for (const title of ['采购管理', '生产与计划', '销售管理', '质量管理', '仓储管理']) {
    groups.set(title, await menuGroupId(token, title))
  }
  for (const spec of KANBAN_BOARDS) {
    await ensureKanbanBoard(token, spec, groups.get(spec.menuGroup) as number)
  }
  for (const spec of CALENDAR_PAGES) {
    await ensureCalendarPage(token, spec, groups.get(spec.menuGroup) as number)
  }
  await ensureGanttPage(token)
  await ensureTerminalPages(token, groups)
  await grantMemberViewAcl(token, ['mfg_order_operations', 'mps_plans', 'mrp_suggestions'])
  console.log('nocobase-w3-views: done (build)')
}

const invokedDirectly = process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href
if (invokedDirectly) await main()
