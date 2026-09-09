import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import InvariantRegistry from '@deepseek-ai/dsh-invariants'
import * as CatalogInvariant from '../src/invariant.ts'

describe('lakehouse-sqlite-catalog invariant companion', () => {
  it('reserves the package name against duplicate registration', async () => {
    const ctx = new Context()
    await ctx.plugin(InvariantRegistry)
    await ctx.plugin(CatalogInvariant)

    expect(() => {
      ctx.invariants.register('@deepseek-ai/dsh-lakehouse-sqlite-catalog', () => {})
    }).toThrow(/already registered/)
  })
})
