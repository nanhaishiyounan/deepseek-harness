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
