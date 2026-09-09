/**
 * Pure presentation helpers for the graph page: the node-type color scale
 * (the ui-theme `--dsw-graph-node-*` ladder, index-assigned per type id for
 * stable colors across reloads) and the built-in phrase templates that wrap
 * kg.subgraph walks as natural-language shortcuts (the Bloom pattern; only
 * read parameters — the page never writes the graph). No state, no IO.
 * @module @deepseek-ai/dsh-client-ui-kg/client/presentation
 */

/** The type-color ladder's length (the ui-theme ladder defines one var per index). */
export const KG_NODE_COLOR_COUNT = 10

/**
 * The CSS color for one node type: a stable hash of the type id onto the
 * theme ladder, so a type keeps its color across reloads and sessions.
 * @param typeId - the registry node-type id.
 * @returns a `var(--dsw-graph-node-N)` reference.
 */
export function nodeColorOf(typeId: string): string {
  let hash = 0
  for (let i = 0; i < typeId.length; i++) {
    hash = (hash * 31 + typeId.charCodeAt(i)) >>> 0
  }
  return `var(--dsw-graph-node-${hash % KG_NODE_COLOR_COUNT})`
}

/** One parsed phrase template: the seeds to walk and the hop budget. */
export interface KgPhrasePlan {
  readonly seeds: readonly string[]
  readonly hops: number
  /** Human-facing restatement shown next to the box after the parse. */
  readonly restated: string
}

/**
 * Parse the phrase box's text into a subgraph walk plan. Three built-in
 * templates come first (supply chain / orders / containment); any other
 * non-empty text treats the whole phrase as one entity seed (the search
 * box's alias resolution takes it from there). Empty or blank text parses to
 * `undefined` (no walk).
 * @param phrase - the raw phrase-box text.
 * @param restater - builds the restatement from the captured entity (locale copy).
 * @returns the walk plan, or `undefined` when the text carries no seed.
 */
export function parseKgPhrase(
  phrase: string,
  restater: (kind: 'supply' | 'orders' | 'contains', entity: string) => string,
): KgPhrasePlan | undefined {
  const text = phrase.trim()
  if (text.length === 0) return undefined
  const supplyEntity = text.match(/^(.+?)的供货(链|路径)?$/u)?.[1]?.trim()
  if (supplyEntity !== undefined && supplyEntity.length > 0) {
    return { seeds: [supplyEntity], hops: 2, restated: restater('supply', supplyEntity) }
  }
  const ordersEntity = text.match(/^(.+?)的订单$/u)?.[1]?.trim()
  if (ordersEntity !== undefined && ordersEntity.length > 0) {
    return { seeds: [ordersEntity], hops: 1, restated: restater('orders', ordersEntity) }
  }
  const containsEntity = text.match(/^(?:含|包含)(.+?)的(?:商品|产品)$/u)?.[1]?.trim()
  if (containsEntity !== undefined && containsEntity.length > 0) {
    return { seeds: [containsEntity], hops: 1, restated: restater('contains', containsEntity) }
  }
  return { seeds: [text], hops: 1, restated: text }
}
