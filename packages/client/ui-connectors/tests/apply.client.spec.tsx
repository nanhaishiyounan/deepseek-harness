// @vitest-environment jsdom
// The browser half's apply: the dictionary registration, the three seats
// over one shared store and bridge, the refresh fan-out (providers +
// connections/transfers in parallel) with error propagation, and the
// degraded-delivery branch (a failing transfer read still lands providers).

import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it, vi } from 'vitest'
import { SlotRegistry } from '@deepseek-ai/dsh-client-runtime/client'
import { LocaleRuntime } from '@deepseek-ai/dsh-client-locale/client'
import { apply, inject } from '../src/client/index.ts'
import type { ConnectorProviderRow } from '../src/client/connectorTypes.ts'

/** One ok rpc envelope. */
const ok = <T,>(value: T): { result: { ok: true; value: T } } => ({ result: { ok: true, value } })

/** One failing rpc envelope. */
const fail = (message: string): { result: { ok: false; error: { message: string } } } => ({
  result: { ok: false, error: { message } },
})

const PROVIDERS: readonly ConnectorProviderRow[] = [
  { id: 'connector-file', available: true, capabilities: ['discover', 'fetch'] },
]

/** Boot the client plugin over the slot/locale runtimes and a scripted api face. */
async function bench(overrides: {
  list?: () => Promise<unknown>
  connections?: () => Promise<unknown>
  transfers?: () => Promise<unknown>
} = {}) {
  const ctx = new Context()
  await ctx.plugin(SlotRegistry).await()
  const list = vi.fn(overrides.list ?? (async () => ok({ providers: PROVIDERS })))
  const connections = vi.fn(overrides.connections ?? (async () => ok({ connections: [] })))
  const transfers = vi.fn(overrides.transfers ?? (async () => ok({ transfers: [] })))
  ctx.provide('connection', {
    api: { connectors: { list, connections, transfers } },
  } as never)
  const locale = new LocaleRuntime(ctx)
  locale.setLocale('zh')
  ctx.provide('locale', locale)
  apply(ctx)
  const slots = ctx.get('slots') as SlotRegistry
  /** Declare the three seats this plugin rides, as the owning packages would. */
  const declare = (): (() => void) => ctx.slots.register({
    name: 'root',
    children: {
      'sidebar.footer.action': { kind: 'list', scope: 'root' },
      'conversation.view': { kind: 'list', scope: 'session' },
      'conversation.session.header.actions': { kind: 'list', scope: 'session' },
    },
  } as never, () => null)
  return { ctx, slots, declare, list, connections, transfers }
}

describe('ui-connectors browser half apply', () => {
  it('declares its required services', () => {
    expect(inject).toEqual(['slots', 'locale', 'connection'])
  })

  it('registers the three seats with the locale-bound view label', async () => {
    const { ctx, slots, declare } = await bench()
    const revoke = declare()
    const sidebar = slots.entries('sidebar.footer.action').find(entry => entry.options.id === 'connectors')
    expect(sidebar?.options).toMatchObject({ order: 7 })
    const view = slots.entries('conversation.view').find(entry => entry.options.id === 'connectors')
    expect(view?.options).toMatchObject({ order: 12 })
    const header = slots.entries('conversation.session.header.actions').find(entry => entry.options.id === 'connectors')
    expect(header?.options).toMatchObject({ order: 12 })
    expect((view?.options.label as () => string)()).toBe('连接器')
    revoke()
    void ctx.fiber.dispose()
  })

  it('hands every seat an inject face over the shared store and bridge', async () => {
    const { ctx, slots, declare } = await bench()
    const revoke = declare()
    const sidebarFace = (slots.entries('sidebar.footer.action')[0]?.inject as unknown as () => Record<string, unknown>)()
    expect(sidebarFace.hooks).toHaveProperty('connectors')
    expect(sidebarFace.refresh).toEqual(expect.any(Function))
    expect(sidebarFace.requestConnectorsView).toEqual(expect.any(Function))
    const headerFace = (slots.entries('conversation.session.header.actions')
      .find(candidate => candidate.options.id === 'connectors')?.inject as unknown as () => Record<string, unknown>)()
    expect(headerFace.publishViewSwitch).toEqual(expect.any(Function))
    const viewFace = (slots.entries('conversation.view')
      .find(candidate => candidate.options.id === 'connectors')?.inject as unknown as (sessionId: string) => Record<string, unknown>)('s1')
    expect(viewFace.refresh).toEqual(expect.any(Function))
    expect(viewFace.requestView).toEqual(expect.any(Function))
    revoke()
    void ctx.fiber.dispose()
  })

  it('fans one refresh out over the three caches in parallel', async () => {
    const { ctx, slots, declare, list, connections, transfers } = await bench()
    const revoke = declare()
    const sidebarFace = (slots.entries('sidebar.footer.action')[0]?.inject as unknown as () => {
      refresh: () => void
      hooks: { connectors: { getSnapshot: () => {
        providers: { status: string }
        connections: { status: string }
        timeline: { status: string }
      } } }
    })()
    sidebarFace.refresh()
    await vi.waitFor(() => {
      const snapshot = sidebarFace.hooks.connectors.getSnapshot()
      expect(snapshot.providers).toMatchObject({ status: 'ready' })
      expect(snapshot.connections).toMatchObject({ status: 'ready' })
      expect(snapshot.timeline).toMatchObject({ status: 'ready' })
    })
    expect(list).toHaveBeenCalledTimes(1)
    expect(connections).toHaveBeenCalledTimes(1)
    expect(transfers).toHaveBeenCalledTimes(1)
    revoke()
    void ctx.fiber.dispose()
  })

  it('skips caches already in flight, exercises the bridge actions, and stringifies non-Error rejections', async () => {
    const pending = new Promise<unknown>(() => {})
    const { ctx, slots, declare, list, connections, transfers } = await bench({
      list: () => pending,
      connections: () => pending,
      transfers: () => pending,
    })
    const revoke = declare()
    const sidebarFace = (slots.entries('sidebar.footer.action')[0]?.inject as unknown as () => {
      refresh: () => void
      requestConnectorsView: () => void
      hooks: { connectors: { getSnapshot: () => { providers: { status: string } } } }
    })()
    sidebarFace.refresh()
    sidebarFace.refresh()
    expect(list).toHaveBeenCalledTimes(1)
    expect(connections).toHaveBeenCalledTimes(1)
    expect(transfers).toHaveBeenCalledTimes(1)
    expect(sidebarFace.hooks.connectors.getSnapshot().providers).toMatchObject({ status: 'loading' })
    sidebarFace.requestConnectorsView()
    const viewFace = (slots.entries('conversation.view')
      .find(candidate => candidate.options.id === 'connectors')?.inject as unknown as (sessionId: string) => {
      requestView: (view: string) => void
    })('s1')
    viewFace.requestView('chat')
    const headerFace = (slots.entries('conversation.session.header.actions')
      .find(candidate => candidate.options.id === 'connectors')?.inject as unknown as () => {
      publishViewSwitch: (setView: (view: string) => void) => () => void
    })()
    const withdraw = headerFace.publishViewSwitch(() => {})
    expect(withdraw).toEqual(expect.any(Function))
    withdraw()
    revoke()
    void ctx.fiber.dispose()
  })

  it('stringifies a non-Error provider rejection through the failure cache', async () => {
    // oxlint-disable-next-line typescript/prefer-promise-reject-errors -- the non-Error rejection is the case under test.
    const { ctx, slots, declare } = await bench({ list: async () => Promise.reject('raw-refusal') })
    const revoke = declare()
    const sidebarFace = (slots.entries('sidebar.footer.action')[0]?.inject as unknown as () => {
      refresh: () => void
      hooks: { connectors: { getSnapshot: () => { providers: { status: string; error?: string } } } }
    })()
    sidebarFace.refresh()
    await vi.waitFor(() => {
      expect(sidebarFace.hooks.connectors.getSnapshot().providers).toMatchObject({ status: 'error', error: 'raw-refusal' })
    })
    revoke()
    void ctx.fiber.dispose()
  })

  it('propagates a failing provider load and a degraded delivery read into the caches', async () => {
    const { ctx, slots, declare } = await bench({
      list: async () => fail('connectors-not-composed'),
      transfers: async () => fail('connectors-transfers-rejected'),
    })
    const revoke = declare()
    const sidebarFace = (slots.entries('sidebar.footer.action')[0]?.inject as unknown as () => {
      refresh: () => void
      hooks: { connectors: { getSnapshot: () => {
        providers: { status: string; error?: string }
        connections: { status: string; error?: string }
        timeline: { status: string; error?: string }
      } } }
    })()
    sidebarFace.refresh()
    await vi.waitFor(() => {
      const snapshot = sidebarFace.hooks.connectors.getSnapshot()
      expect(snapshot.providers).toMatchObject({ status: 'error', error: 'connectors-not-composed' })
      // The delivery pair shares one flight and one failure text.
      expect(snapshot.connections).toMatchObject({ status: 'error', error: 'connectors-transfers-rejected' })
      expect(snapshot.timeline).toMatchObject({ status: 'error', error: 'connectors-transfers-rejected' })
    })
    revoke()
    void ctx.fiber.dispose()
  })
})
