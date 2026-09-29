/**
 * W4-R1 C2 leg-2: compare the collections:listMeta payload (the surface the
 * v2 renderer actually consumes) between admin and qc_inspector for
 * qm_inspections — the data list returns 200 with full rows for member,
 * so zero business columns means the field metadata the column models
 * resolve against is being trimmed per role.
 *
 * Usage: node --import tsx/esm examples/kb-agent/scripts/w4-r1-qc-listmeta.mts
 */
import { call, signInWithRetry } from './nocobase-flow-page-lib.mts'

async function signIn(account: string, password: string): Promise<string> {
  const payload = await call('', 'POST', '/api/auth:signIn', { account, password })
  const token = payload?.data?.token
  if (typeof token !== 'string' || token.length === 0) throw new Error(`signIn ${account} returned no token`)
  return token
}

const shapes = new Map<string, { fields: string[], status: number }>()
for (const [who, token] of [['admin', await signInWithRetry()], ['member', await signIn('qc_inspector', 'Qc#2026')]] as const) {
  const payload = await call(token, 'POST', '/api/collections:listMeta', {})
  const collections = (payload?.data ?? []) as Array<Record<string, any>>
  const qm = collections.find(collection => collection?.name === 'qm_inspections')
  const fields = Array.isArray(qm?.fields) ? qm.fields.map((field: Record<string, any>) => String(field.name)) : []
  const status = Number(payload?.status ?? 200)
  shapes.set(who, { fields, status })
  console.log(`${who}: listMeta collections=${String(collections.length)} qm_inspections fields(${String(fields.length)})=${fields.join(',')}`)
}

const adminFields = new Set(shapes.get('admin')?.fields ?? [])
const memberFields = new Set(shapes.get('member')?.fields ?? [])
const missing = [...adminFields].filter(field => !memberFields.has(field))
console.log(`fields admin has but member lacks (${String(missing.length)}): ${missing.join(',')}`)
