/**
 * Pure row-model derivation for the `order_create`/`order_status` toolview
 * rows: the service id (create) or order id (status) off the call arguments,
 * the order receipt off the result's presentation meta, and the raw result
 * text as the expanded body. Everything here is a pure function of the
 * frozen call slice; malformed wire material degrades to the raw result
 * text rather than an empty card.
 * @module @deepseek-ai/dsh-client-ui-kb/client/toolviews/order-tool-model
 */

import type { ToolCallBlock } from '@deepseek-ai/dsh-client-runtime/client'
import { argsOf, firstLine, resultTextOf, stateOf } from './kb-tool-model.ts'
import type { KbToolRowState } from './kb-tool-model.ts'

/** The presentation meta `order_create` attaches to its result event. */
interface OrderCreateMeta {
  /** The order's numeric id; absent on sessions logged before it was projected. */
  readonly order_id?: number
  readonly order_no: string
  readonly status: string
  readonly service_name: string
  readonly deliverable_path?: string
}

/** The presentation meta `order_status` attaches to its result event. */
interface OrderStatusMeta {
  readonly orders: number
  readonly delivered: number
}

/** Narrow the opaque create meta; anything else is undefined and the row falls back to raw text. */
function createMetaOf(meta: unknown): OrderCreateMeta | undefined {
  if (typeof meta !== 'object' || meta === null || Array.isArray(meta)) return undefined
  const { order_id: orderId, order_no: orderNo, status, service_name: serviceName,
    deliverable_path: deliverablePath } = meta as Record<string, unknown>
  if (typeof orderNo !== 'string' || orderNo === '') return undefined
  if (typeof status !== 'string' || status === '') return undefined
  if (typeof serviceName !== 'string' || serviceName === '') return undefined
  return {
    ...(typeof orderId === 'number' && Number.isInteger(orderId) && orderId > 0 ? { order_id: orderId } : {}),
    order_no: orderNo,
    status,
    service_name: serviceName,
    ...(typeof deliverablePath === 'string' && deliverablePath !== '' ? { deliverable_path: deliverablePath } : {}),
  }
}

/** Narrow the opaque status meta; anything else is undefined and the row falls back to raw text. */
function statusMetaOf(meta: unknown): OrderStatusMeta | undefined {
  if (typeof meta !== 'object' || meta === null || Array.isArray(meta)) return undefined
  const { orders, delivered } = meta as Record<string, unknown>
  if (typeof orders !== 'number' || !Number.isInteger(orders) || orders < 0) return undefined
  if (typeof delivered !== 'number' || !Number.isInteger(delivered) || delivered < 0) return undefined
  return { orders, delivered }
}

/** The order tool row model, shared by both tool names. */
export interface OrderRowModel {
  readonly state: KbToolRowState
  /** The service id (create) or order id (status) as typed; blank while args still stream. */
  readonly subject: string
  /** The order receipt line, when the create meta validated. */
  readonly receipt: string | null
  /** The settled order's numeric id when the create meta carried one; the「查看订单」entry needs it. */
  readonly viewOrderId: number | null
  /** The status counts line, when the status meta validated. */
  readonly counts: string | null
  /** The raw result text (the expanded fallback and error summary source). */
  readonly output: string | null
  /** First line of the result text on an error row; null otherwise. */
  readonly errorSummary: string | null
}

/**
 * Derive one order tool row model.
 * @param block - the frozen call slice.
 * @param toolName - the owning tool name (`order_create` or `order_status`).
 * @returns the row model.
 */
export function orderRowModel(block: ToolCallBlock, toolName: 'order_create' | 'order_status'): OrderRowModel {
  const state = stateOf(block)
  const output = resultTextOf(block)
  const meta = 'kind' in block ? block.meta : undefined
  const args = argsOf(block)
  const subject = toolName === 'order_create'
    ? typeof args?.service_id === 'string' ? args.service_id : ''
    : typeof args?.order_id === 'number' ? String(args.order_id) : ''
  const createMeta = toolName === 'order_create' ? createMetaOf(meta) : undefined
  const statusMeta = toolName === 'order_status' ? statusMetaOf(meta) : undefined
  return {
    state,
    subject,
    receipt: createMeta === undefined ? null : `${createMeta.order_no} · ${createMeta.service_name} — ${createMeta.status}`,
    viewOrderId: createMeta?.order_id ?? null,
    counts: statusMeta === undefined ? null : `${statusMeta.orders} / ${statusMeta.delivered}`,
    output,
    errorSummary: state === 'error' && output !== null ? firstLine(output) : null,
  }
}
