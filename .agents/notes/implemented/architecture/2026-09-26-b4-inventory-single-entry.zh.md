# Agent Note: B4 库存实务——移库 ±流水对、两段式预留、ROP、盘点审批回写与唯一入口守卫

Status: implemented

[English](2026-09-26-b4-inventory-single-entry.md) | 中文

## Problem

WMS 引擎在 B3 之后仍留三个缺口：① REST 旁路无拦截（admin 角色 strategy 全量授权直改 `wms_stock` 恒 200）；② `--post-transfer` 缺失（移库单有单无过账，且 `releaseReceipt` 的单条正量 MOVE 流水使 per-(product, lot) 台账双计）；③ 盘点差异审批通过后不回写库存。预留仅有 `qty_allocated` 字段无单据，安全库存/再订货点无字段无预警。05-b4 批次文档要求把引擎补成唯一库存入口并补齐这四项实务能力。

## Decision

- **唯一入口守卫（双保险）**：结构侧——`ensureBypassGuard` 给 admin 角色建 `rolesResources` 显式行（`usingActionsConfig=true`，actions=view/list/get/export）覆盖 strategy 的 create/update/destroy（`wms_stock` 与 `wms_movements` 双表）；运行侧——`assertLedgerBalanced` 对账断言（per (product, lot)：Σ stock.qty_on_hand == Σ movements.qty，容差 0.01）进 `--demo-chain` 与 setup verify 双门禁。root API token（引擎专用）不受 ACL 影响。实测：收窄前 PATCH=200，收窄后=403 No permissions。
- **移库 ±流水对**：`postTransfer` 每腿写两条 MOVE 流水（源 −qty 无 to_bin / 目标 +qty 无 from_bin），per-(product, lot) 净和为零——批次总量恒等式不因移库漂移。守卫：源 status=hold（待检禁移，IQC 放行前）或 blocked 拒绝；源/目标不得为虚拟区（SH-ADJ/SH-TR）；目标不得为待检区 SH-Q（只经 IQC 分流进入）；可用量（qty_available）不足拒绝。two_step 模式（transfer_mode 列）：`--post-transfer <no> out` 落在途库位 SH-TR-01-01、status=in_transit；`--post-transfer <no> in` 完成第二段。
- **两段式预留（D7 轻量版）**：`wms_reservations`（code/ref_type SO|MO|SHIPMENT/ref_id/product/bin/lot/qty/status reserved|consumed|released/released_at）是 ATP 的单一事实源（B6 齐套与 B7 发货消费此表）。创建时引擎即按 FEFO 定批回填 lot/bin（创建→定批→消耗的三段中，「定批」提前到创建时；批次留空的拆分预留留给 B6）。ATP 口径 = Σ good 行 `qty_available`（= on_hand − allocated − locked 的行级公式，与 FEFO 拣货口径一致）；预留落在 stock 行 `qty_allocated`（物化投影，同乐观锁版本门），consume 时回退投影、出库腿（postShipment）才动 on_hand；release 恢复 ATP 并落 released_at。超额预留拒绝文案携带当前 ATP 数。
- **台账再平衡 `rebalanceLedger`**：种子期的「期初余额对齐」泛化为随时可跑的全量补偿——有库存行的组补 `stock Σ − movements Σ` 的 ADJUST 行（挂本 bin）；有流水无库存行的孤儿组（历史删除残留）补反向冲销行（对手差异库位）。不改历史移动（D8），幂等（已平衡世界零输出）。主流程每次运行尾调 + `--rebalance` 独立命令。`releaseReceipt` 的流水改为 ±MOVE 对，消除新增不平衡源。
- **盘点差异审批回写**：盘点 workflow 重建为 manual → condition →（TRUE）request `POST :13110/post-count-adjust {count_no}` → update done /（FALSE）update difference。引擎端 `postCountAdjust` 校验 status ∈ {difference, adjusting}，差异行写一条 COUNT_ADJUST 流水（qty=difference，对手 SH-ADJ 虚拟库位，Odoo Inventory Loss 模式）+ `applyStockDelta` 修正库存 + status=done（后随 update 节点幂等）。差异审批的提交 wire：`workflowManualTasks:submit?filterByTk=<id>` body 顶层直接 `{result: {_:'resolve', f1:{}}}`（body 包一层 `values` 反而 400）。
- **ROP 建议**：hub_inv_products 增列 abc_class/reorder_point/safety_stock/lot_size/lead_time_days/avg_daily_use（种子只在空列落值，人工维护优先）。`--scan-reorder`：ATP ≤ reorder_point 时 upsert `wms_reorder_suggestions` open 行（幂等），suggest_qty = 补至 reorder_point + lot_size 的缺口向上取 lot_size 整倍数（Odoo min/max 语义）。定时触发：开源快照无 workflow-schedule 插件，降级为 `approval-engine --serve` 的 `POST /scan-reorder` HTTP 端点（外部 cron curl）；盘点 workflow 的 request 节点复用同一 serve。
- **盘点计划页**：hub_inv_products 的 ABC/ROP 参数表（v2 表格页）。盘点单生成不走页面按钮（JSBlock 白名单内做不了引擎算术的快照冻结），走 `--gen-count <bin>`：对 bin 下全部 good 行各建一张 counting 单（snapshot_qty 冻结当前账面，abc_class 从物料回读）。

## Notes

- ACL 显式行的语义：`rolesResources`（usingActionsConfig=true）+ actions 白名单覆盖该角色的 strategy 授权，root 角色天然绕过——所以守卫的验收必须用非 root 用户 token（b4guard，admin 角色）实测 403，而非用 API key。
- NocoBase 密码 update 会吊销该用户全部会话：demo chain 重放时不再重写 b4guard 密码（首版先 update 再 signIn 拿到 401 而非 403）。
- 双计历史来源：种子流水 RECEIPT+PUTAWAY 双行（各 +qty）、MOVE 单行 +qty、B3 release 单行 +qty——全部被 rebalance 的补偿 ADJUST 行吸收；引擎侧今后只产生平衡写（±MOVE 对 / 单条带符号±delta）。
- demo-chain 重放幂等：ROP 下探前查 open 建议已存在则跳过 post-adjust（避免重复扣减把库存打负——postAdjust 另有负库存守卫）；盘点单按「今日该 bin 未 done 单」回退查找，全 done 时注明首跑已验证。
- 移动端移库/预留表单落库后均为 draft/reserved 态，由仓库走引擎 CLI 过账——对话只建单不动库存（与旁路守卫同一原则的对话侧体现）。

## Evidence

- 引擎 [`nocobase-h5-wms.mts`](../../../../examples/kb-agent/scripts/nocobase-h5-wms.mts)：两集合/六列/两虚拟库位种子、postTransfer/reserve/releaseReservation/consumeReservation/printAtp/postAdjust/scanReorder/postCountAdjust/genCount/assertLedgerBalanced/rebalanceLedger、workflow request 腿重建、`ensureBypassGuard`、`--demo-chain`。
- demo-chain 全绿（移库 ±对/待检禁移负例/预留两段式/超额拒绝/ROP 建议行/盘点回写/对账平衡/403 守卫）：`research/2026-09-25-w-round/b4-psql.txt`（七组只读断言，对账 0 漂移）+ `b4-psql.sh`。
- 真 workflow 审批链端到端（manual submit 202 → request 回调 :13110 → 引擎回写 +3 → done）：serve 日志含「CNT-B4-WF-908301 adjusted」。
- 双端截图：`b4-admin-{reservations,reorder,countplan,counts-done}.png` + `b4-mobile-{inventory,reorder,transfer,transfer-receipt}.png`（mobile 三场景真实 LLM：库存查询报告卡 1,915/60/1,815、补货预警卡建议补 480、移库草稿→确认→TRF-20260926-001 落库回执→引擎过账 ±MOVE 对）。
- [`approval-engine.mts`](../../../../examples/kb-agent/scripts/approval-engine.mts) `--serve` 新增 `/post-count-adjust`、`/scan-reorder`；[`setup-nocobase.mts`](../../../../examples/kb-agent/scripts/setup-nocobase.mts) verify B4 断言块（集合/3 页/列/虚拟区/request 节点/守卫行/对账门禁）。

## Alternatives considered

- **软预留（仅可用量展示）**——D7 定死整行硬预留加两段式回填批次；软硬两套会把一个事实拆两个家。
- **冻结盘点为默认**——D8 默认循环盘点（旺季可用性）；冻结路径保持可选。

## Consequences

引擎过账是库存唯一写手、`stock == Σmovements` 对账进 verify 下限，自此是库存域的现行契约。
