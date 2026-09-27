/**
 * W2-B5 RFQ CLI driver: RFQ-B5-CLI (approved) + two submitted quotes, then
 * the w3 CLIs drive the transitions — `--send-rfq` (approved → sent with
 * sent_at backfill) and `--award-rfq --quote <报价行id>` (close + PO from
 * the named quote). Idempotent: an already-closed RFQ replays as kept.
 *
 * Usage: node --import tsx/esm research/2026-09-27-w2-evolution/w2-b5-rfq-cli.mts
 */
import { spawnSync } from 'node:child_process'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { dataOf, signInWithRetry } from '../../examples/kb-agent/scripts/nocobase-flow-page-lib.mts'

const here = dirname(fileURLToPath(import.meta.url))
const w3 = join(here, '..', '..', 'examples', 'kb-agent', 'scripts', 'nocobase-w3-procurement.mts')
const rfqCode = 'RFQ-B5-CLI'

const rowsOf = async (token: string, collection: string): Promise<Array<Record<string, any>>> =>
  await dataOf(token, 'GET', `/api/${collection}:list?pageSize=500`) ?? []

const run = (args: readonly string[]): void => {
  const result = spawnSync('node', ['--import', 'tsx/esm', w3, ...args], { stdio: 'inherit' })
  if (result.status !== 0) throw new Error(`w3 ${args.join(' ')} failed (exit ${String(result.status)})`)
}

const rfqNow = async (token: string): Promise<Record<string, any>> =>
  (await rowsOf(token, 'pur_rfqs')).find((row: Record<string, any>) => row.code === rfqCode) as Record<string, any>

async function main(): Promise<void> {
  const token = await signInWithRetry()
  const io = {
    list: async (collection: string, filter?: Record<string, unknown>) => {
      const query = filter === undefined ? '' : `&filter=${encodeURIComponent(JSON.stringify(filter))}`
      return await dataOf(token, 'GET', `/api/${collection}:list?pageSize=500${query}`) ?? []
    },
    updateWhere: async (collection: string, filter: Record<string, unknown>, values: Record<string, unknown>) => {
      const rows = await dataOf(token, 'POST', `/api/${collection}:update?filter=${encodeURIComponent(JSON.stringify(filter))}&pageSize=10`, values)
      return Array.isArray(rows) ? rows.length : rows === null || rows === undefined ? 0 : 1
    },
  }
  // RFQ: draft → submit → approved (the engine path, mirroring the w3 seeds).
  if ((await rowsOf(token, 'pur_rfqs')).every((row: Record<string, any>) => row.code !== rfqCode)) {
    await dataOf(token, 'POST', '/api/pur_rfqs:create', {
      code: rfqCode, deadline: new Date().toISOString().slice(0, 10), doc_status: 'draft', note: 'W2-B5 RFQ CLI 演示',
    })
  }
  let rfq = await rfqNow(token)
  if (String(rfq.doc_status) === 'draft') {
    const { act, submitForApproval } = await import('../../examples/kb-agent/scripts/approval-engine.mts')
    await submitForApproval(io as never, 'pur_rfqs', Number(rfq.id), '陈立群')
    await act(io as never, 'pur_rfqs', Number(rfq.id), 'approve', 'admin', 'W2-B5：CLI 演示询价生效')
    rfq = await rfqNow(token)
  }
  if (String(rfq.doc_status) !== 'approved' && String(rfq.doc_status) !== 'sent' && String(rfq.doc_status) !== 'closed') {
    throw new Error(`RFQ-B5-CLI 状态异常（${String(rfq.doc_status)}）`)
  }
  // Two submitted quotes: ¥2.2 and ¥2.5 (the award names the higher one).
  const suppliers = (await rowsOf(token, 'srm_suppliers'))
    .filter((row: Record<string, any>) => row.lifecycle_status === 'qualified' || row.lifecycle_status === 'preferred')
    .sort((a: Record<string, any>, b: Record<string, any>) => String(a.name).localeCompare(String(b.name), 'zh-Hans-CN')).slice(0, 2)
  const product = (await rowsOf(token, 'hub_inv_products')).find((row: Record<string, any>) => row.sku === 'FD-SOY-500') as Record<string, any>
  const quotes = (await rowsOf(token, 'pur_quotes')).filter((row: Record<string, any>) => Number(row.rfq_id) === Number(rfq.id))
  const allocations = (await rowsOf(token, 'pur_rfq_suppliers')).filter((row: Record<string, any>) => Number(row.rfq_id) === Number(rfq.id))
  if (quotes.length === 0) {
    for (const [index, supplier] of suppliers.entries()) {
      await dataOf(token, 'POST', '/api/pur_quotes:create', {
        rfq: { id: Number(rfq.id) }, supplier: { id: Number(supplier.id) }, product: { id: Number(product.id) },
        qty: 100, unit_price: index === 0 ? 2.2 : 2.5, lead_time_days: 3 + index, status: 'submitted',
        valid_until: new Date().toISOString().slice(0, 10), note: `W2-B5 CLI 报价 ${String(index + 1)}`,
      })
    }
  }
  if (allocations.length === 0) {
    for (const supplier of suppliers) {
      await dataOf(token, 'POST', '/api/pur_rfq_suppliers:create', { rfq: { id: Number(rfq.id) }, supplier: { id: Number(supplier.id) } })
    }
  }
  // CLI 1: send (approved → sent, allocations gain sent_at). A replay on an
  // already-closed RFQ keeps both CLIs' idempotent branches.
  const statusNow = async (): Promise<string> => String((await rfqNow(token)).doc_status)
  if (await statusNow() === 'approved') {
    run(['--send-rfq', rfqCode])
  }
  if (await statusNow() === 'sent') {
    const sentCount = (await rowsOf(token, 'pur_rfq_suppliers')).filter((row: Record<string, any>) => Number(row.rfq_id) === Number(rfq.id) && row.sent_at !== null).length
    console.log(`w2-b5: RFQ CLI ① --send-rfq ✓ approved → sent（${String(sentCount)} 家分配回填 sent_at）`)
  } else if (await statusNow() !== 'closed') {
    throw new Error(`--send-rfq 未落到 sent/closed（${await statusNow()}）`)
  } else {
    console.log('w2-b5: RFQ CLI ① --send-rfq 幂等重放（already closed kept）')
  }
  // CLI 2: award naming the ¥2.5 quote (not the lowest ¥2.2).
  const awarded = (await rowsOf(token, 'pur_orders')).some((row: Record<string, any>) => Number(row.rfq_id) === Number(rfq.id))
  if (!awarded) {
    const named = (await rowsOf(token, 'pur_quotes')).find((row: Record<string, any>) => Number(row.rfq_id) === Number(rfq.id) && Number(row.unit_price) === 2.5) as Record<string, any>
    if (named === undefined) throw new Error('¥2.5 报价行缺失')
    run(['--award-rfq', rfqCode, '--quote', String(named.id)])
  } else {
    run(['--award-rfq', rfqCode])
  }
  const finalRfq = await rfqNow(token)
  if (String(finalRfq.doc_status) !== 'closed') throw new Error(`--award-rfq 后状态异常（${String(finalRfq.doc_status)}）`)
  const po = (await rowsOf(token, 'pur_orders')).find((row: Record<string, any>) => Number(row.rfq_id) === Number(rfq.id)) as Record<string, any>
  const won = (await rowsOf(token, 'pur_quotes')).find((row: Record<string, any>) => Number(row.rfq_id) === Number(rfq.id) && row.is_won === true) as Record<string, any>
  if (Number(won.unit_price) !== 2.5) throw new Error(`--quote 未指定中标（中标单价 ${String(won.unit_price)}）`)
  console.log(`w2-b5: RFQ CLI ② --award-rfq --quote ${String(won.id)} ✓ sent → closed + PO ${String(po.code)}（¥${String(po.amount)} = 指定报价 ¥2.5×100）`)
  console.log('w2-b5: RFQ CLI all OK')
}

await main()
