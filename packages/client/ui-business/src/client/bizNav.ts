/**
 * Pure navigation derivation for the business page's collection navigator:
 * domain grouping (CRM/SRM/WMS/订单/帮助台/费用/食品业务 by name/title
 * keywords), live search over name+title (English collection names take
 * substring matches; Chinese titles match natively), frecency ordering of the
 * 常用 rail (localStorage, the kb recent-searches pattern), the low-risk
 * inline-edit field whitelist (备注/数量/日期), and the SRM/order view hints
 * (supplier-like and order-like collection detection with their cert/audit
 * and status field extraction). No state, no IO beyond the persisted
 * frecency log.
 * @module @deepseek-ai/dsh-client-ui-business/client/bizNav
 */

import type { BizCollectionRow } from './bizTypes.ts'

/** Domain group ids, in navigator order: the carbon modules (the catalog's own grouping) plus the frecency rail. */
export const BIZ_DOMAINS = [
  'frequent', 'master', 'sales', 'purchasing', 'inventory', 'production', 'quality', 'other',
] as const

/** One domain group id. */
export type BizDomain = typeof BIZ_DOMAINS[number]

/** How many collections the 常用 rail keeps. */
export const FRECENT_LIMIT = 6

/** localStorage entry the frecency log persists to. */
const FRECENT_KEY = 'dsh-biz-recent-collections'

/** The in-memory frecency fallback when localStorage is unavailable. */
let frecentMemory: string[] = []

/** The catalog's module ids (the domain groups the carbon roster names directly). */
const MODULE_DOMAINS: ReadonlySet<string> = new Set(['master', 'sales', 'purchasing', 'inventory', 'production', 'quality'])

/**
 * The domain group one table belongs to: the catalog's own module field when
 * present (the carbon roster), the keyword fallback otherwise.
 * @param entry - the collection roster row.
 * @returns the domain id ('other' when neither names a module).
 */
export function domainOf(entry: BizCollectionRow): BizDomain {
  if (entry.module !== undefined && MODULE_DOMAINS.has(entry.module)) return entry.module as BizDomain
  const text = `${entry.name} ${entry.title ?? ''}`
  if (/订单|order|shipment|发货/iu.test(text)) return 'sales'
  if (/供应商|供应|suppl|vendor|采购|procure|receipt|收货/iu.test(text)) return 'purchasing'
  if (/库存|仓库|warehouse|stock|物料|item/iu.test(text)) return 'inventory'
  if (/生产|工单|job|production/iu.test(text)) return 'production'
  if (/质量|质检|不合格|nonconformance|quality/iu.test(text)) return 'quality'
  if (/客户|customer|主数据|master/iu.test(text)) return 'master'
  return 'other'
}

/**
 * Whether one collection matches the navigator's live search.
 * @param entry - the collection roster row.
 * @param query - the trimmed search text (empty matches everything).
 * @returns true when the roster row matches the search text.
 */
export function collectionMatches(entry: BizCollectionRow, query: string): boolean {
  if (query.length === 0) return true
  const text = `${entry.name} ${entry.title ?? ''}`.toLowerCase()
  return text.includes(query.toLowerCase())
}

/**
 * Group the roster into ordered domain buckets.
 * @param roster - the visible collections.
 * @param query - the live search text (empty groups stay absent).
 * @returns one bucket per non-empty domain, in {@link BIZ_DOMAINS} order.
 */
export function groupRoster(
  roster: readonly BizCollectionRow[],
  query: string,
): ReadonlyArray<{ domain: BizDomain; entries: readonly BizCollectionRow[] }> {
  const buckets = new Map<BizDomain, BizCollectionRow[]>()
  const frecent = new Set(frecentCollections())
  for (const entry of roster) {
    if (!collectionMatches(entry, query)) continue
    if (frecent.has(entry.name)) {
      const bucket = buckets.get('frequent') ?? []
      bucket.push(entry)
      buckets.set('frequent', bucket)
    }
    const domain = domainOf(entry)
    const bucket = buckets.get(domain) ?? []
    bucket.push(entry)
    buckets.set(domain, bucket)
  }
  return BIZ_DOMAINS
    .map(domain => ({ domain, entries: buckets.get(domain) ?? [] }))
    .filter(bucket => bucket.entries.length > 0)
}

/** Read the persisted frecency log (most recent first, capped). */
function readFrecent(): string[] {
  let raw: string[]
  if (typeof localStorage === 'undefined') {
    raw = frecentMemory
  } else {
    try {
      const stored = localStorage.getItem(FRECENT_KEY)
      const parsed: unknown = stored === null ? undefined : JSON.parse(stored)
      raw = Array.isArray(parsed) && parsed.every(item => typeof item === 'string')
        ? parsed
        : frecentMemory
    } catch {
      raw = frecentMemory
    }
  }
  return raw.slice(0, FRECENT_LIMIT)
}

/**
 * List the recently-used collection names (the 常用 rail's identity set).
 * @returns the capped name list, most recent first.
 */
export function frecentCollections(): string[] {
  return readFrecent()
}

/**
 * Record one collection use: moved to the front, capped.
 * @param name - the collection name just opened.
 * @returns the updated list.
 */
export function noteCollectionUsed(name: string): string[] {
  const next = [name, ...readFrecent().filter(item => item !== name)].slice(0, FRECENT_LIMIT)
  frecentMemory = next
  if (typeof localStorage !== 'undefined') {
    try {
      localStorage.setItem(FRECENT_KEY, JSON.stringify(next))
    } catch {
      // Quota or private mode: persistence silently disables.
    }
  }
  return next
}

/** The inline-edit whitelist: low-risk field names (备注/数量/日期 semantics). */
const INLINE_EDIT_FIELD = /remark|note|备注|留言/iu
const INLINE_EDIT_QTY = /^(qty|quantity|count|数量)$/iu
const INLINE_EDIT_DATE = /date$|日期|到期| expiry |有效期/iu

/**
 * Whether one field name is whitelisted for the card's inline edit.
 * @param fieldName - the collection field name.
 * @returns true when the field is a low-risk inline-edit candidate.
 */
export function isInlineEditable(fieldName: string): boolean {
  return INLINE_EDIT_FIELD.test(fieldName) || INLINE_EDIT_QTY.test(fieldName) || INLINE_EDIT_DATE.test(fieldName)
}

/**
 * Whether a collection reads supplier-like (the SRM 360 view's trigger).
 * @param entry - the collection roster row.
 * @returns true when the name or title carries supplier semantics.
 */
export function isSupplierCollection(entry: BizCollectionRow): boolean {
  return /供应商|供应|suppl|vendor|srm/iu.test(`${entry.name} ${entry.title ?? ''}`)
}

/**
 * Whether a collection reads order-like (the status-badge rendering's trigger).
 * @param entry - the collection roster row.
 * @returns true when the name or title carries order semantics.
 */
export function isOrderCollection(entry: BizCollectionRow): boolean {
  return /订单|order/iu.test(`${entry.name} ${entry.title ?? ''}`)
}

/** Cert/audit field extractor for the supplier 360 view (field name or title). */
const CERT_FIELD = /证|资质|cert|licen[cs]e|expire|到期|有效期|audit|审核/iu

/**
 * Pick one supplier row's 360 cells: certificate/licence/audit fields with
 * their values (the expiry-warning list).
 * @param row - one supplier record.
 * @returns the matching [fieldName, text] pairs in row order.
 */
export function supplierCertCells(row: Record<string, unknown>): readonly [string, string][] {
  const cells: [string, string][] = []
  for (const [key, value] of Object.entries(row)) {
    if (key === 'id') continue
    if (!CERT_FIELD.test(key)) continue
    if (typeof value !== 'string' && typeof value !== 'number' && typeof value !== 'boolean') continue
    const text = String(value)
    if (text.length > 0) cells.push([key, text])
  }
  return cells
}


/**
 * Days from today until an ISO-ish date text.
 * @param dateText - the raw cell text (for example `2026-11-01`).
 * @returns whole days until the date; negative when past, NaN when unparseable.
 */
export function daysUntil(dateText: string): number {
  const parsed = Date.parse(dateText)
  if (Number.isNaN(parsed)) return Number.NaN
  return Math.floor((parsed - Date.now()) / 86_400_000)
}

/** One status-like field name for order collections. */
const STATUS_FIELD = /status|状态/iu

/**
 * Pick one order row's status cell.
 * @param row - one order record.
 * @returns the [fieldName, text] pair, or undefined when no status field.
 */
export function orderStatusCell(row: Record<string, unknown>): [string, string] | undefined {
  for (const [key, value] of Object.entries(row)) {
    if (!STATUS_FIELD.test(key)) continue
    if (typeof value !== 'string' && typeof value !== 'number' && typeof value !== 'boolean') continue
    const text = String(value)
    if (text.length > 0) return [key, text]
  }
  return undefined
}
