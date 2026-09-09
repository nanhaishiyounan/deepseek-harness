/**
 * Package-owned invariant companion for `@deepseek-ai/dsh-lakehouse-duckdb`.
 * @module @deepseek-ai/dsh-lakehouse-duckdb/invariant
 */

/* jscpd:ignore-start */
import type { Context } from '@deepseek-ai/cordis'
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'

const PACKAGE_NAME = '@deepseek-ai/dsh-lakehouse-duckdb'

/** Cordis companion plugin name. */
export const name = 'lakehouse-duckdb-invariant'
/** Service required before the companion can reserve package ownership. */
export const inject = ['invariants']

/**
 * No runtime invariant: registry consistency is enforced by the typed
 * registration API and the engine's own availability probing, not a
 * continuous in-process relation.
 */
const install: InvariantInstaller = () => {}

/**
 * Register this package's invariant companion.
 * @param ctx - Cordis context carrying the invariant service.
 * @returns the installed registration's disposer after setup succeeds.
 */
export const apply = (ctx: Context): Promise<() => void> =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
/* jscpd:ignore-end */
