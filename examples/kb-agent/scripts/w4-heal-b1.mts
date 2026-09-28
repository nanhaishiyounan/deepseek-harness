/**
 * W4-B1 table-standards heal: default sort (78 pages), FilterForm (37-page
 * gap), money/date column formats, association titleField rebinding, and
 * status colored tags platform-wide. Idempotent; every created node carries
 * the w4b1 prefix; every mutation snapshots its before-state into
 * research/2026-09-28-w4-completeness/w4-b1-rollback.json first.
 *
 * Usage:
 *   node --import tsx/esm examples/kb-agent/scripts/w4-heal-b1.mts --dry-run [--pilot|--domain procurement|...|--all]
 *   node --import tsx/esm examples/kb-agent/scripts/w4-heal-b1.mts --pilot     # 采购订单 + 任务列表 hard gate
 *   node --import tsx/esm examples/kb-agent/scripts/w4-heal-b1.mts --domain manufacturing   # one domain batch
 *   node --import tsx/esm examples/kb-agent/scripts/w4-heal-b1.mts --all
 *   node --import tsx/esm examples/kb-agent/scripts/w4-heal-b1.mts --rollback [--pilot|--domain X|--all]
 *   node --import tsx/esm examples/kb-agent/scripts/w4-heal-b1.mts --assert  # five defect counters must be zero
 */
import { readFileSync, writeFileSync } from 'node:fs'
import {
  applyColumnDisplayProps, applyTableDefaultSort, call, dataOf, dateColumnProps, enumizeColumn,
  ensureFilterForm, listFlowModels, listRoutes, numberColumnProps, rebindColumnTitleField,
  signInWithRetry, statusColumnOptions, type FlowModelRow, type StatusColumnOption,
} from './nocobase-flow-page-lib.mts'

const RESEARCH_DIR = new URL('../../../research/2026-09-28-w4-completeness/', import.meta.url).pathname
const ROLLBACK_PATH = `${RESEARCH_DIR}w4-b1-rollback.json`

// ─── platform palette (T-6'/F-7'): value semantics → label + antd color ───

const STATUS_LABELS: Readonly<Record<string, [string, string]>> = {
  draft: ['草稿', 'default'], pending: ['待处理', 'orange'], pending_level2: ['二级审批中', 'purple'],
  submitted: ['已提交', 'blue'], approved: ['已生效', 'green'], rejected: ['已驳回', 'red'],
  void: ['已作废', 'default'], released: ['已下达', 'blue'], in_progress: ['执行中', 'orange'],
  completed: ['已完成', 'green'], closed: ['已关闭', 'default'], done: ['已完成', 'green'],
  active: ['生效', 'green'], inactive: ['停用', 'default'], retired: ['退役', 'default'],
  cancelled: ['已取消', 'default'], confirmed: ['已确认', 'green'], planned: ['已计划', 'blue'],
  started: ['已开工', 'orange'], processing: ['处理中', 'blue'], waiting: ['等待中', 'orange'],
  open: ['进行中', 'blue'], resolved: ['已解决', 'green'], passed: ['合格', 'green'],
  failed: ['不合格', 'red'], concession: ['让步接收', 'orange'], new: ['新建', 'default'],
  // 维保英文残留值中文化（B1 §2.6）
  Preventive: ['预防性', 'blue'], Corrective: ['纠正性', 'orange'], Inspection: ['点检', 'cyan'],
  Scheduled: ['已排程', 'blue'], 'In progress': ['进行中', 'orange'], Done: ['已完成', 'green'],
}

const colorFor = (value: string): [string, string] => STATUS_LABELS[value] ?? [value, 'blue']

/** Full-coverage options for one select field: uiSchema.enum values normalized to label+color. Values covered by the platform palette are forced to the Chinese label (维保's English remnants ride here); unknown values keep their existing label. */
function optionsForEnum(enumEntries: ReadonlyArray<{ value?: unknown, label?: unknown, color?: unknown }>): StatusColumnOption[] {
  return statusColumnOptions(enumEntries.map(entry => {
    const value = String(entry.value ?? '')
    const [fallbackLabel, color] = colorFor(value)
    const label = STATUS_LABELS[value] !== undefined
      ? fallbackLabel
      : (typeof entry.label === 'string' && entry.label !== '' ? entry.label : fallbackLabel)
    return [value, label, color] as [string, string, string]
  }))
}

// ─── live snapshot + page-tree walk (the audit probe's traversal, live) ───

type FieldMeta = {
  name: string
  interface: string | null
  type: string | null
  target: string | null
  enumEntries: Array<{ value?: unknown, label?: unknown, color?: unknown }>
}
type CollectionMeta = { name: string, titleField: string | null }

type LiveSnapshot = {
  routes: Awaited<ReturnType<typeof listRoutes>>
  models: FlowModelRow[]
  fieldsByCollection: Map<string, FieldMeta[]>
  collections: Map<string, CollectionMeta>
}

/**
 * Field metadata across all collections. The plain /api/fields:list rows omit
 * collectionName, so the cross-collection view rides /api/collectionFields:list
 * (the audit-fetch channel) with /api/fields:list as the fallback probe.
 */
async function fetchFields(token: string): Promise<Array<FieldMeta & { collectionName: string }>> {
  for (const path of ['/api/collectionFields:list?pageSize=2000&sort=collectionName', '/api/fields:list?pageSize=2000&sort=collectionName']) {
    const rows = await dataOf(token, 'GET', path).catch(() => null) as Array<Record<string, any>> | null
    if (!Array.isArray(rows) || rows.length === 0) continue
    if (rows.length === 2000) throw new Error(`${path} may be truncated at pageSize=2000; raise the page size`)
    const shaped = rows
      .filter(row => typeof row.collectionName === 'string' && row.collectionName !== '' && typeof row.name === 'string')
      .map(row => ({
        collectionName: row.collectionName as string,
        name: row.name as string,
        interface: row.interface ?? null,
        type: row.type ?? null,
        target: row.target ?? null,
        enumEntries: Array.isArray(row.uiSchema?.enum) ? row.uiSchema.enum : [],
      }))
    if (shaped.length > 0) return shaped
  }
  throw new Error('neither collectionFields:list nor fields:list returned collection-scoped field rows')
}

async function fetchCollections(token: string): Promise<CollectionMeta[]> {
  const rows = await dataOf(token, 'GET', '/api/collections:list?pageSize=500') as Array<Record<string, any>> | null
  if (rows === null) throw new Error('collections:list returned no data')
  return rows.map(row => ({ name: String(row.name ?? ''), titleField: row.titleField ?? null }))
}

async function loadSnapshot(token: string): Promise<LiveSnapshot> {
  const [routes, models, fields, collections] = await Promise.all([
    listRoutes(token, 'w4-heal-b1'), listFlowModels(token, 'w4-heal-b1'), fetchFields(token), fetchCollections(token),
  ])
  const fieldsByCollection = new Map<string, FieldMeta[]>()
  for (const field of fields) {
    if (!fieldsByCollection.has(field.collectionName)) fieldsByCollection.set(field.collectionName, [])
    fieldsByCollection.get(field.collectionName)!.push(field)
  }
  return { routes, models, fieldsByCollection, collections: new Map(collections.map(c => [c.name, c])) }
}

type PageTree = {
  routeId: number
  title: string
  schemaUid: string
  chain: string
  grids: Array<{ uid: string, filterManager: unknown, tables: FlowModelRow[] }>
}

function buildPageTrees(snapshot: LiveSnapshot): PageTree[] {
  const byParent = new Map<string, FlowModelRow[]>()
  for (const row of snapshot.models) {
    const parent = String(row.parentId ?? '')
    if (parent === '') continue
    if (!byParent.has(parent)) byParent.set(parent, [])
    byParent.get(parent)!.push(row)
  }
  const children = (uid: string): FlowModelRow[] => byParent.get(uid) ?? []
  const routeById = new Map(snapshot.routes.map(route => [route.id, route]))
  const trees: PageTree[] = []
  for (const route of snapshot.routes) {
    if (route.type !== 'flowPage') continue
    const chain: string[] = []
    let cursor = route.parentId != null ? routeById.get(route.parentId) : undefined
    while (cursor && cursor.type === 'group') {
      chain.unshift(cursor.title ?? '')
      cursor = cursor.parentId != null ? routeById.get(cursor.parentId) : undefined
    }
    const grids: PageTree['grids'] = []
    for (const tab of snapshot.routes) {
      if (tab.type !== 'tabs' || tab.parentId !== route.id || tab.schemaUid == null) continue
      for (const grid of children(tab.schemaUid).filter(row => row.use === 'BlockGridModel')) {
        // page-level tables only: the subtree reachable inside this grid (popup
        // subtrees are rootless and out of B1 scope)
        const stack = [...children(grid.uid)]
        const seen = new Set<string>()
        const tables: FlowModelRow[] = []
        while (stack.length > 0) {
          const row = stack.shift()!
          if (seen.has(row.uid)) continue
          seen.add(row.uid)
          if (row.use === 'TableBlockModel') tables.push(row)
          stack.push(...children(row.uid))
        }
        grids.push({ uid: grid.uid, filterManager: grid.filterManager ?? [], tables: tables.sort((a, b) => (a.sortIndex ?? 0) - (b.sortIndex ?? 0)) })
      }
    }
    trees.push({ routeId: route.id, title: route.title ?? '', schemaUid: route.schemaUid ?? '', chain: chain.join('/'), grids })
  }
  return trees
}

// ─── spec derivation (pure; the domain table and column classifiers) ───

export const DOMAINS = ['procurement', 'manufacturing', 'salesPlanning', 'warehousing', 'quality', 'supplyChain', 'crm', 'hub'] as const
export type Domain = typeof DOMAINS[number]

const DOMAIN_MATCHERS: Record<Domain, RegExp> = {
  procurement: /^(pur_|hub_po_)/,
  manufacturing: /^mfg_/,
  salesPlanning: /^(so_|mps_|mrp_)/,
  warehousing: /^(wms_|hub_inv_)/,
  quality: /^qm_/,
  supplyChain: /^srm_/,
  crm: /^crm_/,
  hub: /.*/, // hub 域兜底：人事/资产/工单/项目/基础数据/wfl/kpi/系统表
}

const MASTER_DATA = /(supplier|customer|contact|product|employee|department|warehouse|zone|bin|lot|bom|work_center|categor|vendor|material|expert|lead|article|faq|asset|milestone|project)/
const CONFIG_DATA = /^(wfl_flow_configs|wfl_flow_states|wfl_flow_transitions|wfl_gate_configs|qm_aql_plans|hub_hd_sla_policies|hub_md_\w+categories)$/
const DOC_DATE_PRIORITY = ['doc_date', 'order_date', 'biz_date', 'request_date', 'created_at', 'updated_at', 'scheduled_date', 'due_date', 'completed_date', 'id']

function deriveSort(collection: string, fields: FieldMeta[]): string[] {
  const names = new Set(fields.map(field => field.name))
  if (CONFIG_DATA.test(collection) || collection.endsWith('_categories')) return ['id']
  if (MASTER_DATA.test(collection)) {
    if (names.has('code')) return ['code']
    if (names.has('name')) return ['name']
    if (names.has('title')) return ['title']
    return ['id']
  }
  for (const candidate of DOC_DATE_PRIORITY) {
    if (names.has(candidate)) return [`-${candidate}`]
  }
  return ['-id']
}

const MONEY_FIELD = /(amount|price|total|value|cost|fee|budget|balance|payable|receivable|qty_amount)/
const QTY_FIELD = /(qty|quantity|count|headcount|stock_qty|plan_qty|output)/

export function numberKindFor(fieldPath: string): 'money' | 'qty' | 'plain' {
  if (MONEY_FIELD.test(fieldPath)) return 'money'
  if (QTY_FIELD.test(fieldPath)) return 'qty'
  return 'plain'
}

function isRelational(field: FieldMeta | undefined): boolean {
  if (field === undefined) return false
  return (field.target ?? '') !== '' || /^(m2o|o2o|m2m|o2m)/.test(field.interface ?? '')
}

function titleFieldFor(target: string, snapshot: LiveSnapshot): string | null {
  const declared = snapshot.collections.get(target)?.titleField
  if (declared && declared !== 'id') return declared
  const names = new Set((snapshot.fieldsByCollection.get(target) ?? []).map(field => field.name))
  for (const candidate of ['name', 'title', 'code', 'label', 'nickname', 'username', 'lot_no', 'receipt_no', 'shipment_no', 'transfer_no', 'count_no', 'doc_no']) {
    if (names.has(candidate)) return candidate
  }
  return null
}

/** Filter fields by page class (T-1' L1 four-piece / L2 search+status / L3 status+date), trimmed to what the collection actually has. */
function deriveFilterFields(collection: string, fields: FieldMeta[], snapshot?: LiveSnapshot): Array<{ fieldPath: string, popupTarget?: { collection: string, fields: string[] } }> {
  const byName = new Map(fields.map(field => [field.name, field]))
  const pick = (predicate: (field: FieldMeta) => boolean): FieldMeta | undefined =>
    fields.find(predicate)
  const out: Array<{ fieldPath: string }> = []
  const status = pick(field => field.name === 'status' || field.name === 'doc_status' || field.name === 'invoice_status')
  if (status && (status.interface === 'select' || status.interface === 'radioGroup')) out.push({ fieldPath: status.name })
if (MASTER_DATA.test(collection)) {
  const search = pick(field => ['name', 'code', 'title'].includes(field.name) && (field.interface ?? '').startsWith('input'))
  if (search) out.push({ fieldPath: search.name, operator: '$includes' })
  if (out.length === 0) fallBack(pick, fields, out)
  return out.slice(0, 3)
}
const date = pick(field => ['doc_date', 'order_date', 'biz_date', 'created_at'].includes(field.name) && (field.interface ?? '').startsWith('date'))
if (date) out.push({ fieldPath: date.name })
const party = pick(field => /(supplier|customer|vendor|employee|department|project|product)$/.test(field.name) && isRelational(field))
if (party && party.target) {
  // the popup's fieldGroups must cover every generated popup field — the
  // server rejects partial lists ("does not cover required generated popup
  // fields"), so all plain non-relational fields are listed, ungrouped
  const targetFields = (snapshot?.fieldsByCollection.get(party.target) ?? [])
    .filter(entry => entry.name !== 'id' && !entry.name.endsWith('_id') && !isRelational(entry)
      && ['input', 'textarea', 'select', 'date', 'datetime', 'number', 'integer', 'radioGroup'].includes(entry.interface ?? ''))
    .map(entry => entry.name)
  out.push({ fieldPath: party.name, popupTarget: targetFields.length > 0 ? { collection: party.target, fields: targetFields } : undefined })
}
const type = pick(field => ['type', 'doc_type', 'kind', 'category', 'plan_type', 'board'].includes(field.name) && field.interface === 'select')
if (type) out.push({ fieldPath: type.name })
if (out.length === 0) fallBack(pick, fields, out)
return out.slice(0, 4)
}

/** Snapshot/config collections with no status/date/party: first select, then a searchable input, then any date. */
function fallBack(pick: (predicate: (field: FieldMeta) => boolean) => FieldMeta | undefined, fields: FieldMeta[], out: Array<{ fieldPath: string }>): void {
const select = pick(field => field.interface === 'select')
if (select) { out.push({ fieldPath: select.name }); return }
const input = pick(field => (field.interface ?? '').startsWith('input') && !['id'].includes(field.name))
if (input) { out.push({ fieldPath: input.name, operator: '$includes' }); return }
const date = pick(field => (field.interface ?? '').startsWith('date'))
if (date) out.push({ fieldPath: date.name })
}

type ColumnSpec = {
  columnUid: string
  fieldUid: string
  /** every field subnode uid under the column (a swap clears stacked duplicates) */
  fieldUids: string[]
  fieldPath: string
  action:
    | { kind: 'number', props: Record<string, unknown> }
    | { kind: 'date', props: Record<string, unknown> }
    | { kind: 'rel', targetCollection: string, titleField: string }
    | { kind: 'enumize', options: StatusColumnOption[] }
    | { kind: 'recolor', options: StatusColumnOption[] }
}

type TableSpec = {
  tableUid: string
  gridUid: string
  collection: string
  sort: string[]
  sortColumnUid: string | null
  /** any of the three sort homes is missing → rewrite all three */
  sortPending: boolean
  columns: ColumnSpec[]
}

type PageSpec = {
  page: PageTree
  domain: Domain
  tables: TableSpec[]
  filter: { gridUid: string, tableUid: string, collection: string, fields: Array<{ fieldPath: string, popupTarget?: { collection: string, fields: string[] } }> } | null
}

function pageCollection(page: PageTree): string | null {
  for (const grid of page.grids) {
    for (const table of grid.tables) {
      const collection = table?.stepParams?.resourceSettings?.init?.collectionName
      if (typeof collection === 'string') return collection
    }
  }
  return null
}

function deriveTablesInto(snapshot: LiveSnapshot, page: PageTree, domain: Domain): PageSpec {
  const byUid = new Map(snapshot.models.map(row => [row.uid, row]))
  const childrenOf = (uid: string): FlowModelRow[] => snapshot.models.filter(row => String(row.parentId ?? '') === uid)
  const tableSpecs: TableSpec[] = []
  let filter: PageSpec['filter'] = null
  for (const grid of page.grids) {
    if (grid.tables.length === 0) continue
    const hasFilterForm = snapshot.models.some(row =>
      String(row.parentId ?? '') === grid.uid && row.use === 'FilterFormBlockModel')
    for (const table of grid.tables) {
      const collection = table?.stepParams?.resourceSettings?.init?.collectionName
      if (typeof collection !== 'string' || collection === '') { notes_count.skippedTables++; continue }
      const fields = snapshot.fieldsByCollection.get(collection) ?? []
      const columns: ColumnSpec[] = []
      const columnRows = childrenOf(table.uid)
        .filter(child => child.subKey === 'columns' && child.use === 'TableColumnModel')
        .sort((a, b) => (a.sortIndex ?? 0) - (b.sortIndex ?? 0))
      for (const column of columnRows) {
        const fieldPath = String(column?.stepParams?.fieldSettings?.init?.fieldPath ?? '')
        if (fieldPath === '') continue
        const field = fields.find(entry => entry.name === fieldPath)
        // all field subnodes: a swap must clear stacked duplicates too
        const childFields = childrenOf(column.uid).filter(entry => entry.subKey === 'field')
        if (childFields.length === 0) continue
        const childField = childFields[0]
        const fieldUid = String(childField.uid)
        const fieldUids = childFields.map(entry => String(entry.uid))
        const childUse = String(childField.use ?? '')
        const childProps = (childField.props ?? {}) as Record<string, unknown>
        if (childUse === 'DisplayNumberFieldModel') {
          // identifiers stay bare: a thousand-grouped id column is wrong semantics
          if (fieldPath === 'id' || /_id$/.test(fieldPath) || field?.interface === 'id') continue
          const kind = numberKindFor(fieldPath)
          const props = numberColumnProps(kind)
          const done = kind === 'money'
            ? childProps.separator === props.separator && childProps.addonBefore === '¥'
            : childProps.separator === props.separator
          if (!done) columns.push({ columnUid: column.uid, fieldUid, fieldUids, fieldPath, action: { kind: 'number', props } })
        } else if (childUse === 'DisplayDateTimeFieldModel') {
          const kind: 'date' | 'datetime' = (field?.interface ?? 'date') === 'datetime' ? 'datetime' : 'date'
          const props = dateColumnProps(kind)
          if (childProps.format !== props.format) columns.push({ columnUid: column.uid, fieldUid, fieldUids, fieldPath, action: { kind: 'date', props } })
        } else if (isRelational(field) && childUse !== 'DisplayTitleFieldModel') {
          const target = field?.target ?? ''
          const titleField = titleFieldFor(target, snapshot)
          if (target !== '' && titleField !== null) {
            columns.push({ columnUid: column.uid, fieldUid, fieldUids, fieldPath, action: { kind: 'rel', targetCollection: target, titleField } })
          } else {
            notes_count.noTitleField.push(`${collection}.${fieldPath}`)
          }
        } else if (childUse === 'DisplayTextFieldModel' && field?.interface === 'select') {
          const options = optionsForEnum(field.enumEntries)
          if (options.length > 0) columns.push({ columnUid: column.uid, fieldUid, fieldUids, fieldPath, action: { kind: 'enumize', options } })
        } else if (childUse === 'DisplayEnumFieldModel') {
          const current = Array.isArray(childProps.options) ? childProps.options as Array<Record<string, unknown>> : []
          const merged = optionsForEnum(field?.enumEntries?.length ? field.enumEntries : current.map(entry => ({ value: entry.value, label: entry.label, color: entry.color })))
          const missingColor = merged.length === 0 || merged.some(option => option.color === '') || current.length !== merged.length
            || merged.some((option, index) => current[index]?.label !== option.label)
          if (missingColor && merged.length > 0) columns.push({ columnUid: column.uid, fieldUid, fieldUids, fieldPath, action: { kind: 'recolor', options: merged } })
        }
      }
      const sort = deriveSort(collection, fields)
      const sortField = (sort[0] ?? '').replace(/^-/, '')
      const sortColumn = sortField === 'id'
        ? undefined
        : columnRows.find(column => String(column?.stepParams?.fieldSettings?.init?.fieldPath ?? '') === sortField)
      const sortColumnUid = sortColumn === undefined ? null : String(sortColumn.uid)
      const sortDone = JSON.stringify((table.props ?? {}).globalSort ?? null) === JSON.stringify(sort)
        && JSON.stringify(table?.stepParams?.resourceSettings?.init?.params?.sort ?? null) === JSON.stringify(sort)
        && (sortColumnUid === null
          || ((sortColumn?.props ?? {}).sorter === true && ((sortColumn?.props ?? {}).defaultSortOrder ?? '') !== ''))
      if (!sortDone || columns.length > 0) {
        tableSpecs.push({ tableUid: table.uid, gridUid: grid.uid, collection, sort, sortColumnUid, sortPending: !sortDone, columns })
      }
      notes_count.tables++
    }
    // table-level gap: one FilterForm per grid, bound to the first table that
    // has neither a FilterActionModel nor a live filterManager connection
    // (计划工作台 shares a grid: intents table filters, suggestions does not)
    if (!hasFilterForm && filter === null && grid.tables.length > 0) {
      const connected = new Set((Array.isArray(grid.filterManager) ? grid.filterManager as Array<Record<string, unknown>> : [])
        .map(config => String(config.targetId ?? '')))
      const table = grid.tables.find(candidate =>
        !childrenOf(candidate.uid).some(child => child.use === 'FilterActionModel') && !connected.has(candidate.uid))
      if (table !== undefined) {
        const collection = table?.stepParams?.resourceSettings?.init?.collectionName
        if (typeof collection === 'string' && collection !== '') {
          const fields = deriveFilterFields(collection, snapshot.fieldsByCollection.get(collection) ?? [], snapshot)
          if (fields.length > 0) filter = { gridUid: grid.uid, tableUid: table.uid, collection, fields }
        }
      }
    }
  }
  return { page, domain, tables: tableSpecs, filter }
}

const notes_count = { tables: 0, skippedTables: 0, noTitleField: [] as string[] }

// ─── rollback journal ───

type RollbackEntry =
  | { kind: 'tableSort', tableUid: string, before: { props: Record<string, unknown>, stepParams: Record<string, unknown> } }
  | { kind: 'fieldProps', fieldUid: string, before: Record<string, unknown>, writtenKeys?: string[] }
  | { kind: 'columnStepParams', columnUid: string, before: Record<string, unknown> }
  | { kind: 'columnFieldSwap', columnUid: string, removedField: { uid: string, use: string, props: Record<string, unknown>, stepParams: Record<string, unknown> }, extraRemovedUids?: string[], newFieldUid: string }
  | { kind: 'filterForm', gridUid: string, filterFormUid: string }

function loadJournal(): RollbackEntry[] {
  try {
    return JSON.parse(readFileSync(ROLLBACK_PATH, 'utf8')) as RollbackEntry[]
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []
    throw error
  }
}

function appendJournal(entries: RollbackEntry[]): void {
  if (entries.length === 0) return
  const journal = loadJournal()
  journal.push(...entries)
  writeFileSync(ROLLBACK_PATH, `${JSON.stringify(journal, null, 2)}\n`)
}

// ─── heal execution ───

async function healPage(token: string, snapshot: LiveSnapshot, spec: PageSpec, dryRun: boolean): Promise<string[]> {
  const log: string[] = []
  const tag = `${spec.page.chain}/${spec.page.title}`
  for (const table of spec.tables) {
    const journal: RollbackEntry[] = []
    if (table.sortPending) {
      log.push(`  sort ${table.collection} <- ${JSON.stringify(table.sort)}`)
      if (!dryRun) {
        const tableRowBefore = snapshot.models.find(row => row.uid === table.tableUid)
        journal.push({
          kind: 'tableSort', tableUid: table.tableUid,
          before: {
            props: JSON.parse(JSON.stringify(tableRowBefore?.props ?? {})),
            stepParams: JSON.parse(JSON.stringify(tableRowBefore?.stepParams ?? {})),
          },
        })
        journal.push({ kind: 'columnStepParams', columnUid: table.sortColumnUid ?? '', before: (snapshot.models.find(row => row.uid === table.sortColumnUid)?.stepParams ?? {}) as Record<string, unknown> })
        const sortColumnRow = snapshot.models.find(row => row.uid === table.sortColumnUid)
        if (table.sortColumnUid !== null && sortColumnRow !== undefined) {
          journal.push({ kind: 'fieldProps', fieldUid: table.sortColumnUid, before: (sortColumnRow.props ?? {}) as Record<string, unknown>, writtenKeys: ['sorter', 'defaultSortOrder'] })
        }
        await applyTableDefaultSort(token, table.tableUid, table.sort, table.sortColumnUid)
      }
    }
    for (const column of table.columns) {
      const fieldRow = snapshot.models.find(row => row.uid === column.fieldUid)
      if (dryRun) {
        log.push(`  ${column.action.kind} ${table.collection}.${column.fieldPath}`)
        continue
      }
      if (column.action.kind === 'number' || column.action.kind === 'date') {
        journal.push({ kind: 'fieldProps', fieldUid: column.fieldUid, before: (fieldRow?.props ?? {}) as Record<string, unknown>, writtenKeys: Object.keys(column.action.props) })
        await applyColumnDisplayProps(token, column.fieldUid, column.action.props)
      } else if (column.action.kind === 'rel') {
        journal.push({
          kind: 'columnFieldSwap', columnUid: column.columnUid,
          removedField: {
            uid: column.fieldUid, use: String(fieldRow?.use ?? ''),
            props: (fieldRow?.props ?? {}) as Record<string, unknown>,
            stepParams: (fieldRow?.stepParams ?? {}) as Record<string, unknown>,
          },
          extraRemovedUids: column.fieldUids.filter(uid => uid !== column.fieldUid),
          newFieldUid: '',
        })
        const columnRow = snapshot.models.find(row => row.uid === column.columnUid)
        journal.push({ kind: 'columnStepParams', columnUid: column.columnUid, before: (columnRow?.stepParams ?? {}) as Record<string, unknown> })
        const newUid = await rebindColumnTitleField(token, column.columnUid, column.fieldUids, column.action)
        const swap = journal.find(entry => entry.kind === 'columnFieldSwap' && entry.columnUid === column.columnUid)
        if (swap && swap.kind === 'columnFieldSwap') swap.newFieldUid = newUid
        log.push(`  rel ${table.collection}.${column.fieldPath} -> ${column.action.targetCollection}.${column.action.titleField}`)
      } else if (column.action.kind === 'enumize') {
        journal.push({
          kind: 'columnFieldSwap', columnUid: column.columnUid,
          removedField: {
            uid: column.fieldUid, use: String(fieldRow?.use ?? ''),
            props: (fieldRow?.props ?? {}) as Record<string, unknown>,
            stepParams: (fieldRow?.stepParams ?? {}) as Record<string, unknown>,
          },
          extraRemovedUids: column.fieldUids.filter(uid => uid !== column.fieldUid),
          newFieldUid: '',
        })
        const columnRow = snapshot.models.find(row => row.uid === column.columnUid)
        journal.push({ kind: 'columnStepParams', columnUid: column.columnUid, before: (columnRow?.stepParams ?? {}) as Record<string, unknown> })
        const newUid = await enumizeColumn(token, column.columnUid, column.fieldUids, column.action.options, { collection: table.collection, fieldPath: column.fieldPath })
        const swap = journal.find(entry => entry.kind === 'columnFieldSwap' && entry.columnUid === column.columnUid)
        if (swap && swap.kind === 'columnFieldSwap') swap.newFieldUid = newUid
        log.push(`  enumize ${table.collection}.${column.fieldPath} (${column.action.options.length} options)`)
      } else {
        journal.push({ kind: 'fieldProps', fieldUid: column.fieldUid, before: (fieldRow?.props ?? {}) as Record<string, unknown>, writtenKeys: ['options'] })
        await applyColumnDisplayProps(token, column.fieldUid, { options: column.action.options })
        log.push(`  recolor ${table.collection}.${column.fieldPath}`)
      }
    }
    appendJournal(journal)
  }
  if (spec.filter !== null) {
    if (dryRun) {
      log.push(`  filterForm ${spec.filter.collection} fields=[${spec.filter.fields.map(field => field.fieldPath).join(',')}]`)
    } else {
      const filterFormUid = await ensureFilterForm(token, spec.filter)
      appendJournal([{ kind: 'filterForm', gridUid: spec.filter.gridUid, filterFormUid }])
      log.push(`  filterForm ${spec.filter.collection} uid=${filterFormUid} fields=[${spec.filter.fields.map(field => field.fieldPath).join(',')}]`)
    }
  }
  if (log.length > 0) log.unshift(`page ${tag}`)
  return log
}

async function rollback(token: string, snapshot: LiveSnapshot, pages: PageSpec[]): Promise<string[]> {
  const log: string[] = []
  const journal = loadJournal()
  const pageTables = new Set(pages.flatMap(spec => spec.tables.map(table => table.tableUid)))
  const pageGrids = new Set(pages.flatMap(spec => [spec.filter?.gridUid ?? '', ...spec.tables.map(table => table.gridUid)].filter(uid => uid !== '')))
  const undone: RollbackEntry[] = []
  for (let index = journal.length - 1; index >= 0; index--) {
    const entry = journal[index]
    if (entry.kind === 'tableSort') {
      if (!pageTables.has(entry.tableUid)) { undone.push(entry); continue }
      // flowModels:save merges, so heal-added keys (globalSort, init.params.sort)
      // must be cleared explicitly when the before-snapshot lacks them
      const before = entry.before
      const current = await dataOf(token, 'GET', `/api/flowSurfaces:get?uid=${encodeURIComponent(entry.tableUid)}`)
      const row = current?.tree ?? {}
      await dataOf(token, 'POST', '/api/flowModels:save', {
        uid: entry.tableUid,
        ...(row.parentId === undefined ? {} : { parentId: row.parentId }),
        ...(row.subKey === undefined ? {} : { subKey: row.subKey }),
        props: { ...before.props, globalSort: before.props.globalSort ?? null },
        stepParams: before.stepParams,
      })
      log.push(`rollback sort ${entry.tableUid} -> ${JSON.stringify(before.props.globalSort ?? null)}`)
    } else if (entry.kind === 'fieldProps') {
      const ownerColumn = snapshot.models.find(row => row.uid === entry.fieldUid)
      if (ownerColumn === undefined) { undone.push(entry); continue } // node itself was swapped away; the swap entry restores it
      // domain filter: walk up to the owning table; entries outside the
      // requested selection stay in the journal (every kind scopes like tableSort)
      let cursor: FlowModelRow | undefined = ownerColumn
      let inScope = false
      for (let hop = 0; cursor !== undefined && hop < 4; hop++) {
        if (pageTables.has(String(cursor.uid))) { inScope = true; break }
        cursor = snapshot.models.find(row => row.uid === String(cursor.parentId ?? ''))
      }
      if (!inScope) { undone.push(entry); continue }
      // clearing with null crashes enum renderers (destructure defaults do not
      // absorb null), so array-valued keys clear to [] instead
      const cleared = Object.fromEntries((entry.writtenKeys ?? []).filter(key => !(key in entry.before)).map(key => [key, key === 'options' ? [] : null]))
      await dataOf(token, 'POST', '/api/flowModels:save', {
        uid: entry.fieldUid, parentId: ownerColumn.parentId, subKey: ownerColumn.subKey,
        props: { ...entry.before, ...cleared },
      })
      log.push(`rollback props ${entry.fieldUid}`)
    } else if (entry.kind === 'columnStepParams') {
      const columnRow = snapshot.models.find(row => row.uid === entry.columnUid)
      if (columnRow === undefined) { undone.push(entry); continue }
      const columnTable = snapshot.models.find(row => row.uid === String(columnRow.parentId ?? ''))
      if (columnTable === undefined || !pageTables.has(columnTable.uid)) { undone.push(entry); continue }
      await dataOf(token, 'POST', '/api/flowModels:save', {
        uid: entry.columnUid, parentId: columnRow.parentId, subKey: columnRow.subKey,
        stepParams: entry.before,
      })
      log.push(`rollback column stepParams ${entry.columnUid}`)
    } else if (entry.kind === 'columnFieldSwap') {
      const swapTable = snapshot.models.find(row => row.uid === entry.columnUid)
      const swapOwnerTable = swapTable === undefined ? undefined : snapshot.models.find(row => row.uid === String(swapTable.parentId ?? ''))
      if (swapOwnerTable === undefined || !pageTables.has(swapOwnerTable.uid)) { undone.push(entry); continue }
      if (entry.newFieldUid !== '') {
        await call(token, 'POST', `/api/flowModels:destroy?filterByTk=${encodeURIComponent(entry.newFieldUid)}`)
      }
      await dataOf(token, 'POST', '/api/flowModels:save', {
        uid: entry.removedField.uid, parentId: entry.columnUid, subKey: 'field', subType: 'object', sortIndex: 0,
        use: entry.removedField.use, props: entry.removedField.props, stepParams: entry.removedField.stepParams,
      })
      log.push(`rollback column field ${entry.columnUid} -> ${entry.removedField.use}`)
    } else if (entry.kind === 'filterForm') {
      if (!pageGrids.has(entry.gridUid)) { undone.push(entry); continue }
      await call(token, 'POST', `/api/flowModels:destroy?filterByTk=${encodeURIComponent(entry.filterFormUid)}`)
      const grid = snapshot.models.find(row => row.uid === entry.gridUid)
      const stale = Array.isArray(grid?.filterManager) ? (grid!.filterManager as Array<Record<string, unknown>>) : []
      if (stale.some(config => String(config.filterId ?? '') === entry.filterFormUid)) {
        await dataOf(token, 'POST', '/api/flowModels:save', {
          uid: entry.gridUid, filterManager: stale.filter(config => String(config.filterId ?? '') !== entry.filterFormUid),
        })
      }
      log.push(`rollback filterForm ${entry.filterFormUid}`)
    }
  }
  writeFileSync(ROLLBACK_PATH, `${JSON.stringify(undone, null, 2)}\n`)
  return log
}

// ─── five-defect assert (the upgraded probe semantics, live) ───

async function assertZeroDefects(token: string): Promise<void> {
  const snapshot = await loadSnapshot(token)
  const trees = buildPageTrees(snapshot)
  const failures: string[] = []
  let pagesWithTable = 0, pagesNoSort = 0, filterFormBlocks = 0, pagesNoFilter = 0
  let moneyCols = 0, moneyNoFmt = 0, dateCols = 0, dateNoFmt = 0, relCols = 0, relNoTitle = 0, statusBareText = 0, statusNoColor = 0
  const byParent = new Map<string, FlowModelRow[]>()
  for (const row of snapshot.models) {
    const parent = String(row.parentId ?? '')
    if (parent === '') continue
    if (!byParent.has(parent)) byParent.set(parent, [])
    byParent.get(parent)!.push(row)
  }
  const childrenOf = (uid: string): FlowModelRow[] => byParent.get(uid) ?? []
  for (const page of trees) {
    const tables = page.grids.flatMap(grid => grid.tables)
    if (tables.length === 0) continue
    pagesWithTable++
    let pageHasAnyFilter = false
    let pageAllNoSort = true
    for (const grid of page.grids) {
      const filterFormHere = childrenOf(grid.uid).filter(child => child.use === 'FilterFormBlockModel')
      filterFormBlocks += filterFormHere.length
      const connected = new Set((Array.isArray(grid.filterManager) ? grid.filterManager as Array<Record<string, unknown>> : [])
        .map(config => String(config.targetId ?? '')))
      for (const table of grid.tables) {
        const props = (table.props ?? {}) as Record<string, unknown>
        const sort = props.globalSort ?? props.params ?? null
        const initParams = table?.stepParams?.resourceSettings?.init?.params
        const hasSort = (Array.isArray(sort) && sort.length > 0) || (initParams != null && initParams.sort != null)
          || (sort != null && !Array.isArray(sort) && (sort as Record<string, unknown>).sort != null)
        if (hasSort) pageAllNoSort = false
        if (childrenOf(table.uid).some(child => child.use === 'FilterActionModel') || connected.has(table.uid)) pageHasAnyFilter = true
        const collection = String(table?.stepParams?.resourceSettings?.init?.collectionName ?? '')
        const fields = snapshot.fieldsByCollection.get(collection) ?? []
        const relNames = new Set(fields.filter(field => isRelational(field)).map(field => field.name))
        for (const column of childrenOf(table.uid).filter(child => child.subKey === 'columns' && child.use === 'TableColumnModel')) {
          const fieldPath = String(column?.stepParams?.fieldSettings?.init?.fieldPath ?? '')
          const field = fields.find(entry => entry.name === fieldPath)
          const childField = childrenOf(column.uid).find(entry => entry.subKey === 'field')
          if (childField === undefined) continue
          const childProps = (childField.props ?? {}) as Record<string, unknown>
          const childUse = String(childField.use ?? '')
          if (childUse === 'DisplayNumberFieldModel') {
            // identifier columns stay bare by design (a grouped id is wrong semantics)
            if (fieldPath === 'id' || /_id$/.test(fieldPath) || field?.interface === 'id') continue
            moneyCols++
            if (childProps.separator == null && childProps.numberStep == null && childProps.numberFormat == null && childProps.precision == null) moneyNoFmt++
          } else if (childUse === 'DisplayDateTimeFieldModel') {
            dateCols++
            if (childProps.format == null && childProps.dateFormat == null) dateNoFmt++
          }
          if (relNames.has(fieldPath)) {
            relCols++
            const bound = childProps.titleField != null || childProps.fieldNames != null
              || (column?.stepParams?.tableColumnSettings?.fieldNames?.label ?? null) != null
            if (childUse !== 'DisplayTitleFieldModel' || !bound) relNoTitle++
          }
          if (childUse === 'DisplayTextFieldModel' && field?.interface === 'select') statusBareText++
          if (childUse === 'DisplayEnumFieldModel') {
            const options = Array.isArray(childProps.options) ? childProps.options as Array<Record<string, unknown>> : []
            if (options.length === 0 || options.some(option => option.color == null)) statusNoColor++
          }
        }
      }
    }
    if (pageAllNoSort) pagesNoSort++
    if (!pageHasAnyFilter) pagesNoFilter++
  }
  const report = [
    `pagesWithTable=${pagesWithTable}`, `pagesNoSort=${pagesNoSort}`, `filterFormBlocks=${filterFormBlocks}`, `pagesNoFilter=${pagesNoFilter}`,
    `moneyNoFmt=${moneyNoFmt}/${moneyCols}`, `dateNoFmt=${dateNoFmt}/${dateCols}`, `relNoTitle=${relNoTitle}/${relCols}`,
    `statusBareText=${statusBareText}`, `statusNoColor=${statusNoColor}`,
  ]
  console.log(`w4-b1 assert: ${report.join(' ')}`)
  if (pagesNoSort !== 0) failures.push(`默认排序未全覆盖: ${pagesNoSort} 页无排序`)
  // 36 = 37 − 1: W4-B4 retired 采购联系人（历史） (its page-level FilterForm
  // went with the cascade); the remaining 36 stay as the floor.
  if (filterFormBlocks < 36) failures.push(`FilterForm 覆盖不足: ${filterFormBlocks} < 36`)
  if (pagesNoFilter !== 0) failures.push(`仍有 ${pagesNoFilter} 页无任何筛选`)
  if (moneyNoFmt !== 0) failures.push(`金额/数字列未格式化: ${moneyNoFmt}/${moneyCols}`)
  if (dateNoFmt !== 0) failures.push(`日期列未格式化: ${dateNoFmt}/${dateCols}`)
  if (relNoTitle !== 0) failures.push(`关联列未绑 titleField: ${relNoTitle}/${relCols}`)
  if (statusBareText !== 0) failures.push(`状态列裸文本: ${statusBareText}`)
  if (statusNoColor !== 0) failures.push(`状态列缺色板: ${statusNoColor}`)
  if (failures.length > 0) {
    console.error(`w4-b1 assert: FAILED\n  - ${failures.join('\n  - ')}`)
    process.exitCode = 1
  } else {
    console.log('w4-b1 assert: OK — 五类缺陷计数全部归零')
  }
}

// ─── CLI ───

function selectPages(trees: PageTree[], mode: { pilot?: boolean, domain?: Domain, all?: boolean }): PageTree[] {
  if (mode.pilot === true) {
    return trees.filter(page => (page.schemaUid.startsWith('w3pur') && page.title.includes('采购订单'))
      || page.schemaUid.startsWith('n17e11'))
  }
  if (mode.domain !== undefined) {
    return trees.filter(page => {
      const collection = pageCollection(page) ?? ''
      return DOMAIN_MATCHERS[mode.domain!].test(collection)
    })
  }
  return trees
}

async function main(): Promise<void> {
  const args = process.argv.slice(2)
  const dryRun = args.includes('--dry-run')
  const pilot = args.includes('--pilot')
  const all = args.includes('--all')
  const doRollback = args.includes('--rollback')
  const doAssert = args.includes('--assert')
  const domainIndex = args.indexOf('--domain')
  const domain = domainIndex >= 0 ? args[domainIndex + 1] as Domain : undefined
  if (args.length === 0 || (!dryRun && !pilot && !all && domain === undefined && !doRollback && !doAssert)) {
    console.error('usage: w4-heal-b1.mts --dry-run|--pilot|--domain <name>|--all [--rollback] [--assert]')
    process.exitCode = 2
    return
  }
  const token = await signInWithRetry()
  if (doAssert) {
    await assertZeroDefects(token)
    return
  }
  const snapshot = await loadSnapshot(token)
  const trees = buildPageTrees(snapshot).filter(page => page.grids.some(grid => grid.tables.length > 0))
  const selected = selectPages(trees, { pilot, domain, all })
  if (!all && !dryRun && !doRollback && selected.length === 0) {
    console.error('no pages selected; check --pilot / --domain / collection matching')
    process.exitCode = 2
    return
  }
  const specs = selected.map(page => deriveTablesInto(snapshot, page, DOMAINS.find(candidate => DOMAIN_MATCHERS[candidate].test(pageCollection(page) ?? '')) ?? 'hub'))
  const targetLabel = pilot ? 'pilot' : domain ?? (all ? 'all' : 'selection')
  if (doRollback) {
    const log = await rollback(token, snapshot, specs)
    console.log(log.length > 0 ? log.join('\n') : 'nothing to roll back for this selection')
    return
  }
  if (dryRun) {
    const lines: string[] = []
    let sortCount = 0, moneyCount = 0, dateCount = 0, relCount = 0, enumCount = 0, recolorCount = 0, filterCount = 0
    for (const spec of specs) {
      const log = await healPage(token, snapshot, spec, true)
      if (log.length === 0) continue
      lines.push(...log)
      for (const table of spec.tables) {
        sortCount += table.sortPending ? 1 : 0
        for (const column of table.columns) {
          if (column.action.kind === 'number' && numberKindFor(column.fieldPath) === 'money') moneyCount++
          else if (column.action.kind === 'number') moneyCount++
          else if (column.action.kind === 'date') dateCount++
          else if (column.action.kind === 'rel') relCount++
          else if (column.action.kind === 'enumize') enumCount++
          else recolorCount++
        }
      }
      filterCount += spec.filter !== null ? 1 : 0
    }
    const summary = `dry-run ${targetLabel}: pages=${specs.length} sort=${sortCount} number=${moneyCount} date=${dateCount} rel=${relCount} enumize=${enumCount} recolor=${recolorCount} filterForm=${filterCount}`
    lines.push(summary)
    const out = lines.join('\n')
    console.log(out)
    if (pilot || all) writeFileSync(`${RESEARCH_DIR}w4-b1-heal-dryrun-${targetLabel}.txt`, `${out}\n`)
    return
  }
  const runLog: string[] = [`# w4-b1 heal run ${targetLabel} @ ${new Date().toISOString()}`]
  for (const spec of specs) {
    const log = await healPage(token, snapshot, spec, false)
    if (log.length > 0) runLog.push(...log)
  }
  runLog.push(`pages=${specs.length}`)
  const out = runLog.join('\n')
  console.log(out)
  writeFileSync(`${RESEARCH_DIR}w4-b1-heal-run-${targetLabel}.txt`, `${out}\n`)
}

void main().catch(error => {
  console.error(error)
  process.exit(1)
})
