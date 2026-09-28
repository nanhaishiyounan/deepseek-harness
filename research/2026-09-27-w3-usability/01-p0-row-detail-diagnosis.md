# P0 取证报告：v2 flowPage 表格「点击详情无显示」根因诊断

- 日期：2026-09-27 · 任务：W3-P0 只读取证（零代码/schema/数据写入；API 侧仅 GET + POST /api/auth:signIn）
- 用户反馈原话：「表格里的主体，点击详情没有任何显示？？？？？」
- 证据：16 件原始 dump 与分析件全部落本目录（见 §7 索引）

## 0. 实例口径勘误（影响所有复现）

任务书标注 :3080 = NocoBase。实测 :3080 无 /api 路由（进程为 `dsh web --patch examples/kb-agent/cordis.patch.yml` 纯前端 patch 服务）；真实 NocoBase 为 **http://127.0.0.1:13000**（platform/nocobase tsx 进程，与根 .env `NOCOBASE_BASE_URL` 一致），admin@nocobase.com / admin123 有效。本报告全部 API 取证在 :13000 完成；用户在 dsh web(:13110)/mobile(:13000) 看到的业务界面即 :13000 的投影。

## 1. 根因结论（①+② 组合，③ 排除）

**① 缺详情视图（主因，75/80 页）+ ② 有但断链（1 表格页 + 2 看板页）；③ ACL 拒绝排除为主因。**

1. **统一工厂从设计上不产表格行详情。** 13 个 v2 工厂脚本（e1/f1/f2/f3/h4/h5/n13/n17/w1/w3/w5/w6/w7/w8/w9）同构复制 E1 表格模板：`TableBlockModel → TableColumnModel×N（列字段 props.clickToOpen:false）→ actions 仅 AddNewActionModel + RefreshActionModel`，从不生成 TableActionsColumnModel / ViewActionModel / 行级 popup。:13000 全库 3700 行 flowModels 实测：95 个表格块中 **94 块零行操作**；全库 ViewActionModel ×1、TableActionsColumnModel ×1、EditActionModel ×1、DeleteActionModel ×1，四者 uid 前缀（daad6/7f141/fba6b/38c85）不属于任何工厂批次——是「项目」页上批外手工补建的操作列。
2. **唯一有「操作」列的「项目」页在三层 wire 的第 2/3 层全断（②断链）。** ViewActionModel(7f14173465d) 的 `subModels` 为空对象——无 ChildPageModel page 子树、无 DetailsBlockModel、无字段绑定；`stepParams.popupSettings.openView` 仅 `{collectionName, dataSourceKey}`，缺 f1 在线 drawer 款的 `mode:'drawer' / pageModelClass:'ChildPageModel' / filterByTk`。点击「查看」打开空壳 drawer。这正是 f1 工厂源码注释记载并自修复过的已知机制（[nocobase-f1-view-v2.mts:567-573](../../../examples/kb-agent/scripts/nocobase-f1-view-v2.mts)：record-scoped drawer 走 FlowPage load-only path，客户端不合成默认页；无持久化 page 子树则 `findOne?subKey=page|grid` 204、无 `<collection>:get`、drawer 空白）。同列 EditActionModel(fba6b66f41f) 同构断链。
3. **看板变体同根因。** h4srm「整改跟踪」(h4srmcva4yz25hl7d2u) 与 w8qmc「处置看板」(w8qmcva4nv58a6srdf) 的 KanbanCardViewActionModel page 子树实测 **MISSING(204)**；n17f1「任务看板/任务日历」的 cardViewAction/eventViewAction 子树在线——f1 的 ensureCardDrawers 修复只扫自己批前缀 `n17f1`，h4/w8 批从未获得同等处理。
4. **ACL 排除为主因的证据。** member 角色策略仅 `view:own`（api-roles.json 原文，snippets 全 `!` 前缀）；实测 quality_lead（member，用户 id=16，凭证出自 nocobase-w3-procurement.mts）连全库唯一的 ViewActionModel 行都列不出（admin 1 行 vs member 0 行，api-tree-e1-project-member.json）。但 94/95 表格块对 admin 同样无入口、「项目」页对 admin 点开同样空壳——ACL 是修复落地时的第二道闸门，非本次主因。
5. **数据层排除。** hub_pj_projects total=21（首行 id=1「对俄出口合规体系搭建」）、hub_pj_tasks=20（「海外仓切换方案初稿」）、srm_suppliers=17（「珠海鲜丰水产科技有限公司」）——数据非空。附勘误：不存在 crm_suppliers 集合（404），供应商主体集合是 **srm_suppliers**。
6. **AddNew 弹窗（工作正常的 wire 参照）。** 81/81 个 AddNewActionModel 的 page 子树全部在线（含 77 表格级 + 4 看板/日历级，缺失 0）。其 openView 同样只有 `{collectionName, dataSourceKey}`，但工厂 save 时嵌套写入了 `subModels.page = ChildPageModel→tabs(Add new)→BlockGrid→CreateFormModel→FormGrid×N`——证明「openView 指针 + 持久化 page 子树」缺一不可：AddNew 两者皆有，ViewAction 只有指针。

## 2. 三层 wire 断点定位（「项目」页原文对照）

| 层 | AddNewActionModel（n17e1ani53mkmymyz，工作） | ViewActionModel（7f14173465d，断链） |
|---|---|---|
| ① action 节点 | 有（table actions，sortIndex 1） | 有（TableActionsColumnModel「操作」列内，link 型按钮） |
| ② popup 声明 | openView={collectionName,dataSourceKey}；**持久化 page 子树在库** | openView={collectionName,dataSourceKey}；**无 mode/pageModelClass/filterByTk，`subModels:{}`** |
| ③ 内容块 | ChildPageModel→tabs→BlockGrid→CreateFormModel→FormGrid×10 字段 | **无任何 DetailsBlock / read-pretty form / 字段绑定** |

ViewActionModel 库内原文（api-tree-e1-project.json:822-848 摘录）：

```json
{
  "uid": "7f14173465d",
  "use": "ViewActionModel",
  "parentId": "daad6b2c2d9",
  "subKey": "actions",
  "props": {},
  "stepParams": {
    "popupSettings": { "openView": { "collectionName": "hub_pj_projects", "dataSourceKey": "main" } },
    "buttonSettings": { "general": { "type": "link", "icon": null, "iconOnly": false } }
  },
  "subModels": {}
}
```

承载它的操作列节点（同文件 :799-818）：`TableActionsColumnModel` uid=daad6b2c2d9，props.title=「操作」，width=150，sortIndex=11，挂在 n17e1tbm7n1eyuuigg 表格的 columns 下；三个行操作 View/Edit/Delete 的 uid 前缀互不相同且均与 n17e1 批无关。

## 3. API 取证原文摘录

**全库 action 模型统计（flowModels:list 全量 3700 行，evidence-table-wire.md §c）：**

| use | count | uid 前缀分布 |
|---|---|---|
| RefreshActionModel | 98 | h4srm×8, h5wms×13, n17e1×3, n17f1×2, n17f2×5, n17f3×12, n17rf×8, w1w1r×2, w3pur×11, w5mfg×7, w6mfg×6, w7mrp×7, w8qmr×5, w9kpi×9 |
| AddNewActionModel | 81 | h4srm×8, h5wms×13, n17an×8, n17e1×3, n17f1×2, n17f2×5, n17f3×12, w1w1a×1, w3pur×9, w5mfg×6, w6mfg×4, w7mrp×5, w8qma×5 |
| FilterActionModel | 52 | h4srm×8, h5wms×13, n17f1×2, w3pur×9, w5mfg×6, w6mfg×4, w7mrp×5, w8qmf×5 |
| KanbanCardViewActionModel | 3 | h4srm×1, n17f1×1, w8qmc×1 |
| **DeleteActionModel** | **1** | **38c85×1** |
| **ViewActionModel** | **1** | **7f141×1** |
| **TableActionsColumnModel** | **1** | **daad6×1** |
| **EditActionModel** | **1** | **fba6b×1** |

**看板/日历 drawer 子树探针（GET /api/flowModels:findOne?parentId=\<uid\>&subKey=page，§d）：**

| use | uid | page 子树 |
|---|---|---|
| KanbanCardViewActionModel | h4srmcva4yz25hl7d2u | **MISSING (204)** |
| KanbanCardViewActionModel | n17f1cvafost1zyzyfp | present |
| CalendarEventViewActionModel | n17f1evabaj8kddu7w | present |
| KanbanCardViewActionModel | w8qmcva4nv58a6srdf | **MISSING (204)** |

**角色原文（api-roles.json）：** admin strategy `{actions:[create,view,update,destroy,export,importXlsx]}` + snippets `["pm","pm.*","ui.*"]`；member strategy `{actions:["view:own"]}` + snippets `["!pm","!pm.*","!ui.*"]`；root strategy null + pm/ui 全 snippets。member 视角对比（api-tree-e1-project-member.json）：`GET /api/flowModels:list?filter={"uid":"7f14173465d"}` → admin 命中 1 行、member 命中 0 行。

**数据层（api-data-samples.json）：** hub_pj_projects HTTP200 首行 {id:1, name:"对俄出口合规体系搭建", status:"in_progress"}；hub_pj_tasks 200 首行 {id:1, title:"海外仓切换方案初稿"}；srm_suppliers 200 首行 {id:1, name:"珠海鲜丰水产科技有限公司"}；crm_suppliers 404（集合不存在）。

**页面骨架健康度（evidence-table-wire.md）：** 80/80 页 flowPage→tabs→BlockGridModel 挂接完好；AddNew popup 子树 77/77 表格级全在线；另有 83 个无孩子、不被 tabs 引用的空壳 BlockGridModel 注册行与 213 个 RouteModel 注册行（工厂批注册残留，非用户可见异常）。

## 4. 受影响页面全集（80 flowPage 逐页）

路由全景：180 行 = 16 group + 82 tabs + **80 flowPage** + 2 v1 page（任务甘特 zs3oqvlgqq0、应用中心 c9c6wzppejk，GanttBlockProvider 无 v2 authoring surface 故甘特不迁移）。80 flowPage = 76 表格页（95 块）+ 3 看板-only + 1 日历-only。

现状代号：**A** 无行操作（缺详情视图）· **B** 有 view/edit 但空壳断链 · **C** 看板卡片 view 空壳 · **D** 行详情在线。末列标注行级子表 drill-down 业务需求（同页双表或跨页 m2o：订单行/BOM 行/检验项/计划行类）。

| 组 | 页面 | 批 | 主体集合 | 现状 | 子表详情需求 |
|---|---|---|---|---|---|
| （顶层） | AI 工作台 | n13ai | hub_tk_tickets（+AIChatBox） | A | - |
| （顶层） | 工作台 | n17f3 | hub_pj_tasks + hub_tk_tickets | A | 弱（两表同页） |
| CRM 客户 | 客户 | n17sy | crm_customers | A | - |
| CRM 客户 | 销售线索 | n17rw | crm_leads | A | - |
| CRM 客户 | 联系人 | n17c3 | crm_contacts | A | - |
| CRM 客户 | 产品与服务 | n17f2 | crm_products | A | - |
| CRM 客户 | 客户仪表盘 | n17f2 | crm_customers（+chart×2） | A | - |
| 人事管理 | 员工 | n17lh | hub_hr_employees | A | - |
| 人事管理 | 部门 | n17f3 | hub_hr_departments | A | -（v1 树形形态已在 v2 丢失） |
| 人事管理 | 请假审批 | n17f3 | hub_hr_leave_requests | A | - |
| 仓储管理 | 仓库库区 | h5wms | wms_zones | A | - |
| 仓储管理 | 库位平面图 | h5wms | wms_bins（+JSBlock） | A | - |
| 仓储管理 | 入库单 | h5wms | wms_receipts | A | 行明细（收货行） |
| 仓储管理 | 出库单 | h5wms | wms_shipments | A | 行明细（发货行） |
| 仓储管理 | 库存查询 | h5wms | wms_stock | A | - |
| 仓储管理 | 批次主数据 | h5wms | wms_lots | A | - |
| 仓储管理 | 盘点管理 | h5wms | wms_counts | A | 盘点行 |
| 仓储管理 | 移库管理 | h5wms | wms_transfers | A | - |
| 仓储管理 | 库存流水 | h5wms | wms_movements | A | - |
| 仓储管理 | 预留管理 | h5wms | wms_reservations | A | - |
| 仓储管理 | 补货预警 | h5wms | wms_reorder_suggestions | A | - |
| 仓储管理 | 盘点计划 | h5wms | hub_inv_products | A | - |
| 仓储管理 | 月度收发存 | h5wms | wms_monthly_balances | A | -（台账只读） |
| 供应链 | 供应商档案 | h4srm | srm_suppliers | A | 证照/审核/评分卡聚合视图 |
| 供应链 | 供应商准入 | h4srm | srm_suppliers | A | - |
| 供应链 | 证照效期预警 | h4srm | srm_certificates | A | - |
| 供应链 | 审核检查表 | h4srm | srm_audit_checklists | A | - |
| 供应链 | 审核评分录入 | h4srm | srm_audit_records | A | - |
| 供应链 | 绩效评分卡 | h4srm | srm_score_cards | A | - |
| 供应链 | 供应商绩效雷达 | h4srm | srm_score_cards（+chart×2） | A | - |
| 供应链 | 整改跟踪 | h4srm | srm_capas（kanban） | **C** | - |
| 协同办公 | 审批中心 | w1w16 | wfl_approval_todos + wfl_approval_records | A | 审批单据跳转（doc_type+doc_id） |
| 基础数据 | 分类维护 | n17f3 | hub_md_customer/asset/product/ticket_categories ×4 | A | - |
| 工单中心 | 工单 | n17et | hub_tk_tickets | A | - |
| 工单中心 | 知识文章 | n17f3 | hub_kb_articles | A | - |
| 生产制造 | BOM 管理 | w5mfg | mfg_boms + mfg_bom_lines | A | **BOM 行**（同页双表） |
| 生产制造 | BOM 工序 | w5mfg | mfg_bom_operations | A | 工序行 |
| 生产制造 | 工作中心 | w5mfg | mfg_work_centers + mfg_holidays | A | - |
| 生产制造 | 生产订单 | w5mfg | mfg_orders | A | MO 工序/领料（跨页） |
| 生产制造 | 排产看板 | w5mfg | mfg_order_operations（Refresh-only） | A | - |
| 生产制造 | 领料单 | w6mfg | mfg_material_issues | A | 领料行 |
| 生产制造 | 退料单 | w6mfg | mfg_material_returns | A | - |
| 生产制造 | 报工记录 | w6mfg | mfg_job_reports | A | - |
| 生产制造 | 完工单 | w6mfg | mfg_completions | A | - |
| 生产制造 | MO 执行视图 | w6mfg | mfg_orders + mfg_order_operations（Refresh-only） | A | - |
| 经营分析 | 经营看板 | w9kpi | kpi_snapshots（+chart×2，Refresh-only） | A | -（T+1 只读） |
| 经营分析 | 供应链看板 | w9kpi | kpi_snapshots（+chart×3，Refresh-only） | A | - |
| 经营分析 | 生产看板 | w9kpi | kpi_snapshots（+chart×2，Refresh-only） | A | - |
| 经营分析 | 库存看板 | w9kpi | kpi_snapshots + wms_lots（+chart×5，Refresh-only） | A | - |
| 经营分析 | 应收应付对账 | w9kpi | pur_invoices/pur_payments/so_orders/crm_payments（+chart×8，Refresh-only） | A | -（台账只读） |
| 质量管理 | 质检单 | w8qmj | qm_inspections | A | **检验读数**（跨页 inspection m2o） |
| 质量管理 | 检验读数 | w8qmg | qm_inspection_readings | A | -（已按质检单过滤入口缺） |
| 质量管理 | 处置看板 | w8qm4 | qm_nc_dispositions（kanban） | **C** | - |
| 质量管理 | AQL抽样方案 | w8qm1 | qm_aql_plans | A | - |
| 质量管理 | 季度绩效物化 | w8qm8 | srm_score_cards | A | - |
| 资产管理 | 资产台账 | n17wr | hub_as_assets | A | - |
| 资产管理 | 维保记录 | n17f3 | hub_as_maintenance | A | - |
| 资产管理 | 供应商 | n17f3 | hub_as_vendors | A | - |
| 采购 | 采购联系人（历史） | n17f3 | hub_po_suppliers | A | - |
| 采购管理 | 采购申请 | w3pur | pur_requests + pur_request_lines | A | **请购行**（同页双表） |
| 采购管理 | 询价管理 | w3pur | pur_rfqs + pur_rfq_suppliers | A | **报价行**（跨页 pur_quotes） |
| 采购管理 | 供应商报价 | w3pur | pur_quotes | A | - |
| 采购管理 | 比价表 | w3pur | pur_quotes ×2（Refresh-only） | A | - |
| 采购管理 | 采购订单 | w3pur | pur_orders + pur_order_lines | A | **订单行**（同页双表） |
| 采购管理 | 发票匹配 | w3pur | pur_invoices | A | 三方匹配明细 |
| 采购管理 | 付款申请 | w3pur | pur_payments | A | - |
| 销售流程 | 订单 | n17vu | crm_deals | A | - |
| 销售流程 | 报价单 | n17v6 | crm_quotes | A | - |
| 销售流程 | 回款 | n17f2 | crm_payments | A | - |
| 销售流程 | 发票 | n17f2 | crm_invoices | A | - |
| 销售流程 | 销售仪表盘 | n17f2 | crm_payments（+chart×2） | A | - |
| 销售管理 | 销售订单 | w7mrp | so_orders + so_order_lines | A | **订单行**（同页双表） |
| 销售管理 | 计划工作台 | w7mrp | mrp_suggestions + mrp_confirm_intents | A | - |
| 销售管理 | MRP 快照 | w7mrp | mrp_snapshots（Refresh-only） | A | - |
| 销售管理 | 主生产计划 | w7mrp | mps_plans + mps_plan_items | A | **计划行**（同页双表） |
| 项目管理 | 项目 | n17e1 | hub_pj_projects | **B** | - |
| 项目管理 | 任务列表 | n17e1 | hub_pj_tasks | A | - |
| 项目管理 | 里程碑 | n17e1 | hub_pj_milestones | A | - |
| 项目管理 | 任务看板 | n17f1 | hub_pj_tasks（kanban） | D | - |
| 项目管理 | 任务日历 | n17f1 | hub_pj_tasks（calendar） | D | - |

**受影响合计 78/80 页**（A 75 + B 1 + C 2）；行详情在线 2 页（n17f1 看板/日历）。

## 5. 修复面预估：统一工厂扩展（明确优于逐页补）

- **推荐路径：共享库一处扩展 + 各工厂一行调用 + 一次性幂等 heal。** 13 个工厂脚本的表格构造是同构复制（E1 模板 [nocobase-e1-pj-v2.mts:406-463](../../../examples/kb-agent/scripts/nocobase-e1-pj-v2.mts) 在 f2/f3/h4/h5/n13/n17/w1/w3/w5/w6/w7/w8/w9 逐处重复），共享库 [nocobase-flow-page-lib.mts](../../../examples/kb-agent/scripts/nocobase-flow-page-lib.mts) 已是现成归宿。新增 `ensureTableRowDetail(token, tableUid, collection, fields)`：TableActionsColumnModel 列 + ViewActionModel（openView 按 f1 款补全 mode/pageModelClass/filterByTk）+ 持久化 page 子树（复用 §6 模板）；再以 f1 `ensureCardDrawers` 的幂等模式（存在即跳过）对 95 块做一次 heal，顺带扩前缀修复 h4srm/w8qmc 两个看板 drawer 与「项目」页 View/Edit 断链。改动面 ≈ lib +2 函数 + 13 脚本各 1 处调用 + 1 个 heal 入口；字段清单各页已有（columns/formFields 即详情字段源）。
- **逐页补**：80 页 × 手工，必然漂移，不推荐。
- **通道选择的既有事实**：flowSurfaces authoring 通道建表格时会自动补操作列与默认 View/Edit/Delete 行操作（[service.ts:10205 ensureTableActionsColumn](../../../platform/nocobase/packages/plugins/@nocobase/plugin-flow-engine/src/server/flow-surfaces/service.ts)、[service.ts:10382 ensureTableDefaultActionIntegrity](../../../platform/nocobase/packages/plugins/@nocobase/plugin-flow-engine/src/server/flow-surfaces/service.ts)）；工厂走的 `/api/flowModels:save` 逐节点通道不触发它们。统一工厂自带三件（列 + view action + page 子树）与迁移到 authoring 通道二选一，前者改动面小且与现有 13 脚本兼容。
- **ACL 配套**：member 现为 `view:own`，修复后行详情对 member 仍不可见（api-tree-e1-project-member.json 实证 0 行）；上线需同步给业务角色配 `view`（或按集合授权），否则「修了 admin、member 仍无显示」会复发同款反馈。
- **子表 drill-down（第二期）**：§4 标注的同页双表/跨页 m2o 页（订单行/BOM 行/请购行/计划行/检验读数/审批单据跳转）建议单独批次：主表 View drawer 内嵌关联 TableBlock（association resource + filterByTk 绑定），不是本 P0 的直接修复面。

## 6. v1 可复用模板结论

- **v1 存档无可复用行详情 schema。** research/f-round-inventory/v1-pages/ 16 页（9/13 快照）逐页检索 `x-action`：仅 create/submit 两类节点（供应商.json:57 create、:354 submit），无一行 view/detail、无操作列——v1 时代同样没有行详情能力。
- **可复用模板在 v2 侧现成存在且生产实证：** [nocobase-f1-view-v2.mts:509-565 drawerPageTree()](../../../examples/kb-agent/scripts/nocobase-f1-view-v2.mts) = ChildPageModel → ChildPageTabModel（tab 标题「任务详情」）→ BlockGridModel → DetailsBlockModel（vertical + colon）→ DetailsGridModel（layout rows 绑定 item uid）→ DetailsItemModel×N（fieldSettings.fieldPath + Display*FieldModel 双写 fieldSettings）；配 openView `{mode:'drawer', size:'medium', pageModelClass:'ChildPageModel', filterByTk:'{{ctx.record.id}}'}`。n17f1 看板/日历 drawer 在线（§3 探针 present）即该模板的生产验证。
- 表格行相对 f1 需新增两件：TableActionsColumnModel 列节点（「项目」页 daad6b2c2d9 的形状可作参照：props.title/width/sortIndex + tableColumnSettings.title）与 ViewActionModel 行操作（openView 必须按 f1 款补全，勿复制 7f141 的残缺形态）。
- **v1→v2 三类特殊页迁移盘点：** 任务甘特仍 v1（plugin-gantt 无 flow-engine authoring surface，F1 文档明载边界，待上游支持）；任务日历已 v2 化且 drawer 在线（并恢复 plan_end 为 end 字段语义）；部门页 v2 化为普通表格（hub_hr_departments）——v1 树形块形态在 v2 无对应模型，丢失的是树形展开形态而非行详情。

## 7. 证据文件索引（本目录）

| 文件 | 内容 |
|---|---|
| api-desktopRoutes.json | GET /api/desktopRoutes:list 全量 180 行原文 |
| api-flowModels-flat.json | GET /api/flowModels:list 全量 3700 行原文（分页拉全，无截断） |
| routes-compact.md | 80 flowPage 紧凑清单（id/title/schemaUid/批前缀/父组链） |
| evidence-table-wire.md | 逐页×逐块 wire 状态表（99 行）+ 全库 action 统计 + drawer 探针 |
| api-tree-e1-project.json | 「项目」页 TableBlock 整树（含操作列与三行操作原文，:822 ViewAction） |
| api-tree-supplier.json | 「供应商档案」页表格整树（无操作列对照） |
| api-tree-f3-workbench.json | 「工作台」复合页表格整树 |
| api-tree-e1-project-member.json | member(quality_lead) vs admin 对 ViewActionModel 行可见性对比 |
| api-roles.json / api-users.json | 角色策略原文 / 用户-角色清单 |
| api-data-samples.json | 三集合数据层非空实证 + crm_suppliers 404 勘误 |
| api-trees-summary.md | 三树取证要点摘要 |
| .fetch-core.mjs / .analyze.mjs / .trees.mjs / .data-acl.mjs | 一次性取证脚本（可复跑） |

（同目录 02-capability-inventory.md 为并行任务产物，与本报告无涉。）
