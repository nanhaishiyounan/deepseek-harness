// @vitest-environment jsdom
//
/**
 * The package's host half and uncovered seams: an empty apply, the invariant
 * companion that reserves package ownership, and the header bridge button
 * (owner-switch present/absent).
 */

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import * as Host from '../src/index.ts'
import * as Invariant from '../src/invariant.ts'
import { BizHeaderButton } from '../src/client/BizHeaderButton.tsx'
import { zh } from '../src/client/locales.ts'
import { SESSION_KIT } from './business-fixture.client.ts'

const t = ((key: string) => zh[key as keyof typeof zh] ?? key) as never

afterEach(cleanup)

describe('ui-business host half', () => {
  it('applies with no host-side behavior', () => {
    expect(() => { Host.apply() }).not.toThrow()
  })

  it('declares the companion plugin name and its required service', () => {
    expect(Invariant.name).toBe('client-ui-business-invariant')
    expect(Invariant.inject).toEqual(['invariants'])
  })

  it('registers package ownership and resolves with the disposer', async () => {
    const disposer = (): void => {}
    const register = vi.fn(() => disposer)
    const ctx = { invariants: { register } } as unknown as Parameters<typeof Invariant.apply>[0]
    await expect(Invariant.apply(ctx)).resolves.toBe(disposer)
    expect(register).toHaveBeenCalledWith('@deepseek-ai/dsh-client-ui-business', expect.any(Function))
  })
})

describe('BizHeaderButton', () => {
  it('renders and switches when the owner view switch is present', () => {
    const setView = vi.fn()
    const publishViewSwitch = vi.fn((next: (view: string) => void) => () => { void next })
    render(
      <BizHeaderButton
        {...SESSION_KIT}
        setView={setView}
        publishViewSwitch={publishViewSwitch}
        t={t}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: zh['entry.label'] }))
    expect(setView).toHaveBeenCalledWith('business')
    expect(publishViewSwitch).toHaveBeenCalledWith(setView)
  })

  it('renders nothing without the owner switch', () => {
    const { container } = render(
      <BizHeaderButton
        {...SESSION_KIT}
        setView={undefined}
        publishViewSwitch={vi.fn()}
        t={t}
      />,
    )
    expect(container.firstChild).toBeNull()
  })
})
