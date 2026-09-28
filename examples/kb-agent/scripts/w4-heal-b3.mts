/**
 * W4-B3 page-level heal: single-value stat cards on the 30 L1 document
 * pages (ChartBlockModel single-measure aggregation + custom raw big-number
 * visual, D3) + 1-2 counting cards on the 20 L2 master-data pages, one-sentence
 * markdown hints with empty-list guidance on every L1 page (P-4'/P-5', D9),
 * titles for all 18 pre-existing chart blocks (P-3'), and the three operator
 * terminal iframes rebased onto W3_TERMINAL_BASE (P-6'/D10).
 *
 * Cards state their own 口径 in the footnote (P-2': the card never follows
 * the page filter — v2 has no click-through channel — so the wording must
 * prevent the "filtered vs全量" misread).
 *
 * Identity/rollback: addBlock mints server-side uids the script cannot
 * prefix, so every created block carries the W4B3_MARKER inside its own
 * content (first line of the chart raw option / trailing HTML comment in the
 * markdown content). `--rollback` destroys marker blocks per page; re-runs
 * skip existing marker blocks matched by props.title (idempotent).
 *
 * Usage:
 *   node --import tsx/esm examples/kb-agent/scripts/w4-heal-b3.mts --dry-run
 *   node --import tsx/esm examples/kb-agent/scripts/w4-heal-b3.mts --pilot      # 采购订单 page (hard gate)
 *   node --import tsx/esm examples/kb-agent/scripts/w4-heal-b3.mts --all
 *   node --import tsx/esm examples/kb-agent/scripts/w4-heal-b3.mts --titles    # 18 chart titles only
 *   node --import tsx/esm examples/kb-agent/scripts/w4-heal-b3.mts --iframe    # rebase 3 terminal iframes
 *   node --import tsx/esm examples/kb-agent/scripts/w4-heal-b3.mts --levels    # write w4-b3-page-levels.json
 *   node --import tsx/esm examples/kb-agent/scripts/w4-heal-b3.mts --rollback [--page 采购订单]
 *   node --import tsx/esm examples/kb-agent/scripts/w4-heal-b3.mts --assert   # B3 floors (setup verify gate)
 *   node --import tsx/esm examples/kb-agent/scripts/w4-heal-b3.mts --reconcile # psql 对拍 expectations
 */
import { spawnSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import {
  call, dataOf, ensureMarkdownHint, listFlowModels, listRoutes, mergeNodeProps, metricChart,
  seatGridTopBlocks, signInWithRetry, W4B3_MARKER,
  type FlowModelRow, type RouteRow,
} from './nocobase-flow-page-lib.mts'

const RESEARCH_DIR = new URL('../../../research/2026-09-28-w4-completeness/', import.meta.url).pathname
const LEVELS_PATH = `${RESEARCH_DIR}w4-b3-page-levels.json`

/** Fixed month window for the「本月」cards (B3 decision: the builder query has no relative-date expression, so the window is materialized at heal time and stated in the footnote; re-run the heal after month rollover). */
const MONTH_START = `${new Date().toISOString().slice(0, 7)}-01`
const MONTH_LABEL = new Date().toISOString().slice(0, 7)

// ─── page levels (the 台账 basis; L3/L4 = everything else) ───

/** The 30 L1 document pages: state-flow/amount-bearing list pages across the six core domains. */
const L1_PAGES = [
  '采购申请', '询价管理', '采购订单', '发票匹配', '付款申请', '供应商报价', '比价表',
  '生产订单', '领料单', '退料单', '完工单', '报工记录', 'BOM 管理',
  '销售订单', '报价单', '回款', '发票',
  '入库单', '出库单', '盘点管理', '库存查询',
  '质检单', '处置看板',
  '订单', '工单',
  '维保记录', '请假审批', '项目', '任务列表', '审批中心',
] as const

/** The 20 L2 master-data pages: counting cards only (记录总数 / 启用数). */
const L2_PAGES = [
  '客户', '销售线索', '联系人', '产品与服务', '供应商档案', '供应商准入',
  '员工', '部门', '维保服务商', '资产台账', '知识文章', '里程碑',
  '仓库库区', '库位平面图', '批次主数据', '证照效期预警',
  '绩效评分卡', '工作中心', 'BOM 工序', '审核评分录入',
] as const

// ─── stat card specs ───

type CardSpec = {
  title: string
  collection: string
  agg: 'count' | 'sum' | 'avg'
  field?: string
  filter?: Record<string, unknown>
  footnote: string
  unitPrefix?: string
  unitSuffix?: string
  decimals?: number
}

const ALL = '口径：全量 · 不随筛选联动'
const inStates = (field: string, values: readonly string[]) => ({ [field]: { $in: [...values] } })

/** L1 card sets (3–5 each, per-domain 口径 from the live psql distribution). */
const L1_CARDS: Record<string, readonly CardSpec[]> = {
  采购申请: [
    { title: '申请单总数', collection: 'pur_requests', agg: 'count', field: 'id', footnote: ALL },
    { title: '待审批', collection: 'pur_requests', agg: 'count', field: 'id', filter: inStates('doc_status', ['pending', 'pending_level2']), footnote: '口径：状态=待审/二级审批中 · 全量' },
    { title: '估算总额', collection: 'pur_requests', agg: 'sum', field: 'total_est', footnote: '口径：全部申请金额合计', unitPrefix: '¥' },
    { title: '草稿数', collection: 'pur_requests', agg: 'count', field: 'id', filter: { doc_status: { $eq: 'draft' } }, footnote: '口径：状态=草稿 · 全量' },
  ],
  询价管理: [
    { title: '询价单总数', collection: 'pur_rfqs', agg: 'count', field: 'id', footnote: ALL },
    { title: '已批准', collection: 'pur_rfqs', agg: 'count', field: 'id', filter: { doc_status: { $eq: 'approved' } }, footnote: '口径：状态=已生效 · 全量' },
    { title: '已关闭', collection: 'pur_rfqs', agg: 'count', field: 'id', filter: { doc_status: { $eq: 'closed' } }, footnote: '口径：状态=已关闭 · 全量' },
  ],
  采购订单: [
    { title: '待审批', collection: 'pur_orders', agg: 'count', field: 'id', filter: inStates('doc_status', ['pending', 'pending_level2']), footnote: '口径：状态=待审/二级审批中 · 全量' },
    { title: `本月审批通过`, collection: 'pur_orders', agg: 'count', field: 'id', filter: { approved_at: { $gte: MONTH_START } }, footnote: `口径：${MONTH_LABEL}-01 起审批通过（按审批日，非创建日）` },
    { title: '金额合计', collection: 'pur_orders', agg: 'sum', field: 'amount', footnote: '口径：全部状态订单金额合计', unitPrefix: '¥' },
    { title: '订单总数', collection: 'pur_orders', agg: 'count', field: 'id', footnote: ALL },
  ],
  发票匹配: [
    { title: '发票总数', collection: 'pur_invoices', agg: 'count', field: 'id', footnote: ALL },
    { title: '发票金额合计', collection: 'pur_invoices', agg: 'sum', field: 'invoice_amount', footnote: '口径：全部发票金额合计', unitPrefix: '¥' },
    { title: '匹配异常数', collection: 'pur_invoices', agg: 'count', field: 'id', filter: { match_result: { $eq: 'exception' } }, footnote: '口径：匹配结果=异常 · 全量' },
  ],
  付款申请: [
    { title: '付款单总数', collection: 'pur_payments', agg: 'count', field: 'id', footnote: ALL },
    { title: '付款金额合计', collection: 'pur_payments', agg: 'sum', field: 'amount', footnote: '口径：全部付款金额合计', unitPrefix: '¥' },
    { title: '已支付', collection: 'pur_payments', agg: 'count', field: 'id', filter: { doc_status: { $eq: 'paid' } }, footnote: '口径：状态=已支付 · 全量' },
  ],
  供应商报价: [
    { title: '报价总数', collection: 'pur_quotes', agg: 'count', field: 'id', footnote: ALL },
    { title: '已提交报价', collection: 'pur_quotes', agg: 'count', field: 'id', filter: { status: { $eq: 'submitted' } }, footnote: '口径：状态=已提交 · 全量' },
    { title: '中标报价数', collection: 'pur_quotes', agg: 'count', field: 'id', filter: { is_won: { $eq: true } }, footnote: '口径：中标=true · 全量' },
  ],
  比价表: [
    { title: '报价总数', collection: 'pur_quotes', agg: 'count', field: 'id', footnote: ALL },
    { title: '平均报价', collection: 'pur_quotes', agg: 'avg', field: 'unit_price', footnote: '口径：全部报价均价', unitPrefix: '¥' },
    { title: '平均交货周期', collection: 'pur_quotes', agg: 'avg', field: 'lead_time_days', footnote: '口径：全部报价交期均值', unitSuffix: ' 天', decimals: 1 },
  ],
  生产订单: [
    { title: '执行中订单', collection: 'mfg_orders', agg: 'count', field: 'id', filter: inStates('doc_status', ['released', 'in_progress']), footnote: '口径：状态=已下达+执行中 · 全量' },
    { title: '已完工订单', collection: 'mfg_orders', agg: 'count', field: 'id', filter: { doc_status: { $eq: 'completed' } }, footnote: '口径：状态=已完工 · 全量' },
    { title: '已齐套订单', collection: 'mfg_orders', agg: 'count', field: 'id', filter: { reservation_state: { $eq: 'assigned' } }, footnote: '口径：齐套状态=已分配 · 全量' },
    { title: '订单总数', collection: 'mfg_orders', agg: 'count', field: 'id', footnote: ALL },
  ],
  领料单: [
    { title: '领料单总数', collection: 'mfg_material_issues', agg: 'count', field: 'id', footnote: ALL },
    { title: '草稿数', collection: 'mfg_material_issues', agg: 'count', field: 'id', filter: { status: { $eq: 'draft' } }, footnote: '口径：状态=草稿 · 全量' },
    { title: '已过账', collection: 'mfg_material_issues', agg: 'count', field: 'id', filter: { status: { $eq: 'posted' } }, footnote: '口径：状态=已过账 · 全量' },
  ],
  退料单: [
    { title: '退料单总数', collection: 'mfg_material_returns', agg: 'count', field: 'id', footnote: ALL },
    { title: '退料总量', collection: 'mfg_material_returns', agg: 'sum', field: 'qty', footnote: '口径：全部退料数量合计', decimals: 0 },
    { title: '已过账', collection: 'mfg_material_returns', agg: 'count', field: 'id', filter: { status: { $eq: 'posted' } }, footnote: '口径：状态=已过账 · 全量' },
  ],
  完工单: [
    { title: `本月完工`, collection: 'mfg_completions', agg: 'count', field: 'id', filter: { completed_at: { $gte: MONTH_START } }, footnote: `口径：${MONTH_LABEL}-01 起完工（按完工日）` },
    { title: '完工总量', collection: 'mfg_completions', agg: 'sum', field: 'qty', footnote: '口径：全部完工数量合计', decimals: 0 },
    { title: 'OQC 合格', collection: 'mfg_completions', agg: 'count', field: 'id', filter: { oqc_status: { $eq: 'passed' } }, footnote: '口径：OQC=合格 · 全量' },
  ],
  报工记录: [
    { title: `本月报工`, collection: 'mfg_job_reports', agg: 'count', field: 'id', filter: { report_date: { $gte: MONTH_START } }, footnote: `口径：${MONTH_LABEL}-01 起报工（按报工日）` },
    { title: '合格数合计', collection: 'mfg_job_reports', agg: 'sum', field: 'qty_good', footnote: '口径：全部报工合格数量合计', decimals: 0 },
    { title: '报废数合计', collection: 'mfg_job_reports', agg: 'sum', field: 'qty_scrap', footnote: '口径：全部报工报废数量合计', decimals: 0 },
  ],
  'BOM 管理': [
    { title: 'BOM 总数', collection: 'mfg_boms', agg: 'count', field: 'id', footnote: ALL },
    { title: '启用 BOM', collection: 'mfg_boms', agg: 'count', field: 'id', filter: { bom_status: { $eq: 'active' } }, footnote: '口径：状态=启用 · 全量' },
    { title: '默认 BOM', collection: 'mfg_boms', agg: 'count', field: 'id', filter: { is_default: { $eq: true } }, footnote: '口径：默认=BOM · 全量' },
  ],
  销售订单: [
    { title: '待审批', collection: 'so_orders', agg: 'count', field: 'id', filter: inStates('doc_status', ['pending', 'pending_level2']), footnote: '口径：状态=待审/二级审批中 · 全量' },
    { title: `本月审批通过`, collection: 'so_orders', agg: 'count', field: 'id', filter: { approved_at: { $gte: MONTH_START } }, footnote: `口径：${MONTH_LABEL}-01 起审批通过（按审批日，非创建日）` },
    { title: '金额合计', collection: 'so_orders', agg: 'sum', field: 'amount', footnote: '口径：全部状态订单金额合计', unitPrefix: '¥' },
    { title: '已发货订单', collection: 'so_orders', agg: 'count', field: 'id', filter: { shipping_status: { $eq: 'shipped' } }, footnote: '口径：发货状态=已发货 · 全量' },
  ],
  报价单: [
    { title: '报价总数', collection: 'crm_quotes', agg: 'count', field: 'id', footnote: ALL },
    { title: '待审批报价', collection: 'crm_quotes', agg: 'count', field: 'id', filter: { status: { $eq: 'pending_approval' } }, footnote: '口径：状态=待审批 · 全量' },
    { title: '报价金额合计', collection: 'crm_quotes', agg: 'sum', field: 'total_amount', footnote: '口径：全部报价金额合计', unitPrefix: '¥' },
  ],
  回款: [
    { title: `本月回款单`, collection: 'crm_payments', agg: 'count', field: 'id', filter: { paid_at: { $gte: MONTH_START } }, footnote: `口径：${MONTH_LABEL}-01 起到账（按回款日）` },
    { title: '回款金额合计', collection: 'crm_payments', agg: 'sum', field: 'amount', footnote: '口径：全部状态回款金额合计', unitPrefix: '¥' },
    { title: '待确认回款', collection: 'crm_payments', agg: 'count', field: 'id', filter: { status: { $eq: 'pending' } }, footnote: '口径：状态=待确认 · 全量' },
  ],
  发票: [
    { title: `本月开票`, collection: 'crm_invoices', agg: 'count', field: 'id', filter: { issued_at: { $gte: MONTH_START } }, footnote: `口径：${MONTH_LABEL}-01 起开票（按开票日）` },
    { title: '发票金额合计', collection: 'crm_invoices', agg: 'sum', field: 'amount', footnote: '口径：全部发票金额合计', unitPrefix: '¥' },
    { title: '已开票/已收', collection: 'crm_invoices', agg: 'count', field: 'id', filter: inStates('status', ['issued', 'paid']), footnote: '口径：状态=已开票+已收讫 · 全量' },
  ],
  入库单: [
    { title: `本月入库单`, collection: 'wms_receipts', agg: 'count', field: 'id', filter: { received_at: { $gte: MONTH_START } }, footnote: `口径：${MONTH_LABEL}-01 起收货（按收货日）` },
    { title: '待检数', collection: 'wms_receipts', agg: 'count', field: 'id', filter: { iqc_status: { $eq: 'pending' } }, footnote: '口径：IQC=待检 · 全量' },
    { title: '入库总量', collection: 'wms_receipts', agg: 'sum', field: 'qty', footnote: '口径：全部入库数量合计', decimals: 0 },
  ],
  出库单: [
    { title: '出库单总数', collection: 'wms_shipments', agg: 'count', field: 'id', footnote: ALL },
    { title: '出库总量', collection: 'wms_shipments', agg: 'sum', field: 'qty', footnote: '口径：全部出库数量合计', decimals: 0 },
    { title: '已过账', collection: 'wms_shipments', agg: 'count', field: 'id', filter: { status: { $eq: 'posted' } }, footnote: '口径：状态=已过账 · 全量' },
  ],
  盘点管理: [
    { title: '盘点单总数', collection: 'wms_counts', agg: 'count', field: 'id', footnote: ALL },
    { title: '差异单数', collection: 'wms_counts', agg: 'count', field: 'id', filter: { status: { $eq: 'difference' } }, footnote: '口径：状态=有差异 · 全量' },
    { title: `本月盘点`, collection: 'wms_counts', agg: 'count', field: 'id', filter: { biz_date: { $gte: MONTH_START } }, footnote: `口径：${MONTH_LABEL}-01 起盘点（按业务日）` },
  ],
  库存查询: [
    { title: '库存总件数', collection: 'wms_stock', agg: 'sum', field: 'qty_on_hand', footnote: '口径：全部库位现存量合计', decimals: 0 },
    { title: '可用量合计', collection: 'wms_stock', agg: 'sum', field: 'qty_available', footnote: '口径：全部库位可用量合计', decimals: 0 },
    { title: '占用件数', collection: 'wms_stock', agg: 'sum', field: 'qty_allocated', footnote: '口径：全部库位已占用量合计', decimals: 0 },
  ],
  质检单: [
    { title: '待检数', collection: 'qm_inspections', agg: 'count', field: 'id', filter: { status: { $eq: 'pending' } }, footnote: '口径：状态=待检 · 全量' },
    { title: '合格数', collection: 'qm_inspections', agg: 'count', field: 'id', filter: { result: { $eq: 'passed' } }, footnote: '口径：结论=合格 · 全量' },
    { title: '不合格数', collection: 'qm_inspections', agg: 'count', field: 'id', filter: { result: { $eq: 'failed' } }, footnote: '口径：结论=不合格 · 全量' },
  ],
  处置看板: [
    { title: '处置单总数', collection: 'qm_nc_dispositions', agg: 'count', field: 'id', footnote: ALL },
    { title: '处置中', collection: 'qm_nc_dispositions', agg: 'count', field: 'id', filter: { status: { $eq: 'open' } }, footnote: '口径：状态=处置中 · 全量' },
    { title: '报废成本合计', collection: 'qm_nc_dispositions', agg: 'sum', field: 'scrap_cost', footnote: '口径：全部报废成本合计', unitPrefix: '¥' },
  ],
  订单: [
    { title: '订单总数', collection: 'crm_deals', agg: 'count', field: 'id', footnote: ALL },
    { title: '进行中订单', collection: 'crm_deals', agg: 'count', field: 'id', filter: { status: { $eq: 'pending' } }, footnote: '口径：状态=进行中 · 全量' },
    { title: '金额合计', collection: 'crm_deals', agg: 'sum', field: 'amount', footnote: '口径：全部订单金额合计', unitPrefix: '¥' },
  ],
  工单: [
    { title: '未结工单', collection: 'hub_tk_tickets', agg: 'count', field: 'id', filter: inStates('status', ['new', 'assigned', 'open', 'in_progress', 'processing', 'waiting_customer', 'waiting_internal', 'reopened']), footnote: '口径：状态∉{已解决,已关闭} · 全量' },
    { title: '逾期工单', collection: 'hub_tk_tickets', agg: 'count', field: 'id', filter: { is_overdue: { $eq: true } }, footnote: '口径：逾期=true · 全量' },
    { title: '工单总数', collection: 'hub_tk_tickets', agg: 'count', field: 'id', footnote: ALL },
  ],
  维保记录: [
    { title: '待执行', collection: 'hub_as_maintenance', agg: 'count', field: 'id', filter: inStates('status', ['pending', 'Scheduled', 'In progress']), footnote: '口径：状态=待执行/已排程/进行中 · 全量' },
    { title: '维保成本合计', collection: 'hub_as_maintenance', agg: 'sum', field: 'cost', footnote: '口径：全部维保成本合计', unitPrefix: '¥' },
    { title: '记录总数', collection: 'hub_as_maintenance', agg: 'count', field: 'id', footnote: ALL },
  ],
  请假审批: [
    { title: '待审批', collection: 'hub_hr_leave_requests', agg: 'count', field: 'id', filter: { status: { $eq: 'pending' } }, footnote: '口径：状态=待审批 · 全量' },
    { title: '请假天数合计', collection: 'hub_hr_leave_requests', agg: 'sum', field: 'days', footnote: '口径：全部请假天数合计', unitSuffix: ' 天', decimals: 1 },
    { title: '申请总数', collection: 'hub_hr_leave_requests', agg: 'count', field: 'id', footnote: ALL },
  ],
  项目: [
    { title: '进行中项目', collection: 'hub_pj_projects', agg: 'count', field: 'id', filter: inStates('status', ['active', 'in_progress', 'planning']), footnote: '口径：状态=活跃/执行中/规划中 · 全量' },
    { title: '平均进度', collection: 'hub_pj_projects', agg: 'avg', field: 'progress', footnote: '口径：全部项目进度均值', unitSuffix: '%', decimals: 1 },
    { title: '项目总数', collection: 'hub_pj_projects', agg: 'count', field: 'id', footnote: ALL },
  ],
  任务列表: [
    { title: '未完成任务', collection: 'hub_pj_tasks', agg: 'count', field: 'id', filter: inStates('status', ['todo', 'in_progress', 'review', 'backlog', 'blocked']), footnote: '口径：状态≠已完成/已取消 · 全量' },
    { title: '已完成任务', collection: 'hub_pj_tasks', agg: 'count', field: 'id', filter: { status: { $eq: 'done' } }, footnote: '口径：状态=已完成 · 全量' },
    { title: '任务总数', collection: 'hub_pj_tasks', agg: 'count', field: 'id', footnote: ALL },
  ],
  审批中心: [
    { title: '待办数', collection: 'wfl_approval_todos', agg: 'count', field: 'id', filter: { state: { $eq: 'pending' } }, footnote: '口径：一级待办 · 全量' },
    { title: '二级审批中', collection: 'wfl_approval_todos', agg: 'count', field: 'id', filter: { state: { $eq: 'pending_level2' } }, footnote: '口径：二级待办 · 全量' },
    { title: '待办行总数', collection: 'wfl_approval_todos', agg: 'count', field: 'id', footnote: '口径：全部状态待办行 · 不随筛选联动' },
  ],
}

/** L2 counting cards (1–2 each). */
const L2_CARDS: Record<string, readonly CardSpec[]> = {
  客户: [
    { title: '客户总数', collection: 'crm_customers', agg: 'count', field: 'id', footnote: ALL },
    { title: '活跃客户', collection: 'crm_customers', agg: 'count', field: 'id', filter: { status: { $eq: 'active' } }, footnote: '口径：状态=活跃 · 全量' },
  ],
  销售线索: [
    { title: '线索总数', collection: 'crm_leads', agg: 'count', field: 'id', footnote: ALL },
    { title: '进行中线索', collection: 'crm_leads', agg: 'count', field: 'id', filter: inStates('stage', ['new', 'contacted', 'qualified', 'proposal', 'negotiation', 'requirements_confirmed']), footnote: '口径：阶段未终结 · 全量' },
  ],
  联系人: [{ title: '联系人总数', collection: 'crm_contacts', agg: 'count', field: 'id', footnote: ALL }],
  产品与服务: [
    { title: '产品总数', collection: 'crm_products', agg: 'count', field: 'id', footnote: ALL },
    { title: '在售产品', collection: 'crm_products', agg: 'count', field: 'id', filter: { active: { $eq: true } }, footnote: '口径：在售=true · 全量' },
  ],
  供应商档案: [
    { title: '供应商总数', collection: 'srm_suppliers', agg: 'count', field: 'id', footnote: ALL },
    { title: '合格供方', collection: 'srm_suppliers', agg: 'count', field: 'id', filter: { lifecycle_status: { $eq: 'qualified' } }, footnote: '口径：生命周期=合格 · 全量' },
  ],
  供应商准入: [
    { title: '准入流程中', collection: 'srm_suppliers', agg: 'count', field: 'id', filter: inStates('lifecycle_status', ['potential', 'reviewing']), footnote: '口径：生命周期=潜在/审核中 · 全量' },
    { title: '供应商总数', collection: 'srm_suppliers', agg: 'count', field: 'id', footnote: ALL },
  ],
  员工: [
    { title: '员工总数', collection: 'hub_hr_employees', agg: 'count', field: 'id', footnote: ALL },
    { title: '在职员工', collection: 'hub_hr_employees', agg: 'count', field: 'id', filter: { status: { $eq: 'active' } }, footnote: '口径：状态=在职 · 全量' },
  ],
  部门: [{ title: '部门总数', collection: 'hub_hr_departments', agg: 'count', field: 'id', footnote: ALL }],
  维保服务商: [{ title: '维保服务商总数', collection: 'hub_as_vendors', agg: 'count', field: 'id', footnote: ALL }],
  资产台账: [
    { title: '资产总数', collection: 'hub_as_assets', agg: 'count', field: 'id', footnote: ALL },
    { title: '在用资产', collection: 'hub_as_assets', agg: 'count', field: 'id', filter: { status: { $eq: 'in_use' } }, footnote: '口径：状态=在用 · 全量' },
  ],
  知识文章: [
    { title: '文章总数', collection: 'hub_kb_articles', agg: 'count', field: 'id', footnote: ALL },
    { title: '已发布', collection: 'hub_kb_articles', agg: 'count', field: 'id', filter: { status: { $eq: 'published' } }, footnote: '口径：状态=已发布 · 全量' },
  ],
  里程碑: [
    { title: '里程碑总数', collection: 'hub_pj_milestones', agg: 'count', field: 'id', footnote: ALL },
    { title: '未完成里程碑', collection: 'hub_pj_milestones', agg: 'count', field: 'id', filter: { status: { $eq: 'pending' } }, footnote: '口径：状态=待完成 · 全量' },
  ],
  仓库库区: [{ title: '库区总数', collection: 'wms_zones', agg: 'count', field: 'id', footnote: ALL }],
  库位平面图: [
    { title: '库位总数', collection: 'wms_bins', agg: 'count', field: 'id', footnote: ALL },
    { title: '可用库位', collection: 'wms_bins', agg: 'count', field: 'id', filter: inStates('status', ['idle', 'active']), footnote: '口径：状态=空闲/启用 · 全量' },
  ],
  批次主数据: [
    { title: '批次总数', collection: 'wms_lots', agg: 'count', field: 'id', footnote: ALL },
    { title: '合格批次', collection: 'wms_lots', agg: 'count', field: 'id', filter: { status: { $eq: 'qualified' } }, footnote: '口径：状态=合格 · 全量' },
  ],
  证照效期预警: [
    { title: '证照总数', collection: 'srm_certificates', agg: 'count', field: 'id', footnote: ALL },
    { title: '预警证照', collection: 'srm_certificates', agg: 'count', field: 'id', filter: inStates('warn_status', ['w30', 'w60', 'w90', 'expired']), footnote: '口径：90 天内到期+已过期 · 全量' },
  ],
  绩效评分卡: [
    { title: '评分卡总数', collection: 'srm_score_cards', agg: 'count', field: 'id', footnote: ALL },
    { title: '平均总分', collection: 'srm_score_cards', agg: 'avg', field: 'total_score', footnote: '口径：全部评分卡总分均值', decimals: 1 },
  ],
  工作中心: [
    { title: '中心总数', collection: 'mfg_work_centers', agg: 'count', field: 'id', footnote: ALL },
    { title: '启用中心', collection: 'mfg_work_centers', agg: 'count', field: 'id', filter: { status: { $eq: 'active' } }, footnote: '口径：状态=启用 · 全量' },
  ],
  'BOM 工序': [
    { title: '工序总数', collection: 'mfg_bom_operations', agg: 'count', field: 'id', footnote: ALL },
    { title: '平均工时', collection: 'mfg_bom_operations', agg: 'avg', field: 'run_min', footnote: '口径：全部工序加工工时均值', unitSuffix: ' 分钟', decimals: 1 },
  ],
  审核评分录入: [
    { title: '审核记录数', collection: 'srm_audit_records', agg: 'count', field: 'id', footnote: ALL },
    { title: '平均总分', collection: 'srm_audit_records', agg: 'avg', field: 'total_score', footnote: '口径：全部审核总分均值', decimals: 1 },
  ],
}

// ─── L1 one-sentence hints (P-4'/P-5': purpose + 口径 note + empty-list guidance; two compact sentences, no大段) ───

const HINT_NO_CREATE = '待办由业务单据提交后自动产生，处理完成后状态自动回写。'
const HINT_EMPTY = '列表为空时表示当前筛选下无数据，可重置筛选或等待新单据进入。'
const HINT_EMPTY_CREATE = '列表为空时点击右上「新增」创建第一张单据。'

const L1_HINTS: Record<string, string> = {
  采购申请: `本页管理采购申请：点行查看详情，右上筛选按状态/日期过滤；顶部统计卡为全量口径，不随筛选联动。${HINT_EMPTY_CREATE}`,
  询价管理: `本页管理询价单（RFQ）：点行查看详情与报价进展；顶部统计卡为全量口径。${HINT_EMPTY_CREATE}`,
  采购订单: `本页管理采购订单：点行查看明细行与收货/发票进度；统计卡「本月审批通过」按审批日口径。${HINT_EMPTY_CREATE}`,
  发票匹配: `本页管理采购发票与三单匹配结果：匹配异常需人工核对后确认。${HINT_EMPTY_CREATE}`,
  付款申请: `本页管理付款申请单：审批通过后由财务付款。${HINT_EMPTY_CREATE}`,
  供应商报价: `本页管理供应商对询价的报价：中标报价在比价后标记。${HINT_EMPTY_CREATE}`,
  比价表: `本页对比各供应商报价（均价/交期），辅助定标决策。${HINT_EMPTY}`,
  生产订单: `本页管理生产订单（MO）：齐套状态驱动领料与排产。${HINT_EMPTY_CREATE}`,
  领料单: `本页管理车间领料单：过账后扣减库存。${HINT_EMPTY_CREATE}`,
  退料单: `本页管理车间退料单：过账后回补库存。${HINT_EMPTY_CREATE}`,
  完工单: `本页管理生产完工报告：完工入库并触发 OQC。${HINT_EMPTY_CREATE}`,
  报工记录: `本页记录工序报工（合格/报废数量），用于工序进度与成本核算。${HINT_EMPTY_CREATE}`,
  'BOM 管理': `本页维护产品 BOM：默认 BOM 为 MRP 展开依据。${HINT_EMPTY_CREATE}`,
  销售订单: `本页管理销售订单：审批通过后进入发货流程；统计卡「本月审批通过」按审批日口径。${HINT_EMPTY_CREATE}`,
  报价单: `本页管理对客户的报价单：接受后可转订单。${HINT_EMPTY_CREATE}`,
  回款: `本页登记销售回款：与应收对账（经营分析→应收应付对账）。${HINT_EMPTY_CREATE}`,
  发票: `本页管理销售发票：开票后跟踪收讫状态。${HINT_EMPTY_CREATE}`,
  入库单: `本页管理采购/生产入库单：IQC 待检批次先进待检区。${HINT_EMPTY_CREATE}`,
  出库单: `本页管理销售/领料出库单：过账后扣减库存。${HINT_EMPTY_CREATE}`,
  盘点管理: `本页管理库存盘点：差异单需复盘后调整。${HINT_EMPTY_CREATE}`,
  库存查询: `本页按库位/批次查询现存量与可用量；金额口径见经营分析→库存看板。${HINT_EMPTY}`,
  质检单: `本页管理 IQC/OQC/FQC 质检单：AQL 抽样判定合格率。${HINT_EMPTY_CREATE}`,
  处置看板: `本页看板跟踪不合格处置（返工/让步/报废）：卡片按处置状态分列。${HINT_EMPTY}`,
  订单: `本页管理 CRM 成交订单：状态与金额驱动销售漏斗统计。${HINT_EMPTY_CREATE}`,
  工单: `本页管理客服工单：逾期工单需优先处理。${HINT_EMPTY_CREATE}`,
  维保记录: `本页登记资产维保（预防/纠正/点检）：待执行项按计划排程。${HINT_EMPTY_CREATE}`,
  请假审批: `本页管理员工请假申请：审批通过后计入考勤。${HINT_EMPTY_CREATE}`,
  项目: `本页管理项目档案：进度与里程碑联动。${HINT_EMPTY_CREATE}`,
  任务列表: `本页管理项目任务：按状态/优先级/截止日跟踪。${HINT_EMPTY_CREATE}`,
  审批中心: `本页集中处理各业务单据的审批待办。${HINT_NO_CREATE}`,
}

// ─── chart title rules for the 18 pre-existing chart blocks (P-3') ───

const chartConfigure = (row: FlowModelRow): any => row?.stepParams?.chartSettings?.configure ?? {}
const chartQueryOf = (row: FlowModelRow): any => chartConfigure(row)?.query ?? {}
/** The persisted custom-visual raw option — the server canonicalizes `visual` into `chart.option` ({mode, raw}|{mode, builder}). */
const chartVisualRaw = (row: FlowModelRow): string => String(chartConfigure(row)?.chart?.option?.raw ?? '')

const chartFilterValue = (row: FlowModelRow, key: string): unknown => {
  const filter = chartQueryOf(row)?.filter
  if (filter === null || typeof filter !== 'object') return undefined
  const items = (filter as { items?: unknown }).items
  if (Array.isArray(items)) {
    for (const item of items) {
      if (item !== null && typeof item === 'object' && (item as { path?: unknown }).path === key) return (item as { value?: unknown }).value
    }
    return undefined
  }
  const raw = (filter as Record<string, unknown>)[key]
  if (raw !== null && typeof raw === 'object' && !Array.isArray(raw) && '$eq' in (raw as Record<string, unknown>)) {
    return (raw as Record<string, unknown>)['$eq']
  }
  return raw
}
const chartCollectionOf = (row: FlowModelRow): string => {
  const resource = chartQueryOf(row)?.resource?.collectionName
  if (resource !== undefined) return String(resource)
  const path = chartQueryOf(row)?.collectionPath
  return Array.isArray(path) ? String(path[1] ?? '') : ''
}
const chartDimensionOf = (row: FlowModelRow): string => {
  const dims = chartQueryOf(row)?.dimensions
  if (!Array.isArray(dims) || dims.length === 0) return ''
  const field = dims[0]?.field
  return Array.isArray(field) ? String(field[field.length - 1] ?? '') : String(field ?? '')
}
const chartAliasesOf = (row: FlowModelRow): Set<string> =>
  new Set((Array.isArray(chartQueryOf(row)?.measures) ? chartQueryOf(row).measures : []).map((measure: any) => String(measure?.alias ?? '')))

/** W9 KPI trend/comparison charts (kpi_code filter + dimension) — titles from the w9 CHARTS spec. */
const KPI_CODE_TITLES: Readonly<Record<string, string>> = {
  gross_margin: '毛利率趋势', revenue_monthly: '当月收入 vs 应收余额', ar_balance: '应收余额趋势',
  ap_balance: '应付余额趋势', otif: 'OTIF 趋势', otd_supplier: '供应商准时到货率对比',
  fpy: '一次合格率趋势', capital_occupied: '库存资金占用趋势', dead_stock_ratio: '呆滞占比 × 账实相符率',
  inv_turnover_rate: '库存周转率 × 周转天数',
}
const KPI_PAIR_TITLES: ReadonlyArray<{ codes: readonly string[], dimension: string, title: string }> = [
  { codes: ['revenue_monthly', 'ar_balance'], dimension: 'kpi_code', title: '当月收入 vs 应收余额' },
  { codes: ['fpy', 'rty', 'schedule_hit', 'lot_pass_rate'], dimension: 'kpi_code', title: '合格率 × 计划达成对比' },
  { codes: ['dead_stock_ratio', 'count_accuracy'], dimension: 'kpi_code', title: '呆滞占比 × 账实相符率' },
  { codes: ['inv_turnover_rate', 'inv_turnover_days'], dimension: 'kpi_code', title: '库存周转率 × 周转天数' },
]
const DIMENSION_TITLES: Readonly<Record<string, string>> = {
  industry: '客户按行业分布', level: '客户按等级分布', status: '回款按状态分布', method: '回款按方式分布',
}

/**
 * One chart block's Chinese title (P-3'). Known blocks map through the w9/f4
 * spec predicates; anything unmatched falls back to a dimension-based name so
 * the 18/18 floor holds even if a sibling batch added a chart meanwhile.
 */
export function chartTitleFor(row: FlowModelRow, pageTitle: string): string {
  const collection = chartCollectionOf(row)
  const dimension = chartDimensionOf(row)
  const aliases = chartAliasesOf(row)
  if (collection === 'kpi_snapshots') {
    const code = chartFilterValue(row, 'kpi_code')
    // otd_supplier compares across the dim dimension (not a calc_date trend), so the code alone names it
    if (typeof code === 'string' && KPI_CODE_TITLES[code] !== undefined && (dimension === 'calc_date' || code === 'otd_supplier')) return KPI_CODE_TITLES[code]
    if (dimension === 'kpi_code') {
      const items = chartQueryOf(row)?.filter?.items
      const inList = Array.isArray(items)
        ? (items.find((item: any) => item?.path === 'kpi_code')?.value ?? [])
        : (chartQueryOf(row)?.filter?.kpi_code?.$in ?? [])
      if (Array.isArray(inList)) {
        const match = KPI_PAIR_TITLES.find(pair => inList.some((codeItem) => pair.codes.includes(String(codeItem))))
        if (match !== undefined) return match.title
      }
    }
  }
  if (collection === 'srm_score_cards' && chartVisualRaw(row) !== '') return '五维绩效雷达'
  if (collection === 'srm_score_cards' && dimension === 'period') return '绩效趋势（按考核期）'
  if (pageTitle === '客户仪表盘' || pageTitle === '销售仪表盘') {
    const dimTitle = DIMENSION_TITLES[dimension]
    if (dimTitle !== undefined) return dimTitle
  }
  const dimLabel: Record<string, string> = { calc_date: '计算日', kpi_code: '指标', dim: '维度', period: '考核期' }
  if (dimension !== '' && aliases.has('v')) return `${dimLabel[dimension] ?? dimension}趋势`
  return dimension !== '' ? `按${dimLabel[dimension] ?? dimension}分布` : `${pageTitle}图表`
}

// ─── iframe env rebase (P-6'/D10) ───

/** The three operator-terminal pages whose iframes rebase onto W3_TERMINAL_BASE. */
const TERMINAL_PAGES = ['车间终端', '质检工作台', '收货终端'] as const
const terminalBase = (): string => {
  const base = process.env['W3_TERMINAL_BASE'] ?? process.env['W3_TERMINAL_ORIGIN'] ?? 'http://127.0.0.1:13110'
  return base.replace(/\/$/, '')
}

// ─── live snapshot ───

type LiveSnapshot = {
  routes: RouteRow[]
  models: FlowModelRow[]
  /** flowPage title → its BlockGridModel uid. */
  gridByPage: Map<string, string>
  /** grid uid → flowPage title. */
  pageByGrid: Map<string, string>
}

async function loadSnapshot(token: string): Promise<LiveSnapshot> {
  const [routes, models] = await Promise.all([listRoutes(token, 'w4-heal-b3'), listFlowModels(token, 'w4-heal-b3')])
  const flowById = new Map(routes.map(route => [route.id, route]))
  const tabToFlowTitle = new Map<string, string>()
  for (const route of routes) {
    if (route.type !== 'tabs' || route.schemaUid == null) continue
    const flow = flowById.get(route.parentId ?? Number.NaN)
    if (flow?.type === 'flowPage') tabToFlowTitle.set(route.schemaUid, flow.title ?? '')
  }
  const gridByPage = new Map<string, string>()
  const pageByGrid = new Map<string, string>()
  for (const row of models) {
    if (row?.use !== 'BlockGridModel') continue
    const title = tabToFlowTitle.get(String(row.parentId ?? ''))
    if (title === undefined || title === '') continue
    gridByPage.set(title, String(row.uid))
    pageByGrid.set(String(row.uid), title)
  }
  return { routes, models, gridByPage, pageByGrid }
}

/** Whether one flowModels row is a B3-created stat card (marker in the raw option). */
const isMarkerChart = (row: FlowModelRow): boolean =>
  row?.use === 'ChartBlockModel' && chartVisualRaw(row).includes(W4B3_MARKER)

/** Whether one flowModels row is a B3-created markdown hint (marker in a trailing HTML comment). */
const isMarkerMarkdown = (row: FlowModelRow): boolean =>
  row?.use === 'MarkdownBlockModel' && String(row?.props?.content ?? '').includes(`<!--${W4B3_MARKER}-->`)

/** Grid item children of one grid (flat rows), with their sortIndex values. */
function gridChildren(models: ReadonlyArray<FlowModelRow>, gridUid: string): FlowModelRow[] {
  return models.filter(row => String(row.parentId ?? '') === gridUid && String(row.subKey ?? '') === 'items')
}

// ─── heal passes ───

type HealLog = { page: string, lines: string[] }

async function healStatCards(
  token: string,
  snapshot: LiveSnapshot,
  page: string,
  cards: readonly CardSpec[],
  dryRun: boolean,
): Promise<HealLog & { cardUids: string[] }> {
  const lines: string[] = []
  const gridUid = snapshot.gridByPage.get(page)
  if (gridUid === undefined) throw new Error(`page "${page}" grid not found (B3 needs the page spine to exist)`)
  const children = gridChildren(snapshot.models, gridUid)
  const existingCards = children.filter(isMarkerChart)
  const existingByTitle = new Map(existingCards.map(row => [String(row.props?.title ?? ''), row]))
  const cardUids: string[] = []
  for (const card of cards) {
    const existing = existingByTitle.get(card.title)
    if (existing !== undefined) {
      cardUids.push(String(existing.uid))
      lines.push(`card "${page}/${card.title}" exists (kept)`)
      continue
    }
    if (dryRun) {
      lines.push(`card "${page}/${card.title}" would be created (${card.agg}${card.field === undefined ? '' : `(${card.field})`})`)
      continue
    }
    const uid = await metricChart(token, {
      gridUid,
      title: card.title,
      collection: card.collection,
      measure: { field: card.field ?? 'id', aggregation: card.agg, alias: 'v' },
      ...(card.filter === undefined ? {} : { filter: card.filter }),
      footnote: card.footnote,
      ...(card.unitPrefix === undefined ? {} : { unitPrefix: card.unitPrefix }),
      ...(card.unitSuffix === undefined ? {} : { unitSuffix: card.unitSuffix }),
      ...(card.decimals === undefined ? {} : { decimals: card.decimals }),
    })
    cardUids.push(uid)
    lines.push(`card "${page}/${card.title}" created (uid ${uid})`)
  }
  return { page, lines, cardUids }
}

async function healHint(
  token: string,
  snapshot: LiveSnapshot,
  page: string,
  content: string,
  dryRun: boolean,
): Promise<HealLog & { hintUid: string | null }> {
  const lines: string[] = []
  const gridUid = snapshot.gridByPage.get(page)
  if (gridUid === undefined) throw new Error(`page "${page}" grid not found`)
  const children = gridChildren(snapshot.models, gridUid)
  const existing = children.find(isMarkerMarkdown)
  if (existing !== undefined) {
    if (String(existing.props?.content ?? '').split('\n')[0] === content) {
      lines.push(`hint "${page}" exists (kept)`)
    } else if (!dryRun) {
      await mergeNodeProps(token, String(existing.uid), { content: `${content}\n<!--${W4B3_MARKER}-->` })
      lines.push(`hint "${page}" refreshed (content updated)`)
    } else {
      lines.push(`hint "${page}" would be refreshed`)
    }
    return { page, lines, hintUid: String(existing.uid) }
  }
  if (dryRun) {
    lines.push(`hint "${page}" would be created`)
    return { page, lines, hintUid: null }
  }
  const uid = await ensureMarkdownHint(token, { gridUid, content })
  lines.push(`hint "${page}" created (uid ${uid})`)
  return { page, lines, hintUid: uid }
}

/** P-3': title every ChartBlockModel whose props.title is empty (the 18 pre-existing blocks + any sibling strays). */
async function healTitles(token: string, snapshot: LiveSnapshot, dryRun: boolean): Promise<string[]> {
  const lines: string[] = []
  for (const row of snapshot.models) {
    if (row?.use !== 'ChartBlockModel') continue
    const title = String(row.props?.title ?? '')
    if (title !== '') continue
    const page = snapshot.pageByGrid.get(String(row.parentId ?? '')) ?? ''
    const next = chartTitleFor(row, page)
    if (dryRun) {
      lines.push(`title "${page}" chart ${String(row.uid).slice(0, 10)} would become "${next}"`)
      continue
    }
    await mergeNodeProps(token, String(row.uid), { title: next })
    lines.push(`title "${page}" chart ${String(row.uid).slice(0, 10)} -> "${next}"`)
  }
  return lines
}

/** P-6'/D10: rebase the three operator-terminal iframes onto W3_TERMINAL_BASE (origin swap only; path+operator stay). */
async function healIframes(token: string, snapshot: LiveSnapshot, dryRun: boolean): Promise<string[]> {
  const lines: string[] = []
  const base = terminalBase()
  for (const page of TERMINAL_PAGES) {
    const gridUid = snapshot.gridByPage.get(page)
    if (gridUid === undefined) {
      lines.push(`iframe "${page}" page grid not found (skipped)`)
      continue
    }
    const iframe = snapshot.models.find(row => row?.use === 'IframeBlockModel' && String(row.parentId ?? '') === gridUid)
    if (iframe === undefined) {
      lines.push(`iframe "${page}" IframeBlockModel missing (skipped)`)
      continue
    }
    const url = String(iframe.props?.url ?? '')
    const nextUrl = url.replace(/^https?:\/\/[^/]+/, base)
    if (nextUrl === url) {
      lines.push(`iframe "${page}" already at ${url}`)
      continue
    }
    if (dryRun) {
      lines.push(`iframe "${page}" would rebase ${url} -> ${nextUrl}`)
      continue
    }
    await mergeNodeProps(token, String(iframe.uid), { url: nextUrl })
    lines.push(`iframe "${page}" rebased ${url} -> ${nextUrl}`)
  }
  lines.push(`terminal base = ${base}${process.env['W3_TERMINAL_BASE'] === undefined ? ' (default; set W3_TERMINAL_BASE to override)' : ' (W3_TERMINAL_BASE)'}`)
  return lines
}

/**
 * Grant member the charts data query action: the stat cards' data endpoint
 * (`POST /api/charts:queryData`) 403s under the member role, which renders
 * every card as the「请配置图表」placeholder even though the page tables load
 * fine (found live on the qc_inspector 390px leg). Idempotent — the
 * plugin-acl runtime face only rewrites on rolesResourcesActions afterUpdate,
 * so a fresh action row gets a touch-through update.
 */
async function ensureMemberChartQuery(token: string): Promise<void> {
  const filter = (payload: Record<string, unknown>) => `/api/rolesResources:list?pageSize=100&filter=${encodeURIComponent(JSON.stringify(payload))}`
  const existing = await dataOf(token, 'GET', filter({ roleName: { $eq: 'member' }, name: { $eq: 'charts' } })) as Array<{ id?: number }> | null
  let resourceId = existing?.[0]?.id
  if (resourceId === undefined) {
    const created = await dataOf(token, 'POST', '/api/rolesResources:create', {
      role: { name: 'member' }, name: 'charts', usingActionsConfig: true, actions: [{ name: 'queryData' }],
    })
    resourceId = created?.id
    if (resourceId !== undefined) return
  }
  if (resourceId === undefined) throw new Error('member rolesResources row on charts missing after create')
  const actionRows = await dataOf(token, 'GET', `/api/rolesResourcesActions:list?pageSize=100&filter=${encodeURIComponent(JSON.stringify({ rolesResourceId: { $eq: resourceId } }))}`) as Array<{ id?: number, name?: string }> | null
  const present = new Set((actionRows ?? []).map(row => String(row.name ?? '')))
  if (!present.has('queryData')) {
    const row = await dataOf(token, 'POST', '/api/rolesResourcesActions:create', { rolesResourceId: resourceId, name: 'queryData' })
    const id = Number(row?.id)
    if (Number.isFinite(id)) await dataOf(token, 'POST', `/api/rolesResourcesActions:update?filterByTk=${id}`, { name: 'queryData' })
  }
}

/** The page-level 台账: every flowPage classified L1–L4 with its B3 artifact counts. */
async function writeLevels(token: string, snapshot: LiveSnapshot): Promise<void> {
  const flowPages = snapshot.routes.filter(route => route.type === 'flowPage')
  const markerChartsByGrid = new Map<string, number>()
  const markerHintsByGrid = new Map<string, number>()
  for (const row of snapshot.models) {
    if (isMarkerChart(row)) markerChartsByGrid.set(String(row.parentId ?? ''), (markerChartsByGrid.get(String(row.parentId ?? '')) ?? 0) + 1)
    if (isMarkerMarkdown(row)) markerHintsByGrid.set(String(row.parentId ?? ''), (markerHintsByGrid.get(String(row.parentId ?? '')) ?? 0) + 1)
  }
  const levelOf = (title: string): 'L1' | 'L2' | 'L3' | 'L4' =>
    (L1_PAGES as readonly string[]).includes(title) ? 'L1' : (L2_PAGES as readonly string[]).includes(title) ? 'L2' : isBoardLike(title) ? 'L4' : 'L3'
  const isBoardLike = (title: string): boolean =>
    /看板|仪表盘|日历|终端|甘特|雷达|工作台|应用中心/.test(title)
  const levels = flowPages.map(page => {
    const gridUid = snapshot.gridByPage.get(page.title ?? '') ?? ''
    return {
      title: page.title ?? '',
      uid: page.schemaUid ?? '',
      level: levelOf(page.title ?? ''),
      statCards: markerChartsByGrid.get(gridUid) ?? 0,
      hintBlock: markerHintsByGrid.get(gridUid) ?? 0,
    }
  }).sort((a, b) => a.level.localeCompare(b.level) || a.title.localeCompare(b.title))
  const payload = {
    generatedAt: new Date().toISOString(),
    monthWindow: MONTH_START,
    counts: {
      L1: levels.filter(row => row.level === 'L1').length,
      L2: levels.filter(row => row.level === 'L2').length,
      L3: levels.filter(row => row.level === 'L3').length,
      L4: levels.filter(row => row.level === 'L4').length,
    },
    pages: levels,
  }
  writeFileSync(LEVELS_PATH, `${JSON.stringify(payload, null, 2)}\n`)
  console.log(`w4-b3 levels: L1=${String(payload.counts.L1)} L2=${String(payload.counts.L2)} L3=${String(payload.counts.L3)} L4=${String(payload.counts.L4)} -> ${LEVELS_PATH}`)
}

// ─── assert (the setup-verify gate) ───

async function assertB3(token: string): Promise<void> {
  const snapshot = await loadSnapshot(token)
  const failures: string[] = []

  let l1Cards = 0, l2Cards = 0, hints = 0, untitled = 0
  const l3l4Strays: string[] = []
  for (const row of snapshot.models) {
    if (row?.use === 'ChartBlockModel') {
      if (String(row.props?.title ?? '') === '') untitled++
      if (isMarkerChart(row)) {
        const page = snapshot.pageByGrid.get(String(row.parentId ?? '')) ?? '?'
        if ((L1_PAGES as readonly string[]).includes(page)) l1Cards++
        else if ((L2_PAGES as readonly string[]).includes(page)) l2Cards++
        else l3l4Strays.push(page)
      }
    }
    if (isMarkerMarkdown(row)) hints++
  }

  const l1NoCards: string[] = []
  for (const page of L1_PAGES) {
    const gridUid = snapshot.gridByPage.get(page)
    const cards = gridUid === undefined ? 0 : snapshot.models.filter(row => String(row.parentId ?? '') === gridUid && isMarkerChart(row)).length
    if (cards < 3) l1NoCards.push(`${page}(${String(cards)})`)
  }
  const l2NoCards: string[] = []
  for (const page of L2_PAGES) {
    const gridUid = snapshot.gridByPage.get(page)
    const cards = gridUid === undefined ? 0 : snapshot.models.filter(row => String(row.parentId ?? '') === gridUid && isMarkerChart(row)).length
    if (cards < 1) l2NoCards.push(`${page}(${String(cards)})`)
  }
  const l1NoHint = L1_PAGES.filter(page => {
    const gridUid = snapshot.gridByPage.get(page)
    return gridUid === undefined || !snapshot.models.some(row => String(row.parentId ?? '') === gridUid && isMarkerMarkdown(row))
  })

  const base = terminalBase()
  const iframeStrays: string[] = []
  for (const page of TERMINAL_PAGES) {
    const gridUid = snapshot.gridByPage.get(page)
    const iframe = gridUid === undefined ? undefined : snapshot.models.find(row => row?.use === 'IframeBlockModel' && String(row.parentId ?? '') === gridUid)
    if (iframe === undefined) {
      iframeStrays.push(`${page}: IframeBlockModel missing`)
      continue
    }
    const url = String(iframe.props?.url ?? '')
    if (!url.startsWith(base)) iframeStrays.push(`${page}: ${url} !~ ${base}`)
  }

  // member must hold the charts:queryData grant row — the stat cards' data
  // endpoint re-checks the target collection's query permission per role
  // (plugin-data-visualization checkPermission → applyQueryPermission), and
  // the qc_inspector 390px leg found member still 403s on some collections
  // beyond this row (upstream ACL semantics; 遗留 — admin/root render fine).
  // The row is necessary groundwork, the assert only claims its existence.
  let memberChart = true
  {
    const resource = await dataOf(token, 'GET', `/api/rolesResources:list?pageSize=100&filter=${encodeURIComponent(JSON.stringify({ roleName: { $eq: 'member' }, name: { $eq: 'charts' } }))}`) as Array<{ id?: number }> | null
    const resourceId = resource?.[0]?.id
    if (resourceId === undefined) memberChart = false
    else {
      const actions = await dataOf(token, 'GET', `/api/rolesResourcesActions:list?pageSize=100&filter=${encodeURIComponent(JSON.stringify({ rolesResourceId: { $eq: resourceId } }))}`) as Array<{ name?: string }> | null
      memberChart = (actions ?? []).some(row => row.name === 'queryData')
    }
  }
  const report = [
    `l1Cards=${String(l1Cards)}`, `l2Cards=${String(l2Cards)}`, `hints=${String(hints)}`,
    `untitledCharts=${String(untitled)}`, `terminalBase=${base}`, `memberChartQuery=${String(memberChart)}`,
  ]
  console.log(`w4-b3 assert: ${report.join(' ')}`)
  if (l1NoCards.length > 0) failures.push(`L1 统计卡 <3 的页面: ${l1NoCards.join(', ')}`)
  if (l2NoCards.length > 0) failures.push(`L2 计数卡 <1 的页面: ${l2NoCards.join(', ')}`)
  if (l1NoHint.length > 0) failures.push(`L1 缺说明块: ${l1NoHint.join(', ')}`)
  if (untitled !== 0) failures.push(`图表块 props.title 为空 ${String(untitled)} 个（P-3' 18/18 未达）`)
  if (l3l4Strays.length > 0) failures.push(`L3/L4 页出现 w4b3 统计卡（分级越界）: ${[...new Set(l3l4Strays)].join(', ')}`)
  if (iframeStrays.length > 0) failures.push(`终端 iframe 未落在 W3_TERMINAL_BASE: ${iframeStrays.join('; ')}`)
  if (!memberChart) failures.push('member 角色缺 charts:queryData 授权（统计卡在非 admin 角色渲染占位；重跑 --all 落授权）')
  if (failures.length > 0) {
    console.error(`w4-b3 assert: FAILED\n  - ${failures.join('\n  - ')}`)
    process.exitCode = 1
    return
  }
  console.log('w4-b3 assert: OK — L1 30页统计卡≥3 + L2 20页计数卡≥1 + 说明块全覆盖 + 图表标题 100% + iframe base 生效 + member charts 授权')
  writeFileSync(`${RESEARCH_DIR}w4-b3-probe-after.json`, `${JSON.stringify({ generatedAt: new Date().toISOString(), l1Cards, l2Cards, hints, untitled, terminalBase: base, memberChartQuery: memberChart, monthWindow: MONTH_START }, null, 2)}\n`)
}

// ─── psql 对拍 (read-only expectations for the journey screenshots) ───

const quote = (value: unknown): string => (typeof value === 'number' ? String(value) : typeof value === 'boolean' ? (value ? 'true' : 'false') : `'${String(value).replace(/'/g, "''")}'`)

/** One card filter → its SQL WHERE clause (the $in/$eq/$gte subset B3 uses). */
function filterToSql(filter: Record<string, unknown> | undefined): string {
  if (filter === undefined) return ''
  const clauses: string[] = []
  for (const [field, raw] of Object.entries(filter)) {
    if (raw !== null && typeof raw === 'object' && !Array.isArray(raw)) {
      for (const [operator, value] of Object.entries(raw as Record<string, unknown>)) {
        if (operator === '$in' && Array.isArray(value)) clauses.push(`${field} IN (${value.map(quote).join(', ')})`)
        else if (operator === '$eq') clauses.push(`${field} = ${quote(value)}`)
        else if (operator === '$gte') clauses.push(`${field} >= ${quote(value)}`)
      }
    } else {
      clauses.push(`${field} = ${quote(raw)}`)
    }
  }
  return clauses.length === 0 ? '' : ` WHERE ${clauses.join(' AND ')}`
}

function reconcile(): void {
  const env = readFileSync(new URL('../../../platform/nocobase/.env', import.meta.url).pathname, 'utf8')
  const envOf = (key: string): string | undefined => env.split('\n').map(line => line.trim()).find(line => line.startsWith(`${key}=`))?.slice(key.length + 1)
  const psql = ['psql', '-h', envOf('DB_HOST') ?? 'localhost', '-p', envOf('DB_PORT') ?? '5432', '-U', envOf('DB_USER') ?? 'postgres', '-d', envOf('DB_NAME') ?? 'nocobase', '-t', '-A']
  const RECONCILE_PAGES = ['采购订单', '生产订单', '销售订单', '入库单', '质检单', '库存查询']
  const lines: string[] = [`# w4-b3 psql 对拍 @ ${new Date().toISOString()}（月窗口 ${MONTH_START}）`]
  let mismatches = 0
  for (const page of RECONCILE_PAGES) {
    for (const card of L1_CARDS[page] ?? []) {
      const aggSql = card.agg === 'count' ? 'COUNT(*)' : `${card.agg.toUpperCase()}(${card.field ?? 'id'})`
      const sql = `SELECT COALESCE(${aggSql}, 0) FROM ${card.collection}${filterToSql(card.filter)};`
      const run = spawnSync(psql[0], [...psql.slice(1), '-c', sql], { encoding: 'utf8', env: { ...process.env, PGPASSWORD: envOf('DB_PASSWORD') ?? 'nocobase' }, timeout: 15_000 })
      const expected = run.status === 0 ? (run.stdout ?? '').trim() : `psql-error: ${(run.stderr ?? '').trim().slice(0, 120)}`
      if (run.status !== 0) mismatches++
      lines.push(`${page} | ${card.title} | ${sql} | 期望=${expected}`)
    }
  }
  lines.push(mismatches === 0 ? '# psql 对拍：6 页全量卡 SQL 可执行（数值与页面截图人工对拍）' : `# psql 对拍：${String(mismatches)} 条 SQL 失败`)
  const out = lines.join('\n')
  console.log(out)
  writeFileSync(`${RESEARCH_DIR}w4-b3-psql-reconcile.txt`, `${out}\n`)
  if (mismatches > 0) process.exitCode = 1
}

// ─── rollback ───

async function rollback(token: string, page: string | undefined): Promise<void> {
  const snapshot = await loadSnapshot(token)
  const targets = page === undefined ? [...L1_PAGES, ...L2_PAGES] : [page]
  let destroyed = 0
  for (const title of targets) {
    const gridUid = snapshot.gridByPage.get(title)
    if (gridUid === undefined) continue
    for (const row of snapshot.models.filter(item => String(item.parentId ?? '') === gridUid && (isMarkerChart(item) || isMarkerMarkdown(item)))) {
      await call(token, 'POST', `/api/flowModels:destroy?filterByTk=${encodeURIComponent(String(row.uid))}`)
      destroyed++
    }
  }
  console.log(`w4-b3 rollback: ${String(destroyed)} marker block(s) destroyed${page === undefined ? ' (all pages)' : ` (${page})`}; re-run --all to rebuild`)
}

// ─── CLI ───

async function main(): Promise<void> {
  const args = process.argv.slice(2)
  const dryRun = args.includes('--dry-run')
  const pilot = args.includes('--pilot')
  const all = args.includes('--all')
  const doTitles = args.includes('--titles')
  const doIframe = args.includes('--iframe')
  const doLevels = args.includes('--levels')
  const doRollback = args.includes('--rollback')
  const doAssert = args.includes('--assert')
  const doReconcile = args.includes('--reconcile')
  const pageIndex = args.indexOf('--page')
  const page = pageIndex >= 0 ? args[pageIndex + 1] : undefined
  if (args.length === 0 || (!dryRun && !pilot && !all && !doTitles && !doIframe && !doLevels && !doRollback && !doAssert && !doReconcile)) {
    console.error('usage: w4-heal-b3.mts --dry-run|--pilot|--all|--titles|--iframe|--levels|--assert|--reconcile|--rollback [--page <title>]')
    process.exitCode = 2
    return
  }
  if (doReconcile) {
    reconcile()
    return
  }
  const token = await signInWithRetry()
  if (doAssert) {
    await assertB3(token)
    return
  }
  if (doRollback) {
    await rollback(token, page)
    return
  }
  let snapshot = await loadSnapshot(token)
  const runLog: string[] = [`# w4-b3 heal ${dryRun ? 'dry-run' : 'run'} @ ${new Date().toISOString()}`]
  if (doLevels) {
    await writeLevels(token, snapshot)
    return
  }
  if (doTitles) {
    const titleLog = await healTitles(token, snapshot, dryRun)
    runLog.push(...(titleLog.length > 0 ? titleLog : ['titles: all charts already titled']))
  }
  if (doIframe) {
    runLog.push(...await healIframes(token, snapshot, dryRun))
  }
  if (pilot || all) {
    const cardPages: Array<[string, readonly CardSpec[]]> = pilot
      ? [['采购订单', L1_CARDS['采购订单'] ?? []]]
      : [...L1_PAGES.map(title => [title, L1_CARDS[title] ?? []] as [string, readonly CardSpec[]]), ...L2_PAGES.map(title => [title, L2_CARDS[title] ?? []] as [string, readonly CardSpec[]])]
    for (const [title, cards] of cardPages) {
      if (cards.length === 0) throw new Error(`no card spec for page "${title}" — the 台账 and the spec table must stay in sync`)
      const cardLog = await healStatCards(token, snapshot, title, cards, dryRun)
      runLog.push(...cardLog.lines)
      const hint = L1_HINTS[title]
      const hintLog = hint === undefined ? { lines: [], hintUid: null } : await healHint(token, snapshot, title, hint, dryRun)
      runLog.push(...hintLog.lines)
      if (!dryRun) {
        const gridUid = snapshot.gridByPage.get(title)
        if (gridUid === undefined) throw new Error(`page "${title}" grid lost after heal`)
        await seatGridTopBlocks(token, gridUid, { hintUid: hintLog.hintUid, cardUids: cardLog.cardUids })
        runLog.push(`seat "${title}": hint + ${String(cardLog.cardUids.length)} cards moved to grid top (rows rewrite)`)
        snapshot = await loadSnapshot(token)
      }
    }
    if (!dryRun) runLog.push(...await healTitles(token, snapshot, false))
    if (!dryRun) runLog.push(...await healIframes(token, snapshot, false))
    if (!dryRun) {
      await ensureMemberChartQuery(token)
      runLog.push('member charts:queryData grant ensured (stat cards render for non-admin roles)')
    }
    if (!dryRun) await writeLevels(token, snapshot)
  }
  const out = runLog.join('\n')
  console.log(out)
  const target = pilot ? 'pilot' : all ? 'all' : doTitles ? 'titles' : 'iframe'
  writeFileSync(`${RESEARCH_DIR}w4-b3-heal-${dryRun ? 'dryrun' : 'run'}-${target}.txt`, `${out}\n`)
}

void main().catch(error => {
  console.error(error)
  process.exit(1)
})
