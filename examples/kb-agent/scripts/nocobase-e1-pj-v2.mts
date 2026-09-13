/**
 * E1: v2 flowPage upgrades for the 项目管理 group's three table pages
 * (项目 / 任务列表 / 里程碑) so the plugin-ai floating ball and the
 * n18ai- form AI buttons reach them, replicating the N17d factory
 * (nocobase-n17-alignment.mts ensureV2TablePage) with the field kinds that
 * factory never generated: m2o, date, and boolean.
 *
 * Kind → model map (server-side sources of record):
 * - m2o  edit  = RecordSelectFieldModel  (flow-engine service-helpers, the
 *   default for every association interface), display = DisplayTextFieldModel
 *   (field-type-resolver: non-form containers render text-type relations).
 * - date edit  = DateOnlyFieldModel, display = DisplayDateTimeFieldModel
 *   (core-field-default-bindings matrix, interface "date").
 * - boolean edit = CheckboxFieldModel, display = DisplayCheckboxFieldModel
 *   (same matrix, interface "checkbox").
 * The m2o pickers are the acceptance core: owner/assignee must select the
 * nine AI-employee users rows — a text input here would regress D1.
 *
 * The kanban / calendar / gantt pages stay v1: the 2.2.6 flowModel catalog
 * has no block model for those views (documented QUICKSTART boundary).
 *
 * Idempotent: an existing flowPage of the same title is kept whole (the
 * n18 button uid derives from the form uid, so keeping the page keeps the
 * buttons). The v1 route row destroyed before the upgrade is logged to
 * demos/acceptance-e1/rollback-records.json; `--rollback` re-creates those
 * rows and tears down the n17e1* / n18ai-n17e1* flowModels trees.
 *
 * Usage:
 *   node --import tsx/esm examples/kb-agent/scripts/nocobase-e1-pj-v2.mts [--only 项目]
 *   node --import tsx/esm examples/kb-agent/scripts/nocobase-e1-pj-v2.mts --rollback
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(here, '../../..')
const baseUrl = process.env.NOCOBASE_BASE_URL ?? 'http://127.0.0.1:13000'
const rootEmail = process.env.NOCOBASE_ROOT_EMAIL ?? 'admin@nocobase.com'
const rootPassword = process.env.NOCOBASE_ROOT_PASSWORD ?? 'admin123'
const rollbackPath = join(repoRoot, 'examples/kb-agent/demos/acceptance-e1/rollback-records.json')

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

/** Sign in with retry; NocoBase resets connections briefly after heavy schema writes. */
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

/** Column + form field shorthand shared by the page factory below (N17 kinds + E1 kinds). */
type FieldKind = 'input' | 'select' | 'number' | 'm2o' | 'date' | 'boolean'
type FieldSpec = { name: string, title: string, kind: FieldKind, options?: object[] }

type V2PageSpec = {
  title: string
  collection: string
  columns: FieldSpec[]
  formFields: FieldSpec[]
}

const PROJECT_STATUS = [
  { value: 'planning', label: '规划中', color: 'blue' }, { value: 'in_progress', label: '进行中', color: 'cyan' },
  { value: 'blocked', label: '受阻', color: 'red' }, { value: 'completed', label: '已完成', color: 'green' },
  { value: 'archived', label: '已归档', color: 'default' },
]
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
const MILESTONE_STATUS = [
  { value: 'pending', label: '待达成', color: 'blue' }, { value: 'reached', label: '已达成', color: 'green' },
]

/**
 * The three 项目管理 table pages. formFields cover every user-facing column
 * of each collection (the user's hand-configured Add-new popup on the
 * 项目 page listed the same core set, so the v2 replacement loses no
 * field); internal foreign-key mirrors (hub_pj_*_id) and the legacy
 * assignee_text never enter forms.
 */
const PJ_PAGES: ReadonlyArray<V2PageSpec> = [
  {
    title: '项目', collection: 'hub_pj_projects',
    columns: [
      { name: 'name', title: '项目名称', kind: 'input' },
      { name: 'no', title: '项目编号', kind: 'input' },
      { name: 'customer', title: '客户', kind: 'input' },
      { name: 'owner', title: '负责人', kind: 'm2o' },
      { name: 'status', title: '状态', kind: 'select', options: PROJECT_STATUS },
      { name: 'progress', title: '进度 %', kind: 'number' },
      { name: 'priority', title: '优先级', kind: 'select', options: PRIORITY },
      { name: 'planned_end_date', title: '计划完成', kind: 'date' },
    ],
    formFields: [
      { name: 'name', title: '项目名称', kind: 'input' },
      { name: 'no', title: '项目编号', kind: 'input' },
      { name: 'customer', title: '客户', kind: 'input' },
      { name: 'owner', title: '负责人', kind: 'm2o' },
      { name: 'status', title: '状态', kind: 'select', options: PROJECT_STATUS },
      { name: 'progress', title: '进度 %', kind: 'number' },
      { name: 'priority', title: '优先级', kind: 'select', options: PRIORITY },
      { name: 'planned_end_date', title: '计划完成', kind: 'date' },
      { name: 'start_date', title: '开始日期', kind: 'date' },
      { name: 'due_date', title: '到期日', kind: 'date' },
    ],
  },
  {
    title: '任务列表', collection: 'hub_pj_tasks',
    columns: [
      { name: 'title', title: '任务标题', kind: 'input' },
      { name: 'project', title: '所属项目', kind: 'm2o' },
      { name: 'assignee', title: '负责人', kind: 'm2o' },
      { name: 'status', title: '状态', kind: 'select', options: TASK_STATUS },
      { name: 'priority', title: '优先级', kind: 'select', options: PRIORITY },
      { name: 'due_at', title: '截止日期', kind: 'date' },
      { name: 'plan_start', title: '计划开始', kind: 'date' },
      { name: 'plan_end', title: '计划结束', kind: 'date' },
    ],
    formFields: [
      { name: 'title', title: '任务标题', kind: 'input' },
      { name: 'project', title: '所属项目', kind: 'm2o' },
      { name: 'assignee', title: '负责人', kind: 'm2o' },
      { name: 'status', title: '状态', kind: 'select', options: TASK_STATUS },
      { name: 'priority', title: '优先级', kind: 'select', options: PRIORITY },
      { name: 'due_at', title: '截止日期', kind: 'date' },
      { name: 'plan_start', title: '计划开始', kind: 'date' },
      { name: 'plan_end', title: '计划结束', kind: 'date' },
    ],
  },
  {
    title: '里程碑', collection: 'hub_pj_milestones',
    columns: [
      { name: 'name', title: '里程碑', kind: 'input' },
      { name: 'project', title: '所属项目', kind: 'm2o' },
      { name: 'due_at', title: '到期日', kind: 'date' },
      { name: 'status', title: '状态', kind: 'select', options: MILESTONE_STATUS },
    ],
    formFields: [
      { name: 'name', title: '里程碑', kind: 'input' },
      { name: 'project', title: '所属项目', kind: 'm2o' },
      { name: 'due_at', title: '到期日', kind: 'date' },
      { name: 'status', title: '状态', kind: 'select', options: MILESTONE_STATUS },
      { name: 'done', title: '已达成', kind: 'boolean' },
    ],
  },
]

/** Table-column display models; relation cells render as text (resolver's non-form branch). */
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

/** Popup-form edit models; RecordSelectFieldModel is the server default for every association interface. */
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

type RouteRow = { id: number, title: string | null, parentId: number | null, type: string, schemaUid: string | null, icon: string | null, sort: number | null }

async function listRoutes(token: string): Promise<RouteRow[]> {
  const routes = await dataOf(token, 'GET', '/api/desktopRoutes:list?pageSize=400') as RouteRow[] | null
  return routes ?? []
}

/**
 * Replace one v1 table page with a v2 flowPage (N17d factory replica). The
 * destroyed v1 row is appended to the rollback record before any write, so
 * a failed upgrade never loses the restore payload.
 */
async function ensureV2TablePage(token: string, spec: V2PageSpec, rollbackLog: Array<Record<string, unknown>>): Promise<void> {
  const rows = (await listRoutes(token)).filter(row => row.title === spec.title)
  const flow = rows.find(row => row.type === 'flowPage')
  if (flow !== undefined) {
    console.log(`nocobase-e1: v2 page "${spec.title}" exists (kept)`)
    return
  }
  const v1 = rows.find(row => row.type === 'page')
  if (v1 === undefined) throw new Error(`page "${spec.title}" not found; run nocobase-hub-modules.mts first`)
  const { parentId, icon, sort, schemaUid } = v1
  rollbackLog.push({ title: spec.title, parentId, icon, sort, schemaUid, destroyedId: v1.id })
  console.log(`nocobase-e1: v1 page "${spec.title}" row ${JSON.stringify({ id: v1.id, parentId, icon, sort, schemaUid })} recorded, destroying`)
  await call(token, 'DELETE', `/api/desktopRoutes:destroy?filterByTk=${v1.id}`)
  const routeUid = `n17e1${nodeKey()}`
  const page = await dataOf(token, 'POST', '/api/desktopRoutes:create', { title: spec.title, icon, type: 'flowPage', parentId, sort, schemaUid: routeUid })
  const tabUid = `n17e1t${nodeKey()}`
  await dataOf(token, 'POST', '/api/desktopRoutes:create', { title: '', type: 'tabs', parentId: page.id, schemaUid: tabUid, tabSchemaName: `n17e1ts${nodeKey()}` })

  const save = (model: Record<string, unknown>) => dataOf(token, 'POST', '/api/flowModels:save', model)
  await save({ uid: routeUid, schema: { use: 'RouteModel' } })
  await save({ uid: tabUid, schema: { use: 'RouteModel' } })
  const pageUid = `n17e1p${nodeKey()}`
  await save({ uid: pageUid, parentId: routeUid, subKey: 'page', subType: 'object', use: 'RootPageModel', props: { title: spec.title, displayTitle: true, enableTabs: false }, stepParams: { pageSettings: { general: { title: spec.title, displayTitle: true, enableTabs: false } } } })
  const gridUid = `n17e1g${nodeKey()}`
  await save({ uid: gridUid, parentId: tabUid, subKey: 'grid', subType: 'object', use: 'BlockGridModel', props: {}, filterManager: [] })

  // Table block + columns in the official dual shape (N16 column() factory).
  const tableUid = `n17e1tb${nodeKey()}`
  await save({ uid: tableUid, use: 'TableBlockModel', parentId: gridUid, subKey: 'items', subType: 'array', sortIndex: 1, stepParams: { resourceSettings: { init: { dataSourceKey: 'main', collectionName: spec.collection } } }, props: {} })
  let sortIndex = 1
  for (const column of spec.columns) {
    const uid = `n17e1c${nodeKey()}`
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

  // Action bar: Add new (with popup form) + Refresh — the official wire from
  // the N17d factory; n18 mounts the AI-employee button afterwards.
  await save({
    uid: `n17e1an${nodeKey()}`, parentId: tableUid, subKey: 'actions', subType: 'array', sortIndex: 1, use: 'AddNewActionModel', props: {},
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
    uid: `n17e1rf${nodeKey()}`, parentId: tableUid, subKey: 'actions', subType: 'array', sortIndex: 2, use: 'RefreshActionModel',
    props: { title: '', icon: 'ReloadOutlined' },
    stepParams: { buttonSettings: { general: { title: '', icon: 'ReloadOutlined' } } },
  })
  console.log(`nocobase-e1: v2 page "${spec.title}" created (${baseUrl}/admin/${routeUid}) with Add new + floating ball`)
}

/**
 * Ensure the three 项目管理 collections carry a titleField, which the v2 m2o
 * display models read from the target collection to label related records
 * (users ships titleField=nickname, which is why owner/assignee cells
 * render; a table without one renders blank — the task page's project
 * column before this fix). Idempotent: only writes when the option differs.
 */
const PJ_TITLE_FIELDS: Readonly<Record<string, string>> = {
  hub_pj_projects: 'name', hub_pj_tasks: 'title', hub_pj_milestones: 'name',
}

async function ensurePjTitleFields(token: string): Promise<void> {
  let updated = 0
  for (const [collection, titleField] of Object.entries(PJ_TITLE_FIELDS)) {
    const row = await dataOf(token, 'GET', `/api/collections:get?filterByTk=${collection}`)
    // titleField is a top-level column on the collections API, not an options key.
    if (row?.titleField === titleField) continue
    await call(token, 'POST', `/api/collections:update?filterByTk=${collection}`, { titleField })
    updated += 1
  }
  console.log(`nocobase-e1: pj collection titleFields ${updated > 0 ? `${updated} updated` : 'already in place (kept)'}`)
}

/**
 * Ensure every E1 CreateFormModel carries a FormSubmitActionModel. The all
 * chain runs nocobase-n17-alignment.mts (whose ensureFormSubmits does this
 * for its own eight pages) before this script, so the E1 popups would ship
 * without a submit button unless this script self-mounts them — same wire,
 * same deterministic `submit-<formUid>` ids as N17.
 */
async function ensureFormSubmits(token: string): Promise<void> {
  const rows = await dataOf(token, 'GET', '/api/flowModels:list?pageSize=1000') as Array<Record<string, any>> | null
  const existingSubmits = new Set((rows ?? []).filter(row => row.use === 'FormSubmitActionModel').map(row => row.uid))
  const forms = (rows ?? []).filter(row => row.use === 'CreateFormModel' && row.parentId == null && row.stepParams?.resourceSettings?.init?.collectionName
    && ['hub_pj_projects', 'hub_pj_tasks', 'hub_pj_milestones'].includes(String(row.stepParams.resourceSettings.init.collectionName)))
  let added = 0
  for (const form of forms) {
    const submitUid = `submit-${form.uid}`
    if (existingSubmits.has(submitUid)) continue
    await call(token, 'POST', '/api/flowModels:save', {
      uid: submitUid, parentId: form.uid, subKey: 'actions', subType: 'array', sortIndex: 1, use: 'FormSubmitActionModel', props: {}, stepParams: {},
    })
    added += 1
  }
  console.log(`nocobase-e1: form submit actions ${added > 0 ? `${added} added` : 'already in place (kept)'}`)
}

/** Build the FormGridModel schema node for one popup form (one row per field; N17 shape). */
function formGrid(collection: string, fields: ReadonlyArray<FieldSpec>): Record<string, unknown> {
  const itemUids = fields.map(() => `n17e1i${nodeKey()}`)
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
        uid: itemUids[index], use: 'FormItemModel', subKey: 'items', subType: 'array', sortIndex: index + 1, props: {},
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
 * Tear the upgrade down: destroy each E1 flowPage route row (with its tabs
 * child), every n17e1* flowModels tree, the orphaned n18ai- form buttons
 * (the embedded CreateFormModel gets a server-generated uid, so no
 * n18ai-n17e1* prefix exists — orphans are matched exactly the way
 * nocobase-n18-form-ai.mts self-heals), then re-create the recorded v1
 * route rows pointing at their original uiSchemas. Re-run
 * nocobase-hub-modules.mts afterwards to replay the v1 blocks if the
 * uiSchemas tree was cascade-deleted (probe note: it is not).
 */
async function rollback(token: string): Promise<void> {
  let records: Array<{ title: string, parentId: number | null, icon: string | null, sort: number | null, schemaUid: string | null }> = []
  try {
    records = JSON.parse(readFileSync(rollbackPath, 'utf8')) as typeof records
  } catch {
    console.log(`nocobase-e1: no rollback record at ${rollbackPath} (nothing upgraded from this checkout?)`)
  }
  const models = await dataOf(token, 'GET', '/api/flowModels:list?pageSize=1000') as Array<Record<string, any>> | null
  const formUidSet = new Set((models ?? []).filter(row => row.use === 'CreateFormModel').map(row => String(row.uid ?? '')))
  let destroyedModels = 0
  let destroyedButtons = 0
  for (const row of models ?? []) {
    const uid = String(row.uid ?? '')
    if (uid.startsWith('n17e1')) {
      await call(token, 'POST', `/api/flowModels:destroy?filterByTk=${encodeURIComponent(uid)}`)
      destroyedModels += 1
      continue
    }
    if (uid.startsWith('n18ai-') && !formUidSet.has(uid.slice('n18ai-'.length))) {
      await call(token, 'POST', `/api/flowModels:destroy?filterByTk=${encodeURIComponent(uid)}`)
      destroyedButtons += 1
    }
  }
  const routes = await listRoutes(token)
  let destroyedRoutes = 0
  for (const spec of PJ_PAGES) {
    const flow = routes.find(row => row.title === spec.title && row.type === 'flowPage')
    if (flow === undefined) continue
    const tabs = (await listRoutes(token)).filter(row => row.parentId === flow.id && row.type === 'tabs')
    for (const tab of tabs) {
      await call(token, 'DELETE', `/api/desktopRoutes:destroy?filterByTk=${tab.id}`)
    }
    await call(token, 'DELETE', `/api/desktopRoutes:destroy?filterByTk=${flow.id}`)
    destroyedRoutes += 1
  }
  let restored = 0
  for (const record of records) {
    if (record.schemaUid === null) continue
    const exists = (await listRoutes(token)).some(row => row.title === record.title && row.type === 'page')
    if (exists) continue
    await dataOf(token, 'POST', '/api/desktopRoutes:create', { title: record.title, icon: record.icon, type: 'page', parentId: record.parentId, sort: record.sort, schemaUid: record.schemaUid })
    restored += 1
  }
  console.log(`nocobase-e1: rollback done — ${destroyedModels} flowModels destroyed, ${destroyedButtons} orphaned AI buttons destroyed, ${destroyedRoutes} v2 route rows destroyed, ${restored} v1 route rows restored (re-run nocobase-hub-modules.mts to replay v1 blocks if needed)`)
}

async function main(): Promise<void> {
  const args = process.argv.slice(2)
  const token = await signInWithRetry()
  if (args.includes('--rollback')) {
    await rollback(token)
    console.log('nocobase-e1: done (rollback)')
    return
  }
  const onlyIndex = args.indexOf('--only')
  const only = onlyIndex >= 0 ? args[onlyIndex + 1] : undefined
  const pages = only === undefined ? PJ_PAGES : PJ_PAGES.filter(spec => spec.title === only)
  if (pages.length === 0) throw new Error(`--only "${only}" matches no E1 page (${PJ_PAGES.map(spec => spec.title).join(' / ')})`)
  await ensurePjTitleFields(token)
  const rollbackLog: Array<Record<string, unknown>> = []
  for (const spec of pages) {
    await ensureV2TablePage(token, spec, rollbackLog)
  }
  await ensureFormSubmits(token)
  if (rollbackLog.length > 0) {
    mkdirSync(dirname(rollbackPath), { recursive: true })
    writeFileSync(rollbackPath, `${JSON.stringify(rollbackLog, null, 2)}\n`)
    console.log(`nocobase-e1: rollback record written to ${rollbackPath}`)
  }
  console.log('nocobase-e1: done')
}

await main()
