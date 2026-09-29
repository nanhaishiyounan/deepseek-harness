/**
 * F3: v2 flowPage upgrades for the remaining Hub/HR/master-data pages —
 * 知识文章 / 维保记录 / 部门 / 请假审批 / 供应商 / 采购供应商 (plain tables)
 * plus the two composite pages 工作台 (two TableBlocks: hub_pj_tasks +
 * hub_tk_tickets) and 分类维护 (four TableBlocks over hub_md_* — the v1 page
 * was already a single page with four stacked table blocks, so the v2 shape
 * is the same information architecture; the A-route "four tabs" read was
 * wrong). B0 added 采购供应商 as the hub_po_suppliers read view (the mobile
 * form-assistant's registration target) under the new 采购 menu group.
 *
 * Composite-page shape: one flowPage whose BlockGrid carries one
 * TableBlockModel per collection, each with its own AddNew → ChildPage →
 * CreateFormModel popup (n18 mounts one button per top-level form — 2 on
 * 工作台, 4 on 分类维护). The kept-page spine for composite pages matches
 * n17f3-prefixed TableBlockModels per collection (hub_pj_tasks blocks also
 * exist from E1/F1, so a bare collection match would pass a truncated
 * composite page).
 *
 * TitleFields: hub_hr_employees/hub_as_assets/hub_as_vendors/
 * hub_kb_categories/hub_tk_tickets/hub_hr_departments carry none, which
 * would blank the 维保记录 asset/vendor columns, the 请假审批 employee
 * column, and the 知识文章 category column — the script sets them first.
 *
 * Idempotent + rollback contract: E1/F1/F2 rules verbatim (records merged
 * by title into demos/acceptance-f/rollback-records.json including the v1
 * rows' tabs children, flushed before every destroy; --rollback tears down
 * n17f3* trees, sweeps orphaned n18ai- buttons, restores recorded rows;
 * truncated trees trigger a full-batch heal).
 *
 * W5-B0 (BP-20): re-runs must not short-circuit on the W4 end-state —
 * W4-B5 renamed 供应商 → 维保服务商 (both the route row and the page tree;
 * the spec title now carries the new name and legacyTitles still resolves
 * the v1/rollback era), and W4-B4 retired 工作台 + 采购供应商 (flowPage rows
 * destroyed). A spec with neither a flowPage nor a v1 row under any of its
 * titles is skipped when W4-B4 retired it, and still fails loud otherwise.
 *
 * Usage:
 *   node --import tsx/esm examples/kb-agent/scripts/nocobase-f3-hub-v2.mts [--only 供应商]
 *   node --import tsx/esm examples/kb-agent/scripts/nocobase-f3-hub-v2.mts --rollback
 */
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  batchScopedRows, call, dataOf, ensureTableRowDetail, listFlowModels, listRoutes, loadRollbackRecords,
  signInWithRetry, withN17Prefix, writeRollbackRecord,
} from './nocobase-flow-page-lib.mts'

const here = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(here, '../../..')
const rollbackPath = join(repoRoot, 'examples/kb-agent/demos/acceptance-f/rollback-records.json')

type FieldKind = 'input' | 'select' | 'number' | 'm2o' | 'date' | 'boolean'
type FieldSpec = { name: string, title: string, kind: FieldKind, options?: object[], required?: boolean }

type BlockSpec = {
  /** Block header shown above the table (composite pages stack visually identical column sets). */
  heading?: string
  collection: string
  columns: FieldSpec[]
  formFields: FieldSpec[]
}

type V2PageSpec = {
  title: string
  /** Titles the page may still live under from earlier eras (W4-B5 renamed 供应商 → 维保服务商 after the F3 upgrade). */
  legacyTitles?: ReadonlyArray<string>
  blocks: BlockSpec[]
}

/** Every route title one spec may appear under: the current title first, then its legacy titles. */
const titlesOf = (spec: V2PageSpec): ReadonlyArray<string> =>
  spec.legacyTitles === undefined ? [spec.title] : [spec.title, ...spec.legacyTitles]

/** Pages W4-B4 retired (工作台 + 采购供应商→采购联系人（历史）) — a re-run skips them instead of failing on the missing v1 row. */
const RETIRED_BY_W4B4: ReadonlySet<string> = new Set(['工作台', '采购供应商'])

const TASK_STATUS = [
  { value: 'backlog', label: '待规划', color: 'default' }, { value: 'todo', label: '待处理', color: 'blue' },
  { value: 'in_progress', label: '进行中', color: 'cyan' }, { value: 'review', label: '评审中', color: 'purple' },
  { value: 'done', label: '已完成', color: 'green' }, { value: 'blocked', label: '受阻', color: 'red' },
  { value: 'cancelled', label: '已取消', color: 'default' },
]
const PRIORITY = [
  { value: 'low', label: '低', color: 'default' }, { value: 'medium', label: '中', color: 'blue' },
  { value: 'high', label: '高', color: 'orange' }, { value: 'urgent', label: '紧急', color: 'red' },
]
const ARTICLE_STATUS = [
  { value: 'draft', label: '草稿', color: 'default' }, { value: 'published', label: '已发布', color: 'green' },
]
const MAINTENANCE_TYPE = [
  { value: 'repair', label: '维修', color: 'red' }, { value: 'inspection', label: '巡检', color: 'blue' },
  { value: 'calibration', label: '校准', color: 'cyan' }, { value: 'Preventive', label: 'Preventive' },
  { value: 'Corrective', label: 'Corrective' }, { value: 'Inspection', label: 'Inspection' },
]
const MAINTENANCE_STATUS = [
  { value: 'pending', label: '待执行', color: 'orange' }, { value: 'done', label: '已完成', color: 'green' },
  { value: 'Scheduled', label: 'Scheduled' }, { value: 'In progress', label: 'In progress' }, { value: 'Done', label: 'Done' },
]
const VENDOR_CATEGORY = [
  { value: 'certification', label: '认证服务', color: 'blue' }, { value: 'logistics', label: '物流仓储', color: 'cyan' },
  { value: 'legal', label: '法务代理', color: 'purple' }, { value: 'misc', label: '综合', color: 'default' },
]
const VENDOR_STATUS = [
  { value: 'active', label: '合作中', color: 'green' }, { value: 'inactive', label: '停用', color: 'default' },
]
// B0: 待审核's value is the literal the mobile form-assistant writes, so
// seeded mobile rows match the enum and render the amber tag.
const PO_SUPPLIER_STATUS = [
  { value: '待审核', label: '待审核', color: 'orange' },
  { value: 'active', label: '合作中', color: 'green' }, { value: 'inactive', label: '停用', color: 'default' },
]
const LEAVE_TYPE = [
  { value: 'annual', label: '年假', color: 'blue' }, { value: 'sick', label: '病假', color: 'red' },
  { value: 'personal', label: '事假', color: 'orange' },
]
const LEAVE_STATUS = [
  { value: 'pending', label: '待审批', color: 'orange' }, { value: 'approved', label: '已批准', color: 'green' },
  { value: 'rejected', label: '已驳回', color: 'red' },
]
const TICKET_STATUS = [
  { value: 'open', label: '待处理', color: 'blue' }, { value: 'pending', label: '处理中', color: 'orange' },
  { value: 'resolved', label: '已解决', color: 'green' }, { value: 'closed', label: '已关闭', color: 'default' },
]
const TICKET_PRIORITY = [
  { value: 'low', label: '低', color: 'default' }, { value: 'medium', label: '中', color: 'blue' },
  { value: 'high', label: '高', color: 'orange' }, { value: 'urgent', label: '紧急', color: 'red' },
]

const MAINTENANCE_FIELDS: ReadonlyArray<FieldSpec> = [
  { name: 'asset', title: '资产', kind: 'm2o' },
  { name: 'type', title: '类型', kind: 'select', options: MAINTENANCE_TYPE },
  { name: 'scheduled_at', title: '计划日期', kind: 'date' },
  { name: 'vendor', title: '服务商', kind: 'm2o' },
  { name: 'cost', title: '费用', kind: 'number' },
  { name: 'status', title: '状态', kind: 'select', options: MAINTENANCE_STATUS },
]

const CATEGORY_FIELDS: ReadonlyArray<FieldSpec> = [
  { name: 'name', title: '分类', kind: 'input', required: true },
  { name: 'code', title: '编码', kind: 'input' },
  { name: 'is_active', title: '启用', kind: 'boolean' },
]

/**
 * The eight pages. Plain pages carry one block; the composites stack blocks
 * in the v1 order. Column sets cover every v1-visible field; the 供应商 form
 * covers the full fields table, which is a superset of the hand-configured
 * Add-new drawer's field set (name/contact/category/status). 采购供应商's
 * columns stay within hub_po_suppliers' actual columns (supplier_code is a
 * draft-card display field only — the mobile preset never persists it).
 */
const HUB_PAGES: ReadonlyArray<V2PageSpec> = [
  {
    title: '知识文章',
    blocks: [{
      collection: 'hub_kb_articles',
      columns: [
        { name: 'title', title: '标题', kind: 'input' },
        { name: 'category', title: '分类', kind: 'm2o' },
        { name: 'status', title: '状态', kind: 'select', options: ARTICLE_STATUS },
        { name: 'updatedAt', title: '更新日', kind: 'date' },
        { name: 'views', title: '浏览量', kind: 'number' },
      ],
      formFields: [
        { name: 'title', title: '标题', kind: 'input', required: true },
        { name: 'category', title: '分类', kind: 'm2o' },
        { name: 'status', title: '状态', kind: 'select', options: ARTICLE_STATUS },
      ],
    }],
  },
  { title: '维保记录', blocks: [{ collection: 'hub_as_maintenance', columns: MAINTENANCE_FIELDS, formFields: MAINTENANCE_FIELDS }] },
  {
    title: '部门',
    blocks: [{
      collection: 'hub_hr_departments',
      columns: [
        { name: 'name', title: '部门', kind: 'input' },
        { name: 'code', title: '编码', kind: 'input' },
        { name: 'manager', title: '负责人', kind: 'input' },
        { name: 'headcount', title: '编制人数', kind: 'number' },
      ],
      formFields: [
        { name: 'name', title: '部门', kind: 'input', required: true },
        { name: 'code', title: '编码', kind: 'input' },
        { name: 'manager', title: '负责人', kind: 'input' },
        { name: 'headcount', title: '编制人数', kind: 'number' },
      ],
    }],
  },
  {
    title: '请假审批',
    blocks: [{
      collection: 'hub_hr_leave_requests',
      columns: [
        { name: 'employee', title: '员工', kind: 'm2o' },
        { name: 'type', title: '类型', kind: 'select', options: LEAVE_TYPE },
        { name: 'start_at', title: '开始', kind: 'date' },
        { name: 'end_at', title: '结束', kind: 'date' },
        { name: 'days', title: '天数', kind: 'number' },
        { name: 'status', title: '状态', kind: 'select', options: LEAVE_STATUS },
        { name: 'reason', title: '事由', kind: 'input' },
      ],
      formFields: [
        { name: 'employee', title: '员工', kind: 'm2o', required: true },
        { name: 'type', title: '类型', kind: 'select', options: LEAVE_TYPE },
        { name: 'start_at', title: '开始', kind: 'date' },
        { name: 'end_at', title: '结束', kind: 'date' },
        { name: 'days', title: '天数', kind: 'number' },
        { name: 'status', title: '状态', kind: 'select', options: LEAVE_STATUS },
        { name: 'reason', title: '事由', kind: 'input', required: true },
      ],
    }],
  },
  {
    title: '维保服务商',
    legacyTitles: ['供应商'],
    blocks: [{
      collection: 'hub_as_vendors',
      columns: [
        { name: 'name', title: '供应商', kind: 'input' },
        { name: 'contact', title: '联系方式', kind: 'input' },
        { name: 'category', title: '类别', kind: 'select', options: VENDOR_CATEGORY },
        { name: 'status', title: '状态', kind: 'select', options: VENDOR_STATUS },
      ],
      formFields: [
        { name: 'name', title: '供应商', kind: 'input', required: true },
        { name: 'contact', title: '联系方式', kind: 'input' },
        { name: 'category', title: '类别', kind: 'select', options: VENDOR_CATEGORY },
        { name: 'status', title: '状态', kind: 'select', options: VENDOR_STATUS },
      ],
    }],
  },
  {
    title: '采购供应商',
    blocks: [{
      collection: 'hub_po_suppliers',
      columns: [
        { name: 'name', title: '供应商', kind: 'input' },
        { name: 'contact_name', title: '联系人', kind: 'input' },
        { name: 'email', title: '邮箱', kind: 'input' },
        { name: 'rating', title: '评分', kind: 'number' },
        { name: 'status', title: '状态', kind: 'select', options: PO_SUPPLIER_STATUS },
      ],
      formFields: [
        { name: 'name', title: '供应商', kind: 'input', required: true },
        { name: 'contact_name', title: '联系人', kind: 'input', required: true },
        { name: 'email', title: '邮箱', kind: 'input' },
        { name: 'rating', title: '评分', kind: 'number' },
        { name: 'status', title: '状态', kind: 'select', options: PO_SUPPLIER_STATUS },
      ],
    }],
  },
  {
    title: '工作台',
    blocks: [
      {
        heading: '我的任务',
        collection: 'hub_pj_tasks',
        columns: [
          { name: 'title', title: '任务标题', kind: 'input' },
          { name: 'project', title: '所属项目', kind: 'm2o' },
          { name: 'assignee', title: '负责人', kind: 'm2o' },
          { name: 'status', title: '状态', kind: 'select', options: TASK_STATUS },
          { name: 'priority', title: '优先级', kind: 'select', options: PRIORITY },
          { name: 'due_at', title: '截止日期', kind: 'date' },
        ],
        formFields: [
          { name: 'title', title: '任务标题', kind: 'input', required: true },
          { name: 'project', title: '所属项目', kind: 'm2o' },
          { name: 'assignee', title: '负责人', kind: 'm2o' },
          { name: 'status', title: '状态', kind: 'select', options: TASK_STATUS },
          { name: 'priority', title: '优先级', kind: 'select', options: PRIORITY },
          { name: 'due_at', title: '截止日期', kind: 'date' },
        ],
      },
      {
        heading: '我的工单',
        collection: 'hub_tk_tickets',
        columns: [
          { name: 'title', title: '工单标题', kind: 'input' },
          { name: 'customer', title: '客户', kind: 'input' },
          { name: 'assignee', title: '处理人', kind: 'input' },
          { name: 'status', title: '状态', kind: 'select', options: TICKET_STATUS },
          { name: 'planned_resolve_at', title: '计划解决', kind: 'date' },
        ],
        formFields: [
          { name: 'title', title: '工单标题', kind: 'input', required: true },
          { name: 'customer', title: '客户', kind: 'input' },
          { name: 'category', title: '类别', kind: 'select', options: [] },
          { name: 'assignee', title: '处理人', kind: 'input' },
          { name: 'status', title: '状态', kind: 'select', options: TICKET_STATUS },
          { name: 'priority', title: '优先级', kind: 'select', options: TICKET_PRIORITY },
          { name: 'planned_resolve_at', title: '计划解决', kind: 'date' },
        ],
      },
    ],
  },
  {
    title: '分类维护',
    blocks: [
      { heading: '客户分类', collection: 'hub_md_customer_categories', columns: CATEGORY_FIELDS, formFields: CATEGORY_FIELDS },
      { heading: '工单分类', collection: 'hub_md_ticket_categories', columns: CATEGORY_FIELDS, formFields: CATEGORY_FIELDS },
      { heading: '资产分类', collection: 'hub_md_asset_categories', columns: CATEGORY_FIELDS, formFields: CATEGORY_FIELDS },
      { heading: '产品分类', collection: 'hub_md_product_categories', columns: CATEGORY_FIELDS, formFields: CATEGORY_FIELDS },
    ],
  },
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

type RouteRow = import('./nocobase-flow-page-lib.mts').RouteRow
type FlowModelRow = import('./nocobase-flow-page-lib.mts').FlowModelRow
type RollbackRecord = import('./nocobase-flow-page-lib.mts').RollbackRecord

const loadRecords = (): RollbackRecord[] => loadRollbackRecords(rollbackPath)
const listModels = (token: string): Promise<FlowModelRow[]> => listFlowModels(token, 'F3')
const listAllRoutes = (token: string): Promise<RouteRow[]> => listRoutes(token, 'F3')

/**
 * Composite-page spine: per collection, one n17f3-prefixed TableBlockModel
 * (batchScopedRows — the prefix rules out E1/F1 blocks on the same
 * collections) plus a top-level CreateFormModel and its submit. 工作台 is
 * a top-level route (parentId null); its record captures that.
 */
async function v2TreeComplete(token: string, spec: V2PageSpec, flow: RouteRow): Promise<boolean> {
  const rows = await listModels(token)
  const uids = new Set(rows.map(row => String(row.uid ?? '')))
  const collectionOf = (row: FlowModelRow): string | undefined => row?.stepParams?.resourceSettings?.init?.collectionName
  let complete = true
  for (const block of spec.blocks) {
    const hasTable = batchScopedRows(rows, { use: 'TableBlockModel', collection: block.collection, uidPrefix: 'n17f3' }).length > 0
    const form = rows.find(row => row.use === 'CreateFormModel' && row.parentId == null && collectionOf(row) === block.collection)
    const hasSubmit = form !== undefined && uids.has(`submit-${form.uid}`)
    if (!(hasTable && hasSubmit)) {
      console.log(`nocobase-f3: v2 page "${spec.title}" block ${block.collection} incomplete (table ${hasTable}, form submit ${hasSubmit})`)
      complete = false
    }
  }
  return complete
}

/** Destroy the flowPage route row (tabs children first) for one F3 title. */
async function destroyFlowPageRow(token: string, title: string): Promise<void> {
  const flow = (await listAllRoutes(token)).find(row => row.title === title && row.type === 'flowPage')
  if (flow === undefined) return
  for (const row of (await listAllRoutes(token)).filter(r => r.parentId === flow.id && r.type === 'tabs')) {
    await call(token, 'DELETE', `/api/desktopRoutes:destroy?filterByTk=${row.id}`)
  }
  await call(token, 'DELETE', `/api/desktopRoutes:destroy?filterByTk=${flow.id}`)
}

/** Re-create one recorded v1 page row plus its tabs children. */
async function restoreV1Row(token: string, record: RollbackRecord): Promise<void> {
  const page = await dataOf(token, 'POST', '/api/desktopRoutes:create', {
    title: record.title, icon: record.icon, type: 'page', parentId: record.parentId, sort: record.sort, schemaUid: record.schemaUid,
  })
  for (const tab of record.tabs ?? []) {
    if (tab.schemaUid === null) continue
    await dataOf(token, 'POST', '/api/desktopRoutes:create', {
      title: '', type: 'tabs', parentId: page.id, schemaUid: tab.schemaUid, tabSchemaName: tab.tabSchemaName, sort: tab.sort,
    })
  }
}

/** Destroy every n17f3* flowModels tree, then sweep orphaned n18ai- buttons (post-destroy list, E5 fix). */
async function destroyF3Trees(token: string): Promise<void> {
  let destroyedModels = 0
  for (const row of await listModels(token)) {
    const uid = String(row.uid ?? '')
    if (uid.startsWith('n17f3')) {
      await call(token, 'POST', `/api/flowModels:destroy?filterByTk=${encodeURIComponent(uid)}`)
      destroyedModels += 1
    }
  }
  if (destroyedModels === 0) return
  const survivors = await listModels(token)
  const liveForms = new Set(survivors.filter(row => row.use === 'CreateFormModel').map(row => String(row.uid ?? '')))
  let destroyedButtons = 0
  for (const row of survivors) {
    const uid = String(row.uid ?? '')
    if (uid.startsWith('n18ai-') && !liveForms.has(uid.slice('n18ai-'.length))) {
      await call(token, 'POST', `/api/flowModels:destroy?filterByTk=${encodeURIComponent(uid)}`)
      destroyedButtons += 1
    }
  }
  console.log(`nocobase-f3: ${destroyedModels} n17f3 flowModels destroyed, ${destroyedButtons} orphaned n18ai- buttons swept`)
}

/** Detect truncated v2 pages, then tear every F3 page back to v1 and rebuild all. */
async function healTruncatedPages(token: string, pages: ReadonlyArray<V2PageSpec>): Promise<boolean> {
  const incomplete: V2PageSpec[] = []
  for (const spec of pages) {
    const flow = (await listAllRoutes(token)).find(row => row.type === 'flowPage' && titlesOf(spec).includes(String(row.title)))
    if (flow !== undefined && !(await v2TreeComplete(token, spec, flow))) incomplete.push(spec)
  }
  if (incomplete.length === 0) return false
  console.log(`nocobase-f3: truncated v2 page(s) ${incomplete.map(spec => spec.title).join(' / ')}; tearing every F3 page down for a full rebuild`)
  await destroyF3Trees(token)
  const records = loadRecords()
  for (const spec of HUB_PAGES) {
    if (RETIRED_BY_W4B4.has(spec.title)) continue
    for (const title of titlesOf(spec)) await destroyFlowPageRow(token, title)
    const routes = await listAllRoutes(token)
    const hasV1 = routes.some(row => row.type === 'page' && titlesOf(spec).includes(String(row.title)))
    if (hasV1) continue
    const record = records.find(row => titlesOf(spec).includes(row.title))
    if (record === undefined || record.schemaUid === null) {
      throw new Error(`v2 page "${spec.title}" is truncated and no v1 rollback record exists for it; restore from research/f-round-inventory snapshots or re-run the all chain`)
    }
    await restoreV1Row(token, record)
  }
  return true
}

/** Build the FormGridModel schema node for one popup form (E1 shape, uid prefix n17f3). */
function formGrid(collection: string, fields: ReadonlyArray<FieldSpec>): Record<string, unknown> {
  const itemUids = fields.map(() => withN17Prefix('n17f3', 'i'))
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

/**
 * Replace one v1 page with a v2 flowPage carrying one TableBlock per block
 * spec in a single BlockGrid (E1 factory, generalized to N blocks; N=1 is
 * the plain F2 shape).
 */
async function ensureV2HubPage(token: string, spec: V2PageSpec): Promise<void> {
  const rows = (await listAllRoutes(token)).filter(row => titlesOf(spec).includes(String(row.title)))
  const flow = rows.find(row => row.type === 'flowPage')
  if (flow !== undefined) {
    if (!(await v2TreeComplete(token, spec, flow))) {
      throw new Error(`v2 page "${spec.title}" is still truncated after the heal pass; refusing to silently keep a blank page`)
    }
    console.log(`nocobase-f3: v2 page "${spec.title}" exists (kept)`)
    return
  }
  const v1 = rows.find(row => row.type === 'page')
  if (v1 === undefined) {
    if (RETIRED_BY_W4B4.has(spec.title)) {
      console.log(`nocobase-f3: page "${spec.title}" retired by W4-B4 and absent — skip (BP-20)`)
      return
    }
    throw new Error(`page "${spec.title}" not found; run nocobase-hub-modules.mts first`)
  }
  const { parentId, icon, sort, schemaUid } = v1
  const v1Tabs = (await listAllRoutes(token))
    .filter(row => row.parentId === v1.id && row.type === 'tabs')
    .map(row => ({ schemaUid: row.schemaUid, tabSchemaName: row.tabSchemaName ?? null, sort: row.sort }))
  writeRollbackRecord(rollbackPath, { title: spec.title, parentId, icon, sort, schemaUid, tabs: v1Tabs, destroyedId: v1.id })
  console.log(`nocobase-f3: v1 page "${spec.title}" row ${JSON.stringify({ id: v1.id, parentId, icon, sort, schemaUid, tabs: v1Tabs.length })} recorded to disk, destroying`)
  await call(token, 'DELETE', `/api/desktopRoutes:destroy?filterByTk=${v1.id}`)
  const routeUid = withN17Prefix('n17f3', '')
  const page = await dataOf(token, 'POST', '/api/desktopRoutes:create', { title: spec.title, icon, type: 'flowPage', parentId, sort, schemaUid: routeUid })
  const tabUid = withN17Prefix('n17f3', 't')
  await dataOf(token, 'POST', '/api/desktopRoutes:create', { title: '', type: 'tabs', parentId: page.id, schemaUid: tabUid, tabSchemaName: withN17Prefix('n17f3', 'ts') })

  const save = (model: Record<string, unknown>) => dataOf(token, 'POST', '/api/flowModels:save', model)
  await save({ uid: routeUid, schema: { use: 'RouteModel' } })
  await save({ uid: tabUid, schema: { use: 'RouteModel' } })
  const pageUid = withN17Prefix('n17f3', 'p')
  await save({ uid: pageUid, parentId: routeUid, subKey: 'page', subType: 'object', use: 'RootPageModel', props: { title: spec.title, displayTitle: true, enableTabs: false }, stepParams: { pageSettings: { general: { title: spec.title, displayTitle: true, enableTabs: false } } } })
  const gridUid = withN17Prefix('n17f3', 'g')
  await save({ uid: gridUid, parentId: tabUid, subKey: 'grid', subType: 'object', use: 'BlockGridModel', props: {}, filterManager: [] })

  let blockIndex = 0
  for (const block of spec.blocks) {
    blockIndex += 1
    const tableUid = withN17Prefix('n17f3', 'tb')
    await save({
      uid: tableUid, use: 'TableBlockModel', parentId: gridUid, subKey: 'items', subType: 'array', sortIndex: blockIndex,
      props: block.heading === undefined ? {} : { title: block.heading },
      stepParams: { resourceSettings: { init: { dataSourceKey: 'main', collectionName: block.collection } } },
    })
    let sortIndex = 1
    for (const column of block.columns) {
      const uid = withN17Prefix('n17f3', 'c')
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
      uid: withN17Prefix('n17f3', 'an'), parentId: tableUid, subKey: 'actions', subType: 'array', sortIndex: 1, use: 'AddNewActionModel', props: {},
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
      uid: withN17Prefix('n17f3', 'rf'), parentId: tableUid, subKey: 'actions', subType: 'array', sortIndex: 2, use: 'RefreshActionModel',
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
  console.log(`nocobase-f3: v2 page "${spec.title}" created (/admin/${routeUid}) with ${spec.blocks.length} block(s) + Add new + floating ball`)
}

/**
 * The m2o target collections below carry no titleField, which blanks the v2
 * relation columns (维保记录 asset/vendor, 请假审批 employee, 知识文章
 * category). Idempotent write-on-diff.
 */
const HUB_TITLE_FIELDS: Readonly<Record<string, string>> = {
  hub_hr_employees: 'name', hub_as_assets: 'name', hub_as_vendors: 'name',
  hub_kb_categories: 'name', hub_hr_departments: 'name', hub_tk_tickets: 'title',
}

async function ensureHubTitleFields(token: string): Promise<void> {
  let updated = 0
  for (const [collection, titleField] of Object.entries(HUB_TITLE_FIELDS)) {
    const row = await dataOf(token, 'GET', `/api/collections:get?filterByTk=${collection}`)
    if (row?.titleField === titleField) continue
    await call(token, 'POST', `/api/collections:update?filterByTk=${collection}`, { titleField })
    updated += 1
  }
  console.log(`nocobase-f3: hub collection titleFields ${updated > 0 ? `${updated} updated` : 'already in place (kept)'}`)
}

/** Ensure every F3 CreateFormModel carries its submit action (E1 rule). */
async function ensureFormSubmits(token: string): Promise<void> {
  const rows = await listModels(token)
  const existingSubmits = new Set(rows.filter(row => row.use === 'FormSubmitActionModel').map(row => row.uid))
  const collections = new Set(HUB_PAGES.flatMap(spec => spec.blocks.map(block => block.collection)))
  const forms = rows.filter(row => row.use === 'CreateFormModel' && row.parentId == null
    && collections.has(String(row.stepParams?.resourceSettings?.init?.collectionName ?? '')))
  let added = 0
  for (const form of forms) {
    const submitUid = `submit-${form.uid}`
    if (existingSubmits.has(submitUid)) continue
    await call(token, 'POST', '/api/flowModels:save', {
      uid: submitUid, parentId: form.uid, subKey: 'actions', subType: 'array', sortIndex: 1, use: 'FormSubmitActionModel', props: {}, stepParams: {},
    })
    added += 1
  }
  console.log(`nocobase-f3: form submit actions ${added > 0 ? `${added} added` : 'already in place (kept)'}`)
}

/** Flag every `required: true` form field on the F3 popup forms (n17f3 scope). */
async function ensureRequiredFields(token: string): Promise<void> {
  const rows = await listModels(token)
  const targets = HUB_PAGES.flatMap(spec => spec.blocks.flatMap(block => block.formFields.filter(field => field.required === true)
    .map(field => ({ collection: block.collection, name: field.name }))))
  const fieldInit = (row: FlowModelRow): { collectionName?: string, fieldPath?: string } => row?.stepParams?.fieldSettings?.init ?? {}
  let flagged = 0
  for (const target of targets) {
    for (const row of rows.filter(candidate => candidate.use === 'FormItemModel'
      && fieldInit(candidate).collectionName === target.collection && fieldInit(candidate).fieldPath === target.name
      && String(candidate.uid ?? '').startsWith('n17f3'))) {
      if (row.props?.required === true) continue
      await call(token, 'POST', '/api/flowModels:save', { uid: row.uid, props: { required: true } })
      flagged += 1
    }
  }
  console.log(`nocobase-f3: required form fields ${flagged > 0 ? `${flagged} flagged` : 'already in place (kept)'}`)
}

/** Tear the F3 upgrade down: n17f3* trees + orphaned buttons + flowPage rows out, recorded v1 rows back. */
async function rollback(token: string): Promise<void> {
  const records = loadRecords()
  if (records.length === 0) {
    console.log(`nocobase-f3: no rollback record at ${rollbackPath} (nothing upgraded from this checkout?)`)
  }
  await destroyF3Trees(token)
  let destroyedRoutes = 0
  for (const spec of HUB_PAGES) {
    const flow = (await listAllRoutes(token)).find(row => row.type === 'flowPage' && titlesOf(spec).includes(String(row.title)))
    if (flow === undefined) continue
    await destroyFlowPageRow(token, String(flow.title))
    destroyedRoutes += 1
  }
  let restored = 0
  for (const record of records) {
    if (!HUB_PAGES.some(spec => spec.title === record.title) || record.schemaUid === null) continue
    const exists = (await listAllRoutes(token)).some(row => row.title === record.title && row.type === 'page')
    if (exists) continue
    await restoreV1Row(token, record)
    restored += 1
  }
  console.log(`nocobase-f3: rollback done — ${destroyedRoutes} v2 route rows destroyed, ${restored} v1 route rows restored`)
}

async function main(): Promise<void> {
  const args = process.argv.slice(2)
  const token = await signInWithRetry()
  if (args.includes('--rollback')) {
    await rollback(token)
    console.log('nocobase-f3: done (rollback)')
    return
  }
  const onlyIndex = args.indexOf('--only')
  const only = onlyIndex >= 0 ? args[onlyIndex + 1] : undefined
  const pages = only === undefined ? HUB_PAGES : HUB_PAGES.filter(spec => spec.title === only)
  if (pages.length === 0) throw new Error(`--only "${only}" matches no F3 page (${HUB_PAGES.map(spec => spec.title).join(' / ')})`)
  await ensureHubTitleFields(token)
  const rebuilt = await healTruncatedPages(token, pages)
  const targets = rebuilt ? HUB_PAGES : pages
  for (const spec of targets) {
    await ensureV2HubPage(token, spec)
  }
  await ensureFormSubmits(token)
  await ensureRequiredFields(token)
  console.log('nocobase-f3: done')
}

await main()
