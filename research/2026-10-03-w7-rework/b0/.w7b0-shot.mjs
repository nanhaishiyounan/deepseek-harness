// W7-B0 before/after page screenshots over the live NocoBase console (:13000).
// Page universe = the W7 audit census (research/2026-10-03-w7-audit/audit-pages-w7.json,
// 114 page units). Same rig as the audit .pc-shot.mjs: form sign-in, 1440x900,
// per-page domcontentloaded + settle wait; failures collected, exit always 0.
// Usage (repo root):
//   node research/2026-10-03-w7-rework/b0/.w7b0-shot.mjs before          # all 114 pages -> before/
//   node research/2026-10-03-w7-rework/b0/.w7b0-shot.mjs after rep      # representative set -> after/
//   node research/2026-10-03-w7-rework/b0/.w7b0-shot.mjs after 12,34    # explicit indexes -> after/
import { chromium } from '../../../apps/web/node_modules/playwright/index.mjs'
import { mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const BASE = 'http://127.0.0.1:13000'
const DIR = fileURLToPath(new URL('./', import.meta.url))
const CENSUS = fileURLToPath(new URL('../../2026-10-03-w7-audit/audit-pages-w7.json', import.meta.url))

/** The three v1 legacy pages (routes of type `page`) — outside the flowModels
 * census, so they ride their own constants (uid verified against the
 * desktopRoutes API dump). Indexes continue the census sequence. */
const V1_PAGES = [
  { index: 112, schemaUid: 'c9c6wzppejk', title: '应用中心' },
  { index: 113, schemaUid: '96yet9a0x45', title: '排产甘特' },
  { index: 114, schemaUid: 'zs3oqvlgqq0', title: '任务甘特' },
]

/** Representative census schemaUids spanning every domain and every form
 * (v2 table / kanban / calendar / JSBlock / W6 workbenches). */
const REP_UIDS = [
  'n17sys042q2lz', 'n17lhe5qyxu1g', 'h4srm2u9xiqx09jb', 'h5wms9v2hly0cg6j',
  'w3puryzkva06iuhh', 'w7mrp4w590rm0ws8', 'w5mfgntyu7wy20a', 'w8qmjvyv8p5j7j',
  'w7mrpyru4s708nwn', 'w9kpiatwzi4gjbff',
  'w6b9cdzrc2lst1dm', 'w6b9fgcovvinqe85', 'w3purb7o0r3yqi45', 'w6b5icrrgz5z9gu',
  'w6b3by6ukynxfou', 'w6b8eci1cpbqsgtj', 'w6b8a3fg2qshtalw', 'w6b6c6iqjj61zo9',
]

const [phase = 'before', selection = 'all'] = process.argv.slice(2)
if (phase !== 'before' && phase !== 'after') {
  console.error('usage: .w7b0-shot.mjs <before|after> [all|rep|v1|<comma indexes>]')
  process.exit(2)
}

const census = JSON.parse(readFileSync(CENSUS, 'utf8'))
const pages = census.pages.map((page, index) => ({ index: index + 1, ...page }))

let chosen
if (selection === 'all') {
  chosen = [...pages, ...V1_PAGES]
} else if (selection === 'rep') {
  chosen = pages.filter((page) => REP_UIDS.includes(page.schemaUid))
  chosen.push(V1_PAGES.find((page) => page.schemaUid === '96yet9a0x45'))
} else if (selection === 'v1') {
  chosen = V1_PAGES
} else {
  const indexes = selection.split(',').map((value) => Number.parseInt(value, 10)).filter(Number.isInteger)
  chosen = [...pages, ...V1_PAGES].filter((page) => indexes.includes(page.index))
}
if (chosen.length === 0) {
  console.error('no pages matched the selection')
  process.exit(2)
}

const OUT = `${DIR}${phase}/`
mkdirSync(OUT, { recursive: true })

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

const slug = (entry) => {
  const name = String(entry.title ?? 'page').replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '').slice(0, 24)
  return `${String(entry.index).padStart(3, '0')}-${name}`
}

const report = { phase, requested: chosen.length, ok: 0, failed: [], shots: [] }
for (const entry of chosen) {
  const name = `${slug(entry)}.png`
  try {
    await page.goto(`${BASE}/admin/${entry.schemaUid}`)
    await page.waitForLoadState('networkidle', { timeout: 6000 }).catch(() => {})
    await page.waitForTimeout(2600)
    await page.screenshot({ path: `${OUT}${name}` })
    report.ok += 1
    report.shots.push({ name, uid: entry.schemaUid, title: entry.title, bytes: statSync(`${OUT}${name}`).size })
    console.log(`shot ${name}`)
  } catch (err) {
    report.failed.push({ name, uid: entry.schemaUid, error: String(err.message).split('\n')[0] })
    console.log(`FAIL ${name}: ${String(err.message).split('\n')[0]}`)
  }
}

writeFileSync(`${DIR}.w7b0-shot-${phase}-report.json`, `${JSON.stringify(report, null, 2)}\n`)
console.log(`\n== ${phase}: 成功 ${report.ok}/${report.requested}, 失败 ${report.failed.length} ==`)
for (const failure of report.failed) console.log(`  - ${failure.name}: ${failure.error}`)

await browser.close()
process.exit(0)
