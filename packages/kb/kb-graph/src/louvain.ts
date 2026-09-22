/**
 * Deterministic Louvain community detection as pure functions over flat
 * adjacency (the same input contract as `personalizedPageRank`): no graph
 * library dependency, no IO, no state — the caller (the seam's
 * `communities()` read or a pipeline pass) owns the store reads, and the
 * browser consumes precomputed assignments. Node order is the tie-breaker
 * everywhere, so the same graph always yields the same partition.
 *
 * Weight convention: every adjacency slot stores directed stubs — a
 * non-self pair writes one stub each way, a self-loop writes both stubs
 * into its single slot — so `2m`, degrees, Σin, and the quotient's
 * self-loops all count the same stubs and modularity stays invariant
 * across aggregation levels.
 * @module @deepseek-ai/dsh-kb-graph/louvain
 */

/** One level's local-moving pass budget (convergence is typically ≤ 5). */
const MAX_PASSES_PER_LEVEL = 30
/** The aggregation-phase cap; deeper graphs stop on the modularity plateau. */
const MAX_LEVELS = 12

/** The detection result: per-node community plus the partition's modularity. */
export interface LouvainResult {
  /** Node id → community id, renumbered 0..k-1 in first-node-seen order. */
  readonly assignments: ReadonlyMap<string, number>
  /** The partition's modularity (−0.5..1; singletons on an edgeless graph score 0). */
  readonly modularity: number
  /** The community count. */
  readonly communities: number
}

/** The mutable level graph the local-moving phase rewrites. */
interface LevelGraph {
  /** Weighted degree per node (every adjacency slot is a stub). */
  readonly degrees: readonly number[]
  /** neighbor index → directed stub weight into that neighbor. */
  readonly adjacency: ReadonlyArray<Map<number, number>>
  /** 2m: the total stub count the modularity denominator uses. */
  readonly totalWeight2: number
}

/** Sum the degrees and total stubs off one adjacency table. */
function tally(adjacency: ReadonlyArray<Map<number, number>>): { degrees: number[]; totalWeight2: number } {
  const degrees = adjacency.map((neighbors) => {
    let degree = 0
    for (const weight of neighbors.values()) degree += weight
    return degree
  })
  let totalWeight2 = 0
  for (const degree of degrees) totalWeight2 += degree
  return { degrees, totalWeight2 }
}

/**
 * Build one level graph: ids map to indices in input order, parallel pairs
 * aggregate their weights, and a self-pair becomes a self-loop.
 * @param nodeIds - the graph's node ids.
 * @param pairs - undirected endpoint pairs (multi-edges allowed).
 */
function buildLevel(nodeIds: readonly string[], pairs: readonly (readonly [string, string])[]): LevelGraph {
  const indexOf = new Map<string, number>()
  nodeIds.forEach((id, index) => { indexOf.set(id, index) })
  const adjacency: Map<number, number>[] = nodeIds.map((): Map<number, number> => new Map())
  for (const pair of pairs) {
    const src = indexOf.get(pair[0])
    const dst = indexOf.get(pair[1])
    if (src === undefined || dst === undefined) continue
    if (src === dst) {
      // Both stubs ride the one self slot.
      // oxlint-disable-next-line typescript/no-unnecessary-condition -- noUncheckedIndexedAccess makes the index access optional.
      adjacency[src]?.set(src, (adjacency[src]?.get(src) ?? 0) + 2)
    } else {
      // oxlint-disable-next-line typescript/no-unnecessary-condition -- noUncheckedIndexedAccess makes the index access optional.
      adjacency[src]?.set(dst, (adjacency[src]?.get(dst) ?? 0) + 1)
      // oxlint-disable-next-line typescript/no-unnecessary-condition -- noUncheckedIndexedAccess makes the index access optional.
      adjacency[dst]?.set(src, (adjacency[dst]?.get(src) ?? 0) + 1)
    }
  }
  const { degrees, totalWeight2 } = tally(adjacency)
  return { degrees, adjacency, totalWeight2 }
}

/**
 * One level's modularity of the current partition.
 * @param graph - the level graph.
 * @param community - community index per node.
 * @returns Q = Σc [ Σin/2m − (Σtot/2m)² ].
 */
function modularityOf(graph: LevelGraph, community: readonly number[]): number {
  if (graph.totalWeight2 === 0) return 0
  const intra = new Map<number, number>()
  const totals = new Map<number, number>()
  for (let node = 0; node < community.length; node++) {
    /* v8 ignore next -- pre-sized arrays always index. */
    const own = community[node] ?? 0
    /* v8 ignore next -- pre-sized arrays always index. */
    totals.set(own, (totals.get(own) ?? 0) + (graph.degrees[node] ?? 0))
    /* v8 ignore next -- pre-sized arrays always index. */
    for (const [neighbor, weight] of graph.adjacency[node] ?? []) {
      /* v8 ignore next -- pre-sized arrays always index. */
      if ((community[neighbor] ?? 0) === own) intra.set(own, (intra.get(own) ?? 0) + weight)
    }
  }
  let q = 0
  for (const [own, total] of totals) {
    /* v8 ignore next -- pre-sized arrays always index. */
    const inside = intra.get(own) ?? 0
    q += inside / graph.totalWeight2 - (total / graph.totalWeight2) ** 2
  }
  return q
}

/**
 * One Louvain level: greedy local moving over the level graph, nodes visited
 * in index order, modularity-gain ties resolved toward the smaller community
 * id, so the phase is a pure function of the input.
 * @param graph - the level graph.
 * @returns the community index per node (renumbered densely).
 */
function localMoving(graph: LevelGraph): number[] {
  const community = graph.degrees.map((_, index) => index)
  const commTotal = [...graph.degrees]
  let moved = true
  let passes = 0
  while (moved && passes < MAX_PASSES_PER_LEVEL) {
    moved = false
    passes += 1
    for (let node = 0; node < community.length; node++) {
      const own = community[node]
      /* v8 ignore next -- pre-sized arrays always index. */
      const degree = graph.degrees[node] ?? 0
      /* v8 ignore next -- pre-sized arrays always index. */
      if (own === undefined) continue
      // Detach first so the node's own community is a fair candidate.
      /* v8 ignore next -- pre-sized arrays always index. */
      commTotal[own] = (commTotal[own] ?? 0) - degree
      const weightsInto = new Map<number, number>()
      /* v8 ignore next -- pre-sized arrays always index. */
      for (const [neighbor, weight] of graph.adjacency[node] ?? []) {
        const neighborCommunity = community[neighbor]
        /* v8 ignore next -- pre-sized arrays always index. */
        if (neighborCommunity === undefined) continue
        weightsInto.set(neighborCommunity, (weightsInto.get(neighborCommunity) ?? 0) + weight)
      }
      let best = own
      // ΔQ ∝ k_{i,in} − Σtot_c · k_i / 2m; scaling by 2m stays integral.
      /* v8 ignore next -- pre-sized arrays always index. */
      let bestGain = (weightsInto.get(own) ?? 0) * graph.totalWeight2 - (commTotal[own] ?? 0) * degree
      for (const [candidate, weightIn] of weightsInto) {
        if (candidate === own) continue
        /* v8 ignore next -- pre-sized arrays always index. */
        const gain = weightIn * graph.totalWeight2 - (commTotal[candidate] ?? 0) * degree
        if (gain > bestGain || (gain === bestGain && candidate < best)) {
          best = candidate
          bestGain = gain
        }
      }
      community[node] = best
      /* v8 ignore next -- pre-sized arrays always index. */
      commTotal[best] = (commTotal[best] ?? 0) + degree
      if (best !== own) moved = true
    }
  }
  // Renumber densely in first-seen order so ids stay small and stable.
  const dense = new Map<number, number>()
  return community.map((own) => {
    let next = dense.get(own)
    if (next === undefined) {
      next = dense.size
      dense.set(own, next)
    }
    return next
  })
}

/**
 * Aggregate one level's partition into the next level's quotient graph. The
 * stub convention carries over: cross-community edges fold one stub each
 * way, intra-community stubs fold into the super-node's self slot.
 * @param graph - the level graph.
 * @param community - the level's community per node.
 * @returns the quotient level graph.
 */
function aggregate(graph: LevelGraph, community: readonly number[]): LevelGraph {
  const count = Math.max(0, ...community) + 1
  const adjacency: Map<number, number>[] = Array.from({ length: count }, (): Map<number, number> => new Map())
  for (let node = 0; node < community.length; node++) {
    const own = community[node]
    /* v8 ignore next -- pre-sized arrays always index. */
    if (own === undefined) continue
    /* v8 ignore next -- pre-sized arrays always index. */
    for (const [neighbor, weight] of graph.adjacency[node] ?? []) {
      /* v8 ignore next -- pre-sized arrays always index. */
      const other = community[neighbor] ?? own
      // oxlint-disable-next-line typescript/no-unnecessary-condition -- noUncheckedIndexedAccess makes the index access optional.
      adjacency[own]?.set(other, (adjacency[own]?.get(other) ?? 0) + weight)
    }
  }
  const { degrees, totalWeight2 } = tally(adjacency)
  return { degrees, adjacency, totalWeight2 }
}

/**
 * Detect communities with the two-phase Louvain method (local moving +
 * aggregation, repeated while modularity improves). Pure and deterministic:
 * the same node ids and pairs always produce the same partition.
 * @param nodeIds - the graph's node ids (any duplicates collapse by first occurrence).
 * @param pairs - undirected endpoint pairs; endpoints outside `nodeIds` drop out.
 * @returns the assignments and the partition's modularity.
 */
export function louvainCommunities(
  nodeIds: readonly string[],
  pairs: readonly (readonly [string, string])[],
): LouvainResult {
  const unique = [...new Set(nodeIds)]
  let graph = buildLevel(unique, pairs)
  // Unfolding: membership[i] tracks the current-level super-node each
  // original node folded into.
  let membership = unique.map((_, index) => index)
  let modularity = -1
  for (let level = 0; level < MAX_LEVELS; level++) {
    const community = localMoving(graph)
    const q = modularityOf(graph, community)
    if (q <= modularity) break
    modularity = q
    if (new Set(community).size === community.length) break
    // Fold: each original node's next membership is its super-node's community.
    /* v8 ignore next -- pre-sized arrays always index. */
    membership = membership.map(superNode => community[superNode] ?? superNode)
    graph = aggregate(graph, community)
  }
  const dense = new Map<number, number>()
  const assignments = new Map<string, number>()
  for (let index = 0; index < unique.length; index++) {
    /* v8 ignore next -- pre-sized arrays always index. */
    const raw = membership[index] ?? index
    let id = dense.get(raw)
    if (id === undefined) {
      id = dense.size
      dense.set(raw, id)
    }
    /* v8 ignore next -- pre-sized arrays always index. */
    assignments.set(unique[index] ?? '', id)
  }
  return { assignments, modularity, communities: dense.size }
}
