// @vitest-environment jsdom
// The kg view tab: the four-state matrix (loading skeleton, ready canvas —
// which in jsdom degrades to the relation list, the empty/unbuilt guidance,
// error retry), the phrase box's template parse with its restatement, the
// seed-search hits walk handoff, the type-legend filter, the details panel's
// degree/provenance rows, and the "ask about this" conversation handoff.

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-runtime/client'
import type { KgClientState } from '../src/client/kgStore.ts'
import { KgView } from '../src/client/KgView.tsx'
import { KgEntry } from '../src/client/KgEntry.tsx'
// Type-only: pulls the LocaleNamespaceMap merge so PropsLocale<'kg'> resolves.
import type {} from '../src/client/index.ts'
import { zh } from '../src/client/locales.ts'
import { nodeColorOf, parseKgPhrase } from '../src/client/presentation.ts'
import { bindStoreHook, GLOBAL_KIT, SESSION_KIT, sessionListState } from './kg-fixture.client.ts'

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

/** The zh dictionary as the page's t (params rendered the way the runtime does). */
const t = ((key: string, params?: Record<string, string | number>) => {
  const template = zh[key as keyof typeof zh]
  if (template === undefined) return key
  return template.replaceAll(/\{(\w+)\}/g, (_, name: string) => String(params?.[name] ?? ''))
}) as never

const NODE_A = { id: 'nocobase:customers:1', type: 'Customer', name: '宏发食品', depth: 0 }
const NODE_B = { id: 'nocobase:orders:9', type: 'Order', name: 'SO-009', depth: 1 }
const NODE_C = { id: 'kb:doc:风险点', type: 'Concept', name: '仓储风险', depth: 1 }

const LEGEND_READY: KgClientState['legend'] = {
  status: 'ready',
  value: {
    types: [
      { id: 'Customer', label: '客户', layer: 'domain', prop_keys: [], source: 'builtin-food', status: 'active' },
      { id: 'Order', label: '订单', layer: 'domain', prop_keys: [], source: 'nocobase-derived', status: 'active' },
    ],
    relations: [],
    revisions: [],
  },
}

const CANVAS_READY: NonNullable<KgClientState['canvas']> = {
  status: 'ready',
  value: {
    nodes: [NODE_A, NODE_B, NODE_C],
    edges: [
      { id: 'e1', relation: 'placed_by', source: NODE_A.id, target: NODE_B.id, asserted_by: 'nocobase' },
      { id: 'e2', relation: 'mentions', source: NODE_B.id, target: NODE_C.id, asserted_by: 'kb' },
    ],
    truncated: false,
    seeds: [NODE_A.id],
  },
}

function mount(state: KgClientState) {
  const store = createSnapshotStore<KgClientState>(state)
  const actions = {
    refresh: vi.fn(),
    ensureDefaultView: vi.fn(),
    walk: vi.fn(),
    expandNode: vi.fn(),
    searchSeeds: vi.fn(),
    loadPanel: vi.fn(),
    queryPhrase: vi.fn().mockRejectedValue(new Error('kg.query offline')),
    selectNode: vi.fn(),
    toggleTypeFilter: vi.fn(),
    clearTypeFilter: vi.fn(),
    loadFeed: vi.fn(),
    loadCommunities: vi.fn(),
    rollbackEpisode: vi.fn(),
    decideReview: vi.fn(),
    applyOntoEdit: vi.fn(),
    replayAt: vi.fn(),
    leaveReplay: vi.fn(),
    setColorMode: vi.fn(),
    requestView: vi.fn(),
  }
  const setDraft = vi.fn()
  render(
    <KgView
      {...SESSION_KIT}
      inputActions={{ setDraft } as never}
      useKg={bindStoreHook(store) as never}
      {...actions}
      t={t}
    />,
  )
  return { ...actions, setDraft }
}

afterEach(cleanup)

describe('parseKgPhrase templates', () => {
  const restater = (kind: import('../src/client/presentation.ts').OfflinePhraseKind, entity: string): string => `${kind}:${entity}`

  it('parses the supply-chain phrase to a two-hop walk', () => {
    expect(parseKgPhrase('宏发食品的供货链', restater))
      .toEqual({ seeds: ['宏发食品'], hops: 2, restated: 'supply:宏发食品' })
  })

  it('parses the orders phrase to a one-hop walk', () => {
    expect(parseKgPhrase('宏发食品 的订单', restater))
      .toEqual({ seeds: ['宏发食品'], hops: 1, restated: 'orders:宏发食品' })
  })

  it('parses the containment phrase to a one-hop walk', () => {
    expect(parseKgPhrase('含棕榈油的商品', restater))
      .toEqual({ seeds: ['棕榈油'], hops: 1, restated: 'contains:棕榈油' })
  })

  it('falls back to the whole text as one seed and drops blank text', () => {
    expect(parseKgPhrase('张三丰', restater)).toEqual({ seeds: ['张三丰'], hops: 1, restated: '张三丰' })
    expect(parseKgPhrase('   ', restater)).toBeUndefined()
  })

  it('hashes node colors onto the theme ladder stably', () => {
    expect(nodeColorOf('Customer')).toBe(nodeColorOf('Customer'))
    expect(nodeColorOf('Customer')).toMatch(/^var\(--dsw-graph-node-\d\)$/)
    expect(nodeColorOf('Customer')).not.toBe(nodeColorOf('Order'))
  })
})

describe('KgView state matrix', () => {
  it('loads the legend and asks for the default view on mount while the canvas is untouched', () => {
    const { refresh, ensureDefaultView, loadPanel } = mount({
      legend: undefined, canvas: undefined, search: undefined, panel: undefined, selected: undefined, typeFilter: undefined,
      episodes: undefined, review: undefined, communities: undefined, history: undefined, colorMode: 'semantic',
    })
    expect(refresh).toHaveBeenCalled()
    expect(ensureDefaultView).toHaveBeenCalled()
    expect(loadPanel).toHaveBeenCalled()
    expect(screen.getByText(zh['page.title'])).toBeTruthy()
    expect(screen.getByText(zh['canvas.emptyTitle'])).toBeTruthy()
  })

  it('never asks for the default view once a canvas state exists', () => {
    const { ensureDefaultView } = mount({
      legend: LEGEND_READY,
      canvas: { status: 'loading' },
      search: undefined, panel: undefined, selected: undefined, typeFilter: undefined,
      episodes: undefined, review: undefined, communities: undefined, history: undefined, colorMode: 'semantic',
    })
    expect(ensureDefaultView).not.toHaveBeenCalled()
  })

  it('renders the canvas loading skeleton while a walk is in flight', () => {
    mount({
      legend: LEGEND_READY,
      canvas: { status: 'loading' },
      search: undefined, panel: undefined, selected: undefined, typeFilter: undefined,
      episodes: undefined, review: undefined, communities: undefined, history: undefined, colorMode: 'semantic',
    })
    expect(document.querySelector('[aria-hidden="true"]')).toBeTruthy()
  })

  it('shows the error strip with a retry on a failed legend load', () => {
    const { refresh } = mount({
      legend: { status: 'error', error: 'kg-not-composed' },
      canvas: undefined, search: undefined, panel: undefined, selected: undefined, typeFilter: undefined,
      episodes: undefined, review: undefined, communities: undefined, history: undefined, colorMode: 'semantic',
    })
    expect(screen.getByText(/kg-not-composed/u)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: zh['error.retry'] }))
    expect(refresh).toHaveBeenCalled()
  })

  it('shows the build guide when a walk returned an empty graph', () => {
    mount({
      legend: LEGEND_READY,
      canvas: { status: 'ready', value: { nodes: [], edges: [], truncated: false, seeds: [] } },
      search: undefined, panel: undefined, selected: undefined, typeFilter: undefined,
      episodes: undefined, review: undefined, communities: undefined, history: undefined, colorMode: 'semantic',
    })
    expect(screen.getByText(zh['build.unbuiltTitle'])).toBeTruthy()
  })
})

describe('KgView canvas and interactions', () => {
  it('degrades to the relation list in jsdom (no WebGL) and still selects + expands', async () => {
    const { selectNode, expandNode } = mount({
      legend: LEGEND_READY,
      canvas: CANVAS_READY,
      search: undefined, panel: undefined, selected: undefined, typeFilter: undefined,
      episodes: undefined, review: undefined, communities: undefined, history: undefined, colorMode: 'semantic',
    })
    // The dynamic sigma import either throws or Sigma's constructor fails on
    // the null WebGL context — both land in the degraded list.
    await waitFor(() => { expect(screen.getByTestId('kg-canvas-list')).toBeTruthy() })
    fireEvent.click(screen.getByText(NODE_A.name))
    expect(selectNode).toHaveBeenCalledWith(NODE_A.id)
    const expandButtons = screen.getAllByRole('button', { name: zh['details.expand'] })
    fireEvent.click(expandButtons[0]!)
    expect(expandNode).toHaveBeenCalled()
  })

  it('walks from the phrase box through the server query and shows its restatement', async () => {
    const queryPhrase = vi.fn().mockResolvedValue('宏发食品 · 2 hops')
    const store = createSnapshotStore<KgClientState>({
      legend: LEGEND_READY, canvas: undefined, search: undefined, panel: undefined, selected: undefined, typeFilter: undefined,
      episodes: undefined, review: undefined, communities: undefined, history: undefined, colorMode: 'semantic',
    })
    const walk = vi.fn()
    render(
      <KgView
        {...SESSION_KIT}
        inputActions={{ setDraft: vi.fn() } as never}
        useKg={bindStoreHook(store) as never}
        refresh={vi.fn()} ensureDefaultView={vi.fn()} walk={walk} expandNode={vi.fn()} searchSeeds={vi.fn()}
        loadPanel={vi.fn()} queryPhrase={queryPhrase} selectNode={vi.fn()} toggleTypeFilter={vi.fn()}
        clearTypeFilter={vi.fn()}
        loadFeed={vi.fn()} loadCommunities={vi.fn()} rollbackEpisode={vi.fn()} decideReview={vi.fn()}
        applyOntoEdit={vi.fn()} replayAt={vi.fn()} leaveReplay={vi.fn()} setColorMode={vi.fn()}
        requestView={vi.fn()} t={t}
      />,
    )
    const phraseBox = screen.getByLabelText(zh['phrase.action']) as HTMLInputElement
    fireEvent.change(phraseBox, { target: { value: '宏发食品的供货链' } })
    fireEvent.click(screen.getByRole('button', { name: zh['phrase.action'] }))
    await waitFor(() => { expect(screen.getByText('宏发食品 · 2 hops')).toBeTruthy() })
    expect(queryPhrase).toHaveBeenCalledWith('宏发食品的供货链')
    expect(walk).not.toHaveBeenCalled()
  })

  it('falls back to the built-in parse when the server query is unreachable', async () => {
    const { walk } = mount({
      legend: LEGEND_READY, canvas: undefined, search: undefined, panel: undefined, selected: undefined, typeFilter: undefined,
      episodes: undefined, review: undefined, communities: undefined, history: undefined, colorMode: 'semantic',
    })
    const phraseBox = screen.getByLabelText(zh['phrase.action']) as HTMLInputElement
    fireEvent.change(phraseBox, { target: { value: '宏发食品的供货链' } })
    fireEvent.click(screen.getByRole('button', { name: zh['phrase.action'] }))
    await waitFor(() => { expect(walk).toHaveBeenCalledWith(['宏发食品'], 2) })
    expect(screen.getByText(zh['phrase.restate.supply'].replace('{entity}', '宏发食品'))).toBeTruthy()
  })

  it('surfaces the unsupported-shape hint when no template matches', async () => {
    const store = createSnapshotStore<KgClientState>({
      legend: LEGEND_READY, canvas: undefined, search: undefined, panel: undefined, selected: undefined, typeFilter: undefined,
      episodes: undefined, review: undefined, communities: undefined, history: undefined, colorMode: 'semantic',
    })
    render(
      <KgView
        {...SESSION_KIT}
        inputActions={{ setDraft: vi.fn() } as never}
        useKg={bindStoreHook(store) as never}
        refresh={vi.fn()} ensureDefaultView={vi.fn()} walk={vi.fn()} expandNode={vi.fn()} searchSeeds={vi.fn()}
        loadPanel={vi.fn()}
        queryPhrase={vi.fn().mockRejectedValue(new Error('kg.query: no template matches'))}
        selectNode={vi.fn()} toggleTypeFilter={vi.fn()} clearTypeFilter={vi.fn()}
        loadFeed={vi.fn()} loadCommunities={vi.fn()} rollbackEpisode={vi.fn()} decideReview={vi.fn()}
        applyOntoEdit={vi.fn()} replayAt={vi.fn()} leaveReplay={vi.fn()} setColorMode={vi.fn()}
        requestView={vi.fn()} t={t}
      />,
    )
    const phraseBox = screen.getByLabelText(zh['phrase.action']) as HTMLInputElement
    fireEvent.change(phraseBox, { target: { value: '一句话随便说说看' } })
    fireEvent.click(screen.getByRole('button', { name: zh['phrase.action'] }))
    await waitFor(() => { expect(screen.getByTestId('kg-phrase-error').textContent).toContain(zh['phrase.unsupported']) })
  })

  it('queries seeds as the search box types', () => {
    const { searchSeeds } = mount({
      legend: LEGEND_READY, canvas: undefined, search: undefined, panel: undefined, selected: undefined, typeFilter: undefined,
      episodes: undefined, review: undefined, communities: undefined, history: undefined, colorMode: 'semantic',
    })
    fireEvent.change(screen.getByLabelText(zh['search.action']), { target: { value: '宏发' } })
    expect(searchSeeds).toHaveBeenCalledWith('宏发')
  })

  it('renders the legend rows and clears the filter through the all-types row', () => {
    const { clearTypeFilter } = mount({
      legend: LEGEND_READY,
      canvas: CANVAS_READY,
      search: undefined, panel: undefined, selected: undefined, typeFilter: new Set(['Customer']),
      episodes: undefined, review: undefined, communities: undefined, history: undefined, colorMode: 'semantic',
    })
    expect(screen.getByText('客户')).toBeTruthy()
    expect(screen.getByText('订单')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: zh['legend.all'] }))
    expect(clearTypeFilter).toHaveBeenCalled()
  })

  it('renders the quality panel with counters, coverage, and the mapping list', () => {
    mount({
      legend: LEGEND_READY,
      canvas: undefined,
      search: undefined,
      panel: {
        status: 'ready',
        value: {
          quality: {
            islands: 3,
            conflicts: 1,
            coverage: { numerator: 42, denominator: 50, ratio: 0.84 },
            last_run_at: '2026-09-15T03:00:00.000Z',
          },
          stats: { triples: 120, entities: 80 },
          mappings: {
            file: 'kg-mappings.yml',
            version: 1,
            rules: { skipHiddenCollections: true, emptyFkNoEdge: true, derivesTitle: true },
            collections: [{ name: 'experts', fkLinkCount: 0 }],
            lastRun: {
              finishedAt: '2026-09-15T03:00:00.000Z',
              ruleHits: { R01: 5 },
              collections: [{ scope: 'experts', nodesUpserted: 12, edgesUpserted: 4, skipped: false, skippedRelationFields: [] }],
            },
          },
        },
      },
      selected: undefined, typeFilter: undefined,
      episodes: undefined, review: undefined, communities: undefined, history: undefined, colorMode: 'semantic',
    })
    expect(screen.getByTestId('kg-quality-islands').textContent).toBe('3')
    expect(screen.getByText('42/50（84%）')).toBeTruthy()
    const mappingRow = screen.getByTestId('kg-mapping-list')
    expect(mappingRow.textContent).toContain('experts')
    expect(mappingRow.textContent).toContain('12')
  })

  it('shows the details panel for the selected node with its degree', async () => {
    mount({
      legend: LEGEND_READY,
      canvas: CANVAS_READY,
      search: undefined, panel: undefined, selected: NODE_A.id, typeFilter: undefined,
      episodes: undefined, review: undefined, communities: undefined, history: undefined, colorMode: 'semantic',
    })
    // The name appears in the details paragraph; the degraded canvas list
    // (jsdom has no WebGL) renders the same name in a span.
    expect(screen.getByText(NODE_A.name, { selector: 'p' })).toBeTruthy()
    // The type label appears in the legend row and the details row.
    expect(screen.getAllByText('客户').length).toBe(2)
    // NODE_A touches e1 only.
    expect(screen.getByText('1')).toBeTruthy()
  })
})

const HISTORY_READY: NonNullable<KgClientState['history']> = {
  status: 'ready',
  value: {
    nodes: [{ id: 'kb:doc:历史快照', type: 'Concept', name: '历史快照节点', depth: 0 }],
    edges: [],
    truncated: true,
    asOf: '2026-09-18T02:00:00.000Z',
  },
}

const EPISODES_READY: NonNullable<KgClientState['episodes']> = {
  status: 'ready',
  value: [{
    uuid: 'ingest:1', source: 'ingest', name: '跨源共指对齐', content: 'crossSourceAlign v2',
    created_at: '2026-09-18T01:00:00.000Z', mentions: 4,
  }],
}

const PANEL_READY_MAPPINGS_PENDING: NonNullable<KgClientState['panel']> = {
  status: 'ready',
  value: {
    quality: { islands: 1, conflicts: 0 },
    stats: { triples: 10, entities: 6 },
    mappings: {
      file: 'kg-mappings.yml',
      version: 1,
      rules: { skipHiddenCollections: true, emptyFkNoEdge: true, derivesTitle: true },
      collections: [{ name: 'experts', fkLinkCount: 0 }],
      lastRun: { finishedAt: '2026-09-15T03:00:00.000Z', ruleHits: {}, collections: [] },
    },
  },
}

/** Mount over a mutable store the test updates between renders. */
function renderLive(state: KgClientState) {
  const store = createSnapshotStore<KgClientState>(state)
  const actions = {
    refresh: vi.fn(), ensureDefaultView: vi.fn(), walk: vi.fn(), expandNode: vi.fn(), searchSeeds: vi.fn(),
    loadPanel: vi.fn(), queryPhrase: vi.fn().mockRejectedValue(new Error('kg.query offline')),
    selectNode: vi.fn(), toggleTypeFilter: vi.fn(), clearTypeFilter: vi.fn(), loadFeed: vi.fn(),
    loadCommunities: vi.fn(), rollbackEpisode: vi.fn(), decideReview: vi.fn(), applyOntoEdit: vi.fn(),
    replayAt: vi.fn(), leaveReplay: vi.fn(), setColorMode: vi.fn(), requestView: vi.fn(),
  }
  const setDraft = vi.fn()
  const useKg = bindStoreHook(store) as never
  const element = (
    <KgView
      {...SESSION_KIT}
      inputActions={{ setDraft } as never}
      useKg={useKg}
      {...actions}
      t={t}
    />
  )
  const { rerender } = render(element)
  return {
    ...actions,
    setDraft,
    store,
    rerender: (): void => { rerender(element) },
  }
}

describe('KgView modes (graph / onto / feed)', () => {
  it('opening the feed tab loads the ledger once and returns to the graph tab', () => {
    const { loadFeed } = mount({
      legend: LEGEND_READY, canvas: undefined, search: undefined, panel: undefined, selected: undefined,
      typeFilter: undefined, episodes: undefined, review: undefined, communities: undefined,
      history: undefined, colorMode: 'semantic',
    })
    fireEvent.click(screen.getByRole('tab', { name: zh['mode.feed'] }))
    expect(loadFeed).toHaveBeenCalledTimes(1)
    expect(screen.getByText(zh['feed.empty'])).toBeTruthy()
    expect(screen.getByText(zh['feed.title'])).toBeTruthy()
    fireEvent.click(screen.getByRole('tab', { name: zh['mode.graph'] }))
    expect(screen.getByLabelText(zh['phrase.action'])).toBeTruthy()
  })

  it('a failed ledger load surfaces the feed refusal inline', () => {
    mount({
      legend: LEGEND_READY, canvas: undefined, search: undefined, panel: undefined, selected: undefined,
      typeFilter: undefined, episodes: { status: 'error', error: 'feed-down' }, review: undefined,
      communities: undefined, history: undefined, colorMode: 'semantic',
    })
    fireEvent.click(screen.getByRole('tab', { name: zh['mode.feed'] }))
    expect(screen.getByText(/feed-down/u)).toBeTruthy()
  })

  it('the color-mode switch drives the setColorMode action', () => {
    const { setColorMode } = mount({
      legend: LEGEND_READY, canvas: CANVAS_READY, search: undefined, panel: undefined, selected: undefined,
      typeFilter: undefined, episodes: undefined, review: undefined, communities: undefined,
      history: undefined, colorMode: 'semantic',
    })
    fireEvent.click(screen.getByRole('button', { name: zh['color.type'] }))
    expect(setColorMode).toHaveBeenCalledWith('type')
    fireEvent.click(screen.getByRole('button', { name: zh['color.community'] }))
    expect(setColorMode).toHaveBeenCalledWith('community')
  })

  it('the feed renders its episodes and hands the replay instant back to the graph mode', () => {
    const { replayAt, expandNode } = mount({
      legend: LEGEND_READY, canvas: CANVAS_READY, search: undefined, panel: undefined, selected: undefined,
      typeFilter: undefined, episodes: EPISODES_READY, review: { status: 'ready', value: { entries: [], sourceEpisode: 'ingest:1' } },
      communities: undefined, history: undefined, colorMode: 'semantic',
    })
    fireEvent.click(screen.getByRole('tab', { name: zh['mode.feed'] }))
    expect(screen.getByText('跨源共指对齐')).toBeTruthy()
    fireEvent.click(screen.getByText(zh['feed.replay']))
    expect(replayAt).toHaveBeenCalledWith('2026-09-18T01:00:00.000Z')
    // The graph toolbar returns with the mode switch.
    expect(screen.getByLabelText(zh['phrase.action'])).toBeTruthy()
    expect(expandNode).not.toHaveBeenCalled()
  })

  it('the onto tab renders the tree, lands an edit through the KGCL callback, and reloads the legend', async () => {
    const { applyOntoEdit, refresh } = mount({
      legend: LEGEND_READY, canvas: undefined, search: undefined, panel: undefined, selected: undefined,
      typeFilter: undefined, episodes: undefined, review: undefined, communities: undefined,
      history: undefined, colorMode: 'semantic',
    })
    vi.mocked(applyOntoEdit).mockResolvedValue({ applied: ['新增类 frozenTofu'], revision_id: 9, episode_uuid: 'human-edit:3' })
    fireEvent.click(screen.getByRole('tab', { name: zh['mode.onto'] }))
    expect(screen.getByText(zh['onto.hint'])).toBeTruthy()
    fireEvent.click(screen.getAllByText('＋子类')[0] as HTMLElement)
    fireEvent.change(screen.getByPlaceholderText('类 id（字母开头）'), { target: { value: 'frozenTofu' } })
    fireEvent.change(screen.getByPlaceholderText('显示名'), { target: { value: '冻豆腐' } })
    fireEvent.click(screen.getByText('应用'))
    await waitFor(() => {
      expect(applyOntoEdit).toHaveBeenCalledWith([{ op: 'add_node', target_id: 'frozenTofu', label: '冻豆腐', parent_id: 'Order' }])
      expect(refresh).toHaveBeenCalled()
    })
  })

  it('the onto tab shows the loading placeholder before the first legend arrives', () => {
    mount({
      legend: undefined, canvas: undefined, search: undefined, panel: undefined, selected: undefined,
      typeFilter: undefined, episodes: undefined, review: undefined, communities: undefined,
      history: undefined, colorMode: 'semantic',
    })
    fireEvent.click(screen.getByRole('tab', { name: zh['mode.onto'] }))
    expect(screen.getByText(zh['legend.loading'])).toBeTruthy()
  })

  it('the onto tree keeps the last known registry while a refresh flips the legend to loading', () => {
    const view = renderLive({
      legend: LEGEND_READY, canvas: undefined, search: undefined, panel: undefined, selected: undefined,
      typeFilter: undefined, episodes: undefined, review: undefined, communities: undefined,
      history: undefined, colorMode: 'semantic',
    })
    fireEvent.click(screen.getByRole('tab', { name: zh['mode.onto'] }))
    expect(screen.getByText(zh['onto.hint'])).toBeTruthy()
    view.store.set({ ...view.store.getSnapshot(), legend: { status: 'loading' } })
    view.rerender()
    // The known registry stays rendered instead of blinking away.
    expect(screen.getByText(zh['onto.hint'])).toBeTruthy()
    expect(screen.getByText('客户')).toBeTruthy()
  })

  it('selecting the community coloring loads the louvain partition once', () => {
    const { loadCommunities } = mount({
      legend: LEGEND_READY, canvas: CANVAS_READY, search: undefined, panel: undefined, selected: undefined,
      typeFilter: undefined, episodes: undefined, review: undefined, communities: undefined,
      history: undefined, colorMode: 'community',
    })
    expect(loadCommunities).toHaveBeenCalledTimes(1)
  })

  it('hashes legend dots per type when the type coloring is active (extends families diverge)', () => {
    const legendWithExtends: KgClientState['legend'] = {
      status: 'ready',
      value: {
        types: [
          { id: 'Customer', label: '客户', layer: 'domain', prop_keys: [], source: 'builtin-food', status: 'active' },
          { id: 'RetailCustomer', label: '零售客户', layer: 'domain', extends: 'Customer', prop_keys: [], source: 'builtin-food', status: 'active' },
        ],
        relations: [],
        revisions: [],
      },
    }
    mount({
      legend: legendWithExtends, canvas: undefined, search: undefined, panel: undefined, selected: undefined,
      typeFilter: undefined, episodes: undefined, review: undefined, communities: undefined,
      history: undefined, colorMode: 'type',
    })
    const dot = screen.getByText('零售客户').closest('button')?.querySelector('span')
    // The per-type hash ignores the extends chain; the semantic mode would
    // collapse this family onto the root's color.
    expect(nodeColorOf('Customer')).not.toBe(nodeColorOf('RetailCustomer'))
    expect(dot?.style.background).toBe(nodeColorOf('RetailCustomer'))
  })
})

describe('KgView graph-mode tails', () => {
  it('non-Enter keys never submit the phrase box', () => {
    const { queryPhrase } = mount({
      legend: LEGEND_READY, canvas: undefined, search: undefined, panel: undefined, selected: undefined,
      typeFilter: undefined, episodes: undefined, review: undefined, communities: undefined,
      history: undefined, colorMode: 'semantic',
    })
    const phraseBox = screen.getByLabelText(zh['phrase.action']) as HTMLInputElement
    fireEvent.change(phraseBox, { target: { value: '宏发食品的订单' } })
    fireEvent.keyDown(phraseBox, { key: 'Tab' })
    fireEvent.keyDown(phraseBox, { key: 'Escape' })
    expect(queryPhrase).not.toHaveBeenCalled()
  })

  it('the details handoff drafts the English variant when the locale is not Chinese', () => {
    const store = createSnapshotStore<KgClientState>({
      legend: LEGEND_READY,
      canvas: CANVAS_READY,
      search: undefined, panel: undefined, selected: NODE_A.id, typeFilter: undefined,
      episodes: undefined, review: undefined, communities: undefined, history: undefined, colorMode: 'semantic',
    })
    // Any non-Chinese dictionary picks the hardcoded English handoff text.
    const asKey = ((key: string) => key) as never
    const setDraft = vi.fn()
    render(
      <KgView
        {...SESSION_KIT}
        inputActions={{ setDraft } as never}
        useKg={bindStoreHook(store) as never}
        refresh={vi.fn()} ensureDefaultView={vi.fn()} walk={vi.fn()} expandNode={vi.fn()} searchSeeds={vi.fn()}
        loadPanel={vi.fn()} queryPhrase={vi.fn().mockRejectedValue(new Error('offline'))} selectNode={vi.fn()}
        toggleTypeFilter={vi.fn()} clearTypeFilter={vi.fn()} loadFeed={vi.fn()} loadCommunities={vi.fn()}
        rollbackEpisode={vi.fn()} decideReview={vi.fn()} applyOntoEdit={vi.fn()} replayAt={vi.fn()}
        leaveReplay={vi.fn()} setColorMode={vi.fn()} requestView={vi.fn()} t={asKey}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'details.ask' }))
    expect(setDraft).toHaveBeenCalledWith('What is related to 宏发食品 in the graph?')
  })

  it('the details row falls back to the raw type id outside a ready legend', () => {
    mount({
      legend: { status: 'loading' }, canvas: CANVAS_READY, search: undefined, panel: undefined,
      selected: NODE_C.id, typeFilter: undefined, episodes: undefined, review: undefined,
      communities: undefined, history: undefined, colorMode: 'semantic',
    })
    // No legend row renders; the details row names Concept by its id.
    expect(screen.getAllByText('Concept').length).toBeGreaterThan(0)
  })

  it('a blank phrase never reaches the query and Enter submits the typed one', () => {
    const { queryPhrase } = mount({
      legend: LEGEND_READY, canvas: undefined, search: undefined, panel: undefined, selected: undefined,
      typeFilter: undefined, episodes: undefined, review: undefined, communities: undefined,
      history: undefined, colorMode: 'semantic',
    })
    const phraseBox = screen.getByLabelText(zh['phrase.action']) as HTMLInputElement
    fireEvent.change(phraseBox, { target: { value: '   ' } })
    fireEvent.click(screen.getByRole('button', { name: zh['phrase.action'] }))
    expect(queryPhrase).not.toHaveBeenCalled()
    fireEvent.change(phraseBox, { target: { value: '宏发食品的订单' } })
    fireEvent.keyDown(phraseBox, { key: 'Enter' })
    expect(queryPhrase).toHaveBeenCalledWith('宏发食品的订单')
  })

  it('typing whitespace alone never queries seeds, and a hit starts its own walk', () => {
    const { searchSeeds, walk } = mount({
      legend: LEGEND_READY, canvas: undefined,
      search: { status: 'ready', value: [{ id: 'nocobase:customers:1', type: 'Customer', name: '宏发食品' }] },
      panel: undefined, selected: undefined, typeFilter: undefined, episodes: undefined, review: undefined,
      communities: undefined, history: undefined, colorMode: 'semantic',
    })
    const searchBox = screen.getByLabelText(zh['search.action']) as HTMLInputElement
    fireEvent.change(searchBox, { target: { value: '  ' } })
    expect(searchSeeds).not.toHaveBeenCalled()
    // The rendered hit both adopts the query and walks its one-hop neighborhood.
    fireEvent.click(screen.getByRole('button', { name: '宏发食品' }))
    expect(walk).toHaveBeenCalledWith(['宏发食品'], 1)
    expect(searchBox.value).toBe('宏发食品')
  })

  it('a ready search with no hits renders the no-hits hint', () => {
    mount({
      legend: LEGEND_READY, canvas: undefined,
      search: { status: 'ready', value: [] },
      panel: undefined, selected: undefined, typeFilter: undefined, episodes: undefined, review: undefined,
      communities: undefined, history: undefined, colorMode: 'semantic',
    })
    fireEvent.change(screen.getByLabelText(zh['search.action']), { target: { value: '查无此物' } })
    expect(screen.getByText(zh['search.noHits'])).toBeTruthy()
  })

  it('shows the history refusal with a back-to-live control', () => {
    const { leaveReplay } = mount({
      legend: LEGEND_READY, canvas: CANVAS_READY, search: undefined, panel: undefined, selected: undefined,
      typeFilter: undefined, episodes: undefined, review: undefined, communities: undefined,
      history: { status: 'error', error: 'history-down' }, colorMode: 'semantic',
    })
    expect(screen.getByText(/history-down/u)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: zh['replay.back'] }))
    expect(leaveReplay).toHaveBeenCalled()
  })

  it('replays the frozen snapshot read-only, truncation noted, expansion dead', async () => {
    const { expandNode, selectNode } = mount({
      legend: LEGEND_READY, canvas: CANVAS_READY, search: undefined, panel: undefined, selected: undefined,
      typeFilter: undefined, episodes: undefined, review: undefined, communities: undefined,
      history: HISTORY_READY, colorMode: 'semantic',
    })
    expect(screen.getByText(/历史快照 · 2026-09-18 02:00:00/u)).toBeTruthy()
    expect(screen.getByText(zh['canvas.truncated'])).toBeTruthy()
    // jsdom degrades the replay canvas to the list; it renders the frozen
    // snapshot's nodes, not the live walk's.
    await waitFor(() => { expect(screen.getByTestId('kg-canvas-list')).toBeTruthy() })
    expect(screen.getByText('历史快照节点')).toBeTruthy()
    fireEvent.doubleClick(screen.getByText('历史快照节点').closest('li') as HTMLElement)
    expect(expandNode).not.toHaveBeenCalled()
    expect(selectNode).not.toHaveBeenCalled()
  })

  it('renders the replay-loading skeleton instead of the empty-state guide', () => {
    mount({
      legend: LEGEND_READY, canvas: undefined, search: undefined, panel: undefined, selected: undefined,
      typeFilter: undefined, episodes: undefined, review: undefined, communities: undefined,
      history: { status: 'loading' }, colorMode: 'semantic',
    })
    expect(screen.queryByText(zh['canvas.emptyTitle'])).toBeNull()
  })

  it('surfaces a failed walk with an inline retry', () => {
    const { refresh } = mount({
      legend: LEGEND_READY, canvas: { status: 'error', error: 'canvas-down' }, search: undefined,
      panel: undefined, selected: undefined, typeFilter: undefined, episodes: undefined, review: undefined,
      communities: undefined, history: undefined, colorMode: 'semantic',
    })
    expect(screen.getByText(/canvas-down/u)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: zh['error.retry'] }))
    expect(refresh).toHaveBeenCalled()
  })

  it('notes a truncated walk and double-click expands through the degraded list', async () => {
    const { expandNode } = mount({
      legend: LEGEND_READY,
      canvas: { status: 'ready', value: { nodes: [NODE_A], edges: [], truncated: true, seeds: [NODE_A.id] } },
      search: undefined, panel: undefined, selected: undefined, typeFilter: undefined,
      episodes: undefined, review: undefined, communities: undefined, history: undefined, colorMode: 'semantic',
    })
    expect(screen.getByText(zh['canvas.truncated'])).toBeTruthy()
    await waitFor(() => { expect(screen.getByTestId('kg-canvas-list')).toBeTruthy() })
    fireEvent.doubleClick(screen.getByText(NODE_A.name).closest('li') as HTMLElement)
    expect(expandNode).toHaveBeenCalledWith(NODE_A.id)
  })

  it('legend rows toggle their type from both groups (ontology and business-derived)', () => {
    const { toggleTypeFilter } = mount({
      legend: LEGEND_READY, canvas: CANVAS_READY, search: undefined, panel: undefined, selected: undefined,
      typeFilter: undefined, episodes: undefined, review: undefined, communities: undefined,
      history: undefined, colorMode: 'semantic',
    })
    fireEvent.click(screen.getByText('客户').closest('button') as HTMLElement)
    expect(toggleTypeFilter).toHaveBeenCalledWith('Customer')
    fireEvent.click(screen.getByText('订单').closest('button') as HTMLElement)
    expect(toggleTypeFilter).toHaveBeenCalledWith('Order')
  })

  it('the quality panel reports its refusal and a mapping scope without a run stays pending', () => {
    mount({
      legend: LEGEND_READY, canvas: undefined, search: undefined,
      panel: { status: 'error', error: 'stats-down' }, selected: undefined, typeFilter: undefined,
      episodes: undefined, review: undefined, communities: undefined, history: undefined, colorMode: 'semantic',
    })
    expect(screen.getAllByText(zh['error.unavailable']).length).toBeGreaterThan(0)

    mount({
      legend: LEGEND_READY, canvas: undefined, search: undefined,
      panel: PANEL_READY_MAPPINGS_PENDING, selected: undefined, typeFilter: undefined,
      episodes: undefined, review: undefined, communities: undefined, history: undefined, colorMode: 'semantic',
    })
    const mappingList = screen.getByTestId('kg-mapping-list')
    expect(mappingList.textContent).toContain('experts')
    expect(mappingList.textContent).toContain(zh['quality.mappingPending'])
  })

  it('the details panel asks the conversation about the entity and shows the natural key', () => {
    const { setDraft, requestView } = mount({
      legend: LEGEND_READY,
      canvas: {
        status: 'ready',
        value: {
          nodes: [{ ...NODE_A, natural_key: 'CUST-0001' }, NODE_B],
          edges: [{ id: 'e1', relation: 'placed_by', source: NODE_A.id, target: NODE_B.id, asserted_by: 'nocobase' }],
          truncated: false,
          seeds: [NODE_A.id],
        },
      },
      search: undefined, panel: undefined, selected: NODE_A.id, typeFilter: undefined,
      episodes: undefined, review: undefined, communities: undefined, history: undefined, colorMode: 'semantic',
    })
    expect(screen.getByText('CUST-0001')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: zh['details.ask'] }))
    expect(setDraft).toHaveBeenCalledWith('在图谱里，宏发食品 有哪些关联？')
    expect(requestView).toHaveBeenCalledWith('chat')
  })

  it('the details card expands the node and prints the raw type id outside the legend', async () => {
    const { expandNode } = mount({
      legend: LEGEND_READY,
      canvas: CANVAS_READY,
      search: undefined, panel: undefined, selected: NODE_C.id, typeFilter: undefined,
      episodes: undefined, review: undefined, communities: undefined, history: undefined, colorMode: 'semantic',
    })
    await waitFor(() => { expect(screen.getByTestId('kg-canvas-list')).toBeTruthy() })
    // 'Concept' sits outside the legend's registry, so the type row keeps the id.
    expect(screen.getByText('Concept')).toBeTruthy()
    // The degraded list's row buttons render first; the details card's is last.
    const expandButtons = screen.getAllByRole('button', { name: zh['details.expand'] })
    fireEvent.click(expandButtons[expandButtons.length - 1]!)
    expect(expandNode).toHaveBeenCalledWith(NODE_C.id)
  })
})

describe('KgEntry', () => {
  it('renders the legend badge and switches views on click when a session exists', () => {
    const store = createSnapshotStore<KgClientState>({
      legend: LEGEND_READY, canvas: undefined, search: undefined, panel: undefined, selected: undefined, typeFilter: undefined,
      episodes: undefined, review: undefined, communities: undefined, history: undefined, colorMode: 'semantic',
    })
    const sessions = createSnapshotStore(sessionListState({ id: 's1', blank: false }))
    const refresh = vi.fn()
    const requestKgView = vi.fn()
    render(
      <KgEntry
        {...GLOBAL_KIT}
        wide
        useSessions={bindStoreHook(sessions) as never}
        useKg={bindStoreHook(store) as never}
        refresh={refresh}
        requestKgView={requestKgView}
        t={t}
      />,
    )
    // A ready legend means no reload on mount (the component's guard).
    expect(refresh).not.toHaveBeenCalled()
    expect(screen.getByText(zh['entry.label'])).toBeTruthy()
    expect(screen.getByText('2')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: zh['entry.entitiesBadge'] }))
    expect(requestKgView).toHaveBeenCalled()
  })
})
