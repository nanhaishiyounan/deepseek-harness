/**
 * Shared NocoBase flow-page plumbing for the F-series upgrade scripts
 * (f1/f2/f3/f4): HTTP call/sign-in with exponential backoff, fail-closed
 * list endpoints, disk rollback records, and the pure completeness
 * predicates the kept-page spine checks and the keyless spec share.
 *
 * Pure functions take plain rows/routes snapshots so tests can drive them
 * with fixtures; the network wrappers stay thin and are never imported by
 * specs directly.
 */

import { readFileSync, writeFileSync } from 'node:fs'

export type RouteRow = {
  id: number
  title: string | null
  parentId: number | null
  type: string
  schemaUid: string | null
  icon?: string | null
  sort?: number | null
  tabSchemaName?: string | null
}

export type FlowModelRow = Record<string, any>

/** One destroyed v1 page row plus its tabs children (E3 orphan-tab shadowing trap: they must be restored too). */
export type RollbackRecord = {
  title: string
  parentId: number | null
  icon: string | null
  sort: number | null
  schemaUid: string | null
  tabs?: Array<{ schemaUid: string | null, tabSchemaName: string | null, sort: number | null }>
  destroyedId?: number
}

const baseUrl = process.env.NOCOBASE_BASE_URL ?? 'http://127.0.0.1:13000'
const rootEmail = process.env.NOCOBASE_ROOT_EMAIL ?? 'admin@nocobase.com'
const rootPassword = process.env.NOCOBASE_ROOT_PASSWORD ?? 'admin123'

/** Per-request timeout; a hung NocoBase or proxy must abort, not hang the script forever. Override: NOCOBASE_TIMEOUT_MS (positive integer milliseconds). */
const rawTimeoutMs = Number(process.env.NOCOBASE_TIMEOUT_MS ?? 30_000)
if (!Number.isInteger(rawTimeoutMs) || rawTimeoutMs <= 0) {
  throw new Error(`NOCOBASE_TIMEOUT_MS 必须为正整数毫秒，当前值 ${process.env.NOCOBASE_TIMEOUT_MS ?? '(未设置，默认 30000)'}（解析为 ${rawTimeoutMs}）`)
}
export const requestTimeoutMs = rawTimeoutMs

export async function call(token: string, method: 'GET' | 'POST' | 'DELETE', path: string, body?: unknown): Promise<any> {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: { authorization: `Bearer ${token}`, ...(body === undefined ? {} : { 'content-type': 'application/json' }) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(requestTimeoutMs),
  }).catch((error: unknown) => {
    if (error instanceof Error && error.name === 'TimeoutError') {
      throw new Error(`${method} ${path} -> timed out after ${requestTimeoutMs}ms (set NOCOBASE_TIMEOUT_MS to override)`)
    }
    throw error
  })
  const payload = await response.json().catch(() => null)
  if (!response.ok) {
    throw new Error(`${method} ${path} -> HTTP ${response.status}: ${JSON.stringify(payload).slice(0, 300)}`)
  }
  return payload
}

export async function dataOf(token: string, method: 'GET' | 'POST' | 'DELETE', path: string, body?: unknown): Promise<any> {
  const payload = await call(token, method, path, body)
  return payload?.data ?? null
}

async function signIn(): Promise<string> {
  const payload = await call('', 'POST', '/api/auth:signIn', { account: rootEmail, password: rootPassword })
  const token = payload?.data?.token
  if (typeof token !== 'string' || token.length === 0) throw new Error(`sign-in as ${rootEmail} returned no token`)
  return token
}

/** Exponential backoff between attempts (1s, 2s, 4s, ... capped at 30s). */
export const backoffDelayMs = (attempt: number): number => Math.min(1000 * 2 ** attempt, 30_000)

/**
 * Sign in with retry; NocoBase resets connections briefly after heavy
 * schema writes. Attempts are spaced by {@link backoffDelayMs}.
 */
export async function signInWithRetry(attempts = 4): Promise<string> {
  let lastError: unknown
  for (let attempt = 0; attempt < attempts; attempt++) {
    if (attempt > 0) await new Promise(resolve => setTimeout(resolve, backoffDelayMs(attempt - 1)))
    try {
      return await signIn()
    } catch (error) {
      lastError = error
    }
  }
  throw lastError
}

/**
 * List all flowModels rows, refusing to continue when the page size was
 * exceeded: a truncated list would make the kept-tree check and the orphan
 * sweep silently miss rows. Raise pageSize here when the catalog grows.
 */
export async function listFlowModels(token: string, label: string): Promise<FlowModelRow[]> {
  // W3-B2 pushed the catalog past 6000 rows (17 edit forms + 12 subtable
  // blocks + jump actions); keep headroom for later batches.
  const pageSize = 12000
  const payload = await call(token, 'GET', `/api/flowModels:list?pageSize=${pageSize}`)
  const rows = (payload?.data ?? null) as FlowModelRow[] | null
  if (rows === null) return []
  const total = payload?.meta?.total
  if (typeof total === 'number' ? total > rows.length : rows.length === pageSize) {
    throw new Error(`flowModels:list returned ${rows.length} of ${total} rows (pageSize=${pageSize}); raise the page size or paginate before running ${label}`)
  }
  return rows
}

export async function listRoutes(token: string, label: string): Promise<RouteRow[]> {
  const pageSize = 400
  const payload = await call(token, 'GET', `/api/desktopRoutes:list?pageSize=${pageSize}`)
  const routes = (payload?.data ?? null) as RouteRow[] | null
  if (routes === null) return []
  const total = payload?.meta?.total
  if (typeof total === 'number' && total > routes.length) {
    throw new Error(`desktopRoutes:list returned ${routes.length} of ${total} rows (pageSize=${pageSize}); raise the page size before running ${label}`)
  }
  return routes
}

export function loadRollbackRecords(rollbackPath: string): RollbackRecord[] {
  try {
    return JSON.parse(readFileSync(rollbackPath, 'utf8')) as RollbackRecord[]
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code
    if (code === 'ENOENT') return []
    throw new Error(`rollback record at ${rollbackPath} is unreadable (${String(error)}); fix or delete it before re-running`)
  }
}

/** Merge one v1 page row (by title) into the on-disk rollback records, flushed before every destroy. */
export function writeRollbackRecord(rollbackPath: string, record: RollbackRecord): void {
  const records = loadRollbackRecords(rollbackPath)
  const index = records.findIndex(row => row.title === record.title)
  if (index >= 0) records.splice(index, 1, record)
  else records.push(record)
  writeFileSync(rollbackPath, `${JSON.stringify(records, null, 2)}\n`)
}

const nodeKey = (): string => Math.random().toString(36).slice(2, 13)

/** Deterministic-prefix uid for flowModels:save, e.g. withN17Prefix('n17f2', 'tb') -> 'n17f2tb<x11>'. */
export const withN17Prefix = (prefix: string, tag: string): string => `${prefix}${tag}${nodeKey()}`

const collectionOf = (row: FlowModelRow): string | undefined => row?.stepParams?.resourceSettings?.init?.collectionName

/**
 * Batch-scoped candidate rows: `use` and collection match, and the uid
 * carries this batch's prefix. The prefix rules out other batches' blocks
 * on the same collection (E1/N17 vs F1/F2/F3 share crm_customers and
 * hub_pj_tasks, so a bare collection match would count a sibling batch's
 * block as this page's).
 */
export function batchScopedRows(
  rows: ReadonlyArray<FlowModelRow>,
  filter: { use: string, collection: string, uidPrefix: string },
): FlowModelRow[] {
  return rows.filter(row => row?.use === filter.use && collectionOf(row) === filter.collection
    && String(row.uid ?? '').startsWith(filter.uidPrefix))
}

/**
 * Map every grid row to the schemaUid of the flowPage route that owns it.
 * Each page's BlockGridModel is saved with parentId = the page's tabs route
 * row schemaUid, so the grid → tab → flowPage chain is walkable from a list
 * snapshot (deep popup nodes lack parentId rows and must go through
 * findOne instead).
 */
export function gridOwnerRoutes(rows: ReadonlyArray<FlowModelRow>, routes: ReadonlyArray<RouteRow>): Map<string, string> {
  const tabToFlowSchemaUid = new Map<string, string>()
  const flowById = new Map(routes.map(route => [route.id, route]))
  for (const route of routes) {
    if (route.type !== 'tabs' || route.schemaUid == null) continue
    const flow = flowById.get(route.parentId ?? Number.NaN)
    if (flow?.type === 'flowPage') tabToFlowSchemaUid.set(route.schemaUid, flow.schemaUid ?? '')
  }
  const owners = new Map<string, string>()
  for (const row of rows) {
    if (row?.use !== 'BlockGridModel') continue
    const owner = tabToFlowSchemaUid.get(String(row.parentId ?? ''))
    if (owner !== undefined) owners.set(String(row.uid), owner)
  }
  return owners
}

/**
 * Whether one block row sits inside the page's own tree: its parent grid is
 * owned by the flowPage route with `routeSchemaUid`. Used together with
 * {@link batchScopedRows} — the prefix rules out other batches, the
 * ownership rules out same-batch pages sharing the collection (回款 and
 * 销售仪表盘 are both crm_payments with n17f2 uids).
 */
export function blockOwnedByPage(row: FlowModelRow, gridOwners: ReadonlyMap<string, string>, routeSchemaUid: string): boolean {
  return gridOwners.get(String(row.parentId ?? '')) === routeSchemaUid
}

/** Descend a popup page tree (findOne?subKey=page payload) to its CreateFormModel, if present. */
export function popupCreateForm(popupTree: any): { uid: string } | undefined {
  const tabs = popupTree?.subModels?.tabs
  const tabList = Array.isArray(tabs) ? tabs : tabs === undefined ? [] : [tabs]
  for (const tab of tabList) {
    const items = tab?.subModels?.grid?.subModels?.items
    const itemList = Array.isArray(items) ? items : items === undefined ? [] : [items]
    for (const item of itemList) {
      if (item?.use === 'CreateFormModel' && typeof item.uid === 'string') return { uid: item.uid }
    }
  }
  return undefined
}

// ─── W3-B1 row-detail wire (the load-only contract) ───

/**
 * One field in a row-detail drawer: the column's fieldPath plus the display
 * model its table column already renders with (and the enum options when the
 * column carries them), so the drawer mirrors the table exactly.
 */
export type DetailFieldSpec = {
  fieldPath: string
  modelUse: string
  options?: object[]
}

/** uid for W3-B1 row-detail rows; the `w3b1` prefix is the --rollback w3b1 anchor. */
export const withW3b1Prefix = (tag: string): string => `w3b1${tag}${nodeKey()}`

/**
 * The openView payload every row view action must carry in full: mode, size,
 * pageModelClass, collectionName, dataSourceKey, plus the record-scoped
 * filterByTk. The 7f141 remnant (collectionName+dataSourceKey only, no
 * persisted page subtree) is the proven shape of the empty drawer (P0 §2).
 */
export function rowDetailOpenView(collection: string): Record<string, unknown> {
  return {
    mode: 'drawer',
    size: 'medium',
    pageModelClass: 'ChildPageModel',
    collectionName: collection,
    dataSourceKey: 'main',
    filterByTk: '{{ctx.record.id}}',
  }
}

/**
 * The persisted drawer page subtree under one row/card view action — f1's
 * production-proven drawerPageTree() parameterized: ChildPageModel →
 * ChildPageTabModel(tabTitle) → BlockGridModel → DetailsBlockModel(vertical,
 * colon) → DetailsGridModel(layout rows bound to item uids) → DetailsItemModel×N
 * (fieldSettings.fieldPath) → the per-field display model. Record-scoped
 * drawers take the FlowPage load-only path (the client never synthesizes a
 * default page for them), so without this subtree the drawer opens empty
 * (findOne?subKey=page 204s and no <collection>:get fires).
 *
 * `uidPrefix` re-scopes the generated uids (default `w3b1`); W3-B2 passes
 * {@link withW3b2Prefix} for the nested subtable-row drawers so the whole
 * B2 surface rolls back under one `--rollback w3b2` anchor.
 */
export function drawerPageTreeFor(
  actionUid: string,
  spec: {
    collection: string
    fields: ReadonlyArray<DetailFieldSpec>
    tabTitle: string
    /** W3-B2: parallel subtable blocks appended after the main DetailsBlock (a full-tree rewrite, see {@link subtableBlockNode}). */
    children?: ReadonlyArray<SubtableSpec>
    uidPrefix?: (tag: string) => string
  },
): Record<string, unknown> {
  const { collection, fields, tabTitle } = spec
  const uid = spec.uidPrefix ?? withW3b1Prefix
  const itemUids = fields.map(() => uid('dwi'))
  const layoutRows = itemUids.map((itemUid, index) => ({
    id: `r${index}`,
    cells: [{ id: `r${index}:cell:0`, items: [itemUid] }],
    sizes: [24],
  }))
  const children = spec.children === undefined ? [] : spec.children.map((sub, index) => subtableBlockNode(sub, index + 2))
  return {
    uid: uid('dwp'), parentId: actionUid, subKey: 'page', subType: 'object', use: 'ChildPageModel', props: {},
    stepParams: { pageSettings: { general: { displayTitle: false, enableTabs: true } } },
    subModels: {
      tabs: [{
        use: 'ChildPageTabModel', subKey: 'tabs', subType: 'array', sortIndex: 0, props: {},
        stepParams: { pageTabSettings: { tab: { title: tabTitle } } },
        subModels: {
          grid: {
            use: 'BlockGridModel', subKey: 'grid', subType: 'object', sortIndex: 0, props: {}, filterManager: [],
            subModels: {
              items: [{
                use: 'DetailsBlockModel', subKey: 'items', subType: 'array', sortIndex: 1, props: {},
                stepParams: {
                  // filterByTk binds the drawer to the clicked row: without it
                  // DetailsBlockModel.createResource builds a MultiRecordResource
                  // (pageSize 1) and every drawer renders the collection's first
                  // record with a 1/N pager — the unscoped-drawer defect found
                  // live during the W3-B3 planner journey (it affected every
                  // B1/B2 drawer, table rows and kanban cards alike).
                  resourceSettings: { init: { dataSourceKey: 'main', collectionName: collection, filterByTk: '{{ctx.view.inputArgs.filterByTk}}' } },
                  detailsSettings: { layout: { layout: 'vertical', colon: true } },
                },
                subModels: {
                  grid: {
                    use: 'DetailsGridModel', subKey: 'grid', subType: 'object', sortIndex: 1,
                    props: { layout: { version: 2, rows: layoutRows, rowGap: 0, colGap: 8, sizes: {}, rowOrder: layoutRows.map(row => row.id) } },
                    stepParams: { gridSettings: { grid: { layout: { version: 2, rows: layoutRows } } } },
                    subModels: {
                      items: fields.map((field, index) => ({
                        uid: itemUids[index], use: 'DetailsItemModel', subKey: 'items', subType: 'array', sortIndex: index + 1, props: {},
                        stepParams: {
                          fieldSettings: { init: { dataSourceKey: 'main', collectionName: collection, fieldPath: field.fieldPath } },
                          detailItemSettings: { showLabel: { showLabel: true } },
                        },
                        subModels: {
                          field: {
                            use: field.modelUse, subKey: 'field', subType: 'object', sortIndex: 1,
                            props: field.options === undefined ? {} : { options: field.options },
                            stepParams: { fieldSettings: { init: { dataSourceKey: 'main', collectionName: collection, fieldPath: field.fieldPath } } },
                          },
                        },
                      })),
                    },
                  },
                },
              }, ...children],
            },
          },
        },
      }],
    },
  }
}

/**
 * Save one ViewActionModel under an existing table actions column with the
 * full openView payload and the persisted drawer page subtree in a single
 * flowModels:save (the AddNew wire shape). Use after destroying a broken
 * view action, or via {@link ensureTableRowDetail} for the full triple.
 *
 * @param token root auth token
 * @param actionsColumnUid uid of the TableActionsColumnModel the action hangs under
 * @param spec collection, drawer fields, and the drawer tab title
 * @returns the new view action uid
 */
export async function saveRowViewAction(
  token: string,
  actionsColumnUid: string,
  spec: { collection: string, fields: ReadonlyArray<DetailFieldSpec>, tabTitle: string },
): Promise<string> {
  const actionUid = withW3b1Prefix('va')
  await dataOf(token, 'POST', '/api/flowModels:save', {
    uid: actionUid, parentId: actionsColumnUid, subKey: 'actions', subType: 'array', sortIndex: 1,
    use: 'ViewActionModel', props: {},
    stepParams: {
      popupSettings: { openView: rowDetailOpenView(spec.collection) },
      buttonSettings: { general: { type: 'link', icon: null, iconOnly: false } },
    },
    subModels: { page: drawerPageTreeFor(actionUid, spec) },
  })
  return actionUid
}

/**
 * Wire one table block for row details: a trailing TableActionsColumnModel
 * (the daad6 shape with fresh w3b1 uids) plus the view action with its
 * persisted drawer subtree. Not idempotent by itself — callers that may
 * re-run must check for an existing actions column first (the heal script
 * does; factory call sites run on fresh table uids only).
 *
 * @param token root auth token
 * @param tableUid uid of the TableBlockModel to wire
 * @param spec collection, drawer fields, tab title, and the trailing sortIndex for the actions column
 */
export async function ensureTableRowDetail(
  token: string,
  tableUid: string,
  spec: {
    collection: string
    fields: ReadonlyArray<DetailFieldSpec>
    tabTitle: string
    actionsColumnSortIndex: number
  },
): Promise<void> {
  const columnUid = withW3b1Prefix('tac')
  await dataOf(token, 'POST', '/api/flowModels:save', {
    uid: columnUid, use: 'TableActionsColumnModel', parentId: tableUid, subKey: 'columns', subType: 'array',
    sortIndex: spec.actionsColumnSortIndex,
    props: { title: '操作', width: 150, fixed: 'none' },
    stepParams: { tableColumnSettings: { title: { title: '{{t("Actions")}}' } } },
  })
  await saveRowViewAction(token, columnUid, { collection: spec.collection, fields: spec.fields, tabTitle: spec.tabTitle })
}

// ─── W3-B2 subtable drill-down + guarded row actions ───

/** uid for W3-B2 rows; the `w3b2` prefix is the --rollback w3b2 anchor. */
export const withW3b2Prefix = (tag: string): string => `w3b2${tag}${nodeKey()}`

/**
 * wfl doc_type → business-page route for the approval jump (B2 §3). The
 * routes are the live flowPage schemaUids (desktopRoutes 2026-09-27); adding
 * a flow config for a new doc_type means adding one line here plus a heal
 * re-run. hub_po_purchase_orders deliberately has no entry — the hub legacy
 * page is not a jump target.
 */
export const APPROVAL_JUMP_ROUTES: Readonly<Record<string, string>> = {
  pur_orders: '/admin/w3puryzkva06iuhh',
  pur_requests: '/admin/w3pura0kyqfx4f9',
  pur_rfqs: '/admin/w3purlvif0v23bun',
  pur_payments: '/admin/w3pur3an4pwnr1eo',
  so_orders: '/admin/w7mrp4w590rm0ws8',
  mps_plans: '/admin/w7mrpyru4s708nwn',
  mfg_orders: '/admin/w5mfgntyu7wy20a',
  srm_suppliers: '/admin/h4srm2u9xiqx09jb',
  wms_counts: '/admin/h5wms2hmkvlfsmtf',
  qm_nc_dispositions: '/admin/w8qm472nluqt32x',
  qm_inspections: '/admin/w8qmjvyv8p5j7j',
}

/** The approval-center page route (the business-row side of the jump). */
export const APPROVAL_CENTER_ROUTE = '/admin/w1w167h6joi0ck6'

/**
 * One child collection rendered as a parallel table block inside the parent
 * row-detail drawer's BlockGrid (D3: no dedicated "association block" model
 * exists — the wire is a second TableBlockModel whose resourceSettings.init
 * carries the parent hasMany association plus a drawer-scoped sourceId, the
 * shape the kanban associated-records contract proves). The association field
 * must already exist on the parent collection; {@link ensureParentHasMany}
 * creates it.
 */
export type SubtableSpec = {
  collection: string
  /** `<parentCollection>.<hasMany field>` on the parent collection. */
  association: string
  title: string
  columns: ReadonlyArray<DetailFieldSpec & { title?: string }>
}

/** One editable field in a W3-B2 row EditActionModel popup (edit model chosen by the caller). */
export type EditFieldSpec = { name: string, title: string, modelUse: string, options?: object[] }

/**
 * The nested subtable block node placed parallel to the drawer's main
 * DetailsBlock inside {@link drawerPageTreeFor}'s grid items:
 * TableBlockModel(association-bound) → TableColumnModel×N + trailing
 * TableActionsColumnModel with its own ViewActionModel and persisted row
 * drawer (the two-level drill-down). Deep nodes of a nested save live only
 * inside the parent tree (they never appear as flat flowModels rows), so the
 * subtable rides the same whole-tree save as the Details block — a B2 pass
 * rewrites the drawer tree with children, it never saves the block alone.
 * Node uids carry the w3b2 prefix for traceability, but rollback of an
 * embedded block means re-running the heal without children (the tree
 * rewrite), not a prefix destroy.
 *
 * @param sub child collection, association, title, and columns
 * @param sortIndex position among the grid items (after the main DetailsBlock)
 */
export function subtableBlockNode(sub: SubtableSpec, sortIndex: number): Record<string, unknown> {
  const blockUid = withW3b2Prefix('stb')
  const actionsColumnUid = withW3b2Prefix('stac')
  const viewActionUid = withW3b2Prefix('sva')
  const columns = sub.columns.map((column, index) => {
    const columnUid = withW3b2Prefix('stc')
    const options = column.options === undefined ? {} : { options: column.options }
    return {
      uid: columnUid, subKey: 'columns', subType: 'array', sortIndex: index + 1,
      use: 'TableColumnModel',
      props: { title: column.title ?? column.fieldPath, dataIndex: column.fieldPath, width: 150, editable: false, sorter: false, fixed: 'none', ...options },
      stepParams: {
        fieldSettings: { init: { dataSourceKey: 'main', collectionName: sub.collection, fieldPath: column.fieldPath } },
        tableColumnSettings: { model: { use: column.modelUse } },
      },
      subModels: {
        field: {
          uid: withW3b2Prefix('stf'), subKey: 'field', subType: 'object', sortIndex: 0,
          use: column.modelUse,
          props: { displayStyle: 'text', overflowMode: 'ellipsis', clickToOpen: false, displayCopyButton: false, ...options },
          stepParams: { popupSettings: { openView: { collectionName: sub.collection, dataSourceKey: 'main' } } },
        },
      },
    }
  })
  return {
    uid: blockUid, subKey: 'items', subType: 'array', sortIndex,
    use: 'TableBlockModel', props: { title: sub.title },
    stepParams: {
      resourceSettings: {
        init: {
          dataSourceKey: 'main', collectionName: sub.collection,
          associationName: sub.association,
          sourceId: '{{ctx.view.inputArgs.filterByTk}}',
        },
      },
    },
    subModels: {
      columns: [
        ...columns,
        {
          uid: actionsColumnUid, subKey: 'columns', subType: 'array', sortIndex: sub.columns.length + 1,
          use: 'TableActionsColumnModel',
          props: { title: '操作', width: 150, fixed: 'none' },
          stepParams: { tableColumnSettings: { title: { title: '{{t("Actions")}}' } } },
          subModels: {
            actions: [{
              uid: viewActionUid, subKey: 'actions', subType: 'array', sortIndex: 1,
              use: 'ViewActionModel', props: {},
              stepParams: {
                popupSettings: { openView: rowDetailOpenView(sub.collection) },
                buttonSettings: { general: { type: 'link', icon: null, iconOnly: false } },
              },
              subModels: {
                page: drawerPageTreeFor(viewActionUid, {
                  collection: sub.collection, fields: sub.columns, tabTitle: '行详情', uidPrefix: withW3b2Prefix,
                }),
              },
            }],
          },
        },
      ],
    },
  }
}

/**
 * The EditActionModel's persisted popup subtree: ChildPageModel → tab →
 * BlockGridModel → EditFormModel(filterByTk bound to the drawer's record) →
 * FormGridModel(FormItemModel×N, edit models) + FormSubmitActionModel.
 * The caller has already excluded engine-owned state fields from `fields`
 * (the W3 invariant-1 blacklist) — this function renders exactly what it is
 * given.
 */
function editPageTreeFor(actionUid: string, spec: { collection: string, fields: ReadonlyArray<EditFieldSpec> }): Record<string, unknown> {
  const formUid = withW3b2Prefix('efm')
  const itemUids = spec.fields.map(() => withW3b2Prefix('efi'))
  const layoutRows = itemUids.map((itemUid, index) => ({
    id: `r${index}`,
    cells: [{ id: `r${index}:cell:0`, items: [itemUid] }],
    sizes: [24],
  }))
  return {
    uid: withW3b2Prefix('ewp'), parentId: actionUid, subKey: 'page', subType: 'object', use: 'ChildPageModel', props: {},
    stepParams: { pageSettings: { general: { displayTitle: false, enableTabs: true } } },
    subModels: {
      tabs: [{
        use: 'ChildPageTabModel', subKey: 'tabs', subType: 'array', sortIndex: 0, props: {},
        stepParams: { pageTabSettings: { tab: { title: '编辑' } } },
        subModels: {
          grid: {
            use: 'BlockGridModel', subKey: 'grid', subType: 'object', sortIndex: 0, props: {}, filterManager: [],
            subModels: {
              items: [{
                uid: formUid, use: 'EditFormModel', subKey: 'items', subType: 'array', sortIndex: 1, props: {},
                stepParams: { resourceSettings: { init: { dataSourceKey: 'main', collectionName: spec.collection, filterByTk: '{{ctx.view.inputArgs.filterByTk}}' } } },
                subModels: {
                  grid: {
                    use: 'FormGridModel', subKey: 'grid', subType: 'object', sortIndex: 0,
                    props: { layout: { version: 2, rows: layoutRows, rowGap: 0, colGap: 16, sizes: {}, rowOrder: layoutRows.map(row => row.id) } },
                    stepParams: { gridSettings: { grid: { layout: { version: 2, rows: layoutRows } } } },
                    subModels: {
                      items: spec.fields.map((field, index) => ({
                        uid: itemUids[index], use: 'FormItemModel', subKey: 'items', subType: 'array', sortIndex: index + 1, props: {},
                        stepParams: { fieldSettings: { init: { dataSourceKey: 'main', collectionName: spec.collection, fieldPath: field.name } } },
                        subModels: {
                          field: {
                            uid: withW3b2Prefix('eff'), use: field.modelUse, subKey: 'field', subType: 'object', sortIndex: 0,
                            props: field.options === undefined || field.options.length === 0 ? {} : { allowClear: true, options: field.options },
                          },
                        },
                      })),
                    },
                  },
                  actions: [{
                    uid: withW3b2Prefix('efs'), parentId: formUid, subKey: 'actions', subType: 'array', sortIndex: 1,
                    use: 'FormSubmitActionModel', props: { type: 'primary' },
                    stepParams: { buttonSettings: { general: { title: '保存', type: 'primary' } } },
                  }],
                },
              }],
            },
          },
        },
      }],
    },
  }
}

/**
 * Save one EditActionModel under a table actions column with the full
 * openView payload and the persisted edit-form popup subtree. Engine-owned
 * state fields must already be filtered out of `fields` by the caller
 * (invariant 1: state transitions only ride the wfl/engine verbs).
 *
 * @param token root auth token
 * @param actionsColumnUid uid of the TableActionsColumnModel the action hangs under
 * @param spec collection and the editable (already de-blacklisted) fields
 * @returns the new edit action uid
 */
export async function saveRowEditAction(
  token: string,
  actionsColumnUid: string,
  spec: { collection: string, fields: ReadonlyArray<EditFieldSpec> },
): Promise<string> {
  const actionUid = withW3b2Prefix('ea')
  await dataOf(token, 'POST', '/api/flowModels:save', {
    uid: actionUid, parentId: actionsColumnUid, subKey: 'actions', subType: 'array', sortIndex: 2,
    use: 'EditActionModel', props: { title: '编辑' },
    stepParams: {
      popupSettings: { openView: rowDetailOpenView(spec.collection) },
      buttonSettings: { general: { title: '编辑', type: 'link', icon: null, iconOnly: false } },
    },
    subModels: { page: editPageTreeFor(actionUid, spec) },
  })
  return actionUid
}

/**
 * Save one DeleteActionModel with the mandatory confirmation dialog (the
 * builder's official deleteSettings.confirm shape). Only free-state
 * collections may carry it — engine-governed documents never get a Delete
 * entry (their lifecycle rides the engine verbs).
 *
 * @param token root auth token
 * @param actionsColumnUid uid of the TableActionsColumnModel the action hangs under
 * @param title button label (defaults to 删除)
 * @returns the new delete action uid
 */
export async function saveRowDeleteAction(token: string, actionsColumnUid: string, title = '删除'): Promise<string> {
  const actionUid = withW3b2Prefix('da')
  await dataOf(token, 'POST', '/api/flowModels:save', {
    uid: actionUid, parentId: actionsColumnUid, subKey: 'actions', subType: 'array', sortIndex: 3,
    use: 'DeleteActionModel', props: { title },
    stepParams: {
      buttonSettings: { general: { title, type: 'link', icon: null, iconOnly: false } },
      deleteSettings: { confirm: { enable: true, title: '{{t("Delete record")}}', content: '{{t("Are you sure you want to delete it?")}}' } },
    },
  })
  return actionUid
}

/**
 * Save one JSRecordActionModel that navigates the browser to a page route —
 * the approval-jump wire (审批待办 → business page, business row → 审批中心).
 * `docType` null reads the record's own doc_type/doc_id (the todo shape);
 * a fixed docType rides the row's id. Navigation is the whole action: the
 * engine-governed state itself is never written from the UI (invariant 1).
 *
 * @param token root auth token
 * @param actionsColumnUid uid of the TableActionsColumnModel the action hangs under
 * @param spec title, target path, and how to resolve the document anchor
 * @returns the new jump action uid
 */
export async function saveRowJumpAction(
  token: string,
  actionsColumnUid: string,
  spec: { title: string, path?: string, docTypeMap?: Record<string, string>, docType: string | null, sortIndex: number },
): Promise<string> {
  const anchor = spec.docType === null
    ? `const docType = String(ctx.record?.doc_type || ''); const docId = ctx.record?.doc_id;`
    : `const docType = ${JSON.stringify(spec.docType)}; const docId = ctx.record?.id;`
  const target = spec.path !== undefined
    ? `const path = ${JSON.stringify(spec.path)};`
    : `const map = ${JSON.stringify(spec.docTypeMap ?? {})};\nconst path = map[docType];\nif (!path) throw new Error('未配置跳转映射: ' + docType);`
  const code = [
    anchor,
    target,
    // The gateway serves the console under /nocobase while a direct :13000
    // visit does not — resolve the live prefix from the current pathname.
    `const prefix = window.location.pathname.split('/admin/')[0];`,
    `const params = '?from=w3b2&doc_type=' + encodeURIComponent(docType) + '&doc_id=' + encodeURIComponent(String(docId ?? ''));`,
    `window.location.href = prefix + path + params;`,
  ].join('\n')
  // The runtime reads the code from clickSettings.runJs — the flowSurfaces
  // addRecordAction('js') wire (jsSettings is the JSBlock block contract and
  // leaves a row action dead: it renders, but the click handler never runs).
  const actionUid = withW3b2Prefix('ja')
  await dataOf(token, 'POST', '/api/flowModels:save', {
    uid: actionUid, parentId: actionsColumnUid, subKey: 'actions', subType: 'array', sortIndex: spec.sortIndex,
    use: 'JSRecordActionModel', props: { type: 'link', title: spec.title, icon: null },
    stepParams: {
      buttonSettings: { general: { title: spec.title, icon: null, type: 'link', iconOnly: false } },
      clickSettings: { runJs: { version: 'v2', code } },
    },
  })
  return actionUid
}

/**
 * Ensure the parent collection carries the hasMany field the subtable block's
 * associationName needs (idempotent: an existing field of the same name is
 * kept). The matching belongsTo already lives on the child collection (the
 * domain scripts created it with the FK column), so only the reverse side is
 * registered here.
 *
 * @param token root auth token
 * @param parent parent collection name
 * @param field hasMany field name on the parent
 * @param child child collection name
 * @param foreignKey the FK column on the child (already in the database)
 * @returns whether the field was created on this call
 */
export async function ensureParentHasMany(
  token: string,
  parent: string,
  field: string,
  child: string,
  foreignKey: string,
): Promise<boolean> {
  // The per-field GET 500s on a missing field (a null deref inside NocoBase),
  // so existence rides the collection's fields:list snapshot instead.
  const listed = await dataOf(token, 'GET', `/api/fields:list?pageSize=200&filter=${encodeURIComponent(JSON.stringify({ collectionName: { $eq: parent }, name: { $eq: field } }))}`) as Array<{ name?: string }> | null
  if ((listed ?? []).some(row => row?.name === field)) return false
  await dataOf(token, 'POST', `/api/collections/${parent}/fields:create`, {
    name: field, type: 'hasMany', interface: 'o2m', target: child, foreignKey,
    uiSchema: { type: 'array', 'x-component': 'AssociationField', title: field, 'x-component-props': { multiple: true, fieldNames: { label: 'id', value: 'id' } } },
  })
  return true
}
