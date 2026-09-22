/**
 * The revision-replay read's store-level contract tests: snapshotAt freezes
 * the graph at one instant — nodes created at or before it, edges recorded
 * at or before it that were neither tombstoned nor record-retired before it
 * — with the size bounds and truncation signal.
 */

import { DatabaseSync } from 'node:sqlite'
import { describe, expect, it } from 'vitest'
import { SqliteGraphStore } from '../src/store.ts'
import { kgNodeTypeId, kgRelationId } from '@deepseek-ai/dsh-kb-graph'

function freshStore(): SqliteGraphStore {
  return new SqliteGraphStore({ path: ':memory:', busyTimeoutMs: 5_000 }, DatabaseSync)
}

const TENANT = 'demo-food-co'

describe('snapshotAt (revision replay)', () => {
  it('freezes the graph at the asked instant', async () => {
    const store = freshStore()
    // `recorded_at` is the store's write clock, so the test drives the
    // timeline with real instants captured around each write.
    const seededA = new Date(Date.now() - 60_000).toISOString()
    await store.upsertNode({ id: 'n:a', tenantId: TENANT, type: kgNodeTypeId('company'), naturalKey: '甲', name: '甲', createdAt: seededA, updatedAt: seededA })
    const between = new Date(Date.now() - 30_000).toISOString()
    const seededB = new Date().toISOString()
    await store.upsertNode({ id: 'n:b', tenantId: TENANT, type: kgNodeTypeId('product'), naturalKey: '乙', name: '乙', createdAt: seededB, updatedAt: seededB })
    await store.upsertEdges([{
      id: 'e:1', tenantId: TENANT, srcId: 'n:a', dstId: 'n:b', relation: kgRelationId('produces'),
      confidence: 1, provenance: { sourceSystem: 'kb', sourceId: 's1', extractedAt: seededB }, validFrom: seededB,
    }])
    const afterEdge = new Date().toISOString()
    // Between the two nodes: the first node alone, no edge yet.
    const morning = await store.snapshotAt(TENANT, between)
    expect(morning.nodes.map(node => node.id)).toEqual(['n:a'])
    expect(morning.edges).toHaveLength(0)
    // After everything: both nodes and the edge.
    const evening = await store.snapshotAt(TENANT, afterEdge)
    expect(evening.nodes.map(node => node.id)).toEqual(['n:a', 'n:b'])
    expect(evening.edges.map(edge => edge.id)).toEqual(['e:1'])
  })

  it('drops edges record-retired before the instant and keeps those retired after', async () => {
    const store = freshStore()
    const seeded = new Date().toISOString()
    await store.upsertNode({ id: 'n:a', tenantId: TENANT, type: kgNodeTypeId('company'), naturalKey: '甲', name: '甲', createdAt: seeded, updatedAt: seeded })
    await store.upsertNode({ id: 'n:b', tenantId: TENANT, type: kgNodeTypeId('product'), naturalKey: '乙', name: '乙', createdAt: seeded, updatedAt: seeded })
    await store.upsertEdges([{
      id: 'e:1', tenantId: TENANT, srcId: 'n:a', dstId: 'n:b', relation: kgRelationId('produces'),
      confidence: 1, provenance: { sourceSystem: 'kb', sourceId: 's1', extractedAt: seeded }, validFrom: seeded,
    }])
    const afterSeed = new Date().toISOString()
    // Advance the wall clock strictly past the capture so the retire mark
    // and the next instant differ (same-millisecond captures would tie).
    await new Promise(resolve => setTimeout(resolve, 5))
    await store.expireEdges(['e:1'], new Date().toISOString())
    await new Promise(resolve => setTimeout(resolve, 5))
    const afterRetire = new Date().toISOString()
    const beforeRetire = await store.snapshotAt(TENANT, afterSeed)
    expect(beforeRetire.edges.map(edge => edge.id)).toEqual(['e:1'])
    const later = await store.snapshotAt(TENANT, afterRetire)
    expect(later.edges).toHaveLength(0)
    expect(later.nodes).toHaveLength(2)
  })

  it('signals truncation at the node bound', async () => {
    const store = freshStore()
    const t0 = '2026-09-17T00:00:00.000Z'
    for (let index = 0; index < 3; index++) {
      await store.upsertNode({
        id: `n:${String(index)}`, tenantId: TENANT, type: kgNodeTypeId('company'),
        naturalKey: `甲${String(index)}`, name: `甲${String(index)}`, createdAt: t0, updatedAt: t0,
      })
    }
    const truncated = await store.snapshotAt(TENANT, t0, { maxNodes: 2 })
    expect(truncated.nodes).toHaveLength(2)
    expect(truncated.truncated).toBe(true)
    const full = await store.snapshotAt(TENANT, t0, { maxNodes: 10 })
    expect(full.nodes).toHaveLength(3)
    expect(full.truncated).toBe(false)
  })

  it('keeps tenants isolated', async () => {
    const store = freshStore()
    const t0 = '2026-09-17T00:00:00.000Z'
    await store.upsertNode({ id: 'n:a', tenantId: TENANT, type: kgNodeTypeId('company'), naturalKey: '甲', name: '甲', createdAt: t0, updatedAt: t0 })
    const other = await store.snapshotAt('other-tenant', t0)
    expect(other.nodes).toHaveLength(0)
  })
})
