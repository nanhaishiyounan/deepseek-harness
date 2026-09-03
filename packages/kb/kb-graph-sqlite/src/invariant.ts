/**
 * Package-owned invariant companion for `@deepseek-ai/dsh-kb-graph-sqlite`.
 * @module @deepseek-ai/dsh-kb-graph-sqlite/invariant
 */

/* jscpd:ignore-start */
import type { Context } from '@deepseek-ai/cordis'
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'

const PACKAGE_NAME = '@deepseek-ai/dsh-kb-graph-sqlite'

/** Cordis companion plugin name. */
export const name = 'kb-graph-sqlite-invariant'
/** Service required before the companion can reserve package ownership. */
export const inject = ['invariants']

/**
 * No runtime invariant: a pure Service Provider — it opens one SQLite file
 * and registers it on the seam; connection lifecycle is the plugin effect's
 * own disposal, already covered by the store's close tests.
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
