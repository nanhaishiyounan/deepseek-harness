/**
 * W4-B6 regression-interception drill: prove the w4 verify assertions fail
 * loud. Two sabotage rounds, each break → assert RED → idempotent heal →
 * assert GREEN:
 *   A) destroy one w4b1 FilterForm block (+ drop its grid filterManager
 *      connection, the symmetric rollback move, so the heal rebuild condition
 *      `!hasFilterForm && filter === null` holds) → w4-b1 assert must flag
 *      FilterForm 覆盖不足.
 *   B) flatten one two-column form back to single-column stacking (the exact
 *      pre-W4 defect shape) → w4-b2 assert must flag L1/L2 表单单列未清零.
 * Transcript lands in w4-b6-regression-drill.txt. Exits 1 unless every round
 * shows red-then-green.
 */
import { spawnSync } from 'node:child_process'
import { appendFileSync, writeFileSync } from 'node:fs'
import { call, dataOf, listFlowModels, signInWithRetry, type FlowModelRow } from '../../examples/kb-agent/scripts/nocobase-flow-page-lib.mts'

const OUT = new URL('./w4-b6-regression-drill.txt', import.meta.url).pathname
const log: string[] = []
const say = (line: string) => { log.push(line); console.log(line) }

const run = (label: string, args: string[]) => {
  const res = spawnSync(process.execPath, ['--import', 'tsx/esm', ...args], { encoding: 'utf8', timeout: 300_000 })
  const tail = (res.stdout ?? '').split('\n').filter(l => l.includes('assert:') || l.includes('FAILED') || l.includes('layout') || l.includes('filterForm')).slice(-4)
  say(`[${label}] exit=${res.status}`)
  for (const l of tail) say(`  | ${l}`)
  return res.status
}

writeFileSync(OUT, `W4-B6 回归拦截力演练 ${new Date().toISOString()}\n口径：人为破坏 → 断言变红 → 幂等 heal 恢复 → 断言回绿（fails-loud 证明）\n\n`)

const rounds = process.argv.includes('--round') ? [process.argv[process.argv.indexOf('--round') + 1]] : ['a', 'b']
const token = await signInWithRetry()
const models: FlowModelRow[] = await listFlowModels(token)

// ── Round A: destroy one w4b1 FilterForm block ──
if (rounds.includes('a')) {
  say('== 演练 A：删除一个 w4b1 FilterForm 块（B6 文档 §4 首选破坏点）==')
  // ensureFilterForm rides the server channel, so block uids are server-assigned
  // (no w4b1 prefix); any FilterForm block works — the heal rebuild condition
  // only checks grid-level existence.
  const ff = models.find(row => row.use === 'FilterFormBlockModel')
  if (ff === undefined) throw new Error('no FilterFormBlockModel found')
  const grid = models.find(row => row.uid === String(ff.parentId ?? ''))
  if (grid === undefined) throw new Error(`grid ${ff.parentId} not found`)
  // The connection's filterId is a server-assigned filter-instance id (not the
  // block uid — addBlock wires filterManager server-side), so the sabotage
  // drops the grid's whole filterManager array; the rebuild re-wires it.
  const staleManager = Array.isArray(grid.filterManager) ? (grid.filterManager as Array<Record<string, unknown>>) : []
  say(`破坏目标: filterForm=${ff.uid} grid=${grid.uid} 连接条目=${staleManager.length}`)
  await call(token, 'POST', `/api/flowModels:destroy?filterByTk=${encodeURIComponent(ff.uid)}`)
  if (staleManager.length > 0) {
    await dataOf(token, 'POST', '/api/flowModels:save', { uid: grid.uid, filterManager: [] })
  }
  say('破坏完成：节点已删 + filterManager 连接已清空')
  const red = run('A1 断言（期待红）', ['examples/kb-agent/scripts/w4-heal-b1.mts', '--assert'])
  say(`A1 判定: ${red !== 0 ? '红（断言拦截成功）✓' : '!! 未拦截 — FAIL'}`)
  if (red === 0) { appendFileSync(OUT, log.join('\n')); process.exit(1) }
  run('A2 恢复（幂等 heal）', ['examples/kb-agent/scripts/w4-heal-b1.mts', '--all'])
  const green = run('A3 断言（期待绿）', ['examples/kb-agent/scripts/w4-heal-b1.mts', '--assert'])
  say(`A3 判定: ${green === 0 ? '绿（恢复完成）✓' : '!! 恢复失败 — FAIL'}`)
  if (green !== 0) { appendFileSync(OUT, log.join('\n')); process.exit(1) }
  say('')
}

// ── Round B: flatten one two-column form back to single-column stacking ──
if (rounds.includes('b')) {
  say('== 演练 B：一个两栏表单改回单列堆砌（before 缺陷形态复刻）==')
  const fresh = await listFlowModels(token)
  const twoCol = fresh.find(row => {
    if (row.use !== 'FormGridModel') return false
    const rows = row.props?.layout?.rows
    if (!Array.isArray(rows) || rows.length === 0) return false
    return rows.some((r: { sizes?: unknown[] }) => Array.isArray(r?.sizes) && r.sizes.length >= 2)
  })
  if (twoCol === undefined) throw new Error('no two-column FormGridModel found')
  const layout = twoCol.props.layout as { rows: Array<{ sizes: number[], cells: Array<{ items: string[] }> }> }
  const before = JSON.parse(JSON.stringify(layout))
  const flattened = layout.rows.flatMap(row => row.cells.map(cell => ({ sizes: [24], cells: [cell] })))
  say(`破坏目标: grid=${twoCol.uid} 两栏行数=${layout.rows.length} → 单列行数=${flattened.length}`)
  await dataOf(token, 'POST', '/api/flowModels:save', {
    uid: twoCol.uid,
    props: { ...JSON.parse(JSON.stringify(twoCol.props ?? {})), layout: { ...layout, rows: flattened } },
  })
  say('破坏完成：layout 已改回单列堆砌')
  const red = run('B1 断言（期待红）', ['examples/kb-agent/scripts/w4-heal-b2.mts', '--assert'])
  say(`B1 判定: ${red !== 0 ? '红（断言拦截成功）✓' : '!! 未拦截 — FAIL'}`)
  if (red === 0) { appendFileSync(OUT, log.join('\n')); process.exit(1) }
  run('B2 恢复（幂等 heal）', ['examples/kb-agent/scripts/w4-heal-b2.mts', '--all'])
  const green = run('B3 断言（期待绿）', ['examples/kb-agent/scripts/w4-heal-b2.mts', '--assert'])
  say(`B3 判定: ${green === 0 ? '绿（恢复完成）✓' : '!! 恢复失败 — FAIL'}`)
  if (green !== 0) { appendFileSync(OUT, log.join('\n')); process.exit(1) }
  // structural sanity: the flattened grid must be two-column again
  const after = await listFlowModels(token)
  const healed = after.find(row => row.uid === twoCol.uid)
  const healedRows = healed?.props?.layout?.rows as Array<{ sizes: number[] }> | undefined
  const isTwoColAgain = Array.isArray(healedRows) && healedRows.some(r => Array.isArray(r?.sizes) && r.sizes.length >= 2)
  say(`B4 结构复核: grid 两栏恢复=${isTwoColAgain ? '是 ✓' : '否 — FAIL'}（破坏前 rows=${JSON.stringify(before.rows.map(r => r.sizes))}）`)
  if (!isTwoColAgain) { appendFileSync(OUT, log.join('\n')); process.exit(1) }
}

say('')
say('结论：两轮演练 均 红→恢复→绿 —— verify 断言族 fails-loud 证明成立')
appendFileSync(OUT, `${log.join('\n')}\n`)
