/**
 * Natural-language query compilation for `kg.query`: the template-plus-slot
 * fill from the kg research verdict (template-first beats free generation —
 * a miss reports the supported shapes instead of guessing). The compiler is
 * a pure function over the phrase text and the registry's closed sets; the
 * caller resolves seeds and walks the subgraph.
 * @module @deepseek-ai/dsh-apiproxy/kg-nl
 */

/** One compiled query plan (the structured walk parameters). */
export interface KgQueryPlan {
  /** Entity name seeds (server-side resolution happens later). */
  readonly seeds: readonly string[]
  /** Walk depth, 1 or 2. */
  readonly hops: number
  /** Relation-id filter; `undefined` walks every relation. */
  readonly relationTypes?: readonly string[]
  /** Which built-in template matched (stable id for tests and telemetry). */
  readonly templateId: string
}

/** The registry's closed sets the template slots validate against. */
export interface KgQueryVocabulary {
  readonly relationIds: readonly string[]
}

/** Example phrases the refusal message and the phrase-box placeholder cite. */
export const KG_QUERY_EXAMPLES: readonly string[] = [
  '张红喜的供货链',
  '张红喜的订单',
  '含山梨酸钾的产品',
  '宏发食品供货的所有产品',
  '宏发食品生产的产品',
  '酱油使用的原料',
  '酱油的合规信息',
  '宏发食品相关的2跳关系',
  '宏发食品和张红喜的关系',
]

interface Template {
  readonly id: string
  readonly pattern: RegExp
  readonly plan: (slots: readonly string[]) => Omit<KgQueryPlan, 'templateId'>
}

/**
 * The template list, most specific first: the relation-filtered shapes match
 * before the bare supply-chain shape (both contain 供货), and the pair shape
 * before the bare-entity fallback never happens here (a non-matching phrase
 * is an explicit miss, not a raw seed — the search box already covers that).
 */
const TEMPLATES: readonly Template[] = [
  {
    id: 'supplies-products',
    pattern: /^(.+?)(?:供货|供应)的(?:所有)?产品$/u,
    plan: slots => ({ seeds: [slots[0] ?? ''], hops: 1, relationTypes: ['supplies'] }),
  },
  {
    id: 'produces-products',
    pattern: /^(.+?)生产的产品$/u,
    plan: slots => ({ seeds: [slots[0] ?? ''], hops: 1, relationTypes: ['produces'] }),
  },
  {
    id: 'uses-inputs',
    pattern: /^(.+?)(?:使用|用了)(?:的(?:原料|添加剂|东西))?$/u,
    plan: slots => ({ seeds: [slots[0] ?? ''], hops: 1, relationTypes: ['uses'] }),
  },
  {
    id: 'compliance',
    pattern: /^(.+?)的(?:合规|符合)信息$/u,
    plan: slots => ({ seeds: [slots[0] ?? ''], hops: 1, relationTypes: ['complies_with'] }),
  },
  {
    id: 'n-hop',
    pattern: /^(.+?)相关的([12])跳(?:关系)?$/u,
    plan: slots => ({ seeds: [slots[0] ?? ''], hops: Number(slots[1] ?? 2) }),
  },
  {
    id: 'pair',
    pattern: /^(.+?)和(.+?)的关系$/u,
    plan: slots => ({ seeds: [slots[0] ?? '', slots[1] ?? ''], hops: 1 }),
  },
  {
    id: 'supply-chain',
    pattern: /^(.+?)的供货(?:链|路径)?$/u,
    plan: slots => ({ seeds: [slots[0] ?? ''], hops: 2 }),
  },
  {
    id: 'orders',
    pattern: /^(.+?)的订单$/u,
    plan: slots => ({ seeds: [slots[0] ?? ''], hops: 1 }),
  },
  {
    id: 'contains',
    pattern: /^(?:含|包含)(.+?)的(?:商品|产品)$/u,
    plan: slots => ({ seeds: [slots[0] ?? ''], hops: 1 }),
  },
]

/**
 * Compile one natural-language phrase into a structured walk plan. Every
 * template's relation filter must survive the registry's closed set — a
 * template naming an unregistered relation is a miss, not a silent unfiltered
 * walk. A non-matching (or blank) phrase is an explicit unsupported shape.
 * @param phrase - the raw phrase text.
 * @param vocabulary - the registry's closed relation set.
 * @returns the plan, or `undefined` when no template matches (the caller
 *   reports the supported shapes).
 */
export function compileKgQuery(phrase: string, vocabulary: KgQueryVocabulary): KgQueryPlan | undefined {
  const text = phrase.trim()
  if (text.length === 0) return undefined
  for (const template of TEMPLATES) {
    const match = text.match(template.pattern)
    if (match === null) continue
    // A structurally matching phrase with a blank entity slot is a miss.
    const slots = match.slice(1).map(group => group.trim())
    if (slots.some(slot => slot.length === 0)) continue
    const partial = template.plan(slots)
    if (
      partial.relationTypes !== undefined
      && partial.relationTypes.some(relation => !vocabulary.relationIds.includes(relation))
    ) {
      continue
    }
    return { ...partial, templateId: template.id }
  }
  return undefined
}
