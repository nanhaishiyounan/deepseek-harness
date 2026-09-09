/**
 * assets domain contract: the data-asset market surface over the host's
 * optional `ctx.connector` capability. Discovery summaries (datasets plus
 * expert services) project into product-card views; ordering stays on the
 * orders domain (`orders.create` with the service dataset id) — this domain
 * is read-only. Like orders, the seam is deliberately NOT in the gateway's
 * inject list: a deployment without the connector capability keeps a working
 * gateway, and every method fails with the structured `assets-not-composed`
 * error until `assetsEnabled` opts the domain in.
 */

import type { RpcRequest, RpcResponse } from './rpc.ts'

/** Closed asset-form vocabulary on the wire (the connector dataset kinds a market card renders). */
export type AssetKindView = 'tabular' | 'file' | 'document' | 'expert-profile' | 'service'

/**
 * One market product card as the wire projects it: a connector dataset
 * summary flattened for browsing, with the service/expert extensions the
 * detail panel and the order confirm card read.
 */
export interface AssetView {
  /** Owning provider id (the provenance line a card shows). */
  readonly provider_id: string
  /** Dataset identity within its provider. */
  readonly dataset_id: string
  readonly title: string
  readonly kind: AssetKindView
  /** One-line human-facing description from the manifest, when published. */
  readonly description?: string
  /** ISO-8601 timestamp of the source record's last update, when known. */
  readonly updated_at?: string
  /** Service name, present on service entries. */
  readonly service_name?: string
  /** Pricing line (for example `¥8,800/份`), present on service entries. */
  readonly price?: string
  /** Deliverable form (for example `PDF 方案`), present on service entries. */
  readonly deliverable?: string
  /** One-line service summary, present on service entries. */
  readonly summary?: string
  /** Ordering id for `orders.create`, present on orderable service entries. */
  readonly service_id?: string
  /** Affiliation line, present on expert-profile entries. */
  readonly expert_org?: string
  /** Domain tags, present on expert-profile entries. */
  readonly domains?: readonly string[]
}

/** Featured-product copy from the deployment's market seed file (the operations seat, data outside code). */
export interface AssetFeaturedView {
  readonly title: string
  readonly blurb: string
  readonly tags: readonly string[]
}

/** Market counters plus the featured rail the portal hero shows. */
export interface AssetsStatsView {
  /** Catalog size across every discoverable provider. */
  readonly products: number
  /** Registered providers. */
  readonly providers: number
  /** Orders placed in the current calendar month (0 when no orders seam is composed). */
  readonly monthly_orders: number
  /** Featured cards from the seed file; empty without one. */
  readonly featured: readonly AssetFeaturedView[]
}

/** Data-asset market methods; every call fails loud when no connector capability is composed. */
export interface AssetsApi {
  /**
   * List the market catalog: every dataset every available provider declares,
   * ordered by provider id then dataset id.
   */
  list(request: RpcRequest<{ query?: string }>, signal?: AbortSignal): Promise<RpcResponse<{ assets: readonly AssetView[] }>>

  /** Read one asset's detail projection (the list row plus its service/expert extensions). */
  detail(
    request: RpcRequest<{ provider_id: string; dataset_id: string }>,
    signal?: AbortSignal,
  ): Promise<RpcResponse<AssetView>>

  /** Read the market counters and the featured rail. */
  stats(request: RpcRequest<Record<string, never>>, signal?: AbortSignal): Promise<RpcResponse<AssetsStatsView>>
}
