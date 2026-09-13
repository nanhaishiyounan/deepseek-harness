/**
 * F2: v2 flowPage upgrades for the five remaining CRM v1 table pages
 * (产品与服务 / 回款 / 发票 / 客户仪表盘 / 销售仪表盘), replicating the E1
 * table factory so the plugin-ai floating ball and n18ai- form buttons reach
 * them. The two "仪表盘" pages are single-table pages despite the name
 * (no chart blocks anywhere in the v1 trees) and keep their menu entries —
 * 客户仪表盘 is a second view over crm_customers, 销售仪表盘 over
 * crm_payments (F4 may add Chart blocks on top).
 *
 * Column/form specs come from the psql fields table cross-checked against
 * the v1 trees in research/f-round-inventory/v1-pages/ (every v1-visible
 * field ⊆ spec); select options are copied verbatim from the field
 * metadata. crm_customers and crm_deals lack a titleField, which v2 m2o
 * display models read to label related records — the script sets
 * customers.name / deals.name first (E1 ensurePjTitleFields fix).
 *
 * Idempotent + rollback contract: identical to E1/F1 (kept spine check =
 * TableBlockModel + top-level CreateFormModel + submit; rollback records
 * merged by title into demos/acceptance-f/rollback-records.json and flushed
 * before every destroy — the v1 rows' tabs children are recorded too;
 * --rollback tears down n17f2* trees, sweeps orphaned n18ai- buttons, and
 * restores the recorded rows).
 *
 * Usage:
 *   node --import tsx/esm examples/kb-agent/scripts/nocobase-f2-crm-v2.mts [--only 回款]
 *   node --import tsx/esm examples/kb-agent/scripts/nocobase-f2-crm-v2.mts --rollback
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(here, '../../..')
const baseUrl = process.env.NOCOBASE_BASE_URL ?? 'http://127.0.0.1:13000'
const rootEmail = process.env.NOCOBASE_ROOT_EMAIL ?? 'admin@nocobase.com'
const rootPassword = process.env.NOCOBASE_ROOT_PASSWORD ?? 'admin123'
const rollbackPath = join(repoRoot, 'examples/kb-agent/demos/acceptance-f/rollback-records.json')

const nodeKey = (): string => Math.random().toString(36).slice(2, 13)

async function call(token: string, method: 'GET' | 'POST' | 'DELETE', path: string, body?: unknown): Promise<any> {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: { authorization: `Bearer ${token}`, ...(body === undefined ? {} : { 'content-type': 'application/json' }) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
  const payload = await response.json().catch(() => null)
  if (!response.ok) {
    throw new Error(`${method} ${path} -> HTTP ${response.status}: ${JSON.stringify(payload).slice(0, 300)}`)
  }
  return payload
}

async function dataOf(token: string, method: 'GET' | 'POST' | 'DELETE', path: string, body?: unknown): Promise<any> {
  const payload = await call(token, method, path, body)
  return payload?.data ?? null
}

async function signIn(): Promise<string> {
  const payload = await call('', 'POST', '/api/auth:signIn', { account: rootEmail, password: rootPassword })
  const token = payload?.data?.token
  if (typeof token !== 'string' || token.length === 0) throw new Error(`sign-in as ${rootEmail} returned no token`)
  return token
}

async function signInWithRetry(attempts = 4): Promise<string> {
  let lastError: unknown
  for (let i = 0; i < attempts; i++) {
    try {
      return await signIn()
    } catch (error) {
      lastError = error
      await new Promise(resolve => setTimeout(resolve, 8000))
    }
  }
  throw lastError
}

type FieldKind = 'input' | 'select' | 'number' | 'm2o' | 'date' | 'boolean'
type FieldSpec = { name: string, title: string, kind: FieldKind, options?: object[], required?: boolean }

type V2PageSpec = {
  title: string
  collection: string
  columns: FieldSpec[]
  formFields: FieldSpec[]
}

const CUSTOMER_TYPE = [
  { value: 'enterprise', label: '企业客户', color: 'blue' }, { value: 'trader', label: '贸易商', color: 'cyan' },
  { value: 'factory', label: '工厂', color: 'green' },
]
const CUSTOMER_LEVEL = [
  { value: 'A', label: 'A 级', color: 'green' }, { value: 'B', label: 'B 级', color: 'blue' },
  { value: 'C', label: 'C 级', color: 'orange' },
]
const CUSTOMER_STATUS = [
  { value: 'active', label: '合作中', color: 'green' }, { value: 'prospect', label: '潜在', color: 'blue' },
  { value: 'churned', label: '已流失', color: 'red' },
]
const PRODUCT_CATEGORY = [
  { value: 'compliance', label: '合规认证', color: 'blue' }, { value: 'logistics', label: '海外仓储', color: 'cyan' },
  { value: 'channel', label: '渠道拓展', color: 'green' }, { value: 'brand', label: '品牌营销', color: 'purple' },
  { value: 'data', label: '数据洞察', color: 'orange' }, { value: 'ops', label: '运营辅导', color: 'default' },
]
const PRODUCT_PRICING = [
  { value: 'fixed', label: '固定报价', color: 'blue' }, { value: 'times', label: '按次计费', color: 'green' },
  { value: 'subscription', label: '年度订阅', color: 'purple' },
]
const PAYMENT_METHOD = [
  { value: 'bank_transfer', label: '银行转账', color: 'blue' }, { value: 'letter_of_credit', label: '信用证', color: 'green' },
  { value: 'acceptance_bill', label: '承兑汇票', color: 'orange' },
]
const PAYMENT_STATUS = [
  { value: 'pending', label: '待到账', color: 'orange' }, { value: 'received', label: '已到账', color: 'green' },
]
const INVOICE_STATUS = [
  { value: 'draft', label: '草稿', color: 'default' }, { value: 'issued', label: '已开具', color: 'blue' },
  { value: 'paid', label: '已收款', color: 'green' }, { value: 'void', label: '已作废', color: 'red' },
]

const PAYMENT_FIELDS: ReadonlyArray<FieldSpec> = [
  { name: 'customer', title: '客户', kind: 'm2o' },
  { name: 'deal', title: '订单', kind: 'm2o' },
  { name: 'amount', title: '金额', kind: 'number' },
  { name: 'method', title: '方式', kind: 'select', options: PAYMENT_METHOD },
  { name: 'paid_at', title: '到账日期', kind: 'date' },
  { name: 'status', title: '状态', kind: 'select', options: PAYMENT_STATUS },
]

/**
 * The five pages. Each column set covers every v1-visible field of the
 * page's collection; forms mirror the columns (money/document numbers stay
 * free-form inputs, no required flags the v1 forms did not have except the
 * natural titles).
 */
const CRM_PAGES: ReadonlyArray<V2PageSpec> = [
  {
    title: '产品与服务', collection: 'crm_products',
    columns: [
      { name: 'name', title: '名称', kind: 'input' },
      { name: 'category', title: '类别', kind: 'select', options: PRODUCT_CATEGORY },
      { name: 'pricing_mode', title: '计价方式', kind: 'select', options: PRODUCT_PRICING },
      { name: 'unit', title: '单位', kind: 'input' },
      { name: 'base_price', title: '基准单价', kind: 'number' },
    ],
    formFields: [
      { name: 'name', title: '名称', kind: 'input', required: true },
      { name: 'category', title: '类别', kind: 'select', options: PRODUCT_CATEGORY },
      { name: 'pricing_mode', title: '计价方式', kind: 'select', options: PRODUCT_PRICING },
      { name: 'unit', title: '单位', kind: 'input' },
      { name: 'base_price', title: '基准单价', kind: 'number' },
    ],
  },
  { title: '回款', collection: 'crm_payments', columns: PAYMENT_FIELDS, formFields: PAYMENT_FIELDS },
  {
    title: '发票', collection: 'crm_invoices',
    columns: [
      { name: 'invoice_no', title: '发票号码', kind: 'input' },
      { name: 'customer', title: '客户', kind: 'm2o' },
      { name: 'deal', title: '订单', kind: 'm2o' },
      { name: 'amount', title: '金额', kind: 'number' },
      { name: 'issued_at', title: '开票日期', kind: 'date' },
      { name: 'status', title: '状态', kind: 'select', options: INVOICE_STATUS },
    ],
    formFields: [
      { name: 'invoice_no', title: '发票号码', kind: 'input', required: true },
      { name: 'customer', title: '客户', kind: 'm2o' },
      { name: 'deal', title: '订单', kind: 'm2o' },
      { name: 'amount', title: '金额', kind: 'number' },
      { name: 'issued_at', title: '开票日期', kind: 'date' },
      { name: 'status', title: '状态', kind: 'select', options: INVOICE_STATUS },
    ],
  },
  {
    title: '客户仪表盘', collection: 'crm_customers',
    columns: [
      { name: 'name', title: '客户名称', kind: 'input' },
      { name: 'type', title: '类型', kind: 'select', options: CUSTOMER_TYPE },
      { name: 'industry', title: '行业', kind: 'input' },
      { name: 'country', title: '国家/地区', kind: 'input' },
      { name: 'level', title: '等级', kind: 'select', options: CUSTOMER_LEVEL },
      { name: 'status', title: '状态', kind: 'select', options: CUSTOMER_STATUS },
    ],
    formFields: [
      { name: 'name', title: '客户名称', kind: 'input', required: true },
      { name: 'type', title: '类型', kind: 'select', options: CUSTOMER_TYPE },
      { name: 'industry', title: '行业', kind: 'input' },
      { name: 'country', title: '国家/地区', kind: 'input' },
      { name: 'level', title: '等级', kind: 'select', options: CUSTOMER_LEVEL },
      { name: 'status', title: '状态', kind: 'select', options: CUSTOMER_STATUS },
    ],
  },
  { title: '销售仪表盘', collection: 'crm_payments', columns: PAYMENT_FIELDS, formFields: PAYMENT_FIELDS },
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

type RouteRow = { id: number, title: string | null, parentId: number | null, type: string, schemaUid: string | null, icon: string | null, sort: number | null, tabSchemaName?: string | null }
type FlowModelRow = Record<string, any>

type RollbackRecord = {
  title: string
  parentId: number | null
  icon: string | null
  sort: number | null
  schemaUid: string | null
  tabs?: Array<{ schemaUid: string | null, tabSchemaName: string | null, sort: number | null }>
  destroyedId?: number
}

function loadRollbackRecords(): RollbackRecord[] {
  try {
    return JSON.parse(readFileSync(rollbackPath, 'utf8')) as RollbackRecord[]
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code
    if (code === 'ENOENT') return []
    throw new Error(`rollback record at ${rollbackPath} is unreadable (${String(error)}); fix or delete it before re-running`)
  }
}

function saveRollbackRecords(records: RollbackRecord[]): void {
  writeFileSync(rollbackPath, `${JSON.stringify(records, null, 2)}\n`)
}

function upsertRollbackRecord(record: RollbackRecord): void {
  const records = loadRollbackRecords()
  const index = records.findIndex(row => row.title === record.title)
  if (index >= 0) records.splice(index, 1, record)
  else records.push(record)
  saveRollbackRecords(records)
}

async function listFlowModels(token: string): Promise<FlowModelRow[]> {
  const pageSize = 2000
  const payload = await call(token, 'GET', `/api/flowModels:list?pageSize=${pageSize}`)
  const rows = (payload?.data ?? null) as FlowModelRow[] | null
  if (rows === null) return []
  const total = payload?.meta?.total
  if (typeof total === 'number' ? total > rows.length : rows.length === pageSize) {
    throw new Error(`flowModels:list returned ${rows.length} of ${total} rows (pageSize=${pageSize}); raise the page size or paginate before running F2`)
  }
  return rows
}

async function listRoutes(token: string): Promise<RouteRow[]> {
  const pageSize = 400
  const payload = await call(token, 'GET', `/api/desktopRoutes:list?pageSize=${pageSize}`)
  const routes = (payload?.data ?? null) as RouteRow[] | null
  if (routes === null) return []
  const total = payload?.meta?.total
  if (typeof total === 'number' && total > routes.length) {
    throw new Error(`desktopRoutes:list returned ${routes.length} of ${total} rows (pageSize=${pageSize}); raise the page size before running F2`)
  }
  return routes
}

/**
 * The kept-page spine (E1 rule): a TableBlockModel and a top-level
 * CreateFormModel on the page's collection plus that form's submit action.
 */
async function v2TreeComplete(token: string, spec: V2PageSpec, flow: RouteRow): Promise<boolean> {
  const rows = await listFlowModels(token)
  const uids = new Set(rows.map(row => String(row.uid ?? '')))
  const collectionOf = (row: FlowModelRow): string | undefined => row?.stepParams?.resourceSettings?.init?.collectionName
  const hasTable = rows.some(row => row.use === 'TableBlockModel' && collectionOf(row) === spec.collection)
  const form = rows.find(row => row.use === 'CreateFormModel' && row.parentId == null && collectionOf(row) === spec.collection)
  const hasSubmit = form !== undefined && uids.has(`submit-${form.uid}`)
  if (hasTable && hasSubmit) return true
  console.log(`nocobase-f2: v2 page "${spec.title}" (${flow.schemaUid}) tree incomplete (table ${hasTable}, form submit ${hasSubmit})`)
  return false
}

/** Destroy the flowPage route row (tabs children first) for one F2 title. */
async function destroyFlowPageRow(token: string, title: string): Promise<void> {
  const flow = (await listRoutes(token)).find(row => row.title === title && row.type === 'flowPage')
  if (flow === undefined) return
  for (const row of (await listRoutes(token)).filter(r => r.parentId === flow.id && r.type === 'tabs')) {
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

/**
 * Destroy every n17f2* flowModels tree, then sweep the n18ai- buttons the
 * teardown orphaned (judged against the post-destroy list, E5 fix).
 */
async function destroyF2Trees(token: string): Promise<void> {
  let destroyedModels = 0
  for (const row of await listFlowModels(token)) {
    const uid = String(row.uid ?? '')
    if (uid.startsWith('n17f2')) {
      await call(token, 'POST', `/api/flowModels:destroy?filterByTk=${encodeURIComponent(uid)}`)
      destroyedModels += 1
    }
  }
  if (destroyedModels === 0) return
  const survivors = await listFlowModels(token)
  const liveForms = new Set(survivors.filter(row => row.use === 'CreateFormModel').map(row => String(row.uid ?? '')))
  let destroyedButtons = 0
  for (const row of survivors) {
    const uid = String(row.uid ?? '')
    if (uid.startsWith('n18ai-') && !liveForms.has(uid.slice('n18ai-'.length))) {
      await call(token, 'POST', `/api/flowModels:destroy?filterByTk=${encodeURIComponent(uid)}`)
      destroyedButtons += 1
    }
  }
  console.log(`nocobase-f2: ${destroyedModels} n17f2 flowModels destroyed, ${destroyedButtons} orphaned n18ai- buttons swept`)
}

/** Detect truncated v2 pages, then tear every F2 page back to v1 and rebuild all. */
async function healTruncatedPages(token: string, pages: ReadonlyArray<V2PageSpec>): Promise<boolean> {
  const incomplete: V2PageSpec[] = []
  for (const spec of pages) {
    const flow = (await listRoutes(token)).find(row => row.title === spec.title && row.type === 'flowPage')
    if (flow !== undefined && !(await v2TreeComplete(token, spec, flow))) incomplete.push(spec)
  }
  if (incomplete.length === 0) return false
  console.log(`nocobase-f2: truncated v2 page(s) ${incomplete.map(spec => spec.title).join(' / ')}; tearing every F2 page down for a full rebuild`)
  await destroyF2Trees(token)
  const records = loadRollbackRecords()
  for (const spec of CRM_PAGES) {
    await destroyFlowPageRow(token, spec.title)
    const routes = await listRoutes(token)
    const hasV1 = routes.some(row => row.title === spec.title && row.type === 'page')
    if (hasV1) continue
    const record = records.find(row => row.title === spec.title)
    if (record === undefined || record.schemaUid === null) {
      throw new Error(`v2 page "${spec.title}" is truncated and no v1 rollback record exists for it; restore from research/f-round-inventory snapshots or re-run the all chain`)
    }
    await restoreV1Row(token, record)
  }
  return true
}

/** Build the FormGridModel schema node for one popup form (E1 shape, uid prefix n17f2). */
function formGrid(collection: string, fields: ReadonlyArray<FieldSpec>): Record<string, unknown> {
  const itemUids = fields.map(() => `n17f2i${nodeKey()}`)
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
            props: field.options === undefined ? {} : { allowClear: true, options: field.options },
          },
        },
      })),
    },
  }
}

/**
 * Replace one v1 table page with a v2 flowPage (E1 factory replica): record
 * the v1 row (+tabs children) to disk, destroy, rebuild the
 * RouteModel → RootPage → grid → TableBlock + columns + AddNew popup +
 * Refresh tree. n18 mounts the AI button on the top-level form afterwards.
 */
async function ensureV2TablePage(token: string, spec: V2PageSpec): Promise<void> {
  const rows = (await listRoutes(token)).filter(row => row.title === spec.title)
  const flow = rows.find(row => row.type === 'flowPage')
  if (flow !== undefined) {
    if (!(await v2TreeComplete(token, spec, flow))) {
      throw new Error(`v2 page "${spec.title}" is still truncated after the heal pass; refusing to silently keep a blank page`)
    }
    console.log(`nocobase-f2: v2 page "${spec.title}" exists (kept)`)
    return
  }
  const v1 = rows.find(row => row.type === 'page')
  if (v1 === undefined) throw new Error(`page "${spec.title}" not found; run nocobase-crm-modules.mts first`)
  const { parentId, icon, sort, schemaUid } = v1
  const v1Tabs = (await listRoutes(token))
    .filter(row => row.parentId === v1.id && row.type === 'tabs')
    .map(row => ({ schemaUid: row.schemaUid, tabSchemaName: row.tabSchemaName ?? null, sort: row.sort }))
  upsertRollbackRecord({ title: spec.title, parentId, icon, sort, schemaUid, tabs: v1Tabs, destroyedId: v1.id })
  console.log(`nocobase-f2: v1 page "${spec.title}" row ${JSON.stringify({ id: v1.id, parentId, icon, sort, schemaUid, tabs: v1Tabs.length })} recorded to disk, destroying`)
  await call(token, 'DELETE', `/api/desktopRoutes:destroy?filterByTk=${v1.id}`)
  const routeUid = `n17f2${nodeKey()}`
  const page = await dataOf(token, 'POST', '/api/desktopRoutes:create', { title: spec.title, icon, type: 'flowPage', parentId, sort, schemaUid: routeUid })
  const tabUid = `n17f2t${nodeKey()}`
  await dataOf(token, 'POST', '/api/desktopRoutes:create', { title: '', type: 'tabs', parentId: page.id, schemaUid: tabUid, tabSchemaName: `n17f2ts${nodeKey()}` })

  const save = (model: Record<string, unknown>) => dataOf(token, 'POST', '/api/flowModels:save', model)
  await save({ uid: routeUid, schema: { use: 'RouteModel' } })
  await save({ uid: tabUid, schema: { use: 'RouteModel' } })
  const pageUid = `n17f2p${nodeKey()}`
  await save({ uid: pageUid, parentId: routeUid, subKey: 'page', subType: 'object', use: 'RootPageModel', props: { title: spec.title, displayTitle: true, enableTabs: false }, stepParams: { pageSettings: { general: { title: spec.title, displayTitle: true, enableTabs: false } } } })
  const gridUid = `n17f2g${nodeKey()}`
  await save({ uid: gridUid, parentId: tabUid, subKey: 'grid', subType: 'object', use: 'BlockGridModel', props: {}, filterManager: [] })

  const tableUid = `n17f2tb${nodeKey()}`
  await save({ uid: tableUid, use: 'TableBlockModel', parentId: gridUid, subKey: 'items', subType: 'array', sortIndex: 1, stepParams: { resourceSettings: { init: { dataSourceKey: 'main', collectionName: spec.collection } } }, props: {} })
  let sortIndex = 1
  for (const column of spec.columns) {
    const uid = `n17f2c${nodeKey()}`
    const model = displayModelFor(column.kind)
    await save({
      uid, use: 'TableColumnModel', parentId: tableUid, subKey: 'columns', subType: 'array', sortIndex,
      stepParams: {
        fieldSettings: { init: { dataSourceKey: 'main', collectionName: spec.collection, fieldPath: column.name } },
        tableColumnSettings: { model: { use: model } },
      },
      props: { title: column.title, dataIndex: column.name, width: 150, editable: false, sorter: false, fixed: 'none', ...(column.options === undefined ? {} : { options: column.options }) },
    })
    await save({
      uid: `${uid}f`, use: model, parentId: uid, subKey: 'field', subType: 'object', sortIndex: 0,
      stepParams: { popupSettings: { openView: { collectionName: spec.collection, dataSourceKey: 'main' } } },
      props: { displayStyle: 'text', overflowMode: 'ellipsis', clickToOpen: false, displayCopyButton: false, ...(column.options === undefined ? {} : { options: column.options }) },
    })
    sortIndex += 1
  }

  await save({
    uid: `n17f2an${nodeKey()}`, parentId: tableUid, subKey: 'actions', subType: 'array', sortIndex: 1, use: 'AddNewActionModel', props: {},
    stepParams: { popupSettings: { openView: { collectionName: spec.collection, dataSourceKey: 'main' } } },
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
                    stepParams: { resourceSettings: { init: { dataSourceKey: 'main', collectionName: spec.collection } } },
                    subModels: { grid: formGrid(spec.collection, spec.formFields) },
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
    uid: `n17f2rf${nodeKey()}`, parentId: tableUid, subKey: 'actions', subType: 'array', sortIndex: 2, use: 'RefreshActionModel',
    props: { title: '', icon: 'ReloadOutlined' },
    stepParams: { buttonSettings: { general: { title: '', icon: 'ReloadOutlined' } } },
  })
  console.log(`nocobase-f2: v2 page "${spec.title}" created (${baseUrl}/admin/${routeUid}) with Add new + floating ball`)
}

/**
 * crm_customers / crm_deals carry no titleField; the v2 m2o display models
 * read it from the target collection to label related records (回款/发票's
 * customer/deal columns would render blank). Idempotent write-on-diff.
 */
const CRM_TITLE_FIELDS: Readonly<Record<string, string>> = {
  crm_customers: 'name', crm_deals: 'name',
}

async function ensureCrmTitleFields(token: string): Promise<void> {
  let updated = 0
  for (const [collection, titleField] of Object.entries(CRM_TITLE_FIELDS)) {
    const row = await dataOf(token, 'GET', `/api/collections:get?filterByTk=${collection}`)
    if (row?.titleField === titleField) continue
    await call(token, 'POST', `/api/collections:update?filterByTk=${collection}`, { titleField })
    updated += 1
  }
  console.log(`nocobase-f2: crm collection titleFields ${updated > 0 ? `${updated} updated` : 'already in place (kept)'}`)
}

/** Ensure every F2 CreateFormModel carries its submit action (E1 rule, deterministic `submit-<formUid>` ids). */
async function ensureFormSubmits(token: string): Promise<void> {
  const rows = await listFlowModels(token)
  const existingSubmits = new Set(rows.filter(row => row.use === 'FormSubmitActionModel').map(row => row.uid))
  const collections = new Set(CRM_PAGES.map(spec => spec.collection))
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
  console.log(`nocobase-f2: form submit actions ${added > 0 ? `${added} added` : 'already in place (kept)'}`)
}

/** Flag every `required: true` form field on the F2 popup forms (n17f2 scope). */
async function ensureRequiredFields(token: string): Promise<void> {
  const rows = await listFlowModels(token)
  const targets = CRM_PAGES.flatMap(spec => spec.formFields.filter(field => field.required === true)
    .map(field => ({ collection: spec.collection, name: field.name })))
  const fieldInit = (row: FlowModelRow): { collectionName?: string, fieldPath?: string } => row?.stepParams?.fieldSettings?.init ?? {}
  let flagged = 0
  for (const target of targets) {
    for (const row of rows.filter(candidate => candidate.use === 'FormItemModel'
      && fieldInit(candidate).collectionName === target.collection && fieldInit(candidate).fieldPath === target.name
      && String(candidate.uid ?? '').startsWith('n17f2'))) {
      if (row.props?.required === true) continue
      await call(token, 'POST', '/api/flowModels:save', { uid: row.uid, props: { required: true } })
      flagged += 1
    }
  }
  console.log(`nocobase-f2: required form fields ${flagged > 0 ? `${flagged} flagged` : 'already in place (kept)'}`)
}

/** Tear the F2 upgrade down: n17f2* trees + orphaned buttons + flowPage rows out, recorded v1 rows back. */
async function rollback(token: string): Promise<void> {
  const records = loadRollbackRecords()
  if (records.length === 0) {
    console.log(`nocobase-f2: no rollback record at ${rollbackPath} (nothing upgraded from this checkout?)`)
  }
  await destroyF2Trees(token)
  let destroyedRoutes = 0
  for (const spec of CRM_PAGES) {
    const flow = (await listRoutes(token)).find(row => row.title === spec.title && row.type === 'flowPage')
    if (flow === undefined) continue
    await destroyFlowPageRow(token, spec.title)
    destroyedRoutes += 1
  }
  let restored = 0
  for (const record of records) {
    if (!CRM_PAGES.some(spec => spec.title === record.title) || record.schemaUid === null) continue
    const exists = (await listRoutes(token)).some(row => row.title === record.title && row.type === 'page')
    if (exists) continue
    await restoreV1Row(token, record)
    restored += 1
  }
  console.log(`nocobase-f2: rollback done — ${destroyedRoutes} v2 route rows destroyed, ${restored} v1 route rows restored`)
}

async function main(): Promise<void> {
  const args = process.argv.slice(2)
  const token = await signInWithRetry()
  if (args.includes('--rollback')) {
    await rollback(token)
    console.log('nocobase-f2: done (rollback)')
    return
  }
  const onlyIndex = args.indexOf('--only')
  const only = onlyIndex >= 0 ? args[onlyIndex + 1] : undefined
  const pages = only === undefined ? CRM_PAGES : CRM_PAGES.filter(spec => spec.title === only)
  if (pages.length === 0) throw new Error(`--only "${only}" matches no F2 page (${CRM_PAGES.map(spec => spec.title).join(' / ')})`)
  await ensureCrmTitleFields(token)
  const rebuilt = await healTruncatedPages(token, pages)
  const targets = rebuilt ? CRM_PAGES : pages
  for (const spec of targets) {
    await ensureV2TablePage(token, spec)
  }
  await ensureFormSubmits(token)
  await ensureRequiredFields(token)
  console.log('nocobase-f2: done')
}

await main()
