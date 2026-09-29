/**
 * nocobase-w8-quality.mts — W 轮 B8 质量域：三检检验单 + AQL 抽样查表 +
 * 不合格四路处置 + 供应商绩效联动（09-b8-quality.md）。
 *
 * Owns:
 * 1. Four qm_* collections — qm_inspections (IQC/IPQC/OQC/CCP, ref anchors on
 *    wms_receipts / mfg_job_reports / mfg_completions; W2-B1 adds the
 *    per-verdict rigor snapshot + resubmission flags), qm_inspection_readings
 *    (行级读数 + 自动判定), qm_aql_plans (GB/T 2828.1—2012 全 15 批量段 ×
 *    normal/tightened/reduced 三严格度 135 行种子——原始主表网格 + 箭头解析
 *    resolvePlan 就在本文件, 双源数据声明见网格常量区),
 *    qm_nc_dispositions (四路处置, B1 六态 doc_status).
 * 2. Additive columns: srm_suppliers.reject_streak, srm_capas.inspection_code,
 *    mfg_orders.source (standard|rework), wms_lots.concession_flag,
 *    wms_receipts.received_at, pur_orders.expected_date (OTD-S 轴).
 * 3. The qm_nc_dispositions approval flow via approval-engine seedDocFlow
 *    (让步必审批留痕 rides the B1 engine; concession without approver +
 *    deviation_note refuses in the engine's disposeNc).
 * 4. Five 质量管理 pages (检验单/读数/处置看板 kanban/AQL 方案/季度绩效物化).
 * 5. --demo-chain: PO→收货→挂点建单→AQL 判定 (passed/failed)→放行卡口负例→
 *    退货处置 (RETURN_VENDOR 勾稽)→让步处置 (B1 留痕)→5批2拒加严切换→
 *    降档判定→季度绩效物化→AVL 四联查负例→对账。
 *
 * The engine verbs (--inspect / --create-nc / --dispose / --calc-scorecard)
 * live in nocobase-h5-wms.mts; this script builds the surface they read and
 * write. CAPA rows on failed verdicts are engine-written (idempotent by
 * title) rather than collection-workflow-created — an update-mode trigger
 * cannot dedupe replays (取舍 recorded in the Agent Note).
 *
 * Rollback: --rollback destroys the four qm_* collections, the five
 * flowPages + the 质量管理 group, and the qm_nc_dispositions flow config.
 * The additive columns on pre-existing collections stay (they are nullable).
 *
 * Usage (repo root, tsx loader):
 *   node --import tsx/esm examples/kb-agent/scripts/nocobase-w8-quality.mts
 *   node --import tsx/esm examples/kb-agent/scripts/nocobase-w8-quality.mts --selftest
 *   node --import tsx/esm examples/kb-agent/scripts/nocobase-w8-quality.mts --demo-chain
 *   node --import tsx/esm examples/kb-agent/scripts/nocobase-w8-quality.mts --rollback
 */
import { spawnSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { call, dataOf, drawerPageTreeFor, ensureTableRowDetail, listFlowModels, listRoutes, signInWithRetry, withN17Prefix } from './nocobase-flow-page-lib.mts'
import { seedDocFlow, submitForApproval, act, enforceGates, type NocoIO } from './approval-engine.mts'

type RouteRow = import('./nocobase-flow-page-lib.mts').RouteRow
type FlowModelRow = import('./nocobase-flow-page-lib.mts').FlowModelRow

const here = dirname(fileURLToPath(import.meta.url))

// ─── field factories (name explicit — collections:create mints random f_* columns otherwise) ───

const input = (name: string, title: string): object => ({ name, type: 'string', interface: 'input', uiSchema: { type: 'string', 'x-component': 'Input', title } })
const select = (name: string, title: string, enumOptions: object[]): object => ({ name, type: 'string', interface: 'select', uiSchema: { type: 'string', 'x-component': 'Select', title, enum: enumOptions } })
const number = (name: string, title: string): object => ({ name, type: 'float', interface: 'number', uiSchema: { type: 'number', 'x-component': 'InputNumber', title } })
const integer = (name: string, title: string): object => ({ name, type: 'integer', interface: 'number', uiSchema: { type: 'number', 'x-component': 'InputNumber', title } })
const date = (name: string, title: string): object => ({ name, type: 'dateOnly', interface: 'date', uiSchema: { type: 'string', 'x-component': 'DatePicker', title, 'x-component-props': { dateFormat: 'YYYY-MM-DD' } } })
const textarea = (name: string, title: string): object => ({ name, type: 'text', interface: 'textarea', uiSchema: { type: 'string', 'x-component': 'Input.TextArea', title } })
const boolean = (name: string, title: string): object => ({ name, type: 'boolean', interface: 'boolean', uiSchema: { type: 'boolean', 'x-component': 'Checkbox', title } })
const belongsTo = (name: string, title: string, target: string, foreignKey: string, labelField = 'name'): object => ({
  name, type: 'belongsTo', interface: 'm2o', target, foreignKey,
  uiSchema: { type: 'object', 'x-component': 'AssociationField', title, 'x-component-props': { multiple: false, fieldNames: { label: labelField, value: 'id' } } },
})

const opts = (pairs: ReadonlyArray<[string, string, string]>): object[] => pairs.map(([value, label, color]) => ({ value, label, color }))

// ─── option sets ───

const INSP_TYPE = opts([
  ['IQC', '来料检验', 'blue'], ['IPQC', '过程检验', 'purple'],
  ['OQC', '成品检验', 'cyan'], ['CCP', '关键控制点', 'red'],
])
const INSP_RESULT = opts([
  ['pending', '待检', 'orange'], ['passed', '合格', 'green'],
  ['failed', '不合格', 'red'], ['concession', '让步接收', 'purple'],
])
const INSP_STATUS = opts([
  ['draft', '草稿', 'default'], ['pending', '待检', 'blue'], ['closed', '已判定', 'green'],
])
const REF_TYPE = opts([
  ['receipt', '收货单', 'blue'], ['job_report', '报工单', 'purple'], ['completion', '完工单', 'cyan'],
])
/** 行级读数的判定轴：数值公差（spec_min/max）或非数值判据（criteria）。 */
const NC_ACTION = opts([
  ['return', '退货', 'red'], ['concession', '让步接收', 'purple'],
  ['rework', '返工', 'orange'], ['scrap', '报废', 'magenta'],
])
const NC_DOC_STATUS = opts([
  ['draft', '草稿', 'default'], ['pending', '待审批', 'orange'], ['pending_level2', '二级审批中', 'purple'],
  ['approved', '已生效', 'green'], ['rejected', '已驳回', 'red'], ['void', '已作废', 'default'],
])
const NC_STATUS = opts([['open', '处置中', 'orange'], ['closed', '已闭环', 'green']])
const AQL_SEVERITY = opts([['major', '主要缺陷', 'orange'], ['minor', '次要缺陷', 'default']])
const AQL_RIGOR = opts([['normal', '正常', 'blue'], ['tightened', '加严', 'orange'], ['reduced', '放宽', 'green']])
const MO_SOURCE = opts([['standard', '标准', 'default'], ['rework', '返工', 'orange']])

// ─── collections ───

const COLLECTIONS: ReadonlyArray<{ name: string, title: string, titleField?: string, fields: object[] }> = [
  {
    name: 'qm_inspections', title: '质检单', titleField: 'code', fields: [
      input('code', '质检单号'), select('insp_type', '检验类型', INSP_TYPE),
      select('ref_type', '来源类型', REF_TYPE), input('ref_no', '来源单号'), integer('ref_id', '来源ID'),
      belongsTo('product', '物料', 'hub_inv_products', 'product_id'),
      belongsTo('supplier', '供应商', 'srm_suppliers', 'supplier_id'),
      input('lot_no', '批次号'), number('lot_qty', '批量'),
      number('sample_qty', '样本量'), integer('defect_critical', '严重缺陷数'),
      integer('defect_major', '主要缺陷数'), integer('defect_minor', '次要缺陷数'),
      input('aql_target', 'AQL档'), input('aql_code', '样本字码'), integer('aql_n', 'n'),
      integer('aql_ac', 'Ac'), integer('aql_re', 'Re'),
      select('rigor', '判定严格度', AQL_RIGOR), boolean('resubmission', '再提交批'),
      select('result', '判定结果', INSP_RESULT), select('status', '单据状态', INSP_STATUS),
      input('inspector', '检验员'), date('inspected_at', '检验日期'), textarea('note', '判定说明'),
    ],
  },
  {
    name: 'qm_inspection_readings', title: '检验读数', titleField: 'id', fields: [
      belongsTo('inspection', '质检单', 'qm_inspections', 'inspection_id', 'code'),
      input('parameter', '检验参数'),
      number('spec_min', '规格下限'), number('spec_max', '规格上限'), textarea('criteria', '判据(非数值)'),
      number('actual', '实测值'), boolean('pass', '合格'),
    ],
  },
  {
    // 静态查表种子：GB/T 2828.1—2012 一般水平 II 一次抽样全 15 段主表
    // （W2-B1 重灌：normal 5 档 + tightened/reduced 各 2 档共 135 行，箭头
    // 解析后的最终方案；原始网格与 resolvePlan 见上方常量区，双源数据
    // 声明见文件头注释）。B8 的实测三段数组与「加严=AQL 降一档」近似已被
    // 真表替换——行为变化见 W2-B1 Agent Note。
    name: 'qm_aql_plans', title: 'AQL抽样方案', titleField: 'id', fields: [
      input('lot_band', '批量段'), input('level', '检验水平'), select('rigor', '严格度', AQL_RIGOR),
      input('code', '样本字码'), integer('n', '样本量'),
      select('severity', '缺陷级', AQL_SEVERITY), input('aql', 'AQL'),
      integer('ac', 'Ac'), integer('re', 'Re'),
    ],
  },
  {
    name: 'qm_nc_dispositions', title: '不合格处置单', titleField: 'code', fields: [
      input('code', '处置单号'), belongsTo('inspection', '质检单', 'qm_inspections', 'inspection_id', 'code'),
      select('action', '处置路径', NC_ACTION), textarea('reason', '处置原因'),
      input('approver', '审批人'), textarea('deviation_note', '让步偏差说明'),
      select('doc_status', '审批状态', NC_DOC_STATUS), select('status', '闭环状态', NC_STATUS),
      input('ref_no', '关联单据'), number('scrap_cost', '报废成本'),
    ],
  },
]

// ─── AQL master grids (GB/T 2828.1—2012, 一般检验水平 II, 一次抽样; W2-B1) ───
//
// 数据来源（W2 双源调研，禁中文转载表——已证伪旧表冒充 2012 版）：标准原文
// 扫描件双读锚点 + SQC Online ISO 2859-1 程序化逐格点验
// (research/2026-09-27-gbt2828-1-aql-sampling-w2.md 主 +
//  research/2026-09-27-w2-gbt2828-aql-sampling-research.md 交叉佐证)。
// 两源在 1.5 列与 0.65×281-500 分歧：按交叉报告逐格实测 + 结构规律裁定
// (每列数字带必含 0/1 起点; AQL 越小同档数字格越靠下方; n×AQL% ≈ Ac 期望)。

/** 样本量字码序列（表 1，跳 I/O；R=2000 仅水平 III 可达，不入种）。 */
export const CODE_SEQ = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'J', 'K', 'L', 'M', 'N', 'P', 'Q', 'R'] as const
export type AqlCode = (typeof CODE_SEQ)[number]
/** 严格度（qm_aql_plans.rigor 与检验单判定快照共用）。 */
export type AqlRigor = 'normal' | 'tightened' | 'reduced'

/** 正常/加严检验同码样本量（表 2-A/2-B 共用表 1 的 n 列）。 */
export const N_BY_CODE: Record<AqlCode, number> = { A: 2, B: 3, C: 5, D: 8, E: 13, F: 20, G: 32, H: 50, J: 80, K: 125, L: 200, M: 315, N: 500, P: 800, Q: 1250, R: 2000 }
/** 放宽检验样本量（表 2-C 整体低两级；A/B/C 同为 2，箭头必须按字码索引滑动、不可按 n 值反查）。 */
export const N_REDUCED_BY_CODE: Record<AqlCode, number> = { A: 2, B: 2, C: 2, D: 3, E: 5, F: 8, G: 13, H: 20, J: 32, K: 50, L: 80, M: 125, N: 200, P: 315, Q: 500, R: 800 }

/** 主表格子：数值格 {ac,re}，或箭头格 {arrow:+1 ↓ 向样本量大端 / -1 ↑ 向小端}（标准 10.3）。 */
export type AqlCell = { ac: number, re: number } | { arrow: 1 | -1 }

const DOWN: AqlCell = { arrow: 1 }
const UP: AqlCell = { arrow: -1 }
type AqlColumn = Record<AqlCode, AqlCell>

/**
 * 原始主表网格（每 AQL 列 × 16 字码格全覆盖）。normal 全 5 档；
 * tightened/reduced 只落 1.0/2.5（食品 major/minor 双档惯例——0.65/1.5/4.0
 * 的加严/放宽列研究报告未全量点验，落了反而引入未验证数据；未命中组合
 * 运行时 fail-loud）。
 */
export const PLAN_GRIDS: Record<AqlRigor, Record<string, AqlColumn>> = {
  normal: {
    '0.65': { A: DOWN, B: DOWN, C: DOWN, D: DOWN, E: DOWN, F: { ac: 0, re: 1 }, G: UP, H: DOWN, J: { ac: 1, re: 2 }, K: { ac: 2, re: 3 }, L: { ac: 3, re: 4 }, M: { ac: 5, re: 6 }, N: { ac: 7, re: 8 }, P: { ac: 10, re: 11 }, Q: { ac: 14, re: 15 }, R: UP },
    '1.0': { A: DOWN, B: DOWN, C: DOWN, D: DOWN, E: { ac: 0, re: 1 }, F: UP, G: DOWN, H: { ac: 1, re: 2 }, J: { ac: 2, re: 3 }, K: { ac: 3, re: 4 }, L: { ac: 5, re: 6 }, M: { ac: 7, re: 8 }, N: { ac: 10, re: 11 }, P: { ac: 14, re: 15 }, Q: { ac: 21, re: 22 }, R: UP },
    '1.5': { A: DOWN, B: DOWN, C: DOWN, D: { ac: 0, re: 1 }, E: UP, F: DOWN, G: { ac: 1, re: 2 }, H: { ac: 2, re: 3 }, J: { ac: 3, re: 4 }, K: { ac: 5, re: 6 }, L: { ac: 7, re: 8 }, M: { ac: 10, re: 11 }, N: { ac: 14, re: 15 }, P: { ac: 21, re: 22 }, Q: UP, R: UP },
    '2.5': { A: DOWN, B: DOWN, C: { ac: 0, re: 1 }, D: UP, E: DOWN, F: { ac: 1, re: 2 }, G: { ac: 2, re: 3 }, H: { ac: 3, re: 4 }, J: { ac: 5, re: 6 }, K: { ac: 7, re: 8 }, L: { ac: 10, re: 11 }, M: { ac: 14, re: 15 }, N: { ac: 21, re: 22 }, P: UP, Q: UP, R: UP },
    '4.0': { A: DOWN, B: { ac: 0, re: 1 }, C: UP, D: DOWN, E: { ac: 1, re: 2 }, F: { ac: 2, re: 3 }, G: { ac: 3, re: 4 }, H: { ac: 5, re: 6 }, J: { ac: 7, re: 8 }, K: { ac: 10, re: 11 }, L: { ac: 14, re: 15 }, M: { ac: 21, re: 22 }, N: UP, P: UP, Q: UP, R: UP },
  },
  tightened: {
    '1.0': { A: DOWN, B: DOWN, C: DOWN, D: DOWN, E: DOWN, F: { ac: 0, re: 1 }, G: DOWN, H: DOWN, J: { ac: 1, re: 2 }, K: { ac: 2, re: 3 }, L: { ac: 3, re: 4 }, M: { ac: 5, re: 6 }, N: { ac: 8, re: 9 }, P: { ac: 12, re: 13 }, Q: { ac: 18, re: 19 }, R: UP },
    '2.5': { A: DOWN, B: DOWN, C: DOWN, D: { ac: 0, re: 1 }, E: DOWN, F: DOWN, G: { ac: 1, re: 2 }, H: { ac: 2, re: 3 }, J: { ac: 3, re: 4 }, K: { ac: 5, re: 6 }, L: { ac: 8, re: 9 }, M: { ac: 12, re: 13 }, N: { ac: 18, re: 19 }, P: UP, Q: UP, R: UP },
  },
  reduced: {
    '1.0': { A: DOWN, B: DOWN, C: DOWN, D: DOWN, E: { ac: 0, re: 1 }, F: UP, G: DOWN, H: DOWN, J: { ac: 1, re: 2 }, K: { ac: 2, re: 3 }, L: { ac: 3, re: 4 }, M: { ac: 5, re: 6 }, N: { ac: 6, re: 7 }, P: { ac: 8, re: 9 }, Q: { ac: 10, re: 11 }, R: UP },
    '2.5': { A: DOWN, B: DOWN, C: { ac: 0, re: 1 }, D: UP, E: DOWN, F: DOWN, G: { ac: 1, re: 2 }, H: { ac: 2, re: 3 }, J: { ac: 3, re: 4 }, K: { ac: 5, re: 6 }, L: { ac: 6, re: 7 }, M: { ac: 8, re: 9 }, N: { ac: 10, re: 11 }, P: UP, Q: UP, R: UP },
  },
}

/** 表 1 批量段（一般检验水平 II，15 段；首两段 2-8/9-15 为原文表 1 双读裁定）。 */
export type LotBand = { min: number, max: number | null, label: string, code: AqlCode }
export const LOT_BANDS: ReadonlyArray<LotBand> = [
  { min: 2, max: 8, label: '2-8', code: 'A' },
  { min: 9, max: 15, label: '9-15', code: 'B' },
  { min: 16, max: 25, label: '16-25', code: 'C' },
  { min: 26, max: 50, label: '26-50', code: 'D' },
  { min: 51, max: 90, label: '51-90', code: 'E' },
  { min: 91, max: 150, label: '91-150', code: 'F' },
  { min: 151, max: 280, label: '151-280', code: 'G' },
  { min: 281, max: 500, label: '281-500', code: 'H' },
  { min: 501, max: 1200, label: '501-1200', code: 'J' },
  { min: 1201, max: 3200, label: '1201-3200', code: 'K' },
  { min: 3201, max: 10000, label: '3201-10000', code: 'L' },
  { min: 10001, max: 35000, label: '10001-35000', code: 'M' },
  { min: 35001, max: 150000, label: '35001-150000', code: 'N' },
  { min: 150001, max: 500000, label: '150001-500000', code: 'P' },
  { min: 500001, max: null, label: '500001+', code: 'Q' },
]

/** 表 1 检索：批量 → 所在段（N<2 无段，调用方 fail-loud）。 */
export function bandForLot(lotQty: number): LotBand | undefined {
  return LOT_BANDS.find(band => lotQty >= band.min && (band.max === null || lotQty <= band.max))
}

/**
 * 主表检索 + 箭头解析（标准 10.3）：沿箭头方向在 CODE_SEQ 上滑到第一个数值
 * 格，n 取新字码的样本量、Ac/Re 取该格值。未入种组合（如 tightened×0.65）
 * 返回 undefined，由调用方 fail-loud——不猜测。
 * @param rigor - 严格度（normal/tightened/reduced）。
 * @param aql - AQL 档（'0.65'|'1.0'|'1.5'|'2.5'|'4.0'，按严格度可用档不同）。
 * @param code - 批量段的样本量字码。
 * @returns 解析后的最终方案（箭头滑落后的字码/n/Ac/Re），未命中 undefined。
 */
export function resolvePlan(rigor: AqlRigor, aql: string, code: AqlCode): { code: AqlCode, n: number, ac: number, re: number } | undefined {
  const column = PLAN_GRIDS[rigor]?.[aql]
  if (column === undefined) return undefined
  let index = CODE_SEQ.indexOf(code)
  const visited = new Set<number>()
  while (index >= 0 && index < CODE_SEQ.length && !visited.has(index)) {
    visited.add(index)
    const stepped = CODE_SEQ[index]
    const cell = stepped === undefined ? undefined : column[stepped]
    if (cell === undefined) return undefined
    if ('arrow' in cell) { index += cell.arrow; continue }
    return { code: stepped, n: (rigor === 'reduced' ? N_REDUCED_BY_CODE : N_BY_CODE)[stepped], ac: cell.ac, re: cell.re }
  }
  return undefined
}

const SEVERITY_BY_AQL: Record<string, string> = { '0.65': 'major', '1.0': 'major', '1.5': 'minor', '2.5': 'minor', '4.0': 'minor' }
const RIGOR_AQLS: Record<AqlRigor, ReadonlyArray<string>> = { normal: ['0.65', '1.0', '1.5', '2.5', '4.0'], tightened: ['1.0', '2.5'], reduced: ['1.0', '2.5'] }

/** 种子行 = 15 段 × (normal 5 档 + tightened 2 档 + reduced 2 档) = 135 行（箭头解析后的最终方案）。 */
export function buildAqlSeedRows(): ReadonlyArray<{ lot_band: string, level: string, code: string, n: number, severity: string, aql: string, rigor: AqlRigor, ac: number, re: number }> {
  const rows: Array<{ lot_band: string, level: string, code: string, n: number, severity: string, aql: string, rigor: AqlRigor, ac: number, re: number }> = []
  for (const band of LOT_BANDS) {
    for (const rigor of ['normal', 'tightened', 'reduced'] as const) {
      for (const aql of RIGOR_AQLS[rigor]) {
        const plan = resolvePlan(rigor, aql, band.code)
        if (plan === undefined) throw new Error(`AQL 网格未命中：${rigor} × ${aql} × ${band.code}（种子生成内部错误）`)
        rows.push({ lot_band: band.label, level: 'II', code: plan.code, n: plan.n, severity: SEVERITY_BY_AQL[aql] ?? 'minor', aql, rigor, ac: plan.ac, re: plan.re })
      }
    }
  }
  return rows
}

// ─── additive columns on pre-existing collections (nullable, never dropped) ───

const ADDITIVE_COLUMNS: ReadonlyArray<{ collection: string, probe: string, field: object }> = [
  { collection: 'qm_aql_plans', probe: 'rigor', field: select('rigor', '严格度', AQL_RIGOR) },
  { collection: 'srm_suppliers', probe: 'reject_streak', field: integer('reject_streak', '连续拒收批数') },
  { collection: 'srm_suppliers', probe: 'switch_score', field: integer('switch_score', '转移得分') },
  { collection: 'qm_inspections', probe: 'rigor', field: select('rigor', '判定严格度', AQL_RIGOR) },
  { collection: 'qm_inspections', probe: 'resubmission', field: boolean('resubmission', '再提交批') },
  { collection: 'srm_capas', probe: 'inspection_code', field: input('inspection_code', '关联质检单') },
  { collection: 'mfg_orders', probe: 'source', field: select('source', '工单来源', MO_SOURCE) },
  { collection: 'wms_lots', probe: 'concession_flag', field: boolean('concession_flag', '让步标记') },
  { collection: 'wms_receipts', probe: 'received_at', field: date('received_at', '收货日期') },
  { collection: 'pur_orders', probe: 'expected_date', field: date('expected_date', '承诺到货日') },
]

async function ensureCollections(token: string): Promise<void> {
  for (const collection of COLLECTIONS) {
    const existing = await dataOf(token, 'GET', `/api/collections/${collection.name}`)
    if (existing === null) {
      await dataOf(token, 'POST', '/api/collections:create', { name: collection.name, title: collection.title, fields: collection.fields })
      console.log(`nocobase-w8: collection ${collection.name} created`)
    } else {
      console.log(`nocobase-w8: collection ${collection.name} exists (kept)`)
    }
    if (collection.titleField !== undefined && existing?.titleField !== collection.titleField) {
      await call(token, 'POST', `/api/collections:update?filterByTk=${collection.name}`, { titleField: collection.titleField })
    }
  }
}

async function ensureAdditiveColumns(token: string): Promise<void> {
  for (const column of ADDITIVE_COLUMNS) {
    const fields = await dataOf(token, 'GET', `/api/fields:list?filter=${encodeURIComponent(JSON.stringify({ collectionName: { $eq: column.collection } }))}&pageSize=300`) as Array<{ name?: string }> | null
    if ((fields ?? []).some(field => field.name === column.probe)) continue
    await dataOf(token, 'POST', '/api/fields:create', { collectionName: column.collection, ...column.field })
    console.log(`nocobase-w8: ${column.collection}.${column.probe} added`)
  }
}

async function seedAqlPlans(token: string): Promise<void> {
  // 幂等重灌：全量 destroy 再 create（B8 的旧三段行 151-280×1.0=32/1/2 与
  // 箭头解析后的真表 50/1/2 冲突，必须替换；已判定检验单的缓存列是判定
  // 时点的快照，不回写——严格度切换只影响下一批）。
  for (const existing of await rowsOf(token, 'qm_aql_plans')) {
    await call(token, 'POST', `/api/qm_aql_plans:destroy?filterByTk=${String(existing.id)}`)
  }
  const rows = buildAqlSeedRows()
  for (const row of rows) {
    await dataOf(token, 'POST', '/api/qm_aql_plans:create', row)
  }
  console.log(`nocobase-w8: AQL 全表种子重灌 ${String(rows.length)} 行（15 段 × normal5 档 + tightened/reduced 各 2 档；GB/T 2828.1—2012 双源交叉）`)
}

/** 箭头解析对拍五例（研究报告 SQC Online 程序化点验；批 01-b1 验收 checkbox 2）。 */
const RESOLVE_CASES: ReadonlyArray<{ lot: number, aql: string, expect: { code: string, n: number, ac: number, re: number } }> = [
  { lot: 200, aql: '1.0', expect: { code: 'H', n: 50, ac: 1, re: 2 } },
  { lot: 150, aql: '1.0', expect: { code: 'E', n: 13, ac: 0, re: 1 } },
  { lot: 2000, aql: '2.5', expect: { code: 'K', n: 125, ac: 7, re: 8 } },
  { lot: 90, aql: '0.65', expect: { code: 'F', n: 20, ac: 0, re: 1 } },
  { lot: 600000, aql: '2.5', expect: { code: 'N', n: 500, ac: 21, re: 22 } },
]

/**
 * W2-B1 selftest：resolvePlan 五例对拍 + 种子完备性（135 行、三严格度分布、
 * 验收抽查格）。纯函数层不连库；fail-loud 退出。
 */
export function selftestAql(): void {
  let failures = 0
  for (const testCase of RESOLVE_CASES) {
    const band = bandForLot(testCase.lot)
    const plan = band === undefined ? undefined : resolvePlan('normal', testCase.aql, band.code)
    const got = plan === undefined ? '未命中' : `${plan.code}/n${String(plan.n)}/Ac${String(plan.ac)}/Re${String(plan.re)}`
    const want = `${testCase.expect.code}/n${String(testCase.expect.n)}/Ac${String(testCase.expect.ac)}/Re${String(testCase.expect.re)}`
    if (got !== want) {
      failures += 1
      console.log(`nocobase-w8: [selftest] ✗ 批量 ${String(testCase.lot)} × AQL ${testCase.aql} → ${got}（期望 ${want}）`)
    } else {
      console.log(`nocobase-w8: [selftest] ✓ 批量 ${String(testCase.lot)} × AQL ${testCase.aql} → ${got}`)
    }
  }
  const rows = buildAqlSeedRows()
  const byRigor = rows.reduce<Record<string, number>>((acc, row) => { acc[row.rigor] = (acc[row.rigor] ?? 0) + 1; return acc }, {})
  if (rows.length !== 135 || byRigor.normal !== 75 || byRigor.tightened !== 30 || byRigor.reduced !== 30) {
    failures += 1
    console.log(`nocobase-w8: [selftest] ✗ 种子分布 135/75/30/30 不符（实得 ${String(rows.length)}/${String(byRigor.normal ?? 0)}/${String(byRigor.tightened ?? 0)}/${String(byRigor.reduced ?? 0)}）`)
  } else {
    console.log('nocobase-w8: [selftest] ✓ 种子 135 行 = 15 段 × (normal 75 / tightened 30 / reduced 30)')
  }
  const spot = (band: string, aql: string, rigor: AqlRigor, code: string, n: number, ac: number, re: number): void => {
    const row = rows.find(item => item.lot_band === band && item.aql === aql && item.rigor === rigor)
    const got = row === undefined ? '缺行' : `${row.code}/n${String(row.n)}/Ac${String(row.ac)}/Re${String(row.re)}`
    const want = `${code}/n${String(n)}/Ac${String(ac)}/Re${String(re)}`
    if (got !== want) {
      failures += 1
      console.log(`nocobase-w8: [selftest] ✗ ${band} × ${aql} × ${rigor} → ${got}（期望 ${want}）`)
    } else {
      console.log(`nocobase-w8: [selftest] ✓ ${band} × ${aql} × ${rigor} = ${got}`)
    }
  }
  spot('281-500', '2.5', 'normal', 'H', 50, 3, 4)
  spot('151-280', '2.5', 'normal', 'G', 32, 2, 3)
  spot('1201-3200', '2.5', 'tightened', 'K', 125, 5, 6)
  spot('151-280', '2.5', 'tightened', 'G', 32, 1, 2)
  spot('501-1200', '1.0', 'reduced', 'J', 32, 1, 2)
  spot('500001+', '1.0', 'normal', 'Q', 1250, 21, 22)
  spot('2-8', '2.5', 'reduced', 'C', 2, 0, 1)
  if (failures > 0) throw new Error(`AQL selftest ${String(failures)} 例失败`)
  console.log('nocobase-w8: [selftest] 全部对拍 PASS')
}

/** One REST-backed NocoIO the approval-engine functions run over. */
const tokenIO = (token: string): NocoIO => ({
  list: async (collection, filter) => {
    const query = filter === undefined ? '' : `&filter=${encodeURIComponent(JSON.stringify(filter))}`
    return await dataOf(token, 'GET', `/api/${collection}:list?pageSize=500${query}`) ?? []
  },
  get: async (collection, id) => await dataOf(token, 'GET', `/api/${collection}:get?filterByTk=${id}`) ?? undefined,
  create: async (collection, values) => await dataOf(token, 'POST', `/api/${collection}:create`, values),
  update: async (collection, id, values) => {
    await dataOf(token, 'POST', `/api/${collection}:update?filterByTk=${id}`, values)
  },
  updateWhere: async (collection, filter, values) => {
    const rows = await dataOf(token, 'POST', `/api/${collection}:update?filter=${encodeURIComponent(JSON.stringify(filter))}&pageSize=10`, values)
    return Array.isArray(rows) ? rows.length : rows === null || rows === undefined ? 0 : 1
  },
  destroy: async (collection, id) => {
    await call(token, 'POST', `/api/${collection}:destroy?filterByTk=${id}`)
  },
})

async function rowsOf(token: string, collection: string, pageSize = 500): Promise<Array<Record<string, any>>> {
  return await dataOf(token, 'GET', `/api/${collection}:list?pageSize=${pageSize}`) ?? []
}

// ─── the five 质量管理 v2 pages (E1 table spine / F1 kanban spine, uid prefix w8qm) ───

type FieldKind = 'input' | 'select' | 'number' | 'm2o' | 'date' | 'boolean' | 'textarea'
type FieldSpec = { name: string, title: string, kind: FieldKind, options?: object[], required?: boolean }
type TablePageSpec = { kind: 'table', title: string, icon: string, collection: string, columns: ReadonlyArray<FieldSpec>, formFields?: ReadonlyArray<FieldSpec> }
type KanbanPageSpec = { kind: 'kanban', title: string, icon: string, collection: string, groupField: string, groupOptions: object[], cardFields: ReadonlyArray<FieldSpec>, formFields: ReadonlyArray<FieldSpec> }

const PAGES: ReadonlyArray<TablePageSpec | KanbanPageSpec> = [
  {
    kind: 'table', title: '质检单', icon: 'SafetyCertificateOutlined', collection: 'qm_inspections',
    columns: [
      { name: 'code', title: '质检单号', kind: 'input' },
      { name: 'insp_type', title: '检验类型', kind: 'select', options: INSP_TYPE },
      { name: 'ref_type', title: '来源类型', kind: 'select', options: REF_TYPE },
      { name: 'ref_no', title: '来源单号', kind: 'input' },
      { name: 'product', title: '物料', kind: 'm2o' },
      { name: 'supplier', title: '供应商', kind: 'm2o' },
      { name: 'lot_qty', title: '批量', kind: 'number' },
      { name: 'sample_qty', title: '样本量', kind: 'number' },
      { name: 'aql_target', title: 'AQL档', kind: 'input' },
      { name: 'aql_n', title: 'n', kind: 'number' },
      { name: 'aql_ac', title: 'Ac', kind: 'number' },
      { name: 'aql_re', title: 'Re', kind: 'number' },
      { name: 'rigor', title: '判定严格度', kind: 'select', options: AQL_RIGOR },
      { name: 'result', title: '判定结果', kind: 'select', options: INSP_RESULT },
      { name: 'inspector', title: '检验员', kind: 'input' },
      { name: 'inspected_at', title: '检验日期', kind: 'date' },
    ],
    formFields: [
      { name: 'code', title: '质检单号', kind: 'input', required: true },
      { name: 'insp_type', title: '检验类型', kind: 'select', options: INSP_TYPE, required: true },
      { name: 'ref_type', title: '来源类型', kind: 'select', options: REF_TYPE },
      { name: 'ref_no', title: '来源单号', kind: 'input' },
      { name: 'product', title: '物料', kind: 'm2o' },
      { name: 'supplier', title: '供应商', kind: 'm2o' },
      { name: 'lot_no', title: '批次号', kind: 'input' },
      { name: 'lot_qty', title: '批量', kind: 'number' },
      { name: 'inspector', title: '检验员', kind: 'input' },
      { name: 'note', title: '备注', kind: 'textarea' },
    ],
  },
  {
    kind: 'table', title: '检验读数', icon: 'ExperimentOutlined', collection: 'qm_inspection_readings',
    columns: [
      { name: 'inspection', title: '质检单', kind: 'm2o' },
      { name: 'parameter', title: '检验参数', kind: 'input' },
      { name: 'spec_min', title: '规格下限', kind: 'number' },
      { name: 'spec_max', title: '规格上限', kind: 'number' },
      { name: 'criteria', title: '判据(非数值)', kind: 'input' },
      { name: 'actual', title: '实测值', kind: 'number' },
      { name: 'pass', title: '合格', kind: 'boolean' },
    ],
    formFields: [
      { name: 'inspection', title: '质检单', kind: 'm2o', required: true },
      { name: 'parameter', title: '检验参数', kind: 'input', required: true },
      { name: 'spec_min', title: '规格下限', kind: 'number' },
      { name: 'spec_max', title: '规格上限', kind: 'number' },
      { name: 'criteria', title: '判据(非数值)', kind: 'textarea' },
      { name: 'actual', title: '实测值', kind: 'number' },
      { name: 'pass', title: '合格', kind: 'boolean' },
    ],
  },
  {
    kind: 'kanban', title: '处置看板', icon: 'AlertOutlined', collection: 'qm_nc_dispositions',
    groupField: 'action', groupOptions: NC_ACTION,
    cardFields: [
      { name: 'code', title: '处置单号', kind: 'input' },
      { name: 'inspection', title: '质检单', kind: 'm2o' },
      { name: 'doc_status', title: '审批状态', kind: 'select', options: NC_DOC_STATUS },
      { name: 'status', title: '闭环状态', kind: 'select', options: NC_STATUS },
      { name: 'approver', title: '审批人', kind: 'input' },
      { name: 'scrap_cost', title: '报废成本', kind: 'number' },
    ],
    formFields: [
      { name: 'code', title: '处置单号', kind: 'input', required: true },
      { name: 'inspection', title: '质检单', kind: 'm2o', required: true },
      { name: 'action', title: '处置路径', kind: 'select', options: NC_ACTION, required: true },
      { name: 'reason', title: '处置原因', kind: 'textarea' },
      { name: 'approver', title: '审批人', kind: 'input' },
      { name: 'deviation_note', title: '让步偏差说明', kind: 'textarea' },
      { name: 'doc_status', title: '审批状态', kind: 'select', options: NC_DOC_STATUS },
      { name: 'status', title: '闭环状态', kind: 'select', options: NC_STATUS },
    ],
  },
  {
    kind: 'table', title: 'AQL抽样方案', icon: 'TableOutlined', collection: 'qm_aql_plans',
    columns: [
      { name: 'lot_band', title: '批量段', kind: 'input' },
      { name: 'level', title: '检验水平', kind: 'input' },
      { name: 'rigor', title: '严格度', kind: 'select', options: AQL_RIGOR },
      { name: 'code', title: '样本字码', kind: 'input' },
      { name: 'n', title: '样本量', kind: 'number' },
      { name: 'severity', title: '缺陷级', kind: 'select', options: AQL_SEVERITY },
      { name: 'aql', title: 'AQL', kind: 'input' },
      { name: 'ac', title: 'Ac', kind: 'number' },
      { name: 're', title: 'Re', kind: 'number' },
    ],
    formFields: [
      { name: 'lot_band', title: '批量段', kind: 'input', required: true },
      { name: 'level', title: '检验水平', kind: 'input', required: true },
      { name: 'rigor', title: '严格度', kind: 'select', options: AQL_RIGOR },
      { name: 'code', title: '样本字码', kind: 'input', required: true },
      { name: 'n', title: '样本量', kind: 'number', required: true },
      { name: 'severity', title: '缺陷级', kind: 'select', options: AQL_SEVERITY },
      { name: 'aql', title: 'AQL', kind: 'input', required: true },
      { name: 'ac', title: 'Ac', kind: 'number', required: true },
      { name: 're', title: 'Re', kind: 'number', required: true },
    ],
  },
  {
    // Title distinct from h4's 绩效评分卡 page — same collection, this view
    // surfaces the B8 quarterly materialization columns.
    kind: 'table', title: '季度绩效物化', icon: 'RadarChartOutlined', collection: 'srm_score_cards',
    columns: [
      { name: 'supplier', title: '供应商', kind: 'm2o' },
      { name: 'period', title: '考核期', kind: 'input' },
      { name: 'score_quality', title: '质量40%', kind: 'number' },
      { name: 'score_delivery', title: '交期30%', kind: 'number' },
      { name: 'score_price', title: '价格20%', kind: 'number' },
      { name: 'score_service', title: '服务10%', kind: 'number' },
      { name: 'score_compliance', title: '合规(参考)', kind: 'number' },
      { name: 'total_score', title: '加权总分', kind: 'number' },
      { name: 'rating', title: '评级', kind: 'select', options: opts([['A', 'A级', 'green'], ['B', 'B级', 'blue'], ['C', 'C级', 'orange'], ['D', 'D级', 'red']]) },
      { name: 'rating_change', title: '评级变化', kind: 'select', options: opts([['up', '上升', 'green'], ['flat', '持平', 'blue'], ['down', '下降', 'red']]) },
    ],
    formFields: [
      { name: 'supplier', title: '供应商', kind: 'm2o', required: true },
      { name: 'period', title: '考核期(YYYYQn)', kind: 'input', required: true },
      { name: 'score_quality', title: '质量40%', kind: 'number' },
      { name: 'score_delivery', title: '交期30%', kind: 'number' },
      { name: 'score_price', title: '价格20%', kind: 'number' },
      { name: 'score_service', title: '服务10%', kind: 'number' },
      { name: 'total_score', title: '加权总分', kind: 'number' },
      { name: 'rating', title: '评级', kind: 'select', options: opts([['A', 'A级', 'green'], ['B', 'B级', 'blue'], ['C', 'C级', 'orange'], ['D', 'D级', 'red']]) },
    ],
  },
]

const MENU_GROUP = { title: '质量管理', icon: 'SafetyCertificateOutlined' }

const listModels = (token: string): Promise<FlowModelRow[]> => listFlowModels(token, 'W8')
const listAllRoutes = (token: string): Promise<RouteRow[]> => listRoutes(token, 'W8')

const displayModelFor = (kind: FieldKind): string => {
  switch (kind) {
    case 'select': return 'DisplayEnumFieldModel'
    case 'number': return 'DisplayNumberFieldModel'
    case 'm2o': return 'DisplayTextFieldModel'
    case 'date': return 'DisplayDateTimeFieldModel'
    case 'boolean': return 'DisplayCheckboxFieldModel'
    default: return 'DisplayTextFieldModel'
  }
}

const editModelFor = (kind: FieldKind): string => {
  switch (kind) {
    case 'select': return 'SelectFieldModel'
    case 'number': return 'NumberFieldModel'
    case 'm2o': return 'RecordSelectFieldModel'
    case 'date': return 'DateOnlyFieldModel'
    // No TextArea edit model exists in the client registry (verified live:
    // "Model class 'TextAreaFieldModel' not found"); the field's own
    // uiSchema (Input.TextArea) shapes the multiline rendering.
    case 'boolean': return 'CheckboxFieldModel'
    default: return 'InputFieldModel'
  }
}

function formGrid(collection: string, fields: ReadonlyArray<FieldSpec>): Record<string, unknown> {
  const itemUids = fields.map(() => withN17Prefix('w8qm', 'i'))
  const rows = itemUids.map((itemUid, index) => ({
    id: `r${index}`,
    cells: [{ id: `r${index}:cell:0`, items: [itemUid] }],
    sizes: [24],
  }))
  return {
    use: 'FormGridModel', subKey: 'grid', subType: 'object', sortIndex: 0,
    props: { layout: { version: 2, rows, rowGap: 0, colGap: 16, sizes: {}, rowOrder: rows.map(row => row.id) } },
    stepParams: { gridSettings: { grid: { layout: { version: 2, rows } } } },
    subModels: {
      items: fields.map((field, index) => ({
        uid: itemUids[index], use: 'FormItemModel', subKey: 'items', subType: 'array', sortIndex: index + 1,
        props: field.required === true ? { required: true } : {},
        stepParams: { fieldSettings: { init: { dataSourceKey: 'main', collectionName: collection, fieldPath: field.name } } },
        subModels: {
          field: {
            use: editModelFor(field.kind), subKey: 'field', subType: 'object', sortIndex: 0,
            props: field.options === undefined || field.options.length === 0 ? {} : { allowClear: true, options: field.options },
          },
        },
      })),
    },
  }
}

function kanbanCard(collection: string, fields: ReadonlyArray<FieldSpec>): Record<string, unknown> {
  const itemUids = fields.map(() => withN17Prefix('w8qm', 'di'))
  const rows = itemUids.map((itemUid, index) => ({
    id: `r${index}`,
    cells: [{ id: `r${index}:cell:0`, items: [itemUid] }],
    sizes: [24],
  }))
  return {
    use: 'KanbanCardItemModel', subKey: 'item', subType: 'object', sortIndex: 1, props: {}, stepParams: {},
    subModels: {
      grid: {
        use: 'DetailsGridModel', subKey: 'grid', subType: 'object', sortIndex: 1,
        props: { layout: { version: 2, rows, rowGap: 0, colGap: 8, sizes: {}, rowOrder: rows.map(row => row.id) } },
        stepParams: { gridSettings: { grid: { layout: { version: 2, rows } } } },
        subModels: {
          items: fields.map((field, index) => ({
            uid: itemUids[index], use: 'DetailsItemModel', subKey: 'items', subType: 'array', sortIndex: index + 1, props: {},
            stepParams: {
              fieldSettings: { init: { dataSourceKey: 'main', collectionName: collection, fieldPath: field.name } },
              detailItemSettings: { showLabel: { showLabel: true } },
            },
            subModels: {
              field: {
                use: displayModelFor(field.kind), subKey: 'field', subType: 'object', sortIndex: 1,
                props: field.options === undefined ? {} : { options: field.options },
                stepParams: {
                  fieldSettings: { init: { dataSourceKey: 'main', collectionName: collection, fieldPath: field.name } },
                  popupSettings: { openView: { collectionName: collection, dataSourceKey: 'main' } },
                },
              },
            },
          })),
        },
      },
    },
  }
}

async function ensureMenuGroup(token: string): Promise<{ id: number }> {
  const existing = (await listAllRoutes(token)).find(row => row.title === MENU_GROUP.title && row.type === 'group')
  if (existing !== undefined) {
    console.log(`nocobase-w8: menu group "${MENU_GROUP.title}" exists (kept)`)
    return { id: existing.id }
  }
  const row = await dataOf(token, 'POST', '/api/desktopRoutes:create', { title: MENU_GROUP.title, icon: MENU_GROUP.icon, type: 'group' })
  console.log(`nocobase-w8: menu group "${MENU_GROUP.title}" created`)
  return { id: Number(row.id) }
}

async function pageHasBlock(token: string, pageTitle: string, collection: string, mainUse: string): Promise<boolean> {
  const models = await listModels(token)
  return models.some(row => row.use === mainUse
    && String(row.stepParams?.resourceSettings?.init?.collectionName ?? '') === collection
    && String(row.uid ?? '').startsWith('w8qm'))
}

async function ensureV2Page(token: string, spec: TablePageSpec | KanbanPageSpec, groupId: number, sort: number): Promise<void> {
  const mainUse = spec.kind === 'kanban' ? 'KanbanBlockModel' : 'TableBlockModel'
  const flow = (await listAllRoutes(token)).find(row => row.title === spec.title && row.type === 'flowPage')
  if (flow !== undefined) {
    if (!(await pageHasBlock(token, spec.title, spec.collection, mainUse))) {
      throw new Error(`v2 page "${spec.title}" is truncated (missing its ${mainUse}); run --rollback to tear the batch down and rebuild`)
    }
    console.log(`nocobase-w8: v2 page "${spec.title}" exists (kept)`)
    return
  }
  if ((await listAllRoutes(token)).some(row => row.title === spec.title && row.type === 'page')) {
    throw new Error(`a v1 page named "${spec.title}" already exists; rename it first (this batch only owns flowPages)`)
  }
  const routeUid = withN17Prefix('w8qm', '')
  const page = await dataOf(token, 'POST', '/api/desktopRoutes:create', { title: spec.title, icon: spec.icon, type: 'flowPage', parentId: groupId, sort, schemaUid: routeUid })
  const tabUid = withN17Prefix('w8qm', 't')
  await dataOf(token, 'POST', '/api/desktopRoutes:create', { title: '', type: 'tabs', parentId: page.id, schemaUid: tabUid, tabSchemaName: withN17Prefix('w8qm', 'ts') })

  const save = (model: Record<string, unknown>) => dataOf(token, 'POST', '/api/flowModels:save', model)
  await save({ uid: routeUid, schema: { use: 'RouteModel' } })
  await save({ uid: tabUid, schema: { use: 'RouteModel' } })
  const pageUid = withN17Prefix('w8qm', 'p')
  await save({ uid: pageUid, parentId: routeUid, subKey: 'page', subType: 'object', use: 'RootPageModel', props: { title: spec.title, displayTitle: true, enableTabs: false }, stepParams: { pageSettings: { general: { title: spec.title, displayTitle: true, enableTabs: false } } } })
  const gridUid = withN17Prefix('w8qm', 'g')
  await save({ uid: gridUid, parentId: tabUid, subKey: 'grid', subType: 'object', use: 'BlockGridModel', props: {}, filterManager: [] })

  const mainUid = spec.kind === 'kanban' ? withN17Prefix('w8qm', 'kb') : withN17Prefix('w8qm', 'tb')
  const mainProps = spec.kind === 'kanban'
    ? { groupField: spec.groupField, groupOptions: spec.groupOptions, styleVariant: 'color', quickCreateEnabled: false, dragEnabled: true }
    : {}
  await save({
    uid: mainUid, use: mainUse, parentId: gridUid, subKey: 'items', subType: 'array', sortIndex: 1, props: mainProps,
    stepParams: { resourceSettings: { init: { dataSourceKey: 'main', collectionName: spec.collection } } },
  })

  if (spec.kind === 'table') {
    let sortIndex = 1
    for (const column of spec.columns) {
      const uid = withN17Prefix('w8qm', 'c')
      const model = displayModelFor(column.kind)
      await save({
        uid, use: 'TableColumnModel', parentId: mainUid, subKey: 'columns', subType: 'array', sortIndex,
        stepParams: {
          fieldSettings: { init: { dataSourceKey: 'main', collectionName: spec.collection, fieldPath: column.name } },
          tableColumnSettings: { model: { use: model } },
        },
        props: { title: column.title, dataIndex: column.name, width: 150, editable: false, sorter: false, fixed: 'none', ...(column.options === undefined || column.options.length === 0 ? {} : { options: column.options }) },
      })
      await save({
        uid: `${uid}f`, use: model, parentId: uid, subKey: 'field', subType: 'object', sortIndex: 0,
        stepParams: { popupSettings: { openView: { collectionName: spec.collection, dataSourceKey: 'main' } } },
        props: { displayStyle: 'text', overflowMode: 'ellipsis', clickToOpen: false, displayCopyButton: false, ...(column.options === undefined || column.options.length === 0 ? {} : { options: column.options }) },
      })
      sortIndex += 1
    }
  }

  const formFields = spec.formFields
  await save({
    uid: withN17Prefix('w8qm', 'fa'), parentId: mainUid, subKey: 'actions', subType: 'array', sortIndex: 1,
    use: 'FilterActionModel', props: {},
    stepParams: { buttonSettings: { general: { title: '{{t("Filter")}}' } } },
  })
  if (formFields !== undefined) {
    await save({
      uid: withN17Prefix('w8qm', 'an'), parentId: mainUid, subKey: 'actions', subType: 'array', sortIndex: 2,
      use: 'AddNewActionModel', props: {},
      stepParams: { popupSettings: { openView: { collectionName: spec.collection, dataSourceKey: 'main' } } },
      subModels: {
        page: {
          use: 'ChildPageModel', subKey: 'page', subType: 'object', sortIndex: 0, props: {},
          stepParams: { pageSettings: { general: { displayTitle: false, enableTabs: true } } },
          subModels: {
            tabs: [{
              use: 'ChildPageTabModel', subKey: 'tabs', subType: 'array', sortIndex: 0, props: {},
              stepParams: { pageTabSettings: { tab: { title: '{{t("Add new")}}' } } },
              subModels: {
                grid: {
                  use: 'BlockGridModel', subKey: 'grid', subType: 'object', sortIndex: 0, props: {},
                  subModels: {
                    items: [{
                      use: 'CreateFormModel', subKey: 'items', subType: 'array', sortIndex: 1, props: {},
                      stepParams: { resourceSettings: { init: { dataSourceKey: 'main', collectionName: spec.collection } } },
                      subModels: { grid: formGrid(spec.collection, formFields) },
                    }],
                  },
                },
              },
            }],
          },
        },
      },
    })
  }
  await save({
    uid: withN17Prefix('w8qm', 'rf'), parentId: mainUid, subKey: 'actions', subType: 'array', sortIndex: 3,
    use: 'RefreshActionModel', props: { title: '', icon: 'ReloadOutlined' },
    stepParams: { buttonSettings: { general: { title: '', icon: 'ReloadOutlined' } } },
  })

  if (spec.kind === 'kanban') {
    const openView = { mode: 'drawer', size: 'medium', pageModelClass: 'ChildPageModel', collectionName: spec.collection, dataSourceKey: 'main' }
    const cardViewUid = withN17Prefix('w8qm', 'cva')
    await save({
      uid: cardViewUid, parentId: mainUid, subKey: 'cardViewAction', subType: 'object', sortIndex: 1,
      use: 'KanbanCardViewActionModel', props: {}, stepParams: { popupSettings: { openView } },
    })
    // W3-B1: kanban card drawers need the persisted page subtree too (the
    // load-only contract — the 处置看板 card drawer was a P0 ③-class hole).
    await dataOf(token, 'POST', '/api/flowModels:save', drawerPageTreeFor(cardViewUid, {
      collection: spec.collection,
      fields: spec.cardFields.map(field => ({ fieldPath: field.name, modelUse: displayModelFor(field.kind), ...(field.options === undefined ? {} : { options: field.options }) })),
      tabTitle: '详情',
    }))
    await save({
      uid: withN17Prefix('w8qm', 'qca'), parentId: mainUid, subKey: 'quickCreateAction', subType: 'object', sortIndex: 1,
      use: 'KanbanQuickCreateActionModel', props: {}, stepParams: { popupSettings: { openView } },
    })
    await save({ uid: withN17Prefix('w8qm', 'ci'), parentId: mainUid, ...kanbanCard(spec.collection, spec.cardFields) })
  } else {
    // W3-B1: row-detail triple on every fresh table (P0 root cause ① fix).
    await ensureTableRowDetail(token, mainUid, {
      collection: spec.collection,
      fields: spec.columns.map(column => ({ fieldPath: column.name, modelUse: displayModelFor(column.kind), ...(column.options === undefined ? {} : { options: column.options }) })),
      tabTitle: '详情',
      actionsColumnSortIndex: spec.columns.length + 1,
    })
  }
  console.log(`nocobase-w8: v2 page "${spec.title}" created (/admin/${routeUid})`)
}

/**
 * W2-B1: kept v2 pages predate the rigor column — append it to the live
 * table (idempotent by dataIndex) so the 135-row table and the verdict rows
 * read their rigor band in the UI without a page rebuild.
 */
async function appendColumnIfMissing(token: string, collection: string, field: FieldSpec): Promise<void> {
  const models = await listModels(token)
  const main = models.find(row => row.use === 'TableBlockModel'
    && String(row.uid ?? '').startsWith('w8qm')
    && String(row.stepParams?.resourceSettings?.init?.collectionName ?? '') === collection)
  if (main === undefined) return
  const mainUid = String(main.uid)
  const columns = models.filter(row => row.use === 'TableColumnModel'
    && String(row.parentId ?? '') === mainUid
    && String(row.uid ?? '').startsWith('w8qm'))
  if (columns.some(row => row.props?.dataIndex === field.name)) return
  const save = (model: Record<string, unknown>) => dataOf(token, 'POST', '/api/flowModels:save', model)
  const uid = withN17Prefix('w8qm', 'c')
  const model = displayModelFor(field.kind)
  await save({
    uid, use: 'TableColumnModel', parentId: mainUid, subKey: 'columns', subType: 'array', sortIndex: columns.length + 1,
    stepParams: {
      fieldSettings: { init: { dataSourceKey: 'main', collectionName: collection, fieldPath: field.name } },
      tableColumnSettings: { model: { use: model } },
    },
    props: { title: field.title, dataIndex: field.name, width: 120, editable: false, sorter: false, fixed: 'none', ...(field.options === undefined || field.options.length === 0 ? {} : { options: field.options }) },
  })
  await save({
    uid: `${uid}f`, use: model, parentId: uid, subKey: 'field', subType: 'object', sortIndex: 0,
    stepParams: { popupSettings: { openView: { collectionName: collection, dataSourceKey: 'main' } } },
    props: { displayStyle: 'text', overflowMode: 'ellipsis', clickToOpen: false, displayCopyButton: false, ...(field.options === undefined ? {} : { options: field.options }) },
  })
  console.log(`nocobase-w8: ${collection} 页追加「${field.title}」列（${field.name}）`)
}

async function ensureRigorColumns(token: string): Promise<void> {
  await appendColumnIfMissing(token, 'qm_aql_plans', { name: 'rigor', title: '严格度', kind: 'select', options: AQL_RIGOR })
  await appendColumnIfMissing(token, 'qm_inspections', { name: 'rigor', title: '判定严格度', kind: 'select', options: AQL_RIGOR })
}

// ─── the demo chain (09-b8 验收 checkbox 1:1; idempotent replay) ───

/** Run one sibling script's CLI as a child, failing loud on a non-zero exit. */
function runScript(script: string, args: readonly string[]): void {
  const result = spawnSync('node', ['--import', 'tsx/esm', join(here, script), ...args], { stdio: 'inherit' })
  if (result.status !== 0) throw new Error(`${script} ${args.join(' ')} failed (exit ${String(result.status)})`)
}

/** Expect one async body to refuse; fail loud when it resolves. */
async function expectRefusal(label: string, body: () => Promise<unknown>): Promise<string> {
  try {
    await body()
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.log(`nocobase-w8: [chain] 卡口负例 ✓ ${label} → ${message.slice(0, 110)}`)
    return message
  }
  throw new Error(`卡口负例未拦截：${label}（本应被拒绝却成功了）`)
}

/** Expect one child engine invocation to refuse; fail loud when it exits 0. */
function expectCliRefusal(label: string, script: string, args: readonly string[]): void {
  const result = spawnSync('node', ['--import', 'tsx/esm', join(here, script), ...args], { encoding: 'utf8' })
  const text = `${result.stdout ?? ''}${result.stderr ?? ''}`
  if (result.status === 0) throw new Error(`卡口负例未拦截：${label}（本应非零退出却成功了）`)
  const reason = text.trim().split('\n').filter(line => line.includes('Error') || line.includes('被拒') || line.includes('必填')).slice(-1)[0] ?? ''
  console.log(`nocobase-w8: [chain] 卡口负例 ✓ ${label} → ${reason.slice(0, 110)}`)
}

const PERIOD = '2026Q3'

async function demoChain(token: string): Promise<void> {
  const suppliers = await rowsOf(token, 'srm_suppliers')
  const supplier = suppliers.find(row => row.code === 'SUP-004')
  if (supplier === undefined) throw new Error('种子缺失：SUP-004 味之源（先跑 nocobase-h4-srm.mts）')
  const products = await rowsOf(token, 'hub_inv_products', 200)
  const product = products.find(row => row.sku === 'FD-SOY-500')
  if (product === undefined) throw new Error('种子缺失：FD-SOY-500（先跑 nocobase-h4-srm.mts）')

  console.log('nocobase-w8: [chain] ══ 质量域演示（PO→收货→挂点IQC→AQL判定→放行卡口→退货/让步处置→5批2拒加严→绩效物化→AVL四联查）══')

  // Replay guard: the tightened supplier marks a completed chain — verify the
  // terminal state and the ledger instead of re-walking the single-shot legs.
  const inspectionsBefore = await rowsOf(token, 'qm_inspections')
  const closedBefore = inspectionsBefore.filter(row => String(row.insp_type) === 'IQC' && Number(row.supplier_id) === Number(supplier.id) && String(row.status) === 'closed')
  if (String(supplier.iqc_level) === 'tightened' && closedBefore.length >= 6) {
    console.log(`nocobase-w8: [chain] 已跑过（SUP-004 tightened，${String(closedBefore.length)} 张已判定 IQC）——验证终态 + 对账`)
    const tightened = closedBefore.slice(-1)[0]
    // W2-B1: tightened 判定走真加严主表（151-280 ×2.5 加严 = G/32 Ac1/Re2，
    // 与 B8 降档近似的 Ac/Re 恰好一致——历史缓存列 32/1/2 不必迁移）。
    if (Number(tightened?.aql_ac ?? 0) > 1) throw new Error('终态断言失败：最后一张判定单未走加严数组（Ac≤1）')
    const scorecard = (await rowsOf(token, 'srm_score_cards')).find(row => Number(row.supplier_id) === Number(supplier.id) && String(row.period) === PERIOD)
    if (scorecard === undefined) throw new Error(`终态断言失败：${PERIOD} 评分卡行缺失（重跑 --calc-scorecard ${PERIOD}）`)
    runScript('nocobase-h5-wms.mts', ['--assert-ledger'])
    console.log('nocobase-w8: [chain] done (replay verified)')
    return
  }

  // S1: the PO this chain's receipts hang off (expected_date feeds OTD-S).
  // Column names ride pur_orders' real spine: code/amount/currency/need_date.
  const orders = await rowsOf(token, 'pur_orders')
  let po = orders.find(row => String(row.code) === 'PO-W8-QC-01')
  if (po === undefined) {
    const io = tokenIO(token)
    await io.create('pur_orders', {
      code: 'PO-W8-QC-01', supplier: { id: Number(supplier.id) }, supplier_id: Number(supplier.id),
      amount: 2_000, currency: 'CNY', doc_status: 'draft', receiving_status: 'none', invoice_status: 'no_invoice',
      need_date: new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10),
      expected_date: new Date(Date.now() + 2 * 86_400_000).toISOString().slice(0, 10),
      compare_note: 'B8 质量链演示主订单',
    })
    const created = (await rowsOf(token, 'pur_orders')).find(row => String(row.code) === 'PO-W8-QC-01')
    if (created === undefined) throw new Error('PO-W8-QC-01 创建失败')
    await submitForApproval(io, 'pur_orders', Number(created.id), '采购部')
    await act(io, 'pur_orders', Number(created.id), 'approve', 'admin', 'B8 质量链演示')
    po = created
    console.log('nocobase-w8: [chain] PO-W8-QC-01 approved（expected_date+2d 喂 OTD-S）')
  }

  // S2: six receipts — three clean lots, three rejected — each posting the
  // engine's IQC anchor (挂点建单), then judged through AQL.
  const legs: ReadonlyArray<{ suffix: string, lot: string, defects: string, expect: 'passed' | 'failed' }> = [
    { suffix: '01', lot: 'W8-QC-A', defects: '0,0,2', expect: 'passed' },
    { suffix: '02', lot: 'W8-QC-B', defects: '0,0,2', expect: 'passed' },
    { suffix: '03', lot: 'W8-QC-C', defects: '0,0,2', expect: 'passed' },
    { suffix: '04', lot: 'W8-QC-D', defects: '0,0,3', expect: 'failed' },
    { suffix: '05', lot: 'W8-QC-E', defects: '0,0,3', expect: 'failed' },
    { suffix: '06', lot: 'W8-QC-F', defects: '0,0,2', expect: 'failed' },
  ]
  const judgedCodes: Array<{ qi: string, receiptNo: string, lot: string, verdict: string, ac: number, re: number }> = []
  for (const leg of legs) {
    const receiptNo = `RCV-W8-QC-${leg.suffix}`
    const receipts = await rowsOf(token, 'wms_receipts')
    const existing = receipts.find(row => row.receipt_no === receiptNo)
    if (existing === undefined) {
      await dataOf(token, 'POST', '/api/wms_receipts:create', {
        receipt_no: receiptNo, receipt_type: 'purchase',
        supplier: { id: Number(supplier.id) }, source_no: 'PO-W8-QC-01', po_id: Number(po.id),
        product: { id: Number(product.id) }, lot_no: leg.lot, qty: 200,
        status: 'pending', iqc_status: 'pending', note: `B8 质量链收货（${leg.lot}，批量 200 → 字码 G）`,
      })
    }
    const posted = (await rowsOf(token, 'wms_receipts')).find(row => row.receipt_no === receiptNo)
    if (String(posted?.status) !== 'posted' && String(posted?.status) !== 'closed') {
      runScript('nocobase-h5-wms.mts', ['--post-receipt', receiptNo])
    }
    const anchored = (await rowsOf(token, 'qm_inspections')).find(row => String(row.ref_no) === receiptNo)
    if (anchored === undefined) throw new Error(`挂点建单失败：${receiptNo} 无 IQC 检验单（先跑 nocobase-w8-quality.mts 主流程建集合）`)
    if (String(anchored.result) !== 'pending') {
      judgedCodes.push({ qi: String(anchored.code), receiptNo, lot: leg.lot, verdict: String(anchored.result), ac: Number(anchored.aql_ac), re: Number(anchored.aql_re) })
      continue
    }
    if (leg.suffix === '01') {
      // S3: the release gate negative rides the first pending receipt.
      expectCliRefusal('IQC 未放行禁过账入库', 'nocobase-h5-wms.mts', ['--release-receipt', receiptNo])
    }
    runScript('nocobase-h5-wms.mts', ['--inspect', String(anchored.code), '--defects', leg.defects, '--inspector', '吴敏'])
    const judged = (await rowsOf(token, 'qm_inspections')).find(row => Number(row.id) === Number(anchored.id))
    const verdict = String(judged?.result)
    if (verdict !== leg.expect) throw new Error(`AQL 判定断言失败：${String(anchored.code)} ${verdict} ≠ ${leg.expect}`)
    judgedCodes.push({ qi: String(anchored.code), receiptNo, lot: leg.lot, verdict, ac: Number(judged?.aql_ac), re: Number(judged?.aql_re) })
    console.log(`nocobase-w8: [chain] ${receiptNo} → ${String(anchored.code)} ${verdict}（Ac${String(judged?.aql_ac)}/Re${String(judged?.aql_re)}）✓`)
  }

  // S4: the AQL array assertions (批量 200 → G/32；2.5 档 Ac2/Re3；d=2 接收,
  // d=3 拒收；第 5、6 批在 tightened 下查真加严主表 151-280×2.5 = 32/Ac1/
  // Re2 → d=2 也拒收——W2-B1 起 tightened 不再降档, 同格 Ac/Re 恰与 B8
  // 近似一致, 断言值不变).
  if (judgedCodes[0]?.verdict !== 'passed' || judgedCodes[0].ac !== 2 || judgedCodes[0].re !== 3) throw new Error('AQL 断言失败：第 1 批应为 passed G/2.5 Ac2/Re3')
  if (judgedCodes[3]?.verdict !== 'failed') throw new Error('AQL 断言失败：第 4 批 d=3 ≥ Re3 应 failed')
  if (judgedCodes[5]?.verdict !== 'failed' || judgedCodes[5].ac !== 1 || judgedCodes[5].re !== 2) throw new Error('加严断言失败：第 6 批应走真加严表 32/Ac1/Re2 且 d=2 ≥ Re2 → failed')
  console.log('nocobase-w8: [chain] AQL 判定数组断言 ✓（d=2→passed Ac2/Re3；d=3→failed；加严主表 Ac1/Re2）')

  // S5: the switch — 5 批 2 拒后 SUP-004 → tightened（psql 复核同一行）.
  const supplierAfter = (await rowsOf(token, 'srm_suppliers')).find(row => Number(row.id) === Number(supplier.id))
  if (String(supplierAfter?.iqc_level) !== 'tightened') throw new Error(`切换断言失败：SUP-004 iqc_level=${String(supplierAfter?.iqc_level)} ≠ tightened`)
  console.log(`nocobase-w8: [chain] 切换断言 ✓ SUP-004 → tightened（reject_streak=${String(supplierAfter?.reject_streak ?? 0)}）`)

  // S6: the first passed receipt releases (待检 → 合格区); the failed lots
  // walk the two headline dispositions.
  const passedReceipt = judgedCodes[0]?.receiptNo
  if (passedReceipt === undefined) throw new Error('链路缺首批 passed 收货')
  const passedRow = (await rowsOf(token, 'wms_receipts')).find(row => row.receipt_no === passedReceipt)
  if (String(passedRow?.status) !== 'closed') {
    runScript('nocobase-h5-wms.mts', ['--release-receipt', passedReceipt])
  }
  console.log('nocobase-w8: [chain] IQC 放行 ✓ 待检 → 合格区（hold→good）')

  // S7: 退货处置 — failed 单 → NC(return) → approve → RETURN_VENDOR 流水 +
  // 库存退回（三方勾稽：检验单 + 处置单 + doc_no=处置单号 的移动）.
  const returnLeg = judgedCodes[3]
  if (returnLeg === undefined) throw new Error('链路缺退货素材批')
  const returnInspectionId = Number((await rowsOf(token, 'qm_inspections')).find(ins => ins.code === returnLeg.qi)?.id)
  let returnNc = (await rowsOf(token, 'qm_nc_dispositions')).find(row => Number(row.inspection_id) === returnInspectionId && String(row.action) === 'return')
  if (returnNc === undefined) {
    runScript('nocobase-h5-wms.mts', ['--create-nc', returnLeg.qi, 'return', '--reason', '包装破损超允差，整批退回'])
    returnNc = (await rowsOf(token, 'qm_nc_dispositions')).find(row => String(row.action) === 'return' && String(row.status) === 'open')
  }
  if (returnNc !== undefined && String(returnNc.status) !== 'closed') {
    runScript('nocobase-h5-wms.mts', ['--dispose', String(returnNc.code)])
  }
  const returnNcCode = String((await rowsOf(token, 'qm_nc_dispositions')).find(row => String(row.action) === 'return')?.code ?? '')
  const returnMovements = (await rowsOf(token, 'wms_movements')).filter(row => row.move_type === 'RETURN_VENDOR' && String(row.doc_no) === returnNcCode)
  if (returnMovements.length === 0) throw new Error(`退货勾稽失败：无 RETURN_VENDOR 流水（doc_no=${returnNcCode}）`)
  console.log(`nocobase-w8: [chain] 退货处置 ✓ ${returnNcCode} → RETURN_VENDOR ×${String(returnMovements.length)}（三方勾稽绿）`)

  // S8: 让步处置 — 必审批留痕（缺 approver/deviation-note 拒）→ B1 留痕 →
  // 放行 + concession 标记.
  const concessionLeg = judgedCodes[4]
  if (concessionLeg === undefined) throw new Error('链路缺让步素材批')
  let concessionNc = (await rowsOf(token, 'qm_nc_dispositions')).find(row => String(row.action) === 'concession' && String(row.status) === 'open')
  if (concessionNc === undefined) {
    const concessionInspection = (await rowsOf(token, 'qm_inspections')).find(ins => ins.code === concessionLeg.qi)
    const existingClosed = (await rowsOf(token, 'qm_nc_dispositions')).find(row => String(row.action) === 'concession' && Number(row.inspection_id) === Number(concessionInspection?.id))
    if (existingClosed !== undefined) {
      concessionNc = undefined
    } else {
      runScript('nocobase-h5-wms.mts', ['--create-nc', concessionLeg.qi, 'concession', '--reason', '客户允差内的外观瑕疵，特采放行'])
      concessionNc = (await rowsOf(token, 'qm_nc_dispositions')).find(row => String(row.action) === 'concession' && String(row.status) === 'open')
    }
  }
  if (concessionNc !== undefined) {
    expectCliRefusal('让步缺审批要素拒', 'nocobase-h5-wms.mts', ['--dispose', String(concessionNc.code)])
    runScript('nocobase-h5-wms.mts', ['--dispose', String(concessionNc.code), '--approver', 'admin', '--deviation-note', 'D3 批外观瑕疵在客户允差内，质量部评估可特采'])
  }
  const concessionRecords = (await rowsOf(token, 'wfl_approval_records')).filter(row => row.doc_type === 'qm_nc_dispositions')
  if (concessionRecords.length === 0) throw new Error('让步审批留痕失败：wfl_approval_records 无 qm_nc_dispositions 行')
  const concessionLot = (await rowsOf(token, 'wms_lots')).find(row => row.lot_no === concessionLeg.lot)
  if (concessionLot?.concession_flag !== true) throw new Error(`让步标记失败：批次 ${concessionLeg.lot} concession_flag ≠ true`)
  console.log(`nocobase-w8: [chain] 让步处置 ✓ B1 留痕 ×${String(concessionRecords.length)}，批次 ${concessionLeg.lot} concession_flag=true，放行转合格`)

  // S9: CAPA — every failed verdict opened one idempotent CAPA draft tied by
  // inspection_code.
  const capas = (await rowsOf(token, 'srm_capas')).filter(row => String(row.inspection_code ?? '') !== '' && String(row.inspection_code).startsWith('QI-'))
  if (capas.length < 3) throw new Error(`CAPA 断言失败：failed 应建 ≥3 张关联草稿（实得 ${String(capas.length)}）`)
  console.log(`nocobase-w8: [chain] CAPA 联动 ✓ ×${String(capas.length)}（inspection_code 关联 failed 检验单）`)

  // S10: 季度绩效物化 — SUP-004 当季 3 passed / 6 failed 判定 → 质量 50 分，
  // 交期 100（收货全在 expected_date 内），价格 60（无行价中性），服务
  // 100−10×3 CAPA=70 → 0.4×50+0.3×100+0.2×60+0.1×70 = 69 → C 级.
  runScript('nocobase-h5-wms.mts', ['--calc-scorecard', PERIOD])
  const card = (await rowsOf(token, 'srm_score_cards')).find(row => Number(row.supplier_id) === Number(supplier.id) && String(row.period) === PERIOD)
  if (card === undefined) throw new Error(`绩效物化失败：SUP-004 ${PERIOD} 评分卡行缺失`)
  // 可复算断言：总分 = 四维加权（40/30/20/10），评级按 A≥90/B≥75/C≥60/D 分档
  // 重算——不写死数值（存量 CAPA 种子会计入服务维倒扣）。
  const expectedTotal = Number((Number(card.score_quality) * 0.4 + Number(card.score_delivery) * 0.3 + Number(card.score_price) * 0.2 + Number(card.score_service) * 0.1).toFixed(1))
  const expectedRating = expectedTotal >= 90 ? 'A' : expectedTotal >= 75 ? 'B' : expectedTotal >= 60 ? 'C' : 'D'
  if (Number(card.total_score) !== expectedTotal || String(card.rating) !== expectedRating) {
    throw new Error(`绩效断言失败：total=${String(card.total_score)} rating=${String(card.rating)}（复算 ${String(expectedTotal)}/${expectedRating}；四维 ${String(card.score_quality)}/${String(card.score_delivery)}/${String(card.score_price)}/${String(card.score_service)}）`)
  }
  console.log(`nocobase-w8: [chain] 绩效物化 ✓ SUP-004 ${String(card.total_score)}/${String(card.rating)}（四维 ${String(card.score_quality)}/${String(card.score_delivery)}/${String(card.score_price)}/${String(card.score_service)} 加权复算一致）`)

  // S11: 四联查回归 — 冻结/拉黑供应商 PO 创建被 AVL 卡口拒（w2 gate 复用）.
  const blacklisted = suppliers.find(row => row.is_blacklisted === true)
  if (blacklisted !== undefined) {
    await expectRefusal('冻结供应商 PO 被四联查拦截', async () => {
      await enforceGates(tokenIO(token), 'pur_orders', { supplier_id: Number(blacklisted.id) })
    })
  }

  // S12: 对账 — Σmovements == stock 仍绿（处置腿全走引擎）.
  runScript('nocobase-h5-wms.mts', ['--assert-ledger'])
  console.log('nocobase-w8: [chain] done — 三检挂点/AQL 判定/四路处置/加严切换/绩效物化/AVL 四联查 全通（对账绿）')
}

// ─── rollback ───

async function rollback(token: string): Promise<void> {
  // The five flowPages + their tabs children + the group (w6 teardown order).
  const routes = await listAllRoutes(token)
  const w8Pages = routes.filter(row => row.type === 'flowPage' && PAGES.some(spec => spec.title === row.title))
  for (const page of w8Pages) {
    for (const tab of routes.filter(row => row.type === 'tabs' && row.parentId === page.id)) {
      await call(token, 'POST', `/api/desktopRoutes:destroy?filterByTk=${tab.id}`)
    }
    await call(token, 'POST', `/api/desktopRoutes:destroy?filterByTk=${page.id}`)
    console.log(`nocobase-w8: v2 page "${String(page.title)}" destroyed`)
  }
  const group = routes.find(row => row.title === MENU_GROUP.title && row.type === 'group')
  if (group !== undefined) await call(token, 'POST', `/api/desktopRoutes:destroy?filterByTk=${group.id}`)
  // The flowModels trees this batch mounted (uid prefix w8qm, N17-scoped).
  for (const model of await listModels(token)) {
    if (String(model.uid ?? '').startsWith('w8qm')) {
      await call(token, 'POST', `/api/flowModels:destroy?filterByTk=${String(model.uid)}`)
    }
  }
  // The concession approval flow config (its audit rows stay — append-only).
  const io = tokenIO(token)
  for (const config of await io.list('wfl_flow_configs', { doc_type: 'qm_nc_dispositions' })) {
    await io.destroy('wfl_flow_configs', Number(config.id))
    console.log('nocobase-w8: qm_nc_dispositions flow config destroyed')
  }
  // The four collections (data goes with them).
  for (const collection of COLLECTIONS) {
    const existing = await dataOf(token, 'GET', `/api/collections/${collection.name}`)
    if (existing !== null) {
      await call(token, 'POST', `/api/collections/${collection.name}:destroy?cascade=true`)
      console.log(`nocobase-w8: collection ${collection.name} destroyed`)
    }
  }
  console.log('nocobase-w8: rollback done — pages/group/flowModels/flow config/collections removed (additive columns stay)')
}

// ─── main ───

async function main(): Promise<void> {
  const args = process.argv.slice(2)
  if (args.includes('--selftest')) {
    selftestAql()
    return
  }
  const token = await signInWithRetry()
  if (args.includes('--rollback')) {
    await rollback(token)
    console.log('nocobase-w8: done (rollback)')
    return
  }
  if (args.includes('--demo-chain')) {
    await demoChain(token)
    return
  }
  await ensureCollections(token)
  await ensureAdditiveColumns(token)
  await seedAqlPlans(token)
  await ensureRigorColumns(token)
  // The concession approval flow — 让步必审批留痕 rides the B1 six-state
  // engine (no amount routing: disposition rows carry no amount column).
  // First repair pass: an earlier seed kept the unrewritten `total <= …`
  // condition, which fails act() on the amount-less rows — strip it from the
  // stored transitions before the (idempotent) seed short-circuits.
  {
    const io = tokenIO(token)
    const flowRows = await io.list('wfl_flow_configs', { doc_type: 'qm_nc_dispositions' })
    const flowId = Number(flowRows[0]?.id)
    if (Number.isInteger(flowId) && flowId > 0) {
      for (const transition of await io.list('wfl_flow_transitions', { flow_id: flowId })) {
        if (String(transition.condition_expr ?? '').includes('total')) {
          await io.update('wfl_flow_transitions', Number(transition.id), { condition_expr: '' })
          console.log('nocobase-w8: qm_nc_dispositions transition condition stripped (amount-less doc type carries no amount routing)')
        }
      }
    }
  }
  await seedDocFlow(tokenIO(token), 'qm_nc_dispositions', '不合格让步处置审批')
  const group = await ensureMenuGroup(token)
  let sort = 1
  for (const spec of PAGES) {
    await ensureV2Page(token, spec, group.id, sort++)
  }
  console.log('nocobase-w8: done')
}

// Library imports must not run the CLI.
if (process.argv[1] !== undefined && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  await main()
}
