/**
 * W4-R1 C2 diagnosis: why the member (qc_inspector) 质检单 list renders
 * zero business columns while its XHR data and row-level permission are
 * intact. Compares, for collection qm_inspections:
 *
 * 1. the list XHR as qc_inspector (rows + status),
 * 2. collection fields visible to qc_inspector vs admin
 *    (the collectionField:list surface the renderer consumes),
 * 3. the 质检单 page's TableColumnModel field paths under the w8qm prefix.
 *
 * Read-only. Usage: node --import tsx/esm examples/kb-agent/scripts/w4-r1-qc-diagnose.mts
 */
import { call, listFlowModels, signInWithRetry } from './nocobase-flow-page-lib.mts'

async function signIn(account: string, password: string): Promise<string> {
  const payload = await call('', 'POST', '/api/auth:signIn', { account, password })
  const token = payload?.data?.token
  if (typeof token !== 'string' || token.length === 0) throw new Error(`signIn ${account} returned no token`)
  return token
}

const admin = await signInWithRetry()
const member = await signIn('qc_inspector', 'Qc#2026')

// 1. member list XHR
const list = await call(member, 'GET', '/api/qm_inspections:list?pageSize=5')
console.log(`member qm_inspections:list status=${String(list?.status)} rows=${String(list?.data?.length ?? -1)} meta.total=${String(list?.meta?.total ?? -1)}`)
if (Array.isArray(list?.data) && list.data.length > 0) {
  console.log(`  first row keys: ${Object.keys(list.data[0]).join(',')}`)
}

// 2. field visibility comparison
for (const [who, token] of [['admin', admin], ['member', member]] as const) {
  const fields = await call(token, 'GET', `/api/fields:list?filter=${encodeURIComponent(JSON.stringify({ collectionName: { $eq: 'qm_inspections' } }))}&pageSize=200&sort=sort`)
  const names = (fields?.data ?? []).map((field: Record<string, any>) => String(field.name))
  console.log(`${who} fields:list qm_inspections (${String(names.length)}): ${names.join(',')}`)
}

// 3. the page's table columns (w8qm prefix under route w8qmjvyv8p5j7j)
const models = await listFlowModels(admin, 'W4R1C2')
const tables = models.filter(row => row?.use === 'TableBlockModel' && String(row.uid ?? '').startsWith('w8qm'))
console.log(`w8qm TableBlockModels: ${String(tables.length)}`)
for (const table of tables) {
  const init = (table?.stepParams?.resourceSettings?.init ?? {}) as Record<string, unknown>
  if (String(init.collectionName ?? '') !== 'qm_inspections') continue
  const columns = models.filter(row => (row?.use === 'TableColumnModel' || row?.subKey === 'columns') && String(row.parentId ?? '') === String(table.uid))
  console.log(`table ${String(table.uid)} columns=${String(columns.length)}`)
  for (const column of columns) {
    const field = models.find(row => row?.subKey === 'field' && String(row.parentId ?? '') === String(column.uid))
    const fieldPath = (field?.stepParams?.fieldSettings?.init ?? {}).fieldPath ?? '(field model missing)'
    console.log(`  column ${String(column.uid)} use=${String(column.use)} fieldPath=${String(fieldPath)}`)
  }
}
