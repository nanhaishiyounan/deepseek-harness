import { describe, expect, it } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import type { LakehouseTable } from '@deepseek-ai/dsh-lakehouse'
import { LakehouseError } from '@deepseek-ai/dsh-lakehouse'
import { SqliteCatalogStore } from '../src/store.ts'
import { testSql } from './test-sql.ts'

function freshStore(): SqliteCatalogStore {
  return new SqliteCatalogStore({ path: ':memory:', busyTimeoutMs: 5_000 }, DatabaseSync)
}

function table(overrides: Partial<LakehouseTable> = {}): LakehouseTable {
  return {
    tenantId: 'hongfa-food',
    tableName: 'orders',
    columns: [
      { name: 'month', sqlType: 'TEXT' },
      { name: 'tons', sqlType: 'DOUBLE' },
    ],
    format: 'parquet',
    location: 'workspace/lakehouse/hongfa-food/orders.parquet',
    rowCount: 2,
    createdAt: '2026-09-03T08:00:00.000Z',
    updatedAt: '2026-09-03T08:00:00.000Z',
    ...overrides,
  }
}

describe('SqliteCatalogStore', () => {
  it('round-trips a registration through describeTable with full metadata', async () => {
    const store = freshStore()
    const full = table({
      provenance: { provider: 'connector-nocobase', scope: 'derive', collectedSource: 'dataset:orders-2026' },
    })
    const { replaced } = await store.registerTable(full)
    expect(replaced).toBe(false)
    expect(await store.describeTable('hongfa-food', 'orders')).toEqual(full)
    store.close()
  })

  it('lists only the tenant tables ordered by table name', async () => {
    const store = freshStore()
    await store.registerTable(table({ tableName: 'zebra' }))
    await store.registerTable(table({ tableName: 'alpha', tenantId: 'peer-food' }))
    await store.registerTable(table({ tableName: 'beta' }))
    const listed = await store.listTables('hongfa-food')
    expect(listed.map(entry => entry.tableName)).toEqual(['beta', 'zebra'])
    expect(await store.listTables('ghost')).toEqual([])
    store.close()
  })

  it('replaces a prior registration with the same identity and keeps createdAt', async () => {
    const store = freshStore()
    await store.registerTable(table())
    const { replaced } = await store.registerTable(table({
      rowCount: 5,
      updatedAt: '2026-09-04T08:00:00.000Z',
    }))
    expect(replaced).toBe(true)
    const stored = await store.describeTable('hongfa-food', 'orders')
    expect(stored?.rowCount).toBe(5)
    expect(stored?.createdAt).toBe('2026-09-03T08:00:00.000Z')
    expect(stored?.updatedAt).toBe('2026-09-04T08:00:00.000Z')
    expect((await store.listTables('hongfa-food')).length).toBe(1)
    store.close()
  })

  it('drops by identity and reports the miss', async () => {
    const store = freshStore()
    await store.registerTable(table())
    expect(await store.dropTable('hongfa-food', 'orders')).toBe(true)
    expect(await store.dropTable('hongfa-food', 'orders')).toBe(false)
    expect(await store.describeTable('hongfa-food', 'orders')).toBeUndefined()
    store.close()
  })

  it('keeps tenants isolated in describes and drops', async () => {
    const store = freshStore()
    await store.registerTable(table({ tenantId: 'a', tableName: 'shared' }))
    await store.registerTable(table({ tenantId: 'b', tableName: 'shared' }))
    expect(await store.dropTable('a', 'shared')).toBe(true)
    expect((await store.describeTable('b', 'shared'))?.tenantId).toBe('b')
    store.close()
  })

  it('appends transfer records with incrementing ids', async () => {
    const store = freshStore()
    const first = await store.recordTransfer({
      source: 'connector-nocobase',
      destination: 'lakehouse',
      datasetId: 'orders-2026',
      rows: 1200,
      transferredAt: '2026-09-03T08:00:00.000Z',
    })
    const second = await store.recordTransfer({
      source: 'connector-nocobase',
      destination: 'kb',
      datasetId: 'expert-notes',
      rows: 6,
      transferredAt: '2026-09-03T09:00:00.000Z',
    })
    expect(first.transferId).toBe(1)
    expect(second.transferId).toBe(2)
    store.close()
  })

  it('lists transfer records newest first with a limit', async () => {
    const store = freshStore()
    await store.recordTransfer({
      source: 'connector-nocobase', destination: 'lakehouse', datasetId: 'orders-2026',
      rows: 1200, transferredAt: '2026-09-03T08:00:00.000Z',
    })
    await store.recordTransfer({
      source: 'connector-file', destination: 'kb', datasetId: 'expert-notes',
      rows: 6, transferredAt: '2026-09-03T09:00:00.000Z',
    })
    const trail = await store.listTransfers(10)
    expect(trail.map(entry => entry.transferId)).toEqual([2, 1])
    expect(trail[0]).toMatchObject({ source: 'connector-file', destination: 'kb', datasetId: 'expert-notes', rows: 6 })
    expect((await store.listTransfers(1)).map(entry => entry.transferId)).toEqual([2])
    expect(await store.listTransfers(0)).toEqual([])
    store.close()
  })

  it('reads back a provenance triple that carries only its provider', async () => {
    const store = freshStore()
    await store.registerTable(table({ provenance: { provider: 'upload' } }))
    const stored = await store.describeTable('hongfa-food', 'orders')
    expect(stored?.provenance).toEqual({ provider: 'upload' })
    store.close()
  })

  it('accumulates usage per tenant and reads zeros for unknown tenants', async () => {
    const store = freshStore()
    await store.recordUsage('hongfa-food', { loadedTables: 1 })
    await store.recordUsage('hongfa-food', { loadedTables: 1, lakehouseQueries: 2 })
    await store.recordUsage('peer-food', { lakehouseQueries: 1 })
    expect(await store.usage('hongfa-food')).toEqual({ loadedTables: 2, lakehouseQueries: 2 })
    expect(await store.usage('ghost')).toEqual({ loadedTables: 0, lakehouseQueries: 0 })
    store.close()
  })

  it('omits provenance when the registration carries none', async () => {
    const store = freshStore()
    await store.registerTable(table())
    const stored = await store.describeTable('hongfa-food', 'orders')
    expect(stored?.provenance).toBeUndefined()
    store.close()
  })

  it('rejects use after close and closes idempotently', async () => {
    const store = freshStore()
    store.close()
    store.close()
    expect(store.available()).toBe(false)
    await expect(store.listTables('hongfa-food')).rejects.toThrow(LakehouseError)
    await expect(store.listTables('hongfa-food')).rejects.toMatchObject({ code: 'LAKEHOUSE_CATALOG_CLOSED' })
  })

  it('reports available while open', () => {
    const store = freshStore()
    expect(store.available()).toBe(true)
    store.close()
  })

  it('rejects construction when the on-disk schema is foreign', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'dsh-catalog-foreign-'))
    const path = join(directory, 'catalog.sqlite')
    try {
      const outsider = new DatabaseSync(path)
      outsider.exec(testSql('set-user-version-2'))
      outsider.close()
      expect(() => new SqliteCatalogStore({ path, busyTimeoutMs: 5_000 }, DatabaseSync))
        .toThrow(/schema version 2.*incompatible/u)
    } finally {
      rmSync(directory, { recursive: true, force: true })
    }
  })

  it('rolls back a failed registration and keeps prior data intact', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'dsh-catalog-rollback-'))
    const path = join(directory, 'catalog.sqlite')
    const store = new SqliteCatalogStore({ path, busyTimeoutMs: 5_000 }, DatabaseSync)
    try {
      await store.registerTable(table())
      const outsider = new DatabaseSync(path)
      outsider.exec(testSql('create-failing-insert-trigger'))
      outsider.close()
      await expect(store.registerTable(table({ tableName: 'another' }))).rejects.toThrow(/injected failure/u)
      expect((await store.listTables('hongfa-food')).map(entry => entry.tableName)).toEqual(['orders'])
      expect(await store.describeTable('hongfa-food', 'another')).toBeUndefined()
    } finally {
      store.close()
      rmSync(directory, { recursive: true, force: true })
    }
  })

  it('rejects a database whose columns record is valid JSON but not an array', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'dsh-catalog-corrupt-array-'))
    const path = join(directory, 'catalog.sqlite')
    const store = new SqliteCatalogStore({ path, busyTimeoutMs: 5_000 }, DatabaseSync)
    try {
      await store.registerTable(table())
      const outsider = new DatabaseSync(path)
      outsider.prepare(testSql('corrupt-columns-array')).run()
      outsider.close()
      await expect(store.describeTable('hongfa-food', 'orders')).rejects.toMatchObject({ code: 'LAKEHOUSE_CATALOG_CORRUPT' })
    } finally {
      store.close()
      rmSync(directory, { recursive: true, force: true })
    }
  })

  it('rejects a database whose columns record holds a non-column entry', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'dsh-catalog-corrupt-entry-'))
    const path = join(directory, 'catalog.sqlite')
    const store = new SqliteCatalogStore({ path, busyTimeoutMs: 5_000 }, DatabaseSync)
    try {
      await store.registerTable(table())
      const outsider = new DatabaseSync(path)
      outsider.prepare(testSql('corrupt-columns-entry')).run()
      outsider.close()
      await expect(store.describeTable('hongfa-food', 'orders')).rejects.toMatchObject({ code: 'LAKEHOUSE_CATALOG_CORRUPT' })
    } finally {
      store.close()
      rmSync(directory, { recursive: true, force: true })
    }
  })

  it('rejects a database whose columns record is not valid JSON columns', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'dsh-catalog-corrupt-'))
    const path = join(directory, 'catalog.sqlite')
    const store = new SqliteCatalogStore({ path, busyTimeoutMs: 5_000 }, DatabaseSync)
    try {
      await store.registerTable(table())
      const outsider = new DatabaseSync(path)
      outsider.prepare(testSql('corrupt-columns')).run()
      outsider.close()
      await expect(store.describeTable('hongfa-food', 'orders')).rejects.toMatchObject({ code: 'LAKEHOUSE_CATALOG_CORRUPT' })
    } finally {
      store.close()
      rmSync(directory, { recursive: true, force: true })
    }
  })
})
