import { describe, expect, it } from 'vitest'
import { chunkMarkdown, estimateTokens } from '@deepseek-ai/dsh-kb'

describe('estimateTokens', () => {
  it('counts an empty string as zero tokens', () => {
    expect(estimateTokens('')).toBe(0)
  })

  it('counts one token per CJK character', () => {
    expect(estimateTokens('你好世界')).toBe(4)
  })

  it('counts one token per four non-CJK characters', () => {
    expect(estimateTokens('abcdefgh')).toBe(2)
  })

  it('mixes CJK and non-CJK rates in one string', () => {
    expect(estimateTokens('你好abcdefgh')).toBe(4)
  })
})

describe('chunkMarkdown', () => {
  it('returns no drafts for an empty document', () => {
    expect(chunkMarkdown('', { maxChunkTokens: 64, overlapTokens: 8 })).toEqual([])
  })

  it('returns no drafts for a document of blank lines only', () => {
    expect(chunkMarkdown('\n\n  \n', { maxChunkTokens: 64, overlapTokens: 8 })).toEqual([])
  })

  it('emits one chunk for a small heading-less document', () => {
    const drafts = chunkMarkdown('只是一段正文。', { maxChunkTokens: 64, overlapTokens: 8 })
    expect(drafts).toHaveLength(1)
    expect(drafts[0]?.content).toBe('只是一段正文。')
    expect(drafts[0]?.chunkIdx).toBe(0)
    expect(drafts[0]?.headingPath).toBeUndefined()
  })

  it('carries the heading chain of each section', () => {
    const drafts = chunkMarkdown(
      '# 三、成本分析\n\n原料成本上升。\n\n## 原料成本\n\n白糖价格走高。\n\n# 四、结论\n\n整体可控。',
      { maxChunkTokens: 64, overlapTokens: 0 },
    )
    expect(drafts.map(d => d.headingPath)).toEqual([
      '三、成本分析',
      '三、成本分析>原料成本',
      '四、结论',
    ])
    expect(drafts.map(d => d.content)).toEqual(['原料成本上升。', '白糖价格走高。', '整体可控。'])
  })

  it('keeps document-order chunk indexes across sections', () => {
    const drafts = chunkMarkdown(
      '# 一\n\n甲。乙。\n\n# 二\n\n丙。丁。',
      { maxChunkTokens: 64, overlapTokens: 0 },
    )
    expect(drafts.map(d => d.chunkIdx)).toEqual([0, 1])
  })

  it('splits an oversized section into bounded chunks', () => {
    const paragraphs = Array.from({ length: 40 }, (_, i) => `第${i}段：内容填充文本，用于撑大节体积。`)
    const drafts = chunkMarkdown(`# 大节\n\n${paragraphs.join('\n\n')}`, {
      maxChunkTokens: 32,
      overlapTokens: 0,
    })
    expect(drafts.length).toBeGreaterThan(1)
    for (const draft of drafts) {
      expect(estimateTokens(draft.content)).toBeLessThanOrEqual(32)
    }
    expect(drafts[0]?.headingPath).toBe('大节')
  })

  it('keeps a single oversized sentence as one chunk rather than dropping content', () => {
    const long = '连'.repeat(200)
    const drafts = chunkMarkdown(long, { maxChunkTokens: 16, overlapTokens: 0 })
    expect(drafts).toHaveLength(1)
    expect(drafts[0]?.content).toBe(long)
  })

  it('keeps Markdown table rows intact while splitting around them', () => {
    const filler = Array.from({ length: 12 }, (_, i) => `填充段落${i}，撑开体积用。`).join('\n\n')
    const table = [
      '| 原料 | 价格 |',
      '| --- | --- |',
      '| 白糖 | 6800 |',
      '| 面粉 | 3200 |',
    ].join('\n')
    const tableLines = new Set(table.split('\n'))
    const drafts = chunkMarkdown(`${filler}\n\n${table}\n\n${filler}`, {
      maxChunkTokens: 24,
      overlapTokens: 0,
    })
    expect(drafts.length).toBeGreaterThan(1)
    for (const draft of drafts) {
      for (const line of draft.content.split('\n')) {
        if (line.startsWith('|')) expect(tableLines.has(line)).toBe(true)
      }
    }
    const rejoined = drafts.map(d => d.content).join('\n')
    expect(rejoined).toContain('| 白糖 | 6800 |')
    expect(rejoined).toContain('| 面粉 | 3200 |')
  })

  it('repeats trailing context across adjacent chunks when overlap is configured', () => {
    const paragraphs = Array.from({ length: 30 }, (_, i) => `第${i}段内容。`)
    const drafts = chunkMarkdown(paragraphs.join('\n\n'), {
      maxChunkTokens: 20,
      overlapTokens: 6,
    })
    expect(drafts.length).toBeGreaterThan(1)
    const first = drafts[0]!.content
    const second = drafts[1]!.content
    let shared = ''
    for (let index = 0; index < first.length; index += 1) {
      const suffix = first.slice(index)
      if (second.startsWith(suffix)) {
        shared = suffix
        break
      }
    }
    expect(shared.length).toBeGreaterThan(0)
    expect(estimateTokens(shared)).toBeGreaterThanOrEqual(6)
  })

  it('recurses into an oversized paragraph beside normal ones', () => {
    const long = Array.from({ length: 40 }, (_, i) => `字${i}`).join('')
    const drafts = chunkMarkdown(`${long}\n\n短段。`, { maxChunkTokens: 8, overlapTokens: 0 })
    expect(drafts.length).toBeGreaterThan(1)
    expect(drafts.some(draft => draft.content.includes('短段'))).toBe(true)
    expect(drafts.some(draft => draft.content.includes('字0'))).toBe(true)
  })

  it('pushes the accumulated prefix before recursing into a later oversized unit', () => {
    const long = Array.from({ length: 40 }, (_, i) => `字${i}`).join('')
    const drafts = chunkMarkdown(`短段。\n\n${long}`, { maxChunkTokens: 8, overlapTokens: 0 })
    expect(drafts[0]?.content).toBe('短段。')
    expect(drafts.length).toBeGreaterThan(1)
  })

  it('splits oversized single paragraphs line by line', () => {
    const line = '连'.repeat(30)
    const drafts = chunkMarkdown(`${line}\n${line}\n${line}`, { maxChunkTokens: 8, overlapTokens: 0 })
    expect(drafts.length).toBe(3)
    for (const draft of drafts) {
      expect(draft.content).toBe(line)
    }
  })
})
