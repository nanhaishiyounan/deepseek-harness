/**
 * `kg_schema` / `kg_subgraph` through the real registries over the real
 * SQLite graph store: ontology browsing (built-in fallback and composed
 * registry), seed resolution by name, entity-aggregated YAML serialization
 * with relation filters and truncation, and the structured refusal when the
 * seam is absent. The composition carries the kb seam too because tool-kb
 * injects it.
 */

import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { CallId } from '@deepseek-ai/dsh-llm'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import KbGraphRuntime from '@deepseek-ai/dsh-kb-graph'
import { kgNodeTypeId, kgRelationId } from '@deepseek-ai/dsh-kb-graph'
import * as KbGraphSqlite from '@deepseek-ai/dsh-kb-graph-sqlite'
import KbRuntime from '@deepseek-ai/dsh-kb'
import * as KbSqlite from '@deepseek-ai/dsh-kb-sqlite'
import LocalFileSystem from '@deepseek-ai/dsh-fs-local'
import * as ToolKb from '../src/index.ts'
import { formatKgSchemaOutput, formatKgSubgraphYaml, kgOntologyViews, presentKgCall, presentKgResult } from '../src/index.ts'
import type { KgSchemaTypeView } from '../src/index.ts'

const signal = new AbortController().signal
let counter = 0
let root: string | undefined
let ctx: Context | undefined

async function call(name: string, args: unknown): Promise<{ isError: boolean; text: string; value: unknown }> {
  const result = await ctx!.tools.execute({ signal, callId: CallId(`call-${++counter}`), name, arguments: args })
  const text = result.content.find(block => block.type === 'text')
  return { isError: result.isError, text: text?.type === 'text' ? text.text : '', value: result.value }
}

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'tool-kb-kg-'))
  const context = new Context()
  await context.plugin(SystemPrompt)
  await context.plugin(ToolRuntime)
  await context.plugin(LocalFileSystem, { cwd: root })
  await context.plugin(KbRuntime, { storeProvider: 'kb-sqlite', embedProvider: 'kb-embed-minimax' })
  await context.plugin(KbSqlite, { path: join(root, 'kb.sqlite') })
  await context.plugin(KbGraphRuntime)
  await context.plugin(KbGraphSqlite, { path: ':memory:' })
  await context.plugin(ToolKb, { tenant: 'demo-food-co' })
  ctx = context
})

afterEach(async () => {
  await ctx?.fiber.dispose()
  ctx = undefined
  if (root !== undefined) await rm(root, { recursive: true, force: true })
  root = undefined
})

const NOW = '2026-09-06T12:00:00.000Z'

/** Seed the store with the classic food chain: 宏发食品 produces 酱油 contains 山梨酸钾. */
async function seedFoodChain(): Promise<void> {
  const graph = ctx!.get('kbGraph')
  if (graph === undefined) throw new Error('kbGraph missing in test composition')
  for (const [type, name] of [['company', '宏发食品'], ['product', '酱油'], ['additive', '山梨酸钾']] as const) {
    await graph.upsertNode({
      id: `kb:test#${name}`, tenantId: 'demo-food-co', type: kgNodeTypeId(type),
      naturalKey: name, name, createdAt: NOW, updatedAt: NOW,
    })
  }
  await graph.upsertEdges([
    {
      id: 'kb:test:e1', tenantId: 'demo-food-co', srcId: 'kb:test#宏发食品', dstId: 'kb:test#酱油',
      relation: kgRelationId('produces'), confidence: 1,
      provenance: { sourceSystem: 'kb', sourceId: 'workspace/data/profiles/hongfa-food.md', extractedAt: NOW },
      validFrom: NOW,
    },
    {
      id: 'kb:test:e2', tenantId: 'demo-food-co', srcId: 'kb:test#酱油', dstId: 'kb:test#山梨酸钾',
      relation: kgRelationId('contains'), confidence: 0.8,
      provenance: { sourceSystem: 'kb', sourceId: 'workspace/data/regulations/gb2760-excerpt.md', extractedAt: NOW },
      validFrom: NOW,
    },
  ])
}

describe('kgOntologyViews and rendering', () => {
  it('projects the built-in seed when the seam is absent', () => {
    const views = kgOntologyViews(undefined)
    expect(views.types.some(type => type.id === 'company' && type.layer === 'domain')).toBe(true)
    expect(views.relations.find(relation => relation.id === 'produces')?.directions).toEqual(['company→product', 'Service→Deliverable'])
    const text = formatKgSchemaOutput({
      ontology_version: views.ontologyVersion,
      types: views.types,
      relations: views.relations,
    })
    expect(text).toContain('entity_types:')
    expect(text).toContain('- id: "company"')
    expect(text).toContain('company→product')
  })

  it('formats subgraph YAML with aggregated relations, sources, and truncation', () => {
    const yaml = formatKgSubgraphYaml({
      nodes: [
        { id: 'n1', type: kgNodeTypeId('company'), name: '宏发食品', depth: 0 },
        { id: 'n2', type: kgNodeTypeId('product'), name: '酱油', depth: 1 },
      ],
      edges: [{
        id: 'e1', tenantId: 'demo-food-co', srcId: 'n1', dstId: 'n2', relation: kgRelationId('produces'),
        confidence: 0.9, provenance: { sourceSystem: 'kb', sourceId: 'doc.md', extractedAt: NOW }, validFrom: NOW,
      }],
      truncated: true,
    })
    expect(yaml).toContain('name: "宏发食品"')
    expect(yaml).toContain('produces: "酱油"')
    expect(yaml).toContain('sources: "kb:doc.md"')
    expect(yaml).toContain('truncated: true')
    // A relation filter drops the aggregated line even when the edge exists.
    const filtered = formatKgSubgraphYaml({
      nodes: [
        { id: 'n1', type: kgNodeTypeId('company'), name: '宏发食品', depth: 0 },
        { id: 'n2', type: kgNodeTypeId('product'), name: '酱油', depth: 1 },
      ],
      edges: [{
        id: 'e1', tenantId: 'demo-food-co', srcId: 'n1', dstId: 'n2', relation: kgRelationId('produces'),
        confidence: 1, provenance: { sourceSystem: 'kb', sourceId: 'doc.md', extractedAt: NOW }, validFrom: NOW,
      }],
      truncated: false,
    }, ['other_relation'])
    expect(filtered).not.toContain('produces:')
  })

  it('projects natural keys and caps the source list', () => {
    const views = kgOntologyViews({
      listNodeTypes: () => [{
        id: kgNodeTypeId('experts'), label: '专家', layer: 'domain', extends: kgNodeTypeId('Expert'),
        props: [{ key: 'org' }], naturalKey: 'id', status: 'draft',
      }],
      listRelations: () => [],
    })
    expect(views.types[0]?.natural_key).toBe('id')
    expect(views.types[0]?.extends).toBe('Expert')
    const schemaText = formatKgSchemaOutput({
      ontology_version: views.ontologyVersion,
      types: [{ ...(views.types[0] as object), props: ['org'] } as KgSchemaTypeView],
      relations: views.relations,
    })
    expect(schemaText).toContain('| extends: Expert')
    expect(schemaText).toContain('| status: draft')
    expect(schemaText).toContain('| natural_key: id')
    expect(schemaText).toContain('| props: org')
    const edges = Array.from({ length: 21 }, (_, index) => ({
      id: `e${String(index)}`, tenantId: 'demo-food-co', srcId: 'n1', dstId: 'n1',
      relation: kgRelationId('produces'), confidence: 1,
      provenance: { sourceSystem: 'kb' as const, sourceId: `doc-${String(index)}.md`, extractedAt: NOW },
      validFrom: NOW,
    }))
    const capped = formatKgSubgraphYaml({
      nodes: [{ id: 'n1', type: kgNodeTypeId('company'), name: '宏发食品', depth: 0 }],
      edges, truncated: false,
    })
    expect(capped).toContain('+1 more')
    // Same-depth entities sort by name; an edge whose neighbor missed the
    // node cut aggregates nothing.
    const tied = formatKgSubgraphYaml({
      nodes: [
        { id: 'b', type: kgNodeTypeId('product'), name: '酱油', depth: 1 },
        { id: 'a', type: kgNodeTypeId('product'), name: '醋', depth: 1 },
        { id: 'seed', type: kgNodeTypeId('company'), name: '宏发食品', depth: 0 },
      ],
      edges: [{
        id: 'dangling', tenantId: 'demo-food-co', srcId: 'seed', dstId: 'not-in-cut',
        relation: kgRelationId('produces'), confidence: 1,
        provenance: { sourceSystem: 'kb', sourceId: 'd.md', extractedAt: NOW }, validFrom: NOW,
      }],
      truncated: false,
    })
    const names = [...tied.matchAll(/name: "([^"]+)"/gu)].map(match => match[1])
    expect(names[0]).toBe('宏发食品')
    // Same-depth ties order by locale comparison between the two products.
    expect(names.slice(1)).toEqual(['酱油', '醋'].sort((left, right) => left.localeCompare(right)))
    expect(tied).not.toContain('produces:')
  })
})

describe('kg_schema tool', () => {
  it('lists the composed registry and honors the layer filter', async () => {
    const full = await call('kg_schema', {})
    expect(full.isError).toBe(false)
    const value = full.value as { types: Array<{ id: string; layer: string }>; relations: unknown[] }
    expect(value.types.some(type => type.id === 'company')).toBe(true)
    expect(full.text).toContain('entity_types:')
    const top = await call('kg_schema', { layer: 'top' })
    const topValue = top.value as { types: Array<{ id: string }> }
    expect(topValue.types.map(type => type.id)).toEqual(['Object', 'Process', 'Event', 'Role', 'Concept'])
  })
})

describe('kg_subgraph tool', () => {
  it('resolves seeds by name and answers with the aggregated neighborhood', async () => {
    await seedFoodChain()
    const answer = await call('kg_subgraph', { seeds: ['宏发食品'], hops: 2 })
    expect(answer.isError).toBe(false)
    const value = answer.value as { yaml: string; seeds_resolved: string[]; node_count: number; edge_count: number; truncated: boolean }
    expect(value.seeds_resolved).toEqual(['kb:test#宏发食品'])
    expect(value.node_count).toBe(3)
    expect(value.edge_count).toBe(2)
    expect(value.yaml).toContain('produces: "酱油"')
    expect(value.yaml).toContain('contains: "山梨酸钾"')
    expect(value.yaml).toContain('sources: "kb:workspace/data/profiles/hongfa-food.md", "kb:workspace/data/regulations/gb2760-excerpt.md"')
    expect(answer.text).toBe(value.yaml)
  })

  it('clamps hops and nodes and applies the relation filter', async () => {
    await seedFoodChain()
    const direct = await call('kg_subgraph', { seeds: ['宏发食品'], hops: 99, max_nodes: 1, relation_types: ['produces'] })
    const value = direct.value as { node_count: number; truncated: boolean; yaml: string }
    expect(value.node_count).toBe(1)
    expect(value.truncated).toBe(true)
    expect(value.yaml).not.toContain('contains:')
  })

  it('notes unresolved seeds but answers when at least one resolves', async () => {
    await seedFoodChain()
    const answer = await call('kg_subgraph', { seeds: ['宏发食品', '不存在的实体'] })
    const value = answer.value as { unresolved_note?: string; node_count: number }
    expect(value.unresolved_note).toContain('不存在的实体')
    expect(value.node_count).toBeGreaterThan(0)
  })

  it('refuses when no seed resolves and when seeds are empty', async () => {
    await seedFoodChain()
    const none = await call('kg_subgraph', { seeds: ['完全不存在'] })
    expect(none.isError).toBe(true)
    expect(none.text).toContain('no graph entity matches any seed')
    const empty = await call('kg_subgraph', { seeds: ['  '] })
    expect(empty.isError).toBe(true)
    expect(empty.text).toContain('seeds must name at least one entity')
  })
})

describe('kg presentations and flags', () => {
  it('renders generic cards for both tools', () => {
    expect(presentKgCall({})).toMatchObject({ card: 'generic', title: 'kg_schema' })
    expect(presentKgCall({ seeds: ['张红喜'] })).toMatchObject({ card: 'generic', title: 'kg_subgraph' })
    const schemaCard = presentKgResult({ isError: false, meta: { types: 1, relations: 0 }, content: [] })
    expect(schemaCard?.title).toBe('kg_schema')
    expect(schemaCard?.content?.[0]).toMatchObject({ text: '1 types, 0 relations' })
    const subgraphCard = presentKgResult({
      isError: false, meta: { seeds: 1, hops: 2, nodeCount: 3, edgeCount: 1, truncated: false }, content: [],
    })
    expect(subgraphCard?.content?.[0]).toMatchObject({ text: '3 nodes, 1 edges' })
    expect(presentKgResult({ isError: true, meta: undefined, content: [] } as never)).toBeUndefined()
    expect(presentKgResult({ isError: false, meta: undefined, content: [] } as never)).toBeUndefined()
  })

  it('exposes the registered presentation hooks and honors disable flags', async () => {
    await seedFoodChain()
    expect(ctx!.tools.get('kg_schema')?.isConcurrencySafe?.({})).toBe(true)
    expect(ctx!.tools.get('kg_subgraph')?.isConcurrencySafe?.({ seeds: ['x'] })).toBe(true)
    const schemaTool = ctx!.tools.get('kg_schema')
    const subgraphTool = ctx!.tools.get('kg_subgraph')
    const resultOf = (meta: unknown): { content: Array<{ type: 'text'; text: string }>; isError: boolean; meta?: unknown } =>
      ({ content: [{ type: 'text', text: 'ok' }], isError: false, meta })
    expect(schemaTool?.presentCall?.({})).toMatchObject({ card: 'generic', title: 'kg_schema' })
    expect(subgraphTool?.presentCall?.({ seeds: ['宏发食品'] })).toMatchObject({ card: 'generic', title: 'kg_subgraph' })
    // Schema-invalid arguments refuse through the presentation wrapper.
    expect(subgraphTool?.presentCall?.({})).toBeUndefined()
    expect(schemaTool?.presentResult?.({}, resultOf({ types: 2, relations: 3 }) as never)?.title).toBe('kg_schema')
    const schemaOnlyTypes = schemaTool?.presentResult?.({}, resultOf({ types: 2 }) as never) as
      { content?: Array<{ text: string }> } | undefined
    expect(schemaOnlyTypes?.content?.[0]).toMatchObject({ text: '2 types, 0 relations' })
    expect(subgraphTool?.presentResult?.({ seeds: ['宏发食品'] }, resultOf({ nodeCount: 2, edgeCount: 1 }) as never)?.title).toBe('kg_subgraph')
    const truncatedView = subgraphTool?.presentResult?.({ seeds: ['宏发食品'] }, resultOf({ nodeCount: 2, truncated: true }) as never) as { content?: Array<{ text: string }> } | undefined
    expect(truncatedView?.content?.[0]).toMatchObject({ text: '2 nodes, 0 edges (truncated)' })
    expect(subgraphTool?.presentResult?.({}, resultOf({ nodeCount: 2 }) as never)).toBeUndefined()

    await ctx!.fiber.dispose()
    const off = new Context()
    await off.plugin(SystemPrompt)
    await off.plugin(ToolRuntime)
    await off.plugin(LocalFileSystem, { cwd: root ?? '.' })
    await off.plugin(KbRuntime, { storeProvider: 'kb-sqlite', embedProvider: 'kb-embed-minimax' })
    await off.plugin(KbSqlite, { path: join(root ?? '.', 'kb.sqlite') })
    await off.plugin(ToolKb, { tenant: 'demo-food-co', kgSubgraph: false, kgSchema: false })
    expect(off.tools.get('kg_schema')).toBeUndefined()
    expect(off.tools.get('kg_subgraph')).toBeUndefined()
    const partial = new Context()
    await partial.plugin(SystemPrompt)
    await partial.plugin(ToolRuntime)
    await partial.plugin(LocalFileSystem, { cwd: root ?? '.' })
    await partial.plugin(KbRuntime, { storeProvider: 'kb-sqlite', embedProvider: 'kb-embed-minimax' })
    await partial.plugin(KbSqlite, { path: join(root ?? '.', 'kb2.sqlite') })
    await partial.plugin(ToolKb, { tenant: 'demo-food-co', kgSchema: false })
    expect(partial.tools.get('kg_schema')).toBeUndefined()
    expect(partial.tools.get('kg_subgraph')).toBeDefined()
    await partial.fiber.dispose()
    const subgraphOff = new Context()
    await subgraphOff.plugin(SystemPrompt)
    await subgraphOff.plugin(ToolRuntime)
    await subgraphOff.plugin(LocalFileSystem, { cwd: root ?? '.' })
    await subgraphOff.plugin(KbRuntime, { storeProvider: 'kb-sqlite', embedProvider: 'kb-embed-minimax' })
    await subgraphOff.plugin(KbSqlite, { path: join(root ?? '.', 'kb3.sqlite') })
    await subgraphOff.plugin(ToolKb, { tenant: 'demo-food-co', kgSubgraph: false })
    expect(subgraphOff.tools.get('kg_schema')).toBeDefined()
    expect(subgraphOff.tools.get('kg_subgraph')).toBeUndefined()
    await subgraphOff.fiber.dispose()
    await off.fiber.dispose()
  })

  it('stays registered in the degraded no-store composition and fails structurally', async () => {
    await ctx!.fiber.dispose()
    const bareRoot = await mkdtemp(join(tmpdir(), 'tool-kb-kg-bare-'))
    const bare = new Context()
    await bare.plugin(SystemPrompt)
    await bare.plugin(ToolRuntime)
    await bare.plugin(LocalFileSystem, { cwd: bareRoot })
    await bare.plugin(KbRuntime, { storeProvider: 'kb-sqlite', embedProvider: 'kb-embed-minimax' })
    await bare.plugin(KbSqlite, { path: join(bareRoot, 'kb.sqlite') })
    await bare.plugin(ToolKb, { tenant: 'demo-food-co' })
    const result = await bare.tools.execute({ signal, callId: CallId('x'), name: 'kg_schema', arguments: {} })
    expect(result.isError).toBe(false)
    const subgraph = await bare.tools.execute({ signal, callId: CallId('y'), name: 'kg_subgraph', arguments: { seeds: ['宏发食品'] } })
    expect(subgraph.isError).toBe(true)
    await bare.fiber.dispose()
  })
})
