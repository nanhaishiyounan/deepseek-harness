// @vitest-environment jsdom
// The browser half's apply: the dictionary registration, the three seats
// over one shared store and bridge, the refresh/walk/expand/search fan-out
// with error propagation, and the type-filter toggle semantics.

import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it, vi } from 'vitest'
import { SlotRegistry } from '@deepseek-ai/dsh-client-runtime/client'
import { LocaleRuntime } from '@deepseek-ai/dsh-client-locale/client'
import { apply, inject } from '../src/client/index.ts'
import type { KgNodeTypeRow } from '../src/client/kgTypes.ts'

// sigma's module top level reads WebGL enum constants off the globals, which
// jsdom does not define; vi.hoisted runs ahead of every import, so the stub
// lands before the static sigma import evaluates. Only enum numbers ride the
// stub — the degraded-list path never reaches a real GL context.
vi.hoisted(() => {
  // oxlint-disable-next-line typescript/no-extraneous-class -- GL enum constants ride statics; the constructor shape is required.
  globalThis.WebGL2RenderingContext ??= class {
    static readonly BOOL = 0x8b56
    static readonly BYTE = 0x1400
    static readonly UNSIGNED_BYTE = 0x1401
    static readonly SHORT = 0x1402
    static readonly UNSIGNED_SHORT = 0x1403
    static readonly INT = 0x1404
    static readonly UNSIGNED_INT = 0x1405
    static readonly FLOAT = 0x1406
  } as unknown as typeof WebGL2RenderingContext
  // oxlint-disable-next-line typescript/no-extraneous-class -- constructor shape required; only static enum numbers are read.
  globalThis.WebGLRenderingContext ??= class {
    static readonly UNSIGNED_BYTE = 0x1401
    static readonly FLOAT = 0x1406
  } as unknown as typeof WebGLRenderingContext
})

/** One ok rpc envelope. */
const ok = <T,>(value: T): { result: { ok: true; value: T } } => ({ result: { ok: true, value } })

/** One failing rpc envelope. */
const fail = (message: string): { result: { ok: false; error: { message: string } } } => ({
  result: { ok: false, error: { message } },
})

const TYPES: readonly KgNodeTypeRow[] = [
  { id: 'Customer', label: '客户', layer: 'domain', prop_keys: [], source: 'builtin-food', status: 'active' },
]

const SUBGRAPH = {
  nodes: [{ id: 'nocobase:customers:1', type: 'Customer', name: '宏发食品', depth: 0 }],
  edges: [],
  truncated: false,
  seeds_resolved: ['nocobase:customers:1'],
}

/** Boot the client plugin over the slot/locale runtimes and a scripted api face. */
async function bench(overrides: {
  schema?: () => Promise<unknown>
  subgraph?: () => Promise<unknown>
  search?: () => Promise<unknown>
  expand?: () => Promise<unknown>
} = {}) {
  const ctx = new Context()
  await ctx.plugin(SlotRegistry).await()
  const schema = vi.fn(overrides.schema ?? (async () => ok({ node_types: TYPES, relations: [] })))
  const subgraph = vi.fn(overrides.subgraph ?? (async () => ok(SUBGRAPH)))
  const search = vi.fn(overrides.search ?? (async () => ok({ nodes: [] })))
  const expand = vi.fn(overrides.expand ?? (async () => ok({ nodes: [], edges: [], truncated: false })))
  ctx.provide('connection', {
    api: { kg: { schema, search, subgraph, expand, stats: vi.fn() } },
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
  return { ctx, slots, declare, schema, subgraph, search, expand }
}

describe('ui-kg browser half apply', () => {
  it('declares its required services', () => {
    expect(inject).toEqual(['slots', 'locale', 'connection'])
  })

  it('registers the three seats with the locale-bound view label', async () => {
    const { ctx, slots, declare } = await bench()
    const revoke = declare()
    const sidebar = slots.entries('sidebar.footer.action').find(entry => entry.options.id === 'kg')
    expect(sidebar?.options).toMatchObject({ order: 8 })
    const view = slots.entries('conversation.view').find(entry => entry.options.id === 'kg')
    expect(view?.options).toMatchObject({ order: 13 })
    const header = slots.entries('conversation.session.header.actions').find(entry => entry.options.id === 'kg')
    expect(header?.options).toMatchObject({ order: 13 })
    expect((view?.options.label as () => string)()).toBe('图谱')
    revoke()
    void ctx.fiber.dispose()
  })

  it('refresh loads the legend and failures land in the store error state', async () => {
    const { ctx, declare, schema } = await bench({ schema: async () => fail('kg-not-composed') })
    const revoke = declare()
    const sidebarFace = (ctx.slots.entries('sidebar.footer.action')
      .find(entry => entry.options.id === 'kg')?.inject as unknown as () => Record<string, unknown>)()
    // The face itself is inert (the component pulls refresh on mount); call
    // it directly and watch the failure land in the shared store.
    ;(sidebarFace.refresh as () => void)()
    expect(schema).toHaveBeenCalled()
    const store = (sidebarFace.hooks as { kg: { getSnapshot(): { legend?: { status: string; error?: string } } } }).kg
    await vi.waitFor(() => { expect(store.getSnapshot().legend).toEqual({ status: 'error', error: 'kg-not-composed' }) })
    revoke()
    void ctx.fiber.dispose()
  })

  it('hands the view a working walk/expand/search face over the api', async () => {
    const { ctx, declare, subgraph, expand, search } = await bench()
    const revoke = declare()
    const viewFace = (ctx.slots.entries('conversation.view')
      .find(entry => entry.options.id === 'kg')?.inject as unknown as (sessionId: string) => Record<string, unknown>)('s1')
    ;(viewFace.walk as (seeds: readonly string[], hops: number) => void)(['宏发食品'], 2)
    await vi.waitFor(() => { expect(subgraph).toHaveBeenCalledWith({ seeds: ['宏发食品'], hops: 2 }) })
    ;(viewFace.expandNode as (nodeId: string) => void)('nocobase:customers:1')
    ;(viewFace.searchSeeds as (query: string) => void)('宏发')
    await vi.waitFor(() => { expect(expand).toHaveBeenCalled(); expect(search).toHaveBeenCalled() })
    revoke()
    void ctx.fiber.dispose()
  })
})
