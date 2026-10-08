// W23-B2 live verification pass: the B2 fix surfaces against the restarted
// gateway — hero grade + ledger-vocabulary counts (P1-9/P1-12), the alerts
// urgency bands + far fold + day-range groups (P1-8/P1-11), the mode-preset
// roster cut (P2-8), and the degraded notice copy + copy entry (P1-7).
// Usage: node demos/acceptance-w23/b2-live.mjs
import { writeFileSync, mkdirSync } from 'node:fs'
import { chromium } from '../../apps/web/node_modules/playwright/index.mjs'

const BASE = 'http://127.0.0.1:3080/mobile.html'
const OUT = 'demos/acceptance-w23'
mkdirSync(OUT, { recursive: true })
const sleep = ms => new Promise(r => setTimeout(r, ms))

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 375, height: 812 } })
const login = async (user, pass) => {
  await page.goto(`${BASE}#/login`, { waitUntil: 'domcontentloaded' })
  await page.evaluate(() => { localStorage.clear(); localStorage.setItem('dsh-mobile-theme', 'light') })
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.getByPlaceholder('业务账号（如 buyer）').fill(user)
  await page.getByPlaceholder('业务账号密码').fill(pass)
  await page.getByRole('button', { name: '登录' }).click()
  await page.waitForSelector('nav[aria-label="底部导航"]', { timeout: 30_000 })
}
await login('buyer', 'Buyer#2026')
console.log('logged in as buyer')

const probe = {}

// ---- P1-12 + P1-9: home hero grade, quick-chip grid, work-count vocabulary ----
await page.goto(`${BASE}#/`, { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(1800)
await page.screenshot({ path: `${OUT}/b2-01-home-hero-grid.png`, fullPage: true })
probe.home = await page.evaluate(() => {
  const hero = document.querySelector('h1')
  const heroCs = hero ? getComputedStyle(hero) : null
  const chips = [...document.querySelectorAll('button')].filter(b => ['我的待办', '我的预警', '看单据', '登记一条单据'].includes((b.textContent ?? '').trim()))
  const widths = chips.map(b => Math.round(b.getBoundingClientRect().width))
  const heroDate = [...document.querySelectorAll('p')].map(p => p.textContent ?? '').find(t => /今天/.test(t))
  return {
    heroFontSize: heroCs?.fontSize,
    chipWidths: widths,
    chipWidthSpread: Math.max(...widths) - Math.min(...widths),
    heroDateLine: heroDate?.slice(0, 80),
  }
})
console.log('home:', JSON.stringify(probe.home))

// ---- P1-8 + P1-11: alerts bands, far fold, day ranges ----
await page.goto(`${BASE}#/alerts`, { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(2200)
await page.screenshot({ path: `${OUT}/b2-02-alerts-bands.png`, fullPage: true })
probe.alerts = await page.evaluate(() => {
  const bands = [...document.querySelectorAll('h2')].map(h => h.textContent ?? '')
  const farFold = [...document.querySelectorAll('button')].map(b => b.textContent ?? '').find(t => /远期提醒/.test(t))
  const groups = [...document.querySelectorAll('[data-testid="alert-group"]')].map(g => (g.textContent ?? '').slice(0, 90))
  const footNotes = [...document.querySelectorAll('p')].map(p => p.textContent ?? '').filter(t => /认领/.test(t)).slice(0, 2)
  return { bands, farFold: farFold?.slice(0, 50), groups: groups.slice(0, 6), footNotes }
})
console.log('alerts:', JSON.stringify(probe.alerts))
// Open the far fold and capture the ranged group.
const farButton = page.locator('button', { hasText: '远期提醒' }).first()
if (await farButton.count() > 0) {
  await farButton.click().catch(() => {})
  await page.waitForTimeout(700)
  const ranged = await page.locator('[data-testid="alert-group"]').filter({ hasText: /~\d+ 天后到期/ }).first()
  if (await ranged.count() > 0) {
    await page.screenshot({ path: `${OUT}/b2-03-alerts-far-ranged-group.png`, fullPage: true })
    probe.farRangeText = (await ranged.textContent())?.slice(0, 120)
  }
  console.log('farRange:', probe.farRangeText ?? '(no ranged group)')
}

// ---- P2-8: the roster carries no 标准模式/PTC 模式/极简模式/创造模式 rows ----
await page.goto(`${BASE}#/agents`, { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(2000)
await page.screenshot({ path: `${OUT}/b2-04-agents-roster-cut.png`, fullPage: true })
probe.agents = await page.evaluate(() => {
  const names = [...document.querySelectorAll('button')].map(b => (b.getAttribute('aria-label') ?? b.textContent ?? '').trim())
  const modeRows = names.filter(n => /标准模式|PTC ?模式|极简模式|创造模式/.test(n))
  const bands = [...document.querySelectorAll('h2')].map(h => h.textContent ?? '')
  return { modeRowCount: modeRows.length, bands, sample: names.filter(n => n.startsWith('找 ')).slice(0, 8) }
})
console.log('agents:', JSON.stringify(probe.agents))

// ---- P1-7: the degraded notice copy + the copy entry (the audited c2 session) ----
await page.goto(`${BASE}#/chat/session-821a6a23-c175-44c0-9788-c504fea9eeb2`, { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(3200)
const notice = page.locator('[data-testid="degraded-notice"]').first()
if (await notice.count() > 0) {
  probe.degradedSummary = (await notice.locator('summary').textContent())?.trim()
  // Expand and check the copy entry rides the expanded body.
  await notice.locator('summary').click().catch(() => {})
  await page.waitForTimeout(500)
  probe.degradedCopyEntry = await notice.getByRole('button', { name: '复制原文' }).count()
  await page.screenshot({ path: `${OUT}/b2-05-degraded-notice-copy.png`, fullPage: false })
} else {
  // Fall back to the W22 seeded session the e2e uses.
  await page.goto(`${BASE}#/`, { waitUntil: 'domcontentloaded' })
  probe.degradedSummary = '(no degraded notice in the audited session)'
}
console.log('degraded:', JSON.stringify({ summary: probe.degradedSummary, copyEntry: probe.degradedCopyEntry }))

// ---- P1-10: the tool-run cluster on the same long session ----
await page.goto(`${BASE}#/chat/session-821a6a23-c175-44c0-9788-c504fea9eeb2`, { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(3000)
const cluster = page.locator('[data-testid="tool-cluster"]').first()
if (await cluster.count() > 0) {
  probe.clusterHead = (await cluster.locator('button').first().textContent())?.trim()
  await cluster.locator('button').first().click().catch(() => {})
  await page.waitForTimeout(500)
  probe.clusterRows = await cluster.locator('[class*="toolRow"]').count()
  await page.screenshot({ path: `${OUT}/b2-06-tool-cluster.png`, fullPage: false })
} else {
  probe.clusterHead = '(no cluster)'
}
console.log('cluster:', JSON.stringify({ head: probe.clusterHead, rows: probe.clusterRows }))

writeFileSync(`${OUT}/b2-live-probe.json`, JSON.stringify(probe, null, 2))
await browser.close()
console.log('done')
