/**
 * nocobase domain zod schemas: request/value validation for the three read
 * methods.
 */

import { z } from 'zod'
import type { Wire } from './rpc.schema.ts'
import type { NocobaseCollectionMetaView, NocobaseRowPageView, RequestPayload } from './index.ts'

/** One field definition row. */
const nocobaseFieldSchema = z.object({
  name: z.string(),
  type: z.string(),
  title: z.string().optional(),
  target: z.string().optional(),
}) as unknown as z.ZodType<Wire<NocobaseCollectionMetaView['fields'][number]>>

/** nocobase.listMeta request payload (empty: schema discovery takes no input). */
export const nocobaseListMetaRequestSchema = z.object({}) as unknown as z.ZodType<Wire<RequestPayload<'nocobase.listMeta'>>>

/** nocobase.listMeta response value. */
export const nocobaseListMetaValueSchema = z.object({
  collections: z.array(z.object({
    name: z.string(),
    title: z.string().optional(),
    hidden: z.boolean().optional(),
    filter_target_key: z.string().optional(),
    fields: z.array(nocobaseFieldSchema),
  })),
}) as unknown as z.ZodType<Wire<{ collections: readonly NocobaseCollectionMetaView[] }>>

/** One restricted filter condition. */
export const nocobaseFilterConditionSchema = z.object({
  field: z.string().min(1),
  op: z.enum(['eq', 'in', 'gt', 'lt', 'includes']),
  value: z.union([z.string(), z.number(), z.boolean(), z.array(z.union([z.string(), z.number(), z.boolean()])).min(1)]),
})

/** nocobase.list request payload. */
export const nocobaseListRequestSchema = z.object({
  collection: z.string().min(1),
  filter: z.array(nocobaseFilterConditionSchema).optional(),
  match: z.enum(['and', 'or']).optional(),
  page: z.number().int().min(1).optional(),
  page_size: z.number().int().min(1).max(100).optional(),
  sort: z.array(z.string().min(1)).optional(),
  fields: z.array(z.string().min(1)).optional(),
}) as unknown as z.ZodType<Wire<RequestPayload<'nocobase.list'>>>

/** nocobase.list response value. */
export const nocobaseListValueSchema = z.object({
  count: z.number(),
  page: z.number(),
  page_size: z.number(),
  rows: z.array(z.record(z.string(), z.unknown())),
}) as unknown as z.ZodType<Wire<NocobaseRowPageView>>

/** nocobase.get request payload. */
export const nocobaseGetRequestSchema = z.object({
  collection: z.string().min(1),
  id: z.number().int().min(1),
}) as unknown as z.ZodType<Wire<RequestPayload<'nocobase.get'>>>

/** nocobase.get response value. */
export const nocobaseGetValueSchema = z.object({
  collection: z.string(),
  row: z.record(z.string(), z.unknown()),
}) as unknown as z.ZodType<Wire<{ collection: string; row: Record<string, unknown> }>>

/** nocobase.update request payload. */
export const nocobaseUpdateRequestSchema = z.object({
  collection: z.string().min(1),
  id: z.number().int().min(1),
  values: z.record(z.string(), z.union([z.string(), z.number(), z.null()])),
}) as unknown as z.ZodType<Wire<RequestPayload<'nocobase.update'>>>

/** nocobase.update response value. */
export const nocobaseUpdateValueSchema = z.object({
  collection: z.string(),
  row: z.record(z.string(), z.unknown()),
}) as unknown as z.ZodType<Wire<{ collection: string; row: Record<string, unknown> }>>
