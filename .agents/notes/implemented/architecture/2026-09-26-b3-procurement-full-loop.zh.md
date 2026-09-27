# Agent Note: B3 采购全链路——pur_orders 取代 hub_po、三轴状态、IQC 待检区与三方匹配

Status: implemented

[English](2026-09-26-b3-procurement-full-loop.md) | 中文

## Problem

采购域此前是孤岛：`hub_po_purchase_orders` 只有四个无流转的业务状态列，无 PR/RFQ/报价/比价/发票/付款集合，WMS 收货过账引擎与采购单互不关联。PLAN §4 B3 要求建 P2P 全链（PR→RFQ→比价→PO 审批→收货→IQC 挂点→入库→发票→三方匹配→结算），且「未生效不驱动下游」「库存过账唯一入口」两条不变式全程成立。

## Decision

- **pur_orders 取代 hub_po_purchase_orders 成为规范 PO 主表**。旧表冻结为历史存量（对齐 B2 的 hub_po_suppliers→采购联系人模式），mobile 采购单表单迁移到 pur_orders，`hub_po_*` 前缀在 BIZ_TERMS 中标注「历史」。迁移而非改造的原因：旧表列名（po_number/total/order_date）与新引擎契约（doc_status 双轴 + amount 金额路由）不兼容，且保留旧表让 B1 时期的审批留痕可回溯。
- **三轴正交（D2/Odoo 双轴）**：`doc_status`（六态审批轴，引擎独占）× `receiving_status`（none/partial/received，postReceipt 唯一推进点）× `invoice_status`（no_invoice/to_invoice/invoiced，发票登记/确认推进）。PR 的 converted、RFQ 的 sent/closed 是审批轴 approved 之后的业务终态，由链路动词（sendRfq/awardRfq）经 `updateWhere` 条件写，不进 wfl 状态机——审批动作与业务推进动作分离，两者都只经脚本侧引擎。
- **金额阈值路由的 amount_field 配置化**：B1 引擎把金额列硬编码为 `total`（approval-rules 的 AMOUNT_FIELD）。采购链的金额列是 `amount`，PR/RFQ 无金额列。解法：wfl_flow_configs.extras 增 `amount_field`（缺省 total），引擎 `act()` 与工具侧 `nbApproveEngine` 同读 `flow.amount_field`；同时 `nextStateOf` 的 approve 分支改为「无金额（undefined）一审直达，仅明确超限才加签」——无金额列的单据类型（PR/RFQ）不该被迫走二级。两侧同步改，selftest 增无金额断言防回退。
- **wms_receipts 增列（po_id/iqc_status）落在 w3 而非 h5**：批次文档把增列写在 h5，但 all 链顺序 h5 先于 w3，m2o 目标集合 pur_orders 尚不存在会让 h5 的 fields:create 400。增列唯一执行点移到 w3（pur_orders 建好后）；h5 只改引擎行为（PO 分流待检区/releaseReceipt），对 po_id 列缺失的世界保持兼容（free 收货走原路径）。
- **IQC 挂点两级（B8 深化前）**：PO 来源收货一律上架待检区（wms_zones 种子 SH-Q，lot=quarantined、stock=hold），`--release-receipt` 校验 iqc_status ∈ {passed, not_required, concession} 才放行转合格区（TRANSFER 流水 + lot qualified + receipt closed）。「IQC 未放行不能过账入库」由 releaseReceipt 拒绝实现（错误文案含「IQC 未放行」）。
- **三方匹配容差口径**：`qty_billed ≤ Σlines.qty` 且 `|invoice_amount − Σlines(qty×unit_price)| ≤ 0.05`（绝对容差，04-b3 集合设计原文）双 ok → matched，否则 exception（不阻断，人工确认 → confirmed，Odoo 口径）。发票校验轴用 `match_result` 单列承载（draft→matched/exception→confirmed）；pur_payments→pur_invoices 卡口读 `upstream_state_field='match_result', required='confirmed'`——B2 建立的集合卡口机制首次跨出供应商域。
- **通用集合卡口文案**：发票卡口的拒绝文案不能复用供应商准入话术（gateNotAdmittedMessage 的「未准入/不合格供方不能下采购单」）。approval-rules 新增 `gateNotInSetMessage`（通用：`{label} 的 {stateField} 为 X，不在要求集合 {set} 内`）；引擎与 nb_create 两侧按 stateField 是否为 lifecycle_status 分流供应商特化/通用文案。

## Notes

- 卡口 `upstream_ref_field` 必须为 null（按 id 引用）：首版把 pur_rfqs→pur_requests 配成 ref_field='code'，enforceGates 用数字 id 过滤字符串 code 列直接 HTTP 500 而非拒绝文案。w3 的 ensureGates 现在会把漂移行修正为 id 引用。
- postReceipt 不得覆盖显式 not_required（免检收货登记时已声明）；同理 setIqc/release 对 closed 收货保持幂等（重放 kept）。
- demo-chain 的幂等重放语义：已过步骤跳过（award/审批/过账/匹配各有 kept 分支），卡口负例在素材被上轮消耗时切换到备用待检收货或显式跳过并注明「首跑已验证」。
- mobile 采购查询技能（PO 三轴状态卡/比价表）是 persona 读端，与登记流程互斥；旧会话不会自动获得新 persona，验证需开新会话。
- ui-mobile 的 `pnpm run build`（client lib）未重跑前，:3080 欢迎屏 capabilities 行仍显示旧六类文案；对话行为与草稿卡不受影响（服务端 persona + 运行时注册表已更新）。

## Evidence

- 引擎脚本 [`nocobase-w3-procurement.mts`](../../../../examples/kb-agent/scripts/nocobase-w3-procurement.mts)（9 集合 + flow×4 + 卡口×6 + 种子 + 采购管理 7 页 + `--demo-chain`）与 [`nocobase-h5-wms.mts`](../../../../examples/kb-agent/scripts/nocobase-h5-wms.mts)（待检区种子/postReceipt 分流/releaseReceipt/`--iqc`）。
- demo-chain 全绿含卡口负例×3 与容差正反例：`research/2026-09-25-w-round/b3-chain-log.txt`；psql 九段只读断言：`b3-psql.txt`；双端截图：`b3-admin-{compare,po-triaxis,invoice-match,pr-converted}.png` + `b3-mobile-{po-status,receipt-draft,receipt-done}.png`。
- 规则真源改动：[`approval-rules.ts`](../../../../packages/connector/tool-nocobase/src/approval-rules.ts)（nextStateOf 语义 + gateNotInSetMessage）、[`write.ts`](../../../../packages/connector/tool-nocobase/src/write.ts) 与 [`approval-engine.mts`](../../../../examples/kb-agent/scripts/approval-engine.mts)（amount_field 两侧同步）。

## Alternatives considered

- **匹配/容差算术放 workflow 节点**——⑪号坑；三方核对由引擎 `--match-invoice` 独占并写出可复算的 match_note。
- **异常发票不经人工放行直接付款**——卡口拒绝 `match_result != confirmed`；人工 `--confirm-invoice` 是唯一泄压阀。
- **单独的待检收货集合**——WMS 库区 + `wms_receipts.iqc_status` 已承载状态；第二集合会分叉收货真源。

## Consequences

采购七单与六卡口自此是采购域的现行契约；发票匹配说明可凭 psql 行逐字复算。
