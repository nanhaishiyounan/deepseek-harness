/**
 * Model-facing `connector_discover`, `connector_fetch`, and
 * `connector_transfer` tools over `ctx.connector`. This package owns
 * schemas, validation, prompt guidance, budgets, and presentation, never
 * concrete providers. Enablement controls tool registration; an enabled tool
 * stays visible when its providers are unavailable and fails with a
 * structured error at execution time (the seam's documented degraded mode).
 * @module @deepseek-ai/dsh-tool-connector
 */

import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { applyAssetsBrowseTool } from './assets.ts'
import { applyConnectorDiscoverTool } from './discover.ts'
import { applyConnectorFetchTool } from './fetch.ts'
import { applyConnectorTransferTool } from './transfer.ts'
import { applyOrderCreateTool, applyOrderStatusTool } from './order.ts'

export {
  assetsBrowseMetaFromResult,
  parseAssetsBrowseArgs,
  presentAssetsBrowseCall,
  presentAssetsBrowseResult,
} from './assets.ts'
export type {
  AssetsBrowseAction, AssetsBrowseArgs, AssetsBrowseInput, AssetsBrowseMetaView, AssetsBrowseToolValue, AssetRow,
} from './assets.ts'
export {
  discoverMetaFromResult,
  discoverValueFromSummaries,
  formatDiscoverOutput,
  parseDiscoverArgs,
  presentDiscoverCall,
  presentDiscoverResult,
} from './discover.ts'
export type {
  ConnectorDiscoverArgs,
  ConnectorDiscoverInput,
  ConnectorDiscoverToolValue,
  DiscoverEntry,
  DiscoverExpertMeta,
  DiscoverExpertView,
  DiscoverMetaView,
  DiscoverServiceView,
} from './discover.ts'
export {
  FETCH_PREVIEW_CHARS,
  FETCH_PREVIEW_ROWS,
  fetchMetaFromResult,
  fetchValueFromDataset,
  formatFetchOutput,
  parseFetchArgs,
  presentFetchCall,
  presentFetchResult,
  resolveProvider,
} from './fetch.ts'
export type { ConnectorFetchArgs, ConnectorFetchInput, ConnectorFetchToolValue, FetchMetaView } from './fetch.ts'
export {
  formatOrderCreateOutput,
  formatOrderStatusOutput,
  orderCreateMetaFromResult,
  orderEntryOf,
  parseOrderCreateArgs,
  parseOrderStatusArgs,
  presentOrderCreateCall,
  presentOrderCreateResult,
  presentOrderStatusCall,
  presentOrderStatusResult,
} from './order.ts'
export type {
  OrderCreateArgs,
  OrderCreateMetaView,
  OrderCreateToolValue,
  OrderEntry,
  OrderStatusArgs,
  OrderStatusMetaView,
  OrderStatusToolValue,
} from './order.ts'
export {
  formatTransferOutput,
  parseTransferArgs,
  presentTransferCall,
  presentTransferResult,
  transferMetaFromResult,
} from './transfer.ts'
export type { ConnectorTransferArgs, ConnectorTransferInput, ConnectorTransferToolValue, TransferMetaView } from './transfer.ts'

/** Cordis plugin name used by loader diagnostics. */
export const name = 'tool-connector'

/** Services required by the connector tool suite. */
export const inject = ['tools', 'connector', 'systemPrompt']

/** Default cooperative tool-call timeout budget (ms) for `connector_discover`. */
export const DEFAULT_DISCOVER_TIMEOUT_MS = 15_000

/** Default cooperative tool-call timeout budget (ms) for `connector_fetch`. */
export const DEFAULT_FETCH_TIMEOUT_MS = 30_000

/** Default cooperative tool-call timeout budget (ms) for `connector_transfer`. */
export const DEFAULT_TRANSFER_TIMEOUT_MS = 120_000

/** Default cooperative tool-call timeout budget (ms) for `order_create` (covers the whole drafting pipeline). */
export const DEFAULT_ORDER_CREATE_TIMEOUT_MS = 60_000

/** Default cooperative tool-call timeout budget (ms) for `order_status`. */
export const DEFAULT_ORDER_STATUS_TIMEOUT_MS = 10_000

/** Default cooperative tool-call timeout budget (ms) for `assets_browse`. */
export const DEFAULT_ASSETS_BROWSE_TIMEOUT_MS = 15_000

/** Plugin config: which connector tools to register, per-tool budgets, and the bound tenant. */
export interface Config {
  /** Register `connector_discover`. Defaults to true. */
  discover?: boolean
  /** Register `connector_fetch`. Defaults to true. */
  fetch?: boolean
  /** Register `connector_transfer`. Defaults to true. */
  transfer?: boolean
  /** Register `order_create`/`order_status`. Defaults to true. */
  orders?: boolean
  /**
   * The tenant every connector landing operates on — the deployment-side
   * tenant binding. The model never supplies a tenant; a `tenant` argument
   * on any connector tool call is rejected. Required, so a composition
   * without a binding fails config validation at load.
   */
  tenant: string
  /** Cooperative timeout budget (ms) for `connector_discover`. Defaults to 15000. */
  discoverTimeoutMs?: number
  /** Cooperative timeout budget (ms) for `connector_fetch`. Defaults to 30000. */
  fetchTimeoutMs?: number
  /** Cooperative timeout budget (ms) for `connector_transfer`. Defaults to 120000. */
  transferTimeoutMs?: number
  /**
   * Cooperative timeout budget (ms) for `order_create` (the whole drafting pipeline).
   * Defaults to 60000. Must clear the composed expert-orders `draftTimeoutMs`
   * plus its non-draft steps (NocoBase reads/writes, kb retrieval, PDF
   * rendering, attachment upload) — an under-sized budget surfaces as
   * `TOOL_TIMEOUT` mid-draft, stranding a `generating` order.
   */
  orderCreateTimeoutMs?: number
  /** Cooperative timeout budget (ms) for `order_status`. Defaults to 10000. */
  orderStatusTimeoutMs?: number
  /** Register `assets_browse` (the market catalog's read-only browse face). Defaults to true. */
  assets?: boolean
  /** Cooperative timeout budget (ms) for `assets_browse`. Defaults to 15000. */
  assetsTimeoutMs?: number
}

export const Config: z<Config> = z.object({
  discover: z.boolean().default(true),
  fetch: z.boolean().default(true),
  transfer: z.boolean().default(true),
  tenant: z.string().required(),
  discoverTimeoutMs: z.number().step(1).min(1).default(DEFAULT_DISCOVER_TIMEOUT_MS),
  fetchTimeoutMs: z.number().step(1).min(1).default(DEFAULT_FETCH_TIMEOUT_MS),
  transferTimeoutMs: z.number().step(1).min(1).default(DEFAULT_TRANSFER_TIMEOUT_MS),
  orders: z.boolean().default(true),
  orderCreateTimeoutMs: z.number().step(1).min(1).default(DEFAULT_ORDER_CREATE_TIMEOUT_MS),
  orderStatusTimeoutMs: z.number().step(1).min(1).default(DEFAULT_ORDER_STATUS_TIMEOUT_MS),
  assets: z.boolean().default(true),
  assetsTimeoutMs: z.number().step(1).min(1).default(DEFAULT_ASSETS_BROWSE_TIMEOUT_MS),
})

/** Complete config after schemastery applies every field default. */
type ResolvedConfig = Required<Config>

/**
 * Register the enabled connector tools, all bound to the deployment's
 * `tenant`. Each tool's cooperative timeout budget is attached as
 * `ToolDefinition.timeoutMs` for `@deepseek-ai/dsh-tool-call-timeout-policy`
 * to enforce. The tools' disposers are fiber-scoped, so no manual teardown is
 * needed.
 * @param ctx - context whose registries receive the registrations.
 * @param config - validated plugin configuration; `tenant` is required.
 */
export function apply(ctx: Context, config: Config): void {
  // schemastery (Config) has already filled every defaulted field.
  const resolved = config as ResolvedConfig
  if (resolved.discover) {
    applyConnectorDiscoverTool(ctx, resolved.discoverTimeoutMs)
  }
  if (resolved.fetch) {
    applyConnectorFetchTool(ctx, resolved.fetchTimeoutMs)
  }
  if (resolved.transfer) {
    applyConnectorTransferTool(ctx, resolved.tenant, resolved.transferTimeoutMs)
  }
  if (resolved.orders) {
    applyOrderCreateTool(ctx, resolved.orderCreateTimeoutMs)
    applyOrderStatusTool(ctx, resolved.orderStatusTimeoutMs)
  }
  if (resolved.assets) {
    applyAssetsBrowseTool(ctx, resolved.assetsTimeoutMs)
  }
}
