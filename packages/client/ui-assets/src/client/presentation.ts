/**
 * Pure presentation helpers for the market surfaces: the human-facing
 * provider label (technical ids never surface), the kind badge vocabulary,
 * and the catalog filter. No state, no IO.
 * @module @deepseek-ai/dsh-client-ui-assets/client/presentation
 */

import type { MarketAssetKind } from './marketTypes.ts'

/**
 * The human-facing label for a provider id. Known ids map to business names;
 * an unknown id stays as-is (it is already user-facing copy from that
 * provider's own registration, not an internal path).
 * @param providerId - the connector seam's provider id.
 * @returns the business-facing label.
 */
export function providerLabelOf(providerId: string): string {
  if (providerId === 'connector-nocobase') return 'NocoBase 业务后台'
  if (providerId === 'connector-file') return '文件投递目录'
  return providerId
}

/** The filter's kind dimension: the full set plus "all". */
export const MARKET_KIND_FILTERS: readonly (MarketAssetKind | 'all')[] = [
  'all', 'service', 'tabular', 'document', 'expert-profile', 'file',
]

/**
 * Filter the catalog by free text (title, description, domains) and kind.
 * @param assets - the full catalog.
 * @param query - free-text query; empty matches everything.
 * @param kind - the kind filter; `all` matches every kind.
 * @returns the matching rows, input order preserved.
 */
export function filterCatalog<T extends {
  title: string
  kind: MarketAssetKind
  description?: string
  domains?: readonly string[]
}>(
  assets: readonly T[],
  query: string,
  kind: MarketAssetKind | 'all',
): readonly T[] {
  const needle = query.trim().toLowerCase()
  return assets.filter((asset) => {
    if (kind !== 'all' && asset.kind !== kind) return false
    if (needle === '') return true
    const haystack = [asset.title, asset.description ?? '', ...(asset.domains ?? [])].join(' ').toLowerCase()
    return haystack.includes(needle)
  })
}
