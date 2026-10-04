# Agent Note：W7-B4 经营/协同/看板日历 heal + v1 包覆 + B1 fieldEnum 补债（27 页）

Status: implemented

[English](2026-10-04-w7-b4-collab-kanban-heal.md) | 中文

B4 是存量改造第四批：24 个 flowModel 页（经营 5 个 w9kpi 看板 + 应收应付对账、项目协同 9、看板 7、日历 3、经营总览 JSBlock 壳、AI 工作台）加 3 个无 flowModels 的 v1 页——并清偿 B23 Note 点名列为本批前置的 B1 渲染面债。

## Problem

27 页经营/协同/看板/日历/v1——四个纯看板、三日历、两个 v1 甘特（按 W2/W4 裁决只做样式包覆）与 AI 工作台——都在 Forge 之前。

## Decision

- **B1 补债是 `--b1-debt` 模式而非独立脚本**（`examples/kb-agent/scripts/w7b4-heal.mts`）：复用 B23 的页圈定 `fieldEnum` 渠道，圈定 B1 的 22 个 schemaUid，经 `fields:update` 把 23 个 (collection, field) 的 `uiSchema.enum` 重写为 STATUS_PALETTE v3（英文线索阶段、purple `pending_level2`、支付方式彩虹色全部替换）。一个色板 + 一个 journal 服务两个范围；assert 保留 `b1FieldEnumMismatch=0/23` 常设项，债不能无声回潮。
- **看板泳道在块级 recolor，且字段枚举优先级更高。** `KanbanBlockModel.props.groupOptions` 色被重写，但 plugin-kanban 的 `getConfiguredGroupOptions` 让分组字段自身的 `uiSchema.enum` 内联选项覆盖保存列表——所以 fieldEnum walk 纳入全部看板分组字段（`so_orders.doc_status`、`hub_pj_tasks.status`、`qm_nc_dispositions.action`、`srm_capas.status`、`qm_inspections.status`、`mfg_orders.doc_status`），泳道 recolor 是双保险。`LABEL_OVERRIDES` 保住一词多义处的领域词汇（`blocked` 任务/项目=受阻 vs wms=冻结；`pending` 质检=待检；`open` wfl todos=待办）。
- **日历事件色是配置接线而非 CSS 补丁**：`CalendarBlockModel.props.fieldNames.colorFieldName` 接到各集合状态字段（5 块：交期日历 pur/so `doc_status`、计划日历 mps `doc_status` + mrp `status`、任务日历 `status`）。select 接口的 `useGetColor` 随后按 fieldEnum 渠道维护的同一 v3 枚举为 `.rbc-event` 事件条着色——单一事实源，实测三日历 4/3/3 种事件色。
- **w9kpi 五看板经 grid maps 重组**（leg17#1「名为看板实为明细表」）：每页一行 `metricChart` 统计卡（3-4 张）置 grid 头部、图表行前移、明细表殿后——经 `flowModels:save` 改写 rows/sizes/rowOrder，因为 sortIndex 不移动块（w6b10 教训）。**统计卡读最新快照日**（apply 时解析 `calc_date` 写入 filter）；首轮 apply 全历史平均出现 资金占用 ¥875K vs 当日 ¥11.07M——快照型指标必须钉住日，已建卡走 `statcardQuery` filter 刷新保证重放收敛。`statCardRaw` 增加 `alertWhen`/`alertColor`（`n>0` 或 `n<0` 时数字转 Negative 红 / Critical 橙）：临期预警 2 红、呆滞 0% 中性——leg17#2「好 0 与坏 2 视觉等价」在卡面解决。
- **v1 页走 globalStyle 包覆而非 heal**（plan B4 裁定：不重写组件）。甘特是自绘 SVG（`.gridTick`/`.gridRowLine`/`.today rect`/`.bar`/`.barLabelOutside`）；CSS 规则可覆盖 SVG presentation attributes，故在 `w7b0-theme.mts` GLOBAL_STYLE 追加 5 条规则：刻度+行网格锚定（leg18#1/#5）、今天列橙描边（leg18#6）、标签 `dominant-baseline: middle`（leg18#3）、选中条品牌描边（leg18#7）。甘特条本身已随 B0 token 换肤到 #1e4e8c。重放 `w7b0-theme` 幂等；B4 assert grep 主题行的包覆标记。
- **`statCardRaw` 的告警扩展向后兼容**（可选参数、默认数字色不变），`metricChart` 透传；B23 的 `statcardLegacy` 标记断言在重生成 raw 上仍通过。

## Verification

- `w7b4-heal --assert` OK：32 枚举列 colorMismatch=0 enumNoLeft=0、12 数字列右对齐+千分位、21 日期列统一格式、0 裸文本金额（一处误报已修：`wfl_flow_states.update_value` 是文本配置列，断言按 heal 同口径 gate 在 interface 上）、35/35 统计卡 forge 标记、20 列头筛选列表达 v3、**fieldEnumMismatch=0/32、kanbanLaneMismatch=0/40 道、calendarNoColor=0/5、kpiGridBad=0/5（卡行置顶）、b1FieldEnumMismatch=0/23、v1Overlay=ok**；24 个 flowModel 页全部出现在归属图。
- 活体 DOM 探针（`.w7b4-shot.mjs`，32 页含 5 张 B1 复截）：table 7/7 六检查点、kpi 11/11（卡行优先+形态面）、kanban 7/7 形态面、calendar 3/3 多色 `.rbc-event`（7/17/9 条）、v1gantt 2/2（刻度描边+今天描边+基线计算值）。经营总览/应用中心 shot-only（JSBlock 内部归 B5）。
- W6 回归：`w6b2-rules` assert 全过；`w6b9-cockpit` 需先 `--demo`（对账单/催收行是演练数据）再 assert 全绿——首轮三处失败是缺 seed，不是 heal。包覆重放后 `w7b0-theme --assert` OK；`pnpm run typecheck` exit 0；触及脚本 oxlint 0/0。

## Pitfalls pinned

- **import 兄弟批次脚本会执行其 CLI main**（`w7b23-heal.mts` import 即跑 `main()`，打印 usage 并置 exitCode 2）：跨批复用改为复制色板块——各批脚本自包含（w7b1 → w7b23 → w7b4）是承重约定，不是风格。
- **聚合型统计卡必须显式定口径**（kpi_snapshots 上 `value:avg` 会平均全部历史日）：快照指标 apply 时钉 `calc_date` 最新日，且日期移动后卡面刷新路径必须更新 filter——否则卡片展示「结构断言全过但数值错」（875K vs 11M）。
- **`percent` 单位快照值两种存储口径并存**（毛利率 −2.18 是百分数值、账实相符率 0.9825 是比例）：卡面盲 ×100 必然写坏一边。留作 kpi_snapshots 数据侧口径债，不粉饰。
- **形态面的 DOM 断言要打形态面的真实选择器**：日历事件是 react-big-calendar 的 `.rbc-event`（类名稳定），看板泳道与 grid 是 CSS-in-JS（类名不稳）——后者断言走 `.ant-tag` soft 检查 + schema 面 heal 断言，视觉复核确认探针计数的条色。
- **截图视觉复核会误读已修正的卡面**（按修正前的口径报色）；修正后复核确认 临期 2 红 / 呆滞 0% 中性。截图证据与计算值配对，不能互相替代。

## Alternatives considered

把四看板三日历重建成 v2 原生形态 vs 表皮级翻新——W6 形态已验证、W7 是纯视觉轮，形态保持不动。

## Consequences

- B6 终验重跑 `w7b4-heal --assert` + 截图 rig；kpi 卡的 `calc_date` 钉定意味着新快照日后需重放一次 apply（幂等，含 `statcardQuery` 刷新）推进卡面。
- 批次回滚是一个 journal（`b4/w7-b4-heal-rollback.json`，138 条：41 fieldEnum + 17 fieldOptions + 16 statcardAdd + 16 statcardRegen + 16 statcardQuery + 10 columnOptions + 10 gridLayout + 7 kanbanOptions + 5 calendarColor）逆序重放；statcardAdd 销毁新建块，gridLayout 还原布局映射。
- 遗留顺延：kpi_snapshots percent 口径分裂（数据侧）；经营总览/效期看板/维保日历 JSBlock 内部（B5 层 3b）；看板卡内部保持平台渲染（泳道色+卡面 Tag 是本批拥有的块级面）；v1 甘特进度填充/里程碑菱形无组件重写不可得（W2/W4 裁定维持）。
