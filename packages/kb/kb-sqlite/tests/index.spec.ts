import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import KbRuntime from '@deepseek-ai/dsh-kb'
import { DEFAULT_BUSY_TIMEOUT_MS } from '../src/index.ts'
import * as KbSqlite from '../src/index.ts'

async function setup(path: string = ':memory:'): Promise<Context> {
  const ctx = new Context()
  await ctx.plugin(KbRuntime)
  await ctx.plugin(KbSqlite, { path })
  return ctx
}

describe('kb-sqlite plugin', () => {
  it('registers a usable store on ctx.kb and round-trips a document', async () => {
    const ctx = await setup()
    const result = await ctx.kb.ingest({
      tenantId: 'hongfa-food',
      sourcePath: 'notes/visit.md',
      docKind: 'meeting',
      content: '# 走访\n\n白糖价格上行。',
    })
    expect(result.chunks).toBeGreaterThan(0)
    const search = await ctx.kb.search({ query: '白糖价格', tenantId: 'hongfa-food' })
    expect(search.mode).toBe('text')
    expect(search.results[0]?.sourcePath).toBe('notes/visit.md')
    const stats = await ctx.kb.stats('hongfa-food')
    expect(stats.documents).toBe(1)
  })

  it('unregisters the store when the plugin is disposed', async () => {
    const ctx = new Context()
    await ctx.plugin(KbRuntime)
    const fiber = ctx.plugin(KbSqlite, { path: ':memory:' })
    await fiber
    await ctx.kb.stats()
    await fiber.dispose()
    await expect(ctx.kb.stats()).rejects.toThrow(/no usable knowledge-base store/i)
  })

  it('exposes the documented default busy timeout', () => {
    expect(DEFAULT_BUSY_TIMEOUT_MS).toBe(5_000)
  })

  it('accepts an explicit busy timeout', async () => {
    const ctx = new Context()
    await ctx.plugin(KbRuntime)
    await ctx.plugin(KbSqlite, { path: ':memory:', busyTimeoutMs: 250 })
    await ctx.kb.stats()
  })

  it('fails composition when the configured path cannot be opened', async () => {
    const ctx = new Context()
    await ctx.plugin(KbRuntime)
    await expect(ctx.plugin(KbSqlite, { path: '/nonexistent-root-dir/kb.sqlite' })).rejects.toThrow()
  })

  it('applies the documented default busy timeout when called directly without one', async () => {
    const ctx = new Context()
    await ctx.plugin(KbRuntime)
    const { apply } = await import('../src/index.ts')
    await apply(ctx, { path: ':memory:' })
    await ctx.kb.stats()
  })
})
