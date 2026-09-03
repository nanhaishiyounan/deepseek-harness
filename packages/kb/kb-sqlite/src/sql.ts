/**
 * Closed, package-owned SQL resource loading for the kb SQLite store.
 * @module @deepseek-ai/dsh-kb-sqlite/sql
 */

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const SQL_RESOURCES = [
  'begin-immediate',
  'commit',
  'delete-chunk-fts-by-doc',
  'delete-document-by-id',
  'foreign-keys-on',
  'insert-chunk',
  'insert-chunk-fts',
  'insert-document',
  'journal-mode-wal',
  'record-usage',
  'rollback',
  'schema',
  'select-application-id',
  'select-doc-id-by-source',
  'select-hit-by-chunk-id',
  'select-usage',
  'select-user-version',
  'select-vector-candidates',
  'set-application-id',
  'set-user-version-3',
  'stats-chunks',
  'stats-documents',
  'synchronous-full',
  'text-search',
  'text-search-like',
  'trusted-schema-off',
/* jscpd:ignore-start */
// jscpd: intentional symmetry — the closed sql-resource loader convention;
// the kb and session groups stay cross-dependency-free
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
