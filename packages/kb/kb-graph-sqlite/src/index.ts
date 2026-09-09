/**
 * SQLite store provider for the knowledge-graph seam: one `node:sqlite`
 * database holding tenant-isolated triples with an entities projection for
 * search, opened and validated at load (fail-loud on schema mismatch).
 * @module @deepseek-ai/dsh-kb-graph-sqlite
 */

import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { KbGraphError } from '@deepseek-ai/dsh-kb-graph'
import { SqliteGraphStore } from './store.ts'

export { SCHEMA_VERSION } from './schema.ts'
export { SqliteGraphStore } from './store.ts'
export type { SqliteGraphStoreOptions } from './store.ts'

/** Cordis plugin name used by loader diagnostics. */
export const name = 'kb-graph-sqlite'
/** Services required by the graph store provider. */
export const inject = ['kbGraph']

/* jscpd:ignore-start */
// jscpd: intentional symmetry — the SQLite store plugin convention (config +
// warning-filtered loader + eager open/register); the kb and session groups
// stay cross-dependency-free (Agent Note 2026-08-29-duplication-gate-intentional-symmetry).
/** Default wait for another SQLite connection's write reservation. */
export const DEFAULT_BUSY_TIMEOUT_MS = 5_000

/** Plugin configuration. */
export interface Config {
  /** SQLite database path (`:memory:` supported), resolved against the process cwd when relative. */
  path: string
  /** Maximum wait for another SQLite connection's lock; defaults to 5,000 ms. */
  busyTimeoutMs?: number
}

export const Config: z<Config> = z.object({
  path: z.string().required(),
  busyTimeoutMs: z.number().step(1).min(0).default(DEFAULT_BUSY_TIMEOUT_MS),
})
// jscpd: intentional symmetry — the isomorphic node:sqlite warning-filter
// loader convention; the kb and session groups stay cross-dependency-free
// (Agent Note 2026-08-29-duplication-gate-intentional-symmetry).
let nodeSqlite: Promise<typeof import('node:sqlite')> | undefined

/** Load Node SQLite once so concurrent loads share one warning-filter lifetime. */
function loadNodeSqlite(): Promise<typeof import('node:sqlite')> {
  nodeSqlite ??= importNodeSqlite()
  return nodeSqlite
}

/** Import Node 22's SQLite dependency without its process-wide experimental warning. */
async function importNodeSqlite(): Promise<typeof import('node:sqlite')> {
  const emitWarning = Reflect.get(process, 'emitWarning')
  /* v8 ignore start -- Node 22 alone emits this warning; primary coverage runs on Node 24. */
  const filteredEmitWarning = (warning: string | Error, ...args: unknown[]): void => {
    const message = warning instanceof Error ? warning.message : warning
    const first = args[0]
    const type = warning instanceof Error
      ? warning.name
      : typeof first === 'string'
        ? first
        : typeof first === 'object' && first !== null && 'type' in first
          ? first.type
          : undefined
    if (message === 'SQLite is an experimental feature and might change at any time'
      && type === 'ExperimentalWarning') return
    Reflect.apply(emitWarning, process, [warning, ...args])
  }
  Reflect.set(process, 'emitWarning', filteredEmitWarning)
  try {
    return await import('node:sqlite')
  } finally {
    Reflect.set(process, 'emitWarning', emitWarning)
  }
  /* v8 ignore stop */
}
/* jscpd:ignore-end */

/**
 * Re-register persisted registry rows the runtime registry lacks (the
 * two-layer registry's boot read: nocobase-derived and agent-defined types
 * survive restarts). Parents register before the types extending them via a
 * fixpoint pass; a row whose parent never lands fails loud as corruption.
 * @param store - the freshly opened store.
 * @param ctx - context whose `kbGraph` runtime receives the registrations.
 * @returns the disposers for every registration made.
 */
async function reregisterStoredRegistry(ctx: Context, store: SqliteGraphStore): Promise<Array<() => void>> {
  const graph = ctx.kbGraph
  const disposers: Array<() => void> = []
  const pendingTypes = (await store.listStoredNodeTypes()).filter(type => graph.nodeType(type.id) === undefined)
  while (pendingTypes.length > 0) {
    const before = pendingTypes.length
    for (let index = 0; index < pendingTypes.length; index += 1) {
      const type = pendingTypes[index] as (typeof pendingTypes)[number]
      if (type.extends !== undefined && graph.nodeType(type.extends) === undefined) continue
      disposers.push(graph.registerNodeType(type))
      pendingTypes.splice(index, 1)
      index -= 1
    }
    if (pendingTypes.length === before) {
      throw new KbGraphError(
        `stored node types with unresolvable parents: ${pendingTypes.map(type => String(type.id)).join(', ')}`,
        'KB_GRAPH_SQLITE_REGISTRY_CORRUPT',
      )
    }
  }
  const pendingRelations = (await store.listStoredRelations()).filter(relation => graph.relation(relation.id) === undefined)
  while (pendingRelations.length > 0) {
    const before = pendingRelations.length
    for (let index = 0; index < pendingRelations.length; index += 1) {
      const relation = pendingRelations[index] as (typeof pendingRelations)[number]
      const endpointsMissing = relation.constraints.some(
        constraint => graph.nodeType(constraint.domain) === undefined || graph.nodeType(constraint.range) === undefined,
      )
      /* v8 ignore next -- fixpoint clause permutation; outcomes covered by the cross- and self-inverse tests */
      const inverseMissing = relation.inverseOf !== undefined && graph.relation(relation.inverseOf) === undefined
        && relation.inverseOf !== relation.id
      if (endpointsMissing || inverseMissing) continue
      disposers.push(graph.registerRelation(relation))
      pendingRelations.splice(index, 1)
      index -= 1
    }
    if (pendingRelations.length === before) {
      throw new KbGraphError(
        `stored relations with unresolvable endpoints: ${pendingRelations.map(relation => String(relation.id)).join(', ')}`,
        'KB_GRAPH_SQLITE_REGISTRY_CORRUPT',
      )
    }
  }
  return disposers
}

/**
 * Open the configured database and register it as the graph store provider.
 * The open itself is eager: an unwritable path or a foreign on-disk schema
 * fails composition load instead of the first query. Persisted registry rows
 * re-register into the runtime registry here, so derived types survive
 * restarts.
 * @param ctx - context whose `kbGraph` service receives the registration.
 * @param config - validated plugin configuration.
 */
export async function apply(ctx: Context, config: Config): Promise<void> {
  const sqlite = await loadNodeSqlite()
  const store = new SqliteGraphStore({
    path: config.path,
    busyTimeoutMs: config.busyTimeoutMs ?? DEFAULT_BUSY_TIMEOUT_MS,
  }, sqlite.DatabaseSync)
  const registryDisposers = await reregisterStoredRegistry(ctx, store)
  const unregister = ctx.kbGraph.registerStoreProvider(store)
  ctx.effect(() => () => {
    for (const dispose of registryDisposers) dispose()
    unregister()
    store.close()
  }, 'kb-graph-sqlite.store')
}
/* jscpd:ignore-end */
