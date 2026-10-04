/**
 * W7-B1 list-page heal for the core-document domains (sales 9 + procurement 8
 * + CRM 5): the STATUS_PALETTE v3 recolor (semantic five states, the
 * design-language.md §2 base table — payment methods demoted to neutral,
 * qualified ≠ preferred split), money/qty/date column governance (right
 * align + thousand grouping + ¥ prefix + unified date formats), bare-text
 * numeric columns swapped to the number display model, and the legacy w4b3
 * stat cards regenerated through the upgraded statCardRaw (28/600/#1F2630
 * figure, 60%-size unit, secondary label — no #1d4ed8 residue).
 *
 * Column-, block-level walk over flowModels with collection-name scoping;
 * idempotent; every mutation journals its before-state first (w5b6-heal
 * pattern, journal replayed in reverse on --rollback).
 *
 * Usage:
 *   node --import tsx/esm examples/kb-agent/scripts/w7b1-heal.mts --dry-run
 *   node --import tsx/esm examples/kb-agent/scripts/w7b1-heal.mts --apply
 *   node --import tsx/esm examples/kb-agent/scripts/w7b1-heal.mts --assert
 *   node --import tsx/esm examples/kb-agent/scripts/w7b1-heal.mts --rollback
 */
import { readFileSync, writeFileSync } from 'node:fs'
import {
  dataOf, listFlowModels, mergeNodeProps, signInWithRetry, statCardRaw,
  type FlowModelRow, type StatusColumnOption,
} from './nocobase-flow-page-lib.mts'

const RESEARCH_DIR = new URL('../../../research/2026-10-03-w7-rework/b1/', import.meta.url).pathname
const ROLLBACK_PATH = `${RESEARCH_DIR}w7-b1-heal-rollback.json`

// ─── STATUS_PALETTE v3 (design-language.md §2 — the B1 recolor base table) ───

/**
 * value → [label, antd preset color]. The preset names render as the W7
 * semantic soft pairs through the layer-2 globalStyle overrides
 * (green→Positive #256F3A/#F5FAE5, orange→Critical #E76500/#FFF8D6,
 * red→Negative #AA0808/#FFEAF4, default→Neutral #788FA6/#EFF1F2,
 * blue→Informational #0070F2/#E1F4FF, cyan→execution-complete
 * #0E7490/#E0F5F7; purple is retired → Neutral). v3 deltas vs the W5 v2:
 * started moves orange→blue (execution is informational, orange stays for
 * attention states), payment methods are neutral metadata (never share the
 * status palette), and the supply-chain grades split qualified/preferred and
 * enhanced/restricted.
 */
export const STATUS_PALETTE: Readonly<Record<string, [string, string]>> = {
  // 审批维度
  draft: ['草稿', 'default'], pending: ['待处理', 'orange'], pending_level2: ['二级审批中', 'blue'],
  submitted: ['已提交', 'blue'], approved: ['已生效', 'green'], rejected: ['已驳回', 'red'],
  void: ['已作废', 'default'],
  // 执行维度
  planned: ['已计划', 'blue'], released: ['已下达', 'blue'], in_progress: ['执行中', 'blue'],
  started: ['已开工', 'blue'], processing: ['处理中', 'blue'], waiting: ['等待中', 'orange'],
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
  // 供应链准入族（合格≠优选、加严≠受限）
  qualified: ['合格', 'green'], preferred: ['优选', 'blue'], restricted: ['受限', 'red'],
  enhanced: ['加严', 'orange'], potential: ['潜在', 'default'], reviewing: ['准入评审中', 'blue'],
  standard: ['标准', 'default'],
  // 客户等级（价值分级：管理动作语义，非状态彩虹）
  A: ['A级', 'green'], B: ['B级', 'blue'], C: ['C级', 'orange'], D: ['D级', 'default'],
  // 支付方式/中性元数据（leg03 修复：不与回款状态争色）
  bank_transfer: ['银行转账', 'default'], cash: ['现金', 'default'], cheque: ['支票', 'default'],
  acceptance: ['承兑', 'default'], wire: ['电汇', 'default'], alipay: ['支付宝', 'default'],
  wechat: ['微信', 'default'], other: ['其他', 'default'],
  // 线索阶段（leg02：裸 antd 预设无业务语义 → 五态映射）
  contacted: ['已联系', 'blue'], requirements_confirmed: ['需求确认', 'blue'],
  proposal: ['方案报价', 'blue'], negotiation: ['商务谈判', 'orange'],
  won: ['赢单', 'green'], lost: ['输单', 'red'],
  // 报价/订单/回款/发票（B1 域补值）
  sent: ['已发送', 'blue'], accepted: ['已接受', 'green'], pending_approval: ['待审批', 'orange'],
  fulfilled: ['已履约', 'green'], received: ['已收货', 'green'], issued: ['已开具', 'blue'],
  // 客户类型/状态（leg01：三种同亮度霓虹 → 分类中性化 + 状态五态）
  enterprise: ['企业客户', 'blue'], trader: ['贸易商', 'cyan'], factory: ['工厂', 'default'],
  prospect: ['潜在', 'default'], churned: ['流失', 'red'],
  // 产品类别/定价模式（中性元数据）
  fixed: ['固定报价', 'default'], times: ['按次', 'default'], subscription: ['订阅', 'default'],
  compliance: ['合规服务', 'default'], logistics: ['物流', 'default'], channel: ['渠道', 'default'],
  brand: ['品牌', 'default'], data: ['数据', 'default'], ops: ['运营', 'default'],
  // 支付方式补值（中性）
  letter_of_credit: ['信用证', 'default'], acceptance_bill: ['承兑汇票', 'default'],
  bank: ['银行转账', 'default'], bill: ['票据', 'default'],
  // 采购履约/财务风险（leg10：未收货/未开票不得同灰）
  none: ['未收货', 'orange'], no_invoice: ['未开票', 'orange'], to_invoice: ['待开票', 'orange'],
  invoiced: ['已开票', 'green'], matched: ['已匹配', 'green'], exception: ['异常', 'red'],
  // 销售发运
  shipped: ['已发运', 'blue'],
  // 维保英文残留值中文化（W4-B1 §2.6 继承）
  Preventive: ['预防性', 'blue'], Corrective: ['纠正性', 'orange'], Inspection: ['点检', 'cyan'],
  Scheduled: ['已排程', 'blue'], 'In progress': ['进行中', 'blue'], Done: ['已完成', 'green'],
}

const v3For = (value: string): [string, string] | undefined => STATUS_PALETTE[value]

const optionV3Ok = (options: Array<Record<string, unknown>>): boolean => {
  for (const option of options) {
    const hit = v3For(String(option.value ?? ''))
    if (hit === undefined) continue
    if (option.label !== hit[0] || option.color !== hit[1]) return false
  }
  return true
}

/** Options rewritten to v3 where covered; unknown values keep their current entry (dry-run lists them). */
export function recolorOptions(current: ReadonlyArray<Record<string, unknown>>): { options: StatusColumnOption[], changed: boolean } {
  const options = current.map(entry => {
    const value = String(entry.value ?? '')
    const hit = v3For(value)
    if (hit === undefined) return { ...entry } as StatusColumnOption
    const [label, color] = hit
    if (entry.label === label && entry.color === color) return { ...entry } as StatusColumnOption
    return { ...entry, label, color } as StatusColumnOption
  })
  const changed = options.some((option, index) => JSON.stringify(option) !== JSON.stringify(current[index] ?? null))
  return { options, changed }
}

// ─── domain scoping: the B1 collections are crm_* (legacy sales ledgers + CRM
// masters), so_* (W7 MRP sales orders), pur_* (procurement) ───

const B1_COLLECTION = /^(crm_|so_|pur_)/

// ─── column-kind detection ───

const MONEY_FIELD = /(amount|price|total|value|cost|fee|budget|balance|payable|receivable|money)/
const QTY_FIELD = /(qty|quantity|count|weight|stock|lead_time|score|points)/

type NumberKind = 'money' | 'qty' | 'plain'

const numberKindOf = (fieldPath: string): NumberKind => {
  if (MONEY_FIELD.test(fieldPath)) return 'money'
  if (QTY_FIELD.test(fieldPath)) return 'qty'
  return 'plain'
}

const numberPropsFor = (kind: NumberKind): Record<string, unknown> =>
  kind === 'money' ? { separator: '0,0.00', numberStep: 2, addonBefore: '¥' }
    : kind === 'qty' ? { separator: '0,0' }
      : { separator: '0,0.00', numberStep: 2 }

// ─── field metadata (interface + enum options, the collection-scoped channel) ───

type FieldMeta = { name: string, interface: string | null, options: Array<Record<string, unknown>> | null }

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
      const enumOptions = Array.isArray(row.uiSchema?.enum)
        ? row.uiSchema.enum as Array<Record<string, unknown>>
        : Array.isArray(row.options) ? row.options as Array<Record<string, unknown>> : null
      map.get(collection)!.push({ name: row.name, interface: row.interface ?? null, options: enumOptions })
    }
    if (map.size > 0) return map
  }
  throw new Error('no collection-scoped field channel returned rows')
}

// ─── rollback journal ───

type RollbackEntry =
  | { kind: 'fieldOptions', fieldUid: string, before: Record<string, unknown> }
  | { kind: 'columnAlign', columnUid: string, before: Record<string, unknown> }
  | { kind: 'columnOptions', columnUid: string, before: Record<string, unknown> }
  | { kind: 'selectOptions', fieldUid: string, before: Record<string, unknown> }
  | { kind: 'enumSwap' | 'numberSwap', fieldUid: string, beforeUse: string, before: Record<string, unknown> }
  | { kind: 'numberProps', fieldUid: string, before: Record<string, unknown> }
  | { kind: 'dateProps', fieldUid: string, before: Record<string, unknown> }
  | { kind: 'statcardRegen', blockUid: string, beforeRaw: string }

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

// ─── legacy statcard raw parsing (regen inputs from a w4b3 raw string) ───

type StatcardSpec = { alias: string, title: string, footnote: string, unitPrefix: string, unitSuffix: string, decimals: number }

function parseStatcard(raw: string): StatcardSpec | null {
  const alias = /\)\['([^']+)'\]/.exec(raw)?.[1]
  const texts = [...raw.matchAll(/text: ("(?:[^"\\]|\\.)*")/g)].map(m => JSON.parse(m[1]) as string)
  const title = texts[0]
  const footnote = texts[texts.length - 1]
  const units = /const text = '(.*?)' \+ num \+ '(.*?)';/.exec(raw)
  const decimals = Number(/maximumFractionDigits: (\d+)/.exec(raw)?.[1] ?? 2)
  if (alias === undefined || title === undefined || footnote === undefined || texts.length < 2) return null
  return { alias, title, footnote, unitPrefix: units?.[1] ?? '', unitSuffix: units?.[2] ?? '', decimals }
}

const chartRawOf = (row: FlowModelRow): string =>
  String(((row.stepParams ?? {}) as Record<string, any>)?.chartSettings?.configure?.chart?.option?.raw ?? '')

const withChartRaw = (row: FlowModelRow, raw: string): Record<string, unknown> => {
  const stepParams = JSON.parse(JSON.stringify((row.stepParams ?? {}) as Record<string, unknown>))
  const chartSettings = (stepParams.chartSettings ?? {}) as Record<string, any>
  const configure = (chartSettings.configure ?? {}) as Record<string, any>
  const chart = (configure.chart ?? {}) as Record<string, any>
  const option = (chart.option ?? {}) as Record<string, any>
  option.raw = raw
  chart.option = option
  configure.chart = chart
  chartSettings.configure = configure
  stepParams.chartSettings = chartSettings
  return stepParams
}

// ─── the heal walk ───

export type HealCounts = { recolor: number, enumSwap: number, numberSwap: number, numberProps: number, alignRight: number, alignLeft: number, dateProps: number, statcardRegen: number, columnOptions: number, selectOptions: number }

type ColumnSpec = { columnRow: FlowModelRow, fieldRow: FlowModelRow, fieldPath: string, collection: string, actions: string[], kind: NumberKind | null }

async function runHeal(token: string, models: FlowModelRow[], fields: Map<string, FieldMeta[]>, dryRun: boolean): Promise<{ log: string[], counts: HealCounts, unknownEnums: string[] }> {
  const byUid = new Map(models.map(row => [String(row.uid), row]))
  const childrenOf = (uid: string): FlowModelRow[] => models.filter(row => String(row.parentId ?? '') === uid)
  const log: string[] = []
  const counts: HealCounts = { recolor: 0, enumSwap: 0, numberSwap: 0, numberProps: 0, alignRight: 0, alignLeft: 0, dateProps: 0, statcardRegen: 0, columnOptions: 0, selectOptions: 0 }
  const unknownEnums: string[] = []

  // scope a mutation to B1 collections by the owning column's field model
  const collectionOf = (columnRow: FlowModelRow, fieldRow: FlowModelRow): string =>
    String(fieldRow?.stepParams?.fieldSettings?.init?.collectionName
      ?? columnRow?.stepParams?.fieldSettings?.init?.collectionName ?? '')
  const inScope = (collection: string): boolean => collection === '' ? false : B1_COLLECTION.test(collection)

  /** A form/filter SelectFieldModel carries no collectionName of its own — walk the ancestor chain to the nearest owner (form grid / filter form / popup). */
  const ancestorCollectionOf = (uid: string): string => {
    let cursor = byUid.get(uid)
    while (cursor !== undefined) {
      const candidate = (cursor?.stepParams as Record<string, any> | undefined)
      const fromResource = candidate?.resourceSettings?.init?.collectionName
      const fromField = candidate?.fieldSettings?.init?.collectionName
      if (typeof fromResource === 'string' && fromResource !== '') return fromResource
      if (typeof fromField === 'string' && fromField !== '') return fromField
      const parentId = String(cursor.parentId ?? '')
      cursor = parentId === '' ? undefined : byUid.get(parentId)
    }
    return ''
  }

  const columns: ColumnSpec[] = []
  for (const columnRow of models) {
    if (columnRow?.use !== 'TableColumnModel') continue
    const fieldRow = childrenOf(String(columnRow.uid)).find(row => row.subKey === 'field')
    if (fieldRow === undefined) continue
    const fieldPath = String(columnRow?.stepParams?.fieldSettings?.init?.fieldPath ?? '')
    const collection = collectionOf(columnRow, fieldRow)
    if (!inScope(collection)) continue
    const use = String(fieldRow.use ?? '')
    const props = (fieldRow.props ?? {}) as Record<string, unknown>
    const meta = fields.get(collection)?.find(field => field.name === fieldPath)
    const actions: string[] = []
    let kind: NumberKind | null = null
    if (use === 'DisplayEnumFieldModel' && Array.isArray(props.options)) {
      actions.push('recolor')
      if (columnRow.props?.align !== 'left') actions.push('alignLeft')
      for (const option of props.options as Array<Record<string, unknown>>) {
        if (v3For(String(option.value ?? '')) === undefined) unknownEnums.push(`${collection}.${fieldPath}=${String(option.value ?? '')}`)
      }
    }
    if (use === 'DisplayTextFieldModel') {
      if (meta?.interface === 'select') actions.push('enumSwap')
      else if (meta?.interface === 'number' && !(fieldPath === 'id' || /_id$/.test(fieldPath))) {
        actions.push('numberSwap')
        kind = numberKindOf(fieldPath)
      }
    }
    if (use === 'DisplayNumberFieldModel' && !(fieldPath === 'id' || /_id$/.test(fieldPath))) {
      kind = numberKindOf(fieldPath)
      const want = numberPropsFor(kind)
      const missing = Object.entries(want).some(([key, value]) => JSON.stringify(props[key]) !== JSON.stringify(value))
      if (missing) actions.push('numberProps')
      if (columnRow.props?.align !== 'right') actions.push('alignRight')
    }
    if (use === 'DisplayDateTimeFieldModel') {
      actions.push('dateProps')
      if (columnRow.props?.align !== 'right') actions.push('alignRight')
    }
    if (actions.length === 0) continue
    columns.push({ columnRow, fieldRow, fieldPath, collection, actions, kind })
  }

  for (const { columnRow, fieldRow, fieldPath, collection, actions, kind } of columns) {
    const journal: RollbackEntry[] = []
    const save = async (patch: Record<string, unknown>): Promise<void> => {
      await dataOf(token, 'POST', '/api/flowModels:save', {
        uid: fieldRow.uid, parentId: fieldRow.parentId, subKey: fieldRow.subKey, ...patch,
      })
    }
    if (actions.includes('enumSwap')) {
      const meta = fields.get(collection)?.find(field => field.name === fieldPath)
      if (meta?.options == null || meta.options.length === 0) throw new Error(`enumSwap ${collection}.${fieldPath} 无字段选项——拒绝盲换`)
      const options = meta.options.map(entry => {
        const hit = v3For(String(entry.value ?? ''))
        return hit === undefined
          ? { label: String(entry.label ?? entry.value ?? ''), color: 'default', value: entry.value }
          : { label: hit[0], color: hit[1], value: entry.value }
      })
      counts.enumSwap++
      log.push(`  enumSwap ${collection}.${fieldPath}（${options.length} 项 v3 选项）`)
      if (!dryRun) {
        journal.push({ kind: 'enumSwap', fieldUid: String(fieldRow.uid), beforeUse: String(fieldRow.use ?? ''), before: JSON.parse(JSON.stringify(fieldRow.props ?? {})) })
        await save({ use: 'DisplayEnumFieldModel', props: { options } })
      }
    }
    if (actions.includes('numberSwap')) {
      counts.numberSwap++
      log.push(`  numberSwap ${collection}.${fieldPath} → DisplayNumberFieldModel（${kind}）`)
      if (!dryRun) {
        journal.push({ kind: 'numberSwap', fieldUid: String(fieldRow.uid), beforeUse: String(fieldRow.use ?? ''), before: JSON.parse(JSON.stringify(fieldRow.props ?? {})) })
        await save({ use: 'DisplayNumberFieldModel', props: numberPropsFor(kind ?? 'plain') })
      }
    }
    if (actions.includes('recolor')) {
      const current = (fieldRow.props ?? {}).options as Array<Record<string, unknown>>
      const { options, changed } = recolorOptions(current)
      if (changed) {
        counts.recolor++
        log.push(`  recolor ${collection}.${fieldPath}`)
        if (!dryRun) {
          journal.push({ kind: 'fieldOptions', fieldUid: String(fieldRow.uid), before: JSON.parse(JSON.stringify(fieldRow.props ?? {})) })
          await save({ props: { ...fieldRow.props, options } })
        }
      }
    }
    if (actions.includes('numberProps') && kind !== null) {
      counts.numberProps++
      log.push(`  numberProps ${collection}.${fieldPath}（${kind} 千分位）`)
      if (!dryRun) {
        journal.push({ kind: 'numberProps', fieldUid: String(fieldRow.uid), before: JSON.parse(JSON.stringify(fieldRow.props ?? {})) })
        await save({ props: { ...fieldRow.props, ...numberPropsFor(kind) } })
      }
    }
    if (actions.includes('dateProps')) {
      const meta = fields.get(collection)?.find(field => field.name === fieldPath)
      const format = meta?.interface === 'date' ? 'YYYY-MM-DD' : meta?.interface === 'datetime' ? 'YYYY-MM-DD HH:mm' : null
      const currentFormat = (fieldRow.props ?? {}).format
      if (format !== null && currentFormat !== format) {
        counts.dateProps++
        log.push(`  dateProps ${collection}.${fieldPath}（${format}）`)
        if (!dryRun) {
          journal.push({ kind: 'dateProps', fieldUid: String(fieldRow.uid), before: JSON.parse(JSON.stringify(fieldRow.props ?? {})) })
          await save({ props: { ...fieldRow.props, format } })
        }
      }
    }
    if (actions.includes('alignRight') && columnRow.props?.align !== 'right') {
      counts.alignRight++
      log.push(`  align→right ${collection}.${fieldPath}`)
      if (!dryRun) {
        journal.push({ kind: 'columnAlign', columnUid: String(columnRow.uid), before: JSON.parse(JSON.stringify(columnRow.props ?? {})) })
        await mergeNodeProps(token, String(columnRow.uid), { align: 'right' })
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

  // column-row options: some enum columns carry the option list on the
  // TableColumnModel itself (the column-header filter dropdown source), which
  // the field-model recolor above never touches — same v3 mapping there.
  for (const columnRow of models) {
    if (columnRow?.use !== 'TableColumnModel') continue
    const options = (columnRow.props ?? {}).options
    if (!Array.isArray(options)) continue
    const collection = String(columnRow?.stepParams?.fieldSettings?.init?.collectionName ?? '')
    if (!inScope(collection)) continue
    const { options: next, changed } = recolorOptions(options as Array<Record<string, unknown>>)
    if (!changed) continue
    const fieldPath = String(columnRow?.stepParams?.fieldSettings?.init?.fieldPath ?? '')
    counts.columnOptions++
    log.push(`  columnOptions ${collection}.${fieldPath}`)
    if (!dryRun) {
      appendJournal([{ kind: 'columnOptions', columnUid: String(columnRow.uid), before: JSON.parse(JSON.stringify(columnRow.props ?? {})) }])
      await dataOf(token, 'POST', '/api/flowModels:save', {
        uid: columnRow.uid, parentId: columnRow.parentId, subKey: columnRow.subKey,
        props: { ...columnRow.props, options: next },
      })
    }
  }

  // form/filter select options: SelectFieldModel option lists (filter dropdowns,
  // edit-form selects) still show English labels and pre-W7 colors — recolor to v3.
  for (const fieldRow of models) {
    if (fieldRow?.use !== 'SelectFieldModel') continue
    const options = (fieldRow.props ?? {}).options
    if (!Array.isArray(options)) continue
    const collection = ancestorCollectionOf(String(fieldRow.uid))
    if (!inScope(collection)) continue
    const { options: next, changed } = recolorOptions(options as Array<Record<string, unknown>>)
    if (!changed) continue
    counts.selectOptions++
    log.push(`  selectOptions ${collection} select ${String(fieldRow.uid)}`)
    if (!dryRun) {
      appendJournal([{ kind: 'selectOptions', fieldUid: String(fieldRow.uid), before: JSON.parse(JSON.stringify(fieldRow.props ?? {})) }])
      await dataOf(token, 'POST', '/api/flowModels:save', {
        uid: fieldRow.uid, parentId: fieldRow.parentId, subKey: fieldRow.subKey,
        props: { ...fieldRow.props, options: next },
      })
    }
  }

  // statcard regen: legacy w4b3 raws under B1-scoped page grids
  const gridsByUid = new Map<string, FlowModelRow>()
  for (const row of models) {
    if (row?.use === 'BlockGridModel') gridsByUid.set(String(row.uid), row)
  }
  for (const row of models) {
    if (row?.use !== 'ChartBlockModel') continue
    const raw = chartRawOf(row)
    if (!raw.includes('w4b3 statcard') || raw.includes('w7 forge statcard')) continue
    // scope via the owning grid's page collection footprint: the grid must
    // host at least one in-scope table column's table block
    const gridUid = String(row.parentId ?? '')
    const gridTables = models.filter(m => m?.use === 'TableBlockModel' && String(m.parentId ?? '') === gridUid)
    const gridScoped = gridTables.some(table => models.some(m => {
      if (m?.use !== 'TableColumnModel' || String(m.parentId ?? '') !== String(table.uid)) return false
      const field = childrenOf(String(m.uid)).find(c => c.subKey === 'field')
      return inScope(collectionOf(m, field ?? m))
    }))
    if (!gridScoped) continue
    const spec = parseStatcard(raw)
    if (spec === null) { log.push(`  ! statcard 解析失败 ${String(row.uid)}（跳过）`); continue }
    counts.statcardRegen++
    log.push(`  statcardRegen ${spec.title}`)
    if (!dryRun) {
      const fresh = statCardRaw({
        alias: spec.alias, title: spec.title, footnote: spec.footnote,
        unitPrefix: spec.unitPrefix === '' ? undefined : spec.unitPrefix,
        unitSuffix: spec.unitSuffix === '' ? undefined : spec.unitSuffix,
        decimals: spec.decimals,
      })
      appendJournal([{ kind: 'statcardRegen', blockUid: String(row.uid), beforeRaw: raw }])
      await dataOf(token, 'POST', '/api/flowModels:save', {
        uid: row.uid, parentId: row.parentId, subKey: row.subKey, stepParams: withChartRaw(row, fresh),
      })
    }
  }
  void byUid
  return { log, counts, unknownEnums }
}

// ─── rollback ───

/** Props keys the heal writes; before-states missing a key must clear it explicitly (flowModels:save merges). */
const HEAL_PROP_KEYS = ['align', 'separator', 'numberStep', 'addonBefore', 'format', 'options']

async function rollback(token: string): Promise<string[]> {
  const models = await listFlowModels(token, 'w7b1-rollback')
  const byUid = new Map(models.map(row => [String(row.uid), row]))
  const log: string[] = []
  const journal = loadJournal()
  const undone: RollbackEntry[] = []
  for (let index = journal.length - 1; index >= 0; index--) {
    const entry = journal[index]
    if (entry === undefined) break
    if (entry.kind === 'statcardRegen') {
      const row = byUid.get(entry.blockUid)
      if (row === undefined) { undone.push(entry); continue }
      await dataOf(token, 'POST', '/api/flowModels:save', {
        uid: entry.blockUid, parentId: row.parentId, subKey: row.subKey, stepParams: withChartRaw(row, entry.beforeRaw),
      })
      log.push(`rollback statcardRegen ${entry.blockUid}`)
      continue
    }
    if (entry.kind === 'columnAlign') {
      const row = byUid.get(entry.columnUid)
      if (row === undefined) { undone.push(entry); continue }
      await dataOf(token, 'POST', '/api/flowModels:save', {
        uid: entry.columnUid, parentId: row.parentId, subKey: row.subKey,
        props: { ...entry.before, align: entry.before.align ?? null },
      })
      log.push(`rollback columnAlign ${entry.columnUid}`)
      continue
    }
    if (entry.kind === 'columnOptions' || entry.kind === 'selectOptions') {
      const uid = entry.kind === 'columnOptions' ? entry.columnUid : entry.fieldUid
      const row = byUid.get(uid)
      if (row === undefined) { undone.push(entry); continue }
      await dataOf(token, 'POST', '/api/flowModels:save', {
        uid, parentId: row.parentId, subKey: row.subKey, props: clearMissing(entry.before),
      })
      log.push(`rollback ${entry.kind} ${uid}`)
      continue
    }
    const row = byUid.get(entry.fieldUid)
    if (row === undefined) { undone.push(entry); continue }
    if (entry.kind === 'enumSwap' || entry.kind === 'numberSwap') {
      await dataOf(token, 'POST', '/api/flowModels:save', {
        uid: entry.fieldUid, parentId: row.parentId, subKey: row.subKey,
        use: entry.beforeUse, props: clearMissing(entry.before),
      })
      log.push(`rollback ${entry.kind} ${entry.fieldUid} → ${entry.beforeUse}`)
      continue
    }
    await dataOf(token, 'POST', '/api/flowModels:save', {
      uid: entry.fieldUid, parentId: row.parentId, subKey: row.subKey, props: clearMissing(entry.before),
    })
    log.push(`rollback ${entry.kind} ${entry.fieldUid}`)
  }
  writeFileSync(ROLLBACK_PATH, `${JSON.stringify(undone, null, 2)}\n`)
  return log
}

function clearMissing(before: Record<string, unknown>): Record<string, unknown> {
  const props = { ...before }
  for (const key of HEAL_PROP_KEYS) if (!(key in props)) props[key] = null
  return props
}

// ─── assert ───

async function assertHealed(token: string): Promise<void> {
  const models = await listFlowModels(token, 'w7b1-assert')
  const childrenOf = (uid: string): FlowModelRow[] => models.filter(row => String(row.parentId ?? '') === uid)
  const failures: string[] = []
  let enumColumns = 0, colorMismatch = 0, enumNoLeft = 0
  let numberColumns = 0, numberNoRight = 0, numberNoSeparator = 0
  let dateColumns = 0, dateNoRight = 0, dateNoFormat = 0
  let bareNumeric = 0
  let columnOptionLists = 0, columnOptionMismatch = 0
  let selectOptionLists = 0, selectOptionMismatch = 0
  for (const columnRow of models) {
    if (columnRow?.use !== 'TableColumnModel') continue
    const fieldRow = childrenOf(String(columnRow.uid)).find(row => row.subKey === 'field')
    if (fieldRow === undefined) continue
    const fieldPath = String(columnRow?.stepParams?.fieldSettings?.init?.fieldPath ?? '')
    const collection = String(fieldRow?.stepParams?.fieldSettings?.init?.collectionName
      ?? columnRow?.stepParams?.fieldSettings?.init?.collectionName ?? '')
    if (!B1_COLLECTION.test(collection)) continue
    const use = String(fieldRow.use ?? '')
    const align = (columnRow.props ?? {}).align
    const props = (fieldRow.props ?? {}) as Record<string, unknown>
    if (Array.isArray((columnRow.props ?? {}).options)) {
      columnOptionLists++
      if (!optionV3Ok((columnRow.props as Record<string, unknown>).options as Array<Record<string, unknown>>)) columnOptionMismatch++
    }
    if (use === 'DisplayEnumFieldModel' && Array.isArray(props.options)) {
      enumColumns++
      if (align !== 'left') enumNoLeft++
      if (!optionV3Ok(props.options as Array<Record<string, unknown>>)) colorMismatch++
    } else if (use === 'DisplayNumberFieldModel' && !(fieldPath === 'id' || /_id$/.test(fieldPath))) {
      numberColumns++
      if (align !== 'right') numberNoRight++
      if (typeof props.separator !== 'string' || props.separator === '') numberNoSeparator++
    } else if (use === 'DisplayDateTimeFieldModel') {
      dateColumns++
      if (align !== 'right') dateNoRight++
      if (typeof props.format !== 'string' || props.format === '') dateNoFormat++
    }
    if (use === 'DisplayTextFieldModel' && /amount|price|total|value|cost|fee|balance|payable|receivable|qty|quantity/i.test(fieldPath)) bareNumeric++
  }
  const byUid = new Map(models.map(row => [String(row.uid), row]))
  const ancestorCollectionOf = (uid: string): string => {
    let cursor = byUid.get(uid)
    while (cursor !== undefined) {
      const candidate = (cursor?.stepParams as Record<string, any> | undefined)
      const fromResource = candidate?.resourceSettings?.init?.collectionName
      const fromField = candidate?.fieldSettings?.init?.collectionName
      if (typeof fromResource === 'string' && fromResource !== '') return fromResource
      if (typeof fromField === 'string' && fromField !== '') return fromField
      const parentId = String(cursor.parentId ?? '')
      cursor = parentId === '' ? undefined : byUid.get(parentId)
    }
    return ''
  }
  for (const row of models) {
    if (row?.use !== 'SelectFieldModel') continue
    const options = (row.props ?? {}).options
    if (!Array.isArray(options)) continue
    const collection = ancestorCollectionOf(String(row.uid))
    if (!B1_COLLECTION.test(collection)) continue
    selectOptionLists++
    if (!optionV3Ok(options as Array<Record<string, unknown>>)) selectOptionMismatch++
  }
  // statcards: no legacy figure blue, every legacy raw carries the forge mark
  const grids = new Set(models.filter(m => m?.use === 'BlockGridModel').map(m => String(m.uid)))
  let statcards = 0, statcardLegacy = 0
  for (const row of models) {
    if (row?.use !== 'ChartBlockModel' || !grids.has(String(row.parentId ?? ''))) continue
    const raw = chartRawOf(row)
    if (!raw.includes('w4b3 statcard')) continue
    const gridTables = models.filter(m => m?.use === 'TableBlockModel' && String(m.parentId ?? '') === String(row.parentId))
    const gridScoped = gridTables.some(table => models.some(m => {
      if (m?.use !== 'TableColumnModel' || String(m.parentId ?? '') !== String(table.uid)) return false
      const field = childrenOf(String(m.uid)).find(c => c.subKey === 'field')
      const c = String(field?.stepParams?.fieldSettings?.init?.collectionName ?? m?.stepParams?.fieldSettings?.init?.collectionName ?? '')
      return B1_COLLECTION.test(c)
    }))
    if (!gridScoped) continue
    statcards++
    if (raw.includes('#1d4ed8') || raw.includes('#6b7280') || raw.includes('#9ca3af') || !raw.includes('w7 forge statcard')) statcardLegacy++
  }
  const report = [
    `enumColumns=${enumColumns}`, `colorMismatch=${colorMismatch}`, `enumNoLeft=${enumNoLeft}`,
    `numberNoRight=${numberNoRight}/${numberColumns}`, `numberNoSeparator=${numberNoSeparator}/${numberColumns}`,
    `dateNoRight=${dateNoRight}/${dateColumns}`, `dateNoFormat=${dateNoFormat}/${dateColumns}`,
    `bareNumeric=${bareNumeric}`, `statcards=${statcards}`, `statcardLegacy=${statcardLegacy}`,
    `columnOptionMismatch=${columnOptionMismatch}/${columnOptionLists}`, `selectOptionMismatch=${selectOptionMismatch}/${selectOptionLists}`,
  ]
  console.log(`w7b1-heal assert: ${report.join(' ')}`)
  if (colorMismatch !== 0) failures.push(`STATUS_PALETTE v3 未全覆盖: ${colorMismatch} 列`)
  if (enumNoLeft !== 0) failures.push(`enum 列未左对齐: ${enumNoLeft}`)
  if (numberNoRight !== 0) failures.push(`数字列未右对齐: ${numberNoRight}/${numberColumns}`)
  if (numberNoSeparator !== 0) failures.push(`数字列无千分位: ${numberNoSeparator}/${numberColumns}`)
  if (dateNoRight !== 0) failures.push(`日期列未右对齐: ${dateNoRight}/${dateColumns}`)
  if (dateNoFormat !== 0) failures.push(`日期列无统一格式: ${dateNoFormat}/${dateColumns}`)
  if (columnOptionMismatch !== 0) failures.push(`列头筛选 options 未达 v3: ${columnOptionMismatch}/${columnOptionLists}`)
  if (selectOptionMismatch !== 0) failures.push(`表单/筛选 select options 未达 v3: ${selectOptionMismatch}/${selectOptionLists}`)
  if (bareNumeric !== 0) failures.push(`金额/数量列裸文本: ${bareNumeric}`)
  if (statcardLegacy !== 0) failures.push(`统计卡未升级到 W7 规格: ${statcardLegacy}/${statcards}`)
  if (failures.length > 0) {
    console.error(`w7b1-heal assert: FAILED\n  - ${failures.join('\n  - ')}`)
    process.exitCode = 1
    return
  }
  console.log('w7b1-heal assert: OK — v3 色板/对齐/千分位/日期格式/统计卡 全部达标')
}

// ─── CLI ───

async function main(): Promise<void> {
  const args = process.argv.slice(2)
  const mode = args[0]
  if (mode !== '--dry-run' && mode !== '--apply' && mode !== '--assert' && mode !== '--rollback') {
    console.error('usage: w7b1-heal.mts --dry-run|--apply|--assert|--rollback')
    process.exitCode = 2
    return
  }
  const token = await signInWithRetry()
  if (mode === '--assert') { await assertHealed(token); return }
  if (mode === '--rollback') {
    const log = await rollback(token)
    console.log(log.length > 0 ? log.join('\n') : 'nothing to roll back')
    return
  }
  const fields = await loadFields(token)
  const models = await listFlowModels(token, 'w7b1-heal')
  const { log, counts, unknownEnums } = await runHeal(token, models, fields, mode === '--dry-run')
  const summary = `${mode === '--dry-run' ? 'dry-run' : 'heal'} b1: recolor=${counts.recolor} enumSwap=${counts.enumSwap} numberSwap=${counts.numberSwap} numberProps=${counts.numberProps} dateProps=${counts.dateProps} alignRight=${counts.alignRight} alignLeft=${counts.alignLeft} statcardRegen=${counts.statcardRegen}`
  const out = [...log, summary, ...(unknownEnums.length > 0 ? ['', '未入 v3 映射的枚举值（保持原样）:', ...[...new Set(unknownEnums)].map(v => `  ${v}`)] : [])].join('\n')
  console.log(out)
  if (mode === '--apply') writeFileSync(`${RESEARCH_DIR}w7-b1-heal-run.txt`, `${out}\n`)
}

void main().catch(error => {
  console.error(error)
  process.exit(1)
})
