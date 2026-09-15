/**
 * kg domain contract: the graph page's read surface over the knowledge-graph
 * seam's registry and property-graph v2 store — the ontology legend
 * (`kg.schema`), name→node seed resolution (`kg.search`), k-hop neighborhoods
 * (`kg.subgraph`), one-hop visualization expansion (`kg.expand`), and the size
 * counters (`kg.stats`). Read-only; graph writes belong to the kg-build
 * pipeline. Every method fails with the structured `kg-not-composed` error
 * when no knowledge-graph seam is composed or `kgEnabled` has not opted the
 * domain in.
 */

import type { RpcRequest, RpcResponse } from './rpc.ts'

/** One registered node type as the wire projects it (the legend row). */
export interface KgNodeTypeView {
  readonly id: string
  readonly label: string
  readonly layer: 'top' | 'domain'
  /** Parent type (subClassOf semantics), when one is declared. */
  readonly extends?: string
  /** Business natural-key property name — the idempotent merge anchor. */
  readonly natural_key?: string
  /** Property keys of the closed shape, in definition order. */
  readonly prop_keys: readonly string[]
  /** Registry provenance. */
  readonly source: 'builtin-ontology' | 'builtin-food' | 'nocobase-derived' | 'agent-defined'
  /** Draft types accept writes but stay out of model-facing enumerations. */
  readonly status: 'draft' | 'active'
}

/** One registered relation as the wire projects it. */
export interface KgRelationView {
  readonly id: string
  readonly label: string
  /** Legal (domain → range) endpoint pairs; empty means unrestricted. */
  readonly constraints: readonly { readonly domain: string; readonly range: string }[]
  readonly kind: 'object' | 'hierarchical'
  readonly source: 'builtin-ontology' | 'builtin-food' | 'nocobase-derived' | 'agent-defined'
}

/** One node hit from seed resolution. */
export interface KgNodeHitView {
  readonly id: string
  readonly type: string
  readonly name: string
  readonly natural_key?: string
}

/** One node inside a subgraph result, with its walk depth from the seeds. */
export interface KgSubgraphNodeView {
  readonly id: string
  readonly type: string
  readonly name: string
  readonly natural_key?: string
  readonly depth: number
}

/** One edge as the wire projects it (provenance folded to its source system). */
export interface KgEdgeView {
  readonly id: string
  readonly relation: string
  readonly source: string
  readonly target: string
  /** Relation description text, when the build recorded one. */
  readonly fact?: string
  /** Which source system asserted the fact. */
  readonly asserted_by: 'nocobase' | 'lakehouse' | 'connector' | 'kb'
}

/** The `kg.mappings` response value: the pipeline's mappings readout. */
export interface KgMappingsWireValue {
  readonly file: string
  readonly version: number
  readonly rules: { readonly skipHiddenCollections: boolean; readonly emptyFkNoEdge: boolean; readonly derivesTitle: boolean }
  readonly collections: readonly {
    readonly name: string
    readonly anchor?: string
    readonly titleField?: string
    readonly fkLinkCount: number
  }[]
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

/** Shared subgraph result projection. */
export interface KgSubgraphView {
  readonly nodes: readonly KgSubgraphNodeView[]
  readonly edges: readonly KgEdgeView[]
  readonly truncated: boolean
}

/** Graph-page methods. */
export interface KgApi {
  /** Read the ontology registry (legend and type-filter source). */
  schema(
    request: RpcRequest<Record<string, never>>,
    signal?: AbortSignal,
  ): Promise<RpcResponse<{
    ontology_version: string
    node_types: readonly KgNodeTypeView[]
    relations: readonly KgRelationView[]
    /** Newest registry-change audit rows (newest first). */
    revisions?: readonly { readonly id: number; readonly summary: string; readonly created_at: string }[]
  }>>

  /**
   * Read the kg-build mappings file state (the rule panel's source): the
   * loaded collection whitelist plus the last run's per-collection outcome.
   */
  mappings(
    request: RpcRequest<Record<string, never>>,
    signal?: AbortSignal,
  ): Promise<RpcResponse<KgMappingsWireValue>>

  /** Resolve entity names or aliases to node hits (the seed picker). */
  search(
    request: RpcRequest<{ query: string; type?: string; k?: number }>,
    signal?: AbortSignal,
  ): Promise<RpcResponse<{ nodes: readonly KgNodeHitView[] }>>

  /**
   * Read the k-hop neighborhood around name seeds (resolved server-side);
   * `relation_types` filters edges at the projection layer, matching the
   * `kg_subgraph` tool's semantics.
   */
  subgraph(
    request: RpcRequest<{
      seeds: readonly string[]
      hops?: number
      max_nodes?: number
      relation_types?: readonly string[]
    }>,
    signal?: AbortSignal,
  ): Promise<RpcResponse<KgSubgraphView & { seeds_resolved: readonly string[]; unresolved?: readonly string[] }>>

  /** Read the one-hop neighborhood of one minted node id (canvas expansion). */
  expand(
    request: RpcRequest<{ node_id: string; limit?: number }>,
    signal?: AbortSignal,
  ): Promise<RpcResponse<KgSubgraphView>>

  /** Count stored triples and distinct entities. */
  stats(
    request: RpcRequest<Record<string, never>>,
    signal?: AbortSignal,
  ): Promise<RpcResponse<{ triples: number; entities: number; node_types: number; relations: number }>>
}
