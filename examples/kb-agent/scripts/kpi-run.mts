/**
 * B9: the KPI snapshot engine — the real-data dashboard spine
 * (plans/2026-09-25-mfg-closure/10-b9-dashboards-final.md). Every value is a
 * pure aggregation over live document rows (psql re-derivable — each KPI's
 * JSDoc carries the reconciliation SQL); no mock inputs anywhere. PLAN D9:
 * T+1 materialized snapshots, 90-day backfill on first bring-up, trends
 * only — no industry red/green lights.
 *
 * 1. --calc-kpi: materialize today's rows (one per KPI code, plus the
 *    per-supplier dimension rows of otd_supplier).
 * 2. --backfill <days> (default 90): replay every day from today−(days−1)
 *    through today. W2-B4: the three inventory stock codes replay their
 *    as-of values from the movements ledger's biz_date (see the KPI notes);
 *    the three process-count codes still materialize value=null before
 *    today (present-only state — the row stays so the 90-day continuity
 *    assertion counts rows, not values); the two turnover codes are monthly
 *    grain — a row lands only on a month-end date whose month carries a
 *    wms_monthly_balances snapshot (dim='period').
 * 3. --selftest: the pure layer only — FPY=(90−5)/90, the OTIF
 *    numerator/denominator vocabulary, count accuracy, percentile_cont
 *    parity, the expiry window, dead-stock aging, and the RTY product.
 * 4. --trace po=<code> mo=<code>: the batch's two-way traceability
 *    assertions — PO up to PR/RFQ/quotes, down to receipts/IQC/stock/
 *    invoices/payments; MO up to BOM/driver_suggestion→SO, down to issues/
 *    job reports/completions; plus the lot-level 成品批次→组件批次→供应商
 *    three-level JOIN. Fails loud on any broken link; re-runnable.
 * 5. --reconcile: print the engine's OTIF / FPY / count-accuracy values for
 *    the latest calc_date plus the three psql statements a human runs to
 *    hand-check them (the b9-kpi-reconcile.txt evidence source).
 *
 * Usage (repo root, tsx loader):
 *   node --import tsx/esm examples/kb-agent/scripts/kpi-run.mts --selftest
 *   node --import tsx/esm examples/kb-agent/scripts/kpi-run.mts --calc-kpi
 *   node --import tsx/esm examples/kb-agent/scripts/kpi-run.mts --backfill 90
 *   node --import tsx/esm examples/kb-agent/scripts/kpi-run.mts --trace po=PO-2026-0003 mo=MO-2026-0002
 *   node --import tsx/esm examples/kb-agent/scripts/kpi-run.mts --reconcile
 */
import { call, dataOf, signInWithRetry } from './nocobase-flow-page-lib.mts'
import { movingAverageCost, WIP_ZONE_CODE } from './nocobase-h5-wms.mts'

// ─── pure compute (selftested; no IO) ───

/** Round to 4 decimals so ratio arithmetic never drifts into float noise. */
const q4 = (value: number): number => Math.round(value * 10_000) / 10_000

/** Whole days between two ISO dates (a − b), UTC-midnight anchored. */
export function dayDiff(a: string, b: string): number {
  return Math.round((Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / 86_400_000)
}

/** ISO date offset by n days (negative goes back). */
export function isoAddDays(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10)
}

/**
 * The Asia/Shanghai business date (UTC+8) of an instant: every calc_date
 * bucket and "today" pick buckets on the business day, never the UTC day —
 * UTC 20:00 is Shanghai's next-day 04:00 and must bucket to that day.
 * @param at - the instant to bucket (default now).
 * @returns the Shanghai-day YYYY-MM-DD.
 */
export function shanghaiDate(at: Date = new Date()): string {
  return new Date(at.getTime() + 8 * 3_600_000).toISOString().slice(0, 10)
}

/**
 * Linear-interpolated percentile (PG percentile_cont parity: idx=(n−1)p,
 * floor/ceil neighbors, fractional blend) — the po-lead-time P50/P90 basis.
 * @param sorted - ascending values.
 * @param p - the percentile fraction in [0,1].
 * @returns the interpolated value, or null when nothing sampled.
 */
export function percentileCont(sorted: readonly number[], p: number): number | null {
  if (sorted.length === 0) return null
  if (sorted.length === 1) return sorted[0]
  const idx = (sorted.length - 1) * p
  const lo = Math.floor(idx)
  const hi = Math.ceil(idx)
  return q4(sorted[lo]! + (sorted[hi]! - sorted[lo]!) * (idx - lo))
}

/** One so_orders row's KPI-relevant slice. */
export interface SoFact { doc_status: string; need_date: string | null; shipping_status: string; shipped_at: string | null; approved_at: string | null; amount: number | null }

/**
 * OTIF — 准时足量交付率, the D3b formula over the approved, dated SO
 * population as of the calc date.
 * Reconciliation SQL:
 *   SELECT count(*) FILTER (WHERE shipping_status='shipped' AND shipped_at <= need_date)::float
 *          / count(*) AS otif
 *   FROM so_orders WHERE doc_status='approved' AND need_date IS NOT NULL
 *         AND approved_at <= :d AND (shipped_at IS NULL OR shipped_at <= :d);
 * @param rows - the so_orders rows approved on or before asOf.
 * @returns shipped-and-on-time / due-dated approved, or null when the denominator is empty.
 */
export function otifOf(rows: readonly SoFact[]): number | null {
  const due = rows.filter(row => row.need_date !== null && row.need_date !== '')
  if (due.length === 0) return null
  const onTime = due.filter(row => row.shipping_status === 'shipped' && row.shipped_at !== null && row.shipped_at !== '' && row.shipped_at <= row.need_date!)
  return q4(onTime.length / due.length)
}

/** One receipt↔PO pair for the supplier-delivery and lead-time KPIs. */
export interface ReceiptPair { receipt_no: string; received_at: string | null; po_need_date: string | null; po_approved_at: string | null; supplier_name: string | null }

/**
 * OTD-Supplier — 准时到货率, per the D3b formula (on-time arrival lots /
 * total arrival lots; a lot without a dated PO need_date stays out, noted
 * in the KPI row).
 * Reconciliation SQL (global):
 *   SELECT count(*) FILTER (WHERE r.received_at <= p.need_date)::float / count(*)
 *   FROM wms_receipts r JOIN pur_orders p ON p.id = r.po_id
 *   WHERE r.po_id IS NOT NULL AND r.received_at IS NOT NULL AND p.need_date IS NOT NULL;
 * @param pairs - the receipt↔PO pairs received on or before asOf.
 * @returns on-time / total, or null when nothing arrived yet.
 */
export function otdSupplierOf(pairs: readonly ReceiptPair[]): number | null {
  const dated = pairs.filter(pair => pair.received_at !== null && pair.received_at !== '' && pair.po_need_date !== null && pair.po_need_date !== '')
  if (dated.length === 0) return null
  const onTime = dated.filter(pair => pair.received_at! <= pair.po_need_date!)
  return q4(onTime.length / dated.length)
}

/**
 * The PO lead time in days per receipt pair (received_at − po_approved_at);
 * undatable pairs drop out (either date missing).
 */
function leadDaysOf(pairs: readonly ReceiptPair[]): number[] {
  return pairs
    .filter(pair => pair.received_at !== null && pair.received_at !== '' && pair.po_approved_at !== null && pair.po_approved_at !== '')
    .map(pair => dayDiff(pair.received_at!, pair.po_approved_at!))
}

/**
 * 采购提前期 P50/P90 — percentile_cont over (receipt.received_at −
 * po.approved_at). Reconciliation SQL:
 *   SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY r.received_at - p.approved_at)
 *   FROM wms_receipts r JOIN pur_orders p ON p.id = r.po_id
 *   WHERE r.received_at IS NOT NULL AND p.approved_at IS NOT NULL AND r.received_at <= :d;
 */
export function leadPercentileOf(pairs: readonly ReceiptPair[], p: number): number | null {
  return percentileCont([...leadDaysOf(pairs)].sort((a, b) => a - b), p)
}

/** One job-report row's KPI slice. */
export interface ReportFact { op_seq: number | null; report_date: string | null; status: string; qty_good: number | null; qty_scrap: number | null; duration_min: number | null }

/**
 * FPY — 一次合格率, the D3c formula (first-pass good units / units
 * started, posted job reports only). The batch doc's worked example
 * 100 started / 5 reworked → (90−5)/90-style ratio reduces to Σgood /
 * Σ(good+scrap) over the posted rows.
 * Reconciliation SQL:
 *   SELECT sum(qty_good)::float / sum(qty_good + qty_scrap) AS fpy
 *   FROM mfg_job_reports WHERE status='posted' AND report_date <= :d;
 * @param rows - the posted job reports reported on or before asOf.
 * @returns good / started, or null when no posted rows exist.
 */
export function fpyOf(rows: readonly ReportFact[]): number | null {
  const posted = rows.filter(row => row.status === 'posted')
  const good = posted.reduce((total, row) => total + Number(row.qty_good ?? 0), 0)
  const started = posted.reduce((total, row) => total + Number(row.qty_good ?? 0) + Number(row.qty_scrap ?? 0), 0)
  if (started <= 0) return null
  return q4(good / started)
}

/**
 * RTY — 滚动合格率, the per-op FPY product (D3c: RTY=∏FPYᵢ). Ops without
 * posted rows do not enter the product.
 * Reconciliation SQL:
 *   WITH per_op AS (SELECT op_seq, sum(qty_good)::float / sum(qty_good + qty_scrap) AS fpy
 *                   FROM mfg_job_reports WHERE status='posted' AND report_date <= :d GROUP BY op_seq)
 *   SELECT exp(sum(ln(fpy))) FROM per_op;
 */
export function rtyOf(rows: readonly ReportFact[]): number | null {
  const perOp = new Map<number, { good: number, started: number }>()
  for (const row of rows) {
    if (row.status !== 'posted' || row.op_seq === null) continue
    const acc = perOp.get(row.op_seq) ?? { good: 0, started: 0 }
    acc.good += Number(row.qty_good ?? 0)
    acc.started += Number(row.qty_good ?? 0) + Number(row.qty_scrap ?? 0)
    perOp.set(row.op_seq, acc)
  }
  let product: number | null = null
  for (const acc of perOp.values()) {
    if (acc.started <= 0) continue
    product = product === null ? q4(acc.good / acc.started) : q4(product * (acc.good / acc.started))
  }
  return product
}

/** One count row's KPI slice. */
export interface CountFact { count_no: string; biz_date: string | null; snapshot_qty: number | null; counted_qty: number | null }

/**
 * 账实相符率 — 1 − Σ|盘点差异|/Σ账面 (D3d), the same wms_counts source the
 * B4 reconciliation asserts. Only rows actually counted enter; the count
 * date is parsed from the CNT-YYYYMMDD-nnnn business key (the collection
 * carries no date column).
 * Reconciliation SQL:
 *   SELECT 1 - sum(abs(difference))::float / sum(snapshot_qty) FROM wms_counts
 *   WHERE counted_qty IS NOT NULL AND substring(count_no from 'CNT-(\d{8})')::date <= :d;
 * @param rows - the counted rows whose count_no date ≤ asOf.
 * @returns the accuracy ratio, or null when nothing counted yet.
 */
export function countAccuracyOf(rows: readonly CountFact[]): number | null {
  const counted = rows.filter(row => row.counted_qty !== null && Number(row.snapshot_qty ?? 0) > 0)
  if (counted.length === 0) return null
  const snapshot = counted.reduce((total, row) => total + Number(row.snapshot_qty ?? 0), 0)
  const drift = counted.reduce((total, row) => total + Math.abs(Number(row.counted_qty ?? 0) - Number(row.snapshot_qty ?? 0)), 0)
  return q4(1 - drift / snapshot)
}

/** The count row's business date out of the CNT-YYYYMMDD-nnnn key ('' when unparsable). */
export function countDateOf(countNo: string): string {
  const raw = /CNT-(\d{4})(\d{2})(\d{2})/.exec(countNo)
  return raw === null ? '' : `${raw[1]}-${raw[2]}-${raw[3]}`
}

/**
 * W2-B3: one count row's effective business date — the biz_date column
 * wins (backfilled from the same key by --backfill-dates), the key parsing
 * stays as the fallback for column-less rows (and the validator diff the
 * backfill prints). Disagreements resolve to the column.
 */
export function countRowDateOf(row: Pick<CountFact, 'biz_date' | 'count_no'>): string {
  const column = String(row.biz_date ?? '').slice(0, 10)
  return column > '' ? column : countDateOf(row.count_no)
}

/** One stock row joined to its lot/product valuation slice. */
export interface StockFact { qty_on_hand: number; status: string; unit_price: number | null; lot_receipt_date: string | null; expiry_date: string | null; lot_no: string | null }

// ─── W2-B4: biz_date replay (the inventory stock codes' history source) ───

/** One movement row's KPI replay slice (the W2-B3 dated movements ledger). */
export interface KpiMovement { id: number, product_id: number, qty: number, biz_date: string, wip_leg: boolean }

/**
 * The net on-hand quantity as of a date — Σ movement qty over legs whose
 * biz_date ≤ asOf, whole-ledger net (every zone: 待检/线边/无库区 seed legs
 * included). Today's value equals `SELECT sum(qty) FROM wms_movements`,
 * which the Σmovements==stock ledger gate proves equals Σ wms_stock over
 * every status — the KPI-side projection of「movements 是唯一库存真相」.
 * @param movements - the dated movements ledger.
 * @param asOf - the calc date (legs dated after it stay out).
 * @returns the net quantity (0 when the ledger starts after asOf — an empty ledger is a value, not 不可算).
 */
export function replayQtyOf(movements: ReadonlyArray<KpiMovement>, asOf: string): number {
  return q4(movements.reduce((total, move) => total + (move.biz_date <= asOf ? move.qty : 0), 0))
}

/**
 * The WIP line-side quantity as of a date — Σ qty over legs touching the
 * SH-WIP zone bins (ISSUE_WIP 入线边正腿 − RETURN_WIP 出线边负腿的净额).
 * Today's value equals Σ wms_stock.qty_on_hand over the WIP zone's bins.
 * @param movements - the dated movements ledger (wip_leg pre-resolved).
 * @param asOf - the calc date.
 * @returns the line-side net quantity (0 before the first WIP leg).
 */
export function replayWipQtyOf(movements: ReadonlyArray<KpiMovement>, asOf: string): number {
  return q4(movements.reduce((total, move) => total + (move.wip_leg && move.biz_date <= asOf ? move.qty : 0), 0))
}

/**
 * The occupied capital as of a date — Σ per-product replayed net quantity ×
 * the product's current moving-average cost. 成本=现值口径: historical cost
 * re-derivation is out of scope and the snapshot note says so.
 * @param movements - the dated movements ledger.
 * @param vwapByProduct - the per-product current moving-average unit cost.
 * @param asOf - the calc date.
 * @returns the capital sum (replayed quantity × current VWAP).
 */
export function replayCapitalOf(movements: ReadonlyArray<KpiMovement>, vwapByProduct: ReadonlyMap<number, number>, asOf: string): number {
  const qtyByProduct = new Map<number, number>()
  for (const move of movements) {
    if (move.biz_date > asOf) continue
    qtyByProduct.set(move.product_id, (qtyByProduct.get(move.product_id) ?? 0) + move.qty)
  }
  return q4([...qtyByProduct.entries()].reduce((total, [productId, qty]) => total + qty * (vwapByProduct.get(productId) ?? 0), 0))
}

/**
 * Whether a date is its month's last day — the monthly-grain codes' row
 * anchor (a turnover row lands only on month-end calc dates).
 * @param date - the calc date (YYYY-MM-DD).
 * @returns true when the next day falls in another month.
 */
export function isMonthEnd(date: string): boolean {
  return monthOf(isoAddDays(date, 1)) !== monthOf(date)
}

/**
 * The day count of a YYYY-MM period (the turnover-days numerator).
 * @param period - the YYYY-MM month key.
 * @returns the calendar day count of that month.
 */
export function daysInMonth(period: string): number {
  const year = Number(period.slice(0, 4))
  const month = Number(period.slice(5, 7))
  return new Date(Date.UTC(year, month, 0)).getUTCDate()
}

/**
 * 呆滞库存占比 — 库龄>90 天的良品金额 / 良品总金额 (D3d). 库龄 anchors on
 * the lot's earliest receipt date (wms_receipts.received_at via lot_no) —
 * the W2-B3 biz_date column is the ledger's replay clock, not a lot-aging
 * source, so receipts stay the only aging truth; stock rows without a
 * receipt anchor stay out of the numerator only.
 * Reconciliation SQL:
 *   WITH aging AS (SELECT s.qty_on_hand * p.unit_price AS amt, current_date - max(r.received_at) AS age
 *                  FROM wms_stock s JOIN hub_inv_products p ON p.id = s.product_id
 *                  LEFT JOIN wms_lots l ON l.id = s.lot_id
 *                  LEFT JOIN wms_receipts r ON r.lot_no = l.lot_no
 *                  WHERE s.status='good' GROUP BY s.id, p.unit_price, s.qty_on_hand, l.lot_no)
 *   SELECT sum(amt) FILTER (WHERE age > 90) / sum(amt) FROM aging;
 * @param rows - the good stock rows as of the calc date (receipt anchors ≤ asOf only).
 */
export function deadStockRatioOf(rows: readonly StockFact[], asOf: string): number | null {
  const total = rows.reduce((total, row) => total + row.qty_on_hand * Number(row.unit_price ?? 0), 0)
  if (total <= 0) return null
  const dead = rows.filter(row => row.lot_receipt_date !== null && row.lot_receipt_date !== '' && dayDiff(asOf, row.lot_receipt_date!) > 90)
    .reduce((total, row) => total + row.qty_on_hand * Number(row.unit_price ?? 0), 0)
  return q4(dead / total)
}

/**
 * 临期预警数 — 良品在架批次数 with 0 ≤ (expiry_date − asOf) < 30 (the D3d
 * remaining-shelf-life window; expired lots count too — they are the
 * loudest alert).
 * Reconciliation SQL:
 *   SELECT count(DISTINCT s.lot_id) FROM wms_stock s JOIN wms_lots l ON l.id = s.lot_id
 *   WHERE s.status='good' AND l.expiry_date IS NOT NULL AND l.expiry_date < :d + 30;
 */
export function expiryAlertsOf(rows: readonly StockFact[], asOf: string): number | null {
  const lots = new Set(rows
    .filter(row => row.expiry_date !== null && row.expiry_date !== '' && dayDiff(row.expiry_date!, asOf) < 30)
    .map((row, index) => row.lot_no !== null && row.lot_no !== '' ? row.lot_no : `${String(row.expiry_date)}#${String(index)}`))
  return lots.size
}

// ─── the KPI definition table (board pages read these codes) ───

/** The fact bundle one calc pass runs over (rows fetched once per run). */
export interface KpiFacts {
  readonly soOrders: ReadonlyArray<SoFact & { id: number; code: string }>
  readonly soLines: ReadonlyArray<{ order_id: number; qty: number; unit_price: number | null; qty_shipped: number | null }>
  readonly receiptPairs: readonly ReceiptPair[]
  readonly jobReports: readonly ReportFact[]
  /** mfg_work_centers row count (the capacity-utilization denominator's per-center factor). */
  readonly workCenterCount: number
  /** OQC inspection rows' KPI slice (lot_pass_rate's numerator/denominator source). */
  readonly oqcInspections: ReadonlyArray<{ inspected_at: string | null; result: string }>
  readonly counts: readonly CountFact[]
  readonly stock: readonly StockFact[]
  readonly mos: ReadonlyArray<{ id: number; code: string; qty: number; doc_status: string; need_date: string | null; actual_cost: number | null; completed_at: string | null; planned_end: string | null }>
  /** mfg_completions rows (the completion-time truth source mfg_orders lacks). */
  readonly completions: ReadonlyArray<{ mo_id: number; completed_at: string | null }>
  readonly payments: ReadonlyArray<{ amount: number | null; paid_at: string | null }>
  /** W2-B7: purchase invoices' AP slice (ap_balance's confirmation anchor). */
  readonly purInvoices: ReadonlyArray<{ invoice_amount: number | null; billed_at: string | null; match_result: string }>
  /** W2-B7: purchase payments' AP slice (ap_balance's outflow anchor — approved rows only). */
  readonly purPayments: ReadonlyArray<{ amount: number | null; pay_date: string | null; doc_status: string }>
  readonly openTodos: ReadonlyArray<{ status: string }>
  readonly reorderOpen: ReadonlyArray<{ status: string }>
  readonly poLines: ReadonlyArray<{ order_id: number; qty: number; qty_received: number; po_status: string }>
  /** W2-B4: the dated movements ledger (the three inventory stock codes' replay source). */
  readonly movements: ReadonlyArray<KpiMovement>
  /** W2-B4: per-product current moving-average unit cost (capital_occupied's 现值口径). */
  readonly vwapByProduct: ReadonlyMap<number, number>
  /** W2-B4: the monthly-balance snapshot rows (the two turnover codes' source). */
  readonly monthlyBalances: ReadonlyArray<{ period: string; opening_val: number; out_val: number; bal_val: number }>
}

/** A completed MO's effective completion date: its latest completion row's date. */
function moCompletedAt(facts: KpiFacts, moId: number): string | null {
  const dated = facts.completions.filter(row => Number(row.mo_id) === moId && row.completed_at !== null && row.completed_at !== '').map(row => String(row.completed_at))
  return dated.length === 0 ? null : dated.reduce((max, value) => value > max ? value : max, dated[0]!)
}

/** One materialized kpi_snapshots row value. */
interface KpiValue { readonly dim: string | null; readonly value: number | null }

/** One KPI's declaration: identity, wording, and the pure computation. */
interface KpiDef {
  readonly board: 'business' | 'supply' | 'production' | 'inventory'
  readonly code: string
  readonly name: string
  readonly unit: 'percent' | 'count' | 'money' | 'days' | 'qty'
  /** The psql reconciliation note the snapshot row carries (the dashboard's口径 column). */
  readonly note: string
  /**
   * Compute the global value for one date. A null return skips the row
   * entirely (a monthly-grain code off its month-end anchor, or a month
   * without a wms_monthly_balances snapshot); a KpiValue carrying value=null
   * still materializes (不可算 rows keep the 90-day continuity count).
   */
  readonly compute: (facts: KpiFacts, asOf: string) => KpiValue | null
  /** Optional dimension rows (per-supplier etc.) materialized alongside the global row. */
  readonly dims?: (facts: KpiFacts, asOf: string) => ReadonlyArray<KpiValue>
}

const monthOf = (date: string): string => date.slice(0, 7)

/** Whether a date column value exists and sits on or before asOf. */
const by = (value: string | null | undefined, asOf: string): boolean => value !== null && value !== undefined && value !== '' && value <= asOf

/**
 * The turnover pair's inputs for a calc date: only a month-end date whose
 * month carries wms_monthly_balances rows yields inputs (null = this date
 * gets no row). avg is the (opening+bal)/2 average-inventory denominator.
 */
function turnoverInputsOf(facts: KpiFacts, asOf: string): { out: number, avg: number } | null {
  if (!isMonthEnd(asOf)) return null
  const rows = facts.monthlyBalances.filter(row => row.period === monthOf(asOf))
  if (rows.length === 0) return null
  const out = rows.reduce((total, row) => total + row.out_val, 0)
  const avg = (rows.reduce((total, row) => total + row.opening_val, 0) + rows.reduce((total, row) => total + row.bal_val, 0)) / 2
  return { out, avg }
}

/**
 * The 24 core KPI codes (4 boards × 5-8 each). Every entry's compute is a
 * pure function of the fact bundle and the calc date; the psql 口径 rides
 * the note into the snapshot row so the dashboard shows it next to the
 * number.
 */
export const KPI_DEFS: readonly KpiDef[] = [
  {
    board: 'business', code: 'pending_approvals', name: '待审批数', unit: 'count',
    note: 'SELECT count(*) FROM wfl_approval_todos WHERE status=\'open\'',
    compute: facts => ({ dim: null, value: facts.openTodos.filter(row => row.status === 'open').length }),
  },
  {
    board: 'business', code: 'revenue_monthly', name: '当月确认收入', unit: 'money',
    note: "SELECT sum(amount) FROM so_orders WHERE doc_status='approved' AND approved_at::text LIKE :month || '%'",
    compute: (facts, asOf) => ({
      dim: null,
      value: q4(facts.soOrders.filter(row => row.doc_status === 'approved' && by(row.approved_at, asOf) && monthOf(row.approved_at!) === monthOf(asOf))
        .reduce((total, row) => total + Number(row.amount ?? 0), 0)),
    }),
  },
  {
    board: 'business', code: 'gross_margin', name: '毛利率', unit: 'percent',
    note: "当月 approved SO 金额 − 当月完工 MO actual_cost，除以当月 SO 金额（完工月锚=该 MO mfg_completions.completed_at 最大值）",
    compute: (facts, asOf) => {
      const revenue = facts.soOrders.filter(row => row.doc_status === 'approved' && by(row.approved_at, asOf) && monthOf(row.approved_at!) === monthOf(asOf))
        .reduce((total, row) => total + Number(row.amount ?? 0), 0)
      const cost = facts.mos
        .filter(row => row.doc_status === 'completed')
        .map(row => ({ cost: Number(row.actual_cost ?? 0), done: moCompletedAt(facts, row.id) }))
        .filter(row => row.done !== null && by(row.done, asOf) && monthOf(row.done) === monthOf(asOf))
        .reduce((total, row) => total + row.cost, 0)
      if (revenue <= 0) return { dim: null, value: null }
      return { dim: null, value: q4((revenue - cost) / revenue) }
    },
  },
  {
    board: 'business', code: 'collection_rate', name: '回款率', unit: 'percent',
    note: 'Σ crm_payments.amount（paid_at ≤ 日）÷ Σ so_orders.amount（approved 且 need_date ≤ 日）',
    compute: (facts, asOf) => {
      const due = facts.soOrders.filter(row => row.doc_status === 'approved' && by(row.approved_at, asOf) && row.need_date !== null && row.need_date! <= asOf)
        .reduce((total, row) => total + Number(row.amount ?? 0), 0)
      if (due <= 0) return { dim: null, value: null }
      const paid = facts.payments.filter(row => by(row.paid_at, asOf)).reduce((total, row) => total + Number(row.amount ?? 0), 0)
      return { dim: null, value: q4(paid / due) }
    },
  },
  {
    board: 'business', code: 'ar_balance', name: '应收余额', unit: 'money',
    note: 'Σ approved so_orders.amount（approved_at ≤ 日）− Σ crm_payments.amount（paid_at ≤ 日）',
    compute: (facts, asOf) => ({
      dim: null,
      value: q4(
        facts.soOrders.filter(row => row.doc_status === 'approved' && by(row.approved_at, asOf)).reduce((total, row) => total + Number(row.amount ?? 0), 0)
        - facts.payments.filter(row => by(row.paid_at, asOf)).reduce((total, row) => total + Number(row.amount ?? 0), 0),
      ),
    }),
  },
  {
    // W2-B7: the ar_balance mirror on the payable side — confirmed invoices
    // are the AP confirmation state (match_result=confirmed opens payments),
    // approved pur_payments are the settled outflow. 业务台账口径，非会计核算
    // (PLAN D11 keeps the general ledger out of scope).
    board: 'business', code: 'ap_balance', name: '应付余额', unit: 'money',
    note: 'Σ confirmed pur_invoices.invoice_amount（billed_at ≤ 日）− Σ pur_payments.amount（doc_status=approved 且 pay_date ≤ 日）——业务台账口径，非会计核算（D11）',
    compute: (facts, asOf) => ({
      dim: null,
      value: q4(
        facts.purInvoices.filter(row => row.match_result === 'confirmed' && by(row.billed_at, asOf)).reduce((total, row) => total + Number(row.invoice_amount ?? 0), 0)
        - facts.purPayments.filter(row => row.doc_status === 'approved' && by(row.pay_date, asOf)).reduce((total, row) => total + Number(row.amount ?? 0), 0),
      ),
    }),
  },
  {
    board: 'supply', code: 'otif', name: '准时足量交付率', unit: 'percent',
    note: "count(*) FILTER (WHERE shipping_status='shipped' AND shipped_at <= need_date) ÷ count(*) FROM so_orders WHERE doc_status='approved' AND need_date IS NOT NULL（approved_at/shipped_at ≤ 日）",
    compute: (facts, asOf) => ({ dim: null, value: otifOf(facts.soOrders.filter(row => by(row.approved_at, asOf) && (row.shipped_at === null || row.shipped_at === '' || row.shipped_at <= asOf))) }),
  },
  {
    board: 'supply', code: 'otd_supplier', name: '供应商准时到货率', unit: 'percent',
    note: 'count(*) FILTER (WHERE r.received_at <= p.need_date) ÷ count(*) FROM wms_receipts r JOIN pur_orders p ON p.id=r.po_id（received_at ≤ 日，need_date 非空）；dim=供应商同口径',
    compute: (facts, asOf) => ({ dim: null, value: otdSupplierOf(facts.receiptPairs.filter(pair => by(pair.received_at, asOf))) }),
    dims: (facts, asOf) => {
      const bySupplier = new Map<string, ReceiptPair[]>()
      for (const pair of facts.receiptPairs.filter(pair => by(pair.received_at, asOf))) {
        const key = pair.supplier_name ?? '（未登记供应商）'
        bySupplier.set(key, [...(bySupplier.get(key) ?? []), pair])
      }
      return [...bySupplier.entries()].map(([dim, pairs]) => ({ dim, value: otdSupplierOf(pairs) }))
    },
  },
  {
    board: 'supply', code: 'po_lead_p50', name: '采购提前期P50(天)', unit: 'days',
    note: 'percentile_cont(0.5) OVER (r.received_at − p.approved_at) FROM wms_receipts r JOIN pur_orders p ON p.id=r.po_id（received_at ≤ 日）',
    compute: (facts, asOf) => ({ dim: null, value: leadPercentileOf(facts.receiptPairs.filter(pair => by(pair.received_at, asOf)), 0.5) }),
  },
  {
    board: 'supply', code: 'po_lead_p90', name: '采购提前期P90(天)', unit: 'days',
    note: 'percentile_cont(0.9) OVER (r.received_at − p.approved_at) FROM wms_receipts r JOIN pur_orders p ON p.id=r.po_id（received_at ≤ 日）',
    compute: (facts, asOf) => ({ dim: null, value: leadPercentileOf(facts.receiptPairs.filter(pair => by(pair.received_at, asOf)), 0.9) }),
  },
  {
    board: 'supply', code: 'shortage_alerts', name: '缺料预警数', unit: 'count',
    note: "SELECT count(*) FROM wms_reorder_suggestions WHERE status='open'",
    compute: facts => ({ dim: null, value: facts.reorderOpen.filter(row => row.status === 'open').length }),
  },
  {
    board: 'supply', code: 'inbound_lines', name: '在途采购单行', unit: 'count',
    note: "SELECT count(*) FROM pur_order_lines l JOIN pur_orders p ON p.id=l.order_id WHERE p.doc_status='approved' AND l.qty > l.qty_received",
    compute: facts => ({ dim: null, value: facts.poLines.filter(row => row.po_status === 'approved' && row.qty > row.qty_received + 1e-9).length }),
  },
  {
    board: 'production', code: 'capacity_util', name: '产能利用率', unit: 'percent',
    note: 'Σ mfg_job_reports.duration_min（posted，report_date ≤ 日）÷（工作中心数 × 480 分 × 当月第 N 天）——8h/日铭牌、自然日历估算口径',
    compute: (facts, asOf) => {
      const minutes = facts.jobReports.filter(row => row.status === 'posted' && by(row.report_date, asOf) && monthOf(row.report_date!) === monthOf(asOf))
        .reduce((total, row) => total + Number(row.duration_min ?? 0), 0)
      const dayOfMonth = Number(asOf.slice(8, 10))
      // 8h/日铭牌 × 工作中心数 × 当月第 N 天（workCenterCount 由 fetchFacts 并行携带）。
      const capacity = Math.max(1, facts.workCenterCount) * 480 * dayOfMonth
      return { dim: null, value: q4(minutes / capacity) }
    },
  },
  {
    board: 'production', code: 'fpy', name: '一次合格率', unit: 'percent',
    note: "SELECT sum(qty_good)::float / sum(qty_good + qty_scrap) FROM mfg_job_reports WHERE status='posted' AND report_date <= :d",
    compute: (facts, asOf) => ({ dim: null, value: fpyOf(facts.jobReports.filter(row => by(row.report_date, asOf))) }),
  },
  {
    board: 'production', code: 'rty', name: '滚动合格率', unit: 'percent',
    note: "∏ per-op_seq sum(qty_good)/sum(qty_good+qty_scrap) FROM mfg_job_reports WHERE status='posted' AND report_date <= :d（exp(sum(ln(fpy))) 同值）",
    compute: (facts, asOf) => ({ dim: null, value: rtyOf(facts.jobReports.filter(row => by(row.report_date, asOf))) }),
  },
  {
    board: 'production', code: 'schedule_hit', name: '计划达成率', unit: 'percent',
    note: "count(*) FILTER (WHERE 完工日 <= need_date) ÷ count(*) FROM mfg_orders m WHERE doc_status='completed' AND need_date IS NOT NULL（完工日=max(mfg_completions.completed_at)，≤ 计算日）",
    compute: (facts, asOf) => {
      const done = facts.mos
        .filter(row => row.doc_status === 'completed' && row.need_date !== null && row.need_date !== '')
        .map(row => ({ need: row.need_date!, done: moCompletedAt(facts, row.id) }))
        .filter(row => row.done !== null && by(row.done, asOf))
      if (done.length === 0) return { dim: null, value: null }
      return { dim: null, value: q4(done.filter(row => row.done! <= row.need).length / done.length) }
    },
  },
  {
    board: 'production', code: 'lot_pass_rate', name: '批次合格率', unit: 'percent',
    note: "count(*) FILTER (WHERE result IN ('passed','concession')) ÷ count(*) FILTER (WHERE result IS NOT NULL AND result <> 'pending') FROM qm_inspections WHERE insp_type='OQC'（inspected_at ≤ 日；已判定批口径——pending 未判定批不入分母，让步接收计入接收批）",
    compute: (facts, asOf) => {
      const judged = facts.oqcInspections
        .filter(row => by(row.inspected_at, asOf) && row.result !== '' && row.result !== 'pending' && row.result !== 'null')
      if (judged.length === 0) return { dim: null, value: null }
      return { dim: null, value: q4(judged.filter(row => row.result === 'passed' || row.result === 'concession').length / judged.length) }
    },
  },
  {
    board: 'inventory', code: 'dead_stock_ratio', name: '呆滞库存占比', unit: 'percent',
    note: '库龄>90 天良品金额 ÷ 良品总金额（库龄=日 − 批次最早收货日 wms_receipts.received_at，经 wms_lots.lot_no 关联）',
    compute: (facts, asOf) => ({ dim: null, value: deadStockRatioOf(facts.stock.filter(row => row.lot_receipt_date === null || row.lot_receipt_date === '' || row.lot_receipt_date <= asOf), asOf) }),
  },
  {
    board: 'inventory', code: 'expiry_alerts', name: '临期预警批次数', unit: 'count',
    note: '良品在架批次 expiry_date − 日 < 30 的去重批次数（wms_stock JOIN wms_lots）',
    compute: (facts, asOf) => ({ dim: null, value: expiryAlertsOf(facts.stock, asOf) }),
  },
  {
    board: 'inventory', code: 'count_accuracy', name: '账实相符率', unit: 'percent',
    note: '1 − Σ|counted_qty − snapshot_qty| ÷ Σsnapshot_qty FROM wms_counts WHERE counted_qty IS NOT NULL（盘点日 W2-B3 起取 biz_date 列，CNT-YYYYMMDD 编码解析降级为列缺失兜底）',
    compute: (facts, asOf) => ({ dim: null, value: countAccuracyOf(facts.counts.filter(row => { const date = countRowDateOf(row); return date === '' || date <= asOf })) }),
  },
  {
    board: 'inventory', code: 'capital_occupied', name: '库存资金占用', unit: 'money',
    note: 'W2-B4 重放口径：Σ_product 重放净量（biz_date ≤ 日，wms_movements）× 现值移动加权 movingAverageCost——成本=现值口径，历史成本回算超范围（W 轮 Σ good stock × 主档单价口径已弃）',
    compute: (facts, asOf) => ({ dim: null, value: replayCapitalOf(facts.movements, facts.vwapByProduct, asOf) }),
  },
  {
    board: 'inventory', code: 'wip_qty', name: '线边在制数量', unit: 'qty',
    note: 'W2-B4 重放口径：Σ wms_movements.qty WHERE biz_date ≤ 日 且腿触 SH-WIP 线边库位（ISSUE_WIP 入腿 − 退料/完工出腿净额；= Σ wms_stock WHERE bin 在 SH-WIP 库区；W 轮 MO released/in_progress qty 口径已弃）',
    compute: (facts, asOf) => ({ dim: null, value: replayWipQtyOf(facts.movements, asOf) }),
  },
  {
    board: 'inventory', code: 'on_hand_qty', name: '在库数量', unit: 'qty',
    note: 'W2-B4 重放口径：SELECT sum(qty) FROM wms_movements WHERE biz_date ≤ :d（全库位净额=Σ wms_stock 全状态，账实门禁的 KPI 投影；与 W 轮 good 行求和口径的差异构成=待检+线边+seed 无库区腿，见 W2-B4 Agent Note）',
    compute: (facts, asOf) => ({ dim: null, value: replayQtyOf(facts.movements, asOf) }),
  },
  {
    board: 'inventory', code: 'inv_turnover_rate', name: '库存周转率', unit: 'count',
    note: 'W2-B4：当月 out_val ÷ ((Σopening_val+Σbal_val)/2) FROM wms_monthly_balances WHERE period=当月（运营口径=移动加权出库成本，非财务 COGS——研究报告开放问题 4 的口径声明；月度粒度 dim=period 仅月末落行，无快照月不落行；分母 0 → null）',
    compute: (facts, asOf) => {
      const inputs = turnoverInputsOf(facts, asOf)
      if (inputs === null) return null
      if (inputs.avg <= 0) return { dim: 'period', value: null }
      return { dim: 'period', value: q4(inputs.out / inputs.avg) }
    },
  },
  {
    board: 'inventory', code: 'inv_turnover_days', name: '库存周转天数', unit: 'days',
    note: 'W2-B4：当月天数 ÷ inv_turnover_rate（同 wms_monthly_balances 移动加权口径；rate=0 或 null → null 不产 Inf；月度粒度 dim=period 仅月末落行）',
    compute: (facts, asOf) => {
      const inputs = turnoverInputsOf(facts, asOf)
      if (inputs === null) return null
      if (inputs.avg <= 0) return { dim: 'period', value: null }
      const rate = inputs.out / inputs.avg
      if (rate <= 0) return { dim: 'period', value: null }
      return { dim: 'period', value: q4(daysInMonth(monthOf(asOf)) / rate) }
    },
  },
]

/**
 * The KPI codes whose present-day value rides only present-day state —
 * process-scoped counts (open todos, open alerts, in-transit PO lines): a
 * day-by-day replay of「what was open then」 is not reconstructible from
 * the durable rows. W2-B4 moved the three inventory stock codes out (they
 * replay from wms_movements.biz_date); these three stay present-only.
 */
const PRESENT_ONLY = new Set(['pending_approvals', 'shortage_alerts', 'inbound_lines'])

// ─── REST layer ───

/**
 * The truncation gate every list read passes: a first page shorter than
 * meta.total (or exactly pageSize long when the server reports no total)
 * means the read is partial — throw rather than let a calc pass reconcile
 * against half a truth.
 * @param collection - the collection name, for the error message.
 * @param rowCount - the row count the page actually returned.
 * @param total - the server's meta.total, when present.
 * @param pageSize - the requested page size.
 */
export function assertFullPage(collection: string, rowCount: number, total: unknown, pageSize: number): void {
  if (typeof total === 'number' ? total > rowCount : rowCount === pageSize) {
    throw new Error(`${collection}:list returned ${String(rowCount)} of ${String(total)} rows (pageSize=${String(pageSize)}); raise the page size or paginate`)
  }
}

/** Fail-closed collection read (see {@link assertFullPage}). */
async function rowsOf(token: string, collection: string, pageSize = 500): Promise<Array<Record<string, any>>> {
  const payload = await call(token, 'GET', `/api/${collection}:list?pageSize=${pageSize}`)
  const rows = (payload?.data ?? null) as Array<Record<string, any>> | null
  if (rows === null) return []
  assertFullPage(collection, rows.length, payload?.meta?.total, pageSize)
  return rows
}

/** Fetch every source collection once (a backfill run reuses this bundle). */
export async function fetchFacts(token: string): Promise<KpiFacts> {
  const [soOrders, soLines, receipts, pos, jobReports, counts, stock, lots, products, mos, payments, todos, reorders, poLines, workCenters, oqc, completions, movements, bins, zones, monthlyBalances, purInvoices, purPayments] = await Promise.all([
    rowsOf(token, 'so_orders'), rowsOf(token, 'so_order_lines'), rowsOf(token, 'wms_receipts'), rowsOf(token, 'pur_orders'),
    rowsOf(token, 'mfg_job_reports'), rowsOf(token, 'wms_counts'), rowsOf(token, 'wms_stock', 1000), rowsOf(token, 'wms_lots'),
    rowsOf(token, 'hub_inv_products', 200), rowsOf(token, 'mfg_orders'), rowsOf(token, 'crm_payments'), rowsOf(token, 'wfl_approval_todos'),
    rowsOf(token, 'wms_reorder_suggestions'), rowsOf(token, 'pur_order_lines'), rowsOf(token, 'mfg_work_centers'), rowsOf(token, 'qm_inspections'),
    rowsOf(token, 'mfg_completions'),
    rowsOf(token, 'wms_movements', 1000), rowsOf(token, 'wms_bins', 200), rowsOf(token, 'wms_zones'), rowsOf(token, 'wms_monthly_balances', 1000),
    // W2-B7: the AP pair (ap_balance's sources).
    rowsOf(token, 'pur_invoices'), rowsOf(token, 'pur_payments'),
  ])
  const posById = new Map(pos.map(row => [Number(row.id), row]))
  const lotsById = new Map(lots.map(row => [Number(row.id), row]))
  const productsById = new Map(products.map(row => [Number(row.id), row]))
  const suppliers = await rowsOf(token, 'srm_suppliers')
  const suppliersById = new Map(suppliers.map(row => [Number(row.id), row]))
  const receiptDateByLot = new Map<string, string>()
  for (const receipt of receipts) {
    const lotNo = String(receipt.lot_no ?? '')
    if (lotNo === '' || receipt.received_at === null || receipt.received_at === undefined) continue
    const known = receiptDateByLot.get(lotNo)
    if (known === undefined || String(receipt.received_at) < known) receiptDateByLot.set(lotNo, String(receipt.received_at))
  }
  // W2-B4: the dated movements ledger — the three stock codes' replay
  // source. A row without biz_date means the B3 backfill never ran: fail
  // loud rather than replay a half-truth (undated legs would leak into
  // every historical day's net).
  const undated = movements.filter(row => String(row.biz_date ?? '') === '')
  if (undated.length > 0) {
    throw new Error(`wms_movements ${String(undated.length)} 行无 biz_date（先跑 nocobase-h5-wms.mts --backfill-dates）——KPI 重放拒绝半账（样例 ${String(undated[0]?.doc_no ?? '')}）`)
  }
  const wipZoneId = zones.find(row => String(row.code) === WIP_ZONE_CODE)?.id
  if (wipZoneId === undefined) throw new Error(`WIP 线边库区 ${WIP_ZONE_CODE} 缺失——重跑 nocobase-h5-wms.mts 补 B6 虚拟库位种子`)
  const wipBinIds = new Set(bins.filter(row => Number(row.zone_id) === wipZoneId).map(row => Number(row.id)))
  const movementFacts: KpiMovement[] = movements.map(row => ({
    id: Number(row.id), product_id: Number(row.product_id), qty: Number(row.qty ?? 0),
    biz_date: String(row.biz_date ?? '').slice(0, 10),
    wip_leg: wipBinIds.has(Number(row.to_bin_id)) || wipBinIds.has(Number(row.from_bin_id)),
  }))
  // W2-B4: per-product current moving-average cost — the engine's single
  // implementation (h5 movingAverageCost) stays authoritative so a
  // price-rule change cannot fork between the ledger and the KPI.
  const vwapByProduct = new Map<number, number>()
  for (const productId of new Set(movementFacts.map(move => move.product_id))) {
    vwapByProduct.set(productId, await movingAverageCost(token, productId))
  }
  return {
    soOrders: soOrders.map(row => ({
      id: Number(row.id), code: String(row.code ?? ''), doc_status: String(row.doc_status ?? ''), need_date: row.need_date ?? null,
      shipping_status: String(row.shipping_status ?? ''), shipped_at: row.shipped_at ?? null, approved_at: row.approved_at ?? null,
      amount: row.amount === null || row.amount === undefined ? null : Number(row.amount),
    })),
    soLines: soLines.map(row => ({ order_id: Number(row.order_id), qty: Number(row.qty ?? 0), unit_price: row.unit_price === null || row.unit_price === undefined ? null : Number(row.unit_price), qty_shipped: row.qty_shipped === null || row.qty_shipped === undefined ? null : Number(row.qty_shipped) })),
    receiptPairs: receipts.map(receipt => {
      const po = posById.get(Number(receipt.po_id))
      const lot = lotsById.get(Number(receipt.lot_id))
      const supplier = suppliersById.get(Number(lot?.supplier_id ?? receipt.supplier_id ?? 0))
      return {
        receipt_no: String(receipt.receipt_no ?? ''), received_at: receipt.received_at ?? null,
        po_need_date: po?.need_date ?? null, po_approved_at: po?.approved_at ?? null,
        supplier_name: supplier?.name === undefined || supplier === undefined ? null : String(supplier.name),
      }
    }),
    jobReports: jobReports.map(row => ({
      op_seq: row.op_seq === null || row.op_seq === undefined ? null : Number(row.op_seq), report_date: row.report_date ?? null,
      status: String(row.status ?? ''), qty_good: row.qty_good === null || row.qty_good === undefined ? null : Number(row.qty_good),
      qty_scrap: row.qty_scrap === null || row.qty_scrap === undefined ? null : Number(row.qty_scrap),
      duration_min: row.duration_min === null || row.duration_min === undefined ? null : Number(row.duration_min),
    })),
    counts: counts.map(row => ({
      count_no: String(row.count_no ?? ''),
      biz_date: row.biz_date === null || row.biz_date === undefined || String(row.biz_date) === '' ? null : String(row.biz_date).slice(0, 10),
      snapshot_qty: row.snapshot_qty === null || row.snapshot_qty === undefined ? null : Number(row.snapshot_qty),
      counted_qty: row.counted_qty === null || row.counted_qty === undefined ? null : Number(row.counted_qty),
    })),
    stock: stock.filter(row => String(row.status) === 'good').map(row => {
      const product = productsById.get(Number(row.product_id))
      const lot = lotsById.get(Number(row.lot_id))
      return {
        qty_on_hand: Number(row.qty_on_hand ?? 0), status: 'good',
        unit_price: product?.unit_price === null || product?.unit_price === undefined || product === undefined ? null : Number(product.unit_price),
        lot_receipt_date: lot === undefined ? null : receiptDateByLot.get(String(lot.lot_no ?? '')) ?? null,
        expiry_date: lot?.expiry_date ?? null,
        lot_no: lot === undefined ? null : String(lot.lot_no ?? ''),
      }
    }),
    mos: mos.map(row => ({
      id: Number(row.id), code: String(row.code ?? ''), qty: Number(row.qty ?? 0), doc_status: String(row.doc_status ?? ''),
      need_date: row.need_date ?? null, actual_cost: row.actual_cost === null || row.actual_cost === undefined ? null : Number(row.actual_cost),
      completed_at: row.completed_at ?? null, planned_end: row.planned_end ?? null,
    })),
    payments: payments.map(row => ({ amount: row.amount === null || row.amount === undefined ? null : Number(row.amount), paid_at: row.paid_at ?? null })),
    purInvoices: purInvoices.map(row => ({ invoice_amount: row.invoice_amount === null || row.invoice_amount === undefined ? null : Number(row.invoice_amount), billed_at: row.billed_at ?? null, match_result: String(row.match_result ?? '') })),
    purPayments: purPayments.map(row => ({ amount: row.amount === null || row.amount === undefined ? null : Number(row.amount), pay_date: row.pay_date ?? null, doc_status: String(row.doc_status ?? '') })),
    openTodos: todos.map(row => ({ status: String(row.status ?? '') })),
    reorderOpen: reorders.map(row => ({ status: String(row.status ?? '') })),
    poLines: poLines.map(row => {
      const po = posById.get(Number(row.order_id))
      return { order_id: Number(row.order_id), qty: Number(row.qty ?? 0), qty_received: Number(row.qty_received ?? 0), po_status: String(po?.doc_status ?? '') }
    }),
    completions: completions.map(row => ({ mo_id: Number(row.mo_id), completed_at: row.completed_at ?? null })),
    workCenterCount: workCenters.length,
    oqcInspections: oqc.filter(row => String(row.insp_type ?? '') === 'OQC').map(row => ({ inspected_at: row.inspected_at ?? null, result: String(row.result ?? '') })),
    movements: movementFacts,
    vwapByProduct,
    monthlyBalances: monthlyBalances.map(row => ({
      period: String(row.period ?? ''),
      opening_val: Number(row.opening_val ?? 0), out_val: Number(row.out_val ?? 0), bal_val: Number(row.bal_val ?? 0),
    })),
  }
}

/** One calc pass's per-date summary (rows written per code, global + dims). */
export interface CalcDayResult { readonly date: string; readonly rows: number; readonly valued: number }

/**
 * Materialize one date's kpi_snapshots rows: every KPI code writes its
 * global row (value null when the date has no computable truth) plus the
 * dimension rows, replacing any earlier pass for the same date (idempotent
 * per date+code+dim).
 * @param token - the root API token.
 * @param facts - the fetched fact bundle.
 * @param date - the calc date (YYYY-MM-DD).
 * @returns the written-row summary.
 */
export async function calcDayWith(token: string, facts: KpiFacts, date: string): Promise<CalcDayResult> {
  let rows = 0
  let valued = 0
  for (const def of KPI_DEFS) {
    const head = def.compute(facts, date)
    if (head === null) continue // monthly-grain anchor dates only — no row, no destroy
    const values = [head, ...(def.dims?.(facts, date) ?? [])] as ReadonlyArray<KpiValue>
    for (const entry of values) {
      // Present-only KPIs materialize null before today (process counts
      // carry no reconstructible history) — the row stays so the
      // continuity count holds.
      const value = PRESENT_ONLY.has(def.code) && date < shanghaiDate() ? null : entry.value
      const filter = { kpi_code: def.code, calc_date: date, dim: entry.dim }
      await call(token, 'POST', `/api/kpi_snapshots:destroy?filter=${encodeURIComponent(JSON.stringify(filter))}&pageSize=100`)
      await dataOf(token, 'POST', '/api/kpi_snapshots:create', {
        board: def.board, kpi_code: def.code, kpi_name: def.name, unit: def.unit,
        dim: entry.dim, value, calc_date: date, note: def.note,
      })
      rows += 1
      if (value !== null) valued += 1
    }
  }
  return { date, rows, valued }
}

/** Fetch + materialize one date (the nightly cron body). */
export async function calcDay(token: string, date: string): Promise<CalcDayResult> {
  return await calcDayWith(token, await fetchFacts(token), date)
}

/** The backfill outcome the CLI prints. */
export interface BackfillResult { readonly days: number; readonly from: string; readonly to: string; readonly rows: number }

/**
 * Backfill the trailing N days (PLAN D9: 上线回算 90 天). One fetch, every
 * date materialized in order.
 * @param token - the root API token.
 * @param days - the window length (≥1).
 * @returns the run summary.
 */
export async function backfill(token: string, days = 90): Promise<BackfillResult> {
  if (!Number.isInteger(days) || days < 1) throw new Error(`回算天数需为正整数（收到 ${String(days)}）`)
  const today = shanghaiDate()
  const facts = await fetchFacts(token)
  let rows = 0
  for (let offset = days - 1; offset >= 0; offset -= 1) {
    const result = await calcDayWith(token, facts, isoAddDays(today, -offset))
    rows += result.rows
  }
  return { days, from: isoAddDays(today, -(days - 1)), to: today, rows }
}

// ─── the two-way traceability assertions (批次双向追溯) ───

/** One trace step's outcome line. */
interface TraceLink { readonly ok: boolean; readonly line: string }

/** Read the full up/down chain of one PO and one MO, asserting every link. */
async function traceAll(token: string, poCode: string, moCode: string): Promise<{ links: TraceLink[]; passed: boolean }> {
  const links: TraceLink[] = []
  const need = (ok: boolean, line: string): void => { links.push({ ok, line }) }
  const pos = await rowsOf(token, 'pur_orders')
  const po = pos.find(row => String(row.code) === poCode)
  if (po === undefined) {
    need(false, `PO ${poCode} 不存在`)
    return { links, passed: false }
  }
  const rfqs = await rowsOf(token, 'pur_rfqs')
  const quotes = await rowsOf(token, 'pur_quotes')
  const requests = await rowsOf(token, 'pur_requests')
  const receipts = await rowsOf(token, 'wms_receipts')
  const inspections = await rowsOf(token, 'qm_inspections')
  const lots = await rowsOf(token, 'wms_lots')
  const movements = await rowsOf(token, 'wms_movements', 1000)
  const invoices = await rowsOf(token, 'pur_invoices')
  const payments = await rowsOf(token, 'pur_payments')
  const suppliers = await rowsOf(token, 'srm_suppliers')

  // PO 向上：rfq → pr；报价挂 rfq（比价链）。
  const rfq = rfqs.find(row => Number(row.id) === Number(po.rfq_id))
  if (rfq === null || rfq === undefined) {
    need(po.rfq_id === null || po.rfq_id === undefined, `PO ${poCode} 无 RFQ 上游（rfq_id 空=直连订单，向上链止于此）`)
  } else {
    need(true, `PO ${poCode} → RFQ ${String(rfq.code)}（doc_status=${String(rfq.doc_status)}）`)
    const pr = requests.find(row => Number(row.id) === Number(rfq.pr_id))
    need(pr !== undefined, `RFQ ${String(rfq.code)} → PR ${String(pr?.code ?? String(rfq.pr_id))}`)
    const rfqQuotes = quotes.filter(row => Number(row.rfq_id) === Number(rfq.id))
    need(rfqQuotes.length >= 1, `RFQ ${String(rfq.code)} 报价 ${String(rfqQuotes.length)} 条（比价链）`)
  }

  // PO 向下：收货 → IQC → 批次 → 发票 → 付款。
  const poReceipts = receipts.filter(row => Number(row.po_id) === Number(po.id))
  need(poReceipts.length >= 1, `PO ${poCode} → 收货 ${String(poReceipts.length)} 单（${poReceipts.map(row => String(row.receipt_no)).join('、')}）`)
  for (const receipt of poReceipts) {
    const iqcs = inspections.filter(row => String(row.ref_no) === String(receipt.receipt_no))
    need(iqcs.length >= 1, `收货 ${String(receipt.receipt_no)} → IQC ${String(iqcs.length)} 单（判定 ${iqcs.map(row => String(row.result)).join('/')}）`)
    const lot = lots.find(row => String(row.lot_no) === String(receipt.lot_no))
    need(lot !== undefined, `收货 ${String(receipt.receipt_no)} → 批次 ${String(receipt.lot_no)}（四日期 ${String(lot?.production_date ?? '')}/${String(lot?.expiry_date ?? '')}）`)
  }
  const receiptNos = new Set(poReceipts.map(row => String(row.receipt_no)))
  const putawayLegs = movements.filter(row => receiptNos.has(String(row.doc_no)) || String(row.doc_no) === poCode)
  need(putawayLegs.length >= poReceipts.length, `收货流水勾稽：${String(putawayLegs.length)} 条 movement 挂 PO 链单据号`)
  const poInvoices = invoices.filter(row => Number(row.po_id) === Number(po.id))
  need(poInvoices.length >= 1, `PO ${poCode} → 发票 ${String(poInvoices.length)} 张（匹配 ${poInvoices.map(row => String(row.match_result)).join('/')}）`)
  for (const invoice of poInvoices) {
    const paid = payments.filter(row => Number(row.invoice_id) === Number(invoice.id))
    need(paid.length >= 1, `发票 ${String(invoice.code)} → 付款 ${String(paid.length)} 笔（${paid.map(row => `${String(row.code)}/${String(row.doc_status)}`).join('、')}）`)
  }
  const poSupplier = suppliers.find(row => Number(row.id) === Number(po.supplier_id))
  need(poSupplier !== undefined, `PO ${poCode} 供应商 ${String(poSupplier?.name ?? '')}（lifecycle=${String(poSupplier?.lifecycle_status ?? '')}）`)

  // MO 向上：BOM + driver_suggestion → SO。
  const mos = await rowsOf(token, 'mfg_orders')
  const mo = mos.find(row => String(row.code) === moCode)
  if (mo === undefined) {
    need(false, `MO ${moCode} 不存在`)
    return { links, passed: links.every(link => link.ok) }
  }
  const boms = await rowsOf(token, 'mfg_boms')
  const bom = boms.find(row => Number(row.id) === Number(mo.bom_id))
  need(bom !== undefined, `MO ${moCode} → BOM ${String(bom?.code ?? '')}（${String(bom?.bom_status ?? '')}）`)
  if (mo.driver_suggestion_id === null || mo.driver_suggestion_id === undefined) {
    need(true, `MO ${moCode} 无驱动建议（人工下单，向上链止于此）`)
  } else {
    const suggestions = await rowsOf(token, 'mrp_suggestions')
    const suggestion = suggestions.find(row => Number(row.id) === Number(mo.driver_suggestion_id))
    need(suggestion !== undefined, `MO ${moCode} → MRP 建议 #${String(mo.driver_suggestion_id)}（status=${String(suggestion?.status ?? '')}）`)
    if (suggestion !== undefined && suggestion.driver_so_id !== null && suggestion.driver_so_id !== undefined && String(suggestion.driver_so_id) !== '') {
      const soOrders = await rowsOf(token, 'so_orders')
      const driverSo = soOrders.find(row => String(row.code) === String(suggestion.driver_so_id))
      need(driverSo !== undefined, `建议 #${String(suggestion.id)} → 驱动 SO ${String(suggestion.driver_so_id)}（${String(driverSo?.doc_status ?? '')}）`)
    }
  }

  // MO 向下：领料 / 报工 / 完工 / 成品批次。
  const issues = await rowsOf(token, 'mfg_material_issues')
  const moIssues = issues.filter(row => Number(row.mo_id) === Number(mo.id))
  need(moIssues.length >= 1, `MO ${moCode} → 领料 ${String(moIssues.length)} 单（${moIssues.map(row => String(row.code)).join('、')}）`)
  const reports = await rowsOf(token, 'mfg_job_reports')
  const moReports = reports.filter(row => Number(row.mo_id) === Number(mo.id))
  need(moReports.length >= 1, `MO ${moCode} → 报工 ${String(moReports.length)} 单（合格 Σ${String(moReports.reduce((total, row) => total + Number(row.qty_good ?? 0), 0))}）`)
  const completions = await rowsOf(token, 'mfg_completions')
  const moCompletions = completions.filter(row => Number(row.mo_id) === Number(mo.id))
  need(moCompletions.length >= 1, `MO ${moCode} → 完工 ${String(moCompletions.length)} 单`)
  const fgLotNos = new Set(moCompletions.map(row => String(row.lot_no)))
  const fgLots = lots.filter(row => fgLotNos.has(String(row.lot_no)))
  need(fgLots.length >= 1, `完工 → 成品批次 ${[...fgLotNos].join('、')}（${String(fgLots.length)} 条批次档案）`)

  // 批次双向追溯：成品批次 → 组件批次（领料 ISSUE_WIP 流水上的批次——领料单
  // 行的 lot_id 留空由引擎定批，流水才是批次真源）→ 供应商（批次 supplier_id）。
  for (const lot of fgLots) {
    const issueDocNos = new Set(moIssues.map(row => String(row.code)))
    const componentLots = movements
      .filter(row => String(row.move_type) === 'ISSUE_WIP' && issueDocNos.has(String(row.doc_no)))
      .map(row => lots.find(candidate => Number(candidate.id) === Number(row.lot_id)))
      .filter((row): row is Record<string, any> => row !== undefined)
    need(componentLots.length >= 1, `成品批次 ${String(lot.lot_no)} → 组件批次 ${String(componentLots.length)} 个（领料 ISSUE_WIP 流水批次回链）`)
    const compSupplierIds = new Set(componentLots.map(row => Number(row.supplier_id)).filter(id => Number.isInteger(id) && id > 0))
    need(compSupplierIds.size >= 1, `组件批次 → 供应商 ${String(compSupplierIds.size)} 家（${[...compSupplierIds].map(id => String(suppliers.find(row => Number(row.id) === id)?.name ?? id)).join('、')}）三级追溯链闭合`)
  }

  return { links, passed: links.every(link => link.ok) }
}

/**
 * The CLI trace entry: run the two-way assertions and exit non-zero when
 * any link is broken (re-runnable acceptance evidence).
 * @param token - the root API token.
 * @param poCode - the purchase order code.
 * @param moCode - the manufacturing order code.
 */
export async function runTrace(token: string, poCode: string, moCode: string): Promise<void> {
  const { links, passed } = await traceAll(token, poCode, moCode)
  for (const link of links) {
    console.log(`kpi-run: [trace] ${link.ok ? '✓' : '✗'} ${link.line}`)
  }
  console.log(`kpi-run: [trace] ${passed ? 'PASS' : 'FAIL'} — ${String(links.filter(link => link.ok).length)}/${String(links.length)} 链路闭合`)
  if (!passed) process.exitCode = 1
}

/**
 * Print the three reconciliation KPIs (the acceptance's hand-check trio)
 * with their engine values and the psql statements to re-derive them.
 * @param token - the root API token.
 */
export async function reconcile(token: string): Promise<void> {
  const rows = await rowsOf(token, 'kpi_snapshots', 4000)
  const latest = rows.reduce((max, row) => String(row.calc_date ?? '') > max ? String(row.calc_date ?? '') : max, '')
  for (const code of ['otif', 'fpy', 'count_accuracy']) {
    const row = rows.find(candidate => String(candidate.kpi_code) === code && String(candidate.dim ?? '') === '' && String(candidate.calc_date ?? '') === latest)
    console.log(`kpi-run: [reconcile] ${code} @ ${latest} = ${String(row?.value ?? '（无行）')}`)
    console.log(`kpi-run: [reconcile] 口径：${String(row?.note ?? '')}`)
  }
}

// ─── selftest (pure layer only) ───

/** One selftest assertion (deep-compare; throws with the label on failure). */
function expect(that: string, actual: unknown, expected: unknown): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`selftest 失败：${that} — 期望 ${JSON.stringify(expected)}，实际 ${JSON.stringify(actual)}`)
  }
}

/** One selftest assertion: the thunk must throw with the label's text in the message. */
function expectThrows(that: string, thunk: () => unknown): void {
  try {
    thunk()
  } catch (error) {
    if (String(error).includes(that)) return
    throw new Error(`selftest 失败：抛错文案不含「${that}」— 实际 ${String(error)}`)
  }
  throw new Error(`selftest 失败：应抛错但未抛（${that}）`)
}

/**
 * The pure-layer selftest the acceptance checkbox names: the batch doc's
 * FPY=(90−5)/90 worked example, the OTIF numerator/denominator vocabulary,
 * count accuracy, percentile_cont parity, dead-stock aging, the expiry
 * window, and the RTY product — plus the KPI table's own shape (25 codes,
 * 4 boards, every code unique), the W2-B4 replay trio (net/WIP/capital),
 * the month-end anchor, and the turnover pair's formulas and zero guards.
 */
export async function selftest(): Promise<void> {
  // FPY: 100 入 / 5 返修 / 90 良出 → the batch doc's (90−5)/90 framing is
  // Σgood/(Σgood+Σscrap) = 85/90? No — the doc's worked example is 100
  // started, 5 reworked, 90 good out: first-pass good = 90−5 = 85, over
  // 90 first-pass completions → 85/90. Our row-level formula with
  // qty_good=85, qty_scrap=5 over 90 started is the same ratio.
  expect('FPY=(90−5)/90 工例', fpyOf([
    { op_seq: 1, report_date: '2026-09-01', status: 'posted', qty_good: 85, qty_scrap: 5, duration_min: null },
  ]), 0.9444)
  expect('FPY 多行汇总', fpyOf([
    { op_seq: 1, report_date: '2026-09-01', status: 'posted', qty_good: 12000, qty_scrap: 0, duration_min: 480 },
    { op_seq: 2, report_date: '2026-09-01', status: 'posted', qty_good: 11800, qty_scrap: 200, duration_min: 460 },
    { op_seq: 3, report_date: '2026-09-01', status: 'posted', qty_good: 12000, qty_scrap: 0, duration_min: 480 },
  ]), 0.9944)
  expect('FPY 无过账行=不可算', fpyOf([{ op_seq: 1, report_date: '2026-09-01', status: 'draft', qty_good: 500, qty_scrap: 0, duration_min: null }]), null)

  // OTIF 分子分母：分母=approved 且有交期；分子=shipped 且 shipped_at ≤ need_date。
  expect('OTIF 分子分母口径', otifOf([
    { doc_status: 'approved', need_date: '2026-10-01', shipping_status: 'shipped', shipped_at: '2026-09-28', approved_at: '2026-09-01', amount: 1 },
    { doc_status: 'approved', need_date: '2026-10-01', shipping_status: 'shipped', shipped_at: '2026-10-05', approved_at: '2026-09-01', amount: 1 },
    { doc_status: 'approved', need_date: '2026-10-01', shipping_status: 'partial', shipped_at: null, approved_at: '2026-09-01', amount: 1 },
    { doc_status: 'approved', need_date: null, shipping_status: 'shipped', shipped_at: '2026-09-01', approved_at: '2026-09-01', amount: 1 },
  ]), 0.3333)
  expect('OTIF 空分母=不可算', otifOf([]), null)

  // 账实相符率：1 − Σ|diff|/Σ账面。
  expect('账实相符率', countAccuracyOf([
    { count_no: 'CNT-20260926-0001', biz_date: '2026-09-26', snapshot_qty: 480, counted_qty: 475 },
    { count_no: 'CNT-20260926-0002', biz_date: '2026-09-26', snapshot_qty: 410, counted_qty: 413 },
  ]), 0.991)
  expect('账实相符率 未盘行剔除', countAccuracyOf([{ count_no: 'CNT-20260926-0003', biz_date: '2026-09-26', snapshot_qty: 480, counted_qty: null }]), null)
  expect('count_no 日期解析', countDateOf('CNT-20260926-0010001'), '2026-09-26')
  expect('W2-B3 盘点日列优先', countRowDateOf({ biz_date: '2026-08-31', count_no: 'CNT-20260926-0001' }), '2026-08-31')
  expect('W2-B3 列缺失回退编码', countRowDateOf({ biz_date: null, count_no: 'CNT-20260926-0001' }), '2026-09-26')
  expect('W2-B3 列码皆缺归空', countRowDateOf({ biz_date: null, count_no: 'CNT-B4-WF-856231' }), '')

  // percentile_cont parity：[3,5,7,9] 的 P50=6、P90=8.4（线性插值）。
  expect('percentile_cont P50', percentileCont([3, 5, 7, 9], 0.5), 6)
  expect('percentile_cont P90', percentileCont([3, 5, 7, 9], 0.9), 8.4)
  expect('提前期天数差', dayDiff('2026-09-20', '2026-09-12'), 8)

  // 呆滞：库龄 91 天计呆滞、90 天不计（>90 口径）。
  expect('呆滞占比 含 91 天排除 90 天', deadStockRatioOf([
    { qty_on_hand: 10, status: 'good', unit_price: 5, lot_receipt_date: '2026-06-26', expiry_date: null, lot_no: 'LOT-X' }, // 92 天 → 呆滞
    { qty_on_hand: 10, status: 'good', unit_price: 5, lot_receipt_date: '2026-06-28', expiry_date: null, lot_no: 'LOT-Y' }, // 90 天 → 不计
    { qty_on_hand: 20, status: 'good', unit_price: 5, lot_receipt_date: null, expiry_date: null, lot_no: 'LOT-Z' }, // 无收货锚点 → 只进分母
  ], '2026-09-26'), 50 / 200)

  // 临期：剩余 0 ≤ (expiry − asOf) < 30 计入，31 天不计，过期也计；同批次
  // 多库位行只计一次（按 lot_no 去重）。
  expect('临期窗口', expiryAlertsOf([
    { qty_on_hand: 1, status: 'good', unit_price: 1, lot_receipt_date: null, expiry_date: '2026-10-15', lot_no: 'LOT-A' },
    { qty_on_hand: 2, status: 'good', unit_price: 1, lot_receipt_date: null, expiry_date: '2026-10-15', lot_no: 'LOT-A' }, // 同批次第二库位 → 去重
    { qty_on_hand: 1, status: 'good', unit_price: 1, lot_receipt_date: null, expiry_date: '2026-10-27', lot_no: 'LOT-B' }, // 31 天 → 不计
    { qty_on_hand: 1, status: 'good', unit_price: 1, lot_receipt_date: null, expiry_date: '2026-09-20', lot_no: 'LOT-C' }, // 过期 → 计
    { qty_on_hand: 1, status: 'good', unit_price: 1, lot_receipt_date: null, expiry_date: null, lot_no: 'LOT-D' },
  ], '2026-09-26'), 2)

  // RTY：两工序 0.9 × 0.8 = 0.72。
  expect('RTY 连乘', rtyOf([
    { op_seq: 1, report_date: '2026-09-01', status: 'posted', qty_good: 90, qty_scrap: 10, duration_min: null },
    { op_seq: 2, report_date: '2026-09-01', status: 'posted', qty_good: 80, qty_scrap: 20, duration_min: null },
  ]), 0.72)

  // OTD-S：准时 1/2。
  expect('供应商准时到货率', otdSupplierOf([
    { receipt_no: 'RCV-1', received_at: '2026-09-10', po_need_date: '2026-09-12', po_approved_at: '2026-09-01', supplier_name: '甲' },
    { receipt_no: 'RCV-2', received_at: '2026-09-15', po_need_date: '2026-09-12', po_approved_at: '2026-09-01', supplier_name: '甲' },
  ]), 0.5)

  // The KPI table shape: 25 unique codes over the four boards (W2-B4 added
  // the turnover pair; W2-B7 added ap_balance).
  expect('KPI 总数', KPI_DEFS.length, 25)
  expect('KPI code 唯一', new Set(KPI_DEFS.map(def => def.code)).size, KPI_DEFS.length)
  expect('四看板齐', [...new Set(KPI_DEFS.map(def => def.board))].sort(), ['business', 'inventory', 'production', 'supply'])

  // 批次合格率分母剔除 pending OQC（已判定批口径）：3 判定 2 过 → 2/3；
  // pending 与空 result 不入分母。
  {
    const facts = { oqcInspections: [
      { inspected_at: '2026-09-20', result: 'passed' },
      { inspected_at: '2026-09-21', result: 'concession' },
      { inspected_at: '2026-09-22', result: 'failed' },
      { inspected_at: '2026-09-23', result: 'pending' },
      { inspected_at: '2026-09-24', result: '' },
    ] } as Pick<KpiFacts, 'oqcInspections'>
    const lotPass = KPI_DEFS.find(def => def.code === 'lot_pass_rate')
    if (lotPass === undefined) throw new Error('selftest 失败：lot_pass_rate 定义缺失')
    expect('批次合格率 pending 剔除', lotPass.compute(facts, '2026-09-26').value, 0.6667)
  }

  // W2-B7 ap_balance — the ar_balance mirror: confirmed invoices − approved
  // payments (billed_at/pay_date ≤ 日); unconfirmed invoices never count; a
  // month with no confirmed invoice reads 0, not null.
  {
    const apFacts = {
      purInvoices: [
        { invoice_amount: 1200, billed_at: '2026-08-10', match_result: 'confirmed' },
        { invoice_amount: 880, billed_at: '2026-09-05', match_result: 'confirmed' },
        { invoice_amount: 500, billed_at: '2026-09-01', match_result: 'matched' },
        { invoice_amount: 300, billed_at: '2026-09-20', match_result: 'confirmed' },
      ],
      purPayments: [
        { amount: 880, pay_date: '2026-09-12', doc_status: 'approved' },
        { amount: 880, pay_date: '2026-09-15', doc_status: 'draft' },
      ],
    } as Pick<KpiFacts, 'purInvoices' | 'purPayments'>
    const ap = KPI_DEFS.find(def => def.code === 'ap_balance')
    if (ap === undefined) throw new Error('selftest 失败：ap_balance 定义缺失')
    expect('ap_balance 镜像口径', ap.compute(apFacts, '2026-09-26').value, 1500)
    expect('ap_balance 截日前发票不计', ap.compute(apFacts, '2026-08-31').value, 1200)
    expect('ap_balance 无确认发票月=0 非null', ap.compute({ purInvoices: [], purPayments: [] } as Pick<KpiFacts, 'purInvoices' | 'purPayments'>, '2026-09-26'), { dim: null, value: 0 })
  }

  // PRESENT_ONLY 收缩（W2-B4）：库存三码改为 biz_date 重放；剩余三码为
  // 流程态计数（当日开放态，逐日重放无意义），历史日仍落 null 行。
  expect('PRESENT_ONLY 恰好三码', PRESENT_ONLY.size, 3)
  for (const code of ['pending_approvals', 'shortage_alerts', 'inbound_lines']) {
    expect(`PRESENT_ONLY 含 ${code}`, PRESENT_ONLY.has(code), true)
  }
  for (const code of ['capital_occupied', 'wip_qty', 'on_hand_qty']) {
    expect(`PRESENT_ONLY 已移出 ${code}`, PRESENT_ONLY.has(code), false)
  }

  // W2-B4 重放三件套：全局净额 / WIP 线边净额 / 现值 vwap 资金占用。
  const replayMoves: KpiMovement[] = [
    { id: 1, product_id: 8, qty: 500, biz_date: '2026-08-28', wip_leg: false },
    { id: 2, product_id: 8, qty: -200, biz_date: '2026-09-02', wip_leg: false },
    { id: 3, product_id: 9, qty: 60, biz_date: '2026-09-05', wip_leg: true },  // ISSUE_WIP 入线边
    { id: 4, product_id: 9, qty: -10, biz_date: '2026-09-10', wip_leg: true }, // RETURN_WIP 出线边
  ]
  expect('重放净额 截至8/31', replayQtyOf(replayMoves, '2026-08-31'), 500)
  expect('重放净额 全量', replayQtyOf(replayMoves, '2026-09-30'), 350)
  expect('WIP线边重放 全量', replayWipQtyOf(replayMoves, '2026-09-30'), 50)
  expect('WIP线边重放 截至9/7', replayWipQtyOf(replayMoves, '2026-09-07'), 60)
  expect('重放资金占用 全量', replayCapitalOf(replayMoves, new Map([[8, 12.5], [9, 22]]), '2026-09-30'), 4850)
  expect('重放资金占用 截至8/31', replayCapitalOf(replayMoves, new Map([[8, 12.5]]), '2026-08-31'), 6250)

  // 月度粒度：月末锚点 / 当月天数。
  expect('月末判定 8/31', isMonthEnd('2026-08-31'), true)
  expect('月末判定 9/27 非月末', isMonthEnd('2026-09-27'), false)
  expect('月末判定 12/31', isMonthEnd('2026-12-31'), true)
  expect('月末判定 平年2/28', isMonthEnd('2027-02-28'), true)
  expect('当月天数 2026-08', daysInMonth('2026-08'), 31)
  expect('当月天数 2026-09', daysInMonth('2026-09'), 30)

  // 周转率两码：工例 out=12000、平均库存=6000 → rate=2.0、days=31/2；
  // 非月末/无快照月 → 不落行（compute null）；分母 0 → null 行非 Inf；
  // rate=0（出库为零月）→ days null。
  {
    const balances = { monthlyBalances: [
      { period: '2026-08', opening_val: 4000, out_val: 12000, bal_val: 8000 },
    ] } as Pick<KpiFacts, 'monthlyBalances'>
    const rate = KPI_DEFS.find(def => def.code === 'inv_turnover_rate')
    const days = KPI_DEFS.find(def => def.code === 'inv_turnover_days')
    if (rate === undefined || days === undefined) throw new Error('selftest 失败：周转率两码定义缺失')
    expect('周转率工例 12000/6000', rate.compute(balances, '2026-08-31'), { dim: 'period', value: 2 })
    expect('周转天数工例 31/2', days.compute(balances, '2026-08-31'), { dim: 'period', value: 15.5 })
    expect('非月末不落行', rate.compute(balances, '2026-08-15'), null)
    expect('无快照月不落行', rate.compute(balances, '2026-07-31'), null)
    expect('分母0=不可算非Inf', rate.compute({ monthlyBalances: [{ period: '2026-08', opening_val: 0, out_val: 0, bal_val: 0 }] } as Pick<KpiFacts, 'monthlyBalances'>, '2026-08-31'), { dim: 'period', value: null })
    expect('rate=0→天数null', days.compute({ monthlyBalances: [{ period: '2026-08', opening_val: 0, out_val: 0, bal_val: 33621.96 }] } as Pick<KpiFacts, 'monthlyBalances'>, '2026-08-31'), { dim: 'period', value: null })
  }

  // 三码重放 compute 集成（facts 片段直调，与上面纯函数互证）。
  {
    const facts = { movements: replayMoves, vwapByProduct: new Map([[8, 12.5], [9, 22]]) } as Pick<KpiFacts, 'movements' | 'vwapByProduct'>
    const onHand = KPI_DEFS.find(def => def.code === 'on_hand_qty')
    const wip = KPI_DEFS.find(def => def.code === 'wip_qty')
    const capital = KPI_DEFS.find(def => def.code === 'capital_occupied')
    if (onHand === undefined || wip === undefined || capital === undefined) throw new Error('selftest 失败：库存三码定义缺失')
    expect('on_hand 重放compute', onHand.compute(facts, '2026-08-31'), { dim: null, value: 500 })
    expect('wip 重放compute', wip.compute(facts, '2026-09-30'), { dim: null, value: 50 })
    expect('capital 重放compute', capital.compute(facts, '2026-09-30'), { dim: null, value: 4850 })
  }

  // rowsOf 截断负例：meta.total 超页与「无 total 但行数=pageSize」都必须抛。
  expectThrows('kpi_snapshots:list returned 1000 of 1982', () => assertFullPage('kpi_snapshots', 1000, 1982, 1000))
  expectThrows('wms_x:list returned 500 of undefined', () => assertFullPage('wms_x', 500, undefined, 500))
  expect('完整页不抛', assertFullPage('kpi_snapshots', 1982, 1982, 4000), undefined)

  // 业务日界（R2）：分桶跟 Asia/Shanghai，不跟 UTC——UTC 20:00 是沪次日
  // 04:00，必须归沪当日口径（次日）；UTC 16:00 恰是沪零点翻日。
  expect('日界：UTC 20:00 = 沪次日 04:00 → 归次日', shanghaiDate(new Date('2026-09-26T20:00:00Z')), '2026-09-27')
  expect('日界：UTC 15:59 = 沪 23:59 → 仍归当日', shanghaiDate(new Date('2026-09-26T15:59:00Z')), '2026-09-26')
  expect('日界：UTC 16:00 = 沪次日 00:00 → 翻日', shanghaiDate(new Date('2026-09-26T16:00:00Z')), '2026-09-27')

  console.log('kpi-run: selftest OK — FPY 工例/OTIF 分子分母/账实相符率/percentile 对齐/呆滞库龄/临期窗口/RTY 连乘/OTD-S/KPI 表形态/批次合格率已判定口径/ap_balance 应付镜像/PRESENT_ONLY 收缩/重放三件套/月末锚点/周转率公式与除零/rowsOf 截断负例/沪日界边界 全部通过')
}

// ─── CLI ───

async function main(): Promise<void> {
  const args = process.argv.slice(2)
  if (args.includes('--selftest')) {
    await selftest()
    return
  }
  const token = await signInWithRetry()
  if (args.includes('--calc-kpi')) {
    const result = await calcDay(token, shanghaiDate())
    console.log(`kpi-run: calc ${result.date} — ${String(result.rows)} rows（${String(result.valued)} valued）`)
    return
  }
  const backfillIndex = args.indexOf('--backfill')
  if (backfillIndex >= 0 || args.includes('--backfill-90d')) {
    const days = backfillIndex >= 0 ? Number(args[backfillIndex + 1] ?? 90) : 90
    const result = await backfill(token, days)
    console.log(`kpi-run: backfill ${String(result.days)}d（${result.from}..${result.to}）— ${String(result.rows)} rows`)
    return
  }
  if (args.some(arg => arg.startsWith('--trace'))) {
    const poCode = /po=([^ ]+)/.exec(args.join(' '))?.[1]
    const moCode = /mo=([^ ]+)/.exec(args.join(' '))?.[1]
    if (poCode === undefined || moCode === undefined) {
      throw new Error('--trace 需要 po=<PO 编号> mo=<MO 编号>')
    }
    await runTrace(token, poCode, moCode)
    return
  }
  if (args.includes('--reconcile')) {
    await reconcile(token)
    return
  }
  throw new Error('需要一个动作：--selftest | --calc-kpi | --backfill [days] | --trace po=<code> mo=<code> | --reconcile')
}

// Library imports (approval-engine's serve route) must not run the CLI.
if (process.argv[1] !== undefined && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  await main()
}
