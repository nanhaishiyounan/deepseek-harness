/**
 * orders domain contract: the expert-service order surface over the host's
 * optional `ctx.orders` capability (the NocoBase-backed orders seam). Like
 * the kb and data domains, the seam is deliberately NOT in the gateway's
 * inject list: a deployment that composes no orders keeps a working gateway,
 * and every method fails with the structured `orders-not-composed` error.
 * Writes (create/fulfill) additionally refuse until the deployment opts in
 * through `ordersEnabled` — an order is a real transaction against an expert
 * service, not a free-form upload.
 */

import type { RpcRequest, RpcResponse } from './rpc.ts'

/** Order lifecycle statuses as the wire projects them (closed set). */
export type OrderStatusView = 'pending' | 'generating' | 'delivered' | 'failed'

/** One order row as the wire projects it (snake_case mirror of the seam's record). */
export interface OrderView {
  readonly id: number
  readonly order_no: string
  readonly service_id: string
  readonly service_name: string
  readonly price?: string
  readonly brief: string
  readonly client_name?: string
  readonly expert_name?: string
  readonly expert_org?: string
  readonly status: OrderStatusView
  readonly error?: string
  readonly deliverable_path?: string
  /** Storage-relative url NocoBase serves the uploaded deliverable attachment under. */
  readonly deliverable_url?: string
  readonly generated_at?: string
  readonly note?: string
  readonly created_at: string
}

/** Expert-service order methods; every call fails loud when no orders capability is composed. */
export interface OrdersApi {
  /**
   * Place one order for an expert service: resolves the ordered service,
   * snapshots identity and pricing, and lands a `pending` order at the
   * source of truth.
   */
  create(
    request: RpcRequest<{ service_id: string; brief: string; client_name?: string }>,
    signal?: AbortSignal,
  ): Promise<RpcResponse<OrderView>>

  /** Read one order by id. */
  get(request: RpcRequest<{ order_id: number }>, signal?: AbortSignal): Promise<RpcResponse<OrderView>>

  /** List every order. */
  list(request: RpcRequest<Record<string, never>>, signal?: AbortSignal): Promise<RpcResponse<{ orders: readonly OrderView[] }>>

  /**
   * Run the deliverable pipeline (draft → typeset → land → deliver) for one
   * order; the NocoBase workflow's request-node callback (and the workbench)
   * both enter here.
   */
  fulfill(request: RpcRequest<{ order_id: number }>, signal?: AbortSignal): Promise<RpcResponse<OrderView>>

  /**
   * Stream one delivered order's PDF as a download response. Host-only:
   * the carrier's GET route answers this directly; the browser never calls
   * it through the RPC envelope.
   * @param request - the order id, whether the body is needed (HEAD omits
   * it), and `inline: true` to answer `Content-Disposition: inline` so an
   * in-page same-origin iframe can render the PDF (attachment otherwise).
   * @param signal - cancellation for the underlying read.
   * @returns the PDF download response (inline or attachment disposition);
   * a missing seam answers 500, an unknown or undelivered order 404.
   */
  download(request: { orderId: number; inline?: boolean }, signal: AbortSignal): Promise<Response>
}
