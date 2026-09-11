/**
 * Graph-page default-view e2e (keyless): with the kg domain opted in and an
 * in-process graph store seeded the way kg-build would (the kb-workbench
 * overlay pattern), opening the 图谱 tab must draw existing graph data by
 * itself — a canvas (or the no-WebGL relation list) with nodes, never the
 * "legend renders but zero entities" empty canvas. The gateway-face stats
 * assertion pins the same guarantee server-side.
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
    // Open the seeded session from the sidebar (ungrouped bucket: group row
    // first, session row second — the seeded-history pattern).
    const groupRow = page.locator('[role="treeitem"]').first()
    await groupRow.waitFor({ timeout: 30_000 })
    await groupRow.click()
    await page.locator('[role="treeitem"]').nth(1).click()
    await page.getByRole('tab', { name: '图谱', exact: true }).waitFor({ timeout: 30_000 })
    await page.getByRole('tab', { name: '图谱', exact: true }).click()
    // The default view walks on open: a rendered canvas implies nodes > 0
    // (the unbuilt branch renders no canvas), and the no-WebGL fallback is
    // the same-semantics relation list.
    await page.locator('canvas').or(page.getByTestId('kg-canvas-list')).first().waitFor({ timeout: 15_000 })
    await expect.poll(
      () => page.getByText('画布还是空的').count(),
      { timeout: 15_000 },
    ).toBe(0)
    await page.getByText('类型图例').waitFor({ timeout: 15_000 })
  })
})
