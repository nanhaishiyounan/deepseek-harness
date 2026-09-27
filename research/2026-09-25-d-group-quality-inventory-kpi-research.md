# D 组调研：质量管理 + 库存实务深化 + 真实数据看板（食品行业 KB+agent 产品设计依据）

> 调研日期：2026-09-25 | 来源：14 个来源（ERPNext docs 6、Odoo docs 6、Wikipedia/SQC Online 4+）| 深度：Thorough
> 方法说明：主任务约定 DuckDuckGo 被封；本组标签页的 Bing 会话持续返回污染/空结果，故以一级文档站直读 + 站内同源批量抓取替代搜索引擎发现；AQL 判定数组通过 SQC Online 官方 Z1.4 计算器实跑取证。

---

## D1 质量管理

### D1a 检验单模型（IQC/IPQC/OQC）

**行业标准做法**（一级来源：ERPNext Quality Inspection、Odoo Quality 17.0 官方文档）：

ERPNext 检验单核心结构（[Quality Inspection](https://docs.frappe.io/erpnext/quality-inspection)，一级）：
- **Inspection Type 三分**：Incoming（采购/IQC）、Outgoing（销售/OQC）、In Process（制造/IPQC）——与 IQC/IPQC/OQC 三段模型一一对应
- **Reference Document Type**：Purchase Receipt / Purchase Invoice / Delivery Note / Sales Invoice / Stock Entry / **Job Card**（Job Card = IPQC 过程检验的挂靠点，等价于「首件/巡检挂在工序上」）
- 关键字段：Item、**Sample Size**（抽样数量）、Inspected By / Verified By、Remarks、Status
- **Readings 子表**（检验项 item 行级）：Parameter、**Min Value/Max Value**（数值型公差）、**Acceptance Criteria Value**（非数值型）、Reading 1..n（多次实测读数）、行级 Status（保存时自动 Accepted/Rejected）
- **Formula Based Criteria**：验收公式支持 `reading_1 + reading_2 < 10`、`mean < 15`、`reading_value in ("A","B","C")`（模板级配置）
- **Manual Inspection**：勾选后行级判定交人工（容忍超差手动接收的场景）
- **强制卡点**：Item 主数据勾选 Quality Inspection Criteria 后，收/发货单据**提交前必须完成检验**（[Stock Inspection](https://docs.frappe.io/erpnext/stock-inspection)，一级：结果可 Accept/Reject/On Hold）

Odoo Quality 三对象模型（[Quality Checks](https://www.odoo.com/documentation/17.0/applications/inventory_and_mrp/quality/quality_management/quality_checks.html)、[Control Points](https://www.odoo.com/documentation/17.0/applications/inventory_and_mrp/quality/quality_management/quality_control_points.html)，一级）：

| Odoo 对象 | 作用 | 关键配置 |
|---|---|---|
| Quality Check（检验单） | 一次人工检验行为 | Control per: **Operation（整单）/ Product（每品）/ Quantity（每数量+指定 Lot/Serial）**；Type: Instructions / Pass-Fail / **Measure（含标称值公差）** / Take a Picture / Print label |
| Quality Control Point（控制点=规则引擎） | 按条件自动生成检验单 | Products/Product Categories + **Operations（Receipt/Delivery/Manufacturing+Work Order Operation）**；Control Frequency: **All / Randomly（按百分比抽检）/ Periodically（周期）** |
| Quality Alert（质量警报） | 缺陷/异常上报 | Title/Product/Work Center/Picking/Team/Responsible/Tags/**Root Cause**/Priority(1-3星)/四个 Tab：Description、**Corrective Actions、Preventive Actions**、Miscellaneous(Vendor)；Kanban 阶段流转 |

**两者对照**：ERPNext 是「模板+读数」强记录模型（参数级 tolerance+多读数+公式），Odoo 是「规则点+轻检验+重异常」模型（QCP 自动触发、check 轻量、alert 承载 CAPA）。食品行业建议取两家之长：**模板化读数（ERPNext 式）+ 控制点自动触发（Odoo 式）**。

**轻量可落地版（NocoBase）**：`qmInspection` 主表（type: IQC/IPQC/FQC/OQC、refType+refId 多态引用、batch、sampleSize、aqlPlan JSON、verdict、inspector、date）+ `qmInspectionItem` 子表（parameter、nominal、toleranceLow/High、reading、manualOverride、result）；`qmControlPoint` 规则表（trigger 事件=收货/工序完成/出货，frequency=All/Percent/Periodic）；mobile 对话卡：AI 同事发「来料检验任务卡」→ 表单填读数 → 行级自动判定 → 总判定回写。**差异取舍**：企业版有公式引擎+多读数版本管理+SPC 控制图；轻量版读数 1 列+min/max 判定+公式仅支持 mean 即可（覆盖食品水分/净重/感观 90% 场景）。

### D1b AQL 抽样方案（GB/T 2828.1 ≡ ANSI/ASQ Z1.4 ≡ MIL-STD-105E）

**标准谱系**：GB/T 2828.1 修改采用 ISO 2859-1，与 ANSI/ASQ Z1.4 同源自 MIL-STD-105E（[Wikipedia: Acceptance sampling](https://en.wikipedia.org/wiki/Acceptance_sampling)，二级：「MIL-STD-105E was cancelled in 1995 but is available in related documents such as ANSI/ASQ Z1.4」）。

**判定逻辑**：抽 n 件，不合格数 d ≤ Ac 接收，d ≥ Re 拒收（单次抽样 Ac/Re 必相邻整数，Re=Ac+1）。

**批量分段与检验水平**（[SQC Online Z1.4 计算器](https://www.sqconline.com/military-standard-105e-tables-sampling-attributes)，二级但按标准实现、实跑验证）：批量 N 分 15 段（2-8, 9-15, 16-25, 26-50, 51-90, 91-150, 151-280, 281-500, 501-1200, 1201-3200, 3201-10000, 10001-35000, 35001-150000, 150001-500000, >500000）；检验水平 S-1~S-4（特殊/小样本）、I/II/III（一般），**默认一般水平 II**。

**实测判定数组**（一般水平 II、单次正常检验，SQC Online 实跑，[结果页](https://www.sqconline.com/sampling-attributes-plan)）：

| 批量段 | 字码 | 样本量 n | AQL 1.0 Ac/Re | AQL 2.5 Ac/Re | AQL 4.0 Ac/Re |
|---|---|---|---|---|---|
| 151-280 | G | 32 | 1/2 | 2/3 | 3/4 |
| 281-500 | H | 50 | 1/2 | 3/4 | 5/6 |
| 501-1200 | J | 80 | 2/3 | 5/6 | 7/8 |

**严格度切换规则**（[SQC Online Switching Rules](https://www.sqconline.com/switching-rules-mil-std-105e-z14)，二级）：正常→放宽：连续 10 批未被拒且其他条件；放宽→正常：出现 1 批未被接收；正常→加严：连续 5 批中 2 批被拒；加严→正常：连续 5 批未被拒；**加严→停检**：加严下连续 5 批仍需加严。加严判定实测=AQL 严一档（如 G/AQL2.5 加严 Ac1/Re2）；放宽样本量减半（G/AQL2.5 放宽 n=13、Ac1/Re3、间隙值「接收并恢复正常」）。注：用户提法中「正常 I/加严 II/放宽 III」实为「正常/加严/放宽三态」；「I/II/III」是检验水平（样本量档），两个维度正交。

**缺陷分级与食品常用 AQL**（[Wikipedia: Acceptable quality limit](https://en.wikipedia.org/wiki/Acceptable_quality_limit)，二级）：Critical（危害安全/违规）/ Major（影响功能销售）/ Minor（工艺瑕疵不影响使用）三级。「严重 0（Critical 0 即 0 收 1 拒，发现即拒收）、主要 1.0、次要 2.5 或 4.0」为食品/消费品行业通行配置（**行业惯例（未溯源）**）。全检场景：Critical 通常 100% 检；免检：合格供方+低风险物料经评估纳入免检清单（行业惯例）。

**轻量版**：NocoBase 建 `qmAqlPlan` 查找表（lotSizeBand、level、codeLetter、n、aql、severity → Ac/Re 五列），抽样向导=「输入批量+选 AQL」→ 出 n/Ac/Re → 自动填入检验单 sampleSize；状态机存 supplier 的切换计数器（连续接收批数/5 批内拒收数）。**取舍**：企业版含双次/多次抽样、箭头规则（↕换 n 或 Ac/Re）、OC 曲线；轻量版只做单次抽样+无箭头简化（小批量食品厂足够）。

### D1c 不合格处置四路

**依据**：Odoo 用虚拟库位承载处置后果（[Inventory management/Location types](https://www.odoo.com/documentation/17.0/applications/inventory_and_mrp/inventory/warehouses_storage/inventory_management.html)，一级）：**Inventory Loss 类库位**下分 Inventory Adjustment（盘差）与 **Scrap（报废归集）**；内部库位可自建 Quality 待检区；ERPNext Stock Entry 类型可自定义 **Scrap Entry**（[Stock Entry](https://docs.frappe.io/erpnext/stock-entry)，一级），Material Issue 用于报废/耗用出库，Material Transfer 用于让步转入合格库。

**处置单状态机（行业标准设计，融合两家证据+行业惯例）**：

```
IQC 判定不合格 → 生成 NC 处置单(pending)
pending → 退货(return)   → Material Issue/Delivery 退供应商，过账出库
pending → 让步(concession)→ 审批记录(who/why/偏差说明) + Material Transfer 冻结库→合格库
pending → 返工(rework)   → 生成 Rework 工单，完工回检
pending → 报废(scrap)    → Scrap Stock Entry，成本归集到报废差异科目
任一路 → closed（留存检验单+处置单+库存移动三方勾稽）
```

（状态流转条件为通用 MES/MRP 实践，**行业惯例（未溯源）**；库存动作挂靠见上述 Odoo/ERPNext 一级文档。）

**轻量版**：`qmDisposition` 表（ncFrom 检验单、route 枚举、approver、decisionNote、stockMoveRef）；四个动作按钮分别调 WMS 过账引擎既有单据类型（退=出库、让步=移库、返工=工单、报废=出库+成本科目）；让步必填审批人+理由（审计留痕）。**取舍**：企业版含 MRB（物料评审委员会）多方签审流+报废成本按工单/BOM 归集到责任中心；轻量版单人审批+固定报废科目。

### D1d 8D 报告与 CAPA

**8D**（[Wikipedia: Eight disciplines problem solving](https://en.wikipedia.org/wiki/Eight_disciplines_problem_solving)，二级；Ford 1987 TOPS 手册起源）：
- D0 准备与应急响应（计划+先期遏制）；D1 组建团队（跨职能、产品/过程知识）；D2 描述问题（**5W2H** 量化）；D3 临时遏制计划（隔离问题不流向客户）；D4 确定并验证根本原因与逃逸点（**Is/Is Not 表、鱼骨图、5Why**）；D5 选择并验证永久纠正措施（预生产定量确认）；D6 实施纠正措施（**用经验证据验证有效性**）；D7 预防再发（修订管理体系/作业系统/流程）；D8 表彰贡献者（Congratulate the Main Contributors）。

**CAPA 双轨**（一级来源两处印证）：
- ERPNext [Quality Action](https://docs.frappe.io/erpnext/quality_action)：「A Quality Action is taken … to **correct** unsatisfactory results or **prevent** them」，字段 Action Type=Corrective/Preventive、Document Type（Review/Feedback）、**Resolution**、Status(Open/Closed)；配合 [Non Conformance](https://docs.frappe.io/erpnext/non-conformance)（NC 观察→记录纠正/预防措施→更新状态）；宣称覆盖 **GMP、ISO 9001/14001** 合规
- Odoo [Quality Alerts](https://www.odoo.com/documentation/17.0/applications/inventory_and_mrp/quality/quality_management/quality_alerts.html) 表单直接内建 **Corrective Actions 与 Preventive Actions 两个 Tab** + Root Cause 字段 + Kanban 阶段推进

闭环验证要点：纠正措施完成后必须「有效性验证」（D6 经验证据）才可关闭——8D D5/D6 与 CAPA 闭环同构。

**轻量版**：`qmCapa` 表（source: 检验单/NC 处置单/客户投诉、type: corrective|preventive、rootCause、containment、permanentAction、effectivenessCheck(验证人+日期+证据)、status: open→in_progress→pending_verify→closed）；8D 场景 mobile 用「8 步向导卡」逐步收集（AI 同事按 D1-D8 逐项追问）。**取舍**：企业版含 8D 报告导出 PDF（客户投诉食品客户常要）、FMEA 联动；轻量版 CAPA 表+可选 8D 模板字段组。

### D1e 供应商绩效评级

**标准做法**（[Wikipedia: Supplier evaluation](https://en.wikipedia.org/wiki/Supplier_evaluation)，二级）：
- 质量与交付是**普适评价因子**：「research by Valerie Stang Stueland, published in 2004 … **every example she reviewed used both quality and delivery as evaluation factors**」
- 结果导向：评分→进入 **ASL（Approved Supplier List 合格供方名录）**；「Once approved, a supplier may be **reevaluated on a periodic, often annual, basis**」
- Carter 10Cs 模型（Capacity/Competency/Commitment to Quality/Cost/…）用于准入评审
- SAP MM Vendor Evaluation（MM-PUR-VE）默认四维**质量 40% / 交付 30% / 价格 20% / 服务 10%**，质量含批合格率与投诉处理子项，交付含 OTD 与数量符合率子项——**行业惯例（未溯源）**（Bing/Mojeek 本组均不可用，未能取到 SAP help 原 URL；主任务可复核 help.sap.com）
- 计算式（通用惯例）：批合格率=合格批数/总检验批数；OTD-Supplier=准时到货批次/总批次；价格得分=（最低报价/本家报价）×100 或价格趋势；服务=响应及时性/配合度评分

**分级联动**（行业惯例）：季度加权总分 → A（≥90）/B（75-89）/C（60-74）/D（<60 淘汰观察）；A 类提高配额/优先付款，C 类限期整改+降配额，D 类冻结新单。

**轻量版**：`supScorecard` 物化表（按季度，cron 汇总）：quality（批合格率×40%）、delivery（OTD×30%）、price（比价指数×20%）、service（人工评分×10%）→ grade + 建议；mobile 卡片推送「Q3 供应商评级已生成，3 家降级待确认」。**取舍**：企业版含事件驱动扣分（单次批拒即扣）、审计追溯每笔得分明细；轻量版季度批处理+得分快照表（保留计算证据即可）。

---

## D2 库存实务深化

### D2a 移库/转储

**ERPNext Stock Entry Purpose 全枚举**（[Stock Entry](https://docs.frappe.io/erpnext/stock-entry) + [Stock Entry Purpose](https://docs.frappe.io/erpnext/stock-entry-purpose)，一级）：Material Issue（发料出库）/ Material Receipt（收料入库）/ **Material Transfer（库间调拨）** / Material Transfer for Manufacture（发料给产线，对 Work Order）/ Material Consumption for Manufacture / Manufacture（完工入库）/ Repack（改装）/ Send to Subcontractor。可自定义 Stock Entry Type（如 'Scrap Entry'，同 Material Transfer 语义但隔离权限）。

**在途转储（两步出+入）**（[How to Manage Material Transfers and Goods in Transit](https://docs.frappe.io/erpnext/how-to-manage-material-transfers-and-goods-in-transit)，一级）：Material Transfer 勾选 **Add to Transit** → 库存离开源库进入在途状态；收货方创建第二张 Material Transfer，引用 **Stock Entry (Outward GIT)** 字段回链出库单 → 库存进入目的库。「Use Goods in Transit only for warehouse-to-warehouse movement」；一步直接转=不勾 Add to Transit。三步含在途即「出库→GIT→入库」两单三态（行业惯例表述）。

**Odoo 对照**：仓间调拨由 Routes/Picking 两步（receipt→delivery）或一步完成（[Odoo 17 replenishment](https://www.odoo.com/documentation/17.0/applications/inventory_and_mrp/inventory/warehouses_storage/replenishment.html) 同域；详细两步/三步配置页未在本组取证，**行业惯例（未溯源）**）。

**轻量版**：复用已有 WMS 过账引擎，加 `stockTransfer` 单（steps: one_step|two_step）；two_step 时过账引擎生成「出库移动（源库→在途库）」+「入库移动（在途库→目的库）」两张，在途库=普通库位 flagged inTransit。**取舍**：企业版含在途库位自动对账+差异（短溢）处理单；轻量版在途差异走盘点调整。

### D2b 库存状态/批次属性

**Odoo Location Type 七类**（[Inventory management](https://www.odoo.com/documentation/17.0/applications/inventory_and_mrp/inventory/warehouses_storage/inventory_management.html)，一级）：Vendor（外部采购源）/ View（层级组织）/ **Internal（内部，计入存货估值）** / Customer（已售出）/ **Inventory Loss（差异与报废的对手库位：Inventory Adjustment + Scrap）**；文中列举 quality checkpoints 为内部库位实例（待检区）。

**状态驱动事件**（以库位承载状态的行业通用设计，库位证据一级、流转条件为行业惯例）：

| 状态 | 承载 | 转入事件 | 转出事件 |
|---|---|---|---|
| 待检 quarantine | WH/Quality 库位 | 采购收货（IQC 物料） | IQC 合格→Transfer 入合格库；不合格→NC 处置单 |
| 合格 unrestricted | WH/Stock | IQC 合格/让步接收 | 销售/领料出库 |
| 冻结 blocked | WH/Blocked 库位（或批次级 hold 标记） | IQC 不合格待处置/质量警报 | 处置四路终态 |
| 报废 scrap | WH/Scrap（Inventory Loss） | 处置单=报废 | 月结清零、成本已归集 |

ERPNext 侧等价机制：收货单 Inspection Required 卡点（提交前必须检验）+ Stock Entry 移库（一级，见 D2a/D1a 来源）。

**轻量版**：批次/库位双键上的 `status` 字段（quarantine|unrestricted|blocked|scrap）+ 过账引擎类型校验（FEFO 拣货只扫 unrestricted）；状态变更只允许由事件处理器触发（IQC 回写/处置单回写），杜绝手工改状态。**取舍**：企业版批次级+库位级双层状态（同批次在两库位可不同状态）+物料状态锁定（SAP MARC 等价）；轻量版库位级单层状态。

### D2c 库存预留

**ERPNext**（[Stock Reservation](https://docs.frappe.io/erpnext/stock-reservation) + [Stock Reservation for Work Order](https://docs.frappe.io/erpnext/stock-reservation-for-work-order)，一级）：
- v15 起 SO/Pick List 可 Reserve Stock（选仓库+数量生成 Stock Reservation Entry）；**Auto Reserve on Purchase**：采购收货提交瞬间自动为关联 SO 预留
- 解除：单据上 Unreserve 或取消 Reservation Entry（取消即释放）
- v16 WO 预留：工单提交时对源仓库可用库存自动建预留；「**The reserved stock can only be used for the respective work order**」（=hard allocation）；发料进 WIP 库时**预留从源库转移跟随到 WIP 库**；工单完工自动为关联 SO 预留成品

**Odoo**（[At confirmation reservation](https://www.odoo.com/documentation/17.0/applications/inventory_and_mrp/inventory/shipping_receiving/reservation_methods/at_confirmation.html) 等，一级）：Reservation Method 三选=**At Confirmation（确认即扣）/ Before Scheduled Date（提前 N 天）/ Manually**；预留可 Unreserve/重排优先级；**Forecasted = On Hand + Incoming − Outgoing**（官方公式，即 ATP 的「现有+在途−已承诺」）。

**预留消耗时机**：出库过账/领料过账时预留自动消耗（发货即转 issue）；取消订单/工单则解除（行业惯例+上引一级文档的 Unreserve 机制）。

**轻量版**：`stockReservation` 表（refType: SO|WO，item，batch，warehouse，qty，status: reserved|consumed|released）；ATP=qtyOnHand+qtyInTransit−qtyReserved（直接采用 Odoo 公式）；发料过账事务内预留行置 consumed。hard/soft：轻量版只做 hard（对 SO/WO 独占），soft（仅可用量扣减不锁批次）作为展示层「可用量」即可。**取舍**：企业版部分预留（批次部分锁定）、预留池共享/抢占策略、跨库调拨在途预留；轻量版整行预留+先到先得。

### D2d 盘点

**循环盘点**（[Wikipedia: Cycle count](https://en.wikipedia.org/wiki/Cycle_count)，二级）：perpetual 审计、不冻结全仓；选样方法：**ABC/Pareto（按价值或用量，高价值/高动碰频次高）**、usage-only（按动碰）、**SPC 法（盘点历史上不准确概率最高的品类）**、location audit（按库位）。ABC 频率「A 每月/B 每季/C 每半年」为通行排程（**行业惯例（未溯源）**）。

**定期冻结盘点**：期末 freeze→初盘→复盘→差异审批→调整过账（流程行业惯例）。**盘盈亏过账**：Odoo 以 **Virtual Locations/Inventory Adjustment（Inventory Loss 型库位）为对手方**——「database shows 65 units … an inventory check reveals 60. To correct, five units are moved from WH/Stock to Virtual Locations/Inventory Adjustment」（一级，前引 Inventory management）；即调整=一张指向差异库位的库存移动+差异科目（盘亏存货跌价损失/盘盈冲减），**不改历史移动**。

**轻量版**：`stockCount`（scope: cycle|full，status: draft→counting→recount→approving→posted）+ `stockCountLine`（systemQty、countedQty、diff）；差异审批通过→过账引擎生成 adjustment 移动（对手=库存差异虚拟库位）；cycle 盘点计划表按 ABC 分类（物料主数据 abcClass，从出库金额 cron 季度重算）。**取舍**：企业版含盲盘（countedQty 录入时隐藏账面数）、双人复核、移动平均/批次估值差异分摊；轻量版明盘+单人+整批次数量级调整。

### D2e 安全库存/再订货点

**公式**（一级/二级来源）：
- **ROP = 提前期平均日耗 × 提前期天数 + 安全库存**（[Wikipedia: Reorder point](https://en.wikipedia.org/wiki/Reorder_point)：「Reorder Point = Normal consumption during lead-time + Safety Stock」）
- **安全库存经典式**（[Wikipedia: Safety stock](https://en.wikipedia.org/wiki/Safety_stock)）：SS = z_α × √( E(L)·σ_D² + (E(D))²·σ_L² )（同时覆盖需求波动 σ_D 与提前期波动 σ_L；z=1.65 对应 95% 服务水平，z 值经 NORMSINV 求得）。**需求波动主导、提前期稳定的简化版**：SS = z × σ_D × √LT（用户给定简式，由完整式退化而来）。
- **Odoo 再订货规则**（[Replenishment](https://www.odoo.com/documentation/17.0/applications/inventory_and_mrp/inventory/warehouses_storage/replenishment.html)，一级）：reordering rule 设 **min（触发阈值）/max（补足目标）**；「When a product's stock falls at or below the minimum level, Odoo generates (or suggests) a purchase or manufacturing order to replenish stock to the maximum level」；**automatic 直接生成单据，manual 生成 replenishment report 建议**；备选策略 MTO（按单生产，SO 确认即生成且随预测自动加量）与 MPS（预测驱动看板；**不应与 reordering rules 并用**）
- **ERPNext**（[Item](https://docs.frappe.io/erpnext/item) 3.4 Automatic Reordering，一级）：Item 上配 Re-order Level / Re-order Qty / Check in（warehouse group）/ Request for（目标库）/ Material Request Type；「Reorder level can be determined based on the **lead time and the average daily consumption**」；触发=每日 0 点批量生成 Material Request 并通知采购/库存经理；Re-order Qty 按「订购成本+持有成本最小化」参考供应商最小起订量

**轻量版**：`itemReorder`（item、warehouse、min、max、leadTimeDays、avgDailyUse、safetyStock）；夜间 cron：qtyAvailable ≤ min → 生成补货建议（建议量=max−可用）；mobile 推送「低库存预警卡：面粉 A 低于 ROP(200kg)，建议补 500kg」一键转采购申请。**取舍**：企业版含 z 值按服务水平配置（95%/99%）、σ 用滚动 90 天日耗标准差自动重估、MRP 依赖展开（成品缺料反推原料）；轻量版 min/max 人工维护+平均日耗近 30 天均值。

---

## D3 真实数据看板（四类 KPI）

### D3a 经营/财务看板（简要）

| KPI | 公式 | 常见基准 |
|---|---|---|
| 收入 | 期间确认销售净额 | 环比增长（企业目标） |
| 毛利率 | (收入−COGS)/收入 | 食品制造 20-35%（**行业惯例（未溯源）**） |
| 回款率 | 期间实收金额/期间应收到期金额 | ≥95%（行业惯例） |

（公式为会计通识，来源以企业账务口径为准。）

### D3b 供应链看板

| KPI | 精确定义/公式 | 常见基准 |
|---|---|---|
| OTD / OTIF | 准时足量交付订单数/总应交付订单数（OTIF 要求 on-time 且 in-full 同单同时满足；变体加 condition-right） | OTD>95%、OTIF≥95%（行业惯例；食品快消要求更高） |
| 供应商准时到货率 OTD-S | 准时到货批次/总到货批次 | ≥95%（行业惯例） |
| 采购提前期 | PO 下达→收货过账天数（P50/P90 分布） | 按物料主数据提前期偏差 ±N 天（惯例） |
| 库存周转率 | **COGS/平均库存**（[Wikipedia: Inventory turnover](https://en.wikipedia.org/wiki/Inventory_turnover)：「cost of goods sold divided by the average inventory」；平均库存用月均更代表） | 食品 8-12 次/年（行业惯例） |
| 周转天数 DIO | 365/周转率（Wikipedia 同页：「average days to sell the inventory」） | 30-45 天（行业惯例） |
| 缺货率 | 缺货未履行行数/总需求行数（或缺货金额占比） | <1-2%（行业惯例） |
| 订单履约周期 | 客户下单→签收总时长（P50/P90） | 企业自定目标 |

### D3c 生产看板

| KPI | 精确定义/公式 | 常见基准 |
|---|---|---|
| OEE | **OEE = Availability × Performance × Quality**（[Wikipedia: OEE](https://en.wikipedia.org/wiki/Overall_equipment_effectiveness)：可用率=计划时间内实际可运行占比（纯停机损失）；性能率=实际速度/理论最大速度（含微停与降速）；质量率=良品数/总产数，即 FPY）。100%=只产良品×最大速度×无中断；源于 Nakajima 1982 TPM | 世界级 85%（Nakajima 基准，行业惯例）；典型 40-60% |
| 产能利用率 | 实际产量工时/可用产能工时（或实际产出/额定产能） | ≥80%（行业惯例） |
| FPY 一次合格率 | **无返工/返修一次通过的合格单位数/投产单位数**（[Wikipedia: First pass yield](https://en.wikipedia.org/wiki/First_pass_yield)：例 100 入、5 返工、90 良出 → FPY=(90−5)/100=85%；注意 FPY 单工序，RTY=∏FPYᵢ 连乘 0.85×0.889×0.8125×0.8267=50.75%） | ≥95-98%（行业惯例） |
| RTY 滚动合格率 | 各工序 FPY 连乘 | 按工艺链长度评估 |
| 计划达成率 | 按时完工工单数/计划工单数 | ≥95%（行业惯例） |
| 工单准交率 | 承诺交期内完工入库的工单/总工单 | ≥95%（行业惯例） |
| 稼动率 | 运行时间/日历（或负荷）时间 | ≥85%（行业惯例） |
| 批次合格率（食品） | 合格批次数/总生产批次数（含微生物判定） | ≥98%（行业惯例） |
| 微生物检验通过率 | 微生物指标合格批/送检批 | ≥99%（行业惯例） |
| 吨耗能耗（食品） | 水/电/汽消耗量/产量（吨） | 按产品基线环比 |

### D3d 库存看板

| KPI | 公义/公式 | 常见基准 |
|---|---|---|
| 库存周转天数 | 365/周转率（同 D3b） | 30-45 天（行业惯例） |
| 呆滞库存占比 | 无移动天数>90 天的库存金额/总库存金额 | <10%（行业惯例） |
| 临期库存预警 | 剩余效期<30 天批次数量/金额（FEFO 剩余效期=失效日期−今日，按批次） | 按保质期比例阈值（如剩余<1/3 保质期） |
| 账实相符率 | 1−Σ|盘点差异绝对值|/Σ账面数量（或差异批次占比） | ≥99.5%（行业惯例） |
| 库存资金占用 | Σ(批次数量×批次成本)，期末快照 | 结合周转天数监控 |

**轻量落地（四类看板统一方案）**：NocoBase `kpiSnapshot` 物化表——每晚 cron 按（看板类型、KPI 编码、维度键）重算并物化，全部公式固化在计算服务（与过账引擎同一事务源），mobile「驾驶舱」卡片只读物化表；临期预警用单独小时级 job 扫批次表（expiry_date−now<30d）推 mobile 消息。**取舍**：企业版实时流式（事件驱动增量重算）+下钻到单据；轻量版 T+1 快照+点击穿透到明细列表即可满足中小食品厂。

---

## 来源清单

| # | 标题 | URL | 级别 |
|---|---|---|---|
| 1 | ERPNext Quality Inspection | https://docs.frappe.io/erpnext/quality-inspection | 一级（官方文档） |
| 2 | ERPNext Stock Inspection | https://docs.frappe.io/erpnext/stock-inspection | 一级 |
| 3 | ERPNext Quality Action | https://docs.frappe.io/erpnext/quality_action | 一级 |
| 4 | ERPNext Non Conformance | https://docs.frappe.io/erpnext/non-conformance | 一级 |
| 5 | ERPNext Stock Entry / Purpose / GIT | https://docs.frappe.io/erpnext/stock-entry 、/stock-entry-purpose 、/how-to-manage-material-transfers-and-goods-in-transit | 一级 |
| 6 | ERPNext Stock Reservation（v15/v16） | https://docs.frappe.io/erpnext/stock-reservation 、/stock-reservation-for-work-order | 一级 |
| 7 | ERPNext Item §3.4 Automatic Reordering | https://docs.frappe.io/erpnext/item | 一级 |
| 8 | Odoo 17 Quality Checks / Control Points / Alerts | https://www.odoo.com/documentation/17.0/applications/inventory_and_mrp/quality/quality_management/*.html | 一级 |
| 9 | Odoo 17 Inventory: Location types | https://www.odoo.com/documentation/17.0/applications/inventory_and_mrp/inventory/warehouses_storage/inventory_management.html | 一级 |
| 10 | Odoo 17 Replenishment（ROP/MTO/MPS） | https://www.odoo.com/documentation/17.0/applications/inventory_and_mrp/inventory/warehouses_storage/replenishment.html | 一级 |
| 11 | Odoo 17 At-confirmation reservation（Forecasted 公式） | https://www.odoo.com/documentation/17.0/applications/inventory_and_mrp/inventory/shipping_receiving/reservation_methods/at_confirmation.html | 一级 |
| 12 | SQC Online MIL-STD-105E/ANSI Z1.4 计算器+切换规则（实跑） | https://www.sqconline.com/military-standard-105e-tables-sampling-attributes 、/switching-rules-mil-std-105e-z14 、/sampling-attributes-plan | 二级（标准实现工具） |
| 13 | Wikipedia: Acceptance sampling / Acceptable quality limit | https://en.wikipedia.org/wiki/Acceptance_sampling 、/Acceptable_quality_limit | 二级 |
| 14 | Wikipedia: Eight disciplines / Supplier evaluation / Cycle count / Reorder point / Safety stock / First pass yield / OEE / Inventory turnover | https://en.wikipedia.org/wiki/... | 二级 |

## 方法论与限制

- DuckDuckGo 被网络层拦截（主任务已验证）；本组标签页 Bing 会话持续异常（污染结果/假空结果/Visual Search 卡死，重试 3 次+参数变体无效），Mojeek 触发 Captcha。改用：目标文档站直读 + 站内同源 fetch 批量抓取（效率高于逐页导航）+ SQC Online 表单 POST 实跑 AQL 判定数组。
- SAP MM vendor evaluation 默认权重（40/30/20/10）与多数 KPI 基准值未能取到可引用 URL，均按约定标注「行业惯例（未溯源）」。
- 检验范围：ERPNext 文档为 develop 版（v15/v16 特性已分注）；Odoo 为 17.0。
