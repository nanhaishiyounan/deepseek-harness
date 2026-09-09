import { describe, expect, it } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import LakehouseRuntime from '@deepseek-ai/dsh-lakehouse'
import * as CatalogPlugin from '@deepseek-ai/dsh-lakehouse-sqlite-catalog'
import * as DuckDbPlugin from '../src/index.ts'

function ordersTabular() {
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

async function setup(dataRoot: string): Promise<Context> {
  const ctx = new Context()
  await ctx.plugin(LakehouseRuntime, { dataRoot })
  await ctx.plugin(CatalogPlugin, { path: ':memory:' })
  await ctx.plugin(DuckDbPlugin)
  return ctx
}

describe('lakehouse-duckdb plugin', () => {
  it('registers a usable engine; a real load lands Parquet and a query reads it back', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-lakehouse-plugin-'))
    const ctx = await setup(join(root, 'data'))
    try {
      const result = await ctx.lakehouse.load({ tenantId: 'hongfa-food', tableName: 'orders', tabular: ordersTabular() })
      expect(result.replaced).toBe(false)
      expect(result.table.location).toBe(`${join(root, 'data')}/hongfa-food/orders.parquet`)
      const query = await ctx.lakehouse.query('hongfa-food', 'SELECT month, tons FROM orders ORDER BY month')
      expect(query.rows).toEqual([
        ['2026-07', 12.5],
        ['2026-08', 15.25],
      ])
      expect(query.truncated).toBe(false)
      expect(await ctx.lakehouse.stats('hongfa-food')).toEqual({ tables: 1, engineAvailable: true, engineId: 'lakehouse-duckdb' })
      expect(await ctx.lakehouse.usage('hongfa-food')).toEqual({ loadedTables: 1, lakehouseQueries: 1 })
    } finally {
      await ctx.fiber.dispose()
      await rm(root, { recursive: true, force: true })
    }
  })

  it('keeps tenants isolated end to end with a real engine', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-lakehouse-plugin-'))
    const ctx = await setup(join(root, 'data'))
    try {
      await ctx.lakehouse.load({ tenantId: 'a', tableName: 'shared', tabular: ordersTabular() })
      await expect(ctx.lakehouse.query('b', 'SELECT * FROM shared')).rejects.toMatchObject({ code: 'LAKEHOUSE_QUERY_FAILED' })
      expect(await ctx.lakehouse.listTables('b')).toEqual([])
    } finally {
      await ctx.fiber.dispose()
      await rm(root, { recursive: true, force: true })
    }
  })

  it('unregisters the engine when the plugin is disposed, degrading to fail-loud queries', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-lakehouse-plugin-'))
    const ctx = new Context()
    await ctx.plugin(LakehouseRuntime, { dataRoot: join(root, 'data') })
    await ctx.plugin(CatalogPlugin, { path: ':memory:' })
    const fiber = ctx.plugin(DuckDbPlugin)
    await fiber
    try {
      await fiber.dispose()
      await expect(ctx.lakehouse.query('a', 'SELECT 1')).rejects.toMatchObject({ code: 'LAKEHOUSE_ENGINE_UNAVAILABLE' })
      await expect(ctx.lakehouse.listTables('a')).resolves.toEqual([])
    } finally {
      await ctx.fiber.dispose()
      await rm(root, { recursive: true, force: true })
    }
  })

  it('applies configured engine options at load', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-lakehouse-plugin-'))
    const ctx = new Context()
    await ctx.plugin(LakehouseRuntime, { dataRoot: join(root, 'data') })
    await ctx.plugin(CatalogPlugin, { path: ':memory:' })
    await ctx.plugin(DuckDbPlugin, { memoryLimitMb: 256, threads: 1 })
    try {
      await ctx.lakehouse.load({ tenantId: 'a', tableName: 'orders', tabular: ordersTabular() })
      const query = await ctx.lakehouse.query('a', "SELECT current_setting('threads') AS threads FROM orders")
      expect(query.rows[0]?.[0]).toBe(1)
    } finally {
      await ctx.fiber.dispose()
      await rm(root, { recursive: true, force: true })
    }
  })

  it('reloads a table as a replacement and the old rows stop matching', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-lakehouse-plugin-'))
    const ctx = await setup(join(root, 'data'))
    try {
      await ctx.lakehouse.load({ tenantId: 'a', tableName: 'orders', tabular: ordersTabular() })
      const second = await ctx.lakehouse.load({
        tenantId: 'a',
        tableName: 'orders',
        tabular: { columns: [{ name: 'x', sqlType: 'INTEGER' }], rows: [[7]] },
      })
      expect(second.replaced).toBe(true)
      const query = await ctx.lakehouse.query('a', 'SELECT x FROM orders')
      expect(query.rows).toEqual([[7]])
      expect(await ctx.lakehouse.dropTable('a', 'orders')).toBe(true)
      await expect(ctx.lakehouse.query('a', 'SELECT x FROM orders')).rejects.toMatchObject({ code: 'LAKEHOUSE_QUERY_FAILED' })
    } finally {
      await ctx.fiber.dispose()
      await rm(root, { recursive: true, force: true })
    }
  })
})
