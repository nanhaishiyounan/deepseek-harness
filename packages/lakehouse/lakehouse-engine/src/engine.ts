/**
 * The lakehouse engine service (`ctx.lakehouseEngine`): one in-process DuckDB
 * instance with the configured table catalog attached (DuckLake at Tier 0).
 * The model-facing surface — {@link LakehouseEngineService.query},
 * {@link LakehouseEngineService.listTables},
 * {@link LakehouseEngineService.describeTable},
 * {@link LakehouseEngineService.sampleRows} — enforces the read-only SQL
 * guard and the row/time budgets before anything reaches DuckDB. The write
 * surface is a set of structured operations (no free-form SQL) reserved for
 * the sync pipeline.
 * @module @deepseek-ai/dsh-lakehouse-engine/engine
 */

import { mkdir } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { Service } from '@deepseek-ai/cordis'
import type { Context } from '@deepseek-ai/cordis'
import type { DuckDBConnection, DuckDBInstance } from '@duckdb/node-api'
import { LAKE_ALIAS, quoteIdentifier, quoteString, resolveCatalogAttach } from './catalog.ts'
import type { LakehouseCatalogConfig } from './catalog.ts'
import { assertReadOnlySql, SqlGuardError } from './sql-guard.ts'

type DuckDbModule = typeof import('@duckdb/node-api')

/** Error code namespace for engine failures. */
export type LakehouseEngineErrorCode =
  | 'LAKEHOUSE_ENGINE_UNAVAILABLE'
  | 'LAKEHOUSE_ENGINE_QUERY_FAILED'
  | 'LAKEHOUSE_ENGINE_TIMEOUT'
  | 'LAKEHOUSE_ENGINE_INVALID_IDENTIFIER'

/** Structured engine error. */
export class LakehouseEngineError extends Error {
  readonly code: LakehouseEngineErrorCode

  /**
   * @param message - operator-facing reason.
   * @param code - the structured error code.
   * @param cause - the underlying failure, when present.
   */
  constructor(message: string, code: LakehouseEngineErrorCode, options?: { cause?: unknown }) {
    super(message, options)
    this.name = 'LakehouseEngineError'
    this.code = code
  }
}

/** Constructor options; every field is deployment-configurable. */
export interface LakehouseEngineOptions {
  readonly catalog: LakehouseCatalogConfig
  /** DuckDB memory limit in MB; omitted = DuckDB's own default. */
  readonly memoryLimitMb?: number
  /** DuckDB worker-thread count; omitted = DuckDB's own default. */
  readonly threads?: number
  /** Read-query row cap; defaults to {@link DEFAULT_MAX_ROWS}. */
  readonly maxRows?: number
  /** Read-query time budget in ms; defaults to {@link DEFAULT_QUERY_TIMEOUT_MS}. */
  readonly queryTimeoutMs?: number
  /** Try `INSTALL` when an extension `LOAD` fails; defaults to true. */
  readonly extensionAutoinstall?: boolean
}

/** Default read-query row cap. */
export const DEFAULT_MAX_ROWS = 200

/** Default read-query time budget (ms). */
export const DEFAULT_QUERY_TIMEOUT_MS = 30_000

/** Injection points for engine construction (native-module failure testing). */
export interface LakehouseEngineDeps {
  /** Dynamic loader for the DuckDB native module; defaults to a real `import()`. */
  readonly importDuckDb?: () => Promise<DuckDbModule>
}

/** One column in a lakehouse table listing or description. */
export interface LakehouseColumnDesc {
  readonly name: string
  readonly sqlType: string
}

/** One lakehouse table: schema-qualified name plus live row count. */
export interface LakehouseTableSummary {
  readonly schema: string
  readonly table: string
  readonly rowCount: number
}

/** A read query's outcome: columns, JSON-scalar rows, and the truncation flag. */
export interface LakehouseQueryOutcome {
  readonly columns: readonly LakehouseColumnDesc[]
  readonly rows: (null | boolean | number | string)[][]
  readonly rowCount: number
  readonly truncated: boolean
}

/** Resolved read-query execution options. */
export interface QueryOptions {
  readonly maxRows: number
  readonly timeoutMs: number
}

/** A structured reference to one table in an attached source catalog. */
export interface SourceTableRef {
  /** Attach alias of the source (for example the sync pipeline's postgres attach). */
  readonly catalog: string
  readonly schema: string
  readonly table: string
}

/** SQL identifier shape every structured reference must satisfy. */
const IDENTIFIER_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/u

/** Fixed lakehouse-internal state table (sync watermarks and cursors); no caller input reaches it. */
const STATE_TABLE = `${LAKE_ALIAS}.main._dsh_lake_state`

/**
 * Normalize one DuckDB JS value for JSON-shaped consumers: aggregates arrive
 * as `bigint`, dates as `Date`; everything JSON-native passes through.
 */
function normalizeCell(value: unknown): null | boolean | number | string {
  if (value === null || value === undefined) return null
  if (typeof value === 'bigint') {
    const narrowed = Number(value)
    return Number.isSafeInteger(narrowed) ? narrowed : value.toString()
  }
  if (value instanceof Date) return value.toISOString()
  if (typeof value === 'boolean' || typeof value === 'number' || typeof value === 'string') return value
  return String(value)
}

function throwIfAborted(signal: AbortSignal | undefined): void {
  // An aborted AbortSignal always carries a reason per the WHATWG standard.
  /* v8 ignore next 2 */
  if (signal?.aborted) throw signal.reason ?? new DOMException('The operation was aborted', 'AbortError')
}

/**
 * The lakehouse engine service. One instance per context; the DuckDB native
 * module loads in {@link LakehouseEngineService.open}, never at module top
 * level, so a missing binding degrades to `available() === false` (every
 * surface method then fails loud with `LAKEHOUSE_ENGINE_UNAVAILABLE`)
 * instead of breaking composition load.
 */
export class LakehouseEngineService extends Service {
  private instance: DuckDBInstance | undefined
  private loadFailure: string | undefined
  private opening: Promise<void> | undefined
  private disposed = false
  private readonly options: Required<Pick<LakehouseEngineOptions, 'maxRows' | 'queryTimeoutMs' | 'extensionAutoinstall'>>
    & LakehouseEngineOptions
  private readonly importDuckDb: () => Promise<DuckDbModule>

  /**
   * @param ctx - the owning context; the service registers as `ctx.lakehouseEngine`.
   * @param options - the validated engine configuration.
   * @param deps - injection points for tests.
   */
  constructor(ctx: Context, options: LakehouseEngineOptions, deps: LakehouseEngineDeps = {}) {
    super(ctx, 'lakehouseEngine')
    this.options = {
      ...options,
      maxRows: options.maxRows ?? DEFAULT_MAX_ROWS,
      queryTimeoutMs: options.queryTimeoutMs ?? DEFAULT_QUERY_TIMEOUT_MS,
      extensionAutoinstall: options.extensionAutoinstall ?? true,
    }
    this.importDuckDb = deps.importDuckDb ?? (async () => await import('@duckdb/node-api'))
  }

  /** True when the DuckDB instance is live and the catalog is attached. */
  available(): boolean {
    return this.instance !== undefined && !this.disposed
  }

  /** The recorded native-module or open failure, for diagnostics. */
  openFailure(): string | undefined {
    return this.loadFailure
  }

  /**
   * Load the native module, create the `:memory:` instance, and attach the
   * configured catalog. Idempotent and concurrency-safe: concurrent callers
   * share one open. A missing native module leaves the engine unavailable
   * (degraded mode); a catalog attach failure on a working instance is a
   * configuration error and fails loud.
   */
  async open(): Promise<void> {
    if (this.disposed) return
    this.opening ??= this.doOpen()
    try {
      await this.opening
    } finally {
      this.opening = undefined
    }
  }

  private async doOpen(): Promise<void> {
    let instance: DuckDBInstance
    try {
      const duckdb = await this.importDuckDb()
      instance = await duckdb.DuckDBInstance.create(':memory:', {
        ...(this.options.memoryLimitMb === undefined ? {} : { memory_limit: `${String(this.options.memoryLimitMb)}MB` }),
        ...(this.options.threads === undefined ? {} : { threads: String(this.options.threads) }),
      })
    } catch (cause: unknown) {
      this.loadFailure = String(cause)
      return
    }
    try {
      const connection = await instance.connect()
      try {
        const catalogPath = resolve(this.options.catalog.catalogPath)
        const dataPath = resolve(this.options.catalog.dataPath ?? dirname(this.options.catalog.catalogPath))
        await mkdir(dirname(catalogPath), { recursive: true })
        await mkdir(dataPath, { recursive: true })
        const attach = resolveCatalogAttach(this.options.catalog, catalogPath, dataPath)
        for (const load of attach.extensionLoads) {
          try {
            await connection.run(load)
          } catch (error: unknown) {
            if (!this.options.extensionAutoinstall) throw error
            // The extension name comes from this package's own LOAD statements.
            await connection.run(`INSTALL ${load.split(/\s+/u).at(-1) ?? 'ducklake'}`)
            await connection.run(load)
          }
        }
        await connection.run(attach.attachSql)
      } finally {
        connection.disconnectSync()
      }
    } catch (cause: unknown) {
      instance.closeSync()
      this.loadFailure = String(cause)
      throw new LakehouseEngineError(
        `attaching the lakehouse catalog failed: ${String(cause)}`,
        'LAKEHOUSE_ENGINE_UNAVAILABLE',
        { cause },
      )
    }
    this.instance = instance
  }

  /** Close the shared instance; idempotent. Pending connections close with it. */
  close(): void {
    this.disposed = true
    this.instance?.closeSync()
    this.instance = undefined
  }

  /**
   * Run one read-only SQL statement over the attached lakehouse catalog. The
   * SQL guard rejects anything that is not a single read statement; the row
   * cap and time budget bound the result; references use
   * `lake.<schema>.<table>`.
   * @param sql - the statement text.
   * @param overrides - per-call row/time budget overrides (never above the configured caps).
   * @param signal - cancellation signal checked before and during execution.
   * @returns the columns, JSON-scalar rows cut to the row cap, and the truncation flag.
   */
  async query(sql: string, overrides?: Partial<QueryOptions>, signal?: AbortSignal): Promise<LakehouseQueryOutcome> {
    assertReadOnlySql(sql)
    const maxRows = Math.max(1, Math.min(overrides?.maxRows ?? this.options.maxRows, this.options.maxRows))
    const timeoutMs = Math.max(1, overrides?.timeoutMs ?? this.options.queryTimeoutMs)
    throwIfAborted(signal)
    const connection = await this.connect()
    try {
      const capped = await this.runCapped(connection, sql, maxRows, timeoutMs, signal)
      return {
        columns: capped.columns,
        rows: capped.rows.slice(0, maxRows).map(row => [...row] as (null | boolean | number | string)[]),
        rowCount: Math.min(capped.rows.length, maxRows),
        truncated: capped.rows.length > maxRows,
      }
    } catch (error: unknown) {
      throw this.toEngineError(error)
    } finally {
      connection.disconnectSync()
    }
  }

  /**
   * List every lakehouse table with its live row count, ordered by schema
   * then table. System schemas stay hidden.
   * @param signal - cancellation signal.
   */
  async listTables(signal?: AbortSignal): Promise<readonly LakehouseTableSummary[]> {
    throwIfAborted(signal)
    const connection = await this.connect()
    try {
      const listed = await this.runCapped(connection,
        'SELECT schema_name, table_name FROM duckdb_tables() '
        + `WHERE database_name = '${LAKE_ALIAS}' AND schema_name <> 'main' `
        + 'ORDER BY schema_name, table_name',
        this.options.maxRows * 50, this.options.queryTimeoutMs, signal)
      const summaries: LakehouseTableSummary[] = []
      for (const row of listed.rows) {
        const schema = String(row[0])
        const table = String(row[1])
        const counted = await this.runCapped(connection,
          `SELECT count(*) FROM ${LAKE_ALIAS}.${quoteIdentifier(schema)}.${quoteIdentifier(table)}`,
          1, this.options.queryTimeoutMs, signal)
        summaries.push({ schema, table, rowCount: Number(counted.rows[0]?.[0] ?? 0) })
      }
      return summaries
    } catch (error: unknown) {
      throw this.toEngineError(error)
    } finally {
      connection.disconnectSync()
    }
  }

  /**
   * Describe one lakehouse table: ordered column names and DuckDB types.
   * @param schema - the table's schema inside the lakehouse catalog.
   * @param table - the table name.
   * @param signal - cancellation signal.
   */
  async describeTable(schema: string, table: string, signal?: AbortSignal): Promise<readonly LakehouseColumnDesc[]> {
    assertIdentifier(schema)
    assertIdentifier(table)
    throwIfAborted(signal)
    const connection = await this.connect()
    try {
      const described = await this.runCapped(connection,
        `DESCRIBE ${LAKE_ALIAS}.${quoteIdentifier(schema)}.${quoteIdentifier(table)}`,
        512, this.options.queryTimeoutMs, signal)
      return described.rows.map(row => ({ name: String(row[0]), sqlType: String(row[1]) }))
    } catch (error: unknown) {
      throw this.toEngineError(error)
    } finally {
      connection.disconnectSync()
    }
  }

  /**
   * Read up to `limit` sample rows from one lakehouse table, in stable
   * storage order.
   * @param schema - the table's schema inside the lakehouse catalog.
   * @param table - the table name.
   * @param limit - the sample size, cut to the configured row cap.
   * @param signal - cancellation signal.
   */
  async sampleRows(schema: string, table: string, limit: number, signal?: AbortSignal): Promise<LakehouseQueryOutcome> {
    assertIdentifier(schema)
    assertIdentifier(table)
    const capped = Math.max(1, Math.min(limit, this.options.maxRows))
    return await this.query(
      `SELECT * FROM ${LAKE_ALIAS}.${quoteIdentifier(schema)}.${quoteIdentifier(table)} LIMIT ${String(capped)}`,
      undefined,
      signal,
    )
  }

  /**
   * Create a schema inside the lakehouse catalog when absent.
   * @param schema - the schema name (a validated identifier).
   * @param signal - cancellation signal.
   */
  async createSchema(schema: string, signal?: AbortSignal): Promise<void> {
    assertIdentifier(schema)
    throwIfAborted(signal)
    await this.execInternal(`CREATE SCHEMA IF NOT EXISTS ${LAKE_ALIAS}.${quoteIdentifier(schema)}`, signal)
  }

  /**
   * Replace one lakehouse table with the contents of a Parquet file (the
   * legacy ingest path). Same-table re-runs replace, so the operation is
   * idempotent.
   * @param schema - target schema inside the lakehouse catalog.
   * @param table - target table name.
   * @param parquetPath - the Parquet file to read (workspace-relative or absolute).
   * @param signal - cancellation signal.
   */
  async ingestParquet(schema: string, table: string, parquetPath: string, signal?: AbortSignal): Promise<void> {
    assertIdentifier(schema)
    assertIdentifier(table)
    throwIfAborted(signal)
    await this.execInternal(
      `CREATE OR REPLACE TABLE ${LAKE_ALIAS}.${quoteIdentifier(schema)}.${quoteIdentifier(table)} AS `
      + `SELECT * FROM read_parquet(${quoteString(resolve(parquetPath))})`,
      signal,
    )
  }

  /**
   * Create one schema-only (zero-row) table from explicit column definitions
   * — the legacy path for source tables that export no data file.
   * @param schema - target schema inside the lakehouse catalog.
   * @param table - target table name.
   * @param columns - ordered name/type pairs.
   * @param signal - cancellation signal.
   */
  async createSchemaOnlyTable(schema: string, table: string, columns: readonly LakehouseColumnDesc[], signal?: AbortSignal): Promise<void> {
    assertIdentifier(schema)
    assertIdentifier(table)
    throwIfAborted(signal)
    const ddl = columns.map(column => `${quoteIdentifier(column.name)} ${column.sqlType}`).join(', ')
    await this.execInternal(
      `CREATE OR REPLACE TABLE ${LAKE_ALIAS}.${quoteIdentifier(schema)}.${quoteIdentifier(table)} (${ddl})`,
      signal,
    )
  }

  /**
   * Attach a PostgreSQL database read-only under one alias, for the sync
   * pipeline's source reads. The attach is `READ_ONLY`, so no statement on
   * this alias can mutate the source.
   * @param alias - the attach alias (a validated identifier).
   * @param dsn - the libpq connection string.
   * @param signal - cancellation signal.
   */
  async attachPostgres(alias: string, dsn: string, signal?: AbortSignal): Promise<void> {
    assertIdentifier(alias)
    throwIfAborted(signal)
    const connection = await this.connect()
    try {
      try {
        await connection.run('LOAD postgres')
      } catch (error: unknown) {
        if (!this.options.extensionAutoinstall) throw error
        await connection.run('INSTALL postgres')
        await connection.run('LOAD postgres')
      }
      await connection.run(`ATTACH ${quoteString(dsn)} AS ${quoteIdentifier(alias)} (TYPE postgres, READ_ONLY)`)
    } catch (error: unknown) {
      throw this.toEngineError(error)
    } finally {
      connection.disconnectSync()
    }
  }

  /** Drop one attached source alias; a missing alias is a no-op. */
  async detach(alias: string, signal?: AbortSignal): Promise<void> {
    assertIdentifier(alias)
    throwIfAborted(signal)
    try {
      await this.execInternal(`DETACH ${quoteIdentifier(alias)}`, signal)
    } catch (error: unknown) {
      if (String(error).includes('not attached')) return
      throw error
    }
  }

  /**
   * Replace one lakehouse table with the full current contents of one
   * attached source table (the full-replace sync mode).
   * @param schema - target schema inside the lakehouse catalog.
   * @param table - target table name.
   * @param source - the structured source reference.
   * @param signal - cancellation signal.
   */
  async replaceTableFromSource(schema: string, table: string, source: SourceTableRef, signal?: AbortSignal): Promise<void> {
    assertIdentifier(schema)
    assertIdentifier(table)
    assertSourceRef(source)
    throwIfAborted(signal)
    await this.execInternal(
      `CREATE OR REPLACE TABLE ${LAKE_ALIAS}.${quoteIdentifier(schema)}.${quoteIdentifier(table)} AS `
      + `SELECT * FROM ${quoteIdentifier(source.catalog)}.${quoteIdentifier(source.schema)}.${quoteIdentifier(source.table)}`,
      signal,
    )
  }

  /**
   * Append the source rows whose watermark column exceeds `fromValue` into
   * one lakehouse table, returning the appended row count. The comparison is
   * type-implicit: the literal is parsed as the column's type.
   * @param schema - target schema inside the lakehouse catalog.
   * @param table - target table name.
   * @param source - the structured source reference.
   * @param watermarkColumn - the source column holding the change cursor.
   * @param fromValue - the exclusive lower bound (the persisted watermark).
   * @param signal - cancellation signal.
   * @returns the number of appended rows.
   */
  async appendIncremental(
    schema: string,
    table: string,
    source: SourceTableRef,
    watermarkColumn: string,
    fromValue: string | null,
    signal?: AbortSignal,
  ): Promise<number> {
    assertIdentifier(schema)
    assertIdentifier(table)
    assertSourceRef(source)
    assertIdentifier(watermarkColumn)
    throwIfAborted(signal)
    const bound = fromValue === null ? '' : ` WHERE ${quoteIdentifier(watermarkColumn)} > ${quoteString(fromValue)}`
    const connection = await this.connect()
    try {
      const target = `${LAKE_ALIAS}.${quoteIdentifier(schema)}.${quoteIdentifier(table)}`
      const origin = `${quoteIdentifier(source.catalog)}.${quoteIdentifier(source.schema)}.${quoteIdentifier(source.table)}`
      // DuckLake has no INSERT … RETURNING, so the append count comes from a
      // bounded pre-count of the rows the watermark selects.
      const counted = await this.runCapped(connection,
        `SELECT count(*) FROM (SELECT * FROM ${origin}${bound})`,
        1, this.options.queryTimeoutMs, signal)
      const exists = await this.runCapped(connection,
        'SELECT count(*) FROM duckdb_tables() '
      + `WHERE database_name = '${LAKE_ALIAS}' AND schema_name = ${quoteString(schema)} AND table_name = ${quoteString(table)}`,
        1, this.options.queryTimeoutMs, signal)
      if (Number(exists.rows[0]?.[0] ?? 0) === 0) {
        await connection.run(`CREATE TABLE ${target} AS SELECT * FROM ${origin}${bound}`)
        return Number(counted.rows[0]?.[0] ?? 0)
      }
      await connection.run(`INSERT INTO ${target} SELECT * FROM ${origin}${bound}`)
      return Number(counted.rows[0]?.[0] ?? 0)
    } catch (error: unknown) {
      throw this.toEngineError(error)
    } finally {
      connection.disconnectSync()
    }
  }

  /**
   * Read the maximum value of one source table's watermark column (the next
   * watermark to persist after a sync pass).
   * @param source - the structured source reference.
   * @param watermarkColumn - the source column holding the change cursor.
   * @param signal - cancellation signal.
   * @returns the maximum value in its DuckDB text form, or null on an empty source.
   */
  async readSourceWatermark(source: SourceTableRef, watermarkColumn: string, signal?: AbortSignal): Promise<string | null> {
    assertSourceRef(source)
    assertIdentifier(watermarkColumn)
    throwIfAborted(signal)
    const connection = await this.connect()
    try {
      const origin = `${quoteIdentifier(source.catalog)}.${quoteIdentifier(source.schema)}.${quoteIdentifier(source.table)}`
      // The VARCHAR cast lands the watermark in its SQL text form: a plain
      // max() over an attached source returns engine-internal epoch bigints
      // for timestamp columns, which would not round-trip as a comparison
      // literal.
      const read = await this.runCapped(connection,
        `SELECT max(${quoteIdentifier(watermarkColumn)})::VARCHAR FROM ${origin}`,
        1, this.options.queryTimeoutMs, signal)
      const value = read.rows[0]?.[0]
      return value === null || value === undefined ? null : String(value)
    } catch (error: unknown) {
      throw this.toEngineError(error)
    } finally {
      connection.disconnectSync()
    }
  }

  /**
   * Read one persisted sync-state value from the lakehouse-internal state
   * table, creating the table on first use.
   * @param key - the state key (the sync pipeline namespaces its own keys).
   * @param signal - cancellation signal.
   * @returns the stored value, or null when the key has no entry.
   */
  async readState(key: string, signal?: AbortSignal): Promise<string | null> {
    throwIfAborted(signal)
    const connection = await this.connect()
    try {
      await this.ensureStateTable(connection)
      const read = await this.runCapped(connection,
        `SELECT value FROM ${STATE_TABLE} WHERE key = ${quoteString(key)}`,
        1, this.options.queryTimeoutMs, signal)
      const value = read.rows[0]?.[0]
      return value === undefined ? null : String(value)
    } catch (error: unknown) {
      throw this.toEngineError(error)
    } finally {
      connection.disconnectSync()
    }
  }

  /**
   * Persist one sync-state value (upsert by key).
   * @param key - the state key.
   * @param value - the value to persist.
   * @param signal - cancellation signal.
   */
  async writeState(key: string, value: string, signal?: AbortSignal): Promise<void> {
    throwIfAborted(signal)
    const connection = await this.connect()
    try {
      await this.ensureStateTable(connection)
      await connection.run(`DELETE FROM ${STATE_TABLE} WHERE key = ${quoteString(key)}`)
      await connection.run(
        `INSERT INTO ${STATE_TABLE} (key, value, updated_at) `
      + `VALUES (${quoteString(key)}, ${quoteString(value)}, now())`,
      )
    } catch (error: unknown) {
      throw this.toEngineError(error)
    } finally {
      connection.disconnectSync()
    }
  }

  /**
   * Run one engine-internal read (metadata listings, column probing). The
   * statement is constructed exclusively by this package and the sync
   * pipeline — never from model or UI input — so the read-only row cap does
   * not apply; the internal safety cap stays at 100000 rows.
   * @param sql - the statement text.
   * @param signal - cancellation signal.
   * @returns the columns and full JSON-scalar row set.
   */
  async readInternal(sql: string, signal?: AbortSignal): Promise<{ columns: LakehouseColumnDesc[]; rows: (null | boolean | number | string)[][] }> {
    throwIfAborted(signal)
    const connection = await this.connect()
    try {
      return await this.runCapped(connection, sql, 100_000, this.options.queryTimeoutMs, signal)
    } catch (error: unknown) {
      throw this.toEngineError(error)
    } finally {
      connection.disconnectSync()
    }
  }

  /**
   * Run one engine-internal maintenance statement. These statements are
   * constructed exclusively by this package and the sync pipeline — never
   * from model or UI input — so no read-only guard applies.
   * @param sql - the statement text.
   * @param signal - cancellation signal.
   */
  async execInternal(sql: string, signal?: AbortSignal): Promise<void> {
    throwIfAborted(signal)
    const connection = await this.connect()
    try {
      await this.withTimeout(connection, async () => await connection.run(sql), this.options.queryTimeoutMs)
    } catch (error: unknown) {
      throw this.toEngineError(error)
    } finally {
      connection.disconnectSync()
    }
  }

  /** One fresh connection from the shared instance; unavailable fails loud. */
  private async connect(): Promise<DuckDBConnection> {
    if (this.instance === undefined || this.disposed) {
      const detail = this.loadFailure === undefined ? '' : ` (${this.loadFailure})`
      throw new LakehouseEngineError(
        `the lakehouse engine is unavailable${detail}`,
        'LAKEHOUSE_ENGINE_UNAVAILABLE',
      )
    }
    return await this.instance.connect()
  }

  /** Create the internal state table when absent; DuckLake rejects key constraints, so upserts run as delete-then-insert. */
  private async ensureStateTable(connection: DuckDBConnection): Promise<void> {
    await connection.run(
      `CREATE TABLE IF NOT EXISTS ${STATE_TABLE} (key TEXT, value TEXT, updated_at TIMESTAMPTZ)`,
    )
  }

  /**
   * Run one read with the row cap applied: `SELECT`/`WITH` statements wrap in
   * a subquery with `LIMIT cap + 1`; `PRAGMA`/`DESCRIBE` run bare and are cut
   * afterwards (their result sets are small by construction).
   */
  private async runCapped(
    connection: DuckDBConnection,
    sql: string,
    maxRows: number,
    timeoutMs: number,
    signal?: AbortSignal,
  ): Promise<{ columns: LakehouseColumnDesc[]; rows: (null | boolean | number | string)[][] }> {
    throwIfAborted(signal)
    const wrapped = /^(?:SELECT|WITH)\b/iu.test(sql.trim())
      ? `SELECT * FROM (${sql.trim().replace(/;\s*$/u, '')}) LIMIT ${String(maxRows + 1)}`
      : sql
    const reader = await this.withTimeout(connection, async () => await connection.runAndReadAll(wrapped), timeoutMs)
    const columns = reader.columnNames().map((name, index) => ({ name, sqlType: String(reader.columnType(index)) }))
    const rows = reader.getRowsJS().map(row => row.map(normalizeCell) as (null | boolean | number | string)[])
    return { columns, rows }
  }

  /** Race one connection operation against the time budget, interrupting DuckDB on expiry. */
  private async withTimeout<T>(
    connection: DuckDBConnection,
    operation: () => Promise<T>,
    timeoutMs: number,
  ): Promise<T> {
    let timer: NodeJS.Timeout | undefined
    const expired = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        try {
          connection.interrupt()
        } catch {
          // A disposed connection rejects the operation itself; nothing
          // else can reach this interrupt.
        }
        reject(new LakehouseEngineError(
          `the lakehouse query exceeded its ${String(timeoutMs)}ms budget and was interrupted`,
          'LAKEHOUSE_ENGINE_TIMEOUT',
        ))
      }, timeoutMs)
    })
    try {
      return await Promise.race([operation(), expired])
    } finally {
      clearTimeout(timer)
    }
  }

  /** Map an arbitrary DuckDB failure onto the structured engine error, preserving guard rejections. */
  private toEngineError(error: unknown): unknown {
    if (error instanceof LakehouseEngineError || error instanceof SqlGuardError) return error
    return new LakehouseEngineError(`the lakehouse engine operation failed: ${String(error)}`, 'LAKEHOUSE_ENGINE_QUERY_FAILED', { cause: error })
  }
}

/** Reject identifiers that are not plain SQL identifier shapes. */
function assertIdentifier(name: string): void {
  if (!IDENTIFIER_PATTERN.test(name)) {
    throw new LakehouseEngineError(
      `"${name}" is not a plain SQL identifier; quoted or decorated names are not accepted`,
      'LAKEHOUSE_ENGINE_INVALID_IDENTIFIER',
    )
  }
}

/** Validate one structured source reference. */
function assertSourceRef(source: SourceTableRef): void {
  assertIdentifier(source.catalog)
  assertIdentifier(source.schema)
  assertIdentifier(source.table)
}
