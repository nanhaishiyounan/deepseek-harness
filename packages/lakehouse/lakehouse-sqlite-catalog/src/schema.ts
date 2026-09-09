/**
 * SQLite schema ownership and version validation for the lakehouse catalog.
 * @module @deepseek-ai/dsh-lakehouse-sqlite-catalog/schema
 */

import type { DatabaseSync } from 'node:sqlite'
import { sql } from './sql.ts'

/** Current lakehouse catalog schema version; pre-release builds reject any other on-disk version. */
export const SCHEMA_VERSION = 1
/** Application id reserved for DeepSeek Harness lakehouse catalog databases ("DSHL"). */
export const LAKEHOUSE_SQLITE_APPLICATION_ID = 1146308684

function integerField(row: unknown, field: string, path: string): number {
  const value = (row as Record<string, unknown> | undefined)?.[field]
  /* v8 ignore next 3 -- SQLite PRAGMA statements always return integer fields. */
  if (typeof value !== 'number') {
    throw new Error(`lakehouse catalog at "${path}" returned a non-integer "${field}"`)
  }
  return value
}

/* jscpd:ignore-start */
// jscpd: intentional symmetry — the ownership-validation template shared with
// the kb store; the kb and lakehouse groups stay cross-dependency-free
// (Agent Note 2026-08-29-duplication-gate-intentional-symmetry).
/**
 * Open and validate a lakehouse catalog database: secure connection pragmas,
 * then an immediate transaction that initializes a fresh database or rejects
 * any on-disk schema this build does not own. A database whose tables
 * already exist without a schema version fails through the initialization
 * statements themselves, so ownership is never guessed.
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
      throw new Error(`lakehouse catalog at "${path}" has an unversioned schema or application identity`)
    }
    if (onDisk !== 0 && onDisk !== SCHEMA_VERSION) {
      throw new Error(
        `lakehouse catalog at "${path}" has schema version ${onDisk}, incompatible with this build (${SCHEMA_VERSION})`,
      )
    }
    if (onDisk !== 0 && applicationId !== LAKEHOUSE_SQLITE_APPLICATION_ID) {
      throw new Error(
        `lakehouse catalog at "${path}" has application id ${applicationId}, expected ${LAKEHOUSE_SQLITE_APPLICATION_ID}`,
      )
    }
    if (onDisk === 0) {
      db.exec(sql('schema'))
      db.exec(sql('set-application-id'))
      db.exec(sql('set-user-version-1'))
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
