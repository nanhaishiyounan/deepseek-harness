/**
 * W7-B2+B3 list-page heal for the legacy-stock domains (production 15 +
 * warehousing 14 + quality 7 + supply-chain 8 + organization 5 + assets 3 +
 * base-data 1 = 53 pages). Same channel mix as w7b1-heal: STATUS_PALETTE v3
 * recolor, enum swaps for bare-text status columns, money/qty number display
 * with thousand grouping, unified date formats, and w4b3 stat cards
 * regenerated through the w7 forge statCardRaw.
 *
 * Scoping delta vs B1: these domains share collections with W6 pages that own
 * their own v2 base (mfg_boms ↔ 配方版本, qm_* ↔ 检验工作台, eam_* ↔ 维保五页,
 * mfg_ccp_* ↔ CCP 两页), so the walk is page-scoped — a row heals only when
 * its parent chain reaches a BlockGridModel owned by one of the 53 audited
 * flowPage routes (gridOwnerRoutes walk). W6 pages on the same collections
 * stay untouched.
 *
 * B2B3 palette additions over the B1 base table: MO/MRP/mfg execution states,
 * quality four-state + disposition family, alert levels, maintenance states,
 * inventory movement/lot states — every mapping keeps the v3 semantic five
 * state rules (execution → blue, attention → orange, negative → red, complete
 * → cyan, neutral metadata → default).
 *
 * Usage:
 *   node --import tsx/esm examples/kb-agent/scripts/w7b23-heal.mts --dry-run
 *   node --import tsx/esm examples/kb-agent/scripts/w7b23-heal.mts --apply
 *   node --import tsx/esm examples/kb-agent/scripts/w7b23-heal.mts --assert
 *   node --import tsx/esm examples/kb-agent/scripts/w7b23-heal.mts --rollback
 */
import { readFileSync, writeFileSync } from 'node:fs'
import {
  dataOf, gridOwnerRoutes, listFlowModels, listRoutes, mergeNodeProps, signInWithRetry, statCardRaw,
  type FlowModelRow, type RouteRow, type StatusColumnOption,
} from './nocobase-flow-page-lib.mts'

const RESEARCH_DIR = new URL('../../../research/2026-10-03-w7-rework/b23/', import.meta.url).pathname
const ROLLBACK_PATH = `${RESEARCH_DIR}w7-b23-heal-rollback.json`

// ─── the 53 audited pages (01-pc-inventory.md §3.4–3.8 + 组织/基础数据) ───

/** schemaUid → title; heal scope is exactly this set. */
export const B23_PAGES: Readonly<Record<string, string>> = {
  // 生产与计划 15（存量；4 W6 页不在批内）
  w5mfga37ztlt6orc: 'BOM 管理',
  w5mfgkkvs7a4ijya: 'BOM 工序',
  w5mfg3eil2n4n0kr: '工作中心',
  w5mfgntyu7wy20a: '生产订单',
  w5mfgp352sily7f: '排程明细',
  w6mfgsp029qziym: '领料单',
  w6mfg1zez6dqkcgh: '退料单',
  w6mfglmxq9mhbkur: '报工记录',
  w6mfgp1rrz08ffa: '完工单',
  w6mfgmct2tf2braf: 'MO 执行视图',
  w7mrphtm8t9tzlk8: '计划工作台',
  w7mrpowj6l93nn0a: 'MRP 快照',
  w7mrpyru4s708nwn: '主生产计划',
  w3b39xulomz8jj: '生产订单看板',
  w3b6guuruqly03t: '车间终端',
  // 仓储管理 14（全存量）
  h5wms50cuimohzz7: '仓库库区',
  h5wms1nju21hb5c8: '库位平面图',
  h5wmsrh8ls7pkv5i: '入库单',
  h5wmsvwkqjiiaxdj: '出库单',
  h5wms9v2hly0cg6j: '库存查询',
  h5wmsgd4pntmwvg: '批次主数据',
  h5wms2hmkvlfsmtf: '盘点管理',
  h5wmspyqfovkqjff: '移库管理',
  h5wms9srcrn5fhiq: '库存流水',
  h5wms9zlhetpzwl: '预留管理',
  h5wmstw8iug4upxs: '补货预警',
  h5wmsddav9gkxtl: '盘点计划',
  h5wmslacezwb94s: '月度收发存',
  w3b66yns80jnq92: '收货终端',
  // 质量管理 7（存量；4 W6 页不在批内）
  w8qmjvyv8p5j7j: '质检单',
  w8qmg3yelbk0rzm: '检验读数',
  w8qm472nluqt32x: '处置看板',
  w8qm15rxe53v8hh: 'AQL 抽样方案',
  w8qm8sx2tj9j0kb: '季度绩效物化',
  w3b3uw3d0mrz1b: '质检看板',
  w3b6nour73ecwgb: '质检工作台',
  // 供应链 8（全存量）
  h4srm2u9xiqx09jb: '供应商档案',
  h4srm6hfqnpnrqu5: '供应商准入',
  h4srmjjlvbjei4fd: '证照效期预警',
  h4srmuvf86en2kn: '审核检查表',
  h4srmflpebqkuz: '审核评分录入',
  h4srms4w5viez9zp: '绩效评分卡',
  h4srmaf4rurtt17p: '供应商绩效雷达',
  h4srm25tmro1wjuw: '整改跟踪',
  // 组织与系统 5
  n17lhe5qyxu1g: '员工',
  n17f3er0aw80yc8i: '部门',
  n17f3wqpzee9wo2g: '请假审批',
  w3b57ix4086om95: '组织架构',
  w3b5m8kwiakieq: '权限矩阵',
  // 资产管理 3（存量；5 W6 页不在批内）
  n17wr2jbz8fl2i: '资产台账',
  n17f34o4bhrzg1w: '维保记录',
  n17f3t3gtwv502s: '维保服务商',
  // 基础数据 1
  n17f3rnd403uzlkc: '分类维护',
}

// ─── STATUS_PALETTE v3 + B2B3 domain additions ───

/** value → [label, antd preset color]; B1 base table verbatim, then the batch additions. */
export const STATUS_PALETTE: Readonly<Record<string, [string, string]>> = {
  // ── B1 base（v3 语义五态基准，41+ 键）──
  draft: ['草稿', 'default'], pending: ['待处理', 'orange'], pending_level2: ['二级审批中', 'blue'],
  submitted: ['已提交', 'blue'], approved: ['已生效', 'green'], rejected: ['已驳回', 'red'],
  void: ['已作废', 'default'],
  planned: ['已计划', 'blue'], released: ['已下达', 'blue'], in_progress: ['执行中', 'blue'],
  started: ['已开工', 'blue'], processing: ['处理中', 'blue'], waiting: ['等待中', 'orange'],
  completed: ['已完成', 'cyan'], done: ['已完成', 'cyan'], closed: ['已关闭', 'default'],
  cancelled: ['已取消', 'default'], confirmed: ['已确认', 'green'], resolved: ['已解决', 'green'],
  active: ['生效', 'green'], inactive: ['停用', 'default'], retired: ['退役', 'default'],
  new: ['新建', 'default'],
  open: ['进行中', 'blue'], partial: ['部分付款', 'orange'], paid: ['已付讫', 'green'],
  overdue: ['已逾期', 'red'],
  passed: ['合格', 'green'], failed: ['不合格', 'red'], concession: ['让步接收', 'orange'],
  hold: ['待定', 'orange'], converted: ['已转单', 'blue'], dismissed: ['已忽略', 'default'],
  qualified: ['合格', 'green'], preferred: ['优选', 'blue'], restricted: ['受限', 'red'],
  enhanced: ['加严', 'orange'], potential: ['潜在', 'default'], reviewing: ['准入评审中', 'blue'],
  standard: ['标准', 'default'],
  A: ['A级', 'green'], B: ['B级', 'blue'], C: ['C级', 'orange'], D: ['D级', 'default'],
  bank_transfer: ['银行转账', 'default'], cash: ['现金', 'default'], cheque: ['支票', 'default'],
  acceptance: ['承兑', 'default'], wire: ['电汇', 'default'], alipay: ['支付宝', 'default'],
  wechat: ['微信', 'default'], other: ['其他', 'default'],
  contacted: ['已联系', 'blue'], requirements_confirmed: ['需求确认', 'blue'],
  proposal: ['方案报价', 'blue'], negotiation: ['商务谈判', 'orange'],
  won: ['赢单', 'green'], lost: ['输单', 'red'],
  sent: ['已发送', 'blue'], accepted: ['已接受', 'green'], pending_approval: ['待审批', 'orange'],
  fulfilled: ['已履约', 'green'], received: ['已收货', 'green'], issued: ['已开具', 'blue'],
  enterprise: ['企业客户', 'blue'], trader: ['贸易商', 'cyan'], factory: ['工厂', 'default'],
  prospect: ['潜在', 'default'], churned: ['流失', 'red'],
  fixed: ['固定报价', 'default'], times: ['按次', 'default'], subscription: ['订阅', 'default'],
  compliance: ['合规服务', 'default'], logistics: ['物流', 'default'], channel: ['渠道', 'default'],
  brand: ['品牌', 'default'], data: ['数据', 'default'], ops: ['运营', 'default'],
  letter_of_credit: ['信用证', 'default'], acceptance_bill: ['承兑汇票', 'default'],
  bank: ['银行转账', 'default'], bill: ['票据', 'default'],
  none: ['未收货', 'orange'], no_invoice: ['未开票', 'orange'], to_invoice: ['待开票', 'orange'],
  invoiced: ['已开票', 'green'], matched: ['已匹配', 'green'], exception: ['异常', 'red'],
  shipped: ['已发运', 'blue'],
  Preventive: ['预防性', 'blue'], Corrective: ['纠正性', 'orange'], Inspection: ['点检', 'cyan'],
  Scheduled: ['已排程', 'blue'], 'In progress': ['进行中', 'blue'], Done: ['已完成', 'green'],
  // ── B2B3 域补值（dry-run 实测 111 值，按 v3 规则归类：中性元数据 default、
  // 执行 blue、注意 orange、负面 red、完成 cyan）──
  // 供应链：证照效期预警（ok→green，剩余窗口越窄越红）
  ok: ['正常', 'green'], w90: ['≤90天', 'blue'], w60: ['≤60天', 'orange'], w30: ['≤30天', 'red'],
  eliminated: ['已淘汰', 'default'], E: ['E级', 'red'],
  expired: ['已过期', 'red'], frozen: ['冻结', 'orange'],
  picking: ['拣货发运', 'default'], posted: ['已过账', 'green'], good: ['良品', 'green'],
  quarantined: ['隔离', 'orange'],
  idle: ['空闲', 'default'], on_leave: ['休假中', 'blue'],
  major: ['主要', 'orange'], minor: ['次要', 'blue'],
  // 供应商分类/来源/证照类型/IQC 等级/评分周期与走势（中性元数据）
  raw: ['原材料', 'default'], packaging: ['包装材料', 'default'], service: ['服务类', 'default'], aux: ['辅料', 'default'],
  self: ['自主开发', 'default'], invited: ['邀请注册', 'default'], internal: ['内部推荐', 'default'],
  bl: ['营业执照', 'default'], sc: ['生产许可', 'default'], jy: ['经营许可', 'default'],
  iso22000: ['ISO 22000', 'default'], haccp: ['HACCP', 'default'],
  relaxed: ['免检', 'green'], tightened: ['加严', 'orange'], suspended: ['暂停检验', 'red'],
  '2025Q3': ['2025Q3', 'default'], '2025Q4': ['2025Q4', 'default'],
  '2026Q1': ['2026Q1', 'default'], '2026Q2': ['2026Q2', 'default'],
  up: ['上调', 'green'], flat: ['持平', 'default'], down: ['下调', 'red'],
  // 仓储：库存/库位/单据状态与流水动作（动作中性、状态五态）
  blocked: ['冻结', 'red'], occupied: ['已占用', 'default'], disabled: ['停用', 'default'],
  RECEIPT: ['收货', 'default'], PUTAWAY: ['上架', 'default'], PICK: ['拣货', 'default'],
  SHIP: ['发运', 'default'], MOVE: ['移库', 'default'], ADJUST: ['调整', 'default'],
  COUNT_ADJUST: ['盘差调整', 'default'], ISSUE_WIP: ['车间发料', 'default'], RETURN_WIP: ['车间退料', 'default'],
  RECEIPT_MFG: ['完工入库', 'default'], RETURN_VENDOR: ['供应商退货', 'default'], SCRAP: ['报废', 'default'],
  SHIPMENT_SO: ['销售出库', 'default'],
  counting: ['盘点中', 'blue'], difference: ['有差异', 'orange'], adjusting: ['调整中', 'orange'],
  receiving: ['收货中', 'blue'], reserved: ['已预留', 'blue'], consumed: ['已消耗', 'cyan'],
  in_transit: ['在途', 'blue'],
  purchase: ['采购入库', 'default'], production: ['生产入库', 'default'], return: ['退货', 'default'],
  full: ['全面盘点', 'default'], cycle: ['循环盘点', 'default'], sample: ['抽样盘点', 'default'],
  ambient: ['常温', 'default'], chilled: ['冷藏', 'cyan'],
  full_replay: ['全量重放', 'default'], incremental: ['增量', 'default'],
  sales: ['销售出库', 'default'], SO: ['销售订单', 'default'], MO: ['生产订单', 'default'], SHIPMENT: ['出库单', 'default'],
  // 资产：设备状态/类别/维保类型（维保类型按 Preventive/Corrective 同款语义）
  in_use: ['在用', 'green'], repair: ['维修', 'orange'], assigned: ['已领用', 'blue'], in_stock: ['在库', 'default'],
  it: ['IT 设备', 'default'], equipment: ['生产设备', 'default'], furniture: ['办公家具', 'default'],
  certification: ['认证服务', 'default'], legal: ['法务', 'default'], misc: ['综合', 'default'],
  inspection: ['点检', 'cyan'], calibration: ['校准', 'blue'],
  // 组织：员工/请假
  resigned: ['已离职', 'default'], onleave: ['休假中', 'blue'], terminated: ['已解聘', 'red'],
  annual: ['年假', 'default'], sick: ['病假', 'default'], personal: ['事假', 'default'],
  // 生产：齐套/预留/免检/建议类型/计划驱动
  full_lock: ['全额齐套', 'default'], partial_allowed: ['部分分配', 'orange'],
  not_required: ['免检', 'default'], PR: ['采购申请', 'default'],
  so: ['销售订单', 'default'], forecast: ['预测', 'default'],
  confirm: ['采纳', 'blue'], dismiss: ['忽略', 'default'],
  // 质量：检验类型/严格度/来源（类型中性、严格度三态）
  IQC: ['来料检验', 'default'], IPQC: ['过程检验', 'default'], OQC: ['出货检验', 'default'], CCP: ['CCP 监控', 'default'],
  normal: ['正常', 'default'], reduced: ['放宽', 'green'],
  receipt: ['入库单', 'default'], job_report: ['报工单', 'default'], completion: ['完工单', 'default'],
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

// ─── column-kind detection ───

const MONEY_FIELD = /(amount|price|total|value|cost|fee|budget|balance|payable|receivable|money)/
const QTY_FIELD = /(qty|quantity|count|weight|stock|lead_time|score|points|hours|days|minutes|duration|defect)/

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

type FieldMeta = { name: string, interface: string | null, options: Array<Record<string, unknown>> | null, uiSchema: Record<string, unknown> | null }

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
      const uiSchema = (row.uiSchema ?? null) as Record<string, unknown> | null
      const enumOptions = Array.isArray(uiSchema?.enum)
        ? uiSchema!.enum as Array<Record<string, unknown>>
        : Array.isArray(row.options) ? row.options as Array<Record<string, unknown>> : null
      map.get(collection)!.push({ name: row.name, interface: row.interface ?? null, options: enumOptions, uiSchema })
    }
    if (map.size > 0) return map
  }
  throw new Error('no collection-scoped field channel returned rows')
}

// ─── rollback journal ───

type RollbackEntry =
  | { kind: 'fieldOptions', fieldUid: string, before: Record<string, unknown> }
  | { kind: 'fieldEnum', collection: string, field: string, before: Array<Record<string, unknown>> }
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

// ─── page attribution: row → owning flowPage schemaUid via the grid chain ───

type PageScope = { pageOf: Map<string, string>, pagesSeen: Map<string, string> }

function buildPageScope(models: FlowModelRow[], routes: RouteRow[]): PageScope {
  const gridOwners = gridOwnerRoutes(models, routes)
  const byUid = new Map(models.map(row => [String(row.uid), row]))
  const pageOf = new Map<string, string>()
  const pagesSeen = new Map<string, string>()
  const resolve = (uid: string, breadcrumb: string[] = []): string => {
    const memo = pageOf.get(uid)
    if (memo !== undefined) return memo
    if (breadcrumb.includes(uid)) return '' // parent cycle guard
    const row = byUid.get(uid)
    if (row === undefined) return ''
    const owner = gridOwners.get(uid)
    if (owner !== undefined) {
      if (B23_PAGES[owner] !== undefined) pagesSeen.set(owner, B23_PAGES[owner])
      pageOf.set(uid, owner)
      return owner
    }
    const parent = resolve(String(row.parentId ?? ''), [...breadcrumb, uid])
    pageOf.set(uid, parent)
    return parent
  }
  for (const row of models) resolve(String(row.uid))
  return { pageOf, pagesSeen }
}

const inScope = (scope: PageScope, uid: string): string | undefined => {
  const page = scope.pageOf.get(uid) ?? ''
  return B23_PAGES[page] === undefined ? undefined : page
}

// ─── the heal walk ───

export type HealCounts = { recolor: number, enumSwap: number, numberSwap: number, numberProps: number, alignRight: number, alignLeft: number, dateProps: number, statcardRegen: number, columnOptions: number, selectOptions: number, fieldEnum: number }

type ColumnSpec = { columnRow: FlowModelRow, fieldRow: FlowModelRow, fieldPath: string, collection: string, page: string, actions: string[], kind: NumberKind | null }

async function runHeal(token: string, models: FlowModelRow[], routes: RouteRow[], fields: Map<string, FieldMeta[]>, dryRun: boolean): Promise<{ log: string[], counts: HealCounts, unknownEnums: string[], pagesSeen: string[] }> {
  const scope = buildPageScope(models, routes)
  const childrenOf = (uid: string): FlowModelRow[] => models.filter(row => String(row.parentId ?? '') === uid)
  const log: string[] = []
  const counts: HealCounts = { recolor: 0, enumSwap: 0, numberSwap: 0, numberProps: 0, alignRight: 0, alignLeft: 0, dateProps: 0, statcardRegen: 0, columnOptions: 0, selectOptions: 0, fieldEnum: 0 }
  const unknownEnums: string[] = []

  const columns: ColumnSpec[] = []
  for (const columnRow of models) {
    if (columnRow?.use !== 'TableColumnModel') continue
    const page = inScope(scope, String(columnRow.uid))
    if (page === undefined) continue
    const fieldRow = childrenOf(String(columnRow.uid)).find(row => row.subKey === 'field')
    if (fieldRow === undefined) continue
    const fieldPath = String(columnRow?.stepParams?.fieldSettings?.init?.fieldPath ?? '')
    const collection = String(fieldRow?.stepParams?.fieldSettings?.init?.collectionName
      ?? columnRow?.stepParams?.fieldSettings?.init?.collectionName ?? '')
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
    columns.push({ columnRow, fieldRow, fieldPath, collection, page, actions, kind })
  }

  for (const { columnRow, fieldRow, fieldPath, collection, page, actions, kind } of columns) {
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
      log.push(`  enumSwap ${page} ${collection}.${fieldPath}（${options.length} 项 v3 选项）`)
      if (!dryRun) {
        journal.push({ kind: 'enumSwap', fieldUid: String(fieldRow.uid), beforeUse: String(fieldRow.use ?? ''), before: JSON.parse(JSON.stringify(fieldRow.props ?? {})) })
        await save({ use: 'DisplayEnumFieldModel', props: { options } })
      }
    }
    if (actions.includes('numberSwap')) {
      counts.numberSwap++
      log.push(`  numberSwap ${page} ${collection}.${fieldPath} → DisplayNumberFieldModel（${kind}）`)
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
        log.push(`  recolor ${page} ${collection}.${fieldPath}`)
        if (!dryRun) {
          journal.push({ kind: 'fieldOptions', fieldUid: String(fieldRow.uid), before: JSON.parse(JSON.stringify(fieldRow.props ?? {})) })
          await save({ props: { ...fieldRow.props, options } })
        }
      }
    }
    if (actions.includes('numberProps') && kind !== null) {
      counts.numberProps++
      log.push(`  numberProps ${page} ${collection}.${fieldPath}（${kind} 千分位）`)
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
        log.push(`  dateProps ${page} ${collection}.${fieldPath}（${format}）`)
        if (!dryRun) {
          journal.push({ kind: 'dateProps', fieldUid: String(fieldRow.uid), before: JSON.parse(JSON.stringify(fieldRow.props ?? {})) })
          await save({ props: { ...fieldRow.props, format } })
        }
      }
    }
    if (actions.includes('alignRight') && columnRow.props?.align !== 'right') {
      counts.alignRight++
      log.push(`  align→right ${page} ${collection}.${fieldPath}`)
      if (!dryRun) {
        journal.push({ kind: 'columnAlign', columnUid: String(columnRow.uid), before: JSON.parse(JSON.stringify(columnRow.props ?? {})) })
        await mergeNodeProps(token, String(columnRow.uid), { align: 'right' })
      }
    }
    if (actions.includes('alignLeft') && columnRow.props?.align !== 'left') {
      counts.alignLeft++
      log.push(`  align→left ${page} ${collection}.${fieldPath}`)
      if (!dryRun) {
        journal.push({ kind: 'columnAlign', columnUid: String(columnRow.uid), before: JSON.parse(JSON.stringify(columnRow.props ?? {})) })
        await mergeNodeProps(token, String(columnRow.uid), { align: 'left' })
      }
    }
    appendJournal(journal)
  }

  // column-row options: enum columns carrying the option list on the
  // TableColumnModel itself (the column-header filter dropdown source).
  for (const columnRow of models) {
    if (columnRow?.use !== 'TableColumnModel') continue
    const options = (columnRow.props ?? {}).options
    if (!Array.isArray(options)) continue
    const page = inScope(scope, String(columnRow.uid))
    if (page === undefined) continue
    const { options: next, changed } = recolorOptions(options as Array<Record<string, unknown>>)
    if (!changed) continue
    const fieldPath = String(columnRow?.stepParams?.fieldSettings?.init?.fieldPath ?? '')
    const collection = String(columnRow?.stepParams?.fieldSettings?.init?.collectionName ?? '')
    counts.columnOptions++
    log.push(`  columnOptions ${page} ${collection}.${fieldPath}`)
    if (!dryRun) {
      appendJournal([{ kind: 'columnOptions', columnUid: String(columnRow.uid), before: JSON.parse(JSON.stringify(columnRow.props ?? {})) }])
      await dataOf(token, 'POST', '/api/flowModels:save', {
        uid: columnRow.uid, parentId: columnRow.parentId, subKey: columnRow.subKey,
        props: { ...columnRow.props, options: next },
      })
    }
  }

  // form/filter select options: SelectFieldModel option lists under in-scope pages.
  for (const fieldRow of models) {
    if (fieldRow?.use !== 'SelectFieldModel') continue
    const options = (fieldRow.props ?? {}).options
    if (!Array.isArray(options)) continue
    const page = inScope(scope, String(fieldRow.uid))
    if (page === undefined) continue
    const { options: next, changed } = recolorOptions(options as Array<Record<string, unknown>>)
    if (!changed) continue
    counts.selectOptions++
    log.push(`  selectOptions ${page} select ${String(fieldRow.uid)}`)
    if (!dryRun) {
      appendJournal([{ kind: 'selectOptions', fieldUid: String(fieldRow.uid), before: JSON.parse(JSON.stringify(fieldRow.props ?? {})) }])
      await dataOf(token, 'POST', '/api/flowModels:save', {
        uid: fieldRow.uid, parentId: fieldRow.parentId, subKey: fieldRow.subKey,
        props: { ...fieldRow.props, options: next },
      })
    }
  }

  // field-enum recolor: the runtime enum Tag source is the collection field's
  // uiSchema.enum (the v2 renderer reads it, not the flowModels option lists
  // above — B1 missed this channel, so W4-era labels/colors survived its
  // recolor). Scope: the (collection, fieldPath) pairs the in-scope pages'
  // enum columns actually render.
  {
    const enumPairs = new Map<string, { collection: string, fieldPath: string }>()
    for (const columnRow of models) {
      if (columnRow?.use !== 'TableColumnModel') continue
      const page = inScope(scope, String(columnRow.uid))
      if (page === undefined) continue
      const fieldRow = childrenOf(String(columnRow.uid)).find(row => row.subKey === 'field')
      if (fieldRow === undefined || String(fieldRow.use ?? '') !== 'DisplayEnumFieldModel') continue
      const fieldPath = String(columnRow?.stepParams?.fieldSettings?.init?.fieldPath ?? '')
      const collection = String(fieldRow?.stepParams?.fieldSettings?.init?.collectionName
        ?? columnRow?.stepParams?.fieldSettings?.init?.collectionName ?? '')
      if (collection === '' || fieldPath === '') continue
      enumPairs.set(`${collection}.${fieldPath}`, { collection, fieldPath })
    }
    for (const { collection, fieldPath } of enumPairs.values()) {
      const meta = fields.get(collection)?.find(field => field.name === fieldPath)
      if (meta?.options == null || meta.options.length === 0) continue
      const { options: next, changed } = recolorOptions(meta.options)
      if (!changed) continue
      counts.fieldEnum++
      log.push(`  fieldEnum ${collection}.${fieldPath}（uiSchema.enum → v3）`)
      if (!dryRun) {
        appendJournal([{ kind: 'fieldEnum', collection, field: fieldPath, before: JSON.parse(JSON.stringify(meta.options)) }])
        const uiSchema = { ...(meta.uiSchema ?? {}), enum: next }
        await dataOf(token, 'POST', `/api/collections/${collection}/fields:update?filterByTk=${fieldPath}`, { uiSchema })
        meta.options = next
      }
    }
  }

  // statcard regen: legacy w4b3 raws under in-scope page grids.
  for (const row of models) {
    if (row?.use !== 'ChartBlockModel') continue
    const raw = chartRawOf(row)
    if (!raw.includes('w4b3 statcard') || raw.includes('w7 forge statcard')) continue
    const page = inScope(scope, String(row.uid))
    if (page === undefined) continue
    const spec = parseStatcard(raw)
    if (spec === null) { log.push(`  ! statcard 解析失败 ${String(row.uid)}（跳过）`); continue }
    counts.statcardRegen++
    log.push(`  statcardRegen ${page} ${spec.title}`)
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
  return { log, counts, unknownEnums, pagesSeen: [...scope.pagesSeen.keys()] }
}

// ─── rollback ───

/** Props keys the heal writes; before-states missing a key must clear it explicitly (flowModels:save merges). */
const HEAL_PROP_KEYS = ['align', 'separator', 'numberStep', 'addonBefore', 'format', 'options']

async function rollback(token: string): Promise<string[]> {
  const models = await listFlowModels(token, 'w7b23-rollback')
  const byUid = new Map(models.map(row => [String(row.uid), row]))
  const log: string[] = []
  const journal = loadJournal()
  const undone: RollbackEntry[] = []
  for (let index = journal.length - 1; index >= 0; index--) {
    const entry = journal[index]
    if (entry === undefined) break
    if (entry.kind === 'fieldEnum') {
      const fresh = await dataOf(token, 'GET', `/api/fields:list?filter=${encodeURIComponent(JSON.stringify({ collectionName: { $eq: entry.collection }, name: { $eq: entry.field } }))}&pageSize=1`).catch(() => null) as Array<Record<string, any>> | null
      const uiSchema = (fresh?.[0]?.uiSchema ?? {}) as Record<string, unknown>
      await dataOf(token, 'POST', `/api/collections/${entry.collection}/fields:update?filterByTk=${entry.field}`, {
        uiSchema: { ...uiSchema, enum: entry.before },
      })
      log.push(`rollback fieldEnum ${entry.collection}.${entry.field}`)
      continue
    }
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
  const models = await listFlowModels(token, 'w7b23-assert')
  const routes = await listRoutes(token, 'w7b23-assert')
  const scope = buildPageScope(models, routes)
  const childrenOf = (uid: string): FlowModelRow[] => models.filter(row => String(row.parentId ?? '') === uid)
  const failures: string[] = []
  const perPage = new Map<string, { enumColumns: number, colorMismatch: number, enumNoLeft: number, numberColumns: number, numberNoRight: number, numberNoSeparator: number, dateColumns: number, dateNoRight: number, dateNoFormat: number, bareNumeric: number, columnOptionLists: number, columnOptionMismatch: number, statcards: number, statcardLegacy: number }>()
  const pageBucket = (page: string) => {
    let bucket = perPage.get(page)
    if (bucket === undefined) {
      bucket = { enumColumns: 0, colorMismatch: 0, enumNoLeft: 0, numberColumns: 0, numberNoRight: 0, numberNoSeparator: 0, dateColumns: 0, dateNoRight: 0, dateNoFormat: 0, bareNumeric: 0, columnOptionLists: 0, columnOptionMismatch: 0, statcards: 0, statcardLegacy: 0 }
      perPage.set(page, bucket)
    }
    return bucket
  }
  let selectOptionLists = 0, selectOptionMismatch = 0
  // field-enum source (uiSchema.enum) must be v3 too — the runtime Tag source.
  const fields = await loadFields(token)
  const enumPairs = new Map<string, { collection: string, fieldPath: string }>()
  let fieldEnumLists = 0, fieldEnumMismatch = 0
  for (const columnRow of models) {
    if (columnRow?.use === 'TableColumnModel' && inScope(scope, String(columnRow.uid)) !== undefined) {
      const fieldRow = childrenOf(String(columnRow.uid)).find(row => row.subKey === 'field')
      const collection = String(fieldRow?.stepParams?.fieldSettings?.init?.collectionName
        ?? columnRow?.stepParams?.fieldSettings?.init?.collectionName ?? '')
      const fieldPath = String(columnRow?.stepParams?.fieldSettings?.init?.fieldPath ?? '')
      if (String(fieldRow?.use ?? '') === 'DisplayEnumFieldModel' && collection !== '' && fieldPath !== '') {
        enumPairs.set(`${collection}.${fieldPath}`, { collection, fieldPath })
      }
    }
    if (columnRow?.use !== 'TableColumnModel') continue
    const page = inScope(scope, String(columnRow.uid))
    if (page === undefined) continue
    const bucket = pageBucket(page)
    const fieldRow = childrenOf(String(columnRow.uid)).find(row => row.subKey === 'field')
    if (fieldRow === undefined) continue
    const fieldPath = String(columnRow?.stepParams?.fieldSettings?.init?.fieldPath ?? '')
    const use = String(fieldRow.use ?? '')
    const align = (columnRow.props ?? {}).align
    const props = (fieldRow.props ?? {}) as Record<string, unknown>
    if (Array.isArray((columnRow.props ?? {}).options)) {
      bucket.columnOptionLists++
      if (!optionV3Ok((columnRow.props as Record<string, unknown>).options as Array<Record<string, unknown>>)) bucket.columnOptionMismatch++
    }
    if (use === 'DisplayEnumFieldModel' && Array.isArray(props.options)) {
      bucket.enumColumns++
      if (align !== 'left') bucket.enumNoLeft++
      if (!optionV3Ok(props.options as Array<Record<string, unknown>>)) bucket.colorMismatch++
    } else if (use === 'DisplayNumberFieldModel' && !(fieldPath === 'id' || /_id$/.test(fieldPath))) {
      bucket.numberColumns++
      if (align !== 'right') bucket.numberNoRight++
      if (typeof props.separator !== 'string' || props.separator === '') bucket.numberNoSeparator++
    } else if (use === 'DisplayDateTimeFieldModel') {
      bucket.dateColumns++
      if (align !== 'right') bucket.dateNoRight++
      if (typeof props.format !== 'string' || props.format === '') bucket.dateNoFormat++
    }
    if (use === 'DisplayTextFieldModel' && /amount|price|total|value|cost|fee|balance|payable|receivable|qty|quantity/i.test(fieldPath)) bucket.bareNumeric++
  }
  for (const row of models) {
    if (row?.use !== 'SelectFieldModel') continue
    const options = (row.props ?? {}).options
    if (!Array.isArray(options)) continue
    const page = inScope(scope, String(row.uid))
    if (page === undefined) continue
    selectOptionLists++
    if (!optionV3Ok(options as Array<Record<string, unknown>>)) selectOptionMismatch++
  }
  for (const { collection, fieldPath } of enumPairs.values()) {
    const meta = fields.get(collection)?.find(field => field.name === fieldPath)
    if (meta?.options == null || meta.options.length === 0) continue
    fieldEnumLists++
    if (!optionV3Ok(meta.options)) fieldEnumMismatch++
  }
  for (const row of models) {
    if (row?.use !== 'ChartBlockModel') continue
    const raw = chartRawOf(row)
    if (!raw.includes('w4b3 statcard')) continue
    const page = inScope(scope, String(row.uid))
    if (page === undefined) continue
    const bucket = pageBucket(page)
    bucket.statcards++
    if (raw.includes('#1d4ed8') || raw.includes('#6b7280') || raw.includes('#9ca3af') || !raw.includes('w7 forge statcard')) bucket.statcardLegacy++
  }
  // coverage: every audited page must appear in the flowModels snapshot's
  // grid-owner map (kanban/iframe/JSBlock pages carry grids or iframes too).
  const missing = Object.keys(B23_PAGES).filter(uid => scope.pagesSeen.get(uid) === undefined)
  let totals = { enumColumns: 0, colorMismatch: 0, enumNoLeft: 0, numberColumns: 0, numberNoRight: 0, numberNoSeparator: 0, dateColumns: 0, dateNoRight: 0, dateNoFormat: 0, bareNumeric: 0, columnOptionMismatch: 0, columnOptionLists: 0, statcards: 0, statcardLegacy: 0 }
  for (const bucket of perPage.values()) {
    totals = {
      ...totals,
      enumColumns: totals.enumColumns + bucket.enumColumns, colorMismatch: totals.colorMismatch + bucket.colorMismatch, enumNoLeft: totals.enumNoLeft + bucket.enumNoLeft,
      numberColumns: totals.numberColumns + bucket.numberColumns, numberNoRight: totals.numberNoRight + bucket.numberNoRight, numberNoSeparator: totals.numberNoSeparator + bucket.numberNoSeparator,
      dateColumns: totals.dateColumns + bucket.dateColumns, dateNoRight: totals.dateNoRight + bucket.dateNoRight, dateNoFormat: totals.dateNoFormat + bucket.dateNoFormat,
      bareNumeric: totals.bareNumeric + bucket.bareNumeric, columnOptionMismatch: totals.columnOptionMismatch + bucket.columnOptionMismatch, columnOptionLists: totals.columnOptionLists + bucket.columnOptionLists,
      statcards: totals.statcards + bucket.statcards, statcardLegacy: totals.statcardLegacy + bucket.statcardLegacy,
    }
  }
  const report = [
    `pages=${perPage.size}/${Object.keys(B23_PAGES).length}`,
    `enumColumns=${totals.enumColumns}`, `colorMismatch=${totals.colorMismatch}`, `enumNoLeft=${totals.enumNoLeft}`,
    `numberNoRight=${totals.numberNoRight}/${totals.numberColumns}`, `numberNoSeparator=${totals.numberNoSeparator}/${totals.numberColumns}`,
    `dateNoRight=${totals.dateNoRight}/${totals.dateColumns}`, `dateNoFormat=${totals.dateNoFormat}/${totals.dateColumns}`,
    `bareNumeric=${totals.bareNumeric}`, `statcards=${totals.statcards}`, `statcardLegacy=${totals.statcardLegacy}`,
    `columnOptionMismatch=${totals.columnOptionMismatch}/${totals.columnOptionLists}`, `selectOptionMismatch=${selectOptionMismatch}/${selectOptionLists}`,
    `fieldEnumMismatch=${fieldEnumMismatch}/${fieldEnumLists}`,
  ]
  console.log(`w7b23-heal assert: ${report.join(' ')}`)
  if (totals.colorMismatch !== 0) failures.push(`STATUS_PALETTE v3 未全覆盖: ${totals.colorMismatch} 列`)
  if (fieldEnumMismatch !== 0) failures.push(`字段 uiSchema.enum 渲染源未达 v3: ${fieldEnumMismatch}/${fieldEnumLists}`)
  if (totals.enumNoLeft !== 0) failures.push(`enum 列未左对齐: ${totals.enumNoLeft}`)
  if (totals.numberNoRight !== 0) failures.push(`数字列未右对齐: ${totals.numberNoRight}/${totals.numberColumns}`)
  if (totals.numberNoSeparator !== 0) failures.push(`数字列无千分位: ${totals.numberNoSeparator}/${totals.numberColumns}`)
  if (totals.dateNoRight !== 0) failures.push(`日期列未右对齐: ${totals.dateNoRight}/${totals.dateColumns}`)
  if (totals.dateNoFormat !== 0) failures.push(`日期列无统一格式: ${totals.dateNoFormat}/${totals.dateColumns}`)
  if (totals.columnOptionMismatch !== 0) failures.push(`列头筛选 options 未达 v3: ${totals.columnOptionMismatch}/${totals.columnOptionLists}`)
  if (selectOptionMismatch !== 0) failures.push(`表单/筛选 select options 未达 v3: ${selectOptionMismatch}/${selectOptionLists}`)
  if (totals.bareNumeric !== 0) failures.push(`金额/数量列裸文本: ${totals.bareNumeric}`)
  if (totals.statcardLegacy !== 0) failures.push(`统计卡未升级到 W7 规格: ${totals.statcardLegacy}/${totals.statcards}`)
  if (missing.length > 0) failures.push(`页未出现在 flowModels 归属图: ${missing.map(uid => `${B23_PAGES[uid]}(${uid})`).join('、')}`)
  if (failures.length > 0) {
    console.error(`w7b23-heal assert: FAILED\n  - ${failures.join('\n  - ')}`)
    process.exitCode = 1
    return
  }
  console.log(`w7b23-heal assert: OK — 53 页 v3 色板/对齐/千分位/日期格式/统计卡 全部达标`)
}

// ─── CLI ───

async function main(): Promise<void> {
  const args = process.argv.slice(2)
  const mode = args[0]
  if (mode !== '--dry-run' && mode !== '--apply' && mode !== '--assert' && mode !== '--rollback') {
    console.error('usage: w7b23-heal.mts --dry-run|--apply|--assert|--rollback')
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
  const models = await listFlowModels(token, 'w7b23-heal')
  const routes = await listRoutes(token, 'w7b23-heal')
  const { log, counts, unknownEnums, pagesSeen } = await runHeal(token, models, routes, fields, mode === '--dry-run')
  const summary = `${mode === '--dry-run' ? 'dry-run' : 'heal'} b23: pages=${pagesSeen.length} recolor=${counts.recolor} enumSwap=${counts.enumSwap} numberSwap=${counts.numberSwap} numberProps=${counts.numberProps} dateProps=${counts.dateProps} alignRight=${counts.alignRight} alignLeft=${counts.alignLeft} statcardRegen=${counts.statcardRegen} columnOptions=${counts.columnOptions} selectOptions=${counts.selectOptions} fieldEnum=${counts.fieldEnum}`
  const out = [...log, summary, ...(unknownEnums.length > 0 ? ['', '未入 v3 映射的枚举值（保持原样）:', ...[...new Set(unknownEnums)].map(v => `  ${v}`)] : [])].join('\n')
  console.log(out)
  if (mode === '--apply') writeFileSync(`${RESEARCH_DIR}w7-b23-heal-run.txt`, `${out}\n`)
}

void main().catch(error => {
  console.error(error)
  process.exit(1)
})
