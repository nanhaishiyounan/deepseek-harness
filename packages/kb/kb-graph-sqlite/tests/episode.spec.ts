/**
 * The episode ledger's store-level contract tests: putEpisode/linkMentions,
 * the edge-first mention reverse lookup, record retirement (expire/restore)
 * with the live-read semantics, the PPR adjacency read, the xref channel,
 * and the coreference reject tombstones.
 */

import { DatabaseSync } from 'node:sqlite'
import { describe, expect, it } from 'vitest'
import { SqliteGraphStore } from '../src/store.ts'
import { kgNodeTypeId, kgRelationId } from '@deepseek-ai/dsh-kb-graph'

function freshStore(): SqliteGraphStore {
  return new SqliteGraphStore({ path: ':memory:', busyTimeoutMs: 5_000 }, DatabaseSync)
}

const TENANT = 'demo-food-co'

async function seedTwoEdges(store: SqliteGraphStore): Promise<[string, string]> {
  const now = '2026-09-17T00:00:00.000Z'
  await store.upsertNode({ id: 'n:zhx', tenantId: TENANT, type: kgNodeTypeId('company'), naturalKey: '张红喜', name: '张红喜', createdAt: now, updatedAt: now })
  await store.upsertNode({ id: 'n:soy', tenantId: TENANT, type: kgNodeTypeId('ingredient'), naturalKey: '大豆', name: '大豆', createdAt: now, updatedAt: now })
  await store.upsertNode({ id: 'n:tofu', tenantId: TENANT, type: kgNodeTypeId('product'), naturalKey: '豆腐', name: '豆腐', createdAt: now, updatedAt: now })
  await store.upsertEdges([
    { id: 'e:1', tenantId: TENANT, srcId: 'n:zhx', dstId: 'n:soy', relation: kgRelationId('supplies'), confidence: 1, provenance: { sourceSystem: 'kb', sourceId: 's1', extractedAt: now }, validFrom: now },
    { id: 'e:2', tenantId: TENANT, srcId: 'n:soy', dstId: 'n:tofu', relation: kgRelationId('uses'), confidence: 1, provenance: { sourceSystem: 'kb', sourceId: 's2', extractedAt: now }, validFrom: now },
  ])
  return ['e:1', 'e:2']
}

describe('episode ledger', () => {
  it('round-trips an episode with its mentions and reverse lookup', async () => {
    const store = freshStore()
    const [, second] = await seedTwoEdges(store)
    await store.putEpisode({
      uuid: 'ai-edit:1', tenantId: TENANT, source: 'ai-edit',
      name: '把张红喜的供应商关系改成 X', content: '把张红喜的供应商关系改成中粮', validAt: '2026-09-17T01:00:00.000Z', createdAt: '2026-09-17T01:00:00.000Z',
      metadata: { addedEdgeIds: ['e:1'], retiredEdgeIds: ['e:2'] },
    })
    expect(await store.linkMentions('ai-edit:1', ['e:1', 'e:2'])).toBe(2)
    expect(await store.linkMentions('ai-edit:1', ['e:1'])).toBe(0)

    const episodes = await store.listEpisodes(TENANT, 10)
    expect(episodes).toHaveLength(1)
    expect(episodes[0]?.mentionCount).toBe(2)
    expect(episodes[0]?.source).toBe('ai-edit')

    const mentions = await store.edgeMentions(second)
    expect(mentions).toHaveLength(1)
    expect(mentions[0]?.episode?.content).toBe('把张红喜的供应商关系改成中粮')
    expect(await store.edgeIdsOfEpisode('ai-edit:1')).toEqual(['e:1', 'e:2'])

    // A duplicate uuid refreshes content in place (the replay-safe write).
    await store.putEpisode({ uuid: 'ai-edit:1', tenantId: TENANT, source: 'ai-edit', name: 'n', content: 'v2', validAt: 'v', createdAt: 'c' })
    expect((await store.listEpisodes(TENANT, 10))[0]?.content).toBe('v2')
  })

  it('expires and restores edge records without touching fact validity', async () => {
    const store = freshStore()
    const [first, second] = await seedTwoEdges(store)
    const before = await store.edgesByIds([first, second])
    expect(before).toHaveLength(2)

    expect(await store.expireEdges([first], '2026-09-17T02:00:00.000Z')).toBe(1)
    expect(await store.expireEdges([first], '2026-09-17T02:00:01.000Z')).toBe(0)
    // The retired record drops out of live reads…
    expect((await store.edgesByIds([first, second])).map(edge => edge.id)).toEqual([second])
    expect(await store.liveEdgesBetween(TENANT, 'n:zhx', 'n:soy')).toHaveLength(0)
    // …and the subgraph walk stops crossing it.
    const walk = await store.subgraph(TENANT, ['n:zhx'], 2, { maxNodes: 10 })
    expect(walk.nodes.some(node => node.id === 'n:tofu')).toBe(false)

    expect(await store.restoreEdges([first], '2026-09-17T03:00:00.000Z')).toBe(1)
    expect(await store.restoreEdges([first], '2026-09-17T03:00:01.000Z')).toBe(0)
    expect(await store.liveEdgesBetween(TENANT, 'n:zhx', 'n:soy')).toHaveLength(1)
  })

  it('reads the live adjacency for PPR', async () => {
    const store = freshStore()
    await seedTwoEdges(store)
    const adjacency = await store.liveAdjacency(TENANT, 100)
    expect(adjacency.nodeIds).toEqual(['n:zhx', 'n:soy', 'n:tofu'])
    expect(adjacency.pairs).toEqual([['n:zhx', 'n:soy'], ['n:soy', 'n:tofu']])
    expect((await store.liveAdjacency(TENANT, 1)).pairs).toHaveLength(1)
  })

  it('filters live edges between endpoints by relation', async () => {
    const store = freshStore()
    await seedTwoEdges(store)
    expect((await store.liveEdgesBetween(TENANT, 'n:soy', 'n:zhx')).map(edge => edge.id)).toEqual(['e:1'])
    expect(await store.liveEdgesBetween(TENANT, 'n:soy', 'n:zhx', kgRelationId('uses'))).toEqual([])
  })

  it('persists and reads ontology xrefs idempotently', async () => {
    const store = freshStore()
    const entry = { subjectId: 'foodon:00001002', predicateId: 'extends-builtin', objectId: 'product', mappingJustification: 'anchor' }
    expect(await store.putOntologyXrefs([entry])).toBe(1)
    expect(await store.putOntologyXrefs([entry])).toBe(0)
    const listed = await store.listOntologyXrefs(10)
    expect(listed).toEqual([entry])
  })

  it('persists coreference reject tombstones and reads the set', async () => {
    const store = freshStore()
    const entry = { pairKey: 'a::b', docId: 'a', rowId: 'b', reason: '不同主体', decidedAt: 'now' }
    expect(await store.putCorefRejects([entry])).toBe(1)
    expect(await store.putCorefRejects([entry])).toBe(0)
    expect(await store.listCorefRejects()).toEqual(new Set(['a::b']))
  })

  it('returns empty collections for empty inputs', async () => {
    const store = freshStore()
    expect(await store.edgesByIds([])).toEqual([])
    expect(await store.listEpisodes(TENANT, 10)).toEqual([])
    expect((await store.liveAdjacency(TENANT, 10)).pairs).toEqual([])
  })
})
