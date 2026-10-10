/**
 * The lakehouse sync service (`ctx.lakehouseSync`): the orchestration layer
 * over the engine's structured write surface. `runOnce` attaches the
 * configured PostgreSQL source read-only and syncs each configured table —
 * watermark-incremental append when the source carries a change-cursor
 * column, full replace otherwise — persisting per-table watermarks in the
 * lakehouse-internal state table. `ingestLegacy` lands the B0 Parquet export
 * as the permanent `legacy_nocobase` history, creating schema-only tables
 * for the empty sources so the table count matches the reconciliation.
 * @module @deepseek-ai/dsh-lakehouse-sync/sync
 */

import { existsSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { Service } from '@deepseek-ai/cordis'
import type { Context } from '@deepseek-ai/cordis'
import type {
  LakehouseColumnDesc,
  LakehouseEngineService,
  SourceTableRef,
} from '@deepseek-ai/dsh-lakehouse-engine'
import { mapPgColumnType, matchesBusinessTable, watermarkStateKey } from './pg-types.ts'
import type { PgColumn } from './pg-types.ts'

/** Attach alias for the sync source; an internal protocol constant. */
const SRC_ALIAS = '_dsh_src'

/** One configured sync table (plain name today; per-table overrides extend here). */
export interface SyncTableConfig {
  readonly name: string
}

/** Validated source configuration. */
export interface SyncSourceConfig {
  /** libpq connection string for the business database. */
  readonly dsn: string
  /** Source schema holding the business tables. */
  readonly schema: string
  /** Lakehouse schema the synced tables land in. */
  readonly targetSchema: string
  /** The tables to sync, in configured order. */
  readonly tables: readonly SyncTableConfig[]
  /**
   * Change-cursor column candidates probed per table in order; the first
   * present column wins. A table with no candidate column syncs full-replace.
   */
  readonly watermarkCandidates: readonly string[]
}

/** Validated legacy-ingest configuration. */
export interface LegacyIngestConfig {
  /** Directory holding the B0 `<table>.parquet` export files. */
  readonly parquetDir: string
  /** Lakehouse schema the legacy tables land in. */
  readonly targetSchema: string
  /** libpq connection string for column metadata of the empty sources. */
  readonly sourceDsn: string
  /** PG schema the business tables live in. */
  readonly sourceSchema: string
  /** Business-table name prefixes. */
  readonly prefixes: readonly string[]
  /** Standalone business-table names outside the prefixes. */
  readonly standaloneTables: readonly string[]
}

/** One legacy ingest table outcome. */
export interface LegacyIngestTableResult {
  readonly table: string
  readonly source: 'parquet' | 'schema-only'
  readonly rowCount: number
}

/** One legacy ingest run outcome. */
export interface LegacyIngestResult {
  readonly schema: string
  readonly tables: readonly LegacyIngestTableResult[]
}

/** One table's outcome in a sync run. */
export interface SyncTableResult {
  readonly table: string
  readonly mode: 'watermark' | 'replace'
  /** Rows appended this run; the full table size for replace runs. */
  readonly appended: number
  /** The persisted watermark after this run (watermark mode only). */
  readonly watermark: string | null
}

/** One sync run outcome. */
export interface SyncRunResult {
  readonly startedAt: string
  readonly finishedAt: string
  readonly tables: readonly SyncTableResult[]
}

/**
 * The sync service. One instance per context; every method opens by
 * attaching the source read-only and detaches it at the end, so runs never
 * leave attach state behind.
 */
export class LakehouseSyncService extends Service {
  private readonly engine: LakehouseEngineService
  private readonly source: SyncSourceConfig
  private readonly legacy: LegacyIngestConfig | undefined
  private last: SyncRunResult | undefined

  /**
   * @param ctx - the owning context; the service registers as `ctx.lakehouseSync`.
   * @param engine - the lakehouse engine service (the structured write surface).
   * @param source - the validated source configuration.
   * @param legacy - the validated legacy-ingest configuration, when enabled.
   */
  constructor(ctx: Context, engine: LakehouseEngineService, source: SyncSourceConfig, legacy?: LegacyIngestConfig) {
    super(ctx, 'lakehouseSync')
    this.engine = engine
    this.source = source
    this.legacy = legacy
  }

  /** The most recent completed run, for status surfaces. */
  lastRun(): SyncRunResult | undefined {
    return this.last
  }

  /**
   * Land the legacy B0 export into the lakehouse: every Parquet file becomes
   * a table (same-table re-runs replace — idempotent), and every business
   * table without an export file becomes a schema-only table from the
   * source's column metadata, so the resulting table set matches the B0
   * reconciliation exactly.
   * @param signal - cancellation signal.
   * @returns the ingest outcome with per-table row counts.
   */
  async ingestLegacy(signal?: AbortSignal): Promise<LegacyIngestResult> {
    const legacy = this.legacy
    if (legacy === undefined) {
      throw new Error('lakehouse-sync: legacy ingest is not configured')
    }
    await this.engine.attachPostgres(SRC_ALIAS, legacy.sourceDsn, signal)
    try {
      const physical = await this.physicalSourceTables(legacy.sourceSchema)
      const tables = physical
        .filter(table => matchesBusinessTable(table, legacy.prefixes, legacy.standaloneTables))
        .toSorted((a, b) => a.localeCompare(b))
      await this.engine.createSchema(legacy.targetSchema, signal)
      const results: LegacyIngestTableResult[] = []
      for (const table of tables) {
        const parquetPath = join(resolve(legacy.parquetDir), `${table}.parquet`)
        if (existsSync(parquetPath)) {
          await this.engine.ingestParquet(legacy.targetSchema, table, parquetPath, signal)
          const outcome = await this.engine.query(
            `SELECT count(*) FROM lake.${quote(legacy.targetSchema)}.${quote(table)}`,
            undefined,
            signal,
          )
          results.push({ table, source: 'parquet', rowCount: Number(outcome.rows[0]?.[0] ?? 0) })
        } else {
          const columns = await this.sourceColumns(legacy.sourceSchema, table)
          const mapped: LakehouseColumnDesc[] = columns.map(column => ({
            name: column.name,
            sqlType: mapPgColumnType(column),
          }))
          await this.engine.createSchemaOnlyTable(legacy.targetSchema, table, mapped, signal)
          results.push({ table, source: 'schema-only', rowCount: 0 })
        }
      }
      return { schema: legacy.targetSchema, tables: results }
    } finally {
      await this.engine.detach(SRC_ALIAS)
    }
  }

  /**
   * Sync every configured table once. Watermark tables append the source
   * rows beyond the persisted cursor and advance it to the source's current
   * maximum; replace tables land the full current contents.
   * @param signal - cancellation signal.
   * @returns the run outcome with per-table modes and watermark movement.
   */
  async runOnce(signal?: AbortSignal): Promise<SyncRunResult> {
    const startedAt = new Date().toISOString()
    await this.engine.attachPostgres(SRC_ALIAS, this.source.dsn, signal)
    try {
      await this.engine.createSchema(this.source.targetSchema, signal)
      const results: SyncTableResult[] = []
      for (const table of this.source.tables) {
        results.push(await this.syncOne(table.name, signal))
      }
      const finished = {
        startedAt,
        finishedAt: new Date().toISOString(),
        tables: results,
      }
      this.last = finished
      return finished
    } finally {
      await this.engine.detach(SRC_ALIAS)
    }
  }

  /** Sync one table: probe the watermark candidates, then append or replace. */
  private async syncOne(table: string, signal?: AbortSignal): Promise<SyncTableResult> {
    const source: SourceTableRef = { catalog: SRC_ALIAS, schema: this.source.schema, table }
    const watermarkColumn = await this.probeWatermarkColumn(this.source.schema, table)
    if (watermarkColumn === undefined) {
      await this.engine.replaceTableFromSource(this.source.targetSchema, table, source, signal)
      const outcome = await this.engine.query(
        `SELECT count(*) FROM lake.${quote(this.source.targetSchema)}.${quote(table)}`,
        undefined,
        signal,
      )
      return { table, mode: 'replace', appended: Number(outcome.rows[0]?.[0] ?? 0), watermark: null }
    }
    const key = watermarkStateKey(this.source.targetSchema, table)
    const prior = await this.engine.readState(key, signal)
    const appended = await this.engine.appendIncremental(this.source.targetSchema, table, source, watermarkColumn, prior, signal)
    const next = await this.engine.readSourceWatermark(source, watermarkColumn, signal)
    if (next !== null && next !== prior) {
      await this.engine.writeState(key, next, signal)
    }
    return { table, mode: 'watermark', appended, watermark: next }
  }

  /** The physical (BASE TABLE) names of one schema in the attached source. */
  private async physicalSourceTables(schema: string): Promise<string[]> {
    const outcome = await this.engine.readInternal(
      'SELECT table_name FROM _dsh_src.information_schema.tables '
      + `WHERE table_schema = '${schema.replaceAll("'", "''")}' AND table_type = 'BASE TABLE'`,
    )
    return outcome.rows.map(row => String(row[0]))
  }

  /** Ordered PG column metadata for one source table. */
  private async sourceColumns(schema: string, table: string): Promise<PgColumn[]> {
    const outcome = await this.engine.readInternal(
      'SELECT column_name, data_type, character_maximum_length, numeric_precision, numeric_scale '
      + 'FROM _dsh_src.information_schema.columns '
      + `WHERE table_schema = '${schema.replaceAll("'", "''")}' AND table_name = '${table.replaceAll("'", "''")}' `
      + 'ORDER BY ordinal_position',
    )
    return outcome.rows.map(row => ({
      name: String(row[0]),
      dataType: String(row[1]),
      characterMaximumLength: row[2] === null ? null : Number(row[2]),
      numericPrecision: row[3] === null ? null : Number(row[3]),
      numericScale: row[4] === null ? null : Number(row[4]),
    }))
  }

  /** The first configured watermark candidate the source table carries. */
  private async probeWatermarkColumn(schema: string, table: string): Promise<string | undefined> {
    const candidates = this.source.watermarkCandidates
    if (candidates.length === 0) return undefined
    const listed = candidates.map(column => `'${column.replaceAll("'", "''")}'`).join(', ')
    const outcome = await this.engine.readInternal(
      'SELECT column_name FROM _dsh_src.information_schema.columns '
      + `WHERE table_schema = '${schema.replaceAll("'", "''")}' AND table_name = '${table.replaceAll("'", "''")}' `
      + `AND column_name IN (${listed})`,
    )
    const present = new Set(outcome.rows.map(row => String(row[0])))
    return candidates.find(column => present.has(column))
  }
}

/** Quote one SQL identifier for the count statements this module constructs. */
function quote(name: string): string {
  return `"${name.replaceAll('"', '""')}"`
}
