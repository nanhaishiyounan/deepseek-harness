import { describe, expect, it } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import LakehouseRuntime from '../src/index.ts'
import { LakehouseError } from '../src/index.ts'
import { MemoryCatalogStore, MemoryQueryProvider } from './memory.ts'

function ordersTabular(): { columns: readonly { name: string; sqlType: string }[]; rows: readonly (readonly unknown[])[] } {
  return {
    columns: [
      { name: 'month', sqlType: 'TEXT' },
      { name: 'tons', sqlType: 'DOUBLE' },
    ],
    rows: [
      ['2026-07', 12.5],
      ['2026-08', 15.25],
    ],
  }
}

interface Setup {
  ctx: Context
  catalog: MemoryCatalogStore
  engine: MemoryQueryProvider
}

async function setup(config?: Record<string, unknown>): Promise<Setup> {
  const ctx = new Context()
  await ctx.plugin(LakehouseRuntime, config)
  const catalog = new MemoryCatalogStore()
  const engine = new MemoryQueryProvider()
  ctx.lakehouse.registerCatalogStore(catalog)
  ctx.lakehouse.registerQueryProvider(engine)
  return { ctx, catalog, engine }
}

function expectCode(promise: Promise<unknown>, code: string): Promise<void> {
  return promise.then(
    () => { throw new Error(`expected rejection with ${code}`) },
    (error: unknown) => {
      expect(error).toBeInstanceOf(LakehouseError)
      expect((error as LakehouseError).code).toBe(code)
    },
  )
}

describe('LakehouseRuntime provider selection', () => {
  it('fails loud with no registered catalog', async () => {
    const ctx = new Context()
    await ctx.plugin(LakehouseRuntime)
    await expectCode(ctx.lakehouse.listTables('hongfa-food'), 'LAKEHOUSE_CATALOG_UNAVAILABLE')
  })

  it('rejects a configured catalog id that is not registered', async () => {
    const ctx = new Context()
    await ctx.plugin(LakehouseRuntime, { catalogStore: 'ghost-catalog' })
    await expectCode(ctx.lakehouse.listTables('hongfa-food'), 'LAKEHOUSE_CATALOG_CONFIGURED_MISSING')
  })

  it('rejects a configured catalog id that is registered but unavailable', async () => {
    const ctx = new Context()
    await ctx.plugin(LakehouseRuntime, { catalogStore: 'memory-catalog' })
    const dead = new MemoryCatalogStore()
    dead.closed = true
    ctx.lakehouse.registerCatalogStore(dead)
    await expectCode(ctx.lakehouse.listTables('hongfa-food'), 'LAKEHOUSE_CATALOG_CONFIGURED_UNAVAILABLE')
  })

  it('rejects ambiguous catalogs when several are usable and none is configured', async () => {
    const ctx = new Context()
    await ctx.plugin(LakehouseRuntime)
    ctx.lakehouse.registerCatalogStore(new MemoryCatalogStore('catalog-a'))
    ctx.lakehouse.registerCatalogStore(new MemoryCatalogStore('catalog-b'))
    await expectCode(ctx.lakehouse.listTables('hongfa-food'), 'LAKEHOUSE_CATALOG_AMBIGUOUS')
  })

  it('picks the configured catalog when it is usable', async () => {
    const ctx = new Context()
    await ctx.plugin(LakehouseRuntime, { catalogStore: 'catalog-b' })
    const catalogA = new MemoryCatalogStore('catalog-a')
    const catalogB = new MemoryCatalogStore('catalog-b')
    ctx.lakehouse.registerCatalogStore(catalogA)
    ctx.lakehouse.registerCatalogStore(catalogB)
    ctx.lakehouse.registerQueryProvider(new MemoryQueryProvider())
    await ctx.lakehouse.load({ tenantId: 'hongfa-food', tableName: 'orders', tabular: ordersTabular() })
    expect(catalogA.tables.size).toBe(0)
    expect(catalogB.tables.size).toBe(1)
  })

  it('fails loud with no usable query engine while listTables keeps working', async () => {
    const ctx = new Context()
    await ctx.plugin(LakehouseRuntime)
    const catalog = new MemoryCatalogStore()
    ctx.lakehouse.registerCatalogStore(catalog)
    await expectCode(ctx.lakehouse.query('hongfa-food', 'SELECT 1'), 'LAKEHOUSE_ENGINE_UNAVAILABLE')
    await expectCode(ctx.lakehouse.load({ tenantId: 'hongfa-food', tableName: 'orders', tabular: ordersTabular() }), 'LAKEHOUSE_ENGINE_UNAVAILABLE')
    await expect(ctx.lakehouse.listTables('hongfa-food')).resolves.toEqual([])
  })

  it('rejects a configured engine id that is not registered', async () => {
    const ctx = new Context()
    await ctx.plugin(LakehouseRuntime, { queryProvider: 'ghost-engine' })
    ctx.lakehouse.registerCatalogStore(new MemoryCatalogStore())
    ctx.lakehouse.registerQueryProvider(new MemoryQueryProvider())
    await expectCode(ctx.lakehouse.query('hongfa-food', 'SELECT 1'), 'LAKEHOUSE_ENGINE_CONFIGURED_MISSING')
  })

  it('rejects a configured engine id that is registered but unavailable', async () => {
    const ctx = new Context()
    await ctx.plugin(LakehouseRuntime, { queryProvider: 'memory-engine' })
    ctx.lakehouse.registerCatalogStore(new MemoryCatalogStore())
    ctx.lakehouse.registerQueryProvider(new MemoryQueryProvider('memory-engine', false))
    await expectCode(ctx.lakehouse.query('hongfa-food', 'SELECT 1'), 'LAKEHOUSE_ENGINE_CONFIGURED_UNAVAILABLE')
  })

  it('rejects ambiguous engines when several are usable and none is configured', async () => {
    const ctx = new Context()
    await ctx.plugin(LakehouseRuntime)
    ctx.lakehouse.registerCatalogStore(new MemoryCatalogStore())
    ctx.lakehouse.registerQueryProvider(new MemoryQueryProvider('engine-a'))
    ctx.lakehouse.registerQueryProvider(new MemoryQueryProvider('engine-b'))
    await expectCode(ctx.lakehouse.query('hongfa-food', 'SELECT 1'), 'LAKEHOUSE_ENGINE_AMBIGUOUS')
  })

  it('rejects a duplicate provider id per registry', async () => {
    const ctx = new Context()
    await ctx.plugin(LakehouseRuntime)
    ctx.lakehouse.registerCatalogStore(new MemoryCatalogStore('dup'))
    expect(() => ctx.lakehouse.registerCatalogStore(new MemoryCatalogStore('dup')))
      .toThrow(LakehouseError)
    ctx.lakehouse.registerQueryProvider(new MemoryQueryProvider('dup'))
    try {
      ctx.lakehouse.registerQueryProvider(new MemoryQueryProvider('dup'))
      throw new Error('expected rejection')
    } catch (error) {
      expect(error).toBeInstanceOf(LakehouseError)
      expect((error as LakehouseError).code).toBe('LAKEHOUSE_DUPLICATE_PROVIDER')
    }
  })

  it('unregisters providers through the returned disposer', async () => {
    const ctx = new Context()
    await ctx.plugin(LakehouseRuntime)
    const dispose = ctx.lakehouse.registerCatalogStore(new MemoryCatalogStore())
    await ctx.lakehouse.listTables('hongfa-food')
    dispose()
    await expectCode(ctx.lakehouse.listTables('hongfa-food'), 'LAKEHOUSE_CATALOG_UNAVAILABLE')
  })
})

describe('LakehouseRuntime load', () => {
  it('writes parquet under the data root and registers the table in the catalog', async () => {
    const { ctx, catalog, engine } = await setup()
    const result = await ctx.lakehouse.load({ tenantId: 'hongfa-food', tableName: 'orders', tabular: ordersTabular() })
    expect(result.replaced).toBe(false)
    expect(result.table).toMatchObject({
      tenantId: 'hongfa-food',
      tableName: 'orders',
      format: 'parquet',
      rowCount: 2,
      location: 'workspace/lakehouse/hongfa-food/orders.parquet',
    })
    expect(result.table.columns).toEqual(ordersTabular().columns)
    expect(engine.parquetWrites).toHaveLength(1)
    expect(engine.parquetWrites[0]?.location.endsWith('workspace/lakehouse/hongfa-food/orders.parquet')).toBe(true)
    expect(catalog.tables.size).toBe(1)
    const usage = await ctx.lakehouse.usage('hongfa-food')
    expect(usage.loadedTables).toBe(1)
    expect(usage.lakehouseQueries).toBe(0)
  })

  it('honors a configured data root', async () => {
    const { ctx, engine } = await setup({ dataRoot: 'lake-data' })
    const result = await ctx.lakehouse.load({ tenantId: 'hongfa-food', tableName: 'orders', tabular: ordersTabular() })
    expect(result.table.location).toBe('lake-data/hongfa-food/orders.parquet')
    expect(engine.parquetWrites[0]?.location.endsWith('lake-data/hongfa-food/orders.parquet')).toBe(true)
  })

  it('replaces a table when the tenant and table identity repeats', async () => {
    const { ctx, catalog } = await setup()
    await ctx.lakehouse.load({ tenantId: 'hongfa-food', tableName: 'orders', tabular: ordersTabular() })
    const second = await ctx.lakehouse.load({
      tenantId: 'hongfa-food',
      tableName: 'orders',
      tabular: { columns: [{ name: 'x', sqlType: 'INTEGER' }], rows: [[1]] },
    })
    expect(second.replaced).toBe(true)
    expect(catalog.tables.size).toBe(1)
    const [table] = await ctx.lakehouse.listTables('hongfa-food')
    expect(table?.rowCount).toBe(1)
    expect(table?.columns).toEqual([{ name: 'x', sqlType: 'INTEGER' }])
  })

  it('rejects a table name that is not a plain SQL identifier', async () => {
    const { ctx } = await setup()
    await expectCode(
      ctx.lakehouse.load({ tenantId: 'hongfa-food', tableName: 'drop table x', tabular: ordersTabular() }),
      'LAKEHOUSE_INVALID_TABLE_NAME',
    )
    await expectCode(
      ctx.lakehouse.load({ tenantId: 'hongfa-food', tableName: '../escape', tabular: ordersTabular() }),
      'LAKEHOUSE_INVALID_TABLE_NAME',
    )
  })

  it('rejects a tenant id that could traverse the data root', async () => {
    const { ctx } = await setup()
    await expectCode(
      ctx.lakehouse.load({ tenantId: '../other', tableName: 'orders', tabular: ordersTabular() }),
      'LAKEHOUSE_INVALID_TENANT',
    )
  })

  it('carries provenance onto the registered table', async () => {
    const { ctx } = await setup()
    const result = await ctx.lakehouse.load({
      tenantId: 'hongfa-food',
      tableName: 'orders',
      tabular: ordersTabular(),
      provenance: { provider: 'connector-nocobase', scope: 'derive', collectedSource: 'dataset:orders-2026' },
    })
    expect(result.table.provenance).toEqual({
      provider: 'connector-nocobase',
      scope: 'derive',
      collectedSource: 'dataset:orders-2026',
    })
  })

  it('swallows a usage-recording failure after a successful load', async () => {
    const { ctx, catalog } = await setup()
    catalog.usageFailures = true
    const result = await ctx.lakehouse.load({ tenantId: 'hongfa-food', tableName: 'orders', tabular: ordersTabular() })
    expect(result.replaced).toBe(false)
  })

  it('rejects an aborted signal before any provider work', async () => {
    const { ctx } = await setup()
    const controller = new AbortController()
    controller.abort(new Error('cancelled'))
    await expect(ctx.lakehouse.load({ tenantId: 'hongfa-food', tableName: 'orders', tabular: ordersTabular() }, controller.signal))
      .rejects.toThrow(/cancelled/)
  })
})

describe('LakehouseRuntime query', () => {
  it('hands the tenant tables and the effective maxRows to the engine', async () => {
    const { ctx, engine } = await setup()
    await ctx.lakehouse.load({ tenantId: 'hongfa-food', tableName: 'orders', tabular: ordersTabular() })
    engine.replayColumns = [{ name: 'tons', sqlType: 'DOUBLE' }]
    engine.replayRows = [[12.5], [15.25]]
    const result = await ctx.lakehouse.query('hongfa-food', 'SELECT sum(tons) FROM orders')
    expect(result.truncated).toBe(false)
    expect(result.rows).toEqual([[12.5], [15.25]])
    const call = engine.queries[0]
    expect(call?.sql).toBe('SELECT sum(tons) FROM orders')
    const [ref] = call?.tables ?? []
    expect(ref?.tableName).toBe('orders')
    expect(ref?.format).toBe('parquet')
    expect(ref?.location.endsWith('workspace/lakehouse/hongfa-food/orders.parquet')).toBe(true)
    expect(call?.maxRows).toBe(200)
    expect(await ctx.lakehouse.usage('hongfa-food')).toMatchObject({ lakehouseQueries: 1 })
  })

  it('meters a query only after it succeeds', async () => {
    const { ctx, engine } = await setup()
    engine.failQueries = true
    await expect(ctx.lakehouse.query('hongfa-food', 'SELECT 1')).rejects.toThrow(/engine offline/)
    expect(await ctx.lakehouse.usage('hongfa-food')).toMatchObject({ lakehouseQueries: 0 })
  })

  it('honors a configured maxRows and reports truncation', async () => {
    const { ctx, engine } = await setup({ maxRows: 2 })
    await ctx.lakehouse.load({ tenantId: 'hongfa-food', tableName: 'orders', tabular: ordersTabular() })
    engine.replayColumns = [{ name: 'n', sqlType: 'INTEGER' }]
    engine.replayRows = [[1], [2], [3]]
    const result = await ctx.lakehouse.query('hongfa-food', 'SELECT n FROM orders')
    expect(result.truncated).toBe(true)
    expect(result.rows).toEqual([[1], [2]])
    expect(engine.queries[0]?.maxRows).toBe(2)
  })

  it('exposes only the querying tenant tables to the engine', async () => {
    const { ctx, engine } = await setup()
    await ctx.lakehouse.load({ tenantId: 'hongfa-food', tableName: 'orders', tabular: ordersTabular() })
    await ctx.lakehouse.load({ tenantId: 'peer-food', tableName: 'secret', tabular: ordersTabular() })
    await ctx.lakehouse.query('peer-food', 'SELECT 1')
    expect(engine.queries[0]?.tables.map(table => table.tableName)).toEqual(['secret'])
    expect(engine.queries[0]?.tables.every(table => !table.location.includes('hongfa-food'))).toBe(true)
  })

  it('rejects an aborted signal before any provider work', async () => {
    const { ctx } = await setup()
    const controller = new AbortController()
    controller.abort(new Error('cancelled'))
    await expect(ctx.lakehouse.query('hongfa-food', 'SELECT 1', controller.signal)).rejects.toThrow(/cancelled/)
  })
})

describe('LakehouseRuntime catalog surface', () => {
  it('appends a connector transfer record through the resolved catalog', async () => {
    const { ctx, catalog } = await setup()
    const { transferId } = await ctx.lakehouse.recordTransfer({
      source: 'connector-file',
      destination: 'lakehouse',
      datasetId: 'orders.csv',
      rows: 3,
      transferredAt: '2026-09-04T00:00:00.000Z',
    })
    expect(transferId).toBe(1)
    expect(catalog.transfers[0]).toMatchObject({ source: 'connector-file', destination: 'lakehouse', datasetId: 'orders.csv', rows: 3 })
  })

  it('lists the transfer trail newest first and caps the read', async () => {
    const { ctx } = await setup()
    await ctx.lakehouse.recordTransfer({
      source: 'connector-file', destination: 'lakehouse', datasetId: 'orders.csv',
      rows: 3, transferredAt: '2026-09-04T00:00:00.000Z',
    })
    await ctx.lakehouse.recordTransfer({
      source: 'connector-nocobase', destination: 'kb', datasetId: 'experts/1',
      rows: 1, transferredAt: '2026-09-05T00:00:00.000Z',
    })
    const trail = await ctx.lakehouse.listTransfers(10)
    expect(trail.map(entry => entry.transferId)).toEqual([2, 1])
    expect(trail[0]).toMatchObject({ source: 'connector-nocobase', destination: 'kb', datasetId: 'experts/1' })
    expect((await ctx.lakehouse.listTransfers(1)).map(entry => entry.transferId)).toEqual([2])
  })

  it('lists and drops tables through the catalog', async () => {
    const { ctx } = await setup()
    await ctx.lakehouse.load({ tenantId: 'hongfa-food', tableName: 'orders', tabular: ordersTabular() })
    await ctx.lakehouse.load({ tenantId: 'peer-food', tableName: 'secret', tabular: ordersTabular() })
    const listed = await ctx.lakehouse.listTables('hongfa-food')
    expect(listed.map(table => table.tableName)).toEqual(['orders'])
    expect(await ctx.lakehouse.dropTable('hongfa-food', 'orders')).toBe(true)
    expect(await ctx.lakehouse.listTables('hongfa-food')).toEqual([])
    expect(await ctx.lakehouse.dropTable('hongfa-food', 'orders')).toBe(false)
    expect((await ctx.lakehouse.listTables('peer-food')).map(table => table.tableName)).toEqual(['secret'])
  })

  it('reports stats with engine observability', async () => {
    const { ctx } = await setup()
    await ctx.lakehouse.load({ tenantId: 'hongfa-food', tableName: 'orders', tabular: ordersTabular() })
    const stats = await ctx.lakehouse.stats('hongfa-food')
    expect(stats).toEqual({ tables: 1, engineAvailable: true, engineId: 'memory-engine' })
  })

  it('reports stats without throwing when no engine is usable', async () => {
    const ctx = new Context()
    await ctx.plugin(LakehouseRuntime)
    ctx.lakehouse.registerCatalogStore(new MemoryCatalogStore())
    const stats = await ctx.lakehouse.stats('hongfa-food')
    expect(stats).toEqual({ tables: 0, engineAvailable: false })
  })
})

describe('LakehouseRuntime defaults and defensive branches', () => {
  it('applies the documented defaults when constructed without config', async () => {
    const ctx = new Context()
    const runtime = new LakehouseRuntime(ctx)
    const engine = new MemoryQueryProvider()
    runtime.registerCatalogStore(new MemoryCatalogStore())
    runtime.registerQueryProvider(engine)
    const result = await runtime.load({ tenantId: 'hongfa-food', tableName: 'orders', tabular: ordersTabular() })
    expect(result.table.location).toBe('workspace/lakehouse/hongfa-food/orders.parquet')
    await runtime.query('hongfa-food', 'SELECT tons FROM orders')
    expect(engine.queries[0]?.maxRows).toBe(200)
  })

  it('picks the configured engine when it is usable', async () => {
    const ctx = new Context()
    await ctx.plugin(LakehouseRuntime, { queryProvider: 'engine-b' })
    ctx.lakehouse.registerCatalogStore(new MemoryCatalogStore())
    const engineA = new MemoryQueryProvider('engine-a')
    const engineB = new MemoryQueryProvider('engine-b')
    ctx.lakehouse.registerQueryProvider(engineA)
    ctx.lakehouse.registerQueryProvider(engineB)
    await ctx.lakehouse.load({ tenantId: 'hongfa-food', tableName: 'orders', tabular: ordersTabular() })
    await ctx.lakehouse.query('hongfa-food', 'SELECT tons FROM orders')
    expect(engineA.queries).toHaveLength(0)
    expect(engineB.queries).toHaveLength(1)
    expect(await ctx.lakehouse.stats('hongfa-food')).toMatchObject({ engineAvailable: true, engineId: 'engine-b' })
  })

  it('returns false when the catalog reports a drop miss', async () => {
    const { ctx, catalog } = await setup()
    await ctx.lakehouse.load({ tenantId: 'hongfa-food', tableName: 'orders', tabular: ordersTabular() })
    catalog.dropReports = false
    expect(await ctx.lakehouse.dropTable('hongfa-food', 'orders')).toBe(false)
    expect((await ctx.lakehouse.listTables('hongfa-food')).length).toBe(1)
  })

  it('keeps dropping when the data file cannot be deleted', async () => {
    const { ctx, catalog } = await setup()
    const directory = mkdtempSync(join(tmpdir(), 'dsh-lakehouse-undeletable-'))
    try {
      const now = new Date().toISOString()
      await catalog.registerTable({
        tenantId: 'hongfa-food',
        tableName: 'orders',
        columns: [{ name: 'month', sqlType: 'TEXT' }],
        format: 'parquet',
        location: directory,
        rowCount: 1,
        createdAt: now,
        updatedAt: now,
      })
      expect(await ctx.lakehouse.dropTable('hongfa-food', 'orders')).toBe(true)
      expect(await ctx.lakehouse.listTables('hongfa-food')).toEqual([])
    } finally {
      rmSync(directory, { recursive: true, force: true })
    }
  })
})
