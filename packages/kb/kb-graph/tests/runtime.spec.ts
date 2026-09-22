/**
 * KbGraphRuntime store orchestration, ontology registry, and closed-set
 * validation tests over a scripted store.
 */

import { describe, expect, it, vi, type Mock } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import KbGraphRuntime from '../src/index.ts'
import { kgNodeTypeId, kgRelationId } from '../src/index.ts'
import type { GraphStore, KbGraphEntity, KgNodeType, KgRelation, KbGraphStoredTriple } from '../src/index.ts'

function scriptedStore(id: string, usable = true): GraphStore & {
  putTriples: Mock
  neighbors: Mock
  searchEntities: Mock
  twoHopPaths: Mock
} {
  return {
    id,
    available: () => usable,
    putTriples: vi.fn(async () => 0),
    neighbors: vi.fn(async (): Promise<KbGraphStoredTriple[]> => []),
    twoHopPaths: vi.fn(async (): Promise<KbGraphStoredTriple[]> => []),
    searchEntities: vi.fn(async (): Promise<KbGraphEntity[]> => []),
    stats: vi.fn(async () => ({ triples: 0, entities: 0 })),
    close: vi.fn(),
  }
}

async function boot(): Promise<Context> {
  const ctx = new Context()
  await ctx.plugin(KbGraphRuntime)
  return ctx
}

const entity: KbGraphEntity = { type: kgNodeTypeId('company'), id: 'hongfa-food' }

/** Assert an async refusal's error code. */
async function expectCode(promise: Promise<unknown>, code: string): Promise<void> {
  await promise.then(() => { throw new Error('expected a rejection') }, (error: unknown) => {
    expect((error as { code?: string }).code).toBe(code)
  })
}

describe('KbGraphRuntime stores', () => {
  it('rejects a duplicate store provider id', async () => {
    const ctx = await boot()
    ctx.kbGraph.registerStoreProvider(scriptedStore('a'))
    expect(() => ctx.kbGraph.registerStoreProvider(scriptedStore('a')))
      .toThrow(/already registered/u)
  })

  it('auto-selects the single usable store and forwards queries', async () => {
    const ctx = await boot()
    const store = scriptedStore('a')
    ctx.kbGraph.registerStoreProvider(store)
    await ctx.kbGraph.neighbors('t', entity)
    expect(store.neighbors.mock.calls[0]).toEqual(['t', entity, undefined])
    await ctx.kbGraph.searchEntities('t', 'hong', kgNodeTypeId('company'))
    expect(store.searchEntities.mock.calls[0]).toEqual(['t', 'hong', kgNodeTypeId('company'), 10, undefined])
  })

  it('throws KB_GRAPH_STORE_AMBIGUOUS with two usable stores', async () => {
    const ctx = await boot()
    ctx.kbGraph.registerStoreProvider(scriptedStore('a'))
    ctx.kbGraph.registerStoreProvider(scriptedStore('b'))
    await expectCode(ctx.kbGraph.stats('t'), 'KB_GRAPH_STORE_AMBIGUOUS')
  })

  it('throws KB_GRAPH_STORE_UNAVAILABLE with no usable store', async () => {
    const ctx = await boot()
    await expectCode(ctx.kbGraph.stats('t'), 'KB_GRAPH_STORE_UNAVAILABLE')
  })

  it('unregisters on disposer disposal', async () => {
    const ctx = await boot()
    const dispose = ctx.kbGraph.registerStoreProvider(scriptedStore('a'))
    dispose()
    await expectCode(ctx.kbGraph.stats('t'), 'KB_GRAPH_STORE_UNAVAILABLE')
  })

  it('honors an aborted signal before any provider work', async () => {
    const ctx = await boot()
    const store = scriptedStore('a')
    ctx.kbGraph.registerStoreProvider(store)
    const controller = new AbortController()
    controller.abort()
    await expect(ctx.kbGraph.putTriples('t', [], controller.signal)).rejects.toThrow()
    expect(store.putTriples.mock.calls.length).toBe(0)
  })
})

describe('KbGraphRuntime ontology registry', () => {
  it('loads the built-in seed: three layers and the food 7×7', async () => {
    const ctx = await boot()
    expect(ctx.kbGraph.listNodeTypes('top').map(type => String(type.id)).sort())
      .toEqual(['Concept', 'Event', 'Object', 'Process', 'Role'])
    const food = ctx.kbGraph.listNodeTypes('domain')
      .filter(type => type.source === 'builtin-food')
      .map(type => String(type.id))
    expect(food).toEqual(['company', 'product', 'ingredient', 'additive', 'standard', 'process', 'risk', 'packaging'])
    const relations = ctx.kbGraph.listRelations().map(rel => String(rel.id))
    for (const predicate of ['produces', 'uses', 'contains', 'complies_with', 'follows', 'flags', 'supplies']) {
      expect(relations).toContain(predicate)
    }
  })

  it('seeds food direction constraints on the relations', async () => {
    const ctx = await boot()
    const produces = ctx.kbGraph.relation(kgRelationId('produces'))
    expect(produces?.constraints).toContainEqual({
      domain: kgNodeTypeId('company'),
      range: kgNodeTypeId('product'),
    })
    const uses = ctx.kbGraph.relation(kgRelationId('uses'))
    expect(uses?.constraints).toEqual([
      { domain: kgNodeTypeId('product'), range: kgNodeTypeId('ingredient') },
      { domain: kgNodeTypeId('product'), range: kgNodeTypeId('additive') },
    ])
  })

  it('lists node types without a layer filter and validates an unknown dst', async () => {
    const ctx = await boot()
    expect(ctx.kbGraph.listNodeTypes().length).toBeGreaterThanOrEqual(28)
    expect(ctx.kbGraph.validateEdge(kgRelationId('produces'), kgNodeTypeId('company'), kgNodeTypeId('ghost'))[0]?.code)
      .toBe('KG_UNKNOWN_NODE_TYPE')
  })

  it('forwards putTriples and twoHopPaths after closed-set validation', async () => {
    const ctx = await boot()
    const store = scriptedStore('a')
    ctx.kbGraph.registerStoreProvider(store)
    await ctx.kbGraph.putTriples('t', [{ subject: entity, predicate: kgRelationId('produces'), object: { type: kgNodeTypeId('product'), id: '老抽酱油' } }])
    expect(store.putTriples.mock.calls[0]?.[2]).toBeUndefined()
    await ctx.kbGraph.twoHopPaths('t', entity, { type: kgNodeTypeId('product'), id: '老抽酱油' })
    expect(store.twoHopPaths.mock.calls.length).toBe(1)
  })

  it('seeds food node types with their domain parents', async () => {
    const ctx = await boot()
    const product = ctx.kbGraph.nodeType(kgNodeTypeId('product'))
    expect(product?.extends).toBe(kgNodeTypeId('Product'))
    const standard = ctx.kbGraph.nodeType(kgNodeTypeId('standard'))
    expect(standard?.layer).toBe('domain')
    expect(standard?.extends).toBe(kgNodeTypeId('Concept'))
  })

  it('registers a new node type, exposes it, and removes it on disposal', async () => {
    const ctx = await boot()
    const type: KgNodeType = {
      id: kgNodeTypeId('Storefront'),
      label: '门店',
      layer: 'domain',
      extends: kgNodeTypeId('Object'),
      props: [],
      source: 'agent-defined',
      status: 'active',
    }
    const dispose = ctx.kbGraph.registerNodeType(type)
    expect(ctx.kbGraph.nodeType(kgNodeTypeId('Storefront'))?.label).toBe('门店')
    dispose()
    expect(ctx.kbGraph.nodeType(kgNodeTypeId('Storefront'))).toBeUndefined()
  })

  it('rejects a duplicate node type and an unregistered parent', async () => {
    const ctx = await boot()
    expect(() => ctx.kbGraph.registerNodeType({
      id: kgNodeTypeId('company'),
      label: '重复',
      layer: 'domain',
      props: [],
      source: 'agent-defined',
      status: 'active',
    })).toThrow(/already registered/u)
    expect(() => ctx.kbGraph.registerNodeType({
      id: kgNodeTypeId('Ghost'),
      label: '幽灵',
      layer: 'domain',
      extends: kgNodeTypeId('NoSuchParent'),
      props: [],
      source: 'agent-defined',
      status: 'active',
    })).toThrow(/unregistered/u)
  })

  it('registers a relation with validated endpoints and inverse', async () => {
    const ctx = await boot()
    const relation: KgRelation = {
      id: kgRelationId('ships_for'),
      label: '代发',
      constraints: [{ domain: kgNodeTypeId('Carrier'), range: kgNodeTypeId('Order') }],
      kind: 'object',
      source: 'agent-defined',
    }
    const dispose = ctx.kbGraph.registerRelation(relation)
    expect(ctx.kbGraph.relation(kgRelationId('ships_for'))?.label).toBe('代发')
    dispose()
    expect(ctx.kbGraph.relation(kgRelationId('ships_for'))).toBeUndefined()
    expect(() => ctx.kbGraph.registerRelation({
      id: kgRelationId('produces'),
      label: '重复',
      constraints: [],
      kind: 'object',
      source: 'agent-defined',
    })).toThrow(/already registered/u)
    expect(() => ctx.kbGraph.registerRelation({
      id: kgRelationId('ghost_edge'),
      label: '幽灵边',
      constraints: [{ domain: kgNodeTypeId('Ghost'), range: kgNodeTypeId('Object') }],
      kind: 'object',
      source: 'agent-defined',
    })).toThrow(/unregistered endpoint/u)
    expect(() => ctx.kbGraph.registerRelation({
      id: kgRelationId('inverse_of_ghost'),
      label: '幽灵逆',
      constraints: [],
      kind: 'object',
      inverseOf: kgRelationId('ghost_relation'),
      source: 'agent-defined',
    })).toThrow(/unregistered inverseOf/u)
  })

  it('validates edges: unknowns, direction violations, and free hierarchical pairs', async () => {
    const ctx = await boot()
    const [unknownRelation] = ctx.kbGraph.validateEdge(kgRelationId('no_such'), kgNodeTypeId('company'), kgNodeTypeId('product'))
    expect(unknownRelation?.code).toBe('KG_UNKNOWN_RELATION')
    expect(unknownRelation?.message).toContain('no_such')
    expect(ctx.kbGraph.validateEdge(kgRelationId('produces'), kgNodeTypeId('ghost'), kgNodeTypeId('product'))[0]?.code)
      .toBe('KG_UNKNOWN_NODE_TYPE')
    const [violation] = ctx.kbGraph.validateEdge(kgRelationId('produces'), kgNodeTypeId('product'), kgNodeTypeId('company'))
    expect(violation?.code).toBe('KG_DIRECTION_VIOLATION')
    expect(violation?.message).toContain('product→company')
    expect(ctx.kbGraph.validateEdge(kgRelationId('produces'), kgNodeTypeId('company'), kgNodeTypeId('product'))).toEqual([])
    expect(ctx.kbGraph.validateEdge(kgRelationId('broader'), kgNodeTypeId('standard'), kgNodeTypeId('risk'))).toEqual([])
  })
})

describe('KbGraphRuntime closed-set write validation', () => {
  it('refuses triples with unregistered entity types or predicates', async () => {
    const ctx = await boot()
    const store = scriptedStore('a')
    ctx.kbGraph.registerStoreProvider(store)
    await expectCode(
      ctx.kbGraph.putTriples('t', [{ subject: { type: kgNodeTypeId('planet'), id: 'mars' }, predicate: kgRelationId('produces'), object: { type: kgNodeTypeId('product'), id: 'x' } }]),
      'KB_GRAPH_UNKNOWN_ENTITY_TYPE',
    )
    await expectCode(
      ctx.kbGraph.putTriples('t', [{ subject: { type: kgNodeTypeId('company'), id: 'a' }, predicate: kgRelationId('orbits'), object: { type: kgNodeTypeId('product'), id: 'b' } }]),
      'KB_GRAPH_UNKNOWN_PREDICATE',
    )
    expect(store.putTriples.mock.calls.length).toBe(0)
  })
})
