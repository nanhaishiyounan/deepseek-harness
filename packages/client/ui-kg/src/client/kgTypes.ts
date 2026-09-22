/**
 * Wire-contract mirrors the graph page renders: the `kg.schema` registry rows
 * (legend), the `kg.search` seed hits, and the `kg.subgraph`/`kg.expand`
 * projections. The gateway owns validation; these shapes exist so the page
 * never re-parses the wire.
 * @module @deepseek-ai/dsh-client-ui-kg/client/kgTypes
 */

/** One registered node type (the legend row and the type-filter source). */
export interface KgNodeTypeRow {
  readonly id: string
  readonly label: string
  readonly layer: 'top' | 'domain'
  readonly extends?: string
  readonly natural_key?: string
  readonly prop_keys: readonly string[]
  readonly foodon_uri?: string
  readonly foodon_id?: string
  readonly synonyms?: readonly string[]
  readonly source: 'builtin-ontology' | 'builtin-food' | 'foodon-imported' | 'nocobase-derived' | 'agent-defined'
  readonly status: 'draft' | 'active' | 'deprecated'
}

/** One KGCL ontology op as the kg.ontologyEdit wire carries it. */
export type KgOntologyOpRow =
  | { readonly op: 'add_node'; readonly target_id: string; readonly label: string; readonly parent_id?: string }
  | { readonly op: 'rename_node'; readonly target_id: string; readonly label: string }
  | { readonly op: 'set_parent'; readonly target_id: string; readonly new_parent_id: string }
  | { readonly op: 'deprecate_node'; readonly target_id: string; readonly replaced_by?: string }
  | {
    readonly op: 'change_cardinality'
    readonly relation_id: string
    readonly domain_id: string
    readonly range_id: string
    readonly min?: number
    readonly max?: number
  }

/** The kg.ontologyEdit receipt (applied previews + the revision row). */
export interface KgOntologyEditResultRow {
  readonly applied: readonly string[]
  readonly revision_id: number
  readonly episode_uuid: string
}

/** One ledger episode from `kg.episodes` (the change feed's row). */
export interface KgEpisodeRow {
  readonly uuid: string
  readonly source: 'ingest' | 'ai-edit' | 'human-edit' | 'rollback'
  readonly name: string
  readonly content: string
  readonly created_at: string
  readonly mentions: number
}

/** One pending gray-zone pair from `kg.reviewQueue`. */
export interface KgReviewEntryRow {
  readonly doc_id: string
  readonly row_id: string
  readonly doc_name: string
  readonly row_name: string
  readonly confidence: number
  readonly reason: string
}

/** The `kg.communities` readout (the precomputed louvain partition). */
export interface KgCommunitiesRow {
  readonly communities: readonly { readonly id: number; readonly nodes: readonly string[] }[]
  readonly modularity: number
  readonly node_count: number
}

/** One rollback receipt from `kg.rollback`. */
export interface KgRollbackResultRow {
  readonly rollback_uuid: string
  readonly rolled_back: string
  readonly retired: number
  readonly restored: number
}

/** One registered relation. */
export interface KgRelationRow {
  readonly id: string
  readonly label: string
  readonly constraints: readonly { readonly domain: string; readonly range: string }[]
  readonly kind: 'object' | 'hierarchical'
  readonly source: 'builtin-ontology' | 'builtin-food' | 'foodon-imported' | 'nocobase-derived' | 'agent-defined'
}

/** One seed hit from `kg.search`. */
export interface KgNodeHitRow {
  readonly id: string
  readonly type: string
  readonly name: string
  readonly natural_key?: string
}

/** One node inside a subgraph result. */
export interface KgSubgraphNodeRow {
  readonly id: string
  readonly type: string
  readonly name: string
  readonly natural_key?: string
  readonly depth: number
}

/** One edge inside a subgraph result. */
export interface KgEdgeRow {
  readonly id: string
  readonly relation: string
  readonly source: string
  readonly target: string
  readonly fact?: string
  readonly asserted_by: 'nocobase' | 'lakehouse' | 'connector' | 'kb' | 'kg-align' | 'ai-edit'
}

/** The `kg.stats` quality extension the panel renders. */
export interface KgQualityRow {
  readonly islands: number
  readonly conflicts: number
  readonly coverage?: { readonly numerator: number; readonly denominator: number; readonly ratio: number }
  readonly last_run_at?: string
}

/** One collection mapping row from `kg.mappings`. */
export interface KgMappingRow {
  readonly name: string
  readonly anchor?: string
  readonly titleField?: string
  readonly fkLinkCount: number
}

/** The `kg.mappings` wire value the panel renders. */
export interface KgMappingsRow {
  readonly file: string
  readonly version: number
  readonly rules: { readonly skipHiddenCollections: boolean; readonly emptyFkNoEdge: boolean; readonly derivesTitle: boolean }
  readonly collections: readonly KgMappingRow[]
  readonly lastRun?: {
    readonly finishedAt: string
    readonly ruleHits: Readonly<Record<string, number>>
    readonly collections: readonly {
      readonly scope: string
      readonly nodesUpserted: number
      readonly edgesUpserted: number
      readonly skipped: boolean
      readonly skippedRelationFields: readonly string[]
    }[]
  }
}

/** The `kg.query` response (a walked canvas plus the compiled plan). */
export interface KgQueryWire {
  readonly nodes: readonly KgSubgraphNodeRow[]
  readonly edges: readonly KgEdgeRow[]
  readonly truncated: boolean
  readonly seeds_resolved: readonly string[]
  readonly template: string
  readonly hops: number
  readonly restated: string
}

/** The merged canvas state one walk produces (subgraph or expand share it). */
export interface KgCanvasGraph {
  readonly nodes: readonly KgSubgraphNodeRow[]
  readonly edges: readonly KgEdgeRow[]
  readonly truncated: boolean
}

/** The `kg.history` frozen subgraph (the replay canvas input). */
export interface KgHistoryRow extends KgCanvasGraph {
  /** The instant the snapshot froze. */
  readonly asOf: string
}
