/**
 * The FoodOn importer: materializes a pruned, single-inheritance projection
 * of the food-industry subtrees (food product chain down to soybean/tofu,
 * organism-material skeleton, transformation process, food contact material,
 * regulated material) into the runtime ontology registry as
 * `foodon-imported` classes anchored by `foodon_uri`/`foodon_id`, and writes
 * the SSSOM-shaped cross-reference rows (the ontology_xref channel): the
 * subtree-root → builtin-class anchors and the cross-facet edges that carry
 * what OWL multiple inheritance lost in the single-parent reduction. Terms
 * come from the curated snapshot below (the locked 2025-12-30 release,
 * verified against the EBI OLS API in the research report); `fetchFoodOnChildrenFromOls`
 * exists for refreshing the snapshot against the live OLS API — the curated
 * copy stays the deterministic source so builds and tests run offline.
 * @module @deepseek-ai/dsh-kg-build/foodon-import
 */

import { kgNodeTypeId } from '@deepseek-ai/dsh-kb-graph'
import type { KgNodeTypeId, KgNodeType } from '@deepseek-ai/dsh-kb-graph'

/** The locked upstream FoodOn release the curated snapshot was taken from. */
export const FOODON_SNAPSHOT_VERSION = '2025-12-30'

/** The OBO purl prefix every FoodOn term IRI expands from. */
export const FOODON_IRI_PREFIX = 'http://purl.obolibrary.org/obo/'

/** One curated FoodOn term. `parents[0]` is the primary (product-facet) parent; the rest demote to cross-facet xrefs. */
export interface FoodOnTerm {
  readonly iri: string
  readonly label: string
  readonly labelZh: string
  readonly parents: readonly string[]
  readonly synonyms?: readonly string[]
}

/**
 * The subtree roots and the builtin registry class each hangs under — the
 *「食品本体术语映射到现有本体 class」mapping table from the research report
 * (chapter 4.5A).
 */
export const FOODON_SUBTREE_ANCHORS: readonly { readonly termIri: string; readonly builtinType: string }[] = [
  { termIri: 'FOODON_00001002', builtinType: 'product' },
  { termIri: 'FOODON_03420116', builtinType: 'ingredient' },
  { termIri: 'FOODON_00002451', builtinType: 'process' },
  { termIri: 'FOODON_00003368', builtinType: 'packaging' },
  { termIri: 'FOODON_00004277', builtinType: 'standard' },
]

/** The builtin food predicates the importer records FoodOn object-property xrefs for. */
export const FOODON_PROP_XREFS: readonly { readonly builtinRelation: string; readonly foodonProp: string; readonly note: string }[] = [
  { builtinRelation: 'uses', foodonProp: 'FOODON:00002420', note: 'has ingredient（产品→配料，定义语义即含有原料）' },
]

/** The curated pruned subtree snapshot (张红喜场景四环的落点全部在内). */
export const FOODON_SEED_TERMS: readonly FoodOnTerm[] = [
  // food product 主树（components/food_products.owl 的裁剪链）
  { iri: 'FOODON_00001002', label: 'food product', labelZh: '食品产品', parents: ['__builtin__:product'] },
  { iri: 'FOODON_00001015', label: 'plant food product', labelZh: '植物性食品', parents: ['FOODON_00001002'] },
  { iri: 'FOODON_00001264', label: 'legume food product', labelZh: '豆类食品', parents: ['FOODON_00001015'] },
  { iri: 'FOODON_00001635', label: 'bean food product', labelZh: '豆（菜豆）类食品', parents: ['FOODON_00001264'] },
  { iri: 'FOODON_00002153', label: 'plant seed vegetable food product', labelZh: '植物种子类蔬菜食品', parents: ['FOODON_00001635'] },
  { iri: 'FOODON_00002265', label: 'soybean seed (field) food product', labelZh: '大豆种子（田间）食品', parents: ['FOODON_00002153'] },
  { iri: 'FOODON_00002266', label: 'soybean food product', labelZh: '大豆食品', parents: ['FOODON_00002265'] },
  {
    iri: 'FOODON_03301415', label: 'soybean', labelZh: '大豆',
    parents: ['FOODON_00002266', 'FOODON_00004331'],
    synonyms: ['soya bean', 'glycine max'],
  },
  { iri: 'FOODON_00004697', label: 'tofu', labelZh: '豆腐', parents: ['FOODON_03301415'] },
  // organism material 骨架（farm-to-fork 生物源侧，深叶不引）
  { iri: 'FOODON_03420116', label: 'organism material', labelZh: '生物体材料', parents: ['__builtin__:ingredient'] },
  { iri: 'FOODON_00004331', label: 'plant material', labelZh: '植物材料', parents: ['FOODON_03420116'] },
  { iri: 'FOODON_00002753', label: 'bean', labelZh: '菜豆', parents: ['FOODON_00004331'] },
  // food transformation process
  { iri: 'FOODON_00002451', label: 'food transformation process', labelZh: '食品转化工艺', parents: ['__builtin__:process'] },
  // food contact material
  { iri: 'FOODON_00003368', label: 'food contact material', labelZh: '食品接触材料', parents: ['__builtin__:packaging'] },
  // regulated food material
  { iri: 'FOODON_00004277', label: 'regulated food material', labelZh: '受监管食品材料', parents: ['__builtin__:standard'] },
]

/**
 * The registry type id an imported FoodOn term mints (`foodon:00001002`).
 * @param iri - the term's FOODON IRI fragment (`FOODON_00001002`).
 * @returns the branded registry type id.
 */
export function foodonTypeIdOf(iri: string): KgNodeTypeId {
  return kgNodeTypeId(`foodon:${iri.replace(/^FOODON_/u, '')}`)
}

/**
 * The compact FoodOn id (`FOODON:00001002`) of a term IRI.
 * @param iri - the term's FOODON IRI fragment (`FOODON_00001002`).
 * @returns the compact `FOODON:nnnnnnnn` id.
 */
export function foodonCompactIdOf(iri: string): string {
  return `FOODON:${iri.replace(/^FOODON_/u, '')}`
}

/**
 * Plan the single-inheritance import: one registry node type per term (the
 * primary parent becomes `extends`; secondary parents demote to cross-facet
 * xref rows) plus the anchor and property xrefs. Pure over the term list.
 * @param terms - the curated (or fetched) FoodOn terms.
 * @returns the import plan (node types + xref rows + warnings).
 */
export function planFoodOnImport(terms: readonly FoodOnTerm[] = FOODON_SEED_TERMS): {
  readonly nodeTypes: readonly KgNodeType[]
  readonly xrefs: readonly { subjectId: string; predicateId: string; objectId: string; mappingJustification?: string }[]
  readonly warnings: readonly string[]
} {
  const known = new Set(terms.map(term => term.iri))
  const nodeTypes: KgNodeType[] = []
  const xrefs: { subjectId: string; predicateId: string; objectId: string; mappingJustification?: string }[] = []
  const warnings: string[] = []
  for (const term of terms) {
    const primary = term.parents[0]
    if (primary === undefined) {
      warnings.push(`term ${term.iri} carries no parent; skipped`)
      continue
    }
    const parentIsBuiltin = primary.startsWith('__builtin__:')
    if (!parentIsBuiltin && !known.has(primary)) {
      warnings.push(`term ${term.iri} references unknown parent ${primary}; skipped`)
      continue
    }
    const extendsId = parentIsBuiltin
      ? kgNodeTypeId(primary.slice('__builtin__:'.length))
      : foodonTypeIdOf(primary)
    nodeTypes.push({
      id: foodonTypeIdOf(term.iri),
      label: term.labelZh,
      description: `FoodOn ${term.label}（${foodonCompactIdOf(term.iri)}），快照 ${FOODON_SNAPSHOT_VERSION}。`,
      layer: 'domain',
      extends: extendsId,
      props: [],
      foodonUri: `${FOODON_IRI_PREFIX}${term.iri}`,
      foodonId: foodonCompactIdOf(term.iri),
      ...(term.synonyms === undefined || term.synonyms.length === 0 ? {} : { synonyms: term.synonyms }),
      source: 'foodon-imported',
      status: 'active',
    })
    if (parentIsBuiltin) {
      xrefs.push({
        subjectId: String(foodonTypeIdOf(term.iri)),
        predicateId: 'extends-builtin',
        objectId: primary.slice('__builtin__:'.length),
        mappingJustification: `subtree anchor (FoodOn ${FOODON_SNAPSHOT_VERSION})`,
      })
    }
    // Secondary parents: the OWL multi-inheritance the single-parent schema
    // graph cannot hold — kept as cross-facet xref rows.
    for (const extra of term.parents.slice(1)) {
      if (!known.has(extra)) {
        warnings.push(`term ${term.iri} cross-facet parent ${extra} unknown; dropped`)
        continue
      }
      xrefs.push({
        subjectId: String(foodonTypeIdOf(term.iri)),
        predicateId: 'cross-facet',
        objectId: foodonCompactIdOf(extra),
        mappingJustification: 'secondary owl:subClassOf demoted by single-inheritance reduction',
      })
    }
  }
  for (const prop of FOODON_PROP_XREFS) {
    xrefs.push({
      subjectId: prop.builtinRelation,
      predicateId: 'foodon-prop',
      objectId: prop.foodonProp,
      mappingJustification: prop.note,
    })
  }
  return { nodeTypes, xrefs, warnings }
}

/** One OLS children-page term as the API projects it (the fetch face's raw shape). */
interface OlsTerm {
  readonly iri?: unknown
  readonly label?: unknown
  readonly synonym?: unknown
}

/**
 * Fetch one term's direct children from the EBI OLS API (the refresh path
 * for the curated snapshot; builds never call it).
 * @param termIri - the parent term's full IRI.
 * @param fetchImpl - the fetch implementation (injectable for tests).
 * @returns the child terms in the generic {@link FoodOnTerm} shape (labels
 *   verbatim, no zh layer — the curated snapshot owns translations).
 */
export async function fetchFoodOnChildrenFromOls(
  termIri: string,
  fetchImpl: typeof fetch = fetch,
): Promise<readonly FoodOnTerm[]> {
  const url = `https://www.ebi.ac.uk/ols4/api/ontologies/foodon/terms/${encodeURIComponent(termIri)}/children?size=100`
  const response = await fetchImpl(url)
  if (!response.ok) {
    throw new Error(`OLS children request for ${termIri} failed: ${String(response.status)} ${response.statusText}`)
  }
  const payload = await response.json() as { '_embedded'?: { terms?: unknown } }
  const terms = payload['_embedded']?.terms
  if (!Array.isArray(terms)) return []
  const compactParent = termIri.replace(/^.*\/FOODON_/u, 'FOODON_')
  const out: FoodOnTerm[] = []
  for (const raw of terms as readonly OlsTerm[]) {
    const iri = typeof raw.iri === 'string' ? raw.iri.replace(/^.*\/obo\//u, '') : undefined
    if (iri === undefined || !iri.startsWith('FOODON_')) continue
    const label = typeof raw.label === 'string' ? raw.label : iri
    const synonyms = Array.isArray(raw.synonym)
      ? raw.synonym.filter((entry): entry is string => typeof entry === 'string')
      : undefined
    out.push({
      iri,
      label,
      labelZh: label,
      parents: [compactParent],
      ...(synonyms === undefined || synonyms.length === 0 ? {} : { synonyms }),
    })
  }
  return out
}
