/**
 * W6-B7: the SCM sourcing face — the three-axis bid-comparison matrix
 * (price / lead-time / quality), scorecard-linked admission, the award CAS
 * that mints the PO with a transparent scoring receipt, and the procurement
 * group page re-shape (matrix + swimlane + two real charts; pure-table pages
 * 7/8 → ≤4/8).
 *
 * 1. pur_sourcing_config: the one-row weight configuration (price / lead /
 *    quality weights summing to 100, preventRatings, warnRatings). No
 *    hardcoded tunables: the matrix block edits it through POST
 *    /sourcing/config and every recompute reads the row.
 * 2. Scoring (exported, the single computation source the engine handlers,
 *    the assert leg, and the UI all share): price score = min-price/price×100
 *    and lead score = min-lead/lead×100 within one RFQ×product group; quality
 *    score = the supplier's latest srm_score_cards.score_quality (period desc,
 *    id desc — a period may carry more than one row). Missing scorecard ⇒ the
 *    quality axis drops out and the remaining weights renormalize. Admission:
 *    lifecycle frozen/eliminated/blacklisted or rating in preventRatings ⇒
 *    prevent (award refused); restricted or rating in warnRatings ⇒ warn
 *    (rank tie-break pushes the row down + a visible badge).
 * 3. Award (POST /sourcing/award): identity is session-derived and fenced to
 *    采购部/admin on writes; the RFQ CAS (doc_status approved|sent → awarded,
 *    psql UPDATE … WHERE … RETURNING) makes a double click idempotent (same
 *    winner ⇒ ok.idempotent) and a re-award to a different supplier a 409.
 *    The winning quote is_won=true, losers flip to lost (cancel) or backup
 *    (reserve), a PO (+line) is minted with the scoring receipt in
 *    compare_note, and the PO rides the existing pur_orders approval flow.
 * 4. Pages (采购管理): 比价表 gains the w6b7-matrix JSBlock (additive, the
 *    recall-console pattern; the two quote tables stay as the retrieval
 *    auxiliary), 采购订单 gains the w6b7-po-board swimlane JSBlock (three
 *    status axes per card, RFQ back-link), 发票匹配 gains a match_result bar
 *    chart and 付款申请 a doc_status doughnut (the f4 authoring channel).
 *
 * Usage (repo root, tsx loader):
 *   node --import tsx/esm examples/kb-agent/scripts/w6b7-sourcing.mts --seed
 *   node --import tsx/esm examples/kb-agent/scripts/w6b7-sourcing.mts --demo
 *   node --import tsx/esm examples/kb-agent/scripts/w6b7-sourcing.mts --assert
 */
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dataOf, listFlowModels, listRoutes, signInWithRetry, withN17Prefix } from './nocobase-flow-page-lib.mts'
import { submitForApproval, type NocoIO } from './approval-engine.mts'
import { PO_BOARD_CODE, SOURCING_MATRIX_CODE } from './w6b7-blocks.mts'

const args = process.argv.slice(2)
const mode = args.includes('--seed') ? 'seed' : args.includes('--demo') ? 'demo' : 'assert'
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
const num = (raw: unknown): number => { const n = Number(raw); return Number.isFinite(n) ? n : 0 }
const round1 = (value: number): number => Math.round(value * 10) / 10

const ENGINE_BASE = process.env.W6B7_ENGINE_BASE ?? 'http://127.0.0.1:13110'
const NOCOBASE_BASE = process.env.W6B7_NOCOBASE_BASE ?? 'http://127.0.0.1:13000'

// ─── the weight configuration row ───

const CONFIG_COLLECTION = 'pur_sourcing_config'
const DEFAULT_WEIGHTS = { price: 50, lead: 30, quality: 20 }
const DEFAULT_PREVENT_RATINGS = ['D']
const DEFAULT_WARN_RATINGS = ['C']

/** The three scoring weights (each > 0, sum exactly 100). */
export interface SourcingWeights {
  readonly price: number
  readonly lead: number
  readonly quality: number
}

/** The full sourcing configuration: weights plus the admission rating sets. */
export interface SourcingConfig {
  readonly weights: SourcingWeights
  readonly preventRatings: readonly string[]
  readonly warnRatings: readonly string[]
}

const parseRatings = (raw: unknown): string[] => {
  const list = typeof raw === 'string' ? JSON.parse(raw === '' ? '[]' : raw) as unknown : raw
  return Array.isArray(list) ? list.map(value => String(value)) : []
}

/**
 * Read the sourcing configuration row (id=1; the seed row).
 * @param io - the NocoBase REST IO.
 * @returns the parsed weights and admission rating sets.
 */
export async function readSourcingConfig(io: NocoIO): Promise<SourcingConfig> {
  const rows = (await io.list(CONFIG_COLLECTION)) as Array<Record<string, unknown>>
  const row = rows.find(candidate => Number(candidate.id) === 1) ?? rows[0]
  if (row === undefined) {
    return { weights: DEFAULT_WEIGHTS, preventRatings: DEFAULT_PREVENT_RATINGS, warnRatings: DEFAULT_WARN_RATINGS }
  }
  return {
    weights: { price: num(row.weight_price), lead: num(row.weight_lead), quality: num(row.weight_quality) },
    preventRatings: parseRatings(row.prevent_ratings),
    warnRatings: parseRatings(row.warn_ratings),
  }
}

/**
 * Validate and persist new weights onto the configuration row.
 * @param io - the NocoBase REST IO.
 * @param weights - the three weights (each > 0, sum exactly 100).
 * @param actor - the session-derived writer (recorded on the row).
 * @throws Error when a weight is non-positive, non-finite, or the sum ≠ 100.
 */
export async function writeSourcingWeights(io: NocoIO, weights: SourcingWeights, actor: string): Promise<void> {
  const entries: ReadonlyArray<[string, number]> = [['price', weights.price], ['lead', weights.lead], ['quality', weights.quality]]
  for (const [name, value] of entries) {
    if (!Number.isFinite(value) || value <= 0) throw new Error(`权重 ${name}=${String(value)} 非法（应为正数）`)
  }
  const sum = weights.price + weights.lead + weights.quality
  if (Math.abs(sum - 100) > 1e-9) throw new Error(`权重和=${String(round1(sum))}≠100（价格/交期/质量三项须合计 100）`)
  const oldRow = psql(`SELECT weight_price, weight_lead, weight_quality FROM ${CONFIG_COLLECTION} WHERE id = 1;`).trim()
  if (oldRow === '') {
    psql(`INSERT INTO ${CONFIG_COLLECTION} (id, weight_price, weight_lead, weight_quality, prevent_ratings, warn_ratings, updated_by) VALUES (1, ${String(weights.price)}, ${String(weights.lead)}, ${String(weights.quality)}, '${JSON.stringify(DEFAULT_PREVENT_RATINGS)}', '${JSON.stringify(DEFAULT_WARN_RATINGS)}', ${sqlLit(actor)});`)
  } else {
    psql(`UPDATE ${CONFIG_COLLECTION} SET weight_price = ${String(weights.price)}, weight_lead = ${String(weights.lead)}, weight_quality = ${String(weights.quality)}, updated_by = ${sqlLit(actor)} WHERE id = 1;`)
  }
  // W6-R4: the config row's updated_by is overwrite-only — every weight change
  // also appends an immutable audit row (old → new, actor, timestamp).
  const oldWeights = oldRow === '' ? { note: 'seed-new' } : (() => {
    const [price, lead, quality] = oldRow.split('|')
    return { price: Number(price), lead: Number(lead), quality: Number(quality) }
  })()
  psql(`INSERT INTO pur_sourcing_weight_audit (actor, weights_old, weights_new) VALUES (${sqlLit(actor)}, ${sqlLit(JSON.stringify(oldWeights))}::jsonb, ${sqlLit(JSON.stringify(weights))}::jsonb);`)
}

// ─── the shared scoring core ───

/** One scored quote row of the matrix (every number the UI shows is here). */
export interface MatrixRow {
  readonly quote_id: number
  readonly supplier_id: number
  readonly supplier_name: string
  readonly lifecycle: string
  readonly blacklisted: boolean
  readonly rating: string
  readonly score_quality: number | null
  readonly period: string
  readonly qty: number
  readonly unit_price: number
  readonly total_price: number
  readonly lead_time_days: number | null
  readonly hist_avg_price: number | null
  readonly pass_rate: number | null
  readonly price_score: number
  readonly lead_score: number | null
  readonly quality_score: number | null
  readonly total_score: number
  readonly rank: number
  readonly admission: 'ok' | 'warn' | 'prevent'
  readonly admission_note: string
  readonly formula: string
}

/** One product group of the matrix (quotes ranked within the group). */
export interface MatrixGroup {
  readonly product_id: number
  readonly product_name: string
  readonly rows: readonly MatrixRow[]
}

/** The full matrix payload the /sourcing/matrix GET returns. */
export interface SourcingMatrix {
  readonly rfq_code: string
  readonly rfq_id: number
  readonly rfq_status: string
  readonly deadline: string
  readonly weights: SourcingWeights
  readonly preventRatings: readonly string[]
  readonly warnRatings: readonly string[]
  readonly groups: readonly MatrixGroup[]
  readonly awarded: boolean
  readonly awarded_po_code: string | null
  readonly awarded_supplier: string | null
}

const PREVENT_LIFECYCLE = new Set(['frozen', 'eliminated'])

/**
 * One quote's lead time as a scoreable value: null/undefined/<=0/non-finite
 * are all "not reported" — scoring them as 0 (the old num(null)=0) let one
 * missing lead poison min-lead and hand every valid supplier a lead score it
 * did not earn (W6-R4 lesson 21 / TC-08).
 * @param quote - the pur_quotes row.
 * @returns the positive lead days, or null when the supplier did not report.
 */
function rawLead(quote: Record<string, unknown>): number | null {
  const value = quote.lead_time_days
  if (value === null || value === undefined || value === '') return null
  const lead = Number(value)
  return Number.isFinite(lead) && lead > 0 ? lead : null
}

/**
 * Compute the three-axis comparison matrix for one RFQ: submitted quotes
 * grouped by product, each row scored against the group's best price and
 * shortest lead, quality from the latest scorecard, admission from the
 * lifecycle/rating fence, ranks with warn pushed below equal totals.
 * @param io - the NocoBase REST IO.
 * @param rfqCode - the pur_rfqs.code of the RFQ to score.
 * @returns the matrix (groups empty when no submitted quotes exist).
 */
export async function computeSourcingMatrix(io: NocoIO, rfqCode: string): Promise<SourcingMatrix> {
  const rfqs = (await io.list('pur_rfqs')) as Array<Record<string, unknown>>
  const rfq = rfqs.find(row => String(row.code) === rfqCode)
  if (rfq === undefined) throw new Error(`询价单 ${rfqCode} 不存在`)
  const config = await readSourcingConfig(io)
  const quotes = ((await io.list('pur_quotes')) as Array<Record<string, unknown>>)
    .filter(row => Number(row.rfq_id) === Number(rfq.id) && String(row.status) === 'submitted')
  const suppliers = (await io.list('srm_suppliers')) as Array<Record<string, unknown>>
  const products = (await io.list('hub_inv_products')) as Array<Record<string, unknown>>
  const supplierOf = (id: number): Record<string, unknown> | undefined => suppliers.find(row => Number(row.id) === id)
  const productOf = (id: number): Record<string, unknown> | undefined => products.find(row => Number(row.id) === id)

  // Latest scorecard per supplier: period desc then id desc (a period may
  // carry more than one row — the materializer appends).
  const latestCard = new Map<number, Record<string, unknown>>()
  for (const card of (await io.list('srm_score_cards')) as Array<Record<string, unknown>>) {
    const key = Number(card.supplier_id)
    const best = latestCard.get(key)
    if (best === undefined || String(card.period) > String(best.period)
      || (String(card.period) === String(best.period) && Number(card.id) > Number(best.id))) {
      latestCard.set(key, card)
    }
  }
  // IQC pass rate per supplier (completed verdicts only: passed / failed /
  // concession; pending is not a verdict yet).
  const passRate = new Map<number, { passed: number, done: number }>()
  for (const row of psql(`SELECT supplier_id, result, count(*) FROM qm_inspections WHERE supplier_id IS NOT NULL AND result IN ('passed','failed','concession') GROUP BY 1, 2;`).trim().split('\n')) {
    if (row === '') continue
    const [sid, result, count] = row.split('|')
    const entry = passRate.get(Number(sid)) ?? { passed: 0, done: 0 }
    entry.done += Number(count)
    if (result === 'passed') entry.passed += Number(count)
    passRate.set(Number(sid), entry)
  }
  // Historical awarded deal price per supplier×product (approved POs only).
  const histPrice = new Map<string, number>()
  for (const row of psql(`SELECT o.supplier_id, l.product_id, avg(l.unit_price) FROM pur_order_lines l JOIN pur_orders o ON o.id = l.order_id WHERE o.doc_status = 'approved' GROUP BY 1, 2;`).trim().split('\n')) {
    if (row === '') continue
    const [sid, pid, avg] = row.split('|')
    histPrice.set(`${sid}:${pid}`, Number(avg))
  }

  const admissionOf = (supplier: Record<string, unknown> | undefined, rating: string): { kind: 'ok' | 'warn' | 'prevent', note: string } => {
    if (supplier === undefined) return { kind: 'ok', note: '' }
    if (supplier.is_blacklisted === true) return { kind: 'prevent', note: '黑名单' }
    if (PREVENT_LIFECYCLE.has(String(supplier.lifecycle_status))) return { kind: 'prevent', note: `生命周期 ${String(supplier.lifecycle_status)}` }
    if (config.preventRatings.includes(rating)) return { kind: 'prevent', note: `评级 ${rating}∈prevent` }
    if (String(supplier.lifecycle_status) === 'restricted') return { kind: 'warn', note: '生命周期 restricted' }
    if (config.warnRatings.includes(rating)) return { kind: 'warn', note: `评级 ${rating}∈warn` }
    return { kind: 'ok', note: '' }
  }

  const groups: MatrixGroup[] = []
  const productIds = [...new Set(quotes.map(row => Number(row.product_id)))]
  for (const productId of productIds) {
    const groupQuotes = quotes.filter(row => Number(row.product_id) === productId)
    const minPrice = Math.min(...groupQuotes.map(row => num(row.unit_price)))
    const validLeads = groupQuotes.map(rawLead).filter((lead): lead is number => lead !== null)
    const minLead = validLeads.length === 0 ? null : Math.min(...validLeads)
    const scored: Array<Omit<MatrixRow, 'rank'>> = groupQuotes.map((quote) => {
      const supplier = supplierOf(Number(quote.supplier_id))
      const card = latestCard.get(Number(quote.supplier_id))
      const rating = card === undefined ? '' : String(card.rating ?? '')
      const quality = card === undefined || card.score_quality === null || card.score_quality === undefined ? null : num(card.score_quality)
      const price = num(quote.unit_price)
      const lead = rawLead(quote)
      const priceScore = price <= 0 ? 0 : round1(minPrice / price * 100)
      const leadScore = lead === null || minLead === null ? null : round1(minLead / lead * 100)
      const present: ReadonlyArray<{ w: number, s: number }> = [
        { w: config.weights.price, s: priceScore },
        ...(leadScore === null ? [] : [{ w: config.weights.lead, s: leadScore }]),
        ...(quality === null ? [] : [{ w: config.weights.quality, s: quality }]),
      ]
      const weightSum = present.reduce((acc, axis) => acc + axis.w, 0)
      const total = round1(present.reduce((acc, axis) => acc + axis.w * axis.s, 0) / weightSum)
      const admission = admissionOf(supplier, rating)
      const rate = passRate.get(Number(quote.supplier_id))
      const formula = [
        `价格分=¥${String(minPrice)}/¥${String(price)}×100=${String(priceScore)}`,
        leadScore === null ? '交期分=N/A（未报交期，本轴跳过并重归一）' : `交期分=${String(minLead)}/${String(lead)}天×100=${String(leadScore)}`,
        quality === null ? '质量分=N/A（无评分卡，本轴跳过并重归一）' : `质量分=${String(quality)}(${rating}·${String(card?.period ?? '')})`,
        `总分=(${present.map(axis => `${String(axis.w)}×${String(axis.s)}`).join('+')})/${String(weightSum)}=${String(total)}`,
      ].join('；')
      return {
        quote_id: Number(quote.id),
        supplier_id: Number(quote.supplier_id),
        supplier_name: String(supplier?.name ?? quote.supplier_id),
        lifecycle: String(supplier?.lifecycle_status ?? ''),
        blacklisted: supplier?.is_blacklisted === true,
        rating,
        score_quality: quality,
        period: String(card?.period ?? ''),
        qty: num(quote.qty),
        unit_price: price,
        total_price: round1(price * num(quote.qty)),
        lead_time_days: lead,
        hist_avg_price: histPrice.get(`${String(quote.supplier_id)}:${String(productId)}`) ?? null,
        pass_rate: rate === undefined || rate.done === 0 ? null : round1(rate.passed / rate.done * 100),
        price_score: priceScore,
        lead_score: leadScore,
        quality_score: quality,
        total_score: total,
        admission: admission.kind,
        admission_note: admission.note,
        formula,
      }
    })
    // Rank: total desc; on a tie an ok row outranks a warn row (the plan's
    // warn-demote rule; prevent rows keep their computed place but cannot win).
    const ordered = scored.slice().sort((a, b) =>
      b.total_score - a.total_score
      || (a.admission === 'warn' ? 1 : 0) - (b.admission === 'warn' ? 1 : 0))
    groups.push({
      product_id: productId,
      product_name: String(productOf(productId)?.name ?? productOf(productId)?.title ?? `#${String(productId)}`),
      rows: ordered.map((row, index) => ({ ...row, rank: index + 1 })),
    })
  }

  const awarded = String(rfq.doc_status) === 'awarded'
  let awardedPoCode: string | null = null
  let awardedSupplier: string | null = null
  if (awarded) {
    const poRow = psql(`SELECT o.code, s.name FROM pur_orders o JOIN srm_suppliers s ON s.id = o.supplier_id WHERE o.rfq_id = ${String(Number(rfq.id))} ORDER BY o.id DESC LIMIT 1;`).trim()
    if (poRow !== '') {
      const [code, ...rest] = poRow.split('|')
      awardedPoCode = code
      awardedSupplier = rest.join('|')
    }
  }
  return {
    rfq_code: rfqCode, rfq_id: Number(rfq.id), rfq_status: String(rfq.doc_status),
    deadline: String(rfq.deadline ?? ''),
    weights: config.weights, preventRatings: config.preventRatings, warnRatings: config.warnRatings,
    groups, awarded, awarded_po_code: awardedPoCode, awarded_supplier: awardedSupplier,
  }
}

/**
 * Record a PO submit-for-approval failure: a console.warn line (the engine
 * log) plus a pur_award_audit row (action='submit_failed') — the old silent
 * catch{} left the PO on draft with no queryable trace of why (W6-R4
 * lesson 24).
 * @param rfqId - the awarded RFQ's id (the audit row's award_id).
 * @param actor - the awarding user.
 * @param poCode - the PO whose submit failed.
 * @param stage - 'award' (first submit) or 'resubmit' (idempotent replay retry).
 * @param error - the thrown failure.
 */
function noteSubmitFailure(rfqId: number, actor: string, poCode: string, stage: string, error: unknown): void {
  const message = error instanceof Error ? error.message : String(error)
  console.warn(`[sourcing] PO ${poCode} 送审失败（${stage}，actor=${actor}）— ${message}（已留痕 pur_award_audit action=submit_failed）`)
  psql(`INSERT INTO pur_award_audit (award_id, actor, action, payload) VALUES (${String(rfqId)}, ${sqlLit(actor)}, 'submit_failed', ${sqlLit(JSON.stringify({ po_code: poCode, stage, error: message }))}::jsonb);`)
}

/**
 * The award CAS: fence and prevent already checked by the caller. Marks the
 * winner quote, flips losers to lost/backup, mints the PO (+line) with the
 * scoring receipt, moves the RFQ to awarded (awarded_at stamped in the same
 * transaction as the pur_award_audit row), converts the source PR when
 * present, and submits the PO through the pur_orders approval flow.
 * @param io - the NocoBase REST IO.
 * @param actor - the session-derived awarding user.
 * @param rfqCode - the RFQ being awarded.
 * @param winnerQuoteId - the pur_quotes.id chosen as the winner.
 * @param loserDisposition - cancel flips losers to lost; reserve keeps them as backup.
 * @returns the outcome (po_code, idempotent flag, scores, submitted_to).
 * @throws Error with the refusal reason — the route maps it to 403/409/500.
 */
export async function awardSourcing(io: NocoIO, actor: string, rfqCode: string, winnerQuoteId: number, loserDisposition: 'cancel' | 'reserve'): Promise<{
  ok: true
  idempotent: boolean
  rfq_code: string
  po_code: string
  po_id: number
  winner_supplier: string
  total_score: number
  submitted_to: string
  losers: ReadonlyArray<{ quote_id: number, status: string }>
}> {
  const rfqs = (await io.list('pur_rfqs')) as Array<Record<string, unknown>>
  const rfq = rfqs.find(row => String(row.code) === rfqCode)
  if (rfq === undefined) throw new Error(`询价单 ${rfqCode} 不存在`)
  const rfqId = Number(rfq.id)
  const status = String(rfq.doc_status)

  if (status === 'awarded') {
    const existingWinner = psql(`SELECT id FROM pur_quotes WHERE rfq_id = ${String(rfqId)} AND is_won = TRUE LIMIT 1;`).trim()
    const poRow = psql(`SELECT id, code, doc_status FROM pur_orders WHERE rfq_id = ${String(rfqId)} ORDER BY id DESC LIMIT 1;`).trim()
    const [poId, poCode, poStatus] = poRow === '' ? ['', '', ''] : poRow.split('|')
    if (existingWinner !== '' && Number(existingWinner) === winnerQuoteId && poCode !== '') {
      // W6-R4: a replay against a PO still on draft (its first submit failed)
      // must resubmit it — the old early return stranded the PO forever.
      if (poStatus === 'draft') {
        let resubmittedTo = ''
        try {
          const result = await submitForApproval(io, 'pur_orders', Number(poId), actor)
          resubmittedTo = String(result.to_state ?? '')
          psql(`INSERT INTO pur_award_audit (award_id, actor, action, payload) VALUES (${String(rfqId)}, ${sqlLit(actor)}, 'resubmit', ${sqlLit(JSON.stringify({ po_code: poCode, submitted_to: resubmittedTo }))}::jsonb);`)
        } catch (error) {
          noteSubmitFailure(rfqId, actor, poCode, 'resubmit', error)
          resubmittedTo = '（重送审失败——PO 保留草稿，失败已留痕 pur_award_audit）'
        }
        return { ok: true, idempotent: true, rfq_code: rfqCode, po_code: poCode, po_id: Number(poId), winner_supplier: '', total_score: 0, submitted_to: resubmittedTo, losers: [] }
      }
      psql(`INSERT INTO pur_award_audit (award_id, actor, action, payload) VALUES (${String(rfqId)}, ${sqlLit(actor)}, 'replay', ${sqlLit(JSON.stringify({ po_code: poCode }))}::jsonb);`)
      return { ok: true, idempotent: true, rfq_code: rfqCode, po_code: poCode, po_id: Number(poId), winner_supplier: '', total_score: 0, submitted_to: '', losers: [] }
    }
    throw new Error(`询价单 ${rfqCode} 已定标（PO ${poCode}，中标报价行 ${existingWinner}）——重复定标被拒（本次 winner=${String(winnerQuoteId)}）`)
  }
  if (status !== 'approved' && status !== 'sent') {
    throw new Error(`询价单 ${rfqCode} 状态为 ${status}，定标需已生效（approved）或已发出（sent）`)
  }

  const quotes = ((await io.list('pur_quotes')) as Array<Record<string, unknown>>)
    .filter(row => Number(row.rfq_id) === rfqId && String(row.status) === 'submitted')
  if (quotes.length < 2) throw new Error(`询价单 ${rfqCode} 有效报价不足两家（${String(quotes.length)}），无法定标`)
  const winner = quotes.find(row => Number(row.id) === winnerQuoteId)
  if (winner === undefined) throw new Error(`报价行 ${String(winnerQuoteId)} 不是询价单 ${rfqCode} 的有效已提交报价`)

  // The scorecard fence on the WINNER (losers may be anything — they lose).
  const config = await readSourcingConfig(io)
  const supplier = ((await io.list('srm_suppliers')) as Array<Record<string, unknown>>).find(row => Number(row.id) === Number(winner.supplier_id))
  const latestCard = new Map<number, Record<string, unknown>>()
  for (const card of (await io.list('srm_score_cards')) as Array<Record<string, unknown>>) {
    const key = Number(card.supplier_id)
    const best = latestCard.get(key)
    if (best === undefined || String(card.period) > String(best.period)
      || (String(card.period) === String(best.period) && Number(card.id) > Number(best.id))) latestCard.set(key, card)
  }
  const card = latestCard.get(Number(winner.supplier_id))
  const rating = card === undefined ? '' : String(card.rating ?? '')
  if (supplier !== undefined && (supplier.is_blacklisted === true || PREVENT_LIFECYCLE.has(String(supplier.lifecycle_status)))) {
    throw new Error(`供应商 ${String(supplier.name)} 准入 prevent（${supplier.is_blacklisted === true ? '黑名单' : `生命周期 ${String(supplier.lifecycle_status)}`}）——禁止定标`)
  }
  if (config.preventRatings.includes(rating)) {
    throw new Error(`供应商 ${String(supplier?.name ?? winner.supplier_id)} 最新评级 ${rating}∈prevent(${config.preventRatings.join('/')})——禁止定标（评分卡联动）`)
  }

  const matrix = await computeSourcingMatrix(io, rfqCode)
  const winnerRow = matrix.groups.flatMap(group => group.rows).find(row => row.quote_id === winnerQuoteId)

  const losers = quotes.filter(row => Number(row.id) !== winnerQuoteId)
  const loserStatus = loserDisposition === 'cancel' ? 'lost' : 'backup'
  const loserIds = losers.map(row => String(Number(row.id))).join(',')
  const poRows = (await io.list('pur_orders')) as Array<Record<string, unknown>>
  const poYear = String(new Date().getFullYear())
  const poSlot = poRows.reduce((acc, row) => { const code = String(row.code ?? ''); return new RegExp(`^PO-${poYear}-\\d+$`, 'u').test(code) ? Math.max(acc, Number(code.slice(poYear.length + 4))) : acc }, 0)
  const poCode = `PO-${poYear}-${String(poSlot + 1).padStart(4, '0')}`
  const payload = {
    winner_quote_id: winnerQuoteId, winner: winnerRow?.supplier_name ?? '', total_score: winnerRow?.total_score ?? 0,
    weights: config.weights, loser_disposition: loserDisposition, po_code: poCode,
  }
  // The award lands as one data-modifying CTE: the RFQ CAS (now also stamping
  // awarded_at), the winner/loser quote flips, and the pur_award_audit row
  // commit together — a crash can never leave a half-award (W6-R4 lesson 24).
  // The CAS must still hold: a concurrent award loses here (moved empty).
  const movedRow = psql(`WITH moved AS (
  UPDATE pur_rfqs SET doc_status = 'awarded', awarded_at = NOW() WHERE id = ${String(rfqId)} AND doc_status = ${sqlLit(status)} RETURNING id, awarded_at
), won AS (
  UPDATE pur_quotes SET is_won = TRUE WHERE id = ${String(winnerQuoteId)} AND EXISTS (SELECT 1 FROM moved) RETURNING id
), lost AS (
  UPDATE pur_quotes SET status = ${sqlLit(loserStatus)} WHERE id IN (${loserIds === '' ? '-1' : loserIds}) AND EXISTS (SELECT 1 FROM moved) RETURNING id
), audit AS (
  INSERT INTO pur_award_audit (award_id, actor, action, payload)
  SELECT m.id, ${sqlLit(actor)}, 'award', ${sqlLit(JSON.stringify(payload))}::jsonb FROM moved m
  WHERE NOT EXISTS (SELECT 1 FROM pur_award_audit a WHERE a.award_id = m.id AND a.action = 'award')
  RETURNING id
)
SELECT m.awarded_at, (SELECT count(*) FROM won) AS won_n, (SELECT count(*) FROM lost) AS lost_n, (SELECT count(*) FROM audit) AS audit_n FROM moved m;`).trim()
  if (movedRow === '') {
    throw new Error(`询价单 ${rfqCode} 定标 CAS 失败（状态已被并发修改）——重读后重试`)
  }
  const awardedAt = movedRow.split('|')[0] ?? ''

  const qty = num(winner.qty)
  const price = num(winner.unit_price)
  const winnerLead = rawLead(winner)
  const ladder = matrix.groups.flatMap(group => group.rows).map(row => `${row.supplier_name}¥${String(row.unit_price)}/${row.lead_time_days === null ? '交期N/A' : `${String(row.lead_time_days)}天`}=${String(row.total_score)}分`).join('；')
  const po = await io.create('pur_orders', {
    code: poCode,
    supplier: { id: Number(winner.supplier_id) }, rfq: { id: rfqId },
    amount: round1(qty * price), currency: 'CNY',
    need_date: new Date(Date.now() + 21 * 86_400_000).toISOString().slice(0, 10),
    ...(winnerLead === null ? {} : { expected_date: new Date(Date.now() + winnerLead * 86_400_000).toISOString().slice(0, 10) }),
    compare_note: `三维定标（权重 价格${String(config.weights.price)}/交期${String(config.weights.lead)}/质量${String(config.weights.quality)}）：${winnerRow?.formula ?? ''}；授标 ${winnerRow?.supplier_name ?? ''}（¥${String(price)}×${String(qty)}，排名#${String(winnerRow?.rank ?? 0)}）；比价：${ladder}；落选处置=${loserDisposition === 'cancel' ? '取消' : '保留后备'}；定标人 ${actor}；定标时间 ${awardedAt}`,
    doc_status: 'draft', receiving_status: 'none', invoice_status: 'no_invoice',
  })
  await io.create('pur_order_lines', {
    order: { id: Number(po.id) }, product: { id: Number(winner.product_id) },
    qty, unit_price: price, qty_received: 0,
  })
  if (rfq.pr_id !== null && rfq.pr_id !== undefined) {
    await io.updateWhere('pur_requests', { id: Number(rfq.pr_id), doc_status: 'approved' }, { doc_status: 'converted' })
  }

  let submittedTo = ''
  try {
    const result = await submitForApproval(io, 'pur_orders', Number(po.id), actor)
    submittedTo = String(result.to_state ?? '')
  } catch (error) {
    noteSubmitFailure(rfqId, actor, poCode, 'award', error)
    submittedTo = '（审批流未走——PO 保留草稿，失败已留痕 pur_award_audit）'
  }
  return {
    ok: true, idempotent: false, rfq_code: rfqCode, po_code: poCode, po_id: Number(po.id),
    winner_supplier: winnerRow?.supplier_name ?? '', total_score: winnerRow?.total_score ?? 0,
    submitted_to: submittedTo,
    losers: losers.map(row => ({ quote_id: Number(row.id), status: loserStatus })),
  }
}

// ─── the engine /sourcing/* surface (the HTTP loop in approval-engine.mts) ───

/**
 * Serve one /sourcing/* route (the engine calls this after CORS and actor
 * handling; failures return as { status, body } instead of throwing across
 * the HTTP boundary).
 * @param io - the NocoBase REST IO.
 * @param pathname - /sourcing/rfqs | /sourcing/matrix | /sourcing/config | /sourcing/awards | /sourcing/award.
 * @param method - GET or POST.
 * @param params - POST: the parsed JSON body; GET: the URL query params.
 * @param actor - the session-derived username (writes are fence-checked upstream).
 * @returns the HTTP outcome for writeJson.
 */
export async function sourcingRoute(io: NocoIO, pathname: string, method: string, params: Record<string, unknown>, actor: string): Promise<{ status: number, body: Record<string, unknown> }> {
  // W6-R4 lesson 22: every error body carries a machine-readable code plus a
  // message (error kept as the legacy alias — the JSBlock reads message||error).
  const fail = (status: number, code: string, message: string): { status: number, body: Record<string, unknown> } => ({ status, body: { ok: false, code, message, error: message } })
  if (pathname === '/sourcing/rfqs' && method === 'GET') {
    const rows = psql(`SELECT r.code, r.doc_status, r.deadline, count(q.id) AS submitted, sum(CASE WHEN q.is_won THEN 1 ELSE 0 END) AS won FROM pur_rfqs r LEFT JOIN pur_quotes q ON q.rfq_id = r.id AND q.status = 'submitted' WHERE r.doc_status IN ('approved','sent','awarded') GROUP BY r.id, r.code, r.doc_status, r.deadline ORDER BY r.id DESC;`).trim()
    const rfqs = rows === '' ? [] : rows.split('\n').map((line) => {
      const [code, docStatus, deadline, submitted, won] = line.split('|')
      return { code, doc_status: docStatus, deadline, submitted: Number(submitted), won: Number(won) }
    })
    return { status: 200, body: { ok: true, rfqs } }
  }
  if (pathname === '/sourcing/matrix' && method === 'GET') {
    try {
      const matrix = await computeSourcingMatrix(io, String(params['rfq'] ?? ''))
      return { status: 200, body: { ok: true, ...matrix } as Record<string, unknown> }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      // A bad/unknown RFQ must surface as 404 with a body the UI can toast —
      // the old path threw past the route into a bare 400 (W6-R4 lesson 22).
      return /不存在/.test(message) ? fail(404, 'rfq_not_found', `RFQ 不存在或已关闭：${message}`) : fail(500, 'matrix_failed', message)
    }
  }
  if (pathname === '/sourcing/config' && method === 'GET') {
    return { status: 200, body: { ok: true, ...(await readSourcingConfig(io)) } as Record<string, unknown> }
  }
  if (pathname === '/sourcing/config' && method === 'POST') {
    try {
      await writeSourcingWeights(io, { price: Number(params['weight_price']), lead: Number(params['weight_lead']), quality: Number(params['weight_quality']) }, actor)
    } catch (error) {
      return fail(400, 'bad_weights', error instanceof Error ? error.message : String(error))
    }
    log(`[sourcing] weights updated by ${actor}: price=${String(params['weight_price'])} lead=${String(params['weight_lead'])} quality=${String(params['weight_quality'])}`)
    return { status: 200, body: { ok: true, ...(await readSourcingConfig(io)) } as Record<string, unknown> }
  }
  if (pathname === '/sourcing/awards' && method === 'GET') {
    const rows = psql(`SELECT r.code, r.doc_status, o.code, s.name, o.amount, o.doc_status, o.need_date FROM pur_rfqs r JOIN pur_orders o ON o.rfq_id = r.id JOIN srm_suppliers s ON s.id = o.supplier_id WHERE r.doc_status = 'awarded' ORDER BY o.id DESC;`).trim()
    const awards = rows === '' ? [] : rows.split('\n').map((line) => {
      const [rfqCode, rfqStatus, poCode, winner, amount, poStatus, needDate] = line.split('|')
      return { rfq_code: rfqCode, rfq_status: rfqStatus, po_code: poCode, winner, amount: Number(amount), po_status: poStatus, need_date: needDate }
    })
    return { status: 200, body: { ok: true, awards } }
  }
  if (pathname === '/sourcing/award' && method === 'POST') {
    try {
      const disposition = String(params['loser_disposition'] ?? 'cancel')
      if (disposition !== 'cancel' && disposition !== 'reserve') return fail(400, 'bad_disposition', `loser_disposition 仅接受 cancel|reserve（收到 ${disposition}）`)
      const outcome = await awardSourcing(io, actor, String(params['rfq_code'] ?? ''), Number(params['winner_quote_id']), disposition)
      log(`[sourcing] award ${outcome.rfq_code} → ${outcome.po_code} by ${actor} (idempotent=${String(outcome.idempotent)})`)
      return { status: 200, body: outcome as unknown as Record<string, unknown> }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      // CAS conflicts are concurrency clashes, not permission refusals — a
      // double-click race maps to 409 so the UI can say 已定标 (W6-R4 A7).
      const status = /已定标|重复定标|CAS 失败/.test(message) ? 409 : /prevent|禁止|不足两家|不是.*报价|不存在|状态为/.test(message) ? 403 : 500
      const code = status === 409 ? 'already_awarded' : status === 403 ? 'refused' : 'award_failed'
      console.error(`[sourcing] award refused: ${message}`)
      return { status, body: { ok: false, code, message, error: message } }
    }
  }
  return fail(404, 'no_route', `no sourcing route ${method} ${pathname}`)
}

/** The usernames of 采购部 members (the sourcing fence population). */
function procurementUsernames(): Set<string> {
  const rows = psql(`SELECT u.username FROM "departmentsUsers" du JOIN users u ON u.id = du."userId" JOIN departments d ON d.id = du."departmentId" WHERE d.title = '采购部';`).trim()
  return new Set(rows === '' ? [] : rows.split('\n'))
}

/**
 * The sourcing write fence: 采购部 members plus admin (the ecoActor pattern —
 * the identity itself is already session-derived upstream).
 * @param io - the NocoBase REST IO.
 * @param actor - the session-derived username.
 * @throws Error naming the fence when the actor is outside 采购部/admin.
 */
export async function assertSourcingActor(io: NocoIO, actor: string): Promise<void> {
  void io
  if (actor === 'admin') return
  if (!procurementUsernames().has(actor)) {
    throw new Error(`比价定标限 采购部/admin 操作（${actor} 不在围栏内）`)
  }
}

/**
 * The sourcing READ fence (W6-R4 lesson 25): GET /sourcing/* serves 采购部
 * members plus admin/nocobase — the comparison matrix carries supplier
 * pricing, which sales/finance roles must not read. Writes stay on the
 * stricter assertSourcingActor.
 * @param io - the NocoBase REST IO.
 * @param actor - the session-derived username.
 * @throws Error naming the fence when the actor cannot read the matrix.
 */
export async function assertSourcingReader(io: NocoIO, actor: string): Promise<void> {
  void io
  if (actor === 'admin' || actor === 'nocobase') return
  if (!procurementUsernames().has(actor)) {
    throw new Error(`比价矩阵限 采购部/admin/nocobase 读取（${actor} 不在读围栏内）`)
  }
}

// ─── --seed: collection, enums, pages ───

const CONFIG_FIELDS = [
  { name: 'weight_price', type: 'double', interface: 'number', uiSchema: { type: 'number', 'x-component': 'InputNumber', title: '价格权重' } },
  { name: 'weight_lead', type: 'double', interface: 'number', uiSchema: { type: 'number', 'x-component': 'InputNumber', title: '交期权重' } },
  { name: 'weight_quality', type: 'double', interface: 'number', uiSchema: { type: 'number', 'x-component': 'InputNumber', title: '质量权重' } },
  { name: 'prevent_ratings', type: 'json', interface: 'json', uiSchema: { type: 'object', 'x-component': 'Input.JSON', title: '禁止定标评级' } },
  { name: 'warn_ratings', type: 'json', interface: 'json', uiSchema: { type: 'object', 'x-component': 'Input.JSON', title: '警示评级' } },
  { name: 'updated_by', type: 'string', interface: 'input', uiSchema: { type: 'string', 'x-component': 'Input', title: '最近调整人' } },
] as const

/**
 * Append missing select options to one collection field's stored enum (psql
 * jsonb_set — the REST field channel would rewrite the whole uiSchema).
 * @param collection - the collection name.
 * @param field - the field name.
 * @param addenda - options missing from the current enum are appended.
 */
function extendFieldEnum(collection: string, field: string, addenda: ReadonlyArray<{ value: string, label: string, color: string }>): void {
  const current = psql(`SELECT options->'uiSchema'->'enum' FROM fields WHERE "collectionName" = ${sqlLit(collection)} AND name = ${sqlLit(field)};`).trim()
  if (current === '') return
  const list = JSON.parse(current) as Array<Record<string, unknown>>
  const known = new Set(list.map(option => String(option.value)))
  const merged = [...list, ...addenda.filter(option => !known.has(option.value))]
  psql(`UPDATE fields SET options = jsonb_set(options::jsonb, '{uiSchema,enum}', ${sqlLit(JSON.stringify(merged))}::jsonb)::json WHERE "collectionName" = ${sqlLit(collection)} AND name = ${sqlLit(field)};`)
}

/**
 * Create pur_sourcing_config, seed the id=1 defaults row, and append the
 * awarded / lost / backup select options (idempotent).
 * @param token - the root API token.
 */
export async function ensureSourcingSeed(token: string): Promise<void> {
  const present = await dataOf(token, 'GET', `/api/collections/${CONFIG_COLLECTION}`)
    .then(row => (row as { name?: string } | null)?.name === CONFIG_COLLECTION)
    .catch(() => false)
  if (!present) {
    await dataOf(token, 'POST', '/api/collections:create', { name: CONFIG_COLLECTION, title: '比价定标配置', titleField: 'id', fields: CONFIG_FIELDS })
    log('w6b7-sourcing: collection pur_sourcing_config created')
  }
  if (psql(`SELECT count(*) FROM ${CONFIG_COLLECTION} WHERE id = 1;`).trim() === '0') {
    psql(`INSERT INTO ${CONFIG_COLLECTION} (id, weight_price, weight_lead, weight_quality, prevent_ratings, warn_ratings, updated_by) VALUES (1, ${String(DEFAULT_WEIGHTS.price)}, ${String(DEFAULT_WEIGHTS.lead)}, ${String(DEFAULT_WEIGHTS.quality)}, '${JSON.stringify(DEFAULT_PREVENT_RATINGS)}', '${JSON.stringify(DEFAULT_WARN_RATINGS)}', 'seed');`)
    log('w6b7-sourcing: config row id=1 seeded (weights 50/30/20, prevent [D], warn [C])')
  }
  extendFieldEnum('pur_rfqs', 'doc_status', [{ value: 'awarded', label: '已定标', color: 'purple' }])
  extendFieldEnum('pur_quotes', 'status', [
    { value: 'lost', label: '已落选', color: 'default' },
    { value: 'backup', label: '后备', color: 'cyan' },
  ])
  log('w6b7-sourcing: enum options awarded/lost/backup ensured')
  // W6-R4 lesson 24: the award's durable audit trail. pur_rfqs.awarded_at is
  // the when (backfilled for already-awarded rows); pur_award_audit carries
  // every award/replay/resubmit/submit_failed event; the partial unique index
  // makes one-won-quote-per-RFQ a database invariant (the crm_stage_audit and
  // ux_crm_quotes_converted precedents from w6b6).
  psql('ALTER TABLE pur_rfqs ADD COLUMN IF NOT EXISTS awarded_at TIMESTAMPTZ;')
  const backfilled = psql(`UPDATE pur_rfqs SET awarded_at = NOW() WHERE doc_status = 'awarded' AND awarded_at IS NULL;`)
  if (backfilled !== 'UPDATE 0') log(`w6b7-sourcing: pur_rfqs.awarded_at backfilled (${backfilled.replace(/^UPDATE /u, '')} rows)`)
  psql(`CREATE TABLE IF NOT EXISTS pur_award_audit (
  id BIGSERIAL PRIMARY KEY,
  award_id BIGINT NOT NULL,
  actor TEXT NOT NULL,
  action TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  ts TIMESTAMPTZ NOT NULL DEFAULT NOW());`)
  psql('CREATE INDEX IF NOT EXISTS ix_pur_award_audit_award ON pur_award_audit (award_id, ts);')
  psql('CREATE UNIQUE INDEX IF NOT EXISTS ux_pur_quotes_won_per_rfq ON pur_quotes (rfq_id) WHERE is_won;')
  psql(`CREATE TABLE IF NOT EXISTS pur_sourcing_weight_audit (
  id BIGSERIAL PRIMARY KEY,
  actor TEXT NOT NULL,
  weights_old JSONB NOT NULL,
  weights_new JSONB NOT NULL,
  ts TIMESTAMPTZ NOT NULL DEFAULT NOW());`)
  log('w6b7-sourcing: awarded_at + pur_award_audit + won-per-rfq unique index + pur_sourcing_weight_audit ensured')
}

/** Resolve one 采购管理 flowPage's grid uid (null when the page is absent). */
async function pageGridUid(token: string, pageTitle: string): Promise<string | null> {
  const routes = await listRoutes(token, 'W6B7-page')
  const page = routes.find(row => row.title === pageTitle && row.type === 'flowPage')
  if (page === undefined) return null
  const tab = routes.find(row => row.parentId === page.id && row.type === 'tabs')
  if (tab?.schemaUid == null) return null
  const grid = await dataOf(token, 'GET', `/api/flowModels:findOne?parentId=${tab.schemaUid}&subKey=grid`) as { uid?: string } | null
  return grid?.uid ?? null
}

/**
 * Attach one JSBlock to an existing page's grid (additive, the recall-console
 * pattern): skip when a block carrying the marker exists; otherwise addBlock
 * and seat it first (sortIndex 1).
 * @param token - the root API token.
 * @param pageTitle - the target flowPage title.
 * @param code - the RunJS source.
 * @param marker - the code substring proving the block exists.
 * @returns true when the block is present after the call.
 */
async function ensureJsBlockOnPage(token: string, pageTitle: string, code: string, marker: string): Promise<boolean> {
  const gridUid = await pageGridUid(token, pageTitle)
  if (gridUid === null) {
    log(`w6b7-sourcing: page ${pageTitle} missing (grid null)`)
    return false
  }
  const models = await listFlowModels(token, 'W6B7-blocks')
  const existing = models.filter(row => row.use === 'JSBlockModel' && String(row.parentId ?? '') === gridUid)
    .sort((a, b) => String(a.uid ?? '').localeCompare(String(b.uid ?? '')))
  if (existing.length > 1) {
    // A pre-marker duplicate from the same batch: keep the first, drop the rest.
    for (const extra of existing.slice(1)) {
      psql(`DELETE FROM "flowModels" WHERE uid = ${sqlLit(String(extra.uid ?? ''))};`)
      log(`w6b7-sourcing: ${pageTitle} duplicate JSBlock removed (uid ${String(extra.uid ?? '')})`)
    }
  }
  const head = existing[0]
  if (head !== undefined) {
    const current = String(head.stepParams?.jsSettings?.runJs?.code ?? '')
    if (current !== code) {
      // Code drift: rewrite the stored code in place (same uid, same runJs version).
      const version = String((head.stepParams?.jsSettings?.runJs as { version?: string } | undefined)?.version ?? 'v2')
      await dataOf(token, 'POST', '/api/flowModels:save', {
        uid: head.uid, name: head.uid, parentId: gridUid, subKey: 'items', subType: 'array',
        use: 'JSBlockModel', stepParams: { jsSettings: { runJs: { version, code } } }, props: { title: '比价定标矩阵' },
      })
      log(`w6b7-sourcing: ${pageTitle} JSBlock code upgraded (${marker})`)
    } else {
      log(`w6b7-sourcing: ${pageTitle} JSBlock exists (${marker} kept)`)
    }
    await seatBlockRowTop(token, pageTitle, gridUid, String(head.uid ?? ''))
    return true
  }
  const block = await dataOf(token, 'POST', '/api/flowSurfaces:addBlock', {
    target: { uid: gridUid },
    type: 'jsBlock',
    settings: { showBlockCard: true, code },
  }) as { uid?: unknown }
  if (typeof block.uid !== 'string') {
    log(`w6b7-sourcing: addBlock returned no uid for ${pageTitle}: ${JSON.stringify(block).slice(0, 160)}`)
    return false
  }
  await dataOf(token, 'POST', '/api/flowModels:save', { uid: block.uid, name: block.uid, sortIndex: 1 })
  log(`w6b7-sourcing: ${pageTitle} JSBlock created (${marker}, uid ${block.uid})`)
  await seatBlockRowTop(token, pageTitle, gridUid, block.uid)
  return true
}

/**
 * Seat one block's grid row first in rowOrder (an additive JSBlock lands in
 * an appendRow at the page bottom where the lazy renderer never mounts it),
 * dropping row cells that reference the moved block elsewhere.
 * @param token - the root API token.
 * @param pageTitle - the page title, for the log line.
 * @param gridUid - the page's BlockGrid uid.
 * @param blockUid - the block whose row moves to the top.
 */
async function seatBlockRowTop(token: string, pageTitle: string, gridUid: string, blockUid: string): Promise<void> {
  const current = await dataOf(token, 'GET', `/api/flowSurfaces:get?uid=${encodeURIComponent(gridUid)}`)
  const tree = current?.tree ?? {}
  const grid = ((((tree.stepParams ?? {}) as Record<string, unknown>).gridSettings as Record<string, unknown> | undefined)?.grid) as {
    rows?: Record<string, unknown>, sizes?: Record<string, unknown>, rowOrder?: string[]
  } | undefined
  if (grid?.rows === undefined) return
  const rows: Record<string, unknown> = {}
  const sizes: Record<string, unknown> = {}
  let topCells: unknown[][] | null = null
  for (const [key, rawCells] of Object.entries(grid.rows)) {
    const cells = (Array.isArray(rawCells) ? rawCells : []).map(cell => (Array.isArray(cell) ? cell : []).map(uid => String(uid)))
    // The row holding the target block moves up even when the block is its
    // only cell; rows left empty after the move (and orphaned references)
    // drop out.
    if (cells.some(cell => cell.includes(blockUid))) { topCells = cells; continue }
    const withoutMine = cells.map(cell => cell.filter(uid => uid !== blockUid))
    const kept = withoutMine.filter(cell => cell.length > 0)
    if (kept.length === 0) continue
    rows[key] = kept
    sizes[key] = (grid.sizes ?? {})[key] ?? kept.map(() => 24)
  }
  if (topCells === null) return
  rows.w6b7top = topCells
  sizes.w6b7top = topCells.map(() => 24)
  const rowOrder = ['w6b7top', ...Object.keys(rows).filter(key => key !== 'w6b7top')]
  await dataOf(token, 'POST', '/api/flowModels:save', {
    uid: gridUid,
    ...(tree.parentId === undefined ? {} : { parentId: tree.parentId }),
    ...(tree.subKey === undefined ? {} : { subKey: tree.subKey }),
    props: { ...(tree.props ?? {}), rows, sizes, rowOrder },
    stepParams: { gridSettings: { grid: { rows, sizes, rowOrder } } },
  })
  log(`w6b7-sourcing: ${pageTitle} — JSBlock row seated first in the grid (${blockUid})`)
}

/**
 * Attach one basic-mode data chart to a page grid (the f4 authoring channel),
 * idempotent by the persisted query (collection + dimension + alias).
 * @param token - the root API token.
 * @param pageTitle - the target flowPage title.
 * @param spec - collection, dimension, chart type, and the discriminating alias.
 * @returns true when the chart is present after the call.
 */
async function ensureChartOnPage(token: string, pageTitle: string, spec: {
  collection: string, dimension: string, chartType: 'bar' | 'doughnut', alias: string, title: string
}): Promise<boolean> {
  const gridUid = await pageGridUid(token, pageTitle)
  if (gridUid === null) {
    log(`w6b7-sourcing: page ${pageTitle} missing (grid null)`)
    return false
  }
  const models = await listFlowModels(token, 'W6B7-charts')
  const hit = models.some((row) => {
    if (row.use !== 'ChartBlockModel' || String(row.parentId ?? '') !== gridUid) return false
    const query = row.stepParams?.chartSettings?.configure?.query as Record<string, unknown> | undefined
    const collectionPath = Array.isArray(query?.collectionPath)
      ? (query.collectionPath as string[]).join('.')
      : `main.${String((query?.resource as Record<string, unknown> | undefined)?.collectionName ?? '')}`
    const hasDim = Array.isArray(query?.dimensions) && (query.dimensions as Array<Record<string, unknown>>).some(dim => dim.field === spec.dimension)
    const hasAlias = Array.isArray(query?.measures) && (query.measures as Array<Record<string, unknown>>).some(measure => measure.alias === spec.alias)
    return collectionPath.endsWith(spec.collection) && hasDim && hasAlias
  })
  if (hit) {
    log(`w6b7-sourcing: ${pageTitle} chart ${spec.title} exists (kept)`)
    return true
  }
  const mappings = spec.chartType === 'doughnut'
    ? { category: spec.dimension, value: spec.alias }
    : { x: spec.dimension, y: spec.alias }
  const block = await dataOf(token, 'POST', '/api/flowSurfaces:addBlock', {
    target: { uid: gridUid },
    type: 'chart',
    settings: {
      query: {
        mode: 'builder',
        resource: { dataSourceKey: 'main', collectionName: spec.collection },
        measures: [{ field: 'id', aggregation: 'count', alias: spec.alias }],
        dimensions: [{ field: spec.dimension }],
      },
      visual: { mode: 'basic', type: spec.chartType, mappings },
    },
  }) as { uid?: unknown, tree?: { uid?: string } }
  const blockUid = typeof block.uid === 'string' ? block.uid : block.tree?.uid
  if (blockUid === undefined) {
    log(`w6b7-sourcing: addBlock returned no uid for ${pageTitle} chart: ${JSON.stringify(block).slice(0, 160)}`)
    return false
  }
  log(`w6b7-sourcing: ${pageTitle} chart ${spec.title} created (${spec.collection} × ${spec.dimension}, uid ${blockUid})`)
  return true
}

/**
 * Lay the four page upgrades (matrix block, PO board, two charts) and count
 * the pure-table pages of the 采购管理 group afterwards.
 * @param token - the root API token.
 */
export async function ensureSourcingPages(token: string): Promise<void> {
  await ensureJsBlockOnPage(token, '比价表', SOURCING_MATRIX_CODE, 'w6b7-matrix')
  await ensureJsBlockOnPage(token, '采购订单', PO_BOARD_CODE, 'w6b7-po-board')
  await ensureChartOnPage(token, '发票匹配', { collection: 'pur_invoices', dimension: 'match_result', chartType: 'bar', alias: 'w6b7MatchCount', title: '发票匹配结果分布' })
  await ensureChartOnPage(token, '付款申请', { collection: 'pur_payments', dimension: 'doc_status', chartType: 'doughnut', alias: 'w6b7PayCount', title: '付款申请状态分布' })
}

/**
 * The procurement-group shape audit: a page is a "table page" when it has no
 * JSBlock, no Kanban block, and no data chart (a ChartBlock whose query
 * carries dimensions — the stat cards' custom-raw single measures do not
 * count; they are number cards, not analysis charts).
 * @param token - the root API token.
 * @returns every page with its pure-table verdict.
 */
export async function auditProcurementShape(token: string): Promise<Array<{ title: string, tablePage: boolean, shapes: string }>> {
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

// ─── CLI ───

async function main(): Promise<void> {
  const token = await signInWithRetry()
  if (mode === 'seed') {
    await ensureSourcingSeed(token)
    await ensureSourcingPages(token)
    log('w6b7-sourcing: seed complete')
    return
  }
  // --demo / --assert live in the verify companion (this module is what the
  // engine imports, so its import-time surface stays free of test state).
  const verify = await import('./w6b7-verify.mts')
  await verify.runVerifyLeg(token, mode)
}
// Library imports must not run the CLI (the approval-engine guard pattern).
if (process.argv[1] !== undefined && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  await main()
}
