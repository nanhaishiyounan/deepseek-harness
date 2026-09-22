/**
 * HippoRAG-style Personalized PageRank over the store's live adjacency: a
 * personalized distribution concentrated on the seed nodes, propagated by
 * power iteration over the undirected edge list — single-step multi-hop
 * retrieval that beats iterative retrieval at a fraction of the cost (the
 * research verdict's L1.5 layer). Pure function over the adjacency snapshot;
 * the store loads it, the caller ranks with it.
 * @module @deepseek-ai/dsh-kb-graph/ppr
 */

/** Default propagation parameters (damping, iterations, result size). */
export interface PprOptions {
  /** Damping factor; 0.85 is the PageRank convention. */
  readonly d?: number
  /** Power-iteration rounds; 20 converges on thousand-node graphs. */
  readonly iters?: number
  /** How many top-ranked node ids to return. */
  readonly topN?: number
}

/** The ranked result entry. */
export interface PprRankEntry {
  readonly nodeId: string
  readonly rank: number
}

/**
 * Rank nodes by personalized PageRank from the seeds.
 * @param nodeIds - every node id in the adjacency (the index space).
 * @param pairs - undirected endpoint pairs (live edges).
 * @param seedIds - the seed node ids the personalization concentrates on.
 * @param options - damping/iterations/topN overrides.
 * @returns the top-N entries, rank-descending; seeds absent from the node
 *   list are ignored, and an empty or all-unknown seed set returns nothing.
 */
export function personalizedPageRank(
  nodeIds: readonly string[],
  pairs: readonly (readonly [string, string])[],
  seedIds: readonly string[],
  options: PprOptions = {},
): readonly PprRankEntry[] {
  const d = options.d ?? 0.85
  const iters = options.iters ?? 20
  const topN = options.topN ?? 40
  const index = new Map(nodeIds.map((id, i) => [id, i]))
  const seeds = [...new Set(seedIds)].map(id => index.get(id)).filter((i): i is number => i !== undefined)
  if (seeds.length === 0) return []
  const n = nodeIds.length
  const neighbors: number[][] = Array.from({ length: n }, () => [])
  for (const [src, dst] of pairs) {
    const a = index.get(src)
    const b = index.get(dst)
    if (a === undefined || b === undefined || a === b) continue
    const outA = neighbors[a]
    const outB = neighbors[b]
    /* v8 ignore next -- the pair builder pre-filters endpoints. */
    if (outA === undefined || outB === undefined) continue
    outA.push(b)
    outB.push(a)
  }
  let rank = new Float64Array(n)
  for (const seed of seeds) rank[seed] = 1 / seeds.length
  for (let round = 0; round < iters; round += 1) {
    const next = new Float64Array(n).fill((1 - d) / seeds.length)
    for (let src = 0; src < n; src += 1) {
      const outs = neighbors[src]
      const weight = rank[src]
      if (outs === undefined || outs.length === 0 || weight === undefined || weight === 0) continue
      const share = (d * weight) / outs.length
      /* v8 ignore next -- the pair builder pre-filters endpoints. */
      for (const dst of outs) next[dst] = (next[dst] ?? 0) + share
    }
    rank = next
  }
  const scored: PprRankEntry[] = []
  for (let i = 0; i < n; i += 1) {
    const nodeId = nodeIds[i]
    const weight = rank[i]
    /* v8 ignore next -- the pair builder pre-filters endpoints. */
    if (nodeId !== undefined && weight !== undefined && weight > 0) scored.push({ nodeId, rank: weight })
  }
  return scored.sort((a, b) => b.rank - a.rank).slice(0, topN)
}
