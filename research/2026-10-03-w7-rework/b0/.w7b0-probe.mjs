// W7-B0 DOM computed-style probes (plan §5 acceptance): signs in, walks the
// representative pages, and reads live computed styles — primary-button brand
// color, table-header weight/size, tag soft pairs, card radius/shadow — plus
// a #1677ff residue sweep over inline HTML and stylesheet rules.
// Usage (repo root): node research/2026-10-03-w7-rework/b0/.w7b0-probe.mjs
import { chromium } from '../../../apps/web/node_modules/playwright/index.mjs'
import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const BASE = 'http://127.0.0.1:13000'
const OUT = fileURLToPath(new URL('./w7-b0-dom-probe.json', import.meta.url))

const PAGES = [
  ['crm-customer', 'n17sys042q2lz'],
  ['wms-stock', 'h5wms9v2hly0cg6j'],
  ['pur-order', 'w3puryzkva06iuhh'],
  ['cockpit', 'w6b9cdzrc2lst1dm'],
  ['v1-gantt', '96yet9a0x45'],
]

const BRAND = { r: 30, g: 78, b: 140 } // #1E4E8C
const parseRgb = (value) => {
  const m = /rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/.exec(value ?? '')
  return m === null ? null : { r: Number(m[1]), g: Number(m[2]), b: Number(m[3]), a: m[4] === undefined ? 1 : Number(m[4]) }
}
const near = (rgb, target, tol) => rgb !== null && Math.abs(rgb.r - target.r) <= tol && Math.abs(rgb.g - target.g) <= tol && Math.abs(rgb.b - target.b) <= tol
const luminance = (rgb) => rgb === null ? null : (0.2126 * rgb.r + 0.7152 * rgb.g + 0.0722 * rgb.b) / 255

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
await page.goto(`${BASE}/signin`)
await page.locator('input[type=text]').first().fill('admin@nocobase.com')
await page.locator('input[type=password]').first().fill('admin123')
await page.locator('button', { hasText: '登录' }).first().click()
await page.waitForTimeout(5000)

const report = []
const failures = []
for (const [name, uid] of PAGES) {
  await page.goto(`${BASE}/admin/${uid}`)
  await page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {})
  await page.waitForTimeout(2600)
  const probe = await page.evaluate(() => {
    const first = (selector) => document.querySelector(selector)
    const style = (selector, props) => {
      const el = first(selector)
      if (el === null) return null
      const cs = getComputedStyle(el)
      return Object.fromEntries(props.map((prop) => [prop, cs[prop]]))
    }
    // #1677ff residue: inline/attribute HTML plus every stylesheet rule text.
    let residue = 0
    if (document.documentElement.outerHTML.toLowerCase().includes('1677ff')) residue += 1
    for (const sheet of Array.from(document.styleSheets)) {
      let rules
      try { rules = sheet.cssRules } catch { continue }
      for (const rule of Array.from(rules ?? [])) {
        if (String(rule.cssText).toLowerCase().includes('1677ff')) residue += 1
      }
    }
    return {
      primaryBtn: style('.ant-btn-primary', ['background-color']),
      headerTh: style('.ant-table-thead th', ['font-weight', 'font-size', 'color', 'background-color']),
      tag: style('.ant-tag', ['background-color', 'color', 'border-radius']),
      card: style('.ant-card', ['border-radius', 'box-shadow', 'border-top-color']),
      blueResidue: residue,
    }
  })
  // Missing elements (JSBlock pages without tables, v1 pages without antd
  // buttons) are 'n/a' — a page without the component cannot fail its check.
  const checks = { primaryBrand: 'n/a', headerWeight: 'n/a', tagSoft: 'n/a', cardRadius: 'n/a' }
  const btn = parseRgb(probe.primaryBtn?.['background-color'])
  if (btn !== null) checks.primaryBrand = near(btn, BRAND, 2)
  if (probe.headerTh !== null) {
    const weight = Number.parseInt(probe.headerTh['font-weight'] ?? '0', 10)
    checks.headerWeight = weight >= 600
  }
  const tagBg = parseRgb(probe.tag?.['background-color'])
  if (tagBg !== null) checks.tagSoft = luminance(tagBg) >= 0.75
  if (probe.card !== null) {
    const radius = Number.parseInt(probe.card['border-radius'] ?? '0', 10)
    checks.cardRadius = radius === 8
  }
  const entry = { page: name, uid, probe, checks }
  report.push(entry)
  for (const [check, pass] of Object.entries(checks)) {
    if (pass !== 'n/a' && !pass) failures.push(`${name}: ${check} (btn=${probe.primaryBtn?.['background-color']}, th=${probe.headerTh?.['font-weight']}, tag=${probe.tag?.['background-color']}, card=${probe.card?.['border-radius']})`)
  }
  console.log(`${name}: btn=${probe.primaryBtn?.['background-color']} thW=${probe.headerTh?.['font-weight']} tagBg=${probe.tag?.['background-color']} tagR=${probe.tag?.['border-radius']} cardR=${probe.card?.['border-radius']} residue=${probe.blueResidue}`)
}

writeFileSync(OUT, `${JSON.stringify({ pages: report, failures }, null, 2)}\n`)
console.log(failures.length === 0 ? '\nW7-B0 DOM probe: ALL PASS' : `\nW7-B0 DOM probe: ${failures.length} FAILURES\n  - ${failures.join('\n  - ')}`)
await browser.close()
process.exit(failures.length === 0 ? 0 : 1)
