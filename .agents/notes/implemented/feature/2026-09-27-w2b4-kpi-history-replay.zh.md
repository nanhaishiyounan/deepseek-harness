# Agent Note: W2-B4 库存 KPI 历史——库存三码按 biz_date 重放 + 周转率两码月度落行

Status: implemented

[English](2026-09-27-w2b4-kpi-history-replay.md) | 中文

## 问题

B9 KPI 引擎把六个码锁在 `PRESENT_ONLY` 之后——每个历史日落 value=null，理由是「库存表不带历史」；库存板也一直没有周转率/周转天数（99 遗留 #10 后半）。W2-B3 拆掉了根因（`wms_movements.biz_date` + `wms_monthly_balances` 快照），于是 04-b4 批要求：库存三码（on_hand_qty / wip_qty / capital_occupied）移出 PRESENT_ONLY、按流水重放时点值；新增两个月度粒度码（inv_turnover_rate / inv_turnover_days）读 B3 快照；三码满足自校准断言 `重放(today) == 现值聚合`；其余 19 码与 W 轮基线逐行一致。

## 决策

- **on_hand_qty 重放全流水净额**——`Σ movements.qty WHERE biz_date ≤ :d`，含全部库区。这是唯一能闭合的重放：今日值等于 `SELECT sum(qty) FROM wms_movements`，而 `Σmovements == Σstock` 账实门禁（按 product×lot、全状态）证明它等于库存全量和。旧现值口径（Σ `wms_stock` WHERE status='good'）为 121,684.95，重放为 181,384；差值精确分解为 待检 24,486 + 线边 14,413.05 + 20,800（落在四个无库区行的 B6 种子库位上——悬挂的 to_bin 90/91 与空编码库存位 88/89）——写进快照 note 声明，不静默吞掉。
- **按库区分类重放已实测并被否决。** 用解析出的 from/to 库区过滤腿（良品区入、待检/WIP/差异区出）会在 28 个 (product, lot, zone) 组上漂移：W 轮种子留下单侧腿（TRANSFER 出腿 to 侧为空）、B6 种子腿指向已不存在的库位 id、RCV-B6 双写——这些对按物料的账实门禁不可见，但对任何按库区的重放是致命的。全流水净额是既有门禁已经背书的分区诚实聚合。
- **wip_qty 口径从 MO 量切换为线边滞留量。** W 轮值（`Σ mfg_orders.qty WHERE released/in_progress`）无法按日重构——MO 状态迁移没有历史化。重放对触 SH-WIP 库区库位的腿求和（ISSUE_WIP 入线边正腿 − RETURN_WIP 出线边负腿）；今日值等于 WIP 库区库存求和（14,413.05，实测精确相等）。KPI 名改为线边在制数量，如实描述它现在量的是什么。
- **capital_occupied = Σ 按物料重放净量 × 现值移动加权。** VWAP 直接用 h5 引擎自己的 `movingAverageCost`——import 而非复刻，价格规则一变不会在台账与 KPI 之间分叉（`fetchFacts` 里按物料的 REST 循环每次运行约 19 次调用）。成本=现值口径：历史成本回算超范围，每条快照 note 都写明。今日值从 Σ good stock × 主档价 切到 VWAP 基础（验收时 5,579,495.3889）。
- **PRESENT_ONLY 恰好保留三个流程计数码**（pending_approvals / shortage_alerts / inbound_lines）：「D 日当时开放着什么」无法从持久行重构，开放态计数的逐日重放只会是编造。它们的行保留 null 语义与 90 天连续性计数不变。
- **周转率两码为月度粒度、锚在月末日期。** `turnoverInputsOf` 仅当计算日是月末且当月有 `wms_monthly_balances` 行时给出输入；否则 `compute` 返回 null，`calcDayWith` 把 null 头视为「不落行、不 destroy」（新的 skip 语义——落行的 date+code+dim destroy-then-create 幂等语义不变）。rate = 当月 out_val ÷ ((Σopening_val+Σbal_val)/2)；days = 当月天数 ÷ rate。分子是运营口径（移动加权出库成本），**非财务 COGS**——开放问题 4 的口径声明随每条快照 note 下发。avg ≤ 0 → rate 落 null（绝不产 Inf）；rate ≤ 0 → days null（2026-08 是活的除零例：out=0、avg=16,810.98 → rate 0.0、days null）。
- **fetchFacts 对半 dated 台账 fail loud**：任何无 `biz_date` 的 `wms_movements` 行（B3 回填没跑过）或缺 SH-WIP 库区，都在写第一行快照前中止——无日期的腿会静默漏进每个历史日的净额。

## 注意

- 首次 backfill 留下 3 行 null 残留：改造前 2026-06-29 那次 pass 早于新窗口（6/30..9/27），其三码行从未被覆盖。delete 清掉；19 码基线 diff 不受影响（这些行不在对照码集内）。
- 2026-09 有快照但没有周转行：9/30 在未来，该月在窗口内永远到不了锚点。其手算 rate（897,715.01 ÷ 2,806,558.68 = 0.3199）作为公式见证记录在证据里，而不是一行数据。
- `capitalOccupiedOf`（旧的 good×主档价纯函数）随调用方一并删除；`dead_stock_ratio` 的 JSDoc 不再声称「movements 表没有日期列」（receipts 仍是其库龄锚点是设计使然，不再是缺列使然）。

## 证据

- `research/2026-09-27-w2-evolution/w2-b4-kpi-history.txt`——三码三个抽样日非 null（8/28=800 / 9/10=3,663 / 9/20=57,575），6/29 清扫后 null 行为 0；自校准三件套（重放今日 181,384 / 14,413.05 / 5,579,495.3889 == 三个独立现值聚合）；9/10 手算 Σ movements(biz_date ≤ 9/10) == on_hand_qty(9/10)；基于 `wms_monthly_balances` 的周转率手算（2026-08 rate 0 / days null；2026-09 0.3199 见证）；PRESENT_ONLY 三码 89 个历史日仍全 null；2026-08-31 之外零周转行；24 码覆盖；对改造前基线的 19 码 diff（两侧各 1,734 行，为空）。
- `w2-b4-baseline-snapshots.txt`——diff 所对照的改造前 2,007 行导出。
- `w2-b4-gates.log`——`--selftest`（重放三件套/月末锚点/周转率除零护栏）、`--reconcile`、setup verify（24 码 + 9 图 floor）、b9 s9、`--assert-ledger`、`--assert-monthly`。
- `w2-b4-inventory-dashboard.png` / `w2-b4-inventory-table.png`——库存看板，表格脊柱可见重放出的历史（今日 5,579,495 / 14,413 / 181,384，其上各日为各自时点值）。
- `w2-b4-inventory-charts.png`——backfill 后的图表区：资金占用折线带上完整 90 天重放曲线（流水起点 2026-08-28 之前为 0，其后升至 ~550 万峰值），周转率块以两码为类目正常渲染——唯一落行的 2026-08 月 rate 0.0 / days null，无可视柱；图块如实呈现零出库月份的真相。

## 备选与否决

- **按库区分类的良品腿重放**——实测后拒绝：单侧调拨腿、悬挂 B6 库位引用、无库区种子行造成 28 个 (product, lot, zone) 漂移组；全流水净额是既有账实门禁唯一背书的聚合。
- **用月度台账插值历史而非重放日流水**——拒绝：月粒度糊掉 90 天图表需要的月内事件，且快照是缓存——重放读的单一真相仍是流水。
- **wip_qty 维持 MO 量口径**——拒绝：MO 状态迁移不留带日期的痕迹，该码永远出不了 PRESENT_ONLY；线边滞留量可精确重放且与 WIP 库区库存分毫不差。
- **capital_occupied 历史成本回算**——拒绝（PLAN D6）：超出本批范围；重放量 × 现值移动加权、逐行声明口径，是诚实的边界。
- **周转率落日行（或无快照月也落月末行）**——拒绝：月度指标落日行会把一个月的故事讲 30 遍；快照没覆盖的月份没有可发布的真相——不落行好过编造一行。
- **给 KpiDef 加独立 `grain` 字段表达 skip 语义**——拒绝：`compute → KpiValue | null` 已在每个 def 实现的接缝上表达「该日不落行」；平行的 grain 开关只是把 null 重说一遍。

## 后果

本 Note 记录的决策自此成为对应面的现行契约（详见 决策 与 证据）。
