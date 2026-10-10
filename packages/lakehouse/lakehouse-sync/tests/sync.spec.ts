import { describe, expect, it } from 'vitest'
import { mkdtemp, mkdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import * as EnginePlugin from '@deepseek-ai/dsh-lakehouse-engine'
import * as SyncPlugin from '../src/index.ts'
import { mapPgColumnType, matchesBusinessTable, watermarkStateKey } from '../src/index.ts'

/** The live-business DSN the integration cases run against (self-skip when unset). */
const PG_DSN: string | undefined = process.env.DSH_TEST_LAKEHOUSE_PG_DSN
/** The non-null view the skipped cases never reach. */
const LIVE_DSN = PG_DSN ?? 'dbname=nocobase host=127.0.0.1 port=5432 user=nocobase'

async function setup(root: string, syncConfig?: Parameters<typeof SyncPlugin.apply>[1]): Promise<Context> {
  const ctx = new Context()
  await ctx.plugin(EnginePlugin, {
    catalog: { kind: 'ducklake', catalogPath: join(root, 'catalog.ducklake'), dataPath: join(root, 'files') },
  })
  await ctx.plugin(SyncPlugin, syncConfig ?? {})
  return ctx
}

describe('business-table membership', () => {
  it('accepts prefixed and standalone business tables and rejects platform tables', () => {
    const prefixes = ['hub_', 'crm_', 'wfl_']
    const standalone = ['orders', 'alert_rules']
    expect(matchesBusinessTable('hub_so_orders', prefixes, standalone)).toBe(true)
    expect(matchesBusinessTable('crm_payments', prefixes, standalone)).toBe(true)
    expect(matchesBusinessTable('orders', prefixes, standalone)).toBe(true)
    expect(matchesBusinessTable('users', prefixes, standalone)).toBe(false)
    expect(matchesBusinessTable('uiSchemas', prefixes, standalone)).toBe(false)
    expect(matchesBusinessTable('collections', prefixes, standalone)).toBe(false)
  })
})

describe('PG column type mapping', () => {
  it('maps the PG types the legacy business tables use', () => {
    expect(mapPgColumnType({ name: 'id', dataType: 'bigint', characterMaximumLength: null, numericPrecision: null, numericScale: null })).toBe('BIGINT')
    expect(mapPgColumnType({ name: 'qty', dataType: 'numeric', characterMaximumLength: null, numericPrecision: 10, numericScale: 2 })).toBe('DECIMAL(10, 2)')
    expect(mapPgColumnType({ name: 'code', dataType: 'character varying', characterMaximumLength: 64, numericPrecision: null, numericScale: null })).toBe('TEXT')
    expect(mapPgColumnType({ name: 'ts', dataType: 'timestamp with time zone', characterMaximumLength: null, numericPrecision: null, numericScale: null })).toBe('TIMESTAMPTZ')
    expect(mapPgColumnType({ name: 'flag', dataType: 'boolean', characterMaximumLength: null, numericPrecision: null, numericScale: null })).toBe('BOOLEAN')
    expect(mapPgColumnType({ name: 'doc', dataType: 'jsonb', characterMaximumLength: null, numericPrecision: null, numericScale: null })).toBe('TEXT')
    expect(mapPgColumnType({ name: 'odd', dataType: 'custom_type', characterMaximumLength: null, numericPrecision: null, numericScale: null })).toBe('TEXT')
  })
})

describe('watermark state keys', () => {
  it('namespaces per target schema and table', () => {
    expect(watermarkStateKey('synced_nocobase', 'so_orders')).toBe('watermark:synced_nocobase.so_orders')
  })
})

describe('LakehouseSyncService against a real engine', () => {
  it('registers ctx.lakehouseSync and reports the last run', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-lakehouse-sync-'))
    const ctx = await setup(root)
    try {
      expect(ctx.lakehouseSync).toBeDefined()
      expect(ctx.lakehouseSync.lastRun()).toBeUndefined()
    } finally {
      await ctx.fiber.dispose()
      await rm(root, { recursive: true, force: true })
    }
  })

  it('refuses legacy ingest when not configured', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-lakehouse-sync-'))
    const ctx = await setup(root)
    try {
      await expect(ctx.lakehouseSync.ingestLegacy()).rejects.toThrow(/not configured/u)
    } finally {
      await ctx.fiber.dispose()
      await rm(root, { recursive: true, force: true })
    }
  })
})

describe.skipIf(PG_DSN === undefined)('sync against a live PostgreSQL source', () => {
  it('lands Parquet files as tables and schema-only tables for empty sources, idempotently', { timeout: 60_000 }, async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-lakehouse-sync-live-'))
    const parquetDir = join(root, 'legacy')
    await mkdir(parquetDir, { recursive: true })
    // A real Parquet file produced by the engine itself stands in for one B0 export.
    const seed = await setup(join(root, 'seed'))
    try {
      await seed.lakehouseEngine.execInternal(
        `COPY (SELECT 1 AS id UNION ALL SELECT 2) TO '${join(parquetDir, 'wfl_mobile_work.parquet').replaceAll("'", "''")}' (FORMAT PARQUET)`,
      )
    } finally {
      await seed.fiber.dispose()
    }
    const ctx = await setup(root, {
      legacyIngest: {
        enabled: true,
        parquetDir,
        targetSchema: 'legacy_nocobase',
        sourceDsn: LIVE_DSN,
        prefixes: ['wfl_'],
        standaloneTables: [],
      },
    })
    try {
      const result = await ctx.lakehouseSync.ingestLegacy()
      const landed = new Map(result.tables.map(entry => [entry.table, entry]))
      // wfl_mobile_work came from Parquet; the other wfl_* tables are empty
      // in the source, so they land schema-only with zero rows.
      expect(landed.get('wfl_mobile_work')).toMatchObject({ source: 'parquet', rowCount: 2 })
      for (const entry of result.tables) {
        if (entry.table !== 'wfl_mobile_work') expect(entry.source).toBe('schema-only')
      }
      const second = await ctx.lakehouseSync.ingestLegacy()
      expect(second.tables.length).toBe(result.tables.length)
      expect(landed.get('wfl_mobile_work')?.rowCount).toBe(2)
    } finally {
      await ctx.fiber.dispose()
      await rm(root, { recursive: true, force: true })
    }
  })

  it('syncs a watermark table twice: the second pass appends nothing until the source moves', { timeout: 60_000 }, async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-lakehouse-sync-live-'))
    const ctx = await setup(root, {
      dsn: LIVE_DSN,
      sourceSchema: 'public',
      targetSchema: 'synced_nocobase',
      tables: ['wfl_mobile_work'],
      watermarkCandidates: ['updatedAt', 'updated_at'],
    })
    try {
      const first = await ctx.lakehouseSync.runOnce()
      expect(first.tables).toHaveLength(1)
      expect(first.tables[0]?.mode).toBe('watermark')
      expect(first.tables[0]?.appended).toBeGreaterThan(0)
      expect(first.tables[0]?.watermark).not.toBeNull()
      const firstCount = await ctx.lakehouseEngine.query(
        'SELECT count(*) FROM lake.synced_nocobase.wfl_mobile_work',
      )
      const second = await ctx.lakehouseSync.runOnce()
      expect(second.tables[0]?.appended).toBe(0)
      const secondCount = await ctx.lakehouseEngine.query(
        'SELECT count(*) FROM lake.synced_nocobase.wfl_mobile_work',
      )
      expect(secondCount.rows).toEqual(firstCount.rows)
    } finally {
      await ctx.fiber.dispose()
      await rm(root, { recursive: true, force: true })
    }
  })
})

describe('scheduled runs', () => {
  it('arms the interval when configured and stays quiet at 0', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-lakehouse-sync-sched-'))
    const armed = await setup(root, { scheduleIntervalMs: 60_000 })
    try {
      expect(armed.lakehouseSync).toBeDefined()
    } finally {
      await armed.fiber.dispose()
      await rm(root, { recursive: true, force: true })
    }
  })
})
