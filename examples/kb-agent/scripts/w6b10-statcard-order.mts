/**
 * W6-B10 closure: seat the 预警列表 stat cards above the alerts table.
 *
 * The B2 verification debt: the rule-type stat cards render BELOW the table
 * on 预警列表 — three sortIndex shapes were tried at B2 with no effect (the
 * v2 grid renders by row membership + rowOrder, not block sortIndex; the
 * cards were saved with a parentId but no owning row, so the renderer
 * append-mounts them after the laid-out rows). The B7 bid matrix proved the
 * working lever: rewriting the grid's rows/sizes/rowOrder through
 * flowModels:save. This retry first looks for card rows to hoist; finding
 * none (the B2 shape), it synthesizes two 4-wide card rows at the rowOrder
 * head — the same seat-first shape seatBlockRowTop lands on 比价表.
 *
 * Usage: node --import tsx/esm examples/kb-agent/scripts/w6b10-statcard-order.mts
 * Exit 0 when the persisted rowOrder seats the cards first (or already did);
 * exit 1 when the rewrite is refused or unverifiable — the caller then
 * records the platform-limit verdict honestly.
 */
import { spawnSync } from 'node:child_process'
import { dataOf, listRoutes, signInWithRetry } from './nocobase-flow-page-lib.mts'

const log = (line: string): void => { console.log(`w6b10-statcard: ${line}`) }
const psql = (sql: string): string => spawnSync(
  'psql',
  ['-h', '127.0.0.1', '-U', 'nocobase', '-d', 'nocobase', '-qAt', '-c', sql],
  { encoding: 'utf8', env: { ...process.env, PGPASSWORD: process.env['DB_PASSWORD'] ?? 'dsh_nocobase' }, timeout: 20_000 },
).stdout.trim()

const PAGE_TITLE = '预警列表'

const gridUidOf = async (token: string): Promise<string | null> => {
  const routes = await listRoutes(token, 'W6B10-statcard')
  const page = routes.find(row => row.title === PAGE_TITLE && row.type === 'flowPage')
  if (page === undefined) return null
  const tab = routes.find(row => String(row.parentId ?? '') === String(page.id) && row.type === 'tabs')
  if (tab?.schemaUid == null) return null
  const grid = await dataOf(token, 'GET', `/api/flowModels:findOne?parentId=${String(tab.schemaUid)}&subKey=grid`) as { uid?: string } | null
  return grid?.uid ?? null
}

const main = async (): Promise<void> => {
  const token = await signInWithRetry()
  const gridUid = await gridUidOf(token)
  if (gridUid === null) { log(`page ${PAGE_TITLE} grid not found`); process.exitCode = 1; return }
  // the stat-card blocks: metric charts whose title marks the rule counters
  const cardUids = psql(`SELECT uid FROM "flowModels" WHERE "options"->>'parentId' = '${gridUid}' AND "options"->'props'->>'title' LIKE '%待处理%' ORDER BY uid`).split('\n').filter(uid => uid !== '')
  log(`grid ${gridUid} — ${String(cardUids.length)} stat cards (${cardUids.join(',')})`)
  if (cardUids.length === 0) { log('no stat-card blocks parented to the grid'); process.exitCode = 1; return }
  const current = await dataOf(token, 'GET', `/api/flowSurfaces:get?uid=${encodeURIComponent(gridUid)}`)
  const tree = current?.tree ?? {}
  const grid = ((((tree.stepParams ?? {}) as Record<string, unknown>).gridSettings as Record<string, unknown> | undefined)?.grid) as {
    rows?: Record<string, unknown>, sizes?: Record<string, unknown>, rowOrder?: string[]
  } | undefined
  if (grid?.rows === undefined) { log('grid rows absent (layout mode differs) — platform limit candidate'); process.exitCode = 1; return }
  const rowOrder = Array.isArray(grid.rowOrder) ? grid.rowOrder.map(String) : Object.keys(grid.rows)
  const rows: Record<string, unknown> = { ...grid.rows }
  const sizes: Record<string, unknown> = { ...(grid.sizes ?? {}) }
  // drop any stale synthesized rows from an earlier attempt, then classify
  const existingCardRows = rowOrder.filter(key => {
    const cells = (Array.isArray(rows[key]) ? rows[key] : []) as unknown[][]
    return cells.some(cell => (Array.isArray(cell) ? cell : []).some(uid => cardUids.includes(String(uid))))
  })
  const head = existingCardRows.length > 0
    ? existingCardRows
    : // synthesize 4-per-row card rows (24-col grid: size 6 each)
      ['w6b10cards-a', 'w6b10cards-b'].slice(0, Math.ceil(cardUids.length / 4))
  if (existingCardRows.length === 0) {
    for (let index = 0; index < head.length; index++) {
      const chunk = cardUids.slice(index * 4, index * 4 + 4)
      // one cell per card — a cell holding several uids stacks them in one
      // column; separate cells give the 4-per-row stat-card strip
      rows[head[index]] = chunk.map(uid => [uid])
      sizes[head[index]] = chunk.map(() => 6)
    }
  }
  const nextOrder = [...head, ...rowOrder.filter(key => !head.includes(key))]
  const before = rowOrder.join(',')
  await dataOf(token, 'POST', '/api/flowModels:save', {
    uid: gridUid,
    ...(tree.parentId === undefined ? {} : { parentId: tree.parentId }),
    ...(tree.subKey === undefined ? {} : { subKey: tree.subKey }),
    props: { ...(tree.props ?? {}), rows, sizes, rowOrder: nextOrder },
    stepParams: { gridSettings: { grid: { rows, sizes, rowOrder: nextOrder } } },
  })
  // verify the persisted order actually seats the card rows first
  const reread = await dataOf(token, 'GET', `/api/flowSurfaces:get?uid=${encodeURIComponent(gridUid)}`)
  const rereadGrid = ((((reread?.tree?.stepParams ?? {}) as Record<string, unknown>).gridSettings as Record<string, unknown> | undefined)?.grid) as { rowOrder?: string[] } | undefined
  const persisted = Array.isArray(rereadGrid?.rowOrder) ? rereadGrid.rowOrder.map(String) : []
  const seated = persisted.length > 0 && head.every(key => persisted.indexOf(key) !== -1 && persisted.indexOf(key) < persisted.findIndex(entry => !head.includes(entry)))
  log(`rowOrder before=${before}`)
  log(`rowOrder after =${persisted.join(',')} (head ${head.join(',')})`)
  if (!seated) { log('rowOrder rewrite did not persist — platform limit candidate'); process.exitCode = 1; return }
  log(`seated ${String(cardUids.length)} stat cards in ${String(head.length)} row(s) above the table rows`)
}

await main()
