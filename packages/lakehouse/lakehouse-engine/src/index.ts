/**
 * Service Definition and DuckDB provider for the lakehouse engine capability
 * (`ctx.lakehouseEngine`): an in-process DuckDB instance with the configured
 * table catalog attached. Consumers are the tool suite (`tool-lakehouse`),
 * the sync pipeline (`lakehouse-sync`), and the gateway's lakehouse domain.
 * @module @deepseek-ai/dsh-lakehouse-engine
 */

import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { DEFAULT_MAX_ROWS, DEFAULT_QUERY_TIMEOUT_MS, LakehouseEngineService } from './engine.ts'
import type { LakehouseCatalogConfig } from './catalog.ts'

export { DEFAULT_S3_REGION, LAKE_ALIAS, quoteIdentifier, quoteString, resolveCatalogAttach } from './catalog.ts'
export type {
  CatalogAttach, DuckLakeCatalogConfig, IcebergRestCatalogConfig, IcebergS3Config, LakehouseCatalogConfig,
} from './catalog.ts'
export {
  assertNonBlank, assertReadOnlySql, readOnlyVerdict, SqlGuardError,
} from './sql-guard.ts'
export type { SqlGuardCode, SqlGuardVerdict } from './sql-guard.ts'
export {
  DEFAULT_MAX_ROWS, DEFAULT_QUERY_TIMEOUT_MS, LakehouseEngineError, LakehouseEngineService,
} from './engine.ts'
export type {
  LakehouseColumnDesc, LakehouseEngineDeps, LakehouseEngineErrorCode, LakehouseEngineOptions,
  LakehouseQueryOutcome, LakehouseTableSummary, QueryOptions, SourceTableRef,
} from './engine.ts'

declare module '@deepseek-ai/cordis' {
  interface Context {
    lakehouseEngine: LakehouseEngineService
  }
}

/** Default catalog file, workspace-relative. */
const DEFAULT_CATALOG_PATH = 'workspace/lakehouse/ducklake/catalog.ducklake'

/**
 * Plugin configuration. The catalog `kind` discriminates at load: `ducklake`
 * (Tier 0) takes catalogPath/dataPath; `iceberg-rest` (Tier 1) takes
 * restUri/warehouse/s3.
 */
export interface Config {
  /**
   * The attached table catalog. Tier 0: `kind: 'ducklake'` with catalogPath
   * and optional dataPath. Tier 1: `kind: 'iceberg-rest'` with restUri,
   * warehouse, and the s3 data-plane credentials.
   */
  readonly catalog?: {
    /** Catalog member kind: `'ducklake'` (Tier 0) or `'iceberg-rest'` (Tier 1). */
    readonly kind: string
    /** Tier 0 DuckLake catalog file path (SQLite). */
    readonly catalogPath?: string
    /** Tier 0 data-directory root for Parquet files; defaults beside the catalog. */
    readonly dataPath?: string
    /** Tier 1 Iceberg REST catalog URI (Gravitino). */
    readonly restUri?: string
    /** Tier 1 warehouse identifier. */
    readonly warehouse?: string
    /** Tier 1 S3 data-plane credentials. */
    readonly s3?: {
      /** S3 endpoint the Iceberg catalog vends. */
      readonly endpoint: string
      /** S3 access key id. */
      readonly accessKeyId: string
      /** S3 secret access key. */
      readonly secretAccessKey: string
      /** S3 region; rides the catalog's `s3-region` vended config. */
      readonly region?: string
      /** Force path-style addressing (self-hosted stores); defaults true where vended. */
      readonly pathStyle?: boolean
    }
  }
  /** DuckDB memory limit in MB; omitted = DuckDB's own default. */
  readonly memoryLimitMb?: number
  /** DuckDB worker-thread count; omitted = DuckDB's own default. */
  readonly threads?: number
  /** Read-query row cap; defaults to 200. */
  readonly maxRows?: number
  /** Read-query time budget in ms; defaults to 30000. */
  readonly queryTimeoutMs?: number
  /** Try `INSTALL` when an extension `LOAD` fails; defaults to true. */
  readonly extensionAutoinstall?: boolean
}

export const Config: z<Config> = z.object({
  catalog: z.object({
    kind: z.string().default('ducklake'),
    catalogPath: z.string().default(DEFAULT_CATALOG_PATH),
    dataPath: z.string(),
    restUri: z.string(),
    warehouse: z.string(),
    s3: z.object({
      endpoint: z.string(),
      accessKeyId: z.string(),
      secretAccessKey: z.string(),
      region: z.string(),
      pathStyle: z.boolean(),
    }),
  }),
  memoryLimitMb: z.number().step(1).min(1),
  threads: z.number().step(1).min(1),
  maxRows: z.number().step(1).min(1).default(DEFAULT_MAX_ROWS),
  queryTimeoutMs: z.number().step(1).min(1).default(DEFAULT_QUERY_TIMEOUT_MS),
  extensionAutoinstall: z.boolean().default(true),
})

/**
 * Register the engine service and open it. A missing native module degrades
 * to an unavailable engine (one operator warning; every surface method then
 * fails loud with `LAKEHOUSE_ENGINE_UNAVAILABLE`). A catalog attach failure
 * on a working instance is a configuration error and fails composition.
 * @param ctx - context whose `lakehouseEngine` service this registers.
 * @param config - validated plugin configuration.
 */
export async function apply(ctx: Context, config: Config): Promise<void> {
  // schemastery (Config) has already filled every defaulted field.
  let catalog: LakehouseCatalogConfig
  if (config.catalog === undefined || config.catalog.kind === 'ducklake') {
    catalog = config.catalog === undefined
      ? { kind: 'ducklake', catalogPath: DEFAULT_CATALOG_PATH }
      : {
        kind: 'ducklake',
        catalogPath: config.catalog.catalogPath ?? DEFAULT_CATALOG_PATH,
        ...(config.catalog.dataPath === undefined ? {} : { dataPath: config.catalog.dataPath }),
      }
  } else if (config.catalog.kind === 'iceberg-rest') {
    if (config.catalog.restUri === undefined || config.catalog.warehouse === undefined || config.catalog.s3 === undefined) {
      throw new Error('lakehouse-engine: iceberg-rest requires restUri, warehouse, and s3 credentials')
    }
    catalog = {
      kind: 'iceberg-rest',
      restUri: config.catalog.restUri,
      warehouse: config.catalog.warehouse,
      s3: {
        endpoint: config.catalog.s3.endpoint,
        accessKeyId: config.catalog.s3.accessKeyId,
        secretAccessKey: config.catalog.s3.secretAccessKey,
        ...(config.catalog.s3.region === undefined ? {} : { region: config.catalog.s3.region }),
        ...(config.catalog.s3.pathStyle === undefined ? {} : { pathStyle: config.catalog.s3.pathStyle }),
      },
    }
  } else {
    throw new Error(`lakehouse-engine: unsupported catalog kind "${config.catalog.kind}" (ducklake | iceberg-rest)`)
  }
  const service = new LakehouseEngineService(ctx, {
    catalog,
    ...(config.memoryLimitMb === undefined ? {} : { memoryLimitMb: config.memoryLimitMb }),
    ...(config.threads === undefined ? {} : { threads: config.threads }),
    ...(config.maxRows === undefined ? {} : { maxRows: config.maxRows }),
    ...(config.queryTimeoutMs === undefined ? {} : { queryTimeoutMs: config.queryTimeoutMs }),
    ...(config.extensionAutoinstall === undefined ? {} : { extensionAutoinstall: config.extensionAutoinstall }),
  })
  ctx.effect(() => () => {
    service.close()
  }, 'lakehouse-engine.dispose')
  await service.open()
  /* v8 ignore next 3 -- only reachable on hosts whose native module failed to load. */
  if (!service.available() && service.openFailure() !== undefined) {
    ctx.logger.warn(`lakehouse-engine: ${service.openFailure()}`)
  }
}
