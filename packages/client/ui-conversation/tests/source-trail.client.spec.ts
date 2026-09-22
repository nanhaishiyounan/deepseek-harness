/**
 * The answer-source trail's pure derivation: every source family's extractor
 * over the documented result-text formats (kb `[n]` citation lines, the
 * lakehouse `Data source:` attribution line, the kg YAML `sources:` line, and
 * the nb args' collection), dedupe by identity, and the degrade paths (an
 * error result, a running call, a reworded line → that source simply drops).
 */

import { describe, expect, it } from 'vitest'
import type { ToolCallBlock, ToolResultNode } from '@deepseek-ai/dsh-client-runtime/client'
import {
  EMPTY_SOURCE_TRAIL, extractKbCitations, extractKgSource, extractLakehouseSources, hasSources, kbSourceLabel,
  sourceTrailOf,
} from '../src/client/chat/source-trail-model.ts'

/** Build one settled tool result with text content and raw call arguments. */
function settled(name: string, args: string, resultText: string, isError = false): ToolCallBlock {
  const node: ToolResultNode = {
    kind: 'tool-result',
    seq: 1,
    time: 0,
    callId: 'call-1',
    call: { name, argsRaw: args },
    callTime: null,
    content: [{ type: 'text', text: resultText }],
    isError,
    callView: null,
    resultView: null,
    subCalls: [],
  }
  return node
}

const KB_TEXT = [
  '检索完成。',
  '[1] export-risk/hongfa-chukou.md — 出口台账 — doc — c2',
  '  宏发食品 2026 年出口记录。',
  '[2] regulations/gb-2760.md — 限量标准 — doc — c5',
  '  苯甲酸限量条款。',
].join('\n')

const LAKEHOUSE_TEXT = [
  '| month | total |',
  '| --- | --- |',
  '| 2026-08 | 118 |',
  '',
  'Data source: lakehouse table import_export_monthly',
  'Answer from the rows above; name the source table(s) in your answer.',
].join('\n')

const KG_TEXT = ['宏发食品:', '  supplies: 酱油, 蚝油', 'sources: nocobase:12, kb:supply/hongda.md', 'truncated: false'].join('\n')

describe('extractKbCitations', () => {
  it('parses numbered citation lines with heading paths and ignores prose', () => {
    expect(extractKbCitations(KB_TEXT)).toEqual([
      { number: 1, sourcePath: 'export-risk/hongfa-chukou.md', headingPath: '出口台账' },
      { number: 2, sourcePath: 'regulations/gb-2760.md', headingPath: '限量标准' },
    ])
  })

  it('keeps a multi-separator heading joined', () => {
    expect(extractKbCitations('[3] a.md — 一级 — 二级 — doc — c1'))
      .toEqual([{ number: 3, sourcePath: 'a.md', headingPath: '一级 — 二级' }])
  })

  it('labels a citation by basename', () => {
    expect(kbSourceLabel('export-risk/hongfa-chukou.md')).toBe('hongfa-chukou.md')
  })
})

describe('extractLakehouseSources', () => {
  it('reads the attribution line and carries the sql', () => {
    expect(extractLakehouseSources(LAKEHOUSE_TEXT, { sql: 'SELECT month FROM import_export_monthly' }))
      .toEqual([{ table: 'import_export_monthly', sql: 'SELECT month FROM import_export_monthly' }])
  })

  it('splits a multi-table attribution and drops a missing line', () => {
    expect(extractLakehouseSources('Data source: lakehouse tables a, b', undefined))
      .toEqual([{ table: 'a', sql: '' }, { table: 'b', sql: '' }])
    expect(extractLakehouseSources('no attribution here', undefined)).toEqual([])
  })
})

describe('extractKgSource', () => {
  it('collects seeds from args and systems off the sources line', () => {
    expect(extractKgSource(KG_TEXT, { seeds: ['宏发食品'] }))
      .toEqual({ seeds: ['宏发食品'], systems: ['nocobase', 'kb'] })
  })

  it('accepts a kg_query phrase seed and dedupes systems', () => {
    expect(extractKgSource('sources: a:1, a:2', { phrase: '酱油的原料来自哪些供应商' }))
      .toEqual({ seeds: ['酱油的原料来自哪些供应商'], systems: ['a'] })
  })

  it('misses when neither seeds nor sources are present', () => {
    expect(extractKgSource('truncated: false', {})).toBeUndefined()
  })
})

describe('sourceTrailOf', () => {
  it('aggregates and dedupes across the four surfaces', () => {
    const trail = sourceTrailOf([
      settled('kb_search', '{"query":"宏发食品 出口"}', KB_TEXT),
      settled('kb_search', '{"query":"限量"}', KB_TEXT),
      settled('lakehouse_query', '{"sql":"SELECT 1 FROM import_export_monthly"}', LAKEHOUSE_TEXT),
      settled('nb_list', '{"collection":"experts","pageSize":20}', '3 rows'),
      settled('nb_get', '{"collection":"experts","filter":1}', '1 row'),
      settled('kg_subgraph', '{"seeds":["宏发食品"],"hops":1}', KG_TEXT),
    ])
    expect(trail.kb).toHaveLength(2)
    expect(trail.lakehouse).toEqual([{ table: 'import_export_monthly', sql: 'SELECT 1 FROM import_export_monthly' }])
    expect(trail.nocobase).toEqual([{ collection: 'experts' }])
    expect(trail.kg).toEqual([{ seeds: ['宏发食品'], systems: ['nocobase', 'kb'] }])
    expect(hasSources(trail)).toBe(true)
  })

  it('skips error results, running calls, and unknown tools', () => {
    const running = { callId: 'c', name: 'kb_search', argsRaw: '', turn: 0, step: 0, time: 0, callView: null, subCalls: [] }
    const trail = sourceTrailOf([
      settled('kb_search', '{}', 'boom', true),
      running,
      settled('echo', '{}', 'Data source: lakehouse table x'),
    ])
    expect(trail).toEqual(EMPTY_SOURCE_TRAIL)
    expect(hasSources(trail)).toBe(false)
  })
})
