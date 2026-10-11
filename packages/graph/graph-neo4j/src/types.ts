/**
 * Shared vocabulary for the Neo4j graph capability: the structured error,
 * the wire-facing graph views (nodes, edges, page results, stats), and the
 * append-only ontology version chain's storage types.
 * @module @deepseek-ai/dsh-graph-neo4j/types
 */

/** Error codes the Neo4j graph surfaces raise. */
export type GraphNeo4jErrorCode =
  | 'NEO4J_DRIVER_UNAVAILABLE'
  | 'NEO4J_QUERY_FAILED'

/** Structured error the service and tools rethrow. */
export class GraphNeo4jError extends Error {
  /** The structured failure code. */
  readonly code: GraphNeo4jErrorCode

  /**
   * @param message - operator-facing reason.
   * @param code - the structured rejection code.
   */
  constructor(message: string, code: GraphNeo4jErrorCode) {
    super(message)
    this.name = 'GraphNeo4jError'
    this.code = code
  }
}

/** One scalar a graph node property may carry on the wire. */
export type GraphPropValue = string | number | boolean

/** One graph node as the graph-page surfaces project it. */
export interface GraphNodeView {
  /** Stable graph id (`gid` property on the Neo4j node). */
  readonly id: string
  /** Primary node type (the `nodeType` property). */
  readonly type: string
  /** Display name. */
  readonly name: string
  /** Scalar property summary for hover cards (JSON values are skipped). */
  readonly props: Readonly<Record<string, GraphPropValue>>
  /** Total incident edges (the node-size encoding). */
  readonly degree: number
}

/** One graph edge as the graph-page surfaces project it. */
export interface GraphEdgeView {
  readonly id: string
  /** Relation type (the Neo4j relationship type). */
  readonly relation: string
  readonly source: string
  readonly target: string
}

/** Whole-graph quality counters (the island-convergence metric's face). */
export interface GraphStatsView {
  readonly nodes: number
  readonly edges: number
  /** Connected-component count over live edges (0 when the graph is empty). */
  readonly islands: number
  /** Size of the largest connected component. */
  readonly largestComponent: number
}

/** One node hit from name/gid substring search. */
export interface GraphNodeHit {
  readonly id: string
  readonly type: string
  readonly name: string
  readonly degree: number
}

/** One incident edge in a node detail (the relations panel's row). */
export interface GraphNodeRelation {
  readonly relation: string
  readonly direction: 'out' | 'in'
  readonly otherId: string
  readonly otherName: string
  readonly otherType: string
}

/** The `node` mode's payload: hover/selection card data. */
export interface GraphNodeDetail {
  readonly node: GraphNodeView
  readonly outRelations: readonly GraphNodeRelation[]
  readonly inRelations: readonly GraphNodeRelation[]
}

/** One JSON-LD graph node (the serialized ontology document's atom). */
export interface JsonLdGraphNode {
  readonly '@id': string
  readonly '@type': string
  /** Term slots stay writable: serializers assemble nodes incrementally. */
  [term: string]: unknown
}

/** The serialized ontology document: one @context plus a sorted @graph. */
export interface OntologyJsonLdDocument {
  readonly '@context': Readonly<Record<string, string>>
  readonly '@graph': readonly JsonLdGraphNode[]
}

/** One ontology version row as stored in Neo4j (append-only chain). */
export interface OntologyVersionMeta {
  readonly id: string
  readonly version: number
  readonly name: string
  /** Where the draft came from (`llm-induction` | `manual-workbench` | `seed`). */
  readonly source: string
  readonly createdAt: string
  /** The previous head's id (the version chain link). */
  readonly prev?: string
}
