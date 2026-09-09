/**
 * Pure row-model derivation for the `connector_discover` toolview row: the
 * query off the call arguments, the dataset/provider/expert counts off the
 * result's presentation meta, and the raw result text as the expanded body.
 * Everything here is a pure function of the frozen call slice; malformed
 * wire material degrades to the raw result text rather than an empty card.
 * @module @deepseek-ai/dsh-client-ui-kb/client/toolviews/connector-tool-model
 */

import type { ToolCallBlock } from '@deepseek-ai/dsh-client-runtime/client'
import { argsOf, firstLine, resultTextOf, stateOf } from './kb-tool-model.ts'
import type { KbToolRowState } from './kb-tool-model.ts'

/** The presentation meta `connector_discover` attaches to its result event. */
interface DiscoverMeta {
  readonly datasets: number
  readonly providers: readonly string[]
  readonly experts?: readonly { name: string; org?: string }[]
}

/**
 * Narrow the opaque result meta into the connector_discover projection;
 * anything else (missing meta, a newer host's shape) is undefined and the
 * row falls back to the raw text.
 * @param meta - the settled result's opaque meta.
 * @returns the validated discover meta, or `undefined`.
 */
function discoverMetaOf(meta: unknown): DiscoverMeta | undefined {
  if (typeof meta !== 'object' || meta === null) return undefined
  const { datasets, providers, experts } = meta as Record<string, unknown>
  if (typeof datasets !== 'number' || !Number.isInteger(datasets) || datasets < 0) return undefined
  if (!Array.isArray(providers) || !providers.every(name => typeof name === 'string')) return undefined
  if (experts === undefined) return { datasets, providers }
  if (!Array.isArray(experts)
    || !experts.every(expert => typeof expert === 'object' && expert !== null
      && typeof (expert as { name?: unknown }).name === 'string' && (expert as { name: string }).name !== ''
      && ((expert as { org?: unknown }).org === undefined || typeof (expert as { org?: unknown }).org === 'string'))) {
    return undefined
  }
  return {
    datasets,
    providers,
    experts: (experts as Array<{ name: string; org?: string }>).map(expert => ({
      name: expert.name,
      ...(expert.org === undefined ? {} : { org: expert.org }),
    })),
  }
}

/** The connector_discover row model. */
export interface ConnectorDiscoverRowModel {
  readonly state: KbToolRowState
  /** The query as typed; empty while the args prefix is still streaming. */
  readonly query: string
  /** Matched dataset count; undefined when the meta did not validate. */
  readonly datasets: number | undefined
  /** Answering provider ids; undefined when the meta did not validate. */
  readonly providers: readonly string[] | undefined
  /** Discovered expert names (affiliation appended), when the meta carried them. */
  readonly experts: readonly string[]
  /** The raw result text (the expanded fallback and error summary source). */
  readonly output: string | null
  /** First line of the result text on an error row; null otherwise. */
  readonly errorSummary: string | null
}

/**
 * Derive the connector_discover row model.
 * @param block - the frozen call slice.
 * @returns the row model.
 */
export function connectorDiscoverRowModel(block: ToolCallBlock): ConnectorDiscoverRowModel {
  const state = stateOf(block)
  const output = resultTextOf(block)
  const meta = 'kind' in block ? discoverMetaOf(block.meta) : undefined
  const args = argsOf(block)
  const argsQuery = args?.query
  const query = typeof argsQuery === 'string' && argsQuery !== '' ? argsQuery : ''
  return {
    state,
    query,
    datasets: meta?.datasets,
    providers: meta?.providers,
    experts: meta?.experts?.map(expert => expert.org === undefined ? expert.name : `${expert.name}（${expert.org}）`) ?? [],
    output,
    errorSummary: state === 'error' && output !== null ? firstLine(output) : null,
  }
}
