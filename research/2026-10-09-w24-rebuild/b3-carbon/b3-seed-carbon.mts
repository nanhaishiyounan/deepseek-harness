/**
 * W24-B3 seed: the food-manufacturing chained dataset over the carbon
 * PostgREST session path (the B0-verdict GO surface): materials → customers
 * and suppliers → sales orders → purchase orders → one production job, plus
 * the RLS negative (a forged companyId insert) and the before/after row
 * counts. Every insert rides the live GoTrue session; the tenant comes from
 * the signed-in employee row (RLS WITH CHECK stays the floor).
 */
import { writeFileSync } from 'node:fs'
import { CarbonClient, CarbonError } from '../../../packages/connector/connector-carbon/src/index.ts'

const BASE = process.env.CARBON_URL ?? 'http://127.0.0.1:54321'
const ANON = process.env.CARBON_ANON_KEY ?? 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTE1ODE4OTUsImV4cCI6MjEwNjk0MTg5NX0.42nhGia5GsXBtJiW9aP12HCVwOoBmqwiZ3QZ060OU5o'
const EMAIL = process.env.CARBON_EMAIL ?? 'test@carbon.ms'
const PASSWORD = process.env.CARBON_PASSWORD ?? 'password'

/** The warehouse/location the job row links against (satellite seed rows). */
const WAREHOUSE_LOCATION = 'loc_APPJgrhmj7jv4esMqc4Z3u'
/** One live supplierInteraction the purchase orders link against. */
const SUPPLIER_INTERACTION = 'si_24akBdXGNhJepVcYNryPw7'

const lines: string[] = []
const log = (text: string): void => { lines.push(text); console.log(text) }

const client = new CarbonClient({ baseUrl: BASE, anonKey: ANON, email: EMAIL, password: PASSWORD })
const session = await client.ensureSession()
/** The audit column the not-null constraints require (the signed-in employee). */
const CREATOR = session.userId

/** Count one table's visible rows (session-scoped, RLS-filtered; the stock table counts by itemId). */
const countOf = async (table: string): Promise<number> =>
  (await client.list(table, { select: [table === 'itemStockQuantities' ? 'itemId' : 'id'], limit: 1 })).count

const TABLES = ['item', 'customer', 'supplier', 'salesOrder', 'purchaseOrder', 'job', 'itemStockQuantities'] as const

const before: Record<string, number> = {}
for (const table of TABLES) before[table] = await countOf(table)
log(`[before] ${TABLES.map(table => `${table}=${String(before[table])}`).join(' ')}`)

// ── the chained dataset ────────────────────────────────────────────────────
const itemA = await client.create('item', { readableId: 'W24B3-RM-001', name: '巴氏杀菌乳原料粉（食品级）', type: 'Material', itemTrackingType: 'Batch', active: true, createdBy: CREATOR, notes: 'W24-B3 食品制造初始化数据：乳制品原料' })
log(`[item] ${String(itemA.id)} ${String(itemA.name)}`)
const itemB = await client.create('item', { readableId: 'W24B3-RM-002', name: '即食燕麦片（食品级）', type: 'Material', itemTrackingType: 'Batch', active: true, createdBy: CREATOR, notes: 'W24-B3 食品制造初始化数据：谷物原料' })
log(`[item] ${String(itemB.id)} ${String(itemB.name)}`)
const itemC = await client.create('item', { readableId: 'W24B3-FG-001', name: '即食燕麦牛奶粥（成品）', type: 'Consumable', itemTrackingType: 'Batch', active: true, createdBy: CREATOR, notes: 'W24-B3 食品制造初始化数据：成品（由原料A+B生产）' })
log(`[item] ${String(itemC.id)} ${String(itemC.name)}`)
const itemD = await client.create('item', { readableId: 'W24B3-PK-001', name: '复合调味料包装袋（食品接触级）', type: 'Consumable', itemTrackingType: 'Inventory', active: true, createdBy: CREATOR, notes: 'W24-B3 食品制造初始化数据：包材' })
log(`[item] ${String(itemD.id)} ${String(itemD.name)}`)

const custA = await client.create('customer', { name: '鲜时连锁便利（华东）', currencyCode: 'CNY' })
log(`[customer] ${String(custA.id)} ${String(custA.name)}`)
const custB = await client.create('customer', { name: '宏图商超供应链有限公司', currencyCode: 'CNY' })
log(`[customer] ${String(custB.id)} ${String(custB.name)}`)

const supA = await client.create('supplier', { name: '北方乳业原料厂', currencyCode: 'CNY' })
log(`[supplier] ${String(supA.id)} ${String(supA.name)}`)
const supB = await client.create('supplier', { name: '安泰食品包装材料有限公司', currencyCode: 'CNY' })
log(`[supplier] ${String(supB.id)} ${String(supB.name)}`)

const soA = await client.create('salesOrder', { salesOrderId: 'W24B3-SO-0001', currencyCode: 'CNY', customerId: custA.id as string, createdBy: CREATOR, status: 'Confirmed', orderDate: '2026-10-10', externalNotes: 'W24-B3 食品制造初始化：即食燕麦牛奶粥 8000 箱（批次追踪）' })
log(`[salesOrder] ${String(soA.id)} ${String(soA.salesOrderId)} → customer ${String(soA.customerId)}`)
const soB = await client.create('salesOrder', { salesOrderId: 'W24B3-SO-0002', currencyCode: 'CNY', customerId: custB.id as string, createdBy: CREATOR, status: 'In Progress', orderDate: '2026-10-10', externalNotes: 'W24-B3 食品制造初始化：即食燕麦牛奶粥 5000 箱 + 调味料包材配套' })
log(`[salesOrder] ${String(soB.id)} ${String(soB.salesOrderId)} → customer ${String(soB.customerId)}`)

const poA = await client.create('purchaseOrder', { purchaseOrderId: 'W24B3-PO-0001', supplierId: supA.id as string, supplierInteractionId: SUPPLIER_INTERACTION, status: 'To Receive', createdBy: CREATOR, orderDate: '2026-10-10', currencyCode: 'CNY', purchaseOrderType: 'Purchase', internalNotes: 'W24-B3 食品制造初始化：巴氏杀菌乳原料粉 2 吨' } as Record<string, unknown>)
log(`[purchaseOrder] ${String(poA.id)} ${String(poA.purchaseOrderId)} → supplier ${String(poA.supplierId)}`)
const poB = await client.create('purchaseOrder', { purchaseOrderId: 'W24B3-PO-0002', supplierId: supB.id as string, supplierInteractionId: SUPPLIER_INTERACTION, status: 'Draft', createdBy: CREATOR, orderDate: '2026-10-10', currencyCode: 'CNY', purchaseOrderType: 'Purchase', internalNotes: 'W24-B3 食品制造初始化：食品接触级包装袋 10000 只' } as Record<string, unknown>)
log(`[purchaseOrder] ${String(poB.id)} ${String(poB.purchaseOrderId)} → supplier ${String(poB.supplierId)}`)

const job1 = await client.create('job', { jobId: 'W24B3-JOB-0001', itemId: itemC.id as string, unitOfMeasureCode: 'EA', locationId: WAREHOUSE_LOCATION, status: 'Planned', createdBy: CREATOR, quantity: 13000, dueDate: '2026-10-24', notes: 'W24-B3 食品制造初始化：即食燕麦牛奶粥生产工单（原料 A+B → 成品）' } as Record<string, unknown>)
log(`[job] ${String(job1.id)} ${String(job1.jobId)} → item ${String(job1.itemId)}`)

// ── inventory: the stock quantity table rides the posting surface ──────────
let stockNote = ''
try {
  const stock = await client.create('itemStockQuantities', { itemId: itemC.id as string, locationId: WAREHOUSE_LOCATION, quantityOnHand: 13000 } as Record<string, unknown>)
  stockNote = `inserted ${String(stock.itemId)} onHand=${String(stock.quantityOnHand)}`
} catch (error) {
  // The expected posting-surface refusal (the composite functions own stock).
  stockNote = error instanceof CarbonError ? `${error.code} HTTP ${String(error.status)}: ${error.message}` : String(error)
}
log(`[inventory] itemStockQuantities direct insert → ${stockNote}`)

// ── RLS negative: a forged tenant insert must 403 ──────────────────────────
let rlsNote = ''
try {
  await client.create('customer', { name: '伪造租户行（RLS 负向）', companyId: 'comp_bogus_tenant' })
  rlsNote = 'UNEXPECTED: forged-tenant insert accepted'
} catch (error) {
  rlsNote = error instanceof CarbonError ? `${error.code} HTTP ${String(error.status)} body.code=${String(error.body?.code)}: ${error.message}` : String(error)
}
log(`[rls-negative] forged companyId insert → ${rlsNote}`)

// ── after counts + reconciliation ──────────────────────────────────────────
const after: Record<string, number> = {}
for (const table of TABLES) after[table] = await countOf(table)
log(`[after] ${TABLES.map(table => `${table}=${String(after[table])}`).join(' ')}`)

const expected: Record<string, number> = { item: 4, customer: 2, supplier: 2, salesOrder: 2, purchaseOrder: 2, job: 1, itemStockQuantities: 0 }
let verdict = 'OK'
for (const table of TABLES) {
  const delta = after[table] - before[table]
  const want = expected[table]
  const mark = delta === want || (table === 'itemStockQuantities' && delta === 0) ? '✓' : '✗'
  if (mark === '✗' && table !== 'itemStockQuantities') verdict = 'MISMATCH'
  log(`[reconcile] ${table}: before=${String(before[table])} after=${String(after[table])} delta=${String(delta)} expected=${String(want)} ${mark}`)
}
log(`[verdict] ${verdict}`)

writeFileSync('research/2026-10-09-w24-rebuild/b3-carbon/01-seed-run.txt', `${lines.join('\n')}\n`)
console.log('\nevidence written to research/2026-10-09-w24-rebuild/b3-carbon/01-seed-run.txt')
