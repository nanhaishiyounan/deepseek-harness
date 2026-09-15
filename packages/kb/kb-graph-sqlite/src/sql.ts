/**
 * Closed, package-owned SQL resource loading for the graph store.
 * @module @deepseek-ai/dsh-kb-graph-sqlite/sql
 */

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const SQL_RESOURCES = [
  'begin-immediate',
  'commit',
  'count-conflicting-facts',
  'count-edges',
  'count-island-nodes',
  'count-nodes',
  'count-nodes-by-type',
  'insert-build-run',
  'foreign-keys-on',
  'insert-alias',
  'insert-edge',
  'insert-node',
  'insert-node-type',
  'insert-ontology-revision',
  'insert-relation',
  'journal-mode-wal',
  'merge-edge',
  'rollback',
  'schema',
  'select-alias',
  'select-aliases-for-search',
  'select-application-id',
  'select-latest-build-run',
  'select-edge-by-anchor',
  'select-edges-between',
  'select-edges-by-nodes',
  'select-edges-by-rowids',
  'select-neighbor-edges',
  'select-node-by-anchor',
  'select-node-by-id',
  'select-node-types',
  'select-nodes-by-type',
  'select-ontology-revisions',
  'select-nodes-for-search',
  'select-relations',
  'select-source-run',
  'select-subgraph-nodes',
  'select-two-hop-pairs',
  'select-user-version',
  'set-application-id',
  'set-user-version-4',
  'synchronous-full',
  'trusted-schema-off',
  'tombstone-by-source',
  'update-node-by-id',
  'upsert-node-type',
  'upsert-relation',
  'upsert-source-run',
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
