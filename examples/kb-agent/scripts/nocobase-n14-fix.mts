/**
 * N14 repair: pages whose desktopRoutes row has no `tabs` child render only
 * the page header and skip the content Grid entirely (NocoBase 2.x v1 pages
 * are tab-wired: the tabs child's schemaUid points at the page Grid node).
 *
 * B2/B3 module scripts created page routes without that tabs child; this
 * script backfills one per affected page through the official
 * desktopRoutes:create API (it also writes the admin-layout-model
 * uiLayouts association and refreshes the route-tree cache). Idempotent:
 * pages that already carry a tabs child are kept as-is.
 *
 * Usage: node --import tsx/esm examples/kb-agent/scripts/nocobase-n14-fix.mts
 */
import { readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const baseUrl = process.env.NOCOBASE_BASE_URL ?? 'http://127.0.0.1:13000'
const rootEmail = process.env.NOCOBASE_ROOT_EMAIL ?? 'admin@nocobase.com'
const rootPassword = process.env.NOCOBASE_ROOT_PASSWORD ?? 'admin123'
const envPath = resolve(here, '../../../.env')
if (process.env.NOCOBASE_BASE_URL === undefined) {
  try {
    for (const line of readFileSync(envPath, 'utf8').split('\n')) {
      const m = /^NOCOBASE_BASE_URL=(.+)$/.exec(line.trim())
      if (m) process.env.NOCOBASE_BASE_URL = m[1]
    }
  } catch { /* .env is optional when env vars carry the values */ }
}
const base = process.env.NOCOBASE_BASE_URL ?? baseUrl

type Json = Record<string, unknown>

async function call(token: string, method: string, path: string, body?: Json): Promise<Response> {
  return fetch(`${base}${path}`, {
    method,
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${token}`,
      'x-role': 'root',
      'x-authenticator': 'basic',
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
}

async function dataOf(token: string, method: string, path: string, body?: Json): Promise<any> {
  const res = await call(token, method, path, body)
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status}`)
  const j = (await res.json()) as { data?: unknown }
  return j.data
}

async function signIn(): Promise<string> {
  const res = await fetch(`${base}/api/auth:signIn`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: rootEmail, password: rootPassword }),
  })
  if (!res.ok) throw new Error(`signIn -> ${res.status}`)
  const j = (await res.json()) as { data?: { token?: string } }
  if (!j.data?.token) throw new Error('signIn returned no token')
  return j.data.token
}

/**
 * Content block to wire the tabs child at: getJsonSchema omits x-uid on the
 * Page/Grid/Row/Col levels the module scripts inserted, so walk down past
 * them (depth 0-3) to the first block-body node that carries one, then
 * resolve its parent block — getParentJsonSchema returns the CardItem-level
 * subtree with both x-uid and name, matching the hand-built customers-page
 * wire (tabs.schemaUid = CardItem x-uid, tabs.tabSchemaName = CardItem name).
 */
async function findTabContentBlock(token: string, pageUid: string): Promise<{ uid: string; name: string } | null> {
  const tree = (await dataOf(token, 'GET', `/api/uiSchemas:getJsonSchema/${pageUid}`)) as Json | null
  if (!tree) return null
  const queue: Array<{ node: Json; depth: number }> = [{ node: tree, depth: 0 }]
  let guard = 0
  while (queue.length > 0 && guard < 500) {
    const { node, depth } = queue.shift()!
    guard++
    if (depth >= 4 && typeof node['x-uid'] === 'string') {
      const parent = (await dataOf(token, 'GET', `/api/uiSchemas:getParentJsonSchema/${node['x-uid']}`)) as Json | null
      if (parent && typeof parent['x-uid'] === 'string') {
        return { uid: parent['x-uid'], name: typeof parent.name === 'string' ? parent.name : parent['x-uid'] }
      }
      return null
    }
    for (const child of Object.values((node.properties ?? {}) as Record<string, Json>)) {
      queue.push({ node: child, depth: depth + 1 })
    }
  }
  return null
}

async function main(): Promise<void> {
  const token = await signIn()
  const routes = (await dataOf(token, 'GET', '/api/desktopRoutes:list?pageSize=400')) as Array<Json> | null
  const byParent = new Map<number, Json[]>()
  for (const row of routes ?? []) {
    const parentId = row.parentId as number | null
    if (parentId === null) continue
    const list = byParent.get(parentId) ?? []
    list.push(row)
    byParent.set(parentId, list)
  }
  let fixed = 0
  for (const row of routes ?? []) {
    if (row.type !== 'page' || typeof row.schemaUid !== 'string') continue
    const children = byParent.get(row.id as number) ?? []
    if (children.some((c) => c.type === 'tabs')) continue
    const block = await findTabContentBlock(token, row.schemaUid)
    if (block === null) {
      console.log(`nocobase-n14: page "${row.title}" has no content block (skipped)`)
      continue
    }
    await dataOf(token, 'POST', '/api/desktopRoutes:create', {
      title: '',
      type: 'tabs',
      parentId: row.id,
      schemaUid: block.uid,
      tabSchemaName: block.name,
    })
    console.log(`nocobase-n14: page "${row.title}" wired tabs child -> block ${block.uid}`)
    fixed++
  }
  console.log(`nocobase-n14: done (${fixed} page(s) wired, others kept)`)
}

main().catch((error) => {
  console.error('nocobase-n14: failed:', error)
  process.exitCode = 1
})
