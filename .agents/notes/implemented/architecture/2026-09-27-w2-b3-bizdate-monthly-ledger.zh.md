# Agent Note: W2-B3 业务时间列 + 月度收发存台账

Status: implemented

[English](2026-09-27-w2-b3-bizdate-monthly-ledger.md) | 中文

## 问题

99 遗留 #10（半项）：WMS 业务集合无业务时间列，`wms_movements` 流水只能按 id 序重放——月度收发存不可算、KPI 库存类历史回 null（B4 的直接前置）。`wms_counts` 的盘点日完全依赖解析 `CNT-YYYYMMDD` 键段。03-b3 批次要求：两张台账补 `biz_date` 列、全部 movement 写入收敛到统一 helper、一次性存量回填（归零断言）、`wms_monthly_balances` 快照（量/值双轨）幂等重算 + 差分对账、NocoBase「月度收发存」页——且回填前后 `Σmovements == stock` 对账门禁都必须绿。

## 决策

- **`appendMovement(token, fields, bizDate?)` 是唯一的流水写入者。** `nocobase-h5-wms.mts` 内 22 处调用点（种子、postShipment、postReceipt、releaseReceipt ±对、postTransfer ±×2 段、postAdjust、postCountAdjust、rebalanceLedger ×2、postIssue ±、postReturn ±、postCompletion、releaseCompletion ±、disposeNc 退货/报废）加两处跨文件点（[`mrp-run.mts`](../../../../examples/kb-agent/scripts/mrp-run.mts) shipSo 的 SHIPMENT_SO 与 [`nocobase-w6-mfg-exec.mts`](../../../../examples/kb-agent/scripts/nocobase-w6-mfg-exec.mts) 的 B6 RECEIPT 种子，均 import 该 helper）全部走它。默认=沪日（`shanghaiToday`，UTC+8 固定偏移——kpi-run 日界的孪生）；种子行重放 doc_no 编码的历史日期（`docEncodedDate`，RCV-/SHP-/TRF-/CNT-/ADJ-YYYYMMDD-nnnn）。收敛证明即 verify 覆盖门禁：绕过 helper 直 create（无 biz_date）当场红（实测 BYPASS-B3-NEG-1 →「biz_date NULL on 1 row(s) … direct creates bypassing appendMovement are forbidden」）。
- **回填优先级阶梯（现场裁定版）。** 批次文档的第 3 级（系统 createdAt）在本世界不存在：这些集合建表时未开 timestamps，阶梯实际落为 ① 关联单据业务日期（`wms_receipts.received_at`、`so_orders.shipped_at`）> ② 单号编码日期 > ③ id 序锚点线性内插，行 note 打 `biz_date estimated` 标记。内插月份精确（锚点密集——演示链聚集在少数几天），127 行中 50 行走了内插（BAL-*/MI-/MC-/QM-NC-/RCV-B6-* 无日期段）；批次文档「残行个位数」的预估以 createdAt 存在为前提。分月分片 UPDATE → 两集合归零断言 → counts 列 vs 编码 diff 清单（列为准；实测 0 冲突）。
- **counts 切到列口径。** `wms_counts.biz_date` 回填自 CNT 编码日期（其自身业务键）；kpi-run 消费侧列优先（`countRowDateOf` = biz_date || 键解析），编码解析降级为兜底——count_accuracy 数值不变（回填列/码 0 冲突，两口径重合）。
- **`wms_monthly_balances` 是重放缓存，绝不是第二账本。** `monthlyBalancesOf`（纯函数）按 (biz_date, id) 排序，opening(t) = 该月首日前净额（首月=流水自身净额），in = Σ正腿、out = Σ|负腿|——于是 `期初+收−发 ≡ 期初+净额` 由构造保证，六类映射（收 = PUTAWAY/RECEIPT/RECEIPT_MFG/RETURN_WIP 入/ADJUST 正/COUNT_ADJUST 正/调拨入腿；发 = PICK/SHIP/SHIPMENT_SO/ISSUE_WIP 出/RETURN_VENDOR/SCRAP/盘亏/调拨出腿；MOVE/ISSUE_WIP/RETURN_WIP ±对两侧等额各计、净额为零——Odoo/ERPNext 调拨成对口径）只是呈现层，不可能破坏恒等式。值 = 数量 × 现值 `movingAverageCost`（行 note 声明「成本口径=现值移动加权，非期间加权」）。`--snapshot-month <YYYY-MM|all>` 逐期 destroy-then-create（幂等、可纠历史）；`--recalc [月]` 从流水自身推月清单（绝不信任可能被污染的快照表），全部重建完统一断言一次。
- **快照对账**（`assertMonthlyBalances`，挂 snapshot/recalc/verify）：每 (product, period) 存量行与新鲜重放在四个数量上相等，相邻期连续（bal(t) == opening(t+1)）。实测：量/值双轨污染（in_qty/bal_qty +999、bal_val=888888、opening_qty=777）被 `--recalc` 完全恢复；干净态再跑 diff 为空。
- **verify + all 链。** setup-nocobase verify 增覆盖门禁（movements/counts biz_date 100%）、快照对账（重放+连续性）、`wms_monthly_balances` 行数下限；all 链在全部模块脚本之后（此时所有写入者都已走 helper）、KPI 回算之前跑 `--backfill-dates` + `--snapshot-month all`。

## 注意

- **recalc 循环内全表断言死锁（实战发现）。** 第一版 `snapshotMonthlyBalances` 在每次单月重建后全表 assert：一个月已重建、另一月仍污染时，断言在循环轮到污染月之前 crash——污染月永远得不到重建（自锁）。生成函数不得在多单元循环内全表断言；CLI 在整趟结束后统一断言。值得记住的症状：「recalc 成功」日志 + 污染值纹丝不动。
- `id > 127` 陷阱：NocoBase id 因历史 destroy 存在空洞，`WHERE id > <末见>` 会把幸存旧行误判成新行——数行数，别从 id 间隔推断。
- psql 里 `bal_qty <> opening+in−out` 的命中是 double 精度伪影（0.05/2258.05 求和）；numeric 转换后精确相等，引擎门禁全部走 0.01 容差。
- estimated 行是一次性迁移痕迹：新过账都带 helper 日期，estimated 占比只降不升。全新安装回填后 estimated 接近零（种子行基本都带编码日期）。
- 种子双重写（RECEIPT+PUTAWAY 双正腿）保持 W 轮历史并由 BAL 补偿行吸收；月度 in 合计因此含两腿——有意为之（台账重放「实际存在」而非「理应如此」）。

## 证据

- `research/2026-09-27-w2-evolution/w2-b3-backfill-assert.txt`——回填前后对账门禁（31→32 组绿）、归零断言（127/127、counts 6/6）、快照对账、污染恢复 + 幂等重算 diff、两个 fail-loud 负例（2099-13 → exit 1；旁路 create → verify 红 → 清理 → 绿）。
- `w2-b3-backfill-sample.txt`——10 单抽样（biz_date == 编码日/received_at/shipped_at）、estimated 行锚点夹逼日期、按月分布、归零复核、过账后新行（PUTAWAY/MOVE±/ADJUST± biz_date=当日）。
- `w2-b3-snapshot-cases.txt`——psql 手算对账：product 8 × 2026-08（首月 opening==全量重放净额==0，520/0/0/520）、× 2026-09（520+5740−3325=2935 == 快照）、逐 move_type 分类聚合、19 行恒等式全表扫。
- `w2-b3-ledger-page.png`（两月台账页）+ `w2-b3-mobile-ledger-query.png`（真实对话：直查 `wms_monthly_balances` 读出 520/5,800/3,325/2,995 并校验恒等式 + 口径差异说明）。
- 引擎面：`--backfill-dates` / `--snapshot-month` / `--recalc` / `--assert-monthly` / `--selftest-b3`（纯函数层：编码日期含非法日期拒绝、六类映射、首月净额、调拨对冲净零、连续性、重放幂等）。

## 备选与否决

- **立即 NOT NULL（Contract 阶段）**——拒绝：回填 estimated 行的合法性恰恰依赖列可空；在 estimated 尾巴清空前，归零断言才是可执行的替身。
- **纯重放不落快照**——拒绝（调研 §3.6）：KPI 面板每次全量重放成本不可控；快照是 ERPNext Stock Closing 同构，且天然与流水可对账。
- **createdAt 作回填第 3 级**——现场不可行（集合无 timestamps）；锚点密集的 id 序内插是诚实的兜底且逐行标注。

## 后果

本 Note 记录的决策自此成为对应面的现行契约（详见 决策 与 证据）。
