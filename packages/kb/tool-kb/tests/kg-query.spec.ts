/**
 * `kg_query` through the real registries over the real SQLite graph store:
 * the templated phrase compiles through the shared kg-nl module (the same
 * compiler apiproxy's `kg.query` RPC serves), resolves seeds by name, and
 * returns the walked subgraph as entity-aggregated YAML with the matched
 * template id; unsupported phrases and unresolved seeds fail with the
 * model-readable fallback message.
 */

import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { CallId } from '@deepseek-ai/dsh-llm'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import KbGraphRuntime, { kgNodeTypeId, kgRelationId } from '@deepseek-ai/dsh-kb-graph'
import * as KbGraphSqlite from '@deepseek-ai/dsh-kb-graph-sqlite'
import KbRuntime from '@deepseek-ai/dsh-kb'
import * as KbSqlite from '@deepseek-ai/dsh-kb-sqlite'
import LocalFileSystem from '@deepseek-ai/dsh-fs-local'
import * as ToolKb from '../src/index.ts'
import { parseKgQueryArgs } from '../src/index.ts'

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
  root = await mkdtemp(join(tmpdir(), 'tool-kb-kg-query-'))
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

describe('kg_query', () => {
  it('registers beside the kg pair by default', async () => {
    const names = ctx!.tools.schemas().map(schema => schema.name).sort()
    expect(names).toContain('kg_query')
    expect(names).toContain('kg_schema')
    expect(names).toContain('kg_subgraph')
  })

  it('stays unregistered when disabled in config', async () => {
    const scratch = root!
    await ctx!.fiber.dispose()
    const context = new Context()
    ctx = context
    await context.plugin(SystemPrompt)
    await context.plugin(ToolRuntime)
    await context.plugin(LocalFileSystem, { cwd: scratch })
    await context.plugin(KbRuntime, { storeProvider: 'kb-sqlite', embedProvider: 'kb-embed-minimax' })
    await context.plugin(KbSqlite, { path: join(scratch, 'kb.sqlite') })
    await context.plugin(KbGraphRuntime)
    await context.plugin(KbGraphSqlite, { path: ':memory:' })
    await context.plugin(ToolKb, { tenant: 'demo-food-co', kgQuery: false })
    const names = context.tools.schemas().map(schema => schema.name)
    expect(names).not.toContain('kg_query')
  })

  it('compiles the phrase and returns the walked subgraph with the template id', async () => {
    await seedFoodChain()
    const result = await call('kg_query', { phrase: '宏发食品生产的产品' })
    expect(result.isError).toBe(false)
    const value = result.value as {
      template: string
      restated: string
      hops: number
      relation_types?: string[]
      node_count: number
      seeds_resolved: string[]
    }
    expect(value.template).toBe('produces-products')
    expect(value.restated).toBe('宏发食品 · 1 hops · produces')
    expect(value.hops).toBe(1)
    expect(value.relation_types).toEqual(['produces'])
    expect(value.node_count).toBeGreaterThan(0)
    expect(value.seeds_resolved).toEqual(['kb:test#宏发食品'])
    expect(result.text).toContain('酱油')
  })

  it('fails model-readably for an unsupported phrase', async () => {
    await seedFoodChain()
    const result = await call('kg_query', { phrase: '今天天气怎么样' })
    expect(result.isError).toBe(true)
    expect(result.text).toContain('no template matches')
    expect(result.text).toContain('kg_schema + kg_subgraph')
  })

  it('fails model-readably when no seed resolves', async () => {
    await seedFoodChain()
    const result = await call('kg_query', { phrase: '不存在的公司的供货链' })
    expect(result.isError).toBe(true)
    expect(result.text).toContain('no graph entity matches any seed')
  })

  it('rejects a blank phrase and a model-supplied tenant at parse time', () => {
    expect(() => parseKgQueryArgs({ phrase: '   ' })).toThrow('phrase must state')
    expect(() => parseKgQueryArgs({ phrase: '宏发食品的供货链', tenant: 'other-co' }))
      .toThrow('tenant is bound by the deployment')
  })
})
