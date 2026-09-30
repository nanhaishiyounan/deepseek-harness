# Agent Note: W5-B8 收尾——P2 残余清偿 + 八角色真实账号走查 + 交接文档

Status: implemented

[English](2026-09-30-w5-b8-closure-p2-roles.md) | 中文

## 问题

W5 七个实施批留下三类收尾债：① P2 残余——qty=0 的 hold 库存行（applyStockDelta 清量不清行，13 行残留）、产能利用率口径与 FCS 排产容量不一致（BP-18）、终端 strict 档无部署文档（BP-21）、发号 TOCTOU（BP-19）；② 八角色走查中 6/8 角色用 admin 取证，真实账号从未走过旅程（BP-22）；③ QUICKSTART 无设计器操作手册、上一轮遗留的跨轮真话债（R1 后未复验的声明）无人核对。

## 决策

- **库存寄存器不留零行。** [`applyStockDelta`](../../../../examples/kb-agent/scripts/nocobase-h5-wms.mts) 在版本校验更新落地后，若目标行到达 qty_on_hand=0 且无占用/无锁定即 destroy——库位/批次/流水保留全部历史，寄存器不再积零值残行；后续收货按既有「行缺失即建行」路径重建（版本从 1 起）。存量 13 行由 `--sweep-zero-stock` 幂等清理（清后即跑对账，账仍平）。
- **BP-18 分母换用 FCS 同源容量。** [`mfg-schedule.mts`](../../../../examples/kb-agent/scripts/mfg-schedule.mts) 加 main 守卫（入口判定沿用 h5 惯用式）使 `dailyCapacityMinutes` 可导入；[`kpi-run.mts`](../../../../examples/kb-agent/scripts/kpi-run.mts) 的 capacity_util 分母改为 Σ(工作中心班次跨度×并行) × 当月已过工作日（周日 + 班次日历节假日休，'' 共享日历全员生效），KpiFacts 以 workCenters+holidays 取代 workCenterCount，非法班次经 dailyCapacityMinutes fail loud。快照口径注记随之更新，历史由 --backfill 重放自然收敛。
- **八角色走查 = 真实账号 × 旅程断言 × 隔离对照。** 六个新账号（buyer/planner/shop_lead/keeper/sales_rep/finance）按 qc_inspector 模式种子（member 默认角色 + 部门挂接）；CDP 活体逐角色登录走 3~5 步核心旅程（无 403/非白屏/行数/抽屉三段式标签），隔离断言用「直开权限矩阵页」对照——member 矩阵不渲染、admin 渲染，取代不可靠的折叠侧栏文案探针。结果落 `demos/acceptance-w5/b8-walkthrough.json`，由 `w5b8-closure.mts --assert` 门禁化。
- **BP-19 转下轮 backlog。** 发号 TOCTOU 遍布 10+ 写点（前缀扫描 max+1），单写者演示环境无并发窗口可 exploited；序列表（UPDATE…RETURNING）或唯一索引+重试是系统性改造，按价值排期下轮。
- **终验暴露的两处存量债一并清偿。** ① w5b6-heal 增 enumSwap 动作：select 字段仍由 DisplayTextFieldModel 渲染的列换 DisplayEnumFieldModel + v2 选项（journal 记 beforeUse 可回滚；字段选项读 `uiSchema.enum`）——B7 抽屉重建搬运的 W3-B2 子表列带回 19 个未右对齐列与 pur_quotes.status 裸文本（B6 heal 之后写入、其 assert 声明已过期），`--all` 两轮幂等收敛至 133 枚举列零漂移；② lint 基线纠偏：全量 oxlint 实为 27 错（B2 声明 26 后未再全量复跑），修 approval-rules.ts `flowStateLabel` 双诊断与 write.ts 无谓断言（行为零变化，tool-nocobase 42/42 测试绿），回到 24≤26。
- **文档收口。** QUICKSTART 增设计器操作手册章节（拖拽/属性面板/发布门禁/会签/新链路自动推进语义）+ `--sweep-zero-stock`；DEPLOY 安全要点补 W3_TERMINAL_TOKEN strict/lenient-demo 双态与设计器鉴权通道。交接文档 `plans/handoff-2026-09-30-w5.zh.md` 含 22 项断点终态核对表与真话债勘误。

## 备选与否决

- **保留零行只加视图过滤**——拒绝：寄存器是台账事实源，「过滤后才干净」等于把残债留给每个读者；B3~B5 note 已点名转 B8。
- **在 kpi-run 复制一份班次跨度解析**——拒绝：mfg-schedule 已有 fail-loud 解析，加 main 守卫后导入是零成本单一事实源；复制会产生两处可漂移的规则。
- **为八角色各建一棵 ACL 角色树**——拒绝：平台隔离粒度是角色(member)×集合动作×页绑定，域级角色矩阵不存在的现状下，member 档 + 部门挂接 + 页面/集合级隔离断言才是可诚实验收的形态；六棵角色树是 W6+ 级工程。
- **BP-19 本轮修**——否决理由见决策；补齐方案已写入 backlog。

## 后果口径

- 八角色走查 8/8 PASS（115 步断言全绿：采购员 15/计划员 14/车间主任 15/质检员 14/仓管员 17/销售 15/财务 12/管理员 13），截图 `demos/acceptance-w5/b8-r1..r8-walkthrough.png`；member 直开权限矩阵页均被拦、admin 渲染矩阵（数据隔离对照）。
- `w5b8-closure.mts --assert` 全绿：七 member 账号角色绑定、wms_stock 零 qty=0 行 + ledger balanced、kpi selftest 含产能分母用例 + 快照注记 FCS 同源、product9 无并列 open 建议、DEPLOY/QUICKSTART 文档断言、走查证据九项。
- 全量终验矩阵 16 腿全绿（lint 24≤26 基线/typecheck/designer tsc/selftest/w5b2 --migrate/w5b3/4/5 --assert/w5b6-theme/heal/w5b7/w4-heal-b1/w3-approval-visual textarea 退役/w5r1 并发 CAS/w5b8/b9 九步链/assert-ledger/kpi+mfg selftest/setup verify 全链），证据 `research/2026-09-29-w5-rework/w5-final-gates.txt`（matrix done: 16 PASS / 0 FAIL）。
- capacity_util 当日值由 0.0534（铭牌口径）变 0.055（FCS 口径）——口径修正的预期变化，非回归。

## 坑（会再踩）

- **rolesUsers 联表键是 "roleName" 驼峰**（roles 表无 id 主键列）；psql 直查角色绑定时按 roleName JOIN，rolesResources/rolesResourcesActions 同族命名。
- **折叠侧栏的菜单文案不是权限探针**——组未展开时页面标题不在 DOM；隔离断言要用「直开 URL + 渲染内容」对照，不能读 aside 文本。
- **CDP 等待文案必须是页面真实字面**——「SKU」不在库存页 DOM（列头是「库位」等），等待探针措辞先经一次实测校准；localStorage 清除后 SPA 可能仍持内存 token 渲染壳，登录表单探针需 reload 重试三轮。
- **W5 证据两个家**：B0~B5 在 `examples/kb-agent/demos/acceptance-w5/`，B6~B8 在仓库根 `demos/acceptance-w5/`——断言脚本引用前先对准路径。
