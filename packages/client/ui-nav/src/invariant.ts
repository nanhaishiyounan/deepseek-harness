/**
 * Package-owned invariant companion for `@deepseek-ai/dsh-client-ui-nav`.
 * @module @deepseek-ai/dsh-client-ui-nav/invariant
 */

/* jscpd:ignore-start */
import type { Context } from '@deepseek-ai/cordis'
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'

const PACKAGE_NAME = '@deepseek-ai/dsh-client-ui-nav'

/** Cordis companion plugin name. */
export const name = 'client-ui-nav-invariant'
/** Service required before the companion can reserve package ownership. */
export const inject = ['invariants']

/**
 * No runtime invariant: a pure-presentation plugin registering the nav shell
 * into the layout-owned slot and its own menu row into the seat it declares —
 * view switching rides the view-context service's published switch, and the
 * plugin emits no cordis events and owns no cross-plugin mutable state.
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
