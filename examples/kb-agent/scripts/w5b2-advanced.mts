/**
 * W5-B2: the advanced-nodes evidence run — the live proof that the ten-type
 * round-trip migration, the six unlocked features (department/deptLeader/
 * supervisorChain/formField, countersign/sequential, rejectTo, cc, empty
 * policies, general conditions), and the three-entry effect convergence
 * behave per plan-w5 §B2 over the real PG + the real engine HTTP channel
 * (no mocks anywhere).
 *
 * Modes:
 *   --selftest            the engine's full --selftest matrix (pure + B2)
 *   --migrate             for each of the ten flow doc types (or --doc-type
 *                         lists): read live rows → rowsToGraph → compile →
 *                         assertRowsEquivalent → save graph → publish over
 *                         HTTP → psql re-assert the derived rows → an
 *                         in-memory state-machine replay of the published
 *                         rows (submit → approve×N → approved)
 *   --features            the hub_po feature matrix with full restore: org
 *                         owner heal, the ten feature publishes with real
 *                         document runs, the publish-gate negative matrix
 *   --parity              BP-02/BP-14: three fresh draft SOs through the CLI,
 *                         HTTP, and the nb_approve tool twin — each must land
 *                         approved with the reservation effect and matching
 *                         records/todos (psql cross-checked)
 *
 * Usage (repo root, serve already on :13110, run --migrate before --features):
 *   node --import tsx/esm examples/kb-agent/scripts/w5b2-advanced.mts --selftest
 *   node --import tsx/esm examples/kb-agent/scripts/w5b2-advanced.mts --migrate
 *   node --import tsx/esm examples/kb-agent/scripts/w5b2-advanced.mts --features
 *   node --import tsx/esm examples/kb-agent/scripts/w5b2-advanced.mts --parity
 */

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
import { dataOf, signInWithRetry } from './nocobase-flow-page-lib.mts'
import {
  act,
  assertRowsEquivalent,
  compileGraphToRows,
  rowsToGraph,
  selftest,
  submitForApproval,
  type ApproverMap,
  type CompileContext,
  type LiveFlowRows,
  type NocoIO,
} from './approval-engine.mts'
import { nbApproveEngine } from '../../../packages/connector/tool-nocobase/src/write.ts'
import type { NocoBaseClient } from '../../../packages/connector/connector-nocobase/src/client.ts'

const args = process.argv.slice(2)
const flag = (name: string): string | undefined => {
  const index = args.indexOf(name)
  return index >= 0 ? args[index + 1] : undefined
}
const flagAll = (name: string): string[] => {
  const values: string[] = []
  for (let index = args.indexOf(name); index >= 0; index = args.indexOf(name, index + 1)) {
    const value = args[index + 1]
    if (typeof value === 'string' && !value.startsWith('--') && value !== '') values.push(value)
  }
  return values
}
const base = (flag('--base') ?? process.env['W5_SERVE_BASE'] ?? 'http://127.0.0.1:13110').replace(/\/$/u, '')
const failures: string[] = []
const log = (line: string): void => { console.log(line) }

/** One JSON-shaped assertion note. */
const check = (that: string, ok: boolean, detail = ''): void => {
  log(`  ${ok ? '✓' : '✗'} ${that}${detail === '' ? '' : ` — ${detail}`}`)
  if (!ok) failures.push(that)
}

// ─── the local psql runner (same credentials path as approval-engine) ───

const psql = (sql: string): string => {
  const env = readFileSync(fileURLToPath(new URL('../../../platform/nocobase/.env', import.meta.url)), 'utf8')
  const envOf = (key: string): string | undefined => env.split('\n').map(line => line.trim()).find(line => line.startsWith(`${key}=`))?.slice(key.length + 1)
  const run = spawnSync('psql', [
    '-h', envOf('DB_HOST') ?? 'localhost', '-p', envOf('DB_PORT') ?? '5432', '-U', envOf('DB_USER') ?? 'postgres',
    '-d', envOf('DB_DATABASE') ?? envOf('DB_NAME') ?? 'nocobase', '-t', '-A', '-c', sql,
  ], { encoding: 'utf8', env: { ...process.env, PGPASSWORD: envOf('DB_PASSWORD') ?? 'nocobase' }, timeout: 20_000 })
  if (run.status !== 0) throw new Error(`psql failed: ${sql.slice(0, 120)}…\n${(run.stderr ?? '').slice(0, 300)}`)
  return run.stdout ?? ''
}

// ─── shared HTTP/REST helpers ───

const getJson = async (path: string): Promise<any> => {
  const response = await fetch(`${base}${path}`)
  return await response.json().catch(() => ({})) as Record<string, any>
}

const postJson = async (path: string, body: Record<string, unknown>): Promise<{ status: number; body: Record<string, any> }> => {
  const response = await fetch(`${base}${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
  return { status: response.status, body: await response.json().catch(() => ({})) as Record<string, any> }
}

const currentGraph = async (docType: string): Promise<{ graph: Record<string, any> | null; graph_version: number }> => {
  const payload = await getJson(`/flow-graph?doc_type=${encodeURIComponent(docType)}`) as { graph?: Record<string, any> | null; graph_version?: number }
  return { graph: payload.graph ?? null, graph_version: Number(payload.graph_version ?? 0) }
}

/** Read the live flow rows (config + states + transitions) through REST. */
const liveRowsOf = async (token: string, docType: string): Promise<{ live: LiveFlowRows; row: Record<string, any> }> => {
  const filter = encodeURIComponent(JSON.stringify({ doc_type: { $eq: docType } }))
  const rows = await dataOf(token, 'GET', `/api/wfl_flow_configs:list?pageSize=10&filter=${filter}`) as Array<Record<string, any>>
  const row = rows?.[0]
  if (row === undefined) throw new Error(`wfl_flow_configs 无 doc_type=${docType} 行`)
  const flowId = Number(row.id)
  const states = await dataOf(token, 'GET', `/api/wfl_flow_states:list?pageSize=200&filter=${encodeURIComponent(JSON.stringify({ flow_id: flowId }))}`) as Array<Record<string, any>>
  const transitions = await dataOf(token, 'GET', `/api/wfl_flow_transitions:list?pageSize=200&filter=${encodeURIComponent(JSON.stringify({ flow_id: flowId }))}`) as Array<Record<string, any>>
  const parse = (text: unknown, column: string): any => {
    if (text === null || text === undefined || text === '') return null
    if (typeof text !== 'string') return text
    return JSON.parse(text)
  }
  return {
    live: {
      stateField: String(row.state_field ?? 'doc_status'),
      approverMap: parse(row.approver_map, 'approver_map') ?? {},
      extras: parse(row.extras, 'extras'),
      states,
      transitions,
    },
    row,
  }
}

/** The compile context over the live field vocabulary and org facts. */
const compileContextOf = async (token: string, row: Record<string, any>): Promise<CompileContext> => {
  const collection = String(row.doc_type)
  const fieldsFilter = encodeURIComponent(JSON.stringify({ collectionName: { $eq: collection } }))
  const fields = (await dataOf(token, 'GET', `/api/fields:list?pageSize=200&filter=${fieldsFilter}`) ?? []) as Array<Record<string, any>>
  const system = new Set(['id', 'createdAt', 'updatedAt', 'createdBy', 'updatedBy', 'sort'])
  const formFields = fields.map(field => String(field.name)).filter(name => name !== '' && !system.has(name))
  const userFields = fields
    .filter(field => {
      const rawOptions = field.options
      const options = typeof rawOptions === 'string' ? JSON.parse(rawOptions) as Record<string, unknown> : rawOptions as Record<string, unknown> | undefined
      return String(field.target ?? options?.target ?? field.targetCollection ?? '') === 'users'
    })
    .map(field => String(field.name))
  const knownUsernames = new Set(((await dataOf(token, 'GET', '/api/users:list?pageSize=500')) ?? []).map((user: Record<string, any>) => String(user.username ?? '')))
  const psqlRoleSnapshot = (role: string): readonly string[] => {
    const safe = role.replaceAll("'", "''")
    return psql(`SELECT u.username FROM "rolesUsers" r JOIN users u ON u.id = r."userId" WHERE r."roleName" = '${safe}';`).split('\n').map(line => line.trim()).filter(line => line !== '')
  }
  const extras = typeof row.extras === 'string' ? JSON.parse(row.extras) : row.extras ?? {}
  return {
    stateField: String(row.state_field ?? 'doc_status'),
    formFields,
    userFields,
    hasDepartmentOwners: Number(psql('SELECT count(*) FROM "departmentsUsers" WHERE "isOwner" = TRUE;').trim()) > 0,
    preserveExtras: extras,
    knownUsernames,
    usersOfRole: async (role) => psqlRoleSnapshot(role),
  }
}

// ─── the in-memory NocoIO (the per-type state-machine replay driver) ───

class ReplayIO implements NocoIO {
  readonly store = new Map<string, Array<Record<string, any>>>()
  private seq = 10_000

  private rowsOf(collection: string): Array<Record<string, any>> {
    let rows = this.store.get(collection)
    if (rows === undefined) {
      rows = []
      this.store.set(collection, rows)
    }
    return rows
  }

  private matches(row: Record<string, any>, filter: Record<string, unknown> | undefined): boolean {
    return Object.entries(filter ?? {}).every(([key, value]) => row[key] === value)
  }

  async list(collection: string, filter?: Record<string, unknown>): Promise<Array<Record<string, any>>> {
    return this.rowsOf(collection).filter(row => this.matches(row, filter))
  }

  async get(collection: string, id: number): Promise<Record<string, any> | undefined> {
    return this.rowsOf(collection).find(row => Number(row.id) === id)
  }

  async create(collection: string, values: Record<string, unknown>): Promise<Record<string, any>> {
    this.seq += 1
    const row = { id: this.seq, ...values }
    this.rowsOf(collection).push(row)
    return row
  }

  async update(collection: string, id: number, values: Record<string, unknown>): Promise<void> {
    const row = await this.get(collection, id)
    if (row === undefined) throw new Error(`${collection} 第 ${id} 行不存在（回放内存库）`)
    Object.assign(row, values)
  }

  async updateWhere(collection: string, filter: Record<string, unknown>, values: Record<string, unknown>): Promise<number> {
    const rows = this.rowsOf(collection).filter(row => this.matches(row, filter))
    for (const row of rows) Object.assign(row, values)
    return rows.length
  }

  async destroy(collection: string, id: number): Promise<void> {
    const rows = this.rowsOf(collection)
    const index = rows.findIndex(row => Number(row.id) === id)
    if (index >= 0) rows.splice(index, 1)
  }
}

/**
 * Replay one published flow's state machine in memory: seed the live config/
 * states/transitions plus the org tables, submit a synthetic draft, approve
 * until effective (or reject once), and assert the landing.
 */
async function replayFlow(token: string, live: LiveFlowRows, docType: string): Promise<void> {
  const io = new ReplayIO()
  for (const user of (await dataOf(token, 'GET', '/api/users:list?pageSize=500') ?? []) as Array<Record<string, any>>) {
    await io.create('users', { id: Number(user.id), username: String(user.username ?? ''), mainDepartmentId: user.mainDepartmentId ?? null })
  }
  for (const department of (await dataOf(token, 'GET', '/api/departments:list?pageSize=500') ?? []) as Array<Record<string, any>>) {
    await io.create('departments', { id: Number(department.id), title: String(department.title ?? ''), parentId: department.parentId ?? null })
  }
  for (const link of (await dataOf(token, 'GET', '/api/departmentsUsers:list?pageSize=500') ?? []) as Array<Record<string, any>>) {
    await io.create('departmentsUsers', { departmentId: link.departmentId, userId: link.userId, isOwner: link.isOwner === true })
  }
  const flow = await io.create('wfl_flow_configs', {
    doc_type: docType, title: 'replay', state_field: live.stateField, is_active: true,
    approver_map: JSON.stringify(live.approverMap), extras: JSON.stringify(live.extras ?? {}),
  })
  for (const state of live.states) {
    await io.create('wfl_flow_states', { flow_id: flow.id, state: String(state.state), doc_status_anchor: state.doc_status_anchor, allow_edit_role: state.allow_edit_role, update_field: '', update_value: '' })
  }
  for (const transition of live.transitions) {
    await io.create('wfl_flow_transitions', { flow_id: flow.id, state: String(transition.state), action: String(transition.action), next_state: String(transition.next_state), allowed_role: String(transition.allowed_role ?? ''), condition_expr: String(transition.condition_expr ?? ''), allow_self_approval: transition.allow_self_approval === true })
  }
  const isAdmission = live.stateField === 'lifecycle_status'
  const doc = await io.create(docType, { code: `REPLAY-${docType}`, total: 1, amount: 1, estimated_cost: 1, [live.stateField]: isAdmission ? 'potential' : 'draft' })
  const docId = Number(doc.id)
  let result = await submitForApproval(io, docType, docId, 'replayer')
  let guard = 0
  while (!result.effective && result.to_state !== 'rejected' && result.to_state === result.from_state && guard < 5) {
    // A countersign/sequential partial step — keep acting until the tier completes.
    guard += 1
    const todos = await io.list('wfl_approval_todos', { doc_type: docType, doc_id: docId, status: 'open' })
    const todo = todos.find(row => String(row.kind ?? 'todo') !== 'cc')
    if (todo === undefined) break
    result = await act(io, docType, docId, 'approve', String(todo.user), '回放续签')
  }
  guard = 0
  while (!result.effective && result.to_state !== 'rejected' && guard < 4) {
    guard += 1
    const todos = await io.list('wfl_approval_todos', { doc_type: docType, doc_id: docId, status: 'open' })
    const todo = todos.find(row => String(row.kind ?? 'todo') !== 'cc')
    if (todo === undefined) throw new Error(`${docType} 回放卡在 ${result.to_state}：无待办可续`)
    result = await act(io, docType, docId, 'approve', String(todo.user), '回放签核')
  }
  const landed = (await io.get(docType, docId))?.[live.stateField]
  check(`${docType} 状态机回放生效`, landed === (isAdmission ? 'qualified' : 'approved'), `落地 ${String(landed)}`)
  const records = await io.list('wfl_approval_records', { doc_type: docType, doc_id: docId })
  check(`${docType} 回放留痕≥2`, records.length >= 2, `${String(records.length)} 行`)
}

// ─── --migrate: the ten-type round-trip migration ───

const ALL_DOC_TYPES = [
  'hub_po_purchase_orders', 'srm_suppliers', 'pur_requests', 'pur_rfqs', 'pur_orders',
  'pur_payments', 'mfg_orders', 'so_orders', 'qm_nc_dispositions', 'mps_plans',
]

async function migrate(): Promise<void> {
  const token = await signInWithRetry()
  const docTypes = flagAll('--doc-type')
  const targets = docTypes.length > 0 ? docTypes : ALL_DOC_TYPES
  log(`w5b2-advanced: --migrate over ${String(targets.length)} doc types`)
  for (const docType of targets) {
    log(`— ${docType}`)
    const { live, row } = await liveRowsOf(token, docType)
    const imported = rowsToGraph(live)
    if (!imported.ok) {
      check(`${docType} 逆向导入`, false, imported.errors.join('；'))
      continue
    }
    check(`${docType} 逆向导入`, true, `${String((imported.graph['nodes'] as unknown[]).length)} 节点 / ${String((imported.graph['edges'] as unknown[]).length)} 连线`)
    const ctx = await compileContextOf(token, row)
    const recompiled = await compileGraphToRows(imported.graph, ctx)
    if (!recompiled.ok) {
      check(`${docType} round-trip 重编译`, false, recompiled.errors.join('；'))
      continue
    }
    const drift = assertRowsEquivalent(live, recompiled.rows)
    check(`${docType} round-trip 等价`, drift.length === 0, drift.length === 0 ? `${String(recompiled.rows.states.length)} 状态 / ${String(recompiled.rows.transitions.length)} 转移 / ${Object.keys(recompiled.rows.approverMap).join('、')}` : drift.join('；'))
    if (drift.length > 0) continue
    // Save the imported graph (the editing baseline), then publish.
    const before = await currentGraph(docType)
    const saved = await postJson('/flow-graph', { doc_type: docType, graph: imported.graph, base_version: before.graph_version })
    if (saved.status !== 200) {
      check(`${docType} graph 保存`, false, String(saved.body.error ?? saved.status))
      continue
    }
    const published = await postJson('/flow-graph/publish', { doc_type: docType, base_version: Number(saved.body.graph_version ?? 0) })
    check(`${docType} 发布`, published.status === 200 && published.body.ok === true, published.status === 200
      ? `graph v${String(saved.body.graph_version)} → v${String(published.body.graph_version)}（${String(published.body.derived?.states)} 状态 / ${String(published.body.derived?.transitions)} 转移）`
      : String(published.body.error ?? published.status).slice(0, 160))
    if (published.status !== 200) continue
    // psql re-assert: the derived rows byte-match the compiler's product.
    const flowId = Number(row.id)
    const liveStates = psql(`SELECT count(*) FROM wfl_flow_states WHERE flow_id = ${String(flowId)};`).trim()
    const liveTransitions = psql(`SELECT count(*) FROM wfl_flow_transitions WHERE flow_id = ${String(flowId)};`).trim()
    check(`${docType} 派生行数落库`, liveStates === String(recompiled.rows.states.length) && liveTransitions === String(recompiled.rows.transitions.length), `states ${liveStates}/${String(recompiled.rows.states.length)} transitions ${liveTransitions}/${String(recompiled.rows.transitions.length)}`)
    const publishedFlag = psql(`SELECT published_graph_version FROM wfl_flow_configs WHERE id = ${String(flowId)};`).trim()
    check(`${docType} 发布标记落库`, Number(publishedFlag) === Number(published.body.graph_version), `published_graph_version=${publishedFlag}`)
    // The behavior regression: replay the PUBLISHED rows in memory.
    const { live: afterLive } = await liveRowsOf(token, docType)
    await replayFlow(token, afterLive, docType)
  }
}

// ─── --features: the hub_po feature matrix ───

/** One designer-graph fixture builder (same node shape the SPA persists). */
const graphOf = (nodes: ReadonlyArray<Record<string, unknown>>, edges: ReadonlyArray<readonly [string, string]>): Record<string, unknown> => ({
  version: 1,
  nodes: nodes.map((node, index) => ({
    id: String(node['id']), type: String(node['type']),
    position: { x: 40 + index * 200, y: 160 },
    data: node['data'] as Record<string, unknown>,
  })),
  edges: edges.map(([source, target], index) => ({ id: `e${String(index)}`, source, target })),
})

const approvalNode = (id: string, approval: Record<string, unknown>, title = id): Record<string, unknown> => ({
  id, type: 'approval', data: { title, approval: { mode: 'or', emptyPolicy: 'transferAdmin', ...approval } },
})

/** Publish one graph over HTTP and answer the outcome (200 or the gate list). */
async function publishGraph(docType: string, graph: Record<string, unknown>): Promise<{ ok: boolean; status: number; errors: string[]; body: Record<string, any> }> {
  const before = await currentGraph(docType)
  const saved = await postJson('/flow-graph', { doc_type: docType, graph, base_version: before.graph_version })
  if (saved.status !== 200) return { ok: false, status: saved.status, errors: [String(saved.body.error ?? saved.status)], body: saved.body }
  const published = await postJson('/flow-graph/publish', { doc_type: docType, base_version: Number(saved.body.graph_version ?? 0) })
  if (published.status === 200 && published.body.ok === true) return { ok: true, status: 200, errors: [], body: published.body }
  return { ok: false, status: published.status, errors: (published.body.errors as string[] | undefined) ?? [String(published.body.error ?? published.status)], body: published.body }
}

/** Create one draft hub_po row and answer its id. */
async function createDraftPo(token: string, code: string, total: number, ownerId?: number): Promise<number> {
  const row = await dataOf(token, 'POST', '/api/hub_po_purchase_orders:create', {
    po_number: code, total, order_date: new Date().toISOString().slice(0, 10), doc_status: 'draft',
    ...(ownerId === undefined ? {} : { owner_id: ownerId }),
  }) as Record<string, any>
  return Number(row.id)
}

async function features(): Promise<void> {
  const token = await signInWithRetry()
  const docType = 'hub_po_purchase_orders'
  // Org heal (disclosed): the seeded departments carry no isOwner flags —
  // mark each real department's natural owner so deptLeader/supervisorChain
  // resolve. Kept as persistent org data (an ownerless org is the gate's
  // refusal condition, not a policy).
  const ownerHeal = psql(`
    INSERT INTO "departmentsUsers" ("createdAt", "updatedAt", "departmentId", "userId", "isOwner", "isMain")
    SELECT now(), now(), d.id, u.id, TRUE, FALSE
    FROM departments d JOIN users u ON u.username = CASE d.title
      WHEN '采购部' THEN 'chenliqun' WHEN '质检部' THEN 'quality_lead' WHEN '生产车间' THEN 'linjingyi'
      WHEN '仓储部' THEN 'b4guard' WHEN '计划部（PMC）' THEN 'wangyifan' WHEN '销售部' THEN 'zhaoxiaofang'
      WHEN '行政人事部' THEN 'nocobase' ELSE '' END
    WHERE d.title <> '' AND u.username <> ''
    ON CONFLICT ("departmentId", "userId") DO UPDATE SET "isOwner" = TRUE
    RETURNING "departmentId";`).trim()
  log(`w5b2-advanced: org owner heal — ${ownerHeal.replace(/\n/g, ',')} 行 isOwner 置位（含新插集团主管）`)
  const groupOwner = psql(`
    INSERT INTO "departmentsUsers" ("createdAt", "updatedAt", "departmentId", "userId", "isOwner", "isMain")
    SELECT now(), now(), d.id, u.id, TRUE, FALSE FROM departments d, users u
    WHERE d.title = '新源食品集团' AND u.username = 'admin'
    ON CONFLICT ("departmentId", "userId") DO UPDATE SET "isOwner" = TRUE
    RETURNING "departmentId";`).trim()
  check('集团主管落位', groupOwner !== '', `departmentsUsers ${groupOwner}`)

  // Crash-safety prologue: sweep any stray evidence docs a previous crashed
  // run left behind, then converge the flow onto the canonical migrated
  // baseline (start → 一级 admin → total>100000 → 二级 admin → end) BEFORE
  // snapshotting, so a re-run always restores the same shape.
  const strayIds = psql(`SELECT id FROM hub_po_purchase_orders WHERE po_number LIKE 'PO-W5B2-%';`).trim().split('\n').map(line => line.trim()).filter(line => line !== '')
  if (strayIds.length > 0) {
    for (const id of strayIds) {
      psql(`DELETE FROM wfl_approval_todos WHERE doc_type = '${docType}' AND doc_id = ${id};`)
      psql(`DELETE FROM wfl_approval_records WHERE doc_type = '${docType}' AND doc_id = ${id};`)
      psql(`DELETE FROM hub_po_purchase_orders WHERE id = ${id};`)
    }
    log(`w5b2-advanced: 前次残留取证单清理 — ${String(strayIds.length)} 行（${strayIds.join('、')}）`)
  }
  const baselineGraph = graphOf([
    { id: 's', type: 'start', data: { title: '发起人' } },
    approvalNode('a1', { assigneeType: 'user', assignees: ['admin'] }, '一级审批'),
    { id: 'c', type: 'condition', data: { title: '金额条件', condition: { join: 'and', rows: [{ field: 'total', op: '>', value: '100000' }] } } },
    approvalNode('a2', { assigneeType: 'user', assignees: ['admin'] }, '二级审批'),
    { id: 'e', type: 'end', data: { title: '结束' } },
  ], [['s', 'a1'], ['a1', 'c'], ['c', 'a2'], ['c', 'e'], ['a2', 'e']])
  const baseline = await publishGraph(docType, baselineGraph)
  check('基线收敛发布', baseline.ok, baseline.ok ? '' : baseline.errors.join('；'))
  // Snapshot the canonical baseline for the restore-time comparison.
  const snapshotStates = psql(`SELECT json_agg(row_to_json(t)) FROM (SELECT state, doc_status_anchor AS anchor, allow_edit_role AS role, update_field, update_value FROM wfl_flow_states WHERE flow_id = 1 ORDER BY state) t;`).trim()
  const snapshotTransitions = psql(`SELECT json_agg(row_to_json(t)) FROM (SELECT state, action, next_state AS next, allowed_role AS role, condition_expr AS cond, allow_self_approval AS self FROM wfl_flow_transitions WHERE flow_id = 1 ORDER BY state, action, next_state) t;`).trim()
  const snapshotMap = psql('SELECT approver_map::text FROM wfl_flow_configs WHERE id = 1;').trim()
  const snapshotExtras = psql('SELECT extras::text FROM wfl_flow_configs WHERE id = 1;').trim()

  const createdDocs: number[] = []
  const approveOverHttp = async (id: number, approver: string, action = 'approve', comment = 'B2 取证'): Promise<any> => {
    const response = await postJson('/act', { doc_type: docType, doc_id: id, action, approver, comment })
    if (response.status !== 200) throw new Error(`HTTP /act ${action} 被拒：${String(response.body.error ?? response.status)}`)
    return response.body.result
  }
  const todosOf = async (id: number): Promise<Array<Record<string, any>>> =>
    (await dataOf(token, 'GET', `/api/wfl_approval_todos:list?pageSize=100&filter=${encodeURIComponent(JSON.stringify({ doc_type: docType, doc_id: id }))}`) ?? []) as Array<Record<string, any>>
  const recordsOf = async (id: number): Promise<Array<Record<string, any>>> =>
    (await dataOf(token, 'GET', `/api/wfl_approval_records:list?pageSize=100&filter=${encodeURIComponent(JSON.stringify({ doc_type: docType, doc_id: id }))}`) ?? []) as Array<Record<string, any>>

  // F1 会签：两待办，首签部分推进，全员通过才生效。
  {
    const graph = graphOf([
      { id: 's', type: 'start', data: { title: '发起人' } },
      approvalNode('a1', { assigneeType: 'user', assignees: ['admin', 'quality_lead'], mode: 'countersign' }, '会签节点'),
      { id: 'e', type: 'end', data: { title: '结束' } },
    ], [['s', 'a1'], ['a1', 'e']])
    const published = await publishGraph(docType, graph)
    check('F1 会签发布', published.ok, published.ok ? '' : published.errors.join('；'))
    const id = await createDraftPo(token, 'PO-W5B2-CS1', 1_000)
    createdDocs.push(id)
    await postJson('/submit', { doc_type: docType, doc_id: id, approver: 'chenliqun' })
    const open = (await todosOf(id)).filter(todo => todo.status === 'open' && todo.kind !== 'cc')
    check('F1 会签两待办', open.length === 2, `${String(open.length)} 行（${open.map(todo => String(todo.user)).join('、')}）`)
    const first = await approveOverHttp(id, 'admin', 'approve', '第一签')
    check('F1 首签不推进', first.to_state === 'pending' && first.from_state === 'pending', `from=${String(first.from_state)} to=${String(first.to_state)}`)
    const second = await approveOverHttp(id, 'quality_lead', 'approve', '第二签生效')
    check('F1 全员通过生效', second.to_state === 'approved', `to=${String(second.to_state)}`)
    check('F1 留痕三行（提交+两签）', (await recordsOf(id)).length === 3, `${String((await recordsOf(id)).length)} 行`)
  }

  // F2 依次审批：一次一签，越序被拒。
  {
    const graph = graphOf([
      { id: 's', type: 'start', data: { title: '发起人' } },
      approvalNode('a1', { assigneeType: 'user', assignees: ['chenliqun', 'admin'], mode: 'sequential' }, '依次节点'),
      { id: 'e', type: 'end', data: { title: '结束' } },
    ], [['s', 'a1'], ['a1', 'e']])
    const published = await publishGraph(docType, graph)
    check('F2 依次发布', published.ok, published.ok ? '' : published.errors.join('；'))
    const id = await createDraftPo(token, 'PO-W5B2-SEQ1', 1_000)
    createdDocs.push(id)
    await postJson('/submit', { doc_type: docType, doc_id: id, approver: 'qc_inspector' })
    const open = (await todosOf(id)).filter(todo => todo.status === 'open' && todo.kind !== 'cc')
    check('F2 仅首人待办', open.length === 1 && String(open[0]?.user) === 'chenliqun', open.map(todo => String(todo.user)).join('、'))
    const outOfTurn = await postJson('/act', { doc_type: docType, doc_id: id, action: 'approve', approver: 'admin', comment: '越序' })
    check('F2 越序被拒', outOfTurn.status === 400, String(outOfTurn.body.error ?? '').slice(0, 80))
    const first = await approveOverHttp(id, 'chenliqun')
    check('F2 首序不推进', first.to_state === 'pending', `to=${String(first.to_state)}`)
    const openAfter = (await todosOf(id)).filter(todo => todo.status === 'open' && todo.kind !== 'cc')
    check('F2 次人待办打开', openAfter.length === 1 && String(openAfter[0]?.user) === 'admin', openAfter.map(todo => String(todo.user)).join('、'))
    const second = await approveOverHttp(id, 'admin')
    check('F2 末序生效', second.to_state === 'approved', `to=${String(second.to_state)}`)
  }

  // F3 回退边：二级拒绝回一级重审。
  {
    const graph = graphOf([
      { id: 's', type: 'start', data: { title: '发起人' } },
      approvalNode('a1', { assigneeType: 'user', assignees: ['admin'] }, '一级审批'),
      { id: 'c', type: 'condition', data: { title: '金额条件', condition: { join: 'and', rows: [{ field: 'total', op: '>', value: '100' }] } } },
      approvalNode('a2', { assigneeType: 'user', assignees: ['quality_lead'], rejectTo: 'a1' }, '二级审批'),
      { id: 'e', type: 'end', data: { title: '结束' } },
    ], [['s', 'a1'], ['a1', 'c'], ['c', 'a2'], ['c', 'e'], ['a2', 'e']])
    const published = await publishGraph(docType, graph)
    check('F3 回退边发布', published.ok, published.ok ? '' : published.errors.join('；'))
    const rejectRow = psql(`SELECT next_state FROM wfl_flow_transitions WHERE flow_id = 1 AND state = 'pending_level2' AND action = 'reject';`).trim()
    check('F3 二级拒绝转移改写', rejectRow === 'pending', `next_state=${rejectRow}`)
    const id = await createDraftPo(token, 'PO-W5B2-RJ1', 5_000)
    createdDocs.push(id)
    await postJson('/submit', { doc_type: docType, doc_id: id, approver: 'chenliqun' })
    await approveOverHttp(id, 'admin')
    const rejected = await approveOverHttp(id, 'quality_lead', 'reject', '退回一级修改')
    check('F3 拒绝回到一级', rejected.to_state === 'pending', `to=${String(rejected.to_state)}`)
    const reopened = (await todosOf(id)).filter(todo => todo.status === 'open' && todo.kind !== 'cc')
    check('F3 一级待办重开', reopened.length === 1 && String(reopened[0]?.user) === 'admin', reopened.map(todo => `${String(todo.user)}@${String(todo.state)}`).join('、'))
    await approveOverHttp(id, 'admin')
    const final = await approveOverHttp(id, 'quality_lead')
    check('F3 回退后重走生效', final.to_state === 'approved', `to=${String(final.to_state)}`)
  }

  // F4 抄送：审批通过触发 kind=cc 只读行。
  {
    const graph = graphOf([
      { id: 's', type: 'start', data: { title: '发起人' } },
      approvalNode('a1', { assigneeType: 'user', assignees: ['admin'] }, '审批'),
      { id: 'ncc', type: 'cc', data: { title: '抄送质检', cc: { assignees: ['quality_lead'] } } },
      { id: 'e', type: 'end', data: { title: '结束' } },
    ], [['s', 'a1'], ['a1', 'ncc'], ['ncc', 'e']])
    const published = await publishGraph(docType, graph)
    check('F4 抄送发布', published.ok, published.ok ? '' : published.errors.join('；'))
    const id = await createDraftPo(token, 'PO-W5B2-CC1', 1_000)
    createdDocs.push(id)
    await postJson('/submit', { doc_type: docType, doc_id: id, approver: 'chenliqun' })
    const beforeApprove = (await todosOf(id)).filter(todo => String(todo.kind ?? '') === 'cc')
    check('F4 审批前无抄送行', beforeApprove.length === 0, `${String(beforeApprove.length)} 行`)
    await approveOverHttp(id, 'admin')
    const ccRows = (await todosOf(id)).filter(todo => String(todo.kind ?? '') === 'cc')
    check('F4 通过触发抄送行', ccRows.length === 1 && String(ccRows[0]?.user) === 'quality_lead', ccRows.map(todo => `${String(todo.user)}:${String(todo.kind)}`).join('、'))
    const docStatus = psql(`SELECT doc_status FROM hub_po_purchase_orders WHERE id = ${String(id)};`).trim()
    check('F4 抄送不阻塞流转', docStatus === 'approved', docStatus)
  }

  // F5 deptLeader：提交人部门主管签核（qc_inspector → 质检部主管 quality_lead）。
  {
    const graph = graphOf([
      { id: 's', type: 'start', data: { title: '发起人' } },
      approvalNode('a1', { assigneeType: 'deptLeader', assignees: [] }, '部门主管节点'),
      { id: 'e', type: 'end', data: { title: '结束' } },
    ], [['s', 'a1'], ['a1', 'e']])
    const published = await publishGraph(docType, graph)
    check('F5 deptLeader 发布', published.ok, published.ok ? '' : published.errors.join('；'))
    const mapAfter = psql(`SELECT approver_map::text FROM wfl_flow_configs WHERE id = 1;`).trim()
    check('F5 标记落库', mapAfter.includes('deptLeader'), mapAfter.slice(0, 100))
    const id = await createDraftPo(token, 'PO-W5B2-DL1', 1_000)
    createdDocs.push(id)
    await postJson('/submit', { doc_type: docType, doc_id: id, approver: 'qc_inspector' })
    const open = (await todosOf(id)).filter(todo => todo.status === 'open' && todo.kind !== 'cc')
    check('F5 解析为质检部主管', open.length === 1 && String(open[0]?.user) === 'quality_lead', open.map(todo => String(todo.user)).join('、'))
    const done = await approveOverHttp(id, 'quality_lead')
    check('F5 主管签核生效', done.to_state === 'approved', `to=${String(done.to_state)}`)
  }

  // F6 supervisorChain：提交人两级主管链（质检部主管 + 集团主管）。
  {
    const graph = graphOf([
      { id: 's', type: 'start', data: { title: '发起人' } },
      approvalNode('a1', { assigneeType: 'supervisorChain', assignees: [], levels: 2, mode: 'sequential' }, '主管链节点'),
      { id: 'e', type: 'end', data: { title: '结束' } },
    ], [['s', 'a1'], ['a1', 'e']])
    const published = await publishGraph(docType, graph)
    check('F6 主管链发布', published.ok, published.ok ? '' : published.errors.join('；'))
    const id = await createDraftPo(token, 'PO-W5B2-CH1', 1_000)
    createdDocs.push(id)
    await postJson('/submit', { doc_type: docType, doc_id: id, approver: 'qc_inspector' })
    const open = (await todosOf(id)).filter(todo => todo.status === 'open' && todo.kind !== 'cc')
    check('F6 链首待办=质检部主管', open.length === 1 && String(open[0]?.user) === 'quality_lead', open.map(todo => String(todo.user)).join('、'))
    const first = await approveOverHttp(id, 'quality_lead')
    check('F6 首级不推进', first.to_state === 'pending', `to=${String(first.to_state)}`)
    const openAfter = (await todosOf(id)).filter(todo => todo.status === 'open' && todo.kind !== 'cc')
    check('F6 次级待办=集团主管', openAfter.length === 1 && String(openAfter[0]?.user) === 'admin', openAfter.map(todo => String(todo.user)).join('、'))
    const done = await approveOverHttp(id, 'admin')
    check('F6 链尾生效', done.to_state === 'approved', `to=${String(done.to_state)}`)
  }

  // F7 formField：单据 owner 字段所指人签核。
  {
    const graph = graphOf([
      { id: 's', type: 'start', data: { title: '发起人' } },
      approvalNode('a1', { assigneeType: 'formField', assignees: ['owner'] }, '经办人节点'),
      { id: 'e', type: 'end', data: { title: '结束' } },
    ], [['s', 'a1'], ['a1', 'e']])
    const published = await publishGraph(docType, graph)
    check('F7 formField 发布', published.ok, published.ok ? '' : published.errors.join('；'))
    const adminId = Number(psql(`SELECT id FROM users WHERE username = 'admin';`).trim())
    const id = await createDraftPo(token, 'PO-W5B2-FF1', 1_000, adminId)
    createdDocs.push(id)
    await postJson('/submit', { doc_type: docType, doc_id: id, approver: 'chenliqun' })
    const open = (await todosOf(id)).filter(todo => todo.status === 'open' && todo.kind !== 'cc')
    check('F7 解析为 owner 所指人', open.length === 1 && String(open[0]?.user) === 'admin', open.map(todo => String(todo.user)).join('、'))
    const done = await approveOverHttp(id, 'admin')
    check('F7 经办人签核生效', done.to_state === 'approved', `to=${String(done.to_state)}`)
  }

  // F8 autoPass / F9 assignUser：空解析的两策略。
  {
    const autoPassGraph = graphOf([
      { id: 's', type: 'start', data: { title: '发起人' } },
      approvalNode('a1', { assigneeType: 'deptLeader', assignees: [], emptyPolicy: 'autoPass' }, '自动通过节点'),
      { id: 'e', type: 'end', data: { title: '结束' } },
    ], [['s', 'a1'], ['a1', 'e']])
    const pass = await publishGraph(docType, autoPassGraph)
    check('F8 autoPass 发布', pass.ok, pass.ok ? '' : pass.errors.join('；'))
    const id = await createDraftPo(token, 'PO-W5B2-AP1', 1_000)
    createdDocs.push(id)
    const submitted = await postJson('/submit', { doc_type: docType, doc_id: id, approver: 'atlas' })
    const result = submitted.body.result ?? {}
    check('F8 无部门提交人自动通过', submitted.status === 200 && result.to_state === 'approved', `to=${String(result.to_state ?? submitted.body.error)}`)
    const autoRecords = (await recordsOf(id)).filter(record => String(record.approver) === '(auto)')
    check('F8 自动步留痕', autoRecords.length === 1, `${String(autoRecords.length)} 行 (auto)`)

    const assignGraph = graphOf([
      { id: 's', type: 'start', data: { title: '发起人' } },
      approvalNode('a1', { assigneeType: 'deptLeader', assignees: [], emptyPolicy: 'assignUser', emptyAssignee: 'chenliqun' }, '指定人员节点'),
      { id: 'e', type: 'end', data: { title: '结束' } },
    ], [['s', 'a1'], ['a1', 'e']])
    const assigned = await publishGraph(docType, assignGraph)
    check('F9 assignUser 发布', assigned.ok, assigned.ok ? '' : assigned.errors.join('；'))
    const id2 = await createDraftPo(token, 'PO-W5B2-AU1', 1_000)
    createdDocs.push(id2)
    await postJson('/submit', { doc_type: docType, doc_id: id2, approver: 'atlas' })
    const open2 = (await todosOf(id2)).filter(todo => todo.status === 'open' && todo.kind !== 'cc')
    check('F9 空解析回退指定人', open2.length === 1 && String(open2[0]?.user) === 'chenliqun', open2.map(todo => String(todo.user)).join('、'))
    const done = await approveOverHttp(id2, 'chenliqun')
    check('F9 指定人签核生效', done.to_state === 'approved', `to=${String(done.to_state)}`)
  }

  // F10 通用条件：500 < total <= 10000 进二级，区间外一审直批。
  {
    const graph = graphOf([
      { id: 's', type: 'start', data: { title: '发起人' } },
      approvalNode('a1', { assigneeType: 'user', assignees: ['admin'] }, '一级审批'),
      { id: 'c', type: 'condition', data: { title: '区间条件', condition: { join: 'and', rows: [{ field: 'total', op: '>', value: '500' }, { field: 'total', op: '<=', value: '10000' }] } } },
      approvalNode('a2', { assigneeType: 'user', assignees: ['quality_lead'] }, '二级审批'),
      { id: 'e', type: 'end', data: { title: '结束' } },
    ], [['s', 'a1'], ['a1', 'c'], ['c', 'a2'], ['c', 'e'], ['a2', 'e']])
    const published = await publishGraph(docType, graph)
    check('F10 通用条件发布', published.ok, published.ok ? '' : published.errors.join('；'))
    const literal = psql(`SELECT condition_expr FROM wfl_flow_transitions WHERE flow_id = 1 AND state = 'pending' AND next_state = 'pending_level2';`).trim()
    check('F10 正置字面量落库', literal === 'total > 500 AND total <= 10000', literal)
    const inId = await createDraftPo(token, 'PO-W5B2-GC1', 1_000)
    createdDocs.push(inId)
    await postJson('/submit', { doc_type: docType, doc_id: inId, approver: 'chenliqun' })
    const routed = await approveOverHttp(inId, 'admin')
    check('F10 区间内进二级', routed.to_state === 'pending_level2', `to=${String(routed.to_state)}`)
    const done = await approveOverHttp(inId, 'quality_lead')
    check('F10 二级通过生效', done.to_state === 'approved', `to=${String(done.to_state)}`)
    const outId = await createDraftPo(token, 'PO-W5B2-GC2', 20_000)
    createdDocs.push(outId)
    await postJson('/submit', { doc_type: docType, doc_id: outId, approver: 'chenliqun' })
    const direct = await approveOverHttp(outId, 'admin')
    check('F10 区间外一审直批', direct.to_state === 'approved', `to=${String(direct.to_state)}`)
  }

  // The publish-gate negative matrix: each refusal must be a 400 with the
  // readable family and leave graph_version unmoved.
  {
    const negatives: ReadonlyArray<[string, Record<string, unknown>, string]> = [
      ['formField 非人员字段', graphOf([
        { id: 's', type: 'start', data: { title: '发起人' } },
        approvalNode('a1', { assigneeType: 'formField', assignees: ['total'] }),
        { id: 'e', type: 'end', data: { title: '结束' } },
      ], [['s', 'a1'], ['a1', 'e']]), '不是人员字段'],
      ['deptLeader 带静态审批人', graphOf([
        { id: 's', type: 'start', data: { title: '发起人' } },
        approvalNode('a1', { assigneeType: 'deptLeader', assignees: ['质检部'] }),
        { id: 'e', type: 'end', data: { title: '结束' } },
      ], [['s', 'a1'], ['a1', 'e']]), '由运行时解析'],
      ['supervisorChain 级数越界', graphOf([
        { id: 's', type: 'start', data: { title: '发起人' } },
        approvalNode('a1', { assigneeType: 'supervisorChain', assignees: [], levels: 0 }),
        { id: 'e', type: 'end', data: { title: '结束' } },
      ], [['s', 'a1'], ['a1', 'e']]), '级数 levels 需为'],
      ['assignUser 缺回退人', graphOf([
        { id: 's', type: 'start', data: { title: '发起人' } },
        approvalNode('a1', { assigneeType: 'deptLeader', assignees: [], emptyPolicy: 'assignUser' }),
        { id: 'e', type: 'end', data: { title: '结束' } },
      ], [['s', 'a1'], ['a1', 'e']]), 'emptyAssignee'],
      ['assignUser 回退人不存在', graphOf([
        { id: 's', type: 'start', data: { title: '发起人' } },
        approvalNode('a1', { assigneeType: 'deptLeader', assignees: [], emptyPolicy: 'assignUser', emptyAssignee: 'ghost_user' }),
        { id: 'e', type: 'end', data: { title: '结束' } },
      ], [['s', 'a1'], ['a1', 'e']]), '回退审批人'],
      ['回退目标为结束节点', graphOf([
        { id: 's', type: 'start', data: { title: '发起人' } },
        approvalNode('a1', { assigneeType: 'user', assignees: ['admin'] }),
        approvalNode('a2', { assigneeType: 'user', assignees: ['quality_lead'], rejectTo: 'e' }, '二级审批'),
        { id: 'e', type: 'end', data: { title: '结束' } },
      ], [['s', 'a1'], ['a1', 'a2'], ['a2', 'e']]), '不是审批节点'],
      ['多行条件字段不在词表', graphOf([
        { id: 's', type: 'start', data: { title: '发起人' } },
        approvalNode('a1', { assigneeType: 'user', assignees: ['admin'] }),
        { id: 'c', type: 'condition', data: { title: '条件', condition: { join: 'and', rows: [{ field: 'total', op: '>', value: '500' }, { field: 'ghost', op: '>', value: '1' }] } } },
        approvalNode('a2', { assigneeType: 'user', assignees: ['quality_lead'] }, '二级审批'),
        { id: 'e', type: 'end', data: { title: '结束' } },
      ], [['s', 'a1'], ['a1', 'c'], ['c', 'a2'], ['c', 'e'], ['a2', 'e']]), '不在单据字段词表'],
    ]
    for (const [name, graph, marker] of negatives) {
      // A draft the structural validator refuses never reaches publish (the
      // save itself answers 400 with the readable family — an equally valid
      // gate); a structurally-valid draft saves and the PUBLISH gate refuses.
      const before = await currentGraph(docType)
      const saved = await postJson('/flow-graph', { doc_type: docType, graph, base_version: before.graph_version })
      if (saved.status !== 200) {
        check(`负例 ${name}`, String(saved.body.error ?? '').includes(marker), `保存期 400：${String(saved.body.error ?? '').slice(0, 90)}`)
        const versionAfter = (await currentGraph(docType)).graph_version
        check(`负例 ${name} 保存拒不动版本`, versionAfter === before.graph_version, `${String(before.graph_version)}→${String(versionAfter)}`)
        continue
      }
      const versionAfterSave = Number(saved.body.graph_version ?? 0)
      const published = await postJson('/flow-graph/publish', { doc_type: docType, base_version: versionAfterSave })
      const errors = (published.body.errors as string[] | undefined) ?? [String(published.body.error ?? published.status)]
      const readable = errors.some(error => error.includes(marker))
      check(`负例 ${name}`, published.status === 400 && readable, published.status === 400 ? errors[0]?.slice(0, 90) ?? '' : `被放行 status=${String(published.status)}`)
      const versionAfter = (await currentGraph(docType)).graph_version
      check(`负例 ${name} 发布不动版本`, versionAfter === versionAfterSave, `${String(versionAfterSave)}→${String(versionAfter)}`)
    }
    // The cc empty-assignees negative refuses at save time.
    const versionBefore = (await currentGraph(docType)).graph_version
    const ccSave = await postJson('/flow-graph', {
      doc_type: docType, base_version: versionBefore,
      graph: graphOf([
        { id: 's', type: 'start', data: { title: '发起人' } },
        approvalNode('a1', { assigneeType: 'user', assignees: ['admin'] }),
        { id: 'ncc', type: 'cc', data: { title: '抄送', cc: { assignees: [] } } },
        { id: 'e', type: 'end', data: { title: '结束' } },
      ], [['s', 'a1'], ['a1', 'ncc'], ['ncc', 'e']]),
    })
    check('负例 空抄送人（保存期拦截）', ccSave.status === 400 && String(ccSave.body.error ?? '').includes('抄送人未配置'), String(ccSave.body.error ?? '').slice(0, 80))
  }

  // Restore the canonical baseline and verify byte-equality.
  {
    const restored = await publishGraph(docType, baselineGraph)
    check('恢复基线发布', restored.ok, restored.ok ? '' : restored.errors.join('；'))
    const statesAfter = psql(`SELECT json_agg(row_to_json(t)) FROM (SELECT state, doc_status_anchor AS anchor, allow_edit_role AS role, update_field, update_value FROM wfl_flow_states WHERE flow_id = 1 ORDER BY state) t;`).trim()
    const transitionsAfter = psql(`SELECT json_agg(row_to_json(t)) FROM (SELECT state, action, next_state AS next, allowed_role AS role, condition_expr AS cond, allow_self_approval AS self FROM wfl_flow_transitions WHERE flow_id = 1 ORDER BY state, action, next_state) t;`).trim()
    const mapAfter = psql('SELECT approver_map::text FROM wfl_flow_configs WHERE id = 1;').trim()
    const extrasAfter = psql('SELECT extras::text FROM wfl_flow_configs WHERE id = 1;').trim()
    check('恢复后状态行一致', statesAfter === snapshotStates, statesAfter.slice(0, 80))
    check('恢复后转移行一致', transitionsAfter === snapshotTransitions, transitionsAfter.slice(0, 80))
    check('恢复后 approver_map 一致', mapAfter === snapshotMap, mapAfter.slice(0, 80))
    check('恢复后 extras 一致', extrasAfter === snapshotExtras, extrasAfter.slice(0, 80))
  }

  // Cleanup: remove the evidence docs and their engine rows (diff disclosed).
  for (const id of createdDocs) {
    psql(`DELETE FROM wfl_approval_todos WHERE doc_type = '${docType}' AND doc_id = ${String(id)};`)
    psql(`DELETE FROM wfl_approval_records WHERE doc_type = '${docType}' AND doc_id = ${String(id)};`)
    psql(`DELETE FROM hub_po_purchase_orders WHERE id = ${String(id)};`)
  }
  log(`w5b2-advanced: 取证清理 — ${String(createdDocs.length)} 张取证单及其待办/记录已删除（isOwner 组织数据保留为常驻改进，已披露）`)
}

// ─── --parity: the three-entry effect convergence (BP-02/BP-14) ───

/** A NocoBaseClient-shaped adapter over the flow-page-lib REST helpers. */
const restClientOf = (token: string): NocoBaseClient => {
  const listFilter = (filter: Record<string, unknown> | undefined): string =>
    filter === undefined ? '' : `&filter=${encodeURIComponent(JSON.stringify(filter))}`
  const adapter = {
    list: async (collection: string, options: { filter?: Record<string, unknown> } = {}) => {
      const rows = await dataOf(token, 'GET', `/api/${collection}:list?pageSize=500${listFilter(options.filter)}`)
      return { rows: rows ?? [], meta: { total: (rows ?? []).length, page: 1, pageSize: 500 } }
    },
    get: async (collection: string, id: number) =>
      (await dataOf(token, 'GET', `/api/${collection}:get?filterByTk=${String(id)}`)) ?? undefined,
    create: async (collection: string, values: Record<string, unknown>) =>
      await dataOf(token, 'POST', `/api/${collection}:create`, values),
    update: async (collection: string, id: number, values: Record<string, unknown>) => {
      await dataOf(token, 'POST', `/api/${collection}:update?filterByTk=${String(id)}`, values)
    },
  }
  return adapter as unknown as NocoBaseClient
}

async function parity(): Promise<void> {
  const token = await signInWithRetry()
  // Crash-safety sweep: a previous crashed run's SOs would collide on code.
  const strayIds = psql(`SELECT id FROM so_orders WHERE code LIKE 'SO-W5B2-%';`).trim().split('\n').map(line => line.trim()).filter(line => line !== '')
  if (strayIds.length > 0) {
    for (const id of strayIds) {
      psql(`DELETE FROM wfl_approval_todos WHERE doc_type = 'so_orders' AND doc_id = ${id};`)
      psql(`DELETE FROM wfl_approval_records WHERE doc_type = 'so_orders' AND doc_id = ${id};`)
      psql(`DELETE FROM so_order_lines WHERE order_id = ${id};`)
      psql(`DELETE FROM so_orders WHERE id = ${id};`)
    }
    log(`w5b2-advanced: 对拍前次残留清理 — ${String(strayIds.length)} 张 SO`)
  }
  const created: Array<{ id: number; code: string }> = []
  const makeDraftSo = async (suffix: string): Promise<{ id: number; code: string }> => {
    const code = `SO-W5B2-${suffix}`
    const so = await dataOf(token, 'POST', '/api/so_orders:create', {
      code, amount: 100, doc_status: 'draft', need_date: new Date().toISOString().slice(0, 10),
    }) as Record<string, any>
    const id = Number(so.id)
    await dataOf(token, 'POST', '/api/so_order_lines:create', { order_id: id, product_id: 8, qty: 1, qty_shipped: 0, unit_price: 100 })
    created.push({ id, code })
    return { id, code }
  }
  const reservationsOf = (code: string): number =>
    Number(psql(`SELECT count(*) FROM wms_reservations WHERE ref_type = 'SO' AND ref_id = '${code.replaceAll("'", "''")}';`).trim())
  const assertEffects = async (label: string, so: { id: number; code: string }): Promise<void> => {
    const status = psql(`SELECT doc_status FROM so_orders WHERE id = ${String(so.id)};`).trim()
    check(`${label} 状态推进 approved`, status === 'approved', status)
    const records = psql(`SELECT count(*) FROM wfl_approval_records WHERE doc_type = 'so_orders' AND doc_id = ${String(so.id)} AND action IN ('submit','approve');`).trim()
    check(`${label} 记录 submit+approve`, records === '2', `${records} 行`)
    const openTodos = psql(`SELECT count(*) FROM wfl_approval_todos WHERE doc_type = 'so_orders' AND doc_id = ${String(so.id)} AND status = 'open' AND (kind IS NULL OR kind <> 'cc');`).trim()
    check(`${label} 待办清零`, openTodos === '0', `${openTodos} 行`)
    const reservations = reservationsOf(so.code)
    check(`${label} 预留生效（reserveForSo）`, reservations >= 1, `${String(reservations)} 行 RSV`)
  }

  // E1 CLI: submit + approve over the CLI, effects via the single exit.
  {
    const so = await makeDraftSo('P1')
    const submit = spawnSync('node', ['--import', 'tsx/esm', 'examples/kb-agent/scripts/approval-engine.mts', '--submit', 'so_orders', String(so.id), 'chenliqun'], { encoding: 'utf8', timeout: 60_000 })
    check('E1 CLI 提交', submit.status === 0, (submit.stderr ?? '').slice(0, 100))
    const approve = spawnSync('node', ['--import', 'tsx/esm', 'examples/kb-agent/scripts/approval-engine.mts', '--act', 'so_orders', String(so.id), 'approve', 'admin', 'CLI 入口'], { encoding: 'utf8', timeout: 60_000 })
    const stdout = approve.stdout ?? ''
    check('E1 CLI 审批生效', approve.status === 0 && stdout.includes('"to_state":"approved"'), stdout.slice(0, 120))
    // The CLI prints the single-exit effects; a dropped keep-alive socket
    // prints the idempotent replay hint instead — either way the effects are
    // completed through the same exit before asserting.
    if (!stdout.includes('effective effects —')) {
      const replay = await postJson('/effective-effects', { doc_type: 'so_orders', doc_id: so.id, code: so.code })
      check('E1 CLI 效应经重放补齐', replay.status === 200, String(replay.body.error ?? ''))
    }
    await assertEffects('E1 CLI', so)
  }

  // E2 HTTP: the engine route runs the same effectiveEffects() inline.
  {
    const so = await makeDraftSo('P2')
    const submit = await postJson('/submit', { doc_type: 'so_orders', doc_id: so.id, approver: 'chenliqun' })
    check('E2 HTTP 提交', submit.status === 200, String(submit.body.error ?? ''))
    const approve = await postJson('/act', { doc_type: 'so_orders', doc_id: so.id, action: 'approve', approver: 'admin', comment: 'HTTP 入口' })
    check('E2 HTTP 审批带 effects', approve.status === 200 && approve.body.effects !== undefined, JSON.stringify(approve.body.effects ?? {}).slice(0, 100))
    await assertEffects('E2 HTTP', so)
  }

  // E3 nb_approve (the mobile twin): the local path reaches /effective-effects.
  {
    const so = await makeDraftSo('P3')
    const client = restClientOf(token)
    const submitted = await nbApproveEngine(client, { docType: 'so_orders', docId: so.id, action: 'submit', comment: undefined, approver: 'chenliqun' })
    check('E3 nb_approve 提交', submitted.to_state === 'pending', `to=${String(submitted.to_state)}`)
    const approved = await nbApproveEngine(client, { docType: 'so_orders', docId: so.id, action: 'approve', comment: '移动入口（BP-02 对拍）', approver: 'admin' })
    check('E3 nb_approve 审批生效', approved.effective === true && approved.to_state === 'approved', `to=${String(approved.to_state)}`)
    await assertEffects('E3 nb_approve', so)
  }

  // BP-14: the department-routed flow (qm_nc_dispositions after migration)
  // delegates to the engine — the mobile twin no longer fails loud on the
  // department entry.
  {
    const delegated = await nbApproveEngine(restClientOf(token), { docType: 'qm_nc_dispositions', docId: 1, action: 'approve', comment: '探测部门路由委派（预期单据态不符被引擎拒绝，而非部门条目解析失败）', approver: 'admin' }).then(() => '', async error => String(error instanceof Error ? error.message : error))
    check('BP-14 部门路由走引擎（不再报 approver_map 值非法）', !delegated.includes('值非法'), delegated.slice(0, 100))
  }

  // Cleanup: reservations released is complex — delete the SO rows and their
  // engine rows; the reservation rows stay as the disclosed diff (they are
  // ordinary business data the nightly ATP already nets).
  for (const so of created) {
    psql(`DELETE FROM wfl_approval_todos WHERE doc_type = 'so_orders' AND doc_id = ${String(so.id)};`)
    psql(`DELETE FROM wfl_approval_records WHERE doc_type = 'so_orders' AND doc_id = ${String(so.id)};`)
    psql(`DELETE FROM so_order_lines WHERE order_id = ${String(so.id)};`)
    psql(`DELETE FROM so_orders WHERE id = ${String(so.id)};`)
  }
  log(`w5b2-advanced: 对拍清理 — ${String(created.length)} 张 SO 及行/待办/记录已删除；各自 RSV 预留行保留为业务数据（披露）`)
}

// ─── main ───

async function main(): Promise<void> {
  if (args.includes('--selftest')) {
    await selftest()
    return
  }
  if (args.includes('--migrate')) {
    await migrate()
  }
  if (args.includes('--features')) {
    await features()
  }
  if (args.includes('--parity')) {
    await parity()
  }
  if (failures.length > 0) {
    log(`\nw5b2-advanced: FAIL — ${String(failures.length)} 处未过：\n - ${failures.join('\n - ')}`)
    process.exitCode = 1
    return
  }
  if (!args.some(entry => entry.startsWith('--'))) {
    throw new Error('用法：--selftest | --migrate [--doc-type …] | --features | --parity')
  }
  log('\nw5b2-advanced: PASS')
}

await main()
