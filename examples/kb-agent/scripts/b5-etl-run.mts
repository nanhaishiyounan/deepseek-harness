/**
 * W24-B5 business ETL: land the graph in Neo4j and measure island
 * convergence. Phases (all evidence to research/…/b5-ontology/):
 *   1. Read the five core lake.carbon tables from the lakehouse parquet
 *      snapshot; read the two line tables + customer through the same
 *      DuckDB stack over a READ_ONLY postgres attach (the lakehouse catalog
 *      file is lock-held by the running web app; the attach path is the
 *      sync pipeline's own source).
 *   2. Import the legacy kg corpus graph (kb-agent sqlite ledger, live
 *      edges only) as the baseline island measurement.
 *   3. Plan the business graph over the manifest, write nodes/edges with
 *      idempotent MERGE batches, reconcile planned vs source counts.
 *   4. Bridge business entities to corpus graph nodes by exact name/alias
 *      match (SAME_AS), measure islands after, and write the report JSON.
 * Run from the repo root:
 *   node --import tsx/esm examples/kb-agent/scripts/b5-etl-run.mts
 */
import { writeFileSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import { Context } from '@deepseek-ai/cordis'
import * as GraphNeo4j from '@deepseek-ai/dsh-graph-neo4j/src/index.ts'
import {
  BUSINESS_MANIFEST, countIslands, edgeUpsertCypher, nodeUpsertCypher, planGraph, reconcileGraph,
} from '@deepseek-ai/dsh-graph-neo4j/src/index.ts'
import type { PlannedEdge, PlannedNode, SourceRow } from '@deepseek-ai/dsh-graph-neo4j/src/index.ts'
import duckdbApi from '../../../packages/lakehouse/lakehouse-engine/node_modules/@duckdb/node-api/lib/index.js'

/** Evidence paths. */
const OUT_DIR = 'research/2026-10-09-w24-rebuild/b5-ontology'
const LINES: string[] = []
const log = (text: string): void => { LINES.push(text); console.log(text) }

/** Carbon PG the colima stack publishes (Env-overridable). */
const CARBON_DSN = process.env.B5_CARBON_DSN
  ?? 'dbname=postgres host=127.0.0.1 port=51538 user=postgres password=postgres'
const LAKE_FILES = 'workspace/lakehouse/ducklake/files'
const KG_SQLITE = 'examples/kb-agent/workspace/kg-graph.sqlite'

try {
  process.loadEnvFile(new URL('../../../.env', import.meta.url).pathname)
} catch { /* Neo4j password falls back to the documented dev default below */ }

const ctx = new Context()
await ctx.plugin(GraphNeo4j, {
  url: process.env.DSH_NEO4J_URL ?? 'bolt://localhost:7687',
  user: process.env.DSH_NEO4J_USER ?? 'neo4j',
  passwordEnv: 'DSH_NEO4J_PASSWORD',
})
const graph = ctx.neo4jGraph
const health = await graph.health()
log(`[neo4j] available=${String(graph.available())} health=${JSON.stringify(health)}`)
if (!graph.available()) throw new Error('Neo4j unavailable — refusing to run the ETL')

// Phase 0: a clean graph so the report is reproducible on re-runs.
await graph.runWrite('MATCH (n) DETACH DELETE n')
log('[neo4j] cleared existing graph for a reproducible run')

// ── Phase 1: lake reads ────────────────────────────────────────────────────
const DuckDBInstance = (duckdbApi as { DuckDBInstance: { create(url: string, opts?: unknown): Promise<{ connect(): Promise<{ run(sql: string): Promise<unknown>; runAndReadAll(sql: string): Promise<{ getRowsJS(): unknown[][]; columnNames(): string[] }> }> }> } }).DuckDBInstance
const instance = await DuckDBInstance.create(':memory:')
const conn = await instance.connect()
try {
  await conn.run('LOAD postgres')
} catch {
  await conn.run('INSTALL postgres')
  await conn.run('LOAD postgres')
}
await conn.run(`ATTACH '${CARBON_DSN}' AS carbon_pg (TYPE postgres, READ_ONLY)`)

/**
 * Read one table: lake parquet first, PG attach fallback for the unsynced
 * pair. The lake's append-only files carry row VERSIONS (watermark sync on
 * updatedAt appends updated rows); keep only each id's last occurrence —
 * parquet files are ordered by append time, so the last row per id is the
 * current version.
 */
async function readTable(table: string): Promise<SourceRow[]> {
  if (table === 'salesOrderLines' || table === 'purchaseOrderLines' || table === 'customer') {
    const reader = await conn.runAndReadAll(`SELECT * FROM carbon_pg.public."${table}"`)
    const rows = dedupeById(toRows(reader))
    log(`[lake] ${table}: ${String(reader.getRowsJS().length)} rows via READ_ONLY postgres attach → ${String(rows.length)} distinct ids`)
    return rows
  }
  const reader = await conn.runAndReadAll(`SELECT * FROM read_parquet('${LAKE_FILES}/synced_carbon/${table}/*.parquet')`)
  const rows = table === 'itemStockQuantities'
    ? dedupeByPair(toRows(reader))
    : dedupeById(toRows(reader))
  log(`[lake] ${table}: ${String(reader.getRowsJS().length)} rows from lakehouse parquet → ${String(rows.length)} distinct ids (synced_carbon)`)
  return rows
}

/** Keep each id's last row (the latest appended version); ids stringify. */
function dedupeById(rows: SourceRow[]): SourceRow[] {
  const byId = new Map<string, SourceRow>()
  for (const row of rows) {
    const id = idTextOf(row['id'])
    if (id !== undefined) byId.set(id, row)
  }
  return [...byId.values()]
}

/** Keep each (itemId, locationId) pair's last row (stock rows have no id). */
function dedupeByPair(rows: SourceRow[]): SourceRow[] {
  const byPair = new Map<string, SourceRow>()
  for (const row of rows) {
    const itemId = idTextOf(row['itemId'])
    const locationId = idTextOf(row['locationId'])
    if (itemId !== undefined && locationId !== undefined) byPair.set(`${itemId}|${locationId}`, row)
  }
  return [...byPair.values()]
}

/** Accept string/number/BigInt ids (legacy parquet ids are BigInt). */
function idTextOf(value: unknown): string | undefined {
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'bigint') return String(value)
  return undefined
}

/** Zip a DuckDB reader into name-keyed rows. */
function toRows(reader: { getRowsJS(): unknown[][]; columnNames(): string[] }): SourceRow[] {
  const names = reader.columnNames()
  return reader.getRowsJS().map(values => {
    const row: Record<string, unknown> = {}
    names.forEach((name, index) => { row[name] = values[index] })
    return row
  })
}

const CARBON_TABLES = ['item', 'customer', 'supplier', 'salesOrder', 'purchaseOrder', 'salesOrderLines', 'purchaseOrderLines', 'job', 'itemStockQuantities']
const rowsByTable = new Map<string, SourceRow[]>()
for (const table of CARBON_TABLES) rowsByTable.set(table, await readTable(table))

/** Lake ids may arrive as BigInt; stringify number-like ids. */
const idText = (value: unknown): string | undefined =>
  typeof value === 'string' ? value : typeof value === 'bigint' || typeof value === 'number' ? String(value) : undefined

// Synthesize Location rows from the distinct locationId values the synced
// tables reference (the manifest's `location` entry consumes them).
const locationIds = new Set<string>()
for (const table of ['salesOrder', 'job', 'itemStockQuantities']) {
  for (const row of rowsByTable.get(table) ?? []) {
    const locationId = idText(row['locationId'])
    if (locationId !== undefined) locationIds.add(locationId)
  }
}
rowsByTable.set('location', [...locationIds].map(locationId => ({
  id: locationId, name: `Location ${locationId.slice(0, 8)}`,
})))
log(`[lake] location: ${String(locationIds.size)} synthesized rows (distinct locationId)`)

// ── Phase 2: legacy corpus graph import + baseline islands ────────────────
const kg = new DatabaseSync(KG_SQLITE, { readOnly: true })
const kgNodeRows = kg.prepare("SELECT id, type_id, name, summary FROM kg_nodes WHERE tenant_id = 'demo-food-co'").all() as Array<{ id: string; type_id: string; name: string; summary: string | null }>
const kgEdgeRows = kg.prepare("SELECT id, src_id, dst_id, relation_id FROM kg_edges WHERE tenant_id = 'demo-food-co' AND expired_at IS NULL").all() as Array<{ id: string; src_id: string; dst_id: string; relation_id: string }>
const kgNames = new Map<string, string[]>()
for (const row of kgNodeRows) {
  const bucket = kgNames.get(row.name) ?? []
  bucket.push(row.id)
  kgNames.set(row.name, bucket)
}
log(`[kg] corpus graph: ${String(kgNodeRows.length)} nodes / ${String(kgEdgeRows.length)} live edges`)
const kgNodes: PlannedNode[] = kgNodeRows.map(row => ({
  gid: `kg:${row.id}`,
  nodeType: row.type_id,
  name: row.name,
  props: row.summary === null ? {} : { summary: row.summary.slice(0, 300) },
}))
const kgEdges: PlannedEdge[] = kgEdgeRows.map(row => ({
  gid: `kg:edge:${row.id}`,
  relation: row.relation_id,
  source: `kg:${row.src_id}`,
  target: `kg:${row.dst_id}`,
}))
await writeBatch(kgNodes, kgEdges)
const baseline = countIslands(kgNodes.map(node => node.gid), kgEdges)
log(`[islands] baseline (corpus graph only): ${JSON.stringify(baseline)}`)

// ── Phase 3: business graph + reconciliation ──────────────────────────────
const planned = planGraph(rowsByTable, BUSINESS_MANIFEST)
const reconciliation = reconcileGraph(rowsByTable, BUSINESS_MANIFEST, planned)
for (const row of reconciliation.rows) {
  log(`[reconcile] ${row.kind} ${row.key}: source=${String(row.source)} planned=${String(row.planned)} ok=${String(row.ok)}`)
}
log(`[reconcile] overall ok=${String(reconciliation.ok)}`)
await writeBatch(planned.nodes, planned.edges)
log(`[etl] business graph written: ${String(planned.nodes.length)} nodes / ${String(planned.edges.length)} edges`)

// ── Phase 4: cross-source name bridges + islands after ────────────────────
const bridges: PlannedEdge[] = []
for (const mapping of [...BUSINESS_MANIFEST.tables]) {
  for (const row of rowsByTable.get(mapping.table) ?? []) {
    const rowId = row['id']
    const label = row[mapping.labelField]
    if (typeof rowId !== 'string' || typeof label !== 'string') continue
    for (const kgNodeId of kgNames.get(label) ?? []) {
      bridges.push({
        gid: `bridge:${mapping.table}:${rowId}:${kgNodeId}`,
        relation: 'SAME_AS',
        source: `${mapping.system}:${mapping.table}:${rowId}`,
        target: `kg:${kgNodeId}`,
      })
    }
  }
}
// Legacy experts bridge: the lake's legacy_nocobase experts carry the exact
// corpus node names (132/132 probe hits) — they pull expert-anchored islands
// into the business component.
const expertReader = await conn.runAndReadAll(`SELECT id, name FROM read_parquet('${LAKE_FILES}/legacy_nocobase/experts/*.parquet')`)
const expertRows = dedupeById(toRows(expertReader))
const expertNodes: PlannedNode[] = []
for (const row of expertRows) {
  const rowId = idText(row['id'])
  const name = row['name']
  if (rowId === undefined || typeof name !== 'string') continue
  expertNodes.push({ gid: `lake.nocobase:experts:${rowId}`, nodeType: 'Expert', name, props: {} })
  for (const kgNodeId of kgNames.get(name) ?? []) {
    bridges.push({
      gid: `bridge:experts:${rowId}:${kgNodeId}`,
      relation: 'SAME_AS',
      source: `lake.nocobase:experts:${rowId}`,
      target: `kg:${kgNodeId}`,
    })
  }
}
const serviceReader = await conn.runAndReadAll(`SELECT id, name, "expertId" FROM read_parquet('${LAKE_FILES}/legacy_nocobase/expert_services/*.parquet')`)
const serviceRows = dedupeById(toRows(serviceReader))
const serviceNodes: PlannedNode[] = []
for (const row of serviceRows) {
  const rowId = idText(row['id'])
  const name = row['name']
  if (rowId === undefined || typeof name !== 'string') continue
  serviceNodes.push({ gid: `lake.nocobase:expert_services:${rowId}`, nodeType: 'ExpertService', name, props: {} })
  for (const kgNodeId of kgNames.get(name) ?? []) {
    bridges.push({
      gid: `bridge:expert_services:${rowId}:${kgNodeId}`,
      relation: 'SAME_AS',
      source: `lake.nocobase:expert_services:${rowId}`,
      target: `kg:${kgNodeId}`,
    })
  }
  const expertId = idText(row['expertId'])
  if (expertId !== undefined) {
    bridges.push({
      gid: `bridge:expert_services.belongsTo:${rowId}`,
      relation: 'providedBy',
      source: `lake.nocobase:expert_services:${rowId}`,
      target: `lake.nocobase:experts:${expertId}`,
    })
  }
}
log(`[bridge] legacy experts: ${String(expertNodes.length)} + services: ${String(serviceNodes.length)}; name bridges total: ${String(bridges.length)}`)
await writeBatch([...expertNodes, ...serviceNodes], bridges)

// Landed-count reconciliation: the graph's actual per-relation counts vs the
// planned batches (MATCH-missing endpoints drop silently; surface them).
const landedRows = await graph.runReadOnly('MATCH ()-[r]->() RETURN type(r) AS t, count(*) AS c ORDER BY c DESC')
const landed = new Map(landedRows.map(row => [String(row['t']), Number(row['c'])]))
const plannedByRelation = new Map<string, number>()
for (const edge of [...planned.edges, ...bridges, ...kgEdges]) {
  plannedByRelation.set(edge.relation, (plannedByRelation.get(edge.relation) ?? 0) + 1)
}
for (const [relation, plannedCount] of [...plannedByRelation].sort((a, b) => b[1] - a[1])) {
  const landedCount = landed.get(relation) ?? 0
  if (landedCount !== plannedCount) {
    log(`[landed] ${relation}: planned=${String(plannedCount)} landed=${String(landedCount)} (dropped endpoints: ${String(plannedCount - landedCount)})`)
  }
}
const after = await graph.graphStats()
log(`[islands] after (unified graph): ${JSON.stringify(after)}`)
const unifiedNodes = [...kgNodes, ...planned.nodes, ...expertNodes, ...serviceNodes]
const unifiedEdges = [...kgEdges, ...planned.edges, ...bridges]
const computed = countIslands(unifiedNodes.map(node => node.gid), unifiedEdges)
log(`[islands] computed cross-check: ${JSON.stringify(computed)}`)

// LLM-facing probe queries over the landed graph (the acceptance path).
const customerItems = await graph.runReadOnly(
  'MATCH (c:Customer)<-[:orderedBy]-(so:SalesOrder)-[:orderedItem]->(i:Item) RETURN c.name AS customer, so.name AS so, i.name AS item LIMIT 5',
)
log(`[probe] customer→order→item paths: ${String(customerItems.length)} sample=${JSON.stringify(customerItems.slice(0, 2))}`)

writeFileSync(`${OUT_DIR}/03-etl-run.txt`, `${LINES.join('\n')}\n`)
writeFileSync(`${OUT_DIR}/04-islands-report.json`, `${JSON.stringify({
  baseline,
  after,
  computed,
  businessNodes: planned.nodes.length,
  businessEdges: planned.edges.length,
  bridges: bridges.length,
  reconciliation: reconciliation.rows,
}, null, 2)}\n`)
log(`evidence written to ${OUT_DIR}/03-etl-run.txt + 04-islands-report.json`)

/**
 * Write nodes and edges in idempotent MERGE batches keyed by nodeType /
 * relation (50 rows per statement keeps parameters bounded).
 * @param nodes - the planned nodes.
 * @param edges - the planned edges.
 */
async function writeBatch(nodes: readonly PlannedNode[], edges: readonly PlannedEdge[]): Promise<void> {
  const byType = new Map<string, PlannedNode[]>()
  for (const node of nodes) {
    const bucket = byType.get(node.nodeType) ?? []
    bucket.push(node)
    byType.set(node.nodeType, bucket)
  }
  for (const [nodeType, bucket] of byType) {
    for (let offset = 0; offset < bucket.length; offset += 50) {
      await graph.runWrite(nodeUpsertCypher(nodeType), {
        rows: bucket.slice(offset, offset + 50).map(node => ({
          gid: node.gid, nodeType: node.nodeType, name: node.name, props: node.props,
        })),
      })
    }
  }
  const byRelation = new Map<string, PlannedEdge[]>()
  for (const edge of edges) {
    const bucket = byRelation.get(edge.relation) ?? []
    bucket.push(edge)
    byRelation.set(edge.relation, bucket)
  }
  for (const [relation, bucket] of byRelation) {
    for (let offset = 0; offset < bucket.length; offset += 50) {
      await graph.runWrite(edgeUpsertCypher(relation), {
        rows: bucket.slice(offset, offset + 50).map(edge => ({
          gid: edge.gid, source: edge.source, target: edge.target,
        })),
      })
    }
  }
}

kg.close()
await ctx.fiber.dispose()
