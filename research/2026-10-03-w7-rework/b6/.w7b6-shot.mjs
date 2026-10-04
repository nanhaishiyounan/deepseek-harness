// W7-B6 page screenshots over the live NocoBase console (:13000). Page
// universe = the census rebuilt live from desktopRoutes:list each run
// (.w7b6-census.mjs — 111 flowPage titles in canonical order + 3 v1 pages;
// uids always current, snapshot never read). Same rig as the audit .pc-shot:
// form sign-in, 1440x900, per-page domcontentloaded + settle wait.
// R1 liveness gate: every shot is preceded by the dead-route check (no
// 「404 … Back Home」stub, main content mounted) — a FAIL skips writing the
// png (a dead frame is not evidence) and fails the run.
// Usage (repo root):
//   node research/2026-10-03-w7-rework/b6/.w7b6-shot.mjs before          # all 114 pages -> before/
//   node research/2026-10-03-w7-rework/b6/.w7b6-shot.mjs after rep      # representative set -> after/
//   node research/2026-10-03-w7-rework/b6/.w7b6-shot.mjs after 12,34    # explicit indexes -> after/
//   node research/2026-10-03-w7-rework/b6/.w7b6-shot.mjs after titles=效期看板,批次追溯
import { chromium } from '../../../apps/web/node_modules/playwright/index.mjs'
import { mkdirSync, statSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { buildCensusFromRoutes, LIVENESS_PROBE } from './.w7b6-census.mjs'

const BASE = 'http://127.0.0.1:13000'
const DIR = fileURLToPath(new URL('./', import.meta.url))

/** Representative census schemaUids spanning every domain and every form
 * (v2 table / kanban / calendar / JSBlock / W6 workbenches). */
const REP_UIDS = [
  'n17sys042q2lz', 'n17lhe5qyxu1g', 'h4srm2u9xiqx09jb', 'h5wms9v2hly0cg6j',
  'w3puryzkva06iuhh', 'w7mrp4w590rm0ws8', 'w5mfgntyu7wy20a', 'w8qmjvyv8p5j7j',
  'w7mrpyru4s708nwn', 'w9kpiatwzi4gjbff',
  'w6b9cdzrc2lst1dm', 'w6b9fgcovvinqe85', 'w3purb7o0r3yqi45', 'w6b5icrrgz5z9gu',
  'w6b3tctwuy6wn0d', 'w6b8eci1cpbqsgtj', 'w6b8a3fg2qshtalw', 'w6b6c6iqjj61zo9',
]

const [phase = 'before', selection = 'all'] = process.argv.slice(2)
if (phase !== 'before' && phase !== 'after') {
  console.error('usage: .w7b6-shot.mjs <before|after> [all|rep|v1|<comma indexes>|titles=<comma titles>]')
  process.exit(2)
}

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })

await page.goto(`${BASE}/signin`)
await page.locator('input[type=text]').first().fill('admin@nocobase.com')
await page.locator('input[type=password]').first().fill('admin123')
await page.locator('button', { hasText: '登录' }).first().click()
await page.waitForTimeout(5000)
const auth = await page.evaluate(async () => {
  const token = (localStorage.getItem('NOCOBASE_TOKEN') ?? '').replace(/^"|"$/g, '')
  const res = await fetch('/api/auth:check', { method: 'POST', headers: token ? { Authorization: `Bearer ${token}` } : {} })
  return { status: res.status }
})
console.log(`auth:check -> HTTP ${auth.status}`)

// Live census rebuild: desktopRoutes:list through the signed-in session.
const routes = await page.evaluate(async () => {
  const token = (localStorage.getItem('NOCOBASE_TOKEN') ?? '').replace(/^"|"$/g, '')
  const res = await fetch('/api/desktopRoutes:list?pageSize=400', { headers: { Authorization: `Bearer ${token}` } })
  if (!res.ok) throw new Error(`desktopRoutes:list HTTP ${String(res.status)}`)
  return (await res.json())?.data ?? []
})
const pages = buildCensusFromRoutes(routes).pages

let chosen
if (selection === 'all') {
  chosen = pages
} else if (selection === 'rep') {
  chosen = pages.filter((entry) => REP_UIDS.includes(entry.schemaUid))
  chosen.push(...pages.filter((entry) => entry.v1 && entry.title === '排产甘特'))
} else if (selection === 'v1') {
  chosen = pages.filter((entry) => entry.v1)
} else if (selection.startsWith('titles=')) {
  const titles = selection.slice('titles='.length).split(',').map((t) => t.trim()).filter((t) => t !== '')
  chosen = pages.filter((entry) => titles.includes(entry.title))
  const found = new Set(chosen.map((entry) => entry.title))
  const absent = titles.filter((t) => !found.has(t))
  if (absent.length > 0) {
    console.error(`titles not in the live census: ${absent.join(', ')}`)
    process.exit(2)
  }
} else {
  const indexes = selection.split(',').map((value) => Number.parseInt(value, 10)).filter(Number.isInteger)
  chosen = pages.filter((entry) => indexes.includes(entry.index))
}
if (chosen.length === 0) {
  console.error('no pages matched the selection')
  process.exit(2)
}

const OUT = `${DIR}${phase}/`
mkdirSync(OUT, { recursive: true })

const slug = (entry) => {
  const name = String(entry.title ?? 'page').replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '').slice(0, 24)
  return `${String(entry.index).padStart(3, '0')}-${name}`
}

const report = { phase, requested: chosen.length, ok: 0, livenessFails: [], failed: [], shots: [] }
for (const entry of chosen) {
  const name = `${slug(entry)}.png`
  try {
    await page.goto(`${BASE}/admin/${entry.schemaUid}`)
    await page.waitForLoadState('networkidle', { timeout: 6000 }).catch(() => {})
    await page.waitForTimeout(2600)
    const liveness = await page.evaluate(LIVENESS_PROBE)
    if (!liveness.live) {
      report.livenessFails.push({ name, uid: entry.schemaUid, is404Stub: liveness.is404Stub, hasMain: liveness.hasMain })
      console.log(`LIVENESS-FAIL ${name}: 404stub=${String(liveness.is404Stub)} main=${String(liveness.hasMain)} — shot skipped (uid ${entry.schemaUid})`)
      continue
    }
    await page.screenshot({ path: `${OUT}${name}` })
    report.ok += 1
    report.shots.push({ name, uid: entry.schemaUid, title: entry.title, liveness: 'PASS', bytes: statSync(`${OUT}${name}`).size })
    console.log(`shot ${name} liveness=PASS`)
  } catch (err) {
    report.failed.push({ name, uid: entry.schemaUid, error: String(err.message).split('\n')[0] })
    console.log(`FAIL ${name}: ${String(err.message).split('\n')[0]}`)
  }
}

writeFileSync(`${DIR}.w7b6-shot-${phase}-report.json`, `${JSON.stringify(report, null, 2)}\n`)
console.log(`\n== ${phase}: 成功 ${report.ok}/${report.requested}, liveness失败 ${report.livenessFails.length}, 其他失败 ${report.failed.length} ==`)
for (const fail of report.livenessFails) console.log(`  - LIVENESS ${fail.name}: 404stub=${String(fail.is404Stub)}`)
for (const failure of report.failed) console.log(`  - ${failure.name}: ${failure.error}`)

await browser.close()
process.exit(report.livenessFails.length === 0 && report.failed.length === 0 && report.ok === report.requested ? 0 : 1)
