/**
 * W9/B9: the real-data dashboard pages' NocoBase side
 * (plans/2026-09-25-mfg-closure/10-b9-dashboards-final.md). One script,
 * every step idempotent:
 *
 * 1. The kpi_snapshots collection (board/kpi_code/kpi_name/unit/dim/value/
 *    calc_date/note — every row carries its psql reconciliation 口径 in
 *    note; kpi-run.mts owns the writes).
 * 2. so_orders grows shipped_at (the OTIF on-time anchor; the ship engine
 *    writes it on the fully-shipped transition). Existing shipped orders
 *    backfill shipped_at = approved_at — the W-round replay world shipped
 *    them the same run day they were approved on, and the script logs the
 *    backfill loudly.
 * 3. The 经营分析 menu group + five v2 flowPages (经营看板/供应链看板/
 *    生产看板/库存看板 + W2-B7's 应收应付对账): one kpi_snapshots table
 *    spine per board (the value + 口径 columns; the reconciliation page
 *    instead carries four read-only business-ledger blocks) plus chart
 *    blocks through the F4 authoring
 *    channel — a line trend + a bar comparison each; the supply page adds
 *    the supplier-performance radar (the h4 custom-visual channel) and the
 *    inventory page adds the wms_lots expiry ledger table (临期预警清单 —
 *    T+1 scanning cadence noted in the heading; a sub-daily scan needs the
 *    nightly cron, which the open-source snapshot ships without).
 * 4. Charts read kpi_snapshots directly — no mock layer between the block
 *    and the materialized truth (psql 抽值与图示一致 is the acceptance).
 *
 * Usage (repo root, tsx loader):
 *   node --import tsx/esm examples/kb-agent/scripts/nocobase-w9-dashboards.mts
 *   node --import tsx/esm examples/kb-agent/scripts/nocobase-w9-dashboards.mts --rollback
 */
import { batchScopedRows, blockOwnedByPage, call, dataOf, ensureTableRowDetail, gridOwnerRoutes, listFlowModels, listRoutes, signInWithRetry, withN17Prefix } from './nocobase-flow-page-lib.mts'

type RouteRow = import('./nocobase-flow-page-lib.mts').RouteRow
type FlowModelRow = import('./nocobase-flow-page-lib.mts').FlowModelRow

// ─── field factories (the w5/w7 wire shapes) ───

const input = (name: string, title: string): object => ({ name, type: 'string', interface: 'input', uiSchema: { type: 'string', 'x-component': 'Input', title } })
const textarea = (name: string, title: string): object => ({ name, type: 'text', interface: 'textarea', uiSchema: { type: 'string', 'x-component': 'Input.TextArea', title } })
const select = (name: string, title: string, enumOptions: object[]): object => ({ name, type: 'string', interface: 'select', uiSchema: { type: 'string', 'x-component': 'Select', title, enum: enumOptions } })
const number = (name: string, title: string): object => ({ name, type: 'float', interface: 'number', uiSchema: { type: 'number', 'x-component': 'InputNumber', title } })
const date = (name: string, title: string): object => ({ name, type: 'dateOnly', interface: 'date', uiSchema: { type: 'string', 'x-component': 'DatePicker', title, 'x-component-props': { dateFormat: 'YYYY-MM-DD' } } })

const opts = (pairs: ReadonlyArray<[string, string, string]>): object[] => pairs.map(([value, label, color]) => ({ value, label, color }))

// ─── the kpi_snapshots collection ───

const BOARD_OPTS = opts([
  ['business', '经营', 'blue'], ['supply', '供应链', 'cyan'],
  ['production', '生产', 'purple'], ['inventory', '库存', 'orange'],
])
const UNIT_OPTS = opts([
  ['percent', '百分比', 'default'], ['count', '计数', 'default'], ['money', '金额', 'default'],
  ['days', '天数', 'default'], ['qty', '数量', 'default'],
])

const COLLECTIONS: ReadonlyArray<{ name: string, title: string, titleField?: string, fields: object[] }> = [
  {
    // The T+1 materialized KPI store (PLAN D9). kpi-run.mts is the only
    // writer; the dashboard pages and the mobile cockpit read it.
    name: 'kpi_snapshots', title: 'KPI 快照', titleField: 'id', fields: [
      select('board', '看板', BOARD_OPTS), input('kpi_code', '指标编码'), input('kpi_name', '指标名'),
      select('unit', '单位', UNIT_OPTS), input('dim', '维度（可空）'),
      number('value', '值'), date('calc_date', '计算日'), textarea('note', '口径'),
    ],
  },
]

/** Columns this batch adds to existing collections (idempotent field adds). */
const ADDITIVE_COLUMNS: ReadonlyArray<{ collection: string, fields: object[] }> = [
  // The OTIF on-time anchor: the ship engine stamps the fully-shipped date.
  { collection: 'so_orders', fields: [date('shipped_at', '发货日')] },
]

const MENU_GROUP = { title: '经营分析', icon: 'LineChartOutlined' }

// ─── REST helpers ───

/**
 * Fail-closed collection read: a truncated first page (meta.total >
 * rows.length) throws instead of letting callers reconcile against a
 * partial truth; raise the page size or paginate when it fires.
 */
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

// ─── structural steps ───

async function ensureCollections(token: string): Promise<void> {
  for (const collection of COLLECTIONS) {
    const existing = await dataOf(token, 'GET', `/api/collections/${collection.name}`)
    if (existing !== null) {
      console.log(`nocobase-w9: collection ${collection.name} exists (kept)`)
    } else {
      await dataOf(token, 'POST', '/api/collections:create', { name: collection.name, title: collection.title, ...(collection.titleField === undefined ? {} : { titleField: collection.titleField }), fields: collection.fields })
      console.log(`nocobase-w9: collection ${collection.name} created`)
    }
  }
  for (const spec of ADDITIVE_COLUMNS) {
    const names = new Set(((await dataOf(token, 'GET', `/api/fields:list?filter=${encodeURIComponent(JSON.stringify({ collectionName: { $eq: spec.collection } }))}&pageSize=200`) as Array<{ name?: string }> | null) ?? []).map(field => field.name))
    for (const field of spec.fields) {
      const name = (field as { name: string }).name
      if (names.has(name)) {
        console.log(`nocobase-w9: ${spec.collection}.${name} exists (kept)`)
        continue
      }
      await dataOf(token, 'POST', '/api/fields:create', { collectionName: spec.collection, ...field })
      console.log(`nocobase-w9: ${spec.collection}.${name} added`)
    }
  }
  // Backfill the W-round replay world: shipped SOs without a stamped date
  // get shipped_at = approved_at (both land the same run day here; the
  // log line keeps the backfill explicit).
  const sos = await rowsOf(token, 'so_orders')
  let backfilled = 0
  for (const so of sos.filter(row => String(row.shipping_status) === 'shipped' && (row.shipped_at === null || row.shipped_at === undefined || row.shipped_at === ''))) {
    const anchor = so.approved_at === null || so.approved_at === undefined || so.approved_at === '' ? new Date().toISOString().slice(0, 10) : String(so.approved_at)
    await dataOf(token, 'POST', `/api/so_orders:update?filterByTk=${so.id}`, { shipped_at: anchor })
    backfilled += 1
  }
  if (backfilled > 0) console.log(`nocobase-w9: ${String(backfilled)} shipped SO(s) backfilled shipped_at=approved_at（W 轮重放世界补锚）`)
}

/**
 * Narrow the admin role's strategy-wide write on kpi_snapshots to an
 * explicit read-only rolesResources row (the h5-wms bypass-guard shape):
 * kpi-run.mts stays the only writer via the root token; every non-root
 * session that PATCHes the collection meets 403. Idempotent — an existing
 * row is repaired to the read-only action set when drifted.
 */
async function ensureReadOnlyGuard(token: string): Promise<void> {
  const rows = (await dataOf(token, 'GET', `/api/rolesResources:list?pageSize=100&filter=${encodeURIComponent(JSON.stringify({ roleName: { $eq: 'admin' }, name: { $eq: 'kpi_snapshots' } }))}`)) as Array<Record<string, any>> | null
  const readOnlyActions = [{ name: 'view' }, { name: 'list' }, { name: 'get' }, { name: 'export' }]
  if (rows === null || rows.length === 0) {
    await dataOf(token, 'POST', '/api/rolesResources:create', {
      role: { name: 'admin' }, name: 'kpi_snapshots', usingActionsConfig: true, actions: readOnlyActions,
    })
    console.log('nocobase-w9: read-only guard — admin→kpi_snapshots narrowed to read-only (update/create/destroy off)')
    return
  }
  const guard = rows[0]
  if (guard.usingActionsConfig !== true) {
    await dataOf(token, 'POST', `/api/rolesResources:update?filterByTk=${guard.id}`, { usingActionsConfig: true })
    console.log('nocobase-w9: read-only guard repaired — admin→kpi_snapshots usingActionsConfig on')
  }
}

// ─── the four dashboard pages ───

type FieldKind = 'input' | 'select' | 'number' | 'date'
type FieldSpec = { name: string, title: string, kind: FieldKind, options?: object[] }
/** One sorting rule row in the v2 tableSettings.defaultSorting wire (the sortingRule action's shape). */
type SortRule = { field: string, direction: 'asc' | 'desc' }
type BlockSpec = {
  heading: string
  collection: string
  columns: ReadonlyArray<FieldSpec>
  /** Field→value equality rows; written as the tableSettings.dataScope filter group — the wire the runtime replays on beforeRender. */
  defaultFilter?: Readonly<Record<string, string>>
  /** The tableSettings.defaultSorting wire; calc_date desc keeps the freshest pass on the first screen. */
  defaultSort?: ReadonlyArray<SortRule>
}
type PageSpec = { title: string, icon: string, description: string, board: 'business' | 'supply' | 'production' | 'inventory' | 'finance', blocks: ReadonlyArray<BlockSpec> }

const KPI_TABLE_COLUMNS: ReadonlyArray<FieldSpec> = [
  { name: 'kpi_name', title: '指标', kind: 'input' },
  { name: 'value', title: '值', kind: 'number' },
  { name: 'unit', title: '单位', kind: 'select', options: UNIT_OPTS },
  { name: 'dim', title: '维度', kind: 'input' },
  { name: 'calc_date', title: '计算日', kind: 'date' },
  { name: 'note', title: '口径', kind: 'input' },
]

const PAGES: ReadonlyArray<PageSpec> = [
  {
    title: '经营看板', icon: 'DashboardOutlined', board: 'business',
    description: '待审批数/当月收入/毛利率/回款率/应收余额（T+1 物化快照，口径见表格）',
    blocks: [
      { heading: '经营 KPI 快照', collection: 'kpi_snapshots', columns: KPI_TABLE_COLUMNS, defaultFilter: { board: 'business' }, defaultSort: [{ field: 'calc_date', direction: 'desc' }] },
    ],
  },
  {
    title: '供应链看板', icon: 'ApartmentOutlined', board: 'supply',
    description: 'OTIF/供应商准时到货/采购提前期 P50P90/缺料预警/在途（T+1 物化快照）',
    blocks: [
      { heading: '供应链 KPI 快照', collection: 'kpi_snapshots', columns: KPI_TABLE_COLUMNS, defaultFilter: { board: 'supply' }, defaultSort: [{ field: 'calc_date', direction: 'desc' }] },
    ],
  },
  {
    title: '生产看板', icon: 'ExperimentOutlined', board: 'production',
    description: '产能利用率/一次合格率/滚动合格率/计划达成率/批次合格率（T+1 物化快照）',
    blocks: [
      { heading: '生产 KPI 快照', collection: 'kpi_snapshots', columns: KPI_TABLE_COLUMNS, defaultFilter: { board: 'production' }, defaultSort: [{ field: 'calc_date', direction: 'desc' }] },
    ],
  },
  {
    title: '库存看板', icon: 'InboxOutlined', board: 'inventory',
    description: '呆滞占比/临期预警/账实相符率/资金占用/在制在架/周转率·周转天数（T+1 物化快照；库存三码 W2-B4 起按流水 biz_date 重放、周转两码月度粒度；临期清单为 T+1 扫描——小时级扫描需夜间 cron，开源快照未带 schedule 插件）',
    blocks: [
      { heading: '库存 KPI 快照', collection: 'kpi_snapshots', columns: KPI_TABLE_COLUMNS, defaultFilter: { board: 'inventory' }, defaultSort: [{ field: 'calc_date', direction: 'desc' }] },
      {
        heading: '批次效期台账（临期<30 天预警清单，剩余效期=失效日−今日）',
        collection: 'wms_lots',
        columns: [
          { name: 'lot_no', title: '批次号', kind: 'input' },
          { name: 'product', title: '物料', kind: 'input' },
          { name: 'production_date', title: '生产日期', kind: 'date' },
          { name: 'alert_date', title: '预警日', kind: 'date' },
          { name: 'expiry_date', title: '失效日', kind: 'date' },
          { name: 'removal_date', title: '下架日', kind: 'date' },
          { name: 'status', title: '状态', kind: 'input' },
        ],
      },
    ],
  },
  {
    // W2-B7: the AR/AP reconciliation page — the two balance trends read the
    // ar_balance/ap_balance snapshots (mirror 口径), the four read-only
    // detail blocks carry the business ledgers behind them. 业务台账口径，
    // 非会计核算（PLAN D11 keeps the general ledger out of scope）.
    title: '应收应付对账', icon: 'AccountBookOutlined', board: 'finance',
    description: '应收/应付余额趋势（ar=Σ approved SO−Σ 回款，ap=Σ confirmed 采购发票−Σ 已生效付款；业务台账口径非会计核算 D11）+ 应收/应付四明细台账（只读）',
    blocks: [
      {
        heading: '应收明细（销售订单，approved 计入应收锚）',
        collection: 'so_orders',
        columns: [
          { name: 'code', title: '订单号', kind: 'input' },
          { name: 'amount', title: '金额', kind: 'number' },
          { name: 'doc_status', title: '审批状态', kind: 'input' },
          { name: 'shipping_status', title: '发货进度', kind: 'input' },
          { name: 'approved_at', title: '生效日', kind: 'date' },
        ],
        defaultSort: [{ field: 'approved_at', direction: 'desc' }],
      },
      {
        heading: '回款明细（crm_payments，paid_at ≤ 日计入应收抵减）',
        collection: 'crm_payments',
        columns: [
          { name: 'customer', title: '客户', kind: 'input' },
          { name: 'amount', title: '金额', kind: 'number' },
          { name: 'method', title: '方式', kind: 'input' },
          { name: 'paid_at', title: '到账日期', kind: 'date' },
          { name: 'status', title: '状态', kind: 'input' },
        ],
        defaultSort: [{ field: 'paid_at', direction: 'desc' }],
      },
      {
        heading: '采购发票明细（pur_invoices，confirmed 计入应付锚）',
        collection: 'pur_invoices',
        columns: [
          { name: 'code', title: '发票编号', kind: 'input' },
          { name: 'po', title: '采购订单', kind: 'input' },
          { name: 'invoice_no', title: '发票号', kind: 'input' },
          { name: 'invoice_amount', title: '发票金额', kind: 'number' },
          { name: 'billed_at', title: '开票日期', kind: 'date' },
          { name: 'match_result', title: '匹配结果', kind: 'input' },
        ],
        defaultSort: [{ field: 'billed_at', direction: 'desc' }],
      },
      {
        heading: '付款明细（pur_payments，approved 计入应付抵减）',
        collection: 'pur_payments',
        columns: [
          { name: 'code', title: '付款单号', kind: 'input' },
          { name: 'invoice', title: '发票', kind: 'input' },
          { name: 'amount', title: '金额', kind: 'number' },
          { name: 'pay_date', title: '付款日期', kind: 'date' },
          { name: 'doc_status', title: '审批状态', kind: 'input' },
        ],
        defaultSort: [{ field: 'pay_date', direction: 'desc' }],
      },
    ],
  },
]

const listModels = (token: string): Promise<FlowModelRow[]> => listFlowModels(token, 'W9')
const listAllRoutes = (token: string): Promise<RouteRow[]> => listRoutes(token, 'W9')

const displayModelFor = (kind: FieldKind): string => {
  switch (kind) {
    case 'select': return 'DisplayEnumFieldModel'
    case 'number': return 'DisplayNumberFieldModel'
    case 'date': return 'DisplayDateTimeFieldModel'
    default: return 'DisplayTextFieldModel'
  }
}

async function ensureMenuGroup(token: string): Promise<{ id: number }> {
  const existing = (await listAllRoutes(token)).find(row => row.title === MENU_GROUP.title && row.type === 'group')
  if (existing !== undefined) {
    console.log(`nocobase-w9: menu group "${MENU_GROUP.title}" exists (kept)`)
    return { id: existing.id }
  }
  const row = await dataOf(token, 'POST', '/api/desktopRoutes:create', { title: MENU_GROUP.title, icon: MENU_GROUP.icon, type: 'group' })
  console.log(`nocobase-w9: menu group "${MENU_GROUP.title}" created`)
  return { id: Number(row.id) }
}

/**
 * Whether this page already carries its own w9kpi table block for one
 * collection: uid-prefixed (rules out other batches' blocks on the same
 * collection, e.g. the h5-wms wms_lots ledger) and owned by this page's
 * route (rules out sibling w9 pages sharing kpi_snapshots).
 */
async function pageHasBlock(token: string, collection: string, routeSchemaUid: string): Promise<boolean> {
  const models = await listModels(token)
  const routes = await listAllRoutes(token)
  const gridOwners = gridOwnerRoutes(models, routes)
  return batchScopedRows(models, { use: 'TableBlockModel', collection, uidPrefix: 'w9kpi' })
    .some(row => blockOwnedByPage(row, gridOwners, routeSchemaUid))
}

/**
 * The v2 stepParams the runtime actually replays on beforeRender: the
 * tableSettings flow's dataScope action reads its filter group
 * (three-part {logic, items} form) onto the resource, the defaultSorting
 * action its sort — both under the `tableSettings` flow key, matching
 * getStepParams('tableSettings', stepKey). A filter parked in
 * resourceSettings.init is ignored by the reader — that was the B1-era
 * dead wire this batch replaces (flowModels:save replaces stepParams
 * wholesale, so the whole object rides every save).
 */
function tableSettingsOf(block: BlockSpec): { tableSettings: Record<string, unknown> } {
  const tableSettings: Record<string, unknown> = {}
  if (block.defaultFilter !== undefined) {
    tableSettings.dataScope = {
      filter: {
        logic: '$and',
        items: Object.entries(block.defaultFilter).map(([path, value]) => ({ path, operator: '$eq', value })),
      },
    }
  }
  if (block.defaultSort !== undefined && block.defaultSort.length > 0) {
    tableSettings.defaultSorting = { sort: block.defaultSort }
  }
  return { tableSettings }
}

async function ensureV2Page(token: string, spec: PageSpec, groupId: number, sort: number): Promise<void> {
  const flow = (await listAllRoutes(token)).find(row => row.title === spec.title && row.type === 'flowPage')
  if (flow !== undefined) {
    const routeSchemaUid = String(flow.schemaUid ?? '')
    for (const block of spec.blocks) {
      if (!(await pageHasBlock(token, block.collection, routeSchemaUid))) {
        throw new Error(`v2 page "${spec.title}" is truncated (missing ${block.collection}); run --rollback to tear the batch down and rebuild`)
      }
    }
    console.log(`nocobase-w9: v2 page "${spec.title}" exists (kept)`)
    return
  }
  if ((await listAllRoutes(token)).some(row => row.title === spec.title && row.type === 'page')) {
    throw new Error(`a v1 page named "${spec.title}" already exists; rename it first`)
  }
  const routeUid = withN17Prefix('w9kpi', '')
  const page = await dataOf(token, 'POST', '/api/desktopRoutes:create', { title: spec.title, icon: spec.icon, type: 'flowPage', parentId: groupId, sort, schemaUid: routeUid })
  const tabUid = withN17Prefix('w9kpi', 't')
  await dataOf(token, 'POST', '/api/desktopRoutes:create', { title: '', type: 'tabs', parentId: page.id, schemaUid: tabUid, tabSchemaName: withN17Prefix('w9kpi', 'ts') })

  const save = (model: Record<string, unknown>) => dataOf(token, 'POST', '/api/flowModels:save', model)
  await save({ uid: routeUid, schema: { use: 'RouteModel' } })
  await save({ uid: tabUid, schema: { use: 'RouteModel' } })
  const pageUid = withN17Prefix('w9kpi', 'p')
  await save({ uid: pageUid, parentId: routeUid, subKey: 'page', subType: 'object', use: 'RootPageModel', props: { title: spec.title, displayTitle: true, enableTabs: false }, stepParams: { pageSettings: { general: { title: spec.title, displayTitle: true, enableTabs: false, description: spec.description } } } })
  const gridUid = withN17Prefix('w9kpi', 'g')
  await save({ uid: gridUid, parentId: tabUid, subKey: 'grid', subType: 'object', use: 'BlockGridModel', props: {}, filterManager: [] })

  let blockIndex = 0
  for (const block of spec.blocks) {
    blockIndex += 1
    const tableUid = withN17Prefix('w9kpi', 'tb')
    await save({
      uid: tableUid, use: 'TableBlockModel', parentId: gridUid, subKey: 'items', subType: 'array', sortIndex: blockIndex,
      props: { title: block.heading },
      stepParams: {
        resourceSettings: {
          init: {
            dataSourceKey: 'main', collectionName: block.collection,
          },
        },
        ...tableSettingsOf(block),
      },
    })
    let sortIndex = 1
    for (const column of block.columns) {
      const uid = withN17Prefix('w9kpi', 'c')
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
    await save({
      uid: withN17Prefix('w9kpi', 'rf'), parentId: tableUid, subKey: 'actions', subType: 'array', sortIndex: 2, use: 'RefreshActionModel',
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
  console.log(`nocobase-w9: v2 page "${spec.title}" created (/admin/${routeUid}) with ${spec.blocks.length} table block(s)`)
}

// ─── chart blocks (the F4 authoring channel; radar rides visual.mode='custom') ───

/** Resolve the BlockGrid uid of one v2 page (its tabs child carries the grid parent uid). */
async function pageGridUid(token: string, pageTitle: string): Promise<string> {
  const routes = await listAllRoutes(token)
  const flow = routes.find(row => row.title === pageTitle && row.type === 'flowPage')
  if (flow === undefined) throw new Error(`v2 page "${pageTitle}" not found; the table spine should have created it`)
  const tab = routes.find(row => row.parentId === flow.id && row.type === 'tabs')
  if (tab?.schemaUid == null) throw new Error(`v2 page "${pageTitle}" has no tabs child row`)
  const grid = await dataOf(token, 'GET', `/api/flowModels:findOne?parentId=${tab.schemaUid}&subKey=grid`)
  if (grid?.uid == null) throw new Error(`v2 page "${pageTitle}" grid not found under tab ${tab.schemaUid}`)
  return String(grid.uid)
}

const chartQueryOf = (row: FlowModelRow): any => row?.stepParams?.chartSettings?.configure?.query ?? {}
const chartAliases = (row: FlowModelRow): Set<string> =>
  new Set((Array.isArray(chartQueryOf(row)?.measures) ? chartQueryOf(row).measures : []).map((measure: any) => String(measure?.alias ?? '')))
/**
 * Read one filter key's value out of the chart query — persisted rows carry
 * the server's canonicalized `{logic, items: [{path, operator, value}]}`
 * triple form, fresh payloads the raw `{key: {$eq|…: value}}` form; both
 * resolve (undefined when the key does not filter at all).
 */
function chartFilterValue(row: FlowModelRow, key: string): unknown {
  const filter = chartQueryOf(row)?.filter
  if (filter === null || typeof filter !== 'object') return undefined
  const items = (filter as { items?: unknown }).items
  if (Array.isArray(items)) {
    for (const item of items) {
      if (item === null || typeof item !== 'object') continue
      const condition = item as { path?: unknown, value?: unknown }
      if (condition.path === key) return condition.value
    }
    return undefined
  }
  const raw = (filter as Record<string, unknown>)[key]
  if (raw !== null && typeof raw === 'object' && !Array.isArray(raw) && '$eq' in (raw as Record<string, unknown>)) {
    return (raw as Record<string, unknown>)['$eq']
  }
  return raw
}
const collectionOfQuery = (row: FlowModelRow, dotted: string): boolean => {
  const query = chartQueryOf(row)
  return query?.resource?.collectionName === dotted.split('.')[1]
    || (Array.isArray(query?.collectionPath) && query.collectionPath.join('.') === dotted)
}
const targetsKpi = (row: FlowModelRow): boolean => collectionOfQuery(row, 'main.kpi_snapshots')
const dimensionIs = (row: FlowModelRow, field: string): boolean =>
  (Array.isArray(chartQueryOf(row)?.dimensions) ? chartQueryOf(row).dimensions : []).some((dim: any) =>
    Array.isArray(dim?.field) ? dim.field[dim.field.length - 1] === field : dim?.field === field)

/** One chart spec: a discriminating existence predicate and the addBlock body settings. */
interface ChartSpec {
  readonly page: string
  readonly title: string
  readonly exists: (row: FlowModelRow) => boolean
  readonly settings: Record<string, unknown>
}

/** The supplier-performance radar's raw ECharts option (the h4 channel, five dimensions). */
const RADAR_RAW = [
  'return {',
  '  tooltip: {},',
  '  legend: { bottom: 0 },',
  '  radar: { indicator: [',
  "    { name: '质量', max: 100 }, { name: '交期', max: 100 }, { name: '价格', max: 100 },",
  "    { name: '服务', max: 100 }, { name: '合规', max: 100 },",
  '  ] },',
  "  series: [{ type: 'radar', data: (ctx.data.objects || []).map((row) => ({",
  '    name: row.period,',
  '    value: [row.q, row.d, row.p, row.s, row.c],',
  '  })) }],',
  '}',
].join('\n')

/**
 * The per-page chart set. Every trend chart reads kpi_snapshots with a
 * kpi_code filter (one series per code — no cross-KPI mixing); the supply
 * radar reads srm_score_cards (the h4 wire verbatim).
 */
const CHARTS: ReadonlyArray<ChartSpec> = [
  {
    page: '经营看板', title: '毛利率趋势',
    exists: row => targetsKpi(row) && chartFilterValue(row, 'kpi_code') === 'gross_margin' && dimensionIs(row, 'calc_date'),
    settings: {
      query: {
        mode: 'builder', resource: { dataSourceKey: 'main', collectionName: 'kpi_snapshots' },
        measures: [{ field: 'value', aggregation: 'avg', alias: 'v' }],
        dimensions: [{ field: 'calc_date' }],
        filter: { kpi_code: { $eq: 'gross_margin' } },
      },
      visual: { mode: 'basic', type: 'line', mappings: { x: 'calc_date', y: 'v' } },
    },
  },
  {
    page: '经营看板', title: '当月收入 vs 应收余额',
    exists: row => targetsKpi(row) && dimensionIs(row, 'kpi_code') && chartAliases(row).has('money'),
    settings: {
      query: {
        mode: 'builder', resource: { dataSourceKey: 'main', collectionName: 'kpi_snapshots' },
        measures: [{ field: 'value', aggregation: 'avg', alias: 'money' }],
        dimensions: [{ field: 'kpi_code' }],
        filter: { kpi_code: { $in: ['revenue_monthly', 'ar_balance'] } },
      },
      visual: { mode: 'basic', type: 'bar', mappings: { x: 'kpi_code', y: 'money' } },
    },
  },
  {
    page: '供应链看板', title: 'OTIF 趋势',
    exists: row => targetsKpi(row) && chartFilterValue(row, 'kpi_code') === 'otif' && dimensionIs(row, 'calc_date'),
    settings: {
      query: {
        mode: 'builder', resource: { dataSourceKey: 'main', collectionName: 'kpi_snapshots' },
        measures: [{ field: 'value', aggregation: 'avg', alias: 'v' }],
        dimensions: [{ field: 'calc_date' }],
        filter: { kpi_code: { $eq: 'otif' } },
      },
      visual: { mode: 'basic', type: 'line', mappings: { x: 'calc_date', y: 'v' } },
    },
  },
  {
    page: '供应链看板', title: '供应商准时到货率对比',
    exists: row => targetsKpi(row) && chartFilterValue(row, 'kpi_code') === 'otd_supplier' && dimensionIs(row, 'dim'),
    settings: {
      query: {
        mode: 'builder', resource: { dataSourceKey: 'main', collectionName: 'kpi_snapshots' },
        measures: [{ field: 'value', aggregation: 'avg', alias: 'v' }],
        dimensions: [{ field: 'dim' }],
        filter: { kpi_code: { $eq: 'otd_supplier' } },
      },
      visual: { mode: 'basic', type: 'bar', mappings: { x: 'dim', y: 'v' } },
    },
  },
  {
    page: '供应链看板', title: '供应商绩效雷达（五维）',
    exists: row => collectionOfQuery(row, 'main.srm_score_cards') && dimensionIs(row, 'period')
      && ['q', 'd', 'p', 's', 'c'].every(alias => chartAliases(row).has(alias)),
    settings: {
      query: {
        mode: 'builder', resource: { dataSourceKey: 'main', collectionName: 'srm_score_cards' },
        measures: [
          { field: 'score_quality', aggregation: 'avg', alias: 'q' },
          { field: 'score_delivery', aggregation: 'avg', alias: 'd' },
          { field: 'score_price', aggregation: 'avg', alias: 'p' },
          { field: 'score_service', aggregation: 'avg', alias: 's' },
          { field: 'score_compliance', aggregation: 'avg', alias: 'c' },
        ],
        dimensions: [{ field: 'period' }],
      },
      visual: { mode: 'custom', raw: RADAR_RAW },
    },
  },
  {
    page: '生产看板', title: '一次合格率趋势',
    exists: row => targetsKpi(row) && chartFilterValue(row, 'kpi_code') === 'fpy' && dimensionIs(row, 'calc_date'),
    settings: {
      query: {
        mode: 'builder', resource: { dataSourceKey: 'main', collectionName: 'kpi_snapshots' },
        measures: [{ field: 'value', aggregation: 'avg', alias: 'v' }],
        dimensions: [{ field: 'calc_date' }],
        filter: { kpi_code: { $eq: 'fpy' } },
      },
      visual: { mode: 'basic', type: 'line', mappings: { x: 'calc_date', y: 'v' } },
    },
  },
  {
    page: '生产看板', title: '合格率 × 计划达成对比',
    exists: row => targetsKpi(row) && dimensionIs(row, 'kpi_code') && chartAliases(row).has('pct'),
    settings: {
      query: {
        mode: 'builder', resource: { dataSourceKey: 'main', collectionName: 'kpi_snapshots' },
        measures: [{ field: 'value', aggregation: 'avg', alias: 'pct' }],
        dimensions: [{ field: 'kpi_code' }],
        filter: { kpi_code: { $in: ['fpy', 'rty', 'schedule_hit', 'lot_pass_rate'] } },
      },
      visual: { mode: 'basic', type: 'bar', mappings: { x: 'kpi_code', y: 'pct' } },
    },
  },
  {
    page: '库存看板', title: '库存资金占用趋势',
    exists: row => targetsKpi(row) && chartFilterValue(row, 'kpi_code') === 'capital_occupied' && dimensionIs(row, 'calc_date'),
    settings: {
      query: {
        mode: 'builder', resource: { dataSourceKey: 'main', collectionName: 'kpi_snapshots' },
        measures: [{ field: 'value', aggregation: 'avg', alias: 'v' }],
        dimensions: [{ field: 'calc_date' }],
        filter: { kpi_code: { $eq: 'capital_occupied' } },
      },
      visual: { mode: 'basic', type: 'line', mappings: { x: 'calc_date', y: 'v' } },
    },
  },
  {
    page: '库存看板', title: '呆滞占比 × 账实相符率',
    exists: row => targetsKpi(row) && dimensionIs(row, 'kpi_code') && chartAliases(row).has('pct2'),
    settings: {
      query: {
        mode: 'builder', resource: { dataSourceKey: 'main', collectionName: 'kpi_snapshots' },
        measures: [{ field: 'value', aggregation: 'avg', alias: 'pct2' }],
        dimensions: [{ field: 'kpi_code' }],
        filter: { kpi_code: { $in: ['dead_stock_ratio', 'count_accuracy'] } },
      },
      visual: { mode: 'basic', type: 'bar', mappings: { x: 'kpi_code', y: 'pct2' } },
    },
  },
  {
    // W2-B4: the turnover pair — monthly grain (dim='period', month-end
    // calc dates only), so the comparison bar beats a one-point line.
    page: '库存看板', title: '库存周转率 × 周转天数',
    exists: row => targetsKpi(row) && dimensionIs(row, 'kpi_code') && chartAliases(row).has('turn'),
    settings: {
      query: {
        mode: 'builder', resource: { dataSourceKey: 'main', collectionName: 'kpi_snapshots' },
        measures: [{ field: 'value', aggregation: 'avg', alias: 'turn' }],
        dimensions: [{ field: 'kpi_code' }],
        filter: { kpi_code: { $in: ['inv_turnover_rate', 'inv_turnover_days'] } },
      },
      visual: { mode: 'basic', type: 'bar', mappings: { x: 'kpi_code', y: 'turn' } },
    },
  },
  {
    // W2-B7: the AR/AP reconciliation page's trend pair — the same
    // per-code line shape as the other trend charts.
    page: '应收应付对账', title: '应收余额趋势',
    exists: row => targetsKpi(row) && chartFilterValue(row, 'kpi_code') === 'ar_balance' && dimensionIs(row, 'calc_date'),
    settings: {
      query: {
        mode: 'builder', resource: { dataSourceKey: 'main', collectionName: 'kpi_snapshots' },
        measures: [{ field: 'value', aggregation: 'avg', alias: 'v' }],
        dimensions: [{ field: 'calc_date' }],
        filter: { kpi_code: { $eq: 'ar_balance' } },
      },
      visual: { mode: 'basic', type: 'line', mappings: { x: 'calc_date', y: 'v' } },
    },
  },
  {
    page: '应收应付对账', title: '应付余额趋势',
    exists: row => targetsKpi(row) && chartFilterValue(row, 'kpi_code') === 'ap_balance' && dimensionIs(row, 'calc_date'),
    settings: {
      query: {
        mode: 'builder', resource: { dataSourceKey: 'main', collectionName: 'kpi_snapshots' },
        measures: [{ field: 'value', aggregation: 'avg', alias: 'v' }],
        dimensions: [{ field: 'calc_date' }],
        filter: { kpi_code: { $eq: 'ap_balance' } },
      },
      visual: { mode: 'basic', type: 'line', mappings: { x: 'calc_date', y: 'v' } },
    },
  },
]

async function ensureCharts(token: string): Promise<void> {
  const gridUids = new Map<string, string>()
  for (const chart of CHARTS) {
    if (!gridUids.has(chart.page)) gridUids.set(chart.page, await pageGridUid(token, chart.page))
  }
  for (const chart of CHARTS) {
    const gridUid = gridUids.get(chart.page) as string
    const rows = await listModels(token)
    const matches = rows.filter(row => row.use === 'ChartBlockModel' && row.parentId === gridUid && chart.exists(row))
    // Self-heal past double-creations (the pre-canonicalization filter
    // matcher once missed persisted rows): keep the first, destroy the rest.
    for (const extra of matches.slice(1)) {
      await call(token, 'POST', `/api/flowModels:destroy?filterByTk=${encodeURIComponent(String(extra.uid))}`)
      console.log(`nocobase-w9: duplicate chart ${extra.uid} destroyed (self-heal)`)
    }
    const existing = matches[0]
    if (existing !== undefined) {
      console.log(`nocobase-w9: chart "${chart.title}" exists on ${chart.page} (kept)`)
      continue
    }
    const block = await dataOf(token, 'POST', '/api/flowSurfaces:addBlock', {
      target: { uid: gridUid },
      type: 'chart',
      settings: chart.settings,
    })
    const blockUid = block?.uid ?? block?.tree?.uid
    if (typeof blockUid !== 'string') throw new Error(`addBlock returned no uid for "${chart.title}": ${JSON.stringify(block).slice(0, 200)}`)
    console.log(`nocobase-w9: chart "${chart.title}" created on ${chart.page} (uid ${blockUid})`)
  }
}

// ─── verify (run by setup-nocobase's gate too) ───

/**
 * The batch's own acceptance probe: the four pages + the group, the
 * collection, the shipped_at column, the chart floors per page, and the
 * snapshot continuity (≥1 dated pass × 22 codes; the 90-day floor lives in
 * setup-nocobase verify so a bare w9 run does not demand the backfill).
 */
async function verify(token: string): Promise<void> {
  const failures: string[] = []
  for (const collection of COLLECTIONS) {
    const row = await dataOf(token, 'GET', `/api/collections/${collection.name}`)
    if (row === null) failures.push(`collection ${collection.name} missing`)
  }
  const shippedAt = await dataOf(token, 'GET', `/api/fields:list?filter=${encodeURIComponent(JSON.stringify({ collectionName: { $eq: 'so_orders' }, name: { $eq: 'shipped_at' } }))}&pageSize=1`) as Array<unknown> | null
  if ((shippedAt ?? []).length === 0) failures.push('so_orders.shipped_at missing (run nocobase-w9-dashboards.mts)')
  const routes = await listAllRoutes(token)
  const flowPageTitles = new Set(routes.filter(row => row.type === 'flowPage').map(row => row.title ?? ''))
  const missingPages = PAGES.map(page => page.title).filter(title => !flowPageTitles.has(title))
  if (missingPages.length > 0) failures.push(`B9 经营分析 pages missing: ${missingPages.join(', ')}`)
  if (!routes.some(row => row.title === MENU_GROUP.title && row.type === 'group')) failures.push(`menu group ${MENU_GROUP.title} missing`)
  for (const page of PAGES) {
    const gridUid = await pageGridUid(token, page.title).catch(() => undefined)
    if (gridUid === undefined) {
      failures.push(`page "${page.title}" grid not found`)
      continue
    }
    const charts = (await listModels(token)).filter(row => row.use === 'ChartBlockModel' && row.parentId === gridUid)
    // W2-B4 raised the inventory floor to 3 (the turnover pair's block);
    // supply stays 3 (two KPI charts + the radar), business/production 2;
    // W2-B7's finance page carries its own trend pair (floor 2).
    const floor = page.board === 'supply' || page.board === 'inventory' ? 3 : 2
    if (charts.length < floor) failures.push(`page "${page.title}" chart floor ${String(floor)} not met (${String(charts.length)} ChartBlockModel rows; run nocobase-w9-dashboards.mts)`)
  }
  const snapshots = await rowsOf(token, 'kpi_snapshots', 4000)
  const codes = new Set(snapshots.map(row => String(row.kpi_code ?? '')))
  if (codes.size < 24) failures.push(`kpi_snapshots covers only ${String(codes.size)} codes (< 24; run kpi-run.mts --calc-kpi)`)
  const dated = new Set(snapshots.map(row => String(row.calc_date ?? '')))
  if (dated.size < 1) failures.push('kpi_snapshots has no dated pass (run kpi-run.mts --calc-kpi)')
  // The live wire this batch owns: every page's kpi table block carries its
  // board's dataScope filter group plus the calc_date desc defaultSorting
  // (a block still parking its filter in resourceSettings.init is the
  // pre-R1 dead wire — re-run with --rollback to rebuild).
  {
    const models = await listModels(token)
    const gridOwners = gridOwnerRoutes(models, routes)
    const flowByTitle = new Map(routes.filter(row => row.type === 'flowPage').map(row => [row.title ?? '', row]))
    for (const page of PAGES) {
      const flow = flowByTitle.get(page.title)
      if (flow === undefined) continue
      const expected = tableSettingsOf(page.blocks[0]).tableSettings
      const owned = batchScopedRows(models, { use: 'TableBlockModel', collection: 'kpi_snapshots', uidPrefix: 'w9kpi' })
        .find(row => blockOwnedByPage(row, gridOwners, String(flow.schemaUid ?? '')))
      if (owned === undefined) continue
      const actual = (owned.stepParams?.tableSettings ?? {}) as Record<string, unknown>
      if (JSON.stringify(actual.dataScope) !== JSON.stringify(expected.dataScope)) {
        failures.push(`page "${page.title}" kpi block lost its dataScope filter wire (${JSON.stringify(actual.dataScope)}; run --rollback to rebuild)`)
      }
      if (JSON.stringify(actual.defaultSorting) !== JSON.stringify(expected.defaultSorting)) {
        failures.push(`page "${page.title}" kpi block lost its defaultSorting wire (${JSON.stringify(actual.defaultSorting)}; run --rollback to rebuild)`)
      }
    }
  }
  const guards = (await dataOf(token, 'GET', `/api/rolesResources:list?pageSize=100&filter=${encodeURIComponent(JSON.stringify({ roleName: { $eq: 'admin' }, name: { $eq: 'kpi_snapshots' } }))}`)) as Array<Record<string, any>> | null
  if (guards === null || guards.length === 0 || guards[0].usingActionsConfig !== true) failures.push('kpi_snapshots read-only guard missing (run nocobase-w9-dashboards.mts)')
  if (failures.length > 0) {
    console.error(`nocobase-w9: verify FAILED\n  - ${failures.join('\n  - ')}`)
    process.exitCode = 1
    return
  }
  console.log(`nocobase-w9: verify OK — 4 dashboards + 应收应付对账 + charts + collection + shipped_at + ${String(snapshots.length)} snapshot rows over ${String(dated.size)} date(s)`)
}

// ─── rollback ───

async function rollback(token: string): Promise<void> {
  let destroyedModels = 0
  // withN17Prefix mints `${prefix}${tag}${key}` with no 'n17-' separator:
  // every spine uid starts with 'w9kpi' (the w7mrp convention).
  for (const row of (await listModels(token))) {
    if (String(row.uid ?? '').startsWith('w9kpi')) {
      await call(token, 'POST', `/api/flowModels:destroy?filterByTk=${encodeURIComponent(String(row.uid))}`)
      destroyedModels += 1
    }
  }
  // The F4 addBlock channel mints fresh uids (not n17- prefixed): every
  // chart block under a w9 page grid goes with the page, plus any leftover
  // the page-grid lookup can still resolve.
  for (const page of PAGES) {
    const gridUid = await pageGridUid(token, page.title).catch(() => undefined)
    if (gridUid === undefined) continue
    for (const chart of (await listModels(token)).filter(row => row.use === 'ChartBlockModel' && row.parentId === gridUid)) {
      await call(token, 'POST', `/api/flowModels:destroy?filterByTk=${encodeURIComponent(String(chart.uid))}`)
      destroyedModels += 1
    }
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
  for (const collection of COLLECTIONS) {
    // The read-only guard row goes with the collection (a fresh rebuild re-adds it).
    for (const row of (await dataOf(token, 'GET', `/api/rolesResources:list?pageSize=100&filter=${encodeURIComponent(JSON.stringify({ roleName: { $eq: 'admin' }, name: { $eq: collection.name } }))}`)) as Array<Record<string, any>> | null ?? []) {
      await call(token, 'POST', `/api/rolesResources:destroy?filterByTk=${row.id}`)
    }
    await call(token, 'DELETE', `/api/collections:destroy?filterByTk=${collection.name}&cascade=true`)
  }
  // so_orders.shipped_at and its data stay (a B7-domain additive column).
  console.log(`nocobase-w9: rollback done — pages/group/charts (${String(destroyedModels)} models)/kpi_snapshots removed; so_orders.shipped_at kept`)
}

// ─── CLI ───

async function main(): Promise<void> {
  const token = await signInWithRetry()
  const args = process.argv.slice(2)
  if (args.includes('--rollback')) {
    await rollback(token)
    console.log('nocobase-w9: done (rollback)')
    return
  }
  await ensureCollections(token)
  await ensureReadOnlyGuard(token)
  const group = await ensureMenuGroup(token)
  let sort = 1
  for (const spec of PAGES) {
    await ensureV2Page(token, spec, group.id, sort)
    sort += 1
  }
  await ensureCharts(token)
  if (args.includes('--verify')) await verify(token)
  else console.log('nocobase-w9: done (collections + shipped_at + 4 dashboards + 应收应付对账 + charts; run kpi-run.mts --calc-kpi to materialize, then setup-nocobase.mts verify)')
}

await main()
