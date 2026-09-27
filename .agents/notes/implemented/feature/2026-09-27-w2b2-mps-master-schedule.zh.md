# Agent Note: W2-B2 MPS 主生产计划——max(SO 未交, 预测) 合并、covered 互斥与 MRP 需求源切换

Status: implemented

[English](2026-09-27-w2b2-mps-master-schedule.md) | 中文

## 问题

W 轮 MRP 日结（[mrp-run.mts](../../../../examples/kb-agent/scripts/mrp-run.mts)）只把 approved 未发货 SO 行喂进 `gross0`——无预测层、无计划时段、JIT 窗硬编码 60 天（99 遗留 #7）。W2-B2（[02-b2-mps.md](../../../../plans/2026-09-27-w2-evolution/02-b2-mps.md)）补上 MPS 层：`mps_plans`（3–6 个按月时段的展望容器）+ `mps_plan_items`（item × 期行），按 max(SO 未交, 预测) 合并需求（ERPNext v16 同款），把日结中 covered item 的需求源从「SO 直纳」切为合并计划行，并让窗口可配——硬约束是：无 approved 计划行时日结输出与 W 轮逐字节一致。

## 决策

**planned_qty 语义钉死为该 item 该期的独立需求总量。** `mergeDemand(soOpen, forecast)` 取大、平手归 `so`；取胜方落 `driver`（`so`/`forecast`）。max 合并不需要预测冲销窗口也不需要时栅：ERPNext 与 Odoo 都没做，且「建议→人工确认→下发」流程本身就是软时栅（PLAN D3）。自动下发出现之前不引入 PTF。

**covered 互斥由日结代码强制，不是口头约定。** `runMrp` 读 approved 计划中最新一期（按 `period_from`），收集其 items 的 product id 为 `covered`，跳过 covered item 的全部 SO 行，把计划行以 `need_date = <期>-15`（月中锚点）、`driver = mps:<计划号>` 追加为需求——对应 Odoo 官方警告：MPS 与直接补货并行会双计。`mrp_snapshots.driver_so` 本就是可空不透明字符串，`mps:` 前缀无需改表结构；`mrp_suggestions` 增加 additive 的 `mps_plan` 回链列（仅 MPS 驱动行写，W 轮写集永不出现该列名）。`confirmSuggestion` 对 `mps:` 驱动改走 `assertSourceEffective('mps_plans')`——已 void 计划的 open 建议拒绝转单。

**审批生效瞬间即快照锁定。** `seedMpsFlow` 把 `mps_plans` 注册到共享六态词汇族（无金额列，单轮审批）。引擎生效钩子（serve `/act` 与 CLI）重算一次合并；之后 SO 变化不再自动改动已批计划——`--refresh-mps <计划id>` 是显式重算入口。`recalcPlan` 按（产品， 期）从 approved 未发货 SO 行重聚合，期归属按**单据头** `need_date` 的月份（`so_order_lines` 无行级需求日期列——W 轮的需求日期口径同样是单据头）。

**`MRP_HORIZON_DAYS` 覆盖 JIT 窗，fail-loud。** 正整数或带着原始值拒绝；未设置保持 `PLAN_HORIZON_DAYS = 60`。一个继承自 SO 聚合的注意点：`gross0` 按 product 键控且保留最早 need，远期行只有在「该 item 的行全部远期」时才可观察——种子的窗例用的是未覆盖的 SOY SO（need p3-05），不是多期的 SNA 行。

**种子自管生命周期。** 演示计划（SNA × 3 期、BEV/FRZ 各一期对拍）与三张 draft SO（SO-2026-0091/0092/0093）幂等落库；`--demo-mps` 把 void/approved 行自愈回 draft（SEED_SOS 直写先例），跑完 M1–M9 后经引擎 void 复原，稳态需求集保持 W 轮形状——链尾把复原后的日结与批前基线导出逐行 diff。

**已知坑：CLI `--act` 生效后钩子会挂起未结算的顶层 await。** `act()` 成功后，动态 import 的 mrp-run 钩子在事件循环排空时让 `await main()` 永不结算——Node 以 13 退出并报 "unsettled top-level await"（tsx/esm + 顶层 await 模块；可稳定复现）。serve 常驻路径事件循环不空、工作正常（`/act` 返回 recalc 数组已实证）；`--demo-mps` 因此走库函数 `act()` + 显式 `recalcPlan`。同分支的 so_orders reserveForSo 钩子同样是死路径——W 轮验收从未走过它（b9 用库函数）。

## 备选与否决

- **预测冲销（SO 与预测互抵）与时栅**——拒绝：max(SO 未交量, 预测量) 合并按构造无需冲销窗口（大者胜，本就无双计可抵），ERPNext v16 / Odoo 均无时栅；建议→人工确认→下发流程即是真实部署需要的软时栅。
- **被覆盖物料同时走计划行与 SO 直纳**——拒绝：这正是 Odoo 官方警告的 MPS×再订购双计；runMrp 在代码里跳过被覆盖物料的 SO 行，setup verify 持有历史不变式（同一次日结中 mps: 零层行排除该物料的 SO 行）。
- **so_order_lines 行级交期做期间聚合**——as-built 不可行：集合无行级日期列，表头 need_date 即 W 轮需求日权威；recalcPlan 按表头月份聚合，不新造列。
- **MRP_HORIZON_DAYS 走 cordis.yml Config**——拒绝（PLAN D7）：引擎脚本是独立进程非插件；流配置数据行与 env 才是本部署既定配置位。
- **mrp_snapshots 新增 mps_driver 列**——拒绝：driver_so 已是不透明可空串，mps: 前缀免 schema 变更搭车，需求源叙事保持单列。

## 后果

`mps_plans`/`mps_plan_items` 集合、主生产计划页（forecast 可编辑，planned/so_open/driver 引擎写）、mps 审批流随 w7 脚本落地；setup verify 新增集合/页面/流/回链列/种子断言，外加历史 covered 互斥不变式（任一 run 若含 `mps:` 驱动的 level-0 行，该 item 在该 run 内必须只有 `mps:` 驱动——混行即 SO+MPS 双计），n18ai- 下限 78→80。mobile 注册表增至十七个表单（预测登记；preset.yml 的 capabilities、description 与两处 `.dsh` 镜像同步更新），计划技能新增 MPS 查询报告卡。记录一条边界：approved 计划按产品级覆盖其 items，covered item 落在展望期之外月份的 SO 需求不进日结——种子三期展望（90+ 天）保证 60 天窗内不可见，更宽展望配 `MRP_HORIZON_DAYS`。

## 验收证据

`research/2026-09-27-w2-evolution/`：`w2-b2-baseline-snapshots.txt`（批前 W 轮日结导出；改造后三次日结与它逐行一致）、`w2-b2-mps-mrp.txt`（五节 psql：max 合并两例手算、互斥 run 的 gross 恒等式与未覆盖 SOY 反例、确认转单回链、零漂移 diff、120 天窗 run）、两张 PNG（平台端主生产计划页两表格、mobile 端 MPS 查询真实对话报告卡）。
