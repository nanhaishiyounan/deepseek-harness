/**
 * governance domain zod schemas: request/value validation for the governance
 * panel's RPC surface.
 */

import { z } from 'zod'
import type { Wire } from './rpc.schema.ts'
import type { RequestPayload } from './index.ts'

const empty: z.ZodType<Wire<RequestPayload<'governance.inventory'>>> = z.object({})

/** Wire schema for the `governance.inventory` request (empty payload). */
export const governanceInventoryRequestSchema = empty
/** Wire schema for the `governance.search` request (the substring query). */
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

/** Wire schema for the `governance.inventory` value (the asset list). */
export const governanceInventoryValueSchema = z.object({ assets: z.array(assetSchema) })
/** Wire schema for the `governance.search` value (the matched assets). */
export const governanceSearchValueSchema = z.object({ assets: z.array(assetSchema) })

const edgeSchema = z.object({
  source: z.string().min(1),
  target: z.string().min(1),
  transform: z.string().min(1),
  recorded_at: z.string().min(1),
})

/** Wire schema for the `governance.lineage` request (empty payload). */
export const governanceLineageRequestSchema = empty
/** Wire schema for the `governance.lineage` value (the edge list). */
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

/** Wire schema for the `governance.rules` request (empty payload). */
export const governanceRulesRequestSchema = empty
/** Wire schema for the `governance.rules` value (the rule list). */
export const governanceRulesValueSchema = z.object({ rules: z.array(ruleSchema) })
/** Wire schema for the `governance.ruleUpsert` request (the rule row). */
export const governanceRuleUpsertRequestSchema: z.ZodType<Wire<RequestPayload<'governance.ruleUpsert'>>> = z.object({
  rule: ruleSchema,
})
/** Wire schema for the `governance.ruleUpsert` value (empty). */
export const governanceRuleUpsertValueSchema = z.object({})
/** Wire schema for the `governance.ruleDelete` request (the rule id). */
export const governanceRuleDeleteRequestSchema: z.ZodType<Wire<RequestPayload<'governance.ruleDelete'>>> = z.object({
  id: z.string().min(1),
})
/** Wire schema for the `governance.ruleDelete` value (empty). */
export const governanceRuleDeleteValueSchema = z.object({})

const outcomeSchema = z.object({
  rule: ruleSchema,
  status: z.enum(['pass', 'fail']),
  measured: z.number().nullable(),
  error: z.string().optional(),
})

/** Wire schema for the `governance.evaluate` request (empty payload). */
export const governanceEvaluateRequestSchema = empty
/** Wire schema for the `governance.evaluate` value (the evaluation outcomes). */
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

/** Wire schema for the `governance.events` request (empty payload). */
export const governanceEventsRequestSchema = empty
/** Wire schema for the `governance.events` value (the alert events). */
export const governanceEventsValueSchema = z.object({ events: z.array(eventSchema) })

/** Wire schema for the `governance.webhookTest` request (empty payload). */
export const governanceWebhookTestRequestSchema = empty
/** Wire schema for the `governance.webhookTest` value (the delivery status). */
export const governanceWebhookTestValueSchema = z.object({
  delivered: z.boolean(),
  status: z.string().min(1),
})
