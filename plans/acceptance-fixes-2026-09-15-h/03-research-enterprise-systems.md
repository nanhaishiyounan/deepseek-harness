# 主题三调研报告：五大企业系统（03）

> 隶属 [PLAN.md](PLAN.md)。调研来源：project-research（R3 NocoBase 体系）+ deep-research ×5（R5 CRM+ERP / R6 MES / R7 WMS / R8 PLM / R9 SRM，各自落盘 research/）。用户原话：「crmerp、mes、wms、plm、srm都要做起来，不是有个菜单就是可以了，每个都要做深度调研，然后根据nocobase的架构，搭建一个nocobase 的综合业务系统，不是hub+noco的后端，而是类似admin的系统，可以ui配置的，这个肯定需要定义很多新的区块的，要完整实现所有系统，这是企业级别的真实项目！」。分期路线见 [04](04-roadmap-five-systems.md)，H 轮实施见 [40-h4](40-h4-foundation-srm.md)/[50-h5](50-h5-wms.md)。

## 1. 架构裁决（三项，已定）

1. **形态 = 单 NocoBase admin 应用 + 每系统一个菜单组**。用户要的「类似 admin 的系统，可以 ui 配置的」= v2 flowPage 体系（26 页既成事实，[`desktopRoutes`](../../platform/nocobase/packages/plugins/@nocobase/plugin-client/src/collections/desktopRoutes.ts:10) 树 + 每系统 `parentId` 菜单组 + `rolesDesktopRoutes` 角色隔离）。不走多子应用（multi-app 插件在 2.2.6 被排除未验证；multi-portal 是 2.3+ 能力）；不新建独立 React Portal（那是 hub+noco 后端路线，用户明确排除）。
2. **建设通道 = E/F 工厂五件套复用**（[00 §4](00-research-notes.md)）：[`nocobase-flow-page-lib.mts`](../../examples/kb-agent/scripts/nocobase-flow-page-lib.mts) 幂等基建 + E1 spine/F2/F3 复合页骨架 + F4 `flowSurfaces:addBlock` 图表通道 + n18 AI 挂载器（扫全库顶层表单，新表单**零改动自动覆盖**）。新系统 uid 前缀 `h4srm*`/`h5wms*`（继承 batchScoped 幂等）。
3. **自定义区块 = 首选 A（JSBlockModel）+ B（组合现有 Tree/Kanban/Chart），路径 C（真 NocoBase 插件）仅后备**。C 的代价：动快照树（MANIFEST 登记）+ yarn build ~20min + gantt 前车之鉴（客户端注册≠服务端 authoring 契约，[E1 头注释:19-23](../../examples/kb-agent/scripts/nocobase-e1-pj-v2.mts:19)）。五系统 MVP 的特殊视图按 B/A 逐个裁决（见 §3 各域）。

## 2. 现有资产与差距（R3）

- **crm_* 11 表**（[`nocobase-crm-modules.mts:89-166`](../../examples/kb-agent/scripts/nocobase-crm-modules.mts)）：leads/customers/contacts/deals/quotes/products/activities/follow_ups/payments/invoices/targets——轻量 CRM，缺 L2C 状态机纪律与 O2C 后段。
- **hub_* 37 表**（[`nocobase-hub-modules.mts:74-363`](../../examples/kb-agent/scripts/nocobase-hub-modules.mts)）：九域（项目/工单/知识/资产/人事/主数据/库存 3 表/销售演示/帮助台/财务/采购）——WMS 只有雏形（warehouses/products/stock_moves，缺库位/批次效期/盘点）；SRM 只有采购级（po_suppliers，缺准入/绩效/对账）；MES/PLM 全缺；ERP 缺 O2C/P2P/核算。
- **复用 vs 新建裁决**（防 G 轮 sales 域双数据分裂教训）：仓库复用 `hub_inv_warehouses`（加 wms_zones/wms_bins 子表）；物料主数据复用 `hub_inv_products` **幂等加列**（效期天数/温层/储存条件/GB2760 分类号/致敏原——为 I 轮 PLM 预埋，nullable 加列零破坏），不另建 md_materials；供应商：`srm_suppliers` 独立新建（准入管理域），`hub_po_suppliers` 保留采购域不动，两域关系（准入合格→同步采购供应商）列 I 轮集成；批次：新建 `wms_lots` 批次主数据（效期四日期）。collections 命名 `srm_*`/`wms_*`（后续 `plm_*`/`mes_*`/`erp_*`），与 crm_*/hub_* 物理隔离。

## 3. 五域调研结论汇总（每域：实体/MVP 闭环/区块裁决）

### 3.1 CRM+ERP（[R5 报告](../../research/2026-09-15-crm-erp-domain-model.md)，K 轮）

- **差距本质**：现有 crm_* 缺「报价确认之后」的一切。首期闭环 = **L2C 管道升级**（9 态 Lead 状态机+输单原因字典）+ **O2C 五单**（销售订单 SO→发货单 DN→销售发票 SI→收款 PE+核销分摊，Delivery%/Billing% 双维度）+ **P2P 五单**（MR→PO→GR→应付→付款，三单匹配+暂估冲回）+ **库存移动加权计价** + **应收应付余额**（明确不建复式总账；凭证导出对接金蝶路径已验证）。
- **排除项**：MRP 运算排除（四要素数据质量论证）；BOM 首期只做配方主数据（归 PLM）。
- **区块**：标准区块覆盖 ~80%；缺口=销售漏斗（Chart 数据源）、应收账龄（Chart+SQL）、单据下推（workflow 联动规则）——无必需自定义区块。
- **金蝶单据头/体公共字段模板可直接抄**（R5 报告附件）。

### 3.2 MES（[R6 报告](../../research/2026-09-14-mes-core-domain-model-nocobase.md)，J 轮）

- **实体**：两层粒度「生产订单（订单级）+工序任务（工序级）」+12 实体（工艺路线/工序/工作中心/报工记录/物料领用/质检单 IQC-IPC-FQC/批次消耗关系/设备台账/停机记录）。
- **关键裁决**：批次追溯 = 「批次消耗关系表（多对多）+工单锚点」而非批次树；数量口径（powder「完成=累计合格」 vs ERPNext「完成=加工过件数」）**上线前写死为累计合格**；食品 CCP 以「人工录入记录表」进 MVP（≈质检单特例），设备自动数采明确不进。
- **MVP 闭环 7 步**：下达工单→领料（批次必填）→分序报工→FQC→完工入库→成品批次反查原料批次→关闭。
- **区块**：~80% 标准区块（**Gantt 甘特插件**做工序进度、**SQL collection** 做追溯穿透查询——两者皆现成）；自定义优先级：扫码流式报工(P1.5)→追溯图形树(P2)；零硬编码可完成 MVP 演示。
- **纠偏**：「QueoF」「简工云」经精确检索不存在（写入报告防再错引）。

### 3.3 WMS（[R7 报告](../../research/2026-09-14-wms-domain-model-nocobase.md)，H5 本期）

- **实体**：库存表 (SKU×库位×批次×状态) 唯一约束 + 四数量（现有/已分配/锁定/可用）+ 乐观锁 version；**所有变动经统一入口写事务流水（append-only）**；批次独立主数据 `wms_lots`（效期四日期：生产日/过期日/应下架日/预警日）；库区（温层）/库位（编码/状态/容量）。
- **状态机**：单据主链（草稿→待执行→执行中→部分完成→完成/过账→关闭/作废）；盘点链（计划→冻结+账面快照→初盘→复盘差异→调整审批→完成）；调整单强制「申请→审批→过账」。
- **食品特有**：FEFO 按「应下架日」升序分配（Odoo 机制）；库位级温层校验；30%/20% 多级效期预警；温控异常批次隔离+双向追溯。
- **MVP 闭环 9 步**：采购收货→直收/质检放行→上架推荐→批次效期库存查询→FEFO 拣货→出库过账→循环盘点→差异调整→流水可查。
- **区块**：标准区块覆盖 ~80%；**库位平面图是唯一 MVP 必需自定义区块**（裁决：走 A 路 JSBlockModel——仓库→库区→库位状态色块网格）；扫码用内置 ScanInput+移动端降级；MVP 取轻量端（不建波次/任务池/AGV，模型预留扩展字段）。
- **FEFO 自动分配降级**：MVP 实现为出库页「推荐批次」列（按应下架日升序提示），严格自动分配列后期。

### 3.4 PLM（[R8 报告](../../research/2026-09-14-food-plm-domain-model.md)，I 轮）

- **实体**：11 实体——物料主数据（GB2760 食品分类号/八大致敏原/营养成分 1+6）、BOM/配方**版本头行分离**（多级嵌套基料/预混料+小样/中试/量产三形态+EBOM vs MBOM）、ECR→ECN 多态影响关联、受控文档（版本+审批+受控发放）、阶段门项目（六阶段+红黄绿灯）、**GB2760 限量规则库三张基础表**。
- **王牌场景（直连用户需求）**：酱油山梨酸钾限量已在 GB2760-2024 精确验证（分类 12.04，1.0 g/kg 以山梨酸计，山梨酸钾换算系数 1.34）；五步校验算法+分级策略（超限量/超范围/禁用/致敏遗漏→**硬阻断**；80%~100% 用量/带入原则→预警）；配料表生成（降序+复合配料 25% 展开+过敏原加粗）锚定 GB 7718-2025 问答 50 条。
- **MVP 闭环 7 步**：立项（G1 门）→物料准备→配方创建（含 1.20 g/kg 超标阻断→调整通过演示）→BOM 编制→ECR 改配方→审批发布 V2.0（配料表/营养表同步生成）→发布态 BOM 只读移交 ERP/MES。
- **区块**：标准区块 ~70%；**多级 BOM 树是 MVP 唯一必需自定义区块**（树表仅支持单表自关联，跨表递归需后端递归 API；裁决：MVP 先用 TreeBlockModel 单表自关联承载 BOM 行层级+缩进表降级，JS 增强树列 P2）；版本 diff 高亮与影响分析图形化列 P2（MVP 用变更记录表降级）。
- **最大数据工程**：GB2760 全量规则库导入（I 轮预算大头）。

### 3.5 SRM（[R9 报告](../../research/2026-09-14-srm-food-nocobase.md)，H4 本期）

- **实体**：九实体——供应商主数据（生命周期+三套 A/B/C 分级拆独立字段：监管风险/审核评级/IQC 严格度）、资质证照（SC 生产/经营许可 5 年效期+不对称延续窗口）、寻源 RFQ（后期）、准入流程、绩效评分卡（质量/交期/价格/服务/合规五维）、对账（后期）、ASN 送货预约（后期）、CAPA 8D 整改、黑名单（状态字段非独立表）。
- **合规时效**：GB 14881-2025 已于 2026-09-02 实施、食安法 2025 修正案 2025-12-01 施行——预警规则表按证照类型配置（30/60/90 天）。
- **MVP 闭环（零自定义区块）**：注册→资质审核（证照效期）→现场审核评分（GMP/HACCP 检查表）→分级准入→季度绩效评分卡→评级降级→整改单跟踪→复评恢复/淘汰。
- **区块**：**无需自定义区块**——评分卡雷达图走 v1 `plugin-data-visualization-echarts` 原生支持；比价透视(P1)/追溯链图(P2)列后期。
- **MVP 实体裁剪**（H4 定稿）：suppliers/certificates/audit_checklists/audit_records/score_cards/capas 六表 + workflow 准入审批；RFQ 寻源/ASN/对账列 I+ 轮。

## 4. 五系统区块需求汇总（自定义开发路径裁决表）

| 系统 | 特殊视图 | MVP 裁决 | 路径 | 期次 |
|---|---|---|---|---|
| WMS | 库位平面图 | **必需** | A：JSBlockModel（色块网格） | H5 |
| WMS | 效期预警看板 | Chart 组合 | B：ChartBlockModel（F4 通道） | H5 |
| SRM | 评分卡雷达图 | 原生 | 内置 echarts 插件 | H4 |
| SRM | 比价透视表 | 后期 | A：JSBlockModel | I+ |
| PLM | 多级 BOM 树 | **必需** | B：TreeBlockModel 单表自关联（降级缩进表）+ P2 JS 增强 | I |
| PLM | 版本 diff | 后期 | A：JSBlockModel | I+ |
| MES | 工序进度甘特 | 原生 | 内置 Gantt 插件 | J |
| MES | 追溯穿透查询 | 原生 | SQL collection | J |
| MES | 扫码流式报工 | 后期 | A：JSBlockModel | J+ |
| CRM/ERP | 漏斗/账龄 | 组合 | B：Chart+SQL collection | K |

结论：**H 轮唯一自定义区块 = WMS 库位图（JSBlockModel）**，兼作 A 路径的验证探针——跑通则为 I/J 轮 PLM BOM 树/MES 报工铺路；若 runjs 安全扫描约束导致不可行，回退 B 路（库位=GridCard 色块+过滤组合）。

## 5. 门禁与验收扩容模式（R3）

- 新页标题并入 [`setup-nocobase.mts`](../../examples/kb-agent/scripts/setup-nocobase.mts) `missingV2Xxx` 清单（拷 [:743](../../examples/kb-agent/scripts/setup-nocobase.mts:743) F2 形态）。
- 每域代表表加 list probe（拷 [:976](../../examples/kb-agent/scripts/setup-nocobase.mts:976) hub_inv_stock_moves 形态）。
- n18ai- 计数下限 ≥25 → 按新表单数上调（H 轮预计 +8~12）。
- Tree/Kanban/JS 新区块照 F1 加 flowModel use+prefix 探针（`batchScopedRows` 现成）。
- **flowModels:list pageSize=2000 上限**：五系统全上后预计超限——H4 在 flow-page-lib 预留分页扩容（已知风险，提前还债）。

## 6. 风险（主题三汇总）

| 风险 | 等级 | 预案 |
|---|---|---|
| 期待错位：用户要「完整实现所有系统」，H 轮只交付 SRM+WMS | **高（沟通）** | [04 路线图](04-roadmap-five-systems.md)随 attempt_completion 显式告知分期与每期规模；PLAN.md 范围外事项置顶 |
| JSBlockModel runjs 安全扫描约束（unknown globals 拒绝）挡住库位图 | 中 | H5 第 0 步 PoC 最小 JS 区块；回退 GridCard 组合（B 路）；PLM BOM 树依赖此结论 |
| 单批规模失控（每系统 8-15 表+15-30 页） | 中 | 每系统一批、独立提交可 revert（G 轮惯例）；H4 先 SRM（零自定义区块最轻）验证五件套扩容后再上 WMS |
| 状态机/审批流深度不足沦为「菜单壳」（用户明确反对） | 中 | 每系统验收必含端到端闭环实测剧本（种子数据→状态流转→审批→下游单据），不止页面渲染 |
| 与 hub_inv/hub_po 双主数据漂移 | 中 | §2 复用裁决+verify probe 双表并测；集成同步列后期轮次 |
| NocoBase workflow 能力边界（审批/联动复杂度） | 低 | workflow 四节点已有先例；复杂联动降级为状态字段+定时任务 |
