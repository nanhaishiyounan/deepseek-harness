/**
 * Package-owned invariant companion for `@deepseek-ai/dsh-kb-graph`.
 * @module @deepseek-ai/dsh-kb-graph/invariant
 */

/* jscpd:ignore-start */
import type { Context } from '@deepseek-ai/cordis'
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'

const PACKAGE_NAME = '@deepseek-ai/dsh-kb-graph'

/** Cordis companion plugin name. */
export const name = 'kb-graph-invariant'
/** Service required before the companion can reserve package ownership. */
export const inject = ['invariants']

/**
 * No runtime invariant: a pure Service Definition — its inject face is the
 * provider registry plus query orchestration; it emits no cordis events and
 * owns no cross-plugin mutable state beyond the registry itself.
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
