/**
 * Graph-page default-view e2e (keyless): with the kg domain opted in and an
 * in-process graph store seeded the way kg-build would (the kb-workbench
 * overlay pattern), opening the 图谱 tab must draw existing graph data by
 * itself — a canvas (or the no-WebGL relation list) with nodes, never the
 * "legend renders but zero entities" empty canvas. The gateway-face stats
 * assertion pins the same guarantee server-side. The geometry cases pin the
 * composer-overlay scroll chain: the canvas fills the viewport-bounded
 * viewArea (wheel zooms, the view's own .page never scrolls under it),
 * the canvas follows sidebar drags through its ResizeObserver, narrow
 * viewports stack the split without horizontal overflow, and the zoom
 * control cluster stays clickable.
 * Run: pnpm run test:web -- kg-graph-page
 */

import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { describe, beforeAll, beforeEach, afterEach, afterAll, expect, it } from 'vitest'
import { chromium } from 'playwright'
import type { Browser, Page } from 'playwright'
import KbGraphRuntime from '@deepseek-ai/dsh-kb-graph'
import { kgNodeTypeId, kgRelationId } from '@deepseek-ai/dsh-kb-graph'
import * as KbGraphSqlite from '@deepseek-ai/dsh-kb-graph-sqlite'
import { launchWebScaffold, seedSession, watchConsole } from './scaffold.ts'
import type { WebScaffold } from './scaffold.ts'
import { ZH_BROWSER_LOCALE } from './support.ts'

const OVERLAY = fileURLToPath(new URL('./kg-graph-page.overlay.yml', import.meta.url))
/** A committed closed-turn fixture: the seeded session that hosts the view ring. */
const SEED_FIXTURE = fileURLToPath(new URL('./snapshots/navigation-panes/seed.jsonl', import.meta.url))
const SEED_ID = 'kg-graph-page-seed'

describe('kg graph page (in-memory seeded store, Chinese UI)', () => {
  let scaffold: WebScaffold
  let browser: Browser
  let page: Page
  let tripwire: ReturnType<typeof watchConsole> = { warnings: [], pageErrors: [] }
  let slotErrors: string[] = []

  beforeAll(async () => {
    scaffold = await launchWebScaffold({ extraOverlayPath: OVERLAY })
    // The kg capability is a product overlay, not a web-app default: mount
    // it in-process exactly as an overlay row would (seam + store).
    const ctx = scaffold.ctx
    await ctx.plugin(KbGraphRuntime)
    await ctx.plugin(KbGraphSqlite, { path: ':memory:' })
    // The view ring lives on a session; seed one closed turn the
    // navigation-panes way (zero model calls).
    await seedSession(scaffold, await readFile(SEED_FIXTURE, 'utf8'), SEED_ID)
    const graph = ctx.get('kbGraph')
    if (graph === undefined) throw new Error('kbGraph did not compose')
    const now = new Date().toISOString()
    await graph.upsertNode({ id: 'e2e:company:hongfa', tenantId: 'default', type: kgNodeTypeId('company'), name: '宏发食品', naturalKey: '宏发食品', createdAt: now, updatedAt: now })
    await graph.upsertNode({ id: 'e2e:product:soy', tenantId: 'default', type: kgNodeTypeId('product'), name: '黄豆酱油', naturalKey: '黄豆酱油', createdAt: now, updatedAt: now })
    await graph.upsertEdges([{
      id: 'e2e:produces:1',
      tenantId: 'default',
      srcId: 'e2e:company:hongfa',
      dstId: 'e2e:product:soy',
      relation: kgRelationId('produces'),
      fact: '宏发食品生产黄豆酱油',
      confidence: 1,
      provenance: { sourceSystem: 'kb', sourceId: 'kg-graph-page-e2e', extractedAt: now },
      validFrom: now,
    }])
    browser = await chromium.launch()
  }, 180_000)

  beforeEach(async () => {
    page = await browser.newPage({ viewport: { width: 1680, height: 1000 }, locale: ZH_BROWSER_LOCALE })
    tripwire = watchConsole(page)
    slotErrors = []
    page.on('console', (message) => {
      if (message.type() === 'error' && /slot entry crashed/i.test(message.text())) {
        slotErrors.push(message.text())
      }
    })
    await page.goto(scaffold.baseUrl, { waitUntil: 'load' })
    await page.waitForSelector('[class*="frame"]', { timeout: 30_000 })
    const welcome = page.locator('[class*="onboardingOverlay"]')
    if (await welcome.count() > 0) {
      await welcome.getByRole('button').click()
      await welcome.waitFor({ state: 'detached', timeout: 15_000 })
    }
  }, 120_000)

  afterEach(async () => {
    const failures: unknown[] = []
    try {
      expect({
        pageErrors: tripwire.pageErrors,
        slotErrors,
        warnings: tripwire.warnings,
      }).toEqual({
        pageErrors: [],
        slotErrors: [],
        warnings: [],
      })
    } catch (error) {
      failures.push(error)
    }
    await page?.close().catch((error: unknown) => failures.push(error))
    if (failures.length === 1) throw failures[0]
    if (failures.length > 1) throw new AggregateError(failures, 'kg graph page case cleanup failed')
  })

  afterAll(async () => {
    const failures: unknown[] = []
    await browser?.close().catch((error: unknown) => failures.push(error))
    await scaffold?.close().catch((error: unknown) => failures.push(error))
    if (failures.length === 1) throw failures[0]
    if (failures.length > 1) throw new AggregateError(failures, 'kg graph page cleanup failed')
  })

  it('answers stats with the seeded entities over the gateway face', async () => {
    const stats = await scaffold.ctx.apiProxy.kg.stats({ rpcId: 'kg-e2e-stats' as never, payload: {} })
    expect(stats.result.ok, `kg.stats failed: ${JSON.stringify(stats.result)}`).toBe(true)
    if (stats.result.ok) {
      expect(stats.result.value.entities).toBeGreaterThanOrEqual(2)
      expect(stats.result.value.node_types).toBeGreaterThan(0)
    }
  })

  it('draws the default view on tab open — no manual seed typing', { timeout: 120_000 }, async () => {
    await openKgTab(page)
    await expect.poll(
      () => page.getByText('画布还是空的').count(),
      { timeout: 15_000 },
    ).toBe(0)
    await page.getByText('类型图例').waitFor({ timeout: 15_000 })
  })

  it('fills the viewport-bounded view area and keeps the wheel over the canvas zoom-only', { timeout: 120_000 }, async () => {
    await openKgTab(page)
    const viewport = page.getByTestId('kg-canvas-viewport')
    await viewport.waitFor()
    // Wide (1680×1000): the canvas resolves against the real viewport height,
    // not the old min-height floor.
    const wide = await viewport.boundingBox()
    expect(wide!.height).toBeGreaterThanOrEqual(500)
    // Mid (1280×800): the composer clearance eats most of the flex fill, so
    // the canvas rides its 380px floor — the flex chain answered (not the
    // old dead 300px), and the overflow rolls the page scroller.
    await page.setViewportSize({ width: 1280, height: 800 })
    const mid = await viewport.boundingBox()
    expect(mid!.height).toBeGreaterThanOrEqual(360)
    // Wheel over the canvas is sigma's zoom: the view's own .page scroller
    // and the session-level scroll body both stay put.
    const box = (await viewport.boundingBox())!
    const kgPage = page.getByTestId('kg-page')
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
    await page.mouse.wheel(0, -240)
    await page.waitForTimeout(300)
    expect(await kgPage.evaluate(el => el.scrollTop)).toBe(0)
    expect(await page.locator('[data-conversation-scroll]').evaluate(el => el.scrollTop)).toBe(0)
    // Wheel over the side panel (outside the canvas) scrolls .page, and the
    // session-level scroll body still never moves.
    const legend = page.getByText('类型图例')
    const legendBox = (await legend.boundingBox())!
    await page.mouse.move(legendBox.x + legendBox.width / 2, legendBox.y + 20)
    await page.mouse.wheel(0, 240)
    await expect.poll(() => kgPage.evaluate(el => el.scrollTop), { timeout: 10_000 }).toBeGreaterThan(0)
    expect(await page.locator('[data-conversation-scroll]').evaluate(el => el.scrollTop)).toBe(0)
  })

  it('follows sidebar drags with a canvas resize (container resize, not window)', { timeout: 120_000 }, async () => {
    await openKgTab(page)
    const canvas = page.getByTestId('kg-canvas-viewport').locator('canvas').first()
    await canvas.waitFor()
    const canvasWidth = () => canvas.evaluate(el => (el as HTMLCanvasElement).width)
    const before = await canvasWidth()
    // Drag the sidebar handle wider; no window resize fires, so only the
    // canvas's own ResizeObserver can carry the new geometry to sigma.
    const handle = page.locator('[data-side="sidebar"]')
    const handleBox = (await handle.boundingBox())!
    await page.mouse.move(handleBox.x + handleBox.width / 2, handleBox.y + 40)
    await page.mouse.down()
    await page.mouse.move(handleBox.x + handleBox.width / 2 + 120, handleBox.y + 40, { steps: 8 })
    await page.mouse.up()
    await expect.poll(canvasWidth, { timeout: 10_000 }).toBeLessThan(before)
  })

  it('stacks the split on narrow viewports without horizontal overflow', { timeout: 120_000 }, async () => {
    // Open wide first (the narrow sidebar auto-collapse hides the session
    // tree), then shrink: the media query restacks the live layout. The
    // frame's ResizeObserver settles the auto-collapsed sidebar over a
    // frame, so wait for the collapsed attribute before pinning geometry.
    await openKgTab(page)
    await page.setViewportSize({ width: 375, height: 812 })
    await page.locator('[data-sidebar-collapsed="true"]').first().waitFor({ timeout: 10_000 })
    const flex = await page.getByTestId('kg-main-split').evaluate(el => getComputedStyle(el).flexDirection)
    expect(flex).toBe('column')
    const overflow = await page.evaluate(() =>
      document.documentElement.scrollWidth - document.documentElement.clientWidth)
    expect(overflow).toBeLessThanOrEqual(0)
    // The collapsed rail plus page gutters leave ~279px of canvas; the poll
    // rides out the frame's column transition before pinning the width.
    await expect
      .poll(async () => (await page.getByTestId('kg-canvas-viewport').boundingBox())?.width, { timeout: 10_000 })
      .toBeGreaterThan(250)
  })

  it('keeps the zoom control cluster clickable', { timeout: 120_000 }, async () => {
    await openKgTab(page)
    await page.getByRole('button', { name: '放大' }).click()
    await page.getByRole('button', { name: '缩小' }).click()
    await page.getByRole('button', { name: '重置视图（适配全图）' }).click()
    // The tripwire in afterEach owns the zero-console-error assertion.
  })
})

/** Open the seeded session's 图谱 tab and wait for a drawn canvas or list. */
async function openKgTab(target: Page): Promise<void> {
  // Open the seeded session from the sidebar (ungrouped bucket: group row
  // first, session row second — the seeded-history pattern).
  const groupRow = target.locator('[role="treeitem"]').first()
  await groupRow.waitFor({ timeout: 30_000 })
  await groupRow.click()
  await target.locator('[role="treeitem"]').nth(1).click()
  await target.getByRole('tab', { name: '图谱', exact: true }).waitFor({ timeout: 30_000 })
  await target.getByRole('tab', { name: '图谱', exact: true }).click()
  // The default view walks on open: a rendered canvas implies nodes > 0
  // (the unbuilt branch renders no canvas), and the no-WebGL fallback is
  // the same-semantics relation list.
  await target.locator('canvas').or(target.getByTestId('kg-canvas-list')).first().waitFor({ timeout: 15_000 })
}
