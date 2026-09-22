/**
 * Node half and invariant companion: the node plugin is an inert Loader seat,
 * and the companion reserves package ownership with an installer that mounts
 * no runtime invariant (the client specs own the behavior surface).
 */
import { Context } from '@deepseek-ai/cordis'
import InvariantRegistry from '@deepseek-ai/dsh-invariants'
import { describe, expect, it } from 'vitest'
import * as ViewContextInvariant from '../src/invariant.ts'
import { apply as nodeApply } from '../src/index.ts'

describe('view-context node half', () => {
  it('mounts as an inert Loader seat with no host-side behavior', async () => {
    const ctx = new Context()
    await ctx.plugin({ apply: nodeApply }).await()
    await ctx.fiber.dispose()
  })

  it('reserves package ownership with an empty installer', async () => {
    const ctx = new Context()
    await ctx.plugin(InvariantRegistry, { enabled: true })
    await expect(ctx.plugin(ViewContextInvariant).await()).resolves.toBeDefined()
    await ctx.fiber.dispose()
  })
})
