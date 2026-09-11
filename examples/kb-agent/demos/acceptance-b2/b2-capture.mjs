/**
 * B2 acceptance capture: the knowledge-graph tab must open with a drawn
 * canvas by itself (the default view) on a world the setup chain just
 * rebuilt — no manual seed typing. The interactive verification happened in
 * the chrome-devtools MCP browser (step 0 evidence: pre-fix the tab showed
 * the empty-canvas guide while the on-disk graph held 1293 nodes, and a
 * manual phrase drew it instantly); Playwright is the landing channel the
 * n*-capture scripts established because the MCP server rejects writes into
 * the workspace.
 *
 * Usage (against a freshly rebuilt world and a restarted dsh web):
 *   node examples/kb-agent/demos/acceptance-b2/b2-capture.mjs
 */
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(path.join(path.dirname(fileURLToPath(import.meta.url)), '../../../../apps/web/package.json'))
const { chromium } = require('playwright')

const here = path.dirname(fileURLToPath(import.meta.url))
const base = process.env.DSH_WEB_BASE ?? 'http://127.0.0.1:3080'

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1680, height: 1000 }, locale: 'zh-CN' })
await page.goto(base, { waitUntil: 'load', timeout: 60_000 })
await page.waitForSelector('[class*="frame"]', { timeout: 30_000 })
const welcome = page.locator('[class*="onboardingOverlay"]')
if (await welcome.count() > 0) {
  await welcome.getByRole('button').click()
  await welcome.waitFor({ state: 'detached', timeout: 15_000 })
}

// Any session owns the view ring; pick the newest conversation.
const groupRow = page.locator('[role="treeitem"]').first()
await groupRow.waitFor({ timeout: 30_000 })
await groupRow.click()
await page.locator('[role="treeitem"]').nth(1).click()
await page.getByRole('tab', { name: '图谱', exact: true }).waitFor({ timeout: 30_000 })
await page.getByRole('tab', { name: '图谱', exact: true }).click()

// The default view draws on open: a canvas implies nodes > 0 (the unbuilt
// branch renders no canvas); the no-WebGL fallback is the relation list.
await page.locator('canvas').or(page.getByTestId('kg-canvas-list')).first().waitFor({ timeout: 15_000 })
await page.waitForTimeout(2500)
const emptyHintCount = await page.getByText('画布还是空的').count()
await page.screenshot({ path: path.join(here, 'b2-01-kg-tab-default-view.png') })
console.log(`b2-01-kg-tab-default-view.png saved; empty-canvas hint count = ${String(emptyHintCount)}`)
if (emptyHintCount !== 0) throw new Error('FAIL: the graph tab still shows the empty-canvas guide')
console.log('PASS: graph tab opens with a drawn default view (no manual seed typing)')

await browser.close()
