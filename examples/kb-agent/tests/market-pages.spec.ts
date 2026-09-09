/**
 * Keyless market-and-connectors snapshot over the real seams: connector-file
 * discovers the seeded drop-in datasets (the market's catalog source), the
 * deployment's own market seed file supplies the featured rail, an in-memory
 * orders stub counts this month's deal, and the lakehouse catalog's transfer
 * trail feeds the connector page's timeline. The assertions render both
 * wire faces as markdown against a committed golden; refresh with
 * `DSH_SNAPSHOT=refresh pnpm vitest run <this file>`.
 */

import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import SessionStore from '@deepseek-ai/dsh-session'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import UserQuestionService from '@deepseek-ai/dsh-user-questions'
import AgentRegistry from '@deepseek-ai/dsh-agent'
import LakehouseRuntime from '@deepseek-ai/dsh-lakehouse'
import * as ConnectorFile from '@deepseek-ai/dsh-connector-file'
import type { CatalogStore, LakehouseTable, LakehouseTransferEntry, LakehouseTransferRecord } from '@deepseek-ai/dsh-lakehouse'
import ConnectorRuntime from '@deepseek-ai/dsh-connector'
import { createApiProxy } from '@deepseek-ai/dsh-host-apiproxy/src/api-proxy.ts'
import type { RpcRequest } from '@deepseek-ai/dsh-host-apiproxy/src/api/rpc.ts'

const here = dirname(fileURLToPath(import.meta.url))
const exampleRoot = join(here, '..')
const snapshotsDir = join(here, 'snapshots/market-pages')
const expectedPath = join(snapshotsDir, 'expected.md')
const refreshing = process.env.DSH_SNAPSHOT === 'refresh'

/** One typed RPC request envelope (the rpcId is branded on the wire contract). */
function request<P>(payload: P): RpcRequest<P> {
  return { rpcId: 'r' as never, payload }
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

/** The in-memory orders seam: one order this month once create ran. */
class MemoryOrders {
  private nextId = 1
  private readonly orders: Array<{
    id: number
    orderNo: string
    serviceId: string
    serviceName: string
    brief: string
    status: 'pending' | 'generating' | 'delivered' | 'failed'
    createdAt: string
  }> = []

  async create(input: { serviceId: string; brief: string }): Promise<{ id: number; orderNo: string; serviceId: string; serviceName: string; brief: string; status: 'pending'; createdAt: string }> {
    const id = this.nextId++
    const created = {
      id,
      orderNo: `ORD-20260906-${String(id).padStart(4, '0')}`,
      serviceId: input.serviceId,
      serviceName: input.serviceId.endsWith('1') ? '中亚货运动线方案' : '食品出海合规咨询',
      brief: input.brief,
      status: 'pending' as const,
      createdAt: new Date().toISOString(),
    }
    this.orders.push(created)
    return created
  }

  async list(): Promise<readonly typeof this.orders[number][]> {
    return [...this.orders]
  }
}

let root: string | undefined
let ctx: Context | undefined
let catalog: MemoryCatalog | undefined

beforeEach(() => {
  catalog = new MemoryCatalog()
})

afterEach(async () => {
  await ctx?.fiber.dispose()
  ctx = undefined
  if (root !== undefined) await rm(root, { recursive: true, force: true })
  root = undefined
})

async function boot() {
  root = await mkdtemp(join(tmpdir(), 'dsh-market-snapshot-'))
  const dropIn = join(root, 'connector-files')
  await mkdir(dropIn, { recursive: true })
  await writeFile(join(dropIn, 'customs-export-2026.csv'), [
    'region,category,export_value',
    '哈萨克斯坦,调味品,1200000',
    '乌兹别克斯坦,休闲食品,860000',
  ].join('\n'))
  ctx = new Context()
  await ctx.plugin(SessionStore)
  await ctx.plugin(SystemPrompt, { persona: '' })
  await ctx.plugin(UserQuestionService)
  await ctx.plugin(AgentRegistry)
  await ctx.plugin(ConnectorRuntime, {})
  await ctx.plugin(ConnectorFile, { root: dropIn })
  await ctx.plugin(LakehouseRuntime, { dataRoot: join(root, 'lakehouse') })
  ctx.lakehouse.registerCatalogStore(catalog!)
  const orders = new MemoryOrders()
  ctx.provide('orders', orders as never)
  const api = createApiProxy(ctx, {
    defaultModelSelection: () => ({ provider: 'p', model: 'm' }),
    saveDefaultModelSelection: async () => {},
    cwd: root,
    kbTenant: 'demo-food-co',
    assetsEnabled: true,
    connectorsEnabled: true,
    assetsSeedPath: join(exampleRoot, 'workspace/data/market/seed.json'),
  })
  return { api, orders }
}

/** Render one value for the golden (stable field order, no volatile ids). */
function lines(...sections: readonly string[]): string {
  return sections.join('\n')
}

describe('market and connector pages over the real seams (keyless)', () => {
  it('serves the market catalog, the featured seed rail, and the connector delivery trail', async () => {
    const { api, orders } = await boot()
    // One delivery landed before the read: the connector page's timeline seed.
    await catalog!.recordTransfer({
      source: 'connector-file', destination: 'lakehouse', datasetId: 'customs-export-2026.csv',
      rows: 2, transferredAt: '2026-09-06T08:00:00.000Z',
    })
    // One order placed this month: the hero counter seed.
    await orders.create({ serviceId: 'expert_services/1', brief: '快照：中亚铁路货运动线' })

    const assets = await api.assets.list(request({}))
    const detail = await api.assets.detail(request({ provider_id: 'connector-file', dataset_id: 'customs-export-2026.csv' }))
    const stats = await api.assets.stats(request({}))
    const providers = await api.connectors.list(request({}))
    const connections = await api.connectors.connections(request({}))
    const transfers = await api.connectors.transfers(request({}))

    expect(assets.result.ok).toBe(true)
    expect(detail.result.ok).toBe(true)
    expect(stats.result.ok).toBe(true)
    expect(providers.result.ok).toBe(true)
    expect(connections.result.ok).toBe(true)
    expect(transfers.result.ok).toBe(true)
    if (
      !assets.result.ok || !detail.result.ok || !stats.result.ok
      || !providers.result.ok || !connections.result.ok || !transfers.result.ok
    ) {
      throw new Error('a market/connector read failed; see expects above')
    }

    const actual = lines(
      '## assets.list',
      ...assets.result.value.assets.map(asset => `- ${asset.provider_id}/${asset.dataset_id} · ${asset.kind} · ${asset.title}${asset.price === undefined ? '' : ` · ${asset.price}`}`),
      '## assets.detail',
      `- ${detail.result.value.provider_id}/${detail.result.value.dataset_id} · ${detail.result.value.kind} · ${detail.result.value.title}`,
      `  description: ${detail.result.value.description ?? ''}`,
      '## assets.stats',
      `- products: ${stats.result.value.products}`,
      `- providers: ${stats.result.value.providers}`,
      `- monthly_orders: ${stats.result.value.monthly_orders}`,
      ...stats.result.value.featured.map(card => `- featured: ${card.title} | ${card.blurb} | ${card.tags.join(',')}`),
      '## connectors.list',
      ...providers.result.value.providers.map(provider => `- ${provider.id} · available=${provider.available} · ${provider.capabilities.join('+')}`),
      '## connectors.connections',
      ...connections.result.value.connections.map(connection => `- ${connection.provider_id} · ${connection.transfers} transfers · ${connection.rows} rows · last ${connection.last_transfer_at}`),
      '## connectors.transfers',
      ...transfers.result.value.transfers.map(entry => `- #${entry.transfer_id} ${entry.transferred_at} ${entry.source} ${entry.dataset_id} → ${entry.destination} (${entry.rows})`),
      '',
    )

    if (refreshing) {
      await mkdir(snapshotsDir, { recursive: true })
      await writeFile(expectedPath, actual)
    }
    const expected = await readFile(expectedPath, 'utf8')
    expect(actual).toBe(expected)
  })

  it('refuses both domains loudly when the deployment has not opted in', async () => {
    root = await mkdtemp(join(tmpdir(), 'dsh-market-snapshot-'))
    ctx = new Context()
    await ctx.plugin(SessionStore)
    await ctx.plugin(SystemPrompt, { persona: '' })
    await ctx.plugin(UserQuestionService)
    await ctx.plugin(AgentRegistry)
    const api = createApiProxy(ctx, {
      defaultModelSelection: () => ({ provider: 'p', model: 'm' }),
      saveDefaultModelSelection: async () => {},
      cwd: root,
      kbTenant: 'demo-food-co',
    })
    expect((await api.assets.stats(request({}))).result).toMatchObject({ ok: false, error: { code: 'assets-not-composed' } })
    expect((await api.connectors.list(request({}))).result).toMatchObject({ ok: false, error: { code: 'connectors-not-composed' } })
  })
})
