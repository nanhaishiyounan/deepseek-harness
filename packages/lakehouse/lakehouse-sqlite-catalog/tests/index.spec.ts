import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import LakehouseRuntime from '@deepseek-ai/dsh-lakehouse'
import { DEFAULT_BUSY_TIMEOUT_MS } from '../src/index.ts'
import * as CatalogPlugin from '../src/index.ts'

async function setup(path: string = ':memory:'): Promise<Context> {
  const ctx = new Context()
  await ctx.plugin(LakehouseRuntime)
  await ctx.plugin(CatalogPlugin, { path })
  return ctx
}

describe('lakehouse-sqlite-catalog plugin', () => {
  it('registers a usable catalog on ctx.lakehouse; the catalog answers without an engine', async () => {
    const ctx = await setup()
    await expect(ctx.lakehouse.listTables('hongfa-food')).resolves.toEqual([])
    expect(await ctx.lakehouse.usage('hongfa-food')).toEqual({ loadedTables: 0, lakehouseQueries: 0 })
    expect(await ctx.lakehouse.stats('hongfa-food')).toEqual({ tables: 0, engineAvailable: false })
  })

  it('unregisters the catalog when the plugin is disposed', async () => {
    const ctx = new Context()
    await ctx.plugin(LakehouseRuntime)
    const fiber = ctx.plugin(CatalogPlugin, { path: ':memory:' })
    await fiber
    await ctx.lakehouse.listTables('hongfa-food')
    await fiber.dispose()
    await expect(ctx.lakehouse.listTables('hongfa-food')).rejects.toThrow(/no usable lakehouse catalog/i)
  })

  it('exposes the documented default busy timeout', () => {
    expect(DEFAULT_BUSY_TIMEOUT_MS).toBe(5_000)
  })

  it('accepts an explicit busy timeout', async () => {
    const ctx = new Context()
    await ctx.plugin(LakehouseRuntime)
    await ctx.plugin(CatalogPlugin, { path: ':memory:', busyTimeoutMs: 250 })
    await ctx.lakehouse.listTables('hongfa-food')
  })

  it('fails composition when the configured path cannot be opened', async () => {
    const ctx = new Context()
    await ctx.plugin(LakehouseRuntime)
    await expect(ctx.plugin(CatalogPlugin, { path: '/nonexistent-root-dir/catalog.sqlite' })).rejects.toThrow()
  })

  it('applies the documented default busy timeout when called directly without one', async () => {
    const ctx = new Context()
    await ctx.plugin(LakehouseRuntime)
    const { apply } = await import('../src/index.ts')
    await apply(ctx, { path: ':memory:' })
    await ctx.lakehouse.listTables('hongfa-food')
  })
})
