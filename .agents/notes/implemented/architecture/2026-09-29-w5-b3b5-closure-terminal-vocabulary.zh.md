# Agent Note: W5-B3/B4/B5 业务闭环断点清偿——词汇族终态机制与生效侧自动推进

Status: implemented

[English](2026-09-29-w5-b3b5-closure-terminal-vocabulary.md) | 中文

## 问题

W5 闭环盘点列出 22 项跨段断点，B3/B4/B5 承接其中 16 项。结构性诊断是三条：① 词汇表外终态（pur_payments 的 paid、MO 的 completed、供应商四态）绕过状态机真源，直改即生效、误付无法作废；② 跨段「半步停」是模式不是个案——IQC 判定 passed 后要再跑一条 CLI 才放行入库、OQC 放行不给 SO 补预留、ROP 建议确认后不转请购、SO 发货不落出库单台账；③ 口径分裂（ap_balance 只认 approved 致付款后应付不减反增、交期双口径、AR 全局冲抵无按单核销）。

## 决策

- **词汇族终态扩展机制一次落地，四个域复用。** `graph.extras.terminals`（states+transitions 声明）经发布编译器派生进 wfl 行表并落 `extras.terminal_states`；`readState` 用它扩展基础词汇族的 `isState`，业务终态单据继续经引擎行动；`ApprovalAction` 扩 settle/promote/demote/restrict/freeze/eliminate/restore 七个业务动作（act 白名单放行、不开待办、CAS 直转）；rowsToGraph 把词汇外行逆向回 terminals 块，round-trip 等价保持（w5b2 --migrate 70✓ 含 pur_payments 7态10转移复证）。admission 词汇族同法扩四态八转移（preferred/restricted/frozen/eliminated 的升降级全走引擎，gate 集合语义不变）。
- **状态列只经引擎（nb_update 守卫）。** `assertRowEditable` 拒绝 values 携带流转列（doc_status/lifecycle_status）——堵死 draft 态直改 doc_status=approved 的旁路；paid 的 settle 与误付 void（paid×void→void）全在引擎审计内（PAY-W5B5-MIS 演练 settle→void 两跳留痕）。
- **hub_po 退役用专用自测载体，不用业务集合排练。** wfl_selftest_docs（非业务集合）承接 seedFlow/selftest/w5b2 --features；hub_po 流停用+两 gate 删除+config_note 审计；pur_orders 的流与 gate 健在（verify 断言改指新语义）。
- **生效侧自动推进挂在判定/放行的生效点，例外才人工。** IQC passed → 自动 releaseReceipt（RCV-W5B4-I02 一步 closed）；OQC passed → 自动 releaseCompletion，其尾部 topUpOwingSoReservations 对欠货 SO 幂等补预留（RSV 0→3 实证；子进程调 mrp-run CLI——动态 import 会与 mrp-run 的静态 import 成环，在 top-level await 下死锁）；ROP confirm 建议转 PR 草稿并回链（PR-2026-0010/11/12 系列），scanReorder 尾部把 ATP 回升的 open/confirmed 行自动关闭；shipSo 逐预留落 wms_shipments（sales 类型）。
- **口径归一选数据覆盖高的方向。** ap_balance 扣减扩为 doc_status∈{approved,paid}（kpi mirror 加 paid 行断言）；交期统一 need_date（23/26 覆盖 vs expected_date 2/26——scorecard 改读 need_date 且空值出分母，与 otdSupplierOf 同数）；MO 完工终态统一 closed（写点+KPI 三处过滤+3 行存量回填）；crm_payments 增 so_order_id 实现按单核销（SO 级余额=Σapproved−Σ核销 对账断言）。
- **member 看板 403 根因是 collection view，不是 charts 权限。** 上游 `applyQueryPermission` 读 `acl.can({resource: <collection>, action: 'view'})`；给 member 补 22 张制造业业务表的 view（只读、无写动作）后 b4guard 实测 charts:queryData 200——W4 遗留#2 就此关闭。

## 备选与否决

- **为每个终态扩 ApprovalAction 全枚举到引擎核心**——拒绝：终态是 doc_type 级业务属性，不是全局审批语义；terminals 声明留在 graph（编辑态唯一事实源铁律不破），编译产物携带，未来域接入零引擎改动。
- **psql 直插终态行绕过发布链路**——拒绝（srm 升级除外）：publish 的 DELETE 全删全插会抹掉孤立行；唯一例外是准入模板升级（live 4/4 → 模板 8/13 是设计内 drift，round-trip 门禁正确拒绝），按 seedDocFlow 修复收敛先例走幂等 INSERT，此后任何 publish 字节等价。
- **BP-06 补预留用动态 import mrp-run**——实测否决：mrp-run 静态 import 本模块，动态反向 import 在 top-level await 下成环死锁（进程带 unsettled warning 静默挂起）；子进程 CLI 是九步链 runScript 同款先例。
- **交期统一 expected_date**——数据否决：2/26 覆盖会让 otd_supplier 分母塌缩；need_date 是需求方口径且与 KPI 现状一致，scorecard 单侧迁移即达同数。

## 后果口径

- 16 项 BP 逐项 PASS：w5b3-closure / w5b4-autoflow / w5b5-terminals 三脚本 --run/--assert 双绿（可重复执行）；九步链 s1..s9 幂等回放全绿；--assert-ledger 51 组 balanced；w5b2 --migrate 九类型 70✓（含 terminals round-trip）；approval-engine --selftest（settle/promote/extendVocabulary/误付矩阵）与 kpi/mrp selftest 绿；tool-nocobase vitest 42/42；四张浏览器取证（research/2026-09-29-w5-rework/）。
- 顺手修复的存量真话债：B2 遗留的 `total >= 1` 条件 DSL 测试断言（>= 早已合法）；mrp 快照对空 need_date 写 '' 炸 date 列（BP-15 演练暴露，改写 null）。
- 新发现转 B8：qty=0 的 hold 库存行残留（CP-W5B4-01 放行后 applyStockDelta 清零但行不清）；w5b4 每次全跑会给 product9 造新 open 建议（scan 正常行为，已加幂等收敛）。

## 坑（会再踩）

- **console.warn 走 stderr**——spawnSync 只收 stdout 会丢 loud 警告断言；runCli 必须合并两流。
- **NocoBase dev server 在 API 密集段后 ECONNRESET**（w4-r2 已知）——幂等读加一次 1.5s 重试即可稳。
- **psql 未加引号的 CamelCase 表名折叠小写**——rolesResourcesActions 必须全程 `"rolesResourcesActions"`。
- **引擎 --serve 长跑后静默退出**——回归中途遇 ECONNREFUSED 先查进程再诊断；nohup + /tmp 日志重启即可。
