/**
 * Structure-aware Markdown chunking for knowledge-base ingestion: split into
 * heading sections first (carrying the heading path), then recursively split
 * oversized sections on Chinese-aware separators, keeping Markdown table rows
 * intact, and merge pieces into bounded chunks with tail overlap.
 * @module @deepseek-ai/dsh-kb/chunker
 */

/** Chunking tunables (the seam's `chunkMaxTokens` / `chunkOverlapTokens` config). */
export interface ChunkerOptions {
  /** Maximum approximate tokens per chunk. */
  readonly maxChunkTokens: number
  /** Approximate tokens of trailing context repeated across adjacent chunks. */
  readonly overlapTokens: number
}

/** One chunk as produced by {@link chunkMarkdown}, before storage. */
export interface ChunkDraft {
  /** Markdown heading chain, for example `三、成本分析>原料成本`. */
  readonly headingPath?: string
  /** Document-sequence index. */
  readonly chunkIdx: number
  readonly content: string
}

const CJK = /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/u
const HEADING = /^(#{1,6})\s+(.+?)\s*#*\s*$/
const SENTENCE_SEPARATOR = /(?<=[。！？；!?;])/u

/**
 * Approximate token count: one token per CJK character, one per four
 * non-CJK characters. Exact tokenizer agreement is not a retrieval input, so
 * a stable cheap approximation is the right precision.
 * @param text - the text to measure.
 * @returns the approximate token count.
 */
export function estimateTokens(text: string): number {
  let cjk = 0
  let other = 0
  for (const character of text) {
    if (CJK.test(character)) cjk += 1
    else other += 1
  }
  return cjk + Math.ceil(other / 4)
}

/** One heading section with its resolved heading chain. */
interface Section {
  readonly headingPath: string | undefined
  readonly text: string
}

function splitSections(content: string): Section[] {
  const sections: Section[] = []
  const headingStack: Array<string | undefined> = []
  let current: { headingPath: string | undefined; lines: string[] } | undefined
  const flush = (): void => {
    if (current === undefined) return
    const text = current.lines.join('\n').trim()
    if (text.length > 0) sections.push({ headingPath: current.headingPath, text })
    current = undefined
  }
  for (const line of content.split('\n')) {
    const heading = HEADING.exec(line)
    if (heading === null) {
      current ??= { headingPath: undefined, lines: [] }
      current.lines.push(line)
      continue
    }
    flush()
    /* v8 ignore next -- the level capture group is mandatory in the heading pattern. */
    const level = (heading[1] ?? '').length
    headingStack.length = level - 1
    headingStack[level - 1] = heading[2]
    current = { headingPath: headingStack.filter(Boolean).join('>'), lines: [] }
  }
  flush()
  return sections
}

/**
 * Split one block into pieces within `budget`, descending from paragraph
 * boundaries to line boundaries to sentence boundaries; a unit that cannot
 * split further stays whole even when it alone exceeds the budget.
 */
function splitPiece(text: string, budget: number): string[] {
  if (estimateTokens(text) <= budget) return [text]
  const paragraphs = text.split(/\n\n+/u)
  if (paragraphs.length > 1) return mergeUnits(paragraphs, budget, '\n\n')
  const lines = text.split('\n')
  if (lines.length > 1) return mergeUnits(lines, budget, '\n')
  const sentences = text.split(SENTENCE_SEPARATOR).filter(sentence => sentence.length > 0)
  if (sentences.length > 1) return mergeUnits(sentences, budget, '')
  return [text]
}

/** Greedily merge same-level units into budgeted pieces, recursing into oversized units. */
function mergeUnits(units: readonly string[], budget: number, separator: string): string[] {
  const pieces: string[] = []
  let current = ''
  for (const unit of units) {
    if (estimateTokens(unit) > budget) {
      if (current.length > 0) pieces.push(current)
      current = ''
      pieces.push(...splitPiece(unit, budget))
      continue
    }
    const candidate = current.length === 0 ? unit : current + separator + unit
    if (current.length === 0 || estimateTokens(candidate) <= budget) current = candidate
    else {
      pieces.push(current)
      current = unit
    }
  }
  if (current.length > 0) pieces.push(current)
  return pieces
}

/** Trailing lines of one chunk body totaling at least `overlapTokens` tokens. */
function tailOverlap(body: string, overlapTokens: number): string {
  if (overlapTokens <= 0) return ''
  const lines = body.split('\n')
  const kept: string[] = []
  let tokens = 0
  for (const line of [...lines].reverse()) {
    kept.unshift(line)
    tokens += estimateTokens(line)
    if (tokens >= overlapTokens) break
  }
  return kept.join('\n')
}

/**
 * Chunk one Markdown document.
 * @param content - the full document text.
 * @param options - chunk budget and overlap.
 * @returns non-empty drafts in document order, each carrying its heading path.
 */
export function chunkMarkdown(content: string, options: ChunkerOptions): ChunkDraft[] {
  const drafts: ChunkDraft[] = []
  let previousTail = ''
  for (const section of splitSections(content)) {
    const pieces = splitPiece(section.text, options.maxChunkTokens)
    let currentPieces: string[] = []
    const flushChunk = (): void => {
      // splitPiece never returns an empty list for the non-empty section text
      // splitSections already guaranteed.
      const body = currentPieces.join('\n\n')
      const content_ = previousTail.length === 0
        ? body
        : `${previousTail}\n\n${body}`
      drafts.push({
        ...(section.headingPath === undefined ? {} : { headingPath: section.headingPath }),
        chunkIdx: drafts.length,
        content: content_,
      })
      previousTail = tailOverlap(body, options.overlapTokens)
      currentPieces = []
    }
    for (const piece of pieces) {
      if (currentPieces.length > 0
        && estimateTokens(`${currentPieces.join('\n\n')}\n\n${piece}`) > options.maxChunkTokens) flushChunk()
      currentPieces.push(piece)
    }
    flushChunk()
  }
  return drafts
}
