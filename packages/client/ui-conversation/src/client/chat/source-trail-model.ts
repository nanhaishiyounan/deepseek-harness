/**
 * Pure derivation of one turn's answer-source trail: the settled tool calls
 * the turn's closing answer rests on, reduced to per-surface source lists
 * (kb document citations, lakehouse tables, NocoBase collections, knowledge-
 * graph seeds with their provenance systems). Extraction reads the frozen
 * call slice only — the model-facing result texts and the raw argument JSON
 * — and each extractor degrades to nothing on a miss, so a newer host that
 * rewords a result line simply drops that source instead of breaking the
 * card. Wire line formats are the tool packages' documented outputs:
 * `[n] source — heading…` citation lines (tool-kb), the `Data source:
 * lakehouse table(s) …` attribution line (tool-lakehouse), and the
 * entity-aggregated YAML's `sources:` line (tool-kb kg).
 * @module @deepseek-ai/dsh-client-ui-conversation/client/chat/source-trail-model
 */

import type { ToolCallBlock, ToolResultNode } from '@deepseek-ai/dsh-client-runtime/client'

/** One kb document citation (the `[n]` lines of a `kb_search` result). */
export interface KbSourceItem {
  /** The citation's 1-based number as printed in the result text. */
  readonly number: number
  /** Full relative source path (identity; the chip shows its basename). */
  readonly sourcePath: string
  /** Heading path when the citation line carries one. */
  readonly headingPath: string | undefined
}

/** One lakehouse table a `lakehouse_query` statement attributed itself to. */
export interface LakehouseSourceItem {
  readonly table: string
  /** The SQL statement (the expanded row's disclosure). */
  readonly sql: string
}

/** One NocoBase collection a `nb_list`/`nb_get` call read. */
export interface NocobaseSourceItem {
  readonly collection: string
}

/** One knowledge-graph read (kg_subgraph or kg_query). */
export interface KgSourceItem {
  /** Seeds the walk started from (kg_query contributes its phrase). */
  readonly seeds: readonly string[]
  /** Provenance systems off the result's `sources:` line (asserted-by set). */
  readonly systems: readonly string[]
}

/** The aggregated trail one closing answer renders. */
export interface SourceTrailModel {
  readonly kb: readonly KbSourceItem[]
  readonly lakehouse: readonly LakehouseSourceItem[]
  readonly nocobase: readonly NocobaseSourceItem[]
  readonly kg: readonly KgSourceItem[]
}

/** The empty trail (every extractor missed; the card does not render). */
export const EMPTY_SOURCE_TRAIL: SourceTrailModel = {
  kb: [], lakehouse: [], nocobase: [], kg: [],
}

const CITATION_LINE = /^\[(\d+)\] (.+)$/u
const LAKEHOUSE_SOURCE_LINE = /^Data source: lakehouse tables? (.+)$/mu
const KG_SOURCES_LINE = /^sources: (.+)$/mu

/**
 * Flatten a settled call's content blocks to text (text blocks verbatim,
 * other shapes skipped; the trail reads prose lines, not JSON cards).
 * @param block - the settled result node.
 * @returns the joined text, or null for a running call.
 */
function resultTextOf(block: ToolResultNode): string | null {
  const parts: string[] = []
  for (const item of block.content) {
    if (item.type === 'text') parts.push(item.text)
  }
  return parts.length === 0 ? null : parts.join('\n')
}

/**
 * Parse the raw arguments object of a settled call (undefined on non-JSON
 * streaming prefixes — a settled call always carries complete JSON, so the
 * miss only guards malformed replay material).
 * @param block - the settled result node.
 * @returns the parsed arguments, or undefined.
 */
function argsOf(block: ToolResultNode): Record<string, unknown> | undefined {
  const raw = block.call?.argsRaw ?? ''
  try {
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed === 'object' && parsed !== null) return parsed as Record<string, unknown>
  } catch {
    // Malformed replay arguments: the call still carries a readable result.
  }
  return undefined
}

/**
 * Basename label of a citation path (the chip shows the file, not the tree).
 * @param sourcePath - the citation's full relative source path.
 * @returns the path's last segment.
 */
export function kbSourceLabel(sourcePath: string): string {
  const slash = sourcePath.lastIndexOf('/')
  return slash === -1 ? sourcePath : sourcePath.slice(slash + 1)
}

/**
 * Extract one `kb_search` result's citations off its `[n] …` lines.
 * @param text - the model-facing result text.
 * @returns the citations in printed order.
 */
export function extractKbCitations(text: string): readonly KbSourceItem[] {
  const items: KbSourceItem[] = []
  for (const line of text.split('\n')) {
    const match = CITATION_LINE.exec(line)
    if (match === null) continue
    /* v8 ignore next -- the capture groups are non-empty by the regex; the
       arms only satisfy noUncheckedIndexedAccess. */
    const rest = match[2] ?? ''
    const parts = rest.split(' — ')
    /* v8 ignore next */
    const sourcePath = parts[0] ?? rest
    const headingPath = parts.length > 3 ? parts.slice(1, -2).join(' — ') : undefined
    items.push({ number: Number(match[1]), sourcePath, headingPath })
  }
  return items
}

/**
 * Extract one `lakehouse_query` result's source tables and the SQL that
 * produced them.
 * @param text - the model-facing result text.
 * @param args - the parsed call arguments.
 * @returns the table attributions, or an empty list when the attribution
 *   line is absent (a newer host's wording) or names no table.
 */
export function extractLakehouseSources(
  text: string,
  args: Record<string, unknown> | undefined,
): readonly LakehouseSourceItem[] {
  const tables = LAKEHOUSE_SOURCE_LINE.exec(text)?.[1]?.split(', ').map(name => name.trim()).filter(name => name.length > 0) ?? []
  if (tables.length === 0) return []
  const sql = typeof args?.sql === 'string' ? args.sql : ''
  return tables.map(table => ({ table, sql }))
}

/**
 * Extract one kg read's seeds and provenance systems.
 * @param text - the model-facing result text (entity-aggregated YAML).
 * @param args - the parsed call arguments (`seeds` for kg_subgraph,
 *   `phrase` for kg_query).
 * @returns the kg source, or undefined when neither a seeds argument nor a
 *   `sources:` line is present.
 */
export function extractKgSource(
  text: string,
  args: Record<string, unknown> | undefined,
): KgSourceItem | undefined {
  const seeds: string[] = []
  if (Array.isArray(args?.seeds)) {
    for (const seed of args.seeds) {
      if (typeof seed === 'string' && seed.trim().length > 0) seeds.push(seed.trim())
    }
  }
  if (typeof args?.phrase === 'string' && args.phrase.trim().length > 0) seeds.push(args.phrase.trim())
  const systems = KG_SOURCES_LINE.exec(text)?.[1]?.split(', ').map(entry => entry.split(':')[0] ?? entry).filter(name => name.length > 0) ?? []
  if (seeds.length === 0 && systems.length === 0) return undefined
  return { seeds, systems: [...new Set(systems)] }
}

/**
 * Derive the aggregated source trail of one turn's settled tool calls.
 * @param blocks - the turn's tool-call roots (running and settled; only
 *   settled results contribute).
 * @returns the trail; {@link EMPTY_SOURCE_TRAIL} when nothing extracted.
 */
export function sourceTrailOf(blocks: readonly ToolCallBlock[]): SourceTrailModel {
  const kb = new Map<string, KbSourceItem>()
  const lakehouse = new Map<string, LakehouseSourceItem>()
  const nocobase = new Set<string>()
  const kg: KgSourceItem[] = []
  for (const block of blocks) {
    if (!('kind' in block) || block.isError) continue
    const name = block.call?.name ?? ''
    const text = resultTextOf(block)
    if (text === null) continue
    switch (name) {
      case 'kb_search':
        for (const item of extractKbCitations(text)) {
          if (!kb.has(item.sourcePath)) kb.set(item.sourcePath, item)
        }
        break
      case 'lakehouse_query':
        for (const item of extractLakehouseSources(text, argsOf(block))) {
          if (!lakehouse.has(item.table)) lakehouse.set(item.table, item)
        }
        break
      case 'nb_list':
      case 'nb_get': {
        const collection = argsOf(block)?.collection
        if (typeof collection === 'string' && collection.length > 0) nocobase.add(collection)
        break
      }
      case 'kg_subgraph':
      case 'kg_query': {
        const item = extractKgSource(text, argsOf(block))
        if (item !== undefined) kg.push(item)
        break
      }
      default:
        break
    }
  }
  return {
    kb: [...kb.values()],
    lakehouse: [...lakehouse.values()],
    nocobase: [...nocobase].map(collection => ({ collection })),
    kg,
  }
}

/**
 * Whether a trail carries any source at all (the card's render predicate).
 * @param model - the aggregated trail.
 * @returns true when at least one bucket is non-empty.
 */
export function hasSources(model: SourceTrailModel): boolean {
  return model.kb.length > 0 || model.lakehouse.length > 0 || model.nocobase.length > 0 || model.kg.length > 0
}
