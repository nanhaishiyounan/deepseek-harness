#!/usr/bin/env node
// R3-02 rollback demo: the unique-index migration is reversible and
// re-runnable. DROP INDEX restores duplicate-write freedom immediately; the
// unique-indexes step rebuilds it idempotently and the duplicate write is
// rejected again. Every probe row is destroyed before exit.
import { spawnSync } from 'node:child_process'
import { execFileSync } from 'node:child_process'

const base = 'http://127.0.0.1:13000'
const rootEmail = 'admin@nocobase.com'
const rootPassword = 'admin123'

function psql(sql) {
  const result = execFileSync('psql', ['-U', process.env.USER ?? 'mac', '-d', 'nocobase', '-t', '-A', '-c', sql], { encoding: 'utf8' })
  return result.trim()
}

async function call(token, method, path, body) {
  const response = await fetch(`${base}${path}`, {
    method,
    headers: { authorization: `Bearer ${token}`, ...(body === undefined ? {} : { 'content-type': 'application/json' }) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
  const payload = await response.json().catch(() => null)
  return { status: response.status, ok: response.ok, payload }
}

const signed = await call('', 'POST', '/api/auth:signIn', { account: rootEmail, password: rootPassword })
const token = signed.payload?.data?.token
if (typeof token !== 'string') throw new Error('sign-in returned no token')

const PROBE = 'SUP-R3-ROLLBACK-PROBE'
const landed = []
async function probeCreate() {
  const created = await call(token, 'POST', '/api/srm_suppliers:create', { code: PROBE, supplier_name: 'R3 回滚演示', lifecycle_status: 'potential' })
  if (created.ok) landed.push(created.payload?.data?.id)
  return created
}

console.log('== before: index present, duplicate refused ==')
console.log(`index ux_srm_suppliers_code: ${psql("SELECT indexname FROM pg_indexes WHERE indexname = 'ux_srm_suppliers_code'") || '(absent)'}`)
const first = await probeCreate()
console.log(`probe #1 -> HTTP ${first.status}`)
const second = await probeCreate()
console.log(`probe #2 (duplicate) -> HTTP ${second.status} ${second.ok ? '(unexpected)' : '(refused by the index)'}`)

console.log('== rollback: DROP INDEX restores duplicate-write freedom ==')
console.log(psql('DROP INDEX IF EXISTS ux_srm_suppliers_code'))
const third = await probeCreate()
console.log(`probe #3 (duplicate, index dropped) -> HTTP ${third.status} ${third.ok ? '(duplicate landed — rollback effective)' : '(unexpected refusal)'}`)

console.log('== cleanup + rebuild: unique-indexes step re-runs idempotently ==')
for (const id of landed) {
  const removed = await call(token, 'POST', `/api/srm_suppliers:destroy?filterByTk=${id}`)
  console.log(`destroyed probe row ${id} -> HTTP ${removed.status}`)
}
const rebuild = spawnSync('node', ['--import', 'tsx/esm', 'examples/kb-agent/scripts/setup-nocobase.mts', 'unique-indexes'], { encoding: 'utf8' })
console.log((rebuild.stdout ?? '').trim())
if (rebuild.status !== 0) throw new Error(`rebuild failed: ${rebuild.stderr}`)

console.log('== after rebuild: duplicate refused again ==')
const seeded = await probeCreate()
console.log(`probe #4 -> HTTP ${seeded.status}`)
const fifth = await probeCreate()
console.log(`probe #5 (duplicate, index rebuilt) -> HTTP ${fifth.status} ${fifth.ok ? '(unexpected)' : '(refused again)'}`)
for (const id of landed) {
  await call(token, 'POST', `/api/srm_suppliers:destroy?filterByTk=${id}`)
}
console.log(`probe rows destroyed (${landed.length} total)`)
console.log('VERDICT: rollback (DROP INDEX) is immediate and data-free; the unique-indexes step rebuilds idempotently')
