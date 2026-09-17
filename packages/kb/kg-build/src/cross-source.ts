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
