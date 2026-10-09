// W24 audit2 DOM cross-check: verify/refute the VLM-flagged items against
// live geometry (the VLM pass hallucinates; the DOM is the arbiter).
// Usage: node demos/acceptance-w24/w24-audit-verify.mjs
import { writeFileSync } from 'node:fs'
import { chromium } from '../../apps/web/node_modules/playwright/index.mjs'

const BASE = 'http://127.0.0.1:3080/mobile.html'
const OUT = 'demos/acceptance-w24'
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 375, height: 812 } })
await page.goto(`${BASE}#/login`, { waitUntil: 'domcontentloaded' })
await page.evaluate(() => { localStorage.clear(); localStorage.setItem('dsh-mobile-theme', 'light') })
await page.reload({ waitUntil: 'domcontentloaded' })
await page.getByPlaceholder('业务账号（如 buyer）').fill('buyer')
await page.getByPlaceholder('业务账号密码').fill('Buyer#2026')
await page.getByRole('button', { name: '登录' }).click()
await page.waitForSelector('nav[aria-label="底部导航"]', { timeout: 30_000 })
await page.waitForTimeout(1500)

// home: quick-action label wrapping + AI-colleague icon label wrapping + hero badge overlap
await page.goto(`${BASE}#/`, { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(2000)
const homeProbe = await page.evaluate(() => {
  const labelOf = (text) => [...document.querySelectorAll('main button, main a, main span')]
    .find((el) => (el.textContent ?? '').trim().startsWith(text) && el.children.length <= 2)
  const wrap = (el) => {
    if (el === undefined) return null
    const cs = getComputedStyle(el)
    const r = el.getBoundingClientRect()
    return {
      text: (el.textContent ?? '').trim().slice(0, 16),
      w: Math.round(r.width), h: Math.round(r.height),
      lines: cs.lineHeight === 'normal' ? null : Math.round(r.height / Number.parseFloat(cs.lineHeight)),
      whiteSpace: cs.whiteSpace, fontSize: cs.fontSize,
    }
  }
  return {
    registerLabel: wrap(labelOf('登记一条单据')),
    colleagueLabels: [...document.querySelectorAll('main button')].filter((b) => (b.textContent ?? '').includes('AI 食安合规官')).slice(0, 1).map((b) => {
      const spans = [...b.querySelectorAll('span')].map(wrap)
      return spans
    })[0],
    badgeOverlap: (() => {
      const alert = labelOf('我的预警')
      if (alert === undefined) return null
      const badge = alert.querySelector('[class*="badge"], [class*="Badge"]') ?? alert.parentElement?.querySelector('[class*="badge" i]')
      if (badge === null || badge === undefined) return { found: false }
      const ar = alert.getBoundingClientRect()
      const br = badge.getBoundingClientRect()
      return { found: true, overlapsText: br.left < ar.right && br.bottom > ar.top }
    })(),
  }
})

// tasks dark: empty-state subtitle contrast + tab count alignment
await page.goto(`${BASE}#/tasks`, { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(1500)
const tasksProbe = await page.evaluate(() => {
  const sub = [...document.querySelectorAll('main p, main span, main div')].find((el) => (el.textContent ?? '').includes('任务由 AI 同事在对话中承接后生成'))
  if (sub === undefined) return { subtitle: null }
  const cs = getComputedStyle(sub)
  const lum = (rgb) => {
    const m = /(\d+),\s*(\d+),\s*(\d+)/.exec(rgb)
    if (m === null) return null
    const [r, g, b] = [Number(m[1]), Number(m[2]), Number(m[3])].map((v) => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4 })
    return 0.2126 * r + 0.7152 * g + 0.0722 * b
  }
  const bg = getComputedStyle(document.body)
  return {
    subtitle: { color: cs.color, fontSize: cs.fontSize, h: Math.round(sub.getBoundingClientRect().height) },
    canvasColor: getComputedStyle(document.documentElement).getPropertyValue('--dshm-canvas').trim(),
    bodyBg: bg.backgroundColor,
  }
})
await page.evaluate(() => localStorage.setItem('dsh-mobile-theme', 'dark'))
await page.reload({ waitUntil: 'domcontentloaded' })
await page.waitForTimeout(1500)
const tasksDark = await page.evaluate(() => {
  const sub = [...document.querySelectorAll('main p, main span, main div')].find((el) => (el.textContent ?? '').includes('任务由 AI 同事在对话中承接后生成'))
  const inkSub = getComputedStyle(document.documentElement).getPropertyValue('--dshm-ink-sub').trim()
  const canvas = getComputedStyle(document.documentElement).getPropertyValue('--dshm-canvas').trim()
  return { subColor: sub ? getComputedStyle(sub).color : null, inkSub, canvas }
})

writeFileSync(`${OUT}/w24-audit-verify.json`, JSON.stringify({ homeProbe, tasksProbe, tasksDark }, null, 2))
console.log(JSON.stringify({ homeProbe, tasksDark }, null, 1))
await browser.close()
console.log('DONE audit verify')
