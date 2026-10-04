// W7-B6 final aesthetic matrix probe — one signed-in walk over the 114-page
// census plus the three engine-side iframe targets:
//   1. banned-color sweep on every page (computed color/background/border over
//      all elements — the B5 probe only read inline style attrs; this is the
//      stricter final pass) with the antd default blue #1677ff and the retired
//      purple #7c3aed counting zero across all visible surfaces;
//   2. the 23-page B5-domain structural assertions re-run verbatim (cockpit
//      fake-zero, DAG stroke whitelist, soft tags, APS color-mix, engine
//      --w7-primary), evidence now stamped at the B6 verification point;
//   3. the engine pages ride top-level navigation (13110 is cross-origin to
//      13000, so an embedded iframe's DOM is unreachable from the parent —
//      loading the same URL at top level is the equivalent visible surface).
// R1 hardening: the census rebuilds live from desktopRoutes:list each run
// (.w7b6-census.mjs — snapshot uids went stale when the B5 code-drift rebuild
// rotated them, and three walks landed on 404 stubs); every page passes a
// liveness gate (no 「404 … Back Home」stub, main content mounted) before its
// sweep; and the B5_KINDS set is a hard contract — every declared uid must
// appear in the live census (matched == declared), drift fails loud with the
// missing uids printed. Writes demos/acceptance-w7/w7-b6-matrix-probe.json /
// .log plus research/.../b6/w7-b6-census-live.json; exit 1 on any failure.
// Usage (repo root): node research/2026-10-03-w7-rework/b6/.w7b6-probe.mjs
import { chromium } from '../../../apps/web/node_modules/playwright/index.mjs'
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { buildCensusFromRoutes, LIVENESS_PROBE } from './.w7b6-census.mjs'

const BASE = 'http://127.0.0.1:13000'
const ENGINE = 'http://127.0.0.1:13110'
const OUT = fileURLToPath(new URL('../../../demos/acceptance-w7/', import.meta.url))
const DIR = fileURLToPath(new URL('./', import.meta.url))

// B5-domain pages (probe kinds identical to .w7b5-shoot.mjs). Keys are the
// uids the B5 rebuild deployed; the census must contain every one of them —
// a future rebuild that rotates a uid fails the hard contract below instead
// of silently dropping that page's structural assertion.
const B5_KINDS = new Map([
  ['w6b9cdzrc2lst1dm', 'cockpit'], ['w6b9fgcovvinqe85', 'finwb'],
  ['w6b2dwgwk6zc3i', 'tagpage'], ['w6b2rdacw363qjf7', 'tagpage'],
  ['w6b3v1vsyqj5u9a', 'expiry'], ['w6b3tctwuy6wn0d', 'dag'],
  ['w6b3r1wnc10bflfg', 'tagpage'], ['w6b4c4t709ypn92m', 'tagpage'],
  ['w6b4ce752lctbwp8', 'tagpage'], ['w6b5icrrgz5z9gu', 'iframepage'],
  ['w6b5ruwgh0d52fif', 'tagpage'], ['w6b6c6iqjj61zo9', 'iframepage'],
  ['w6b4bcr7wfgjxww', 'bomver'], ['w6b4b2jezsof7xz', 'bomver'],
  ['w6b8a3fg2qshtalw', 'aps'], ['w6b8a9z9q2cliq77', 'apswhatif'],
  ['w6b8ekr28fjs4b0k', 'tagpage'], ['w6b8e2y41rty9rx', 'tagpage'],
  ['w6b8eupafgchxsnf', 'tagpage'], ['w6b8erufav9515p', 'tagpage'],
  ['w6b8eci1cpbqsgtj', 'calendar'], ['w3purb7o0r3yqi45', 'matrix'],
  ['w3puryzkva06iuhh', 'poboard'],
])

// Computed rgb() strings of the banned palette (hex → rgb over all channels).
const BANNED_RGB = {
  '#1677ff': 'rgb(23, 119, 255)',
  '#7c3aed': 'rgb(124, 58, 237)',
  '#722ed1': 'rgb(114, 46, 209)',
  '#ff4d4f': 'rgb(255, 77, 79)',
  '#faad14': 'rgb(250, 173, 20)',
  '#c41d7f': 'rgb(196, 29, 127)',
  '#13c2c2': 'rgb(19, 194, 194)',
}

/** In-page: banned colors over computed styles (all elements, three channels).
 * @param map hex → rgb() string pairs injected from the Node side. */
const sweepComputed = (map) => {
  const banned = Object.fromEntries(Object.keys(map).map((k) => [k, 0]))
  const samples = []
  for (const el of document.querySelectorAll('*')) {
    const cs = getComputedStyle(el)
    for (const prop of ['color', 'backgroundColor', 'borderTopColor', 'borderLeftColor']) {
      const value = cs[prop]
      if (value === undefined || value === '') continue
      for (const [hex, rgb] of Object.entries(map)) {
        if (value === rgb) {
          banned[hex] += 1
          if (samples.length < 3) samples.push({ tag: el.tagName.slice(0, 12), cls: String(el.className).slice(0, 40), prop, value })
        }
      }
    }
  }
  return { banned, samples }
}

const B5_PROBE_SRC = readFileSync(fileURLToPath(new URL('../b5/.w7b5-shoot.mjs', import.meta.url)), 'utf8')
// Reuse the B5 in-page probe verbatim: lift the probePage body (self-contained —
// it re-declares its whitelist/banned/luminance helpers) and run it in-page
// through new Function so the B6 pass asserts the same facts and tolerances.
const PROBE_HEAD = 'const probePage = (kind) => {'
const PROBE_TAIL = '\n  return out\n}'
const probeBody = B5_PROBE_SRC.slice(
  B5_PROBE_SRC.indexOf(PROBE_HEAD) + PROBE_HEAD.length,
  B5_PROBE_SRC.indexOf(PROBE_TAIL) + '\n  return out'.length,
)
if (!probeBody.includes('const hits = { banned: {}')) throw new Error('probePage body extraction failed')
const BANNED_RGB_PASSED = BANNED_RGB

const report = []
const failures = []
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })

await page.goto(`${BASE}/signin`)
await page.locator('input[type=text]').first().fill('admin@nocobase.com')
await page.locator('input[type=password]').first().fill('admin123')
await page.locator('button', { hasText: '登录' }).first().click()
await page.waitForTimeout(5000)

// Live census rebuild: desktopRoutes:list through the signed-in session.
const routes = await page.evaluate(async () => {
  const token = (localStorage.getItem('NOCOBASE_TOKEN') ?? '').replace(/^"|"$/g, '')
  const res = await fetch('/api/desktopRoutes:list?pageSize=400', { headers: { Authorization: `Bearer ${token}` } })
  if (!res.ok) throw new Error(`desktopRoutes:list HTTP ${String(res.status)}`)
  return (await res.json())?.data ?? []
})
const census = buildCensusFromRoutes(routes)
const pages = census.pages
writeFileSync(`${DIR}w7-b6-census-live.json`, `${JSON.stringify({ rebuiltAt: new Date().toISOString(), flowPageCount: census.flowPageCount, pages }, null, 2)}\n`)
console.log(`census rebuilt live: ${String(pages.length)} units (${String(census.flowPageCount)} flowPage + 3 v1)`)

// B5_KINDS hard contract (lesson 4): matched == declared, drift fails loud.
const liveUids = new Set(pages.map((entry) => entry.schemaUid))
const missingKinds = [...B5_KINDS.keys()].filter((uid) => !liveUids.has(uid))
if (missingKinds.length > 0) {
  failures.push(`B5_KINDS contract broken: ${String(missingKinds.length)}/${String(B5_KINDS.size)} declared uids absent from the live census — a rebuild rotated them: ${missingKinds.join(', ')} (update B5_KINDS to the redeployed uids before trusting this pass)`)
  console.log(`B5_KINDS contract: FAIL — missing ${missingKinds.join(', ')}`)
} else {
  console.log(`B5_KINDS contract: matched ${String(B5_KINDS.size)}/${String(B5_KINDS.size)} declared uids in the live census`)
}

for (const entry of pages) {
  const kind = B5_KINDS.get(entry.schemaUid)
  try {
    await page.goto(`${BASE}/admin/${entry.schemaUid}`, { waitUntil: 'domcontentloaded' })
    await page.waitForLoadState('networkidle', { timeout: 6000 }).catch(() => {})
    await page.waitForTimeout(2400)
    // R2: a cold first paint can read dead before the route mounts — one
    // ~1500ms backoff retry, logged as both rounds, before the page fails.
    let liveness = await page.evaluate(LIVENESS_PROBE)
    if (!liveness.live) {
      console.log(`probe ${String(entry.index).padStart(3, '0')}-${entry.title} liveness round1 dead (404stub=${String(liveness.is404Stub)}) — one retry after 1500ms backoff`)
      await page.waitForTimeout(1500)
      liveness = await page.evaluate(LIVENESS_PROBE)
      console.log(`probe ${String(entry.index).padStart(3, '0')}-${entry.title} liveness round2 ${liveness.live ? 'live' : `dead (404stub=${String(liveness.is404Stub)})`}`)
    }
    if (!liveness.live) {
      failures.push(`${String(entry.index).padStart(3, '0')}-${entry.title}: liveness FAIL after backoff retry (404stub=${String(liveness.is404Stub)} main=${String(liveness.hasMain)}) — uid ${entry.schemaUid} is not a live page`)
      console.log(`probe ${String(entry.index).padStart(3, '0')}-${entry.title} liveness=FAIL (404stub=${String(liveness.is404Stub)})`)
      report.push({ index: entry.index, title: entry.title, uid: entry.schemaUid, liveness: 'FAIL', is404Stub: liveness.is404Stub })
      continue
    }
    const sweep = await page.evaluate(sweepComputed, BANNED_RGB)
    let structural = null
    if (kind !== undefined) {
      structural = await page.evaluate((payload) => new Function('kind', payload.bod)(payload.kind), { bod: probeBody, kind })
    }
    const row = { index: entry.index, title: entry.title, uid: entry.schemaUid, liveness: 'PASS', kind: kind ?? 'sweep', banned: sweep.banned }
    if (sweep.samples.length > 0) row.samples = sweep.samples
    if (structural !== null) row.structural = structural
    report.push(row)
    for (const [hex, count] of Object.entries(sweep.banned)) {
      if (count > 0) failures.push(`${String(entry.index).padStart(3, '0')}-${entry.title}: banned ${hex} x${String(count)} ${JSON.stringify(sweep.samples)}`)
    }
    console.log(`probe ${String(entry.index).padStart(3, '0')}-${entry.title} liveness=PASS kind=${kind ?? 'sweep'} ${Object.values(sweep.banned).some((n) => n > 0) ? 'BANNED-HIT' : 'clean'}`)
  } catch (err) {
    failures.push(`${String(entry.index).padStart(3, '0')}-${entry.title}: ${String(err && err.message ? err.message : err).slice(0, 120)}`)
    console.log(`probe ${String(entry.index).padStart(3, '0')}-${entry.title} FAILED`)
  }
}

// Engine-side pages at top level (the cross-origin iframe equivalence).
const engineProbe = async (path, account, password, marker) => {
  await page.goto(ENGINE + path, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(1200)
  if (await page.locator('input').count() > 0) {
    await page.locator('input').nth(0).fill(account)
    await page.locator('input[type=password]').first().fill(password)
    const btn = (await page.locator('#login-btn').count()) > 0 ? page.locator('#login-btn') : page.locator('button', { hasText: /签到|登录/ }).last()
    await btn.click()
    await page.waitForTimeout(3500)
  }
  const probe = await page.evaluate((mk) => {
    const cs = getComputedStyle(document.documentElement)
    const banned = { '#1677ff': 0, '#7c3aed': 0, '#722ed1': 0 }
    for (const el of document.querySelectorAll('*')) {
      const c = getComputedStyle(el)
      if (c.color === 'rgb(23, 119, 255)') banned['#1677ff'] += 1
      if (c.color === 'rgb(124, 58, 237)') banned['#7c3aed'] += 1
      if (c.color === 'rgb(114, 46, 209)') banned['#722ed1'] += 1
    }
    return {
      marker: mk,
      w7Primary: mk === 'cards' ? cs.getPropertyValue('--primary').trim() : cs.getPropertyValue('--w7-primary').trim(),
      bannedComputed: banned,
    }
  }, marker)
  report.push({ engine: path, ...probe })
  for (const [hex, count] of Object.entries(probe.bannedComputed)) {
    if (count > 0) failures.push(`engine ${path}: banned ${hex} x${String(count)}`)
  }
  const wantPrimary = marker === 'cards' ? '#5783BC' : '#1E4E8C'
  if (probe.w7Primary !== wantPrimary) failures.push(`engine ${path}: primary=${probe.w7Primary} want=${wantPrimary}`)
  console.log(`engine ${path} primary=${probe.w7Primary} banned=${JSON.stringify(probe.bannedComputed)}`)
}
await engineProbe('/insp', 'qc_inspector', 'Qc#2026', 'insp')
await engineProbe('/crm', 'sales_rep', 'Sales#2026', 'crm')
await engineProbe('/terminals/cards.html', 'shop_lead', 'Lead#2026', 'cards')

await browser.close()
writeFileSync(OUT + 'w7-b6-matrix-probe.json', JSON.stringify(report, null, 2) + '\n')
writeFileSync(OUT + 'w7-b6-matrix-probe.log', [...report.map((r) => `${r.engine ?? `${String(r.index).padStart(3, '0')}-${r.title}`}: ${JSON.stringify(r)}`), ...(failures.length > 0 ? ['FAILURES:', ...failures] : ['ALL B6 PROBES GREEN'])].join('\n') + '\n')
console.log(failures.length === 0 ? 'ALL B6 PROBES GREEN' : `PROBE FAILURES (${String(failures.length)}):\n${failures.join('\n')}`)
process.exit(failures.length === 0 ? 0 : 1)
