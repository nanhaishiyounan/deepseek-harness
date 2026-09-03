/**
 * The model-facing `kb_search` tool: hybrid retrieval over the ingested
 * knowledge base with numbered citations. Execution goes through `ctx.kb` —
 * this module owns only the model-facing schema, argument validation, the
 * result cap, and citation formatting.
 * @module @deepseek-ai/dsh-tool-kb/search
 */

import type { Context } from '@deepseek-ai/cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'
import type { GenericCallView, GenericResultView, ToolResult } from '@deepseek-ai/dsh-tools'
import { KB_DOC_KINDS } from '@deepseek-ai/dsh-kb'
import type { KbDocKind, KbSearchResult } from '@deepseek-ai/dsh-kb'

/** Default upper bound on returned citations (the `maxResults` config). */
export const KB_SEARCH_MAX_RESULTS = 8

/** Model-facing `kb_search` arguments. */
export interface KbSearchArgs {
  query: string
  /** Always rejected at parse time: the tenant is the deployment-side binding, never model input. */
  tenant?: string
  doc_kind?: string
  max_results?: number
}

/** Validated `kb_search` input after defaulting. */
export interface KbSearchInput {
  query: string
  docKind: KbDocKind | undefined
  maxResults: number
}

/**
 * Validate value constraints the schema DSL can't express: a non-blank query,
 * a known `doc_kind`, and a result cap within the deployment bound. A
 * `tenant` argument is rejected — the tenant is the deployment-side binding,
 * never model input.
 * @param args - the schema-validated `kb_search` arguments.
 * @param maxResults - the deployment's upper bound on returned citations.
 * @returns the validated search input.
 */
export function parseSearchArgs(args: KbSearchArgs, maxResults: number): KbSearchInput {
  if (args.tenant !== undefined) {
    throw new Error('kb_search: the tenant is bound by the deployment; a tenant argument is not accepted')
  }
  const query = args.query.trim()
  if (query.length === 0) throw new Error('kb_search: query must be a non-empty string')
  let docKind: KbDocKind | undefined
  if (args.doc_kind !== undefined) {
    if (!(KB_DOC_KINDS as readonly string[]).includes(args.doc_kind)) {
      throw new Error(`kb_search: doc_kind must be one of ${KB_DOC_KINDS.join(', ')}`)
    }
    docKind = args.doc_kind as KbDocKind
  }
  const requested = args.max_results
  const capped = requested === undefined
    ? maxResults
    : Math.min(Math.max(Math.floor(requested), 1), maxResults)
  return {
    query,
    docKind,
    maxResults: capped,
  }
}

/** The canonical `kb_search` output value (the projection the schema declares). */
export interface KbSearchToolValue {
  query: string
  mode: 'hybrid' | 'text'
  embed_model?: string
  results: Array<{
    chunk_id: number
    doc_id: number
    tenant: string
    source_path: string
    title?: string
    doc_kind: string
    collected_at?: string
    heading_path?: string
    chunk_idx: number
    content: string
  }>
  truncated: boolean
}

/**
 * Project a seam outcome into the canonical tool value. `truncated` is true
 * when the hit count reached the requested cap — the seam reports no total,
 * so a full cap is the honest "there may be more" signal.
 * @param input - the validated search input.
 * @param result - the seam's search outcome.
 * @returns the canonical tool value.
 */
export function searchValueFromResult(input: KbSearchInput, result: KbSearchResult): KbSearchToolValue {
  return {
    query: input.query,
    mode: result.mode,
    ...result.embedModel === undefined ? {} : { embed_model: result.embedModel },
    results: result.results.map(hit => ({
      chunk_id: hit.chunkId,
      doc_id: hit.docId,
      tenant: hit.tenantId,
      source_path: hit.sourcePath,
      ...hit.title === undefined ? {} : { title: hit.title },
      doc_kind: hit.docKind,
      ...hit.collectedAt === undefined ? {} : { collected_at: hit.collectedAt },
      ...hit.headingPath === undefined ? {} : { heading_path: hit.headingPath },
      chunk_idx: hit.chunkIdx,
      content: hit.content,
    })),
    truncated: result.results.length >= input.maxResults,
  }
}

/** One numbered citation line: source path, heading path, kind, chunk index. */
function citationLine(index: number, hit: KbSearchToolValue['results'][number]): string {
  const parts: string[] = [hit.source_path]
  if (hit.heading_path !== undefined) parts.push(hit.heading_path)
  parts.push(hit.doc_kind, `chunk ${hit.chunk_idx}`)
  return `[${index}] ${parts.join(' — ')}`
}

/**
 * Format a search outcome as the model-facing text: the numbered citations,
 * the degraded-mode note, and the standing citation instruction.
 * @param value - the tool's canonical output value.
 * @returns the rendered citation list.
 */
export function formatSearchOutput(value: KbSearchToolValue): string {
  const parts: string[] = []
  if (value.mode === 'text') {
    parts.push('(text-only mode: no embed provider is available; results come from full-text search alone)')
  } else if (value.embed_model !== undefined) {
    parts.push(`(hybrid mode via ${value.embed_model})`)
  }
  if (value.results.length === 0) {
    parts.push('No results found. Try different terms, or ingest more documents with kb_ingest first.')
  } else {
    const lines: string[] = []
    for (const [index, hit] of value.results.entries()) {
      lines.push(citationLine(index + 1, hit))
      lines.push(`  ${hit.content}`)
    }
    parts.push(lines.join('\n'))
  }
  if (value.truncated) {
    parts.push(`(Showing the first ${value.results.length} results. Refine the query for fewer or more precise hits.)`)
  }
  parts.push('Cite the sources above as [n] — document name and heading path — in your answer.')
  return parts.join('\n\n')
}

/** Presentation-ready projection of replayed search metadata. */
export interface KbSearchMetaView {
  readonly query: string
  readonly mode: 'hybrid' | 'text'
  readonly truncated: boolean
  readonly hits: number
}

/**
 * Narrow opaque live or replayed result metadata for presentation. Malformed
 * metadata returns `undefined` so presentation falls back to the generic card.
 * @param meta - result metadata.
 * @returns the validated search meta, or `undefined`.
 */
export function searchMetaFromResult(meta: unknown): KbSearchMetaView | undefined {
  if (typeof meta !== 'object' || meta === null || Array.isArray(meta)) return undefined
  const { query, mode, truncated, hits } = meta as Record<string, unknown>
  if (typeof query !== 'string') return undefined
  if (mode !== 'hybrid' && mode !== 'text') return undefined
  if (typeof truncated !== 'boolean') return undefined
  if (typeof hits !== 'number' || !Number.isInteger(hits) || hits < 0) return undefined
  return { query, mode, truncated, hits }
}

/**
 * Pending-call presentation: a generic search card titled by the query.
 * @param args - the raw tool arguments; only the query text feeds the view.
 * @returns the generic card view.
 */
export function presentSearchCall(args: KbSearchArgs): GenericCallView {
  const title = args.query.trim().length > 0 ? args.query.trim() : 'kb_search'
  return { card: 'generic', title, kind: 'search', rawInput: title }
}

/**
 * Completed-call presentation: a generic card restating the query and hit count.
 * @param args - the raw tool arguments; the query becomes the result-state title.
 * @param result - the final model-facing tool result; `meta` carries the projection.
 * @returns the generic card view, or `undefined` on failure or malformed meta.
 */
export function presentSearchResult(args: KbSearchArgs, result: ToolResult): GenericResultView | undefined {
  if (result.isError) return undefined
  const meta = searchMetaFromResult(result.meta)
  if (meta === undefined) return undefined
  return {
    card: 'generic',
    title: args.query.trim().length > 0 ? args.query.trim() : meta.query,
    content: [{ type: 'text', text: `${meta.hits} knowledge-base hits (${meta.mode} mode${meta.truncated ? ', truncated' : ''})` }],
  }
}

/**
 * Register the `kb_search` tool and its system-prompt guidance, scoped to the
 * deployment's bound tenant.
 * @param ctx - context whose `tools` and `systemPrompt` registries receive the registrations.
 * @param maxResults - the deployment's citation cap.
 * @param tenant - the deployment-side tenant binding; every search runs within it.
 * @param timeoutMs - cooperative tool-call budget attached as `ToolDefinition.timeoutMs`.
 */
export function applyKbSearchTool(ctx: Context, maxResults: number, tenant: string, timeoutMs: number): void {
  ctx.systemPrompt.section({
    name: 'tool:kb_search',
    order: 110,
    text: `Use the kb_search tool to retrieve knowledge-base passages relevant to a question before answering it. Pass a natural-language query; optionally narrow with doc_kind (${KB_DOC_KINDS.join(', ')}) and cap results with max_results (1–${maxResults}). Results are numbered citations [n] carrying the source document, heading path, and passage text. Answer from these passages and cite them as [n] with the document name; say when the knowledge base has nothing relevant instead of guessing.`,
  })

  ctx.tools.register(defineTool({
    name: 'kb_search',
    description: `Search the ingested knowledge base for passages answering a question. Returns up to ${maxResults} numbered citations with source document, heading path, and passage text. Use before answering questions about ingested documents; cite results as [n].`,
    parameters: {
      query: {
        type: 'string',
        required: true,
        description: 'Natural-language query describing the passages to find.',
      },
      doc_kind: {
        type: 'string',
        description: `Restrict hits to one document kind: ${KB_DOC_KINDS.join(', ')}.`,
      },
      max_results: {
        type: 'number',
        description: `Maximum citations to return, 1–${maxResults}.`,
      },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          query: { type: 'string', required: true },
          mode: { type: 'string', required: true },
          embed_model: { type: 'string' },
          results: {
            type: 'array',
            required: true,
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                chunk_id: { type: 'number', required: true },
                doc_id: { type: 'number', required: true },
                tenant: { type: 'string', required: true },
                source_path: { type: 'string', required: true },
                title: { type: 'string' },
                doc_kind: { type: 'string', required: true },
                collected_at: { type: 'string' },
                heading_path: { type: 'string' },
                chunk_idx: { type: 'number', required: true },
                content: { type: 'string', required: true },
              },
            },
          },
          truncated: { type: 'boolean', required: true },
        },
      },
      render: (_args, value) => [{ type: 'text', text: formatSearchOutput(value as KbSearchToolValue) }],
      presentationMeta: (_args, value) => ({
        query: value.query,
        mode: value.mode,
        truncated: value.truncated,
        hits: value.results.length,
      }),
    },
    timeoutMs,
    // Retrieval does not mutate parent-agent state.
    isConcurrencySafe: () => true,
    async execute(args, exec) {
      const input = parseSearchArgs(args, maxResults)
      const result = await ctx.kb.search({
        query: input.query,
        tenantId: tenant,
        ...input.docKind === undefined ? {} : { docKind: input.docKind },
        maxResults: input.maxResults,
      }, exec.signal)
      return searchValueFromResult(input, result)
    },
    presentCall: presentSearchCall,
    presentResult: (args, result) => presentSearchResult(args, result),
  }))
}
