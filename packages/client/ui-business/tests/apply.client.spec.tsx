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
  update?: (payload: { collection: string; id: number }) => Promise<unknown>
} = {}) {
  const ctx = new Context()
  await ctx.plugin(SlotRegistry).await()
  const listMeta = vi.fn(overrides.listMeta ?? (async () => ok({ collections: [
    { name: 'orders', title: '订单', fields: [] },
  ] })))
  const list = vi.fn(overrides.list ?? (async (payload: { page?: number }) =>
    ok({ count: 3, page: payload.page ?? 1, page_size: 2, rows: [] })))
  const update = vi.fn(overrides.update ?? (async () => ok({ collection: 'orders', row: { id: 9, remark: 'x' } })))
  ctx.provide('connection', {
    api: { nocobase: { listMeta, list, get: vi.fn(), update } },
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
  return { ctx, slots, declare, listMeta, list, update }
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

  it('loadMore failures land in the rows error cache with the raw rejection text', async () => {
    // Page 2 rejects with a non-Error value, so the failure text keeps the
    // raw string (messageOf's stringify arm).
    const { ctx, declare } = await bench({
      list: async (payload: { page?: number }) => {
        if ((payload.page ?? 1) === 2) throw 'gateway went away'
        return ok({ count: 3, page: 1, page_size: 2, rows: [{ id: 1, name: 'a' }] })
      },
    })
    const revoke = declare()
    const viewFace = (ctx.slots.entries('conversation.view')
      .find(entry => entry.options.id === 'business')?.inject as unknown as (sessionId: string) => Record<string, unknown>)('s1')
    ;(viewFace.loadRows as (collection: string) => void)('orders')
    ;(viewFace.loadMore as (collection: string, page: number) => void)('orders', 2)
    const store = (viewFace.hooks as {
      business: { getSnapshot(): { rows?: { status: string; error?: string } } }
    }).business
    await vi.waitFor(() => { expect(store.getSnapshot().rows).toEqual({ status: 'error', error: 'gateway went away' }) })
    revoke()
    await ctx.fiber.dispose()
  })

  it('patches rows through the gateway update face and surfaces its refusals', async () => {
    const { ctx, declare, update } = await bench()
    const revoke = declare()
    const viewFace = (ctx.slots.entries('conversation.view')
      .find(entry => entry.options.id === 'business')?.inject as unknown as (sessionId: string) => {
      updateRow: (collection: string, id: number, values: Record<string, string | number | null>) => Promise<unknown>
    })('s1')
    await expect(viewFace.updateRow('orders', 9, { remark: '电话确认过' })).resolves.toEqual({ id: 9, remark: 'x' })
    expect(update).toHaveBeenCalledWith({ collection: 'orders', id: 9, values: { remark: '电话确认过' } })
    revoke()
    await ctx.fiber.dispose()

    const refused = await bench({ update: async () => fail('nocobase-write-disabled') })
    const revokeRefused = refused.declare()
    const refusingFace = (refused.ctx.slots.entries('conversation.view')
      .find(entry => entry.options.id === 'business')?.inject as unknown as (sessionId: string) => {
      updateRow: (collection: string, id: number, values: Record<string, string | number | null>) => Promise<unknown>
    })('s1')
    await expect(refusingFace.updateRow('orders', 9, {})).rejects.toThrow('nocobase-write-disabled')
    revokeRefused()
    await refused.ctx.fiber.dispose()
  })

  it('routes the sidebar entry through the header bridge, ignoring a stale withdraw', async () => {
    const { ctx, declare } = await bench()
    const revoke = declare()
    const seen: string[] = []
    const headerFace = (ctx.slots.entries('conversation.session.header.actions')
      .find(entry => entry.options.id === 'business')?.inject as unknown as () => Record<string, unknown>)()
    const publishViewSwitch = headerFace.publishViewSwitch as (next: (view: string) => void) => () => void
    const withdrawFirst = publishViewSwitch((): void => {})
    const withdrawLive = publishViewSwitch((view: string) => { seen.push(view) })
    // Withdrawing a superseded publisher leaves the live one wired.
    withdrawFirst()
    const sidebarFace = (ctx.slots.entries('sidebar.footer.action')
      .find(entry => entry.options.id === 'business')?.inject as unknown as () => Record<string, unknown>)()
    ;(sidebarFace.requestBusinessView as () => void)()
    expect(seen).toEqual(['business'])
    // Withdrawing the live publisher unwires the bridge into a silent no-op.
    withdrawLive()
    ;(sidebarFace.requestBusinessView as () => void)()
    expect(seen).toEqual(['business'])
    revoke()
    await ctx.fiber.dispose()
  })

  it('keeps a second roster refresh a no-op while one load is in flight', async () => {
    const { ctx, declare, listMeta } = await bench({
      listMeta: vi.fn(() => new Promise(() => {})),
    })
    const revoke = declare()
    const sidebarFace = (ctx.slots.entries('sidebar.footer.action')
      .find(entry => entry.options.id === 'business')?.inject as unknown as () => { refresh: () => void })()
    sidebarFace.refresh()
    sidebarFace.refresh()
    expect(listMeta).toHaveBeenCalledTimes(1)
    revoke()
    await ctx.fiber.dispose()
  })

  it('exposes business view actions and the state snapshot once view-context arrives', async () => {
    // Deferred activation: the service may apply after this package, so the
    // registration fires on provision, not at apply time.
    const { ctx, declare } = await bench()
    const revoke = declare()
    const registerActions = vi.fn((_registration: unknown) => () => {})
    const provide = vi.fn((_projection: unknown) => () => {})
    ctx.provide('viewContext', { registerActions, provide } as never)
    // The registration rides the context's fiber: settle before asserting.
    await vi.waitFor(() => { expect(registerActions).toHaveBeenCalled() })
    expect(registerActions).toHaveBeenCalledWith(expect.objectContaining({ view: 'business' }))
    const { actions } = registerActions.mock.calls[0]![0] as {
      actions: Record<string, (args: Record<string, unknown>) => { summary: string }>
    }
    // Malformed payloads fail loud with the required shape named.
    expect(() => actions['select_collection']!({})).toThrow('{"collection": string} required')
    expect(() => actions['set_table_filter']!({ filter: 3 })).toThrow('{"filter": string} required')
    // Before the roster lands, every collection is unknown.
    expect(() => actions['select_collection']!({ collection: 'orders' })).toThrow('业务表清单中找不到')

    const viewFace = (ctx.slots.entries('conversation.view')
      .find(entry => entry.options.id === 'business')?.inject as unknown as (sessionId: string) => {
      hooks: { business: { getSnapshot(): { selected?: string; tableFilter?: string } } }
    })('s1')
    expect(actions['set_table_filter']!({ filter: 'status = pending' }).summary).toContain('status = pending')
    expect(viewFace.hooks.business.getSnapshot().tableFilter).toBe('status = pending')
    // The snapshot reports the not-yet-loaded state before any selection.
    const projection = provide.mock.calls[0]![0] as { label: () => string; snapshot: () => Record<string, string> }
    expect(projection.label()).toBe('业务管理')
    expect(projection.snapshot()).toEqual({ '当前表': '未选择', '数据状态': '未加载', '行过滤': 'status = pending' })

    // After the roster lands, a known collection switches the store.
    const sidebarFace = (ctx.slots.entries('sidebar.footer.action')
      .find(entry => entry.options.id === 'business')?.inject as unknown as () => { refresh: () => void })()
    sidebarFace.refresh()
    await vi.waitFor(() => { expect(() => actions['select_collection']!({ collection: 'orders' })).not.toThrow() })
    expect(viewFace.hooks.business.getSnapshot().selected).toBe('orders')
    expect(projection.snapshot()['当前表']).toBe('orders')
    revoke()
    await ctx.fiber.dispose()
  })

  it('reports the ready row count in the view snapshot', async () => {
    const { ctx, declare } = await bench({
      listMeta: async () => ok({ collections: [{ name: 'orders', title: '订单', fields: [] }] }),
    })
    const revoke = declare()
    const registerActions = vi.fn((_registration: unknown) => () => {})
    const provide = vi.fn((_projection: unknown) => () => {})
    ctx.provide('viewContext', { registerActions, provide } as never)
    await vi.waitFor(() => { expect(provide).toHaveBeenCalled() })
    const viewFace = (ctx.slots.entries('conversation.view')
      .find(entry => entry.options.id === 'business')?.inject as unknown as (sessionId: string) => {
      hooks: { business: { getSnapshot(): { rows?: { status: string } } } }
      loadRows: (collection: string) => void
    })('s1')
    viewFace.loadRows('orders')
    const projection = provide.mock.calls[0]![0] as { snapshot: () => Record<string, string> }
    // The ready row page reports its count; the untouched filter reports none.
    await vi.waitFor(() => { expect(projection.snapshot()).toEqual({ '当前表': 'orders', '数据状态': '3 行', '行过滤': '无' }) })
    revoke()
    await ctx.fiber.dispose()
  })
})
