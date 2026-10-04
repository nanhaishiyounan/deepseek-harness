// W7-B5 acceptance shoot + DOM probes (read-only acceptance artifact).
// Signs into NocoBase PC (:13000, admin), captures after-shots (1440x900) of the
// 21 W6 pages + the two B5-touched mount pages (比价表/采购订单), runs per-page
// DOM assertions (hardcoded-color zeroing, radius/token probes, fake-zero-bar
// absence, DAG stroke whitelist, APS color-mix, soft tags), then signs into the
// engine-side iframe pages (/insp qc_inspector, /crm sales_rep) for the
// signed-in forms the 02 audit could not reach. Writes PNGs to
// demos/acceptance-w7/ and the probe report to demos/acceptance-w7/w7-b5-dom-probe.json.
// Usage (repo root): node research/2026-10-03-w7-rework/b5/.w7b5-shoot.mjs
import { chromium } from '../../../apps/web/node_modules/playwright/index.mjs'
import { mkdirSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const BASE = 'http://127.0.0.1:13000'
const ENGINE = 'http://127.0.0.1:13110'
const OUT = fileURLToPath(new URL('../../../demos/acceptance-w7/', import.meta.url))

// [file, route-uid, probe-kind] — 21 W6 pages + 2 mount pages (B5 diff surface).
const PAGES = [
  ['w7-b5-01-经营总览-驾驶舱.png', 'w6b9cdzrc2lst1dm', 'cockpit'],
  ['w7-b5-02-财务工作台.png', 'w6b9fgcovvinqe85', 'finwb'],
  ['w7-b5-03-预警列表.png', 'w6b2dwgwk6zc3i', 'tagpage'],
  ['w7-b5-04-预警规则.png', 'w6b2rdacw363qjf7', 'tagpage'],
  ['w7-b5-05-效期看板.png', 'w6b3v1vsyqj5u9a', 'expiry'],
  ['w7-b5-06-批次追溯.png', 'w6b3tctwuy6wn0d', 'dag'],
  ['w7-b5-07-召回管理.png', 'w6b3r1wnc10bflfg', 'tagpage'],
  ['w7-b5-08-CCP监控配置.png', 'w6b4c4t709ypn92m', 'tagpage'],
  ['w7-b5-09-CCP监控记录.png', 'w6b4ce752lctbwp8', 'tagpage'],
  ['w7-b5-10-检验工作台-iframe.png', 'w6b5icrrgz5z9gu', 'iframepage'],
  ['w7-b5-11-出厂检验报告.png', 'w6b5ruwgh0d52fif', 'tagpage'],
  ['w7-b5-12-商机管道-iframe.png', 'w6b6c6iqjj61zo9', 'iframepage'],
  ['w7-b5-13-工程变更单.png', 'w6b4bcr7wfgjxww', 'bomver'],
  ['w7-b5-14-配方版本与变更.png', 'w6b4b2jezsof7xz', 'bomver'],
  ['w7-b5-15-APS瓶颈与负荷.png', 'w6b8a3fg2qshtalw', 'aps'],
  ['w7-b5-16-APS-what-if沙箱.png', 'w6b8a9z9q2cliq77', 'apswhatif'],
  ['w7-b5-17-设备台账.png', 'w6b8ekr28fjs4b0k', 'tagpage'],
  ['w7-b5-18-维保计划.png', 'w6b8e2y41rty9rx', 'tagpage'],
  ['w7-b5-19-维保工单.png', 'w6b8eupafgchxsnf', 'tagpage'],
  ['w7-b5-20-计量校准.png', 'w6b8erufav9515p', 'tagpage'],
  ['w7-b5-21-维保日历.png', 'w6b8eci1cpbqsgtj', 'calendar'],
  ['w7-b5-22-比价表-矩阵JSBlock.png', 'w3purb7o0r3yqi45', 'matrix'],
  ['w7-b5-23-采购订单-泳道JSBlock.png', 'w3puryzkva06iuhh', 'poboard'],
]

// The forbidden hardcoded colors in JSBlock/inline surfaces (token refs only).
const BANNED = ['#1677ff', '#722ed1', '#7c3aed', '#ff4d4f', '#faad14', '#c41d7f', '#13c2c2']

// W7 chart/semantic stroke family the DAG node borders must resolve into
// (computed rgb of the tokens + surface/border neutrals for lane frames).
const DAG_STROKE_WHITELIST = [
  'rgb(30, 78, 140)', // chart-1 / primary
  'rgb(58, 105, 164)', // chart-2
  'rgb(87, 131, 188)', // chart-3
  'rgb(123, 157, 209)', // chart-4
  'rgb(0, 112, 242)', // informational
  'rgb(120, 143, 166)', // neutral
  'rgb(23, 61, 112)', // primary-active
  'rgb(170, 8, 8)', // negative (recall highlight)
  'rgb(232, 232, 230)', // border (lane frames)
  'rgb(216, 216, 213)', // border-strong (edge arrows)
]

const luminance = (r, g, b) => (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255

const probePage = (kind) => {
  const luminance = (r, g, b) => (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255
  const DAG_STROKE_WHITELIST = ['rgb(30, 78, 140)', 'rgb(58, 105, 164)', 'rgb(87, 131, 188)', 'rgb(123, 157, 209)', 'rgb(0, 112, 242)', 'rgb(120, 143, 166)', 'rgb(23, 61, 112)', 'rgb(170, 8, 8)', 'rgb(232, 232, 230)', 'rgb(216, 216, 213)']
  const BANNED = ['#1677ff', '#722ed1', '#7c3aed', '#ff4d4f', '#faad14', '#c41d7f', '#13c2c2']
  const hits = { banned: {}, kind }
  for (const b of BANNED) hits.banned[b] = 0
  for (const el of document.querySelectorAll('[style]')) {
    const s = el.getAttribute('style') || ''
    for (const b of BANNED) if (s.toLowerCase().includes(b)) hits.banned[b] += 1
  }
  const out = { ...hits }
  if (kind === 'cockpit') {
    const root = document.querySelector('[data-w6b9="cockpit"]')
    out.rendered = root !== null && root.children.length > 0
    out.fakeZeroBars = [...document.querySelectorAll('[data-w6b9="cockpit"] div')].filter(d => (d.getAttribute('style') || '').includes('width:2%')).length
    const card = document.querySelector('[data-w6b9="cockpit"] [data-card]')
    if (card) out.kpiCardRadius = getComputedStyle(card).borderRadius
    out.zeroBaselineDots = [...document.querySelectorAll('[data-w6b9="cockpit"] span')].filter(s => (s.getAttribute('style') || '').includes('border-radius:999px') && (s.getAttribute('style') || '').includes('width:3px')).length
  }
  if (kind === 'finwb') {
    out.rendered = !!document.querySelector('[data-w6b9="fin-wb"]')
    out.softStatusLights = [...document.querySelectorAll('[data-w6b9="fin-wb"] span')].filter(s => (s.getAttribute('style') || '').includes('background:var(--w7-')).length
  }
  if (kind === 'matrix') {
    out.passMark = [...document.querySelectorAll('[title="60 分合格线"]')].length
    out.barToken = [...document.querySelectorAll('div')].filter(d => (d.getAttribute('style') || '').includes('background:var(--w7-chart-1)')).length
  }
  if (kind === 'dag') {
    const rects = [...document.querySelectorAll('#trace-dag-svg rect')]
    out.nodeCount = rects.length
    const strokes = new Set()
    for (const r of rects) { const m = getComputedStyle(r).stroke; if (m && m !== 'none') strokes.add(m) }
    out.strokeSet = [...strokes]
    out.strokesInWhitelist = [...strokes].every(s => DAG_STROKE_WHITELIST.includes(s))
    const anchor = rects.find(r => Number(getComputedStyle(r).strokeWidth) >= 2.5)
    out.anchorPrimary = anchor ? getComputedStyle(anchor).stroke === 'rgb(30, 78, 140)' : null
  }
  if (kind === 'expiry') {
    const cells = [...document.querySelectorAll('[data-expiry-cell]')]
    out.cellCount = cells.length
    const soft = cells.filter(c => { const c2 = getComputedStyle(c).backgroundColor; const m = c2.match(/\d+/g); return m && luminance(Number(m[0]), Number(m[1]), Number(m[2])) > 0.8 })
    out.softCells = soft.length
    out.kpiCards = [...document.querySelectorAll('[data-w6b3="expiry-board"] div')].filter(d => (d.getAttribute('style') || '').includes('var(--w7-fs-kpi)')).length
  }
  if (kind === 'calendar') {
    out.moreButtons = [...document.querySelectorAll('[data-act="more"]')].length
    out.chipTokens = [...document.querySelectorAll('button[data-act="sel"]')].filter(b => (b.getAttribute('style') || '').includes('var(--w7-')).length
  }
  if (kind === 'aps' || kind === 'apswhatif') {
    out.colorMixCells = [...document.querySelectorAll('td')].filter(t => (t.getAttribute('style') || '').includes('color-mix')).length
    out.oldRgbaHeat = [...document.querySelectorAll('[style]')].filter(e => (e.getAttribute('style') || '').includes('rgba(255,77,79') || (e.getAttribute('style') || '').includes('rgba(82,196,26') || (e.getAttribute('style') || '').includes('rgba(250,173,20')).length
  }
  if (kind === 'tagpage') {
    const tags = [...document.querySelectorAll('.ant-tag')]
    out.tagCount = tags.length
    if (tags.length > 0) {
      out.tagRadius = getComputedStyle(tags[0]).borderRadius
      const bg = getComputedStyle(tags[0]).backgroundColor.match(/\d+/g) || []
      out.tagSoftBg = bg.length === 3 ? luminance(Number(bg[0]), Number(bg[1]), Number(bg[2])) > 0.8 : null
    }
    const th = document.querySelector('.ant-table-thead th')
    if (th) { const cs = getComputedStyle(th); out.thWeight = cs.fontWeight; out.thBgNotWhite = cs.backgroundColor !== 'rgb(255, 255, 255)' }
  }
  if (kind === 'bomver' || kind === 'poboard' || kind === 'iframepage') {
    out.anyJsblock = !!document.querySelector('[data-w6b3],[data-w6b7],[data-w6b8],[data-w6b9],iframe')
  }
  return out
}

mkdirSync(OUT, { recursive: true })
const report = []
const failures = []

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })

await page.goto(`${BASE}/signin`)
await page.locator('input[type=text]').first().fill('admin@nocobase.com')
await page.locator('input[type=password]').first().fill('admin123')
await page.locator('button', { hasText: '登录' }).first().click()
await page.waitForTimeout(5000)

for (const [file, uid, kind] of PAGES) {
  try {
    await page.goto(`${BASE}/admin/${uid}`, { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(4000)
    await page.screenshot({ path: OUT + file })
    const probe = await page.evaluate(probePage, kind)
    report.push({ file, uid, ...probe })
    for (const b of BANNED) if ((probe.banned?.[b] ?? 0) > 0) failures.push(`${file}: banned ${b} x${String(probe.banned[b])}`)
    if (kind === 'cockpit' && probe.fakeZeroBars > 0) failures.push(`${file}: fake-zero bars x${String(probe.fakeZeroBars)}`)
    if (kind === 'cockpit' && probe.zeroBaselineDots === 0) failures.push(`${file}: no zero baseline dots (probe expects ≥1 zero month in trend)`)
    if (kind === 'dag' && probe.strokesInWhitelist !== true) failures.push(`${file}: DAG stroke outside whitelist ${JSON.stringify(probe.strokeSet)}`)
    if (kind === 'dag' && probe.anchorPrimary === false) failures.push(`${file}: anchor stroke not primary`)
    if ((kind === 'aps' || kind === 'apswhatif') && probe.oldRgbaHeat > 0) failures.push(`${file}: legacy rgba heat x${String(probe.oldRgbaHeat)}`)
    if (kind === 'tagpage' && probe.tagCount > 0 && probe.tagRadius !== '999px') failures.push(`${file}: tag radius ${String(probe.tagRadius)}`)
    console.log(`shot ${file} kind=${kind} ok`)
  } catch (err) {
    failures.push(`${file}: ${String(err && err.message ? err.message : err)}`)
    console.log(`shot ${file} FAILED: ${String(err && err.message ? err.message : err).slice(0, 120)}`)
  }
}

// Engine-side iframe pages, signed in (the 02-report limitation clearance).
const engineShot = async (path, file, account, password, marker) => {
  try {
    await page.goto(ENGINE + path, { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(1200)
    const hasForm = await page.locator('input').count()
    if (hasForm > 0) {
      await page.locator('input').nth(0).fill(account)
      await page.locator('input[type=password]').first().fill(password)
      const btn = (await page.locator('#login-btn').count()) > 0 ? page.locator('#login-btn') : page.locator('button', { hasText: /签到|登录/ }).last()
      await btn.click()
      await page.waitForTimeout(3500)
    }
    await page.screenshot({ path: OUT + file, fullPage: false })
    const probe = await page.evaluate((mk) => {
      const cs = getComputedStyle(document.documentElement)
      const w7Primary = mk === 'cards' ? cs.getPropertyValue('--primary').trim() : cs.getPropertyValue('--w7-primary').trim()
      return {
        marker: mk,
        w7Primary,
        w7Negative: cs.getPropertyValue('--w7-negative-fg').trim(),
        bannedInline: [...document.querySelectorAll('[style]')].filter(e => { const s = (e.getAttribute('style') || '').toLowerCase(); return s.includes('#1677ff') || s.includes('#7c3aed') || s.includes('#722ed1') }).length,
        signInGone: !document.querySelector('#login-view:not(.hidden), .login:not([hidden])'),
      }
    }, marker)
    report.push({ file, engine: path, ...probe })
    const wantPrimary = marker === 'cards' ? '#5783BC' : '#1E4E8C'
    if (probe.w7Primary !== wantPrimary) failures.push(`${file}: primary=${probe.w7Primary} want=${wantPrimary}`)
    if (probe.bannedInline > 0) failures.push(`${file}: banned inline x${String(probe.bannedInline)}`)
    console.log(`engine shot ${file} w7=${probe.w7Primary} signedIn=${probe.signInGone}`)
  } catch (err) {
    failures.push(`${file}: ${String(err && err.message ? err.message : err)}`)
    console.log(`engine shot ${file} FAILED`)
  }
}
await engineShot('/insp', 'w7-b5-24-检验工作台-insp签到态.png', 'qc_inspector', 'Qc#2026', 'insp')
await engineShot('/crm', 'w7-b5-25-商机管道-crm签到态.png', 'sales_rep', 'Sales#2026', 'crm')
await engineShot('/terminals/cards.html', 'w7-b5-26-车间签到墙-cards.png', 'shop_lead', 'Lead#2026', 'cards')

await browser.close()
writeFileSync(OUT + 'w7-b5-dom-probe.json', JSON.stringify(report, null, 2))
writeFileSync(OUT + 'w7-b5-dom-probe.log', [...report.map(r => `${r.file}: ${JSON.stringify(r)}`), ...(failures.length > 0 ? ['FAILURES:', ...failures] : ['ALL PROBES GREEN'])].join('\n') + '\n')
console.log(failures.length === 0 ? 'ALL PROBES GREEN' : `PROBE FAILURES (${String(failures.length)}):\n${failures.join('\n')}`)
process.exitCode = failures.length === 0 ? 0 : 1
