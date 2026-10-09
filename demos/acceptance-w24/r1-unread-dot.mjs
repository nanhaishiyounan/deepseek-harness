// W24-R1 unread-dot computedStyle probe (375px live): the W24 fix wrote the
// offset as a descendant selector (`.timeBadge :global(.adm-badge.fixed)`)
// that can never match — antd-mobile merges `className` onto the same div
// that carries `adm-badge fixed`, so `--top/--right` never applied on a live
// page and the dot sat at antd's default 0/0. This probe measures the dot's
// computed top/right on the real server: `before` runs against the W24 dist,
// `after` against the rebuilt W24-R1 dist (compound selector).
// Usage: node demos/acceptance-w24/r1-unread-dot.mjs before|after
import { writeFileSync } from 'node:fs'
import { chromium } from '../../apps/web/node_modules/playwright/index.mjs'

const mode = process.argv[2] ?? 'after'
const BASE = 'http://127.0.0.1:3080/mobile.html'
const OUT = 'demos/acceptance-w24'

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 375, height: 812 } })
await page.goto(`${BASE}#/login`, { waitUntil: 'domcontentloaded' })
const bundleSrc = await page.evaluate(() => document.querySelector('script[type="module"]')?.getAttribute('src') ?? 'none')
await page.evaluate(() => { localStorage.clear(); localStorage.setItem('dsh-mobile-theme', 'light') })
await page.reload({ waitUntil: 'domcontentloaded' })
await page.getByPlaceholder('业务账号（如 buyer）').fill('buyer')
await page.getByPlaceholder('业务账号密码').fill('Buyer#2026')
await page.getByRole('button', { name: '登录' }).click()
await page.waitForSelector('nav[aria-label="底部导航"]', { timeout: 30_000 })
// Land on the chats list through the home page's own entry (a user path),
// then wait for the rows themselves — never a fixed timer.
await page.getByRole('button', { name: /查看全部/ }).last().click()
await page.waitForSelector('[class*="sessionTitle"]', { timeout: 15_000 })
await page.waitForTimeout(600)
// Drop the read watermark and reload in place: every session renders unread,
// so the probe always has a dot to measure without touching server data.
await page.evaluate(() => { localStorage.removeItem('dsh-mobile-read'); location.reload() })
await page.waitForSelector('[class*="sessionTitle"]', { timeout: 15_000 })
await page.waitForTimeout(800)
await page.screenshot({ path: `${OUT}/r1-unread-dot-${mode}-375.png`, fullPage: false })

const probe = await page.evaluate(() => {
  const dots = [...document.querySelectorAll('.adm-badge-fixed.adm-badge-dot')]
  return dots.slice(0, 8).map(dot => {
    const cs = getComputedStyle(dot)
    const rect = dot.getBoundingClientRect()
    const time = dot.parentElement?.querySelector('[class*="sessionTime"]')
    return {
      cls: dot.className.slice(0, 80),
      timeText: (time?.textContent ?? '').trim(),
      position: cs.position,
      top: cs.top,
      right: cs.right,
      left: cs.left,
      rect: { x: Math.round(rect.x), y: Math.round(rect.y), w: Math.round(rect.width), h: Math.round(rect.height) },
    }
  })
})
const summary = {
  mode,
  bundleSrc,
  ts: new Date().toISOString(),
  dotCount: probe.length,
  offsetApplied: probe.map(d => ({ top: d.top, right: d.right })),
}
writeFileSync(`${OUT}/r1-unread-dot-${mode}-probe.json`, JSON.stringify({ summary, probe }, null, 2))
console.log(JSON.stringify(summary, null, 1))
await browser.close()
console.log(`DONE unread-dot ${mode}`)
