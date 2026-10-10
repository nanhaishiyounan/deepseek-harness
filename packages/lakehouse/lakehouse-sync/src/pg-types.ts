/**
 * PostgreSQL column metadata → DuckDB DDL type mapping, for the legacy
 * ingest's schema-only tables (source tables that exported no data file).
 * JSON, UUID, and array types land as TEXT: the B0 export serialized those
 * cells to text, so the lakehouse keeps one analysis-compatible reading.
 * @module @deepseek-ai/dsh-lakehouse-sync/pg-types
 */

/** One source column's PG metadata, from `information_schema.columns`. */
export interface PgColumn {
  readonly name: string
  readonly dataType: string
  readonly characterMaximumLength: number | null
  readonly numericPrecision: number | null
  readonly numericScale: number | null
}

/**
 * Map one PG column onto its DuckDB DDL type.
 * @param column - the PG column metadata.
 * @returns the DuckDB type text for `CREATE TABLE`.
 */
export function mapPgColumnType(column: PgColumn): string {
  switch (column.dataType) {
    case 'smallint': return 'SMALLINT'
    case 'integer': return 'INTEGER'
    case 'bigint': return 'BIGINT'
    case 'numeric': {
      const precision = column.numericPrecision ?? 38
      const scale = column.numericScale ?? 0
      return `DECIMAL(${String(precision)}, ${String(scale)})`
    }
    case 'real': return 'FLOAT'
    case 'double precision': return 'DOUBLE'
    case 'boolean': return 'BOOLEAN'
    case 'timestamp without time zone': return 'TIMESTAMP'
    case 'timestamp with time zone': return 'TIMESTAMPTZ'
    case 'date': return 'DATE'
    case 'time without time zone': return 'TIME'
    case 'character varying':
    case 'character':
    case 'text':
    case 'uuid':
    case 'json':
    case 'jsonb':
    case 'ARRAY':
    case 'USER-DEFINED':
      return 'TEXT'
    default:
      return 'TEXT'
  }
}

/**
 * The business-table membership rule for the legacy ingest: one of the
 * configured prefixes, or one of the standalone names.
 * @param table - the PG table name.
 * @param prefixes - accepted table-name prefixes.
 * @param standalone - accepted exact names outside the prefixes.
 * @returns whether the table belongs to the legacy business set.
 */
export function matchesBusinessTable(
  table: string,
  prefixes: readonly string[],
  standalone: readonly string[],
): boolean {
  return prefixes.some(prefix => table.startsWith(prefix)) || standalone.includes(table)
}

/**
 * The engine state key under which one table's watermark persists.
 * @param schema - the lakehouse target schema.
 * @param table - the lakehouse table name.
 * @returns the state key.
 */
export function watermarkStateKey(schema: string, table: string): string {
  return `watermark:${schema}.${table}`
}
