/**
 * KbGraphRuntime KGCL ontology-edit seam tests over a scripted store: the
 * applyOntologyOps validation overlay (duplicates, cycles, unknown targets,
 * cardinality pairs), the two-layer registry persistence, the revision
 * audit, plus the communities and snapshotAt reads the P2 workbench rides.
 */

import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import KbGraphRuntime from '../src/index.ts'
import { kgNodeTypeId } from '../src/index.ts'
import type { KbGraphRuntime as Runtime, GraphStore, KgOntologyRevisionInput, KgStore, KgSubgraph } from '../src/index.ts'

/** The scripted store's recorded writes (the assertions' oracle). */
interface RecordedStore {
  nodeTypeIds: string[]
  relationIds: string[]
  revisions: KgOntologyRevisionInput[]
  adjacency: { nodeIds: string[]; pairs: readonly (readonly [string, string])[] }
  snapshot: KgSubgraph
}

/** A minimal scripted store: records upserts, answers the reads with fixtures. */
function scriptedStore(record: RecordedStore): GraphStore & KgStore {
  const base: GraphStore = {
    id: 'scripted',
    available: () => true,
    putTriples: async () => 0,
    neighbors: async () => [],
    twoHopPaths: async () => [],
    searchEntities: async () => [],
    stats: async () => ({ triples: 0, entities: 0 }),
    close: () => {},
  }
  return {
    ...base,
    upsertNode: async () => ({ merged: false }),
    upsertEdges: async () => 0,
    subgraph: async (): Promise<KgSubgraph> => ({ nodes: [], edges: [], truncated: false }),
    expand: async (): Promise<KgSubgraph> => ({ nodes: [], edges: [], truncated: false }),
    tombstoneBySource: async () => 0,
    putAlias: async () => {},
    putSourceRun: async () => {},
    getSourceRun: async () => undefined,
    listSourceRuns: async () => [],
    deleteSourceRun: async () => {},
    upsertNodeType: async (type) => { record.nodeTypeIds.push(String(type.id)) },
    upsertRelation: async (relation) => { record.relationIds.push(String(relation.id)) },
    listStoredNodeTypes: async () => [],
    listStoredRelations: async () => [],
    searchNodes: async () => [],
    listNodes: async () => [],
    recordOntologyRevision: async (revision) => {
      record.revisions.push(revision)
      return record.revisions.length
    },
    ontologyRevisions: async () => [],
    recordBuildRun: async () => 1,
    latestBuildRun: async () => undefined,
    islandNodes: async () => 0,
    conflictingFacts: async () => 0,
    nodeCountByType: async () => 0,
    putEpisode: async () => {},
    linkMentions: async () => 0,
    listEpisodes: async () => [],
    edgeMentions: async () => [],
    edgeIdsOfEpisode: async () => [],
    expireEdges: async () => 0,
    restoreEdges: async () => 0,
    edgesByIds: async () => [],
    liveEdgesBetween: async () => [],
    liveAdjacency: async () => ({ nodeIds: record.adjacency.nodeIds, pairs: record.adjacency.pairs }),
    snapshotAt: async () => record.snapshot,
    putOntologyXrefs: async () => 0,
    listOntologyXrefs: async () => [],
    putCorefRejects: async () => 0,
    listCorefRejects: async () => new Set<string>(),
  }
}

/** Boot the runtime over one scripted store; returns the service handle. */
async function boot(record: RecordedStore): Promise<Runtime> {
  const ctx = new Context()
  await ctx.plugin(KbGraphRuntime)
  const runtime = ctx.get('kbGraph') as Runtime
  runtime.registerStoreProvider(scriptedStore(record))
  return runtime
}

/** A fresh record with the two-clique adjacency communities() reads. */
function freshRecord(): RecordedStore {
  return {
    nodeTypeIds: [],
    relationIds: [],
    revisions: [],
    adjacency: {
      nodeIds: ['a1', 'a2', 'a3', 'b1', 'b2', 'b3', 'bridge'],
      pairs: [
        ['a1', 'a2'], ['a2', 'a3'], ['a3', 'a1'],
        ['a1', 'bridge'], ['bridge', 'b1'],
        ['b1', 'b2'], ['b2', 'b3'], ['b3', 'b1'],
      ],
    },
    snapshot: { nodes: [{ id: 'n1', type: kgNodeTypeId('company'), name: '老店', depth: 0 }], edges: [], truncated: false },
  }
}

describe('applyOntologyOps', () => {
  it('registers a fresh subclass, persists it, and journals the revision', async () => {
    const record = freshRecord()
    const graph = await boot(record)
    const result = await graph.applyOntologyOps([
      { op: 'add_node', targetId: 'FrozenFood', label: '冷冻食品', parentId: 'product' },
    ])
    expect(result.revisionId).toBe(1)
    expect(result.applied).toHaveLength(1)
    expect(result.applied[0]).toContain('FrozenFood')
    expect(String(graph.nodeType(kgNodeTypeId('FrozenFood'))?.status)).toBe('draft')
    expect(String(graph.nodeType(kgNodeTypeId('FrozenFood'))?.source)).toBe('agent-defined')
    expect(record.nodeTypeIds).toContain('FrozenFood')
    expect(record.revisions[0]?.summary).toContain('ontology-edit')
  })

  it('rejects a duplicate class id without touching the store', async () => {
    const record = freshRecord()
    const graph = await boot(record)
    await expect(graph.applyOntologyOps([{ op: 'add_node', targetId: 'company', label: '公司', parentId: 'organization' }]))
      .rejects.toThrow(/already registered/)
    expect(record.nodeTypeIds).toHaveLength(0)
  })

  it('rejects malformed ids, empty labels, and unknown parents', async () => {
    const record = freshRecord()
    const graph = await boot(record)
    await expect(graph.applyOntologyOps([{ op: 'add_node', targetId: '9bad id', label: 'x', parentId: 'product' }]))
      .rejects.toThrow(/class id/)
    await expect(graph.applyOntologyOps([{ op: 'add_node', targetId: 'FreshFood', label: '  ', parentId: 'product' }]))
      .rejects.toThrow(/non-empty label/)
    await expect(graph.applyOntologyOps([{ op: 'add_node', targetId: 'FreshFood', label: '新鲜', parentId: 'ghost' }]))
      .rejects.toThrow(/parent class "ghost" is not registered/)
    await expect(graph.applyOntologyOps([{ op: 'add_node', targetId: 'FreshFood', label: '新鲜' }]))
      .rejects.toThrow(/needs a parent/)
  })

  it('renames, re-parents, and refuses parent cycles', async () => {
    const record = freshRecord()
    const graph = await boot(record)
    await graph.applyOntologyOps([
      { op: 'add_node', targetId: 'ColdChain', label: '冷链', parentId: 'product' },
      { op: 'add_node', targetId: 'FrozenMeal', label: '冷冻餐', parentId: 'ColdChain' },
    ])
    await graph.applyOntologyOps([{ op: 'rename_node', targetId: 'ColdChain', label: '冷链运输品' }])
    expect(graph.nodeType(kgNodeTypeId('ColdChain'))?.label).toBe('冷链运输品')
    await graph.applyOntologyOps([{ op: 'set_parent', targetId: 'FrozenMeal', newParentId: 'ingredient' }])
    expect(String(graph.nodeType(kgNodeTypeId('FrozenMeal'))?.extends)).toBe('ingredient')
    await graph.applyOntologyOps([{ op: 'set_parent', targetId: 'FrozenMeal', newParentId: 'ColdChain' }])
    expect(String(graph.nodeType(kgNodeTypeId('FrozenMeal'))?.extends)).toBe('ColdChain')
    // Re-hanging an ancestor under its own descendant would cycle the tree.
    await expect(graph.applyOntologyOps([{ op: 'set_parent', targetId: 'product', newParentId: 'FrozenMeal' }]))
      .rejects.toThrow(/cycle/)
  })

  it('deprecates with a replacement and rejects unknown replacements', async () => {
    const record = freshRecord()
    const graph = await boot(record)
    await expect(graph.applyOntologyOps([{ op: 'deprecate_node', targetId: 'product', replacedBy: 'ghost' }]))
      .rejects.toThrow(/replacement class "ghost"/)
    await graph.applyOntologyOps([{ op: 'deprecate_node', targetId: 'product', replacedBy: 'ingredient' }])
    expect(graph.nodeType(kgNodeTypeId('product'))?.status).toBe('deprecated')
  })

  it('rewrites one legal pair cardinality and rejects illegal pairs and bounds', async () => {
    const record = freshRecord()
    const graph = await boot(record)
    await graph.applyOntologyOps([{ op: 'change_cardinality', relationId: await relationIdOf(graph, '生产'), domainId: 'company', rangeId: 'product', min: 1, max: 3 }])
    const relation = graph.relation(await relationIdOf(graph, '生产'))
    expect(relation?.constraints[0]?.cardinality).toEqual({ min: 1, max: 3 })
    await expect(graph.applyOntologyOps([{ op: 'change_cardinality', relationId: await relationIdOf(graph, '生产'), domainId: 'company', rangeId: 'company' }]))
      .rejects.toThrow(/no legal pair/)
    await expect(graph.applyOntologyOps([{ op: 'change_cardinality', relationId: await relationIdOf(graph, '生产'), domainId: 'company', rangeId: 'product', min: 5, max: 2 }]))
      .rejects.toThrow(/exceeds max/)
  })

  it('rejects an empty op set', async () => {
    const graph = await boot(freshRecord())
    await expect(graph.applyOntologyOps([])).rejects.toThrow(/empty/)
  })
})

describe('communities + snapshotAt reads', () => {
  it('serves the precomputed louvain partition over live adjacency', async () => {
    const graph = await boot(freshRecord())
    const readout = await graph.communities('default')
    expect(readout.nodeCount).toBe(7)
    expect(readout.communities.length).toBeGreaterThanOrEqual(2)
    expect(readout.modularity).toBeGreaterThan(0.2)
    const ids = readout.communities.map(community => community.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('forwards the revision-replay read to the store', async () => {
    const record = freshRecord()
    const graph = await boot(record)
    const snapshot = await graph.snapshotAt('default', '2026-01-01T00:00:00.000Z')
    expect(snapshot.nodes[0]?.name).toBe('老店')
  })
})

/** Resolve the built-in relation id by its zh label (the seed's stable anchor). */
async function relationIdOf(graph: Runtime, label: string): Promise<import('../src/index.ts').KgRelationId> {
  const relation = graph.listRelations().find(entry => entry.label === label)
  if (relation === undefined) throw new Error(`no built-in relation labeled ${label}`)
  return relation.id
}
