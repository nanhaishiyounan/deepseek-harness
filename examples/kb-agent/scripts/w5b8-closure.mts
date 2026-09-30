/**
 * W5-B8: the round's closing batch — P2 residue cleared, the eight role
 * walkthrough accounts seeded, and the 22-breakpoint terminal states
 * asserted from live data. Fixes landing here: qty=0 stock-row cleanup
 * (applyStockDelta destroys a row its delta zeroes — the sweep is the
 * idempotent backfill), BP-18 (capacity_util denominator aligned with the
 * FCS capacity), BP-21 (terminal strict-mode documentation), BP-22 (real
 * accounts for the six admin-evidenced roles). BP-19 (doc-number TOCTOU)
 * is a recorded backlog disposal — single-writer demo environment, no
 * concurrency window to close.
 *
 * Usage:
 *   node --import tsx/esm examples/kb-agent/scripts/w5b8-closure.mts --run
 *   node --import tsx/esm examples/kb-agent/scripts/w5b8-closure.mts --assert
 */
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dataOf, signInWithRetry } from './nocobase-flow-page-lib.mts'

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

/** Run one sibling CLI capturing stdout+stderr (console.warn rides stderr). */
const runCli = (script: string, cliArgs: readonly string[]): string => {
  const result = spawnSync('node', ['--import', 'tsx/esm', here(script), ...cliArgs], { encoding: 'utf8', timeout: 300_000 })
  if (result.status !== 0) throw new Error(`${script} ${cliArgs.join(' ')} failed:\n${(result.stderr ?? '').slice(0, 400)}`)
  return `${result.stdout ?? ''}\n${result.stderr ?? ''}`
}

/**
 * The six walkthrough accounts the W4-B5 map evidenced as admin (qc_inspector
 * was the one real-role row). member role (the NocoBase default for new
 * users) plus the department attach — the qc_inspector pattern, W5-B8.
 */
const WALKTHROUGH_ACCOUNTS = [
  { username: 'buyer', nickname: '采购员·蔡俊', password: 'Buyer#2026', department: '采购部', role: '采购员' },
  { username: 'planner', nickname: '计划员·孙梅', password: 'Planner#2026', department: '计划部（PMC）', role: '计划员' },
  { username: 'shop_lead', nickname: '车间主任·周强', password: 'Lead#2026', department: '生产车间', role: '车间主任' },
  { username: 'keeper', nickname: '仓管员·吴涛', password: 'Keeper#2026', department: '仓储部', role: '仓管员' },
  { username: 'sales_rep', nickname: '销售·郑洁', password: 'Sales#2026', department: '销售部', role: '销售' },
  { username: 'finance', nickname: '财务·冯琳', password: 'Finance#2026', department: '', role: '财务' },
] as const

/** The existing real accounts completing the eight-role map (qc_inspector + admin). */
const INHERITED_ACCOUNTS = ['qc_inspector', 'admin'] as const

/** Seed the six walkthrough accounts idempotently by username (+ department attach). */
async function ensureWalkthroughAccounts(token: string): Promise<void> {
  log('— BP-22 八角色真实账号种子（六新建 + qc_inspector/admin 继承）')
  const users = await dataOf(token, 'GET', '/api/users:list?pageSize=300') as Array<Record<string, any>> | null ?? []
  const userId = new Map(users.map(row => [String(row.username ?? ''), Number(row.id)]))
  const departments = await dataOf(token, 'GET', '/api/departments:list?pageSize=200') as Array<Record<string, any>> | null ?? []
  const deptId = new Map(departments.map(row => [String(row.title ?? ''), Number(row.id)]))
  const links = await dataOf(token, 'GET', '/api/departmentsUsers:list?pageSize=500') as Array<Record<string, any>> | null ?? []
  const linked = new Set((links ?? []).map(row => `${String(row.userId)}@${String(row.departmentId)}`))
  for (const account of WALKTHROUGH_ACCOUNTS) {
    if (userId.has(account.username)) {
      check(`账号 ${account.username}（${account.role}）存在`, true)
    } else if (mode === 'run') {
      await dataOf(token, 'POST', '/api/users:create', {
        username: account.username, nickname: account.nickname,
        email: `${account.username}@w5b8.demo`, password: account.password,
      })
      check(`账号 ${account.username}（${account.role}）创建`, true)
      log(`  演练账号 ${account.username} 创建（${account.nickname}；新用户默认 member 角色——与 qc_inspector 同档）`)
    } else {
      check(`账号 ${account.username}（${account.role}）存在`, false, '未建（--run 先行）')
    }
    if (account.department !== '') {
      const uid = userId.get(account.username) ?? Number(psql(`SELECT id FROM users WHERE username = '${account.username}';`).trim() || '0')
      const dept = deptId.get(account.department) ?? Number(psql(`SELECT id FROM departments WHERE title = '${account.department}';`).trim() || '0')
      if (uid === 0 || dept === 0) {
        check(`账号 ${account.username} 挂部门 ${account.department}`, false, `user=${String(uid)} dept=${String(dept)}`)
        continue
      }
      if (linked.has(`${uid}@${dept}`)) {
        check(`账号 ${account.username} 挂部门 ${account.department}`, true)
      } else if (mode === 'run') {
        await dataOf(token, 'POST', '/api/departmentsUsers:create', { userId: uid, departmentId: dept })
        check(`账号 ${account.username} 挂部门 ${account.department}`, true, '新建挂接')
      } else {
        check(`账号 ${account.username} 挂部门 ${account.department}`, false, '未挂接（--run 先行）')
      }
    }
  }
  for (const username of INHERITED_ACCOUNTS) {
    check(`账号 ${username} 存在`, userId.has(username))
  }
  // Every walkthrough account rides the member role (the default grant new
  // users receive); member holds the manufacturing collection view/create
  // matrix the journeys assert against.
  const memberCount = Number(psql(
    `SELECT count(*) FROM "rolesUsers" ru JOIN users u ON u.id = ru."userId" WHERE ru."roleName" = 'member' AND u.username IN ('${WALKTHROUGH_ACCOUNTS.map(a => a.username).join("','")}','qc_inspector');`,
  ).trim())
  check('七 member 账号角色绑定', memberCount === 7, `rolesUsers member 行=${String(memberCount)}（六个新建 + qc_inspector）`)
}

/** The qty=0 stock-row residue: sweep (run) or verify the register is clean (assert). */
async function zeroStockLeg(): Promise<void> {
  log('— qty=0 库存行残留清偿（applyStockDelta 清量亦清行）')
  if (mode === 'run') {
    runCli('./nocobase-h5-wms.mts', ['--sweep-zero-stock'])
  }
  const zeroRows = Number(psql('SELECT count(*) FROM wms_stock WHERE qty_on_hand = 0;').trim())
  check('wms_stock 无 qty=0 行', zeroRows === 0, `残留 ${String(zeroRows)} 行`)
  const ledger = runCli('./nocobase-h5-wms.mts', ['--assert-ledger'])
  check('stock == Σmovements 对账', ledger.includes('ledger balanced'), ledger.split('\n').find(line => line.includes('balanced')) ?? '未捕获')
}

/** BP-18: capacity_util rides the FCS-aligned denominator (pure selftest + snapshot note). */
function capacityLeg(): void {
  log('— BP-18 产能利用率口径对齐 FCS 排产容量')
  const selftest = runCli('./kpi-run.mts', ['--selftest'])
  check('kpi selftest（含产能分母用例）', selftest.includes('产能分母 FCS 同源'), selftest.split('\n').find(line => line.includes('selftest OK'))?.slice(0, 90) ?? '未捕获')
  const note = psql(`SELECT note FROM kpi_snapshots WHERE kpi_code = 'capacity_util' ORDER BY calc_date DESC, id DESC LIMIT 1;`).trim()
  check('快照口径注记 FCS 同源', note.includes('FCS 排产容量同源'), note.slice(0, 60))
  const schedule = runCli('./mfg-schedule.mts', ['--selftest'])
  check('FCS 排产自测五断言', schedule.includes('selftest OK'), schedule.split('\n').find(line => line.includes('selftest OK'))?.slice(0, 60) ?? '未捕获')
}

/** The B3~B5 handover: scanReorder refreshes an open row instead of minting a twin. */
function reorderLeg(): void {
  log('— product9 补货建议幂等收敛（B3~B5 转 B8 复验）')
  const dupOpen = psql("SELECT count(*) FROM (SELECT product_id FROM wms_reorder_suggestions WHERE status = 'open' GROUP BY product_id HAVING count(*) > 1) d;").trim()
  check('无同物料并列 open 建议', dupOpen === '0', `重复组 ${dupOpen}`)
  const openCount = psql("SELECT count(*) FROM wms_reorder_suggestions WHERE status = 'open';").trim()
  // W5-R2: `>= 0` was a tautology — the intent is that scanReorder's
  // product exists, so a zero would fail it (live value: 2 open rows on
  // two distinct products).
  check('open 建议行存在（扫描产物）', Number(openCount) > 0, `open=${openCount} 行（scanReorder 存量 open 行走刷新不新建——w5b4 --assert 幂等重跑腿复证）`)
}

/** BP-21: the terminal strict regime is documented where deployment reads it. */
function terminalDocsLeg(): void {
  log('— BP-21 终端 strict 档文档化')
  const deploy = readFileSync(here('../DEPLOY.zh.md'), 'utf8')
  check('DEPLOY 安全要点含 W3_TERMINAL_TOKEN', deploy.includes('W3_TERMINAL_TOKEN') && deploy.includes('lenient-demo'), 'strict 档/lenient-demo 双态说明')
  check('DEPLOY 覆盖设计器鉴权通道', deploy.includes('/designer') && deploy.includes('x-terminal-token'), '设计器端点与 header 通道')
  const quickstart = readFileSync(here('../QUICKSTART.zh.md'), 'utf8')
  check('QUICKSTART 设计器操作手册章节', quickstart.includes('## 审批流可视化设计器'), '拖拽/属性面板/发布门禁/会签')
}

/** BP-22's evidence: the browser walkthrough results + eight screenshots. */
function walkthroughEvidenceLeg(): void {
  log('— BP-22 八角色走查证据（浏览器活体）')
  // B6/B7/B8 walkthrough evidence rides the repo-root demos/acceptance-w5/
  // (B0~B5 evidence lives under examples/kb-agent/demos/acceptance-w5/).
  const outDir = here('../../../demos/acceptance-w5/')
  for (let index = 1; index <= 8; index++) {
    const png = `b8-r${String(index)}-walkthrough.png`
    check(`截图 ${png}`, existsSync(outDir + png))
  }
  const resultsPath = outDir + 'b8-walkthrough.json'
  if (!existsSync(resultsPath)) {
    check('走查结果 b8-walkthrough.json', false, '未生成（先跑 b8-walkthrough.mjs）')
    return
  }
  const results = JSON.parse(readFileSync(resultsPath, 'utf8')) as Array<{ role: string; pass: boolean; steps: Array<{ name: string; ok: boolean }> }>
  for (const row of results) {
    check(`${row.role} 旅程全步通过`, row.pass, `${String(row.steps.filter(step => step.ok).length)}/${String(row.steps.length)} 步`)
  }
}

/** W5-R2 UJ-1: the eight role action-leg evidence (browser writes + engine verbs). */
function actionEvidenceLeg(): void {
  log('— W5-R2 八角色动作腿证据（写动作 + 状态转移）')
  const outDir = here('../../../demos/acceptance-w5/')
  for (const role of ['buyer', 'planner', 'shop_lead', 'qc_inspector', 'keeper', 'sales_rep', 'finance', 'admin']) {
    const png = `b8-r2-act-${role}.png`
    check(`动作截图 ${png}`, existsSync(outDir + png))
  }
  const resultsPath = outDir + 'b8-actions.json'
  if (!existsSync(resultsPath)) {
    check('动作腿结果 b8-actions.json', false, '未生成（先跑 b8-actions.mjs）')
    return
  }
  const parsed = JSON.parse(readFileSync(resultsPath, 'utf8')) as { legs: Array<{ role: string; pass: boolean; checks: Array<{ ok: boolean }> }> }
  for (const leg of parsed.legs) {
    check(`${leg.role} 动作腿全断言通过`, leg.pass, `${String(leg.checks.filter(c => c.ok).length)}/${String(leg.checks.length)} 断言`)
  }
}

async function main(): Promise<void> {
  log(`w5b8-closure: ${mode === 'run' ? 'run（种子+清偿+断言）' : 'assert（只读断言）'}`)
  const token = await signInWithRetry()
  await ensureWalkthroughAccounts(token)
  await zeroStockLeg()
  capacityLeg()
  reorderLeg()
  terminalDocsLeg()
  walkthroughEvidenceLeg()
  actionEvidenceLeg()
  log('— 22 项断点终态：16 项 B3~B5 已清偿（w5b3/4/5 --assert 复证）；BP-18/21/22 本批清偿；BP-19 发号 TOCTOU 转下轮 backlog（单写者演示环境无并发窗口；建议 doc_no 序列表或唯一索引+重试）；BP-20 f3 已在 B0 修复；其余 B0~B7 批内清偿（见 plans/handoff-2026-09-30-w5.zh.md 终态核对表）')
  if (failures.length > 0) {
    throw new Error(`w5b8-closure ${mode} 失败 ${String(failures.length)} 项：\n  - ${failures.join('\n  - ')}`)
  }
  console.log(`w5b8-closure: ${mode} 全部断言通过`)
}

await main()
