/**
 * Closed, package-owned SQL resource loading for the lakehouse SQLite catalog.
 * @module @deepseek-ai/dsh-lakehouse-sqlite-catalog/sql
 */

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const SQL_RESOURCES = [
  'begin-immediate',
  'commit',
  'delete-table-by-identity',
  'foreign-keys-on',
  'insert-transfer',
  'journal-mode-wal',
  'record-usage',
  'rollback',
  'schema',
  'select-application-id',
  'select-table-by-identity',
  'select-tables-by-tenant',
  'select-transfers',
  'select-usage',
  'select-user-version',
  'set-application-id',
  'set-user-version-1',
  'synchronous-full',
  'trusted-schema-off',
  'upsert-table',
/* jscpd:ignore-start */
// jscpd: intentional symmetry — the closed sql-resource loader convention;
// the kb, session, and lakehouse groups stay cross-dependency-free
// (Agent Note 2026-08-29-duplication-gate-intentional-symmetry).
] as const

/** A resource basename selected exclusively by package code. */
export type SqlResourceName = typeof SQL_RESOURCES[number]

const cache = new Map<SqlResourceName, string>()

/**
 * Load an immutable SQL statement by closed resource name.
 * @param name - package-owned resource basename.
 * @returns the resource text.
 */
export function sql(name: SqlResourceName): string {
  const cached = cache.get(name)
  if (cached !== undefined) return cached
  const statement = readFileSync(
    fileURLToPath(new URL(`../resources/sql/${name}.sql`, import.meta.url)),
    'utf8',
  )
  cache.set(name, statement)
  return statement
}
/* jscpd:ignore-end */
