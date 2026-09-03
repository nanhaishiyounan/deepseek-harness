// @vitest-environment jsdom
// The kb_* toolview rows: the render matrix over frozen call slices — running
// summaries, the kb_search citation list (numbered badges, business-language
// source lines, query-term highlight, per-citation disclosure), the ingest
// receipt, the stats figures, and the raw-text fallbacks when the wire
// material does not parse.

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import type { ToolCallBlock } from '@deepseek-ai/dsh-client-runtime/client'
import { KbToolRow } from '../src/client/toolviews/KbToolRow.tsx'
import { parseCitations } from '../src/client/toolviews/kb-tool-model.ts'
import { zh } from '../src/client/locales.ts'
import { SESSION_KIT } from './kb-fixture.client.ts'

/** The zh dictionary as the row's t (params rendered the way the runtime does). */
const t = ((key: string, params?: Record<string, string | number>) => {
  const template = zh[key as keyof typeof zh]
  if (template === undefined) return key
  return template.replaceAll(/\{(\w+)\}/g, (_, name: string) => String(params?.[name] ?? ''))
}) as never

/** A running kb_* call. */
function running(argsRaw: string): ToolCallBlock {
  return {
    callId: 'c1', name: 'kb_search', argsRaw, turn: 1, step: 1, time: 1,
    callView: null, subCalls: [],
  }
}

/** A settled kb_* result. */
function settled(options: {
  argsRaw?: string
  content?: readonly { type: 'text'; text: string }[]
  isError?: boolean
  error?: { name: string; code: string }
  meta?: unknown
}): ToolCallBlock {
  return {
    kind: 'tool-result', seq: 2, time: 2, callId: 'c1',
    call: options.argsRaw === undefined ? null : { name: 'kb_search', argsRaw: options.argsRaw },
    callTime: 1,
    content: options.content ?? [],
    isError: options.isError ?? false,
    ...options.error === undefined ? {} : { error: options.error },
    ...options.meta === undefined ? {} : { meta: options.meta },
    callView: null, resultView: null, subCalls: [],
  }
}

/** The citation-list result text exactly as the kb_search tool renders it. */
const SEARCH_OUTPUT = [
  '(text-only mode: no embed provider is available; results come from full-text search alone)',
  '[1] workspace/data/regulations/gb2760-excerpt.md — 三、调味品行业常见关注事项 — regulation — chunk 0',
  '  酱油中山梨酸钾最大使用量为 0.5 g/kg（以山梨酸计）。',
  '[2] workspace/data/suppliers/hongda-notes.md — supplier — chunk 3',
  '  宏达塑业近十二个月准时率为 96%。',
  'Cite the sources above as [n] — document name and heading path — in your answer.',
].join('\n')

function mount(toolName: string, block: ToolCallBlock): void {
  render(
    <KbToolRow
      {...SESSION_KIT}
      toolName={toolName}
      callId="c1"
      block={block}
      openFile={() => {}}
      t={t}
    />,
  )
}

afterEach(cleanup)

describe('parseCitations', () => {
  it('ignores passage lines that precede any citation', () => {
    expect(parseCitations('  孤行\n[1] docs/a.md — note — chunk 0')).toEqual([
      { number: 1, sourcePath: 'docs/a.md', headingPath: undefined, passage: '' },
    ])
  })

  it('joins multi-line passages and keeps a blank passage line as empty text', () => {
    const citations = parseCitations('[1] docs/a.md — note — chunk 0\n  第一行\n  \n  第三行')
    expect(citations[0]?.passage).toBe('第一行\n\n第三行')
  })

  it('splits citation lines into source, heading, and passage and ignores the notes', () => {
    const citations = parseCitations(SEARCH_OUTPUT)
    expect(citations).toHaveLength(2)
    expect(citations[0]).toMatchObject({
      number: 1,
      sourcePath: 'workspace/data/regulations/gb2760-excerpt.md',
      headingPath: '三、调味品行业常见关注事项',
      passage: '酱油中山梨酸钾最大使用量为 0.5 g/kg（以山梨酸计）。',
    })
    // A citation line without a heading path carries none.
    expect(citations[1]?.headingPath).toBeUndefined()
    expect(citations[1]?.passage).toBe('宏达塑业近十二个月准时率为 96%。')
  })

  it('returns an empty list for a text with no citation line', () => {
    expect(parseCitations('No results found. Try different terms.')).toEqual([])
  })
})

describe('KbToolRow kb_search', () => {
  it('shows the query alone while running', () => {
    mount('kb_search', running(JSON.stringify({ query: '山梨酸 酱油' })))
    expect(screen.getByText(zh['tool.searchTitle'])).toBeTruthy()
    expect(screen.getByText('山梨酸 酱油')).toBeTruthy()
    // Nothing to expand while the call is in flight.
    expect(screen.getByRole('button', { name: new RegExp(zh['tool.searchTitle']) })).toHaveProperty('disabled', true)
  })

  it('renders the numbered sources with highlight and disclosure after settling', () => {
    mount('kb_search', settled({
      argsRaw: JSON.stringify({ query: '山梨酸 酱油' }),
      content: [{ type: 'text', text: SEARCH_OUTPUT }],
      meta: { query: '山梨酸 酱油', mode: 'text', truncated: false, hits: 2 },
    }))
    // Collapsed summary: query + meta hit count.
    expect(screen.getByText(`山梨酸 酱油 · ${zh['tool.sourcesUnit'].replaceAll('{n}', '2')}`)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: new RegExp(zh['tool.searchTitle']) }))
    // Business-language source lines: label — heading, no doc_kind or chunk.
    expect(screen.getByText('[1]')).toBeTruthy()
    expect(screen.getByText(/gb2760 excerpt — 三、调味品行业常见关注事项/u)).toBeTruthy()
    expect(screen.getByText('[2]')).toBeTruthy()
    // Every occurrence of the query term renders as a marked match.
    expect(screen.getAllByText('山梨酸').map(element => element.tagName)).toEqual(['MARK', 'MARK'])
    // Per-citation disclosure expands the clamped passage.
    fireEvent.click(screen.getAllByText(zh['result.expand'])[0]!)
    expect(screen.getByText(/0.5 g\/kg/u)).toBeTruthy()
    // And collapses back.
    fireEvent.click(screen.getAllByText(zh['result.collapse'])[0]!)
    expect(screen.getAllByText(zh['result.expand']).length).toBeGreaterThan(0)
  })

  it('counts citations off the text when the meta projection is missing', () => {
    mount('kb_search', settled({
      argsRaw: JSON.stringify({ query: '准时率' }),
      content: [{ type: 'text', text: SEARCH_OUTPUT }],
    }))
    expect(screen.getByText(`准时率 · ${zh['tool.sourcesUnit'].replaceAll('{n}', '2')}`)).toBeTruthy()
  })

  it('falls back to the raw result text when nothing parses', () => {
    mount('kb_search', settled({
      argsRaw: JSON.stringify({ query: '无结果' }),
      content: [{ type: 'text', text: 'No results found. Try different terms.' }],
    }))
    fireEvent.click(screen.getByRole('button', { name: new RegExp(zh['tool.searchTitle']) }))
    expect(screen.getByText(/No results found/u)).toBeTruthy()
  })

  it('shows the result first line on an error row', () => {
    mount('kb_search', settled({
      argsRaw: JSON.stringify({ query: '失败' }),
      content: [{ type: 'text', text: 'kb_search: gateway unreachable\ndetail' }],
      isError: true,
      error: { name: 'ToolError', code: 'EIO' },
    }))
    expect(screen.getByText('kb_search: gateway unreachable')).toBeTruthy()
  })

  it('derives the summary from the structured error line when the content is empty', () => {
    mount('kb_search', settled({
      argsRaw: JSON.stringify({ query: '中断' }),
      content: [],
      isError: true,
      error: { name: 'ToolError', code: 'EIO' },
    }))
    expect(screen.getByText('ToolError: EIO')).toBeTruthy()
  })

  it('keeps an interrupted call expandable with its raw result', () => {
    mount('kb_search', settled({
      argsRaw: JSON.stringify({ query: '已中断' }),
      content: [{ type: 'text', text: '[1] partial.md — note — chunk 0\n  部分结果。' }],
      error: { name: 'ToolError', code: 'interrupted' },
    }))
    fireEvent.click(screen.getByRole('button', { name: new RegExp(zh['tool.searchTitle']) }))
    expect(screen.getByText(/partial\.md/u)).toBeTruthy()
  })
})

describe('KbToolRow kb_ingest and kb_ingest_url', () => {
  const INGEST_OUTPUT = 'Ingested workspace/data/regulations/gb2760-excerpt.md into tenant "default": document 7, 5 chunks, stored text-only (no embed provider available). Re-ingesting the same path replaces the prior document.'

  it('summarizes by file name and reports the receipt', () => {
    mount('kb_ingest', settled({
      argsRaw: JSON.stringify({ path: 'workspace/data/regulations/gb2760-excerpt.md' }),
      content: [{ type: 'text', text: INGEST_OUTPUT }],
    }))
    expect(screen.getByText(zh['tool.ingestTitle'])).toBeTruthy()
    expect(screen.getByText('gb2760-excerpt.md')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: new RegExp(zh['tool.ingestTitle']) }))
    expect(screen.getByText(zh['ingest.done'].replaceAll('{name}', 'gb2760-excerpt.md').replaceAll('{chunks}', '5'))).toBeTruthy()
  })

  it('summarizes a URL ingest by its host', () => {
    mount('kb_ingest_url', settled({
      argsRaw: JSON.stringify({ url: 'https://example.com/report' }),
      content: [{ type: 'text', text: 'Ingested https://example.com/report into tenant "default": document 8, 2 chunks, embedded via m.' }],
    }))
    expect(screen.getByText(zh['tool.ingestUrlTitle'])).toBeTruthy()
    expect(screen.getByText('example.com')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: new RegExp(zh['tool.ingestUrlTitle']) }))
    expect(screen.getByText(zh['ingest.done'].replaceAll('{name}', 'example.com').replaceAll('{chunks}', '2'))).toBeTruthy()
  })

  it('falls back to the raw text when the chunk count does not parse', () => {
    mount('kb_ingest', settled({
      argsRaw: JSON.stringify({ path: 'docs/notes.md' }),
      content: [{ type: 'text', text: 'Ingested docs/notes.md (reworded receipt).' }],
    }))
    fireEvent.click(screen.getByRole('button', { name: new RegExp(zh['tool.ingestTitle']) }))
    expect(screen.getByText(/reworded receipt/u)).toBeTruthy()
  })

  it('shows the title alone while running without arguments', () => {
    mount('kb_ingest_url', running('{"ur'))
    // The collapsed line repeats the title as its summary (title + summary spans).
    expect(screen.getAllByText(zh['tool.ingestUrlTitle'])).toHaveLength(2)
  })

  it('labels a bare root path by its raw form and an output-less error by its summary', () => {
    // A path of just the separator splits into empty segments; the raw value
    // stays the label.
    mount('kb_ingest', settled({
      argsRaw: JSON.stringify({ path: '/' }),
      content: [{ type: 'text', text: INGEST_OUTPUT }],
    }))
    expect(screen.getByText('/')).toBeTruthy()
    cleanup()
    // An error row with neither content nor a structured error has no output:
    // the derived summary (the query) stays visible.
    mount('kb_search', settled({
      argsRaw: JSON.stringify({ query: '静默失败' }),
      content: [],
      isError: true,
    }))
    expect(screen.getByText(/静默失败/u)).toBeTruthy()
  })

  it('shows the result first line on an ingest error row', () => {
    mount('kb_ingest', settled({
      argsRaw: JSON.stringify({ path: 'docs/missing.md' }),
      content: [{ type: 'text', text: 'kb_ingest: ENOENT no such file\nstack' }],
      isError: true,
      error: { name: 'ToolError', code: 'ENOENT' },
    }))
    expect(screen.getByText('kb_ingest: ENOENT no such file')).toBeTruthy()
  })

  it('falls back to the title when the settled args carry no target key', () => {
    mount('kb_ingest', settled({
      argsRaw: JSON.stringify({ doc_kind: 'regulation' }),
      content: [{ type: 'text', text: INGEST_OUTPUT }],
    }))
    expect(screen.getAllByText(zh['tool.ingestTitle'])).toHaveLength(2)
  })

  it('shows the title summary on a settled call whose call head fell out of the window', () => {
    mount('kb_ingest', settled({
      content: [{ type: 'text', text: INGEST_OUTPUT }],
    }))
    expect(screen.getAllByText(zh['tool.ingestTitle'])).toHaveLength(2)
    fireEvent.click(screen.getByRole('button', { name: new RegExp(zh['tool.ingestTitle']) }))
    expect(screen.getByText(zh['ingest.done'].replaceAll('{name}', '').replaceAll('{chunks}', '5'))).toBeTruthy()
  })
})

describe('KbToolRow kb_stats', () => {
  const STATS_OUTPUT = 'Knowledge base for tenant "default": 12 documents, 40 chunks (0 embedded), text-only retrieval (no embed provider available). Cumulative usage: 35 searches, 9 documents ingested (40 chunks), 0 embed texts.'

  it('renders the three business counters', () => {
    mount('kb_stats', settled({ content: [{ type: 'text', text: STATS_OUTPUT }] }))
    expect(screen.getAllByText(zh['tool.statsTitle'])).toHaveLength(2)
    fireEvent.click(screen.getByRole('button', { name: new RegExp(zh['tool.statsTitle']) }))
    expect(screen.getByText('35')).toBeTruthy()
    expect(screen.getByText('9')).toBeTruthy()
    expect(screen.getByText('12')).toBeTruthy()
    expect(screen.getByText(zh['usage.searches'])).toBeTruthy()
    expect(screen.getByText(zh['usage.ingested'])).toBeTruthy()
    expect(screen.getByText(zh['usage.documents'])).toBeTruthy()
  })

  it('shows the result first line on a stats error row', () => {
    mount('kb_stats', settled({
      content: [{ type: 'text', text: 'kb_stats: tenant quota exceeded\nlater' }],
      isError: true,
      error: { name: 'ToolError', code: 'EIO' },
    }))
    expect(screen.getByText('kb_stats: tenant quota exceeded')).toBeTruthy()
  })

  it('falls back to the raw text when the counters do not parse', () => {
    mount('kb_stats', settled({ content: [{ type: 'text', text: 'Knowledge base: reworded.' }] }))
    fireEvent.click(screen.getByRole('button', { name: new RegExp(zh['tool.statsTitle']) }))
    expect(screen.getByText(/reworded/u)).toBeTruthy()
  })

  it('falls back to the title summary when neither args nor meta carry a query', () => {
    mount('kb_search', settled({
      content: [{ type: 'text', text: SEARCH_OUTPUT }],
    }))
    // No args (call head null) and no meta: the summary is the title plus the
    // citations counted off the text.
    expect(screen.getAllByText(zh['tool.searchTitle'])).toHaveLength(2)
  })

  it('rejects a malformed meta projection and counts citations off the text instead', () => {
    const malformed: unknown[] = [
      { query: 1, mode: 'text', truncated: false, hits: 2 },
      { query: 'q', mode: 'semantic', truncated: false, hits: 2 },
      { query: 'q', mode: 'text', truncated: 1, hits: 2 },
      { query: 'q', mode: 'text', truncated: false, hits: -1 },
      { query: '', mode: 'text', truncated: false, hits: 2 },
    ]
    for (const meta of malformed) {
      cleanup()
      mount('kb_search', settled({
        argsRaw: JSON.stringify({ query: '山梨酸' }),
        content: [{ type: 'text', text: SEARCH_OUTPUT }],
        meta,
      }))
      expect(screen.getByText(`山梨酸 · ${zh['tool.sourcesUnit'].replaceAll('{n}', '2')}`)).toBeTruthy()
    }
  })

  it('flattens a non-text result block as JSON', () => {
    mount('kb_search', settled({
      argsRaw: JSON.stringify({ query: '附件' }),
      content: [{ type: 'image' } as never],
    }))
    fireEvent.click(screen.getByRole('button', { name: new RegExp(zh['tool.searchTitle']) }))
    expect(screen.getByText(/"type": "image"/u)).toBeTruthy()
  })

  it('keeps a settled call with empty content unexpandable', () => {
    mount('kb_stats', settled({ content: [] }))
    expect(screen.getByRole('button', { name: new RegExp(zh['tool.statsTitle']) })).toHaveProperty('disabled', true)
  })

  it('keeps the row collapsed-only while running', () => {
    mount('kb_stats', running('{}'))
    expect(screen.getAllByText(zh['tool.statsTitle'])).toHaveLength(2)
    expect(screen.getByRole('button', { name: new RegExp(zh['tool.statsTitle']) })).toHaveProperty('disabled', true)
  })
})
