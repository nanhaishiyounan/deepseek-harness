/**
 * lakehouse domain contract: the overview-home KPI band. One read answers
 * with the deployment-configured KPI definitions (a JSON seed file, the same
 * operations seat as the market featured rail) executed live against the
 * optional `ctx.lakehouse` seam — real aggregates, never baked numbers. The
 * seam is deliberately NOT in the gateway's inject list: a deployment without
 * it keeps a working gateway and the overview fails with the structured
 * `lakehouse-not-composed` error. A KPI whose SQL fails degrades per item
 * (its error text rides the row), never failing the batch.
 */

import type { RpcRequest, RpcResponse } from './rpc.ts'

/** One KPI chip the overview band renders. */
export interface LakehouseKpiView {
  /** Stable id (the seed file's key; the client may map it to locale copy). */
  readonly id: string
  /** Display label from the seed file (deployment content, like market copy). */
  readonly label: string
  /** First numeric cell of the SQL's first row; 0 when the row has none. */
  readonly value: number
  /** Optional unit suffix from the seed file (for example `万美元`). */
  readonly unit?: string
  /** Second numeric cell when present: percent change vs the prior period. */
  readonly trend?: number
  /** Per-item failure text (the SQL failed or returned no row). */
  readonly error?: string
}

/** The overview read's value. */
export interface LakehouseOverviewView {
  /** ISO-8601 timestamp of this evaluation. */
  readonly generated_at: string
  /** The KPI chips in seed-file order. */
  readonly kpis: readonly LakehouseKpiView[]
}

/** One lakehouse table in the `lakehouse.tables` listing. */
export interface LakehouseTableEntry {
  /** The schema-qualified reference form queries use (`lake.<schema>.<table>`). */
  readonly ref: string
  readonly schema: string
  readonly table: string
  readonly row_count: number
}

/** The `lakehouse.tables` read's value. */
export interface LakehouseTablesView {
  readonly tables: readonly LakehouseTableEntry[]
}

/** One column in a query result or schema description. */
export interface LakehouseColumnView {
  readonly name: string
  readonly type: string
}

/** The `lakehouse.query` read's value. */
export interface LakehouseQueryView {
  readonly sql: string
  readonly columns: readonly LakehouseColumnView[]
  /** JSON-scalar result cells. */
  readonly rows: (null | boolean | number | string)[][]
  readonly row_count: number
  readonly truncated: boolean
}

/** The `lakehouse.schema` read's value. */
export interface LakehouseSchemaView {
  readonly ref: string
  readonly columns: readonly LakehouseColumnView[]
  readonly row_count: number
  readonly sample_rows: (null | boolean | number | string)[][]
}

/** Lakehouse domain methods; every call fails loud when unconfigured. */
export interface LakehouseApi {
  /**
   * Evaluate the configured KPI definitions against the lakehouse seam and
   * return the band's chips.
   */
  overview(request: RpcRequest<Record<string, never>>, signal?: AbortSignal): Promise<RpcResponse<LakehouseOverviewView>>
  /** List every lakehouse table with its live row count. */
  tables(request: RpcRequest<Record<string, never>>, signal?: AbortSignal): Promise<RpcResponse<LakehouseTablesView>>
  /**
   * Run one read-only SQL statement over the lakehouse catalog; the engine's
   * statement guard rejects writes and multi-statement text.
   */
  query(request: RpcRequest<{ sql: string }>, signal?: AbortSignal): Promise<RpcResponse<LakehouseQueryView>>
  /** Read one table's columns, row count, and sample rows. */
  schema(request: RpcRequest<{ schema: string; table: string }>, signal?: AbortSignal): Promise<RpcResponse<LakehouseSchemaView>>
}
