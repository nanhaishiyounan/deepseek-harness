/**
 * W4-R1 C2 leg-5: diff the 质检单 page's column fieldPaths against the
 * member roles:check field whitelist for qm_inspections — the client-side
 * column filter drops any column whose fieldPath the whitelist omits, while
 * the data list still returns every field the server-side grant allows.
 *
 * Usage: node --import tsx/esm examples/kb-agent/scripts/w4-r1-qc-whitelist.mts
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

// 1. the page's business column fieldPaths
const models = await listFlowModels(admin, 'W4R1C2')
const tables = models.filter(row => row?.use === 'TableBlockModel' && String(row.uid ?? '').startsWith('w8qm') && String(row?.stepParams?.resourceSettings?.init?.collectionName ?? '') === 'qm_inspections')
const columnPaths: string[] = []
for (const table of tables) {
  for (const column of models.filter(row => (row?.use === 'TableColumnModel' || row?.subKey === 'columns') && String(row.parentId ?? '') === String(table.uid))) {
    // fieldPath rides the column's own fieldSettings (the w8 authoring wire)
    columnPaths.push(String((column?.stepParams?.fieldSettings?.init ?? {}).fieldPath ?? '(missing)'))
  }
}
console.log(`page business columns (${String(columnPaths.length)}): ${columnPaths.join(',')}`)

// 2. the member whitelist for qm_inspections
const roles = await call(member, 'GET', '/api/roles:check')
const actions = (roles?.data?.actions ?? {}) as Record<string, { fields?: string[] | null }>
const relevant = Object.entries(actions).filter(([key]) => key.startsWith('qm_inspections:'))
console.log(`member roles:check qm_inspections actions (${String(relevant.length)}):`)
for (const [key, value] of relevant) {
  console.log(`  ${key} appends=${JSON.stringify((value as unknown as { appends?: string[] }).appends ?? null)} fields=${JSON.stringify(value.fields)}`)
}

// 3. the diff
for (const [key, value] of relevant.filter(([key]) => key.endsWith(':view') || key.endsWith(':list') || key.endsWith(':get'))) {
  const whitelist = new Set(value.fields ?? [])
  const missing = columnPaths.filter(path => !whitelist.has(path) && !whitelist.has(path.split('.')[0]))
  console.log(`${key}: columns dropped by whitelist (${String(missing.length)}): ${missing.join(',')}`)
}
