// W8-B1 light-track DOM probe — the light twin of the W7 dark probe
// (research/2026-10-03-w7-rework/m3/.w7m3-probe.mjs): the same computed-style
// truth chain (tokens resolve through CSS, so getComputedStyle reads the
// rendered values) asserted on the light track, plus the W8 B1 increments
// that only exist as DOM facts — the focus-ring declaration, the link grade
// on a live tappable word, the 40px secondary / 44px primary touch ladder,
// the 16px input floor, and the ≥8px spacing between adjacent chips.
// Rig: light theme key in localStorage, qc_inspector sign-in, home → work →
// chats surfaces. Writes the raw JSON next to this script and exits nonzero
// on any gate failure.
// Usage (repo root): node demos/acceptance-w8/w8-b1-light-probe.mjs
import { writeFileSync } from 'node:fs'
import { chromium } from '../../apps/web/node_modules/playwright/index.mjs'

const BASE = 'http://127.0.0.1:3080/mobile.html'
const OUT = 'demos/acceptance-w8/w8-b1-light-probe.json'
const sleep = (ms) => new Promise((resolve) => { setTimeout(resolve, ms) })

/** WCAG relative-luminance contrast of two css color strings (Node side —
 * functions do not survive page.evaluate's structured clone). */
const contrastOf = (a, b) => {
  const parse = (value) => {
    const m = /rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/.exec(value)
    return m === null ? null : { r: Number(m[1]), g: Number(m[2]), b: Number(m[3]) }
  }
  const x = parse(a); const y = parse(b)
  if (x === null || y === null) return null
  const lum = (p) => {
    const f = (c) => { const s = c / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4 }
    return 0.2126 * f(p.r) + 0.7152 * f(p.g) + 0.0722 * f(p.b)
  }
  const l1 = lum(x); const l2 = lum(y)
  const [hi, lo] = l1 >= l2 ? [l1, l2] : [l2, l1]
  return Number(((hi + 0.05) / (lo + 0.05)).toFixed(2))
}

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 2 })
await page.goto(`${BASE}#/login`, { waitUntil: 'domcontentloaded' })
await page.evaluate(() => {
  localStorage.clear()
  localStorage.setItem('dsh-mobile-theme', 'light')
})
await page.reload({ waitUntil: 'domcontentloaded' })
await page.getByText('食链通').first().waitFor({ timeout: 15_000 })
await page.getByPlaceholder('业务账号（如 buyer）').fill('qc_inspector')
await page.getByPlaceholder('业务账号密码').fill('Qc#2026')
await page.getByRole('button', { name: '登录' }).click()
await page.waitForSelector('nav[aria-label="底部导航"]', { timeout: 30_000 })
await sleep(1200)

// -- home surface: the W7 dark-probe figure set + the W8 DOM facts ----------
const home = await page.evaluate(() => {
  const parse = (value) => {
    const m = /rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/.exec(value)
    if (m === null) return null
    return { r: Number(m[1]), g: Number(m[2]), b: Number(m[3]), a: m[4] === undefined ? 1 : Number(m[4]) }
  }
  const lum = (r, g, b) => {
    const f = (c) => { const s = c / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4 }
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b)
  }
  const contrast = (a, b) => {
    const x = parse(a); const y = parse(b)
    if (x === null || y === null) return null
    const l1 = lum(x.r, x.g, x.b); const l2 = lum(y.r, y.g, y.b)
    const [hi, lo] = l1 >= l2 ? [l1, l2] : [l2, l1]
    return Number(((hi + 0.05) / (lo + 0.05)).toFixed(2))
  }
  const rgbStep = (a, b) => {
    const x = parse(a); const y = parse(b)
    if (x === null || y === null) return null
    return Math.round((Math.abs(x.r - y.r) + Math.abs(x.g - y.g) + Math.abs(x.b - y.b)) / 3)
  }
  const cs = (selector, prop) => {
    const el = document.querySelector(selector)
    return el === null ? null : getComputedStyle(el)[prop]
  }
  const root = document.querySelector('.dshm-root')
  const card = cs('[class*="statsCard"], [class*="heroCard"]', 'background-color')
  const border = cs('[class*="statsCard"], [class*="heroCard"]', 'border-color')
  const quickRow = document.querySelector('[class*="quickRow"]')
  const firstChip = quickRow === null ? null : quickRow.firstElementChild
  // The focus ring's declared truth: the token resolves and a :focus-visible
  // rule carrying it exists in the live stylesheets.
  const focusRuleFound = Array.from(document.styleSheets).some((sheet) => {
    let rules
    try { rules = sheet.cssRules } catch { return false }
    return rules !== null && Array.from(rules).some((rule) =>
      rule.selectorText !== undefined && rule.selectorText.includes(':focus-visible'))
  })
  return {
    theme: document.documentElement.getAttribute('data-theme'),
    values: {
      bg: cs('.dshm-root', 'background-color'),
      card,
      textMain: cs('.dshm-root', 'color'),
      textMuted: cs('[class*="statLabel"], [class*="muted"]', 'color'),
      border,
      tabActiveColor: cs('.adm-tab-bar-item-active', 'color'),
      focusRingToken: getComputedStyle(root).getPropertyValue('--dshm-focus-ring').trim(),
      linkToken: getComputedStyle(root).getPropertyValue('--dshm-link').trim(),
      inputMutedToken: getComputedStyle(root).getPropertyValue('--dshm-muted').trim(),
      chipsGap: quickRow === null ? null : getComputedStyle(quickRow).columnGap,
      chipHeight: firstChip === null ? null : firstChip.getBoundingClientRect().height,
    },
    checks: {
      textVsCardContrast: contrast(cs('.dshm-root', 'color'), card),
      mutedVsCardContrast: contrast(cs('[class*="statLabel"], [class*="muted"]', 'color'), card),
      cardVsBgElevationStep: rgbStep(card, cs('.dshm-root', 'background-color')),
      borderVsCardStep: rgbStep(border, card),
      tabActiveVsTabbarContrast: contrast(cs('.adm-tab-bar-item-active', 'color'), cs('nav[aria-label="底部导航"]', 'background-color')),
      focusRuleFound,
      chipsGapPx: quickRow === null ? null : Number.parseFloat(getComputedStyle(quickRow).columnGap),
      touchSmPx: firstChip === null ? null : Number(firstChip.getBoundingClientRect().height.toFixed(1)),
    },
  }
})

// -- work surface: the link grade on a live tappable word -------------------
await page.goto(`${BASE}#/work`, { waitUntil: 'domcontentloaded' })
await page.waitForSelector('[aria-label="工作列表"]', { timeout: 15_000 })
await sleep(1000)
const work = await page.evaluate(() => {
  const go = document.querySelector('[class*="toolGo"]')
  const card = document.querySelector('[class*="toolCard"]')
  if (go === null || card === null) return { linkVsCardContrast: null, linkColor: null }
  return {
    linkColor: getComputedStyle(go).color,
    cardBg: getComputedStyle(card).backgroundColor,
  }
})

// -- chats surface: the 44px search entry + the 16px input floor ------------
await page.goto(`${BASE}#/chats`, { waitUntil: 'domcontentloaded' })
await sleep(1200)
const chats = await page.evaluate(() => {
  const bar = document.querySelector('[class*="searchBar"]')
  const input = document.querySelector('[class*="searchBar"] input, .adm-search-bar input')
  if (bar === null) return null
  const rect = bar.getBoundingClientRect()
  return {
    searchBarPx: rect === null ? null : Number(rect.height.toFixed(1)),
    inputFloorPx: input === null ? null : Number.parseFloat(getComputedStyle(input).fontSize),
    inputBg: getComputedStyle(bar).getPropertyValue('--background').trim(),
    headerBg: getComputedStyle(document.querySelector('main')).backgroundColor,
  }
})

const parseOf = (value) => {
  if (typeof value !== 'string') return null
  const m = /rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/.exec(value)
  if (m !== null) return { r: Number(m[1]), g: Number(m[2]), b: Number(m[3]) }
  const h = /^#?([0-9a-f]{6})$/i.exec(value.trim())
  if (h === null) return null
  const n = Number.parseInt(h[1], 16)
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 }
}
const stepOf = (a, b) => {
  const x = parseOf(a); const y = parseOf(b)
  if (x === null || y === null) return null
  return Math.round((Math.abs(x.r - y.r) + Math.abs(x.g - y.g) + Math.abs(x.b - y.b)) / 3)
}

const probe = {
  ...home,
  surfaces: {
    work: { ...work, linkVsCardContrast: work.linkColor === undefined ? null : contrastOf(work.linkColor, work.cardBg) },
    chats,
  },
}
if (chats !== null) {
  probe.checks.searchBarPx = chats.searchBarPx
  probe.checks.inputFloorPx = chats.inputFloorPx
}
// The light-track input wells ride --dshm-muted against the --dshm-card face
// (login/field-widget/search fills); the dial itself would read back as a
// var() reference, so the gate compares the token values directly.
probe.checks.inputVsCardStep = stepOf(home.values.inputMutedToken, home.values.card)

// -- gates -------------------------------------------------------------------
const c = probe.checks
const gates = [
  ['theme-light', probe.theme === 'light'],
  ['textVsCard≥4.5', c.textVsCardContrast !== null && c.textVsCardContrast >= 4.5],
  ['mutedVsCard≥4.5', c.mutedVsCardContrast !== null && c.mutedVsCardContrast >= 4.5],
  ['linkVsCard≥4.5', probe.surfaces.work.linkVsCardContrast !== null && probe.surfaces.work.linkVsCardContrast >= 4.5],
  ['inputVsCardStep≥8', c.inputVsCardStep !== null && c.inputVsCardStep >= 8],
  ['tabActiveVsTabbar≥3', c.tabActiveVsTabbarContrast !== null && c.tabActiveVsTabbarContrast >= 3],
  ['focus-ring declared', c.focusRuleFound === true && probe.values.focusRingToken !== ''],
  ['chipsGapPx≥8', c.chipsGapPx !== null && c.chipsGapPx >= 8],
  ['touchSmPx≥40', c.touchSmPx !== null && c.touchSmPx >= 40],
  ['searchBarPx≥44', c.searchBarPx !== null && c.searchBarPx >= 44],
  ['inputFloorPx≥16', c.inputFloorPx !== null && c.inputFloorPx >= 16],
]
probe.gates = gates.map(([name, ok]) => ({ name, ok: Boolean(ok) }))
const failed = probe.gates.filter((gate) => !gate.ok)
writeFileSync(OUT, `${JSON.stringify(probe, null, 2)}\n`)
console.log(JSON.stringify(probe, null, 2))
console.log(`w8-b1 light probe: ${probe.gates.length - failed.length}/${probe.gates.length} gates pass${failed.length === 0 ? ' — ALL PASS' : ` — FAILED: ${failed.map((gate) => gate.name).join(', ')}`}`)
await browser.close()
process.exit(failed.length === 0 ? 0 : 1)
