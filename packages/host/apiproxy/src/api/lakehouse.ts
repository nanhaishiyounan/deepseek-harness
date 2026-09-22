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

/** Lakehouse overview methods; every call fails loud when unconfigured. */
export interface LakehouseApi {
  /**
   * Evaluate the configured KPI definitions against the lakehouse seam and
   * return the band's chips.
   */
  overview(request: RpcRequest<Record<string, never>>, signal?: AbortSignal): Promise<RpcResponse<LakehouseOverviewView>>
}
