// W23-R3 live verification: F1 (the rejected present_card's 复制原文 carries
// the raw payload), F2 (subtitle protocol-token leaks ×3 scenarios render
// zero), the cluster expand, and the b2-08 retake (an independent frame).
// Usage: node demos/acceptance-w23/r3-live.mjs
import { writeFileSync, mkdirSync } from 'node:fs'
import { chromium } from '../../apps/web/node_modules/playwright/index.mjs'

const BASE = 'http://127.0.0.1:3080/mobile.html'
const OUT = 'demos/acceptance-w23/r3'
mkdirSync(OUT, { recursive: true })
const sleep = (ms) => new Promise((resolve) => { setTimeout(resolve, ms) })

const TOKEN_RE = /wfl_[A-Za-z0-9_]+|ask_[a-z_]+|suggestions|nb_[a-z_]+|kg_[a-z_]+|kb_search|lakehouse_[a-z_]+|connector_[a-z_]+|form_draft|form_confirm|reject_flow|submit_receipt|present_card/

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 375, height: 812 } })
const login = async (user, pass) => {
  await page.goto(`${BASE}#/login`, { waitUntil: 'domcontentloaded' })
  await page.evaluate(() => { localStorage.clear(); localStorage.setItem('dsh-mobile-theme', 'light') })
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.getByPlaceholder('业务账号（如 buyer）').fill(user)
  await page.getByPlaceholder('业务账号密码').fill(pass)
  await page.getByRole('button', { name: '登录' }).click()
  await page.waitForSelector('nav[aria-label="底部导航"]', 30_000)
}
await login('buyer', 'Buyer#2026')
const probe = { at: new Date().toISOString() }

// ---- F1: the rejected present_card in z4 — the copy entry carries the raw payload.
await page.goto(`${BASE}#/chat/session-f2df1566-d1c5-4eb4-a030-4d4739201b57`, { waitUntil: 'domcontentloaded' })
await page.waitForSelector('[data-testid="degraded-notice"]', 30_000)
const notices = page.locator('[data-testid="degraded-notice"]')
probe.f1 = { degradedNotices: await notices.count() }
const notice = notices.last()
await notice.locator('summary').click()
await sleep(400)
const pre = notice.locator('pre')
const preText = (await pre.textContent()) ?? ''
probe.f1.preStartsWithPayload = preText.startsWith('{"payload":')
probe.f1.preLength = preText.length
probe.f1.preHead = preText.slice(0, 120)
// Spy the clipboard write lane, then click 复制原文.
await page.evaluate(() => {
  const writes = []
  window.__r3clipboardWrites = writes
  const nav = navigator
  const originalWrite = nav.clipboard?.writeText?.bind(nav.clipboard)
  if (originalWrite !== undefined && nav.clipboard !== undefined) {
    nav.clipboard.writeText = (text) => { writes.push(text); return originalWrite(text) }
  }
  // The execCommand fallback arm rides the copy event's selection.
  document.addEventListener('copy', () => {
    const selection = document.getSelection()?.toString() ?? ''
    if (selection !== '') writes.push(selection)
  }, { once: true })
})
const copyBtn = notice.getByRole('button', { name: '复制原文' })
await copyBtn.click()
await sleep(600)
const writes = await page.evaluate(() => window.__r3clipboardWrites ?? [])
probe.f1.clipboardWrites = writes.map(w => ({ length: w.length, head: w.slice(0, 120), equalsPre: w === preText }))
await page.screenshot({ path: `${OUT}/r3-f1-rejected-copy-payload.png`, fullPage: false })

// ---- F2: subtitle protocol-token leaks ×3 scenarios.
// (a)+(b) the two live-leaked cards replayed from the z2 durable log.
await page.goto(`${BASE}#/chat/session-453ee9d6-3da6-4417-9a9b-9234b0f7eb21`, { waitUntil: 'domcontentloaded' })
await page.waitForSelector('[data-testid="report-card"]', 30_000)
await sleep(800)
probe.f2 = {}
probe.f2.z2 = await page.evaluate((re) => {
  const subs = [...document.querySelectorAll('[class*="reportSubtitle"]')].map(el => el.textContent ?? '')
  const re2 = new RegExp(re); const body = document.body.textContent ?? ''
  return {
    subtitles: subs,
    subtitleTokenLeaks: subs.filter(s => new RegExp(re).test(s)),
    bodyTokenLeaks: (body.match(re2) ?? []).slice(0, 6),
  }
}, TOKEN_RE.source)
await page.screenshot({ path: `${OUT}/r3-f2-z2-leak-cards-clean.png`, fullPage: false })

// (c) z4's cards under the same assertion.
await page.goto(`${BASE}#/chat/session-f2df1566-d1c5-4eb4-a030-4d4739201b57`, { waitUntil: 'domcontentloaded' })
await sleep(800)
probe.f2.z4 = await page.evaluate((re) => {
  const subs = [...document.querySelectorAll('[class*="reportSubtitle"]')].map(el => el.textContent ?? '')
  return { subtitles: subs, subtitleTokenLeaks: subs.filter(s => new RegExp(re).test(s)) }
}, TOKEN_RE.source)

// ---- cluster expand on the c2 session (8-step chain).
await page.goto(`${BASE}#/chat/session-821a6a23-c175-44c0-9788-c504fea9eeb2`, { waitUntil: 'domcontentloaded' })
await page.waitForSelector('[data-testid="tool-cluster"]', 30_000)
const clusterHead = page.locator('[data-testid="tool-cluster"] button').first()
probe.cluster = { collapsedLabel: (await clusterHead.textContent())?.trim() ?? '' }
await clusterHead.click()
await sleep(500)
probe.cluster.expandedRows = await page.locator('[data-testid="tool-cluster"] [class*="toolRow"]').count()
probe.cluster.expandedAria = await clusterHead.getAttribute('aria-expanded')
await page.screenshot({ path: `${OUT}/r3-cluster-expanded.png`, fullPage: false })

// ---- b2-08 retake: an independent buyer hero frame (distinct sha from b2-01).
await page.goto(`${BASE}#/`, { waitUntil: 'domcontentloaded' })
await sleep(2200)
probe.heroLines = await page.evaluate(() =>
  [...document.querySelectorAll('p,span,small,b')].map(el => (el.textContent ?? '').trim())
    .filter(t => /今天|项预警待看/.test(t) && t.length < 60).slice(0, 4))
await page.screenshot({ path: `${OUT}/r3-b2-08-retake-buyer-hero-line.png`, fullPage: false })

writeFileSync(`${OUT}/r3-live-probe.json`, JSON.stringify(probe, null, 2))
console.log(JSON.stringify(probe, null, 2))
await browser.close()
console.log('done')
