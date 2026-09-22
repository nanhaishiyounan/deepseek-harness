/**
 * Natural-language query compilation for the knowledge graph: the
 * template-plus-slot fill from the kg research verdict (template-first beats
 * free generation — a miss reports the supported shapes instead of guessing).
 * The compiler is a pure function over the phrase text and the registry's
 * closed sets; the caller resolves seeds and walks the subgraph. Two faces
 * share this one home: the apiproxy `kg.query` RPC (the graph page's search
 * box) and the model-facing `kg_query` tool — RPC and tool behavior cannot
 * drift apart because there is one compiler.
 * @module @deepseek-ai/dsh-kb-graph/kg-nl
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
  '酱油的原料来自哪些供应商',
  '20260911批次流向哪些客户',
  '蚝油由哪些原料制成',
  '宏发食品的供应商',
  '宏发食品的客户',
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
    /* v8 ignore next -- mandatory regex groups always bind. */
    plan: slots => ({ seeds: [slots[0] ?? ''], hops: 1, relationTypes: ['supplies'] }),
  },
  {
    id: 'produces-products',
    pattern: /^(.+?)生产的产品$/u,
    /* v8 ignore next -- mandatory regex groups always bind. */
    plan: slots => ({ seeds: [slots[0] ?? ''], hops: 1, relationTypes: ['produces'] }),
  },
  {
    id: 'uses-inputs',
    pattern: /^(.+?)(?:使用|用了)(?:的(?:原料|添加剂|东西))?$/u,
    /* v8 ignore next -- mandatory regex groups always bind. */
    plan: slots => ({ seeds: [slots[0] ?? ''], hops: 1, relationTypes: ['uses'] }),
  },
  {
    id: 'compliance',
    pattern: /^(.+?)的(?:合规|符合)信息$/u,
    /* v8 ignore next -- mandatory regex groups always bind. */
    plan: slots => ({ seeds: [slots[0] ?? ''], hops: 1, relationTypes: ['complies_with'] }),
  },
  {
    id: 'made-from',
    pattern: /^(.+?)由(?:哪些|什么)?原料(?:制成|做成|生产)?$/u,
    /* v8 ignore next -- mandatory regex groups always bind. */
    plan: slots => ({ seeds: [slots[0] ?? ''], hops: 1, relationTypes: ['uses'] }),
  },
  {
    id: 'trace-input-suppliers',
    pattern: /^(.+?)的原料来自哪些供应商$/u,
    /* v8 ignore next -- mandatory regex groups always bind. */
    plan: slots => ({ seeds: [slots[0] ?? ''], hops: 2 }),
  },
  {
    id: 'trace-batch-flow',
    pattern: /^(.+?)(?:批次)?流向(?:了)?(?:哪些|什么)?客户$/u,
    /* v8 ignore next -- mandatory regex groups always bind. */
    plan: slots => ({ seeds: [slots[0] ?? ''], hops: 2 }),
  },
  {
    id: 'suppliers-of',
    pattern: /^(.+?)的供应商$/u,
    /* v8 ignore next -- mandatory regex groups always bind. */
    plan: slots => ({ seeds: [slots[0] ?? ''], hops: 2 }),
  },
  {
    id: 'customers-of',
    pattern: /^(.+?)的客户$/u,
    /* v8 ignore next -- mandatory regex groups always bind. */
    plan: slots => ({ seeds: [slots[0] ?? ''], hops: 2 }),
  },
  {
    id: 'n-hop',
    pattern: /^(.+?)相关的([12])跳(?:关系)?$/u,
    /* v8 ignore next -- mandatory regex groups always bind. */
    plan: slots => ({ seeds: [slots[0] ?? ''], hops: Number(slots[1] ?? 2) }),
  },
  {
    id: 'pair',
    pattern: /^(.+?)和(.+?)的关系$/u,
    /* v8 ignore next -- mandatory regex groups always bind. */
    plan: slots => ({ seeds: [slots[0] ?? '', slots[1] ?? ''], hops: 1 }),
  },
  {
    id: 'supply-chain',
    pattern: /^(.+?)的供货(?:链|路径)?$/u,
    /* v8 ignore next -- mandatory regex groups always bind. */
    plan: slots => ({ seeds: [slots[0] ?? ''], hops: 2 }),
  },
  {
    id: 'orders',
    pattern: /^(.+?)的订单$/u,
    /* v8 ignore next -- mandatory regex groups always bind. */
    plan: slots => ({ seeds: [slots[0] ?? ''], hops: 1 }),
  },
  {
    id: 'contains',
    pattern: /^(?:含|包含)(.+?)的(?:商品|产品)$/u,
    /* v8 ignore next -- mandatory regex groups always bind. */
    plan: slots => ({ seeds: [slots[0] ?? ''], hops: 1 }),
  },
]

/** The template-id whitelist the L1 fill-parameter layer may choose from. */
export const KG_QUERY_TEMPLATE_IDS: readonly string[] = TEMPLATES.map(template => template.id)

/**
 * The L1 parameter fill the planning LLM returns: a template id plus the
 * entity-name seeds (and the hop count for the n-hop shape only).
 */
export interface KgQueryL1Fill {
  readonly templateId: string
  readonly seeds: readonly string[]
  readonly hops?: number
}

/**
 * Turn one L1 fill into a walk plan under the same closed-set discipline as
 * {@link compileKgQuery}: the template id must be whitelisted, seeds must be
 * non-blank, the template's relation filter must survive the registry's
 * closed set, and a caller-supplied hop count is honored only on the n-hop
 * template. The LLM fills parameters; the compiler still owns the plan.
 * @param fill - the validated fill object.
 * @param vocabulary - the registry's closed relation set.
 * @returns the plan, or `undefined` when the fill is out of discipline.
 */
export function fillKgQueryPlan(fill: KgQueryL1Fill, vocabulary: KgQueryVocabulary): KgQueryPlan | undefined {
  const template = TEMPLATES.find(entry => entry.id === fill.templateId)
  if (template === undefined) return undefined
  const seeds = fill.seeds.map(seed => seed.trim()).filter(seed => seed.length > 0).slice(0, 2)
  if (seeds.length === 0) return undefined
  // Pad to the two-slot arity every template is written against; a template
  // that needs a second seed rejects the blank below, one that does not
  // ignores it.
  const partial = template.plan([seeds[0] as string, seeds[1] ?? ''])
  if (partial.seeds.some(seed => seed.trim().length === 0)) return undefined
  if (partial.relationTypes !== undefined
    && partial.relationTypes.some(relation => !vocabulary.relationIds.includes(relation))) {
    return undefined
  }
  // The n-hop template's slot-derived hop count is garbage under a name-only
  // fill (its second slot is the digit group); the fill's validated hop or
  // the template default owns it.
  const hops = template.id === 'n-hop' ? (fill.hops === 1 || fill.hops === 2 ? fill.hops : 2) : partial.hops
  return { ...partial, hops, templateId: template.id }
}

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
