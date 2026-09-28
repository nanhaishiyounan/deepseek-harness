# W4 全平台页面现状盘点（表单/表格完备性审计）

- 审计时点：2026-09-28 10:00–10:15（UTC+8），live 实地审计（非存档推断）
- 审计对象：NocoBase 2.2.6 @ http://127.0.0.1:13000（root .env `NOCOBASE_BASE_URL`；3080 为 dsh web 前端壳、无 /api，审计直连 13000）
- 方法：纯读 —— 唯一 POST 为 `/api/auth:signIn`，其余全部 GET/list + 浏览器同源探针；探针脚本与原始 JSON 见本目录（`.audit-fetch.mjs` / `.audit-analyze.mjs` / `api-*.json`）
- 数据基线：desktopRoutes **206 行**、flowModels **7222 行**（15×500 页取完，0 孤儿 parent 引用）、fields **1007**、collections **113**、v1 uiSchemas **3**

## 1. 层1：路由全量分类（206 行）

| type | 行数 | 说明 |
|---|---:|---|
| group | 16 | 顶级菜单分组（全部有 icon，无嵌套子组） |
| flowPage | 92 | v2 flow 页面（本报告主体） |
| tabs | 95 | flowPage 的 tab 容器（92 页中 3 页为双 tab） |
| page | 3 | **v1 legacy uiSchemas 页**：任务甘特 `zs3oqvlgqq0`（项目管理）、应用中心 `c9c6wzppejk`（顶级、无分组）、排产甘特 `96yet9a0x45`（生产制造） |

- v1 挂载方式：`type=page` + `GET /api/uiSchemas:getProperties?resourceIndex=<schemaUid>`，3 页全部 200 且返回完整 schema（任务甘特=GanttBlockProvider/hub_pj_tasks；排产甘特=GanttBlockProvider/mfg_order_operations；应用中心=app-hub 聚合页）→ **在线可用，非死路由**
- 结构性死路由：`hideInMenu`/`hidden` 全量 0；flowPage 缺 tabs 0；tabs 缺 BlockGridModel 0
- **功能死页**：「采购联系人（历史）」（n17f3gnpjv8rfd85，hub_po_suppliers）——名称自带"历史"，与「采购管理」组 w3pur 域完全平行，无筛选无编辑
- **集合级重复页 13 组**（同集合出现在多页）：kpi_snapshots×4（经营/供应链/库存/生产看板）、crm_payments×3（回款/销售仪表盘/应收应付对账）、srm_score_cards×3（绩效评分卡/供应商绩效雷达/季度绩效物化）、hub_tk_tickets×3（AI工作台/工单/工作台）、hub_pj_tasks×2（任务列表/工作台）、crm_customers×2、srm_suppliers×2、wms_lots×2、pur_quotes×2、pur_invoices×2、mfg_orders×2、mfg_order_operations×2、so_orders×2

## 2. 层2：92 个 flowPage 逐页深审

### 2.1 n17/n13 存量老页 27 页详表（用户「原本的页面都还是原样」的直接对象）

| 页面 | uid 前缀 | 集合 | 块构成 | 表格形态 | 表单形态 | 统计卡 | 主要缺陷 |
|---|---|---|---|---|---|---|---|
| 客户 | n17sys | crm_customers | 表×1 | 7列/无筛选/无排序/枚举有色 | 单列弹窗 | 无 | 无编辑无删除；行业/国家为文本 |
| 销售线索 | n17rwc | crm_leads | 表×1 | 6列/无筛选/无排序 | 单列 | 无 | 预计金额无格式化；负责人文本 |
| 联系人 | n17c3l | crm_contacts | 表×1 | 6列/无筛选 | 单列 | 无 | 无编辑 |
| 订单 | n17vu6 | crm_deals | 表×1 | 6列/无筛选 | 单列 | 无 | 金额无格式化；「交付截止」日期用文本列 |
| 报价单 | n17v6x | crm_quotes | 表×1 | 5列/无筛选 | 单列 | 无 | 总金额无格式化 |
| 回款 | n17f2c | crm_payments | 表×1 | 7列/无筛选 | 单列 | 无 | 客户/订单为关联列（Text渲染） |
| 发票 | n17f2u | crm_invoices | 表×1 | 7列/无筛选 | 单列 | 无 | 同上 |
| 客户仪表盘 | n17f2j | crm_customers | 图×2+表×1 | 7列/无筛选 | — | 图表无标题 | 与「客户」页重复 |
| 销售仪表盘 | n17f2y | crm_payments | 图×2+表×1 | 7列/无筛选 | — | 图表无标题 | 与「回款」页重复 |
| 产品与服务 | n17f2w | crm_products | 表×1 | 6列/无筛选 | 单列 | 无 | 基准单价无格式化 |
| 工单 | n17etq | hub_tk_tickets | 表×1 | 7列/无筛选 | 单列 | 无 | 客户/类别/处理人文本 |
| 知识文章 | n17f38 | hub_kb_articles | 表×1 | 6列/无筛选 | 单列 | 无 | 分类为关联列（Text） |
| 资产台账 | n17wr2 | hub_as_assets | 表×1 | 6列/无筛选 | 单列 | 无 | 无编辑 |
| 维保记录 | n17f34o | hub_as_maintenance | 表×1 | 7列/无筛选 | 单列 | 无 | **类型/状态枚举中英混排**：Preventive/Corrective/Inspection/Scheduled/In progress/Done 无颜色 |
| 供应商（资产组） | n17f3t | hub_as_vendors | 表×1 | 5列/无筛选 | 单列 | 无 | 与 srm_suppliers 域三重并存 |
| 员工 | n17lhe | hub_hr_employees | 表×1 | 7列/无筛选 | 单列 | 无 | 所属部门关联列（Text） |
| 部门 | n17f3e | hub_hr_departments | 表×1 | 5列/无筛选 | 单列 | 无 | 编制人数无格式化 |
| 请假审批 | n17f3w | hub_hr_leave_requests | 表×1 | 8列/无筛选 | 单列 | 无 | 员工关联列（Text） |
| 项目 | n17e1 | hub_pj_projects | 表×1 | 11列/无筛选 | 单列 | 无 | 客户/负责人关联列；进度%无格式化 |
| 任务列表 | n17e11 | hub_pj_tasks | 表×1 | 9列/无筛选 | 单列 | 无 | 所属项目/负责人关联列 |
| 里程碑 | n17e12 | hub_pj_milestones | 表×1 | 5列/无筛选 | 单列 | 无 | 所属项目关联列 |
| 任务看板 | n17f1 | hub_pj_tasks | 看板×1 | 有筛选/可拖拽 | 快速新建 | — | 卡片仅1项配置 |
| 任务日历 | n17f1 | hub_pj_tasks | 日历×1 | 有筛选 | 快速新建 | — | — |
| 工作台（顶级） | n17f34 | hub_pj_tasks+tickets | 表×2 | 均7/6列/均无筛选 | 单列×2 | 无 | 与任务列表/工单页重复 |
| 分类维护 | n17f3r | hub_md_*×4 | 表×4 | 均4列/均无筛选 | 单列×4 | 无 | 4表平铺无 tab 分组 |
| 采购联系人（历史） | n17f3g | hub_po_suppliers | 表×1 | 6列/无筛选 | 单列 | 无 | **功能死页** |
| AI 工作台（顶级） | n13ai | hub_tk_tickets | AIChat+表×1 | 4列/无筛选 | — | — | 与工单页重复 |

### 2.2 w/h 轮 65 页全量轻记录（每域抽样深审 ≥2 页已并入 2.3/2.4 量化）

| 域 | 页面 | 集合 | 块 | 筛选 | 备注 |
|---|---|---|---|---|---|
| 供应链 h4 | 供应商档案/准入/证照效期/审核检查表/审核评分录入/绩效评分卡/供应商绩效雷达/整改跟踪(看板) | srm_* | 表×7+图×2+看板×1 | 8/8 有 | h4 轮质量最高：有 Edit/JSRecord；评分数字仍无格式化 |
| 仓储 h5 | 仓库库区/库位平面图(JS)/入库单/出库单/库存查询/批次主数据/盘点管理/移库管理/库存流水/预留管理/补货预警/盘点计划/月度收发存 | wms_*+hub_inv | 表×13+JS×1 | 13/13 有 | 齐套；关联列全 Text |
| 采购 w3 | 采购申请/询价管理/供应商报价/比价表/采购订单/发票匹配/付款申请/采购看板 | pur_* | 表×9+看板×1 | 6/8（比价表无） | 双表块主子结构；比价表无筛选无新建 |
| 生产 w5/w6 | BOM管理/BOM工序/工作中心/生产订单/排产看板/领料单/退料单/报工记录/完工单/MO执行视图/生产订单看板 | mfg_* | 表×11+看板×1 | 8/11（排产看板/MO执行/生产订单看板只读无） | 排产看板与 v1 排产甘特同源 |
| 销售/计划 w7 | 销售订单/计划工作台/MRP快照/主生产计划/销售看板/交期日历/计划日历 | so_/mrp_/mps_ | 表×6+看板×1+日历×2 | 主表有；**计划工作台 mrp_suggestions 无筛选** | 转单操作页无筛选是硬伤 |
| 质量 w8 | 质检单/检验读数/处置看板/AQL抽样方案/季度绩效物化/质检看板 | qm_* | 表×4+看板×2 | 4/4 有 | 考核期字段 Text vs Enum 不一致 |
| 经营 w9 | 经营/供应链/库存/生产看板/应收应付对账 | kpi_snapshots等 | 图×10+表×8 | **看板表格均无筛选** | 应收应付状态列全裸 Text |
| 协同 w1/w3b4 | 审批中心/审批流配置 | wfl_* | 表×6+JS×1 | **全无筛选** | 流程ID数字列裸显 |
| 人事/权限 w3b5 | 组织架构/权限矩阵 | departments/users | JS×2+表×2 | 无 | **「上级部门ID/ID」裸数字列** |
| 终端 w3b6 | 车间终端/质检工作台/收货终端 | — | iframe×3 | — | url 绑 127.0.0.1:13110，部署外发即断 |
| W3看板 w3b3 | 采购/生产订单/销售/质检看板/交期日历/计划日历 | — | 看板×4+日历×2 | 有 | 与 w9 看板职能部分重叠 |

### 2.3 表单形态全域量化（83 CreateForm + 22 EditForm = 105 表单）

| 指标 | 数值 | 判定 |
|---|---|---|
| FormGrid 布局 | **105/105 全部 [24] 单列**（rows×sizes=[24]） | 0 页多栏分组——「一列输入框」100% 实锤 |
| 表单字段总数 | 725 FormItem | 平均 6.9 字段/表单 |
| 必填字段 | **128/725（17.7%）**；srm_suppliers 50 字段仅 2 必填、mfg_orders 53 字段 4 必填 | 商业交付必填约束普遍缺失 |
| placeholder | **0/725** | 全域无输入提示 |
| defaultValue | **0/725** | 全域无默认值（单据类型/日期/状态无预填） |
| 字段模型空 props | 592/725（82%） | 弹窗按集合字段序自动生成，零定制 |
| 枚举英文残留 | 维保 type：Preventive/Corrective/Inspection；维保 status：Scheduled/In progress/Done（均无 color，与中文选项混排同列）；证照 ISO22000/HACCP（有 color，术语可接受） | 2 组真缺陷 |
| 字段顺序 | =集合 DDL 字段序 | 未按业务动线重排（编码/名称/类型/数量/日期/备注无统一范式） |

### 2.4 表格形态全域量化（78 页共 101 表格块）

| 指标 | 数值 | 判定 |
|---|---|---|
| 无 Filter 筛选器 | **37/78 页（47%）**；块级 50/101 | 全部 n17/n13 老页 + 审批中心/审批流配置/组织架构/比价表/计划工作台/排产看板/MO执行/MRP快照/w9看板5页/应收应付 |
| 默认排序 params.sort | **0/78 页（0%）** | 全域列表无默认排序（打开顺序=主键序，业务应按单号/日期倒序） |
| 金额/数字列格式化 | **0/150（0%）** 千分位或 precision | 订单/回款/发票/对账/成本全线裸数字 |
| 关联字段列 | **100 列 / 51 页（55%）** 全部 DisplayTextFieldModel 渲染 | 数据侧证明：pur_orders 行 `supplier_id:12`、hub_pj_tasks 行 `project_id:14`（无对象展开）→ 显示空值或裸 ID |
| 状态列裸 Text（无枚举标签） | 14 列 / 8 页 | 应收应付对账×5（审批状态/发货进度/方式/状态/匹配结果）、审批流配置×5、库存看板×1、审批中心×1 |
| 编辑入口 EditAction | **仅 17/92 页**（75 页无编辑） | n17 全域 + 大量 w/h 页只读 |
| 删除入口 DeleteAction | 仅 7/92 页 | — |
| 视图入口 ViewAction | 78/78 有（W3 heal 成果） | 行详情抽屉普遍在线 |

### 2.5 页面形态

- **统计卡/KPI：67/78 表格页（86%）无任何统计块**（无 Chart/JS/说明块）；仅 8 页有图表（w9×4、客户/销售仪表盘、绩效雷达、应收应付）
- ChartBlockModel 18 块配置在 stepParams.chartSettings（radar/line/doughnut 均有效）但 **props.title 全部空**——图表无标题
- IframeBlock 3 块 url 硬编码 `127.0.0.1:13110`——部署迁移即断链
- 空状态文案：无 emptyText 类定制配置（列表为空时呈现默认英文/无引导）

## 3. 层3：导航审计

| # | 缺陷 | 证据 |
|---|---|---|
| N1 | **「采购」与「采购管理」双分组并存** | 采购(sort15, 仅1页「采购联系人（历史）」) vs 采购管理(sort17, 8页) |
| N2 | **「销售流程」与「销售管理」双分组并存** | 销售流程(sort6, 5页 n17老页) vs 销售管理(sort19, 5页 w7新页)——同名「订单」vs「销售订单」概念割裂 |
| N3 | **资产组混入供应商页** | 资产管理组「供应商」(hub_as_vendors) 与供应链组「供应商档案」(srm_suppliers) 与「采购联系人（历史）」(hub_po_suppliers) 三重并存 |
| N4 | 顶级散页无分组 | 「AI 工作台」「工作台」「应用中心」三页顶级平铺；应用中心无分组无 icon 归属 |
| N5 | icon 异常 | 「付款申请」icon=`' DollarOutlined'`（前导空格，渲染失败风险） |
| N6 | icon 重复 | CRM客户/人事管理/协同办公同为 TeamOutlined；资产管理/仓储管理同为 DatabaseOutlined |
| N7 | 配置中心类页面分散 | 审批流配置在协同办公、权限矩阵在协同办公、组织架构在人事管理——配置域无统一入口 |
| N8 | 命名混淆 | 「工作台」vs「AI 工作台」；「任务列表」vs「工作台」内任务表；术语英混标题（MO执行视图/AQL抽样方案/MRP快照——术语可接受但建议统一格式如「MO 执行视图」空格规范，现状 AQL抽样方案无空格 vs MO 执行视图有空格，不统一） |

## 4. 量化汇总（对应用户五问）

| 用户口径 | 数值 |
|---|---|
| 表单零分组（单列堆砌） | **105/105（100%）** |
| 表单零必填的页（域） | 必填率 17.7%（128/725）；27 个 n17 老页弹窗合计必填仅个位数 |
| 表格无筛选 | **37/78 页（47%）** |
| 状态列无彩色标签 | 14 列/8 页（另有维保中英混排 2 列） |
| 关联字段显示 ID/空 | **100 列/51 页（55%）**，数据侧已证实 |
| 无默认排序 | 78/78（100%） |
| 金额列无格式化 | 150/150（100%） |
| 无统计卡页面 | 67/78（86%） |
| 无编辑入口 | 75/92 页（82%） |

## 5. 最严重 10 项缺陷（跨层排序）

1. **全域表格零默认排序**（78/78）——单据列表打开顺序不定，违背业务列表基本预期
2. **n17/n13 老页 27 页全无筛选 + 75/92 页无编辑入口**——「原本的页面还是原样」的结构性根源：W3 heal 只加了行详情（ViewAction），未动筛选/编辑/表单
3. **弹窗表单 100% 单列裸堆 + 必填率 17.7% + 0 placeholder + 0 默认值**（105/105）——「AddNew 弹窗一列输入框」完全实锤
4. **关联列显示空值/裸 ID**（100 列/51 页；pur_orders `supplier_id:12`、hub_pj_tasks `project_id:14` 实证）——用户抱怨点机制确认：DisplayTextFieldModel 直读 FK 字段无 titleField 解析
5. **金额列 150/150 无千分位/精度**——订单/回款/发票/应付/成本全线
6. **分组混乱**：采购 vs 采购管理、销售流程 vs 销售管理、资产组三重供应商页并存
7. **状态列裸 Text 14 处**（应收应付对账 5 处全裸、审批流配置 5 处）+ 库存看板「状态」列
8. **维保记录枚举中英混排无颜色**（Preventive/Corrective/Inspection/Scheduled/In progress/Done）
9. **86% 表格页无统计卡；18 图表块全部无标题**；iframe 终端页绑死 127.0.0.1:13110
10. **死页与重复页**：「采购联系人（历史）」功能死页；13 组集合重复页（kpi_snapshots×4、crm_payments×3、srm_score_cards×3）；组织架构/审批流配置裸 ID 列且无筛选

## 6. v1 页面处置初步建议

| v1 页 | 现状 | 建议 |
|---|---|---|
| 任务甘特（项目管理） | Gantt/hub_pj_tasks，v2 无甘特块等价物；与「任务列表/看板/日历」并列 | **保留升级**：v2 flow 体系暂无 GanttBlockModel，短期内保留 v1 承载甘特视图；中期若 v2 补甘特块则迁移退役 |
| 排产甘特（生产制造） | Gantt/mfg_order_operations；与「排产看板」（同集合表格）职能重叠 | **二选一**：要么「排产看板」甘特化后退役 v1，要么保留 v1 并把「排产看板」改名为「排程明细」明确分工 |
| 应用中心（顶级） | app-hub 聚合页，无分组归属 | **保留归组**：迁入「基础数据」或新建「系统配置」组，与 N7 的配置中心统一入口一并治理 |

## 7. 附：产物清单

- `.audit-fetch.mjs`：只读抓取（signIn + 全分页 GET）→ `api-desktopRoutes.json`(206)、`api-flowModels-flat.json`(7222)、`api-v1-page-*.json`×3、`api-collections.json`(113)、`api-collection-fields.json`(1007，`/api/fields:list` fallback)
- `.audit-analyze.mjs`：离线分析器（从上述 JSON 重放本报告全部量化）→ `audit-pages.json`（92 页逐页）、`audit-forms.json`（105 表单/725 字段）、`audit-summary.json`（汇总指标）
- 方法备忘：弹窗表单子树不在 flowModels 平铺 parentId 树内（CreateFormModel 为无子存根），表单审计按 FormItem.stepParams.fieldSettings.collectionName 归属；FormGrid 行结构取 props.layout.rows[].sizes（[24]=单列全宽）
