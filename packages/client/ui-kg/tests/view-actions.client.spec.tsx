// @vitest-environment jsdom
// The apply half's view-context integration over the real ViewContextService:
// the SourceTrail seed deep-link (live delivery and the mount-time drain, the
// payload shape guards, the walk refusal), the four whitelisted view-action
// executors dispatched through serve (set_type_filter's tolerant type-list
// parse, focus_entity's canvas lookup, clear_selection, run_phrase_query's
// phrase walk with its size report), and the view-context provider's
// debounced state report the host injects into model requests.

import { Context } from '@deepseek-ai/cordis'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SlotRegistry, type SessionId } from '@deepseek-ai/dsh-client-runtime/client'
import { LocaleRuntime } from '@deepseek-ai/dsh-client-locale/client'
import { ViewContextService } from '@deepseek-ai/dsh-client-ui-view-context/client'
import { apply } from '../src/client/index.ts'

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

/** The kg snapshot fields these assertions read off the shared store. */
interface KgSnapshotView {
  canvas?: { status: string; error?: string; value?: { seeds: readonly string[]; nodes: readonly { id: string; name: string }[] } }
  selected?: string
  typeFilter?: ReadonlySet<string>
}

/** One serve wait plus its answered results (the wire the view_apply tool rides). */
function fakeWait(view: string, action: string, args: Record<string, unknown>) {
  const answers: Array<{ ok: boolean; summary?: string; message?: string }> = []
  const result = (
    envelope: { ok: true; value: { summary: string } } | { ok: false; error: { message: string } },
  ): void => {
    if (envelope.ok) answers.push({ ok: true, summary: envelope.value.summary })
    else answers.push({ ok: false, message: envelope.error.message })
  }
  return {
    answers,
    wait: {
      kind: 'viewAction' as const,
      key: 'v:test',
      sessionId: 's1' as SessionId,
      payload: { view, action, args },
      respond: async (answer: Parameters<typeof result>[0]) => {
        result(answer)
        return { accepted: true }
      },
    } as Parameters<ViewContextService['serve']>[0],
  }
}

/** Settle the pending microtask chains a deep-link or executor walk leaves. */
async function flushMicrotasks(rounds = 8): Promise<void> {
  for (let i = 0; i < rounds; i += 1) await Promise.resolve()
}

/**
 * Boot the plugin over the slot/locale runtimes, a scripted kg api face, and
 * a real ViewContextService whose reports land in `reports`.
 */
async function bench(opts: {
  subgraph?: () => Promise<unknown>
  query?: () => Promise<unknown>
  preOffer?: unknown
} = {}) {
  const ctx = new Context()
  await ctx.plugin(SlotRegistry).await()
  const subgraph = vi.fn(opts.subgraph ?? (async () => ok({
    nodes: [{ id: 'nocobase:customers:1', type: 'Customer', name: '宏发食品', depth: 0 }],
    edges: [{ id: 'e1', relation: 'placed_by', source: 'nocobase:customers:1', target: 'kb:doc:酱油', asserted_by: 'kb' }],
    truncated: false,
    // The gateway answers seeds_resolved with minted node ids, so the
    // deep-link's selection lands on the canvas's id-keyed highlight.
    seeds_resolved: ['nocobase:customers:1'],
  })))
  const query = vi.fn(opts.query ?? (async () => ok({
    nodes: [{ id: 'nocobase:customers:1', type: 'Customer', name: '宏发食品', depth: 0 }],
    edges: [{ id: 'e1', relation: 'placed_by', source: 'a', target: 'b', asserted_by: 'nocobase' }],
    truncated: false,
    seeds_resolved: ['nocobase:customers:1'],
    template: 'supply',
    hops: 2,
    restated: '「宏发食品」周边两跳关系',
  })))
  ctx.provide('connection', {
    api: {
      kg: {
        subgraph,
        query,
        stats: async () => ok({ triples: 1, entities: 1, islands: 0, conflicts: 0 }),
        search: async () => ok({ nodes: [] }),
      },
    },
  } as never)
  const locale = new LocaleRuntime(ctx)
  locale.setLocale('zh')
  ctx.provide('locale', locale)
  const reports: Array<Record<string, unknown> & { snapshot?: Record<string, string> }> = []
  const viewContext = new ViewContextService(ctx, {
    sessions: {
      viewStateReport: async (payload: Record<string, unknown>) => {
        reports.push(payload)
        return { result: { ok: true, value: { accepted: true } } }
      },
    },
  } as never)
  if (opts.preOffer !== undefined) viewContext.offerPending('kg', opts.preOffer)
  apply(ctx)
  ctx.slots.register({
    name: 'root',
    children: {
      'sidebar.footer.action': { kind: 'list', scope: 'root' },
      'conversation.view': { kind: 'list', scope: 'session' },
      'conversation.session.header.actions': { kind: 'list', scope: 'session' },
    },
  } as never, () => null)
  const storeOf = (): { getSnapshot(): KgSnapshotView } => {
    const face = (ctx.slots.entries('conversation.view')
      .find(entry => entry.options.id === 'kg')?.inject as unknown as (sessionId: string) => { hooks: { kg: { getSnapshot(): KgSnapshotView } } })('s1')
    return face.hooks.kg
  }
  return { ctx, viewContext, subgraph, query, reports, storeOf }
}

let disposals: Array<() => void> = []

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  for (const dispose of disposals) dispose()
  disposals = []
  vi.useRealTimers()
})

describe('ui-kg deep-link (SourceTrail → kg seeds)', () => {
  it('walks the carried seeds two hops live and selects the first resolved one', async () => {
    const { ctx, viewContext, subgraph, storeOf } = await bench()
    disposals.push(() => { void ctx.fiber.dispose() })
    viewContext.offerPending('kg', { seeds: ['宏发食品', '中粮'] })
    await flushMicrotasks()
    expect(subgraph).toHaveBeenCalledWith({ seeds: ['宏发食品', '中粮'], hops: 2 })
    const store = storeOf()
    expect(store.getSnapshot().canvas?.status).toBe('ready')
    expect(store.getSnapshot().canvas?.value?.seeds).toEqual(['nocobase:customers:1'])
    expect(store.getSnapshot().selected).toBe('nocobase:customers:1')
  })

  it('drains a handoff that arrived before the view subscribed', async () => {
    const { ctx, subgraph, storeOf } = await bench({ preOffer: { seeds: ['宏发食品'] } })
    disposals.push(() => { void ctx.fiber.dispose() })
    await flushMicrotasks()
    expect(subgraph).toHaveBeenCalledWith({ seeds: ['宏发食品'], hops: 2 })
    expect(storeOf().getSnapshot().canvas?.status).toBe('ready')
  })

  it('ignores payloads without a well-formed string seed list', async () => {
    const { ctx, viewContext, subgraph, storeOf } = await bench()
    disposals.push(() => { void ctx.fiber.dispose() })
    for (const payload of [undefined, {}, { seeds: '宏发食品' }, { seeds: ['宏发食品', 7] }, { seeds: [] }]) {
      viewContext.offerPending('kg', payload)
    }
    await flushMicrotasks()
    expect(subgraph).not.toHaveBeenCalled()
    expect(storeOf().getSnapshot().canvas).toBeUndefined()
  })

  it('records the walk refusal in the canvas error state', async () => {
    const { ctx, viewContext, storeOf } = await bench({ subgraph: () => Promise.reject(new Error('trail-cold')) })
    disposals.push(() => { void ctx.fiber.dispose() })
    viewContext.offerPending('kg', { seeds: ['宏发食品'] })
    await flushMicrotasks()
    expect(storeOf().getSnapshot().canvas).toEqual({ status: 'error', error: 'trail-cold' })
  })

  it('keeps nothing selected when no seed resolves', async () => {
    const { ctx, viewContext, storeOf } = await bench({
      subgraph: async () => ok({ nodes: [], edges: [], truncated: false, seeds_resolved: [] }),
    })
    disposals.push(() => { void ctx.fiber.dispose() })
    viewContext.offerPending('kg', { seeds: ['不存在的实体'] })
    await flushMicrotasks()
    const store = storeOf()
    expect(store.getSnapshot().canvas?.status).toBe('ready')
    expect(store.getSnapshot().selected).toBeUndefined()
  })
})

describe('ui-kg view-action executors (served through the whitelist)', () => {
  it('set_type_filter accepts a comma/space string, an array, and clears on empty', async () => {
    const { ctx, viewContext, storeOf } = await bench()
    disposals.push(() => { void ctx.fiber.dispose() })
    const store = storeOf()

    const stringList = fakeWait('kg', 'set_type_filter', { types: 'Customer, Order' })
    await viewContext.serve(stringList.wait)
    expect(stringList.answers[0]).toMatchObject({ ok: true, summary: '已将图谱类型过滤为 [Customer, Order]' })
    expect([...store.getSnapshot().typeFilter ?? []].sort()).toEqual(['Customer', 'Order'])

    const arrayList = fakeWait('kg', 'set_type_filter', { types: ['Supplier'] })
    await viewContext.serve(arrayList.wait)
    expect([...store.getSnapshot().typeFilter ?? []]).toEqual(['Supplier'])

    const clearing = fakeWait('kg', 'set_type_filter', { types: [] })
    await viewContext.serve(clearing.wait)
    expect(clearing.answers[0]).toMatchObject({ ok: true, summary: '已清除类型过滤（显示全部类型）' })
    expect(store.getSnapshot().typeFilter).toBeUndefined()

    const invalid = fakeWait('kg', 'set_type_filter', { types: 123 })
    await viewContext.serve(invalid.wait)
    expect(invalid.answers[0]?.ok).toBe(false)
    expect(invalid.answers[0]?.message).toContain('set_type_filter')
  })

  it('focus_entity needs a ready canvas and a node the walk actually returned', async () => {
    const cold = await bench()
    disposals.push(() => { void cold.ctx.fiber.dispose() })
    const noCanvas = fakeWait('kg', 'focus_entity', { entity: '宏发食品' })
    await cold.viewContext.serve(noCanvas.wait)
    expect(noCanvas.answers[0]?.ok).toBe(false)

    const { ctx, viewContext, storeOf } = await bench()
    disposals.push(() => { void ctx.fiber.dispose() })
    viewContext.offerPending('kg', { seeds: ['宏发食品'] })
    await flushMicrotasks()
    const store = storeOf()

    const hit = fakeWait('kg', 'focus_entity', { entity: '宏发食品' })
    await viewContext.serve(hit.wait)
    expect(hit.answers[0]).toMatchObject({ ok: true, summary: '已选中并聚焦实体「宏发食品」' })
    expect(store.getSnapshot().selected).toBe('nocobase:customers:1')

    const miss = fakeWait('kg', 'focus_entity', { entity: '查无此物' })
    await viewContext.serve(miss.wait)
    expect(miss.answers[0]?.message).toContain('查无此物')

    const missing = fakeWait('kg', 'focus_entity', {})
    await viewContext.serve(missing.wait)
    expect(missing.answers[0]?.message).toContain('focus_entity')
  })

  it('clear_selection answers after resetting the selection', async () => {
    const { ctx, viewContext, storeOf } = await bench()
    disposals.push(() => { void ctx.fiber.dispose() })
    viewContext.offerPending('kg', { seeds: ['宏发食品'] })
    await flushMicrotasks()
    expect(storeOf().getSnapshot().selected).toBe('nocobase:customers:1')
    const wait = fakeWait('kg', 'clear_selection', {})
    await viewContext.serve(wait.wait)
    expect(wait.answers[0]).toMatchObject({ ok: true, summary: '已清除选中实体' })
    expect(storeOf().getSnapshot().selected).toBeUndefined()
  })

  it('run_phrase_query renders the walked canvas and reports its size, or refuses a blank phrase', async () => {
    const { ctx, viewContext, storeOf } = await bench()
    disposals.push(() => { void ctx.fiber.dispose() })
    const run = fakeWait('kg', 'run_phrase_query', { phrase: '  宏发食品的供货链 ' })
    await viewContext.serve(run.wait)
    expect(run.answers[0]?.ok).toBe(true)
    expect(run.answers[0]?.summary).toContain('「宏发食品」周边两跳关系')
    expect(run.answers[0]?.summary).toContain('节点 1/边 1')
    expect(storeOf().getSnapshot().canvas?.status).toBe('ready')

    const blank = fakeWait('kg', 'run_phrase_query', { phrase: '   ' })
    await viewContext.serve(blank.wait)
    expect(blank.answers[0]?.message).toContain('run_phrase_query')

    const missing = fakeWait('kg', 'run_phrase_query', {})
    await viewContext.serve(missing.wait)
    expect(missing.answers[0]?.ok).toBe(false)
  })
})

describe('ui-kg view-context provider', () => {
  it('reports the label, the state snapshot, and the action catalog over the debounced uplink', async () => {
    const { ctx, viewContext, reports, storeOf } = await bench()
    disposals.push(() => { void ctx.fiber.dispose() })
    viewContext.reportActiveView('s1' as SessionId, 'kg')
    await vi.advanceTimersByTimeAsync(600)
    expect(reports).toHaveLength(1)
    expect(reports[0]).toMatchObject({
      sessionId: 's1',
      view: 'kg',
      label: '图谱',
      snapshot: { '选中实体': '无', '类型过滤': '全部', '图规模': '未加载' },
      actions: { kg: ['clear_selection', 'focus_entity', 'run_phrase_query', 'set_type_filter'] },
    })

    // A store write (a served action) re-triggers the debounced report with
    // the new projection.
    const filter = fakeWait('kg', 'set_type_filter', { types: ['Customer'] })
    await viewContext.serve(filter.wait)
    viewContext.reportActiveView('s1' as SessionId, 'kg')
    await vi.advanceTimersByTimeAsync(600)
    expect(reports[1]?.snapshot).toMatchObject({ '类型过滤': ['Customer'] })
    expect(storeOf().getSnapshot().typeFilter?.has('Customer')).toBe(true)
  })

  it('reports the walked canvas size once the drained deep link lands the graph', async () => {
    const { ctx, viewContext, reports } = await bench({ preOffer: { seeds: ['宏发食品'] } })
    disposals.push(() => { void ctx.fiber.dispose() })
    await flushMicrotasks()
    viewContext.reportActiveView('s1' as SessionId, 'kg')
    await vi.advanceTimersByTimeAsync(600)
    // The drained walk landed the one-node/one-edge canvas before the report,
    // so the projection swaps the unloaded placeholder for the walked size.
    expect(reports[0]?.snapshot).toMatchObject({ '图规模': '节点 1/边 1' })
  })
})
