// W24-R1 residual-leak scan (375px live): re-runs the W24 jargon audit with
// the R1 word-table additions (receiving=none, derived lifecycle family,
// CI matchers) over the stored server data — every routed page plus the
// first chat sessions opened in full, asserting no leak family survives in
// the rendered DOM text.
// Usage: node demos/acceptance-w24/r1-jargon-scan.mjs
import { writeFileSync } from 'node:fs'
import { chromium } from '../../apps/web/node_modules/playwright/index.mjs'

const BASE = 'http://127.0.0.1:3080/mobile.html'
const OUT = 'demos/acceptance-w24'

const ROUTES = ['/', '/chats', '/agents', '/work', '/me', '/tasks', '/files', '/docs', '/alerts', '/todos', '/kg']

/** The leak families the W24 audit chased, plus the R1 additions. */
const PATTERNS = [
  ['receivingNone', /receiving(?:_status)?\s*=\s*none/i],
  ['supplierId', /\bsuppliers?\s*#?\s*\d/i],
  ['productId', /\bproducts?\s*#?\s*\d/i],
  ['aqlNotation', /\bd\s*[≥>]=?\s*re\b/i],
  ['streak', /\bstreak\s*[≥>]/i],
  ['protocolToken', /\b(?:wfl_|ask_)[a-z0-9_]+/i],
  ['atpBare', /\batp\s*=/i],
]

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 375, height: 812 } })
await page.goto(`${BASE}#/login`, { waitUntil: 'domcontentloaded' })
await page.evaluate(() => { localStorage.clear(); localStorage.setItem('dsh-mobile-theme', 'light') })
await page.reload({ waitUntil: 'domcontentloaded' })
await page.getByPlaceholder('业务账号（如 buyer）').fill('buyer')
await page.getByPlaceholder('业务账号密码').fill('Buyer#2026')
await page.getByRole('button', { name: '登录' }).click()
await page.waitForSelector('nav[aria-label="底部导航"]', { timeout: 30_000 })

const scanHere = (label) => page.evaluate(({ label, PATTERNS }) => {
  const text = (document.body.innerText ?? '').replace(/\s+/g, ' ')
  const hits = {}
  for (const [name, source] of PATTERNS) {
    const found = text.match(new RegExp(source, 'gi'))
    if (found !== null) hits[name] = found.slice(0, 5)
  }
  return { label, url: location.hash, textLen: text.length, hits }
}, { label, PATTERNS: PATTERNS.map(([name, re]) => [name, re.source]) })

const results = []
for (const route of ROUTES) {
  await page.goto(`${BASE}#${route}`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(1500)
  results.push(await scanHere(`route ${route}`))
}
await page.screenshot({ path: `${OUT}/r1-jargon-scan-chats-375.png`, fullPage: false })

// Open the first sessions in full — the stored report cards and narratives
// are where the W24 leaks lived.
await page.goto(`${BASE}#/chats`, { waitUntil: 'domcontentloaded' })
await page.waitForSelector('[class*="sessionTitle"]', { timeout: 15_000 })
const titles = await page.evaluate(() =>
  [...document.querySelectorAll('button')].filter(b => b.querySelector('[class*="sessionTitle"]'))
    .slice(0, 6).map(b => (b.querySelector('[class*="sessionTitle"]')?.textContent ?? '').trim()))
for (const [index, title] of titles.entries()) {
  await page.evaluate(i => {
    const rows = [...document.querySelectorAll('button')].filter(b => b.querySelector('[class*="sessionTitle"]'))
    rows[i]?.click()
  }, index)
  await page.waitForFunction(() => location.hash.startsWith('#/chat/'), { timeout: 15_000 })
  await page.waitForTimeout(2500)
  results.push(await scanHere(`chat ${title.slice(0, 18)}`))
  await page.goto(`${BASE}#/chats`, { waitUntil: 'domcontentloaded' })
  // Returning from a chat refetches the whole session list; the live gateway
  // can take well past 15s, so wait generously (the diagnostic run showed no
  // crash — just a slow list poll).
  await page.waitForSelector('[class*="sessionTitle"]', { timeout: 45_000 })
}

const summary = {
  ts: new Date().toISOString(),
  scanned: results.length,
  cleanSurfaces: results.filter(r => Object.keys(r.hits).length === 0).length,
  leaks: results.filter(r => Object.keys(r.hits).length > 0),
}
writeFileSync(`${OUT}/r1-jargon-scan.json`, JSON.stringify({ summary, results }, null, 2))
console.log(JSON.stringify(summary, null, 1))
await browser.close()
console.log('DONE jargon scan')
