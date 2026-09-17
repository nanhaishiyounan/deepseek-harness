/**
 * The connector tool suite's behavior over the real runtime with a scripted
 * provider and the real kb/lakehouse seams behind it: discovery listing and
 * filters, previews per content kind, the transfer receipt with a true
 * landing, the server-side tenant binding (model-supplied tenant rejected),
 * id resolution (sole owner, ambiguous, missing), the degraded mode (no
 * usable provider fails structured at execution time), and the presentation
 * projections.
 */

import { afterEach, describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { CallId } from '@deepseek-ai/dsh-llm'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import LakehouseRuntime from '@deepseek-ai/dsh-lakehouse'
import type { CatalogStore, LakehouseTable, LakehouseTransferEntry, LakehouseTransferRecord, LakehouseUsage, QueryProvider, TabularData } from '@deepseek-ai/dsh-lakehouse'
import KbRuntime from '@deepseek-ai/dsh-kb'
import type { KbChunkInput, KbDocumentInput, KbIngestResult, KbSearchHit, KbStore, KbStoreStats, KbUsage, KbUsageDelta } from '@deepseek-ai/dsh-kb'
import ConnectorRuntime from '@deepseek-ai/dsh-connector'
import type { ConnectorDataset, ConnectorDatasetRef, ConnectorDatasetSummary, ConnectorProvider } from '@deepseek-ai/dsh-connector'
import * as ToolConnector from '../src/index.ts'

const signal = new AbortController().signal

/** In-memory catalog recording transfers and loads. */
class MemoryCatalog implements CatalogStore {
  readonly id = 'memory-catalog'
  readonly tables = new Map<string, LakehouseTable>()
  readonly transfers: Array<LakehouseTransferRecord & { transferId: number }> = []

  available(): boolean {
    return true
  }

  async registerTable(table: LakehouseTable): Promise<{ replaced: boolean }> {
    const key = `${table.tenantId}/${table.tableName}`
    const replaced = this.tables.has(key)
    this.tables.set(key, table)
    return { replaced }
  }

  async listTables(tenantId: string): Promise<readonly LakehouseTable[]> {
    return [...this.tables.values()].filter(table => table.tenantId === tenantId)
  }

  async describeTable(tenantId: string, tableName: string): Promise<LakehouseTable | undefined> {
    return this.tables.get(`${tenantId}/${tableName}`)
  }

  async dropTable(): Promise<boolean> {
    return false
  }

  async recordTransfer(record: LakehouseTransferRecord): Promise<{ transferId: number }> {
    const transferId = this.transfers.length + 1
    this.transfers.push({ ...record, transferId })
    return { transferId }
  }

  async listTransfers(limit: number): Promise<readonly LakehouseTransferEntry[]> {
    return [...this.transfers].reverse().slice(0, Math.max(0, limit))
  }

  async recordUsage(): Promise<void> {}

  async usage(): Promise<LakehouseUsage> {
    return { loadedTables: 0, lakehouseQueries: 0 }
  }
}

/** Engine stand-in recording parquet writes. */
class MemoryEngine implements QueryProvider {
  readonly id = 'memory-engine'
  readonly writes: Array<{ location: string; tabular: TabularData }> = []

  available(): boolean {
    return true
  }

  async writeParquet(location: string, tabular: TabularData): Promise<void> {
    this.writes.push({ location, tabular })
  }

  async query(): Promise<{ columns: []; rows: []; truncated: boolean }> {
    return { columns: [], rows: [], truncated: false }
  }
}

/** In-memory kb store recording documents. */
class MemoryKbStore implements KbStore {
  readonly id = 'memory-kb-store'
  readonly documents: Array<{ doc: KbDocumentInput }> = []

  available(): boolean {
    return true
  }

  async putDocument(doc: KbDocumentInput, _chunks: readonly KbChunkInput[]): Promise<KbIngestResult> {
    this.documents.push({ doc })
    return { docId: this.documents.length, chunks: 1, embedded: false }
  }

  async deleteDocument(): Promise<boolean> {
    return false
  }

  async textSearch(): Promise<KbSearchHit[]> {
    return []
  }

  async vectorSearch(): Promise<KbSearchHit[]> {
    return []
  }

  async stats(): Promise<KbStoreStats> {
    return { documents: this.documents.length, chunks: 0, embeddedChunks: 0 }
  }

  async recordUsage(_tenantId: string, _delta: KbUsageDelta): Promise<void> {}

  async usage(): Promise<KbUsage> {
    return { searches: 0, ingestedDocuments: 0, ingestedChunks: 0, embedTexts: 0, embedTokens: 0 }
  }
}

/** A scripted provider with one dataset of every landable kind. */
class ScriptedProvider implements ConnectorProvider {
  readonly id: string
  up = true
  readonly capabilities = ['discover', 'fetch'] as const

  constructor(id: string, private readonly summaries: ConnectorDatasetSummary[], private readonly datasets: Map<string, ConnectorDataset>) {
    this.id = id
  }

  available(): boolean {
    return this.up
  }

  async discover(): Promise<readonly ConnectorDatasetSummary[]> {
    return this.summaries
  }

  /** The scripted summaries, exposed for the concurrency probe's delayed variant. */
  summariesForConcurrencyProbe(): readonly ConnectorDatasetSummary[] {
    return this.summaries
  }

  async fetch(ref: ConnectorDatasetRef): Promise<ConnectorDataset> {
    const dataset = this.datasets.get(ref.datasetId)
    if (dataset === undefined) throw new Error(`dataset "${ref.datasetId}" not found`)
    return dataset
  }
}

function alphaProvider(): ScriptedProvider {
  const summaries: ConnectorDatasetSummary[] = [
    { id: 'ledger', title: '出口台账', kind: 'tabular', manifest: { providerId: 'alpha' } },
    {
      id: 'experts/1',
      title: '张红喜',
      kind: 'expert-profile',
      manifest: { providerId: 'alpha', updatedAt: '2026-09-01T08:00:00.000Z', description: '漯河市电子商务协会（会长） · 食品出海,中亚五国' },
      expert: { org: '漯河市电子商务协会（会长）', domains: ['食品出海', '中亚五国'] },
    },
    {
      id: 'services/1',
      title: '中亚货运动线方案',
      kind: 'service',
      manifest: { providerId: 'alpha', description: 'PDF 方案' },
      service: { serviceId: 'services/1', expertId: 'experts/1', name: '中亚货运动线方案', deliverable: 'PDF 方案', price: '¥8,800/份', summary: '中亚方向铁运/海运动线设计与备选切换方案。' },
    },
  ]
  const wideRows = Array.from({ length: 12 }, (_, index) => [`r${index + 1}`, index + 1])
  const datasets = new Map<string, ConnectorDataset>([
    ['ledger', {
      kind: 'tabular',
      id: 'ledger',
      title: '出口台账',
      manifest: { providerId: 'alpha' },
      tableName: 'export_ledger',
      tabular: { columns: [{ name: 'region', sqlType: 'TEXT' }, { name: 'units', sqlType: 'INTEGER' }], rows: wideRows },
    }],
    ['experts/1', {
      kind: 'expert-profile',
      id: 'experts/1',
      title: '张红喜',
      manifest: { providerId: 'alpha' },
      ingest: { sourcePath: 'workspace/data/connectors/alpha/experts/1.md', docKind: 'profile', content: '张红喜，漯河电商协会会长。' },
    }],
    ['services/1', { kind: 'service', id: 'services/1', title: '中亚货运动线方案', manifest: { providerId: 'alpha' }, service: { serviceId: 'services/1', expertId: 'experts/1', name: '中亚货运动线方案', deliverable: 'PDF 方案', price: '¥8,800/份' } }],
  ])
  return new ScriptedProvider('alpha', summaries, datasets)
}

/** A second provider sharing the `ledger` dataset id, for ambiguity tests. */
function betaProvider(): ScriptedProvider {
  return new ScriptedProvider('beta', [
    { id: 'ledger', title: '出口台账（镜像）', kind: 'tabular', manifest: { providerId: 'beta' } },
  ], new Map<string, ConnectorDataset>([
    ['ledger', {
      kind: 'tabular',
      id: 'ledger',
      title: '出口台账（镜像）',
      manifest: { providerId: 'beta' },
      tableName: 'mirror_ledger',
      tabular: { columns: [{ name: 'region', sqlType: 'TEXT' }], rows: [['中亚']] },
    }],
  ]))
}

const contexts: Context[] = []

afterEach(async () => {
  await Promise.all(contexts.splice(0).map(ctx => ctx.fiber.dispose()))
})

interface Mount {
  execute: (name: string, args: unknown) => Promise<{ isError: boolean; value: unknown; text: string; meta?: unknown }>
  catalog: MemoryCatalog
  kbStore: MemoryKbStore
}

let counter = 0

/** One executed tool call's model-facing projection. */
interface ExecuteResult {
  isError: boolean
  value: unknown
  text: string
  meta?: unknown
}

type Execute = (name: string, args: unknown) => Promise<ExecuteResult>

/** Execute one tool through a context's registry (shared by every mount). */
function executeOn(ctx: Context): Execute {
  return async (name, args) => {
    const result = await ctx.tools.execute({ signal, callId: CallId(`call-${++counter}`), name, arguments: args })
    const text = result.content.find(block => block.type === 'text')
    return { isError: result.isError, value: result.value, text: text?.type === 'text' ? text.text : '', meta: result.meta }
  }
}

async function mount(...providers: ConnectorProvider[]): Promise<Mount> {
  const ctx = new Context()
  contexts.push(ctx)
  await ctx.plugin(SystemPrompt)
  await ctx.plugin(ToolRuntime)
  await ctx.plugin(LakehouseRuntime, { dataRoot: 'workspace/lakehouse' })
  await ctx.plugin(KbRuntime)
  await ctx.plugin(ConnectorRuntime)
  const catalog = new MemoryCatalog()
  const kbStore = new MemoryKbStore()
  ctx.lakehouse.registerCatalogStore(catalog)
  ctx.lakehouse.registerQueryProvider(new MemoryEngine())
  ctx.kb.registerStoreProvider(kbStore)
  for (const provider of providers) ctx.connector.registerProvider(provider)
  await ctx.plugin(ToolConnector, { tenant: 'bound-tenant' })
  const execute = async (name: string, args: unknown): Promise<{ isError: boolean; value: unknown; text: string; meta?: unknown }> => {
    const result = await ctx.tools.execute({ signal, callId: CallId(`call-${++counter}`), name, arguments: args })
    const text = result.content.find(block => block.type === 'text')
    return { isError: result.isError, value: result.value, text: text?.type === 'text' ? text.text : '', meta: result.meta }
  }
  return { execute, catalog, kbStore }
}

describe('tool registration', () => {
  it('registers all three tools with their guidance sections', async () => {
    const { execute } = await mount(alphaProvider())
    const listed = await execute('connector_discover', {})
    expect(listed.isError).toBe(false)
    expect(listed.text).toContain('connector_fetch')
    expect(listed.text).toContain('connector_transfer')
  })
})

describe('connector_discover', () => {
  it('renders expert cards with their orderable services, and datasets with their ids', async () => {
    const { execute } = await mount(alphaProvider())
    const result = await execute('connector_discover', { query: '中亚' })
    expect(result.isError).toBe(false)
    expect(result.text).toContain('## Experts')
    expect(result.text).toContain('### 张红喜 — 漯河市电子商务协会（会长）')
    expect(result.text).toContain('领域：食品出海 · 中亚五国')
    expect(result.text).toContain('- 可服务项（可下单）:')
    expect(result.text).toContain('中亚货运动线方案（PDF 方案，¥8,800/份） — dataset id `services/1`')
    expect(result.text).toContain('## Datasets')
    // The attached service folds into the expert card, so the standalone
    // services section disappears.
    expect(result.text).not.toContain('## Expert services')
    const value = result.value as { providers: string[]; datasets: Array<{ expert?: unknown; service?: unknown }> }
    expect(value.providers).toEqual(['alpha'])
    expect(value.datasets).toHaveLength(3)
    const expert = value.datasets.find(entry => 'expert' in entry && entry.expert !== undefined)
    expect(expert?.expert).toEqual({ org: '漯河市电子商务协会（会长）', domains: ['食品出海', '中亚五国'] })
    const service = value.datasets.find(entry => 'service' in entry && entry.service !== undefined)
    expect(service?.service).toMatchObject({ service_id: 'services/1', expert_id: 'experts/1', price: '¥8,800/份' })
  })

  it('reports an explicit empty result when nothing matches', async () => {
    const provider = alphaProvider()
    provider.discover = async () => []
    const { execute } = await mount(provider)
    const result = await execute('connector_discover', { query: '不存在的主题' })
    expect(result.isError).toBe(false)
    expect(result.text).toMatch(/No connector datasets matched/u)
  })

  it('rejects a model-supplied tenant and unknown kinds', async () => {
    const { execute } = await mount(alphaProvider())
    const tenant = await execute('connector_discover', { tenant: 'other-co' })
    expect(tenant.isError).toBe(true)
    expect(tenant.text).toMatch(/tenant/u)
    const kinds = await execute('connector_discover', { kinds: ['bogus'] })
    expect(kinds.isError).toBe(true)
    expect(kinds.text).toMatch(/kinds\[0\].*must be one of/u)
  })
})

describe('connector_fetch', () => {
  it('previews a tabular dataset capped at eight rows with a truncation note', async () => {
    const { execute } = await mount(alphaProvider())
    const result = await execute('connector_fetch', { dataset_id: 'ledger' })
    expect(result.isError).toBe(false)
    const value = result.value as { kind: string; row_count: number; rows: unknown[]; truncated: boolean }
    expect(value.kind).toBe('tabular')
    expect(value.row_count).toBe(12)
    expect(value.rows).toHaveLength(8)
    expect(value.truncated).toBe(true)
    expect(result.text).toContain('preview: 8 of 12 rows')
  })

  it('previews an expert profile excerpt and a service offering', async () => {
    const { execute } = await mount(alphaProvider())
    const profile = await execute('connector_fetch', { dataset_id: 'experts/1' })
    expect(profile.isError).toBe(false)
    expect(profile.text).toContain('漯河电商协会会长')
    expect(profile.text).toContain('connector_transfer lands the full content')
    const service = await execute('connector_fetch', { dataset_id: 'services/1' })
    expect(service.isError).toBe(false)
    expect(service.text).toContain('中亚货运动线方案')
    expect(service.text).toContain('PDF 方案')
  })

  it('rejects a model-supplied tenant and refuses unknown or ambiguous ids', async () => {
    const provider = alphaProvider()
    const { execute } = await mount(provider)
    const tenant = await execute('connector_fetch', { dataset_id: 'ledger', tenant: 'other-co' })
    expect(tenant.isError).toBe(true)
    expect(tenant.text).toMatch(/tenant/u)

    const missing = await execute('connector_fetch', { dataset_id: 'ghost' })
    expect(missing.isError).toBe(true)
    expect(missing.text).toMatch(/no connector provider exposes a dataset/u)
  })

  it('demands provider_id when several providers share the dataset id', async () => {
    const { execute } = await mount(alphaProvider(), betaProvider())
    const ambiguous = await execute('connector_fetch', { dataset_id: 'ledger' })
    expect(ambiguous.isError).toBe(true)
    expect(ambiguous.text).toMatch(/exposed by several providers \(alpha, beta\)/u)
    const pinned = await execute('connector_fetch', { dataset_id: 'ledger', provider_id: 'alpha' })
    expect(pinned.isError).toBe(false)
    const value = pinned.value as { provider: string }
    expect(value.provider).toBe('alpha')
  })
})

describe('connector_transfer', () => {
  it('lands a tabular dataset through the real lakehouse seam and renders the receipt', async () => {
    const { execute, catalog } = await mount(alphaProvider())
    const result = await execute('connector_transfer', { dataset_id: 'ledger' })
    expect(result.isError).toBe(false)
    const value = result.value as { destination: string; table: string; rows: number; transfer_record_id: number }
    expect(value).toMatchObject({ destination: 'lakehouse', table: 'export_ledger', rows: 12, transfer_record_id: 1 })
    expect(result.text).toContain('`export_ledger`')
    expect(result.text).toContain('lakehouse_query')
    expect(catalog.tables.get('bound-tenant/export_ledger')?.rowCount).toBe(12)
    expect(catalog.transfers[0]).toMatchObject({ destination: 'lakehouse', datasetId: 'ledger', rows: 12 })
  })

  it('lands an expert profile through the real kb seam under the bound tenant', async () => {
    const { execute, kbStore, catalog } = await mount(alphaProvider())
    const result = await execute('connector_transfer', { dataset_id: 'experts/1' })
    expect(result.isError).toBe(false)
    const value = result.value as { destination: string; document: { doc_id: number } }
    expect(value.destination).toBe('kb')
    expect(value.document.doc_id).toBe(1)
    expect(kbStore.documents[0]?.doc.tenantId).toBe('bound-tenant')
    expect(catalog.transfers[0]).toMatchObject({ destination: 'kb', datasetId: 'experts/1', rows: 1 })
  })

  it('rejects a model-supplied tenant and an invalid target', async () => {
    const { execute } = await mount(alphaProvider())
    const tenant = await execute('connector_transfer', { dataset_id: 'ledger', tenant: 'other-co' })
    expect(tenant.isError).toBe(true)
    expect(tenant.text).toMatch(/tenant/u)
    const target = await execute('connector_transfer', { dataset_id: 'ledger', target: 'sideways' })
    expect(target.isError).toBe(true)
    expect(target.text).toMatch(/target/u)
  })

  it('fails structured when the pinned target disagrees with classification', async () => {
    const { execute } = await mount(alphaProvider())
    const result = await execute('connector_transfer', { dataset_id: 'ledger', target: 'kb' })
    expect(result.isError).toBe(true)
    expect(result.text).toMatch(/classifies to lakehouse/u)
  })
})

describe('degraded mode', () => {
  it('keeps the tools visible and fails structured when the provider is unavailable', async () => {
    const provider = alphaProvider()
    provider.up = false
    const { execute } = await mount(provider)
    const discover = await execute('connector_discover', {})
    expect(discover.isError).toBe(false)
    expect(discover.text).toMatch(/No connector datasets matched/u)
    const fetch = await execute('connector_fetch', { dataset_id: 'ledger' })
    expect(fetch.isError).toBe(true)
    expect(fetch.text).toMatch(/unavailable/u)
  })
})

describe('presentation projections', () => {
  it('narrows metadata and falls back on malformed values', () => {
    expect(ToolConnector.discoverMetaFromResult({ datasets: 2, providers: ['alpha'] })).toEqual({ datasets: 2, providers: ['alpha'] })
    expect(ToolConnector.discoverMetaFromResult('nope')).toBeUndefined()
    // Expert-card summaries ride the meta as an optional field; malformed
    // expert entries reject the whole projection.
    expect(ToolConnector.discoverMetaFromResult({ datasets: 2, providers: ['alpha'], experts: [{ name: '张红喜', org: '漯河市电子商务协会（会长）' }] })).toEqual({
      datasets: 2,
      providers: ['alpha'],
      experts: [{ name: '张红喜', org: '漯河市电子商务协会（会长）' }],
    })
    expect(ToolConnector.discoverMetaFromResult({ datasets: 2, providers: ['alpha'], experts: [{ name: '张红喜', org: 7 }] })).toBeUndefined()
    expect(ToolConnector.discoverMetaFromResult({ datasets: 2, providers: ['alpha'], experts: [{ org: '缺名字' }] })).toBeUndefined()
    expect(ToolConnector.discoverMetaFromResult({ datasets: 2, providers: ['alpha'], experts: '张红喜' })).toBeUndefined()
    expect(ToolConnector.discoverMetaFromResult({ datasets: 2, providers: ['alpha'], experts: [null] })).toBeUndefined()
    const card = ToolConnector.presentDiscoverResult({}, {
      isError: false,
      content: [],
      meta: { datasets: 3, providers: ['alpha'], experts: [{ name: '张红喜', org: '漯河市电子商务协会（会长）' }] },
    })
    expect(card?.content?.map(block => (block as { text: string }).text)).toEqual([
      '3 datasets from alpha',
      '专家：张红喜（漯河市电子商务协会（会长））',
    ])
    expect(ToolConnector.fetchMetaFromResult({ kind: 'tabular', label: 'alpha/ledger' })).toEqual({ kind: 'tabular', label: 'alpha/ledger' })
    expect(ToolConnector.fetchMetaFromResult({})).toBeUndefined()
    expect(ToolConnector.transferMetaFromResult({ destination: 'lakehouse', rows: 3, landing: 'table t' })).toEqual({ destination: 'lakehouse', rows: 3, landing: 'table t' })
    expect(ToolConnector.transferMetaFromResult({ destination: 'kb', rows: 'x', landing: 'doc' })).toBeUndefined()
    expect(ToolConnector.presentDiscoverResult({}, { isError: true, content: [] })).toBeUndefined()
    expect(ToolConnector.presentFetchResult({ dataset_id: 'x' }, { isError: false, content: [], meta: 'malformed' })).toBeUndefined()
    expect(ToolConnector.presentTransferResult({ dataset_id: 'x' }, { isError: false, content: [], meta: 'malformed' })).toBeUndefined()
  })
})

describe('pure projections', () => {
  const encoder = new TextEncoder()

  it('parses discover inputs, dropping blank queries and empty kind lists', () => {
    expect(ToolConnector.parseDiscoverArgs({})).toEqual({})
    expect(ToolConnector.parseDiscoverArgs({ query: '   ', kinds: [] })).toEqual({})
    expect(ToolConnector.parseDiscoverArgs({ query: '中亚', kinds: ['tabular'] })).toEqual({ query: '中亚', kinds: ['tabular'] })
  })

  it('refuses blank dataset ids and unknown transfer targets at parse time', () => {
    expect(() => ToolConnector.parseFetchArgs({ dataset_id: '   ' })).toThrow(/non-empty/u)
    expect(() => ToolConnector.parseTransferArgs({ dataset_id: 'x', target: 'sideways' })).toThrow(/target/u)
    expect(ToolConnector.parseTransferArgs({ dataset_id: ' x ' })).toEqual({ datasetId: 'x', target: 'auto' })
    expect(ToolConnector.parseTransferArgs({ dataset_id: 'x', provider_id: ' p ', target: 'kb' })).toEqual({ datasetId: 'x', providerId: 'p', target: 'kb' })
  })

  it('projects and renders every fetch-preview kind', () => {
    const tabular = ToolConnector.fetchValueFromDataset({
      kind: 'tabular', id: 't', title: 't', manifest: { providerId: 'p' },
      tabular: { columns: [{ name: 'a', sqlType: 'TEXT' }], rows: [['x']] },
    })
    expect(ToolConnector.formatFetchOutput(tabular)).toContain('| a |')
    const file = ToolConnector.fetchValueFromDataset({
      kind: 'file', id: 'f', title: 'f', manifest: { providerId: 'p' },
      file: { filename: 'note.md', bytes: encoder.encode('# hi') },
    })
    expect(file.kind).toBe('file')
    expect(ToolConnector.formatFetchOutput(file)).toContain('# hi')
    const doc = ToolConnector.fetchValueFromDataset({
      kind: 'document', id: 'd', title: 'd', manifest: { providerId: 'p' },
      ingest: { sourcePath: 's.md', docKind: 'report', content: '正文' },
    })
    expect(ToolConnector.formatFetchOutput(doc)).toContain('正文')
    const bare = ToolConnector.fetchValueFromDataset({
      kind: 'expert-profile', id: 'e', title: 'e', manifest: { providerId: 'p' },
      ingest: { sourcePath: 'e.md', docKind: 'profile', title: '专家', content: '画像' },
    })
    expect(ToolConnector.formatFetchOutput(bare)).toContain('画像')
    const svc = ToolConnector.fetchValueFromDataset({
      kind: 'service', id: 's', title: 's', manifest: { providerId: 'p' },
      service: { serviceId: 's', name: '咨询' },
    })
    expect(ToolConnector.formatFetchOutput(svc)).toContain('咨询')
  })

  it('renders the discover listing and the transfer receipt text', () => {
    const listing = ToolConnector.discoverValueFromSummaries(undefined, [
      { id: 'experts/1', title: '张', kind: 'expert-profile', manifest: { providerId: 'p' } },
      { id: 'services/1', title: '方案', kind: 'service', manifest: { providerId: 'p', description: 'PDF' } },
      { id: 'd/1', title: '台账', kind: 'tabular', manifest: { providerId: 'p' } },
      { id: 'd/2', title: '指南', kind: 'document', manifest: { providerId: 'p' } },
    ])
    const text = ToolConnector.formatDiscoverOutput(listing)
    expect(text).toContain('## Experts')
    expect(text).toContain('## Expert services')
    expect(text).toContain('## Datasets')
    expect(listing.query).toBeUndefined()
    const receipt = ToolConnector.formatTransferOutput({
      dataset_id: 'd/1', dataset_kind: 'tabular', provider: 'p', destination: 'lakehouse',
      rows: 3, replaced: true, table: 't', transfer_record_id: 2,
    })
    expect(receipt).toContain('replaced')
    expect(receipt).toContain('transfer record 2')
    const kbReceipt = ToolConnector.formatTransferOutput({
      dataset_id: 'e/1', dataset_kind: 'expert-profile', provider: 'p', destination: 'kb',
      rows: 1, replaced: false, document: { doc_id: 1, chunks: 2, embedded: false }, transfer_record_id: 3,
    })
    expect(kbReceipt).toContain('document 1')
  })

  it('attaches expert summaries to the presentation meta, org-less experts included', async () => {
    const provider = new ScriptedProvider('gamma', [
      { id: 'experts/9', title: '李顾问', kind: 'expert-profile', manifest: { providerId: 'gamma' } },
    ], new Map<string, ConnectorDataset>())
    const { execute } = await mount(provider)
    const result = await execute('connector_discover', { query: '顾问' })
    expect(result.isError).toBe(false)
    const presented = ToolConnector.presentDiscoverResult({}, {
      isError: false,
      content: [],
      meta: result.meta as { datasets: number; providers: string[] },
    })
    expect(presented?.content?.map(block => (block as { text: string }).text)).toEqual([
      '1 dataset from gamma',
      '专家：李顾问',
    ])
  })

  it('renders partial listings and rejects malformed meta shapes', () => {
    const one = (kind: 'expert-profile' | 'service' | 'tabular') => [
      { id: `${kind}/1`, title: kind, kind, manifest: { providerId: 'p' } },
    ] as const
    expect(ToolConnector.formatDiscoverOutput(ToolConnector.discoverValueFromSummaries('中亚', one('expert-profile')))).toContain('## Experts')
    expect(ToolConnector.formatDiscoverOutput(ToolConnector.discoverValueFromSummaries(undefined, one('service')))).not.toContain('## Experts')
    expect(ToolConnector.formatDiscoverOutput(ToolConnector.discoverValueFromSummaries(undefined, one('service')))).toContain('## Expert services')
    expect(ToolConnector.formatDiscoverOutput(ToolConnector.discoverValueFromSummaries(undefined, one('tabular')))).toContain('## Datasets')
    // An expert card with a description but no domain tags renders the intro
    // line and skips the empty domains line.
    const described = ToolConnector.discoverValueFromSummaries(undefined, [
      { id: 'experts/9', title: '李顾问', kind: 'expert-profile', manifest: { providerId: 'p', description: '跨境合规' }, expert: { domains: [] } },
    ])
    const card = ToolConnector.formatDiscoverOutput(described)
    expect(card).toContain('### 李顾问')
    expect(card).toContain('- 简介：跨境合规')
    expect(card).not.toContain('领域：')
    expect(card).not.toContain('可服务项')
    // A service attached to an unknown expert id stays in the standalone section.
    const orphan = ToolConnector.formatDiscoverOutput(ToolConnector.discoverValueFromSummaries(undefined, [
      { id: 'experts/1', title: '张红喜', kind: 'expert-profile', manifest: { providerId: 'p' } },
      { id: 'services/5', title: '悬空服务', kind: 'service', manifest: { providerId: 'p' }, service: { serviceId: 'services/5', expertId: 'experts/99', name: '悬空服务' } },
    ]))
    expect(orphan).toContain('## Expert services')
    expect(orphan).toContain('悬空服务')
    // A blank manifest description drops out of the projection; a service
    // without an expert reference and without deliverable/price renders its
    // card line without the spec suffix.
    const blankDescription = ToolConnector.discoverValueFromSummaries('q', [
      { id: 'services/6', title: '裸服务', kind: 'service', manifest: { providerId: 'p', description: '' }, service: { serviceId: 'services/6', name: '裸服务' } },
    ])
    expect(blankDescription.datasets[0]).not.toHaveProperty('description')
    const bareService = ToolConnector.formatDiscoverOutput(ToolConnector.discoverValueFromSummaries(undefined, [
      { id: 'experts/2', title: '王顾问', kind: 'expert-profile', manifest: { providerId: 'p' }, expert: { org: '某协会', domains: ['合规'] } },
      { id: 'services/7', title: '裸咨询', kind: 'service', manifest: { providerId: 'p' }, service: { serviceId: 'services/7', expertId: 'experts/2', name: '裸咨询' } },
    ]))
    expect(bareService).toContain('裸咨询 — dataset id `services/7`')
    expect(bareService).not.toContain('裸咨询（')
    const bare = ToolConnector.discoverValueFromSummaries(undefined, [
      { id: 'x', title: 'x', kind: 'tabular', manifest: { providerId: 'p' } },
    ])
    expect(bare.datasets[0]).not.toHaveProperty('updated_at')
    expect(bare.datasets[0]).not.toHaveProperty('description')
    expect(bare.query).toBeUndefined()
    expect(ToolConnector.discoverMetaFromResult([])).toBeUndefined()
    expect(ToolConnector.discoverMetaFromResult({ datasets: -1, providers: [] })).toBeUndefined()
    expect(ToolConnector.discoverMetaFromResult({ datasets: 1.5, providers: [] })).toBeUndefined()
    expect(ToolConnector.discoverMetaFromResult({ datasets: 1, providers: 'p' })).toBeUndefined()
    expect(ToolConnector.discoverMetaFromResult({ datasets: 1, providers: [1] })).toBeUndefined()
  })

  it('runs concurrency-safe tools in parallel and single/plural card text', async () => {
    const { execute } = await mount(alphaProvider())
    const [a, b] = await Promise.all([
      execute('connector_discover', { query: '中亚' }),
      execute('connector_fetch', { dataset_id: 'ledger' }),
    ])
    expect(a.isError || b.isError).toBe(false)
    const one = ToolConnector.presentDiscoverResult({}, { isError: false, content: [], meta: { datasets: 1, providers: ['alpha'] } })
    expect(one?.content?.[0]).toMatchObject({ text: '1 dataset from alpha' })
    const transfer = await execute('connector_transfer', { dataset_id: 'ledger' })
    expect(transfer.isError).toBe(false)
  })

  it('registers no tools when every enablement flag is false', async () => {
    const ctx = new Context()
    contexts.push(ctx)
    await ctx.plugin(SystemPrompt)
    await ctx.plugin(ToolRuntime)
    await ctx.plugin(ConnectorRuntime)
    ctx.connector.registerProvider(alphaProvider())
    await ctx.plugin(ToolConnector, { tenant: 'bound-tenant', discover: false, fetch: false, transfer: false, orders: false, assets: false })
    expect(ctx.tools.schemas().map(schema => schema.name)).toEqual([])
  })

  it('covers absent optional fields and long excerpts in every preview projection', () => {
    const file = ToolConnector.fetchValueFromDataset({
      kind: 'file', id: 'f', title: 'f', manifest: { providerId: 'p' },
      file: { filename: 'a.csv', bytes: encoder.encode('x'.repeat(500)) },
    })
    expect(file.kind).toBe('file')
    if (file.kind !== 'file') throw new Error('unreachable')
    expect(file.mime).toBeUndefined()
    expect(file.text_preview.endsWith('…')).toBe(true)
    const untitled = ToolConnector.fetchValueFromDataset({
      kind: 'document', id: 'd', title: 'd', manifest: { providerId: 'p' },
      ingest: { sourcePath: 's.md', docKind: 'other', content: '短文' },
    })
    expect(untitled.kind).toBe('document')
    if (untitled.kind !== 'document' && untitled.kind !== 'expert-profile') throw new Error('unreachable')
    expect(untitled.title).toBeUndefined()
    const bare = ToolConnector.fetchValueFromDataset({
      kind: 'service', id: 's', title: 's', manifest: { providerId: 'p' },
      service: { serviceId: 's', name: '咨询' },
    })
    expect(bare.kind).toBe('service')
    if (bare.kind !== 'service') throw new Error('unreachable')
    expect(bare.deliverable).toBeUndefined()
    expect(bare.summary).toBeUndefined()
    expect(ToolConnector.presentFetchResult({ dataset_id: 'x' }, { isError: true, content: [] })).toBeUndefined()
    expect(ToolConnector.presentTransferResult({ dataset_id: 'x' }, { isError: true, content: [] })).toBeUndefined()
  })

  it('covers malformed meta narrowing, empty provider lists, and sorted projections', () => {
    expect(ToolConnector.discoverMetaFromResult({ datasets: 0, providers: [] })).toEqual({ datasets: 0, providers: [] })
    expect(ToolConnector.discoverMetaFromResult(null)).toBeUndefined()
    const listing = ToolConnector.discoverValueFromSummaries('中亚', [
      { id: 'b', title: '乙', kind: 'tabular', manifest: { providerId: 'p' } },
      { id: 'a', title: '甲', kind: 'tabular', manifest: { providerId: 'p' } },
      { id: 'c', title: '丙', kind: 'document', manifest: { providerId: 'p', description: '' } },
    ])
    expect(listing.datasets.map(entry => entry.id)).toEqual(['c', 'b', 'a'])
    const noProviders = ToolConnector.formatDiscoverOutput({ providers: [], datasets: [] })
    expect(noProviders).toContain('No connector datasets matched')
  })

  it('covers every formatting arm of the receipt and preview text', () => {
    // tabular: zero rows + NULL + pipe/newline escaping
    const empty = ToolConnector.formatFetchOutput({
      kind: 'tabular', dataset_id: 't', provider: 'p',
      columns: [{ name: 'a', type: 'TEXT' }], rows: [], row_count: 0, truncated: false,
    })
    expect(empty).toContain('(preview: 0 of 0 rows)')
    const messy = ToolConnector.formatFetchOutput({
      kind: 'tabular', dataset_id: 't', provider: 'p',
      columns: [{ name: 'a', type: 'TEXT' }], rows: [[null], ['x|y\nz']], row_count: 2, truncated: true,
    })
    expect(messy).toContain('NULL')
    expect(messy).toContain('x\\|y z')
    // file: no mime + empty preview
    const bareFile = ToolConnector.formatFetchOutput({
      kind: 'file', dataset_id: 'f', provider: 'p', filename: 'a.csv', size_bytes: 0, text_preview: '',
    })
    expect(bareFile).toContain('(no decodable text preview)')
    expect(bareFile).toContain('(0 bytes)')
    // service: both optional fields present
    const full = ToolConnector.formatFetchOutput({
      kind: 'service', dataset_id: 's', provider: 'p', service_id: 's', name: '方案', deliverable: 'PDF', summary: '动线设计',
    })
    expect(full).toContain('deliverable: PDF')
    expect(full).toContain('动线设计')
    // document without title
    const untitled = ToolConnector.formatFetchOutput({
      kind: 'document', dataset_id: 'd', provider: 'p', doc_kind: 'other', excerpt: '正文', content_chars: 2,
    })
    expect(untitled).toContain('正文')
    // receipt: lakehouse plural rows + replaced, kb embedded
    expect(ToolConnector.formatTransferOutput({
      dataset_id: 'x', dataset_kind: 'tabular', provider: 'p', destination: 'lakehouse',
      rows: 3, replaced: true, table: 't', transfer_record_id: 1,
    })).toContain('3 rows (replaced a prior load of the same table)')
    expect(ToolConnector.formatTransferOutput({
      dataset_id: 'y', dataset_kind: 'expert-profile', provider: 'p', destination: 'kb',
      rows: 1, replaced: false, document: { doc_id: 1, chunks: 2, embedded: true }, transfer_record_id: 2,
    })).not.toContain('text-only')
    // meta narrowing: array meta, missing landing, non-integer rows
    expect(ToolConnector.transferMetaFromResult([])).toBeUndefined()
    expect(ToolConnector.transferMetaFromResult({ destination: 'kb', rows: 1 })).toBeUndefined()
    expect(ToolConnector.transferMetaFromResult({ destination: 'kb', rows: 1.5, landing: 'd' })).toBeUndefined()
    // present cards: singular dataset, empty providers
    expect(ToolConnector.presentDiscoverResult({}, { isError: false, content: [], meta: { datasets: 1, providers: [] } })?.content?.[0])
      .toMatchObject({ text: '1 dataset from no provider' })
  })

  it('covers the remaining formatter and presentation arms', () => {
    // file projection with mime; service projection with deliverable only and summary only
    const withMime = ToolConnector.fetchValueFromDataset({
      kind: 'file', id: 'f', title: 'f', manifest: { providerId: 'p' },
      file: { filename: 'a.csv', bytes: encoder.encode('x'), mime: 'text/csv' },
    })
    if (withMime.kind !== 'file') throw new Error('unreachable')
    expect(withMime.mime).toBe('text/csv')
    const deliverableOnly = ToolConnector.fetchValueFromDataset({
      kind: 'service', id: 's', title: 's', manifest: { providerId: 'p' },
      service: { serviceId: 's', name: 'n', deliverable: 'PDF' },
    })
    if (deliverableOnly.kind !== 'service') throw new Error('unreachable')
    expect(deliverableOnly.summary).toBeUndefined()
    expect(ToolConnector.formatFetchOutput(deliverableOnly)).toContain('deliverable: PDF')
    const summaryOnly = ToolConnector.fetchValueFromDataset({
      kind: 'service', id: 's2', title: 's2', manifest: { providerId: 'p' },
      service: { serviceId: 's2', name: 'n2', summary: '摘要' },
    })
    if (summaryOnly.kind !== 'service') throw new Error('unreachable')
    expect(ToolConnector.formatFetchOutput(summaryOnly)).toContain('摘要')
    // file receipt text with a decodable preview and mime
    expect(ToolConnector.formatFetchOutput(withMime)).toContain(', text/csv)')
    // singular-row lakehouse receipt
    expect(ToolConnector.formatTransferOutput({
      dataset_id: 'x', dataset_kind: 'tabular', provider: 'p', destination: 'lakehouse',
      rows: 1, replaced: false, table: 't', transfer_record_id: 4,
    })).toContain('1 row\n')
    // blank transfer dataset id falls back to the tool title
    expect(ToolConnector.presentTransferCall({ dataset_id: '   ' })).toMatchObject({ title: 'connector_transfer' })
    // presentDiscoverResult: malformed meta returns undefined; plural providers join
    expect(ToolConnector.presentDiscoverResult({}, { isError: false, content: [], meta: 'malformed' })).toBeUndefined()
    expect(ToolConnector.presentDiscoverResult({}, { isError: false, content: [], meta: { datasets: 2, providers: ['a', 'b'] } })?.content?.[0])
      .toMatchObject({ text: '2 datasets from a, b' })
  })

  it('reports its concurrency markers through the registry', async () => {
    await mount(alphaProvider())
    const ctx = contexts.at(-1)
    expect(ctx?.tools.get('connector_discover')?.isConcurrencySafe?.({})).toBe(true)
    expect(ctx?.tools.get('connector_fetch')?.isConcurrencySafe?.({ dataset_id: 'x' })).toBe(true)
    expect(ctx?.tools.get('connector_transfer')?.isConcurrencySafe?.({ dataset_id: 'x' })).toBe(false)
  })

  it('consults the concurrency markers while a discovery call is in flight', async () => {
    const provider = alphaProvider()
    provider.discover = async () => {
      await new Promise(resolve => setTimeout(resolve, 40))
      return provider.summariesForConcurrencyProbe()
    }
    const { execute } = await mount(provider)
    const [a, b, c] = await Promise.all([
      execute('connector_discover', { query: 'a' }),
      execute('connector_discover', { query: 'b' }),
      execute('connector_fetch', { dataset_id: 'ledger' }),
    ])
    expect(a.text.length + b.text.length + c.text.length).toBeGreaterThan(0)
  })

  it('projects pending and completed presentation cards', () => {
    expect(ToolConnector.presentDiscoverCall({ query: '中亚' })).toMatchObject({ card: 'generic', title: '中亚' })
    expect(ToolConnector.presentDiscoverCall({})).toMatchObject({ title: 'connector_discover' })
    expect(ToolConnector.presentFetchCall({ dataset_id: 'x' })).toMatchObject({ title: 'x' })
    expect(ToolConnector.presentFetchCall({ dataset_id: '  ' })).toMatchObject({ title: 'connector_fetch' })
    expect(ToolConnector.presentTransferCall({ dataset_id: 'y' })).toMatchObject({ title: 'y', kind: 'move' })
    const ok = { isError: false, content: [] } as never
    expect(ToolConnector.presentDiscoverResult({}, { isError: false, content: [], meta: { datasets: 1, providers: ['p'] } })).toBeDefined()
    expect(ToolConnector.presentFetchResult({ dataset_id: 'x' }, { isError: false, content: [], meta: { kind: 'tabular', label: 'p/x' } })).toBeDefined()
    expect(ToolConnector.presentTransferResult({ dataset_id: 'x' }, { isError: false, content: [], meta: { destination: 'lakehouse', rows: 2, landing: 'table t' } })).toBeDefined()
    void ok
  })
})

/** A scripted orders seam recording every forwarded call. */
/** One scripted order row the orders stub serves. */
interface OrderRow {
  id: number
  orderNo: string
  serviceId: string
  serviceName: string
  price?: string
  brief: string
  status: string
  deliverablePath?: string
  note?: string
  createdAt: string
}

function ordersStub() {
  const calls: string[] = []
  const rows = new Map<number, OrderRow>()
  const orders = {
    async create(request: { serviceId: string; brief: string; clientName?: string }, signal?: AbortSignal) {
      void signal
      calls.push(`create:${request.serviceId}`)
      const id = rows.size + 1
      const row = {
        id,
        orderNo: `ORD-20260905-000${id}`,
        serviceId: request.serviceId,
        serviceName: '海外仓风险应对咨询',
        price: '¥6,800/份',
        brief: request.brief,
        status: 'pending',
        createdAt: '2026-09-05T08:00:00.000Z',
      }
      rows.set(id, row)
      return row
    },
    async get(orderId: number, signal?: AbortSignal) {
      void signal
      calls.push(`get:${orderId}`)
      return rows.get(orderId)
    },
    async list(signal?: AbortSignal) {
      void signal
      calls.push('list')
      return [...rows.values()]
    },
    async fulfill(orderId: number, signal?: AbortSignal) {
      void signal
      calls.push(`fulfill:${orderId}`)
      const row = rows.get(orderId)
      if (row === undefined) throw new Error(`no order ${orderId} exists at the orders source of truth`)
      const fulfilled = { ...row, status: 'delivered', deliverablePath: `workspace/deliverables/${row.orderNo}.pdf` }
      rows.set(orderId, fulfilled)
      return fulfilled
    },
    async readDeliverable(orderId: number, signal?: AbortSignal) {
      void signal
      calls.push(`deliverable:${orderId}`)
      const row = rows.get(orderId)
      if (row?.deliverablePath === undefined) throw new Error('no deliverable')
      return { path: row.deliverablePath, bytes: new Uint8Array([0x25, 0x50, 0x44, 0x46]) }
    },
  }
  return { orders, calls }
}

describe('order tools', () => {
  /** Mount the suite with a scripted orders seam (no connector providers needed). */
  async function mountOrders(): Promise<{ execute: Execute; calls: string[] }> {
    const ctx = new Context()
    contexts.push(ctx)
    await ctx.plugin(SystemPrompt)
    await ctx.plugin(ToolRuntime)
    // tool-connector's inject list names the connector seam; mount the empty
    // runtime so the plugin loads (the order tools never touch it).
    await ctx.plugin(ConnectorRuntime)
    const stub = ordersStub()
    ctx.provide('orders', stub.orders as never)
    await ctx.plugin(ToolConnector, { tenant: 'bound-tenant' })
    return { execute: executeOn(ctx), calls: stub.calls }
  }

  it('order_create places the order, fulfills it, and receipts the deliverable path', async () => {
    const { execute, calls } = await mountOrders()
    const result = await execute('order_create', { service_id: 'expert_services/2', brief: '海外仓应急方案。', client_name: '漯河宏发食品有限公司' })
    expect(result.isError).toBe(false)
    expect(result.value).toMatchObject({
      order_id: 1,
      order_no: 'ORD-20260905-0001',
      service_name: '海外仓风险应对咨询',
      status: 'delivered',
      deliverable_path: 'workspace/deliverables/ORD-20260905-0001.pdf',
    })
    expect(result.text).toContain('订单已创建并完成生成：ORD-20260905-0001')
    expect(result.text).toContain('workspace/deliverables/ORD-20260905-0001.pdf')
    expect(calls).toEqual(['create:expert_services/2', 'fulfill:1'])
    expect(result.meta).toEqual({
      order_id: 1,
      order_no: 'ORD-20260905-0001',
      status: 'delivered',
      service_name: '海外仓风险应对咨询',
      deliverable_path: 'workspace/deliverables/ORD-20260905-0001.pdf',
    })
  })

  it('orderCreateMetaFromResult replays older metas without order_id and drops malformed late fields', () => {
    // A pre-projection log carries the three identity fields only; the view
    // keeps rendering the receipt and simply omits the jump entry.
    expect(ToolConnector.orderCreateMetaFromResult({ order_no: 'ORD-20260905-0001', status: 'delivered', service_name: '海外仓风险应对咨询' }))
      .toEqual({ order_no: 'ORD-20260905-0001', status: 'delivered', service_name: '海外仓风险应对咨询' })
    // Non-positive-integer / non-string late fields are ignored, not fatal.
    expect(ToolConnector.orderCreateMetaFromResult({ order_id: 0, order_no: 'ORD-1', status: 'delivered', service_name: 's', deliverable_path: '' }))
      .toEqual({ order_no: 'ORD-1', status: 'delivered', service_name: 's' })
    expect(ToolConnector.orderCreateMetaFromResult({ order_id: 'x', order_no: 'ORD-1', status: 'delivered', service_name: 's' })?.order_id)
      .toBeUndefined()
    // The strict identity fields still gate the whole projection.
    expect(ToolConnector.orderCreateMetaFromResult({ order_id: 3, order_no: '', status: 'delivered', service_name: 's' })).toBeUndefined()
  })

  it('order_create rejects a model-supplied tenant and blank fields', async () => {
    const { execute } = await mountOrders()
    const tenant = await execute('order_create', { service_id: 'expert_services/2', brief: 'b', tenant: 'x' })
    expect(tenant.isError).toBe(true)
    expect(tenant.text).toContain('tenant')
    const blank = await execute('order_create', { service_id: '  ', brief: 'b' })
    expect(blank.isError).toBe(true)
    expect(blank.text).toContain('service_id')
  })

  it('order_status reads one order and lists the recent ones', async () => {
    const { execute, calls } = await mountOrders()
    await execute('order_create', { service_id: 'expert_services/1', brief: '中亚货运动线。' })
    const single = await execute('order_status', { order_id: 1 })
    expect(single.isError).toBe(false)
    expect(single.text).toContain('ORD-20260905-0001')
    expect(single.text).toContain('已交付')
    const all = await execute('order_status', {})
    expect((all.value as { orders: unknown[] }).orders).toHaveLength(1)
    expect(all.meta).toEqual({ orders: 1, delivered: 1 })
    expect(calls).toEqual(['create:expert_services/1', 'fulfill:1', 'get:1', 'list'])
  })

  it('order_status names an unknown order id', async () => {
    const { execute } = await mountOrders()
    const missing = await execute('order_status', { order_id: 99 })
    expect(missing.isError).toBe(true)
    expect(missing.text).toContain('no order 99')
  })

  it('both order tools fail structured when no orders capability is composed', async () => {
    const ctx = new Context()
    contexts.push(ctx)
    await ctx.plugin(SystemPrompt)
    await ctx.plugin(ToolRuntime)
    await ctx.plugin(ConnectorRuntime)
    await ctx.plugin(ToolConnector, { tenant: 'bound-tenant' })
    const execute = executeOn(ctx)
    const create = await execute('order_create', { service_id: 'expert_services/2', brief: 'b' })
    expect(create.isError).toBe(true)
    expect(create.text).toContain('no orders capability')
    const status = await execute('order_status', {})
    expect(status.isError).toBe(true)
    expect(status.text).toContain('no orders capability')
  })
})
