/**
 * The package's invariant companion: registration reserves package ownership
 * on the invariants service and answers with the registration's disposer.
 */

import { describe, expect, it, vi } from 'vitest'
import * as Invariant from '../src/invariant.ts'

describe('kb-graph-sqlite invariant companion', () => {
  it('declares the companion plugin name and its required service', () => {
    expect(Invariant.name).toBe('kb-graph-sqlite-invariant')
    expect(Invariant.inject).toEqual(['invariants'])
  })

  it('registers package ownership and resolves with the disposer', async () => {
    const disposer = (): void => {}
    const register = vi.fn(() => disposer)
    const ctx = { invariants: { register } } as unknown as Parameters<typeof Invariant.apply>[0]
    await expect(Invariant.apply(ctx)).resolves.toBe(disposer)
    expect(register).toHaveBeenCalledWith('@deepseek-ai/dsh-kb-graph-sqlite', expect.any(Function))
  })
})
