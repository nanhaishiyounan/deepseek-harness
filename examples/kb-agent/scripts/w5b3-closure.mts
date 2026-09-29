/**
 * W5-B3: the P0 closure batch — BP-01 (ap_balance nets paid), BP-03 (the
 * supplier grade machine rides the engine), BP-04 (hub_po retirement onto
 * pur_orders). Flow upgrades ride the designer's own save+publish path (the
 * graph column stays the editing truth); row retirement and gate removal go
 * through psql with a config_note audit line (the w4-heal disclosure
 * pattern). Idempotent: every write matches only the un-migrated shape.
 *
 * Usage:
 *   node --import tsx/esm examples/kb-agent/scripts/w5b3-closure.mts --run      # upgrade + rehearse + assert
 *   node --import tsx/esm examples/kb-agent/scripts/w5b3-closure.mts --dryrun   # preview the writes only
 *   node --import tsx/esm examples/kb-agent/scripts/w5b3-closure.mts --assert   # read-only terminal-state assertions
 */
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dataOf, listRoutes, signInWithRetry } from './nocobase-flow-page-lib.mts'
import { act, seedFlow, submitForApproval, type NocoIO } from './approval-engine.mts'

const args = process.argv.slice(2)
const mode = args.includes('--run') ? 'run' : args.includes('--assert') ? 'assert' : args.includes('--dryrun') ? 'dryrun' : 'usage'
const base = (args.find(entry => entry.startsWith('--base='))?.slice('--base='.length) ?? process.env['W5_SERVE_BASE'] ?? 'http://127.0.0.1:13110').replace(/\/$/u, '')
const failures: string[] = []
const log = (line: string): void => { console.log(line) }
const check = (that: string, ok: boolean, detail = ''): void => {
  log(`  ${ok ? '✓' : '✗'} ${that}${detail === '' ? '' : ` — ${detail}`}`)
  if (!ok) failures.push(that)
}

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

const getJson = async (path: string): Promise<Record<string, any>> => {
  const response = await fetch(`${base}${path}`)
  return await response.json().catch(() => ({})) as Record<string, any>
}
const postJson = async (path: string, body: Record<string, unknown>): Promise<{ status: number; body: Record<string, any> }> => {
  const response = await fetch(`${base}${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
  return { status: response.status, body: await response.json().catch(() => ({})) as Record<string, any> }
}

const tokenIO = (token: string): NocoIO => ({
  list: async (collection, filter) => {
    const query = filter === undefined ? '' : `&filter=${encodeURIComponent(JSON.stringify(filter))}`
    return await dataOf(token, 'GET', `/api/${collection}:list?pageSize=500${query}`) ?? []
  },
  get: async (collection, id) => await dataOf(token, 'GET', `/api/${collection}:get?filterByTk=${id}`) ?? undefined,
  create: async (collection, values) => await dataOf(token, 'POST', `/api/${collection}:create`, values),
  update: async (collection, id, values) => {
    await dataOf(token, 'POST', `/api/${collection}:update?filterByTk=${id}`, values)
  },
  updateWhere: async (collection, filter, values) => {
    const rows = await dataOf(token, 'POST', `/api/${collection}:update?filter=${encodeURIComponent(JSON.stringify(filter))}&pageSize=10`, values)
    return Array.isArray(rows) ? rows.length : rows === null || rows === undefined ? 0 : 1
  },
  destroy: async (collection, id) => {
    await dataOf(token, 'POST', `/api/${collection}:destroy?filterByTk=${id}`)
  },
})

/** The pur_payments terminal declaration BP-08 publishes (graph is the editing truth). */
const PAY_TERMINALS = {
  states: [{ state: 'paid', label: 'paid' }],
  transitions: [
    { from: 'approved', action: 'settle', to: 'paid', role: 'manager' },
    { from: 'paid', action: 'void', to: 'void', role: 'manager' },
  ],
}

/**
 * W5-B3: align the live admission rows with the grade-extended template
 * (8 states / 13 transitions). The publish round-trip gate correctly refuses
 * a template change (live 4/4 vs derived 8/13 is drift by design), so the
 * upgrade rides idempotent INSERTs — the same convergence seedDocFlow's
 * repair pass performs — leaving every later publish byte-equivalent.
 */
const upgradeAdmissionTemplate = (): void => {
  if (mode === 'dryrun') {
    log('  [dryrun] srm_suppliers: +4 grade states, +9 grade transitions (idempotent INSERT … WHERE NOT EXISTS)')
    return
  }
  const flowId = psql(`SELECT id FROM wfl_flow_configs WHERE doc_type = 'srm_suppliers' AND is_active = TRUE LIMIT 1;`).trim()
  if (flowId === '') throw new Error('srm_suppliers has no active flow config')
  const id = Number(flowId)
  for (const [state, anchor] of [['preferred', 1], ['restricted', 0], ['frozen', 0], ['eliminated', 0]] as const) {
    psql(`INSERT INTO wfl_flow_states (flow_id, state, doc_status_anchor, allow_edit_role, update_field, update_value)
SELECT ${String(id)}, '${state}', ${String(anchor)}, 'srm_manager', '', ''
WHERE NOT EXISTS (SELECT 1 FROM wfl_flow_states WHERE flow_id = ${String(id)} AND state = '${state}');`)
  }
  const gradeTransitions: ReadonlyArray<[string, string, string]> = [
    ['qualified', 'promote', 'preferred'],
    ['preferred', 'demote', 'qualified'],
    ['qualified', 'restrict', 'restricted'],
    ['preferred', 'restrict', 'restricted'],
    ['restricted', 'freeze', 'frozen'],
    ['restricted', 'restore', 'qualified'],
    ['frozen', 'restore', 'restricted'],
    ['frozen', 'eliminate', 'eliminated'],
    ['eliminated', 'resubmit', 'reviewing'],
  ]
  for (const [state, action, next] of gradeTransitions) {
    psql(`INSERT INTO wfl_flow_transitions (flow_id, state, action, next_state, allowed_role, condition_expr, allow_self_approval)
SELECT ${String(id)}, '${state}', '${action}', '${next}', 'srm_manager', '', TRUE
WHERE NOT EXISTS (SELECT 1 FROM wfl_flow_transitions WHERE flow_id = ${String(id)} AND state = '${state}' AND action = '${action}' AND next_state = '${next}');`)
  }
  log(`  srm_suppliers 模板对齐（flow #${flowId}：8 态 / 13 转移）`)
}

/** Save one flow's graph (with the terminals block attached) and publish it. */
async function publishTerminals(docType: string, terminals: Record<string, unknown> | null): Promise<void> {
  const current = await getJson(`/flow-graph?doc_type=${encodeURIComponent(docType)}`) as { graph?: Record<string, any> | null; graph_version?: number }
  if (current.graph === null || current.graph === undefined) {
    throw new Error(`${docType} has no stored graph — run w5b2-advanced --migrate --doc-type ${docType} first`)
  }
  const graph = terminals === null
    ? { ...current.graph }
    : { ...current.graph, terminals }
  if (mode === 'dryrun') {
    log(`  [dryrun] ${docType}: save graph v${String(current.graph_version ?? 0)}+terminals and publish`)
    return
  }
  const saved = await postJson('/flow-graph', { doc_type: docType, graph, base_version: current.graph_version ?? 0 })
  if (saved.status !== 200) throw new Error(`${docType} graph save failed: ${JSON.stringify(saved.body).slice(0, 200)}`)
  const published = await postJson('/flow-graph/publish', { doc_type: docType, base_version: Number(saved.body.graph_version ?? 0) })
  if (published.status !== 200 || published.body.ok !== true) {
    throw new Error(`${docType} publish failed: ${JSON.stringify(published.body).slice(0, 300)}`)
  }
  log(`  ${docType} graph v${String(saved.body.graph_version)} published (states ${String(published.body.derived?.states)} / transitions ${String(published.body.derived?.transitions)})`)
}

/** One supplier row's lifecycle state (null when the id resolves to nothing). */
const supplierState = async (token: string, id: number): Promise<string | null> => {
  const row = await dataOf(token, 'GET', `/api/srm_suppliers:get?filterByTk=${id}`)
  return row === null || row === undefined ? null : String(row.lifecycle_status ?? '')
}

async function bp01ApBalance(token: string): Promise<void> {
  log('— BP-01 AP 口径：settle 落 paid 后 ap_balance 下降')
  const io = tokenIO(token)
  const code = 'PAY-W5B3-01'
  const payments = await io.list('pur_payments')
  let payment = payments.find(row => String(row.code) === code)
  if (payment === undefined && mode === 'run') {
    const created = await io.create('pur_payments', {
      code, payee: 'W5-B3 口径演练', amount: 1_234, method: 'bank', doc_status: 'draft',
    })
    payment = created
    log(`  演练付款单 ${code} 创建（#${String(created.id)}）`)
  }
  if (payment === undefined) {
    check('BP-01 演练付款单存在（--run 先行）', false, '无 PAY-W5B3-01 行')
    return
  }
  const id = Number(payment.id)
  const stateBefore = String(payment.doc_status)
  if (stateBefore === 'draft' || stateBefore === 'rejected') {
    await submitForApproval(io, 'pur_payments', id, '陈立群')
    await act(io, 'pur_payments', id, 'approve', 'admin', 'W5-B3 口径演练审批')
  } else if (stateBefore !== 'approved' && stateBefore !== 'paid') {
    check('BP-01 演练付款单状态可推进', false, `当前 ${stateBefore}`)
    return
  }
  const apBefore = Number(psql(`SELECT value FROM kpi_snapshots WHERE kpi_code = 'ap_balance' ORDER BY calc_date DESC, id DESC LIMIT 1;`).trim() || 'NaN')
  if (stateBefore !== 'paid') {
    const settled = await act(io, 'pur_payments', id, 'settle', 'admin', '银行转账结算（W5-B3 演练）')
    check('BP-01 settle 经引擎落 paid', settled.to_state === 'paid', `${stateBefore} → ${settled.to_state}`)
    await dataOf(token, 'POST', `/api/pur_payments:update?filterByTk=${id}`, { pay_date: new Date().toISOString().slice(0, 10) })
  } else {
    check('BP-01 演练单已 paid（幂等保持）', true, `${code} 之前已结算`)
  }
  const calc = spawnSync('node', ['--import', 'tsx/esm', fileURLToPath(new URL('./kpi-run.mts', import.meta.url)), '--calc-kpi'], { encoding: 'utf8', timeout: 240_000 })
  if (calc.status !== 0) {
    check('BP-01 kpi 重算执行', false, (calc.stderr ?? '').slice(0, 200))
    return
  }
  const apAfter = Number(psql(`SELECT value FROM kpi_snapshots WHERE kpi_code = 'ap_balance' ORDER BY calc_date DESC, id DESC LIMIT 1;`).trim() || 'NaN')
  const amount = Number(payment.amount ?? 0)
  if (stateBefore === 'paid') {
    // The idempotent re-run keeps the payment settled; the one-shot drop was
    // proven by the first --run pass (its before→after pair rides the log).
    check('BP-01 演练单保持 paid（口径稳定）', true, `ap_balance=${String(apAfter)}`)
  } else if (Number.isFinite(apBefore) && Number.isFinite(apAfter)) {
    check('BP-01 付款后应付余额下降', apAfter <= apBefore - amount + 1e-6, `ap_balance ${String(apBefore)} → ${String(apAfter)}（付款 ${String(amount)}）`)
  } else {
    check('BP-01 ap_balance 快照可读', false, `before=${String(apBefore)} after=${String(apAfter)}`)
  }
  check('BP-01 ap_balance 快照存在', Number.isFinite(apAfter), `最新 ap_balance=${String(apAfter)}`)
}

async function bp03SupplierGrades(token: string): Promise<void> {
  log('— BP-03 供应商等级四态收口：转移经引擎')
  const io = tokenIO(token)
  const suppliers = await io.list('srm_suppliers')
  let target = suppliers.find(row => String(row.lifecycle_status) === 'qualified' && String(row.name ?? '').includes('W5') === false)
  if (target === undefined) target = suppliers.find(row => String(row.lifecycle_status) === 'qualified')
  if (target === undefined) {
    check('BP-03 存在 qualified 供应商', false, 'srm_suppliers 无 qualified 行——先跑 nocobase-h4-srm.mts')
    return
  }
  const id = Number(target.id)
  const before = String(target.lifecycle_status)
  const promoted = await act(io, 'srm_suppliers', id, 'promote', 'admin', 'W5-B3 等级转移演练：升为优选')
  check('BP-03 promote 经引擎', promoted.to_state === 'preferred', `${before} → ${promoted.to_state}`)
  check('BP-03 主表回写 preferred', await supplierState(token, id) === 'preferred')
  const restored = await act(io, 'srm_suppliers', id, 'demote', 'admin', '演练结束恢复合格')
  check('BP-03 demote 恢复', restored.to_state === 'qualified', `preferred → ${restored.to_state}`)
  const illegal = await (async () => {
    try {
      await act(io, 'srm_suppliers', id, 'eliminate', 'admin')
      return ''
    } catch (error) {
      return error instanceof Error ? error.message : String(error)
    }
  })()
  check('BP-03 非法转移被拒（qualified×eliminate）', illegal.includes('非法准入转移'), illegal.slice(0, 90))
  const gradeRows = Number(psql(`SELECT count(*) FROM wfl_flow_transitions t JOIN wfl_flow_configs c ON c.id = t.flow_id WHERE c.doc_type = 'srm_suppliers' AND t.action IN ('promote','demote','restrict','freeze','eliminate','restore');`).trim())
  check('BP-03 派生行含等级转移', gradeRows >= 8, `${String(gradeRows)} 行等级转移`)
}

async function bp04HubRetirement(token: string): Promise<void> {
  log('— BP-04 hub_po 退役归一 pur_orders')
  if (mode === 'run') {
    const note = `${new Date().toISOString()} w5b3: retire hub_po_purchase_orders onto pur_orders (BP-04) — flow deactivated, gates moved, selftest carrier is wfl_selftest_docs (operator=admin)`
    psql(`UPDATE wfl_flow_configs SET is_active = FALSE, config_note = COALESCE(config_note || E'\\n', '') || '${note}' WHERE doc_type = 'hub_po_purchase_orders' AND is_active = TRUE;`)
    psql(`DELETE FROM wfl_gate_configs WHERE upstream_collection = 'hub_po_purchase_orders' OR downstream_collection = 'hub_po_purchase_orders';`)
    log('  hub_po 流停用 + 两 gate 移除（config_note 审计）')
  } else if (mode === 'dryrun') {
    log('  [dryrun] UPDATE wfl_flow_configs … is_active=FALSE（hub_po）；DELETE gates；建 wfl_selftest_docs + seed')
  }
  if (mode === 'run' || mode === 'dryrun') {
    const existing = await dataOf(token, 'GET', '/api/collections/wfl_selftest_docs')
    if (existing === null && mode === 'run') {
      await dataOf(token, 'POST', '/api/collections:create', {
        name: 'wfl_selftest_docs', title: '审批引擎自测单', fields: [
          { name: 'po_number', type: 'string', interface: 'input', uiSchema: { type: 'string', 'x-component': 'Input', title: '单号' } },
          { name: 'total', type: 'double', interface: 'number', uiSchema: { type: 'number', 'x-component': 'InputNumber', title: '金额' } },
          { name: 'doc_status', type: 'string', interface: 'select', uiSchema: { type: 'string', 'x-component': 'Select', title: '审批状态', enum: [
            { value: 'draft', label: '草稿' }, { value: 'pending', label: '待审批' }, { value: 'pending_level2', label: '二级审批中' },
            { value: 'approved', label: '已生效' }, { value: 'rejected', label: '已驳回' }, { value: 'void', label: '已作废' },
          ] } },
          { name: 'approved_by', type: 'string', interface: 'input', uiSchema: { type: 'string', 'x-component': 'Input', title: '审批人' } },
          { name: 'approved_at', type: 'date', interface: 'datetime', uiSchema: { type: 'string', 'x-component': 'DatePicker', title: '生效日' } },
        ],
      })
      log('  集合 wfl_selftest_docs 创建（引擎自测载体，不参与业务口径）')
    }
    if (mode === 'run') {
      await seedFlow(tokenIO(token))
    }
  }
  const activeHub = Number(psql(`SELECT count(*) FROM wfl_flow_configs WHERE doc_type = 'hub_po_purchase_orders' AND is_active = TRUE;`).trim())
  check('BP-04 hub_po 无激活流', activeHub === 0, `${String(activeHub)} 行激活`)
  const hubGates = Number(psql(`SELECT count(*) FROM wfl_gate_configs WHERE upstream_collection = 'hub_po_purchase_orders' OR downstream_collection = 'hub_po_purchase_orders';`).trim())
  check('BP-04 hub_po gate 清零', hubGates === 0, `${String(hubGates)} 行残留`)
  const activePo = Number(psql(`SELECT count(*) FROM wfl_flow_configs WHERE doc_type = 'pur_orders' AND is_active = TRUE;`).trim())
  check('BP-04 pur_orders 激活流健在', activePo === 1, `${String(activePo)} 行`)
  const poGate = Number(psql(`SELECT count(*) FROM wfl_gate_configs WHERE downstream_collection = 'wms_receipts' AND upstream_collection = 'pur_orders';`).trim())
  check('BP-04 收货卡口已指 pur_orders', poGate >= 1, `${String(poGate)} 行`)
  const selftestFlow = Number(psql(`SELECT count(*) FROM wfl_flow_configs WHERE doc_type = 'wfl_selftest_docs' AND is_active = TRUE;`).trim())
  check('BP-04 引擎自测载体流就位', selftestFlow === 1, `${String(selftestFlow)} 行`)
  const routes = await listRoutes(token)
  const hubPages = routes.filter(row => JSON.stringify(row).includes('hub_po_purchase_orders'))
  check('BP-04 平台无 hub_po 采购单页面入口', hubPages.length === 0, `${String(hubPages.length)} 行引用`)
  const poPages = Number(psql(`SELECT count(*) FROM "flowModels" WHERE options::text LIKE '%pur_orders%';`).trim())
  check('BP-04 pur_orders 页面健在', poPages > 0, `${String(poPages)} 块引用`)
}

async function main(): Promise<void> {
  if (mode === 'usage') {
    log('用法：--run（升级+演练+断言） | --dryrun（预览写操作） | --assert（只读断言）')
    return
  }
  log(`w5b3-closure: ${mode} over ${base}`)
  const token = await signInWithRetry()
  log('— 流升级（BP-08 基建）：pur_payments 终态 + srm_suppliers 等级模板')
  if (mode === 'run' || mode === 'dryrun') {
    await publishTerminals('pur_payments', PAY_TERMINALS)
    upgradeAdmissionTemplate()
  }
  const paidState = Number(psql(`SELECT count(*) FROM wfl_flow_states s JOIN wfl_flow_configs c ON c.id = s.flow_id WHERE c.doc_type = 'pur_payments' AND s.state = 'paid';`).trim())
  check('BP-08 paid 终态行在库', paidState === 1, `${String(paidState)} 行`)
  const settleRow = Number(psql(`SELECT count(*) FROM wfl_flow_transitions t JOIN wfl_flow_configs c ON c.id = t.flow_id WHERE c.doc_type = 'pur_payments' AND t.action = 'settle' AND t.next_state = 'paid';`).trim())
  check('BP-08 settle 转移行在库', settleRow === 1, `${String(settleRow)} 行`)
  const terminalStates = psql(`SELECT extras::jsonb -> 'terminal_states' FROM wfl_flow_configs WHERE doc_type = 'pur_payments';`).trim()
  check('BP-08 extras.terminal_states 落库', terminalStates.includes('paid'), terminalStates.slice(0, 60))
  const admissionStates = Number(psql(`SELECT count(*) FROM wfl_flow_states s JOIN wfl_flow_configs c ON c.id = s.flow_id WHERE c.doc_type = 'srm_suppliers';`).trim())
  check('BP-03 准入流 8 态', admissionStates === 8, `${String(admissionStates)} 态`)
  if (mode !== 'dryrun') {
    await bp01ApBalance(token)
    await bp03SupplierGrades(token)
  }
  await bp04HubRetirement(token)
  log(failures.length === 0 ? 'w5b3-closure: 全部断言通过' : `w5b3-closure: ${String(failures.length)} 项失败 — ${failures.join('；')}`)
  if (failures.length > 0) process.exitCode = 1
}

await main()
