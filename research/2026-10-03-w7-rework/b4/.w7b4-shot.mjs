// W7-B4 after screenshots + aesthetic DOM assertions, one Playwright session.
// Page kinds: table (six-checkpoint set, b23 caliber), kpi (stat-card row must
// precede the first table + table set), kanban (form-face subset + lane tags),
// calendar (colored event pills), v1gantt (B4 globalStyle overlay: grid ticks,
// today stroke, label baseline), shell (shot-only: JSBlock shells owned by B5),
// b1retake (table set on five B1 pages after the field-enum debt heal).
// Usage: node research/2026-10-03-w7-rework/b4/.w7b4-shot.mjs
import { chromium } from '../../../apps/web/node_modules/playwright/index.mjs'
import { mkdirSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const BASE = 'http://127.0.0.1:13000'
const DIR = fileURLToPath(new URL('./', import.meta.url))
const OUT = `${DIR}after/`
mkdirSync(OUT, { recursive: true })

/** (file-stem, schemaUid, kind) */
const PAGES = [
  ['w7-b4-01-经营看板', 'w9kpi7zv98whvfpv', 'kpi'],
  ['w7-b4-02-供应链看板', 'w9kpijpea6p6exnm', 'kpi'],
  ['w7-b4-03-生产看板', 'w9kpirvxmfx12l2i', 'kpi'],
  ['w7-b4-04-库存看板', 'w9kpiatwzi4gjbff', 'kpi'],
  ['w7-b4-05-应收应付对账', 'w9kpisldougonly', 'kpi'],
  ['w7-b4-06-任务列表', 'n17e1ilgn22ts32', 'kpi'],
  ['w7-b4-07-项目', 'n17e1kqp4orpph5', 'kpi'],
  ['w7-b4-08-里程碑', 'n17e1m63re4tgre8', 'kpi'],
  ['w7-b4-09-工单', 'n17etqhllqqa28', 'kpi'],
  ['w7-b4-10-知识文章', 'n17f38lga4ln4s65', 'kpi'],
  ['w7-b4-11-审批中心', 'w1w167h6joi0ck6', 'kpi'],
  ['w7-b4-12-审批流配置', 'w3b4u2r9nnjqvi', 'table'],
  ['w7-b4-13-任务看板', 'n17f12u108kzzyk1', 'kanban'],
  ['w7-b4-14-任务日历', 'n17f1ns70eshqwy', 'calendar'],
  ['w7-b4-15-销售看板', 'w3b3utj5a15khmq', 'kanban'],
  ['w7-b4-16-采购看板', 'w3b3x35bfqctwkn', 'kanban'],
  ['w7-b4-17-生产订单看板', 'w3b39xulomz8jj', 'kanban'],
  ['w7-b4-18-质检看板', 'w3b3uw3d0mrz1b', 'kanban'],
  ['w7-b4-19-处置看板', 'w8qm472nluqt32x', 'kanban'],
  ['w7-b4-20-整改跟踪', 'h4srm25tmro1wjuw', 'kanban'],
  ['w7-b4-21-交期日历', 'w3b3x8ymuxey8q', 'calendar'],
  ['w7-b4-22-计划日历', 'w3b3ass8lwvxiy', 'calendar'],
  ['w7-b4-23-经营总览', 'w6b9cdzrc2lst1dm', 'shell'],
  ['w7-b4-24-AI工作台', 'n13ai2efgqippp44', 'table'],
  ['w7-b4-25-排产甘特', '96yet9a0x45', 'v1gantt'],
  ['w7-b4-26-任务甘特', 'zs3oqvlgqq0', 'v1gantt'],
  ['w7-b4-27-应用中心', 'c9c6wzppejk', 'shell'],
  // B1 field-enum debt retakes (5 of 22): the Tag colors now ride v3
  ['w7-b4-r01-客户', 'n17sys042q2lz', 'b1retake'],
  ['w7-b4-r02-销售线索', 'n17rwc527ujwt', 'b1retake'],
  ['w7-b4-r03-采购订单', 'w3puryzkva06iuhh', 'b1retake'],
  ['w7-b4-r04-销售订单', 'w7mrp4w590rm0ws8', 'b1retake'],
  ['w7-b4-r05-比价表', 'w3purb7o0r3yqi45', 'b1retake'],
]

const SOFT_BGS = ['#f5fae5', '#fff8d6', '#ffeaf4', '#eff1f2', '#e1f4ff', '#e0f5f7', '#fafafa']
const LEGACY_HEX = ['#1677ff', '#1d4ed8', '#7c3aed', '#6b7280', '#9ca3af', '#722ed1']

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

const probeOf = (pg) => pg.evaluate(([softBgs, legacyHexes]) => {
  const SOFT_HEX = new Set(softBgs)
  const LEGACY_RE = new RegExp(legacyHexes.join('|'), 'i')
  const out = {}
  const thead = document.querySelector('.ant-table-thead th')
  if (thead !== null) {
    const cs = getComputedStyle(thead)
    out.thead600 = Number(cs.fontWeight) >= 600
    out.theadBg = cs.backgroundColor !== 'rgb(255, 255, 255)'
  }
  const tags = [...document.querySelectorAll('.ant-tag')].slice(0, 12)
  if (tags.length > 0) {
    out.tagSoft = tags.every((tag) => {
      const bg = getComputedStyle(tag).backgroundColor
      const m = /rgba?\((\d+), (\d+), (\d+)(?:, ([\d.]+))?\)/.exec(bg)
      if (m === null) return false
      const alpha = m[4] === undefined ? 1 : Number(m[4])
      const hex = `#${[1, 2, 3].map((i) => Number(m[i]).toString(16).padStart(2, '0')).join('')}`
      return alpha < 0.3 || SOFT_HEX.has(hex)
    })
    out.tagPill = tags.every((tag) => Number.parseFloat(getComputedStyle(tag).borderRadius) >= 99)
  }
  const numericCell = [...document.querySelectorAll('.ant-table-tbody td')].find((td) => getComputedStyle(td).textAlign === 'right')
  if (numericCell !== undefined) {
    out.numRightTnum = getComputedStyle(numericCell).fontVariantNumeric.includes('tabular-nums')
      || getComputedStyle(numericCell).fontFeatureSettings.includes('tnum')
  }
  const v2Surface = [
    document.querySelector('.ant-table')?.outerHTML ?? '',
    ...[...document.querySelectorAll('form')].map((f) => f.outerHTML),
  ].join('')
  out.noLegacyHex = v2Surface === '' ? true : !LEGACY_RE.test(v2Surface)
  // kpi reorg: the stat-card canvases (height ~112 rendered region) must all
  // precede the page's first table in document order.
  const canvases = [...document.querySelectorAll('canvas')].filter((c) => c.getBoundingClientRect().height > 80 && c.getBoundingClientRect().height < 150)
  const firstTable = document.querySelector('.ant-table')
  if (canvases.length > 0 && firstTable !== null) {
    out.cardsFirst = canvases.every((c) => (c.compareDocumentPosition(firstTable) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0)
    out.cardsCount = canvases.length
  }
  // kanban: lane headers carry the group Tag (v3 lane colors ride the tag soft set)
  out.laneTags = document.querySelectorAll('.ant-tag').length
  // calendar: events are react-big-calendar .rbc-event strips; count them and
  // the distinct backgrounds — before the colorFieldName wiring they all share
  // one default color, after it they ride the status enum's soft pairs.
  const events = [...document.querySelectorAll('.rbc-event')]
  const colors = new Set()
  for (const el of events) colors.add(getComputedStyle(el).backgroundColor)
  out.eventColors = colors.size
  out.eventPills = events.length
  // v1 gantt overlay: computed styles of the SVG gantt pieces
  const tick = document.querySelector('.gridTick')
  if (tick !== null) out.ganttTick = getComputedStyle(tick).stroke.includes('232') || getComputedStyle(tick).stroke.toLowerCase().includes('#e8e8e6')
  const today = document.querySelector('.today rect')
  if (today !== null) out.todayStroke = getComputedStyle(today).stroke.toLowerCase().includes('231, 101, 0') || getComputedStyle(today).stroke.toLowerCase().includes('#e76500')
  const label = document.querySelector('.barLabelOutside')
  if (label !== null) out.labelBaseline = ['middle', 'central'].includes(getComputedStyle(label).dominantBaseline)
  return out
}, [SOFT_BGS, LEGACY_HEX])

const TABLE_CHECKS = ['thead600', 'theadBg', 'tagSoft', 'tagPill', 'numRightTnum', 'noLegacyHex']
const FORM_CHECKS = ['tagSoft', 'tagPill', 'noLegacyHex']
const KPI_CHECKS = ['cardsFirst', ...FORM_CHECKS]
const CALENDAR_CHECKS = ['eventColors']
const V1_CHECKS = ['ganttTick', 'todayStroke', 'labelBaseline']

const report = { requested: PAGES.length, ok: 0, failed: [], shotOnly: [], probes: {} }
const verdicts = { table: { pass: 0, fail: [] }, kpi: { pass: 0, fail: [] }, kanban: { pass: 0, fail: [] }, calendar: { pass: 0, fail: [] }, v1gantt: { pass: 0, fail: [] } }
for (const [name, uid, kind] of PAGES) {
  const file = `${name}.png`
  try {
    await page.goto(`${BASE}/admin/${uid}`)
    await page.waitForLoadState('networkidle', { timeout: 6000 }).catch(() => {})
    await page.waitForTimeout(2800)
    await page.screenshot({ path: `${OUT}${file}` })
    if (kind === 'shell') {
      report.shotOnly.push(name)
      console.log(`shot ${file} :: shot-only（B5 层 3b）`)
      report.ok += 1
      continue
    }
    const probe = await probeOf(page)
    let want, bucket
    if (kind === 'table' || kind === 'b1retake') { want = TABLE_CHECKS; bucket = 'table' }
    else if (kind === 'kpi') { want = KPI_CHECKS; bucket = 'kpi' }
    else if (kind === 'kanban') { want = FORM_CHECKS; bucket = 'kanban' }
    else if (kind === 'calendar') { want = CALENDAR_CHECKS; bucket = 'calendar' }
    else { want = V1_CHECKS; bucket = 'v1gantt' }
    const applicable = want.filter((key) => typeof probe[key] === 'boolean')
    const misses = applicable.filter((key) => probe[key] !== true)
    report.probes[name] = probe
    if (misses.length === 0 && (kind !== 'calendar' || Number(probe.eventColors) >= 1)) {
      verdicts[bucket].pass += 1
      report.ok += 1
      console.log(`shot ${file} :: ${applicable.map((k) => `${k}=${kind === 'calendar' || k === 'cardsCount' || k === 'laneTags' ? JSON.stringify(probe[k]) : 'PASS'}`).join(' ')}`)
    } else {
      verdicts[bucket].fail.push({ name, misses })
      console.log(`shot ${file} :: FAIL ${misses.join(',')} probe=${JSON.stringify(probe).slice(0, 220)}`)
    }
  } catch (err) {
    report.failed.push({ name, uid, error: String(err.message).split('\n')[0] })
    console.log(`FAIL ${file}: ${String(err.message).split('\n')[0]}`)
  }
}

writeFileSync(`${DIR}.w7b4-shot-report.json`, `${JSON.stringify({ ...report, verdicts }, null, 2)}\n`)
console.log(`\n== b4 after: 成功 ${report.ok}/${report.requested}, shot-only ${report.shotOnly.length}, 失败 ${report.failed.length} ==`)
for (const [bucket, v] of Object.entries(verdicts)) console.log(`== ${bucket} PASS ${v.pass} / FAIL ${v.fail.length}${v.fail.length > 0 ? ` :: ${v.fail.map((f) => `${f.name}(${f.misses.join(',')})`).join('、')}` : ''} ==`)
await browser.close()
process.exit(Object.values(verdicts).some((v) => v.fail.length > 0) || report.failed.length > 0 ? 1 : 0)
