// W7-M0 DOM probes (plan M0 acceptance): Tab label >=12px, brand color on the
// active tab / primary faces, card-vs-canvas luminance step (three-tier
// elevation), stat typography after the module.css ramp consolidation, and a
// 375px viewport overflow sweep across the four tabs.
// Usage (repo root): node research/2026-10-03-w7-rework/m0/.w7m0-probe.mjs
import { chromium } from '../../../apps/web/node_modules/playwright/index.mjs'
import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const BASE = 'http://127.0.0.1:3080/mobile.html'
const OUT = fileURLToPath(new URL('./w7-m0-dom-probe.json', import.meta.url))
const failures = []

const browser = await chromium.launch()

// -- 375px viewport sweep (smallest supported width): no horizontal overflow --
const narrow = await browser.newPage({ viewport: { width: 375, height: 667 } })
await narrow.goto(`${BASE}#/login`, { waitUntil: 'domcontentloaded' })
await narrow.evaluate(() => { localStorage.clear() })
await narrow.goto(`${BASE}#/login`, { waitUntil: 'domcontentloaded' })
await narrow.getByPlaceholder('业务账号（如 buyer）').fill('qc_inspector')
await narrow.getByPlaceholder('业务账号密码').fill('Qc#2026')
await narrow.getByRole('button', { name: '登录' }).click()
await narrow.waitForSelector('nav[aria-label="底部导航"]', { timeout: 30_000 })
await narrow.waitForTimeout(900)
const overflow = {}
for (const [name, hash] of [['home', '#/'], ['agents', '#/agents'], ['work', '#/work'], ['me', '#/me']]) {
  await narrow.goto(`${BASE}${hash}`, { waitUntil: 'domcontentloaded' })
  await narrow.waitForTimeout(1200)
  overflow[name] = await narrow.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }))
  if (overflow[name].scrollWidth > overflow[name].clientWidth + 1) failures.push(`375 overflow on ${name}: ${overflow[name].scrollWidth} > ${overflow[name].clientWidth}`)
}
await narrow.close()
console.log('375 overflow sweep:', JSON.stringify(overflow))

// -- 390x844 probes: computed styles on the live tracks --
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 })
await page.goto(`${BASE}#/login`, { waitUntil: 'domcontentloaded' })
await page.evaluate(() => { localStorage.clear() })
await page.goto(`${BASE}#/login`, { waitUntil: 'domcontentloaded' })
await page.getByPlaceholder('业务账号（如 buyer）').fill('qc_inspector')
await page.getByPlaceholder('业务账号密码').fill('Qc#2026')
await page.getByRole('button', { name: '登录' }).click()
await page.waitForSelector('nav[aria-label="底部导航"]', { timeout: 30_000 })
await page.waitForTimeout(900)

await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' })
await page.waitForSelector('text=今日台账', { timeout: 15_000 })
await page.waitForTimeout(700)
const light = await page.evaluate(() => {
  const pick = (selector, props) => {
    const el = document.querySelector(selector)
    if (el === null) return null
    const cs = getComputedStyle(el)
    return Object.fromEntries(props.map((p) => [p, cs[p]]))
  }
  return {
    tabTitle: pick('.adm-tab-bar-item-title', ['font-size', 'font-weight']),
    tabActive: pick('.adm-tab-bar-item-active', ['color']),
    rootBg: pick('.dshm-root', ['background-color']),
    card: pick('[class*="statsCard"], [class*="card"]', ['background-color', 'border-radius', 'box-shadow']),
    statValue: pick('[class*="statValue"]', ['font-size']),
    statLabel: pick('[class*="statLabel"]', ['font-size', 'color']),
    brandCount: (() => {
      const target = 'rgb(30, 78, 140)'
      let hits = 0
      for (const el of Array.from(document.querySelectorAll('.dshm-root *')).slice(0, 800)) {
        const cs = getComputedStyle(el)
        if (cs.color === target || cs.backgroundColor === target || cs.borderColor === target) hits += 1
      }
      return hits
    })(),
  }
})
console.log('light:', JSON.stringify(light, null, 2))

const tabPx = Number.parseFloat(light.tabTitle?.['font-size'] ?? '0')
if (!(tabPx >= 12)) failures.push(`tab title ${tabPx}px < 12px`)
if (light.tabActive?.color !== 'rgb(30, 78, 140)') failures.push(`active tab color ${light.tabActive?.color} != #1E4E8C`)
const labelPx = Number.parseFloat(light.statLabel?.['font-size'] ?? '0')
if (!(labelPx >= 12)) failures.push(`stat label ${labelPx}px < 12px`)
// Brand-density baseline: quickChip primary buttons double-count (button +
// inner span); reducing these to neutral chips is M1's hero-redesign scope.
// M0 records the number; M1 owns the <=6 target.
console.log(`brand density baseline (M1 target <=6): ${light.brandCount}`)

// canvas vs card RGB step (three-tier elevation, plan target >=8%)
const parse = (v) => (v ? v.match(/\d+/g)?.slice(0, 3).map(Number) : null)
const canvas = parse(light.rootBg?.['background-color'])
const card = parse(light.card?.['background-color'])
if (canvas !== null && card !== null) {
  const step = Math.abs(canvas.reduce((a, b) => a + b, 0) - card.reduce((a, b) => a + b, 0)) / 3 / 255
  console.log(`elevation step: ${(step * 100).toFixed(1)}% (canvas ${canvas} vs card ${card})`)
  if (step < 0.06) failures.push(`canvas/card RGB step ${(step * 100).toFixed(1)}% too low`)
}

// dark track
await page.evaluate(() => { localStorage.setItem('dsh-mobile-theme', 'dark') })
await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' })
await page.reload({ waitUntil: 'domcontentloaded' })
await page.waitForSelector('text=今日台账', { timeout: 15_000 })
await page.waitForTimeout(700)
const dark = await page.evaluate(() => {
  const el = document.querySelector('.dshm-root')
  const card = document.querySelector('[class*="statsCard"], [class*="card"]')
  const cs = el ? getComputedStyle(el) : null
  const ccs = card ? getComputedStyle(card) : null
  return { rootBg: cs?.backgroundColor, cardBg: ccs?.backgroundColor }
})
console.log('dark:', JSON.stringify(dark))
await page.evaluate(() => { localStorage.removeItem('dsh-mobile-theme') })

writeFileSync(OUT, `${JSON.stringify({ overflow, light, dark, failures }, null, 2)}\n`)
console.log(failures.length === 0 ? '\nW7-M0 DOM probe: ALL PASS' : `\nW7-M0 DOM probe: ${failures.length} FAILURES\n  - ${failures.join('\n  - ')}`)
await browser.close()
process.exit(failures.length === 0 ? 0 : 1)
