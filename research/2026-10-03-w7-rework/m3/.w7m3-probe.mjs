// W7-M3 dark-track DOM probe (contrast / elevation / border / tab size).
// Runs after .w7m3-shot.mjs; writes the raw JSON to stdout for the acceptance
// log. Rig: dark theme key in localStorage, qc_inspector sign-in, home surface.
// R1 seventh gate (stamp): routes to a real #/work/:id whose item is `doing`
// — the device store is demo-seeded with no guaranteed doing item, so the
// probe appends one synthetic row (id w_probe_doing, demo:true) only when
// absent, then measures the work stamp's computed color against the ticket
// head's card background (both from getComputedStyle — the token chain
// --dshm-stamp-doing resolves through CSS, so the figure is the rendered
// truth, ≥3.0 per WCAG 1.4.11 on the hollow seal).
// Usage (repo root): node research/2026-10-03-w7-rework/m3/.w7m3-probe.mjs
import { chromium } from '../../../apps/web/node_modules/playwright/index.mjs'

const BASE = 'http://127.0.0.1:3080/mobile.html'
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
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 })
await page.goto(`${BASE}#/login`, { waitUntil: 'domcontentloaded' })
await page.evaluate(() => {
  localStorage.clear()
  localStorage.setItem('dsh-mobile-theme', 'dark')
})
await page.reload({ waitUntil: 'domcontentloaded' })
await page.getByText('食链通').first().waitFor({ timeout: 15_000 })
await page.getByPlaceholder('业务账号（如 buyer）').fill('qc_inspector')
await page.getByPlaceholder('业务账号密码').fill('Qc#2026')
await page.getByRole('button', { name: '登录' }).click()
await page.waitForSelector('nav[aria-label="底部导航"]', { timeout: 30_000 })
await sleep(1000)

const probe = await page.evaluate(() => {
  const lum = (r, g, b) => {
    const f = (c) => { const s = c / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4 }
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b)
  }
  const parse = (value) => {
    const m = /rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/.exec(value)
    if (m === null) return null
    return { r: Number(m[1]), g: Number(m[2]), b: Number(m[3]), a: m[4] === undefined ? 1 : Number(m[4]) }
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
  const rootCard = cs('[class*="statsCard"], [class*="card"]', 'background-color')
  const rootBg = cs('.dshm-root', 'background-color')
  const textMain = cs('.dshm-root', 'color')
  const cardBorder = cs('[class*="statsCard"], [class*="card"]', 'border-color')
  const muted = cs('[class*="statLabel"], [class*="muted"]', 'color')
  const tabTitle = cs('.adm-tab-bar-item-title', 'font-size')
  const tabActive = cs('.adm-tab-bar-item-active', 'color')
  return {
    theme: document.documentElement.getAttribute('data-theme'),
    values: {
      bg: rootBg,
      card: rootCard,
      textMain,
      textMuted: muted,
      border: cardBorder,
      tabTitleSize: tabTitle,
      tabActiveColor: tabActive,
    },
    checks: {
      cardVsBgElevationStep: rgbStep(rootCard, rootBg),
      textVsCardContrast: contrast(textMain, rootCard),
      mutedVsCardContrast: contrast(muted, rootCard),
      borderVsCardStep: rgbStep(cardBorder, rootCard),
      tabTitlePx: tabTitle === null ? null : Number.parseFloat(tabTitle),
      tabActiveVsTabbarContrast: contrast(tabActive, cs('nav[aria-label="底部导航"]', 'background-color')),
    },
  }
})
const homeProbe = probe

// -- seventh gate: the doing work stamp on a real #/work/:id detail ---------
await page.goto(`${BASE}#/work`, { waitUntil: 'domcontentloaded' })
await page.waitForSelector('[aria-label="工作列表"]', { timeout: 15_000 })
await sleep(900)
const doingId = await page.evaluate(() => {
  const raw = localStorage.getItem('dsh-mobile-work') ?? ''
  let shape
  try { shape = JSON.parse(raw) } catch { return null }
  if (shape === null || !Array.isArray(shape.items)) return null
  const existing = shape.items.find((item) => item.status === 'doing')
  if (existing !== undefined) return String(existing.id)
  const now = Date.now()
  const synthetic = {
    id: 'w_probe_doing', title: '印章对比度探针工作项', owner: 'qc_inspector', due: undefined,
    suggestion: undefined, status: 'doing', sourceSessionId: undefined, sourceAnchor: undefined,
    execSessionId: undefined, result: undefined, artifact: undefined, pinned: false,
    demo: true, createdAt: now, updatedAt: now,
  }
  shape.items = [...shape.items, synthetic]
  localStorage.setItem('dsh-mobile-work', JSON.stringify(shape))
  return synthetic.id
})
let stampProbe = null
if (doingId === null) {
  stampProbe = { error: 'work store unreadable — cannot mount a doing detail' }
} else {
  await page.goto(`${BASE}#/work/${doingId}`, { waitUntil: 'domcontentloaded' })
  await sleep(1400)
  stampProbe = await page.evaluate((doingIdArg) => {
    const stamp = document.querySelector('[data-testid="work-stamp"][data-status="doing"]')
    if (stamp === null) return { error: 'doing work stamp not mounted on the detail route' }
    const head = stamp.closest('section')
    return {
      id: doingIdArg,
      stampColor: getComputedStyle(stamp).color,
      cardBg: head === null ? null : getComputedStyle(head).backgroundColor,
      stampToken: getComputedStyle(document.querySelector('.dshm-root')).getPropertyValue('--dshm-stamp-doing').trim(),
    }
  }, doingId)
  if (stampProbe.error === undefined) {
    stampProbe.stampDoingVsCardContrast = contrastOf(stampProbe.stampColor, stampProbe.cardBg)
  }
  if (stampProbe.error === undefined) {
    homeProbe.values.stampDoing = stampProbe.stampColor
    homeProbe.values.stampDoingToken = stampProbe.stampToken
    homeProbe.checks.stampDoingVsCardContrast = stampProbe.stampDoingVsCardContrast
  }
}
homeProbe.stampLeg = stampProbe
console.log(JSON.stringify(homeProbe, null, 2))
await browser.close()
process.exit(0)
