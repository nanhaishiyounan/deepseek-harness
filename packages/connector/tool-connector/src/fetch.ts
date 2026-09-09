/**
 * The model-facing `connector_fetch` tool: pull one dataset's content packet
 * by dataset id (provider id when several providers share the id) and render
 * a kind-specific preview — the first rows of tabular content, an excerpt of
 * document text, the file receipt, or the service offering.
 * @module @deepseek-ai/dsh-tool-connector/fetch
 */

import type { Context } from '@deepseek-ai/cordis'
import { assertNever } from '@deepseek-ai/dsh-llm'
import { defineTool } from '@deepseek-ai/dsh-tools'
import type { GenericCallView, GenericResultView, ToolResult } from '@deepseek-ai/dsh-tools'
import { ConnectorError } from '@deepseek-ai/dsh-connector'
import type { ConnectorDataset } from '@deepseek-ai/dsh-connector'

/** Model-facing `connector_fetch` arguments. */
export interface ConnectorFetchArgs {
  dataset_id: string
  /** Disambiguates when several providers expose the same dataset id. */
  provider_id?: string
  /** Always rejected at parse time: the tenant is the deployment-side binding, never model input. */
  tenant?: string
}

/** Validated `connector_fetch` input. */
export interface ConnectorFetchInput {
  readonly datasetId: string
  readonly providerId?: string
}

/**
 * Validate the arguments the schema DSL cannot constrain.
 * @param args - the schema-validated `connector_fetch` arguments.
 * @returns the validated fetch input.
 */
export function parseFetchArgs(args: ConnectorFetchArgs): ConnectorFetchInput {
  if (args.tenant !== undefined) {
    throw new Error('connector_fetch: the tenant is bound by the deployment; a tenant argument is not accepted')
  }
  const datasetId = args.dataset_id.trim()
  if (datasetId.length === 0) throw new Error('connector_fetch: dataset_id must be a non-empty string')
  return {
    datasetId,
    ...(args.provider_id === undefined || args.provider_id.trim().length === 0 ? {} : { providerId: args.provider_id.trim() }),
  }
}

/** Rows shown in a tabular preview. */
export const FETCH_PREVIEW_ROWS = 8

/** Characters shown in a text preview. */
export const FETCH_PREVIEW_CHARS = 400

/** The canonical `connector_fetch` output value: kind-specific previews. */
export type ConnectorFetchToolValue =
  | {
    kind: 'tabular'
    dataset_id: string
    provider: string
    columns: Array<{ name: string; type: string }>
    rows: (null | boolean | number | string)[][]
    row_count: number
    truncated: boolean
  }
  | {
    kind: 'file'
    dataset_id: string
    provider: string
    filename: string
    size_bytes: number
    mime?: string
    text_preview: string
  }
  | {
    kind: 'document' | 'expert-profile'
    dataset_id: string
    provider: string
    title?: string
    doc_kind: string
    excerpt: string
    content_chars: number
  }
  | {
    kind: 'service'
    dataset_id: string
    provider: string
    service_id: string
    name: string
    deliverable?: string
    summary?: string
  }

/** One excerpt cut to the preview budget. */
function excerpt(text: string): string {
  return text.length > FETCH_PREVIEW_CHARS ? `${text.slice(0, FETCH_PREVIEW_CHARS)}…` : text
}

/**
 * Project one dataset packet into the canonical preview value.
 * @param dataset - the pulled dataset.
 * @returns the kind-specific preview.
 */
export function fetchValueFromDataset(dataset: ConnectorDataset): ConnectorFetchToolValue {
  switch (dataset.kind) {
    case 'tabular':
      return {
        kind: 'tabular',
        dataset_id: dataset.id,
        provider: dataset.manifest.providerId,
        columns: dataset.tabular.columns.map(column => ({ name: column.name, type: column.sqlType })),
        rows: dataset.tabular.rows.slice(0, FETCH_PREVIEW_ROWS).map(row => [...row] as (null | boolean | number | string)[]),
        row_count: dataset.tabular.rows.length,
        truncated: dataset.tabular.rows.length > FETCH_PREVIEW_ROWS,
      }
    case 'file':
      return {
        kind: 'file',
        dataset_id: dataset.id,
        provider: dataset.manifest.providerId,
        filename: dataset.file.filename,
        size_bytes: dataset.file.bytes.byteLength,
        ...(dataset.file.mime === undefined ? {} : { mime: dataset.file.mime }),
        text_preview: excerpt(new TextDecoder('utf-8', { fatal: false }).decode(dataset.file.bytes.slice(0, 2048))),
      }
    case 'document':
    case 'expert-profile':
      return {
        kind: dataset.kind,
        dataset_id: dataset.id,
        provider: dataset.manifest.providerId,
        ...(dataset.ingest.title === undefined ? {} : { title: dataset.ingest.title }),
        doc_kind: dataset.ingest.docKind,
        excerpt: excerpt(dataset.ingest.content),
        content_chars: dataset.ingest.content.length,
      }
    case 'service':
      return {
        kind: 'service',
        dataset_id: dataset.id,
        provider: dataset.manifest.providerId,
        service_id: dataset.service.serviceId,
        name: dataset.service.name,
        ...(dataset.service.deliverable === undefined ? {} : { deliverable: dataset.service.deliverable }),
        ...(dataset.service.summary === undefined ? {} : { summary: dataset.service.summary }),
      }
    /* v8 ignore next 2 -- the closed union above is exhaustive; the default totals the switch. */
    default:
      return assertNever(dataset, 'ConnectorDataset kind')
  }
}

/**
 * Format the preview as model-facing text by content kind.
 * @param value - the tool's canonical output value.
 * @returns the rendered preview.
 */
export function formatFetchOutput(value: ConnectorFetchToolValue): string {
  switch (value.kind) {
    case 'tabular': {
      const header = `| ${value.columns.map(column => column.name).join(' | ')} |`
      const separator = `| ${value.columns.map(() => '---').join(' | ')} |`
      const body = value.rows.map(row => `| ${row.map(cell => cell === null ? 'NULL' : String(cell).replaceAll('|', '\\|').replaceAll('\n', ' ')).join(' | ')} |`)
      const parts = [[header, separator, ...body].join('\n')]
      parts.push(`(preview: ${value.rows.length} of ${value.row_count} rows)`)
      parts.push(`Dataset \`${value.dataset_id}\` from provider \`${value.provider}\` — land it with connector_transfer to query it in the lakehouse.`)
      return parts.join('\n\n')
    }
    case 'file':
      return [
        `File dataset \`${value.filename}\` (${value.size_bytes} bytes${value.mime === undefined ? '' : `, ${value.mime}`}) from provider \`${value.provider}\`.`,
        value.text_preview.length > 0 ? `Preview: ${value.text_preview}` : '(no decodable text preview)',
        'connector_transfer routes it by content: csv/xlsx/json land in the lakehouse, md/txt in the knowledge base.',
      ].join('\n\n')
    case 'document':
    case 'expert-profile':
      return [
        `${value.kind === 'expert-profile' ? 'Expert profile' : 'Document'} \`${value.dataset_id}\` from provider \`${value.provider}\` (${value.content_chars} chars, doc kind ${value.doc_kind}).`,
        value.excerpt,
        'connector_transfer lands the full content in the knowledge base for kb_search retrieval.',
      ].join('\n\n')
    case 'service':
      return [
        `Service **${value.name}** (service id \`${value.service_id}\`) from provider \`${value.provider}\`${value.deliverable === undefined ? '' : ` — deliverable: ${value.deliverable}`}.`,
        value.summary === undefined ? '' : value.summary,
        'Services carry no data payload; ordering arrives in a later batch — surface the offering to the user.',
      ].filter(part => part.length > 0).join('\n\n')
    /* v8 ignore next 2 -- the closed union above is exhaustive; the default totals the switch. */
    default:
      return assertNever(value, 'ConnectorFetchToolValue kind')
  }
}

/** Presentation-ready projection of replayed fetch metadata. */
export interface FetchMetaView {
  readonly kind: string
  readonly label: string
}

/**
 * Narrow opaque live or replayed result metadata for presentation. Malformed
 * metadata returns `undefined` so presentation falls back to the generic card.
 * @param meta - result metadata.
 * @returns the validated fetch meta, or `undefined`.
 */
export function fetchMetaFromResult(meta: unknown): FetchMetaView | undefined {
  if (typeof meta !== 'object' || meta === null || Array.isArray(meta)) return undefined
  const { kind, label } = meta as Record<string, unknown>
  if (typeof kind !== 'string' || typeof label !== 'string') return undefined
  return { kind, label }
}

/**
 * Pending-call presentation: a generic card titled by the dataset id.
 * @param args - the raw tool arguments.
 * @returns the generic card view.
 */
export function presentFetchCall(args: ConnectorFetchArgs): GenericCallView {
  const datasetId = args.dataset_id.trim()
  return { card: 'generic', title: datasetId.length > 0 ? datasetId : 'connector_fetch', kind: 'search', rawInput: datasetId }
}

/**
 * Completed-call presentation: a generic card restating the previewed dataset.
 * @param _args - the raw tool arguments (unused; the meta carries the identity).
 * @param result - the final tool result; `meta` carries the projection.
 * @returns the generic card view, or `undefined` on failure or malformed meta.
 */
export function presentFetchResult(_args: ConnectorFetchArgs, result: ToolResult): GenericResultView | undefined {
  if (result.isError) return undefined
  const meta = fetchMetaFromResult(result.meta)
  if (meta === undefined) return undefined
  return {
    card: 'generic',
    title: meta.label,
    content: [{ type: 'text', text: `previewed ${meta.kind} dataset` }],
  }
}

/**
 * Resolve which provider owns a dataset id: the sole owner, or a loud refusal.
 * @param ctx - context whose `connector` service answers the discovery fan-out.
 * @param input - the validated dataset address (provider id optional).
 * @returns the owning provider id.
 */
export async function resolveProvider(ctx: Context, input: ConnectorFetchInput): Promise<string> {
  if (input.providerId !== undefined) return input.providerId
  const summaries = await ctx.connector.discover({}, undefined)
  const owners = [...new Set(summaries.filter(summary => summary.id === input.datasetId).map(summary => summary.manifest.providerId))]
  if (owners.length === 1) return owners[0] as string
  if (owners.length === 0) {
    throw new ConnectorError(
      `no connector provider exposes a dataset with id "${input.datasetId}" — the id may be unknown (discover first with connector_discover) or its provider is unavailable (for example missing credentials)`,
      'CONNECTOR_DATASET_MISSING',
    )
  }
  throw new ConnectorError(
    `dataset id "${input.datasetId}" is exposed by several providers (${owners.join(', ')}); pass provider_id to disambiguate`,
    'CONNECTOR_DATASET_AMBIGUOUS',
  )
}

/**
 * Register the `connector_fetch` tool and its system-prompt guidance.
 * @param ctx - context whose `tools` and `systemPrompt` registries receive the registrations.
 * @param timeoutMs - cooperative tool-call budget attached as `ToolDefinition.timeoutMs`.
 */
export function applyConnectorFetchTool(ctx: Context, timeoutMs: number): void {
  ctx.systemPrompt.section({
    name: 'tool:connector_fetch',
    order: 114,
    text: 'Use the connector_fetch tool to preview one connector dataset before transferring it: the first rows of a tabular dataset, an excerpt of a document or expert profile, the receipt of a file, or a service offering. Pass the dataset id from connector_discover; add provider_id when several providers share the id.',
  })

  ctx.tools.register(defineTool({
    name: 'connector_fetch',
    description: 'Preview one connector dataset: tabular rows, a document excerpt, a file receipt, or a service offering. Use the dataset id from connector_discover; add provider_id when several providers share the id.',
    parameters: {
      dataset_id: {
        type: 'string',
        required: true,
        description: 'The dataset id from connector_discover (for example `experts/1` or `customs-export.csv`).',
      },
      provider_id: {
        type: 'string',
        description: 'The owning provider id, when several providers expose the same dataset id.',
      },
    },
    output: {
      // The flattened union of kind-specific previews: the three common fields
      // are required, every preview field is optional and present per kind.
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          kind: { type: 'string', required: true, enum: ['tabular', 'file', 'document', 'expert-profile', 'service'] },
          dataset_id: { type: 'string', required: true },
          provider: { type: 'string', required: true },
          columns: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                name: { type: 'string', required: true },
                type: { type: 'string', required: true },
              },
            },
          },
          rows: { type: 'array', items: { type: 'array', items: { type: 'json' } } },
          row_count: { type: 'number' },
          truncated: { type: 'boolean' },
          filename: { type: 'string' },
          size_bytes: { type: 'number' },
          mime: { type: 'string' },
          text_preview: { type: 'string' },
          title: { type: 'string' },
          doc_kind: { type: 'string' },
          excerpt: { type: 'string' },
          content_chars: { type: 'number' },
          service_id: { type: 'string' },
          name: { type: 'string' },
          deliverable: { type: 'string' },
          summary: { type: 'string' },
        },
      },
      render: (_args, value) => [{ type: 'text', text: formatFetchOutput(value as ConnectorFetchToolValue) }],
      presentationMeta: (_args, value) => {
        const projected = value as ConnectorFetchToolValue
        return { kind: projected.kind, label: `${projected.provider}/${projected.dataset_id}` }
      },
    },
    timeoutMs,
    // Read-only preview; safe to overlap with other reads.
    isConcurrencySafe: () => true,
    async execute(args, exec) {
      const input = parseFetchArgs(args)
      const providerId = await resolveProvider(ctx, input)
      const dataset = await ctx.connector.fetch({ providerId, datasetId: input.datasetId }, exec.signal)
      return fetchValueFromDataset(dataset)
    },
    presentCall: presentFetchCall,
    presentResult: presentFetchResult,
  }))
}
