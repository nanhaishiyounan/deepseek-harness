/**
 * The v3 assistant-narrative rich pipeline (03 §4.5): markdown-it renders the
 * people-language text (the protocol fences were already split out upstream,
 * so no fence can reach here), DOMPurify sanitizes the output for the mobile
 * WebView, and standalone numeric conclusion lines promote to half-width
 * metric cards (value in the ticket face, label in muted slate). Pure
 * functions; no React imports.
 */

import MarkdownIt from 'markdown-it'
import DOMPurify from 'dompurify'
import { SUPPLIER_LIFECYCLE_STATES } from '../fieldControls.ts'
import { SUPPLIER_STATE_WORDS } from '../docsCatalog.ts'

/** The shared renderer: no raw HTML in, single newlines break, no linkify. */
const md = new MarkdownIt({ html: false, breaks: true, linkify: false })

// Narrative images lazy-load and never overflow the bubble (W8-B2 §3): the
// model's markdown may omit the alt text, so an empty alt falls back to a
// generic aria-label instead of an unnamed figure.
md.renderer.rules.image = (tokens, index, options, _env, self) => {
  const token = tokens[index]
  if (token !== undefined) {
    token.attrSet('loading', 'lazy')
    const alt = (token.children ?? []).map(child => child.content).join('')
    if (alt.trim() === '') token.attrSet('aria-label', '内容图片')
  }
  return self.renderToken(tokens, index, options)
}

/**
 * Render one narrative block to sanitized HTML. Every table leaves wrapped
 * in its own scroll container (W24): the CSS module addresses the wrap by
 * the global `md-table-wrap` class, so a multi-column table scrolls inside
 * the bubble instead of squeezing its columns to the bubble width. The
 * wrapper is appended after DOMPurify — it is our own trusted element, and
 * the sanitize pass never needs to see it.
 * @param text - the people-language text block.
 * @returns DOMPurify-clean HTML (paragraphs, lists, tables, strong…).
 */
export function renderMarkdown(text: string): string {
  const clean = DOMPurify.sanitize(md.render(text))
  return clean.replace(/<table>/g, '<div class="md-table-wrap"><table>').replace(/<\/table>/g, '</table></div>')
}

/** One promoted numeric conclusion: the value in the ticket face plus its label. */
export interface MetricLine {
  readonly label: string
  readonly value: string
}

/** Unit words a promoted value absorbs from the following token (500 箱 → value keeps the unit). */
const UNIT_WORDS: ReadonlySet<string> = new Set(['%', '万', '亿', '元', '箱', 'kg', '吨', '件', '个', '只', '张', '条', '单', '天'])

/** Markdown structure prefixes that never promote (lists, quotes, tables, headings). */
const STRUCTURE_PREFIX = /^(?:[-*+>|#]|\d+[.)、])/

/** Numeric-facing characters for the density check (digits, currency, separators, percent). */
const NUMERIC_CHARS = /[0-9¥￥$,.%]/

/**
 * Parse one line as a promoted metric conclusion (03 §4.5 trigger): a short
 * line (≤16 chars) that starts with a digit/currency or is >60% numeric, is
 * not a markdown structure line, and splits into a non-empty label plus a
 * non-empty numeric value.
 * @param line - one narrative line.
 * @returns the metric pair, or undefined when the line does not promote.
 */
export function parseMetricLine(line: string): MetricLine | undefined {
  const trimmed = line.trim()
  const chars = Array.from(trimmed.replace(/\s+/g, ''))
  if (chars.length === 0 || chars.length > 16) return undefined
  if (STRUCTURE_PREFIX.test(trimmed)) return undefined
  const numericCount = chars.filter(char => NUMERIC_CHARS.test(char)).length
  const startsNumeric = /^[0-9¥￥$]/.test(trimmed)
  if (!startsNumeric && numericCount / chars.length <= 0.6) return undefined
  const tokens = trimmed.split(/\s+/)
  const valueIndex = tokens.findIndex(token => /^[0-9¥￥$]/.test(token))
  // A line with no numeric token cannot promote (the density gate passed on
  // punctuation alone).
  if (valueIndex < 0) return undefined
  let value: string = tokens[valueIndex] as string
  const labelIndexes = new Set<number>([valueIndex])
  const unitAfter = tokens[valueIndex + 1]
  if (unitAfter !== undefined && UNIT_WORDS.has(unitAfter)) {
    value = `${value} ${unitAfter}`
    labelIndexes.add(valueIndex + 1)
  }
  const label = tokens.filter((_, index) => !labelIndexes.has(index)).join(' ').trim()
  if (label === '' || value === '') return undefined
  return { label, value }
}

/** One rich block: narrative text or a run of adjacent metric lines. */
export type RichBlock =
  | { readonly kind: 'text'; readonly text: string }
  | { readonly kind: 'metric'; readonly metrics: readonly MetricLine[] }

/** One narrative run: fenced code lifted out whole, or the remaining text. */
export type RichRun =
  | { readonly kind: 'text'; readonly text: string }
  | { readonly kind: 'code'; readonly lang: string; readonly code: string }

/**
 * Split a narrative into fenced-code runs and the text between them (v6 B3):
 * code leaves before sanitizeBizText so the display-term pass never rewrites
 * an identifier inside a snippet, and each fence renders as its own deep
 * code plate with the language label off the fence's info string.
 * @param text - the whole narrative text.
 * @returns the ordered runs (fences keep their interior verbatim).
 */
export function splitCodeBlocks(text: string): RichRun[] {
  const runs: RichRun[] = []
  let pending = ''
  const lines = text.split('\n')
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index] as string
    const fence = /^```([^\s`]*)\s*$/.exec(line.trim())
    if (fence === null) {
      pending = pending === '' ? line : `${pending}\n${line}`
      continue
    }
    /* v8 ignore next -- the regex's single group always captures (possibly empty). */
    const lang = fence[1] ?? ''
    const body: string[] = []
    index += 1
    for (; index < lines.length; index++) {
      const inner = lines[index] as string
      if (inner.trim() === '```') break
      body.push(inner)
    }
    if (pending !== '') {
      runs.push({ kind: 'text', text: pending })
      pending = ''
    }
    runs.push({ kind: 'code', lang: lang === '' ? 'text' : lang, code: body.join('\n') })
  }
  if (pending !== '') runs.push({ kind: 'text', text: pending })
  return runs
}

/**
 * Split a narrative into rich blocks (03 §4.5): blank lines separate
 * paragraphs; inside a paragraph, adjacent metric lines gather into one
 * promoted run (rendered as a pair row) while the remaining lines keep their
 * original line breaks for the markdown pass.
 * @param text - the whole narrative text.
 * @returns the ordered blocks.
 */
export function splitRichBlocks(text: string): RichBlock[] {
  const blocks: RichBlock[] = []
  let pendingText: string[] = []
  let pendingMetrics: MetricLine[] = []
  const flushMetrics = (): void => {
    if (pendingMetrics.length > 0) {
      blocks.push({ kind: 'metric', metrics: pendingMetrics })
      pendingMetrics = []
    }
  }
  const flushText = (): void => {
    if (pendingText.length > 0) {
      blocks.push({ kind: 'text', text: pendingText.join('\n') })
      pendingText = []
    }
  }
  for (const line of text.split('\n')) {
    if (line.trim() === '') {
      flushMetrics()
      flushText()
      continue
    }
    const metric = parseMetricLine(line)
    if (metric === undefined) {
      flushMetrics()
      pendingText.push(line)
      continue
    }
    flushText()
    pendingMetrics.push(metric)
  }
  flushMetrics()
  flushText()
  return blocks
}

/**
 * The business-term map for the display-side leak fallback (03 §4.5 协议隐形):
 * collection names and snake_case field ids a model narrative or ask hint may
 * still carry map onto the people-language term the surface owns.
 */
const BIZ_TERMS: Readonly<Record<string, string>> = {
  pur_requests: '请购单',
  pur_rfqs: '询价单',
  pur_quotes: '供应商报价',
  pur_orders: '采购订单',
  pur_invoices: '采购发票',
  pur_payments: '付款申请',
  wms_receipts: '收货单',
  wms_transfers: '移库申请',
  wms_reservations: '预留登记',
  wms_reorder_suggestions: '补货建议',
  mfg_boms: 'BOM 配方',
  mfg_bom_lines: 'BOM 组件',
  mfg_bom_operations: 'BOM 工序',
  mfg_orders: '生产订单',
  mfg_order_operations: '工序排程',
  mfg_material_issues: '领料单',
  mfg_material_returns: '退料单',
  mfg_job_reports: '报工单',
  mfg_completions: '完工单',
  op_seq: '工序号',
  qty_good: '合格数量',
  qty_scrap: '不合格数量',
  duration_min: '工时',
  operator: '报工人',
  qc_status: '工序检验状态',
  oqc_status: '成品检验状态',
  qty_transferred: '已领料产出当量',
  qty_consumed: '已报工产出',
  actual_cost: '实际成本',
  cost_variance: '成本差异',
  kit_data: '齐套明细',
  issue_date: '领料日期',
  return_date: '退料日期',
  report_date: '报工日期',
  completed_at: '完工日期',
  bom_status: 'BOM 状态',
  qty_per_unit: '单位用量',
  scrap_pct: '损耗率',
  batch_size: '批量',
  setup_min: '准备工时',
  run_min: '加工工时',
  planned_date: '计划日期',
  planned_min: '计划工时',
  planned_start: '建议开工',
  planned_end: '建议完工',
  released_at: '下达日期',
  reservation_state: '齐套状态',
  estimated_cost: '预估总额',
  std_cost: '标准单位成本',
  transfer_no: '移库单号',
  ref_id: '用途单据',
  ref_type: '关联类型',
  from_bin: '源库位',
  to_bin: '目标库位',
  on_hand_atp: '可用量快照',
  suggest_qty: '建议补货量',
  counted_qty: '实盘数',
  snapshot_qty: '账面快照',
  hub_po_purchase_orders: '采购单（历史）',
  hub_po_suppliers: '采购联系人（历史）',
  srm_suppliers: '供应商准入档案',
  hub_qc_inspections: '质检记录（历史）',
  qm_inspections: '质检单',
  qm_inspection_readings: '检验读数',
  qm_aql_plans: 'AQL抽样方案',
  qm_nc_dispositions: '不合格处置单',
  insp_type: '检验类型',
  ref_no: '来源单号',
  lot_no: '批次号',
  lot_qty: '批量',
  sample_qty: '样本量',
  defect_critical: '严重缺陷数',
  defect_major: '主要缺陷数',
  defect_minor: '次要缺陷数',
  aql_target: 'AQL档',
  aql_code: '样本字码',
  aql_n: '样本量',
  aql_ac: '接收数',
  aql_re: '拒收数',
  result: '判定结果',
  inspector: '检验员',
  inspected_at: '检验日期',
  deviation_note: '让步偏差说明',
  scrap_cost: '报废成本',
  concession_flag: '让步标记',
  reject_streak: '连续拒收批数',
  inspection_code: '关联质检单',
  received_at: '收货日期',
  expected_date: '承诺到货日',
  hub_wms_inbound: '入库单',
  hub_wms_outbound: '出库单',
  hub_fin_payments: '回款记录',
  hub_po_items: '采购明细',
  supplier_id: '供应商',
  customer_id: '客户',
  product_name: '品名',
  product: '品名',
  quantity: '数量',
  qty: '数量',
  unit_price: '单价',
  order_date: '日期',
  po_number: '单号',
  supplier_code: '编号',
  lifecycle_status: '生命周期状态',
  contact: '联系人',
  qc_number: '单号',
  inbound_number: '单号',
  outbound_number: '单号',
  payment_number: '单号',
  status: '状态',
  total: '合计',
  amount: '金额',
}

/** Underscore-free identifiers that still map (`qty`). */
const WORD_TERMS: Readonly<Record<string, string>> = { qty: '数量' }

/** The supplier-lifecycle enum family derived over the field-control value
 * domain (W24-R1's single source): every state maps onto the catalog's zh
 * projection, so a state added there can never silently miss its
 * people-language word here. */
const LIFECYCLE_TERMS: Readonly<Record<string, string>> = Object.fromEntries(
  SUPPLIER_LIFECYCLE_STATES.map(state => [state, SUPPLIER_STATE_WORDS[state] ?? state]),
)

/**
 * Word terms that double as plain English words (`frozen goods`, `qualified
 * partner`, `the preferred supplier list`, `we are reviewing the order` in
 * English body prose): they map only when the token rides against a
 * Han-carrying segment of the leaf, when the token's own line is a bullet
 * enum line and the nearest neighboring segment is another lifecycle state
 * word (an enum run), or when the whole display leaf is a bare enum face —
 * nothing but state words, bullet markers, and numeric ordinals, so no
 * prose surrounds the word to protect (a metric value, action label, or
 * bullet list of states) — otherwise English prose keeps the word (W24-R1
 * for `frozen`/`qualified`, W24-R2 for the five everyday-word states
 * `potential`/`reviewing`/`preferred`/`rejected`/`eliminated` mirroring the
 * `suggestions` context rule in sanitize.ts, W24-R3 for the hyphen/asterisk
 * boundary and the bare enum face, W24-R4 fencing the enum-run neighbor to
 * bullet enum lines so adjacent state words in English prose — `the frozen
 * qualified partner` — no longer vouch for each other).
 */
const CONTEXTUAL_WORD_TERMS: Readonly<Record<string, string>> = {
  frozen: LIFECYCLE_TERMS.frozen ?? 'frozen',
  qualified: LIFECYCLE_TERMS.qualified ?? 'qualified',
  potential: LIFECYCLE_TERMS.potential ?? 'potential',
  reviewing: LIFECYCLE_TERMS.reviewing ?? 'reviewing',
  preferred: LIFECYCLE_TERMS.preferred ?? 'preferred',
  rejected: LIFECYCLE_TERMS.rejected ?? 'rejected',
  eliminated: LIFECYCLE_TERMS.eliminated ?? 'eliminated',
}

/**
 * One segment boundary: whitespace, CJK/Latin punctuation, and the ASCII
 * hyphen, asterisk, and plus (the W24-R2 segment gate, widened W24-R3 and
 * W24-R4): a markdown bullet marker — `-`, `*`, or `+` — must split
 * segments, or an enum word between two bullet markers probes two
 * marker-only neighbors and loses its mapping.
 */
const SEGMENT_BOUNDARY = /[\s，。、；：！？·,.!?;:（）()[\]【】「」『』…—–\-*+]/

/** The lowercase lifecycle-state words: a segment holding one marks an enum run (W24-R3). */
const LIFECYCLE_WORD_SET: ReadonlySet<string> = new Set(SUPPLIER_LIFECYCLE_STATES)

/**
 * Whether every segment of the display leaf is a lifecycle state word, a
 * numeric bullet ordinal, or boundary residue (W24-R3): a bare enum face —
 * a lone state word, `- qualified - restricted - preferred`, or a markdown
 * bullet list of states — carries no prose to protect, so the gated words
 * map directly like a bare-leaf enum value.
 */
const isBareEnumFace = (text: string): boolean =>
  text.toLowerCase().split(SEGMENT_BOUNDARY)
    .every(segment => segment === '' || LIFECYCLE_WORD_SET.has(segment) || /^\d+$/.test(segment))

/**
 * Whether one display line is a markdown bullet line holding nothing but
 * lifecycle state words, bullet markers, and numeric ordinals (W24-R4):
 * the enum-run environment a neighboring state word propagates through.
 * A state-word pair inside English prose (`the frozen qualified partner`)
 * rides a prose line, not a bullet enum line, so neither word opens the
 * gate for the other.
 * @param line - the display line the probed token rides in.
 */
const isBulletEnumLine = (line: string): boolean => {
  const trimmed = line.trim()
  return /^(?:[-*+]|\d+[.)、])\s/.test(trimmed) && isBareEnumFace(trimmed)
}

/**
 * The trailing segment run of a prefix: boundary chars at the end drop, then
 * the run up to the next boundary (the segment that touches the probe's
 * right edge from the left).
 * @param text - the text left of the probed token.
 * @returns the nearest complete segment ending at the probe.
 */
const tailSegment = (text: string): string => {
  let end = text.length - 1
  while (end >= 0 && SEGMENT_BOUNDARY.test(text.charAt(end))) end -= 1
  let start = end
  while (start >= 0 && !SEGMENT_BOUNDARY.test(text.charAt(start))) start -= 1
  return text.slice(start + 1, end + 1)
}

/**
 * The leading segment run of a suffix: boundary chars at the start drop,
 * then the run up to the next boundary.
 * @param text - the text right of the probed token.
 * @returns the nearest complete segment starting at the probe.
 */
const headSegment = (text: string): string => {
  let start = 0
  while (start < text.length && SEGMENT_BOUNDARY.test(text.charAt(start))) start += 1
  let end = start
  while (end < text.length && !SEGMENT_BOUNDARY.test(text.charAt(end))) end += 1
  return text.slice(start, end)
}

/**
 * Whether one neighboring segment carries Han narrative — or, only inside
 * the run of a bullet enum line, is itself a lifecycle state word: the
 * token rides against a Han segment, or sits in an enum run where the
 * neighboring slot holds another state (W24-R3 opened, W24-R4 fenced to
 * bullet enum lines so adjacent state words in English prose no longer
 * vouch for each other).
 * @param segment - one nearest complete segment.
 * @param enumRun - whether the probed token's own line is a bullet enum line.
 */
const gateSegment = (segment: string, enumRun: boolean): boolean =>
  HAS_CJK.test(segment) || (enumRun && LIFECYCLE_WORD_SET.has(segment.toLowerCase()))

/**
 * The contextual state word of one token (above): undefined keeps the token.
 * The W24-R2 segment gate probes the two segments nearest the token — a
 * token glued to Han text shares its segment, and a lone token between
 * segments reads the neighbors — so `该供方 potential 已停用` maps 潜在
 * while `frozen goods 已冻结` keeps its English half verbatim. W24-R3 adds
 * two openings: a neighboring segment that is itself a lifecycle state word
 * (the token sits inside an enum run, so a bullet list maps through), and
 * the bare-enum-face leaf (the W24-R1 lone-word exception generalized to
 * bullet markers and numeric ordinals). W24-R4 fences the enum-run opening
 * to tokens whose own line is a bullet enum line, so adjacent state words
 * in English prose (`the frozen qualified partner`) keep their words.
 * @param whole - the entire display string the token rides in.
 * @param token - the lowercased token.
 * @param offset - the token's start index within the whole string.
 * @returns the people word, or undefined when the context does not hold.
 */
const contextualStateWord = (whole: string, token: string, offset: number): string | undefined => {
  const word = CONTEXTUAL_WORD_TERMS[token]
  if (word === undefined) return undefined
  if (isBareEnumFace(whole)) return word
  const lineStart = whole.lastIndexOf('\n', offset - 1) + 1
  const lineEnd = whole.indexOf('\n', offset)
  const enumRun = isBulletEnumLine(whole.slice(lineStart, lineEnd === -1 ? whole.length : lineEnd))
  return gateSegment(tailSegment(whole.slice(0, offset)), enumRun)
    || gateSegment(headSegment(whole.slice(offset + token.length)), enumRun)
    ? word
    : undefined
}

/**
 * Case-insensitive word terms (W24): all-caps abbreviations a narrative leaks
 * in any casing (`ATP`, `atp`) and the supplier lifecycle's bare enum values
 * map onto their business words. W24-R1 derives the lifecycle family from
 * the field-control value domain over the catalog's zh words — `qualified`
 * renders as 合格 on every surface (no render-side synonym), and the
 * dictionary-word states (`frozen`, `qualified`) sit in
 * {@link CONTEXTUAL_WORD_TERMS} behind the CJK gate instead. W24-R2 moves
 * the five everyday-word states (`potential`, `reviewing`, `preferred`,
 * `rejected`, `eliminated`) behind the same gate, leaving only `restricted`
 * here — a word English body prose never carries.
 */
const WORD_TERMS_CI: Readonly<Record<string, string>> = {
  atp: '可用库存',
  rop: '再订货点',
  ...Object.fromEntries(
    SUPPLIER_LIFECYCLE_STATES
      .filter(state => !(state in CONTEXTUAL_WORD_TERMS))
      .map(state => [state, LIFECYCLE_TERMS[state] ?? state]),
  ),
}

/** Whether the string carries Han-script narrative (the context gates' probe). */
export const HAS_CJK = /\p{Script=Han}/u

/** A snake_case identifier (`hub_po_items`, `supplier_id`). */
const SNAKE_ID = /[A-Za-z][A-Za-z0-9]*(?:_[A-Za-z0-9]+)+/g

/** An unmapped snake identifier still left after the term pass. */
const LEFTOVER_SNAKE = /[A-Za-z][A-Za-z0-9]*(?:_[A-Za-z0-9]+)+/

/** One balanced full- or half-width parenthesized group. */
const PAREN_GROUP = /（[^（）()]*）|\([^（）()]*\)/g

/**
 * Build a case-insensitive leak matcher (W24-R1): every leak-family pattern
 * goes through this factory so the `i` flag cannot drift per-family — the
 * W24 AQL and streak matchers shipped lowercase-blind, and `D≥RE` or an
 * all-lowercase `aql抽样` passed through untouched.
 * @param source - the pattern source.
 * @param flags - flags beyond the forced `i` (defaults to `g`).
 * @returns the compiled matcher.
 */
const buildCiRegex = (source: string, flags = 'g'): RegExp =>
  new RegExp(source, flags.includes('i') ? flags : `${flags}i`)

/** A bare row-id reference a model label may carry (`id 7`, `（id 7）`). */
const ID_REF = buildCiRegex('[(（]\\s*id\\s*[:：]?\\s*\\d+\\s*[)）]|\\bid\\s+\\d+')

/**
 * A bare entity-type-plus-id reference (W24): `supplier 4`, `product1`,
 * `Customer #8`, and the plural slips (`suppliers 4`, W24-R1) — the wire
 * label a lazy narrative quotes instead of the entity's name. Each maps onto
 * the people-language fallback (「某供应商 4 号」); the persona's name
 * discipline owns the primary path (write the real name), this is the
 * render-side guarantee.
 */
const ENTITY_REF = buildCiRegex('\\b(suppliers?|products?|customers?|materials?)\\s*#?\\s*(\\d+)\\b')

/** The people-language noun of one entity-reference root (a plural slip folds onto the singular noun). */
const ENTITY_NOUN: Readonly<Record<string, string>> = {
  supplier: '某供应商',
  product: '某物料',
  material: '某物料',
  customer: '某客户',
}

/** The full AQL rejection phrase maps whole onto its people sentence, in any casing (W24, W24-R1 CI factory). */
const AQL_REJECT_PHRASE = buildCiRegex('AQL\\s*抽样\\s*[，,]?\\s*d\\s*[≥>]=?\\s*Re\\s*拒收')

/** The bare sampling verdict notations (`d≥Re`, `d<=Ac`) in any spacing or casing (W24, W24-R1). */
const AQL_REJECT_NOTATION = buildCiRegex('\\bd\\s*[≥>]=?\\s*Re\\b')
const AQL_ACCEPT_NOTATION = buildCiRegex('\\bd\\s*[≤<]=?\\s*Ac\\b')

/** The receiving-state pair a narrative leaks (`receiving=none`,
 * `receiving_status=none` in any casing) maps whole onto its people words
 * (W24-R1; the persona presets already ban the pair — this is the
 * render-side guarantee). */
const RECEIVING_NONE_PHRASE = buildCiRegex('\\breceiving(?:_status)?\\s*=\\s*none\\b')

/** The full streak word after a Chinese noun folds into one clause (W24):
 * `连续拒收 streak≥3` → `连续拒收 3 次及以上`; a trailing `·次`/`次` unit
 * token (W24-R1) is consumed with the match so it cannot survive the fold. */
const STREAK_PHRASE = buildCiRegex('([一-龥]{2,6})\\s*streak\\s*[≥>]=?\\s*(\\d+)\\b(?:\\s*[·•]?\\s*次)?')

/** A bare streak comparison a label may still carry (`streak≥3`, W24). */
const STREAK_BARE = buildCiRegex('\\bstreak\\s*[≥>]=?\\s*(\\d+)\\b(?:\\s*[·•]?\\s*次)?')
/**
 * Display-side sanitization of one narrative or ask string (03 §4.5): known
 * collection and field identifiers become their business terms; an
 * unmappable `hub_` name degrades to 业务记录; a bare row-id reference drops
 * out; a parenthesized group still carrying a leftover identifier drops out
 * whole. W24: entity-id references (`supplier 4`) resolve to the
 * people-language fallback noun, the AQL verdict notation renders as its
 * people sentence, and streak comparisons fold into a Chinese clause.
 * W24-R1: every leak matcher is case-insensitive through the CI factory
 * (`D≥RE`, `aql抽样` render the same sentence), the supplier lifecycle's
 * bare enum values map onto the catalog's zh words (derived from the
 * field-control value domain), `receiving=none` reads 尚未收货, and the two
 * dictionary-word states (`frozen`, `qualified`) map only inside a CJK
 * narrative so English prose keeps its words. W24-R2 widens that gate to the
 * five everyday-word states and probes it at segment granularity: a token
 * maps only when the segment beside it carries Han text, so an English
 * phrase inside a mixed leaf (`frozen goods 已冻结`) keeps its English half
 * verbatim. W24-R3 splits segments at the ASCII hyphen and asterisk and
 * opens the gate to enum runs and bare enum faces, so a markdown bullet
 * list of states maps through while English prose keeps its words. W24-R4
 * adds the plus marker to the boundary set and fences the enum-run
 * neighbor to bullet enum lines, so adjacent state words in English prose
 * (`the frozen qualified partner`) keep their words. The persona bans
 * these leaks — this is the guarantee the user never sees one anyway.
 * @param text - the model-authored display string.
 * @returns the people-language rendering.
 */
export function sanitizeBizText(text: string): string {
  const mapped = text
    .replace(/[A-Za-z0-9]+/g, (match, offset: number) => {
      const lower = match.toLowerCase()
      return WORD_TERMS[match] ?? WORD_TERMS_CI[lower] ?? contextualStateWord(text, lower, offset) ?? match
    })
    // The receiving pair rides ahead of the snake pass: a future
    // `receiving_status` term must not rewrite the field half and shadow the
    // pair's people words.
    .replace(RECEIVING_NONE_PHRASE, '尚未收货')
    .replace(SNAKE_ID, match => BIZ_TERMS[match] ?? match)
    .replace(/\bhub_[A-Za-z0-9_]+/g, '业务记录')
    .replace(AQL_REJECT_PHRASE, '按抽检标准判定拒收（不合格数达到拒收线）')
    .replace(AQL_REJECT_NOTATION, '不合格数达到拒收线')
    .replace(AQL_ACCEPT_NOTATION, '不合格数未超接收线')
    .replace(STREAK_PHRASE, (_whole, noun: string, count: string) => `${noun} ${count} 次及以上`)
    .replace(STREAK_BARE, (_whole, count: string) => `已连续 ${count} 次`)
    .replace(ENTITY_REF, (whole, root: string, id: string) => {
      const noun = ENTITY_NOUN[root.toLowerCase().replace(/s$/, '')]
      return noun === undefined ? whole : `${noun} ${id} 号`
    })
    .replace(ID_REF, '')
  const cleaned = mapped.replace(PAREN_GROUP, group => (LEFTOVER_SNAKE.test(group) ? '' : group))
  return cleaned.replace(/ {2,}/g, ' ').trim()
}
