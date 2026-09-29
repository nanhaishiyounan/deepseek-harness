/**
 * W5-B1: the publish-chain evidence run — the live proof that the one-way
 * compiler, the fail-loud gates, the round-trip importer, and the atomic
 * CAS publish behave per plan-w5 §B1 over the real PG + the real engine
 * HTTP channel (no mocks anywhere).
 *
 * Modes:
 *   --selftest            the pure compiler assertion matrix (approval-engine
 *                         compilerSelftest — no IO, no serve needed)
 *   --round-trip          live round-trip proof: for each --doc-type (default
 *                         pur_rfqs pur_orders srm_suppliers) read the live
 *                         rows, rowsToGraph → compileGraphToRows →
 *                         assertRowsEquivalent against the same rows
 *   --run                 the full chain on --doc-type (default pur_rfqs):
 *                         snapshot → import baseline → edit (level-1 approver
 *                         → chenliqun) → publish → psql row assertions → the
 *                         ten-case HTTP negative matrix (each 400 + readable
 *                         + version unmoved) → real document run (submit →
 *                         todo → approve → approved) → save∥publish CAS race
 *                         (exactly one 200) → rollback republish → behavior
 *                         regression run → cleanup with a disclosed diff
 *
 * Usage (repo root, serve already on :13110):
 *   node --import tsx/esm examples/kb-agent/scripts/w5b1-publish.mts --selftest
 *   node --import tsx/esm examples/kb-agent/scripts/w5b1-publish.mts --round-trip
 *   node --import tsx/esm examples/kb-agent/scripts/w5b1-publish.mts --run
 */

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
import { dataOf, signInWithRetry } from './nocobase-flow-page-lib.mts'
import {
  assertRowsEquivalent,
  compileGraphToRows,
  compilerSelftest,
  rowsToGraph,
  type ApproverMap,
  type CompileContext,
  type LiveFlowRows,
} from './approval-engine.mts'

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

interface GraphShape {
  version: number
  nodes: Array<{ id: string; type: string; position: { x: number; y: number }; data: Record<string, any> }>
  edges: Array<{ id: string; source: string; target: string }>
}

const getJson = async (path: string): Promise<any> => {
  const response = await fetch(`${base}${path}`)
  return await response.json().catch(() => ({})) as Record<string, any>
}

const postJson = async (path: string, body: Record<string, unknown>): Promise<{ status: number; body: Record<string, any> }> => {
  const response = await fetch(`${base}${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
  return { status: response.status, body: await response.json().catch(() => ({})) as Record<string, any> }
}

const currentGraph = async (docType: string): Promise<{ graph: GraphShape | null; graph_version: number }> => {
  const payload = await getJson(`/flow-graph?doc_type=${encodeURIComponent(docType)}`) as { graph?: GraphShape | null; graph_version?: number }
  return { graph: payload.graph ?? null, graph_version: Number(payload.graph_version ?? 0) }
}

const saveGraph = (docType: string, graph: GraphShape, baseVersion: number) =>
  postJson('/flow-graph', { doc_type: docType, graph, base_version: baseVersion })

const publishGraph = (docType: string, baseVersion: number) =>
  postJson('/flow-graph/publish', { doc_type: docType, base_version: baseVersion })

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
    row,
    live: {
      stateField: String(row.state_field ?? 'doc_status'),
      approverMap: (parse(row.approver_map, 'approver_map') ?? {}) as ApproverMap,
      extras: parse(row.extras, 'extras') as Record<string, unknown> | null,
      states: states ?? [],
      transitions: transitions ?? [],
    },
  }
}

/** The compile context against the live world (users + psql role snapshot + collection field list). */
const liveCompileContext = async (token: string, live: LiveFlowRows, docType: string): Promise<CompileContext> => {
  const users = await dataOf(token, 'GET', '/api/users:list?pageSize=500') as Array<{ username?: string }> | null
  const fields = await dataOf(token, 'GET', `/api/fields:list?pageSize=200&filter=${encodeURIComponent(JSON.stringify({ collectionName: { $eq: docType } }))}`) as Array<{ name?: string }> | null
  return {
    stateField: live.stateField,
    formFields: (fields ?? []).map(field => String(field.name ?? '')).filter(name => name !== ''),
    preserveExtras: live.extras ?? {},
    knownUsernames: new Set((users ?? []).map(user => String(user.username ?? ''))),
    usersOfRole: (role) => {
      const output = psql(`SELECT u.username FROM "rolesUsers" r JOIN users u ON u.id = r."userId" WHERE r."roleName" = '${role.replaceAll("'", "''")}';`)
      return Promise.resolve(output.split('\n').map(line => line.trim()).filter(line => line !== ''))
    },
  }
}

// ─── --round-trip ───

async function roundTrip(token: string): Promise<void> {
  const docTypes = flagAll('--doc-type')
  const targets = docTypes.length > 0 ? docTypes : ['pur_rfqs', 'pur_orders', 'srm_suppliers']
  log(`w5b1 round-trip — 现库行表 → rowsToGraph → compileGraphToRows → assertRowsEquivalent（${targets.join('、')}）`)
  for (const docType of targets) {
    const { live } = await liveRowsOf(token, docType)
    const ctx = await liveCompileContext(token, live, docType)
    const imported = rowsToGraph(live)
    if (!imported.ok) {
      check(`${docType} 逆向导入`, false, imported.errors.join('；'))
      continue
    }
    const recompiled = await compileGraphToRows(imported.graph, ctx)
    if (!recompiled.ok) {
      check(`${docType} round-trip 重编译`, false, recompiled.errors.join('；'))
      continue
    }
    const drift = assertRowsEquivalent(live, recompiled.rows)
    check(`${docType} round-trip 等价（${String(live.states.length)} 状态 ${String(live.transitions.length)} 转移 → graph ${String(imported.graph['nodes'] instanceof Array ? (imported.graph['nodes'] as unknown[]).length : 0)} 节点）`, drift.length === 0, drift.join('；'))
  }
}

// ─── --run: the full publish chain ───

/** Clone a graph, rewriting one approval node's assignees (the scripted designer edit). */
const withAssignees = (graph: GraphShape, nodeId: string, assignees: string[]): GraphShape => {
  const clone = structuredClone(graph)
  const node = clone.nodes.find(entry => entry.id === nodeId)
  if (node === undefined) throw new Error(`withAssignees: 节点 ${nodeId} 不在图中`)
  node.data.approval = { ...node.data.approval, assignees }
  return clone
}

/** One negative-matrix case: save the illegal graph, publish, expect 400 + marker + version unmoved. */
async function negativeCase(docType: string, name: string, graph: GraphShape, marker: string, versionTracker: { version: number }): Promise<void> {
  const saved = await saveGraph(docType, graph, versionTracker.version)
  if (saved.status !== 200) {
    check(`负例保存 ${name}`, false, `HTTP ${String(saved.status)} ${String(saved.body['error'] ?? '')}`)
    return
  }
  versionTracker.version = Number(saved.body['graph_version'] ?? versionTracker.version + 1)
  const afterSaveVersion = versionTracker.version
  const publish = await publishGraph(docType, afterSaveVersion)
  const errors = Array.isArray(publish.body['errors']) ? publish.body['errors'] as string[] : [String(publish.body['error'] ?? '')]
  const matched = publish.status === 400 && errors.some(error => error.includes(marker))
  const versionProbe = await currentGraph(docType)
  const unmoved = versionProbe.graph_version === afterSaveVersion
  check(`负例 ${name} → 400 且错误可读（含「${marker}」）且版本未动`, matched && unmoved,
    `HTTP ${String(publish.status)}，version ${String(versionProbe.graph_version)} vs ${String(afterSaveVersion)}，errors=${JSON.stringify(errors).slice(0, 160)}`)
}

async function run(): Promise<void> {
  const docType = flag('--doc-type') ?? 'pur_rfqs'
  const token = await signInWithRetry()
  const health = await fetch(`${base}/healthz`)
  if (!health.ok) throw new Error(`serve ${base} /healthz 不可达（先启动 --serve）`)
  log(`w5b1 run — ${docType} 发布链路全链（真实 PG + 真实引擎 HTTP，全程无 mock）`)

  // 1) Snapshot the pre-run state (rollback target + diff baseline).
  const before = await currentGraph(docType)
  const { live: liveBefore, row: rowBefore } = await liveRowsOf(token, docType)
  const beforeRows = psql(`SELECT count(*) FROM wfl_flow_transitions WHERE flow_id = ${String(Number(rowBefore.id))};`).trim()
  log(`1) 快照 — graph v${String(before.graph_version)}（${before.graph === null ? '无 graph' : `nodes=${String(before.graph.nodes.length)}`}），行表 ${String(liveBefore.states.length)} 状态 ${String(liveBefore.transitions.length)} 转移，approver_map=${String(rowBefore.approver_map)}`)

  // 2) Import the baseline graph from the live rows (the reverse importer's live proof).
  const imported = rowsToGraph(liveBefore)
  if (!imported.ok) throw new Error(`逆向导入被拒：${imported.errors.join('；')}`)
  const baselineGraph = imported.graph as unknown as GraphShape
  const ctx = await liveCompileContext(token, liveBefore, docType)
  const baselineCompile = await compileGraphToRows(baselineGraph, ctx)
  if (!baselineCompile.ok) throw new Error(`基线图编译被拒：${baselineCompile.errors.join('；')}`)
  const baselineDrift = assertRowsEquivalent(liveBefore, baselineCompile.rows)
  check('逆向导入 + 重编译与现库等价（发布前置）', baselineDrift.length === 0, baselineDrift.join('；'))

  // 3) Save the baseline graph, then the scripted designer edit: level-1 approver → chenliqun.
  const versionTracker = { version: before.graph_version }
  const savedBaseline = await saveGraph(docType, baselineGraph, versionTracker.version)
  if (savedBaseline.status !== 200) throw new Error(`基线图保存失败：HTTP ${String(savedBaseline.status)} ${String(savedBaseline.body['error'] ?? '')}`)
  versionTracker.version = Number(savedBaseline.body['graph_version'])
  const approvalNode = baselineGraph.nodes.find(node => node.type === 'approval')
  if (approvalNode === undefined) throw new Error('导入图中无审批节点')
  const editedGraph = withAssignees(baselineGraph, approvalNode.id, ['chenliqun'])
  const savedEdit = await saveGraph(docType, editedGraph, versionTracker.version)
  if (savedEdit.status !== 200) throw new Error(`编辑图保存失败：HTTP ${String(savedEdit.status)} ${String(savedEdit.body['error'] ?? '')}`)
  versionTracker.version = Number(savedEdit.body['graph_version'])
  log(`3) 设计器编辑已落库 — 一级审批 ${String(approvalNode.data.approval?.assignees?.join('、'))} → chenliqun（graph v${String(versionTracker.version)}）`)

  // 4) Publish → 200 with derived stats.
  const published = await publishGraph(docType, versionTracker.version)
  check(`发布 200 且派生统计（${String(published.body['derived']?.states)} 状态 ${String(published.body['derived']?.transitions)} 转移）`,
    published.status === 200 && Number(published.body['derived']?.states) === liveBefore.states.length && Number(published.body['derived']?.transitions) === liveBefore.transitions.length,
    `HTTP ${String(published.status)} ${JSON.stringify(published.body).slice(0, 160)}`)
  versionTracker.version = Number(published.body['graph_version'] ?? versionTracker.version + 1)

  // 5) psql asserts the derived rows carry the edit and the publish markers.
  const flowId = Number(rowBefore.id)
  const approverMapNow = psql(`SELECT approver_map FROM wfl_flow_configs WHERE id = ${String(flowId)};`).trim()
  const transitionsNow = psql(`SELECT count(*) FROM wfl_flow_transitions WHERE flow_id = ${String(flowId)};`).trim()
  const publishedAt = psql(`SELECT published_at IS NOT NULL, published_graph_version FROM wfl_flow_configs WHERE id = ${String(flowId)};`).trim()
  check('派生 approver_map 携带编辑（chenliqun）', approverMapNow.includes('chenliqun'), approverMapNow)
  check(`派生转移行数与 graph 一致（${beforeRows} → ${transitionsNow}）`, transitionsNow === beforeRows)
  check('发布标识落库（published_at + published_graph_version）', publishedAt.startsWith('t|'), publishedAt)
  const todoUser = psql(`SELECT allowed_role FROM wfl_flow_transitions WHERE flow_id = ${String(flowId)} AND state = 'pending' AND action = 'approve' AND next_state = 'approved';`).trim()
  const mapRole = JSON.parse(approverMapNow) as Record<string, unknown>
  check('引擎消费口径 — pending×approve 行的 allowed_role 在 approver_map 有键', mapRole[todoUser] !== undefined, `allowed_role=${todoUser}`)

  // 6) The negative matrix over live HTTP (each 400 + readable + version unmoved).
  log('6) 发布门禁负例矩阵（保存非法图 → publish → 400 逐条可读 + 版本不动）')
  const stamp = Date.now().toString(36)
  const cloneOf = (mutate: (graph: GraphShape) => void): GraphShape => {
    const clone = structuredClone(editedGraph)
    mutate(clone)
    return clone
  }
  await negativeCase(docType, '孤立节点', cloneOf(graph => { graph.nodes.push({ id: `n_loose_${stamp}`, type: 'cc', position: { x: 40, y: 40 }, data: { title: '游离抄送', cc: { assignees: ['admin'] } } }) }), '孤立节点', versionTracker)
  await negativeCase(docType, '缺开始节点', cloneOf(graph => {
    graph.nodes = graph.nodes.filter(node => node.type !== 'start')
    graph.edges = graph.edges.filter(edge => edge.source !== 'n_start' && edge.target !== 'n_start')
  }), '缺开始节点', versionTracker)
  await negativeCase(docType, '多个开始节点', cloneOf(graph => {
    graph.nodes.push({ id: `n_start2_${stamp}`, type: 'start', position: { x: 40, y: 40 }, data: { title: '第二个开始' } })
    graph.edges.push({ id: `e_s2_${stamp}`, source: `n_start2_${stamp}`, target: graph.nodes.find(node => node.type === 'end')?.id ?? 'n_end' })
  }), '开始节点', versionTracker)
  await negativeCase(docType, '缺结束节点', cloneOf(graph => {
    graph.nodes = graph.nodes.filter(node => node.type !== 'end')
    graph.edges = graph.edges.filter(edge => edge.target !== 'n_end')
  }), '缺结束节点', versionTracker)
  await negativeCase(docType, '环', cloneOf(graph => {
    const a2 = graph.nodes.find(node => node.id === 'n_approval_2') ?? graph.nodes.filter(node => node.type === 'approval')[1]
    if (a2 !== undefined) graph.edges.push({ id: `e_cycle_${stamp}`, source: a2.id, target: 'n_approval_1' })
  }), '存在环', versionTracker)
  await negativeCase(docType, '不可达节点', cloneOf(graph => {
    graph.nodes.push(
      { id: `n_orphan_${stamp}`, type: 'approval', position: { x: 40, y: 40 }, data: { title: '孤岛审批', approval: { assigneeType: 'user', assignees: ['admin'], mode: 'or', emptyPolicy: 'transferAdmin' } } },
      { id: `n_end2_${stamp}`, type: 'end', position: { x: 40, y: 240 }, data: { title: '孤岛终点' } },
    )
    graph.edges.push({ id: `e_orphan_${stamp}`, source: `n_orphan_${stamp}`, target: `n_end2_${stamp}` })
  }), '不可达节点', versionTracker)
  await negativeCase(docType, '条件缺条件行', cloneOf(graph => {
    graph.nodes.push(
      { id: `n_cond_${stamp}`, type: 'condition', position: { x: 40, y: 40 }, data: { title: '空条件', condition: { join: 'and', rows: [] } } },
      { id: `n_a3_${stamp}`, type: 'approval', position: { x: 40, y: 240 }, data: { title: '三级审批', approval: { assigneeType: 'user', assignees: ['admin'], mode: 'or', emptyPolicy: 'transferAdmin' } } },
    )
    const a1 = graph.nodes.find(node => node.id === 'n_approval_1')
    const end = graph.nodes.find(node => node.type === 'end')
    if (a1 !== undefined && end !== undefined) {
      graph.edges = graph.edges.filter(edge => edge.source !== a1.id)
      graph.edges.push(
        { id: `e_c1_${stamp}`, source: a1.id, target: `n_cond_${stamp}` },
        { id: `e_c2_${stamp}`, source: `n_cond_${stamp}`, target: `n_a3_${stamp}` },
        { id: `e_c3_${stamp}`, source: `n_cond_${stamp}`, target: end.id },
        { id: `e_c4_${stamp}`, source: `n_a3_${stamp}`, target: end.id },
      )
    }
  }), '缺条件行', versionTracker)
  await negativeCase(docType, '条件操作符非法', cloneOf(graph => {
    graph.nodes.push(
      { id: `n_cond_${stamp}`, type: 'condition', position: { x: 40, y: 40 }, data: { title: '操作符条件', condition: { join: 'and', rows: [{ field: 'code', op: '<=', value: '100000' }] } } },
      { id: `n_a3_${stamp}`, type: 'approval', position: { x: 40, y: 240 }, data: { title: '三级审批', approval: { assigneeType: 'user', assignees: ['admin'], mode: 'or', emptyPolicy: 'transferAdmin' } } },
    )
    const a1 = graph.nodes.find(node => node.id === 'n_approval_1')
    const end = graph.nodes.find(node => node.type === 'end')
    if (a1 !== undefined && end !== undefined) {
      graph.edges = graph.edges.filter(edge => edge.source !== a1.id)
      graph.edges.push(
        { id: `e_c1_${stamp}`, source: a1.id, target: `n_cond_${stamp}` },
        { id: `e_c2_${stamp}`, source: `n_cond_${stamp}`, target: `n_a3_${stamp}` },
        { id: `e_c3_${stamp}`, source: `n_cond_${stamp}`, target: end.id },
        { id: `e_c4_${stamp}`, source: `n_a3_${stamp}`, target: end.id },
      )
    }
  }), '操作符需为 >', versionTracker)
  await negativeCase(docType, '条件字段不在词表', cloneOf(graph => {
    graph.nodes.push(
      { id: `n_cond_${stamp}`, type: 'condition', position: { x: 40, y: 40 }, data: { title: '词表外条件', condition: { join: 'and', rows: [{ field: 'ghost_field', op: '>', value: '100000' }] } } },
      { id: `n_a3_${stamp}`, type: 'approval', position: { x: 40, y: 240 }, data: { title: '三级审批', approval: { assigneeType: 'user', assignees: ['admin'], mode: 'or', emptyPolicy: 'transferAdmin' } } },
    )
    const a1 = graph.nodes.find(node => node.id === 'n_approval_1')
    const end = graph.nodes.find(node => node.type === 'end')
    if (a1 !== undefined && end !== undefined) {
      graph.edges = graph.edges.filter(edge => edge.source !== a1.id)
      graph.edges.push(
        { id: `e_c1_${stamp}`, source: a1.id, target: `n_cond_${stamp}` },
        { id: `e_c2_${stamp}`, source: `n_cond_${stamp}`, target: `n_a3_${stamp}` },
        { id: `e_c3_${stamp}`, source: `n_cond_${stamp}`, target: end.id },
        { id: `e_c4_${stamp}`, source: `n_a3_${stamp}`, target: end.id },
      )
    }
  }), '不在单据字段词表', versionTracker)
  await negativeCase(docType, '会签模式', cloneOf(graph => {
    const target = graph.nodes.find(node => node.id === 'n_approval_1')
    if (target !== undefined) target.data.approval = { ...target.data.approval, assignees: ['admin', 'chenliqun'], mode: 'countersign' }
  }), '会签', versionTracker)

  // Restore the edited graph (the matrix trashed the stored one).
  const restored = await saveGraph(docType, editedGraph, versionTracker.version)
  if (restored.status !== 200) throw new Error(`负例矩阵后恢复编辑图失败：HTTP ${String(restored.status)}`)
  versionTracker.version = Number(restored.body['graph_version'])
  const republished = await publishGraph(docType, versionTracker.version)
  if (republished.status !== 200) throw new Error(`恢复后重发布失败：HTTP ${String(republished.status)} ${String(republished.body['error'] ?? '')}`)
  versionTracker.version = Number(republished.body['graph_version'] ?? versionTracker.version + 1)

  // 7) Real run A: a real document through the freshly published flow.
  log('7) 真实跑单 A（按派生行流转：chenliqun 的待办）')
  const codeA = `RFQ-W5B1-A-${stamp}`
  const createdA = await dataOf(token, 'POST', '/api/pur_rfqs:create', { code: codeA, doc_status: 'draft', deadline: new Date().toISOString().slice(0, 10) }) as { id?: number }
  if (createdA?.id === undefined) throw new Error(`pur_rfqs:create 失败：${JSON.stringify(createdA).slice(0, 200)}`)
  const docA = Number(createdA.id)
  const submitted = await postJson('/submit', { doc_type: docType, doc_id: docA, approver: 'wangyifan' })
  check('提交单据 200（draft → pending）', submitted.status === 200 && submitted.body?.result?.to_state === 'pending', JSON.stringify(submitted.body).slice(0, 160))
  const todosA = await getJson('/todos?user=chenliqun') as { todos?: Array<Record<string, any>> }
  const todoA = (todosA.todos ?? []).find(todo => Number(todo.doc_id) === docA && String(todo.doc_type) === docType && String(todo.status) === 'open')
  check('chenliqun 出现开待办（wfl_approval_todos）', todoA !== undefined, `doc ${codeA}`)
  const acted = await postJson('/act', { doc_type: docType, doc_id: docA, action: 'approve', approver: 'chenliqun', comment: 'W5-B1 发布链路跑单' })
  check('审批 200（pending → approved）', acted.status === 200 && acted.body?.result?.to_state === 'approved', JSON.stringify(acted.body).slice(0, 200))
  const statusA = psql(`SELECT doc_status FROM pur_rfqs WHERE id = ${String(docA)};`).trim()
  const recordsA = psql(`SELECT count(*) FROM wfl_approval_records WHERE doc_type = '${docType}' AND doc_id = ${String(docA)};`).trim()
  const todoClosed = psql(`SELECT count(*) FROM wfl_approval_todos WHERE doc_type = '${docType}' AND doc_id = ${String(docA)} AND status = 'completed';`).trim()
  check('单据状态推进（psql: approved）', statusA === 'approved', statusA)
  check('审批记录链完整（psql: 2 条 submit+approve）', recordsA === '2', recordsA)
  check('待办关闭（psql: completed）', todoClosed === '1', todoClosed)

  // 8) The save ∥ publish CAS race on one base_version — exactly one 200.
  log('8) 保存 ∥ 发布 并发（同刻同 base_version，恰好一胜一败）')
  for (let round = 1; round <= 2; round += 1) {
    const raceBase = versionTracker.version
    const [saveSide, publishSide] = await Promise.all([
      saveGraph(docType, structuredClone(editedGraph), raceBase),
      publishGraph(docType, raceBase),
    ])
    const statuses = [saveSide.status, publishSide.status].sort((a, b) => a - b)
    const outcome = await currentGraph(docType)
    versionTracker.version = outcome.graph_version
    check(`并发轮 ${String(round)} 一胜一败（save=${String(saveSide.status)} publish=${String(publishSide.status)}，终版 v${String(outcome.graph_version)}）`,
      statuses[0] === 200 && statuses[1] === 409 && outcome.graph_version === raceBase + 1)
  }

  // 9) Rollback: re-save the baseline graph and republish — rows return to the snapshot.
  log('9) 回滚验证（重新发布旧版 graph → 行为回归）')
  const rollbackSave = await saveGraph(docType, baselineGraph, versionTracker.version)
  if (rollbackSave.status !== 200) throw new Error(`回滚保存失败：HTTP ${String(rollbackSave.status)}`)
  versionTracker.version = Number(rollbackSave.body['graph_version'])
  const rollbackPublish = await publishGraph(docType, versionTracker.version)
  if (rollbackPublish.status !== 200) throw new Error(`回滚发布失败：HTTP ${String(rollbackPublish.status)} ${String(rollbackPublish.body['error'] ?? '')}`)
  versionTracker.version = Number(rollbackPublish.body['graph_version'] ?? versionTracker.version + 1)
  const { live: liveAfterRollback } = await liveRowsOf(token, docType)
  const rollbackRecompile = await compileGraphToRows(baselineGraph, ctx)
  const rollbackDrift = rollbackRecompile.ok ? assertRowsEquivalent(liveAfterRollback, rollbackRecompile.rows) : ['重编译被拒']
  check('回滚后行表与发布前快照语义一致', rollbackDrift.length === 0, rollbackDrift.join('；'))

  // 10) Real run B: behavior regression — the todo lands on the baseline approver again.
  const codeB = `RFQ-W5B1-B-${stamp}`
  const createdB = await dataOf(token, 'POST', '/api/pur_rfqs:create', { code: codeB, doc_status: 'draft' }) as { id?: number }
  if (createdB?.id === undefined) throw new Error(`pur_rfqs:create 失败：${JSON.stringify(createdB).slice(0, 200)}`)
  const docB = Number(createdB.id)
  const submittedB = await postJson('/submit', { doc_type: docType, doc_id: docB, approver: 'wangyifan' })
  check('回滚后提交 200', submittedB.status === 200)
  // "user" is reserved in psql (bare `user` evaluates to CURRENT_USER) — quote it.
  const todoBUser = psql(`SELECT "user" FROM wfl_approval_todos WHERE doc_type = '${docType}' AND doc_id = ${String(docB)} AND status = 'open';`).trim()
  const baselineApprovers = Object.values(liveBefore.approverMap).flatMap(value => Array.isArray(value) ? value : [value]).map(String)
  check(`回滚后待办回到基线审批人（${baselineApprovers.join('、')}）`, baselineApprovers.includes(todoBUser), `todo user=${todoBUser}`)
  const actedB = await postJson('/act', { doc_type: docType, doc_id: docB, action: 'approve', approver: todoBUser, comment: 'W5-B1 回滚回归跑单' })
  check('回滚后审批 200（approved）', actedB.status === 200 && actedB.body?.result?.to_state === 'approved')

  // 11) Cleanup: remove the test documents and their workflow rows (diff disclosed).
  log('11) 清理（测试单据 + 待办 + 审批记录；披露 diff）')
  let destroyed = 0
  for (const docId of [docA, docB]) {
    for (const row of await dataOf(token, 'GET', `/api/wfl_approval_todos:list?pageSize=50&filter=${encodeURIComponent(JSON.stringify({ doc_type: docType, doc_id: docId }))}`) as Array<{ id?: number }> ?? []) {
      if (row.id !== undefined) await dataOf(token, 'POST', `/api/wfl_approval_todos:destroy?filterByTk=${row.id}`)
      destroyed += 1
    }
    for (const row of await dataOf(token, 'GET', `/api/wfl_approval_records:list?pageSize=50&filter=${encodeURIComponent(JSON.stringify({ doc_type: docType, doc_id: docId }))}`) as Array<{ id?: number }> ?? []) {
      if (row.id !== undefined) await dataOf(token, 'POST', `/api/wfl_approval_records:destroy?filterByTk=${row.id}`)
      destroyed += 1
    }
    await dataOf(token, 'POST', `/api/pur_rfqs:destroy?filterByTk=${docId}`)
    destroyed += 1
  }
  const leftovers = psql(`SELECT (SELECT count(*) FROM pur_rfqs WHERE code LIKE 'RFQ-W5B1-%'), (SELECT count(*) FROM wfl_approval_records WHERE doc_type = '${docType}' AND doc_id IN (${String(docA)}, ${String(docB)})), (SELECT count(*) FROM wfl_approval_todos WHERE doc_type = '${docType}' AND doc_id IN (${String(docA)}, ${String(docB)}));`).trim()
  check('清理后无残留（0|0|0）', leftovers === '0|0|0', `销毁 ${String(destroyed)} 行，残留 ${leftovers}`)
  log(`清理披露 — 销毁：pur_rfqs ×2（${codeA}、${codeB}）+ 其 todos/records；graph 列停在 v${String(versionTracker.version)}（基线图内容），行表语义=发布前快照；config_note 追加了本链全部审计行（保留）`)

  if (failures.length > 0) {
    log(`\nw5b1 run FAIL — ${String(failures.length)} 处失败：\n  - ${failures.join('\n  - ')}`)
    process.exitCode = 1
    return
  }
  log('\nw5b1 run PASS — 快照/逆向导入/编辑/发布/派生行断言/负例矩阵×10/真实跑单/并发CAS/回滚/回归跑单/清理 全部通过')
}

// ─── main ───

async function main(): Promise<void> {
  if (args.includes('--selftest')) {
    await compilerSelftest()
    log('w5b1 selftest OK（编译器断言矩阵独立通过——无需 serve）')
    return
  }
  const token = await signInWithRetry()
  if (args.includes('--round-trip')) {
    await roundTrip(token)
    if (failures.length > 0) {
      log(`w5b1 round-trip FAIL：\n  - ${failures.join('\n  - ')}`)
      process.exitCode = 1
      return
    }
    log('w5b1 round-trip PASS')
    return
  }
  if (args.includes('--run')) {
    await run()
    return
  }
  throw new Error('用法：--selftest | --round-trip [--doc-type …] | --run [--doc-type pur_rfqs] [--base http://127.0.0.1:13110]')
}

await main()
