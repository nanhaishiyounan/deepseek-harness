/**
 * `kg_edit` over the real registries and the SQLite graph store with a fake
 * LLM: planning-prompt parsing (every rejection branch), propose→apply→
 * rollback→episodes round trips (endpoint resolution incl. typed hits and
 * creation, SHACL precheck with constraint retries, contradiction retirement,
 * episode ledger and mention links), and the presentation wrappers.
 */

import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context, Service } from '@deepseek-ai/cordis'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { GenerateOptions, StreamChunk } from '@deepseek-ai/dsh-llm'
import { CallId } from '@deepseek-ai/dsh-llm'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import type { ToolResult } from '@deepseek-ai/dsh-tools'
import KbGraphRuntime, { kgNodeTypeId, kgRelationId } from '@deepseek-ai/dsh-kb-graph'
import * as KbGraphSqlite from '@deepseek-ai/dsh-kb-graph-sqlite'
import KbRuntime from '@deepseek-ai/dsh-kb'
import * as KbSqlite from '@deepseek-ai/dsh-kb-sqlite'
import LocalFileSystem from '@deepseek-ai/dsh-fs-local'
import * as ToolKb from '../src/index.ts'
import { parsePlannedOps } from '../src/index.ts'

const signal = new AbortController().signal
const NOW = '2026-09-06T12:00:00.000Z'
const VOCAB = { relationIds: ['produces', 'contains', 'supplies', 'related'], typeIds: ['company', 'product', 'additive'] }

let counter = 0
let root: string | undefined
let ctx: Context | undefined

/** A fake llm service streaming canned replies (the last repeats). */
class FakeLlm extends Service {
  private replies: readonly string[]
  private call = 0
  constructor(context: Context, replies: readonly string[]) {
    super(context, 'llm')
    this.replies = replies
  }
  async *stream(_options: GenerateOptions): AsyncIterable<StreamChunk> {
    const text = this.replies[Math.min(this.call, this.replies.length - 1)] ?? ''
    this.call += 1
    yield { type: 'text-delta', index: 0, text }
    yield { type: 'finish', reason: { kind: 'stop' } }
  }
}

async function call(name: string, args: unknown): Promise<{ isError: boolean; text: string; value: unknown }> {
  const result = await ctx!.tools.execute({ signal, callId: CallId(`call-${++counter}`), name, arguments: args })
  const text = result.content.find(block => block.type === 'text')
  return { isError: result.isError, text: text?.type === 'text' ? text.text : '', value: result.value }
}

/** Compose the full kb stack plus a fake llm streaming `replies`, with kg_edit on. */
async function mount(replies: readonly string[], withGraph = true): Promise<Context> {
  const context = new Context()
  await context.plugin(SystemPrompt)
  await context.plugin(ToolRuntime)
  await context.plugin(LocalFileSystem, { cwd: root! })
  await context.plugin(KbRuntime, { storeProvider: 'kb-sqlite', embedProvider: 'kb-embed-minimax' })
  await context.plugin(KbSqlite, { path: join(root!, 'kb.sqlite') })
  if (withGraph) {
    await context.plugin(KbGraphRuntime)
    await context.plugin(KbGraphSqlite, { path: ':memory:' })
  }
  new FakeLlm(context, replies)
  await context.plugin(ToolKb, { tenant: 'demo-food-co', kgEdit: true })
  ctx = context
  return context
}

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
      relation: kgRelationId('contains'), confidence: 0.8, fact: '每千克含 1g',
      provenance: { sourceSystem: 'kb', sourceId: 'workspace/data/regulations/gb2760-excerpt.md', extractedAt: NOW },
      validFrom: NOW,
    },
  ])
}

/** Run one propose→apply cycle with the canned LLM plan and return both results. */
async function proposeAndApply(instruction: string, _answer: string): Promise<{
  propose: { isError: boolean; text: string; value: unknown }
  apply: { isError: boolean; text: string; value: unknown }
}> {
  const propose = await call('kg_edit', { action: 'propose', instruction })
  if (propose.isError) return { propose, apply: { isError: true, text: '', value: undefined } }
  const proposalId = (propose.value as { proposal_id: string }).proposal_id
  const apply = await call('kg_edit', { action: 'apply', proposal_id: proposalId })
  return { propose, apply }
}

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'tool-kb-kg-edit-'))
})

afterEach(async () => {
  await ctx?.fiber.dispose()
  ctx = undefined
  if (root !== undefined) await rm(root, { recursive: true, force: true })
  root = undefined
})

describe('parsePlannedOps', () => {
  it('rejects answers without any JSON array/object, in both slice directions', () => {
    expect(parsePlannedOps('完全不是 JSON 的回答', VOCAB)).toEqual({ ops: [], rejected: ['answer contains no JSON array/object'] })
    // A closing bracket before the opening one leaves nothing to slice.
    expect(parsePlannedOps('前缀 }{ 后缀', VOCAB)).toEqual({ ops: [], rejected: ['answer contains no JSON array/object'] })
  })

  it('rejects a sliced payload that does not parse', () => {
    const { ops, rejected } = parsePlannedOps('答案 [{"op":}] 结束', VOCAB)
    expect(ops).toEqual([])
    expect(rejected[0]).toContain('JSON parse failed')
  })

  it('rejects non-object entries and unknown ops, arrays and single objects alike', () => {
    expect(parsePlannedOps('[42]', VOCAB)).toEqual({ ops: [], rejected: ['an entry is not an object'] })
    const single = parsePlannedOps('{"op":"teleport"}', VOCAB)
    expect(single.ops).toEqual([])
    expect(single.rejected).toEqual(['unknown op "teleport"'])
    const mixed = parsePlannedOps('[{"op":"teleport"}, 7]', VOCAB)
    expect(mixed.ops).toEqual([])
    expect(mixed.rejected).toEqual(['unknown op "teleport"', 'an entry is not an object'])
    // A bracketed payload whose only brace is missing still slices and parses.
    expect(parsePlannedOps('xx [ 1 ] yy', VOCAB)).toEqual({ ops: [], rejected: ['an entry is not an object'] })
  })

  it('validates add_edge against the closed sets and every missing-field shape', () => {
    expect(parsePlannedOps('[{"op":"add_edge"}]', VOCAB).rejected).toEqual(['add_edge misses relation/src/dst'])
    expect(parsePlannedOps('[{"op":"add_edge","relation":"produces","src":"  ","dst":"b"}]', VOCAB).rejected)
      .toEqual(['add_edge misses relation/src/dst'])
    expect(parsePlannedOps('[{"op":"add_edge","relation":"produces","src":"a","dst":""}]', VOCAB).rejected)
      .toEqual(['add_edge misses relation/src/dst'])
    expect(parsePlannedOps('[{"op":"add_edge","relation":"nope","src":"a","dst":"b"}]', VOCAB).rejected)
      .toEqual(['add_edge relation "nope" is not registered'])
    expect(parsePlannedOps('[{"op":"add_edge","relation":"produces","src":"a","dst":"b","srcType":"ghost"}]', VOCAB).rejected)
      .toEqual(['add_edge srcType "ghost" is not registered'])
    expect(parsePlannedOps('[{"op":"add_edge","relation":"produces","src":"a","dst":"b","dstType":"ghost"}]', VOCAB).rejected)
      .toEqual(['add_edge dstType "ghost" is not registered'])
  })

  it('accepts add_edge with and without endpoint types and the optional fact', () => {
    const plain = parsePlannedOps('[{"op":"add_edge","relation":"produces","src":"宏发食品","dst":"鲜酱油"}]', VOCAB)
    expect(plain.ops).toEqual([
      {
        op: 'add_edge', relation: kgRelationId('produces'),
        src: { id: '', name: '宏发食品' }, dst: { id: '', name: '鲜酱油' },
      },
    ])
    expect(plain.rejected).toEqual([])
    const typed = parsePlannedOps(
      '[{"op":"add_edge","relation":"produces","src":"宏发食品","dst":"鲜酱油","srcType":"company","dstType":"product","fact":"2026 新品"}]',
      VOCAB,
    )
    const first = typed.ops[0]
    if (first?.op !== 'add_edge') throw new Error('expected an add_edge op')
    expect(first.src).toEqual({ id: '', name: '宏发食品', type: 'company' })
    expect(first.dst).toEqual({ id: '', name: '鲜酱油', type: 'product' })
    expect(first.fact).toBe('2026 新品')
  })

  it('validates remove_edge against the closed sets and accepts it', () => {
    expect(parsePlannedOps('[{"op":"remove_edge"}]', VOCAB).rejected).toEqual(['remove_edge misses relation/src/dst'])
    expect(parsePlannedOps('[{"op":"remove_edge","relation":" ","src":"a","dst":"b"}]', VOCAB).rejected)
      .toEqual(['remove_edge relation " " is not registered'])
    expect(parsePlannedOps('[{"op":"remove_edge","relation":"nope","src":"a","dst":"b"}]', VOCAB).rejected)
      .toEqual(['remove_edge relation "nope" is not registered'])
    expect(parsePlannedOps('[{"op":"remove_edge","relation":"produces","src":"a","dst":"b","srcType":"ghost"}]', VOCAB).rejected)
      .toEqual(['remove_edge srcType "ghost" is not registered'])
    expect(parsePlannedOps('[{"op":"remove_edge","relation":"produces","src":"a","dst":"b","dstType":"ghost"}]', VOCAB).rejected)
      .toEqual(['remove_edge dstType "ghost" is not registered'])
    const ok = parsePlannedOps(
      '[{"op":"remove_edge","relation":"contains","src":"酱油","dst":"山梨酸钾","srcType":"product","dstType":"additive"}]',
      VOCAB,
    )
    expect(ok.ops).toEqual([
      {
        op: 'remove_edge', relation: kgRelationId('contains'),
        src: { id: '', name: '酱油', type: 'product' }, dst: { id: '', name: '山梨酸钾', type: 'additive' },
      },
    ])
    expect(ok.rejected).toEqual([])
  })

  it('validates set_node_props target/props shapes and accepts a plain object', () => {
    expect(parsePlannedOps('[{"op":"set_node_props","target":"  ","props":{}}]', VOCAB).rejected)
      .toEqual(['set_node_props misses target or props object'])
    expect(parsePlannedOps('[{"op":"set_node_props","target":"酱油","props":[1]}]', VOCAB).rejected)
      .toEqual(['set_node_props misses target or props object'])
    expect(parsePlannedOps('[{"op":"set_node_props","target":"酱油","props":null}]', VOCAB).rejected)
      .toEqual(['set_node_props misses target or props object'])
    const ok = parsePlannedOps('[{"op":"set_node_props","target":"酱油","props":{"等级":"特级"}}]', VOCAB)
    expect(ok.ops).toEqual([{ op: 'set_node_props', target: { id: '', name: '酱油' }, props: { 等级: '特级' } }])
    expect(ok.rejected).toEqual([])
  })
})

describe('kg_edit propose', () => {
  it('returns a diff preview with a proposal id and no rejections for a clean plan', async () => {
    await mount(['[{"op":"add_edge","relation":"produces","src":"宏发食品","dst":"鲜酱油","srcType":"company","dstType":"product"}]'])
    await seedFoodChain()
    const result = await call('kg_edit', { action: 'propose', instruction: '宏发食品生产鲜酱油' })
    expect(result.isError).toBe(false)
    const value = result.value as { status: string; proposal_id: string; diff: string; rejected?: string[] }
    expect(value.status).toContain('1 个操作')
    expect(value.proposal_id).toMatch(/^prop-/)
    expect(value.diff).toContain('新增关系')
    expect(value.diff).toContain('鲜酱油')
    expect(value.rejected).toBeUndefined()
  })

  it('carries per-op rejections beside the accepted ops', async () => {
    await mount(['[{"op":"add_edge","relation":"produces","src":"宏发食品","dst":"鲜酱油"},{"op":"teleport"}]'])
    await seedFoodChain()
    const result = await call('kg_edit', { action: 'propose', instruction: '乱改一气' })
    expect(result.isError).toBe(false)
    const value = result.value as { proposal_id: string; rejected?: string[] }
    expect(value.rejected).toEqual(['unknown op "teleport"'])
    expect(value.proposal_id).toMatch(/^prop-/)
  })

  it('fails model-readably when the plan contains no legal op', async () => {
    await mount(['完全没想好'])
    await seedFoodChain()
    const result = await call('kg_edit', { action: 'propose', instruction: '把图删了' })
    expect(result.isError).toBe(false)
    expect(result.text).toContain('规划失败')
    const value = result.value as { rejected: string[] }
    expect(value.rejected).toEqual(['answer contains no JSON array/object'])
  })

  it('rejects a blank instruction and a model-supplied tenant', async () => {
    await mount(['[]'])
    await seedFoodChain()
    const blank = await call('kg_edit', { action: 'propose', instruction: '   ' })
    expect(blank.isError).toBe(true)
    expect(blank.text).toContain('instruction is required')
    const absent = await call('kg_edit', { action: 'propose' })
    expect(absent.isError).toBe(true)
    expect(absent.text).toContain('instruction is required')
    const tenant = await call('kg_edit', { action: 'propose', instruction: 'x', tenant: 'other-co' })
    expect(tenant.isError).toBe(true)
    expect(tenant.text).toContain('tenant argument is not accepted')
  })

  it('fails loud at execution when no graph service is composed', async () => {
    await mount(['[]'], false)
    const result = await call('kg_edit', { action: 'episodes' })
    expect(result.isError).toBe(true)
    expect(result.text).toContain('no knowledge-graph service is composed')
  })

  it('rejects an unknown action', async () => {
    await mount(['[]'])
    await seedFoodChain()
    const result = await call('kg_edit', { action: 'merge' as string })
    expect(result.isError).toBe(true)
    expect(result.text).toContain('unknown action "merge"')
  })
})

describe('kg_edit apply', () => {
  it('refuses an unknown proposal id', async () => {
    await mount(['[]'])
    await seedFoodChain()
    const result = await call('kg_edit', { action: 'apply', proposal_id: 'prop-nope' })
    expect(result.isError).toBe(true)
    expect(result.text).toContain('unknown proposal_id "prop-nope"')
    const absent = await call('kg_edit', { action: 'apply' })
    expect(absent.isError).toBe(true)
    expect(absent.text).toContain('unknown proposal_id ""')
  })

  it('creates both endpoints and lands one episode with mentions for new-entity edges', async () => {
    await mount(['[{"op":"add_edge","relation":"produces","src":"新公司","dst":"鲜酱油","srcType":"company","dstType":"product"}]'])
    await seedFoodChain()
    const { apply } = await proposeAndApply('新公司生产鲜酱油', 'unused')
    expect(apply.isError).toBe(false)
    const value = apply.value as { status: string; episode_uuid: string; applied: number }
    expect(value.applied).toBe(1)
    expect(value.episode_uuid).toMatch(/^ai-edit:/)
    const graph = ctx!.get('kbGraph')!
    const edges = await graph.liveEdgesBetween('demo-food-co', 'ai-edit:新公司', 'ai-edit:鲜酱油', kgRelationId('produces'))
    expect(edges).toHaveLength(1)
    expect(edges[0]?.provenance.sourceSystem).toBe('ai-edit')
    expect(edges[0]?.fact).toBeUndefined()
    const episodes = await call('kg_edit', { action: 'episodes' })
    const rows = (episodes.value as { episodes: Array<{ uuid: string; source: string; name: string; mentions: number }> }).episodes
    expect(rows[0]?.uuid).toBe(value.episode_uuid)
    expect(rows[0]?.source).toBe('ai-edit')
    expect(rows[0]?.mentions).toBe(1)
    expect(rows[0]?.name).toBe('新公司生产鲜酱油')
  })

  it('resolves existing endpoints through typed hits and keeps the fact sentence', async () => {
    await mount(['[{"op":"add_edge","relation":"produces","src":"宏发食品","dst":"酱油","srcType":"company","dstType":"product","fact":"老牌产品"}]'])
    await seedFoodChain()
    const { apply } = await proposeAndApply('宏发食品生产酱油', 'unused')
    expect(apply.isError).toBe(false)
    const graph = ctx!.get('kbGraph')!
    const edges = await graph.liveEdgesBetween('demo-food-co', 'kb:test#宏发食品', 'kb:test#酱油', kgRelationId('produces'))
    expect(edges).toHaveLength(2)
    const edited = edges.find(edge => edge.provenance.sourceSystem === 'ai-edit')
    expect(edited?.fact).toBe('老牌产品')
  })

  it('retires a prior ai-edit edge on the same pair before the new fact lands', async () => {
    const plan = '[{"op":"add_edge","relation":"produces","src":"宏发食品","dst":"酱油","srcType":"company","dstType":"product","fact":"换代"}]'
    await mount([plan, plan])
    await seedFoodChain()
    const first = await proposeAndApply('第一代', 'unused')
    expect(first.apply.isError).toBe(false)
    const second = await proposeAndApply('第二代', 'unused')
    expect(second.apply.isError).toBe(false)
    const graph = ctx!.get('kbGraph')!
    const edges = await graph.liveEdgesBetween('demo-food-co', 'kb:test#宏发食品', 'kb:test#酱油', kgRelationId('produces'))
    expect(edges.filter(edge => edge.provenance.sourceSystem === 'ai-edit')).toHaveLength(1)
    expect(edges.find(edge => edge.provenance.sourceSystem === 'ai-edit')?.fact).toBe('换代')
  })

  it('retries a direction violation against existing nodes under the legal pair', async () => {
    // The plan mislabels 神奇粉 as a product; the graph holds an additive twin,
    // and the retry resolves the destination onto it while the created source
    // keeps its constraint-named domain type, flipping the walk legal.
    await mount(['[{"op":"add_edge","relation":"contains","src":"神秘酱","dst":"神奇粉","srcType":"product","dstType":"product","fact":"试验"}]'])
    await seedFoodChain()
    const graph = ctx!.get('kbGraph')!
    for (const [id, type] of [['kb:test#神奇粉-a', 'additive'], ['kb:test#神奇粉-p', 'product']] as const) {
      await graph.upsertNode({
        id, tenantId: 'demo-food-co', type: kgNodeTypeId(type),
        naturalKey: '神奇粉', name: '神奇粉', createdAt: NOW, updatedAt: NOW,
      })
    }
    const { apply } = await proposeAndApply('神秘酱含神奇粉', 'unused')
    expect(apply.isError).toBe(false)
    const edges = await graph.liveEdgesBetween('demo-food-co', 'ai-edit:神秘酱', 'kb:test#神奇粉-a', kgRelationId('contains'))
    expect(edges.filter(edge => edge.provenance.sourceSystem === 'ai-edit')).toHaveLength(1)
  })

  it('keeps an inferred-type created source when the retry pair names its domain', async () => {
    // supplies(Supplier→Product): 老酱 exists as a product, the source is new,
    // and the retry keeps the created Supplier entity the constraint itself names.
    await mount(['[{"op":"add_edge","relation":"supplies","src":"幽灵公司","dst":"老酱"}]'])
    await seedFoodChain()
    const graph = ctx!.get('kbGraph')!
    await graph.upsertNode({
      id: 'kb:test#老酱', tenantId: 'demo-food-co', type: kgNodeTypeId('Product'),
      naturalKey: '老酱', name: '老酱', createdAt: NOW, updatedAt: NOW,
    })
    const { apply } = await proposeAndApply('幽灵公司供应老酱', 'unused')
    expect(apply.isError).toBe(false)
    const edges = await graph.liveEdgesBetween('demo-food-co', 'ai-edit:幽灵公司', 'kb:test#老酱', kgRelationId('supplies'))
    expect(edges).toHaveLength(1)
  })

  it('rejects a direction violation no legal pair repairs and names the violations', async () => {
    await mount(['[{"op":"add_edge","relation":"supplies","src":"酱油","dst":"老酱"}]'])
    await seedFoodChain()
    const graph = ctx!.get('kbGraph')!
    await graph.upsertNode({
      id: 'kb:test#老酱', tenantId: 'demo-food-co', type: kgNodeTypeId('Product'),
      naturalKey: '老酱', name: '老酱', createdAt: NOW, updatedAt: NOW,
    })
    const { apply } = await proposeAndApply('酱油供应老酱', 'unused')
    expect(apply.isError).toBe(false)
    const value = apply.value as { status: string; applied: number; rejected?: string[] }
    expect(value.applied).toBe(0)
    expect(value.rejected?.[0]).toContain('not product→Product')
    expect(value.status).toContain('已应用 0 个操作')
  })

  it('fails loud when a missing endpoint has no legal creation type', async () => {
    // related carries no constraints, so the inferred domain is absent and the
    // ghost source cannot be created.
    await mount(['[{"op":"add_edge","relation":"related","src":"幽灵","dst":"酱油"}]'])
    await seedFoodChain()
    const { propose, apply } = await proposeAndApply('幽灵和酱油相关', 'unused')
    expect(propose.isError).toBe(false)
    expect(apply.isError).toBe(true)
    expect(apply.text).toContain('实体「幽灵」在图中不存在')
  })

  it('retires every candidate-pair edge on remove_edge and reports a miss when none is live', async () => {
    await mount([
      '[{"op":"remove_edge","relation":"contains","src":"酱油","dst":"山梨酸钾"}]',
      '[{"op":"remove_edge","relation":"contains","src":"酱油","dst":"山梨酸钾"}]',
    ])
    await seedFoodChain()
    const graph = ctx!.get('kbGraph')!
    await graph.upsertNode({
      id: 'kb:test#酱油2', tenantId: 'demo-food-co', type: kgNodeTypeId('product'),
      naturalKey: '酱油2', name: '酱油', createdAt: NOW, updatedAt: NOW,
    })
    await graph.upsertEdges([
      {
        id: 'kb:test:e3', tenantId: 'demo-food-co', srcId: 'kb:test#酱油2', dstId: 'kb:test#山梨酸钾',
        relation: kgRelationId('contains'), confidence: 0.5,
        provenance: { sourceSystem: 'kb', sourceId: 'workspace/data/regulations/extra.md', extractedAt: NOW },
        validFrom: NOW,
      },
    ])
    const hit = await proposeAndApply('去掉酱油的添加剂', 'unused')
    expect(hit.apply.isError).toBe(false)
    expect((hit.apply.value as { applied: number }).applied).toBe(1)
    expect(await graph.liveEdgesBetween('demo-food-co', 'kb:test#酱油', 'kb:test#山梨酸钾', kgRelationId('contains'))).toHaveLength(0)
    expect(await graph.liveEdgesBetween('demo-food-co', 'kb:test#酱油2', 'kb:test#山梨酸钾', kgRelationId('contains'))).toHaveLength(0)
    const miss = await proposeAndApply('再去掉一次', 'unused')
    expect(miss.apply.isError).toBe(false)
    const value = miss.apply.value as { rejected?: string[] }
    expect(value.rejected?.[0]).toContain('无在效边')
  })

  it('rejects set_node_props at apply time as unimplemented', async () => {
    await mount(['[{"op":"set_node_props","target":"酱油","props":{"等级":"特级"}}]'])
    await seedFoodChain()
    const { apply } = await proposeAndApply('酱油设为特级', 'unused')
    expect(apply.isError).toBe(false)
    const value = apply.value as { rejected?: string[] }
    expect(value.rejected).toEqual(['op set_node_props 未在 apply 实现'])
  })
})

describe('kg_edit rollback', () => {
  it('rolls back a foreign-source episode without metadata as a no-op with and without mentions', async () => {
    await mount(['[]'])
    await seedFoodChain()
    const graph = ctx!.get('kbGraph')!
    await graph.putEpisode({
      uuid: 'manual:e1', tenantId: 'demo-food-co', source: 'ingest', name: '手动导入',
      content: '全量导入', validAt: NOW, createdAt: NOW,
    })
    const untouched = await call('kg_edit', { action: 'rollback', episode_uuid: 'manual:e1' })
    expect(untouched.isError).toBe(false)
    expect((untouched.value as { applied: number }).applied).toBe(0)
    await graph.linkMentions('manual:e1', ['kb:test:e1'])
    const touched = await call('kg_edit', { action: 'rollback', episode_uuid: 'manual:e1' })
    expect(touched.isError).toBe(false)
    const value = touched.value as { status: string; applied: number }
    expect(value.applied).toBe(0)
    expect(value.status).toContain('失效 0 条边、恢复 0 条边')
    expect(await graph.edgeIdsOfEpisode((touched.value as { episode_uuid: string }).episode_uuid)).toEqual(['kb:test:e1'])
  })

  it('refuses an unknown episode and a rollback-of-rollback', async () => {
    const plan = '[{"op":"add_edge","relation":"produces","src":"宏发食品","dst":"酱油","srcType":"company","dstType":"product"}]'
    await mount([plan])
    await seedFoodChain()
    const absent = await call('kg_edit', { action: 'rollback' })
    expect(absent.isError).toBe(true)
    expect(absent.text).toContain('episode "" not found')
    const unknown = await call('kg_edit', { action: 'rollback', episode_uuid: 'ai-edit:missing' })
    expect(unknown.isError).toBe(true)
    expect(unknown.text).toContain('not found')
    const { apply } = await proposeAndApply('宏发食品生产酱油', 'unused')
    const episodeUuid = (apply.value as { episode_uuid: string }).episode_uuid
    const first = await call('kg_edit', { action: 'rollback', episode_uuid: episodeUuid })
    expect(first.isError).toBe(false)
    const rollbackUuid = (first.value as { episode_uuid: string }).episode_uuid
    expect(rollbackUuid).toMatch(/^rollback:/)
    const again = await call('kg_edit', { action: 'rollback', episode_uuid: rollbackUuid })
    expect(again.isError).toBe(true)
    expect(again.text).toContain('a rollback episode cannot be rolled back')
  })
  it('retires an added edge and lands a rollback episode, honoring the reason', async () => {
    const plan = '[{"op":"add_edge","relation":"produces","src":"宏发食品","dst":"酱油","srcType":"company","dstType":"product"}]'
    await mount([plan])
    await seedFoodChain()
    const graph = ctx!.get('kbGraph')!
    const { apply } = await proposeAndApply('宏发食品生产酱油', 'unused')
    const episodeUuid = (apply.value as { episode_uuid: string }).episode_uuid
    expect((await graph.liveEdgesBetween('demo-food-co', 'kb:test#宏发食品', 'kb:test#酱油', kgRelationId('produces')))
      .filter(edge => edge.provenance.sourceSystem === 'ai-edit')).toHaveLength(1)
    const result = await call('kg_edit', { action: 'rollback', episode_uuid: episodeUuid, reason: '录错了' })
    expect(result.isError).toBe(false)
    const value = result.value as { status: string; applied: number; episode_uuid: string }
    expect(value.applied).toBe(1)
    expect(value.status).toContain('失效 1 条边')
    expect((await graph.liveEdgesBetween('demo-food-co', 'kb:test#宏发食品', 'kb:test#酱油', kgRelationId('produces')))
      .filter(edge => edge.provenance.sourceSystem === 'ai-edit')).toHaveLength(0)
    const episodes = await call('kg_edit', { action: 'episodes' })
    const rows = (episodes.value as { episodes: Array<{ uuid: string; source: string; name: string }> }).episodes
    expect(rows[0]?.source).toBe('rollback')
    expect(rows[0]?.name).toContain('回滚')
    expect(await graph.edgeIdsOfEpisode(rows[0]!.uuid)).toHaveLength(1)
  })

  it('restores a retired edge when rolling back a remove_edge episode', async () => {
    await mount(['[{"op":"remove_edge","relation":"contains","src":"酱油","dst":"山梨酸钾"}]'])
    await seedFoodChain()
    const graph = ctx!.get('kbGraph')!
    const { apply } = await proposeAndApply('去掉酱油的添加剂', 'unused')
    const episodeUuid = (apply.value as { episode_uuid: string }).episode_uuid
    expect(await graph.liveEdgesBetween('demo-food-co', 'kb:test#酱油', 'kb:test#山梨酸钾', kgRelationId('contains'))).toHaveLength(0)
    const result = await call('kg_edit', { action: 'rollback', episode_uuid: episodeUuid })
    expect(result.isError).toBe(false)
    const value = result.value as { status: string; applied: number }
    expect(value.applied).toBe(1)
    expect(value.status).toContain('恢复 1 条边')
    expect(await graph.liveEdgesBetween('demo-food-co', 'kb:test#酱油', 'kb:test#山梨酸钾', kgRelationId('contains'))).toHaveLength(1)
  })

  it('reports an empty ledger as zero episodes', async () => {
    await mount(['[]'])
    await seedFoodChain()
    const result = await call('kg_edit', { action: 'episodes' })
    expect(result.isError).toBe(false)
    expect(result.text).toContain('0 条 episode')
  })
})

describe('kg_edit presentation', () => {
  it('renders the pending call card and the completed generic card from meta', async () => {
    await mount(['[]'])
    await seedFoodChain()
    const tool = ctx!.tools.get('kg_edit')
    expect(tool).toBeDefined()
    expect(tool?.isConcurrencySafe?.({ action: 'episodes' })).toBe(false)
    expect(tool?.presentCall?.({ action: 'propose', instruction: '加一条边' })).toEqual({
      card: 'generic', title: 'kg_edit', kind: 'edit', rawInput: 'propose 加一条边',
    })
    expect(tool?.presentCall?.({ action: 'episodes' })).toEqual({
      card: 'generic', title: 'kg_edit', kind: 'edit', rawInput: 'episodes',
    })
    const good: ToolResult = { content: [], isError: false, meta: { status: '已应用 1 个操作', applied: 1 } }
    expect(tool?.presentResult?.({ action: 'apply' }, good)).toEqual({
      card: 'generic', title: 'kg_edit', content: [{ type: 'text', text: 'apply · 已应用 1 个操作' }],
    })
    const noMeta: ToolResult = { content: [], isError: false }
    expect(tool?.presentResult?.({ action: 'rollback' }, noMeta)).toEqual({
      card: 'generic', title: 'kg_edit', content: [{ type: 'text', text: 'rollback · done' }],
    })
    expect(tool?.presentResult?.({ action: 'apply' }, { content: [], isError: true })).toBeUndefined()
  })
})
