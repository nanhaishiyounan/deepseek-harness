/**
 * KG workbench P2 e2e (keyless): the five P2 surfaces over the real
 * in-process stack (seam + sqlite store + gateway), every write riding the
 * real apiproxy RPCs from the browser — the ontology tree's KGCL CRUD with
 * the ontology_change revision trail, the change feed's rollback (edges
 * retire on the live graph), the gray-zone review queue's merge verdict
 * (the corefers_with edge lands, the queue drains), the semantic coloring
 * re-deriving from a freshly edited class, and the revision replay banner.
 * Run: pnpm run test:web -- kg-workbench-p2
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
const SEED_ID = 'kg-workbench-p2-seed'
const TENANT = 'default'
const DEMOS = fileURLToPath(new URL('../../../examples/kb-agent/demos/', import.meta.url))

describe('kg workbench P2 (ontology tree, change feed, review, coloring, replay)', () => {
  let scaffold: WebScaffold
  let browser: Browser
  let page: Page
  let tripwire: ReturnType<typeof watchConsole> = { warnings: [], pageErrors: [] }
  let slotErrors: string[] = []

  beforeAll(async () => {
    scaffold = await launchWebScaffold({ extraOverlayPath: OVERLAY })
    const ctx = scaffold.ctx
    await ctx.plugin(KbGraphRuntime)
    await ctx.plugin(KbGraphSqlite, { path: ':memory:' })
    await seedSession(scaffold, await readFile(SEED_FIXTURE, 'utf8'), SEED_ID)
    const graph = ctx.get('kbGraph')
    if (graph === undefined) throw new Error('kbGraph did not compose')
    const seeded = new Date().toISOString()

    // Two tri-cliques: the louvain read's two-community fixture.
    const cliqueNodes = async (prefix: string, type: 'company' | 'product'): Promise<void> => {
      for (const suffix of ['一', '二', '三']) {
        await graph.upsertNode({
          id: `e2e:${prefix}:${suffix}`, tenantId: TENANT, type: kgNodeTypeId(type),
          naturalKey: `${prefix}${suffix}`, name: `${prefix}${suffix}厂`, createdAt: seeded, updatedAt: seeded,
        })
      }
    }
    await cliqueNodes('alpha', 'company')
    await cliqueNodes('beta', 'product')
    const SUFFIXES = ['一', '二', '三']
    await graph.upsertEdges(SUFFIXES.map((suffix, index) => ({
      id: `e2e:clique:a${suffix}`,
      tenantId: TENANT,
      srcId: `e2e:alpha:${suffix}`,
      dstId: `e2e:alpha:${SUFFIXES[(index + 1) % 3]}`,
      relation: kgRelationId('supplies'),
      confidence: 1,
      provenance: { sourceSystem: 'kb', sourceId: `seed-a${suffix}`, extractedAt: seeded },
      validFrom: seeded,
    })))
    await graph.upsertEdges(SUFFIXES.map((suffix, index) => ({
      id: `e2e:clique:b${suffix}`,
      tenantId: TENANT,
      srcId: `e2e:beta:${suffix}`,
      dstId: `e2e:beta:${SUFFIXES[(index + 1) % 3]}`,
      relation: kgRelationId('supplies'),
      confidence: 1,
      provenance: { sourceSystem: 'kb', sourceId: `seed-b${suffix}`, extractedAt: seeded },
      validFrom: seeded,
    })))

    // The gray-zone review pair family: doc entities vs business rows.
    await graph.upsertNode({ id: 'kb:doc#大豆', tenantId: TENANT, type: kgNodeTypeId('ingredient'), naturalKey: '大豆', name: '大豆', createdAt: seeded, updatedAt: seeded })
    await graph.upsertNode({ id: 'kb:doc#酱油', tenantId: TENANT, type: kgNodeTypeId('ingredient'), naturalKey: '酱油', name: '酱油', createdAt: seeded, updatedAt: seeded })
    await graph.upsertNode({ id: 'nocobase:materials:7', tenantId: TENANT, type: kgNodeTypeId('ingredient'), naturalKey: '非转基因大豆原料', name: '非转基因大豆原料', createdAt: seeded, updatedAt: seeded })
    await graph.upsertNode({ id: 'nocobase:materials:8', tenantId: TENANT, type: kgNodeTypeId('ingredient'), naturalKey: '酿造酱油半成品', name: '酿造酱油半成品', createdAt: seeded, updatedAt: seeded })
    await graph.putEpisode({
      uuid: 'ingest:cross-source',
      tenantId: TENANT,
      source: 'ingest',
      name: '跨源共指对齐',
      content: 'crossSourceAlign v2：判定 2 对，落边 0 条，审核队列 2 对。',
      validAt: seeded,
      createdAt: seeded,
      metadata: {
        review: [
          { docId: 'kb:doc#大豆', rowId: 'nocobase:materials:7', docName: '大豆', rowName: '非转基因大豆原料', verdict: { same: true, confidence: 0.72, reason: '名称包含，语义相近' } },
          { docId: 'kb:doc#酱油', rowId: 'nocobase:materials:8', docName: '酱油', rowName: '酿造酱油半成品', verdict: { same: true, confidence: 0.66, reason: '工艺上下游，同一物' } },
        ],
      },
    })

    // One ai-edit episode owning one live edge: the rollback target.
    await graph.upsertNode({ id: 'e2e:zhx', tenantId: TENANT, type: kgNodeTypeId('company'), naturalKey: '张红喜', name: '张红喜', createdAt: seeded, updatedAt: seeded })
    await graph.upsertNode({ id: 'e2e:zhlv', tenantId: TENANT, type: kgNodeTypeId('company'), naturalKey: '中粮', name: '中粮', createdAt: seeded, updatedAt: seeded })
    await graph.upsertEdges([{
      id: 'e2e:ai:supply',
      tenantId: TENANT,
      srcId: 'e2e:zhx',
      dstId: 'e2e:zhlv',
      relation: kgRelationId('supplies'),
      fact: '张红喜供货中粮（ai-edit）',
      confidence: 1,
      provenance: { sourceSystem: 'ai-edit', sourceId: 'e2e:zhx', extractedAt: seeded },
      validFrom: seeded,
    }])
    await graph.putEpisode({
      uuid: 'ai-edit:e2e',
      tenantId: TENANT,
      source: 'ai-edit',
      name: '把张红喜的供应商关系改成中粮',
      content: '+ 新增关系 张红喜 —[supplies]→ 中粮',
      validAt: seeded,
      createdAt: seeded,
      metadata: { addedEdgeIds: ['e2e:ai:supply'] },
    })
    await graph.linkMentions('ai-edit:e2e', ['e2e:ai:supply'])

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
    if (failures.length > 1) throw new AggregateError(failures, 'kg workbench P2 case cleanup failed')
  })

  afterAll(async () => {
    const failures: unknown[] = []
    await browser?.close().catch((error: unknown) => failures.push(error))
    await scaffold?.close().catch((error: unknown) => failures.push(error))
    if (failures.length === 1) throw failures[0]
    if (failures.length > 1) throw new AggregateError(failures, 'kg workbench P2 cleanup failed')
  })

  it('serves the louvain partition and the review queue over the gateway face', async () => {
    const communities = await scaffold.ctx.apiProxy.kg.communities({ rpcId: 'kg-p2-communities' as never, payload: {} })
    expect(communities.result.ok, `kg.communities failed: ${JSON.stringify(communities.result)}`).toBe(true)
    if (communities.result.ok) {
      expect(communities.result.value.node_count).toBeGreaterThanOrEqual(10)
      expect(communities.result.value.communities.length).toBeGreaterThanOrEqual(2)
      expect(communities.result.value.modularity).toBeGreaterThan(0.2)
    }
    const queue = await scaffold.ctx.apiProxy.kg.reviewQueue({ rpcId: 'kg-p2-queue' as never, payload: {} })
    expect(queue.result.ok).toBe(true)
    if (queue.result.ok) {
      expect(queue.result.value.entries).toHaveLength(2)
      expect(queue.result.value.entries[0]?.doc_name).toBe('大豆')
    }
  })

  it('edits the ontology tree through KGCL and journals the revision', { timeout: 120_000 }, async () => {
    await openKgTab(page)
    await page.getByRole('tab', { name: '本体树' }).click()
    await page.getByTestId('kg-onto-tree').waitFor({ timeout: 15_000 })
    await page.screenshot({ path: `${DEMO_DIR()}00-onto-tree.png`, fullPage: true })

    // The product row's ＋子类 opens the add form; apply rides
    // kg.ontologyEdit. The row anchor is the <code>product</code> id chip —
    // hasText is case-insensitive and would otherwise match Product rows.
    const productRow = page.locator('[class*="ontoLine"]').filter({ has: page.locator('code', { hasText: /^product$/ }) }).first()
    await productRow.locator('button', { hasText: '＋子类' }).click()
    await page.getByPlaceholder('类 id（字母开头）').fill('FrozenTofu')
    await page.getByPlaceholder('显示名').fill('冷冻豆腐制品')
    await page.getByRole('button', { name: '应用' }).click()
    await page.getByTestId('kg-onto-notice').waitFor({ timeout: 15_000 })
    await page.screenshot({ path: `${DEMO_DIR()}01-onto-tree-edit.png`, fullPage: true })
    await expect.poll(async () => page.getByTestId('kg-onto-notice').textContent()).toContain('revision #')

    // The registry read carries the new class and the audit row.
    const schema = await scaffold.ctx.apiProxy.kg.schema({ rpcId: 'kg-p2-schema' as never, payload: {} })
    expect(schema.result.ok).toBe(true)
    if (schema.result.ok) {
      const added = schema.result.value.node_types.find((type: { id: string; label: string; status: string; source: string; extends?: string }) => type.id === 'FrozenTofu')
      expect(added?.label).toBe('冷冻豆腐制品')
      expect(added?.status).toBe('draft')
      expect(added?.source).toBe('agent-defined')
      expect(added?.extends).toBe('product')
      expect(schema.result.value.revisions?.[0]?.summary).toContain('ontology-edit')
    }
    // The human-edit episode landed in the ledger the change feed reads.
    const episodes = await scaffold.ctx.apiProxy.kg.episodes({ rpcId: 'kg-p2-episodes' as never, payload: {} })
    expect(episodes.result.ok).toBe(true)
    if (episodes.result.ok) {
      expect(episodes.result.value.episodes[0]?.source).toBe('human-edit')
      expect(episodes.result.value.episodes[0]?.name).toBe('本体编辑')
    }
  })

  it('colors the legend by ontology semantics once the class tree changes', { timeout: 120_000 }, async () => {
    await openKgTab(page)
    // Semantic mode is the default; a fresh subclass shares its root's hue.
    const legendDotOf = async (label: string): Promise<string | null> => {
      // Exact-label match: several FoodOn labels embed other labels as
      // substrings, and the row text is the label alone (the dot is
      // aria-hidden).
      const style = await page.locator('[class*="legendRow"]', { hasText: new RegExp(`^${label}$`) }).first().locator('[class*="legendDot"]').getAttribute('style', { timeout: 15_000 })
      if (style === null) throw new Error(`no legend row carrying "${label}"`)
      return style
    }
    const productDot = await legendDotOf('食品产品')
    const frozenDot = await legendDotOf('冷冻豆腐制品')
    expect(frozenDot).toBe(productDot)
    // Per-type hash mode breaks the family apart again.
    await page.locator('[data-testid="kg-color-mode"] button', { hasText: '按类型' }).click()
    const frozenHashed = await legendDotOf('冷冻豆腐制品')
    expect(frozenHashed).not.toBe(productDot)
    await page.screenshot({ path: `${DEMO_DIR()}02-semantic-coloring.png`, fullPage: true })
  })

  it('rolls an ai-edit episode back from the change feed and the edge retires', { timeout: 120_000 }, async () => {
    await openKgTab(page)
    await page.getByRole('tab', { name: '变更流' }).click()
    await page.getByTestId('kg-change-feed').waitFor({ timeout: 15_000 })
    await page.getByText('把张红喜的供应商关系改成中粮').waitFor({ timeout: 15_000 })
    await page.screenshot({ path: `${DEMO_DIR()}03-change-feed.png`, fullPage: true })

    const before = await liveEdgeCount(scaffold, '张红喜')
    await page.locator('[data-feed-source="ai-edit"] [class*="feedActions"] button', { hasText: '回滚到此之前' }).first().click()
    await page.getByTestId('kg-feed-notice').waitFor({ timeout: 15_000 })
    await expect.poll(async () => page.getByTestId('kg-feed-notice').textContent()).toContain('已回滚')

    // The rollback episode leads the refreshed ledger; the edge left the live graph.
    const after = await liveEdgeCount(scaffold, '张红喜')
    expect(after).toBe(before - 1)
    const episodes = await scaffold.ctx.apiProxy.kg.episodes({ rpcId: 'kg-p2-after-rollback' as never, payload: {} })
    expect(episodes.result.ok).toBe(true)
    if (episodes.result.ok) {
      expect(episodes.result.value.episodes[0]?.source).toBe('rollback')
    }
  })

  it('records a merge verdict from the review queue and drains it', { timeout: 120_000 }, async () => {
    await openKgTab(page)
    await page.getByRole('tab', { name: '变更流' }).click()
    await page.getByTestId('kg-review-queue').waitFor({ timeout: 15_000 })
    await page.getByTestId('kg-review-card').first().waitFor({ timeout: 15_000 })
    await page.screenshot({ path: `${DEMO_DIR()}04-review-queue.png`, fullPage: true })
    await expect.poll(async () => page.getByTestId('kg-review-card').first().textContent()).toContain('大豆')

    await page.locator('[data-testid="kg-review-card"]').first().getByRole('button', { name: '合并', exact: true }).click()
    await page.getByTestId('kg-feed-notice').waitFor({ timeout: 15_000 })
    await expect.poll(async () => page.getByTestId('kg-feed-notice').textContent()).toContain('已合并')

    // The queue reloaded without the decided pair; the corefers edge is live.
    await expect.poll(() => page.locator('[data-testid="kg-review-card"]').count(), { timeout: 15_000 }).toBe(1)
    const walk = await scaffold.ctx.apiProxy.kg.subgraph({ rpcId: 'kg-p2-merged' as never, payload: { seeds: ['大豆'], hops: 1 } })
    expect(walk.result.ok).toBe(true)
    if (walk.result.ok) {
      const merged = walk.result.value.edges.some((edge: { source: string; target: string }) =>
        edge.source === 'kb:doc#大豆' && edge.target === 'nocobase:materials:7')
      expect(merged).toBe(true)
    }
  })

  it('replays the graph at an episode instant through the history read', { timeout: 120_000 }, async () => {
    await openKgTab(page)
    await page.getByRole('tab', { name: '变更流' }).click()
    await page.getByTestId('kg-episode-list').waitFor({ timeout: 15_000 })
    await page.locator('[data-feed-source="ingest"] [class*="feedActions"] button', { hasText: '回放此时刻' }).first().click()

    // The graph mode returns with the frozen-snapshot banner and a canvas.
    await page.getByTestId('kg-replay-banner').waitFor({ timeout: 15_000 })
    await page.locator('canvas').or(page.getByTestId('kg-canvas-list')).first().waitFor({ timeout: 15_000 })
    await page.screenshot({ path: `${DEMO_DIR()}05-replay-banner.png`, fullPage: true })
    await page.locator('canvas').or(page.getByTestId('kg-canvas-list')).first().waitFor({ timeout: 15_000 })

    const history = await scaffold.ctx.apiProxy.kg.history({ rpcId: 'kg-p2-history' as never, payload: { as_of: '2026-01-01T00:00:00.000Z' } })
    expect(history.result.ok).toBe(true)
    if (history.result.ok) {
      expect(history.result.value.nodes).toHaveLength(0)
    }
    // Leaving replay restores the live canvas.
    await page.getByRole('button', { name: '返回实时图' }).click()
    await expect.poll(() => page.getByTestId('kg-replay-banner').count()).toBe(0)
  })
})

/** The demos output directory (screenshots land beside the batch evidence). */
function DEMO_DIR(): string {
  return `${DEMOS}m2-p2/`
}

/** Count the live edges around one entity (the rollback delta's oracle). */
async function liveEdgeCount(scaffold: WebScaffold, seed: string): Promise<number> {
  const walk = await scaffold.ctx.apiProxy.kg.subgraph({ rpcId: 'kg-p2-count' as never, payload: { seeds: [seed], hops: 1 } })
  if (!walk.result.ok) throw new Error(`kg.subgraph failed: ${JSON.stringify(walk.result)}`)
  return walk.result.value.edges.length
}

/** Open the seeded session's 图谱 tab and wait for a drawn canvas or list. */
async function openKgTab(target: Page): Promise<void> {
  const groupRow = target.locator('[role="treeitem"]').first()
  await groupRow.waitFor({ timeout: 30_000 })
  await groupRow.click()
  await target.locator('[role="treeitem"]').nth(1).click()
  await target.getByRole('tab', { name: '图谱', exact: true }).waitFor({ timeout: 30_000 })
  await target.getByRole('tab', { name: '图谱', exact: true }).click()
  await target.getByTestId('kg-mode-switch').waitFor({ timeout: 15_000 })
}
