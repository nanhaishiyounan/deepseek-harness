// W24 audit2 A1 re-shot: the balanced CTA fold on home (post-rebuild).
// Usage: node demos/acceptance-w24/w24-home-cta-after.mjs
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
await page.waitForTimeout(1800)
const probe = await page.evaluate(() => {
  const el = [...document.querySelectorAll('main button')].find((b) => (b.textContent ?? '').trim() === '登记一条单据')
  if (el === undefined) return null
  const cs = getComputedStyle(el)
  const r = el.getBoundingClientRect()
  return {
    w: Math.round(r.width), h: Math.round(r.height),
    lines: Math.round(r.height / Number.parseFloat(cs.lineHeight)),
    textWrap: cs.textWrap ?? cs.getPropertyValue('text-wrap'),
  }
})
await page.screenshot({ path: `${OUT}/after-4-home-cta-balance-375.png`, fullPage: false })
console.log('ctaProbe:', JSON.stringify(probe))
await browser.close()
console.log('DONE home cta after')
