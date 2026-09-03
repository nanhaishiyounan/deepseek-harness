// The workbench's pure presentation helpers: the business-language source
// label, keyword highlighting, relative time, and the ingest-failure classes.

import { describe, expect, it } from 'vitest'
import {
  documentLabelOf, highlightSegments, relativeTimeOf,
} from '../src/client/workbench/source.ts'
import { classifyIngestFailure } from '../src/client/workbench/KbIngestDialog.tsx'

describe('documentLabelOf', () => {
  it('strips directories, the extension, and dashes', () => {
    expect(documentLabelOf('workspace/data/regulations/gb2760-excerpt.md')).toBe('gb2760 excerpt')
    expect(documentLabelOf('suppliers/hongfa-food.docx')).toBe('hongfa food')
  })

  it('keeps a leading-dot file name and a match ending the content', () => {
    expect(documentLabelOf('workspace/.notes')).toBe('.notes')
    // A match that runs to the very end leaves no trailing plain segment.
    expect(highlightSegments('酱油里的山梨酸', ['山梨酸'])).toEqual([
      { text: '酱油里的', mark: false },
      { text: '山梨酸', mark: true },
    ])
    // Same-start overlapping terms: the sorted-first span wins and the covered
    // one is skipped (the merge is first-come, not longest-wins).
    expect(highlightSegments('山梨酸钾限量', ['山梨', '山梨酸钾'])).toEqual([
      { text: '山梨', mark: true },
      { text: '酸钾限量', mark: false },
    ])
  })

  it('keeps a dotless base name and an empty path as-is', () => {
    expect(documentLabelOf('workspace/README')).toBe('README')
    expect(documentLabelOf('')).toBe('')
  })
})

describe('highlightSegments', () => {
  it('marks case-insensitive term occurrences and merges overlaps', () => {
    const segments = highlightSegments('酱油中山梨酸钾的最大使用量，山梨酸以山梨酸计。', ['山梨酸'])
    expect(segments).toEqual([
      { text: '酱油中', mark: false },
      { text: '山梨酸', mark: true },
      { text: '钾的最大使用量，', mark: false },
      { text: '山梨酸', mark: true },
      { text: '以', mark: false },
      { text: '山梨酸', mark: true },
      { text: '计。', mark: false },
    ])
  })

  it('handles multiple terms, blank terms, and no matches', () => {
    expect(highlightSegments('Sorbate limit', ['sorbate'])).toEqual([
      { text: 'Sorbate', mark: true },
      { text: ' limit', mark: false },
    ])
    expect(highlightSegments('山梨酸', ['  ', ''])).toEqual([{ text: '山梨酸', mark: false }])
    expect(highlightSegments('酱油', ['防腐剂'])).toEqual([{ text: '酱油', mark: false }])
    expect(highlightSegments('', ['酱油'])).toEqual([{ text: '', mark: false }])
  })
})

describe('relativeTimeOf', () => {
  it('phrases minutes, hours, and days in the display language', () => {
    const now = Date.parse('2026-09-01T12:00:00Z')
    // numeric:'auto' phrases zero as "this minute" rather than "0 minutes".
    expect(relativeTimeOf(now - 0, now, 'zh')).toBe('此刻')
    expect(relativeTimeOf(now - 5 * 60000, now, 'zh')).toContain('5')
    expect(relativeTimeOf(now - 3 * 3600000, now, 'en')).toContain('3')
    expect(relativeTimeOf(now - 2 * 86400000, now, 'en')).toContain('2')
    // A future timestamp clamps to now rather than phrasing a negative age.
    expect(relativeTimeOf(now + 60000, now, 'zh')).toBe('此刻')
  })
})

describe('classifyIngestFailure', () => {
  it('maps transport shapes to the human-readable classes', () => {
    expect(classifyIngestFailure('path not found: workspace/x.md')).toBe('pathMissing')
    expect(classifyIngestFailure('ENOENT: no such file')).toBe('pathMissing')
    expect(classifyIngestFailure('fetch failed: unreachable host')).toBe('urlUnreachable')
    expect(classifyIngestFailure('request timeout after 30s')).toBe('urlUnreachable')
    expect(classifyIngestFailure('quota exceeded')).toBe('server')
    expect(classifyIngestFailure('kb-ingest-failed: embed provider down')).toBe('server')
  })
})
