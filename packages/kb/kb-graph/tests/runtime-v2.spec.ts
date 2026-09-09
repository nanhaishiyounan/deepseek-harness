/**
 * KbGraphRuntime property-graph v2 forwarding tests over a scripted KgStore:
 * closed-set rejections at the runtime boundary, subgraph/expand/tombstone/
 * alias/watermark forwarding, registry persistence chain order, and the
 * not-v2 store refusal.
 */

import { describe, expect, it, vi, type Mock } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import KbGraphRuntime from '../src/index.ts'
import { kgNodeTypeId, kgRelationId } from '../src/index.ts'
import type { GraphStore, KgEdge, KgNode, KgNodeType, KgRelation, KgSourceRun, KgStore, KgSubgraph } from '../src/index.ts'

/** The scripted store's mock-typed v2 surface (mock introspection included). */
interface ScriptedStore extends KgStore {
  upsertNode: Mock
  upsertEdges: Mock
  subgraph: Mock
  expand: Mock
  tombstoneBySource: Mock
  putAlias: Mock
  putSourceRun: Mock
  getSourceRun: Mock
  upsertNodeType: Mock
  upsertRelation: Mock
  listStoredNodeTypes: Mock
  listStoredRelations: Mock
  searchNodes: Mock
}

/** A scripted store implementing the full v2 face with mock methods. */
function scriptedKgStore(id: string): ScriptedStore {
  const base: GraphStore = {
    id,
    available: () => true,
    putTriples: vi.fn(async () => 0),
    neighbors: vi.fn(async () => []),
    twoHopPaths: vi.fn(async () => []),
    searchEntities: vi.fn(async () => []),
    stats: vi.fn(async () => ({ triples: 0, entities: 0 })),
    close: vi.fn(),
  }
  return {
    ...base,
    upsertNode: vi.fn(async (_node: KgNode) => ({ merged: false })),
    upsertEdges: vi.fn(async (_edges: readonly KgEdge[]) => 0),
    subgraph: vi.fn(async (_tenant: string, seeds: readonly string[], _hops: number): Promise<KgSubgraph> => ({
      nodes: seeds.map((seed, index) => ({ id: seed, type: kgNodeTypeId('company'), name: seed, depth: index === 0 ? 0 : 1 })),
      edges: [],
      truncated: false,
    })),
    expand: vi.fn(async (): Promise<KgSubgraph> => ({ nodes: [], edges: [], truncated: false })),
    tombstoneBySource: vi.fn(async () => 0),
    putAlias: vi.fn(async () => {}),
    putSourceRun: vi.fn(async () => {}),
    getSourceRun: vi.fn(async (): Promise<KgSourceRun | undefined> => undefined),
    upsertNodeType: vi.fn(async () => {}),
    upsertRelation: vi.fn(async () => {}),
    listStoredNodeTypes: vi.fn(async (): Promise<readonly KgNodeType[]> => []),
    listStoredRelations: vi.fn(async (): Promise<readonly KgRelation[]> => []),
  } as unknown as ScriptedStore
}

async function boot(): Promise<Context> {
  const ctx = new Context()
  await ctx.plugin(KbGraphRuntime)
  return ctx
}

const NOW = '2026-09-06T12:00:00.000Z'

function derivedNode(id: string, type: string, name: string, naturalKey: string): KgNode {
  return { id, tenantId: 't', type: kgNodeTypeId(type), name, naturalKey, createdAt: NOW, updatedAt: NOW }
}

function derivedEdge(id: string, src: string, dst: string, relation: string): KgEdge {
  return {
    id,
    tenantId: 't',
    srcId: src,
    dstId: dst,
    relation: kgRelationId(relation),
    confidence: 1,
    provenance: { sourceSystem: 'nocobase', sourceId: `row:${id}`, extractedAt: NOW },
    validFrom: NOW,
  }
}

/** Assert an async refusal's error code. */
async function expectCode(promise: Promise<unknown>, code: string): Promise<void> {
  await promise.then(() => { throw new Error('expected a rejection') }, (error: unknown) => {
    expect((error as { code?: string }).code).toBe(code)
  })
}

describe('KbGraphRuntime v2 forwarding', () => {
  it('refuses v2 writes when no store implements the v2 face', async () => {
    const ctx = await boot()
    ctx.kbGraph.registerStoreProvider({
      id: 'v1-only',
      available: () => true,
      putTriples: async () => 0,
      neighbors: async () => [],
      twoHopPaths: async () => [],
      searchEntities: async () => [],
      stats: async () => ({ triples: 0, entities: 0 }),
      close: () => {},
    })
    await expectCode(ctx.kbGraph.upsertNode(derivedNode('nocobase:experts:1', 'Expert', '张红喜', '1')), 'KB_GRAPH_STORE_NOT_V2')
    await expectCode(ctx.kbGraph.subgraph('t', ['x'], 1), 'KB_GRAPH_STORE_NOT_V2')
  })

  it('rejects unknown node types and predicates at the runtime boundary', async () => {
    const ctx = await boot()
    ctx.kbGraph.registerStoreProvider(scriptedKgStore('s'))
    await expectCode(ctx.kbGraph.upsertNode(derivedNode('x:1', 'NotAType', 'n', '1')), 'KB_GRAPH_UNKNOWN_ENTITY_TYPE')
    await expectCode(
      ctx.kbGraph.upsertEdges([derivedEdge('e1', 'nocobase:a:1', 'nocobase:b:1', 'not_a_relation')]),
      'KB_GRAPH_UNKNOWN_PREDICATE',
    )
  })

  it('forwards upsert, subgraph, expand, tombstone, alias, and watermark calls', async () => {
    const ctx = await boot()
    const store = scriptedKgStore('s')
    ctx.kbGraph.registerStoreProvider(store)
    const node = derivedNode('nocobase:experts:1', 'Expert', '张红喜', '1')
    await ctx.kbGraph.upsertNode(node)
    expect(store.upsertNode).toHaveBeenCalledWith(node)
    const edge = derivedEdge('e1', 'nocobase:experts:1', 'nocobase:x:1', 'certified_for')
    await ctx.kbGraph.upsertEdges([edge])
    expect(store.upsertEdges).toHaveBeenCalledWith([edge])
    const subgraph = await ctx.kbGraph.subgraph('t', ['nocobase:experts:1'], 2, { maxNodes: 50 })
    expect(subgraph.nodes[0]?.id).toBe('nocobase:experts:1')
    expect(store.subgraph).toHaveBeenCalledWith('t', ['nocobase:experts:1'], 2, { maxNodes: 50 })
    await ctx.kbGraph.expand('t', 'nocobase:experts:1', 10)
    expect(store.expand).toHaveBeenCalledWith('t', 'nocobase:experts:1', 10)
    await ctx.kbGraph.tombstoneBySource('nocobase', 'orders/9', NOW)
    expect(store.tombstoneBySource).toHaveBeenCalledWith('nocobase', 'orders/9', NOW)
    await ctx.kbGraph.putAlias('t', kgNodeTypeId('Expert'), '张会长', 'nocobase:experts:1')
    expect(store.putAlias).toHaveBeenCalledWith('t', kgNodeTypeId('Expert'), '张会长', 'nocobase:experts:1')
    const run: KgSourceRun = { sourceSystem: 'nocobase', scope: 'experts', watermark: '12', lastRunAt: NOW }
    await ctx.kbGraph.putSourceRun(run)
    expect(store.putSourceRun).toHaveBeenCalledWith(run)
    await ctx.kbGraph.getSourceRun('nocobase', 'experts')
    expect(store.getSourceRun).toHaveBeenCalledWith('nocobase', 'experts')
  })

  it('persists a node type with its ancestor chain registered top-down', async () => {
    const ctx = await boot()
    const store = scriptedKgStore('s')
    ctx.kbGraph.registerStoreProvider(store)
    await ctx.kbGraph.persistNodeType({
      id: kgNodeTypeId('experts'),
      label: '专家',
      layer: 'domain',
      extends: kgNodeTypeId('Expert'),
      props: [{ key: 'org', datatype: 'string' }],
      naturalKey: 'id',
      source: 'nocobase-derived',
      status: 'draft',
    })
    const persisted = store.upsertNodeType.mock.calls.map(call => String((call[0] as KgNodeType).id))
    expect(persisted).toEqual(['Object', 'Expert', 'experts'])
    // Re-persisting converges without a duplicate-registration throw.
    await ctx.kbGraph.persistNodeType({
      id: kgNodeTypeId('experts'),
      label: '专家（更新）',
      layer: 'domain',
      extends: kgNodeTypeId('Expert'),
      props: [],
      naturalKey: 'id',
      source: 'nocobase-derived',
      status: 'draft',
    })
    expect(store.upsertNodeType).toHaveBeenCalledTimes(6)
  })

  it('persists a relation after its constraint endpoint types and inverse', async () => {
    const ctx = await boot()
    const store = scriptedKgStore('s')
    ctx.kbGraph.registerStoreProvider(store)
    // Endpoints persist (register) first; a relation constraining unregistered
    // endpoints refuses.
    await expectCode(ctx.kbGraph.persistRelation({
      id: kgRelationId('expert_services.expert'),
      label: '所属专家',
      constraints: [{ domain: kgNodeTypeId('expert_services'), range: kgNodeTypeId('experts') }],
      kind: 'object',
      source: 'nocobase-derived',
    }), 'KG_UNKNOWN_NODE_TYPE')
    await ctx.kbGraph.persistNodeType({
      id: kgNodeTypeId('expert_services'), label: '专家服务', layer: 'domain',
      extends: kgNodeTypeId('ExpertService'), props: [], naturalKey: 'id',
      source: 'nocobase-derived', status: 'draft',
    })
    await ctx.kbGraph.persistNodeType({
      id: kgNodeTypeId('experts'), label: '专家', layer: 'domain',
      extends: kgNodeTypeId('Expert'), props: [], naturalKey: 'id',
      source: 'nocobase-derived', status: 'draft',
    })
    store.upsertNodeType.mockClear()
    store.upsertRelation.mockClear()
    await ctx.kbGraph.persistRelation({
      id: kgRelationId('expert_services.expert'),
      label: '所属专家',
      constraints: [{ domain: kgNodeTypeId('expert_services'), range: kgNodeTypeId('experts') }],
      kind: 'object',
      source: 'nocobase-derived',
    })
    const typeIds = store.upsertNodeType.mock.calls.map(call => String((call[0] as KgNodeType).id))
    expect(typeIds).toEqual(['expert_services', 'experts'])
    expect(store.upsertRelation).toHaveBeenCalledTimes(1)

    // persisted relations with declared inverses persist the inverse first.
    await ctx.kbGraph.persistNodeType({
      id: kgNodeTypeId('orders'), label: '订单', layer: 'domain',
      extends: kgNodeTypeId('Order'), props: [], naturalKey: 'id',
      source: 'nocobase-derived', status: 'draft',
    })
    await ctx.kbGraph.persistRelation({
      id: kgRelationId('ordered_service'),
      label: '订购服务',
      constraints: [{ domain: kgNodeTypeId('orders'), range: kgNodeTypeId('expert_services') }],
      kind: 'object',
      inverseOf: kgRelationId('expert_services.expert'),
      source: 'nocobase-derived',
    })
    const relationIds = store.upsertRelation.mock.calls.map(call => String((call[0] as KgRelation).id))
    expect(relationIds).toEqual(['expert_services.expert', 'expert_services.expert', 'ordered_service'])
  })

  it('reads the stored registry through the two-layer read path', async () => {
    const ctx = await boot()
    const store = scriptedKgStore('s')
    ctx.kbGraph.registerStoreProvider(store)
    const registry = await ctx.kbGraph.storedRegistry()
    expect(store.listStoredNodeTypes).toHaveBeenCalledTimes(1)
    expect(store.listStoredRelations).toHaveBeenCalledTimes(1)
    expect(registry).toEqual({ nodeTypes: [], relations: [] })
  })
})
