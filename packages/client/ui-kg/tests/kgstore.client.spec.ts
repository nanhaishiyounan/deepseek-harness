// The kg client-session store: the legend/canvas/search caches, the expand
// merge (identity-keeping node union, endpoint-consistent edge union, the
// sticky truncated flag), selection, and the type-filter whitelist.

import { describe, expect, it } from 'vitest'
import { createKgClientStore } from '../src/client/kgStore.ts'
import type { KgEdgeRow, KgSubgraphNodeRow } from '../src/client/kgTypes.ts'

const NODE_A: KgSubgraphNodeRow = { id: 'nocobase:customers:1', type: 'Customer', name: '宏发食品', depth: 0 }
const NODE_B: KgSubgraphNodeRow = { id: 'nocobase:orders:9', type: 'Order', name: 'SO-009', depth: 1 }
const NODE_C: KgSubgraphNodeRow = { id: 'kb:doc:风险点', type: 'Concept', name: '仓储风险', depth: 1 }
const EDGE_AB: KgEdgeRow = {
  id: 'e1', relation: 'placed_by', source: NODE_A.id, target: NODE_B.id, asserted_by: 'nocobase',
}
const EDGE_BC: KgEdgeRow = {
  id: 'e2', relation: 'mentions', source: NODE_B.id, target: NODE_C.id, fact: '风险', asserted_by: 'kb',
}

describe('kg client store caches', () => {
  it('tracks the legend load lifecycle', () => {
    const store = createKgClientStore()
    expect(store.store.getSnapshot().legend).toBeUndefined()
    store.beginLegend()
    expect(store.store.getSnapshot().legend).toEqual({ status: 'loading' })
    store.setLegend([{ id: 'Customer', label: '客户', layer: 'domain', prop_keys: [], source: 'builtin-food', status: 'active' }], [], [])
    expect(store.store.getSnapshot().legend?.status).toBe('ready')
    store.failLegend('boom')
    expect(store.store.getSnapshot().legend).toEqual({ status: 'error', error: 'boom' })
  })

  it('replaces the canvas on a walk and records the seeds', () => {
    const store = createKgClientStore()
    store.beginCanvas()
    store.setCanvas({ nodes: [NODE_A, NODE_B], edges: [EDGE_AB], truncated: false }, [NODE_A.id])
    const canvas = store.store.getSnapshot().canvas
    expect(canvas).toMatchObject({ status: 'ready', value: { seeds: [NODE_A.id] } })
  })
})

describe('kg client store expand merge', () => {
  it('unions nodes by identity and edges by id, keeping prior positions sticky', () => {
    const store = createKgClientStore()
    store.setCanvas({ nodes: [NODE_A, NODE_B], edges: [EDGE_AB], truncated: false }, [NODE_A.id])
    // B reappears with a different depth; the merge keeps one copy (the
    // patch's newer attributes win, the set stays deduplicated).
    store.mergeCanvas({ nodes: [NODE_B, NODE_C], edges: [EDGE_BC], truncated: false })
    const canvas = store.store.getSnapshot().canvas
    if (canvas?.status !== 'ready') throw new Error('canvas not ready')
    expect(canvas.value.nodes.map(node => node.id)).toEqual([NODE_A.id, NODE_B.id, NODE_C.id])
    expect(canvas.value.edges.map(edge => edge.id)).toEqual(['e1', 'e2'])
    expect(canvas.value.seeds).toEqual([NODE_A.id])
  })

  it('keeps the truncated flag sticky across merges', () => {
    const store = createKgClientStore()
    store.setCanvas({ nodes: [NODE_A], edges: [], truncated: true }, [NODE_A.id])
    store.mergeCanvas({ nodes: [NODE_C], edges: [], truncated: false })
    expect(store.store.getSnapshot().canvas).toMatchObject({ status: 'ready', value: { truncated: true } })
  })

  it('resets to the patch alone when no ready canvas exists (a racing failure)', () => {
    const store = createKgClientStore()
    store.failCanvas('first walk failed')
    store.mergeCanvas({ nodes: [NODE_C], edges: [], truncated: false })
    const canvas = store.store.getSnapshot().canvas
    expect(canvas).toMatchObject({ status: 'ready', value: { nodes: [NODE_C] } })
  })
})

describe('kg client store selection and filter', () => {
  it('selects, clears, and toggles the type whitelist (empty whitelist clears it)', () => {
    const store = createKgClientStore()
    store.select(NODE_A.id)
    expect(store.store.getSnapshot().selected).toBe(NODE_A.id)
    store.select(undefined)
    expect(store.store.getSnapshot().selected).toBeUndefined()

    store.setTypeFilter(new Set(['Customer']))
    expect(store.store.getSnapshot().typeFilter?.has('Customer')).toBe(true)
    store.setTypeFilter(new Set())
    expect(store.store.getSnapshot().typeFilter).toBeUndefined()
  })
})
