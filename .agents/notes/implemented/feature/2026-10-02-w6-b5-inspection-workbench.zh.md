# Agent Note: Agent Note：W6-B5 QMS 检验工作台 + 出厂检验报告九要素

Status: implemented

[English](2026-10-02-w6-b5-inspection-workbench.md) | 中文

状态：已实现

## 问题

质量轮研究结论把检验工作台列为食品厂真正赖以工作的五种非表格形态之一：现场质检员要的是打开队列、被引导到抽样方案、逐项记实测、落判定——而不是一张带表单的表格页。数据底座已在（W2 的 AQL 15 段 `qm_aql_plans` 种子 + 四态 `qm_inspections` 台账、W3 的检验终端腿），但抽样方案查询只有 CLI、判定提交无幂等、四路处置只有 CLI（`--create-nc`/`--dispose`）、拒收判定不产预警、法定出厂检验报告（沪市监食监〔2025〕195 号九要素；报告编号=食安法第 51 条检验合格证号）无处落地。本批在既有底座上交付工作台、报告与拒收→预警联动，不另立判定引擎。

## 决策

**工作台=共享引擎之上的向导卡，绝不重抄抽样表。** SPA（`examples/kb-agent/insp/`，由 approval-engine 服务于 `/insp`，沿用 labels 的产物提交姿态）按来源分组渲染队列（IQC/IPQC/OQC + `wms_receipts.received_at` 超 48h 逾期高亮）。向导的方案步调 `GET /insp/plan.json`，其 `inspPlan` 以共享 `LOT_BANDS` 定段、按 (lot_band, aql, rigor) 查单行 `qm_aql_plans`——IQC 严格度随供应商 `iqc_level`，与 `inspectInspection` 完全同口径，徽章与落库判定不可能不一致（断言以 psql 直查对拍四个锚点）。读数携带缺陷分类（严重/主要/次要）；超差行须经「确认失败」双按钮确认才记不合格，服务端拒绝反向（超差行记合格）——两条护栏均有断言。

**幂等=判定行上的 submit_key CAS。** `qm_inspections.submit_key`（增量列）以 `UPDATE … WHERE submit_key 为空 RETURNING id` 占位；同键重放答 `duplicate: true` 不重写，占位后异键被拒，判定失败回滚读数并释放占位。读数先落库，`inspectInspection` 随后跑 AQL 判定（与 CLI 同一引擎），四态台账与全部锚点回写保持单通道。

**处置与预警复用既有动词。** 拒收处置卡包装 `createNc`/`disposeNc`（退货/让步/返工/报废，走 W2 审批链与四路库存后果；让步缺审批人与让步理由即拒）。第六路预警规则 `inspection_fail`（quality/critical，路由质检部+quality_lead+planner）由提交路由内一次 `scanAlerts()` 落行——与 `ccp_deviation` 同一 B2 通道，无第二条插入路径。顺带修复 B2 断言的规则计数漂移（四路→六路；`ccp_deviation` 早已使其过时）。

**报告=自动装配、缺项诚实、一次签发。** `inspReport` 把检验单+读数+产品+批次（+已签发档案行）装配为九要素；来源列缺失渲染「未维护」并带 `missing` 样式（B3 供应商占位姿态——规格与检验依据当前天然未维护，断言占位≥2）。`qm_factory_reports` 一检验一档案（`report_no` 与 `inspection_code` 双唯一索引）；报告编号 `QR-YYYY-NNNN` 即检验合格证号。仅已判定（合格/让步）可签发、仅质检部审核人可签、`/insp/report` 在会话（Bearer 或 `?token=`）之后渲染打印页（window.print / CDP printToPDF）。

**权限=会话推导操作人+围栏。** 写路由一律 `recallActor`（auth:check）推导并围栏质检部+admin（`assertQualityActor`）；读路由需任一平台会话。平台页「检验工作台」以 `IframeBlockModel` 嵌入 SPA（runjs 剥 iframe）；「出厂检验报告」为档案表格页；`qm_factory_reports` 授 member view——其他角色只读。

## 备选方案

**逐读数幂等键（B4 模式）。** `ux_mfg_ccp_records_submit (submit_key, point_id)` 适合 CCP 台账的同质多行。判定是对 N 行读数的一次决策，占位应落在决策行上：`qm_inspections` 上一次 CAS 让 single-shot 语义显式化，也无需再解读唯一索引。

**为向导状态建专属集合。** 向导是既有台账之上的视图；持久化中间步骤会分叉真相。提交路由在同一批表（CLI 所写的表）上一次落读数+判定+照片附言。

**演练处置走让步（concession）。** 让步后果经 `releaseReceipt` 重导库存，需要完整的待检区收货底座；返工路承载计划自身的验收断言④（处置→RW 工单→复检）且无需库存演练装置。演练走返工；让步由服务端签署门（缺审批人/让步理由即拒，有断言）与 W2 引擎自身测试覆盖。

## 后果

检验员面就此成为五种非表格形态之一且证据完整：队列→徽章→读数→判定→处置→报告全链可由 `w6-b5-shoot.mjs` 对真实服务复现，28/28 断言全绿，每腿 psql 对账（对账 SQL 固化于 `research/2026-10-01-w6-rework/b5/recon.sql` 供终验矩阵引用）。演练行以 `QI-W6B5-%` 前缀贯穿所触各表，`--cleanup` 连同预警/CAPA/NC 后续一并撤收。

遗留：预警列表页的 `rule_type` 枚举片仍不含 `inspection_fail`（行可渲染；片面修缮归 B10）；SPC 图形仍为 W7（读数底座已就位）；报告的规格/检验依据在产品主数据补列前保持占位——占位是诚实的呈现，不是要掩饰的缺口。

## 测试

`w6b5-insp.mts --assert` 跑 14 门：列、双唯一索引、规则行、队列谓词、四锚点 AQL 对拍（psql 直查 × `inspPlan` × W2 种子）、两页、iframe URL、view 授权。`w6-b5-shoot.mjs` 驱动真实全链：签到→分组队列→徽章（281-500/H n=50 Ac=3 Re=4）→读数（双按钮确认+拍照留证）→拒收徽章（严重 0收1拒）→返工处置（QM-NC closed/approved、RW 工单 draft、CAPA 草稿）→psql 对账→幂等重放（同键 duplicate、异键拒）→OQC 接收→九要素预览（占位≥2）→签发 QR-2026-NNNN→打印 PDF→负向（无会话 401、buyer 403 围栏、非质检审核人拒、让步缺签拒、XSS 载荷在 SPA 惰性且报告侧转义）→平台嵌入页。证据：`demos/acceptance-w6/w6-b5-01..07d-*`、`w6b5-assert.log`、`gates-b5.log`（typecheck、oxlint staged 0/0、两条断言腿）。
