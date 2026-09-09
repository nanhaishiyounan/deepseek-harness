import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import InvariantRegistry from '@deepseek-ai/dsh-invariants'
import LakehouseRuntime from '../src/index.ts'
import * as LakehouseInvariant from '../src/invariant.ts'

describe('lakehouse invariant companion', () => {
  it('reserves the package name against duplicate registration', async () => {
    const ctx = new Context()
    await ctx.plugin(InvariantRegistry)
    await ctx.plugin(LakehouseInvariant)

    expect(() => {
      ctx.invariants.register('@deepseek-ai/dsh-lakehouse', () => {})
    }).toThrow(/already registered/)
  })

  it('loads beside the runtime without interaction', async () => {
    const ctx = new Context()
    await ctx.plugin(LakehouseRuntime)
    await ctx.plugin(LakehouseInvariant)
    expect(ctx.lakehouse).toBeDefined()
  })
})
