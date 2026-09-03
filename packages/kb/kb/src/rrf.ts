/**
 * Reciprocal-rank fusion for the knowledge-base hybrid retrieval: combine the
 * full-text and vector rankings without score normalization.
 * @module @deepseek-ai/dsh-kb/rrf
 */

/** One fused candidate with its RRF score. */
export interface RrfEntry {
  readonly id: number
  readonly score: number
}

/**
 * Fuse two ranked id lists with reciprocal-rank fusion.
 * @param textIds - full-text ranking, best first.
 * @param vectorIds - vector ranking, best first.
 * @param k - rank-damping constant (the seam's `rrfK` config); larger values
 *   flatten the contribution gap between adjacent ranks.
 * @returns candidates ordered by descending fused score, ties broken by id.
 */
export function fuseRrf(textIds: readonly number[], vectorIds: readonly number[], k: number): RrfEntry[] {
  const scores = new Map<number, number>()
  const add = (ids: readonly number[]): void => {
    for (const [rank, id] of ids.entries()) {
      scores.set(id, (scores.get(id) ?? 0) + 1 / (k + rank + 1))
    }
  }
  add(textIds)
  add(vectorIds)
  return [...scores]
    .map(([id, score]) => ({ id, score }))
    .sort((a, b) => b.score - a.score || a.id - b.id)
}
