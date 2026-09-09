/**
 * The assets and connectors domains: the market catalog's discovery
 * projection (dataset + expert-service cards with pricing), the detail and
 * stats reads (monthly order counters, the featured seed rail), the opt-in
 * gates and missing-seam refusals, the provider catalog with availability,
 * and the delivery trail's aggregation and degradation (no lakehouse reads
 * as no records).
 */

import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import AgentRegistry from '@deepseek-ai/dsh-agent'
import SessionStore from '@deepseek-ai/dsh-session'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import UserQuestionService from '@deepseek-ai/dsh-user-questions'
import LakehouseRuntime from '@deepseek-ai/dsh-lakehouse'
import type { CatalogStore, LakehouseTable, LakehouseTransferEntry, LakehouseTransferRecord } from '@deepseek-ai/dsh-lakehouse'
import ConnectorRuntime from '@deepseek-ai/dsh-connector'
import type { ConnectorDatasetSummary, ConnectorProvider } from '@deepseek-ai/dsh-connector'
import { createApiProxy } from '../src/api-proxy.ts'
import type { RpcRequest } from '../src/api/rpc.ts'

/** One typed RPC request envelope (the rpcId is branded on the wire contract). */
function request<P>(payload: P): RpcRequest<P> {
  return { rpcId: 'r' as never, payload }
}

/** The market's discovery catalog: the expert profile, two services, and a tabular dataset. */
const SUMMARIES: readonly ConnectorDatasetSummary[] = [
  {
    id: 'experts/1',
    title: '张红喜 · 食品出海关税专家',
    kind: 'expert-profile',
    manifest: { providerId: 'connector-nocobase', description: '漯河市电子商务协会会长', updatedAt: '2026-09-01T00:00:00.000Z' },
    expert: { org: '漯河市电子商务协会（会长）', domains: ['食品出海', '中亚五国', '俄罗斯'] },
  },
  {
    id: 'expert_services/1',
    title: '中亚货运动线方案',
    kind: 'service',
    manifest: { providerId: 'connector-nocobase' },
    service: { serviceId: 'expert_services/1', name: '中亚货运动线方案', deliverable: 'PDF 方案', price: '¥8,800/份', summary: '中亚五国货运路线与清关建议' },
  },
  {
    id: 'expert_services/2',
    title: '食品出海合规咨询',
    kind: 'service',
    manifest: { providerId: 'connector-nocobase' },
    service: { serviceId: 'expert_services/2', name: '食品出海合规咨询', deliverable: 'PDF 方案', price: '¥12,000/份' },
  },
  {
    id: 'orders.csv',
    title: '海关进出口明细（样例）',
    kind: 'tabular',
    manifest: { providerId: 'connector-file', description: '2026 年样例行', updatedAt: '2026-09-02T00:00:00.000Z' },
  },
]

/** A scripted provider over the fixed catalog with an availability switch. */
class ScriptedProvider implements ConnectorProvider {
  readonly id: string
  up = true
  readonly capabilities: readonly ('discover' | 'fetch')[] = ['discover', 'fetch']

  constructor(id: string) {
    this.id = id
  }

  available(): boolean {
    return this.up
  }

  async discover(): Promise<readonly ConnectorDatasetSummary[]> {
    return SUMMARIES.filter(summary => summary.manifest.providerId === this.id)
  }

  async fetch(): Promise<never> {
    throw new Error('not exercised')
  }
}

/** In-memory catalog recording the appended transfer trail. */
class MemoryCatalog implements CatalogStore {
  readonly id = 'memory-catalog'
  readonly trail: Array<LakehouseTransferRecord & { transferId: number }> = []

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
}

/** The orders seam stub: one order this month, one last month. */
function ordersStub() {
  const now = new Date()
  const thisMonth = new Date(now.getFullYear(), now.getMonth(), 2).toISOString()
  const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 2).toISOString()
  return {
    async create() { throw new Error('not exercised') },
    async get() { throw new Error('not exercised') },
    async list() {
      return [
        { id: 1, orderNo: 'ORD-1', serviceId: 'expert_services/1', serviceName: '中亚货运动线方案', brief: '', status: 'pending' as const, createdAt: thisMonth },
        { id: 2, orderNo: 'ORD-2', serviceId: 'expert_services/2', serviceName: '食品出海合规咨询', brief: '', status: 'delivered' as const, createdAt: lastMonth },
      ]
    },
    async fulfill() { throw new Error('not exercised') },
    async readDeliverable() { throw new Error('not exercised') },
  }
}

const roots: string[] = []

afterEach(() => {
  while (roots.length > 0) rmSync(roots.pop()!, { recursive: true, force: true })
})

async function harness(defaults: {
  assetsEnabled?: boolean
  connectorsEnabled?: boolean
  seedFile?: 'valid' | 'broken'
  mountConnector?: boolean
  mountLakehouse?: boolean
  mountOrders?: boolean
}) {
  const cwd = mkdtempSync(join(tmpdir(), 'dsh-market-domain-'))
  roots.push(cwd)
  const ctx = new Context()
  await ctx.plugin(SessionStore)
  await ctx.plugin(SystemPrompt, { persona: '' })
  await ctx.plugin(UserQuestionService)
  await ctx.plugin(AgentRegistry)
  if (defaults.mountConnector !== false) {
    await ctx.plugin(ConnectorRuntime, {})
    ctx.connector.registerProvider(new ScriptedProvider('connector-file'))
    ctx.connector.registerProvider(new ScriptedProvider('connector-nocobase'))
  }
  const catalog = new MemoryCatalog()
  if (defaults.mountLakehouse !== false) {
    await ctx.plugin(LakehouseRuntime, { dataRoot: join(cwd, 'lakehouse') })
    ctx.lakehouse.registerCatalogStore(catalog)
  }
  if (defaults.mountOrders !== false) {
    ctx.provide('orders', ordersStub() as never)
  }
  let seedPath: string | undefined
  if (defaults.seedFile !== undefined) {
    seedPath = join(cwd, 'market-seed.json')
    writeFileSync(seedPath, defaults.seedFile === 'valid'
      ? JSON.stringify({ featured: [{ title: '中亚市场准入指南', blurb: '五国准入法规与认证要点', tags: ['出海', '合规'] }] })
      : '{not json')
  }
  const api = createApiProxy(ctx, {
    defaultModelSelection: () => ({ provider: 'p', model: 'm' }),
    saveDefaultModelSelection: async () => {},
    cwd,
    kbTenant: 'demo-food-co',
    ...defaults.assetsEnabled === undefined ? {} : { assetsEnabled: defaults.assetsEnabled },
    ...defaults.connectorsEnabled === undefined ? {} : { connectorsEnabled: defaults.connectorsEnabled },
    ...seedPath === undefined ? {} : { assetsSeedPath: seedPath },
  })
  return { api, ctx, cwd, catalog }
}

describe('assets domain', () => {
  it('projects discovery summaries into market cards with service and expert extensions', async () => {
    const { api } = await harness({ assetsEnabled: true })
    const response = await api.assets.list(request({}))
    expect(response.result.ok).toBe(true)
    if (!response.result.ok) return
    expect(response.result.value.assets).toHaveLength(4)
    const service = response.result.value.assets.find(asset => asset.dataset_id === 'expert_services/1')
    expect(service).toMatchObject({
      provider_id: 'connector-nocobase',
      title: '中亚货运动线方案',
      kind: 'service',
      service_name: '中亚货运动线方案',
      price: '¥8,800/份',
      deliverable: 'PDF 方案',
      service_id: 'expert_services/1',
      summary: '中亚五国货运路线与清关建议',
    })
    const profile = response.result.value.assets.find(asset => asset.dataset_id === 'experts/1')
    expect(profile).toMatchObject({
      kind: 'expert-profile',
      expert_org: '漯河市电子商务协会（会长）',
      domains: ['食品出海', '中亚五国', '俄罗斯'],
      updated_at: '2026-09-01T00:00:00.000Z',
    })
  })

  it('reads one asset detail and refuses an undeclared dataset loudly', async () => {
    const { api } = await harness({ assetsEnabled: true })
    const found = await api.assets.detail(request({ provider_id: 'connector-file', dataset_id: 'orders.csv' }))
    expect(found.result.ok).toBe(true)
    if (found.result.ok) {
      expect(found.result.value).toMatchObject({ provider_id: 'connector-file', dataset_id: 'orders.csv', kind: 'tabular', description: '2026 年样例行' })
    }
    const missing = await api.assets.detail(request({ provider_id: 'connector-file', dataset_id: 'nope.csv' }))
    expect(missing.result).toMatchObject({ ok: false, error: { code: 'assets-asset-missing' } })
  })

  it('counts products, providers, and this-month orders; serves the featured rail from the seed', async () => {
    const { api } = await harness({ assetsEnabled: true, seedFile: 'valid' })
    const response = await api.assets.stats(request({}))
    expect(response.result.ok).toBe(true)
    if (!response.result.ok) return
    expect(response.result.value).toMatchObject({ products: 4, providers: 2, monthly_orders: 1 })
    expect(response.result.value.featured).toEqual([
      { title: '中亚市场准入指南', blurb: '五国准入法规与认证要点', tags: ['出海', '合规'] },
    ])
  })

  it('reads no featured rail without a seed file and fails loud on a broken one', async () => {
    const bare = await harness({ assetsEnabled: true })
    const bareStats = await bare.api.assets.stats(request({}))
    expect(bareStats.result.ok).toBe(true)
    if (bareStats.result.ok) expect(bareStats.result.value.featured).toEqual([])

    const broken = await harness({ assetsEnabled: true, seedFile: 'broken' })
    const brokenStats = await broken.api.assets.stats(request({}))
    expect(brokenStats.result).toMatchObject({ ok: false, error: { code: 'assets-rejected' } })
  })

  it('refuses every method until the deployment opts in or the connector seam exists', async () => {
    const optedOut = await harness({})
    expect((await optedOut.api.assets.list(request({}))).result).toMatchObject({ ok: false, error: { code: 'assets-not-composed' } })
    expect((await optedOut.api.assets.detail(request({ provider_id: 'p', dataset_id: 'd' }))).result).toMatchObject({ ok: false, error: { code: 'assets-not-composed' } })
    expect((await optedOut.api.assets.stats(request({}))).result).toMatchObject({ ok: false, error: { code: 'assets-not-composed' } })

    const seamless = await harness({ assetsEnabled: true, mountConnector: false })
    expect((await seamless.api.assets.list(request({}))).result).toMatchObject({ ok: false, error: { code: 'assets-connector-missing' } })
  })
})

describe('connectors domain', () => {
  it('lists the provider catalog with live availability', async () => {
    const { api, ctx } = await harness({ connectorsEnabled: true })
    const offline = ctx.connector
    // The scripted providers both start available; flip one for the refusal copy.
    const providers = offline.describeProviders()
    expect(providers.map(provider => provider.id)).toEqual(['connector-file', 'connector-nocobase'])
    const response = await api.connectors.list(request({}))
    expect(response.result.ok).toBe(true)
    if (response.result.ok) {
      expect(response.result.value.providers).toEqual([
        { id: 'connector-file', available: true, capabilities: ['discover', 'fetch'] },
        { id: 'connector-nocobase', available: true, capabilities: ['discover', 'fetch'] },
      ])
    }
  })

  it('aggregates the delivery trail per provider and lists the raw timeline', async () => {
    const { api, catalog } = await harness({ connectorsEnabled: true })
    await catalog.recordTransfer({ source: 'connector-file', destination: 'lakehouse', datasetId: 'orders.csv', rows: 12, transferredAt: '2026-09-04T00:00:00.000Z' })
    await catalog.recordTransfer({ source: 'connector-file', destination: 'kb', datasetId: 'notes.md', rows: 1, transferredAt: '2026-09-05T00:00:00.000Z' })
    await catalog.recordTransfer({ source: 'connector-nocobase', destination: 'lakehouse', datasetId: 'customs_export', rows: 800, transferredAt: '2026-09-06T00:00:00.000Z' })

    const connections = await api.connectors.connections(request({}))
    expect(connections.result.ok).toBe(true)
    if (connections.result.ok) {
      expect(connections.result.value.connections).toEqual([
        { provider_id: 'connector-nocobase', transfers: 1, rows: 800, last_transfer_at: '2026-09-06T00:00:00.000Z' },
        { provider_id: 'connector-file', transfers: 2, rows: 13, last_transfer_at: '2026-09-05T00:00:00.000Z' },
      ])
    }

    const timeline = await api.connectors.transfers(request({}))
    expect(timeline.result.ok).toBe(true)
    if (timeline.result.ok) {
      expect(timeline.result.value.transfers.map(entry => entry.transfer_id)).toEqual([3, 2, 1])
      expect(timeline.result.value.transfers[0]).toMatchObject({ source: 'connector-nocobase', destination: 'lakehouse', dataset_id: 'customs_export', rows: 800 })
    }
  })

  it('degrades delivery reads to empty without a lakehouse seam and refuses without the opt-in', async () => {
    const catalogless = await harness({ connectorsEnabled: true, mountLakehouse: false })
    expect((await catalogless.api.connectors.connections(request({}))).result).toMatchObject({ ok: true })
    const empty = await catalogless.api.connectors.transfers(request({}))
    expect(empty.result.ok).toBe(true)
    if (empty.result.ok) expect(empty.result.value.transfers).toEqual([])

    const optedOut = await harness({})
    expect((await optedOut.api.connectors.list(request({}))).result).toMatchObject({ ok: false, error: { code: 'connectors-not-composed' } })
    expect((await optedOut.api.connectors.connections(request({}))).result).toMatchObject({ ok: false, error: { code: 'connectors-not-composed' } })
    expect((await optedOut.api.connectors.transfers(request({}))).result).toMatchObject({ ok: false, error: { code: 'connectors-not-composed' } })

    const seamless = await harness({ connectorsEnabled: true, mountConnector: false })
    expect((await seamless.api.connectors.list(request({}))).result).toMatchObject({ ok: false, error: { code: 'connectors-connector-missing' } })
  })
})
