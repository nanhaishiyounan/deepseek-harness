// W24 after chats-only re-probe (the combined run hit a route-timing miss).
// Usage: node demos/acceptance-w24/w24-chats-after.mjs
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
// land on the list through the home page's own entry (a user path), then
// wait for the rows themselves — never a fixed timer.
await page.getByRole('button', { name: /查看全部/ }).last().click()
await page.waitForSelector('[class*="sessionTitle"]', { timeout: 15_000 })
await page.waitForTimeout(600)
await page.screenshot({ path: `${OUT}/after-2-chats-list-375.png`, fullPage: false })
const chatsProbe = await page.evaluate(() => {
  const rows = [...document.querySelectorAll('button')].filter((b) => b.querySelector('[class*="sessionTitle"]'))
  return rows.slice(0, 12).map((row) => {
    const rect = (el) => {
      if (el === null) return null
      const r = el.getBoundingClientRect()
      return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }
    }
    const title = row.querySelector('[class*="sessionTitle"]')
    const time = row.querySelector('[class*="sessionTime"]')
    const summary = row.querySelector('[class*="sessionSummary"]')
    const tags = [...row.querySelectorAll('[class*="kindTag"]')].map((t) => (t.textContent ?? '').trim())
    const cs = summary ? getComputedStyle(summary) : null
    return {
      title: (title?.textContent ?? '').trim().slice(0, 30),
      titleRect: rect(title),
      titleOneLine: title ? title.getBoundingClientRect().height <= 22 : false,
      timeRect: rect(time),
      timeRightAligned: time ? Math.round(time.getBoundingClientRect().right) : 0,
      summary: (summary?.textContent ?? '').trim().slice(0, 28),
      summaryH: summary ? Math.round(summary.getBoundingClientRect().height) : 0,
      summaryClamp: cs ? cs.webkitLineClamp : null,
      summaryLines: summary ? Math.round(summary.getBoundingClientRect().height / 19) : 0,
      summaryOverflowHidden: summary ? summary.scrollHeight > summary.clientHeight + 1 : false,
      tags,
      rowH: Math.round(row.getBoundingClientRect().height),
    }
  })
})
writeFileSync(`${OUT}/w24-chats-after-probe.json`, JSON.stringify({ chatsProbe }, null, 2))
console.log('rows:', JSON.stringify(chatsProbe.slice(0, 6), null, 1))
await browser.close()
console.log('DONE chats after')
