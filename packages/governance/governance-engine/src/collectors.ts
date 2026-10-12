/**
 * Cross-source inventory collectors: one live read per source, tolerant of a
 * source being offline (that source returns zero assets with a note instead
 * of failing the batch). The lakehouse rides the engine's table listing, the
 * graph and ontology ride the Neo4j service, the KB rides WeKnora's HTTP
 * API, the business tables ride Gravitino's metalake catalog (the hub
 * registration), and the legacy NocoBase export rides the lakehouse's
 * `legacy_nocobase` schema.
 * @module @deepseek-ai/dsh-governance-engine/collectors
 */

import { DatabaseSync } from 'node:sqlite'
import type {
  GovernanceAsset, GovernanceSource,
} from '@deepseek-ai/dsh-governance'

/** Runtime handles the collectors read (all optional at the type level). */
export interface CollectorDeps {
  /** Lakehouse engine service (`ctx.lakehouseEngine`) when composed. */
  readonly lakehouseEngine?: {
    listTables(): Promise<readonly { schema: string; table: string; rowCount: number }[]>
  }
  /** Neo4j graph service (`ctx.neo4jGraph`) when composed. */
  readonly neo4jGraph?: {
    available(): boolean
    runReadOnly(cypher: string): Promise<readonly Record<string, unknown>[]>
    listOntologyVersions(): Promise<readonly { id: string; name: string; version: number }[]>
  }
  /** Gravitino base URL for the metalake inventory (business tables). */
  readonly gravitinoUrl?: string
  /** Gravitino metalake name. */
  readonly metalake: string
  /** WeKnora base URL for the knowledge-base inventory. */
  readonly weknoraUrl?: string
  /** WeKnora API key (Bearer) for the knowledge-base inventory. */
  readonly weknoraApiKey?: string
  /** kg-graph SQLite path: the graph/ontology fallback when no Neo4j service is composed. */
  readonly kgGraphPath?: string
  /** kb-sqlite path: the KB inventory fallback when the WeKnora API refuses. */
  readonly kbSqlitePath?: string
}

/** The (failing) fetch shape the collectors tolerate. */
async function safe(label: string, run: () => Promise<GovernanceAsset[]>): Promise<GovernanceAsset[]> {
  try {
    return await run()
  } catch (error: unknown) {
    return [{ source: 'legacy', qualifiedName: `_collector.${label}`, name: `collector ${label} offline`, detail: String(error).slice(0, 160) }]
  }
}

/** Identify a table's inventory source from its lakehouse schema. */
function sourceOfSchema(schema: string): GovernanceSource {
  if (schema === 'legacy_nocobase') return 'legacy'
  if (schema === 'carbon') return 'business'
  return 'lakehouse'
}

/**
 * Collect the live cross-source inventory.
 * @param deps - the source handles and endpoints.
 * @returns every asset the sources expose right now.
 */
export async function collectInventory(deps: CollectorDeps): Promise<readonly GovernanceAsset[]> {
  const assets: GovernanceAsset[] = []

  assets.push(...await safe('lakehouse', async () => {
    if (deps.lakehouseEngine === undefined) return []
    const tables = await deps.lakehouseEngine.listTables()
    return tables.map(table => ({
      source: sourceOfSchema(table.schema),
      qualifiedName: `lake.${table.schema}.${table.table}`,
      name: table.table,
      count: table.rowCount,
      detail: `schema ${table.schema}`,
    }))
  }))

  assets.push(...await safe('graph', async () => {
    if (deps.neo4jGraph !== undefined && deps.neo4jGraph.available()) {
      const rows = await deps.neo4jGraph.runReadOnly(
        'MATCH (n) RETURN labels(n)[0] AS label, count(n) AS n ORDER BY n DESC LIMIT 50',
      )
      return rows.map(row => ({
        source: 'graph' as const,
        qualifiedName: `graph.${String(row.label)}`,
        name: String(row.label),
        count: Number(row.n),
        detail: 'Neo4j node label',
      }))
    }
    // Fallback: the kg-graph SQLite ledger's node-type registry (the same
    // registry the kg-build pipeline writes; Neo4j keeps the live instances,
    // the ledger keeps the schema).
    if (deps.kgGraphPath === undefined) return []
    const db = new DatabaseSync(deps.kgGraphPath)
    try {
      const rows = db.prepare('SELECT type_id, label FROM kg_node_types ORDER BY type_id').all() as { type_id?: unknown; label?: unknown }[]
      return rows.map(row => ({
        source: 'graph' as const,
        qualifiedName: `graph.${String(row.type_id)}`,
        name: String(row.label ?? row.type_id),
        detail: 'kg-graph registry node type',
      }))
    } finally {
      db.close()
    }
  }))

  assets.push(...await safe('ontology', async () => {
    if (deps.neo4jGraph !== undefined && deps.neo4jGraph.available()) {
      const versions = await deps.neo4jGraph.listOntologyVersions()
      return versions.map(version => ({
        source: 'ontology' as const,
        qualifiedName: `ontology.${version.name}`,
        name: version.name,
        detail: `v${String(version.version)} (${version.id})`,
      }))
    }
    if (deps.kgGraphPath === undefined) return []
    const db = new DatabaseSync(deps.kgGraphPath)
    try {
      const rows = db.prepare('SELECT id, summary FROM kg_ontology_revisions ORDER BY id DESC LIMIT 20').all() as { id?: unknown; summary?: unknown }[]
      return rows.map(row => ({
        source: 'ontology' as const,
        qualifiedName: `ontology.revision-${String(row.id)}`,
        name: typeof row.summary === 'string' ? row.summary : `revision ${String(row.id)}`,
        detail: `kg-graph registry revision ${String(row.id)}`,
      }))
    } finally {
      db.close()
    }
  }))

  assets.push(...await safe('kb', async () => {
    if (deps.kbSqlitePath !== undefined) {
      // The kb-sqlite provider is the deployment's declared fallback store;
      // its documents table carries the corpus inventory (B4 dual-provider).
      const db = new DatabaseSync(deps.kbSqlitePath)
      try {
        const rows = db.prepare('SELECT id, title FROM documents ORDER BY id LIMIT 200').all() as { id?: unknown; title?: unknown }[]
        return rows.map(row => ({
          source: 'kb' as const,
          qualifiedName: `kb.${String(row.title ?? row.id)}`,
          name: String(row.title ?? row.id),
          detail: `kb-sqlite 文档 ${String(row.id)}`,
        }))
      } finally {
        db.close()
      }
    }
    if (deps.weknoraUrl === undefined) return []
    const response = await fetch(`${deps.weknoraUrl}/api/v0/knowledge-base`, {
      headers: {
        Accept: 'application/json',
        ...(deps.weknoraApiKey === undefined || deps.weknoraApiKey === '' ? {} : { Authorization: `Bearer ${deps.weknoraApiKey}` }),
      },
      signal: AbortSignal.timeout(6000),
    })
    if (!response.ok) throw new Error(`weknora list ${String(response.status)}`)
    const body = await response.json() as { data?: { kb_id?: unknown; name?: unknown; doc_count?: unknown; chunk_num?: unknown }[] }
    return (body.data ?? []).map(kb => ({
      source: 'kb' as const,
      qualifiedName: `kb.${String(kb.name)}`,
      name: String(kb.name),
      ...(kb.doc_count === undefined ? {} : { count: Number(kb.doc_count) }),
      ...(typeof kb.chunk_num === 'number' ? { detail: `chunks ${kb.chunk_num}` } : {}),
    }))
  }))

  assets.push(...await safe('business', async () => {
    if (deps.gravitinoUrl === undefined) return []
    const response = await fetch(`${deps.gravitinoUrl}/api/metalakes/${deps.metalake}/catalogs/carbon-business/schemas`, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(6000),
    })
    if (!response.ok) throw new Error(`gravitino schemas ${String(response.status)}`)
    const body = await response.json() as { schemas?: { name?: unknown }[] }
    const tables: GovernanceAsset[] = []
    for (const schema of body.schemas ?? []) {
      const name = typeof schema.name === 'string' ? schema.name : ''
      const tableResponse = await fetch(`${deps.gravitinoUrl}/api/metalakes/${deps.metalake}/catalogs/carbon-business/schemas/${name}/tables`, {
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(6000),
      })
      if (!tableResponse.ok) continue
      const tableBody = await tableResponse.json() as { tables?: { name?: unknown }[] }
      for (const table of tableBody.tables ?? []) {
        tables.push({
          source: 'business',
          qualifiedName: `carbon.${name}.${String(table.name)}`,
          name: String(table.name),
          detail: `PG schema ${name} (via Gravitino)`,
        })
      }
    }
    return tables
  }))

  return assets
}
