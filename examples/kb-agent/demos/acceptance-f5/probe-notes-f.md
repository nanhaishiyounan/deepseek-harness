# F 轮探查结论汇总（probe-notes-f）

> 各批第 0 步探查的第一手结论，对齐 E1 probe-notes 惯例。基线 HEAD `683d32a32d`，批次 F1-F5（2026-09-13）。

## F1 看板/日历（第 0 步探查 → 直发定稿）

- **fixture 三态**：canonical（authoring addBlock 输入）/ raw-persisted（落库形态，直发模板）/ readback（读回树）。直发用 raw-persisted。
- **坑 1（卡片渲染错误表单）**：details fixture canonical 的 `field` 是数组（`"field": [{...}]`）——那是 addBlock 输入，服务端展开。直发数组后 `subModels.field` 是 JS 数组，`DetailsItemModel.renderItem` 的 `fieldModel.createFork` 抛 `TypeError: e.createFork is not a function`（×102，每卡渲染一次）。修复：field 改 `subType:'object'` 单对象（E1 表格列模型同款）。
- **坑 2（卡片空白）**：fixture 的卡片段 `DetailsGridModel` 无 layout（骨架态，真实 addBlock 由服务端回填）。GridModel 按 `props.layout.rows[].cells[].items[uid]` 渲染——不引用子项 uid 则不渲染。修复：自带 layout（E1 formGrid 同款接线）+ DetailsItemModel 生成显式 uid 供引用。
- **hub_pj_tasks 物理字段**（psql 实证）：`sort`（interface=sort）存在 → v1 看板 `sortField:'sort'` 直迁 v2（`dragEnabled:true + sortField:'sort'`，网络请求 `sort[]=sort` 证实生效）。
- **日历 fieldNames**：v1 映射 `{start:'due_at', title:'title', end:[]}`（无结束字段）；v2 补 `end:'plan_end'`（恢复结束语义），`id:'id'`，月视图默认 + weekStart:1。
- **v1 页 tabs 子行**：每个 v1 页（含甘特）都有 1 个 tabs 子行（schemaUid+tabSchemaName）——rollback 记录必须包含（E3 孤儿遮蔽陷阱）。
- **甘特裁决**：客户端注册在（plugin-gantt client-v2 plugin.tsx），但不在 node-use-sets（四组均无）、不在 support-matrix（17 个 formal key 无 gantt）、无 fixture、无 `.define()`。仅 wire 可用、无合同保护——保留 v1。

## F2 CRM 五页

- 字段真源（psql fields 表）与 v1 树 `x-collection-field` 交叉：五页 v1 可见字段 ⊆ fields 全集，spec 照抄字段表。
- select 枚举从字段元数据 `options.uiSchema.enum` 抄录（含维护记录 type/status 的中英混排枚举——种子数据历史现状，照抄不裁剪）。
- **crm_customers/crm_deals 无 titleField**（collections:get 实证 `null`）→ 回款/发票的 customer/deal m2o 列会空白，脚本补 `name`（补齐后列显示"厦门海嘉粮油进出口有限公司"等真实关联名）。
- 两"仪表盘"v1 树均无 Chart/Filter 区块（纯表格），"仪表盘"是名不符实——双入口保留 + F4 叠图。

## F3 Hub/人事/基础七页

- **分类维护实为单页四块**（非四 tab）：desktopRoutes 只有 1 个 tabs 子行；hub-modules 种子源码（878-884 行）是 `blocks: [×4 table]` 堆叠。A 轮盘点"四 tab"误读。v2 保底=同构四块（决策 8 路径 B，无需探 RootPageModel tabs 形态）。
- **工作台 v1 也是双块堆叠**（tasks 6 列 + tickets 5 列，tickets 的 customer/assignee 是 input 字段非 m2o——fields 表 interface=input）。
- **供应商手配 drawer 字段合同**：38KB 树的 `x-collection-field` 全集 = name/contact/category/status（4 个）⊆ spec（fields 表同 4 个）——trivially 满足。
- **titleField 全景**：hub_hr_employees/hub_as_assets/hub_as_vendors/hub_kb_categories/hub_hr_departments/hub_tk_tickets 均无（仅 hub_pj_tasks=title）→ 六个补 name/title。
- **n18 截断缺陷（本批暴露）**：flowModels 目录破 1000 行（F3 铺量后 1067 行），n18 的 `pageSize=1000` list 无护栏——截断列表里 5 个 CreateFormModel 不可见，其按钮被孤儿清扫误删（verify 的 n18ai<25 断言当场抓住）。修复：n18/verify/f1/f2/f3 全部改 pageSize=2000 + `meta.total` 比对或满页即截断判定；被删 5 按钮重挂（29 popup forms 全见）。

## F4 图表（直发 vs authoring 通道分界）

- **直发失败实证**：按合同测试 raw 形态 `flowModels:save` 直发 ChartBlockModel（chartSettings.configure.query{resource,measures,dimensions}）——树里块在（grid items 含 ChartBlockModel）、页面零 canvas（chartEls=0、无 console 错误，静默不渲染）。根因：客户端只读规范化形态（collectionPath/字段数组），直发的 raw 形态读不懂。
- **authoring 通道成功**：`flowSurfaces:addBlock {target:{uid:gridUid}, type:'chart', settings:{query{resource,measures,dimensions}, visual{mode:'basic',type,mappings}}}`（body 不裹 values——agent 的 values 即请求体）。服务端规范化 + 校验：映射键按类型（bar/line={x,y}，pie/doughnut/funnel={category,value}），报错信息自带 CHART_EXPECTED_SHAPE 修复指引。
- **updateSettings 通道**：`stepParams.chartSettings.configure`（query+chart.option.builder{xField,yField}）也可行（合同测试 41 行用例），但 addBlock+settings 一步到位更简。
- **幂等**：addBlock 每次 mint 新 uid → 按"grid 下 ChartBlockModel 的查询目标（collection+dimension）"判存在。
- **AI 生成图表示范**：销售仪表盘悬浮球对话输入"按方式统计回款笔数，用饼图展示"→ Atlas/MiniMax-M3 约 90 秒生成环形饼图配置并在对话内渲染（银行转账 5/信用证 3/承兑汇票 2——与 crm_payments 真实数据一致）。

## 终态计数（F5）

- desktopRoutes：group=7 / page=2（任务甘特+应用中心）/ flowPage=26（25 业务+AI 工作台）/ tabs=28
- flowModels：total=1067，n18ai-=29 = 11（E 轮：N17d 八页 + E1 三页）+ 2（F1 看板/日历）+ 5（F2 五页）+ 11（F3：五单页 + 工作台×2 + 分类维护×4）——每个顶层 CreateFormModel 恰一钮
- 业务数据行数全部不变（crm_customers 20 / crm_products 10 / crm_payments 10 / crm_invoices 10 / hub_pj_tasks 19 / hub_tk_tickets 40 / hub_kb_articles 6 / hub_as_maintenance 4 / hub_hr_departments 5 / hub_hr_leave_requests 5 / hub_as_vendors 5 等）
- 网关冒烟 5×200
