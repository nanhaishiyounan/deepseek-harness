/**
 * connectors domain zod schemas: request/value validation for the connector
 * page's read surface (list/connections/transfers).
 */

import { z } from 'zod'
import type { Wire } from './rpc.schema.ts'
import type { RequestPayload } from './index.ts'

/** The closed provider-capability vocabulary on the wire. */
const capabilitySchema = z.enum(['discover', 'fetch', 'transfer'])

/** One registered provider as the wire projects it. */
export const connectorProviderViewSchema = z.object({
  id: z.string().min(1),
  available: z.boolean(),
  capabilities: z.array(capabilitySchema),
})

/** One provider's delivery aggregate. */
export const connectorConnectionViewSchema = z.object({
  provider_id: z.string().min(1),
  transfers: z.number().int().min(0),
  rows: z.number().int().min(0),
  last_transfer_at: z.string().optional(),
})

/** One delivery-trail record as the wire projects it. */
export const connectorTransferViewSchema = z.object({
  transfer_id: z.number().int().min(1),
  source: z.string().min(1),
  destination: z.enum(['kb', 'lakehouse']),
  dataset_id: z.string().min(1),
  rows: z.number().int().min(0),
  transferred_at: z.string(),
})

/** connectors.list request payload (empty). */
export const connectorsListRequestSchema = z.object({}) as unknown as z.ZodType<Wire<RequestPayload<'connectors.list'>>>
/** connectors.connections request payload (empty). */
export const connectorsConnectionsRequestSchema = z.object({}) as unknown as z.ZodType<Wire<RequestPayload<'connectors.connections'>>>
/** connectors.transfers request payload (empty). */
export const connectorsTransfersRequestSchema = z.object({}) as unknown as z.ZodType<Wire<RequestPayload<'connectors.transfers'>>>

/** connectors.list response value. */
export const connectorsListValueSchema = z.object({
  providers: z.array(connectorProviderViewSchema),
})

/** connectors.connections response value. */
export const connectorsConnectionsValueSchema = z.object({
  connections: z.array(connectorConnectionViewSchema),
})

/** connectors.transfers response value. */
export const connectorsTransfersValueSchema = z.object({
  transfers: z.array(connectorTransferViewSchema),
})
