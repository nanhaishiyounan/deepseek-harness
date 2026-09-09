/**
 * orders domain zod schemas: request/value validation for the expert-order
 * surface (create/get/list/fulfill; the download route is host-only and
 * carries no wire envelope).
 */

import { z } from 'zod'
import type { Wire } from './rpc.schema.ts'
import type { OrderView, RequestPayload } from './index.ts'

/** The closed order status vocabulary on the wire. */
const orderStatusSchema = z.enum(['pending', 'generating', 'delivered', 'failed'])

/** One order row as the wire projects it. */
export const orderViewSchema = z.object({
  id: z.number().int(),
  order_no: z.string().min(1),
  service_id: z.string().min(1),
  service_name: z.string().min(1),
  price: z.string().optional(),
  brief: z.string(),
  client_name: z.string().optional(),
  expert_name: z.string().optional(),
  expert_org: z.string().optional(),
  status: orderStatusSchema,
  error: z.string().optional(),
  deliverable_path: z.string().optional(),
  deliverable_url: z.string().optional(),
  generated_at: z.string().optional(),
  note: z.string().optional(),
  created_at: z.string(),
}) as unknown as z.ZodType<Wire<OrderView>>

/** orders.create request payload. */
export const ordersCreateRequestSchema = z.object({
  service_id: z.string().min(1),
  brief: z.string().min(1),
  client_name: z.string().optional(),
}) as unknown as z.ZodType<Wire<RequestPayload<'orders.create'>>>

/** orders.get / orders.fulfill request payload. */
export const ordersOrderIdRequestSchema = z.object({
  order_id: z.number().int().min(1),
}) as unknown as z.ZodType<Wire<RequestPayload<'orders.get'>>>

/** orders.list request payload (empty). */
export const ordersListRequestSchema = z.object({}) as unknown as z.ZodType<Wire<RequestPayload<'orders.list'>>>

/** orders.create / orders.get / orders.fulfill response value. */
export const orderValueSchema = orderViewSchema

/** orders.list response value. */
export const ordersListValueSchema = z.object({
  orders: z.array(orderViewSchema),
})
