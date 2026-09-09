// @vitest-environment jsdom
// The canvas renderer stack under mocked dynamic imports: the graphology
// fill + FA2 layout + Sigma construction, the click/double-click wiring, the
// mount-safe kill, and the sidebar entry's no-session and error-badge
// branches (the jsdom degraded-list path lives in kgview.client.spec.tsx).

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-runtime/client'
import { KgGraphCanvas } from '../src/client/KgGraphCanvas.tsx'
import { KgEntry } from '../src/client/KgEntry.tsx'
import type { KgClientState } from '../src/client/kgStore.ts'
import { zh } from '../src/client/locales.ts'
import { bindStoreHook, GLOBAL_KIT, SESSION_KIT, sessionListState } from './kg-fixture.client.ts'

const t = ((key: string) => zh[key as keyof typeof zh] ?? key) as never

/** The scripted sigma instances the mock hands out. */
const sigmaInstances: Array<{
  killed: boolean
  handlers: Map<string, (payload: { node?: string }) => void>
  settings: Record<string, unknown>
}> = []

/** One fake graphology graph recording its nodes. */
const graphs: Array<{ nodes: Array<[string, Record<string, unknown>]>; edges: Array<[string, string]> }> = []

vi.mock('sigma', () => ({
  default: class MockSigma {
    killed = false
    handlers = new Map<string, (payload: { node?: string }) => void>()
    constructor(
      public graph: unknown,
      public container: HTMLElement,
      public settings: Record<string, unknown>,
    ) {
      sigmaInstances.push({ killed: false, handlers: this.handlers, settings: this.settings })
      void this.graph
      void this.container
    }
    on(event: string, handler: (payload: { node?: string }) => void): void {
      this.handlers.set(event, handler)
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

afterEach(() => {
  cleanup()
  sigmaInstances.length = 0
  graphs.length = 0
})

describe('KgGraphCanvas renderer stack (mocked sigma)', () => {
  it('builds the graph, runs the layout, and constructs sigma with the no-double-click-zoom setting', async () => {
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
    // The double-click zoom gives way to node expansion (ratio 1 = no zoom).
    expect(sigmaInstances[0]!.settings.doubleClickZoomingRatio).toBe(1)
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
  it('refreshes instead of switching when no session exists, and shows the error badge', () => {
    const store = createSnapshotStore<KgClientState>({
      legend: { status: 'error', error: 'kg-not-composed' },
      canvas: undefined, search: undefined, selected: undefined, typeFilter: undefined,
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
      canvas: undefined, search: undefined, selected: undefined, typeFilter: undefined,
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
