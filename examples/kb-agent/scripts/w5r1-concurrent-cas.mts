/**
 * W5-R1: the same-instant concurrent-CAS evidence run against the live
 * approval-engine serve. Two POST /flow-graph requests race on one
 * base_version (Promise.all, both fired before either response arrives);
 * the hard assertions are:
 *   1. exactly one 200 and one 409 (a serial 409 replay does NOT count —
 *      R0 failed verification because only the serial form was tested);
 *   2. the stored graph is the winner's content (unique timestamped title
 *      markers decide it) and graph_version advanced by exactly one;
 *   3. the config_note audit trail gained exactly one line (the loser's
 *      conditional UPDATE matched zero rows, so no half-write of graph or
 *      note can survive).
 *
 * Usage (repo root, serve already running):
 *   node --import tsx examples/kb-agent/scripts/w5r1-concurrent-cas.mts \
 *     [--base http://127.0.0.1:13110] [--doc-type <wfl_flow_configs.doc_type>]
 *
 * Reads NocoBase directly (NOCOBASE_BASE_URL/ROOT_EMAIL/ROOT_PASSWORD) for
 * the audit-line diff; the serve itself needs no token in the lenient demo
 *档 (W3_TERMINAL_TOKEN unset). Repeatable: every run re-reads base_version
 * and stamps unique title markers, so it can run back-to-back.
 */

import { dataOf, signInWithRetry } from './nocobase-flow-page-lib.mts'

interface GraphDocShape {
  version: number
  nodes: Array<{ id: string; type: string; position: { x: number; y: number }; data: Record<string, unknown> }>
  edges: Array<{ id: string; source: string; target: string }>
}

const args = process.argv.slice(2)
const flag = (name: string): string | undefined => {
  const index = args.indexOf(name)
  return index >= 0 ? args[index + 1] : undefined
}
const base = (flag('--base') ?? process.env['W5_SERVE_BASE'] ?? 'http://127.0.0.1:13110').replace(/\/$/u, '')

/** One POST /flow-graph attempt returning status + decoded body. */
async function postGraph(docType: string, graph: GraphDocShape, baseVersion: number): Promise<{ status: number; body: Record<string, any> }> {
  const response = await fetch(`${base}/flow-graph`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ doc_type: docType, graph, base_version: baseVersion }),
  })
  return { status: response.status, body: await response.json().catch(() => ({})) as Record<string, any> }
}

async function main(): Promise<void> {
  // Liveness first — the run must fail loud against a dead serve, not as a
  // confusing fetch error mid-assertion.
  const health = await fetch(`${base}/healthz`)
  if (!health.ok) throw new Error(`serve ${base} /healthz → HTTP ${String(health.status)}（先启动 --serve）`)
  const metaResponse = await fetch(`${base}/designer/meta`)
  const metaPayload = await metaResponse.json() as { meta?: { docTypes?: Array<{ doc_type: string }> } }
  const docType = flag('--doc-type') ?? metaPayload.meta?.docTypes?.[0]?.doc_type
  if (docType === undefined) throw new Error('wfl_flow_configs 无行可测（先 --seed-flow）')

  const before = await (await fetch(`${base}/flow-graph?doc_type=${encodeURIComponent(docType)}`)).json() as { graph: GraphDocShape | null; graph_version: number }
  const baseVersion = Number(before.graph_version ?? 0)
  const token = await signInWithRetry()
  const rowBefore = (await dataOf(token, 'GET', `/api/wfl_flow_configs:list?pageSize=10&filter=${encodeURIComponent(JSON.stringify({ doc_type: { $eq: docType } }))}`)) as Array<Record<string, any>>
  const noteLinesBefore = String(rowBefore?.[0]?.config_note ?? '').split('\n').filter(line => line !== '').length

  // Two distinct graphs off the same base: the marker titles decide the
  // stored-content assertion (fresh timestamp every run keeps it repeatable).
  const stamp = Date.now().toString(36)
  const clone = (marker: string): GraphDocShape => {
    const graph: GraphDocShape = before.graph === null
      ? {
          version: 1,
          nodes: [
            { id: `n_w5r1_${stamp}_start`, type: 'start', position: { x: 40, y: 120 }, data: { title: marker } },
            { id: `n_w5r1_${stamp}_end`, type: 'end', position: { x: 440, y: 120 }, data: { title: '结束' } },
          ],
          edges: [],
        }
      : structuredClone(before.graph)
    graph.nodes[0].data['title'] = marker
    return graph
  }
  const markerA = `W5R1并发A-${stamp}`
  const markerB = `W5R1并发B-${stamp}`
  const graphA = clone(markerA)
  const graphB = clone(markerB)

  // The same-instant pair: both requests are dispatched before either
  // response is awaited (Promise.all), so a check-then-act implementation
  // would let both pass with 200 and lose one side's write.
  const [resultA, resultB] = await Promise.all([postGraph(docType, graphA, baseVersion), postGraph(docType, graphB, baseVersion)])

  const after = await (await fetch(`${base}/flow-graph?doc_type=${encodeURIComponent(docType)}`)).json() as { graph: GraphDocShape | null; graph_version: number }
  const rowAfter = (await dataOf(token, 'GET', `/api/wfl_flow_configs:list?pageSize=10&filter=${encodeURIComponent(JSON.stringify({ doc_type: { $eq: docType } }))}`)) as Array<Record<string, any>>
  const noteLinesAfter = String(rowAfter?.[0]?.config_note ?? '').split('\n').filter(line => line !== '').length
  const storedTitles = (after.graph?.nodes ?? []).map(node => String(node.data['title'] ?? ''))

  const statuses = [resultA.status, resultB.status].sort((a, b) => a - b)
  const failures: string[] = []
  if (statuses[0] !== 200 || statuses[1] !== 409) failures.push(`响应码非一胜一败：A=${String(resultA.status)} B=${String(resultB.status)}`)
  const winner = resultA.status === 200 ? resultA : resultB
  const loser = resultA.status === 200 ? resultB : resultA
  const winnerMarker = resultA.status === 200 ? markerA : markerB
  if (Number(after.graph_version) !== baseVersion + 1) failures.push(`graph_version 终值 ${String(after.graph_version)} ≠ base+1 ${String(baseVersion + 1)}`)
  if (!storedTitles.includes(winnerMarker)) failures.push(`DB 终值缺胜者标记 ${winnerMarker}（titles=${JSON.stringify(storedTitles)}）`)
  if (storedTitles.includes(resultA.status === 200 ? markerB : markerA)) failures.push('DB 终值混入败者标记（CAS 未原子）')
  if (noteLinesAfter - noteLinesBefore !== 1) failures.push(`审计行差 ${String(noteLinesAfter - noteLinesBefore)} ≠ 1（败者的连带写入或胜者审计丢失）`)

  console.log(JSON.stringify({
    serve: base,
    doc_type: docType,
    base_version: baseVersion,
    concurrent: { A: { status: resultA.status, marker: markerA }, B: { status: resultB.status, marker: markerB } },
    winner: { status: winner.status, graph_version: winner.body?.graph_version, error: winner.body?.error },
    loser: { status: loser.status, error: loser.body?.error },
    db_final: { graph_version: after.graph_version, first_title: storedTitles[0] ?? null, titles: storedTitles },
    audit_note_lines: { before: noteLinesBefore, after: noteLinesAfter, diff: noteLinesAfter - noteLinesBefore },
    verdict: failures.length === 0 ? 'PASS — 同刻并发恰好一胜一败，DB 终值为胜者内容，审计行恰 +1' : `FAIL — ${failures.join('；')}`,
  }, null, 2))
  if (failures.length > 0) process.exitCode = 1
}

await main()
