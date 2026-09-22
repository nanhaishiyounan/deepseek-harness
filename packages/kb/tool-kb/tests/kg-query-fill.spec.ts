/**
 * The `kg_query` L1 fill-parameter layer and the `llm-complete` helper it
 * shares with kg_edit: a fake llm service feeds template fills (usable,
 * none-answered, malformed, and hop-carrying), plus the PPR two-hop walk, the
 * unresolved-seed note, the no-graph failure, and the presentation wrappers.
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
import { completeViaLlm } from '../src/index.ts'
import { presentKgQueryCall, presentKgQueryResult } from '../src/index.ts'
import type { KgQueryArgs } from '../src/index.ts'

const signal = new AbortController().signal
const NOW = '2026-09-06T12:00:00.000Z'

let counter = 0
let root: string | undefined
let ctx: Context | undefined

/** A fake llm service streaming canned chunk lists (the last repeats). */
class FakeLlm extends Service {
  private replies: readonly (readonly StreamChunk[])[]
  private call = 0
  constructor(context: Context, replies: readonly (readonly StreamChunk[])[]) {
    super(context, 'llm')
    this.replies = replies
  }
  async *stream(_options: GenerateOptions): AsyncIterable<StreamChunk> {
    const chunks = this.replies[Math.min(this.call, this.replies.length - 1)] ?? []
    this.call += 1
    yield* chunks
  }
}

/** One reply made entirely of a single text delta followed by a finish. */
function textReply(text: string): readonly StreamChunk[] {
  return [{ type: 'text-delta', index: 0, text }, { type: 'finish', reason: { kind: 'stop' } }]
}

async function call(name: string, args: unknown): Promise<{ isError: boolean; text: string; value: unknown }> {
  const result = await ctx!.tools.execute({ signal, callId: CallId(`call-${++counter}`), name, arguments: args })
  const text = result.content.find(block => block.type === 'text')
  return { isError: result.isError, text: text?.type === 'text' ? text.text : '', value: result.value }
}

/** Compose the full kb stack plus a fake llm streaming `reply` for the fill. */
async function mount(reply: readonly StreamChunk[], withGraph = true): Promise<Context> {
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
  new FakeLlm(context, [reply])
  await context.plugin(ToolKb, { tenant: 'demo-food-co' })
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
      relation: kgRelationId('contains'), confidence: 0.8,
      provenance: { sourceSystem: 'kb', sourceId: 'workspace/data/regulations/gb2760-excerpt.md', extractedAt: NOW },
      validFrom: NOW,
    },
  ])
}

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'tool-kb-kg-fill-'))
})

afterEach(async () => {
  await ctx?.fiber.dispose()
  ctx = undefined
  if (root !== undefined) await rm(root, { recursive: true, force: true })
  root = undefined
})

describe('kg_query L1 fill-parameter fallback', () => {
  it('fills an unmatched phrase from the llm answer and walks the plan', async () => {
    await mount(textReply('{"template":"pair","entity_names":["宏发食品","酱油"]}'))
    await seedFoodChain()
    const result = await call('kg_query', { phrase: '宏发食品跟酱油什么关系' })
    expect(result.isError).toBe(false)
    const value = result.value as { template: string; seeds_resolved: string[]; node_count: number; edge_count: number }
    expect(value.template).toBe('pair')
    expect(value.seeds_resolved).toEqual(['kb:test#宏发食品', 'kb:test#酱油'])
    expect(value.node_count).toBeGreaterThan(0)
    expect(value.edge_count).toBeGreaterThan(0)
  })

  it('falls back to the explicit miss when the llm answers none', async () => {
    await mount(textReply('{"template":"none"}'))
    await seedFoodChain()
    const result = await call('kg_query', { phrase: '哪款产品最畅销' })
    expect(result.isError).toBe(true)
    expect(result.text).toContain('no template matches')
  })

  it('treats answers without JSON braces or with broken JSON as unusable', async () => {
    await mount(textReply('回答里没有任何花括号'))
    await seedFoodChain()
    const noBrace = await call('kg_query', { phrase: '哪款产品最畅销' })
    expect(noBrace.isError).toBe(true)
    expect(noBrace.text).toContain('no template matches')
    await ctx!.fiber.dispose()
    await mount(textReply('前缀 {"template": 坏掉} 后缀'))
    await seedFoodChain()
    const broken = await call('kg_query', { phrase: '哪款产品最畅销' })
    expect(broken.isError).toBe(true)
    expect(broken.text).toContain('no template matches')
  })

  it('rejects entity_names that are not an array of strings', async () => {
    await mount(textReply('{"template":"pair","entity_names":"宏发食品"}'))
    await seedFoodChain()
    const notArray = await call('kg_query', { phrase: '宏发食品跟酱油什么关系' })
    expect(notArray.isError).toBe(true)
    expect(notArray.text).toContain('no template matches')
    await ctx!.fiber.dispose()
    await mount(textReply('{"template":"pair","entity_names":["宏发食品", 7]}'))
    await seedFoodChain()
    const notStrings = await call('kg_query', { phrase: '宏发食品跟酱油什么关系' })
    expect(notStrings.isError).toBe(true)
    expect(notStrings.text).toContain('no template matches')
  })

  it('rejects a fill whose template is off the whitelist', async () => {
    await mount(textReply('{"template":"drop-table","entity_names":["宏发食品"]}'))
    await seedFoodChain()
    const result = await call('kg_query', { phrase: '宏发食品最厉害的地方' })
    expect(result.isError).toBe(true)
    expect(result.text).toContain('no template matches')
  })

  it('honors an explicit hop count on the n-hop fill and defaults the rest to two', async () => {
    await mount(textReply('{"template":"n-hop","entity_names":["宏发食品"],"hops":1}'))
    await seedFoodChain()
    const one = await call('kg_query', { phrase: '宏发食品周围一整圈' })
    expect(one.isError).toBe(false)
    const oneValue = one.value as { template: string; hops: number }
    expect(oneValue.template).toBe('n-hop')
    expect(oneValue.hops).toBe(1)
    await ctx!.fiber.dispose()
    await mount(textReply('{"template":"n-hop","entity_names":["宏发食品"]}'))
    await seedFoodChain()
    const two = await call('kg_query', { phrase: '宏发食品周围一整圈' })
    expect(two.isError).toBe(false)
    const twoValue = two.value as { template: string; hops: number }
    expect(twoValue.hops).toBe(2)
  })

  it('walks a two-hop L0 phrase through the PPR neighborhood', async () => {
    await mount(textReply('[]'))
    await seedFoodChain()
    const result = await call('kg_query', { phrase: '宏发食品相关的2跳关系' })
    expect(result.isError).toBe(false)
    const value = result.value as { template: string; restated: string; hops: number; node_count: number }
    expect(value.template).toBe('n-hop')
    expect(value.hops).toBe(2)
    expect(value.restated).toContain('PPR')
    expect(value.node_count).toBeGreaterThan(0)
  })

  it('names unresolved seeds beside the resolved walk', async () => {
    await mount(textReply('[]'))
    await seedFoodChain()
    const result = await call('kg_query', { phrase: '宏发食品和张红喜的关系' })
    expect(result.isError).toBe(false)
    const value = result.value as { unresolved_note?: string; seeds_resolved: string[] }
    expect(value.seeds_resolved).toEqual(['kb:test#宏发食品'])
    expect(value.unresolved_note).toBe('unresolved seeds: 张红喜')
  })

  it('fails loud at execution when no graph service is composed', async () => {
    await mount(textReply('[]'), false)
    const result = await call('kg_query', { phrase: '宏发食品的供货链' })
    expect(result.isError).toBe(true)
    expect(result.text).toContain('no knowledge-graph service is composed')
  })
})

describe('kg_query presentation', () => {
  it('titles the pending card by the phrase with a blank fallback', () => {
    expect(presentKgQueryCall({ phrase: '宏发食品的供货链' })).toEqual({
      card: 'generic', title: 'kg_query', kind: 'search', rawInput: '宏发食品的供货链',
    })
    expect(presentKgQueryCall({ phrase: '   ' })).toMatchObject({ rawInput: 'kg_query' })
  })

  it('exposes the wrappers and the concurrency flag through the registry', async () => {
    await mount(textReply('[]'))
    await seedFoodChain()
    const tool = ctx!.tools.get('kg_query')
    expect(tool).toBeDefined()
    expect(tool?.isConcurrencySafe?.({ phrase: '宏发食品的供货链' })).toBe(true)
    expect(tool?.presentCall?.({ phrase: '宏发食品的供货链' })).toMatchObject({ card: 'generic', rawInput: '宏发食品的供货链' })
    const view = tool?.presentResult?.({ phrase: '宏发食品的供货链' }, {
      content: [], isError: false, meta: { template: 'supply-chain', hops: 2, nodes: 3 },
    })
    expect(view).toMatchObject({ content: [{ type: 'text', text: 'template supply-chain · 2 hops · 3 nodes' }] })
  })

  it('narrowly validates replayed meta for the completed card', () => {
    const args: KgQueryArgs = { phrase: '宏发食品的供货链' }
    const good: ToolResult = { content: [], isError: false, meta: { template: 'supply-chain', hops: 2, nodes: 5 } }
    expect(presentKgQueryResult(args, good)).toEqual({
      card: 'generic', title: 'kg_query', content: [{ type: 'text', text: 'template supply-chain · 2 hops · 5 nodes' }],
    })
    expect(presentKgQueryResult(args, { content: [], isError: true })).toBeUndefined()
    const cases: unknown[] = [
      'junk', null,
      { template: '', hops: 1, nodes: 1 },
      { template: 't', hops: -1, nodes: 1 },
      { template: 't', hops: 1.5, nodes: 1 },
      { template: 't', hops: 1, nodes: -2 },
      { template: 't', hops: 1, nodes: 2.5 },
    ]
    for (const meta of cases) {
      expect(presentKgQueryResult(args, { content: [], isError: false, meta: meta as never })).toBeUndefined()
    }
  })
})

describe('completeViaLlm', () => {
  it('fails loud without a composed llm service', async () => {
    const bare = new Context()
    await expect(completeViaLlm(bare, { provider: 'p', model: 'm' }, 'sys', 'user'))
      .rejects.toThrow('no llm service is composed')
  })

  it('joins the streamed text blocks into one answer', async () => {
    await mount([
      { type: 'text-delta', index: 0, text: '{"template":' },
      { type: 'text-delta', index: 0, text: '"none"}' },
      { type: 'reasoning-delta', index: 1, text: '内心思考' },
      { type: 'finish', reason: { kind: 'stop' } },
    ])
    const answer = await completeViaLlm(ctx!, { provider: 'minimax', model: 'MiniMax-M3' }, '系统提示', '用户问题')
    expect(answer).toBe('{"template":"none"}')
  })

  it('returns an empty answer when the stream carries no text block', async () => {
    await mount([{ type: 'finish', reason: { kind: 'stop' } }])
    const answer = await completeViaLlm(ctx!, { provider: 'minimax', model: 'MiniMax-M3' }, '系统提示', '用户问题')
    expect(answer).toBe('')
  })
})
