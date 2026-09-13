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

export async function call(token: string, method: 'GET' | 'POST' | 'DELETE', path: string, body?: unknown): Promise<any> {
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
  const pageSize = 2000
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
