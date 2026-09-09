// @vitest-environment jsdom
// The browser half's apply: the dictionary registration, the three seats over
// one shared store, the roster/rows/loadMore fan-out with error propagation,
// and the paging merge's id-dedup.

import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it, vi } from 'vitest'
import { SlotRegistry } from '@deepseek-ai/dsh-client-runtime/client'
import { LocaleRuntime } from '@deepseek-ai/dsh-client-locale/client'
import { apply, inject } from '../src/client/index.ts'

/** One ok rpc envelope. */
const ok = <T,>(value: T): { result: { ok: true; value: T } } => ({ result: { ok: true, value } })

/** One failing rpc envelope. */
const fail = (message: string): { result: { ok: false; error: { message: string } } } => ({
  result: { ok: false, error: { message } },
})

/** Boot the client plugin over the slot/locale runtimes and a scripted api face. */
async function bench(overrides: {
  listMeta?: () => Promise<unknown>
  list?: (payload: { page?: number }) => Promise<unknown>
} = {}) {
  const ctx = new Context()
  await ctx.plugin(SlotRegistry).await()
  const listMeta = vi.fn(overrides.listMeta ?? (async () => ok({ collections: [
    { name: 'orders', title: '订单', fields: [] },
  ] })))
  const list = vi.fn(overrides.list ?? (async (payload: { page?: number }) =>
    ok({ count: 3, page: payload.page ?? 1, page_size: 2, rows: [] })))
  ctx.provide('connection', {
    api: { nocobase: { listMeta, list, get: vi.fn() } },
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
  return { ctx, slots, declare, listMeta, list }
}

describe('ui-business browser half apply', () => {
  it('declares its required services', () => {
    expect(inject).toEqual(['slots', 'locale', 'connection'])
  })

  it('registers the three seats with the locale-bound view label', async () => {
    const { ctx, slots, declare } = await bench()
    const revoke = declare()
    const sidebar = slots.entries('sidebar.footer.action').find(entry => entry.options.id === 'business')
    expect(sidebar?.options).toMatchObject({ order: 9 })
    const view = slots.entries('conversation.view').find(entry => entry.options.id === 'business')
    expect(view?.options).toMatchObject({ order: 14 })
    const header = slots.entries('conversation.session.header.actions').find(entry => entry.options.id === 'business')
    expect(header?.options).toMatchObject({ order: 14 })
    expect((view?.options.label as () => string)()).toBe('业务管理')
    revoke()
    void ctx.fiber.dispose()
  })

  it('refresh failures land in the store error state', async () => {
    const { ctx, declare } = await bench({ listMeta: async () => fail('nocobase-not-composed') })
    const revoke = declare()
    const sidebarFace = (ctx.slots.entries('sidebar.footer.action')
      .find(entry => entry.options.id === 'business')?.inject as unknown as () => Record<string, unknown>)()
    ;(sidebarFace.refresh as () => void)()
    const store = (sidebarFace.hooks as { business: { getSnapshot(): { collections?: { status: string; error?: string } } } }).business
    await vi.waitFor(() => { expect(store.getSnapshot().collections).toEqual({ status: 'error', error: 'nocobase-not-composed' }) })
    revoke()
    void ctx.fiber.dispose()
  })

  it('loadRows selects and pages; loadMore merges pages with id dedup', async () => {
    const { ctx, declare, list } = await bench({
      list: async (payload: { page?: number }) => ok({
        count: 3,
        page: payload.page ?? 1,
        page_size: 2,
        rows: (payload.page ?? 1) === 1
          ? [{ id: 1, name: 'a' }, { id: 2, name: 'b' }]
          : [{ id: 2, name: 'b-dup' }, { id: 3, name: 'c' }],
      }),
    })
    const revoke = declare()
    const viewFace = (ctx.slots.entries('conversation.view')
      .find(entry => entry.options.id === 'business')?.inject as unknown as (sessionId: string) => Record<string, unknown>)('s1')
    ;(viewFace.loadRows as (collection: string) => void)('orders')
    await vi.waitFor(() => { expect(list).toHaveBeenCalled() })
    ;(viewFace.loadMore as (collection: string, page: number) => void)('orders', 2)
    const store = (viewFace.hooks as {
      business: { getSnapshot(): { rows?: { status: string; value: { rows: Array<{ id: number; name: string }> } } } }
    }).business
    await vi.waitFor(() => {
      const rows = store.getSnapshot().rows
      expect(rows?.status).toBe('ready')
      expect(rows?.value.rows.map(row => row.id)).toEqual([1, 2, 3])
    })
    // The sidebar entry shares the same store; its refresh guard is a no-op
    // while a roster load is in flight (the cond-expr's loaded arm).
    const sidebarFace = (ctx.slots.entries('sidebar.footer.action')
      .find(entry => entry.options.id === 'business')?.inject as unknown as () => Record<string, unknown>)()
    ;(sidebarFace.refresh as () => void)()
    // The header publisher executes and revokes cleanly (the live-switch arm).
    const headerFace = (ctx.slots.entries('conversation.session.header.actions')
      .find(entry => entry.options.id === 'business')?.inject as unknown as () => Record<string, unknown>)()
    const switcher = (headerFace.publishViewSwitch as (next: (view: string) => void) => () => void)(() => {})
    switcher()
    revoke()
    void ctx.fiber.dispose()
  })
})
