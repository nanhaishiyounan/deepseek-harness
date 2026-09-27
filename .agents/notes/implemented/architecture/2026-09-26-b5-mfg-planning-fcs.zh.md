# Agent Note: B5 生产计划地基——BOM 版本、工作中心日历、approved ≠ released 两态分离与日桶贪心排产

Status: implemented

[English](2026-09-26-b5-mfg-planning-fcs.md) | 中文

## Problem

生产域在 B4 之后全缺：没有 BOM（配方/用量/损耗）、没有工作中心与产能日历、没有生产订单，更没有排产。06-b5 批次文档要求建立计划层——制造主数据 + 生产订单（挂 B1 审批引擎）+ 有限产能排产引擎（ERPNext 官方产能规划同构：日桶贪心、工序不跨天、忙则排队/切替代工作中心）。三个必须落定的设计点：MO 审批与下达的关系（approved ≠ released 两态分离）、排产的 what-if 三段交互（Preview → Apply → 冻结）、以及「无有效 BOM 不能建 MO」的建单卡口。

## Decision

- **BOM 版本与生效**：`mfg_boms` 的 `bom_status` 走 draft→active→retired 独立轴（非 B1 六态——BOM 是主数据不是审批单据），版本切换不删旧行（种子 BOM-0001 retired 保留审计）。建 MO 的卡口用 set 型 gate（`wfl_gate_configs`：downstream=mfg_orders, upstream=mfg_boms, upstream_field=bom_id, upstream_state_field=bom_status, required_status=active）——nb_create 与引擎 `enforceGates` 双入口同源拒绝，retired/draft BOM 一律拒。
- **工艺路线内联在 BOM（Odoo 方案）**：`mfg_bom_operations` 挂 bom_id，每工序 seq/工作中心/准备分/单批加工分/批量/替代工作中心（alt_workcenter_id 可空）。不建独立 Routing 表——与既有 MES 底稿结论一致。
- **approved ≠ released 两态分离**：MO 的 doc_status 审批段完全复用 B1 六态词汇族（`seedDocFlow(io, 'mfg_orders', …, { amountField: 'estimated_cost' })`，qty×std_cost 超 10 万两级加签），released/closed 是**审批后置业务终态**——不进审批词汇族、不经 `act()`，由排产引擎 `--release` 以乐观锁条件写（approved→released + released_at 回写），并自动跑一次 preview 存 `mfg_orders.preview_data`（下达即推送 mobile 读端）。正交轴 `reservation_state`（none/partial/assigned）留 B6 写。这个切分的依据：released 是「下达」动作而非审批动作（`act()` 只接受 approve/reject/void），closed 是完工动作（B6）——硬塞进词汇族会污染所有单据共用的六态机。
- **日桶贪心排产（`mfg-schedule.mts`）**：纯函数核心（planForward/planBackward）+ REST CLI。时长公式 `planned_min = setup_min + ceil(qty/batch_size) × run_min × 100 / efficiency_pct`（Odoo time_efficiency + ERPNext batch_size 摊销）。日容量 = 班次跨度（分钟）× capacity_parallel；周日与工作中心日历（mfg_holidays 按 calendar 列共享）为非工作日。前推：从 max(today, released_at) 逐道 find_slot，后道扫描起点不早于前道日（父件不得早于子件完工）；主 WC 连续 3 个工作日满载切 alt_workcenter（Odoo alternative_workcenters）；连续 14 个工作日排不进落 overload 标记。占用桶 `wcId:date → Σplanned_min`，跨 MO 冲突排队读同一桶表（apply 顺序即排队顺序）。
- **Preview/Apply 冻结语义（what-if 三段）**：`--preview` 纯计算输出 JSON 不落库（approved/released 可看，draft/pending 一律拒——未生效不得排产）；`--apply` 仅 released 可写（approved 也拒——两态分离的卡口体现），写 `mfg_order_operations` + planned_start/end；已 apply 的 MO 再 apply 拒（冻结），重排必须先 `--void` 清排程。`--latest-start` 后推：从 need_date 倒排关键路径，首道最晚开工日 < today 输出负向时间告警（建议改期/拆单/外协）。
- **不跨天产品边界（合同话术）**：工序时长超过工作中心单日总容量时**永无解**——overload 标记 +「建议拆单或外协」文案，绝不把一道工序拆到两天（ERPNext 官方约束同款）。这是对客户必须前置沟通的产品边界，不是实现细节。
- **mobile 三处**：formRegistry +2（BOM 登记头简化/生产订单，组件行与工序在平台维护）；persona 注册表第 11/12 条 + 生产查询技能（MO 状态查询四指标卡：审批状态/下达日期/建议开工/建议完工；排产结果查询三级回退：operations 行 → preview_data 快照 → 如实说未排产）。

## Notes

- **词汇族不扩的裁决**：任务提示说「词汇族机制可扩生产单族」，实现裁决是不扩——MO 审批段与六态机完全同构（draft→pending→`level2`→approved），无新增审批态；released/closed 是审批后的业务推进（同 w3 的 RFQ sent/closed、PR converted 先例：engine CLI 内 `updateWhere` 条件写，不走 `act()`）。新增一个 state_field 族会要求 `vocabularyForStateField` 注册、`readState` 分流、nb_approve 工具面同步——全部是无增量语义的成本。
- **日历遍历坑**：`tryPlace` 的逐日扫描必须**每步**校验 isWorkingDay（周日/节假日 skip 不计排队天）——初版只在入口 roll 一次，selftest ③ 的「9-27 周日被排产」当场暴露；selftest 的日期断言因此加了周日/节假日显式检查。
- **后推负向的演示口径**：--latest-start 用 need_date 压缩演示负向告警后必须还原；失败残留（崩溃在压缩态）以「还原值取 max(原值, today+种子偏移)」自愈，否则压缩 need_date 会持久化污染后续批次。
- **LLM 编号撞号实录**：mobile 建 MO 时模型自造 code 复用了已有编号（MO-2026-0002 撞号落库）——persona 编号规则补强为「先 nb_list 读现有最大 NNNN 再 +1，绝不复用已有编号」；数据侧已修正为 MO-2026-0003。编号唯一性当前靠 prompt 纪律，B6 若再现应考虑引擎侧 code 唯一守卫。
- **preset YAML 缩进坑**：persona `text: |` 字面量块内新增段落必须保持 6 空格缩进——一段 5 空格导致 `bad indentation of a mapping entry (71:6)`，preset 挂载失败表现为「发送无反应」（session.prompt 返回 internal error）。改动后用 js-yaml 解析一遍再同步 `.dsh` 拷贝是廉价护栏。
- **qty_per_unit 小数显示**：v2 表格 DisplayNumberFieldModel 对 0.062 这类三位小数显示为 0（列渲染精度），数据侧无损失（psql 原值正确）；如需精确显示属页面渲染层后续优化，不影响引擎口径。
- **MO-2026-0003（mobile 建）留 draft**：真实对话建单的草稿保留为 draft 态，链路演示用 MO-1/MO-2——用户可见「登记即草稿」的正确形态。

## Evidence

- 排产引擎 [`mfg-schedule.mts`](../../../../examples/kb-agent/scripts/mfg-schedule.mts)：纯函数 planForward/planBackward + --preview/--apply/--void/--release/--latest-start + --selftest 四断言（超载告警/替代 WC 切换/不跨天/后推负向）全绿。
- 域脚本 [`nocobase-w5-mfg.mts`](../../../../examples/kb-agent/scripts/nocobase-w5-mfg.mts)：7 集合 + 8 组件物料 + 2 工作中心 + 9 节假日 + 3 BOM（retired v1/active v2/active 水饺）+ 2 种子 MO + flow/gate + 5 页（生产制造组）+ --demo-chain（卡口负例×3：retired BOM 建单拒/draft apply 拒/重复 apply 冻结拒；MO-1 单轮审批、MO-2 两级加签；冲突排队 9-26 vs 9-28；void→重排；后推负向）全绿幂等。
- psql 只读断言 [`b5-psql.txt`](../../../../research/2026-09-25-w-round/b5-psql.txt)：BOM 版本生效/审批全序列（submit/approve/pending_level2）/released_at 回写/reservation_state=none/排产同工序同日/两单 WC-ASSY 顺延对比/gate 行/flow extras（amount_field=estimated_cost）。
- 双端取证 `research/2026-09-25-w-round/b5-*.png`：admin 5 页（BOM 管理/BOM 工序/工作中心/生产订单/排产看板）+ mobile 真实 LLM 三段（MO 状态查询——排产结果报告卡 3 工序表 + 齐套提示；建 MO 草稿卡——BOM 推导/金额阈值话术；确认落库回执 №3）。preview JSON 原件 `b5-schedule.json`；链路日志 `b5-chain-log.txt`。
- [`setup-nocobase.mts`](../../../../examples/kb-agent/scripts/setup-nocobase.mts)：all 链插入 w5（w3 后、n18 前）+ verify B5 断言块（7 集合/5 页/组/flow/gate/retired 版本行/种子 floor）+ n18ai- 上限 56→62（w5 六个 Add-new 表单）。
- mobile 侧：[`formRegistry.ts`](../../../../packages/client/ui-mobile/src/client/formRegistry.ts)（12 表单）、[`rich.ts`](../../../../packages/client/ui-mobile/src/client/messages/rich.ts)（mfg_* 标签 22 条）、preset [`agent.cordis.yml`](../../../../examples/kb-agent/agent-presets/mobile-form-assistant/agent.cordis.yml)（+.dsh 拷贝同步）；`pnpm vitest run packages/client/ui-mobile` 623 全绿（form-registry spec 10→12）。

## Alternatives considered

- **无限产能排产**——D5 选有限产能日桶 FCS（冲突排队/换替代工作中心）；无限日期会承诺产能兑现不了的排期。
- **排产算术放 workflow update 节点**——⑪号坑：读-改-写在那里做不了；引擎独占。
- **跨天工序塞进一个日桶**——产品边界（拆单替代），合同话术前置声明。

## Consequences

日桶排程与「审批通过 ≠ 下达」两态分离自此是 MO 域的现行契约；排产预览不落库、apply 才写工序行。
