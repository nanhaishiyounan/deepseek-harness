/**
 * Package-owned invariant companion for `@deepseek-ai/dsh-lakehouse-engine`.
 * @module @deepseek-ai/dsh-lakehouse-engine/invariant
 */

/* jscpd:ignore-start */
import type { Context } from '@deepseek-ai/cordis'
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'

const PACKAGE_NAME = '@deepseek-ai/dsh-lakehouse-engine'

/** Cordis companion plugin name. */
export const name = 'lakehouse-engine-invariant'
/** Service required before the companion can reserve package ownership. */
export const inject = ['invariants']

/**
 * No runtime invariant: the engine's read-only enforcement is a pure
 * statement-shape check exercised by tests on every changed acceptance path,
 * not a continuous in-process relation.
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
