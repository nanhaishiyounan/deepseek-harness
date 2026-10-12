/**
 * Market + connectors pages e2e (keyless, in-process seams): the shipped
 * web-app boots with the market/connectors overlay opts, and this run's
 * own in-process seams feed the gateway's assets/connectors domains with
 * real provider data. Covers: the market catalog + featured rail through
 * the gateway face, the asset detail panel's ask handoff (the order
 * journey retired with the NocoBase-backed orders seam), the connectors
 * page over the same seam, and the missing-directory degrade.
 * Run: pnpm run test:web -- market-pages
 */

import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Browser, Page } from 'playwright'
import { chromium } from 'playwright'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, onTestFailed } from 'vitest'
import ConnectorRuntime from '@deepseek-ai/dsh-connector'
import type { ConnectorDatasetSummary, ConnectorProvider } from '@deepseek-ai/dsh-connector'
import * as ConnectorFile from '@deepseek-ai/dsh-connector-file'
import LakehouseRuntime from '@deepseek-ai/dsh-lakehouse'
import type { CatalogStore, LakehouseTable, LakehouseTransferEntry, LakehouseTransferRecord } from '@deepseek-ai/dsh-lakehouse'
import { launchWebScaffold, watchConsole, type WebScaffold } from './scaffold.ts'
import { connectFreshWorkspaceZh, ZH_BROWSER_LOCALE, saveFailureShot } from './support.ts'

/** Opts the gateway's market/connector domains in for this scenario. */
const OVERLAY = fileURLToPath(new URL('./market-pages.overlay.yml', import.meta.url))

/** The orderable service reference (identity + pricing snapshot for the detail panel). */
const SERVICE_REF = {
  serviceId: 'expert_services/1',
  name: '中亚货运动线方案',
  deliverable: 'PDF 方案',
  price: '¥8,800/份',
  summary: '中亚五国货运路线与清关建议',
} as const

/** The scripted provider's market catalog: one orderable expert service. */
const SERVICE_SUMMARY: ConnectorDatasetSummary = {
  id: 'expert_services/1',
  title: '中亚货运动线方案',
  kind: 'service',
  manifest: { providerId: 'market-e2e-source', description: '中亚五国货运路线与清关建议' },
  service: SERVICE_REF,
}

/** The scripted service provider (orderable catalog source). */
class ServiceProvider implements ConnectorProvider {
  readonly id = 'market-e2e-source'
  readonly capabilities: readonly ('discover' | 'fetch')[] = ['discover', 'fetch']

  available(): boolean {
    return true
  }

  async discover(): Promise<readonly ConnectorDatasetSummary[]> {
    return [SERVICE_SUMMARY]
  }

  async fetch(): Promise<never> {
    throw new Error('not exercised')
  }
}

/** In-memory catalog with one pre-seeded delivery record. */
class MemoryCatalog implements CatalogStore {
  readonly id = 'memory-catalog'

  available(): boolean {
    return true
  }

  async registerTable(): Promise<{ replaced: boolean }> {
    return { replaced: false }
  }

  async listTables(): Promise<readonly LakehouseTable[]> {
    return []
  }

  async describeTable(): Promise<LakehouseTable | undefined> {
    return undefined
  }

  async dropTable(): Promise<boolean> {
    return false
  }

  async recordTransfer(record: LakehouseTransferRecord): Promise<{ transferId: number }> {
    const transferId = this.trail.length + 1
    this.trail.push({ ...record, transferId })
    return { transferId }
  }

  async listTransfers(limit: number): Promise<readonly LakehouseTransferEntry[]> {
    return [...this.trail].reverse().slice(0, Math.max(0, limit))
  }

  async recordUsage(): Promise<void> {}

  async usage(): Promise<{ loadedTables: number; lakehouseQueries: number }> {
    return { loadedTables: 0, lakehouseQueries: 0 }
  }

  readonly trail: Array<LakehouseTransferRecord & { transferId: number }> = [{
    transferId: 1,
    source: 'connector-file',
    destination: 'lakehouse',
    datasetId: 'customs-export-2026.csv',
    rows: 2,
    transferredAt: '2026-09-06T08:00:00.000Z',
  }]
}

/** Dismiss the first-run welcome notice when it renders (zh copy). */
async function dismissWelcome(page: Page): Promise<void> {
  const welcome = page.locator('[class*="onboardingOverlay"]')
  if (await welcome.count() > 0) {
    await welcome.getByRole('button').click()
    await welcome.waitFor({ state: 'detached', timeout: 15_000 })
  }
}

describe('market and connector pages (in-process seams, Chinese UI)', () => {
  let scaffold: WebScaffold
  let browser: Browser
  let page: Page
  let world: string | undefined
  let tripwire: ReturnType<typeof watchConsole> = { warnings: [], pageErrors: [] }
  let slotErrors: string[] = []

  beforeAll(async () => {
    scaffold = await launchWebScaffold({ extraOverlayPath: OVERLAY })
    // The product overlay planes: the connector seam with both providers and
    // the lakehouse seam with the pre-seeded catalog.
    world = await mkdtemp(join(tmpdir(), 'dsh-market-e2e-'))
    const dropIn = join(world, 'connector-files')
    await mkdir(dropIn, { recursive: true })
    await writeFile(join(dropIn, 'customs-export-2026.csv'), [
      'region,category,export_value',
      '哈萨克斯坦,调味品,1200000',
      '乌兹别克斯坦,休闲食品,860000',
    ].join('\n'))
    await scaffold.ctx.plugin(ConnectorRuntime, {})
    await scaffold.ctx.plugin(ConnectorFile, { root: dropIn })
    scaffold.ctx.connector.registerProvider(new ServiceProvider())
    await scaffold.ctx.plugin(LakehouseRuntime, { dataRoot: join(world, 'lakehouse') })
    scaffold.ctx.lakehouse.registerCatalogStore(new MemoryCatalog())
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
    await dismissWelcome(page)
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
    if (failures.length > 1) throw new AggregateError(failures, 'market pages case cleanup failed')
  })

  afterAll(async () => {
    const failures: unknown[] = []
    if (world !== undefined) await rm(world, { recursive: true, force: true }).catch((error: unknown) => failures.push(error))
    await browser?.close().catch((error: unknown) => failures.push(error))
    await scaffold?.close().catch((error: unknown) => failures.push(error))
    if (failures.length === 1) throw failures[0]
    if (failures.length > 1) throw new AggregateError(failures, 'market pages cleanup failed')
  })

  it('serves the market catalog, the featured rail, and the counters through the gateway face', async () => {
    const assets = scaffold.ctx.apiProxy.assets
    const listed = await assets.list({ rpcId: 'market-e2e-list' as never, payload: {} })
    expect(listed.result.ok, `assets.list failed: ${JSON.stringify(listed.result)}`).toBe(true)
    if (listed.result.ok) {
      const ids = listed.result.value.assets.map(asset => `${asset.provider_id}/${asset.dataset_id}`)
      expect(ids).toContain('connector-file/customs-export-2026.csv')
      expect(ids).toContain('market-e2e-source/expert_services/1')
    }
    const stats = await assets.stats({ rpcId: 'market-e2e-stats' as never, payload: {} })
    expect(stats.result.ok).toBe(true)
    if (stats.result.ok) {
      expect(stats.result.value.providers).toBe(2)
      expect(stats.result.value.featured.map(card => card.title)).toContain('中亚市场准入指南')
    }
  })

  it('walks the market journey: browse → detail → ask handoff', async () => {
    onTestFailed(() => saveFailureShot(page, 'web-e2e-market-journey'))
    // The lane runs workspace-cold: connect the scaffold world first (the
    // composer and its view ring only exist once a workspace is attached).
    await connectFreshWorkspaceZh(page, scaffold.workspaceCwd)
    await page.getByRole('button', { name: '新建会话', exact: true }).first().click().catch(() => {})
    // The blank session keeps its view ring; the sidebar entry jumps straight
    // to the market tab.
    await page.getByRole('button', { name: '数据资产数' }).click()
    await page.getByRole('heading', { name: '数据资产市场' }).waitFor({ timeout: 15_000 })
    // Hero counters + the seeded featured rail render over the real face.
    await page.getByText(/数据产品 2 · 供方 2/u).waitFor({ timeout: 15_000 })
    await page.getByText('中亚市场准入指南').waitFor({ timeout: 15_000 })
    // The catalog lists both providers' datasets.
    await page.getByRole('button', { name: /中亚货运动线方案/ }).waitFor({ timeout: 15_000 })
    await page.getByRole('button', { name: /customs-export-2026/u }).waitFor({ timeout: 15_000 })
    // Open the service detail: the pricing and deliverable pairs render; the
    // ask action prefills the chat draft and switches views (the order
    // journey retired with the orders seam).
    await page.getByRole('button', { name: /中亚货运动线方案/ }).click()
    await page.getByText('¥8,800/份').first().waitFor({ timeout: 15_000 })
    await page.getByText('PDF 方案').first().waitFor({ timeout: 15_000 })
    await page.getByRole('button', { name: '问数', exact: true }).click()
    await expect.poll(
      () => page.locator('textarea:enabled').first().inputValue(),
      { timeout: 15_000 },
    ).toContain('中亚货运动线方案')
  }, 120_000)

  it('renders the connectors page: catalog, delivery aggregate, run timeline', async () => {
    onTestFailed(() => saveFailureShot(page, 'web-e2e-connectors-page'))
    const coldTrigger = page.getByRole('textbox', { name: '选择工作区' })
    if (await coldTrigger.waitFor({ timeout: 5_000 }).then(() => true, () => false)) {
      await connectFreshWorkspaceZh(page, scaffold.workspaceCwd)
    } else {
      await page.getByRole('button', { name: '新建会话', exact: true }).first().click().catch(() => {})
    }
    await page.getByRole('button', { name: '数据源数量' }).click()
    await page.getByRole('heading', { name: '连接器与交付' }).waitFor({ timeout: 15_000 })
    // The catalog lists both providers with availability copy.
    await page.getByText('文件投递目录').first().waitFor({ timeout: 15_000 })
    await page.getByText('正常', { exact: true }).first().waitFor({ timeout: 15_000 })
    // The delivery aggregate and the seeded timeline row.
    await page.getByText(/1 次交付 · 2 行/u).waitFor({ timeout: 15_000 })
    await page.getByText(/customs-export-2026\.csv · 2 行/u).waitFor({ timeout: 15_000 })
    await page.getByText(/入数据湖/u).waitFor({ timeout: 15_000 })
    // The connect guidance hands off to the conversation (draft prefill).
    await page.getByRole('button', { name: '去对话接入' }).click()
    await expect.poll(
      () => page.locator('textarea:enabled').first().inputValue(),
      { timeout: 15_000 },
    ).toContain('帮我接入一个新数据源')
  }, 120_000)

  it('keeps the market page alive when the connector-files directory disappears', async () => {
    onTestFailed(() => saveFailureShot(page, 'web-e2e-market-missing-dir'))
    // The production ENOENT: a clean checkout (or a mid-run deletion) of the
    // drop-in directory used to 500 the whole market through the runtime's
    // fail-fast fan-out. The wiped root must degrade to an empty file dataset.
    await rm(join(world as string, 'connector-files'), { recursive: true, force: true })
    // The sidebar entry preloads the shared stats/catalog caches at page
    // load; reload so both refetch against the wiped root instead of serving
    // the pre-delete snapshot.
    await page.reload({ waitUntil: 'load' })
    await page.waitForSelector('[class*="frame"]', { timeout: 30_000 })
    await dismissWelcome(page)
    const coldTrigger = page.getByRole('textbox', { name: '选择工作区' })
    if (await coldTrigger.waitFor({ timeout: 5_000 }).then(() => true, () => false)) {
      await connectFreshWorkspaceZh(page, scaffold.workspaceCwd)
    } else {
      // Swallows only the click rejection on this warm-session branch: the
      // workspace selector never appeared, so the button can already be gone
      // or mid-click from an earlier step. Every later assertion targets the
      // market page, never a fresh-session composer.
      await page.getByRole('button', { name: '新建会话', exact: true }).first().click().catch(() => {})
    }
    await page.getByRole('button', { name: '数据资产数' }).click()
    await page.getByRole('heading', { name: '数据资产市场' }).waitFor({ timeout: 15_000 })
    // The service provider's asset still counts (products > 0) and the file
    // provider contributes an empty dataset instead of failing the market.
    await page.getByText(/数据产品 [1-9] · 供方 2/u).waitFor({ timeout: 15_000 })
    await page.getByRole('button', { name: /中亚货运动线方案/ }).waitFor({ timeout: 15_000 })
    expect(await page.getByText('customs-export-2026').count()).toBe(0)
    expect(await page.getByText('市场暂不可用').count()).toBe(0)
  }, 120_000)
})
