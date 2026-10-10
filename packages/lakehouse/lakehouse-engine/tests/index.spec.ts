import { describe, expect, it } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import * as EnginePlugin from '../src/index.ts'

describe('lakehouse-engine plugin', () => {
  it('registers ctx.lakehouseEngine and the engine answers queries', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-lakehouse-engine-plugin-'))
    const ctx = new Context()
    await ctx.plugin(EnginePlugin, {
      catalog: { kind: 'ducklake', catalogPath: join(root, 'catalog.ducklake'), dataPath: join(root, 'files') },
      maxRows: 50,
    })
    try {
      expect(ctx.lakehouseEngine.available()).toBe(true)
      const outcome = await ctx.lakehouseEngine.query('SELECT 41 + 1 AS answer')
      expect(outcome.rows).toEqual([[42]])
      expect(outcome.columns).toEqual([{ name: 'answer', sqlType: expect.any(String) }])
    } finally {
      await ctx.fiber.dispose()
      await rm(root, { recursive: true, force: true })
    }
  })

  it('closes the DuckDB instance with the context fiber', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-lakehouse-engine-plugin-'))
    const ctx = new Context()
    await ctx.plugin(EnginePlugin, { catalog: { kind: 'ducklake', catalogPath: join(root, 'catalog.ducklake') } })
    // The context removes the service key on dispose, so hold the reference.
    const engine = ctx.lakehouseEngine
    await ctx.fiber.dispose()
    try {
      expect(engine.available()).toBe(false)
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })
})
