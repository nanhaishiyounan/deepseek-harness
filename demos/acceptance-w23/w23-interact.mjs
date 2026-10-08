// W23-B0 audit pass 3: interaction sweep (buyer) — login-button font, docs
// drill-down, files page, composer plus-panel, pull-to-refresh, dark-mode
// contrast probes, chat report-card button styles. Evidence to
// w23-interact-probe.json + screenshots.
import { writeFileSync, mkdirSync } from 'node:fs'
import { chromium } from '../../apps/web/node_modules/playwright/index.mjs'

const BASE = 'http://127.0.0.1:3080/mobile.html'
const OUT = 'demos/acceptance-w23'
mkdirSync(OUT, { recursive: true })
const sleep = (ms) => new Promise((resolve) => { setTimeout(resolve, ms) })
const vis = (el) => (el.textContent ?? '').replace(/\s+/g, ' ').trim()

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 375, height: 812 } })
const result = {}

// 1) login button (medium size — no size attr → font-size-9 = display)
await page.goto(`${BASE}#/login`, { waitUntil: 'domcontentloaded' })
await page.evaluate(() => localStorage.clear())
await page.reload({ waitUntil: 'domcontentloaded' })
result.loginButton = await page.evaluate(() => {
  const b = [...document.querySelectorAll('button')].find((x) => /登\s*录/.test(x.textContent ?? ''))
  if (b === undefined) return null
  const cs = getComputedStyle(b)
  return { text: vis0(b), fontSize: cs.fontSize, height: Math.round(b.getBoundingClientRect().height), cls: String(b.className).slice(0, 60) }
  function vis0(el) { return (el.textContent ?? '').replace(/\s+/g, ' ').trim() }
})

// 2) buyer login
await page.evaluate(() => localStorage.clear())
await page.reload({ waitUntil: 'domcontentloaded' })
await page.getByPlaceholder('业务账号（如 buyer）').fill('buyer')
await page.getByPlaceholder('业务账号密码').fill('Buyer#2026')
await page.getByRole('button', { name: '登录' }).click()
await page.waitForSelector('nav[aria-label="底部导航"]', { timeout: 30_000 })

// 3) docs drill-down
await page.goto(`${BASE}#/docs`, { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(2000)
result.docsCollections = await page.evaluate(() => [...document.querySelectorAll('[data-testid="docs-collection"]')].map((c) => (c.textContent ?? '').replace(/\s+/g, ' ').trim()))
const firstDoc = page.locator('[data-testid="docs-collection"]').first()
if (await firstDoc.count() > 0) {
  await firstDoc.click()
  await page.waitForTimeout(2000)
  await page.screenshot({ path: `${OUT}/w23-docs-rows.png`, fullPage: true })
  result.docsRowsHead = await page.evaluate(() => (document.querySelector('main')?.textContent ?? '').replace(/\s+/g, ' ').slice(0, 300))
  const firstRow = page.locator('main li, main [role="listitem"], main [class*="row"]').first()
  if (await firstRow.count() > 0) {
    await firstRow.click().catch(() => {})
    await page.waitForTimeout(2000)
    await page.screenshot({ path: `${OUT}/w23-docs-detail.png`, fullPage: true })
    result.docsDetailHead = await page.evaluate(() => (document.querySelector('main')?.textContent ?? '').replace(/\s+/g, ' ').slice(0, 400))
  }
}

// 4) files page probe
await page.goto(`${BASE}#/files`, { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(2000)
result.files = await page.evaluate(() => {
  const v = (el) => (el.textContent ?? '').replace(/\s+/g, ' ').trim()
  const rows = [...document.querySelectorAll('[class*="fileRow"], [data-testid]')].map((r) => v(r)).filter(Boolean).slice(0, 10)
  const heads = [...document.querySelectorAll('h1,h2,h3')].map((h) => v(h)).filter(Boolean)
  return { heads, rows, mainHead: (document.querySelector('main')?.textContent ?? '').replace(/\s+/g, ' ').slice(0, 400) }
})
await page.screenshot({ path: `${OUT}/w23-files-buyer.png`, fullPage: true })

// 5) composer plus-panel (W11 feature) — open chat, click expandable
await page.goto(`${BASE}#/chats`, { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(1500)
const firstChat = page.locator('main button:visible').filter({ hasText: /查看|登记|采购|经营|库存|供应|寒露/ }).first()
if (await firstChat.count() > 0) {
  await firstChat.click()
  await page.waitForTimeout(1800)
  const plus = page.getByRole('button', { name: '打开快捷面板' })
  if (await plus.count() > 0) {
    await plus.click()
    await page.waitForTimeout(900)
    await page.screenshot({ path: `${OUT}/w23-composer-plus.png` })
    result.plusPanel = await page.evaluate(() => (document.querySelector('main')?.textContent ?? '').replace(/\s+/g, ' ').slice(0, 300))
  }
  // 6) report-card button styles on this page if any
  result.chatCardButtons = await page.evaluate(() => [...document.querySelectorAll('[data-testid="report-card"] button')].map((b) => { const cs = getComputedStyle(b); return { text: (b.textContent ?? '').trim(), fontSize: cs.fontSize, h: Math.round(b.getBoundingClientRect().height) } }))
}

// 7) dark-mode contrast spot check on home
await page.goto(`${BASE}#/`, { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(1500)
await page.evaluate(() => localStorage.setItem('dsh-mobile-theme', 'dark'))
await page.reload({ waitUntil: 'domcontentloaded' })
await page.waitForTimeout(1800)
result.darkContrast = await page.evaluate(() => {
  const pick = (sel) => { const el = document.querySelector(sel); if (el === null) return null; const cs = getComputedStyle(el); return { color: cs.color, bg: cs.backgroundColor } }
  return { hero: pick('h1'), tabBar: pick('nav'), body: { color: getComputedStyle(document.body).color, bg: getComputedStyle(document.body).backgroundColor } }
})
await page.screenshot({ path: `${OUT}/w23-home-dark-check.png`, fullPage: true })

// 8) pull-to-refresh presence on alerts (ant PullToRefresh wrapper)
await page.evaluate(() => localStorage.setItem('dsh-mobile-theme', 'light'))
await page.goto(`${BASE}#/alerts`, { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(1800)
result.pullToRefresh = await page.evaluate(() => ({ hasIndicator: document.querySelector('.adm-pull-to-refresh') !== null }))

// 9) chats list titles (what does the recent list actually show)
await page.goto(`${BASE}#/chats`, { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(2000)
result.chatTitles = await page.evaluate(() => [...document.querySelectorAll('main [class*="sessionTitle"], main [class*="recentTitle"]')].map((t) => (t.textContent ?? '').replace(/\s+/g, ' ').trim()).slice(0, 12))
await page.screenshot({ path: `${OUT}/w23-chats-titles.png`, fullPage: true })

writeFileSync(`${OUT}/w23-interact-probe.json`, JSON.stringify(result, null, 2))
console.log(JSON.stringify(result, null, 1).slice(0, 3000))
await browser.close()
console.log('DONE interact probe')
