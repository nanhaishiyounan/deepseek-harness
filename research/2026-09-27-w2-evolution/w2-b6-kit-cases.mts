/**
 * W2-B6 acceptance chain: the execution-policy batch's checkbox suite
 * (plans/2026-09-27-w2-evolution/06-b6-execution-policy.md).
 *
 * Runs against the live NocoBase (:13000) and drives every gate through the
 * engine's front door — no bypass writes:
 *
 *   A. zero-drift prelude   every MO sits full_lock / 0 before any demo row
 *                           lands (the W-round default state).
 *   B. full_lock negatives  MO-00A kits partial → issuing refuses (需先齐套);
 *                           MO-00B kits assigned → issuing 100 posts (the
 *                           W-round positive), then 1 more refuses (ratio 0:
 *                           超 1 即拒).
 *   C. partial_allowed      MO-01 kits partial_allowed → the covered component
 *                           issues (±ISSUE_WIP + reservation consumed); the
 *                           uncovered one refuses (no reservation).
 *   D. overissue ratio      MO-02 (0.05): reserved 100 → issue 105 posts with
 *                           the 超领 5 note; cumulative 106 refuses (no row).
 *   E. state gate           MO-03 partial_allowed but approved (未 released):
 *                           kit and issue both refuse.
 *   F. ratio corruption     MO-04 carries -0.1: the engine fails loud, the row
 *                           is then destroyed (verify stays green).
 *   G. split card           MO-05 (1600 qty × 300min/400batch = 1200min on a
 *                           480min WC): --preview answers the structured
 *                           suggestion (3 splits × 432min) and saves it.
 *
 * Idempotent: every seed row skips on existence; posted issues keep.
 * Output: research/2026-09-27-w2-evolution/w2-b6-kit-cases.txt (tee).
 *
 * Usage: node --import tsx/esm research/2026-09-27-w2-evolution/w2-b6-kit-cases.mts
 */
import { call, dataOf, signInWithRetry } from '../../examples/kb-agent/scripts/nocobase-flow-page-lib.mts'
import { availabilityCheck, postIssue } from '../../examples/kb-agent/scripts/nocobase-h5-wms.mts'
import { spawnSync } from 'node:child_process'
import { join, resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const today = new Date().toISOString().slice(0, 10)

async function rowsOf(token: string, collection: string, pageSize = 500): Promise<Array<Record<string, any>>> {
  return (await dataOf(token, 'GET', `/api/${collection}:list?pageSize=${pageSize}`)) ?? []
}

function expect(cond: boolean, label: string, detail?: unknown): void {
  if (!cond) throw new Error(`断言失败：${label}${detail === undefined ? '' : ` — ${JSON.stringify(detail)}`}`)
  console.log(`w2-b6: ✓ ${label}`)
}

async function expectRefusal(label: string, body: () => Promise<unknown>, hint: string): Promise<void> {
  try {
    await body()
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    expect(message.includes(hint), `${label} → ${message.slice(0, 110)}`)
    return
  }
  throw new Error(`卡口负例未拦截：${label}（本应被拒却成功了）`)
}

async function ensureRow(token: string, collection: string, match: (row: Record<string, any>) => boolean, create: () => Promise<unknown>): Promise<Record<string, any>> {
  const existing = (await rowsOf(token, collection)).find(match)
  if (existing !== undefined) return existing
  await create()
  return (await rowsOf(token, collection)).find(match)!
}

async function main(): Promise<void> {
  const token = await signInWithRetry()
  const products = await rowsOf(token, 'hub_inv_products', 200)
  const stocks = await rowsOf(token, 'wms_stock', 500)
  const boms = await rowsOf(token, 'mfg_boms')
  const workCenters = await rowsOf(token, 'mfg_work_centers')

  // ── A. zero-drift prelude: every MO sits full_lock / 0 before the demo ──
  {
    const mos = await rowsOf(token, 'mfg_orders')
    // Demo rows (MO-W2B6-*) carry their own policies; the zero-drift claim
    // covers every pre-existing MO (re-run-safe: the demo set is excluded).
    const seeded = mos.filter(row => !String(row.code).startsWith('MO-W2B6-'))
    const drifted = seeded.filter(row => String(row.kit_policy ?? '') !== 'full_lock' || Number(row.overissue_ratio ?? 0) !== 0)
    expect(drifted.length === 0, `缺省零漂移前置：既有 ${String(seeded.length)} 个 MO 均 full_lock/0（w2b6 回填后；演示行另计）`, drifted.map(row => row.code))
  }

  // ── materials: PKG covers; the first active product with zero available stock starves ──
  const pkg = products.find(row => row.sku === 'RM-DMP-PKG')
  expect(pkg !== undefined, '素材：RM-DMP-PKG 产品行存在')
  const starving = products.find(row => row.status === 'active'
    && !stocks.some(stock => Number(stock.product_id) === Number(row.id) && Number(stock.qty_available ?? 0) > 0))
  expect(starving !== undefined, `素材：无可用库存的缺料组件（${String(starving?.sku)}）存在`)
  const finished = products.find(row => row.sku === 'FD-SNA-080')
  // A dedicated 480-minute demo WC (08:00-16:00) — the live WCs are 540-minute
  // (08:00-17:00) and belong to the W-round seed; the acceptance hand calc
  // (1200/480 → 3×432) gets its own center instead of touching them.
  const wc480 = await ensureRow(token, 'mfg_work_centers', row => row.code === 'WC-W2B6', async () => {
    await dataOf(token, 'POST', '/api/mfg_work_centers:create', {
      code: 'WC-W2B6', name: 'W2-B6 拆单演示（480 分钟/日）', capacity_parallel: 1, efficiency_pct: 100,
      cost_per_hour: 1, working_hours: '08:00-16:00', holiday_calendar_id: null, status: 'active',
    })
  })
  expect(String(wc480.working_hours).trim() === '08:00-16:00', `素材：480 分钟演示工作中心 ${String(wc480.code)}（${String(wc480.working_hours)}）`)

  // ── demo BOMs: DEMO (PKG + starving) / FULL (PKG only) / LONG (1200min op) ──
  const bomDemo = await ensureRow(token, 'mfg_boms', row => row.code === 'BOM-W2B6-DEMO', async () => {
    await dataOf(token, 'POST', '/api/mfg_boms:create', { code: 'BOM-W2B6-DEMO', product: { id: Number(finished?.id) }, version: 1, is_default: false, bom_status: 'active', remark: 'W2-B6 部分投料演示（齐/缺两行）' })
    const bomRow = (await rowsOf(token, 'mfg_boms')).find(row => row.code === 'BOM-W2B6-DEMO')!
    await dataOf(token, 'POST', '/api/mfg_bom_lines:create', { bom: { id: Number(bomRow.id) }, product: { id: Number(pkg?.id) }, qty_per_unit: 1, scrap_pct: 0, uom: '个' })
    await dataOf(token, 'POST', '/api/mfg_bom_lines:create', { bom: { id: Number(bomRow.id) }, product: { id: Number(starving?.id) }, qty_per_unit: 1, scrap_pct: 0, uom: 'kg' })
  })
  const bomFull = await ensureRow(token, 'mfg_boms', row => row.code === 'BOM-W2B6-FULL', async () => {
    await dataOf(token, 'POST', '/api/mfg_boms:create', { code: 'BOM-W2B6-FULL', product: { id: Number(finished?.id) }, version: 1, is_default: false, bom_status: 'active', remark: 'W2-B6 超领手算演示（单行 PKG，qty=100 → 预留恰 100）' })
    const bomRow = (await rowsOf(token, 'mfg_boms')).find(row => row.code === 'BOM-W2B6-FULL')!
    await dataOf(token, 'POST', '/api/mfg_bom_lines:create', { bom: { id: Number(bomRow.id) }, product: { id: Number(pkg?.id) }, qty_per_unit: 1, scrap_pct: 0, uom: '个' })
  })
  const bomLong = await ensureRow(token, 'mfg_boms', row => row.code === 'BOM-W2B6-LONG', async () => {
    await dataOf(token, 'POST', '/api/mfg_boms:create', { code: 'BOM-W2B6-LONG', product: { id: Number(finished?.id) }, version: 1, is_default: false, bom_status: 'active', remark: 'W2-B6 拆单建议卡演示（0 + ceil(1600/400)×300 = 1200 分钟）' })
    const bomRow = (await rowsOf(token, 'mfg_boms')).find(row => row.code === 'BOM-W2B6-LONG')!
    await dataOf(token, 'POST', '/api/mfg_bom_operations:create', { bom: { id: Number(bomRow.id) }, seq: 1, name: '超长杀菌', workcenter: { id: Number(wc480?.id) }, setup_min: 0, run_min: 300, batch_size: 400, alt_workcenter_id: null })
  })
  expect(String(bomDemo.bom_status) === 'active' && String(bomFull.bom_status) === 'active' && String(bomLong.bom_status) === 'active', '演示 BOM ×3 active')

  // ── demo MOs (REST seeds; the engine gates read the states directly) ──
  const moOf = async (code: string): Promise<Record<string, any>> =>
    (await rowsOf(token, 'mfg_orders')).find(row => row.code === code) ?? (() => { throw new Error(`MO ${code} 缺失`) })()
  const ensureMo = async (code: string, policy: 'full_lock' | 'partial_allowed', ratio: number, status: string, bomCode: string, qty: number): Promise<Record<string, any>> =>
    await ensureRow(token, 'mfg_orders', row => row.code === code, async () => {
      const bom = boms.find(row => row.code === bomCode) ?? (await rowsOf(token, 'mfg_boms')).find(row => row.code === bomCode)!
      await dataOf(token, 'POST', '/api/mfg_orders:create', {
        code, product: { id: Number(finished?.id) }, qty, bom: { id: Number(bom.id) },
        need_date: today, doc_status: status, kit_policy: policy, overissue_ratio: ratio,
        note: `W2-B6 演示（${code}）`,
      })
    })

  const mo00a = await ensureMo('MO-W2B6-00A', 'full_lock', 0, 'released', 'BOM-W2B6-DEMO', 100)
  const mo00b = await ensureMo('MO-W2B6-00B', 'full_lock', 0, 'released', 'BOM-W2B6-FULL', 100)
  const mo01 = await ensureMo('MO-W2B6-01', 'partial_allowed', 0, 'released', 'BOM-W2B6-DEMO', 100)
  const mo02 = await ensureMo('MO-W2B6-02', 'full_lock', 0.05, 'released', 'BOM-W2B6-FULL', 100)
  const mo03 = await ensureMo('MO-W2B6-03', 'partial_allowed', 0, 'approved', 'BOM-W2B6-FULL', 100)
  const mo05 = await ensureMo('MO-W2B6-05', 'full_lock', 0, 'approved', 'BOM-W2B6-LONG', 1600)
  console.log('w2-b6: 演示 MO ×6 就位（00A/00B/01/02/03 full — 05 approved）')

  const ensureIssue = async (code: string, mo: Record<string, any>, product: Record<string, any>, qty: number, note: string): Promise<Record<string, any>> => {
    const prior = (await rowsOf(token, 'mfg_material_issues')).find(row => row.code === code)
    if (prior !== undefined && String(prior.status) === 'draft' && Number(prior.qty) !== qty) {
      // An earlier run seeded a different quantity for this negative; re-seed.
      await dataOf(token, 'POST', `/api/mfg_material_issues:destroy?filterByTk=${String(prior.id)}`)
    }
    return await ensureRow(token, 'mfg_material_issues', row => row.code === code, async () => {
      await dataOf(token, 'POST', '/api/mfg_material_issues:create', {
        code, mo: { id: Number(mo.id) }, issue_date: today, product: { id: Number(product.id) }, qty, status: 'draft', note,
      })
    })
  }

  // ── B. full_lock zero drift: partial blocks; assigned issues; 超 1 即拒 ──
  {
    const verdict = await availabilityCheck(token, 'MO-W2B6-00A')
    expect(verdict.state === 'partial', '缺省零漂移 ①：full_lock MO 齐套 → partial（阻断，W 轮语义）', verdict)
    const moNow = await moOf('MO-W2B6-00A')
    expect(String(moNow.reservation_state) === 'partial', '缺省零漂移 ①b：reservation_state 落 partial')
    const mi = await ensureIssue('MI-W2B6-001', mo00a, pkg!, 100, '负例素材：full_lock partial 领料被拒')
    await expectRefusal('缺省零漂移 ②：partial MO 领料被拒（需先齐套 assigned）', () => postIssue(token, String(mi.code)), '需先齐套')
  }
  {
    const verdict = await availabilityCheck(token, 'MO-W2B6-00B')
    expect(verdict.state === 'assigned', '缺省零漂移 ③：full_lock 全齐 MO → assigned + 预留 100', verdict)
    const reservation = (await rowsOf(token, 'wms_reservations')).find(row => row.ref_type === 'MO' && row.ref_id === 'MO-W2B6-00B')
    expect(reservation !== undefined && Math.abs(Number(reservation.qty) - 100) < 1e-9, `缺省零漂移 ③b：预留量恰 100（1×1.00×100；${String(reservation?.status)}）`, reservation)
    const mi100 = await ensureIssue('MI-W2B6-002', mo00b, pkg!, 100, 'W 轮正例：assigned 全额领料 100')
    if (String(mi100.status) !== 'posted') await postIssue(token, 'MI-W2B6-002')
    const posted = (await rowsOf(token, 'mfg_material_issues')).find(row => row.code === 'MI-W2B6-002')
    expect(String(posted?.status) === 'posted', '缺省零漂移 ④：assigned 领 100 posted（W 轮正例）')
    const legs = (await rowsOf(token, 'wms_movements', 1000)).filter(row => row.doc_no === 'MI-W2B6-002' && row.move_type === 'ISSUE_WIP')
    expect(legs.length === 2 && Number(legs[0]?.qty) === -100 && Number(legs[1]?.qty) === 100, '缺省零漂移 ④b：±ISSUE_WIP 流水对（−100/+100）', legs.map(row => row.qty))
    // The 超 1 即拒 negative rides a fresh MO whose reservation is intact
    // (00B's was consumed by the 100-issue above) — a single 101 against the
    // reserved 100 walks the genuine over-issue assertion branch.
    const prior101 = (await rowsOf(token, 'mfg_material_issues')).find(row => row.code === 'MI-W2B6-010')
    if (prior101 !== undefined && String(prior101.status) === 'draft') {
      // A previous run already refused the 101 against the then-intact
      // reservation (the re-entry kit released it); the draft row is the
      // durable trail.
      console.log('w2-b6: ✓ 缺省零漂移 ⑤（前轮已验：ratio=0 单笔 101 拒——超 1 即拒，拒后行保持 draft）')
    } else {
      const mo00b2 = await ensureMo('MO-W2B6-00B2', 'full_lock', 0, 'released', 'BOM-W2B6-FULL', 100)
      const verdict2 = await availabilityCheck(token, 'MO-W2B6-00B2')
      expect(verdict2.state === 'assigned', '缺省零漂移 ⑤前置：00B2 齐套 assigned（预留 100 落过 RSV 行）', verdict2)
      const mi101 = await ensureIssue('MI-W2B6-010', mo00b2, pkg!, 101, '缺省回归：ratio=0 单笔 101 > 预留 100（超 1 即拒）')
      await expectRefusal('缺省零漂移 ⑤：ratio=0 领 101 拒（超 1 即拒，W 轮超领全拒——预留 100 上限 100）', () => postIssue(token, String(mi101.code)), '超领被拒')
    }
    const stale = (await rowsOf(token, 'mfg_material_issues')).find(row => row.code === 'MI-W2B6-003')
    if (stale !== undefined && String(stale.status) === 'draft') await dataOf(token, 'POST', `/api/mfg_material_issues:destroy?filterByTk=${String(stale.id)}`)
  }

  // ── C. partial_allowed: covered issues, uncovered refuses ──
  {
    const verdict = await availabilityCheck(token, 'MO-W2B6-01')
    expect(verdict.state === 'partial_allowed', '部分投料 ①：partial_allowed MO 齐套 → partial_allowed（非阻断新态）', verdict)
    const moNow = await moOf('MO-W2B6-01')
    expect(String(moNow.reservation_state) === 'partial_allowed', '部分投料 ①b：reservation_state 落 partial_allowed')
    const kitData = JSON.parse(String(moNow.kit_data ?? '{}')) as { state?: string, policy?: string, rows?: Array<{ sku?: string, shortfall?: number, eta?: string | null }> }
    expect(kitData.state === 'partial_allowed' && kitData.policy === 'partial_allowed', '部分投料 ①c：kit_data 带 state+policy', kitData)
    const starvingRow = (kitData.rows ?? []).find(row => row.sku === String(starving?.sku))
    expect(starvingRow !== undefined && Number(starvingRow.shortfall) === 100, `部分投料 ①d：缺料阶梯保留（${String(starving?.sku)} 短 100 挂 ETA 列）`, kitData.rows)
    const reservation = (await rowsOf(token, 'wms_reservations')).find(row => row.ref_type === 'MO' && row.ref_id === 'MO-W2B6-01' && Number(row.qty) > 0)
    expect(reservation !== undefined && Math.abs(Number(reservation.qty) - 100) < 1e-9, `部分投料 ②：已齐组件（PKG）照常落硬预留 100（${String(reservation?.status)}）`, reservation)
    const miA = await ensureIssue('MI-W2B6-007', mo01, pkg!, 100, '部分投料正例：已齐组件 PKG 领 100')
    if (String(miA.status) !== 'posted') await postIssue(token, 'MI-W2B6-007')
    const posted = (await rowsOf(token, 'mfg_material_issues')).find(row => row.code === 'MI-W2B6-007')
    expect(String(posted?.status) === 'posted', '部分投料 ③：领已齐组件成功（门禁放行 partial_allowed）')
    const consumed = (await rowsOf(token, 'wms_reservations')).find(row => row.ref_type === 'MO' && row.ref_id === 'MO-W2B6-01' && row.status === 'consumed')
    expect(consumed !== undefined, '部分投料 ③b：预留 consumed')
    const legs = (await rowsOf(token, 'wms_movements', 1000)).filter(row => row.doc_no === 'MI-W2B6-007' && row.move_type === 'ISSUE_WIP')
    expect(legs.length === 2, '部分投料 ③c：movements ISSUE_WIP ±对', legs.map(row => row.qty))
    const miB = await ensureIssue('MI-W2B6-008', mo01, starving!, 100, '部分投料负例：未齐组件无预留')
    await expectRefusal('部分投料 ④：领未齐组件拒（无有效预留——未齐组件本就无预留）', () => postIssue(token, String(miB.code)), '无有效预留')
  }

  // ── D. the 105/106 hand calc on ratio 0.05 ──
  {
    const verdict = await availabilityCheck(token, 'MO-W2B6-02')
    expect(verdict.state === 'assigned', '超领手算 ①：MO-02 齐套 assigned + 预留 100', verdict)
    const reservation = (await rowsOf(token, 'wms_reservations')).find(row => row.ref_type === 'MO' && row.ref_id === 'MO-W2B6-02')
    expect(reservation !== undefined && Math.abs(Number(reservation.qty) - 100) < 1e-9, `超领手算 ①b：预留量恰 100（100×1.05=105 的基数；${String(reservation?.status)}）`, reservation)
    const prior105 = (await rowsOf(token, 'mfg_material_issues')).find(row => row.code === 'MI-W2B6-004')
    if (String(prior105?.status) === 'posted') {
      // A previous run already rode the intact reservation (106 refused →
      // 105 posted, consuming it); re-verify the durable trail only.
      expect(String(prior105?.note ?? '').includes('超领 5') && String(prior105?.note ?? '').includes('0.05'), '超领手算 ②（前轮）：105 已过 + note 记超领 5（overissue_ratio 0.05）', prior105?.note)
      const priorRefused = (await rowsOf(token, 'mfg_material_issues')).find(row => row.code === 'MI-W2B6-005')
      expect(priorRefused === undefined || String(priorRefused.status) === 'draft', '超领手算 ③（前轮）：106 单无 posted 残留')
      console.log('w2-b6: ✓ 超领手算（前轮已验：单笔 106 拒 / 105 过 / note 超领 5——预留已消耗，跳过重验）')
    } else {
      // Ordering: the 106 refusal rides the intact reservation first (the
      // 105-issue consumes it — postIssue consumes per posting, so the
      // over-issue assertion branch needs the reserved row still standing).
      const mi106 = await ensureIssue('MI-W2B6-005', mo02, pkg!, 106, '超领手算：单笔 106 > 上限 105 拒')
      await expectRefusal('超领手算 ③：单笔 106 拒（106 > 100×1.05=105 上限——比例外一概不放行）', () => postIssue(token, String(mi106.code)), '超领被拒')
      const refused = (await rowsOf(token, 'mfg_material_issues')).find(row => row.code === 'MI-W2B6-005')
      expect(String(refused?.status) === 'draft', '超领手算 ③b：106 单无 posted 残留（仍 draft）')
      const mi105 = await ensureIssue('MI-W2B6-004', mo02, pkg!, 105, '超领手算：领 105（100×1.05 上限内）')
      await postIssue(token, 'MI-W2B6-004')
      const posted = (await rowsOf(token, 'mfg_material_issues')).find(row => row.code === 'MI-W2B6-004')
      expect(String(posted?.status) === 'posted', '超领手算 ②：领 105 过（105 ≤ 100×1.05）')
      expect(String(posted?.note ?? '').includes('超领 5') && String(posted?.note ?? '').includes('0.05'), '超领手算 ②b：行 note 记超领 5（overissue_ratio 0.05）', posted?.note)
    }
  }

  // ── E. the MO_EXECUTING gate never loosens with the policy ──
  {
    await expectRefusal('状态门禁 ①：partial_allowed 但 approved 未 released → 齐套拒', () => availabilityCheck(token, 'MO-W2B6-03'), '需先审批通过并下达')
    const mi = await ensureIssue('MI-W2B6-009', mo03, pkg!, 100, '状态门禁负例：未 released 不能领料')
    await expectRefusal('状态门禁 ②：partial_allowed 但未 released → 领料拒（MO_EXECUTING_STATES 不因策略放宽）', () => postIssue(token, String(mi.code)), '不能领料')
  }

  // ── F. a corrupted negative ratio fails loud, then the row goes away ──
  {
    await dataOf(token, 'POST', '/api/mfg_orders:create', {
      code: 'MO-W2B6-04', product: { id: Number(finished?.id) }, qty: 100, bom: { id: Number(bomFull.id) },
      need_date: today, doc_status: 'released', kit_policy: 'full_lock', overissue_ratio: -0.1,
      note: 'W2-B6 负例：负数比例（引擎 fail-loud 后销毁）',
    })
    await expectRefusal('负数比例：引擎读值 fail loud（超领比例非法）', () => availabilityCheck(token, 'MO-W2B6-04'), '超领比例非法')
    const bad = (await rowsOf(token, 'mfg_orders')).find(row => row.code === 'MO-W2B6-04')
    await dataOf(token, 'POST', `/api/mfg_orders:destroy?filterByTk=${String(bad?.id)}`)
    const gone = (await rowsOf(token, 'mfg_orders')).find(row => row.code === 'MO-W2B6-04')
    expect(gone === undefined, '负数比例：负例行销毁（verify 默认值断言保持全绿）')
  }

  // ── G. the split-suggestion card on a 1200-minute operation ──
  {
    const previewRun = spawnSync('node', ['--import', 'tsx/esm', join(repoRoot, 'examples/kb-agent/scripts/mfg-schedule.mts'), '--preview', 'MO-W2B6-05', '--save'], { encoding: 'utf8', cwd: repoRoot })
    expect(previewRun.status === 0, '拆单建议卡 ①：--preview --save 运行成功', previewRun.stderr?.slice(0, 200))
    const json = JSON.parse((previewRun.stdout ?? '').slice((previewRun.stdout ?? '').indexOf('{'))) as {
      operations?: Array<{ suggestion?: { kind?: string, minutes?: number, capacity?: number, suggestedSplits?: number, perSplitMinutes?: number }, note?: string, overload?: boolean }>
    }
    const card = json.operations?.[0]?.suggestion
    expect(json.operations?.[0]?.overload === true, '拆单建议卡 ②：overload 行标记')
    expect(card?.kind === 'split_suggestion' && card?.minutes === 1200 && card?.capacity === 480, '拆单建议卡 ③：1200 分需求 / 480 分产能', card)
    expect(card?.suggestedSplits === 3 && card?.perSplitMinutes === 432, '拆单建议卡 ④：建议拆 3 份 × 432 分/份（ceil(1200/432)=3）', card)
    expect((json.operations?.[0]?.note ?? '').includes('拆 3 份') && (json.operations?.[0]?.note ?? '').includes('432'), '拆单建议卡 ⑤：note 人话版完整（拆 3 份 × 432）', json.operations?.[0]?.note)
    const moNow = await moOf('MO-W2B6-05')
    const saved = JSON.parse(String(moNow.preview_data ?? '{}')) as { operations?: Array<{ suggestion?: { suggestedSplits?: number } }> }
    expect(saved.operations?.[0]?.suggestion?.suggestedSplits === 3, '拆单建议卡 ⑥：preview_data 落库（mobile 读侧可见）')
  }

  // ── the ledger gate stays green after every engine-front-door posting ──
  const ledgerRun = spawnSync('node', ['--import', 'tsx/esm', join(repoRoot, 'examples/kb-agent/scripts/nocobase-h5-wms.mts'), '--assert-ledger'], { encoding: 'utf8', cwd: repoRoot })
  expect(ledgerRun.status === 0, '账本对账：--assert-ledger 绿（stock == Σmovements）', ledgerRun.stderr?.slice(0, 200))

  console.log('w2-b6: kit-cases 全链 ✓ — 缺省零漂移×5 / 部分投料×4 / 超领手算 105过106拒×3 / 状态门禁×2 / 负数比例 fail-loud / 拆单建议卡×6 / 账本绿')
}

await main()
