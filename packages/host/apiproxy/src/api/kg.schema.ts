/**
 * kg domain zod schemas: request/value validation for the graph page's read
 * surface (schema/search/subgraph/expand/stats).
 */

import { z } from 'zod'
import type { Wire } from './rpc.schema.ts'
import type { RequestPayload } from './index.ts'

/** Where a registered entry came from (mirrors the registry vocabulary). */
const sourceSchema = z.enum(['builtin-ontology', 'builtin-food', 'nocobase-derived', 'agent-defined'])

/** One registered node type as the wire projects it. */
export const kgNodeTypeViewSchema = z.object({
  id: z.string().min(1),
  label: z.string(),
  layer: z.enum(['top', 'domain']),
  extends: z.string().optional(),
  natural_key: z.string().optional(),
  prop_keys: z.array(z.string()),
  source: sourceSchema,
  status: z.enum(['draft', 'active']),
})

/** One registered relation as the wire projects it. */
export const kgRelationViewSchema = z.object({
  id: z.string().min(1),
  label: z.string(),
  constraints: z.array(z.object({ domain: z.string(), range: z.string() })),
  kind: z.enum(['object', 'hierarchical']),
  source: sourceSchema,
})

/** One node hit from seed resolution. */
export const kgNodeHitViewSchema = z.object({
  id: z.string().min(1),
  type: z.string().min(1),
  name: z.string(),
  natural_key: z.string().optional(),
})

/** One node inside a subgraph result. */
export const kgSubgraphNodeViewSchema = z.object({
  id: z.string().min(1),
  type: z.string().min(1),
  name: z.string(),
  natural_key: z.string().optional(),
  depth: z.number().int().min(0),
})

/** One edge as the wire projects it. */
export const kgEdgeViewSchema = z.object({
  id: z.string().min(1),
  relation: z.string().min(1),
  source: z.string().min(1),
  target: z.string().min(1),
  fact: z.string().optional(),
  asserted_by: z.enum(['nocobase', 'lakehouse', 'connector', 'kb']),
})

/** kg.schema request payload (empty). */
export const kgSchemaRequestSchema = z.object({}) as unknown as z.ZodType<Wire<RequestPayload<'kg.schema'>>>
/** kg.search request payload. */
export const kgSearchRequestSchema = z.object({
  query: z.string(),
  type: z.string().optional(),
  k: z.number().int().min(1).max(50).optional(),
}) as unknown as z.ZodType<Wire<RequestPayload<'kg.search'>>>
/** kg.subgraph request payload. */
export const kgSubgraphRequestSchema = z.object({
  seeds: z.array(z.string()).min(1),
  hops: z.number().int().min(0).max(2).optional(),
  max_nodes: z.number().int().min(1).max(2000).optional(),
  relation_types: z.array(z.string()).optional(),
}) as unknown as z.ZodType<Wire<RequestPayload<'kg.subgraph'>>>
/** kg.expand request payload. */
export const kgExpandRequestSchema = z.object({
  node_id: z.string().min(1),
  limit: z.number().int().min(1).max(2000).optional(),
}) as unknown as z.ZodType<Wire<RequestPayload<'kg.expand'>>>
/** kg.stats request payload (empty). */
export const kgStatsRequestSchema = z.object({}) as unknown as z.ZodType<Wire<RequestPayload<'kg.stats'>>>
/** kg.mappings request payload (empty). */
export const kgMappingsRequestSchema = z.object({}) as unknown as z.ZodType<Wire<RequestPayload<'kg.mappings'>>>
/** kg.query request payload. */
export const kgQueryRequestSchema = z.object({
  phrase: z.string().min(1),
}) as unknown as z.ZodType<Wire<RequestPayload<'kg.query'>>>

/** kg.schema response value. */
export const kgSchemaValueSchema = z.object({
  ontology_version: z.string(),
  node_types: z.array(kgNodeTypeViewSchema),
  relations: z.array(kgRelationViewSchema),
  revisions: z.array(z.object({
    id: z.number().int(),
    summary: z.string(),
    created_at: z.string(),
  })),
})

/** kg.mappings response value. */
export const kgMappingsValueSchema = z.object({
  file: z.string(),
  version: z.number().int(),
  rules: z.object({
    skipHiddenCollections: z.boolean(),
    emptyFkNoEdge: z.boolean(),
    derivesTitle: z.boolean(),
  }),
  collections: z.array(z.object({
    name: z.string(),
    anchor: z.string().optional(),
    titleField: z.string().optional(),
    fkLinkCount: z.number().int().min(0),
  })),
  lastRun: z.object({
    finishedAt: z.string(),
    ruleHits: z.record(z.string(), z.number()),
    collections: z.array(z.object({
      scope: z.string(),
      nodesUpserted: z.number().int().min(0),
      edgesUpserted: z.number().int().min(0),
      skipped: z.boolean(),
      skippedRelationFields: z.array(z.string()),
    })),
  }).optional(),
})

/** kg.search response value. */
export const kgSearchValueSchema = z.object({
  nodes: z.array(kgNodeHitViewSchema),
})

/** kg.subgraph response value. */
export const kgSubgraphValueSchema = z.object({
  nodes: z.array(kgSubgraphNodeViewSchema),
  edges: z.array(kgEdgeViewSchema),
  truncated: z.boolean(),
  seeds_resolved: z.array(z.string()),
  unresolved: z.array(z.string()).optional(),
})

/** kg.expand response value. */
export const kgExpandValueSchema = z.object({
  nodes: z.array(kgSubgraphNodeViewSchema),
  edges: z.array(kgEdgeViewSchema),
  truncated: z.boolean(),
})

/** kg.query response value. */
export const kgQueryValueSchema = kgSubgraphValueSchema.extend({
  template: z.string(),
  hops: z.number().int().min(1).max(2),
  relation_types: z.array(z.string()).optional(),
  restated: z.string(),
})

/** kg.stats response value. */
export const kgStatsValueSchema = z.object({
  triples: z.number().int().min(0),
  entities: z.number().int().min(0),
  node_types: z.number().int().min(0),
  relations: z.number().int().min(0),
  ontology_version: z.string(),
  islands: z.number().int().min(0),
  conflicts: z.number().int().min(0),
  coverage: z.object({
    numerator: z.number().int().min(0),
    denominator: z.number().int().min(0),
    ratio: z.number(),
  }).optional(),
  last_run_at: z.string().optional(),
})
