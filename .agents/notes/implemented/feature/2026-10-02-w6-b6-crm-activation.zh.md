# Agent Note: Agent Note：W6-B6 CRM 激活——商机管道 Kanban、客户 360、报价转单，与 B5 修复债清偿

Status: implemented

[English](2026-10-02-w6-b6-crm-activation.md) | 中文

状态：已实现

- **日期**：2026-10-02
- **范围**：`examples/kb-agent/crm/`（新引擎内嵌 SPA）、`approval-engine.mts` 的 `/crm/*` 路由、`w6b6-crm.mts` seed/assert/cleanup、增列 + `crm_stage_audit`、v2 页「商机管道」，以及 `insp/` 与 `w6b2-rules.mts` 的 B5 修复债六项。

## Problem

crm_* 表是 n13 死行：没有商机管道、没有客户 360、报价不是单据。

## 落地内容

### 1. 商机管道 Kanban（CRM 域第一个非表格形态）
- 阶段词汇 = 库上 `crm_deals.stage` 枚举原样（inquiry 10% → quote 40% → negotiation 70% → won 100% / lost 0%），唯一定义在 `crm/src/server.ts` 的 `PIPE_STAGES`。
- `/crm/pipe.json` 一次读出卡片 + 每列 `count`/`amount_sum`/`weighted`（与卡片同一行集计算，看板不会自相矛盾）；`weighted_total` 只对三个在途阶段求和（赢单/输单是历史，不是预测）。
- 拖拽写回 `POST /crm/move`：条件 UPDATE（`WHERE stage = from`）作并发闸，概率与状态（won→fulfilled+closed_date / lost→cancelled+closed_date / 在途→pending 并清 closed_date）随行落库，`crm_stage_audit` 记 actor/from/to/probability/amount/moved_at。审计表同时是卡片「滞留 N 天」的锚（无锚不显示，不编造）。
- 新增列 `crm_deals.probability`（整数百分比，按阶段映射一次性回填）；索引 `ix_crm_stage_audit_deal`。

### 2. 客户 360（聚合视图，非表格堆砌）
- `/crm/customer.json?id=`：档案 + 计数 + 应收余额（逐字复用 `ar_overdue` 规则的余额子查询：`approved so_orders.amount − Σ 该单 received crm_payments`）+ 订单/报价/商机列表 + 四类节点时间线（报价 issue_date → 订单交期 need_date → 发货 shipped_at → 收款 paid_at），按日期倒序。时间线只锚真实日期列；无日期的行不进时间线。

### 3. 报价转销售订单（服务端发号 + 幂等）
- `POST /crm/quote-to-so`：按数字尾号铸 `SO-YYYY-NNNN`，带客户/商机，金额 = 有产品行时 Σ数量×单价（否则报价总额），落 `so_orders` 草稿 + `so_order_lines`，再 CAS 占用报价（`converted_so_code` 空 ∧ status≠converted → `converted` + 单号回写）。重放/竞态转单被拒并回显已转单号，回滚刚插的订单；部分唯一索引 `ux_crm_quotes_converted` 是库侧兜底。
- 引擎路由在流程已配置时（so_orders 流 id 10 在册）随即 `submitForApproval`；提交失败保留草稿并说明原因。演练不审批，不触发 `reserveForSo` 副作用。

### 4. 身份围栏 + NocoBase 铺页
- `/crm` 写操作围栏 销售部 + admin/nocobase（root）；读需任意平台会话；actor 恒为会话推导（`recallActor`）。SPA 复用 `/terminal/session`（insp 工作台同款）。
- 销售管理组下一张 v2 页「商机管道」（IframeBlockModel → 引擎 `/crm`，B5 内嵌姿态），由 `w6b6-crm.mts` 幂等铺页。

### 5. B5 修复债清偿（全部 1–3 行级，逐项带断言）
1. `inspReport` 单项判定列：psql 的 `boolean::text` 渲染为 `true`/`false`——按此精确比较（原比 `'t'`/`'f'` 恒 `—`）。`w6b5-insp --assert` 冒烟：首行判定与 pass 语义一致。
2. 审核人：渲染改按 `inspection_code` 从 `qm_factory_reports` 档案行回读（签名行按 label 取，弃 `elements[8]` 位序假设），签发补回填 UPDATE。断言：已签发报告 reviewer 非空且渲染=档案。
3. `inspection_fail` 命中放宽为 `result IN ('failed','concession')`——特采重标不再让 vanish-resolve 以 `resolved_by='system'` 自动关 critical 预警（与规则自身注释相反）；只有人工关闭才 resolved。断言进 `w6b6-crm --assert` 与 `w6b2-rules --assert` 回归。
4. failed 结果页不渲染报告入口（按钮与 hint 双闸；服务端 `report_hint` 对 failed OQC 同样为 null）。浏览器腿在新鲜 failed 判定上断言。
5. `openWizard` 顶部重置四个处置模块级全局量（理由/动作/让步说明/审批人）——B 单向导不再继承 A 单处置状态；重开同样干净。
6. 队列新增「已完成」tab（已判定尾部 30 行 + 报告编号徽标）——quality_lead 历史补签入口（failed 仅可预览；服务端签发围栏仍是权威闸）。
7. `w6b2-rules`：`RULE_TYPE_OPTIONS` 与两处 `rule_type` 字段枚举补全六路（+ccp_deviation/inspection_fail），新增幂等 `patchRuleTypeSurface` 原地升级已存在的预警列表页（fields 表枚举、活列与芯片 options、补两张按规则统计卡——追加位序，视觉排序归 B2/B10）。

## 证据（demos/acceptance-w6/）
`gates-b6.log`（typecheck / oxlint staged 0-0 / 断言腿 如实）、`w6-b6-assert.log`（32/32）、`w6-b6-shot-meta.json`（29/29 allGreen）、`w6-b6-01..04*` 截图与 psql 对账（看板渲染+XSS 惰性、拖拽写回、360 时间线 dom=psql=13、转单 SO-2026-0094 + 重放拒绝、no-token 401 / buyer 403）、`w6-b6fix-01..06*`（judged 列、reviewer 对账、让步预警在册、failed 无报告入口、A/B 向导不泄漏、已完成 tab + 补签入口）、`w6-b6fix-b5reassert.log`（16/16）、`w6-b6fix-b2reassert.log`。

## 已知边界 / 交接
- `crm_quotes` 在 G 轮 schema 中是表头单据（无报价行项目表）；转单因此按表头映射客户/金额/日期，产品行来自对话框（对 `hub_inv_products` 校验）。报价完整单据化（行编辑 + PDF）仍是计划 B6⑤/n17 治理范畴，不在本批。
- 演练行 W6B6 前缀可清理：`w6b6-crm.mts --cleanup` 清 SO/行/审批尾迹/审计/行；`QI-W6B5-B6FIX` 归既有 `w6b5-insp --cleanup`（QI-W6B5-* 前缀）。
- 新增两张统计卡追加在原四张之后（位序按批指令刻意留给 B10）。
- psql 对 `INSERT … RETURNING` 的 stdout 是 id 行 + `INSERT 0 1` 命令标签——id 取首行，绝不能整缓冲 Number()（实战踩过一次；解析器现取第 0 行并 fail-loud）。

## Alternatives considered

- **重铺 n13 死页 vs 引擎工作台+平台页双面**——选双面：拖拽/加权在引擎，检索在平台。

## Consequences

成本：CRM 要学两个面。买到：死表激活，加权管道可对账，报价→SO 转单闭环。
