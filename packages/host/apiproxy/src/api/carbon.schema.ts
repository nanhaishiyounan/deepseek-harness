/**
 * carbon domain zod schemas: request/value validation for the five methods.
 */

import { z } from 'zod'
import type { Wire } from './rpc.schema.ts'
import type { CarbonRowPageView, RequestPayload } from './index.ts'

/** One restricted filter condition. */
export const carbonFilterConditionSchema = z.object({
  field: z.string().min(1),
  op: z.enum(['eq', 'neq', 'gt', 'lt', 'gte', 'lte', 'like', 'ilike', 'in', 'is']),
  value: z.union([z.string(), z.number(), z.boolean(), z.null(), z.array(z.union([z.string(), z.number(), z.boolean()])).min(1)]),
})

/** One catalog table definition row. */
const carbonTableMetaSchema = z.object({
  table: z.string(),
  label: z.string(),
  module: z.string(),
  risk: z.enum(['read', 'write']),
  id_column: z.string(),
  key_columns: z.array(z.string()),
})

/** carbon.listMeta request payload (empty: the catalog takes no input). */
export const carbonListMetaRequestSchema = z.object({}) as unknown as z.ZodType<Wire<RequestPayload<'carbon.listMeta'>>>

/** carbon.listMeta response value. */
export const carbonListMetaValueSchema = z.object({
  tables: z.array(carbonTableMetaSchema),
})

/** carbon.list request payload. */
export const carbonListRequestSchema = z.object({
  table: z.string().min(1),
  filter: z.array(carbonFilterConditionSchema).optional(),
  order: z.array(z.string().min(1)).optional(),
  limit: z.number().int().min(1).max(100).optional(),
  offset: z.number().int().min(0).optional(),
}) as unknown as z.ZodType<Wire<RequestPayload<'carbon.list'>>>

/** carbon.list response value. */
export const carbonListValueSchema = z.object({
  count: z.number(),
  offset: z.number(),
  limit: z.number(),
  rows: z.array(z.record(z.string(), z.unknown())),
}) as unknown as z.ZodType<Wire<CarbonRowPageView>>

/** carbon.get request payload. */
export const carbonGetRequestSchema = z.object({
  table: z.string().min(1),
  id: z.string().min(1),
}) as unknown as z.ZodType<Wire<RequestPayload<'carbon.get'>>>

/** carbon.get response value. */
export const carbonGetValueSchema = z.object({
  table: z.string(),
  row: z.record(z.string(), z.unknown()),
})

/** carbon.create request payload. */
export const carbonCreateRequestSchema = z.object({
  table: z.string().min(1),
  values: z.record(z.string(), z.unknown()),
}) as unknown as z.ZodType<Wire<RequestPayload<'carbon.create'>>>

/** carbon.create response value. */
export const carbonCreateValueSchema = z.object({
  table: z.string(),
  row: z.record(z.string(), z.unknown()),
})

/** carbon.update request payload. */
export const carbonUpdateRequestSchema = z.object({
  table: z.string().min(1),
  id: z.string().min(1),
  values: z.record(z.string(), z.unknown()),
}) as unknown as z.ZodType<Wire<RequestPayload<'carbon.update'>>>

/** carbon.update response value. */
export const carbonUpdateValueSchema = z.object({
  table: z.string(),
  row: z.record(z.string(), z.unknown()),
})
