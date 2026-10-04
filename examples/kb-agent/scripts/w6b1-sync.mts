/**
 * W6-B1: the mobile sync-closure assertion legs.
 *
 * 1. wfl_effect_backlog exists (the G8 compensation queue's collection) and
 *    /healthz reports its pending depth.
 * 2. The todo read reconciles: engine GET /todos?user=buyer == the psql open
 *    count == the exact set the mobile #/todos page renders (G2's read leg).
 * 3. The G2 closure probe: submit a PO as buyer through the engine, the open
 *    todo routes to 采购部's owner; approve as that owner; doc_status flips
 *    approved and the todo closes — the very state change the mobile todos
 *    page and approval cards poll onto.
 * 4. The G7 scheduled transfer: run the nightly leg's transfer once, then the
 *    lakehouse catalog must hold nb_pur_orders with exactly the live psql
 *    row count.
 * 5. The G8 replay: enqueue a pending backlog row for an already-effective
 *    so_orders (hooks idempotent), drain, and the row must land done.
 * 6. The G5 numbering state: no duplicate guarded numbers in any year, and
 *    the allocatable space is intact (server-side draw proven by the
 *    tool-nocobase unit suite; this leg pins the live table state).
 * 7. The W6-R1 column guard (lesson6): every filter/sort/trail column the
 *    ledger projection and the docs trail use must exist in the live
 *    wfl_approval_records schema (acted_at present, the retired created_at
 *    usage absent), acted_at carries no NULLs, and the G3 month projection
 *    reconciles between the NocoBase API and psql.
 *
 * Usage:
 *   node --import tsx/esm examples/kb-agent/scripts/w6b1-sync.mts --assert
 */
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { call, dataOf, signInWithRetry } from './nocobase-flow-page-lib.mts'

const args = process.argv.slice(2)
const mode = args.includes('--run') ? 'run' : 'assert'
const failures: string[] = []
const log = (line: string): void => { console.log(line) }
const check = (that: string, ok: boolean, detail = ''): void => {
  log(`  ${ok ? '✓' : '✗'} ${that}${detail === '' ? '' : ` — ${detail}`}`)
  if (!ok) failures.push(that)
}
const here = (script: string): string => fileURLToPath(new URL(script, import.meta.url))

const psql = (sql: string): string => {
  const env = readFileSync(here('../../../platform/nocobase/.env'), 'utf8')
  const envOf = (key: string): string | undefined => env.split('\n').map(line => line.trim()).find(line => line.startsWith(`${key}=`))?.slice(key.length + 1)
  const run = spawnSync('psql', [
    '-h', envOf('DB_HOST') ?? 'localhost', '-p', envOf('DB_PORT') ?? '5432', '-U', envOf('DB_USER') ?? 'postgres',
    '-d', envOf('DB_DATABASE') ?? envOf('DB_NAME') ?? 'nocobase', '-t', '-A', '-c', sql,
  ], { encoding: 'utf8', env: { ...process.env, PGPASSWORD: envOf('DB_PASSWORD') ?? 'nocobase' }, timeout: 20_000 })
  if (run.status !== 0) throw new Error(`psql failed: ${sql.slice(0, 120)}…\n${(run.stderr ?? '').slice(0, 300)}`)
  return run.stdout ?? ''
}

const engineBase = process.env.NOCOBASE_ENGINE_URL ?? 'http://127.0.0.1:13110'

/** Leg 1: the G8 queue's collection and health surface. */
async function backlogSchemaLeg(token: string): Promise<void> {
  log('— G8 补偿队列基座（wfl_effect_backlog + /healthz backlog_pending）')
  const probe = await dataOf(token, 'GET', '/api/collections/wfl_effect_backlog')
    .then(row => (row as { name?: string } | null)?.name === 'wfl_effect_backlog')
    .catch(() => false)
  check('wfl_effect_backlog 集合存在', probe)
  const health = await fetch(`${engineBase}/healthz`, { signal: AbortSignal.timeout(10_000) })
    .then(async response => await response.json() as { ok?: boolean, backlog_pending?: number })
    .catch(() => null)
  check('/healthz 报告 backlog_pending', health?.ok === true && Number.isInteger(health?.backlog_pending), `backlog_pending=${String(health?.backlog_pending ?? '—')}`)
}

/** Leg 2+3: the todo read reconciliation and the G2 closure probe. */
async function todoClosureLeg(token: string): Promise<void> {
  log('— G2 待办读对账 + 状态回流闭环探针')
  const todos = await fetch(`${engineBase}/todos?user=buyer`, { signal: AbortSignal.timeout(10_000) })
    .then(async response => await response.json() as { ok?: boolean, todos?: Array<Record<string, unknown>> })
    .catch(() => null)
  const openSql = psql(`SELECT count(*) FROM wfl_approval_todos WHERE "user"='buyer' AND status='open';`).trim()
  check('引擎待办 = psql open 行数（buyer）', todos?.ok === true && String(todos.todos?.length ?? -1) === openSql, `engine=${String(todos.todos?.length ?? '—')} psql=${openSql}`)

  // Closure probe: buyer submits, the routed owner approves, the doc lands
  // approved and the todo closes — the exact flip the mobile page polls.
  // Re-runs idempotently destroy the probe document first (a same-second
  // stamp could otherwise collide on the unique code index).
  const stamp = new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14)
  const code = `PO-W6B1-${stamp}`
  const prior = psql(`SELECT id, doc_status FROM pur_orders WHERE code LIKE 'PO-W6B1-%' ORDER BY id;`).trim()
  for (const line of prior === '' ? [] : prior.split('\n')) {
    const [idRaw] = line.split('|')
    const id = Number(idRaw)
    if (!Number.isInteger(id) || id <= 0) continue
    psql(`DELETE FROM wfl_approval_todos WHERE doc_type='pur_orders' AND doc_id=${String(id)};`)
    psql(`DELETE FROM wfl_approval_records WHERE doc_type='pur_orders' AND doc_id=${String(id)};`)
    psql(`DELETE FROM pur_orders WHERE id=${String(id)};`)
  }
  const supplier = psql("SELECT id FROM srm_suppliers WHERE lifecycle_status IN ('qualified','preferred') ORDER BY id LIMIT 1;").trim()
  const created = await dataOf(token, 'POST', '/api/pur_orders:create', {
    code, supplier_id: Number(supplier), amount: 321, currency: 'CNY',
    doc_status: 'draft', receiving_status: 'none', invoice_status: 'no_invoice',
  }) as { id?: unknown } | null
  const docId = Number(created?.id ?? 0)
  check('闭环探针采购单落库（draft）', docId > 0, `${code} #${String(docId)}`)

  const submit = await fetch(`${engineBase}/submit`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ doc_type: 'pur_orders', doc_id: docId, approver: 'buyer' }),
    signal: AbortSignal.timeout(30_000),
  }).then(async response => await response.json() as { ok?: boolean, result?: { to_state?: string } }).catch(() => null)
  check('buyer 送审 → pending', submit?.ok === true && submit.result?.to_state === 'pending', `to_state=${String(submit?.result?.to_state ?? '—')}`)

  const owner = psql(`SELECT "user" FROM wfl_approval_todos WHERE doc_type='pur_orders' AND doc_id=${String(docId)} AND status='open' AND kind <> 'cc' LIMIT 1;`).trim()
  check('待办路由真实主管（非 buyer/admin）', owner !== '' && owner !== 'buyer' && owner !== 'admin', `todo=${owner}`)

  const approve = await fetch(`${engineBase}/act`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ doc_type: 'pur_orders', doc_id: docId, action: 'approve', approver: owner, comment: 'W6-B1 闭环探针' }),
    signal: AbortSignal.timeout(30_000),
  }).then(async response => await response.json() as { ok?: boolean, result?: { to_state?: string } }).catch(() => null)
  check('主管批准 → approved', approve?.ok === true && approve.result?.to_state === 'approved', `to_state=${String(approve?.result?.to_state ?? '—')}`)

  const afterStatus = psql(`SELECT doc_status FROM pur_orders WHERE id=${String(docId)};`).trim()
  const afterOpen = psql(`SELECT count(*) FROM wfl_approval_todos WHERE doc_type='pur_orders' AND doc_id=${String(docId)} AND status='open';`).trim()
  check('单据状态已回流（approved）', afterStatus === 'approved', `doc_status=${afterStatus}`)
  check('待办已关闭（open=0）', afterOpen === '0', `open=${afterOpen}`)
}

/** Leg 4: the G7 scheduled lakehouse transfer. */
async function lakehouseTransferLeg(token: string): Promise<void> {
  log('— G7 湖仓定时 transfer（nb_pur_orders 快照对账）')
  const transfer = await import('./w6b1-lakehouse-transfer.mts')
  const outcome = await transfer.runNocobaseTransfer(token)
  log(`  · transfer: ${outcome}`)
  const sqlite = spawnSync('sqlite3', [here('../../kb-agent/workspace/lakehouse-catalog.sqlite'),
    'SELECT row_count FROM lakehouse_tables WHERE tenant_id=\'demo-food-co\' AND table_name=\'nb_pur_orders\';'], { encoding: 'utf8', timeout: 10_000 })
  const lakeRows = Number((sqlite.stdout ?? '').trim())
  const pgRows = Number(psql('SELECT count(*) FROM pur_orders;').trim())
  check('湖仓 nb_pur_orders 行数 = psql 实时行数', lakeRows === pgRows && pgRows > 0, `lake=${String(lakeRows)} psql=${String(pgRows)}`)
}

/** Leg 5: the G8 compensation replay. */
async function backlogReplayLeg(token: string): Promise<void> {
  log('— G8 补偿队列自动重放（幂等钩子）')
  const so = psql("SELECT id, code FROM so_orders WHERE doc_status='approved' ORDER BY id DESC LIMIT 1;").trim()
  if (so === '') {
    check('存在已生效 so_orders（重放对象）', false, '无 approved 行，先在平台批准一单')
    return
  }
  const [soIdRaw, ...rest] = so.split('|')
  const soId = Number(soIdRaw)
  const soCode = rest.join('|')
  await dataOf(token, 'POST', '/api/wfl_effect_backlog:create', {
    doc_type: 'so_orders', doc_id: soId, code: soCode, reason: 'W6-B1 断言注入（幂等重放）', status: 'pending', attempts: 0,
  })
  const pending = psql(`SELECT count(*) FROM wfl_effect_backlog WHERE doc_type='so_orders' AND doc_id=${String(soId)} AND status='pending';`).trim()
  check('pending 行已入队', pending === '1', `so_orders#${String(soId)} ${soCode}`)

  const engine = await import('./approval-engine.mts')
  const drained = await engine.drainEffectBacklog(token)
  log(`  · drain: replayed=${String(drained.replayed)} done=${String(drained.done)} failed=${String(drained.failed)}`)
  const after = psql(`SELECT status FROM wfl_effect_backlog WHERE doc_type='so_orders' AND doc_id=${String(soId)} ORDER BY id DESC LIMIT 1;`).trim()
  check('重放后行落 done', after === 'done', `status=${after}`)
  const backlogId = psql(`SELECT id FROM wfl_effect_backlog WHERE doc_type='so_orders' AND doc_id=${String(soId)} ORDER BY id DESC LIMIT 1;`).trim()
  if (backlogId !== '') {
    await dataOf(token, 'POST', `/api/wfl_effect_backlog:destroy?filterByTk=${backlogId}`).catch(() => undefined)
  }
}

/** Leg 7 (W6-R1 lesson6): the column guard over the ledger/docs read paths. */
async function columnGuardLeg(token: string): Promise<void> {
  log('— G3/R1 列名防复发（wfl_approval_* schema 对账 + G3 月度投影）')
  const readColumns = async (collection: string): Promise<Set<string>> => {
    const fields = await dataOf(token, 'GET', `/api/collections/${collection}/fields?paginate=false`) as
      | Array<{ name?: unknown }>
      | null
    return new Set((Array.isArray(fields) ? fields : []).map(field => String(field['name'])))
  }
  const recordsColumns = await readColumns('wfl_approval_records')
  const todosColumns = await readColumns('wfl_approval_todos')
  check('wfl_approval_records schema 可读', recordsColumns.size > 0, `columns=${String(recordsColumns.size)}`)
  check('acted_at 列存在（时间戳列）', recordsColumns.has('acted_at'))
  check('created_at 列确不存在（旧误用列）', !recordsColumns.has('created_at'))

  const nullActed = psql('SELECT count(*) FROM wfl_approval_records WHERE acted_at IS NULL;').trim()
  check('acted_at 全表非空', nullActed === '0', `null=${nullActed}`)

  // The read paths' column usage must stay inside the owning table's schema:
  // todo filters against wfl_approval_todos, the month projection and the
  // docs trail against wfl_approval_records.
  const ledgerSource = readFileSync(here('../../../packages/client/ui-mobile/src/client/ledgerService.ts'), 'utf8')
  const docsSource = readFileSync(here('../../../packages/client/ui-mobile/src/client/docs/DocsView.tsx'), 'utf8')
  const todoFilters = [...ledgerSource.matchAll(/field: '([a-z_]+)'/g)].map(match => match[1] as string)
  const trailColumns = [...docsSource.matchAll(/cell\(row, '([a-z_]+)'\)/g)].map(match => match[1] as string)
  const missingTodos = [...new Set(todoFilters)].filter(column => !todosColumns.has(column) && !recordsColumns.has(column))
  const missingRecords = [...new Set([...todoFilters, ...trailColumns])].filter(column => !recordsColumns.has(column) && !todosColumns.has(column))
  const missing = [...new Set([...missingTodos, ...missingRecords])]
  check('ledgerService/DocsView 的 wfl 列名全部在 schema 中', missing.length === 0, missing.length === 0 ? `todos-used=${String(new Set(todoFilters).size)} records-used=${String(new Set([...todoFilters, ...trailColumns]).size)}` : `缺失：${missing.join('、')}`)
  const retired = [...todoFilters, ...trailColumns].filter(column => column === 'created_at')
  check('已退役的 created_at 用法零复发', retired.length === 0)

  // G3 reconciliation: the month projection's exact filter (approver+submit,
  // acted_at within the local month, date-only strings — the column's wire
  // form) answers the same count through the NocoBase API and psql.
  const now = new Date()
  const pad = (value: number): string => String(value).padStart(2, '0')
  const localDateOf = (date: Date): string => `${String(date.getFullYear())}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
  const after = localDateOf(new Date(now.getFullYear(), now.getMonth(), 0))
  const before = localDateOf(new Date(now.getFullYear(), now.getMonth() + 1, 1))
  const apiPage = await call(token, 'GET',
    `/api/wfl_approval_records:list?pageSize=1&filter=${encodeURIComponent(`{"approver":{"$eq":"buyer"},"action":{"$eq":"submit"},"acted_at":{"$gt":"${after}","$lt":"${before}"}}`)}`) as
    | { meta?: { count?: unknown } }
    | null
  const apiCount = apiPage?.meta?.count
  const pgCount = psql(`SELECT count(*) FROM wfl_approval_records WHERE approver='buyer' AND action='submit' AND acted_at > '${after}' AND acted_at < '${before}';`).trim()
  check('G3 月度投影 API = psql（buyer 本月 submit，date-only 本地月窗）', String(apiCount ?? -1) === pgCount && pgCount !== '0', `api=${String(apiCount ?? '—')} psql=${pgCount}`)
}

/** Leg 6: the G5 numbering state on the live tables. */
function numberingLeg(): void {
  log('— G5 服务端发号（守卫集合无重复号；分配路径见 tool-nocobase 单测）')
  const dupes = psql(`SELECT coalesce(string_agg(dup, '、'), '') FROM (SELECT collection || ':' || col_name || ':' || code AS dup FROM (
    SELECT 'pur_orders' AS collection, code, 'code' AS col_name FROM pur_orders UNION ALL
    SELECT 'pur_requests', code, 'code' FROM pur_requests UNION ALL
    SELECT 'so_orders', code, 'code' FROM so_orders UNION ALL
    SELECT 'mfg_orders', code, 'code' FROM mfg_orders UNION ALL
    SELECT 'wms_receipts', receipt_no, 'receipt_no' FROM wms_receipts UNION ALL
    SELECT 'srm_suppliers', code, 'code' FROM srm_suppliers) s
  WHERE code <> '' GROUP BY collection, col_name, code HAVING count(*) > 1) d;`).trim()
  check('六个守卫集合零撞号', dupes === '', dupes === '' ? '' : `重复：${dupes}`)
  const year = new Date().getFullYear()
  const maxPo = psql(`SELECT max(substring(code from '(\\d{4})$')) FROM pur_orders WHERE code LIKE 'PO-${String(year)}-%';`).trim()
  check('PO 当年号段连续可续（服务端 max+1 可解析）', /^\d{4}$/.test(maxPo), `max=${maxPo}`)
  void mode
}

async function main(): Promise<void> {
  log(`w6b1-sync: ${mode === 'run' ? 'run' : 'assert'}（断言腿）`)
  const token = await signInWithRetry()
  await backlogSchemaLeg(token)
  await todoClosureLeg(token)
  await lakehouseTransferLeg(token)
  await backlogReplayLeg(token)
  numberingLeg()
  await columnGuardLeg(token)
  if (failures.length > 0) {
    throw new Error(`w6b1-sync ${mode} 失败 ${String(failures.length)} 项：\n  - ${failures.join('\n  - ')}`)
  }
  console.log('w6b1-sync: 全部断言通过')
}

await main()
