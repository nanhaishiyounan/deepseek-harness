/**
 * The W6-B6 CRM-activation server leg (the engine's /crm/* handlers import
 * this): the deal pipeline board (stage columns with per-column amount sums
 * and the probability-weighted total), the drag write-back with an audit row
 * (crm_stage_audit — one row per move, the滞留天数 anchor), the customer-360
 * aggregate (orders / quotes / payments / AR balance on the ar_overdue
 *口径 / the报价→订单→发货→收款 timeline), and the quote→sales-order
 * conversion (server-minted SO code, optional product lines, the
 * converted_so_code CAS so one quote converts exactly once).
 *
 * Identity: every write route takes the session-derived actor (the engine's
 * recallActor → auth:check); the销售部 fence is applied by the engine route
 * layer before these functions run.
 */
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const psql = (sql: string): string => {
  const env = readFileSync(fileURLToPath(new URL('../../../../platform/nocobase/.env', import.meta.url)), 'utf8')
  const envOf = (key: string): string | undefined => env.split('\n').map(line => line.trim()).find(line => line.startsWith(`${key}=`))?.slice(key.length + 1)
  const run = spawnSync('psql', [
    '-h', envOf('DB_HOST') ?? 'localhost', '-p', envOf('DB_PORT') ?? '5432', '-U', envOf('DB_USER') ?? 'postgres',
    '-d', envOf('DB_DATABASE') ?? envOf('DB_NAME') ?? 'nocobase', '-t', '-A', '-c', sql,
  ], { encoding: 'utf8', env: { ...process.env, PGPASSWORD: envOf('DB_PASSWORD') ?? 'nocobase' }, timeout: 20_000, maxBuffer: 16 * 1024 * 1024 })
  if (run.status !== 0) throw new Error(`psql failed: ${sql.slice(0, 120)}…\n${(run.stderr ?? '').slice(0, 300)}`)
  return run.stdout ?? ''
}

const sqlLit = (value: string): string => `'${value.replaceAll("'", "''")}'`
const numLit = (value: number): string => Number.isFinite(value) ? String(value) : '0'

// ─── the stage vocabulary (the on-disk crm_deals.stage enum verbatim) ───

/** One pipeline stage: label, win probability written back on entry, and terminality. */
export interface PipeStage {
  readonly key: 'inquiry' | 'quote' | 'negotiation' | 'won' | 'lost'
  readonly label: string
  readonly probability: number
  readonly terminal: 'won' | 'lost' | null
}

/**
 * The five stages the G-round crm_deals.stage field carries (psql fields
 * enum, F2 page spec) — 询价(线索) → 报价(方案) → 谈判 → 赢单/输单. Dragging a
 * card into a column writes the stage and the stage's probability; the won/lost
 * columns additionally sync status (fulfilled/cancelled + closed_date).
 */
export const PIPE_STAGES: ReadonlyArray<PipeStage> = [
  { key: 'inquiry', label: '询价（线索）', probability: 10, terminal: null },
  { key: 'quote', label: '报价（方案）', probability: 40, terminal: null },
  { key: 'negotiation', label: '谈判', probability: 70, terminal: null },
  { key: 'won', label: '赢单', probability: 100, terminal: 'won' },
  { key: 'lost', label: '输单', probability: 0, terminal: 'lost' },
]

const stageOf = (key: string): PipeStage | undefined => PIPE_STAGES.find(stage => stage.key === key)

// ─── the pipeline board ───

/** One deal card on the board. */
export interface PipeCard {
  readonly id: number
  readonly name: string
  readonly stage: string
  readonly status: string
  readonly amount: number
  readonly owner: string
  readonly customer: string
  readonly expected_close_date: string
  readonly closed_date: string
  /** Days since the last recorded stage move; null when the deal has no audit row yet. */
  readonly dwell_days: number | null
}

/** One column's summary: card count, amount sum, and probability-weighted value. */
export interface PipeColumn {
  readonly key: string
  readonly label: string
  readonly count: number
  readonly amount_sum: number
  readonly weighted: number
}

/** The pipe answer: stages + cards + column sums + the open-pipe weighted total. */
export interface PipeBoard {
  readonly cards: ReadonlyArray<PipeCard>
  readonly columns: ReadonlyArray<PipeColumn>
  /** Σ amount×probability over the three open stages (won/lost excluded — they are history, not forecast). */
  readonly weighted_total: number
  readonly open_amount: number
  readonly won_count: number
  readonly probability_legend: ReadonlyArray<{ key: string; probability: number }>
}

/**
 * The whole board in one read: every deal with its customer name and its last
 * audit move date (the dwell anchor), plus per-stage sums computed from the
 * same rows the cards render — the column headers and the psql recon share
 * one source, so the board cannot disagree with itself.
 * @returns the board payload.
 */
export function crmPipe(): PipeBoard {
  const rows = psql(`SELECT d.id, COALESCE(d.name,''), COALESCE(d.stage,''), COALESCE(d.status,''), COALESCE(d.amount,0), COALESCE(d.owner,''), COALESCE(d.expected_close_date::text,''), COALESCE(d.closed_date::text,''), COALESCE(c.name,''), COALESCE((SELECT max(a.moved_at) FROM crm_stage_audit a WHERE a.deal_id = d.id)::text, '')
FROM crm_deals d LEFT JOIN crm_customers c ON c.id = d.customer_id
ORDER BY d.id;`)
    .split('\n').map(line => line.trim()).filter(line => line !== '')
  const cards: PipeCard[] = rows.map((line) => {
    const cols = line.split('|')
    const movedAt = cols[9] ?? ''
    return {
      id: Number(cols[0] ?? 0), name: String(cols[1] ?? ''), stage: String(cols[2] ?? ''), status: String(cols[3] ?? ''),
      amount: Number(cols[4] ?? 0), owner: String(cols[5] ?? ''), expected_close_date: String(cols[6] ?? ''),
      closed_date: String(cols[7] ?? ''), customer: String(cols[8] ?? ''),
      dwell_days: movedAt === '' ? null : Math.max(0, Math.round((Date.now() - Date.parse(`${movedAt}T00:00:00Z`)) / 86_400_000)),
    }
  })
  const columns: PipeColumn[] = PIPE_STAGES.map((stage) => {
    const own = cards.filter(card => card.stage === stage.key)
    return {
      key: stage.key, label: stage.label, count: own.length,
      amount_sum: Math.round(own.reduce((sum, card) => sum + card.amount, 0) * 100) / 100,
      weighted: Math.round(own.reduce((sum, card) => sum + card.amount * stage.probability / 100, 0) * 100) / 100,
    }
  })
  const openKeys = new Set(['inquiry', 'quote', 'negotiation'])
  const open = cards.filter(card => openKeys.has(card.stage))
  const round2 = (value: number): number => Math.round(value * 100) / 100
  return {
    cards, columns,
    weighted_total: round2(columns.filter(column => openKeys.has(column.key)).reduce((sum, column) => sum + column.weighted, 0)),
    open_amount: round2(open.reduce((sum, card) => sum + card.amount, 0)),
    won_count: cards.filter(card => card.stage === 'won').length,
    probability_legend: PIPE_STAGES.map(stage => ({ key: stage.key, probability: stage.probability })),
  }
}

/** One audit row the move write-back leaves (also the dwell-days anchor). */
export interface StageMove {
  readonly deal_id: number
  readonly from_stage: string
  readonly to_stage: string
  readonly probability: number
  readonly status: string
  readonly moved_at: string
}

/**
 * Move one deal to a stage: the stage's probability rides along, the won/lost
 * columns sync status (fulfilled/cancelled + closed_date; leaving them clears
 * both), and one crm_stage_audit row records the move under the session actor.
 * The conditional UPDATE (WHERE stage = from) is the concurrency gate — a
 * racing move that changed the stage first leaves zero rows and this throws.
 * @param actor - the session-derived username (audit element).
 * @param dealId - the crm_deals row id.
 * @param toStage - the target stage key (must be a PIPE_STAGES key).
 * @returns the persisted move.
 */
export function crmMove(actor: string, dealId: number, toStage: string): StageMove {
  const target = stageOf(toStage)
  if (target === undefined) throw new Error(`未知阶段 ${toStage}（合法值：${PIPE_STAGES.map(stage => stage.key).join('/')}）`)
  if (!Number.isInteger(dealId) || dealId <= 0) throw new Error('需要 deal_id（正整数）')
  const row = psql(`SELECT COALESCE(stage,'') || '|' || COALESCE(name,'') || '|' || COALESCE(amount,0) FROM crm_deals WHERE id = ${String(dealId)};`).trim()
  if (row === '') throw new Error(`商机 ${String(dealId)} 不存在`)
  const [fromStage, name, amountRaw] = row.split('|')
  if (fromStage === toStage) throw new Error(`商机已在阶段 ${toStage}（无迁移）`)
  const status = target.terminal === 'won' ? 'fulfilled' : target.terminal === 'lost' ? 'cancelled' : 'pending'
  const closedDate = target.terminal === null ? 'NULL' : 'CURRENT_DATE'
  const moved = psql(`UPDATE crm_deals SET stage = ${sqlLit(toStage)}, probability = ${String(target.probability)}, status = ${sqlLit(status)}, closed_date = ${closedDate}
WHERE id = ${String(dealId)} AND COALESCE(stage,'') = ${sqlLit(fromStage)} RETURNING id;`)
  if (moved === '') throw new Error(`商机状态已变化：第 ${String(dealId)} 行已不在「${fromStage}」阶段（并发迁移被拒绝，未双写）`)
  psql(`INSERT INTO crm_stage_audit (deal_id, deal_name, from_stage, to_stage, probability, amount, actor)
VALUES (${String(dealId)}, ${sqlLit(String(name))}, ${sqlLit(fromStage)}, ${sqlLit(toStage)}, ${String(target.probability)}, ${numLit(Number(amountRaw ?? 0))}, ${sqlLit(actor)});`)
  return {
    deal_id: dealId, from_stage: fromStage, to_stage: toStage,
    probability: target.probability, status, moved_at: new Date().toISOString().slice(0, 10),
  }
}

// ─── customer 360 ───

/** One timeline node (报价 → 订单 → 发货 → 收款 the four node kinds). */
export interface TimelineNode {
  readonly date: string
  readonly kind: 'quote' | 'order' | 'ship' | 'payment'
  readonly label: string
  readonly detail: string
}

/** One customer-360 answer: profile, cards, related lists, and the timeline. */
export interface Customer360 {
  readonly customer: {
    id: number
    name: string
    type: string
    industry: string
    country: string
    level: string
    status: string
    company_name: string
  }
  readonly counts: { deals_open: number; deals_amount: number; orders: number; quotes: number; payments_received: number }
  /** 应收余额 = Σ over approved so_orders (amount − Σ received crm_payments on that order) — the ar_overdue rule口径. */
  readonly ar_balance: number
  readonly received_total: number
  readonly orders: ReadonlyArray<{
    id: number
    code: string
    amount: number
    doc_status: string
    shipping_status: string
    need_date: string
    shipped_at: string
  }>
  readonly quotes: ReadonlyArray<{
    id: number
    quote_number: string
    total: number
    status: string
    issue_date: string
    valid_until: string
    converted_so_code: string
    deal: string
  }>
  readonly deals: ReadonlyArray<{ id: number; name: string; stage: string; amount: number; owner: string; expected_close_date: string }>
  readonly timeline: ReadonlyArray<TimelineNode>
}

const splitRows = (sql: string): string[][] => psql(sql)
  .split('\n').map(line => line.trim()).filter(line => line !== '').map(line => line.split('|'))

/**
 * The customer-360 aggregate: profile + counts + AR balance (the ar_overdue
 * rule's balance subquery verbatim, per customer) + orders/quotes/deals lists
 * + the four-node-kind timeline sorted newest first. Timeline dates anchor on
 * real columns only (quote issue_date, order need_date, ship shipped_at,
 * payment paid_at) — undated rows stay out rather than inventing a date.
 * @param customerId - the crm_customers row id.
 * @returns the assembled 360 payload.
 */
export function crmCustomer(customerId: number): Customer360 {
  if (!Number.isInteger(customerId) || customerId <= 0) throw new Error('需要客户 id（正整数）')
  const info = psql(`SELECT COALESCE(name,''), COALESCE(type,''), COALESCE(industry,''), COALESCE(country,''), COALESCE(level,''), COALESCE(status,''), COALESCE(company_name,'') FROM crm_customers WHERE id = ${String(customerId)};`).trim()
  if (info === '') throw new Error(`客户 ${String(customerId)} 不存在`)
  const [name, type, industry, country, level, status, companyName] = info.split('|')
  const orders = splitRows(`SELECT o.id, COALESCE(o.code,''), COALESCE(o.amount,0), COALESCE(o.doc_status,''), COALESCE(o.shipping_status,''), COALESCE(o.need_date::text,''), COALESCE(o.shipped_at::text,'')
FROM so_orders o WHERE o.customer_id = ${String(customerId)} ORDER BY o.id DESC;`)
    .map(cols => ({ id: Number(cols[0]), code: String(cols[1] ?? ''), amount: Number(cols[2] ?? 0), doc_status: String(cols[3] ?? ''), shipping_status: String(cols[4] ?? ''), need_date: String(cols[5] ?? ''), shipped_at: String(cols[6] ?? '') }))
  const quotes = splitRows(`SELECT q.id, COALESCE(q.quote_number, COALESCE(q.quote_no,'')), COALESCE(q.total, COALESCE(q.total_amount,0)), COALESCE(q.status,''), COALESCE(q.issue_date::text,''), COALESCE(q.valid_until::text,''), COALESCE(q.converted_so_code,''), COALESCE(d.name,'')
FROM crm_quotes q LEFT JOIN crm_deals d ON d.id = q.deal_id WHERE q.customer_id = ${String(customerId)} AND COALESCE(q.is_current, TRUE) ORDER BY q.id DESC;`)
    .map(cols => ({ id: Number(cols[0]), quote_number: String(cols[1] ?? ''), total: Number(cols[2] ?? 0), status: String(cols[3] ?? ''), issue_date: String(cols[4] ?? ''), valid_until: String(cols[5] ?? ''), converted_so_code: String(cols[6] ?? ''), deal: String(cols[7] ?? '') }))
  const deals = splitRows(`SELECT d.id, COALESCE(d.name,''), COALESCE(d.stage,''), COALESCE(d.amount,0), COALESCE(d.owner,''), COALESCE(d.expected_close_date::text,'')
FROM crm_deals d WHERE d.customer_id = ${String(customerId)} AND COALESCE(d.stage,'') NOT IN ('won','lost') ORDER BY d.id;`)
    .map(cols => ({ id: Number(cols[0]), name: String(cols[1] ?? ''), stage: String(cols[2] ?? ''), amount: Number(cols[3] ?? 0), owner: String(cols[4] ?? ''), expected_close_date: String(cols[5] ?? '') }))
  // The ar_overdue rule's balance subquery, scoped to one customer.
  const arRaw = psql(`SELECT COALESCE(SUM(bal.balance), 0) FROM (
  SELECT o.amount - COALESCE((SELECT SUM(p.amount) FROM crm_payments p WHERE p.so_order_id = o.id AND p.status = 'received'), 0) AS balance
  FROM so_orders o WHERE o.doc_status = 'approved' AND o.customer_id = ${String(customerId)}) bal;`).trim()
  const arBalance = Math.round(Number(arRaw || '0') * 100) / 100
  const receivedRaw = psql(`SELECT COALESCE(SUM(p.amount), 0) FROM crm_payments p WHERE p.customer_id = ${String(customerId)} AND p.status = 'received';`).trim()
  const receivedTotal = Math.round(Number(receivedRaw || '0') * 100) / 100
  const stageLabel = (key: string): string => stageOf(key)?.label ?? key
  const nodes: TimelineNode[] = []
  for (const quote of quotes) {
    if (quote.issue_date === '') continue
    nodes.push({ date: quote.issue_date, kind: 'quote', label: '报价', detail: `${quote.quote_number} ¥${String(quote.total)}（${quote.status}）${quote.converted_so_code === '' ? '' : ` → 已转 ${quote.converted_so_code}`}` })
  }
  for (const order of orders) {
    if (order.need_date !== '') nodes.push({ date: order.need_date, kind: 'order', label: '销售订单', detail: `${order.code} ¥${String(order.amount)}（${order.doc_status}）交期` })
    if (order.shipped_at !== '') nodes.push({ date: order.shipped_at, kind: 'ship', label: '发货', detail: `${order.code} 已发货（${order.shipping_status}）` })
  }
  const payments = splitRows(`SELECT COALESCE(p.paid_at::text,''), COALESCE(p.amount,0), COALESCE(o.code,'')
FROM crm_payments p LEFT JOIN so_orders o ON o.id = p.so_order_id WHERE p.customer_id = ${String(customerId)} AND p.status = 'received' AND p.paid_at IS NOT NULL;`)
  for (const cols of payments) nodes.push({ date: String(cols[0] ?? ''), kind: 'payment', label: '收款', detail: `¥${String(cols[1] ?? '0')} 到账${cols[2] === undefined || cols[2] === '' ? '' : `（${String(cols[2])}）`}` })
  nodes.sort((a, b) => a.date < b.date ? 1 : a.date > b.date ? -1 : 0)
  return {
    customer: { id: customerId, name: String(name ?? ''), type: String(type ?? ''), industry: String(industry ?? ''), country: String(country ?? ''), level: String(level ?? ''), status: String(status ?? ''), company_name: String(companyName ?? '') },
    counts: {
      deals_open: deals.length,
      deals_amount: Math.round(deals.reduce((sum, deal) => sum + deal.amount, 0) * 100) / 100,
      orders: orders.length, quotes: quotes.length,
      payments_received: payments.length,
    },
    ar_balance: arBalance, received_total: receivedTotal,
    orders, quotes,
    deals: deals.map(deal => ({ ...deal, stage: stageLabel(deal.stage) })),
    timeline: nodes,
  }
}

/** One customer row for the picker list. */
export interface CustomerPick {
  readonly id: number
  readonly name: string
  readonly level: string
  readonly status: string
  readonly open_deals: number
}

/** The customer picker list with open-deal counts (the 360 entry). */
export function crmCustomers(): ReadonlyArray<CustomerPick> {
  return splitRows(`SELECT c.id, COALESCE(c.name,''), COALESCE(c.level,''), COALESCE(c.status,''), (SELECT count(*) FROM crm_deals d WHERE d.customer_id = c.id AND COALESCE(d.stage,'') NOT IN ('won','lost'))
FROM crm_customers c ORDER BY c.id;`)
    .map(cols => ({
      id: Number(cols[0]), name: String(cols[1] ?? ''), level: String(cols[2] ?? ''),
      status: String(cols[3] ?? ''), open_deals: Number(cols[4] ?? 0),
    }))
}

// ─── quotes → sales order ───

/** One convert-eligible quote row (the转单 tab list). */
export interface QuoteRow {
  readonly id: number
  readonly quote_number: string
  readonly total: number
  readonly status: string
  readonly issue_date: string
  readonly valid_until: string
  readonly customer: string
  readonly deal: string
  readonly converted_so_code: string
  readonly convertible: boolean
}

/** The quotes list for the转单 tab (current versions only). */
export function crmQuotes(): ReadonlyArray<QuoteRow> {
  const convertibleStatus = new Set(['draft', 'sent', 'accepted', 'pending_approval'])
  return splitRows(`SELECT q.id, COALESCE(q.quote_number, COALESCE(q.quote_no,'')), COALESCE(q.total, COALESCE(q.total_amount,0)), COALESCE(q.status,''), COALESCE(q.issue_date::text,''), COALESCE(q.valid_until::text,''), COALESCE(c.name,''), COALESCE(d.name,''), COALESCE(q.converted_so_code,'')
FROM crm_quotes q LEFT JOIN crm_customers c ON c.id = q.customer_id LEFT JOIN crm_deals d ON d.id = q.deal_id
WHERE COALESCE(q.is_current, TRUE) ORDER BY q.id DESC;`)
    .map((cols) => {
      const status = String(cols[3] ?? '')
      const converted = String(cols[8] ?? '') !== ''
      return {
        id: Number(cols[0]), quote_number: String(cols[1] ?? ''), total: Number(cols[2] ?? 0), status,
        issue_date: String(cols[4] ?? ''), valid_until: String(cols[5] ?? ''), customer: String(cols[6] ?? ''), deal: String(cols[7] ?? ''),
        converted_so_code: String(cols[8] ?? ''),
        convertible: !converted && convertibleStatus.has(status),
      }
    })
}

/** One product line the conversion dialog may carry. */
export interface ConvertLine {
  readonly product_id: number
  readonly qty: number
  readonly unit_price: number
}

/** The quote→SO conversion outcome. */
export interface ConvertOutcome {
  readonly refused: boolean
  readonly duplicate: boolean
  readonly so_id?: number
  readonly so_code?: string
  readonly amount?: number
  readonly lines?: number
  readonly existing_so_code?: string
}

/**
 * Convert one quote into a sales order: mint the SO code server-side
 * (SO-YYYY-NNNN over the numeric suffix tail), copy customer/deal, amount =
 * Σ line qty×price when lines are given (else the quote total), then CAS the
 * quote row (converted_so_code empty ∧ status≠converted → converted) — a
 * second convert finds the CAS closed and is refused with the existing SO
 * code, and a raced conversion rolls the just-inserted order back. One quote
 * converts exactly once; the partial unique index ux_crm_quotes_converted is
 * the DB-side backstop.
 * @param actor - the session-derived username (note/audit element).
 * @param quoteId - the crm_quotes row id.
 * @param needDate - the requested delivery date (ISO yyyy-mm-dd; '' = keep NULL).
 * @param lines - optional product lines (product_id must exist in hub_inv_products).
 * @returns the conversion outcome (refused=true carries the reason semantics).
 */
export function crmQuoteToSo(actor: string, quoteId: number, needDate: string, lines: ReadonlyArray<ConvertLine>): ConvertOutcome {
  if (!Number.isInteger(quoteId) || quoteId <= 0) throw new Error('需要 quote_id（正整数）')
  const isoDate = /^\d{4}-\d{2}-\d{2}$/u.test(needDate) ? needDate : ''
  const row = psql(`SELECT id || '|' || COALESCE(quote_number, COALESCE(quote_no,'')) || '|' || COALESCE(total, COALESCE(total_amount,0)) || '|' || COALESCE(status,'') || '|' || COALESCE(customer_id::text,'') || '|' || COALESCE(deal_id::text,'') || '|' || COALESCE(converted_so_code,'')
FROM crm_quotes WHERE id = ${String(quoteId)};`).trim()
  if (row === '') throw new Error(`报价单 ${String(quoteId)} 不存在`)
  const [, quoteNumber, totalRaw, status, customerIdRaw, dealIdRaw, converted] = row.split('|')
  if (String(converted ?? '') !== '' || String(status ?? '') === 'converted') {
    return { refused: true, duplicate: true, existing_so_code: String(converted ?? '') }
  }
  const customerId = Number(customerIdRaw ?? 0)
  if (!Number.isInteger(customerId) || customerId <= 0) throw new Error(`报价单 ${quoteNumber} 无客户——先补客户再转单`)
  for (const line of lines) {
    if (!Number.isInteger(line.product_id) || line.product_id <= 0) throw new Error('转单行需要 product_id（正整数）')
    if (!Number.isFinite(line.qty) || line.qty <= 0) throw new Error('转单行 qty 必须 > 0')
    if (!Number.isFinite(line.unit_price) || line.unit_price < 0) throw new Error('转单行单价不能为负')
    const present = psql(`SELECT count(*) FROM hub_inv_products WHERE id = ${String(line.product_id)};`).trim()
    if (present !== '1') throw new Error(`产品 ${String(line.product_id)} 不在 hub_inv_products——转单行拒绝落库`)
  }
  const amount = lines.length > 0
    ? Math.round(lines.reduce((sum, line) => sum + line.qty * line.unit_price, 0) * 100) / 100
    : Math.round(Number(totalRaw ?? 0) * 100) / 100
  const year = new Date().getFullYear()
  const prefix = `SO-${year}-`
  const maxRaw = psql(`SELECT COALESCE(max(NULLIF(split_part(code, '-', 3), '')::int), 0) FROM so_orders WHERE code LIKE ${sqlLit(`${prefix}%`)};`).trim()
  const soCode = `${prefix}${String(Number(maxRaw || '0') + 1).padStart(4, '0')}`
  const dealId = Number(dealIdRaw ?? 0) > 0 ? String(Number(dealIdRaw)) : 'NULL'
  // psql's stdout carries the RETURNING row plus the 'INSERT 0 1' command
  // tag — the id is the first line, never the whole buffer.
  const soIdRaw = psql(`INSERT INTO so_orders (code, need_date, amount, doc_status, note, customer_id, deal_id)
VALUES (${sqlLit(soCode)}, ${isoDate === '' ? 'NULL' : sqlLit(isoDate)}, ${numLit(amount)}, 'draft', ${sqlLit(`W6-B6 报价转单 ${quoteNumber}（${actor}）`)}, ${String(customerId)}, ${dealId}) RETURNING id;`).trim()
  const soId = Number((soIdRaw.split('\n')[0] ?? '').trim())
  if (!Number.isInteger(soId) || soId <= 0) throw new Error(`转单落库未返回行 id（stdout=${soIdRaw.slice(0, 80)}）`)
  for (const line of lines) {
    psql(`INSERT INTO so_order_lines (order_id, product_id, qty, unit_price) VALUES (${String(soId)}, ${String(line.product_id)}, ${numLit(line.qty)}, ${numLit(line.unit_price)});`)
  }
  const claimed = psql(`UPDATE crm_quotes SET status = 'converted', converted_so_code = ${sqlLit(soCode)}
WHERE id = ${String(quoteId)} AND COALESCE(converted_so_code,'') = '' AND COALESCE(status,'') <> 'converted' RETURNING id;`).trim()
  if (claimed === '') {
    psql(`DELETE FROM so_order_lines WHERE order_id = ${String(soId)};`)
    psql(`DELETE FROM so_orders WHERE id = ${String(soId)};`)
    const existing = psql(`SELECT COALESCE(converted_so_code,'') FROM crm_quotes WHERE id = ${String(quoteId)};`).trim()
    return { refused: true, duplicate: true, existing_so_code: existing }
  }
  return { refused: false, duplicate: false, so_id: soId, so_code: soCode, amount, lines: lines.length }
}

/** One product option for the conversion dialog's line editor. */
export interface ProductOption {
  readonly id: number
  readonly name: string
}

/** The product options the conversion line editor picks from (finished-goods catalog). */
export function crmProducts(): ReadonlyArray<ProductOption> {
  // hub_inv_products carries no price column — the quote's line price is the input.
  return splitRows(`SELECT p.id, COALESCE(p.name,'') FROM hub_inv_products p WHERE COALESCE(p.status, 'active') = ${sqlLit('active')} ORDER BY p.id;`)
    .map(cols => ({ id: Number(cols[0]), name: String(cols[1] ?? '') }))
}
