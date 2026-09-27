# Agent Note: W6/B6 生产执行——三量模型、完工先待检的 OQC 卡点与成本双列

Status: implemented

[English](2026-09-26-w6-mfg-execution.md) | 中文

## 问题

B5 把生产域停在计划边界：MO 走完审批与下达、FCS 引擎冻结了日桶，但没有任何执行。本批次（plans/2026-09-25-mfg-closure/07-b6-mfg-execution.md）要在 B4 预留引擎（唯一 ATP 事实源）之上落地执行环——齐套检查、领料/退料、工序报工、完工、OQC 放行——外加成本双列，且不得破坏 `stock == Σmovements` 对账门禁与 B5 的审批轴。

## 决策

**三量模型走产出当量，不走材料求和。** `mfg_orders` 在既有 `qty` 旁新增 `qty_transferred` 与 `qty_consumed`：transferred 是净领料折算的产出当量（对 BOM 组件取 `min Σ(领料 − 退料) / (单位用量 × (1 + 损耗率))`），consumed 是**末道工序**的累计报工量（产出；中间工序报的是自身通量）。跨混合单位（kg + 个）的材料和只是台账噪声，且首工序报工不代表产出——完工卡的是末工序读数。

**齐套 = 逐组件 ATP + 同动作硬预留**（PLAN D6/D7）。`availabilityCheck` 对每个组件重算 `qty_available` 合计对比 `单位用量 × (1 + 损耗%) × 订单量`，覆盖的组件走 B4 `reserve()`（FEFO 定批、`RSV-MO-{单号}-{序号}` 编码、`ref_type=MO`），判定与缺口清单落 `mfg_orders.reservation_state` / `kit_data`——mobile 齐套卡直接读该 JSON，不自行重算。部分齐套预留可覆盖部分（Odoo partial reservation）；补货后重跑会先释放本 MO 早前的预留，让 FEFO 重选看到变大的池子。

**WIP 腿是真实库存库位，领退料走 ± 流水对。** 第三个虚拟区 `SH-WIP`（车间线边）与 `SH-ADJ`/`SH-TR` 并列，各一库位。`postIssue` 卡 `released/in_progress` + `reservation_state=assigned` + 组件累计 ≤ 预留（超领被拒），消耗预留（分配量回退；现有量写属于过账腿——B4 两段式契约），随后库存 预留库位 → WIP 走 `ISSUE_WIP` ± 对。`postReturn` 以 `RETURN_WIP` 镜像回合格库位；预留保持已消耗（退料是纠正，不是取消预留）。首次领料推进 `released → in_progress`。

**报工卡 in_progress 且工序累计 ≤ MO 量。** `postJobReport` 拒绝未执行中的 MO（未 released 不能领料/报工——更严的 in_progress 形态，报工隐含材料已动），推进工序 planned → started → done（报满 MO 量即 done），落 IPQC 挂点 `qc_status`（默认 `not_required`；B8 深化）。完工拒绝任何未完工序（末工序报齐）与任何超过末工序累计合格数的数量。

**完工先待检后放行，放行复用 B3 模式。** `postCompletion` 建成品批次（按 `shelf_life_days` 推四日期，postReceipt 食品模型），以单条 `RECEIPT_MFG` 流水落**待检区 hold**，置 `oqc_status=pending`、MO 推进 `completed`，同一过账内结算成本。`releaseCompletion` 是 `--release-receipt` 的同构：跨库位 hold → good 走 ±`MOVE` 对、批次 → qualified、`oqc_status=passed`；failed/concession 拒绝（B8 管处置）。成品对销售订单的预留是 B7 挂点——记录，未实现。

**成本双列在完工时结算，不进会计凭证**（PLAN D11）。`std_cost` 重写为 BOM 标准卷算总额（`Σ 需求 × hub_inv_products.unit_price + Σ 工序 planned_min × 费率`）——该列在 B5 的单位成本读法是计划期估计值，其审批路由已消费 `estimated_cost`，完工时覆盖无损失；`actual_cost` = `Σ(领料 − 退料) × VWAP + Σ 报工工时 × 费率`，`cost_variance = 实际 − 标准`。VWAP 对每条正向流水按可解析的入库价（流水的单据能追溯到带 PO 的收货时取订单行 `unit_price`，否则取物料主数据价）加权——`wms_movements` 按设计没有金额列，估值读流水的对手单据而不是加列。

## Consequences

执行列（三量/成本双列/齐套明细）与 `in_progress`/`completed` 终态进入 mfg_orders 契约，后续批次全部按此读；ISSUE_WIP/RETURN_WIP/RECEIPT_MFG 三类流水进入共享总账；完工默认先上待检区、OQC 放行才转合格。


## 备选方案

- **`qty_transferred`/`qty_consumed` 用材料求和**——混合单位让数字无意义且无法手工核账；产出当量 min 可对 psql 台账核。
- **`kit_status` 列 + 客户端推导**——mobile 的 LLM 做不了 BOM 展开；持久化 `kit_data` 让读端只是一次 `nb_list`。
- **OQC 用布尔值**——五值词汇（`not_required/pending/passed/failed/concession`）对齐 B3 IQC 挂点，B8 复用形状而不是迁移。
- **按完工单件成本**——批次 checkbox 要的是 MO 行上的三列；单件成本报告侧相除即得。

## 验证

`nocobase-w6-mfg-exec.mts --demo-chain` 走完整环含四个卡口负例（draft 齐套拒、partial 领料拒、超领拒、完工超量拒）并断言终态；`setup-nocobase.mts verify` 持有跨批次下限（集合、五页、列、枚举终态、WIP 区、流水腿、种子下限、MO-2026-0003 保持 draft）；每个过账动词之后都有对账门禁。证据：research/2026-09-25-w-round/b6-psql.txt + b6-*.png。
