/**
 * W1 acceptance driver: drives the full state-machine sequence against the
 * live NocoBase (read assertions only via psql-like REST reads) and archives
 * the transcript for research/2026-09-25-w-round/b1-psql.txt.
 *
 * Sequences:
 *   A (≤ threshold): submit → approve (one round, effective)
 *   B (> threshold): submit → approve → pending_level2 → approve (two rounds)
 *   C (reject/resubmit): submit → reject → submit (attempt+1) → approve
 *   D (gate negative/positive): draft PO cannot drive a receipt; approved passes
 *   E/F (dual entry): E via the engine CLI path, F via a page intent row the
 *     workflow forwards to http://127.0.0.1:13110/act (engine serve running)
 */
import { spawn, spawnSync } from 'node:child_process'
import { setTimeout as sleep } from 'node:timers/promises'

const baseUrl = process.env.NOCOBASE_BASE_URL ?? 'http://127.0.0.1:13000'
const rootEmail = 'admin@nocobase.com'
const rootPassword = 'admin123'

const log = (line: string): void => { console.log(line) }

async function call(token: string, method: 'GET' | 'POST', path: string, body?: unknown): Promise<any> {
  // One transport retry: NocoBase briefly resets connections after heavy
  // schema writes (the flow-page lib's signInWithRetry note).
  for (let attempt = 0; ; attempt++) {
    try {
      const response = await fetch(`${baseUrl}${path}`, {
        method,
        headers: { authorization: `Bearer ${token}`, ...(body === undefined ? {} : { 'content-type': 'application/json' }) },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      })
      const payload = await response.json().catch(() => null)
      if (!response.ok) throw new Error(`${method} ${path} -> HTTP ${response.status}: ${JSON.stringify(payload).slice(0, 200)}`)
      return payload
    } catch (error) {
      if (attempt >= 2 || !(error instanceof TypeError)) throw error
      await sleep(500)
    }
  }
}

const dataOf = async (token: string, method: 'GET' | 'POST', path: string, body?: unknown): Promise<any> =>
  (await call(token, method, path, body))?.data ?? null

async function signIn(): Promise<string> {
  const token = await dataOf('', 'POST', '/api/auth:signIn', { account: rootEmail, password: rootPassword })
  if (typeof token?.token !== 'string') throw new Error('sign-in returned no token')
  return token.token
}

async function engine(args: string[]): Promise<boolean> {
  const result = spawnSync('node', ['--import', 'tsx/esm', 'examples/kb-agent/scripts/approval-engine.mts', ...args], { encoding: 'utf8' })
  log(result.stdout.trim())
  if (result.status !== 0) {
    // The refusal message line (the fail-loud evidence) plus the tail for context.
    const lines = result.stderr.trim().split('\n')
    log(lines.find(line => line.startsWith('Error:')) ?? lines.slice(-3).join('\n'))
    return false
  }
  return true
}

const psql = (sql: string): void => {
  const result = spawnSync('psql', ['-U', process.env.USER ?? 'mac', '-d', 'nocobase', '-c', sql], { encoding: 'utf8' })
  log(result.stdout.trim())
}

async function poIdBy(token: string, poNumber: string): Promise<number> {
  const rows = await dataOf(token, 'GET', `/api/hub_po_purchase_orders:list?filter=${encodeURIComponent(JSON.stringify({ po_number: { $eq: poNumber } }))}&pageSize=5`)
  if (!Array.isArray(rows) || rows.length === 0) throw new Error(`PO ${poNumber} not found`)
  return Number(rows[0].id)
}

async function docStatusOf(token: string, id: number): Promise<string> {
  const row = await dataOf(token, 'GET', `/api/hub_po_purchase_orders/${id}`)
  return String(row?.doc_status)
}

async function main(): Promise<void> {
  const token = await signIn()

  log('=== B1 · 建测试单（六笔，PO-B1-* 前缀） ===')
  const created: Array<[string, number]> = []
  for (const [po, total] of [['PO-B1-A', 16_000], ['PO-B1-B', 250_000], ['PO-B1-C', 88_000], ['PO-B1-D', 9_000], ['PO-B1-E', 120_000], ['PO-B1-F', 60_000]] as const) {
    const existing = await dataOf(token, 'GET', `/api/hub_po_purchase_orders:list?filter=${encodeURIComponent(JSON.stringify({ po_number: { $eq: po } }))}&pageSize=1`)
    const id = Array.isArray(existing) && existing.length > 0
      ? Number(existing[0].id)
      : Number((await dataOf(token, 'POST', '/api/hub_po_purchase_orders:create', { po_number: po, status: 'draft', total, order_date: new Date().toISOString().slice(0, 10), doc_status: 'draft' })).id)
    created.push([po, id])
    log(`- ${po} → id=${id}`)
  }
  const idOf = (po: string): number => created.find(([name]) => name === po)?.[1] as number

  log('\n=== 序列A · 阈值内一审生效（PO-B1-A ≤ 10万） ===')
  await engine(['--submit', 'hub_po_purchase_orders', String(idOf('PO-B1-A')), 'chenliqun'])
  psql(`SELECT po_number, doc_status FROM hub_po_purchase_orders WHERE po_number='PO-B1-A';`)
  await engine(['--act', 'hub_po_purchase_orders', String(idOf('PO-B1-A')), 'approve', 'admin', '同意，按合同执行'])
  psql(`SELECT po_number, doc_status, approved_by, approved_at FROM hub_po_purchase_orders WHERE po_number='PO-B1-A';`)

  log('\n=== 序列B · 金额阈值加签（PO-B1-B = 25万 > 10万） ===')
  await engine(['--submit', 'hub_po_purchase_orders', String(idOf('PO-B1-B')), 'chenliqun'])
  await engine(['--act', 'hub_po_purchase_orders', String(idOf('PO-B1-B')), 'approve', 'admin', '金额超限，报总经理加签'])
  psql(`SELECT po_number, doc_status FROM hub_po_purchase_orders WHERE po_number='PO-B1-B';`)
  psql(`SELECT state, status, user FROM wfl_approval_todos WHERE doc_id=${idOf('PO-B1-B')} ORDER BY id;`)
  await engine(['--act', 'hub_po_purchase_orders', String(idOf('PO-B1-B')), 'approve', 'admin', '二级通过'])
  psql(`SELECT po_number, doc_status, approved_by FROM hub_po_purchase_orders WHERE po_number='PO-B1-B';`)
  psql(`SELECT state, status FROM wfl_approval_todos WHERE doc_id=${idOf('PO-B1-B')} ORDER BY id;`)

  log('\n=== 序列C · 驳回重提（PO-B1-C，attempt_no+1 整链重走） ===')
  await engine(['--submit', 'hub_po_purchase_orders', String(idOf('PO-B1-C')), 'chenliqun'])
  await engine(['--act', 'hub_po_purchase_orders', String(idOf('PO-B1-C')), 'reject', 'admin', '供应商资质不全，补件后重报'])
  psql(`SELECT po_number, doc_status FROM hub_po_purchase_orders WHERE po_number='PO-B1-C';`)
  await engine(['--submit', 'hub_po_purchase_orders', String(idOf('PO-B1-C')), 'chenliqun'])
  await engine(['--act', 'hub_po_purchase_orders', String(idOf('PO-B1-C')), 'approve', 'admin', '补件齐全，同意'])
  psql(`SELECT po_number, doc_status FROM hub_po_purchase_orders WHERE po_number='PO-B1-C';`)
  psql(`SELECT node_seq, approver, action, comment, attempt_no, from_state, to_state, from_anchor, to_anchor, source FROM wfl_approval_records WHERE doc_id=${idOf('PO-B1-C')} ORDER BY node_seq;`)

  log('\n=== 序列D · 卡口四件套（PO-B1-D：draft 驱动收货被拒，approved 后放行） ===')
  log('— 负例：doc_status=draft 时对 wms_receipts 执行 nb_create（来源单号=PO-B1-D）')
  await engine(['--gate', 'wms_receipts', JSON.stringify({ source_no: 'PO-B1-D' })])
  await engine(['--submit', 'hub_po_purchase_orders', String(idOf('PO-B1-D')), 'chenliqun'])
  await engine(['--act', 'hub_po_purchase_orders', String(idOf('PO-B1-D')), 'approve', 'admin', '同意'])
  log('— 正例：approved 后同卡口通过，并真实登记一笔收货')
  await engine(['--gate', 'wms_receipts', JSON.stringify({ source_no: 'PO-B1-D' })])
  const receipt = await dataOf(token, 'POST', '/api/wms_receipts:create', { receipt_no: 'RCV-B1-D-1', receipt_type: 'purchase', source_no: 'PO-B1-D', status: 'pending', lot_no: 'B1-LOT-1', qty: 30, note: 'B1 卡口正例收货' })
  log(`- 收货行已落库 id=${receipt.id} (source_no=PO-B1-D)`)
  psql(`SELECT receipt_no, source_no, status FROM wms_receipts WHERE receipt_no='RCV-B1-D-1';`)

  log('\n=== 序列E · 引擎入口（PO-B1-E，CLI = mobile nb_approve 的同一编排与规则） ===')
  await engine(['--submit', 'hub_po_purchase_orders', String(idOf('PO-B1-E')), 'chenliqun'])
  await engine(['--act', 'hub_po_purchase_orders', String(idOf('PO-B1-E')), 'approve', 'admin', '引擎入口同意'])
  psql(`SELECT node_seq, approver, action, comment, attempt_no, source FROM wfl_approval_records WHERE doc_id=${idOf('PO-B1-E')} ORDER BY node_seq;`)

  log('\n=== 序列F · 页面入口（PO-B1-F，intent 行 → workflow → 127.0.0.1:13110/act → 引擎） ===')
  log('— 后台启动引擎 serve (:13110)')
  const serve = spawn('node', ['--import', 'tsx/esm', 'examples/kb-agent/scripts/approval-engine.mts', '--serve', '13110'], { stdio: ['ignore', 'ignore', 'inherit'], detached: false })
  try {
    for (let attempt = 0; attempt < 20; attempt++) {
      const probe = await fetch('http://127.0.0.1:13110/healthz', { signal: AbortSignal.timeout(1000) }).catch(() => null)
      if (probe !== null && probe.ok) break
      await sleep(300)
    }
    await engine(['--submit', 'hub_po_purchase_orders', String(idOf('PO-B1-F')), 'chenliqun'])
    log('— 在审批中心建 intent 行（source=page，等价页面 Add-new 表单提交）')
    const intent = await dataOf(token, 'POST', '/api/wfl_approval_records:create', {
      doc_type: 'hub_po_purchase_orders', doc_id: idOf('PO-B1-F'), action: 'approve', approver: 'admin', comment: '页面入口同意', source: 'page',
    })
    log(`- intent 行 id=${intent.id}，等待 workflow 回调引擎…`)
    let state = ''
    for (let attempt = 0; attempt < 30; attempt++) {
      await sleep(500)
      state = await docStatusOf(token, idOf('PO-B1-F'))
      if (state === 'approved') break
    }
    psql(`SELECT po_number, doc_status, approved_by FROM hub_po_purchase_orders WHERE po_number='PO-B1-F';`)
    const intents = await dataOf(token, 'GET', `/api/wfl_approval_records:list?filter=${encodeURIComponent(JSON.stringify({ doc_id: idOf('PO-B1-F'), source: 'page' }))}&pageSize=5`)
    log(`- intent 行消费情况：剩余 page 行 ${Array.isArray(intents) ? intents.length : 0}（引擎成功后已删除）`)
    psql(`SELECT node_seq, approver, action, comment, attempt_no, source FROM wfl_approval_records WHERE doc_id=${idOf('PO-B1-F')} ORDER BY node_seq;`)
    if (state !== 'approved') throw new Error(`PO-B1-F 未通过页面入口生效（doc_status=${state}）`)
  } finally {
    serve.kill('SIGTERM')
  }

  log('\n=== 双入口留痕格式对比（E 引擎行 vs F 引擎行，五要素同列同型） ===')
  psql(`SELECT approver, action, comment, attempt_no, from_state, to_state, from_anchor, to_anchor, source, acted_at FROM wfl_approval_records WHERE doc_id=${idOf('PO-B1-E')} ORDER BY node_seq DESC LIMIT 1;`)
  psql(`SELECT approver, action, comment, attempt_no, from_state, to_state, from_anchor, to_anchor, source, acted_at FROM wfl_approval_records WHERE doc_id=${idOf('PO-B1-F')} ORDER BY node_seq DESC LIMIT 1;`)

  log('\n=== 全序列状态总览 ===')
  psql(`SELECT po_number, doc_status, approved_by, total FROM hub_po_purchase_orders WHERE po_number LIKE 'PO-B1-%' ORDER BY po_number;`)
  psql(`SELECT count(*) AS records_total, count(DISTINCT doc_id) AS docs FROM wfl_approval_records WHERE doc_type='hub_po_purchase_orders';`)

  log('\nB1 sequence: DONE')
}

await main()
