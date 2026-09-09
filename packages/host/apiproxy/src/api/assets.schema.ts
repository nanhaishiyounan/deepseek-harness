/**
 * assets domain zod schemas: request/value validation for the data-asset
 * market surface (list/detail/stats).
 */

import { z } from 'zod'
import type { Wire } from './rpc.schema.ts'
import type { AssetView, RequestPayload } from './index.ts'

/** The closed asset-form vocabulary on the wire. */
const assetKindSchema = z.enum(['tabular', 'file', 'document', 'expert-profile', 'service'])

/** One market product card as the wire projects it. */
export const assetViewSchema = z.object({
  provider_id: z.string().min(1),
  dataset_id: z.string().min(1),
  title: z.string().min(1),
  kind: assetKindSchema,
  description: z.string().optional(),
  updated_at: z.string().optional(),
  service_name: z.string().optional(),
  price: z.string().optional(),
  deliverable: z.string().optional(),
  summary: z.string().optional(),
  service_id: z.string().optional(),
  expert_org: z.string().optional(),
  domains: z.array(z.string()).optional(),
}) as unknown as z.ZodType<Wire<AssetView>>

/** assets.list request payload. */
export const assetsListRequestSchema = z.object({
  query: z.string().optional(),
}) as unknown as z.ZodType<Wire<RequestPayload<'assets.list'>>>

/** assets.detail request payload. */
export const assetsDetailRequestSchema = z.object({
  provider_id: z.string().min(1),
  dataset_id: z.string().min(1),
}) as unknown as z.ZodType<Wire<RequestPayload<'assets.detail'>>>

/** assets.list response value. */
export const assetsListValueSchema = z.object({
  assets: z.array(assetViewSchema),
})

/** assets.detail response value. */
export const assetDetailValueSchema = assetViewSchema

/** One featured card from the market seed file. */
export const assetFeaturedSchema = z.object({
  title: z.string().min(1),
  blurb: z.string(),
  tags: z.array(z.string()),
})

/** assets.stats request payload (empty). */
export const assetsStatsRequestSchema = z.object({}) as unknown as z.ZodType<Wire<RequestPayload<'assets.stats'>>>

/** assets.stats response value. */
export const assetsStatsValueSchema = z.object({
  products: z.number().int().min(0),
  providers: z.number().int().min(0),
  monthly_orders: z.number().int().min(0),
  featured: z.array(assetFeaturedSchema),
})
