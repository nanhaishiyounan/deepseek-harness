import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import InvariantRegistry from '@deepseek-ai/dsh-invariants'
import ConnectorRuntime from '../src/index.ts'
import * as ConnectorInvariant from '../src/invariant.ts'

describe('connector invariant companion', () => {
  it('reserves the package name against duplicate registration', async () => {
    const ctx = new Context()
    await ctx.plugin(InvariantRegistry)
    await ctx.plugin(ConnectorInvariant)

    expect(() => {
      ctx.invariants.register('@deepseek-ai/dsh-connector', () => {})
    }).toThrow(/already registered/)
  })

  it('loads beside the runtime without interaction', async () => {
    const ctx = new Context()
    await ctx.plugin(ConnectorRuntime)
    await ctx.plugin(ConnectorInvariant)
    expect(ctx.connector).toBeDefined()
  })
})
