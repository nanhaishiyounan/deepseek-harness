/**
 * Wire-contract mirrors the market surfaces render: the `assets.list` /
 * `assets.stats` rows as the gateway returns
 * them. Snake_case on purpose — these are the wire's own field names.
 * @module @deepseek-ai/dsh-client-ui-assets/client/marketTypes
 */

/** Closed asset-form vocabulary (the connector dataset kinds a card renders). */
export type MarketAssetKind = 'tabular' | 'file' | 'document' | 'expert-profile' | 'service'

/** One market product card row. */
export interface MarketAssetRow {
  readonly provider_id: string
  readonly dataset_id: string
  readonly title: string
  readonly kind: MarketAssetKind
  readonly description?: string
  readonly updated_at?: string
  readonly service_name?: string
  readonly price?: string
  readonly deliverable?: string
  readonly summary?: string
  readonly service_id?: string
  readonly expert_org?: string
  readonly domains?: readonly string[]
}

/** One featured card from the deployment's market seed. */
export interface MarketFeaturedRow {
  readonly title: string
  readonly blurb: string
  readonly tags: readonly string[]
}

/** Market counters plus the featured rail. */
export interface MarketStatsRow {
  readonly products: number
  readonly providers: number
  readonly featured: readonly MarketFeaturedRow[]
}
