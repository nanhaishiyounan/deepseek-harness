/**
 * F4: add real Chart blocks to the two 仪表盘 pages (客户仪表盘 / 销售仪表盘)
 * so the page names finally match the content.
 *
 * Channel choice: the flow-engine authoring API (flowSurfaces:addBlock +
 * updateSettings) — the same channel the chart-write contract test exercises.
 * A raw flowModels:save with the pre-canonicalization shape does NOT work
 * here: the server rewrites the chart query on the authoring path
 * (resource → collectionPath, dot fields → arrays, sorting → orders) and the
 * client renders the canonicalized form, so a direct save leaves a block the
 * client cannot read (probe: tree contained ChartBlockModels that never
 * entered the DOM). Unlike F1's kanban/calendar (whose persisted fixture
 * shapes save verbatim), charts need that server-side canonicalization.
 *
 * Charts: 客户仪表盘 gets 客户按行业 (industry, bar) + 客户按等级 (level,
 * doughnut); 销售仪表盘 gets 回款按状态 (status, bar) + 回款按方式 (method,
 * doughnut). Both pages keep their F2 table spines untouched — charts are
 * additive grid items.
 *
 * Idempotent: existence = a ChartBlockModel child of the page's grid whose
 * chart query targets the spec's collection+dimension (addBlock mints fresh
 * uids, so the deterministic-uid trick does not apply). --remove destroys
 * every ChartBlockModel under the two grids (back to the F2 end-state).
 *
 * Usage:
 *   node --import tsx/esm examples/kb-agent/scripts/nocobase-f4-charts.mts
 *   node --import tsx/esm examples/kb-agent/scripts/nocobase-f4-charts.mts --remove
 */
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const baseUrl = process.env.NOCOBASE_BASE_URL ?? 'http://127.0.0.1:13000'
const rootEmail = process.env.NOCOBASE_ROOT_EMAIL ?? 'admin@nocobase.com'
const rootPassword = process.env.NOCOBASE_ROOT_PASSWORD ?? 'admin123'

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

type RouteRow = { id: number, title: string | null, parentId: number | null, type: string, schemaUid: string | null }
type FlowModelRow = Record<string, any>

type ChartSpec = {
  page: string
  title: string
  collection: string
  dimension: string
  chartType: 'bar' | 'doughnut'
}

const CHARTS: ReadonlyArray<ChartSpec> = [
  { page: '客户仪表盘', title: '客户按行业分布', collection: 'crm_customers', dimension: 'industry', chartType: 'bar' },
  { page: '客户仪表盘', title: '客户按等级分布', collection: 'crm_customers', dimension: 'level', chartType: 'doughnut' },
  { page: '销售仪表盘', title: '回款按状态分布', collection: 'crm_payments', dimension: 'status', chartType: 'bar' },
  { page: '销售仪表盘', title: '回款按方式分布', collection: 'crm_payments', dimension: 'method', chartType: 'doughnut' },
]

async function listRoutes(token: string): Promise<RouteRow[]> {
  const pageSize = 400
  const payload = await call(token, 'GET', `/api/desktopRoutes:list?pageSize=${pageSize}`)
  const routes = (payload?.data ?? null) as RouteRow[] | null
  if (routes === null) return []
  const total = payload?.meta?.total
  if (typeof total === 'number' ? total > routes.length : routes.length === pageSize) {
    throw new Error('desktopRoutes:list may be truncated; raise the page size before running F4')
  }
  return routes
}

async function listFlowModels(token: string): Promise<FlowModelRow[]> {
  const pageSize = 2000
  const payload = await call(token, 'GET', `/api/flowModels:list?pageSize=${pageSize}`)
  const rows = (payload?.data ?? null) as FlowModelRow[] | null
  if (rows === null) return []
  const total = payload?.meta?.total
  if (typeof total === 'number' ? total > rows.length : rows.length === pageSize) {
    throw new Error(`flowModels:list may be truncated; raise the page size before running F4`)
  }
  return rows
}

/** Resolve the BlockGrid uid of one v2 page (its tabs child row carries the grid parent uid). */
async function pageGridUid(token: string, pageTitle: string): Promise<string> {
  const routes = await listRoutes(token)
  const flow = routes.find(row => row.title === pageTitle && row.type === 'flowPage')
  if (flow === undefined) throw new Error(`v2 page "${pageTitle}" not found; run nocobase-f2-crm-v2.mts first`)
  const tab = routes.find(row => row.parentId === flow.id && row.type === 'tabs')
  if (tab?.schemaUid == null) throw new Error(`v2 page "${pageTitle}" has no tabs child row`)
  const grid = await dataOf(token, 'GET', `/api/flowModels:findOne?parentId=${tab.schemaUid}&subKey=grid`)
  if (grid?.uid == null) throw new Error(`v2 page "${pageTitle}" grid not found under tab ${tab.schemaUid}`)
  return String(grid.uid)
}

/** The chart query of one ChartBlockModel row, canonicalized or raw. */
const chartQueryOf = (row: FlowModelRow): any => row?.stepParams?.chartSettings?.configure?.query ?? {}
const queryTargets = (query: any, spec: ChartSpec): boolean => {
  const path = Array.isArray(query?.collectionPath) ? query.collectionPath.join('.') : undefined
  const byResource = query?.resource?.collectionName === spec.collection
  const dims = Array.isArray(query?.dimensions) ? query.dimensions : []
  const dimensionMatches = dims.some((dim: any) =>
    Array.isArray(dim?.field) ? dim.field[dim.field.length - 1] === spec.dimension : dim?.field === spec.dimension)
  return (path === `main.${spec.collection}` || byResource) && dimensionMatches
}

async function main(): Promise<void> {
  const token = await signIn()
  const gridUids = new Map<string, string>()
  for (const chart of CHARTS) {
    if (!gridUids.has(chart.page)) gridUids.set(chart.page, await pageGridUid(token, chart.page))
  }
  if (process.argv.includes('--remove')) {
    let removed = 0
    for (const [page, gridUid] of gridUids) {
      const rows = await listFlowModels(token)
      for (const row of rows.filter(candidate => candidate.use === 'ChartBlockModel' && candidate.parentId === gridUid)) {
        await call(token, 'POST', `/api/flowModels:destroy?filterByTk=${encodeURIComponent(String(row.uid))}`)
        removed += 1
      }
      console.log(`nocobase-f4: ${page} chart blocks removed`)
    }
    console.log(`nocobase-f4: ${removed} chart block(s) removed (pages back to the F2 table end-state)`)
    return
  }
  for (const chart of CHARTS) {
    const gridUid = gridUids.get(chart.page) as string
    const rows = await listFlowModels(token)
    const existing = rows.find(row => row.use === 'ChartBlockModel' && row.parentId === gridUid && queryTargets(chartQueryOf(row), chart))
    if (existing !== undefined) {
      console.log(`nocobase-f4: chart "${chart.title}" exists on ${chart.page} (kept)`)
      continue
    }
    // Authoring channel with inline settings (the CHART_EXPECTED_SHAPE wire):
    // the server canonicalizes the query and validates the visual mappings —
    // bar needs {x, y}, doughnut {category, value}.
    const mappings = chart.chartType === 'doughnut'
      ? { category: chart.dimension, value: 'recordCount' }
      : { x: chart.dimension, y: 'recordCount' }
    const block = await dataOf(token, 'POST', '/api/flowSurfaces:addBlock', {
      target: { uid: gridUid },
      type: 'chart',
      settings: {
        query: {
          mode: 'builder',
          resource: { dataSourceKey: 'main', collectionName: chart.collection },
          measures: [{ field: 'id', aggregation: 'count', alias: 'recordCount' }],
          dimensions: [{ field: chart.dimension }],
        },
        visual: { mode: 'basic', type: chart.chartType, mappings },
      },
    })
    const blockUid = block?.uid ?? block?.tree?.uid
    if (typeof blockUid !== 'string') throw new Error(`addBlock returned no uid for "${chart.title}": ${JSON.stringify(block).slice(0, 200)}`)
    console.log(`nocobase-f4: chart "${chart.title}" created on ${chart.page} (${chart.collection}.${chart.dimension}, ${chart.chartType}, uid ${blockUid})`)
  }
  console.log('nocobase-f4: done')
}

await main()
