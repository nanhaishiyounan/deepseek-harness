/**
 * Lakehouse catalog attachment: the discriminated configuration that decides
 * which table catalog an engine instance attaches. Tier 0 ships the DuckLake
 * member (a single SQLite-backed catalog file plus Parquet data files, zero
 * external services). Tier 1 adds the Iceberg REST member (Gravitino's
 * embedded Iceberg REST service fronting an S3-backed Iceberg warehouse) —
 * same config shape, different attach SQL.
 * @module @deepseek-ai/dsh-lakehouse-engine/catalog
 */

/** Tier 0: a DuckLake catalog — `catalog.ducklake` (SQLite) + Parquet files. */
export interface DuckLakeCatalogConfig {
  readonly kind: 'ducklake'
  /** Catalog file path (workspace-relative or absolute); the parent directory is created on open. */
  readonly catalogPath: string
  /** Data-file directory for the Parquet files the catalog manages; defaults to the catalog file's directory. */
  readonly dataPath?: string
}

/**
 * The S3 data-plane credentials an Iceberg REST attach needs: table metadata
 * rides the REST service, Parquet data files go straight to object storage.
 */
export interface IcebergS3Config {
  /** S3 endpoint host:port as seen from this process (path-style). */
  readonly endpoint: string
  readonly accessKeyId: string
  readonly secretAccessKey: string
  /** S3 region for vended-credential signing; defaults to {@link DEFAULT_S3_REGION}. */
  readonly region?: string
  /** Whether to use path-style bucket addressing; defaults to true. */
  readonly pathStyle?: boolean
}

/**
 * Tier 1: an Iceberg REST catalog — Gravitino's embedded Iceberg REST service
 * (`/iceberg`) resolving the metalake's `lakehouse` catalog, with data files
 * on S3. The REST service must already carry server-side defaults (dynamic
 * config provider + default metalake/catalog) so a plain attach with no
 * `gravitino-metalake`/`catalog` headers lands on the right catalog.
 */
export interface IcebergRestCatalogConfig {
  readonly kind: 'iceberg-rest'
  /** Iceberg REST service base URL (for example `http://localhost:8181/iceberg`). */
  readonly restUri: string
  /** Warehouse name — for Gravitino, the catalog name inside the metalake. */
  readonly warehouse: string
  /** The S3 data plane for Parquet files. */
  readonly s3: IcebergS3Config
}

/**
 * The lakehouse catalog configuration. The union is closed; extending it is a
 * deliberate tier change that adds both the member and its attach
 * implementation in the same change.
 */
export type LakehouseCatalogConfig = DuckLakeCatalogConfig | IcebergRestCatalogConfig

/** The attach alias every lakehouse reference uses: `lake.<schema>.<table>`. */
export const LAKE_ALIAS = 'lake'

/** Default S3 region when the config omits one (the vended-credential signer needs any valid region). */
export const DEFAULT_S3_REGION = 'us-east-1'

/** Quote one SQL identifier (double quotes; embedded quotes doubled). */
export function quoteIdentifier(name: string): string {
  return `"${name.replaceAll('"', '""')}"`
}

/** Quote one SQL string literal (single quotes; embedded quotes doubled). */
export function quoteString(text: string): string {
  return `'${text.replaceAll("'", "''")}'`
}

/** Resolved catalog attachment: the SQL statements to run, in order. */
export interface CatalogAttach {
  /** `LOAD` statements for the extensions the catalog kind needs. */
  readonly extensionLoads: readonly string[]
  /**
   * Statements that must run before the attach itself (the Iceberg REST
   * member's S3 secret; empty for DuckLake).
   */
  readonly preAttachSql: readonly string[]
  /** The `ATTACH` statement, parameterized by the resolved configuration. */
  readonly attachSql: string
}

/**
 * Resolve one catalog configuration into its attach statements.
 * @param config - the validated catalog configuration.
 * @param catalogPath - the resolved absolute catalog-file path (DuckLake only).
 * @param dataPath - the resolved absolute data directory (DuckLake only).
 * @returns the extension loads, pre-attach statements, and attach statement.
 */
export function resolveCatalogAttach(
  config: LakehouseCatalogConfig,
  catalogPath: string,
  dataPath: string,
): CatalogAttach {
  if (config.kind === 'iceberg-rest') {
    const region = config.s3.region ?? DEFAULT_S3_REGION
    const pathStyle = config.s3.pathStyle ?? true
    return {
      extensionLoads: ['LOAD iceberg'],
      preAttachSql: [
        `CREATE OR REPLACE SECRET ${quoteIdentifier('dsh_lake_s3')} `
          + `(TYPE S3, KEY_ID ${quoteString(config.s3.accessKeyId)}, SECRET ${quoteString(config.s3.secretAccessKey)}, `
          + `ENDPOINT ${quoteString(config.s3.endpoint)}, REGION ${quoteString(region)}, `
          + `URL_STYLE ${pathStyle ? 'path' : 'vhost'}, USE_SSL false)`,
      ],
      attachSql: `ATTACH ${quoteString(config.warehouse)} AS ${LAKE_ALIAS} `
        + `(TYPE ICEBERG, ENDPOINT ${quoteString(config.restUri)}, AUTHORIZATION_TYPE none)`,
    }
  }
  return {
    extensionLoads: ['LOAD ducklake'],
    preAttachSql: [],
    attachSql: `ATTACH 'ducklake:${quoteString(catalogPath).slice(1, -1)}' AS ${LAKE_ALIAS} (DATA_PATH ${quoteString(dataPath)})`,
  }
}
