/**
 * Package-owned invariant companion for `@deepseek-ai/dsh-view-actions`.
 * @module @deepseek-ai/dsh-view-actions/invariant
 */

/* jscpd:ignore-start */
import type { Context } from '@deepseek-ai/cordis'
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'

const PACKAGE_NAME = '@deepseek-ai/dsh-view-actions'

/** Cordis companion plugin name. */
export const name = 'view-actions-invariant'
/** Service required before the companion can reserve package ownership. */
export const inject = ['invariants']

/**
 * No runtime invariant: the single provider slot is validated at registration
 * and applies return directly to their caller; the seam publishes no
 * independent request/result audit stream beyond the tool-call events the
 * model surface already logs.
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
