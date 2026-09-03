import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { CallId } from '@deepseek-ai/dsh-llm'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import type { ToolResult } from '@deepseek-ai/dsh-tools'
import KbRuntime from '@deepseek-ai/dsh-kb'
import * as KbSqlite from '@deepseek-ai/dsh-kb-sqlite'
import LocalFileSystem from '@deepseek-ai/dsh-fs-local'
import * as ToolKb from '../src/index.ts'
import { formatSearchOutput } from '../src/search.ts'
import { formatIngestOutput, parseIngestArgs, presentIngestCall, presentIngestResult } from '../src/ingest.ts'
import { formatStatsOutput, presentStatsCall, presentStatsResult } from '../src/stats.ts'
import { presentSearchCall, presentSearchResult } from '../src/search.ts'

const signal = new AbortController().signal

async function mount(config: ToolKb.Config = { tenant: 'demo-food-co' }): Promise<Context> {
  const ctx = new Context()
  await ctx.plugin(SystemPrompt)
  await ctx.plugin(ToolRuntime)
  await ctx.plugin(KbRuntime)
  await ctx.plugin(KbSqlite, { path: ':memory:' })
  await ctx.plugin(LocalFileSystem, { cwd: process.cwd() })
  await ctx.plugin(ToolKb, config)
  return ctx
}

function resultOf(content: Array<{ type: 'text'; text: string }>, meta?: unknown): ToolResult {
  const result: ToolResult = { content, isError: false }
  if (meta !== undefined) (result as { meta?: unknown }).meta = meta
  return result
}

describe('tool-kb presentation wrappers through the registry', () => {
  it('covers the kb_search presentCall/presentResult wrappers and their branches', async () => {
    const ctx = await mount()
    const tool = ctx.tools.get('kb_search')
    expect(tool).toBeDefined()
    // Pending card titled by the query, and the blank-query fallback title.
    expect(tool?.presentCall?.({ query: '成本口径' })).toEqual({ card: 'generic', title: '成本口径', kind: 'search', rawInput: '成本口径' })
    expect(tool?.presentCall?.({ query: '   ' })).toMatchObject({ title: 'kb_search' })
    // Completed card from well-formed meta, including the truncated suffix.
    const good = resultOf([{ type: 'text', text: 'ok' }], { query: '成本口径', mode: 'hybrid', truncated: true, hits: 3 })
    expect(tool?.presentResult?.({ query: '成本口径' }, good)).toMatchObject({ card: 'generic', title: '成本口径' })
    const truncated = tool?.presentResult?.({ query: '成本口径' }, good)
    expect(JSON.stringify(truncated)).toContain('truncated')
    // Blank call args fall back to the meta query.
    expect(tool?.presentResult?.({ query: '' }, resultOf([{ type: 'text', text: 'ok' }], { query: 'meta标题', mode: 'text', truncated: false, hits: 1 }))).toMatchObject({ title: 'meta标题' })
    // Error results and malformed meta fall back to the generic card.
    expect(tool?.presentResult?.({ query: 'x' }, { content: [], isError: true })).toBeUndefined()
    expect(tool?.presentResult?.({ query: 'x' }, resultOf([{ type: 'text', text: 'ok' }], 'junk'))).toBeUndefined()
    expect(tool?.presentResult?.({ query: 'x' }, resultOf([{ type: 'text', text: 'ok' }], { query: 'x', mode: 'hybrid', truncated: false, hits: -1 }))).toBeUndefined()
  })

  it('covers the kb_ingest presentCall/presentResult wrappers and blank-title parsing', async () => {
    const ctx = await mount()
    const tool = ctx.tools.get('kb_ingest')
    expect(tool?.presentCall?.({ path: 'a.md' })).toMatchObject({ card: 'generic', title: 'kb_ingest a.md' })
    const view = tool?.presentResult?.({ path: 'a.md' }, resultOf([{ type: 'text', text: 'stored' }]))
    expect(view).toMatchObject({ card: 'generic', title: 'kb_ingest a.md' })
    // No text content keeps the card content-free; an error result falls back.
    expect(tool?.presentResult?.({ path: 'a.md' }, { content: [], isError: false })).toMatchObject({ card: 'generic' })
    expect(tool?.presentResult?.({ path: 'a.md' }, { content: [], isError: true })).toBeUndefined()
    // A whitespace-only title parses to undefined.
    expect(parseIngestArgs({ path: 'a.md', title: '   ' }, 't').title).toBeUndefined()
  })

  it('covers the kb_stats presentCall/presentResult wrappers', async () => {
    const ctx = await mount()
    const tool = ctx.tools.get('kb_stats')
    expect(tool?.presentCall?.({})).toMatchObject({ card: 'generic', title: 'kb_stats' })
    expect(tool?.presentResult?.({}, resultOf([{ type: 'text', text: 'ok' }]))).toMatchObject({ card: 'generic' })
    expect(tool?.presentResult?.({}, { content: [], isError: true })).toBeUndefined()
  })

  it('omits kb_ingest when disabled in config', async () => {
    const ctx = await mount({ tenant: 'demo-food-co', ingest: false })
    expect(ctx.tools.get('kb_ingest')).toBeUndefined()
    expect(ctx.tools.get('kb_search')).toBeDefined()
  })
})

describe('tool-kb pure presenters and formatters (direct)', () => {
  it('presentSearchCall/SearchResult handle blank queries and hybrid-without-model output', () => {
    expect(presentSearchCall({ query: '  ' }).title).toBe('kb_search')
    expect(presentSearchResult({ query: '  ' }, resultOf([{ type: 'text', text: 'ok' }], { query: 'q', mode: 'text', truncated: false, hits: 0 }))).toMatchObject({ title: 'q' })
    // Hybrid mode without an embed identity prints neither mode note.
    const out = formatSearchOutput({ query: 'q', mode: 'hybrid', results: [], truncated: false })
    expect(out).not.toContain('hybrid mode')
    expect(out).toContain('No results found')
  })

  it('presentIngestCall/Result and formatIngestOutput stay pure', () => {
    expect(presentIngestCall({ path: 'a.md' }).title).toContain('a.md')
    expect(presentIngestResult({ path: 'a.md' }, resultOf([{ type: 'text', text: 'x' }]))).toBeDefined()
    expect(formatIngestOutput({ doc_id: 2, chunks: 1, embedded: false, path: 'a.md', tenant: 't' })).toContain('text-only')
  })

  it('presentStatsCall/Result and formatStatsOutput stay pure', () => {
    expect(presentStatsCall({}).card).toBe('generic')
    expect(presentStatsResult({}, resultOf([{ type: 'text', text: 'x' }]))).toBeDefined()
    expect(formatStatsOutput({
      tenant: 't1', documents: 1, chunks: 2, embedded_chunks: 2, embed_available: true, embed_model: 'm',
      usage: { searches: 0, ingested_documents: 0, ingested_chunks: 0, embed_texts: 0, embed_tokens: 0 },
    })).toContain('hybrid retrieval via m')
  })

  it('executes a real search whose meta round-trips through the wrapper', async () => {
    const ctx = await mount()
    await ctx.kb.ingest({ tenantId: 'demo-food-co', sourcePath: 'a.md', docKind: 'other', content: '白糖采购价格上行。' })
    const out = await ctx.tools.execute({ signal, callId: CallId('c1'), name: 'kb_search', arguments: { query: '白糖采购' } })
    const view = ctx.tools.get('kb_search')?.presentResult?.({ query: '白糖采购' }, { content: out.content, isError: out.isError, ...out.meta !== undefined ? { meta: out.meta } : {} })
    expect(view).toMatchObject({ card: 'generic', title: '白糖采购' })
  })
})

describe('kb_graph tools without the graph seam', () => {
  it('refuse graph queries and adds with the structured error', async () => {
    const ctx = await mount()
    const signal = new AbortController().signal
    const query = await ctx.tools.execute({ signal, callId: CallId('graph-absent-query'), name: 'kb_graph_query', arguments: { action: 'neighbors', entity_type: 'company', entity_id: '宏发食品' } })
    expect(query.isError).toBe(true)
    expect(query.content[0]?.type === 'text' ? query.content[0].text : '').toContain('no knowledge-graph service is composed')
    const add = await ctx.tools.execute({ signal, callId: CallId('graph-absent-add'), name: 'kb_graph_add', arguments: { triples: [{ subject_type: 'company', subject_id: 'a', predicate: 'supplies', object_type: 'company', object_id: 'b' }] } })
    expect(add.isError).toBe(true)
    expect(add.content[0]?.type === 'text' ? add.content[0].text : '').toContain('no knowledge-graph service is composed')
    await ctx.fiber.dispose()
  })
})
