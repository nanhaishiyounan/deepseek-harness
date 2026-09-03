/**
 * The model-facing `kb_ingest` tool: read one workspace UTF-8 text file,
 * chunk it, and store it in the knowledge base under a tenant. Execution goes
 * through `ctx.fs` for path resolution and `ctx.kb` for the ingest pipeline.
 * @module @deepseek-ai/dsh-tool-kb/ingest
 */

import type { Context } from '@deepseek-ai/cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'
import type {} from '@deepseek-ai/dsh-fs'
import type { GenericCallView, GenericResultView, ToolResult } from '@deepseek-ai/dsh-tools'
import { KB_DOC_KINDS } from '@deepseek-ai/dsh-kb'
import type { KbDocKind } from '@deepseek-ai/dsh-kb'
import { extractDocxText, extractPdfText } from './extract.ts'

/** File extensions accepted for ingestion: UTF-8 text plus parsed PDF and docx. */
export const INGEST_EXTENSIONS = ['.md', '.txt', '.pdf', '.docx'] as const

/** Extensions ingested as raw UTF-8 text; everything else goes through a parser. */
const TEXT_EXTENSIONS = ['.md', '.txt'] as const

/** Model-facing `kb_ingest` arguments. */
export interface KbIngestArgs {
  path: string
  /** Always rejected at parse time: the tenant is the deployment-side binding, never model input. */
  tenant?: string
  doc_kind?: string
  title?: string
  collected_at?: string
}

/** Validated `kb_ingest` input after defaulting. */
export interface KbIngestInput {
  path: string
  tenant: string
  docKind: KbDocKind
  title: string | undefined
  collectedAt: string | undefined
}

/**
 * Validate value constraints the schema DSL can't express: a non-blank path
 * with an allowed extension (`.md`/`.txt` as UTF-8 text; `.pdf`/`.docx`
 * parsed to text), a known `doc_kind`, and an ISO-8601 `collected_at` when
 * given. A `tenant` argument is rejected — the tenant is the deployment-side
 * binding, never model input.
 * @param args - the schema-validated `kb_ingest` arguments.
 * @param tenant - the deployment-side tenant binding the ingest runs under.
 * @returns the validated ingest input.
 */
export function parseIngestArgs(args: KbIngestArgs, tenant: string): KbIngestInput {
  if (args.tenant !== undefined) {
    throw new Error('kb_ingest: the tenant is bound by the deployment; a tenant argument is not accepted')
  }
  const path = args.path.trim()
  if (path.length === 0) throw new Error('kb_ingest: path must be a non-empty string')
  if (!INGEST_EXTENSIONS.some(extension => path.toLowerCase().endsWith(extension))) {
    throw new Error(`kb_ingest: path must end with one of ${INGEST_EXTENSIONS.join(', ')}`)
  }
  if (tenant.trim().length === 0) {
    throw new Error('kb_ingest: the deployment tenant binding must be a non-empty string')
  }
  let docKind: KbDocKind = 'other'
  if (args.doc_kind !== undefined) {
    if (!(KB_DOC_KINDS as readonly string[]).includes(args.doc_kind)) {
      throw new Error(`kb_ingest: doc_kind must be one of ${KB_DOC_KINDS.join(', ')}`)
    }
    docKind = args.doc_kind as KbDocKind
  }
  let collectedAt: string | undefined
  if (args.collected_at !== undefined) {
    if (Number.isNaN(Date.parse(args.collected_at))) {
      throw new Error('kb_ingest: collected_at must be an ISO-8601 date string')
    }
    collectedAt = args.collected_at
  }
  return {
    path,
    tenant,
    docKind,
    title: args.title === undefined || args.title.trim().length === 0 ? undefined : args.title,
    collectedAt,
  }
}

/** The canonical `kb_ingest` output value. */
export interface KbIngestToolValue {
  doc_id: number
  chunks: number
  embedded: boolean
  embed_model?: string
  path: string
  tenant: string
}

/**
 * Format an ingest outcome as the model-facing text.
 * @param value - the tool's canonical output value.
 * @returns the rendered summary.
 */
export function formatIngestOutput(value: KbIngestToolValue): string {
  const embed = value.embedded
    ? `embedded via ${value.embed_model ?? 'unknown embed provider'}`
    : 'stored text-only (no embed provider available)'
  return `Ingested ${value.path} into tenant "${value.tenant}": document ${value.doc_id}, ${value.chunks} chunks, ${embed}. Re-ingesting the same path replaces the prior document.`
}

/**
 * Pending-call presentation: a generic card titled by the ingest path.
 * @param args - the raw tool arguments; only the path feeds the view.
 * @returns the generic card view.
 */
export function presentIngestCall(args: KbIngestArgs): GenericCallView {
  return { card: 'generic', title: `kb_ingest ${args.path}`, kind: 'read', rawInput: args.path }
}

/**
 * Completed-call presentation: a generic card restating the stored summary.
 * @param args - the raw tool arguments; the path becomes the result-state title.
 * @param result - the final model-facing tool result.
 * @returns the generic card view, or `undefined` on failure.
 */
export function presentIngestResult(args: KbIngestArgs, result: ToolResult): GenericResultView | undefined {
  if (result.isError) return undefined
  const text = result.content.find(block => block.type === 'text')
  return {
    card: 'generic',
    title: `kb_ingest ${args.path}`,
    ...text === undefined ? {} : { content: [text] },
  }
}

/**
 * Register the `kb_ingest` tool, storing into the deployment's bound tenant.
 * @param ctx - context whose `tools` registry receives the registration; execution uses its `fs` and `kb` services.
 * @param tenant - the deployment-side tenant binding; every ingest stores under it.
 * @param timeoutMs - cooperative tool-call budget attached as `ToolDefinition.timeoutMs`.
 */
export function applyKbIngestTool(ctx: Context, tenant: string, timeoutMs: number): void {
  ctx.tools.register(defineTool({
    name: 'kb_ingest',
    description: 'Read one workspace document (.md, .txt, .pdf, or .docx), extract its text, chunk it, and store it in the knowledge base for later kb_search. Re-ingesting the same path replaces the prior document. Use it when the user asks to add a document to the knowledge base.',
    parameters: {
      path: {
        type: 'string',
        required: true,
        description: 'Workspace-relative path of the document to ingest; must end with .md, .txt, .pdf, or .docx.',
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
        description: 'Optional ISO-8601 collection date of the source document.',
      },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          doc_id: { type: 'number', required: true },
          chunks: { type: 'number', required: true },
          embedded: { type: 'boolean', required: true },
          embed_model: { type: 'string' },
          path: { type: 'string', required: true },
          tenant: { type: 'string', required: true },
        },
      },
      render: (_args, value) => [{ type: 'text', text: formatIngestOutput(value) }],
    },
    timeoutMs,
    async execute(args, exec) {
      const input = parseIngestArgs(args, tenant)
      const target = await ctx.fs.resolve(input.path, { signal: exec.signal })
      const content = TEXT_EXTENSIONS.some(extension => input.path.toLowerCase().endsWith(extension))
        ? await ctx.fs.readText(target, exec.signal)
        : await readParsedDocument(ctx, target, input.path, exec.signal)
      const result = await ctx.kb.ingest({
        tenantId: input.tenant,
        sourcePath: input.path,
        docKind: input.docKind,
        ...input.title === undefined ? {} : { title: input.title },
        ...input.collectedAt === undefined ? {} : { collectedAt: input.collectedAt },
        content,
      }, exec.signal)
      return {
        doc_id: result.docId,
        chunks: result.chunks,
        embedded: result.embedded,
        ...result.embedModel === undefined ? {} : { embed_model: result.embedModel },
        path: input.path,
        tenant: input.tenant,
      }
    },
    presentCall: presentIngestCall,
    presentResult: (args, result) => presentIngestResult(args, result),
  }))
}

/** Upper bound on one ingested binary document's bytes. */
const MAX_BINARY_BYTES = 64 * 1024 * 1024

/**
 * Read and parse one binary document (PDF or docx) into text through the
 * matching extractor.
 * @param ctx - context whose `fs` service reads the bytes.
 * @param target - the resolved file target.
 * @param path - the workspace-relative path (extension selects the parser).
 * @param signal - cancellation signal.
 * @returns the extracted document text.
 */
async function readParsedDocument(ctx: Context, target: Awaited<ReturnType<Context['fs']['resolve']>>, path: string, signal: AbortSignal): Promise<string> {
  const bytes = await ctx.fs.readBytes(target, signal, MAX_BINARY_BYTES)
  const lower = path.toLowerCase()
  if (lower.endsWith('.pdf')) return extractPdfText(bytes)
  return extractDocxText(bytes)
}
