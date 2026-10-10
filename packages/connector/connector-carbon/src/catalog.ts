/**
 * The carbon business-table catalog: the model-facing table roster the cb_*
 * tools and the business page navigate. Risk follows the carbon API
 * manifest's three-way classification (READ/WRITE/DESTRUCTIVE) with the B0
 * verdict's boundary rule applied: entity-level CRUD maps in (`read` for
 * query tables, `write` for single-table writes), while the composite
 * posting server-functions (post-receipt, post-shipment, close-job, …) carry
 * no Data API surface and stay off the tool rows entirely. DESTRUCTIVE rows
 * (deletes, corrections) never appear here. Table and column names are the
 * live dev schema's (verified 2026-10-10 against the stack).
 * @module @deepseek-ai/dsh-connector-carbon/catalog
 */

/** The manifest classification a catalog row maps. */
export type CarbonTableRisk = 'read' | 'write'

/** One business module grouping (the business page's navigation sections). */
export type CarbonModuleId = 'master' | 'sales' | 'purchasing' | 'inventory' | 'production' | 'quality'

/** One catalog row: the wire table name plus the presentation facts. */
export interface CarbonTableMeta {
  /** The camelCase table name as PostgREST serves it (`salesOrder`). */
  readonly table: string
  /** Chinese label for cards and navigation. */
  readonly label: string
  /** The business module the table groups under. */
  readonly module: CarbonModuleId
  /** The manifest-classification-derived risk tier. */
  readonly risk: CarbonTableRisk
  /** Default ordering for lists (`column.desc` form). */
  readonly order: readonly string[]
  /** The human-facing identifier column (entity previews and labels). */
  readonly labelColumn: string
  /** The row-addressable key column cb_get filters on (`id` everywhere except the composite-key stock table). */
  readonly idColumn: string
  /** Key columns every list projection includes (ids, codes, statuses, dates). */
  readonly keyColumns: readonly string[]
}

/** The module registry (navigation order and Chinese titles). */
export const CARBON_MODULES: readonly { id: CarbonModuleId; label: string }[] = [
  { id: 'master', label: '主数据' },
  { id: 'sales', label: '销售' },
  { id: 'purchasing', label: '采购' },
  { id: 'inventory', label: '库存' },
  { id: 'production', label: '生产' },
  { id: 'quality', label: '质量' },
]

/**
 * The catalog. `salesOrder`/`purchaseOrder`/`job`/`receipt`/`shipment`/
 * `nonConformance` carry business numbers in dedicated columns (no
 * `readableId`); `itemStockQuantities` is a composite-key quantity table
 * (itemId × locationId × companyId) addressed by `itemId`.
 */
export const CARBON_TABLES: readonly CarbonTableMeta[] = [
  { table: 'item', label: '物料', module: 'master', risk: 'write', order: ['createdAt.desc'], labelColumn: 'name', idColumn: 'id', keyColumns: ['id', 'readableId', 'name', 'type', 'active', 'createdAt'] },
  { table: 'customer', label: '客户', module: 'master', risk: 'write', order: ['createdAt.desc'], labelColumn: 'name', idColumn: 'id', keyColumns: ['id', 'readableId', 'name', 'createdAt'] },
  { table: 'supplier', label: '供应商', module: 'master', risk: 'write', order: ['createdAt.desc'], labelColumn: 'name', idColumn: 'id', keyColumns: ['id', 'readableId', 'name', 'createdAt'] },
  { table: 'salesOrder', label: '销售订单', module: 'sales', risk: 'write', order: ['createdAt.desc'], labelColumn: 'salesOrderId', idColumn: 'id', keyColumns: ['id', 'salesOrderId', 'status', 'customerId', 'orderDate', 'currencyCode', 'createdAt'] },
  { table: 'shipment', label: '发货单', module: 'sales', risk: 'read', order: ['createdAt.desc'], labelColumn: 'shipmentId', idColumn: 'id', keyColumns: ['id', 'shipmentId', 'status', 'customerId', 'postingDate', 'createdAt'] },
  { table: 'purchaseOrder', label: '采购订单', module: 'purchasing', risk: 'write', order: ['createdAt.desc'], labelColumn: 'purchaseOrderId', idColumn: 'id', keyColumns: ['id', 'purchaseOrderId', 'status', 'supplierId', 'orderDate', 'currencyCode', 'createdAt'] },
  { table: 'receipt', label: '收货单', module: 'purchasing', risk: 'read', order: ['createdAt.desc'], labelColumn: 'receiptId', idColumn: 'id', keyColumns: ['id', 'receiptId', 'status', 'supplierId', 'postingDate', 'createdAt'] },
  { table: 'itemStockQuantities', label: '库存数量', module: 'inventory', risk: 'read', order: ['itemId'], labelColumn: 'itemId', idColumn: 'itemId', keyColumns: ['itemId', 'locationId', 'quantityOnHand'] },
  { table: 'warehouse', label: '仓库', module: 'inventory', risk: 'read', order: ['createdAt.desc'], labelColumn: 'name', idColumn: 'id', keyColumns: ['id', 'name', 'active', 'createdAt'] },
  { table: 'job', label: '生产工单', module: 'production', risk: 'write', order: ['createdAt.desc'], labelColumn: 'jobId', idColumn: 'id', keyColumns: ['id', 'jobId', 'status', 'itemId', 'quantity', 'dueDate', 'createdAt'] },
  { table: 'nonConformance', label: '不合格品', module: 'quality', risk: 'read', order: ['createdAt.desc'], labelColumn: 'nonConformanceId', idColumn: 'id', keyColumns: ['id', 'nonConformanceId', 'name', 'source', 'status', 'priority', 'openDate', 'createdAt'] },
]

/**
 * Look up one catalog row by table name.
 * @param table - the camelCase table name.
 * @returns the catalog row, or `undefined` outside the roster.
 */
export function carbonTableOf(table: string): CarbonTableMeta | undefined {
  return CARBON_TABLES.find(entry => entry.table === table)
}
