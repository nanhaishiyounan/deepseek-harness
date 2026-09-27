# Agent Note: W8/B8 质量域——实测 AQL 数组、走 B1 回调的四路处置与季度评分卡

Status: implemented

[English](2026-09-26-w8-quality-aql-disposition.md) | 中文

## 问题

B3 只在 `wms_receipts` 上留了 IQC 状态列（pass/fail/concession，手工 `--iqc`），B6 只在报工/完工上留了 IPQC/OQC 状态锚，检验单据、抽样数组、不合格处置、供应商绩效全部缺位。本批（plans/2026-09-25-mfg-closure/09-b8-quality.md）要落质量域：挂在收货/报工/完工上的统一检验单脊柱、可复算缓存的 GB/T 2828.1 抽样、经 B1 审计的让步在内的四路处置、供应商级 5 批 2 拒切换、从真实单据物化的季度评分卡——不绕过过账引擎、不破坏对账门禁。

## 决策

**AQL 查表是种子表，且只种实测三段。** `qm_aql_plans` 落 SQC Online 实跑取证的水平 II 单次正常数组（G 151-280/32、H 281-500/50、J 501-1200/80 × AQL 1.0/2.5/4.0，共 9 行）。判定（`--inspect`）按批量定段、查表、把 `n/Ac/Re` 缓存到检验单行上——每条判定只凭 psql 行即可复算；`d = 主要 + 次要`，`d ≤ Ac → passed / d ≥ Re → failed`，严重缺陷一票拒收（严重 0 收 1 拒）。种子外的段 fail-loud——补全 15 段得先转写箭头规则解析后的数组（企业版范围，凭记忆转写无据）。

**加严是降一档查表，不是第二张表。** 切换状态复用既有的 `srm_suppliers.iqc_level`（normal/tightened 本就是 SRM 手工评估轴），B8 只新增 `reject_streak`。每条 IQC 判定后引擎数该供应商最近 5 张已判定单：normal 下 ≥2 拒 → tightened，tightened 下连续 5 批过 → 回 normal。加严判定取严一档的 AQL 行（`AQL_LADDER = 4.0 → 2.5 → 1.0`），与实测句完全吻合（G/2.5 加严 = G/1.0 = Ac1/Re2）。放宽与停检未落（企业版范围）。

**挂点检验单由引擎创建，业务键幂等，集合未建时 explained-skip。** `postReceipt`（PO 来源）、`postJobReport`（qc_status=pending）、`postCompletion` 各自在尾部调建单函数，键为 (insp_type, ref_no)；`nocobase-w8-quality.mts` 建 `qm_*` 之前该函数打日志跳过——all 链里 w3/w6 先于 w8 跑，它们的 B8 前重放必须保持绿。`inspectInspection` 把判定回写锚单（`receipts.iqc_status` / `reports.qc_status` / `completions.oqc_status`），既有放行卡口继续读自己的列，无需改动。

**让步走 HTTP 到 B1，不走动态 import。** `disposeNc` 最初用 `await import('./approval-engine.mts')`——approval-engine 静态 import 本模块，而当 h5 是 CLI 入口时它的顶层 `await main()` 让模块记录停在 evaluating，二者互等死锁、Node 以 unsettled await 终止。修复：submit+approve 走引擎既有的 `:13110` serve——与页面 workflow request 节点同一入口——「一个引擎两个入口」保持成立，serve 未起时 fail-loud。让步缺 `approver` 或 `deviation_note` 即拒；四路都落 `wfl_approval_records`（submit 质量部 → approve）。

**处置经引擎过账，新增两种流水类型。** `RETURN_VENDOR` 把拒收批从待检库位出账；`SCRAP` 过账到 Inventory-Loss 对手并按 VWAP 结 `scrap_cost`；让步走既有 `releaseReceipt` 放行并标记批次 `concession_flag`、检验单改判 concession；返工铸 `source=rework` 的 MO 草稿。三方勾稽靠流水的 `doc_no` 携带处置单号——verify 断言反向（每条 RETURN_VENDOR/SCRAP 流水必须指向 approved+closed 的 QM-NC 行）。

**`seedDocFlow` 对无金额单据类型丢弃金额条件。** B8 是第一个没有金额列的 `seedDocFlow` 调用方；旧改写在未重写时保留 `total <= 100000`，`act()` 评估 undefined 字段即失败。引擎修复：`amountField` 缺省时条件置空；w8 主流程对已 seed 的残留 transition 做一次性剥离。

**h5 持全量 `move_type` 枚举。** B8 的整写曾抹掉 w7 增量附加的 `SHIPMENT_SO`（整写探针只看最新值）；h5 的列表现在含 w7 的全部值，w7 的附加守卫不再触发。`n18-form-ai` 的 flowModels 页长同步 3000 → 6000（B8 五页把模型树推过旧上限）。

**评分卡是季度物化的真实单据聚合。** 质量 = 窗口内 IQC 批合格率；交期 = 准时收货（`received_at` vs PO 新增的 `expected_date`，无日期按准时计、全无日期取中性 60）；价格 = 最便宜供应商均价 ÷ 本供均价；服务 = 100 − 10 × 未关闭 CAPA 数；合规 = 最近审核评级映射。权重 40/30/20/10 为**行业惯例（未溯源）**（SAP MM 默认值始终未取得原文——在此如实记录）；服务维以 CAPA 数替代无据的人工评分。D 档打 `restricted` 生命周期建议日志；切换本身留人工走 B1。

**CAPA 草稿由引擎写，不经 workflow。** `qm_inspections` 的 update-mode collection workflow 做不到重放去重，会与引擎自身的幂等创建双开；引擎在 failed 判定时按 title 幂等创建，并经新增的 `srm_capas.inspection_code` 回链。

## Consequences

每个过账面现在都锚自己的检验单，判定由引擎单次写入；供应商切换计数随每条 IQC 判定推进；反向勾稽（处置流水必须指向 approved+closed 的 QM-NC 行）成为常驻 verify 下限。


## 备选方案

- **凭记忆种全 15 段**——记忆转写的数组无据；只种三段实测、段外 fail-loud 才是诚实的。
- **单独的 `iqc_switch_state` 列**——`iqc_level` 用的就是这套词表；再加一列会把一个事实拆成两个家。
- **mobile 对话直接写判定**——对话读种子表渲染建议卡，但落库 `result=pending`；只有引擎 `--inspect` 写判定（可复算、single-shot）。
- **dispose 内直接 import approval-engine**——h5 CLI 入口死锁；serve 回调是同一引擎且无环。

## 验证

`nocobase-w8-quality.mts --demo-chain` 走通全链（PO → 六张挂点收货 → AQL 判定含放行卡口负例 → 退货 + 让步处置 → 5 批 2 拒切换 → 下一批降档数组 → 季度评分卡 → AVL 四联查负例）并在重放时复核终态；返工与报废两路在第七张挂点批上实跑。`setup-nocobase.mts verify` 持有结构下限（四集合、五页、九行种子、六列增量、两种流水、活跃 flow config、反向勾稽、n18ai- ≥ 78）。证据：research/2026-09-25-w-round/ —— b8-psql.txt（七组断言，加权复算 68=C）、b8-aql-cases.txt（判定阶梯）、b8-admin-*.png（处置看板/质检单/评分卡）、b8-mobile-*.png（真实 LLM 的 AQL 建议卡与质检查询卡）。
