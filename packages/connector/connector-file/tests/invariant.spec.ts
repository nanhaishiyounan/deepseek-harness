import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import InvariantRegistry from '@deepseek-ai/dsh-invariants'
import * as FileInvariant from '../src/invariant.ts'

describe('connector-file invariant companion', () => {
  it('reserves the package name against duplicate registration', async () => {
    const ctx = new Context()
    await ctx.plugin(InvariantRegistry)
    await ctx.plugin(FileInvariant)

    expect(() => {
      ctx.invariants.register('@deepseek-ai/dsh-connector-file', () => {})
    }).toThrow(/already registered/)
  })
})
