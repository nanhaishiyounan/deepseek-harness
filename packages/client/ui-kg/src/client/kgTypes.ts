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
  readonly source: 'builtin-ontology' | 'builtin-food' | 'nocobase-derived' | 'agent-defined'
  readonly status: 'draft' | 'active'
}

/** One registered relation. */
export interface KgRelationRow {
  readonly id: string
  readonly label: string
  readonly constraints: readonly { readonly domain: string; readonly range: string }[]
  readonly kind: 'object' | 'hierarchical'
  readonly source: 'builtin-ontology' | 'builtin-food' | 'nocobase-derived' | 'agent-defined'
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
  readonly asserted_by: 'nocobase' | 'lakehouse' | 'connector' | 'kb'
}

/** The merged canvas state one walk produces (subgraph or expand share it). */
export interface KgCanvasGraph {
  readonly nodes: readonly KgSubgraphNodeRow[]
  readonly edges: readonly KgEdgeRow[]
  readonly truncated: boolean
}
