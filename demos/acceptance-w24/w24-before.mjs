// W24 before-evidence pass: the user-named three issues at 375px, pre-fix.
// 1. The supplier-jargon report card (session 供应链数据关注要点): full card +
//    per-column width probe of the 5-column table + the rows-hint jargon text.
// 2. The chats list: screenshot + row geometry probe (title/time/summary/tag
//    rects, wrap/overflow detection).
// Usage: node demos/acceptance-w24/w24-before.mjs
import { writeFileSync } from 'node:fs'
import { chromium } from '../../apps/web/node_modules/playwright/index.mjs'

const BASE = 'http://127.0.0.1:3080/mobile.html'
const OUT = 'demos/acceptance-w24'
const SESSION = '#/chat/session-73327434-a0de-4f0b-aea7-f1b2e5cac4aa'

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 375, height: 812 } })
await page.goto(`${BASE}#/login`, { waitUntil: 'domcontentloaded' })
await page.evaluate(() => { localStorage.clear(); localStorage.setItem('dsh-mobile-theme', 'light') })
await page.reload({ waitUntil: 'domcontentloaded' })
await page.getByPlaceholder('业务账号（如 buyer）').fill('buyer')
await page.getByPlaceholder('业务账号密码').fill('Buyer#2026')
await page.getByRole('button', { name: '登录' }).click()
await page.waitForSelector('nav[aria-label="底部导航"]', { timeout: 30_000 })
console.log('logged in as buyer')

// ── 1. report card: jargon rows + 5-column table widths ──
await page.goto(`${BASE}${SESSION}`, { waitUntil: 'domcontentloaded' })
await page.waitForSelector('[data-testid="report-card"]', { timeout: 30_000 })
await page.waitForTimeout(2500)
const cards = page.locator('[data-testid="report-card"]')
const cardCount = await cards.count()
const jargon = []
for (let i = 0; i < cardCount; i++) {
  const card = cards.nth(i)
  await card.scrollIntoViewIfNeeded()
  const text = (await card.innerText()).replace(/\s+/g, ' ').slice(0, 400)
  jargon.push({ index: i, text })
}
await cards.nth(2).scrollIntoViewIfNeeded()
await page.waitForTimeout(400)
await cards.nth(2).screenshot({ path: `${OUT}/before-1a-reportcard-jargon-table-375.png` })
// the second card carries the user-quoted rows hint (supplier 4 · product 1/8 · d≥Re)
await cards.nth(1).scrollIntoViewIfNeeded()
await page.waitForTimeout(400)
await cards.nth(1).screenshot({ path: `${OUT}/before-1b-reportcard-rows-jargon-375.png` })
const tableProbe = await page.evaluate(() => {
  const probes = []
  for (const card of document.querySelectorAll('[data-testid="report-card"]')) {
    const table = card.querySelector('table')
    if (table === null) continue
    const head = [...table.querySelectorAll('thead th')].map((th) => {
      const r = th.getBoundingClientRect()
      return { label: (th.textContent ?? '').trim(), w: Math.round(r.width) }
    })
    const wrap = table.parentElement
    probes.push({
      cols: head.length,
      head,
      wrapTag: wrap?.tagName ?? null,
      wrapOverflowX: wrap ? getComputedStyle(wrap).overflowX : null,
      tableScrollW: Math.round(table.scrollWidth),
      tableClientW: Math.round(table.clientWidth),
      cardW: Math.round(card.getBoundingClientRect().width),
    })
  }
  return probes
})

// ── 2. chats list: screenshot + geometry probe ──
await page.goto(`${BASE}#/chats`, { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(2200)
await page.screenshot({ path: `${OUT}/before-2-chats-list-375.png`, fullPage: false })
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
    return {
      title: (title?.textContent ?? '').trim().slice(0, 30),
      titleRect: rect(title),
      titleScrollW: title ? title.scrollWidth : 0,
      timeRect: rect(time),
      summary: (summary?.textContent ?? '').trim().slice(0, 24),
      summaryRect: rect(summary),
      summaryScrollW: summary ? summary.scrollWidth : 0,
      tags,
      rowH: Math.round(row.getBoundingClientRect().height),
    }
  })
})

writeFileSync(`${OUT}/w24-before-probe.json`, JSON.stringify({ jargon, tableProbe, chatsProbe }, null, 2))
console.log('tableProbe:', JSON.stringify(tableProbe, null, 1))
console.log('chats rows:', JSON.stringify(chatsProbe.slice(0, 5), null, 1))
await browser.close()
console.log('DONE before evidence')
