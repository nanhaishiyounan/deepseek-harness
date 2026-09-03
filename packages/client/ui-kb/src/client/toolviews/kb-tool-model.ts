/**
 * Pure row-model derivation for the kb_* toolview rows: the query/name
 * summaries off the call arguments, the hit count off the result's
 * presentation meta, and the numbered citation list / ingest receipt / usage
 * counters off the model-facing result text. Everything here is a pure
 * function of the frozen call slice; malformed wire material degrades to the
 * raw result text rather than an empty card.
 *
 * The result text is the wire boundary: `kb_search` renders its citations as
 * `[n] source — heading — kind — chunk` lines with two-space-indented passage
 * lines, `kb_ingest`/`kb_ingest_url` one `Ingested …` sentence, and `kb_stats`
 * one coverage sentence (packages/kb/tool-kb/src). A newer host may reword
 * them, so every extractor returns undefined on a miss and the row falls back
 * to the raw text.
 * @module @deepseek-ai/dsh-client-ui-kb/client/toolviews/kb-tool-model
 */

import type { ToolCallBlock } from '@deepseek-ai/dsh-client-runtime/client'

/** Row lifecycle derived solely from the durable call slice. */
export type KbToolRowState = 'running' | 'ok' | 'error' | 'stopped'

/** One numbered citation parsed off a `kb_search` result text. */
export interface KbCitation {
  /** The citation's 1-based number as printed in the text. */
  readonly number: number
  /** Full relative source path (identity; the row shows the business label). */
  readonly sourcePath: string
  /** Heading path when the citation line carries one. */
  readonly headingPath: string | undefined
  /** The passage lines below the citation line, newline-joined. */
  readonly passage: string
}

/** The presentation meta `kb_search` attaches to its result event. */
interface KbSearchMeta {
  readonly query: string
  readonly mode: 'hybrid' | 'text'
  readonly truncated: boolean
  readonly hits: number
}

/** One `[n] …` citation line's split fields. */
const CITATION = /^\[(\d+)\] (.+)$/u

/** One two-space-indented passage line under a citation line. */
const PASSAGE_LINE = /^ {2}(.*)$/u

/**
 * Narrow the opaque result meta into the kb_search projection; anything else
 * (missing meta, a newer host's shape) is undefined and the row counts
 * citations off the text instead.
 * @param meta - the settled result's opaque meta.
 * @returns the validated search meta, or undefined.
 */
function searchMetaOf(meta: unknown): KbSearchMeta | undefined {
  if (typeof meta !== 'object' || meta === null) return undefined
  const { query, mode, truncated, hits } = meta as Record<string, unknown>
  if (typeof query !== 'string' || query === '') return undefined
  if (mode !== 'hybrid' && mode !== 'text') return undefined
  if (typeof truncated !== 'boolean') return undefined
  if (typeof hits !== 'number' || !Number.isInteger(hits) || hits < 0) return undefined
  return { query, mode, truncated, hits }
}

/**
 * Parse the numbered citation list off a kb_search result text. Non-citation
 * lines (the mode note, the truncation note, the standing citation
 * instruction) are ignored; a text with no citation line parses to an empty
 * list and the caller falls back to the raw text.
 * @param text - the model-facing kb_search result text.
 * @returns the citations in printed order.
 */
export function parseCitations(text: string): readonly KbCitation[] {
  const citations: KbCitation[] = []
  for (const line of text.split('\n')) {
    const citation = CITATION.exec(line)
    if (citation !== null) {
      // citationLine joins [source, heading?, doc_kind, chunk idx] with
      // ' — '; the heading itself may contain the separator, so the middle
      // stays joined and only the fixed first/last-two fields peel off.
      // The `??` arms are unreachable (the regex's capture groups are
      // non-empty and split always yields a first element) but required by
      // noUncheckedIndexedAccess.
      /* v8 ignore next */
      const rest = citation[2] ?? ''
      const parts = rest.split(' — ')
      /* v8 ignore next */
      const sourcePath = parts[0] ?? rest
      const headingPath = parts.length > 3 ? parts.slice(1, -2).join(' — ') : undefined
      citations.push({ number: Number(citation[1]), sourcePath, headingPath, passage: '' })
      continue
    }
    const passage = PASSAGE_LINE.exec(line)
    const last = citations.at(-1)
    if (passage !== null && last !== undefined) {
      /* v8 ignore next -- the capture group always yields a string (possibly
         empty); the arm only satisfies noUncheckedIndexedAccess. */
      const passageText = passage[1] ?? ''
      citations[citations.length - 1] = { ...last, passage: last.passage === '' ? passageText : `${last.passage}\n${passageText}` }
    }
  }
  return citations
}

/** First physical line of a text (the collapsed error summary). */
function firstLine(text: string): string {
  const newline = text.indexOf('\n')
  return newline === -1 ? text : text.slice(0, newline)
}

/**
 * Flatten a settled result's content blocks to display text, aligned with the
 * generic Tool-row text contract (text blocks verbatim, other shapes as JSON,
 * the structured error line when the content is empty).
 * @param block - the settled result node.
 * @returns the flattened text, or null while running.
 */
export function resultTextOf(block: ToolCallBlock): string | null {
  if (!('kind' in block)) return null
  const parts: string[] = []
  for (const item of block.content) {
    parts.push(item.type === 'text' ? item.text : JSON.stringify(item, null, 2))
  }
  if (parts.length === 0 && block.error !== undefined) {
    parts.push(`${block.error.name}: ${block.error.code}`)
  }
  return parts.join('\n') || null
}

/** The raw arguments object of a call (undefined on non-JSON streaming prefixes). */
function argsOf(block: ToolCallBlock): Record<string, unknown> | undefined {
  const raw = ('kind' in block ? block.call?.argsRaw : block.argsRaw) ?? ''
  try {
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed === 'object' && parsed !== null) return parsed as Record<string, unknown>
  } catch {
    // A truncated JSON prefix mid-stream: the summary falls back to the raw text.
  }
  return undefined
}

/** The settled state off the frozen slice. */
function stateOf(block: ToolCallBlock): KbToolRowState {
  if (!('kind' in block)) return 'running'
  if (block.error?.code === 'interrupted') return 'stopped'
  return block.isError ? 'error' : 'ok'
}

/** The kb_search row model. */
export interface KbSearchRowModel {
  readonly state: KbToolRowState
  /** The query as typed (args first, the meta projection as fallback). */
  readonly query: string
  /** Citation count for the collapsed summary (meta first, parsed lines as fallback). */
  readonly hits: number
  /** The parsed citation list; empty when the text did not parse. */
  readonly citations: readonly KbCitation[]
  /** The raw result text (the expanded fallback and error summary source). */
  readonly output: string | null
  /** First line of the result text on an error row; null otherwise. */
  readonly errorSummary: string | null
}

/**
 * Derive the kb_search row model.
 * @param block - the frozen call slice.
 * @returns the row model.
 */
export function kbSearchRowModel(block: ToolCallBlock): KbSearchRowModel {
  const state = stateOf(block)
  const output = resultTextOf(block)
  const meta = 'kind' in block ? searchMetaOf(block.meta) : undefined
  const args = argsOf(block)
  const argsQuery = args?.query
  const query = typeof argsQuery === 'string' && argsQuery !== '' ? argsQuery : meta?.query ?? ''
  const citations = output === null ? [] : parseCitations(output)
  const hits = meta?.hits ?? citations.length
  return {
    state,
    query,
    hits,
    citations,
    output,
    errorSummary: state === 'error' && output !== null ? firstLine(output) : null,
  }
}

/** The file-name-or-host label of one ingest target. */
function ingestLabelOf(value: string): string {
  /* v8 ignore next -- split always yields a last element; the arm only
     satisfies noUncheckedIndexedAccess. */
  const base = value.split('/').at(-1) ?? value
  return base === '' ? value : base
}

/** The kb_ingest / kb_ingest_url row model. */
export interface KbIngestRowModel {
  readonly state: KbToolRowState
  /** File base name (kb_ingest) or link host (kb_ingest_url); the raw value when unparseable. */
  readonly name: string
  /** Stored passage count off the result sentence; undefined when it did not parse. */
  readonly chunks: number | undefined
  /** The raw result text (the expanded fallback and error summary source). */
  readonly output: string | null
  /** First line of the result text on an error row; null otherwise. */
  readonly errorSummary: string | null
}

/**
 * Derive the kb_ingest / kb_ingest_url row model.
 * @param block - the frozen call slice.
 * @param url - whether the target key is `url` (kb_ingest_url) rather than `path`.
 * @returns the row model.
 */
export function kbIngestRowModel(block: ToolCallBlock, url: boolean): KbIngestRowModel {
  const state = stateOf(block)
  const output = resultTextOf(block)
  const args = argsOf(block)
  const raw = url ? args?.url : args?.path
  let name = ''
  if (typeof raw === 'string' && raw !== '') {
    if (url) {
      name = raw
      try {
        name = new URL(raw).host
      } catch {
        // The gateway already accepted the URL; its raw form is the best label.
      }
    } else {
      name = ingestLabelOf(raw)
    }
  }
  const chunks = output?.match(/(\d+) chunks/u)?.[1]
  return {
    state,
    name,
    chunks: chunks === undefined ? undefined : Number(chunks),
    output,
    errorSummary: state === 'error' && output !== null ? firstLine(output) : null,
  }
}

/** The three business counters the kb_stats expanded body shows. */
export interface KbUsageFigures {
  readonly documents: number
  readonly searches: number
  readonly ingestedDocuments: number
}

/** The kb_stats row model. */
export interface KbStatsRowModel {
  readonly state: KbToolRowState
  /** The three business counters off the result sentence; undefined when it did not parse. */
  readonly figures: KbUsageFigures | undefined
  /** The raw result text (the expanded fallback and error summary source). */
  readonly output: string | null
  /** First line of the result text on an error row; null otherwise. */
  readonly errorSummary: string | null
}

/**
 * Derive the kb_stats row model.
 * @param block - the frozen call slice.
 * @returns the row model.
 */
export function kbStatsRowModel(block: ToolCallBlock): KbStatsRowModel {
  const state = stateOf(block)
  const output = resultTextOf(block)
  // The coverage sentence counts `12 documents,` and `35 searches,` with
  // trailing commas while the usage tail reads `9 documents ingested`, so the
  // comma-bound patterns cannot cross-match one another.
  const documents = output?.match(/(\d+) documents,/u)?.[1]
  const searches = output?.match(/(\d+) searches,/u)?.[1]
  const ingested = output?.match(/(\d+) documents ingested/u)?.[1]
  const figures = documents !== undefined && searches !== undefined && ingested !== undefined
    ? { documents: Number(documents), searches: Number(searches), ingestedDocuments: Number(ingested) }
    : undefined
  return {
    state,
    figures,
    output,
    errorSummary: state === 'error' && output !== null ? firstLine(output) : null,
  }
}
