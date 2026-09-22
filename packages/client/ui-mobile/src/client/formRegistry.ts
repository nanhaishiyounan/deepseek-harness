/**
 * The mobile v3 form registry: the six business forms the fill-assistant
 * covers — each entry's trigger vocabulary, field tiers, and derivation
 * rules — plus the intent scorer that turns one free-form sentence into a
 * unique match or an ask-choice fork. The same table feeds the persona text
 * (examples/kb-agent/agent-presets/mobile-form-assistant), the welcome
 * capabilities, and the front-end matcher; keep the copies in sync when an
 * entry changes. No React imports.
 */

import type { FieldWidgetKind } from './protocol.ts'

/** One required field the user must decide (the 请确认/需要你定 layout). */
export interface RequiredFieldSpec {
  readonly name: string
  readonly label: string
  readonly widget: FieldWidgetKind
}

/** One derived or system field with the rule the assistant derives it by. */
export interface DerivedFieldSpec {
  readonly name: string
  readonly label: string
  /** The derivation instruction the persona follows (今天 / 数量×单价 / …). */
  readonly rule: string
}

/** One registry entry: one business form the assistant can register. */
export interface FormRegistryEntry {
  readonly collection: string
  readonly bizName: string
  readonly glyph: string
  readonly intentTerms: ReadonlyArray<{ readonly term: string; readonly weight: number }>
  /** Reverse signals; each hit subtracts 2 from this entry's score. */
  readonly antiTerms?: readonly string[]
  readonly required: readonly RequiredFieldSpec[]
  readonly derived: readonly DerivedFieldSpec[]
  readonly system: readonly DerivedFieldSpec[]
  readonly examples: readonly string[]
}

/** The six-form registry (hub_po two verified; the other four are agreed initial names). */
export const FORM_REGISTRY: readonly FormRegistryEntry[] = [
  {
    collection: 'hub_po_purchase_orders',
    bizName: '采购单',
    glyph: '采',
    intentTerms: [
      { term: '采购单', weight: 3 },
      { term: '采购', weight: 2 },
      { term: '进货', weight: 2 },
      { term: '订一批', weight: 2 },
      { term: '买', weight: 1 },
      { term: '谈好', weight: 1 },
    ],
    antiTerms: ['卖给'],
    required: [
      { name: 'supplier', label: '供应商', widget: 'relation' },
      { name: 'product', label: '品名', widget: 'text' },
      { name: 'quantity', label: '数量', widget: 'number' },
    ],
    derived: [
      { name: 'order_date', label: '日期', rule: '今天' },
      { name: 'status', label: '状态', rule: '默认 draft' },
      { name: 'total', label: '合计', rule: '数量×单价' },
      { name: 'supplier_id', label: '供应商', rule: '按名称 nb_list 查 hub_po_suppliers 解析 id' },
    ],
    system: [{ name: 'po_number', label: '单号', rule: '按 PO-YYYY-NNNN 递增生成' }],
    examples: ['向宏发食品采购 500kg 面粉，单价 3.2'],
  },
  {
    collection: 'hub_po_suppliers',
    bizName: '供应商登记',
    glyph: '供',
    intentTerms: [
      { term: '供应商', weight: 3 },
      { term: '登记供应商', weight: 3 },
      { term: '建档', weight: 2 },
      { term: '新单位', weight: 1 },
      { term: '入驻', weight: 1 },
    ],
    required: [
      { name: 'name', label: '供应商名称', widget: 'text' },
      { name: 'contact_name', label: '联系人', widget: 'text' },
    ],
    derived: [
      { name: 'created_date', label: '创建日期', rule: '今天' },
      { name: 'status', label: '状态', rule: '默认 待审核' },
    ],
    system: [{ name: 'supplier_code', label: '编号', rule: '按 SUP-YYYY-NNNN 递增生成' }],
    examples: ['给供应商三味食品登个档'],
  },
  {
    collection: 'hub_qc_inspections',
    bizName: '质检记录',
    glyph: '质',
    intentTerms: [
      { term: '质检', weight: 3 },
      { term: '检验', weight: 2 },
      { term: '不合格', weight: 2 },
      { term: '抽检', weight: 2 },
      { term: '有问题', weight: 1 },
    ],
    required: [
      { name: 'subject', label: '受检对象', widget: 'text' },
      { name: 'conclusion', label: '结论', widget: 'select' },
    ],
    derived: [
      { name: 'inspection_date', label: '检验日期', rule: '今天' },
      { name: 'inspector', label: '检验员', rule: '当前用户' },
    ],
    system: [{ name: 'qc_number', label: '单号', rule: '按 QC-YYYY-NNNN 递增生成' }],
    examples: ['宏发的货抽检有问题，结论不合格'],
  },
  {
    collection: 'hub_wms_inbound',
    bizName: '入库单',
    glyph: '入',
    intentTerms: [
      { term: '入库', weight: 3 },
      { term: '到货', weight: 2 },
      { term: '收货', weight: 2 },
      { term: '进了', weight: 1 },
    ],
    required: [
      { name: 'source', label: '来源单据', widget: 'text' },
      { name: 'product', label: '品名', widget: 'text' },
      { name: 'quantity', label: '数量', widget: 'number' },
    ],
    derived: [
      { name: 'inbound_date', label: '入库日期', rule: '今天' },
      { name: 'status', label: '状态', rule: '默认 待上架' },
    ],
    system: [{ name: 'inbound_number', label: '单号', rule: '按 IN-YYYY-NNNN 递增生成' }],
    examples: ['今天到货 200 箱冷链箱要入库'],
  },
  {
    collection: 'hub_wms_outbound',
    bizName: '出库单',
    glyph: '出',
    intentTerms: [
      { term: '出库', weight: 3 },
      { term: '发货', weight: 2 },
      { term: '送货', weight: 2 },
      { term: '卖给', weight: 2 },
      { term: '出一批', weight: 1 },
      { term: '一批', weight: 1 },
    ],
    required: [
      { name: 'customer', label: '客户', widget: 'relation' },
      { name: 'product', label: '品名', widget: 'text' },
      { name: 'quantity', label: '数量', widget: 'number' },
    ],
    derived: [
      { name: 'outbound_date', label: '出库日期', rule: '今天' },
      { name: 'status', label: '状态', rule: '默认 待发运' },
    ],
    system: [{ name: 'outbound_number', label: '单号', rule: '按 OUT-YYYY-NNNN 递增生成' }],
    examples: ['给客户鲜丰发 100 箱黄豆酱油'],
  },
  {
    collection: 'hub_fin_payments',
    bizName: '回款记录',
    glyph: '款',
    intentTerms: [
      { term: '回款', weight: 3 },
      { term: '到账', weight: 2 },
      { term: '打款', weight: 2 },
      { term: '收了钱', weight: 1 },
    ],
    required: [
      { name: 'customer', label: '客户', widget: 'relation' },
      { name: 'amount', label: '金额', widget: 'number' },
    ],
    derived: [
      { name: 'received_date', label: '到账日期', rule: '今天' },
      { name: 'reconcile_status', label: '核销状态', rule: '默认 未核销' },
    ],
    system: [{ name: 'payment_number', label: '单号', rule: '按 PAY-YYYY-NNNN 递增生成' }],
    examples: ['宏发这笔回款 16000 到账了'],
  },
]

/** Synonym rewrites the scorer normalizes before matching (冷链 vocabulary). */
const SYNONYMS: ReadonlyArray<readonly [string, string]> = [
  ['制冷', '冷链'],
  ['保温箱', '冷链箱'],
  ['冰袋', '冷链'],
]

/**
 * The generic register verbs (weight 1 on every entry — the 02 §3.1 泛动作词):
 * a sentence carrying only these scores every table equally, which the fork
 * policy reads as "wants to register but said too little" and answers with
 * the whole-registry ask_choice.
 */
const GENERIC_REGISTER_TERMS: readonly string[] = ['登记', '记一下', '录一笔', '开单']

/** The intent-match verdict the conversation state machine consumes. */
export type IntentMatch =
  | { readonly kind: 'unique'; readonly entry: FormRegistryEntry }
  | { readonly kind: 'ambiguous'; readonly candidates: readonly FormRegistryEntry[] }
  | { readonly kind: 'none' }

/** A question-shaped sentence is an analytics ask unless a strong hit lands. */
const QUESTIONISH = /(多少|怎么|什么|哪里|吗|？|\?|几)/

/** A unique hit needs at least this score (a full form-noun hit). */
const UNIQUE_MIN_SCORE = 3
/** A unique hit must lead the runner-up by at least this margin. */
const UNIQUE_LEAD = 2
/** Each anti-term hit subtracts this from the entry's score. */
const ANTI_PENALTY = 2

/**
 * Score one entry against the normalized input: the sum of its intent-term
 * weights (a term counts once) minus the anti-term penalties (floor 0).
 */
function scoreOf(entry: FormRegistryEntry, input: string): number {
  let score = 0
  for (const { term, weight } of entry.intentTerms) {
    if (input.includes(term)) score += weight
  }
  for (const term of GENERIC_REGISTER_TERMS) {
    if (input.includes(term)) {
      score += 1
      break
    }
  }
  if (entry.antiTerms !== undefined) {
    for (const term of entry.antiTerms) {
      if (input.includes(term)) score -= ANTI_PENALTY
    }
  }
  return Math.max(score, 0)
}

/**
 * Match one user sentence onto the registry (the 02 §3.3 policy): a unique
 * high-confidence hit short-circuits into the slot-filling flow; an
 * ambiguous or low-confidence hit carries the top candidates for an
 * ask_choice fork (fewer than two scoring candidates with sub-threshold
 * scores reads as "wants to register but said too little" and lists the
 * whole registry); zero everywhere is a non-registration intent.
 * @param input - the user's free-form sentence.
 * @returns the match verdict.
 */
export function matchIntent(input: string): IntentMatch {
  let normalized = input
  for (const [from, to] of SYNONYMS) normalized = normalized.replaceAll(from, to)
  const ranked = FORM_REGISTRY
    .map(entry => ({ entry, score: scoreOf(entry, normalized) }))
    .filter(row => row.score > 0)
    .sort((a, b) => b.score - a.score)
  const [top, runnerUp] = ranked
  if (top === undefined) return { kind: 'none' }
  const lead = runnerUp === undefined ? Number.POSITIVE_INFINITY : top.score - runnerUp.score
  if (top.score >= UNIQUE_MIN_SCORE && lead >= UNIQUE_LEAD) {
    return { kind: 'unique', entry: top.entry }
  }
  // A question-shaped sentence below the strong-hit bar is an analytics ask,
  // not a registration: the none verdict hands it to the read-only branch.
  if (QUESTIONISH.test(input)) return { kind: 'none' }
  // A declarative sentence with one strong verb and a clear lead (采购 500kg
  // 面粉…) reads as intent without a fork.
  if (top.score >= 2 && lead >= UNIQUE_LEAD) {
    return { kind: 'unique', entry: top.entry }
  }
  // A sentence that never rose above the generic-verb weight said too little
  // to rank anything: the fork lists the whole registry (02 §3.3.4).
  const candidates = top.score <= 1
    ? [...FORM_REGISTRY]
    : ranked.slice(0, 3).map(row => row.entry)
  return { kind: 'ambiguous', candidates }
}

/**
 * The welcome capabilities line projected from the registry (the fill
 * assistant's greeting card copy).
 * @returns the one-line capability sentence.
 */
export function registryCapabilityLine(): string {
  return `说一句话就能登记：${FORM_REGISTRY.map(entry => entry.bizName).join('、')}`
}
