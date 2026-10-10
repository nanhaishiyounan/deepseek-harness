/** Nav menu-block registration, seat inject wiring, and the activation channel. */
import { Context } from '@deepseek-ai/cordis'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SlotRegistry } from '@deepseek-ai/dsh-client-runtime/client'
import { LocaleRuntime } from '@deepseek-ai/dsh-client-locale/client'
import { apply, inject } from '../src/client/index.ts'
import type { SidebarNavSlotInject } from '../src/client/contract/slots.ts'

async function bench(declare = true) {
  const ctx = new Context()
  await ctx.plugin(SlotRegistry).await()
  const workspaces = { startSession: vi.fn() }
  const switchView = vi.fn(() => true)
  const navState = { getSnapshot: () => ({ screen: undefined, switchable: false }), subscribe: () => () => {} }
  ctx.provide('workspaces', workspaces as never)
  ctx.provide('viewContext', { switchView, navState } as never)
  ctx.provide('locale', new LocaleRuntime(ctx))
  const slots = ctx.get('slots') as SlotRegistry
  if (declare) {
    // The sidebar shell owns the host seat; the bench stands in for it.
    slots.register(
      { name: 'root', children: { 'sidebar.nav.host': { kind: 'single', scope: 'root' } } } as never,
      () => null,
    )
  }
  return { ctx, slots, workspaces, switchView }
}

afterEach(() => {
  vi.useRealTimers()
})

describe('ui-nav apply', () => {
  it('declares only the services it uses', () => {
    expect(inject).toEqual(['slots', 'locale', 'workspaces', 'viewContext'])
  })

  it('occupies the host seat, declares the row seat with its common inject, and adds the chat row', async () => {
    const b = await bench()
    await b.ctx.plugin({ inject: [...inject], apply }).await()
    expect(b.slots.entries('sidebar.nav.host')).toHaveLength(1)
    const navSpec = b.slots.spec('sidebar.nav')!
    expect(navSpec.kind).toBe('list')
    expect(navSpec.scope).toBe('root')
    expect(typeof navSpec.inject).toBe('object')
    // The chat row rides the row seat the block just declared.
    expect(b.slots.entries('sidebar.nav').map(entry => entry.options.id)).toEqual(['chat'])
    expect(b.slots.entries('sidebar.nav')[0]!.locale).toBe('nav')

    // Activation: the immediate switch rides view-context and never opens a session.
    const seat = navSpec.inject as SidebarNavSlotInject
    seat.activate('kb')
    expect(b.switchView).toHaveBeenCalledWith('kb')
    expect(b.workspaces.startSession).not.toHaveBeenCalled()
  })

  it('opens the blank session and retries when no switch is mounted', async () => {
    vi.useFakeTimers()
    const b = await bench()
    b.switchView.mockReturnValue(false)
    await b.ctx.plugin({ inject: [...inject], apply }).await()
    const seat = b.slots.spec('sidebar.nav')?.inject as unknown as SidebarNavSlotInject
    seat.activate('kg')
    expect(b.workspaces.startSession).toHaveBeenCalledOnce()
    // The retry lands once the (fake) header publishes a working switch.
    b.switchView.mockReturnValue(true)
    vi.advanceTimersByTime(120)
    expect(b.switchView).toHaveBeenCalledWith('kg')
    // No further retries after a landed switch: the timer chain stopped.
    const calls = b.switchView.mock.calls.length
    vi.advanceTimersByTime(4000)
    expect(b.switchView.mock.calls.length).toBe(calls)
  })

  it('bounds the retry chain when no switch ever mounts', async () => {
    vi.useFakeTimers()
    const b = await bench()
    b.switchView.mockReturnValue(false)
    await b.ctx.plugin({ inject: [...inject], apply }).await()
    const seat = b.slots.spec('sidebar.nav')?.inject as unknown as SidebarNavSlotInject
    seat.activate('market')
    vi.advanceTimersByTime(10_000)
    expect(b.switchView.mock.calls.length).toBeLessThanOrEqual(26)
  })

  it('stays dormant until the host declaration appears, then registers', async () => {
    const b = await bench(false)
    const fiber = b.ctx.plugin({ inject: [...inject], apply })
    await fiber.await()
    expect(b.slots.entries('sidebar.nav.host')).toHaveLength(0)
    b.slots.register(
      { name: 'root', children: { 'sidebar.nav.host': { kind: 'single', scope: 'root' } } } as never,
      () => null,
    )
    // Declaration notifications fire synchronously; the entry lands at once.
    expect(b.slots.entries('sidebar.nav.host')).toHaveLength(1)
    expect(b.slots.entries('sidebar.nav').map(entry => entry.options.id)).toEqual(['chat'])
    await fiber.dispose()
  })

  it('removes the entries and the seat declaration on teardown', async () => {
    const b = await bench()
    const fiber = b.ctx.plugin({ inject: [...inject], apply })
    await fiber.await()
    await fiber.dispose()
    expect(b.slots.entries('sidebar.nav.host')).toHaveLength(0)
    expect(b.slots.spec('sidebar.nav')).toBeUndefined()
  })
})
