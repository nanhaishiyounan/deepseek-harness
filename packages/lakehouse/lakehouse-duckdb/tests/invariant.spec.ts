import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import InvariantRegistry from '@deepseek-ai/dsh-invariants'
import * as DuckDbInvariant from '../src/invariant.ts'

describe('lakehouse-duckdb invariant companion', () => {
  it('reserves the package name against duplicate registration', async () => {
    const ctx = new Context()
    await ctx.plugin(InvariantRegistry)
    await ctx.plugin(DuckDbInvariant)

    expect(() => {
      ctx.invariants.register('@deepseek-ai/dsh-lakehouse-duckdb', () => {})
    }).toThrow(/already registered/)
  })
})
