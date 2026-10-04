/**
 * W6-B7 verify companion: the --demo action leg (live over the engine HTTP
 * surface with real role accounts) and the --assert leg (structure, terminal
 * state, shape audit). Kept apart from w6b7-sourcing.mts so the module the
 * engine imports carries no test state at import time.
 *
 * Usage (repo root, tsx loader; run after w6b7-sourcing.mts --seed):
 *   node --import tsx/esm examples/kb-agent/scripts/w6b7-sourcing.mts --demo
 *   node --import tsx/esm examples/kb-agent/scripts/w6b7-sourcing.mts --assert
 */
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { listFlowModels, listRoutes, signInWithRetry } from './nocobase-flow-page-lib.mts'

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
  ], { encoding: 'utf8', env: { ...process.env, PGPASSWORD: envOf('DB_PASSWORD') ?? 'nocobase' }, timeout: 20_000, maxBuffer: 16 * 1024 * 1024 })
  if (run.status !== 0) throw new Error(`psql failed: ${sql.slice(0, 120)}…\n${(run.stderr ?? '').slice(0, 300)}`)
  return run.stdout ?? ''
}

const sqlLit = (value: string): string => `'${value.replaceAll("'", "''")}'`
const round1 = (value: number): number => Math.round(value * 10) / 10
const ENGINE_BASE = process.env.W6B7_ENGINE_BASE ?? 'http://127.0.0.1:13110'
const NOCOBASE_BASE = process.env.W6B7_NOCOBASE_BASE ?? 'http://127.0.0.1:13000'

/** Sign in one rehearsal account (the W5-B8 password convention). */
async function signInAs(account: string, password: string): Promise<string> {
  const resp = await fetch(`${NOCOBASE_BASE}/api/auth:signIn`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ account, password }),
  })
  const json = await resp.json().catch(() => ({}) as Record<string, unknown>) as { data?: { token?: string } }
  if (typeof json.data?.token !== 'string') throw new Error(`sign-in failed for ${account}: HTTP ${String(resp.status)}`)
  return json.data.token
}

/** One engine call (GET or POST) with a NocoBase bearer. */
async function engineFetch(token: string, path: string, post?: Record<string, unknown>): Promise<{ status: number, ok: boolean, json: Record<string, unknown> }> {
  const resp = await fetch(ENGINE_BASE + path, post === undefined
    ? { headers: { authorization: `Bearer ${token}` } }
    : { method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify(post) })
  return { status: resp.status, ok: resp.ok, json: await resp.json().catch(() => ({}) as Record<string, unknown>) }
}

type Row = Record<string, unknown>
const rowsOf = (json: Record<string, unknown>): Row[] => (((json.groups as Array<{ rows: Row[] }> | undefined) ?? []).flatMap(group => group.rows))
const DEMO_RFQ = 'RFQ-W6B7-0002'

/** The demo action leg: live surface, reconciliation, flip, negatives, award, idempotency, XSS. */
async function demoLeg(): Promise<void> {
  const admin = await signInWithRetry()
  const buyer = await signInAs('buyer', 'Buyer#2026')
  const finance = await signInAs('finance', 'Finance#2026')

  log('— leg 0: reset RFQ-B7J1 to the awardable state（演练可重跑）')
  psql(`DELETE FROM wfl_approval_todos WHERE doc_type = 'pur_orders' AND doc_id IN (SELECT id FROM pur_orders WHERE rfq_id = (SELECT id FROM pur_rfqs WHERE code = 'RFQ-B7J1'));`)
  psql(`DELETE FROM pur_award_audit WHERE award_id = (SELECT id FROM pur_rfqs WHERE code = 'RFQ-B7J1');`)
  psql(`DELETE FROM wfl_approval_records WHERE doc_type = 'pur_orders' AND doc_id IN (SELECT id FROM pur_orders WHERE rfq_id = (SELECT id FROM pur_rfqs WHERE code = 'RFQ-B7J1'));`)
  psql(`DELETE FROM pur_order_lines WHERE order_id IN (SELECT id FROM pur_orders WHERE rfq_id = (SELECT id FROM pur_rfqs WHERE code = 'RFQ-B7J1'));`)
  psql(`DELETE FROM pur_orders WHERE rfq_id = (SELECT id FROM pur_rfqs WHERE code = 'RFQ-B7J1');`)
  psql(`UPDATE pur_quotes SET status = 'submitted', is_won = FALSE WHERE rfq_id = (SELECT id FROM pur_rfqs WHERE code = 'RFQ-B7J1');`)
  psql(`UPDATE pur_rfqs SET doc_status = 'approved' WHERE code = 'RFQ-B7J1';`)
  check('RFQ-B7J1 重置为 approved+三家 submitted', psql(`SELECT count(*) FROM pur_quotes q JOIN pur_rfqs r ON r.id = q.rfq_id WHERE r.code = 'RFQ-B7J1' AND q.status = 'submitted';`).trim() === '3')

  log('— leg 1: live surface + matrix on RFQ-B7J1')
  const rfqs = await engineFetch(admin, '/sourcing/rfqs')
  check('GET /sourcing/rfqs 200', rfqs.status === 200, `status=${String(rfqs.status)}`)
  const matrix0 = await engineFetch(admin, '/sourcing/matrix?rfq=RFQ-B7J1')
  check('GET /sourcing/matrix 200', matrix0.status === 200, `status=${String(matrix0.status)}`)
  const rows = rowsOf(matrix0.json)
  check('矩阵返回三家报价行', rows.length === 3, `rows=${String(rows.length)}`)
  const byName = (needle: string): Row | undefined => rows.find(row => String(row.supplier_name).includes(needle))
  const lufeng = byName('鲁丰')
  const xianfeng = byName('鲜丰')
  const weizhi = byName('味之源')
  check('山东鲁丰 prevent（最新期评级 D）', lufeng?.admission === 'prevent', String(lufeng?.admission_note ?? ''))
  check('味之源 warn（评级 C）', weizhi?.admission === 'warn', String(weizhi?.admission_note ?? ''))
  check('珠海鲜丰准入 ok', xianfeng?.admission === 'ok', String(xianfeng?.admission ?? ''))

  log('— leg 2: scorecard + pass-rate + total-score reconciliation (psql hand calc)')
  const latestQ = (supplier: string): { quality: string, rating: string, period: string } => {
    const row = psql(`SELECT c.score_quality, c.rating, c.period FROM srm_score_cards c JOIN srm_suppliers s ON s.id = c.supplier_id WHERE s.name LIKE ${sqlLit(`%${supplier}%`)} ORDER BY c.period DESC, c.id DESC LIMIT 1;`).trim()
    const [quality, rating, period] = row.split('|')
    return { quality, rating, period }
  }
  const xfCard = latestQ('鲜丰')
  check('矩阵质量分=psql 最新期 score_quality（鲜丰）', String(xianfeng?.quality_score ?? '') === xfCard.quality, `matrix=${String(xianfeng?.quality_score)} psql=${xfCard.quality}(${xfCard.rating}@${xfCard.period})`)
  const wzCard = latestQ('味之源')
  check('矩阵质量分=psql 最新期 score_quality（味之源）', String(weizhi?.quality_score ?? '') === wzCard.quality, `matrix=${String(weizhi?.quality_score)} psql=${wzCard.quality}(${wzCard.rating}@${wzCard.period})`)
  const xfPass = psql(`SELECT round(100.0 * sum(CASE WHEN result = 'passed' THEN 1 ELSE 0 END) / count(*), 1) FROM qm_inspections WHERE supplier_id = ${String(Number(xianfeng?.supplier_id ?? 0))} AND result IN ('passed','failed','concession');`).trim()
  check('矩阵批次合格率=psql 聚合（鲜丰）', Number(xianfeng?.pass_rate ?? -1) === Number(xfPass), `matrix=${String(xianfeng?.pass_rate)}% psql=${xfPass}%`)
  const w = matrix0.json.weights as { price: number, lead: number, quality: number }
  const handXf = round1((w.price * Number(xianfeng?.price_score) + w.lead * Number(xianfeng?.lead_score) + w.quality * Number(xianfeng?.quality_score)) / 100)
  check('三维总分手算对拍（鲜丰）', handXf === Number(xianfeng?.total_score), `hand=${String(handXf)} engine=${String(xianfeng?.total_score)}（权重 ${String(w.price)}/${String(w.lead)}/${String(w.quality)}）`)
  log(`  算式（鲜丰）：${String(xianfeng?.formula ?? '')}`)
  log(`  算式（鲁丰）：${String(lufeng?.formula ?? '')}`)

  log('— leg 3: weight flip scenario（RFQ-W6B7-0002，味之源低价 vs 鲜丰优质）')
  const productId = psql(`SELECT product_id FROM pur_quotes WHERE rfq_id = (SELECT id FROM pur_rfqs WHERE code = 'RFQ-B7J1') LIMIT 1;`).trim()
  const wzId = psql(`SELECT id FROM srm_suppliers WHERE name LIKE '%味之源%' LIMIT 1;`).trim()
  const xfId = psql(`SELECT id FROM srm_suppliers WHERE name LIKE '%鲜丰%' LIMIT 1;`).trim()
  psql(`INSERT INTO pur_rfqs (code, deadline, doc_status, pr_id) SELECT ${sqlLit(DEMO_RFQ)}, CURRENT_DATE + 7, 'approved', NULL WHERE NOT EXISTS (SELECT 1 FROM pur_rfqs WHERE code = ${sqlLit(DEMO_RFQ)});`)
  psql(`DELETE FROM pur_quotes WHERE rfq_id = (SELECT id FROM pur_rfqs WHERE code = ${sqlLit(DEMO_RFQ)});`)
  const demoRfqId = psql(`SELECT id FROM pur_rfqs WHERE code = ${sqlLit(DEMO_RFQ)};`).trim()
  psql(`INSERT INTO pur_quotes (qty, unit_price, lead_time_days, valid_until, is_won, status, rfq_id, supplier_id, product_id) VALUES (1000, 0.70, 3, CURRENT_DATE + 30, FALSE, 'submitted', ${demoRfqId}, ${wzId}, ${productId}), (1000, 1.00, 3, CURRENT_DATE + 30, FALSE, 'submitted', ${demoRfqId}, ${xfId}, ${productId});`)
  const waBefore = Number(psql('SELECT count(*) FROM pur_sourcing_weight_audit;').trim())
  const flipA = await engineFetch(admin, `/sourcing/matrix?rfq=${DEMO_RFQ}`)
  const flipARows = rowsOf(flipA.json)
  const rankStr = (list: Row[]): string => list.slice().sort((a, b) => Number(a.rank) - Number(b.rank)).map(row => `${String(row.supplier_name)}#${String(row.rank)}(${String(row.total_score)})`).join('、')
  await engineFetch(buyer, '/sourcing/config', { weight_price: 10, weight_lead: 2, weight_quality: 88 })
  const flipB = await engineFetch(admin, `/sourcing/matrix?rfq=${DEMO_RFQ}`)
  const flipBRows = rowsOf(flipB.json)
  check('权重 50/30/20 → 味之源（低价）#1', String(flipARows.find(row => Number(row.rank) === 1)?.supplier_name).includes('味之源'), rankStr(flipARows))
  check('权重 10/2/88 → 鲜丰（优质）#1，排名翻转', String(flipBRows.find(row => Number(row.rank) === 1)?.supplier_name).includes('鲜丰'), rankStr(flipBRows))
  log(`  权重50/30/20排名：${rankStr(flipARows)}`)
  log(`  权重10/2/88排名：${rankStr(flipBRows)}`)
  check('权重变更落 append-only 审计行（pur_sourcing_weight_audit）', Number(psql('SELECT count(*) FROM pur_sourcing_weight_audit;').trim()) - waBefore === 1, `rows ${String(waBefore)}→${psql('SELECT count(*) FROM pur_sourcing_weight_audit;').trim()}（actor=buyer, old→new 全记录）`)
  await engineFetch(buyer, '/sourcing/config', { weight_price: 50, weight_lead: 30, weight_quality: 20 })
  psql(`DELETE FROM pur_quotes WHERE rfq_id = ${demoRfqId}; DELETE FROM pur_rfqs WHERE id = ${demoRfqId};`)
  log('  demo RFQ+quotes 已清理，权重已恢复 50/30/20')

  log('— leg 4: prevent refusal（山东鲁丰 → 403 评分卡联动）')
  const preventQuoteId = psql(`SELECT q.id FROM pur_quotes q JOIN srm_suppliers s ON s.id = q.supplier_id WHERE q.rfq_id = (SELECT id FROM pur_rfqs WHERE code = 'RFQ-B7J1') AND q.status = 'submitted' AND s.name LIKE '%鲁丰%' LIMIT 1;`).trim()
  const preventOut = await engineFetch(buyer, '/sourcing/award', { rfq_code: 'RFQ-B7J1', winner_quote_id: Number(preventQuoteId), loser_disposition: 'cancel' })
  check('prevent 供应商定标被拒 403', preventOut.status === 403, `status=${String(preventOut.status)} error=${String(preventOut.json.error ?? '').slice(0, 90)}`)
  check('拒绝理由含 prevent/评分卡联动', String(preventOut.json.error ?? '').includes('prevent'), String(preventOut.json.error ?? '').slice(0, 110))

  log('— leg 5: fence refusal（finance → 403 围栏）')
  const xianfengQuoteId = psql(`SELECT q.id FROM pur_quotes q JOIN srm_suppliers s ON s.id = q.supplier_id WHERE q.rfq_id = (SELECT id FROM pur_rfqs WHERE code = 'RFQ-B7J1') AND q.status = 'submitted' AND s.name LIKE '%鲜丰%' LIMIT 1;`).trim()
  const fenceOut = await engineFetch(finance, '/sourcing/award', { rfq_code: 'RFQ-B7J1', winner_quote_id: Number(xianfengQuoteId), loser_disposition: 'cancel' })
  check('非采购角色定标 403', fenceOut.status === 403, `status=${String(fenceOut.status)} error=${String(fenceOut.json.error ?? '').slice(0, 90)}`)

  log('— leg 5b: 读围栏（sales_rep → matrix 403；buyer → 200）')
  const salesrep = await signInAs('sales_rep', 'Sales#2026')
  const srOut = await engineFetch(salesrep, '/sourcing/matrix?rfq=RFQ-B7J1')
  check('sales_rep 读矩阵 403（读围栏）', srOut.status === 403, `status=${String(srOut.status)} code=${String(srOut.json.code ?? '')} error=${String(srOut.json.error ?? '').slice(0, 70)}`)
  const buyerMatrix = await engineFetch(buyer, '/sourcing/matrix?rfq=RFQ-B7J1')
  check('buyer（采购部）读矩阵 200', buyerMatrix.status === 200, `status=${String(buyerMatrix.status)}`)

  log('— leg 6: award（buyer 定标珠海鲜丰，落选取消）→ 全链落库')
  const poCount0 = psql(`SELECT count(*) FROM pur_orders;`).trim()
  const awardOut = await engineFetch(buyer, '/sourcing/award', { rfq_code: 'RFQ-B7J1', winner_quote_id: Number(xianfengQuoteId), loser_disposition: 'cancel' })
  check('定标 200', awardOut.status === 200, `status=${String(awardOut.status)} po=${String(awardOut.json.po_code ?? '')} error=${String(awardOut.json.error ?? '').slice(0, 90)}`)
  const poCode = String(awardOut.json.po_code ?? '')
  const poCount6 = psql(`SELECT count(*) FROM pur_orders;`).trim()
  check('RFQ 状态流转 approved→awarded', psql(`SELECT doc_status FROM pur_rfqs WHERE code = 'RFQ-B7J1';`).trim() === 'awarded')
  check('中标行 is_won（鲜丰）', psql(`SELECT is_won FROM pur_quotes WHERE id = ${xianfengQuoteId};`).trim() === 't')
  check('落选行 lost（鲁丰/味之源）', psql(`SELECT count(*) FROM pur_quotes WHERE rfq_id = (SELECT id FROM pur_rfqs WHERE code='RFQ-B7J1') AND status = 'lost';`).trim() === '2')
  const note = psql(`SELECT compare_note FROM pur_orders WHERE code = ${sqlLit(poCode)};`).trim()
  check('PO compare_note 含三维定标算式', note.startsWith('三维定标') && note.includes('价格分=') && note.includes('授标'), note.slice(0, 110))
  check('PO rfq_id 回链', psql(`SELECT rfq_id IS NOT NULL FROM pur_orders WHERE code = ${sqlLit(poCode)};`).trim() === 't')
  check('pur_award_audit 定标审计行（与状态迁移同事务）', psql(`SELECT count(*) FROM pur_award_audit WHERE award_id = (SELECT id FROM pur_rfqs WHERE code = 'RFQ-B7J1') AND action = 'award';`).trim() !== '0')
  check('RFQ awarded_at 非空', psql(`SELECT awarded_at IS NOT NULL FROM pur_rfqs WHERE code = 'RFQ-B7J1';`).trim() === 't')
  check('compare_note 含定标时间快照', note.includes('定标时间'), note.slice(0, 160))
  const poRest = await fetch(`${NOCOBASE_BASE}/api/pur_orders:list?filter=${encodeURIComponent(JSON.stringify({ code: poCode }))}&pageSize=1`, { headers: { authorization: `Bearer ${admin}` } })
  const poRestRow = ((await poRest.json().catch(() => ({}) as Record<string, unknown>) as { data?: Array<Record<string, unknown>> }).data ?? [])[0]
  check('REST fetch PO 详情携带 compare_note 全文（UI 快照区块数据源）', String(poRestRow?.compare_note ?? '').startsWith('三维定标'), String(poRestRow?.compare_note ?? '').slice(0, 60))
  log(`  compare_note：${note.slice(0, 200)}…`)

  log('— leg 7: idempotency（双击重放 + 换 winner 409）')
  const again = await engineFetch(buyer, '/sourcing/award', { rfq_code: 'RFQ-B7J1', winner_quote_id: Number(xianfengQuoteId), loser_disposition: 'cancel' })
  check('同 winner 重放 200 幂等', again.status === 200 && again.json.idempotent === true, `status=${String(again.status)} idempotent=${String(again.json.idempotent)}`)
  check('幂等重放未新增 PO', psql(`SELECT count(*) FROM pur_orders;`).trim() === poCount6, `first-award-added=${String(Number(poCount6) - Number(poCount0))}（恰一张）`)
  check('幂等重放落 replay 审计行', psql(`SELECT count(*) FROM pur_award_audit WHERE award_id = (SELECT id FROM pur_rfqs WHERE code = 'RFQ-B7J1') AND action = 'replay';`).trim() !== '0')
  const reaward = await engineFetch(buyer, '/sourcing/award', { rfq_code: 'RFQ-B7J1', winner_quote_id: Number(preventQuoteId), loser_disposition: 'cancel' })
  check('换 winner 重定标 409', reaward.status === 409, `status=${String(reaward.status)} error=${String(reaward.json.error ?? '').slice(0, 80)}`)

  log('— leg 7b: 送审失败去静默（留痕可查）+ 幂等分支重送审')
  try {
    psql(`DELETE FROM wfl_approval_todos WHERE doc_type = 'pur_orders' AND doc_id IN (SELECT id FROM pur_orders WHERE rfq_id = (SELECT id FROM pur_rfqs WHERE code = 'RFQ-B7J1'));`)
    psql(`DELETE FROM wfl_approval_records WHERE doc_type = 'pur_orders' AND doc_id IN (SELECT id FROM pur_orders WHERE rfq_id = (SELECT id FROM pur_rfqs WHERE code = 'RFQ-B7J1'));`)
    psql(`DELETE FROM pur_order_lines WHERE order_id IN (SELECT id FROM pur_orders WHERE rfq_id = (SELECT id FROM pur_rfqs WHERE code = 'RFQ-B7J1'));`)
    psql(`DELETE FROM pur_orders WHERE rfq_id = (SELECT id FROM pur_rfqs WHERE code = 'RFQ-B7J1');`)
    psql(`UPDATE pur_quotes SET status = 'submitted', is_won = FALSE WHERE rfq_id = (SELECT id FROM pur_rfqs WHERE code = 'RFQ-B7J1');`)
    psql(`UPDATE pur_rfqs SET doc_status = 'approved', awarded_at = NULL WHERE code = 'RFQ-B7J1';`)
    psql(`DELETE FROM pur_award_audit WHERE award_id = (SELECT id FROM pur_rfqs WHERE code = 'RFQ-B7J1');`)
    // 藏起 pur_orders 流程配置：定标后的送审必然失败（旧实现静默吞掉）
    psql(`UPDATE wfl_flow_configs SET doc_type = 'pur_orders-w6r4hide' WHERE doc_type = 'pur_orders';`)
    const failOut = await engineFetch(buyer, '/sourcing/award', { rfq_code: 'RFQ-B7J1', winner_quote_id: Number(xianfengQuoteId), loser_disposition: 'cancel' })
    check('流程缺席时定标仍 200（PO 停 draft，失败已留痕）', failOut.status === 200 && String(failOut.json.submitted_to ?? '').includes('已留痕'), `status=${String(failOut.status)} submitted_to=${String(failOut.json.submitted_to ?? '').slice(0, 70)}`)
    check('PO 停 draft（送审失败未推进）', psql(`SELECT doc_status FROM pur_orders WHERE rfq_id = (SELECT id FROM pur_rfqs WHERE code = 'RFQ-B7J1') ORDER BY id DESC LIMIT 1;`).trim() === 'draft')
    check('送审失败留痕 pur_award_audit submit_failed', psql(`SELECT count(*) FROM pur_award_audit WHERE award_id = (SELECT id FROM pur_rfqs WHERE code = 'RFQ-B7J1') AND action = 'submit_failed';`).trim() !== '0')
  } finally {
    psql(`UPDATE wfl_flow_configs SET doc_type = 'pur_orders' WHERE doc_type = 'pur_orders-w6r4hide';`)
  }
  const retryOut = await engineFetch(buyer, '/sourcing/award', { rfq_code: 'RFQ-B7J1', winner_quote_id: Number(xianfengQuoteId), loser_disposition: 'cancel' })
  check('重放幂等 200 且触发重送审（旧实现永远早退）', retryOut.status === 200 && retryOut.json.idempotent === true && String(retryOut.json.submitted_to ?? '') !== '' && !String(retryOut.json.submitted_to ?? '').includes('失败'), `status=${String(retryOut.status)} submitted_to=${String(retryOut.json.submitted_to ?? '')}`)
  const poFinalSt = psql(`SELECT doc_status FROM pur_orders WHERE rfq_id = (SELECT id FROM pur_rfqs WHERE code = 'RFQ-B7J1') ORDER BY id DESC LIMIT 1;`).trim()
  check('重送审后 PO 离开 draft', poFinalSt !== 'draft', poFinalSt)
  check('重送审落 resubmit 审计行', psql(`SELECT count(*) FROM pur_award_audit WHERE award_id = (SELECT id FROM pur_rfqs WHERE code = 'RFQ-B7J1') AND action = 'resubmit';`).trim() !== '0')

  log('— leg 8: XSS 惰性（注入供应商名进 RFQ-B9F-0001 矩阵）')
  psql(`INSERT INTO srm_suppliers (name, code, lifecycle_status) VALUES ('<img src=x onerror=window.__w6b7Xss=1>', 'XSS-W6B7', 'qualified');`)
  const xssSupplierId = psql(`SELECT id FROM srm_suppliers WHERE code = 'XSS-W6B7';`).trim()
  psql(`INSERT INTO pur_quotes (qty, unit_price, lead_time_days, valid_until, is_won, status, rfq_id, supplier_id, product_id) SELECT 100, 0.5, 3, CURRENT_DATE + 30, FALSE, 'submitted', (SELECT id FROM pur_rfqs WHERE code = 'RFQ-B9F-0001'), ${xssSupplierId}, ${productId};`)
  const xssMatrix = await engineFetch(admin, '/sourcing/matrix?rfq=RFQ-B9F-0001')
  const xssRow = rowsOf(xssMatrix.json).find(row => String(row.supplier_name).includes('<img'))
  check('矩阵 JSON 携带原文（无注入面）', xssRow !== undefined, String(xssRow?.supplier_name ?? '').slice(0, 60))
  // W6-R4: the old assertion (status===200) was vacuous — the JSON layer is
  // proven un-evaluated by a byte-identical DB↔matrix round trip.
  const dbRaw = psql(`SELECT name FROM srm_suppliers WHERE id = ${xssSupplierId};`).trim()
  check('JSON 层原文往返（无 HTML 求值/转义，esc 归渲染层）', String(xssRow?.supplier_name) === dbRaw, `db=matrix=${dbRaw === String(xssRow?.supplier_name) ? 'identical' : 'DIFFER'}`)
  psql(`DELETE FROM pur_quotes WHERE supplier_id = ${xssSupplierId}; DELETE FROM srm_suppliers WHERE id = ${xssSupplierId};`)
  const residue = psql(`SELECT count(*) FROM srm_suppliers WHERE code = 'XSS-W6B7';`).trim()
  check('XSS 演练残留清理=0', residue === '0')

  log('— leg 9: TC-08 交期缺失 N/A（lead=null/7/14，有效子集重归一）')
  const leadRfq = 'RFQ-W6R4-LEAD'
  psql(`INSERT INTO pur_rfqs (code, deadline, doc_status, pr_id) SELECT ${sqlLit(leadRfq)}, CURRENT_DATE + 7, 'approved', NULL WHERE NOT EXISTS (SELECT 1 FROM pur_rfqs WHERE code = ${sqlLit(leadRfq)});`)
  psql(`DELETE FROM pur_quotes WHERE rfq_id = (SELECT id FROM pur_rfqs WHERE code = ${sqlLit(leadRfq)});`)
  psql(`DELETE FROM srm_suppliers WHERE code IN ('W6R4-LEAD-A', 'W6R4-LEAD-B');`)
  psql(`INSERT INTO srm_suppliers (name, code, lifecycle_status) VALUES ('W6R4交期演练甲', 'W6R4-LEAD-A', 'qualified'), ('W6R4交期演练乙', 'W6R4-LEAD-B', 'qualified');`)
  const leadA = psql(`SELECT id FROM srm_suppliers WHERE code = 'W6R4-LEAD-A';`).trim()
  const leadB = psql(`SELECT id FROM srm_suppliers WHERE code = 'W6R4-LEAD-B';`).trim()
  const leadRfqId = psql(`SELECT id FROM pur_rfqs WHERE code = ${sqlLit(leadRfq)};`).trim()
  psql(`INSERT INTO pur_quotes (qty, unit_price, lead_time_days, valid_until, is_won, status, rfq_id, supplier_id, product_id) VALUES (100, 1.00, NULL, CURRENT_DATE + 30, FALSE, 'submitted', ${leadRfqId}, ${leadA}, ${productId}), (100, 0.80, 7, CURRENT_DATE + 30, FALSE, 'submitted', ${leadRfqId}, ${leadB}, ${productId}), (100, 0.90, 14, CURRENT_DATE + 30, FALSE, 'submitted', ${leadRfqId}, ${wzId}, ${productId});`)
  const leadMatrix = await engineFetch(admin, `/sourcing/matrix?rfq=${leadRfq}`)
  const leadRows = rowsOf(leadMatrix.json)
  const leadNull = leadRows.find(row => String(row.supplier_name).includes('W6R4交期演练甲'))
  const lead7 = leadRows.find(row => Number(row.lead_time_days) === 7)
  const lead14 = leadRows.find(row => Number(row.lead_time_days) === 14)
  check('TC-08: 有效最短交期 7 天者交期分=满分', lead7?.lead_score === 100, `lead_score=${String(lead7?.lead_score)}`)
  check('TC-08: 14 天者交期分=7/14×100=50', lead14?.lead_score === 50, `lead_score=${String(lead14?.lead_score)}`)
  check('TC-08: null 交期行该轴 N/A（不虚构 0 分）', leadNull !== undefined && leadNull.lead_score === null && leadNull.lead_time_days === null, `lead_score=${String(leadNull?.lead_score)}`)
  check('TC-08: null 行算式文本 N/A 化', String(leadNull?.formula ?? '').includes('交期分=N/A'), String(leadNull?.formula ?? '').slice(0, 90))
  check('TC-08: null 行（无评分卡+无交期）总分=价格单轴', leadNull !== undefined && Number(leadNull.total_score) === Number(leadNull.price_score), `total=${String(leadNull?.total_score)} price=${String(leadNull?.price_score)}`)
  psql(`DELETE FROM pur_quotes WHERE rfq_id = ${leadRfqId}; DELETE FROM pur_rfqs WHERE id = ${leadRfqId}; DELETE FROM srm_suppliers WHERE code IN ('W6R4-LEAD-A', 'W6R4-LEAD-B');`)
  check('TC-08 演练残留清理=0', psql(`SELECT count(*) FROM pur_rfqs WHERE code = ${sqlLit(leadRfq)};`).trim() === '0')

  log('— leg 10: 404 错误反馈双侧可见（状态码+错误体 code/message+CORS 头）')
  const nf = await fetch(`${ENGINE_BASE}/sourcing/matrix?rfq=RFQ-W6R4-NOPE`, { headers: { authorization: `Bearer ${admin}` } })
  const nfJson = await nf.json().catch(() => ({}) as Record<string, unknown>)
  check('不存在的 RFQ → 404（引擎侧）', nf.status === 404, `status=${String(nf.status)}`)
  check('错误体带 code=rfq_not_found + message', nfJson['code'] === 'rfq_not_found' && typeof nfJson['message'] === 'string', String(nfJson['message'] ?? '').slice(0, 90))
  check('错误响应附 CORS 头（ACAO *）', nf.headers.get('access-control-allow-origin') === '*', nf.headers.get('access-control-allow-origin') ?? '(none)')
  const noAuth = await fetch(`${ENGINE_BASE}/sourcing/matrix?rfq=RFQ-B7J1`)
  check('无会话 401 的错误响应同样附 CORS（外层 catch 全路由生效）', noAuth.status === 401 && noAuth.headers.get('access-control-allow-origin') === '*', `status=${String(noAuth.status)} acao=${noAuth.headers.get('access-control-allow-origin') ?? '(none)'}`)
}

/**
 * The procurement-group shape audit: a page is a "table page" when it has no
 * JSBlock, no Kanban block, and no data chart (a ChartBlock whose query
 * carries dimensions — the stat cards' custom-raw single measures are number
 * cards, not analysis charts).
 * @param token - the root API token.
 * @returns every page with its pure-table verdict.
 */
async function auditProcurementShape(token: string): Promise<Array<{ title: string, tablePage: boolean, shapes: string }>> {
  const routes = await listRoutes(token, 'W6B7-audit')
  const group = routes.find(row => row.title === '采购管理' && row.type === 'group')
  if (group === undefined) return []
  const pages = routes.filter(row => row.type === 'flowPage' && row.parentId === group.id)
  const models = await listFlowModels(token, 'W6B7-audit')
  const out: Array<{ title: string, tablePage: boolean, shapes: string }> = []
  for (const page of pages.sort((a, b) => Number(a.sort ?? 0) - Number(b.sort ?? 0))) {
    const tab = routes.find(row => row.parentId === page.id && row.type === 'tabs')
    const grid = tab?.schemaUid == null ? undefined : models.find(row => String(row.parentId) === String(tab.schemaUid) && row.subKey === 'grid')
    const blocks = grid === undefined ? [] : models.filter(row => String(row.parentId ?? '') === String(grid.uid) && row.use !== undefined)
    const shapes = new Set<string>()
    for (const block of blocks) {
      if (block.use === 'JSBlockModel') shapes.add('jsblock')
      else if (block.use === 'KanbanBlockModel') shapes.add('kanban')
      else if (block.use === 'ChartBlockModel') {
        const query = block.stepParams?.chartSettings?.configure?.query as Record<string, unknown> | undefined
        if (query !== undefined && Array.isArray(query.dimensions) && (query.dimensions as unknown[]).length > 0) shapes.add('chart')
      }
    }
    const shapeList = [...shapes].sort().join('+') || 'table-only'
    out.push({ title: String(page.title ?? ''), tablePage: shapes.size === 0, shapes: shapeList })
  }
  return out
}

/** The assert leg: structure, terminal state, page shapes, live probe. */
async function assertLeg(token: string): Promise<void> {
  log('— 结构')
  const configRow = psql(`SELECT weight_price, weight_lead, weight_quality FROM pur_sourcing_config WHERE id = 1;`).trim()
  check('pur_sourcing_config 行 id=1 在位且权重和=100', configRow !== '' && configRow.split('|').map(Number).reduce((a, b) => a + b, 0) === 100, configRow)
  check('pur_rfqs.doc_status 枚举含 awarded', psql(`SELECT (options->'uiSchema'->'enum')::jsonb @> '[{"value":"awarded"}]' FROM fields WHERE "collectionName"='pur_rfqs' AND name='doc_status';`).trim() === 't')
  check('pur_quotes.status 枚举含 lost/backup', psql(`SELECT (options->'uiSchema'->'enum')::jsonb @> '[{"value":"lost"}]' AND (options->'uiSchema'->'enum')::jsonb @> '[{"value":"backup"}]' FROM fields WHERE "collectionName"='pur_quotes' AND name='status';`).trim() === 't')
  check('pur_rfqs.awarded_at 列在位（W6-R4 定标时间）', psql(`SELECT count(*) FROM information_schema.columns WHERE table_schema='public' AND table_name='pur_rfqs' AND column_name='awarded_at';`).trim() !== '0')
  check('pur_award_audit 表在位（award_id/actor/action/payload/ts）', psql(`SELECT count(*) FROM information_schema.tables WHERE table_schema='public' AND table_name='pur_award_audit';`).trim() === '1')
  check('pur_sourcing_weight_audit 表在位（权重 append-only 审计）', psql(`SELECT count(*) FROM information_schema.tables WHERE table_schema='public' AND table_name='pur_sourcing_weight_audit';`).trim() === '1')
  check('pur_quotes 每询价单至多一行 is_won（部分唯一索引）', psql(`SELECT count(*) FROM pg_indexes WHERE indexname = 'ux_pur_quotes_won_per_rfq' AND indexdef LIKE '%WHERE is_won%';`).trim() === '1')

  log('— 铺页形态')
  const models = await listFlowModels(token, 'W6B7-assert')
  const jsBlocks = models.filter(row => row.use === 'JSBlockModel' && String(row.stepParams?.jsSettings?.runJs?.code ?? '').length > 0)
  check('比价表 JSBlock（w6b7-matrix）在位', jsBlocks.some(row => String(row.stepParams?.jsSettings?.runJs?.code ?? '').includes('w6b7-matrix')))
  check('采购订单 JSBlock（w6b7-po-board 泳道）在位', jsBlocks.some(row => String(row.stepParams?.jsSettings?.runJs?.code ?? '').includes('w6b7-po-board')))
  const chartOf = (row: { stepParams?: Record<string, unknown> }): { collection: string, dims: string[] } | undefined => {
    const query = ((row.stepParams?.chartSettings as Record<string, unknown> | undefined)?.configure as Record<string, unknown> | undefined)?.query as Record<string, unknown> | undefined
    if (query === undefined) return undefined
    const path = Array.isArray(query.collectionPath) ? (query.collectionPath as string[]).join('.') : String((query.resource as Record<string, unknown> | undefined)?.collectionName ?? '')
    const dims = Array.isArray(query.dimensions) ? (query.dimensions as Array<Record<string, unknown>>).map(dim => String(dim.field)) : []
    return { collection: path, dims }
  }
  const dataCharts = models.filter((row) => {
    if (row.use !== 'ChartBlockModel') return false
    const chart = chartOf(row as { stepParams?: Record<string, unknown> })
    return chart !== undefined && chart.dims.length > 0
  })
  check('发票匹配 bar（pur_invoices×match_result）在位', dataCharts.some((row) => {
    const chart = chartOf(row as { stepParams?: Record<string, unknown> })
    return chart?.collection.endsWith('pur_invoices') === true && chart.dims.includes('match_result')
  }))
  check('付款申请 doughnut（pur_payments×doc_status）在位', dataCharts.some((row) => {
    const chart = chartOf(row as { stepParams?: Record<string, unknown> })
    return chart?.collection.endsWith('pur_payments') === true && chart.dims.includes('doc_status')
  }))
  const shape = await auditProcurementShape(token)
  const tablePages = shape.filter(page => page.tablePage)
  for (const page of shape) log(`  ${page.tablePage ? '▣' : '□'} ${page.title}：${page.shapes}`)
  check('采购组纯表格页 ≤4/8', tablePages.length <= 4, `table=${String(tablePages.length)}/${String(shape.length)}`)

  log('— live + demo 终态')
  const probe = await fetch(`${ENGINE_BASE}/sourcing/rfqs`, { headers: { authorization: `Bearer ${token}` } })
  check('引擎 live GET /sourcing/rfqs 200', probe.status === 200, `status=${String(probe.status)}`)
  check('RFQ-B7J1 终态 awarded', psql(`SELECT doc_status FROM pur_rfqs WHERE code = 'RFQ-B7J1';`).trim() === 'awarded')
  check('B7J1 awarded_at 非空（定标时间快照）', psql(`SELECT awarded_at IS NOT NULL FROM pur_rfqs WHERE code = 'RFQ-B7J1';`).trim() === 't')
  check('B7J1 定标审计行在（award/replay/resubmit 全链）', psql(`SELECT count(*) FROM pur_award_audit WHERE award_id = (SELECT id FROM pur_rfqs WHERE code = 'RFQ-B7J1');`).trim() !== '0')
  check('B7J1 定标 PO 回链在位', psql(`SELECT count(*) FROM pur_orders o JOIN pur_rfqs r ON r.id = o.rfq_id WHERE r.code = 'RFQ-B7J1';`).trim() === '1')
  check('权重恢复 50/30/20', psql(`SELECT weight_price || '/' || weight_lead || '/' || weight_quality FROM pur_sourcing_config WHERE id = 1;`).trim() === '50/30/20')
  check('demo RFQ 已清理', psql(`SELECT count(*) FROM pur_rfqs WHERE code = ${sqlLit(DEMO_RFQ)};`).trim() === '0')
  check('XSS 供应商残留=0', psql(`SELECT count(*) FROM srm_suppliers WHERE code = 'XSS-W6B7';`).trim() === '0')
}

/**
 * Run one verify leg (called from w6b7-sourcing.mts's CLI).
 * @param token - the root API token.
 * @param mode - 'demo' or 'assert'.
 */
export async function runVerifyLeg(token: string, mode: string): Promise<void> {
  if (mode === 'demo') {
    await demoLeg()
  } else {
    await assertLeg(token)
  }
  if (failures.length > 0) {
    log(`w6b7 ${mode}: FAILED (${String(failures.length)})`)
    process.exitCode = 1
    return
  }
  log(`w6b7 ${mode}: PASS`)
}
