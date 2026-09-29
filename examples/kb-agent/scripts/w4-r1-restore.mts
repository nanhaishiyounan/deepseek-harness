/**
 * W4-R1 restore: three damage classes:
 *
 * 1. The 9 w9kpi TableBlockModels: applyTableDefaultSort's pre-R1
 *    stepParams write replaced the whole object (flowModels:save replaces
 *    stepParams wholesale), dropping the tableSettings siblings — the four
 *    KPI boards lost their dataScope board filter + calc_date desc
 *    defaultSorting, the four reconciliation blocks their defaultSorting
 *    (expected values mirror nocobase-w9-dashboards.mts's PAGES spec).
 * 2. The w1 todo table (w1w1*, wfl_approval_todos): lost the status=open
 *    dataScope pin — mirrors nocobase-w1-approval.mts's ensureTodoJumpLinks.
 * 3. The member 质检单 zero-column regression: the member role's
 *    qm_inspections `view` action row carries fields ["*","id"] while
 *    list/get/create/update carry the full field whitelist. The v2 column
 *    renderer's aclCheck(actionName 'view', fields [name]) treats "*" as
 *    a literal, so every business column's acl check fails and the column
 *    hides — the data list itself returns 200 with full rows (the server
 *    honors list/get). The fix aligns the view row's field list with the
 *    other actions' full whitelist.
 *
 * Every stepParams write spreads the current value first (the C1 fix's
 * shape), so the restore cannot itself clobber. Idempotent:
 * already-correct wires are skipped and re-verified at the end.
 *
 * Usage: node --import tsx/esm examples/kb-agent/scripts/w4-r1-restore.mts
 */
import { batchScopedRows, blockOwnedByPage, call, dataOf, gridOwnerRoutes, listFlowModels, listRoutes, signInWithRetry } from './nocobase-flow-page-lib.mts'

type FlowModelRow = import('./nocobase-flow-page-lib.mts').FlowModelRow
type RouteRow = import('./nocobase-flow-page-lib.mts').RouteRow

const kpiFilter = (board: string) => ({ logic: '$and', items: [{ path: 'board', operator: '$eq', value: board }] })
const calcDateDesc = { sort: [{ field: 'calc_date', direction: 'desc' }] }

/** Per-page expected tableSettings, mirroring nocobase-w9-dashboards.mts PAGES. */
const W9_EXPECTED: ReadonlyArray<{ title: string, collection: string, tableSettings: Record<string, unknown> }> = [
  { title: '经营看板', collection: 'kpi_snapshots', tableSettings: { dataScope: { filter: kpiFilter('business') }, defaultSorting: calcDateDesc } },
  { title: '供应链看板', collection: 'kpi_snapshots', tableSettings: { dataScope: { filter: kpiFilter('supply') }, defaultSorting: calcDateDesc } },
  { title: '生产看板', collection: 'kpi_snapshots', tableSettings: { dataScope: { filter: kpiFilter('production') }, defaultSorting: calcDateDesc } },
  { title: '库存看板', collection: 'kpi_snapshots', tableSettings: { dataScope: { filter: kpiFilter('inventory') }, defaultSorting: calcDateDesc } },
  { title: '应收应付对账', collection: 'so_orders', tableSettings: { defaultSorting: { sort: [{ field: 'approved_at', direction: 'desc' }] } } },
  { title: '应收应付对账', collection: 'crm_payments', tableSettings: { defaultSorting: { sort: [{ field: 'paid_at', direction: 'desc' }] } } },
  { title: '应收应付对账', collection: 'pur_invoices', tableSettings: { defaultSorting: { sort: [{ field: 'billed_at', direction: 'desc' }] } } },
  { title: '应收应付对账', collection: 'pur_payments', tableSettings: { defaultSorting: { sort: [{ field: 'pay_date', direction: 'desc' }] } } },
]

const TODO_DATA_SCOPE = { filter: { logic: '$and', items: [{ path: 'status', operator: '$eq', value: 'open' }] } }

const token = await signInWithRetry()
const models = await listFlowModels(token, 'W4R1')
const routes = await listRoutes(token, 'W4R1')
const gridOwners = gridOwnerRoutes(models, routes)
const flowByTitle = new Map(routes.filter(row => row.type === 'flowPage').map(row => [row.title ?? '', row]))

const failures: string[] = []

// ─── w9kpi wires ───

for (const expected of W9_EXPECTED) {
  const flow = flowByTitle.get(expected.title)
  if (flow === undefined) { failures.push(`page ${expected.title} missing`); continue }
  const owned = batchScopedRows(models, { use: 'TableBlockModel', collection: expected.collection, uidPrefix: 'w9kpi' })
    .find(row => blockOwnedByPage(row, gridOwners, String(flow.schemaUid ?? '')))
  if (owned === undefined) { failures.push(`page ${expected.title} ${expected.collection} block missing`); continue }
  const actual = ((owned.stepParams ?? {}).tableSettings ?? {}) as Record<string, unknown>
  if (JSON.stringify(actual) === JSON.stringify(expected.tableSettings)) {
    console.log(`keep ${expected.title}/${expected.collection} tableSettings (already correct)`)
    continue
  }
  const stepParams = { ...(owned.stepParams ?? {}), tableSettings: expected.tableSettings }
  await dataOf(token, 'POST', '/api/flowModels:save', { uid: owned.uid, use: 'TableBlockModel', stepParams })
  console.log(`restored ${expected.title}/${expected.collection} tableSettings <- ${JSON.stringify(expected.tableSettings)}`)
}

// ─── w1 todo pin ───

for (const table of models.filter(row => row?.use === 'TableBlockModel' && String(row.uid ?? '').startsWith('w1w1') && row?.stepParams?.resourceSettings?.init?.collectionName === 'wfl_approval_todos')) {
  const currentScope = (table?.stepParams?.tableSettings as { dataScope?: unknown } | undefined)?.dataScope
  if (JSON.stringify(currentScope) === JSON.stringify(TODO_DATA_SCOPE)) {
    console.log(`keep ${String(table.uid)} status=open pin (already correct)`)
    continue
  }
  const stepParams = {
    ...table.stepParams,
    tableSettings: { ...(table?.stepParams?.tableSettings ?? {}), dataScope: TODO_DATA_SCOPE },
  }
  await dataOf(token, 'POST', '/api/flowModels:save', { uid: table.uid, use: 'TableBlockModel', stepParams })
  console.log(`restored ${String(table.uid)} status=open pin`)
}

// ─── 质检单 code column sorter (the interaction-sort channel) ───
// The page's default sort (-id) has no visible column, so no header carried
// a sorter — the list had no user-facing sort at all. Turning the code
// column into a sorter column is interaction-only (props.sorter); the
// persisted default sort (-id) stays untouched.
{
  const codeColumn = models.find(row => String(row.parentId ?? '') === 'w8qmtb1mz41nwilde'
    && String((row?.stepParams?.fieldSettings?.init ?? {}).fieldPath ?? '') === 'code')
  if (codeColumn === undefined) {
    failures.push('质检单 code column not found under w8qmtb1mz41nwilde')
  } else if (codeColumn.props?.sorter !== true) {
    await dataOf(token, 'POST', '/api/flowModels:save', {
      uid: codeColumn.uid,
      ...(codeColumn.parentId === undefined ? {} : { parentId: codeColumn.parentId }),
      ...(codeColumn.subKey === undefined ? {} : { subKey: codeColumn.subKey }),
      props: { ...codeColumn.props, sorter: true },
    })
    console.log('restored 质检单 code column sorter (interaction sort channel)')
  } else {
    console.log('keep 质检单 code column sorter (already on)')
  }
}

// ─── member 质检单 zero-column fix: align the view row's field list ───

{
  const resources = await dataOf(token, 'GET', `/api/rolesResources:list?pageSize=100&filter=${encodeURIComponent(JSON.stringify({ roleName: { $eq: 'member' }, name: { $eq: 'qm_inspections' } }))}`) as Array<{ id?: number }> | null
  const resourceId = resources?.[0]?.id
  if (resourceId === undefined) {
    failures.push('qm_inspections member resource row missing')
  } else {
    const actionRows = await dataOf(token, 'GET', `/api/rolesResourcesActions:list?pageSize=100&filter=${encodeURIComponent(JSON.stringify({ rolesResourceId: { $eq: resourceId } }))}`) as Array<{ id?: number, name?: string, fields?: string[] | null }> | null
    const rows = actionRows ?? []
    // The full whitelist the other actions carry (list's fields array).
    const reference = rows.find(row => row.name === 'list')
    const whitelist = reference?.fields ?? null
    if (whitelist === null || whitelist.length === 0) {
      failures.push('qm_inspections member list row carries no field whitelist to align view against')
    } else {
      for (const row of rows) {
        if (row.id === undefined) continue
        const needsFix = row.name === 'view' && JSON.stringify(row.fields ?? []) !== JSON.stringify(whitelist)
        if (needsFix) {
          await dataOf(token, 'POST', `/api/rolesResourcesActions:update?filterByTk=${String(row.id)}`, { fields: whitelist })
          console.log(`restored member qm_inspections ${String(row.name)} field whitelist (${String(whitelist.length)} fields)`)
        }
      }
    }
  }
}

// ─── verify (fresh read) ───

const after = await listFlowModels(token, 'W4R1')
const afterRoutes = await listRoutes(token, 'W4R1')
const afterOwners = gridOwnerRoutes(after, afterRoutes)
const afterFlowByTitle = new Map(afterRoutes.filter(row => row.type === 'flowPage').map(row => [row.title ?? '', row]))

for (const expected of W9_EXPECTED) {
  const flow = afterFlowByTitle.get(expected.title)
  if (flow === undefined) { failures.push(`verify: page ${expected.title} missing`); continue }
  const owned = batchScopedRows(after, { use: 'TableBlockModel', collection: expected.collection, uidPrefix: 'w9kpi' })
    .find(row => blockOwnedByPage(row, afterOwners, String(flow.schemaUid ?? '')))
  if (owned === undefined) { failures.push(`verify: page ${expected.title} ${expected.collection} block missing`); continue }
  const actual = ((owned.stepParams ?? {}).tableSettings ?? {}) as Record<string, unknown>
  if (JSON.stringify(actual) !== JSON.stringify(expected.tableSettings)) {
    failures.push(`verify: page ${expected.title} ${expected.collection} tableSettings=${JSON.stringify(actual)}`)
  }
  // stepParams sibling coexistence: resourceSettings (init) must survive
  // alongside the restored tableSettings — the C1 double-key proof.
  if ((owned.stepParams ?? {}).resourceSettings === undefined) {
    failures.push(`verify: page ${expected.title} ${expected.collection} lost resourceSettings`)
  }
}

for (const table of after.filter(row => row?.use === 'TableBlockModel' && String(row.uid ?? '').startsWith('w1w1') && row?.stepParams?.resourceSettings?.init?.collectionName === 'wfl_approval_todos')) {
  const scope = (table?.stepParams?.tableSettings as { dataScope?: unknown } | undefined)?.dataScope
  if (JSON.stringify(scope) !== JSON.stringify(TODO_DATA_SCOPE)) {
    failures.push(`verify: todo ${String(table.uid)} dataScope=${JSON.stringify(scope)}`)
  }
  if ((table.stepParams ?? {}).resourceSettings === undefined) {
    failures.push(`verify: todo ${String(table.uid)} lost resourceSettings`)
  }
}

{
  const resources = await dataOf(token, 'GET', `/api/rolesResources:list?pageSize=100&filter=${encodeURIComponent(JSON.stringify({ roleName: { $eq: 'member' }, name: { $eq: 'qm_inspections' } }))}`) as Array<{ id?: number }> | null
  const resourceId = resources?.[0]?.id
  const rows = resourceId === undefined ? [] : (await dataOf(token, 'GET', `/api/rolesResourcesActions:list?pageSize=100&filter=${encodeURIComponent(JSON.stringify({ rolesResourceId: { $eq: resourceId } }))}`) as Array<{ name?: string, fields?: string[] | null }> | null ?? [])
  const view = rows.find(row => row.name === 'view')
  const list = rows.find(row => row.name === 'list')
  if (view === undefined || list === undefined) {
    failures.push('verify: member qm_inspections view/list action rows missing')
  } else if (JSON.stringify(view.fields ?? []) !== JSON.stringify(list.fields ?? [])) {
    failures.push(`verify: member qm_inspections view fields still misaligned (${JSON.stringify(view.fields ?? [])})`)
  } else {
    console.log(`verify: member qm_inspections view whitelist aligned (${String((view.fields ?? []).length)} fields)`)
  }
}

const w9kpiTotal = after.filter(row => row?.use === 'TableBlockModel' && String(row.uid ?? '').startsWith('w9kpi')).length
if (w9kpiTotal !== 9) failures.push(`verify: w9kpi TableBlockModels=${String(w9kpiTotal)} (expected 9)`)

if (failures.length > 0) {
  console.error(`w4-r1-restore: FAILED\n  - ${failures.join('\n  - ')}`)
  process.exitCode = 1
} else {
  console.log('w4-r1-restore: OK — 8 w9kpi wires + w1 todo pin restored, resourceSettings coexists')
}
