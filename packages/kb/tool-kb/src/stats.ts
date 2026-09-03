/**
 * The model-facing `kb_stats` tool: report knowledge-base coverage — document,
 * chunk, and embedding counts plus embed-route availability — through `ctx.kb`.
 * @module @deepseek-ai/dsh-tool-kb/stats
 */

import type { Context } from '@deepseek-ai/cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'
import type { GenericCallView, GenericResultView, ToolResult } from '@deepseek-ai/dsh-tools'
import type { KbStats, KbUsage } from '@deepseek-ai/dsh-kb'

/** Model-facing `kb_stats` arguments. */
export interface KbStatsArgs {
  /** Always rejected at parse time: the tenant is the deployment-side binding, never model input. */
  tenant?: string
}

/** The canonical `kb_stats` output value. */
export interface KbStatsToolValue {
  tenant: string
  documents: number
  chunks: number
  embedded_chunks: number
  embed_available: boolean
  embed_model?: string
  usage: {
    searches: number
    ingested_documents: number
    ingested_chunks: number
    embed_texts: number
    embed_tokens: number
  }
}

/**
 * Format a stats outcome as the model-facing text.
 * @param value - the tool's canonical output value.
 * @returns the rendered summary.
 */
export function formatStatsOutput(value: KbStatsToolValue): string {
  const scope = `for tenant "${value.tenant}"`
  const route = value.embed_available
    ? `hybrid retrieval via ${value.embed_model ?? 'an embed provider'}`
    : 'text-only retrieval (no embed provider available)'
  const usage = value.usage
  return `Knowledge base ${scope}: ${value.documents} documents, ${value.chunks} chunks (${value.embedded_chunks} embedded), ${route}. Cumulative usage: ${usage.searches} searches, ${usage.ingested_documents} documents ingested (${usage.ingested_chunks} chunks), ${usage.embed_texts} embed texts.`
}

/**
 * Validate the raw `kb_stats` arguments: a `tenant` argument is rejected —
 * the tenant is the deployment-side binding, never model input.
 * @param args - the schema-validated `kb_stats` arguments.
 */
export function parseStatsArgs(args: KbStatsArgs): void {
  if (args.tenant !== undefined) {
    throw new Error('kb_stats: the tenant is bound by the deployment; a tenant argument is not accepted')
  }
}

/**
 * Pending-call presentation: a generic card titled by the scope.
 * @param _args - the raw tool arguments (unused; the title is static).
 * @returns the generic card view.
 */
export function presentStatsCall(_args: KbStatsArgs): GenericCallView {
  return { card: 'generic', title: 'kb_stats' }
}

/**
 * Completed-call presentation: a generic card restating the coverage summary.
 * @param _args - the raw tool arguments (unused; the title is static).
 * @param result - the final model-facing tool result.
 * @returns the generic card view, or `undefined` on failure.
 */
export function presentStatsResult(_args: KbStatsArgs, result: ToolResult): GenericResultView | undefined {
  if (result.isError) return undefined
  const text = result.content.find(block => block.type === 'text')
  return {
    card: 'generic',
    title: 'kb_stats',
    ...text === undefined ? {} : { content: [text] },
  }
}

/**
 * Project a seam stats outcome and usage counters into the canonical tool value.
 * @param tenant - the bound tenant the call counts within.
 * @param stats - the seam's stats outcome.
 * @param usage - the seam's cumulative usage counters for the tenant.
 * @returns the canonical tool value.
 */
export function statsValueFromResult(tenant: string, stats: KbStats, usage: KbUsage): KbStatsToolValue {
  return {
    tenant,
    documents: stats.documents,
    chunks: stats.chunks,
    embedded_chunks: stats.embeddedChunks,
    embed_available: stats.embedAvailable,
    ...stats.embedModel === undefined ? {} : { embed_model: stats.embedModel },
    usage: {
      searches: usage.searches,
      ingested_documents: usage.ingestedDocuments,
      ingested_chunks: usage.ingestedChunks,
      embed_texts: usage.embedTexts,
      embed_tokens: usage.embedTokens,
    },
  }
}

/**
 * Register the `kb_stats` tool, counting within the deployment's bound tenant.
 * @param ctx - context whose `tools` registry receives the registration.
 * @param tenant - the deployment-side tenant binding; counts cover it alone.
 * @param timeoutMs - cooperative tool-call budget attached as `ToolDefinition.timeoutMs`.
 */
export function applyKbStatsTool(ctx: Context, tenant: string, timeoutMs: number): void {
  ctx.tools.register(defineTool({
    name: 'kb_stats',
    description: 'Report knowledge-base coverage: document, chunk, and embedded-chunk counts plus the active retrieval mode. Use it to check what the knowledge base holds before searching.',
    parameters: {},
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          tenant: { type: 'string', required: true },
          documents: { type: 'number', required: true },
          chunks: { type: 'number', required: true },
          embedded_chunks: { type: 'number', required: true },
          embed_available: { type: 'boolean', required: true },
          embed_model: { type: 'string' },
          usage: {
            type: 'object',
            required: true,
            additionalProperties: false,
            properties: {
              searches: { type: 'number', required: true },
              ingested_documents: { type: 'number', required: true },
              ingested_chunks: { type: 'number', required: true },
              embed_texts: { type: 'number', required: true },
              embed_tokens: { type: 'number', required: true },
            },
          },
        },
      },
      render: (_args, value) => [{ type: 'text', text: formatStatsOutput(value) }],
    },
    timeoutMs,
    // Counting does not mutate parent-agent state.
    isConcurrencySafe: () => true,
    async execute(args, exec) {
      parseStatsArgs(args)
      const stats = await ctx.kb.stats(tenant, exec.signal)
      const usage = await ctx.kb.usage(tenant, exec.signal)
      return statsValueFromResult(tenant, stats, usage)
    },
    presentCall: presentStatsCall,
    presentResult: (args, result) => presentStatsResult(args, result),
  }))
}
