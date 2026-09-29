/**
 * H5: the WMS closed loop (plans/acceptance-fixes-2026-09-15-h/50-h5-wms.md),
 * widened by B4 (plans/2026-09-25-mfg-closure/05-b4-inventory.md) into the
 * single-entry inventory domain. Effects:
 *
 * 1. Twelve wms_* collections: zones/bins (three-level warehouse + the
 *    B4 virtual SH-ADJ 差异调整 / SH-TR 在途 zones), lots (four-date food
 *    model), stock (UNIQUE SKU×bin×lot×status with optimistic-lock version),
 *    movements (append-only ledger with the W2-B3 biz_date column),
 *    receipts/shipments/transfers/counts, plus the B4 pair wms_reservations
 *    (two-phase hard reservation — the single ATP fact source B6/B7 consume)
 *    and wms_reorder_suggestions (ROP scan output), and the W2-B3 monthly
 *    balances snapshot wms_monthly_balances (量/值双轨 replay cache).
 * 2. Thirteen v2 flowPages under the「仓储管理」menu group through the E1/F1
 *    factory channels (uid prefix h5wms): nine B0-era tables + the B4 trio
 *    预留管理 / 补货预警 / 盘点计划 + the W2-B3 月度收发存 ledger. The 库位图
 *    page's map block rides the A-route JSBlockModel authoring channel
 *    (probe verdict 2026-09-15: full GO — collection access must use the
 *    ctx.makeResource vocabulary).
 * 3. The 盘点差异调整审批 workflow, rebuilt by B4 with a request node: the
 *    approve branch now calls back the posting engine's --post-count-adjust
 *    HTTP endpoint before the update-done write, so the difference lands in
 *    stock + ledger through the engine only (workflow arithmetic cannot,
 *    PLAN §8 ⑪). ROP scheduling stays a CLI/HTTP verb on the engine serve —
 *    the open-source snapshot ships no workflow-schedule plugin.
 * 4. The posting engine: --post-receipt/--post-shipment/--post-transfer
 *    (one- and two-step), --post-adjust, --post-count-adjust, the
 *    reservation trio --reserve/--release-reservation/--consume-reservation,
 *    --atp, --scan-reorder, --gen-count, --fefo — every quantity change
 *    rides version-checked optimistic locking, the append-only movement
 *    ledger, and (for transfers) the two-row ± pair that keeps the
 *    per-(product, lot) ledger balance at zero net.
 * 5. The bypass guard: the admin role's strategy-wide create/update/
 *    destroy on wms_stock and wms_movements is narrowed to an explicit
 *    read-only rolesResources row (write lives with the root-token engine
 *    only), and --assert-ledger / the demo chain prove stock == Σmovements.
 *
 * Rollback: --rollback destroys every h5wms* flowModels tree (+ orphaned
 * n18ai- sweep), the twelve routes + the menu group, the workflows, the
 * added hub/wms columns, the guard rows, and the eleven collections — back
 * to the H4 end-state.
 *
 * Usage (repo root, tsx loader):
 *   node --import tsx/esm examples/kb-agent/scripts/nocobase-h5-wms.mts
 *   node --import tsx/esm examples/kb-agent/scripts/nocobase-h5-wms.mts --rollback
 *   node --import tsx/esm examples/kb-agent/scripts/nocobase-h5-wms.mts --fefo <sku> <qty>
 *   node --import tsx/esm examples/kb-agent/scripts/nocobase-h5-wms.mts --post-shipment <shipmentNo>
 *   node --import tsx/esm examples/kb-agent/scripts/nocobase-h5-wms.mts --post-receipt <receiptNo>
 *   node --import tsx/esm examples/kb-agent/scripts/nocobase-h5-wms.mts --post-transfer <transferNo> [out|in]
 *   node --import tsx/esm examples/kb-agent/scripts/nocobase-h5-wms.mts --reserve <code> <SO|MO|SHIPMENT> <refId> <sku> <qty>
 *   node --import tsx/esm examples/kb-agent/scripts/nocobase-h5-wms.mts --release-reservation <code>
 *   node --import tsx/esm examples/kb-agent/scripts/nocobase-h5-wms.mts --consume-reservation <code>
 *   node --import tsx/esm examples/kb-agent/scripts/nocobase-h5-wms.mts --atp <sku>
 *   node --import tsx/esm examples/kb-agent/scripts/nocobase-h5-wms.mts --scan-reorder
 *   node --import tsx/esm examples/kb-agent/scripts/nocobase-h5-wms.mts --post-adjust <sku> <lotNo> <binCode> <±qty>
 *   node --import tsx/esm examples/kb-agent/scripts/nocobase-h5-wms.mts --post-count-adjust <countNo>
 *   node --import tsx/esm examples/kb-agent/scripts/nocobase-h5-wms.mts --gen-count <binCode>
 *   node --import tsx/esm examples/kb-agent/scripts/nocobase-h5-wms.mts --demo-chain
 *   node --import tsx/esm examples/kb-agent/scripts/nocobase-h5-wms.mts --availability-check <moCode>
 *   node --import tsx/esm examples/kb-agent/scripts/nocobase-h5-wms.mts --post-issue <issueCode>
 *   node --import tsx/esm examples/kb-agent/scripts/nocobase-h5-wms.mts --post-return <returnCode>
 *   node --import tsx/esm examples/kb-agent/scripts/nocobase-h5-wms.mts --post-report <reportCode>
 *   node --import tsx/esm examples/kb-agent/scripts/nocobase-h5-wms.mts --post-completion <completionCode>
 *   node --import tsx/esm examples/kb-agent/scripts/nocobase-h5-wms.mts --release-completion <completionCode>
 *   node --import tsx/esm examples/kb-agent/scripts/nocobase-h5-wms.mts --inspect <QI单号> --defects <严重>,<主要>,<次要> [--aql 0.65|1.0|1.5|2.5|4.0] [--resubmission]
 *   node --import tsx/esm examples/kb-agent/scripts/nocobase-h5-wms.mts --iqc-resume <SUP编号>   (W2-B1: suspended → tightened)
 *   node --import tsx/esm examples/kb-agent/scripts/nocobase-h5-wms.mts --iqc-relax <SUP编号>   (W2-B1: normal → relaxed, 转移得分≥30)
 *   node --import tsx/esm examples/kb-agent/scripts/nocobase-h5-wms.mts --backfill-dates          (W2-B3: biz_date 存量回填 + 归零断言)
 *   node --import tsx/esm examples/kb-agent/scripts/nocobase-h5-wms.mts --snapshot-month <YYYY-MM|all>  (W2-B3: 月度收发存快照)
 *   node --import tsx/esm examples/kb-agent/scripts/nocobase-h5-wms.mts --recalc [YYYY-MM]        (W2-B3: 快照幂等重算 + 差分对账)
 *   node --import tsx/esm examples/kb-agent/scripts/nocobase-h5-wms.mts --assert-monthly          (W2-B3: 快照 vs 流水重放对账)
 *   node --import tsx/esm examples/kb-agent/scripts/nocobase-h5-wms.mts --selftest-b3             (W2-B3: 纯函数自检)
 *   node --import tsx/esm examples/kb-agent/scripts/nocobase-h5-wms.mts --selftest-b6             (W2-B6: 齐套策略/超领比例纯函数自检)
 */
import { spawnSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { call, dataOf, ensureTableRowDetail, listFlowModels, listRoutes, signInWithRetry, withN17Prefix } from './nocobase-flow-page-lib.mts'
import { LOT_BANDS } from './nocobase-w8-quality.mts'

type RouteRow = import('./nocobase-flow-page-lib.mts').RouteRow
type FlowModelRow = import('./nocobase-flow-page-lib.mts').FlowModelRow

// ─── field factories (the crm/hub wire shapes) ───

const input = (name: string, title: string): object => ({ name, type: 'string', interface: 'input', uiSchema: { type: 'string', 'x-component': 'Input', title } })
const select = (name: string, title: string, enumOptions: object[]): object => ({ name, type: 'string', interface: 'select', uiSchema: { type: 'string', 'x-component': 'Select', title, enum: enumOptions } })
const number = (name: string, title: string): object => ({ name, type: 'float', interface: 'number', uiSchema: { type: 'number', 'x-component': 'InputNumber', title } })
const integer = (name: string, title: string): object => ({ name, type: 'integer', interface: 'number', uiSchema: { type: 'number', 'x-component': 'InputNumber', title } })
const date = (name: string, title: string): object => ({ name, type: 'dateOnly', interface: 'date', uiSchema: { type: 'string', 'x-component': 'DatePicker', title, 'x-component-props': { dateFormat: 'YYYY-MM-DD' } } })
const textarea = (name: string, title: string): object => ({ name, type: 'text', interface: 'textarea', uiSchema: { type: 'string', 'x-component': 'Input.TextArea', title } })
const belongsTo = (name: string, title: string, target: string, foreignKey: string, labelField = 'name'): object => ({
  name, type: 'belongsTo', interface: 'm2o', target, foreignKey,
  uiSchema: { type: 'object', 'x-component': 'AssociationField', title, 'x-component-props': { multiple: false, fieldNames: { label: labelField, value: 'id' } } },
})

const opts = (pairs: ReadonlyArray<[string, string, string]>): object[] => pairs.map(([value, label, color]) => ({ value, label, color }))

// ─── option sets (R7 report §3.1/§3.3) ───

const TEMP_ZONE = opts([['ambient', '常温', 'default'], ['chilled', '冷藏', 'blue'], ['frozen', '冷冻', 'cyan']])
const BIN_STATUS = opts([['idle', '空闲', 'green'], ['occupied', '占用', 'blue'], ['disabled', '禁用', 'default'], ['frozen', '盘点冻结', 'red']])
const LOT_STATUS = opts([['qualified', '合格', 'green'], ['quarantined', '隔离', 'orange'], ['frozen', '冻结', 'red']])
const STOCK_STATUS = opts([['good', '良品', 'green'], ['hold', '待检', 'orange'], ['blocked', '冻结', 'red']])
const MOVE_TYPE = opts([
  ['RECEIPT', '收货', 'blue'], ['PUTAWAY', '上架', 'cyan'], ['PICK', '拣货', 'purple'],
  ['SHIP', '出库', 'green'], ['MOVE', '移库', 'default'], ['ADJUST', '调整', 'orange'], ['COUNT_ADJUST', '盘差调整', 'red'],
  // B6: the manufacturing-execution legs — issue to WIP, return from WIP, and
  // the finished-goods receipt that quarantines before OQC.
  ['ISSUE_WIP', '生产领料', 'geekblue'], ['RETURN_WIP', '退料回库', 'gold'], ['RECEIPT_MFG', '完工入库', 'lime'],
  // B7 appends SHIPMENT_SO additively (w7 never rewrites the whole enum);
  // this list stays the full rewrite source so a replay never erases it.
  ['SHIPMENT_SO', '销售发货', 'cyan'],
  // B8: the quality-disposition legs — return the rejected lot to the vendor,
  // and scrap to the Inventory-Loss counterpart (三方勾稽的独立流水类型).
  ['RETURN_VENDOR', '退供应商', 'volcano'], ['SCRAP', '报废', 'magenta'],
])
const RECEIPT_TYPE = opts([['purchase', '采购收货', 'blue'], ['production', '生产入库', 'green'], ['return', '销售退货', 'orange']])
/** B3: the IQC anchor column on wms_receipts (AQL depth lands in B8; pass/fail/concession suffice here). */
const IQC_STATUS = opts([
  ['not_required', '免检', 'default'], ['pending', '待检', 'orange'],
  ['passed', '放行', 'green'], ['failed', '不合格', 'red'], ['concession', '让步接收', 'purple'],
])
/** B3: PO-sourced receipts quarantine here before IQC release (the zone seed is idempotent). */
export const QUARANTINE_ZONE_CODE = 'SH-Q'
const SHIPMENT_TYPE = opts([['sales', '销售出库', 'blue'], ['picking', '生产领料', 'green'], ['other', '其他出库', 'default']])
const RECEIPT_STATUS = opts([
  ['draft', '草稿', 'default'], ['pending', '待执行', 'blue'], ['receiving', '执行中', 'cyan'],
  ['partial', '部分完成', 'orange'], ['completed', '完成', 'green'], ['posted', '已过账', 'green'], ['closed', '已关闭', 'default'],
])
const TRANSFER_STATUS = opts([
  ['draft', '草稿', 'default'], ['pending', '待执行', 'blue'], ['in_transit', '在途', 'cyan'],
  ['completed', '已完成', 'green'], ['cancelled', '已取消', 'red'],
])
const TRANSFER_MODE = opts([['one_step', '一步移库', 'green'], ['two_step', '两步移库(在途)', 'purple']])
const COUNT_STATUS = opts([
  ['planned', '计划', 'default'], ['frozen', '已冻结', 'red'], ['counting', '初盘中', 'blue'],
  ['difference', '差异确认', 'orange'], ['adjusting', '调整审批中', 'purple'], ['done', '已完成', 'green'],
])
const COUNT_TYPE = opts([['full', '全盘', 'blue'], ['cycle', '循环盘', 'green'], ['sample', '抽盘', 'default']])
/** B4: ABC classes the count plan rides (D8: A 每月 / B 每季 / C 每半年). */
const ABC_CLASS = opts([['A', 'A 类(月盘)', 'red'], ['B', 'B 类(季盘)', 'orange'], ['C', 'C 类(半年盘)', 'default']])
/** W2-B3: how a monthly-balance row was produced (full replay of the ledger). */
const SNAPSHOT_SOURCE = opts([['full_replay', '全量重放', 'blue'], ['incremental', '增量接续', 'cyan']])
/** B4: the reservation lifecycle (two-phase: reserved → consumed on issue / released on cancel). */
const RESERVATION_STATUS = opts([
  ['reserved', '预留中', 'blue'], ['consumed', '已消耗', 'green'], ['released', '已释放', 'default'],
])
/** B4: what a reservation hard-allocates stock for (B6 齐套 / B7 销售发货 both write here). */
const REF_TYPE = opts([['SO', '销售订单', 'blue'], ['MO', '生产工单', 'purple'], ['SHIPMENT', '发货单', 'cyan']])
/** B4: the reorder suggestion lifecycle (open → dismissed / converted to a PR). */
const SUGGESTION_STATUS = opts([['open', '待处理', 'orange'], ['confirmed', '已确认(线下)', 'blue'], ['dismissed', '已忽略', 'default'], ['converted', '已转请购', 'green']])

// ─── the collections (twelve: nine B0/B4 + the W2-B3 monthly balances) ───

const COLLECTIONS: ReadonlyArray<{ name: string, title: string, titleField?: string, fields: object[] }> = [
  {
    name: 'wms_zones', title: '仓库库区', titleField: 'name', fields: [
      belongsTo('warehouse', '所属仓库', 'hub_inv_warehouses', 'warehouse_id'),
      input('code', '库区编码'), input('name', '库区名称'),
      select('temp_zone', '温层', TEMP_ZONE), textarea('note', '备注'),
    ],
  },
  {
    name: 'wms_bins', title: '仓库库位', titleField: 'code', fields: [
      belongsTo('zone', '所属库区', 'wms_zones', 'zone_id'),
      input('code', '库位编码'), select('status', '库位状态', BIN_STATUS),
      integer('capacity', '容量'), input('sku_summary', '当前存货摘要'),
    ],
  },
  {
    name: 'wms_lots', title: '批次主数据', titleField: 'lot_no', fields: [
      belongsTo('product', '物料', 'hub_inv_products', 'product_id'),
      input('lot_no', '批号'),
      date('production_date', '生产日期'), date('expiry_date', '过期日'),
      date('removal_date', '应下架日'), date('alert_date', '预警日'),
      belongsTo('supplier', '供应商', 'srm_suppliers', 'supplier_id'),
      select('status', '批次状态', LOT_STATUS),
    ],
  },
  {
    name: 'wms_stock', title: '物料库存', fields: [
      belongsTo('product', '物料', 'hub_inv_products', 'product_id'),
      belongsTo('bin', '库位', 'wms_bins', 'bin_id', 'code'),
      belongsTo('lot', '批次', 'wms_lots', 'lot_id', 'lot_no'),
      select('status', '库存状态', STOCK_STATUS),
      number('qty_on_hand', '现有数量'), number('qty_allocated', '已分配'),
      number('qty_locked', '锁定数量'), number('qty_available', '可用数量'),
      integer('version', '乐观锁版本'),
    ],
  },
  {
    name: 'wms_movements', title: '库存流水', titleField: 'doc_no', fields: [
      select('move_type', '事务类型', MOVE_TYPE), input('doc_no', '单据号'),
      belongsTo('product', '物料', 'hub_inv_products', 'product_id'),
      belongsTo('lot', '批次', 'wms_lots', 'lot_id', 'lot_no'),
      belongsTo('from_bin', '源库位', 'wms_bins', 'from_bin_id', 'code'),
      belongsTo('to_bin', '目标库位', 'wms_bins', 'to_bin_id', 'code'),
      number('qty', '数量(±)'), input('note', '备注'),
      // W2-B3: the business date the ledger replays on (nullable Expand
      // phase; the posting helper fills it, --backfill-dates settles stock).
      date('biz_date', '业务日期'),
    ],
  },
  {
    name: 'wms_receipts', title: '入库单', titleField: 'receipt_no', fields: [
      input('receipt_no', '入库单号'), select('receipt_type', '类型', RECEIPT_TYPE),
      belongsTo('supplier', '供应商', 'srm_suppliers', 'supplier_id'),
      input('source_no', '来源单号'), select('status', '状态', RECEIPT_STATUS),
      belongsTo('product', '物料', 'hub_inv_products', 'product_id'),
      input('lot_no', '批次号'), number('qty', '数量'),
      belongsTo('target_zone', '目标库区', 'wms_zones', 'target_zone_id'),
      belongsTo('target_bin', '目标库位', 'wms_bins', 'target_bin_id', 'code'),
      textarea('note', '备注'),
    ],
  },
  {
    name: 'wms_shipments', title: '出库单', titleField: 'shipment_no', fields: [
      input('shipment_no', '出库单号'), select('shipment_type', '类型', SHIPMENT_TYPE),
      select('status', '状态', RECEIPT_STATUS),
      belongsTo('product', '物料', 'hub_inv_products', 'product_id'),
      belongsTo('lot', '推荐批次(FEFO)', 'wms_lots', 'lot_id', 'lot_no'),
      belongsTo('from_bin', '拣货库位', 'wms_bins', 'from_bin_id', 'code'),
      number('qty', '数量'), textarea('note', '备注'),
    ],
  },
  {
    name: 'wms_transfers', title: '移库单', titleField: 'transfer_no', fields: [
      input('transfer_no', '移库单号'), select('status', '状态', TRANSFER_STATUS),
      select('transfer_mode', '移库模式', TRANSFER_MODE),
      belongsTo('product', '物料', 'hub_inv_products', 'product_id'),
      belongsTo('lot', '批次', 'wms_lots', 'lot_id', 'lot_no'),
      belongsTo('from_bin', '源库位', 'wms_bins', 'from_bin_id', 'code'),
      belongsTo('to_bin', '目标库位', 'wms_bins', 'to_bin_id', 'code'),
      number('qty', '数量'), input('reason', '原因'),
    ],
  },
  {
    name: 'wms_counts', title: '盘点单', titleField: 'count_no', fields: [
      input('count_no', '盘点单号'), select('count_type', '盘点类型', COUNT_TYPE),
      select('status', '状态', COUNT_STATUS), select('abc_class', 'ABC 分类', ABC_CLASS),
      belongsTo('zone', '库区', 'wms_zones', 'zone_id'),
      belongsTo('bin', '库位', 'wms_bins', 'bin_id', 'code'),
      belongsTo('product', '物料', 'hub_inv_products', 'product_id'),
      belongsTo('lot', '批次', 'wms_lots', 'lot_id', 'lot_no'),
      number('snapshot_qty', '账面快照'), number('counted_qty', '实盘数'),
      number('difference', '差异'), textarea('note', '备注'),
      // W2-B3: the count's business date (the CNT-YYYYMMDD key parsing
      // demotes to a validator; the column wins on disagreement).
      date('biz_date', '盘点日期'),
    ],
  },
  {
    // W2-B3: the monthly opening/receipts/issues/balances snapshot — the
    // persisted replay cache of the append-only movements ledger (量/值
    // 双轨; val rides the current moving-average cost). Regenerable any
    // time via --recalc; never a second source of inventory truth.
    name: 'wms_monthly_balances', title: '月度收发存', titleField: 'period', fields: [
      belongsTo('product', '物料', 'hub_inv_products', 'product_id'),
      input('period', '月份(YYYY-MM)'),
      number('opening_qty', '期初数量'), number('in_qty', '本期收入'), number('out_qty', '本期发出'), number('bal_qty', '期末数量'),
      number('opening_val', '期初金额'), number('in_val', '收入金额'), number('out_val', '发出金额'), number('bal_val', '期末金额'),
      date('snapshot_date', '快照生成日'),
      select('source', '生成方式', SNAPSHOT_SOURCE),
      input('note', '备注'),
    ],
  },
  {
    // B4: the two-phase hard reservation — ref_type/ref_id name the consuming
    // document, lot/bin are filled at creation (the FEFO pick) so ATP
    // deductions always point at a concrete stock row; B6 齐套 and B7 发货
    // consume this table as the single fact source.
    name: 'wms_reservations', title: '库存预留', titleField: 'code', fields: [
      input('code', '预留单号'), select('ref_type', '关联类型', REF_TYPE), input('ref_id', '关联单号'),
      belongsTo('product', '物料', 'hub_inv_products', 'product_id'),
      belongsTo('bin', '预留库位', 'wms_bins', 'bin_id', 'code'),
      belongsTo('lot', '预留批次', 'wms_lots', 'lot_id', 'lot_no'),
      number('qty', '预留数量'), select('status', '状态', RESERVATION_STATUS), date('released_at', '释放日期'),
    ],
  },
  {
    // B4: the ROP scan output — one open row per product whose ATP fell to or
    // below its reorder_point; suggest_qty tops the pool back up to
    // reorder_point + lot_size rounded to whole lot_size multiples.
    name: 'wms_reorder_suggestions', title: '补货建议', titleField: 'id', fields: [
      belongsTo('product', '物料', 'hub_inv_products', 'product_id'),
      number('on_hand_atp', '可用量快照'), number('min', '再订货点'),
      number('suggest_qty', '建议补货量'), select('status', '状态', SUGGESTION_STATUS),
      date('suggested_at', '建议日期'), input('note', '说明'),
      // W5-B4/BP-07: the confirm→PR conversion's back-reference (mrp_suggestions' shape).
      input('converted_doc_code', '转单单号'), input('converted_by', '操作人'), date('converted_at', '转单日期'),
    ],
  },
]

const MENU_GROUP = { title: '仓储管理', icon: 'DatabaseOutlined' }
const WORKFLOW_COUNT = 'WMS盘点差异调整审批'
/** B4: the engine-side callback port the count workflow's request node hits (B1 --serve). */
export const ENGINE_CALLBACK_PORT = 13_110

// ─── seeds (business-key upserts) ───

const iso = (offsetDays: number): string => new Date(Date.now() + offsetDays * 86_400_000).toISOString().slice(0, 10)

/**
 * B4: the Inventory-Loss counterpart zone — every count difference and
 * manual adjust posts its opponent leg here (Odoo location-types model).
 * Stock rows never live on its bin; only the movement ledger points at it.
 */
export const LOSS_ZONE_CODE = 'SH-ADJ'
/** B4: the goods-in-transit zone two-step transfers park the mid-leg on (ERPNext GIT, D2a). */
export const TRANSIT_ZONE_CODE = 'SH-TR'
/** B6: the shop-floor WIP zone — issued materials park on its bin until consumed; returns pull back off it. */
export const WIP_ZONE_CODE = 'SH-WIP'
/** B4/B6: virtual zones carry one bin each and never seed the 12-bin grid loop. */
const VIRTUAL_ZONE_CODES: ReadonlySet<string> = new Set([LOSS_ZONE_CODE, TRANSIT_ZONE_CODE, WIP_ZONE_CODE])

/** Zone seeds: warehouse 1 上海中心仓 / 2 青岛港口仓 / 3 广州南沙冷库 × three temp zones each, plus the IQC 待检区 and the B4 virtual pair. */
const SEED_ZONES: ReadonlyArray<{ warehouse: string, code: string, name: string, temp: string }> = [
  { warehouse: '上海中心仓', code: 'SH-A', name: '上海·常温区', temp: 'ambient' },
  { warehouse: '上海中心仓', code: 'SH-C', name: '上海·冷藏区', temp: 'chilled' },
  { warehouse: '上海中心仓', code: 'SH-F', name: '上海·冷冻区', temp: 'frozen' },
  { warehouse: '广州南沙冷库', code: 'GZ-A', name: '南沙·常温区', temp: 'ambient' },
  { warehouse: '广州南沙冷库', code: 'GZ-C', name: '南沙·冷藏区', temp: 'chilled' },
  { warehouse: '广州南沙冷库', code: 'GZ-F', name: '南沙·冷冻区', temp: 'frozen' },
  { warehouse: '上海中心仓', code: QUARANTINE_ZONE_CODE, name: '上海·待检区（IQC）', temp: 'ambient' },
  { warehouse: '上海中心仓', code: LOSS_ZONE_CODE, name: '上海·差异调整（Inventory Loss）', temp: 'ambient' },
  { warehouse: '上海中心仓', code: TRANSIT_ZONE_CODE, name: '上海·在途（GIT）', temp: 'ambient' },
  { warehouse: '上海中心仓', code: WIP_ZONE_CODE, name: '上海·车间线边（WIP）', temp: 'ambient' },
]

/**
 * B4 ROP parameters seeded onto hub_inv_products (written only when the
 * columns are still blank so hand-tuned values win): abc_class drives the
 * count plan cadence, reorder_point triggers the scan, lot_size rounds the
 * suggested top-up (target = reorder_point + lot_size).
 */
const SEED_PRODUCT_POLICY: ReadonlyArray<{ sku: string, abc: string, reorderPoint: number, safetyStock: number, lotSize: number, leadTimeDays: number, avgDailyUse: number }> = [
  { sku: 'FD-SOY-500', abc: 'A', reorderPoint: 200, safetyStock: 60, lotSize: 300, leadTimeDays: 7, avgDailyUse: 24 },
  { sku: 'FD-BEV-1000', abc: 'A', reorderPoint: 120, safetyStock: 40, lotSize: 240, leadTimeDays: 5, avgDailyUse: 30 },
  { sku: 'FD-SNA-080', abc: 'B', reorderPoint: 150, safetyStock: 50, lotSize: 400, leadTimeDays: 10, avgDailyUse: 15 },
  { sku: 'FD-FRZ-450', abc: 'A', reorderPoint: 180, safetyStock: 60, lotSize: 360, leadTimeDays: 14, avgDailyUse: 12 },
  { sku: 'SKU-FZ-0001', abc: 'B', reorderPoint: 100, safetyStock: 30, lotSize: 200, leadTimeDays: 10, avgDailyUse: 8 },
  { sku: 'SKU-GZ-0003', abc: 'C', reorderPoint: 120, safetyStock: 40, lotSize: 300, leadTimeDays: 15, avgDailyUse: 6 },
]

/** 12 bins per zone; the status mix keeps every band visible on the map. */
const BIN_STATUS_MIX: ReadonlyArray<string> = [
  'occupied', 'occupied', 'occupied', 'occupied', 'occupied', 'occupied',
  'idle', 'idle', 'idle', 'idle', 'disabled', 'frozen',
]

/** Lot seeds: 12 rows over the food SKUs, expiry bands cover 正常/临期30天/20%档. */
const SEED_LOTS: ReadonlyArray<{ sku: string, lot: string, prod: number, expiry: number, removal: number, alert: number, supplier: string, status: string }> = [
  { sku: 'FD-SOY-500', lot: 'SOY-260612-01', prod: -95, expiry: 445, removal: 415, alert: 385, supplier: '味之源调味食品股份有限公司', status: 'qualified' },
  { sku: 'FD-SOY-500', lot: 'SOY-260301-02', prod: -168, expiry: 372, removal: 342, alert: 312, supplier: '味之源调味食品股份有限公司', status: 'qualified' },
  { sku: 'FD-BEV-1000', lot: 'BEV-260908-01', prod: -7, expiry: 38, removal: 28, alert: 18, supplier: '江南乳业集团股份有限公司', status: 'qualified' },
  { sku: 'FD-BEV-1000', lot: 'BEV-260825-02', prod: -21, expiry: 24, removal: 14, alert: 4, supplier: '江南乳业集团股份有限公司', status: 'qualified' },
  { sku: 'FD-SNA-080', lot: 'SNA-260520-01', prod: -118, expiry: 152, removal: 132, alert: 112, supplier: '漳州市蜜果休闲食品有限公司', status: 'qualified' },
  { sku: 'FD-SNA-080', lot: 'SNA-260206-02', prod: -221, expiry: 49, removal: 29, alert: 9, supplier: '漳州市蜜果休闲食品有限公司', status: 'qualified' },
  { sku: 'FD-FRZ-450', lot: 'FRZ-260414-01', prod: -154, expiry: 206, removal: 176, alert: 146, supplier: '珠海鲜丰水产科技有限公司', status: 'qualified' },
  { sku: 'FD-FRZ-450', lot: 'FRZ-260702-02', prod: -75, expiry: 285, removal: 255, alert: 225, supplier: '珠海鲜丰水产科技有限公司', status: 'qualified' },
  { sku: 'SKU-FZ-0001', lot: 'SHR-260610-01', prod: -97, expiry: 268, removal: 238, alert: 208, supplier: '珠海鲜丰水产科技有限公司', status: 'qualified' },
  { sku: 'SKU-LD-0007', lot: 'MILK-260914-01', prod: -1, expiry: 6, removal: 3, alert: 1, supplier: '江南乳业集团股份有限公司', status: 'quarantined' },
  { sku: 'SKU-DZ-0004', lot: 'MOON-260318-01', prod: -181, expiry: -1, removal: -31, alert: -61, supplier: '山东鲁丰食品配料有限公司', status: 'frozen' },
  { sku: 'SKU-GZ-0003', lot: 'VEG-260402-01', prod: -166, expiry: 104, removal: 84, alert: 64, supplier: '漳州市蜜果休闲食品有限公司', status: 'qualified' },
]

/** Stock seeds: 8 rows tying SKU×bin×lot with the four quantities + version 1. */
const SEED_STOCK: ReadonlyArray<{ sku: string, bin: string, lot: string, onHand: number, allocated: number, locked: number }> = [
  { sku: 'FD-SOY-500', bin: 'SH-A-01-01', lot: 'SOY-260612-01', onHand: 480, allocated: 60, locked: 0 },
  { sku: 'FD-SOY-500', bin: 'SH-A-01-02', lot: 'SOY-260301-02', onHand: 260, allocated: 0, locked: 40 },
  { sku: 'FD-BEV-1000', bin: 'SH-C-02-01', lot: 'BEV-260825-02', onHand: 150, allocated: 30, locked: 0 },
  { sku: 'FD-BEV-1000', bin: 'SH-C-02-02', lot: 'BEV-260908-01', onHand: 90, allocated: 0, locked: 0 },
  { sku: 'FD-SNA-080', bin: 'GZ-A-01-01', lot: 'SNA-260206-02', onHand: 320, allocated: 80, locked: 0 },
  { sku: 'FD-FRZ-450', bin: 'SH-F-02-01', lot: 'FRZ-260414-01', onHand: 210, allocated: 0, locked: 0 },
  { sku: 'SKU-FZ-0001', bin: 'GZ-F-02-01', lot: 'SHR-260610-01', onHand: 175, allocated: 25, locked: 10 },
  { sku: 'SKU-GZ-0003', bin: 'GZ-A-01-02', lot: 'VEG-260402-01', onHand: 460, allocated: 0, locked: 0 },
]

const SEED_MOVEMENTS: ReadonlyArray<{ type: string, doc: string, sku: string, lot: string, from: string, to: string, qty: number, note: string }> = [
  { type: 'RECEIPT', doc: 'RCV-20260901-001', sku: 'FD-SOY-500', lot: 'SOY-260612-01', from: '', to: 'SH-A-01-01', qty: 600, note: '采购收货' },
  { type: 'PUTAWAY', doc: 'RCV-20260901-001', sku: 'FD-SOY-500', lot: 'SOY-260612-01', from: '', to: 'SH-A-01-01', qty: 600, note: '上架至常温区' },
  { type: 'PICK', doc: 'SHP-20260905-001', sku: 'FD-SOY-500', lot: 'SOY-260612-01', from: 'SH-A-01-01', to: '', qty: -120, note: 'FEFO 拣货' },
  { type: 'SHIP', doc: 'SHP-20260905-001', sku: 'FD-SOY-500', lot: 'SOY-260612-01', from: 'SH-A-01-01', to: '', qty: -120, note: '销售出库过账' },
  { type: 'RECEIPT', doc: 'RCV-20260903-002', sku: 'FD-BEV-1000', lot: 'BEV-260825-02', from: '', to: 'SH-C-02-01', qty: 180, allocated: 0, locked: 0, note: '冷藏收货' } as any,
  { type: 'PUTAWAY', doc: 'RCV-20260903-002', sku: 'FD-BEV-1000', lot: 'BEV-260825-02', from: '', to: 'SH-C-02-01', qty: 180, note: '上架至冷藏区' },
  { type: 'PICK', doc: 'SHP-20260908-002', sku: 'FD-BEV-1000', lot: 'BEV-260825-02', from: 'SH-C-02-01', to: '', qty: -30, note: 'FEFO 拣货(最早应下架)' },
  { type: 'SHIP', doc: 'SHP-20260908-002', sku: 'FD-BEV-1000', lot: 'BEV-260825-02', from: 'SH-C-02-01', to: '', qty: -30, note: '销售出库过账' },
  { type: 'RECEIPT', doc: 'RCV-20260906-003', sku: 'FD-FRZ-450', lot: 'FRZ-260414-01', from: '', to: 'SH-F-02-01', qty: 240, note: '冷冻收货' },
  { type: 'PUTAWAY', doc: 'RCV-20260906-003', sku: 'FD-FRZ-450', lot: 'FRZ-260414-01', from: '', to: 'SH-F-02-01', qty: 240, note: '温层校验通过' },
  { type: 'MOVE', doc: 'TRF-20260907-001', sku: 'FD-FRZ-450', lot: 'FRZ-260414-01', from: 'SH-F-02-01', to: 'SH-F-02-02', qty: 30, note: '移库整理' },
  { type: 'RECEIPT', doc: 'RCV-20260902-004', sku: 'SKU-FZ-0001', lot: 'SHR-260610-01', from: '', to: 'GZ-F-02-01', qty: 200, note: '采购收货' },
  { type: 'PUTAWAY', doc: 'RCV-20260902-004', sku: 'SKU-FZ-0001', lot: 'SHR-260610-01', from: '', to: 'GZ-F-02-01', qty: 200, note: '上架至冷冻区' },
  { type: 'SHIP', doc: 'SHP-20260910-003', sku: 'SKU-FZ-0001', lot: 'SHR-260610-01', from: 'GZ-F-02-01', to: '', qty: -25, note: '销售出库过账' },
  { type: 'RECEIPT', doc: 'RCV-20260828-005', sku: 'FD-SNA-080', lot: 'SNA-260206-02', from: '', to: 'GZ-A-01-01', qty: 400, note: '采购收货' },
  { type: 'PUTAWAY', doc: 'RCV-20260828-005', sku: 'FD-SNA-080', lot: 'SNA-260206-02', from: '', to: 'GZ-A-01-01', qty: 400, note: '上架至常温区' },
  { type: 'ADJUST', doc: 'ADJ-20260904-001', sku: 'FD-SNA-080', lot: 'SNA-260206-02', from: '', to: 'GZ-A-01-01', qty: 0, note: '盘盈盘亏冲抵' },
  { type: 'RECEIPT', doc: 'RCV-20260909-006', sku: 'SKU-GZ-0003', lot: 'VEG-260402-01', from: '', to: 'GZ-A-01-02', qty: 500, note: '采购收货' },
  { type: 'PUTAWAY', doc: 'RCV-20260909-006', sku: 'SKU-GZ-0003', lot: 'VEG-260402-01', from: '', to: 'GZ-A-01-02', qty: 500, note: '上架至常温区' },
  { type: 'PICK', doc: 'SHP-20260911-004', sku: 'SKU-GZ-0003', lot: 'VEG-260402-01', from: 'GZ-A-01-02', to: '', qty: -40, note: '生产领料' },
  { type: 'SHIP', doc: 'SHP-20260911-004', sku: 'SKU-GZ-0003', lot: 'VEG-260402-01', from: 'GZ-A-01-02', to: '', qty: -40, note: '领料出库过账' },
  { type: 'RECEIPT', doc: 'RCV-20260912-007', sku: 'SKU-LD-0007', lot: 'MILK-260914-01', from: '', to: 'SH-C-02-03', qty: 60, note: '冷藏收货·待检' },
  { type: 'COUNT_ADJUST', doc: 'CNT-20260906-001', sku: 'SKU-DZ-0004', lot: 'MOON-260318-01', from: '', to: 'SH-A-02-01', qty: -12, note: '过期报废盘差' },
  { type: 'MOVE', doc: 'TRF-20260908-002', sku: 'FD-SOY-500', lot: 'SOY-260301-02', from: 'SH-A-01-03', to: 'SH-A-01-02', qty: 260, note: '合并同批次' },
  { type: 'RECEIPT', doc: 'RCV-20260830-008', sku: 'FD-SOY-500', lot: 'SOY-260301-02', from: '', to: 'SH-A-01-03', qty: 260, note: '采购收货' },
  { type: 'PUTAWAY', doc: 'RCV-20260830-008', sku: 'FD-SOY-500', lot: 'SOY-260301-02', from: '', to: 'SH-A-01-03', qty: 260, note: '上架至常温区' },
  { type: 'RECEIPT', doc: 'RCV-20260910-009', sku: 'FD-BEV-1000', lot: 'BEV-260908-01', from: '', to: 'SH-C-02-02', qty: 90, note: '冷藏收货' },
  { type: 'PUTAWAY', doc: 'RCV-20260910-009', sku: 'FD-BEV-1000', lot: 'BEV-260908-01', from: '', to: 'SH-C-02-02', qty: 90, note: '上架至冷藏区' },
  { type: 'RECEIPT', doc: 'RCV-20260913-010', sku: 'FD-FRZ-450', lot: 'FRZ-260702-02', from: '', to: 'SH-F-02-03', qty: 130, note: '冷冻收货·新批次' },
  { type: 'SHIP', doc: 'SHP-20260913-005', sku: 'FD-FRZ-450', lot: 'FRZ-260414-01', from: 'SH-F-02-01', to: '', qty: -30, note: 'FEFO 先到期先出' },
]

const SEED_RECEIPTS: ReadonlyArray<Record<string, unknown>> = [
  { receipt_no: 'RCV-20260914-011', receipt_type: 'purchase', supplier: '山东鲁丰食品配料有限公司', source_no: 'PO-2026-0912-88', status: 'pending', product: '古法酿造酱油 500ml（酿造型）', lot_no: 'SOY-260914-01', qty: 300, target_zone: '上海·常温区', note: 'AI 填充演示单' },
  { receipt_no: 'RCV-20260912-007', receipt_type: 'purchase', supplier: '江南乳业集团股份有限公司', source_no: 'PO-2026-0910-41', status: 'completed', product: 'NFC 鲜榨橙汁 1L', lot_no: 'MILK-260914-01', qty: 60, target_zone: '上海·冷藏区', note: '质检待检中' },
  { receipt_no: 'RCV-20260913-010', receipt_type: 'purchase', supplier: '漳州市蜜果休闲食品有限公司', source_no: 'PO-2026-0911-76', status: 'posted', product: '速冻荠菜猪肉水饺 450g', lot_no: 'FRZ-260702-02', qty: 130, target_zone: '上海·冷冻区', target_bin: 'SH-F-02-03', note: '已过账' },
  { receipt_no: 'RCV-20260906-003', receipt_type: 'purchase', supplier: '珠海鲜丰水产科技有限公司', source_no: 'PO-2026-0904-12', status: 'closed', product: '速冻荠菜猪肉水饺 450g', lot_no: 'FRZ-260414-01', qty: 240, target_zone: '上海·冷冻区', note: '历史单据' },
  { receipt_no: 'RCV-20260915-012', receipt_type: 'return', supplier: '绿源包装材料有限公司', source_no: 'RTN-2026-0914-03', status: 'draft', product: '海苔芝士米果 80g', lot_no: 'SNA-260910-01', qty: 24, target_zone: '南沙·常温区', note: '客户退货草稿' },
]

const SEED_SHIPMENTS: ReadonlyArray<Record<string, unknown>> = [
  { shipment_no: 'SHP-20260915-006', shipment_type: 'sales', status: 'pending', product: '古法酿造酱油 500ml（酿造型）', lot: 'SOY-260301-02', from_bin: 'SH-A-01-02', qty: 120, note: 'FEFO 推荐: 应下架日最早的 SOY-260301-02' },
  { shipment_no: 'SHP-20260913-005', shipment_type: 'sales', status: 'posted', product: '速冻荠菜猪肉水饺 450g', lot: 'FRZ-260414-01', from_bin: 'SH-F-02-01', qty: 30, note: '已过账：两批次取先到期' },
  { shipment_no: 'SHP-20260911-004', shipment_type: 'picking', status: 'closed', product: '膨化果蔬脆片混合装', lot: 'VEG-260402-01', from_bin: 'GZ-A-01-02', qty: 40, note: '生产领料' },
  { shipment_no: 'SHP-20260915-007', shipment_type: 'sales', status: 'draft', product: 'NFC 鲜榨橙汁 1L', lot: 'BEV-260825-02', from_bin: 'SH-C-02-01', qty: 60, note: '草稿待 FEFO 复核' },
]

const SEED_TRANSFERS: ReadonlyArray<Record<string, unknown>> = [
  { transfer_no: 'TRF-20260915-003', status: 'pending', product: '海苔芝士米果 80g', lot: 'SNA-260206-02', from_bin: 'GZ-A-01-01', to_bin: 'GZ-A-01-04', qty: 60, reason: '临期批次移至优先拣选位' },
  { transfer_no: 'TRF-20260907-001', status: 'completed', product: '速冻荠菜猪肉水饺 450g', lot: 'FRZ-260414-01', from_bin: 'SH-F-02-01', to_bin: 'SH-F-02-02', qty: 30, reason: '库内整理' },
]

const SEED_COUNTS: ReadonlyArray<Record<string, unknown>> = [
  { count_no: 'CNT-20260915-002', count_type: 'cycle', status: 'counting', zone: '上海·常温区', bin: 'SH-A-01-01', product: '古法酿造酱油 500ml（酿造型）', lot: 'SOY-260612-01', snapshot_qty: 480, counted_qty: null, note: '循环盘点进行中' },
  { count_no: 'CNT-20260915-003', count_type: 'sample', status: 'difference', zone: '广州南沙冷库', bin: 'GZ-F-02-01', product: '冷冻南美白虾仁 500g', lot: 'SHR-260610-01', snapshot_qty: 175, counted_qty: 172, difference: -3, note: '差异 -3 待审批调整' },
  { count_no: 'CNT-20260906-001', count_type: 'full', status: 'done', zone: '上海·常温区', bin: 'SH-A-02-01', product: '枧水月饼皮预拌粉 25kg', lot: 'MOON-260318-01', snapshot_qty: 12, counted_qty: 0, difference: -12, note: '过期报废已完成' },
]

// ─── id resolvers over business names ───

async function rowsOf(token: string, collection: string, pageSize = 500): Promise<Array<Record<string, any>>> {
  const payload = await call(token, 'GET', `/api/${collection}:list?pageSize=${pageSize}`)
  const rows = (payload?.data ?? null) as Array<Record<string, any>> | null
  if (rows === null) return []
  const total = payload?.meta?.total
  if (typeof total === 'number' ? total > rows.length : rows.length === pageSize) {
    throw new Error(`${collection}:list returned ${String(rows.length)} of ${String(total)} rows (pageSize=${String(pageSize)}); raise the page size or paginate`)
  }
  return rows
}

const warehouseIdBy = (rows: Array<Record<string, any>>, name: string): number | undefined =>
  rows.find(row => row.name === name)?.id
const productIdBy = (rows: Array<Record<string, any>>, skuOrName: string): number | undefined =>
  rows.find(row => row.sku === skuOrName || row.name === skuOrName)?.id
const supplierIdBy = (rows: Array<Record<string, any>>, name: string): number | undefined =>
  rows.find(row => row.name === name)?.id
const zoneIdBy = (rows: Array<Record<string, any>>, code: string): number | undefined =>
  rows.find(row => row.code === code)?.id
const binIdBy = (rows: Array<Record<string, any>>, code: string): number | undefined =>
  rows.find(row => row.code === code)?.id
const lotIdBy = (rows: Array<Record<string, any>>, lotNo: string): number | undefined =>
  rows.find(row => row.lot_no === lotNo)?.id

// ─── collection / seed steps ───

async function ensureCollections(token: string): Promise<void> {
  for (const collection of COLLECTIONS) {
    const existing = await dataOf(token, 'GET', `/api/collections/${collection.name}`)
    if (existing === null) {
      await dataOf(token, 'POST', '/api/collections:create', { name: collection.name, title: collection.title, fields: collection.fields })
      console.log(`nocobase-h5: collection ${collection.name} created`)
    } else {
      console.log(`nocobase-h5: collection ${collection.name} exists (kept)`)
    }
    if (collection.titleField !== undefined && existing?.titleField !== collection.titleField) {
      await call(token, 'POST', `/api/collections:update?filterByTk=${collection.name}`, { titleField: collection.titleField })
    }
  }
  // The movements ledger is append-only by contract; nothing here enforces it
  // server-side (open-source boundary), the posting engine is the single writer.
  // hub_inv_products never had a titleField; the stock/lot/doc m2o columns
  // render the product name only when it points at one.
  const productsMeta = await dataOf(token, 'GET', '/api/collections/hub_inv_products') as { titleField?: string } | null
  if (productsMeta !== null && productsMeta.titleField !== 'name') {
    await call(token, 'POST', '/api/collections:update?filterByTk=hub_inv_products', { titleField: 'name' })
    console.log('nocobase-h5: hub_inv_products titleField set to name (m2o label anchor)')
  }
}

async function seedWmsRows(token: string): Promise<void> {
  // Crash-leftover guard: an interrupted earlier run can leave rows that
  // carry only an id; sweep them before the business-key counts so the
  // kept/added arithmetic stays true.
  const ghostFilter = encodeURIComponent(JSON.stringify({ code: { $eq: null }, name: { $eq: null } }))
  const ghosts = await dataOf(token, 'GET', `/api/wms_zones:list?filter=${ghostFilter}&pageSize=50`) as Array<{ id: number }> | null
  for (const ghost of ghosts ?? []) {
    await call(token, 'POST', `/api/wms_zones:destroy?filterByTk=${ghost.id}`)
    console.log(`nocobase-h5: ghost zone row #${ghost.id} swept (crash leftover)`)
  }
  const warehouses = await rowsOf(token, 'hub_inv_warehouses')
  const products = await rowsOf(token, 'hub_inv_products', 200)
  const suppliers = await rowsOf(token, 'srm_suppliers')

  const zoneRows = await rowsOf(token, 'wms_zones')
  let zonesAdded = 0
  for (const zone of SEED_ZONES) {
    if (zoneRows.some(row => row.code === zone.code)) continue
    await dataOf(token, 'POST', '/api/wms_zones:create', {
      warehouse: { id: warehouseIdBy(warehouses, zone.warehouse) },
      code: zone.code, name: zone.name, temp_zone: zone.temp,
    })
    zonesAdded += 1
  }
  console.log(`nocobase-h5: seed wms_zones +${zonesAdded} (kept: ${zoneRows.length}/${SEED_ZONES.length})`)

  const zones = await rowsOf(token, 'wms_zones')
  const binRows = await rowsOf(token, 'wms_bins', 200)
  let binsAdded = 0
  for (const zone of SEED_ZONES) {
    if (VIRTUAL_ZONE_CODES.has(zone.code)) continue
    const zoneId = zoneIdBy(zones, zone.code)
    for (let aisle = 1; aisle <= 2; aisle++) {
      for (let pos = 1; pos <= 6; pos++) {
        const code = `${zone.code}-${String(aisle).padStart(2, '0')}-${String(pos).padStart(2, '0')}`
        if (binRows.some(row => row.code === code)) continue
        const mixIndex = (aisle - 1) * 6 + (pos - 1)
        await dataOf(token, 'POST', '/api/wms_bins:create', {
          zone: { id: zoneId }, code, status: BIN_STATUS_MIX[mixIndex], capacity: 1000, sku_summary: '',
        })
        binsAdded += 1
      }
    }
  }
  // The B4/B6 virtual zones carry exactly one bin each (差异对手 / 在途 / 车间线边).
  for (const [code, zoneCode, summary] of [
    [`${LOSS_ZONE_CODE}-01-01`, LOSS_ZONE_CODE, '差异调整对手库位（不落库存行）'],
    [`${TRANSIT_ZONE_CODE}-01-01`, TRANSIT_ZONE_CODE, '两步移库在途库位（中转）'],
    [`${WIP_ZONE_CODE}-01-01`, WIP_ZONE_CODE, '生产领料线边库位（WIP）'],
  ] as const) {
    if (binRows.some(row => row.code === code)) continue
    await dataOf(token, 'POST', '/api/wms_bins:create', {
      zone: { id: zoneIdBy(zones, zoneCode) }, code, status: 'idle', capacity: 1_000_000, sku_summary: summary,
    })
    binsAdded += 1
  }
  console.log(`nocobase-h5: seed wms_bins +${binsAdded} (kept: ${binRows.length}; target 75 total incl. 3 virtual)`)

  const bins = await rowsOf(token, 'wms_bins', 200)
  const lotRows = await rowsOf(token, 'wms_lots')
  let lotsAdded = 0
  for (const lot of SEED_LOTS) {
    if (lotRows.some(row => row.lot_no === lot.lot)) continue
    await dataOf(token, 'POST', '/api/wms_lots:create', {
      product: { id: productIdBy(products, lot.sku) },
      lot_no: lot.lot,
      production_date: iso(lot.prod), expiry_date: iso(lot.expiry),
      removal_date: iso(lot.removal), alert_date: iso(lot.alert),
      supplier: { id: supplierIdBy(suppliers, lot.supplier) },
      status: lot.status,
    })
    lotsAdded += 1
  }
  console.log(`nocobase-h5: seed wms_lots +${lotsAdded} (kept: ${lotRows.length}/${SEED_LOTS.length})`)

  const lots = await rowsOf(token, 'wms_lots')
  const stockRows = await rowsOf(token, 'wms_stock', 200)
  let stockAdded = 0
  for (const stock of SEED_STOCK) {
    const key = { productId: productIdBy(products, stock.sku), binId: binIdBy(bins, stock.bin), lotId: lotIdBy(lots, stock.lot) }
    if (key.productId === undefined || key.binId === undefined || key.lotId === undefined) {
      throw new Error(`stock seed resolution failed for ${stock.sku}×${stock.bin}×${stock.lot}`)
    }
    if (stockRows.some(row => row.product_id === key.productId && row.bin_id === key.binId && row.lot_id === key.lotId)) continue
    await dataOf(token, 'POST', '/api/wms_stock:create', {
      product: { id: key.productId }, bin: { id: key.binId }, lot: { id: key.lotId }, status: 'good',
      qty_on_hand: stock.onHand, qty_allocated: stock.allocated, qty_locked: stock.locked,
      qty_available: stock.onHand - stock.allocated - stock.locked, version: 1,
    })
    stockAdded += 1
  }
  console.log(`nocobase-h5: seed wms_stock +${stockAdded} (kept: ${stockRows.length}/${SEED_STOCK.length})`)

  // Occupied bins get a summary string for the map hover.
  for (const stock of SEED_STOCK) {
    const bin = bins.find(row => row.code === stock.bin)
    if (bin === undefined || (bin.sku_summary ?? '') !== '') continue
    const product = products.find(row => row.sku === stock.sku)
    await dataOf(token, 'POST', `/api/wms_bins:update?filterByTk=${bin.id}`, { sku_summary: `${product?.name ?? stock.sku} × ${stock.onHand}` })
  }

  const moveRows = await rowsOf(token, 'wms_movements', 500)
  let movesAdded = 0
  for (const move of SEED_MOVEMENTS) {
    if (moveRows.some(row => row.doc_no === move.doc && row.move_type === move.type)) continue
    const productId = productIdBy(products, move.sku)
    const lotId = lotIdBy(lots, move.lot)
    if (productId === undefined || lotId === undefined) throw new Error(`movement seed resolution failed for ${move.sku}×${move.lot}`)
    // W2-B3: seed rows replay their doc_no-encoded history date (RCV-20260901-001 → 2026-09-01); unparsable docs fall back to today.
    await appendMovement(token, {
      move_type: move.type, doc_no: move.doc,
      product: { id: productId }, lot: { id: lotId },
      ...(move.from === '' ? {} : { from_bin: { id: binIdBy(bins, move.from) } }),
      ...(move.to === '' ? {} : { to_bin: { id: binIdBy(bins, move.to) } }),
      qty: move.qty, note: move.note,
    }, docEncodedDate(move.doc) ?? shanghaiToday())
    movesAdded += 1
  }
  console.log(`nocobase-h5: seed wms_movements +${movesAdded} (kept: ${moveRows.length}/${SEED_MOVEMENTS.length})`)

  // The generalized ledger rebalance (B4 hoisted it out of the seed path so
  // --demo-chain / verify can re-run it over a lived-in world).
  await rebalanceLedger(token)

  const upsertDoc = async (collection: string, keyOf: (row: Record<string, any>) => string, seeds: ReadonlyArray<Record<string, unknown>>, resolve: (row: Record<string, unknown>) => Record<string, unknown>): Promise<void> => {
    const existing = await rowsOf(token, collection, 200)
    const keys = new Set(existing.map(keyOf))
    let added = 0
    for (const seed of seeds) {
      const key = String(seed[Object.keys(seed).find(k => k.endsWith('_no')) ?? ''])
      if (keys.has(key)) continue
      await dataOf(token, 'POST', `/api/${collection}:create`, resolve(seed))
      added += 1
    }
    console.log(`nocobase-h5: seed ${collection} +${added} (kept: ${keys.size}/${seeds.length})`)
  }

  await upsertDoc('wms_receipts', row => String(row.receipt_no), SEED_RECEIPTS, (row) => ({
    receipt_no: row.receipt_no, receipt_type: row.receipt_type,
    supplier: supplierIdBy(suppliers, String(row.supplier)) === undefined ? undefined : { id: supplierIdBy(suppliers, String(row.supplier)) },
    source_no: row.source_no, status: row.status,
    ...(productIdBy(products, String(row.product)) === undefined ? {} : { product: { id: productIdBy(products, String(row.product)) } }),
    lot_no: row.lot_no, qty: row.qty,
    target_zone: zoneIdBy(zones, String(row.target_zone).split('·')[0]) === undefined ? undefined : { id: zoneIdBy(zones, String(row.target_zone).split('·')[0]) },
    ...(row.target_bin === undefined ? {} : { target_bin: { id: binIdBy(bins, String(row.target_bin)) } }),
    note: row.note,
  }))

  await upsertDoc('wms_shipments', row => String(row.shipment_no), SEED_SHIPMENTS, (row) => ({
    shipment_no: row.shipment_no, shipment_type: row.shipment_type, status: row.status,
    ...(productIdBy(products, String(row.product)) === undefined ? {} : { product: { id: productIdBy(products, String(row.product)) } }),
    ...(lotIdBy(lots, String(row.lot)) === undefined ? {} : { lot: { id: lotIdBy(lots, String(row.lot)) } }),
    ...(binIdBy(bins, String(row.from_bin)) === undefined ? {} : { from_bin: { id: binIdBy(bins, String(row.from_bin)) } }),
    qty: row.qty, note: row.note,
  }))

  await upsertDoc('wms_transfers', row => String(row.transfer_no), SEED_TRANSFERS, (row) => ({
    transfer_no: row.transfer_no, status: row.status,
    ...(productIdBy(products, String(row.product)) === undefined ? {} : { product: { id: productIdBy(products, String(row.product)) } }),
    ...(lotIdBy(lots, String(row.lot)) === undefined ? {} : { lot: { id: lotIdBy(lots, String(row.lot)) } }),
    ...(binIdBy(bins, String(row.from_bin)) === undefined ? {} : { from_bin: { id: binIdBy(bins, String(row.from_bin)) } }),
    ...(binIdBy(bins, String(row.to_bin)) === undefined ? {} : { to_bin: { id: binIdBy(bins, String(row.to_bin)) } }),
    qty: row.qty, reason: row.reason,
  }))

  await upsertDoc('wms_counts', row => String(row.count_no), SEED_COUNTS, (row) => ({
    count_no: row.count_no, count_type: row.count_type, status: row.status,
    zone: { id: zoneIdBy(zones, String(row.zone).split('·')[0]) },
    ...(binIdBy(bins, String(row.bin)) === undefined ? {} : { bin: { id: binIdBy(bins, String(row.bin)) } }),
    ...(productIdBy(products, String(row.product)) === undefined ? {} : { product: { id: productIdBy(products, String(row.product)) } }),
    ...(lotIdBy(lots, String(row.lot)) === undefined ? {} : { lot: { id: lotIdBy(lots, String(row.lot)) } }),
    snapshot_qty: row.snapshot_qty, counted_qty: row.counted_qty, difference: row.difference, note: row.note,
  }))

  // B4: ROP parameters land only on products whose columns are still blank
  // (hand-tuned values win over the seed ladder).
  {
    let policyWritten = 0
    for (const policy of SEED_PRODUCT_POLICY) {
      const product = products.find(row => row.sku === policy.sku)
      if (product === undefined) throw new Error(`B4 ROP 种子解析失败：hub_inv_products 缺 ${policy.sku}`)
      const blank = product.reorder_point === null || product.reorder_point === undefined || Number(product.reorder_point) === 0
      if (!blank) continue
      await dataOf(token, 'POST', `/api/hub_inv_products:update?filterByTk=${product.id}`, {
        abc_class: policy.abc, reorder_point: policy.reorderPoint, safety_stock: policy.safetyStock,
        lot_size: policy.lotSize, lead_time_days: policy.leadTimeDays, avg_daily_use: policy.avgDailyUse,
      })
      policyWritten += 1
    }
    console.log(`nocobase-h5: seed ROP policy +${policyWritten} (blank columns only)`)
  }
}

/**
 * B4: the column additions on the pre-existing collections —
 * wms_transfers.transfer_mode + the in_transit status enum, wms_counts
 * .abc_class, and the six hub_inv_products planning columns. Every step is
 * an idempotent presence check (fields:create when missing, enum re-write
 * only when the stored enum lacks in_transit).
 */
async function ensureWmsColumns(token: string): Promise<void> {
  const columnNames = async (collection: string): Promise<Set<string>> => {
    const fields = await dataOf(token, 'GET', `/api/fields:list?filter=${encodeURIComponent(JSON.stringify({ collectionName: { $eq: collection } }))}&pageSize=200`) as Array<{ name?: string }> | null
    return new Set((fields ?? []).map(field => field.name))
  }
  const transferCols = await columnNames('wms_transfers')
  // W2-B3: the business-date columns on the two lived-in ledgers (additive
  // presence check; existing rows backfill via --backfill-dates, new rows
  // carry the value from the appendMovement helper).
  for (const [collection, column, title] of [
    ['wms_movements', 'biz_date', '业务日期'], ['wms_counts', 'biz_date', '盘点日期'],
  ] as const) {
    if (!(await columnNames(collection)).has(column)) {
      await dataOf(token, 'POST', '/api/fields:create', { collectionName: collection, ...date(column, title) })
      console.log(`nocobase-h5: ${collection}.${column} added (W2-B3)`)
    }
  }
  if (!transferCols.has('transfer_mode')) {
    await dataOf(token, 'POST', '/api/fields:create', { collectionName: 'wms_transfers', ...select('transfer_mode', '移库模式', TRANSFER_MODE) })
    console.log('nocobase-h5: wms_transfers.transfer_mode added')
  }
  // The transfer status enum gains in_transit for the two-step mid-leg; a
  // stored enum without it renders the raw value, so re-write the whole enum.
  {
    const statusField = await dataOf(token, 'GET', `/api/fields:list?filter=${encodeURIComponent(JSON.stringify({ collectionName: { $eq: 'wms_transfers' }, name: { $eq: 'status' } }))}&pageSize=1`) as Array<{ uiSchema?: { enum?: Array<{ value?: string }> } }> | null
    const stored = statusField?.[0]?.uiSchema?.enum ?? []
    if (!stored.some(option => option.value === 'in_transit')) {
      await call(token, 'POST', `/api/collections/wms_transfers/fields:update?filterByTk=status`, {
        uiSchema: { type: 'string', 'x-component': 'Select', title: '状态', enum: TRANSFER_STATUS },
      })
      console.log('nocobase-h5: wms_transfers.status enum re-written with in_transit')
    }
  }
  // B6: the movement-type enum gains the three manufacturing legs; B8 adds the
  // two disposition legs. A stored enum without the newest value renders the
  // raw value, so re-write the whole enum (探针取最新档值).
  {
    const moveField = await dataOf(token, 'GET', `/api/fields:list?filter=${encodeURIComponent(JSON.stringify({ collectionName: { $eq: 'wms_movements' }, name: { $eq: 'move_type' } }))}&pageSize=1`) as Array<{ uiSchema?: { enum?: Array<{ value?: string }> } }> | null
    const stored = moveField?.[0]?.uiSchema?.enum ?? []
    if (!stored.some(option => option.value === 'RETURN_VENDOR')) {
      await call(token, 'POST', `/api/collections/wms_movements/fields:update?filterByTk=move_type`, {
        uiSchema: { type: 'string', 'x-component': 'Select', title: '事务类型', enum: MOVE_TYPE },
      })
      console.log('nocobase-h5: wms_movements.move_type enum re-written with the B6/B8 legs (ISSUE_WIP/RETURN_WIP/RECEIPT_MFG/RETURN_VENDOR/SCRAP)')
    }
  }
  const countCols = await columnNames('wms_counts')
  if (!countCols.has('abc_class')) {
    await dataOf(token, 'POST', '/api/fields:create', { collectionName: 'wms_counts', ...select('abc_class', 'ABC 分类', ABC_CLASS) })
    console.log('nocobase-h5: wms_counts.abc_class added')
  }
  const productCols = await columnNames('hub_inv_products')
  const productAdditions: ReadonlyArray<object> = [
    select('abc_class', 'ABC 分类', ABC_CLASS),
    number('reorder_point', '再订货点(ROP)'),
    number('safety_stock', '安全库存'),
    number('lot_size', '补货批量'),
    integer('lead_time_days', '提前期(天)'),
    number('avg_daily_use', '平均日耗'),
  ]
  let productsAdded = 0
  for (const field of productAdditions) {
    const name = (field as { name: string }).name
    if (productCols.has(name)) continue
    await dataOf(token, 'POST', '/api/fields:create', { collectionName: 'hub_inv_products', ...field })
    productsAdded += 1
  }
  if (productsAdded > 0) console.log(`nocobase-h5: hub_inv_products planning columns +${productsAdded} (B4 ROP/ABC)`)
  // W5-B4/BP-07: the reorder suggestion grows the confirm→PR back-reference
  // columns and the confirmed leg on its status enum (additive; the enum
  // re-write follows the in_transit precedent).
  const reorderCols = await columnNames('wms_reorder_suggestions')
  let reorderAdded = 0
  for (const field of [input('converted_doc_code', '转单单号'), input('converted_by', '操作人'), date('converted_at', '转单日期')]) {
    const name = (field as { name: string }).name
    if (reorderCols.has(name)) continue
    await dataOf(token, 'POST', '/api/fields:create', { collectionName: 'wms_reorder_suggestions', ...field })
    reorderAdded += 1
  }
  if (reorderAdded > 0) console.log(`nocobase-h5: wms_reorder_suggestions conversion columns +${reorderAdded} (W5-B4/BP-07)`)
  {
    const statusField = await dataOf(token, 'GET', `/api/fields:list?filter=${encodeURIComponent(JSON.stringify({ collectionName: { $eq: 'wms_reorder_suggestions' }, name: { $eq: 'status' } }))}&pageSize=1`) as Array<{ uiSchema?: { enum?: Array<{ value?: string }> } }> | null
    const stored = statusField?.[0]?.uiSchema?.enum ?? []
    if (!stored.some(option => option.value === 'confirmed')) {
      await call(token, 'POST', `/api/collections/wms_reorder_suggestions/fields:update?filterByTk=status`, {
        uiSchema: { type: 'string', 'x-component': 'Select', title: '状态', enum: SUGGESTION_STATUS },
      })
      console.log('nocobase-h5: wms_reorder_suggestions.status enum re-written with confirmed (W5-B4/BP-07)')
    }
  }
}

// ─── workflow ───

async function workflowExists(token: string, title: string): Promise<boolean> {
  const rows = await dataOf(token, 'GET', `/api/workflows:list?filter=${encodeURIComponent(JSON.stringify({ title: { $eq: title } }))}&pageSize=1`) as Array<{ id: number }> | null
  return (rows?.length ?? 0) > 0
}

async function workflowIds(token: string, title: string): Promise<number[]> {
  const rows = await dataOf(token, 'GET', `/api/workflows:list?filter=${encodeURIComponent(JSON.stringify({ title: { $eq: title } }))}&pageSize=100`) as Array<{ id: number }> | null
  return (rows ?? []).map(row => row.id)
}

/**
 * B4 rebuild rule: a surviving workflow without a request node on the
 * approve branch is the pre-B4 shape — destroy it and rebuild with the
 * engine callback leg (condition TRUE → request /post-count-adjust → update
 * done; FALSE → update back to 差异确认). Rebuild always ends with one
 * off/on toggle so the db hook re-mounts (坑③).
 */
async function ensureWorkflows(token: string): Promise<void> {
  const ids = await workflowIds(token, WORKFLOW_COUNT)
  for (const extra of ids.slice(1).sort((a, b) => b - a)) {
    await call(token, 'POST', `/api/workflows:destroy?filterByTk=${extra}`)
    console.log(`nocobase-h5: duplicate workflow "${WORKFLOW_COUNT}" #${extra} destroyed (self-heal)`)
  }
  const survivors = ids.slice(0, 1)
  if (survivors.length > 0) {
    const nodes = await dataOf(token, 'GET', `/api/flow_nodes:list?filter=${encodeURIComponent(JSON.stringify({ workflowId: { $eq: survivors[0] } }))}&pageSize=50`) as Array<{ type?: string }> | null
    const hasRequest = (nodes ?? []).some(node => node.type === 'request')
    if (hasRequest) {
      console.log(`nocobase-h5: workflow "${WORKFLOW_COUNT}" exists with the B4 request leg (kept)`)
      return
    }
    await call(token, 'POST', `/api/workflows:destroy?filterByTk=${survivors[0]}`)
    console.log(`nocobase-h5: workflow "${WORKFLOW_COUNT}" #${String(survivors[0])} destroyed (pre-B4 shape, rebuilding with the engine callback leg)`)
  }
  // Fires when a count row moves into 差异确认 (update trigger, mode 2); the
  // single manual approval resolves, the TRUE branch calls the engine back
  // to post the difference, then the row lands done.
  const workflow = await dataOf(token, 'POST', '/api/workflows:create', {
    title: WORKFLOW_COUNT, enabled: true, type: 'collection',
    config: { collection: 'wms_counts', mode: 2, filter: { status: { $eq: 'difference' } } },
  }) as { id: number }
  await call(token, 'POST', `/api/workflows:toggle?filterByTk=${workflow.id}`)
  await call(token, 'POST', `/api/workflows:toggle?filterByTk=${workflow.id}`)
  const manual = await dataOf(token, 'POST', '/api/flow_nodes:create', {
    workflow: workflow.id, title: '差异调整审批', type: 'manual',
    config: { assignees: [1], forms: { f1: { type: 'custom', actions: [{ key: 'resolve', status: 1 }, { key: 'reject', status: 1 }] } } },
  }) as { id: number, key: string }
  const condition = await dataOf(token, 'POST', '/api/flow_nodes:create', {
    workflow: workflow.id, title: '审批是否通过', type: 'condition', upstreamId: manual.id,
    config: { engine: 'basic', rejectOnFalse: false, calculation: { calculator: 'equal', operands: [`{{$jobsMapByNodeKey.${manual.key}._}}`, 'resolve'] } },
  }) as { id: number }
  await dataOf(token, 'POST', `/api/flow_nodes:update?filterByTk=${manual.id}`, { downstreamId: condition.id })
  // TRUE branch: the engine callback posts the difference (stock + ledger +
  // done) before the update node's idempotent status write.
  const request = await dataOf(token, 'POST', '/api/flow_nodes:create', {
    workflow: workflow.id, title: '差异回写引擎', type: 'request', upstreamId: condition.id, branchIndex: 1,
    config: {
      url: `http://127.0.0.1:${ENGINE_CALLBACK_PORT}/post-count-adjust`,
      method: 'POST',
      contentType: 'application/json',
      data: { count_no: '{{$context.data.count_no}}' },
      timeout: 30_000,
    },
  }) as { id: number }
  const doneNode = await dataOf(token, 'POST', '/api/flow_nodes:create', {
    workflow: workflow.id, title: '差异调整完成', type: 'update', upstreamId: request.id,
    config: { collection: 'wms_counts', params: { filter: { id: '{{$context.data.id}}' }, values: { status: 'done' } } },
  }) as { id: number }
  await dataOf(token, 'POST', `/api/flow_nodes:update?filterByTk=${request.id}`, { downstreamId: doneNode.id })
  await dataOf(token, 'POST', '/api/flow_nodes:create', {
    workflow: workflow.id, title: '驳回·退回差异确认', type: 'update', upstreamId: condition.id, branchIndex: 0,
    config: { collection: 'wms_counts', params: { filter: { id: '{{$context.data.id}}' }, values: { status: 'difference' } } },
  })
  console.log(`nocobase-h5: workflow "${WORKFLOW_COUNT}" created (update trigger on 差异 → manual → request engine callback → update done / 驳回 difference)`)
}

// ─── v2 page specs (E1 table spine; the 库位图 page also hosts the jsBlock) ───

type FieldKind = 'input' | 'select' | 'number' | 'm2o' | 'date' | 'boolean'
type FieldSpec = { name: string, title: string, kind: FieldKind, options?: object[], required?: boolean }
type TablePageSpec = {
  title: string
  icon: string
  collection: string
  columns: ReadonlyArray<FieldSpec>
  formFields: ReadonlyArray<FieldSpec>
}

const PAGES: ReadonlyArray<TablePageSpec> = [
  {
    title: '仓库库区', icon: 'HomeOutlined', collection: 'wms_zones',
    columns: [
      { name: 'warehouse', title: '所属仓库', kind: 'm2o' },
      { name: 'code', title: '库区编码', kind: 'input' },
      { name: 'name', title: '库区名称', kind: 'input' },
      { name: 'temp_zone', title: '温层', kind: 'select', options: TEMP_ZONE },
    ],
    formFields: [
      { name: 'warehouse', title: '所属仓库', kind: 'm2o' },
      { name: 'code', title: '库区编码', kind: 'input', required: true },
      { name: 'name', title: '库区名称', kind: 'input', required: true },
      { name: 'temp_zone', title: '温层', kind: 'select', options: TEMP_ZONE },
      { name: 'note', title: '备注', kind: 'input' },
    ],
  },
  {
    title: '库位平面图', icon: 'HeatMapOutlined', collection: 'wms_bins',
    columns: [
      { name: 'zone', title: '所属库区', kind: 'm2o' },
      { name: 'code', title: '库位编码', kind: 'input' },
      { name: 'status', title: '库位状态', kind: 'select', options: BIN_STATUS },
      { name: 'capacity', title: '容量', kind: 'number' },
      { name: 'sku_summary', title: '当前存货摘要', kind: 'input' },
    ],
    formFields: [
      { name: 'zone', title: '所属库区', kind: 'm2o' },
      { name: 'code', title: '库位编码', kind: 'input', required: true },
      { name: 'status', title: '库位状态', kind: 'select', options: BIN_STATUS },
      { name: 'capacity', title: '容量', kind: 'number' },
      { name: 'sku_summary', title: '当前存货摘要', kind: 'input' },
    ],
  },
  {
    title: '入库单', icon: 'ImportOutlined', collection: 'wms_receipts',
    columns: [
      { name: 'receipt_no', title: '入库单号', kind: 'input' },
      { name: 'receipt_type', title: '类型', kind: 'select', options: RECEIPT_TYPE },
      { name: 'supplier', title: '供应商', kind: 'm2o' },
      { name: 'product', title: '物料', kind: 'm2o' },
      { name: 'lot_no', title: '批次号', kind: 'input' },
      { name: 'qty', title: '数量', kind: 'number' },
      { name: 'status', title: '状态', kind: 'select', options: RECEIPT_STATUS },
    ],
    formFields: [
      { name: 'receipt_no', title: '入库单号', kind: 'input', required: true },
      { name: 'receipt_type', title: '类型', kind: 'select', options: RECEIPT_TYPE },
      { name: 'supplier', title: '供应商', kind: 'm2o' },
      { name: 'source_no', title: '来源单号', kind: 'input' },
      { name: 'product', title: '物料', kind: 'm2o' },
      { name: 'lot_no', title: '批次号', kind: 'input' },
      { name: 'qty', title: '数量', kind: 'number' },
      { name: 'target_zone', title: '目标库区', kind: 'm2o' },
      { name: 'target_bin', title: '目标库位', kind: 'm2o' },
      { name: 'status', title: '状态', kind: 'select', options: RECEIPT_STATUS },
      { name: 'note', title: '备注', kind: 'input' },
    ],
  },
  {
    title: '出库单', icon: 'ExportOutlined', collection: 'wms_shipments',
    columns: [
      { name: 'shipment_no', title: '出库单号', kind: 'input' },
      { name: 'shipment_type', title: '类型', kind: 'select', options: SHIPMENT_TYPE },
      { name: 'product', title: '物料', kind: 'm2o' },
      { name: 'lot', title: '推荐批次(FEFO)', kind: 'm2o' },
      { name: 'from_bin', title: '拣货库位', kind: 'm2o' },
      { name: 'qty', title: '数量', kind: 'number' },
      { name: 'status', title: '状态', kind: 'select', options: RECEIPT_STATUS },
    ],
    formFields: [
      { name: 'shipment_no', title: '出库单号', kind: 'input', required: true },
      { name: 'shipment_type', title: '类型', kind: 'select', options: SHIPMENT_TYPE },
      { name: 'product', title: '物料', kind: 'm2o' },
      { name: 'lot', title: '推荐批次(FEFO)', kind: 'm2o' },
      { name: 'from_bin', title: '拣货库位', kind: 'm2o' },
      { name: 'qty', title: '数量', kind: 'number' },
      { name: 'status', title: '状态', kind: 'select', options: RECEIPT_STATUS },
      { name: 'note', title: '备注', kind: 'input' },
    ],
  },
  {
    title: '库存查询', icon: 'AppstoreOutlined', collection: 'wms_stock',
    columns: [
      { name: 'product', title: '物料', kind: 'm2o' },
      { name: 'bin', title: '库位', kind: 'm2o' },
      { name: 'lot', title: '批次', kind: 'm2o' },
      { name: 'status', title: '库存状态', kind: 'select', options: STOCK_STATUS },
      { name: 'qty_on_hand', title: '现有数量', kind: 'number' },
      { name: 'qty_allocated', title: '已分配', kind: 'number' },
      { name: 'qty_locked', title: '锁定数量', kind: 'number' },
      { name: 'qty_available', title: '可用数量', kind: 'number' },
      { name: 'version', title: '版本', kind: 'number' },
    ],
    formFields: [
      { name: 'product', title: '物料', kind: 'm2o' },
      { name: 'bin', title: '库位', kind: 'm2o' },
      { name: 'lot', title: '批次', kind: 'm2o' },
      { name: 'status', title: '库存状态', kind: 'select', options: STOCK_STATUS },
      { name: 'qty_on_hand', title: '现有数量', kind: 'number' },
      { name: 'qty_allocated', title: '已分配', kind: 'number' },
      { name: 'qty_locked', title: '锁定数量', kind: 'number' },
      { name: 'qty_available', title: '可用数量', kind: 'number' },
    ],
  },
  {
    title: '批次主数据', icon: 'TagsOutlined', collection: 'wms_lots',
    columns: [
      { name: 'product', title: '物料', kind: 'm2o' },
      { name: 'lot_no', title: '批号', kind: 'input' },
      { name: 'production_date', title: '生产日期', kind: 'date' },
      { name: 'expiry_date', title: '过期日', kind: 'date' },
      { name: 'removal_date', title: '应下架日', kind: 'date' },
      { name: 'supplier', title: '供应商', kind: 'm2o' },
      { name: 'status', title: '批次状态', kind: 'select', options: LOT_STATUS },
    ],
    formFields: [
      { name: 'product', title: '物料', kind: 'm2o' },
      { name: 'lot_no', title: '批号', kind: 'input', required: true },
      { name: 'production_date', title: '生产日期', kind: 'date' },
      { name: 'expiry_date', title: '过期日', kind: 'date' },
      { name: 'removal_date', title: '应下架日', kind: 'date' },
      { name: 'alert_date', title: '预警日', kind: 'date' },
      { name: 'supplier', title: '供应商', kind: 'm2o' },
      { name: 'status', title: '批次状态', kind: 'select', options: LOT_STATUS },
    ],
  },
  {
    title: '盘点管理', icon: 'FileSearchOutlined', collection: 'wms_counts',
    columns: [
      { name: 'count_no', title: '盘点单号', kind: 'input' },
      { name: 'count_type', title: '盘点类型', kind: 'select', options: COUNT_TYPE },
      { name: 'bin', title: '库位', kind: 'm2o' },
      { name: 'product', title: '物料', kind: 'm2o' },
      { name: 'lot', title: '批次', kind: 'm2o' },
      { name: 'snapshot_qty', title: '账面快照', kind: 'number' },
      { name: 'counted_qty', title: '实盘数', kind: 'number' },
      { name: 'difference', title: '差异', kind: 'number' },
      { name: 'status', title: '状态', kind: 'select', options: COUNT_STATUS },
    ],
    formFields: [
      { name: 'count_no', title: '盘点单号', kind: 'input', required: true },
      { name: 'count_type', title: '盘点类型', kind: 'select', options: COUNT_TYPE },
      { name: 'zone', title: '库区', kind: 'm2o' },
      { name: 'bin', title: '库位', kind: 'm2o' },
      { name: 'product', title: '物料', kind: 'm2o' },
      { name: 'lot', title: '批次', kind: 'm2o' },
      { name: 'snapshot_qty', title: '账面快照', kind: 'number' },
      { name: 'counted_qty', title: '实盘数', kind: 'number' },
      { name: 'difference', title: '差异', kind: 'number' },
      { name: 'status', title: '状态', kind: 'select', options: COUNT_STATUS },
      { name: 'note', title: '备注', kind: 'input' },
    ],
  },
  {
    title: '移库管理', icon: 'SwapOutlined', collection: 'wms_transfers',
    columns: [
      { name: 'transfer_no', title: '移库单号', kind: 'input' },
      { name: 'product', title: '物料', kind: 'm2o' },
      { name: 'lot', title: '批次', kind: 'm2o' },
      { name: 'from_bin', title: '源库位', kind: 'm2o' },
      { name: 'to_bin', title: '目标库位', kind: 'm2o' },
      { name: 'qty', title: '数量', kind: 'number' },
      { name: 'status', title: '状态', kind: 'select', options: TRANSFER_STATUS },
    ],
    formFields: [
      { name: 'transfer_no', title: '移库单号', kind: 'input', required: true },
      { name: 'product', title: '物料', kind: 'm2o' },
      { name: 'lot', title: '批次', kind: 'm2o' },
      { name: 'from_bin', title: '源库位', kind: 'm2o' },
      { name: 'to_bin', title: '目标库位', kind: 'm2o' },
      { name: 'qty', title: '数量', kind: 'number' },
      { name: 'reason', title: '原因', kind: 'input' },
      { name: 'status', title: '状态', kind: 'select', options: TRANSFER_STATUS },
    ],
  },
  {
    title: '库存流水', icon: 'UnorderedListOutlined', collection: 'wms_movements',
    columns: [
      { name: 'move_type', title: '事务类型', kind: 'select', options: MOVE_TYPE },
      { name: 'doc_no', title: '单据号', kind: 'input' },
      { name: 'product', title: '物料', kind: 'm2o' },
      { name: 'lot', title: '批次', kind: 'm2o' },
      { name: 'from_bin', title: '源库位', kind: 'm2o' },
      { name: 'to_bin', title: '目标库位', kind: 'm2o' },
      { name: 'qty', title: '数量(±)', kind: 'number' },
      { name: 'note', title: '备注', kind: 'input' },
    ],
    formFields: [
      { name: 'move_type', title: '事务类型', kind: 'select', options: MOVE_TYPE },
      { name: 'doc_no', title: '单据号', kind: 'input', required: true },
      { name: 'product', title: '物料', kind: 'm2o' },
      { name: 'lot', title: '批次', kind: 'm2o' },
      { name: 'from_bin', title: '源库位', kind: 'm2o' },
      { name: 'to_bin', title: '目标库位', kind: 'm2o' },
      { name: 'qty', title: '数量(±)', kind: 'number' },
      { name: 'note', title: '备注', kind: 'input' },
    ],
  },
  {
    // B4: the reservation register — ATP's single fact source (B6/B7 consume).
    title: '预留管理', icon: 'LockOutlined', collection: 'wms_reservations',
    columns: [
      { name: 'code', title: '预留单号', kind: 'input' },
      { name: 'ref_type', title: '关联类型', kind: 'select', options: REF_TYPE },
      { name: 'ref_id', title: '关联单号', kind: 'input' },
      { name: 'product', title: '物料', kind: 'm2o' },
      { name: 'lot', title: '预留批次', kind: 'm2o' },
      { name: 'bin', title: '预留库位', kind: 'm2o' },
      { name: 'qty', title: '预留数量', kind: 'number' },
      { name: 'status', title: '状态', kind: 'select', options: RESERVATION_STATUS },
    ],
    formFields: [
      { name: 'code', title: '预留单号', kind: 'input', required: true },
      { name: 'ref_type', title: '关联类型', kind: 'select', options: REF_TYPE },
      { name: 'ref_id', title: '关联单号', kind: 'input', required: true },
      { name: 'product', title: '物料', kind: 'm2o', required: true },
      { name: 'lot', title: '预留批次', kind: 'm2o' },
      { name: 'bin', title: '预留库位', kind: 'm2o' },
      { name: 'qty', title: '预留数量', kind: 'number' },
      { name: 'status', title: '状态', kind: 'select', options: RESERVATION_STATUS },
    ],
  },
  {
    // B4: the ROP scan output the mobile 补货预警 report reads.
    title: '补货预警', icon: 'WarningOutlined', collection: 'wms_reorder_suggestions',
    columns: [
      { name: 'product', title: '物料', kind: 'm2o' },
      { name: 'on_hand_atp', title: '可用量快照', kind: 'number' },
      { name: 'min', title: '再订货点', kind: 'number' },
      { name: 'suggest_qty', title: '建议补货量', kind: 'number' },
      { name: 'status', title: '状态', kind: 'select', options: SUGGESTION_STATUS },
      { name: 'suggested_at', title: '建议日期', kind: 'date' },
      { name: 'note', title: '说明', kind: 'input' },
    ],
    formFields: [
      { name: 'product', title: '物料', kind: 'm2o', required: true },
      { name: 'on_hand_atp', title: '可用量快照', kind: 'number' },
      { name: 'min', title: '再订货点', kind: 'number' },
      { name: 'suggest_qty', title: '建议补货量', kind: 'number' },
      { name: 'status', title: '状态', kind: 'select', options: SUGGESTION_STATUS },
      { name: 'suggested_at', title: '建议日期', kind: 'date' },
      { name: 'note', title: '说明', kind: 'input' },
    ],
  },
  {
    // W2-B3: the monthly opening/receipts/issues/balances ledger page — the
    // persisted replay of the movements ledger (量/值双轨, period filterable;
    // the KPI card container for the B4 turnover rates).
    title: '月度收发存', icon: 'BookOutlined', collection: 'wms_monthly_balances',
    columns: [
      { name: 'period', title: '月份', kind: 'input' },
      { name: 'product', title: '物料', kind: 'm2o' },
      { name: 'opening_qty', title: '期初数量', kind: 'number' },
      { name: 'in_qty', title: '本期收入', kind: 'number' },
      { name: 'out_qty', title: '本期发出', kind: 'number' },
      { name: 'bal_qty', title: '期末数量', kind: 'number' },
      { name: 'opening_val', title: '期初金额', kind: 'number' },
      { name: 'in_val', title: '收入金额', kind: 'number' },
      { name: 'out_val', title: '发出金额', kind: 'number' },
      { name: 'bal_val', title: '期末金额', kind: 'number' },
      { name: 'snapshot_date', title: '快照生成日', kind: 'date' },
      { name: 'source', title: '生成方式', kind: 'select', options: SNAPSHOT_SOURCE },
    ],
    formFields: [
      { name: 'period', title: '月份(YYYY-MM)', kind: 'input', required: true },
      { name: 'product', title: '物料', kind: 'm2o', required: true },
      { name: 'opening_qty', title: '期初数量', kind: 'number' },
      { name: 'in_qty', title: '本期收入', kind: 'number' },
      { name: 'out_qty', title: '本期发出', kind: 'number' },
      { name: 'bal_qty', title: '期末数量', kind: 'number' },
      { name: 'note', title: '备注', kind: 'input' },
    ],
  },
  {
    // B4: the count plan — the ABC/ROP parameter register over hub_inv_products
    // (盘点单由引擎 --gen-count 冻结快照生成；页面按钮做不了引擎算术).
    title: '盘点计划', icon: 'CalendarOutlined', collection: 'hub_inv_products',
    columns: [
      { name: 'sku', title: '物料编码', kind: 'input' },
      { name: 'name', title: '物料名称', kind: 'input' },
      { name: 'abc_class', title: 'ABC 分类', kind: 'select', options: ABC_CLASS },
      { name: 'reorder_point', title: '再订货点', kind: 'number' },
      { name: 'safety_stock', title: '安全库存', kind: 'number' },
      { name: 'lot_size', title: '补货批量', kind: 'number' },
      { name: 'lead_time_days', title: '提前期(天)', kind: 'number' },
      { name: 'avg_daily_use', title: '平均日耗', kind: 'number' },
    ],
    formFields: [
      { name: 'sku', title: '物料编码', kind: 'input', required: true },
      { name: 'name', title: '物料名称', kind: 'input' },
      { name: 'abc_class', title: 'ABC 分类', kind: 'select', options: ABC_CLASS },
      { name: 'reorder_point', title: '再订货点', kind: 'number' },
      { name: 'safety_stock', title: '安全库存', kind: 'number' },
      { name: 'lot_size', title: '补货批量', kind: 'number' },
      { name: 'lead_time_days', title: '提前期(天)', kind: 'number' },
      { name: 'avg_daily_use', title: '平均日耗', kind: 'number' },
    ],
  },
]

// ─── E1 table factory (uid prefix h5wms; the H4 replica) ───

const listModels = (token: string): Promise<FlowModelRow[]> => listFlowModels(token, 'H5')
const listAllRoutes = (token: string): Promise<RouteRow[]> => listRoutes(token, 'H5')

function popupCreateForm(popup: any): { uid: string } | undefined {
  const tabs = popup?.subModels?.tabs
  const tabList = Array.isArray(tabs) ? tabs : tabs === undefined ? [] : [tabs]
  for (const tab of tabList) {
    const items = tab?.subModels?.grid?.subModels?.items
    const itemList = Array.isArray(items) ? items : items === undefined ? [] : [items]
    for (const item of itemList) {
      if (item?.use === 'CreateFormModel' && typeof item.uid === 'string') return { uid: item.uid }
    }
  }
  return undefined
}

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
    case 'boolean': return 'CheckboxFieldModel'
    default: return 'InputFieldModel'
  }
}

function formGrid(collection: string, fields: ReadonlyArray<FieldSpec>): Record<string, unknown> {
  const itemUids = fields.map(() => withN17Prefix('h5wms', 'i'))
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
            props: field.options === undefined ? {} : { allowClear: true, options: field.options },
          },
        },
      })),
    },
  }
}

async function gridOwners(token: string): Promise<Map<string, string>> {
  const routes = await listAllRoutes(token)
  const flowById = new Map(routes.map(route => [route.id, route]))
  const tabToFlow = new Map<string, string>()
  for (const route of routes) {
    if (route.type !== 'tabs' || route.schemaUid == null) continue
    const parent = flowById.get(route.parentId ?? Number.NaN)
    if (parent?.type === 'flowPage') tabToFlow.set(route.schemaUid, parent.schemaUid ?? '')
  }
  const owners = new Map<string, string>()
  for (const row of await listModels(token)) {
    if (row?.use !== 'BlockGridModel') continue
    const owner = tabToFlow.get(String(row.parentId ?? ''))
    if (owner !== undefined) owners.set(String(row.uid), owner)
  }
  return owners
}

async function pageComplete(token: string, spec: TablePageSpec, flow: RouteRow): Promise<boolean> {
  const rows = await listModels(token)
  const owners = await gridOwners(token)
  const ownedByPage = (row: FlowModelRow): boolean => owners.get(String(row.parentId ?? '')) === flow.schemaUid
  const tables = rows.filter(row => row?.use === 'TableBlockModel'
    && row?.stepParams?.resourceSettings?.init?.collectionName === spec.collection
    && String(row.uid ?? '').startsWith('h5wms'))
  const hasTable = tables.some(ownedByPage)
  const addNew = rows.find(row => row.use === 'AddNewActionModel' && tables.some(table => table.uid === row.parentId && ownedByPage(table)))
  const popup = addNew === undefined ? null
    : await dataOf(token, 'GET', `/api/flowModels:findOne?parentId=${encodeURIComponent(addNew.uid)}&subKey=page`)
  const form = popupCreateForm(popup)
  const stack: any[] = [popup]
  let hasSubmit = false
  while (stack.length > 0 && !hasSubmit) {
    const node = stack.pop()
    if (node === null || typeof node !== 'object') continue
    if (form !== undefined && node.uid === `submit-${form.uid}`) hasSubmit = true
    for (const value of Object.values(node)) {
      if (Array.isArray(value)) stack.push(...value)
      else if (value !== null && typeof value === 'object') stack.push(value)
    }
  }
  if (hasTable && hasSubmit) return true
  console.log(`nocobase-h5: page "${spec.title}" (${flow.schemaUid}) spine incomplete (table ${hasTable}, submit ${hasSubmit})`)
  return false
}

async function ensureMenuGroup(token: string): Promise<{ id: number }> {
  const existing = (await listAllRoutes(token)).find(row => row.title === MENU_GROUP.title && row.type === 'group')
  if (existing !== undefined) {
    console.log(`nocobase-h5: menu group "${MENU_GROUP.title}" exists (kept)`)
    return { id: existing.id }
  }
  const row = await dataOf(token, 'POST', '/api/desktopRoutes:create', { title: MENU_GROUP.title, icon: MENU_GROUP.icon, type: 'group' })
  console.log(`nocobase-h5: menu group "${MENU_GROUP.title}" created`)
  return { id: row.id }
}

async function ensureV2Page(token: string, spec: TablePageSpec, groupId: number, sort: number): Promise<void> {
  const flow = (await listAllRoutes(token)).find(row => row.title === spec.title && row.type === 'flowPage')
  if (flow !== undefined) {
    if (!(await pageComplete(token, spec, flow))) {
      throw new Error(`v2 page "${spec.title}" is truncated; run with --rollback to tear the batch down and rebuild`)
    }
    console.log(`nocobase-h5: v2 page "${spec.title}" exists (kept)`)
    return
  }
  if ((await listAllRoutes(token)).some(row => row.title === spec.title && row.type === 'page')) {
    throw new Error(`a v1 page named "${spec.title}" already exists; rename it first`)
  }
  const routeUid = withN17Prefix('h5wms', '')
  const page = await dataOf(token, 'POST', '/api/desktopRoutes:create', { title: spec.title, icon: spec.icon, type: 'flowPage', parentId: groupId, sort, schemaUid: routeUid })
  const tabUid = withN17Prefix('h5wms', 't')
  await dataOf(token, 'POST', '/api/desktopRoutes:create', { title: '', type: 'tabs', parentId: page.id, schemaUid: tabUid, tabSchemaName: withN17Prefix('h5wms', 'ts') })

  const save = (model: Record<string, unknown>) => dataOf(token, 'POST', '/api/flowModels:save', model)
  await save({ uid: routeUid, schema: { use: 'RouteModel' } })
  await save({ uid: tabUid, schema: { use: 'RouteModel' } })
  const pageUid = withN17Prefix('h5wms', 'p')
  await save({ uid: pageUid, parentId: routeUid, subKey: 'page', subType: 'object', use: 'RootPageModel', props: { title: spec.title, displayTitle: true, enableTabs: false }, stepParams: { pageSettings: { general: { title: spec.title, displayTitle: true, enableTabs: false } } } })
  const gridUid = withN17Prefix('h5wms', 'g')
  await save({ uid: gridUid, parentId: tabUid, subKey: 'grid', subType: 'object', use: 'BlockGridModel', props: {}, filterManager: [] })

  const tableUid = withN17Prefix('h5wms', 'tb')
  await save({ uid: tableUid, use: 'TableBlockModel', parentId: gridUid, subKey: 'items', subType: 'array', sortIndex: 1, stepParams: { resourceSettings: { init: { dataSourceKey: 'main', collectionName: spec.collection } } }, props: {} })
  let sortIndex = 1
  for (const column of spec.columns) {
    const uid = withN17Prefix('h5wms', 'c')
    const model = displayModelFor(column.kind)
    await save({
      uid, use: 'TableColumnModel', parentId: tableUid, subKey: 'columns', subType: 'array', sortIndex,
      stepParams: {
        fieldSettings: { init: { dataSourceKey: 'main', collectionName: spec.collection, fieldPath: column.name } },
        tableColumnSettings: { model: { use: model } },
      },
      props: { title: column.title, dataIndex: column.name, width: 150, editable: false, sorter: false, fixed: 'none', ...(column.options === undefined ? {} : { options: column.options }) },
    })
    await save({
      uid: `${uid}f`, use: model, parentId: uid, subKey: 'field', subType: 'object', sortIndex: 0,
      stepParams: { popupSettings: { openView: { collectionName: spec.collection, dataSourceKey: 'main' } } },
      props: { displayStyle: 'text', overflowMode: 'ellipsis', clickToOpen: false, displayCopyButton: false, ...(column.options === undefined ? {} : { options: column.options }) },
    })
    sortIndex += 1
  }
  await save({
    uid: withN17Prefix('h5wms', 'fa'), parentId: tableUid, subKey: 'actions', subType: 'array', sortIndex: 1,
    use: 'FilterActionModel', props: {},
    stepParams: { buttonSettings: { general: { title: '{{t("Filter")}}' } } },
  })
  await save({
    uid: withN17Prefix('h5wms', 'an'), parentId: tableUid, subKey: 'actions', subType: 'array', sortIndex: 2,
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
                    subModels: { grid: formGrid(spec.collection, spec.formFields) },
                  }],
                },
              },
            },
          }],
        },
      },
    },
  })
  await save({
    uid: withN17Prefix('h5wms', 'rf'), parentId: tableUid, subKey: 'actions', subType: 'array', sortIndex: 3,
    use: 'RefreshActionModel', props: { title: '', icon: 'ReloadOutlined' },
    stepParams: { buttonSettings: { general: { title: '', icon: 'ReloadOutlined' } } },
  })
  // W3-B1: row-detail triple on every fresh table (P0 root cause ① fix).
  await ensureTableRowDetail(token, tableUid, {
    collection: spec.collection,
    fields: spec.columns.map(column => ({ fieldPath: column.name, modelUse: displayModelFor(column.kind), ...(column.options === undefined ? {} : { options: column.options }) })),
    tabTitle: '详情',
    actionsColumnSortIndex: spec.columns.length + 1,
  })
  console.log(`nocobase-h5: v2 page "${spec.title}" created (/admin/${routeUid})`)
}

// ─── the 库位图 jsBlock (A route; probe-verified vocabulary) ───

/** The map block: reads wms_bins, renders a zone-grouped CSS grid colored by status with a hover summary. */
const BIN_MAP_CODE = [
  // Probe-verified 2026-09-15: collection access must ride the FlowResource
  // vocabulary (makeResource/setResourceName/setPageSize/refresh/getData);
  // ctx.api.resource(...).list is rejected by the runjs allowlist.
  "const multi = ctx.makeResource('MultiRecordResource');",
  "multi.setResourceName('wms_bins');",
  'multi.setPageSize(500);',
  'await multi.refresh();',
  'const bins = multi.getData() || [];',
  'const zoneOf = {};',
  'const zoneNames = { SH_A: "上海·常温区", SH_C: "上海·冷藏区", SH_F: "上海·冷冻区", GZ_A: "南沙·常温区", GZ_C: "南沙·冷藏区", GZ_F: "南沙·冷冻区" };',
  'for (const bin of bins) {',
  '  const zoneKey = String(bin.code || "").split("-").slice(0, 2).join("-");',
  '  if (!zoneOf[zoneKey]) zoneOf[zoneKey] = [];',
  '  zoneOf[zoneKey].push(bin);',
  '}',
  'const color = { idle: "#52c41a", occupied: "#1677ff", disabled: "#bfbfbf", frozen: "#ff4d4f" };',
  'const label = { idle: "空闲", occupied: "占用", disabled: "禁用", frozen: "盘点冻结" };',
  'let sections = "";',
  'for (const key of Object.keys(zoneOf).sort()) {',
  '  const rows = zoneOf[key].slice().sort((a, b) => String(a.code).localeCompare(String(b.code)));',
  '  const cells = rows.map((bin) => `<div title="${bin.code} · ${label[bin.status] || bin.status}${bin.sku_summary ? " · " + bin.sku_summary : ""}" style="width:34px;height:34px;margin:2px;border-radius:6px;background:${color[bin.status] || "#bfbfbf"};color:#fff;font-size:10px;display:flex;align-items:center;justify-content:center;cursor:pointer">${String(bin.code || "").split("-").pop()}</div>`).join("");',
  '  const counts = { idle: 0, occupied: 0, disabled: 0, frozen: 0 };',
  '  for (const bin of rows) counts[bin.status] = (counts[bin.status] || 0) + 1;',
  '  sections += `<div style="margin:8px 0"><div style="font-weight:600;margin-bottom:4px">${zoneNames[String(key).replace("-", "_")] || key}（空闲 ${counts.idle} / 占用 ${counts.occupied} / 禁用 ${counts.disabled} / 冻结 ${counts.frozen}）</div><div style="display:flex;flex-wrap:wrap">${cells}</div></div>`;',
  '}',
  'const legend = `<div style="margin-bottom:8px;font-size:12px">图例：<span style="color:#52c41a">■ 空闲</span>　<span style="color:#1677ff">■ 占用</span>　<span style="color:#bfbfbf">■ 禁用</span>　<span style="color:#ff4d4f">■ 盘点冻结</span>（悬停查看存货摘要）</div>`;',
  'ctx.render(`<div data-wms="bin-map" style="padding:8px">${legend}${sections}</div>`);',
].join('\n')

async function pageGridUid(token: string, pageTitle: string): Promise<string> {
  const routes = await listAllRoutes(token)
  const flow = routes.find(row => row.title === pageTitle && row.type === 'flowPage')
  if (flow === undefined) throw new Error(`v2 page "${pageTitle}" not found`)
  const tab = routes.find(row => row.parentId === flow.id && row.type === 'tabs')
  if (tab?.schemaUid == null) throw new Error(`v2 page "${pageTitle}" has no tabs child row`)
  const grid = await dataOf(token, 'GET', `/api/flowModels:findOne?parentId=${tab.schemaUid}&subKey=grid`)
  if (grid?.uid == null) throw new Error(`v2 page "${pageTitle}" grid not found`)
  return String(grid.uid)
}

async function ensureBinMap(token: string): Promise<void> {
  const gridUid = await pageGridUid(token, '库位平面图')
  const rows = await listModels(token)
  if (rows.some(row => row.use === 'JSBlockModel' && row.parentId === gridUid)) {
    console.log('nocobase-h5: bin-map JSBlock exists (kept)')
    return
  }
  const block = await dataOf(token, 'POST', '/api/flowSurfaces:addBlock', {
    target: { uid: gridUid },
    type: 'jsBlock',
    settings: { showBlockCard: true, code: BIN_MAP_CODE },
  })
  const blockUid = block?.uid ?? block?.tree?.uid
  if (typeof blockUid !== 'string') throw new Error(`addBlock returned no uid for the bin map: ${JSON.stringify(block).slice(0, 200)}`)
  console.log(`nocobase-h5: bin-map JSBlock created (uid ${blockUid})`)
}

// ─── submit actions ───

async function ensureFormSubmits(token: string): Promise<void> {
  const rows = await listModels(token)
  const existingSubmits = new Set(rows.filter(row => row.use === 'FormSubmitActionModel').map(row => row.uid))
  const collections = new Set(PAGES.map(spec => spec.collection))
  // Only this batch owns forms on the wms_* collections.
  const forms = rows.filter(row => row.use === 'CreateFormModel' && row.parentId == null
    && collections.has(String(row.stepParams?.resourceSettings?.init?.collectionName ?? '')))
  let added = 0
  for (const form of forms) {
    const submitUid = `submit-${form.uid}`
    if (existingSubmits.has(submitUid)) continue
    await call(token, 'POST', '/api/flowModels:save', {
      uid: submitUid, parentId: form.uid, subKey: 'actions', subType: 'array', sortIndex: 1, use: 'FormSubmitActionModel', props: {}, stepParams: {},
    })
    added += 1
  }
  console.log(`nocobase-h5: form submit actions ${added > 0 ? `${added} added` : 'already in place (kept)'}`)
}

// ─── the FEFO recommender ───

/**
 * Allocate `qty` of one SKU across qualified, unexpired lots ordered by
 * 应下架日 ASC then qty DESC (the R7 picking semantics). Prints the
 * allocation and returns it; nothing is written.
 */
async function fefo(token: string, sku: string, qty: number): Promise<void> {
  const products = await rowsOf(token, 'hub_inv_products', 200)
  const product = products.find(row => row.sku === sku)
  if (product === undefined) throw new Error(`no hub_inv_products row with sku=${sku}`)
  const lots = (await rowsOf(token, 'wms_lots')).filter(row => row.product_id === product.id && row.status === 'qualified')
  // The flat stock list carries lot_id; index the eligible lots by row id.
  const lotsById = new Map(lots.map(row => [String(row.id), row]))
  const stock = (await rowsOf(token, 'wms_stock', 500))
    .map(row => ({ row, lot: lotsById.get(String(row.lot_id ?? '')) }))
    .filter(entry => entry.lot !== undefined && entry.row.product_id === product.id && entry.row.status === 'good')
    .filter(entry => (entry.lot?.expiry_date ?? '') > new Date().toISOString().slice(0, 10))
    .sort((a, b) => String(a.lot?.removal_date ?? '').localeCompare(String(b.lot?.removal_date ?? '')) || (Number(b.row.qty_available) - Number(a.row.qty_available)))
  let remaining = qty
  const allocation: Array<{ lot: string, bin: string, removal: string, take: number }> = []
  for (const entry of stock) {
    if (remaining <= 0) break
    const available = Math.max(0, Number(entry.row.qty_available ?? 0))
    if (available <= 0) continue
    const take = Math.min(available, remaining)
    allocation.push({ lot: String(entry.lot?.lot_no), bin: String(entry.row.bin_id), removal: String(entry.lot?.removal_date).slice(0, 10), take })
    remaining -= take
  }
  console.log(`nocobase-h5: FEFO ${sku} × ${qty} →`)
  for (const entry of allocation) {
    console.log(`  批次 ${entry.lot}（应下架日 ${entry.removal}）取 ${entry.take}`)
  }
  if (remaining > 0) console.log(`  ⚠️ 缺口 ${remaining}（可用量不足）`)
  if (allocation.length === 0) throw new Error('FEFO matched no eligible stock')
}

// ─── the posting engine (optimistic lock + append-only ledger) ───

/**
 * The Shanghai-day clock every business date rides (kpi-run shanghaiDate's
 * twin): UTC+8 fixed offset, so a posting near midnight lands on the day the
 * Shanghai operator considers "today".
 */
export function shanghaiToday(at: Date = new Date()): string {
  return new Date(at.getTime() + 8 * 3_600_000).toISOString().slice(0, 10)
}

/**
 * W2-B3: the single movement writer. Every engine posting (and the seed
 * path) goes through here so each row carries biz_date — the posting day by
 * default, or the document's business date when the caller resolved one
 * (seed rows replay their doc_no-encoded history). A direct create without
 * biz_date turns the verify coverage assertion red (the convergence proof).
 * @param token - the root API token.
 * @param fields - the movement payload (move_type/doc_no/product/lot/from_bin/to_bin/qty/note).
 * @param bizDate - overrides the default (today, Shanghai day).
 */
export async function appendMovement(token: string, fields: Record<string, unknown>, bizDate?: string): Promise<void> {
  await dataOf(token, 'POST', '/api/wms_movements:create', { ...fields, biz_date: bizDate ?? shanghaiToday() })
}

/**
 * Apply one stock delta with optimistic locking: the update filter carries
 * the version read moments before, so a concurrent writer makes the update
 * match zero rows and this throws instead of double-applying.
 */
export async function applyStockDelta(token: string, key: { productId: number, binId: number, lotId: number }, delta: number): Promise<void> {
  const stock = (await rowsOf(token, 'wms_stock', 500)).find(row =>
    row.product_id === key.productId && row.bin_id === key.binId && row.lot_id === key.lotId)
  const version = Number(stock?.version ?? 0)
  const onHand = Number(stock?.qty_on_hand ?? 0)
  if (stock === undefined) throw new Error('stock row missing for the posting key (create it first through the inventory page)')
  // The filtered update answers with the affected-row count — v2 serves it
  // as either a bare number or a one-element array; both mean one row moved.
  const updated = await dataOf(token, 'POST', `/api/wms_stock:update?filter=${encodeURIComponent(JSON.stringify({ id: stock.id, version }))}`, {
    qty_on_hand: onHand + delta,
    qty_available: onHand + delta - Number(stock.qty_allocated ?? 0) - Number(stock.qty_locked ?? 0),
    version: version + 1,
  })
  const updatedCount = Array.isArray(updated) ? updated.length : Number(updated)
  if (updatedCount !== 1) {
    throw new Error(`optimistic-lock conflict on stock row ${stock.id}: expected version ${version} no longer matches (concurrent posting won); re-read and retry — refusing to double-apply`)
  }
}

async function postShipment(token: string, shipmentNo: string): Promise<void> {
  const shipments = await rowsOf(token, 'wms_shipments')
  const shipment = shipments.find(row => row.shipment_no === shipmentNo)
  if (shipment === undefined) throw new Error(`no shipment ${shipmentNo}`)
  if (shipment.status === 'posted' || shipment.status === 'closed') {
    console.log(`nocobase-h5: shipment ${shipmentNo} already ${shipment.status} (kept; posting is single-shot)`)
    return
  }
  const key = { productId: Number(shipment.product_id), binId: Number(shipment.from_bin_id), lotId: Number(shipment.lot_id) }
  const qty = Number(shipment.qty)
  await applyStockDelta(token, key, -qty)
  await appendMovement(token, {
    move_type: 'SHIP', doc_no: shipmentNo,
    product: { id: key.productId }, lot: { id: key.lotId }, from_bin: { id: key.binId },
    qty: -qty, note: '出库过账（脚本侧过账引擎）',
  })
  await dataOf(token, 'POST', `/api/wms_shipments:update?filterByTk=${shipment.id}`, { status: 'posted' })
  console.log(`nocobase-h5: shipment ${shipmentNo} posted — stock -${qty}, movement appended`)
}

/** B3/W3-B6: post one receipt (the WMS putaway verb) — exported for the terminal endpoint. */
export async function postReceipt(token: string, receiptNo: string): Promise<void> {
  const receipts = await rowsOf(token, 'wms_receipts')
  const receipt = receipts.find(row => row.receipt_no === receiptNo)
  if (receipt === undefined) throw new Error(`no receipt ${receiptNo}`)
  if (receipt.status === 'posted' || receipt.status === 'closed') {
    console.log(`nocobase-h5: receipt ${receiptNo} already ${receipt.status} (kept; posting is single-shot)`)
    return
  }
  // B3: a PO-sourced receipt quarantines — quarantine lot, hold stock, 待检区
  // putaway, iqc_status defaults to pending, and the PO's receiving axis moves.
  const poSourced = receipt.po_id !== null && receipt.po_id !== undefined && receipt.po_id !== ''
  // Resolve or create the lot (the receipt carries lot_no as text).
  const products = await rowsOf(token, 'hub_inv_products', 200)
  const productId = Number(receipt.product_id)
  const product = products.find(row => row.id === productId)
  let lots = await rowsOf(token, 'wms_lots')
  let lot = lots.find(row => row.lot_no === receipt.lot_no)
  if (lot === undefined) {
    const shelfLife = Number(product?.shelf_life_days ?? 365)
    const production = new Date()
    const expiry = new Date(production.getTime() + shelfLife * 86_400_000)
    const removal = new Date(expiry.getTime() - 30 * 86_400_000)
    const alert = new Date(expiry.getTime() - 60 * 86_400_000)
    const fmt = (d: Date): string => d.toISOString().slice(0, 10)
    await dataOf(token, 'POST', '/api/wms_lots:create', {
      product: { id: productId }, lot_no: receipt.lot_no,
      production_date: fmt(production), expiry_date: fmt(expiry),
      removal_date: fmt(removal), alert_date: fmt(alert),
      supplier: receipt.supplier_id === null || receipt.supplier_id === undefined ? undefined : { id: Number(receipt.supplier_id) },
      status: poSourced ? 'quarantined' : 'qualified',
    })
    lots = await rowsOf(token, 'wms_lots')
    lot = lots.find(row => row.lot_no === receipt.lot_no)
    console.log(`nocobase-h5: lot ${receipt.lot_no} created (shelf-life ${shelfLife}d; ${poSourced ? '隔离待检' : '合格'})`)
  }
  if (lot === undefined) throw new Error(`lot ${receipt.lot_no} still missing after create`)
  const qty = Number(receipt.qty)
  // Target bin: PO-sourced receipts ignore any hand-set target and land in the
  // 待检区; free receipts keep the receipt's target_bin, else the zone's first
  // idle bin whose temp zone matches the product temp_zone (the putaway rule).
  let binId = !poSourced && receipt.target_bin_id !== null && receipt.target_bin_id !== undefined ? Number(receipt.target_bin_id) : undefined
  if (binId === undefined) {
    const zones = await rowsOf(token, 'wms_zones')
    const bins = await rowsOf(token, 'wms_bins', 200)
    const zone = poSourced
      ? zones.find(row => row.code === QUARANTINE_ZONE_CODE)
      : zones.find(row => Number(receipt.target_zone_id) === row.id)
        ?? zones.find(row => row.temp_zone === (product?.temp_zone ?? 'ambient'))
    if (poSourced && zone === undefined) {
      throw new Error(`待检区 ${QUARANTINE_ZONE_CODE} 不存在——重跑 nocobase-h5-wms.mts 补待检区种子`)
    }
    const bin = bins.find(row => row.status === 'idle' && (zone === undefined || row.zone_id === zone.id))
    if (bin === undefined) throw new Error(`no idle bin found for zone ${zone?.code ?? '(any)'} — putaway blocked`)
    binId = Number(bin.id)
    await dataOf(token, 'POST', `/api/wms_receipts:update?filterByTk=${receipt.id}`, { target_bin: { id: binId } })
    console.log(`nocobase-h5: putaway ${poSourced ? 'quarantined to' : 'recommended'} bin ${bin.code} (${poSourced ? '待检区 IQC' : `temp-zone match: ${zone?.name ?? 'fallback'}`})`)
  }
  const stocks = await rowsOf(token, 'wms_stock', 500)
  const existing = stocks.find(row => row.product_id === productId && row.bin_id === binId && row.lot_id === lot.id)
  if (existing === undefined) {
    await dataOf(token, 'POST', '/api/wms_stock:create', {
      product: { id: productId }, bin: { id: binId }, lot: { id: lot.id }, status: poSourced ? 'hold' : 'good',
      qty_on_hand: qty, qty_allocated: 0, qty_locked: 0, qty_available: qty, version: 1,
    })
  } else {
    await applyStockDelta(token, { productId, binId, lotId: lot.id }, qty)
  }
  await appendMovement(token, {
    move_type: 'PUTAWAY', doc_no: receiptNo,
    product: { id: productId }, lot: { id: lot.id }, to_bin: { id: binId },
    qty, note: poSourced ? '收货上架过账（PO 来源→待检区，IQC 放行后转合格）' : '收货上架过账（脚本侧过账引擎）',
  })
  const receiptWrite: Record<string, unknown> = { status: 'posted', received_at: new Date().toISOString().slice(0, 10) }
  if (poSourced && (receipt.iqc_status === null || receipt.iqc_status === undefined || receipt.iqc_status === '')) {
    receiptWrite.iqc_status = 'pending'
  }
  await dataOf(token, 'POST', `/api/wms_receipts:update?filterByTk=${receipt.id}`, receiptWrite)
  if (poSourced) await updatePoReceiving(token, Number(receipt.po_id), productId, qty)
  console.log(`nocobase-h5: receipt ${receiptNo} posted — stock +${qty} (${poSourced ? '待检区 hold' : '合格 good'}), movement appended`)
  // B8: the IQC anchor document (quarantined PO receipts only).
  if (poSourced) {
    await ensureQualityInspectionFor(token, 'IQC', {
      refType: 'receipt', refNo: receiptNo, refId: Number(receipt.id), productId,
      supplierId: receipt.supplier_id === null || receipt.supplier_id === undefined ? undefined : Number(receipt.supplier_id),
      lotNo: String(receipt.lot_no), lotQty: qty,
    })
  }
}

/**
 * B3: advance a PO's receiving axis after a posted receipt — the matching
 * order line's qty_received grows and pur_orders.receiving_status recomputes
 * (partial while any line lags, received once every line is covered).
 */
async function updatePoReceiving(token: string, poId: number, productId: number, qty: number): Promise<void> {
  const lines = (await rowsOf(token, 'pur_order_lines')).filter(row => Number(row.order_id) === poId)
  const line = lines.find(row => Number(row.product_id) === productId)
  if (line !== undefined) {
    await dataOf(token, 'POST', `/api/pur_order_lines:update?filterByTk=${line.id}`, { qty_received: Number(line.qty_received ?? 0) + qty })
  }
  const linesNow = (await rowsOf(token, 'pur_order_lines')).filter(row => Number(row.order_id) === poId)
  const ordered = linesNow.reduce((sum, row) => sum + Number(row.qty ?? 0), 0)
  const received = linesNow.reduce((sum, row) => sum + Number(row.qty_received ?? 0), 0)
  const receivingStatus = received <= 0 ? 'none' : received + 0.0001 < ordered ? 'partial' : 'received'
  await dataOf(token, 'POST', `/api/pur_orders:update?filterByTk=${poId}`, { receiving_status: receivingStatus })
  console.log(`nocobase-h5: pur_orders #${poId} receiving_status=${receivingStatus} (Σreceived ${received}/${ordered})`)
}

/** B3: record one IQC verdict on a posted PO-sourced receipt (pass | fail | concession). */
async function setIqc(token: string, receiptNo: string, verdict: 'passed' | 'failed' | 'concession'): Promise<void> {
  const receipts = await rowsOf(token, 'wms_receipts')
  const receipt = receipts.find(row => row.receipt_no === receiptNo)
  if (receipt === undefined) throw new Error(`no receipt ${receiptNo}`)
  if (receipt.status !== 'posted' && receipt.status !== 'closed') throw new Error(`入库单 ${receiptNo} 尚未过账（status=${String(receipt.status)}），先 --post-receipt`)
  if (receipt.iqc_status === 'passed' || receipt.iqc_status === 'not_required' || receipt.iqc_status === 'concession') {
    console.log(`nocobase-h5: receipt ${receiptNo} iqc_status=${String(receipt.iqc_status)} (kept; verdict is single-shot)`)
    return
  }
  await dataOf(token, 'POST', `/api/wms_receipts:update?filterByTk=${receipt.id}`, { iqc_status: verdict })
  console.log(`nocobase-h5: receipt ${receiptNo} iqc_status=${verdict}`)
}

/**
 * B3: release a passed (or not-required) receipt's quarantine stock into the
 * qualified zone — the stock moves hold→good across bins with a TRANSFER
 * movement, the lot turns qualified, and the receipt closes. IQC-pending or
 * failed receipts refuse: 未放行不能过账入库.
 */
async function releaseReceipt(token: string, receiptNo: string): Promise<void> {
  const receipts = await rowsOf(token, 'wms_receipts')
  const receipt = receipts.find(row => row.receipt_no === receiptNo)
  if (receipt === undefined) throw new Error(`no receipt ${receiptNo}`)
  if (receipt.status === 'closed') {
    console.log(`nocobase-h5: receipt ${receiptNo} already closed (kept; release is single-shot)`)
    return
  }
  if (receipt.status !== 'posted') throw new Error(`入库单 ${receiptNo} 尚未过账（status=${String(receipt.status)}），先 --post-receipt`)
  if (receipt.iqc_status !== 'passed' && receipt.iqc_status !== 'not_required' && receipt.iqc_status !== 'concession') {
    throw new Error(`IQC 未放行不能过账入库：入库单 ${receiptNo} 的检验状态为「${String(receipt.iqc_status ?? '未设置')}」，需先 --iqc ${receiptNo} pass（或 not_required 免检）`)
  }
  const productId = Number(receipt.product_id)
  const products = await rowsOf(token, 'hub_inv_products', 200)
  const product = products.find(row => row.id === productId)
  const lot = (await rowsOf(token, 'wms_lots')).find(row => row.lot_no === receipt.lot_no)
  const lotId = lot === undefined ? NaN : Number(lot.id)
  const fromBinId = receipt.target_bin_id === null || receipt.target_bin_id === undefined ? undefined : Number(receipt.target_bin_id)
  if (!Number.isInteger(lotId) || fromBinId === undefined) throw new Error(`receipt ${receiptNo} lot/target_bin unresolved`)
  const qty = Number(receipt.qty)
  // Qualified destination: the product temp-zone's idle bin, any zone fallback.
  const zones = await rowsOf(token, 'wms_zones')
  const bins = await rowsOf(token, 'wms_bins', 200)
  const zone = zones.find(row => row.temp_zone === (product?.temp_zone ?? 'ambient') && row.code !== QUARANTINE_ZONE_CODE)
  const destBin = bins.find(row => row.status === 'idle' && (zone === undefined || row.zone_id === zone.id) && row.id !== fromBinId)
    ?? bins.find(row => row.status !== 'disabled' && row.id !== fromBinId)
  if (destBin === undefined) throw new Error('no eligible qualified bin for release')
  // Quarantine bin −qty, qualified bin +qty (the only two stock mutations).
  await applyStockDelta(token, { productId, binId: fromBinId, lotId }, -qty)
  const stocks = await rowsOf(token, 'wms_stock', 500)
  const existing = stocks.find(row => row.product_id === productId && row.bin_id === destBin.id && row.lot_id === lotId)
  if (existing === undefined) {
    await dataOf(token, 'POST', '/api/wms_stock:create', {
      product: { id: productId }, bin: { id: destBin.id }, lot: { id: lotId }, status: 'good',
      qty_on_hand: qty, qty_allocated: 0, qty_locked: 0, qty_available: qty, version: 1,
    })
  } else {
    await applyStockDelta(token, { productId, binId: Number(destBin.id), lotId }, qty)
  }
  await dataOf(token, 'POST', `/api/wms_lots:update?filterByTk=${lotId}`, { status: 'qualified' })
  // B4: the ±MOVE pair — a single positive row double-counts the (product,
  // lot) ledger sum, which the stock == Σmovements gate refuses.
  await appendMovement(token, {
    move_type: 'MOVE', doc_no: receiptNo,
    product: { id: productId }, lot: { id: lotId }, from_bin: { id: fromBinId },
    qty: -qty, note: `IQC 放行转合格区·待检出（${String(receipt.iqc_status)}）`,
  })
  await appendMovement(token, {
    move_type: 'MOVE', doc_no: receiptNo,
    product: { id: productId }, lot: { id: lotId }, to_bin: { id: destBin.id },
    qty, note: `IQC 放行转合格区·合格入（${String(receipt.iqc_status)}）`,
  })
  await dataOf(token, 'POST', `/api/wms_receipts:update?filterByTk=${receipt.id}`, { status: 'closed' })
  console.log(`nocobase-h5: receipt ${receiptNo} released — lot→qualified, stock hold→good via bin ${destBin.code}, ±MOVE pair appended, receipt closed`)
}

// ─── B4: the transfer / reservation / ROP / count-adjust engine surface ───

/** The zone code one bin id belongs to (blank when unresolvable). */
async function zoneCodeOfBin(zones: Array<Record<string, any>>, bins: Array<Record<string, any>>, binId: number): Promise<string> {
  const bin = bins.find(row => Number(row.id) === binId)
  return String(zones.find(row => Number(row.id) === Number(bin?.zone_id))?.code ?? '')
}

/**
 * Apply one ±qty onto a stock row's qty_allocated (the reservation's
 * materialized projection), re-deriving qty_available under the row's
 * optimistic lock — the same version-gate discipline applyStockDelta rides.
 */
async function applyAllocationDelta(token: string, stockRow: Record<string, any>, delta: number): Promise<void> {
  const version = Number(stockRow.version ?? 0)
  const updated = await dataOf(token, 'POST', `/api/wms_stock:update?filter=${encodeURIComponent(JSON.stringify({ id: stockRow.id, version }))}`, {
    qty_allocated: Number(stockRow.qty_allocated ?? 0) + delta,
    qty_available: Number(stockRow.qty_on_hand ?? 0) - (Number(stockRow.qty_allocated ?? 0) + delta) - Number(stockRow.qty_locked ?? 0),
    version: version + 1,
  })
  const updatedCount = Array.isArray(updated) ? updated.length : Number(updated)
  if (updatedCount !== 1) {
    throw new Error(`预留乐观锁冲突：stock 行 ${String(stockRow.id)} 的版本 ${String(version)} 已被并发过账改写，拒绝双写——重读后重试`)
  }
}

/**
 * B4: post one transfer through the engine. One-step moves source → target
 * in a single call; two-step ('out' then 'in') parks the mid-leg on the
 * 在途 bin. Every leg writes the ± movement pair so the per-(product, lot)
 * ledger sum stays unchanged by a transfer (net zero), and 待检/冻结 stock
 * or a virtual-zone source refuses.
 * @param leg - 'out' | 'in' for two-step transfers; any other value (default) posts one-step.
 */
async function postTransfer(token: string, transferNo: string, leg: string): Promise<void> {
  const transfers = await rowsOf(token, 'wms_transfers')
  const transfer = transfers.find(row => row.transfer_no === transferNo)
  if (transfer === undefined) throw new Error(`no transfer ${transferNo}`)
  if (transfer.status === 'completed') {
    console.log(`nocobase-h5: transfer ${transferNo} already completed (kept; posting is single-shot)`)
    return
  }
  const twoStep = String(transfer.transfer_mode ?? 'one_step') === 'two_step'
  const zones = await rowsOf(token, 'wms_zones')
  const bins = await rowsOf(token, 'wms_bins', 200)
  const stocks = await rowsOf(token, 'wms_stock', 500)
  const productId = Number(transfer.product_id)
  const lotId = Number(transfer.lot_id)
  const qty = Number(transfer.qty)
  const fromBinId = Number(transfer.from_bin_id)
  const toBinId = Number(transfer.to_bin_id)
  const lossBin = bins.find(row => row.code === `${LOSS_ZONE_CODE}-01-01`)
  const transitBin = bins.find(row => row.code === `${TRANSIT_ZONE_CODE}-01-01`)
  if (lossBin === undefined || transitBin === undefined) {
    throw new Error(`虚拟库位 ${LOSS_ZONE_CODE}-01-01 / ${TRANSIT_ZONE_CODE}-01-01 缺失——重跑 nocobase-h5-wms.mts 补 B4 种子`)
  }
  if (transfer.status === 'in_transit') {
    if (!twoStep || leg !== 'in') throw new Error(`移库单 ${transferNo} 在途中（in_transit）：两步移库需 --post-transfer ${transferNo} in 完成第二段`)
    // Leg two: 在途 → target.
    const transitStock = stocks.find(row => row.product_id === productId && row.bin_id === transitBin.id && row.lot_id === lotId)
    if (transitStock === undefined) throw new Error(`在途库位无 ${transferNo} 的库存行（在途腿丢失）`)
    await applyStockDelta(token, { productId, binId: Number(transitBin.id), lotId }, -qty)
    const target = stocks.find(row => row.product_id === productId && row.bin_id === toBinId && row.lot_id === lotId)
    if (target === undefined) {
      await dataOf(token, 'POST', '/api/wms_stock:create', {
        product: { id: productId }, bin: { id: toBinId }, lot: { id: lotId }, status: 'good',
        qty_on_hand: qty, qty_allocated: 0, qty_locked: 0, qty_available: qty, version: 1,
      })
    } else {
      await applyStockDelta(token, { productId, binId: toBinId, lotId }, qty)
    }
    await appendMovement(token, {
      move_type: 'MOVE', doc_no: transferNo, product: { id: productId }, lot: { id: lotId },
      from_bin: { id: Number(transitBin.id) }, to_bin: { id: toBinId }, qty, note: `两步移库·入库段（${TRANSIT_ZONE_CODE} → 目标）`,
    })
    await appendMovement(token, {
      move_type: 'MOVE', doc_no: transferNo, product: { id: productId }, lot: { id: lotId },
      from_bin: { id: Number(transitBin.id) }, qty: -qty, note: '两步移库·入库段（在途出）',
    })
    await dataOf(token, 'POST', `/api/wms_transfers:update?filterByTk=${transfer.id}`, { status: 'completed' })
    console.log(`nocobase-h5: transfer ${transferNo} leg-in posted — 在途 −${String(qty)} → 目标 +${String(qty)}, ±MOVE pair appended, completed`)
    return
  }
  if (transfer.status !== 'draft' && transfer.status !== 'pending') {
    throw new Error(`移库单 ${transferNo} 状态为 ${String(transfer.status)}，仅草稿/待执行可过账`)
  }
  // Leg one (both modes): source −qty with the hold/virtual guards.
  const sourceStock = stocks.find(row => row.product_id === productId && row.bin_id === fromBinId && row.lot_id === lotId)
  if (sourceStock === undefined) throw new Error(`源库位无该批次库存行（product ${String(productId)} × bin ${String(fromBinId)} × lot ${String(lotId)}）`)
  if (sourceStock.status === 'hold') throw new Error(`待检批次禁移：源库位库存为待检（hold）状态，IQC 放行前不可移库（${transferNo}）`)
  if (sourceStock.status === 'blocked') throw new Error(`冻结批次禁移：源库位库存为冻结（blocked）状态（${transferNo}）`)
  const sourceZone = await zoneCodeOfBin(zones, bins, fromBinId)
  if (sourceZone === LOSS_ZONE_CODE || sourceZone === TRANSIT_ZONE_CODE) {
    throw new Error(`虚拟库位禁作移库源（${sourceZone}）：差异/在途库位只作引擎对手方（${transferNo}）`)
  }
  const available = Number(sourceStock.qty_available ?? 0)
  if (available < qty) throw new Error(`源库位可用量不足：需 ${String(qty)}，可用 ${String(available)}（已分配/锁定不可移；${transferNo}）`)
  const targetZone = await zoneCodeOfBin(zones, bins, toBinId)
  if (targetZone === QUARANTINE_ZONE_CODE || targetZone === LOSS_ZONE_CODE || targetZone === TRANSIT_ZONE_CODE) {
    throw new Error(`目标库位不可为待检/差异/在途区（${targetZone}）：待检区只经 IQC 收货分流进入（${transferNo}）`)
  }
  const moveTo = twoStep && leg === 'out' ? Number(transitBin.id) : toBinId
  await applyStockDelta(token, { productId, binId: fromBinId, lotId }, -qty)
  const target = stocks.find(row => row.product_id === productId && row.bin_id === moveTo && row.lot_id === lotId)
  if (target === undefined) {
    await dataOf(token, 'POST', '/api/wms_stock:create', {
      product: { id: productId }, bin: { id: moveTo }, lot: { id: lotId }, status: 'good',
      qty_on_hand: qty, qty_allocated: 0, qty_locked: 0, qty_available: qty, version: 1,
    })
  } else {
    await applyStockDelta(token, { productId, binId: moveTo, lotId }, qty)
  }
  await appendMovement(token, {
    move_type: 'MOVE', doc_no: transferNo, product: { id: productId }, lot: { id: lotId },
    from_bin: { id: fromBinId }, qty: -qty, note: twoStep ? '移库出（源→在途）' : '移库出（源→目标）',
  })
  await appendMovement(token, {
    move_type: 'MOVE', doc_no: transferNo, product: { id: productId }, lot: { id: lotId },
    to_bin: { id: moveTo }, qty, note: twoStep ? `移库入（源→在途 ${TRANSIT_ZONE_CODE}）` : '移库入（源→目标）',
  })
  const nextStatus = twoStep && leg === 'out' ? 'in_transit' : 'completed'
  await dataOf(token, 'POST', `/api/wms_transfers:update?filterByTk=${transfer.id}`, { status: nextStatus })
  console.log(`nocobase-h5: transfer ${transferNo} posted — 源 −${String(qty)} → ${twoStep && leg === 'out' ? '在途' : '目标'} +${String(qty)}, ±MOVE pair appended, ${nextStatus}`)
}

/** The ATP snapshot one product's good stock carries: on-hand / allocated / locked / available sums. */
async function atpSnapshot(token: string, sku: string): Promise<{ product: Record<string, any>, rows: Array<Record<string, any>>, onHand: number, allocated: number, locked: number, available: number }> {
  const products = await rowsOf(token, 'hub_inv_products', 200)
  const product = products.find(row => row.sku === sku)
  if (product === undefined) throw new Error(`no hub_inv_products row with sku=${sku}`)
  const rows = (await rowsOf(token, 'wms_stock', 500)).filter(row => row.product_id === product.id && row.status === 'good')
  const sum = (field: string): number => rows.reduce((total, row) => total + Number(row[field] ?? 0), 0)
  return { product, rows, onHand: sum('qty_on_hand'), allocated: sum('qty_allocated'), locked: sum('qty_locked'), available: sum('qty_available') }
}

/** Print one product's ATP picture (--atp). */
async function printAtp(token: string, sku: string): Promise<number> {
  const snapshot = await atpSnapshot(token, sku)
  const activeReserved = (await rowsOf(token, 'wms_reservations'))
    .filter(row => Number(row.product_id) === Number(snapshot.product.id) && row.status === 'reserved')
    .reduce((total, row) => total + Number(row.qty ?? 0), 0)
  console.log(`nocobase-h5: ATP ${sku}（${String(snapshot.product.name)}）`)
  console.log(`  现有 ${String(snapshot.onHand)} − 已分配 ${String(snapshot.allocated)}（其中预留表 reserved ${String(activeReserved)}）− 锁定 ${String(snapshot.locked)} = 可用 ${String(snapshot.available)}`)
  for (const row of snapshot.rows) {
    console.log(`  行 #${String(row.id)}：on_hand ${String(row.qty_on_hand)} / allocated ${String(row.qty_allocated)} / locked ${String(row.qty_locked)} / available ${String(row.qty_available)}（version ${String(row.version)}）`)
  }
  return snapshot.available
}

/**
 * B4 phase one: create one hard reservation. ATP (Σ good-stock
 * qty_available) gates the quantity; the FEFO pick fills lot/bin at creation
 * (the two-phase design's light form — the pick is recorded now, consumption
 * lands later), and the chosen row's qty_allocated grows under its version
 * gate. Over-reservation refuses loud with the ATP number.
 */
export async function reserve(token: string, code: string, refType: string, refId: string, sku: string, qty: number): Promise<void> {
  if (qty <= 0) throw new Error('预留数量必须为正数')
  const existingRes = (await rowsOf(token, 'wms_reservations')).find(row => row.code === code)
  if (existingRes !== undefined) {
    console.log(`nocobase-h5: reservation ${code} already exists (${String(existingRes.status)}; kept)`)
    return
  }
  if (!['SO', 'MO', 'SHIPMENT'].includes(refType)) throw new Error(`预留关联类型必须为 SO|MO|SHIPMENT（收到 ${refType}）`)
  const snapshot = await atpSnapshot(token, sku)
  if (snapshot.available < qty) {
    throw new Error(`超额预留被拒：${sku} 当前可用量 ${String(snapshot.available)} < 需求 ${String(qty)}（现有 ${String(snapshot.onHand)} − 已分配 ${String(snapshot.allocated)} − 锁定 ${String(snapshot.locked)}）`)
  }
  // The FEFO pick: the earliest-removal lot row whose available covers the ask.
  const lots = await rowsOf(token, 'wms_lots')
  const lotsById = new Map(lots.map(row => [Number(row.id), row]))
  const candidates = snapshot.rows
    .map(row => ({ row, lot: lotsById.get(Number(row.lot_id)) }))
    .filter(entry => entry.lot !== undefined && entry.lot.status === 'qualified' && String(entry.lot.expiry_date ?? '') > new Date().toISOString().slice(0, 10))
    .sort((a, b) => String(a.lot?.removal_date ?? '').localeCompare(String(b.lot?.removal_date ?? '')) || Number(b.row.qty_available) - Number(a.row.qty_available))
  const pick = candidates.find(entry => Number(entry.row.qty_available ?? 0) >= qty)
  if (pick === undefined) {
    throw new Error(`FEFO 无单行足额批次可预留（${sku} × ${String(qty)}）：最大单行可用 ${String(candidates.reduce((max, entry) => Math.max(max, Number(entry.row.qty_available ?? 0)), 0))}，需拆分预留（B6 齐套扩展）`)
  }
  await dataOf(token, 'POST', '/api/wms_reservations:create', {
    code, ref_type: refType, ref_id: refId,
    product: { id: Number(snapshot.product.id) }, bin: { id: Number(pick.row.bin_id) }, lot: { id: Number(pick.row.lot_id) },
    qty, status: 'reserved',
  })
  await applyAllocationDelta(token, pick.row, qty)
  console.log(`nocobase-h5: reservation ${code} reserved — ${sku} × ${String(qty)} → 批次 ${String(pick.lot?.lot_no)}（应下架日 ${String(pick.lot?.removal_date).slice(0, 10)}），ATP ${String(snapshot.available)} → ${String(snapshot.available - qty)}`)
}

/** B4: release one reserved reservation — the ATP recovers. */
async function releaseReservation(token: string, code: string): Promise<void> {
  const reservations = await rowsOf(token, 'wms_reservations')
  const reservation = reservations.find(row => row.code === code)
  if (reservation === undefined) throw new Error(`no reservation ${code}`)
  if (reservation.status !== 'reserved') {
    console.log(`nocobase-h5: reservation ${code} already ${String(reservation.status)} (kept)`)
    return
  }
  const stock = (await rowsOf(token, 'wms_stock', 500)).find(row => row.bin_id === Number(reservation.bin_id) && row.lot_id === Number(reservation.lot_id) && row.product_id === Number(reservation.product_id))
  if (stock === undefined) throw new Error(`预留 ${code} 的库存行已不存在（bin ${String(reservation.bin_id)}）`)
  await applyAllocationDelta(token, stock, -Number(reservation.qty))
  await dataOf(token, 'POST', `/api/wms_reservations:update?filterByTk=${reservation.id}`, { status: 'released', released_at: new Date().toISOString().slice(0, 10) })
  console.log(`nocobase-h5: reservation ${code} released — 可用量恢复 +${String(reservation.qty)}`)
}

/** B4 phase two: consume on issue — the allocation returns, the on-hand write belongs to the posting leg (B6/B7). */
export async function consumeReservation(token: string, code: string): Promise<void> {
  const reservations = await rowsOf(token, 'wms_reservations')
  const reservation = reservations.find(row => row.code === code)
  if (reservation === undefined) throw new Error(`no reservation ${code}`)
  if (reservation.status !== 'reserved') {
    console.log(`nocobase-h5: reservation ${code} already ${String(reservation.status)} (kept)`)
    return
  }
  const stock = (await rowsOf(token, 'wms_stock', 500)).find(row => row.bin_id === Number(reservation.bin_id) && row.lot_id === Number(reservation.lot_id) && row.product_id === Number(reservation.product_id))
  if (stock !== undefined) await applyAllocationDelta(token, stock, -Number(reservation.qty))
  await dataOf(token, 'POST', `/api/wms_reservations:update?filterByTk=${reservation.id}`, { status: 'consumed' })
  console.log(`nocobase-h5: reservation ${code} consumed — 分配量回退，出库过账由发货/领料腿完成`)
}

/**
 * B4: the engine-side manual adjust (--post-adjust) — one ADJUST movement
 * with the Inventory-Loss bin as the opponent leg; the ROP demo and any
 * corrective write ride it instead of touching wms_stock directly.
 */
async function postAdjust(token: string, sku: string, lotNo: string, binCode: string, delta: number): Promise<void> {
  if (delta === 0) throw new Error('调整量不可为 0')
  const products = await rowsOf(token, 'hub_inv_products', 200)
  const product = products.find(row => row.sku === sku)
  if (product === undefined) throw new Error(`no hub_inv_products row with sku=${sku}`)
  const lots = await rowsOf(token, 'wms_lots')
  const lot = lots.find(row => row.lot_no === lotNo && row.product_id === product.id)
  if (lot === undefined) throw new Error(`no lot ${lotNo} on ${sku}`)
  const bins = await rowsOf(token, 'wms_bins', 200)
  const bin = bins.find(row => row.code === binCode)
  const lossBin = bins.find(row => row.code === `${LOSS_ZONE_CODE}-01-01`)
  if (bin === undefined || lossBin === undefined) throw new Error(`库位 ${binCode} 或差异库位缺失`)
  const stocks = await rowsOf(token, 'wms_stock', 500)
  const stock = stocks.find(row => row.product_id === product.id && row.bin_id === bin.id && row.lot_id === lot.id)
  if (stock === undefined) throw new Error(`${binCode} 无 ${sku}×${lotNo} 库存行，调整需先有库存`)
  if (Number(stock.qty_on_hand ?? 0) + delta < 0) {
    throw new Error(`调整将使库存为负：${sku}@${binCode} 现有 ${String(stock.qty_on_hand)}，调整 ${String(delta)} 后为 ${String(Number(stock.qty_on_hand) + delta)}，拒绝`)
  }
  const adjustNo = `ADJ-${new Date().toISOString().slice(0, 10).replaceAll('-', '')}-${String(Date.now()).slice(-5)}`
  await applyStockDelta(token, { productId: Number(product.id), binId: Number(bin.id), lotId: Number(lot.id) }, delta)
  await appendMovement(token, {
    move_type: 'ADJUST', doc_no: adjustNo,
    product: { id: Number(product.id) }, lot: { id: Number(lot.id) },
    ...(delta > 0
      ? { from_bin: { id: Number(lossBin.id) }, to_bin: { id: Number(bin.id) } }
      : { from_bin: { id: Number(bin.id) }, to_bin: { id: Number(lossBin.id) } }),
    qty: delta, note: `手工调整（对手 ${LOSS_ZONE_CODE}）`,
  })
  console.log(`nocobase-h5: adjust ${adjustNo} posted — ${sku}×${lotNo}@${binCode} ${delta > 0 ? '+' : ''}${String(delta)}（对手差异库位）`)
}

/**
 * B4: scan every product carrying a reorder_point — ATP at or below the
 * point upserts one open suggestion (suggest_qty tops the pool back up to
 * reorder_point + lot_size, rounded to whole lot_size multiples; Odoo
 * min/max semantics). Idempotent per product while a row stays open.
 */
export async function scanReorder(token: string): Promise<number> {
  const products = (await rowsOf(token, 'hub_inv_products', 200)).filter(row => Number(row.reorder_point ?? 0) > 0)
  const stocks = await rowsOf(token, 'wms_stock', 500)
  const suggestions = await rowsOf(token, 'wms_reorder_suggestions', 200)
  const today = new Date().toISOString().slice(0, 10)
  let created = 0
  let refreshed = 0
  for (const product of products) {
    const rows = stocks.filter(row => row.product_id === product.id && row.status === 'good')
    const atp = rows.reduce((total, row) => total + Number(row.qty_available ?? 0), 0)
    const min = Number(product.reorder_point)
    if (atp > min) continue
    const lotSize = Math.max(1, Number(product.lot_size ?? 1))
    const target = min + lotSize
    const suggestQty = Math.max(lotSize, Math.ceil((target - atp) / lotSize) * lotSize)
    const open = suggestions.find(row => Number(row.product_id) === Number(product.id) && row.status === 'open')
    const note = `ATP ${String(atp)} ≤ 再订货点 ${String(min)}；补至目标 ${String(target)}（ROP+批量），按批量 ${String(lotSize)} 取整`
    if (open !== undefined) {
      await dataOf(token, 'POST', `/api/wms_reorder_suggestions:update?filterByTk=${open.id}`, {
        on_hand_atp: atp, min, suggest_qty: suggestQty, suggested_at: today, note,
      })
      refreshed += 1
      continue
    }
    await dataOf(token, 'POST', '/api/wms_reorder_suggestions:create', {
      product: { id: Number(product.id) }, on_hand_atp: atp, min, suggest_qty: suggestQty,
      status: 'open', suggested_at: today, note,
    })
    created += 1
    console.log(`nocobase-h5: [scan] ${String(product.sku)}（${String(product.name)}）ATP ${String(atp)} ≤ ROP ${String(min)} → 建议补 ${String(suggestQty)}`)
  }
  // W5-B4/BP-07: ATP recovery closes stale rows — an open (or off-platform
  // confirmed) suggestion whose product is back above its reorder point no
  // longer lingers in the shortage counts.
  let staleClosed = 0
  for (const row of suggestions.filter(entry => entry.status === 'open' || entry.status === 'confirmed')) {
    const pid = Number(row.product_id)
    const atpNow = stocks.filter(entry => Number(entry.product_id) === pid && entry.status === 'good')
      .reduce((total, entry) => total + Number(entry.qty_available ?? 0), 0)
    if (atpNow > Number(row.min ?? 0)) {
      await dataOf(token, 'POST', `/api/wms_reorder_suggestions:update?filterByTk=${row.id}`, {
        status: 'dismissed',
        note: `${String(row.note ?? '')}；ATP 回升至 ${String(atpNow)} > 再订货点 ${String(row.min)}，自动关闭（W5-B4）`,
      })
      staleClosed += 1
      console.log(`nocobase-h5: [scan] 建议行 #${String(row.id)} ATP 回升（${String(atpNow)}）自动关闭`)
    }
  }
  console.log(`nocobase-h5: scan-reorder done — ${String(created)} open suggestion(s) created, ${String(refreshed)} refreshed, ${String(staleClosed)} stale row(s) closed, ${String(products.length)} policy product(s) scanned`)
  return created
}

/**
 * B4: post one count's difference — the callback the approval workflow's
 * request node hits (and the CLI). Validates the count sits in a
 * pre-done state, writes the ADJUST movement against the Inventory-Loss
 * bin, corrects stock through applyStockDelta, and lands status=done (the
 * workflow's follow-up update node is idempotent).
 */
export async function postCountAdjust(token: string, countNo: string): Promise<void> {
  const counts = await rowsOf(token, 'wms_counts')
  const count = counts.find(row => row.count_no === countNo)
  if (count === undefined) throw new Error(`no count ${countNo}`)
  if (count.status === 'done') {
    console.log(`nocobase-h5: count ${countNo} already done (kept; adjust is single-shot)`)
    return
  }
  if (count.status !== 'difference' && count.status !== 'adjusting') {
    throw new Error(`盘点单 ${countNo} 状态为 ${String(count.status)}，需先录入实盘并置为差异确认（difference）`)
  }
  const counted = count.counted_qty === null || count.counted_qty === undefined ? null : Number(count.counted_qty)
  if (counted === null) throw new Error(`盘点单 ${countNo} 尚无实盘数（counted_qty 为空）`)
  const difference = Number(count.difference ?? counted - Number(count.snapshot_qty ?? 0))
  if (difference === 0) throw new Error(`盘点单 ${countNo} 无差异（实盘 ${String(counted)} = 账面 ${String(count.snapshot_qty)}），无需调整`)
  const productId = Number(count.product_id)
  const lotId = Number(count.lot_id)
  const binId = Number(count.bin_id)
  if (!Number.isInteger(productId) || !Number.isInteger(lotId) || !Number.isInteger(binId)) {
    throw new Error(`盘点单 ${countNo} 的物料/批次/库位列不全，无法回写`)
  }
  const bins = await rowsOf(token, 'wms_bins', 200)
  const lossBin = bins.find(row => row.code === `${LOSS_ZONE_CODE}-01-01`)
  if (lossBin === undefined) throw new Error(`差异库位 ${LOSS_ZONE_CODE}-01-01 缺失——重跑 nocobase-h5-wms.mts 补 B4 种子`)
  const stocks = await rowsOf(token, 'wms_stock', 500)
  const stock = stocks.find(row => row.product_id === productId && row.bin_id === binId && row.lot_id === lotId)
  if (stock === undefined) {
    if (difference < 0) throw new Error(`盘点单 ${countNo} 报盘亏但库位已无库存行（数据不一致，人工核查）`)
    await dataOf(token, 'POST', '/api/wms_stock:create', {
      product: { id: productId }, bin: { id: binId }, lot: { id: lotId }, status: 'good',
      qty_on_hand: difference, qty_allocated: 0, qty_locked: 0, qty_available: difference, version: 1,
    })
  } else {
    await applyStockDelta(token, { productId, binId, lotId }, difference)
  }
  await appendMovement(token, {
    move_type: 'COUNT_ADJUST', doc_no: countNo,
    product: { id: productId }, lot: { id: lotId },
    ...(difference > 0
      ? { from_bin: { id: Number(lossBin.id) }, to_bin: { id: binId } }
      : { from_bin: { id: binId }, to_bin: { id: Number(lossBin.id) } }),
    qty: difference, note: `盘点差异回写（对手 ${LOSS_ZONE_CODE}；实盘 ${String(counted)} vs 账面 ${String(count.snapshot_qty)}）`,
  }, docEncodedDate(countNo) ?? shanghaiToday())
  await dataOf(token, 'POST', `/api/wms_counts:update?filterByTk=${count.id}`, { status: 'done', difference })
  console.log(`nocobase-h5: count ${countNo} adjusted — 差异 ${difference > 0 ? '+' : ''}${String(difference)} 过账（对手差异库位），库存已修正，status=done`)
}

/**
 * B4: freeze cycle-count documents for one bin — every good stock row on the
 * bin gets a counting row whose snapshot_qty rides the current on-hand
 * (the freeze; later postings still move stock, the difference lands against
 * the frozen number), abc_class copied from the product register.
 */
async function genCount(token: string, binCode: string): Promise<string[]> {
  const bins = await rowsOf(token, 'wms_bins', 200)
  const bin = bins.find(row => row.code === binCode)
  if (bin === undefined) throw new Error(`no bin ${binCode}`)
  const stocks = (await rowsOf(token, 'wms_stock', 500)).filter(row => row.bin_id === bin.id && row.status === 'good')
  if (stocks.length === 0) throw new Error(`库位 ${binCode} 无良品库存行，无可盘点对象`)
  const products = await rowsOf(token, 'hub_inv_products', 200)
  const lots = await rowsOf(token, 'wms_lots')
  const counts = await rowsOf(token, 'wms_counts', 500)
  const dateTag = new Date().toISOString().slice(0, 10).replaceAll('-', '')
  const created: string[] = []
  for (const stock of stocks) {
    const product = products.find(row => Number(row.id) === Number(stock.product_id))
    const lot = lots.find(row => Number(row.id) === Number(stock.lot_id))
    const countNo = `CNT-${dateTag}-${String(bin.id).padStart(3, '0')}${String(stock.lot_id ?? 0).padStart(4, '0')}`
    if (counts.some(row => row.count_no === countNo) || created.includes(countNo)) continue
    await dataOf(token, 'POST', '/api/wms_counts:create', {
      count_no: countNo, count_type: 'cycle', status: 'counting',
      zone: { id: Number(bin.zone_id) }, bin: { id: Number(bin.id) },
      product: { id: Number(stock.product_id) }, lot: { id: Number(stock.lot_id) },
      abc_class: product?.abc_class ?? null,
      snapshot_qty: Number(stock.qty_on_hand ?? 0), counted_qty: null, difference: null,
      note: `循环盘点（B4 冻结快照 ${String(stock.qty_on_hand)}；ABC ${String(product?.abc_class ?? '未分')}/${String(lot?.lot_no ?? '')}）`,
    })
    created.push(countNo)
    console.log(`nocobase-h5: [gen-count] ${countNo} — ${String(product?.sku)}×${String(lot?.lot_no)}@${binCode} 快照 ${String(stock.qty_on_hand)}（counting）`)
  }
  if (created.length === 0) console.log('nocobase-h5: [gen-count] 全部盘点单已存在（kept）')
  return created
}

/**
 * B4: the generalized ledger rebalance — per (product, lot), one ADJUST row
 * closes stock Σ − movements Σ (opening-balance gaps and pre-B4 engine
 * shapes alike), and orphan ledger groups with no stock row get a cancel
 * row against the Inventory-Loss bin. Never edits history; idempotent by
 * construction (a balanced world emits nothing).
 */
async function rebalanceLedger(token: string): Promise<void> {
  const stocks = await rowsOf(token, 'wms_stock', 500)
  const movements = await rowsOf(token, 'wms_movements', 1000)
  const bins = await rowsOf(token, 'wms_bins', 200)
  const lossBin = bins.find(row => row.code === `${LOSS_ZONE_CODE}-01-01`)
  if (lossBin === undefined) {
    throw new Error(`差异库位 ${LOSS_ZONE_CODE}-01-01 缺失——先跑 nocobase-h5-wms.mts 主流程补 B4 虚拟库位种子`)
  }
  const ledger = new Map<string, number>()
  for (const move of movements) {
    const key = `${String(move.product_id)}:${String(move.lot_id)}`
    ledger.set(key, (ledger.get(key) ?? 0) + Number(move.qty ?? 0))
  }
  const stockSums = new Map<string, number>()
  for (const row of stocks) {
    const key = `${String(row.product_id)}:${String(row.lot_id)}`
    stockSums.set(key, (stockSums.get(key) ?? 0) + Number(row.qty_on_hand ?? 0))
  }
  let emitted = 0
  let seq = Date.now() % 100_000
  for (const [key, stockSum] of stockSums) {
    const drift = stockSum - (ledger.get(key) ?? 0)
    if (Math.abs(drift) < 0.01) continue
    const [productId, lotId] = key.split(':').map(Number)
    const homeBin = stocks.find(row => Number(row.product_id) === productId && Number(row.lot_id) === lotId)
    await appendMovement(token, {
      move_type: 'ADJUST', doc_no: `BAL-${productId}-${lotId}-${String(seq++)}`,
      product: { id: productId }, lot: { id: lotId },
      ...(homeBin === undefined ? {} : { to_bin: { id: Number(homeBin.bin_id) } }),
      qty: drift, note: '台账对齐（库存与流水差额补偿，不改历史移动）',
    })
    emitted += 1
  }
  for (const [key, sum] of ledger) {
    if (stockSums.has(key) || Math.abs(sum) < 0.01) continue
    const [productId, lotId] = key.split(':').map(Number)
    await appendMovement(token, {
      move_type: 'ADJUST', doc_no: `BAL-${productId}-${lotId}-${String(seq++)}`,
      product: { id: productId }, lot: { id: lotId },
      from_bin: { id: Number(lossBin.id) }, qty: -sum, note: '孤儿流水冲销（有流水无库存行，对手差异库位）',
    })
    emitted += 1
  }
  console.log(`nocobase-h5: ledger rebalance ${emitted > 0 ? `${emitted} compensation row(s) emitted` : 'already balanced (kept)'}`)
}

/**
 * B4: the ledger invariant — per (product, lot), Σ movements.qty must equal
 * Σ wms_stock.qty_on_hand (float tolerance 0.01). This is the verify-gate
 * assertion; any bypass write turns it red.
 */
export async function assertLedgerBalanced(token: string): Promise<void> {
  const stocks = await rowsOf(token, 'wms_stock', 500)
  const movements = await rowsOf(token, 'wms_movements', 1000)
  const ledger = new Map<string, number>()
  for (const move of movements) {
    const key = `${String(move.product_id)}:${String(move.lot_id)}`
    ledger.set(key, (ledger.get(key) ?? 0) + Number(move.qty ?? 0))
  }
  const stockSums = new Map<string, number>()
  for (const row of stocks) {
    const key = `${String(row.product_id)}:${String(row.lot_id)}`
    stockSums.set(key, (stockSums.get(key) ?? 0) + Number(row.qty_on_hand ?? 0))
  }
  const drift: string[] = []
  for (const [key, sum] of stockSums) {
    if (Math.abs(sum - (ledger.get(key) ?? 0)) > 0.01) {
      drift.push(`${key}: stock Σ=${String(sum)} vs movements Σ=${String(ledger.get(key) ?? 0)}`)
    }
  }
  for (const [key, sum] of ledger) {
    if (!stockSums.has(key) && Math.abs(sum) > 0.01) {
      drift.push(`${key}: movements Σ=${String(sum)} but no stock row`)
    }
  }
  if (drift.length > 0) {
    throw new Error(`库存对账失败（stock == Σmovements 被破坏，疑似旁路写入）：\n  - ${drift.join('\n  - ')}`)
  }
  console.log(`nocobase-h5: ledger balanced — stock == Σmovements per (product, lot)，${String(stockSums.size)} 组，${String(movements.length)} 条流水`)
}

// ─── W2-B3: the business-date column — backfill, monthly replay, snapshots ───

/**
 * The YYYY-MM-DD a document number encodes ('' when the prefix carries no
 * date segment). Covers every doc family this domain mints: RCV-/SHP-/TRF-/
 * CNT-/ADJ-YYYYMMDD-nnnn.
 */
export function docEncodedDate(docNo: string): string | undefined {
  const raw = /(?:^|-)(\d{4})(\d{2})(\d{2})-(?:\d+)$/.exec(String(docNo))
  if (raw === null) return undefined
  const date = `${raw[1]!}-${raw[2]!}-${raw[3]!}`
  return Number.isNaN(Date.parse(date)) ? undefined : date
}

/**
 * W2-B3: the one-shot biz_date backfill. Priority ladder per row: the
 * related document's business date (receipts.received_at / so_orders
 * .shipped_at) > the doc_no-encoded date > id-order linear interpolation
 * between resolved anchors (note tagged `estimated`). This world's tables
 * carry no system createdAt (the collections were created without
 * timestamps), so id order is the only remaining monotone clock — the
 * anchors make the interpolation exact inside a single demo-day run and
 * month-correct across runs. Runs in month shards, then asserts zero NULL
 * rows on both wms_movements and wms_counts, and prints the counts column
 * vs CNT-code diff list (the column wins; the code stays a validator).
 */
export async function backfillBizDates(token: string): Promise<void> {
  const receipts = await rowsOf(token, 'wms_receipts')
  const soOrders = await rowsOf(token, 'so_orders')
  const receivedAt = new Map(receipts.map(row => [String(row.receipt_no), String(row.received_at ?? '').slice(0, 10)]))
  const shippedAt = new Map(soOrders.map(row => [String(row.code), String(row.shipped_at ?? '').slice(0, 10)]))
  const resolveDoc = (docNo: string): string | undefined => {
    const doc = String(docNo ?? '')
    if (receivedAt.has(doc) && String(receivedAt.get(doc) ?? '') > '') return receivedAt.get(doc)
    if (shippedAt.has(doc) && String(shippedAt.get(doc) ?? '') > '') return shippedAt.get(doc)
    return docEncodedDate(doc)
  }
  // Movements: resolve every row, interpolate the leftovers between id anchors.
  const movements = await rowsOf(token, 'wms_movements', 1000)
  const resolved = new Map<number, string>()
  for (const move of movements) {
    const date = resolveDoc(String(move.doc_no ?? ''))
    if (date !== undefined) resolved.set(Number(move.id), date)
  }
  const sortedIds = [...movements].sort((a, b) => Number(a.id) - Number(b.id))
  const anchors = sortedIds.filter(row => resolved.has(Number(row.id)))
  if (anchors.length >= 2) {
    const first = Number(anchors[0]!.id), last = Number(anchors[anchors.length - 1]!.id)
    const firstDate = Date.parse(resolved.get(first)!), lastDate = Date.parse(resolved.get(last)!)
    for (const row of sortedIds) {
      const id = Number(row.id)
      if (resolved.has(id) || id < first || id > last) continue
      const ratio = (id - first) / Math.max(1, last - first)
      const interpolated = new Date(Math.round(firstDate + ratio * (lastDate - firstDate))).toISOString().slice(0, 10)
      resolved.set(id, interpolated)
      await dataOf(token, 'POST', `/api/wms_movements:update?filterByTk=${row.id}`, {
        biz_date: interpolated, note: `${String(row.note ?? '')}；biz_date estimated（id 序内插，锚点 ${String(resolved.get(first))}~${String(resolved.get(last))}）`,
      })
    }
  }
  // Month-sharded updates for the directly-resolved rows (one pass per month).
  const shards = new Map<string, number[]>()
  for (const [id, date] of resolved) {
    const month = date.slice(0, 7)
    if (!shards.has(month)) shards.set(month, [])
    shards.get(month)!.push(id)
  }
  for (const [month, ids] of [...shards.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    for (const id of ids) {
      await dataOf(token, 'POST', `/api/wms_movements:update?filterByTk=${id}`, { biz_date: resolved.get(id) })
    }
    console.log(`nocobase-h5: [backfill] ${month} — ${String(ids.length)} 行 biz_date 落列`)
  }
  // Counts: the CNT-YYYYMMDD segment is the count's own business key; rows
  // without it (hand-minted demo keys) interpolate the same way.
  const counts = await rowsOf(token, 'wms_counts', 500)
  const countDates = new Map<number, string>()
  for (const row of counts) {
    const encoded = docEncodedDate(String(row.count_no ?? ''))
    if (encoded !== undefined) countDates.set(Number(row.id), encoded)
  }
  {
    const sortedCountIds = [...counts].sort((a, b) => Number(a.id) - Number(b.id))
    const countAnchors = sortedCountIds.filter(row => countDates.has(Number(row.id)))
    if (countAnchors.length >= 2) {
      const first = Number(countAnchors[0]!.id), last = Number(countAnchors[countAnchors.length - 1]!.id)
      const firstDate = Date.parse(countDates.get(first)!), lastDate = Date.parse(countDates.get(last)!)
      for (const row of sortedCountIds) {
        const id = Number(row.id)
        if (countDates.has(id)) continue
        const ratio = (Math.min(Math.max(id, first), last) - first) / Math.max(1, last - first)
        countDates.set(id, new Date(Math.round(firstDate + ratio * (lastDate - firstDate))).toISOString().slice(0, 10))
      }
    } else if (countAnchors.length === 1 && counts.length > 0) {
      for (const row of counts) countDates.set(Number(row.id), countDates.get(Number(countAnchors[0]!.id))!)
    }
  }
  for (const [id, date] of countDates) {
    await dataOf(token, 'POST', `/api/wms_counts:update?filterByTk=${id}`, { biz_date: date })
  }
  console.log(`nocobase-h5: [backfill] wms_counts ${String(countDates.size)} 行 biz_date 落列`)
  // The zero-NULL assertion on both columns (the Contract-phase stand-in).
  const movementsNow = await rowsOf(token, 'wms_movements', 1000)
  const countsNow = await rowsOf(token, 'wms_counts', 500)
  const nullMoves = movementsNow.filter(row => String(row.biz_date ?? '') === '')
  const nullCounts = countsNow.filter(row => String(row.biz_date ?? '') === '')
  if (nullMoves.length > 0 || nullCounts.length > 0) {
    throw new Error(`回填归零断言失败：wms_movements NULL ${String(nullMoves.length)} 行、wms_counts NULL ${String(nullCounts.length)} 行（样例 ${String(nullMoves[0]?.doc_no ?? nullCounts[0]?.count_no ?? '')}）`)
  }
  const estimated = movementsNow.filter(row => String(row.note ?? '').includes('biz_date estimated'))
  console.log(`nocobase-h5: [backfill] 归零断言 ✓ movements ${String(movementsNow.length)}/${String(movementsNow.length)} 非空（estimated ${String(estimated.length)} 行），counts ${String(countsNow.length)}/${String(countsNow.length)} 非空`)
  // The counts column-vs-code validator diff (the column wins on conflict).
  const conflicts = countsNow
    .map(row => ({ no: String(row.count_no), column: String(row.biz_date ?? ''), code: docEncodedDate(String(row.count_no)) ?? '' }))
    .filter(row => row.code !== '' && row.code !== row.column)
  console.log(`nocobase-h5: [backfill] counts 列 vs 编码 diff：${String(conflicts.length)} 行不一致${conflicts.length > 0 ? `（以列为准：${conflicts.map(row => `${row.no} 列=${row.column} 码=${row.code}`).join('；')}）` : ''}`)
}

/** One movement row's replay slice (the monthly aggregate's only inputs). */
export interface MovementFact { id: number, product_id: number, qty: number, biz_date: string }

/** One product's monthly opening/in/out/bal quantity quartet. */
export interface MonthlyBalanceRow {
  productId: number, period: string,
  openingQty: number, inQty: number, outQty: number, balQty: number,
}

/**
 * The six-class receipt/issue classification one movement falls into for the
 * ledger page: 收 = every positive leg (采购入库 PUTAWAY/RECEIPT、生产入库
 * RECEIPT_MFG、退料回库 RETURN_WIP 正腿、盘盈 ADJUST/COUNT_ADJUST 正向、
 * 调拨入腿 MOVE/ISSUE_WIP 正腿), 发 = every negative leg (销售出库 SHIP/
 * SHIPMENT_SO、领料出 ISSUE_WIP 负腿、退供 RETURN_VENDOR、报废 SCRAP、盘亏
 * 负向、调拨出腿). Paired legs (MOVE/ISSUE_WIP/RETURN_WIP ±对) book equal
 * amounts into both sides, so their net — and therefore bal — is zero, which
 * is the 调拨成对 column of the research mapping; in−out always equals the
 * month's net flow regardless of class, so the identity holds by
 * construction (in = Σ正腿, out = Σ|负腿|, 期初+收−发=期末 ≡ 期初+净额).
 */
export function classifyMovement(qty: number): 'in' | 'out' {
  return qty >= 0 ? 'in' : 'out'
}

/**
 * W2-B3: the pure monthly replay. For every product and every period from
 * the earliest movement month through `through`: opening = the net flow
 * before the month's first day (the first month opens at the ledger's own
 * net), in/out = the month's positive/negative leg sums, bal = opening +
 * in − out. Sorting rides (biz_date, id) so same-day postings replay in
 * append order.
 */
export function monthlyBalancesOf(movements: ReadonlyArray<MovementFact>, through: string): MonthlyBalanceRow[] {
  const byProduct = new Map<number, MovementFact[]>()
  for (const move of movements) {
    if (!byProduct.has(move.product_id)) byProduct.set(move.product_id, [])
    byProduct.get(move.product_id)!.push(move)
  }
  const rows: MonthlyBalanceRow[] = []
  for (const [productId, list] of byProduct) {
    const ordered = [...list].sort((a, b) => a.biz_date.localeCompare(b.biz_date) || a.id - b.id)
    const periods = [...new Set(ordered.map(move => move.biz_date.slice(0, 7)))].filter(period => period <= through).sort()
    for (const period of periods) {
      const before = ordered.filter(move => move.biz_date.slice(0, 7) < period)
      const inside = ordered.filter(move => move.biz_date.slice(0, 7) === period)
      const opening = before.reduce((total, move) => total + move.qty, 0)
      const inQty = inside.filter(move => classifyMovement(move.qty) === 'in').reduce((total, move) => total + move.qty, 0)
      const outQty = inside.filter(move => classifyMovement(move.qty) === 'out').reduce((total, move) => total - move.qty, 0)
      const bal = opening + inQty - outQty
      rows.push({ productId, period, openingQty: money2(opening), inQty: money2(inQty), outQty: money2(outQty), balQty: money2(bal) })
    }
  }
  return rows
}

/**
 * W2-B3: materialize (or re-materialize) the monthly-balance snapshot for
 * one period or every period ('all'). Full replay per period — opening
 * recomputed from the whole ledger — destroy-then-create, so the run is
 * idempotent and history-correcting (补录后重算). Asserts per product:
 * bal(t) == net flow through the month, in−out == the month's net flow,
 * and next opening == previous bal; values ride the current
 * moving-average cost (the note declares the 口径).
 * @param periodSpec - 'YYYY-MM' or 'all' (every month from the ledger's earliest).
 */
export async function snapshotMonthlyBalances(token: string, periodSpec: string): Promise<void> {
  const movements = (await rowsOf(token, 'wms_movements', 1000))
    .filter(row => String(row.biz_date ?? '') > '')
    .map(row => ({ id: Number(row.id), product_id: Number(row.product_id), qty: Number(row.qty ?? 0), biz_date: String(row.biz_date).slice(0, 10) }))
  if (movements.length === 0) throw new Error('流水无 biz_date（先 --backfill-dates）——快照拒绝生成')
  const today = shanghaiToday()
  const through = periodSpec === 'all' ? today.slice(0, 7) : periodSpec
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(through)) throw new Error(`月份格式应为 YYYY-MM 或 all（收到 ${periodSpec}）——fail loud`)
  const targets = periodSpec === 'all'
    ? [...new Set(movements.map(move => move.biz_date.slice(0, 7)))].filter(month => month <= through).sort()
    : [through]
  if (targets.length === 0) throw new Error(`流水最早月之后无 ${periodSpec} 的数据——快照拒绝生成`)
  // The per-product current moving-average cost (val = qty × vwap, the note
  // declares 现值口径).
  const vwap = new Map<number, number>()
  for (const productId of new Set(movements.map(move => move.product_id))) {
    vwap.set(productId, await movingAverageCost(token, productId))
  }
  const computed = monthlyBalancesOf(movements, through)
  for (const period of targets) {
    const existing = (await rowsOf(token, 'wms_monthly_balances', 1000)).filter(row => String(row.period) === period)
    for (const row of existing) {
      await dataOf(token, 'POST', `/api/wms_monthly_balances:destroy?filterByTk=${row.id}`)
    }
    const periodRows = computed.filter(row => row.period === period)
    for (const row of periodRows) {
      const unit = vwap.get(row.productId) ?? 0
      await dataOf(token, 'POST', '/api/wms_monthly_balances:create', {
        product: { id: row.productId }, period,
        opening_qty: row.openingQty, in_qty: row.inQty, out_qty: row.outQty, bal_qty: row.balQty,
        opening_val: money2(row.openingQty * unit), in_val: money2(row.inQty * unit), out_val: money2(row.outQty * unit), bal_val: money2(row.balQty * unit),
        snapshot_date: today, source: 'full_replay',
        note: '成本口径=现值移动加权（B6 movingAverageCost，非期间加权）；期末=流水重放缓存，--recalc 可重算',
      })
    }
    console.log(`nocobase-h5: [snapshot] ${period} — ${String(periodRows.length)} product 行（destroy-create 幂等，snapshot_date=${today}）`)
  }
  // No whole-table assert here: a single-month rebuild inside a multi-month
  // --recalc would otherwise trip over another month's stale rows before the
  // loop reaches them (the CLI asserts once after all months rebuilt).
}

/**
 * W2-B3: the snapshot differential reconciliation — stored rows must equal
 * a fresh full replay (per product: bal == net flow through the month,
 * in−out == the month's net flow), and each product's consecutive periods
 * must chain (bal(t) == opening(t+1)). Any drift turns this red.
 */
export async function assertMonthlyBalances(token: string): Promise<void> {
  const movements = (await rowsOf(token, 'wms_movements', 1000))
    .filter(row => String(row.biz_date ?? '') > '')
    .map(row => ({ id: Number(row.id), product_id: Number(row.product_id), qty: Number(row.qty ?? 0), biz_date: String(row.biz_date).slice(0, 10) }))
  const stored = await rowsOf(token, 'wms_monthly_balances', 1000)
  const computed = monthlyBalancesOf(movements, shanghaiToday().slice(0, 7))
  const expected = new Map(computed.map(row => [`${String(row.productId)}:${row.period}`, row]))
  const drift: string[] = []
  for (const row of stored) {
    const key = `${String(row.product_id)}:${String(row.period)}`
    const want = expected.get(key)
    if (want === undefined) {
      drift.push(`${key}: 快照有行但流水无可重放（period 超前或 product 无流水）`)
      continue
    }
    if (Math.abs(Number(row.opening_qty) - want.openingQty) > 0.01 || Math.abs(Number(row.in_qty) - want.inQty) > 0.01
      || Math.abs(Number(row.out_qty) - want.outQty) > 0.01 || Math.abs(Number(row.bal_qty) - want.balQty) > 0.01) {
      drift.push(`${key}: 快照(${String(row.opening_qty)}/${String(row.in_qty)}/${String(row.out_qty)}/${String(row.bal_qty)}) ≠ 重放(${String(want.openingQty)}/${String(want.inQty)}/${String(want.outQty)}/${String(want.balQty)})`)
    }
  }
  const missing = [...expected.keys()].filter(key => !stored.some(row => `${String(row.product_id)}:${String(row.period)}` === key))
  for (const key of missing.slice(0, 5)) drift.push(`${key}: 流水可重放但快照缺行`)
  // Continuity: consecutive stored periods chain per product.
  const byProduct = new Map<number, Array<{ period: string, bal: number, opening: number }>>()
  for (const row of stored) {
    const productId = Number(row.product_id)
    if (!byProduct.has(productId)) byProduct.set(productId, [])
    byProduct.get(productId)!.push({ period: String(row.period), bal: Number(row.bal_qty), opening: Number(row.opening_qty) })
  }
  for (const [productId, list] of byProduct) {
    const ordered = list.sort((a, b) => a.period.localeCompare(b.period))
    for (let index = 1; index < ordered.length; index += 1) {
      if (Math.abs(ordered[index - 1]!.bal - ordered[index]!.opening) > 0.01) {
        drift.push(`product ${String(productId)}: ${ordered[index - 1]!.period} bal ${String(ordered[index - 1]!.bal)} ≠ ${ordered[index]!.period} opening ${String(ordered[index]!.opening)}（连续性断链）`)
      }
    }
  }
  if (drift.length > 0) {
    throw new Error(`月度收发存对账失败（快照 ≠ 流水重放）：\n  - ${drift.slice(0, 10).join('\n  - ')}${drift.length > 10 ? `\n  - …共 ${String(drift.length)} 处` : ''}`)
  }
  console.log(`nocobase-h5: [snapshot] 对账 ✓ ${String(stored.length)} 行快照 == 流水重放（期初/收/发/期末 + 连续性 bal(t)==opening(t+1)）`)
}

/**
 * B4: the bypass guard — narrow the admin role's strategy-wide write on
 * wms_stock and wms_movements to an explicit read-only rolesResources row
 * (view/list/get/export). The root-token engine keeps its writes; every
 * non-root session that PATCHes either collection meets 403. Idempotent: an
 * existing row is repaired to the read-only action set when drifted.
 */
async function ensureBypassGuard(token: string): Promise<void> {
  for (const collection of ['wms_stock', 'wms_movements']) {
    const rows = (await dataOf(token, 'GET', `/api/rolesResources:list?pageSize=100&filter=${encodeURIComponent(JSON.stringify({ roleName: { $eq: 'admin' }, name: { $eq: collection } }))}`)) as Array<Record<string, any>>
    const readOnlyActions = [{ name: 'view' }, { name: 'list' }, { name: 'get' }, { name: 'export' }]
    if (rows === null || rows.length === 0) {
      await dataOf(token, 'POST', '/api/rolesResources:create', {
        role: { name: 'admin' }, name: collection, usingActionsConfig: true, actions: readOnlyActions,
      })
      console.log(`nocobase-h5: bypass guard — admin→${collection} narrowed to read-only (update/create/destroy off)`)
      continue
    }
    const guard = rows[0]
    if (guard.usingActionsConfig !== true) {
      await dataOf(token, 'POST', `/api/rolesResources:update?filterByTk=${guard.id}`, { usingActionsConfig: true })
      console.log(`nocobase-h5: bypass guard repaired — admin→${collection} usingActionsConfig on`)
    }
  }
}

// ─── B6: the manufacturing-execution engine surface (kit → issue → report → completion → OQC) ───

/** Round to two decimals (the cost columns' storage scale). */
const money2 = (value: number): number => Math.round(value * 100) / 100

/** The B6 execution states a doc_status row may carry past approval. */
const MO_EXECUTING_STATES = new Set(['released', 'in_progress'])

/**
 * W2-B6: the MO's kit policy — full_lock (the W-round default: a partial kit
 * blocks issuing) or partial_allowed (covered components hard-reserve and
 * issue while the shortfall ladder hangs). Missing/empty falls back to
 * full_lock (zero drift); any other value fails loud (column corruption,
 * not a policy choice).
 */
export function moKitPolicy(mo: Record<string, any>): 'full_lock' | 'partial_allowed' {
  const raw = mo.kit_policy
  if (raw === null || raw === undefined || String(raw) === '') return 'full_lock'
  if (raw === 'full_lock' || raw === 'partial_allowed') return raw
  throw new Error(`MO ${String(mo.code)} 的齐套策略非法（${String(raw)}）——仅支持 full_lock / partial_allowed；修正 mfg_orders.kit_policy`)
}

/**
 * W2-B6: the MO's over-issue ratio — the cumulative issue ceiling becomes
 * reserved × (1 + ratio). Missing/empty is 0 (the W-round 超领全拒); a
 * negative or non-finite value fails loud at the first engine touch.
 */
export function moOverissueRatio(mo: Record<string, any>): number {
  const raw = mo.overissue_ratio
  if (raw === null || raw === undefined || String(raw) === '') return 0
  const ratio = Number(raw)
  if (!Number.isFinite(ratio) || ratio < 0) {
    throw new Error(`MO ${String(mo.code)} 的超领比例非法（${String(raw)}）——须为 ≥0 的比例小数（如 0.05=允许超领 5%）；修正 mfg_orders.overissue_ratio`)
  }
  return ratio
}

/** W2-B6: the cumulative issue ceiling — reserved × (1 + ratio); ratio 0 keeps the W-round reserved-only ceiling. */
export function issueCeilingOf(reservedQty: number, ratio: number): number {
  return reservedQty * (1 + ratio)
}

/** The MO row one execution document's mo_id points at (fails loud on a miss). */
async function moOfRowId(token: string, moId: unknown): Promise<Record<string, any>> {
  const mo = (await rowsOf(token, 'mfg_orders')).find(row => Number(row.id) === Number(moId))
  if (mo === undefined) throw new Error(`执行单据指向的生产订单 #${String(moId)} 不存在（mfg_orders）`)
  return mo
}

/** The WIP bin row (every issued material parks on it; missing = reseed needed). */
async function wipBin(token: string): Promise<Record<string, any>> {
  const bin = (await rowsOf(token, 'wms_bins', 200)).find(row => row.code === `${WIP_ZONE_CODE}-01-01`)
  if (bin === undefined) throw new Error(`WIP 线边库位 ${WIP_ZONE_CODE}-01-01 缺失——重跑 nocobase-h5-wms.mts 补 B6 虚拟库位种子`)
  return bin
}

/** One MO row resolved by code (fails loud on a miss). */
async function moByCode(token: string, moCode: string): Promise<Record<string, any>> {
  const mo = (await rowsOf(token, 'mfg_orders')).find(row => row.code === moCode)
  if (mo === undefined) throw new Error(`no mfg_orders row with code=${moCode}`)
  return mo
}

/** The MO's effective BOM component demands: qty_per × (1 + scrap%) × mo.qty per line. */
async function moComponentDemands(token: string, mo: Record<string, any>): Promise<Array<{ product: Record<string, any>, qtyPer: number, scrapPct: number, demand: number }>> {
  const lines = (await rowsOf(token, 'mfg_bom_lines')).filter(row => Number(row.bom_id) === Number(mo.bom_id))
  if (lines.length === 0) throw new Error(`MO ${String(mo.code)} 的 BOM #${String(mo.bom_id)} 无组件行（mfg_bom_lines）`)
  const products = await rowsOf(token, 'hub_inv_products', 200)
  return lines.map(line => {
    const product = products.find(row => Number(row.id) === Number(line.product_id))
    if (product === undefined) throw new Error(`BOM 组件行 #${String(line.id)} 指向不存在的物料 #${String(line.product_id)}`)
    const qtyPer = Number(line.qty_per_unit ?? 0)
    const scrapPct = Number(line.scrap_pct ?? 0)
    return { product, qtyPer, scrapPct, demand: qtyPer * (1 + scrapPct / 100) * Number(mo.qty) }
  })
}

/** The latest approved-and-not-yet-fully-received PO need_date carrying one product (the shortfall ETA hint). */
async function inboundEtaOf(token: string, productId: number): Promise<string | null> {
  const orders = await rowsOf(token, 'pur_orders')
  const lines = (await rowsOf(token, 'pur_order_lines')).filter(row => Number(row.product_id) === productId)
  const etas = lines
    .map(line => orders.find(order => Number(order.id) === Number(line.order_id)))
    .filter(order => order !== undefined && String(order.doc_status) === 'approved' && String(order.receiving_status ?? 'none') !== 'received')
    .map(order => String(order.need_date ?? '').slice(0, 10))
    .filter(date => date > '')
    .sort()
  return etas.length > 0 ? etas[etas.length - 1]! : null
}

/**
 * B6: the moving-average unit cost one product carries — every positive
 * movement's quantity weighed by its resolvable inbound price (the PO line's
 * unit_price when the movement's document traces to a receipt with a PO,
 * else the product master price), falling back to the master price when the
 * ledger has no positive leg (D11's quantity-ledger valuation).
 */
export async function movingAverageCost(token: string, productId: number): Promise<number> {
  const products = await rowsOf(token, 'hub_inv_products', 200)
  const product = products.find(row => Number(row.id) === productId)
  if (product === undefined) throw new Error(`no hub_inv_products row #${String(productId)}`)
  const movements = (await rowsOf(token, 'wms_movements', 1000)).filter(row => Number(row.product_id) === productId && Number(row.qty ?? 0) > 0)
  if (movements.length === 0) return Number(product.unit_price ?? 0)
  // Price resolution per movement: the receipt sharing the doc_no (when one
  // exists) points at its PO, whose order line carries the contract price.
  const receipts = await rowsOf(token, 'wms_receipts', 500)
  const orderLines = await rowsOf(token, 'pur_order_lines')
  const priceOf = (move: Record<string, any>): number => {
    const receipt = receipts.find(row => row.receipt_no === String(move.doc_no) && Number(row.po_id ?? 0) > 0)
    if (receipt !== undefined) {
      const line = orderLines.find(row => Number(row.order_id) === Number(receipt.po_id) && Number(row.product_id) === productId)
      if (line !== undefined && Number(line.unit_price ?? 0) > 0) return Number(line.unit_price)
    }
    return Number(product.unit_price ?? 0)
  }
  const qtySum = movements.reduce((total, move) => total + Number(move.qty), 0)
  const valueSum = movements.reduce((total, move) => total + Number(move.qty) * priceOf(move), 0)
  return qtySum > 0 ? valueSum / qtySum : Number(product.unit_price ?? 0)
}

/**
 * B6: the kit (齐套) check — ATP per BOM component, and when every component
 * covers its demand the same action hard-reserves each one into
 * wms_reservations (ref_type=MO, the single ATP fact source D6/D7). Partial
 * coverage reserves what fits and reports the shortfall ladder (component /
 * gap / latest inbound ETA); a full miss keeps reservation_state=none. The
 * verdict + ladder land on mfg_orders.kit_data for the mobile read side, and
 * re-running after a top-up releases the MO's earlier partial picks first.
 * @param moCode - the MO code (must sit in released/in_progress).
 * @returns the verdict object the CLI prints and kit_data stores.
 */
export async function availabilityCheck(token: string, moCode: string): Promise<{ state: string, rows: Array<Record<string, unknown>> }> {
  const mo = await moByCode(token, moCode)
  if (!MO_EXECUTING_STATES.has(String(mo.doc_status))) {
    throw new Error(`齐套被拒：MO ${moCode} 状态为 ${String(mo.doc_status)}——需先审批通过并下达（released）后才能齐套`)
  }
  // Re-entry after a top-up: release this MO's earlier partial picks so the
  // recompute re-picks FEFO against the grown pool. A released row must be
  // destroyed as well — reserve() is code-idempotent and keeps an existing
  // row as-is, so a leftover released row would block the re-pick forever
  // (the kit reads assigned while post-issue finds no reserved rows — the
  // W3-B7 journey hit exactly that deadlock).
  for (const reservation of (await rowsOf(token, 'wms_reservations')).filter(row => row.ref_type === 'MO' && row.ref_id === moCode)) {
    if (reservation.status === 'reserved') await releaseReservation(token, String(reservation.code))
    if (reservation.status === 'released') await dataOf(token, 'POST', `/api/wms_reservations:destroy?filterByTk=${String(reservation.id)}`)
  }
  const demands = await moComponentDemands(token, mo)
  const stocks = await rowsOf(token, 'wms_stock', 500)
  const policy = moKitPolicy(mo)
  await moOverissueRatio(mo) // fail loud on a corrupted ratio before any reservation lands
  const rows: Array<Record<string, unknown>> = []
  let state = 'assigned'
  let index = 0
  for (const demand of demands) {
    index += 1
    const available = stocks
      .filter(row => Number(row.product_id) === Number(demand.product.id) && row.status === 'good')
      .reduce((total, row) => total + Number(row.qty_available ?? 0), 0)
    const ok = available + 1e-9 >= demand.demand
    // W2-B6: partial_allowed records its own non-blocking state (covered
    // components keep their hard reservations); full_lock keeps the W-round
    // blocking 'partial'.
    if (!ok) state = state === 'assigned' ? (policy === 'partial_allowed' ? 'partial_allowed' : 'partial') : state
    rows.push({
      sku: String(demand.product.sku), name: String(demand.product.name),
      demand: money2(demand.demand), available: money2(available),
      shortfall: ok ? 0 : money2(demand.demand - available),
      eta: ok ? null : await inboundEtaOf(token, Number(demand.product.id)),
    })
    if (!ok) continue
    // The hard reservation for a covered component (FEFO pick inside).
    await reserve(token, `RSV-MO-${moCode}-${String(index).padStart(2, '0')}`, 'MO', moCode, String(demand.product.sku), money2(demand.demand))
  }
  if (rows.every(row => Number(row.shortfall) > 0)) state = 'none'
  if (state === 'none') {
    for (const reservation of (await rowsOf(token, 'wms_reservations')).filter(row => row.ref_type === 'MO' && row.ref_id === moCode && row.status === 'reserved')) {
      await releaseReservation(token, String(reservation.code))
    }
  }
  await dataOf(token, 'POST', `/api/mfg_orders:update?filterByTk=${mo.id}`, {
    reservation_state: state,
    kit_data: JSON.stringify({ state, policy, checked_at: new Date().toISOString().slice(0, 10), rows }),
  })
  const gapText = rows.filter(row => Number(row.shortfall) > 0).map(row => `${String(row.sku)} 短 ${String(row.shortfall)}`).join('、')
  const suffix = state === 'partial' ? `（缺口：${gapText}）`
    : state === 'partial_allowed' ? `（部分投料已预留：缺口 ${gapText} 挂 ETA，已齐组件照常领料）` : ''
  console.log(`nocobase-h5: kit ${moCode} → ${state}${suffix}`)
  return { state, rows }
}

/**
 * B6: recompute the MO's transferred three-quantity cell — the output
 * equivalent the net issued materials cover (min over components of
 * Σ(issued − returned) / net qty_per), written onto mfg_orders.qty_transferred.
 */
async function recomputeTransferred(token: string, mo: Record<string, any>): Promise<number> {
  const demands = await moComponentDemands(token, mo)
  const issues = (await rowsOf(token, 'mfg_material_issues')).filter(row => Number(row.mo_id) === Number(mo.id) && row.status === 'posted')
  const returns = (await rowsOf(token, 'mfg_material_returns')).filter(row => Number(row.mo_id) === Number(mo.id) && row.status === 'posted')
  const equivalents = demands.map(demand => {
    const netPer = demand.qtyPer * (1 + demand.scrapPct / 100)
    if (netPer <= 0) return Number.POSITIVE_INFINITY
    const netIssued = issues.filter(row => Number(row.product_id) === Number(demand.product.id)).reduce((total, row) => total + Number(row.qty ?? 0), 0)
      - returns.filter(row => Number(row.product_id) === Number(demand.product.id)).reduce((total, row) => total + Number(row.qty ?? 0), 0)
    return Math.max(0, netIssued / netPer)
  })
  const transferred = equivalents.length === 0 ? 0 : money2(Math.min(...equivalents))
  await dataOf(token, 'POST', `/api/mfg_orders:update?filterByTk=${mo.id}`, { qty_transferred: transferred })
  return transferred
}

/**
 * B6: post one material issue (one row per component; the posting is
 * single-shot). Gates: the MO must sit released/in_progress with
 * reservation_state=assigned (未齐套不能领料), the component's reservation
 * must still be reserved, and the cumulative issue quantity may never exceed
 * the reserved demand (超领被拒). The leg consumes the reservation, moves
 * stock from the reserved bin onto the WIP bin, and appends the ±ISSUE_WIP
 * pair; the MO advances released → in_progress on its first issue.
 */
export async function postIssue(token: string, issueNo: string): Promise<void> {
  const issues = await rowsOf(token, 'mfg_material_issues')
  const issue = issues.find(row => row.code === issueNo)
  if (issue === undefined) throw new Error(`no material issue ${issueNo}`)
  if (issue.status === 'posted') {
    console.log(`nocobase-h5: issue ${issueNo} already posted (kept; posting is single-shot)`)
    return
  }
  const mo = await moOfRowId(token, issue.mo_id)
  if (!MO_EXECUTING_STATES.has(String(mo.doc_status))) {
    throw new Error(`领料被拒：MO ${String(mo.code)} 状态为 ${String(mo.doc_status)}——未下达（released）不能领料`)
  }
  // W2-B6: assigned always issues; partial_allowed additionally admits its
  // own partial state (covered components carry reservations; the uncovered
  // ones fail below on the missing reservation). full_lock keeps the
  // W-round refusal for every non-assigned state.
  const policy = moKitPolicy(mo)
  const kitState = String(mo.reservation_state)
  if (kitState !== 'assigned' && !(policy === 'partial_allowed' && kitState === 'partial_allowed')) {
    throw new Error(`领料被拒：MO ${String(mo.code)} 齐套状态为 ${kitState}——需先齐套（assigned）${policy === 'partial_allowed' ? '或部分投料（partial_allowed）' : ''}才能领料`)
  }
  const reservation = (await rowsOf(token, 'wms_reservations')).find(row =>
    row.ref_type === 'MO' && row.ref_id === String(mo.code) && Number(row.product_id) === Number(issue.product_id) && row.status === 'reserved')
  if (reservation === undefined) throw new Error(`领料被拒：MO ${String(mo.code)} 组件 #${String(issue.product_id)} 无有效预留（可能已被领完）`)
  const qty = Number(issue.qty)
  const issuedSoFar = issues
    .filter(row => Number(row.mo_id) === Number(mo.id) && Number(row.product_id) === Number(issue.product_id) && row.status === 'posted')
    .reduce((total, row) => total + Number(row.qty ?? 0), 0)
  // W2-B6: the ceiling rides the MO's over-issue ratio — reserved × (1+r);
  // ratio 0 (the default) keeps the W-round reserved-only ceiling.
  const ratio = moOverissueRatio(mo)
  const ceiling = issueCeilingOf(Number(reservation.qty), ratio)
  if (issuedSoFar + qty > ceiling + 1e-9) {
    const ceilingText = ratio > 0 ? `预留 ${String(Number(reservation.qty))} ×(1+${String(ratio)}) = 上限 ${String(money2(ceiling))}` : `预留 ${String(Number(reservation.qty))}`
    throw new Error(`超领被拒：MO ${String(mo.code)} 组件 ${String(issue.product_id)} ${ceilingText}，已领 ${String(issuedSoFar)}，本次 ${String(qty)} 将超量（需先补预留/走超领审批）`)
  }
  const productId = Number(issue.product_id)
  const fromBinId = Number(reservation.bin_id)
  const lotId = Number(issue.lot_id === null || issue.lot_id === undefined ? reservation.lot_id : issue.lot_id)
  await consumeReservation(token, String(reservation.code))
  const source = (await rowsOf(token, 'wms_stock', 500)).find(row => row.product_id === productId && row.bin_id === fromBinId && row.lot_id === lotId)
  if (source === undefined) throw new Error(`领料源库存行缺失（product ${String(productId)} × bin ${String(fromBinId)} × lot ${String(lotId)}）——预留指向的库存已被移动`)
  if (source.status !== 'good') throw new Error(`领料被拒：源库存为 ${String(source.status)}（待检/冻结库存不可领）`)
  const wip = await wipBin(token)
  await applyStockDelta(token, { productId, binId: fromBinId, lotId }, -qty)
  const wipStock = (await rowsOf(token, 'wms_stock', 500)).find(row => row.product_id === productId && row.bin_id === Number(wip.id) && row.lot_id === lotId)
  if (wipStock === undefined) {
    await dataOf(token, 'POST', '/api/wms_stock:create', {
      product: { id: productId }, bin: { id: Number(wip.id) }, lot: { id: lotId }, status: 'good',
      qty_on_hand: qty, qty_allocated: 0, qty_locked: 0, qty_available: qty, version: 1,
    })
  } else {
    await applyStockDelta(token, { productId, binId: Number(wip.id), lotId }, qty)
  }
  await appendMovement(token, {
    move_type: 'ISSUE_WIP', doc_no: issueNo,
    product: { id: productId }, lot: { id: lotId }, from_bin: { id: fromBinId },
    qty: -qty, note: `生产领料·出（MO ${String(mo.code)}）`,
  })
  await appendMovement(token, {
    move_type: 'ISSUE_WIP', doc_no: issueNo,
    product: { id: productId }, lot: { id: lotId }, to_bin: { id: Number(wip.id) },
    qty, note: `生产领料·入线边（MO ${String(mo.code)} → ${WIP_ZONE_CODE}）`,
  })
  // W2-B6: a row that rode the ratio headroom records the over-issued amount.
  const overQty = issuedSoFar + qty - Number(reservation.qty)
  await dataOf(token, 'POST', `/api/mfg_material_issues:update?filterByTk=${issue.id}`, {
    status: 'posted',
    ...(overQty > 1e-9 ? { note: `${String(issue.note ?? '')}；超领 ${String(money2(overQty))}（overissue_ratio ${String(ratio)}）` } : {}),
  })
  if (String(mo.doc_status) === 'released') {
    await dataOf(token, 'POST', `/api/mfg_orders:update?filterByTk=${mo.id}`, { doc_status: 'in_progress' })
    console.log(`nocobase-h5: MO ${String(mo.code)} released → in_progress（首次领料开工）`)
  }
  const transferred = await recomputeTransferred(token, mo)
  console.log(`nocobase-h5: issue ${issueNo} posted — 组件 #${String(productId)} −${String(qty)} → ${WIP_ZONE_CODE}，预留 ${String(reservation.code)} consumed，qty_transferred=${String(transferred)}`)
}

/**
 * B6: post one material return — WIP pulls back onto a qualified warehouse
 * bin with the ±RETURN_WIP pair. The MO must be executing and the WIP row
 * must cover the quantity; the reservation stays consumed (a return is a
 * correction, not an un-reservation).
 */
export async function postReturn(token: string, returnNo: string): Promise<void> {
  const returns = await rowsOf(token, 'mfg_material_returns')
  const back = returns.find(row => row.code === returnNo)
  if (back === undefined) throw new Error(`no material return ${returnNo}`)
  if (back.status === 'posted') {
    console.log(`nocobase-h5: return ${returnNo} already posted (kept; posting is single-shot)`)
    return
  }
  const mo = await moOfRowId(token, back.mo_id)
  if (!MO_EXECUTING_STATES.has(String(mo.doc_status))) {
    throw new Error(`退料被拒：MO ${String(mo.code)} 状态为 ${String(mo.doc_status)}——未在执行中（released/in_progress）不能退料`)
  }
  const productId = Number(back.product_id)
  const lotId = Number(back.lot_id)
  const qty = Number(back.qty)
  const wip = await wipBin(token)
  const wipStock = (await rowsOf(token, 'wms_stock', 500)).find(row => row.product_id === productId && row.bin_id === Number(wip.id) && row.lot_id === lotId)
  if (wipStock === undefined || Number(wipStock.qty_on_hand ?? 0) + 1e-9 < qty) {
    throw new Error(`退料被拒：WIP 线边 ${WIP_ZONE_CODE} 上该批次仅有 ${String(wipStock?.qty_on_hand ?? 0)}，不足退 ${String(qty)}`)
  }
  // Destination: an existing qualified stock row for the lot, else the
  // product's temp-zone idle bin (the putaway rule).
  const stocks = await rowsOf(token, 'wms_stock', 500)
  const products = await rowsOf(token, 'hub_inv_products', 200)
  const product = products.find(row => Number(row.id) === productId)
  const zones = await rowsOf(token, 'wms_zones')
  const bins = await rowsOf(token, 'wms_bins', 200)
  const dest = stocks.find(row => row.product_id === productId && row.lot_id === lotId && row.status === 'good' && row.bin_id !== Number(wip.id))
    ?? await (async (): Promise<Record<string, any> | undefined> => {
      const zone = zones.find(row => row.temp_zone === (product?.temp_zone ?? 'ambient') && row.code !== QUARANTINE_ZONE_CODE && row.code !== WIP_ZONE_CODE)
      return bins.find(row => row.status === 'idle' && (zone === undefined || row.zone_id === zone.id) && row.code !== `${WIP_ZONE_CODE}-01-01`)
    })()
  if (dest === undefined) throw new Error(`退料找不到目标库位（${String(product?.sku ?? productId)} 无在架良品行且无空闲库位）`)
  const destBinId = Number('bin_id' in dest ? dest.bin_id : dest.id)
  await applyStockDelta(token, { productId, binId: Number(wip.id), lotId }, -qty)
  const destStock = (await rowsOf(token, 'wms_stock', 500)).find(row => row.product_id === productId && row.bin_id === destBinId && row.lot_id === lotId)
  if (destStock === undefined) {
    await dataOf(token, 'POST', '/api/wms_stock:create', {
      product: { id: productId }, bin: { id: destBinId }, lot: { id: lotId }, status: 'good',
      qty_on_hand: qty, qty_allocated: 0, qty_locked: 0, qty_available: qty, version: 1,
    })
  } else {
    await applyStockDelta(token, { productId, binId: destBinId, lotId }, qty)
  }
  await appendMovement(token, {
    move_type: 'RETURN_WIP', doc_no: returnNo,
    product: { id: productId }, lot: { id: lotId }, from_bin: { id: Number(wip.id) },
    qty: -qty, note: `退料回库·出线边（MO ${String(mo.code)}）`,
  })
  await appendMovement(token, {
    move_type: 'RETURN_WIP', doc_no: returnNo,
    product: { id: productId }, lot: { id: lotId }, to_bin: { id: destBinId },
    qty, note: `退料回库·入（MO ${String(mo.code)}，${WIP_ZONE_CODE} → 仓库）`,
  })
  await dataOf(token, 'POST', `/api/mfg_material_returns:update?filterByTk=${back.id}`, { status: 'posted' })
  const transferred = await recomputeTransferred(token, mo)
  console.log(`nocobase-h5: return ${returnNo} posted — ${WIP_ZONE_CODE} −${String(qty)} → 仓库 bin #${String(destBinId)}，qty_transferred=${String(transferred)}`)
}

/**
 * B6: post one job report — the operation's progress engine. Gates: the MO
 * must be in_progress (首次领料后才可报工), the operation must exist on the
 * applied plan, and the cumulative reported quantity may never exceed the MO
 * quantity. The first report starts the operation (planned → started);
 * reaching the MO quantity on its operation finishes it (→ done).
 * qty_consumed on the MO recomputes as Σ(qty_good + qty_scrap).
 */
export async function postJobReport(token: string, reportCode: string): Promise<void> {
  const reports = await rowsOf(token, 'mfg_job_reports')
  const report = reports.find(row => row.code === reportCode)
  if (report === undefined) throw new Error(`no job report ${reportCode}`)
  if (report.status === 'posted') {
    console.log(`nocobase-h5: report ${reportCode} already posted (kept; posting is single-shot)`)
    return
  }
  const mo = await moOfRowId(token, report.mo_id)
  if (String(mo.doc_status) !== 'in_progress') {
    throw new Error(`报工被拒：MO ${String(mo.code)} 状态为 ${String(mo.doc_status)}——需已领料开工（in_progress）才能报工`)
  }
  const opSeq = Number(report.op_seq)
  const operation = (await rowsOf(token, 'mfg_order_operations')).find(row => Number(row.order_id) === Number(mo.id) && Number(row.seq) === opSeq)
  if (operation === undefined) throw new Error(`报工被拒：MO ${String(mo.code)} 无工序 seq=${String(opSeq)}（先排产）`)
  const qtyGood = Number(report.qty_good ?? 0)
  const qtyScrap = Number(report.qty_scrap ?? 0)
  const reportedSoFar = reports
    .filter(row => Number(row.mo_id) === Number(mo.id) && Number(row.op_seq) === opSeq && row.status === 'posted')
    .reduce((total, row) => total + Number(row.qty_good ?? 0) + Number(row.qty_scrap ?? 0), 0)
  if (reportedSoFar + qtyGood + qtyScrap > Number(mo.qty) + 1e-9) {
    throw new Error(`报工超量被拒：工序 seq=${String(opSeq)} 累计可报 ${String(Number(mo.qty))}，已报 ${String(reportedSoFar)}，本次 ${String(qtyGood + qtyScrap)} 超出`)
  }
  const opStatus = reportedSoFar + qtyGood + qtyScrap >= Number(mo.qty) - 1e-9 ? 'done' : 'started'
  await dataOf(token, 'POST', `/api/mfg_order_operations:update?filterByTk=${operation.id}`, { status: opStatus })
  await dataOf(token, 'POST', `/api/mfg_job_reports:update?filterByTk=${report.id}`, {
    status: 'posted',
    qc_status: String(report.qc_status ?? '') === '' ? 'not_required' : report.qc_status,
  })
  // qty_consumed is the last operation's cumulative reported quantity (the
  // output equivalent); intermediate operations report their own throughput.
  const maxSeq = Math.max(...(await rowsOf(token, 'mfg_order_operations')).filter(row => Number(row.order_id) === Number(mo.id)).map(row => Number(row.seq)))
  const consumed = (await rowsOf(token, 'mfg_job_reports'))
    .filter(row => Number(row.mo_id) === Number(mo.id) && row.status === 'posted' && Number(row.op_seq) === maxSeq)
    .reduce((total, row) => total + Number(row.qty_good ?? 0) + Number(row.qty_scrap ?? 0), 0)
  await dataOf(token, 'POST', `/api/mfg_orders:update?filterByTk=${mo.id}`, { qty_consumed: money2(consumed) })
  console.log(`nocobase-h5: report ${reportCode} posted — 工序 seq=${String(opSeq)} → ${opStatus}，合格 ${String(qtyGood)} + 不合格 ${String(qtyScrap)}，qty_consumed=${String(money2(consumed))}`)
  // B8: the IPQC anchor document (reports asking for inspection only).
  if (String(report.qc_status ?? '') === 'pending') {
    await ensureQualityInspectionFor(token, 'IPQC', {
      refType: 'job_report', refNo: reportCode, refId: Number(report.id), productId: Number(mo.product_id),
      lotNo: `MO-${String(mo.code)}-OP${String(opSeq)}`, lotQty: qtyGood,
    })
  }
}

/**
 * B6: settle the MO's dual cost columns at completion — std_cost rewritten
 * as the BOM 标准卷算 total (Σ material demand × master price + Σ operation
 * planned minutes × rate), actual_cost as Σ(实领−退料 × VWAP) + Σ(报工工时 ×
 * rate), and cost_variance as the difference (D11: business ledger, never
 * accounting vouchers).
 */
async function settleMoCost(token: string, mo: Record<string, any>): Promise<{ std: number, actual: number, variance: number }> {
  const demands = await moComponentDemands(token, mo)
  const stdMaterial = demands.reduce((total, demand) => total + demand.demand * Number(demand.product.unit_price ?? 0), 0)
  const operations = (await rowsOf(token, 'mfg_order_operations')).filter(row => Number(row.order_id) === Number(mo.id))
  const centers = await rowsOf(token, 'mfg_work_centers')
  const stdLabor = operations.reduce((total, op) => {
    const center = centers.find(row => Number(row.id) === Number(op.workcenter_id))
    return total + Number(op.planned_min ?? 0) / 60 * Number(center?.cost_per_hour ?? 0)
  }, 0)
  const issues = (await rowsOf(token, 'mfg_material_issues')).filter(row => Number(row.mo_id) === Number(mo.id) && row.status === 'posted')
  const returns = (await rowsOf(token, 'mfg_material_returns')).filter(row => Number(row.mo_id) === Number(mo.id) && row.status === 'posted')
  let actualMaterial = 0
  const vwapCache = new Map<number, number>()
  const costOf = async (productId: number): Promise<number> => {
    const cached = vwapCache.get(productId)
    if (cached !== undefined) return cached
    const vwap = await movingAverageCost(token, productId)
    vwapCache.set(productId, vwap)
    return vwap
  }
  for (const issue of issues) actualMaterial += Number(issue.qty ?? 0) * await costOf(Number(issue.product_id))
  for (const back of returns) actualMaterial -= Number(back.qty ?? 0) * await costOf(Number(back.product_id))
  const reports = (await rowsOf(token, 'mfg_job_reports')).filter(row => Number(row.mo_id) === Number(mo.id) && row.status === 'posted')
  const actualLabor = reports.reduce((total, row) => {
    const operation = operations.find(op => Number(op.order_id) === Number(mo.id) && Number(op.seq) === Number(row.op_seq))
    const center = operation === undefined ? undefined : centers.find(c => Number(c.id) === Number(operation.workcenter_id))
    return total + Number(row.duration_min ?? 0) / 60 * Number(center?.cost_per_hour ?? 0)
  }, 0)
  const std = money2(stdMaterial + stdLabor)
  const actual = money2(actualMaterial + actualLabor)
  const variance = money2(actual - std)
  await dataOf(token, 'POST', `/api/mfg_orders:update?filterByTk=${mo.id}`, { std_cost: std, actual_cost: actual, cost_variance: variance })
  return { std, actual, variance }
}

/**
 * B6: post one completion — the finished-goods receipt. Gates: the MO must
 * be in_progress, every planned operation must be done (末工序报齐), and the
 * completion quantity may not exceed the cumulative reported good quantity.
 * The lot (four dates off shelf_life_days) lands quarantined on the 待检区
 * with a RECEIPT_MFG movement and oqc_status=pending; the MO closes to
 * completed and the dual cost columns settle in the same posting.
 */
export async function postCompletion(token: string, completionCode: string): Promise<void> {
  const completions = await rowsOf(token, 'mfg_completions')
  const completion = completions.find(row => row.code === completionCode)
  if (completion === undefined) throw new Error(`no completion ${completionCode}`)
  if (completion.status === 'posted') {
    console.log(`nocobase-h5: completion ${completionCode} already posted (kept; posting is single-shot)`)
    return
  }
  const mo = await moOfRowId(token, completion.mo_id)
  if (String(mo.doc_status) !== 'in_progress') {
    throw new Error(`完工被拒：MO ${String(mo.code)} 状态为 ${String(mo.doc_status)}——需执行中（in_progress，领料+报工后）才能完工`)
  }
  const operations = (await rowsOf(token, 'mfg_order_operations')).filter(row => Number(row.order_id) === Number(mo.id)).sort((a, b) => Number(a.seq) - Number(b.seq))
  if (operations.length === 0) throw new Error(`完工被拒：MO ${String(mo.code)} 无已排工序（先排产再执行）`)
  const unfinished = operations.filter(row => String(row.status) !== 'done')
  if (unfinished.length > 0) {
    throw new Error(`完工被拒：MO ${String(mo.code)} 工序未报齐（${unfinished.map(row => `seq ${String(row.seq)}=${String(row.status)}`).join('、')}）——末工序报齐才能完工`)
  }
  const operationsForGood = (await rowsOf(token, 'mfg_order_operations')).filter(row => Number(row.order_id) === Number(mo.id))
  const maxSeq = Math.max(...operationsForGood.map(row => Number(row.seq)))
  const reports = (await rowsOf(token, 'mfg_job_reports')).filter(row => Number(row.mo_id) === Number(mo.id) && row.status === 'posted' && Number(row.op_seq) === maxSeq)
  const goodSum = reports.reduce((total, row) => total + Number(row.qty_good ?? 0), 0)
  const qty = Number(completion.qty)
  if (qty > goodSum + 1e-9) {
    throw new Error(`完工被拒：完工数量 ${String(qty)} > 报工合格累计 ${String(money2(goodSum))}（MO ${String(mo.code)}）`)
  }
  const productId = Number(mo.product_id)
  const products = await rowsOf(token, 'hub_inv_products', 200)
  const product = products.find(row => Number(row.id) === productId)
  if (product === undefined) throw new Error(`MO ${String(mo.code)} 成品物料 #${String(productId)} 不存在`)
  // The lot: auto-numbered when blank, four dates off shelf_life_days (the
  // postReceipt food model), quarantined until OQC releases.
  let lotNo = String(completion.lot_no ?? '').trim()
  if (lotNo === '') {
    lotNo = `MFG-${new Date().toISOString().slice(0, 10).replaceAll('-', '')}-${String(completions.length + 1).padStart(2, '0')}`
  }
  let lots = await rowsOf(token, 'wms_lots')
  let lot = lots.find(row => row.lot_no === lotNo)
  if (lot === undefined) {
    const shelfLife = Number(product.shelf_life_days ?? 365)
    const production = new Date()
    const expiry = new Date(production.getTime() + shelfLife * 86_400_000)
    const removal = new Date(expiry.getTime() - 30 * 86_400_000)
    const alert = new Date(expiry.getTime() - 60 * 86_400_000)
    const fmt = (d: Date): string => d.toISOString().slice(0, 10)
    await dataOf(token, 'POST', '/api/wms_lots:create', {
      product: { id: productId }, lot_no: lotNo,
      production_date: fmt(production), expiry_date: fmt(expiry),
      removal_date: fmt(removal), alert_date: fmt(alert),
      status: 'quarantined',
    })
    lots = await rowsOf(token, 'wms_lots')
    lot = lots.find(row => row.lot_no === lotNo)
    console.log(`nocobase-h5: lot ${lotNo} created（shelf-life ${String(shelfLife)}d，完工待检）`)
  }
  if (lot === undefined) throw new Error(`lot ${lotNo} still missing after create`)
  // Putaway: the IQC 待检区's first idle bin (any non-disabled bin in the
  // zone when none is idle).
  const zones = await rowsOf(token, 'wms_zones')
  const bins = await rowsOf(token, 'wms_bins', 200)
  const quarantineZone = zones.find(row => row.code === QUARANTINE_ZONE_CODE)
  if (quarantineZone === undefined) throw new Error(`待检区 ${QUARANTINE_ZONE_CODE} 不存在——重跑 nocobase-h5-wms.mts 补待检区种子`)
  const bin = bins.find(row => row.zone_id === Number(quarantineZone.id) && row.status === 'idle')
    ?? bins.find(row => row.zone_id === Number(quarantineZone.id) && row.status !== 'disabled')
  if (bin === undefined) throw new Error('待检区无可用库位——完工入库被阻塞')
  const stocks = await rowsOf(token, 'wms_stock', 500)
  const existing = stocks.find(row => row.product_id === productId && row.bin_id === Number(bin.id) && row.lot_id === Number(lot.id))
  if (existing === undefined) {
    await dataOf(token, 'POST', '/api/wms_stock:create', {
      product: { id: productId }, bin: { id: Number(bin.id) }, lot: { id: Number(lot.id) }, status: 'hold',
      qty_on_hand: qty, qty_allocated: 0, qty_locked: 0, qty_available: qty, version: 1,
    })
  } else {
    await applyStockDelta(token, { productId, binId: Number(bin.id), lotId: Number(lot.id) }, qty)
  }
  await appendMovement(token, {
    move_type: 'RECEIPT_MFG', doc_no: completionCode,
    product: { id: productId }, lot: { id: Number(lot.id) }, to_bin: { id: Number(bin.id) },
    qty, note: `完工入库·待检区（MO ${String(mo.code)}，OQC 放行前 hold）`,
  })
  await dataOf(token, 'POST', `/api/mfg_completions:update?filterByTk=${completion.id}`, {
    status: 'posted', oqc_status: 'pending', lot_no: lotNo, completed_at: new Date().toISOString().slice(0, 10),
  })
  // W5-B5/BP-09: closed is the enum's post-completion terminal (released →
  // closed); the pre-W5 write of the out-of-enum 'completed' is retired.
  await dataOf(token, 'POST', `/api/mfg_orders:update?filterByTk=${mo.id}`, { doc_status: 'closed' })
  const cost = await settleMoCost(token, mo)
  console.log(`nocobase-h5: completion ${completionCode} posted — ${String(product.sku)} × ${String(qty)} → 待检区 ${String(bin.code)}（hold），MO → completed，成本 std=${String(cost.std)} actual=${String(cost.actual)} variance=${String(cost.variance)}`)
  // B8: the OQC anchor document (finished goods quarantine before release).
  await ensureQualityInspectionFor(token, 'OQC', {
    refType: 'completion', refNo: completionCode, refId: Number(completion.id), productId,
    lotNo, lotQty: qty,
  })
}

/**
 * B6: OQC release for one posted completion — the --release-receipt pattern
 * on the finished-goods leg. The quarantined lot's hold stock moves onto a
 * qualified bin (±MOVE pair), the lot turns qualified, and oqc_status lands
 * passed. failed/concession verdicts refuse here (B8 owns the disposition
 * depth); SO-facing finished-goods reservation stays a B7 hook.
 */
export async function releaseCompletion(token: string, completionCode: string): Promise<void> {
  const completions = await rowsOf(token, 'mfg_completions')
  const completion = completions.find(row => row.code === completionCode)
  if (completion === undefined) throw new Error(`no completion ${completionCode}`)
  if (String(completion.oqc_status) === 'passed') {
    console.log(`nocobase-h5: completion ${completionCode} already passed (kept; release is single-shot)`)
    // W5-B4/BP-06 idempotent top-up leg: a first pass whose reservation
    // step hiccupped re-runs it here (reserveForSo is idempotent).
    const moRow = (await rowsOf(token, 'mfg_orders')).find(row => Number(row.id) === Number(completion.mo_id))
    if (moRow !== undefined) await topUpOwingSoReservations(token, Number(moRow.product_id))
    return
  }
  if (String(completion.status) !== 'posted') throw new Error(`OQC 放行被拒：完工单 ${completionCode} 尚未过账（status=${String(completion.status)}）`)
  if (String(completion.oqc_status) !== 'pending') {
    throw new Error(`OQC 放行被拒：完工单 ${completionCode} 检验状态为 ${String(completion.oqc_status)}（不合格/让步处置走 B8 质量域）`)
  }
  const mo = (await rowsOf(token, 'mfg_orders')).find(row => Number(row.id) === Number(completion.mo_id))
  const productId = Number(mo?.product_id ?? 0)
  const qty = Number(completion.qty)
  const lot = (await rowsOf(token, 'wms_lots')).find(row => row.lot_no === String(completion.lot_no))
  if (lot === undefined) throw new Error(`完工单 ${completionCode} 批次 ${String(completion.lot_no)} 缺失`)
  const lotId = Number(lot.id)
  const stocks = await rowsOf(token, 'wms_stock', 500)
  const holdRow = stocks.find(row => row.product_id === productId && row.lot_id === lotId && row.status === 'hold')
  if (holdRow === undefined) throw new Error(`完工批次 ${String(completion.lot_no)} 无待检库存行（可能已放行）`)
  const products = await rowsOf(token, 'hub_inv_products', 200)
  const product = products.find(row => Number(row.id) === productId)
  const zones = await rowsOf(token, 'wms_zones')
  const bins = await rowsOf(token, 'wms_bins', 200)
  const zone = zones.find(row => row.temp_zone === (product?.temp_zone ?? 'ambient') && row.code !== QUARANTINE_ZONE_CODE && row.code !== WIP_ZONE_CODE)
  const destBin = bins.find(row => row.status === 'idle' && (zone === undefined || row.zone_id === zone.id) && Number(row.id) !== Number(holdRow.bin_id))
    ?? bins.find(row => row.status !== 'disabled' && Number(row.id) !== Number(holdRow.bin_id))
  if (destBin === undefined) throw new Error('no eligible qualified bin for the OQC release')
  await applyStockDelta(token, { productId, binId: Number(holdRow.bin_id), lotId }, -qty)
  const dest = (await rowsOf(token, 'wms_stock', 500)).find(row => row.product_id === productId && row.bin_id === Number(destBin.id) && row.lot_id === lotId)
  if (dest === undefined) {
    await dataOf(token, 'POST', '/api/wms_stock:create', {
      product: { id: productId }, bin: { id: Number(destBin.id) }, lot: { id: lotId }, status: 'good',
      qty_on_hand: qty, qty_allocated: 0, qty_locked: 0, qty_available: qty, version: 1,
    })
  } else {
    await applyStockDelta(token, { productId, binId: Number(destBin.id), lotId }, qty)
  }
  await dataOf(token, 'POST', `/api/wms_lots:update?filterByTk=${lotId}`, { status: 'qualified' })
  await appendMovement(token, {
    move_type: 'MOVE', doc_no: completionCode,
    product: { id: productId }, lot: { id: lotId }, from_bin: { id: Number(holdRow.bin_id) },
    qty: -qty, note: 'OQC 放行转合格区·待检出',
  })
  await appendMovement(token, {
    move_type: 'MOVE', doc_no: completionCode,
    product: { id: productId }, lot: { id: lotId }, to_bin: { id: Number(destBin.id) },
    qty, note: 'OQC 放行转合格区·合格入',
  })
  await dataOf(token, 'POST', `/api/mfg_completions:update?filterByTk=${completion.id}`, { oqc_status: 'passed' })
  console.log(`nocobase-h5: completion ${completionCode} released — lot ${String(completion.lot_no)} → qualified，stock hold→good via ${String(destBin.code)}，±MOVE pair appended`)
  await topUpOwingSoReservations(token, productId)
}

/**
 * W5-B4/BP-06: the released finished goods auto-top-up every open approved SO
 * that still owes this product — reserveForSo is idempotent and reports
 * (never refuses on) a remaining shortfall, so the manual half-step before
 * shipping is gone. The call runs as a child CLI (mrp-run statically imports
 * this module's writers; a dynamic import back would deadlock the module
 * graph under this module's top-level await).
 */
async function topUpOwingSoReservations(token: string, productId: number): Promise<void> {
  const openSos = (await rowsOf(token, 'so_orders')).filter(row => String(row.doc_status) === 'approved' && String(row.shipping_status) !== 'shipped')
  if (openSos.length === 0) return
  const lines = await rowsOf(token, 'so_order_lines')
  const owing = openSos.filter(so => lines.some(line => Number(line.order_id) === Number(so.id) && Number(line.product_id) === productId && Number(line.qty ?? 0) > Number(line.qty_shipped ?? 0)))
  for (const so of owing) {
    console.log(`nocobase-h5: [auto-reserve] OQC 放行 → 补 SO 预留 ${String(so.code)}（W5-B4 生效侧自动推进）`)
    const child = spawnSync('node', ['--import', 'tsx/esm', fileURLToPath(new URL('./mrp-run.mts', import.meta.url)), '--reserve-so', String(so.code)], { stdio: 'inherit' })
    if (child.status !== 0) throw new Error(`auto-reserve：mrp-run --reserve-so ${String(so.code)} 失败（exit ${String(child.status)}）`)
  }
}

// ─── B8: the quality-domain engine (三检挂点建单 / AQL 查表判定 / 四路处置 / 季度物化) ───
// W2-B1 升级:查表键 (lot_band, aql) → (lot_band, aql, rigor) 三元组,tightened
// 改查真加严主表(删除「AQL 降一档查正常表」近似),严格度状态机扩四态
// (normal/tightened/relaxed→reduced/suspended)+ 转移得分(9.3.3.2)。

/**
 * W2-B1: the accepted AQL rungs (GB/T 2828.1—2012 一般水平 II 一次抽样,
 * qm_aql_plans 全 15 段主表种子; tightened/reduced 只落 1.0/2.5 两档——
 * 其余档位的加严/放宽列未全量点验, 查表未命中组合 fail-loud).
 */
export const AQL_RUNGS: ReadonlyArray<string> = ['0.65', '1.0', '1.5', '2.5', '4.0']

/** The same rungs ordered loose → strict (转移得分的「AQL 加严一级」检索链). */
const AQL_STRICTER_CHAIN: ReadonlyArray<string> = ['4.0', '2.5', '1.5', '1.0', '0.65']

/**
 * Map srm_suppliers.iqc_level (the h4 enum: relaxed/normal/tightened/suspended)
 * onto the master-table rigor vocabulary (normal/tightened/reduced) plus the
 * suspended gate state.
 */
function rigorFromIqcLevel(level: string): 'normal' | 'tightened' | 'reduced' | 'suspended' {
  if (level === 'tightened' || level === 'suspended') return level
  if (level === 'relaxed') return 'reduced'
  return 'normal'
}

/**
 * B8: auto-create the anchor inspection document when a posting lands —
 * postReceipt (PO-sourced → IQC), postJobReport (qc_status pending → IPQC),
 * postCompletion (→ OQC). The row is business-key idempotent on
 * (insp_type, ref_no); before nocobase-w8-quality.mts has built qm_* the
 * anchor explains-and-skips (the all chain runs w3/w6 before w8).
 * @param ref - the anchor row's identity (type, source document, product, lot quantity).
 */
async function ensureQualityInspectionFor(token: string, inspType: 'IQC' | 'IPQC' | 'OQC', ref: {
  refType: string, refNo: string, refId: number, productId: number, supplierId?: number, lotNo: string, lotQty: number,
}): Promise<void> {
  const collection = await dataOf(token, 'GET', '/api/collections/qm_inspections')
  if (collection === null) {
    console.log(`nocobase-h5: qm_inspections 未建——${inspType} 挂点为 ${ref.refNo} 跳过（先跑 nocobase-w8-quality.mts）`)
    return
  }
  const rows = await rowsOf(token, 'qm_inspections')
  if (rows.some(row => row.insp_type === inspType && row.ref_no === ref.refNo)) return
  const year = new Date().getFullYear()
  const max = rows
    .filter(row => String(row.code ?? '').startsWith(`QI-${year}-`))
    .reduce((best, row) => Math.max(best, Number(String(row.code).split('-')[2] ?? 0)), 0)
  const code = `QI-${year}-${String(max + 1).padStart(4, '0')}`
  await dataOf(token, 'POST', '/api/qm_inspections:create', {
    code, insp_type: inspType, ref_type: ref.refType, ref_id: ref.refId, ref_no: ref.refNo,
    product: { id: ref.productId },
    ...(ref.supplierId === undefined ? {} : { supplier: { id: ref.supplierId } }),
    lot_no: ref.lotNo, lot_qty: ref.lotQty, sample_qty: 0,
    defect_critical: 0, defect_major: 0, defect_minor: 0,
    result: 'pending', status: 'pending', inspector: '', note: `${inspType} 挂点自动建单（${ref.refNo}）`,
  })
  console.log(`nocobase-h5: ${inspType} 检验单 ${code} 挂点建单（${ref.refNo}，批量 ${String(ref.lotQty)}）`)
}

/**
 * B8/W2-B1: record one AQL sampling verdict on a pending inspection — resolve
 * the lot band + the supplier's four-state rigor (normal/tightened/reduced/
 * suspended), look the sampling array up in qm_aql_plans by the (lot_band,
 * aql, rigor) triple (cache columns n/Ac/Re land on the row so the verdict is
 * recomputable by hand), judge `d ≤ Ac → passed / d ≥ Re → failed` with
 * critical defects rejecting outright (严重 0 收 1 拒), write the verdict back
 * onto the anchor document (receipt.iqc_status / report.qc_status /
 * completion.oqc_status), open a CAPA draft on failed (business-key
 * idempotent), and advance the four-state switch machine (初次检验连续 5 批
 * 2 拒 → tightened；加严下接连 5 批过 → normal；加严下累计 5 拒 →
 * suspended；normal 维护转移得分 9.3.3.2；reduced 任一批拒 → normal).
 * Suspended suppliers are refused at the entrance (恢复走 --iqc-resume).
 * 再提交批（resubmission）只更新判定本体，不进任何计数器（9.3.1 不考虑
 * 再提交批）。
 * @param defects - the three severity counts found in the sample.
 * @param inspector - the recording inspector's name (audit element).
 * @param aql - the target AQL rung ('0.65'|'1.0'|'1.5'|'2.5'|'4.0'; default 2.5, 食品常用).
 * @param options - resubmission marks this lot a re-submitted one (counters skip it).
 * @returns the judged verdict with the cached sampling array for the receipt.
 */
export async function inspectInspection(token: string, code: string, defects: { critical: number, major: number, minor: number }, inspector: string, aql = '2.5', options: { resubmission?: boolean } = {}): Promise<{
  result: 'passed' | 'failed', band: string, letter: string, aqlUsed: string, rigor: 'normal' | 'tightened' | 'reduced', n: number, ac: number, re: number, d: number,
}> {
  const inspections = await rowsOf(token, 'qm_inspections')
  const inspection = inspections.find(row => row.code === code)
  if (inspection === undefined) throw new Error(`no inspection ${code}`)
  if (inspection.result !== 'pending') throw new Error(`检验单 ${code} 已判定（result=${String(inspection.result)}；判定 single-shot）`)
  const lotQty = Number(inspection.lot_qty ?? 0)
  if (lotQty <= 0) throw new Error(`检验单 ${code} 批量为 ${String(lotQty)}——先补 lot_qty 再判定`)
  if (!AQL_RUNGS.includes(aql)) throw new Error(`AQL 档仅接受 ${AQL_RUNGS.join('/')}（收到 ${aql}）`)
  const band = LOT_BANDS.find(row => lotQty >= row.min && (row.max === null || lotQty <= row.max))
  if (band === undefined) throw new Error(`批量 ${String(lotQty)} 不在 GB/T 2828.1—2012 表 1 的 15 个批量段内（N<2 无方案）——人工判定`)
  // The switch state rides srm_suppliers.iqc_level (IQC rows carry the supplier).
  const supplierId = inspection.supplier_id === null || inspection.supplier_id === undefined ? undefined : Number(inspection.supplier_id)
  let switchState: 'normal' | 'tightened' | 'reduced' | 'suspended' = 'normal'
  if (String(inspection.insp_type) === 'IQC' && supplierId !== undefined) {
    const supplier = (await rowsOf(token, 'srm_suppliers')).find(row => Number(row.id) === supplierId)
    switchState = rigorFromIqcLevel(String(supplier?.iqc_level ?? 'normal'))
  }
  if (switchState === 'suspended') {
    throw new Error(`供应商 #${String(supplierId)} IQC 已停检（加严下累计 5 批不接收，GB/T 2828.1—2012 9.4）——供方改进且负责部门认可后经 --iqc-resume 恢复（从加严开始）`)
  }
  const rigor = switchState
  const plans = await rowsOf(token, 'qm_aql_plans', 500)
  const plan = plans.find(row => String(row.lot_band) === band.label && String(row.aql) === aql && String(row.rigor ?? 'normal') === rigor)
  if (plan === undefined) {
    throw new Error(`AQL 查表未命中：批量 ${String(lotQty)}（${band.label}）× AQL ${aql} × ${rigor} 不在 qm_aql_plans 种子内——该严格度档位未落（tightened/reduced 仅 1.0/2.5），人工判定或补种子`)
  }
  const n = Number(plan.n)
  if (n >= lotQty) {
    throw new Error(`解析后样本量 n=${String(n)} ≥ 批量 ${String(lotQty)}——按 GB/T 2828.1—2012 表 2 脚注转全检（100% 检验），不走抽样判定；人工全检后凭结果处置`)
  }
  const ac = Number(plan.ac)
  const re = Number(plan.re)
  const d = defects.major + defects.minor
  const result = defects.critical > 0 || d >= re ? 'failed' : 'passed'
  const today = new Date().toISOString().slice(0, 10)
  await dataOf(token, 'POST', `/api/qm_inspections:update?filterByTk=${inspection.id}`, {
    sample_qty: n, defect_critical: defects.critical, defect_major: defects.major, defect_minor: defects.minor,
    aql_code: String(plan.code), aql_n: n, aql_ac: ac, aql_re: re, aql_target: aql,
    rigor, resubmission: options.resubmission === true,
    result, inspector, inspected_at: today, status: 'closed',
    note: `AQL ${aql}（${rigor}）× 批量 ${String(lotQty)}（${band.label}/${String(plan.code)}）→ n=${String(n)} Ac=${String(ac)} Re=${String(re)}；d=${String(d)}${defects.critical > 0 ? ` + 严重 ${String(defects.critical)}（0收1拒）` : ''} → ${result === 'passed' ? 'd≤Ac 接收' : 'd≥Re 拒收'}${options.resubmission === true ? '；再提交批（不进转移计数，9.3.1）' : ''}`,
  })
  // Write the verdict back onto the anchor document (single-shot semantics:
  // an anchor already past a verdict keeps it). W5-B4/BP-05+06: a passed IQC
  // auto-releases the receipt into the qualified zone and a passed OQC
  // auto-releases the finished-goods lot (which then tops up the SO
  // reservations inside releaseCompletion) — the half-step manual release is
  // gone; failed/concession verdicts keep their human disposition paths.
  if (String(inspection.insp_type) === 'IQC' && String(inspection.ref_type) === 'receipt') {
    const receipt = (await rowsOf(token, 'wms_receipts')).find(row => row.receipt_no === String(inspection.ref_no))
    if (receipt !== undefined && (receipt.iqc_status === null || receipt.iqc_status === undefined || receipt.iqc_status === '' || receipt.iqc_status === 'pending')) {
      await dataOf(token, 'POST', `/api/wms_receipts:update?filterByTk=${receipt.id}`, { iqc_status: result })
    }
    if (result === 'passed' && receipt !== undefined && String(receipt.status) === 'posted') {
      console.log(`nocobase-h5: [auto-release] IQC passed → 放行入库 ${String(receipt.receipt_no)}（W5-B4 生效侧自动推进）`)
      await releaseReceipt(token, String(receipt.receipt_no))
    }
  } else if (String(inspection.insp_type) === 'IPQC' && String(inspection.ref_type) === 'job_report') {
    const report = (await rowsOf(token, 'mfg_job_reports')).find(row => row.code === String(inspection.ref_no))
    if (report !== undefined && (report.qc_status === null || report.qc_status === undefined || report.qc_status === '' || report.qc_status === 'pending')) {
      await dataOf(token, 'POST', `/api/mfg_job_reports:update?filterByTk=${report.id}`, { qc_status: result })
    }
  } else if (String(inspection.insp_type) === 'OQC' && String(inspection.ref_type) === 'completion') {
    const completion = (await rowsOf(token, 'mfg_completions')).find(row => row.code === String(inspection.ref_no))
    if (completion !== undefined && (completion.oqc_status === null || completion.oqc_status === undefined || completion.oqc_status === '' || completion.oqc_status === 'pending')) {
      await dataOf(token, 'POST', `/api/mfg_completions:update?filterByTk=${completion.id}`, { oqc_status: result })
    }
    if (result === 'passed' && completion !== undefined && String(completion.status) === 'posted' && String(completion.oqc_status ?? 'pending') === 'pending') {
      console.log(`nocobase-h5: [auto-release] OQC passed → 成品放行 ${String(completion.code)}（W5-B4 生效侧自动推进）`)
      await releaseCompletion(token, String(completion.code))
    }
  }
  // failed → CAPA draft (business-key idempotent on title; the inspection
  // code column ties the row back to this verdict).
  if (result === 'failed') {
    const capas = await rowsOf(token, 'srm_capas')
    const title = `检验不合格·${code}`
    if (!capas.some(row => row.title === title)) {
      await dataOf(token, 'POST', '/api/srm_capas:create', {
        ...(supplierId === undefined ? {} : { supplier: { id: supplierId } }),
        source: 'iqc', title, description: `${code}（${String(inspection.insp_type)}，${String(inspection.ref_no)}）判定 failed：d=${String(d)} ≥ Re=${String(re)}${defects.critical > 0 ? `，严重缺陷 ${String(defects.critical)}（0收1拒）` : ''}`,
        status: 'initiated', owner: '质量部', due_date: new Date(Date.now() + 14 * 86_400_000).toISOString().slice(0, 10),
        inspection_code: code,
      })
      console.log(`nocobase-h5: CAPA 草稿「${title}」已发起（srm_capas.inspection_code 关联）`)
    }
  }
  // The four-state switch machine (IQC only; 初次检验序列排除再提交批).
  // normal→tightened 9.3.1 (连续 5 批 2 拒) / tightened→normal 9.3.2 (接连
  // 5 批接收) / tightened→suspended 9.4 (加严下累计 5 拒——进入加严清零由
  // 判定行的 rigor 快照打断实现) / normal 维护转移得分 9.3.3.2 / reduced→
  // normal 9.3.4 (任一批不接收).
  if (String(inspection.insp_type) === 'IQC' && supplierId !== undefined && options.resubmission !== true) {
    const closed = (await rowsOf(token, 'qm_inspections'))
      .filter(row => String(row.insp_type) === 'IQC' && Number(row.supplier_id) === supplierId && String(row.status) === 'closed' && row.resubmission !== true)
      .sort((a, b) => Number(b.id) - Number(a.id))
    const last5 = closed.slice(0, 5)
    const rejects = last5.filter(row => String(row.result) === 'failed').length
    const suppliers = await rowsOf(token, 'srm_suppliers')
    const supplier = suppliers.find(row => Number(row.id) === supplierId)
    if (supplier !== undefined) {
      const current = rigorFromIqcLevel(String(supplier.iqc_level ?? 'normal'))
      // 转移得分 (9.3.3.2): normal 态逐批更新——接收时 Ac≥2 档须「AQL 加严
      // 一级后仍接收」+3 否则清零, Ac=0/1 档 +2; 拒收清零. 加严一级检索走
      // normal 主表; 0.65 已是入种最严档无更严档——保守退化为 +2 (W2-B1
      // Agent Note 记录该裁定). 离开 normal 即清零.
      let score = Number(supplier.switch_score ?? 0)
      if (current === 'normal') {
        if (result === 'passed') {
          const stricterIndex = AQL_STRICTER_CHAIN.indexOf(aql) + 1
          const stricterAql = stricterIndex < AQL_STRICTER_CHAIN.length ? AQL_STRICTER_CHAIN[stricterIndex] : undefined
          const stricterPlan = stricterAql === undefined ? undefined : plans.find(row => String(row.lot_band) === band.label && String(row.aql) === stricterAql && String(row.rigor ?? 'normal') === 'normal')
          score = ac >= 2
            ? stricterPlan !== undefined && d <= Number(stricterPlan.ac) ? score + 3 : 0
            : score + 2
        } else {
          score = 0
        }
      }
      let next = current
      if (current === 'normal' && last5.length === 5 && rejects >= 2) next = 'tightened'
      else if (current === 'tightened' && last5.length === 5 && rejects === 0) next = 'normal'
      else if (current === 'reduced' && result === 'failed') next = 'normal'
      if (current === 'tightened') {
        let tightenedRejects = 0
        for (const row of closed) {
          if (String(row.rigor) !== 'tightened') break
          if (String(row.result) === 'failed') tightenedRejects += 1
        }
        if (tightenedRejects >= 5) next = 'suspended'
      }
      if (next !== current) score = 0
      const nextLevel = next === 'reduced' ? 'relaxed' : next
      if (nextLevel !== String(supplier.iqc_level ?? 'normal')) {
        await dataOf(token, 'POST', `/api/srm_suppliers:update?filterByTk=${supplierId}`, { iqc_level: nextLevel })
        console.log(`nocobase-h5: 供应商 #${String(supplierId)} IQC 严格度切换 ${current} → ${next}（GB/T 2828.1—2012 第 9 章；最近 5 批初次检验 ${String(rejects)} 拒）`)
      }
      const streak = closed.reduce((run, row) => String(row.result) === 'failed' ? run + 1 : run, 0)
      await dataOf(token, 'POST', `/api/srm_suppliers:update?filterByTk=${supplierId}`, { switch_score: score, reject_streak: streak })
    }
  }
  console.log(`nocobase-h5: inspection ${code} → ${result}（批量 ${String(lotQty)}=${band.label}/${String(plan.code)}，AQL ${aql}（${rigor}），n=${String(n)} Ac=${String(ac)} Re=${String(re)}，d=${String(d)}${defects.critical > 0 ? ` +严重${String(defects.critical)}` : ''}${options.resubmission === true ? '，再提交批' : ''}）`)
  return { result, band: band.label, letter: String(plan.code), aqlUsed: aql, rigor, n, ac, re, d }
}

/**
 * W2-B1: 恢复停检供应商（GB/T 2828.1—2012 9.4——供方采取有效改进且负责
 * 部门认可后从加严检验恢复；本 CLI 动作即负责部门认可的留痕）。
 * @param supplierCode - the srm_suppliers.code (e.g. SUP-006).
 */
export async function iqcResume(token: string, supplierCode: string): Promise<void> {
  const supplier = (await rowsOf(token, 'srm_suppliers')).find(row => String(row.code) === supplierCode)
  if (supplier === undefined) throw new Error(`no supplier ${supplierCode}`)
  if (String(supplier.iqc_level) !== 'suspended') throw new Error(`供应商 ${supplierCode} iqc_level=${String(supplier.iqc_level)}——仅 suspended 停检态可恢复（恢复从加严开始，9.4）`)
  await dataOf(token, 'POST', `/api/srm_suppliers:update?filterByTk=${supplier.id}`, { iqc_level: 'tightened', reject_streak: 0 })
  console.log(`nocobase-h5: 供应商 ${supplierCode} IQC 停检恢复 suspended → tightened（供方改进 + 负责部门认可，CLI 留痕）`)
}

/**
 * W2-B1: 放宽检验入口（GB/T 2828.1—2012 9.3.3——三条件同时满足：转移得分
 * ≥30 由本函数校验计数器；生产稳定 + 负责部门同意由该 CLI 显式动作承载
 * 留痕）。离开正常即清零转移得分。
 * @param supplierCode - the srm_suppliers.code (e.g. SUP-004).
 */
export async function iqcRelax(token: string, supplierCode: string): Promise<void> {
  const supplier = (await rowsOf(token, 'srm_suppliers')).find(row => String(row.code) === supplierCode)
  if (supplier === undefined) throw new Error(`no supplier ${supplierCode}`)
  if (String(supplier.iqc_level) !== 'normal') throw new Error(`供应商 ${supplierCode} iqc_level=${String(supplier.iqc_level)}——仅 normal 正常态可放宽（9.3.3）`)
  const score = Number(supplier.switch_score ?? 0)
  if (score < 30) throw new Error(`供应商 ${supplierCode} 转移得分 ${String(score)} < 30——不满足放宽条件（9.3.3；Ac=0/1 档接收每批 +2，拒收即清零）`)
  await dataOf(token, 'POST', `/api/srm_suppliers:update?filterByTk=${supplier.id}`, { iqc_level: 'relaxed', switch_score: 0 })
  console.log(`nocobase-h5: 供应商 ${supplierCode} IQC 放宽 normal → relaxed（转移得分 ${String(score)} ≥30 + 生产稳定 + 负责部门同意，CLI 留痕）`)
}

/**
 * B8: create one NC disposition draft for a failed inspection (four-way
 * choice: return / concession / rework / scrap). The draft stays doc_status
 * draft until --dispose walks it through the approval engine.
 * @param action - return | concession | rework | scrap.
 * @param reason - optional free-text rationale recorded on the row.
 */
export async function createNc(token: string, inspectionCode: string, action: string, reason = ''): Promise<string> {
  if (!['return', 'concession', 'rework', 'scrap'].includes(action)) {
    throw new Error(`处置四路仅接受 return/concession/rework/scrap（收到 ${action}）`)
  }
  const inspections = await rowsOf(token, 'qm_inspections')
  const inspection = inspections.find(row => row.code === inspectionCode)
  if (inspection === undefined) throw new Error(`no inspection ${inspectionCode}`)
  if (String(inspection.result) !== 'failed') throw new Error(`检验单 ${inspectionCode} 判定为 ${String(inspection.result)}——仅 failed 可开处置单`)
  const rows = await rowsOf(token, 'qm_nc_dispositions')
  const year = new Date().getFullYear()
  const prefix = `QM-NC-${year}-`
  const max = rows
    .filter(row => String(row.code ?? '').startsWith(prefix))
    .reduce((best, row) => Math.max(best, Number(String(row.code).split('-')[3] ?? 0)), 0)
  const code = `${prefix}${String(max + 1).padStart(4, '0')}`
  await dataOf(token, 'POST', '/api/qm_nc_dispositions:create', {
    code, inspection: { id: Number(inspection.id) }, action, reason,
    doc_status: 'draft', status: 'open', ref_no: '', scrap_cost: 0,
  })
  console.log(`nocobase-h5: NC 处置单 ${code}（${action}）draft 已建（检验单 ${inspectionCode}）`)
  return code
}

/**
 * B8: execute one NC disposition through the B1 engine and the four-way
 * stock consequences. Every route submits + approves through the approval
 * engine (audit rows land in wfl_approval_records); concession additionally
 * refuses without approver + deviation_note (让步必审批留痕). Consequences:
 * return → RETURN_VENDOR leg off the quarantine bin; concession → receipt
 * released with concession marked (lot.concession_flag) and the inspection
 * result re-labeled concession; rework → a source=rework MO draft; scrap →
 * SCRAP leg to the Inventory-Loss counterpart with scrap_cost settled at
 * VWAP. 检验单 + 处置单 + 库存移动三方勾稽 follows from the movement's
 * doc_no carrying the disposition code.
 * @param code - the NC disposition code (QM-NC-YYYY-NNNN).
 * @param options - approver and deviation_note for the concession route.
 */
export async function disposeNc(token: string, code: string, options: { approver?: string, deviationNote?: string } = {}): Promise<void> {
  const rows = await rowsOf(token, 'qm_nc_dispositions')
  const nc = rows.find(row => row.code === code)
  if (nc === undefined) throw new Error(`no NC disposition ${code}`)
  if (String(nc.status) === 'closed') {
    console.log(`nocobase-h5: NC 处置单 ${code} already closed (kept; disposal is single-shot)`)
    return
  }
  const action = String(nc.action)
  const inspections = await rowsOf(token, 'qm_inspections')
  const inspection = inspections.find(row => Number(row.id) === Number(nc.inspection_id))
  if (inspection === undefined) throw new Error(`NC 处置单 ${code} 关联的检验单 #${String(nc.inspection_id)} 不存在`)
  const inspType = String(inspection.insp_type)
  const approver = options.approver ?? String(nc.approver ?? '')
  const deviationNote = options.deviationNote ?? String(nc.deviation_note ?? '')
  if (action === 'concession' && (approver === '' || deviationNote === '')) {
    throw new Error('让步接收必审批留痕：--approver 与 --deviation-note 必填（空则拒）')
  }
  if (action !== 'rework' && inspType === 'IPQC') {
    throw new Error(`IPQC 不合格仅接受返工（rework）——工序在制品无退供/让步/报废路径（${code}）`)
  }
  // The B1 walk: submit (质量部) → approve; concession rides the deviation
  // note as the approval comment. The call rides the engine's HTTP serve
  // (:13110) — the same entry the page workflow request node uses — because
  // importing approval-engine from here deadlocks: this module's own top-level
  // await main() holds the module record in evaluating, so approval-engine's
  // static import of this file would wait on a module that is waiting on it.
  const write: Record<string, unknown> = {}
  if (approver !== '') write.approver = approver
  if (deviationNote !== '') write.deviation_note = deviationNote
  if (String(nc.doc_status) !== 'approved') {
    if (Object.keys(write).length > 0) await dataOf(token, 'POST', `/api/qm_nc_dispositions:update?filterByTk=${nc.id}`, write)
    const engineAct = async (path: 'submit' | 'act', body: Record<string, unknown>): Promise<void> => {
      const response = await fetch(`http://127.0.0.1:${String(ENGINE_CALLBACK_PORT)}/${path}`, {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
      })
      const payload = await response.json().catch(() => ({ ok: false, error: `HTTP ${String(response.status)}` })) as { ok?: boolean, error?: string }
      if (!payload.ok) throw new Error(`B1 引擎回调 /${path} 失败：${payload.error ?? `HTTP ${String(response.status)}`}（先起 approval-engine --serve 13110）`)
    }
    const docStatus = String(nc.doc_status)
    if (docStatus === 'draft' || docStatus === 'rejected' || docStatus === 'void') {
      await engineAct('submit', { doc_type: 'qm_nc_dispositions', doc_id: Number(nc.id), approver: '质量部' })
    }
    if (docStatus !== 'approved') {
      await engineAct('act', { doc_type: 'qm_nc_dispositions', doc_id: Number(nc.id), action: 'approve', approver: approver === '' ? 'admin' : approver, comment: deviationNote === '' ? undefined : deviationNote })
    }
    console.log(`nocobase-h5: NC 处置单 ${code} 审批通过（B1 留痕：submit 质量部 → approve ${approver === '' ? 'admin' : approver}）`)
  }
  const lotQty = Number(inspection.lot_qty ?? 0)
  const productId = Number(inspection.product_id)
  const stocks = await rowsOf(token, 'wms_stock', 500)
  const lossBin = (await rowsOf(token, 'wms_bins', 200)).find(row => row.code === `${LOSS_ZONE_CODE}-01-01`)
  if (lossBin === undefined) throw new Error(`差异库位 ${LOSS_ZONE_CODE}-01-01 缺失——重跑 nocobase-h5-wms.mts 补 B4 种子`)
  if (action === 'return') {
    const receipt = (await rowsOf(token, 'wms_receipts')).find(row => row.receipt_no === String(inspection.ref_no))
    const binId = receipt?.target_bin_id === null || receipt?.target_bin_id === undefined ? undefined : Number(receipt.target_bin_id)
    const lot = (await rowsOf(token, 'wms_lots')).find(row => row.lot_no === String(inspection.lot_no ?? receipt?.lot_no ?? ''))
    if (binId === undefined || lot === undefined) throw new Error(`退货处置缺库存定位：receipt ${String(inspection.ref_no)} 的库位/批次未解析（${code}）`)
    const hold = stocks.find(row => row.product_id === productId && row.bin_id === binId && row.lot_id === Number(lot.id))
    if (hold === undefined) throw new Error(`退货处置无待检库存行（product ${String(productId)} × bin ${String(binId)} × lot ${String(lot.lot_no)}）——可能已处置（${code}）`)
    await applyStockDelta(token, { productId, binId, lotId: Number(lot.id) }, -lotQty)
    await appendMovement(token, {
      move_type: 'RETURN_VENDOR', doc_no: code, product: { id: productId }, lot: { id: Number(lot.id) },
      from_bin: { id: binId }, qty: -lotQty, note: `不合格退货退供应商（检验单 ${String(inspection.code)}，${String(inspection.ref_no)}）`,
    })
    console.log(`nocobase-h5: ${code} 退货过账 — 待检 −${String(lotQty)}，RETURN_VENDOR 流水（三方勾稽：检验单 ${String(inspection.code)} + 处置单 + doc_no=${code}）`)
  } else if (action === 'concession') {
    const receiptNo = String(inspection.ref_no)
    await dataOf(token, 'POST', `/api/qm_inspections:update?filterByTk=${inspection.id}`, { result: 'concession' })
    const receipts = await rowsOf(token, 'wms_receipts')
    const receipt = receipts.find(row => row.receipt_no === receiptNo)
    if (receipt !== undefined && String(receipt.iqc_status) !== 'concession') {
      await dataOf(token, 'POST', `/api/wms_receipts:update?filterByTk=${receipt.id}`, { iqc_status: 'concession' })
    }
    await releaseReceipt(token, receiptNo)
    const lot = (await rowsOf(token, 'wms_lots')).find(row => row.lot_no === String(inspection.lot_no ?? receipt?.lot_no ?? ''))
    if (lot !== undefined) {
      await dataOf(token, 'POST', `/api/wms_lots:update?filterByTk=${lot.id}`, { concession_flag: true })
    }
    console.log(`nocobase-h5: ${code} 让步接收 — receipt ${receiptNo} 放行（concession），批次 concession_flag 标记，检验单 result=concession`)
  } else if (action === 'rework') {
    const orders = await rowsOf(token, 'mfg_orders')
    const year = new Date().getFullYear()
    const max = orders
      .filter(row => String(row.code ?? '').startsWith(`RW-${year}-`))
      .reduce((best, row) => Math.max(best, Number(String(row.code).split('-')[2] ?? 0)), 0)
    const moCode = `RW-${year}-${String(max + 1).padStart(4, '0')}`
    await dataOf(token, 'POST', '/api/mfg_orders:create', {
      code: moCode, product: { id: productId }, qty: lotQty, doc_status: 'draft', source: 'rework',
      need_date: new Date(Date.now() + 3 * 86_400_000).toISOString().slice(0, 10),
      note: `返工工单（不合格处置 ${code}，检验单 ${String(inspection.code)}）`,
    })
    await dataOf(token, 'POST', `/api/qm_nc_dispositions:update?filterByTk=${nc.id}`, { ref_no: moCode })
    console.log(`nocobase-h5: ${code} 返工 — rework MO ${moCode} draft 已建（source=rework，完工后回检）`)
  } else if (action === 'scrap') {
    const receipts = await rowsOf(token, 'wms_receipts')
    const receipt = receipts.find(row => row.receipt_no === String(inspection.ref_no))
    const lotNo = String(inspection.lot_no ?? receipt?.lot_no ?? '')
    const lot = (await rowsOf(token, 'wms_lots')).find(row => row.lot_no === lotNo)
    const hold = lot === undefined ? undefined : stocks.find(row => row.product_id === productId && row.lot_id === Number(lot.id) && row.status === 'hold')
      ?? stocks.find(row => row.product_id === productId && row.lot_id === Number(lot.id))
    if (hold === undefined) throw new Error(`报废处置无可报废库存行（lot ${lotNo}）——可能已处置（${code}）`)
    const qty = Math.min(lotQty, Number(hold.qty_on_hand ?? 0))
    await applyStockDelta(token, { productId, binId: Number(hold.bin_id), lotId: Number(lot?.id) }, -qty)
    const cost = Number((qty * await movingAverageCost(token, productId)).toFixed(2))
    await appendMovement(token, {
      move_type: 'SCRAP', doc_no: code, product: { id: productId }, ...(lot === undefined ? {} : { lot: { id: Number(lot.id) } }),
      from_bin: { id: Number(hold.bin_id) }, qty: -qty, note: `不合格报废（对手 ${LOSS_ZONE_CODE}，检验单 ${String(inspection.code)}，成本 ¥${String(cost)}）`,
    })
    await dataOf(token, 'POST', `/api/qm_nc_dispositions:update?filterByTk=${nc.id}`, { scrap_cost: cost })
    console.log(`nocobase-h5: ${code} 报废过账 — −${String(qty)} 对手差异库位，SCRAP 流水，scrap_cost=¥${String(cost)}（VWAP）`)
  }
  await dataOf(token, 'POST', `/api/qm_nc_dispositions:update?filterByTk=${nc.id}`, { status: 'closed' })
  console.log(`nocobase-h5: NC 处置单 ${code}（${action}）closed`)
}

/** The inclusive [from, to] ISO-date window one quarter label ('2026Q3') covers. */
function quarterRange(period: string): { from: string, to: string } | undefined {
  const match = /^(\d{4})Q([1-4])$/.exec(period)
  if (match === null) return undefined
  const year = Number(match[1])
  const quarter = Number(match[2])
  const from = new Date(Date.UTC(year, (quarter - 1) * 3, 1))
  const to = new Date(Date.UTC(year, quarter * 3, 0))
  const fmt = (d: Date): string => d.toISOString().slice(0, 10)
  return { from: fmt(from), to: fmt(to) }
}

/**
 * B8: materialize the quarterly supplier scorecards from real documents —
 * quality = window IQC pass rate, delivery = on-time receipt rate
 * (received_at vs the PO's expected_date; undated POs count on-time with the
 * neutral fallback when nothing is dated), price = cheapest supplier average
 * ÷ own average (capped 100), service = 100 − 10 × open CAPA count (floor
 * 0), compliance = the latest audit grade mapped A95/B85/C70/D55/E50. The
 * weighted total rides 质量40/交付30/价格20/服务10 (行业惯例未溯源 — the
 * Agent Note records the unprovenance) and lands rating A≥90 / B≥75 / C≥60 /
 * D<60 with rating_change vs the supplier's previous period. D-grade rows
 * log the lifecycle→restricted suggestion; the lifecycle flip itself stays
 * a human approval (B1).
 * @param period - the quarter label ('2026Q3').
 * @returns one summary line per materialized supplier.
 */
export async function calcScorecard(token: string, period: string): Promise<Array<{ supplier: string, total: number, rating: string }>> {
  const window = quarterRange(period)
  if (window === undefined) throw new Error(`考核期格式应为 YYYYQn（收到 ${period}）`)
  const suppliers = await rowsOf(token, 'srm_suppliers')
  const inspections = await rowsOf(token, 'qm_inspections')
  const receipts = await rowsOf(token, 'wms_receipts')
  const orders = await rowsOf(token, 'pur_orders')
  const lines = await rowsOf(token, 'pur_order_lines')
  const capas = await rowsOf(token, 'srm_capas')
  const audits = await rowsOf(token, 'srm_audit_records')
  const cards = await rowsOf(token, 'srm_score_cards')
  const inWindow = (value: unknown): boolean => {
    const text = String(value ?? '')
    return text !== '' && text >= window.from && text <= window.to
  }
  // Supplier-average unit prices across every PO line (the price axis).
  const avgPriceOf = (supplierId: number): number => {
    const own = lines.filter(line => {
      const po = orders.find(order => Number(order.id) === Number(line.order_id))
      return po !== undefined && Number(po.supplier_id) === supplierId && Number(line.unit_price ?? 0) > 0
    })
    if (own.length === 0) return 0
    return own.reduce((sum, line) => sum + Number(line.unit_price), 0) / own.length
  }
  const supplierAverages = suppliers.map(supplier => avgPriceOf(Number(supplier.id))).filter(avg => avg > 0)
  const cheapestAverage = supplierAverages.length > 0 ? Math.min(...supplierAverages) : 0
  const summaries: Array<{ supplier: string, total: number, rating: string }> = []
  for (const supplier of suppliers) {
    const supplierId = Number(supplier.id)
    const windowIqc = inspections.filter(row =>
      String(row.insp_type) === 'IQC' && Number(row.supplier_id) === supplierId && String(row.status) === 'closed' && inWindow(row.inspected_at))
    if (windowIqc.length === 0) continue
    const passed = windowIqc.filter(row => String(row.result) === 'passed').length
    const quality = passed / windowIqc.length * 100
    const supplierReceipts = receipts.filter(row => Number(row.supplier_id) === supplierId && inWindow(row.received_at) && (String(row.status) === 'posted' || String(row.status) === 'closed'))
    // W5-B5/BP-12: the delivery axis unifies on need_date (the demand date the
    // otd_supplier KPI already reads — 23/26 coverage vs expected_date's 2/26);
    // rows without the date leave the denominator (kpi otdSupplierOf's dated
    // filter), so the same supplier reads the same number here and there.
    const dated = supplierReceipts.flatMap(receipt => {
      const po = orders.find(order => Number(order.id) === Number(receipt.po_id))
      const due = po === undefined ? '' : String(po.need_date ?? '')
      return due === '' ? [] : [{ onTime: String(receipt.received_at) <= due }]
    })
    const delivery = dated.length > 0 ? dated.filter(row => row.onTime).length / dated.length * 100 : 60
    const ownAverage = avgPriceOf(supplierId)
    const price = ownAverage > 0 && cheapestAverage > 0 ? Math.min(100, cheapestAverage / ownAverage * 100) : 60
    const capaCount = capas.filter(row => Number(row.supplier_id) === supplierId && String(row.status) !== 'closed').length
    const service = Math.max(0, 100 - 10 * capaCount)
    const gradeMap: Record<string, number> = { A: 95, B: 85, C: 70, D: 55, E: 50 }
    const latestAudit = audits
      .filter(row => Number(row.supplier_id) === supplierId && String(row.grade ?? '') !== '')
      .sort((a, b) => String(b.audit_date ?? '').localeCompare(String(a.audit_date ?? '')))[0]
    const compliance = gradeMap[String(latestAudit?.grade ?? '')] ?? 60
    const total = Number((quality * 0.4 + delivery * 0.3 + price * 0.2 + service * 0.1).toFixed(1))
    const rating = total >= 90 ? 'A' : total >= 75 ? 'B' : total >= 60 ? 'C' : 'D'
    const prior = cards
      .filter(row => Number(row.supplier_id) === supplierId && String(row.period ?? '') !== period)
      .sort((a, b) => String(b.period ?? '').localeCompare(String(a.period ?? '')))[0]
    const ratingChange = prior === undefined || Number(prior.total_score ?? 0) === total ? 'flat' : Number(prior.total_score ?? 0) < total ? 'up' : 'down'
    const values = {
      supplier: { id: supplierId }, period,
      score_quality: Number(quality.toFixed(1)), score_delivery: Number(delivery.toFixed(1)),
      score_price: Number(price.toFixed(1)), score_service: Number(service.toFixed(1)),
      score_compliance: compliance, total_score: total, rating, rating_change: ratingChange,
    }
    const existing = cards.find(row => Number(row.supplier_id) === supplierId && String(row.period) === period)
    if (existing === undefined) {
      await dataOf(token, 'POST', '/api/srm_score_cards:create', values)
    } else {
      await dataOf(token, 'POST', `/api/srm_score_cards:update?filterByTk=${existing.id}`, values)
    }
    if (rating === 'D') {
      console.log(`nocobase-h5: 供应商 ${String(supplier.name)} 当季 D 档（${String(total)} 分）——建议 lifecycle_status → restricted（人工审批执行，B1 流）`)
    }
    summaries.push({ supplier: String(supplier.name), total, rating })
    console.log(`nocobase-h5: scorecard ${period} ${String(supplier.name)} — 质${String(quality.toFixed(1))}/交${String(delivery.toFixed(1))}/价${String(price.toFixed(1))}/服${String(service.toFixed(1))}/合规${String(compliance)} → ${String(total)} ${rating}（${ratingChange}）`)
  }
  if (summaries.length === 0) console.log(`nocobase-h5: scorecard ${period} 无当季判定供应商（窗口 ${window.from}..${window.to}）——先跑 IQC 判定`)
  return summaries
}

// ─── the B4 demo chain (05-b4 验收 checkbox 1:1; idempotent replay) ───

const here = dirname(fileURLToPath(import.meta.url))

/** Run this script's CLI as a child, failing loud on a non-zero exit. */
function runSelf(args: readonly string[]): void {
  const result = spawnSync('node', ['--import', 'tsx/esm', join(here, 'nocobase-h5-wms.mts'), ...args], { stdio: 'inherit' })
  if (result.status !== 0) throw new Error(`--${String(args[0])} ${args.slice(1).join(' ')} failed (exit ${String(result.status)})`)
}

/** Expect one child engine invocation to refuse; fail loud when it exits 0. */
function expectCliRefusal(label: string, args: readonly string[]): void {
  const result = spawnSync('node', ['--import', 'tsx/esm', join(here, 'nocobase-h5-wms.mts'), ...args], { encoding: 'utf8' })
  const text = `${result.stdout ?? ''}${result.stderr ?? ''}`
  if (result.status === 0) throw new Error(`守卫负例未拦截：${label}（本应非零退出却成功了）`)
  const reason = text.trim().split('\n').filter(line => line.includes('Error') || line.includes('被拒') || line.includes('禁移') || line.includes('不足')).slice(-1)[0] ?? ''
  console.log(`nocobase-h5: [chain] 守卫负例 ✓ ${label} → ${reason.slice(0, 110)}`)
}

async function demoChain(token: string): Promise<void> {
  const bins = await rowsOf(token, 'wms_bins', 200)
  const lots = await rowsOf(token, 'wms_lots')
  const products = await rowsOf(token, 'hub_inv_products', 200)
  const byCode = (code: string): Record<string, any> | undefined => bins.find(row => row.code === code)
  const lotBy = (no: string): Record<string, any> | undefined => lots.find(row => row.lot_no === no)
  const productBy = (sku: string): Record<string, any> | undefined => products.find(row => row.sku === sku)

  console.log('nocobase-h5: [chain] ══ B4 库存实务演示（移库→预留两段式→ROP→盘点回写→对账→旁路守卫）══')

  // S1 移库（one_step）：FD-SOY-500 SOY-260301-02 SH-A-01-02 → SH-A-01-05 ×60。
  const t1 = 'TRF-B4-DEMO-1'
  if (!(await rowsOf(token, 'wms_transfers')).some(row => row.transfer_no === t1)) {
    await dataOf(token, 'POST', '/api/wms_transfers:create', {
      transfer_no: t1, status: 'draft', transfer_mode: 'one_step',
      product: { id: Number(productBy('FD-SOY-500')?.id) }, lot: { id: Number(lotBy('SOY-260301-02')?.id) },
      from_bin: { id: Number(byCode('SH-A-01-02')?.id) }, to_bin: { id: Number(byCode('SH-A-01-05')?.id) },
      qty: 60, reason: 'B4 演示：一步移库过账（±流水对）',
    })
  }
  runSelf(['--post-transfer', t1])

  // S2 待检禁移负例：任一 hold 行作源 → 引擎拒绝。
  {
    const holdStock = (await rowsOf(token, 'wms_stock', 500)).find(row => row.status === 'hold')
    if (holdStock === undefined) {
      console.log('nocobase-h5: [chain] 守卫负例①跳过（当前无待检 hold 库存行；B3 待检区已清空）')
    } else {
      const t2 = 'TRF-B4-DEMO-2'
      if (!(await rowsOf(token, 'wms_transfers')).some(row => row.transfer_no === t2)) {
        await dataOf(token, 'POST', '/api/wms_transfers:create', {
          transfer_no: t2, status: 'draft', transfer_mode: 'one_step',
          product: { id: Number(holdStock.product_id) }, lot: { id: Number(holdStock.lot_id) },
          from_bin: { id: Number(holdStock.bin_id) }, to_bin: { id: Number((byCode('SH-A-01-06') ?? byCode('SH-A-01-05'))?.id) },
          qty: 1, reason: '负例素材：待检批次禁移',
        })
      }
      expectCliRefusal('待检 hold 批次移库', ['--post-transfer', t2])
    }
  }

  // S3 预留两段式第一段：为 MO 预留 100（FEFO 定批 + ATP 扣减）。
  runSelf(['--reserve', 'RSV-B4-DEMO-1', 'MO', 'MO-2026-0001', 'FD-SOY-500', '100'])
  const afterReserve = await printAtp(token, 'FD-SOY-500')
  if (afterReserve < 0) throw new Error('预留后 ATP 为负（断言失败）')

  // S4 超额预留负例：需求 999,999 > ATP → 拒绝。
  expectCliRefusal('超额预留', ['--reserve', 'RSV-B4-DEMO-2', 'SO', 'SO-2026-0001', 'FD-SOY-500', '999999'])

  // S5 释放：ATP 恢复。
  runSelf(['--release-reservation', 'RSV-B4-DEMO-1'])
  await printAtp(token, 'FD-SOY-500')

  // S6 两段式第二段：再预留后消耗（B6 齐套入口的 B4 前置底座）。
  runSelf(['--reserve', 'RSV-B4-DEMO-3', 'MO', 'MO-2026-0002', 'FD-SOY-500', '40'])
  runSelf(['--consume-reservation', 'RSV-B4-DEMO-3'])

  // S7 ROP：引擎 ADJUST 把 FD-BEV-1000 打到 ROP 之下 → scan 生成 open 建议。
  // Replay guard: an existing open suggestion means the drop already landed.
  {
    const suggestionsBefore = await rowsOf(token, 'wms_reorder_suggestions', 200)
    const bevOpen = suggestionsBefore.some(row => Number(row.product_id) === Number(productBy('FD-BEV-1000')?.id) && row.status === 'open')
    if (bevOpen) {
      console.log('nocobase-h5: [chain] ROP 下探跳过（open 建议已在；首跑已验证）')
    } else {
      runSelf(['--post-adjust', 'FD-BEV-1000', 'BEV-260908-01', 'SH-C-02-02', '-80'])
    }
  }
  runSelf(['--scan-reorder'])
  {
    const suggestions = await rowsOf(token, 'wms_reorder_suggestions', 200)
    const bev = suggestions.find(row => Number(row.product_id) === Number(productBy('FD-BEV-1000')?.id) && row.status === 'open')
    if (bev === undefined) throw new Error('补货建议断言失败：FD-BEV-1000 无 open 行（scan-reorder 未触发）')
    console.log(`nocobase-h5: [chain] 补货建议 ✓ #${String(bev.id)}：ATP ${String(bev.on_hand_atp)} ≤ ROP ${String(bev.min)} → 建议 ${String(bev.suggest_qty)}`)
  }

  // S8 循环盘点：冻结快照 → 录差异（触发审批 workflow）→ 引擎回写（CLI 直调=审批通过回调路径；页面审批走真 workflow）。
  const countNos = await genCount(token, 'SH-A-01-01')
  {
    const counts = await rowsOf(token, 'wms_counts', 500)
    const bin = byCode('SH-A-01-01')
    const todays = counts
      .filter(row => countNos.includes(String(row.count_no))
        || (Number(row.bin_id) === Number(bin?.id) && String(row.count_no ?? '').startsWith(`CNT-${new Date().toISOString().slice(0, 10).replaceAll('-', '')}`)))
      .sort((a, b) => Number(b.id) - Number(a.id))
    const target = todays.find(row => Number(row.product_id) === Number(productBy('FD-SOY-500')?.id)) ?? todays[0]
    if (target === undefined) throw new Error('盘点单生成断言失败：SH-A-01-01 无新盘点单')
    if (target.status === 'done') {
      console.log(`nocobase-h5: [chain] 盘点 ${String(target.count_no)} 已 done（首跑已验证，回写跳过）`)
    } else {
      if (target.status !== 'counting') {
        console.log(`nocobase-h5: [chain] 盘点 ${String(target.count_no)} 已 ${String(target.status)}（kept；重放）`)
      } else {
        await dataOf(token, 'POST', `/api/wms_counts:update?filterByTk=${target.id}`, {
          counted_qty: Number(target.snapshot_qty ?? 0) - 5, difference: -5, status: 'difference',
          note: `${String(target.note ?? '')}；实盘 ${String(Number(target.snapshot_qty ?? 0) - 5)}（差异 -5 进入审批）`,
        })
        console.log(`nocobase-h5: [chain] 盘点 ${String(target.count_no)} 录入差异 -5 → 差异确认（审批 workflow 已触发）`)
      }
      runSelf(['--post-count-adjust', String(target.count_no)])
    }
  }

  // S9 对账断言：stock == Σmovements（引擎全程唯一写入者）。
  await assertLedgerBalanced(token)

  // S10 旁路守卫实测：admin 角色用户 token 直改库存 → 403。
  {
    const baseUrl = process.env.NOCOBASE_BASE_URL ?? 'http://127.0.0.1:13000'
    const users = (await dataOf(token, 'GET', '/api/users:list?pageSize=200')) as Array<Record<string, any>> | null
    let guard = (users ?? []).find(row => row.username === 'b4guard')
    if (guard === undefined) {
      await dataOf(token, 'POST', '/api/users:create', {
        username: 'b4guard', nickname: 'B4 守卫测试', email: 'b4guard@demo.local',
        password: 'B4guard-2026', roles: [{ name: 'admin' }],
      })
      guard = ((await dataOf(token, 'GET', '/api/users:list?pageSize=200')) as Array<Record<string, any>> | null)?.find(row => row.username === 'b4guard')
    }
    // No password re-write on replay: NocoBase revokes the user's sessions
    // on a password update, which invalidated the fresh sign-in token.
    const signin = await fetch(`${baseUrl}/api/auth:signIn`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ account: 'b4guard', password: 'B4guard-2026' }),
    })
    const body = (await signin.json()) as { data?: { token?: string } }
    const guardToken = body?.data?.token
    if (typeof guardToken !== 'string' || guardToken === '') throw new Error('b4guard 登录失败（守卫实测无法进行）')
    const probe = await fetch(`${baseUrl}/api/wms_stock:update?filterByTk=1`, {
      method: 'POST', headers: { authorization: `Bearer ${guardToken}`, 'content-type': 'application/json' },
      body: JSON.stringify({ qty_locked: 0 }),
    })
    if (probe.status !== 403) throw new Error(`旁路守卫失效：admin 角色直改库存返回 HTTP ${String(probe.status)}（期望 403）`)
    console.log('nocobase-h5: [chain] 旁路守卫 ✓ admin 角色直改 wms_stock → 403 No permissions')
  }

  console.log(`nocobase-h5: [chain] done — 移库 ±流水/预留两段式/ROP 建议/盘点回写/对账平衡/403 守卫 全通（${new Date().toISOString().slice(0, 10)}）`)
}

// ─── rollback ───

// ─── W2-B3 selftest (pure replay invariants, no NocoBase) ───

/** One selftest assertion (deep-compare; throws with the label on failure). */
function expectB3(that: string, actual: unknown, expected: unknown): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`selftest-b3 失败：${that} — 期望 ${JSON.stringify(expected)}，实际 ${JSON.stringify(actual)}`)
  }
}

/** The W2-B3 pure-layer selftest: encoded dates, six-class mapping, and the monthly replay identity. */
function selftestB3(): void {
  expectB3('doc 编码日期 RCV', docEncodedDate('RCV-20260901-001'), '2026-09-01')
  expectB3('doc 编码日期 CNT 尾长', docEncodedDate('CNT-20260926-0010001'), '2026-09-26')
  expectB3('doc 编码日期 ADJ', docEncodedDate('ADJ-20260926-74304'), '2026-09-26')
  expectB3('doc 无日期段 BAL', docEncodedDate('BAL-1-9'), undefined)
  expectB3('doc 无日期段 SO', docEncodedDate('SO-2026-0001'), undefined)
  expectB3('doc 非法日期拒绝', docEncodedDate('RCV-20261340-001'), undefined)
  expectB3('六类映射 正腿=收', classifyMovement(30), 'in')
  expectB3('六类映射 负腿=发', classifyMovement(-30), 'out')
  const ledger: MovementFact[] = [
    { id: 1, product_id: 1, qty: 600, biz_date: '2026-08-28' },
    { id: 2, product_id: 1, qty: -120, biz_date: '2026-09-05' },
    { id: 3, product_id: 1, qty: -30, biz_date: '2026-09-08' },
    { id: 4, product_id: 2, qty: -30, biz_date: '2026-08-10' },
    { id: 5, product_id: 2, qty: 30, biz_date: '2026-08-10' },
  ]
  const rows = monthlyBalancesOf(ledger, '2026-09')
  expectB3('首月 opening=全量重放净额', rows.find(row => row.productId === 1 && row.period === '2026-08')?.openingQty, 0)
  expectB3('收发恒等 期初+收−发=期末', rows.find(row => row.productId === 1 && row.period === '2026-09'),
    { productId: 1, period: '2026-09', openingQty: 600, inQty: 0, outQty: 150, balQty: 450 })
  expectB3('调拨成对 两侧各计净零', rows.find(row => row.productId === 2 && row.period === '2026-08'),
    { productId: 2, period: '2026-08', openingQty: 0, inQty: 30, outQty: 30, balQty: 0 })
  expectB3('连续性 bal(t)=opening(t+1)', rows.find(row => row.productId === 1 && row.period === '2026-09')?.openingQty,
    rows.find(row => row.productId === 1 && row.period === '2026-08')?.balQty)
  expectB3('幂等重放 两次结果一致', monthlyBalancesOf(ledger, '2026-09'), rows)
  console.log('nocobase-h5: [selftest-b3] 编码日期/六类映射/首月净额/调拨对冲/连续性/幂等 全通')
}

// ─── W2-B6 selftest (pure policy invariants, no NocoBase) ───

/** One W2-B6 selftest assertion (deep-compare; throws with the label on failure). */
function expectB6(that: string, actual: unknown, expected: unknown): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`selftest-b6 失败：${that} — 期望 ${JSON.stringify(expected)}，实际 ${JSON.stringify(actual)}`)
  }
}

/** One W2-B6 fail-loud assertion (throws with a message containing the hint). */
function expectB6Throws(that: string, body: () => unknown, hint: string): void {
  try {
    body()
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (!message.includes(hint)) throw new Error(`selftest-b6 失败：${that} — 抛错文本缺「${hint}」：${message}`)
    return
  }
  throw new Error(`selftest-b6 失败：${that} — 本应 fail loud（${hint}）却放行`)
}

/** The W2-B6 pure-layer selftest: policy/ratio parsing, the 105/106 hand calc, and the gate matrix. */
function selftestB6(): void {
  // Policy parsing: missing/empty falls back to full_lock (zero drift); the
  // closed enum refuses anything else.
  expectB6('缺省策略 full_lock', moKitPolicy({ code: 'MO-X', kit_policy: null }), 'full_lock')
  expectB6('空串策略 full_lock', moKitPolicy({ code: 'MO-X', kit_policy: '' }), 'full_lock')
  expectB6('full_lock 保持', moKitPolicy({ code: 'MO-X', kit_policy: 'full_lock' }), 'full_lock')
  expectB6('partial_allowed 解析', moKitPolicy({ code: 'MO-X', kit_policy: 'partial_allowed' }), 'partial_allowed')
  expectB6Throws('未知策略 fail loud', () => moKitPolicy({ code: 'MO-X', kit_policy: 'strict' }), '齐套策略非法')
  // Ratio parsing: missing is 0 (超领全拒); negative / NaN fail loud.
  expectB6('缺省比例 0', moOverissueRatio({ code: 'MO-X', overissue_ratio: null }), 0)
  expectB6('比例 0.05', moOverissueRatio({ code: 'MO-X', overissue_ratio: 0.05 }), 0.05)
  expectB6('字符串比例解析', moOverissueRatio({ code: 'MO-X', overissue_ratio: '0.05' }), 0.05)
  expectB6Throws('负比例 fail loud', () => moOverissueRatio({ code: 'MO-X', overissue_ratio: -0.1 }), '超领比例非法')
  expectB6Throws('NaN 比例 fail loud', () => moOverissueRatio({ code: 'MO-X', overissue_ratio: 'abc' }), '超领比例非法')
  // The acceptance hand calc: reserved 100 × (1 + 0.05) = 105 ceiling —
  // 105 passes (105 ≤ 105 + ε), 106 refuses (106 > 105 + ε); ratio 0 keeps
  // the W-round ceiling (超 1 即拒).
  expectB6('上限 100×1.05=105', issueCeilingOf(100, 0.05), 105)
  expectB6('105 放行判定', 105 <= issueCeilingOf(100, 0.05) + 1e-9, true)
  expectB6('106 拒绝判定', 106 > issueCeilingOf(100, 0.05) + 1e-9, true)
  expectB6('缺省上限=预留', issueCeilingOf(100, 0), 100)
  expectB6('缺省超 1 即拒', 101 > issueCeilingOf(100, 0) + 1e-9, true)
  console.log('nocobase-h5: [selftest-b6] 策略解析/比例解析/105 手算/106 拒/缺省回归 全通')
}

async function rollback(token: string): Promise<void> {
  let destroyedModels = 0
  for (const row of await listModels(token)) {
    if (String(row.uid ?? '').startsWith('h5wms')) {
      await call(token, 'POST', `/api/flowModels:destroy?filterByTk=${encodeURIComponent(String(row.uid))}`)
      destroyedModels += 1
    }
  }
  if (destroyedModels > 0) {
    const survivors = await listModels(token)
    const liveForms = new Set(survivors.filter(row => row.use === 'CreateFormModel').map(row => String(row.uid ?? '')))
    let swept = 0
    for (const row of survivors) {
      const uid = String(row.uid ?? '')
      if (uid.startsWith('n18ai-') && !liveForms.has(uid.slice('n18ai-'.length))) {
        await call(token, 'POST', `/api/flowModels:destroy?filterByTk=${encodeURIComponent(uid)}`)
        swept += 1
      }
    }
    console.log(`nocobase-h5: ${destroyedModels} h5wms flowModels destroyed, ${swept} orphaned n18ai- buttons swept`)
  }
  for (const spec of PAGES) {
    const flow = (await listAllRoutes(token)).find(row => row.title === spec.title && row.type === 'flowPage')
    if (flow === undefined) continue
    for (const tab of (await listAllRoutes(token)).filter(row => row.parentId === flow.id && row.type === 'tabs')) {
      await call(token, 'DELETE', `/api/desktopRoutes:destroy?filterByTk=${tab.id}`)
    }
    await call(token, 'DELETE', `/api/desktopRoutes:destroy?filterByTk=${flow.id}`)
  }
  const group = (await listAllRoutes(token)).find(row => row.title === MENU_GROUP.title && row.type === 'group')
  if (group !== undefined) await call(token, 'DELETE', `/api/desktopRoutes:destroy?filterByTk=${group.id}`)
  for (const id of await workflowIds(token, WORKFLOW_COUNT)) {
    await call(token, 'POST', `/api/workflows:destroy?filterByTk=${id}`)
  }
  for (const collection of [...COLLECTIONS].reverse()) {
    const existing = await dataOf(token, 'GET', `/api/collections/${collection.name}`)
    if (existing !== null) {
      await call(token, 'POST', `/api/collections:destroy?filterByTk=${collection.name}&cascade=true&drop=true&skipChildren=true`)
    }
  }
  // B4 added columns on shared collections (the w2 field-update channel).
  for (const [collection, column] of [
    ['wms_counts', 'abc_class'], ['wms_transfers', 'transfer_mode'],
    ['hub_inv_products', 'abc_class'], ['hub_inv_products', 'reorder_point'], ['hub_inv_products', 'safety_stock'],
    ['hub_inv_products', 'lot_size'], ['hub_inv_products', 'lead_time_days'], ['hub_inv_products', 'avg_daily_use'],
    ['wms_movements', 'biz_date'], ['wms_counts', 'biz_date'],
  ] as const) {
    try {
      await call(token, 'POST', `/api/collections/${collection}/fields:destroy?filterByTk=${encodeURIComponent(column)}`)
    } catch {
      // A fresh install that never ran B4 lacks the column; the miss is fine.
    }
  }
  // B4 demo transfers + the bypass-guard rows + the guard test user.
  for (const row of (await rowsOf(token, 'wms_transfers')).filter(item => String(item.transfer_no ?? '').startsWith('TRF-B4-DEMO'))) {
    await call(token, 'POST', `/api/wms_transfers:destroy?filterByTk=${row.id}`)
  }
  for (const collection of ['wms_stock', 'wms_movements']) {
    for (const row of (await dataOf(token, 'GET', `/api/rolesResources:list?pageSize=100&filter=${encodeURIComponent(JSON.stringify({ roleName: { $eq: 'admin' }, name: { $eq: collection } }))}`)) as Array<Record<string, any>> | null ?? []) {
      await call(token, 'POST', `/api/rolesResources:destroy?filterByTk=${row.id}`)
      console.log(`nocobase-h5: bypass guard row admin→${collection} removed (admin strategy-wide write restored)`)
    }
  }
  for (const row of (await dataOf(token, 'GET', '/api/users:list?pageSize=200')) as Array<Record<string, any>> | null ?? []) {
    if (row.username === 'b4guard') await call(token, 'POST', `/api/users:destroy?filterByTk=${row.id}`)
  }
  console.log('nocobase-h5: rollback done — pages/group/workflows/collections/B4 columns/guard rows removed')
}

// ─── main ───

async function main(): Promise<void> {
  const args = process.argv.slice(2)
  const token = await signInWithRetry()
  if (args.includes('--rollback')) {
    await rollback(token)
    console.log('nocobase-h5: done (rollback)')
    return
  }
  const fefoIndex = args.indexOf('--fefo')
  if (fefoIndex >= 0) {
    await fefo(token, String(args[fefoIndex + 1]), Number(args[fefoIndex + 2] ?? 1))
    return
  }
  const postShipIndex = args.indexOf('--post-shipment')
  if (postShipIndex >= 0) {
    await postShipment(token, String(args[postShipIndex + 1]))
    return
  }
  const postReceiptIndex = args.indexOf('--post-receipt')
  if (postReceiptIndex >= 0) {
    await postReceipt(token, String(args[postReceiptIndex + 1]))
    return
  }
  const iqcIndex = args.indexOf('--iqc')
  if (iqcIndex >= 0) {
    const verdict = String(args[iqcIndex + 2])
    if (verdict !== 'passed' && verdict !== 'failed' && verdict !== 'concession') {
      throw new Error('用法：--iqc <receiptNo> passed|failed|concession')
    }
    await setIqc(token, String(args[iqcIndex + 1]), verdict)
    return
  }
  const releaseIndex = args.indexOf('--release-receipt')
  if (releaseIndex >= 0) {
    await releaseReceipt(token, String(args[releaseIndex + 1]))
    return
  }
  const transferIndex = args.indexOf('--post-transfer')
  if (transferIndex >= 0) {
    await postTransfer(token, String(args[transferIndex + 1]), String(args[transferIndex + 2] ?? 'one'))
    return
  }
  const reserveIndex = args.indexOf('--reserve')
  if (reserveIndex >= 0) {
    await reserve(token, String(args[reserveIndex + 1]), String(args[reserveIndex + 2]), String(args[reserveIndex + 3]), String(args[reserveIndex + 4]), Number(args[reserveIndex + 5]))
    return
  }
  const releaseResIndex = args.indexOf('--release-reservation')
  if (releaseResIndex >= 0) {
    await releaseReservation(token, String(args[releaseResIndex + 1]))
    return
  }
  const consumeResIndex = args.indexOf('--consume-reservation')
  if (consumeResIndex >= 0) {
    await consumeReservation(token, String(args[consumeResIndex + 1]))
    return
  }
  const atpIndex = args.indexOf('--atp')
  if (atpIndex >= 0) {
    await printAtp(token, String(args[atpIndex + 1]))
    return
  }
  if (args.includes('--scan-reorder')) {
    await scanReorder(token)
    return
  }
  const adjustIndex = args.indexOf('--post-adjust')
  if (adjustIndex >= 0) {
    await postAdjust(token, String(args[adjustIndex + 1]), String(args[adjustIndex + 2]), String(args[adjustIndex + 3]), Number(args[adjustIndex + 4]))
    return
  }
  const countAdjustIndex = args.indexOf('--post-count-adjust')
  if (countAdjustIndex >= 0) {
    await postCountAdjust(token, String(args[countAdjustIndex + 1]))
    return
  }
  const genCountIndex = args.indexOf('--gen-count')
  if (genCountIndex >= 0) {
    await genCount(token, String(args[genCountIndex + 1]))
    return
  }
  if (args.includes('--backfill-dates')) {
    await backfillBizDates(token)
    return
  }
  const snapshotMonthIndex = args.indexOf('--snapshot-month')
  if (snapshotMonthIndex >= 0) {
    await snapshotMonthlyBalances(token, String(args[snapshotMonthIndex + 1] ?? 'all'))
    await assertMonthlyBalances(token)
    return
  }
  const recalcIndex = args.indexOf('--recalc')
  if (recalcIndex >= 0) {
    const requested = String(args[recalcIndex + 1] ?? '')
    // The month list comes from the ledger (never the possibly-poisoned
    // snapshot table) capped at the current month, so a wiped or hand-edited
    // wms_monthly_balances still recalculates back from the movements truth.
    const ledgerMonths = [...new Set((await rowsOf(token, 'wms_movements', 1000))
      .map(row => String(row.biz_date ?? '').slice(0, 7))
      .filter(month => month >= '2000-01' && month <= shanghaiToday().slice(0, 7)))].sort()
    const periods = /^\d{4}-\d{2}$/.test(requested)
      ? [requested]
      : [...new Set([...ledgerMonths, ...(await rowsOf(token, 'wms_monthly_balances', 1000)).map(row => String(row.period))])].sort()
    if (periods.length === 0) throw new Error('--recalc 无可重算月份（先 --backfill-dates 再 --snapshot-month all）')
    for (const period of periods) {
      await snapshotMonthlyBalances(token, period)
    }
    await assertMonthlyBalances(token)
    return
  }
  if (args.includes('--assert-monthly')) {
    await assertMonthlyBalances(token)
    return
  }
  if (args.includes('--selftest-b3')) {
    selftestB3()
    return
  }
  if (args.includes('--selftest-b6')) {
    selftestB6()
    return
  }
  if (args.includes('--assert-ledger')) {
    await assertLedgerBalanced(token)
    return
  }
  if (args.includes('--rebalance')) {
    await rebalanceLedger(token)
    return
  }
  const kitIndex = args.indexOf('--availability-check')
  if (kitIndex >= 0) {
    await availabilityCheck(token, String(args[kitIndex + 1]))
    return
  }
  const postIssueIndex = args.indexOf('--post-issue')
  if (postIssueIndex >= 0) {
    await postIssue(token, String(args[postIssueIndex + 1]))
    return
  }
  const postReturnIndex = args.indexOf('--post-return')
  if (postReturnIndex >= 0) {
    await postReturn(token, String(args[postReturnIndex + 1]))
    return
  }
  const postReportIndex = args.indexOf('--post-report')
  if (postReportIndex >= 0) {
    await postJobReport(token, String(args[postReportIndex + 1]))
    return
  }
  const postCompletionIndex = args.indexOf('--post-completion')
  if (postCompletionIndex >= 0) {
    await postCompletion(token, String(args[postCompletionIndex + 1]))
    return
  }
  const releaseCompletionIndex = args.indexOf('--release-completion')
  if (releaseCompletionIndex >= 0) {
    await releaseCompletion(token, String(args[releaseCompletionIndex + 1]))
    return
  }
  const inspectIndex = args.indexOf('--inspect')
  if (inspectIndex >= 0) {
    const defectIndex = args.indexOf('--defects')
    const raw = defectIndex >= 0 ? String(args[defectIndex + 1] ?? '') : ''
    const parts = raw.split(',').map(part => Number(part))
    if (raw === '' || parts.length !== 3 || parts.some(part => !Number.isFinite(part) || part < 0)) {
      throw new Error('用法：--inspect <QI单号> --defects <严重>,<主要>,<次要> [--inspector 姓名] [--aql 0.65|1.0|1.5|2.5|4.0] [--resubmission]')
    }
    const inspectorIndex = args.indexOf('--inspector')
    const aqlFlagIndex = args.indexOf('--aql')
    await inspectInspection(token, String(args[inspectIndex + 1]),
      { critical: parts[0], major: parts[1], minor: parts[2] },
      inspectorIndex >= 0 ? String(args[inspectorIndex + 1]) : '质量部',
      aqlFlagIndex >= 0 ? String(args[aqlFlagIndex + 1]) : '2.5',
      { resubmission: args.includes('--resubmission') })
    return
  }
  const iqcResumeIndex = args.indexOf('--iqc-resume')
  if (iqcResumeIndex >= 0) {
    await iqcResume(token, String(args[iqcResumeIndex + 1]))
    return
  }
  const iqcRelaxIndex = args.indexOf('--iqc-relax')
  if (iqcRelaxIndex >= 0) {
    await iqcRelax(token, String(args[iqcRelaxIndex + 1]))
    return
  }
  const createNcIndex = args.indexOf('--create-nc')
  if (createNcIndex >= 0) {
    const reasonIndex = args.indexOf('--reason')
    await createNc(token, String(args[createNcIndex + 1]), String(args[createNcIndex + 2]), reasonIndex >= 0 ? String(args[reasonIndex + 1]) : '')
    return
  }
  const disposeIndex = args.indexOf('--dispose')
  if (disposeIndex >= 0) {
    const approverIndex = args.indexOf('--approver')
    const deviationIndex = args.indexOf('--deviation-note')
    await disposeNc(token, String(args[disposeIndex + 1]), {
      approver: approverIndex >= 0 ? String(args[approverIndex + 1]) : undefined,
      deviationNote: deviationIndex >= 0 ? String(args[deviationIndex + 1]) : undefined,
    })
    return
  }
  const scorecardIndex = args.indexOf('--calc-scorecard')
  if (scorecardIndex >= 0) {
    const now = new Date()
    const defaultPeriod = `${String(now.getFullYear())}Q${String(Math.floor(now.getMonth() / 3) + 1)}`
    await calcScorecard(token, String(args[scorecardIndex + 1] ?? defaultPeriod))
    return
  }
  if (args.includes('--demo-chain')) {
    await demoChain(token)
    return
  }

  await ensureCollections(token)
  await ensureWmsColumns(token)
  await seedWmsRows(token)
  await ensureWorkflows(token)
  await ensureBypassGuard(token)
  const group = await ensureMenuGroup(token)
  let sort = 1
  for (const spec of PAGES) {
    await ensureV2Page(token, spec, group.id, sort++)
  }
  await ensureFormSubmits(token)
  await ensureBinMap(token)
  await assertLedgerBalanced(token)
  console.log('nocobase-h5: done')
}

// Library imports (nocobase-w3-procurement.mts's QUARANTINE_ZONE_CODE) must
// not run the CLI.
if (process.argv[1] !== undefined && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  await main()
}
