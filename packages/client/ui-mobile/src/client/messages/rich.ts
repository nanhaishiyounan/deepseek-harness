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
  hub_po_purchase_orders: '采购单',
  hub_po_suppliers: '供应商',
  hub_qc_inspections: '质检记录',
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
/**
 * Display-side sanitization of one narrative or ask string (03 §4.5): known
 * collection and field identifiers become their business terms; an
 * unmappable `hub_` name degrades to 业务记录; a parenthesized group still
 * carrying a leftover identifier drops out whole. The persona bans these
 * leaks — this is the guarantee the user never sees one anyway.
 * @param text - the model-authored display string.
 * @returns the people-language rendering.
 */
export function sanitizeBizText(text: string): string {
  const mapped = text
    .replace(/[A-Za-z0-9]+/g, match => WORD_TERMS[match] ?? match)
    .replace(SNAKE_ID, match => BIZ_TERMS[match] ?? match)
    .replace(/\bhub_[A-Za-z0-9_]+/g, '业务记录')
  const cleaned = mapped.replace(PAREN_GROUP, group => (LEFTOVER_SNAKE.test(group) ? '' : group))
  return cleaned.replace(/ {2,}/g, ' ').trim()
}
