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

/**
 * The ontology root one class descends from: the top-most ancestor reached
 * by walking `extends`, or the class itself. Semantic coloring groups every
 * subclass under its root's hue, so the canvas reads the ontology's layer
 * structure instead of per-type hash noise.
 * @param typeId - the registry node-type id.
 * @param parentOf - resolves one class id to its `extends` parent id.
 * @returns the root class id (the class itself when it has no parent).
 */
export function semanticRootOf(typeId: string, parentOf: (id: string) => string | undefined): string {
  let cursor = typeId
  const seen = new Set<string>()
  while (!seen.has(cursor)) {
    seen.add(cursor)
    const parent = parentOf(cursor)
    if (parent === undefined) return cursor
    cursor = parent
  }
  return cursor
}

/**
 * The CSS color for one ontology root: the same ladder {@link nodeColorOf}
 * hashes onto, keyed by the root id so every descendant shares one hue.
 * @param rootId - the ontology-root class id.
 * @returns a `var(--dsw-graph-node-N)` reference.
 */
export function semanticColorOf(rootId: string): string {
  return nodeColorOf(rootId)
}

/**
 * The CSS color for one louvain community index (the community coloring
 * mode): the ladder walked by index, wrapping past its end.
 * @param communityId - the community id (0..k-1).
 * @returns a `var(--dsw-graph-node-N)` reference.
 */
export function communityColorOf(communityId: number): string {
  const safe = communityId >= 0 ? communityId : 0
  return `var(--dsw-graph-node-${safe % KG_NODE_COLOR_COUNT})`
}

/** One parsed phrase template: the seeds to walk and the hop budget. */
export interface KgPhrasePlan {
  readonly seeds: readonly string[]
  readonly hops: number
  /** Human-facing restatement shown next to the box after the parse. */
  readonly restated: string
}

/** The offline template table: pattern → restatement kind plus walk hops. Each pattern mirrors its server-side kg-nl template. */
const OFFLINE_TEMPLATES: ReadonlyArray<{
  readonly pattern: RegExp
  readonly kind: OfflinePhraseKind
  readonly hops: number
}> = [
  { pattern: /^(.+?)的原料来自哪些供应商$/u, kind: 'input-suppliers', hops: 2 },
  { pattern: /^(.+?)(?:批次)?流向(?:了)?(?:哪些|什么)?客户$/u, kind: 'batch-flow', hops: 2 },
  { pattern: /^(.+?)的供应商$/u, kind: 'suppliers', hops: 2 },
  { pattern: /^(.+?)的客户$/u, kind: 'customers', hops: 2 },
  { pattern: /^(.+?)由(?:哪些|什么)?原料(?:制成|做成|生产)?$/u, kind: 'made-from', hops: 1 },
  { pattern: /^(.+?)的供货(链|路径)?$/u, kind: 'supply', hops: 2 },
  { pattern: /^(.+?)的订单$/u, kind: 'orders', hops: 1 },
  { pattern: /^(?:含|包含)(.+?)的(?:商品|产品)$/u, kind: 'contains', hops: 1 },
]

/** The offline fallback's restatement kinds (the locale's phrase.restate.* keys). */
export type OfflinePhraseKind =
  | 'supply' | 'orders' | 'contains'
  | 'input-suppliers' | 'batch-flow' | 'suppliers' | 'customers' | 'made-from'

/**
 * Parse the phrase box's text into a subgraph walk plan. Eight built-in
 * templates mirror the server-side compiler (supply chain / orders /
 * containment plus the trace family); any other non-empty text treats the
 * whole phrase as one entity seed (the search box's alias resolution takes
 * it from there). Empty or blank text parses to `undefined` (no walk).
 * @param phrase - the raw phrase-box text.
 * @param restater - builds the restatement from the captured entity (locale copy).
 * @returns the walk plan, or `undefined` when the text carries no seed.
 */
export function parseKgPhrase(
  phrase: string,
  restater: (kind: OfflinePhraseKind, entity: string) => string,
): KgPhrasePlan | undefined {
  const text = phrase.trim()
  if (text.length === 0) return undefined
  for (const template of OFFLINE_TEMPLATES) {
    const entity = text.match(template.pattern)?.[1]?.trim()
    if (entity !== undefined && entity.length > 0) {
      return { seeds: [entity], hops: template.hops, restated: restater(template.kind, entity) }
    }
  }
  return { seeds: [text], hops: 1, restated: text }
}
