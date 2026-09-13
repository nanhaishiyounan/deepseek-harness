/**
 * F1: v2 flowPage upgrades for the 项目管理 group's two view pages
 * (任务看板 kanban / 任务日历 calendar, both hub_pj_tasks). This retires
 * the E-round boundary claim that 2.2.6 has "no block model" for those
 * views: plugin-kanban/plugin-calendar ship client-v2 model registrations,
 * flow-engine whitelists them (node-use-sets.ts), the support matrix marks
 * them fully supported, and official kanban/calendar fixtures exist. Only
 * the gantt page stays v1 — plugin-gantt's client model is registered but
 * absent from flow-engine's server authoring surface (no use-set entry, no
 * support-matrix key, no fixture, no .define() metadata).
 *
 * Payload shape comes straight from the official fixtures' persisted form
 * (flow-surfaces-fixtures/kanban-block-live.raw-persisted.json and
 * calendar-block-live.raw-persisted.json), re-wired onto the E1 per-node
 * flowModels:save spine that 11 pages already proved:
 * - kanban: KanbanBlockModel props {groupField:'status', groupOptions:
 *   TASK_STATUS, styleVariant, quickCreateEnabled:false, dragEnabled:true,
 *   sortField:'sort'} (the sort column exists, interface "sort"); cards are
 *   KanbanCardItemModel → DetailsGridModel → DetailsItemModel(fieldPath) →
 *   Display*FieldModel, the same dual shape as details fixtures; the card
 *   drawer opens through KanbanCardViewActionModel.
 * - calendar: CalendarBlockModel props {fieldNames {title,start:due_at,
 *   end:plan_end}, defaultView:'month'} + calendarSettings.eventPopupSettings;
 *   the v1 page mapped start to due_at with no end field — plan_end restores
 *   the end semantics.
 * Add new goes through AddNewActionModel → ChildPageModel → CreateFormModel
 * (the E1 popup wire), never quickCreate, so n18 mounts the AI-employee
 * button on the top-level form like every other v2 page.
 *
 * Idempotent + rollback contract: same as E1 (kept spine check, read-modify-
 * write rollback records at demos/acceptance-f/rollback-records.json flushed
 * before every destroy, post-destroy n18ai- orphan sweep, full-batch heal for
 * truncated trees). v1 rows carry a tabs child row each, so the record also
 * captures {schemaUid, tabSchemaName, sort} per tabs row and --rollback
 * recreates them (the E3 orphan-tab shadowing trap).
 *
 * Usage:
 *   node --import tsx/esm examples/kb-agent/scripts/nocobase-f1-view-v2.mts [--only 任务看板]
 *   node --import tsx/esm examples/kb-agent/scripts/nocobase-f1-view-v2.mts --rollback
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

type FieldKind = 'input' | 'select' | 'number' | 'm2o' | 'date' | 'boolean'
type FieldSpec = { name: string, title: string, kind: FieldKind, options?: object[], required?: boolean }

type V2ViewPageSpec = {
  title: string
  collection: string
  /** 'kanban' mounts a KanbanBlockModel board; 'calendar' a CalendarBlockModel month grid. */
  viewKind: 'kanban' | 'calendar'
  /** Block props straight from the official fixture shapes (grouping / fieldNames / views). */
  viewProps: Record<string, unknown>
  /** Kanban card fields (DetailsItemModel → Display*FieldModel); empty for calendar. */
  cardFields: FieldSpec[]
  formFields: FieldSpec[]
}

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

/**
 * The two view pages. The task form repeats the E1 任务列表 field set so the
 * Add-new popup creates the same records; the kanban card shows the core
 * fields the fixed v1 cards showed (title/status/priority/due_at plus the
 * two m2o labels). dragEnabled pairs with the physical "sort" column.
 */
const VIEW_PAGES: ReadonlyArray<V2ViewPageSpec> = [
  {
    title: '任务看板', collection: 'hub_pj_tasks', viewKind: 'kanban',
    viewProps: {
      groupField: 'status', groupOptions: TASK_STATUS, styleVariant: 'color',
      quickCreateEnabled: false, dragEnabled: true, sortField: 'sort',
    },
    cardFields: [
      { name: 'title', title: '任务标题', kind: 'input' },
      { name: 'status', title: '状态', kind: 'select', options: TASK_STATUS },
      { name: 'priority', title: '优先级', kind: 'select', options: PRIORITY },
      { name: 'due_at', title: '截止日期', kind: 'date' },
      { name: 'assignee', title: '负责人', kind: 'm2o' },
      { name: 'project', title: '所属项目', kind: 'm2o' },
    ],
    formFields: [
      { name: 'title', title: '任务标题', kind: 'input', required: true },
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
    title: '任务日历', collection: 'hub_pj_tasks', viewKind: 'calendar',
    viewProps: {
      fieldNames: { id: 'id', title: 'title', start: 'due_at', end: 'plan_end' },
      defaultView: 'month', enableQuickCreateEvent: true, weekStart: 1,
    },
    cardFields: [],
    formFields: [
      { name: 'title', title: '任务标题', kind: 'input', required: true },
      { name: 'project', title: '所属项目', kind: 'm2o' },
      { name: 'assignee', title: '负责人', kind: 'm2o' },
      { name: 'status', title: '状态', kind: 'select', options: TASK_STATUS },
      { name: 'priority', title: '优先级', kind: 'select', options: PRIORITY },
      { name: 'due_at', title: '截止日期', kind: 'date' },
      { name: 'plan_start', title: '计划开始', kind: 'date' },
      { name: 'plan_end', title: '计划结束', kind: 'date' },
    ],
  },
]

/** Card display models mirror the E1 table-column map (same field-type resolver). */
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

/** One destroyed v1 page row plus its tabs children (E3 shadowing trap: they must be restored too). */
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

/**
 * List all flowModels rows, refusing to continue when the page size was
 * exceeded: a truncated list would make the kept-tree check and the orphan
 * sweep silently miss rows. Raise pageSize here when the catalog grows.
 */
async function listFlowModels(token: string): Promise<FlowModelRow[]> {
  const pageSize = 1000
  const payload = await call(token, 'GET', `/api/flowModels:list?pageSize=${pageSize}`)
  const rows = (payload?.data ?? null) as FlowModelRow[] | null
  if (rows === null) return []
  const total = payload?.meta?.total
  if (typeof total === 'number' && total > rows.length) {
    throw new Error(`flowModels:list returned ${rows.length} of ${total} rows (pageSize=${pageSize}); raise the page size or paginate before running F1`)
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
    throw new Error(`desktopRoutes:list returned ${routes.length} of ${total} rows (pageSize=${pageSize}); raise the page size before running F1`)
  }
  return routes
}

/** The view-model class each page kind must keep in its tree. */
const viewModelFor = (viewKind: V2ViewPageSpec['viewKind']): string =>
  viewKind === 'kanban' ? 'KanbanBlockModel' : 'CalendarBlockModel'

/**
 * The kept-page spine: one view block of the page's kind on the page's
 * collection, one top-level CreateFormModel (Add-new popup wire, n18's
 * mount point), and that form's submit action. The view block is the
 * decisive evidence — no earlier script ever creates one.
 */
async function v2TreeComplete(token: string, spec: V2ViewPageSpec, flow: RouteRow): Promise<boolean> {
  const rows = await listFlowModels(token)
  const uids = new Set(rows.map(row => String(row.uid ?? '')))
  const collectionOf = (row: FlowModelRow): string | undefined => row?.stepParams?.resourceSettings?.init?.collectionName
  const hasView = rows.some(row => row.use === viewModelFor(spec.viewKind) && collectionOf(row) === spec.collection)
  const form = rows.find(row => row.use === 'CreateFormModel' && row.parentId == null && collectionOf(row) === spec.collection)
  const hasSubmit = form !== undefined && uids.has(`submit-${form.uid}`)
  if (hasView && hasSubmit) return true
  console.log(`nocobase-f1: v2 page "${spec.title}" (${flow.schemaUid}) tree incomplete (view ${hasView}, form submit ${hasSubmit})`)
  return false
}

/**
 * Detect truncated v2 pages, then tear EVERY F1 page back to its v1 row in
 * one pass — same reason as E1: n17f1* rows carry no page marker, so
 * healing page B would destroy page A's fresh tree. Returns true when a
 * teardown happened; callers then rebuild all VIEW_PAGES.
 */
async function healTruncatedPages(token: string, pages: ReadonlyArray<V2ViewPageSpec>): Promise<boolean> {
  const incomplete: V2ViewPageSpec[] = []
  for (const spec of pages) {
    const flow = (await listRoutes(token)).find(row => row.title === spec.title && row.type === 'flowPage')
    if (flow !== undefined && !(await v2TreeComplete(token, spec, flow))) incomplete.push(spec)
  }
  if (incomplete.length === 0) return false
  console.log(`nocobase-f1: truncated v2 page(s) ${incomplete.map(spec => spec.title).join(' / ')}; tearing every F1 page down for a full rebuild`)
  await destroyF1Trees(token)
  const records = loadRollbackRecords()
  for (const spec of VIEW_PAGES) {
    await destroyFlowPageRow(token, spec.title)
    const routes = await listRoutes(token)
    const hasV1 = routes.some(row => row.title === spec.title && row.type === 'page')
    if (hasV1) continue
    const record = records.find(row => row.title === spec.title)
    if (record === undefined || record.schemaUid === null) {
      throw new Error(`v2 page "${spec.title}" is truncated and no v1 rollback record exists for it; restore from research/f-round-inventory snapshots or re-run nocobase-hub-modules.mts reset`)
    }
    await restoreV1Row(token, record)
  }
  return true
}

/** Destroy the flowPage route row (tabs children first) for one F1 title. */
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
 * Destroy every n17f1* flowModels tree, then sweep the n18ai- buttons the
 * teardown orphaned, judged against the post-destroy list (E5 fix).
 */
async function destroyF1Trees(token: string): Promise<void> {
  let destroyedModels = 0
  for (const row of await listFlowModels(token)) {
    const uid = String(row.uid ?? '')
    if (uid.startsWith('n17f1')) {
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
  console.log(`nocobase-f1: ${destroyedModels} n17f1 flowModels destroyed, ${destroyedButtons} orphaned n18ai- buttons swept`)
}

/**
 * Build the FormGridModel schema node for one popup form (E1 shape, uid
 * prefix n17f1); `required` lands on the FormItemModel props.
 */
function formGrid(collection: string, fields: ReadonlyArray<FieldSpec>): Record<string, unknown> {
  const itemUids = fields.map(() => `n17f1i${nodeKey()}`)
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
 * The kanban card chain: one KanbanCardItemModel whose DetailsGridModel
 * carries one DetailsItemModel per card field, each wrapping the field-type
 * display model (the details fixture dual shape).
 */
function kanbanCard(collection: string, fields: ReadonlyArray<FieldSpec>): Record<string, unknown> {
  // DetailsGridModel is a GridModel: items only render when the layout rows
  // reference their uids (same wire as the E1 form grid). The fixtures ship
  // the card grid skeleton without a layout because the authoring addBlock
  // channel backfills it server-side.
  const itemUids = fields.map(() => `n17f1di${nodeKey()}`)
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
              // The details fixture shows `field` as an array because that is
              // the authoring addBlock input; the persisted shape the client
              // hydrates (DetailsItemModel.subModels.field: FieldModel, same
              // as the E1 table-column display models) is a single object.
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

/**
 * Replace one v1 view page with a v2 flowPage carrying the official fixture
 * block. Same E1 lifecycle: record v1 row (+tabs children) to disk, destroy,
 * rebuild. The view block props/stepParams and the per-kind subaction sets
 * mirror kanban-block-live / calendar-block-live raw-persisted fixtures;
 * Add new reuses the E1 AddNewActionModel → ChildPageModel → CreateFormModel
 * popup wire so n18 reaches the form.
 */
async function ensureV2ViewPage(token: string, spec: V2ViewPageSpec): Promise<void> {
  const rows = (await listRoutes(token)).filter(row => row.title === spec.title)
  const flow = rows.find(row => row.type === 'flowPage')
  if (flow !== undefined) {
    if (!(await v2TreeComplete(token, spec, flow))) {
      throw new Error(`v2 page "${spec.title}" is still truncated after the heal pass; refusing to silently keep a blank page`)
    }
    console.log(`nocobase-f1: v2 page "${spec.title}" exists (kept)`)
    return
  }
  const v1 = rows.find(row => row.type === 'page')
  if (v1 === undefined) throw new Error(`page "${spec.title}" not found; run nocobase-hub-modules.mts first`)
  const { parentId, icon, sort, schemaUid } = v1
  const v1Tabs = (await listRoutes(token))
    .filter(row => row.parentId === v1.id && row.type === 'tabs')
    .map(row => ({ schemaUid: row.schemaUid, tabSchemaName: row.tabSchemaName ?? null, sort: row.sort }))
  upsertRollbackRecord({ title: spec.title, parentId, icon, sort, schemaUid, tabs: v1Tabs, destroyedId: v1.id })
  console.log(`nocobase-f1: v1 page "${spec.title}" row ${JSON.stringify({ id: v1.id, parentId, icon, sort, schemaUid, tabs: v1Tabs.length })} recorded to disk, destroying`)
  await call(token, 'DELETE', `/api/desktopRoutes:destroy?filterByTk=${v1.id}`)
  const routeUid = `n17f1${nodeKey()}`
  const page = await dataOf(token, 'POST', '/api/desktopRoutes:create', { title: spec.title, icon, type: 'flowPage', parentId, sort, schemaUid: routeUid })
  const tabUid = `n17f1t${nodeKey()}`
  await dataOf(token, 'POST', '/api/desktopRoutes:create', { title: '', type: 'tabs', parentId: page.id, schemaUid: tabUid, tabSchemaName: `n17f1ts${nodeKey()}` })

  const save = (model: Record<string, unknown>) => dataOf(token, 'POST', '/api/flowModels:save', model)
  await save({ uid: routeUid, schema: { use: 'RouteModel' } })
  await save({ uid: tabUid, schema: { use: 'RouteModel' } })
  const pageUid = `n17f1p${nodeKey()}`
  await save({ uid: pageUid, parentId: routeUid, subKey: 'page', subType: 'object', use: 'RootPageModel', props: { title: spec.title, displayTitle: true, enableTabs: false }, stepParams: { pageSettings: { general: { title: spec.title, displayTitle: true, enableTabs: false } } } })
  const gridUid = `n17f1g${nodeKey()}`
  await save({ uid: gridUid, parentId: tabUid, subKey: 'grid', subType: 'object', use: 'BlockGridModel', props: {}, filterManager: [] })

  // View block — the per-kind props/stepParams from the official fixtures.
  const viewUid = `n17f1${spec.viewKind === 'kanban' ? 'kb' : 'cd'}${nodeKey()}`
  const viewStepParams: Record<string, unknown> = {
    resourceSettings: { init: { dataSourceKey: 'main', collectionName: spec.collection } },
  }
  if (spec.viewKind === 'calendar') {
    viewStepParams.cardSettings = { blockHeight: { heightMode: 'fullHeight' } }
    viewStepParams.calendarSettings = { eventPopupSettings: { filterByTk: '{{ctx.record.id}}' } }
  }
  await save({
    uid: viewUid, use: viewModelFor(spec.viewKind), parentId: gridUid, subKey: 'items', subType: 'array', sortIndex: 1,
    props: spec.viewProps, stepParams: viewStepParams,
  })

  // Action bar. Calendar adds its nav/view-select pair before Add new.
  let actionIndex = 1
  await save({
    uid: `n17f1fa${nodeKey()}`, parentId: viewUid, subKey: 'actions', subType: 'array', sortIndex: actionIndex++,
    use: 'FilterActionModel', props: {},
    stepParams: { buttonSettings: { general: { title: '{{t("Filter")}}' } } },
  })
  if (spec.viewKind === 'calendar') {
    await save({ uid: `n17f1cn${nodeKey()}`, parentId: viewUid, subKey: 'actions', subType: 'array', sortIndex: actionIndex++, use: 'CalendarNavActionModel', props: {} })
    await save({ uid: `n17f1cv${nodeKey()}`, parentId: viewUid, subKey: 'actions', subType: 'array', sortIndex: actionIndex++, use: 'CalendarViewSelectActionModel', props: {} })
  }
  await save({
    uid: `n17f1an${nodeKey()}`, parentId: viewUid, subKey: 'actions', subType: 'array', sortIndex: actionIndex++,
    use: 'AddNewActionModel', props: {},
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
    uid: `n17f1rf${nodeKey()}`, parentId: viewUid, subKey: 'actions', subType: 'array', sortIndex: actionIndex++,
    use: 'RefreshActionModel', props: { title: '', icon: 'ReloadOutlined' },
    stepParams: { buttonSettings: { general: { title: '', icon: 'ReloadOutlined' } } },
  })

  // Per-kind popup actions + the kanban card chain (fixture shapes).
  const openView = { mode: 'drawer', size: 'medium', pageModelClass: 'ChildPageModel', collectionName: spec.collection, dataSourceKey: 'main' }
  if (spec.viewKind === 'kanban') {
    await save({
      uid: `n17f1cva${nodeKey()}`, parentId: viewUid, subKey: 'cardViewAction', subType: 'object', sortIndex: 1,
      use: 'KanbanCardViewActionModel', props: {}, stepParams: { popupSettings: { openView } },
    })
    await save({
      uid: `n17f1qca${nodeKey()}`, parentId: viewUid, subKey: 'quickCreateAction', subType: 'object', sortIndex: 1,
      use: 'KanbanQuickCreateActionModel', props: {}, stepParams: { popupSettings: { openView } },
    })
    const cardUid = `n17f1ci${nodeKey()}`
    const card = kanbanCard(spec.collection, spec.cardFields)
    await save({ uid: cardUid, parentId: viewUid, ...card })
  } else {
    await save({
      uid: `n17f1eva${nodeKey()}`, parentId: viewUid, subKey: 'eventViewAction', subType: 'object', sortIndex: 1,
      use: 'CalendarEventViewActionModel', props: {},
      stepParams: { popupSettings: { openView: { ...openView, filterByTk: '{{ctx.record.id}}' } } },
    })
    await save({
      uid: `n17f1qca${nodeKey()}`, parentId: viewUid, subKey: 'quickCreateAction', subType: 'object', sortIndex: 1,
      use: 'CalendarQuickCreateActionModel', props: {}, stepParams: { popupSettings: { openView } },
    })
  }
  console.log(`nocobase-f1: v2 page "${spec.title}" created (${baseUrl}/admin/${routeUid}) with ${spec.viewKind} block + Add new + floating ball`)
}

/**
 * Ensure every top-level hub_pj_tasks CreateFormModel (E1's and F1's — the
 * Add-new popups of 任务列表/任务看板/任务日历) carries its submit action;
 * same deterministic `submit-<formUid>` ids as E1/N17.
 */
async function ensureFormSubmits(token: string): Promise<void> {
  const rows = await listFlowModels(token)
  const existingSubmits = new Set(rows.filter(row => row.use === 'FormSubmitActionModel').map(row => row.uid))
  const forms = rows.filter(row => row.use === 'CreateFormModel' && row.parentId == null
    && row.stepParams?.resourceSettings?.init?.collectionName === 'hub_pj_tasks')
  let added = 0
  for (const form of forms) {
    const submitUid = `submit-${form.uid}`
    if (existingSubmits.has(submitUid)) continue
    await call(token, 'POST', '/api/flowModels:save', {
      uid: submitUid, parentId: form.uid, subKey: 'actions', subType: 'array', sortIndex: 1, use: 'FormSubmitActionModel', props: {}, stepParams: {},
    })
    added += 1
  }
  console.log(`nocobase-f1: form submit actions ${added > 0 ? `${added} added` : 'already in place (kept)'}`)
}

/** Flag every `required: true` form field on the F1 popup forms (E1 sweep, n17f1 scope). */
async function ensureRequiredFields(token: string): Promise<void> {
  const rows = await listFlowModels(token)
  const targets = VIEW_PAGES.flatMap(spec => spec.formFields.filter(field => field.required === true)
    .map(field => ({ collection: spec.collection, name: field.name })))
  const fieldInit = (row: FlowModelRow): { collectionName?: string, fieldPath?: string } => row?.stepParams?.fieldSettings?.init ?? {}
  let flagged = 0
  for (const target of targets) {
    for (const row of rows.filter(candidate => candidate.use === 'FormItemModel'
      && fieldInit(candidate).collectionName === target.collection && fieldInit(candidate).fieldPath === target.name
      && candidate.uid?.startsWith('n17f1'))) {
      if (row.props?.required === true) continue
      await call(token, 'POST', '/api/flowModels:save', { uid: row.uid, props: { required: true } })
      flagged += 1
    }
  }
  console.log(`nocobase-f1: required form fields ${flagged > 0 ? `${flagged} flagged` : 'already in place (kept)'}`)
}

/**
 * Tear the F1 upgrade down: destroy every n17f1* tree + orphaned n18ai-
 * buttons, destroy both flowPage rows, restore the recorded v1 page rows
 * with their tabs children. The gantt page is never touched.
 */
async function rollback(token: string): Promise<void> {
  const records = loadRollbackRecords()
  if (records.length === 0) {
    console.log(`nocobase-f1: no rollback record at ${rollbackPath} (nothing upgraded from this checkout?)`)
  }
  await destroyF1Trees(token)
  let destroyedRoutes = 0
  for (const spec of VIEW_PAGES) {
    const flow = (await listRoutes(token)).find(row => row.title === spec.title && row.type === 'flowPage')
    if (flow === undefined) continue
    await destroyFlowPageRow(token, spec.title)
    destroyedRoutes += 1
  }
  let restored = 0
  for (const record of records) {
    if (!VIEW_PAGES.some(spec => spec.title === record.title) || record.schemaUid === null) continue
    const exists = (await listRoutes(token)).some(row => row.title === record.title && row.type === 'page')
    if (exists) continue
    await restoreV1Row(token, record)
    restored += 1
  }
  console.log(`nocobase-f1: rollback done — ${destroyedRoutes} v2 route rows destroyed, ${restored} v1 route rows restored (gantt untouched)`)
}

async function main(): Promise<void> {
  const args = process.argv.slice(2)
  const token = await signInWithRetry()
  if (args.includes('--rollback')) {
    await rollback(token)
    console.log('nocobase-f1: done (rollback)')
    return
  }
  const onlyIndex = args.indexOf('--only')
  const only = onlyIndex >= 0 ? args[onlyIndex + 1] : undefined
  const pages = only === undefined ? VIEW_PAGES : VIEW_PAGES.filter(spec => spec.title === only)
  if (pages.length === 0) throw new Error(`--only "${only}" matches no F1 page (${VIEW_PAGES.map(spec => spec.title).join(' / ')})`)
  const rebuilt = await healTruncatedPages(token, pages)
  const targets = rebuilt ? VIEW_PAGES : pages
  for (const spec of targets) {
    await ensureV2ViewPage(token, spec)
  }
  await ensureFormSubmits(token)
  await ensureRequiredFields(token)
  console.log('nocobase-f1: done')
}

await main()
