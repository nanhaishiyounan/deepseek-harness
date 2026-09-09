// @vitest-environment jsdom
// The browser half's apply: the dictionary registration, the three seats
// (sidebar entry, view tab, header bridge button) over one shared store and
// bridge, the refresh fan-out over both caches with error propagation, and
// the order placement path (ok receipt + refresh, non-orderable rejection,
// wire-error rethrow).

import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it, vi } from 'vitest'
import { SlotRegistry } from '@deepseek-ai/dsh-client-runtime/client'
import { LocaleRuntime } from '@deepseek-ai/dsh-client-locale/client'
import { apply, inject } from '../src/client/index.ts'
import type { MarketAssetRow, MarketStatsRow } from '../src/client/marketTypes.ts'

/** One ok rpc envelope. */
const ok = <T,>(value: T): { result: { ok: true; value: T } } => ({ result: { ok: true, value } })

/** One failing rpc envelope. */
const fail = (message: string): { result: { ok: false; error: { message: string } } } => ({
  result: { ok: false, error: { message } },
})

const STATS: MarketStatsRow = { products: 2, providers: 1, monthly_orders: 0, featured: [] }

const SERVICE: MarketAssetRow = {
  provider_id: 'connector-nocobase', dataset_id: 'expert_services/1', title: '中亚货运动线方案', kind: 'service',
  service_id: 'expert_services/1', service_name: '中亚货运动线方案', price: '¥8,800/份', deliverable: 'PDF 方案',
}

/** Boot the client plugin over the slot/locale runtimes and a scripted api face. */
async function bench(overrides: {
  stats?: () => Promise<unknown>
  list?: () => Promise<unknown>
  create?: (payload: { service_id: string; brief: string }) => Promise<unknown>
} = {}) {
  const ctx = new Context()
  await ctx.plugin(SlotRegistry).await()
  const stats = vi.fn(overrides.stats ?? (async () => ok(STATS)))
  const list = vi.fn(overrides.list ?? (async () => ok({ assets: [SERVICE] })))
  const create = vi.fn(overrides.create ?? (async (payload: { service_id: string; brief: string }) =>
    ok({ id: 1, order_no: 'ORD-20260907-0001', service_name: payload.service_id, status: 'pending', created_at: '' })))
  ctx.provide('connection', {
    api: {
      assets: { stats, list, detail: vi.fn(async () => ok(SERVICE)) },
      orders: { create },
    },
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
  return { ctx, slots, declare, stats, list, create }
}

describe('ui-assets browser half apply', () => {
  it('declares its required services', () => {
    expect(inject).toEqual(['slots', 'locale', 'connection'])
  })

  it('registers the three seats with the locale-bound view label', async () => {
    const { ctx, slots, declare } = await bench()
    const revoke = declare()
    const sidebar = slots.entries('sidebar.footer.action').find(entry => entry.options.id === 'market')
    expect(sidebar?.options).toMatchObject({ order: 6 })
    const view = slots.entries('conversation.view').find(entry => entry.options.id === 'market')
    expect(view?.options).toMatchObject({ order: 11 })
    const header = slots.entries('conversation.session.header.actions').find(entry => entry.options.id === 'market')
    expect(header?.options).toMatchObject({ order: 11 })
    // The view label reads through the bound translate (zh).
    expect((view?.options.label as () => string)()).toBe('数据资产')
    revoke()
    void ctx.fiber.dispose()
  })

  it('hands every seat an inject face over the shared store and bridge', async () => {
    const { ctx, slots, declare } = await bench()
    const revoke = declare()
    const sidebarFace = (slots.entries('sidebar.footer.action')[0]?.inject as unknown as () => Record<string, unknown>)()
    expect(sidebarFace.hooks).toHaveProperty('market')
    expect(sidebarFace.refresh).toEqual(expect.any(Function))
    expect(sidebarFace.requestMarketView).toEqual(expect.any(Function))
    const headerFace = (slots.entries('conversation.session.header.actions')
      .find(candidate => candidate.options.id === 'market')?.inject as unknown as () => Record<string, unknown>)()
    expect(headerFace.publishViewSwitch).toEqual(expect.any(Function))
    const viewFace = (slots.entries('conversation.view')
      .find(candidate => candidate.options.id === 'market')?.inject as unknown as (sessionId: string) => Record<string, unknown>)('s1')
    expect(viewFace.placeOrder).toEqual(expect.any(Function))
    expect(viewFace.requestView).toEqual(expect.any(Function))
    revoke()
    void ctx.fiber.dispose()
  })

  it('fans one refresh out over both caches and lands both values', async () => {
    const { ctx, slots, declare } = await bench()
    const revoke = declare()
    const sidebarFace = (slots.entries('sidebar.footer.action')[0]?.inject as unknown as () => {
      refresh: () => void
      hooks: { market: { getSnapshot: () => { stats: { status: string }; catalog: { status: string } } } }
    })()
    sidebarFace.refresh()
    await vi.waitFor(() => {
      const snapshot = sidebarFace.hooks.market.getSnapshot()
      expect(snapshot.stats).toMatchObject({ status: 'ready' })
      expect(snapshot.catalog).toMatchObject({ status: 'ready' })
    })
    revoke()
    void ctx.fiber.dispose()
  })

  it('places an order through the view face and refreshes the counters', async () => {
    const { ctx, slots, declare, create, stats } = await bench()
    const revoke = declare()
    const viewFace = (slots.entries('conversation.view')
      .find(candidate => candidate.options.id === 'market')?.inject as unknown as (sessionId: string) => {
      placeOrder: (asset: MarketAssetRow, brief: string) => Promise<{ order_no: string; status: string }>
    })('s1')
    const receipt = await viewFace.placeOrder(SERVICE, '走铁路')
    expect(receipt).toMatchObject({ order_no: 'ORD-20260907-0001', status: 'pending' })
    expect(create).toHaveBeenCalledWith({ service_id: 'expert_services/1', brief: '走铁路' })
    // Placement refreshes the counters so the hero follows.
    await vi.waitFor(() => { expect(stats).toHaveBeenCalled() })
    revoke()
    void ctx.fiber.dispose()
  })

  it('rejects placement for a non-orderable asset before touching the wire', async () => {
    const { ctx, slots, declare, create } = await bench()
    const revoke = declare()
    const viewFace = (slots.entries('conversation.view')
      .find(candidate => candidate.options.id === 'market')?.inject as unknown as (sessionId: string) => {
      placeOrder: (asset: MarketAssetRow, brief: string) => Promise<{ order_no: string }>
    })('s1')
    const tabular: MarketAssetRow = { provider_id: 'connector-file', dataset_id: 'orders.csv', title: 'orders', kind: 'tabular' }
    await expect(viewFace.placeOrder(tabular, 'x')).rejects.toThrow('this asset is not orderable')
    expect(create).not.toHaveBeenCalled()
    revoke()
    void ctx.fiber.dispose()
  })

  it('rethrows the wire error message on a failed placement', async () => {
    const { ctx, slots, declare } = await bench({ create: async () => fail('orders-write-disabled') })
    const revoke = declare()
    const viewFace = (slots.entries('conversation.view')
      .find(candidate => candidate.options.id === 'market')?.inject as unknown as (sessionId: string) => {
      placeOrder: (asset: MarketAssetRow, brief: string) => Promise<{ order_no: string }>
    })('s1')
    await expect(viewFace.placeOrder(SERVICE, 'x')).rejects.toThrow('orders-write-disabled')
    revoke()
    void ctx.fiber.dispose()
  })

  it('skips a cache already in flight, exercises the bridge actions, and stringifies non-Error rejections', async () => {
    let release: (() => void) | undefined
    const pending = new Promise<unknown>(() => { release = () => {} })
    void release
    const { ctx, slots, declare, stats, list } = await bench({
      stats: () => pending,
      list: () => pending,
    })
    const revoke = declare()
    const sidebarFace = (slots.entries('sidebar.footer.action')[0]?.inject as unknown as () => {
      refresh: () => void
      requestMarketView: () => void
      hooks: { market: { getSnapshot: () => { stats: { status: string } } } }
    })()
    sidebarFace.refresh()
    sidebarFace.refresh()
    expect(stats).toHaveBeenCalledTimes(1)
    expect(list).toHaveBeenCalledTimes(1)
    expect(sidebarFace.hooks.market.getSnapshot().stats).toMatchObject({ status: 'loading' })
    sidebarFace.requestMarketView()
    const viewFace = (slots.entries('conversation.view')
      .find(candidate => candidate.options.id === 'market')?.inject as unknown as (sessionId: string) => {
      requestView: (view: string) => void
    })('s1')
    viewFace.requestView('chat')
    const headerFace = (slots.entries('conversation.session.header.actions')
      .find(candidate => candidate.options.id === 'market')?.inject as unknown as () => {
      publishViewSwitch: (setView: (view: string) => void) => () => void
    })()
    const withdraw = headerFace.publishViewSwitch(() => {})
    expect(withdraw).toEqual(expect.any(Function))
    withdraw()
    revoke()
    void ctx.fiber.dispose()
  })

  it('stringifies a non-Error wire rejection through the failure cache', async () => {
    // oxlint-disable-next-line typescript/prefer-promise-reject-errors -- the non-Error rejection is the case under test.
    const { ctx, slots, declare } = await bench({ stats: async () => Promise.reject('raw-refusal') })
    const revoke = declare()
    const sidebarFace = (slots.entries('sidebar.footer.action')[0]?.inject as unknown as () => {
      refresh: () => void
      hooks: { market: { getSnapshot: () => { stats: { status: string; error?: string } } } }
    })()
    sidebarFace.refresh()
    await vi.waitFor(() => {
      expect(sidebarFace.hooks.market.getSnapshot().stats).toMatchObject({ status: 'error', error: 'raw-refusal' })
    })
    revoke()
    void ctx.fiber.dispose()
  })

  it('propagates failing loads into the shared error caches', async () => {
    const { ctx, slots, declare } = await bench({
      stats: async () => fail('assets-not-composed'),
      list: async () => fail('assets-connector-missing'),
    })
    const revoke = declare()
    const sidebarFace = (slots.entries('sidebar.footer.action')[0]?.inject as unknown as () => {
      refresh: () => void
      hooks: { market: { getSnapshot: () => { stats: { status: string; error?: string }; catalog: { status: string; error?: string } } } }
    })()
    sidebarFace.refresh()
    await vi.waitFor(() => {
      const snapshot = sidebarFace.hooks.market.getSnapshot()
      expect(snapshot.stats).toMatchObject({ status: 'error', error: 'assets-not-composed' })
      expect(snapshot.catalog).toMatchObject({ status: 'error', error: 'assets-connector-missing' })
    })
    revoke()
    void ctx.fiber.dispose()
  })
})
