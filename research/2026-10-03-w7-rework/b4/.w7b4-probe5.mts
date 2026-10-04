/**
 * W7-B4 探针 5：kpi_snapshots 指标清单（board → kpi_code/metric_name/unit），
 * 供经营五看板统计卡行选卡。只读。
 */
import { dataOf, signInWithRetry } from '../../../examples/kb-agent/scripts/nocobase-flow-page-lib.mts'

const token = await signInWithRetry()
const rows = await dataOf(token, 'GET', '/api/kpi_snapshots:list?pageSize=500&sort=-calc_date&page=1') as { data?: Array<Record<string, any>> } | Array<Record<string, any>>
const list = Array.isArray(rows) ? rows : (rows?.data ?? [])
console.log(`kpi_snapshots rows=${list.length}`)
const byBoard = new Map<string, Map<string, { code: string, name: string, unit: string, latest: string, value: unknown }>>()
for (const r of list) {
  const board = String(r.board ?? '')
  const code = String(r.kpi_code ?? '')
  if (board === '' || code === '') continue
  if (!byBoard.has(board)) byBoard.set(board, new Map())
  const m = byBoard.get(board)!
  if (!m.has(code)) m.set(code, { code, name: String(r.metric_name ?? code), unit: String(r.unit ?? ''), latest: String(r.calc_date ?? ''), value: r.value })
}
for (const [board, metrics] of byBoard) {
  console.log(`── board=${board}`)
  for (const m of metrics.values()) console.log(`  ${m.code} | ${m.name} | unit=${m.unit} | latest=${m.latest} value=${String(m.value)}`)
}
