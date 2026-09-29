/**
 * W4-R1 browser evidence: re-verify the restored dataScope wires in the
 * real rendering path — the four KPI dashboards' table XHR must carry the
 * board filter (every returned row belongs to that board) and the 审批中心
 * todo table XHR must carry status=open. One viewport screenshot per page.
 *
 * Stands in for the chrome-devtools MCP browser when its connection drops
 * (same channel-switch launch as nocobase-page-probe.mts).
 *
 * Usage: node --import tsx/esm examples/kb-agent/scripts/w4-r1-browser-evidence.mts
 */
import { createRequire } from 'node:module'
import { mkdirSync } from 'node:fs'

const require = createRequire(new URL('../../../platform/nocobase/package.json', import.meta.url))
const { chromium } = require('playwright')

const OUT_DIR = 'examples/kb-agent/demos/w4-r1'
const BOARDS: ReadonlyArray<{ title: string, route: string, board: string, wait: string }> = [
  { title: '经营看板', route: 'w9kpi7zv98whvfpv', board: 'business', wait: '经营 KPI 快照' },
  { title: '供应链看板', route: 'w9kpijpea6p6exnm', board: 'supply', wait: '供应链 KPI 快照' },
  { title: '生产看板', route: 'w9kpirvxmfx12l2i', board: 'production', wait: '生产 KPI 快照' },
  { title: '库存看板', route: 'w9kpiatwzi4gjbff', board: 'inventory', wait: '库存 KPI 快照' },
]
const TODO = { title: '审批中心', route: 'w1w167h6joi0ck6', wait: '待办' }

type ListCapture = { filter: string | null, rows: Array<Record<string, unknown>>, status: number } | null

/** Watch collection list XHRs on the page; resolve the first whose response landed. */
function watchList(page: import('playwright').Page, collection: string): () => Promise<ListCapture> {
  let capture: ListCapture = null
  const listener = async (response: import('playwright').Response): Promise<void> => {
    const url = response.url()
    if (!url.includes(`/api/${collection}:list`)) return
    const filterParam = new URL(url).searchParams.get('filter')
    const rows = (await response.json().catch(() => null))?.data
    capture = { filter: filterParam, rows: Array.isArray(rows) ? rows : [], status: response.status() }
  }
  page.on('response', listener)
  return async () => {
    for (let i = 0; i < 60 && capture === null; i += 1) await page.waitForTimeout(500)
    return capture
  }
}

const failures: string[] = []
const browser = await chromium.launch({ channel: 'chrome' })
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } })
mkdirSync(OUT_DIR, { recursive: true })

await page.goto('http://127.0.0.1:13000/signin', { waitUntil: 'domcontentloaded' })
await page.getByPlaceholder(/email|账号|用户名/i).or(page.locator('input[name="email"], input#email, input[type="text"]').first()).first().fill('admin@nocobase.com')
await page.locator('input[type="password"]').first().fill('admin123')
await page.locator('button[type="submit"], button:has-text("Sign in"), button:has-text("登录")').first().click()
await page.waitForURL(url => !String(url).includes('signin'), { timeout: 30_000 })

for (const board of BOARDS) {
  const collect = watchList(page, 'kpi_snapshots')
  await page.goto(`http://127.0.0.1:13000/admin/${board.route}`, { waitUntil: 'domcontentloaded' })
  // Anchor text is best-effort: the authoritative signals are the list XHR
  // (filter + row membership) and the screenshot; block headings render
  // inside collapsible sections whose exact text varies by viewport.
  await page.getByText(board.wait).first().waitFor({ timeout: 45_000 }).catch(() => {})
  const capture = await collect()
  if (capture === null) {
    failures.push(`${board.title}: no kpi_snapshots:list XHR observed`)
  } else {
    const filter = capture.filter ?? ''
    if (!filter.includes('"board"') || !filter.includes(`"${board.board}"`)) {
      failures.push(`${board.title}: list filter missing board=${board.board} (got ${filter})`)
    }
    const foreign = capture.rows.filter(row => String(row.board ?? '') !== board.board)
    if (capture.rows.length === 0) failures.push(`${board.title}: list returned 0 rows`)
    if (foreign.length > 0) failures.push(`${board.title}: ${String(foreign.length)} rows from other boards leaked`)
    console.log(`${board.title}: rows=${String(capture.rows.length)} filter=${filter}`)
  }
  await page.waitForTimeout(1200)
  await page.screenshot({ path: `${OUT_DIR}/w4-r1-board-${board.board}.png` })
}

{
  const collect = watchList(page, 'wfl_approval_todos')
  await page.goto(`http://127.0.0.1:13000/admin/${TODO.route}`, { waitUntil: 'domcontentloaded' })
  await page.getByText(TODO.wait).first().waitFor({ timeout: 45_000 }).catch(() => {})
  const capture = await collect()
  if (capture === null) {
    failures.push(`${TODO.title}: no wfl_approval_todos:list XHR observed`)
  } else {
    const filter = capture.filter ?? ''
    if (!filter.includes('"status"') || !filter.includes('"open"')) {
      failures.push(`${TODO.title}: list filter missing status=open (got ${filter})`)
    }
    const closed = capture.rows.filter(row => String(row.status ?? '') !== 'open')
    if (closed.length > 0) failures.push(`${TODO.title}: ${String(closed.length)} non-open rows leaked`)
    console.log(`${TODO.title}: rows=${String(capture.rows.length)} filter=${filter}`)
  }
  await page.waitForTimeout(1200)
  await page.screenshot({ path: `${OUT_DIR}/w4-r1-todo-open-pin.png` })
}

await browser.close()
if (failures.length > 0) {
  console.error(`w4-r1-browser-evidence: FAILED\n  - ${failures.join('\n  - ')}`)
  process.exitCode = 1
} else {
  console.log(`w4-r1-browser-evidence: OK — 4 board filters + todo status=open replayed, screenshots in ${OUT_DIR}`)
}
