/**
 * governance domain zod schemas: request/value validation for the governance
 * panel's RPC surface.
 */

import { z } from 'zod'
import type { Wire } from './rpc.schema.ts'
import type { RequestPayload } from './index.ts'

const empty: z.ZodType<Wire<RequestPayload<'governance.inventory'>>> = z.object({})

export const governanceInventoryRequestSchema = empty
export const governanceSearchRequestSchema: z.ZodType<Wire<RequestPayload<'governance.search'>>> = z.object({
  query: z.string().min(1),
})

const assetSchema = z.object({
  source: z.string().min(1),
  qualified_name: z.string().min(1),
  name: z.string().min(1),
  count: z.number().optional(),
  detail: z.string().optional(),
})

export const governanceInventoryValueSchema = z.object({ assets: z.array(assetSchema) })
export const governanceSearchValueSchema = z.object({ assets: z.array(assetSchema) })

const edgeSchema = z.object({
  source: z.string().min(1),
  target: z.string().min(1),
  transform: z.string().min(1),
  recorded_at: z.string().min(1),
})

export const governanceLineageRequestSchema = empty
export const governanceLineageValueSchema = z.object({ edges: z.array(edgeSchema) })

const ruleSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  kind: z.enum(['row_count_threshold', 'null_rate', 'uniqueness', 'freshness', 'custom_sql']),
  table: z.string().min(1),
  column: z.string().optional(),
  threshold: z.number().optional(),
  sql: z.string().optional(),
  enabled: z.boolean(),
})

export const governanceRulesRequestSchema = empty
export const governanceRulesValueSchema = z.object({ rules: z.array(ruleSchema) })
export const governanceRuleUpsertRequestSchema: z.ZodType<Wire<RequestPayload<'governance.ruleUpsert'>>> = z.object({
  rule: ruleSchema,
})
export const governanceRuleUpsertValueSchema = z.object({})
export const governanceRuleDeleteRequestSchema: z.ZodType<Wire<RequestPayload<'governance.ruleDelete'>>> = z.object({
  id: z.string().min(1),
})
export const governanceRuleDeleteValueSchema = z.object({})

const outcomeSchema = z.object({
  rule: ruleSchema,
  status: z.enum(['pass', 'fail']),
  measured: z.number().nullable(),
  error: z.string().optional(),
})

export const governanceEvaluateRequestSchema = empty
export const governanceEvaluateValueSchema = z.object({
  evaluated_at: z.string().min(1),
  outcomes: z.array(outcomeSchema),
  failed: z.number().int().min(0),
})

const eventSchema = z.object({
  id: z.number().int().min(1),
  at: z.string().min(1),
  kind: z.string().min(1),
  level: z.enum(['info', 'warning', 'critical']),
  title: z.string().min(1),
  detail: z.string().optional(),
})

export const governanceEventsRequestSchema = empty
export const governanceEventsValueSchema = z.object({ events: z.array(eventSchema) })

export const governanceWebhookTestRequestSchema = empty
export const governanceWebhookTestValueSchema = z.object({
  delivered: z.boolean(),
  status: z.string().min(1),
})
