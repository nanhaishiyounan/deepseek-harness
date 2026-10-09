/**
 * The W6-B1 business-documents catalog: the collection directory the
 * `#/docs` pages render (per-role grouping over the shared base), the
 * doc-type display labels the todos and docs surfaces share, and the
 * state-vocabulary projection — approval collections keep their six
 * doc_status words while posting collections (wms/mfg/hub) translate their
 * draft/pending words with posting semantics (待过账), never approval words
 * (the B0 leftover ③ fix: a wms_receipts draft reads 待仓库过账, not 草稿待审).
 * No React imports.
 */

import { SUPPLIER_LIFECYCLE_STATES } from './fieldControls.ts'

/** One browsable collection entry (label + the list's default sort field). */
export interface DocCollectionEntry {
  readonly collection: string
  readonly label: string
  /** The title-ish column the list rows lead with (falls back to id). */
  readonly titleField: string
}

/** The shared catalog every role's group builds on (W6-B1). */
const BASE_COLLECTIONS: ReadonlyArray<{ collection: string; label: string; titleField: string }> = [
  { collection: 'pur_orders', label: '采购订单', titleField: 'code' },
  { collection: 'pur_requests', label: '请购单', titleField: 'code' },
  { collection: 'so_orders', label: '销售订单', titleField: 'code' },
  { collection: 'mfg_orders', label: '生产订单', titleField: 'code' },
  { collection: 'wms_receipts', label: '收货单', titleField: 'receipt_no' },
  { collection: 'wms_transfers', label: '移库单', titleField: 'transfer_no' },
  { collection: 'wms_reservations', label: '预留单', titleField: 'code' },
  { collection: 'mfg_job_reports', label: '报工单', titleField: 'code' },
  { collection: 'mfg_completions', label: '完工单', titleField: 'code' },
  { collection: 'qm_inspections', label: '质检单', titleField: 'code' },
  { collection: 'qm_nc_dispositions', label: '不合格处置单', titleField: 'code' },
  { collection: 'srm_suppliers', label: '供应商档案', titleField: 'name' },
  { collection: 'hub_inv_products', label: '物料目录', titleField: 'name' },
  { collection: 'wms_lots', label: '批次档案', titleField: 'lot_no' },
]

const byCollection = (collection: string): DocCollectionEntry | undefined =>
  BASE_COLLECTIONS.find(entry => entry.collection === collection)

/** One role's document group: the role's display name and its collections. */
export interface RoleDocGroup {
  readonly role: string
  readonly groups: readonly string[]
}

/** The eight rehearsal roles' collection whitelists (W5-B8 accounts). */
const ROLE_COLLECTIONS: Readonly<Record<string, readonly string[]>> = {
  buyer: ['pur_orders', 'pur_requests', 'srm_suppliers'],
  finance: ['pur_orders', 'so_orders', 'srm_suppliers'],
  keeper: ['wms_receipts', 'wms_transfers', 'wms_reservations', 'hub_inv_products', 'wms_lots'],
  qc_inspector: ['qm_inspections', 'qm_nc_dispositions', 'wms_receipts', 'wms_lots'],
  planner: ['mfg_orders', 'pur_requests', 'hub_inv_products'],
  shop_lead: ['mfg_orders', 'mfg_job_reports', 'mfg_completions'],
  sales_rep: ['so_orders', 'hub_inv_products'],
  admin: BASE_COLLECTIONS.map(entry => entry.collection),
}

/**
 * The document groups one signed-in user sees (G6): a known rehearsal role
 * reads its own subset; any other account reads the full base catalog under
 * the generic group name (fail-open display grouping, never a dead page).
 * @param username - the signed-in NocoBase username.
 * @returns the visible collections in catalog order.
 */
export function visibleCollectionsOf(username: string): readonly DocCollectionEntry[] {
  const whitelist = ROLE_COLLECTIONS[username]
  if (whitelist === undefined) return BASE_COLLECTIONS
  return whitelist.flatMap((name) => {
    const entry = byCollection(name)
    return entry === undefined ? [] : [entry]
  })
}

/**
 * Whether one collection is within the signed-in user's role whitelist (the
 * deep-link guard's first layer; the server's scope table is the boundary).
 * @param username - the signed-in NocoBase username.
 * @param collection - the deep-linked collection name.
 * @returns false when a configured role's whitelist excludes the collection;
 * true when allowed; undefined when the account has no configured role
 * (fail-open — same stance as the server's scope table).
 */
export function collectionAllowedFor(username: string, collection: string): boolean | undefined {
  const whitelist = ROLE_COLLECTIONS[username]
  if (whitelist === undefined) return undefined
  return whitelist.includes(collection)
}

/**
 * The display label of one doc type (todos rows and approval cards share it).
 * @param collection - the wfl doc_type / collection name.
 * @returns the Chinese label, or the raw name for unmapped collections.
 */
export function docLabelOf(collection: string): string {
  return byCollection(collection)?.label ?? collection
}

/**
 * The title column one doc type's rows lead with (the list cell the row link
 * shows before the meta reads land).
 * @param collection - the collection name.
 * @returns the field name (id when unmapped).
 */
export function docTitleFieldOf(collection: string): string {
  return byCollection(collection)?.titleField ?? 'id'
}

/**
 * Whether one collection's state field is the approval vocabulary (six
 * doc_status states) — everything in this catalog except the posting
 * collections below.
 */
const POSTING_COLLECTIONS: readonly string[] = [
  'wms_receipts', 'wms_transfers', 'wms_reservations', 'mfg_job_reports', 'mfg_completions',
]

/** The approval vocabulary's zh projection (six states, supplier words share keys). */
const APPROVAL_WORDS: Readonly<Record<string, string>> = {
  draft: '草稿', pending: '待审批', pending_level2: '二级审批中',
  approved: '已生效', rejected: '已驳回', void: '已作废',
  reviewing: '准入评审中', qualified: '合格', potential: '潜在',
  preferred: '优选', restricted: '受限', frozen: '冻结', eliminated: '已淘汰',
}

/**
 * The supplier lifecycle states' zh projection (W24-R1): derived over
 * {@link SUPPLIER_LIFECYCLE_STATES} from the shared approval vocabulary, so
 * the display-side word table and this catalog can never fork a state's
 * people word (`qualified` is 合格 on every surface, never a render-side
 * synonym). A state the vocabulary misses projects onto itself, which the
 * word table's full-domain test rejects.
 */
export const SUPPLIER_STATE_WORDS: Readonly<Record<string, string>> = Object.fromEntries(
  SUPPLIER_LIFECYCLE_STATES.map(state => [state, APPROVAL_WORDS[state] ?? state]),
)

/** The posting vocabulary's zh projection (draft here means awaiting the posting engine). */
const POSTING_WORDS: Readonly<Record<string, string>> = {
  draft: '待过账', pending: '过账处理中', posted: '已过账', done: '已过账',
  counting: '盘点中', difference: '差异待审', completed: '已完成', reserved: '已预留',
  released: '已释放', not_required: '无需检验',
}

/**
 * Project one business state word onto its user-facing meaning with the
 * owning collection's semantics (leftover ③): approval collections keep the
 * six-state approval words; posting collections translate with posting
 * semantics — a wms_receipts draft is a receipt waiting for the warehouse to
 * post it onto shelves, not a draft awaiting approval.
 * @param collection - the row's collection.
 * @param state - the raw state word (doc_status / status / lifecycle_status).
 * @returns the zh label, or the raw word unmapped.
 */
export function stateWordOf(collection: string, state: string): string {
  const words = POSTING_COLLECTIONS.includes(collection) ? POSTING_WORDS : APPROVAL_WORDS
  return words[state] ?? APPROVAL_WORDS[state] ?? state
}
