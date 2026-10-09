// W24-R3 bullet-enum-face probe (375px live): the R2 segment gate left a
// bullet list of supplier states half-translated (five English words beside
// one Chinese word on one screen) because the ASCII hyphen held no segment
// boundary and a bare enum face had no gate opening. This probe re-opens the
// stored sessions on the rebuilt dist and asserts (1) no markdown bullet
// line carries an untranslated lifecycle state word, and (2) no session page
// scrolls horizontally — the wide md tables scroll inside .md-table-wrap
// only (the user-reported page-level horizontal scroll after the W24 table
// wrap; R3 re-floors the bubble flex item with min-width: 0). The stored
// sessions no longer carry a narrative md table (the W24 one-shot session is
// gone), so part B plants a wide md-table-wrap into a real narrative bubble
// of the rebuilt bundle: the node is synthetic, but the class names, the
// stylesheet, and the layout engine are the live page's own — the R2
// computedStyle-probe precedent.
// W24-R4 de-flake: the fixed 2500/2000ms blind waits became conditional
// waits (bubble content, list items, or the 10s timeout for genuinely empty
// sessions), and the trailing after-375 screenshot is gone — it captured
// the same frame as table-375 (identical SHA256, zero information).
// Usage: node demos/acceptance-w24/r3-bullet-enum-probe.mjs
import { writeFileSync } from 'node:fs'
import { chromium } from '../../apps/web/node_modules/playwright/index.mjs'

const BASE = 'http://127.0.0.1:3080/mobile.html'
const OUT = 'demos/acceptance-w24'

const STATES = ['potential', 'reviewing', 'qualified', 'preferred', 'restricted', 'frozen', 'rejected', 'eliminated']

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

await page.goto(`${BASE}#/chats`, { waitUntil: 'domcontentloaded' })
await page.waitForSelector('[class*="sessionTitle"]', { timeout: 15_000 })
const titles = await page.evaluate(() =>
  [...document.querySelectorAll('button')].filter(b => b.querySelector('[class*="sessionTitle"]'))
    .map(b => (b.querySelector('[class*="sessionTitle"]')?.textContent ?? '').trim()))
console.log(`sessions in list: ${titles.length}`)

const results = []
for (const [index, title] of titles.entries()) {
  await page.evaluate(i => {
    const rows = [...document.querySelectorAll('button')].filter(b => b.querySelector('[class*="sessionTitle"]'))
    rows[i]?.click()
  }, index)
  await page.waitForFunction(() => location.hash.startsWith('#/chat/'), { timeout: 15_000 })
  // Conditional wait: rendered bubble content or any bullet/list item means
  // the messages are in the DOM; a session with neither is empty and the
  // timeout-tolerated pass-through keeps the probe reading it as such.
  await page.waitForSelector('[class*="assistantBubble"] [class*="richText"], li', { timeout: 10_000 }).catch(() => {})
  const probe = await page.evaluate(states => {
    const scroll = document.scrollingElement ?? document.documentElement
    const bulletItems = [...document.querySelectorAll('li')].map(li => (li.textContent ?? '').trim())
    const stateBullets = bulletItems.filter(text => text !== '' && states.includes(text.toLowerCase()))
    const translated = bulletItems.filter(text => text !== '' && !states.includes(text.toLowerCase())
      && /潜在|准入评审中|合格|优选|受限|冻结|已淘汰|已退回/.test(text))
    const wraps = [...document.querySelectorAll('.md-table-wrap')].map(wrap => ({
      scrollable: wrap.scrollWidth > wrap.clientWidth,
      clientWidth: wrap.clientWidth,
      scrollWidth: wrap.scrollWidth,
    }))
    return {
      pageOverflowX: scroll.scrollWidth > scroll.clientWidth,
      scrollWidth: scroll.scrollWidth,
      clientWidth: scroll.clientWidth,
      untranslatedStateBullets: stateBullets,
      translatedBulletSamples: translated.slice(0, 8),
      tableWraps: wraps,
    }
  }, STATES)
  results.push({ title, ...probe })
  await page.goto(`${BASE}#/chats`, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('[class*="sessionTitle"]', { timeout: 45_000 })
}

// Part B: the wide-table width floor on a real narrative bubble.
await page.goto(`${BASE}#/chats`, { waitUntil: 'domcontentloaded' })
await page.waitForSelector('[class*="sessionTitle"]', { timeout: 15_000 })
const storyRows = await page.evaluate(() =>
  [...document.querySelectorAll('button')].filter(b => b.querySelector('[class*="sessionTitle"]'))
    .slice(0, 6).map(b => (b.querySelector('[class*="sessionTitle"]')?.textContent ?? '').trim()))
let widthFloor = undefined
let widthFloorSession = ''
for (const [index, title] of storyRows.entries()) {
  await page.evaluate(i => {
    const rows = [...document.querySelectorAll('button')].filter(b => b.querySelector('[class*="sessionTitle"]'))
    rows[i]?.click()
  }, index)
  await page.waitForFunction(() => location.hash.startsWith('#/chat/'), { timeout: 15_000 })
  // Conditional wait for the bubble the planted table targets (the planted
  // check itself reads the same selector; the wait removes the race).
  await page.waitForSelector('[class*="assistantBubble"]', { timeout: 10_000 }).catch(() => {})
  // The bubble appearing is not the layout settling: the message stream can
  // still be mid-render, and a plant at that moment reads a transient page
  // extent (one R4 run saw 386px before settling to 375px). Poll until the
  // page's scroll extent stops changing before planting and again — the
  // plant is itself a layout change — before measuring.
  const settleExtent = key => page.waitForFunction(k => {
    const scroll = document.scrollingElement ?? document.documentElement
    const width = String(scroll.scrollWidth)
    if (scroll.dataset[k] === width) return true
    scroll.dataset[k] = width
    return false
  }, key, { timeout: 5_000, polling: 150 }).catch(() => {})
  await settleExtent('probeSettlePre')
  const planted = await page.evaluate(() => {
    const bubble = document.querySelector('[class*="assistantBubble"]')
    const rich = bubble?.querySelector('[class*="richText"]')
    if (rich === undefined || rich === null) return false
    const cols = Array.from({ length: 8 }, (_, i) => `字段${String(i + 1)}长表头`)
    const cells = cols.map(head => `<th>${head}</th>`).join('')
    const values = cols.map((_, i) => `<td>数值数据${String(i + 1)}</td>`).join('')
    const wrap = document.createElement('div')
    wrap.className = 'md-table-wrap'
    wrap.innerHTML = `<table><thead><tr>${cells}</tr></thead><tbody><tr>${values}</tr></tbody></table>`
    rich.appendChild(wrap)
    return true
  })
  if (!planted) {
    await page.goto(`${BASE}#/chats`, { waitUntil: 'domcontentloaded' })
    await page.waitForSelector('[class*="sessionTitle"]', { timeout: 45_000 })
    continue
  }
  widthFloorSession = title
  widthFloor = await page.evaluate(() => {
    const scroll = document.scrollingElement ?? document.documentElement
    const bubble = document.querySelector('[class*="assistantBubble"]')
    const wrap = document.querySelector('.md-table-wrap')
    return {
      bubbleMinWidth: getComputedStyle(bubble).minWidth,
      bubbleMaxWidth: getComputedStyle(bubble).maxWidth,
      bubbleClientWidth: bubble?.clientWidth ?? -1,
      pageOverflowX: scroll.scrollWidth > scroll.clientWidth,
      pageScrollWidth: scroll.scrollWidth,
      wrapScrollsInternally: wrap !== null && wrap.scrollWidth > wrap.clientWidth,
      wrapScrollWidth: wrap?.scrollWidth ?? -1,
      wrapClientWidth: wrap?.clientWidth ?? -1,
    }
  })
  await settleExtent('probeSettlePost')
  await page.screenshot({ path: `${OUT}/r3-bullet-enum-table-375.png`, fullPage: false })
  break
}

const summary = {
  ts: new Date().toISOString(),
  bundleSrc,
  sessionsOpened: results.length,
  sessionsWithUntranslatedStateBullets: results.filter(r => r.untranslatedStateBullets.length > 0).length,
  sessionsWithPageOverflowX: results.filter(r => r.pageOverflowX).length,
  bulletEvidence: results.flatMap(r => r.translatedBulletSamples.map(text => ({ session: r.title, text }))).slice(0, 12),
  widthFloor: widthFloor === undefined ? null : { session: widthFloorSession, ...widthFloor },
}
writeFileSync(`${OUT}/r3-bullet-enum-probe.json`, JSON.stringify({ summary, results, widthFloor }, null, 2))
console.log(JSON.stringify(summary, null, 1))
await browser.close()
console.log('DONE r3 bullet-enum probe')
