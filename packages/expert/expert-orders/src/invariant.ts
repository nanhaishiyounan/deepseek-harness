/**
 * Package-owned invariant companion for `@deepseek-ai/dsh-expert-orders`.
 * @module @deepseek-ai/dsh-expert-orders/invariant
 */

/* jscpd:ignore-start */
import type { Context } from '@deepseek-ai/cordis'
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'

const PACKAGE_NAME = '@deepseek-ai/dsh-expert-orders'

/** Cordis companion plugin name. */
export const name = 'expert-orders-invariant'
/** Service required before the companion can reserve package ownership. */
export const inject = ['invariants']

/**
 * No runtime invariant: order rows live in the external NocoBase source of
 * truth; the state machine's legality is enforced at each transition by the
 * runtime's own error paths, not by an in-process relation this companion
 * could observe.
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
