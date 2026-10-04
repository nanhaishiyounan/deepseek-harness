# Agent Note: W6-B7 SCM 供应链 — 三维比价矩阵 + 评分卡联动准入 + 定标 CAS + 采购域页面重构

Status: implemented

[English](2026-10-02-w6-b7-scm-bid-matrix.md) | 中文

- **日期**: 2026-10-02
- **范围**: `w6b7-sourcing.mts` + `w6b7-verify.mts` + `w6b7-blocks.mts`（新增）、`approval-engine.mts` 的 `/sourcing/*` 路由、`pur_sourcing_config` 集合、比价表/采购订单两个 JSBlock、发票匹配/付款申请两张真图表、`w6-b7-shoot.mjs` CDP 取证。

## Problem

比价页近乎死表：没有分组矩阵、没有逐行定标、没有价格/交期/质量三维定标、没有准入联动。

## 落地内容

### 1. 三维计分内核（单一计算源）
- `computeSourcingMatrix`（w6b7-sourcing.mts）按 RFQ×物料组对 submitted 报价计分：价格分=最低价/本价×100，交期分=最短交期/本交期×100，质量分=供应商最新一期 `srm_score_cards.score_quality`（period 降序、id 降序——同一期可能有多行，id 17 盖过 id 8 取到 D 级）。无评分卡时质量维剔除、剩余权重归一；每行携带完整算式串——UI、引擎、demo 腿里的 psql 手算三方同一份算术。
- 准入围栏：生命周期 frozen/eliminated/黑名单或评级 ∈ preventRatings ⇒ prevent（Choose 按钮渲染为禁用）；restricted 或评级 ∈ warnRatings ⇒ warn（同分时 warn 行后置排名——计划的 warn 降序规则）。两个评级集合都是 `pur_sourcing_config` 里的行，不是代码常量。

### 2. 权重是配置行，不是硬编码 tunable
- `pur_sourcing_config` id=1（价格/交期/质量，各 > 0 且合计恰为 100，另含 prevent/warn 评级集合）。矩阵块的权重面板 POST `/sourcing/config`，每次重算读该行；翻转场景（味之源 ¥0.70 低价 vs 鲜丰质量 A）在 50/30/20 下味之源 #1，改 10/2/88 后鲜丰 #1，demo 断言两个名次并恢复默认。

### 3. 定标 = 带回执的一次 CAS（POST /sourcing/award）
- 写操作围栏到采购部 + admin（`assertSourcingActor`，ecoActor 模式；`finance` 与自称 actor 不符均 403）。中标人准入在服务端复检——山东鲁丰最新 D 级在任何写之前拒绝定标。
- 状态迁移是 `UPDATE pur_rfqs SET doc_status='awarded' WHERE … AND doc_status = <读到的值> RETURNING id`——双击重放幂等（同 winner ⇒ 200 `idempotent:true`、不产生第二张 PO），换 winner 得 409。落选者翻 `lost`（取消）或 `backup`（保留后备）；生成的 PO（`PO-YYYY-NNNN` 数字尾槽）在 `compare_note` 带三维计分回执、`rfq_id` 回链，并经 `submitForApproval` 走既有采购订单审批流。

### 4. 采购域页面（7/8 纯表格 → 3/8）
- 比价表挂 `w6b7-matrix` JSBlock（RFQ 选择器、权重面板、分组热力矩阵含排名条与准入徽章、逐行算式明细、定标弹窗、RFQ→PO 台账）；两张报价表格保留为检索辅助。采购订单挂 `w6b7-po-board` 泳道（doc_status 泳道带计数与金额、收货/发票双轴徽章、每卡「来自 RFQ」回链徽章）。发票匹配挂 match_result 柱图、付款申请挂 doc_status 环图（f4 授权通道）。形态审计定义「表格页」= 无 JSBlock/Kanban/真数据图表（零维度的统计卡 ChartBlock 不算），断言 table=3/8。
- 栅格落位：`seatBlockRowTop` 把附加块的行挪到 rowOrder 首位——留在页尾 appendRow 的块永远不挂载（懒渲染器不让它进视口）；且命中检查必须放在空 cell 过滤之前，否则唯一 cell 就是目标块的行会被静默丢弃。

### 5. 证据
- `w6-b7-01-demo-actions.log`：9 腿全绿（重置 → 矩阵渲染 → 评分卡/合格率/手算三方对拍 → 权重翻转 → prevent 403 → finance 围栏 403 → 定标全链 psql → 幂等重放 + 409 重定标 → XSS JSON 惰性 + 清理）。
- `w6-b7-assert.log`：14/14（结构 3 项、比价表/采购订单 JSBlock 与两张图表 4 项、形态 table=3/8 1 项、live 探针与 demo 终态 6 项）。W6-R4 复核修正：原文误记 17/17，实测计数以日志为准；R4 轮扩充断言后为 20/20（见 w6-r4-02-assert.log 与 W6-R4 Note）。
- `w6-b7-00..09 PNG` + `w6-b7-shot-meta.json`：浏览器渲染矩阵含 prevent 禁用与 XSS 文本化、权重面板、finance 403 呈现在 UI note、buyer 驱动的定标弹窗 → 已定标横幅、PO 泳道带回链、两张图表；psql 对账确认 awarded 状态与 PO 回执。

## Alternatives considered

- **v2 表格嵌套 vs JSBlock 自绘矩阵**——选自绘：分组嵌套+逐行定标超出 v2 表格能力。

## Consequences

成本：矩阵块在平台页面治理之外。买到：三维定标+warn/prevent 准入联动+PO 回链。
