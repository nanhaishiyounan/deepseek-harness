/**
 * W2-R2 · MPS 演示行重灌（W2-B7 遗留 #4 清偿）。
 *
 * The W2-B2 demo chain (nocobase-w7-mrp.mts --demo-mps) ends with the M9
 * void teardown, leaving the single seed plan void — correct for the
 * W-round resting demand set, wrong for a commercial demo. This driver
 * replays the chain's M0..M5 legs only and STOPS at the approved state:
 * self-heal → draft gate → hand-check SOs effective → max-merge recalc →
 * plan approval (lock-in) → covered-exclusivity close. No horizon run, no
 * confirm, no void teardown — the plan, its item rows, and the three
 * hand-check SOs stay live (approved).
 *
 * Exclusivity assertions (the B2 invariant this reseed must not break):
 * every covered item's level-0 snapshot row rides the mps: driver, the
 * uncovered SOY line keeps its direct SO feed, and no covered product has
 * an extra SO-driven level-0 row (no SO+MPS double count).
 *
 * Usage (repo root): node --import tsx/esm research/2026-09-27-w2-evolution/w2-r2-mps-reseed.mts
 */
import { spawnSync } from 'node:child_process'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { dataOf, signInWithRetry } from '../../examples/kb-agent/scripts/nocobase-flow-page-lib.mts'
import { act, submitForApproval, type NocoIO } from '../../examples/kb-agent/scripts/approval-engine.mts'
import { recalcPlan, runMrp } from '../../examples/kb-agent/scripts/mrp-run.mts'

const here = dirname(fileURLToPath(import.meta.url))
const scripts = join(here, '../../examples/kb-agent/scripts')
const HAND_CHECK_SOS = ['SO-2026-0091', 'SO-2026-0092', 'SO-2026-0093'] as const

/** The YYYY-MM `offset` months from today (offset 1 = next month). */
function monthOffset(offset: number): string {
  const now = new Date()
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + offset, 1)).toISOString().slice(0, 7)
}

/** q4-sum quantities (the snapshot gross identity helper). */
function q4Sum(values: ReadonlyArray<number>): number {
  return Math.round(values.reduce((total, value) => total + value, 0) * 10_000) / 10_000
}

async function rowsOf(token: string, collection: string, pageSize = 500): Promise<Array<Record<string, any>>> {
  return (await dataOf(token, 'GET', `/api/${collection}:list?pageSize=${pageSize}`)) ?? []
}

const ioOf = (token: string): NocoIO => ({
  list: async (collection, filter) => {
    const query = filter === undefined ? '' : `&filter=${encodeURIComponent(JSON.stringify(filter))}`
    return (await dataOf(token, 'GET', `/api/${collection}:list?pageSize=500${query}`)) ?? []
  },
  get: async (collection, id) => (await dataOf(token, 'GET', `/api/${collection}:get?filterByTk=${id}`)) ?? undefined,
  create: async (collection, values) => await dataOf(token, 'POST', `/api/${collection}:create`, values),
  update: async (collection, id, values) => { await dataOf(token, 'POST', `/api/${collection}:update?filterByTk=${id}`, values) },
  updateWhere: async (collection, filter, values) => {
    const rows = await dataOf(token, 'POST', `/api/${collection}:update?filter=${encodeURIComponent(JSON.stringify(filter))}&pageSize=10`, values)
    return Array.isArray(rows) ? rows.length : rows === null || rows === undefined ? 0 : 1
  },
  destroy: async () => { throw new Error('unused') },
})

/** Assert the covered-exclusivity invariants over one close's snapshots. */
function assertExclusivity(snaps: ReadonlyArray<Record<string, any>>, runId: string, code: string, coveredIds: ReadonlySet<number>, soSoy: number): void {
  const level0 = snaps.filter(row => String(row.run_id) === runId && Number(row.bom_level) === 0)
  for (const id of coveredIds) {
    const rows = level0.filter(row => Number(row.product_id) === id)
    if (rows.length !== 1) throw new Error(`互斥破口：covered item #${String(id)} level0 有 ${String(rows.length)} 行（应恰 1 行 mps: 驱动）`)
    if (String(rows[0]!.driver_so) !== `mps:${code}`) {
      throw new Error(`互斥破口：item #${String(id)} level0 driver=${String(rows[0]!.driver_so)}（应为 mps:${code}）`)
    }
  }
  const doubleCounted = level0.filter(row => coveredIds.has(Number(row.product_id)) && HAND_CHECK_SOS.some(so => String(row.driver_so) === so))
  if (doubleCounted.length > 0) throw new Error(`SO+MPS 双计：covered 物料存在 SO 直纳 level0 行（${JSON.stringify(doubleCounted.map(row => [row.product_id, row.driver_so]))}）`)
  const soySnap = level0.find(row => Number(row.product_id) === soSoy)
  if (soySnap === undefined || Number(soySnap.gross) !== 3_000 || String(soySnap.driver_so) !== 'SO-2026-0093') {
    throw new Error(`未覆盖反例失败：SOY 应直纳 3000/SO-2026-0093（实际 ${String(soySnap?.gross)}/${String(soySnap?.driver_so)}）`)
  }
}

async function main(): Promise<void> {
  const token = await signInWithRetry()
  const io = ioOf(token)
  const code = `MPS-${monthOffset(1).replace('-', '')}-01`
  console.log(`w2-r2-mps-reseed: ══ 重灌活跃 MPS 行（${code}：自愈→draft卡口→对拍SO生效→max合并→批准锁定→互斥日结，停在 approved）══`)

  // M0 replay self-heal: void → draft for the plan and the hand-check SOs
  // (the direct-write precedent the demo chain itself rides).
  let plan = (await rowsOf(token, 'mps_plans')).find(row => row.code === code)
  if (plan === undefined) throw new Error(`种子缺失：${code}（先跑 nocobase-w7-mrp.mts 主流程）`)
  if (['void', 'approved'].includes(String(plan.doc_status))) {
    await dataOf(token, 'POST', `/api/mps_plans:update?filterByTk=${plan.id}`, { doc_status: 'draft', note: 'W2-R2 重灌：自愈回 draft' })
    console.log(`w2-r2-mps-reseed: M0 ${code} ${String(plan.doc_status)}→draft（自愈）`)
    plan = (await rowsOf(token, 'mps_plans')).find(row => row.code === code)
  }
  for (const soCode of HAND_CHECK_SOS) {
    const so = (await rowsOf(token, 'so_orders')).find(row => row.code === soCode)
    if (so === undefined) throw new Error(`对拍 SO 缺失：${soCode}`)
    if (['void', 'approved'].includes(String(so.doc_status))) {
      await dataOf(token, 'POST', `/api/so_orders:update?filterByTk=${so.id}`, { doc_status: 'draft' })
      console.log(`w2-r2-mps-reseed: M0 ${soCode} ${String(so.doc_status)}→draft（自愈）`)
    }
  }
  if (String(plan?.doc_status) !== 'draft') throw new Error(`M0 未归一 draft（${String(plan?.doc_status)}）`)

  // M1 draft gate: a draft plan never drives the close.
  const gateRun = await runMrp(token)
  const gateSnaps = (await rowsOf(token, 'mrp_snapshots')).filter(row => row.run_id === gateRun.run_id)
  if (gateSnaps.some(row => String(row.driver_so ?? '').startsWith('mps:'))) {
    throw new Error('M1 draft 卡口失败：draft 计划出现 mps: 驱动行')
  }
  console.log(`w2-r2-mps-reseed: M1 draft 卡口 ✓ ${gateRun.run_id} 无 mps: 驱动行`)

  // M2 hand-check SOs go effective through the engine.
  for (const soCode of HAND_CHECK_SOS) {
    const so = (await rowsOf(token, 'so_orders')).find(row => row.code === soCode)
    if (String(so?.doc_status) === 'draft') {
      await submitForApproval(io, 'so_orders', Number(so!.id), '计划员乙')
      const result = await act(io, 'so_orders', Number(so!.id), 'approve', 'admin', 'W2-R2 重灌：对拍 SO 生效')
      if (result.to_state !== 'approved') throw new Error(`${soCode} 审批未达 approved（${result.to_state}）`)
    }
  }
  console.log('w2-r2-mps-reseed: M2 对拍 SO ×3 approved ✓（引擎 submit→approve）')

  // M3 the max-merge recalc hand-checks (the --refresh-mps computation).
  const outcomes = await recalcPlan(token, Number(plan!.id))
  const bev = outcomes.find(row => row.sku === 'FD-BEV-1000')
  if (bev === undefined || bev.so_open !== 300 || bev.forecast !== 500 || bev.planned !== 500 || bev.driver !== 'forecast') {
    throw new Error(`M3 对拍例1失败（BEV max(300,500)=500/forecast）：${JSON.stringify(bev)}`)
  }
  const frz = outcomes.find(row => row.sku === 'FD-FRZ-450' && row.period === monthOffset(2))
  if (frz === undefined || frz.so_open !== 700 || frz.forecast !== 400 || frz.planned !== 700 || frz.driver !== 'so') {
    throw new Error(`M3 对拍例2失败（FRZ 期2 max(700,400)=700/so）：${JSON.stringify(frz)}`)
  }
  console.log(`w2-r2-mps-reseed: M3 max 合并对拍 ✓ BEV max(300,500)=500（forecast）；FRZ 期2 max(700,400)=700（so）`)

  // M4 plan approval through the engine (the effective hook re-runs the
  // merge — the lock-in), then one explicit recalc to mirror the
  // `mrp-run.mts --refresh-mps <id>` re-baseline path.
  await submitForApproval(io, 'mps_plans', Number(plan!.id), '计划员乙')
  const m4 = await act(io, 'mps_plans', Number(plan!.id), 'approve', 'admin', 'W2-R2 重灌：MPS 批准（生效锁定快照）')
  if (!m4.effective) throw new Error(`M4 MPS 审批未生效（${m4.to_state}）`)
  await recalcPlan(token, Number(plan!.id))
  const approvedPlan = (await rowsOf(token, 'mps_plans')).find(row => row.code === code)
  if (String(approvedPlan?.doc_status) !== 'approved') throw new Error(`M4 未达 approved（${String(approvedPlan?.doc_status)}）`)
  console.log(`w2-r2-mps-reseed: M4 MPS 批准 ✓ ${code} approved（生效钩子锁定 + recalc 重算基线）`)

  // M5 the covered-exclusivity close under the default 60-day window.
  const products = await rowsOf(token, 'hub_inv_products', 200)
  const items = (await rowsOf(token, 'mps_plan_items')).filter(row => Number(row.plan_id) === Number(plan!.id))
  const coveredIds = new Set(items.map(row => Number(row.product_id)))
  const snaId = Number(products.find(row => row.sku === 'FD-SNA-080')?.id ?? 0)
  const soyId = Number(products.find(row => row.sku === 'FD-SOY-500')?.id ?? 0)
  const plannedSum = q4Sum(items.filter(row => Number(row.product_id) === snaId).map(row => Number(row.planned_qty ?? 0)))
  const mpsRun = await runMrp(token)
  const mpsSnaps = (await rowsOf(token, 'mrp_snapshots')).filter(row => row.run_id === mpsRun.run_id)
  assertExclusivity(mpsSnaps, mpsRun.run_id, code, coveredIds, soyId)
  const snaSnap = mpsSnaps.find(row => Number(row.product_id) === snaId && Number(row.bom_level) === 0)
  if (snaSnap === undefined || Math.abs(Number(snaSnap.gross) - plannedSum) > 0.01) {
    throw new Error(`M5 gross 恒等式失败：SNA gross ${String(snaSnap?.gross)} ≠ Σplanned ${String(plannedSum)}`)
  }
  const soySuggestion = (await rowsOf(token, 'mrp_suggestions')).find(row => row.run_id === mpsRun.run_id && String(row.status) === 'open' && Number(row.product_id) === soyId)
  if (soySuggestion !== undefined) throw new Error('M5 JIT 窗负例失败：SOY（远期）在 60 天窗内生成了建议')
  console.log(`w2-r2-mps-reseed: M5 互斥日结 ✓ ${mpsRun.run_id}：covered ${String(coveredIds.size)} item 全 mps: 驱动；SNA gross=${String(snaSnap?.gross)}=Σplanned ${String(plannedSum)}；SOY 直纳照旧且窗外无建议；无 SO+MPS 双计`)

  // M6' the CLI front door once more (--run-mrp) — the archived rerun must
  // keep the invariants on a fresh run too.
  const cli = spawnSync('node', ['--import', 'tsx/esm', join(scripts, 'mrp-run.mts'), '--run-mrp'], { encoding: 'utf8' })
  const cliText = `${cli.stdout ?? ''}${cli.stderr ?? ''}`
  if (cli.status !== 0) throw new Error(`--run-mrp 复跑失败\n${cliText.slice(0, 400)}`)
  process.stdout.write(cliText)
  const allSnaps = await rowsOf(token, 'mrp_snapshots')
  const lastRunId = String(allSnaps.reduce((max, row) => Number(row.id) > Number(max.id ?? 0) ? row : max, allSnaps[0]!)?.run_id ?? '')
  assertExclusivity(allSnaps, lastRunId, code, coveredIds, soyId)
  console.log(`w2-r2-mps-reseed: M6' CLI --run-mrp 复跑 ✓ ${lastRunId} 互斥仍成立（covered mps: 驱动 + SOY 直纳 + 无双计）`)

  // The resting terminal state (approved, live).
  const finalItems = (await rowsOf(token, 'mps_plan_items')).filter(row => Number(row.plan_id) === Number(plan!.id))
  console.log('w2-r2-mps-reseed: ══ 终态（活跃演示形态）══')
  console.log(`w2-r2-mps-reseed: plan ${code} doc_status=${String(approvedPlan?.doc_status)} approved_by=${String(approvedPlan?.approved_by ?? '')}`)
  for (const row of finalItems) {
    const sku = String(products.find(p => Number(p.id) === Number(row.product_id))?.sku ?? row.product_id)
    console.log(`w2-r2-mps-reseed: item ${sku} ${String(row.period)} forecast=${String(row.forecast_qty)} so_open=${String(row.so_open_qty)} planned=${String(row.planned_qty)} driver=${String(row.driver)}`)
  }
  for (const soCode of HAND_CHECK_SOS) {
    const so = (await rowsOf(token, 'so_orders')).find(row => row.code === soCode)
    console.log(`w2-r2-mps-reseed: ${soCode} doc_status=${String(so?.doc_status)}`)
  }
  console.log('w2-r2-mps-reseed: done — 活跃 MPS 行重灌完成，停在 approved（无 JIT 窗覆盖 / 无确认转单 / 无 void 复原）')
}

await main()
