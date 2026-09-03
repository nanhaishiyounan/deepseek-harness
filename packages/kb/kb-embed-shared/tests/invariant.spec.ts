import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import InvariantRegistry from '@deepseek-ai/dsh-invariants'
import * as SharedInvariant from '@deepseek-ai/dsh-kb-embed-shared/invariant'

describe('kb-embed-shared invariant companion', () => {
  it('reserves the package name against duplicate registration', async () => {
    const ctx = new Context()
    await ctx.plugin(InvariantRegistry)
    await ctx.plugin(SharedInvariant)

    expect(() => {
      ctx.invariants.register('@deepseek-ai/dsh-kb-embed-shared', () => {})
    }).toThrow(/already registered/)
  })
})
