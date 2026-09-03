import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import LocalFileSystem from '@deepseek-ai/dsh-fs-local'
import { CallId } from '@deepseek-ai/dsh-llm'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import type { ToolResult } from '@deepseek-ai/dsh-tools'
import KbRuntime from '@deepseek-ai/dsh-kb'
import * as KbSqlite from '@deepseek-ai/dsh-kb-sqlite'
import {
  formatSearchOutput,
  KB_SEARCH_MAX_RESULTS,
  parseSearchArgs,
  presentSearchCall,
  presentSearchResult,
  searchMetaFromResult,
  searchValueFromResult,
} from '../src/search.ts'
import { applyKbSearchTool } from '../src/search.ts'

const signal = new AbortController().signal

/** Mount the real tools registry, system prompt, kb seam, sqlite store, and local fs. */
async function mount(): Promise<{ ctx: Context; call: (name: string, args: unknown) => Promise<unknown> }> {
  const ctx = new Context()
  await ctx.plugin(SystemPrompt)
  await ctx.plugin(ToolRuntime)
  await ctx.plugin(KbRuntime)
  await ctx.plugin(KbSqlite, { path: ':memory:' })
  await ctx.plugin(LocalFileSystem, { cwd: process.cwd() })
  applyKbSearchTool(ctx, KB_SEARCH_MAX_RESULTS, 'demo-food-co', 30_000)
  let counter = 0
  const call = async (name: string, args: unknown) => {
    const result = await ctx.tools.execute({ signal, callId: CallId(`call-${++counter}`), name, arguments: args })
    if (result.isError) {
      const first = result.content[0]
      throw new Error(first?.type === 'text' ? first.text : 'tool error')
    }
    return result.value
  }
  return { ctx, call }
}

describe('parseSearchArgs', () => {
  it('accepts a bare query', () => {
    expect(parseSearchArgs({ query: '白糖价格' }, 8)).toEqual({
      query: '白糖价格',
      docKind: undefined,
      maxResults: 8,
    })
  })

  it('rejects a model-supplied tenant argument', () => {
    expect(() => parseSearchArgs({ query: 'x', tenant: 'demo-food-co' }, 8)).toThrow(/tenant/u)
  })

  it('rejects a blank query', () => {
    expect(() => parseSearchArgs({ query: '   ' }, 8)).toThrow(/query/u)
  })

  it('rejects an unknown doc_kind', () => {
    expect(() => parseSearchArgs({ query: 'x', doc_kind: 'poem' }, 8)).toThrow(/doc_kind/u)
  })

  it('accepts every known doc kind', () => {
    for (const kind of ['meeting', 'interview', 'report', 'regulation', 'profile', 'table', 'other']) {
      expect(parseSearchArgs({ query: 'x', doc_kind: kind }, 8).docKind).toBe(kind)
    }
  })

  it('clamps max_results into 1..deployment bound', () => {
    expect(parseSearchArgs({ query: 'x', max_results: 0 }, 8).maxResults).toBe(1)
    expect(parseSearchArgs({ query: 'x', max_results: 99 }, 8).maxResults).toBe(8)
    expect(parseSearchArgs({ query: 'x' }, 8).maxResults).toBe(8)
  })
})

describe('searchValueFromResult and formatSearchOutput', () => {
  const input = parseSearchArgs({ query: '成本' }, 8)
  const result = {
    mode: 'text' as const,
    results: [
      {
        chunkId: 3, docId: 1, tenantId: 't1', sourcePath: 'notes/visit.md', title: '走访纪要',
        docKind: 'meeting' as const, collectedAt: '2026-08-27', headingPath: '三、成本分析>原料成本',
        chunkIdx: 2, content: '白糖价格上行。',
      },
      {
        chunkId: 9, docId: 2, tenantId: 't1', sourcePath: 'regs/gb2760.md',
        docKind: 'regulation' as const, chunkIdx: 0, content: '食品添加剂使用应符合 GB 2760。',
      },
    ],
  }

  it('projects the seam result into the canonical tool value', () => {
    const value = searchValueFromResult(input, result)
    expect(value.query).toBe('成本')
    expect(value.mode).toBe('text')
    expect(value.truncated).toBe(false)
    expect(value.results).toHaveLength(2)
    expect(value.results[0]).toEqual({
      chunk_id: 3, doc_id: 1, tenant: 't1', source_path: 'notes/visit.md', title: '走访纪要',
      doc_kind: 'meeting', collected_at: '2026-08-27', heading_path: '三、成本分析>原料成本',
      chunk_idx: 2, content: '白糖价格上行。',
    })
  })

  it('marks a result that reached the cap as truncated', () => {
    const capped = searchValueFromResult({ ...input, maxResults: 2 }, result)
    expect(capped.truncated).toBe(true)
  })

  it('renders numbered citations with heading paths and the degraded-mode note', () => {
    const out = formatSearchOutput(searchValueFromResult(input, result))
    expect(out).toContain('[1] notes/visit.md')
    expect(out).toContain('三、成本分析>原料成本')
    expect(out).toContain('白糖价格上行。')
    expect(out).toContain('[2] regs/gb2760.md')
    expect(out).toContain('text-only')
    expect(out).toContain('[1]')
  })

  it('names the embed model in hybrid mode and omits the degraded note', () => {
    const out = formatSearchOutput(searchValueFromResult(input, {
      mode: 'hybrid',
      embedModel: 'minimax:embo-01',
      results: result.results,
    }))
    expect(out).toContain('minimax:embo-01')
    expect(out).not.toContain('text-only')
  })

  it('reports no hits explicitly', () => {
    const out = formatSearchOutput(searchValueFromResult(input, { mode: 'text', results: [] }))
    expect(out).toMatch(/no (results|hits)/iu)
  })

  it('notes truncation', () => {
    const out = formatSearchOutput(searchValueFromResult({ ...input, maxResults: 2 }, result))
    expect(out).toContain('first 2')
  })
})

describe('search presentation', () => {
  it('presents the pending call as a generic search card', () => {
    const view = presentSearchCall({ query: '成本口径' })
    expect(view.card).toBe('generic')
    expect(view.title).toBe('成本口径')
    expect(view.kind).toBe('search')
  })

  it('presents the completed call from replayed meta', () => {
    const result: ToolResult = {
      content: [], isError: false,
      meta: { query: '成本口径', mode: 'text', truncated: false, hits: 2 },
    }
    const view = presentSearchResult({ query: '成本口径' }, result)
    expect(view).toBeDefined()
    expect(view?.card).toBe('generic')
  })

  it('narrows malformed meta to undefined', () => {
    expect(searchMetaFromResult({ query: 'x', mode: 'bogus', truncated: false, hits: 1 })).toBeUndefined()
    expect(searchMetaFromResult('junk')).toBeUndefined()
    expect(searchMetaFromResult({ query: 'x', mode: 'hybrid', truncated: 'yes', hits: 1 })).toBeUndefined()
  })

  it('narrows well-formed meta', () => {
    expect(searchMetaFromResult({ query: 'x', mode: 'hybrid', truncated: true, hits: 3 })).toEqual({
      query: 'x', mode: 'hybrid', truncated: true, hits: 3,
    })
  })
})

describe('kb_search through the real seam', () => {
  it('ingests then retrieves with numbered citations in text mode', async () => {
    const { ctx, call } = await mount()
    await ctx.kb.ingest({
      tenantId: 'demo-food-co',
      sourcePath: 'notes/visit.md',
      docKind: 'meeting',
      title: '走访纪要',
      content: '# 走访\n\n## 三、成本分析\n\n白糖价格上行，采购成本逐月抬升。',
    })
    const value = await call('kb_search', { query: '白糖价格' }) as { mode: string; results: Array<{ source_path: string }> }
    expect(value.mode).toBe('text')
    expect(value.results[0]?.source_path).toBe('notes/visit.md')
  })

  it('fails with a structured error when no store is registered', async () => {
    const ctx = new Context()
    await ctx.plugin(SystemPrompt)
    await ctx.plugin(ToolRuntime)
    await ctx.plugin(KbRuntime)
    await ctx.plugin(LocalFileSystem, { cwd: process.cwd() })
    applyKbSearchTool(ctx, KB_SEARCH_MAX_RESULTS, 'demo-food-co', 30_000)
    let counter = 0
    const result = await ctx.tools.execute({ signal, callId: CallId(`call-${++counter}`), name: 'kb_search', arguments: { query: 'x' } })
    expect(result.isError).toBe(true)
  })

  it('rejects an empty query at execution time', async () => {
    const { call } = await mount()
    await expect(call('kb_search', { query: '' })).rejects.toThrow()
  })

  it('applies a doc_kind filter within the bound tenant', async () => {
    const { ctx, call } = await mount()
    await ctx.kb.ingest({ tenantId: 'demo-food-co', sourcePath: 'a.md', docKind: 'regulation', content: '食品添加剂使用标准 GB 2760 摘录。' })
    const value = await call('kb_search', { query: '食品添加剂', doc_kind: 'regulation' }) as { mode: string; results: unknown[] }
    expect(value.mode).toBe('text')
    expect(value.results.length).toBeGreaterThan(0)
    const otherKind = await call('kb_search', { query: '食品添加剂', doc_kind: 'profile' }) as { results: unknown[] }
    expect(otherKind.results).toHaveLength(0)
  })
})

describe('searchMetaFromResult', () => {
  it('accepts a well-formed meta and echoes its facts', () => {
    expect(searchMetaFromResult({ query: 'q', mode: 'hybrid', truncated: false, hits: 3 })).toEqual({
      query: 'q', mode: 'hybrid', truncated: false, hits: 3,
    })
    expect(searchMetaFromResult({ query: 'q', mode: 'text', truncated: true, hits: 0 })).toEqual({
      query: 'q', mode: 'text', truncated: true, hits: 0,
    })
  })

  it('rejects a non-object or array meta', () => {
    expect(searchMetaFromResult('nope')).toBeUndefined()
    expect(searchMetaFromResult(null)).toBeUndefined()
    expect(searchMetaFromResult([{ query: 'q' }])).toBeUndefined()
  })

  it('rejects a non-string query, an unknown mode, a non-boolean truncated, and a bad hits count', () => {
    expect(searchMetaFromResult({ query: 7, mode: 'text', truncated: false, hits: 1 })).toBeUndefined()
    expect(searchMetaFromResult({ query: 'q', mode: 'vector', truncated: false, hits: 1 })).toBeUndefined()
    expect(searchMetaFromResult({ query: 'q', mode: 'text', truncated: 'no', hits: 1 })).toBeUndefined()
    expect(searchMetaFromResult({ query: 'q', mode: 'text', truncated: false, hits: 1.5 })).toBeUndefined()
    expect(searchMetaFromResult({ query: 'q', mode: 'text', truncated: false, hits: -1 })).toBeUndefined()
  })
})
