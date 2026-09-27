#!/usr/bin/env node
// R3-02 live REST negative: the partial unique index behind the tool-side
// anti-collision preflight rejects a duplicate document number at the
// database layer, with the empty-number partial predicate staying legal.
// Read-mostly: the one probe row it lands (empty code) is deleted at exit.
const base = process.env.NOCOBASE_BASE_URL ?? 'http://127.0.0.1:13000'
const rootEmail = process.env.NOCOBASE_ROOT_EMAIL ?? 'admin@nocobase.com'
const rootPassword = process.env.NOCOBASE_ROOT_PASSWORD ?? 'admin123'

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
console.log(`signed in as ${rootEmail}`)

// Pick one live pur_orders code to duplicate (the seeded PO-2026-0001 shape).
const listed = await call(token, 'GET', '/api/pur_orders:list?pageSize=1&filter=' + encodeURIComponent(JSON.stringify({ code: { $includes: 'PO-' } })))
const existing = listed.payload?.data?.[0]
if (existing === undefined) throw new Error('no live pur_orders code to duplicate')
console.log(`duplicating pur_orders code=${existing.code} (row ${existing.id})`)

const dup = await call(token, 'POST', '/api/pur_orders:create', { code: existing.code, doc_status: 'draft' })
console.log(`duplicate create -> HTTP ${dup.status} (expected non-2xx)`)
console.log(`  body: ${JSON.stringify(dup.payload).slice(0, 220)}`)
if (dup.ok) throw new Error('the unique index did not reject the duplicate code')

// The partial predicate: rows without a number stay legal (the tool guard
// skips them too); the probe row is removed right after.
const empty = await call(token, 'POST', '/api/pur_orders:create', { doc_status: 'draft' })
console.log(`empty-number create -> HTTP ${empty.status} (partial predicate legal)`)
if (!empty.ok) throw new Error('the partial predicate wrongly rejected an empty number')
const probeId = empty.payload?.data?.id
const removed = await call(token, 'POST', `/api/pur_orders:destroy?filterByTk=${probeId}`)
console.log(`probe row ${probeId} destroyed -> HTTP ${removed.status}`)

console.log('VERDICT: duplicate code rejected at the DB layer; empty numbers legal; probe cleaned up')
