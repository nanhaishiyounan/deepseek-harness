// W4-B4 live probe: pre-execution state snapshot for the two retired pages,
// rename targets' live titles, group children counts, and flowModels subtree
// shape (the destroy-cascade ledger basis). Read-only.
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

const API = process.env.NOCOBASE_BASE_URL || 'http://127.0.0.1:13000'
const RETIRED = ['n17f3gnpjv8rfd85', 'n17f34fr9khfzdhq'] // 采购联系人（历史） / 工作台
const TITLE_TARGETS = ['排产看板', '排程明细', 'MO执行视图', 'MO 执行视图', 'AQL抽样方案', 'AQL 抽样方案', 'MRP快照', 'MRP 快照', '应用中心', 'AI 工作台']

const r = await fetch(`${API}/api/auth:signIn`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ account: 'admin@nocobase.com', password: 'admin123' }) })
const token = (await r.json())?.data?.token
if (!token) throw new Error('signIn failed')
const auth = { authorization: `Bearer ${token}` }

const routes = (await (await fetch(`${API}/api/desktopRoutes:list?pageSize=400`, { headers: auth })).json()).data
console.log('desktopRoutes total =', routes.length)
const byId = new Map(routes.map(x => [x.id, x]))
console.log('--- title targets (live) ---')
for (const row of routes) if (TITLE_TARGETS.includes(row.title) && row.type !== 'tabs') {
  console.log(row.type, row.id, JSON.stringify(row.title), 'parentId=', row.parentId, 'parent=', byId.get(row.parentId ?? 0)?.title ?? '(top)', 'schemaUid=', row.schemaUid)
}
console.log('--- retired pages + their tabs rows ---')
for (const uid of RETIRED) {
  const flow = routes.find(x => x.type === 'flowPage' && x.schemaUid === uid)
  if (!flow) { console.log(uid, '-> NOT FOUND (already retired?)'); continue }
  const tabs = routes.filter(x => x.type === 'tabs' && x.parentId === flow.id)
  console.log('flowPage', flow.id, JSON.stringify(flow.title), 'icon=', JSON.stringify(flow.icon), 'sort=', flow.sort, 'parentId=', flow.parentId)
  for (const t of tabs) console.log('  tabs', t.id, 'schemaUid=', t.schemaUid, 'tabSchemaName=', t.tabSchemaName, 'sort=', t.sort)
}
console.log('--- group children counts ---')
const groups = routes.filter(x => x.type === 'group')
for (const g of groups) {
  const kids = routes.filter(x => x.parentId === g.id)
  console.log(JSON.stringify(g.title), g.id, 'children=', kids.length, '->', kids.map(k => k.title).join(' | '))
}
console.log('--- type totals ---')
const tc = {}
for (const x of routes) tc[x.type] = (tc[x.type] ?? 0) + 1
console.log(JSON.stringify(tc))

// flowModels subtree BFS from each retired page root uid
const models = []
for (let p = 1; ; p++) {
  const batch = (await (await fetch(`${API}/api/flowModels:list?pageSize=500&page=${p}`, { headers: auth })).json()).data
  models.push(...batch)
  if (models.length >= 500 * p && batch.length === 500) continue
  break
}
console.log('flowModels total =', models.length)
const byParent = new Map()
for (const m of models) {
  const k = String(m.parentId ?? '')
  if (!byParent.has(k)) byParent.set(k, [])
  byParent.get(k).push(m)
}
for (const uid of RETIRED) {
  const root = models.find(m => m.uid === uid)
  const subtree = []
  const queue = [uid]
  while (queue.length) {
    const cur = queue.shift()
    for (const child of byParent.get(cur) ?? []) { subtree.push(child); queue.push(String(child.uid)) }
  }
  console.log(`subtree of ${uid}: root use=${root?.use ?? 'MISSING'}, descendants=${subtree.length}, uses=${JSON.stringify([...new Set(subtree.map(s => s.use))].slice(0, 12))}`)
}

// psql counts for the retired pages' collections
const env = readFileSync('platform/nocobase/.env', 'utf8')
const envOf = (key) => env.split('\n').map(l => l.trim()).find(l => l.startsWith(`${key}=`))?.slice(key.length + 1)
const psqlOne = (sql) => execFileSync('psql', ['-h', envOf('DB_HOST') ?? 'localhost', '-p', envOf('DB_PORT') ?? '5432', '-U', envOf('DB_USER') ?? 'postgres', '-d', envOf('DB_NAME') ?? 'nocobase', '-t', '-A', '-c', sql], { encoding: 'utf8', env: { ...process.env, PGPASSWORD: envOf('DB_PASSWORD') ?? 'nocobase' } }).trim()
for (const table of ['hub_po_suppliers', 'hub_pj_tasks', 'hub_tk_tickets']) {
  console.log(`psql count ${table} =`, psqlOne(`SELECT COUNT(*) FROM ${table};`))
}
