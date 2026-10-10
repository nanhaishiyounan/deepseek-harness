/**
 * lakehouse domain zod schemas: request/value validation for the
 * overview-home KPI band.
 */

import { z } from 'zod'
import type { Wire } from './rpc.schema.ts'
import type { RequestPayload } from './index.ts'

/** lakehouse.overview request payload (empty). */
export const lakehouseOverviewRequestSchema: z.ZodType<Wire<RequestPayload<'lakehouse.overview'>>> = z.object({})

/** One KPI chip as the wire projects it. */
export const lakehouseKpiViewSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  value: z.number(),
  unit: z.string().optional(),
  trend: z.number().optional(),
  error: z.string().optional(),
})

/** lakehouse.overview response value. */
export const lakehouseOverviewValueSchema = z.object({
  generated_at: z.string().min(1),
  kpis: z.array(lakehouseKpiViewSchema),
})

/** lakehouse.tables request payload (empty). */
export const lakehouseTablesRequestSchema: z.ZodType<Wire<RequestPayload<'lakehouse.tables'>>> = z.object({})

const jsonScalar = z.union([z.null(), z.boolean(), z.number(), z.string()])

const lakehouseColumnSchema = z.object({
  name: z.string().min(1),
  type: z.string().min(1),
})

/** lakehouse.tables response value. */
export const lakehouseTablesValueSchema = z.object({
  tables: z.array(z.object({
    ref: z.string().min(1),
    schema: z.string().min(1),
    table: z.string().min(1),
    row_count: z.number().int().min(0),
  })),
})

/** lakehouse.query request payload. */
export const lakehouseQueryRequestSchema: z.ZodType<Wire<RequestPayload<'lakehouse.query'>>> = z.object({
  sql: z.string().min(1),
})

/** lakehouse.query response value. */
export const lakehouseQueryValueSchema = z.object({
  sql: z.string().min(1),
  columns: z.array(lakehouseColumnSchema),
  rows: z.array(z.array(jsonScalar)),
  row_count: z.number().int().min(0),
  truncated: z.boolean(),
})

/** lakehouse.schema request payload. */
export const lakehouseSchemaRequestSchema: z.ZodType<Wire<RequestPayload<'lakehouse.schema'>>> = z.object({
  schema: z.string().min(1),
  table: z.string().min(1),
})

/** lakehouse.schema response value. */
export const lakehouseSchemaValueSchema = z.object({
  ref: z.string().min(1),
  columns: z.array(lakehouseColumnSchema),
  row_count: z.number().int().min(0),
  sample_rows: z.array(z.array(jsonScalar)),
})
