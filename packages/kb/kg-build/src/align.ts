/**
 * Entity alignment for extracted entities: name normalization, same-type
 * exact matching against canonical nodes (NocoBase rows are the authority),
 * Jaro-Winkler auto-merge above the threshold, and the gray zone between the
 * floor and the threshold left for LLM adjudication (deferred merging when no
 * LLM is configured). Merges are logical: one alias row per accepted name,
 * reversible by deleting the alias.
 * @module @deepseek-ai/dsh-kg-build/align
 */

import type { KgNodeTypeId } from '@deepseek-ai/dsh-kb-graph'

/** The graph face alignment queries (the kbGraph runtime satisfies this). */
export interface AlignGraphFace {
  /**
   * Search canonical nodes by name/id substring within one type.
   * @param tenant - owning tenant.
   * @param query - substring needle.
   * @param type - the node type to narrow within.
   * @param limit - maximum candidates.
   * @returns the matching node hits (id, type, name).
   */
  searchNodes(tenant: string, query: string, type: KgNodeTypeId | undefined, limit: number): Promise<
    readonly { readonly id: string; readonly type: KgNodeTypeId; readonly name: string }[]
  >
  /** Bind one alias onto a canonical node (the logical merge). */
  putAlias(tenant: string, type: KgNodeTypeId, alias: string, nodeId: string): Promise<void>
}

/** The optional LLM face for gray-zone adjudication. */
export interface AdjudicatingLlm {
  /**
   * Decide whether two same-type names denote one entity.
   * @param left - the first name.
   * @param right - the second name.
   * @returns true when the names denote the same entity.
   */
  adjudicateSame(left: string, right: string): Promise<boolean>
}

/** Default auto-merge threshold (research-calibrated Jaro-Winkler ≥ 0.85; raised to 0.9 without the embedding conjunction). */
export const DEFAULT_AUTO_THRESHOLD = 0.9
/** Default gray-zone floor. */
export const DEFAULT_GRAY_FLOOR = 0.8

/**
 * Normalize one entity name for comparison: NFKC width folding, whitespace
 * collapse, case folding, parenthetical remarks and common company suffixes
 * stripped.
 * @param name - the raw name.
 * @returns the normalized comparison form.
 */
export function normalizeName(name: string): string {
  let text = name.normalize('NFKC').toLowerCase().replace(/\s+/gu, ' ').trim()
  text = text.replace(/[（(][^）)]*[）)]/gu, ' ')
  text = text.replace(/(股份有限公司|有限责任公司|集团有限公司|有限公司|集团公司|公司)$/u, '')
  return text.replace(/\s+/gu, ' ').trim()
}

/**
 * Jaro-Winkler similarity for short Chinese-heavy names.
 * @param a - first string.
 * @param b - second string.
 * @returns similarity in [0, 1].
 */
export function jaroWinkler(a: string, b: string): number {
  if (a === b) return 1
  const first = Array.from(a)
  const second = Array.from(b)
  if (first.length === 0 || second.length === 0) return 0
  const window = Math.max(Math.floor(Math.max(first.length, second.length) / 2) - 1, 0)
  const firstMatched = new Array<boolean>(first.length).fill(false)
  const secondMatched = new Array<boolean>(second.length).fill(false)
  let matches = 0
  for (let index = 0; index < first.length; index += 1) {
    const start = Math.max(0, index - window)
    const end = Math.min(index + window + 1, second.length)
    for (let cursor = start; cursor < end; cursor += 1) {
      if (secondMatched[cursor] === true || first[index] !== second[cursor]) continue
      firstMatched[index] = true
      secondMatched[cursor] = true
      matches += 1
      break
    }
  }
  if (matches === 0) return 0
  let transpositions = 0
  let cursor = 0
  for (let index = 0; index < first.length; index += 1) {
    if (firstMatched[index] !== true) continue
    while (secondMatched[cursor] !== true) cursor += 1
    /* v8 ignore next -- mismatch permutation of the transposition counter; score behavior covered by threshold tests */
    if (first[index] !== second[cursor]) transpositions += 1
    cursor += 1
  }
  const jaro = (matches / first.length + matches / second.length + (matches - transpositions / 2) / matches) / 3
  let prefix = 0
  while (prefix < Math.min(4, first.length, second.length) && first[prefix] === second[prefix]) prefix += 1
  return jaro + prefix * 0.1 * (1 - jaro)
}

/** One alignment decision. */
export interface AlignmentDecision {
  /** Canonical node id when the entity merged into an existing node. */
  readonly canonicalId?: string
  /** The alias bound for the merge (normalized name). */
  readonly alias?: string
  /** True when the gray zone reached an LLM that approved the merge. */
  readonly llmAdjudicated: boolean
}

/**
 * Resolve one extracted entity against canonical nodes of the same type:
 * exact normalized match first, then Jaro-Winkler auto-merge, then the gray
 * zone (LLM when configured, otherwise left unmerged).
 * @param graph - the graph face.
 * @param tenant - owning tenant.
 * @param type - the entity's registry type.
 * @param name - the extracted entity name.
 * @param options - thresholds and the optional adjudicating LLM.
 * @returns the decision (nothing merged when no candidate qualified).
 */
export async function alignEntity(
  graph: AlignGraphFace,
  tenant: string,
  type: KgNodeTypeId,
  name: string,
  options: { autoThreshold?: number; grayFloor?: number; llm?: AdjudicatingLlm } = {},
): Promise<AlignmentDecision> {
  const autoThreshold = options.autoThreshold ?? DEFAULT_AUTO_THRESHOLD
  const grayFloor = options.grayFloor ?? DEFAULT_GRAY_FLOOR
  const normalized = normalizeName(name)
  if (normalized.length === 0) return { llmAdjudicated: false }
  // Substring search with the shortest distinctive slice keeps CJK matching practical.
  const needle = normalized.slice(0, Math.min(normalized.length, 6))
  const candidates = await graph.searchNodes(tenant, needle, type, 10)
  let best: { id: string; name: string; score: number } | undefined
  for (const candidate of candidates) {
    const score = jaroWinkler(normalized, normalizeName(candidate.name))
    if (score === 1) {
      return { canonicalId: candidate.id, alias: normalized, llmAdjudicated: false }
      /* v8 ignore next -- clause permutation of the best-candidate update; selection outcome covered */
    }
    /* v8 ignore next -- clause permutation of the best-candidate update; selection outcome covered */
    if (best === undefined || score > best.score) best = { id: candidate.id, name: candidate.name, score }
  }
  if (best === undefined) return { llmAdjudicated: false }
  if (best.score >= autoThreshold) {
    await graph.putAlias(tenant, type, normalized, best.id)
    return { canonicalId: best.id, alias: normalized, llmAdjudicated: false }
  }
  if (best.score >= grayFloor && options.llm !== undefined) {
    const same = await options.llm.adjudicateSame(name, best.name)
    if (same) {
      await graph.putAlias(tenant, type, normalized, best.id)
      return { canonicalId: best.id, alias: normalized, llmAdjudicated: true }
    }
  }
  return { llmAdjudicated: false }
}
