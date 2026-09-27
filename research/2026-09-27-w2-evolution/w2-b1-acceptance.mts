/**
 * W2-B1 · AQL 全量清偿验收剧本（plans/2026-09-27-w2-evolution/01-b1-aql-full-table.md
 * 验收 checkbox 的引擎侧编排；psql 全量对照与浏览器取证另行归档）。
 *
 * 载体供应商（零既有 IQC 历史，剧本专属）：
 *   SUP-008 顺发冷链（normal）   —— 段外判定解锁 + 转移得分/放宽往返剧本
 *   SUP-009 漳州蜜果（null→normal）—— normal→tightened→suspended→resume 剧本
 *   SUP-003 江南乳业（tightened 种子）—— tightened × 0.65 查表未命中负例
 *   SUP-006 丹东禾丰（suspended 种子）—— 停检入口拒绝负例
 *
 * 单据族 QI-W2B1-*；再跑（无 --reset）时校验终态而非重走 single-shot 判定。
 * --reset 清场重放：销毁 QI-W2B1-* 并把 SUP-008/009 重置 normal/score=0。
 *
 * Usage (repo root):
 *   node --import tsx/esm research/2026-09-27-w2-evolution/w2-b1-acceptance.mts
 *   node --import tsx/esm research/2026-09-27-w2-evolution/w2-b1-acceptance.mts --reset
 */
import { spawnSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { call, dataOf, signInWithRetry } from '../../examples/kb-agent/scripts/nocobase-flow-page-lib.mts'

const here = dirname(fileURLToPath(import.meta.url))
const scripts = join(here, '../../examples/kb-agent/scripts')

async function rowsOf(token: string, collection: string, pageSize = 500): Promise<Array<Record<string, any>>> {
  return (await dataOf(token, 'GET', `/api/${collection}:list?pageSize=${pageSize}`)) ?? []
}

function run(script: string, args: readonly string[], expectFailKeyword?: string): string {
  const result = spawnSync('node', ['--import', 'tsx/esm', join(scripts, script), ...args], { encoding: 'utf8' })
  const text = `${result.stdout ?? ''}${result.stderr ?? ''}`
  if (expectFailKeyword !== undefined) {
    if (result.status === 0 || !text.includes(expectFailKeyword)) {
      throw new Error(`${script} ${args.join(' ')} 应被拒（含「${expectFailKeyword}」）却成功\n${text.slice(0, 300)}`)
    }
    console.log(`w2b1: [负例 ✓] ${args.join(' ')} → ${expectFailKeyword}`)
    return text
  }
  if (result.status !== 0) throw new Error(`${script} ${args.join(' ')} failed\n${text.slice(0, 400)}`)
  return text
}

function assert(condition: boolean, label: string): void {
  if (!condition) throw new Error(`断言失败：${label}`)
  console.log(`w2b1: ✓ ${label}`)
}

async function supplierOf(token: string, code: string): Promise<Record<string, any>> {
  const row = (await rowsOf(token, 'srm_suppliers')).find(item => String(item.code) === code)
  if (row === undefined) throw new Error(`种子缺失：${code}（先跑 nocobase-h4-srm.mts）`)
  return row
}

/** Find-or-create one manual IQC inspection document (code-keyed idempotent). */
async function ensureDoc(token: string, code: string, supplierCode: string, lotQty: number, lotNo: string): Promise<Record<string, any>> {
  const existing = (await rowsOf(token, 'qm_inspections')).find(row => String(row.code) === code)
  if (existing !== undefined) return existing
  const supplier = await supplierOf(token, supplierCode)
  const product = (await rowsOf(token, 'hub_inv_products', 200)).find(row => row.sku === 'FD-SOY-500')
  await dataOf(token, 'POST', '/api/qm_inspections:create', {
    code, insp_type: 'IQC', ref_type: 'receipt', ref_no: `MANUAL-W2B1-${code}`, ref_id: 0,
    ...(product === undefined ? {} : { product: { id: Number(product.id) } }),
    supplier: { id: Number(supplier.id) },
    lot_no: lotNo, lot_qty: lotQty, sample_qty: 0,
    defect_critical: 0, defect_major: 0, defect_minor: 0,
    result: 'pending', status: 'pending', inspector: '', note: `W2-B1 验收剧本（${supplierCode}，批量 ${String(lotQty)}）`,
  })
  const created = (await rowsOf(token, 'qm_inspections')).find(row => String(row.code) === code)
  if (created === undefined) throw new Error(`建单失败：${code}`)
  return created
}

/** Inspect one lot through the engine CLI front door (d lands on the minor axis). */
function inspect(code: string, d: number, aql: string, resubmission = false): void {
  run('nocobase-h5-wms.mts', ['--inspect', code, '--defects', `0,0,${String(d)}`, '--inspector', 'w2b1验收', '--aql', aql, ...(resubmission ? ['--resubmission'] : [])])
}

async function judgedRow(token: string, code: string): Promise<Record<string, any>> {
  const row = (await rowsOf(token, 'qm_inspections')).find(item => String(item.code) === code)
  if (row === undefined || String(row.status) !== 'closed') throw new Error(`${code} 未完成判定`)
  return row
}

async function main(): Promise<void> {
  const token = await signInWithRetry()
  const reset = process.argv.slice(2).includes('--reset')

  if (reset) {
    for (const row of (await rowsOf(token, 'qm_inspections')).filter(item => String(item.code).startsWith('QI-W2B1-'))) {
      await call(token, 'POST', `/api/qm_inspections:destroy?filterByTk=${String(row.id)}`)
    }
    for (const code of ['SUP-008', 'SUP-009']) {
      const supplier = await supplierOf(token, code)
      await dataOf(token, 'POST', `/api/srm_suppliers:update?filterByTk=${supplier.id}`, { iqc_level: 'normal', switch_score: 0, reject_streak: 0 })
    }
    console.log('w2b1: --reset 清场完成（QI-W2B1-* 销毁；SUP-008/009 → normal/0/0；SUP-009 原 iqc_level NULL 与 normal 语义等同，差异记录在 Agent Note）')
  }

  const prior = (await rowsOf(token, 'qm_inspections')).filter(item => String(item.code).startsWith('QI-W2B1-'))
  const supplier8 = await supplierOf(token, 'SUP-008')
  const supplier9 = await supplierOf(token, 'SUP-009')
  if (prior.length > 0) {
    // Replay: verify the terminal states instead of re-walking single-shot verdicts.
    assert(String(supplier8.iqc_level) === 'normal' && Number(supplier8.switch_score ?? 0) === 0, '重放终态 SUP-008 = normal / score 0（放宽后回正常）')
    assert(String(supplier9.iqc_level) === 'tightened', '重放终态 SUP-009 = tightened（停检恢复从加严开始）')
    const resumed9 = (await rowsOf(token, 'qm_inspections')).filter(item => Number(item.supplier_id) === Number(supplier9.id) && String(item.status) === 'closed').length
    assert(resumed9 >= 10, `重放终态 SUP-009 判定 ${String(resumed9)} 批（5 normal + 5 tightened）`)
    console.log('w2b1: replay verified（历史判定 single-shot 不重走；psql 对照见 w2-b1-aql-cases.txt）')
    return
  }

  console.log('w2b1: ══ W2-B1 验收剧本（箭头五例 / 段外解锁 / 四负例 / 转移得分与放宽往返 / 加严累计停检与恢复 / B8 零回归）══')

  // ── P0 · 箭头解析五例对拍（checkbox 2，纯函数层）──
  run('nocobase-w8-quality.mts', ['--selftest'])

  // ── P1 · 段外判定解锁（checkbox 3：批量 2000 × AQL2.5 正常态 → 1201-3200 段 K/125/Ac7/Re8）──
  const doc2000a = await ensureDoc(token, 'QI-W2B1-2000A', 'SUP-008', 2000, 'W2B1-2000A')
  const doc2000b = await ensureDoc(token, 'QI-W2B1-2000B', 'SUP-008', 2000, 'W2B1-2000B')
  if (String(doc2000a.result) === 'pending') inspect('QI-W2B1-2000A', 7, '2.5')
  if (String(doc2000b.result) === 'pending') inspect('QI-W2B1-2000B', 8, '2.5')
  {
    const a = await judgedRow(token, 'QI-W2B1-2000A')
    const b = await judgedRow(token, 'QI-W2B1-2000B')
    assert(String(a.result) === 'passed' && String(a.aql_code) === 'K' && Number(a.aql_n) === 125 && Number(a.aql_ac) === 7 && Number(a.aql_re) === 8, '段外解锁：2000 × 2.5 × normal，d=7 → passed（K/125/Ac7/Re8）')
    assert(String(b.result) === 'failed' && Number(b.aql_ac) === 7 && Number(b.aql_re) === 8, '段外解锁：d=8 ≥ Re8 → failed')
    assert(String(a.rigor) === 'normal', '判定行 rigor 快照 = normal')
  }

  // ── P2 · 负例四连（checkbox 4）──
  {
    await ensureDoc(token, 'QI-W2B1-NEG-T065', 'SUP-003', 2000, 'W2B1-NEG-T065')
    run('nocobase-h5-wms.mts', ['--inspect', 'QI-W2B1-NEG-T065', '--defects', '0,0,1', '--inspector', 'w2b1验收', '--aql', '0.65'], '查表未命中')
    await ensureDoc(token, 'QI-W2B1-NEG-SUSP', 'SUP-006', 200, 'W2B1-NEG-SUSP')
    run('nocobase-h5-wms.mts', ['--inspect', 'QI-W2B1-NEG-SUSP', '--defects', '0,0,1', '--inspector', 'w2b1验收', '--aql', '2.5'], '已停检')
    await ensureDoc(token, 'QI-W2B1-NEG-FULL', 'SUP-008', 3, 'W2B1-NEG-FULL')
    run('nocobase-h5-wms.mts', ['--inspect', 'QI-W2B1-NEG-FULL', '--defects', '0,0,0', '--inspector', 'w2b1验收', '--aql', '0.65'], '转全检')
    await ensureDoc(token, 'QI-W2B1-NEG-N1', 'SUP-008', 1, 'W2B1-NEG-N1')
    run('nocobase-h5-wms.mts', ['--inspect', 'QI-W2B1-NEG-N1', '--defects', '0,0,0', '--inspector', 'w2b1验收', '--aql', '2.5'], '不在')
    const leftovers = (await rowsOf(token, 'qm_inspections')).filter(row => ['QI-W2B1-NEG-T065', 'QI-W2B1-NEG-SUSP', 'QI-W2B1-NEG-FULL', 'QI-W2B1-NEG-N1'].includes(String(row.code)) && String(row.status) === 'closed')
    assert(leftovers.length === 0, '四负例全部 fail-loud 且无判定残留行')
  }

  // ── P3 · 转移得分 + 放宽往返（checkbox 5 前半 + checkbox 6，SUP-008；批量 200 × AQL1.0 → H/50/Ac1/Re2）──
  {
    const codeAt = (n: number): string => `QI-W2B1-A${String(n).padStart(2, '0')}`
    for (let i = 1; i <= 10; i += 1) {
      await ensureDoc(token, codeAt(i), 'SUP-008', 200, `W2B1-A${String(i).padStart(2, '0')}`)
      if (String((await judgedRow(token, codeAt(i)).catch(() => ({ status: 'pending' }))).status) !== 'closed') inspect(codeAt(i), 1, '1.0')
    }
    let supplier = await supplierOf(token, 'SUP-008')
    assert(String(supplier.iqc_level) === 'normal' && Number(supplier.switch_score ?? 0) === 20, '转移得分：Ac=0/1 档接收 10 批 → score=20（+2/批）')

    // checkbox 6 负例：1 批拒收 → score 清零
    await ensureDoc(token, 'QI-W2B1-A11', 'SUP-008', 200, 'W2B1-A11')
    inspect('QI-W2B1-A11', 2, '1.0')
    supplier = await supplierOf(token, 'SUP-008')
    assert(Number(supplier.switch_score ?? 0) === 0 && String(supplier.iqc_level) === 'normal', '转移得分负例：1 批拒收 → score 清零（且 4 过 1 拒不触发加严）')

    for (let i = 12; i <= 26; i += 1) {
      await ensureDoc(token, codeAt(i), 'SUP-008', 200, `W2B1-A${String(i).padStart(2, '0')}`)
      inspect(codeAt(i), 1, '1.0')
    }
    supplier = await supplierOf(token, 'SUP-008')
    assert(Number(supplier.switch_score ?? 0) === 30, '转移得分：再接收 15 批 → score=30（放宽门槛）')

    // 再提交批不进计数器：拒收的再提交批不得清零 score
    await ensureDoc(token, 'QI-W2B1-A27-RESUB', 'SUP-008', 200, 'W2B1-A27')
    inspect('QI-W2B1-A27-RESUB', 2, '1.0', true)
    supplier = await supplierOf(token, 'SUP-008')
    assert(Number(supplier.switch_score ?? 0) === 30, '再提交批拒收不进计数器：score 保持 30（9.3.1 不考虑再提交批）')
    const resubRow = await judgedRow(token, 'QI-W2B1-A27-RESUB')
    assert(resubRow.resubmission === true, '再提交批标记落列（qm_inspections.resubmission=true）')

    // --iqc-relax：score<30 拒（守门负例挂 SUP-001：normal 态且 score 空=0；失败不写库无污染）→ score=30 放行 → relaxed
    run('nocobase-h5-wms.mts', ['--iqc-relax', 'SUP-001'], '转移得分')
    run('nocobase-h5-wms.mts', ['--iqc-relax', 'SUP-008'])
    supplier = await supplierOf(token, 'SUP-008')
    assert(String(supplier.iqc_level) === 'relaxed' && Number(supplier.switch_score ?? 0) === 0, '--iqc-relax 放行：normal → relaxed，score 清零（离开正常）')

    // 放宽态判定走放宽表（200 × 1.0 × reduced → J/32/Ac1/Re2）→ 任一批不接收自动回 normal
    await ensureDoc(token, 'QI-W2B1-A28', 'SUP-008', 200, 'W2B1-A28')
    inspect('QI-W2B1-A28', 2, '1.0')
    const a28 = await judgedRow(token, 'QI-W2B1-A28')
    assert(String(a28.rigor) === 'reduced' && String(a28.aql_code) === 'J' && Number(a28.aql_n) === 32 && Number(a28.aql_ac) === 1 && Number(a28.aql_re) === 2, '放宽态查放宽表：J/32/Ac1/Re2')
    supplier = await supplierOf(token, 'SUP-008')
    assert(String(supplier.iqc_level) === 'normal' && Number(supplier.switch_score ?? 0) === 0, '放宽→正常：1 批不接收自动回 normal（9.3.4），score 清零')
  }

  // ── P4 · 加严累计停检 + 恢复（checkbox 5 后半，SUP-009；批量 200 × AQL2.5）──
  {
    const codeAt = (n: number): string => `QI-W2B1-B${String(n).padStart(2, '0')}`
    // normal 5 批（过拒过过拒）→ 第 5 批时最近 5 批 2 拒 → tightened（W 轮既有行为）
    const defects = [2, 3, 2, 2, 3]
    for (let i = 1; i <= 5; i += 1) {
      await ensureDoc(token, codeAt(i), 'SUP-009', 200, `W2B1-B${String(i).padStart(2, '0')}`)
      inspect(codeAt(i), defects[i - 1]!, '2.5')
    }
    let supplier = await supplierOf(token, 'SUP-009')
    assert(String(supplier.iqc_level) === 'tightened', '正常→加严：初次检验 5 批 2 拒（9.3.1，W 轮行为零回归）')

    // 加严 5 批全拒（200 × 2.5 × tightened → G/32/Ac1/Re2，d=2 ≥ Re2）→ 累计 5 拒停检
    for (let i = 6; i <= 10; i += 1) {
      await ensureDoc(token, codeAt(i), 'SUP-009', 200, `W2B1-B${String(i).padStart(2, '0')}`)
      inspect(codeAt(i), 2, '2.5')
    }
    supplier = await supplierOf(token, 'SUP-009')
    assert(String(supplier.iqc_level) === 'suspended', '加严→停检：加严下累计 5 批不接收（9.4 累计口径）')
    const b06 = await judgedRow(token, codeAt(6))
    assert(String(b06.rigor) === 'tightened' && String(b06.aql_code) === 'G' && Number(b06.aql_n) === 32 && Number(b06.aql_ac) === 1 && Number(b06.aql_re) === 2, '加严态查真加严表：G/32/Ac1/Re2（非降档近似）')
    await ensureDoc(token, 'QI-W2B1-B11', 'SUP-009', 200, 'W2B1-B11')
    run('nocobase-h5-wms.mts', ['--inspect', 'QI-W2B1-B11', '--defects', '0,0,1', '--inspector', 'w2b1验收', '--aql', '2.5'], '已停检')

    run('nocobase-h5-wms.mts', ['--iqc-resume', 'SUP-009'])
    supplier = await supplierOf(token, 'SUP-009')
    assert(String(supplier.iqc_level) === 'tightened', '--iqc-resume：suspended → tightened（恢复从加严开始，9.4）')
    // 非停检态 resume 负例（守门）
    run('nocobase-h5-wms.mts', ['--iqc-resume', 'SUP-008'], '仅 suspended')
  }

  // ── P5 · B8 零回归（checkbox 7 引擎侧：历史判定 single-shot 不动 + G/H/J 三档正常表在库）──
  {
    const expected = [
      ['QI-2026-0001', 'passed', 'G', 32, 2, 3],
      ['QI-2026-0002', 'passed', 'G', 32, 2, 3],
      ['QI-2026-0003', 'passed', 'G', 32, 2, 3],
      ['QI-2026-0004', 'failed', 'G', 32, 2, 3],
      ['QI-2026-0005', 'concession', 'G', 32, 2, 3],
      ['QI-2026-0006', 'failed', 'G', 32, 1, 2],
      ['QI-2026-0007', 'failed', 'G', 32, 1, 2],
    ] as const
    const history = await rowsOf(token, 'qm_inspections')
    for (const [code, result, letter, n, ac, re] of expected) {
      const row = history.find(item => String(item.code) === code)
      assert(row !== undefined && String(row.result) === result && String(row.aql_code) === letter && Number(row.aql_n) === n && Number(row.aql_ac) === ac && Number(row.aql_re) === re,
        `B8 零回归：${code} 保持 ${result}（${letter}/${String(n)}/Ac${String(ac)}/Re${String(re)}，重灌不回写历史缓存列）`)
    }
    const g25 = (await rowsOf(token, 'qm_aql_plans', 200)).find(row => String(row.lot_band) === '151-280' && String(row.aql) === '2.5' && String(row.rigor) === 'normal')
    assert(g25 !== undefined && Number(g25.n) === 32 && Number(g25.ac) === 2 && Number(g25.re) === 3, 'B8 零回归：151-280 × 2.5 × normal = G/32/Ac2/Re3 在库')
  }

  console.log('w2b1: done — 箭头五例/段外解锁/四负例/转移得分与放宽往返/加严累计停检与恢复/B8 零回归 全通')
  console.log('w2b1: 外部门禁另跑：b9-final-chain --stage s3/s6/s8 + w8 --demo-chain + setup verify + --assert-ledger')
}

await main()
