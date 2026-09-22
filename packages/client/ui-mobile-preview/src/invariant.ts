/**
 * Package-owned invariant companion for `@deepseek-ai/dsh-client-ui-mobile-preview`.
 * @module @deepseek-ai/dsh-client-ui-mobile-preview/invariant
 */

/* jscpd:ignore-start */
import type { Context } from '@deepseek-ai/cordis'
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'

const PACKAGE_NAME = '@deepseek-ai/dsh-client-ui-mobile-preview'

/** Cordis companion plugin name. */
export const name = 'client-ui-mobile-preview-invariant'
/** Service required before the companion can reserve package ownership. */
export const inject = ['invariants']

/**
 * No runtime invariant: the preview is a same-origin iframe over a page whose
 * data path is the shared gateway; the iframe's own loading and interaction
 * are asserted by the web e2e lane's mobile-preview scenario against the
 * real carrier.
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
