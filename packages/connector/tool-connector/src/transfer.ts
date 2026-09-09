/**
 * The model-facing `connector_transfer` tool: run the seam's five-step
 * transfer for one dataset (pull → classify → route → deliver → confirm) and
 * render the landing receipt — the lakehouse table to query next or the kb
 * document now retrievable — with the catalog transfer-record id as the
 * audit trail.
 * @module @deepseek-ai/dsh-tool-connector/transfer
 */

import type { Context } from '@deepseek-ai/cordis'
import type { ConnectorTransferTarget } from '@deepseek-ai/dsh-connector'
import { defineTool } from '@deepseek-ai/dsh-tools'
import type { GenericCallView, GenericResultView, ToolResult } from '@deepseek-ai/dsh-tools'
import { parseFetchArgs, resolveProvider } from './fetch.ts'

/** Model-facing `connector_transfer` arguments. */
export interface ConnectorTransferArgs extends ConnectorFetchInputArguments {
  /** `auto` follows the classified destination; `kb`/`lakehouse` pin it. */
  target?: string
  /** Always rejected at parse time: the tenant is the deployment-side binding, never model input. */
  tenant?: string
}

/** Raw argument names before validation (snake_case on the wire). */
interface ConnectorFetchInputArguments {
  dataset_id: string
  provider_id?: string
}

/** Validated `connector_transfer` input. */
export interface ConnectorTransferInput {
  readonly datasetId: string
  readonly providerId?: string
  readonly target: ConnectorTransferTarget
}

/** Closed set of transfer targets. */
const TRANSFER_TARGETS: readonly ConnectorTransferTarget[] = ['auto', 'kb', 'lakehouse']

/**
 * Validate the arguments the schema DSL cannot constrain.
 * @param args - the schema-validated `connector_transfer` arguments.
 * @returns the validated transfer input.
 */
export function parseTransferArgs(args: ConnectorTransferArgs): ConnectorTransferInput {
  if (args.tenant !== undefined) {
    throw new Error('connector_transfer: the tenant is bound by the deployment; a tenant argument is not accepted')
  }
  const located = parseFetchArgs({
    dataset_id: args.dataset_id,
    ...(args.provider_id === undefined ? {} : { provider_id: args.provider_id }),
  })
  let target: ConnectorTransferTarget = 'auto'
  if (args.target !== undefined) {
    if (!TRANSFER_TARGETS.includes(args.target as ConnectorTransferTarget)) {
      throw new Error(`connector_transfer: target must be one of ${TRANSFER_TARGETS.join(', ')} (got "${args.target}")`)
    }
    target = args.target as ConnectorTransferTarget
  }
  return { ...located, target }
}

/** The canonical `connector_transfer` output value. */
export interface ConnectorTransferToolValue {
  dataset_id: string
  dataset_kind: string
  provider: string
  destination: 'kb' | 'lakehouse'
  rows: number
  replaced: boolean
  table?: string
  document?: { doc_id: number; chunks: number; embedded: boolean }
  transfer_record_id: number
}

/**
 * Format the landing receipt as model-facing text with the next-step guidance.
 * @param value - the tool's canonical output value.
 * @returns the rendered receipt.
 */
export function formatTransferOutput(value: ConnectorTransferToolValue): string {
  const lines = [
    `Transferred dataset \`${value.dataset_id}\` (${value.dataset_kind}) from provider \`${value.provider}\` into the ${value.destination === 'lakehouse' ? 'lakehouse' : 'knowledge base'}.`,
    value.destination === 'lakehouse'
      ? `- table \`${value.table}\` — ${value.rows} row${value.rows === 1 ? '' : 's'}${value.replaced ? ' (replaced a prior load of the same table)' : ''}`
      : `- document ${value.document?.doc_id} — ${value.document?.chunks} chunks${value.document?.embedded ? '' : ' (text-only, no embeddings)'}; re-ingest replaces the same source document`,
    `- transfer record ${value.transfer_record_id} (catalog audit trail)`,
  ]
  lines.push(value.destination === 'lakehouse'
    ? 'Query it with lakehouse_query (see lakehouse_tables for columns); name the table in your answer.'
    : 'Retrieve it with kb_search and cite it with [n] references.')
  return lines.join('\n')
}

/** Presentation-ready projection of replayed transfer metadata. */
export interface TransferMetaView {
  readonly destination: string
  readonly rows: number
  readonly landing: string
}

/**
 * Narrow opaque live or replayed result metadata for presentation. Malformed
 * metadata returns `undefined` so presentation falls back to the generic card.
 * @param meta - result metadata.
 * @returns the validated transfer meta, or `undefined`.
 */
export function transferMetaFromResult(meta: unknown): TransferMetaView | undefined {
  if (typeof meta !== 'object' || meta === null || Array.isArray(meta)) return undefined
  const { destination, rows, landing } = meta as Record<string, unknown>
  if (typeof destination !== 'string' || typeof landing !== 'string') return undefined
  if (typeof rows !== 'number' || !Number.isInteger(rows) || rows < 0) return undefined
  return { destination, rows, landing }
}

/**
 * Pending-call presentation: a generic card titled by the dataset id.
 * @param args - the raw tool arguments.
 * @returns the generic card view.
 */
export function presentTransferCall(args: ConnectorTransferArgs): GenericCallView {
  const datasetId = args.dataset_id.trim()
  return { card: 'generic', title: datasetId.length > 0 ? datasetId : 'connector_transfer', kind: 'move', rawInput: datasetId }
}

/**
 * Completed-call presentation: a generic card restating the landing.
 * @param _args - the raw tool arguments (unused; the meta carries the landing).
 * @param result - the final tool result; `meta` carries the projection.
 * @returns the generic card view, or `undefined` on failure or malformed meta.
 */
export function presentTransferResult(_args: ConnectorTransferArgs, result: ToolResult): GenericResultView | undefined {
  if (result.isError) return undefined
  const meta = transferMetaFromResult(result.meta)
  if (meta === undefined) return undefined
  return {
    card: 'generic',
    title: 'connector_transfer',
    content: [{ type: 'text', text: `landed in ${meta.destination}: ${meta.landing}` }],
  }
}

/**
 * Register the `connector_transfer` tool and its system-prompt guidance.
 * @param ctx - context whose `tools` and `systemPrompt` registries receive the registrations.
 * @param tenant - the deployment-side tenant binding for every landing.
 * @param timeoutMs - cooperative tool-call budget attached as `ToolDefinition.timeoutMs`.
 */
export function applyConnectorTransferTool(ctx: Context, tenant: string, timeoutMs: number): void {
  ctx.systemPrompt.section({
    name: 'tool:connector_transfer',
    order: 115,
    text: 'Use the connector_transfer tool to land one connector dataset into this deployment: tabular content and csv/xlsx/json files load as lakehouse tables, documents and expert profiles ingest into the knowledge base (auto-classified; target pins the destination and disagreements refuse). After a transfer, answer from the landing — lakehouse_query over the named table, or kb_search with [n] citations.',
  })

  ctx.tools.register(defineTool({
    name: 'connector_transfer',
    description: 'Land one connector dataset in this deployment: tabular datasets and csv/xlsx/json files become lakehouse tables; documents and expert profiles ingest into the knowledge base. Returns the landing receipt (table or document, row counts, transfer record id).',
    parameters: {
      dataset_id: {
        type: 'string',
        required: true,
        description: 'The dataset id from connector_discover.',
      },
      provider_id: {
        type: 'string',
        description: 'The owning provider id, when several providers expose the same dataset id.',
      },
      target: {
        type: 'string',
        enum: ['auto', 'kb', 'lakehouse'],
        description: 'Where the dataset lands: auto follows the content classification (default), kb and lakehouse pin it.',
      },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          dataset_id: { type: 'string', required: true },
          dataset_kind: { type: 'string', required: true },
          provider: { type: 'string', required: true },
          destination: { type: 'string', required: true, enum: ['kb', 'lakehouse'] },
          rows: { type: 'number', required: true },
          replaced: { type: 'boolean', required: true },
          table: { type: 'string' },
          document: {
            type: 'object',
            additionalProperties: false,
            properties: {
              doc_id: { type: 'number', required: true },
              chunks: { type: 'number', required: true },
              embedded: { type: 'boolean', required: true },
            },
          },
          transfer_record_id: { type: 'number', required: true },
        },
      },
      render: (_args, value) => [{ type: 'text', text: formatTransferOutput(value) }],
      presentationMeta: (_args, value) => {
        const projected = value
        return {
          destination: projected.destination,
          rows: projected.rows,
          landing: projected.destination === 'lakehouse' ? `table ${projected.table}` : `document ${projected.document?.doc_id}`,
        }
      },
    },
    timeoutMs,
    // Lands data through the kb and lakehouse seams; never concurrency-safe.
    isConcurrencySafe: () => false,
    async execute(args, exec) {
      const input = parseTransferArgs(args)
      const providerId = await resolveProvider(ctx, input)
      const result = await ctx.connector.transfer(
        { providerId, datasetId: input.datasetId, tenantId: tenant, target: input.target },
        exec.signal,
      )
      return {
        dataset_id: result.datasetId,
        dataset_kind: result.datasetKind,
        provider: providerId,
        destination: result.destination,
        rows: result.rows,
        replaced: result.replaced,
        ...(result.table === undefined ? {} : { table: result.table }),
        ...(result.document === undefined
          ? {}
          : { document: { doc_id: result.document.docId, chunks: result.document.chunks, embedded: result.document.embedded } }),
        transfer_record_id: result.transferRecordId,
      }
    },
    presentCall: presentTransferCall,
    presentResult: presentTransferResult,
  }))
}
