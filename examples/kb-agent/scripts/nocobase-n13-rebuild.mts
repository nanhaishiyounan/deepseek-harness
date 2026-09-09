/**
 * N13 one-shot maintenance run: rebuild the B2/B3 v1 pages whose wire keys
 * (`col`/`block`/`table`/`actionBar`) were literal names, and pin the
 * "AI 工作台" v2 flowPage that carries the admin-side AI employee entry.
 *
 * Why rebuild: uiSchemas insertAdjacent treats a repeated node name as the
 * same node, so the literal keys grafted later inserts onto unrelated trees
 * (one `col` row ended up under `nocobase-admin-profile-create-form`) and
 * left pages with Grid.Row -> CardItem chains that the v1 Grid renders as
 * blank pages. The crm/hub scripts now generate unique node keys
 * (`nodeKey()`); deleting the broken pages and replaying those scripts
 * rebuilds healthy trees while their per-title menu and per-CardItem block
 * idempotency stays intact.
 *
 * Idempotent: pages already absent are skipped, the AI workbench is kept by
 * title, and flowModels saves are upserts keyed by uid.
 *
 * N16: every run also drops the orphaned N13-test-page flowModels (their
 * desktopRoutes row is long gone), and fresh workbench columns are created
 * in the official dual shape — a TableColumnModel plus its Display*FieldModel
 * `field` child, the same pair the UI editor saves.
 */
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const baseUrl = process.env.NOCOBASE_BASE_URL ?? 'http://127.0.0.1:13000'
const rootEmail = 'admin@nocobase.com'
const rootPassword = 'admin123'

/** Node key in the NocoBase uid style; uniqueness is what matters here. */
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

/** Every page the crm/hub scripts own; deleted so their replay recreates healthy schema trees. */
const REBUILD_PAGE_TITLES: ReadonlyArray<string> = [
  '销售线索', '客户', '联系人', '产品与服务', '客户仪表盘',
  '订单', '报价单', '回款', '发票', '销售仪表盘',
  '工作台', '项目', '任务看板', '任务列表', '任务日历', '任务甘特', '里程碑',
  '工单', '知识文章', '资产台账', '供应商', '维保记录',
  '员工', '部门', '请假审批', '分类维护',
  'N13测试页',
]

async function deletePages(token: string): Promise<void> {
  const routes = await dataOf(token, 'GET', '/api/desktopRoutes:list?pageSize=400') as Array<{ id: number, title: string | null, type: string, parentId: number | null }> | null
  const wanted = new Set(REBUILD_PAGE_TITLES)
  // Route rows whose own title matches; tabs children hang off page rows and
  // are removed together with the page destroy.
  const targets = (routes ?? []).filter(row => wanted.has(row.title ?? ''))
  for (const row of targets) {
    await call(token, 'DELETE', `/api/desktopRoutes:destroy?filterByTk=${row.id}`)
    console.log(`nocobase-n13: page "${row.title}" (route ${row.id}) deleted for rebuild`)
  }
  if (targets.length === 0) console.log('nocobase-n13: no broken pages left (kept)')
}

/** Replay the module scripts so their menus/pages/blocks come back with unique wire keys. */
function replayModuleScripts(): void {
  for (const script of ['nocobase-crm-modules.mts', 'nocobase-hub-modules.mts']) {
    const result = spawnSync('pnpm', ['exec', 'tsx', join(here, script)], { stdio: 'inherit' })
    if (result.status !== 0) throw new Error(`replay ${script} exited ${result.status}`)
  }
}

/**
 * Ensure the "AI 工作台" v2 page exists and carries the embedded AI chat box.
 *
 * v2 flowPage wire (dumped from the hand-built page this script replaces):
 * desktopRoutes flowPage row + tabs child, then flowModels: route RouteModel,
 * tab RouteModel, RootPageModel (subKey page), BlockGridModel (subKey grid),
 * and under the grid an AIChatBoxBlockModel + AIChatBoxCoreModel pair plus a
 * bare hub_tk_tickets TableBlockModel. On a v2 page the plugin-ai ChatButton
 * floating ball renders too (it bails out on v1 pages), which is the
 * admin-side AI employee entry N13 is after.
 */
async function ensureAiWorkbench(token: string): Promise<void> {
  const title = 'AI 工作台'
  const routes = await dataOf(token, 'GET', '/api/desktopRoutes:list?pageSize=400') as Array<{ id: number, title: string | null, type: string, schemaUid: string | null, sort: number | null }> | null
  let page = (routes ?? []).find(row => row.title === title && row.type === 'flowPage')
  const routeUid = page?.schemaUid ?? `n13ai${nodeKey()}`
  if (page === undefined) {
    page = await dataOf(token, 'POST', '/api/desktopRoutes:create', { title, type: 'flowPage', schemaUid: routeUid, sort: 2 })
    console.log(`nocobase-n13: AI workbench page created (${baseUrl}/admin/${routeUid})`)
  } else {
    console.log(`nocobase-n13: AI workbench page exists (kept)`)
  }
  // Pin the menu position right after 专家数据 regardless of creation order.
  if (page.sort !== 2) {
    await call(token, 'POST', `/api/desktopRoutes:update?filterByTk=${page.id}`, { sort: 2 })
  }
  const tabs = (routes ?? []).filter(row => row.type === 'tabs' && row.parentId === page.id)
  const tabUid = tabs[0]?.schemaUid ?? `n13tab${nodeKey()}`
  if (tabs.length === 0) {
    await dataOf(token, 'POST', '/api/desktopRoutes:create', { title: '', type: 'tabs', parentId: page.id, schemaUid: tabUid, tabSchemaName: `n13tabsch${nodeKey()}` })
  }
  // A page model under the route means the layout was wired already (the
  // hand-built page or a previous run); block creation only happens for a
  // genuinely fresh page so replays never stack duplicate chat boxes.
  const existingPage = await dataOf(token, 'GET', `/api/flowModels:findOne?parentId=${routeUid}&subKey=page`)
  if (existingPage !== null) {
    console.log('nocobase-n13: AI workbench flow layout exists (kept)')
    return
  }
  const save = (model: Record<string, unknown>) => dataOf(token, 'POST', '/api/flowModels:save', model)
  await save({ uid: routeUid, schema: { use: 'RouteModel' } })
  await save({ uid: tabUid, schema: { use: 'RouteModel' } })
  const pageUid = `n13pg${nodeKey()}`
  await save({ uid: pageUid, parentId: routeUid, subKey: 'page', subType: 'object', use: 'RootPageModel' })
  const gridUid = `n13gr${nodeKey()}`
  await save({ uid: gridUid, parentId: tabUid, subKey: 'grid', subType: 'object', use: 'BlockGridModel', props: {}, filterManager: [] })
  const chatUid = `n13cb${nodeKey()}`
  await save({
    uid: chatUid, use: 'AIChatBoxBlockModel', parentId: gridUid, subKey: 'items', subType: 'array', sortIndex: 1,
    props: {
      minWidth: 400, height: 650, scope: chatUid, systemPrompt: '', defaultUserMessage: '', workContext: [],
      allowedAIEmployees: [], allowedModels: [], senderPlaceholder: 'Enter your question', showMessages: true,
      showContextSelector: true, showUpload: true, showWebSearch: true, showEmployeeSelect: true,
      showModelSelect: true, showDisclaimer: true,
    },
  })
  await save({ uid: `n13cc${nodeKey()}`, use: 'AIChatBoxCoreModel', parentId: chatUid, subKey: 'items', subType: 'array', props: {} })
  const tableUid = `n13tb${nodeKey()}`
  await save({
    uid: tableUid, use: 'TableBlockModel', parentId: gridUid, subKey: 'items', subType: 'array', sortIndex: 2,
    stepParams: { resourceSettings: { init: { dataSourceKey: 'main', collectionName: 'hub_tk_tickets' } } }, props: {},
  })
  // Ticket table columns in the official dual shape: the TableColumnModel
  // plus its Display*FieldModel child on subKey `field` (the pair the UI
  // editor saves). stepParams.tableColumnSettings.model alone restores cell
  // values (N14); the child model keeps replayed pages byte-identical to
  // hand-configured ones.
  const column = async (uid: string, field: string, title: string, model: string, sortIndex: number, enumOptions?: object[]) => {
    await save({
      uid, use: 'TableColumnModel', parentId: tableUid, subKey: 'columns', subType: 'array', sortIndex,
      stepParams: {
        fieldSettings: { init: { dataSourceKey: 'main', collectionName: 'hub_tk_tickets', fieldPath: field } },
        tableColumnSettings: { model: { use: model } },
      },
      props: { title, dataIndex: field, width: 150, editable: false, sorter: false, fixed: 'none', ...(enumOptions === undefined ? {} : { options: enumOptions }) },
    })
    await save({
      uid: `${uid}f`, use: model, parentId: uid, subKey: 'field', subType: 'object', sortIndex: 0,
      stepParams: { popupSettings: { openView: { collectionName: 'hub_tk_tickets', dataSourceKey: 'main' } } },
      props: { displayStyle: 'text', overflowMode: 'ellipsis', clickToOpen: false, displayCopyButton: false, ...(enumOptions === undefined ? {} : { options: enumOptions }) },
    })
  }
  const ticketStatus = [
    { value: 'new', label: '新建', color: 'default' }, { value: 'assigned', label: '已指派', color: 'blue' },
    { value: 'waiting_customer', label: '待客户', color: 'orange' }, { value: 'waiting_internal', label: '待内部', color: 'purple' },
    { value: 'in_progress', label: '处理中', color: 'cyan' }, { value: 'resolved', label: '已解决', color: 'green' },
    { value: 'closed', label: '已关闭', color: 'default' }, { value: 'reopened', label: '重开', color: 'red' },
  ]
  const ticketPriority = [
    { value: 'low', label: '低', color: 'default' }, { value: 'medium', label: '中', color: 'blue' },
    { value: 'high', label: '高', color: 'orange' }, { value: 'urgent', label: '紧急', color: 'red' },
  ]
  await column('n13wkt', 'title', '工单标题', 'DisplayTextFieldModel', 1)
  await column('n13wks', 'status', '状态', 'DisplayEnumFieldModel', 2, ticketStatus)
  await column('n13wkp', 'priority', '优先级', 'DisplayEnumFieldModel', 3, ticketPriority)
  console.log('nocobase-n13: AI workbench flow layout created (chat box + tickets table + floating ball)')
}

/**
 * Drop the orphaned flowModels left behind by the deleted N13 test page:
 * its desktopRoutes row was destroyed, but the flowModels rows (table +
 * columns) survived detached from every route. findOne answers 204 with a
 * null slot for a missing uid, so absent models skip silently.
 */
const ORPHAN_EXPERIMENT_MODELS: ReadonlyArray<string> = ['n13testtbl001', 'n13testc2_name', 'n13testc2_company']

async function cleanupExperimentModels(token: string): Promise<void> {
  let removed = 0
  for (const uid of ORPHAN_EXPERIMENT_MODELS) {
    const found = await dataOf(token, 'GET', `/api/flowModels:findOne?uid=${uid}`)
    if (found === null) continue
    await call(token, 'POST', `/api/flowModels:destroy?filterByTk=${uid}`)
    removed += 1
  }
  console.log(`nocobase-n13: orphan experiment models ${removed > 0 ? `${removed} removed` : 'none left (kept)'}`)
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

async function main(): Promise<void> {
  const rebuild = process.argv.includes('--rebuild')
  const token = await signInWithRetry()
  if (rebuild) {
    await deletePages(token)
    replayModuleScripts()
  } else {
    console.log('nocobase-n13: rebuild skipped (pass --rebuild to delete and replay the module pages)')
  }
  // Re-sign-in: the replayed scripts share nothing with this process.
  const token2 = await signInWithRetry()
  await cleanupExperimentModels(token2)
  await ensureAiWorkbench(token2)
  console.log('nocobase-n13: done')
}

await main()
