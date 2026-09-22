// @vitest-environment jsdom
// The browser half's apply: the dictionary registration, the three seats
// over one shared store and bridge, the refresh/walk/expand/search fan-out
// with error propagation, and the type-filter toggle semantics; plus the
// workbench service fan-out the view tab drives (feed + review queue,
// communities, rollback/reviewDecide/ontologyEdit receipts, history replay,
// the quality panel's stats×mappings join, the phrase query) and the
// view-bridge handoff between the sidebar and header seats.

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

/** A promise the test settles on its own schedule (loading-guard probes). */
function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((res) => { resolve = res })
  return { promise, resolve }
}

const TYPES: readonly KgNodeTypeRow[] = [
  { id: 'Customer', label: '客户', layer: 'domain', prop_keys: [], source: 'builtin-food', status: 'active' },
]

const SUBGRAPH = {
  nodes: [{ id: 'nocobase:customers:1', type: 'Customer', name: '宏发食品', depth: 0 }],
  edges: [],
  truncated: false,
  seeds_resolved: ['nocobase:customers:1'],
}

const STATS_FULL = { triples: 12, entities: 3, islands: 2, conflicts: 1 }
const MAPPINGS = {
  file: 'kg-mappings.yml',
  version: 1,
  rules: { skipHiddenCollections: true, emptyFkNoEdge: true, derivesTitle: true },
  collections: [{ name: 'experts', fkLinkCount: 0 }],
  lastRun: {
    finishedAt: '2026-09-15T03:00:00.000Z',
    ruleHits: { R01: 5 },
    collections: [{ scope: 'experts', nodesUpserted: 12, edgesUpserted: 4, skipped: false, skippedRelationFields: [] }],
  },
}

/** One scripted kg api face; every method defaults to a success envelope. */
function kgFace(overrides: {
  schema?: () => Promise<unknown>
  subgraph?: () => Promise<unknown>
  search?: () => Promise<unknown>
  expand?: () => Promise<unknown>
  stats?: () => Promise<unknown>
  episodes?: () => Promise<unknown>
  reviewQueue?: () => Promise<unknown>
  communities?: () => Promise<unknown>
  rollback?: () => Promise<unknown>
  reviewDecide?: () => Promise<unknown>
  ontologyEdit?: () => Promise<unknown>
  history?: () => Promise<unknown>
  query?: () => Promise<unknown>
  mappings?: () => Promise<unknown>
} = {}) {
  return {
    schema: vi.fn(overrides.schema ?? (async () => ok({ node_types: TYPES, relations: [] }))),
    subgraph: vi.fn(overrides.subgraph ?? (async () => ok(SUBGRAPH))),
    search: vi.fn(overrides.search ?? (async () => ok({ nodes: [] }))),
    expand: vi.fn(overrides.expand ?? (async () => ok({ nodes: [], edges: [], truncated: false }))),
    stats: vi.fn(overrides.stats ?? (async () => ok({ ...STATS_FULL, node_types: 31, relations: 23 }))),
    episodes: vi.fn(overrides.episodes ?? (async () => ok({
      episodes: [{ uuid: 'ingest:1', source: 'ingest', name: '跨源共指对齐', content: 'c', created_at: 't', mentions: 4 }],
    }))),
    reviewQueue: vi.fn(overrides.reviewQueue ?? (async () => ok({
      entries: [{ doc_id: 'kb:doc#大豆', row_id: 'nocobase:materials:7', doc_name: '大豆', row_name: '非转基因大豆', confidence: 0.72, reason: '' }],
      source_episode: 'ingest:1',
    }))),
    communities: vi.fn(overrides.communities ?? (async () => ok({ communities: [{ id: 0, nodes: ['nocobase:customers:1'] }], modularity: 0.5, node_count: 1 }))),
    rollback: vi.fn(overrides.rollback ?? (async () => ok({ rollback_uuid: 'rollback:2', rolled_back: 'ingest:1', retired: 1, restored: 1 }))),
    reviewDecide: vi.fn(overrides.reviewDecide ?? (async () => ok({ accepted: true }))),
    ontologyEdit: vi.fn(overrides.ontologyEdit ?? (async () => ok({ applied: ['新增类 frozenTofu'], revision_id: 7, episode_uuid: 'human-edit:1' }))),
    history: vi.fn(overrides.history ?? (async () => ok({
      nodes: [{ id: 'nocobase:customers:1', type: 'Customer', name: '宏发食品', depth: 0 }],
      edges: [],
      truncated: true,
      as_of: '2026-09-18T02:00:00.000Z',
    }))),
    query: vi.fn(overrides.query ?? (async () => ok({
      nodes: [{ id: 'nocobase:customers:1', type: 'Customer', name: '宏发食品', depth: 0 }],
      edges: [{ id: 'e1', relation: 'placed_by', source: 'a', target: 'b', asserted_by: 'nocobase' }],
      truncated: false,
      seeds_resolved: ['宏发食品'],
      template: 'supply',
      hops: 2,
      restated: '「宏发食品」周边两跳关系',
    }))),
    mappings: vi.fn(overrides.mappings ?? (async () => ok(MAPPINGS))),
  }
}

/** The snapshot fields the assertions below read off the shared store. */
interface KgSnapshotView {
  legend?: { status: string; error?: string; value?: { revisions?: unknown[] } }
  canvas?: { status: string; error?: string; value?: { seeds: readonly string[] } }
  search?: { status: string; error?: string }
  panel?: { status: string; error?: string; value?: { mappings?: unknown; quality: Record<string, unknown> } }
  episodes?: { status: string; error?: string; value?: readonly { uuid: string }[] }
  review?: { status: string; error?: string; value?: { sourceEpisode: string } }
  communities?: { status: string; error?: string }
  history?: { status: string; error?: string; value?: { asOf: string } }
  selected?: string
  typeFilter?: ReadonlySet<string>
  colorMode: 'type' | 'semantic' | 'community'
}

/**
 * Boot the client plugin over the slot/locale runtimes and a scripted api
 * face; the seat structure is declared up front so every face resolves.
 */
async function bench(overrides: Parameters<typeof kgFace>[0] = {}) {
  const ctx = new Context()
  await ctx.plugin(SlotRegistry).await()
  const kg = kgFace(overrides)
  ctx.provide('connection', { api: { kg } } as never)
  const locale = new LocaleRuntime(ctx)
  locale.setLocale('zh')
  ctx.provide('locale', locale)
  apply(ctx)
  const slots = ctx.get('slots') as SlotRegistry
  const revoke = ctx.slots.register({
    name: 'root',
    children: {
      'sidebar.footer.action': { kind: 'list', scope: 'root' },
      'conversation.view': { kind: 'list', scope: 'session' },
      'conversation.session.header.actions': { kind: 'list', scope: 'session' },
    },
  } as never, () => null)
  const viewFace = (): Record<string, unknown> =>
    (ctx.slots.entries('conversation.view')
      .find(entry => entry.options.id === 'kg')?.inject as unknown as (sessionId: string) => Record<string, unknown>)('s1')
  const sidebarFace = (): Record<string, unknown> =>
    (ctx.slots.entries('sidebar.footer.action')
      .find(entry => entry.options.id === 'kg')?.inject as unknown as () => Record<string, unknown>)()
  const headerFace = (): Record<string, unknown> =>
    (ctx.slots.entries('conversation.session.header.actions')
      .find(entry => entry.options.id === 'kg')?.inject as unknown as () => Record<string, unknown>)()
  const storeOf = (face: Record<string, unknown>): { getSnapshot(): KgSnapshotView } =>
    (face.hooks as { kg: { getSnapshot(): KgSnapshotView } }).kg
  return { ctx, slots, revoke, viewFace, sidebarFace, headerFace, storeOf, ...kg }
}

describe('ui-kg browser half apply', () => {
  it('declares its required services', () => {
    expect(inject).toEqual(['slots', 'locale', 'connection'])
  })

  it('registers the three seats with the locale-bound view label', async () => {
    const { ctx, slots, revoke } = await bench()
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
    const { ctx, revoke, sidebarFace, storeOf, schema } = await bench({ schema: async () => fail('kg-not-composed') })
    // The face itself is inert (the component pulls refresh on mount); call
    // it directly and watch the failure land in the shared store.
    const face = sidebarFace()
    ;(face.refresh as () => void)()
    expect(schema).toHaveBeenCalled()
    await vi.waitFor(() => { expect(storeOf(face).getSnapshot().legend).toEqual({ status: 'error', error: 'kg-not-composed' }) })
    revoke()
    void ctx.fiber.dispose()
  })

  it('hands the view a working walk/expand/search face over the api', async () => {
    const { ctx, revoke, viewFace, subgraph, expand, search } = await bench()
    const face = viewFace()
    ;(face.walk as (seeds: readonly string[], hops: number) => void)(['宏发食品'], 2)
    await vi.waitFor(() => { expect(subgraph).toHaveBeenCalledWith({ seeds: ['宏发食品'], hops: 2 }) })
    ;(face.expandNode as (nodeId: string) => void)('nocobase:customers:1')
    ;(face.searchSeeds as (query: string) => void)('宏发')
    await vi.waitFor(() => { expect(expand).toHaveBeenCalled(); expect(search).toHaveBeenCalled() })
    revoke()
    void ctx.fiber.dispose()
  })

  it('the default view walks the first entities once, gated on the counters', async () => {
    const { ctx, revoke, viewFace, schema, subgraph, search, stats } = await bench({
      search: async () => ok({ nodes: [
        { id: 'nocobase:customers:1', type: 'Customer', name: '宏发食品' },
        { id: 'kb:doc:酱油', type: 'Concept', name: '酱油' },
      ] }),
    })
    const face = viewFace()
    const ensureDefaultView = face.ensureDefaultView as () => void
    ensureDefaultView()
    ensureDefaultView()
    await vi.waitFor(() => { expect(subgraph).toHaveBeenCalledWith({ seeds: ['宏发食品', '酱油'], hops: 1 }) })
    expect(stats).toHaveBeenCalledTimes(1)
    expect(search).toHaveBeenCalledWith({ query: '', k: 3 })
    // The legend load stays a separate call the entry/tab owns.
    expect(schema).not.toHaveBeenCalled()
    revoke()
    void ctx.fiber.dispose()
  })

  it('the default view leaves a zero-entity graph untouched', async () => {
    const { ctx, revoke, viewFace, subgraph, search, stats } = await bench({
      stats: async () => ok({ triples: 0, entities: 0, node_types: 0, relations: 0 }),
    })
    ;(viewFace().ensureDefaultView as () => void)()
    await vi.waitFor(() => { expect(stats).toHaveBeenCalledTimes(1) })
    expect(search).not.toHaveBeenCalled()
    expect(subgraph).not.toHaveBeenCalled()
    revoke()
    void ctx.fiber.dispose()
  })
})

describe('ui-kg apply service fan-out', () => {
  it('refresh defaults a missing revisions tail and re-entrancy is guarded while loading', async () => {
    // The default schema answer carries no revisions (an older gateway):
    // the legend normalizes to the empty tail.
    const bare = await bench()
    const bareFace = bare.sidebarFace()
    ;(bareFace.refresh as () => void)()
    await vi.waitFor(() => { expect(bare.storeOf(bareFace).getSnapshot().legend?.status).toBe('ready') })
    expect(bare.storeOf(bareFace).getSnapshot().legend?.value?.revisions).toEqual([])
    void bare.ctx.fiber.dispose()

    const schemaAnswer = ok({ node_types: TYPES, relations: [], revisions: [{ id: 3, summary: 's', created_at: 't' }] })
    const pending = deferred<typeof schemaAnswer>()
    const { ctx, revoke, viewFace, storeOf, schema } = await bench({ schema: () => pending.promise })
    const face = viewFace()
    ;(face.refresh as () => void)()
    // A second refresh inside the in-flight window is a no-op.
    ;(face.refresh as () => void)()
    expect(schema).toHaveBeenCalledTimes(1)
    pending.resolve(schemaAnswer)
    const store = storeOf(face)
    await vi.waitFor(() => { expect(store.getSnapshot().legend?.status).toBe('ready') })
    expect(store.getSnapshot().legend?.value?.revisions).toHaveLength(1)
    ;(face.refresh as () => void)()
    await vi.waitFor(() => { expect(schema).toHaveBeenCalledTimes(2) })
    revoke()
    void ctx.fiber.dispose()
  })

  it('loadFeed lands episodes and the review queue, and both refusals surface', async () => {
    const { ctx, revoke, viewFace, storeOf, episodes, reviewQueue } = await bench()
    const face = viewFace()
    ;(face.loadFeed as () => void)()
    const store = storeOf(face)
    await vi.waitFor(() => {
      expect(store.getSnapshot().episodes?.status).toBe('ready')
      expect(store.getSnapshot().review?.status).toBe('ready')
    })
    expect(store.getSnapshot().episodes?.value?.[0]?.uuid).toBe('ingest:1')
    expect(store.getSnapshot().review?.value?.sourceEpisode).toBe('ingest:1')
    expect(episodes).toHaveBeenCalledWith({ limit: 50 })
    expect(reviewQueue).toHaveBeenCalledWith({})

    const failing = await bench({
      episodes: async () => fail('episodes-offline'),
      reviewQueue: async () => fail('review-offline'),
    })
    const failingFace = failing.viewFace()
    ;(failingFace.loadFeed as () => void)()
    const failingStore = failing.storeOf(failingFace)
    await vi.waitFor(() => {
      expect(failingStore.getSnapshot().episodes).toEqual({ status: 'error', error: 'episodes-offline' })
      expect(failingStore.getSnapshot().review).toEqual({ status: 'error', error: 'review-offline' })
    })
    revoke()
    void ctx.fiber.dispose()
    void failing.ctx.fiber.dispose()
  })

  it('loadFeed skips both reads while one episode load is already in flight', async () => {
    const episodesAnswer = ok({ episodes: [] })
    const pending = deferred<typeof episodesAnswer>()
    const { ctx, revoke, viewFace, storeOf, episodes, reviewQueue } = await bench({ episodes: () => pending.promise })
    const face = viewFace()
    ;(face.loadFeed as () => void)()
    ;(face.loadFeed as () => void)()
    expect(episodes).toHaveBeenCalledTimes(1)
    expect(reviewQueue).toHaveBeenCalledTimes(1)
    pending.resolve(episodesAnswer)
    const store = storeOf(face)
    await vi.waitFor(() => { expect(store.getSnapshot().episodes?.status).toBe('ready') })
    revoke()
    void ctx.fiber.dispose()
  })

  it('loadFeed skips the review half while a review load is already in flight', async () => {
    const reviewAnswer = ok({ entries: [], source_episode: 'ingest:1' })
    const pendingReview = deferred<typeof reviewAnswer>()
    const { ctx, revoke, viewFace, storeOf, episodes, reviewQueue } = await bench({ reviewQueue: () => pendingReview.promise })
    const face = viewFace()
    ;(face.loadFeed as () => void)()
    const store = storeOf(face)
    // Episodes settles first; the review half stays loading.
    await vi.waitFor(() => { expect(store.getSnapshot().episodes?.status).toBe('ready') })
    ;(face.loadFeed as () => void)()
    expect(episodes).toHaveBeenCalledTimes(2)
    expect(reviewQueue).toHaveBeenCalledTimes(1)
    pendingReview.resolve(reviewAnswer)
    await vi.waitFor(() => { expect(store.getSnapshot().review?.status).toBe('ready') })
    revoke()
    void ctx.fiber.dispose()
  })

  it('loadCommunities is a no-op while a partition load is already in flight', async () => {
    const communitiesAnswer = ok({ communities: [], modularity: 0, node_count: 0 })
    const pending = deferred<typeof communitiesAnswer>()
    const { ctx, revoke, viewFace, storeOf, communities } = await bench({ communities: () => pending.promise })
    const face = viewFace()
    ;(face.loadCommunities as () => void)()
    ;(face.loadCommunities as () => void)()
    expect(communities).toHaveBeenCalledTimes(1)
    pending.resolve(communitiesAnswer)
    const store = storeOf(face)
    await vi.waitFor(() => { expect(store.getSnapshot().communities?.status).toBe('ready') })
    revoke()
    void ctx.fiber.dispose()
  })

  it('loadCommunities lands the louvain partition or its refusal', async () => {
    const { ctx, revoke, viewFace, storeOf, communities } = await bench()
    const face = viewFace()
    ;(face.loadCommunities as () => void)()
    const store = storeOf(face)
    await vi.waitFor(() => { expect(store.getSnapshot().communities?.status).toBe('ready') })
    expect(communities).toHaveBeenCalledWith({})

    const failing = await bench({ communities: async () => fail('communities-offline') })
    const failingFace = failing.viewFace()
    ;(failingFace.loadCommunities as () => void)()
    await vi.waitFor(() => {
      expect(failing.storeOf(failingFace).getSnapshot().communities).toEqual({ status: 'error', error: 'communities-offline' })
    })
    revoke()
    void ctx.fiber.dispose()
    void failing.ctx.fiber.dispose()
  })

  it('rollbackEpisode and decideReview ride the write RPCs and reject on refusal', async () => {
    const { ctx, revoke, viewFace, rollback, reviewDecide } = await bench()
    const face = viewFace()
    const entry = {
      doc_id: 'kb:doc#大豆', row_id: 'nocobase:materials:7', doc_name: '大豆', row_name: '非转基因大豆', confidence: 0.72, reason: '',
    }
    await expect((face.rollbackEpisode as (uuid: string) => Promise<unknown>)('ingest:1'))
      .resolves.toMatchObject({ rolled_back: 'ingest:1' })
    expect(rollback).toHaveBeenCalledWith({ episode_uuid: 'ingest:1' })
    await expect((face.decideReview as (e: typeof entry, d: 'merge') => Promise<void>)(entry, 'merge')).resolves.toBeUndefined()
    expect(reviewDecide).toHaveBeenCalledWith({
      doc_id: 'kb:doc#大豆', row_id: 'nocobase:materials:7', decision: 'merge', doc_name: '大豆', row_name: '非转基因大豆',
    })

    const failing = await bench({ rollback: async () => fail('episode-settled'), reviewDecide: async () => fail('queue-closed') })
    const failingFace = failing.viewFace()
    await expect((failingFace.rollbackEpisode as (uuid: string) => Promise<unknown>)('ingest:1')).rejects.toThrow('episode-settled')
    await expect((failingFace.decideReview as (e: typeof entry, d: 'skip') => Promise<void>)(entry, 'skip')).rejects.toThrow('queue-closed')
    revoke()
    void ctx.fiber.dispose()
    void failing.ctx.fiber.dispose()
  })

  it('applyOntoEdit forwards the op set and resolves with the receipt', async () => {
    const { ctx, revoke, viewFace, ontologyEdit } = await bench()
    const face = viewFace()
    const ops = [{ op: 'add_node' as const, target_id: 'frozenTofu', label: '冻豆腐', parent_id: 'food' }]
    await expect((face.applyOntoEdit as (ops: readonly unknown[]) => Promise<unknown>)(ops))
      .resolves.toMatchObject({ revision_id: 7 })
    expect(ontologyEdit).toHaveBeenCalledWith({ ops })
    revoke()
    void ctx.fiber.dispose()
  })

  it('replayAt freezes the history snapshot and leaveReplay clears it; refusals surface', async () => {
    const { ctx, revoke, viewFace, storeOf, history } = await bench()
    const face = viewFace()
    ;(face.replayAt as (asOf: string) => void)('2026-09-18T02:00:00.000Z')
    const store = storeOf(face)
    await vi.waitFor(() => { expect(store.getSnapshot().history?.status).toBe('ready') })
    expect(store.getSnapshot().history?.value?.asOf).toBe('2026-09-18T02:00:00.000Z')
    expect(history).toHaveBeenCalledWith({ as_of: '2026-09-18T02:00:00.000Z' })
    ;(face.leaveReplay as () => void)()
    expect(store.getSnapshot().history).toBeUndefined()

    const failing = await bench({ history: async () => fail('history-offline') })
    const failingFace = failing.viewFace()
    ;(failingFace.replayAt as (asOf: string) => void)('2026-09-18T02:00:00.000Z')
    await vi.waitFor(() => {
      expect(failing.storeOf(failingFace).getSnapshot().history).toEqual({ status: 'error', error: 'history-offline' })
    })
    revoke()
    void ctx.fiber.dispose()
    void failing.ctx.fiber.dispose()
  })

  it('replayAt is a no-op while a history load is already in flight', async () => {
    const historyAnswer = ok({ nodes: [], edges: [], truncated: false, as_of: 't1' })
    const pending = deferred<typeof historyAnswer>()
    const { ctx, revoke, viewFace, storeOf, history } = await bench({ history: () => pending.promise })
    const face = viewFace()
    ;(face.replayAt as (asOf: string) => void)('t1')
    ;(face.replayAt as (asOf: string) => void)('t2')
    expect(history).toHaveBeenCalledTimes(1)
    pending.resolve(historyAnswer)
    const store = storeOf(face)
    await vi.waitFor(() => { expect(store.getSnapshot().history?.status).toBe('ready') })
    revoke()
    void ctx.fiber.dispose()
  })

  it('loadPanel joins stats with the mappings readout and reports counters alone without it', async () => {
    const { ctx, revoke, viewFace, storeOf, stats, mappings } = await bench()
    const face = viewFace()
    ;(face.loadPanel as () => void)()
    const store = storeOf(face)
    await vi.waitFor(() => { expect(store.getSnapshot().panel?.status).toBe('ready') })
    expect(stats).toHaveBeenCalledWith({})
    expect(mappings).toHaveBeenCalledWith({})
    expect(store.getSnapshot().panel?.value).toMatchObject({ mappings: { file: 'kg-mappings.yml' } })

    // A deployment without the pipeline answers the mappings readout with a
    // refusal envelope; the panel keeps the counters alone. A transport
    // rejection on the same read rides the catch arm to the same result.
    const bare = await bench({ mappings: async () => fail('mappings-not-composed') })
    const bareFace = bare.viewFace()
    ;(bareFace.loadPanel as () => void)()
    const bareStore = bare.storeOf(bareFace)
    await vi.waitFor(() => { expect(bareStore.getSnapshot().panel?.status).toBe('ready') })
    expect(bareStore.getSnapshot().panel?.value?.mappings).toBeUndefined()

    const unreachable = await bench({ mappings: () => Promise.reject(new Error('transport-down')) })
    const unreachableFace = unreachable.viewFace()
    ;(unreachableFace.loadPanel as () => void)()
    const unreachableStore = unreachable.storeOf(unreachableFace)
    await vi.waitFor(() => { expect(unreachableStore.getSnapshot().panel?.status).toBe('ready') })
    expect(unreachableStore.getSnapshot().panel?.value?.mappings).toBeUndefined()
    revoke()
    void ctx.fiber.dispose()
    void bare.ctx.fiber.dispose()
    void unreachable.ctx.fiber.dispose()
  })

  it('loadPanel carries optional coverage and last_run_at only when stats answers them', async () => {
    const lean = await bench({
      stats: async () => ok({ triples: 4, entities: 2, islands: 0, conflicts: 0 }),
    })
    const leanFace = lean.viewFace()
    ;(leanFace.loadPanel as () => void)()
    const leanStore = lean.storeOf(leanFace)
    await vi.waitFor(() => { expect(leanStore.getSnapshot().panel?.status).toBe('ready') })
    // The full bench answers coverage + last_run_at; both rides land.
    const full = await bench({
      stats: async () => ok({ ...STATS_FULL, coverage: { numerator: 42, denominator: 50, ratio: 0.84 }, last_run_at: '2026-09-15T03:00:00.000Z' }),
    })
    const fullFace = full.viewFace()
    ;(fullFace.loadPanel as () => void)()
    const fullStore = full.storeOf(fullFace)
    await vi.waitFor(() => {
      expect(fullStore.getSnapshot().panel?.status).toBe('ready')
      expect(fullStore.getSnapshot().panel?.value?.quality)
        .toMatchObject({ coverage: { numerator: 42 }, last_run_at: '2026-09-15T03:00:00.000Z' })
    })
    const leanQuality = leanStore.getSnapshot().panel?.value?.quality
    expect(leanQuality?.coverage).toBeUndefined()
    expect(leanQuality?.last_run_at).toBeUndefined()
    void lean.ctx.fiber.dispose()
    void full.ctx.fiber.dispose()
  })

  it('loadPanel re-entrancy is guarded and a stats refusal fails the panel', async () => {
    const statsAnswer = ok({ ...STATS_FULL })
    const pendingStats = deferred<typeof statsAnswer>()
    const { ctx, revoke, viewFace, storeOf, stats } = await bench({ stats: () => pendingStats.promise })
    const face = viewFace()
    ;(face.loadPanel as () => void)()
    ;(face.loadPanel as () => void)()
    expect(stats).toHaveBeenCalledTimes(1)
    pendingStats.resolve(statsAnswer)
    const store = storeOf(face)
    await vi.waitFor(() => { expect(store.getSnapshot().panel?.status).toBe('ready') })

    const failing = await bench({ stats: async () => fail('stats-offline') })
    const failingFace = failing.viewFace()
    ;(failingFace.loadPanel as () => void)()
    await vi.waitFor(() => {
      expect(failing.storeOf(failingFace).getSnapshot().panel).toEqual({ status: 'error', error: 'stats-offline' })
    })
    revoke()
    void ctx.fiber.dispose()
    void failing.ctx.fiber.dispose()
  })

  it('queryPhrase lands the walked canvas or records the refusal and rethrows it', async () => {
    const { ctx, revoke, viewFace, storeOf, query } = await bench()
    const face = viewFace()
    await expect((face.queryPhrase as (phrase: string) => Promise<string>)('宏发食品的供货链'))
      .resolves.toBe('「宏发食品」周边两跳关系')
    expect(query).toHaveBeenCalledWith({ phrase: '宏发食品的供货链' })
    const store = storeOf(face)
    await vi.waitFor(() => { expect(store.getSnapshot().canvas?.status).toBe('ready') })
    expect(store.getSnapshot().canvas?.value?.seeds).toEqual(['宏发食品'])

    // A rejection string (not an Error) still becomes readable canvas error text.
    // oxlint-disable-next-line typescript/prefer-promise-reject-errors -- the bare-string rejection is the transport quirk under test.
    const failing = await bench({ query: () => Promise.reject('query-offline') })
    const failingFace = failing.viewFace()
    await expect((failingFace.queryPhrase as (phrase: string) => Promise<string>)('宏发食品的供货链'))
      .rejects.toBe('query-offline')
    await vi.waitFor(() => {
      expect(failing.storeOf(failingFace).getSnapshot().canvas).toEqual({ status: 'error', error: 'query-offline' })
    })
    revoke()
    void ctx.fiber.dispose()
    void failing.ctx.fiber.dispose()
  })

  it('walk, expand, and search refusals record their canvas/search error states', async () => {
    const { ctx, revoke, viewFace, storeOf } = await bench({
      subgraph: () => Promise.reject(new Error('walk-down')),
      expand: () => Promise.reject(new Error('expand-down')),
      search: () => Promise.reject(new Error('search-down')),
    })
    const face = viewFace()
    const store = storeOf(face)
    ;(face.walk as (seeds: readonly string[], hops: number) => void)(['宏发食品'], 1)
    await vi.waitFor(() => { expect(store.getSnapshot().canvas).toEqual({ status: 'error', error: 'walk-down' }) })
    // The expand failure records over the walk failure (latest write wins).
    ;(face.expandNode as (nodeId: string) => void)('n1')
    await vi.waitFor(() => { expect(store.getSnapshot().canvas).toEqual({ status: 'error', error: 'expand-down' }) })
    ;(face.searchSeeds as (query: string) => void)('宏发')
    await vi.waitFor(() => { expect(store.getSnapshot().search).toEqual({ status: 'error', error: 'search-down' }) })
    revoke()
    void ctx.fiber.dispose()
  })

  it('the default view swallows a failing stats or empty seed probe untouched', async () => {
    const statsFailing = await bench({ stats: () => Promise.reject(new Error('stats-down')) })
    const statsFace = statsFailing.viewFace()
    ;(statsFace.ensureDefaultView as () => void)()
    await vi.waitFor(() => { expect(statsFailing.stats).toHaveBeenCalledTimes(1) })
    expect(statsFailing.search).not.toHaveBeenCalled()
    expect(statsFailing.storeOf(statsFace).getSnapshot().canvas).toBeUndefined()

    const emptyHits = await bench({
      stats: async () => ok({ triples: 9, entities: 5, islands: 0, conflicts: 0 }),
      search: async () => ok({ nodes: [] }),
    })
    const emptyFace = emptyHits.viewFace()
    ;(emptyFace.ensureDefaultView as () => void)()
    await vi.waitFor(() => { expect(emptyHits.search).toHaveBeenCalledTimes(1) })
    expect(emptyHits.subgraph).not.toHaveBeenCalled()
    expect(emptyHits.storeOf(emptyFace).getSnapshot().canvas).toBeUndefined()
    void statsFailing.ctx.fiber.dispose()
    void emptyHits.ctx.fiber.dispose()
  })

  it('the view face writes selection, filters, color mode through the shared store', async () => {
    const { ctx, revoke, viewFace, storeOf } = await bench()
    const face = viewFace()
    const store = storeOf(face)
    ;(face.selectNode as (id: string) => void)('nocobase:customers:1')
    expect(store.getSnapshot().selected).toBe('nocobase:customers:1')
    ;(face.selectNode as (id: undefined) => void)(undefined)
    expect(store.getSnapshot().selected).toBeUndefined()

    const toggle = face.toggleTypeFilter as (typeId: string) => void
    toggle('Customer')
    toggle('Order')
    expect([...store.getSnapshot().typeFilter ?? []].sort()).toEqual(['Customer', 'Order'])
    toggle('Customer')
    expect([...store.getSnapshot().typeFilter ?? []]).toEqual(['Order'])
    toggle('Order')
    expect(store.getSnapshot().typeFilter).toBeUndefined()
    toggle('Customer')
    ;(face.clearTypeFilter as () => void)()
    expect(store.getSnapshot().typeFilter).toBeUndefined()

    ;(face.setColorMode as (mode: 'community') => void)('community')
    expect(store.getSnapshot().colorMode).toBe('community')
    revoke()
    void ctx.fiber.dispose()
  })

  it('the header publisher owns the bridge; a stale revoker never clears a newer switch', async () => {
    const { ctx, revoke, viewFace, sidebarFace, headerFace } = await bench()
    const first = vi.fn()
    const second = vi.fn()
    const header = headerFace()
    const revokeFirst = (header.publishViewSwitch as (setView: (view: string) => void) => () => void)(first)
    const revokeSecond = (header.publishViewSwitch as (setView: (view: string) => void) => () => void)(second)
    // Revoking the first publisher leaves the second one live.
    revokeFirst()
    ;(viewFace().requestView as (view: string) => void)('chat')
    expect(first).not.toHaveBeenCalled()
    expect(second).toHaveBeenCalledWith('chat')
    revokeSecond()
    ;(viewFace().requestView as (view: string) => void)('chat')
    expect(second).toHaveBeenCalledTimes(1)
    // Without any publisher the sidebar's switch request is a no-op.
    ;(sidebarFace().requestKgView as () => void)()
    expect(second).toHaveBeenCalledTimes(1)
    revoke()
    void ctx.fiber.dispose()
  })
})
