/**
 * W2-B5 negatives + tolerance pair + RFQ CLI（一次性验证脚本，psql 对照证据的生产端）.
 *
 * 1. Tolerance pair: two invoices off by exactly ¥0.08 against PO-2026-0001
 *    (expected ¥120,000) — under a temporarily-written 0.05 extras key the
 *    match refuses (the W-round口径), under the seeded 0.10 it passes.
 * 2. Ghost negative: approver_map manager→["admin","ghost"] refuses at
 *    submit with no todo rows written; the map restores, the draft PO is
 *    destroyed (库内无残留).
 * 3. Malformed threshold negative: extras.amount_threshold="abc" fails loud
 *    at submit (loadFlow → thresholdOf); extras restores.
 * 4. RFQ CLI lives in w2-b5-rfq-cli.mts (this script's leg moved there).
 *
 * Usage: node --import tsx/esm research/2026-09-27-w2-evolution/w2-b5-negatives.mts
 */
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { dataOf, signInWithRetry } from '../../examples/kb-agent/scripts/nocobase-flow-page-lib.mts'

const here = dirname(fileURLToPath(import.meta.url))
const w3Script = [here, '..', '..', 'examples', 'kb-agent', 'scripts', 'nocobase-w3-procurement.mts'].join('/')

const rowsOf = async (token: string, collection: string, pageSize = 500): Promise<Array<Record<string, any>>> =>
  await dataOf(token, 'GET', `/api/${collection}:list?pageSize=${String(pageSize)}`) ?? []

import { spawnSync } from 'node:child_process'
const run = (args: readonly string[]): void => {
  const result = spawnSync('node', ['--import', 'tsx/esm', w3Script, ...args], { stdio: 'inherit' })
  if (result.status !== 0) throw new Error(`w3 ${args.join(' ')} failed (exit ${String(result.status)})`)
}

const failureOf = async (body: () => Promise<unknown>): Promise<string> => {
  try {
    await body()
    return ''
  } catch (error) {
    return error instanceof Error ? error.message : String(error)
  }
}

async function main(): Promise<void> {
  const token = await signInWithRetry()
  const year = new Date().getFullYear()
  const io = {
    list: async (collection: string, filter?: Record<string, unknown>) => {
      const query = filter === undefined ? '' : `&filter=${encodeURIComponent(JSON.stringify(filter))}`
      return await dataOf(token, 'GET', `/api/${collection}:list?pageSize=500${query}`) ?? []
    },
    get: async (collection: string, id: number) => await dataOf(token, 'GET', `/api/${collection}:get?filterByTk=${String(id)}`) ?? undefined,
    create: async (collection: string, values: Record<string, unknown>) => await dataOf(token, 'POST', `/api/${collection}:create`, values),
    update: async (collection: string, id: number, values: Record<string, unknown>) => {
      await dataOf(token, 'POST', `/api/${collection}:update?filterByTk=${String(id)}`, values)
    },
    updateWhere: async (collection: string, filter: Record<string, unknown>, values: Record<string, unknown>) => {
      const rows = await dataOf(token, 'POST', `/api/${collection}:update?filter=${encodeURIComponent(JSON.stringify(filter))}&pageSize=10`, values)
      return Array.isArray(rows) ? rows.length : rows === null || rows === undefined ? 0 : 1
    },
    destroy: async (collection: string, id: number) => {
      await dataOf(token, 'POST', `/api/${collection}:destroy?filterByTk=${String(id)}`)
    },
  }
  const { submitForApproval } = await import('../../examples/kb-agent/scripts/approval-engine.mts')
  const flow = (await rowsOf(token, 'wfl_flow_configs')).find((row: Record<string, any>) => row.doc_type === 'pur_orders' && row.is_active === true) as Record<string, any>
  if (flow === undefined) throw new Error('pur_orders flow missing')
  const originalExtras = String(flow.extras)
  const originalMap = String(flow.approver_map)
  const setExtras = async (mutate: (extras: Record<string, any>) => void): Promise<void> => {
    const extras = JSON.parse(originalExtras) as Record<string, any>
    mutate(extras)
    await dataOf(token, 'POST', `/api/wfl_flow_configs:update?filterByTk=${String(flow.id)}`, { extras: JSON.stringify(extras) })
  }

  // ── 1. Tolerance pair: ¥0.08 off, 0.05 refuses / 0.10 passes ──
  // The witness document PO-B5-C (approved) gains one order line 1000×120 =
  // ¥120,000 expected; both invoices bill 1000 and ¥120,000.08.
  const po = (await rowsOf(token, 'pur_orders')).find((row: Record<string, any>) => row.code === 'PO-B5-C') as Record<string, any>
  if (po === undefined) throw new Error('PO-B5-C missing (run nocobase-w3-procurement.mts first)')
  const product = (await rowsOf(token, 'hub_inv_products', 200)).find((row: Record<string, any>) => row.sku === 'FD-SOY-500') as Record<string, any>
  if (product === undefined) throw new Error('hub_inv_products 缺 FD-SOY-500')
  const b5Lines = (await rowsOf(token, 'pur_order_lines')).filter((row: Record<string, any>) => Number(row.order_id) === Number(po.id))
  if (b5Lines.length === 0) {
    await dataOf(token, 'POST', '/api/pur_order_lines:create', {
      order: { id: Number(po.id) }, product: { id: Number(product.id) }, qty: 1000, unit_price: 120, qty_received: 0,
    })
  }
  // A previous aborted run may have planted the pair on the wrong PO: reset.
  for (const code of ['INV-2026-B5TOL-A', 'INV-2026-B5TOL-B']) {
    const stale = (await rowsOf(token, 'pur_invoices')).find((row: Record<string, any>) => row.code === code)
    if (stale !== undefined && Number(stale.po_id) !== Number(po.id)) await io.destroy('pur_invoices', Number(stale.id))
  }
  const invoiceOf = async (code: string): Promise<Record<string, any>> => {
    const existing = (await rowsOf(token, 'pur_invoices')).find((row: Record<string, any>) => row.code === code)
    if (existing !== undefined && Number(existing.po_id) === Number(po.id)) return existing as Record<string, any>
    if (existing !== undefined) await io.destroy('pur_invoices', Number(existing.id))
    return await dataOf(token, 'POST', '/api/pur_invoices:create', {
      code, po: { id: Number(po.id) }, invoice_no: `INV-NO-${code}`, invoice_amount: 120_000.08, qty_billed: 1000,
      billed_at: new Date().toISOString().slice(0, 10), match_result: 'draft', match_note: '',
    }) as Record<string, any>
  }
  await setExtras(extras => { extras.invoice_match_tolerance = 0.05 })
  const invA = await invoiceOf('INV-2026-B5TOL-A')
  run(['--match-invoice', 'INV-2026-B5TOL-A'])
  const invAResult = String((await rowsOf(token, 'pur_invoices')).find((row: Record<string, any>) => row.code === 'INV-2026-B5TOL-A')?.match_result)
  if (invAResult !== 'exception') throw new Error(`容差 0.05 下差 ¥0.08 应 exception（实际 ${invAResult}）`)
  console.log(`w2-b5: 容差对拍 A ✓ 0.05 口径差 ¥0.08 → ${invAResult}（INV-2026-B5TOL-A #${String(invA.id)}）`)
  await setExtras(extras => { extras.invoice_match_tolerance = 0.1 })
  await invoiceOf('INV-2026-B5TOL-B')
  run(['--match-invoice', 'INV-2026-B5TOL-B'])
  const invBResult = String((await rowsOf(token, 'pur_invoices')).find((row: Record<string, any>) => row.code === 'INV-2026-B5TOL-B')?.match_result)
  if (invBResult !== 'matched') throw new Error(`容差 0.10 下差 ¥0.08 应 matched（实际 ${invBResult}）`)
  console.log('w2-b5: 容差对拍 B ✓ 0.10 口径差 ¥0.08 → matched（INV-2026-B5TOL-B）')

  // ── 2. Ghost approver negative ──
  await dataOf(token, 'POST', `/api/wfl_flow_configs:update?filterByTk=${String(flow.id)}`, {
    approver_map: JSON.stringify({ manager: ['admin', 'ghost'], gm: 'admin' }),
  })
  const ghostPo = await dataOf(token, 'POST', '/api/pur_orders:create', {
    code: 'PO-B5-G', supplier: { id: Number(po.supplier_id) }, amount: 100, currency: 'CNY',
    doc_status: 'draft', receiving_status: 'none', invoice_status: 'no_invoice',
  }) as Record<string, any>
  const ghostRefusal = await failureOf(() => submitForApproval(io as never, 'pur_orders', Number(ghostPo.id), '陈立群'))
  if (!ghostRefusal.includes('不存在的用户') || !ghostRefusal.includes('ghost')) {
    throw new Error(`幽灵审批人负例未按预期拒绝（${ghostRefusal}）`)
  }
  const ghostTodos = (await rowsOf(token, 'wfl_approval_todos')).filter((row: Record<string, any>) => String(row.doc_id) === String(ghostPo.id))
  if (ghostTodos.length !== 0) throw new Error(`幽灵负例残留 ${String(ghostTodos.length)} 行 todo`)
  await dataOf(token, 'POST', `/api/wfl_flow_configs:update?filterByTk=${String(flow.id)}`, { approver_map: originalMap })
  await io.destroy('pur_orders', Number(ghostPo.id))
  const ghostLeft = (await rowsOf(token, 'pur_orders')).some((row: Record<string, any>) => row.code === 'PO-B5-G')
  if (ghostLeft) throw new Error('幽灵负例草稿未清理')
  console.log('w2-b5: 幽灵审批人负例 ✓ fail-loud「不存在的用户：ghost」+ 零残留（map 已还原、PO-B5-G 已删）')

  // ── 3. Malformed amount_threshold negative ──
  await setExtras(extras => { extras.amount_threshold = 'abc' })
  const badPo = await dataOf(token, 'POST', '/api/pur_orders:create', {
    code: 'PO-B5-H', supplier: { id: Number(po.supplier_id) }, amount: 100, currency: 'CNY',
    doc_status: 'draft', receiving_status: 'none', invoice_status: 'no_invoice',
  }) as Record<string, any>
  const badRefusal = await failureOf(() => submitForApproval(io as never, 'pur_orders', Number(badPo.id), '陈立群'))
  if (!badRefusal.includes('amount_threshold')) {
    throw new Error(`非法阈值负例未按预期拒绝（${badRefusal}）`)
  }
  await dataOf(token, 'POST', `/api/wfl_flow_configs:update?filterByTk=${String(flow.id)}`, { extras: originalExtras })
  await io.destroy('pur_orders', Number(badPo.id))
  console.log('w2-b5: 非法阈值负例 ✓ fail-loud「extras.amount_threshold 非法：\"abc\"」+ extras 已还原为种子值')

  console.log('w2-b5: negatives + tolerance pair all OK')
}

await main()
