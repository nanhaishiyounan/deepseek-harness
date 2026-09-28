# Agent Note: W3-B3 只读多视图——状态看板、排产甘特 v1 与双块日历

Status: implemented

[English](2026-09-27-w3-b3-readonly-multiview.md) | 中文

## 问题

用户反馈 #1（「都是表格+表单，不是人能用的」）要求给核心对象补业界实证的视图形态：引擎管辖单据（PO/MO/SO/质检单）各一张状态看板、MO 工序排产甘特、计划/交期日历。本批核心风险（PLAN §6 D4/D5）：NocoBase 看板拖拽经 `collection:move` 直写分组字段——绕过 wfl 审批锚点、FCS 排产权与质检 single-shot 门禁；甘特唯一的编程通道是 v1 uiSchemas（plugin-gantt 不在 flow-engine 的 v2 authoring 白名单）。

## 决策

- **引擎管辖看板一律只读构造（D4）。** 四张看板（`nocobase-w3-views.mts`，w3b3 前缀 uid）带 `dragEnabled:false`、无 `sort` 字段、无 Add-new、无快速新建——看板定位 = 状态总览 + B1 形态 drawer；状态推进只走引擎动词（审批中心/操作者终端/链路脚本）。verify 门禁断言四集合上的每张看板（任意 uid 前缀）dragEnabled false、拒绝 w3b3 看板下的创建类动作、并对每集合探测 `:move` 被拒（无 sort 列 ⇒ 无服务端动作）。自由态看板（srm_capas / qm_nc_dispositions）保持 `dragEnabled:true`——作为回归守卫断言。
- **排产甘特走官方 v1 通道、只读（D5）。** `nocobase-hub-modules.mts` 的 `ganttBlock` 参数化导出；排产甘特 v1 页（desktopRoutes `page` + uiSchemas Page→Grid，hub ensureMenus 形态含 tabs 子行）挂 `GanttBlockProvider`，集合 `mfg_order_operations`，fieldNames `{start:'planned_date', end:'planned_date', title:'name', range:'day'}`（单日条——集合只有计划日期无区间），`enableDragToReschedule:false`——FCS 保持唯一排产权。不自建 SVG。hub 任务甘特页保持缺省（可拖）——opts 缺省对既有调用方零影响。
- **日历 = 每源集合一个 CalendarBlockModel，页内堆叠（固定高 520）。** `init.filter` 不是 flow-engine catalog 的白名单键，交期日历因此展示全部带日期的 SO（need_date）与 PO（need_date）而非仅未完成；未完成子集在 psql 证据中断言（取证时点 PO 未收 8、SO 未发 6）而非 UI 过滤。计划日历挂 `mps_plans`（period_from→period_to——`mps_plan_items` 无日期列，只有 'YYYY-MM' 时段串）加 `mrp_suggestions`（suggest_date→need_date，标题 plan_type）。事件点开走 B1 drawer（事件动作 openView 带 filterByTk）。
- **MO 看板 drawer 内嵌工序子表**（计划员旅程锚点）：`mfg_orders.order_operations` hasMany 经 `ensureParentHasMany` 注册，列 seq/name/workcenter/planned_date/planned_min/status。
- **drawer 记录定界是必备 wire 键——本批实锤并修复的 B1 缺陷。** W3-B3 之前构建的每个持久化 drawer 都渲染集合首条记录：`DetailsBlockModel.createResource` 在块 `resourceSettings.init` 缺 `filterByTk` 键时构造 MultiRecordResource（pageSize 1，drawer 上出现 1/N 分页）——`drawerPageTreeFor` 从未携带它。修复 = 共享库（及 f1 本地副本）的 DetailsBlock init 增 `filterByTk:'{{ctx.view.inputArgs.filterByTk}}'`；`w3-heal-row-details.mts` 增 `rescopeDrawers` 段，在 wire 计划前按旧树自身的字段清单（及其子表规格——从旧树提取，B2 子表无损）重建每个未定界 drawer；B2 子表保留判定同时要求 Details 已定界。实跑重建 88 个 drawer；该段幂等（`all 123 drawer(s) already scoped`）。verify 现在对任何 DetailsBlock init 缺键的 drawer 判 FAIL。
- **rollback 按所有权销毁而非按标题。** 首建把 MO 看板命名为「生产看板」——与 B9 经营分析同名 KPI 仪表盘撞名；`--rollback` 按标题匹配级联删掉了 B9 页面及其两张图（verify 抓到：kpi 图 9 < 11）。看板更名「生产订单看板」，rollback 现要求路由 schemaUid 带 w3b3 前缀（v1 `page` 行按类型豁免——甘特页 schemaUid 为服务端生成）。

## 证据

- `research/2026-09-27-w3-usability/w3-b3-psql.txt` — 所有 UI 计数的 psql 孪生：看板列分布、按日甘特条（26×3 / 28×4 / 29×1 / 30×2 = 10）、MO-2026-0002 FCS 一致性行、日历事件数含未完成子集。
- `w3-b3-assert.txt` — 脚本自带门禁：list API 列分布、分组值域外拒绝、四集合 `:move` 全拒、甘特数据源（10 行）、日历事件数（SO 8 / PO 10 / MPS 1 / MRP 34）。
- `w3-b3-kanban-{pur,mfg,so,qm}.png` — 四看板列计数与 psql 一致（采购 approved7/draft3/pending1；生产订单 completed2/released4/draft4/approved7/in_progress3；销售 approved6/draft2；质检 pending8/closed49）。
- `w3-b3-journey-2-mo-drawer.png` — 计划员旅程：MO-2026-0002 卡片 drawer 定界到所点记录（速冻荠菜猪肉水饺），工序子表（和馅/成型速冻/内包装，均 2026-09-28，WC-ASSY×2/WC-PACK）。
- `w3-b3-gantt.png` — 甘特页在日刻度上渲染 10 条单日条（视觉读数 26/28/29/30 分布与 psql 逐日一致）。
- `w3-b3-journey-po-drawer.png`、`w3-b3-calendar-delivery*.png`、`w3-b3-calendar-plan.png` — 采购员旅程（PO-W8-QC-01 卡片 drawer）、两张日历、事件 drawer（PO-W8-QC-01，filterbytk 定界）。
- `w3-b3-member-kanban-mfg.png` — member（陈立群）可见看板（管理按钮消失、member token 20 行）；mfg_order_operations/mps_plans/mrp_suggestions 的 member view 授权由 verify 断言。
- `w3-b3-verify.txt` / `w3-b3-regression.txt` — verify OK（含 W3-B3 断言块）与零回归复跑：P0 wire 探针（80 页/99 表/0 异常/AddNew 100%）、`--assert-ledger` 平衡（32 组 138 流水）、b9 链 s1/s4/s5 PASS。

## 备选方案

- **可拖看板 + move 守卫**——拒绝（PLAN D4）：拖拽路径在任何引擎钩子前直写分组字段；事后守卫是在对抗框架而非不武装它。
- **JSBlock 自建 SVG 甘特**——拒绝（PLAN D5、业界报告）：甘特在 Odoo 18 / ERPNext 开源文档零命中；官方 v1 通道存在且可渲染；只读组合（看板+甘特+FCS 拆单建议卡）已覆盖计划员动线。
- **交期日历 UI 过滤仅显示未完成**——拒绝：`init.filter` 在 flow-engine catalog 白名单之外；自造键有静默丢弃风险。日历展示全部带日期单据；未完成子集留在 psql 证据。
- **MPS 日历挂 `mps_plan_items`**——数据模型不允许：条目只有 'YYYY-MM' 时段串无日期；`mps_plans.period_from/to` 是唯一日历形态源。
- **不守卫直接 import `ganttBlock`**——已修：hub-modules 只在直接调用时执行构建（w8/f1 模式），import 无副作用。

## 后果

本 Note 记录的决策自此成为多视图面的现行契约（详见决策与证据）。交期日历在有白名单过滤通道之前会同时展示已收/已发单据；hub 任务看板/任务日历的卡片 drawer 在下一次 f1 重写时获得记录定界（源已修；活树早于修复）；executeB2 每次 heal 都重写子表 drawer（预存的收敛安全毛刺——`findOne?subKey=page` 深取截断使其关联在场判定永不通过；重写输出幂等）。
