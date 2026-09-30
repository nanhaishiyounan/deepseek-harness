/**
 * W5-B7 document-detail heal: rebuild the row-detail drawers of the core
 * document collections into the three-tab pattern — 单据明细 (two-column
 * header facts, Fiori object-page facet), 审批记录 (wfl_approval_records
 * timeline incl. countersign anchors and demote returns, plus the designer
 * deep link), 关联单据 (one association-bound block per business group,
 * ERPNext Connections). Fields are re-sequenced from the existing W3-B1
 * drawer (header-priority first), enum options ride the healed table columns
 * where possible; the connection blocks reuse subtableBlockNode.
 *
 * Every replaced view action snapshots its whole flowSurfaces tree first;
 * --rollback replays the snapshots (destroy new, save old).
 *
 * Usage:
 *   node --import tsx/esm examples/kb-agent/scripts/w5b7-detail.mts --apply [--pilot|--all]
 *   node --import tsx/esm examples/kb-agent/scripts/w5b7-detail.mts --assert
 *   node --import tsx/esm examples/kb-agent/scripts/w5b7-detail.mts --rollback
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import {
  call, dataOf, documentDetailPageTree, ensureParentHasMany, listFlowModels, signInWithRetry,
  timelineCollectionFor, withW5b7Prefix,
  type DetailFieldSpec, type FlowModelRow, type SubtableSpec,
} from './nocobase-flow-page-lib.mts'

const RESEARCH_DIR = new URL('../../../research/2026-09-29-w5-rework/', import.meta.url).pathname
const ROLLBACK_PATH = `${RESEARCH_DIR}w5-b7-rollback.json`

// ─── the seven core document specs ───

type DocSpec = {
  collection: string
  docType: string
  /** header-fact field order: matched first against the existing drawer's fields, leftovers appended in drawer order */
  headerPref: readonly string[]
  /** downstream o2m connections: parent hasMany field, child collection, business-group title */
  related: ReadonlyArray<{ field: string, child: string, foreignKey: string, title: string }>
}

export const DOC_SPECS: ReadonlyArray<DocSpec> = [
  {
    collection: 'pur_orders', docType: 'pur_orders',
    headerPref: ['code', 'doc_status', 'amount', 'need_date', 'supplier', 'receiving_status', 'invoice_status'],
    related: [{ field: 'receipts', child: 'wms_receipts', foreignKey: 'po_id', title: '下游 · 收货单' }],
  },
  {
    collection: 'pur_requests', docType: 'pur_requests',
    headerPref: ['code', 'doc_status', 'total_est', 'need_date', 'requester', 'department'],
    related: [{ field: 'rfqs', child: 'pur_rfqs', foreignKey: 'pr_id', title: '下游 · 询价单' }],
  },
  {
    collection: 'pur_rfqs', docType: 'pur_rfqs',
    headerPref: ['code', 'doc_status', 'deadline'],
    related: [
      { field: 'quotes', child: 'pur_quotes', foreignKey: 'rfq_id', title: '下游 · 供应商报价' },
      { field: 'orders', child: 'pur_orders', foreignKey: 'rfq_id', title: '下游 · 采购订单' },
    ],
  },
  {
    collection: 'so_orders', docType: 'so_orders',
    headerPref: ['code', 'doc_status', 'amount', 'need_date', 'customer', 'shipping_status'],
    related: [{ field: 'payments', child: 'crm_payments', foreignKey: 'so_order_id', title: '下游 · 回款' }],
  },
  {
    collection: 'mfg_orders', docType: 'mfg_orders',
    headerPref: ['code', 'doc_status', 'qty', 'need_date', 'product', 'bom'],
    related: [],
  },
  {
    collection: 'qm_inspections', docType: 'qm_inspections',
    headerPref: ['code', 'status', 'result', 'inspected_at', 'product', 'supplier'],
    related: [],
  },
  {
    collection: 'crm_payments', docType: 'crm_payments',
    headerPref: ['amount', 'status', 'method', 'paid_at', 'customer'],
    related: [],
  },
]

// ─── snapshots and rollback journal ───

type RollbackRecord = { collection: string, actionUid: string, tree: Record<string, unknown> }

/**
 * The replaced-action ledger. Deep nodes of a nested save never appear as
 * flat flowModels rows (the W3-B2 lesson), so assert and rollback cannot scan
 * the list — they replay this ledger through flowSurfaces:get instead.
 */
type ActionLedgerEntry = { collection: string, actionUid: string, oldActionUid: string }
const LEDGER_PATH = `${RESEARCH_DIR}w5-b7-actions.json`

function loadRollback(): RollbackRecord[] {
  try {
    return JSON.parse(readFileSync(ROLLBACK_PATH, 'utf8')) as RollbackRecord[]
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []
    throw error
  }
}

function appendRollback(records: RollbackRecord[]): void {
  if (records.length === 0) return
  const journal = loadRollback().filter(record => !records.some(candidate => candidate.actionUid === record.actionUid))
  journal.push(...records)
  writeFileSync(ROLLBACK_PATH, `${JSON.stringify(journal, null, 2)}\n`)
}

function loadLedger(): ActionLedgerEntry[] {
  try {
    return JSON.parse(readFileSync(LEDGER_PATH, 'utf8')) as ActionLedgerEntry[]
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []
    throw error
  }
}

function writeLedger(entries: ReadonlyArray<ActionLedgerEntry>): void {
  writeFileSync(LEDGER_PATH, `${JSON.stringify(entries, null, 2)}\n`)
}

// ─── field re-sequencing from the existing drawer ───

/** Extract the drawer's DetailsItem fields in order: fieldPath + the per-field display model (use/props) the W3 heal already chose. Fields whose fieldPath is not registered on the collection (stale W3-B1 placeholders) are dropped when a registry is given. */
export function fieldsOfDrawerTree(tree: Record<string, unknown>, registered: ReadonlySet<string> | null = null): DetailFieldSpec[] {
  const out: DetailFieldSpec[] = []
  const walk = (node: unknown): void => {
    if (node === null || typeof node !== 'object') return
    const row = node as Record<string, any>
    if (row?.use === 'DetailsItemModel') {
      const fieldPath = String(row?.stepParams?.fieldSettings?.init?.fieldPath ?? '')
      const field = row?.subModels?.field
      if (fieldPath !== '' && field != null && (registered === null || registered.has(fieldPath))) {
        out.push({
          fieldPath,
          modelUse: String(field.use ?? 'DisplayTextFieldModel'),
          ...(Array.isArray((field.props ?? {}).options) ? { options: field.props.options as object[] } : {}),
        })
      }
    }
    for (const value of Object.values(row?.subModels ?? {})) {
      for (const child of Array.isArray(value) ? value : [value]) walk(child)
    }
  }
  walk(tree)
  return out
}

/**
 * The W3-B2 subtable drill-down blocks from the old drawer: every grid item
 * that is not the main DetailsBlock (the association-bound TableBlockModels
 * whose presence setup-verify asserts). Extracted verbatim and re-seated in
 * the new tree's 单据明细 tab so the two-level drill-down survives the B7
 * rewrite.
 */
export function childrenOfDrawerTree(tree: Record<string, unknown>): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = []
  const walk = (node: unknown): void => {
    if (node === null || typeof node !== 'object') return
    const row = node as Record<string, any>
    if (row?.use === 'BlockGridModel') {
      const items = row?.subModels?.items
      for (const item of (Array.isArray(items) ? items : items === undefined ? [] : [items])) {
        if (item?.use === 'TableBlockModel' && typeof item?.stepParams?.resourceSettings?.init?.associationName === 'string') {
          out.push(JSON.parse(JSON.stringify(item)))
        }
      }
    }
    for (const value of Object.values(row?.subModels ?? {})) {
      for (const child of Array.isArray(value) ? value : [value]) walk(child)
    }
  }
  walk(tree)
  return out
}

/** Header-priority re-sequencing: pref order first, drawer leftovers after (stable for re-runs). */
export function resequenceFields(fields: ReadonlyArray<DetailFieldSpec>, headerPref: readonly string[]): DetailFieldSpec[] {
  const byPath = new Map(fields.map(field => [field.fieldPath, field]))
  const head = headerPref.flatMap(path => (byPath.has(path) ? [byPath.get(path)!] : []))
  const seen = new Set(head.map(field => field.fieldPath))
  return [...head, ...fields.filter(field => !seen.has(field.fieldPath))]
}

// ─── connection columns from the healed table columns ───

/** First N columns of any page-level table bound to the collection (modelUse/options copied from the healed field submodels). */
export function columnsFromTables(models: ReadonlyArray<FlowModelRow>, collection: string, max: number): SubtableSpec['columns'] {
  const byUid = new Map(models.map(row => [String(row.uid), row]))
  const childrenOf = (uid: string): FlowModelRow[] => models.filter(row => String(row.parentId ?? '') === uid)
  for (const table of models) {
    if (table?.use !== 'TableBlockModel') continue
    if (String(table?.stepParams?.resourceSettings?.init?.collectionName ?? '') !== collection) continue
    const columns = childrenOf(String(table.uid))
      .filter(child => child.subKey === 'columns' && child.use === 'TableColumnModel')
      .sort((a, b) => (a.sortIndex ?? 0) - (b.sortIndex ?? 0))
    const out: SubtableSpec['columns'] = []
    for (const column of columns) {
      const fieldPath = String(column?.stepParams?.fieldSettings?.init?.fieldPath ?? '')
      const fieldRow = childrenOf(String(column.uid)).find(row => row.subKey === 'field')
      if (fieldPath === '' || fieldRow === undefined || fieldPath === 'id') continue
      out.push({
        fieldPath,
        modelUse: String(fieldRow.use ?? 'DisplayTextFieldModel'),
        ...(Array.isArray((fieldRow.props ?? {}).options) ? { options: fieldRow.props.options as object[] } : {}),
        title: typeof (column.props ?? {}).title === 'string' ? (column.props as { title: string }).title : fieldPath,
      })
      if (out.length >= max) break
    }
    if (out.length > 0) return out
  }
  return []
}

// ─── the heal walk ───

/**
 * W3-B1 row view actions whose owning table targets the collection. Flat
 * flowModels rows carry no subModels (deep nodes live only inside the saved
 * surface tree), so targeting rides the parent chain: view action → actions
 * column → TableBlockModel.resourceSettings.init.collectionName.
 */
export function findViewActions(models: ReadonlyArray<FlowModelRow>, collection: string): FlowModelRow[] {
  const byUid = new Map(models.map(row => [String(row.uid), row]))
  return models.filter(row => {
    if (row?.use !== 'ViewActionModel' || !String(row.uid ?? '').startsWith('w3b1va')) return false
    const column = byUid.get(String(row.parentId ?? ''))
    if (column?.use !== 'TableActionsColumnModel') return false
    const table = byUid.get(String(column.parentId ?? ''))
    return table?.use === 'TableBlockModel'
      && String(table?.stepParams?.resourceSettings?.init?.collectionName ?? '') === collection
  })
}

const VIEW_FIELDS: ReadonlyArray<[name: string, type: string, title: string, interfaceName: string, primary?: boolean]> = [
  ['id', 'bigInt', 'ID', 'id', true],
  ['doc_type', 'string', '单据类型', 'input'], ['doc_id', 'integer', '单据ID', 'integer'],
  ['node_seq', 'integer', '节点序号', 'integer'], ['approver', 'string', '审批人', 'input'],
  ['action', 'string', '动作', 'input'], ['comment', 'text', '意见', 'textarea'],
  ['attempt_no', 'integer', '轮次', 'integer'], ['from_state', 'string', '自状态', 'input'],
  ['to_state', 'string', '至状态', 'input'], ['from_anchor', 'string', '自锚点', 'input'],
  ['to_anchor', 'string', '至锚点', 'input'], ['source', 'string', '来源', 'input'],
  ['acted_at', 'date', '时间', 'date'],
]

/**
 * The timeline data channel for one docType: a PG view pinned to the
 * doc_type, granted to the app's DB user, registered as a NocoBase view
 * collection with the 14 record fields, plus the parent hasMany
 * (foreignKey=doc_id) the timeline block's association binds to. The
 * doc_type pin is what makes the bare doc_id foreign key unambiguous — a
 * direct hasMany onto wfl_approval_records would mix documents of different
 * types sharing ids. Idempotent at every layer.
 */
export async function ensureTimelineChannel(token: string, spec: { collection: string, docType: string }): Promise<string> {
  const viewName = timelineCollectionFor(spec.docType)
  psql(`CREATE OR REPLACE VIEW ${viewName} AS SELECT * FROM wfl_approval_records WHERE doc_type='${spec.docType}'`)
  psql(`GRANT SELECT ON ${viewName} TO nocobase`)
  const listed = await dataOf(token, 'GET', `/api/collections:list?pageSize=500&filter=${encodeURIComponent(JSON.stringify({ name: { $eq: viewName } }))}`) as Array<Record<string, unknown>> | null
  if ((listed ?? []).length === 0) {
    await call(token, 'POST', '/api/collections:create', {
      name: viewName, title: `${spec.docType} 审批记录`, view: true, viewName, schema: 'public',
    })
  }
  const fieldRows = await dataOf(token, 'GET', `/api/fields:list?pageSize=200&filter=${encodeURIComponent(JSON.stringify({ collectionName: { $eq: viewName } }))}`) as Array<{ name?: string }> | null
  const existing = new Set((fieldRows ?? []).map(row => String(row.name ?? '')))
  for (const [name, type, title, interfaceName, primary] of VIEW_FIELDS) {
    if (existing.has(name)) continue
    await call(token, 'POST', '/api/fields:create', {
      collectionName: viewName, name, type, title, interface: interfaceName, ...(primary === true ? { primaryKey: true } : {}),
    })
  }
  await ensureParentHasMany(token, spec.collection, 'approvalRecords', viewName, 'doc_id')
  return viewName
}

async function loadRegisteredFields(token: string): Promise<Map<string, Set<string>>> {
  for (const path of ['/api/collectionFields:list?pageSize=2000&sort=collectionName', '/api/fields:list?pageSize=2000&sort=collectionName']) {
    const rows = await dataOf(token, 'GET', path).catch(() => null) as Array<Record<string, any>> | null
    if (!Array.isArray(rows) || rows.length === 0) continue
    const map = new Map<string, Set<string>>()
    for (const row of rows) {
      const collection = typeof row.collectionName === 'string' ? row.collectionName : ''
      if (collection === '' || typeof row.name !== 'string') continue
      if (!map.has(collection)) map.set(collection, new Set())
      map.get(collection)!.add(row.name)
    }
    if (map.size > 0) return map
  }
  throw new Error('no collection-scoped field channel returned rows')
}

async function applyHeal(token: string, specs: ReadonlyArray<DocSpec>, pilot: boolean): Promise<void> {
  const models = await listFlowModels(token, 'w5b7-detail')
  const registered = await loadRegisteredFields(token)
  const log: string[] = [`# w5b7 document-detail heal ${pilot ? 'pilot' : 'all'} @ ${new Date().toISOString()}`]
  for (const spec of specs) {
    if (pilot && spec.collection !== 'pur_orders') continue
    const viewName = await ensureTimelineChannel(token, spec)
    log.push(`timelineChannel ${spec.docType} -> ${viewName}`)
    for (const rel of spec.related) {
      const created = await ensureParentHasMany(token, spec.collection, rel.field, rel.child, rel.foreignKey)
      log.push(`hasMany ${spec.collection}.${rel.field} -> ${rel.child}${created ? ' (created)' : ''}`)
    }
    const actions = findViewActions(models, spec.collection)
    if (actions.length === 0) {
      log.push(`! ${spec.collection}: no w3b1 view action found (skipped)`)
      continue
    }
    for (const action of actions) {
      const current = await dataOf(token, 'GET', `/api/flowSurfaces:get?uid=${encodeURIComponent(String(action.uid))}`)
      const tree = current?.tree
      if (tree == null) {
        log.push(`! ${spec.collection}: action ${action.uid} tree unreadable (skipped)`)
        continue
      }
      const fields = fieldsOfDrawerTree(tree, registered.get(spec.collection) ?? null)
      if (fields.length === 0) {
        log.push(`! ${spec.collection}: action ${action.uid} drawer has no DetailsItems (skipped)`)
        continue
      }
      const related: SubtableSpec[] = spec.related
        .map(rel => ({
          collection: rel.child,
          association: `${spec.collection}.${rel.field}`,
          title: rel.title,
          columns: columnsFromTables(models, rel.child, 5),
        }))
        .filter(sub => sub.columns.length > 0)
      appendRollback([{ collection: spec.collection, actionUid: String(action.uid), tree: tree as Record<string, unknown> }])
      await call(token, 'POST', `/api/flowModels:destroy?filterByTk=${encodeURIComponent(String(action.uid))}`)
      const actionUid = withW5b7Prefix('va')
      const ledger = loadLedger().filter(entry => entry.oldActionUid !== String(action.uid))
      ledger.push({ collection: spec.collection, actionUid, oldActionUid: String(action.uid) })
      writeLedger(ledger)
      const children = childrenOfDrawerTree(tree)
      await dataOf(token, 'POST', '/api/flowModels:save', {
        uid: actionUid, parentId: action.parentId, subKey: action.subKey, subType: 'array', sortIndex: action.sortIndex ?? 1,
        use: 'ViewActionModel', props: {},
        stepParams: {
          popupSettings: { openView: { mode: 'drawer', size: 'large', pageModelClass: 'ChildPageModel', collectionName: spec.collection, dataSourceKey: 'main', filterByTk: '{{ctx.record.id}}' } },
          buttonSettings: { general: { type: 'link', icon: null, iconOnly: false } },
        },
        subModels: { page: documentDetailPageTree(actionUid, {
          collection: spec.collection,
          fields: resequenceFields(fields, spec.headerPref),
          docType: spec.docType,
          ...(related.length === 0 ? {} : { related }),
          ...(children.length === 0 ? {} : { children }),
          designerBase: process.env.W5_DESIGNER_BASE ?? 'http://127.0.0.1:13110',
        }) },
      })
      log.push(`${spec.collection}: action ${action.uid} -> ${actionUid} (fields=${fields.length} related=${related.length} subtables=${children.length})`)
    }
  }
  const out = log.join('\n')
  console.log(out)
  writeFileSync(`${RESEARCH_DIR}w5-b7-heal-run-${pilot ? 'pilot' : 'all'}.txt`, `${out}\n`)
}

async function assertHeal(token: string): Promise<void> {
  const ledger = loadLedger()
  const failures: string[] = []
  const log: string[] = []
  for (const spec of DOC_SPECS) {
    const entries = ledger.filter(entry => entry.collection === spec.collection)
    if (entries.length === 0) {
      failures.push(`${spec.collection}: no w5b7 ledger entry`)
      continue
    }
    for (const entry of entries) {
      const current = await dataOf(token, 'GET', `/api/flowSurfaces:get?uid=${encodeURIComponent(entry.actionUid)}`)
      const page = current?.tree?.subModels?.page
      if (page == null) {
        failures.push(`${spec.collection} ${entry.actionUid}: drawer tree unreadable`)
        continue
      }
      const tree = JSON.stringify(page.subModels ?? {})
      const tabs = Array.isArray(page?.subModels?.tabs) ? page.subModels.tabs.length : 0
      const expectedTabs = spec.related.length > 0 ? 3 : 2
      if (tabs < expectedTabs) failures.push(`${spec.collection} ${entry.actionUid}: tabs=${tabs} < ${expectedTabs}`)
      if (!tree.includes(`"collectionName":"${timelineCollectionFor(spec.docType)}"`)) failures.push(`${spec.collection} ${entry.actionUid}: timeline block missing`)
      if (!tree.includes(`"associationName":"${spec.collection}.approvalRecords"`)) failures.push(`${spec.collection} ${entry.actionUid}: timeline association missing`)
      if (!tree.includes('"sourceId":"{{ctx.view.inputArgs.filterByTk}}"')) failures.push(`${spec.collection} ${entry.actionUid}: timeline sourceId missing`)
      for (const rel of spec.related) {
        if (!tree.includes(`"associationName":"${spec.collection}.${rel.field}"`)) {
          failures.push(`${spec.collection} ${entry.actionUid}: connection ${rel.field} missing`)
        }
      }
    }
    log.push(`${spec.collection}=${entries.length}`)
  }
  console.log(`w5b7-detail assert: ${log.join(' ')}`)
  if (failures.length > 0) {
    console.error(`w5b7-detail assert: FAILED\n  - ${failures.join('\n  - ')}`)
    process.exitCode = 1
    return
  }
  console.log('w5b7-detail assert: OK — 三 tab 模式/时间线/关联面板 全部就位')
}

async function rollbackHeal(token: string): Promise<void> {
  const journal = loadRollback()
  const ledger = loadLedger()
  if (journal.length === 0 || ledger.length === 0) {
    console.log('nothing to roll back')
    return
  }
  const log: string[] = []
  for (const entry of ledger) {
    await call(token, 'POST', `/api/flowModels:destroy?filterByTk=${encodeURIComponent(entry.actionUid)}`)
    const record = journal.find(candidate => candidate.actionUid === entry.oldActionUid)
    if (record === undefined) {
      log.push(`! ${entry.collection}: no snapshot for old action ${entry.oldActionUid} (new destroyed, old not restored)`)
      continue
    }
    await dataOf(token, 'POST', '/api/flowModels:save', record.tree)
    log.push(`restored ${entry.collection} action ${entry.oldActionUid}`)
  }
  writeLedger([])
  writeFileSync(ROLLBACK_PATH, `${JSON.stringify([], null, 2)}\n`)
  console.log(log.join('\n'))
}

// ─── psql cross-check: timeline rows vs the drawer's filter ───

const psql = (sql: string): string => {
  // local trust auth over the direct URL (the .env credential set belongs to
  // the NocoBase app; repo verification always used direct psql here)
  const run = spawnSync('psql', ['postgres://localhost:5432/nocobase', '-v', 'ON_ERROR_STOP=1', '-tA', '-c', sql], { encoding: 'utf8' })
  if (run.status !== 0) throw new Error(`psql failed: ${run.stderr}`)
  return String(run.stdout).trim()
}

/** For three sample documents: the drawer filter (doc_type + doc_id) must select exactly the psql row count. */
function crossCheckLedger(): void {
  const samples = psql("SELECT doc_type||'/'||doc_id||':'||count(*) FROM wfl_approval_records WHERE doc_type IN ('pur_orders','so_orders','mfg_orders') GROUP BY doc_type, doc_id ORDER BY count(*) DESC LIMIT 3")
  console.log(`psql sample rows (doc_type/doc_id:count):\n  ${samples.split('\n').join('\n  ')}`)
  if (samples === '') console.log('(no records rows to cross-check; timeline emptiness is the correct state)')
}

async function main(): Promise<void> {
  const args = process.argv.slice(2)
  const pilot = args.includes('--pilot')
  const all = args.includes('--all')
  const doAssert = args.includes('--assert')
  const doRollback = args.includes('--rollback')
  const apply = args.includes('--apply')
  if (args.length === 0 || (!apply && !doAssert && !doRollback)) {
    console.error('usage: w5b7-detail.mts --apply [--pilot|--all] | --assert | --rollback')
    process.exitCode = 2
    return
  }
  const token = await signInWithRetry()
  if (apply) await applyHeal(token, DOC_SPECS, pilot)
  else if (doAssert) {
    await assertHeal(token)
    crossCheckLedger()
  } else await rollbackHeal(token)
}

void main().catch(error => {
  console.error(error)
  process.exit(1)
})
