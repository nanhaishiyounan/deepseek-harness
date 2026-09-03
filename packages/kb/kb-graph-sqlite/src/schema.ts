/**
 * SQLite schema ownership and version validation for the graph store.
 * @module @deepseek-ai/dsh-kb-graph-sqlite/schema
 */

import type { DatabaseSync } from 'node:sqlite'

/** Current graph store schema version; pre-release builds reject any other on-disk version. */
export const SCHEMA_VERSION = 1
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

/**
 * Open and validate a graph SQLite database: secure connection pragmas, then
 * an immediate transaction that initializes a fresh database or rejects any
 * on-disk schema this build does not own.
 * @param db - an open `node:sqlite` database handle.
 * @param path - the database location used in ownership diagnostics.
 * @throws when the on-disk schema version or application identity is foreign.
 */
export function validateSchema(db: DatabaseSync, path: string): void {
  db.exec('PRAGMA trusted_schema = OFF')
  db.exec('PRAGMA foreign_keys = ON')
  if (path !== ':memory:') db.exec('PRAGMA journal_mode = WAL')
  db.exec('PRAGMA synchronous = FULL')
  let began = false
  try {
    db.exec('BEGIN IMMEDIATE')
    began = true
    const onDisk = integerField(db.prepare('PRAGMA user_version').get(), 'user_version', path)
    const applicationId = integerField(db.prepare('PRAGMA application_id').get(), 'application_id', path)
    if (onDisk === 0 && applicationId !== 0) {
      throw new Error(`graph database at "${path}" has an unversioned schema or application identity`)
    }
    if (onDisk !== 0 && onDisk !== SCHEMA_VERSION) {
      throw new Error(
        `graph database at "${path}" has schema version ${onDisk}, incompatible with this build (${SCHEMA_VERSION})`,
      )
    }
    if (onDisk !== 0 && applicationId !== KB_GRAPH_SQLITE_APPLICATION_ID) {
      throw new Error(
        `graph database at "${path}" has application id ${applicationId}, expected ${KB_GRAPH_SQLITE_APPLICATION_ID}`,
      )
    }
    if (onDisk === 0) {
      db.exec(`
        CREATE TABLE triples (
          id             INTEGER PRIMARY KEY,
          tenant_id      TEXT NOT NULL,
          subject_type   TEXT NOT NULL,
          subject_id     TEXT NOT NULL,
          predicate      TEXT NOT NULL,
          object_type    TEXT NOT NULL,
          object_id      TEXT NOT NULL,
          source_path    TEXT,
          UNIQUE (tenant_id, subject_type, subject_id, predicate, object_type, object_id)
        ) STRICT;

        CREATE INDEX triples_tenant_subject ON triples (tenant_id, subject_type, subject_id);
        CREATE INDEX triples_tenant_object ON triples (tenant_id, object_type, object_id);
      `)
      db.exec(`PRAGMA application_id = ${String(KB_GRAPH_SQLITE_APPLICATION_ID)}`)
      db.exec(`PRAGMA user_version = ${String(SCHEMA_VERSION)}`)
    }
    db.exec('COMMIT')
    began = false
  } catch (error: unknown) {
    /* v8 ignore else -- a failed begin-immediate leaves no transaction to roll back. */
    if (began) {
      /* v8 ignore next 4 -- retain the original ownership failure if rollback fails too. */
      try {
        db.exec('ROLLBACK')
      } catch {
        // The original schema-ownership failure remains actionable.
      }
    }
    throw error
  }
}
