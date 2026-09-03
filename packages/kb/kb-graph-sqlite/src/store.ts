/**
 * The SQLite `GraphStore` provider: tenant-isolated triples with idempotent
 * writes, one-hop neighbor expansion, two-hop path search, and entity search
 * over the entities projection.
 * @module @deepseek-ai/dsh-kb-graph-sqlite/store
 */

import { resolve } from 'node:path'
import type { DatabaseSync } from 'node:sqlite'
import { KbGraphError } from '@deepseek-ai/dsh-kb-graph'
import type { GraphStore, KbGraphEntity, KbGraphEntityType, KbGraphPredicate, KbGraphStoredTriple, KbGraphTriple } from '@deepseek-ai/dsh-kb-graph'
import { validateSchema } from './schema.ts'

type DatabaseSyncConstructor = typeof import('node:sqlite')['DatabaseSync']

/** One raw triple row. */
interface TripleRow {
  id: number
  tenant_id: string
  subject_type: string
  subject_id: string
  predicate: string
  object_type: string
  object_id: string
  source_path: string | null
}

/** Constructor options for {@link SqliteGraphStore}. */
export interface SqliteGraphStoreOptions {
  /** Database path (`:memory:` supported) or cwd-relative path. */
  readonly path: string
  /** Maximum wait for another SQLite connection's lock. */
  readonly busyTimeoutMs: number
}

function throwIfAborted(signal: AbortSignal | undefined): void {
  // An aborted AbortSignal always carries a reason per the WHATWG standard.
  /* v8 ignore next 2 */
  if (signal?.aborted) throw signal.reason ?? new DOMException('The operation was aborted', 'AbortError')
}

function rowToTriple(row: TripleRow): KbGraphStoredTriple {
  return {
    rowId: row.id,
    tenantId: row.tenant_id,
    subject: { type: row.subject_type as KbGraphEntityType, id: row.subject_id },
    predicate: row.predicate as KbGraphPredicate,
    object: { type: row.object_type as KbGraphEntityType, id: row.object_id },
    ...(row.source_path === null ? {} : { sourcePath: row.source_path }),
  }
}

/* jscpd:ignore-start */
// jscpd: intentional symmetry — the SQLite store open/validate/close lifecycle;
// the kb and session groups stay cross-dependency-free
// (Agent Note 2026-08-29-duplication-gate-intentional-symmetry).
/**
 * The `node:sqlite`-backed `GraphStore`. Opens and validates the database in
 * the constructor (fail-loud on schema mismatch); one instance owns one
 * connection until {@link SqliteGraphStore.close}.
 */
export class SqliteGraphStore implements GraphStore {
  readonly id = 'kb-graph-sqlite'
  private readonly db: DatabaseSync
  private closed = false

  constructor(options: SqliteGraphStoreOptions, Database: DatabaseSyncConstructor) {
    this.db = new Database(options.path === ':memory:' ? ':memory:' : resolve(options.path), {
      timeout: options.busyTimeoutMs,
    })
    try {
      validateSchema(this.db, options.path)
    } catch (error: unknown) {
      this.db.close()
      throw error
    }
  }

  available(): boolean {
    return !this.closed
  }

  /** Close the owned connection; idempotent. */
  close(): void {
    if (this.closed) return
    this.closed = true
    this.db.close()
  }
  /* jscpd:ignore-end */

  /** Reject use of a closed store. */
  private assertLive(): void {
    if (this.closed) {
      throw new KbGraphError('the kb-graph-sqlite store connection is closed', 'KB_GRAPH_SQLITE_CLOSED')
    }
  }

  async putTriples(tenantId: string, triples: readonly KbGraphTriple[], signal?: AbortSignal): Promise<number> {
    // node:sqlite is synchronous; the await keeps the store contract a promise.
    await Promise.resolve()
    this.assertLive()
    throwIfAborted(signal)
    this.db.exec('BEGIN IMMEDIATE')
    let inserted = 0
    try {
      const statement = this.db.prepare(`
        INSERT INTO triples (tenant_id, subject_type, subject_id, predicate, object_type, object_id, source_path)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT (tenant_id, subject_type, subject_id, predicate, object_type, object_id) DO NOTHING
      `)
      for (const triple of triples) {
        throwIfAborted(signal)
        const result = statement.run(
          tenantId,
          triple.subject.type,
          triple.subject.id,
          triple.predicate,
          triple.object.type,
          triple.object.id,
          triple.sourcePath ?? null,
        ) as { changes: number | bigint }
        inserted += Number(result.changes)
      }
      this.db.exec('COMMIT')
    } catch (error: unknown) {
      this.rollback()
      throw error
    }
    return inserted
  }

  async neighbors(
    tenantId: string,
    entity: KbGraphEntity,
    _signal?: AbortSignal,
  ): Promise<KbGraphStoredTriple[]> {
    await Promise.resolve()
    this.assertLive()
    const rows = this.db.prepare(`
      SELECT * FROM triples
      WHERE tenant_id = ?
        AND ((subject_type = ? AND subject_id = ?) OR (object_type = ? AND object_id = ?))
      ORDER BY id
    `).all(tenantId, entity.type, entity.id, entity.type, entity.id) as unknown as TripleRow[]
    return rows.map(rowToTriple)
  }

  async twoHopPaths(tenantId: string, entity: KbGraphEntity, target: KbGraphEntity, _signal?: AbortSignal): Promise<KbGraphStoredTriple[]> {
    await Promise.resolve()
    this.assertLive()
    // Path of at most two edges entity — mid — target, undirected: the first
    // edge touches the start and the second the target at a shared middle
    // endpoint that is neither endpoint itself. Each branch below fixes one
    // direction combination, so the middle endpoint is pinned by a single
    // equality per branch — a spur, a fan-in edge, or a target self-loop
    // shares no qualifying middle and cannot pose as a bridge.
    const endpoints = [entity.type, entity.id, target.type, target.id]
    const branch = [...endpoints, ...endpoints]
    const rows = this.db.prepare(`
      SELECT DISTINCT e1.id AS first_id, e2.id AS second_id
      FROM triples e1
      JOIN triples e2 ON e2.id <> e1.id AND e2.tenant_id = e1.tenant_id
      WHERE e1.tenant_id = ?
        AND (
          (e1.subject_type = ? AND e1.subject_id = ? AND e2.object_type = ? AND e2.object_id = ?
            AND e1.object_type = e2.subject_type AND e1.object_id = e2.subject_id
            AND NOT (e1.object_type = ? AND e1.object_id = ?) AND NOT (e1.object_type = ? AND e1.object_id = ?))
          OR (e1.subject_type = ? AND e1.subject_id = ? AND e2.subject_type = ? AND e2.subject_id = ?
            AND e1.object_type = e2.object_type AND e1.object_id = e2.object_id
            AND NOT (e1.object_type = ? AND e1.object_id = ?) AND NOT (e1.object_type = ? AND e1.object_id = ?))
          OR (e1.object_type = ? AND e1.object_id = ? AND e2.object_type = ? AND e2.object_id = ?
            AND e1.subject_type = e2.subject_type AND e1.subject_id = e2.subject_id
            AND NOT (e1.subject_type = ? AND e1.subject_id = ?) AND NOT (e1.subject_type = ? AND e1.subject_id = ?))
          OR (e1.object_type = ? AND e1.object_id = ? AND e2.subject_type = ? AND e2.subject_id = ?
            AND e1.subject_type = e2.object_type AND e1.subject_id = e2.object_id
            AND NOT (e1.subject_type = ? AND e1.subject_id = ?) AND NOT (e1.subject_type = ? AND e1.subject_id = ?))
        )
    `).all(tenantId, ...branch, ...branch, ...branch, ...branch) as unknown as Array<{ first_id: number; second_id: number }>
    const rowIds = new Set<number>()
    for (const path of rows) {
      rowIds.add(path.first_id)
      rowIds.add(path.second_id)
    }
    // A direct edge is itself a path of at most two edges; include it in
    // either direction.
    const direct = this.db.prepare(`
      SELECT id FROM triples
      WHERE tenant_id = ?
        AND ((subject_type = ? AND subject_id = ? AND object_type = ? AND object_id = ?)
          OR (subject_type = ? AND subject_id = ? AND object_type = ? AND object_id = ?))
    `).all(
      tenantId,
      entity.type, entity.id, target.type, target.id,
      target.type, target.id, entity.type, entity.id,
    ) as unknown as Array<{ id: number }>
    for (const row of direct) {
      rowIds.add(row.id)
    }
    if (rowIds.size === 0) return []
    const fetch = this.db.prepare('SELECT * FROM triples WHERE id = ?')
    const seen = new Map<number, KbGraphStoredTriple>()
    for (const rowId of rowIds) {
      // The ids come from queries on this same synchronous connection, so
      // every fetch lands.
      seen.set(rowId, rowToTriple(fetch.get(rowId) as unknown as TripleRow))
    }
    return [...seen.values()].sort((a, b) => a.rowId - b.rowId)
  }

  async searchEntities(
    tenantId: string,
    query: string,
    type: KbGraphEntityType | undefined,
    k: number,
    _signal?: AbortSignal,
  ): Promise<KbGraphEntity[]> {
    await Promise.resolve()
    this.assertLive()
    const rows = this.db.prepare(`
      SELECT subject_type AS type, subject_id AS id FROM triples WHERE tenant_id = ?
      UNION
      SELECT object_type AS type, object_id AS id FROM triples WHERE tenant_id = ?
    `).all(tenantId, tenantId) as unknown as Array<{ type: string; id: string }>
    const entities = new Map<string, KbGraphEntity>()
    for (const row of rows) {
      if (type !== undefined && row.type !== type) continue
      if (!row.id.toLowerCase().includes(query.toLowerCase())) continue
      // The UNION above already deduplicates (type, id) pairs.
      entities.set(`${row.type}:${row.id}`, { type: row.type as KbGraphEntityType, id: row.id })
      if (entities.size >= k) break
    }
    return [...entities.values()]
  }

  async stats(tenantId: string | undefined, _signal?: AbortSignal): Promise<{ triples: number; entities: number }> {
    await Promise.resolve()
    this.assertLive()
    const triples = (this.db.prepare(
      'SELECT COUNT(*) AS n FROM triples WHERE (? IS NULL OR tenant_id = ?)',
    ).get(tenantId ?? null, tenantId ?? null) as { n: number }).n
    const entityRow = this.db.prepare(`
      SELECT COUNT(*) AS n FROM (
        SELECT subject_type AS type, subject_id AS id FROM triples WHERE (? IS NULL OR tenant_id = ?)
        UNION
        SELECT object_type AS type, object_id AS id FROM triples WHERE (? IS NULL OR tenant_id = ?)
      )
    `).get(tenantId ?? null, tenantId ?? null, tenantId ?? null, tenantId ?? null) as { n: number }
    return { triples, entities: entityRow.n }
  }

  /** Roll back the open transaction, retaining the original failure. */
  private rollback(): void {
    try {
      this.db.exec('ROLLBACK')
    } catch {
      // The original statement failure remains actionable.
    }
  }
}
