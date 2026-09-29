/**
 * B7: the MRP engine — the sales→planning spine
 * (plans/2026-09-25-mfg-closure/08-b7-sales-mrp.md). Pure compute plus the
 * REST effects, every step idempotent:
 *
 * 1. --run-mrp (the nightly close, curl-able on the engine serve):
 *    ① collect independent demand — approved so_order_lines not yet shipped,
 *    aggregated per (product, earliest need_date) — and since W2-B2 the
 *    approved MPS plan rows first: the latest approved mps_plans' items
 *    cover their products, the covered items' SO feed is dropped (the
 *    code-enforced mutual exclusion, max-merged planned_qty rides instead
 *    with need_date = the period's 月中锚点 and driver `mps:<plan.code>`; no
 *    approved plan keeps the W-round SO-only close byte for byte); ② explode
 *    the BOM two to
 *    three levels deep, child demand = parent net × qty_per × (1+scrap%);
 *    ③ net = gross + safety_stock − on_hand − inbound(approved open PO lines)
 *    − wip(released/in_progress MO qty) + hard reservations (the same
 *    wms_reservations fact source 齐套 reads — D6); ④ the JIT window: only
 *    demand whose need_date falls inside [today, today+60d] places an order;
 *    ⑤ upsert mrp_suggestions (MO when an active BOM exists, PR otherwise);
 *    ⑥ append the mrp_snapshots row per product per run (auditable close).
 * 2. --confirm <suggestionId>: the plan-order confirmation — an open
 *    suggestion converts into a draft mfg_orders (BOM attached) or a draft
 *    pur_requests + line (both then ride their B5/B3 approval flows); the
 *    suggestion lands converted with the doc back-reference. Anything not
 *    open refuses loud (转单防重复).
 * 3. --dismiss <suggestionId>: open → dismissed (the 忽略 action, audited).
 * 4. --reserve-so <soCode>: the SO-approved effect — hard-reserve the
 *    finished goods the approved SO still owes (可用则 assigned; a shortfall
 *    reserves what fits and reports the gap). Re-runs top up.
 * 5. --ship-so <soCode>: consume the SO's reservations, post the
 *    SHIPMENT_SO stock leg, and recompute qty_shipped / shipping_status
 *    (none → partial → shipped).
 *
 * Usage (repo root, tsx loader):
 *   node --import tsx/esm examples/kb-agent/scripts/mrp-run.mts --selftest
 *   node --import tsx/esm examples/kb-agent/scripts/mrp-run.mts --run-mrp
 *   node --import tsx/esm examples/kb-agent/scripts/mrp-run.mts --confirm 12
 *   node --import tsx/esm examples/kb-agent/scripts/mrp-run.mts --dismiss 13
 *   node --import tsx/esm examples/kb-agent/scripts/mrp-run.mts --reserve-so SO-2026-0001
 *   node --import tsx/esm examples/kb-agent/scripts/mrp-run.mts --ship-so SO-2026-0001
 *   node --import tsx/esm examples/kb-agent/scripts/mrp-run.mts --refresh-mps 1
 *   MRP_HORIZON_DAYS=120 node --import tsx/esm examples/kb-agent/scripts/mrp-run.mts --run-mrp
 */
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { call, dataOf, signInWithRetry } from './nocobase-flow-page-lib.mts'
import { appendMovement, applyStockDelta, consumeReservation, reserve } from './nocobase-h5-wms.mts'
import { assertSourceEffective, type NocoIO } from './approval-engine.mts'

const here = dirname(fileURLToPath(import.meta.url))

// ─── pure compute (selftested; no IO) ───

/** The JIT planning horizon: demand due beyond this many days does not order yet. */
export const PLAN_HORIZON_DAYS = 60

/**
 * Parse the `MRP_HORIZON_DAYS` env override (W2-B2): undefined when unset,
 * a positive integer when set, and a loud refusal on anything else — the
 * monthly MPS outlook (3–6 periods = 90–180 days) needs a wider window to
 * consume far-period plan rows.
 * @param raw - the raw env value (process.env.MRP_HORIZON_DAYS).
 * @returns the horizon in days, or undefined when the env is unset.
 */
export function parseHorizonDays(raw: string | undefined): number | undefined {
  if (raw === undefined || raw === '') return undefined
  const value = Number(raw)
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`MRP_HORIZON_DAYS 必须是正整数（收到 "${raw}"）——JIT 窗覆盖配置拒绝静默回退`)
  }
  return value
}

/** The max-merge outcome for one item-period: the planned qty and which side won. */
export interface MergedDemand {
  readonly plannedQty: number
  readonly driver: 'so' | 'forecast'
}

/**
 * The ERPNext v16 max-merge (PLAN D3, the report's §3.3): the MPS planned
 * quantity is max(SO open, forecast) over the same item-period, so the two
 * sources never double-count and no forecast-consumption window is needed.
 * A tie rides 'so' (the firmer demand). planned_qty is pinned as the
 * item-period total independent demand — MRP must NOT also feed this item's
 * SO lines while the MPS row covers it.
 * @param soOpen - the approved-not-shipped SO qty aggregated into the period.
 * @param forecast - the planner-entered forecast qty for the period.
 * @returns the merged planned qty with the winning driver.
 */
export function mergeDemand(soOpen: number, forecast: number): MergedDemand {
  return { plannedQty: q4(Math.max(soOpen, forecast)), driver: soOpen >= forecast ? 'so' : 'forecast' }
}

/** The month anchor an MPS period row lands on inside the JIT window (月中锚点). */
export function mpsNeedDateOf(period: string): string {
  return `${period}-15`
}

/** The plan back-link carried on suggestions: `mps:<code>` drivers map to the bare plan code. */
function mpsPlanOf(driverSo: string | null): string | null {
  return driverSo !== null && driverSo.startsWith('mps:') ? driverSo.slice('mps:'.length) : null
}

/** Round to 4 decimals so qty arithmetic never drifts into float noise on the wire. */
const q4 = (value: number): number => Math.round(value * 10_000) / 10_000

const iso = (offsetDays: number): string => new Date(Date.now() + offsetDays * 86_400_000).toISOString().slice(0, 10)

/**
 * The ERPNext net-requirement formula (PLAN D6, the report's §4 verbatim):
 * Reqd = demand − (on-hand + wip + inbound), with safety stock added onto the
 * demand side and hard reservations added back because reserved stock still
 * sits in on-hand but is already spoken for.
 * @param gross - the aggregated gross demand (SO undelivered + BOM explosion).
 * @param safety - the product's safety_stock column.
 * @param onHand - Σ good-stock qty_on_hand per product.
 * @param inbound - Σ (qty − qty_received) over approved open PO lines.
 * @param wip - Σ qty over released/in_progress MOs.
 * @param reserved - Σ reserved wms_reservations per product.
 * @returns the net requirement (negative when covered — callers clamp to 0).
 */
export function netRequirement(gross: number, safety: number, onHand: number, inbound: number, wip: number, reserved: number): number {
  return q4(gross + safety - onHand - inbound - wip + reserved)
}

/**
 * The JIT window: only demand whose need_date lands inside
 * [today, today + horizonDays] places an order this close. Past-due and
 * beyond-horizon demand stays out (the acceptance negative).
 * @param needDate - the demand's due date (YYYY-MM-DD).
 * @param today - the run date (YYYY-MM-DD).
 * @param horizonDays - the forward window (default {@link PLAN_HORIZON_DAYS}).
 * @returns true when the date falls inside the window.
 */
export function jitInWindow(needDate: string, today: string, horizonDays: number = PLAN_HORIZON_DAYS): boolean {
  return needDate >= today && needDate <= isoAddDays(today, horizonDays)
}

/** Add days to an ISO date without dragging a Date through the pure layer. */
function isoAddDays(date: string, days: number): string {
  return new Date(new Date(`${date}T00:00:00Z`).getTime() + days * 86_400_000).toISOString().slice(0, 10)
}

/**
 * The earliest order date: the need date minus the lead time, never before
 * today (a late demand orders now — the JIT floor).
 * @param needDate - the demand's due date.
 * @param leadTimeDays - the product's lead_time_days column.
 * @param today - the run date.
 * @returns the suggest_date the order row carries.
 */
export function suggestDateOf(needDate: string, leadTimeDays: number, today: string): string {
  const raw = isoAddDays(needDate, -Math.max(0, Math.trunc(leadTimeDays)))
  return raw > today ? raw : today
}

/** One BOM edge: parent product → component with its per-unit net usage. */
export interface BomEdge {
  readonly parentSku: string
  readonly childSku: string
  readonly qtyPerUnit: number
  readonly scrapPct: number
}

/**
 * Explode one level-set of parent net requirements through the BOM edges,
 * aggregating child demand by SKU (two to three levels land as repeated
 * calls; cycle-guarded by the caller's depth cap).
 * @param parentNet - SKU → net requirement of the parent level.
 * @param edges - the BOM lines (active BOMs only, the caller filters).
 * @returns SKU → aggregated child demand = Σ parent net × qty_per × (1+scrap%).
 */
export function explodeBomLevel(parentNet: ReadonlyMap<string, number>, edges: ReadonlyArray<BomEdge>): Map<string, number> {
  const childDemand = new Map<string, number>()
  for (const edge of edges) {
    const parentQty = parentNet.get(edge.parentSku)
    if (parentQty === undefined || parentQty <= 0) continue
    const per = edge.qtyPerUnit * (1 + edge.scrapPct / 100)
    childDemand.set(edge.childSku, q4((childDemand.get(edge.childSku) ?? 0) + parentQty * per))
  }
  return childDemand
}

/** The maximum BOM recursion depth (cycle guard; the seed graph is two levels). */
const MAX_BOM_DEPTH = 4

// ─── REST helpers ───

async function rowsOf(token: string, collection: string, pageSize = 500): Promise<Array<Record<string, any>>> {
  const payload = await call(token, 'GET', `/api/${collection}:list?pageSize=${pageSize}`)
  const rows = (payload?.data ?? null) as Array<Record<string, any>> | null
  if (rows === null) return []
  const total = payload?.meta?.total
  if (typeof total === 'number' ? total > rows.length : rows.length === pageSize) {
    throw new Error(`${collection}:list returned ${String(rows.length)} of ${String(total)} rows (pageSize=${String(pageSize)}); raise the page size or paginate`)
  }
  return rows
}

/**
 * rowsOf over a collection that may not exist yet (W2-B2): the MPS tables
 * land with the w7 seed, so a close running before that seed must keep the
 * W-round behavior (no MPS rows) instead of dying on the 404. Only the
 * 404 on this collection's own :list is swallowed; auth, network, and
 * server errors still throw.
 * @returns the rows, or null when the collection does not exist.
 */
async function rowsOfOptionalCollection(token: string, collection: string): Promise<Array<Record<string, any>> | null> {
  try {
    return await rowsOf(token, collection)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (message.includes(`/${collection}:list`) && message.includes('HTTP 404')) return null
    throw error
  }
}

const todayIso = (): string => new Date().toISOString().slice(0, 10)

/** The next code in a SO/MO/PR-style YYYY-NNNN series (never reuses a live number). */
async function nextCode(token: string, collection: string, codeColumn: string, prefix: string): Promise<string> {
  const rows = await rowsOf(token, collection, 500)
  const year = new Date().toISOString().slice(0, 4)
  const pattern = new RegExp(`^${prefix}-${year}-(\\d+)$`)
  const max = rows.reduce((acc, row) => Math.max(acc, Number(pattern.exec(String(row[codeColumn] ?? ''))?.[1] ?? 0)), 0)
  return `${prefix}-${year}-${String(max + 1).padStart(4, '0')}`
}

// ─── the nightly close ───

/** One product's close row (the snapshot the psql audit re-derives by hand). */
export interface MrpSnapshotRow {
  readonly run_id: string
  readonly run_date: string
  readonly product_id: number
  readonly sku: string
  readonly gross: number
  readonly safety: number
  readonly on_hand: number
  readonly inbound: number
  readonly wip: number
  readonly reserved: number
  readonly net: number
  readonly need_date: string | null
  readonly driver_so: string | null
  readonly bom_level: number
}

/** The run's outcome the CLI prints and the serve route returns. */
export interface MrpRunResult {
  readonly run_id: string
  readonly snapshots: number
  readonly suggestions: number
  readonly stale_closed: number
}

/**
 * Run the MRP close: collect demand, explode the BOM, net every level
 * against stock/inbound/wip/reservations, keep the JIT window, upsert the
 * open suggestions, append the snapshot rows, and close suggestions whose
 * demand vanished this round.
 * @param token - the root API token.
 * @returns the run summary.
 */
export async function runMrp(token: string): Promise<MrpRunResult> {
  const runDate = todayIso()
  // W2-B2: the JIT window widens via MRP_HORIZON_DAYS so the monthly MPS
  // outlook (3–6 periods = 90–180 days) can consume far-period plan rows;
  // unset keeps the W-round 60-day default (zero drift).
  const horizonDays = parseHorizonDays(process.env['MRP_HORIZON_DAYS']) ?? PLAN_HORIZON_DAYS
  const runId = `MRP-${runDate.replaceAll('-', '')}-${String(((await rowsOf(token, 'mrp_snapshots')).filter(row => String(row.run_id ?? '').startsWith(`MRP-${runDate.replaceAll('-', '')}`)).length + 1)).padStart(2, '0')}`
  // W5-B5/BP-15: approved SOs missing need_date used to drop out of the JIT
  // window silently — the run summary now names them (the aggregation keeps
  // the empty date, so nothing else moves).
  const undatedSos: string[] = []

  // Supply facts (per product).
  const products = await rowsOf(token, 'hub_inv_products', 200)
  const productIdOf = (sku: string): number | undefined => products.find(row => row.sku === sku)?.id
  const onHand = new Map<number, number>()
  for (const row of await rowsOf(token, 'wms_stock', 500)) {
    if (String(row.status) !== 'good') continue
    const id = Number(row.product_id)
    onHand.set(id, q4((onHand.get(id) ?? 0) + Number(row.qty_on_hand ?? 0)))
  }
  const inbound = new Map<number, number>()
  const approvedPos = new Set((await rowsOf(token, 'pur_orders')).filter(row => String(row.doc_status) === 'approved').map(row => Number(row.id)))
  for (const line of await rowsOf(token, 'pur_order_lines')) {
    if (!approvedPos.has(Number(line.order_id))) continue
    const id = Number(line.product_id)
    inbound.set(id, q4((inbound.get(id) ?? 0) + Math.max(0, Number(line.qty ?? 0) - Number(line.qty_received ?? 0))))
  }
  const wip = new Map<number, number>()
  for (const mo of (await rowsOf(token, 'mfg_orders')).filter(row => ['released', 'in_progress'].includes(String(row.doc_status)))) {
    const id = Number(mo.product_id)
    wip.set(id, q4((wip.get(id) ?? 0) + Number(mo.qty ?? 0)))
  }
  const reservedByProduct = new Map<number, number>()
  for (const row of (await rowsOf(token, 'wms_reservations')).filter(row => String(row.status) === 'reserved')) {
    const id = Number(row.product_id)
    reservedByProduct.set(id, q4((reservedByProduct.get(id) ?? 0) + Number(row.qty ?? 0)))
  }

  // W2-B2: the approved MPS plan (the latest one by period_from) becomes the
  // demand source for the items its rows cover — the covered item's SO feed
  // is mutually exclusive with the MPS rows (Odoo's official warning: MPS ×
  // direct replenishment double-counts), enforced here in code, not by
  // convention. With no approved plan the close keeps the W-round SO-only
  // behavior byte for byte (the zero-drift acceptance).
  const mpsPlans = await rowsOfOptionalCollection(token, 'mps_plans')
  const approvedMpsPlans = (mpsPlans ?? []).filter(row => String(row.doc_status) === 'approved')
  const activeMps = approvedMpsPlans.sort((a, b) => String(b.period_from ?? '').localeCompare(String(a.period_from ?? '')))[0]
  const mpsItems = activeMps === undefined
    ? []
    : (await rowsOf(token, 'mps_plan_items')).filter(row => Number(row.plan_id) === Number(activeMps.id))
  const covered = new Map<number, string>()
  for (const item of mpsItems) covered.set(Number(item.product_id), String(activeMps?.code ?? ''))

  // Independent demand: approved, not-shipped SO lines (the draft gate — a
  // draft SO never reaches this loop), skipping items the MPS plan covers.
  const approvedSos = new Map((await rowsOf(token, 'so_orders')).filter(row => String(row.doc_status) === 'approved' && String(row.shipping_status) !== 'shipped').map(row => [Number(row.id), row]))
  const soLines = (await rowsOf(token, 'so_order_lines')).filter(row => approvedSos.has(Number(row.order_id)))
  const gross0 = new Map<number, { qty: number, need: string, driver: string }>()
  for (const line of soLines) {
    const so = approvedSos.get(Number(line.order_id))
    const openQty = q4(Number(line.qty ?? 0) - Number(line.qty_shipped ?? 0))
    if (openQty <= 0) continue
    const id = Number(line.product_id)
    if (covered.has(id)) continue
    const need = String(so?.need_date ?? '')
    const entry = gross0.get(id)
    if (entry === undefined || need < entry.need) {
      gross0.set(id, { qty: q4((entry?.qty ?? 0) + openQty), need, driver: String(so?.code ?? '') })
    } else {
      entry.qty = q4(entry.qty + openQty)
    }
    if (need === '') undatedSos.push(String(so?.code ?? `#${String(so?.id ?? '?')}`))
  }
  if (undatedSos.length > 0) {
    console.warn(`mrp-run: 【需补交期】${String(undatedSos.length)} 张已生效销售订单缺 need_date，其需求不进 JIT 窗口（永不触发补货）——请补录交期：${undatedSos.slice(0, 8).join('、')}${undatedSos.length > 8 ? '…' : ''}`)
  }

  // The MPS rows ride the same gross0 aggregation (per item: qty sums across
  // periods, need keeps the earliest period's 月中锚点) with the driver
  // recorded as `mps:<plan.code>` — mrp_snapshots.driver_so and the
  // suggestion's driver_so_id already treat it as an opaque string.
  for (const item of mpsItems) {
    const id = Number(item.product_id)
    const qty = Number(item.planned_qty ?? 0)
    if (qty <= 0) continue
    const need = mpsNeedDateOf(String(item.period ?? ''))
    const driver = `mps:${String(activeMps?.code ?? '')}`
    const entry = gross0.get(id)
    if (entry === undefined || need < entry.need) {
      gross0.set(id, { qty: q4((entry?.qty ?? 0) + qty), need, driver })
    } else {
      entry.qty = q4(entry.qty + qty)
    }
  }
  if (covered.size > 0) {
    console.log(`mrp-run: MPS ${String(activeMps?.code ?? '')} covers ${String(covered.size)} item(s) — SO direct feed excluded, planned rows in`)
  }

  // The BOM graph (active BOMs only), SKU-keyed for the pure explosion.
  const boms = (await rowsOf(token, 'mfg_boms')).filter(row => String(row.bom_status) === 'active')
  const bomByParent = new Map<string, { id: number, isDefault: boolean }>()
  for (const bom of boms) {
    const parent = products.find(row => Number(row.id) === Number(bom.product_id))
    if (parent === undefined) continue
    const current = bomByParent.get(String(parent.sku))
    if (current === undefined || (bom.is_default === true && !current.isDefault)) {
      bomByParent.set(String(parent.sku), { id: Number(bom.id), isDefault: bom.is_default === true })
    }
  }
  const edges: Array<BomEdge & { bomId: number }> = []
  const bomLines = await rowsOf(token, 'mfg_bom_lines')
  for (const line of bomLines) {
    const bom = boms.find(row => Number(row.id) === Number(line.bom_id))
    const child = products.find(row => Number(row.id) === Number(line.product_id))
    if (bom === undefined || child === undefined) continue
    const parent = products.find(row => Number(row.id) === Number(bom.product_id))
    if (parent === undefined) continue
    edges.push({ parentSku: String(parent.sku), childSku: String(child.sku), qtyPerUnit: Number(line.qty_per_unit ?? 0), scrapPct: Number(line.scrap_pct ?? 0), bomId: Number(bom.id) })
  }

  // Level walk: level 0 = the SO-facing (finished/semi) products, deeper
  // levels are component demand. Each level nets before exploding further.
  const snapshots: Array<MrpSnapshotRow> = []
  const suggestions: Array<{ productId: number, planType: 'MO' | 'PR', qty: number, needDate: string | null, driverSo: string | null, bomId: number | null, level: number, mpsPlan: string | null }> = []
  let levelNet = new Map<string, number>()
  for (const [id, entry] of gross0) {
    const sku = String(products.find(row => Number(row.id) === id)?.sku ?? '')
    if (sku !== '') levelNet.set(sku, entry.qty)
  }
  const seen = new Set<string>()
  for (let level = 0; level <= MAX_BOM_DEPTH && levelNet.size > 0; level += 1) {
    const nextNet = new Map<string, number>()
    for (const [sku, gross] of levelNet) {
      if (seen.has(sku)) continue
      seen.add(sku)
      const productId = productIdOf(sku)
      if (productId === undefined) continue
      const safety = Number(products.find(row => row.sku === sku)?.safety_stock ?? 0)
      const oh = onHand.get(productId) ?? 0
      const inb = inbound.get(productId) ?? 0
      const wp = wip.get(productId) ?? 0
      const rsv = reservedByProduct.get(productId) ?? 0
      const net = netRequirement(gross, safety, oh, inb, wp, rsv)
      const source = level === 0 ? gross0.get(productId) : undefined
      // An empty need (the BP-15 undated-SO leg) stores null, not '' — the
      // date column refuses empty strings.
      const needDate = source === undefined || source.need === '' ? null : String(source.need)
      const driverSo = source === undefined ? null : String(source.driver)
      snapshots.push({ run_id: runId, run_date: runDate, product_id: productId, sku, gross, safety, on_hand: oh, inbound: inb, wip: wp, reserved: rsv, net, need_date: needDate, driver_so: driverSo, bom_level: level })
      if (net <= 0) continue
      if (needDate !== null && !jitInWindow(needDate, runDate, horizonDays)) continue
      const bom = bomByParent.get(sku)
      if (bom !== undefined) {
        suggestions.push({ productId, planType: 'MO', qty: net, needDate, driverSo, bomId: bom.id, level, mpsPlan: mpsPlanOf(driverSo) })
        nextNet.set(sku, net)
      } else {
        suggestions.push({ productId, planType: 'PR', qty: net, needDate, driverSo, bomId: null, level, mpsPlan: mpsPlanOf(driverSo) })
      }
    }
    if (nextNet.size === 0) break
    levelNet = explodeBomLevel(nextNet, edges)
  }

  // Persist the snapshot rows (append-only audit of every close).
  for (const row of snapshots) {
    await dataOf(token, 'POST', '/api/mrp_snapshots:create', {
      run_id: row.run_id, run_date: row.run_date, product: { id: row.product_id }, sku: row.sku,
      gross: row.gross, safety: row.safety, on_hand: row.on_hand, inbound: row.inbound, wip: row.wip,
      reserved: row.reserved, net: row.net, need_date: row.need_date, driver_so: row.driver_so, bom_level: row.bom_level,
    })
  }

  // Upsert the suggestions: refresh matching open rows, create new ones.
  const existing = await rowsOf(token, 'mrp_suggestions')
  let suggestionCount = 0
  for (const suggestion of suggestions) {
    const match = existing.find(row =>
      Number(row.product_id) === suggestion.productId
      && String(row.plan_type) === suggestion.planType
      && String(row.driver_so_id ?? '') === (suggestion.driverSo ?? '')
      && String(row.status) === 'open')
    const values = {
      run_id: runId, plan_type: suggestion.planType, product: { id: suggestion.productId }, qty: suggestion.qty,
      need_date: suggestion.needDate, suggest_date: suggestDateOf(suggestion.needDate ?? runDate, Number(products.find(row => Number(row.id) === suggestion.productId)?.lead_time_days ?? 0), runDate),
      driver_so_id: suggestion.driverSo, note: `BOM 展开第 ${String(suggestion.level)} 层`,
      // The MPS back-link rides only MPS-driven rows — the column is a W2-B2
      // additive field, so SO-driven rows must not name it at all (zero drift
      // against the W-round write set before the w7 seed adds the column).
      ...(suggestion.mpsPlan === null ? {} : { mps_plan: suggestion.mpsPlan }),
    }
    if (match !== undefined) {
      await dataOf(token, 'POST', `/api/mrp_suggestions:update?filterByTk=${match.id}`, values)
      continue
    }
    await dataOf(token, 'POST', '/api/mrp_suggestions:create', {
      ...values, status: 'open', converted_doc_type: null, converted_doc_id: null, converted_doc_code: null, converted_by: null, converted_at: null,
    })
    suggestionCount += 1
  }
  // Close open suggestions whose demand vanished this round.
  let staleClosed = 0
  const liveKeys = new Set(suggestions.map(row => `${String(row.productId)}|${row.planType}|${row.driverSo ?? ''}`))
  for (const row of existing.filter(row => String(row.status) === 'open')) {
    if (liveKeys.has(`${String(row.product_id)}|${String(row.plan_type)}|${String(row.driver_so_id ?? '')}`)) continue
    await dataOf(token, 'POST', `/api/mrp_suggestions:update?filterByTk=${row.id}`, { status: 'dismissed', note: '本轮日结无需求，自动关闭' })
    staleClosed += 1
  }

  console.log(`mrp-run: close ${runId} — ${String(snapshots.length)} snapshot row(s), ${String(suggestions.length)} live suggestion(s) (${String(suggestionCount)} new), ${String(staleClosed)} stale closed`)
  return { run_id: runId, snapshots: snapshots.length, suggestions: suggestions.length, stale_closed: staleClosed }
}

// ─── the MPS plan refresh (W2-B2) ───

/** One refreshed MPS item row (the recalc outcome the psql audit re-derives). */
export interface RecalcOutcome {
  readonly sku: string
  readonly period: string
  readonly so_open: number
  readonly forecast: number
  readonly planned: number
  readonly driver: 'so' | 'forecast'
}

/**
 * Refresh one MPS plan's item rows (idempotent): per (product, period) row,
 * re-aggregate the approved-not-shipped SO open qty whose need_date falls in
 * the period's month, re-run the max merge, and write so_open_qty /
 * planned_qty / driver back. Called at seed time (draft plans), on the
 * approval transition (the snapshot lock-in moment), and by --refresh-mps
 * for an approved plan a planner chooses to re-baseline (the soft time
 * fence: later SO changes never touch an approved plan on their own).
 * @param token - the root API token.
 * @param planId - the mps_plans row id.
 * @returns the refreshed rows, for the chain's hand-check assertions.
 */
export async function recalcPlan(token: string, planId: number): Promise<RecalcOutcome[]> {
  const plan = (await rowsOf(token, 'mps_plans')).find(row => Number(row.id) === planId)
  if (plan === undefined) throw new Error(`MPS 计划 #${String(planId)} 不存在`)
  const items = (await rowsOf(token, 'mps_plan_items')).filter(row => Number(row.plan_id) === planId)
  if (items.length === 0) {
    console.log(`mrp-run: MPS ${String(plan.code)} has no item rows (nothing to recalc)`)
    return []
  }
  const products = await rowsOf(token, 'hub_inv_products', 200)
  const approvedSos = new Map((await rowsOf(token, 'so_orders')).filter(row => String(row.doc_status) === 'approved' && String(row.shipping_status) !== 'shipped').map(row => [Number(row.id), row]))
  const soLines = (await rowsOf(token, 'so_order_lines')).filter(row => approvedSos.has(Number(row.order_id)))
  const outcome: RecalcOutcome[] = []
  for (const item of items) {
    const period = String(item.period ?? '')
    const id = Number(item.product_id)
    let soOpen = 0
    for (const line of soLines) {
      if (Number(line.product_id) !== id) continue
      const so = approvedSos.get(Number(line.order_id))
      const openQty = q4(Number(line.qty ?? 0) - Number(line.qty_shipped ?? 0))
      if (openQty <= 0) continue
      if (String(so?.need_date ?? '').slice(0, 7) !== period) continue
      soOpen = q4(soOpen + openQty)
    }
    const forecast = Number(item.forecast_qty ?? 0)
    const merged = mergeDemand(soOpen, forecast)
    await dataOf(token, 'POST', `/api/mps_plan_items:update?filterByTk=${item.id}`, {
      so_open_qty: soOpen, planned_qty: merged.plannedQty, driver: merged.driver,
    })
    const sku = String(products.find(row => Number(row.id) === id)?.sku ?? '')
    outcome.push({ sku, period, so_open: soOpen, forecast, planned: merged.plannedQty, driver: merged.driver })
  }
  console.log(`mrp-run: MPS ${String(plan.code)} recalc — ${String(outcome.length)} row(s): ${outcome.map(row => `${row.sku}@${row.period} max(${String(row.so_open)},${String(row.forecast)})=${String(row.planned)}(${row.driver})`).join('；')}`)
  return outcome
}

// ─── the plan-order confirmation ───

/** The confirmation outcome (the converted document's back-reference). */
export interface ConfirmResult {
  readonly suggestion_id: number
  readonly doc_type: 'mfg_orders' | 'pur_requests'
  readonly doc_id: number
  readonly doc_code: string
}

/**
 * Confirm one suggestion: convert an open MO suggestion into a draft
 * mfg_orders (active default BOM attached, driver chain recorded) or an open
 * PR suggestion into a draft pur_requests + its line. The draft then rides
 * its own B5/B3 approval flow — 转单带审批. Non-open suggestions refuse loud
 * (未确认建议不能转单 / 转单后防重复转).
 * @param token - the root API token.
 * @param suggestionId - the mrp_suggestions row id.
 * @param operator - the confirming user (audit element).
 * @returns the created document's back-reference.
 */
export async function confirmSuggestion(token: string, suggestionId: number, operator = 'admin'): Promise<ConfirmResult> {
  const suggestions = await rowsOf(token, 'mrp_suggestions')
  const suggestion = suggestions.find(row => Number(row.id) === suggestionId)
  if (suggestion === undefined) throw new Error(`转单被拒：MRP 建议 #${String(suggestionId)} 不存在`)
  if (String(suggestion.status) !== 'open') {
    throw new Error(`转单被拒：MRP 建议 #${String(suggestionId)} 状态为 ${String(suggestion.status)}——只有 open 建议可转单（防重复转单）`)
  }
  const products = await rowsOf(token, 'hub_inv_products', 200)
  const product = products.find(row => Number(row.id) === Number(suggestion.product_id))
  if (product === undefined) throw new Error(`转单被拒：建议物料 #${String(suggestion.product_id)} 不存在`)
  const qty = Number(suggestion.qty)
  const needDate = suggestion.need_date === null || suggestion.need_date === undefined || String(suggestion.need_date) === ''
    ? iso(14)
    : String(suggestion.need_date)
  const driverSo = suggestion.driver_so_id === null || suggestion.driver_so_id === undefined ? null : String(suggestion.driver_so_id)
  // W2-B2: an mps:-prefixed driver references the plan, not an SO — the
  // effective-source gate switches collections (a voided plan's open
  // suggestions refuse conversion, the soft-fence teardown).
  if (driverSo !== null && driverSo.startsWith('mps:')) {
    const io: NocoIO = {
      list: async (collection, filter) => {
        const query = filter === undefined ? '' : `&filter=${encodeURIComponent(JSON.stringify(filter))}`
        return await dataOf(token, 'GET', `/api/${collection}:list?pageSize=500${query}`) ?? []
      },
      get: async () => undefined,
      create: async () => { throw new Error('unused') },
      update: async () => { throw new Error('unused') },
      updateWhere: async () => { throw new Error('unused') },
      destroy: async () => { throw new Error('unused') },
    }
    await assertSourceEffective(io, 'mps_plans', driverSo.slice('mps:'.length), 'code', '主生产计划')
  } else if (driverSo !== null) {
    const io: NocoIO = {
      list: async (collection, filter) => {
        const query = filter === undefined ? '' : `&filter=${encodeURIComponent(JSON.stringify(filter))}`
        return await dataOf(token, 'GET', `/api/${collection}:list?pageSize=500${query}`) ?? []
      },
      get: async (collection, id) => await dataOf(token, 'GET', `/api/${collection}:get?filterByTk=${id}`) ?? undefined,
      create: async () => { throw new Error('unused') },
      update: async () => { throw new Error('unused') },
      updateWhere: async () => { throw new Error('unused') },
      destroy: async () => { throw new Error('unused') },
    }
    await assertSourceEffective(io, 'so_orders', driverSo, 'code', '销售订单')
  }
  let docType: 'mfg_orders' | 'pur_requests'
  let docId: number
  let docCode: string
  if (String(suggestion.plan_type) === 'MO') {
    docType = 'mfg_orders'
    const boms = (await rowsOf(token, 'mfg_boms')).filter(row => Number(row.product_id) === Number(suggestion.product_id) && String(row.bom_status) === 'active')
    const bom = boms.find(row => row.is_default === true) ?? boms[0]
    if (bom === undefined) throw new Error(`转单被拒：物料 ${String(product.sku)} 无生效 BOM（建议类型 MO 但 BOM 已退役——重跑日结刷新建议）`)
    docCode = await nextCode(token, 'mfg_orders', 'code', 'MO')
    const row = await dataOf(token, 'POST', '/api/mfg_orders:create', {
      code: docCode, product: { id: Number(product.id) }, qty, bom: { id: Number(bom.id) },
      need_date: needDate, doc_status: 'draft', reservation_state: 'none',
      driver_suggestion_id: suggestionId, driver_so_code: driverSo,
    })
    docId = Number(row.id)
    console.log(`mrp-run: suggestion #${String(suggestionId)} → MO ${docCode} (draft, BOM ${String(bom.code)})`)
  } else {
    docType = 'pur_requests'
    docCode = await nextCode(token, 'pur_requests', 'code', 'PR')
    const row = await dataOf(token, 'POST', '/api/pur_requests:create', {
      code: docCode, requester: operator, department: '计划物控',
      need_date: needDate, reason: `MRP 采购建议转单（${driverSo === null ? '安全库存回补' : `驱动 ${driverSo}`}）`,
      doc_status: 'draft', driver_suggestion_id: suggestionId, driver_so_code: driverSo,
    })
    docId = Number(row.id)
    await dataOf(token, 'POST', '/api/pur_request_lines:create', {
      request: { id: docId }, product: { id: Number(product.id) }, qty,
    })
    console.log(`mrp-run: suggestion #${String(suggestionId)} → PR ${docCode} (draft, ×${String(qty)})`)
  }
  await dataOf(token, 'POST', `/api/mrp_suggestions:update?filterByTk=${suggestionId}`, {
    status: 'converted', converted_doc_type: docType, converted_doc_id: docId, converted_doc_code: docCode,
    converted_by: operator, converted_at: todayIso(),
  })
  return { suggestion_id: suggestionId, doc_type: docType, doc_id: docId, doc_code: docCode }
}

/**
 * Dismiss one open suggestion (the plan card's 忽略 action, audited).
 * @param token - the root API token.
 * @param suggestionId - the mrp_suggestions row id.
 * @param operator - the dismissing user (audit element).
 */
export async function dismissSuggestion(token: string, suggestionId: number, operator = 'admin'): Promise<void> {
  const suggestions = await rowsOf(token, 'mrp_suggestions')
  const suggestion = suggestions.find(row => Number(row.id) === suggestionId)
  if (suggestion === undefined) throw new Error(`忽略被拒：MRP 建议 #${String(suggestionId)} 不存在`)
  if (String(suggestion.status) !== 'open') {
    throw new Error(`忽略被拒：MRP 建议 #${String(suggestionId)} 状态为 ${String(suggestion.status)}——只有 open 建议可忽略`)
  }
  await dataOf(token, 'POST', `/api/mrp_suggestions:update?filterByTk=${suggestionId}`, {
    status: 'dismissed', converted_by: operator, converted_at: todayIso(), note: `人工忽略（${operator}）`,
  })
  console.log(`mrp-run: suggestion #${String(suggestionId)} dismissed by ${operator}`)
}

/**
 * W5-B4/BP-07: confirm one open ROP suggestion (wms_reorder_suggestions). The
 * default `pr` mode mints a draft pur_requests row (code + one line, the
 * MRP-side confirmSuggestion shape) and lands converted with the
 * back-reference columns; the `manual` mode lands confirmed — the buyer
 * replenishes off-platform, the row stays as the audit trail. Either way the
 * status machine is open → confirmed|converted (never back).
 * @param token - the root API token.
 * @param suggestionId - the wms_reorder_suggestions row id.
 * @param operator - the confirming user (audit element).
 * @param mode - pr (default) creates the purchase request; manual marks the off-platform buy.
 * @returns the created PR's code (pr mode) or null (manual mode).
 */
export async function confirmReorderSuggestion(token: string, suggestionId: number, operator = 'admin', mode: 'pr' | 'manual' = 'pr'): Promise<string | null> {
  const suggestions = await rowsOf(token, 'wms_reorder_suggestions')
  const suggestion = suggestions.find(row => Number(row.id) === suggestionId)
  if (suggestion === undefined) throw new Error(`确认被拒：补货建议 #${String(suggestionId)} 不存在`)
  if (String(suggestion.status) !== 'open' && String(suggestion.status) !== 'confirmed') {
    throw new Error(`确认被拒：补货建议 #${String(suggestionId)} 状态为 ${String(suggestion.status)}——只有 open 建议可确认`)
  }
  const productId = Number(suggestion.product_id)
  const qty = Number(suggestion.suggest_qty)
  if (mode === 'manual') {
    await dataOf(token, 'POST', `/api/wms_reorder_suggestions:update?filterByTk=${suggestionId}`, {
      status: 'confirmed', converted_by: operator, converted_at: todayIso(),
      note: `${String(suggestion.note ?? '')}；人工确认线下采购（${operator}）`,
    })
    console.log(`mrp-run: reorder #${String(suggestionId)} confirmed (manual) by ${operator}`)
    return null
  }
  const docCode = await nextCode(token, 'pur_requests', 'code', 'PR')
  const pr = await dataOf(token, 'POST', '/api/pur_requests:create', {
    code: docCode, requester: operator, department: '计划物控',
    need_date: todayIso(), reason: `ROP 补货建议转单（建议 #${String(suggestionId)}，ATP ${String(suggestion.on_hand_atp)} ≤ 再订货点 ${String(suggestion.min)}）`,
    doc_status: 'draft', driver_suggestion_id: suggestionId,
  })
  await dataOf(token, 'POST', '/api/pur_request_lines:create', {
    request: { id: Number(pr.id) }, product: { id: productId }, qty,
  })
  await dataOf(token, 'POST', `/api/wms_reorder_suggestions:update?filterByTk=${suggestionId}`, {
    status: 'converted', converted_doc_code: docCode, converted_by: operator, converted_at: todayIso(),
  })
  console.log(`mrp-run: reorder #${String(suggestionId)} → PR ${docCode} (draft, ×${String(qty)})`)
  return docCode
}

/**
 * W5-B4/BP-07: dismiss one open ROP suggestion (the audited 忽略; a stale row
 * the nightly scan auto-closes carries its own note instead).
 * @param token - the root API token.
 * @param suggestionId - the wms_reorder_suggestions row id.
 * @param operator - the dismissing user (audit element).
 */
export async function dismissReorderSuggestion(token: string, suggestionId: number, operator = 'admin'): Promise<void> {
  const suggestions = await rowsOf(token, 'wms_reorder_suggestions')
  const suggestion = suggestions.find(row => Number(row.id) === suggestionId)
  if (suggestion === undefined) throw new Error(`忽略被拒：补货建议 #${String(suggestionId)} 不存在`)
  if (String(suggestion.status) !== 'open') {
    throw new Error(`忽略被拒：补货建议 #${String(suggestionId)} 状态为 ${String(suggestion.status)}——只有 open 建议可忽略`)
  }
  await dataOf(token, 'POST', `/api/wms_reorder_suggestions:update?filterByTk=${suggestionId}`, {
    status: 'dismissed', converted_by: operator, converted_at: todayIso(),
    note: `${String(suggestion.note ?? '')}；人工忽略（${operator}）`,
  })
  console.log(`mrp-run: reorder #${String(suggestionId)} dismissed by ${operator}`)
}

// ─── the SO-facing reservation + shipping ───

/** One line's reservation outcome (top-up semantics: 可用则 assigned). */
export interface SoReserveLine {
  readonly sku: string
  readonly owed: number
  readonly alreadyReserved: number
  readonly reservedNow: number
  readonly shortfall: number
}

/** The SO reservation outcome the CLI prints. */
export interface SoReserveResult {
  readonly so_code: string
  readonly lines: ReadonlyArray<SoReserveLine>
}

/**
 * Reserve the finished goods an approved SO still owes — the approval
 * effect (生效瞬间生成预留). Idempotent per reservation code; re-runs top up
 * toward the still-owed quantity and report the shortfall instead of
 * refusing (部分缺料是正常业务态). The SO must sit approved (the engine-side
 * gate; a draft SO refuses loud).
 * @param token - the root API token.
 * @param soCode - the so_orders code.
 * @returns the per-line reservation outcome.
 */
export async function reserveForSo(token: string, soCode: string): Promise<SoReserveResult> {
  const sos = await rowsOf(token, 'so_orders')
  const so = sos.find(row => String(row.code) === soCode)
  if (so === undefined) throw new Error(`预留被拒：销售订单 ${soCode} 不存在`)
  if (String(so.doc_status) !== 'approved') {
    throw new Error(`预留被拒：销售订单 ${soCode} 审批状态为 ${String(so.doc_status)}——SO 生效后才可预留成品（卡口）`)
  }
  const products = await rowsOf(token, 'hub_inv_products', 200)
  const lines = (await rowsOf(token, 'so_order_lines')).filter(row => Number(row.order_id) === Number(so.id))
  const reservations = (await rowsOf(token, 'wms_reservations')).filter(row => row.ref_type === 'SO' && String(row.ref_id) === soCode)
  const outcome: SoReserveLine[] = []
  let attempt = reservations.reduce((max, row) => Math.max(max, Number(/-(\d+)$/.exec(String(row.code ?? ''))?.[1] ?? 0)), 0)
  for (const line of lines) {
    const product = products.find(row => Number(row.id) === Number(line.product_id))
    if (product === undefined) throw new Error(`预留被拒：SO ${soCode} 行物料 #${String(line.product_id)} 不存在`)
    const owed = q4(Number(line.qty ?? 0) - Number(line.qty_shipped ?? 0))
    // Only live reservations hold ATP; consumed ones are already-shipped
    // (owed already nets them out via qty_shipped).
    const alreadyReserved = q4(reservations.filter(row => Number(row.product_id) === Number(line.product_id) && String(row.status) === 'reserved').reduce((total, row) => total + Number(row.qty ?? 0), 0))
    const want = q4(owed - alreadyReserved)
    if (want <= 0) {
      outcome.push({ sku: String(product.sku), owed, alreadyReserved, reservedNow: 0, shortfall: 0 })
      continue
    }
    // 可用则 assigned：先按全量试，FEFO 无单行足额或 ATP 不足时逐步减半试探，
    // 至少保底 1（不足 1 时跳过并记缺口）——部分预留优于全无。
    let reservedNow = 0
    let ask = want
    while (ask >= 1) {
      attempt += 1
      const code = `RSV-SO-${soCode}-${String(attempt).padStart(2, '0')}`
      try {
        await reserve(token, code, 'SO', soCode, String(product.sku), ask)
        reservedNow = ask
        break
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        if (message.includes('already exists')) break
        ask = Math.floor(ask / 2)
        if (ask < 1) break
      }
    }
    outcome.push({ sku: String(product.sku), owed, alreadyReserved, reservedNow, shortfall: q4(want - reservedNow) })
  }
  console.log(`mrp-run: SO ${soCode} 预留 → ${outcome.map(row => `${row.sku} 欠 ${String(row.owed)}（已有 ${String(row.alreadyReserved)}）+${String(row.reservedNow)}${row.shortfall > 0 ? ` 缺 ${String(row.shortfall)}` : ''}`).join('；')}`)
  return { so_code: soCode, lines: outcome }
}

/** The shipping outcome (per line + the recomputed status). */
export interface ShipSoResult {
  readonly so_code: string
  readonly shipped_lines: number
  readonly shipping_status: string
}

/**
 * Ship one SO against its reservations: consume each reserved line, post the
 * SHIPMENT_SO stock leg (the engine's optimistic-lock + ledger path), then
 * recompute qty_shipped per line and shipping_status on the order
 * (none → partial → shipped).
 * @param token - the root API token.
 * @param soCode - the so_orders code.
 * @returns the shipping summary.
 */
export async function shipSo(token: string, soCode: string): Promise<ShipSoResult> {
  const sos = await rowsOf(token, 'so_orders')
  const so = sos.find(row => String(row.code) === soCode)
  if (so === undefined) throw new Error(`发货被拒：销售订单 ${soCode} 不存在`)
  if (String(so.doc_status) !== 'approved') {
    throw new Error(`发货被拒：销售订单 ${soCode} 审批状态为 ${String(so.doc_status)}——生效订单才可发货`)
  }
  const lines = (await rowsOf(token, 'so_order_lines')).filter(row => Number(row.order_id) === Number(so.id))
  const reservations = (await rowsOf(token, 'wms_reservations')).filter(row => row.ref_type === 'SO' && String(row.ref_id) === soCode && String(row.status) === 'reserved')
  if (reservations.length === 0) throw new Error(`发货被拒：SO ${soCode} 无有效预留——先 --reserve-so 或等完工放行补预留`)
  const lots = await rowsOf(token, 'wms_lots')
  let shippedLines = 0
  for (const line of lines) {
    const lineReservations = reservations.filter(row => Number(row.product_id) === Number(line.product_id))
    if (lineReservations.length === 0) continue
    let shipped = Number(line.qty_shipped ?? 0)
    for (const reservation of lineReservations) {
      const qty = Number(reservation.qty ?? 0)
      const lot = lots.find(row => Number(row.id) === Number(reservation.lot_id))
      await consumeReservation(token, String(reservation.code))
      // W2-B3: the movement rides the engine's single writer (biz_date filled).
      await appendMovement(token, {
        move_type: 'SHIPMENT_SO', doc_no: soCode,
        product: { id: Number(reservation.product_id) }, lot: { id: Number(reservation.lot_id) },
        from_bin: { id: Number(reservation.bin_id) }, qty: -qty,
        note: `SO 发货出库（${soCode}，批次 ${String(lot?.lot_no ?? '')}）`,
      })
      // The on-hand draw rides the engine's only stock writer (the B6
      // issue pattern); consume already returned the allocation.
      await applyStockDelta(token, { productId: Number(reservation.product_id), binId: Number(reservation.bin_id), lotId: Number(reservation.lot_id) }, -qty)
      // W5-B4/BP-11: the shipment leg lands a wms_shipments row (sales type,
      // posted) so the outbound ledger and its stat cards see SO shipping —
      // the manual-shipment track no longer stands alone.
      const shipmentNo = `SHP-SO-${soCode}`
      const existing = (await rowsOf(token, 'wms_shipments')).find(row => String(row.shipment_no) === shipmentNo && Number(row.product_id) === Number(reservation.product_id) && Number(row.lot_id) === Number(reservation.lot_id))
      if (existing === undefined) {
        await dataOf(token, 'POST', '/api/wms_shipments:create', {
          shipment_no: shipmentNo, shipment_type: 'sales', status: 'posted',
          product: { id: Number(reservation.product_id) }, lot: { id: Number(reservation.lot_id) },
          from_bin: { id: Number(reservation.bin_id) }, qty,
          note: `SO ${soCode} 发货出库（${String(lot?.lot_no ?? '')}）`,
        })
      } else {
        await dataOf(token, 'POST', `/api/wms_shipments:update?filterByTk=${existing.id}`, { qty: q4(Number(existing.qty ?? 0) + qty) })
      }
      shipped = q4(shipped + qty)
    }
    await dataOf(token, 'POST', `/api/so_order_lines:update?filterByTk=${line.id}`, { qty_shipped: shipped })
    shippedLines += 1
  }
  const refreshed = (await rowsOf(token, 'so_order_lines')).filter(row => Number(row.order_id) === Number(so.id))
  const status = refreshed.every(row => Number(row.qty_shipped ?? 0) >= Number(row.qty ?? 0) - 1e-9)
    ? 'shipped'
    : refreshed.some(row => Number(row.qty_shipped ?? 0) > 0) ? 'partial' : 'none'
  // shipped_at lands only on the fully-shipped transition (the OTIF
  // on-time anchor the B9 KPI engine reads).
  await dataOf(token, 'POST', `/api/so_orders:update?filterByTk=${so.id}`, {
    shipping_status: status,
    ...(status === 'shipped' ? { shipped_at: todayIso() } : {}),
  })
  console.log(`mrp-run: SO ${soCode} 发货 ${String(shippedLines)} 行 → shipping_status=${status}`)
  return { so_code: soCode, shipped_lines: shippedLines, shipping_status: status }
}

// ─── selftest (pure layer + in-memory explosion, no NocoBase) ───

/** One selftest assertion (deep-compare; throws with the label on failure). */
function expect(that: string, actual: unknown, expected: unknown): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`selftest 失败：${that} — 期望 ${JSON.stringify(expected)}，实际 ${JSON.stringify(actual)}`)
  }
}

/**
 * The pure-layer selftest: the net-requirement formula (the acceptance's
 * hand-check 100 − 50 − 20 = 30 plus the safety/reservation terms), the JIT
 * window bounds, the suggest-date floor, the two-level BOM explosion with
 * scrap aggregation, and the level-walk shape over a shared component.
 */
export async function selftest(): Promise<void> {
  // The formula: 需求100 库存50 在途20 → 30.
  expect('净需求 100−50−20', netRequirement(100, 0, 50, 20, 0, 0), 30)
  // Safety stock rides the demand side; reservations ride back on.
  expect('安全库存加项', netRequirement(100, 40, 50, 20, 0, 0), 70)
  expect('在制冲减', netRequirement(100, 0, 50, 20, 10, 0), 20)
  expect('硬预留占用加回', netRequirement(100, 0, 50, 20, 0, 30), 60)
  expect('覆盖为负（调用方夹 0）', netRequirement(50, 0, 80, 20, 0, 0), -50)

  // The JIT window: today in, horizon edge in, beyond out, past-due out.
  const today = '2026-09-26'
  expect('今日需求在窗口内', jitInWindow(today, today), true)
  expect('窗口边界含等号', jitInWindow('2026-11-25', today), true)
  expect('超窗口不生成', jitInWindow('2026-11-26', today), false)
  expect('过期需求不生成', jitInWindow('2026-09-25', today), false)

  // The suggest date: need − lead time, floored at today.
  expect('建议日=需求日−提前期', suggestDateOf('2026-10-10', 7, today), '2026-10-03')
  expect('建议日下限=今天', suggestDateOf('2026-09-30', 7, today), today)

  // Two-level explosion: parents P1 (net 100) and P2 (net 50) both consume
  // C1; C1 also feeds S1 (a semi-finished child of P1).
  const edges: BomEdge[] = [
    { parentSku: 'P1', childSku: 'C1', qtyPerUnit: 2, scrapPct: 5 },
    { parentSku: 'P1', childSku: 'S1', qtyPerUnit: 1, scrapPct: 0 },
    { parentSku: 'P2', childSku: 'C1', qtyPerUnit: 1, scrapPct: 10 },
    { parentSku: 'S1', childSku: 'C1', qtyPerUnit: 0.5, scrapPct: 0 },
  ]
  const level1 = explodeBomLevel(new Map([['P1', 100], ['P2', 50]]), edges)
  expect('一层展开聚合去重', [...level1.entries()].sort(), [['C1', 265], ['S1', 100]])
  // Level two explodes S1's net (say 40) into its own C1 demand.
  const level2 = explodeBomLevel(new Map([['S1', 40]]), edges)
  expect('二层展开', [...level2.entries()], [['C1', 20]])

  // W2-B2 the max merge (ERPNext v16): forecast wins, SO wins, tie rides so.
  expect('max 合并·预测取大', mergeDemand(300, 500), { plannedQty: 500, driver: 'forecast' })
  expect('max 合并·SO 取大', mergeDemand(700, 400), { plannedQty: 700, driver: 'so' })
  expect('max 合并·平手归 SO', mergeDemand(400, 400), { plannedQty: 400, driver: 'so' })
  expect('max 合并·零需求', mergeDemand(0, 0), { plannedQty: 0, driver: 'so' })
  expect('MPS 月中锚点', mpsNeedDateOf('2026-10'), '2026-10-15')

  // W2-B2 the horizon override: unset, valid, and the loud refusals.
  const failureOf = (body: () => unknown): string => {
    try {
      body()
    } catch (error) {
      return error instanceof Error ? error.message : String(error)
    }
    throw new Error('本应被拒绝却成功了')
  }
  expect('JIT 窗缺省', parseHorizonDays(undefined), undefined)
  expect('JIT 窗 120 天', parseHorizonDays('120'), 120)
  expect('JIT 窗拒绝非整数', failureOf(() => parseHorizonDays('abc')), 'MRP_HORIZON_DAYS 必须是正整数（收到 "abc"）——JIT 窗覆盖配置拒绝静默回退')
  expect('JIT 窗拒绝零', failureOf(() => parseHorizonDays('0')), 'MRP_HORIZON_DAYS 必须是正整数（收到 "0"）——JIT 窗覆盖配置拒绝静默回退')

  console.log('mrp-run: selftest OK — 净需求公式（含安全/在制/预留三项）/JIT 窗口边界/建议日下限/两层 BOM 展开聚合/max 合并（W2-B2）/JIT 窗覆盖（W2-B2） 全部通过')
}

// ─── CLI ───

async function main(): Promise<void> {
  const args = process.argv.slice(2)
  if (args.includes('--selftest')) {
    await selftest()
    return
  }
  const token = await signInWithRetry()
  if (args.includes('--run-mrp')) {
    await runMrp(token)
    return
  }
  const refreshIndex = args.indexOf('--refresh-mps')
  if (refreshIndex >= 0) {
    const planId = Number(args[refreshIndex + 1])
    if (!Number.isInteger(planId) || planId < 1) throw new Error('--refresh-mps 需要正整数计划 id（mps_plans 行 id）')
    await recalcPlan(token, planId)
    return
  }
  const confirmIndex = args.indexOf('--confirm')
  if (confirmIndex >= 0) {
    await confirmSuggestion(token, Number(args[confirmIndex + 1]), args[confirmIndex + 2] ?? 'admin')
    return
  }
  const dismissIndex = args.indexOf('--dismiss')
  if (dismissIndex >= 0) {
    await dismissSuggestion(token, Number(args[dismissIndex + 1]), args[dismissIndex + 2] ?? 'admin')
    return
  }
  const confirmReorderIndex = args.indexOf('--confirm-reorder')
  if (confirmReorderIndex >= 0) {
    await confirmReorderSuggestion(token, Number(args[confirmReorderIndex + 1]), args[confirmReorderIndex + 2] ?? 'admin', args.includes('--manual') ? 'manual' : 'pr')
    return
  }
  const dismissReorderIndex = args.indexOf('--dismiss-reorder')
  if (dismissReorderIndex >= 0) {
    await dismissReorderSuggestion(token, Number(args[dismissReorderIndex + 1]), args[dismissReorderIndex + 2] ?? 'admin')
    return
  }
  const reserveIndex = args.indexOf('--reserve-so')
  if (reserveIndex >= 0) {
    await reserveForSo(token, String(args[reserveIndex + 1]))
    return
  }
  const shipIndex = args.indexOf('--ship-so')
  if (shipIndex >= 0) {
    await shipSo(token, String(args[shipIndex + 1]))
    return
  }
  void here
  throw new Error('用法：--selftest | --run-mrp | --confirm <id> [operator] | --dismiss <id> [operator] | --reserve-so <soCode> | --ship-so <soCode>')
}

// Library imports (approval-engine's serve route) must not run the CLI.
if (process.argv[1] !== undefined && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  await main()
}
