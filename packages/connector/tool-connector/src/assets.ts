/**
 * The model-facing `assets_browse` tool: the data-asset market's read-only
 * directory for the conversation — `list` (asset cards with provider, kind,
 * and pricing anchors), `detail` (one asset's full description), and `stats`
 * (per-kind counts and provider totals). The data plane is the SAME
 * `ctx.connector` discovery the market page serves through the gateway's
 * assets domain; ordering stays on the orders tools and landing on the
 * connector transfer tool, so this surface stays read-only by construction.
 * @module @deepseek-ai/dsh-tool-connector/assets
 */

import type { Context } from '@deepseek-ai/cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'
import type { GenericCallView, GenericResultView, ToolResult } from '@deepseek-ai/dsh-tools'
import type { ConnectorDatasetSummary } from '@deepseek-ai/dsh-connector'

/** The closed action set `assets_browse` dispatches on. */
export type AssetsBrowseAction = 'list' | 'detail' | 'stats'

/** Model-facing `assets_browse` arguments. */
export interface AssetsBrowseArgs {
  action: AssetsBrowseAction
  /** Free-text filter for `list`; matched against each provider's searchable fields. */
  query?: string
  /** The asset's owning provider id, required by `detail`. */
  provider_id?: string
  /** The asset's dataset id within its provider, required by `detail`. */
  dataset_id?: string
  /** Always rejected at parse time: the tenant is the deployment-side binding, never model input. */
  tenant?: string
}

/** Validated `assets_browse` input. */
export interface AssetsBrowseInput {
  readonly action: AssetsBrowseAction
  readonly query?: string
  readonly providerId?: string
  readonly datasetId?: string
}

/**
 * Validate the arguments the schema DSL cannot constrain: no model-supplied
 * `tenant`, and `detail` must name both ids.
 * @param args - the schema-validated `assets_browse` arguments.
 * @returns the validated input.
 */
export function parseAssetsBrowseArgs(args: AssetsBrowseArgs): AssetsBrowseInput {
  if (args.tenant !== undefined) {
    throw new Error('assets_browse: the tenant is bound by the deployment; a tenant argument is not accepted')
  }
  const query = args.query?.trim()
  if (args.action === 'detail') {
    const providerId = args.provider_id?.trim()
    const datasetId = args.dataset_id?.trim()
    if (providerId === undefined || providerId.length === 0 || datasetId === undefined || datasetId.length === 0) {
      throw new Error('assets_browse: detail needs both provider_id and dataset_id (assets_browse list carries them)')
    }
    return { action: 'detail', providerId, datasetId }
  }
  return {
    action: args.action,
    ...(query === undefined || query.length === 0 ? {} : { query }),
  }
}

/** One asset card row in the `list` value. */
export interface AssetRow {
  readonly provider_id: string
  readonly dataset_id: string
  readonly title: string
  readonly kind: string
  readonly updated_at?: string
  readonly description?: string
  /** Present on service assets: the pricing anchor, for example `¥8,800/份`. */
  readonly price?: string
}

/** The canonical `assets_browse` output value. */
export type AssetsBrowseToolValue =
  | { readonly action: 'list'; readonly assets: AssetRow[] }
  | { readonly action: 'detail'; readonly asset: AssetRow }

/**
 * Project one discovery summary into an asset card row.
 * @param summary - one discover result.
 * @returns the card row.
 */
function assetRowOf(summary: ConnectorDatasetSummary): AssetRow {
  return {
    provider_id: summary.manifest.providerId,
    dataset_id: summary.id,
    title: summary.title,
    kind: summary.kind,
    ...(summary.manifest.updatedAt === undefined ? {} : { updated_at: summary.manifest.updatedAt }),
    ...(summary.manifest.description === undefined || summary.manifest.description.length === 0
      ? {}
      : { description: summary.manifest.description }),
    ...(summary.service?.price === undefined ? {} : { price: summary.service.price }),
  }
}

/**
 * Format the `list` outcome as one markdown line per asset.
 * @param rows - the projected card rows.
 * @returns the rendered listing.
 */
function formatAssetList(rows: readonly AssetRow[]): string {
  if (rows.length === 0) return 'The asset market answered with no matching assets. Rephrase the query, or assets_browse stats for the full totals.'
  const lines = rows.map((row) => {
    const anchor = row.price === undefined ? '' : `，${row.price}`
    const described = row.description === undefined ? '' : `：${row.description}`
    return `- **${row.title}**（${row.kind}${anchor}）— provider \`${row.provider_id}\`，dataset id \`${row.dataset_id}\`${described}`
  })
  lines.push('Details with assets_browse detail (provider_id + dataset_id); order an expert service through the conversation flow.')
  return lines.join('\n')
}

/**
 * Format the `detail` outcome as one asset's full card.
 * @param row - the projected card row.
 * @returns the rendered card.
 */
function formatAssetDetail(row: AssetRow): string {
  const lines = [
    `### ${row.title}`,
    `- provider \`${row.provider_id}\`，dataset id \`${row.dataset_id}\`，kind ${row.kind}`,
    ...(row.updated_at === undefined ? [] : [`- 更新时间：${row.updated_at}`]),
    ...(row.price === undefined ? [] : [`- 价格锚点：${row.price}`]),
  ]
  if (row.description !== undefined) lines.push(`- 描述：${row.description}`)
  lines.push('- 获取内容用 connector_fetch（预览）或 connector_transfer（落库）；服务类资产经对话内下单流程。')
  return lines.join('\n')
}

/** Presentation-ready projection of replayed assets_browse metadata. */
export interface AssetsBrowseMetaView {
  readonly action: AssetsBrowseAction
  readonly count: number
}

/**
 * Narrow opaque live or replayed result metadata for presentation. Malformed
 * metadata returns `undefined` so presentation falls back to the generic card.
 * @param meta - result metadata.
 * @returns the validated meta, or `undefined`.
 */
export function assetsBrowseMetaFromResult(meta: unknown): AssetsBrowseMetaView | undefined {
  if (typeof meta !== 'object' || meta === null) return undefined
  const { action, count } = meta as Record<string, unknown>
  if (action !== 'list' && action !== 'detail' && action !== 'stats') return undefined
  if (typeof count !== 'number' || !Number.isInteger(count) || count < 0) return undefined
  return { action, count }
}

/**
 * Pending-call presentation: a generic card titled by the action.
 * @param args - the raw tool arguments.
 * @returns the generic card view.
 */
export function presentAssetsBrowseCall(args: AssetsBrowseArgs): GenericCallView {
  const query = args.query?.trim() ?? ''
  return {
    card: 'generic',
    title: 'assets_browse',
    kind: 'search',
    rawInput: query.length > 0 ? query : args.action,
  }
}

/**
 * Completed-call presentation: a generic card restating the action and count.
 * @param _args - the raw tool arguments (unused; the meta carries the story).
 * @param result - the final tool result; `meta` carries the projection.
 * @returns the generic card view, or `undefined` on failure or malformed meta.
 */
export function presentAssetsBrowseResult(_args: AssetsBrowseArgs, result: ToolResult): GenericResultView | undefined {
  if (result.isError) return undefined
  const meta = assetsBrowseMetaFromResult(result.meta)
  if (meta === undefined) return undefined
  const body = meta.action === 'detail'
    ? '资产详情'
    : meta.action === 'stats'
      ? '资产目录统计'
      : `${meta.count} 个资产`
  return { card: 'generic', title: 'assets_browse', content: [{ type: 'text', text: body }] }
}

/**
 * Format the `stats` outcome; replayed values may omit optional fields, so
 * every count degrades to zero rather than crashing the render.
 */
function formatAssetStats(
  products: number | undefined,
  providers: number | undefined,
  kinds: ReadonlyArray<{ kind: string; count: number }> | undefined,
): string {
  return [
    `资产目录共 ${String(products ?? 0)} 个资产，来自 ${String(providers ?? 0)} 个提供方。`,
    ...(kinds ?? []).map(row => `- ${row.kind}：${String(row.count)}`),
  ].join('\n')
}

/**
 * Register the `assets_browse` tool and its system-prompt guidance.
 * @param ctx - context whose `tools` and `systemPrompt` registries receive the registrations.
 * @param timeoutMs - cooperative tool-call budget attached as `ToolDefinition.timeoutMs`.
 */
/** The one asset-card object shape `assets` items and the `detail` result share. */
const ASSET_ROW_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    provider_id: { type: 'string', required: true },
    dataset_id: { type: 'string', required: true },
    title: { type: 'string', required: true },
    kind: { type: 'string', required: true },
    updated_at: { type: 'string' },
    description: { type: 'string' },
    price: { type: 'string' },
  },
} as const

/**
 * Mount the read-only assets_browse tool (list/detail/stats over the market
 * catalog) with its system-prompt guidance.
 *
 * @param ctx - plugin context; the tool row is disposed with it.
 * @param timeoutMs - per-call timeout handed to the connector seam.
 */
export function applyAssetsBrowseTool(ctx: Context, timeoutMs: number): void {
  ctx.systemPrompt.section({
    name: 'tool:assets_browse',
    order: 113,
    text: 'Use the assets_browse tool for the data-asset market\'s catalog: action list (with a free-text query) shows asset cards (title, kind, provider, pricing anchor for services), detail (provider_id + dataset_id) shows one asset\'s full card, stats shows per-kind counts and provider totals. Ordering an expert service and landing a dataset stay on their own flows — this surface is read-only.',
  })

  ctx.tools.register(defineTool({
    name: 'assets_browse',
    description: 'Browse the data-asset market catalog (read-only): list assets as cards (title, kind, provider id, dataset id, pricing for services), read one asset\'s detail, or get stats (per-kind counts, providers). Use for「市场上有哪些专家服务/数据资产」questions; fetch/transfer/order go through their own tools.',
    parameters: {
      action: {
        type: 'string',
        required: true,
        enum: ['list', 'detail', 'stats'],
        description: 'list = asset cards (optional query filter); detail = one asset (provider_id + dataset_id); stats = counts.',
      },
      query: {
        type: 'string',
        description: 'Free-text filter for list, matched against each provider\'s searchable fields.',
      },
      provider_id: {
        type: 'string',
        description: 'The asset\'s owning provider id (required by detail).',
      },
      dataset_id: {
        type: 'string',
        description: 'The asset\'s dataset id within its provider (required by detail).',
      },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          action: { type: 'string', required: true, enum: ['list', 'detail', 'stats'] },
          assets: { type: 'array', items: ASSET_ROW_SCHEMA },
          asset: ASSET_ROW_SCHEMA,
          products: { type: 'number' },
          providers: { type: 'number' },
          kinds: {
            type: 'array',
            description: 'Per-kind asset counts.',
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                kind: { type: 'string', required: true },
                count: { type: 'number', required: true },
              },
            },
          },
        },
      },
      render: (_args, value) => {
        const text = value.action === 'list'
          ? formatAssetList(value.assets ?? [])
          : value.action === 'detail'
            ? (value.asset !== undefined ? formatAssetDetail(value.asset) : '')
            : formatAssetStats(value.products, value.providers, value.kinds)
        return [{ type: 'text', text }]
      },
      presentationMeta: (_args, value) => {
        return {
          action: value.action,
          count: value.action === 'list' ? (value.assets?.length ?? 0) : value.action === 'stats' ? (value.products ?? 0) : 1,
        }
      },
    },
    timeoutMs,
    // Read-only discovery projections; safe to overlap with other reads.
    isConcurrencySafe: () => true,
    async execute(args, exec) {
      const input = parseAssetsBrowseArgs(args)
      if (input.action === 'stats') {
        const summaries = await ctx.connector.discover({}, exec.signal)
        const byKind = new Map<string, number>()
        for (const summary of summaries) byKind.set(summary.kind, (byKind.get(summary.kind) ?? 0) + 1)
        return {
          action: 'stats' as const,
          products: summaries.length,
          providers: ctx.connector.describeProviders().length,
          kinds: [...byKind.entries()]
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([kind, count]) => ({ kind, count })),
        }
      }
      if (input.action === 'detail') {
        const summaries = await ctx.connector.discover({}, exec.signal)
        const found = summaries.find(summary =>
          summary.manifest.providerId === input.providerId && summary.id === input.datasetId)
        if (found === undefined) {
          throw new Error(`assets_browse: no asset "${input.datasetId}" is declared by provider "${input.providerId}"; assets_browse list carries the live ids`)
        }
        return { action: 'detail' as const, asset: assetRowOf(found) }
      }
      const query = input.query
      const summaries = await ctx.connector.discover(query === undefined ? {} : { query }, exec.signal)
      const assets = summaries
        .map(assetRowOf)
        .sort((a, b) => a.kind.localeCompare(b.kind) || a.title.localeCompare(b.title))
      return { action: 'list' as const, assets }
    },
    presentCall: presentAssetsBrowseCall,
    presentResult: presentAssetsBrowseResult,
  }))
}
