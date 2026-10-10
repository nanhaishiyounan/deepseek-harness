/**
 * carbon domain contract: the business-system surface over the carbon
 * PostgREST session client (`ctx.carbon`) — the catalog roster, filtered row
 * queries, single-row reads, and single-table writes for the business page's
 * data source. Writes ride the connector's write-tier gating and tenant
 * injection; the composite posting server-functions stay on the carbon UI.
 * The domain is deliberately NOT gated on a composed capability: a
 * deployment that has not opted in through `carbonEnabled` keeps a working
 * gateway, and every method fails with the structured `carbon-not-composed`
 * error instead.
 */

import type { RpcRequest, RpcResponse } from './rpc.ts'

/** One catalog table definition as `carbon.listMeta` projects it. */
export interface CarbonTableMetaView {
  readonly table: string
  readonly label: string
  readonly module: string
  readonly risk: 'read' | 'write'
  readonly id_column: string
  readonly key_columns: readonly string[]
}

/** One business row; cells stay opaque JSON until the boundary. */
export type CarbonRowView = Record<string, unknown>

/** `carbon.list` response: the page envelope. */
export interface CarbonRowPageView {
  readonly count: number
  readonly offset: number
  readonly limit: number
  readonly rows: readonly CarbonRowView[]
}

/** One restricted filter condition (the same vocabulary the cb_* tools accept). */
export interface CarbonFilterConditionView {
  readonly field: string
  readonly op: 'eq' | 'neq' | 'gt' | 'lt' | 'gte' | 'lte' | 'like' | 'ilike' | 'in' | 'is'
  /** Scalar for the comparison ops; `true`/`false`/`null` for is; a non-empty array for in; a wildcard pattern for like/ilike. */
  readonly value: string | number | boolean | null | readonly (string | number | boolean)[]
}

/**
 * carbon business-system methods; every call fails loud when the deployment
 * has not enabled the domain or the carbon service resolves no credentials.
 */
export interface CarbonApi {
  /** List the business-table catalog (module groups in navigation order). */
  listMeta(
    request: RpcRequest<Record<string, never>>,
    signal?: AbortSignal,
  ): Promise<RpcResponse<{ tables: readonly CarbonTableMetaView[] }>>

  /**
   * Query one catalog table's rows with the restricted filter vocabulary,
   * ordering, and limit/offset paging.
   */
  list(
    request: RpcRequest<{
      table: string
      filter?: readonly CarbonFilterConditionView[]
      order?: readonly string[]
      limit?: number
      offset?: number
    }>,
    signal?: AbortSignal,
  ): Promise<RpcResponse<CarbonRowPageView>>

  /**
   * Read one row by table and id (the table's `id_column`); a missing row
   * fails with `carbon-row-missing`, an off-catalog table with
   * `carbon-table-unknown`.
   */
  get(
    request: RpcRequest<{ table: string; id: string }>,
    signal?: AbortSignal,
  ): Promise<RpcResponse<{ table: string; row: CarbonRowView }>>

  /**
   * Insert one row into a write-tier catalog table. The tenant companyId is
   * injected by the connector; a read-tier table fails with
   * `carbon-write-refused`.
   */
  create(
    request: RpcRequest<{ table: string; values: Record<string, unknown> }>,
    signal?: AbortSignal,
  ): Promise<RpcResponse<{ table: string; row: CarbonRowView }>>

  /**
   * Patch named columns of one row in a write-tier catalog table; the same
   * tier rule as `create`.
   */
  update(
    request: RpcRequest<{ table: string; id: string; values: Record<string, unknown> }>,
    signal?: AbortSignal,
  ): Promise<RpcResponse<{ table: string; row: CarbonRowView }>>
}
