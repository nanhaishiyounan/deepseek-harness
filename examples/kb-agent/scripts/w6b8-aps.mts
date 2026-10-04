/**
 * W6-B8: the APS face — 瓶颈归因 + 负荷热力 + what-if 沙箱 on the W2 FCS
 * spine (plans/plan-w6.zh.md §5.7; ADR 9 — frePPLe's ideas, no solver).
 *
 * 1. GET /aps/load: the read-only load world — work centers with their daily
 *    capacity (mfg-schedule dailyCapacityMinutes, the same formula FCS
 *    applies), one bucket per work center × planned date with the occupying
 *    MO list, the bottleneck rows (buckets whose load exceeds capacity while
 *    still carrying an open operation — attribution = which MOs occupy), and
 *    the WC × day utilization matrix for the heatmap.
 * 2. POST /aps/whatif: the in-memory sandbox — re-plans every open
 *    'planned' operation (started/done stay frozen as base load) with the
 *    caller's knobs (per-work-center overtime minutes per day, MO priority
 *    boosts) using the FCS semantics verbatim (never-straddle, Sundays +
 *    holiday calendars, same-MO sequencing), then returns before/after/delta.
 *    Zero writes: the assert leg proves mfg_order_operations is byte-stable
 *    across a simulation.
 * 3. POST /aps/promote: the explicit apply — 计划部（PMC）/admin fenced;
 *    recomputes the same scenario, rewrites planned_date for open planned
 *    operations only (per-row CAS on status), refreshes the MOs'
 *    planned_start/end, and files one aps_whatif_runs audit row (params +
 *    delta + applied count) — the 差异报告留存.
 *
 * Usage (repo root, tsx loader):
 *   node --import tsx/esm examples/kb-agent/scripts/w6b8-aps.mts --seed
 *   node --import tsx/esm examples/kb-agent/scripts/w6b8-aps.mts --assert
 */
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import {
  dataOf, listFlowModels, listRoutes, signInWithRetry, withN17Prefix,
} from './nocobase-flow-page-lib.mts'
import { dailyCapacityMinutes, type WorkCenterSpec } from './mfg-schedule.mts'
import type { NocoIO } from './approval-engine.mts'

const args = process.argv.slice(2)
const mode = args.includes('--seed') ? 'seed' : 'assert'
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

// ─── the world readers (FCS tables, read-only) ───

const DAY_MS = 86_400_000
const isoOf = (ms: number): string => new Date(ms).toISOString().slice(0, 10)
const parseIso = (iso: string): number => new Date(`${iso}T00:00:00.000Z`).getTime()
const nextDay = (iso: string): string => isoOf(parseIso(iso) + DAY_MS)
const dayNumber = (iso: string): number => new Date(`${iso}T00:00:00.000Z`).getUTCDay()

function todayIso(): string {
  return psql('SELECT CURRENT_DATE::text;').trim()
}

/** One open-or-frozen operation row the planner reads (mfg_order_operations × mfg_orders). */
interface OpRow {
  readonly id: number
  readonly mo_id: number
  readonly mo_code: string
  readonly seq: number
  readonly name: string
  readonly wc_id: number
  readonly planned_min: number
  readonly status: string
  readonly planned_date: string | null
  readonly need_date: string | null
}

/**
 * Read the planning world: work centers (capacity formula inputs), the
 * holiday calendars, and every scheduled operation with its MO header.
 * @returns the three read-only inputs the load snapshot and the sandbox share.
 */
function readWorld(): { wcs: WorkCenterSpec[]; holidays: Map<string, Set<string>>; ops: OpRow[] } {
  const wcs: WorkCenterSpec[] = psql('SELECT id || \'|\' || COALESCE(code, \'\') || \'|\' || COALESCE(name, \'\') || \'|\' || COALESCE(capacity_parallel::text, \'1\') || \'|\' || COALESCE(efficiency_pct::text, \'100\') || \'|\' || COALESCE(working_hours, \'\') || \'|\' || COALESCE(holiday_calendar_id, \'\') FROM mfg_work_centers ORDER BY id;')
    .split('\n').map(line => line.trim()).filter(line => line !== '').map(line => {
      const [id, code, , parallel, efficiency, hours, calendar] = line.split('|')
      return {
        id: Number(id), code, name: line.split('|')[2] ?? code,
        capacity_parallel: Number(parallel), efficiency_pct: Number(efficiency),
        working_hours: hours, holiday_calendar_id: calendar === '' ? null : calendar,
      }
    })
  const holidays = new Map<string, Set<string>>()
  for (const line of psql('SELECT COALESCE(calendar, \'\') || \'|\' || date::text FROM mfg_holidays;').split('\n').map(l => l.trim()).filter(l => l !== '')) {
    const [calendar, date] = line.split('|')
    const set = holidays.get(calendar) ?? new Set<string>()
    set.add(date)
    holidays.set(calendar, set)
  }
  const ops: OpRow[] = psql(`SELECT o.id || '|' || o.order_id || '|' || m.code || '|' || o.seq || '|' || COALESCE(o.name, '') || '|' || COALESCE(o.workcenter_id::text, '') || '|' || COALESCE(o.planned_min::text, '0') || '|' || COALESCE(o.status, 'planned') || '|' || COALESCE(o.planned_date::text, '') || '|' || COALESCE(m.need_date::text, '')
FROM mfg_order_operations o JOIN mfg_orders m ON m.id = o.order_id
WHERE o.planned_date IS NOT NULL AND o.status <> 'void';`)
    .split('\n').map(line => line.trim()).filter(line => line !== '').map(line => {
      const [id, moId, moCode, seq, name, wcId, plannedMin, status, plannedDate, needDate] = line.split('|')
      return {
        id: Number(id), mo_id: Number(moId), mo_code: moCode, seq: Number(seq), name,
        wc_id: Number(wcId), planned_min: Number(plannedMin), status,
        planned_date: plannedDate === '' ? null : plannedDate, need_date: needDate === '' ? null : needDate,
      }
    })
  return { wcs, holidays, ops }
}

/** Whether a date is a working day for the work center (FCS semantics: Sundays + its calendar). */
function isWorkingDay(holidays: ReadonlyMap<string, ReadonlySet<string>>, wc: WorkCenterSpec, iso: string): boolean {
  if (dayNumber(iso) === 0) return false
  const own = holidays.get(wc.holiday_calendar_id ?? '')
  if (own !== undefined && own.has(iso)) return false
  return true
}

// ─── the load snapshot (GET /aps/load; the what-if before state) ───

/** One bucket cell: the load, the capacity, and the occupying MO rows. */
interface BucketRow {
  readonly wc_id: number
  readonly date: string
  readonly load_min: number
  readonly capacity_min: number
  readonly util_pct: number
  readonly open_min: number
  readonly mos: ReadonlyArray<{ mo_code: string, op_seq: number, minutes: number, status: string }>
}

/**
 * Compute the load buckets over every scheduled operation (all statuses —
 * done rows still consumed the day), tagging how much of the load is still
 * open. A bucket is a bottleneck candidate when load exceeds capacity and at
 * least one open operation sits on it.
 */
function loadBuckets(wcs: ReadonlyArray<WorkCenterSpec>, ops: ReadonlyArray<OpRow>): Map<string, BucketRow> {
  const capacity = new Map(wcs.map(wc => [wc.id, dailyCapacityMinutes(wc)]))
  const cells = new Map<string, { load: number, open: number, mos: Array<{ mo_code: string, op_seq: number, minutes: number, status: string }> }>()
  for (const op of ops) {
    if (op.planned_date === null) continue
    const key = `${String(op.wc_id)}:${op.planned_date}`
    const cell = cells.get(key) ?? { load: 0, open: 0, mos: [] }
    cell.load += op.planned_min
    if (op.status !== 'done' && op.status !== 'closed') cell.open += op.planned_min
    cell.mos.push({ mo_code: op.mo_code, op_seq: op.seq, minutes: op.planned_min, status: op.status })
    cells.set(key, cell)
  }
  const out = new Map<string, BucketRow>()
  for (const [key, cell] of cells) {
    const wcId = Number(key.split(':')[0])
    const cap = capacity.get(wcId) ?? 0
    out.set(key, {
      wc_id: wcId, date: key.split(':')[1] ?? '', load_min: cell.load, capacity_min: cap,
      util_pct: cap > 0 ? Math.round((cell.load / cap) * 100) : 0, open_min: cell.open, mos: cell.mos,
    })
  }
  return out
}

// ─── the what-if core (pure; zero writes) ───

/** The scenario knobs: per-WC daily overtime minutes and boosted MO ids. */
export interface WhatIfParams {
  readonly overtime: ReadonlyArray<{ wc_id: number, extra_min: number }>
  readonly boost: readonly number[]
}

/** One operation's placement comparison the delta view renders. */
export interface OpDelta {
  readonly op_id: number
  readonly mo_code: string
  readonly seq: number
  readonly name: string
  readonly wc_id: number
  readonly minutes: number
  readonly before_date: string | null
  readonly after_date: string
  readonly delta_days: number
  readonly overload_before: boolean
  readonly overload_after: boolean
}

/** The full what-if outcome: per-op deltas, per-bucket load deltas, rollups. */
export interface WhatIfOutcome {
  readonly replanned: number
  readonly moved: number
  readonly overload_cleared: number
  readonly overload_created: number
  readonly deltas: ReadonlyArray<OpDelta>
  readonly bucket_delta: ReadonlyArray<{ wc_id: number, date: string, before: number, after: number, capacity: number }>
  readonly peak: ReadonlyArray<{ wc_id: number, code: string, before_peak: number, after_peak: number }>
}

/** Parse + validate the raw params (misconfiguration fails loud). */
function parseWhatIf(wcs: ReadonlyArray<WorkCenterSpec>, openMos: ReadonlyArray<{ mo_id: number }>, raw: Record<string, unknown>): WhatIfParams {
  const rawOvertime = Array.isArray(raw['overtime']) ? raw['overtime'] as Array<Record<string, unknown>> : []
  const wcIds = new Set(wcs.map(wc => wc.id))
  const overtime: Array<{ wc_id: number, extra_min: number }> = []
  for (const row of rawOvertime) {
    const wcId = Number(row['wc_id'])
    const extra = Number(row['extra_min'])
    if (!wcIds.has(wcId)) throw new Error(`overtime 引用了不存在的工作中心 #${String(wcId)}`)
    if (!Number.isInteger(extra) || extra < 0 || extra > 960) throw new Error(`工作中心 #${String(wcId)} 的加班分钟需为 0-960 整数（收到 ${String(row['extra_min'])}）`)
    if (extra > 0) overtime.push({ wc_id: wcId, extra_min: extra })
  }
  const rawBoost = Array.isArray(raw['boost']) ? raw['boost'] : []
  const openIds = new Set(openMos.map(mo => mo.mo_id))
  const boost = rawBoost.map(Number).filter(id => Number.isInteger(id))
  for (const id of boost) {
    if (!openIds.has(id)) throw new Error(`boost 引用了无可排工序的 MO #${String(id)}（不在重算集合内）`)
  }
  return { overtime, boost: [...new Set(boost)] }
}

/**
 * The sandbox re-plan (pure): every operation with status='planned' re-books
 * greedily in (boost first, need_date, code) MO order under the scenario's
 * capacities; started/done operations stay as frozen base load; never-straddle
 * and the calendar semantics are the FCS engine's verbatim. Returns the
 * per-op deltas and the per-bucket load changes — nothing is written.
 * @param params - the overtime/boost knobs.
 * @returns the comparison outcome (before = the stored plan).
 */
export function planWhatIf(params: WhatIfParams): { outcome: WhatIfOutcome; afterOps: ReadonlyArray<{ id: number, date: string, overload: boolean }> } {
  const { wcs, holidays, ops } = readWorld()
  const overtime = new Map(params.overtime.map(row => [row.wc_id, row.extra_min]))
  const capacity = new Map(wcs.map(wc => [wc.id, dailyCapacityMinutes(wc) + (overtime.get(wc.id) ?? 0)]))
  const today = todayIso()
  const wcOf = new Map(wcs.map(wc => [wc.id, wc]))
  const frozen = ops.filter(op => op.status !== 'planned')
  const replannable = ops.filter(op => op.status === 'planned')
  // Base load: every frozen operation keeps its bucket.
  const load = new Map<string, number>()
  for (const op of frozen) {
    if (op.planned_date === null) continue
    const key = `${String(op.wc_id)}:${op.planned_date}`
    load.set(key, (load.get(key) ?? 0) + op.planned_min)
  }
  // MO order: boosted first, then need_date (nulls last), then code.
  const mos = [...new Map(replannable.map(op => [op.mo_id, { mo_id: op.mo_id, mo_code: op.mo_code, need_date: op.need_date }])).values()]
    .sort((a, b) => {
      const boostA = params.boost.includes(a.mo_id) ? 0 : 1
      const boostB = params.boost.includes(b.mo_id) ? 0 : 1
      if (boostA !== boostB) return boostA - boostB
      const needA = a.need_date ?? '9999-12-31'
      const needB = b.need_date ?? '9999-12-31'
      if (needA !== needB) return needA < needB ? -1 : 1
      return a.mo_code.localeCompare(b.mo_code)
    })
  const afterOps: Array<{ id: number, date: string, overload: boolean }> = []
  const beforeOverloadKeys = new Set<string>()
  for (const [key, cell] of loadBuckets(wcs, ops)) {
    if (cell.load_min > cell.capacity_min && cell.open_min > 0) beforeOverloadKeys.add(key)
  }
  for (const mo of mos) {
    let cursor = today
    for (const op of replannable.filter(row => row.mo_id === mo.mo_id).sort((a, b) => a.seq - b.seq)) {
      const wc = wcOf.get(op.wc_id)
      if (wc === undefined) throw new Error(`工序 #${String(op.id)} 挂在不存在的工作中心 #${String(op.wc_id)}`)
      const minutes = op.planned_min
      let date = cursor
      while (!isWorkingDay(holidays, wc, date)) date = nextDay(date)
      let overload = false
      const cap = capacity.get(wc.id) ?? 0
      if (minutes > cap) {
        // Never-straddle (the FCS boundary): the over-capacity operation lands
        // on the first working day with the overload marker — the split advice
        // stays the FCS console's business.
        overload = true
      } else {
        for (let guard = 0; guard < 400; guard += 1) {
          const key = `${String(wc.id)}:${date}`
          if ((load.get(key) ?? 0) + minutes <= cap) break
          date = nextDay(date)
          while (!isWorkingDay(holidays, wc, date)) date = nextDay(date)
        }
      }
      const key = `${String(wc.id)}:${date}`
      load.set(key, (load.get(key) ?? 0) + minutes)
      afterOps.push({ id: op.id, date, overload })
      cursor = date
    }
  }
  // Deltas.
  const afterByKey = new Map(afterOps.map(row => [row.id, row]))
  const deltas: OpDelta[] = []
  const bucketDelta: Array<{ wc_id: number, date: string, before: number, after: number, capacity: number }> = []
  let moved = 0
  let cleared = 0
  let created = 0
  const afterOverloadKeys = new Set<string>()
  const afterLoadByKey = new Map<string, number>()
  for (const [key, value] of load) afterLoadByKey.set(key, value)
  for (const op of replannable) {
    const after = afterByKey.get(op.id)
    if (after === undefined) continue
    const beforeKey = `${String(op.wc_id)}:${op.planned_date ?? ''}`
    const afterKey = `${String(op.wc_id)}:${after.date}`
    const capBefore = dailyCapacityMinutes(wcOf.get(op.wc_id) ?? wcs[0]!)
    const beforeOver = beforeOverloadKeys.has(beforeKey)
    // After-overload: the bucket above base capacity (scenario capacity for
    // the overtime centers), or the op's own never-straddle marker.
    const capAfter = capacity.get(op.wc_id) ?? 0
    const afterOver = after.overload || ((afterLoadByKey.get(afterKey) ?? 0) > capAfter)
    if (afterOver) afterOverloadKeys.add(afterKey)
    const deltaDays = op.planned_date === null ? 0 : Math.round((parseIso(after.date) - parseIso(op.planned_date)) / DAY_MS)
    if (after.date !== op.planned_date) moved += 1
    if (beforeOver && !afterOver) cleared += 1
    if (!beforeOver && afterOver) created += 1
    deltas.push({
      op_id: op.id, mo_code: op.mo_code, seq: op.seq, name: op.name, wc_id: op.wc_id, minutes: op.planned_min,
      before_date: op.planned_date, after_date: after.date, delta_days: deltaDays,
      overload_before: beforeOver, overload_after: afterOver,
    })
    void capBefore
  }
  // Bucket-level deltas (before buckets from the stored plan incl. frozen).
  const beforeBuckets = loadBuckets(wcs, ops)
  const keys = new Set([...beforeBuckets.keys(), ...load.keys()])
  for (const key of keys) {
    const before = beforeBuckets.get(key)?.load_min ?? 0
    const after = load.get(key) ?? 0
    if (before === after) continue
    const [wcIdPart, datePart] = key.split(':')
    bucketDelta.push({ wc_id: Number(wcIdPart), date: datePart ?? '', before, after, capacity: beforeBuckets.get(key)?.capacity_min ?? capacity.get(Number(wcIdPart)) ?? 0 })
  }
  // Peak utilization per WC (before vs after, over all buckets).
  const peak = wcs.map(wc => {
    let beforePeak = 0
    let afterPeak = 0
    const capBefore = dailyCapacityMinutes(wc)
    const capAfter = capacity.get(wc.id) ?? capBefore
    for (const cell of beforeBuckets.values()) {
      if (cell.wc_id === wc.id && cell.capacity_min > 0) beforePeak = Math.max(beforePeak, Math.round((cell.load_min / cell.capacity_min) * 100))
    }
    for (const [key, value] of load) {
      if (key.startsWith(`${String(wc.id)}:`) && capAfter > 0) afterPeak = Math.max(afterPeak, Math.round((value / capAfter) * 100))
    }
    return { wc_id: wc.id, code: wc.code, before_peak: beforePeak, after_peak: afterPeak }
  })
  return {
    outcome: {
      replanned: replannable.length, moved, overload_cleared: cleared, overload_created: created,
      deltas, bucket_delta: bucketDelta, peak,
    },
    afterOps,
  }
}

// ─── the promote leg (the only write; PMC/admin fenced) ───

/** The promote audit row the engine files (the 差异报告留存). */
function ensureApsRuntime(): void {
  psql(`CREATE TABLE IF NOT EXISTS aps_whatif_runs (
  id bigserial PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now(),
  actor text NOT NULL,
  params jsonb NOT NULL,
  delta jsonb NOT NULL,
  applied integer NOT NULL,
  note text
);`)
}

/** The usernames of 计划部（PMC） members (the promote fence population). */
function pmcUsernames(): Set<string> {
  const rows = psql(`SELECT u.username FROM "departmentsUsers" du JOIN users u ON u.id = du."userId" JOIN departments d ON d.id = du."departmentId" WHERE d.title = '计划部（PMC）';`).trim()
  return new Set(rows === '' ? [] : rows.split('\n'))
}

/**
 * The promote fence: 计划部（PMC） members plus admin (APS 面向 planner — the
 * plan's role cut; simulation stays open to any signed-in reader, applying is
 * the planner's single write).
 * @param io - the NocoBase REST IO (unused; the fence reads the org via psql).
 * @param actor - the session-derived username.
 * @throws Error naming the fence when the actor is outside 计划部/admin.
 */
export async function assertApsActor(io: NocoIO, actor: string): Promise<void> {
  void io
  if (actor === 'admin' || actor === 'nocobase') return
  if (!pmcUsernames().has(actor)) {
    throw new Error(`排产应用限 计划部（PMC）/admin 操作（${actor} 不在围栏内）`)
  }
}

// ─── the engine route ───

type RouteOutcome = { status: number, body: Record<string, unknown> }

const apsFail = (status: number, code: string, message: string): RouteOutcome => ({ status, body: { ok: false, code, message, error: message } })

/**
 * The APS engine surface: GET /aps/load (the bottleneck + heatmap feed),
 * POST /aps/whatif (pure compute — zero writes), POST /aps/promote (the
 * fenced apply with the audit row). Errors carry machine codes; fence and
 * state refusals map to 403/409 with their facts.
 * @param io - the NocoBase REST IO (signature parity with the route family).
 * @param pathname - /aps/load | /aps/whatif | /aps/promote.
 * @param method - GET or POST.
 * @param params - POST: the parsed JSON body; GET: the URL query params.
 * @param actor - the session-derived username.
 * @returns the HTTP outcome for writeJson.
 */
export async function apsRoute(io: NocoIO, pathname: string, method: string, params: Record<string, unknown>, actor: string): Promise<RouteOutcome> {
  void io
  if (pathname === '/aps/load' && method === 'GET') {
    const { wcs, ops } = readWorld()
    const days = Math.min(Math.max(Number(params['days'] ?? 14) || 14, 7), 28)
    const buckets = [...loadBuckets(wcs, ops).values()]
    const bottlenecks = buckets
      .filter(cell => cell.load_min > cell.capacity_min && cell.open_min > 0)
      .sort((a, b) => (b.load_min / Math.max(1, b.capacity_min)) - (a.load_min / Math.max(1, a.capacity_min)))
      .map(cell => ({
        wc_id: cell.wc_id, wc_code: wcs.find(wc => wc.id === cell.wc_id)?.code ?? `#${String(cell.wc_id)}`,
        date: cell.date, load_min: cell.load_min, capacity_min: cell.capacity_min, util_pct: cell.util_pct,
        mos: cell.mos.filter(mo => mo.status !== 'done'),
      }))
    const today = todayIso()
    const dates: string[] = []
    for (let i = 0; i < days; i += 1) dates.push(isoOf(parseIso(today) + i * DAY_MS))
    const allBuckets = loadBuckets(wcs, ops)
    const matrix = wcs.map(wc => ({
      wc_id: wc.id, code: wc.code, name: wc.name, capacity_min: dailyCapacityMinutes(wc), calendar: wc.holiday_calendar_id ?? '',
      cells: dates.map(date => {
        const cell = allBuckets.get(`${String(wc.id)}:${date}`)
        return { date, load_min: cell?.load_min ?? 0, util_pct: cell?.util_pct ?? 0, open_min: cell?.open_min ?? 0 }
      }),
    }))
    const openMos = [...new Map(ops.filter(op => op.status === 'planned').map(op => [op.mo_id, { mo_id: op.mo_id, mo_code: op.mo_code, need_date: op.need_date, open_ops: ops.filter(row => row.mo_id === op.mo_id && row.status === 'planned').length }])).values()]
      .sort((a, b) => a.mo_code.localeCompare(b.mo_code))
    return {
      status: 200,
      body: {
        ok: true, actor, today, days,
        workcenters: wcs.map(wc => ({ id: wc.id, code: wc.code, name: wc.name, capacity_min: dailyCapacityMinutes(wc), calendar: wc.holiday_calendar_id ?? '' })),
        bottlenecks, matrix, dates, open_mos: openMos,
      },
    }
  }
  if (pathname === '/aps/whatif' && method === 'POST') {
    try {
      const { wcs, ops } = readWorld()
      const openMos = [...new Map(ops.filter(op => op.status === 'planned').map(op => [op.mo_id, { mo_id: op.mo_id }])).values()]
      const parsed = parseWhatIf(wcs, openMos, params)
      const { outcome } = planWhatIf(parsed)
      log(`[aps] whatif by ${actor}: overtime=${JSON.stringify(parsed.overtime)} boost=${JSON.stringify(parsed.boost)} → replanned=${String(outcome.replanned)} moved=${String(outcome.moved)}（零写入）`)
      return { status: 200, body: { ok: true, actor, params: { overtime: parsed.overtime, boost: parsed.boost }, ...outcome } }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      return apsFail(400, 'bad_scenario', message)
    }
  }
  if (pathname === '/aps/promote' && method === 'POST') {
    try {
      await assertApsActor(io, actor)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      console.error(`[aps] promote refused: ${message}`)
      return apsFail(403, 'fenced', message)
    }
    let parsed: WhatIfParams
    try {
      const { wcs, ops } = readWorld()
      const openMos = [...new Map(ops.filter(op => op.status === 'planned').map(op => [op.mo_id, { mo_id: op.mo_id }])).values()]
      parsed = parseWhatIf(wcs, openMos, params)
    } catch (error) {
      return apsFail(400, 'bad_scenario', error instanceof Error ? error.message : String(error))
    }
    const { outcome, afterOps } = planWhatIf(parsed)
    ensureApsRuntime()
    const note = typeof params['note'] === 'string' ? params['note'].slice(0, 400) : ''
    const storedOps = new Map(readWorld().ops.map(op => [op.id, op]))
    let applied = 0
    for (const row of afterOps) {
      const op = storedOps.get(row.id)
      if (op === undefined || op.planned_date === row.date) continue
      const changed = psql(`UPDATE mfg_order_operations SET planned_date = ${sqlLit(row.date)} WHERE id = ${String(row.id)} AND status = 'planned' RETURNING id;`).trim()
      if (changed !== '') applied += 1
    }
    // MO horizon refresh for every touched order.
    psql(`UPDATE mfg_orders m SET planned_start = s.min_date, planned_end = s.max_date
FROM (SELECT order_id, MIN(planned_date) AS min_date, MAX(planned_date) AS max_date FROM mfg_order_operations WHERE order_id IN (SELECT DISTINCT order_id FROM mfg_order_operations WHERE status = 'planned') GROUP BY order_id) s
WHERE m.id = s.order_id AND (m.planned_start <> s.min_date OR m.planned_end <> s.max_date);`)
    // -t -A prints the RETURNING rows followed by the command tag; the id
    // rides the first line.
    const runId = Number(psql(`INSERT INTO aps_whatif_runs (actor, params, delta, applied, note)
VALUES (${sqlLit(actor)}, ${sqlLit(JSON.stringify({ overtime: parsed.overtime, boost: parsed.boost }))}::json, ${sqlLit(JSON.stringify({ moved: outcome.moved, overload_cleared: outcome.overload_cleared, overload_created: outcome.overload_created, deltas: outcome.deltas }))}::json, ${String(applied)}, ${sqlLit(note)}) RETURNING id;`)
      .split('\n').map(line => line.trim()).filter(line => line !== '')[0] ?? '0')
    log(`[aps] promote by ${actor}: applied=${String(applied)} run=#${String(runId)}`)
    return { status: 200, body: { ok: true, actor, applied, run_id: runId, moved: outcome.moved, overload_cleared: outcome.overload_cleared, overload_created: outcome.overload_created } }
  }
  return apsFail(404, 'no_route', `no aps route ${method} ${pathname}`)
}

// ─── the two JSBlocks (APS瓶颈与负荷 / APS what-if沙箱) ───

/**
 * The bottleneck + heatmap block source: the KPI strip (超载桶数/最重瓶颈/
 * 开放 MO 数), the bottleneck attribution table (one row per overloaded
 * bucket — 负荷率=已分配工时/可用工时 with the occupying MO rows), and the
 * WC × day utilization heatmap (red ≥100%, amber ≥80%, weekend/holiday cells
 * hatched). Data only from GET /aps/load; marker 'w6b8-aps-load'.
 */
export const APS_LOAD_CODE = [
  "// w6b8-aps-load: the upgrade marker (ensure + assert match this)",
  "const ENGINE = String(window.__W6_ENGINE_BASE__ || 'http://127.0.0.1:13110');",
  "const TOKEN = localStorage.getItem('NOCOBASE_TOKEN') || '';",
  "const AMP = '\\u0026';",
  "const esc = (s) => String(s == null ? '' : s).replace(/[&<>\"']/g, (c) => ({ '&': AMP + 'amp;', '<': AMP + 'lt;', '>': AMP + 'gt;', '\"': AMP + 'quot;', \"'\": AMP + '#39;' }[c]));",
  "const state = { data: null, note: '' };",
  "const api = async (path) => {",
  "  const resp = await fetch(ENGINE + path, { headers: { authorization: 'Bearer ' + TOKEN } });",
  "  return { status: resp.status, ok: resp.ok, json: await resp.json().catch(() => ({})) };",
  "};",
  "const heatBg = (util) => {",
  // W7 forge: heat ramp = semantic trio via color-mix over the --w7-* tokens
  // (red >=100% starts deep and saturates toward 90% at ~190%+ load).
  "  if (util <= 0) return 'transparent';",
  "  if (util >= 100) return 'color-mix(in srgb, var(--w7-negative-fg) ' + String(Math.round(Math.min(90, 55 + (util - 100) / 2))) + '%, transparent)';",
  "  if (util >= 80) return 'color-mix(in srgb, var(--w7-critical-fg) ' + String(Math.round(25 + 0.6 * (util - 80))) + '%, transparent)';",
  "  return 'color-mix(in srgb, var(--w7-positive-fg) ' + String(Math.round(12 + 0.3 * util)) + '%, transparent)';",
  "};",
  "const load = async () => {",
  "  const out = await api('/aps/load?days=14');",
  "  if (out.json && out.json.ok) { state.data = out.json; state.note = ''; }",
  "  else state.note = '✗ 负荷数据加载失败（' + esc((out.json && (out.json.message || out.json.error)) || ('HTTP ' + String(out.status))) + '）';",
  "  paint();",
  "};",
  "function paint() {",
  "  const root = document.querySelector('[data-w6b8=\"aps-load\"]');",
  "  if (!root) return;",
  "  const d = state.data;",
  "  if (!d) { root.innerHTML = '<div style=\"color:var(--w7-text-weak);padding:8px\">' + esc(state.note || '加载中…') + '</div>'; return; }",
  "  const bn = d.bottlenecks || [];",
  "  const worst = bn[0] || null;",
  "  const kpi = '<div style=\"display:flex;gap:10px;flex-wrap:wrap;margin-bottom:10px\">'",
  "    + '<div style=\"border:1px solid var(--w7-negative-fg);background:var(--w7-negative-bg);border-radius:var(--w7-radius-card);padding:8px 14px\"><div style=\"font-size:var(--w7-fs-caption);color:var(--w7-text-weak)\">超载桶（负荷率>100% 且含开放工序）</div><div style=\"font-size:var(--w7-fs-kpi);font-weight:600;color:var(--w7-negative-fg)\">' + String(bn.length) + '</div></div>'",
  "    + (worst ? '<div style=\"border:1px solid var(--w7-border-strong);border-radius:var(--w7-radius-card);padding:8px 14px\"><div style=\"font-size:var(--w7-fs-caption);color:var(--w7-text-weak)\">最重瓶颈</div><div style=\"font-size:var(--w7-fs-subtitle);font-weight:700\">' + esc(worst.wc_code) + ' · ' + esc(worst.date) + ' · <span style=\"color:var(--w7-negative-fg)\">' + String(worst.util_pct) + '%</span></div></div>' : '')",
  "    + '<div style=\"border:1px solid var(--w7-border-strong);border-radius:var(--w7-radius-card);padding:8px 14px\"><div style=\"font-size:var(--w7-fs-caption);color:var(--w7-text-weak)\">可重排 MO（含 planned 工序）</div><div style=\"font-size:var(--w7-fs-kpi);font-weight:600\">' + String((d.open_mos || []).length) + '</div></div>'",
  "    + '<div style=\"border:1px solid var(--w7-border-strong);border-radius:var(--w7-radius-card);padding:8px 14px;flex:1;min-width:220px\"><div style=\"font-size:var(--w7-fs-caption);color:var(--w7-text-weak)\">口径</div><div style=\"font-size:var(--w7-fs-caption);color:var(--w7-text-secondary)\">负荷率 = 已分配工时 ÷ 可用工时（mfg_work_centers 班次跨度×并行数，与 FCS 排产同式）；瓶颈 = 负荷率>100% 且仍有开放工序的桶</div></div></div>';",
  "  const bnTable = bn.length === 0",
  "    ? '<div style=\"color:var(--w7-positive-fg);padding:8px 0\">当前无超载工作中心桶 ✓</div>'",
  "    : '<table style=\"border-collapse:collapse;width:100%;font-size:var(--w7-fs-caption)\"><thead><tr style=\"background:var(--w7-surface-2);color:var(--w7-text-secondary)\">'",
  "      + '<th style=\"padding:5px 8px;text-align:left\">工作中心</th><th style=\"padding:5px 8px;text-align:left\">日期</th><th style=\"padding:5px 8px;text-align:left\">已分配</th><th style=\"padding:5px 8px;text-align:left\">可用/日</th><th style=\"padding:5px 8px;text-align:left\">负荷率</th><th style=\"padding:5px 8px;text-align:left\">占用 MO（归因）</th></tr></thead><tbody>'",
  "      + bn.map(b => '<tr style=\"background:var(--w7-negative-bg)\">'",
  "        + '<td style=\"padding:5px 8px;border-bottom:1px solid var(--w7-border);font-weight:700\">' + esc(b.wc_code) + '</td>'",
  "        + '<td style=\"padding:5px 8px;border-bottom:1px solid var(--w7-border)\">' + esc(b.date) + '</td>'",
  "        + '<td style=\"padding:5px 8px;border-bottom:1px solid var(--w7-border)\">' + String(b.load_min) + ' 分</td>'",
  "        + '<td style=\"padding:5px 8px;border-bottom:1px solid var(--w7-border)\">' + String(b.capacity_min) + ' 分</td>'",
  "        + '<td style=\"padding:5px 8px;border-bottom:1px solid var(--w7-border)\"><b style=\"color:var(--w7-negative-fg)\">' + String(b.util_pct) + '%</b></td>'",
  "        + '<td style=\"padding:5px 8px;border-bottom:1px solid var(--w7-border)\">' + b.mos.map(m => esc(m.mo_code) + '#工序' + String(m.op_seq) + '（' + String(m.minutes) + '分·' + esc(m.status) + '）').join('<br>') + '</td></tr>').join('')",
  "      + '</tbody></table>';",
  "  const heatTable = '<div style=\"overflow-x:auto\"><table style=\"border-collapse:collapse;font-size:var(--w7-fs-caption)\"><thead><tr style=\"background:var(--w7-surface-2)\">'",
  "    + '<th style=\"padding:4px 6px\">工作中心\\日</th>'",
  "    + d.dates.map(dt => '<th style=\"padding:4px 4px;font-weight:' + (dt === d.today ? '700;color:var(--w7-primary)' : '400') + '\">' + esc(dt.slice(5)) + (dt === d.today ? '今' : '') + '</th>').join('')",
  "    + '</tr></thead><tbody>'",
  "    + (d.matrix || []).map(row => '<tr>'",
  "      + '<td style=\"padding:4px 6px;font-weight:700;white-space:nowrap\">' + esc(row.code) + '<span style=\"color:var(--w7-text-weak);font-weight:400\">（' + String(row.capacity_min) + '分/日）</span></td>'",
  "      + row.cells.map(c => {",
  "        const title = c.date + ' ' + String(c.load_min) + '/' + String(row.capacity_min) + ' 分（' + String(c.util_pct) + '%）';",
  "        return '<td title=\"' + esc(title) + '\" style=\"padding:6px 4px;text-align:center;border:1px solid var(--w7-surface-2);min-width:34px;background:' + heatBg(c.util_pct) + '\">' + (c.util_pct > 0 ? String(c.util_pct) : '·') + '</td>';",
  "      }).join('')",
  "      + '</tr>').join('')",
  "    + '</tbody></table></div>'",
  "    + '<div style=\"font-size:var(--w7-fs-caption);color:var(--w7-text-weak);margin-top:4px\">绿 <80% · 黄 ≥80% · 红 ≥100%（负荷率=已分配/可用）；空·=当日无排产；格悬浮看明细</div>';",
  "  root.innerHTML = [",
  "    '<div style=\"display:flex;align-items:center;gap:10px;margin-bottom:8px\"><b style=\"font-size:var(--w7-fs-subtitle)\">瓶颈归因 + 负荷热力</b><span style=\"flex:1\"></span><button data-act=\"reload\" style=\"padding:2px 12px;border:1px solid var(--w7-border-strong);border-radius:var(--w7-radius-control);cursor:pointer\">刷新</button></div>',",
  "    kpi,",
  "    '<div style=\"border:1px solid var(--w7-border);border-radius:var(--w7-radius-card);padding:8px 10px;margin-bottom:10px\"><div style=\"font-weight:700;margin-bottom:6px\">瓶颈归因（超载工作中心 × 占用 MO）</div>' + bnTable + '</div>',",
  "    '<div style=\"border:1px solid var(--w7-border);border-radius:var(--w7-radius-card);padding:8px 10px\"><div style=\"font-weight:700;margin-bottom:6px\">工作中心 × 日 负荷热力矩阵（未来 14 天）</div>' + heatTable + '</div>',",
  "  ].join('');",
  "};",
  "ctx.render('<div data-w6b8=\"aps-load\" style=\"padding:8px\"></div>');",
  "document.addEventListener('click', (ev) => {",
  "  const t = ev.target && ev.target.closest ? ev.target.closest('[data-act=\"reload\"]') : null;",
  "  if (t && document.querySelector('[data-w6b8=\"aps-load\"]')) void load();",
  "});",
  "void load();",
].join('\n')

/**
 * The what-if sandbox block source: the knob panel (per-WC overtime minutes,
 * per-MO priority boosts over the open MO list), 运行模拟 → POST /aps/whatif
 * (pure compute), the before/after comparison (per-op date moves with Δdays
 * badges and overload flag flips, per-WC peak utilization moves, per-bucket
 * load deltas), and the explicit 应用（Promote） → POST /aps/promote — fenced
 * to 计划部/admin, refusals surface inline. A permanent banner states the
 * isolation contract (模拟只读不落库；应用才写). Marker 'w6b8-aps-whatif'.
 */
export const APS_WHATIF_CODE = [
  "// w6b8-aps-whatif: the upgrade marker (ensure + assert match this)",
  "const ENGINE = String(window.__W6_ENGINE_BASE__ || 'http://127.0.0.1:13110');",
  "const TOKEN = localStorage.getItem('NOCOBASE_TOKEN') || '';",
  "const AMP = '\\u0026';",
  "const esc = (s) => String(s == null ? '' : s).replace(/[&<>\"']/g, (c) => ({ '&': AMP + 'amp;', '<': AMP + 'lt;', '>': AMP + 'gt;', '\"': AMP + 'quot;', \"'\": AMP + '#39;' }[c]));",
  "const state = { data: null, sim: null, note: '', busy: false };",
  "const api = async (path, post) => {",
  "  const resp = await fetch(ENGINE + path, post === undefined",
  "    ? { headers: { authorization: 'Bearer ' + TOKEN } }",
  "    : { method: 'POST', headers: { authorization: 'Bearer ' + TOKEN, 'content-type': 'application/json' }, body: JSON.stringify(post) });",
  "  return { status: resp.status, ok: resp.ok, json: await resp.json().catch(() => ({})) };",
  "};",
  "const load = async () => {",
  "  const out = await api('/aps/load?days=14');",
  "  if (out.json && out.json.ok) state.data = out.json;",
  "  paint();",
  "};",
  "const readKnobs = () => {",
  "  const root = document.querySelector('[data-w6b8=\"aps-whatif\"]');",
  "  if (!root || !state.data) return { overtime: [], boost: [] };",
  "  const overtime = [];",
  "  for (const wc of state.data.workcenters || []) {",
  "    const input = root.querySelector('[data-ot=\"' + String(wc.id) + '\"]');",
  "    if (!input) continue;",
  "    const v = Math.round(Number(input.value || 0));",
  "    if (v > 0) overtime.push({ wc_id: wc.id, extra_min: v });",
  "  }",
  "  const boost = [];",
  "  for (const mo of state.data.open_mos || []) {",
  "    const box = root.querySelector('[data-boost=\"' + String(mo.mo_id) + '\"]');",
  "    if (box && box.checked) boost.push(mo.mo_id);",
  "  }",
  "  return { overtime: overtime, boost: boost };",
  "};",
  "const runSim = async () => {",
  "  if (state.busy) return;",
  "  const knobs = readKnobs();",
  "  state.busy = true; state.note = ''; paint();",
  "  const out = await api('/aps/whatif', knobs);",
  "  state.busy = false;",
  "  if (out.json && out.json.ok) { state.sim = out.json; state.note = '✓ 模拟完成（只读计算——真实排产未变）'; }",
  "  else state.note = '✗ ' + esc((out.json && (out.json.message || out.json.error)) || ('HTTP ' + String(out.status)));",
  "  paint();",
  "};",
  "const promote = async () => {",
  "  if (state.busy || !state.sim) return;",
  "  if (!window.confirm('确认应用该场景到正式排产？将重写开放 planned 工序的计划日（planner/admin 围栏），并留存差异报告。')) return;",
  "  const knobs = readKnobs();",
  "  state.busy = true; paint();",
  "  const out = await api('/aps/promote', Object.assign({}, knobs, { note: 'W6-B8 what-if 沙箱应用' }));",
  "  state.busy = false;",
  "  if (out.json && out.json.ok) { state.note = '✓ 已应用：重排 ' + String(out.json.applied) + ' 道工序，差异报告 run=#' + String(out.json.run_id) + ' 已留存'; state.sim = null; await load(); }",
  "  else state.note = '✗ ' + esc((out.json && (out.json.message || out.json.error)) || ('HTTP ' + String(out.status)));",
  "  paint();",
  "};",
  "function paint() {",
  "  const root = document.querySelector('[data-w6b8=\"aps-whatif\"]');",
  "  if (!root) return;",
  "  const d = state.data;",
  "  if (!d) { root.innerHTML = '<div style=\"color:var(--w7-text-weak);padding:8px\">加载中…</div>'; return; }",
  "  const otRow = (d.workcenters || []).map(wc => '<label style=\"display:inline-flex;align-items:center;gap:4px;margin:2px 10px 2px 0;font-size:var(--w7-fs-body)\">' + esc(wc.code) + ' 加班 '",
  "    + '<input data-ot=\"' + String(wc.id) + '\" type=\"number\" min=\"0\" max=\"960\" step=\"30\" value=\"0\" style=\"width:70px;padding:2px 6px;border:1px solid var(--w7-border-strong);border-radius:var(--w7-radius-control)\" /> 分/日</label>').join('');",
  "  const boostRow = (d.open_mos || []).map(mo => '<label style=\"display:inline-flex;align-items:center;gap:4px;margin:2px 10px 2px 0;font-size:var(--w7-fs-body)\"><input type=\"checkbox\" data-boost=\"' + String(mo.mo_id) + '\" /> ' + esc(mo.mo_code) + '（' + String(mo.open_ops) + ' 道开放工序' + (mo.need_date ? '·需 ' + esc(mo.need_date) : '') + '）</label>').join('') || '<span style=\"color:var(--w7-text-weak);font-size:var(--w7-fs-body)\">当前无可重排 MO</span>';",
  "  const banner = '<div style=\"background:var(--w7-primary-soft);border:1px solid var(--w7-primary);color:var(--w7-primary);border-radius:var(--w7-radius-card);padding:8px 12px;margin-bottom:10px;font-size:var(--w7-fs-body)\"><b>隔离规则</b>：模拟只读真实数据、零写入（mfg_order_operations 不因模拟变化）；只有点「应用（Promote）」才落库——限 计划部（PMC）/admin，留存差异报告（aps_whatif_runs）</div>';",
  "  let simHtml = '<div style=\"color:var(--w7-text-weak);padding:6px 0\">设置加班分钟或 MO 优先级后点「运行模拟」——展示前后对比（日期/超载标记/峰值负荷）</div>';",
  "  const s = state.sim;",
  "  if (s) {",
  "    const deltas = s.deltas || [];",
  "    const moved = deltas.filter(x => x.before_date !== x.after_date);",
  "    const flipped = deltas.filter(x => x.overload_before !== x.overload_after);",
  "    const deltaTable = moved.length === 0 && flipped.length === 0",
  "      ? '<div style=\"color:var(--w7-positive-fg);padding:6px 0\">本场景不改变任何工序日期与超载标记（与现行计划等价）</div>'",
  "      : '<table style=\"border-collapse:collapse;width:100%;font-size:var(--w7-fs-caption)\"><thead><tr style=\"background:var(--w7-surface-2);color:var(--w7-text-secondary)\">'",
  "        + '<th style=\"padding:4px 8px;text-align:left\">MO</th><th style=\"padding:4px 8px;text-align:left\">工序</th><th style=\"padding:4px 8px;text-align:left\">分钟</th><th style=\"padding:4px 8px;text-align:left\">现计划日</th><th style=\"padding:4px 8px;text-align:left\">模拟后</th><th style=\"padding:4px 8px;text-align:left\">Δ</th><th style=\"padding:4px 8px;text-align:left\">超载</th></tr></thead><tbody>'",
  "        + deltas.filter(x => x.before_date !== x.after_date || x.overload_before !== x.overload_after).map(x => '<tr>'",
  "          + '<td style=\"padding:4px 8px;border-bottom:1px solid var(--w7-border)\">' + esc(x.mo_code) + '</td>'",
  "          + '<td style=\"padding:4px 8px;border-bottom:1px solid var(--w7-border)\">' + String(x.seq) + ' ' + esc(x.name) + '</td>'",
  "          + '<td style=\"padding:4px 8px;border-bottom:1px solid var(--w7-border)\">' + String(x.minutes) + '</td>'",
  "          + '<td style=\"padding:4px 8px;border-bottom:1px solid var(--w7-border)\">' + esc(x.before_date || '—') + (x.overload_before ? ' <span style=\"color:var(--w7-negative-fg)\">⚠超载</span>' : '') + '</td>'",
  "          + '<td style=\"padding:4px 8px;border-bottom:1px solid var(--w7-border)\"><b>' + esc(x.after_date) + '</b>' + (x.overload_after ? ' <span style=\"color:var(--w7-negative-fg)\">⚠超载</span>' : '') + '</td>'",
  "          + '<td style=\"padding:4px 8px;border-bottom:1px solid var(--w7-border)\">' + (x.delta_days === 0 ? '同日' : (x.delta_days > 0 ? '+' : '') + String(x.delta_days) + ' 天') + '</td>'",
  "          + '<td style=\"padding:4px 8px;border-bottom:1px solid var(--w7-border)\">' + (x.overload_before !== x.overload_after ? (x.overload_after ? '<span style=\"color:var(--w7-negative-fg)\">新增超载</span>' : '<span style=\"color:var(--w7-positive-fg)\">解除 ✓</span>') : '—') + '</td></tr>').join('')",
  "        + '</tbody></table>';",
  "    const peakRow = (s.peak || []).map(p => {",
  "      const changed = p.before_peak !== p.after_peak;",
  "      return '<span style=\"display:inline-block;margin:2px 10px 2px 0;font-size:var(--w7-fs-caption);border:1px solid ' + (changed ? 'var(--w7-primary)' : 'var(--w7-border)') + ';border-radius:var(--w7-radius-control);padding:2px 8px\">' + esc(p.code) + ' 峰值负荷 ' + String(p.before_peak) + '% → <b>' + String(p.after_peak) + '%</b></span>';",
  "    }).join('');",
  "    const bucketRows = (s.bucket_delta || []).slice(0, 12).map(b => '<tr><td style=\"padding:3px 8px;border-bottom:1px solid var(--w7-border)\">#' + String(b.wc_id) + '</td><td style=\"padding:3px 8px;border-bottom:1px solid var(--w7-border)\">' + esc(b.date) + '</td><td style=\"padding:3px 8px;border-bottom:1px solid var(--w7-border)\">' + String(b.before) + '</td><td style=\"padding:3px 8px;border-bottom:1px solid var(--w7-border)\"><b>' + String(b.after) + '</b></td><td style=\"padding:3px 8px;border-bottom:1px solid var(--w7-border)\">' + String(b.capacity) + '</td></tr>').join('');",
  "    simHtml = '<div style=\"display:flex;gap:8px;flex-wrap:wrap;margin-bottom:8px\">'",
  "      + '<span style=\"border:1px solid var(--w7-border-strong);border-radius:var(--w7-radius-control);padding:4px 10px;font-size:var(--w7-fs-caption)\">重排工序 ' + String(s.replanned) + '</span>'",
  "      + '<span style=\"border:1px solid var(--w7-primary);color:var(--w7-primary);border-radius:var(--w7-radius-control);padding:4px 10px;font-size:var(--w7-fs-caption)\">日期移动 ' + String(s.moved) + '</span>'",
  "      + '<span style=\"border:1px solid var(--w7-positive-fg);color:var(--w7-positive-fg);border-radius:var(--w7-radius-control);padding:4px 10px;font-size:var(--w7-fs-caption)\">超载解除 ' + String(s.overload_cleared) + '</span>'",
  "      + '<span style=\"border:1px solid var(--w7-negative-fg);color:var(--w7-negative-fg);border-radius:var(--w7-radius-control);padding:4px 10px;font-size:var(--w7-fs-caption)\">新增超载 ' + String(s.overload_created) + '</span></div>'",
  "      + '<div style=\"margin-bottom:6px\">' + peakRow + '</div>'",
  "      + '<div style=\"border:1px solid var(--w7-border);border-radius:var(--w7-radius-card);padding:8px 10px;margin-bottom:8px\"><div style=\"font-weight:700;margin-bottom:4px\">工序前后对比（仅变化行）</div>' + deltaTable + '</div>'",
  "      + (bucketRows !== '' ? '<div style=\"border:1px solid var(--w7-border);border-radius:var(--w7-radius-card);padding:8px 10px\"><div style=\"font-weight:700;margin-bottom:4px\">桶负荷变化（前12）</div><table style=\"border-collapse:collapse;font-size:var(--w7-fs-caption)\"><thead><tr style=\"background:var(--w7-surface-2);color:var(--w7-text-secondary)\"><th style=\"padding:3px 8px\">WC</th><th style=\"padding:3px 8px\">日期</th><th style=\"padding:3px 8px\">前(分)</th><th style=\"padding:3px 8px\">后(分)</th><th style=\"padding:3px 8px\">容量</th></tr></thead><tbody>' + bucketRows + '</tbody></table></div>' : ''),",
  "      + '<div style=\"margin-top:10px\"><button data-act=\"promote\" ' + (state.busy ? 'disabled' : '') + ' style=\"padding:6px 18px;border:1px solid var(--w7-primary);color:var(--w7-primary);background:#fff;border-radius:var(--w7-radius-control);cursor:' + (state.busy ? 'not-allowed' : 'pointer') + '\">应用（Promote）→ 写入正式排产</button> <span style=\"font-size:var(--w7-fs-caption);color:var(--w7-text-weak)\">限计划部/admin；写入后留存差异报告</span></div>';",
  "  }",
  "  root.innerHTML = [",
  "    '<div style=\"display:flex;align-items:center;gap:10px;margin-bottom:8px\"><b style=\"font-size:var(--w7-fs-subtitle)\">what-if 沙箱</b><span style=\"flex:1\"></span><button data-act=\"reload\" style=\"padding:2px 12px;border:1px solid var(--w7-border-strong);border-radius:var(--w7-radius-control);cursor:pointer\">刷新</button></div>',",
  "    banner,",
  "    '<div style=\"border:1px solid var(--w7-border);border-radius:var(--w7-radius-card);padding:8px 10px;margin-bottom:10px\">'",
  "    + '<div style=\"font-weight:700;margin-bottom:4px\">① 调整旋钮（加班分钟/日 · 0-960）</div><div>' + otRow + '</div>'",
  "    + '<div style=\"font-weight:700;margin:8px 0 4px\">② MO 优先级提升（提前排产）</div><div>' + boostRow + '</div>'",
  "    + '<div style=\"margin-top:10px\"><button data-act=\"sim\" ' + (state.busy ? 'disabled' : '') + ' style=\"padding:5px 16px;border:1px solid var(--w7-primary);color:var(--w7-primary);background:#fff;border-radius:var(--w7-radius-control);cursor:' + (state.busy ? 'not-allowed' : 'pointer') + '\">' + (state.busy ? '计算中…' : '▶ 运行模拟（不落库）') + '</button></div></div>',",
  "    simHtml,",
  "    '<div data-w6b8-note style=\"font-size:var(--w7-fs-caption);color:' + (String(state.note).indexOf('✗') === 0 ? 'var(--w7-negative-fg)' : 'var(--w7-positive-fg)') + ';margin-top:6px;min-height:16px\">' + esc(state.note) + '</div>',",
  "  ].join('');",
  "};",
  "ctx.render('<div data-w6b8=\"aps-whatif\" style=\"padding:8px\"></div>');",
  "document.addEventListener('click', (ev) => {",
  "  const t = ev.target && ev.target.closest ? ev.target.closest('[data-act]') : null;",
  "  if (!t || !document.querySelector('[data-w6b8=\"aps-whatif\"]') || !document.querySelector('[data-w6b8=\"aps-whatif\"]').contains(t)) return;",
  "  const kind = t.getAttribute('data-act');",
  "  if (kind === 'reload') { state.note = ''; return void load(); }",
  "  if (kind === 'sim') return void runSim();",
  "  if (kind === 'promote') return void promote();",
  "});",
  "void load();",
].join('\n')

// ─── the two APS pages (under 生产与计划) ───

/**
 * Lay one APS page (a fresh flowPage + grid + the given JSBlock code,
 * idempotent by page title + block code) under 生产与计划.
 * @param token - the root API token.
 * @param opts - title/icon/description and the block code + marker.
 */
async function ensureApsPage(token: string, opts: { title: string, icon: string, description: string, code: string, marker: string }): Promise<void> {
  const routes = await listRoutes(token, 'W6B8APS')
  const groupId = routes.find(row => row.title === '生产与计划' && row.type === 'group')?.id
  if (groupId === undefined) throw new Error('menu group 生产与计划 missing (run the W-round mfg seeds first)')
  let pageId = routes.find(row => row.title === opts.title && row.type === 'flowPage')?.id
  if (pageId === undefined) {
    const routeUid = withN17Prefix('w6b8a', '')
    const page = await dataOf(token, 'POST', '/api/desktopRoutes:create', { title: opts.title, icon: opts.icon, type: 'flowPage', parentId: groupId, sort: 20, schemaUid: routeUid }) as { id?: unknown }
    pageId = Number(page.id ?? 0)
    const tabUid = withN17Prefix('w6b8a', 't')
    await dataOf(token, 'POST', '/api/desktopRoutes:create', { title: '', type: 'tabs', parentId: page.id, schemaUid: tabUid, tabSchemaName: withN17Prefix('w6b8a', 'ts') })
    const save = (model: Record<string, unknown>): Promise<unknown> => dataOf(token, 'POST', '/api/flowModels:save', model)
    await save({ uid: routeUid, schema: { use: 'RouteModel' } })
    await save({ uid: tabUid, schema: { use: 'RouteModel' } })
    await save({
      uid: withN17Prefix('w6b8a', 'p'), parentId: routeUid, subKey: 'page', subType: 'object', use: 'RootPageModel',
      props: { title: opts.title, displayTitle: true, enableTabs: false },
      stepParams: { pageSettings: { general: { title: opts.title, displayTitle: true, enableTabs: false, description: opts.description } } },
    })
    await save({ uid: withN17Prefix('w6b8a', 'g'), parentId: tabUid, subKey: 'grid', subType: 'object', use: 'BlockGridModel', props: {}, filterManager: [] })
    log(`w6b8-aps: v2 page ${opts.title} created (/admin/${routeUid})`)
  }
  // The tab row is re-listed after a fresh create (the pre-create snapshot
  // cannot know the new page's children).
  const tab = (await listRoutes(token, 'W6B8APS-tab')).find(row => row.parentId === pageId && row.type === 'tabs')
  if (tab?.schemaUid == null) throw new Error(`${opts.title} tabs 路由不在（页面铺设异常）`)
  const grid = await dataOf(token, 'GET', `/api/flowModels:findOne?parentId=${encodeURIComponent(String(tab.schemaUid))}&subKey=grid`) as { uid?: string } | null
  if (grid?.uid == null) throw new Error(`${opts.title} grid 不在（页面铺设异常）`)
  const models = await listFlowModels(token, 'W6B8APS2')
  const head = models.filter(row => row.use === 'JSBlockModel' && String(row.parentId ?? '') === String(grid.uid))
    .sort((a, b) => String(a.uid ?? '').localeCompare(String(b.uid ?? '')))[0]
  const currentCode = head === undefined ? '' : String(head.stepParams?.jsSettings?.runJs?.code ?? '')
  if (currentCode === opts.code) {
    log(`w6b8-aps: ${opts.title} JSBlock exists (${opts.marker} kept)`)
    return
  }
  if (head === undefined) {
    const block = await dataOf(token, 'POST', '/api/flowSurfaces:addBlock', { target: { uid: grid.uid }, type: 'jsBlock', settings: { showBlockCard: true, code: opts.code } }) as { uid?: unknown }
    log(`w6b8-aps: ${opts.title} JSBlock created (${opts.marker}, uid ${String(block.uid ?? '')})`)
    return
  }
  const version = String((head.stepParams?.jsSettings?.runJs as { version?: string } | undefined)?.version ?? 'v2')
  await dataOf(token, 'POST', '/api/flowModels:save', {
    uid: head.uid, name: head.uid, parentId: grid.uid, subKey: 'items', subType: 'array',
    use: 'JSBlockModel', stepParams: { jsSettings: { runJs: { version, code: opts.code } } }, props: { title: opts.title },
  })
  log(`w6b8-aps: ${opts.title} JSBlock code upgraded (${opts.marker})`)
}

/**
 * Lay both APS pages and the promote runtime table.
 * @param token - the root API token.
 */
export async function ensureApsPages(token: string): Promise<void> {
  ensureApsRuntime()
  await ensureApsPage(token, {
    title: 'APS瓶颈与负荷', icon: 'HeatMapOutlined',
    description: '瓶颈归因报告 + 负荷热力图（frePPLe A3/A4 理念，无求解器）：负荷率=已分配工时÷可用工时（与 FCS 排产同式）；超载且含开放工序的桶逐行列出占用 MO（归因）；WC×日 热力矩阵绿<80/黄≥80/红≥100',
    code: APS_LOAD_CODE, marker: 'w6b8-aps-load',
  })
  await ensureApsPage(token, {
    title: 'APS what-if沙箱', icon: 'PlayCircleOutlined',
    description: '交互式排产模拟：加班分钟/日（0-960）与 MO 优先级提升 → 内存重算（FCS 同口径：不跨天/周日与节假日休/同 MO 工序顺序）→ 前后对比（日期Δ/超载标记翻转/峰值负荷）。模拟零写入；显式「应用（Promote）」才落库（计划部/admin 围栏，差异报告留存 aps_whatif_runs）',
    code: APS_WHATIF_CODE, marker: 'w6b8-aps-whatif',
  })
}

// ─── --assert: the acceptance matrix ───

async function assertBase(): Promise<void> {
  log('— 瓶颈口径对账（负荷率计算式）')
  // The reconciliation twin: the bottleneck set straight from the FCS tables
  // (load = Σ planned_min per wc×date; capacity = the working-hours span ×
  // parallel, hand-written in SQL) versus the route's own computation.
  const sqlCount = psql(`WITH load AS (
  SELECT o.workcenter_id, o.planned_date, SUM(o.planned_min) AS load_min,
         SUM(CASE WHEN o.status <> 'done' THEN o.planned_min ELSE 0 END) AS open_min
  FROM mfg_order_operations o WHERE o.planned_date IS NOT NULL GROUP BY o.workcenter_id, o.planned_date
), cap AS (
  SELECT id, COALESCE(EXTRACT(EPOCH FROM (split_part(working_hours, '-', 2)::time - split_part(working_hours, '-', 1)::time)) / 60 * capacity_parallel, 0) AS cap FROM mfg_work_centers
)
SELECT count(*) FROM load l JOIN cap c ON c.id = l.workcenter_id
WHERE l.load_min > c.cap AND l.open_min > 0;`).trim()
  const out = await apsRoute({} as NocoIO, '/aps/load', 'GET', {}, 'assert')
  const bottlenecks = (out.body['bottlenecks'] ?? []) as Array<Record<string, unknown>>
  check('瓶颈行数：psql 手写负荷率式 = /aps/load 引擎输出', sqlCount === String(bottlenecks.length), `手写=${sqlCount} 引擎=${String(bottlenecks.length)}`)
  const w2b6 = bottlenecks.find(row => String(row['wc_code'] ?? '') === 'WC-W2B6')
  const w2b6Fact = w2b6 === undefined ? '不在瓶颈列表' : `${String(w2b6['load_min'])}|${String(w2b6['capacity_min'])}`
  check('W2-B6 拆单演示桶在瓶颈集合（1200分 > 480分/日）', w2b6 !== undefined && String(w2b6['load_min']) === '1200' && String(w2b6['capacity_min']) === '480', w2b6Fact)
  const runs = psql("SELECT to_regclass('aps_whatif_runs')::text;").trim()
  check('aps_whatif_runs 差异报告表在位', runs === 'aps_whatif_runs', runs)
}

async function assertPages(token: string): Promise<void> {
  log('— 铺页')
  const routes = await listRoutes(token, 'W6B8APS-assert')
  for (const title of ['APS瓶颈与负荷', 'APS what-if沙箱']) {
    check(`v2 页「${title}」在生产与计划组下`, routes.some(row => row.title === title && row.type === 'flowPage'))
  }
  const models = await listFlowModels(token, 'W6B8APS-assert2')
  for (const marker of ['w6b8-aps-load', 'w6b8-aps-whatif']) {
    check(`JSBlock ${marker} 挂载`, models.some(row => row.use === 'JSBlockModel' && String(row.stepParams?.jsSettings?.runJs?.code ?? '').includes(marker)))
  }
}

async function main(): Promise<void> {
  const token = await signInWithRetry()
  if (mode === 'seed') {
    await ensureApsPages(token)
    log('w6b8-aps: seed complete（两页 + promote 运行时表）')
    return
  }
  await assertBase()
  await assertPages(token)
  if (failures.length > 0) {
    log(`w6b8-aps: assert FAILED (${String(failures.length)})`)
    process.exitCode = 1
    return
  }
  log('w6b8-aps: assert PASS')
}

if (process.argv[1] !== undefined && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  await main()
}
