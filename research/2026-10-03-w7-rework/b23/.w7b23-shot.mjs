// W7-B2+B3 after screenshots (53 pages: production 15 + warehousing 14 +
// quality 7 + supply-chain 8 + organization 5 + assets 3 + base-data 1) plus
// the aesthetic DOM assertions, one Playwright session. Same rig as B1
// (.w7b1-shot.mjs): form sign-in, 1440x900, settle wait. DOM checks per page
// kind: table pages the six-checkpoint set (thead600/theadBg/tagSoft/tagPill/
// numRightTnum/noLegacyHex), kanban/matrix pages the form-face subset
// (tagSoft/tagPill/noLegacyHex), iframe terminal pages shot-only (B5 owns the
// iframe shell). Usage: node research/2026-10-03-w7-rework/b23/.w7b23-shot.mjs
import { chromium } from '../../../apps/web/node_modules/playwright/index.mjs'
import { mkdirSync, statSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const BASE = 'http://127.0.0.1:13000'
const DIR = fileURLToPath(new URL('./', import.meta.url))
const OUT = `${DIR}after/`
mkdirSync(OUT, { recursive: true })

/** (name, schemaUid, title, kind) — kind: table | kanban | iframe. */
const PAGES = [
  // B2 生产与计划 15
  ['w7-b2-01-BOM管理', 'w5mfga37ztlt6orc', 'table'],
  ['w7-b2-02-BOM工序', 'w5mfgkkvs7a4ijya', 'table'],
  ['w7-b2-03-工作中心', 'w5mfg3eil2n4n0kr', 'table'],
  ['w7-b2-04-生产订单', 'w5mfgntyu7wy20a', 'table'],
  ['w7-b2-05-排程明细', 'w5mfgp352sily7f', 'table'],
  ['w7-b2-06-领料单', 'w6mfgsp029qziym', 'table'],
  ['w7-b2-07-退料单', 'w6mfg1zez6dqkcgh', 'table'],
  ['w7-b2-08-报工记录', 'w6mfglmxq9mhbkur', 'table'],
  ['w7-b2-09-完工单', 'w6mfgp1rrz08ffa', 'table'],
  ['w7-b2-10-MO执行视图', 'w6mfgmct2tf2braf', 'table'],
  ['w7-b2-11-计划工作台', 'w7mrphtm8t9tzlk8', 'table'],
  ['w7-b2-12-MRP快照', 'w7mrpowj6l93nn0a', 'table'],
  ['w7-b2-13-主生产计划', 'w7mrpyru4s708nwn', 'table'],
  ['w7-b2-14-生产订单看板', 'w3b39xulomz8jj', 'kanban'],
  ['w7-b2-15-车间终端', 'w3b6guuruqly03t', 'iframe'],
  // B2 仓储管理 14
  ['w7-b2-16-仓库库区', 'h5wms50cuimohzz7', 'table'],
  ['w7-b2-17-库位平面图', 'h5wms1nju21hb5c8', 'table'],
  ['w7-b2-18-入库单', 'h5wmsrh8ls7pkv5i', 'table'],
  ['w7-b2-19-出库单', 'h5wmsvwkqjiiaxdj', 'table'],
  ['w7-b2-20-库存查询', 'h5wms9v2hly0cg6j', 'table'],
  ['w7-b2-21-批次主数据', 'h5wmsgd4pntmwvg', 'table'],
  ['w7-b2-22-盘点管理', 'h5wms2hmkvlfsmtf', 'table'],
  ['w7-b2-23-移库管理', 'h5wmspyqfovkqjff', 'table'],
  ['w7-b2-24-库存流水', 'h5wms9srcrn5fhiq', 'table'],
  ['w7-b2-25-预留管理', 'h5wms9zlhetpzwl', 'table'],
  ['w7-b2-26-补货预警', 'h5wmstw8iug4upxs', 'table'],
  ['w7-b2-27-盘点计划', 'h5wmsddav9gkxtl', 'table'],
  ['w7-b2-28-月度收发存', 'h5wmslacezwb94s', 'table'],
  ['w7-b2-29-收货终端', 'w3b66yns80jnq92', 'iframe'],
  // B3 质量管理 7
  ['w7-b3-01-质检单', 'w8qmjvyv8p5j7j', 'table'],
  ['w7-b3-02-检验读数', 'w8qmg3yelbk0rzm', 'table'],
  ['w7-b3-03-处置看板', 'w8qm472nluqt32x', 'kanban'],
  ['w7-b3-04-AQL抽样方案', 'w8qm15rxe53v8hh', 'table'],
  ['w7-b3-05-季度绩效物化', 'w8qm8sx2tj9j0kb', 'table'],
  ['w7-b3-06-质检看板', 'w3b3uw3d0mrz1b', 'kanban'],
  ['w7-b3-07-质检工作台', 'w3b6nour73ecwgb', 'iframe'],
  // B3 供应链 8
  ['w7-b3-08-供应商档案', 'h4srm2u9xiqx09jb', 'table'],
  ['w7-b3-09-供应商准入', 'h4srm6hfqnpnrqu5', 'table'],
  ['w7-b3-10-证照效期预警', 'h4srmjjlvbjei4fd', 'table'],
  ['w7-b3-11-审核检查表', 'h4srmuvf86en2kn', 'table'],
  ['w7-b3-12-审核评分录入', 'h4srmflpebqkuz', 'table'],
  ['w7-b3-13-绩效评分卡', 'h4srms4w5viez9zp', 'table'],
  ['w7-b3-14-供应商绩效雷达', 'h4srmaf4rurtt17p', 'table'],
  ['w7-b3-15-整改跟踪', 'h4srm25tmro1wjuw', 'kanban'],
  // B3 组织与系统 5
  ['w7-b3-16-员工', 'n17lhe5qyxu1g', 'table'],
  ['w7-b3-17-部门', 'n17f3er0aw80yc8i', 'table'],
  ['w7-b3-18-请假审批', 'n17f3wqpzee9wo2g', 'table'],
  ['w7-b3-19-组织架构', 'w3b57ix4086om95', 'kanban'],
  ['w7-b3-20-权限矩阵', 'w3b5m8kwiakieq', 'kanban'],
  // B3 资产管理 3
  ['w7-b3-21-资产台账', 'n17wr2jbz8fl2i', 'table'],
  ['w7-b3-22-维保记录', 'n17f34o4bhrzg1w', 'table'],
  ['w7-b3-23-维保服务商', 'n17f3t3gtwv502s', 'table'],
  // B3 基础数据 1
  ['w7-b3-24-分类维护', 'n17f3rnd403uzlkc', 'table'],
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

const TABLE_CHECKS = ['thead600', 'theadBg', 'tagSoft', 'tagPill', 'numRightTnum', 'noLegacyHex']
const FORM_CHECKS = ['tagSoft', 'tagPill', 'noLegacyHex']
const report = { requested: PAGES.length, ok: 0, failed: [], shotOnly: [], shotFails: [], probes: {} }
const verdicts = { table: { pass: 0, fail: [] }, form: { pass: 0, fail: [] } }
for (const [name, uid, kind] of PAGES) {
  const file = `${name}.png`
  try {
    await page.goto(`${BASE}/admin/${uid}`)
    await page.waitForLoadState('networkidle', { timeout: 6000 }).catch(() => {})
    await page.waitForTimeout(2600)
    await page.screenshot({ path: `${OUT}${file}` })
    if (kind === 'iframe') {
      report.shotOnly.push(name)
      console.log(`shot ${file} :: shot-only（B5 iframe 壳）`)
      report.ok += 1
      continue
    }
    const probe = await probeOf(page)
    const want = kind === 'table' ? TABLE_CHECKS : FORM_CHECKS
    const applicable = want.filter((key) => probe[key] !== undefined)
    const misses = applicable.filter((key) => probe[key] !== true)
    report.probes[name] = probe
    if (misses.length === 0) {
      verdicts[kind === 'table' ? 'table' : 'form'].pass += 1
      report.ok += 1
      console.log(`shot ${file} :: ${applicable.map((k) => `${k}=PASS`).join(' ')}`)
    } else {
      verdicts[kind === 'table' ? 'table' : 'form'].fail.push({ name, misses })
      console.log(`shot ${file} :: FAIL ${misses.join(',')}`)
    }
  } catch (err) {
    report.failed.push({ name, uid, error: String(err.message).split('\n')[0] })
    console.log(`FAIL ${file}: ${String(err.message).split('\n')[0]}`)
  }
}

writeFileSync(`${DIR}.w7b23-shot-report.json`, `${JSON.stringify({ ...report, verdicts }, null, 2)}\n`)
console.log(`\n== b23 after: 成功 ${report.ok}/${report.requested}, 拍照-only ${report.shotOnly.length}, 失败 ${report.failed.length} ==`)
console.log(`== 表格页 PASS ${verdicts.table.pass} / FAIL ${verdicts.table.fail.length}；形态面 PASS ${verdicts.form.pass} / FAIL ${verdicts.form.fail.length} ==`)
await browser.close()
process.exit(verdicts.table.fail.length > 0 || verdicts.form.fail.length > 0 || report.failed.length > 0 ? 1 : 0)
