/**
 * Lakehouse catalog attachment: the discriminated configuration that decides
 * which table catalog an engine instance attaches. Tier 0 ships the DuckLake
 * member (a single SQLite-backed catalog file plus Parquet data files, zero
 * external services). Tier 1 (B6) extends the union with an Iceberg REST
 * member (Gravitino + MinIO) — same config shape, different attach SQL; no
 * Tier 1 member is declared here because an unrealized member would be dead
 * code.
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
 * The lakehouse catalog configuration. The union is closed at Tier 0;
 * extending it is a deliberate Tier 1 change that adds both the member and
 * its attach implementation.
 */
export type LakehouseCatalogConfig = DuckLakeCatalogConfig

/** The attach alias every lakehouse reference uses: `lake.<schema>.<table>`. */
export const LAKE_ALIAS = 'lake'

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
  /** The `ATTACH` statement, parameterized by the resolved paths. */
  readonly attachSql: string
}

/**
 * Resolve one catalog configuration into its attach statements.
 * @param config - the validated catalog configuration.
 * @param catalogPath - the resolved absolute catalog-file path.
 * @param dataPath - the resolved absolute data directory.
 * @returns the extension loads and attach statement.
 */
export function resolveCatalogAttach(
  config: LakehouseCatalogConfig,
  catalogPath: string,
  dataPath: string,
): CatalogAttach {
  // A future Tier 1 member switches on config.kind here; the closed union
  // keeps this function total today.
  if (config.kind !== 'ducklake') {
    throw new Error(`unsupported lakehouse catalog kind "${String((config as { kind: string }).kind)}"`)
  }
  return {
    extensionLoads: ['LOAD ducklake'],
    attachSql: `ATTACH 'ducklake:${quoteString(catalogPath).slice(1, -1)}' AS ${LAKE_ALIAS} (DATA_PATH ${quoteString(dataPath)})`,
  }
}
