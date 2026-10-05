// W9-B4 probe — the amber-foundation gate rig, derived from the W8 light
// probe (demos/acceptance-w8/w8-b1-light-probe.mjs): every W8 gate semantic
// survives (11 gates — contrast floors, focus-ring declaration, the 40/44
// touch ladder, the 16px input floor, chips spacing), re-measured against the
// Sauce Amber token values, plus the W9-specific gates: the warm-paper canvas
// hit, ≥2 persimmon brand hits in the live DOM, the display/body type-scale
// pair measured on injected elements, the mono numeric track, ≥3 --adm-*
// overrides resolving to the new dials, a keyboard-driven focus-ring
// visibility check, and the dark-track follow pass (canvas/card/ink/brand/
// tab-active/focus-ring re-read after the theme switch + the dark contrast
// floors). Writes the raw JSON next to this script and exits nonzero on any
// gate failure (early-fail: B5 does not start until every gate passes).
// Usage (repo root): node demos/acceptance-w9/w9-b4-light-probe.mjs
import { writeFileSync } from 'node:fs'
import { chromium } from '../../apps/web/node_modules/playwright/index.mjs'

const BASE = 'http://127.0.0.1:3080/mobile.html'
const OUT = 'demos/acceptance-w9/w9-b4-light-probe.json'
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

// -- login surface: the keyboard focus ring + the persimmon CTA -------------
await page.getByPlaceholder('业务账号（如 buyer）').fill('qc_inspector')
await page.getByPlaceholder('业务账号密码').fill('Qc#2026')
// A real Tab press moves focus onto the password field with :focus-visible —
// the declared ring must paint (W9: visibility, not just declaration).
await page.keyboard.press('Tab')
await sleep(150)
const loginProbe = await page.evaluate(() => {
  const el = document.activeElement
  return {
    loginButtonBg: (() => {
      const btn = document.querySelector('.adm-button-primary, button.adm-button')
      return btn === null ? null : getComputedStyle(btn).backgroundColor
    })(),
    focusTargetTag: el === null ? null : el.tagName,
    focusShadow: el === null ? null : getComputedStyle(el).boxShadow,
  }
})

await page.getByRole('button', { name: '登录' }).click()
await page.waitForSelector('nav[aria-label="底部导航"]', { timeout: 30_000 })
await sleep(1200)

// -- home surface: the W8 figure set re-measured on the amber track ---------
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
  // B5 moved the card face onto the two-column stat cells (the hero rides the
  // canvas itself, so the old heroCard sample reads transparent); the sample
  // follows the live card surface.
  const card = cs('[class*="statCell"]', 'background-color')
  const border = cs('[class*="statCell"]', 'border-color')
  const quickRow = document.querySelector('[class*="quickRow"]')
  const firstChip = quickRow === null ? null : quickRow.firstElementChild
  const focusRuleFound = Array.from(document.styleSheets).some((sheet) => {
    let rules
    try { rules = sheet.cssRules } catch { return false }
    return rules !== null && Array.from(rules).some((rule) =>
      rule.selectorText !== undefined && rule.selectorText.includes(':focus-visible'))
  })
  // The persimmon heartbeat: elements whose live color or background-color is
  // exactly the brand persimmon (rgb(180, 83, 10)) on the light track.
  const persimmon = 'rgb(180, 83, 10)'
  const brandHits = Array.from(document.querySelectorAll('.dshm-root *'))
    .filter((el) => {
      const style = getComputedStyle(el)
      return style.color === persimmon || style.backgroundColor === persimmon
    })
    .length
  return {
    theme: document.documentElement.getAttribute('data-theme'),
    values: {
      bg: cs('.dshm-root', 'background-color'),
      card,
      textMain: cs('.dshm-root', 'color'),
      textMuted: cs('[class*="statLabel"], [class*="muted"]', 'color'),
      border,
      tabActiveColor: cs('.adm-tab-bar-item-active', 'color'),
      tabbarBg: cs('nav[aria-label="底部导航"]', 'background-color'),
      focusRingToken: getComputedStyle(root).getPropertyValue('--dshm-focus-ring').trim(),
      linkToken: getComputedStyle(root).getPropertyValue('--dshm-link').trim(),
      inputWellToken: getComputedStyle(root).getPropertyValue('--dshm-muted').trim(),
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
      brandHits,
    },
  }
})

// -- injected measurements: type scale, mono track, --adm-* overrides -------
const injected = await page.evaluate(() => {
  const scratch = document.createElement('div')
  scratch.setAttribute('data-w9-probe', 'scratch')
  scratch.style.cssText = 'position:absolute;left:-9999px;top:0;'
  scratch.innerHTML = [
    '<i id="pDisplay" style="font-size:var(--dshm-fs-display)"></i>',
    '<i id="pBody" style="font-size:var(--dshm-fs-body)"></i>',
    '<i id="pMono" style="font-family:var(--dshm-font-num);font-variant-numeric:tabular-nums"></i>',
    '<i id="pAdmPrimary" style="color:var(--adm-color-primary)"></i>',
    '<i id="pAdmBody" style="background:var(--adm-color-background-body)"></i>',
    '<i id="pAdmRadius" style="border-radius:var(--adm-radius-m)"></i>',
    '<i id="pAdmFs10" style="font-size:var(--adm-font-size-10)"></i>',
  ].join('')
  document.body.appendChild(scratch)
  const cs = (id, prop) => getComputedStyle(scratch.querySelector(id))[prop]
  const result = {
    displayPx: Number.parseFloat(cs('#pDisplay', 'font-size')),
    bodyPx: Number.parseFloat(cs('#pBody', 'font-size')),
    monoFamily: cs('#pMono', 'font-family'),
    monoVariant: cs('#pMono', 'font-variant-numeric'),
    rootTabular: getComputedStyle(document.querySelector('.dshm-root')).fontVariantNumeric,
    admPrimary: cs('#pAdmPrimary', 'color'),
    admBodyBg: cs('#pAdmBody', 'backgroundColor'),
    admRadiusM: cs('#pAdmRadius', 'border-radius'),
    admFs10: Number.parseFloat(cs('#pAdmFs10', 'font-size')),
  }
  scratch.remove()
  return result
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

// -- dark track: flip the theme key and reload; the key tokens must follow --
// (A hash-only goto never reloads the document, so the theme key would go
// unread — the reload is the flip.)
await page.evaluate(() => { localStorage.setItem('dsh-mobile-theme', 'dark') })
await page.goto(`${BASE}#/home`, { waitUntil: 'domcontentloaded' })
await page.reload({ waitUntil: 'domcontentloaded' })
await sleep(1500)
await page.waitForSelector('nav[aria-label="底部导航"]', { timeout: 15_000 })
const dark = await page.evaluate(() => {
  const cs = (selector, prop) => {
    const el = document.querySelector(selector)
    return el === null ? null : getComputedStyle(el)[prop]
  }
  const contrast = (a, b) => {
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
  const root = document.querySelector('.dshm-root')
  const scratch = document.createElement('div')
  scratch.style.cssText = 'position:absolute;left:-9999px;'
  scratch.innerHTML = '<i id="dBrand" style="color:var(--dshm-brand)"></i>'
  document.body.appendChild(scratch)
  const brandResolved = getComputedStyle(scratch.querySelector('#dBrand')).color
  scratch.remove()
  return {
    theme: document.documentElement.getAttribute('data-theme'),
    canvas: cs('.dshm-root', 'background-color'),
    card: cs('[class*="statCell"]', 'background-color'),
    ink: cs('.dshm-root', 'color'),
    brandResolved,
    tabActive: cs('.adm-tab-bar-item-active', 'color'),
    tabbarBg: cs('nav[aria-label="底部导航"]', 'background-color'),
    focusRingToken: root === null ? null : getComputedStyle(root).getPropertyValue('--dshm-focus-ring').trim(),
    textVsCard: contrast(cs('.dshm-root', 'color'), cs('[class*="statCell"]', 'background-color')),
    tabActiveVsTabbar: contrast(cs('.adm-tab-bar-item-active', 'color'), cs('nav[aria-label="底部导航"]', 'background-color')),
  }
})
await page.evaluate(() => { localStorage.setItem('dsh-mobile-theme', 'light') })

const probe = {
  ...home,
  login: loginProbe,
  injected,
  surfaces: {
    work: { ...work, linkVsCardContrast: work.linkColor === undefined ? null : contrastOf(work.linkColor, work.cardBg) },
    chats,
  },
  dark,
}
if (chats !== null) {
  probe.checks.searchBarPx = chats.searchBarPx
  probe.checks.inputFloorPx = chats.inputFloorPx
}
// The light-track input wells ride card2 against the card face (login/
// field-widget/search fills); the dial reads back as a var() reference, so
// the gate compares the token values directly.
probe.checks.inputVsCardStep = stepOf(home.values.inputWellToken, home.values.card)

// -- gates: W8 semantics 1–11, W9-specific 12–19 -----------------------------
const c = probe.checks
const admSamplesPassed = [
  probe.injected.admPrimary === 'rgb(180, 83, 10)',
  probe.injected.admBodyBg === 'rgb(251, 245, 235)',
  probe.injected.admRadiusM === '14px',
  Number.isFinite(probe.injected.admFs10) && probe.injected.admFs10 === 44,
].filter(Boolean).length
const gates = [
  // W8 semantics (all preserved, thresholds re-anchored to the amber values)
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
  // W9-specific gates
  ['focusRingVisible(kbd)', probe.login.focusShadow !== null
    && /rgba\(180, 83, 10, 0?\.4\)/.test(probe.login.focusShadow)],
  ['canvasWarmPaper #fbf5eb', probe.values.bg === 'rgb(251, 245, 235)'],
  ['brandPersimmonHits≥2', c.brandHits !== null && c.brandHits >= 2],
  ['typeScale display30/body14', probe.injected.displayPx === 30 && probe.injected.bodyPx === 14],
  ['monoNumTrack tabular', probe.injected.monoFamily.includes('SF Mono')
    && probe.injected.monoVariant.includes('tabular-nums')
    && probe.injected.rootTabular.includes('tabular-nums')],
  ['admOverrideSample≥3', admSamplesPassed >= 3],
  ['darkFollows tokens', probe.dark.theme === 'dark'
    && probe.dark.canvas === 'rgb(25, 19, 16)'
    && probe.dark.card === 'rgb(42, 34, 28)'
    && probe.dark.ink === 'rgb(242, 227, 211)'
    && probe.dark.brandResolved === 'rgb(229, 139, 74)'
    && probe.dark.tabActive === 'rgb(240, 154, 94)'
    && /rgba\(229, 139, 74, (?:0\.55|\.55)\)/.test(probe.dark.focusRingToken)],
  ['darkContrast text≥4.5/tab≥3', probe.dark.textVsCard !== null && probe.dark.textVsCard >= 4.5
    && probe.dark.tabActiveVsTabbar !== null && probe.dark.tabActiveVsTabbar >= 3],
]
probe.gates = gates.map(([name, ok]) => ({ name, ok: Boolean(ok) }))
probe.summary = {
  admOverrideSamplesPassed: admSamplesPassed,
  brandHits: c.brandHits,
}
const failed = probe.gates.filter((gate) => !gate.ok)
writeFileSync(OUT, `${JSON.stringify(probe, null, 2)}\n`)
console.log(JSON.stringify(probe, null, 2))
console.log(`w9-b4 probe: ${probe.gates.length - failed.length}/${probe.gates.length} gates pass${failed.length === 0 ? ' — ALL PASS' : ` — FAILED: ${failed.map((gate) => gate.name).join(', ')}`}`)
await browser.close()
process.exit(failed.length === 0 ? 0 : 1)
