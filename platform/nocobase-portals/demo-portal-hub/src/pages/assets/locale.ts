export const assetsLocale = {
  "en-US": {
    // Nav / resources
    "assets.resources.assets": "Assets",
    "assets.resources.asset": "Asset",
    "assets.resources.assets.description":
      "The company asset register — every device, its category, status and value.",
    "assets.resources.assignments": "Assignments",
    "assets.resources.assignment": "Assignment",
    "assets.resources.assignments.description":
      "Who has what — active and returned device assignments across the company.",
    "assets.resources.maintenance": "Maintenance",
    "assets.resources.maintenanceRecord": "Maintenance record",
    "assets.resources.maintenance.description":
      "Scheduled and completed service work — repairs, inspections and preventive maintenance across the fleet.",

    // Common
    "assets.common.close": "Close",
    "assets.common.cancel": "Cancel",
    "assets.common.save": "Save changes",
    "assets.common.saving": "Saving...",
    "assets.common.actions": "Actions",
    "assets.common.view": "View",
    "assets.common.notAvailable": "—",
    "assets.common.printedOn": "Printed {{date}}",

    // Enums — category
    "assets.enums.category.laptop": "Laptop",
    "assets.enums.category.monitor": "Monitor",
    "assets.enums.category.phone": "Phone",
    "assets.enums.category.peripheral": "Peripheral",
    "assets.enums.category.other": "Other",

    // Enums — status
    "assets.enums.status.in_stock": "In stock",
    "assets.enums.status.assigned": "Assigned",
    "assets.enums.status.repair": "Repair",
    "assets.enums.status.retired": "Retired",

    // Asset fields
    "assets.assets.fields.tag": "Tag",
    "assets.assets.fields.name": "Name",
    "assets.assets.fields.category": "Category",
    "assets.assets.fields.status": "Status",
    "assets.assets.fields.value": "Value",
    "assets.assets.fields.purchased": "Purchased",
    "assets.assets.fields.purchaseDate": "Purchase date",

    // Asset form
    "assets.assets.form.tagRequired": "Asset tag is required",
    "assets.assets.form.tagPlaceholder": "e.g. AS-1024",
    "assets.assets.form.nameRequired": "Name is required",
    "assets.assets.form.namePlaceholder": 'e.g. MacBook Pro 16"',
    "assets.assets.form.categoryUnspecified": "Unspecified",
    "assets.assets.form.creating": "Adding...",
    "assets.assets.form.create": "Add asset",

    // Asset drawers
    "assets.assets.drawer.create.title": "Add asset",
    "assets.assets.drawer.create.description":
      "Register a new device in the asset register.",
    "assets.assets.drawer.edit.title": "Edit asset",
    "assets.assets.drawer.edit.description": "Update this device's details.",
    "assets.assets.drawer.show.description":
      "Profile and full assignment history for this device.",

    // Asset detail
    "assets.assets.detail.unnamed": "Asset",
    "assets.assets.detail.profile": "Profile",
    "assets.assets.detail.added": "Added",
    "assets.assets.detail.loadError.title": "Unable to load asset",
    "assets.assets.detail.loadError.description":
      "The asset may no longer exist, or you may not have permission to view it.",

    // Assignment history (inside asset detail)
    "assets.assets.history.title": "Assignment history",
    "assets.assets.history.returnActiveFirst":
      "Return the active assignment before reassigning",
    "assets.assets.history.assignThis": "Assign this device",
    "assets.assets.history.assign": "Assign",
    "assets.assets.history.headers.assignee": "Assignee",
    "assets.assets.history.headers.assigned": "Assigned",
    "assets.assets.history.headers.returned": "Returned",
    "assets.assets.history.headers.note": "Note",
    "assets.assets.history.empty":
      "Never assigned. Use Assign to hand this device to someone.",

    // KPI tiles
    "assets.kpi.totalAssets": "Total assets",
    "assets.kpi.totalAssets.hint": "{{value}} book value",
    "assets.kpi.assigned": "Assigned",
    "assets.kpi.assigned.hint": "In use by staff",
    "assets.kpi.inStock": "In stock",
    "assets.kpi.inStock.hint": "Ready to assign",
    "assets.kpi.inRepair": "In repair",
    "assets.kpi.inRepair.hint": "Out for service",

    // Charts
    "assets.charts.seriesAssets": "Assets",
    "assets.charts.byStatus.title": "By status",
    "assets.charts.byStatus.description": "Where every device sits right now.",
    "assets.charts.byCategory.title": "By category",
    "assets.charts.byCategory.description": "Inventory mix across device types.",

    // Assignment list
    "assets.assignments.columns.asset": "Asset",
    "assets.assignments.columns.assignee": "Assignee",
    "assets.assignments.columns.assigned": "Assigned",
    "assets.assignments.columns.status": "Status",
    "assets.assignments.active": "Active",
    "assets.assignments.returnedPrefix": "Returned",
    "assets.assignments.actions.return": "Return",

    // Assignment detail (show)
    "assets.assignments.show.unnamed": "Assignment",
    "assets.assignments.show.description": "Details for this device assignment.",
    "assets.assignments.show.overview": "Overview",
    "assets.assignments.show.error.title": "Unable to load assignment",
    "assets.assignments.show.error.description":
      "The assignment may no longer exist, or you may not have permission to view it.",
    "assets.assignments.show.returnedOn": "Returned {{date}}",
    "assets.assignments.show.recordReturn": "Record return",
    "assets.assignments.show.print.action": "Print handover receipt",
    "assets.assignments.show.print.title": "Device handover receipt",
    "assets.assignments.show.print.assetTag": "Asset tag",
    "assets.assignments.show.print.signatures": "Signatures",
    "assets.assignments.show.print.issuedBy": "Issued by",
    "assets.assignments.show.print.receivedBy": "Received by",

    // Assignment drawers
    "assets.assignments.drawer.create.title": "Assign a device",
    "assets.assignments.drawer.create.description":
      "Hand an in-stock asset to a member of staff.",
    "assets.assignments.drawer.nestedAssign.title": "Assign this device",
    "assets.assignments.drawer.nestedAssign.description":
      "Record who is taking this asset and when.",
    "assets.assignments.drawer.edit.title": "Edit assignment",
    "assets.assignments.drawer.edit.description":
      "Update the assignment details or record a return.",

    // Assignment form
    "assets.assignments.form.creating": "Assigning...",
    "assets.assignments.form.create": "Assign device",
    "assets.assignments.form.assetRequired": "Pick an asset to assign",
    "assets.assignments.form.assigneeRequired": "Pick who receives this device",
    "assets.assignments.form.assignedDateRequired": "Assigned date is required",

    // Assignment fields
    "assets.assignments.fields.asset": "Asset",
    "assets.assignments.fields.assetPlaceholder": "Select an in-stock asset",
    "assets.assignments.fields.assignee": "Assignee",
    "assets.assignments.fields.assigneePlaceholder": "Select a person",
    "assets.assignments.fields.assignedDate": "Assigned date",
    "assets.assignments.fields.returnedDate": "Returned date",
    "assets.assignments.fields.note": "Note",
    "assets.assignments.fields.notePlaceholder":
      "Anything worth recording about this assignment",

    // Maintenance — enums
    "assets.maintenance.enums.type.preventive": "Preventive",
    "assets.maintenance.enums.type.corrective": "Corrective",
    "assets.maintenance.enums.type.inspection": "Inspection",
    "assets.maintenance.enums.status.scheduled": "Scheduled",
    "assets.maintenance.enums.status.in_progress": "In progress",
    "assets.maintenance.enums.status.done": "Done",

    // Maintenance — list columns
    "assets.maintenance.columns.title": "Title",
    "assets.maintenance.columns.asset": "Asset",
    "assets.maintenance.columns.type": "Type",
    "assets.maintenance.columns.status": "Status",
    "assets.maintenance.columns.scheduled": "Scheduled",

    // Maintenance — fields
    "assets.maintenance.fields.title": "Title",
    "assets.maintenance.fields.titlePlaceholder": "e.g. Battery replacement",
    "assets.maintenance.fields.asset": "Asset",
    "assets.maintenance.fields.assetPlaceholder": "Select an asset",
    "assets.maintenance.fields.type": "Type",
    "assets.maintenance.fields.typePlaceholder": "Select a type",
    "assets.maintenance.fields.status": "Status",
    "assets.maintenance.fields.statusPlaceholder": "Select a status",
    "assets.maintenance.fields.scheduledDate": "Scheduled date",
    "assets.maintenance.fields.completedDate": "Completed date",
    "assets.maintenance.fields.cost": "Cost",
    "assets.maintenance.fields.vendor": "Vendor",
    "assets.maintenance.fields.vendorPlaceholder": "Who is doing the work",
    "assets.maintenance.fields.notes": "Notes",
    "assets.maintenance.fields.notesPlaceholder":
      "Anything worth recording about this work",

    // Maintenance — form
    "assets.maintenance.form.titleRequired": "A title is required",
    "assets.maintenance.form.assetRequired": "Pick the asset being serviced",
    "assets.maintenance.form.typeRequired": "Pick a maintenance type",
    "assets.maintenance.form.statusRequired": "Pick a status",
    "assets.maintenance.form.creating": "Saving...",
    "assets.maintenance.form.create": "Log maintenance",

    // Maintenance — drawers
    "assets.maintenance.drawer.create.title": "Log maintenance",
    "assets.maintenance.drawer.create.description":
      "Record scheduled or completed work on a device.",
    "assets.maintenance.drawer.nestedCreate.title": "Log maintenance",
    "assets.maintenance.drawer.nestedCreate.description":
      "Record work on this device.",
    "assets.maintenance.drawer.edit.title": "Edit maintenance",
    "assets.maintenance.drawer.edit.description":
      "Update this maintenance record.",

    // Maintenance — detail (show)
    "assets.maintenance.show.unnamed": "Maintenance",
    "assets.maintenance.show.description":
      "Details for this maintenance record.",
    "assets.maintenance.show.overview": "Overview",
    "assets.maintenance.show.error.title": "Unable to load maintenance record",
    "assets.maintenance.show.error.description":
      "The record may no longer exist, or you may not have permission to view it.",
    "assets.maintenance.show.assetTag": "Asset tag",
    "assets.maintenance.show.alert.overdueTitle": "Work overdue",
    "assets.maintenance.show.alert.dueTitle": "Work due soon",
    "assets.maintenance.show.alert.overdueDescription":
      "Overdue by {{count}} days · Scheduled {{date}}",
    "assets.maintenance.show.alert.dueDescription":
      "Due in {{count}} days · Scheduled {{date}}",
    "assets.maintenance.show.lifecycle.label": "Work-order status",
    "assets.maintenance.show.lifecycle.moveTo": "Move to {{status}}",
    "assets.maintenance.show.print.action": "Print work order",
    "assets.maintenance.show.print.scheduled": "Scheduled",
    "assets.maintenance.show.print.completed": "Completed",

    // Maintenance sub-list (inside asset detail)
    "assets.assets.maintenance.title": "Maintenance",
    "assets.assets.maintenance.log": "Log",
    "assets.assets.maintenance.logThis": "Log maintenance for this device",
    "assets.assets.maintenance.empty":
      "No maintenance logged. Use Log to record service work.",

    // --- Production list ops (toolbar, views, bulk, states) ---
    "assets.ops.selectAll": "Select all",
    "assets.ops.selectRow": "Select row",
    "assets.ops.clearFilters": "Clear filters",
    "assets.ops.saveView": "Save view",
    "assets.ops.saveViewTitle": "Save current filters",
    "assets.ops.saveViewPlaceholder": "View name",
    "assets.ops.saveViewConfirm": "Save",
    "assets.ops.density": "Row density",
    "assets.ops.densityCompact": "Compact",
    "assets.ops.densityComfortable": "Comfortable",
    "assets.ops.columns": "Columns",
    "assets.ops.columnsTitle": "Visible columns",
    "assets.ops.columnsReset": "Reset columns",
    "assets.ops.exportCsv": "Export CSV",
    "assets.ops.exporting": "Exporting...",
    "assets.ops.selected": "{{count}} selected",
    "assets.ops.bulkDelete": "Delete",
    "assets.ops.clearSelection": "Clear",
    "assets.ops.error.title": "Something went wrong",
    "assets.ops.error.description":
      "The data could not be loaded. Check your connection and try again.",
    "assets.ops.error.retry": "Retry",
    "assets.ops.empty.title": "Nothing here yet",

    // Common additions
    "assets.common.copyLink": "Copy link",

    // Asset list additions
    "assets.assets.fields.age": "Age",
    "assets.assets.age.years": "y",
    "assets.assets.age.months": "mo",
    "assets.assets.bulk.setStatus": "Set status",
    "assets.assets.bulk.statusDone": "{{count}} assets updated",

    // Asset detail — tabs, lifecycle, depreciation, timeline
    "assets.assets.tabs.overview": "Overview",
    "assets.assets.tabs.assignments": "Assignments",
    "assets.assets.tabs.maintenance": "Maintenance",
    "assets.assets.tabs.timeline": "Timeline",
    "assets.assets.detail.heldBy": "Held by",
    "assets.assets.print.action": "Print record",
    "assets.assets.serviceAlert.overdue": "Maintenance overdue",
    "assets.assets.serviceAlert.due": "Maintenance due soon",
    "assets.assets.lifecycle.label": "Lifecycle",
    "assets.assets.lifecycle.terminal": "No further moves",
    "assets.assets.lifecycle.moveTo": "Move to {{status}}",
    "assets.assets.lifecycle.returnFirst": "Return the device before retiring it",
    "assets.assets.depreciation.title": "Depreciation",
    "assets.assets.depreciation.netBookValue": "Net book value",
    "assets.assets.depreciation.schedule": "Straight-line, {{months}} months",
    "assets.assets.depreciation.accumulated": "Accumulated {{value}}",
    "assets.assets.depreciation.inService": "{{months}} months in service",
    "assets.assets.depreciation.fully": "Fully depreciated — a refresh candidate.",
    "assets.assets.history.headers.heldFor": "Held for",
    "assets.assets.history.days": "{{count}} days",
    "assets.assets.maintenance.lifetimeCost": "Lifetime cost {{value}}",
    "assets.assets.timeline.title": "Lifecycle timeline",
    "assets.assets.timeline.purchased": "Purchased",
    "assets.assets.timeline.assigned": "Assigned",
    "assets.assets.timeline.returned": "Returned",
    "assets.assets.timeline.serviceScheduled": "Service scheduled",
    "assets.assets.timeline.serviceCompleted": "Service completed",
    "assets.assets.timeline.empty": "Nothing has happened to this device yet.",

    // Maintenance — views, KPI, due badges, bulk
    "assets.maintenance.views.all": "All work",
    "assets.maintenance.views.open": "Open",
    "assets.maintenance.views.overdue": "Overdue",
    "assets.maintenance.views.dueThisWeek": "Due this week",
    "assets.maintenance.views.completed": "Completed",
    "assets.maintenance.views.preventive": "Preventive",
    "assets.maintenance.overdueBy": "{{count}}d overdue",
    "assets.maintenance.dueIn": "due in {{count}}d",
    "assets.maintenance.bulk.markDone": "Mark completed",
    "assets.maintenance.bulk.doneResult": "{{count}} records closed",
    "assets.maintenance.kpi.open": "Open work",
    "assets.maintenance.kpi.open.hint": "Scheduled or in progress",
    "assets.maintenance.kpi.overdue": "Overdue",
    "assets.maintenance.kpi.overdue.hint": "Past the scheduled date",
    "assets.maintenance.kpi.dueSoon": "Due in 30 days",
    "assets.maintenance.kpi.dueSoon.hint": "Plan capacity for these",
    "assets.maintenance.kpi.spend": "Completed spend",
    "assets.maintenance.kpi.spend.hint": "Across all closed work",

    // Assignments — scope, KPI, bulk
    "assets.assignments.views.all": "All",
    "assets.assignments.views.active": "Active",
    "assets.assignments.views.returned": "Returned",
    "assets.assignments.columns.heldFor": "Held for",
    "assets.assignments.daysValue": "{{count}} days",
    "assets.assignments.bulk.return": "Return {{count}} devices",
    "assets.assignments.bulk.returnResult": "{{count}} devices returned to stock",
    "assets.assignments.kpi.active": "Active",
    "assets.assignments.kpi.active.hint": "Devices currently out",
    "assets.assignments.kpi.holders": "People holding kit",
    "assets.assignments.kpi.holders.hint": "Distinct assignees",
    "assets.assignments.kpi.returned": "Returned",
    "assets.assignments.kpi.returned.hint": "Closed assignments",
    "assets.assignments.kpi.longest": "Longest held",
    "assets.assignments.kpi.longest.value": "{{count}}d",
    "assets.assignments.kpi.longest.hint": "Oldest open assignment",

    // Asset ledger
    "assets.resources.ledger": "Asset ledger",
    "assets.resources.ledger.description":
      "Book value, accumulated depreciation and refresh exposure across the register.",
    "assets.ledger.title": "Asset ledger",
    "assets.ledger.description":
      "Book value, accumulated depreciation and refresh exposure across the register.",
    "assets.ledger.kpi.cost": "Acquisition cost",
    "assets.ledger.kpi.cost.hint": "{{count}} devices on the register",
    "assets.ledger.kpi.nbv": "Net book value",
    "assets.ledger.kpi.nbv.hint": "After straight-line depreciation",
    "assets.ledger.kpi.accumulated": "Accumulated depreciation",
    "assets.ledger.kpi.accumulated.hint": "{{percent}}% of acquisition cost",
    "assets.ledger.kpi.refresh": "Refresh candidates",
    "assets.ledger.kpi.refresh.hint": "Past their useful life",
    "assets.ledger.series.cost": "Acquisition cost",
    "assets.ledger.series.nbv": "Net book value",
    "assets.ledger.series.spend": "Capital spend",
    "assets.ledger.byCategory.title": "Cost vs book value",
    "assets.ledger.byCategory.description":
      "How much value each device class still carries.",
    "assets.ledger.byYear.title": "Capital spend by year",
    "assets.ledger.byYear.description":
      "Acquisition cost of everything purchased in each year.",
    "assets.ledger.categoryTable.title": "Ledger by category",
    "assets.ledger.categoryTable.description":
      "Depreciation schedule and remaining value per class.",
    "assets.ledger.refresh.title": "Refresh candidates",
    "assets.ledger.refresh.description":
      "Devices past their useful life that are still in service.",
    "assets.ledger.refresh.empty": "Nothing is past its useful life.",
    "assets.ledger.headers.count": "Units",
    "assets.ledger.headers.life": "Life",
    "assets.ledger.headers.cost": "Cost",
    "assets.ledger.headers.nbv": "Book value",
    "assets.ledger.headers.overrun": "Over life by",
    "assets.ledger.empty.title": "Nothing on the register yet",
    "assets.ledger.empty.description":
      "Add assets to see book value and depreciation.",
  },

  "zh-CN": {
    // Nav / resources
    "assets.resources.assets": "资产",
    "assets.resources.asset": "资产",
    "assets.resources.assets.description":
      "公司资产台账——每一台设备的类别、状态与价值。",
    "assets.resources.assignments": "领用记录",
    "assets.resources.assignment": "领用记录",
    "assets.resources.assignments.description":
      "谁在用什么——全公司在用与已归还的设备领用情况。",
    "assets.resources.maintenance": "维保",
    "assets.resources.maintenanceRecord": "维保记录",
    "assets.resources.maintenance.description":
      "计划中与已完成的维护工作——全公司设备的维修、检查与预防性保养。",

    // Common
    "assets.common.close": "关闭",
    "assets.common.cancel": "取消",
    "assets.common.save": "保存修改",
    "assets.common.saving": "保存中...",
    "assets.common.actions": "操作",
    "assets.common.view": "查看",
    "assets.common.notAvailable": "—",
    "assets.common.printedOn": "打印日期：{{date}}",

    // Enums — category
    "assets.enums.category.laptop": "笔记本电脑",
    "assets.enums.category.monitor": "显示器",
    "assets.enums.category.phone": "手机",
    "assets.enums.category.peripheral": "外设",
    "assets.enums.category.other": "其他",

    // Enums — status
    "assets.enums.status.in_stock": "在库",
    "assets.enums.status.assigned": "已领用",
    "assets.enums.status.repair": "维修中",
    "assets.enums.status.retired": "已报废",

    // Asset fields
    "assets.assets.fields.tag": "资产编号",
    "assets.assets.fields.name": "名称",
    "assets.assets.fields.category": "类别",
    "assets.assets.fields.status": "状态",
    "assets.assets.fields.value": "价值",
    "assets.assets.fields.purchased": "购入日期",
    "assets.assets.fields.purchaseDate": "购入日期",

    // Asset form
    "assets.assets.form.tagRequired": "资产编号为必填项",
    "assets.assets.form.tagPlaceholder": "例如 AS-1024",
    "assets.assets.form.nameRequired": "名称为必填项",
    "assets.assets.form.namePlaceholder": '例如 MacBook Pro 16"',
    "assets.assets.form.categoryUnspecified": "未指定",
    "assets.assets.form.creating": "添加中...",
    "assets.assets.form.create": "添加资产",

    // Asset drawers
    "assets.assets.drawer.create.title": "添加资产",
    "assets.assets.drawer.create.description": "在资产台账中登记一台新设备。",
    "assets.assets.drawer.edit.title": "编辑资产",
    "assets.assets.drawer.edit.description": "更新这台设备的信息。",
    "assets.assets.drawer.show.description": "该设备的档案与完整领用历史。",

    // Asset detail
    "assets.assets.detail.unnamed": "资产",
    "assets.assets.detail.profile": "档案",
    "assets.assets.detail.added": "登记时间",
    "assets.assets.detail.loadError.title": "无法加载资产",
    "assets.assets.detail.loadError.description":
      "该资产可能已不存在，或你没有查看权限。",

    // Assignment history (inside asset detail)
    "assets.assets.history.title": "领用历史",
    "assets.assets.history.returnActiveFirst": "重新分配前请先归还当前的领用",
    "assets.assets.history.assignThis": "分配这台设备",
    "assets.assets.history.assign": "分配",
    "assets.assets.history.headers.assignee": "领用人",
    "assets.assets.history.headers.assigned": "领用日期",
    "assets.assets.history.headers.returned": "归还日期",
    "assets.assets.history.headers.note": "备注",
    "assets.assets.history.empty": "从未分配。点击“分配”将设备交给他人。",

    // KPI tiles
    "assets.kpi.totalAssets": "资产总数",
    "assets.kpi.totalAssets.hint": "账面价值 {{value}}",
    "assets.kpi.assigned": "已领用",
    "assets.kpi.assigned.hint": "员工在用",
    "assets.kpi.inStock": "在库",
    "assets.kpi.inStock.hint": "可供分配",
    "assets.kpi.inRepair": "维修中",
    "assets.kpi.inRepair.hint": "送修中",

    // Charts
    "assets.charts.seriesAssets": "资产",
    "assets.charts.byStatus.title": "按状态",
    "assets.charts.byStatus.description": "每台设备当前的所在状态。",
    "assets.charts.byCategory.title": "按类别",
    "assets.charts.byCategory.description": "各设备类型的库存构成。",

    // Assignment list
    "assets.assignments.columns.asset": "资产",
    "assets.assignments.columns.assignee": "领用人",
    "assets.assignments.columns.assigned": "领用日期",
    "assets.assignments.columns.status": "状态",
    "assets.assignments.active": "在用",
    "assets.assignments.returnedPrefix": "已归还",
    "assets.assignments.actions.return": "归还",

    // Assignment detail (show)
    "assets.assignments.show.unnamed": "领用记录",
    "assets.assignments.show.description": "这条设备领用记录的详情。",
    "assets.assignments.show.overview": "概览",
    "assets.assignments.show.error.title": "无法加载领用记录",
    "assets.assignments.show.error.description":
      "该领用记录可能已不存在，或你没有查看权限。",
    "assets.assignments.show.returnedOn": "已于 {{date}} 归还",
    "assets.assignments.show.recordReturn": "登记归还",
    "assets.assignments.show.print.action": "打印交接单",
    "assets.assignments.show.print.title": "设备交接单",
    "assets.assignments.show.print.assetTag": "资产编号",
    "assets.assignments.show.print.signatures": "签字",
    "assets.assignments.show.print.issuedBy": "发放人",
    "assets.assignments.show.print.receivedBy": "领用人",

    // Assignment drawers
    "assets.assignments.drawer.create.title": "分配设备",
    "assets.assignments.drawer.create.description": "将一台在库资产交给某位员工。",
    "assets.assignments.drawer.nestedAssign.title": "分配这台设备",
    "assets.assignments.drawer.nestedAssign.description":
      "记录谁在何时领用了这台资产。",
    "assets.assignments.drawer.edit.title": "编辑领用记录",
    "assets.assignments.drawer.edit.description": "更新领用信息或登记归还。",

    // Assignment form
    "assets.assignments.form.creating": "分配中...",
    "assets.assignments.form.create": "分配设备",
    "assets.assignments.form.assetRequired": "请选择要分配的资产",
    "assets.assignments.form.assigneeRequired": "请选择领用人",
    "assets.assignments.form.assignedDateRequired": "领用日期为必填项",

    // Assignment fields
    "assets.assignments.fields.asset": "资产",
    "assets.assignments.fields.assetPlaceholder": "选择一台在库资产",
    "assets.assignments.fields.assignee": "领用人",
    "assets.assignments.fields.assigneePlaceholder": "选择一位员工",
    "assets.assignments.fields.assignedDate": "领用日期",
    "assets.assignments.fields.returnedDate": "归还日期",
    "assets.assignments.fields.note": "备注",
    "assets.assignments.fields.notePlaceholder": "关于这次领用值得记录的任何信息",

    // Maintenance — enums
    "assets.maintenance.enums.type.preventive": "预防性",
    "assets.maintenance.enums.type.corrective": "维修性",
    "assets.maintenance.enums.type.inspection": "检查",
    "assets.maintenance.enums.status.scheduled": "已计划",
    "assets.maintenance.enums.status.in_progress": "进行中",
    "assets.maintenance.enums.status.done": "已完成",

    // Maintenance — list columns
    "assets.maintenance.columns.title": "标题",
    "assets.maintenance.columns.asset": "资产",
    "assets.maintenance.columns.type": "类型",
    "assets.maintenance.columns.status": "状态",
    "assets.maintenance.columns.scheduled": "计划日期",

    // Maintenance — fields
    "assets.maintenance.fields.title": "标题",
    "assets.maintenance.fields.titlePlaceholder": "例如 更换电池",
    "assets.maintenance.fields.asset": "资产",
    "assets.maintenance.fields.assetPlaceholder": "选择一台资产",
    "assets.maintenance.fields.type": "类型",
    "assets.maintenance.fields.typePlaceholder": "选择类型",
    "assets.maintenance.fields.status": "状态",
    "assets.maintenance.fields.statusPlaceholder": "选择状态",
    "assets.maintenance.fields.scheduledDate": "计划日期",
    "assets.maintenance.fields.completedDate": "完成日期",
    "assets.maintenance.fields.cost": "费用",
    "assets.maintenance.fields.vendor": "服务商",
    "assets.maintenance.fields.vendorPlaceholder": "由谁负责施工",
    "assets.maintenance.fields.notes": "备注",
    "assets.maintenance.fields.notesPlaceholder": "关于本次工作值得记录的任何信息",

    // Maintenance — form
    "assets.maintenance.form.titleRequired": "标题为必填项",
    "assets.maintenance.form.assetRequired": "请选择要维护的资产",
    "assets.maintenance.form.typeRequired": "请选择维护类型",
    "assets.maintenance.form.statusRequired": "请选择状态",
    "assets.maintenance.form.creating": "保存中...",
    "assets.maintenance.form.create": "登记维保",

    // Maintenance — drawers
    "assets.maintenance.drawer.create.title": "登记维保",
    "assets.maintenance.drawer.create.description":
      "记录设备的计划中或已完成的工作。",
    "assets.maintenance.drawer.nestedCreate.title": "登记维保",
    "assets.maintenance.drawer.nestedCreate.description": "记录这台设备的工作。",
    "assets.maintenance.drawer.edit.title": "编辑维保记录",
    "assets.maintenance.drawer.edit.description": "更新这条维保记录。",

    // Maintenance — detail (show)
    "assets.maintenance.show.unnamed": "维保记录",
    "assets.maintenance.show.description": "这条维保记录的详情。",
    "assets.maintenance.show.overview": "概览",
    "assets.maintenance.show.error.title": "无法加载维保记录",
    "assets.maintenance.show.error.description":
      "该记录可能已不存在，或你没有查看权限。",
    "assets.maintenance.show.assetTag": "资产编号",
    "assets.maintenance.show.alert.overdueTitle": "工作已逾期",
    "assets.maintenance.show.alert.dueTitle": "工作即将到期",
    "assets.maintenance.show.alert.overdueDescription":
      "已逾期 {{count}} 天 · 计划日期 {{date}}",
    "assets.maintenance.show.alert.dueDescription":
      "{{count}} 天后到期 · 计划日期 {{date}}",
    "assets.maintenance.show.lifecycle.label": "工单状态",
    "assets.maintenance.show.lifecycle.moveTo": "流转到{{status}}",
    "assets.maintenance.show.print.action": "打印工单",
    "assets.maintenance.show.print.scheduled": "计划日期",
    "assets.maintenance.show.print.completed": "完成日期",

    // Maintenance sub-list (inside asset detail)
    "assets.assets.maintenance.title": "维保",
    "assets.assets.maintenance.log": "登记",
    "assets.assets.maintenance.logThis": "为这台设备登记维保",
    "assets.assets.maintenance.empty": "尚无维保记录。点击“登记”记录服务工作。",

    // --- 生产级列表操作(工具条 / 视图 / 批量 / 三态) ---
    "assets.ops.selectAll": "全选",
    "assets.ops.selectRow": "选择本行",
    "assets.ops.clearFilters": "清除筛选",
    "assets.ops.saveView": "保存视图",
    "assets.ops.saveViewTitle": "保存当前筛选",
    "assets.ops.saveViewPlaceholder": "视图名称",
    "assets.ops.saveViewConfirm": "保存",
    "assets.ops.density": "行高",
    "assets.ops.densityCompact": "紧凑",
    "assets.ops.densityComfortable": "宽松",
    "assets.ops.columns": "列",
    "assets.ops.columnsTitle": "显示的列",
    "assets.ops.columnsReset": "恢复默认列",
    "assets.ops.exportCsv": "导出 CSV",
    "assets.ops.exporting": "导出中...",
    "assets.ops.selected": "已选择 {{count}} 条",
    "assets.ops.bulkDelete": "删除",
    "assets.ops.clearSelection": "取消选择",
    "assets.ops.error.title": "出错了",
    "assets.ops.error.description": "数据加载失败，请检查网络后重试。",
    "assets.ops.error.retry": "重试",
    "assets.ops.empty.title": "暂无内容",

    // 通用补充
    "assets.common.copyLink": "复制链接",

    // 资产列表补充
    "assets.assets.fields.age": "使用年限",
    "assets.assets.age.years": "年",
    "assets.assets.age.months": "个月",
    "assets.assets.bulk.setStatus": "设置状态",
    "assets.assets.bulk.statusDone": "已更新 {{count}} 台资产",

    // 资产详情——分区 / 生命周期 / 折旧 / 时间线
    "assets.assets.tabs.overview": "概览",
    "assets.assets.tabs.assignments": "领用",
    "assets.assets.tabs.maintenance": "维保",
    "assets.assets.tabs.timeline": "时间线",
    "assets.assets.detail.heldBy": "当前持有人",
    "assets.assets.print.action": "打印记录",
    "assets.assets.serviceAlert.overdue": "维保已逾期",
    "assets.assets.serviceAlert.due": "维保即将到期",
    "assets.assets.lifecycle.label": "生命周期",
    "assets.assets.lifecycle.terminal": "无可用流转",
    "assets.assets.lifecycle.moveTo": "流转到{{status}}",
    "assets.assets.lifecycle.returnFirst": "报废前请先归还设备",
    "assets.assets.depreciation.title": "折旧",
    "assets.assets.depreciation.netBookValue": "账面净值",
    "assets.assets.depreciation.schedule": "直线法，{{months}} 个月",
    "assets.assets.depreciation.accumulated": "累计折旧 {{value}}",
    "assets.assets.depreciation.inService": "已使用 {{months}} 个月",
    "assets.assets.depreciation.fully": "已提足折旧——建议更新换代。",
    "assets.assets.history.headers.heldFor": "持有时长",
    "assets.assets.history.days": "{{count}} 天",
    "assets.assets.maintenance.lifetimeCost": "累计维保支出 {{value}}",
    "assets.assets.timeline.title": "生命周期时间线",
    "assets.assets.timeline.purchased": "购入",
    "assets.assets.timeline.assigned": "领用",
    "assets.assets.timeline.returned": "归还",
    "assets.assets.timeline.serviceScheduled": "计划维保",
    "assets.assets.timeline.serviceCompleted": "完成维保",
    "assets.assets.timeline.empty": "这台设备还没有任何记录。",

    // 维保——视图 / KPI / 到期标记 / 批量
    "assets.maintenance.views.all": "全部",
    "assets.maintenance.views.open": "未完成",
    "assets.maintenance.views.overdue": "已逾期",
    "assets.maintenance.views.dueThisWeek": "本周到期",
    "assets.maintenance.views.completed": "已完成",
    "assets.maintenance.views.preventive": "预防性",
    "assets.maintenance.overdueBy": "逾期 {{count}} 天",
    "assets.maintenance.dueIn": "{{count}} 天后到期",
    "assets.maintenance.bulk.markDone": "标记完成",
    "assets.maintenance.bulk.doneResult": "已关闭 {{count}} 条记录",
    "assets.maintenance.kpi.open": "未完成工作",
    "assets.maintenance.kpi.open.hint": "已计划或进行中",
    "assets.maintenance.kpi.overdue": "已逾期",
    "assets.maintenance.kpi.overdue.hint": "已过计划日期",
    "assets.maintenance.kpi.dueSoon": "30 天内到期",
    "assets.maintenance.kpi.dueSoon.hint": "提前安排产能",
    "assets.maintenance.kpi.spend": "已完成支出",
    "assets.maintenance.kpi.spend.hint": "所有已关闭工作合计",

    // 领用——范围 / KPI / 批量
    "assets.assignments.views.all": "全部",
    "assets.assignments.views.active": "在用",
    "assets.assignments.views.returned": "已归还",
    "assets.assignments.columns.heldFor": "持有时长",
    "assets.assignments.daysValue": "{{count}} 天",
    "assets.assignments.bulk.return": "归还 {{count}} 台设备",
    "assets.assignments.bulk.returnResult": "{{count}} 台设备已归还入库",
    "assets.assignments.kpi.active": "在用",
    "assets.assignments.kpi.active.hint": "当前在外的设备",
    "assets.assignments.kpi.holders": "持有人数",
    "assets.assignments.kpi.holders.hint": "去重后的领用人",
    "assets.assignments.kpi.returned": "已归还",
    "assets.assignments.kpi.returned.hint": "已结束的领用",
    "assets.assignments.kpi.longest": "最长持有",
    "assets.assignments.kpi.longest.value": "{{count}} 天",
    "assets.assignments.kpi.longest.hint": "最久未归还的领用",

    // 资产台账
    "assets.resources.ledger": "资产台账",
    "assets.resources.ledger.description":
      "全台账的账面价值、累计折旧与更新换代风险。",
    "assets.ledger.title": "资产台账",
    "assets.ledger.description": "全台账的账面价值、累计折旧与更新换代风险。",
    "assets.ledger.kpi.cost": "购置成本",
    "assets.ledger.kpi.cost.hint": "台账内共 {{count}} 台设备",
    "assets.ledger.kpi.nbv": "账面净值",
    "assets.ledger.kpi.nbv.hint": "已扣除直线法折旧",
    "assets.ledger.kpi.accumulated": "累计折旧",
    "assets.ledger.kpi.accumulated.hint": "占购置成本 {{percent}}%",
    "assets.ledger.kpi.refresh": "待更新设备",
    "assets.ledger.kpi.refresh.hint": "已超过使用年限",
    "assets.ledger.series.cost": "购置成本",
    "assets.ledger.series.nbv": "账面净值",
    "assets.ledger.series.spend": "资本性支出",
    "assets.ledger.byCategory.title": "成本对比账面净值",
    "assets.ledger.byCategory.description": "各设备类别还剩多少价值。",
    "assets.ledger.byYear.title": "按年度资本性支出",
    "assets.ledger.byYear.description": "各年度购入设备的购置成本。",
    "assets.ledger.categoryTable.title": "分类台账",
    "assets.ledger.categoryTable.description": "各类别的折旧年限与剩余价值。",
    "assets.ledger.refresh.title": "待更新设备",
    "assets.ledger.refresh.description": "已超使用年限但仍在服役的设备。",
    "assets.ledger.refresh.empty": "没有设备超过使用年限。",
    "assets.ledger.headers.count": "数量",
    "assets.ledger.headers.life": "年限",
    "assets.ledger.headers.cost": "成本",
    "assets.ledger.headers.nbv": "账面净值",
    "assets.ledger.headers.overrun": "超期",
    "assets.ledger.empty.title": "台账中还没有资产",
    "assets.ledger.empty.description": "添加资产后即可查看账面价值与折旧。",
  },
};
