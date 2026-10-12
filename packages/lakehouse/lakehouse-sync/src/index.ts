/**
 * Plugin entry for the lakehouse sync pipeline: validates the source, table,
 * schedule, and legacy-ingest configuration, registers `ctx.lakehouseSync`,
 * runs the legacy ingest at startup when enabled, and arms the interval
 * schedule when configured. Misconfiguration fails loud at load.
 * @module @deepseek-ai/dsh-lakehouse-sync
 */

import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { LakehouseSyncService } from './sync.ts'
import type { LegacyIngestConfig, SyncSourceConfig } from './sync.ts'

export { LakehouseSyncService } from './sync.ts'
export type {
  LegacyIngestConfig, LegacyIngestResult, LegacyIngestTableResult,
  SyncRunResult, SyncSourceConfig, SyncTableConfig, SyncTableResult,
} from './sync.ts'
export { mapPgColumnType, matchesBusinessTable, watermarkStateKey } from './pg-types.ts'
export type { PgColumn } from './pg-types.ts'

declare module '@deepseek-ai/cordis' {
  interface Context {
    lakehouseSync: LakehouseSyncService
  }
}

/** Services required by the sync pipeline. */
export const inject = ['lakehouseEngine']

/** Default DSN for the current business source (NocoBase; carbon lands in B3). */
const DEFAULT_SOURCE_DSN = 'dbname=nocobase host=127.0.0.1 port=5432 user=nocobase'

/** Default watermark candidate columns, probed in order per table. */
const DEFAULT_WATERMARK_CANDIDATES: readonly string[] = ['updatedAt', 'updated_at']

/** Default business-table prefixes for the legacy ingest (the B0 set). */
const DEFAULT_LEGACY_PREFIXES: readonly string[] = [
  'hub_', 'crm_', 'mfg_', 'pur_', 'qm_', 'srm_', 'wms_', 'wfl_', 'mps_', 'mrp_', 'eam_', 'fin_', 'recall_', 'aps_', 'so_',
]

/** Standalone legacy business tables outside the prefixes (the B0 set). */
const DEFAULT_LEGACY_STANDALONE: readonly string[] = [
  'expert_services', 'experts', 'orders', 'orders_deliverables', 'alert_rules', 'kpi_snapshots',
]

/** Plugin configuration. */
export interface Config {
  /** libpq connection string for the business source. */
  readonly dsn?: string
  /** Source schema holding the business tables; defaults to `public`. */
  readonly sourceSchema?: string
  /** Lakehouse schema the synced tables land in; defaults to `synced_nocobase`. */
  readonly targetSchema?: string
  /** The tables to sync. */
  readonly tables?: string[]
  /** Change-cursor column candidates probed per table in order. */
  readonly watermarkCandidates?: string[]
  /** Sync interval in ms; 0 (the default) disables the schedule. */
  readonly scheduleIntervalMs?: number
  /** Legacy B0 Parquet ingest, run once at startup when enabled. */
  readonly legacyIngest?: {
    /** Run the one-shot ingest at startup; defaults false. */
    readonly enabled?: boolean
    /** Directory of B0 `<table>.parquet` exports to scan. */
    readonly parquetDir?: string
    /** Lakehouse schema the legacy tables land in. */
    readonly targetSchema?: string
    /** DSN for schema-only table DDL of tables without an export file. */
    readonly sourceDsn?: string
    /** Source schema prefixes kept from table names when projecting. */
    readonly prefixes?: string[]
    /** Tables without an export file that still get schema-only empty tables. */
    readonly standaloneTables?: string[]
  }
}

export const Config: z<Config> = z.object({
  dsn: z.string().default(DEFAULT_SOURCE_DSN),
  sourceSchema: z.string().default('public'),
  targetSchema: z.string().default('synced_nocobase'),
  tables: z.array(z.string()).default([]),
  watermarkCandidates: z.array(z.string()).default([...DEFAULT_WATERMARK_CANDIDATES]),
  scheduleIntervalMs: z.number().step(1).min(0).default(0),
  legacyIngest: z.object({
    enabled: z.boolean().default(false),
    parquetDir: z.string().default('workspace/lakehouse/legacy'),
    targetSchema: z.string().default('legacy_nocobase'),
    sourceDsn: z.string().default(''),
    prefixes: z.array(z.string()).default([...DEFAULT_LEGACY_PREFIXES]),
    standaloneTables: z.array(z.string()).default([...DEFAULT_LEGACY_STANDALONE]),
  }).default({
    enabled: false,
    parquetDir: 'workspace/lakehouse/legacy',
    targetSchema: 'legacy_nocobase',
    sourceDsn: '',
    prefixes: [...DEFAULT_LEGACY_PREFIXES],
    standaloneTables: [...DEFAULT_LEGACY_STANDALONE],
  }),
})

/**
 * Register the sync service, run the enabled legacy ingest, and arm the
 * interval schedule. A legacy-ingest failure at startup fails composition
 * (misconfiguration fails loud); a scheduled run failure logs and leaves the
 * service ready for the next tick.
 * @param ctx - context whose `lakehouseSync` service this registers.
 * @param config - validated plugin configuration.
 */
export async function apply(ctx: Context, config: Config): Promise<void> {
  // schemastery (Config) has already filled every defaulted field.
  const source: SyncSourceConfig = {
    dsn: config.dsn ?? DEFAULT_SOURCE_DSN,
    schema: config.sourceSchema ?? 'public',
    targetSchema: config.targetSchema ?? 'synced_nocobase',
    tables: (config.tables ?? []).map(name => ({ name })),
    watermarkCandidates: config.watermarkCandidates ?? DEFAULT_WATERMARK_CANDIDATES,
  }
  const ingest = config.legacyIngest
  const legacy: LegacyIngestConfig | undefined = ingest?.enabled === true
    ? {
      parquetDir: ingest.parquetDir ?? 'workspace/lakehouse/legacy',
      targetSchema: ingest.targetSchema ?? 'legacy_nocobase',
      // An empty sourceDsn means "the sync source's DSN".
      sourceDsn: ingest.sourceDsn === '' || ingest.sourceDsn === undefined
        ? (config.dsn ?? DEFAULT_SOURCE_DSN)
        : ingest.sourceDsn,
      sourceSchema: config.sourceSchema ?? 'public',
      prefixes: ingest.prefixes ?? DEFAULT_LEGACY_PREFIXES,
      standaloneTables: ingest.standaloneTables ?? DEFAULT_LEGACY_STANDALONE,
    }
    : undefined
  const service = new LakehouseSyncService(ctx, ctx.lakehouseEngine, source, legacy)
  if (legacy !== undefined) {
    const result = await service.ingestLegacy()
    ctx.logger.info(`lakehouse-sync: legacy ingest landed ${String(result.tables.length)} tables into ${result.schema}`)
  }
  const intervalMs = config.scheduleIntervalMs ?? 0
  if (intervalMs > 0) {
    ctx.effect(() => {
      const timer = globalThis.setInterval(() => {
        void service.runOnce().catch((error: unknown) => {
          ctx.logger.warn(`lakehouse-sync: scheduled run failed: ${String(error)}`)
        })
      }, intervalMs)
      return () => { globalThis.clearInterval(timer) }
    }, 'lakehouse-sync.schedule')
  }
}
