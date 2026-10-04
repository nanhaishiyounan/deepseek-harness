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
 * Render one narrative block to sanitized HTML.
 * @param text - the people-language text block.
 * @returns DOMPurify-clean HTML (paragraphs, lists, tables, strong…).
 */
export function renderMarkdown(text: string): string {
  return DOMPurify.sanitize(md.render(text))
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

/** A snake_case identifier (`hub_po_items`, `supplier_id`). */
const SNAKE_ID = /[A-Za-z][A-Za-z0-9]*(?:_[A-Za-z0-9]+)+/g

/** An unmapped snake identifier still left after the term pass. */
const LEFTOVER_SNAKE = /[A-Za-z][A-Za-z0-9]*(?:_[A-Za-z0-9]+)+/

/** One balanced full- or half-width parenthesized group. */
const PAREN_GROUP = /（[^（）()]*）|\([^（）()]*\)/g

/** A bare row-id reference a model label may carry (`id 7`, `（id 7）`). */
const ID_REF = /[(（]\s*id\s*[:：]?\s*\d+\s*[)）]|\bid\s+\d+/gi
/**
 * Display-side sanitization of one narrative or ask string (03 §4.5): known
 * collection and field identifiers become their business terms; an
 * unmappable `hub_` name degrades to 业务记录; a bare row-id reference drops
 * out; a parenthesized group still carrying a leftover identifier drops out
 * whole. The persona bans these leaks — this is the guarantee the user never
 * sees one anyway.
 * @param text - the model-authored display string.
 * @returns the people-language rendering.
 */
export function sanitizeBizText(text: string): string {
  const mapped = text
    .replace(/[A-Za-z0-9]+/g, match => WORD_TERMS[match] ?? match)
    .replace(SNAKE_ID, match => BIZ_TERMS[match] ?? match)
    .replace(/\bhub_[A-Za-z0-9_]+/g, '业务记录')
    .replace(ID_REF, '')
  const cleaned = mapped.replace(PAREN_GROUP, group => (LEFTOVER_SNAKE.test(group) ? '' : group))
  return cleaned.replace(/ {2,}/g, ' ').trim()
}
