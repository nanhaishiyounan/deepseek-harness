/**
 * Market + connector pages e2e over the real web composition, one scaffold
 * world per file (the lane's standing constraint, same as kb-workbench). The
 * shipped base + web-app bundle patches boot first (this run's overlay opts
 * the gateway's assets/orders/connectors domains in, with the example's own
 * market seed file), then the connector seam mounts in-process with a
 * drop-in file provider plus a scripted service provider, the lakehouse seam
 * with an in-memory catalog pre-seeded with one delivery record, and an
 * in-memory orders service whose state machine advances on real timers —
 * so a real Chromium walks the whole product journey with zero model calls
 * and zero external backends:
 *
 * - the market tab from the sidebar entry (hero counters, the seeded
 *   featured rail, the catalog with both providers' datasets);
 * - the asset detail panel and the order journey — confirm card (read-only
 *   pairs + the single editable brief slot) → place → receipt with the order
 *   number and the pending badge;
 * - the「我的订单」section — the placed order lists there, the 5s poll
 *   advances the pending order to delivered, and the delivered row opens
 *   the in-page inline-PDF preview modal plus the attachment download;
 * - the connectors tab (provider catalog with availability, the delivery
 *   aggregate, the run timeline);
 * - the gateway face cross-check (assets.stats counts the placed order).
 */

import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Browser, Page } from 'playwright'
import { chromium } from 'playwright'
import { Context, Service } from '@deepseek-ai/cordis'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, onTestFailed } from 'vitest'
import ConnectorRuntime from '@deepseek-ai/dsh-connector'
import type { ConnectorDatasetSummary, ConnectorProvider } from '@deepseek-ai/dsh-connector'
import * as ConnectorFile from '@deepseek-ai/dsh-connector-file'
import LakehouseRuntime from '@deepseek-ai/dsh-lakehouse'
import type { CatalogStore, LakehouseTable, LakehouseTransferEntry, LakehouseTransferRecord } from '@deepseek-ai/dsh-lakehouse'
import type { OrderDeliverableFile, OrderRecord, OrdersSeam } from '@deepseek-ai/dsh-expert-orders'
import { launchWebScaffold, watchConsole, type WebScaffold } from './scaffold.ts'
import { connectFreshWorkspaceZh, ZH_BROWSER_LOCALE, saveFailureShot } from './support.ts'

/** Opts the gateway's market/orders/connector domains in for this scenario. */
const OVERLAY = fileURLToPath(new URL('./market-pages.overlay.yml', import.meta.url))

/** The orderable service reference (identity + pricing snapshot the orders seam would resolve). */
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

/** Smallest PDF-shaped bytes the preview and download assertions read. */
const MINIMAL_PDF: Uint8Array = new TextEncoder().encode('%PDF-1.4\n%%EOF')

/**
 * The in-memory orders service (the real NocoBase track's e2e covers
 * approval). The placed order's state machine advances on real timers —
 * pending → generating (~100ms) → delivered (~600ms, deliverable path +
 * timestamp) — mirroring the workflow callback the gateway-side fulfill
 * surface stands in for, so the section's 5-second poll observes genuine
 * progression.
 */
class MemoryOrdersService extends Service implements OrdersSeam {
  private nextId = 1
  private readonly orders: OrderRecord[] = []

  constructor(ctx: Context) {
    // The service name is what ctx.get('orders') resolves.
    super(ctx, 'orders')
  }

  /** Patch one stored row in place (the records are readonly on the wire). */
  private advance(orderId: number, patch: Partial<OrderRecord>): void {
    const index = this.orders.findIndex(order => order.id === orderId)
    if (index >= 0) this.orders[index] = { ...this.orders[index]!, ...patch }
  }

  async create(input: { serviceId: string; brief: string }): Promise<OrderRecord> {
    const id = this.nextId++
    const created: OrderRecord = {
      id,
      orderNo: `ORD-${new Date().toISOString().slice(0,10).replaceAll('-','')}-${String(id).padStart(4, '0')}`,
      serviceId: input.serviceId,
      serviceName: SERVICE_REF.name,
      price: SERVICE_REF.price,
      brief: input.brief,
      status: 'pending',
      createdAt: new Date().toISOString(),
    }
    this.orders.push(created)
    setTimeout(() => {
      if (this.orders.find(order => order.id === id)?.status === 'pending') {
        this.advance(id, { status: 'generating' })
      }
    }, 100)
    setTimeout(() => {
      const order = this.orders.find(candidate => candidate.id === id)
      if (order?.status === 'generating') {
        this.advance(id, {
          status: 'delivered',
          deliverablePath: `workspace/deliverables/${order.orderNo}.pdf`,
          generatedAt: new Date().toISOString(),
        })
      }
    }, 600)
    return created
  }

  async get(orderId: number): Promise<OrderRecord | undefined> {
    return this.orders.find(order => order.id === orderId)
  }

  async list(): Promise<readonly OrderRecord[]> {
    return [...this.orders]
  }

  async fulfill(orderId: number): Promise<OrderRecord> {
    const order = this.orders.find(candidate => candidate.id === orderId)
    if (order === undefined) throw new Error(`no order ${orderId}`)
    this.advance(order.id, {
      status: 'delivered',
      deliverablePath: order.deliverablePath ?? `workspace/deliverables/${order.orderNo}.pdf`,
      generatedAt: order.generatedAt ?? new Date().toISOString(),
    })
    return this.orders.find(candidate => candidate.id === order.id)!
  }

  async readDeliverable(orderId: number): Promise<OrderDeliverableFile> {
    const order = this.orders.find(candidate => candidate.id === orderId)
    if (order === undefined || order.status !== 'delivered' || order.deliverablePath === undefined) {
      const failure = new Error(`order ${orderId} has no landed deliverable`) as Error & { code?: string }
      failure.code = order === undefined ? 'ORDERS_ORDER_MISSING' : 'ORDERS_NOT_DELIVERED'
      throw failure
    }
    return { path: order.deliverablePath, bytes: MINIMAL_PDF }
  }
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
    // The product overlay planes: the connector seam with both providers, the
    // lakehouse seam with the pre-seeded catalog, and the orders service the
    // confirm card writes through.
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
    await scaffold.ctx.plugin(MemoryOrdersService)
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

  it('walks the market journey: browse → detail → confirm card → order receipt', async () => {
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
    // Open the service detail and walk the confirm card.
    await page.getByRole('button', { name: /中亚货运动线方案/ }).click()
    await page.getByText('¥8,800/份').first().waitFor({ timeout: 15_000 })
    await page.getByRole('button', { name: '下单', exact: true }).click()
    await page.getByRole('region', { name: '确认下单' }).waitFor({ timeout: 15_000 })
    await page.getByText('下单后进入审批流程', { exact: false }).waitFor({ timeout: 15_000 })
    // The brief slot is the only editable field; adjust it before confirming.
    const brief = page.getByPlaceholder('一句话说明你要解决的问题（可修改）')
    await brief.fill('走铁路，重点看哈萨克斯坦清关')
    await page.getByRole('button', { name: '确认下单', exact: true }).click()
    // The receipt lands with the order number and the pending badge.
    const orderNoPattern = new RegExp(`ORD-${new Date().toISOString().slice(0, 10).replaceAll('-', '')}-\\d{4}`, 'u')
    await page.getByText(orderNoPattern).first().waitFor({ timeout: 15_000 })
    await page.getByText('待审批').first().waitFor({ timeout: 15_000 })
    // The hero counter follows the refreshed stats (one deal this month).
    await expect.poll(
      () => page.getByText(/本月成交 \d/u).first().innerText(),
      { timeout: 15_000 },
    ).toContain('1')

    // — 「我的订单」section: the order lists, the poll advances it to delivered —
    await page.getByRole('region', { name: '我的订单' }).waitFor({ timeout: 15_000 })
    await page.getByText(orderNoPattern).first().waitFor({ timeout: 15_000 })
    await expect.poll(
      async () => page.locator('#market-orders [class*="statusBadge"]').first().innerText(),
      { timeout: 15_000 },
    ).toBe('已交付')
    // The delivered row opens the inline-PDF preview modal over the same-origin route.
    const previewResponse = page.waitForResponse(request =>
      /\/api\/orders\.download\?.*inline=1/u.test(request.url()) && request.request().method() === 'GET')
    await page.getByRole('button', { name: '查看方案' }).click()
    const inline = await previewResponse
    expect(inline.status()).toBe(200)
    expect(inline.headers()['content-disposition']).toMatch(/^inline; filename="/u)
    expect(inline.headers()['content-type']).toBe('application/pdf')
    await page.getByRole('dialog').waitFor({ timeout: 15_000 })
    await page.getByRole('link', { name: '新窗口打开' }).waitFor({ timeout: 5_000 })
    // The download stays an attachment direct link (the row's link and the modal footer share it).
    const downloadHref = await page.getByRole('link', { name: '下载 PDF' }).first().getAttribute('href')
    expect(downloadHref).toMatch(/^\/api\/orders\.download\?orderId=\d+$/u)
    const download = await page.request.get(`${scaffold.baseUrl}${downloadHref}`)
    expect(download.status()).toBe(200)
    expect(download.headers()['content-disposition']).toMatch(/^attachment; filename="/u)
    expect(Array.from((await download.body()).subarray(0, 4))).toEqual([0x25, 0x50, 0x44, 0x46])
    // The manual refresh stays clickable after the terminal state (close the modal first).
    await page.keyboard.press('Escape')
    await page.getByRole('dialog').waitFor({ state: 'detached', timeout: 5_000 })
    await page.getByRole('button', { name: '刷新', exact: true }).click()
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
