# Agent Note: NocoBase v2 视图区块升级机制（看板/日历工厂、多块页、authoring 通道分界）

Status: implemented

[English](2026-09-13-nocobase-v2-view-block-upgrade.md) | 中文

## 问题

admin 后台 26 个业务页中 15 个仍是 v1，全部无 AI 悬浮球与弹窗填充按钮；其中任务看板/任务日历/任务甘特三页在 E 轮被判定"2.2.6 无视图区块模型"而保留 v1。F 轮需要判定该结论真伪、把全部可升级页升到 v2，并让两个名不符实的"仪表盘"页名副其实——同时不得触碰 vendored 快照与用户在用的 269 行业务数据。

## 决策

四批种子脚本（`examples/kb-agent/scripts/nocobase-f1-view-v2.mts` / `nocobase-f2-crm-v2.mts` / `nocobase-f3-hub-v2.mts` / `nocobase-f4-charts.mts`）在 E1 工厂契约之上扩展；不扩展 vendored 插件。

- **四层证据法判可升级性**：插件 client-v2 `registerModelLoaders` → flow-engine `node-use-sets.ts` 白名单 → `support-matrix.ts` → 官方 fixtures/合同测试。看板/日历四层俱全（E 轮误判源于只查了核心模型目录）；甘特仅客户端注册、后三层零支持，保留 v1。
- **fixture→直发映射两条铁律**（F1 实证）：直发 `flowModels:save` 用 `*.raw-persisted.json` 形态——① DetailsItemModel.field 必须单对象（canonical 的数组是 addBlock 输入，直发数组使 `renderItem` 抛 `createFork is not a function`，卡片全变错误表单）；② GridModel 类区块必须自带 `props.layout.rows` 引用子项 uid（骨架 fixture 无 layout，不补则卡片空白）。看板卡链：KanbanBlockModel(props 含 groupField/groupOptions/dragEnabled/sortField) → KanbanCardItemModel → DetailsGridModel(+layout) → DetailsItemModel(fieldPath) → Display*FieldModel。
- **Chart 走 authoring 通道，不能直发**：直发 raw 形态的块不进 DOM（客户端只读服务端规范化后的 collectionPath/字段数组形态）。走 `flowSurfaces:addBlock + settings{query,visual}`（合同测试同款 wire）；映射键按图类型（bar/line={x,y}，pie/doughnut/funnel={category,value}）；幂等按"grid 下块的查询目标（collection+dimension）"判存在（addBlock 每次 mint 新 uid）。分界一句话：fixture 有持久化形态的直发，需要服务端规范化的走 authoring。
- **多块页形态**：单 flowPage 的 BlockGrid items 挂 N 个 TableBlockModel（工作台=任务+工单，分类维护=四张分类表），各带独立 AddNew→CreateFormModel 弹窗（n18 按表单挂钮）。v1"分类维护四 tab"实为单页四块堆叠（desktopRoutes 单 tabs 行），v2 同构即等价。复合页 kept 脊柱按 uid 前缀+collection 匹配（防 E1/F1 同 collection 块给截断页假通过）。
- **截断护栏通用化**：flowModels 目录破千行暴露 n18 孤儿清扫从未 fails-closed——截断列表把 5 个活表单误判孤儿并删按钮。全仓统一：pageSize 2000 + `meta.total` 比对或满页即截断判定。
- **回滚/幂等全继承 E1**：按 title 读-改-写合并 rollback 记录（含 v1 行 tabs 子行原值）、destroy 前落盘、销毁后重拉扫孤儿、截断整批 heal；titleField 补齐扩展到 crm/hub 六个 collection（m2o 列渲染前提）。

## 备选方案

**看板 Add new 走 quickCreate 通道。** 否决：n18 只挂顶层 CreateFormModel，quickCreate 表单不在扫描面内。**分类维护用页面级 RootPageModel tabs。** 弃用：v1 本就是四块堆叠，同构等价且免探新形态。**Chart 用 updateSettings 通道。** 可行但两步（addBlock 骨架 + updateSettings 填配置），addBlock+settings 一步到位更简。

## 结果

终态 26 flowPage（25 业务 + AI 工作台）、v1 仅剩甘特与应用中心；n18ai-=29（每顶层 CreateFormModel 恰一钮）；业务数据 269 行零丢失；看板 7 组列 + 六字段卡 + sortField 拖拽、日历月视图、四图表真实聚合、AI 对话生成图表（银行转账 5/信用证 3/承兑汇票 2 与真实数据一致）。E1 Note 边界节、e1 头注释、probe-notes、QUICKSTART 的过时结论全部修订。证据 `demos/acceptance-f{,1..5}/`；探查结论 `demos/acceptance-f5/probe-notes-f.md`。
