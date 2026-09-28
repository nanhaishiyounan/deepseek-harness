/**
 * W1: the general approval engine's NocoBase side
 * (plans/2026-09-25-mfg-closure/02-b1-approval-engine.md). One script, five
 * effects:
 *
 * 1. The five wfl_* collections (ERPNext Workflow范式 NocoBase 化) plus the
 *    gate config table: flow_configs / flow_states / flow_transitions /
 *    approval_records (append-only audit) / approval_todos / gate_configs —
 *    every field inline interface+uiSchema (the N14 blank-cell trap).
 * 2. The pilot document axis: hub_po_purchase_orders gains doc_status /
 *    approved_by / approved_at (the legacy business status column stays
 *    untouched — D2 dual-axis separation), and existing rows backfill
 *    doc_status=draft.
 * 3. The pilot flow seed via approval-engine.mts's seedFlow (the shared
 *    single source: states with anchors, the eight transitions with the
 *    amount-threshold pair, the approver map, and the wms_receipts→
 *    hub_po_purchase_orders gate on source_no→po_number). Seeds land BEFORE
 *    the workflow exists (the h4坑④ order).
 * 4. The callback workflow: wfl_approval_records:create → condition
 *    (source=='page') → request POST http://127.0.0.1:13110/act with the
 *    intent row's fields + intent_record_id (the engine consumes the row on
 *    success, so the records table only shows engine audit rows). Created
 *    then toggled twice (the h4坑③ db-hook trap).
 * 5. The 审批中心 v2 flowPage under the new「协同办公」group: the open-todo
 *    table (wfl_approval_todos, status filter pinned in the block props) with
 *    its intent-entry Add-new form (doc_type/doc_id/action/comment/approver),
 *    plus the audit-records table (wfl_approval_records).
 *
 * Rollback: --rollback destroys the w1w1* flowModels tree (+ orphaned n18ai-
 * sweep), the workflow, the page + menu group, the pilot columns' backfill is
 * left in place (business data), and the six wfl_* collections drop.
 *
 * Usage (repo root, tsx loader):
 *   node --import tsx/esm examples/kb-agent/scripts/nocobase-w1-approval.mts
 *   node --import tsx/esm examples/kb-agent/scripts/nocobase-w1-approval.mts --rollback
 */
import {
  APPROVAL_JUMP_ROUTES,
  call,
  dataOf,
  ensureTableRowDetail,
  listFlowModels,
  listRoutes,
  saveRowJumpAction,
  signInWithRetry,
  withN17Prefix,
} from './nocobase-flow-page-lib.mts'
import { seedFlow } from './approval-engine.mts'

type RouteRow = import('./nocobase-flow-page-lib.mts').RouteRow
type FlowModelRow = import('./nocobase-flow-page-lib.mts').FlowModelRow

// ─── field factories (the crm/hub wire shapes; every field inline interface+uiSchema, N14) ───

const input = (name: string, title: string): object => ({ name, type: 'string', interface: 'input', uiSchema: { type: 'string', 'x-component': 'Input', title } })
const textarea = (name: string, title: string): object => ({ name, type: 'text', interface: 'textarea', uiSchema: { type: 'string', 'x-component': 'Input.TextArea', title } })
const select = (name: string, title: string, enumOptions: object[]): object => ({ name, type: 'string', interface: 'select', uiSchema: { type: 'string', 'x-component': 'Select', title, enum: enumOptions } })
const integer = (name: string, title: string): object => ({ name, type: 'integer', interface: 'number', uiSchema: { type: 'number', 'x-component': 'InputNumber', title } })
const boolean = (name: string, title: string): object => ({ name, type: 'boolean', interface: 'boolean', uiSchema: { type: 'boolean', 'x-component': 'Checkbox', title } })
const date = (name: string, title: string): object => ({ name, type: 'dateOnly', interface: 'date', uiSchema: { type: 'string', 'x-component': 'DatePicker', title, 'x-component-props': { dateFormat: 'YYYY-MM-DD' } } })
const opts = (pairs: ReadonlyArray<[string, string, string]>): object[] => pairs.map(([value, label, color]) => ({ value, label, color }))

const STATE_OPTS = opts([
  ['draft', '草稿', 'default'], ['pending', '待审批', 'orange'], ['pending_level2', '二级审批中', 'purple'],
  ['approved', '已生效', 'green'], ['rejected', '已驳回', 'red'], ['void', '已作废', 'default'],
])
const ACTION_OPTS = opts([
  ['submit', '提交审批', 'blue'], ['resubmit', '重新提交', 'cyan'], ['approve', '同意', 'green'],
  ['reject', '驳回', 'red'], ['void', '作废', 'default'], ['comment', '意见', 'default'],
])
const TODO_STATUS = opts([['open', '待办', 'orange'], ['completed', '已完成', 'green']])
const RECORD_SOURCE = opts([['engine', '引擎', 'blue'], ['page', '页面', 'purple']])
const ANCHOR_OPTS = opts([['0', '0 草稿侧', 'default'], ['1', '1 生效', 'green'], ['2', '2 作废', 'default']])

const WORKFLOW_TITLE = '审批中心·页面操作回调'
const ENGINE_CALLBACK = process.env.W1_ENGINE_CALLBACK ?? 'http://127.0.0.1:13110/act'

// ─── the six collections ───

const COLLECTIONS: ReadonlyArray<{ name: string, title: string, fields: object[] }> = [
  {
    name: 'wfl_flow_configs', title: '审批流配置', fields: [
      input('doc_type', '单据集合'), input('title', '流程名'), input('state_field', '状态字段'),
      boolean('is_active', '激活'), textarea('approver_map', '审批人映射'),
      // W2-B5: the JSON keys the engine reads (the in-page editing hint).
      {
        name: 'extras', type: 'text', interface: 'textarea',
        uiSchema: {
          type: 'string', 'x-component': 'Input.TextArea', title: '扩展配置',
          description: 'JSON 键：approved_by_field/approved_at_field（生效回写列）、amount_field（阈值路由读的金额列）、amount_threshold（两级审批金额阈值，正数，缺省 100000）、invoice_match_tolerance（发票三方匹配容差，非负数，缺省 0.05）；approver_map 的值可为用户名或用户名数组（数组内任一人可审）',
        },
      },
      textarea('config_note', '配置变更留痕'),
    ],
  },
  {
    name: 'wfl_flow_states', title: '审批流状态', fields: [
      integer('flow_id', '流程ID'), select('state', '状态', STATE_OPTS),
      select('doc_status_anchor', '生效锚点', ANCHOR_OPTS), input('allow_edit_role', '可编辑角色'),
      input('update_field', '回写字段'), input('update_value', '回写值'),
    ],
  },
  {
    name: 'wfl_flow_transitions', title: '审批流转移', fields: [
      integer('flow_id', '流程ID'), select('state', '当前状态', STATE_OPTS), select('action', '动作', ACTION_OPTS),
      select('next_state', '目标状态', STATE_OPTS), input('allowed_role', '审批角色'),
      input('condition_expr', '条件表达式'), boolean('allow_self_approval', '允许自审自批'),
    ],
  },
  {
    name: 'wfl_approval_records', title: '审批记录', fields: [
      input('doc_type', '单据集合'), integer('doc_id', '单据ID'), integer('node_seq', '节点序号'),
      input('approver', '操作人'), select('action', '动作', ACTION_OPTS), textarea('comment', '意见'),
      integer('attempt_no', '轮次'), select('from_state', '原状态', STATE_OPTS), select('to_state', '新状态', STATE_OPTS),
      select('from_anchor', '原锚点', ANCHOR_OPTS), select('to_anchor', '新锚点', ANCHOR_OPTS),
      select('source', '入口', RECORD_SOURCE), date('acted_at', '操作日期'),
    ],
  },
  {
    name: 'wfl_approval_todos', title: '审批待办', fields: [
      input('doc_type', '单据集合'), integer('doc_id', '单据ID'), input('user', '待办人'),
      select('state', '所在状态', STATE_OPTS), select('status', '状态', TODO_STATUS), date('due_date', '到期日'),
    ],
  },
  {
    name: 'wfl_gate_configs', title: '卡口配置', fields: [
      input('downstream_collection', '下游集合'), input('upstream_collection', '上游集合'),
      input('upstream_field', '上游引用字段'), input('upstream_ref_field', '上游匹配字段'),
      input('upstream_label', '上游名称'), input('upstream_state_field', '上游状态字段'),
      input('required_status', '要求状态'),
    ],
  },
]

/** The pilot columns hub_po_purchase_orders gains (the legacy status column stays — D2 dual-axis). */
const PILOT_FIELDS: ReadonlyArray<{ collection: string, field: object }> = [
  { collection: 'hub_po_purchase_orders', field: select('doc_status', '审批状态', STATE_OPTS) },
  { collection: 'hub_po_purchase_orders', field: input('approved_by', '审批人') },
  { collection: 'hub_po_purchase_orders', field: date('approved_at', '生效日') },
]

// ─── steps ───

async function rowsOf(token: string, collection: string, pageSize = 500): Promise<Array<Record<string, any>>> {
  const rows = await dataOf(token, 'GET', `/api/${collection}:list?pageSize=${pageSize}`) as Array<Record<string, any>> | null
  return rows ?? []
}

/** One REST-backed IO over the flow-page lib — the adapter approval-engine's seedFlow runs on. */
const tokenIO = (token: string) => ({
  list: async (collection: string, filter?: Record<string, unknown>) => {
    const query = filter === undefined ? '' : `&filter=${encodeURIComponent(JSON.stringify(filter))}`
    const rows = await dataOf(token, 'GET', `/api/${collection}:list?pageSize=500${query}`)
    return rows ?? []
  },
  get: async (collection: string, id: number) => await dataOf(token, 'GET', `/api/${collection}:get?filterByTk=${id}`) ?? undefined,
  create: async (collection: string, values: Record<string, unknown>) => await dataOf(token, 'POST', `/api/${collection}:create`, values),
  update: async (collection: string, id: number, values: Record<string, unknown>) => {
    await dataOf(token, 'POST', `/api/${collection}:update?filterByTk=${id}`, values)
  },
  destroy: async (collection: string, id: number) => {
    await call(token, 'POST', `/api/${collection}:destroy?filterByTk=${id}`)
  },
})

async function ensureCollections(token: string): Promise<void> {
  for (const collection of COLLECTIONS) {
    const existing = await dataOf(token, 'GET', `/api/collections/${collection.name}`)
    if (existing !== null) {
      console.log(`nocobase-w1: collection ${collection.name} exists (kept)`)
      continue
    }
    await dataOf(token, 'POST', '/api/collections:create', { name: collection.name, title: collection.title, fields: collection.fields })
    console.log(`nocobase-w1: collection ${collection.name} created`)
  }
}

/** Add the pilot doc_status/approved_by/approved_at columns when missing, then backfill legacy rows to draft. */
async function ensurePilotColumns(token: string): Promise<void> {
  const fields = await dataOf(token, 'GET', `/api/fields:list?filter=${encodeURIComponent(JSON.stringify({ collectionName: { $eq: 'hub_po_purchase_orders' } }))}&pageSize=200`) as Array<{ name?: string }> | null
  const names = new Set((fields ?? []).map(field => field.name))
  for (const { collection, field } of PILOT_FIELDS) {
    const name = (field as { name: string }).name
    if (names.has(name)) {
      console.log(`nocobase-w1: ${collection}.${name} exists (kept)`)
      continue
    }
    await dataOf(token, 'POST', '/api/fields:create', { collectionName: collection, ...field })
    console.log(`nocobase-w1: ${collection}.${name} added`)
  }
  const pos = await rowsOf(token, 'hub_po_purchase_orders')
  let backfilled = 0
  for (const row of pos) {
    if (row.doc_status === null || row.doc_status === undefined || row.doc_status === '') {
      await dataOf(token, 'POST', `/api/hub_po_purchase_orders:update?filterByTk=${row.id}`, { doc_status: 'draft' })
      backfilled += 1
    }
  }
  console.log(`nocobase-w1: pilot rows backfilled to draft (${backfilled} of ${pos.length})`)
}

async function ensureWorkflow(token: string): Promise<void> {
  const found = await dataOf(token, 'GET', `/api/workflows:list?filter=${encodeURIComponent(JSON.stringify({ title: { $eq: WORKFLOW_TITLE } }))}&pageSize=5`) as Array<{ id: number }> | null
  if ((found ?? []).length > 0) {
    console.log(`nocobase-w1: workflow "${WORKFLOW_TITLE}" exists (kept)`)
    return
  }
  const workflow = await dataOf(token, 'POST', '/api/workflows:create', {
    title: WORKFLOW_TITLE, enabled: true, type: 'collection',
    config: { collection: 'wfl_approval_records', mode: 1 },
  }) as { id: number }
  // The create-then-toggle pair mounts the db hook (坑③).
  await call(token, 'POST', `/api/workflows:toggle?filterByTk=${workflow.id}`)
  await call(token, 'POST', `/api/workflows:toggle?filterByTk=${workflow.id}`)
  const condition = await dataOf(token, 'POST', '/api/flow_nodes:create', {
    workflow: workflow.id, title: '仅页面入口', type: 'condition',
    config: {
      engine: 'basic', rejectOnFalse: true,
      calculation: { calculator: 'equal', operands: ['{{$context.data.source}}', 'page'] },
    },
  }) as { id: number, key: string }
  await dataOf(token, 'POST', '/api/flow_nodes:create', {
    workflow: workflow.id, title: '回调审批引擎', type: 'request',
    upstreamId: condition.id, branchIndex: 1,
    config: {
      url: ENGINE_CALLBACK, method: 'POST', contentType: 'application/json',
      data: {
        doc_type: '{{$context.data.doc_type}}', doc_id: '{{$context.data.doc_id}}',
        action: '{{$context.data.action}}', approver: '{{$context.data.approver}}',
        comment: '{{$context.data.comment}}', intent_record_id: '{{$context.data.id}}',
      },
      timeout: 30000,
    },
  })
  console.log(`nocobase-w1: workflow "${WORKFLOW_TITLE}" created (records:create → condition source=page → request ${ENGINE_CALLBACK})`)
}

// ─── the 审批中心 v2 page (E1 spine; two table blocks + intent Add-new form) ───

type FieldKind = 'input' | 'select' | 'number' | 'm2o' | 'date' | 'boolean'
type FieldSpec = { name: string, title: string, kind: FieldKind, options?: object[], required?: boolean }

const listModels = (token: string): Promise<FlowModelRow[]> => listFlowModels(token, 'W1')
const listAllRoutes = (token: string): Promise<RouteRow[]> => listRoutes(token, 'W1')

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

const TODO_COLUMNS: ReadonlyArray<FieldSpec> = [
  { name: 'doc_type', title: '单据类型', kind: 'input' },
  { name: 'doc_id', title: '单据ID', kind: 'number' },
  { name: 'user', title: '待办人', kind: 'input' },
  { name: 'state', title: '所在状态', kind: 'select', options: STATE_OPTS },
  { name: 'due_date', title: '到期日', kind: 'date' },
  { name: 'status', title: '状态', kind: 'select', options: TODO_STATUS },
]
const RECORD_COLUMNS: ReadonlyArray<FieldSpec> = [
  { name: 'doc_type', title: '单据类型', kind: 'input' },
  { name: 'doc_id', title: '单据ID', kind: 'number' },
  { name: 'node_seq', title: '序号', kind: 'number' },
  { name: 'approver', title: '操作人', kind: 'input' },
  { name: 'action', title: '动作', kind: 'select', options: ACTION_OPTS },
  { name: 'comment', title: '意见', kind: 'input' },
  { name: 'attempt_no', title: '轮次', kind: 'number' },
  { name: 'to_state', title: '新状态', kind: 'select', options: STATE_OPTS },
  { name: 'source', title: '入口', kind: 'select', options: RECORD_SOURCE },
  { name: 'acted_at', title: '操作日期', kind: 'date' },
  { name: 'createdAt', title: '时间', kind: 'date' },
]
/** The intent form a page reviewer fills to approve/reject from the NocoBase side (workflow consumes the row). The source field is the workflow's discriminator — the engine's own audit rows carry source=engine and must never re-trigger the callback loop. */
const INTENT_FORM_FIELDS: ReadonlyArray<FieldSpec> = [
  { name: 'doc_type', title: '单据集合', kind: 'input', required: true },
  { name: 'doc_id', title: '单据ID', kind: 'number', required: true },
  { name: 'action', title: '动作', kind: 'select', options: opts([['approve', '同意', 'green'], ['reject', '驳回', 'red']]), required: true },
  { name: 'approver', title: '审批人', kind: 'input' },
  { name: 'comment', title: '意见', kind: 'input' },
  { name: 'source', title: '入口', kind: 'select', options: opts([['page', '页面操作', 'purple']]), required: true },
]

const MENU_GROUP = { title: '协同办公', icon: 'TeamOutlined' }
const PAGE_TITLE = '审批中心'

function formGrid(collection: string, fields: ReadonlyArray<FieldSpec>): Record<string, unknown> {
  const itemUids = fields.map(() => withN17Prefix('w1w1', 'i'))
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
    console.log(`nocobase-w1: menu group "${MENU_GROUP.title}" exists (kept)`)
    return { id: existing.id }
  }
  const row = await dataOf(token, 'POST', '/api/desktopRoutes:create', { title: MENU_GROUP.title, icon: MENU_GROUP.icon, type: 'group' })
  console.log(`nocobase-w1: menu group "${MENU_GROUP.title}" created`)
  return { id: Number(row.id) }
}

/** Whether the approval-center page already carries both table blocks under the w1w1 prefix. */
async function pageComplete(token: string): Promise<boolean> {
  const rows = await listModels(token)
  const tables = new Set(rows.filter(row => row.use === 'TableBlockModel' && String(row.uid ?? '').startsWith('w1w1'))
    .map(row => String(row.stepParams?.resourceSettings?.init?.collectionName ?? '')))
  return tables.has('wfl_approval_todos') && tables.has('wfl_approval_records')
}

async function ensureApprovalCenter(token: string, groupId: number): Promise<void> {
  const flow = (await listAllRoutes(token)).find(row => row.title === PAGE_TITLE && row.type === 'flowPage')
  if (flow !== undefined) {
    if (!(await pageComplete(token))) {
      throw new Error(`v2 page "${PAGE_TITLE}" is truncated; run --rollback to tear the batch down and rebuild`)
    }
    console.log(`nocobase-w1: v2 page "${PAGE_TITLE}" exists (kept)`)
    return
  }
  if ((await listAllRoutes(token)).some(row => row.title === PAGE_TITLE && row.type === 'page')) {
    throw new Error(`a v1 page named "${PAGE_TITLE}" already exists; rename it first`)
  }
  const routeUid = withN17Prefix('w1w1', '')
  const page = await dataOf(token, 'POST', '/api/desktopRoutes:create', { title: PAGE_TITLE, icon: 'AuditOutlined', type: 'flowPage', parentId: groupId, sort: 1, schemaUid: routeUid })
  const tabUid = withN17Prefix('w1w1', 't')
  await dataOf(token, 'POST', '/api/desktopRoutes:create', { title: '', type: 'tabs', parentId: page.id, schemaUid: tabUid, tabSchemaName: withN17Prefix('w1w1', 'ts') })

  const save = (model: Record<string, unknown>) => dataOf(token, 'POST', '/api/flowModels:save', model)
  await save({ uid: routeUid, schema: { use: 'RouteModel' } })
  await save({ uid: tabUid, schema: { use: 'RouteModel' } })
  const pageUid = withN17Prefix('w1w1', 'p')
  await save({ uid: pageUid, parentId: routeUid, subKey: 'page', subType: 'object', use: 'RootPageModel', props: { title: PAGE_TITLE, displayTitle: true, enableTabs: false }, stepParams: { pageSettings: { general: { title: PAGE_TITLE, displayTitle: true, enableTabs: false } } } })
  const gridUid = withN17Prefix('w1w1', 'g')
  await save({ uid: gridUid, parentId: tabUid, subKey: 'grid', subType: 'object', use: 'BlockGridModel', props: {}, filterManager: [] })

  const blocks: ReadonlyArray<{ heading: string, collection: string, columns: ReadonlyArray<FieldSpec>, formFields?: ReadonlyArray<FieldSpec>, defaultFilter?: Record<string, unknown> }> = [
    { heading: '我的待办（status=open）', collection: 'wfl_approval_todos', columns: TODO_COLUMNS, formFields: INTENT_FORM_FIELDS, defaultFilter: { status: 'open' } },
    { heading: '审批记录（引擎审计）', collection: 'wfl_approval_records', columns: RECORD_COLUMNS },
  ]
  let blockIndex = 0
  for (const block of blocks) {
    blockIndex += 1
    const tableUid = withN17Prefix('w1w1', 'tb')
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
      const uid = withN17Prefix('w1w1', 'c')
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
        uid: withN17Prefix('w1w1', 'rf'), parentId: tableUid, subKey: 'actions', subType: 'array', sortIndex: 2, use: 'RefreshActionModel',
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
    // The intent block: Add-new writes a wfl_approval_records page row the workflow forwards to the engine.
    await save({
      uid: withN17Prefix('w1w1', 'an'), parentId: tableUid, subKey: 'actions', subType: 'array', sortIndex: 1, use: 'AddNewActionModel', props: {},
      stepParams: { popupSettings: { openView: { collectionName: 'wfl_approval_records', dataSourceKey: 'main' } } },
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
                      stepParams: { resourceSettings: { init: { dataSourceKey: 'main', collectionName: 'wfl_approval_records' } } },
                      subModels: { grid: formGrid('wfl_approval_records', block.formFields) },
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
      uid: withN17Prefix('w1w1', 'rf'), parentId: tableUid, subKey: 'actions', subType: 'array', sortIndex: 2, use: 'RefreshActionModel',
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
  console.log(`nocobase-w1: v2 page "${PAGE_TITLE}" created (/admin/${routeUid}) with ${blocks.length} table block(s) + intent Add-new`)
}

/** Pin the intent row's engine-owned columns so page reviewers only fill the five intent fields. */
async function ensureIntentDefaults(token: string): Promise<void> {
  const rows = await listModels(token)
  const fieldInit = (row: FlowModelRow): { collectionName?: string, fieldPath?: string } => row?.stepParams?.fieldSettings?.init ?? {}
  const formItems = rows.filter(row => row.use === 'FormItemModel'
    && String(row.uid ?? '').startsWith('w1w1') && fieldInit(row).collectionName === 'wfl_approval_records')
  let submit = 0
  const forms = rows.filter(row => row.use === 'CreateFormModel' && row.parentId == null
    && String(row.stepParams?.resourceSettings?.init?.collectionName ?? '') === 'wfl_approval_records')
  for (const form of forms) {
    const submitUid = `submit-${form.uid}`
    if (!rows.some(row => row.uid === submitUid)) {
      await call(token, 'POST', '/api/flowModels:save', {
        uid: submitUid, parentId: form.uid, subKey: 'actions', subType: 'array', sortIndex: 1, use: 'FormSubmitActionModel', props: {}, stepParams: {},
      })
      submit += 1
    }
  }
  console.log(`nocobase-w1: intent form fields ${formItems.length}, submit actions ${submit > 0 ? `${submit} added` : 'already in place (kept)'}`)
}

/**
 * W3-B2: the「前往单据」jump on the todo table's actions column (the todo
 * drawer already shows doc_type/doc_id via the B1 row detail; this is the
 * one-click side). Idempotent on the w3b2ja prefix — the heal pass and this
 * guard agree, so neither doubles the button.
 */
async function ensureTodoJumpLinks(token: string): Promise<void> {
  const rows = await listModels(token)
  const todoTables = rows.filter(row => row?.use === 'TableBlockModel'
    && String(row.uid ?? '').startsWith('w1w1')
    && row?.stepParams?.resourceSettings?.init?.collectionName === 'wfl_approval_todos')
  for (const table of todoTables) {
    // The block's resourceSettings.init.filter (status=open) never reached
    // the list request — the w9 tableSettings.dataScope wire is the one the
    // runtime replays (found live during W3-B2: the "我的待办（status=open）"
    // heading was showing completed rows too).
    const currentScope = (table?.stepParams?.tableSettings as { dataScope?: { filter?: { items?: unknown[] } } } | undefined)?.dataScope
    const scopePinned = currentScope?.filter?.items?.some((item: any) => item?.path === 'status' && item?.value === 'open') ?? false
    if (!scopePinned) {
      await dataOf(token, 'POST', '/api/flowModels:save', {
        uid: table.uid, use: 'TableBlockModel',
        stepParams: {
          ...table.stepParams,
          tableSettings: {
            ...(table?.stepParams?.tableSettings ?? {}),
            dataScope: { filter: { logic: '$and', items: [{ path: 'status', operator: '$eq', value: 'open' }] } },
          },
        },
      })
      console.log('nocobase-w1: todo table dataScope pinned to status=open (resourceSettings.init.filter never replayed)')
    }
    const column = rows.find(row => row?.use === 'TableActionsColumnModel' && String(row.parentId ?? '') === String(table.uid))
    if (column === undefined) continue
    const actions = rows.filter(row => row?.subKey === 'actions' && String(row.parentId ?? '') === String(column.uid))
    if (actions.some(row => String(row.uid ?? '').startsWith('w3b2ja'))) {
      console.log('nocobase-w1: todo 前往单据 jump exists (kept)')
      continue
    }
    await saveRowJumpAction(token, String(column.uid), { title: '前往单据', docTypeMap: { ...APPROVAL_JUMP_ROUTES }, docType: null, sortIndex: 5 })
    console.log('nocobase-w1: todo 前往单据 jump added')
  }
}

async function rollback(token: string): Promise<void> {
  let destroyedModels = 0
  for (const row of await listModels(token)) {
    if (String(row.uid ?? '').startsWith('w1w1')) {
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
    console.log(`nocobase-w1: ${destroyedModels} w1w1 flowModels destroyed, ${swept} orphaned n18ai- buttons swept`)
  }
  const flow = (await listAllRoutes(token)).find(row => row.title === PAGE_TITLE && row.type === 'flowPage')
  if (flow !== undefined) {
    for (const tab of (await listAllRoutes(token)).filter(row => row.parentId === flow.id && row.type === 'tabs')) {
      await call(token, 'DELETE', `/api/desktopRoutes:destroy?filterByTk=${tab.id}`)
    }
    await call(token, 'DELETE', `/api/desktopRoutes:destroy?filterByTk=${flow.id}`)
  }
  const group = (await listAllRoutes(token)).find(row => row.title === MENU_GROUP.title && row.type === 'group')
  if (group !== undefined) await call(token, 'DELETE', `/api/desktopRoutes:destroy?filterByTk=${group.id}`)
  const workflows = await dataOf(token, 'GET', `/api/workflows:list?filter=${encodeURIComponent(JSON.stringify({ title: { $eq: WORKFLOW_TITLE } }))}&pageSize=10`) as Array<{ id: number }> | null
  for (const workflow of workflows ?? []) {
    await call(token, 'POST', `/api/workflows:destroy?filterByTk=${workflow.id}`)
  }
  for (const collection of [...COLLECTIONS].reverse()) {
    const existing = await dataOf(token, 'GET', `/api/collections/${collection.name}`)
    if (existing !== null) {
      await call(token, 'POST', `/api/collections:destroy?filterByTk=${collection.name}&cascade=true&drop=true&skipChildren=true`)
    }
  }
  console.log('nocobase-w1: rollback done (wfl_* collections dropped; pilot doc_status column and its backfill stay as business data)')
}

async function main(): Promise<void> {
  const args = process.argv.slice(2)
  const token = await signInWithRetry()
  if (args.includes('--rollback')) {
    await rollback(token)
    console.log('nocobase-w1: done (rollback)')
    return
  }
  await ensureCollections(token)
  await ensurePilotColumns(token)
  // Seeds before the workflow (坑④): no approval_records rows exist yet, so
  // mounting the trigger first could only ever see live rows anyway, but the
  // order keeps the invariant explicit for every future re-run.
  await seedFlow(tokenIO(token))
  await ensureWorkflow(token)
  const group = await ensureMenuGroup(token)
  await ensureApprovalCenter(token, group.id)
  await ensureIntentDefaults(token)
  await ensureTodoJumpLinks(token)
  console.log('nocobase-w1: done')
}

await main()
