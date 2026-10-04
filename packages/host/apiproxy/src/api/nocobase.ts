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
 *
 * Signed-in callers attach their `nocobase.signIn` session token
 * (`authToken`): the gateway resolves the business identity server-side and
 * enforces the per-user collection scope on reads and the credential
 * requirement on writes. Calls without a token stay anonymous reads (the PC
 * browse surface) and are refused on writes.
 */
export interface NocobaseApi {
  /** List every collection definition the backend reports (schema discovery). */
  listMeta(
    request: RpcRequest<Record<string, never>>,
    signal?: AbortSignal,
  ): Promise<RpcResponse<{ collections: readonly NocobaseCollectionMetaView[] }>>

  /**
   * Query one collection's rows with the restricted filter vocabulary,
   * sorting, and paging. A resolved `authToken` whose user's scope excludes
   * the collection fails with `nocobase-collection-forbidden`.
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
      authToken?: string
    }>,
    signal?: AbortSignal,
  ): Promise<RpcResponse<NocobaseRowPageView>>

  /**
   * Read one row by collection and id; a missing row fails with
   * `nocobase-row-missing`, an out-of-scope collection with
   * `nocobase-collection-forbidden`.
   */
  get(
    request: RpcRequest<{ collection: string; id: number; authToken?: string }>,
    signal?: AbortSignal,
  ): Promise<RpcResponse<{ collection: string; row: NocobaseRowView }>>

  /**
   * Patch one row's whitelisted low-risk fields inline (the business page's
   * 备注/数量/日期 fast path). Refused until the deployment opts in through
   * `nocobaseWriteEnabled` and the caller presents a valid sign-in session
   * token; higher-risk changes stay on the agent's nb_update confirmation
   * flow by contract. wfl_ engine collections refuse by default (their state
   * machines carry server-side transition whitelists) unless the caller's
   * username is whitelisted for the collection in `nocobaseWflWriteScopes`.
   */
  update(
    request: RpcRequest<{ collection: string; id: number; values: Record<string, string | number | null>; authToken?: string }>,
    signal?: AbortSignal,
  ): Promise<RpcResponse<{ collection: string; row: NocobaseRowView }>>

  /**
   * Act on one alert (claim/ack/resolve) through the engine's single write
   * entrance. The acting username derives from the sign-in session token
   * server-side; the engine's (from_state, action, actor_role) transition
   * table and routed-user whitelist decide — its 403 crosses as
   * `nocobase-alert-refused`, an unconfigured engine base URL as
   * `alert-engine-unconfigured`.
   */
  alertAct(
    request: RpcRequest<{ id: number; action: 'claim' | 'ack' | 'resolve'; note?: string; authToken?: string }>,
    signal?: AbortSignal,
  ): Promise<RpcResponse<{ id: number; action: 'claim' | 'ack' | 'resolve'; user: string }>>

  /**
   * Verify one business account's credentials against NocoBase's own
   * `auth:signIn` (the basic authenticator; username-or-email + password) and
   * answer the signed-in profile together with a gateway session token. The
   * token binds the verified identity server-side (never client-narrated):
   * prompts derive the acting user from it and nocobase reads/writes enforce
   * its scope. No NocoBase token crosses the wire; the gateway session
   * expires server-side. Wrong credentials fail with
   * `nocobase-signin-rejected`.
   */
  signIn(
    request: RpcRequest<{ account: string; password: string }>,
    signal?: AbortSignal,
  ): Promise<RpcResponse<{ username: string; nickname: string; token: string }>>
}
