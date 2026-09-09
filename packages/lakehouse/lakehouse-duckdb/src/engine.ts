/**
 * The DuckDB `QueryProvider`: an in-process OLAP engine over Parquet (and
 * CSV) files. One `:memory:` instance serves per-call connections; each query
 * exposes exactly the tenant's registered tables as temporary views, so
 * cross-tenant references fail as unknown tables.
 * @module @deepseek-ai/dsh-lakehouse-duckdb/engine
 */

import type {
  DuckDBAppender,
  DuckDBConnection,
  DuckDBInstance,
} from '@duckdb/node-api'
import { LakehouseError } from '@deepseek-ai/dsh-lakehouse'
import type {
  EngineQueryOptions,
  EngineTableRef,
  LakehouseFormat,
  LakehouseQueryResult,
  QueryProvider,
  TabularData,
} from '@deepseek-ai/dsh-lakehouse'

type DuckDbModule = typeof import('@duckdb/node-api')

/** Constructor options for {@link DuckDbEngine}. */
export interface DuckDbEngineOptions {
  /** DuckDB memory limit in MB; omitted = DuckDB's own default. */
  readonly memoryLimitMb?: number
  /** DuckDB worker-thread count; omitted = DuckDB's own default. */
  readonly threads?: number
}

/** Injection points for engine construction (probe failure testing). */
export interface DuckDbEngineDeps {
  /** Dynamic loader for the DuckDB native module; defaults to a real `import()`. */
  readonly importDuckDb?: () => Promise<DuckDbModule>
}

/** Fixed temp-table name for the load path; no caller input reaches it. */
const LOAD_TABLE = '_dsh_load'

/** DuckDB table functions per on-disk format. */
const READERS: Partial<Record<LakehouseFormat, string>> = {
  parquet: 'read_parquet',
  csv: 'read_csv',
}

/**
 * Column types the load path accepts in DDL. Caller-supplied `sqlType` text
 * is interpolated into `CREATE TEMP TABLE`, so anything outside this closed
 * set is rejected rather than escaped.
 */
const SQL_TYPE_PATTERN = /^(?:TINYINT|SMALLINT|INTEGER|BIGINT|HUGEINT|UTINYINT|USMALLINT|UINTEGER|UBIGINT|UHUGEINT|DOUBLE|FLOAT|REAL|TEXT|VARCHAR|BOOLEAN|DATE|TIME|TIMESTAMP|DECIMAL\s*\(\s*\d+\s*,\s*\d+\s*\))$/iu // eslint-disable-line @stylistic/max-len -- one closed type set; splitting blurs it

function quoteIdentifier(name: string): string {
  return `"${name.replaceAll('"', '""')}"`
}

function quoteString(text: string): string {
  return `'${text.replaceAll("'", "''")}'`
}

function throwIfAborted(signal: AbortSignal | undefined): void {
  // An aborted AbortSignal always carries a reason per the WHATWG standard.
  /* v8 ignore next 2 */
  if (signal?.aborted) throw signal.reason ?? new DOMException('The operation was aborted', 'AbortError')
}

/**
 * Normalize one DuckDB JS value for JSON-shaped consumers: aggregates arrive
 * as `bigint` and dates as `Date`; everything JSON-native passes through.
 */
function normalizeCell(value: unknown): unknown {
  if (typeof value === 'bigint') {
    const narrowed = Number(value)
    return Number.isSafeInteger(narrowed) ? narrowed : value.toString()
  }
  if (value instanceof Date) return value.toISOString()
  return value
}

/** Append one JSON-scalar cell; other value types fail loud before touching the appender. */
function appendCell(appender: DuckDBAppender, value: unknown, rowIndex: number, columnIndex: number): void {
  if (value === null) {
    appender.appendNull()
    return
  }
  if (typeof value === 'boolean' || typeof value === 'number' || typeof value === 'bigint' || typeof value === 'string') {
    appender.appendValue(value)
    return
  }
  throw new LakehouseError(
    `cell at row ${rowIndex}, column ${columnIndex} has unsupported type ${typeof value}; supported: null, boolean, number, bigint, string`,
    'LAKEHOUSE_WRITE_FAILED',
  )
}

/**
 * The DuckDB-backed `QueryProvider`. The module import and instance creation
 * happen in {@link DuckDbEngine.probe} — never at module top level — so a
 * missing native binding degrades to `available() === false` with the load
 * failure recorded, instead of breaking composition load.
 */
export class DuckDbEngine implements QueryProvider {
  readonly id = 'lakehouse-duckdb'
  private instance: DuckDBInstance | undefined
  private loadFailure: string | undefined
  private disposed = false
  private readonly instanceOptions: Record<string, string>
  private readonly importDuckDb: () => Promise<DuckDbModule>

  constructor(options: DuckDbEngineOptions, deps: DuckDbEngineDeps = {}) {
    this.instanceOptions = {
      ...(options.memoryLimitMb === undefined ? {} : { memory_limit: `${options.memoryLimitMb}MB` }),
      ...(options.threads === undefined ? {} : { threads: String(options.threads) }),
    }
    this.importDuckDb = deps.importDuckDb ?? (async () => await import('@duckdb/node-api'))
  }

  available(): boolean {
    return this.instance !== undefined && !this.disposed
  }

  /**
   * Load the native module and create the shared `:memory:` instance. A
   * failed load never throws: it records the failure and leaves the engine
   * unavailable, so providers register (and degrade) instead of failing
   * composition.
   */
  async probe(): Promise<void> {
    if (this.instance !== undefined || this.disposed) return
    try {
      const duckdb = await this.importDuckDb()
      this.instance = await duckdb.DuckDBInstance.create(':memory:', this.instanceOptions)
    } catch (cause: unknown) {
      this.loadFailure = String(cause)
    }
  }

  /** Close the shared instance; idempotent. Pending connections close with it. */
  dispose(): void {
    this.disposed = true
    this.instance?.closeSync()
    this.instance = undefined
  }

  async query(
    _tenantId: string,
    sql: string,
    tables: readonly EngineTableRef[],
    options: EngineQueryOptions,
    signal?: AbortSignal,
  ): Promise<LakehouseQueryResult> {
    throwIfAborted(signal)
    const connection = await this.connect()
    try {
      for (const table of tables) {
        const readerFunction = READERS[table.format]
        if (readerFunction === undefined) {
          throw new LakehouseError(
            `table "${table.tableName}" has unsupported format "${table.format}"`,
            'LAKEHOUSE_QUERY_FAILED',
          )
        }
        await connection.run(
          `CREATE TEMP VIEW ${quoteIdentifier(table.tableName)} AS SELECT * FROM ${readerFunction}(${quoteString(table.location)})`,
        )
      }
      const stripped = sql.trim().replace(/;+$/u, '')
      const reader = await connection.runAndReadAll(`SELECT * FROM (${stripped}) LIMIT ${options.maxRows + 1}`)
      const columns = reader.columnNames().map((name, index) => ({ name, sqlType: String(reader.columnType(index)) }))
      const rows = reader.getRowsJS().map(row => row.map(normalizeCell))
      return {
        columns,
        rows: rows.slice(0, options.maxRows),
        truncated: rows.length > options.maxRows,
      }
    } catch (error: unknown) {
      if (error instanceof LakehouseError) throw error
      throw new LakehouseError(
        `the DuckDB query failed: ${String(error)}`,
        'LAKEHOUSE_QUERY_FAILED',
        { cause: error },
      )
    } finally {
      connection.disconnectSync()
    }
  }

  async writeParquet(location: string, tabular: TabularData, signal?: AbortSignal): Promise<void> {
    throwIfAborted(signal)
    for (const column of tabular.columns) {
      if (!SQL_TYPE_PATTERN.test(column.sqlType)) {
        throw new LakehouseError(
          `column "${column.name}" has unsupported sqlType "${column.sqlType}"`,
          'LAKEHOUSE_INVALID_SQL_TYPE',
        )
      }
    }
    const connection = await this.connect()
    try {
      const ddl = tabular.columns.map(column => `${quoteIdentifier(column.name)} ${column.sqlType}`).join(', ')
      await connection.run(`CREATE TEMP TABLE ${LOAD_TABLE} (${ddl})`)
      const appender = await connection.createAppender(LOAD_TABLE)
      for (const [rowIndex, row] of tabular.rows.entries()) {
        throwIfAborted(signal)
        for (const [columnIndex, cell] of row.entries()) {
          appendCell(appender, cell, rowIndex, columnIndex)
        }
        appender.endRow()
      }
      appender.flushSync()
      appender.closeSync()
      await connection.run(`COPY ${LOAD_TABLE} TO ${quoteString(location)} (FORMAT PARQUET)`)
    } catch (error: unknown) {
      if (error instanceof LakehouseError || signal?.aborted === true) throw error
      throw new LakehouseError(
        `writing the Parquet file failed: ${String(error)}`,
        'LAKEHOUSE_WRITE_FAILED',
        { cause: error },
      )
    } finally {
      connection.disconnectSync()
    }
  }

  /** One fresh connection from the shared instance; unavailable fails loud. */
  private async connect(): Promise<DuckDBConnection> {
    const instance = this.instance
    if (instance === undefined || this.disposed) {
      const detail = this.loadFailure === undefined ? '' : ` (${this.loadFailure})`
      throw new LakehouseError(
        `the DuckDB engine is unavailable${detail}; install @duckdb/node-api to enable lakehouse queries`,
        'LAKEHOUSE_ENGINE_UNAVAILABLE',
      )
    }
    return await instance.connect()
  }
}
