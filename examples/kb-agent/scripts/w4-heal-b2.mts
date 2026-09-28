/**
 * W4-B2 form-standards heal: two-column sectioned layouts (doc/master
 * templates, config stays single-column), business-key required markers,
 * assignRules default quartet (date=today / status=initial / qty=0 / user=ctx),
 * format-class placeholders, Chinese enum options, and the D5 whitelist
 * Edit/Delete completion on hub_/crm_ free-state pages. Idempotent; created
 * nodes carry the w4b2 prefix; every mutation snapshots its before-state into
 * research/2026-09-28-w4-completeness/w4-b2-rollback.json first.
 *
 * Usage:
 *   node --import tsx/esm examples/kb-agent/scripts/w4-heal-b2.mts --dry-run [--pilot|--domain procurement|...|--all]
 *   node --import tsx/esm examples/kb-agent/scripts/w4-heal-b2.mts --pilot     # srm_suppliers + pur_orders CreateForms (hard gate)
 *   node --import tsx/esm examples/kb-agent/scripts/w4-heal-b2.mts --domain hub
 *   node --import tsx/esm examples/kb-agent/scripts/w4-heal-b2.mts --all
 *   node --import tsx/esm examples/kb-agent/scripts/w4-heal-b2.mts --rollback [--pilot|--domain X|--all]
 *   node --import tsx/esm examples/kb-agent/scripts/w4-heal-b2.mts --assert  # B2 defect counters + floors
 */
import { readFileSync, writeFileSync } from 'node:fs'
import {
  assignFormDefaults, call, dataOf, formItemExtras, formTwoColumnLayout, listFlowModels, listRoutes,
  mergeNodeProps, saveRowDeleteAction, signInWithRetry, withW4b2Prefix,
  type FlowModelRow, type StatusColumnOption,
} from './nocobase-flow-page-lib.mts'

const RESEARCH_DIR = new URL('../../../research/2026-09-28-w4-completeness/', import.meta.url).pathname
const ROLLBACK_PATH = `${RESEARCH_DIR}w4-b2-rollback.json`

// ─── shared spec tables (the B1 palette + the B2 form classifiers) ───

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
  qualified: ['合格供方', 'green'], potential: ['潜在供方', 'default'], blocked: ['冻结', 'red'],
  Preventive: ['预防性', 'blue'], Corrective: ['纠正性', 'orange'], Inspection: ['点检', 'cyan'],
  Scheduled: ['已排程', 'blue'], 'In progress': ['进行中', 'orange'], Done: ['已完成', 'green'],
}

const colorFor = (value: string): [string, string] => STATUS_LABELS[value] ?? [value, 'blue']

/** Full-coverage Chinese options for one select field (uiSchema.enum normalized; 维保 English remnants ride the palette). */
export function optionsForEnum(enumEntries: ReadonlyArray<{ value?: unknown, label?: unknown, color?: unknown }>): StatusColumnOption[] {
  const out: StatusColumnOption[] = []
  for (const entry of enumEntries) {
    const value = String(entry.value ?? '')
    if (value === '') continue
    const [fallbackLabel, color] = colorFor(value)
    const label = STATUS_LABELS[value] !== undefined
      ? fallbackLabel
      : (typeof entry.label === 'string' && entry.label !== '' ? entry.label : fallbackLabel)
    out.push({ value, label, color })
  }
  return out
}

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

/** L3 configuration surfaces keep single-column forms (B2 §2.3 — the W3 low-frequency-page doctrine). */
export const CONFIG_DATA = /^(wfl_\w+|qm_aql_plans|hub_hd_sla_policies|hub_md_\w+categories|wms_reorder_suggestions|mrp_\w+|kpi_\w+)$/
const MASTER_DATA = /(supplier|customer|contact|product|employee|department|warehouse|zone|bin|lot|bom|work_center|categor|vendor|material|expert|lead|article|faq|asset|milestone|project|user)/

export type FormTemplate = 'config' | 'master' | 'doc'

export function templateFor(collection: string): FormTemplate {
  if (CONFIG_DATA.test(collection) || collection.endsWith('_categories')) return 'config'
  if (MASTER_DATA.test(collection)) return 'master'
  return 'doc'
}

// business-key required rules (F-3'); engine write paths bypass UI forms, so
// these markers never gate the 9-step chain (its scripts ride REST directly)
const DOC_NO = /^(receipt_no|count_no|order_no|doc_no|shipment_no|transfer_no|movement_no|invoice_no|payment_no|request_no|rfq_no|quote_no|inspection_no|ticket_no|task_no)$/
const IDENTIFIER = /^(name|title|code|employee_no|uscc|serial_no)$/
const DOC_DATE = /^(order_date|doc_date|biz_date|request_date|need_date|count_date|received_at|inspection_date|due_date)$/
const PARTY = /^(supplier|customer|vendor|project)$/
const QTY_FIELD = /^(qty|quantity)$/
const UNIT_FIELD = /^(unit|uom)$/
const MASTER_KEY = /^(type|category|industry|level|uscc|contact|contact_person|phone|region|country)$/

/** Per-collection required extensions hitting the batch floors (B2 §2.4). */
const REQUIRED_EXTRA: Readonly<Record<string, ReadonlyArray<string>>> = {
  srm_suppliers: ['source'],
  mfg_orders: ['product', 'bom', 'std_cost'],
  hub_hr_employees: ['status'],
}

export function requiredFor(collection: string, template: FormTemplate, fieldPath: string): boolean {
  const extras = REQUIRED_EXTRA[collection]
  if (extras !== undefined && extras.includes(fieldPath)) return true
  if (IDENTIFIER.test(fieldPath) || DOC_NO.test(fieldPath)) return true
  if (template === 'doc') {
    if (DOC_DATE.test(fieldPath) || PARTY.test(fieldPath) || QTY_FIELD.test(fieldPath) || UNIT_FIELD.test(fieldPath)) return true
    if (/(lines|items)$/.test(collection) && /^(product|qty|quantity)$/.test(fieldPath)) return true
    if (/^wms_/.test(collection) && /^(product|warehouse|zone|bin)$/.test(fieldPath)) return true
  }
  if (template === 'master' && MASTER_KEY.test(fieldPath)) return true
  return false
}

const MONEY_FIELD = /(amount|price|total|value|cost|fee|budget|balance|payable|receivable)/
const PHONE_FIELD = /(phone|mobile|tel)/
const CODE_FIELD = /(code|_no|sku)$/
const QTY_NAME = /(qty|quantity)/

/** Format-class placeholder (F-9') for one field model, or null when the field is not format-class. */
export function placeholderFor(modelUse: string, fieldPath: string): string | null {
  if (modelUse === 'DateOnlyFieldModel') return 'YYYY-MM-DD'
  if (modelUse === 'DateTimeTzFieldModel' || modelUse === 'DateTimeFieldModel') return 'YYYY-MM-DD HH:mm'
  if (modelUse === 'InputFieldModel') {
    if (PHONE_FIELD.test(fieldPath)) return '11 位手机号'
    if (/email/.test(fieldPath)) return '如 name@company.com'
    if (CODE_FIELD.test(fieldPath)) return '如 PO-20261001-001'
  }
  if (modelUse === 'NumberFieldModel') {
    if (MONEY_FIELD.test(fieldPath)) return '两位小数'
    if (/(qty|quantity)/.test(fieldPath)) return '非负数字'
  }
  return null
}

const ASSIGN_DATE_PRIORITY = ['order_date', 'doc_date', 'biz_date', 'received_at', 'count_date', 'request_date', 'need_date', 'billed_at', 'audit_date', 'sent_at', 'issued_at']
/** The engine's ctx-date contract requires the preset segment ({{ctx.date.preset.today}}, dateVariable.ts PRESET_KEYS). */
const CTX_DATE_TODAY = '{{ctx.date.preset.today}}'
/** Boolean fields whose new-record default is true (F-6' 枚举默认态 for checkbox families). */
const BOOLEAN_DEFAULTS: Readonly<Record<string, boolean>> = { is_active: true, is_default: true }
const STATUS_INITIAL_PRIORITY = ['draft', 'potential', 'new', 'pending', 'todo', 'open', 'active', 'planned']

type FieldMeta = { name: string, interface: string | null, type: string | null, target: string | null, enumEntries: Array<{ value?: unknown, label?: unknown, color?: unknown }> }
type CollectionMeta = { name: string, titleField: string | null }

// ─── live snapshot ───

async function fetchFields(token: string): Promise<Array<FieldMeta & { collectionName: string }>> {
  for (const path of ['/api/collectionFields:list?pageSize=2000&sort=collectionName', '/api/fields:list?pageSize=2000&sort=collectionName']) {
    const rows = await dataOf(token, 'GET', path).catch(() => null) as Array<Record<string, any>> | null
    if (!Array.isArray(rows) || rows.length === 0) continue
    if (rows.length === 2000) throw new Error(`${path} may be truncated at pageSize=2000; raise the page size`)
    const shaped = rows
      .filter(row => typeof row.collectionName === 'string' && row.collectionName !== '' && typeof row.name === 'string')
      .map(row => ({
        collectionName: row.collectionName as string, name: row.name as string,
        interface: row.interface ?? null, type: row.type ?? null, target: row.target ?? null,
        enumEntries: Array.isArray(row.uiSchema?.enum) ? row.uiSchema.enum : [],
      }))
    if (shaped.length > 0) return shaped
  }
  throw new Error('neither collectionFields:list nor fields:list returned collection-scoped field rows')
}

type LiveSnapshot = {
  routes: Awaited<ReturnType<typeof listRoutes>>
  models: FlowModelRow[]
  fieldsByCollection: Map<string, FieldMeta[]>
  collections: Map<string, CollectionMeta>
}

async function loadSnapshot(token: string): Promise<LiveSnapshot> {
  const [routes, models, fields] = await Promise.all([
    listRoutes(token, 'w4-heal-b2'), listFlowModels(token, 'w4-heal-b2'), fetchFields(token),
  ])
  const fieldsByCollection = new Map<string, FieldMeta[]>()
  for (const field of fields) {
    if (!fieldsByCollection.has(field.collectionName)) fieldsByCollection.set(field.collectionName, [])
    fieldsByCollection.get(field.collectionName)!.push(field)
  }
  const collectionRows = await dataOf(token, 'GET', '/api/collections:list?pageSize=500') as Array<Record<string, any>> | null
  if (collectionRows === null) throw new Error('collections:list returned no data')
  return {
    routes, models, fieldsByCollection,
    collections: new Map(collectionRows.map(row => [String(row.name ?? ''), { name: String(row.name ?? ''), titleField: row.titleField ?? null }])),
  }
}

// ─── per-form planning (pure over the fetched grid tree) ───

type TreeItem = {
  uid: string
  collection: string
  fieldPath: string
  props: Record<string, unknown>
  fieldUid: string | null
  fieldUse: string | null
  fieldProps: Record<string, unknown>
}

type FormPlan = {
  gridUid: string
  formUid: string
  /** create-kind forms built without a submit action get one (F-10' negative-channel completion) */
  submitMissing: boolean
  collection: string
  formKind: 'create' | 'edit' | 'other'
  template: FormTemplate
  items: TreeItem[]
  /** item props writes (required + rules), by item uid */
  itemProps: Array<{ uid: string, props: Record<string, unknown> }>
  /** field submodel props writes (placeholder/options), by field uid */
  fieldProps: Array<{ uid: string, props: Record<string, unknown> }>
  /** sectioned layout target; build=false keeps the current single-column layout */
  layout: { sections: Array<{ label: string, itemUids: string[] }>, build: boolean }
  assignRules: Array<{ targetPath: string, value: unknown }>
}

/** Business-flow order score (F-8'): identifier → dates → type/status → party → delivery/qty → money → note. */
export function orderScore(fieldPath: string): number {
  if (/^code$/.test(fieldPath) || DOC_NO.test(fieldPath)) return 0
  if (/^(name|title|employee_no|uscc)$/.test(fieldPath)) return 1
  if (DOC_DATE.test(fieldPath) || /(date|_at)$/.test(fieldPath)) return 2
  if (/^(type|kind|category|doc_type|priority|abc_class)$/.test(fieldPath)) return 3
  if (/^(status|doc_status|lifecycle_status|result)$/.test(fieldPath)) return 4
  if (PARTY.test(fieldPath) || /^(assignee|contact|employee|department)$/.test(fieldPath)) return 5
  if (/^(warehouse|zone|bin|lot|product|bom|target_zone|target_bin)$/.test(fieldPath)) return 6
  if (QTY_FIELD.test(fieldPath) || UNIT_FIELD.test(fieldPath)) return 7
  if (MONEY_FIELD.test(fieldPath) || /^currency$/.test(fieldPath)) return 8
  if (/(note|remark|comment|reason|description)$/.test(fieldPath)) return 90
  return 20
}

const DOC_SECTIONS = ['基本信息', '交易对手与交付', '财务与备注'] as const
const MASTER_SECTIONS = ['基本信息', '属性与联系'] as const

function sectionIndexFor(template: FormTemplate, fieldPath: string): number {
  if (template === 'master') return orderScore(fieldPath) <= 4 ? 0 : 1
  const score = orderScore(fieldPath)
  if (score <= 4) return 0
  if (score <= 7) return 1
  return 2
}

async function fetchTree(token: string, uid: string): Promise<any> {
  const resp = await dataOf(token, 'GET', `/api/flowSurfaces:get?uid=${encodeURIComponent(uid)}`)
  return resp?.tree ?? null
}

type FormContext = { kind: 'create' | 'edit' | 'other', formUid: string, hasSubmit: boolean }

async function formContextOf(token: string, tree: any, cache: Map<string, FormContext>): Promise<FormContext> {
  const parentUid = String(tree?.parentId ?? '')
  if (parentUid === '') return { kind: 'other', formUid: '', hasSubmit: true }
  if (cache.has(parentUid)) return cache.get(parentUid)!
  const parent = await fetchTree(token, parentUid)
  const use = String(parent?.use ?? '')
  const actions = parent?.subModels?.actions
  const list = Array.isArray(actions) ? actions : actions === undefined ? [] : [actions]
  const context: FormContext = {
    kind: use === 'CreateFormModel' ? 'create' : use === 'EditFormModel' ? 'edit' : 'other',
    formUid: parentUid,
    hasSubmit: list.some(action => action?.use === 'FormSubmitActionModel'),
  }
  cache.set(parentUid, context)
  return context
}

function treeItemsOf(tree: any): TreeItem[] {
  const raw = tree?.subModels?.items
  const list = Array.isArray(raw) ? raw : raw === undefined ? [] : [raw]
  const items: TreeItem[] = []
  for (const node of list) {
    if (node?.use !== 'FormItemModel') continue
    const field = node?.subModels?.field
    const init = node?.stepParams?.fieldSettings?.init ?? {}
    items.push({
      uid: String(node.uid ?? ''),
      collection: String(init.collectionName ?? ''),
      fieldPath: String(init.fieldPath ?? ''),
      props: (node.props ?? {}) as Record<string, unknown>,
      fieldUid: field?.uid == null ? null : String(field.uid),
      fieldUse: field?.use == null ? null : String(field.use),
      fieldProps: (field?.props ?? {}) as Record<string, unknown>,
    })
  }
  return items
}

export function planForm(snapshot: LiveSnapshot, gridUid: string, collection: string, formKind: 'create' | 'edit' | 'other', items: TreeItem[], formUid = '', submitMissing = false): FormPlan {
  const template = templateFor(collection)
  const fields = snapshot.fieldsByCollection.get(collection) ?? []
  const itemProps: FormPlan['itemProps'] = []
  const fieldProps: FormPlan['fieldProps'] = []
  const scored = [...items].sort((a, b) => orderScore(a.fieldPath) - orderScore(b.fieldPath))

  for (const item of items) {
    if (item.fieldPath === '') continue
    if (requiredFor(collection, template, item.fieldPath) && item.props.required !== true) {
      const { props, rules } = formItemExtras({ required: true })
      itemProps.push({ uid: item.uid, props: { ...props, rules } })
    }
    if (item.fieldUid !== null && item.fieldUse !== null) {
      const placeholder = placeholderFor(item.fieldUse, item.fieldPath)
      if (placeholder !== null && item.fieldProps.placeholder !== placeholder) {
        fieldProps.push({ uid: item.fieldUid, props: { placeholder } })
      }
      const field = fields.find(entry => entry.name === item.fieldPath)
      if (item.fieldUse === 'SelectFieldModel' && field !== undefined && field.enumEntries.length > 0) {
        const options = optionsForEnum(field.enumEntries)
        const current = Array.isArray(item.fieldProps.options) ? item.fieldProps.options as Array<Record<string, unknown>> : []
        const needsWrite = options.length > 0
          && (current.length !== options.length || options.some((option, index) => current[index]?.label !== option.label || current[index]?.color == null))
        if (needsWrite) fieldProps.push({ uid: item.fieldUid, props: { options } })
      }
    }
  }

  // layout: doc/master with ≥4 fields get dividers + two columns; config and
  // small forms keep the single-column layout (F-1' exemption, Note-recorded)
  const sectionLabels = template === 'master' ? MASTER_SECTIONS : DOC_SECTIONS
  const buildLayout = (template === 'doc' || template === 'master') && items.length >= 4
  const sections = sectionLabels.map(label => ({ label, itemUids: [] as string[] }))
  for (const item of scored) {
    const index = template === 'config' ? 0 : sectionIndexFor(template, item.fieldPath)
    sections[Math.min(index, sections.length - 1)].itemUids.push(item.uid)
  }

  const assignRules: FormPlan['assignRules'] = []
  if (formKind === 'create') {
    const names = new Set(items.map(item => item.fieldPath))
    const metaOf = (name: string) => fields.find(entry => entry.name === name)
    for (const candidate of ASSIGN_DATE_PRIORITY) {
      if (names.has(candidate)) { assignRules.push({ targetPath: candidate, value: CTX_DATE_TODAY }); break }
    }
    for (const selectName of ['status', 'doc_status', 'lifecycle_status', 'stage', 'warn_status']) {
      if (!names.has(selectName)) continue
      const values = (metaOf(selectName)?.enumEntries ?? []).map(entry => String(entry.value ?? '')).filter(value => value !== '')
      if (values.length === 0) break
      const initial = STATUS_INITIAL_PRIORITY.find(candidate => values.includes(candidate)) ?? values[0]
      assignRules.push({ targetPath: selectName, value: initial })
      break
    }
    for (const qtyName of ['qty', 'quantity']) {
      if (names.has(qtyName)) { assignRules.push({ targetPath: qtyName, value: 0 }); break }
    }
    for (const userField of ['created_by', 'owner']) {
      const item = items.find(entry => entry.fieldPath === userField)
      if (item !== undefined && item.fieldUse === 'RecordSelectFieldModel') {
        assignRules.push({ targetPath: userField, value: '{{ctx.user.id}}' })
      }
    }
    for (const item of items) {
      const flag = BOOLEAN_DEFAULTS[item.fieldPath]
      if (flag === true && item.fieldUse === 'CheckboxFieldModel') {
        assignRules.push({ targetPath: item.fieldPath, value: true })
      }
    }
  }

  return { gridUid, formUid, submitMissing, collection, formKind, template, items, itemProps, fieldProps, layout: { sections, build: buildLayout }, assignRules }
}

// ─── rollback journal ───

type RollbackEntry =
  | { kind: 'gridLayout', gridUid: string, before: { props: Record<string, unknown>, stepParams: Record<string, unknown> } }
  | { kind: 'assignRules', gridUid: string, before: unknown }
  | { kind: 'itemProps', uid: string, before: Record<string, unknown>, writtenKeys?: string[] }
  | { kind: 'fieldProps', uid: string, before: Record<string, unknown>, writtenKeys?: string[] }
  | { kind: 'dividerCreated', uid: string, gridUid: string }
  | { kind: 'submitAction', actionUid: string, formUid: string }
  | { kind: 'editAction', actionUid: string, columnUid: string }
  | { kind: 'deleteAction', actionUid: string, columnUid: string }

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

const counts = { layoutWritten: 0, itemProps: 0, fieldProps: 0, dividers: 0, assignRules: 0, submitActions: 0, editActions: 0, deleteActions: 0 }

async function healForm(token: string, snapshot: LiveSnapshot, plan: FormPlan, dryRun: boolean): Promise<string[]> {
  const log: string[] = []
  const tag = `${plan.collection}/${plan.formKind}[${plan.gridUid.slice(0, 6)}]`
  const journal: RollbackEntry[] = []
  void snapshot

  if (plan.formKind === 'create' && plan.submitMissing) {
    log.push(`  +FormSubmitAction (was missing — F-10' negative channel)`)
    if (!dryRun) {
      const actionUid = withW4b2Prefix('fs')
      await dataOf(token, 'POST', '/api/flowModels:save', {
        uid: actionUid, parentId: plan.formUid, subKey: 'actions', subType: 'array', sortIndex: 1,
        use: 'FormSubmitActionModel', props: { type: 'primary' },
        stepParams: { buttonSettings: { general: { title: '提交', type: 'primary' } } },
      })
      journal.push({ kind: 'submitAction', actionUid, formUid: plan.formUid })
      counts.submitActions++
    }
  }
  if (plan.itemProps.length > 0) {
    log.push(`  required +${plan.itemProps.length} (${plan.itemProps.map(entry => plan.items.find(item => item.uid === entry.uid)?.fieldPath ?? '?').join(',')})`)
    if (!dryRun) {
      for (const entry of plan.itemProps) {
        const item = plan.items.find(candidate => candidate.uid === entry.uid)
        journal.push({ kind: 'itemProps', uid: entry.uid, before: JSON.parse(JSON.stringify(item?.props ?? {})), writtenKeys: ['required', 'rules'] })
        await mergeNodeProps(token, entry.uid, entry.props)
      }
    }
  }
  if (plan.fieldProps.length > 0) {
    log.push(`  fieldProps +${plan.fieldProps.length} (${plan.fieldProps.map(entry => {
      const item = plan.items.find(candidate => candidate.fieldUid === entry.uid)
      return `${item?.fieldPath ?? '?'}:${Object.keys(entry.props).join('+')}`
    }).join(', ')})`)
    if (!dryRun) {
      for (const entry of plan.fieldProps) {
        const item = plan.items.find(candidate => candidate.fieldUid === entry.uid)
        journal.push({ kind: 'fieldProps', uid: entry.uid, before: JSON.parse(JSON.stringify(item?.fieldProps ?? {})), writtenKeys: Object.keys(entry.props) })
        await mergeNodeProps(token, entry.uid, entry.props)
      }
    }
  }

  const needsTree = plan.layout.build || plan.assignRules.length > 0
  const tree = needsTree && !dryRun ? await fetchTree(token, plan.gridUid) : null
  if (tree === null && plan.layout.build && !dryRun) {
    log.push(`  !! layout skipped: grid tree unavailable`)
  }

  if (plan.layout.build && tree !== null) {
    const existingDividers = new Map<string, string>()
    for (const node of (Array.isArray(tree?.subModels?.items) ? tree.subModels.items : [])) {
      if (node?.use === 'DividerItemModel' && typeof node.props?.label === 'string') {
        existingDividers.set(node.props.label, String(node.uid))
      }
    }
    const sections: Array<{ dividerUid?: string, itemUids: string[] }> = []
    const dividerPlan: Array<{ uid: string, label: string }> = []
    const dividerRepairs: Array<{ uid: string, label: string }> = []
    for (const section of plan.layout.sections) {
      if (section.itemUids.length === 0) continue
      const existing = existingDividers.get(section.label)
      const dividerUid = existing ?? withW4b2Prefix('dv')
      if (existing === undefined) dividerPlan.push({ uid: dividerUid, label: section.label })
      else {
        // the runtime materializes the title step's '{{t("Text")}}' default
        // over a bare props.label — the label must also persist in stepParams
        const node = (Array.isArray(tree?.subModels?.items) ? tree.subModels.items : [])
          .find(candidate => String(candidate?.uid ?? '') === existing)
        const persisted = node?.stepParams?.markdownItemSetting?.title?.label
        if (persisted !== section.label) dividerRepairs.push({ uid: existing, label: section.label })
      }
      sections.push({ dividerUid, itemUids: section.itemUids })
    }
    const { layout } = formTwoColumnLayout(sections)
    const currentLayout = (tree?.props?.layout ?? {}) as Record<string, unknown>
    const layoutChanged = JSON.stringify(currentLayout.rows ?? []) !== JSON.stringify(layout.rows)
      || String(currentLayout.rowGap ?? '') !== String(layout.rowGap)
    const dividerStepParams = (label: string) => ({ markdownItemSetting: { title: { label, orientation: 'left' } } })
    // the runtime materializes the title step's '{{t("Text")}}' default over a
    // bare props.label — the label must also persist in stepParams
    for (const repair of dividerRepairs) {
      await dataOf(token, 'POST', '/api/flowModels:save', {
        uid: repair.uid, parentId: plan.gridUid, subKey: 'items',
        props: { label: repair.label, orientation: 'left' },
        stepParams: dividerStepParams(repair.label),
      })
      log.push(`  divider label fix ${repair.label}`)
    }
    if (layoutChanged) {
      log.push(`  layout twoCol [${plan.layout.sections.filter(section => section.itemUids.length > 0).map(section => `${section.label}×${section.itemUids.length}`).join(' | ')}]`)
      journal.push({ kind: 'gridLayout', gridUid: plan.gridUid, before: { props: JSON.parse(JSON.stringify(tree?.props ?? {})), stepParams: JSON.parse(JSON.stringify(tree?.stepParams ?? {})) } })
      for (const divider of dividerPlan) {
        await dataOf(token, 'POST', '/api/flowModels:save', {
          uid: divider.uid, parentId: plan.gridUid, subKey: 'items', subType: 'array', sortIndex: 100 + dividerPlan.indexOf(divider),
          use: 'DividerItemModel', props: { label: divider.label, orientation: 'left' },
          stepParams: dividerStepParams(divider.label),
        })
        journal.push({ kind: 'dividerCreated', uid: divider.uid, gridUid: plan.gridUid })
        counts.dividers++
      }
      // flowModels:save replaces stepParams wholesale; keep formModelSettings
      // (assignRules) so an idempotent re-run that rewrites only the layout
      // cannot drop the defaults an earlier pass wrote.
      await dataOf(token, 'POST', '/api/flowModels:save', {
        uid: plan.gridUid,
        ...(tree?.parentId === undefined ? {} : { parentId: tree.parentId }),
        ...(tree?.subKey === undefined ? {} : { subKey: tree.subKey }),
        props: { ...JSON.parse(JSON.stringify(tree?.props ?? {})), layout },
        stepParams: {
          ...JSON.parse(JSON.stringify(tree?.stepParams ?? {})),
          gridSettings: { grid: { layout: { version: 2, rows: layout.rows } } },
        },
      })
      counts.layoutWritten++
    }
  }

  if (plan.assignRules.length > 0 && tree !== null) {
    const stepParams = (tree?.stepParams ?? {}) as Record<string, any>
    const before = stepParams.formModelSettings ?? undefined
    const existing = Array.isArray(before?.assignRules?.value) ? before.assignRules.value : []
    const pending = plan.assignRules.filter(rule => {
      const match = existing.find((entry: Record<string, unknown>) => entry.targetPath === rule.targetPath)
      return match === undefined || JSON.stringify(match.value) !== JSON.stringify(rule.value)
    })
    if (pending.length > 0) {
      log.push(`  assignRules +${pending.length} (${pending.map(rule => `${rule.targetPath}=${String(rule.value)}`).join(', ')})`)
      journal.push({ kind: 'assignRules', gridUid: plan.gridUid, before: before === undefined ? null : JSON.parse(JSON.stringify(before)) })
      await assignFormDefaults(token, plan.gridUid, pending)
      counts.assignRules++
    }
  }

  appendJournal(journal)
  if (!dryRun) { counts.itemProps += plan.itemProps.length; counts.fieldProps += plan.fieldProps.length }
  if (log.length > 0) log.unshift(`form ${tag}`)
  return log
}

// ─── platform format-field sweep (F-9' 全量): flat date field models outside ───
// ─── the 105 form grids (FilterForm inputs) carry the same format hint ───

const sweptFieldUids = new Set<string>()

async function sweepFormatFields(token: string, snapshot: LiveSnapshot, writtenFieldUids: ReadonlySet<string>, dryRun: boolean): Promise<string[]> {
  const log: string[] = []
  const journal: RollbackEntry[] = []
  for (const row of snapshot.models) {
    const use = String(row.use ?? '')
    const placeholder = use === 'DateOnlyFieldModel' ? 'YYYY-MM-DD'
      : use === 'DateTimeTzFieldModel' || use === 'DateTimeFieldModel' ? 'YYYY-MM-DD HH:mm'
      : null
    if (placeholder === null) continue
    const uid = String(row.uid ?? '')
    if (writtenFieldUids.has(uid)) continue
    if ((row.props ?? {}).placeholder === placeholder) continue
    log.push(`  ${use} ${uid.slice(0, 8)} <- ${placeholder}`)
    if (dryRun) continue
    journal.push({ kind: 'fieldProps', uid, before: JSON.parse(JSON.stringify(row.props ?? {})), writtenKeys: ['placeholder'] })
    sweptFieldUids.add(uid)
    await mergeNodeProps(token, uid, { placeholder })
    counts.fieldProps++
  }
  appendJournal(journal)
  return log
}

// ─── D5 whitelist Edit/Delete completion ───

/**
 * Free-state pages that gain Edit/Delete (B2 §2.6): hub_/crm_ minus the
 * read-only archive (hub_po_suppliers, D7), plus the five srm auxiliary
 * record collections the wfl_flow_configs registry does NOT govern
 * (certificates / audit checklists / score cards / audit records / capas —
 * D5's non-engine-governed principle; the srm master document itself stays
 * read-only with the engine verbs).
 */
export const EDIT_DELETE_WHITELIST = /^(hub_(?!po_suppliers)|crm_|srm_certificates|srm_audit_checklists|srm_score_cards|srm_audit_records|srm_capas)$/
/** Engine-governed document domains: UI Edit stays with the W3-B2 guarded actions; Delete never appears (D5). */
export const ENGINE_DOMAIN = /^(pur_|mfg_|so_|mps_|wms_|qm_|srm_)/

const RELATION_TYPES = new Set(['belongsTo', 'hasMany', 'belongsToMany', 'hasOne'])
const SYSTEM_FIELDS = new Set(['id', 'createdAt', 'updatedAt', 'sort'])

const editModelFor = (field: FieldMeta): string => {
  if (field.interface === 'select' || field.interface === 'radioGroup') return 'SelectFieldModel'
  switch (field.type) {
    case 'boolean': return 'CheckboxFieldModel'
    case 'float': case 'double': case 'integer': case 'bigInt': return 'NumberFieldModel'
    case 'date': case 'dateOnly': return 'DateOnlyFieldModel'
    default: return 'InputFieldModel'
  }
}

const editableFieldsOf = (snapshot: LiveSnapshot, collection: string): FieldMeta[] =>
  (snapshot.fieldsByCollection.get(collection) ?? [])
    .filter(field => !RELATION_TYPES.has(String(field.type)) && !SYSTEM_FIELDS.has(field.name) && field.name !== 'doc_status' && field.interface !== 'id')

/** Two-column edit popup subtree (Edit 表单同标准 F-1'/F-3'): the lib's editPageTreeFor shape with the B2 layout and required markers. */
function b2EditPageTree(actionUid: string, collection: string, template: FormTemplate, fields: ReadonlyArray<FieldMeta>): Record<string, unknown> {
  const ordered = [...fields].sort((a, b) => orderScore(a.name) - orderScore(b.name))
  const entries = ordered.map(field => {
    const required = requiredFor(collection, template, field.name)
    const { props, rules } = formItemExtras({ required })
    const options = (field.interface === 'select' || field.interface === 'radioGroup') && field.enumEntries.length > 0
      ? { allowClear: true, options: optionsForEnum(field.enumEntries) }
      : {}
    return {
      uid: withW4b2Prefix('efi'), field,
      item: {
        use: 'FormItemModel', subKey: 'items', subType: 'array',
        props: required ? { ...props, rules } : {},
        stepParams: { fieldSettings: { init: { dataSourceKey: 'main', collectionName: collection, fieldPath: field.name } } },
        subModels: {
          field: {
            uid: withW4b2Prefix('eff'), use: editModelFor(field), subKey: 'field', subType: 'object', sortIndex: 0,
            props: options,
          },
        },
      } as Record<string, unknown>,
    }
  })
  const half = Math.ceil(entries.length / 2)
  const { layout } = formTwoColumnLayout([
    { itemUids: entries.slice(0, half).map(entry => entry.uid) },
    { itemUids: entries.slice(half).map(entry => entry.uid) },
  ])
  const formUid = withW4b2Prefix('efm')
  entries.forEach((entry, index) => { entry.item.uid = entry.uid; entry.item.sortIndex = index + 1 })
  return {
    uid: withW4b2Prefix('ewp'), parentId: actionUid, subKey: 'page', subType: 'object', use: 'ChildPageModel', props: {},
    stepParams: { pageSettings: { general: { displayTitle: false, enableTabs: true } } },
    subModels: {
      tabs: [{
        use: 'ChildPageTabModel', subKey: 'tabs', subType: 'array', sortIndex: 0, props: {},
        stepParams: { pageTabSettings: { tab: { title: '编辑' } } },
        subModels: {
          grid: {
            use: 'BlockGridModel', subKey: 'grid', subType: 'object', sortIndex: 0, props: {}, filterManager: [],
            subModels: {
              items: [{
                uid: formUid, use: 'EditFormModel', subKey: 'items', subType: 'array', sortIndex: 1, props: {},
                stepParams: { resourceSettings: { init: { dataSourceKey: 'main', collectionName: collection, filterByTk: '{{ctx.view.inputArgs.filterByTk}}' } } },
                subModels: {
                  grid: {
                    use: 'FormGridModel', subKey: 'grid', subType: 'object', sortIndex: 0,
                    props: { layout },
                    stepParams: { gridSettings: { grid: { layout: { version: 2, rows: layout.rows } } } },
                    subModels: { items: entries.map(entry => entry.item) },
                  },
                  actions: [{
                    uid: withW4b2Prefix('efs'), parentId: formUid, subKey: 'actions', subType: 'array', sortIndex: 1,
                    use: 'FormSubmitActionModel', props: { type: 'primary' },
                    stepParams: { buttonSettings: { general: { title: '保存', type: 'primary' } } },
                  }],
                },
              }],
            },
          },
        },
      }],
    },
  }
}

async function saveB2EditAction(token: string, actionsColumnUid: string, collection: string, template: FormTemplate, fields: ReadonlyArray<FieldMeta>): Promise<string> {
  const actionUid = withW4b2Prefix('ea')
  await dataOf(token, 'POST', '/api/flowModels:save', {
    uid: actionUid, parentId: actionsColumnUid, subKey: 'actions', subType: 'array', sortIndex: 2,
    use: 'EditActionModel', props: { title: '编辑' },
    stepParams: {
      popupSettings: { openView: { mode: 'drawer', size: 'medium', pageModelClass: 'ChildPageModel', collectionName: collection, dataSourceKey: 'main', filterByTk: '{{ctx.record.id}}' } },
      buttonSettings: { general: { title: '编辑', type: 'link', icon: null, iconOnly: false } },
    },
    subModels: { page: b2EditPageTree(actionUid, collection, template, fields) },
  })
  return actionUid
}

type PageTree = { routeId: number, title: string, schemaUid: string, chain: string, tables: FlowModelRow[] }

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
    const tables: FlowModelRow[] = []
    for (const tab of snapshot.routes) {
      if (tab.type !== 'tabs' || tab.parentId !== route.id || tab.schemaUid == null) continue
      const stack = [...children(tab.schemaUid)]
      const seen = new Set<string>()
      while (stack.length > 0) {
        const row = stack.shift()!
        if (seen.has(row.uid)) continue
        seen.add(row.uid)
        if (row.use === 'TableBlockModel') tables.push(row)
        stack.push(...children(row.uid))
      }
    }
    trees.push({ routeId: route.id, title: route.title ?? '', schemaUid: route.schemaUid ?? '', chain: chain.join('/'), tables })
  }
  return trees
}

async function healEditDelete(token: string, snapshot: LiveSnapshot, pages: PageTree[], dryRun: boolean): Promise<string[]> {
  const log: string[] = []
  const byParent = new Map<string, FlowModelRow[]>()
  for (const row of snapshot.models) {
    const parent = String(row.parentId ?? '')
    if (parent === '') continue
    if (!byParent.has(parent)) byParent.set(parent, [])
    byParent.get(parent)!.push(row)
  }
  const childrenOf = (uid: string): FlowModelRow[] => byParent.get(uid) ?? []
  for (const page of pages) {
    for (const table of page.tables) {
      const collection = String(table?.stepParams?.resourceSettings?.init?.collectionName ?? '')
      if (!EDIT_DELETE_WHITELIST.test(collection)) continue
      const columns = childrenOf(table.uid).filter(child => child.use === 'TableActionsColumnModel')
      if (columns.length === 0) continue
      const column = columns[0]
      const actions = childrenOf(String(column.uid)).filter(child => child.subKey === 'actions')
      const hasEdit = actions.some(action => action.use === 'EditActionModel')
      const hasDelete = actions.some(action => action.use === 'DeleteActionModel')
      if (hasEdit && hasDelete) continue
      const fields = editableFieldsOf(snapshot, collection)
      if (fields.length === 0) continue
      log.push(`page ${page.chain}/${page.title} ${collection}${hasEdit ? '' : ' +Edit(2col,required)'}${hasDelete ? '' : ' +Delete(confirm)'}`)
      if (dryRun) continue
      const journal: RollbackEntry[] = []
      if (!hasEdit) {
        const actionUid = await saveB2EditAction(token, String(column.uid), collection, templateFor(collection), fields)
        journal.push({ kind: 'editAction', actionUid, columnUid: String(column.uid) })
        counts.editActions++
      }
      if (!hasDelete) {
        const actionUid = await saveRowDeleteAction(token, String(column.uid), '删除', withW4b2Prefix)
        journal.push({ kind: 'deleteAction', actionUid, columnUid: String(column.uid) })
        counts.deleteActions++
      }
      appendJournal(journal)
    }
  }
  return log
}

// ─── rollback ───

async function rollback(token: string, formPlans: FormPlan[], editDeleteScope: { columnUids: Set<string> }): Promise<string[]> {
  const log: string[] = []
  const journal = loadJournal()
  const gridUids = new Set(formPlans.map(plan => plan.gridUid))
  const planItemUids = new Set(formPlans.flatMap(plan => plan.items.map(item => item.uid)))
  const planFieldUids = new Set([...formPlans.flatMap(plan => plan.items.map(item => item.fieldUid ?? '')), ...sweptFieldUids])
  const undone: RollbackEntry[] = []
  for (let index = journal.length - 1; index >= 0; index--) {
    const entry = journal[index]
    if (entry.kind === 'assignRules') {
      if (!gridUids.has(entry.gridUid)) { undone.push(entry); continue }
      await dataOf(token, 'POST', '/api/flowModels:save', {
        uid: entry.gridUid,
        stepParams: { formModelSettings: entry.before ?? { assignRules: { value: [] } } },
      })
      log.push(`rollback assignRules ${entry.gridUid.slice(0, 8)}`)
    } else if (entry.kind === 'gridLayout') {
      if (!gridUids.has(entry.gridUid)) { undone.push(entry); continue }
      const current = await dataOf(token, 'GET', `/api/flowSurfaces:get?uid=${encodeURIComponent(entry.gridUid)}`)
      const row = current?.tree ?? {}
      await dataOf(token, 'POST', '/api/flowModels:save', {
        uid: entry.gridUid,
        ...(row.parentId === undefined ? {} : { parentId: row.parentId }),
        ...(row.subKey === undefined ? {} : { subKey: row.subKey }),
        props: entry.before.props,
        stepParams: entry.before.stepParams,
      })
      log.push(`rollback grid layout ${entry.gridUid.slice(0, 8)}`)
    } else if (entry.kind === 'itemProps' || entry.kind === 'fieldProps') {
      if (!planItemUids.has(entry.uid) && !planFieldUids.has(entry.uid)) { undone.push(entry); continue }
      const cleared = Object.fromEntries((entry.writtenKeys ?? []).filter(key => !(key in entry.before)).map(key => [key, key === 'rules' || key === 'options' ? [] : null]))
      await mergeNodeProps(token, entry.uid, { ...entry.before, ...cleared })
      log.push(`rollback props ${entry.uid.slice(0, 8)}`)
    } else if (entry.kind === 'dividerCreated') {
      if (!gridUids.has(entry.gridUid)) { undone.push(entry); continue }
      await call(token, 'POST', `/api/flowModels:destroy?filterByTk=${encodeURIComponent(entry.uid)}`)
      log.push(`rollback divider ${entry.uid.slice(0, 8)}`)
    } else if (entry.kind === 'submitAction') {
      if (!formPlans.some(plan => plan.formUid === entry.formUid)) { undone.push(entry); continue }
      await call(token, 'POST', `/api/flowModels:destroy?filterByTk=${encodeURIComponent(entry.actionUid)}`)
      log.push(`rollback submitAction ${entry.actionUid.slice(0, 8)}`)
    } else if (entry.kind === 'editAction' || entry.kind === 'deleteAction') {
      if (!editDeleteScope.columnUids.has(entry.columnUid)) { undone.push(entry); continue }
      await call(token, 'POST', `/api/flowModels:destroy?filterByTk=${encodeURIComponent(entry.actionUid)}`)
      log.push(`rollback ${entry.kind} ${entry.actionUid.slice(0, 8)}`)
    }
  }
  writeFileSync(ROLLBACK_PATH, `${JSON.stringify(undone, null, 2)}\n`)
  return log
}

// ─── B2 assert (live probe: single-column / required / placeholder / assignRules / Edit coverage / engine read-only) ───

async function assertForms(token: string): Promise<void> {
  const snapshot = await loadSnapshot(token)
  const byUid = new Map(snapshot.models.map(row => [row.uid, row]))
  const failures: string[] = []

  let grids = 0, singleColEligible = 0, requiredCount = 0, assignRuleGrids = 0
  const configExempt = new Set<string>()
  for (const grid of snapshot.models.filter(row => row.use === 'FormGridModel')) {
    grids++
    const layout = grid?.props?.layout ?? grid?.stepParams?.gridSettings?.grid?.layout ?? {}
    const rows: any[] = layout.rows ?? []
    const refs = rows.flatMap(row => (row.cells ?? []).flatMap((cell: any) => cell.items ?? []).map(String))
    const items = refs.map(uid => byUid.get(uid)).filter(row => row?.use === 'FormItemModel')
    const collections = [...new Set(items.map(item => item?.stepParams?.fieldSettings?.init?.collectionName).filter(Boolean))] as string[]
    const collection = collections[0] ?? ''
    const template = templateFor(collection)
    const allSingle = rows.length > 0 && rows.every(row => Array.isArray(row.sizes) && row.sizes.length === 1 && row.sizes[0] === 24)
    if (template !== 'config' && items.length >= 4 && allSingle) singleColEligible++
    if (template === 'config') configExempt.add(collection)
    for (const item of items) requiredCount += item?.props?.required === true ? 1 : 0
    if (Array.isArray(grid?.stepParams?.formModelSettings?.assignRules?.value) && grid.stepParams.formModelSettings.assignRules.value.length > 0) assignRuleGrids++
  }

  // placeholder coverage over form field models — the audit-probe semantics
  // (all non-Display *FieldModel rows; the flat list carries no parent edges)
  let placeholderCount = 0
  for (const row of snapshot.models) {
    const use = String(row.use ?? '')
    if (!use.endsWith('FieldModel') || use.startsWith('Display')) continue
    const placeholder = (row.props ?? {}).placeholder
    if (typeof placeholder === 'string' ? placeholder !== '' : placeholder != null) placeholderCount++
  }

  // Edit coverage + engine read-only evidence
  const trees = buildPageTrees(snapshot)
  const byParent = new Map<string, FlowModelRow[]>()
  for (const row of snapshot.models) {
    const parent = String(row.parentId ?? '')
    if (parent === '') continue
    if (!byParent.has(parent)) byParent.set(parent, [])
    byParent.get(parent)!.push(row)
  }
  let pagesWithEdit = 0
  const engineViolations: string[] = []
  for (const page of trees) {
    if (page.tables.length === 0) continue
    let pageEdit = false
    for (const table of page.tables) {
      const collection = String(table?.stepParams?.resourceSettings?.init?.collectionName ?? '')
      for (const column of byParent.get(table.uid) ?? []) {
        if (column.use !== 'TableActionsColumnModel') continue
        for (const action of byParent.get(String(column.uid)) ?? []) {
          if (action.subKey !== 'actions') continue
          if (action.use === 'EditActionModel') pageEdit = true
          if (ENGINE_DOMAIN.test(collection) && !EDIT_DELETE_WHITELIST.test(collection) && String(action.uid).startsWith('w4b2')) {
            engineViolations.push(`${collection} edit ${action.uid.slice(0, 10)}`)
          }
          if (action.use === 'DeleteActionModel' && ENGINE_DOMAIN.test(collection) && !EDIT_DELETE_WHITELIST.test(collection)) {
            engineViolations.push(`${collection} delete ${action.uid.slice(0, 10)}`)
          }
        }
      }
    }
    if (pageEdit) pagesWithEdit++
  }

  const report = [
    `grids=${grids}`, `singleColEligible=${singleColEligible}`, `required=${requiredCount}`,
    `placeholder=${placeholderCount}`, `assignRuleGrids=${assignRuleGrids}`, `pagesWithEdit=${pagesWithEdit}`,
    `configExempt=${configExempt.size}`,
  ]
  console.log(`w4-b2 assert: ${report.join(' ')}`)
  if (singleColEligible !== 0) failures.push(`L1/L2 表单单列未清零: ${singleColEligible} 个 ≥4 字段表单仍单列`)
  if (requiredCount < 260) failures.push(`必填字段数 ${requiredCount} < 260`)
  if (placeholderCount < 200) failures.push(`placeholder 覆盖 ${placeholderCount} < 200`)
  if (assignRuleGrids < 60) failures.push(`assignRules 表单 ${assignRuleGrids} < 60`)
  if (pagesWithEdit < 44) failures.push(`EditAction 覆盖页 ${pagesWithEdit} < 44`)
  if (engineViolations.length > 0) failures.push(`引擎域 UI 开口子: ${engineViolations.slice(0, 5).join(', ')}`)
  if (failures.length > 0) {
    console.error(`w4-b2 assert: FAILED\n  - ${failures.join('\n  - ')}`)
    process.exitCode = 1
  } else {
    console.log('w4-b2 assert: OK — 表单标准五指标达标 + 引擎域只读')
  }
  writeFileSync(`${RESEARCH_DIR}w4-b2-probe-after.json`, `${JSON.stringify({ generatedAt: new Date().toISOString(), grids, singleColEligible, requiredCount, placeholderCount, assignRuleGrids, pagesWithEdit, configExempt: [...configExempt].sort() }, null, 2)}\n`)
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
  if (args.length === 0 || (!dryRun && !pilot && !all && domain === undefined && !doRollback && !doAssert)) {
    console.error('usage: w4-heal-b2.mts --dry-run|--pilot|--domain <name>|--all [--rollback] [--assert]')
    process.exitCode = 2
    return
  }
  const token = await signInWithRetry()
  if (doAssert) {
    await assertForms(token)
    return
  }
  const snapshot = await loadSnapshot(token)
  const formContextCache = new Map<string, FormContext>()

  const inScope = (collection: string): boolean => {
    if (pilot) return collection === 'srm_suppliers' || collection === 'pur_orders'
    if (domain !== undefined) return DOMAIN_MATCHERS[domain].test(collection)
    return true
  }

  const plans: FormPlan[] = []
  for (const grid of snapshot.models.filter(row => row.use === 'FormGridModel')) {
    const tree = await fetchTree(token, String(grid.uid))
    if (tree === null || tree?.use !== 'FormGridModel') continue
    const items = treeItemsOf(tree)
    if (items.length === 0) continue
    const collections = [...new Set(items.map(item => item.collection).filter(name => name !== ''))]
    if (collections.length === 0) continue
    const collection = collections[0]
    if (!inScope(collection)) continue
    const context = await formContextOf(token, tree, formContextCache)
    plans.push(planForm(snapshot, String(grid.uid), collection, context.kind, items, context.formUid, !context.hasSubmit))
  }

  const trees = buildPageTrees(snapshot)
  const selectedPages = pilot
    ? trees.filter(page => page.tables.some(table => ['srm_suppliers', 'pur_orders'].includes(String(table?.stepParams?.resourceSettings?.init?.collectionName ?? ''))))
    : domain !== undefined
      ? trees.filter(page => page.tables.some(table => DOMAIN_MATCHERS[domain].test(String(table?.stepParams?.resourceSettings?.init?.collectionName ?? ''))))
      : trees

  const targetLabel = pilot ? 'pilot' : domain ?? (all ? 'all' : 'selection')
  if (doRollback) {
    const columnUids = new Set<string>()
    for (const page of selectedPages) {
      for (const table of page.tables) {
        for (const child of snapshot.models.filter(row => String(row.parentId ?? '') === table.uid && row.use === 'TableActionsColumnModel')) {
          columnUids.add(String(child.uid))
        }
      }
    }
    const log = await rollback(token, plans, { columnUids })
    console.log(log.length > 0 ? log.join('\n') : 'nothing to roll back for this selection')
    return
  }

  const runLog: string[] = [`# w4-b2 heal ${dryRun ? 'dry-run' : 'run'} ${targetLabel} @ ${new Date().toISOString()}`]
  const writtenFieldUids = new Set<string>()
  for (const plan of plans) {
    const log = await healForm(token, snapshot, plan, dryRun)
    if (log.length > 0) runLog.push(...log)
    for (const entry of plan.fieldProps) writtenFieldUids.add(entry.uid)
  }
  const sweepLog = await sweepFormatFields(token, snapshot, writtenFieldUids, dryRun)
  if (sweepLog.length > 0) runLog.push(`format sweep (non-form date fields)`, ...sweepLog)
  runLog.push(...await healEditDelete(token, snapshot, selectedPages, dryRun))
  if (!dryRun) {
    runLog.push(`counts: ${JSON.stringify(counts)}`)
  } else {
    let requiredPlanned = 0, assignPlanned = 0, layoutPlanned = 0, fieldPropsPlanned = 0
    const kindTally = new Map<string, number>()
    for (const plan of plans) {
      requiredPlanned += plan.itemProps.length
      fieldPropsPlanned += plan.fieldProps.length
      assignPlanned += plan.assignRules.length > 0 ? 1 : 0
      layoutPlanned += plan.layout.build ? 1 : 0
      kindTally.set(plan.formKind, (kindTally.get(plan.formKind) ?? 0) + 1)
    }
    const noRuleCreates = plans.filter(plan => plan.formKind === 'create' && plan.assignRules.length === 0)
    if (noRuleCreates.length > 0) {
      runLog.push(`creates without assignRules (${noRuleCreates.length}): ${noRuleCreates.map(plan => `${plan.collection}{${plan.items.map(item => item.fieldPath).join(',')}}`).join(' ; ')}`)
    }
    runLog.push(`form kinds: ${JSON.stringify([...kindTally.entries()])}`)
    runLog.push(`dry-run ${targetLabel}: forms=${plans.length} layoutTwoCol=${layoutPlanned} required+=${requiredPlanned} fieldProps+=${fieldPropsPlanned} assignRules=${assignPlanned}`)
  }
  const out = runLog.join('\n')
  console.log(out)
  writeFileSync(`${RESEARCH_DIR}w4-b2-heal-${dryRun ? 'dryrun' : 'run'}-${targetLabel}.txt`, `${out}\n`)
}

void main().catch(error => {
  console.error(error)
  process.exit(1)
})
