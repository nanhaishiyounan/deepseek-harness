/**
 * W6-B0: the mobile identity & audit base — the approval-configuration leg.
 *
 * 1. Retires the hardcoded `manager` tiers on the four mobile-registered
 *    doc types (pur_orders / pur_requests / so_orders / mfg_orders) in favor
 *    of the engine's supervisorChain marker: the first-level todo routes to
 *    the SUBMITTER's own department owner (the real supervisor chain), not a
 *    fixed username — so a buyer-submitted PO lands on 采购部's owner and a
 *    shop_lead-submitted MO on 生产车间's owner. `gm` tiers stay as-is.
 * 2. Asserts the eight W5-B8 rehearsal accounts and their department wiring
 *    (the mobile login's real account base).
 * 3. `--probe`: one live end-to-end routing proof on pur_orders — create a
 *    draft as the service account, submit it through the engine as `buyer`,
 *    assert the open todo belongs to 采购部's owner (non-admin), then reject
 *    the probe document to leave the ledger clean.
 *
 * Usage:
 *   node --import tsx/esm examples/kb-agent/scripts/w6b0-identity.mts --run
 *   node --import tsx/esm examples/kb-agent/scripts/w6b0-identity.mts --assert
 *   node --import tsx/esm examples/kb-agent/scripts/w6b0-identity.mts --probe
 */
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dataOf, signInWithRetry } from './nocobase-flow-page-lib.mts'

const args = process.argv.slice(2)
const mode = args.includes('--run') ? 'run' : args.includes('--probe') ? 'probe' : 'assert'
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

/** The mobile-registered doc types whose manager tier rides the supervisor chain (W6-B0). */
const SUPERVISOR_CHAIN_DOC_TYPES = ['pur_orders', 'pur_requests', 'so_orders', 'mfg_orders'] as const

/** The marker the manager tier becomes: the submitter's own department owner, admin on an ownerless gap. */
const SUPERVISOR_MARKER = { type: 'supervisorChain', levels: 1, emptyPolicy: 'transferAdmin' } as const

/** The eight rehearsal accounts and their expected department (W5-B8 seed; finance rides no department). */
const EXPECTED_ACCOUNTS: ReadonlyArray<{ username: string, department: string }> = [
  { username: 'admin', department: '' },
  { username: 'buyer', department: '采购部' },
  { username: 'planner', department: '计划部（PMC）' },
  { username: 'shop_lead', department: '生产车间' },
  { username: 'qc_inspector', department: '质检部' },
  { username: 'keeper', department: '仓储部' },
  { username: 'sales_rep', department: '销售部' },
  { username: 'finance', department: '' },
]

/** Read one doc type's active flow config row (or undefined). */
async function activeFlowOf(token: string, docType: string): Promise<{ id: number, approverMap: Record<string, unknown> } | undefined> {
  const rows = await dataOf(token, 'GET', `/api/wfl_flow_configs:list?filter=${encodeURIComponent(JSON.stringify({ doc_type: docType, is_active: true }))}&pageSize=5`) as Array<Record<string, any>> | null ?? []
  const row = rows[0]
  if (row === undefined) return undefined
  const raw = typeof row.approver_map === 'string' && row.approver_map !== '' ? JSON.parse(row.approver_map) : row.approver_map ?? {}
  return { id: Number(row.id), approverMap: raw as Record<string, unknown> }
}

/** Whether one approver_map value already is the W6-B0 supervisorChain marker. */
function isSupervisorMarker(value: unknown): boolean {
  if (typeof value !== 'object' || value === null) return false
  const record = value as Record<string, unknown>
  return record['type'] === 'supervisorChain' && Number(record['levels']) === 1 && record['emptyPolicy'] === 'transferAdmin'
}

/** Leg 1: route the four doc types' manager tier through the submitter's supervisor chain. */
async function supervisorChainLeg(token: string): Promise<void> {
  log('— 审批配置：mobile 四单据 manager 层切真实主管链（supervisorChain）')
  for (const docType of SUPERVISOR_CHAIN_DOC_TYPES) {
    const flow = await activeFlowOf(token, docType)
    if (flow === undefined) {
      check(`流配置 ${docType}（激活）存在`, false, 'wfl_flow_configs 无激活行')
      continue
    }
    if (isSupervisorMarker(flow.approverMap['manager'])) {
      check(`${docType} manager=supervisorChain(levels:1)`, true)
      continue
    }
    if (mode === 'run') {
      const nextMap = JSON.stringify({ ...flow.approverMap, manager: SUPERVISOR_MARKER })
      await dataOf(token, 'POST', `/api/wfl_flow_configs:update?filterByTk=${String(flow.id)}`, { approver_map: nextMap })
      const after = await activeFlowOf(token, docType)
      check(`${docType} manager 切换 supervisorChain`, after !== undefined && isSupervisorMarker(after.approverMap['manager']), `配置 #${String(flow.id)} 更新`)
    } else {
      check(`${docType} manager=supervisorChain(levels:1)`, false, `当前 ${JSON.stringify(flow.approverMap['manager'])}`)
    }
  }
  // Every business department the supervisor chain rides must have an owner,
  // or transferAdmin silently widens (储备人才池-style pools are out of scope).
  const ownerless = psql(
    `SELECT string_agg(d.title, '、') FROM departments d WHERE d.title IN ('采购部','计划部（PMC）','生产车间','质检部','仓储部','销售部') AND d.id NOT IN (SELECT "departmentId" FROM "departmentsUsers" WHERE "isOwner" = true);`,
  ).trim()
  check('六个业务部门均有 owner（主管链可解析）', ownerless === '', ownerless === '' ? '' : `无 owner：${ownerless}`)
}

/** Leg 2: the eight real accounts and their department wiring. */
function accountsLeg(): void {
  log('— 八角色真实账号与部门挂接')
  for (const account of EXPECTED_ACCOUNTS) {
    const exists = psql(`SELECT count(*) FROM users WHERE username = '${account.username}';`).trim()
    if (account.department === '') {
      check(`账号 ${account.username} 存在（无部门要求）`, exists === '1', `users 行=${exists}`)
      continue
    }
    const attached = psql(
      `SELECT count(*) FROM "departmentsUsers" du JOIN users u ON u.id = du."userId" JOIN departments d ON d.id = du."departmentId" WHERE u.username = '${account.username}' AND d.title = '${account.department}';`,
    ).trim()
    check(
      `账号 ${account.username} @ ${account.department} 挂接正确`,
      Number(attached) > 0,
      `departmentsUsers 行=${attached}`,
    )
  }
}

/** Leg 3 (--probe): buyer submits a probe PO through the engine; the todo must route to 采购部's owner. */
async function probeLeg(token: string): Promise<void> {
  log('— 送审路由探针：buyer 提交 → 待办落采购部 owner（非 admin）')
  const stamp = new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 12)
  const code = `PO-W6B0-${stamp}`
  const supplierRow = psql("SELECT id FROM srm_suppliers WHERE lifecycle_status IN ('qualified','preferred') ORDER BY id LIMIT 1;").trim()
  if (supplierRow === '') {
    check('探针供应商（合格/优选）存在', false)
    return
  }
  const created = await dataOf(token, 'POST', '/api/pur_orders:create', {
    code, supplier_id: Number(supplierRow), amount: 600, currency: 'CNY',
    doc_status: 'draft', receiving_status: 'none', invoice_status: 'no_invoice',
  }) as { id?: unknown } | null
  const docId = Number(created?.id ?? 0)
  check('探针采购单落库（draft）', docId > 0, `${code} #${String(docId)}`)

  const engineBase = process.env.NOCOBASE_ENGINE_URL ?? 'http://127.0.0.1:13110'
  const submit = await fetch(`${engineBase}/submit`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ doc_type: 'pur_orders', doc_id: docId, approver: 'buyer' }),
    signal: AbortSignal.timeout(30_000),
  }).then(async response => await response.json() as { ok?: boolean, result?: { to_state?: string }, error?: string }).catch(() => null)
  check('引擎 submit（approver=buyer）成功', submit?.ok === true && submit.result?.to_state === 'pending', `to_state=${String(submit?.result?.to_state ?? '—')} ${submit?.error ?? ''}`)

  const submitApprover = psql(`SELECT approver FROM wfl_approval_records WHERE doc_type='pur_orders' AND doc_id=${String(docId)} AND action='submit' ORDER BY id DESC LIMIT 1;`).trim()
  check('wfl 送审记录 approver=buyer（非 admin）', submitApprover === 'buyer', `approver=${submitApprover}`)

  const todoUser = psql(`SELECT "user" FROM wfl_approval_todos WHERE doc_type='pur_orders' AND doc_id=${String(docId)} AND status='open' AND kind <> 'cc' LIMIT 1;`).trim()
  const expectedOwner = psql(
    "SELECT u.username FROM \"departmentsUsers\" du JOIN users u ON u.id = du.\"userId\" JOIN departments d ON d.id = du.\"departmentId\" WHERE d.title='采购部' AND du.\"isOwner\"=true LIMIT 1;",
  ).trim()
  check('待办路由到采购部 owner（真实主管）', todoUser === expectedOwner && todoUser !== '' && todoUser !== 'admin', `todo=${todoUser} 期望=${expectedOwner}`)

  // Cleanup: reject the probe document as the routed owner, leaving no pending todo behind.
  if (todoUser !== '') {
    await fetch(`${engineBase}/act`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ doc_type: 'pur_orders', doc_id: docId, action: 'reject', approver: todoUser, comment: 'W6-B0 探针清理' }),
      signal: AbortSignal.timeout(30_000),
    }).then(async response => await response.json() as { ok?: boolean }).catch(() => null)
  }
  const openLeft = psql(`SELECT count(*) FROM wfl_approval_todos WHERE doc_type='pur_orders' AND doc_id=${String(docId)} AND status='open';`).trim()
  check('探针清理（拒绝关闭待办）', openLeft === '0', `残留 open 待办=${openLeft}`)
}

async function main(): Promise<void> {
  log(`w6b0-identity: ${mode === 'run' ? 'run（配置切换+断言）' : mode === 'probe' ? 'probe（活体路由探针）' : 'assert（只读断言）'}`)
  const token = await signInWithRetry()
  await supervisorChainLeg(token)
  accountsLeg()
  if (mode === 'probe') await probeLeg(token)
  if (failures.length > 0) {
    throw new Error(`w6b0-identity ${mode} 失败 ${String(failures.length)} 项：\n  - ${failures.join('\n  - ')}`)
  }
  console.log(`w6b0-identity: ${mode} 全部断言通过`)
}

await main()
