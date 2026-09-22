// @vitest-environment jsdom
// The canvas renderer stack under mocked dynamic imports: the graphology
// fill + FA2 layout + Sigma construction, the click/double-click wiring, the
// drag gesture (threshold + click suppression), the zoom bounds and control
// camera calls, the ResizeObserver lifecycle, the selection highlight
// reducer, and the camera hand-off across renderer rebuilds, the KgView
// coloring closures feeding the live canvas (community partition), plus the
// sidebar entry's cold-start and no-session/error-badge branches (the jsdom
// degraded-list path lives in kgview.client.spec.tsx).

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-runtime/client'
import { KgGraphCanvas } from '../src/client/KgGraphCanvas.tsx'
import { KgEntry } from '../src/client/KgEntry.tsx'
import { KgView } from '../src/client/KgView.tsx'
import type { KgClientState } from '../src/client/kgStore.ts'
import { communityColorOf } from '../src/client/presentation.ts'
import { zh } from '../src/client/locales.ts'
import { bindStoreHook, GLOBAL_KIT, SESSION_KIT, sessionListState } from './kg-fixture.client.ts'

const t = ((key: string, params?: Record<string, string | number>) => {
  const template = zh[key as keyof typeof zh]
  if (template === undefined) return key
  return template.replaceAll(/\{(\w+)\}/g, (_, name: string) => String(params?.[name] ?? ''))
}) as never

/** One recorded sigma event handler (the payloads the gestures feed). */
type MockHandler = (payload: { node?: string; event?: { x: number; y: number; preventSigmaDefault: () => void } }) => void

/** The scripted camera each mock sigma hands out. */
interface MockCamera {
  state: { x: number; y: number; angle: number; ratio: number }
  setState: (patch: Record<string, number>) => void
  getState: () => { x: number; y: number; angle: number; ratio: number }
  animatedZoom: ReturnType<typeof vi.fn>
  animatedUnzoom: ReturnType<typeof vi.fn>
  animatedReset: ReturnType<typeof vi.fn>
}

/** The scripted sigma instances the mock hands out. */
const sigmaInstances: Array<{
  killed: boolean
  handlers: Map<string, MockHandler>
  settings: Record<string, unknown>
  camera: MockCamera
  resizeCount: number
  refreshCount: number
}> = []

/** One fake graphology graph recording its nodes. */
const graphs: Array<{ nodes: Array<[string, Record<string, unknown>]>; edges: Array<[string, string]> }> = []

/** Node coordinate writes the drag gesture lands on the fake graphs. */
const setNodeAttributeCalls: Array<[string, string, number]> = []

/** The ResizeObserver stub's live instances (lifecycle assertions). */
const observerStubs: Array<{ observed: Array<Element>; disconnected: boolean; fire: () => void }> = []

vi.mock('sigma', () => ({
  default: class MockSigma {
    killed = false
    handlers = new Map<string, MockHandler>()
    cameraState = { x: 0, y: 0, angle: 0, ratio: 1 }
    camera: MockCamera = {
      state: this.cameraState,
      setState: (patch: Record<string, number>) => { Object.assign(this.cameraState, patch) },
      getState: () => ({ ...this.cameraState }),
      animatedZoom: vi.fn(),
      animatedUnzoom: vi.fn(),
      animatedReset: vi.fn(),
    }
    resizeCount = 0
    refreshCount = 0
    constructor(
      public graph: unknown,
      public container: HTMLElement,
      public settings: Record<string, unknown>,
    ) {
      sigmaInstances.push({
        killed: false,
        handlers: this.handlers,
        settings: this.settings,
        camera: this.camera,
        resizeCount: 0,
        refreshCount: 0,
      })
      void this.graph
      void this.container
    }
    on(event: string, handler: MockHandler): void {
      this.handlers.set(event, handler)
    }
    getCamera(): MockCamera { return this.camera }
    resize(): void {
      this.resizeCount += 1
      const tracked = sigmaInstances.find(instance => instance.handlers === this.handlers)
      if (tracked !== undefined) tracked.resizeCount = this.resizeCount
    }
    refresh(): void {
      this.refreshCount += 1
      const tracked = sigmaInstances.find(instance => instance.handlers === this.handlers)
      if (tracked !== undefined) tracked.refreshCount = this.refreshCount
    }
    viewportToGraph(point: { x: number; y: number }): { x: number; y: number } {
      return { x: point.x * 2, y: point.y * 2 }
    }
    kill(): void {
      this.killed = true
      const tracked = sigmaInstances.find(instance => instance.handlers === this.handlers)
      if (tracked !== undefined) tracked.killed = true
    }
  },
}))

vi.mock('graphology', () => ({
  default: class MockGraph {
    nodes: Array<[string, Record<string, unknown>]> = []
    edges: Array<[string, string]> = []
    order = 0
    constructor(public options: Record<string, unknown>) {
      graphs.push(this)
      void this.options
    }
    addNode(id: string, attrs: Record<string, unknown>): void {
      this.nodes.push([id, attrs])
      this.order += 1
    }
    addEdge(src: string, dst: string, attrs: Record<string, unknown>): void {
      this.edges.push([src, dst])
      void attrs
    }
    setNodeAttribute(node: string, key: string, value: number): void {
      setNodeAttributeCalls.push([node, key, value])
    }
  },
}))

vi.mock('graphology-layout-forceatlas2', () => ({
  default: { assign: vi.fn() },
}))

const NODES = [
  { id: 'n1', type: 'Customer', name: '宏发食品', depth: 0 },
  { id: 'n2', type: 'Order', name: 'SO-1', depth: 1 },
]
const EDGES = [
  { id: 'e1', relation: 'placed_by', source: 'n1', target: 'n2', asserted_by: 'nocobase' as const },
]

/** jsdom ships no ResizeObserver; the component's own observer rides this stub. */
class ResizeObserverStub {
  constructor(callback: () => void) {
    observerStubs.push({ observed: [], disconnected: false, fire: callback })
  }
  observe(target: Element): void { observerStubs[observerStubs.length - 1]!.observed.push(target) }
  disconnect(): void { observerStubs[observerStubs.length - 1]!.disconnected = true }
  unobserve(): void {}
}

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', ResizeObserverStub)
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  sigmaInstances.length = 0
  graphs.length = 0
  observerStubs.length = 0
  setNodeAttributeCalls.length = 0
})

describe('KgGraphCanvas renderer stack (mocked sigma)', () => {
  it('builds the graph, runs the layout, and constructs sigma with the zoom-bound settings', async () => {
    const onSelect = vi.fn()
    const onExpand = vi.fn()
    render(
      <KgGraphCanvas
        nodes={NODES}
        edges={EDGES}
        typeFilter={undefined}
        selected={undefined}
        onSelect={onSelect}
        onExpand={onExpand}
        t={t}
      />,
    )
    await waitFor(() => { expect(sigmaInstances.length).toBe(1) })
    expect(graphs[0]?.nodes.map(([id]) => id)).toEqual(['n1', 'n2'])
    expect(graphs[0]?.edges).toEqual([['n1', 'n2']])
    // The double-click zoom gives way to node expansion (ratio 1 = no zoom),
    // and the wheel zoom is bounded on both ends.
    expect(sigmaInstances[0]!.settings.doubleClickZoomingRatio).toBe(1)
    expect(sigmaInstances[0]!.settings.minCameraRatio).toBe(0.05)
    expect(sigmaInstances[0]!.settings.maxCameraRatio).toBe(15)
    expect(typeof sigmaInstances[0]!.settings.nodeReducer).toBe('function')
  })

  it('wires click → select and double-click → expand, and kills on unmount', async () => {
    const onSelect = vi.fn()
    const onExpand = vi.fn()
    const { unmount } = render(
      <KgGraphCanvas
        nodes={NODES}
        edges={EDGES}
        typeFilter={undefined}
        selected={undefined}
        onSelect={onSelect}
        onExpand={onExpand}
        t={t}
      />,
    )
    await waitFor(() => { expect(sigmaInstances.length).toBe(1) })
    const handlers = sigmaInstances[0]!.handlers
    handlers.get('clickNode')!({ node: 'n1' })
    expect(onSelect).toHaveBeenCalledWith('n1')
    handlers.get('doubleClickNode')!({ node: 'n2' })
    expect(onExpand).toHaveBeenCalledWith('n2')
    unmount()
    expect(sigmaInstances[0]!.killed).toBe(true)
  })

  it('observes the container through a ResizeObserver and disconnects on unmount', async () => {
    const { unmount } = render(
      <KgGraphCanvas
        nodes={NODES}
        edges={EDGES}
        typeFilter={undefined}
        selected={undefined}
        onSelect={vi.fn()}
        onExpand={vi.fn()}
        t={t}
      />,
    )
    await waitFor(() => { expect(sigmaInstances.length).toBe(1) })
    expect(observerStubs.length).toBe(1)
    expect(observerStubs[0]!.observed[0]).toBeInstanceOf(HTMLElement)
    unmount()
    expect(observerStubs[0]!.disconnected).toBe(true)
  })

  it('resizes sigma when the observer fires (container resize, not window)', async () => {
    render(
      <KgGraphCanvas
        nodes={NODES}
        edges={EDGES}
        typeFilter={undefined}
        selected={undefined}
        onSelect={vi.fn()}
        onExpand={vi.fn()}
        t={t}
      />,
    )
    await waitFor(() => { expect(sigmaInstances.length).toBe(1) })
    expect(observerStubs.length).toBe(1)
    expect(sigmaInstances[0]!.resizeCount).toBe(0)
    observerStubs[0]!.fire()
    expect(sigmaInstances[0]!.resizeCount).toBe(1)
  })

  it('highlights the selected node and its neighbors through the nodeReducer', async () => {
    const { rerender } = render(
      <KgGraphCanvas
        nodes={NODES}
        edges={EDGES}
        typeFilter={undefined}
        selected={undefined}
        onSelect={vi.fn()}
        onExpand={vi.fn()}
        t={t}
      />,
    )
    await waitFor(() => { expect(sigmaInstances.length).toBe(1) })
    const reducer = sigmaInstances[0]!.settings.nodeReducer as (
      node: string,
      data: Record<string, unknown>,
    ) => Record<string, unknown>
    // No selection: the reducer is a pass-through.
    expect(reducer('n1', { size: 8 })).toEqual({ size: 8 })
    rerender(
      <KgGraphCanvas
        nodes={NODES}
        edges={EDGES}
        typeFilter={undefined}
        selected="n1"
        onSelect={vi.fn()}
        onExpand={vi.fn()}
        t={t}
      />,
    )
    expect(reducer('n1', { size: 8 })).toEqual({ size: 8, highlighted: true, forceLabel: true })
    expect(reducer('n2', { size: 8 })).toEqual({ size: 8, highlighted: true })
    expect(reducer('n3', { size: 8 })).toEqual({ size: 8 })
    // Selecting the edge's target walks the else-if arm: its source glows too.
    rerender(
      <KgGraphCanvas
        nodes={NODES}
        edges={EDGES}
        typeFilter={undefined}
        selected="n2"
        onSelect={vi.fn()}
        onExpand={vi.fn()}
        t={t}
      />,
    )
    expect(reducer('n2', { size: 8 })).toEqual({ size: 8, highlighted: true, forceLabel: true })
    expect(reducer('n1', { size: 8 })).toEqual({ size: 8, highlighted: true })
  })

  it('ignores moveBody events that arrive without a pressed node', async () => {
    render(
      <KgGraphCanvas
        nodes={NODES}
        edges={EDGES}
        typeFilter={undefined}
        selected={undefined}
        onSelect={vi.fn()}
        onExpand={vi.fn()}
        t={t}
      />,
    )
    await waitFor(() => { expect(sigmaInstances.length).toBe(1) })
    sigmaInstances[0]!.handlers.get('moveBody')!({ event: { x: 40, y: 40, preventSigmaDefault: vi.fn() } })
    expect(setNodeAttributeCalls).toEqual([])
  })

  it('colors graph nodes by their louvain community assignment through the view closure', async () => {
    const store = createSnapshotStore<KgClientState>({
      legend: {
        status: 'ready',
        value: {
          types: [{ id: 'Customer', label: '客户', layer: 'domain', prop_keys: [], source: 'builtin-food', status: 'active' }],
          relations: [],
          revisions: [],
        },
      },
      canvas: {
        status: 'ready',
        value: {
          nodes: [
            { id: 'n1', type: 'Customer', name: '宏发食品', depth: 0 },
            { id: 'n2', type: 'Order', name: 'SO-1', depth: 1 },
          ],
          edges: [{ id: 'e1', relation: 'placed_by', source: 'n1', target: 'n2', asserted_by: 'nocobase' }],
          truncated: false,
          seeds: ['n1'],
        },
      },
      communities: {
        status: 'ready',
        value: { communities: [{ id: 3, nodes: ['n1'] }], modularity: 0.5, node_count: 2 },
      },
      search: undefined, panel: undefined, selected: undefined, typeFilter: undefined,
      episodes: undefined, review: undefined, history: undefined, colorMode: 'community',
    })
    render(
      <KgView
        {...SESSION_KIT}
        inputActions={{ setDraft: vi.fn() } as never}
        useKg={bindStoreHook(store) as never}
        refresh={vi.fn()} ensureDefaultView={vi.fn()} walk={vi.fn()} expandNode={vi.fn()} searchSeeds={vi.fn()}
        loadPanel={vi.fn()} queryPhrase={vi.fn().mockRejectedValue(new Error('offline'))} selectNode={vi.fn()}
        toggleTypeFilter={vi.fn()} clearTypeFilter={vi.fn()} loadFeed={vi.fn()} loadCommunities={vi.fn()}
        rollbackEpisode={vi.fn()} decideReview={vi.fn()} applyOntoEdit={vi.fn()} replayAt={vi.fn()}
        leaveReplay={vi.fn()} setColorMode={vi.fn()} requestView={vi.fn()} t={t}
      />,
    )
    await waitFor(() => { expect(sigmaInstances.length).toBe(1) })
    const colors = new Map(graphs[0]?.nodes.map(([id, attrs]) => [id, attrs.color as string]))
    // Assigned nodes carry their community's ladder color; unassigned ones
    // fall back to community 0.
    expect(colors.get('n1')).toBe(communityColorOf(3))
    expect(colors.get('n2')).toBe(communityColorOf(0))
  })

  it('carries camera state across renderer rebuilds', async () => {
    const onSelect = vi.fn()
    const onExpand = vi.fn()
    const { rerender } = render(
      <KgGraphCanvas
        nodes={NODES}
        edges={EDGES}
        typeFilter={undefined}
        selected={undefined}
        onSelect={onSelect}
        onExpand={onExpand}
        t={t}
      />,
    )
    await waitFor(() => { expect(sigmaInstances.length).toBe(1) })
    // The user zooms and pans; the walk data then changes (filter/expansion).
    sigmaInstances[0]!.camera.state.ratio = 3
    sigmaInstances[0]!.camera.state.x = 12
    const nextNodes = [...NODES, { id: 'n3', type: 'Product', name: '酱油', depth: 1 }]
    rerender(
      <KgGraphCanvas
        nodes={nextNodes}
        edges={EDGES}
        typeFilter={undefined}
        selected={undefined}
        onSelect={onSelect}
        onExpand={onExpand}
        t={t}
      />,
    )
    await waitFor(() => { expect(sigmaInstances.length).toBe(2) })
    expect(sigmaInstances[0]!.killed).toBe(true)
    expect(sigmaInstances[1]!.camera.state.ratio).toBe(3)
    expect(sigmaInstances[1]!.camera.state.x).toBe(12)
  })

  it('drags nodes past the threshold and suppresses the trailing click', async () => {
    const onSelect = vi.fn()
    const onExpand = vi.fn()
    render(
      <KgGraphCanvas
        nodes={NODES}
        edges={EDGES}
        typeFilter={undefined}
        selected={undefined}
        onSelect={onSelect}
        onExpand={onExpand}
        t={t}
      />,
    )
    await waitFor(() => { expect(sigmaInstances.length).toBe(1) })
    const handlers = sigmaInstances[0]!.handlers
    handlers.get('downNode')!({ node: 'n1', event: { x: 10, y: 10, preventSigmaDefault: vi.fn() } })
    // Sub-threshold moves do not move the node yet.
    handlers.get('moveBody')!({ event: { x: 12, y: 11, preventSigmaDefault: vi.fn() } })
    expect(setNodeAttributeCalls).toEqual([])
    // Past 4px the node follows the cursor in graph coordinates.
    handlers.get('moveBody')!({ event: { x: 40, y: 10, preventSigmaDefault: vi.fn() } })
    expect(setNodeAttributeCalls).toEqual([['n1', 'x', 80], ['n1', 'y', 20]])
    expect(sigmaInstances[0]!.refreshCount).toBeGreaterThan(0)
    handlers.get('upStage')!({})
    handlers.get('clickNode')!({ node: 'n1' })
    expect(onSelect).not.toHaveBeenCalled()
  })

  it('keeps sub-threshold presses clickable', async () => {
    const onSelect = vi.fn()
    const onExpand = vi.fn()
    render(
      <KgGraphCanvas
        nodes={NODES}
        edges={EDGES}
        typeFilter={undefined}
        selected={undefined}
        onSelect={onSelect}
        onExpand={onExpand}
        t={t}
      />,
    )
    await waitFor(() => { expect(sigmaInstances.length).toBe(1) })
    const handlers = sigmaInstances[0]!.handlers
    handlers.get('downNode')!({ node: 'n1', event: { x: 10, y: 10, preventSigmaDefault: vi.fn() } })
    handlers.get('moveBody')!({ event: { x: 11, y: 10, preventSigmaDefault: vi.fn() } })
    handlers.get('upStage')!({})
    handlers.get('clickNode')!({ node: 'n1' })
    expect(onSelect).toHaveBeenCalledWith('n1')
  })

  it('drives the camera from the zoom controls', async () => {
    const onSelect = vi.fn()
    const onExpand = vi.fn()
    render(
      <KgGraphCanvas
        nodes={NODES}
        edges={EDGES}
        typeFilter={undefined}
        selected={undefined}
        onSelect={onSelect}
        onExpand={onExpand}
        t={t}
      />,
    )
    await waitFor(() => { expect(sigmaInstances.length).toBe(1) })
    fireEvent.click(screen.getByRole('button', { name: zh['canvas.zoomIn'] }))
    expect(sigmaInstances[0]!.camera.animatedZoom).toHaveBeenCalledTimes(1)
    fireEvent.click(screen.getByRole('button', { name: zh['canvas.zoomOut'] }))
    expect(sigmaInstances[0]!.camera.animatedUnzoom).toHaveBeenCalledTimes(1)
    fireEvent.click(screen.getByRole('button', { name: zh['canvas.reset'] }))
    expect(sigmaInstances[0]!.camera.animatedReset).toHaveBeenCalledTimes(1)
  })

  it('renders the empty placeholder when the filter clears every node', () => {
    const { container } = render(
      <KgGraphCanvas
        nodes={NODES}
        edges={EDGES}
        typeFilter={new Set(['Nothing'])}
        selected={undefined}
        onSelect={vi.fn()}
        onExpand={vi.fn()}
        t={t}
      />,
    )
    expect(container.firstChild).not.toBeNull()
    expect(sigmaInstances.length).toBe(0)
  })
})

describe('KgEntry branch matrix', () => {
  it('pulls the legend on mount when the store starts cold', () => {
    const store = createSnapshotStore<KgClientState>({
      legend: undefined, canvas: undefined, search: undefined, panel: undefined, selected: undefined,
      typeFilter: undefined, episodes: undefined, review: undefined, communities: undefined,
      history: undefined, colorMode: 'semantic',
    })
    const sessions = createSnapshotStore(sessionListState({ id: 's1', blank: false }))
    const refresh = vi.fn()
    render(
      <KgEntry
        {...GLOBAL_KIT}
        wide
        useSessions={bindStoreHook(sessions) as never}
        useKg={bindStoreHook(store) as never}
        refresh={refresh}
        requestKgView={vi.fn()}
        t={t}
      />,
    )
    expect(refresh).toHaveBeenCalledTimes(1)
  })

  it('refreshes instead of switching when no session exists, and shows the error badge', () => {
    const store = createSnapshotStore<KgClientState>({
      legend: { status: 'error', error: 'kg-not-composed' },
      canvas: undefined, search: undefined, panel: undefined, selected: undefined, typeFilter: undefined,
      episodes: undefined, review: undefined, communities: undefined, history: undefined, colorMode: 'semantic',
    })
    const noSessions = createSnapshotStore({ ...sessionListState({ id: 's1', blank: false }), current: undefined })
    const refresh = vi.fn()
    const requestKgView = vi.fn()
    render(
      <KgEntry
        {...GLOBAL_KIT}
        wide={false}
        useSessions={bindStoreHook(noSessions) as never}
        useKg={bindStoreHook(store) as never}
        refresh={refresh}
        requestKgView={requestKgView}
        t={t}
      />,
    )
    // A failed legend keeps the ? badge; the click refreshes (no ring to switch).
    expect(screen.getByText('?')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: zh['entry.entitiesBadge'] }))
    expect(refresh).toHaveBeenCalled()
    expect(requestKgView).not.toHaveBeenCalled()
  })

  it('shows the loading placeholder badge while the legend is in flight', () => {
    const store = createSnapshotStore<KgClientState>({
      legend: { status: 'loading' },
      canvas: undefined, search: undefined, panel: undefined, selected: undefined, typeFilter: undefined,
      episodes: undefined, review: undefined, communities: undefined, history: undefined, colorMode: 'semantic',
    })
    const sessions = createSnapshotStore(sessionListState({ id: 's1', blank: false }))
    render(
      <KgEntry
        {...GLOBAL_KIT}
        wide
        useSessions={bindStoreHook(sessions) as never}
        useKg={bindStoreHook(store) as never}
        refresh={vi.fn()}
        requestKgView={vi.fn()}
        t={t}
      />,
    )
    expect(screen.queryByText('?')).toBeNull()
    expect(document.querySelector('button')?.textContent).toContain(zh['entry.label'])
  })

  it('type-checks against the session kit seat', () => {
    expect(SESSION_KIT.sessionId).toBe('s1')
  })
})
