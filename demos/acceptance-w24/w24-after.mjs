// W24 after-evidence pass: the fixed three issues at 375px + the full-page
// audit walkthrough (11 routes x light/dark) that feeds audit2.md.
// 1. The supplier-jargon report card: hint text assertions (supplier 4 /
//    d>=Re / reject_streak never render) + per-column width probe + shots.
// 2. The chats list: shot + geometry probe (two-line clamp, time slot, tags).
// 3. An injected md-table narrative plate (the .richText pipeline's own
//    structure) measuring the wrap-scroll contract at 375px.
// Usage: node demos/acceptance-w24/w24-after.mjs
import { writeFileSync, mkdirSync } from 'node:fs'
import { chromium } from '../../apps/web/node_modules/playwright/index.mjs'

const BASE = 'http://127.0.0.1:3080/mobile.html'
const OUT = 'demos/acceptance-w24'
const SESSION = '#/chat/session-73327434-a0de-4f0b-aea7-f1b2e5cac4aa'
mkdirSync(OUT, { recursive: true })

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 375, height: 812 } })
const login = async () => {
  await page.goto(`${BASE}#/login`, { waitUntil: 'domcontentloaded' })
  await page.evaluate(() => { localStorage.clear(); localStorage.setItem('dsh-mobile-theme', 'light') })
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.getByPlaceholder('业务账号（如 buyer）').fill('buyer')
  await page.getByPlaceholder('业务账号密码').fill('Buyer#2026')
  await page.getByRole('button', { name: '登录' }).click()
  await page.waitForSelector('nav[aria-label="底部导航"]', { timeout: 30_000 })
}
await login()
console.log('logged in as buyer')

// ── 1. report card: sanitized faces + table widths ──
await page.goto(`${BASE}${SESSION}`, { waitUntil: 'domcontentloaded' })
await page.waitForSelector('[data-testid="report-card"]', { timeout: 30_000 })
await page.waitForTimeout(2500)
const cards = page.locator('[data-testid="report-card"]')
const cardText = []
const n = await cards.count()
for (let i = 0; i < n; i++) {
  await cards.nth(i).scrollIntoViewIfNeeded()
  cardText.push((await cards.nth(i).innerText()).replace(/\s+/g, ' ').slice(0, 500))
}
const allCardText = cardText.join('\n')
const jargonProbe = {
  hasSupplierId: /\bsupplier\s*#?\s*\d+/i.test(allCardText),
  hasProductId: /\bproduct\s*#?\s*\d+/i.test(allCardText),
  hasAqlNotation: /d\s*[≥>]=?\s*Re/i.test(allCardText),
  hasStreak: /streak/i.test(allCardText),
  hasRejectStreak: /reject_streak/.test(allCardText),
  hasAtpBare: /\bATP\b/.test(allCardText),
  hasFallbackNoun: allCardText.includes('某供应商') || allCardText.includes('某物料'),
  hasPeopleVerdict: allCardText.includes('按抽检标准判定拒收') || allCardText.includes('不合格数达到拒收线'),
}
await cards.nth(2).scrollIntoViewIfNeeded()
await page.waitForTimeout(400)
await cards.nth(2).screenshot({ path: `${OUT}/after-1a-reportcard-jargon-table-375.png` })
await cards.nth(1).scrollIntoViewIfNeeded()
await page.waitForTimeout(400)
await cards.nth(1).screenshot({ path: `${OUT}/after-1b-reportcard-rows-jargon-375.png` })
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
      wrapOverflowX: wrap ? getComputedStyle(wrap).overflowX : null,
      tableLayout: getComputedStyle(table).tableLayout,
      tableScrollW: Math.round(table.scrollWidth),
      wrapClientW: wrap ? Math.round(wrap.clientWidth) : 0,
      scrollable: wrap ? table.scrollWidth > wrap.clientWidth : false,
    })
  }
  return probes
})

// ── 3. injected md-table plate: the .richText pipeline's own DOM shape ──
// The plate mirrors exactly what renderMarkdown + RichContent emit (the
// wrap div + table + th/td), so the probe measures the real CSS contract.
const mdProbe = await page.evaluate(() => {
  // Mount inside a real rendered .richText node (its hashed module class
  // carries the md-table-wrap CSS), so the probe measures the live contract.
  const rich = document.querySelector('[class*="richText"]')
  if (rich === null) return { skipped: 'no richText node mounted' }
  const host = document.createElement('div')
  // 5-column markdown table exactly as renderMarkdown emits it
  host.innerHTML = '<div class="md-table-wrap"><table><thead><tr><th>供应商</th><th>近 90 天失败/总数</th><th>不合格率</th><th>首次→最近失败</th><th>连续拒收</th></tr></thead><tbody><tr><td>味之源调味食品</td><td>5 / 9</td><td>55.6</td><td>9/26 → 9/28</td><td>5</td></tr></tbody></table></div>'
  rich.appendChild(host)
  const wrap = host.querySelector('.md-table-wrap')
  const table = host.querySelector('table')
  const ths = [...table.querySelectorAll('th')].map((th) => Math.round(th.getBoundingClientRect().width))
  const out = {
    wrapOverflowX: getComputedStyle(wrap).overflowX,
    tableMinWidth: getComputedStyle(table).minWidth,
    thWidths: ths,
    thMin: Math.min(...ths),
    tableScrollW: Math.round(table.scrollWidth),
    wrapClientW: Math.round(wrap.clientWidth),
    scrollable: table.scrollWidth > wrap.clientWidth + 1,
    colsFit: Math.min(...ths) >= 60,
  }
  window.__mdHost = host
  return out
})
const shot = await page.evaluate(() => {
  const host = window.__mdHost
  if (host === undefined) return false
  host.scrollIntoView({ block: 'center' })
  return true
})
if (shot === true) {
  await page.waitForTimeout(300)
  await page.evaluate(() => {
    const host = window.__mdHost
    if (host === undefined) return
    const r = host.getBoundingClientRect()
    // clip-shot via a full-viewport screenshot is enough; the plate sits centered
    host.setAttribute('data-w24-shot', 'md-table')
  })
  await page.screenshot({ path: `${OUT}/after-3-md-table-wrap-375.png`, fullPage: false })
  await page.evaluate(() => { window.__mdHost?.remove(); delete window.__mdHost })
}

// ── 2. chats list: shot + geometry ──
await page.goto(`${BASE}#/chats`, { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(2200)
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
      timeRect: rect(time),
      summaryRect: rect(summary),
      summaryH: summary ? Math.round(summary.getBoundingClientRect().height) : 0,
      summaryClamp: cs ? cs.webkitLineClamp : null,
      summaryLines: summary ? Math.round(summary.getBoundingClientRect().height / 19) : 0,
      summaryScrollOverflow: summary ? summary.scrollHeight > summary.clientHeight + 1 : false,
      tags,
      rowH: Math.round(row.getBoundingClientRect().height),
    }
  })
})

writeFileSync(`${OUT}/w24-after-probe.json`, JSON.stringify({ jargonProbe, tableProbe, mdProbe, chatsProbe }, null, 2))
console.log('jargonProbe:', JSON.stringify(jargonProbe))
console.log('tableProbe:', JSON.stringify(tableProbe.map(t => ({ cols: t.cols, min: Math.min(...t.head.map(h => h.w)), scrollable: t.scrollable }))))
console.log('mdProbe:', JSON.stringify(mdProbe))
console.log('chats clamp:', JSON.stringify(chatsProbe.slice(0, 4).map(c => ({ lines: c.summaryLines, clamp: c.summaryClamp, h: c.summaryRect?.h }))))
await browser.close()
console.log('DONE after evidence')
