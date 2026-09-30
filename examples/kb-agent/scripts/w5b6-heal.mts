/**
 * W5-B6 list-page pattern heal: the nine-state status palette v2 (report
 * §4.1 B — execution-completed moves to cyan so it can never read as the
 * approval green, in-progress to blue processing), money/date column
 * right-alignment (Fiori responsive-table rule, riding TableColumnModel
 * props.align which getColumnProps spreads straight into the antd column),
 * and the default-collapsed filter bar (FilterFormCollapseActionModel,
 * platform-native) on every FilterForm W4-B1 created. Column- and block-level
 * walk over flowModels with collection-name domain scoping; idempotent; every
 * mutation journals its before-state first.
 *
 * Usage:
 *   node --import tsx/esm examples/kb-agent/scripts/w5b6-heal.mts --dry-run [--pilot|--domain procurement|...|--all]
 *   node --import tsx/esm examples/kb-agent/scripts/w5b6-heal.mts --pilot
 *   node --import tsx/esm examples/kb-agent/scripts/w5b6-heal.mts --all
 *   node --import tsx/esm examples/kb-agent/scripts/w5b6-heal.mts --rollback [--pilot|--domain X|--all]
 *   node --import tsx/esm examples/kb-agent/scripts/w5b6-heal.mts --assert
 */
import { readFileSync, writeFileSync } from 'node:fs'
import {
  dataOf, listFlowModels, mergeNodeProps, signInWithRetry,
  type FlowModelRow, type StatusColumnOption,
} from './nocobase-flow-page-lib.mts'

const RESEARCH_DIR = new URL('../../../research/2026-09-29-w5-rework/', import.meta.url).pathname
const ROLLBACK_PATH = `${RESEARCH_DIR}w5-b6-heal-rollback.json`
const PREFIX = 'w5b6'

// ─── the nine-state palette v2 (report §4.1 B / §4.3) ───

/**
 * value → [label, antd preset color]. antd preset names render the exact
 * fg/bg pairs the research token table specifies (green → #389E0D on #F6FFED,
 * orange → #D46B08 on #FFF7E6, red → #CF1322 on #FFF1F0, cyan → #08979C on
 * #E6FFFB, blue → #1677FF on #E6F4FF), keeping WCAG AA contrast and the
 * text+color double encoding. v2 deltas vs W4-B1: completed/done green→cyan
 * (execution ≠ approval), in_progress orange→blue (processing), plus the
 * financial (partial/paid/overdue), transfer (converted/dismissed), and
 * quality (hold) values B3–B5 added to the live enums.
 */
export const STATUS_PALETTE: Readonly<Record<string, [string, string]>> = {
  // 审批维度
  draft: ['草稿', 'default'], pending: ['待处理', 'orange'], pending_level2: ['二级审批中', 'purple'],
  submitted: ['已提交', 'blue'], approved: ['已生效', 'green'], rejected: ['已驳回', 'red'],
  void: ['已作废', 'default'],
  // 执行维度
  planned: ['已计划', 'blue'], released: ['已下达', 'blue'], in_progress: ['执行中', 'blue'],
  started: ['已开工', 'orange'], processing: ['处理中', 'blue'], waiting: ['等待中', 'orange'],
  completed: ['已完成', 'cyan'], done: ['已完成', 'cyan'], closed: ['已关闭', 'default'],
  cancelled: ['已取消', 'default'], confirmed: ['已确认', 'green'], resolved: ['已解决', 'green'],
  active: ['生效', 'green'], inactive: ['停用', 'default'], retired: ['退役', 'default'],
  new: ['新建', 'default'],
  // 财务维度
  open: ['进行中', 'blue'], partial: ['部分付款', 'orange'], paid: ['已付讫', 'green'],
  overdue: ['已逾期', 'red'],
  // 质量/转单族
  passed: ['合格', 'green'], failed: ['不合格', 'red'], concession: ['让步接收', 'orange'],
  hold: ['待定', 'orange'], converted: ['已转单', 'blue'], dismissed: ['已忽略', 'default'],
  // 维保英文残留值中文化（W4-B1 §2.6 继承）
  Preventive: ['预防性', 'blue'], Corrective: ['纠正性', 'orange'], Inspection: ['点检', 'cyan'],
  Scheduled: ['已排程', 'blue'], 'In progress': ['进行中', 'orange'], Done: ['已完成', 'green'],
}

const v2For = (value: string): [string, string] | undefined => STATUS_PALETTE[value]

/** Options rewritten to v2 where the value is covered; unknown values keep their current entry untouched. */
export function recolorOptions(current: ReadonlyArray<Record<string, unknown>>): { options: StatusColumnOption[], changed: boolean } {
  const options = current.map(entry => {
    const value = String(entry.value ?? '')
    const hit = v2For(value)
    if (hit === undefined) return { ...entry } as StatusColumnOption
    const [label, color] = hit
    if (entry.label === label && entry.color === color) return { ...entry } as StatusColumnOption
    return { ...entry, label, color } as StatusColumnOption
  })
  const changed = options.some((option, index) => JSON.stringify(option) !== JSON.stringify(current[index] ?? null))
  return { options, changed }
}

// ─── domain scoping (the W4-B1 matchers, keyed on the owning collection) ───

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
  hub: /.*/,
}

const domainOf = (collection: string): Domain =>
  DOMAINS.find(domain => DOMAIN_MATCHERS[domain].test(collection)) ?? 'hub'

// ─── snapshot ───

type FieldMeta = { name: string, interface: string | null }

async function loadFields(token: string): Promise<Map<string, FieldMeta[]>> {
  for (const path of ['/api/collectionFields:list?pageSize=2000&sort=collectionName', '/api/fields:list?pageSize=2000&sort=collectionName']) {
    const rows = await dataOf(token, 'GET', path).catch(() => null) as Array<Record<string, any>> | null
    if (!Array.isArray(rows) || rows.length === 0) continue
    if (rows.length === 2000) throw new Error(`${path} may be truncated; raise the page size`)
    const map = new Map<string, FieldMeta[]>()
    for (const row of rows) {
      const collection = typeof row.collectionName === 'string' ? row.collectionName : ''
      if (collection === '' || typeof row.name !== 'string') continue
      if (!map.has(collection)) map.set(collection, [])
      map.get(collection)!.push({ name: row.name, interface: row.interface ?? null })
    }
    if (map.size > 0) return map
  }
  throw new Error('no collection-scoped field channel returned rows')
}

const MONEY_FIELD = /(amount|price|total|value|cost|fee|budget|balance|payable|receivable|qty_amount)/

// ─── rollback journal ───

type RollbackEntry =
  | { kind: 'fieldOptions', fieldUid: string, before: Record<string, unknown> }
  | { kind: 'columnAlign', columnUid: string, before: Record<string, unknown> }
  | { kind: 'collapseAction', actionUid: string, filterFormUid: string }

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

const nodeKey = (): string => Math.random().toString(36).slice(2, 13)
const withW5b6Prefix = (tag: string): string => `${PREFIX}${tag}${nodeKey()}`

// ─── the heal walk ───

export type HealCounts = { recolor: number, alignRight: number, alignLeft: number, collapse: number }

type WalkSpec = {
  columns: Array<{ columnRow: FlowModelRow, fieldRow: FlowModelRow, fieldPath: string, collection: string, actions: string[] }>
  filterForms: Array<FlowModelRow>
}

/**
 * Column- and block-level spec: every table column whose field submodel is an
 * enum/number/date display (the W4 healed surfaces) plus every FilterForm
 * block lacking a collapse action. Collection names come from the field
 * submodel's own stepParams (rebuildColumnField writes them) with the
 * fallback of walking the owning table block.
 */
export function buildWalkSpec(models: FlowModelRow[]): WalkSpec {
  const byUid = new Map(models.map(row => [String(row.uid), row]))
  const childrenOf = (uid: string): FlowModelRow[] => models.filter(row => String(row.parentId ?? '') === uid)
  const columns: WalkSpec['columns'] = []
  for (const columnRow of models) {
    if (columnRow?.use !== 'TableColumnModel') continue
    const fieldRow = childrenOf(String(columnRow.uid)).find(row => row.subKey === 'field')
    if (fieldRow === undefined) continue
    const fieldPath = String(columnRow?.stepParams?.fieldSettings?.init?.fieldPath ?? '')
    const collection = String(fieldRow?.stepParams?.fieldSettings?.init?.collectionName
      ?? columnRow?.stepParams?.fieldSettings?.init?.collectionName ?? '')
    const use = String(fieldRow.use ?? '')
    const props = (fieldRow.props ?? {}) as Record<string, unknown>
    const actions: string[] = []
    if (use === 'DisplayEnumFieldModel' && Array.isArray(props.options)) {
      actions.push('recolor')
      if (columnRow.props?.align !== 'left') actions.push('alignLeft')
    }
    if (use === 'DisplayNumberFieldModel' && !(fieldPath === 'id' || /_id$/.test(fieldPath))) actions.push('alignRight')
    else if (use === 'DisplayDateTimeFieldModel') actions.push('alignRight')
    if (actions.length === 0) continue
    columns.push({ columnRow, fieldRow, fieldPath, collection, actions })
  }
  const filterForms = models.filter(row => row?.use === 'FilterFormBlockModel'
    && !childrenOf(String(row.uid)).some(child => child?.use === 'FilterFormCollapseActionModel'))
  return { columns, filterForms }
}

async function runHeal(token: string, spec: WalkSpec, fields: Map<string, FieldMeta[]>, scope: (collection: string) => boolean, dryRun: boolean): Promise<{ log: string[], counts: HealCounts }> {
  const log: string[] = []
  const counts: HealCounts = { recolor: 0, alignRight: 0, alignLeft: 0, collapse: 0 }
  for (const { columnRow, fieldRow, fieldPath, collection, actions } of spec.columns) {
    if (collection !== '' && !scope(collection)) continue
    const journal: RollbackEntry[] = []
    if (actions.includes('recolor')) {
      const current = (fieldRow.props ?? {}).options as Array<Record<string, unknown>>
      const { options, changed } = recolorOptions(current)
      if (changed) {
        counts.recolor++
        log.push(`  recolor ${collection}.${fieldPath}`)
        if (!dryRun) {
          journal.push({ kind: 'fieldOptions', fieldUid: String(fieldRow.uid), before: JSON.parse(JSON.stringify(fieldRow.props ?? {})) })
          await dataOf(token, 'POST', '/api/flowModels:save', {
            uid: fieldRow.uid, parentId: fieldRow.parentId, subKey: fieldRow.subKey,
            props: { ...fieldRow.props, options },
          })
        }
      }
    }
    if (actions.includes('alignRight') && columnRow.props?.align !== 'right') {
      {
        counts.alignRight++
        log.push(`  align→right ${collection}.${fieldPath}`)
        if (!dryRun) {
          journal.push({ kind: 'columnAlign', columnUid: String(columnRow.uid), before: JSON.parse(JSON.stringify(columnRow.props ?? {})) })
          await mergeNodeProps(token, String(columnRow.uid), { align: 'right' })
        }
      }
    }
    if (actions.includes('alignLeft') && columnRow.props?.align !== 'left') {
      counts.alignLeft++
      log.push(`  align→left ${collection}.${fieldPath}`)
      if (!dryRun) {
        journal.push({ kind: 'columnAlign', columnUid: String(columnRow.uid), before: JSON.parse(JSON.stringify(columnRow.props ?? {})) })
        await mergeNodeProps(token, String(columnRow.uid), { align: 'left' })
      }
    }
    appendJournal(journal)
  }
  for (const form of spec.filterForms) {
    const collection = String(form?.stepParams?.resourceSettings?.init?.collectionName ?? '')
    if (collection !== '' && !scope(collection)) continue
    counts.collapse++
    log.push(`  collapse ${collection} filterForm`)
    if (!dryRun) {
      const actionUid = withW5b6Prefix('ffc')
      await dataOf(token, 'POST', '/api/flowModels:save', {
        uid: actionUid, parentId: form.uid, subKey: 'actions', subType: 'array', sortIndex: 3,
        use: 'FilterFormCollapseActionModel', props: {},
        stepParams: { collapseSettings: { defaultCollapsed: { value: true }, toggle: { collapsedRows: 1 } } },
      })
      appendJournal([{ kind: 'collapseAction', actionUid, filterFormUid: String(form.uid) }])
    }
  }
  return { log, counts }
}

async function rollback(token: string, scope: (collection: string) => boolean, fields: Map<string, FieldMeta[]>): Promise<string[]> {
  const models = await listFlowModels(token, 'w5b6-rollback')
  const byUid = new Map(models.map(row => [String(row.uid), row]))
  const log: string[] = []
  const undone: RollbackEntry[] = []
  const collectionOfColumn = (columnUid: string): string => {
    const column = byUid.get(columnUid)
    const field = models.find(row => String(row.parentId ?? '') === columnUid && row.subKey === 'field')
    return String(field?.stepParams?.fieldSettings?.init?.collectionName ?? column?.stepParams?.fieldSettings?.init?.collectionName ?? '')
  }
  for (let index = loadJournal().length - 1; index >= 0; index--) {
    const journal = loadJournal()
    const entry = journal[index]
    if (entry === undefined) break
    if (entry.kind === 'fieldOptions' || entry.kind === 'columnAlign') {
      const collection = collectionOfColumn(entry.kind === 'fieldOptions'
        ? String(byUid.get(entry.fieldUid)?.parentId ?? '')
        : entry.columnUid)
      if (collection !== '' && !scope(collection)) { undone.push(entry); continue }
      const uid = entry.kind === 'fieldOptions' ? entry.fieldUid : entry.columnUid
      const row = byUid.get(uid)
      if (row === undefined) { undone.push(entry); continue }
      // flowModels:save merges props, so a before-state without `align` must
      // clear the heal-written key explicitly (the w4-b1 tableSort lesson)
      await dataOf(token, 'POST', '/api/flowModels:save', {
        uid, parentId: row.parentId, subKey: row.subKey,
        props: { ...entry.before, align: entry.before.align ?? null },
      })
      log.push(`rollback ${entry.kind} ${uid}`)
    } else {
      const form = byUid.get(entry.filterFormUid)
      const collection = String(form?.stepParams?.resourceSettings?.init?.collectionName ?? '')
      if (collection !== '' && !scope(collection)) { undone.push(entry); continue }
      await dataOf(token, 'POST', `/api/flowModels:destroy?filterByTk=${encodeURIComponent(entry.actionUid)}`)
      log.push(`rollback collapse ${entry.actionUid}`)
    }
    void fields
  }
  writeFileSync(ROLLBACK_PATH, `${JSON.stringify(undone, null, 2)}\n`)
  return log
}

// ─── assert ───

async function assertPatterns(token: string, fields: Map<string, FieldMeta[]>): Promise<void> {
  const models = await listFlowModels(token, 'w5b6-assert')
  const childrenOf = (uid: string): FlowModelRow[] => models.filter(row => String(row.parentId ?? '') === uid)
  const failures: string[] = []
  let enumColumns = 0, colorMismatch = 0, bareText = 0
  let numberColumns = 0, numberNoRight = 0, dateColumns = 0, dateNoRight = 0
  let enumNoLeft = 0
  for (const columnRow of models) {
    if (columnRow?.use !== 'TableColumnModel') continue
    const fieldRow = childrenOf(String(columnRow.uid)).find(row => row.subKey === 'field')
    if (fieldRow === undefined) continue
    const fieldPath = String(columnRow?.stepParams?.fieldSettings?.init?.fieldPath ?? '')
    const collection = String(fieldRow?.stepParams?.fieldSettings?.init?.collectionName
      ?? columnRow?.stepParams?.fieldSettings?.init?.collectionName ?? '')
    const interfaceName = fields.get(collection)?.find(field => field.name === fieldPath)?.interface ?? ''
    const use = String(fieldRow.use ?? '')
    const align = (columnRow.props ?? {}).align
    if (use === 'DisplayEnumFieldModel') {
      enumColumns++
      if (align !== 'left') enumNoLeft++
      const options = Array.isArray((fieldRow.props ?? {}).options) ? (fieldRow.props as { options: Array<Record<string, unknown>> }).options : []
      for (const option of options) {
        const hit = v2For(String(option.value ?? ''))
        if (hit === undefined) continue
        if (option.label !== hit[0] || option.color !== hit[1]) { colorMismatch++; break }
      }
    } else if (use === 'DisplayTextFieldModel' && interfaceName === 'select') {
      bareText++
    } else if (use === 'DisplayNumberFieldModel' && !(fieldPath === 'id' || /_id$/.test(fieldPath))) {
      numberColumns++
      if (align !== 'right') numberNoRight++
    } else if (use === 'DisplayDateTimeFieldModel') {
      dateColumns++
      if (align !== 'right') dateNoRight++
    }
  }
  const filterForms = models.filter(row => row?.use === 'FilterFormBlockModel')
  const ffNoCollapse = filterForms.filter(form =>
    !childrenOf(String(form.uid)).some(child => child?.use === 'FilterFormCollapseActionModel')).length
  const report = [
    `enumColumns=${enumColumns}`, `colorMismatch=${colorMismatch}`, `bareText=${bareText}`, `enumNoLeft=${enumNoLeft}`,
    `numberNoRight=${numberNoRight}/${numberColumns}`, `dateNoRight=${dateNoRight}/${dateColumns}`,
    `ffNoCollapse=${ffNoCollapse}/${filterForms.length}`,
  ]
  console.log(`w5b6-heal assert: ${report.join(' ')}`)
  if (colorMismatch !== 0) failures.push(`九态色板 v2 未全覆盖: ${colorMismatch} 列`)
  if (bareText !== 0) failures.push(`状态列裸文本: ${bareText}`)
  if (enumNoLeft !== 0) failures.push(`enum 列未左对齐: ${enumNoLeft}`)
  if (numberNoRight !== 0) failures.push(`数字列未右对齐: ${numberNoRight}/${numberColumns}`)
  if (dateNoRight !== 0) failures.push(`日期列未右对齐: ${dateNoRight}/${dateColumns}`)
  if (ffNoCollapse !== 0) failures.push(`FilterForm 缺收起: ${ffNoCollapse}/${filterForms.length}`)
  if (failures.length > 0) {
    console.error(`w5b6-heal assert: FAILED\n  - ${failures.join('\n  - ')}`)
    process.exitCode = 1
    return
  }
  console.log('w5b6-heal assert: OK — 色板 v2/对齐/收起 全部达标')
}

// ─── CLI ───

async function main(): Promise<void> {
  const args = process.argv.slice(2)
  const dryRun = args.includes('--dry-run')
  const pilot = args.includes('--pilot')
  const all = args.includes('--all')
  const doRollback = args.includes('--rollback')
  const doAssert = args.includes('--assert')
  const domainIndex = args.indexOf('--domain')
  const domain = domainIndex >= 0 ? args[domainIndex + 1] as Domain : undefined
  if (args.length === 0 || (!dryRun && !pilot && !all && domain === undefined && !doRollback && !doAssert)
    || (domain !== undefined && !DOMAINS.includes(domain))) {
    console.error('usage: w5b6-heal.mts --dry-run|--pilot|--domain <name>|--all [--rollback] [--assert]')
    process.exitCode = 2
    return
  }
  const token = await signInWithRetry()
  const fields = await loadFields(token)
  if (doAssert) {
    await assertPatterns(token, fields)
    return
  }
  const scope = (collection: string): boolean => {
    if (pilot) return /^pur_/.test(collection)
    if (domain !== undefined) return DOMAIN_MATCHERS[domain].test(collection)
    return true
  }
  if (doRollback) {
    const log = await rollback(token, scope, fields)
    console.log(log.length > 0 ? log.join('\n') : 'nothing to roll back for this selection')
    return
  }
  const models = await listFlowModels(token, 'w5b6-heal')
  const spec = buildWalkSpec(models)
  const targetLabel = pilot ? 'pilot' : domain ?? 'all'
  const { log, counts } = await runHeal(token, spec, fields, scope, dryRun)
  const summary = `${dryRun ? 'dry-run' : 'heal'} ${targetLabel}: recolor=${counts.recolor} alignRight=${counts.alignRight} collapse=${counts.collapse}`
  const out = [...log, summary].join('\n')
  console.log(out)
  if (!dryRun) writeFileSync(`${RESEARCH_DIR}w5-b6-heal-run-${targetLabel}.txt`, `${out}\n`)
}

void main().catch(error => {
  console.error(error)
  process.exit(1)
})
