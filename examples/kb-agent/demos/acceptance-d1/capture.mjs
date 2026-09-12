/**
 * D1 acceptance screenshots: hub portal pages over the live :3080 gateway.
 * Deep links 404 until D3 (gateway fallback), so load the SPA entry and
 * navigate with history.pushState + popstate — language-independent and no
 * UI-text matching. Each shot asserts the page rendered content (not the
 * gateway 404 body, not an empty shell).
 *
 * Usage: node examples/kb-agent/demos/acceptance-d1/capture.mjs
 */
import { createRequire } from 'node:module'
import { mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

// Playwright resolves from apps/web (the n*-capture precedent: the MCP
// browser rejects workspace writes, this repo has no root playwright dep).
const require = createRequire(join(dirname(fileURLToPath(import.meta.url)), '../../../../apps/web/package.json'))
const { chromium } = require('playwright')

const here = dirname(fileURLToPath(import.meta.url))
mkdirSync(here, { recursive: true })

const base = process.env.PORTAL_BASE ?? 'http://localhost:3080/nocobase/dist/hub'
const shots = [
  { route: '/my-tasks', file: 'd1-my-tasks.png' },
  { route: '/kb-search', file: 'd1-kb-search.png' },
  { route: '/articles', file: 'd1-articles.png' },
  { route: '/assignments', file: 'd1-assignments.png' },
  { route: '/purchase-orders', file: 'd1-purchase-orders.png' },
  { route: '/suppliers', file: 'd1-suppliers.png' },
]

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
const pageErrors = []
page.on('pageerror', error => pageErrors.push(error.message))
await page.goto(`${base}/`, { waitUntil: 'networkidle' })
await page.waitForTimeout(1200)
// The portal bounces anonymous visitors to /login — sign in as the demo
// admin (QUICKSTART credentials) before capturing.
if (page.url().includes('/login')) {
  await page.fill('#basic-account', process.env.NOCOBASE_ROOT_EMAIL ?? 'admin@nocobase.com')
  await page.fill('#basic-password', process.env.NOCOBASE_ROOT_PASSWORD ?? 'admin123')
  await page.getByRole('button', { name: '登录' }).click()
  await page.waitForURL(url => !url.href.includes('/login'), { timeout: 15000 })
  await page.waitForTimeout(1800)
}

for (const shot of shots) {
  // pushState must carry the full prefixed path — a bare "/my-tasks" drops
  // the /nocobase/dist/hub basename and the router renders nothing.
  await page.evaluate(url => {
    window.history.pushState({}, '', url)
    window.dispatchEvent(new PopStateEvent('popstate'))
  }, `${base}${shot.route}`)
  // First navigation lazy-loads the route chunk; poll until the shell swaps
  // in real content (or give up after 15s).
  let text = ''
  for (let attempt = 0; attempt < 30; attempt += 1) {
    await page.waitForTimeout(500)
    text = await page.evaluate(() => document.body.innerText)
    if (text.trim().length >= 100) break
  }
  if (text.includes('The requested path could not be found')) throw new Error(`${shot.route}: portal shell 404`)
  if (text.trim().length < 40) throw new Error(`${shot.route}: page body too short — likely a render error`)
  await page.screenshot({ path: join(here, shot.file) })
  console.log(`captured ${shot.file} (${shot.route})`)
}

await browser.close()
if (pageErrors.length > 0) {
  console.log(`page errors (${pageErrors.length}):`)
  for (const message of pageErrors) console.log(`  ${message}`)
  process.exitCode = 1
} else {
  console.log('done — zero page errors')
}
