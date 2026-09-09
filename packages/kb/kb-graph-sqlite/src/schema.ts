/**
 * SQLite schema ownership and version validation for the graph store.
 * @module @deepseek-ai/dsh-kb-graph-sqlite/schema
 */

import { builtinOntology } from '@deepseek-ai/dsh-kb-graph'
import type { DatabaseSync } from 'node:sqlite'
import { sql } from './sql.ts'

/**
 * Materialize the built-in ontology seed into the persistent registry tables
 * at database creation (the two-layer registry decision: code-registered
 * built-ins also live on disk, so registry reads and schema-drift diffs see
 * them). Idempotent per row: an existing type_id or relation_id row wins.
 * @param db - the handle of a freshly created schema.
 */
function insertBuiltinOntology(db: DatabaseSync): void {
  const seededAt = new Date().toISOString()
  const nodeType = db.prepare(sql('insert-node-type'))
  const relation = db.prepare(sql('insert-relation'))
  const seed = builtinOntology()
  for (const type of seed.nodeTypes) {
    nodeType.run(
      String(type.id),
      type.label,
      type.description ?? null,
      type.layer,
      type.extends === undefined ? null : String(type.extends),
      JSON.stringify(type.props),
      type.naturalKey ?? null,
      type.source,
      type.status,
      seededAt,
      seededAt,
    )
  }
  for (const entry of seed.relations) {
    const [primary] = entry.constraints
    relation.run(
      String(entry.id),
      entry.label,
      entry.description ?? null,
      primary === undefined ? null : String(primary.domain),
      primary === undefined ? null : String(primary.range),
      JSON.stringify(entry.constraints.map(constraint => ({ domain: String(constraint.domain), range: String(constraint.range) }))),
      entry.kind,
      entry.inverseOf === undefined ? null : String(entry.inverseOf),
      entry.source,
      seededAt,
      seededAt,
    )
  }
}

/**
 * Current graph store schema version: 2 is the seven-table property graph
 * (registry / nodes+FTS5 / edges / aliases / source runs / usage counters).
 * Pre-release builds reject any other on-disk version: a v1 `triples`
 * database must be deleted and rebuilt — the graph is derived, provenance-
 * traceable data, so a full pipeline run restores it.
 */
export const SCHEMA_VERSION = 2
/** Application id reserved for DeepSeek Harness knowledge-graph databases ("DSHG"). */
export const KB_GRAPH_SQLITE_APPLICATION_ID = 1146308687

function integerField(row: unknown, field: string, path: string): number {
  const value = (row as Record<string, unknown> | undefined)?.[field]
  /* v8 ignore next 3 -- SQLite PRAGMA statements always return integer fields. */
  if (typeof value !== 'number') {
    throw new Error(`graph database at "${path}" returned a non-integer "${field}"`)
  }
  return value
}

/* jscpd:ignore-start */
// jscpd: intentional symmetry — the ownership-validation template shared with
// the kb store; the kb and lakehouse groups stay cross-dependency-free
// (Agent Note 2026-08-29-duplication-gate-intentional-symmetry).
/**
 * Open and validate a graph SQLite database: secure connection pragmas, then
 * an immediate transaction that initializes a fresh database or rejects any
 * on-disk schema this build does not own. A v1 database (user_version 1)
 * fails here with the rebuild instruction; no migration path exists.
 * @param db - an open `node:sqlite` database handle.
 * @param path - the database location used in ownership diagnostics.
 * @throws when the on-disk schema version or application identity is foreign.
 */
export function validateSchema(db: DatabaseSync, path: string): void {
  db.exec(sql('trusted-schema-off'))
  db.exec(sql('foreign-keys-on'))
  if (path !== ':memory:') db.exec(sql('journal-mode-wal'))
  db.exec(sql('synchronous-full'))
  let began = false
  try {
    db.exec(sql('begin-immediate'))
    began = true
    const onDisk = integerField(db.prepare(sql('select-user-version')).get(), 'user_version', path)
    const applicationId = integerField(db.prepare(sql('select-application-id')).get(), 'application_id', path)
    if (onDisk === 0 && applicationId !== 0) {
      throw new Error(`graph database at "${path}" has an unversioned schema or application identity`)
    }
    if (onDisk !== 0 && onDisk !== SCHEMA_VERSION) {
      throw new Error(
        `graph database at "${path}" has schema version ${onDisk}, incompatible with this build (${SCHEMA_VERSION}); delete the file and rebuild the graph from its sources`,
      )
    }
    if (onDisk !== 0 && applicationId !== KB_GRAPH_SQLITE_APPLICATION_ID) {
      throw new Error(
        `graph database at "${path}" has application id ${applicationId}, expected ${KB_GRAPH_SQLITE_APPLICATION_ID}`,
      )
    }
    if (onDisk === 0) {
      db.exec(sql('schema'))
      insertBuiltinOntology(db)
      db.exec(sql('set-application-id'))
      db.exec(sql('set-user-version-2'))
    }
    db.exec(sql('commit'))
    began = false
  } catch (error: unknown) {
    /* v8 ignore else -- a failed begin-immediate leaves no transaction to roll back. */
    if (began) {
      /* v8 ignore next 4 -- retain the original ownership failure if rollback fails too. */
      try {
        db.exec(sql('rollback'))
      } catch {
        // The original schema-ownership failure remains actionable.
      }
    }
    throw error
  }
}
/* jscpd:ignore-end */
