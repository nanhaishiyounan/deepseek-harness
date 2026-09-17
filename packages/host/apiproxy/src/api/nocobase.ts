/**
 * nocobase domain contract: the business-system read surface (schema
 * discovery, filtered row queries, single-row reads) over the shared
 * NocoBase REST client. Read-path first by design — writes to business
 * records go through the agent's nb_create/nb_update tools with the
 * in-conversation confirmation contract, never through the wire surface.
 * The domain is deliberately NOT gated on a composed capability: a
 * deployment that has not opted in through `nocobaseEnabled` keeps a
 * working gateway, and every method fails with the structured
 * `nocobase-not-composed` error instead.
 */

import type { RpcRequest, RpcResponse } from './rpc.ts'

/** One field definition as the wire projects a collection's schema. */
export interface NocobaseFieldView {
  readonly name: string
  readonly type: string
  readonly title?: string
  /** Relation fields: the target collection's name. */
  readonly target?: string
}

/** One collection definition as `nocobase.listMeta` projects it. */
export interface NocobaseCollectionMetaView {
  readonly name: string
  readonly title?: string
  /** True when the backend marks the collection hidden from UI listings. */
  readonly hidden?: boolean
  readonly filter_target_key?: string
  readonly fields: readonly NocobaseFieldView[]
}

/** One business row; cells stay opaque JSON until the boundary. */
export type NocobaseRowView = Record<string, unknown>

/** `nocobase.list` response: the page envelope. */
export interface NocobaseRowPageView {
  readonly count: number
  readonly page: number
  readonly page_size: number
  readonly rows: readonly NocobaseRowView[]
}

/** One restricted filter condition (the same eq/in/gt/lt/includes vocabulary the nb_* tools accept). */
export interface NocobaseFilterConditionView {
  readonly field: string
  readonly op: 'eq' | 'in' | 'gt' | 'lt' | 'includes'
  /** Scalar for eq/gt/lt/includes; non-empty array for in. */
  readonly value: string | number | boolean | readonly (string | number | boolean)[]
}

/**
 * Business-system read methods; every call fails loud when the deployment
 * has not enabled the domain or the service-account credentials resolve to
 * nothing.
 */
export interface NocobaseApi {
  /** List every collection definition the backend reports (schema discovery). */
  listMeta(
    request: RpcRequest<Record<string, never>>,
    signal?: AbortSignal,
  ): Promise<RpcResponse<{ collections: readonly NocobaseCollectionMetaView[] }>>

  /**
   * Query one collection's rows with the restricted filter vocabulary,
   * sorting, and paging.
   */
  list(
    request: RpcRequest<{
      collection: string
      filter?: readonly NocobaseFilterConditionView[]
      match?: 'and' | 'or'
      page?: number
      page_size?: number
      sort?: readonly string[]
      fields?: readonly string[]
    }>,
    signal?: AbortSignal,
  ): Promise<RpcResponse<NocobaseRowPageView>>

  /** Read one row by collection and id; a missing row fails with `nocobase-row-missing`. */
  get(
    request: RpcRequest<{ collection: string; id: number }>,
    signal?: AbortSignal,
  ): Promise<RpcResponse<{ collection: string; row: NocobaseRowView }>>
}
