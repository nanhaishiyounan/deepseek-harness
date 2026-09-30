/**
 * W6 stat-card density heal: the ~90 W4B3 stat cards render on the chart
 * renderer's fixed 400px canvas (ECharts.tsx `height: fillHeight ? '100%' :
 * 400` — no heightMode was set), so every card is ~420px tall with ~70% empty
 * space and the page table starts below the fold. This script pins each card
 * to `decoratorProps: { heightMode: 'specifyValue', height: 112 }` (the
 * BlockItemCard useBlockHeight channel; the chart then fills that box) and
 * rewrites the embedded raw visual's text layout for the compact canvas
 * (title 13→12 @ top 8, number 34→24 @ top 26, footnote 11→10 @ bottom 4).
 *
 * Only ChartBlockModel rows carrying the W4B3_MARKER in their raw option are
 * touched — dashboard charts and other blocks keep their sizing. Idempotent:
 * a card already at height 112 with the compact raw is skipped. `--rollback`
 * restores the exact before rows from the run snapshot.
 *
 * Usage:
 *   node --import tsx/esm examples/kb-agent/scripts/w6-statcard-density.mts --dry-run
 *   node --import tsx/esm examples/kb-agent/scripts/w6-statcard-density.mts --run
 *   node --import tsx/esm examples/kb-agent/scripts/w6-statcard-density.mts --assert
 *   node --import tsx/esm examples/kb-agent/scripts/w6-statcard-density.mts --rollback
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dataOf, listFlowModels, signInWithRetry, STATCARD_CHART_HEIGHT, W4B3_MARKER, type FlowModelRow } from './nocobase-flow-page-lib.mts'

const RESEARCH_DIR = new URL('../../../research/2026-09-29-w5-rework/', import.meta.url).pathname
const OUT_PATH = `${RESEARCH_DIR}w6-statcard-density.txt`
const SNAPSHOT_PATH = `${RESEARCH_DIR}w6-statcard-density-rollback.json`

/** The raw-visual text replacements old (400px layout) → compact (112px layout). */
const RAW_PATCHES: ReadonlyArray<readonly [string, string]> = [
  ["return {\n  graphic: { elements: [", "return {\n  containerStyle: { height: 112 },\n  graphic: { elements: ["],
  ["{ type: 'text', left: 16, top: 12, style:", "{ type: 'text', left: 12, top: 8, style:"],
  ["{ type: 'text', left: 16, top: 36, style:", "{ type: 'text', left: 12, top: 26, style:"],
  ["{ type: 'text', left: 16, bottom: 8, style:", "{ type: 'text', left: 12, bottom: 4, style:"],
  [', fontSize: 13, fontWeight: 500', ', fontSize: 12, fontWeight: 500'],
  [', fontSize: 34, fontWeight: 700', ', fontSize: 24, fontWeight: 700'],
  [", fontSize: 11, fill: '#9ca3af'", ", fontSize: 10, fill: '#9ca3af'"],
]

const chartConfigure = (row: FlowModelRow): any => (row.stepParams as any)?.chartSettings?.configure
const chartVisualRaw = (row: FlowModelRow): string => String(chartConfigure(row)?.chart?.option?.raw ?? '')

const isMarkerChart = (row: FlowModelRow): boolean =>
  row?.use === 'ChartBlockModel' && chartVisualRaw(row).includes(W4B3_MARKER)

const rawIsCompact = (raw: string): boolean =>
  raw.includes(', fontSize: 24, fontWeight: 700') && raw.includes('containerStyle: { height: 112 }')
const decoratorIsPinned = (row: FlowModelRow): boolean =>
  (row.decoratorProps as any)?.heightMode === 'specifyValue' && (row.decoratorProps as any)?.height === STATCARD_CHART_HEIGHT

type Before = { uid: string, name?: unknown, parentId?: unknown, subKey?: unknown, sortIndex?: unknown, props?: unknown, decoratorProps?: unknown, stepParams?: unknown, popup?: unknown }

async function main(): Promise<void> {
  const mode = process.argv[2] ?? ''
  if (!['--dry-run', '--run', '--assert', '--rollback'].includes(mode)) {
    console.error('usage: w6-statcard-density.mts --dry-run|--run|--assert|--rollback')
    process.exit(2)
  }
  mkdirSync(RESEARCH_DIR, { recursive: true })
  const lines: string[] = [`w6 stat-card density ${mode} @ ${new Date().toISOString()}`]

  if (mode === '--rollback') {
    const snapshot = JSON.parse(readFileSync(SNAPSHOT_PATH, 'utf8')) as Before[]
    const token = await signInWithRetry()
    for (const before of snapshot) {
      await dataOf(token, 'POST', '/api/flowModels:save', {
        uid: before.uid,
        ...(before.parentId === undefined ? {} : { parentId: before.parentId }),
        ...(before.subKey === undefined ? {} : { subKey: before.subKey }),
        ...(before.sortIndex === undefined ? {} : { sortIndex: before.sortIndex }),
        ...(before.name === undefined ? {} : { name: before.name }),
        use: 'ChartBlockModel',
        ...(before.decoratorProps === undefined ? {} : { decoratorProps: before.decoratorProps }),
        ...(before.props === undefined ? {} : { props: before.props }),
        ...(before.stepParams === undefined ? {} : { stepParams: before.stepParams }),
        ...(before.popup === undefined ? {} : { popup: before.popup }),
      })
      lines.push(`restored ${before.uid}`)
    }
    lines.push(`rollback done — ${snapshot.length} cards restored`)
    writeFileSync(OUT_PATH, `${lines.join('\n')}\n`)
    console.log(lines.join('\n'))
    return
  }

  const token = await signInWithRetry()
  const models = await listFlowModels(token, 'w6-statcard-density')
  const cards = models.filter(isMarkerChart)
  lines.push(`marker stat cards: ${cards.length}`)

  const pending = cards.filter(row => !(rawIsCompact(chartVisualRaw(row)) && decoratorIsPinned(row)))
  lines.push(`already compact: ${cards.length - pending.length}, pending: ${pending.length}`)

  if (mode === '--assert') {
    const failures: string[] = []
    if (pending.length > 0) failures.push(`cards not compact yet: ${pending.map(row => String(row.uid)).join(', ')}`)
    if (cards.length === 0) failures.push('no marker stat cards found')
    if (failures.length > 0) {
      lines.push(...failures.map(failure => `FAIL ${failure}`))
      writeFileSync(OUT_PATH, `${lines.join('\n')}\n`)
      console.error(lines.join('\n'))
      process.exit(1)
    }
    lines.push(`assert: OK — ${cards.length} cards pinned at height ${STATCARD_CHART_HEIGHT} with compact raw`)
    writeFileSync(OUT_PATH, `${lines.join('\n')}\n`)
    console.log(lines.join('\n'))
    return
  }

  const snapshot: Before[] = []
  for (const row of pending) {
    const uid = String(row.uid)
    if (mode === '--dry-run') {
      lines.push(`would compact ${uid}`)
      continue
    }
    const current = await dataOf(token, 'GET', `/api/flowSurfaces:get?uid=${encodeURIComponent(uid)}`)
    const tree = current?.tree ?? {}
    snapshot.push({
      uid,
      name: tree.name, parentId: tree.parentId, subKey: tree.subKey, sortIndex: tree.sortIndex,
      props: tree.props, decoratorProps: tree.decoratorProps, stepParams: tree.stepParams, popup: tree.popup,
    })
    const beforeDecorators = (tree.decoratorProps ?? {}) as Record<string, unknown>
    const beforeStepParams = structuredClone(tree.stepParams)
    let raw = String((beforeStepParams as any)?.chartSettings?.configure?.chart?.option?.raw ?? '')
    for (const [from, to] of RAW_PATCHES) raw = raw.split(from).join(to)
    ;(beforeStepParams as any).chartSettings.configure.chart.option.raw = raw
    await dataOf(token, 'POST', '/api/flowModels:save', {
      uid,
      ...(tree.name === undefined ? {} : { name: tree.name }),
      ...(tree.parentId === undefined ? {} : { parentId: tree.parentId }),
      ...(tree.subKey === undefined ? {} : { subKey: tree.subKey }),
      ...(tree.sortIndex === undefined ? {} : { sortIndex: tree.sortIndex }),
      use: 'ChartBlockModel',
      decoratorProps: { ...beforeDecorators, heightMode: 'specifyValue', height: STATCARD_CHART_HEIGHT },
      props: tree.props ?? {},
      stepParams: beforeStepParams,
      ...(tree.popup === undefined ? { popup: { mode: 'local' } } : { popup: tree.popup }),
    })
    lines.push(`compacted ${uid}`)
  }

  if (mode === '--run') {
    writeFileSync(SNAPSHOT_PATH, `${JSON.stringify(snapshot, null, 2)}\n`)
    lines.push(`rollback snapshot: ${SNAPSHOT_PATH} (${snapshot.length} rows)`)
    // verify immediately: re-list and assert
    const after = (await listFlowModels(token, 'w6-statcard-density-verify')).filter(isMarkerChart)
    const stillPending = after.filter(row => !(rawIsCompact(chartVisualRaw(row)) && decoratorIsPinned(row)))
    lines.push(`post-run verify: ${after.length} marker cards, still pending ${stillPending.length}`)
    if (stillPending.length > 0) {
      lines.push(`FAIL ${stillPending.map(row => String(row.uid)).join(', ')}`)
      writeFileSync(OUT_PATH, `${lines.join('\n')}\n`)
      console.error(lines.join('\n'))
      process.exit(1)
    }
    lines.push('run: OK')
  }
  writeFileSync(OUT_PATH, `${lines.join('\n')}\n`)
  console.log(lines.join('\n'))
}

await main()
