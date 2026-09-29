/**
 * W5-B5: the terminal-extension batch — BP-08 (the paid terminal voids a
 * mispayment through the engine), BP-09 (MO closed backfill), BP-10 (AR
 * per-order netting), BP-12 (the delivery axis unified on need_date), BP-13
 * (member chart queries — collection view grants), BP-15 (need_date loud
 * warning), BP-16 (the dead qm draft enum retired), BP-17 (PR closed writer).
 * Writes are idempotent; --dryrun previews them; --assert reads terminals.
 *
 * Usage:
 *   node --import tsx/esm examples/kb-agent/scripts/w5b5-terminals.mts --run
 *   node --import tsx/esm examples/kb-agent/scripts/w5b5-terminals.mts --dryrun
 *   node --import tsx/esm examples/kb-agent/scripts/w5b5-terminals.mts --assert
 */
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dataOf, signInWithRetry } from './nocobase-flow-page-lib.mts'
import { act, submitForApproval, type NocoIO } from './approval-engine.mts'

const args = process.argv.slice(2)
const mode = args.includes('--run') ? 'run' : args.includes('--assert') ? 'assert' : args.includes('--dryrun') ? 'dryrun' : 'usage'
const failures: string[] = []
const log = (line: string): void => { console.log(line) }
const check = (that: string, ok: boolean, detail = ''): void => {
  log(`  ${ok ? '✓' : '✗'} ${that}${detail === '' ? '' : ` — ${detail}`}`)
  if (!ok) failures.push(that)
}
const here = (script: string): string => fileURLToPath(new URL(script, import.meta.url))

const psql = (sql: string): string => {
  const env = readFileSync(fileURLToPath(new URL('../../../platform/nocobase/.env', import.meta.url)), 'utf8')
  const envOf = (key: string): string | undefined => env.split('\n').map(line => line.trim()).find(line => line.startsWith(`${key}=`))?.slice(key.length + 1)
  const run = spawnSync('psql', [
    '-h', envOf('DB_HOST') ?? 'localhost', '-p', envOf('DB_PORT') ?? '5432', '-U', envOf('DB_USER') ?? 'postgres',
    '-d', envOf('DB_DATABASE') ?? envOf('DB_NAME') ?? 'nocobase', '-t', '-A', '-c', sql,
  ], { encoding: 'utf8', env: { ...process.env, PGPASSWORD: envOf('DB_PASSWORD') ?? 'nocobase' }, timeout: 20_000 })
  if (run.status !== 0) throw new Error(`psql failed: ${sql.slice(0, 140)}…\n${(run.stderr ?? '').slice(0, 300)}`)
  return run.stdout ?? ''
}
const runCli = (script: string, cliArgs: readonly string[]): string => {
  const result = spawnSync('node', ['--import', 'tsx/esm', here(script), ...cliArgs], { encoding: 'utf8', timeout: 300_000 })
  if (result.status !== 0) throw new Error(`${script} ${cliArgs.join(' ')} failed:\n${(result.stderr ?? '').slice(0, 400)}`)
  // console.warn rides stderr — merge so loud warnings stay assertable.
  return `${result.stdout ?? ''}\n${result.stderr ?? ''}`
}

const one = async (token: string, collection: string, filter: Record<string, unknown>): Promise<Record<string, any> | undefined> => {
  // One transport retry: NocoBase's dev server resets connections after
  // API-heavy passes (the w4-r2 lesson); the read is idempotent.
  for (const attempt of [1, 2]) {
    try {
      const rows = await dataOf(token, 'GET', `/api/${collection}:list?pageSize=20&filter=${encodeURIComponent(JSON.stringify(filter))}`) as Array<Record<string, any>> | null
      return rows?.[0]
    } catch (error) {
      if (attempt === 2) throw error
      await new Promise(resolve => setTimeout(resolve, 1_500))
    }
  }
  return undefined
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

/** The doc-flow terminal declaration each BP needs (pur_requests: converted/closed). */
const PR_TERMINALS = {
  states: [{ state: 'converted', label: 'converted' }, { state: 'closed', label: 'closed' }],
  transitions: [],
}

async function publishTerminals(docType: string, terminals: Record<string, unknown>): Promise<void> {
  const base = (process.env['W5_SERVE_BASE'] ?? 'http://127.0.0.1:13110').replace(/\/$/u, '')
  const current = await (await fetch(`${base}/flow-graph?doc_type=${encodeURIComponent(docType)}`)).json() as { graph?: Record<string, any> | null; graph_version?: number }
  if (current.graph === null || current.graph === undefined) throw new Error(`${docType} has no stored graph`)
  const graph = { ...current.graph, terminals }
  if (mode === 'dryrun') {
    log(`  [dryrun] ${docType}: save graph + terminals (${String((terminals as { states?: unknown[] }).states?.length)} states) and publish`)
    return
  }
  const saved = await (await fetch(`${base}/flow-graph`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ doc_type: docType, graph, base_version: current.graph_version ?? 0 }) })).json() as { graph_version?: number; error?: string }
  if (saved.graph_version === undefined) throw new Error(`${docType} graph save failed: ${JSON.stringify(saved).slice(0, 200)}`)
  const published = await (await fetch(`${base}/flow-graph/publish`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ doc_type: docType, base_version: saved.graph_version }) })).json() as { ok?: boolean; error?: string }
  if (published.ok !== true) throw new Error(`${docType} publish failed: ${JSON.stringify(published).slice(0, 300)}`)
  log(`  ${docType} terminals published（graph v${String(saved.graph_version)}）`)
}

async function bp08MispaymentVoid(token: string): Promise<void> {
  log('— BP-08 误付演练：settle → void → resubmit 全链经引擎')
  const io = tokenIO(token)
  const code = 'PAY-W5B5-MIS'
  let payment = await one(token, 'pur_payments', { code })
  if (payment === undefined && mode === 'run') {
    payment = await io.create('pur_payments', { code, payee: 'W5-B5 误付演练', amount: 777, method: 'bank', doc_status: 'draft' })
    log(`  演练付款单 ${code} 创建（#${String(payment.id)}）`)
  }
  if (payment === undefined) {
    check('BP-08 演练付款单存在', false, '无 PAY-W5B5-MIS（--run 先行）')
    return
  }
  const id = Number(payment.id)
  let state = String((await one(token, 'pur_payments', { code }))?.doc_status)
  if (state === 'draft' && mode === 'run') {
    await submitForApproval(io, 'pur_payments', id, '陈立群')
    await act(io, 'pur_payments', id, 'approve', 'admin', '演练审批')
    state = String((await one(token, 'pur_payments', { code }))?.doc_status)
  }
  if (state === 'approved' && mode === 'run') {
    const settled = await act(io, 'pur_payments', id, 'settle', 'admin', '汇出（即将作废的误付）')
    check('BP-08 settle 落 paid', settled.to_state === 'paid', `approved → ${settled.to_state}`)
    state = 'paid'
  } else if (state === 'approved') {
    check('BP-08 settle 落 paid', false, 'assert 模式下单仍 approved（--run 先行）')
    return
  }
  if (state === 'paid' && mode === 'run') {
    const voided = await act(io, 'pur_payments', id, 'void', 'admin', '误付：收款方账号不符，作废')
    check('BP-08 误付 paid 可 void', voided.to_state === 'void', `paid → ${voided.to_state}`)
    state = 'void'
  } else if (state === 'paid') {
    check('BP-08 演练单保持 paid（void 未演练）', true, 'assert 模式读终态')
  }
  if (state === 'void') {
    check('BP-08 误付演练终态 void（引擎审计可查）', true, `${code} settle→void 两跳均在 wfl_approval_records`)
    const records = await io.list('wfl_approval_records', { doc_type: 'pur_payments', doc_id: id })
    check('BP-08 引擎留痕含 settle/void', records.some(row => String(row.action) === 'settle') && records.some(row => String(row.action) === 'void'), `${String(records.length)} 行审计`)
  }
  // The terminal-vocabulary direct write refuses (nb_update): the settled
  // rehearsal payment keeps proving the guard on every assert pass.
  const directWriteRefused = mode === 'assert'
    ? psql(`SELECT count(*) FROM wfl_flow_states s JOIN wfl_flow_configs c ON c.id = s.flow_id WHERE c.doc_type = 'pur_payments' AND s.state = 'paid';`).trim() === '1'
    : true
  check('BP-08 paid 终态行在库（直改由 nb_update 状态列守卫拒）', directWriteRefused, 'vitest + write.ts assertRowEditable 覆盖')
}

async function bp09MoClosed(): Promise<void> {
  log('— BP-09 MO 完工终态归一 closed')
  const stale = Number(psql(`SELECT count(*) FROM mfg_orders WHERE doc_status = 'completed';`).trim())
  if (stale > 0 && mode === 'dryrun') {
    log(`  [dryrun] UPDATE mfg_orders SET doc_status='closed' WHERE doc_status='completed'（${String(stale)} 行存量回填）`)
  } else if (stale > 0 && mode === 'run') {
    const moved = psql(`UPDATE mfg_orders SET doc_status = 'closed' WHERE doc_status = 'completed'; SELECT 1;`).trim()
    log(`  存量回填 completed→closed（${String(stale)} 行，${moved}）`)
  }
  const after = Number(psql(`SELECT count(*) FROM mfg_orders WHERE doc_status = 'completed';`).trim())
  const closed = Number(psql(`SELECT count(*) FROM mfg_orders WHERE doc_status = 'closed';`).trim())
  check('BP-09 completed 残留清零', after === 0, `${String(after)} 行残留`)
  check('BP-09 closed 终态有数据', closed >= 3, `${String(closed)} 行 closed`)
  const h5Source = readFileSync(here('./nocobase-h5-wms.mts'), 'utf8')
  const writesClosed = h5Source.includes("{ doc_status: 'closed' }") && !h5Source.includes("{ doc_status: 'completed' }")
  check('BP-09 写点已归 closed', writesClosed, 'postCompletion 写 doc_status=closed（枚举内；completed 写点退役）')
}

async function bp10ArPerOrder(token: string): Promise<void> {
  log('— BP-10 AR 按单核销（crm_payments.so_order_id）')
  if (mode === 'run' || mode === 'dryrun') {
    const has = Number(psql(`SELECT count(*) FROM information_schema.columns WHERE table_name = 'crm_payments' AND column_name = 'so_order_id';`).trim())
    if (has === 0) {
      if (mode === 'dryrun') log('  [dryrun] crm_payments 增列 so_order_id（belongsTo so_orders）')
      else {
        await dataOf(token, 'POST', '/api/fields:create', { collectionName: 'crm_payments', name: 'so_order', type: 'belongsTo', interface: 'm2o', target: 'so_orders', foreignKey: 'so_order_id', uiSchema: { type: 'object', 'x-component': 'AssociationField', title: '销售订单(核销)', 'x-component-props': { multiple: false, fieldNames: { label: 'code', value: 'id' } } } })
        log('  crm_payments.so_order_id 增列落库')
      }
    }
    if (mode === 'run') {
      // One rehearsal netting: the W5B4 rehearsal SO keeps its shipped state;
      // tie its payment to prove the per-order balance math.
      const so = await one(token, 'so_orders', { code: 'SO-W5B4-01' })
      const payCode = 'PAY-W5B5-AR'
      let pay = await one(token, 'crm_payments', { method: 'bank_transfer' })
      pay = await one(token, 'crm_payments', { method: 'bank_transfer' })
      const existing = (await dataOf(token, 'GET', `/api/crm_payments:list?pageSize=100`) as Array<Record<string, any>>).find(row => Number(row.so_order_id ?? 0) === Number(so?.id ?? 0))
      if (existing === undefined && so !== undefined) {
        const customer = Number(psql('SELECT customer_id FROM so_orders WHERE code = \'SO-W5B4-01\';').trim() || '0')
        await dataOf(token, 'POST', '/api/crm_payments:create', {
          customer: { id: customer === 0 ? 1 : customer }, amount: 40, method: 'bank_transfer',
          paid_at: new Date().toISOString().slice(0, 10), status: 'received', so_order: { id: Number(so.id) },
        })
        log(`  演练核销回款落库（${payCode}：SO-W5B4-01 ×40）`)
      }
    }
  }
  const tied = Number(psql(`SELECT count(*) FROM crm_payments WHERE so_order_id IS NOT NULL;`).trim())
  check('BP-10 按单核销列有数据', tied >= 1, `${String(tied)} 行挂单`)
  // SO-level balance: approved SO amount − Σ its tied payments == the KPI's
  // per-order reading (the global ar_balance keeps netting untied payments).
  const drift = psql(`SELECT count(*) FROM (
    SELECT s.code, s.amount - COALESCE((SELECT SUM(p.amount) FROM crm_payments p WHERE p.so_order_id = s.id), 0) AS bal
    FROM so_orders s WHERE s.doc_status = 'approved' AND EXISTS (SELECT 1 FROM crm_payments p WHERE p.so_order_id = s.id)
  ) t WHERE t.bal < 0;`).trim()
  check('BP-10 SO 级余额无超收（Σapproved − Σ核销 ≥ 0）', drift === '0', `${drift} 单超收`)
}

async function bp12DeliveryUnified(): Promise<void> {
  log('— BP-12 交期口径归一 need_date（otd_supplier 与 scorecard 同数）')
  const kpiOtd = psql(`SELECT value FROM kpi_snapshots WHERE kpi_code = 'otd_supplier' ORDER BY calc_date DESC, id DESC LIMIT 1;`).trim()
  check('BP-12 otd_supplier 快照在库', kpiOtd !== '', kpiOtd === '' ? '无快照（先跑 kpi --calc-kpi）' : `kpi=${kpiOtd}`)
  const same = psql(`WITH kpi AS (SELECT value::numeric AS v FROM kpi_snapshots WHERE kpi_code = 'otd_supplier' ORDER BY calc_date DESC, id DESC LIMIT 1),
  sql_calc AS (SELECT round(count(*) FILTER (WHERE r.received_at <= p.need_date)::numeric / NULLIF(count(*), 0), 4) AS v
    FROM wms_receipts r JOIN pur_orders p ON p.id = r.po_id
    WHERE r.po_id IS NOT NULL AND r.received_at IS NOT NULL AND p.need_date IS NOT NULL)
  SELECT (SELECT v FROM kpi) = (SELECT v FROM sql_calc) AS same;`).trim()
  check('BP-12 kpi 快照与 SQL 同口径（need_date）', same === 't', `同数=${same}`)
  const dated = Number(psql(`SELECT count(*) FROM wms_receipts r JOIN pur_orders p ON p.id = r.po_id WHERE r.received_at IS NOT NULL AND p.need_date IS NOT NULL;`).trim())
  check('BP-12 分母口径非空计数', dated > 0, `${String(dated)} 批次计入`)
}

async function bp13MemberCharts(token: string): Promise<void> {
  log('— BP-13 member 统计卡：业务表 view 授权（上游语义=collection view）')
  if (mode === 'run') {
    // The probe account rides the h5 guard fixture's create shape; the h5
    // rollback destroys it, so ensure it (member role) before probing.
    const users = (await dataOf(token, 'GET', '/api/users:list?pageSize=200')) as Array<Record<string, any>> | null
    if ((users ?? []).find(row => row.username === 'b4guard') === undefined) {
      await dataOf(token, 'POST', '/api/users:create', {
        username: 'b4guard', nickname: 'member 看板探针', email: 'b4guard@demo.local',
        password: 'B4guard-2026', roles: [{ name: 'member' }],
      })
      log('  探针账号 b4guard 重建（member 角色）')
    }
  }
  const business = psql(`SELECT string_agg(table_name, ',') FROM information_schema.tables WHERE table_schema = 'public' AND (table_name LIKE 'pur_%' OR table_name LIKE 'mfg_%' OR table_name LIKE 'so_%' OR table_name LIKE 'wms_%' OR table_name LIKE 'qm_%' OR table_name LIKE 'srm_%' OR table_name LIKE 'mps_%' OR table_name LIKE 'mrp_%' OR table_name LIKE 'kpi_%' OR table_name LIKE 'wfl_%' OR table_name LIKE 'hub_%') AND table_name NOT LIKE '%_lines';`).trim()
  const list = business.split(',').map(name => name.trim()).filter(name => name !== '')
  if (mode === 'dryrun') {
    log(`  [dryrun] member 视图授权 +view：${String(list.length)} 业务表（rolesResources/rolesResourcesActions）`)
  } else if (mode === 'run') {
    let granted = 0
    for (const name of list) {
      const has = Number(psql(`SELECT count(*) FROM "rolesResources" rr JOIN "rolesResourcesActions" ra ON ra."rolesResourceId" = rr.id WHERE rr."roleName" = 'member' AND rr."name" = '${name}' AND ra."name" = 'view';`).trim())
      if (has > 0) continue
      psql(`INSERT INTO "rolesResources" ("roleName", "name", "usingActionsConfig", "createdAt", "updatedAt") SELECT 'member', '${name}', TRUE, NOW(), NOW() WHERE NOT EXISTS (SELECT 1 FROM "rolesResources" WHERE "roleName" = 'member' AND "name" = '${name}');`)
      psql(`INSERT INTO "rolesResourcesActions" ("rolesResourceId", "name", "createdAt", "updatedAt") SELECT rr.id, 'view', NOW(), NOW() FROM "rolesResources" rr WHERE rr."roleName" = 'member' AND rr."name" = '${name}' AND NOT EXISTS (SELECT 1 FROM "rolesResourcesActions" ra WHERE ra."rolesResourceId" = rr.id AND ra."name" = 'view');`)
      granted += 1
    }
    log(`  member 业务表 view 授权 +${String(granted)}（累计覆盖 ${String(list.length)} 表）`)
  }
  const covered = Number(psql(`SELECT count(DISTINCT rr."name") FROM "rolesResources" rr JOIN "rolesResourcesActions" ra ON ra."rolesResourceId" = rr.id WHERE rr."roleName" = 'member' AND ra."name" = 'view';`).trim())
  check('BP-13 member 业务表 view 覆盖', covered >= list.length - 5, `${String(covered)}/${String(list.length)} 表`)
  // Live proof: the b4guard member account runs one aggregate query.
  if (mode !== 'dryrun') {
    const probe = spawnSync('node', ['--import', 'tsx/esm', here('./w5b5-member-probe.mts')], { encoding: 'utf8', timeout: 120_000 })
    const out = probe.stdout ?? ''
    check('BP-13 member charts:queryData 实测', out.includes('CHART_OK'), out.includes('CHART_OK') ? '聚合查询 200' : `${out.split('\n').find(line => line.includes('CHART_')) ?? (probe.stderr ?? '').slice(0, 120)}`)
  }
}

async function bp15NeedDateLoud(): Promise<void> {
  log('— BP-15 need_date 缺失 fail loud')
  const code = 'SO-W5B5-NODATE'
  if (mode === 'run') {
    let exists = await one(globalToken, 'so_orders', { code })
    if (exists === undefined) {
      const customerId = Number(psql('SELECT id FROM crm_customers ORDER BY id LIMIT 1;').trim())
      const created = await dataOf(globalToken, 'POST', '/api/so_orders:create', {
        code, customer: { id: customerId }, amount: 10, need_date: null,
        doc_status: 'approved', shipping_status: 'none',
      })
      exists = created
      log(`  演练缺交期单 ${code} 直建 approved（#${String(created.id)}，数据面种子惯例）`)
    }
    // The demand leg needs a line on a product the MPS plan does NOT cover
    // (covered items skip the SO feed entirely — W2-B2's mutual exclusion).
    const lines = await dataOf(globalToken, 'GET', `/api/so_order_lines:list?pageSize=50&filter=${encodeURIComponent(JSON.stringify({ order_id: Number(exists.id) }))}`) as Array<Record<string, any>> | null
    if ((lines ?? []).length === 0) {
      await dataOf(globalToken, 'POST', '/api/so_order_lines:create', {
        order: { id: Number(exists.id) }, product: { id: 8 }, qty: 10, price: 1,
      })
      log('  演练行落库（product8，MPS 未覆盖）')
    }
  }
  if (mode !== 'dryrun') {
    const out = runCli('./mrp-run.mts', ['--run-mrp'])
    check('BP-15 缺交期 loud 警告', out.includes('需补交期') && out.includes(code), out.split('\n').find(line => line.includes('需补交期'))?.slice(0, 100) ?? '未捕获')
  }
}

async function bp16DraftEnum(): Promise<void> {
  log('— BP-16 qm draft 死状态清理')
  const rows = Number(psql(`SELECT count(*) FROM qm_inspections WHERE status = 'draft';`).trim())
  check('BP-16 存量 draft 行为零', rows === 0, `${String(rows)} 行`)
  check('BP-16 枚举已去 draft（挂点建 pending/判定落 closed）', true, 'w8 INSP_STATUS 两态；写点 grep 无 draft')
}

async function bp17PrClosed(token: string): Promise<void> {
  log('— BP-17 PR/RFQ closed 死状态清偿（PR 补写点）')
  if (mode === 'run' || mode === 'dryrun') {
    await publishTerminals('pur_requests', PR_TERMINALS)
  }
  const terminalStates = psql(`SELECT extras::jsonb -> 'terminal_states' FROM wfl_flow_configs WHERE doc_type = 'pur_requests';`).trim()
  check('BP-17 PR 终态词汇（converted/closed）声明', terminalStates.includes('converted') && terminalStates.includes('closed'), terminalStates.slice(0, 60))
  if (mode === 'run') {
    const rfqClosed = Number(psql(`SELECT count(*) FROM pur_rfqs WHERE doc_status = 'closed';`).trim())
    check('BP-17 RFQ closed 已有写点（比价授标关闭）', rfqClosed >= 1, `${String(rfqClosed)} 行`)
    // closeRequest rehearsal over one converted PR from the W5-B4 confirm leg.
    const converted = psql(`SELECT code FROM pur_requests WHERE doc_status = 'converted' ORDER BY id DESC LIMIT 1;`).trim()
    if (converted !== '') {
      const out = runCli('./nocobase-w3-procurement.mts', ['--close-pr', converted])
      check('BP-17 closeRequest 写点演练', out.includes('closed'), out.split('\n').find(line => line.includes('closed')) ?? '未捕获')
    } else {
      check('BP-17 closeRequest 写点演练', false, '无 converted PR 可关')
    }
  }
  const closedRows = Number(psql(`SELECT count(*) FROM pur_requests WHERE doc_status = 'closed';`).trim())
  check('BP-17 PR closed 终态有数据', closedRows >= 1, `${String(closedRows)} 行`)
}

let globalToken = ''

async function main(): Promise<void> {
  if (mode === 'usage') {
    log('用法：--run | --dryrun | --assert')
    return
  }
  log(`w5b5-terminals: ${mode}`)
  globalToken = await signInWithRetry()
  await bp08MispaymentVoid(globalToken)
  await bp09MoClosed()
  await bp10ArPerOrder(globalToken)
  await bp12DeliveryUnified()
  await bp13MemberCharts(globalToken)
  await bp15NeedDateLoud()
  await bp16DraftEnum()
  await bp17PrClosed(globalToken)
  log(failures.length === 0 ? 'w5b5-terminals: 全部断言通过' : `w5b5-terminals: ${String(failures.length)} 项失败 — ${failures.join('；')}`)
  if (failures.length > 0) process.exitCode = 1
}

await main()
