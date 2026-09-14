export const procurementLocale = {
  "en-US": {
    // Nav / resources
    "procurement.resources.purchaseOrders": "Purchase Orders",
    "procurement.resources.purchaseOrder": "Purchase Order",
    "procurement.resources.purchaseOrders.description":
      "Raise and track purchase orders, line items and supplier spend.",
    "procurement.resources.suppliers": "Suppliers",
    "procurement.resources.supplier": "Supplier",
    "procurement.resources.suppliers.description":
      "Vendors you buy from, with ratings and order history.",
    "procurement.resources.spendAnalysis": "Spend analysis",
    "procurement.resources.spendAnalysis.description":
      "Spend by supplier, PO status mix and monthly spend trend.",

    // Common
    "procurement.common.actions": "Actions",
    "procurement.common.cancel": "Cancel",
    "procurement.common.close": "Close",
    "procurement.common.save": "Save changes",
    "procurement.common.saving": "Saving...",
    "procurement.common.notAvailable": "—",

    // Pickers
    "procurement.pickers.select": "Select...",
    "procurement.pickers.search": "Search...",
    "procurement.pickers.noResults": "No results",
    "procurement.pickers.clear": "Clear selection",
    "procurement.pickers.supplier.placeholder": "Select a supplier",
    "procurement.pickers.owner.placeholder": "Assign an owner (optional)",

    // Enums
    "procurement.enums.poStatus.draft": "Draft",
    "procurement.enums.poStatus.sent": "Sent",
    "procurement.enums.poStatus.received": "Received",
    "procurement.enums.poStatus.cancelled": "Cancelled",
    "procurement.enums.supplierStatus.active": "Active",
    "procurement.enums.supplierStatus.inactive": "Inactive",

    // Purchase order fields
    "procurement.po.fields.poNumber": "PO number",
    "procurement.po.fields.supplier": "Supplier",
    "procurement.po.fields.status": "Status",
    "procurement.po.fields.orderDate": "Order date",
    "procurement.po.fields.total": "Total",
    "procurement.po.fields.owner": "Owner",
    "procurement.po.fields.orderTotal": "Order total",

    // Purchase order form
    "procurement.po.form.poNumberPlaceholder": "e.g. PO-2049",
    "procurement.po.form.poNumberRequired": "PO number is required",
    "procurement.po.form.supplierRequired": "Pick the supplier this order is for",
    "procurement.po.form.totalNegative": "Total cannot be negative",
    "procurement.po.form.totalHint":
      "Add line items from the order detail to build up the total.",
    "procurement.po.form.create": "Create order",
    "procurement.po.form.creating": "Creating...",

    // Purchase order drawers
    "procurement.po.drawer.create.title": "New purchase order",
    "procurement.po.drawer.create.description":
      "Raise a purchase order against a supplier.",
    "procurement.po.drawer.edit.title": "Edit purchase order",
    "procurement.po.drawer.edit.description": "Update this order's details.",
    "procurement.po.drawer.show.description":
      "Supplier, ownership and line items for this order.",

    // Purchase order detail
    "procurement.po.detail.title": "Order",
    "procurement.po.detail.fallbackName": "Purchase order",
    "procurement.po.detail.loadError.title": "Unable to load purchase order",
    "procurement.po.detail.loadError.description":
      "The order may no longer exist, or you may not have permission to view it.",

    // Line items
    "procurement.po.items.title": "Line items",
    "procurement.po.items.add": "Add item",
    "procurement.po.items.product": "Product",
    "procurement.po.items.qty": "Qty",
    "procurement.po.items.unitPrice": "Unit price",
    "procurement.po.items.lineTotal": "Line total",
    "procurement.po.items.empty":
      "No line items yet. Add the products on this order.",
    "procurement.po.items.subtotal": "Items subtotal",
    "procurement.po.items.fields.product": "Product",
    "procurement.po.items.fields.quantity": "Quantity",
    "procurement.po.items.fields.unitPrice": "Unit price",
    "procurement.po.items.form.productPlaceholder": "e.g. Steel brackets",
    "procurement.po.items.form.productRequired": "Product name is required",
    "procurement.po.items.form.qtyRequired": "Quantity is required",
    "procurement.po.items.form.qtyNegative": "Quantity cannot be negative",
    "procurement.po.items.form.unitPriceRequired": "Unit price is required",
    "procurement.po.items.form.unitPriceNegative": "Unit price cannot be negative",
    "procurement.po.items.form.add": "Add item",
    "procurement.po.items.form.adding": "Adding...",
    "procurement.po.items.drawer.create.title": "Add line item",
    "procurement.po.items.drawer.create.description":
      "Add a product line to this purchase order.",
    "procurement.po.items.drawer.edit.title": "Edit line item",
    "procurement.po.items.drawer.edit.description": "Update this product line.",

    // Spend panel (KPIs + chart)
    "procurement.spend.kpi.committed.label": "Committed spend",
    "procurement.spend.kpi.committed.hint": "{{count}} active orders",
    "procurement.spend.kpi.open.label": "Open orders",
    "procurement.spend.kpi.open.hint": "draft + sent",
    "procurement.spend.kpi.received.label": "Received",
    "procurement.spend.kpi.received.hint": "goods delivered",
    "procurement.spend.kpi.avg.label": "Avg. order value",
    "procurement.spend.kpi.avg.hint": "excl. cancelled",
    "procurement.spend.chart.title": "Spend by supplier",
    "procurement.spend.chart.description":
      "Committed spend across active purchase orders.",
    "procurement.spend.chart.empty": "No spend to chart yet.",
    "procurement.spend.unassigned": "Unassigned",

    // Spend analysis dashboard
    "procurement.spendAnalysis.title": "Spend analysis",
    "procurement.spendAnalysis.description":
      "Where procurement spend is going: by supplier, by order status, and over time.",
    "procurement.spendAnalysis.range.label": "Time range",
    "procurement.spendAnalysis.range.6": "6 months",
    "procurement.spendAnalysis.range.12": "12 months",
    "procurement.spendAnalysis.range.24": "24 months",
    "procurement.spendAnalysis.kpi.total.label": "Total spend",
    "procurement.spendAnalysis.kpi.open.label": "Open commitment",
    "procurement.spendAnalysis.kpi.receivedRange.label": "Received",
    "procurement.spendAnalysis.kpi.cancelled.label": "Cancelled value",
    "procurement.spendAnalysis.kpi.cancelled.hint":
      "{{count}} orders cancelled",
    "procurement.spendAnalysis.kpi.committed.label": "Total committed",
    "procurement.spendAnalysis.kpi.committed.hint": "{{count}} active orders",
    "procurement.spendAnalysis.kpi.received.label": "Received value",
    "procurement.spendAnalysis.kpi.received.hint": "{{count}} orders received",
    "procurement.spendAnalysis.kpi.avg.label": "Avg. PO value",
    "procurement.spendAnalysis.kpi.avg.hint": "excl. cancelled",
    "procurement.spendAnalysis.kpi.topSupplier.label": "Top supplier",
    "procurement.spendAnalysis.kpi.topSupplier.hint": "by committed spend",
    "procurement.spendAnalysis.chart.supplier.title": "Spend by supplier",
    "procurement.spendAnalysis.chart.supplier.description":
      "Committed spend across active purchase orders.",
    "procurement.spendAnalysis.chart.supplier.empty": "No spend to chart yet.",
    "procurement.spendAnalysis.chart.status.title": "PO status mix",
    "procurement.spendAnalysis.chart.status.description":
      "Every purchase order, by current status.",
    "procurement.spendAnalysis.chart.status.empty": "No orders yet.",
    "procurement.spendAnalysis.chart.status.tooltip": "{{count}} orders",
    "procurement.spendAnalysis.chart.trend.title": "Monthly spend trend",
    "procurement.spendAnalysis.chart.trend.description":
      "Committed spend by order date over the last {{months}} months.",
    "procurement.spendAnalysis.chart.buyer.title": "Spend by buyer",
    "procurement.spendAnalysis.chart.buyer.description":
      "Top buyers by purchase order spend.",
    "procurement.spendAnalysis.chart.buyer.empty":
      "No buyer spend to chart yet.",
    "procurement.spendAnalysis.table.title": "Top suppliers",
    "procurement.spendAnalysis.table.description":
      "Click a supplier to open its detail.",
    "procurement.spendAnalysis.table.empty": "No suppliers with spend yet.",
    "procurement.spendAnalysis.table.orderCount": "{{count}} orders",
    "procurement.spendAnalysis.table.openSupplier": "Open {{supplier}}",
    "procurement.spendAnalysis.export.filename": "supplier-spend",
    "procurement.spendAnalysis.export.received": "Received",
    "procurement.spendAnalysis.export.cancelled": "Cancelled",
    "procurement.spendAnalysis.empty.title":
      "No purchase orders in this range",
    "procurement.spendAnalysis.empty.description":
      "Choose a longer time range to see procurement activity.",

    // Suppliers list / fields
    "procurement.suppliers.fields.name": "Supplier",
    "procurement.suppliers.fields.contact": "Contact",
    "procurement.suppliers.fields.email": "Email",
    "procurement.suppliers.fields.rating": "Rating",
    "procurement.suppliers.fields.status": "Status",
    "procurement.suppliers.fields.orders": "Orders",
    "procurement.suppliers.fields.spend": "Total spend",
    "procurement.suppliers.fields.openSpend": "Open commitment",
    "procurement.suppliers.views.all": "All suppliers",
    "procurement.suppliers.views.active": "Active",
    "procurement.suppliers.views.inactive": "Inactive",
    "procurement.suppliers.views.topRated": "Top rated",
    "procurement.suppliers.kpi.active": "Active suppliers",
    "procurement.suppliers.kpi.spend": "Total spend",
    "procurement.suppliers.kpi.openSpend": "Open commitment",
    "procurement.suppliers.kpi.averageRating": "Average rating",
    "procurement.suppliers.bulk.setStatus": "Set status",
    "procurement.suppliers.bulk.result": "{{count}} suppliers updated",

    // Suppliers form
    "procurement.suppliers.form.name": "Supplier name",
    "procurement.suppliers.form.namePlaceholder": "e.g. Northwind Supply Co.",
    "procurement.suppliers.form.nameRequired": "Supplier name is required",
    "procurement.suppliers.form.contactName": "Contact name",
    "procurement.suppliers.form.contactPlaceholder": "e.g. Marcus Reed",
    "procurement.suppliers.form.email": "Email",
    "procurement.suppliers.form.emailPlaceholder": "contact@supplier.com",
    "procurement.suppliers.form.rating": "Rating (1–5)",
    "procurement.suppliers.form.ratingRange": "Rating is between 1 and 5",
    "procurement.suppliers.form.status": "Status",
    "procurement.suppliers.form.add": "Add supplier",
    "procurement.suppliers.form.adding": "Adding...",

    // Suppliers drawers
    "procurement.suppliers.drawer.create.title": "Add supplier",
    "procurement.suppliers.drawer.create.description":
      "Add a vendor you buy goods or services from.",
    "procurement.suppliers.drawer.edit.title": "Edit supplier",
    "procurement.suppliers.drawer.edit.description":
      "Update this vendor's profile.",
    "procurement.suppliers.drawer.show.description":
      "Profile and purchase orders for this vendor.",

    // Supplier detail
    "procurement.suppliers.detail.profile": "Profile",
    "procurement.suppliers.detail.fallbackName": "Unnamed supplier",
    "procurement.suppliers.detail.loadError.title": "Unable to load supplier",
    "procurement.suppliers.detail.loadError.description":
      "The supplier may no longer exist, or you may not have permission to view it.",
    "procurement.suppliers.detail.contact": "Contact",
    "procurement.suppliers.detail.email": "Email",
    "procurement.suppliers.detail.rating": "Rating",
    "procurement.suppliers.detail.status": "Status",

    // Supplier orders section
    "procurement.suppliers.orders.title": "Purchase orders",
    "procurement.suppliers.orders.summary":
      "{{count}} orders · {{amount}} committed",
    "procurement.suppliers.orders.poNumber": "PO number",
    "procurement.suppliers.orders.status": "Status",
    "procurement.suppliers.orders.orderDate": "Order date",
    "procurement.suppliers.orders.total": "Total",
    "procurement.suppliers.orders.empty":
      "No purchase orders raised for this supplier yet.",
    // --- Production list ops (toolbar, views, bulk, states) ---
    "procurement.ops.selectAll": "Select all",
    "procurement.ops.selectRow": "Select row",
    "procurement.ops.clearFilters": "Clear filters",
    "procurement.ops.saveView": "Save view",
    "procurement.ops.saveViewTitle": "Save current filters",
    "procurement.ops.saveViewPlaceholder": "View name",
    "procurement.ops.saveViewConfirm": "Save",
    "procurement.ops.density": "Row density",
    "procurement.ops.densityCompact": "Compact",
    "procurement.ops.densityComfortable": "Comfortable",
    "procurement.ops.columns": "Columns",
    "procurement.ops.columnsTitle": "Visible columns",
    "procurement.ops.columnsReset": "Reset columns",
    "procurement.ops.exportCsv": "Export CSV",
    "procurement.ops.exporting": "Exporting...",
    "procurement.ops.selected": "{{count}} selected",
    "procurement.ops.bulkDelete": "Delete",
    "procurement.ops.clearSelection": "Clear",
    "procurement.ops.error.title": "Something went wrong",
    "procurement.ops.error.description":
      "The data could not be loaded. Check your connection and try again.",
    "procurement.ops.error.retry": "Retry",
    "procurement.ops.empty.title": "Nothing here yet",
    "procurement.common.copyLink": "Copy link",

    // PO — views, KPI, bulk, workflow, print
    "procurement.po.views.all": "All orders",
    "procurement.po.views.draft": "Drafts",
    "procurement.po.views.sent": "Awaiting delivery",
    "procurement.po.views.received": "Received",
    "procurement.po.views.last30": "Last 30 days",
    "procurement.po.kpi.open": "Open orders",
    "procurement.po.kpi.open.hint": "Draft or awaiting delivery",
    "procurement.po.kpi.awaiting": "Awaiting delivery",
    "procurement.po.kpi.awaiting.hint": "Sent to the supplier",
    "procurement.po.kpi.committed": "Committed spend",
    "procurement.po.kpi.committed.hint": "Value of orders not yet received",
    "procurement.po.kpi.received": "Received",
    "procurement.po.kpi.received.hint": "{{value}} landed",
    "procurement.po.bulk.result": "{{done}} of {{total}} orders moved",
    "procurement.po.bulk.noneEligible":
      "None of the selected orders can make this move",
    "procurement.po.print.action": "Print order",
    "procurement.po.workflow.send": "Send to supplier",
    "procurement.po.workflow.receive": "Mark received",
    "procurement.po.workflow.cancel": "Cancel order",
    "procurement.po.workflow.reopen": "Return to draft",
    "procurement.po.workflow.closed": "This order is closed — no further moves.",
    "procurement.po.workflow.needsItems":
      "Add at least one line item before sending this order",
    "procurement.po.workflow.cancelledNote":
      "This order was cancelled. Reopen it as a draft to work on it again.",
    "procurement.po.workflow.totalMismatch.title":
      "Order total does not match the line items",
    "procurement.po.workflow.totalMismatch.description":
      "Header says {{header}}, line items add up to {{items}}.",
    "procurement.po.workflow.totalMismatch.sync": "Recalculate from items",

    // Supplier scorecard
    "procurement.suppliers.performance.title": "Performance",
    "procurement.suppliers.performance.orders": "Orders placed",
    "procurement.suppliers.performance.fulfilment": "Fulfilment rate",
    "procurement.suppliers.performance.cancellation": "Cancellation rate",
    "procurement.suppliers.performance.aov": "Average order value",
    "procurement.suppliers.performance.received": "Value received",
    "procurement.suppliers.performance.open": "Open commitment",
  },
  "zh-CN": {
    // Nav / resources
    "procurement.resources.purchaseOrders": "采购订单",
    "procurement.resources.purchaseOrder": "采购订单",
    "procurement.resources.purchaseOrders.description":
      "创建并跟踪采购订单、订单明细及供应商支出。",
    "procurement.resources.suppliers": "供应商",
    "procurement.resources.supplier": "供应商",
    "procurement.resources.suppliers.description":
      "你的采购来源,含评分与历史订单。",
    "procurement.resources.spendAnalysis": "支出分析",
    "procurement.resources.spendAnalysis.description":
      "按供应商的支出分布、订单状态占比与月度支出趋势。",

    // Common
    "procurement.common.actions": "操作",
    "procurement.common.cancel": "取消",
    "procurement.common.close": "关闭",
    "procurement.common.save": "保存修改",
    "procurement.common.saving": "保存中...",
    "procurement.common.notAvailable": "—",

    // Pickers
    "procurement.pickers.select": "请选择...",
    "procurement.pickers.search": "搜索...",
    "procurement.pickers.noResults": "无结果",
    "procurement.pickers.clear": "清除选择",
    "procurement.pickers.supplier.placeholder": "选择供应商",
    "procurement.pickers.owner.placeholder": "指派负责人(可选)",

    // Enums
    "procurement.enums.poStatus.draft": "草稿",
    "procurement.enums.poStatus.sent": "已发出",
    "procurement.enums.poStatus.received": "已收货",
    "procurement.enums.poStatus.cancelled": "已取消",
    "procurement.enums.supplierStatus.active": "启用",
    "procurement.enums.supplierStatus.inactive": "停用",

    // Purchase order fields
    "procurement.po.fields.poNumber": "订单编号",
    "procurement.po.fields.supplier": "供应商",
    "procurement.po.fields.status": "状态",
    "procurement.po.fields.orderDate": "下单日期",
    "procurement.po.fields.total": "金额",
    "procurement.po.fields.owner": "负责人",
    "procurement.po.fields.orderTotal": "订单总额",

    // Purchase order form
    "procurement.po.form.poNumberPlaceholder": "例如 PO-2049",
    "procurement.po.form.poNumberRequired": "订单编号为必填项",
    "procurement.po.form.supplierRequired": "请选择本订单对应的供应商",
    "procurement.po.form.totalNegative": "金额不能为负数",
    "procurement.po.form.totalHint": "从订单详情中添加明细行以累计总额。",
    "procurement.po.form.create": "创建订单",
    "procurement.po.form.creating": "创建中...",

    // Purchase order drawers
    "procurement.po.drawer.create.title": "新建采购订单",
    "procurement.po.drawer.create.description": "向供应商发起一张采购订单。",
    "procurement.po.drawer.edit.title": "编辑采购订单",
    "procurement.po.drawer.edit.description": "更新本订单的详细信息。",
    "procurement.po.drawer.show.description": "本订单的供应商、负责人与明细行。",

    // Purchase order detail
    "procurement.po.detail.title": "订单",
    "procurement.po.detail.fallbackName": "采购订单",
    "procurement.po.detail.loadError.title": "无法加载采购订单",
    "procurement.po.detail.loadError.description":
      "该订单可能已不存在,或你没有查看权限。",

    // Line items
    "procurement.po.items.title": "订单明细",
    "procurement.po.items.add": "添加明细",
    "procurement.po.items.product": "产品",
    "procurement.po.items.qty": "数量",
    "procurement.po.items.unitPrice": "单价",
    "procurement.po.items.lineTotal": "小计",
    "procurement.po.items.empty": "暂无明细行,请添加本订单的产品。",
    "procurement.po.items.subtotal": "明细合计",
    "procurement.po.items.fields.product": "产品",
    "procurement.po.items.fields.quantity": "数量",
    "procurement.po.items.fields.unitPrice": "单价",
    "procurement.po.items.form.productPlaceholder": "例如 钢支架",
    "procurement.po.items.form.productRequired": "产品名称为必填项",
    "procurement.po.items.form.qtyRequired": "数量为必填项",
    "procurement.po.items.form.qtyNegative": "数量不能为负数",
    "procurement.po.items.form.unitPriceRequired": "单价为必填项",
    "procurement.po.items.form.unitPriceNegative": "单价不能为负数",
    "procurement.po.items.form.add": "添加明细",
    "procurement.po.items.form.adding": "添加中...",
    "procurement.po.items.drawer.create.title": "添加明细行",
    "procurement.po.items.drawer.create.description": "为本采购订单添加一个产品明细行。",
    "procurement.po.items.drawer.edit.title": "编辑明细行",
    "procurement.po.items.drawer.edit.description": "更新此产品明细行。",

    // Spend panel (KPIs + chart)
    "procurement.spend.kpi.committed.label": "已承诺支出",
    "procurement.spend.kpi.committed.hint": "{{count}} 个进行中订单",
    "procurement.spend.kpi.open.label": "进行中订单",
    "procurement.spend.kpi.open.hint": "草稿 + 已发出",
    "procurement.spend.kpi.received.label": "已收货",
    "procurement.spend.kpi.received.hint": "货物已交付",
    "procurement.spend.kpi.avg.label": "平均订单金额",
    "procurement.spend.kpi.avg.hint": "不含已取消",
    "procurement.spend.chart.title": "各供应商支出",
    "procurement.spend.chart.description": "所有进行中采购订单的已承诺支出。",
    "procurement.spend.chart.empty": "暂无支出可供展示。",
    "procurement.spend.unassigned": "未指定",

    // Spend analysis dashboard
    "procurement.spendAnalysis.title": "支出分析",
    "procurement.spendAnalysis.description":
      "采购支出去向:按供应商、按订单状态、按时间趋势。",
    "procurement.spendAnalysis.range.label": "时间范围",
    "procurement.spendAnalysis.range.6": "6 个月",
    "procurement.spendAnalysis.range.12": "12 个月",
    "procurement.spendAnalysis.range.24": "24 个月",
    "procurement.spendAnalysis.kpi.total.label": "总支出",
    "procurement.spendAnalysis.kpi.open.label": "未结承诺金额",
    "procurement.spendAnalysis.kpi.receivedRange.label": "已收货",
    "procurement.spendAnalysis.kpi.cancelled.label": "已取消金额",
    "procurement.spendAnalysis.kpi.cancelled.hint":
      "{{count}} 个订单已取消",
    "procurement.spendAnalysis.kpi.committed.label": "已承诺总支出",
    "procurement.spendAnalysis.kpi.committed.hint": "{{count}} 个进行中订单",
    "procurement.spendAnalysis.kpi.received.label": "已收货金额",
    "procurement.spendAnalysis.kpi.received.hint": "{{count}} 个订单已收货",
    "procurement.spendAnalysis.kpi.avg.label": "平均订单金额",
    "procurement.spendAnalysis.kpi.avg.hint": "不含已取消",
    "procurement.spendAnalysis.kpi.topSupplier.label": "首要供应商",
    "procurement.spendAnalysis.kpi.topSupplier.hint": "按已承诺支出排名",
    "procurement.spendAnalysis.chart.supplier.title": "各供应商支出",
    "procurement.spendAnalysis.chart.supplier.description":
      "所有进行中采购订单的已承诺支出。",
    "procurement.spendAnalysis.chart.supplier.empty": "暂无支出可供展示。",
    "procurement.spendAnalysis.chart.status.title": "订单状态占比",
    "procurement.spendAnalysis.chart.status.description":
      "所有采购订单按当前状态分布。",
    "procurement.spendAnalysis.chart.status.empty": "暂无订单。",
    "procurement.spendAnalysis.chart.status.tooltip": "{{count}} 个订单",
    "procurement.spendAnalysis.chart.trend.title": "月度支出趋势",
    "procurement.spendAnalysis.chart.trend.description":
      "按下单日期统计的近 {{months}} 个月已承诺支出。",
    "procurement.spendAnalysis.chart.buyer.title": "各采购负责人支出",
    "procurement.spendAnalysis.chart.buyer.description":
      "按采购订单支出排名的前十位负责人。",
    "procurement.spendAnalysis.chart.buyer.empty": "暂无负责人支出可供展示。",
    "procurement.spendAnalysis.table.title": "支出最高的供应商",
    "procurement.spendAnalysis.table.description":
      "点击供应商可打开详情。",
    "procurement.spendAnalysis.table.empty": "暂无有支出记录的供应商。",
    "procurement.spendAnalysis.table.orderCount": "{{count}} 个订单",
    "procurement.spendAnalysis.table.openSupplier": "打开 {{supplier}}",
    "procurement.spendAnalysis.export.filename": "供应商支出",
    "procurement.spendAnalysis.export.received": "已收货",
    "procurement.spendAnalysis.export.cancelled": "已取消",
    "procurement.spendAnalysis.empty.title": "此时间范围内没有采购订单",
    "procurement.spendAnalysis.empty.description":
      "请选择更长的时间范围以查看采购活动。",

    // Suppliers list / fields
    "procurement.suppliers.fields.name": "供应商",
    "procurement.suppliers.fields.contact": "联系人",
    "procurement.suppliers.fields.email": "邮箱",
    "procurement.suppliers.fields.rating": "评分",
    "procurement.suppliers.fields.status": "状态",
    "procurement.suppliers.fields.orders": "订单数",
    "procurement.suppliers.fields.spend": "总支出",
    "procurement.suppliers.fields.openSpend": "在途承诺",
    "procurement.suppliers.views.all": "全部供应商",
    "procurement.suppliers.views.active": "启用",
    "procurement.suppliers.views.inactive": "停用",
    "procurement.suppliers.views.topRated": "高评分",
    "procurement.suppliers.kpi.active": "活跃供应商",
    "procurement.suppliers.kpi.spend": "总支出",
    "procurement.suppliers.kpi.openSpend": "在途承诺",
    "procurement.suppliers.kpi.averageRating": "平均评分",
    "procurement.suppliers.bulk.setStatus": "设置状态",
    "procurement.suppliers.bulk.result": "已更新 {{count}} 家供应商",

    // Suppliers form
    "procurement.suppliers.form.name": "供应商名称",
    "procurement.suppliers.form.namePlaceholder": "例如 北风供应有限公司",
    "procurement.suppliers.form.nameRequired": "供应商名称为必填项",
    "procurement.suppliers.form.contactName": "联系人姓名",
    "procurement.suppliers.form.contactPlaceholder": "例如 王磊",
    "procurement.suppliers.form.email": "邮箱",
    "procurement.suppliers.form.emailPlaceholder": "contact@supplier.com",
    "procurement.suppliers.form.rating": "评分(1–5)",
    "procurement.suppliers.form.ratingRange": "评分需在 1 到 5 之间",
    "procurement.suppliers.form.status": "状态",
    "procurement.suppliers.form.add": "添加供应商",
    "procurement.suppliers.form.adding": "添加中...",

    // Suppliers drawers
    "procurement.suppliers.drawer.create.title": "添加供应商",
    "procurement.suppliers.drawer.create.description":
      "添加一家你采购商品或服务的供应商。",
    "procurement.suppliers.drawer.edit.title": "编辑供应商",
    "procurement.suppliers.drawer.edit.description": "更新此供应商的资料。",
    "procurement.suppliers.drawer.show.description": "本供应商的资料与采购订单。",

    // Supplier detail
    "procurement.suppliers.detail.profile": "资料",
    "procurement.suppliers.detail.fallbackName": "未命名供应商",
    "procurement.suppliers.detail.loadError.title": "无法加载供应商",
    "procurement.suppliers.detail.loadError.description":
      "该供应商可能已不存在,或你没有查看权限。",
    "procurement.suppliers.detail.contact": "联系人",
    "procurement.suppliers.detail.email": "邮箱",
    "procurement.suppliers.detail.rating": "评分",
    "procurement.suppliers.detail.status": "状态",

    // Supplier orders section
    "procurement.suppliers.orders.title": "采购订单",
    "procurement.suppliers.orders.summary": "{{count}} 个订单 · 已承诺 {{amount}}",
    "procurement.suppliers.orders.poNumber": "订单编号",
    "procurement.suppliers.orders.status": "状态",
    "procurement.suppliers.orders.orderDate": "下单日期",
    "procurement.suppliers.orders.total": "金额",
    "procurement.suppliers.orders.empty": "该供应商暂无采购订单。",
    // --- 生产级列表操作(工具条 / 视图 / 批量 / 三态) ---
    "procurement.ops.selectAll": "全选",
    "procurement.ops.selectRow": "选择本行",
    "procurement.ops.clearFilters": "清除筛选",
    "procurement.ops.saveView": "保存视图",
    "procurement.ops.saveViewTitle": "保存当前筛选",
    "procurement.ops.saveViewPlaceholder": "视图名称",
    "procurement.ops.saveViewConfirm": "保存",
    "procurement.ops.density": "行高",
    "procurement.ops.densityCompact": "紧凑",
    "procurement.ops.densityComfortable": "宽松",
    "procurement.ops.columns": "列",
    "procurement.ops.columnsTitle": "显示的列",
    "procurement.ops.columnsReset": "恢复默认列",
    "procurement.ops.exportCsv": "导出 CSV",
    "procurement.ops.exporting": "导出中...",
    "procurement.ops.selected": "已选择 {{count}} 条",
    "procurement.ops.bulkDelete": "删除",
    "procurement.ops.clearSelection": "取消选择",
    "procurement.ops.error.title": "出错了",
    "procurement.ops.error.description": "数据加载失败，请检查网络后重试。",
    "procurement.ops.error.retry": "重试",
    "procurement.ops.empty.title": "暂无内容",
    "procurement.common.copyLink": "复制链接",

    // 采购单——视图 / KPI / 批量 / 流程 / 打印
    "procurement.po.views.all": "全部采购单",
    "procurement.po.views.draft": "草稿",
    "procurement.po.views.sent": "待收货",
    "procurement.po.views.received": "已收货",
    "procurement.po.views.last30": "最近 30 天",
    "procurement.po.kpi.open": "在办采购单",
    "procurement.po.kpi.open.hint": "草稿或待收货",
    "procurement.po.kpi.awaiting": "待收货",
    "procurement.po.kpi.awaiting.hint": "已发给供应商",
    "procurement.po.kpi.committed": "已承诺支出",
    "procurement.po.kpi.committed.hint": "尚未收货的订单金额",
    "procurement.po.kpi.received": "已收货",
    "procurement.po.kpi.received.hint": "已到货 {{value}}",
    "procurement.po.bulk.result": "{{total}} 张中已流转 {{done}} 张",
    "procurement.po.bulk.noneEligible": "所选采购单都无法执行该流转",
    "procurement.po.print.action": "打印采购单",
    "procurement.po.workflow.send": "发送给供应商",
    "procurement.po.workflow.receive": "标记已收货",
    "procurement.po.workflow.cancel": "取消采购单",
    "procurement.po.workflow.reopen": "退回草稿",
    "procurement.po.workflow.closed": "该采购单已结束，没有可用流转。",
    "procurement.po.workflow.needsItems": "发送前请至少添加一条行项目",
    "procurement.po.workflow.cancelledNote":
      "该采购单已取消。退回草稿后可继续处理。",
    "procurement.po.workflow.totalMismatch.title": "订单金额与行项目不一致",
    "procurement.po.workflow.totalMismatch.description":
      "表头为 {{header}}，行项目合计为 {{items}}。",
    "procurement.po.workflow.totalMismatch.sync": "按行项目重算",

    // 供应商绩效
    "procurement.suppliers.performance.title": "绩效",
    "procurement.suppliers.performance.orders": "下单次数",
    "procurement.suppliers.performance.fulfilment": "履约率",
    "procurement.suppliers.performance.cancellation": "取消率",
    "procurement.suppliers.performance.aov": "平均订单金额",
    "procurement.suppliers.performance.received": "已到货金额",
    "procurement.suppliers.performance.open": "在途金额",
  },
};

export default procurementLocale;
