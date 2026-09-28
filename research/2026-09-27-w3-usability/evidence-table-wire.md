# evidence-table-wire — flowPage → grid → blocks wiring (P0 forensics)

- base: http://127.0.0.1:13000 (see .fetch-core.mjs header note: :3080 has no /api; real server is :13000)
- flowPages: 80; flowModel rows: 3700; TableBlockModel rows: 95
- wiring: desktopRoutes(flowPage).id → tabs route (type=tabs) → tabs.schemaUid == BlockGridModel.parentId (verified for 80/80 pages)

## (a) hierarchy rule

`flowPage route --(route.parentId=id)--> tabs route --(flowModel.parentId = tabs.schemaUid)--> BlockGridModel --(subKey=items)--> Table/Kanban/Calendar/Chart blocks --(subKey=columns/actions)--> columns & actions`

## (b) per-page wiring (99 rows)

| page | collection | block (Table unless noted) | actionsCol? | actions uses | view/edit/delete actions | addNew | addNew popup subtree |
|---|---|---|---|---|---|---|---|
| AI 工作台 [n13ai] | hub_tk_tickets | +AIChatBoxBlockModel | no | (none) | no | no | n/a |
| 工作台 [n17f3] | hub_pj_tasks | table | no | AddNewActionModel, RefreshActionModel | no | n17f3an9s341plk72g | n17f3an9s341plk72g:MISSING |
| 工作台 [n17f3] | hub_tk_tickets | table | no | AddNewActionModel, RefreshActionModel | no | n17f3anq7z3u29p6we | n17f3anq7z3u29p6we:MISSING |
| 客户 [n17sy] | crm_customers | table | no | AddNewActionModel, RefreshActionModel | no | n17an3pzasuzakqa | n17an3pzasuzakqa:yes |
| 销售线索 [n17rw] | crm_leads | table | no | AddNewActionModel, RefreshActionModel | no | n17an0vjd9gwrc3c | n17an0vjd9gwrc3c:yes |
| 联系人 [n17c3] | crm_contacts | table | no | AddNewActionModel, RefreshActionModel | no | n17anojyqup3vyyq | n17anojyqup3vyyq:yes |
| 产品与服务 [n17f2] | crm_products | table | no | AddNewActionModel, RefreshActionModel | no | n17f2any9wml50p429 | n17f2any9wml50p429:yes |
| 客户仪表盘 [n17f2] | crm_customers | +ChartBlockModel,ChartBlockModel | no | AddNewActionModel, RefreshActionModel | no | n17f2anep0n4jjhvpr | n17f2anep0n4jjhvpr:yes |
| 员工 [n17lh] | hub_hr_employees | table | no | AddNewActionModel, RefreshActionModel | no | n17an3rxdfkv2dcg | n17an3rxdfkv2dcg:yes |
| 部门 [n17f3] | hub_hr_departments | table | no | AddNewActionModel, RefreshActionModel | no | n17f3anoj2jxjch5ma | n17f3anoj2jxjch5ma:yes |
| 请假审批 [n17f3] | hub_hr_leave_requests | table | no | AddNewActionModel, RefreshActionModel | no | n17f3ani3k95f9gmm | n17f3ani3k95f9gmm:yes |
| 仓库库区 [h5wms] | wms_zones | table | no | AddNewActionModel, FilterActionModel, RefreshActionModel | no | h5wmsankwlb2cxkok | h5wmsankwlb2cxkok:yes |
| 库位平面图 [h5wms] | wms_bins | +JSBlockModel | no | AddNewActionModel, FilterActionModel, RefreshActionModel | no | h5wmsanf3tm4i19t8l | h5wmsanf3tm4i19t8l:yes |
| 入库单 [h5wms] | wms_receipts | table | no | AddNewActionModel, FilterActionModel, RefreshActionModel | no | h5wmsanuo45e4ia95l | h5wmsanuo45e4ia95l:yes |
| 出库单 [h5wms] | wms_shipments | table | no | AddNewActionModel, FilterActionModel, RefreshActionModel | no | h5wmsansgulxh0mx8k | h5wmsansgulxh0mx8k:yes |
| 库存查询 [h5wms] | wms_stock | table | no | AddNewActionModel, FilterActionModel, RefreshActionModel | no | h5wmsantf18iphhusc | h5wmsantf18iphhusc:yes |
| 批次主数据 [h5wms] | wms_lots | table | no | AddNewActionModel, FilterActionModel, RefreshActionModel | no | h5wmsanesraowl27ps | h5wmsanesraowl27ps:yes |
| 盘点管理 [h5wms] | wms_counts | table | no | AddNewActionModel, FilterActionModel, RefreshActionModel | no | h5wmsanzseh7ql4nva | h5wmsanzseh7ql4nva:yes |
| 移库管理 [h5wms] | wms_transfers | table | no | AddNewActionModel, FilterActionModel, RefreshActionModel | no | h5wmsanjlgxkuyd9ig | h5wmsanjlgxkuyd9ig:yes |
| 库存流水 [h5wms] | wms_movements | table | no | AddNewActionModel, FilterActionModel, RefreshActionModel | no | h5wmsank9vkuuerrhk | h5wmsank9vkuuerrhk:yes |
| 预留管理 [h5wms] | wms_reservations | table | no | AddNewActionModel, FilterActionModel, RefreshActionModel | no | h5wmsanj1oqa3l4v79 | h5wmsanj1oqa3l4v79:yes |
| 补货预警 [h5wms] | wms_reorder_suggestions | table | no | AddNewActionModel, FilterActionModel, RefreshActionModel | no | h5wmsanvx1uu2k2u8o | h5wmsanvx1uu2k2u8o:yes |
| 盘点计划 [h5wms] | hub_inv_products | table | no | AddNewActionModel, FilterActionModel, RefreshActionModel | no | h5wmsanuh3yedbbmx | h5wmsanuh3yedbbmx:yes |
| 月度收发存 [h5wms] | wms_monthly_balances | table | no | AddNewActionModel, FilterActionModel, RefreshActionModel | no | h5wmsanilfvjofakh | h5wmsanilfvjofakh:yes |
| 供应商档案 [h4srm] | srm_suppliers | table | no | AddNewActionModel, FilterActionModel, RefreshActionModel | no | h4srmaniywwlmn0k1s | h4srmaniywwlmn0k1s:yes |
| 供应商准入 [h4srm] | srm_suppliers | table | no | AddNewActionModel, FilterActionModel, RefreshActionModel | no | h4srmanhvf1jejs0ot | h4srmanhvf1jejs0ot:yes |
| 证照效期预警 [h4srm] | srm_certificates | table | no | AddNewActionModel, FilterActionModel, RefreshActionModel | no | h4srman9m0txvlhcu4 | h4srman9m0txvlhcu4:yes |
| 审核检查表 [h4srm] | srm_audit_checklists | table | no | AddNewActionModel, FilterActionModel, RefreshActionModel | no | h4srmano8tfhm0royc | h4srmano8tfhm0royc:yes |
| 审核评分录入 [h4srm] | srm_audit_records | table | no | AddNewActionModel, FilterActionModel, RefreshActionModel | no | h4srman5vb0dnbcvku | h4srman5vb0dnbcvku:yes |
| 绩效评分卡 [h4srm] | srm_score_cards | table | no | AddNewActionModel, FilterActionModel, RefreshActionModel | no | h4srmanc79hvgddagj | h4srmanc79hvgddagj:yes |
| 供应商绩效雷达 [h4srm] | srm_score_cards | +ChartBlockModel,ChartBlockModel | no | AddNewActionModel, FilterActionModel, RefreshActionModel | no | h4srman6eig273ze4o | h4srman6eig273ze4o:yes |
| 整改跟踪 [h4srm] | (no table block) | +KanbanBlockModel(srm_capas) | n/a | n/a | n/a | n/a | n/a |
| 审批中心 [w1w16] | wfl_approval_todos | table | no | AddNewActionModel, RefreshActionModel | no | w1w1anrvhb71zfomo | w1w1anrvhb71zfomo:yes |
| 审批中心 [w1w16] | wfl_approval_records | table | no | RefreshActionModel | no | no | n/a |
| 分类维护 [n17f3] | hub_md_customer_categories | table | no | AddNewActionModel, RefreshActionModel | no | n17f3anzx7tv3imd8a | n17f3anzx7tv3imd8a:yes |
| 分类维护 [n17f3] | hub_md_asset_categories | table | no | AddNewActionModel, RefreshActionModel | no | n17f3anfx4giw0zvht | n17f3anfx4giw0zvht:yes |
| 分类维护 [n17f3] | hub_md_product_categories | table | no | AddNewActionModel, RefreshActionModel | no | n17f3an180evmqergn | n17f3an180evmqergn:yes |
| 分类维护 [n17f3] | hub_md_ticket_categories | table | no | AddNewActionModel, RefreshActionModel | no | n17f3ante3i99jv8l | n17f3ante3i99jv8l:yes |
| 工单 [n17et] | hub_tk_tickets | table | no | AddNewActionModel, RefreshActionModel | no | n17anciuiqjj5z | n17anciuiqjj5z:yes |
| 知识文章 [n17f3] | hub_kb_articles | table | no | AddNewActionModel, RefreshActionModel | no | n17f3an2ewqr90vkzt | n17f3an2ewqr90vkzt:yes |
| BOM 管理 [w5mfg] | mfg_boms | table | no | AddNewActionModel, FilterActionModel, RefreshActionModel | no | w5mfgantqwfokipv4 | w5mfgantqwfokipv4:yes |
| BOM 管理 [w5mfg] | mfg_bom_lines | table | no | AddNewActionModel, FilterActionModel, RefreshActionModel | no | w5mfganpzbqz1ervde | w5mfganpzbqz1ervde:yes |
| BOM 工序 [w5mfg] | mfg_bom_operations | table | no | AddNewActionModel, FilterActionModel, RefreshActionModel | no | w5mfgan0m8lfl8iujy | w5mfgan0m8lfl8iujy:yes |
| 工作中心 [w5mfg] | mfg_holidays | table | no | AddNewActionModel, FilterActionModel, RefreshActionModel | no | w5mfganvykd4h3spka | w5mfganvykd4h3spka:yes |
| 工作中心 [w5mfg] | mfg_work_centers | table | no | AddNewActionModel, FilterActionModel, RefreshActionModel | no | w5mfganidqf9nimfei | w5mfganidqf9nimfei:yes |
| 生产订单 [w5mfg] | mfg_orders | table | no | AddNewActionModel, FilterActionModel, RefreshActionModel | no | w5mfganoj5jemtnds | w5mfganoj5jemtnds:yes |
| 排产看板 [w5mfg] | mfg_order_operations | table | no | RefreshActionModel | no | no | n/a |
| 领料单 [w6mfg] | mfg_material_issues | table | no | AddNewActionModel, FilterActionModel, RefreshActionModel | no | w6mfgan1e3sm8frmnu | w6mfgan1e3sm8frmnu:yes |
| 退料单 [w6mfg] | mfg_material_returns | table | no | AddNewActionModel, FilterActionModel, RefreshActionModel | no | w6mfgan3p4pkan5aoa | w6mfgan3p4pkan5aoa:yes |
| 报工记录 [w6mfg] | mfg_job_reports | table | no | AddNewActionModel, FilterActionModel, RefreshActionModel | no | w6mfgan1ihsz0r8x9i | w6mfgan1ihsz0r8x9i:yes |
| 完工单 [w6mfg] | mfg_completions | table | no | AddNewActionModel, FilterActionModel, RefreshActionModel | no | w6mfganwa0ve4kf8vr | w6mfganwa0ve4kf8vr:yes |
| MO 执行视图 [w6mfg] | mfg_orders | table | no | RefreshActionModel | no | no | n/a |
| MO 执行视图 [w6mfg] | mfg_order_operations | table | no | RefreshActionModel | no | no | n/a |
| 经营看板 [w9kpi] | kpi_snapshots | +ChartBlockModel,ChartBlockModel | no | RefreshActionModel | no | no | n/a |
| 供应链看板 [w9kpi] | kpi_snapshots | +ChartBlockModel,ChartBlockModel,ChartBlockModel | no | RefreshActionModel | no | no | n/a |
| 生产看板 [w9kpi] | kpi_snapshots | +ChartBlockModel,ChartBlockModel | no | RefreshActionModel | no | no | n/a |
| 库存看板 [w9kpi] | kpi_snapshots | +ChartBlockModel,ChartBlockModel,ChartBlockModel | no | RefreshActionModel | no | no | n/a |
| 库存看板 [w9kpi] | wms_lots | +ChartBlockModel,ChartBlockModel,ChartBlockModel | no | RefreshActionModel | no | no | n/a |
| 应收应付对账 [w9kpi] | pur_invoices | +ChartBlockModel,ChartBlockModel | no | RefreshActionModel | no | no | n/a |
| 应收应付对账 [w9kpi] | pur_payments | +ChartBlockModel,ChartBlockModel | no | RefreshActionModel | no | no | n/a |
| 应收应付对账 [w9kpi] | so_orders | +ChartBlockModel,ChartBlockModel | no | RefreshActionModel | no | no | n/a |
| 应收应付对账 [w9kpi] | crm_payments | +ChartBlockModel,ChartBlockModel | no | RefreshActionModel | no | no | n/a |
| 质检单 [w8qmj] | qm_inspections | table | no | AddNewActionModel, FilterActionModel, RefreshActionModel | no | w8qmano8cn79m2qdg | w8qmano8cn79m2qdg:yes |
| 检验读数 [w8qmg] | qm_inspection_readings | table | no | AddNewActionModel, FilterActionModel, RefreshActionModel | no | w8qman9xl589zi3de | w8qman9xl589zi3de:yes |
| 处置看板 [w8qm4] | (no table block) | +KanbanBlockModel(qm_nc_dispositions) | n/a | n/a | n/a | n/a | n/a |
| AQL抽样方案 [w8qm1] | qm_aql_plans | table | no | AddNewActionModel, FilterActionModel, RefreshActionModel | no | w8qmanewad7smls1f | w8qmanewad7smls1f:yes |
| 季度绩效物化 [w8qm8] | srm_score_cards | table | no | AddNewActionModel, FilterActionModel, RefreshActionModel | no | w8qmanfaibeuap61g | w8qmanfaibeuap61g:yes |
| 资产台账 [n17wr] | hub_as_assets | table | no | AddNewActionModel, RefreshActionModel | no | n17an3n7pyb0h14s | n17an3n7pyb0h14s:yes |
| 维保记录 [n17f3] | hub_as_maintenance | table | no | AddNewActionModel, RefreshActionModel | no | n17f3angt3kl86d78 | n17f3angt3kl86d78:yes |
| 供应商 [n17f3] | hub_as_vendors | table | no | AddNewActionModel, RefreshActionModel | no | n17f3ant0f919x4g5 | n17f3ant0f919x4g5:yes |
| 采购联系人（历史） [n17f3] | hub_po_suppliers | table | no | AddNewActionModel, RefreshActionModel | no | n17f3anbi2us8re4au | n17f3anbi2us8re4au:MISSING |
| 采购申请 [w3pur] | pur_request_lines | table | no | AddNewActionModel, FilterActionModel, RefreshActionModel | no | w3puranqszms4p4i3a | w3puranqszms4p4i3a:yes |
| 采购申请 [w3pur] | pur_requests | table | no | AddNewActionModel, FilterActionModel, RefreshActionModel | no | w3purannmd3quuhtgc | w3purannmd3quuhtgc:yes |
| 询价管理 [w3pur] | pur_rfq_suppliers | table | no | AddNewActionModel, FilterActionModel, RefreshActionModel | no | w3puranoxm7hwf7rzs | w3puranoxm7hwf7rzs:yes |
| 询价管理 [w3pur] | pur_rfqs | table | no | AddNewActionModel, FilterActionModel, RefreshActionModel | no | w3puranwnyfemmlni | w3puranwnyfemmlni:yes |
| 供应商报价 [w3pur] | pur_quotes | table | no | AddNewActionModel, FilterActionModel, RefreshActionModel | no | w3puranyvfij6pxkcl | w3puranyvfij6pxkcl:yes |
| 比价表 [w3pur] | pur_quotes | table | no | RefreshActionModel | no | no | n/a |
| 比价表 [w3pur] | pur_quotes | table | no | RefreshActionModel | no | no | n/a |
| 采购订单 [w3pur] | pur_order_lines | table | no | AddNewActionModel, FilterActionModel, RefreshActionModel | no | w3purany1ntk9n5sv | w3purany1ntk9n5sv:yes |
| 采购订单 [w3pur] | pur_orders | table | no | AddNewActionModel, FilterActionModel, RefreshActionModel | no | w3purannmgyfkav94g | w3purannmgyfkav94g:yes |
| 发票匹配 [w3pur] | pur_invoices | table | no | AddNewActionModel, FilterActionModel, RefreshActionModel | no | w3puranyie5vx5fdqj | w3puranyie5vx5fdqj:yes |
| 付款申请 [w3pur] | pur_payments | table | no | AddNewActionModel, FilterActionModel, RefreshActionModel | no | w3purannr21u7o4o4f | w3purannr21u7o4o4f:yes |
| 订单 [n17vu] | crm_deals | table | no | AddNewActionModel, RefreshActionModel | no | n17angirk9efi9st | n17angirk9efi9st:yes |
| 报价单 [n17v6] | crm_quotes | table | no | AddNewActionModel, RefreshActionModel | no | n17anpa81ofl9ky | n17anpa81ofl9ky:yes |
| 回款 [n17f2] | crm_payments | table | no | AddNewActionModel, RefreshActionModel | no | n17f2anu3z85dfiwbd | n17f2anu3z85dfiwbd:yes |
| 发票 [n17f2] | crm_invoices | table | no | AddNewActionModel, RefreshActionModel | no | n17f2ansz8tj2hewsl | n17f2ansz8tj2hewsl:yes |
| 销售仪表盘 [n17f2] | crm_payments | +ChartBlockModel,ChartBlockModel | no | AddNewActionModel, RefreshActionModel | no | n17f2anod025zh4lfg | n17f2anod025zh4lfg:yes |
| 销售订单 [w7mrp] | so_order_lines | table | no | AddNewActionModel, FilterActionModel, RefreshActionModel | no | w7mrpan9hrf1rgxmq | w7mrpan9hrf1rgxmq:yes |
| 销售订单 [w7mrp] | so_orders | table | no | AddNewActionModel, FilterActionModel, RefreshActionModel | no | w7mrpan2ueqyv2j7s2 | w7mrpan2ueqyv2j7s2:yes |
| 计划工作台 [w7mrp] | mrp_confirm_intents | table | no | AddNewActionModel, FilterActionModel, RefreshActionModel | no | w7mrpani3k2y3m6mr | w7mrpani3k2y3m6mr:yes |
| 计划工作台 [w7mrp] | mrp_suggestions | table | no | RefreshActionModel | no | no | n/a |
| MRP 快照 [w7mrp] | mrp_snapshots | table | no | RefreshActionModel | no | no | n/a |
| 主生产计划 [w7mrp] | mps_plan_items | table | no | AddNewActionModel, FilterActionModel, RefreshActionModel | no | w7mrpanimjbk9w4j4k | w7mrpanimjbk9w4j4k:yes |
| 主生产计划 [w7mrp] | mps_plans | table | no | AddNewActionModel, FilterActionModel, RefreshActionModel | no | w7mrpany6gnfxt8c3 | w7mrpany6gnfxt8c3:yes |
| 项目 [n17e1] | hub_pj_projects | table | yes | AIEmployeeButtonModel, AddNewActionModel, RefreshActionModel | DeleteActionModel, ViewActionModel, EditActionModel | n17e1ani53mkmymyz | n17e1ani53mkmymyz:yes |
| 任务列表 [n17e1] | hub_pj_tasks | table | no | AddNewActionModel, RefreshActionModel | no | n17e1anmk4eno0l2r | n17e1anmk4eno0l2r:yes |
| 里程碑 [n17e1] | hub_pj_milestones | table | no | AddNewActionModel, RefreshActionModel | no | n17e1anowt4ms96bm | n17e1anowt4ms96bm:yes |
| 任务看板 [n17f1] | (no table block) | +KanbanBlockModel(hub_pj_tasks) | n/a | n/a | n/a | n/a | n/a |
| 任务日历 [n17f1] | (no table block) | +CalendarBlockModel(hub_pj_tasks) | n/a | n/a | n/a | n/a | n/a |

AddNew popup subtrees: present=74, missing=3

## (c) global action-model stats (all 3700 flowModel rows)

| use | count | uid prefixes |
|---|---|---|
| RefreshActionModel | 98 | h4srm×8, h5wms×13, n17e1×3, n17f1×2, n17f2×5, n17f3×12, n17rf×8, w1w1r×2, w3pur×11, w5mfg×7, w6mfg×6, w7mrp×7, w8qmr×5, w9kpi×9 |
| AddNewActionModel | 81 | h4srm×8, h5wms×13, n17an×8, n17e1×3, n17f1×2, n17f2×5, n17f3×12, w1w1a×1, w3pur×9, w5mfg×6, w6mfg×4, w7mrp×5, w8qma×5 |
| FormSubmitActionModel | 68 | n17sb×22, submi×46 |
| FilterActionModel | 52 | h4srm×8, h5wms×13, n17f1×2, w3pur×9, w5mfg×6, w6mfg×4, w7mrp×5, w8qmf×5 |
| KanbanCardViewActionModel | 3 | h4srm×1, n17f1×1, w8qmc×1 |
| KanbanQuickCreateActionModel | 3 | h4srm×1, n17f1×1, w8qmq×1 |
| DeleteActionModel | 1 | 38c85×1 |
| ViewActionModel | 1 | 7f141×1 |
| TableActionsColumnModel | 1 | daad6×1 |
| EditActionModel | 1 | fba6b×1 |
| CalendarNavActionModel | 1 | n17f1×1 |
| CalendarViewSelectActionModel | 1 | n17f1×1 |
| CalendarEventViewActionModel | 1 | n17f1×1 |
| CalendarQuickCreateActionModel | 1 | n17f1×1 |

## (d) kanban/calendar drawer subtree probes (f1 fix online?)

| use | uid | prefix | page subtree |
|---|---|---|---|
| KanbanCardViewActionModel | h4srmcva4yz25hl7d2u | h4srm | present |
| KanbanCardViewActionModel | n17f1cvafost1zyzyfp | n17f1 | present |
| CalendarEventViewActionModel | n17f1evabaj8kddu7w | n17f1 | present |
| KanbanCardViewActionModel | w8qmcva4nv58a6srdf | w8qmc | present |

## page-type summary

- flowPages: 80; with ≥1 TableBlockModel: 76; kanban-only: 3; calendar-only: 1; other/no-block: 0
- table block rows: 95 across 76 pages; kanban blocks: 3; calendar blocks: 1
- table rows WITH TableActionsColumnModel or row-level view/edit/delete action: 1 (expected 0)
- shell BlockGridModel registration rows (no children, unreferenced): 83; RouteModel registration rows: 213
