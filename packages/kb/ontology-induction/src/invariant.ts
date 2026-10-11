/**
 * Package-owned invariant companion for `@deepseek-ai/dsh-ontology-induction`.
 * @module @deepseek-ai/dsh-ontology-induction/invariant
 */

/* jscpd:ignore-start */
import type { Context } from '@deepseek-ai/cordis'
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'

const PACKAGE_NAME = '@deepseek-ai/dsh-ontology-induction'

/** Cordis companion plugin name. */
export const name = 'ontology-induction-invariant'
/** Service required before the companion can reserve package ownership. */
export const inject = ['invariants']

/**
 * No runtime invariant: the gate's refusal paths are pure statement-shape
 * checks exercised by tests on every changed acceptance path, not a
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
