// W7-B1 after screenshots (22 pages: sales 9 + procurement 8 + CRM 5) plus the
// aesthetic DOM assertions, one Playwright session. Same rig as .w7b0-shot.mjs
// (form sign-in, 1440x900, settle wait). DOM checks per page with a table:
// thead font-weight >=600, enum Tag soft (bg alpha <0.3 or exact soft pair),
// first numeric column right-aligned + tabular-nums, no legacy palette hex in
// inline styles. Kanban/calendar pages ride the shot-only path (no table DOM).
// Usage: node research/2026-10-03-w7-rework/b1/.w7b1-shot.mjs
import { chromium } from '../../../apps/web/node_modules/playwright/index.mjs'
import { mkdirSync, statSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const BASE = 'http://127.0.0.1:13000'
const DIR = fileURLToPath(new URL('./', import.meta.url))
const OUT = `${DIR}after/`
mkdirSync(OUT, { recursive: true })

/** (censusIndex, schemaUid, title, domain) — indexes from audit-pages-w7.json. */
const B1_PAGES = [
  [4, 'n17sys042q2lz', '客户', 'crm'],
  [3, 'n17rwc527ujwt', '销售线索', 'crm'],
  [5, 'n17c3lkyg9zjd6', '联系人', 'crm'],
  [6, 'n17f2wwpqs60dtk', '产品与服务', 'crm'],
  [7, 'n17f2jumvap76nm8', '客户仪表盘', 'crm'],
  [91, 'n17vu68623sj9i', '订单', 'sales'],
  [90, 'n17v6xfvzxoj0f', '报价单', 'sales'],
  [92, 'n17f2c15ji684n8g', '回款', 'sales'],
  [93, 'n17f2utwb01mi3ha', '发票', 'sales'],
  [97, 'n17f2y9wfrggxyo', '销售仪表盘', 'sales'],
  [88, 'w7mrp4w590rm0ws8', '销售订单', 'sales'],
  [94, 'w3b3utj5a15khmq', '销售看板', 'sales'],
  [95, 'w3b3x8ymuxey8q', '交期日历', 'sales'],
  [96, 'w3b3ass8lwvxiy', '计划日历', 'sales'],
  [80, 'w3pura0kyqfx4f9', '采购申请', 'procurement'],
  [81, 'w3purlvif0v23bun', '询价管理', 'procurement'],
  [82, 'w3pur9w1c3yg3rjd', '供应商报价', 'procurement'],
  [83, 'w3purb7o0r3yqi45', '比价表', 'procurement'],
  [84, 'w3puryzkva06iuhh', '采购订单', 'procurement'],
  [85, 'w3pur45681oxtcsi', '发票匹配', 'procurement'],
  [86, 'w3pur3an4pwnr1eo', '付款申请', 'procurement'],
  [87, 'w3b3x35bfqctwkn', '采购看板', 'procurement'],
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

/** DOM aesthetic probes — run in page; returns per-check pass/fail map. */
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
  // v2-surface only: tables and forms must be free of legacy hexes; JSBlock
  // pages carry in-block hardcodes that belong to the B5 layer-3b batch.
  const v2Surface = [
    document.querySelector('.ant-table')?.outerHTML ?? '',
    ...[...document.querySelectorAll('form')].map((f) => f.outerHTML),
  ].join('')
  out.noLegacyHex = v2Surface === '' ? true : !LEGACY_RE.test(v2Surface)
  return out
}, [SOFT_BGS, LEGACY_HEX])

const report = { requested: B1_PAGES.length, ok: 0, failed: [], shots: [], probes: {} }
for (const [index, uid, title, domain] of B1_PAGES) {
  const name = `w7-b1-${String(index).padStart(2, '0')}-${title}.png`
  try {
    await page.goto(`${BASE}/admin/${uid}`)
    await page.waitForLoadState('networkidle', { timeout: 6000 }).catch(() => {})
    await page.waitForTimeout(2600)
    await page.screenshot({ path: `${OUT}${name}` })
    const probe = await probeOf(page)
    report.ok += 1
    report.probes[title] = probe
    report.shots.push({ name, uid, title, domain, bytes: statSync(`${OUT}${name}`).size })
    console.log(`shot ${name} :: ${Object.entries(probe).map(([k, v]) => `${k}=${v ? 'PASS' : 'FAIL'}`).join(' ')}`)
  } catch (err) {
    report.failed.push({ name, uid, error: String(err.message).split('\n')[0] })
    console.log(`FAIL ${name}: ${String(err.message).split('\n')[0]}`)
  }
}

writeFileSync(`${DIR}.w7b1-shot-report.json`, `${JSON.stringify(report, null, 2)}\n`)
console.log(`\n== b1 after: 成功 ${report.ok}/${report.requested}, 失败 ${report.failed.length} ==`)
await browser.close()
process.exit(0)
