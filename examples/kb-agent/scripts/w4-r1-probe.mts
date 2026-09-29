/**
 * W4-R1 probe: snapshot the live stepParams of the heal-damaged blocks —
 * the 9 w9kpi TableBlockModels (board dataScope + defaultSorting) and the
 * w1 todo tables (status=open pin). Read-only; prints one line per table.
 *
 * Usage: node --import tsx/esm examples/kb-agent/scripts/w4-r1-probe.mts
 */
import { batchScopedRows, blockOwnedByPage, dataOf, gridOwnerRoutes, listFlowModels, listRoutes, signInWithRetry } from './nocobase-flow-page-lib.mts'

type FlowModelRow = import('./nocobase-flow-page-lib.mts').FlowModelRow
type RouteRow = import('./nocobase-flow-page-lib.mts').RouteRow

const token = await signInWithRetry()
const models = await listFlowModels(token, 'W4R1')
const routes = await listRoutes(token, 'W4R1')
const gridOwners = gridOwnerRoutes(models, routes)
const flowByTitle = new Map(routes.filter(row => row.type === 'flowPage').map(row => [row.title ?? '', row]))

const PAGE_BLOCK_FILTERS: ReadonlyArray<{ title: string, collection: string, expect: Record<string, unknown> }> = [
  { title: '经营看板', collection: 'kpi_snapshots', expect: { dataScope: { filter: { logic: '$and', items: [{ path: 'board', operator: '$eq', value: 'business' }] } }, defaultSorting: { sort: [{ field: 'calc_date', direction: 'desc' }] } } },
  { title: '供应链看板', collection: 'kpi_snapshots', expect: { dataScope: { filter: { logic: '$and', items: [{ path: 'board', operator: '$eq', value: 'supply' }] } }, defaultSorting: { sort: [{ field: 'calc_date', direction: 'desc' }] } } },
  { title: '生产看板', collection: 'kpi_snapshots', expect: { dataScope: { filter: { logic: '$and', items: [{ path: 'board', operator: '$eq', value: 'production' }] } }, defaultSorting: { sort: [{ field: 'calc_date', direction: 'desc' }] } } },
  { title: '库存看板', collection: 'kpi_snapshots', expect: { dataScope: { filter: { logic: '$and', items: [{ path: 'board', operator: '$eq', value: 'inventory' }] } }, defaultSorting: { sort: [{ field: 'calc_date', direction: 'desc' }] } } },
]

const failures: string[] = []
for (const page of PAGE_BLOCK_FILTERS) {
  const flow = flowByTitle.get(page.title)
  if (flow === undefined) { failures.push(`page ${page.title} missing`); continue }
  const owned = batchScopedRows(models, { use: 'TableBlockModel', collection: page.collection, uidPrefix: 'w9kpi' })
    .find(row => blockOwnedByPage(row, gridOwners, String(flow.schemaUid ?? '')))
  if (owned === undefined) { failures.push(`page ${page.title} kpi block missing`); continue }
  const actual = (owned.stepParams?.tableSettings ?? {}) as Record<string, unknown>
  const ok = JSON.stringify(actual) === JSON.stringify(page.expect)
  if (!ok) failures.push(`page ${page.title} tableSettings=${JSON.stringify(actual)}`)
  console.log(`${ok ? 'OK ' : 'BAD'} ${page.title} tableSettings=${JSON.stringify(actual)}`)
}

const todos = models.filter(row => row?.use === 'TableBlockModel' && String(row.uid ?? '').startsWith('w1w1') && row?.stepParams?.resourceSettings?.init?.collectionName === 'wfl_approval_todos')
for (const table of todos) {
  const scope = (table?.stepParams?.tableSettings as { dataScope?: unknown } | undefined)?.dataScope
  const pinned = JSON.stringify(scope) === JSON.stringify({ filter: { logic: '$and', items: [{ path: 'status', operator: '$eq', value: 'open' }] } })
  if (!pinned) failures.push(`todo ${table.uid} dataScope=${JSON.stringify(scope)}`)
  console.log(`${pinned ? 'OK ' : 'BAD'} w1todo ${table.uid} dataScope=${JSON.stringify(scope)}`)
}

const bare = models.filter(row => row?.use === 'TableBlockModel' && String(row.uid ?? '').startsWith('w9kpi'))
// 9 = 4 KPI boards + 4 reconciliation blocks + the wms_lots ledger block
// (which legitimately carries no tableSettings); a different count means a
// block row was lost or a foreign row adopted the prefix.
if (bare.length !== 9) failures.push(`w9kpi TableBlockModels total=${String(bare.length)} (expected 9)`)
console.log(`w9kpi TableBlockModels total=${String(bare.length)}${bare.length === 9 ? '' : ' (expected 9)'}`)
for (const row of bare) {
  console.log(`  ${String(row.uid)} tableSettings=${JSON.stringify((row.stepParams?.tableSettings ?? {}))}`)
}

// The C2 wire: the member role's qm_inspections view field whitelist must
// match the list row's (the zero-column regression returns when view drops
// back to ["*","id"]).
{
  const resources = await dataOf(token, 'GET', `/api/rolesResources:list?pageSize=100&filter=${encodeURIComponent(JSON.stringify({ roleName: { $eq: 'member' }, name: { $eq: 'qm_inspections' } }))}`) as Array<{ id?: number }> | null
  const resourceId = resources?.[0]?.id
  const rows = resourceId === undefined ? [] : (await dataOf(token, 'GET', `/api/rolesResourcesActions:list?pageSize=100&filter=${encodeURIComponent(JSON.stringify({ rolesResourceId: { $eq: resourceId } }))}`) as Array<{ name?: string, fields?: string[] | null }> | null ?? [])
  const view = rows.find(row => row.name === 'view')
  const list = rows.find(row => row.name === 'list')
  if (view === undefined || list === undefined) {
    failures.push('qm_inspections member view/list rows missing')
  } else if (JSON.stringify(view.fields ?? []) !== JSON.stringify(list.fields ?? [])) {
    failures.push(`qm_inspections member view whitelist misaligned (${JSON.stringify(view.fields ?? [])})`)
  } else {
    console.log(`OK  member qm_inspections view whitelist = ${String((view.fields ?? []).length)} fields (aligned with list)`)
  }
}
if (failures.length > 0) {
  console.error(`probe: ${String(failures.length)} damaged`)
  process.exitCode = 1
} else {
  console.log('probe: all wires intact')
}
