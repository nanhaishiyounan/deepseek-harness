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
 * Read-only GET with narrow transport retry: the dev server occasionally
 * drops a keep-alive socket mid-list (ECONNRESET / socket hang up), which
 * must not abort a long catalog walk. Non-2xx responses stay errors — only
 * transport-level failures retry, spaced by {@link backoffDelayMs} like
 * {@link signInWithRetry}.
 */
async function callGetWithRetry(token: string, path: string, attempts = 3): Promise<any> {
  let lastError: unknown
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await call(token, 'GET', path)
    } catch (error) {
      const message = String((error as Error)?.cause ?? error ?? '')
      const transport = /ECONNRESET|socket hang up|EPIPE|ETIMEDOUT|fetch failed/i.test(message)
      if (!transport || attempt === attempts) throw error
      lastError = error
      await new Promise(resolve => setTimeout(resolve, backoffDelayMs(attempt - 1)))
    }
  }
  throw lastError
}

export async function listFlowModels(token: string, label: string): Promise<FlowModelRow[]> {
  // W3-B2 pushed the catalog past 6000 rows (17 edit forms + 12 subtable
  // blocks + jump actions); keep headroom for later batches.
  const pageSize = 12000
  const payload = await callGetWithRetry(token, `/api/flowModels:list?pageSize=${pageSize}`)
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
  spec: { collection: string, fields: ReadonlyArray<EditFieldSpec>, uidPrefix?: (tag: string) => string },
): Promise<string> {
  const actionUid = (spec.uidPrefix ?? withW3b2Prefix)('ea')
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
export async function saveRowDeleteAction(
  token: string,
  actionsColumnUid: string,
  title = '删除',
  uidPrefix: (tag: string) => string = withW3b2Prefix,
): Promise<string> {
  const actionUid = uidPrefix('da')
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
// ─── W4-B1 table-standards heal (five factory functions) ───

/** uid for W4-B1 nodes (FilterForm subtrees, rebound display fields); the `w4b1` prefix is the rollback anchor. */
export const withW4b1Prefix = (tag: string): string => `w4b1${tag}${nodeKey()}`

/** One colored-tag option for a select column, the w3-views PUR_DOC_STATUS shape. */
export type StatusColumnOption = { value: string, label: string, color: string }

/**
 * Normalize `[value, label, color]` triples into DisplayEnumFieldModel
 * props.options entries (the only shape the colored-tag renderer reads).
 */
export function statusColumnOptions(defs: ReadonlyArray<[string, string, string]>): StatusColumnOption[] {
  return defs.map(([value, label, color]) => ({ value, label, color }))
}

/** Column numeric kinds: money (¥ + 2 decimals), qty (0 decimals), plain (2 decimals, no prefix). */
export type NumberColumnKind = 'money' | 'qty' | 'plain'

/**
 * DisplayNumberFieldModel props for one numeric column. `separator` drives the
 * thousand-grouping render (DisplayNumberFieldModel.tsx:141); `numberStep`
 * fixes the decimal places; `addonBefore` renders the currency prefix.
 */
export function numberColumnProps(kind: NumberColumnKind): Record<string, unknown> {
  if (kind === 'money') return { separator: '0,0.00', numberStep: 2, addonBefore: '¥' }
  if (kind === 'qty') return { separator: '0,0' }
  return { separator: '0,0.00', numberStep: 2 }
}

/**
 * DisplayDateTimeFieldModel props: `format` is the resolved render format key
 * (resolveDisplayDateTimeFormat honors an explicit value).
 */
export function dateColumnProps(kind: 'date' | 'datetime'): { format: string } {
  return { format: kind === 'date' ? 'YYYY-MM-DD' : 'YYYY-MM-DD HH:mm' }
}

/**
 * Write a table block's default sort — three redundant, idempotent homes,
 * because the v2 client never applies a persisted sort to the initial list
 * request (verified live: neither props.globalSort, nor the sorted column's
 * antd defaultSortOrder, nor resourceSettings.init.params.sort reaches the
 * first :list query; the official Default-sorting settings panel behaves the
 * same — its value only kicks in on the next interaction via
 * TableBlockModel.tsx:1042-1049):
 * 1. props.globalSort — the interaction fallback the table reads back;
 * 2. resourceSettings.init.params.sort — the server-side semantic marker;
 * 3. the sorted column's sorter/defaultSortOrder — the visible column-header
 *    arrow (T-5' evidence) and the click-to-sort entry.
 * Entries follow the NocoBase sort convention: `['-doc_date']` = desc.
 *
 * @param token root auth token
 * @param tableUid the TableBlockModel uid
 * @param sort sort entries, e.g. ['-doc_date']
 * @param sortColumnUid the TableColumnModel uid of the sort field (skipped when null)
 */
export async function applyTableDefaultSort(
  token: string,
  tableUid: string,
  sort: string[],
  sortColumnUid: string | null,
): Promise<void> {
  const current = await dataOf(token, 'GET', `/api/flowSurfaces:get?uid=${encodeURIComponent(tableUid)}`)
  const row = current?.tree ?? {}
  const before = (row.props ?? {}) as Record<string, unknown>
  const initBefore = ((row.stepParams ?? {}).resourceSettings ?? {}).init as Record<string, unknown> | undefined
  const init = { ...(initBefore ?? {}), params: { ...((initBefore ?? {}).params ?? {}), sort } }
  const stepParamsBefore = (row.stepParams ?? {}) as Record<string, unknown>
  const resourceSettingsBefore = (stepParamsBefore.resourceSettings ?? {}) as Record<string, unknown>
  await dataOf(token, 'POST', '/api/flowModels:save', {
    uid: tableUid,
    ...(row.parentId === undefined ? {} : { parentId: row.parentId }),
    ...(row.subKey === undefined ? {} : { subKey: row.subKey }),
    props: { ...before, globalSort: sort },
    stepParams: { ...stepParamsBefore, resourceSettings: { ...resourceSettingsBefore, init } },
  })
  if (sortColumnUid !== null) {
    const order = sort.some(entry => entry.startsWith('-')) ? 'descend' : 'ascend'
    const column = await dataOf(token, 'GET', `/api/flowSurfaces:get?uid=${encodeURIComponent(sortColumnUid)}`)
    const columnRow = column?.tree ?? {}
    const columnBefore = (columnRow.props ?? {}) as Record<string, unknown>
    await dataOf(token, 'POST', '/api/flowModels:save', {
      uid: sortColumnUid,
      ...(columnRow.parentId === undefined ? {} : { parentId: columnRow.parentId }),
      ...(columnRow.subKey === undefined ? {} : { subKey: columnRow.subKey }),
      props: { ...columnBefore, sorter: true, defaultSortOrder: order },
    })
  }
}

/**
 * Merge display props onto one column's field submodel (separator/format/
 * options). The updateSettings props domain rejects these render keys, so the
 * write rides flowModels:save with the node's current props read back and
 * merged — no sibling key is dropped.
 */
export async function applyColumnDisplayProps(
  token: string,
  fieldUid: string,
  props: Record<string, unknown>,
): Promise<void> {
  const current = await dataOf(token, 'GET', `/api/flowSurfaces:get?uid=${encodeURIComponent(fieldUid)}`)
  const row = current?.tree ?? {}
  const before = (row.props ?? {}) as Record<string, unknown>
  await dataOf(token, 'POST', '/api/flowModels:save', {
    uid: fieldUid,
    ...(row.parentId === undefined ? {} : { parentId: row.parentId }),
    ...(row.subKey === undefined ? {} : { subKey: row.subKey }),
    props: { ...before, ...props },
  })
}

/** The rebuilt field submodel under a table column after a display-model swap. */
export type ColumnFieldRebuild = {
  uid: string
  use: string
  props: Record<string, unknown>
  stepParams: Record<string, unknown>
}

/**
 * Swap a column's field submodel (the titleField.tsx:76-110 beforeParamsSave
 * mechanism, scripted): destroy the old field node(s) first, save the new one
 * with the same parent/subKey, and rewrite the column's model metadata via
 * updateSettings. The destroy step is what makes the swap idempotent — without
 * it each re-run stacks another field submodel under the column. The column
 * node's own props (width/fixed/sorter) are never touched, so a swap cannot
 * drop them.
 *
 * @param token root auth token
 * @param columnUid the TableColumnModel uid
 * @param oldFieldUids the column's current field subnode uids to destroy (the swap must leave exactly one)
 * @param columnStepParams the new column stepParams to merge (e.g. tableColumnSettings.model/fieldNames)
 * @param rebuild the replacement field submodel (use/props/stepParams); uid gets the w4b1 prefix
 * @returns the new field uid
 */
export async function rebuildColumnField(
  token: string,
  columnUid: string,
  oldFieldUids: ReadonlyArray<string>,
  columnStepParams: Record<string, unknown>,
  rebuild: Omit<ColumnFieldRebuild, 'uid'>,
): Promise<string> {
  for (const oldUid of oldFieldUids) {
    await call(token, 'POST', `/api/flowModels:destroy?filterByTk=${encodeURIComponent(oldUid)}`)
  }
  const fieldUid = withW4b1Prefix('cf')
  await dataOf(token, 'POST', '/api/flowModels:save', {
    uid: fieldUid, parentId: columnUid, subKey: 'field', subType: 'object', sortIndex: 0,
    use: rebuild.use, props: rebuild.props, stepParams: rebuild.stepParams,
  })
  await dataOf(token, 'POST', '/api/flowSurfaces:updateSettings', {
    target: { uid: columnUid }, stepParams: columnStepParams,
  })
  return fieldUid
}

/**
 * Rebind an association column to render the target collection's title field
 * (DisplayTitleFieldModel + props.titleField; renders Typography.Text of
 * `record[assoc][titleField]` instead of the bare FK id).
 *
 * @param token root auth token
 * @param columnUid the TableColumnModel uid of the association column
 * @param spec target collection, its title field, and the display props
 */
export async function rebindColumnTitleField(
  token: string,
  columnUid: string,
  oldFieldUids: ReadonlyArray<string>,
  spec: { targetCollection: string, titleField: string },
): Promise<string> {
  return rebuildColumnField(token, columnUid, oldFieldUids, {
    tableColumnSettings: { model: { use: 'DisplayTitleFieldModel' }, fieldNames: { label: spec.titleField } },
  }, {
    use: 'DisplayTitleFieldModel',
    props: {
      displayStyle: 'text', overflowMode: 'ellipsis', clickToOpen: true, displayCopyButton: false,
      titleField: spec.titleField, fieldNames: { label: spec.titleField },
    },
    stepParams: {
      fieldSettings: { init: { dataSourceKey: 'main', collectionName: spec.targetCollection, fieldPath: spec.titleField } },
      popupSettings: { openView: { collectionName: spec.targetCollection, dataSourceKey: 'main' } },
    },
  })
}

/**
 * Convert a bare-text select column into a colored enum column
 * (DisplayEnumFieldModel + props.options). Only valid when the underlying
 * collection field's interface is select — the caller checks (invariant 3).
 *
 * @param token root auth token
 * @param columnUid the TableColumnModel uid
 * @param options full value coverage with label + color
 * @param spec collection + fieldPath for the field metadata
 */
export async function enumizeColumn(
  token: string,
  columnUid: string,
  oldFieldUids: ReadonlyArray<string>,
  options: ReadonlyArray<StatusColumnOption>,
  spec: { collection: string, fieldPath: string },
): Promise<string> {
  return rebuildColumnField(token, columnUid, oldFieldUids, {
    tableColumnSettings: { model: { use: 'DisplayEnumFieldModel' } },
  }, {
    use: 'DisplayEnumFieldModel',
    props: { options: [...options] },
    stepParams: {
      fieldSettings: { init: { dataSourceKey: 'main', collectionName: spec.collection, fieldPath: spec.fieldPath } },
      popupSettings: { openView: { collectionName: spec.collection, dataSourceKey: 'main' } },
    },
  })
}

/** One filter field spec: the collection fieldPath, the optional input operator, and — for association fields — the target collection whose record-select popup needs collection-level fieldGroups. */
export type FilterFieldSpec = { fieldPath: string, operator?: string, popupTarget?: { collection: string, fields: string[] } }

/**
 * Ensure a page-level FilterForm block on a grid (W4 first use of the
 * server-side channel): flowSurfaces:addBlock 'filterForm' → per-field addField
 * (defaultTargetUid binds the grid's filterManager connection server-side) →
 * addAction 'reset' + 'submit' (T-2': visible, never hidden defaults). No
 * defaultValues are written — invariant 5.
 *
 * @param token root auth token
 * @param spec grid/table/collection plus the filter fields; tableUid is the default filter target
 * @returns the FilterFormBlockModel uid
 */
export async function ensureFilterForm(
  token: string,
  spec: {
    gridUid: string
    tableUid: string
    collection: string
    fields: ReadonlyArray<FilterFieldSpec>
  },
): Promise<string> {
  // fields ride the addBlock payload: the server then both creates the field
  // items and wires the grid.filterManager connections for the grid's data
  // blocks — a follow-up addField per field would duplicate the item and the
  // connection (verified live on the pilot page).
  // association filter fields open a generated record-select popup; the server
  // requires collection-level fieldGroups for those popup collections
  const popupTargets = spec.fields.flatMap(field => field.popupTarget === undefined ? [] : [field.popupTarget])
  const defaults = popupTargets.length === 0 ? {} : {
    defaults: {
      collections: Object.fromEntries(popupTargets.map(target => [target.collection, {
        fieldGroups: [{ key: 'basic', title: '基本信息', fields: target.fields }],
      }])),
    },
  }
  // object-form fields carry defaultTargetUid: grids with multiple data blocks
  // (比价表 has two pur_quotes tables) reject bare field strings
  const created = await dataOf(token, 'POST', '/api/flowSurfaces:addBlock', {
    target: { uid: spec.gridUid },
    type: 'filterForm',
    resourceInit: { dataSourceKey: 'main', collectionName: spec.collection },
    fields: spec.fields.map(field => ({ fieldPath: field.fieldPath, defaultTargetUid: spec.tableUid })),
    ...defaults,
  })
  const filterFormUid = String(created?.uid ?? '')
  if (filterFormUid === '') throw new Error(`addBlock filterForm on grid ${spec.gridUid} returned no uid`)
  await dataOf(token, 'POST', '/api/flowSurfaces:addAction', { target: { uid: filterFormUid }, type: 'reset' })
  await dataOf(token, 'POST', '/api/flowSurfaces:addAction', { target: { uid: filterFormUid }, type: 'submit' })
  return filterFormUid
}

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

// ─── W4-B2 form-standards heal (three factory functions) ───

/** uid for W4-B2 nodes (divider items, edit/delete actions); the `w4b2` prefix is the rollback anchor. */
export const withW4b2Prefix = (tag: string): string => `w4b2${tag}${nodeKey()}`

/**
 * FormItemModel/field-model props for one form field (F-3'/F-9'): `required`
 * also emits the rules entry the antd validator reads (actions/required.tsx
 * semantics — collection-level joi required would make the marker redundant,
 * but the UI marker alone does not block submit without the rule).
 */
export function formItemExtras(opts: {
  required?: boolean
  message?: string
  placeholder?: string
  description?: string
  tooltip?: string
}): { props: Record<string, unknown>, rules?: Array<Record<string, unknown>> } {
  const props: Record<string, unknown> = {}
  if (opts.placeholder !== undefined) props.placeholder = opts.placeholder
  if (opts.description !== undefined) props.extra = opts.description
  if (opts.tooltip !== undefined) props.tooltip = opts.tooltip
  if (opts.required !== undefined) props.required = opts.required
  const rules = opts.required === true
    ? [{ required: true, message: opts.message ?? '该字段为必填项' }]
    : undefined
  return rules === undefined ? { props } : { props, rules }
}

/**
 * GridLayoutV2 rows for a sectioned two-column form (F-1'): each spec emits a
 * full-width divider row first (when `dividerUid` is given), then pairs its
 * field items into [12,12] rows (a trailing lone item keeps a [12] cell so the
 * column rhythm is stable). Mirrors the DetailsGrid layout contract
 * (FormGridModel.tsx:23-29) — the grid renders from `layout.rows`, so the
 * FormItemModel rows themselves never move.
 */
export function formTwoColumnLayout(
  sections: ReadonlyArray<{ dividerUid?: string, itemUids: ReadonlyArray<string> }>,
): { layout: { version: 2, rows: Array<Record<string, unknown>>, rowOrder: string[], rowGap: number, colGap: number } } {
  const rows: Array<Record<string, unknown>> = []
  for (const section of sections) {
    if (section.dividerUid !== undefined) {
      const id = `sec${rows.length}`
      rows.push({ id, cells: [{ id: `${id}:cell:0`, items: [section.dividerUid] }], sizes: [24] })
    }
    for (let index = 0; index < section.itemUids.length; index += 2) {
      const id = `r${rows.length}`
      const pair = section.itemUids.slice(index, index + 2)
      rows.push({
        id,
        cells: pair.map((uid, cell) => ({ id: `${id}:cell:${cell}`, items: [uid] })),
        sizes: pair.length === 2 ? [12, 12] : [12],
      })
    }
  }
  return { layout: { version: 2, rows, rowOrder: rows.map(row => String(row.id)), rowGap: 0, colGap: 16 } }
}

/** One form-level default rule (F-6'): `value` is a literal or a `{{ctx.date.*}}` / `{{ctx.user.id}}` template expression. */
export type FormAssignRule = { targetPath: string, value: unknown, mode?: 'default' | 'assign' | 'override' }

/**
 * Write a form's level default values (F-6') onto the FormGridModel row's
 * delegated `stepParams.formModelSettings.assignRules` (FormBlockModel
 * GRID_DELEGATED_STEP_KEYS — the grid stores what the form block reads back).
 * `mode: 'default'` only fills empty values, so Edit forms keep existing row
 * values. Rules with the same targetPath are replaced; others are kept
 * (idempotent re-runs converge).
 *
 * @param token root auth token
 * @param formGridUid the FormGridModel uid (not the form block's)
 * @param rules targetPath + value pairs
 */
export async function assignFormDefaults(token: string, formGridUid: string, rules: ReadonlyArray<FormAssignRule>): Promise<void> {
  const current = await dataOf(token, 'GET', `/api/flowSurfaces:get?uid=${encodeURIComponent(formGridUid)}`)
  const row = current?.tree ?? {}
  const stepParamsBefore = (row.stepParams ?? {}) as Record<string, unknown>
  const existing = Array.isArray((stepParamsBefore.formModelSettings as Record<string, any> | undefined)?.assignRules?.value)
    ? [...((stepParamsBefore.formModelSettings as any).assignRules.value as Array<Record<string, unknown>>)]
    : []
  const next = existing.filter(entry => !rules.some(rule => rule.targetPath === entry.targetPath))
  next.push(...rules.map((rule, index) => ({
    key: `w4b2-${rule.targetPath}-${index}`,
    enable: true,
    targetPath: rule.targetPath,
    mode: rule.mode ?? 'default',
    value: rule.value,
  })))
  await dataOf(token, 'POST', '/api/flowModels:save', {
    uid: formGridUid,
    ...(row.parentId === undefined ? {} : { parentId: row.parentId }),
    ...(row.subKey === undefined ? {} : { subKey: row.subKey }),
    // flowModels:save replaces stepParams wholesale; spread stepParamsBefore
    // so sibling keys (gridSettings from the B2 layout pass) survive.
    stepParams: { ...stepParamsBefore, formModelSettings: { assignRules: { value: next } } },
  })
}

/**
 * Read-merge-save one flowModels node's props (B1's applyColumnDisplayProps
 * generalized to any node — form items and field submodels ride it for
 * required/placeholder/options writes). No sibling key is dropped.
 *
 * @param token root auth token
 * @param uid the node uid
 * @param props the props keys to merge in
 */
export async function mergeNodeProps(token: string, uid: string, props: Record<string, unknown>): Promise<void> {
  const current = await dataOf(token, 'GET', `/api/flowSurfaces:get?uid=${encodeURIComponent(uid)}`)
  const row = current?.tree ?? {}
  const before = (row.props ?? {}) as Record<string, unknown>
  await dataOf(token, 'POST', '/api/flowModels:save', {
    uid,
    ...(row.parentId === undefined ? {} : { parentId: row.parentId }),
    ...(row.subKey === undefined ? {} : { subKey: row.subKey }),
    props: { ...before, ...props },
  })
}

// ─── W4-B3 page-level heal (metric charts + markdown hints) ───

/** uid for W4-B3 nodes; `w4b3` is the rollback/identity marker (see {@link W4B3_MARKER}). */
export const withW4b3Prefix = (tag: string): string => `w4b3${tag}${nodeKey()}`

/**
 * The batch-identity marker embedded in every B3-created artifact. addBlock
 * mints server-side uids the script cannot prefix, so blocks carry the marker
 * inside their own content instead: chart blocks in the first line of the
 * custom raw option, markdown blocks in a trailing HTML comment (invisible in
 * rendered markdown). Rollback and idempotence both match on it.
 */
export const W4B3_MARKER = 'w4b3'

/**
 * The single-value stat card's raw ECharts option (D3: ChartBlockModel
 * single-measure aggregation + visual.mode='custom'). Renders the card title,
 * the big number, and the 口径 footnote (P-2' — the card never follows the
 * page filter, so the footnote states its own scope in plain words). The
 * first line carries {@link W4B3_MARKER} for batch identification.
 *
 * @param spec aggregation alias to read, unit strings, title and footnote texts
 */
export function statCardRaw(spec: {
  alias: string
  title: string
  footnote: string
  unitPrefix?: string
  unitSuffix?: string
  decimals?: number
}): string {
  return [
    `/* ${W4B3_MARKER} statcard */`,
    `const v = ((ctx.data.objects || [])[0] || {})['${spec.alias}'];`,
    'const n = Number(v == null ? 0 : v);',
    `const fmt = (x) => x.toLocaleString('zh-CN', { maximumFractionDigits: ${spec.decimals ?? 2} });`,
    `const text = '${spec.unitPrefix ?? ''}' + (isFinite(n) ? fmt(n) : '0') + '${spec.unitSuffix ?? ''}';`,
    'return {',
    '  graphic: { elements: [',
    `    { type: 'text', left: 16, top: 12, style: { text: ${JSON.stringify(spec.title)}, fontSize: 13, fontWeight: 500, fill: '#6b7280' } },`,
    `    { type: 'text', left: 16, top: 36, style: { text: text, fontSize: 34, fontWeight: 700, fill: '#1d4ed8' } },`,
    `    { type: 'text', left: 16, bottom: 8, style: { text: ${JSON.stringify(spec.footnote)}, fontSize: 11, fill: '#9ca3af' } },`,
    '  ] },',
    '};',
  ].join('\n')
}

/**
 * One single-value metric card on a page grid: addBlock type 'chart' with a
 * builder query of exactly one measure (no dimensions → one aggregated row)
 * and the custom raw visual ({@link statCardRaw}), then the block title and
 * the sortIndex that seats it above the page's existing blocks. Idempotence
 * and rollback live in the heal script (it matches blocks by
 * {@link W4B3_MARKER} + props.title under the grid).
 *
 * @param token root auth token
 * @param spec collection, one measure, optional filter, card texts, and the sortIndex for grid placement
 * @returns the created ChartBlockModel uid
 */
export async function metricChart(
  token: string,
  spec: {
    gridUid: string
    title: string
    collection: string
    measure: { field: string, aggregation: 'count' | 'sum' | 'avg', alias: string }
    filter?: Record<string, unknown>
    footnote: string
    unitPrefix?: string
    unitSuffix?: string
    decimals?: number
    sortIndex?: number
  },
): Promise<string> {
  // Direct flowModels:save, not flowSurfaces:addBlock: the authoring channel
  // re-validates every inline popup on the surface, and a kanban block's
  // cardViewAction popup (missing collection fieldGroups) fails that check
  // even though the new chart has nothing to do with it (处置看板 case). The
  // saved row must carry the server-canonicalized shapes the renderer and the
  // query runner read back: query.collectionPath (a raw `resource` object is
  // ignored — the block then renders the 请配置图表 placeholder), the
  // {logic, items} filter triple form, `name` mirroring the uid, and a
  // sortIndex. A load-only single-row write is the complete subtree a chart
  // block needs.
  const uid = withW4b3Prefix('sc')
  const filter = spec.filter === undefined ? undefined : {
    logic: '$and',
    items: Object.entries(spec.filter).flatMap(([path, raw]) => {
      if (raw !== null && typeof raw === 'object' && !Array.isArray(raw)) {
        return Object.entries(raw as Record<string, unknown>).map(([operator, value]) => ({ path, operator, value }))
      }
      return [{ path, operator: '$eq', value: raw }]
    }),
  }
  await dataOf(token, 'POST', '/api/flowModels:save', {
    uid, name: uid, parentId: spec.gridUid, subKey: 'items', subType: 'array',
    ...(spec.sortIndex === undefined ? {} : { sortIndex: spec.sortIndex }),
    use: 'ChartBlockModel', decoratorProps: {},
    props: { title: spec.title },
    stepParams: {
      chartSettings: {
        configure: {
          query: {
            mode: 'builder',
            collectionPath: ['main', spec.collection],
            measures: [{ field: spec.measure.field, aggregation: spec.measure.aggregation, alias: spec.measure.alias }],
            ...(filter === undefined ? {} : { filter }),
          },
          chart: {
            option: {
              mode: 'custom',
              raw: statCardRaw({
                alias: spec.measure.alias, title: spec.title, footnote: spec.footnote,
                ...(spec.unitPrefix === undefined ? {} : { unitPrefix: spec.unitPrefix }),
                ...(spec.unitSuffix === undefined ? {} : { unitSuffix: spec.unitSuffix }),
                ...(spec.decimals === undefined ? {} : { decimals: spec.decimals }),
              }),
            },
          },
        },
      },
    },
    popup: { mode: 'local' },
  })
  return uid
}

/**
 * One markdown hint block on a page grid (P-4'/P-5': one-sentence purpose +
 * the empty-list guidance D9 settles on). The trailing HTML comment carries
 * {@link W4B3_MARKER}; it is invisible in rendered markdown.
 *
 * @param token root auth token
 * @param spec markdown content and the sortIndex seating it at the page top
 * @returns the created MarkdownBlockModel uid
 */
export async function ensureMarkdownHint(
  token: string,
  spec: { gridUid: string, content: string, sortIndex?: number },
): Promise<string> {
  // Same direct-save channel as metricChart (authoring-channel independence;
  // the w4b3-prefixed uid makes the block prefix-rollback-able too). The
  // renderer reads the markdown from stepParams.markdownBlockSettings
  // .editMarkdown.content (props.content alone shows the demo placeholder),
  // and `name`/sortIndex mirror what addBlock writes.
  const uid = withW4b3Prefix('md')
  const content = `${spec.content}\n<!--${W4B3_MARKER}-->`
  await dataOf(token, 'POST', '/api/flowModels:save', {
    uid, name: uid, parentId: spec.gridUid, subKey: 'items', subType: 'array',
    ...(spec.sortIndex === undefined ? {} : { sortIndex: spec.sortIndex }),
    use: 'MarkdownBlockModel', decoratorProps: {},
    props: { content },
    stepParams: { markdownBlockSettings: { editMarkdown: { content } } },
    popup: { mode: 'local' },
  })
  return uid
}

/**
 * Seat the B3 blocks at the top of a page grid: the hint on its own full-width
 * row, the stat cards side by side on one row beneath it, every pre-existing
 * row kept below in its original order. The grid renders from the legacy
 * rows/sizes/rowOrder maps (`stepParams.gridSettings.grid`, mirrored in
 * props) — sortIndex on items does not move blocks, and addBlock always
 * appends `appendRowN` at the tail, so the heal must rewrite the maps
 * itself. Re-running is convergent: the moved uids are stripped from their
 * old cells first, rows left empty are dropped, then the two w4b3 rows are
 * rebuilt at the head of rowOrder.
 *
 * @param token root auth token
 * @param gridUid the page's BlockGridModel uid
 * @param spec the hint block uid (null when the page has no hint) and the card uids in display order
 */
export async function seatGridTopBlocks(
  token: string,
  gridUid: string,
  spec: { hintUid: string | null, cardUids: ReadonlyArray<string> },
): Promise<void> {
  const HINT_ROW = 'w4b3hintRow'
  const CARDS_ROW = 'w4b3cardsRow'
  const current = await dataOf(token, 'GET', `/api/flowSurfaces:get?uid=${encodeURIComponent(gridUid)}`)
  const row = current?.tree ?? {}
  const grid = ((row.stepParams ?? {}).gridSettings ?? {}).grid ?? {}
  const mine = new Set([...(spec.hintUid === null ? [] : [spec.hintUid]), ...spec.cardUids])
  const rows: Record<string, unknown> = {}
  const sizes: Record<string, unknown> = {}
  for (const [key, cells] of Object.entries(grid.rows ?? {})) {
    if (key === HINT_ROW || key === CARDS_ROW) continue
    const kept = (Array.isArray(cells) ? cells : []).map(cell => (Array.isArray(cell) ? cell.filter(uid => !mine.has(String(uid))) : [])).filter(cell => cell.length > 0)
    if (kept.length === 0) continue
    rows[key] = kept
    sizes[key] = (grid.sizes ?? {})[key] ?? kept.map(() => 24)
  }
  if (spec.hintUid !== null) {
    rows[HINT_ROW] = [[spec.hintUid]]
    sizes[HINT_ROW] = [24]
  }
  if (spec.cardUids.length > 0) {
    rows[CARDS_ROW] = spec.cardUids.map(uid => [uid])
    const n = spec.cardUids.length
    const base = Math.floor(24 / n)
    sizes[CARDS_ROW] = Array.from({ length: n }, (_, index) => (index === 0 ? 24 - base * (n - 1) : base))
  }
  const rowOrder = [...(spec.hintUid !== null ? [HINT_ROW] : []), ...(spec.cardUids.length > 0 ? [CARDS_ROW] : []), ...Object.keys(rows).filter(key => key !== HINT_ROW && key !== CARDS_ROW)]
  await dataOf(token, 'POST', '/api/flowModels:save', {
    uid: gridUid,
    ...(row.parentId === undefined ? {} : { parentId: row.parentId }),
    ...(row.subKey === undefined ? {} : { subKey: row.subKey }),
    props: { ...(row.props ?? {}), rows, sizes, rowOrder },
    stepParams: { gridSettings: { grid: { rows, sizes, rowOrder } } },
  })
}
