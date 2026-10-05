// W10-B1 DOM re-verification probe: objective computed-style evidence for the
// P0/P1 findings the VLM reports. Per route it collects (A) native controls
// whose UA defaults survive (appearance/accent-color/border-radius), (B) the
// border-radius/background border shape set of buttons (consistency check),
// (C) horizontal overflow at document and element level, and (D) an
// approximate WCAG contrast ratio for leaf text nodes. Evidence lands in
// .w10-b1-dom-probe.json for per-issue tagging.
// Usage (repo root): node demos/acceptance-w10/.dom-probe-w10b1.mjs
import { writeFileSync } from 'node:fs'
import { chromium } from '../../apps/web/node_modules/playwright/index.mjs'

const BASE = 'http://127.0.0.1:3080/mobile.html'
const OUT = 'demos/acceptance-w10'
const sleep = (ms) => new Promise((resolve) => { setTimeout(resolve, ms) })

const ROUTES = [
  { hash: '#/home', route: 'home-375-light', theme: 'light', account: 'qc_inspector', password: 'Qc#2026' },
  { hash: '#/chats', route: 'chats-375-light', theme: 'light', account: 'qc_inspector', password: 'Qc#2026' },
  { hash: '#/tasks', route: 'tasks-375-light', theme: 'light', account: 'qc_inspector', password: 'Qc#2026' },
  { hash: '#/files', route: 'files-375-light', theme: 'light', account: 'qc_inspector', password: 'Qc#2026' },
  { hash: '#/agents', route: 'agents-375-light', theme: 'light', account: 'qc_inspector', password: 'Qc#2026' },
  { hash: '#/me', route: 'me-375-light', theme: 'light', account: 'qc_inspector', password: 'Qc#2026' },
  { hash: '#/todos', route: 'todos-375-light', theme: 'light', account: 'qc_inspector', password: 'Qc#2026' },
  { hash: '#/alerts', route: 'alerts-375-light', theme: 'light', account: 'qc_inspector', password: 'Qc#2026' },
  { hash: '#/docs', route: 'docs-375-light', theme: 'light', account: 'qc_inspector', password: 'Qc#2026' },
  { hash: '#/home', route: 'home-375-dark', theme: 'dark', account: 'qc_inspector', password: 'Qc#2026' },
  { hash: '#/work', route: 'work-375-dark', theme: 'dark', account: 'qc_inspector', password: 'Qc#2026' },
  { hash: '#/me', route: 'me-375-dark', theme: 'dark', account: 'qc_inspector', password: 'Qc#2026' },
  { hash: '#/home', route: 'home-390-light', theme: 'light', account: 'qc_inspector', password: 'Qc#2026', width: 390 },
  { hash: '#/todos', route: 'todos-390-light', theme: 'light', account: 'qc_inspector', password: 'Qc#2026', width: 390 },
]

const PROBE = () => {
  const lum = (r, g, b) => {
    const f = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4 }
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b)
  }
  const parseColor = (s) => {
    const m = s.match(/rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?\)/)
    if (!m) return null
    return { r: +m[1], g: +m[2], b: +m[3], a: m[4] === undefined ? 1 : +m[4] }
  }
  const resolveBg = (el) => {
    let node = el
    while (node && node instanceof Element) {
      const c = parseColor(getComputedStyle(node).backgroundColor)
      if (c && c.a > 0.85) return c
      node = node.parentElement
    }
    return { r: 255, g: 255, b: 255, a: 1 }
  }
  const visible = (el) => {
    const r = el.getBoundingClientRect()
    if (r.width === 0 || r.height === 0) return false
    const s = getComputedStyle(el)
    return s.visibility !== 'hidden' && s.display !== 'none'
  }

  // A. Native controls with surviving UA defaults
  const nativeSelectors = 'select, input[type=checkbox], input[type=radio], input[type=date], input[type=time], input[type=datetime-local], input[type=file], input[type=range], progress, meter, textarea'
  const nativeControls = [...document.querySelectorAll(nativeSelectors)].filter(visible).map((el) => {
    const s = getComputedStyle(el)
    return {
      tag: el.tagName.toLowerCase(), type: el.getAttribute('type') ?? '',
      appearance: s.appearance, accentColor: s.accentColor,
      borderRadius: s.borderRadius, border: s.border,
      bg: s.backgroundColor, font: s.fontFamily.slice(0, 60),
      text: (el.value || el.textContent || '').slice(0, 24),
    }
  })

  // A2. Unstyled-looking buttons (appearance auto / default bg)
  const buttons = [...document.querySelectorAll('button')].filter(visible)
  const buttonShapes = {}
  for (const b of buttons) {
    const s = getComputedStyle(b)
    const key = `${s.borderRadius}|${s.border}|${s.backgroundColor}`
    buttonShapes[key] = (buttonShapes[key] ?? 0) + 1
  }

  // B. Horizontal overflow: document level + offscreen elements
  const docOverflow = document.documentElement.scrollWidth - document.documentElement.clientWidth
  const offscreen = []
  for (const el of document.querySelectorAll('body *')) {
    if (!visible(el)) continue
    const r = el.getBoundingClientRect()
    if (r.width > 0 && (r.right > window.innerWidth + 1.5 || r.left < -1.5)) {
      offscreen.push({
        tag: el.tagName.toLowerCase(), cls: String(el.className).slice(0, 60),
        left: Math.round(r.left), right: Math.round(r.right),
        text: (el.textContent || '').trim().slice(0, 30),
      })
      if (offscreen.length >= 12) break
    }
  }

  // C. Low-contrast leaf text (approximate WCAG)
  const lowContrast = []
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
  const seen = new Set()
  let node
  while ((node = walker.nextNode()) !== null) {
    const text = node.textContent.trim()
    if (text === '' || seen.has(node.parentElement)) continue
    const el = node.parentElement
    seen.add(el)
    if (!visible(el)) continue
    const s = getComputedStyle(el)
    if (s.fontSize && parseFloat(s.fontSize) < 1) continue
    const fg = parseColor(s.color)
    if (!fg) continue
    const bg = resolveBg(el)
    const l1 = lum(fg.r, fg.g, fg.b)
    const l2 = lum(bg.r, bg.g, bg.b)
    const ratio = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05)
    if (ratio < 3.2) {
      lowContrast.push({ text: text.slice(0, 30), ratio: +ratio.toFixed(2), color: s.color, bg: `rgb(${bg.r},${bg.g},${bg.b})`, fontSize: s.fontSize })
      if (lowContrast.length >= 15) break
    }
  }

  // D. Vertical text clipping (scrollHeight far above clientHeight, no ellipsis)
  const clipped = []
  for (const el of document.querySelectorAll('body *')) {
    if (!visible(el) || el.children.length > 0) continue
    if (el.scrollHeight > el.clientHeight + 4 && el.clientHeight > 8) {
      const s = getComputedStyle(el)
      if (s.overflow === 'hidden' || s.webkitLineClamp !== 'none') {
        clipped.push({ tag: el.tagName.toLowerCase(), cls: String(el.className).slice(0, 50), text: (el.textContent || '').trim().slice(0, 26) })
        if (clipped.length >= 10) break
      }
    }
  }

  return {
    viewport: { w: window.innerWidth, h: window.innerHeight },
    nativeControls, buttonShapeCount: Object.keys(buttonShapes).length, buttonShapes,
    docOverflowPx: docOverflow, offscreen, lowContrast, clipped,
    scrollbar: { body: getComputedStyle(document.body).scrollbarWidth ?? '', hasCustomWebkitRule: null },
  }
}

const browser = await chromium.launch()
const results = []
for (const r of ROUTES) {
  const width = r.width ?? 375
  const context = await browser.newContext({ viewport: { width, height: width === 375 ? 812 : 844 }, deviceScaleFactor: 2 })
  const page = await context.newPage()
  await page.goto(`${BASE}#/login`, { waitUntil: 'domcontentloaded' })
  await page.evaluate((theme) => {
    localStorage.clear()
    localStorage.setItem('dsh-mobile-theme', theme)
  }, r.theme)
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.getByPlaceholder('业务账号（如 buyer）').fill(r.account)
  await page.getByPlaceholder('业务账号密码').fill(r.password)
  await page.getByRole('button', { name: '登录' }).click()
  await page.waitForSelector('nav[aria-label="底部导航"]', { timeout: 30_000 })
  await page.goto(`${BASE}${r.hash}`, { waitUntil: 'domcontentloaded' })
  await sleep(2000)
  const probe = await page.evaluate(PROBE)
  results.push({ route: r.route, ...probe })
  console.log(`probe: ${r.route} — native=${probe.nativeControls.length} overflow=${probe.docOverflowPx} offscreen=${probe.offscreen.length} lowc=${probe.lowContrast.length} btnShapes=${probe.buttonShapeCount}`)
  await context.close()
}
await browser.close()
writeFileSync(`${OUT}/.w10-b1-dom-probe.json`, JSON.stringify({ generatedAt: new Date().toISOString(), routes: results }, null, 2))
console.log('DOM probe 落盘完成')
