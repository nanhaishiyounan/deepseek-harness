// @vitest-environment jsdom
//
/**
 * The package's host half and uncovered presentation seams: an empty apply,
 * the invariant companion that reserves package ownership, the header bridge
 * button (owner-switch present/absent), and the view bridge's
 * provide/request revocation plus the parked-seeds handoff semantics.
 */

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import * as Host from '../src/index.ts'
import * as Invariant from '../src/invariant.ts'
import { KgHeaderButton } from '../src/client/KgHeaderButton.tsx'
import { createKgViewBridge } from '../src/client/kgBridge.ts'
import { zh } from '../src/client/locales.ts'
import { SESSION_KIT } from './kg-fixture.client.ts'

const t = ((key: string) => zh[key as keyof typeof zh] ?? key) as never

afterEach(cleanup)

describe('ui-kg host half', () => {
  it('applies with no host-side behavior', () => {
    expect(() => { Host.apply() }).not.toThrow()
  })

  it('declares the companion plugin name and its required service', () => {
    expect(Invariant.name).toBe('client-ui-kg-invariant')
    expect(Invariant.inject).toEqual(['invariants'])
  })

  it('registers package ownership and resolves with the disposer', async () => {
    const disposer = (): void => {}
    const register = vi.fn(() => disposer)
    const ctx = { invariants: { register } } as unknown as Parameters<typeof Invariant.apply>[0]
    await expect(Invariant.apply(ctx)).resolves.toBe(disposer)
    expect(register).toHaveBeenCalledWith('@deepseek-ai/dsh-client-ui-kg', expect.any(Function))
  })
})

describe('KgHeaderButton', () => {
  it('renders and switches when the owner view switch is present', () => {
    const setView = vi.fn()
    const publishViewSwitch = vi.fn((next: (view: string) => void) => () => { void next })
    render(
      <KgHeaderButton
        {...SESSION_KIT}
        setView={setView}
        publishViewSwitch={publishViewSwitch}
        t={t}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: zh['entry.label'] }))
    expect(setView).toHaveBeenCalledWith('kg')
    expect(publishViewSwitch).toHaveBeenCalledWith(setView)
  })

  it('renders nothing without the owner switch', () => {
    const { container } = render(
      <KgHeaderButton
        {...SESSION_KIT}
        setView={undefined}
        publishViewSwitch={vi.fn()}
        t={t}
      />,
    )
    expect(container.firstChild).toBeNull()
  })
})

describe('kg view bridge', () => {
  it('no-ops requests without a publisher and revokes cleanly', () => {
    const bridge = createKgViewBridge()
    expect(() => { bridge.request('kg') }).not.toThrow()
    const setView = vi.fn()
    const revoke = bridge.provide(setView)
    bridge.request('kg')
    expect(setView).toHaveBeenCalledWith('kg')
    revoke()
    bridge.request('kg')
    expect(setView).toHaveBeenCalledTimes(1)
  })

  it('parks seeds one-shot for the next view mount', () => {
    const bridge = createKgViewBridge()
    expect(bridge.takeSeeds()).toBeUndefined()
    bridge.parkSeeds(['宏发食品'])
    expect(bridge.takeSeeds()).toEqual(['宏发食品'])
    expect(bridge.takeSeeds()).toBeUndefined()
  })
})
