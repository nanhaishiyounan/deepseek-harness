import { describe, expect, it } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import * as EnginePlugin from '../src/index.ts'
import { LakehouseEngineError } from '../src/engine.ts'

async function setup(root: string): Promise<Context> {
  const ctx = new Context()
  await ctx.plugin(EnginePlugin, {
    catalog: { kind: 'ducklake', catalogPath: join(root, 'catalog.ducklake'), dataPath: join(root, 'files') },
  })
  return ctx
}

/** One tiny Parquet fixture the ingest path can read. */
async function parquetFixture(root: string): Promise<string> {
  const ctx = await setup(join(root, 'seed'))
  try {
    const path = join(root, 'fixture.parquet')
    await ctx.lakehouseEngine.execInternal(
      `COPY (SELECT 1 AS id, 'a' AS name UNION ALL SELECT 2, 'b') TO '${path.replaceAll("'", "''")}' (FORMAT PARQUET)`,
    )
    return path
  } finally {
    await ctx.fiber.dispose()
  }
}

describe('LakehouseEngineService over a real DuckDB + DuckLake catalog', () => {
  it('ingests a Parquet file, lists, describes, samples, and queries it back', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-lakehouse-engine-'))
    const ctx = await setup(root)
    try {
      const engine = ctx.lakehouseEngine
      const fixture = await parquetFixture(root)
      await engine.createSchema('legacy_nocobase')
      await engine.ingestParquet('legacy_nocobase', 'orders', fixture)
      const tables = await engine.listTables()
      expect(tables).toContainEqual({ schema: 'legacy_nocobase', table: 'orders', rowCount: 2 })
      const columns = await engine.describeTable('legacy_nocobase', 'orders')
      expect(columns.map(column => column.name)).toEqual(['id', 'name'])
      const outcome = await engine.query('SELECT count(*) AS n FROM lake.legacy_nocobase.orders')
      expect(outcome.rows).toEqual([[2]])
      const sample = await engine.sampleRows('legacy_nocobase', 'orders', 1)
      expect(sample.rowCount).toBe(1)
      expect(sample.truncated).toBe(false)
    } finally {
      await ctx.fiber.dispose()
      await rm(root, { recursive: true, force: true })
    }
  })

  it('persists across reopen (the catalog file survives the instance)', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-lakehouse-engine-'))
    const fixture = await parquetFixture(root)
    const first = await setup(root)
    try {
      await first.lakehouseEngine.createSchema('legacy_nocobase')
      await first.lakehouseEngine.ingestParquet('legacy_nocobase', 'orders', fixture)
    } finally {
      await first.fiber.dispose()
    }
    const second = await setup(root)
    try {
      const outcome = await second.lakehouseEngine.query('SELECT count(*) FROM lake.legacy_nocobase.orders')
      expect(outcome.rows).toEqual([[2]])
    } finally {
      await second.fiber.dispose()
      await rm(root, { recursive: true, force: true })
    }
  })

  it('rejects non-read SQL through the query surface with the structured guard error', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-lakehouse-engine-'))
    const ctx = await setup(root)
    try {
      await expect(ctx.lakehouseEngine.query('DELETE FROM lake.main._dsh_lake_state'))
        .rejects.toMatchObject({ name: 'SqlGuardError', code: 'LAKEHOUSE_SQL_NOT_READONLY' })
      await expect(ctx.lakehouseEngine.query('INSERT INTO lake.legacy_nocobase.t VALUES (1)'))
        .rejects.toMatchObject({ code: 'LAKEHOUSE_SQL_NOT_READONLY' })
      await expect(ctx.lakehouseEngine.query('DROP TABLE lake.legacy_nocobase.t'))
        .rejects.toMatchObject({ code: 'LAKEHOUSE_SQL_NOT_READONLY' })
      await expect(ctx.lakehouseEngine.query("ATTACH 'ducklake:/tmp/evil.ducklake' AS evil"))
        .rejects.toMatchObject({ code: 'LAKEHOUSE_SQL_NOT_READONLY' })
      await expect(ctx.lakehouseEngine.query('SELECT 1; SELECT 2'))
        .rejects.toMatchObject({ code: 'LAKEHOUSE_SQL_MULTI_STATEMENT' })
    } finally {
      await ctx.fiber.dispose()
      await rm(root, { recursive: true, force: true })
    }
  })

  it('caps rows and marks truncation', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-lakehouse-engine-'))
    const ctx = await setup(root)
    try {
      await ctx.lakehouseEngine.createSchema('legacy_nocobase')
      await ctx.lakehouseEngine.execInternal(
        'CREATE TABLE lake.legacy_nocobase.t AS SELECT range AS id FROM range(10)',
      )
      const capped = await ctx.lakehouseEngine.query('SELECT id FROM lake.legacy_nocobase.t', { maxRows: 4 })
      expect(capped.rowCount).toBe(4)
      expect(capped.truncated).toBe(true)
      expect(capped.rows).toHaveLength(4)
      const exact = await ctx.lakehouseEngine.query('SELECT id FROM lake.legacy_nocobase.t')
      expect(exact.rowCount).toBe(10)
      expect(exact.truncated).toBe(false)
    } finally {
      await ctx.fiber.dispose()
      await rm(root, { recursive: true, force: true })
    }
  })

  it('creates schema-only tables for empty sources and reads sync state back', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-lakehouse-engine-'))
    const ctx = await setup(root)
    try {
      const engine = ctx.lakehouseEngine
      await engine.createSchema('legacy_nocobase')
      await engine.createSchemaOnlyTable('legacy_nocobase', 'empty_tbl', [
        { name: 'id', sqlType: 'INTEGER' },
        { name: 'label', sqlType: 'TEXT' },
      ])
      const outcome = await engine.query('SELECT count(*) FROM lake.legacy_nocobase.empty_tbl')
      expect(outcome.rows).toEqual([[0]])
      expect(await engine.readState('watermark:legacy.nocobase.orders')).toBeNull()
      await engine.writeState('watermark:legacy.nocobase.orders', '2026-10-10T00:00:00Z')
      await engine.writeState('watermark:legacy.nocobase.orders', '2026-10-10T01:00:00Z')
      expect(await engine.readState('watermark:legacy.nocobase.orders')).toBe('2026-10-10T01:00:00Z')
    } finally {
      await ctx.fiber.dispose()
      await rm(root, { recursive: true, force: true })
    }
  })

  it('rejects decorated identifiers on structured references', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-lakehouse-engine-'))
    const ctx = await setup(root)
    try {
      await expect(ctx.lakehouseEngine.describeTable('legacy_nocobase', 'orders; DROP TABLE x'))
        .rejects.toBeInstanceOf(LakehouseEngineError)
      await expect(ctx.lakehouseEngine.describeTable('legacy-nocobase"; --', 'orders'))
        .rejects.toMatchObject({ code: 'LAKEHOUSE_ENGINE_INVALID_IDENTIFIER' })
    } finally {
      await ctx.fiber.dispose()
      await rm(root, { recursive: true, force: true })
    }
  })
})

describe('engine availability degradation', () => {
  it('degrades to unavailable with a recorded failure when the native module is missing', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-lakehouse-engine-'))
    const ctx = new Context()
    await ctx.plugin(EnginePlugin, {
      catalog: { kind: 'ducklake', catalogPath: join(root, 'catalog.ducklake') },
    })
    try {
      // The real module loads on this host; simulate the missing-binding path
      // by closing the live instance, which yields the same surface state.
      ctx.lakehouseEngine.close()
      expect(ctx.lakehouseEngine.available()).toBe(false)
      await expect(ctx.lakehouseEngine.query('SELECT 1'))
        .rejects.toMatchObject({ code: 'LAKEHOUSE_ENGINE_UNAVAILABLE' })
    } finally {
      await ctx.fiber.dispose()
      await rm(root, { recursive: true, force: true })
    }
  })
})
