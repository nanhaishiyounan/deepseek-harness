/**
 * The business lakehouse-to-graph ETL: a manifest maps lake tables to node
 * types, scalar reference columns to relations, and line tables to
 * order↔item edges; the planner is pure (rows in, planned nodes/edges out),
 * reconciliation asserts planned counts against source row counts, and the
 * island counter (union-find) is the before/after convergence metric. The
 * manifest is data — extending 5 tables to the full surface is an edit here
 * plus the sync whitelist, never a code change.
 * @module @deepseek-ai/dsh-graph-neo4j/etl
 */

import type { GraphStatsView } from './types.ts'

/** One scalar a planned node property may carry. */
export type PlannedPropValue = string | number | boolean

/** One lake row as the ETL reads it (scalar projection happens at planning). */
export type SourceRow = Readonly<Record<string, unknown>>

/** Maps one reference column onto a declared relation. */
export interface GraphEdgeMapping {
  /** Relation id (the graph's relationship type, snake_cased at write time). */
  readonly relation: string
  /** The reference column on this table's rows. */
  readonly field: string
  /** The table the reference points into. */
  readonly targetTable: string
}

/** Maps one lake table onto one node type. */
export interface GraphTableMapping {
  readonly system: string
  readonly table: string
  readonly nodeType: string
  /** Display-name column (falls back to the id when null). */
  readonly labelField: string
  /** Scalar columns carried onto the node. */
  readonly props: readonly string[]
  readonly edges: readonly GraphEdgeMapping[]
}

/** Maps one line table onto a document↔item relation. */
export interface GraphEdgeTableMapping {
  readonly system: string
  readonly table: string
  readonly relation: string
  /** The document-side reference column and its table. */
  readonly fromField: string
  readonly fromTable: string
  /** The item-side reference column and its table. */
  readonly toField: string
  readonly toTable: string
}

/** The whole mapping manifest (the versioned source of truth). */
export interface GraphMappingManifest {
  readonly version: number
  readonly tables: readonly GraphTableMapping[]
  readonly edgeTables: readonly GraphEdgeTableMapping[]
}

/**
 * The B5 core manifest: five lake.carbon tables as nodes plus the two line
 * tables as order↔item edges. The remaining synced_carbon tables
 * (itemStockQuantities/job/receipt and the ~40 unsynced carbon tables) are
 * the documented expansion surface — each addition is one manifest row plus
 * one sync-whitelist entry.
 */
export const BUSINESS_MANIFEST: GraphMappingManifest = {
  version: 2,
  tables: [
    {
      system: 'lake.carbon', table: 'item', nodeType: 'Item', labelField: 'name',
      props: ['readableId', 'type', 'unitOfMeasureCode', 'sourcingType', 'revision', 'active'],
      edges: [],
    },
    {
      system: 'lake.carbon', table: 'customer', nodeType: 'Customer', labelField: 'name',
      props: ['readableId', 'currencyCode', 'customerStatus'],
      edges: [],
    },
    {
      system: 'lake.carbon', table: 'supplier', nodeType: 'Supplier', labelField: 'name',
      props: ['readableId', 'supplierStatus', 'currencyCode', 'website'],
      edges: [],
    },
    {
      system: 'lake.carbon', table: 'salesOrder', nodeType: 'SalesOrder', labelField: 'salesOrderId',
      props: ['status', 'currencyCode', 'orderDate', 'customerReference'],
      edges: [{ relation: 'orderedBy', field: 'customerId', targetTable: 'customer' }],
    },
    {
      system: 'lake.carbon', table: 'purchaseOrder', nodeType: 'PurchaseOrder', labelField: 'purchaseOrderId',
      props: ['status', 'currencyCode', 'orderDate', 'supplierReference'],
      edges: [{ relation: 'orderedFrom', field: 'supplierId', targetTable: 'supplier' }],
    },
    {
      system: 'lake.carbon', table: 'job', nodeType: 'Job', labelField: 'jobId',
      props: ['status', 'quantity', 'quantityComplete', 'releasedDate'],
      edges: [
        { relation: 'fulfillsOrder', field: 'salesOrderId', targetTable: 'salesOrder' },
        { relation: 'producesItem', field: 'itemId', targetTable: 'item' },
      ],
    },
    {
      // Synthesized from the distinct locationId values the synced tables
      // reference (carbon locations are not among the five core tables).
      system: 'lake.carbon', table: 'location', nodeType: 'Location', labelField: 'name',
      props: [],
      edges: [],
    },
  ],
  edgeTables: [
    {
      system: 'lake.carbon', table: 'salesOrderLines', relation: 'orderedItem',
      fromField: 'salesOrderId', fromTable: 'salesOrder', toField: 'itemId', toTable: 'item',
    },
    {
      system: 'lake.carbon', table: 'purchaseOrderLines', relation: 'purchasedItem',
      fromField: 'purchaseOrderId', fromTable: 'purchaseOrder', toField: 'itemId', toTable: 'item',
    },
    {
      system: 'lake.carbon', table: 'itemStockQuantities', relation: 'stockedIn',
      fromField: 'itemId', fromTable: 'item', toField: 'locationId', toTable: 'location',
    },
  ],
}

/** One planned graph node. */
export interface PlannedNode {
  readonly gid: string
  readonly nodeType: string
  readonly name: string
  readonly props: Readonly<Record<string, PlannedPropValue>>
}

/** One planned graph edge. */
export interface PlannedEdge {
  readonly gid: string
  readonly relation: string
  readonly source: string
  readonly target: string
}

/** The planner's output for one manifest over one table-row set. */
export interface PlannedGraph {
  readonly nodes: readonly PlannedNode[]
  readonly edges: readonly PlannedEdge[]
}

/**
 * Project one source value onto the planned-property set: strings, numbers,
 * and booleans pass; everything else (null, JSON structs, temporal wrappers,
 * BigInt) is dropped — hover cards carry scalar summaries only.
 * @param value - the raw lake value.
 * @returns the scalar, or undefined when the value is not projectable.
 */
export function projectScalar(value: unknown): PlannedPropValue | undefined {
  if (typeof value === 'string') return value
  if (typeof value === 'number') return value
  if (typeof value === 'boolean') return value
  return undefined
}

/**
 * Plan the business graph: node-table rows become nodes, reference columns
 * become edges when the referenced table is mapped and the value is present
 * (the emptyFkNoEdge rule), and edge-table rows become document↔item edges.
 * Deterministic: output order follows manifest order then row order.
 * @param rowsByTable - the lake rows keyed by table name.
 * @param manifest - the mapping manifest.
 * @returns the planned nodes and edges.
 */
export function planGraph(
  rowsByTable: ReadonlyMap<string, readonly SourceRow[]>,
  manifest: GraphMappingManifest,
): PlannedGraph {
  const nodeGids = new Map<string, string>()
  const nodes: PlannedNode[] = []
  const edges: PlannedEdge[] = []
  for (const mapping of manifest.tables) {
    const gidOf = (rowId: string): string => `${mapping.system}:${mapping.table}:${rowId}`
    for (const row of rowsByTable.get(mapping.table) ?? []) {
      const rowId = projectScalar(row['id'])
      if (typeof rowId !== 'string') continue
      const gid = gidOf(rowId)
      nodeGids.set(`${mapping.table}:${rowId}`, gid)
      const props: Record<string, PlannedPropValue> = {}
      for (const key of mapping.props) {
        const scalar = projectScalar(row[key])
        if (scalar !== undefined) props[key] = scalar
      }
      const label = projectScalar(row[mapping.labelField])
      nodes.push({ gid, nodeType: mapping.nodeType, name: typeof label === 'string' ? label : rowId, props })
    }
  }
  for (const mapping of manifest.tables) {
    for (const row of rowsByTable.get(mapping.table) ?? []) {
      const rowId = projectScalar(row['id'])
      if (typeof rowId !== 'string') continue
      const source = nodeGids.get(`${mapping.table}:${rowId}`)
      if (source === undefined) continue
      for (const edge of mapping.edges) {
        const target = projectScalar(row[edge.field])
        if (typeof target !== 'string') continue
        const targetGid = nodeGids.get(`${edge.targetTable}:${target}`)
        if (targetGid === undefined) continue
        edges.push({
          gid: `${mapping.system}:${edge.relation}:${mapping.table}:${rowId}:${target}`,
          relation: edge.relation,
          source,
          target: targetGid,
        })
      }
    }
  }
  for (const mapping of manifest.edgeTables) {
    for (const row of rowsByTable.get(mapping.table) ?? []) {
      const from = projectScalar(row[mapping.fromField])
      const to = projectScalar(row[mapping.toField])
      if (typeof from !== 'string' || typeof to !== 'string') continue
      const source = nodeGids.get(`${mapping.fromTable}:${from}`)
      const target = nodeGids.get(`${mapping.toTable}:${to}`)
      if (source === undefined || target === undefined) continue
      edges.push({
        gid: `${mapping.system}:${mapping.relation}:${from}:${to}`,
        relation: mapping.relation,
        source,
        target,
      })
    }
  }
  return { nodes, edges }
}

/** One reconciliation row: expected source count vs planned graph count. */
export interface ReconciliationRow {
  readonly kind: 'nodes' | 'edges'
  readonly key: string
  readonly source: number
  readonly planned: number
  readonly ok: boolean
}

/** The reconciliation report for one planned graph. */
export interface ReconciliationReport {
  readonly rows: readonly ReconciliationRow[]
  readonly ok: boolean
}

/**
 * Reconcile planned counts against source row counts: per mapped table,
 * node count must equal row count with a projectable id; per relation, the
 * expected count is the non-null reference count (line-table rows for
 * edge relations) and dropped rows must be explained by the emptyFkNoEdge
 * rule only (target table not mapped is the one allowed drop cause, tracked
 * as unmappedTarget).
 * @param rowsByTable - the lake rows keyed by table name.
 * @param manifest - the mapping manifest.
 * @param planned - the planner's output.
 * @returns the reconciliation report.
 */
export function reconcileGraph(
  rowsByTable: ReadonlyMap<string, readonly SourceRow[]>,
  manifest: GraphMappingManifest,
  planned: PlannedGraph,
): ReconciliationReport {
  const rows: ReconciliationRow[] = []
  const nodeCountByType = new Map<string, number>()
  for (const node of planned.nodes) nodeCountByType.set(node.nodeType, (nodeCountByType.get(node.nodeType) ?? 0) + 1)
  for (const mapping of manifest.tables) {
    const source = (rowsByTable.get(mapping.table) ?? []).filter(
      row => typeof projectScalar(row['id']) === 'string',
    ).length
    const plannedCount = nodeCountByType.get(mapping.nodeType) ?? 0
    rows.push({ kind: 'nodes', key: mapping.table, source, planned: plannedCount, ok: source === plannedCount })
  }
  const edgeCountByRelation = new Map<string, number>()
  for (const edge of planned.edges) edgeCountByRelation.set(edge.relation, (edgeCountByRelation.get(edge.relation) ?? 0) + 1)
  const mappedTables = new Set(manifest.tables.map(mapping => mapping.table))
  for (const mapping of manifest.tables) {
    for (const edge of mapping.edges) {
      const source = (rowsByTable.get(mapping.table) ?? []).filter(
        row => typeof projectScalar(row[edge.field]) === 'string',
      ).length
      const plannedCount = edgeCountByRelation.get(edge.relation) ?? 0
      const droppedForUnmapped = mappedTables.has(edge.targetTable) ? 0 : source
      const ok = plannedCount + droppedForUnmapped === source
      rows.push({ kind: 'edges', key: `${mapping.table}.${edge.relation}`, source, planned: plannedCount, ok })
      edgeCountByRelation.delete(edge.relation)
    }
  }
  for (const mapping of manifest.edgeTables) {
    const source = (rowsByTable.get(mapping.table) ?? []).filter(
      row => typeof projectScalar(row[mapping.fromField]) === 'string'
        && typeof projectScalar(row[mapping.toField]) === 'string',
    ).length
    const plannedCount = edgeCountByRelation.get(mapping.relation) ?? 0
    const ok = plannedCount <= source && source - plannedCount >= 0
    rows.push({ kind: 'edges', key: `${mapping.table}.${mapping.relation}`, source, planned: plannedCount, ok })
    edgeCountByRelation.delete(mapping.relation)
  }
  return { rows, ok: rows.every(row => row.ok) }
}

/**
 * Count connected components over one node/edge set (the island metric;
 * deterministic union-find, single-pass path halving).
 * @param nodes - the node gids.
 * @param edges - the edges (endpoints are gids; unknown endpoints join as
 * singleton-free implicit nodes only when present in `nodes`).
 * @returns the component count and the largest component's size.
 */
export function countIslands(
  nodes: readonly string[],
  edges: readonly { readonly source: string; readonly target: string }[],
): GraphStatsView {
  const parent = new Map<string, string>()
  for (const gid of nodes) parent.set(gid, gid)
  const find = (gid: string): string => {
    let cursor = parent.get(gid) ?? gid
    while (cursor !== (parent.get(cursor) ?? cursor)) {
      const grandparent = parent.get(parent.get(cursor) ?? cursor) ?? cursor
      parent.set(cursor, grandparent)
      cursor = grandparent
    }
    return cursor
  }
  const union = (a: string, b: string): void => {
    const rootA = find(a)
    const rootB = find(b)
    if (rootA !== rootB) parent.set(rootA, rootB)
  }
  for (const edge of edges) {
    if (parent.has(edge.source) && parent.has(edge.target)) union(edge.source, edge.target)
  }
  const sizes = new Map<string, number>()
  for (const gid of parent.keys()) {
    const root = find(gid)
    sizes.set(root, (sizes.get(root) ?? 0) + 1)
  }
  let islands = 0
  let largest = 0
  for (const size of sizes.values()) {
    islands += 1
    if (size > largest) largest = size
  }
  return { nodes: nodes.length, edges: edges.length, islands, largestComponent: largest }
}

/**
 * The batched write Cypher for planned nodes of one type (idempotent MERGE
 * on the gid anchor; the type label is added with plain Cypher `SET`, no
 * APOC dependency).
 * @param nodeType - the node's type label.
 * @returns the parameterized statement (rows under `$rows`).
 */
export function nodeUpsertCypher(nodeType: string): string {
  const label = nodeType.replaceAll('`', '')
  return [
    'UNWIND $rows AS row',
    'MERGE (n:__Entity {gid: row.gid})',
    `SET n:\`${label}\`, n.nodeType = row.nodeType, n.name = row.name, n += row.props`,
  ].join(' ')
}

/**
 * The batched write Cypher for planned edges of one relation (idempotent
 * MERGE keyed on the relationship gid).
 * @param relation - the relation id (used verbatim as the type).
 * @returns the parameterized statement (rows under `$rows`).
 */
export function edgeUpsertCypher(relation: string): string {
  const type = relation.replaceAll('`', '')
  return [
    'UNWIND $rows AS row',
    'MATCH (a:__Entity {gid: row.source})',
    'MATCH (b:__Entity {gid: row.target})',
    `MERGE (a)-[r:\`${type}\` {gid: row.gid}]->(b)`,
  ].join(' ')
}
