import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import InvariantRegistry from '@deepseek-ai/dsh-invariants'
import * as NocoBaseInvariant from '../src/invariant.ts'

describe('connector-nocobase invariant companion', () => {
  it('reserves the package name against duplicate registration', async () => {
    const ctx = new Context()
    await ctx.plugin(InvariantRegistry)
    await ctx.plugin(NocoBaseInvariant)

    expect(() => {
      ctx.invariants.register('@deepseek-ai/dsh-connector-nocobase', () => {})
    }).toThrow(/already registered/)
  })
})
