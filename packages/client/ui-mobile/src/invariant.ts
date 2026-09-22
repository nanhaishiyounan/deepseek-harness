/**
 * Package-owned invariant companion for `@deepseek-ai/dsh-client-ui-mobile`.
 * @module @deepseek-ai/dsh-client-ui-mobile/invariant
 */

/* jscpd:ignore-start */
import type { Context } from '@deepseek-ai/cordis'
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'

const PACKAGE_NAME = '@deepseek-ai/dsh-client-ui-mobile'

/** Cordis companion plugin name. */
export const name = 'client-ui-mobile-invariant'
/** Service required before the companion can reserve package ownership. */
export const inject = ['invariants']

/**
 * No runtime invariant: the mobile page is a statically linked Vite entry
 * outside the cordis client tree; its data path is the shared /api gateway
 * whose contract is asserted by the web e2e lane (mobile-* scenarios) against
 * the real carrier, and its history fold is unit-tested over raw session
 * events.
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
