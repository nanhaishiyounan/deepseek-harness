/**
 * Order domain types: the closed status set's vocabulary, the NocoBase orders
 * row projection, request/result shapes, and the OrdersSeam contract every
 * consumer (tool-connector's order tools, the apiproxy orders domain) types
 * against. Pure types plus the OrdersError taxonomy — no runtime behavior
 * beyond the error class.
 * @module @deepseek-ai/dsh-expert-orders/types
 */

import { HarnessError } from '@deepseek-ai/dsh-llm'

/**
 * Order lifecycle statuses as the NocoBase source of truth stores them.
 * `pending` — created, no fulfillment attempt started. `generating` — a
 * fulfill pipeline run is drafting and typesetting. `delivered` — the PDF
 * deliverable landed and the order row carries its path (terminal).
 * `failed` — the last fulfill attempt threw; the recorded `error` names the
 * cause and a new attempt may retry.
 */
export type OrderStatus = 'pending' | 'generating' | 'delivered' | 'failed'

/**
 * One order row as the NocoBase `orders` collection stores it. Field names
 * are the wire's (camelCase, like `expert_services` rows); service name and
 * pricing are snapshots taken at creation, never re-read from the catalog.
 */
export interface OrderRecord {
  readonly id: number
  /** Generated order number (`ORD-YYYYMMDD-xxxx`), the deliverable file's stem. */
  readonly orderNo: string
  /** Ordered service dataset id (`expert_services/<row id>`). */
  readonly serviceId: string
  /** Service name snapshotted at creation. */
  readonly serviceName: string
  /** Service pricing snapshotted at creation. */
  readonly price?: string
  /** The client's need, verbatim. */
  readonly brief: string
  /** Client display name for the cover page. */
  readonly clientName?: string
  /** Expert name snapshotted at creation. */
  readonly expertName?: string
  /** Expert affiliation snapshotted at creation. */
  readonly expertOrg?: string
  /** Lifecycle status. */
  readonly status: OrderStatus
  /** Failure cause recorded by the last fulfill attempt, in `failed` status. */
  readonly error?: string
  /** Workspace-relative path of the landed deliverable (the local cache copy), in `delivered` status. */
  readonly deliverablePath?: string
  /**
   * Storage-relative url NocoBase serves the uploaded deliverable attachment
   * under (for example `/storage/uploads/ORD-....pdf`), in `delivered`
   * status; the attachment row itself hangs off the order's `deliverable`
   * attachment field. Empty when the backend could not attach.
   */
  readonly deliverableUrl?: string
  /** Uploaded deliverable attachment row ids hung off the order's attachment field. */
  readonly deliverable?: readonly number[]
  /** ISO timestamp of the delivered write-back. */
  readonly generatedAt?: string
  /** Order-level notes (for example the named template-fallback line). */
  readonly note?: string
  /** ISO creation timestamp. */
  readonly createdAt: string
}

/** One order-creation request. */
export interface OrderCreateRequest {
  /** Ordered service dataset id, as connector_discover surfaces it. */
  readonly serviceId: string
  /** The client's need in their own words; drives retrieval and drafting. */
  readonly brief: string
  /** Client display name for the cover page. */
  readonly clientName?: string
}

/** One landed deliverable read. */
export interface OrderDeliverableFile {
  /** Absolute path of the landed file. */
  readonly path: string
  /** The PDF bytes. */
  readonly bytes: Uint8Array
}

/**
 * The orders service contract: order lifecycle over the NocoBase source of
 * truth plus the deliverable pipeline. Every write lands at the source first;
 * a read reflects the stored row.
 */
export interface OrdersSeam {
  /**
   * Resolve the ordered service, snapshot its identity and pricing, and land
   * a `pending` order at the source.
   * @param request - the ordered service, brief, and optional client name.
   * @param signal - caller cancellation.
   * @returns the stored pending order.
   */
  create(request: OrderCreateRequest, signal?: AbortSignal): Promise<OrderRecord>

  /**
   * Read one order by its primary key.
   * @param orderId - the NocoBase orders row id.
   * @param signal - caller cancellation.
   * @returns the stored order, or `undefined` when the source has no such row.
   */
  get(orderId: number | string, signal?: AbortSignal): Promise<OrderRecord | undefined>

  /**
   * List orders (newest rows last, source order).
   * @param signal - caller cancellation.
   * @returns every stored order row.
   */
  list(signal?: AbortSignal): Promise<readonly OrderRecord[]>

  /**
   * Run the deliverable pipeline for one order: transition to `generating`,
   * retrieve kb references, draft the proposal (model stream or the named
   * template fallback), typeset it through expert-pdf, land the PDF under the
   * configured deliverables directory, and write `delivered` with the path
   * back at the source. A failure writes `failed` with the cause and
   * rethrows; a `failed` order may be fulfilled again (retry).
   * @param orderId - the NocoBase orders row id.
   * @param signal - caller cancellation.
   * @returns the stored order in `delivered` status.
   */
  fulfill(orderId: number | string, signal?: AbortSignal): Promise<OrderRecord>

  /**
   * Read one delivered order's PDF deliverable.
   * @param orderId - the NocoBase orders row id.
   * @param signal - caller cancellation.
   * @returns the landed file's path and bytes.
   */
  readDeliverable(orderId: number | string, signal?: AbortSignal): Promise<OrderDeliverableFile>
}

/** Order-domain failure taxonomy (open string codes, like the lakehouse seam). */
export class OrdersError extends HarnessError {}
