/**
 * The connector seam's behavior: provider registration (duplicate refusal,
 * fiber-scoped disposal), discover fan-out (unavailable providers skip, kind
 * and query pass through), fetch routing error codes, and the five-step
 * transfer over the real kb and lakehouse seams — tabular/document/file
 * landings, target pins, routing refusals, absent handlers and seams, and the
 * confirm trail with its retry-converging failure semantics.
 */

import type { ConnectorCapability } from '../src/index.ts'
import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import LakehouseRuntime from '@deepseek-ai/dsh-lakehouse'
import type { CatalogStore, LakehouseTable, LakehouseTransferEntry, LakehouseTransferRecord, LakehouseUsage, LakehouseUsageDelta, QueryProvider, TabularData } from '@deepseek-ai/dsh-lakehouse'
import KbRuntime from '@deepseek-ai/dsh-kb'
import type { KbChunkInput, KbDocumentInput, KbIngestResult, KbSearchHit, KbStore, KbStoreStats, KbUsage, KbUsageDelta } from '@deepseek-ai/dsh-kb'
import ConnectorRuntime from '../src/index.ts'
import { ConnectorError } from '../src/index.ts'
import type { ConnectorDataset, ConnectorDatasetRef, ConnectorDatasetSummary, ConnectorProvider } from '../src/index.ts'

const encoder = new TextEncoder()

/** One two-row ledger reused across landings. */
function ledgerTabular(): TabularData {
  return {
    columns: [
      { name: 'region', sqlType: 'TEXT' },
      { name: 'amount_t', sqlType: 'DOUBLE' },
    ],
    rows: [
      ['中亚', 120.5],
      ['东南亚', 310],
    ],
  }
}

/** In-memory catalog stand-in with a confirm-failure switch. */
class FakeCatalog implements CatalogStore {
  readonly id = 'fake-catalog'
  failTransfers = false
  failWith: unknown = new Error('catalog offline')
  readonly tables = new Map<string, LakehouseTable>()
  readonly transfers: Array<LakehouseTransferRecord & { transferId: number }> = []
  usageCounters = new Map<string, LakehouseUsage>()

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

  async dropTable(tenantId: string, tableName: string): Promise<boolean> {
    return this.tables.delete(`${tenantId}/${tableName}`)
  }

  async recordTransfer(record: LakehouseTransferRecord): Promise<{ transferId: number }> {
    if (this.failTransfers) throw this.failWith
    const transferId = this.transfers.length + 1
    this.transfers.push({ ...record, transferId })
    return { transferId }
  }

  async listTransfers(limit: number): Promise<readonly LakehouseTransferEntry[]> {
    return [...this.transfers].reverse().slice(0, Math.max(0, limit))
  }

  async recordUsage(tenantId: string, delta: LakehouseUsageDelta): Promise<void> {
    const prior = this.usageCounters.get(tenantId) ?? { loadedTables: 0, lakehouseQueries: 0 }
    this.usageCounters.set(tenantId, {
      loadedTables: prior.loadedTables + (delta.loadedTables ?? 0),
      lakehouseQueries: prior.lakehouseQueries + (delta.lakehouseQueries ?? 0),
    })
  }

  async usage(tenantId: string): Promise<LakehouseUsage> {
    return this.usageCounters.get(tenantId) ?? { loadedTables: 0, lakehouseQueries: 0 }
  }

  close(): void {}
}

/** Minimal engine stand-in: writes are recorded, queries never run here. */
class FakeEngine implements QueryProvider {
  readonly id = 'fake-engine'
  readonly writes: Array<{ location: string; tabular: TabularData }> = []

  available(): boolean {
    return true
  }

  async writeParquet(location: string, tabular: TabularData): Promise<void> {
    this.writes.push({ location, tabular })
  }

  async query(): Promise<never> {
    throw new Error('not used in connector tests')
  }
}

/** In-memory kb store stand-in recording every ingested document. */
class FakeKbStore implements KbStore {
  readonly id = 'fake-kb-store'
  readonly documents: Array<{ doc: KbDocumentInput; chunks: readonly KbChunkInput[] }> = []
  private nextDocId = 1

  available(): boolean {
    return true
  }

  async putDocument(doc: KbDocumentInput, chunks: readonly KbChunkInput[]): Promise<KbIngestResult> {
    const docId = this.nextDocId
    this.nextDocId += 1
    this.documents.push({ doc, chunks })
    return { docId, chunks: chunks.length, embedded: false }
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
    return { searches: 0, ingestedDocuments: this.documents.length, ingestedChunks: 0, embedTexts: 0, embedTokens: 0 }
  }
}

interface Setup {
  ctx: Context
  connector: ConnectorRuntime
  catalog: FakeCatalog
  engine: FakeEngine
  kbStore: FakeKbStore
}

async function setup(withKb = true): Promise<Setup> {
  const ctx = new Context()
  await ctx.plugin(LakehouseRuntime, { dataRoot: 'workspace/lakehouse' })
  await ctx.plugin(ConnectorRuntime)
  if (withKb) await ctx.plugin(KbRuntime)
  const catalog = new FakeCatalog()
  const engine = new FakeEngine()
  const kbStore = new FakeKbStore()
  ctx.lakehouse.registerCatalogStore(catalog)
  ctx.lakehouse.registerQueryProvider(engine)
  if (withKb) ctx.kb.registerStoreProvider(kbStore)
  return { ctx, connector: ctx.connector, catalog, engine, kbStore }
}

/** A scripted provider: fixed summaries, fixed dataset by id, availability switch. */
class ScriptedProvider implements ConnectorProvider {
  readonly id: string
  up = true
  capabilities: readonly ConnectorCapability[] = ['discover', 'fetch']
  readonly fetchCalls: Array<{ datasetId: string }> = []
  readonly discoverCalls: Array<{ query?: string; kinds?: readonly string[] }> = []

  constructor(id: string, private readonly summaries: ConnectorDatasetSummary[], private readonly datasets: Map<string, ConnectorDataset>) {
    this.id = id
  }

  available(): boolean {
    return this.up
  }

  async discover(request: { query?: string; kinds?: readonly string[] }): Promise<readonly ConnectorDatasetSummary[]> {
    this.discoverCalls.push(request)
    return this.summaries
  }

  async fetch(ref: ConnectorDatasetRef): Promise<ConnectorDataset> {
    this.fetchCalls.push({ datasetId: ref.datasetId })
    const dataset = this.datasets.get(ref.datasetId)
    if (dataset === undefined) throw new ConnectorError(`dataset "${ref.datasetId}" not found`, 'CONNECTOR_DATASET_MISSING')
    return dataset
  }
}

function manifestOf(providerId: string): ConnectorDatasetSummary['manifest'] {
  return { providerId }
}

/** A provider whose datasets cover every content kind used below. */
function fullProvider(id = 'alpha'): ScriptedProvider {
  const summaries: ConnectorDatasetSummary[] = [
    { id: 'ledger', title: '出口台账', kind: 'tabular', manifest: manifestOf(id) },
    { id: 'note.md', title: '走访纪要', kind: 'file', manifest: manifestOf(id) },
    { id: 'ledger.csv', title: '海关出口 CSV', kind: 'file', manifest: manifestOf(id) },
    { id: 'briefing', title: '中亚简报', kind: 'document', manifest: { ...manifestOf(id), scope: 'derive' } },
    { id: 'experts/1', title: '张红喜', kind: 'expert-profile', manifest: manifestOf(id) },
    { id: 'services/1', title: '中亚货运动线方案', kind: 'service', manifest: manifestOf(id) },
  ]
  const datasets = new Map<string, ConnectorDataset>([
    ['ledger', { kind: 'tabular', id: 'ledger', title: '出口台账', manifest: manifestOf(id), tabular: ledgerTabular(), tableName: 'export_ledger' }],
    ['note.md', {
      kind: 'file',
      id: 'note.md',
      title: '走访纪要',
      manifest: manifestOf(id),
      file: { filename: 'note.md', bytes: encoder.encode('# 走访纪要\n\n东南亚订单因雨季物流延迟。') },
    }],
    ['ledger.csv', {
      kind: 'file',
      id: 'ledger.csv',
      title: '海关出口 CSV',
      manifest: manifestOf(id),
      file: { filename: 'ledger.csv', bytes: encoder.encode('region,amount_t\n中亚,120.5\n东南亚,310\n') },
    }],
    ['briefing', {
      kind: 'document',
      id: 'briefing',
      title: '中亚简报',
      manifest: { ...manifestOf(id), scope: 'derive' },
      ingest: { sourcePath: 'workspace/data/connectors/alpha/briefing.md', docKind: 'report', content: '中亚市场准入要点……' },
    }],
    ['experts/1', {
      kind: 'expert-profile',
      id: 'experts/1',
      title: '张红喜',
      manifest: manifestOf(id),
      ingest: { sourcePath: 'workspace/data/connectors/alpha/experts/1.md', docKind: 'profile', content: '张红喜，漯河电商协会会长，食品出海·中亚方向。' },
    }],
    ['services/1', { kind: 'service', id: 'services/1', title: '中亚货运动线方案', manifest: manifestOf(id), service: { serviceId: 'services/1', name: '中亚货运动线方案', deliverable: 'PDF 方案' } }],
  ])
  return new ScriptedProvider(id, summaries, datasets)
}

function expectCode(promise: Promise<unknown>, code: string): Promise<void> {
  return promise.then(
    () => { throw new Error(`expected rejection with ${code}`) },
    (error: unknown) => {
      expect(error).toBeInstanceOf(ConnectorError)
      expect((error as ConnectorError).code).toBe(code)
    },
  )
}

describe('ConnectorRuntime provider registry', () => {
  it('rejects a duplicate provider id and unregisters through the disposer', async () => {
    const { connector } = await setup()
    const provider = fullProvider()
    const dispose = connector.registerProvider(provider)
    expect(connector.providerIds()).toEqual(['alpha'])
    let duplicate: unknown
    try {
      connector.registerProvider(provider)
    } catch (error) {
      duplicate = error
    }
    expect(duplicate).toBeInstanceOf(ConnectorError)
    expect((duplicate as ConnectorError).code).toBe('CONNECTOR_DUPLICATE_PROVIDER')
    dispose()
    expect(connector.providerIds()).toEqual([])
  })

  it('describes registered providers with availability and capabilities', async () => {
    const { connector } = await setup()
    connector.registerProvider(fullProvider('beta'))
    connector.registerProvider(fullProvider('alpha'))
    const offline = fullProvider('gamma')
    offline.up = false
    connector.registerProvider(offline)
    expect(connector.describeProviders()).toEqual([
      { id: 'alpha', available: true, capabilities: ['discover', 'fetch'] },
      { id: 'beta', available: true, capabilities: ['discover', 'fetch'] },
      { id: 'gamma', available: false, capabilities: ['discover', 'fetch'] },
    ])
  })

  it('removes the registration when the mounting fiber is disposed', async () => {
    const { ctx, connector } = await setup()
    const fiber = ctx.plugin({
      name: 'mount-provider',
      inject: ['connector'],
      apply(c) {
        c.connector.registerProvider(fullProvider())
      },
    })
    await fiber
    expect(connector.providerIds()).toEqual(['alpha'])
    await fiber.dispose()
    expect(connector.providerIds()).toEqual([])
  })
})

describe('ConnectorRuntime discover', () => {
  it('merges summaries across usable providers in provider-id order and skips unavailable ones', async () => {
    const { connector } = await setup()
    connector.registerProvider(fullProvider('beta'))
    const down = fullProvider('alpha')
    connector.registerProvider(down)
    down.up = false
    const found = await connector.discover({})
    expect(found.map(summary => summary.manifest.providerId)).toEqual(['beta', 'beta', 'beta', 'beta', 'beta', 'beta'])
  })

  it('forwards query and kinds to every usable provider', async () => {
    const { connector } = await setup()
    const provider = fullProvider()
    connector.registerProvider(provider)
    await connector.discover({ query: '专家', kinds: ['expert-profile'] })
    expect(provider.discoverCalls).toEqual([{ query: '专家', kinds: ['expert-profile'] }])
  })

  it('fails loud when a usable provider errors mid-discover', async () => {
    const { connector } = await setup()
    const provider = fullProvider()
    provider.discover = async () => { throw new Error('upstream down') }
    connector.registerProvider(provider)
    await expect(connector.discover({})).rejects.toThrow(/upstream down/u)
  })
})

describe('ConnectorRuntime fetch routing', () => {
  it('fails loud for a missing provider, an unavailable provider, and an absent capability', async () => {
    const { connector } = await setup()
    const provider = fullProvider()
    connector.registerProvider(provider)
    await expectCode(connector.fetch({ providerId: 'ghost', datasetId: 'ledger' }), 'CONNECTOR_PROVIDER_MISSING')
    provider.up = false
    await expectCode(connector.fetch({ providerId: 'alpha', datasetId: 'ledger' }), 'CONNECTOR_PROVIDER_UNAVAILABLE')
    provider.up = true
    provider.capabilities = ['discover']
    await expectCode(connector.fetch({ providerId: 'alpha', datasetId: 'ledger' }), 'CONNECTOR_CAPABILITY_MISSING')
  })
})

describe('ConnectorRuntime transfer (five steps)', () => {
  it('lands a tabular dataset in the lakehouse, records the trail, and meters the load', async () => {
    const { connector, catalog } = await setup()
    connector.registerProvider(fullProvider())
    const result = await connector.transfer({ providerId: 'alpha', datasetId: 'ledger', tenantId: 'hongfa-food', target: 'auto' })
    expect(result).toMatchObject({
      datasetId: 'ledger',
      datasetKind: 'tabular',
      destination: 'lakehouse',
      rows: 2,
      replaced: false,
      table: 'export_ledger',
      transferRecordId: 1,
    })
    expect(catalog.tables.get('hongfa-food/export_ledger')?.provenance).toEqual({
      provider: 'connector:alpha',
      collectedSource: 'ledger',
    })
    expect(catalog.transfers[0]).toMatchObject({ source: 'alpha', destination: 'lakehouse', datasetId: 'ledger', rows: 2 })
    expect((await catalog.usage('hongfa-food')).loadedTables).toBe(1)
  })

  it('replaces the prior table on a re-run and reports it', async () => {
    const { connector } = await setup()
    connector.registerProvider(fullProvider())
    await connector.transfer({ providerId: 'alpha', datasetId: 'ledger', tenantId: 'hongfa-food', target: 'auto' })
    const again = await connector.transfer({ providerId: 'alpha', datasetId: 'ledger', tenantId: 'hongfa-food', target: 'auto' })
    expect(again.replaced).toBe(true)
    expect(again.transferRecordId).toBe(2)
  })

  it('lands a document dataset in the kb with connector provenance and records a kb-destination trail', async () => {
    const { connector, catalog, kbStore } = await setup()
    connector.registerProvider(fullProvider())
    const result = await connector.transfer({ providerId: 'alpha', datasetId: 'briefing', tenantId: 'hongfa-food', target: 'auto' })
    expect(result).toMatchObject({
      datasetKind: 'document',
      destination: 'kb',
      rows: 1,
      document: { docId: 1, embedded: false },
      transferRecordId: 1,
    })
    expect(kbStore.documents[0]?.doc.provenance).toEqual({
      provider: 'connector:alpha',
      collectedSource: 'briefing',
      scope: 'derive',
    })
    expect(catalog.transfers[0]).toMatchObject({ source: 'alpha', destination: 'kb', datasetId: 'briefing', rows: 1 })
  })

  it('lands an expert profile in the kb with its profile doc kind', async () => {
    const { connector, kbStore } = await setup()
    connector.registerProvider(fullProvider())
    await connector.transfer({ providerId: 'alpha', datasetId: 'experts/1', tenantId: 'hongfa-food', target: 'auto' })
    expect(kbStore.documents[0]?.doc.docKind).toBe('profile')
  })

  it('routes a csv file dataset through the shared data router into the lakehouse', async () => {
    const { connector, catalog } = await setup()
    connector.registerProvider(fullProvider())
    const result = await connector.transfer({ providerId: 'alpha', datasetId: 'ledger.csv', tenantId: 'hongfa-food', target: 'auto' })
    expect(result).toMatchObject({ destination: 'lakehouse', table: 'ledger', rows: 2 })
    expect(catalog.tables.get('hongfa-food/ledger')?.columns.map(column => column.name)).toEqual(['region', 'amount_t'])
  })

  it('routes a markdown file dataset into the kb with a namespaced source path', async () => {
    const { connector, kbStore } = await setup()
    connector.registerProvider(fullProvider())
    await connector.transfer({ providerId: 'alpha', datasetId: 'note.md', tenantId: 'hongfa-food', target: 'auto' })
    expect(kbStore.documents[0]?.doc.sourcePath).toBe('workspace/data/connectors/alpha/note.md')
    expect(kbStore.documents[0]?.chunks[0]?.content).toContain('东南亚订单')
  })

  it('refuses a pinned target that disagrees with the classified destination', async () => {
    const { connector } = await setup()
    connector.registerProvider(fullProvider())
    await expectCode(
      connector.transfer({ providerId: 'alpha', datasetId: 'ledger', tenantId: 'hongfa-food', target: 'kb' }),
      'CONNECTOR_TRANSFER_TARGET_MISMATCH',
    )
  })

  it('refuses a service dataset with no data payload', async () => {
    const { connector } = await setup()
    connector.registerProvider(fullProvider())
    await expectCode(
      connector.transfer({ providerId: 'alpha', datasetId: 'services/1', tenantId: 'hongfa-food', target: 'auto' }),
      'CONNECTOR_TRANSFER_UNSUPPORTED_KIND',
    )
  })

  it('surfaces data-router refusals with machine-readable codes', async () => {
    const { connector } = await setup()
    const provider = fullProvider()
    provider.fetch = async () => ({
      kind: 'file',
      id: 'mystery.bin',
      title: 'mystery',
      manifest: manifestOf('alpha'),
      file: { filename: 'mystery.bin', bytes: encoder.encode('x') },
    })
    connector.registerProvider(provider)
    await expectCode(
      connector.transfer({ providerId: 'alpha', datasetId: 'mystery.bin', tenantId: 'hongfa-food', target: 'auto' }),
      'CONNECTOR_ROUTE_UNSUPPORTED_TYPE',
    )
  })

  it('refuses file documents whose extraction the transfer path does not own', async () => {
    const { connector } = await setup()
    const provider = fullProvider()
    provider.fetch = async () => ({
      kind: 'file',
      id: 'scan.pdf',
      title: 'scan',
      manifest: manifestOf('alpha'),
      file: { filename: 'scan.pdf', bytes: encoder.encode('%PDF-1.7 fake') },
    })
    connector.registerProvider(provider)
    await expectCode(
      connector.transfer({ providerId: 'alpha', datasetId: 'scan.pdf', tenantId: 'hongfa-food', target: 'auto' }),
      'CONNECTOR_FILE_HANDLER_MISSING',
    )
  })

  it('refuses non-UTF-8 text landings instead of storing replacement characters', async () => {
    const { connector } = await setup()
    const provider = fullProvider()
    provider.fetch = async () => ({
      kind: 'file',
      id: 'broken.md',
      title: 'broken',
      manifest: manifestOf('alpha'),
      file: { filename: 'broken.md', bytes: new Uint8Array([0xff, 0xfe, 0xfd]) },
    })
    connector.registerProvider(provider)
    await expectCode(
      connector.transfer({ providerId: 'alpha', datasetId: 'broken.md', tenantId: 'hongfa-food', target: 'auto' }),
      'CONNECTOR_ROUTE_NOT_UTF8',
    )
  })

  it('rejects a tenant id that could traverse landing paths', async () => {
    const { connector } = await setup()
    connector.registerProvider(fullProvider())
    await expectCode(
      connector.transfer({ providerId: 'alpha', datasetId: 'ledger', tenantId: '../escape', target: 'auto' }),
      'CONNECTOR_INVALID_TENANT',
    )
  })

  it('derives the table name from the dataset id when the tabular hint is absent', async () => {
    const { connector, catalog } = await setup()
    const provider = fullProvider()
    provider.fetch = async () => ({
      kind: 'tabular',
      id: 'datasets/9',
      title: '无提示台账',
      manifest: manifestOf('alpha'),
      tabular: ledgerTabular(),
    })
    connector.registerProvider(provider)
    const result = await connector.transfer({ providerId: 'alpha', datasetId: 'datasets/9', tenantId: 'hongfa-food', target: 'auto' })
    expect(result.table).toBe('datasets_9')
    expect(catalog.tables.get('hongfa-food/datasets_9')?.rowCount).toBe(2)
  })

  it('lands a json row-array file dataset in the lakehouse', async () => {
    const { connector } = await setup()
    const provider = fullProvider()
    provider.fetch = async () => ({
      kind: 'file',
      id: 'rows.json',
      title: 'json 行集',
      manifest: manifestOf('alpha'),
      file: { filename: 'rows.json', bytes: encoder.encode('[{"region":"中亚","amount_t":1}]') },
    })
    connector.registerProvider(provider)
    const result = await connector.transfer({ providerId: 'alpha', datasetId: 'rows.json', tenantId: 'hongfa-food', target: 'auto' })
    expect(result).toMatchObject({ destination: 'lakehouse', table: 'rows', rows: 1 })
  })

  it('lands a real xlsx file dataset in the lakehouse through the exceljs reader', async () => {
    const { connector } = await setup()
    const { Workbook } = await import('exceljs')
    const workbook = new Workbook()
    const sheet = workbook.addWorksheet('Sheet1')
    sheet.addRow(['region', 'units'])
    sheet.addRow(['中亚', 120])
    const xlsx = Buffer.from(await workbook.xlsx.writeBuffer())
    const provider = fullProvider()
    provider.fetch = async () => ({
      kind: 'file',
      id: 'ledger.xlsx',
      title: 'xlsx 台账',
      manifest: manifestOf('alpha'),
      file: { filename: 'ledger.xlsx', bytes: xlsx },
    })
    connector.registerProvider(provider)
    const result = await connector.transfer({ providerId: 'alpha', datasetId: 'ledger.xlsx', tenantId: 'hongfa-food', target: 'auto' })
    expect(result).toMatchObject({ destination: 'lakehouse', table: 'ledger', rows: 1 })
  })

  it('names the kb landing directory with a sanitized provider fallback when the id is all separators', async () => {
    const { connector, kbStore } = await setup()
    const provider = new ScriptedProvider('###', [], new Map<string, ConnectorDataset>([
      ['note.md', {
        kind: 'file',
        id: 'note.md',
        title: 'note',
        manifest: manifestOf('###'),
        file: { filename: 'note.md', bytes: encoder.encode('文本内容') },
      }],
    ]))
    connector.registerProvider(provider)
    await connector.transfer({ providerId: '###', datasetId: 'note.md', tenantId: 'hongfa-food', target: 'auto' })
    expect(kbStore.documents[0]?.doc.sourcePath).toBe('workspace/data/connectors/___/note.md')
  })

  it('names no providers in the missing-provider message when the registry is empty', async () => {
    const { connector } = await setup()
    const error = await connector.fetch({ providerId: 'ghost', datasetId: 'ledger' }).then(
      () => { throw new Error('expected a refusal') },
      (thrown: unknown) => thrown,
    )
    expect(error).toBeInstanceOf(ConnectorError)
    expect((error as ConnectorError).message).toContain('registered: none')
  })

  it('fails loud when no lakehouse seam is composed to deliver a tabular landing', async () => {
    const ctx = new Context()
    await ctx.plugin(KbRuntime)
    await ctx.plugin(ConnectorRuntime)
    ctx.kb.registerStoreProvider(new FakeKbStore())
    ctx.connector.registerProvider(fullProvider())
    await expectCode(
      ctx.connector.transfer({ providerId: 'alpha', datasetId: 'ledger', tenantId: 'hongfa-food', target: 'auto' }),
      'CONNECTOR_LAKEHOUSE_MISSING',
    )
    await ctx.fiber.dispose()
  })

  it('stringifies a non-Error confirm failure in the retry guidance', async () => {
    const { connector, catalog } = await setup()
    connector.registerProvider(fullProvider())
    catalog.failTransfers = true
    catalog.failWith = 'catalog offline (string)'
    const error = await connector.transfer({ providerId: 'alpha', datasetId: 'ledger', tenantId: 'hongfa-food', target: 'auto' }).then(
      () => { throw new Error('expected a refusal') },
      (thrown: unknown) => thrown,
    )
    expect(error).toBeInstanceOf(ConnectorError)
    expect((error as ConnectorError).message).toContain('catalog offline (string)')
  })

  it('fails loud when no lakehouse seam is composed to confirm a kb landing', async () => {
    const ctx = new Context()
    await ctx.plugin(KbRuntime)
    await ctx.plugin(ConnectorRuntime)
    ctx.kb.registerStoreProvider(new FakeKbStore())
    ctx.connector.registerProvider(fullProvider())
    await expectCode(
      ctx.connector.transfer({ providerId: 'alpha', datasetId: 'briefing', tenantId: 'hongfa-food', target: 'auto' }),
      'CONNECTOR_LAKEHOUSE_MISSING',
    )
  })

  it('fails loud when no kb seam is composed for a kb-classified landing', async () => {
    const { connector } = await setup(false)
    connector.registerProvider(fullProvider())
    await expectCode(
      connector.transfer({ providerId: 'alpha', datasetId: 'briefing', tenantId: 'hongfa-food', target: 'auto' }),
      'CONNECTOR_KB_MISSING',
    )
  })

  it('reports a confirm failure after a successful landing with retry guidance', async () => {
    const { connector, catalog, kbStore } = await setup()
    connector.registerProvider(fullProvider())
    catalog.failTransfers = true
    await expectCode(
      connector.transfer({ providerId: 'alpha', datasetId: 'briefing', tenantId: 'hongfa-food', target: 'auto' }),
      'CONNECTOR_CONFIRM_FAILED',
    )
    // The landing itself succeeded; the trail is what a retry repairs.
    expect(kbStore.documents).toHaveLength(1)
    catalog.failTransfers = false
    const retried = await connector.transfer({ providerId: 'alpha', datasetId: 'briefing', tenantId: 'hongfa-food', target: 'auto' })
    expect(retried.transferRecordId).toBe(1)
    expect(kbStore.documents).toHaveLength(2)
  })
})
