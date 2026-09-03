import { afterEach, describe, expect, it, vi } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import { CallId } from '@deepseek-ai/dsh-llm'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import type { ToolDefinition, ToolResult } from '@deepseek-ai/dsh-tools'
import KbRuntime from '@deepseek-ai/dsh-kb'
import * as KbSqlite from '@deepseek-ai/dsh-kb-sqlite'
import * as ToolKb from '../src/index.ts'
import {
  DEFAULT_KB_INGEST_TIMEOUT_MS,
  DEFAULT_KB_STATS_TIMEOUT_MS,
  DEFAULT_KB_TOOL_TIMEOUT_MS,
} from '../src/index.ts'
import { formatStatsOutput, presentStatsCall, presentStatsResult, statsValueFromResult } from '../src/stats.ts'

const signal = new AbortController().signal

const roots: string[] = []

afterEach(async () => {
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })))
})

async function mount(config: ToolKb.Config = { tenant: 'demo-food-co' }): Promise<{ ctx: Context; registered: ToolDefinition[] }> {
  const root = await mkdtemp(join(tmpdir(), 'tool-kb-'))
  roots.push(root)
  const ctx = new Context()
  await ctx.plugin(SystemPrompt)
  await ctx.plugin(ToolRuntime)
  await ctx.plugin(KbRuntime)
  await ctx.plugin(KbSqlite, { path: ':memory:' })
  const { default: LocalFileSystem } = await import('@deepseek-ai/dsh-fs-local')
  await ctx.plugin(LocalFileSystem, { cwd: root })
  const registered: ToolDefinition[] = []
  const original = ctx.tools.register.bind(ctx.tools)
  vi.spyOn(ctx.tools, 'register').mockImplementation((definition) => {
    registered.push(definition)
    return original(definition)
  })
  await ctx.plugin(ToolKb, config)
  return { ctx, registered }
}

function toolNames(tools: readonly ToolDefinition[]): string[] {
  return tools.map(tool => tool.name).filter(name => name.startsWith('kb_'))
}

const zeroUsage = { searches: 0, ingested_documents: 0, ingested_chunks: 0, embed_texts: 0, embed_tokens: 0 }

describe('stats helpers', () => {
  it('projects the seam stats and usage into the canonical value', () => {
    expect(statsValueFromResult('t1', {
      documents: 3, chunks: 12, embeddedChunks: 0, embedAvailable: false,
    }, { searches: 5, ingestedDocuments: 3, ingestedChunks: 12, embedTexts: 13, embedTokens: 0 })).toEqual({
      tenant: 't1', documents: 3, chunks: 12, embedded_chunks: 0, embed_available: false,
      usage: { searches: 5, ingested_documents: 3, ingested_chunks: 12, embed_texts: 13, embed_tokens: 0 },
    })
    expect(statsValueFromResult('t1', {
      documents: 1, chunks: 1, embeddedChunks: 1, embedAvailable: true, embedModel: 'minimax:embo-01',
    }, { searches: 0, ingestedDocuments: 0, ingestedChunks: 0, embedTexts: 0, embedTokens: 0 })).toEqual({
      tenant: 't1', documents: 1, chunks: 1, embedded_chunks: 1, embed_available: true, embed_model: 'minimax:embo-01',
      usage: zeroUsage,
    })
  })

  it('renders the coverage summary with the usage line', () => {
    const out = formatStatsOutput({
      tenant: 't1', documents: 3, chunks: 12, embedded_chunks: 0, embed_available: false,
      usage: { searches: 9, ingested_documents: 3, ingested_chunks: 12, embed_texts: 13, embed_tokens: 0 },
    })
    expect(out).toContain('3')
    expect(out).toContain('12')
    expect(out).toContain('text-only')
    expect(out).toContain('9 searches')
    expect(out).toContain('13 embed texts')
  })

  it('names the embed route when hybrid retrieval is live, with or without a model id', () => {
    const withModel = formatStatsOutput({ tenant: 't1', documents: 1, chunks: 2, embedded_chunks: 2, embed_available: true, usage: zeroUsage, embed_model: 'minimax:embo-01' })
    expect(withModel).toContain('minimax:embo-01')
    const withoutModel = formatStatsOutput({ tenant: 't1', documents: 1, chunks: 2, embedded_chunks: 2, embed_available: true, usage: zeroUsage })
    expect(withoutModel).toContain('an embed provider')
  })

  it('presents the pending and completed cards', () => {
    expect(presentStatsCall({}).card).toBe('generic')
    const result: ToolResult = { content: [{ type: 'text', text: 'ok' }], isError: false }
    expect(presentStatsResult({}, result)).toBeDefined()
    const noText: ToolResult = { content: [], isError: false }
    expect(presentStatsResult({}, noText)).toBeDefined()
  })
})

describe('kb_stats through the real seam', () => {
  it('reports counts, embed-route observability, and cumulative usage', async () => {
    const { ctx } = await mount({ tenant: 'demo-food-co' })
    await ctx.kb.ingest({
      tenantId: 'demo-food-co', sourcePath: 'a.md', docKind: 'other', content: '内容',
    })
    await ctx.kb.search({ query: '内容', tenantId: 'demo-food-co' })
    const result = await ctx.tools.execute({ signal, callId: CallId('c1'), name: 'kb_stats', arguments: {} })
    expect(result.isError).toBe(false)
    const value = result.value as {
      documents: number
      embed_available: boolean
      tenant: string
      usage: { searches: number; ingested_documents: number }
    }
    expect(value.documents).toBe(1)
    expect(value.embed_available).toBe(false)
    expect(value.tenant).toBe('demo-food-co')
    expect(value.usage.searches).toBe(1)
    expect(value.usage.ingested_documents).toBe(1)
  })
})

describe('tool-kb plugin', () => {
  it('exposes the documented timeout defaults', () => {
    expect(DEFAULT_KB_TOOL_TIMEOUT_MS).toBe(30_000)
    expect(DEFAULT_KB_INGEST_TIMEOUT_MS).toBe(300_000)
    expect(DEFAULT_KB_STATS_TIMEOUT_MS).toBe(10_000)
  })

  it('fills every Config default through schemastery and requires a tenant binding', () => {
    const resolved = ToolKb.Config({ tenant: 'demo-food-co' })
    expect(resolved.search).toBe(true)
    expect(resolved.ingest).toBe(true)
    expect(resolved.stats).toBe(true)
    expect(resolved.maxResults).toBe(8)
    expect(resolved.tenant).toBe('demo-food-co')
    expect(resolved.searchTimeoutMs).toBe(30_000)
    expect(resolved.ingestTimeoutMs).toBe(300_000)
    expect(resolved.statsTimeoutMs).toBe(10_000)
    expect(() => ToolKb.Config({} as unknown as ToolKb.Config)).toThrow(/tenant/u)
  })

  it('registers all six tools by default', async () => {
    const { registered } = await mount()
    expect(toolNames(registered).sort())
      .toEqual(['kb_graph_add', 'kb_graph_query', 'kb_ingest', 'kb_ingest_url', 'kb_search', 'kb_stats'])
  })

  it('honors per-tool enablement switches', async () => {
    const { registered } = await mount({ tenant: 'demo-food-co', search: false, stats: false })
    expect(toolNames(registered).sort()).toEqual(['kb_graph_add', 'kb_graph_query', 'kb_ingest', 'kb_ingest_url'])
    const fileOnly = await mount({ tenant: 'demo-food-co', urlIngest: false })
    expect(toolNames(fileOnly.registered).sort())
      .toEqual(['kb_graph_add', 'kb_graph_query', 'kb_ingest', 'kb_search', 'kb_stats'])
    const noGraph = await mount({ tenant: 'demo-food-co', graph: false })
    expect(toolNames(noGraph.registered).sort())
      .toEqual(['kb_ingest', 'kb_ingest_url', 'kb_search', 'kb_stats'])
  })

  it('keeps the tools visible without a store and failing at execution', async () => {
    const root = await mkdtemp(join(tmpdir(), 'tool-kb-nostore-'))
    roots.push(root)
    const ctx = new Context()
    const registered: ToolDefinition[] = []
    await ctx.plugin(SystemPrompt)
    await ctx.plugin(ToolRuntime)
    await ctx.plugin(KbRuntime)
    const { default: LocalFileSystem } = await import('@deepseek-ai/dsh-fs-local')
    await ctx.plugin(LocalFileSystem, { cwd: root })
    const original = ctx.tools.register.bind(ctx.tools)
    vi.spyOn(ctx.tools, 'register').mockImplementation((definition) => {
      registered.push(definition)
      return original(definition)
    })
    await ctx.plugin(ToolKb, { tenant: 'demo-food-co' })
    expect(toolNames(registered).sort())
      .toEqual(['kb_graph_add', 'kb_graph_query', 'kb_ingest', 'kb_ingest_url', 'kb_search', 'kb_stats'])
    const result = await ctx.tools.execute({ signal, callId: CallId('c1'), name: 'kb_stats', arguments: {} })
    expect(result.isError).toBe(true)
  })

  it('attaches the configured timeout budgets to the tool definitions', async () => {
    const { registered } = await mount({ tenant: 'demo-food-co', searchTimeoutMs: 1_234, ingestTimeoutMs: 5_678, statsTimeoutMs: 9_012 })
    const byName = new Map(registered.map(tool => [tool.name, tool]))
    expect(byName.get('kb_search')?.timeoutMs).toBe(1_234)
    expect(byName.get('kb_ingest')?.timeoutMs).toBe(5_678)
    expect(byName.get('kb_stats')?.timeoutMs).toBe(9_012)
  })

  it('declares the read-only kb tools concurrency-safe and leaves ingest exclusive', async () => {
    const { registered } = await mount()
    const byName = new Map(registered.map(tool => [tool.name, tool]))
    expect(byName.get('kb_search')?.isConcurrencySafe?.({ query: 'q' })).toBe(true)
    expect(byName.get('kb_stats')?.isConcurrencySafe?.({})).toBe(true)
    // kb_ingest writes, so it stays exclusive: no concurrency-safe declaration.
    expect(byName.get('kb_ingest')?.isConcurrencySafe?.({})).toBeUndefined()
  })
})
