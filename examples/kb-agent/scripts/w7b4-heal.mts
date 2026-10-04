/**
 * W7-B4 legacy-domain heal for the 经营/协同/看板日历 batch plus the B1
 * field-enum debt:
 *
 * 1. B1 debt (--b1-debt): the B1 22 pages' enum columns render from the
 *    collection field's uiSchema.enum, which still carries W4-era
 *    labels/colors (English lead stages, purple pending_level2, semantic
 *    payment-method colors). B1 healed the flowModels props only — the
 *    rendering source stayed old. This mode rewrites those uiSchema.enum
 *    lists through fields:update to STATUS_PALETTE v3 (the w7b23 fieldEnum
 *    channel scoped to B1's pages).
 * 2. B4 domain heal: the table pages (经营五看板 w9kpi + 应收应付对账 +
 *    任务列表/项目/里程碑/工单/知识文章/审批中心/审批流配置 + AI 工作台's
 *    table) walk the w7b23 channel mix (recolor/enumSwap/numberSwap/
 *    numberProps/dateProps/align/columnOptions/selectOptions/fieldEnum/
 *    statcardRegen), page-scoped through the gridOwnerRoutes walk.
 * 3. Form-face forge: kanban lanes recolor (props.groupOptions + the group
 *    field's uiSchema.enum — the inline source that outranks saved options),
 *    calendar events get fieldNames.colorFieldName wired to the page's status
 *    field (events then color by the v3 enum colors), and the five w9kpi
 *    boards reorganize as「统计卡行 + 图表区 + 明细表」— metricChart stat
 *    cards seated at the grid head through the rows/sizes/rowOrder rewrite
 *    (w6b10 lesson: sortIndex alone never moves blocks), with alertWhen
 *    value coloring for the 呆滞/临期 risk cards (leg17#2).
 * 4. v1 pages (排产甘特/任务甘特/应用中心) are old-tech-stack pages without
 *    flowModels — they take the globalStyle overlay (w7b0-theme.mts
 *    GLOBAL_STYLE B4 section), not this walk. --assert greps the theme row.
 *
 * Every mutation journals its before-state first; --rollback replays in
 * reverse (fieldEnum restores uiSchema.enum, kanbanOptions/calendarColor
 * restore block props, gridLayout restores the grid maps, statcardAdd
 * destroys the created block).
 *
 * Usage:
 *   node --import tsx/esm examples/kb-agent/scripts/w7b4-heal.mts --dry-run
 *   node --import tsx/esm examples/kb-agent/scripts/w7b4-heal.mts --apply
 *   node --import tsx/esm examples/kb-agent/scripts/w7b4-heal.mts --assert
 *   node --import tsx/esm examples/kb-agent/scripts/w7b4-heal.mts --rollback
 *   node --import tsx/esm examples/kb-agent/scripts/w7b4-heal.mts --b1-debt --dry-run|--apply
 */
import { readFileSync, writeFileSync } from 'node:fs'
import {
  call, dataOf, gridOwnerRoutes, listFlowModels, listRoutes, mergeNodeProps, metricChart, signInWithRetry, statCardRaw,
  type FlowModelRow, type RouteRow, type StatusColumnOption,
} from './nocobase-flow-page-lib.mts'

const RESEARCH_DIR = new URL('../../../research/2026-10-03-w7-rework/b4/', import.meta.url).pathname
const ROLLBACK_PATH = `${RESEARCH_DIR}w7-b4-heal-rollback.json`
const B1_RUN_PATH = `${RESEARCH_DIR}w7-b4-b1-debt-run.txt`
const B4_RUN_PATH = `${RESEARCH_DIR}w7-b4-heal-run.txt`

// ─── page scopes ───

/** The B1 audited pages (sales 9 + procurement 8 + CRM 5) — the debt scope. */
const B1_PAGES: Readonly<Record<string, string>> = {
  n17rwc527ujwt: '销售线索', n17sys042q2lz: '客户', n17c3lkyg9zjd6: '联系人',
  n17f2wwpqs60dtk: '产品与服务', n17f2jumvap76nm8: '客户仪表盘',
  w7mrp4w590rm0ws8: '销售订单', n17v6xfvzxoj0f: '报价单', n17vu68623sj9i: '订单',
  n17f2c15ji684n8g: '回款', n17f2utwb01mi3ha: '发票', n17f2y9wfrggxyo: '销售仪表盘',
  w3b3utj5a15khmq: '销售看板', w3b3x8ymuxey8q: '交期日历', w3b3ass8lwvxiy: '计划日历',
  w3pura0kyqfx4f9: '采购申请', w3purlvif0v23bun: '询价管理', w3pur9w1c3yg3rjd: '供应商报价',
  w3purb7o0r3yqi45: '比价表', w3puryzkva06iuhh: '采购订单', w3pur45681oxtcsi: '发票匹配',
  w3pur3an4pwnr1eo: '付款申请', w3b3x35bfqctwkn: '采购看板',
}

/** schemaUid → title; the 27-page B4 scope (12 table + 7 kanban + 3 calendar + 顶级壳 + AI 工作台). */
const B4_PAGES: Readonly<Record<string, string>> = {
  // 经营 5（w9kpi 表格化看板）
  w9kpi7zv98whvfpv: '经营看板', w9kpijpea6p6exnm: '供应链看板', w9kpirvxmfx12l2i: '生产看板',
  w9kpiatwzi4gjbff: '库存看板', w9kpisldougonly: '应收应付对账',
  // 项目协同 9（表格页 + 任务看板/任务日历形态页）
  n17e1ilgn22ts32: '任务列表', n17e1kqp4orpph5: '项目', n17e1m63re4tgre8: '里程碑',
  n17etqhllqqa28: '工单', n17f38lga4ln4s65: '知识文章',
  w1w167h6joi0ck6: '审批中心', w3b4u2r9nnjqvi: '审批流配置',
  n17f12u108kzzyk1: '任务看板', n17f1ns70eshqwy: '任务日历',
  // 看板形态 7（B23 只做了表格面/DOM 断言，本批补块级）
  w3b3utj5a15khmq: '销售看板', w3b3x35bfqctwkn: '采购看板', w3b39xulomz8jj: '生产订单看板',
  w3b3uw3d0mrz1b: '质检看板', w8qm472nluqt32x: '处置看板', h4srm25tmro1wjuw: '整改跟踪',
  // 日历形态 3（交期/计划；任务日历已列）
  w3b3x8ymuxey8q: '交期日历', w3b3ass8lwvxiy: '计划日历',
  // 顶级 JSBlock 壳（shot-only；JSBlock 重写归 B5 层 3b）+ AI 工作台（C 级微调：表格面 heal）
  w6b9cdzrc2lst1dm: '经营总览', n13ai2efgqippp44: 'AI 工作台',
}

/** v1 pages take the globalStyle overlay instead — the assert/shot manifest. */
export const V1_PAGES: Readonly<Record<string, string>> = {
  '96yet9a0x45': '排产甘特', zs3oqvlgqq0: '任务甘特', c9c6wzppejk: '应用中心',
}

// ─── STATUS_PALETTE v3 base (w7b23 verbatim — each heal batch carries the full
// table so the scripts stay independently runnable) + B4 domain additions ───

/** value → [label, color]; the w7b23 base, then the B4 batch additions. */
const B23_PALETTE: Readonly<Record<string, [string, string]>> = {
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

/** Options rewritten to v3 where covered; unknown values keep their entry (w7b23 verbatim). */
function recolorOptions(current: ReadonlyArray<Record<string, unknown>>): { options: StatusColumnOption[], changed: boolean } {
  const options = current.map(entry => {
    const value = String(entry.value ?? '')
    const hit = STATUS_PALETTE[value]
    if (hit === undefined) return { ...entry } as StatusColumnOption
    const [label, color] = hit
    if (entry.label === label && entry.color === color) return { ...entry } as StatusColumnOption
    return { ...entry, label, color } as StatusColumnOption
  })
  const changed = options.some((option, index) => JSON.stringify(option) !== JSON.stringify(current[index] ?? null))
  return { options, changed }
}

// ─── B4 additions on top of the base ───

/** The B4 table: w7b23 base + this batch's domain values (task/project/ticket/CAPA/NC-action/wfl verbs). */
export const STATUS_PALETTE: Readonly<Record<string, [string, string]>> = {
  ...B23_PALETTE,
  // 任务/项目/里程碑（执行 blue、注意 orange、完成 cyan、受阻 red）
  backlog: ['待规划', 'default'], todo: ['待处理', 'orange'], review: ['评审中', 'blue'],
  planning: ['规划中', 'blue'], archived: ['已归档', 'default'], reached: ['已达成', 'green'],
  on_hold: ['暂停', 'orange'], med: ['中', 'blue'], published: ['已发布', 'green'],
  // 工单生命周期
  assigned: ['已指派', 'blue'], waiting_customer: ['待客户', 'orange'],
  waiting_internal: ['待内部', 'orange'], reopened: ['重开', 'red'],
  // CAPA 整改闭环
  initiated: ['发起', 'orange'], replied: ['已回复', 'blue'], verifying: ['验证中', 'blue'],
  // NC 处置动作（退货/报废为负面损失，返工消耗产能为注意）
  return: ['退货', 'red'], rework: ['返工', 'orange'], scrap: ['报废', 'red'],
  // wfl 审批动作/来源（对齐 APPROVAL_ACTION_OPTIONS 既有语义）
  submit: ['提交', 'blue'], approve: ['通过', 'green'], reject: ['驳回', 'red'],
  resubmit: ['重新提交', 'blue'], comment: ['意见', 'default'],
  promote: ['晋级', 'cyan'], demote: ['回退', 'orange'], settle: ['会签收敛', 'green'],
  engine: ['引擎', 'blue'], page: ['页面', 'default'],
  // 优先级四档（hub 任务/项目/工单同表；当前取值即 v3 语义，入表以闭合断言）
  low: ['低', 'default'], medium: ['中', 'blue'], high: ['高', 'orange'], urgent: ['紧急', 'red'],
  // 工单类别（中性元数据）
  customs: ['关务', 'default'], logistics: ['物流仓储', 'default'], compliance: ['合规认证', 'default'],
  channel: ['渠道上架', 'default'], payment: ['结算支付', 'default'], policy: ['政策咨询', 'default'],
  after_sales: ['售后', 'default'], legal: ['法务', 'default'],
  // wfl 锚点（数字字符串值；审批流配置表）
  '0': ['0 草稿侧', 'default'], '1': ['1 生效', 'green'], '2': ['2 作废', 'default'],
  // KPI 快照单位（中性元数据）
  percent: ['百分比', 'default'], count: ['计数', 'default'], money: ['金额', 'default'],
  days: ['天数', 'default'], qty: ['数量', 'default'],
}

const v3For = (value: string): [string, string] | undefined => STATUS_PALETTE[value]

/** Domain-word overrides: one palette value carrying another domain's vocabulary on this field. */
const LABEL_OVERRIDES: Readonly<Record<string, Readonly<Record<string, string>>>> = {
  // blocked=冻结 is wms vocabulary; tasks/projects say 受阻
  'hub_pj_tasks.status': { blocked: '受阻' },
  'hub_pj_projects.status': { blocked: '受阻' },
  // qm 待检 ≠ 待处理；wfl todos 待办 ≠ 进行中；milestone 待达成
  'qm_inspections.status': { pending: '待检' },
  'wfl_approval_todos.status': { open: '待办' },
  'hub_pj_milestones.status': { pending: '待达成' },
}

const labelFor = (collectionField: string, value: string): string | undefined => LABEL_OVERRIDES[collectionField]?.[value]

/** v3 check, override aware: covered values must carry the palette label (or the override) + color. */
const optionV3Ok = (options: ReadonlyArray<Record<string, unknown>>, collectionField?: string): boolean => {
  for (const option of options) {
    const value = String(option.value ?? '')
    const hit = v3For(value)
    if (hit === undefined) continue
    const label = collectionField === undefined ? hit[0] : (labelFor(collectionField, value) ?? hit[0])
    if (option.label !== label || option.color !== hit[1]) return false
  }
  return true
}

/** Options rewritten to v3 (label-override aware) where covered; unknown values keep their entry. */
function recolorFieldOptions(collectionField: string, current: ReadonlyArray<Record<string, unknown>>): { options: StatusColumnOption[], changed: boolean } {
  const options = current.map(entry => {
    const value = String(entry.value ?? '')
    const hit = v3For(value)
    if (hit === undefined) return { ...entry } as StatusColumnOption
    const [paletteLabel, color] = hit
    const label = labelFor(collectionField, value) ?? paletteLabel
    if (entry.label === label && entry.color === color) return { ...entry } as StatusColumnOption
    return { ...entry, label, color } as StatusColumnOption
  })
  const changed = options.some((option, index) => JSON.stringify(option) !== JSON.stringify(current[index] ?? null))
  return { options, changed }
}

// ─── column-kind detection (w7b23 verbatim) ───

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

// ─── field metadata channel ───

type FieldMeta = { name: string, interface: string | null, options: Array<Record<string, unknown>> | null, uiSchema: Record<string, unknown> | null }

async function loadFields(token: string): Promise<Map<string, FieldMeta[]>> {
  const rows = await dataOf(token, 'GET', '/api/fields:list?pageSize=2000&sort=collectionName').catch(() => null) as Array<Record<string, any>> | null
  if (!Array.isArray(rows) || rows.length === 0) throw new Error('no collection-scoped field channel returned rows')
  if (rows.length === 2000) throw new Error('fields:list may be truncated; raise the page size')
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
  return map
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
  | { kind: 'statcardAdd', blockUid: string }
  | { kind: 'statcardQuery', blockUid: string, before: Record<string, unknown> }
  | { kind: 'kanbanOptions', blockUid: string, before: Record<string, unknown> }
  | { kind: 'calendarColor', blockUid: string, before: Record<string, unknown> }
  | { kind: 'gridLayout', gridUid: string, before: { rows: Record<string, unknown>, sizes: Record<string, unknown>, rowOrder: string[] } }

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

// ─── legacy statcard raw parsing (w7b23 verbatim) ───

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

// ─── page attribution (w7b23 walk, page table parameterized) ───

type PageScope = { pageOf: Map<string, string>, pagesSeen: Map<string, string> }

function buildPageScope(models: FlowModelRow[], routes: RouteRow[], pages: Readonly<Record<string, string>>): PageScope {
  const gridOwners = gridOwnerRoutes(models, routes)
  const byUid = new Map(models.map(row => [String(row.uid), row]))
  const pageOf = new Map<string, string>()
  const pagesSeen = new Map<string, string>()
  const resolve = (uid: string, breadcrumb: string[] = []): string => {
    const memo = pageOf.get(uid)
    if (memo !== undefined) return memo
    if (breadcrumb.includes(uid)) return ''
    const row = byUid.get(uid)
    if (row === undefined) return ''
    const owner = gridOwners.get(uid)
    if (owner !== undefined) {
      if (pages[owner] !== undefined) pagesSeen.set(owner, pages[owner]!)
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
  return B4_PAGES[page] === undefined ? undefined : page
}

// ─── form-face config tables ───

/** Calendar blocks → the select field that colors their events. */
const CALENDAR_COLOR_FIELD: Readonly<Record<string, string>> = {
  pur_orders: 'doc_status', so_orders: 'doc_status', mps_plans: 'doc_status',
  mrp_suggestions: 'status', hub_pj_tasks: 'status',
}

/** The w9kpi statcard rows: kpi_code-filtered metric cards with value-alert coloring (leg17#2). */
const KPI_CARDS: ReadonlyArray<{
  page: string, cards: ReadonlyArray<{ title: string, code: string, unit?: '¥' | '%', decimals: number, alertWhen?: 'nonZero' | 'ltZero', alertColor?: string, footnote: string }>
}> = [
  { page: 'w9kpi7zv98whvfpv', cards: [
    { title: '当月收入', code: 'revenue_monthly', unit: '¥', decimals: 2, footnote: 'kpi_snapshots 快照月度汇总' },
    { title: '毛利率', code: 'gross_margin', unit: '%', decimals: 2, alertWhen: 'ltZero', footnote: '快照月度均值；负值标红' },
    { title: '待审批单', code: 'pending_approvals', decimals: 0, alertWhen: 'nonZero', alertColor: '#E76500', footnote: '全类型待审批计数；>0 标橙' },
  ] },
  { page: 'w9kpijpea6p6exnm', cards: [
    { title: 'OTIF', code: 'otif', unit: '%', decimals: 2, footnote: '快照月度均值' },
    { title: '供应商准时到货率', code: 'otd_supplier', unit: '%', decimals: 2, footnote: '快照月度均值' },
    { title: '缺料预警', code: 'shortage_alerts', decimals: 0, alertWhen: 'nonZero', footnote: '缺料预警计数；>0 标红' },
  ] },
  { page: 'w9kpirvxmfx12l2i', cards: [
    { title: '一次合格率', code: 'fpy', unit: '%', decimals: 2, footnote: '快照月度均值' },
    { title: '直通率', code: 'rty', unit: '%', decimals: 2, footnote: '快照月度均值' },
    { title: '计划达成率', code: 'schedule_hit', unit: '%', decimals: 2, footnote: '快照月度均值' },
  ] },
  { page: 'w9kpiatwzi4gjbff', cards: [
    { title: '库存资金占用', code: 'capital_occupied', unit: '¥', decimals: 2, footnote: '快照月度汇总' },
    { title: '呆滞库存占比', code: 'dead_stock_ratio', unit: '%', decimals: 2, alertWhen: 'nonZero', alertColor: '#E76500', footnote: '>0 标橙（呆滞即损失风险）' },
    { title: '临期预警批次', code: 'expiry_alerts', decimals: 0, alertWhen: 'nonZero', footnote: '剩余效期<30 天批次计数；>0 标红' },
    { title: '账实相符率', code: 'count_accuracy', unit: '%', decimals: 2, footnote: '快照月度均值' },
  ] },
  { page: 'w9kpisldougonly', cards: [
    { title: '应收余额', code: 'ar_balance', unit: '¥', decimals: 2, alertWhen: 'ltZero', footnote: 'approved 锚 − 回款抵减；负值标红' },
    { title: '应付余额', code: 'ap_balance', unit: '¥', decimals: 2, footnote: 'confirmed 锚 − 付款抵减' },
    { title: '待审批单', code: 'pending_approvals', decimals: 0, alertWhen: 'nonZero', alertColor: '#E76500', footnote: '全类型待审批计数；>0 标橙' },
  ] },
]

// ─── the heal walk ───

export type HealCounts = { recolor: number, enumSwap: number, numberSwap: number, numberProps: number, alignRight: number, alignLeft: number, dateProps: number, statcardRegen: number, columnOptions: number, selectOptions: number, fieldEnum: number, kanbanOptions: number, calendarColor: number, statcardAdd: number, gridLayout: number }

type ColumnSpec = { columnRow: FlowModelRow, fieldRow: FlowModelRow, fieldPath: string, collection: string, page: string, actions: string[], kind: NumberKind | null }

async function runHeal(token: string, models: FlowModelRow[], routes: RouteRow[], fields: Map<string, FieldMeta[]>, dryRun: boolean): Promise<{ log: string[], counts: HealCounts, unknownEnums: string[], pagesSeen: string[] }> {
  const scope = buildPageScope(models, routes, B4_PAGES)
  const childrenOf = (uid: string): FlowModelRow[] => models.filter(row => String(row.parentId ?? '') === uid)
  const log: string[] = []
  const counts: HealCounts = { recolor: 0, enumSwap: 0, numberSwap: 0, numberProps: 0, alignRight: 0, alignLeft: 0, dateProps: 0, statcardRegen: 0, columnOptions: 0, selectOptions: 0, fieldEnum: 0, kanbanOptions: 0, calendarColor: 0, statcardAdd: 0, gridLayout: 0 }
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
    const collectionField = `${collection}.${fieldPath}`
    const actions: string[] = []
    let kind: NumberKind | null = null
    if (use === 'DisplayEnumFieldModel' && Array.isArray(props.options)) {
      actions.push('recolor')
      if (columnRow.props?.align !== 'left') actions.push('alignLeft')
      for (const option of props.options as Array<Record<string, unknown>>) {
        if (v3For(String(option.value ?? '')) === undefined) unknownEnums.push(`${collectionField}=${String(option.value ?? '')}`)
      }
    }
    if (use === 'DisplayEnumFieldModel' && !Array.isArray(props.options)) {
      if (columnRow.props?.align !== 'left') actions.push('alignLeft')
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
    const collectionField = `${collection}.${fieldPath}`
    const save = async (patch: Record<string, unknown>): Promise<void> => {
      await dataOf(token, 'POST', '/api/flowModels:save', {
        uid: fieldRow.uid, parentId: fieldRow.parentId, subKey: fieldRow.subKey, ...patch,
      })
    }
    if (actions.includes('enumSwap')) {
      const meta = fields.get(collection)?.find(field => field.name === fieldPath)
      if (meta?.options == null || meta.options.length === 0) throw new Error(`enumSwap ${collectionField} 无字段选项——拒绝盲换`)
      const options = meta.options.map(entry => {
        const hit = v3For(String(entry.value ?? ''))
        return hit === undefined
          ? { label: String(entry.label ?? entry.value ?? ''), color: 'default', value: entry.value }
          : { label: labelFor(collectionField, String(entry.value ?? '')) ?? hit[0], color: hit[1], value: entry.value }
      })
      counts.enumSwap++
      log.push(`  enumSwap ${B4_PAGES[page]} ${collectionField}（${options.length} 项 v3 选项）`)
      if (!dryRun) {
        journal.push({ kind: 'enumSwap', fieldUid: String(fieldRow.uid), beforeUse: String(fieldRow.use ?? ''), before: JSON.parse(JSON.stringify(fieldRow.props ?? {})) })
        await save({ use: 'DisplayEnumFieldModel', props: { options } })
      }
    }
    if (actions.includes('numberSwap')) {
      counts.numberSwap++
      log.push(`  numberSwap ${B4_PAGES[page]} ${collectionField} → DisplayNumberFieldModel（${kind}）`)
      if (!dryRun) {
        journal.push({ kind: 'numberSwap', fieldUid: String(fieldRow.uid), beforeUse: String(fieldRow.use ?? ''), before: JSON.parse(JSON.stringify(fieldRow.props ?? {})) })
        await save({ use: 'DisplayNumberFieldModel', props: numberPropsFor(kind ?? 'plain') })
      }
    }
    if (actions.includes('recolor')) {
      const current = (fieldRow.props ?? {}).options as Array<Record<string, unknown>>
      const { options, changed } = recolorFieldOptions(collectionField, current)
      if (changed) {
        counts.recolor++
        log.push(`  recolor ${B4_PAGES[page]} ${collectionField}`)
        if (!dryRun) {
          journal.push({ kind: 'fieldOptions', fieldUid: String(fieldRow.uid), before: JSON.parse(JSON.stringify(fieldRow.props ?? {})) })
          await save({ props: { ...fieldRow.props, options } })
        }
      }
    }
    if (actions.includes('numberProps') && kind !== null) {
      counts.numberProps++
      log.push(`  numberProps ${B4_PAGES[page]} ${collectionField}（${kind} 千分位）`)
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
        log.push(`  dateProps ${B4_PAGES[page]} ${collectionField}（${format}）`)
        if (!dryRun) {
          journal.push({ kind: 'dateProps', fieldUid: String(fieldRow.uid), before: JSON.parse(JSON.stringify(fieldRow.props ?? {})) })
          await save({ props: { ...fieldRow.props, format } })
        }
      }
    }
    if (actions.includes('alignRight') && columnRow.props?.align !== 'right') {
      counts.alignRight++
      log.push(`  align→right ${B4_PAGES[page]} ${collectionField}`)
      if (!dryRun) {
        journal.push({ kind: 'columnAlign', columnUid: String(columnRow.uid), before: JSON.parse(JSON.stringify(columnRow.props ?? {})) })
        await mergeNodeProps(token, String(columnRow.uid), { align: 'right' })
      }
    }
    if (actions.includes('alignLeft') && columnRow.props?.align !== 'left') {
      counts.alignLeft++
      log.push(`  align→left ${B4_PAGES[page]} ${collectionField}`)
      if (!dryRun) {
        journal.push({ kind: 'columnAlign', columnUid: String(columnRow.uid), before: JSON.parse(JSON.stringify(columnRow.props ?? {})) })
        await mergeNodeProps(token, String(columnRow.uid), { align: 'left' })
      }
    }
    appendJournal(journal)
  }

  // column-row options + select options (w7b23 channels, override aware)
  for (const columnRow of models) {
    if (columnRow?.use !== 'TableColumnModel') continue
    const options = (columnRow.props ?? {}).options
    if (!Array.isArray(options)) continue
    const page = inScope(scope, String(columnRow.uid))
    if (page === undefined) continue
    const fieldPath = String(columnRow?.stepParams?.fieldSettings?.init?.fieldPath ?? '')
    const collection = String(columnRow?.stepParams?.fieldSettings?.init?.collectionName ?? '')
    const { options: next, changed } = recolorFieldOptions(`${collection}.${fieldPath}`, options as Array<Record<string, unknown>>)
    if (!changed) continue
    counts.columnOptions++
    log.push(`  columnOptions ${B4_PAGES[page]} ${collection}.${fieldPath}`)
    if (!dryRun) {
      appendJournal([{ kind: 'columnOptions', columnUid: String(columnRow.uid), before: JSON.parse(JSON.stringify(columnRow.props ?? {})) }])
      await dataOf(token, 'POST', '/api/flowModels:save', {
        uid: columnRow.uid, parentId: columnRow.parentId, subKey: columnRow.subKey,
        props: { ...columnRow.props, options: next },
      })
    }
  }
  for (const fieldRow of models) {
    if (fieldRow?.use !== 'SelectFieldModel') continue
    const options = (fieldRow.props ?? {}).options
    if (!Array.isArray(options)) continue
    const page = inScope(scope, String(fieldRow.uid))
    if (page === undefined) continue
    const { options: next, changed } = recolorOptions(options as Array<Record<string, unknown>>)
    if (!changed) continue
    counts.selectOptions++
    log.push(`  selectOptions ${B4_PAGES[page]} select ${String(fieldRow.uid)}`)
    if (!dryRun) {
      appendJournal([{ kind: 'selectOptions', fieldUid: String(fieldRow.uid), before: JSON.parse(JSON.stringify(fieldRow.props ?? {})) }])
      await dataOf(token, 'POST', '/api/flowModels:save', {
        uid: fieldRow.uid, parentId: fieldRow.parentId, subKey: fieldRow.subKey,
        props: { ...fieldRow.props, options: next },
      })
    }
  }

  // fieldEnum channel: the runtime Tag source (uiSchema.enum) for every enum
  // column under B4 pages + every kanban group field (its inline options
  // outrank the saved lane options — lane colors ride this rewrite).
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
    for (const row of models) {
      if (row?.use !== 'KanbanBlockModel') continue
      const page = inScope(scope, String(row.uid))
      if (page === undefined) continue
      const collection = String(((row.stepParams ?? {}) as Record<string, any>)?.resourceSettings?.init?.collectionName ?? '')
      const groupField = String((row.props ?? {}).groupField ?? '')
      if (collection === '' || groupField === '') continue
      enumPairs.set(`${collection}.${groupField}`, { collection, fieldPath: groupField })
    }
    for (const { collection, fieldPath } of enumPairs.values()) {
      const meta = fields.get(collection)?.find(field => field.name === fieldPath)
      if (meta?.options == null || meta.options.length === 0) continue
      const { options: next, changed } = recolorFieldOptions(`${collection}.${fieldPath}`, meta.options)
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

  // kanban lane recolor: props.groupOptions（the field's inline enum above
  // wins at render, but the saved list stays in sync）.
  for (const row of models) {
    if (row?.use !== 'KanbanBlockModel') continue
    const page = inScope(scope, String(row.uid))
    if (page === undefined) continue
    const props = (row.props ?? {}) as Record<string, unknown>
    const collection = String(((row.stepParams ?? {}) as Record<string, any>)?.resourceSettings?.init?.collectionName ?? '')
    const groupField = String(props.groupField ?? '')
    if (!Array.isArray(props.groupOptions)) continue
    const { options: next, changed } = recolorFieldOptions(`${collection}.${groupField}`, props.groupOptions as Array<Record<string, unknown>>)
    if (!changed) continue
    counts.kanbanOptions++
    log.push(`  kanbanOptions ${B4_PAGES[page]} ${collection}.${groupField} 泳道 ${next.length} 道 → v3`)
    if (!dryRun) {
      appendJournal([{ kind: 'kanbanOptions', blockUid: String(row.uid), before: JSON.parse(JSON.stringify(props)) }])
      await dataOf(token, 'POST', '/api/flowModels:save', {
        uid: row.uid, parentId: row.parentId, subKey: row.subKey,
        props: { ...props, groupOptions: next },
      })
    }
  }

  // calendar event color: wire fieldNames.colorFieldName to the collection's
  // status field — events color through the v3 uiSchema enum (the select
  // interface's useGetColor reads the field options).
  for (const row of models) {
    if (row?.use !== 'CalendarBlockModel') continue
    const page = inScope(scope, String(row.uid))
    if (page === undefined) continue
    const props = (row.props ?? {}) as Record<string, any>
    const fieldNames = (props.fieldNames ?? {}) as Record<string, unknown>
    const collection = String(((row.stepParams ?? {}) as Record<string, any>)?.resourceSettings?.init?.collectionName ?? '')
    const colorField = CALENDAR_COLOR_FIELD[collection]
    if (colorField === undefined) continue
    if (fieldNames.colorFieldName === colorField) continue
    counts.calendarColor++
    log.push(`  calendarColor ${B4_PAGES[page]} ${collection} 事件色 ← ${colorField}`)
    if (!dryRun) {
      appendJournal([{ kind: 'calendarColor', blockUid: String(row.uid), before: JSON.parse(JSON.stringify(props)) }])
      await dataOf(token, 'POST', '/api/flowModels:save', {
        uid: row.uid, parentId: row.parentId, subKey: row.subKey,
        props: { ...props, fieldNames: { ...fieldNames, colorFieldName: colorField } },
      })
    }
  }

  // w9kpi reorganization: statcard row at the grid head, chart rows hoisted
  // after it, detail tables last (the grid renders by rows/sizes/rowOrder —
  // w6b10 lesson: sortIndex alone never moves blocks).
  const gridByPage = new Map<string, string>()
  for (const row of models) {
    if (row?.use !== 'BlockGridModel') continue
    const page = scope.pageOf.get(String(row.uid)) ?? ''
    if (B4_PAGES[page] === undefined) continue
    gridByPage.set(page, String(row.uid))
  }
  for (const spec of KPI_CARDS) {
    const pageName = B4_PAGES[spec.page]!
    const gridUid = gridByPage.get(spec.page)
    if (gridUid === undefined) { log.push(`  ! ${pageName} 无 BlockGridModel（跳过统计卡行）`); continue }
    const surface = await dataOf(token, 'GET', `/api/flowSurfaces:get?uid=${encodeURIComponent(gridUid)}`).catch(() => null) as { tree?: FlowModelRow } | null
    const tree = surface?.tree ?? null
    const gridSettings = ((tree?.stepParams ?? {}) as Record<string, any>)?.gridSettings?.grid
    if (tree === null || gridSettings?.rows === undefined || !Array.isArray(gridSettings?.rowOrder)) {
      log.push(`  ! ${pageName} grid 无 rows/rowOrder（layout mode 差异）——统计卡行平台限制候选`)
      continue
    }
    const chartUids = new Set<string>()
    for (const row of models) {
      if (row?.use !== 'ChartBlockModel') continue
      if (scope.pageOf.get(String(row.uid)) !== spec.page) continue
      chartUids.add(String(row.uid))
    }
    // idempotent re-run: existing cards matched by raw marker + title under the grid
    const cardsUnderGrid = models.filter(row => {
      if (row?.use !== 'ChartBlockModel') return false
      if (String(row.parentId ?? '') !== gridUid) return false
      return spec.cards.some(card => (row.props ?? {}).title === card.title && chartRawOf(row).includes('statcard'))
    })
    // snapshot caliber: the cards must read the LATEST snapshot day, not a
    // whole-history avg (资金占用 11M vs 历史均值 875K 的口径漂移)。
    const latestRows = await dataOf(token, 'GET', '/api/kpi_snapshots:list?sort=-calc_date&page=1&pageSize=1').catch(() => null) as { data?: Array<Record<string, any>> } | Array<Record<string, any>> | null
    const latestList = Array.isArray(latestRows) ? latestRows : (latestRows?.data ?? [])
    const latestDate = latestList[0]?.calc_date
    if (typeof latestDate !== 'string' || latestDate === '') { log.push(`  ! ${pageName} kpi_snapshots 无快照行（跳过统计卡行）`); continue }
    const cardUids: string[] = []
    let created = 0
    for (const card of spec.cards) {
      const existing = cardsUnderGrid.find(row => (row.props ?? {}).title === card.title)
      if (existing !== undefined) {
        // refresh an existing card whose filter still targets another day (or none)
        const items = ((existing.stepParams ?? {}) as Record<string, any>)?.chartSettings?.configure?.query?.filter?.items
        const calcItem = Array.isArray(items) ? items.find((item: Record<string, any>) => item.path === 'calc_date') : undefined
        if (!dryRun && (calcItem === undefined || String(calcItem.value) !== latestDate)) {
          const stepParams = JSON.parse(JSON.stringify((existing.stepParams ?? {}) as Record<string, unknown>))
          const query = (stepParams.chartSettings ?? {}).configure.query
          const others = Array.isArray(query.filter?.items) ? query.filter.items.filter((item: Record<string, any>) => item.path !== 'calc_date') : []
          query.filter = { logic: '$and', items: [...others, { path: 'calc_date', operator: '$eq', value: latestDate }] }
          appendJournal([{ kind: 'statcardQuery', blockUid: String(existing.uid), before: JSON.parse(JSON.stringify((existing.stepParams ?? {}) as Record<string, unknown>)) }])
          await dataOf(token, 'POST', '/api/flowModels:save', {
            uid: existing.uid, parentId: existing.parentId, subKey: existing.subKey, stepParams,
          })
          log.push(`  statcardQuery ${pageName} ${card.title} → calc_date=${latestDate}`)
        }
        cardUids.push(String(existing.uid))
        continue
      }
      counts.statcardAdd++
      created++
      log.push(`  statcardAdd ${pageName} ${card.title}${card.alertWhen === undefined ? '' : `（alertWhen=${card.alertWhen}）`}`)
      if (!dryRun) {
        const uid = await metricChart(token, {
          gridUid, title: card.title, collection: 'kpi_snapshots',
          measure: { field: 'value', aggregation: 'avg', alias: 'v' },
          filter: { kpi_code: card.code, calc_date: latestDate },
          footnote: card.footnote,
          ...(card.unit === '¥' ? { unitPrefix: '¥' } : {}),
          ...(card.unit === '%' ? { unitSuffix: '%' } : {}),
          decimals: card.decimals,
          ...(card.alertWhen === undefined ? {} : { alertWhen: card.alertWhen, ...(card.alertColor === undefined ? {} : { alertColor: card.alertColor }) }),
        })
        appendJournal([{ kind: 'statcardAdd', blockUid: uid }])
        cardUids.push(uid)
      }
    }
    const rowsBefore = gridSettings.rows as Record<string, unknown>
    const sizesBefore = (gridSettings.sizes ?? {}) as Record<string, unknown>
    const rowOrderBefore = (gridSettings.rowOrder as string[]).map(String)
    const mine = new Set(cardUids)
    const rows: Record<string, unknown> = {}
    const sizes: Record<string, unknown> = {}
    for (const [key, cells] of Object.entries(rowsBefore)) {
      if (key === 'w7b4cards') continue
      const kept = (Array.isArray(cells) ? cells : []).map(cell => (Array.isArray(cell) ? cell.filter(uid => !mine.has(String(uid))) : [])).filter(cell => cell.length > 0)
      if (kept.length === 0) continue
      rows[key] = kept
      sizes[key] = sizesBefore[key] ?? kept.map(() => 24)
    }
    const n = cardUids.length
    const base = n === 0 ? 0 : Math.floor(24 / n)
    if (n > 0) {
      rows.w7b4cards = cardUids.map(uid => [uid])
      sizes.w7b4cards = Array.from({ length: n }, (_, index) => (index === 0 ? 24 - base * (n - 1) : base))
    }
    const isChartRow = (key: string): boolean =>
      ((Array.isArray(rowsBefore[key]) ? rowsBefore[key] : []) as unknown[][]).some(cell =>
        (Array.isArray(cell) ? cell : []).some(uid => chartUids.has(String(uid))))
    const chartRows = Object.keys(rows).filter(key => key !== 'w7b4cards' && isChartRow(key))
    const restRows = Object.keys(rows).filter(key => key !== 'w7b4cards' && !isChartRow(key))
    const rowOrder = [...(n > 0 ? ['w7b4cards'] : []), ...chartRows, ...restRows]
    if (dryRun) {
      log.push(`  gridLayout(dry) ${pageName}: cards=${n} chartRows=${chartRows.length} rest=${restRows.length} order=${rowOrder.join(',')}`)
      continue
    }
    counts.gridLayout++
    log.push(`  gridLayout ${pageName}: 统计卡行置顶 + 图表区前移（${chartRows.length} 图表行）+ 明细表殿后`)
    appendJournal([{ kind: 'gridLayout', gridUid, before: { rows: rowsBefore, sizes: sizesBefore, rowOrder: rowOrderBefore } }])
    await dataOf(token, 'POST', '/api/flowModels:save', {
      uid: gridUid,
      ...(tree.parentId === undefined ? {} : { parentId: tree.parentId }),
      ...(tree.subKey === undefined ? {} : { subKey: tree.subKey }),
      props: { ...((tree.props ?? {}) as Record<string, unknown>), rows, sizes, rowOrder },
      stepParams: { gridSettings: { grid: { rows, sizes, rowOrder } } },
    })
  }

  // statcard regen for legacy w4b3 raws under in-scope pages (w7b23 channel).
  for (const row of models) {
    if (row?.use !== 'ChartBlockModel') continue
    const raw = chartRawOf(row)
    if (!raw.includes('w4b3 statcard') || raw.includes('w7 forge statcard')) continue
    const page = inScope(scope, String(row.uid))
    if (page === undefined) continue
    const spec = parseStatcard(raw)
    if (spec === null) { log.push(`  ! statcard 解析失败 ${String(row.uid)}（跳过）`); continue }
    counts.statcardRegen++
    log.push(`  statcardRegen ${B4_PAGES[page]} ${spec.title}`)
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

// ─── B1 field-enum debt ───

async function runB1Debt(token: string, models: FlowModelRow[], routes: RouteRow[], fields: Map<string, FieldMeta[]>, dryRun: boolean): Promise<{ log: string[], changed: number, total: number }> {
  const scope = buildPageScope(models, routes, B1_PAGES)
  const childrenOf = (uid: string): FlowModelRow[] => models.filter(row => String(row.parentId ?? '') === uid)
  const enumPairs = new Map<string, { collection: string, fieldPath: string, page: string }>()
  for (const columnRow of models) {
    if (columnRow?.use !== 'TableColumnModel') continue
    const page = scope.pageOf.get(String(columnRow.uid)) ?? ''
    if (B1_PAGES[page] === undefined) continue
    const fieldRow = childrenOf(String(columnRow.uid)).find(row => row.subKey === 'field')
    if (fieldRow === undefined || String(fieldRow.use ?? '') !== 'DisplayEnumFieldModel') continue
    const fieldPath = String(columnRow?.stepParams?.fieldSettings?.init?.fieldPath ?? '')
    const collection = String(fieldRow?.stepParams?.fieldSettings?.init?.collectionName
      ?? columnRow?.stepParams?.fieldSettings?.init?.collectionName ?? '')
    if (collection === '' || fieldPath === '') continue
    enumPairs.set(`${collection}.${fieldPath}`, { collection, fieldPath, page: B1_PAGES[page]! })
  }
  const log: string[] = []
  let changed = 0
  for (const { collection, fieldPath, page } of enumPairs.values()) {
    const meta = fields.get(collection)?.find(field => field.name === fieldPath)
    if (meta?.options == null || meta.options.length === 0) continue
    const { options: next, changed: differs } = recolorFieldOptions(`${collection}.${fieldPath}`, meta.options)
    if (!differs) continue
    changed++
    log.push(`  fieldEnum ${collection}.${fieldPath} [${page}]（uiSchema.enum → v3）`)
    if (!dryRun) {
      appendJournal([{ kind: 'fieldEnum', collection, field: fieldPath, before: JSON.parse(JSON.stringify(meta.options)) }])
      const uiSchema = { ...(meta.uiSchema ?? {}), enum: next }
      await dataOf(token, 'POST', `/api/collections/${collection}/fields:update?filterByTk=${fieldPath}`, { uiSchema })
      meta.options = next
    }
  }
  return { log, changed, total: enumPairs.size }
}

// ─── rollback ───

const HEAL_PROP_KEYS = ['align', 'separator', 'numberStep', 'addonBefore', 'format', 'options', 'groupOptions', 'fieldNames']

function clearMissing(before: Record<string, unknown>): Record<string, unknown> {
  const props = { ...before }
  for (const key of HEAL_PROP_KEYS) if (!(key in props)) props[key] = null
  return props
}

async function rollback(token: string): Promise<string[]> {
  const models = await listFlowModels(token, 'w7b4-rollback')
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
    if (entry.kind === 'statcardQuery') {
      const row = byUid.get(entry.blockUid)
      if (row === undefined) { undone.push(entry); continue }
      await dataOf(token, 'POST', '/api/flowModels:save', {
        uid: entry.blockUid, parentId: row.parentId, subKey: row.subKey, stepParams: entry.before,
      })
      log.push(`rollback statcardQuery ${entry.blockUid}`)
      continue
    }
    if (entry.kind === 'statcardAdd') {
      await call(token, 'DELETE', `/api/flowModels:destroy?filterByTk=${encodeURIComponent(entry.blockUid)}`)
      log.push(`rollback statcardAdd(destroy) ${entry.blockUid}`)
      continue
    }
    if (entry.kind === 'gridLayout') {
      await dataOf(token, 'POST', '/api/flowModels:save', {
        uid: entry.gridUid,
        props: entry.before,
        stepParams: { gridSettings: { grid: entry.before } },
      })
      log.push(`rollback gridLayout ${entry.gridUid}`)
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
    if (entry.kind === 'kanbanOptions' || entry.kind === 'calendarColor') {
      const row = byUid.get(entry.blockUid)
      if (row === undefined) { undone.push(entry); continue }
      await dataOf(token, 'POST', '/api/flowModels:save', {
        uid: entry.blockUid, parentId: row.parentId, subKey: row.subKey, props: clearMissing(entry.before),
      })
      log.push(`rollback ${entry.kind} ${entry.blockUid}`)
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

// ─── assert ───

async function assertHealed(token: string): Promise<void> {
  const models = await listFlowModels(token, 'w7b4-assert')
  const routes = await listRoutes(token, 'w7b4-assert')
  const scope = buildPageScope(models, routes, B4_PAGES)
  const childrenOf = (uid: string): FlowModelRow[] => models.filter(row => String(row.parentId ?? '') === uid)
  const failures: string[] = []
  const fields = await loadFields(token)

  // ① table-page invariants (w7b23 caliber)
  let totals = { enumColumns: 0, colorMismatch: 0, enumNoLeft: 0, numberColumns: 0, numberNoRight: 0, numberNoSeparator: 0, dateColumns: 0, dateNoRight: 0, dateNoFormat: 0, bareNumeric: 0, columnOptionLists: 0, columnOptionMismatch: 0, statcards: 0, statcardLegacy: 0 }
  let selectOptionLists = 0, selectOptionMismatch = 0
  const enumPairs = new Map<string, { collection: string, fieldPath: string }>()
  for (const columnRow of models) {
    if (columnRow?.use !== 'TableColumnModel') continue
    const page = inScope(scope, String(columnRow.uid))
    if (page === undefined) continue
    const fieldRow = childrenOf(String(columnRow.uid)).find(row => row.subKey === 'field')
    if (fieldRow === undefined) continue
    const fieldPath = String(columnRow?.stepParams?.fieldSettings?.init?.fieldPath ?? '')
    const collection = String(fieldRow?.stepParams?.fieldSettings?.init?.collectionName
      ?? columnRow?.stepParams?.fieldSettings?.init?.collectionName ?? '')
    const collectionField = `${collection}.${fieldPath}`
    const use = String(fieldRow.use ?? '')
    const align = (columnRow.props ?? {}).align
    const props = (fieldRow.props ?? {}) as Record<string, unknown>
    if (Array.isArray((columnRow.props ?? {}).options)) {
      totals.columnOptionLists++
      if (!optionV3Ok((columnRow.props as Record<string, unknown>).options as Array<Record<string, unknown>>, collectionField)) totals.columnOptionMismatch++
    }
    if (use === 'DisplayEnumFieldModel') {
      if (collection !== '' && fieldPath !== '') enumPairs.set(collectionField, { collection, fieldPath })
      if (Array.isArray(props.options)) {
        totals.enumColumns++
        if (!optionV3Ok(props.options as Array<Record<string, unknown>>, collectionField)) totals.colorMismatch++
      }
      if (align !== 'left') totals.enumNoLeft++
    } else if (use === 'DisplayNumberFieldModel' && !(fieldPath === 'id' || /_id$/.test(fieldPath))) {
      totals.numberColumns++
      if (align !== 'right') totals.numberNoRight++
      if (typeof props.separator !== 'string' || props.separator === '') totals.numberNoSeparator++
    } else if (use === 'DisplayDateTimeFieldModel') {
      totals.dateColumns++
      if (align !== 'right') totals.dateNoRight++
      if (typeof props.format !== 'string' || props.format === '') totals.dateNoFormat++
    }
    if (use === 'DisplayTextFieldModel' && fields.get(collection)?.find(field => field.name === fieldPath)?.interface === 'number'
      && /amount|price|total|value|cost|fee|balance|payable|receivable|qty|quantity/i.test(fieldPath)) totals.bareNumeric++
  }
  for (const row of models) {
    if (row?.use !== 'SelectFieldModel') continue
    const options = (row.props ?? {}).options
    if (!Array.isArray(options)) continue
    if (inScope(scope, String(row.uid)) === undefined) continue
    selectOptionLists++
    if (!optionV3Ok(options as Array<Record<string, unknown>>)) selectOptionMismatch++
  }
  for (const row of models) {
    if (row?.use !== 'ChartBlockModel') continue
    const raw = chartRawOf(row)
    if (!raw.includes('w4b3 statcard')) continue
    if (inScope(scope, String(row.uid)) === undefined) continue
    totals.statcards++
    if (raw.includes('#1d4ed8') || raw.includes('#6b7280') || raw.includes('#9ca3af') || !raw.includes('w7 forge statcard')) totals.statcardLegacy++
  }

  // ② fieldEnum render source (B4 enum columns + kanban group fields)
  let fieldEnumLists = 0, fieldEnumMismatch = 0
  for (const row of models) {
    if (row?.use !== 'KanbanBlockModel') continue
    const page = inScope(scope, String(row.uid))
    if (page === undefined) continue
    const collection = String(((row.stepParams ?? {}) as Record<string, any>)?.resourceSettings?.init?.collectionName ?? '')
    const groupField = String((row.props ?? {}).groupField ?? '')
    if (collection !== '' && groupField !== '') enumPairs.set(`${collection}.${groupField}`, { collection, fieldPath: groupField })
  }
  for (const { collection, fieldPath } of enumPairs.values()) {
    const meta = fields.get(collection)?.find(field => field.name === fieldPath)
    if (meta?.options == null || meta.options.length === 0) continue
    fieldEnumLists++
    if (!optionV3Ok(meta.options, `${collection}.${fieldPath}`)) fieldEnumMismatch++
  }

  // ③ kanban lanes v3 + calendar colorFieldName + w9 grid layout
  let kanbanLanes = 0, kanbanLaneMismatch = 0
  for (const row of models) {
    if (row?.use !== 'KanbanBlockModel') continue
    const page = inScope(scope, String(row.uid))
    if (page === undefined) continue
    const props = (row.props ?? {}) as Record<string, unknown>
    const collection = String(((row.stepParams ?? {}) as Record<string, any>)?.resourceSettings?.init?.collectionName ?? '')
    const groupField = String(props.groupField ?? '')
    if (!Array.isArray(props.groupOptions)) continue
    for (const lane of props.groupOptions as Array<Record<string, unknown>>) {
      kanbanLanes++
      if (!optionV3Ok([lane], `${collection}.${groupField}`)) kanbanLaneMismatch++
    }
  }
  let calendars = 0, calendarNoColor = 0
  for (const row of models) {
    if (row?.use !== 'CalendarBlockModel') continue
    const page = inScope(scope, String(row.uid))
    if (page === undefined) continue
    const collection = String(((row.stepParams ?? {}) as Record<string, any>)?.resourceSettings?.init?.collectionName ?? '')
    const colorField = CALENDAR_COLOR_FIELD[collection]
    if (colorField === undefined) continue
    calendars++
    const fieldNames = (((row.props ?? {}) as Record<string, any>).fieldNames ?? {}) as Record<string, unknown>
    if (fieldNames.colorFieldName !== colorField) calendarNoColor++
  }
  let kpiGrids = 0, kpiGridBad = 0
  for (const spec of KPI_CARDS) {
    const gridRow = models.find(row => row?.use === 'BlockGridModel' && scope.pageOf.get(String(row.uid)) === spec.page)
    if (gridRow === undefined) { kpiGrids++; kpiGridBad++; failures.push(`${B4_PAGES[spec.page]} 无 BlockGridModel`); continue }
    const surface = await dataOf(token, 'GET', `/api/flowSurfaces:get?uid=${encodeURIComponent(String(gridRow.uid))}`).catch(() => null) as { tree?: FlowModelRow } | null
    const grid = ((surface?.tree?.stepParams ?? {}) as Record<string, any>)?.gridSettings?.grid
    kpiGrids++
    if (grid?.rows?.w7b4cards === undefined || grid?.rowOrder?.[0] !== 'w7b4cards') kpiGridBad++
    if (Array.isArray(grid?.rows?.w7b4cards) && grid.rows.w7b4cards.length !== spec.cards.length) kpiGridBad++
  }

  // ④ B1 debt: every B1 enum pair's uiSchema must be v3 (0 mismatch)
  const b1Scope = buildPageScope(models, routes, B1_PAGES)
  const b1Pairs = new Map<string, { collection: string, fieldPath: string }>()
  for (const columnRow of models) {
    if (columnRow?.use !== 'TableColumnModel') continue
    const page = b1Scope.pageOf.get(String(columnRow.uid)) ?? ''
    if (B1_PAGES[page] === undefined) continue
    const fieldRow = childrenOf(String(columnRow.uid)).find(row => row.subKey === 'field')
    if (fieldRow === undefined || String(fieldRow.use ?? '') !== 'DisplayEnumFieldModel') continue
    const fieldPath = String(columnRow?.stepParams?.fieldSettings?.init?.fieldPath ?? '')
    const collection = String(fieldRow?.stepParams?.fieldSettings?.init?.collectionName
      ?? columnRow?.stepParams?.fieldSettings?.init?.collectionName ?? '')
    if (collection !== '' && fieldPath !== '') b1Pairs.set(`${collection}.${fieldPath}`, { collection, fieldPath })
  }
  let b1Lists = 0, b1Mismatch = 0
  for (const { collection, fieldPath } of b1Pairs.values()) {
    const meta = fields.get(collection)?.find(field => field.name === fieldPath)
    if (meta?.options == null || meta.options.length === 0) continue
    b1Lists++
    if (!optionV3Ok(meta.options, `${collection}.${fieldPath}`)) b1Mismatch++
  }

  // ⑤ v1 overlay: the w7-forge theme row must carry the B4 gantt section
  const themeRows = await dataOf(token, 'GET', '/api/themeConfig:list?pageSize=50') as { data?: Array<Record<string, any>> } | Array<Record<string, any>> | null
  const themeList = Array.isArray(themeRows) ? themeRows : (themeRows?.data ?? [])
  const forge = themeList.find(row => String(row.uid) === 'w7-forge')
  const globalStyle = String(forge?.config?.token?.globalStyle ?? '')
  const v1Ok = globalStyle.includes('W7-B4 v1 gantt') && globalStyle.includes('.today rect') && globalStyle.includes('.gridTick')

  // ⑥ coverage: every B4 page must appear in the flowModels attribution map
  const missing = Object.keys(B4_PAGES).filter(uid => scope.pagesSeen.get(uid) === undefined)

  const report = [
    `enumColumns=${totals.enumColumns}`, `colorMismatch=${totals.colorMismatch}`, `enumNoLeft=${totals.enumNoLeft}`,
    `numberNoRight=${totals.numberNoRight}/${totals.numberColumns}`, `numberNoSeparator=${totals.numberNoSeparator}/${totals.numberColumns}`,
    `dateNoRight=${totals.dateNoRight}/${totals.dateColumns}`, `dateNoFormat=${totals.dateNoFormat}/${totals.dateColumns}`,
    `bareNumeric=${totals.bareNumeric}`, `statcardLegacy=${totals.statcardLegacy}/${totals.statcards}`,
    `columnOptionMismatch=${totals.columnOptionMismatch}/${totals.columnOptionLists}`, `selectOptionMismatch=${selectOptionMismatch}/${selectOptionLists}`,
    `fieldEnumMismatch=${fieldEnumMismatch}/${fieldEnumLists}`,
    `kanbanLaneMismatch=${kanbanLaneMismatch}/${kanbanLanes}`, `calendarNoColor=${calendarNoColor}/${calendars}`,
    `kpiGridBad=${kpiGridBad}/${kpiGrids}`, `b1FieldEnumMismatch=${b1Mismatch}/${b1Lists}`, `v1Overlay=${v1Ok ? 'ok' : 'MISSING'}`,
  ]
  console.log(`w7b4-heal assert: pages=${scope.pagesSeen.size}/${Object.keys(B4_PAGES).length} ${report.join(' ')}`)
  if (totals.colorMismatch !== 0) failures.push(`STATUS_PALETTE v3 未全覆盖: ${totals.colorMismatch} 列`)
  if (fieldEnumMismatch !== 0) failures.push(`B4 字段 uiSchema.enum 渲染源未达 v3: ${fieldEnumMismatch}/${fieldEnumLists}`)
  if (totals.enumNoLeft !== 0) failures.push(`enum 列未左对齐: ${totals.enumNoLeft}`)
  if (totals.numberNoRight !== 0) failures.push(`数字列未右对齐: ${totals.numberNoRight}/${totals.numberColumns}`)
  if (totals.numberNoSeparator !== 0) failures.push(`数字列无千分位: ${totals.numberNoSeparator}/${totals.numberColumns}`)
  if (totals.dateNoRight !== 0) failures.push(`日期列未右对齐: ${totals.dateNoRight}/${totals.dateColumns}`)
  if (totals.dateNoFormat !== 0) failures.push(`日期列无统一格式: ${totals.dateNoFormat}/${totals.dateColumns}`)
  if (totals.columnOptionMismatch !== 0) failures.push(`列头筛选 options 未达 v3: ${totals.columnOptionMismatch}/${totals.columnOptionLists}`)
  if (selectOptionMismatch !== 0) failures.push(`表单/筛选 select options 未达 v3: ${selectOptionMismatch}/${selectOptionLists}`)
  if (totals.bareNumeric !== 0) failures.push(`金额/数量列裸文本: ${totals.bareNumeric}`)
  if (totals.statcardLegacy !== 0) failures.push(`统计卡未升级到 W7 规格: ${totals.statcardLegacy}/${totals.statcards}`)
  if (kanbanLaneMismatch !== 0) failures.push(`看板泳道未达 v3: ${kanbanLaneMismatch}/${kanbanLanes}`)
  if (calendarNoColor !== 0) failures.push(`日历事件色字段未接线: ${calendarNoColor}/${calendars}`)
  if (kpiGridBad !== 0) failures.push(`经营五看板统计卡行未置顶: ${kpiGridBad}/${kpiGrids}`)
  if (b1Mismatch !== 0) failures.push(`B1 补债 uiSchema.enum 未达 v3: ${b1Mismatch}/${b1Lists}`)
  if (!v1Ok) failures.push('v1 globalStyle 包覆缺失（w7b0-theme GLOBAL_STYLE B4 段未落 theme 行）')
  if (missing.length > 0) failures.push(`页未出现在 flowModels 归属图: ${missing.map(uid => `${B4_PAGES[uid]}(${uid})`).join('、')}`)
  if (failures.length > 0) {
    console.error(`w7b4-heal assert: FAILED\n  - ${failures.join('\n  - ')}`)
    process.exitCode = 1
    return
  }
  console.log(`w7b4-heal assert: OK — 27 页 v3 色板/对齐/千分位/日期/统计卡 + 看板泳道/日历事件色/经营五看板重组 + B1 补债 0 mismatch + v1 包覆 全部达标`)
}

// ─── CLI ───

async function main(): Promise<void> {
  const args = process.argv.slice(2)
  const b1Mode = args.includes('--b1-debt')
  const rest = args.filter(arg => arg !== '--b1-debt')
  const mode = rest[0]
  if (mode !== '--dry-run' && mode !== '--apply' && mode !== '--assert' && mode !== '--rollback') {
    console.error('usage: w7b4-heal.mts [--b1-debt] --dry-run|--apply|--assert|--rollback')
    process.exitCode = 2
    return
  }
  if (b1Mode && mode !== '--dry-run' && mode !== '--apply') {
    console.error('--b1-debt 只接受 --dry-run/--apply（断言并入 --assert 的 b1FieldEnumMismatch）')
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
  const models = await listFlowModels(token, 'w7b4-heal')
  const routes = await listRoutes(token, 'w7b4-heal')
  if (b1Mode) {
    const { log, changed, total } = await runB1Debt(token, models, routes, fields, mode === '--dry-run')
    const summary = `${mode === '--dry-run' ? 'dry-run' : 'heal'} b1-debt: fieldEnum=${changed}/${total}`
    const out = [...log, summary].join('\n')
    console.log(out)
    if (mode === '--apply') writeFileSync(B1_RUN_PATH, `${out}\n`)
    return
  }
  const { log, counts, unknownEnums, pagesSeen } = await runHeal(token, models, routes, fields, mode === '--dry-run')
  const summary = `${mode === '--dry-run' ? 'dry-run' : 'heal'} b4: pages=${pagesSeen.length}/${Object.keys(B4_PAGES).length} recolor=${counts.recolor} enumSwap=${counts.enumSwap} numberSwap=${counts.numberSwap} numberProps=${counts.numberProps} dateProps=${counts.dateProps} alignRight=${counts.alignRight} alignLeft=${counts.alignLeft} statcardRegen=${counts.statcardRegen} columnOptions=${counts.columnOptions} selectOptions=${counts.selectOptions} fieldEnum=${counts.fieldEnum} kanbanOptions=${counts.kanbanOptions} calendarColor=${counts.calendarColor} statcardAdd=${counts.statcardAdd} gridLayout=${counts.gridLayout}`
  const out = [...log, summary, ...(unknownEnums.length > 0 ? ['', '未入 v3 映射的枚举值（保持原样）:', ...[...new Set(unknownEnums)].map(v => `  ${v}`)] : [])].join('\n')
  console.log(out)
  if (mode === '--apply') writeFileSync(B4_RUN_PATH, `${out}\n`)
}

void main().catch(error => {
  console.error(error)
  process.exit(1)
})
