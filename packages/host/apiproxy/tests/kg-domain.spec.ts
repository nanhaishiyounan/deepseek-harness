/**
 * The kg domain: the opt-in gates and their three refusals (not-composed,
 * seam-missing, tenant-unbound), the ontology legend projection, the seed
 * resolution, the k-hop walk with its server-side seed resolution and
 * relation filter (tool-parity semantics), the one-hop expansion, the
 * counters, and the store-failure error wrap.
 */

import { afterEach, describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import AgentRegistry from '@deepseek-ai/dsh-agent'
import SessionStore from '@deepseek-ai/dsh-session'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import UserQuestionService from '@deepseek-ai/dsh-user-questions'
import KbGraphRuntime, { kgNodeTypeId, kgRelationId } from '@deepseek-ai/dsh-kb-graph'
import * as KbGraphSqlite from '@deepseek-ai/dsh-kb-graph-sqlite'
import { createApiProxy } from '../src/api-proxy.ts'
import type { RpcRequest } from '../src/api/rpc.ts'

/** One typed RPC request envelope (the rpcId is branded on the wire contract). */
function request<P>(payload: P): RpcRequest<P> {
  return { rpcId: 'r' as never, payload }
}

const NOW = '2026-09-07T00:00:00.000Z'

let ctx: Context | undefined

/** Boot the graph seam and store; the proxy defaults vary per case. */
async function boot(defaults: Record<string, unknown>, mountGraph = true): Promise<ReturnType<typeof createApiProxy>> {
  const context = new Context()
  await context.plugin(SessionStore)
  await context.plugin(SystemPrompt, { persona: '' })
  await context.plugin(UserQuestionService)
  await context.plugin(AgentRegistry)
  if (!mountGraph) {
    ctx = context
    return createApiProxy(context, defaults as never)
  }
  await context.plugin(KbGraphRuntime)
  await context.plugin(KbGraphSqlite, { path: ':memory:' })
  const graph = context.get('kbGraph')
  if (graph === undefined) throw new Error('kbGraph missing')
  for (const [type, name] of [['company', '宏发食品'], ['product', '酱油'], ['additive', '山梨酸钾']] as const) {
    await graph.upsertNode({
      id: `kb:t#${name}`, tenantId: 't1', type: kgNodeTypeId(type),
      naturalKey: name, name, createdAt: NOW, updatedAt: NOW,
    })
  }
  await graph.upsertEdges([
    {
      id: 'kb:t#e1', tenantId: 't1', srcId: 'kb:t#宏发食品', dstId: 'kb:t#酱油',
      relation: kgRelationId('produces'), confidence: 1,
      provenance: { sourceSystem: 'kb', sourceId: 'doc.md', extractedAt: NOW }, validFrom: NOW,
    },
    {
      id: 'kb:t#e2', tenantId: 't1', srcId: 'kb:t#酱油', dstId: 'kb:t#山梨酸钾',
      relation: kgRelationId('contains'), confidence: 0.8, fact: '防腐剂',
      provenance: { sourceSystem: 'kb', sourceId: 'gb.md', extractedAt: NOW }, validFrom: NOW,
    },
  ])
  ctx = context
  return createApiProxy(context, defaults as never)
}

afterEach(async () => {
  await ctx?.fiber.dispose()
  ctx = undefined
})

describe('kg domain gates', () => {
  it('refuses with kg-not-composed when the deployment has not opted in', async () => {
    const api = await boot({ kgEnabled: false, kgTenant: 't1' })
    const response = await api.kg.schema(request({}))
    expect(response.result).toMatchObject({ ok: false, error: { code: 'kg-not-composed' } })
  })

  it('refuses with kg-graph-missing without the seam, and kg-tenant-unbound without the binding', async () => {
    const missingApi = await boot({ kgEnabled: true }, false)
    const missing = await missingApi.kg.schema(request({}))
    expect(missing.result).toMatchObject({ ok: false, error: { code: 'kg-graph-missing' } })
    // With the seam mounted but no tenant binding, the refusal names the
    // unbound tenant (the boot's seeded store is irrelevant to the gate).
    const unboundApi = await boot({ kgEnabled: true })
    const refused = await unboundApi.kg.schema(request({}))
    expect(refused.result).toMatchObject({ ok: false, error: { code: 'kg-tenant-unbound' } })
  })
})

describe('kg domain reads', () => {
  it('projects the registry onto the legend rows', async () => {
    const api = await boot({ kgEnabled: true, kgTenant: 't1' })
    const legend = await api.kg.schema(request({}))
    if (!legend.result.ok) throw new Error('legend refused')
    expect(legend.result.value.node_types.some(type => type.id === 'company' && type.label.length > 0)).toBe(true)
    expect(legend.result.value.relations.some(relation => relation.id === 'produces')).toBe(true)
  })

  it('resolves seeds by name and walks the k-hop neighborhood', async () => {
    const api = await boot({ kgEnabled: true, kgTenant: 't1' })
    const walk = await api.kg.subgraph(request({ seeds: ['宏发食品'], hops: 2 }))
    if (!walk.result.ok) throw new Error('walk refused')
    const value = walk.result.value
    expect(value.seeds_resolved).toEqual(['kb:t#宏发食品'])
    expect(value.nodes.map(node => node.name)).toContain('酱油')
    expect(value.edges.map(edge => edge.relation)).toEqual(expect.arrayContaining(['produces', 'contains']))
    // Wrong-tenant reads stay isolated: the walk under another tenant is empty
    // of these nodes but the call succeeds with resolved seeds only when the
    // store shares nodes; here the projection asserts what the tenant holds.
    expect(value.truncated).toBe(false)
  })

  it('reports unresolved seeds structurally and drops a blank seed list', async () => {
    const api = await boot({ kgEnabled: true, kgTenant: 't1' })
    const none = await api.kg.subgraph(request({ seeds: ['不存在的实体'] }))
    expect(none.result).toMatchObject({ ok: false, error: { code: 'kg-seed-unresolved' } })
    const partial = await api.kg.subgraph(request({ seeds: ['宏发食品', '另一个不存在的'] }))
    if (!partial.result.ok) throw new Error('partial refused')
    expect(partial.result.value.unresolved).toEqual(['另一个不存在的'])
    const blank = await api.kg.subgraph(request({ seeds: ['   '] }))
    expect(blank.result).toMatchObject({ ok: false, error: { code: 'kg-seed-unresolved' } })
  })

  it('filters edges by relation_types at the projection layer (tool parity)', async () => {
    const api = await boot({ kgEnabled: true, kgTenant: 't1' })
    const walk = await api.kg.subgraph(request({ seeds: ['宏发食品'], hops: 2, relation_types: ['produces'] }))
    if (!walk.result.ok) throw new Error('walk refused')
    expect(walk.result.value.edges.map(edge => edge.relation)).toEqual(['produces'])
    // The filtered-out edge's endpoint node survives the node cut (rendering
    // semantics keep it; only the edge projection narrows).
    expect(walk.result.value.nodes.map(node => node.name)).toContain('酱油')
  })

  it('expands one node and answers the seed search', async () => {
    const api = await boot({ kgEnabled: true, kgTenant: 't1' })
    const expanded = await api.kg.expand(request({ node_id: 'kb:t#酱油' }))
    if (!expanded.result.ok) throw new Error('expand refused')
    expect(expanded.result.value.nodes.map(node => node.name)).toEqual(expect.arrayContaining(['酱油', '山梨酸钾']))
    const search = await api.kg.search(request({ query: '宏发食品' }))
    if (!search.result.ok) throw new Error('search refused')
    expect(search.result.value.nodes.map(node => node.name)).toEqual(['宏发食品'])
  })

  it('counts the store and the registry in stats, with the quality tail', async () => {
    const api = await boot({ kgEnabled: true, kgTenant: 't1' })
    const stats = await api.kg.stats(request({}))
    if (!stats.result.ok) throw new Error('stats refused')
    expect(stats.result.value.triples).toBe(2)
    expect(stats.result.value.entities).toBe(3)
    expect(stats.result.value.node_types).toBeGreaterThan(0)
    expect(stats.result.value.ontology_version).toMatch(/^\d+\.\d+\.\d+$/u)
    // The seeded chain (宏发→酱油→山梨酸钾) has no islands and no conflicts;
    // no pipeline is composed, so the coverage tail stays absent.
    expect(stats.result.value.islands).toBe(0)
    expect(stats.result.value.conflicts).toBe(0)
    expect(stats.result.value.coverage).toBeUndefined()
    expect(stats.result.value.last_run_at).toBeUndefined()
  })

  it('compiles and walks a templated phrase through kg.query', async () => {
    const api = await boot({ kgEnabled: true, kgTenant: 't1' })
    const walk = await api.kg.query(request({ phrase: '宏发食品生产的产品' }))
    if (!walk.result.ok) throw new Error('query refused')
    const value = walk.result.value
    expect(value.template).toBe('produces-products')
    expect(value.hops).toBe(1)
    expect(value.relation_types).toEqual(['produces'])
    expect(value.seeds_resolved).toEqual(['kb:t#宏发食品'])
    expect(value.edges.map(edge => edge.relation)).toEqual(['produces'])
    expect(value.restated).toContain('宏发食品')
  })

  it('refuses unsupported phrase shapes with the example list', async () => {
    const api = await boot({ kgEnabled: true, kgTenant: 't1' })
    const refused = await api.kg.query(request({ phrase: '今天天气怎么样' }))
    expect(refused.result).toMatchObject({ ok: false, error: { code: 'kg-query-unsupported' } })
    if (!refused.result.ok) {
      const details = refused.result.error.details as { examples?: readonly string[] }
      expect(details.examples?.length).toBeGreaterThan(3)
    }
    const unresolved = await api.kg.query(request({ phrase: '不存在的实体的订单' }))
    expect(unresolved.result).toMatchObject({ ok: false, error: { code: 'kg-seed-unresolved' } })
  })

  it('wraps store failures as kg-read-failed', async () => {
    const api = await boot({ kgEnabled: true, kgTenant: 't1' })
    // Retire the real store and register one whose reads throw: the wire
    // wrap is the contract under test, not the store's failure mode.
    const graph = ctx!.get('kbGraph')
    if (graph === undefined) throw new Error('kbGraph missing')
    const seam = graph as unknown as {
      stores: Map<string, unknown>
      registerStoreProvider(store: unknown): () => void
    }
    for (const key of [...seam.stores.keys()]) seam.stores.delete(key)
    seam.registerStoreProvider({
      id: 'throwing-store',
      available: () => true,
      searchNodes: () => { throw new Error('fts exploded') },
      stats: () => { throw new Error('stats exploded') },
    })
    const response = await api.kg.search(request({ query: '宏发食品' }))
    expect(response.result).toMatchObject({ ok: false, error: { code: 'kg-read-failed' } })
    const statsResponse = await api.kg.stats(request({}))
    expect(statsResponse.result).toMatchObject({ ok: false, error: { code: 'kg-read-failed' } })
  })

  it('answers kg-graph-missing again after the seam disposes (the gate reads live state)', async () => {
    const api = await boot({ kgEnabled: true, kgTenant: 't1' })
    const before = await api.kg.stats(request({}))
    expect(before.result.ok).toBe(true)
    await ctx!.fiber.dispose()
    ctx = undefined
    const response = await api.kg.stats(request({}))
    expect(response.result).toMatchObject({ ok: false, error: { code: 'kg-graph-missing' } })
  })
})
