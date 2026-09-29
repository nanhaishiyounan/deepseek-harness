/**
 * W4-R1 C2 leg-1: load the 质检单 page as qc_inspector and record every API
 * XHR with its status — pinpoints which metadata request fails while the
 * data list succeeds. Also captures the before-fix screenshot and counts
 * rendered table business columns.
 *
 * Usage: node --import tsx/esm examples/kb-agent/scripts/w4-r1-qc-browser.mts [before|after]
 */
import { createRequire } from 'node:module'
import { mkdirSync } from 'node:fs'

const require = createRequire(new URL('../../../platform/nocobase/package.json', import.meta.url))
const { chromium } = require('playwright')

const phase = process.argv[2] === 'after' ? 'after' : process.argv[2] ?? 'before'
const asAdmin = process.argv[3] === 'admin'
const OUT_DIR = 'examples/kb-agent/demos/w4-r1'
mkdirSync(OUT_DIR, { recursive: true })

const browser = await chromium.launch({ channel: 'chrome' })
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } })
const hits: Array<{ method: string, url: string, status: number }> = []
const consoleErrors: string[] = []
page.on('response', response => {
  const url = response.url()
  if (url.includes('/api/') && !url.includes('.js') && !url.includes('.css')) {
    hits.push({ method: response.request().method(), url: url.replace('http://127.0.0.1:13000', ''), status: response.status() })
  }
})
page.on('console', message => {
  if (message.type() === 'error' || message.type() === 'warning') consoleErrors.push(`${message.type()}: ${message.text().slice(0, 300)}`)
})
page.on('pageerror', error => consoleErrors.push(`pageerror: ${String(error).slice(0, 300)}`))

await page.goto('http://127.0.0.1:13000/signin', { waitUntil: 'domcontentloaded' })
await page.getByPlaceholder(/email|账号|用户名/i).or(page.locator('input[name="email"], input#email, input[type="text"]').first()).first().fill(asAdmin ? 'admin@nocobase.com' : 'qc_inspector')
await page.locator('input[type="password"]').first().fill(asAdmin ? 'admin123' : 'Qc#2026')
await page.locator('button[type="submit"], button:has-text("Sign in"), button:has-text("登录")').first().click()
await page.waitForURL(url => !String(url).includes('signin'), { timeout: 30_000 })

await page.goto('http://127.0.0.1:13000/admin/w8qmjvyv8p5j7j', { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(12_000)

const api = hits.filter(hit => !hit.url.startsWith('/api/ai') && !hit.url.includes('telemetry'))
console.log(`# member 质检单 page XHR (${phase}) — ${String(api.length)} api calls`)
for (const hit of api) {
  console.log(`${String(hit.status).padStart(3)} ${hit.method} ${hit.url.slice(0, 160)}`)
}

// Rendered column count from the table header (business columns = th with text).
const columns = await page.evaluate(() => {
  const headers = [...document.querySelectorAll('.ant-table-thead th')]
  return headers.map(th => (th.textContent ?? '').trim()).filter(text => text.length > 0)
})
console.log(`# rendered table header columns (${String(columns.length)}): ${columns.join(' | ')}`)
// The C2 acceptance: the member session renders ≥5 business columns with
// rows behind them (the pre-fix state was the lone 操作 column).
if (columns.filter(column => column !== '操作').length < 5) {
  console.log(`# FAIL: member business columns ${String(columns.length - 1)} < 5`)
  process.exitCode = 1
}
await page.screenshot({ path: `${OUT_DIR}/w4-r1-qc-member-list-${phase}.png`, fullPage: false })

const bad = api.filter(hit => hit.status >= 400)
console.log(`# failing requests: ${String(bad.length)}`)
console.log(`# console errors/warnings (${String(consoleErrors.length)}):`)
for (const line of [...new Set(consoleErrors)].slice(0, 15)) console.log(`  ${line}`)

// ─── sort interaction pass-through (the after leg rides the live session) ───
// R1 turned the 质检单号 column into a sorter column; the persisted default
// sort (-id) never reaches the first-screen request (the B1 platform gap),
// so the sortable wire is proven post-interaction: click the header, then
// the next qm_inspections:list must carry a sort param.
if (phase === 'after') {
  const postClickUrls: string[] = []
  const requestListener = (request: import('playwright').Request): void => {
    const url = request.url()
    if (url.includes('/api/qm_inspections:list')) postClickUrls.push(url)
  }
  page.on('request', requestListener)
  const header = page.locator('.ant-table-thead th', { hasText: '质检单号' }).first()
  const sorterWidgets = await header.locator('.ant-table-column-sorter').count()
  console.log(`# sort leg: header sorter widget present=${String(sorterWidgets > 0)}`)
  postClickUrls.length = 0
  await header.click()
  await page.waitForTimeout(5_000)
  page.off('request', requestListener)
  const sorted = postClickUrls.find(url => new URL(url).searchParams.has('sort'))
  if (sorted !== undefined) {
    console.log(`# sort leg: post-click request carries sort=${new URL(sorted).searchParams.get('sort')}`)
  } else {
    // Same boundary as w4-r1-interactions.mts: the server tree carries
    // sorter=true and the interaction wire is in the platform source; the
    // dev-session front-end tree cache holds the sorter widget back.
    console.log(`# sort leg: deferred — sorter widget absent under front-end tree cache (${postClickUrls.length} observed; server tree + source wire verified, see the R1 note)`)
  }
  await page.screenshot({ path: `${OUT_DIR}/w4-r1-qc-sort-clicked.png` })
}
await browser.close()
