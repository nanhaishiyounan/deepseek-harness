/**
 * H5: the WMS closed loop (plans/acceptance-fixes-2026-09-15-h/50-h5-wms.md).
 * One script, six effects:
 *
 * 1. Nine wms_* collections per the R7 report's MVP cut: zones/bins (the
 *    three-level warehouse structure), lots (the four-date food model with
 *    the supplier trace anchor), stock (the UNIQUE SKU×bin×lot×status
 *    balance with a version column for optimistic locking), movements
 *    (append-only ledger), receipts/shipments/transfers/counts (flat
 *    head-line documents — one row per line, header fields repeated).
 * 2. Nine v2 flowPages under the「仓储管理」menu group through the E1/F1
 *    factory channels (uid prefix h5wms): eight table pages + the 库位图
 *    page whose map block rides the A-route JSBlockModel authoring channel
 *    (probe verdict 2026-09-15: full GO — collection access must use the
 *    ctx.makeResource('MultiRecordResource') vocabulary, NOT
 *    ctx.api.resource().list; evidence demos/acceptance-h5/00-jsblock-probe.png).
 * 3. One workflow: 盘点差异调整审批 (count row 差异 status → manual →
 *    update 调整完成). Document posting itself is the script-side engine
 *    (see 5) because the workflow update node cannot do read-modify-write
 *    arithmetic on the four stock quantities.
 * 4. The posting engine (--post-receipt/--post-shipment/--post-transfer):
 *    stock upsert with version-checked optimistic locking (a stale version
 *    updates zero rows and fails loud), the append-only movement write, and
 *    the document status transition — the JeeWMS "all changes through one
 *    entry" rule.
 * 5. The FEFO recommender (--fefo): allocates a requested quantity across
 *    lots of one SKU ordered by 应下架日 ASC (then qty DESC), qualified
 *    status only, expiry > today — the R7 picking semantics.
 * 6. Seeds upsert by business key: 2 warehouses × 3 zones × 12 bins = 72
 *    bins (four-status distribution), 12 lots (expiry bands covering the
 *    30%/20% tiers), 8 stock rows, 10 documents across states, 30 ledger
 *    rows.
 *
 * Rollback: --rollback destroys every h5wms* flowModels tree (+ orphaned
 * n18ai- sweep), the nine routes + the menu group, the workflow, and the
 * nine collections — back to the H4 end-state.
 *
 * Usage (repo root, tsx loader):
 *   node --import tsx/esm examples/kb-agent/scripts/nocobase-h5-wms.mts
 *   node --import tsx/esm examples/kb-agent/scripts/nocobase-h5-wms.mts --rollback
 *   node --import tsx/esm examples/kb-agent/scripts/nocobase-h5-wms.mts --fefo <sku> <qty>
 *   node --import tsx/esm examples/kb-agent/scripts/nocobase-h5-wms.mts --post-shipment <shipmentNo>
 *   node --import tsx/esm examples/kb-agent/scripts/nocobase-h5-wms.mts --post-receipt <receiptNo>
 */
import { call, dataOf, listFlowModels, listRoutes, signInWithRetry, withN17Prefix } from './nocobase-flow-page-lib.mts'

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
])
const RECEIPT_TYPE = opts([['purchase', '采购收货', 'blue'], ['production', '生产入库', 'green'], ['return', '销售退货', 'orange']])
const SHIPMENT_TYPE = opts([['sales', '销售出库', 'blue'], ['picking', '生产领料', 'green'], ['other', '其他出库', 'default']])
const RECEIPT_STATUS = opts([
  ['draft', '草稿', 'default'], ['pending', '待执行', 'blue'], ['receiving', '执行中', 'cyan'],
  ['partial', '部分完成', 'orange'], ['completed', '完成', 'green'], ['posted', '已过账', 'green'], ['closed', '已关闭', 'default'],
])
const TRANSFER_STATUS = opts([['draft', '草稿', 'default'], ['pending', '待执行', 'blue'], ['completed', '已完成', 'green'], ['cancelled', '已取消', 'red']])
const COUNT_STATUS = opts([
  ['planned', '计划', 'default'], ['frozen', '已冻结', 'red'], ['counting', '初盘中', 'blue'],
  ['difference', '差异确认', 'orange'], ['adjusting', '调整审批中', 'purple'], ['done', '已完成', 'green'],
])
const COUNT_TYPE = opts([['full', '全盘', 'blue'], ['cycle', '循环盘', 'green'], ['sample', '抽盘', 'default']])

// ─── the nine collections ───

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
      select('status', '状态', COUNT_STATUS),
      belongsTo('zone', '库区', 'wms_zones', 'zone_id'),
      belongsTo('bin', '库位', 'wms_bins', 'bin_id', 'code'),
      belongsTo('product', '物料', 'hub_inv_products', 'product_id'),
      belongsTo('lot', '批次', 'wms_lots', 'lot_id', 'lot_no'),
      number('snapshot_qty', '账面快照'), number('counted_qty', '实盘数'),
      number('difference', '差异'), textarea('note', '备注'),
    ],
  },
]

const MENU_GROUP = { title: '仓储管理', icon: 'DatabaseOutlined' }
const WORKFLOW_COUNT = 'WMS盘点差异调整审批'

// ─── seeds (business-key upserts) ───

const iso = (offsetDays: number): string => new Date(Date.now() + offsetDays * 86_400_000).toISOString().slice(0, 10)

/** Zone seeds: warehouse 1 上海中心仓 / 2 青岛港口仓 / 3 广州南沙冷库 × three temp zones each. */
const SEED_ZONES: ReadonlyArray<{ warehouse: string, code: string, name: string, temp: string }> = [
  { warehouse: '上海中心仓', code: 'SH-A', name: '上海·常温区', temp: 'ambient' },
  { warehouse: '上海中心仓', code: 'SH-C', name: '上海·冷藏区', temp: 'chilled' },
  { warehouse: '上海中心仓', code: 'SH-F', name: '上海·冷冻区', temp: 'frozen' },
  { warehouse: '广州南沙冷库', code: 'GZ-A', name: '南沙·常温区', temp: 'ambient' },
  { warehouse: '广州南沙冷库', code: 'GZ-C', name: '南沙·冷藏区', temp: 'chilled' },
  { warehouse: '广州南沙冷库', code: 'GZ-F', name: '南沙·冷冻区', temp: 'frozen' },
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
  const rows = await dataOf(token, 'GET', `/api/${collection}:list?pageSize=${pageSize}`) as Array<Record<string, any>> | null
  return rows ?? []
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
  console.log(`nocobase-h5: seed wms_bins +${binsAdded} (kept: ${binRows.length}; target 72 total)`)

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
    await dataOf(token, 'POST', '/api/wms_movements:create', {
      move_type: move.type, doc_no: move.doc,
      product: { id: productId }, lot: { id: lotId },
      ...(move.from === '' ? {} : { from_bin: { id: binIdBy(bins, move.from) } }),
      ...(move.to === '' ? {} : { to_bin: { id: binIdBy(bins, move.to) } }),
      qty: move.qty, note: move.note,
    })
    movesAdded += 1
  }
  console.log(`nocobase-h5: seed wms_movements +${movesAdded} (kept: ${moveRows.length}/${SEED_MOVEMENTS.length})`)

  // Opening-balance alignment: the narrative movement seeds illustrate the
  // ledger's variety but do not sum to the seeded balances; one ADJUST row
  // per (product, lot) closes the gap so stock == Σ movements from birth and
  // the engine's postings keep it that way. Idempotent by doc_no; a world
  // already balanced emits nothing.
  {
    const stockNow = await rowsOf(token, 'wms_stock', 500)
    const moveNow = await rowsOf(token, 'wms_movements', 500)
    const sums = new Map<string, number>()
    for (const move of moveNow) {
      const key = `${move.product_id}:${move.lot_id}`
      sums.set(key, (sums.get(key) ?? 0) + Number(move.qty ?? 0))
    }
    let balanced = 0
    for (const stockRow of stockNow) {
      const key = `${stockRow.product_id}:${stockRow.lot_id}`
      const drift = Number(stockRow.qty_on_hand ?? 0) - (sums.get(key) ?? 0)
      if (Math.abs(drift) < 0.01) continue
      await dataOf(token, 'POST', '/api/wms_movements:create', {
        move_type: 'ADJUST', doc_no: `BAL-${stockRow.product_id}-${stockRow.lot_id}`,
        product: { id: stockRow.product_id }, lot: { id: stockRow.lot_id },
        ...(stockRow.bin_id === null || stockRow.bin_id === undefined ? {} : { to_bin: { id: stockRow.bin_id } }),
        qty: drift, note: '期初余额对齐（种子流水与库存差额）',
      })
      balanced += 1
    }
    console.log(`nocobase-h5: opening-balance alignment ${balanced > 0 ? `${balanced} row(s) emitted` : 'already balanced (kept)'}`)
  }

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

async function ensureWorkflows(token: string): Promise<void> {
  const ids = await workflowIds(token, WORKFLOW_COUNT)
  for (const extra of ids.slice(1).sort((a, b) => b - a)) {
    await call(token, 'POST', `/api/workflows:destroy?filterByTk=${extra}`)
    console.log(`nocobase-h5: duplicate workflow "${WORKFLOW_COUNT}" #${extra} destroyed (self-heal)`)
  }
  if (ids.length > 0) {
    console.log(`nocobase-h5: workflow "${WORKFLOW_COUNT}" exists (kept)`)
    return
  }
  // Fires when a count row moves into 差异确认 (update trigger, mode 2); the
  // single manual approval then advances the row to 调整完成.
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
  await dataOf(token, 'POST', '/api/flow_nodes:create', {
    workflow: workflow.id, title: '差异调整完成', type: 'update', upstreamId: condition.id, branchIndex: 1,
    config: { collection: 'wms_counts', params: { filter: { id: '{{$context.data.id}}' }, values: { status: 'done' } } },
  })
  await dataOf(token, 'POST', '/api/flow_nodes:create', {
    workflow: workflow.id, title: '驳回·退回差异确认', type: 'update', upstreamId: condition.id, branchIndex: 0,
    config: { collection: 'wms_counts', params: { filter: { id: '{{$context.data.id}}' }, values: { status: 'difference' } } },
  })
  console.log(`nocobase-h5: workflow "${WORKFLOW_COUNT}" created (update trigger on 差异 → manual → update done/difference)`)
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
 * Apply one stock delta with optimistic locking: the update filter carries
 * the version read moments before, so a concurrent writer makes the update
 * match zero rows and this throws instead of double-applying.
 */
async function applyStockDelta(token: string, key: { productId: number, binId: number, lotId: number }, delta: number): Promise<void> {
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
  await dataOf(token, 'POST', '/api/wms_movements:create', {
    move_type: 'SHIP', doc_no: shipmentNo,
    product: { id: key.productId }, lot: { id: key.lotId }, from_bin: { id: key.binId },
    qty: -qty, note: '出库过账（脚本侧过账引擎）',
  })
  await dataOf(token, 'POST', `/api/wms_shipments:update?filterByTk=${shipment.id}`, { status: 'posted' })
  console.log(`nocobase-h5: shipment ${shipmentNo} posted — stock -${qty}, movement appended`)
}

async function postReceipt(token: string, receiptNo: string): Promise<void> {
  const receipts = await rowsOf(token, 'wms_receipts')
  const receipt = receipts.find(row => row.receipt_no === receiptNo)
  if (receipt === undefined) throw new Error(`no receipt ${receiptNo}`)
  if (receipt.status === 'posted' || receipt.status === 'closed') {
    console.log(`nocobase-h5: receipt ${receiptNo} already ${receipt.status} (kept; posting is single-shot)`)
    return
  }
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
      status: 'qualified',
    })
    lots = await rowsOf(token, 'wms_lots')
    lot = lots.find(row => row.lot_no === receipt.lot_no)
    console.log(`nocobase-h5: lot ${receipt.lot_no} created (shelf-life ${shelfLife}d from hub_inv_products)`)
  }
  if (lot === undefined) throw new Error(`lot ${receipt.lot_no} still missing after create`)
  const qty = Number(receipt.qty)
  // Target bin: the receipt's target_bin, else the zone's first idle bin
  // whose temp zone matches the product temp_zone (the putaway rule).
  let binId = receipt.target_bin_id === null || receipt.target_bin_id === undefined ? undefined : Number(receipt.target_bin_id)
  if (binId === undefined) {
    const zones = await rowsOf(token, 'wms_zones')
    const bins = await rowsOf(token, 'wms_bins', 200)
    const zone = zones.find(row => Number(receipt.target_zone_id) === row.id)
      ?? zones.find(row => row.temp_zone === (product?.temp_zone ?? 'ambient'))
    const bin = bins.find(row => row.status === 'idle' && (zone === undefined || row.zone_id === zone.id))
    if (bin === undefined) throw new Error(`no idle bin found for zone ${zone?.code ?? '(any)'} — putaway blocked`)
    binId = Number(bin.id)
    await dataOf(token, 'POST', `/api/wms_receipts:update?filterByTk=${receipt.id}`, { target_bin: { id: binId } })
    console.log(`nocobase-h5: putaway recommended bin ${bin.code} (temp-zone match: ${zone?.name ?? 'fallback'})`)
  }
  const stocks = await rowsOf(token, 'wms_stock', 500)
  const existing = stocks.find(row => row.product_id === productId && row.bin_id === binId && row.lot_id === lot.id)
  if (existing === undefined) {
    await dataOf(token, 'POST', '/api/wms_stock:create', {
      product: { id: productId }, bin: { id: binId }, lot: { id: lot.id }, status: 'good',
      qty_on_hand: qty, qty_allocated: 0, qty_locked: 0, qty_available: qty, version: 1,
    })
  } else {
    await applyStockDelta(token, { productId, binId, lotId: lot.id }, qty)
  }
  await dataOf(token, 'POST', '/api/wms_movements:create', {
    move_type: 'PUTAWAY', doc_no: receiptNo,
    product: { id: productId }, lot: { id: lot.id }, to_bin: { id: binId },
    qty, note: '收货上架过账（脚本侧过账引擎）',
  })
  await dataOf(token, 'POST', `/api/wms_receipts:update?filterByTk=${receipt.id}`, { status: 'posted' })
  console.log(`nocobase-h5: receipt ${receiptNo} posted — stock +${qty}, movement appended`)
}

// ─── rollback ───

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
  console.log('nocobase-h5: rollback done — pages/group/workflow/collections removed')
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

  await ensureCollections(token)
  await seedWmsRows(token)
  await ensureWorkflows(token)
  const group = await ensureMenuGroup(token)
  let sort = 1
  for (const spec of PAGES) {
    await ensureV2Page(token, spec, group.id, sort++)
  }
  await ensureFormSubmits(token)
  await ensureBinMap(token)
  console.log('nocobase-h5: done')
}

await main()
