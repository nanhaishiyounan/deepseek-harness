/**
 * The model-facing `kb_ingest_url` tool: fetch one page through the optional
 * `ctx.web` service, convert the body to structured text, and store it in the
 * knowledge base under the deployment's bound tenant with the URL as the
 * citation identity. The web service is optional (`ctx.get`, not `inject`) so
 * file-only compositions keep loading; the tool stays visible and fails with
 * a structured error at execution time, matching the store-availability
 * convention.
 * @module @deepseek-ai/dsh-tool-kb/ingest-url
 */

import type { Context } from '@deepseek-ai/cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'
import type { GenericCallView, GenericResultView, ToolResult } from '@deepseek-ai/dsh-tools'
// Side-effect type import: resolves `ctx.get('web')` to the service type.
import type {} from '@deepseek-ai/dsh-web'
import { KB_DOC_KINDS } from '@deepseek-ai/dsh-kb'
import { htmlToStructuredText } from './extract.ts'
import { parseIngestUrlArgs, resolveAdmittedAddresses, type KbIngestUrlArgs } from './url-policy.ts'

/** The canonical `kb_ingest_url` output value. */
export interface KbIngestUrlToolValue {
  url: string
  doc_id: number
  chunks: number
  embedded: boolean
  embed_model?: string
  tenant: string
}

/**
 * Format a URL ingest outcome as the model-facing text.
 * @param value - the tool's canonical output value.
 * @returns the rendered summary.
 */
export function formatIngestUrlOutput(value: KbIngestUrlToolValue): string {
  const embed = value.embedded
    ? `embedded via ${value.embed_model ?? 'unknown embed provider'}`
    : 'stored text-only (no embed provider available)'
  return `Ingested ${value.url} into tenant "${value.tenant}": document ${value.doc_id}, ${value.chunks} chunks, ${embed}. Re-ingesting the same URL replaces the prior document.`
}

/**
 * Pending-call presentation: a generic card titled by the URL.
 * @param args - the raw tool arguments; only the URL feeds the view.
 * @returns the generic card view.
 */
export function presentIngestUrlCall(args: KbIngestUrlArgs): GenericCallView {
  return { card: 'generic', title: `kb_ingest_url ${args.url}`, kind: 'read', rawInput: args.url }
}

/**
 * Completed-call presentation: a generic card restating the stored summary.
 * @param args - the raw tool arguments; the URL becomes the result-state title.
 * @param result - the final model-facing tool result.
 * @returns the generic card view, or `undefined` on failure.
 */
export function presentIngestUrlResult(args: KbIngestUrlArgs, result: ToolResult): GenericResultView | undefined {
  if (result.isError) return undefined
  const text = result.content.find(block => block.type === 'text')
  return {
    card: 'generic',
    title: `kb_ingest_url ${args.url}`,
    ...text === undefined ? {} : { content: [text] },
  }
}

/**
 * Register the `kb_ingest_url` tool.
 * @param ctx - context whose `tools` registry receives the registration; execution uses its optional `web` service and its `kb` service.
 * @param tenant - the deployment-side tenant binding; every ingest stores under it.
 * @param allowPrivateNetworks - the composition's explicit intranet opt-in for the SSRF gate.
 * @param timeoutMs - cooperative tool-call budget attached as `ToolDefinition.timeoutMs`.
 */
export function applyKbIngestUrlTool(ctx: Context, tenant: string, allowPrivateNetworks: boolean, timeoutMs: number): void {
  ctx.tools.register(defineTool({
    name: 'kb_ingest_url',
    description: 'Fetch one http(s) page, convert it to text, and store it in the knowledge base for later kb_search. The URL becomes the citation identity; re-ingesting the same URL replaces the prior document. Use it when the user asks to add a web page or online regulation to the knowledge base.',
    parameters: {
      url: {
        type: 'string',
        required: true,
        description: 'http(s) URL of the page to ingest.',
      },
      doc_kind: {
        type: 'string',
        description: `Document kind: ${KB_DOC_KINDS.join(', ')}. Defaults to other.`,
      },
      title: {
        type: 'string',
        description: 'Optional human-readable document title shown in citations.',
      },
      collected_at: {
        type: 'string',
        description: 'Optional ISO-8601 collection date of the source page.',
      },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          url: { type: 'string', required: true },
          doc_id: { type: 'number', required: true },
          chunks: { type: 'number', required: true },
          embedded: { type: 'boolean', required: true },
          embed_model: { type: 'string' },
          tenant: { type: 'string', required: true },
        },
      },
      render: (_args, value) => [{ type: 'text', text: formatIngestUrlOutput(value) }],
    },
    timeoutMs,
    async execute(args, exec) {
      const input = parseIngestUrlArgs(args)
      const web = ctx.get('web')
      if (web === undefined) {
        throw new Error('kb_ingest_url: no web service is composed; add the dsh-web plugin and a fetch provider to ingest URLs')
      }
      const pinnedAddresses = await resolveAdmittedAddresses(new URL(input.url), allowPrivateNetworks)
      const fetched = await web.fetch({ url: input.url, pinnedAddresses }, exec.signal)
      if (fetched.statusCode < 200 || fetched.statusCode >= 300) {
        throw new Error(`kb_ingest_url: the page returned HTTP ${fetched.statusCode}; refusing to store an error response`)
      }
      if (fetched.truncated) {
        throw new Error('kb_ingest_url: the fetched body was truncated by the provider; refusing to store a partial corpus')
      }
      const content = fetched.body.kind === 'html' ? htmlToStructuredText(fetched.body.content) : fetched.body.content
      if (content.trim().length === 0) {
        throw new Error('kb_ingest_url: the fetched page carries no extractable text')
      }
      const result = await ctx.kb.ingest({
        tenantId: tenant,
        sourcePath: input.url,
        docKind: input.docKind,
        ...input.title === undefined ? {} : { title: input.title },
        ...input.collectedAt === undefined ? {} : { collectedAt: input.collectedAt },
        content,
      }, exec.signal)
      return {
        url: input.url,
        doc_id: result.docId,
        chunks: result.chunks,
        embedded: result.embedded,
        ...result.embedModel === undefined ? {} : { embed_model: result.embedModel },
        tenant,
      }
    },
    presentCall: presentIngestUrlCall,
    presentResult: (args, result) => presentIngestUrlResult(args, result),
  }))
}
