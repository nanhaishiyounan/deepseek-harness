/**
 * Package-owned invariant companion for `@deepseek-ai/dsh-kg-build`.
 * @module @deepseek-ai/dsh-kg-build/invariant
 */

import type { Context } from '@deepseek-ai/cordis'
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'

const PACKAGE_NAME = '@deepseek-ai/dsh-kg-build'

/** Cordis companion plugin name. */
export const name = 'kg-build-invariant'
/** Service required before the companion can reserve package ownership. */
export const inject = ['invariants']

/**
 * No runtime invariant: a pipeline Consumer — every ingestion effect is
 * observable through the kbGraph store and its source-run watermarks,
 * covered by the pipeline and store test suites.
 */
const install: InvariantInstaller = () => {}

/**
 * Register this package's invariant companion.
 * @param ctx - Cordis context carrying the invariant service.
 * @returns the installed registration's disposer after setup succeeds.
 */
export const apply = (ctx: Context): Promise<() => void> =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
