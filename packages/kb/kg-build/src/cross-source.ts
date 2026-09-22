/**
 * Cross-source coreference alignment: deterministic `corefers_with` edges
 * between corpus-extracted entities (`kb:` node ids) and NocoBase rows
 * (`nocobase:` node ids). The same-type merge pass never pairs them (doc
 * entities land on built-in ontology types, rows on collection types), so the
 * two families form disconnected graph components without this bridge. Rules
 * are pure string normalization — no LLM, no merges, only edges; each edge is
 * independently idempotent through the seven-column provenance anchor.
 * @module @deepseek-ai/dsh-kg-build/cross-source
 */

import { kgNodeTypeId, kgRelationId } from '@deepseek-ai/dsh-kb-graph'
import type { KgEdge, KgNode, KgNodeTypeId } from '@deepseek-ai/dsh-kb-graph'
import { normalizeName } from './align.ts'

/** Node-id prefixes the pipeline's own mappers mint per source family. */
const DOC_NODE_PREFIX = 'kb:'
const NOCOBASE_NODE_PREFIX = 'nocobase:'

/** Minimum normalized name length a doc entity needs to corefer (shorter names match too broadly). */
export const CROSS_SOURCE_MIN_NAME_LENGTH = 2

/** Doc entity types excluded from coreference (person names: matching rows is a merge decision, not an alignment one). */
export const CROSS_SOURCE_EXCLUDED_TYPES: readonly KgNodeTypeId[] = [kgNodeTypeId('Expert')]

/** Confidence of a normalized-name-equal coreference (a deterministic rule). */
export const EXACT_COREFERENCE_CONFIDENCE = 1
/** Confidence of a containment coreference (the row name contains the doc name). */
export const CONTAINS_COREFERENCE_CONFIDENCE = 0.75

/** The provenance system every cross-source edge asserts. */
export const CROSS_SOURCE_SYSTEM = 'kg-align'

/**
 * Read the corpus-relative scope back out of a corpus-leg node id
 * (`kb:<scope>#<entity name>`).
 * @param id - the node id the corpus leg minted.
 * @returns the scope (the document's corpus-relative path), or `undefined`
 * when the id is not in the corpus leg's `kb:<scope>#<name>` shape.
 */
export function kbScopeOfNodeId(id: string): string | undefined {
  if (!id.startsWith(DOC_NODE_PREFIX)) return undefined
  const separator = id.indexOf('#', DOC_NODE_PREFIX.length)
  if (separator === -1) return undefined
  return id.slice(DOC_NODE_PREFIX.length, separator)
}

/**
 * Plan the deterministic coreference edges between the corpus-extracted
 * entities and the NocoBase rows.
 * @param docNodes - every node (all tenants filtered by the caller) whose id
 * the corpus leg minted (`kb:` prefix).
 * @param nocobaseNodes - every node whose id the NocoBase leg minted
 * (`nocobase:` prefix).
 * @param options - `tenantId` stamps every edge, `now` becomes the extraction
 * timestamp, `exactOnly` restricts matching to normalized-name equality.
 * @returns the coreference edges (empty when nothing pairs).
 */
export function crossSourceEdges(
  docNodes: readonly KgNode[],
  nocobaseNodes: readonly KgNode[],
  options: { tenantId: string; now: string; exactOnly?: boolean },
): KgEdge[] {
  const excluded = new Set(CROSS_SOURCE_EXCLUDED_TYPES.map(type => String(type)))
  const docs = docNodes.filter(node =>
    node.id.startsWith(DOC_NODE_PREFIX)
    && !excluded.has(String(node.type))
    && normalizeName(node.name).length >= CROSS_SOURCE_MIN_NAME_LENGTH)
  const rows = nocobaseNodes.filter(node => node.id.startsWith(NOCOBASE_NODE_PREFIX))
  const edges: KgEdge[] = []
  for (const doc of docs) {
    const docName = normalizeName(doc.name)
    for (const row of rows) {
      const rowName = normalizeName(row.name)
      if (rowName === docName) {
        edges.push(corefersEdge(doc, row, options.tenantId, options.now, '名称归一化相等', EXACT_COREFERENCE_CONFIDENCE))
        continue
      }
      if (options.exactOnly === true) continue
      // Containment is one-directional on purpose: doc entities are short
      // topical names (中亚), row names carry them as substrings
      // (中亚货运动线方案) — the reverse direction would connect every row
      // to every longer doc name.
      if (rowName.includes(docName)) {
        edges.push(corefersEdge(doc, row, options.tenantId, options.now, '名称包含', CONTAINS_COREFERENCE_CONFIDENCE))
      }
    }
  }
  return edges
}

/** Build one coreference edge; the anchor (src, dst, relation, system, sourceId=doc id) stays stable across reruns. */
function corefersEdge(doc: KgNode, row: KgNode, tenantId: string, now: string, rule: string, confidence: number): KgEdge {
  return {
    id: `kg-align:${doc.id}:${row.id}`,
    tenantId,
    srcId: doc.id,
    dstId: row.id,
    relation: kgRelationId('corefers_with'),
    fact: `跨源共指（${rule}）：${doc.name} ≈ ${row.name}`,
    confidence,
    provenance: { sourceSystem: CROSS_SOURCE_SYSTEM, sourceId: doc.id, extractedAt: now },
    validFrom: now,
  }
}

/** The pairwise LLM verdict the v2 matching stage returns (MatchGPT mode). */
export interface CorefVerdict {
  readonly same: boolean
  readonly confidence: number
  readonly reason: string
}

/** The LLM face the v2 pass delegates gray-zone pairs to. */
export interface CorefJudgeLlm {
  /**
   * Judge whether one doc entity and one row denote the same real entity.
   * @param doc - the corpus-extracted entity profile.
   * @param row - the business-row entity profile.
   * @returns the structured verdict.
   */
  judge(
    doc: { id: string; name: string; type: string; summary?: string },
    row: { id: string; name: string; type: string; summary?: string },
  ): Promise<CorefVerdict>
}

/** Pairs at or above this judged confidence land as edges without review. */
export const COREF_AUTO_FLOOR = 0.9
/** Same-verdict pairs under the auto floor queue for human review. */
export const COREF_GRAY_FLOOR = 0.5

/**
 * The unordered pair key the reject-tombstone channel keys on.
 * @param docId - the corpus-extracted node id.
 * @param rowId - the business-row node id.
 * @returns the order-independent `a::b` key.
 */
export function corefPairKey(docId: string, rowId: string): string {
  return docId < rowId ? `${docId}::${rowId}` : `${rowId}::${docId}`
}

/** One v2 pass's review-queue entry (a same-verdict under the auto floor). */
export interface CorefReviewEntry {
  readonly docId: string
  readonly rowId: string
  readonly docName: string
  readonly rowName: string
  readonly verdict: CorefVerdict
}

/** One v2 pass's rejected pair (a negative verdict — tombstone candidate). */
export interface CorefRejectedPair {
  readonly docId: string
  readonly rowId: string
  readonly docName: string
  readonly rowName: string
  readonly reason: string
}

/** The v2 pass's full result: edges to upsert, rejects, review queue, stats. */
export interface CrossSourceV2Result {
  readonly edges: readonly KgEdge[]
  readonly rejected: readonly CorefRejectedPair[]
  readonly review: readonly CorefReviewEntry[]
  readonly judgedPairs: number
  readonly deterministicEdges: number
}

/**
 * The v2 cross-source pass: deterministic rules stay the recall floor
 * (exact matches auto-accept), gray-zone containment candidates go to the
 * pairwise LLM judge (MatchGPT mode: two profiles → same/confidence/reason
 * JSON), verdicts layer by confidence — at or over the auto floor the edge
 * lands, a same-verdict in the gray band lands flagged for review, and
 * negative verdicts reject (the reject tombstone the caller persists keeps
 * rejected pairs from re-animating next run). Pairs already rejected before
 * skip judging entirely.
 * @param docNodes - the corpus-extracted entities.
 * @param nocobaseNodes - the business-row entities.
 * @param options - `tenantId`/`now` stamp the edges; `judge` enables the LLM
 *   stage (without it the pass degrades to the deterministic rules);
 *   `rejectedPairs` is the tombstone set; `exactOnly` restricts matching.
 * @returns the v2 result document.
 */
export async function crossSourceEdgesV2(
  docNodes: readonly KgNode[],
  nocobaseNodes: readonly KgNode[],
  options: {
    readonly tenantId: string
    readonly now: string
    readonly judge?: CorefJudgeLlm
    readonly rejectedPairs?: ReadonlySet<string>
    readonly exactOnly?: boolean
  },
): Promise<CrossSourceV2Result> {
  // The deterministic recall floor is exact-name equality only; containment
  // pairs are the gray zone the LLM judge owns (auto floor for rules,
  // judged floor for the bridge).
  const deterministic = crossSourceEdges(docNodes, nocobaseNodes, {
    tenantId: options.tenantId,
    now: options.now,
    exactOnly: true,
  })
  const autoKeys = new Set(deterministic.map(edge => corefPairKey(edge.srcId, edge.dstId)))
  const judgedEdges: KgEdge[] = []
  const rejected: CorefRejectedPair[] = []
  const review: CorefReviewEntry[] = []
  const judge = options.judge
  if (judge === undefined) {
    // Without a judge the pass keeps the v1 deterministic behavior entire
    // (exact + containment), not the exact-only floor.
    const fallback = crossSourceEdges(docNodes, nocobaseNodes, {
      tenantId: options.tenantId,
      now: options.now,
      ...(options.exactOnly === undefined ? {} : { exactOnly: options.exactOnly }),
    })
    return { edges: fallback, rejected, review, judgedPairs: 0, deterministicEdges: fallback.length }
  }
  // The gray-zone candidate pool: containment pairs the deterministic pass
  // would have taken at 0.75 — the LLM confirms or rejects them.
  const grayPool = options.exactOnly === true ? [] : collectContainmentPairs(docNodes, nocobaseNodes)
  let judgedPairs = 0
  for (const pair of grayPool) {
    const key = corefPairKey(pair.doc.id, pair.row.id)
    if (autoKeys.has(key)) continue
    if (options.rejectedPairs?.has(key) === true) continue
    const verdict = await judge.judge(
      {
        id: pair.doc.id,
        name: pair.doc.name,
        type: String(pair.doc.type),
        ...(pair.doc.summary === undefined ? {} : { summary: pair.doc.summary }),
      },
      {
        id: pair.row.id,
        name: pair.row.name,
        type: String(pair.row.type),
        ...(pair.row.summary === undefined ? {} : { summary: pair.row.summary }),
      },
    )
    judgedPairs += 1
    if (!verdict.same) {
      rejected.push({
        docId: pair.doc.id, rowId: pair.row.id, docName: pair.doc.name, rowName: pair.row.name,
        reason: verdict.reason,
      })
      continue
    }
    if (verdict.confidence < COREF_GRAY_FLOOR) {
      review.push({ docId: pair.doc.id, rowId: pair.row.id, docName: pair.doc.name, rowName: pair.row.name, verdict })
      continue
    }
    judgedEdges.push(corefersEdge(pair.doc, pair.row, options.tenantId, options.now, `LLM 桥判：${verdict.reason}`, verdict.confidence))
  }
  return {
    edges: [...deterministic, ...judgedEdges],
    rejected,
    review,
    judgedPairs,
    deterministicEdges: deterministic.length,
  }
}

/** Collect the containment candidate pairs (doc name ⊂ row name) the gray zone judges. */
function collectContainmentPairs(docNodes: readonly KgNode[], nocobaseNodes: readonly KgNode[]): { doc: KgNode; row: KgNode }[] {
  const excluded = new Set(CROSS_SOURCE_EXCLUDED_TYPES.map(type => String(type)))
  const pairs: { doc: KgNode; row: KgNode }[] = []
  for (const doc of docNodes) {
    if (!doc.id.startsWith('kb:') || excluded.has(String(doc.type))) continue
    const docName = normalizeName(doc.name)
    if (docName.length < CROSS_SOURCE_MIN_NAME_LENGTH) continue
    for (const row of nocobaseNodes) {
      if (!row.id.startsWith('nocobase:')) continue
      if (normalizeName(row.name).includes(docName)) pairs.push({ doc, row })
    }
  }
  return pairs
}

/** One union-find materialized equivalence class over the coreference pairs. */
export interface CorefCluster {
  /** The cluster representative (the lexicographically smallest member id). */
  readonly representative: string
  readonly members: readonly string[]
}

/**
 * Materialize the equivalence classes over coreference pairs (union-find):
 * the derived view layer — the edges stay the source of truth, clusters are
 * what queries and the UI consume.
 * @param nodeIds - every node id participating.
 * @param pairs - the (doc, row) id pairs the accepted edges connect.
 * @returns the clusters with two or more members.
 */
export function unionFindClusters(nodeIds: readonly string[], pairs: readonly (readonly [string, string])[]): readonly CorefCluster[] {
  const parent = new Map(nodeIds.map(id => [id, id]))
  const find = (id: string): string => {
    let root = id
    for (;;) {
      const next = parent.get(root)
      if (next === undefined || next === root) return root
      root = next
    }
  }
  for (const [a, b] of pairs) {
    const ra = find(a)
    const rb = find(b)
    if (ra !== rb) parent.set(ra > rb ? ra : rb, ra > rb ? rb : ra)
  }
  const byRoot = new Map<string, string[]>()
  for (const id of nodeIds) {
    const root = find(id)
    const members = byRoot.get(root) ?? []
    members.push(id)
    byRoot.set(root, members)
  }
  return [...byRoot.entries()]
    .filter(([, members]) => members.length > 1)
    .map(([representative, members]) => ({ representative, members: [...members].sort() }))
}
