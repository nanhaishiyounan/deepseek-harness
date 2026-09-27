/**
 * W5/B5: the finite-capacity scheduler — the day-bucket greedy engine
 * (plans/2026-09-25-mfg-closure/06-b5-mfg-planning.md; the ERPNext official
 * capacity-planning isomorph: operations never straddle days, a busy work
 * center queues to the next day or switches to the alternative work center).
 *
 * W2-B6 口径声明（与 MO 排产页说明块、overload note 三处一致）：工序不跨天
 * （与 ERPNext 官方产能规划同构边界）；超出单日产能的工序不自动拆分——
 * 引擎给结构化拆单建议卡（suggestedSplits/perSplitMinutes），需人工拆 MO 或外协。
 *
 * The planning core is pure and in-memory (--selftest exercises it without
 * touching REST); the CLI verbs read mfg_* collections over REST:
 *
 *   --preview <mo> [--save]   what-if plan as JSON (no rows written; --save
 *                             refreshes mfg_orders.preview_data for the mobile
 *                             read side). Requires approved | released.
 *   --apply <mo>              write mfg_order_operations + planned_start/end.
 *                             Requires doc_status=released (draft/approved MOs
 *                             refuse — approved ≠ released); an applied MO
 *                             refuses until --void clears the frozen plan.
 *   --void <mo>               clear the applied plan (the re-schedule unlock).
 *   --release <mo>            approved → released (released_at backfill, the
 *                             deliberate second step after approval) plus the
 *                             automatic preview refresh (push to mobile).
 *   --latest-start <mo>       backward pass from need_date → per-operation
 *                             latest dates + the first operation's latest
 *                             start; a date before today raises the negative
 *                             slack warning (建议改期/拆单/外协).
 *   --selftest                the four in-memory assertions (overload warning,
 *                             alternative-WC switch, no-straddle, negative
 *                             slack).
 *
 * Duration formula (Odoo time_efficiency + ERPNext batch_size amortization):
 *   planned_min = setup_min + ceil(qty / batch_size) × run_min × 100 / efficiency_pct
 * Day capacity = working_hours span (minutes) × capacity_parallel; Sundays and
 * the work center's holiday calendar (mfg_holidays rows sharing its calendar
 * id) are non-working days. A load bucket is `${wcId}:${date}` and load may
 * never exceed capacity without the overload marker — the cross-MO conflict
 * queue reads the same buckets (apply order serializes the queue).
 *
 * Usage (repo root, tsx loader):
 *   node --import tsx/esm examples/kb-agent/scripts/mfg-schedule.mts --selftest
 *   node --import tsx/esm examples/kb-agent/scripts/mfg-schedule.mts --preview MO-2026-0001
 *   node --import tsx/esm examples/kb-agent/scripts/mfg-schedule.mts --apply MO-2026-0001
 *   node --import tsx/esm examples/kb-agent/scripts/mfg-schedule.mts --void MO-2026-0001
 *   node --import tsx/esm examples/kb-agent/scripts/mfg-schedule.mts --release MO-2026-0001
 *   node --import tsx/esm examples/kb-agent/scripts/mfg-schedule.mts --latest-start MO-2026-0002
 */
import { dataOf, signInWithRetry } from './nocobase-flow-page-lib.mts'

// ─── the pure planning core ───

/** One work center row the engine reads (mfg_work_centers). */
export interface WorkCenterSpec {
  readonly id: number
  readonly code: string
  readonly name: string
  readonly capacity_parallel: number
  readonly efficiency_pct: number
  readonly working_hours: string
  readonly holiday_calendar_id: string | null
}

/** One BOM operation row the engine reads (mfg_bom_operations). */
export interface OperationSpec {
  readonly seq: number
  readonly name: string
  readonly workcenter_id: number
  readonly setup_min: number
  readonly run_min: number
  readonly batch_size: number
  readonly alt_workcenter_id: number | null
}

/** One planned operation (forward or backward output row). */
export interface PlannedOperation {
  readonly seq: number
  readonly name: string
  readonly workcenter_id: number
  readonly workcenter_code: string
  readonly planned_date: string
  readonly planned_min: number
  readonly used_alt: boolean
  readonly queued_days: number
  readonly overload: boolean
  readonly note: string
  /** W2-B6: the structured split card, present only on the never-straddle overload rows. */
  readonly suggestion?: SplitSuggestion
}

/** The scheduling world: calendars plus the already-applied load buckets. */
export interface PlanWorld {
  readonly workCenters: ReadonlyArray<WorkCenterSpec>
  /** Holiday ISO dates, keyed by calendar id ('' shares every calendar). */
  readonly holidays: Readonly<Record<string, ReadonlySet<string>>>
  /** `${wcId}:${isoDate}` → applied minutes (other MOs' frozen plans). */
  readonly baseLoad: ReadonlyMap<string, number>
  readonly today: string
}

/** The forward plan one MO resolves to. */
export interface ForwardPlan {
  readonly planned_start: string
  readonly planned_end: string
  readonly operations: ReadonlyArray<PlannedOperation>
  readonly warnings: readonly string[]
}

/** The backward pass result (latest dates per operation). */
export interface BackwardPlan {
  readonly latest_start: string
  readonly operations: ReadonlyArray<PlannedOperation>
  readonly negative_slack: boolean
  readonly slack_days: number
  readonly warnings: readonly string[]
  /** W2-B6: the structured expedite card, present only on the negative-slack plans. */
  readonly suggestion?: ExpediteSuggestion
}

/**
 * W2-B6: the structured 拆单建议卡 one never-straddle overload row carries —
 * the plain-text note keeps its human-readable form while the numbers ride
 * structured fields for the Preview panel and the mobile card.
 */
export interface SplitSuggestion {
  readonly kind: 'split_suggestion'
  /** The operation's planned minutes (always above one day's capacity). */
  readonly minutes: number
  /** The work center's daily capacity in minutes. */
  readonly capacity: number
  /** ceil(minutes / perSplitMinutes) — the advised MO count. */
  readonly suggestedSplits: number
  /** capacity × 0.9 (10% daily headroom), floored to whole minutes. */
  readonly perSplitMinutes: number
  /** The first working day the split batches could start on. */
  readonly earliestStart: string
  readonly note: string
}

/** W2-B6: the negative-slack card — 改期 / 拆单 / 外协 three-way advice. */
export interface ExpediteSuggestion {
  readonly kind: 'expedite_suggestion'
  readonly slack_days: number
  readonly latest_start: string
  readonly need_date: string
  readonly note: string
}

/** Days the primary work center waits before the alternative switch kicks in. */
const ALT_SWITCH_AFTER_DAYS = 3
/** Days either work center may queue before the overload marker lands. */
const OVERLOAD_AFTER_DAYS = 14
/** W2-B6: the per-split headroom factor — each advised split stays ≤ 90% of one day's capacity. */
const SPLIT_HEADROOM = 0.9

const DAY_MS = 86_400_000
const isoOf = (ms: number): string => new Date(ms).toISOString().slice(0, 10)
const parseIso = (iso: string): number => new Date(`${iso}T00:00:00.000Z`).getTime()
const nextDay = (iso: string): string => isoOf(parseIso(iso) + DAY_MS)
const prevDay = (iso: string): string => isoOf(parseIso(iso) - DAY_MS)
const dayNumber = (iso: string): number => new Date(`${iso}T00:00:00.000Z`).getUTCDay()

function fail(message: string): never {
  throw new Error(message)
}

const workCenterOf = (world: PlanWorld, id: number): WorkCenterSpec =>
  world.workCenters.find(wc => wc.id === id)
  ?? fail(`工作中心 #${String(id)} 不存在（mfg_work_centers）；检查 BOM 工序配置`)

/**
 * The daily capacity in minutes: the working-hours span times the parallel
 * capacity. The span must parse as `HH:MM-HH:MM`; anything else fails loud
 * (misconfiguration fails loud).
 */
export function dailyCapacityMinutes(wc: WorkCenterSpec): number {
  const match = /^(\d{1,2}):(\d{2})-(\d{1,2}):(\d{2})$/.exec(wc.working_hours.trim())
  if (match === null) {
    fail(`工作中心 ${wc.code} 的班次「${wc.working_hours}」不是 HH:MM-HH:MM 形式；修正 mfg_work_centers.working_hours`)
  }
  const startHour = Number(match[1])
  const startMin = Number(match[2])
  const endHour = Number(match[3])
  const endMin = Number(match[4])
  const span = (endHour * 60 + endMin) - (startHour * 60 + startMin)
  if (span <= 0) fail(`工作中心 ${wc.code} 的班次跨度非正（${wc.working_hours}）；修正 mfg_work_centers.working_hours`)
  return span * wc.capacity_parallel
}

/** Whether one date is a working day for the work center (Sundays and its calendar's holidays rest). */
function isWorkingDay(world: PlanWorld, wc: WorkCenterSpec, iso: string): boolean {
  if (dayNumber(iso) === 0) return false
  const calendar = wc.holiday_calendar_id ?? ''
  const shared = world.holidays[''] ?? new Set<string>()
  if (shared.has(iso)) return false
  const own = world.holidays[calendar]
  if (own !== undefined && own.has(iso)) return false
  return true
}

/** The next (previous) working day at or after (before) the cursor. */
function rollForward(world: PlanWorld, wc: WorkCenterSpec, iso: string): string {
  let cursor = iso
  for (let guard = 0; guard < 400 && !isWorkingDay(world, wc, cursor); guard += 1) cursor = nextDay(cursor)
  return cursor
}
function rollBackward(world: PlanWorld, wc: WorkCenterSpec, iso: string): string {
  let cursor = iso
  for (let guard = 0; guard < 400 && !isWorkingDay(world, wc, cursor); guard += 1) cursor = prevDay(cursor)
  return cursor
}

/**
 * The operation duration in minutes: setup plus the batch-amortized run time
 * divided by the work center's efficiency (rounded up).
 */
export function operationMinutes(op: OperationSpec, wc: WorkCenterSpec, qty: number): number {
  if (op.batch_size <= 0) fail(`工序「${op.name}」的 batch_size 非正（${String(op.batch_size)}）；修正 BOM 工序`)
  if (wc.efficiency_pct <= 0) fail(`工作中心 ${wc.code} 的效率非正（${String(wc.efficiency_pct)}%）；修正 mfg_work_centers`)
  const batches = Math.ceil(qty / op.batch_size)
  return Math.round(op.setup_min + batches * op.run_min * 100 / wc.efficiency_pct)
}

/** The mutable load ledger the planner books placements into. */
type LoadLedger = Map<string, number>

const loadKey = (wcId: number, iso: string): string => `${String(wcId)}:${iso}`

function bookedMinutes(load: LoadLedger, wcId: number, iso: string): number {
  return load.get(loadKey(wcId, iso)) ?? 0
}

function book(load: LoadLedger, wcId: number, iso: string, minutes: number): void {
  load.set(loadKey(wcId, iso), bookedMinutes(load, wcId, iso) + minutes)
}

interface SlotDecision {
  readonly date: string
  readonly used_alt: boolean
  readonly queued_days: number
  readonly overload: boolean
  readonly note: string
  readonly suggestion?: SplitSuggestion
}

/**
 * W2-B6: build the 拆单建议卡 for an operation whose minutes exceed one
 * day's total capacity — suggestedSplits = ceil(minutes / perSplitMinutes)
 * with perSplitMinutes = floor(capacity × 0.9), so each human-split MO fits
 * one day bucket with 10% headroom. The note keeps the human-readable text
 * (the W-round 拆单 advice sentence) plus the concrete split numbers.
 */
export function buildSplitSuggestion(wcCode: string, minutes: number, capacity: number, earliestStart: string): SplitSuggestion {
  if (capacity <= 0) fail(`工作中心 ${wcCode} 的日产能非正（${String(capacity)} 分）——拆单建议无法生成`)
  const perSplitMinutes = Math.floor(capacity * SPLIT_HEADROOM)
  if (perSplitMinutes <= 0) fail(`工作中心 ${wcCode} 的日产能过小（${String(capacity)} 分 ×0.9 向下取整为 ${String(perSplitMinutes)}）——拆单建议无法生成`)
  const suggestedSplits = Math.ceil(minutes / perSplitMinutes)
  const note = `工序超出 ${wcCode} 单日产能（需 ${String(minutes)} 分 > 容量 ${String(capacity)} 分；不跨天约束——建议拆单：拆 ${String(suggestedSplits)} 份×每份 ≤${String(perSplitMinutes)} 分钟（预留 10% 余量），或外协）`
  return { kind: 'split_suggestion', minutes, capacity, suggestedSplits, perSplitMinutes, earliestStart, note }
}

/**
 * Find the day bucket one operation lands in, starting the scan at `from`
 * (forward): a day is feasible when it is a working day whose remaining
 * capacity covers the duration. After ALT_SWITCH_AFTER_DAYS busy days on the
 * primary work center the alternative takes over (Odoo
 * alternative_workcenters); after OVERLOAD_AFTER_DAYS the placement lands on
 * the scanned day with the overload marker (the never-straddle product
 * boundary: a duration above one day's total capacity can never fit and
 * surfaces through the same marker with the 拆单 advice).
 */
function findSlotForward(world: PlanWorld, load: LoadLedger, op: OperationSpec, from: string, qty: number): { decision: SlotDecision, wc: WorkCenterSpec, minutes: number } {
  const primary = workCenterOf(world, op.workcenter_id)
  const minutes = operationMinutes(op, primary, qty)
  const tryPlace = (wc: WorkCenterSpec, start: string): SlotDecision | null => {
    let cursor = rollForward(world, wc, start)
    let queued = 0
    for (let guard = 0; guard < 400; guard += 1) {
      // Calendar days (Sundays, holidays) skip without counting as queue days.
      if (!isWorkingDay(world, wc, cursor)) {
        cursor = nextDay(cursor)
        continue
      }
      const capacity = dailyCapacityMinutes(wc)
      if (minutes > capacity) {
        const suggestion = buildSplitSuggestion(wc.code, minutes, capacity, cursor)
        return {
          date: cursor, used_alt: wc.id !== primary.id, queued_days: queued, overload: true,
          note: suggestion.note, suggestion,
        }
      }
      if (bookedMinutes(load, wc.id, cursor) + minutes <= capacity) {
        return { date: cursor, used_alt: wc.id !== primary.id, queued_days: queued, overload: false, note: '' }
      }
      cursor = nextDay(cursor)
      queued += 1
      if (queued > OVERLOAD_AFTER_DAYS) {
        return {
          date: cursor, used_alt: wc.id !== primary.id, queued_days: queued, overload: true,
          note: `${wc.code} 连续 ${String(queued)} 个工作日满载，冲突排队溢出（建议改期/拆单/外协）`,
        }
      }
    }
    return null
  }
  const primaryDecision = tryPlace(primary, from)
  if (primaryDecision !== null && (!primaryDecision.overload && primaryDecision.queued_days < ALT_SWITCH_AFTER_DAYS || op.alt_workcenter_id === null)) {
    return { decision: primaryDecision, wc: primary, minutes }
  }
  if (op.alt_workcenter_id !== null) {
    const alt = workCenterOf(world, op.alt_workcenter_id)
    const altDecision = tryPlace(alt, from)
    if (altDecision !== null && !altDecision.overload) {
      return {
        decision: {
          ...altDecision,
          note: altDecision.note === '' ? `主工作中心 ${primary.code} 满载，切换替代工作中心 ${alt.code}` : `主工作中心 ${primary.code} 满载，切换替代工作中心 ${alt.code}；${altDecision.note}`,
        },
        wc: alt, minutes,
      }
    }
  }
  if (primaryDecision !== null) return { decision: primaryDecision, wc: primary, minutes }
  fail(`工序「${op.name}」在 400 天窗口内无可排工作日（日历配置异常）`)
}

/**
 * The forward pass (release-side scheduling): operations run in BOM sequence,
 * each starting the scan no earlier than the previous operation's day (a
 * successor never precedes its predecessor — the ERPNext rule).
 */
export function planForward(world: PlanWorld, qty: number, operations: ReadonlyArray<OperationSpec>, startFrom: string): ForwardPlan {
  if (operations.length === 0) fail('BOM 无工序行（mfg_bom_operations）；无法排产')
  const ordered = [...operations].sort((a, b) => a.seq - b.seq)
  const load: LoadLedger = new Map(world.baseLoad)
  const warnings: string[] = []
  const planned: PlannedOperation[] = []
  let cursor = startFrom
  for (const op of ordered) {
    const { decision, wc, minutes } = findSlotForward(world, load, op, cursor, qty)
    book(load, wc.id, decision.date, minutes)
    planned.push({
      seq: op.seq, name: op.name, workcenter_id: wc.id, workcenter_code: wc.code,
      planned_date: decision.date, planned_min: minutes,
      used_alt: decision.used_alt, queued_days: decision.queued_days, overload: decision.overload, note: decision.note,
      ...(decision.suggestion === undefined ? {} : { suggestion: decision.suggestion }),
    })
    if (decision.overload) warnings.push(`工序 ${String(op.seq)}「${op.name}」：${decision.note}`)
    cursor = decision.date
  }
  const first = planned[0]
  const last = planned[planned.length - 1]
  if (first === undefined || last === undefined) fail('排产结果为空（内部错误）')
  return { planned_start: first.planned_date, planned_end: last.planned_date, operations: planned, warnings }
}

/**
 * The backward pass (the latest-start calculus): operations run in reverse
 * from need_date, each scanning backwards no later than its successor's day;
 * the first operation's resolved day is the latest start. A latest start
 * before today raises the negative-slack warning.
 */
export function planBackward(world: PlanWorld, qty: number, operations: ReadonlyArray<OperationSpec>, needDate: string, today: string): BackwardPlan {
  if (operations.length === 0) fail('BOM 无工序行（mfg_bom_operations）；无法倒排')
  const ordered = [...operations].sort((a, b) => a.seq - b.seq).reverse()
  const load: LoadLedger = new Map(world.baseLoad)
  const warnings: string[] = []
  const planned: PlannedOperation[] = []
  let cursor = needDate
  for (const op of ordered) {
    const wc = workCenterOf(world, op.workcenter_id)
    const minutes = operationMinutes(op, wc, qty)
    let date = rollBackward(world, wc, cursor)
    let overload = false
    let note = ''
    let rowSuggestion: SplitSuggestion | undefined
    let guard = 0
    for (; guard < 400; guard += 1) {
      if (!isWorkingDay(world, wc, date)) {
        date = prevDay(date)
        continue
      }
      const capacity = dailyCapacityMinutes(wc)
      if (minutes > capacity) {
        const suggestion = buildSplitSuggestion(wc.code, minutes, capacity, date)
        overload = true
        note = suggestion.note
        rowSuggestion = suggestion
        break
      }
      if (bookedMinutes(load, wc.id, date) + minutes <= capacity) break
      date = prevDay(date)
    }
    if (guard >= 400) fail(`工序「${op.name}」在 400 天窗口内无可排工作日（日历配置异常）`)
    book(load, wc.id, date, minutes)
    planned.push({
      seq: op.seq, name: op.name, workcenter_id: wc.id, workcenter_code: wc.code,
      planned_date: date, planned_min: minutes, used_alt: false,
      queued_days: 0, overload, note,
      ...(rowSuggestion === undefined ? {} : { suggestion: rowSuggestion }),
    })
    if (overload) warnings.push(`工序 ${String(op.seq)}「${op.name}」：${note}`)
    cursor = date
  }
  const firstOp = planned[planned.length - 1]
  if (firstOp === undefined) fail('倒排结果为空（内部错误）')
  const slackDays = Math.round((new Date(`${firstOp.planned_date}T00:00:00.000Z`).getTime() - new Date(`${today}T00:00:00.000Z`).getTime()) / DAY_MS)
  const negative = slackDays < 0
  let expedite: ExpediteSuggestion | undefined
  if (negative) {
    const note = `最晚开工日 ${firstOp.planned_date} 早于今天 ${today}（负向时间 ${String(Math.abs(slackDays))} 天）——建议改期/拆单/外协`
    warnings.push(note)
    expedite = { kind: 'expedite_suggestion', slack_days: slackDays, latest_start: firstOp.planned_date, need_date: needDate, note }
  }
  return {
    latest_start: firstOp.planned_date,
    operations: [...planned].sort((a, b) => a.seq - b.seq),
    negative_slack: negative, slack_days: slackDays, warnings,
    ...(expedite === undefined ? {} : { suggestion: expedite }),
  }
}

// ─── the in-memory selftest (06-b5 验收 checkbox 1:1) ───

const wc = (id: number, code: string, parallel: number, efficiency: number, hours: string): WorkCenterSpec =>
  ({ id, code, name: code, capacity_parallel: parallel, efficiency_pct: efficiency, working_hours: hours, holiday_calendar_id: 'cal' })

const op = (seq: number, name: string, workcenterId: number, setup: number, run: number, batch: number, alt: number | null = null): OperationSpec =>
  ({ seq, name, workcenter_id: workcenterId, setup_min: setup, run_min: run, batch_size: batch, alt_workcenter_id: alt })

/** The selftest's relative-date helper (no hardcoded calendar drift). */
const shiftIso = (iso: string, days: number): string => new Date(new Date(`${iso}T00:00:00.000Z`).getTime() + days * DAY_MS).toISOString().slice(0, 10)

async function selftest(): Promise<void> {
  const today = new Date().toISOString().slice(0, 10)
  const holidays: Record<string, ReadonlySet<string>> = { cal: new Set([shiftIso(today, 2)]) }

  // ① overload: one 600-minute operation against a 480-minute day can never
  // fit — the never-straddle boundary marks it overloaded with the 拆单 advice.
  {
    const world: PlanWorld = { workCenters: [wc(1, 'WC-A', 1, 100, '08:00-16:00')], holidays, baseLoad: new Map(), today }
    const plan = planForward(world, 1200, [op(1, '杀菌', 1, 30, 190, 400)], today)
    const row = plan.operations[0]
    if (row === undefined || !row.overload || !row.note.includes('拆单')) {
      throw new Error(`selftest ① 超载告警失败：${JSON.stringify(row)}`)
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(row.planned_date)) throw new Error('selftest ① 不跨天失败：planned_date 不是单日')
    console.log(`mfg-schedule: [selftest] ① 超载告警 ✓ ${row.planned_date} ${String(row.planned_min)}分 → ${row.note.slice(0, 48)}…`)
  }

  // ② alternative work center: the primary stays booked for the first three
  // days (960 of 960 minutes), so the operation switches to the alt.
  {
    const baseLoad: LoadLedger = new Map([
      [`1:${today}`, 960], [`1:${shiftIso(today, 1)}`, 960], [`1:${shiftIso(today, 2)}`, 960], [`1:${shiftIso(today, 3)}`, 960], [`1:${shiftIso(today, 4)}`, 960],
    ])
    const world: PlanWorld = { workCenters: [wc(1, 'WC-A', 2, 100, '08:00-16:00'), wc(2, 'WC-B', 1, 100, '08:00-16:00')], holidays, baseLoad, today }
    const plan = planForward(world, 400, [op(1, '烘焙', 1, 60, 40, 100, 2)], today)
    const row = plan.operations[0]
    if (row === undefined || !row.used_alt || row.workcenter_id !== 2) {
      throw new Error(`selftest ② 替代工作中心失败：${JSON.stringify(row)}`)
    }
    console.log(`mfg-schedule: [selftest] ② 替代 WC 切换 ✓ 主 WC 满载 → ${row.workcenter_code} @ ${row.planned_date}`)
  }

  // ③ never-straddle + queue: three 300-minute operations on one 480-minute
  // day serialize one per day (no operation splits across days; day 2's
  // holiday pushes the third to day 3).
  {
    const world: PlanWorld = { workCenters: [wc(1, 'WC-A', 1, 100, '08:00-16:00')], holidays, baseLoad: new Map(), today }
    const plan = planForward(world, 400, [
      op(1, '混合', 1, 30, 90, 100),
      op(2, '成型', 1, 30, 90, 100),
      op(3, '包装', 1, 30, 90, 100),
    ], today)
    const dates = plan.operations.map(row => row.planned_date)
    const uniqueDays = new Set(dates).size
    if (dates.length !== 3 || uniqueDays !== 3 || dates[1] === undefined || dates[1] <= (dates[0] ?? '')) {
      throw new Error(`selftest ③ 不跨天/逐日排队失败：${JSON.stringify(dates)}`)
    }
    // Every operation stays a single ISO day, never lands on a Sunday or the
    // seeded holiday, and the successor never precedes its predecessor.
    const holiday = shiftIso(today, 2)
    for (const date of dates) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('selftest ③ 不跨天失败：日期非单日')
      if (new Date(`${date}T00:00:00.000Z`).getUTCDay() === 0) throw new Error(`selftest ③ 日历失败：${date} 是周日却被排产`)
      if (date === holiday) throw new Error(`selftest ③ 日历失败：节假日 ${holiday} 被排产`)
    }
    console.log(`mfg-schedule: [selftest] ③ 不跨天 + 冲突排队 ✓ ${dates.join(' → ')}（周日与节假日 ${holiday} 顺延）`)
  }

  // ④ backward negative slack: a three-day chain against a need date two days
  // out — the latest start lands before today and the warning fires.
  {
    const world: PlanWorld = { workCenters: [wc(1, 'WC-A', 1, 100, '08:00-16:00')], holidays: { cal: new Set() }, baseLoad: new Map(), today }
    // need_date one day out: the three one-day operations walk back past today.
    const needDate = shiftIso(today, 1)
    const plan = planBackward(world, 400, [
      op(1, '混合', 1, 30, 90, 100),
      op(2, '成型', 1, 30, 90, 100),
      op(3, '包装', 1, 30, 90, 100),
    ], needDate, today)
    if (!plan.negative_slack || plan.latest_start >= today) {
      throw new Error(`selftest ④ 后推负向告警失败：latest_start=${plan.latest_start} negative=${String(plan.negative_slack)}`)
    }
    console.log(`mfg-schedule: [selftest] ④ 后推负向告警 ✓ 最晚开工 ${plan.latest_start} < 今天 ${today}（slack ${String(plan.slack_days)} 天）`)
  }

  // ⑤ W2-B6 split suggestion card: a 1200-minute operation against a
  // 480-minute day carries the structured 拆单建议卡 — 3 splits × 432 minutes
  // (480 × 0.9 headroom), the note keeps the human-readable advice, and the
  // backward negative-slack branch answers with the expedite card instead.
  {
    const world: PlanWorld = { workCenters: [wc(1, 'WC-A', 1, 100, '08:00-16:00')], holidays: { cal: new Set() }, baseLoad: new Map(), today }
    // planned_min = 0 + ceil(1600/400) × 300 × 100/100 = 1200 exactly.
    const plan = planForward(world, 1600, [op(1, '杀菌', 1, 0, 300, 400)], today)
    const row = plan.operations[0]
    const card = row?.suggestion
    if (row === undefined || card === undefined || card.kind !== 'split_suggestion'
      || card.minutes !== 1200 || card.capacity !== 480
      || card.suggestedSplits !== 3 || card.perSplitMinutes !== 432 || card.earliestStart < today) {
      throw new Error(`selftest ⑤ 拆单建议卡失败：${JSON.stringify(row)}`)
    }
    if (!row.note.includes('拆 3 份')) {
      throw new Error(`selftest ⑤ note 人话版缺拆分数：${row.note}`)
    }
    if (!row.note.includes('432')) throw new Error(`selftest ⑤ note 人话版缺每份分钟数：${row.note}`)
    // The expedite card: a negative-slack backward plan answers with the
    // three-way advice object, not a split card.
    const back = planBackward(world, 400, [op(1, '混合', 1, 30, 90, 100)], shiftIso(today, -1), today)
    const expedite = back.suggestion
    if (!back.negative_slack || expedite === undefined || expedite.kind !== 'expedite_suggestion'
      || expedite.latest_start !== back.latest_start || !expedite.note.includes('改期/拆单/外协')) {
      throw new Error(`selftest ⑤ 外协建议卡失败：${JSON.stringify(back)}`)
    }
    console.log(`mfg-schedule: [selftest] ⑤ 拆单建议卡 ✓ 1200分/480产能 → 拆${String(card.suggestedSplits)}份×${String(card.perSplitMinutes)}分（earliest ${card.earliestStart}）；负向 slack → expedite 卡 ✓`)
  }

  console.log('mfg-schedule: selftest OK — 超载告警 / 替代 WC 切换 / 不跨天 / 后推负向 / 拆单建议卡 五断言全绿')
}

// ─── the REST side ───

async function rowsOf(token: string, collection: string, pageSize = 500): Promise<Array<Record<string, any>>> {
  const rows = await dataOf(token, 'GET', `/api/${collection}:list?pageSize=${pageSize}`) as Array<Record<string, any>> | null
  return rows ?? []
}

/** One REST-backed conditional update answering how many rows moved. */
async function updateWhere(token: string, collection: string, filter: Record<string, unknown>, values: Record<string, unknown>): Promise<number> {
  const rows = await dataOf(token, 'POST', `/api/${collection}:update?filter=${encodeURIComponent(JSON.stringify(filter))}&pageSize=10`, values)
  return Array.isArray(rows) ? rows.length : rows === null || rows === undefined ? 0 : 1
}

interface MoContext {
  readonly mo: Record<string, any>
  readonly operations: ReadonlyArray<OperationSpec>
  readonly world: PlanWorld
  readonly bomCode: string
}

/** Load one MO by code or id with its BOM operations and the scheduling world. */
async function loadMo(token: string, ref: string): Promise<MoContext> {
  const mos = await rowsOf(token, 'mfg_orders')
  const mo = Number.isInteger(Number(ref)) && mos.every(row => String(row.code) !== ref)
    ? mos.find(row => Number(row.id) === Number(ref))
    : mos.find(row => row.code === ref) ?? mos.find(row => Number(row.id) === Number(ref))
  if (mo === undefined) fail(`生产订单不存在：${ref}（mfg_orders 无匹配行）`)
  if (mo.bom_id === null || mo.bom_id === undefined || mo.bom_id === '') {
    fail(`生产订单 ${String(mo.code)} 未挂 BOM（bom_id 空）；先在 BOM 管理建立有效配方`)
  }
  const boms = await rowsOf(token, 'mfg_boms')
  const bom = boms.find(row => Number(row.id) === Number(mo.bom_id))
  if (bom === undefined) fail(`生产订单 ${String(mo.code)} 挂的 BOM #${String(mo.bom_id)} 不存在（mfg_boms）`)
  if (String(bom.bom_status) !== 'active') {
    fail(`生产订单 ${String(mo.code)} 挂的 BOM ${String(bom.code)} 状态为 ${String(bom.bom_status)}（非 active）；排产要求有效 BOM`)
  }
  const bomOps = (await rowsOf(token, 'mfg_bom_operations')).filter(row => Number(row.bom_id) === Number(bom.id))
  const operations: OperationSpec[] = bomOps.map(row => ({
    seq: Number(row.seq), name: String(row.name), workcenter_id: Number(row.workcenter_id),
    setup_min: Number(row.setup_min), run_min: Number(row.run_min), batch_size: Number(row.batch_size),
    alt_workcenter_id: row.alt_workcenter_id === null || row.alt_workcenter_id === undefined || row.alt_workcenter_id === '' ? null : Number(row.alt_workcenter_id),
  }))
  const workCenterRows = await rowsOf(token, 'mfg_work_centers')
  const workCenters: WorkCenterSpec[] = workCenterRows.map(row => ({
    id: Number(row.id), code: String(row.code), name: String(row.name),
    capacity_parallel: Number(row.capacity_parallel), efficiency_pct: Number(row.efficiency_pct),
    working_hours: String(row.working_hours ?? ''),
    holiday_calendar_id: row.holiday_calendar_id === null || row.holiday_calendar_id === undefined || row.holiday_calendar_id === '' ? null : String(row.holiday_calendar_id),
  }))
  const holidayRows = await rowsOf(token, 'mfg_holidays')
  const holidayMap: Record<string, Set<string>> = {}
  for (const row of holidayRows) {
    const calendar = row.calendar === null || row.calendar === undefined || row.calendar === '' ? '' : String(row.calendar)
    const set = holidayMap[calendar] ?? new Set<string>()
    set.add(String(row.date).slice(0, 10))
    holidayMap[calendar] = set
  }
  // The applied load: every other MO's frozen plan books its buckets.
  const appliedOps = (await rowsOf(token, 'mfg_order_operations')).filter(row => Number(row.order_id) !== Number(mo.id))
  const baseLoad: LoadLedger = new Map()
  for (const row of appliedOps) {
    const key = loadKey(Number(row.workcenter_id), String(row.planned_date).slice(0, 10))
    baseLoad.set(key, (baseLoad.get(key) ?? 0) + Number(row.planned_min ?? 0))
  }
  return {
    mo, operations,
    world: { workCenters, holidays: holidayMap, baseLoad, today: new Date().toISOString().slice(0, 10) },
    bomCode: String(bom.code),
  }
}

/** The refusal guard the schedule verbs share: only approved | released MOs schedule. */
function assertSchedulable(mo: Record<string, any>): void {
  const state = String(mo.doc_status)
  if (state === 'draft' || state === 'rejected') {
    fail(`排产被拒：生产订单 ${String(mo.code)} 审批状态为「${state}」（未生效不得排产）；先提交审批并通过`)
  }
  if (state === 'pending' || state === 'pending_level2') {
    fail(`排产被拒：生产订单 ${String(mo.code)} 审批中（${state}）；审批通过并下达后才可排产`)
  }
  if (state === 'void' || state === 'closed') {
    fail(`排产被拒：生产订单 ${String(mo.code)} 已${state === 'void' ? '作废' : '关闭'}；不可排产`)
  }
}

/** The forward start: released MOs schedule from their release date, approved ones from today (preview only). */
const forwardStartOf = (context: MoContext): string => {
  const releasedAt = context.mo.released_at
  const today = context.world.today
  return typeof releasedAt === 'string' && releasedAt !== '' && releasedAt > today ? releasedAt.slice(0, 10) : today
}

/** The MO-side forward JSON (preview and the release push share the shape). */
function forwardJson(context: MoContext, plan: ForwardPlan): Record<string, unknown> {
  return {
    mo: String(context.mo.code), bom: context.bomCode, product_id: Number(context.mo.product_id),
    qty: Number(context.mo.qty), direction: 'forward', start_from: forwardStartOf(context),
    planned_start: plan.planned_start, planned_end: plan.planned_end,
    operations: plan.operations, warnings: plan.warnings,
    generated_at: context.world.today,
  }
}

async function preview(token: string, ref: string, save: boolean): Promise<Record<string, unknown>> {
  const context = await loadMo(token, ref)
  assertSchedulable(context.mo)
  const released = String(context.mo.doc_status) === 'released'
  if (!released) {
    // approved (not released) may look, with the two-step separation called out.
    console.log(`mfg-schedule: preview ${String(context.mo.code)} 为 approved（未下达）——建议日期自今天起算，正式排产需先下达（--release）`)
  }
  const plan = planForward(context.world, Number(context.mo.qty), context.operations, forwardStartOf(context))
  const json = forwardJson(context, plan)
  if (save) {
    await dataOf(token, 'POST', `/api/mfg_orders:update?filterByTk=${context.mo.id}`, { preview_data: JSON.stringify(json) })
    console.log(`mfg-schedule: preview saved to mfg_orders.preview_data (${String(context.mo.code)})`)
  }
  return json
}

async function apply(token: string, ref: string): Promise<void> {
  const context = await loadMo(token, ref)
  const state = String(context.mo.doc_status)
  if (state !== 'released') {
    fail(`排产被拒：生产订单 ${String(context.mo.code)} 审批状态为「${state}」——审批通过（approved）后还须下达（released）才可排产；两态分离，approved ≠ released`)
  }
  const existing = (await rowsOf(token, 'mfg_order_operations')).filter(row => Number(row.order_id) === Number(context.mo.id))
  if (existing.length > 0) {
    fail(`排程已冻结：${String(context.mo.code)} 已有 ${String(existing.length)} 行排程（Apply 后重排须先 --void 作废排程）`)
  }
  const plan = planForward(context.world, Number(context.mo.qty), context.operations, forwardStartOf(context))
  for (const row of plan.operations) {
    await dataOf(token, 'POST', '/api/mfg_order_operations:create', {
      order: { id: Number(context.mo.id) }, seq: row.seq, name: row.name,
      workcenter: { id: row.workcenter_id }, planned_date: row.planned_date, planned_min: row.planned_min,
      status: 'planned', note: row.note === '' ? null : row.note,
    })
  }
  await dataOf(token, 'POST', `/api/mfg_orders:update?filterByTk=${context.mo.id}`, {
    planned_start: plan.planned_start, planned_end: plan.planned_end,
    preview_data: JSON.stringify(forwardJson(context, plan)),
  })
  console.log(`mfg-schedule: applied ${String(context.mo.code)} — ${String(plan.operations.length)} 工序行（${plan.planned_start} → ${plan.planned_end}）${plan.warnings.length > 0 ? `；告警 ${String(plan.warnings.length)} 条` : ''}`)
}

async function voidPlan(token: string, ref: string): Promise<void> {
  const context = await loadMo(token, ref)
  const existing = (await rowsOf(token, 'mfg_order_operations')).filter(row => Number(row.order_id) === Number(context.mo.id))
  for (const row of existing) {
    await dataOf(token, 'POST', `/api/mfg_order_operations:destroy?filterByTk=${row.id}`)
  }
  await dataOf(token, 'POST', `/api/mfg_orders:update?filterByTk=${context.mo.id}`, { planned_start: null, planned_end: null })
  console.log(`mfg-schedule: voided ${String(context.mo.code)} — ${String(existing.length)} 工序行清除，planned_start/end 置空（可重排）`)
}

async function release(token: string, ref: string): Promise<void> {
  const mos = await rowsOf(token, 'mfg_orders')
  const mo = mos.find(row => row.code === ref) ?? mos.find(row => Number(row.id) === Number(ref))
  if (mo === undefined) fail(`生产订单不存在：${ref}`)
  if (String(mo.doc_status) === 'released' || String(mo.doc_status) === 'closed') {
    console.log(`mfg-schedule: ${String(mo.code)} already ${String(mo.doc_status)} (kept)`)
    return
  }
  if (String(mo.doc_status) !== 'approved') {
    fail(`下达被拒：生产订单 ${String(mo.code)} 审批状态为「${String(mo.doc_status)}」——仅已生效（approved）的单可下达；approved ≠ released 两态分离`)
  }
  const today = new Date().toISOString().slice(0, 10)
  const moved = await updateWhere(token, 'mfg_orders', { id: Number(mo.id), doc_status: 'approved' }, { doc_status: 'released', released_at: today })
  if (moved === 0) fail(`单据状态已变化：${String(mo.code)} 已不在 approved 态（并发达下被拒绝，未双写）`)
  console.log(`mfg-schedule: released ${String(mo.code)}（approved → released，released_at=${today}）`)
  // The release push: refresh the preview snapshot the mobile read side renders.
  const json = await preview(token, String(mo.code), true)
  console.log(`mfg-schedule: release 推送排产预览：${String(json.planned_start)} → ${String(json.planned_end)}`)
}

async function latestStart(token: string, ref: string): Promise<Record<string, unknown>> {
  const context = await loadMo(token, ref)
  assertSchedulable(context.mo)
  const needDate = String(context.mo.need_date ?? '').slice(0, 10)
  if (needDate === '') fail(`生产订单 ${String(context.mo.code)} 无需求日期（need_date 空）；后推排期需要交期`)
  const plan = planBackward(context.world, Number(context.mo.qty), context.operations, needDate, context.world.today)
  return {
    mo: String(context.mo.code), bom: context.bomCode, qty: Number(context.mo.qty),
    direction: 'backward', need_date: needDate,
    latest_start: plan.latest_start, slack_days: plan.slack_days, negative_slack: plan.negative_slack,
    operations: plan.operations, warnings: plan.warnings, generated_at: context.world.today,
  }
}

// ─── main ───

async function main(): Promise<void> {
  const args = process.argv.slice(2)
  if (args.includes('--selftest')) {
    await selftest()
    return
  }
  const token = await signInWithRetry()
  const flag = (name: string): string | undefined => {
    const index = args.indexOf(name)
    return index >= 0 ? args[index + 1] : undefined
  }
  const previewRef = flag('--preview')
  if (previewRef !== undefined) {
    console.log(JSON.stringify(await preview(token, previewRef, args.includes('--save')), null, 2))
    return
  }
  const applyRef = flag('--apply')
  if (applyRef !== undefined) {
    await apply(token, applyRef)
    return
  }
  const voidRef = flag('--void')
  if (voidRef !== undefined) {
    await voidPlan(token, voidRef)
    return
  }
  const releaseRef = flag('--release')
  if (releaseRef !== undefined) {
    await release(token, releaseRef)
    return
  }
  const latestRef = flag('--latest-start')
  if (latestRef !== undefined) {
    console.log(JSON.stringify(await latestStart(token, latestRef), null, 2))
    return
  }
  console.log('mfg-schedule: no verb — 用 --selftest / --preview <mo> [--save] / --apply <mo> / --void <mo> / --release <mo> / --latest-start <mo>')
}

await main()
