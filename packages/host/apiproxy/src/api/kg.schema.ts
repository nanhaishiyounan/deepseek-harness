/**
 * kg domain zod schemas: request/value validation for the graph page's read
 * surface (schema/search/subgraph/expand/stats).
 */

import { z } from 'zod'
import type { Wire } from './rpc.schema.ts'
import type { RequestPayload } from './index.ts'

/** Where a registered entry came from (mirrors the registry vocabulary). */
const sourceSchema = z.enum(['builtin-ontology', 'builtin-food', 'foodon-imported', 'nocobase-derived', 'agent-defined'])

/** One registered node type as the wire projects it. */
export const kgNodeTypeViewSchema = z.object({
  id: z.string().min(1),
  label: z.string(),
  layer: z.enum(['top', 'domain']),
  extends: z.string().optional(),
  natural_key: z.string().optional(),
  prop_keys: z.array(z.string()),
  foodon_uri: z.string().optional(),
  foodon_id: z.string().optional(),
  synonyms: z.array(z.string()).optional(),
  source: sourceSchema,
  status: z.enum(['draft', 'active', 'deprecated']),
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
  asserted_by: z.enum(['nocobase', 'lakehouse', 'connector', 'kb', 'kg-align', 'ai-edit']),
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
/** kg.episodes request payload. */
export const kgEpisodesRequestSchema = z.object({
  limit: z.number().int().min(1).max(100).optional(),
}) as unknown as z.ZodType<Wire<RequestPayload<'kg.episodes'>>>
/** kg.rollback request payload. */
export const kgRollbackRequestSchema = z.object({
  episode_uuid: z.string().min(1),
  reason: z.string().optional(),
}) as unknown as z.ZodType<Wire<RequestPayload<'kg.rollback'>>>
/** One KGCL ontology op as the wire carries it (the manual editor's vocabulary). */
export const kgOntologyOpWireSchema = z.discriminatedUnion('op', [
  z.object({ op: z.literal('add_node'), target_id: z.string().min(1), label: z.string().min(1), parent_id: z.string().min(1).optional() }),
  z.object({ op: z.literal('rename_node'), target_id: z.string().min(1), label: z.string().min(1) }),
  z.object({ op: z.literal('set_parent'), target_id: z.string().min(1), new_parent_id: z.string().min(1) }),
  z.object({ op: z.literal('deprecate_node'), target_id: z.string().min(1), replaced_by: z.string().min(1).optional() }),
  z.object({
    op: z.literal('change_cardinality'),
    relation_id: z.string().min(1),
    domain_id: z.string().min(1),
    range_id: z.string().min(1),
    min: z.number().int().min(0).optional(),
    max: z.number().int().min(0).optional(),
  }),
])
/** kg.ontologyEdit request payload. */
export const kgOntologyEditRequestSchema = z.object({
  ops: z.array(kgOntologyOpWireSchema).min(1).max(20),
}) as unknown as z.ZodType<Wire<RequestPayload<'kg.ontologyEdit'>>>
/** kg.reviewQueue request payload (empty). */
export const kgReviewQueueRequestSchema = z.object({}) as unknown as z.ZodType<Wire<RequestPayload<'kg.reviewQueue'>>>
/** kg.reviewDecide request payload. */
export const kgReviewDecideRequestSchema = z.object({
  doc_id: z.string().min(1),
  row_id: z.string().min(1),
  decision: z.enum(['merge', 'reject', 'skip']),
  doc_name: z.string().optional(),
  row_name: z.string().optional(),
  reason: z.string().optional(),
}) as unknown as z.ZodType<Wire<RequestPayload<'kg.reviewDecide'>>>
/** kg.communities request payload (empty). */
export const kgCommunitiesRequestSchema = z.object({}) as unknown as z.ZodType<Wire<RequestPayload<'kg.communities'>>>
/** kg.history request payload. */
export const kgHistoryRequestSchema = z.object({
  as_of: z.string().min(1),
}) as unknown as z.ZodType<Wire<RequestPayload<'kg.history'>>>
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

/** kg.episodes response value. */
export const kgEpisodesValueSchema = z.object({
  episodes: z.array(z.object({
    uuid: z.string(),
    source: z.enum(['ingest', 'ai-edit', 'human-edit', 'rollback']),
    name: z.string(),
    content: z.string(),
    created_at: z.string(),
    mentions: z.number().int().min(0),
  })),
})

/** kg.rollback response value. */
export const kgRollbackValueSchema = z.object({
  rollback_uuid: z.string(),
  rolled_back: z.string(),
  retired: z.number().int().min(0),
  restored: z.number().int().min(0),
})

/** kg.ontologyEdit response value. */
export const kgOntologyEditValueSchema = z.object({
  applied: z.array(z.string()),
  revision_id: z.number().int().min(0),
  episode_uuid: z.string(),
})

/** One pending gray-zone pair the review queue serves. */
export const kgReviewEntryViewSchema = z.object({
  doc_id: z.string().min(1),
  row_id: z.string().min(1),
  doc_name: z.string(),
  row_name: z.string(),
  confidence: z.number().min(0).max(1),
  reason: z.string(),
})

/** kg.reviewQueue response value. */
export const kgReviewQueueValueSchema = z.object({
  entries: z.array(kgReviewEntryViewSchema),
  source_episode: z.string(),
})

/** kg.reviewDecide response value. */
export const kgReviewDecideValueSchema = z.object({
  episode_uuid: z.string(),
  decided: z.enum(['merge', 'reject', 'skip']),
  edge_id: z.string().optional(),
})

/** kg.communities response value. */
export const kgCommunitiesValueSchema = z.object({
  communities: z.array(z.object({
    id: z.number().int().min(0),
    nodes: z.array(z.string().min(1)),
  })),
  modularity: z.number(),
  node_count: z.number().int().min(0),
})

/** kg.history response value (a frozen subgraph plus the instant; no seed
 * resolution rides the replay read, so it builds on the shared projections
 * instead of the subgraph response, which requires `seeds_resolved`). */
export const kgHistoryValueSchema = z.object({
  nodes: z.array(kgSubgraphNodeViewSchema),
  edges: z.array(kgEdgeViewSchema),
  truncated: z.boolean(),
  as_of: z.string(),
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
