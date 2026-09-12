/**
 * D5: real trusted mouse click on a kg canvas node — the closing evidence
 * for technical-debt ④. Headed chromium (real GPU compositor, so WebGL
 * picking reads real colors; headless software rendering reads zero and
 * never hits), video recorded, against the gateway's static dist.
 *
 * Coordinate strategy: no grid scan. Locate the sigma instance through the
 * React fiber (a ref whose .current has graphToViewport), read the target
 * node's graph x/y, convert with sigma.graphToViewport, offset by the
 * canvas bounding rect → the exact viewport pixel of the node center. Wait
 * for a two-rAF stable window first (ResizeObserver idle) so the camera
 * settled, then a single page.mouse.click and poll the details panel.
 *
 * Usage: node examples/kb-agent/demos/acceptance-d5/kg-real-click.mjs
 * Fallback after the 1h budget: manual SOP (see this directory's README).
 */
import { createRequire } from 'node:module'
import { mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(join(dirname(fileURLToPath(import.meta.url)), '../../../../apps/web/package.json'))
const { chromium } = require('playwright')

const here = dirname(fileURLToPath(import.meta.url))
const videoDir = join(here, 'video')
mkdirSync(videoDir, { recursive: true })
const base = process.env.DSH_BASE ?? 'http://localhost:3080/'
const TARGET_LABEL = process.env.D5_TARGET ?? '周慕云'

const browser = await chromium.launch({ headless: false })
const context = await browser.newContext({
  viewport: { width: 1680, height: 1000 },
  locale: 'zh-CN',
  recordVideo: { dir: videoDir, size: { width: 1680, height: 1000 } },
})
const page = await context.newPage()
const errors = []
page.on('pageerror', error => { errors.push(String(error)) })

await page.goto(base, { waitUntil: 'load', timeout: 60_000 })
await page.waitForSelector('[class*="frame"]', { timeout: 30_000 })
const welcome = page.locator('[class*="onboardingOverlay"]')
if (await welcome.count() > 0) {
  await welcome.getByRole('button').click()
  await welcome.waitFor({ state: 'detached', timeout: 15_000 })
}
const groupRow = page.locator('[role="treeitem"]').first()
await groupRow.waitFor({ timeout: 30_000 })
await groupRow.click()
await page.locator('[role="treeitem"]').nth(1).click()
await page.getByRole('tab', { name: '图谱', exact: true }).waitFor({ timeout: 30_000 })
await page.getByRole('tab', { name: '图谱', exact: true }).click()
await page.locator('[data-testid="kg-canvas-viewport"] canvas').first().waitFor({ timeout: 15_000 })
await page.waitForTimeout(3000)

/** Find the sigma instance via React fiber: any component fiber whose hook
 * chain holds a ref whose current exposes graphToViewport. */
const locate = () => page.evaluate(targetLabel => {
  const canvas = document.querySelector('[data-testid="kg-canvas-viewport"] canvas')
  if (canvas === null) return { error: 'no canvas' }
  // sigma@3 creates its canvases imperatively — the React fiber lives on the
  // React-rendered viewport container, not the canvas itself.
  const host = document.querySelector('[data-testid="kg-canvas-viewport"]')
  const fiberKey = Object.keys(host).find(key => key.startsWith('__reactFiber$'))
  if (fiberKey === undefined) return { error: 'no react fiber on viewport host' }
  let fiber = host[fiberKey]
  const seen = new Set()
  while (fiber !== null && fiber.return !== undefined && !seen.has(fiber)) {
    seen.add(fiber)
    for (let hook = fiber.memoizedState; hook !== null && typeof hook === 'object'; hook = hook.next) {
      const ref = hook.memoizedState
      if (ref !== null && typeof ref === 'object' && typeof ref.current?.graphToViewport === 'function' && ref.current?.graph !== undefined) {
        const sigma = ref.current
        // Candidate target: an entity node whose label matches, else any
        // node with neighbors (degree > 0) so the highlight ring shows.
        let target = null
        const fallback = []
        sigma.graph.forEachNode((id, attrs) => {
          if (target === null && typeof attrs.label === 'string' && attrs.label.includes(targetLabel)) target = { id, label: attrs.label }
          if (fallback.length < 40) fallback.push({ id, label: attrs.label ?? id, degree: sigma.graph.degree(id) })
        })
        if (target === null) {
          fallback.sort((a, b) => b.degree - a.degree)
          target = fallback[0] ?? null
        }
        if (target === null) return { error: 'graph has no nodes' }
        const pos = sigma.graph.getNodeAttributes(target.id)
        const point = sigma.graphToViewport({ x: pos.x, y: pos.y })
        const rect = canvas.getBoundingClientRect()
        return {
          target,
          x: rect.left + point.x,
          y: rect.top + point.y,
          canvasRect: { left: rect.left, top: rect.top, width: rect.width, height: rect.height },
          nodeCount: fallback.length,
        }
      }
    }
    fiber = fiber.return
  }
  return { error: 'no sigma ref found in fiber chain' }
}, TARGET_LABEL)

// Stability window: two consecutive animation frames with an unchanged
// click point (camera settled; ResizeObserver idle).
let point = null
let last = null
for (let attempt = 0; attempt < 40; attempt += 1) {
  const next = await locate()
  if (next.error !== undefined) throw new Error(`locate failed: ${next.error}`)
  if (last !== null && point !== null && Math.abs(next.x - last.x) < 0.5 && Math.abs(next.y - last.y) < 0.5) { point = next; break }
  last = next
  point = next
  await page.evaluate(() => new Promise(resolve => { requestAnimationFrame(() => requestAnimationFrame(resolve)) }))
  await page.waitForTimeout(250)
}
if (point === null) throw new Error('no stable click point')
console.log(`target node: ${point.target.label} (id ${point.target.id}) at (${point.x.toFixed(1)}, ${point.y.toFixed(1)}); graph holds ~${point.nodeCount} nodes`)

const detailsBefore = await page.evaluate(() => document.querySelector('[data-testid="kg-page"]')?.innerText ?? '')
await page.screenshot({ path: join(here, 'd5-before-click.png') })

// The real trusted click (CDP Input domain; isTrusted=true on the page).
await page.mouse.click(point.x, point.y)

let detailsAfter = ''
let matched = false
for (let attempt = 0; attempt < 24; attempt += 1) {
  await page.waitForTimeout(500)
  detailsAfter = await page.evaluate(() => document.querySelector('[data-testid="kg-page"]')?.innerText ?? '')
  if (detailsAfter !== detailsBefore && detailsAfter.includes(point.target.label)) { matched = true; break }
}
await page.screenshot({ path: join(here, 'd5-after-click.png') })
await context.close()
await browser.close()

const report = [
  `target: ${point.target.label}`,
  `click point: (${point.x.toFixed(1)}, ${point.y.toFixed(1)}) viewport px`,
  `details changed: ${detailsAfter !== detailsBefore}`,
  `details carries target label: ${matched}`,
  `page errors: ${errors.length === 0 ? 'none' : errors.join(' | ')}`,
]
console.log(report.join('\n'))
if (!matched) {
  console.error('FAIL: trusted click did not select the node (picking miss or remount race) — see video/')
  process.exit(1)
}
console.log('PASS: real trusted click selected the node; evidence: d5-before-click.png / d5-after-click.png / video/')
