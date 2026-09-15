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
  const restater = (kind: 'supply' | 'orders' | 'contains', entity: string): string => `${kind}:${entity}`

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
    })
    expect(ensureDefaultView).not.toHaveBeenCalled()
  })

  it('renders the canvas loading skeleton while a walk is in flight', () => {
    mount({
      legend: LEGEND_READY,
      canvas: { status: 'loading' },
      search: undefined, panel: undefined, selected: undefined, typeFilter: undefined,
    })
    expect(document.querySelector('[aria-hidden="true"]')).toBeTruthy()
  })

  it('shows the error strip with a retry on a failed legend load', () => {
    const { refresh } = mount({
      legend: { status: 'error', error: 'kg-not-composed' },
      canvas: undefined, search: undefined, panel: undefined, selected: undefined, typeFilter: undefined,
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
    })
    const walk = vi.fn()
    render(
      <KgView
        {...SESSION_KIT}
        inputActions={{ setDraft: vi.fn() } as never}
        useKg={bindStoreHook(store) as never}
        refresh={vi.fn()} ensureDefaultView={vi.fn()} walk={walk} expandNode={vi.fn()} searchSeeds={vi.fn()}
        loadPanel={vi.fn()} queryPhrase={queryPhrase} selectNode={vi.fn()} toggleTypeFilter={vi.fn()}
        clearTypeFilter={vi.fn()} requestView={vi.fn()} t={t}
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
    })
    render(
      <KgView
        {...SESSION_KIT}
        inputActions={{ setDraft: vi.fn() } as never}
        useKg={bindStoreHook(store) as never}
        refresh={vi.fn()} ensureDefaultView={vi.fn()} walk={vi.fn()} expandNode={vi.fn()} searchSeeds={vi.fn()}
        loadPanel={vi.fn()}
        queryPhrase={vi.fn().mockRejectedValue(new Error('kg.query: no template matches'))}
        selectNode={vi.fn()} toggleTypeFilter={vi.fn()} clearTypeFilter={vi.fn()} requestView={vi.fn()} t={t}
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
    })
    fireEvent.change(screen.getByLabelText(zh['search.action']), { target: { value: '宏发' } })
    expect(searchSeeds).toHaveBeenCalledWith('宏发')
  })

  it('renders the legend rows and clears the filter through the all-types row', () => {
    const { clearTypeFilter } = mount({
      legend: LEGEND_READY,
      canvas: CANVAS_READY,
      search: undefined, panel: undefined, selected: undefined, typeFilter: new Set(['Customer']),
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

describe('KgEntry', () => {
  it('renders the legend badge and switches views on click when a session exists', () => {
    const store = createSnapshotStore<KgClientState>({
      legend: LEGEND_READY, canvas: undefined, search: undefined, panel: undefined, selected: undefined, typeFilter: undefined,
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
