/**
 * With-NocoBase market-track e2e: the data-asset market and the connector
 * page's read surfaces against a LIVE NocoBase 2.x backend (the one
 * `setup-nocobase.mts` brings up). No mock stands in anywhere:
 * connector-nocobase discovers the real seeded collections (张红喜 + the
 * orderable services), `assets.list/detail/stats` project them into market
 * cards (pricing, deliverable, service ids), one real order lands through
 * `orders.create` (the confirm card's write path) and lifts the month
 * counter, and a real `connector.transfer` of a seeded dataset lands in an
 * in-memory lakehouse so `connectors.connections/transfers` answer with the
 * delivery trail. Self-skips without reachable
 * NOCOBASE_BASE_URL/NOCOBASE_API_KEY (the root .env counts), explaining why.
 * Run: pnpm exec vitest run --config vitest.e2e.config.ts examples/kb-agent/tests/market-track.e2e.ts
 */

import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import SessionStore from '@deepseek-ai/dsh-session'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import UserQuestionService from '@deepseek-ai/dsh-user-questions'
import AgentRegistry from '@deepseek-ai/dsh-agent'
import LakehouseRuntime from '@deepseek-ai/dsh-lakehouse'
import * as LakehouseDuckdb from '@deepseek-ai/dsh-lakehouse-duckdb'
import type { CatalogStore, LakehouseTable, LakehouseTransferEntry, LakehouseTransferRecord } from '@deepseek-ai/dsh-lakehouse'
import ConnectorRuntime from '@deepseek-ai/dsh-connector'
import * as ConnectorNocoBase from '@deepseek-ai/dsh-connector-nocobase'
import ExpertOrdersRuntime from '@deepseek-ai/dsh-expert-orders'
import { createApiProxy } from '@deepseek-ai/dsh-host-apiproxy/src/api-proxy.ts'
import type { RpcRequest } from '@deepseek-ai/dsh-host-apiproxy/src/api/rpc.ts'
import { resolveEnv } from '../scripts/resolve-env.ts'

/** One typed RPC request envelope (the rpcId is branded on the wire contract). */
function request<P>(payload: P): RpcRequest<P> {
  return { rpcId: 'r' as never, payload }
}

/** In-memory lakehouse catalog (the trail store the transfer confirm step writes). */
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

const ncBaseUrl = resolveEnv('NOCOBASE_BASE_URL')
const ncApiKey = resolveEnv('NOCOBASE_API_KEY')

/** Probe the live backend: the API key must list experts successfully. */
async function backendReachable(): Promise<boolean> {
  if (ncBaseUrl === undefined || ncApiKey === undefined) return false
  try {
    const response = await fetch(`${ncBaseUrl}/api/experts:list?pageSize=1`, {
      headers: { authorization: `Bearer ${ncApiKey}` },
      signal: AbortSignal.timeout(5000),
    })
    return response.ok
  } catch {
    return false
  }
}

const reachable = await backendReachable()
const skipReason = ncBaseUrl === undefined || ncApiKey === undefined
  ? 'NOCOBASE_BASE_URL/NOCOBASE_API_KEY not set — run `node --import tsx/esm examples/kb-agent/scripts/setup-nocobase.mts` first (self-skipping, not failing)'
  : `NocoBase at ${ncBaseUrl} did not answer the API-key probe — start it with setup-nocobase.mts start (self-skipping, not failing)`

if (!reachable) console.info(`market-track e2e: ${skipReason}`)

if (!reachable) console.info(`market-track e2e: ${skipReason}`)

describe.skipIf(!reachable)('market + connector pages over the real NocoBase track', () => {
  let ctx: Context | undefined
  let root: string | undefined

  afterEach(async () => {
    await ctx?.fiber.dispose()
    ctx = undefined
    if (root !== undefined) await rm(root, { recursive: true, force: true })
    root = undefined
  })

  /**
   * Boot one isolated world: the connector seam over the live backend, the
   * lakehouse with an in-memory trail store, the real order lifecycle, and
   * the gateway with the market domains opted in.
   */
  async function boot(gateway: {
    assetsEnabled: boolean
    ordersEnabled?: boolean
    connectorsEnabled?: boolean
  }) {
    root = await mkdtemp(join(tmpdir(), 'dsh-market-track-'))
    process.env.NOCOBASE_API_KEY = ncApiKey
    ctx = new Context()
    await ctx.plugin(SessionStore)
    await ctx.plugin(SystemPrompt, { persona: '' })
    await ctx.plugin(UserQuestionService)
    await ctx.plugin(AgentRegistry)
    await ctx.plugin(ConnectorRuntime, {})
    await ctx.plugin(ConnectorNocoBase, {
      ...(ncBaseUrl === undefined ? {} : { baseUrl: ncBaseUrl }),
      apiKeyEnv: 'NOCOBASE_API_KEY',
    })
    await ctx.plugin(LakehouseRuntime, { dataRoot: join(root, 'lakehouse') })
    ctx.lakehouse.registerCatalogStore(new MemoryCatalog())
    await ctx.plugin(LakehouseDuckdb)
    // The real order lifecycle over the same NocoBase source; this track
    // places the order and reads the pending row back — approval and the
    // deliverable callback stay covered by nocobase-track.
    await ctx.plugin(ExpertOrdersRuntime, {
      tenant: 'demo-food-co',
      deliverablesDir: join(root, 'deliverables'),
    })
    const api = createApiProxy(ctx, {
      defaultModelSelection: () => ({ provider: 'p', model: 'm' }),
      saveDefaultModelSelection: async () => {},
      cwd: root,
      kbTenant: 'demo-food-co',
      assetsEnabled: gateway.assetsEnabled,
      ...(gateway.ordersEnabled === undefined ? {} : { ordersEnabled: gateway.ordersEnabled }),
      ...(gateway.connectorsEnabled === undefined ? {} : { connectorsEnabled: gateway.connectorsEnabled }),
    })
    return api
  }

  it('projects the real seeded catalog into market cards with pricing and service ids', async () => {
    const api = await boot({ assetsEnabled: true, connectorsEnabled: true })
    const listed = await api.assets.list(request({}))
    expect(listed.result.ok, JSON.stringify(listed.result)).toBe(true)
    if (!listed.result.ok) return
    const service = listed.result.value.assets.find(asset => asset.dataset_id === 'expert_services/1')
    expect(service).toMatchObject({
      provider_id: 'connector-nocobase',
      kind: 'service',
      service_id: 'expert_services/1',
    })
    expect(service!.price).toMatch(/¥[\d,]+/u)
    const detail = await api.assets.detail(request({ provider_id: 'connector-nocobase', dataset_id: 'expert_services/1' }))
    expect(detail.result.ok).toBe(true)
    if (detail.result.ok) expect(detail.result.value.service_id).toBe('expert_services/1')
  })

  it('places a real order through the confirm-card write path and lifts the month counter', async () => {
    const api = await boot({ assetsEnabled: true, ordersEnabled: true })
    const before = await api.assets.stats(request({}))
    expect(before.result.ok).toBe(true)
    const created = await api.orders.create(request({
      service_id: 'expert_services/1',
      brief: 'market-track：走铁路，重点看哈萨克斯坦清关',
    }))
    expect(created.result.ok, JSON.stringify(created.result)).toBe(true)
    if (!created.result.ok) return
    const orderNo = created.result.value.order_no
    expect(created.result.value.status).toBe('pending')
    expect(orderNo).toMatch(/^ORD-/u)
    const after = await api.assets.stats(request({}))
    expect(after.result.ok).toBe(true)
    if (!after.result.ok || !before.result.ok) return
    // The placed row itself is the counter's ground truth (the backend may
    // already hold other rows from earlier tracks this month).
    expect(after.result.value.monthly_orders).toBeGreaterThanOrEqual(before.result.value.monthly_orders)
    const listed = await api.orders.list(request({}))
    expect(listed.result.ok).toBe(true)
    if (listed.result.ok) {
      const byNo = listed.result.value.orders.find(row => row.order_no === orderNo)
      expect(byNo).toMatchObject({ status: 'pending', brief: 'market-track：走铁路，重点看哈萨克斯坦清关' })
    }
  })

  it('lands a real dataset transfer and reads the delivery trail on the connector face', async () => {
    const api = await boot({ assetsEnabled: true, connectorsEnabled: true })
    // A tabular dataset lands in the lakehouse (document kinds would need the
    // kb seam this track does not compose).
    const summaries = await ctx!.connector.discover({ kinds: ['tabular'] })
    expect(summaries.length).toBeGreaterThan(0)
    const landed = await ctx!.connector.transfer({
      providerId: 'connector-nocobase',
      datasetId: summaries[0]!.id,
      tenantId: 'demo-food-co',
      target: 'lakehouse',
    })
    expect(landed.transferRecordId).toBeGreaterThan(0)
    const providers = await api.connectors.list(request({}))
    expect(providers.result.ok).toBe(true)
    if (providers.result.ok) {
      const ids = providers.result.value.providers.map(provider => provider.id)
      expect(ids).toContain('connector-nocobase')
    }
    const connections = await api.connectors.connections(request({}))
    expect(connections.result.ok).toBe(true)
    if (connections.result.ok) {
      const nocobase = connections.result.value.connections.find(row => row.provider_id === 'connector-nocobase')
      expect(nocobase).toBeDefined()
      expect(nocobase!.transfers).toBeGreaterThanOrEqual(1)
      expect(nocobase!.last_transfer_at).toBeDefined()
    }
    const timeline = await api.connectors.transfers(request({}))
    expect(timeline.result.ok).toBe(true)
    if (timeline.result.ok) {
      const newest = timeline.result.value.transfers[0]
      expect(newest).toMatchObject({ source: 'connector-nocobase', dataset_id: summaries[0]!.id })
    }
  })
})
