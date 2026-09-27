# B组调研报告：无商业工作流引擎的审批流标准设计 + 供应商全生命周期管理

> 研究日期：2026-09-25 | 来源：15 个来源（11 一级 + 2 二级 + 2 未溯源标注）| 深度：Thorough
> 背景：食品行业 KB+agent 订阅产品（NocoBase 开源版 + mobile 对话卡），为 SRM/WMS 补审批与供应商生命周期设计依据

---

## B1. 无商业工作流引擎的审批流标准设计

### B1a. 数据层模型：三张配置表 + 两张运行时表（ERPNext 范式）

ERPNext/Frappe 的 Workflow 是纯数据表驱动的状态机（无代码），是开源世界最直接的参照。以下字段全部来自 frappe/frappe 源码中 doctype JSON 的逐字段核实。

**① Workflow 主表（审批流配置，一单据类型一条激活配置）**

| 字段 | 类型 | 说明 |
|---|---|---|
| workflow_name | Data (reqd) | 流程名 |
| document_type | Link→DocType (reqd) | 适用的单据类型 |
| is_active | Check | 激活；勾选后同 DocType 其他 Workflow 全部失效（互斥） |
| override_status / send_email_alert | Check | 是否覆盖列表状态显示 / 进入待办状态时给下一审批人发邮件 |
| states | Table→Workflow Document State | 状态子表 |
| transitions | Table→Workflow Transition | 流转规则子表 |
| workflow_state_field | Data (reqd) | 回写到单据上的状态字段名（自动在单据上建该自定义字段） |

（来源：[Workflow doctype JSON](https://raw.githubusercontent.com/frappe/frappe/develop/frappe/workflow/doctype/workflow/workflow.json)，一级）

**② Workflow Document State（状态节点表）**

| 字段 | 类型 | 说明 |
|---|---|---|
| state | Link→Workflow State (reqd) | 状态名主数据（Approved/Rejected 等） |
| doc_status | Select 0/1/2 | 映射单据持久状态：0=Saved(草稿)、1=Submitted(生效)、2=Cancelled ——「生效」的官方锚点 |
| update_field / update_value | Data | 进入该状态时把单据某字段改写为指定值（如 status→Approved） |
| allow_edit | Link→Role (reqd) | 该状态下允许编辑单据的角色 —— 字段锁定的实现基础 |
| message / next_action_email_template | Text/Link | 进入状态的提示语与邮件模板 |
| is_optional_state | Check | 可选状态（如 Rejected/Cancelled），不产生 Workflow Action 待办 |
| avoid_status_override / send_email | Check | 不覆盖列表视图状态 / 是否发邮件 |

（来源：[Workflow Document State JSON](https://raw.githubusercontent.com/frappe/frappe/develop/frappe/workflow/doctype/workflow_document_state/workflow_document_state.json)，一级）

**③ Workflow Transition（流转规则表 = 状态×动作×条件×角色）**

| 字段 | 类型 | 说明 |
|---|---|---|
| state | Link→Workflow State (reqd) | 当前状态 |
| action | Link→Workflow Action Master (reqd) | 动作主数据（Approve/Reject 可自定义） |
| next_state | Link→Workflow State (reqd) | 目标状态 |
| allowed | Link→Role (reqd) | 允许执行本转移的角色 —— 审批人解析按角色而非具体人 |
| allow_self_approval | Check | 是否允许提交人自审自批（SOX 式控制点） |
| condition | Code(Python) | 条件表达式，官方示例 `doc.grand_total <= 100000` —— 金额阈值路由的直接实现 |
| send_email_to_creator | Check | 动作后通知创建人 |

（来源：[Workflow Transition JSON](https://raw.githubusercontent.com/frappe/frappe/develop/frappe/workflow/doctype/workflow_transition/workflow_transition.json)，一级；condition 语义见 [ERPNext Workflows 文档](https://docs.frappe.io/erpnext/workflows)，一级）

**④ 运行时表 Workflow Action（待办队列）**：`status`(Open/Completed)、`reference_doctype`+`reference_name`(Dynamic Link 指向被审单据)、`user`(待办人)、`workflow_state`(当前所在状态)、`completed_by`/`completed_by_role`(实际处理人与角色)。（来源：[Workflow Action JSON](https://raw.githubusercontent.com/frappe/frappe/develop/frappe/workflow/doctype/workflow_action/workflow_action.json)，一级；[Workflow Actions 文档](https://docs.frappe.io/erpnext/workflow-actions)，一级）

**⑤ 审批历史**：ERPNext 没有独立"审批记录表"，审计链路 = 单据 Version（字段版本快照）+ Communication/chatter 流水。Odoo 同理用 chatter log（"the chatter logs the history of the clicked buttons"，[Odoo PLM Approvals](https://www.odoo.com/documentation/17.0/applications/inventory_and_mrp/plm/management/approvals.html)，一级）。

**Odoo 侧参照（阶段挂审批人 m2o 链）**：Odoo 开源版 PLM 在 ECO 的 stage 上配 Approvals 子表：`Role`(职位名如 Engineering Manager) + `User`(具体人) + `Approval Type` 三值枚举——`Is required to approve`(必须签) / `Approves, but the approval is optional`(可签不阻塞) / `Comments only`(仅评论)。（来源：[Odoo 17 PLM Approvals](https://www.odoo.com/documentation/17.0/applications/inventory_and_mrp/plm/management/approvals.html)，一级）

**NocoBase 落地表设计（建议）**：`approval_flow_config`(doc_type, condition_expr, is_active, 状态子表, 转移子表) + `approval_node`(state, doc_status, allow_edit_role, update_field/value) + `approval_transition`(state, action, next_state, allowed_role, condition, allow_self_approval) + `approval_record`(单据ID, node_seq, approver_user, action: approve|reject|delegate|comment, comment, acted_at) + `approval_todo`(doc_ref, user, state, status)。

### B1b. 多级审批模式：顺序 / 会签 / 或签 + 金额阈值路由

Microsoft Power Automate 给出了五类审批的官方语义定义（可作为模式命名的权威参照）：

| 审批类型 | 官方语义 |
|---|---|
| Approve/Reject - Everyone must approve（会签） | 每个审批人都需回应；任一 reject 即终止，全部回应后才继续 |
| Approve/Reject - First to respond（或签） | 任一审批人 approve 或 reject 即完成 |
| Custom Responses - Wait for all responses | 自定义选项，全员回应 |
| Custom Responses - Wait for one response | 自定义选项，一人回应 |
| Sequential approval（顺序） | 按序列一次请求一人，每人回应后才到下一个 |

（来源：[Get started with Power Automate approvals](https://learn.microsoft.com/en-us/power-automate/get-started-approvals)，一级）

**金额阈值路由的两个一级实现**：
- ERPNext：transition 的 `condition` 写 Python 表达式（官方示例 `doc.grand_total <= 100000` 决定该级审批是否适用；v13+ 支持 frappe.db.get_value/session/日期函数），即「>10万加一级总经理」= 在 transitions 里为经理级节点配 `doc.grand_total <= 100000` 条件、总经理节点不配（或反向）。（[ERPNext Workflows](https://docs.frappe.io/erpnext/workflows)，一级）
- Odoo：公司级 `po_double_validation`（Selection: `one_step`/`two_step`）+ `po_double_validation_amount`(Monetary, "Minimum Amount")；`button_confirm()` 中 `if order._approval_allowed(): order.button_approve() else: order.write({'state': 'to approve'})` ——低于阈值自动通过，高于阈值进「To Approve」待审。（[res_config_settings.py](https://raw.githubusercontent.com/odoo/odoo/17.0/addons/purchase/models/res_config_settings.py)、[purchase_order.py](https://raw.githubusercontent.com/odoo/odoo/17.0/addons/purchase/models/purchase_order.py)，一级）

### B1c. 委托/代理审批（出差委托）

ERPNext Workflow 与 Odoo 开源版均无内建委托审批（本组核实文档无此功能项）；SAP 有 workflow substitution rule（用户级代理+生效期），具体字段未能从可达渠道溯源——**行业惯例（未溯源）**。标准实现模式（综合惯例）：`delegation` 表 `(delegator, delegate, valid_from, valid_to, doc_type_scope, reason, status)`，审批人解析函数在生成待办时查 `today BETWEEN valid_from AND valid_to AND status='active'` 则把 `approver_user` 替换为 delegate，审批记录同时记 delegator 与 delegate（审计留痕：action 仍归原审批人权限链）。按角色（ERPNext `allowed`=Role）解析审批人的架构里，委托也可落在"用户-角色临时授权"层。

### B1d. 驳回重提语义：整链重走 vs 从驳回节点续走

- **从驳回节点续走（回退一步）的官方实例**：Odoo PLM——驳回后创建 follow-up activity（Assigned to + Due Date + Summary 说明修改要求），责任人修改后"move the ECO back one stage"，再推进回验证阶段时自动生成新的审批任务；被拒 ECO 标红色 **Blocked** 状态。（[Odoo PLM Approvals](https://www.odoo.com/documentation/17.0/applications/inventory_and_mrp/plm/management/approvals.html)，一级）
- **整链重走（回提交人）**：ERPNext 里 Reject 是普通 transition，可配 `Rejected → next_state=Draft`，由提交人改后重新逐级提交；ERPNext 文档示例的 reject 即回到低状态。两种模式在同一引擎里都可通过 transition 配置表达——取舍属于流程设计而非引擎能力。
- **取舍依据（综合两源语义）**：金额/条款类修改（改了就要重新全员背书）→ 整链重走；材料补充类（仅驳回节点关心）→ 续走。驳回意见必填在两者中都是硬约束（Odoo 驳回必须建 activity 写 Summary；ERPNext 驳回是带 message 的状态）。续走模式需在 approval_record 上保留 `attempt_no`（第几次提交）以区分轮次——**行业惯例（未溯源）**。

### B1e. 「未生效不得驱动下游」卡口

四个一级证据拼出完整卡口模式：
1. **状态锚点**：ERPNext `doc_status` 0/1/2（Saved/Submitted/Cancelled）挂接在每个 workflow state 上；且「A document cannot be canceled unless it is submitted」——未生效单据连取消都不行。（[ERPNext Workflows](https://docs.frappe.io/erpnext/workflows)，一级）
2. **生效时锁定**：state 的 `allow_edit`(Role) 控制谁能改单据（只读=锁定关键字段）；`update_field/update_value` 在进入生效态时回写业务状态字段。（[Workflow Document State JSON](https://raw.githubusercontent.com/frappe/frappe/develop/frappe/workflow/doctype/workflow_document_state/workflow_document_state.json)，一级）；Odoo 侧 `po_lock='lock'`（Lock Confirmed Orders，确认后锁定 PO）。（[res_config_settings.py](https://raw.githubusercontent.com/odoo/odoo/17.0/addons/purchase/models/res_config_settings.py)，一级）
3. **生效前置校验**：Odoo PLM「Apply Changes 按钮在 Approve 点击前不可用」——变更应用以审批通过为前置。（[Odoo PLM Approvals](https://www.odoo.com/documentation/17.0/applications/inventory_and_mrp/plm/management/approvals.html)，一级）
4. **下游反查（取消拦截）**：Odoo `button_cancel` 遍历 `order.invoice_ids`，存在非 cancel/draft 状态账单即 `raise UserError`——取消上游前检查下游状态。（[purchase_order.py](https://raw.githubusercontent.com/odoo/odoo/17.0/addons/purchase/models/purchase_order.py)，一级）
5. **下游创建前置（发票三单匹配方向）**：ERPNext Buying Settings 可全局强制「Purchase Order Required / Purchase Receipt Required」才能开票，且支持供应商级例外开关（Allow PI Creation Without PO）。（[ERPNext Supplier 文档](https://docs.frappe.io/erpnext/supplier)，一级）

**统一模式**：下游单据创建钩子校验 `source_doc.doc_status == 1`（或 Odoo `state == 'purchase'/'done'`）；生效瞬间执行：锁定字段（allow_edit 收窄/ po_lock）、回写状态字段（update_field）、触发下游预留（Odoo confirm 后自动 reserve、生成收货单——行为级，未单独溯源）。

### B1f. 超时催办 / 加签的轻量实现

- **Odoo 模式**：进入验证阶段自动为审批人创建 planned activity（含 Created date/Assigned to/Due date），待办栏按 **Late/Today/Future** 分组计数——催办的官方轻量形态。（[Odoo PLM Approvals](https://www.odoo.com/documentation/17.0/applications/inventory_and_mrp/plm/management/approvals.html)，一级）
- **ERPNext Assignment Rule 模式**：条件（Python 表达式如 `issue_type == "Technical" and priority == "High" and status == "Open"`）+ 分派策略（Round Robin 轮询 / Load Balancing 最少任务 / Based on Field 按字段定人）+ **Due Date Based On**（基于单据日期字段自动设到期日且随源字段联动更新）+ Priority 决定多规则次序。（[ERPNext Assignment Rule](https://docs.frappe.io/erpnext/assignment-rule)，一级）
- **加签**（前加签/后加签/并加签）：钉钉/飞书语义，开源 ERP 均无内建——**行业惯例（未溯源）**。轻量实现：加签=在 approval_record 插入新节点行（前加签 node_seq 前移、后加签追加），不改 flow_config（配置与实例分离）。

**轻量版 vs 企业完整版（B1 总）**：轻量版保留——三张配置表+审批记录表+待办表、金额阈值 condition、顺序+会签+或签三模式、驳回必填意见、doc_status 三态卡口、due date 催办；简化——审批人只按角色解析（不做组织架构逐级汇报链推导）、委托只做用户级换人（不做规则型代理树）；舍弃——图形化流程设计器（表格配置足够）、并行分支/条件网关聚合语义（数据表条件 + 多 transition 已可表达）、SLA 分级 escalation 链（只做一层超时重提醒）。

---

## B2. 供应商全生命周期管理

### B2a. 阶段模型与状态机

通用模型（二级来源+ERPNext字段证据综合）：**注册 → 准入审核（pre-qualification）→ AVL → 分级分类 → 日常绩效 → 整改 → 冻结 → 淘汰/复活**。

- 供应商评估的学界/业界定位：evaluation 是"定量评估+批准潜在供应商"的持续过程，构成采购流程的 **pre-qualification 步骤**；经典框架 Carter 10Cs（Commitment to Quality、Cost、Capacity、Consistency…十维）。（[Wikipedia: Supplier evaluation](https://en.wikipedia.org/wiki/Supplier_evaluation)，二级）
- ERPNext Supplier 主数据的状态类字段（可直接映射生命周期）：
  - `supplier_group`（分类维度：Pharmaceutical/Hardware 等，即物料类别×供应商分组）
  - **Block Supplier**：Hold Type（invoices / payments / All）+ **till specific date**（冻结到指定日），冻结时状态显示 'On Hold' —— 阶段性冻结+自动到期
  - **Is Frozen**：冻结该供应商全部会计分录，仅 Buying Settings 里指定的角色可越过 —— 冻结+角色豁免
  - `Disabled`：停用后从 Supplier 列表隐藏 —— 淘汰/停用
  - **Prevent RFQs, POs / Warn RFQs, POs**：建了 Supplier Scorecard 后按绩效档位对询价/下单做硬拦/软警 —— 绩效→交易权限联动
  （来源：[ERPNext Supplier](https://docs.frappe.io/erpnext/supplier)，一级）
- 食品行业证书清单（准入资质文件）：营业执照、食品生产许可证 SC（中国监管，**行业惯例，未溯源到可达官方页面**）、ISO 22000（食品安全管理体系，覆盖食品链全部环节：farming/processing/manufacturing/catering/storage/distribution，整合 HACCP 原则与 PRP；FSSC 22000 是其上 GFSI 认可方案）、HACCP、型式检验报告。**包材供应商**同样需食品级认证：ISO/TS 22002 系列按 Part 1(食品制造)/Part 4(食品包材制造) 分部。（[Wikipedia: ISO 22000](https://en.wikipedia.org/wiki/ISO_22000)，二级）

**NocoBase 落地**：`supplier`(name, supplier_group, lifecycle_status: registered|under_review|approved|frozen|disabled|terminated, grade: A|B|C, is_critical_material) + `supplier_certificate`(cert_type, cert_no, issuer, issue_date, expiry_date, file_attachment, status: valid|expiring|expired) + `supplier_review`(review_type: document|onsite|sample, checklist结果, conclusion, reviewer, date)。

### B2b. 证书效期管理：预警 + 到期自动冻结

ERPNext Block Supplier 的「till specific date」提供了**按日期自动解除/生效冻结**的官方语义；到期自动拦截交易的组合 = 证书 expiry_date 与 PO 校验联查（开源 ERP 无内建证书效期模块，属自建规则）。预警提前量 30/60/90 天、到期自动置 `frozen` 并在 PO 卡口拦截——**行业惯例（未溯源）**；实现上等价于把 ERPNext「Hold till date」的日期来源换成证书 expiry_date。

### B2c. PO 下单准入校验

标准规则（综合）：`供应商 ∈ AVL（lifecycle_status='approved'）AND 未冻结 AND 全部强制证书 valid（today ≤ expiry_date）`。一级证据支撑的拦截模式：
- ERPNext：scorecard standing 触发 **Prevent RFQs/POs**（硬拦）或 **Warn RFQs/POs**（软警）——拦截点在询价与下单两个入口。（[ERPNext Supplier](https://docs.frappe.io/erpnext/supplier)，一级）
- Odoo 开源版无内建 AVL 强制（product.supplierinfo 只是价格/供货信息，非准入控制）——**事实性陈述（Odoo17 purchase 文档无此功能项）**；SAP 的 Source List（EORD）支持固定供应商/封锁供应商——**行业惯例（未溯源）**。
- 替代/紧急采购特批路径：ERPNext 的角色豁免模式（Is Frozen 仅指定角色可越过）是轻量解——紧急采购走「冻结豁免标记 + 更高审批级 + 事后 CAPA」三件套（**行业惯例，未溯源**）。

### B2d. 绩效 → 分级联动

ERPNext Supplier Scorecard 一级证据（字段级）：
- 每 supplier 恰一张 scorecard；评估周期 weekly/monthly/yearly，按周期（Scorecard Period）生成评估，按钮 "Generate Missing Scorecard Periods"
- **Criteria**：多项准则加权，**权重合计必须=100**；准则公式（Criteria Formula）用预置变量计算：`total items received / accepted / rejected、deliveries 数、金额` 等；公式语言支持 `+ - * / min() max() if/else 比较`，官方强调除零防护（无收货期 0/0 需 if 保护）
- **Scoring Standings（档位表）**：按分数定义档位（如 A/B/C），**档位可直接配置「限制进入 RFQ / 限制开 PO」** —— 绩效→分级→交易权限的闭环官方实现
- 当前分 = 各周期分按权重函数（默认 linear）汇总
（来源：[ERPNext Supplier Scorecard](https://docs.frappe.io/erpnext/supplier-scorecard)，一级）

SAP MM 自动供应商评估的四维主标准（价格/质量/交付/服务加权）是广泛记载的行业框架，但其**标准权重数值未能从本轮可达渠道溯源**——框架采用、数值标注**行业惯例（未溯源）**。年度评审重新定级、C 级限制新单：以 ERPNext standing→Prevent PO 的机制表达即可（C 档=prevent 新 PO、允许结清在途）——组合式设计（**行业惯例**）。

**轻量版 vs 企业完整版（B2 总）**：轻量版保留——lifecycle_status 状态机（6 态）、证书表+效期字段、PO 卡口四联查（AVL/状态/证书/冻结）、scorecard 的 criteria 权重和=100 + standing 分档 + prevent PO 联动、冻结带到期日；简化——审核 checklist 用一张 JSON 字段表而非动态表单引擎、绩效变量只取 4 个（准时交付率/合格率/拒收数/价格指数）；舍弃——现场审核排程、供应商门户自助申报、多公司隔离视图。

---

## 来源清单

| # | 标题 | URL | 级别 |
|---|---|---|---|
| 1 | ERPNext Workflows（用户手册） | https://docs.frappe.io/erpnext/workflows | 一级 |
| 2 | ERPNext Workflow Actions | https://docs.frappe.io/erpnext/workflow-actions | 一级 |
| 3 | Frappe Workflow doctype JSON | https://raw.githubusercontent.com/frappe/frappe/develop/frappe/workflow/doctype/workflow/workflow.json | 一级（源码） |
| 4 | Workflow Document State JSON | https://raw.githubusercontent.com/frappe/frappe/develop/frappe/workflow/doctype/workflow_document_state/workflow_document_state.json | 一级（源码） |
| 5 | Workflow Transition JSON | https://raw.githubusercontent.com/frappe/frappe/develop/frappe/workflow/doctype/workflow_transition/workflow_transition.json | 一级（源码） |
| 6 | Workflow Action JSON | https://raw.githubusercontent.com/frappe/frappe/develop/frappe/workflow/doctype/workflow_action/workflow_action.json | 一级（源码） |
| 7 | Odoo 17 PLM — Approvals | https://www.odoo.com/documentation/17.0/applications/inventory_and_mrp/plm/management/approvals.html | 一级 |
| 8 | Odoo 17 purchase res_config_settings.py | https://raw.githubusercontent.com/odoo/odoo/17.0/addons/purchase/models/res_config_settings.py | 一级（源码） |
| 9 | Odoo 17 purchase_order.py | https://raw.githubusercontent.com/odoo/odoo/17.0/addons/purchase/models/purchase_order.py | 一级（源码） |
| 10 | Power Automate approvals（审批类型官方语义） | https://learn.microsoft.com/en-us/power-automate/get-started-approvals | 一级 |
| 11 | ERPNext Supplier | https://docs.frappe.io/erpnext/supplier | 一级 |
| 12 | ERPNext Supplier Scorecard | https://docs.frappe.io/erpnext/supplier-scorecard | 一级 |
| 13 | ERPNext Assignment Rule | https://docs.frappe.io/erpnext/assignment-rule | 一级 |
| 14 | Wikipedia: Supplier evaluation | https://en.wikipedia.org/wiki/Supplier_evaluation | 二级 |
| 15 | Wikipedia: ISO 22000 | https://en.wikipedia.org/wiki/ISO_22000 | 二级 |

未溯源标注项：SAP MM vendor evaluation 权重数值、SAP Source List(EORD) 细节、SAP substitution rule 字段、委托审批实现、加签、证书预警天数、C 级限单细则、SC 许可监管原文。

## 方法论

Bing 发现 + 直接 URL/源码直读（Bing 端点在并行子任务下间歇性限流，转向 raw.githubusercontent.com 与文档站确定路径直读）；raw GitHub 一级源码核实到字段级；Microsoft Learn/Wikipedia 为补充语义与行业框架。单页提取上限 15000 字符，已过滤广告与导航噪声。
