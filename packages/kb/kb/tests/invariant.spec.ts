import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import InvariantRegistry from '@deepseek-ai/dsh-invariants'
import * as KbInvariant from '@deepseek-ai/dsh-kb/invariant'

describe('kb invariant companion', () => {
  it('reserves the package name against duplicate registration', async () => {
    const ctx = new Context()
    await ctx.plugin(InvariantRegistry)
    await ctx.plugin(KbInvariant)

    expect(() => {
      ctx.invariants.register('@deepseek-ai/dsh-kb', () => {})
    }).toThrow(/already registered/)
  })
})
