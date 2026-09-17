/**
 * The model-facing order tools over the optional `ctx.orders` capability:
 * `order_create` places an expert-service order and runs the deliverable
 * pipeline to completion in one call (the session's in-conversation
 * order→PDF journey), `order_status` reads one order or lists them. Both
 * tools stay registered when no orders capability is composed and fail with
 * a structured error at execution time — the suite's documented degraded
 * mode.
 * @module @deepseek-ai/dsh-tool-connector/order
 */

import type { Context } from '@deepseek-ai/cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'
import type { GenericCallView, GenericResultView, ToolResult } from '@deepseek-ai/dsh-tools'
import type { OrderRecord } from '@deepseek-ai/dsh-expert-orders'

/** Model-facing `order_create` arguments. */
export interface OrderCreateArgs {
  readonly service_id: string
  readonly brief: string
  /** Client display name for the deliverable's cover page, when the conversation knows it. */
  readonly client_name?: string | undefined
  /** Always rejected at parse time: the tenant is the deployment-side binding, never model input. */
  readonly tenant?: string | undefined
}

/** Model-facing `order_status` arguments. */
export interface OrderStatusArgs {
  /** Omitted = list the recent orders instead of one. */
  readonly order_id?: number | undefined
  /** Always rejected at parse time: the tenant is the deployment-side binding, never model input. */
  readonly tenant?: string | undefined
}

/** One order row as the canonical tool value projects it. */
export interface OrderEntry {
  readonly order_id: number
  readonly order_no: string
  readonly service_name: string
  readonly price?: string
  readonly status: string
  readonly deliverable_path?: string
  readonly deliverable_url?: string
  readonly error?: string
  readonly note?: string
  readonly created_at: string
}

/** The canonical `order_create` output value. */
export interface OrderCreateToolValue {
  readonly order_id: number
  readonly order_no: string
  readonly service_name: string
  readonly status: string
  readonly deliverable_path?: string
  readonly deliverable_url?: string
  readonly note?: string
}

/** The canonical `order_status` output value. */
export interface OrderStatusToolValue {
  readonly orders: readonly OrderEntry[]
}

/**
 * Validate the arguments the schema DSL cannot constrain: no model-supplied
 * tenant, and `order_create`'s two required fields present after trimming.
 * @param args - the schema-validated `order_create` arguments.
 * @returns the validated create input.
 */
export function parseOrderCreateArgs(args: OrderCreateArgs): { serviceId: string; brief: string; clientName?: string } {
  if (args.tenant !== undefined) {
    throw new Error('order_create: the tenant is bound by the deployment; a tenant argument is not accepted')
  }
  const serviceId = args.service_id.trim()
  const brief = args.brief.trim()
  if (serviceId.length === 0) throw new Error('order_create: service_id must be a non-empty expert_services dataset id')
  if (brief.length === 0) throw new Error('order_create: brief must state the client\'s need in their own words')
  const clientName = args.client_name?.trim()
  return { serviceId, brief, ...(clientName === undefined || clientName.length === 0 ? {} : { clientName }) }
}

/**
 * Validate `order_status` arguments: no model-supplied tenant.
 * @param args - the schema-validated `order_status` arguments.
 * @returns the validated order id when one was supplied.
 */
export function parseOrderStatusArgs(args: OrderStatusArgs): { orderId?: number } {
  if (args.tenant !== undefined) {
    throw new Error('order_status: the tenant is bound by the deployment; a tenant argument is not accepted')
  }
  return { ...args.order_id === undefined ? {} : { orderId: args.order_id } }
}

/**
 * Project one seam order record onto the canonical entry.
 * @param order - the seam's stored order row.
 * @returns the canonical order entry.
 */
export function orderEntryOf(order: OrderRecord): OrderEntry {
  return {
    order_id: order.id,
    order_no: order.orderNo,
    service_name: order.serviceName,
    ...order.price === undefined ? {} : { price: order.price },
    status: order.status,
    ...order.deliverablePath === undefined ? {} : { deliverable_path: order.deliverablePath },
    ...order.deliverableUrl === undefined ? {} : { deliverable_url: order.deliverableUrl },
    ...order.error === undefined ? {} : { error: order.error },
    ...order.note === undefined ? {} : { note: order.note },
    created_at: order.createdAt,
  }
}

/** Status line in Chinese for the model-facing summary. */
const STATUS_TEXT: Readonly<Record<string, string>> = {
  pending: '待生成',
  generating: '生成中',
  delivered: '已交付',
  failed: '生成失败',
}

/**
 * Format the order_create outcome as model-facing markdown: the order
 * receipt with the deliverable's workspace path.
 * @param value - the tool's canonical output value.
 * @returns the order receipt text.
 */
export function formatOrderCreateOutput(value: OrderCreateToolValue): string {
  const lines = [
    `订单已创建并完成生成：${value.order_no}`,
    `- 服务：${value.service_name}`,
    `- 状态：${STATUS_TEXT[value.status] ?? value.status}`,
  ]
  if (value.deliverable_path !== undefined) lines.push(`- 方案 PDF：${value.deliverable_path}`)
  if (value.deliverable_url !== undefined) lines.push(`- 业务后台附件：${value.deliverable_url}`)
  if (value.note !== undefined) lines.push(`- 备注：${value.note}`)
  return lines.join('\n')
}

/**
 * Format the order_status outcome: one order's row (or the recent list),
 * each carrying the path the user can open.
 * @param value - the tool's canonical output value.
 * @returns the order listing text.
 */
export function formatOrderStatusOutput(value: OrderStatusToolValue): string {
  if (value.orders.length === 0) return '当前没有订单。'
  const rows = value.orders.map((order) => {
    const parts = [`- ${order.order_no}（${order.service_name}）：${STATUS_TEXT[order.status] ?? order.status}`]
    if (order.deliverable_path !== undefined) parts.push(`方案 PDF：${order.deliverable_path}`)
    if (order.deliverable_url !== undefined) parts.push(`业务后台附件：${order.deliverable_url}`)
    if (order.error !== undefined) parts.push(`失败原因：${order.error}`)
    return parts.join('，')
  })
  return rows.join('\n')
}

/**
 * Pending-call presentation for `order_create`: a generic card titled by the service id.
 * @param args - the raw tool arguments.
 * @returns the generic card view.
 */
export function presentOrderCreateCall(args: OrderCreateArgs): GenericCallView {
  return { card: 'generic', title: 'order_create', kind: 'execute', rawInput: args.service_id }
}

/** Replay-safe projection of one order_create result meta. */
export interface OrderCreateMetaView {
  /**
   * The order's numeric id, the jump key the toolview's「查看订单」entry rides;
   * absent on sessions logged before the field was projected (replay-tolerant).
   */
  readonly order_id?: number
  readonly order_no: string
  readonly status: string
  readonly service_name: string
  /** The deliverable PDF's workspace path when the order settled delivered. */
  readonly deliverable_path?: string
  readonly deliverable_url?: string
}

/**
 * Narrow opaque live or replayed result metadata for presentation; malformed
 * metadata returns `undefined` so presentation falls back to the generic card.
 * The three identity fields stay strict; `order_id` and the deliverable fields
 * are late additions, so replays of older logs simply omit them instead of
 * failing the whole projection.
 * @param meta - result metadata.
 * @returns the validated order meta, or `undefined`.
 */
export function orderCreateMetaFromResult(meta: unknown): OrderCreateMetaView | undefined {
  if (typeof meta !== 'object' || meta === null || Array.isArray(meta)) return undefined
  const { order_id: orderId, order_no: orderNo, status, service_name: serviceName,
    deliverable_path: deliverablePath, deliverable_url: deliverableUrl } = meta as Record<string, unknown>
  if (typeof orderNo !== 'string' || orderNo.length === 0) return undefined
  if (typeof status !== 'string' || status.length === 0) return undefined
  if (typeof serviceName !== 'string' || serviceName.length === 0) return undefined
  return {
    ...(typeof orderId === 'number' && Number.isInteger(orderId) && orderId > 0 ? { order_id: orderId } : {}),
    order_no: orderNo,
    status,
    service_name: serviceName,
    ...(typeof deliverablePath === 'string' && deliverablePath.length > 0 ? { deliverable_path: deliverablePath } : {}),
    ...(typeof deliverableUrl === 'string' && deliverableUrl.length > 0 ? { deliverable_url: deliverableUrl } : {}),
  }
}

/**
 * Completed-call presentation: the order receipt summary.
 * @param _args - the raw tool arguments (unused; the receipt carries its own identity).
 * @param result - the final tool result; `meta` carries the projection.
 * @returns the generic card view, or `undefined` on failure or malformed meta.
 */
export function presentOrderCreateResult(_args: OrderCreateArgs, result: ToolResult): GenericResultView | undefined {
  if (result.isError) return undefined
  const meta = orderCreateMetaFromResult(result.meta)
  if (meta === undefined) return undefined
  return {
    card: 'generic',
    title: 'order_create',
    content: [{ type: 'text', text: `订单 ${meta.order_no}：${meta.service_name} — ${STATUS_TEXT[meta.status] ?? meta.status}` }],
  }
}

/**
 * Pending-call presentation for `order_status`: a generic card titled by the order id.
 * @param args - the raw tool arguments.
 * @returns the generic card view.
 */
export function presentOrderStatusCall(args: OrderStatusArgs): GenericCallView {
  return { card: 'generic', title: 'order_status', kind: 'read', rawInput: args.order_id === undefined ? '' : String(args.order_id) }
}

/** Replay-safe projection of one order_status result meta. */
export interface OrderStatusMetaView {
  readonly orders: number
  readonly delivered: number
}

function orderStatusMetaFromResult(meta: unknown): OrderStatusMetaView | undefined {
  if (typeof meta !== 'object' || meta === null || Array.isArray(meta)) return undefined
  const { orders, delivered } = meta as Record<string, unknown>
  if (typeof orders !== 'number' || !Number.isInteger(orders) || orders < 0) return undefined
  if (typeof delivered !== 'number' || !Number.isInteger(delivered) || delivered < 0) return undefined
  return { orders, delivered }
}

/**
 * Completed-call presentation: the counts summary.
 * @param _args - the raw tool arguments (unused).
 * @param result - the final tool result; `meta` carries the projection.
 * @returns the generic card view, or `undefined` on failure or malformed meta.
 */
export function presentOrderStatusResult(_args: OrderStatusArgs, result: ToolResult): GenericResultView | undefined {
  if (result.isError) return undefined
  const meta = orderStatusMetaFromResult(result.meta)
  if (meta === undefined) return undefined
  return {
    card: 'generic',
    title: 'order_status',
    content: [{ type: 'text', text: `${meta.orders} 笔订单，${meta.delivered} 笔已交付` }],
  }
}

/** The one-line order schema shared by both tools' outputs. */
const ORDER_ENTRY_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    order_id: { type: 'number', required: true },
    order_no: { type: 'string', required: true },
    service_name: { type: 'string', required: true },
    price: { type: 'string' },
    status: { type: 'string', required: true },
    deliverable_path: { type: 'string' },
    deliverable_url: { type: 'string' },
    error: { type: 'string' },
    note: { type: 'string' },
    created_at: { type: 'string', required: true },
  },
} as const

/**
 * Register the `order_create` tool and its system-prompt guidance: one call
 * places the order and runs the deliverable pipeline to completion.
 * @param ctx - context whose registries receive the registrations.
 * @param timeoutMs - cooperative tool-call budget attached as `ToolDefinition.timeoutMs`.
 */
export function applyOrderCreateTool(ctx: Context, timeoutMs: number): void {
  ctx.systemPrompt.section({
    name: 'tool:order_create',
    order: 116,
    text: 'Use the order_create tool to place an expert-service order the user has agreed to (name the service_id from a connector_discover expert card and restate the need as the brief; pass client_name when the conversation names the client). One call places the order AND generates the proposal PDF, returning the order number, final status, and the deliverable\'s workspace path — only call it for a delivered-price service the user confirmed. Check progress later with order_status.',
  })

  ctx.tools.register(defineTool({
    name: 'order_create',
    description: 'Place an expert-service order and generate its proposal PDF deliverable in one call. Returns the order number, the settled status (delivered or failed), and the PDF\'s workspace path the user can open. Use the service_id from a connector_discover expert card; confirm the priced service with the user first.',
    parameters: {
      service_id: {
        type: 'string',
        required: true,
        description: 'The ordered service\'s dataset id from connector_discover (for example expert_services/2).',
      },
      brief: {
        type: 'string',
        required: true,
        description: 'The client\'s need in their own words; drives the deliverable\'s retrieval and drafting.',
      },
      client_name: {
        type: 'string',
        description: 'Client display name for the deliverable\'s cover page, when the conversation knows it.',
      },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          order_id: { type: 'number', required: true },
          order_no: { type: 'string', required: true },
          service_name: { type: 'string', required: true },
          status: { type: 'string', required: true },
          deliverable_path: { type: 'string' },
          deliverable_url: { type: 'string' },
          note: { type: 'string' },
        },
      },
      render: (_args, value) => [{ type: 'text', text: formatOrderCreateOutput(value as OrderCreateToolValue) }],
      presentationMeta: (_args, value) => {
        const projected = value as OrderCreateToolValue
        return {
          order_id: projected.order_id,
          order_no: projected.order_no,
          status: projected.status,
          service_name: projected.service_name,
          ...projected.deliverable_path === undefined ? {} : { deliverable_path: projected.deliverable_path },
          ...projected.deliverable_url === undefined ? {} : { deliverable_url: projected.deliverable_url },
        }
      },
    },
    timeoutMs,
    async execute(args, exec) {
      const input = parseOrderCreateArgs(args)
      const orders = ctx.get('orders')
      if (orders === undefined) {
        throw new Error('order_create: this deployment composes no orders capability (the expert-orders seam); ordering is unavailable')
      }
      const order = await orders.create(input, exec.signal)
      const fulfilled = await orders.fulfill(order.id, exec.signal)
      return {
        order_id: fulfilled.id,
        order_no: fulfilled.orderNo,
        service_name: fulfilled.serviceName,
        status: fulfilled.status,
        ...fulfilled.deliverablePath === undefined ? {} : { deliverable_path: fulfilled.deliverablePath },
        ...fulfilled.deliverableUrl === undefined ? {} : { deliverable_url: fulfilled.deliverableUrl },
        ...fulfilled.note === undefined ? {} : { note: fulfilled.note },
      }
    },
    presentCall: presentOrderCreateCall,
    presentResult: presentOrderCreateResult,
  }))
}

/**
 * Register the `order_status` tool and its system-prompt guidance.
 * @param ctx - context whose registries receive the registrations.
 * @param timeoutMs - cooperative tool-call budget attached as `ToolDefinition.timeoutMs`.
 */
export function applyOrderStatusTool(ctx: Context, timeoutMs: number): void {
  ctx.systemPrompt.section({
    name: 'tool:order_status',
    order: 117,
    text: 'Use the order_status tool to report order fulfillment to the user: with order_id for one order, without it for the recent list. Delivered orders carry the proposal PDF\'s workspace path — hand that path to the user so they can open the deliverable.',
  })

  ctx.tools.register(defineTool({
    name: 'order_status',
    description: 'Read one expert-service order by id, or list the recent orders when no id is given. Each row carries the status (pending/generating/delivered/failed) and, once delivered, the proposal PDF\'s workspace path.',
    parameters: {
      order_id: {
        type: 'number',
        description: 'The order id from order_create; omit to list the recent orders.',
      },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          orders: { type: 'array', required: true, items: ORDER_ENTRY_SCHEMA },
        },
      },
      render: (_args, value) => [{ type: 'text', text: formatOrderStatusOutput(value as OrderStatusToolValue) }],
      presentationMeta: (_args, value) => {
        const projected = value as OrderStatusToolValue
        return { orders: projected.orders.length, delivered: projected.orders.filter(order => order.status === 'delivered').length }
      },
    },
    timeoutMs,
    // Reads over the orders source; safe to overlap with other reads.
    isConcurrencySafe: () => true,
    async execute(args, exec) {
      const input = parseOrderStatusArgs(args)
      const orders = ctx.get('orders')
      if (orders === undefined) {
        throw new Error('order_status: this deployment composes no orders capability (the expert-orders seam); ordering is unavailable')
      }
      const rows = input.orderId === undefined
        ? await orders.list(exec.signal)
        : [await orders.get(input.orderId, exec.signal)].filter((order): order is OrderRecord => order !== undefined)
      if (rows.length === 0 && input.orderId !== undefined) {
        throw new Error(`order_status: no order ${input.orderId} exists`)
      }
      return { orders: rows.map(orderEntryOf) }
    },
    presentCall: presentOrderStatusCall,
    presentResult: presentOrderStatusResult,
  }))
}
