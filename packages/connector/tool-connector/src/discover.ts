/**
 * The model-facing `connector_discover` tool: one free-text query (plus an
 * optional kind filter) fanned across every usable connector provider,
 * rendering expert profiles as cards (affiliation, domain tags, the expert's
 * serviceable offerings with deliverable and pricing, an orderable hint) and
 * datasets as grouped markdown with provider and dataset ids the model can
 * hand to `connector_fetch` and `connector_transfer`.
 * @module @deepseek-ai/dsh-tool-connector/discover
 */

import type { Context } from '@deepseek-ai/cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'
import type { GenericCallView, GenericResultView, ToolResult } from '@deepseek-ai/dsh-tools'
import { CONNECTOR_DATASET_KINDS } from '@deepseek-ai/dsh-connector'
import type { ConnectorDatasetKind, ConnectorDatasetSummary } from '@deepseek-ai/dsh-connector'

/** Model-facing `connector_discover` arguments. */
export interface ConnectorDiscoverArgs {
  query?: string
  /** Restrict discovery to these dataset kinds. */
  kinds?: string[]
  /** Always rejected at parse time: the tenant is the deployment-side binding, never model input. */
  tenant?: string
}

/** Validated `connector_discover` input. */
export interface ConnectorDiscoverInput {
  readonly query?: string
  readonly kinds?: readonly ConnectorDatasetKind[]
}

/**
 * Validate the arguments the schema DSL cannot constrain: no model-supplied
 * tenant and kinds restricted to the closed set.
 * @param args - the schema-validated `connector_discover` arguments.
 * @returns the validated discover input.
 */
export function parseDiscoverArgs(args: ConnectorDiscoverArgs): ConnectorDiscoverInput {
  if (args.tenant !== undefined) {
    throw new Error('connector_discover: the tenant is bound by the deployment; a tenant argument is not accepted')
  }
  // Kind validity is enforced by the schema's enum at the executor; this
  // parse owns only the blank-query trim.
  const query = args.query?.trim()
  const kinds = args.kinds as readonly ConnectorDatasetKind[] | undefined
  return {
    ...(query === undefined || query.length === 0 ? {} : { query }),
    ...(kinds === undefined || kinds.length === 0 ? {} : { kinds }),
  }
}

/** Expert-card fields, present on expert-profile entries. */
export interface DiscoverExpertView {
  readonly org?: string
  readonly domains: string[]
}

/** One serviceable offering, present on service entries. */
export interface DiscoverServiceView {
  readonly service_id: string
  readonly expert_id?: string
  readonly name: string
  readonly deliverable?: string
  readonly price?: string
  readonly summary?: string
}

/** One model-facing dataset entry. */
export interface DiscoverEntry {
  readonly id: string
  readonly title: string
  readonly kind: ConnectorDatasetKind
  readonly provider: string
  readonly updated_at?: string
  readonly description?: string
  /** Present on expert-profile entries: the structured card fields. */
  readonly expert?: DiscoverExpertView
  /** Present on service entries: the full service reference for card assembly. */
  readonly service?: DiscoverServiceView
}

/** The canonical `connector_discover` output value. */
export interface ConnectorDiscoverToolValue {
  readonly query?: string
  readonly providers: string[]
  readonly datasets: DiscoverEntry[]
}

/** Project one summary's expert card detail, omitting the field when absent. */
function expertViewOf(summary: ConnectorDatasetSummary): { expert?: DiscoverExpertView } {
  const detail = summary.expert
  if (detail === undefined) return {}
  return { expert: { ...(detail.org === undefined ? {} : { org: detail.org }), domains: [...detail.domains] } }
}

/** Project one summary's service reference, omitting the field when absent. */
function serviceViewOf(summary: ConnectorDatasetSummary): { service?: DiscoverServiceView } {
  const service = summary.service
  if (service === undefined) return {}
  return {
    service: {
      service_id: service.serviceId,
      ...(service.expertId === undefined ? {} : { expert_id: service.expertId }),
      name: service.name,
      ...(service.deliverable === undefined ? {} : { deliverable: service.deliverable }),
      ...(service.price === undefined ? {} : { price: service.price }),
      ...(service.summary === undefined ? {} : { summary: service.summary }),
    },
  }
}

/**
 * Project discover summaries into the canonical tool value, ordered by kind then title.
 * @param query - the request's query text, echoed when present.
 * @param summaries - the merged discover summaries.
 * @returns the canonical tool value.
 */
export function discoverValueFromSummaries(
  query: string | undefined,
  summaries: readonly ConnectorDatasetSummary[],
): ConnectorDiscoverToolValue {
  const providers = [...new Set(summaries.map(summary => summary.manifest.providerId))].sort()
  const datasets = summaries
    .map(summary => ({
      id: summary.id,
      title: summary.title,
      kind: summary.kind,
      provider: summary.manifest.providerId,
      ...(summary.manifest.updatedAt === undefined ? {} : { updated_at: summary.manifest.updatedAt }),
      ...(isNonEmptyText(summary.manifest.description) ? { description: summary.manifest.description } : {}),
      ...expertViewOf(summary),
      ...serviceViewOf(summary),
    }))
    .sort((a, b) => a.kind.localeCompare(b.kind) || a.title.localeCompare(b.title))
  return {
    ...(isNonEmptyText(query) ? { query } : {}),
    providers,
    datasets,
  }
}

/** True for non-empty display text (blank queries drop out of the projection). */
function isNonEmptyText(value: string | undefined): value is string {
  return value !== undefined && value.length > 0
}

/** One markdown line for a dataset entry. */
function entryLine(entry: DiscoverEntry): string {
  const parts = [`- **${entry.title}** (${entry.kind}) — provider \`${entry.provider}\`, dataset id \`${entry.id}\``]
  if (entry.description !== undefined) parts.push(`: ${entry.description}`)
  return parts.join('')
}

/** One markdown line for a service entry inside an expert card. */
function serviceLine(service: DiscoverServiceView, datasetId: string): string {
  const spec = [service.deliverable, service.price].filter(part => part !== undefined && part.length > 0).join('，')
  const suffix = spec.length === 0 ? '' : `（${spec}）`
  return `  - ${service.name}${suffix} — dataset id \`${datasetId}\``
}

/** One expert card: heading with affiliation, identity line, domain tags, and the orderable service list. */
function expertCard(entry: DiscoverEntry, services: readonly DiscoverEntry[]): string {
  const lines = [`### ${entry.title}${entry.expert?.org === undefined ? '' : ` — ${entry.expert.org}`}`]
  lines.push(`- dataset id \`${entry.id}\` (${entry.kind}) — provider \`${entry.provider}\``)
  if (entry.expert !== undefined && entry.expert.domains.length > 0) {
    lines.push(`- 领域：${entry.expert.domains.join(' · ')}`)
  }
  if (services.length > 0) {
    lines.push('- 可服务项（可下单）:')
    for (const service of services) {
      const view = service.service
      /* v8 ignore next -- the attach filter only selects entries whose service carries the expert_id; the guard totals the narrowing. */
      if (view === undefined) continue
      lines.push(serviceLine(view, service.id))
    }
  }
  if (entry.description !== undefined) lines.push(`- 简介：${entry.description}`)
  return lines.join('\n')
}

/**
 * Format the discovery outcome as grouped markdown: expert cards first (with
 * each expert's orderable services folded in), then unattached services, then
 * data datasets, every entry carrying the ids the follow-up tools need.
 * @param value - the tool's canonical output value.
 * @returns the rendered discovery listing.
 */
export function formatDiscoverOutput(value: ConnectorDiscoverToolValue): string {
  if (value.datasets.length === 0) {
    return [
      `No connector datasets matched${value.query === undefined ? '' : ` "${value.query}"`}.`,
      'Providers on this deployment: none of the registered connectors answered with a match. Rephrase the query or drop the kind filter.',
    ].join(' ')
  }
  const experts = value.datasets.filter(entry => entry.kind === 'expert-profile')
  const services = value.datasets.filter(entry => entry.kind === 'service')
  const data = value.datasets.filter(entry => entry.kind !== 'expert-profile' && entry.kind !== 'service')
  const sections: string[] = []
  if (experts.length > 0) {
    // A service attaches to the expert card its expert_id names; unattached
    // services stay in their own section below.
    const attached = new Set<string>()
    for (const expert of experts) {
      const own = services.filter(service => service.service?.expert_id === expert.id)
      for (const service of own) attached.add(service.id)
      sections.push(['## Experts', expertCard(expert, own)].join('\n'))
    }
    const loose = services.filter(service => !attached.has(service.id))
    if (loose.length > 0) {
      sections.push(['## Expert services', ...loose.map(entryLine)].join('\n'))
    }
  } else if (services.length > 0) {
    sections.push(['## Expert services', ...services.map(entryLine)].join('\n'))
  }
  if (data.length > 0) {
    sections.push(['## Datasets', ...data.map(entryLine)].join('\n'))
  }
  sections.push(`Providers answering: ${value.providers.join(', ')}. Preview a dataset with connector_fetch (dataset_id, provider id if several match); land one with connector_transfer (dataset_id).`)
  return sections.join('\n\n')
}

/** One replayed expert-card summary line for presentation. */
export interface DiscoverExpertMeta {
  readonly name: string
  readonly org?: string
}

/** Presentation-ready projection of replayed discovery metadata. */
export interface DiscoverMetaView {
  readonly datasets: number
  readonly providers: readonly string[]
  /** Expert-card summaries, present when the discovery answered with experts. */
  readonly experts?: readonly DiscoverExpertMeta[]
}

/** True when one replayed expert summary is structurally valid. */
function isExpertMeta(value: unknown): value is DiscoverExpertMeta {
  if (typeof value !== 'object' || value === null) return false
  const { name, org } = value as Record<string, unknown>
  if (typeof name !== 'string' || name.length === 0) return false
  return org === undefined || typeof org === 'string'
}

/**
 * Narrow opaque live or replayed result metadata for presentation. Malformed
 * metadata returns `undefined` so presentation falls back to the generic card.
 * The `experts` field is optional: replays of pre-expert-card results carry
 * the count-and-providers shape alone and stay presentable.
 * @param meta - result metadata.
 * @returns the validated discover meta, or `undefined`.
 */
export function discoverMetaFromResult(meta: unknown): DiscoverMetaView | undefined {
  if (typeof meta !== 'object' || meta === null || Array.isArray(meta)) return undefined
  const { datasets, providers, experts } = meta as Record<string, unknown>
  if (typeof datasets !== 'number' || !Number.isInteger(datasets) || datasets < 0) return undefined
  if (!Array.isArray(providers) || !providers.every(name => typeof name === 'string')) return undefined
  if (experts === undefined) return { datasets, providers }
  if (!Array.isArray(experts) || !experts.every(isExpertMeta)) return undefined
  return {
    datasets,
    providers,
    experts: experts.map((entry) => {
      return { name: entry.name, ...(entry.org === undefined ? {} : { org: entry.org }) }
    }),
  }
}

/**
 * Pending-call presentation: a generic card titled by the query.
 * @param args - the raw tool arguments.
 * @returns the generic card view.
 */
export function presentDiscoverCall(args: ConnectorDiscoverArgs): GenericCallView {
  const query = args.query?.trim() ?? ''
  return { card: 'generic', title: query.length > 0 ? query : 'connector_discover', kind: 'search', rawInput: query }
}

/**
 * Completed-call presentation: a generic card restating the match count, with
 * one expert-card line per discovered expert.
 * @param _args - the raw tool arguments (unused; discovery cards carry no argument echo).
 * @param result - the final tool result; `meta` carries the projection.
 * @returns the generic card view, or `undefined` on failure or malformed meta.
 */
export function presentDiscoverResult(_args: ConnectorDiscoverArgs, result: ToolResult): GenericResultView | undefined {
  if (result.isError) return undefined
  const meta = discoverMetaFromResult(result.meta)
  if (meta === undefined) return undefined
  const count = `${meta.datasets} dataset${meta.datasets === 1 ? '' : 's'} from ${meta.providers.length === 0 ? 'no provider' : meta.providers.join(', ')}`
  const experts = meta.experts ?? []
  return {
    card: 'generic',
    title: 'connector_discover',
    content: [
      { type: 'text', text: count },
      ...experts.map(expert => ({
        type: 'text' as const,
        text: `专家：${expert.name}${expert.org === undefined ? '' : `（${expert.org}）`}`,
      })),
    ],
  }
}

/**
 * Register the `connector_discover` tool and its system-prompt guidance.
 * @param ctx - context whose `tools` and `systemPrompt` registries receive the registrations.
 * @param timeoutMs - cooperative tool-call budget attached as `ToolDefinition.timeoutMs`.
 */
export function applyConnectorDiscoverTool(ctx: Context, timeoutMs: number): void {
  ctx.systemPrompt.section({
    name: 'tool:connector_discover',
    order: 113,
    text: 'Use the connector_discover tool to search external and expert data sources (connector providers) for datasets, expert profiles, and expert services — for example when the question needs experts (出海、中亚), external structured data, or a serviceable offering. Expert cards carry the expert\'s affiliation, domains, and orderable services (deliverable + pricing); recommend a matching expert by these card fields when the question calls for one. Results carry a provider and dataset id: preview content with connector_fetch, and land a dataset into the knowledge base or the lakehouse with connector_transfer.',
  })

  ctx.tools.register(defineTool({
    name: 'connector_discover',
    description: 'Search connector providers for datasets, expert profiles, and expert services. Expert results render as cards with affiliation, domain tags, and orderable services (deliverable + pricing). Each result carries its provider and dataset id for connector_fetch (preview) and connector_transfer (land into the kb or the lakehouse).',
    parameters: {
      query: {
        type: 'string',
        description: 'Free-text query matched against each provider\'s searchable fields (names, titles, domains, summaries).',
      },
      kinds: {
        type: 'array',
        items: { type: 'string', enum: [...CONNECTOR_DATASET_KINDS] },
        description: 'Restrict results to these dataset kinds (tabular, file, document, expert-profile, service).',
      },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          query: { type: 'string' },
          providers: { type: 'array', required: true, items: { type: 'string' } },
          datasets: {
            type: 'array',
            required: true,
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                id: { type: 'string', required: true },
                title: { type: 'string', required: true },
                kind: { type: 'string', required: true },
                provider: { type: 'string', required: true },
                updated_at: { type: 'string' },
                description: { type: 'string' },
                expert: {
                  type: 'object',
                  additionalProperties: false,
                  properties: {
                    org: { type: 'string' },
                    domains: { type: 'array', required: true, items: { type: 'string' } },
                  },
                },
                service: {
                  type: 'object',
                  additionalProperties: false,
                  properties: {
                    service_id: { type: 'string', required: true },
                    expert_id: { type: 'string' },
                    name: { type: 'string', required: true },
                    deliverable: { type: 'string' },
                    price: { type: 'string' },
                    summary: { type: 'string' },
                  },
                },
              },
            },
          },
        },
      },
      render: (_args, value) => [{ type: 'text', text: formatDiscoverOutput(value as ConnectorDiscoverToolValue) }],
      presentationMeta: (_args, value) => {
        const projected = value as ConnectorDiscoverToolValue
        const experts = projected.datasets
          .filter(entry => entry.kind === 'expert-profile')
          .map(entry => ({ name: entry.title, ...(entry.expert?.org === undefined ? {} : { org: entry.expert.org }) }))
        return { datasets: projected.datasets.length, providers: projected.providers, ...(experts.length === 0 ? {} : { experts }) }
      },
    },
    timeoutMs,
    // Read-only discovery fan-out; safe to overlap with other reads.
    isConcurrencySafe: () => true,
    async execute(args, exec) {
      const input = parseDiscoverArgs(args)
      const summaries = await ctx.connector.discover({ ...input }, exec.signal)
      return discoverValueFromSummaries(input.query, summaries)
    },
    presentCall: presentDiscoverCall,
    presentResult: presentDiscoverResult,
  }))
}
