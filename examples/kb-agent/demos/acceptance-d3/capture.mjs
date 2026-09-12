/**
 * D3 acceptance capture: portal deep links open and render over the live
 * :3080 gateway (hard navigations, not in-SPA routing). Each route must
 * render its page shell — not the gateway 404 body, not a blank SPA root.
 *
 * Usage: node examples/kb-agent/demos/acceptance-d3/capture.mjs
 */
import { createRequire } from 'node:module'
import { mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(join(dirname(fileURLToPath(import.meta.url)), '../../../../apps/web/package.json'))
const { chromium } = require('playwright')

const here = dirname(fileURLToPath(import.meta.url))
mkdirSync(here, { recursive: true })
const base = 'http://localhost:3080/nocobase/dist'
const routes = [
  { path: '/hub/my-tasks', file: 'd3-hub-my-tasks-deeplink.png', expect: /我的任务|My tasks/ },
  { path: '/hub/kb-search', file: 'd3-hub-kb-search-deeplink.png', expect: /知识|Knowledge|搜索/ },
  { path: '/hub/purchase-orders', file: 'd3-hub-purchase-orders-deeplink.png', expect: /采购|Purchase/ },
  { path: '/crm/deals', file: 'd3-crm-deals-deeplink.png', expect: /订单|商机|Deals/ },
]

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
const errors = []
page.on('pageerror', error => errors.push(error.message))

// Sign in once on the hub entry; the cookie carries across both portals.
await page.goto(`${base}/hub/`, { waitUntil: 'networkidle' })
await page.waitForTimeout(1200)
if (page.url().includes('/login')) {
  await page.fill('#basic-account', process.env.NOCOBASE_ROOT_EMAIL ?? 'admin@nocobase.com')
  await page.fill('#basic-password', process.env.NOCOBASE_ROOT_PASSWORD ?? 'admin123')
  await page.getByRole('button', { name: '登录' }).click()
  await page.waitForURL(url => !url.href.includes('/login'), { timeout: 15000 })
  await page.waitForTimeout(1500)
}

for (const route of routes) {
  // Hard navigation: exactly what a user pasting the URL (or hitting F5) does.
  await page.goto(`${base}${route.path}`, { waitUntil: 'load' })
  // The shell (sidebar) renders before the route's data does; poll until the
  // route's own content appears, not merely any body text.
  let text = ''
  for (let i = 0; i < 40; i += 1) {
    await page.waitForTimeout(500)
    text = await page.evaluate(() => document.body.innerText)
    if (text.includes('The requested path could not be found')) break
    if (route.expect.test(text)) break
  }
  if (text.includes('The requested path could not be found')) throw new Error(`${route.path}: gateway 404 body served`)
  if (!route.expect.test(text)) throw new Error(`${route.path}: page content does not match ${route.expect} (got: ${text.slice(0, 160).replace(/\n/g, '|')})`)
  await page.screenshot({ path: join(here, route.file) })
  console.log(`deep link ${route.path} renders (${page.url()})`)
}

await browser.close()
if (errors.length > 0) {
  console.log(`page errors: ${errors.join(' | ')}`)
  process.exitCode = 1
} else {
  console.log('done — zero page errors')
}
