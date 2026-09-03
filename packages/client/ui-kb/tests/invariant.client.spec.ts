/**
 * The package's host half: an empty apply (the surface ships browser-side via
 * exports["./client"]) and the invariant companion that reserves package
 * ownership on the invariants service.
 */

import { describe, expect, it, vi } from 'vitest'
import * as Host from '../src/index.ts'
import * as Invariant from '../src/invariant.ts'

describe('ui-kb host half', () => {
  it('applies with no host-side behavior', () => {
    expect(() => { Host.apply() }).not.toThrow()
  })

  it('declares the companion plugin name and its required service', () => {
    expect(Invariant.name).toBe('client-ui-kb-invariant')
    expect(Invariant.inject).toEqual(['invariants'])
  })

  it('registers package ownership and resolves with the disposer', async () => {
    const disposer = (): void => {}
    const register = vi.fn(() => disposer)
    const ctx = { invariants: { register } } as unknown as Parameters<typeof Invariant.apply>[0]
    await expect(Invariant.apply(ctx)).resolves.toBe(disposer)
    expect(register).toHaveBeenCalledWith('@deepseek-ai/dsh-client-ui-kb', expect.any(Function))
  })
})
