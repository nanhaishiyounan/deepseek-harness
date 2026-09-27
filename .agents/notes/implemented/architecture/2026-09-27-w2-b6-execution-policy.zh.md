# Agent Note: W2-B6 生产执行策略——MO 级齐套策略、超领比例与 FCS 拆单建议卡

Status: implemented

[English](2026-09-27-w2-b6-execution-policy.md) | 中文

## 问题

99 遗留 #5/#6（B6 承接的一半）：齐套检查全有或全无——`postIssue` 的 `reservation_state='assigned'` 门禁使部分缺料的 MO 无法「先领已齐组件」（紧急订单需仓库手工绕）；超领被全额拒绝（累计领量对预留需求）。FCS 日桶引擎把跨天长工序留在 overload note 的纯文字（W 轮 D5 合同话术）上，无结构化建议。06-b6 批要求两项策略 MO 级配置化且缺省即 W 轮行为，超载建议升级为结构化拆单建议卡。

## 决策

- **配置位是 MO 级两列，不是 wfl extras、不是 cordis.yml（PLAN D8）。** `mfg_orders` 增 `kit_policy`（select full_lock/partial_allowed，默认 full_lock）与 `overissue_ratio`（float [0,1]，默认 0）。理由：策略是单张订单的执行域属性——紧急订单自行放开而不动任何全局开关；wfl `extras` 位保持审批域（B5）。两列 additive 落地：w5 集合定义带列（新库一次建全），w6 `MO_COLUMNS` 增列（已有库 fields:create when missing）并一次性回填存量行为 full_lock/0——引擎另将 NULL 视作 full_lock/0（`moKitPolicy`/`moOverissueRatio`），因此 mrp-run 不带列新建的 MO 同样合规（verify 门禁容忍 NULL、拒绝其余域外值；负数/NaN 比例在引擎首次触达时 fail loud）。
- **partial_allowed 是新的非阻断齐套态，不是放松门禁。** partial_allowed 下 `availabilityCheck` 记 `reservation_state='partial_allowed'`（轴上第四个值，区别于 full_lock 的阻断态 `partial`）；已齐组件照旧落硬预留，缺料阶梯（组件/缺口/ETA）在 `kit_data` 完整保留（并新增 policy 字段），全缺仍记 `none`。`postIssue` 恒接受 `assigned`，另在 MO 选择加入时接受 `partial_allowed`——未齐组件仍在「无有效预留」上被拒（未齐组件无预留），且 `MO_EXECUTING_STATES` 不因策略放宽（approved 未 released 的 MO 齐套与领料都被拒）。
- **超领上限 = 预留 × (1 + ratio)；ratio 0 保持 W 轮拒绝。** `postIssue` 累计校验走 `issueCeilingOf(reservedQty, ratio)`；吃到余量的过账在领料行 note 追记「超领 N（overissue_ratio r）」（100×1.05=105 手算：预留未耗时单笔 106 携带上限原文被拒，105 过账并记超领 5）。
- **FCS 建议是不跨天口径下的结构化卡（PLAN D9 方案 B）。** `SlotDecision`/`PlannedOperation` 增可选 `suggestion`——`buildSplitSuggestion(wc, minutes, capacity, earliestStart)` 返回 `{ kind: 'split_suggestion', minutes, capacity, suggestedSplits: ceil(minutes / floor(capacity × 0.9)), perSplitMinutes: floor(capacity × 0.9), earliestStart, note }`（1200 分钟对 480 分钟/日 → 3 份 × 432 分）；前推/后推两个超载分支都携带，负向 slack 的后推计划返回 `expedite_suggestion` 卡（改期/拆单/外协）。note 保留人话版（W 轮措辞 + 具体拆分数字）——mobile 卡渲染 note，Preview 面板与 `preview_data` 携带对象。口径（工序不跨天；超日产能工序给拆单建议、需人工拆 MO）三处声明：mfg-schedule 模块头、排产看板 heading（flowModels title 已更新；见 Notes）、overload note 本身（批次文档的兜底条款）。
- **页面增量以独立 flowModels 行挂载（n18ai- 同构）。** 两个策略列在已建的 生产订单 与 MO 执行视图 表格上以 `w2b6-` 前缀 TableColumnModel 行落地（按 fieldPath 幂等）；reservation_state 枚举重写加入 partial_allowed。轻量 `--rollback-w2b6`（w2b6- 前缀为键）精确撤销本批——列、枚举、页面行、heading——不动 W 轮数据。
- **补种双 guard 加固 w6 库存幂等。** 本批 w6 重跑暴露一个潜在危害：`binBy('SH-A-02-07')` 返回 undefined 使 `Number(undefined)=NaN` 铸出空壳 bin 行并静默翻倍库存（破坏 `stock == Σmovements`）。seedRows 现在对 bin 行缺失的组件跳过补种，对种子 RECEIPT 已在账而库存行缺失的组件（环境损坏）也跳过（绝不自动修复），各带一行响亮日志。

## Notes

- **CreateForm 网格树无法原地加字段。** flowModels:get 不返回内嵌 `subModels` 树，重存 CreateFormModel 追加 FormItem 会覆盖丢树；两个策略字段的编辑保持为列默认值（新建行即 full_lock/0）+ REST——此处是对批次文档「表单加两字段」措辞的有意偏离，记录在案。
- **排产看板 heading 更新已落 flowModels 但运行中的前端仍渲染旧块标题**（schema 聚合缓存；硬刷新不能击穿）。口径的三处声明在数据层全部成立（模块头 JSDoc、已更新的 flowModels title、每条 overload note——note 已在排产看板表格内实时渲染），兜底条款覆盖页面位；平台下次重建客户端缓存时 heading 自会出现。
- **超领验收按单笔语义解读。** postIssue 每笔消耗预留，「累计 106」手算走预留未耗时单笔 106（诚实分支）；105 过账消耗预留后，任何再领在「无有效预留」上被拒——这是本批未改的 W 轮形态。证据驱动器重跑时只复验耐久痕迹（posted 105 + note + 被拒行仍 draft）。
- **本批暴露并修复的账本漂移：** w6 补种使 VEG/DMP-PKG 对单条种子 RECEIPT 翻倍；修复删除了重复/NaN-bin 行、回填缺失的 SH-A-02-07/08 库位行、按流水推导恢复投影（DMP-PKG 源位 19695 + WIP 305 = 20000）——此后 `--assert-ledger` 与 `--recalc` 对账双绿。MO-2026-0002 预留的 16160 分配账随损坏行删除而去（预留行本身存续；该演示 MO 保持 partial 不可领料——正是其 W 轮设计）。
- 演示 MO（MO-W2B6-00A/00B/00B2/01/02/03/05 + BOM-W2B6-DEMO/FULL/LONG + WC-W2B6）留库作为页面活样；负数比例探针 MO 在 fail-loud 取证后销毁（verify 默认值门禁保持全绿）。

## 证据

- `research/2026-09-27-w2-evolution/w2-b6-kit-cases.txt`——全链验收（33 项断言）：缺省零漂移前置（既有 MO 全部 full_lock/0）+ full_lock partial 拒 / assigned 领 100 过账（±ISSUE_WIP 对）/ ratio-0 超 1 即拒；partial_allowed 三段（落态 + 已齐组件硬预留 + 领料过账 + 未齐拒绝且缺料阶梯完整）；105/106 手算（106 携上限文本被拒、105 过账记超领 5、无 posted 残留）；状态门禁（approved 未 released 齐套领料双拒）；负数比例 fail loud；拆单建议卡（1200/480 → 3×432、note 完整、preview_data 落库）；`--assert-ledger` 绿。
- `w2-b6-psql.txt`——只读 psql 对拍：MO 策略全景、partial_allowed 的 kit_data 阶梯、±ISSUE_WIP 流水与 consumed 预留、105/106 行、被拒 draft、MO-03 零领料、preview_data 内结构化建议卡、按 (product,lot) 的对账（空结果=平衡）。
- `w2-b6-mo-policy.png` / `w2-b6-split-card.png` / `w2-b6-mo-exec-policy.png`——生产订单策略列与演示行、排产看板携带拆单建议卡 note 的超载行（拆 3 份 × 432）、MO 执行视图策略列。
- `mfg-schedule --selftest`（五断言含 ⑤ 拆单建议卡）与 `nocobase-h5-wms --selftest-b6`（策略/比例解析 + 105/106 手算 + fail-loud 负例）——均已接入 `setup-nocobase.mts verify` 的 W2-B6 块（列、枚举、逐行默认值域、双 selftest）。
- 零回归复跑：b9 `--stage s5`/`s6` PASS；`--assert-ledger` 绿；`--recalc` 对账绿；改动文件 oxlint 0/0。

## Alternatives considered

- **全局齐套策略开关（站点级）或 wfl extras 作配置位**——拒绝（PLAN D8）：策略按紧急订单逐单变化，不按站点、不按审批流；MO 行是唯一把放开范围精确限定在需要它的订单上的配置位。
- **跨天连续排程（方案 A）**——拒绝（PLAN D9）：日桶算法核心重写的风险大于价值；不跨天边界是 ERPNext 官方同构，结构化建议卡 + 口径显式声明让边界诚实可见而非隐藏。
- **多笔累计超领演示**——诚实解读：postIssue 每笔消耗预留，消耗后的「累计」拒绝实为无预留分支；验收走预留未耗时的单笔 106，不摆拍两腿累计。
- **CreateForm 原地补字段**——拒绝：内嵌网格树经 API 不可读回，盲重存会丢树；列默认值 + REST 编辑覆盖验收且无风险。
- **损坏策略/比例值静默回退**——拒绝：仅缺失/空回退 W 轮缺省；已存在的非法 kit_policy 或负数/NaN 比例在引擎首次触达时 fail loud（misconfiguration fails loud）。

## Consequences

本 Note 记录的决策自此成为对应面的现行契约（详见 决策 与 证据）。
