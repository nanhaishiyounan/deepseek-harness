// @vitest-environment jsdom
//
/**
 * The package's host half and uncovered presentation seams: an empty apply
 * (the surface ships browser-side via exports["./client"]), the invariant
 * companion that reserves package ownership, the header bridge button
 * (owner-switch present/absent), and the view bridge's provide/request
 * revocation semantics.
 */

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import * as Host from '../src/index.ts'
import * as Invariant from '../src/invariant.ts'
import { MarketHeaderButton } from '../src/client/MarketHeaderButton.tsx'
import { createMarketViewBridge } from '../src/client/marketBridge.ts'
import { zh } from '../src/client/locales.ts'
import { SESSION_KIT } from './market-fixture.client.ts'

const t = ((key: string) => zh[key as keyof typeof zh] ?? key) as never

afterEach(cleanup)

describe('ui-assets host half', () => {
  it('applies with no host-side behavior', () => {
    expect(() => { Host.apply() }).not.toThrow()
  })

  it('declares the companion plugin name and its required service', () => {
    expect(Invariant.name).toBe('client-ui-assets-invariant')
    expect(Invariant.inject).toEqual(['invariants'])
  })

  it('registers package ownership and resolves with the disposer', async () => {
    const disposer = (): void => {}
    const register = vi.fn(() => disposer)
    const ctx = { invariants: { register } } as unknown as Parameters<typeof Invariant.apply>[0]
    await expect(Invariant.apply(ctx)).resolves.toBe(disposer)
    expect(register).toHaveBeenCalledWith('@deepseek-ai/dsh-client-ui-assets', expect.any(Function))
  })
})

describe('MarketHeaderButton', () => {
  it('publishes the owner switch while mounted and switches to the market tab on click', () => {
    const setView = vi.fn()
    const publishViewSwitch = vi.fn((next: (view: string) => void) => () => { next('') })
    render(
      <MarketHeaderButton
        {...SESSION_KIT}
        {...{ setView }}
        publishViewSwitch={publishViewSwitch}
        t={t}
      />,
    )
    expect(publishViewSwitch).toHaveBeenCalledWith(setView)
    fireEvent.click(screen.getByRole('button', { name: zh['entry.label'] }))
    expect(setView).toHaveBeenCalledWith('market')
  })

  it('renders nothing without the owner switch and never publishes', () => {
    const publishViewSwitch = vi.fn((next: (view: string) => void) => () => { next('') })
    const { container } = render(
      <MarketHeaderButton
        {...SESSION_KIT}
        publishViewSwitch={publishViewSwitch}
        t={t}
      />,
    )
    expect(publishViewSwitch).not.toHaveBeenCalled()
    expect(container.firstChild).toBeNull()
  })
})

describe('createMarketViewBridge', () => {
  it('no-ops requests without a publisher, forwards them to the live one, and revokes on dispose', () => {
    const bridge = createMarketViewBridge()
    expect(() => { bridge.request('market') }).not.toThrow()
    const first = vi.fn()
    const second = vi.fn()
    const revokeFirst = bridge.provide(first)
    bridge.request('market')
    expect(first).toHaveBeenCalledWith('market')
    const revokeSecond = bridge.provide(second)
    bridge.request('connectors')
    expect(second).toHaveBeenCalledWith('connectors')
    expect(first).toHaveBeenCalledTimes(1)
    revokeSecond()
    bridge.request('chat')
    // Revoking the newer publisher does not fall back to the older one: the
    // bridge holds one live publisher, not a stack.
    expect(first).toHaveBeenCalledTimes(1)
    expect(second).toHaveBeenCalledTimes(1)
    revokeFirst()
    expect(() => { bridge.request('chat') }).not.toThrow()
    expect(first).toHaveBeenCalledTimes(1)
  })
})
