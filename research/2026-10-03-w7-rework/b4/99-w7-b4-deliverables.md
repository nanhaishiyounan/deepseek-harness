# W7-B4 交付索引：存量改造第四域（经营/协同/看板日历/v1 包覆 27 页）+ B1 fieldEnum 补债

> 批次：plan-w7 §4 B4（经营 5 + 项目协同 9 + 顶级 2 + 看板 7 + 日历 3 + v1 3 = 27 页，flowModel 面 24 页 + v1 包覆 3 页）。实施 2026-10-03/04。B2+B3 的 w7b23-heal 页圈定/fieldEnum 渠道为基座；本批新增 B1 补债模式、看板/日历块级 forge、w9kpi 网格重组与 v1 globalStyle 包覆。

## 主体改动

| 文件 | 内容 |
|---|---|
| `examples/kb-agent/scripts/w7b4-heal.mts` | 新建：27 页 heal（--dry-run/--apply/--assert/--rollback + --b1-debt）。B4_PAGES 页圈定；STATUS_PALETTE = B23 全表 + B4 域补值（任务/项目/里程碑/工单/CAPA/NC 处置动作/wfl 动词/优先级四档/KPI 单位）；LABEL_OVERRIDES 一词多义护栏（blocked=受阻 vs 冻结、pending=待检、open=待办）；渠道：w7b23 六类 walk + fieldEnum（含看板分组字段）+ **kanbanOptions 泳道 recolor** + **calendarColor 事件色接线** + **kpi 重组（metricChart 统计卡行置顶 + 图表前移 + grid maps 重写）** + statcardRegen |
| `examples/kb-agent/scripts/nocobase-flow-page-lib.mts` | `statCardRaw`/`metricChart` 增加 `alertWhen`/`alertColor`（数值条件告警着色：n>0 红/橙、n<0 红；向后兼容默认不变色） |
| `examples/kb-agent/scripts/w7b0-theme.mts` | GLOBAL_STYLE 追加「W7-B4 v1 gantt 定向包覆」段（.gridTick/.gridRowLine 网格锚定、.today rect 橙描边、.barLabelOutside 基线、选中条描边）——v1 三页无 flowModels，按 plan 裁定不重写组件 |
| `research/2026-10-03-w7-rework/b4/.w7b4-shot.mjs` | 27 页 after + 5 页 B1 复截 + 分形态 DOM 断言（table 六检查点 / kpi 卡行优先 / kanban 形态面 / calendar `.rbc-event` 多色 / v1gantt 计算样式） |
| Agent Note 三件套 | `.agents/notes/implemented/architecture/2026-10-04-w7-b4-collab-kanban-heal.{md,zh.md,i18n.yaml}` |

## heal 命中面

| 模式 | 命中 |
|---|---|
| `--b1-debt --apply` | fieldEnum=23/23（B1 22 页全部 (collection,field) uiSchema.enum → v3；英文线索阶段/purple pending_level2/支付方式彩虹清零） |
| `--apply`（B4 域） | recolor=17、columnOptions=10、fieldEnum=18（B4 域列 + 看板分组字段；so_/pur_ 共享对已被 B1 补债先清）、kanbanOptions=7（七看板泳道全量 recolor）、calendarColor=5（五日历块事件色接线）、statcardAdd=16（五页统计卡行）、statcardQuery=16（口径修正：filter 钉 calc_date=最新快照日）、gridLayout=5（五页 rows/sizes/rowOrder 重组）、statcardRegen=16（协同六页旧 w4b3 卡升级） |

journal 138 条（41 fieldEnum + 17 fieldOptions + 16 statcardAdd + 16 statcardRegen + 16 statcardQuery + 10 columnOptions + 10 gridLayout + 7 kanbanOptions + 5 calendarColor），`w7-b4-heal-rollback.json` 逆序重放（statcardAdd 销毁块、gridLayout 还原映射、fieldEnum 还原 uiSchema.enum）。

## 27 页清单与改造

| # | 页 | 域 | 改造 |
|---|---|---|---|
| 01 | 经营看板 | 经营 | 统计卡行×3 置顶（当月收入/毛利率 ltZero 红/待审批 nonZero 橙）+ 图表前移 + 明细殿后 |
| 02 | 供应链看板 | 经营 | 卡行×3（OTIF/准时到货率/缺料预警 nonZero 红）+ 重组 |
| 03 | 生产看板 | 经营 | 卡行×3（FPY/RTY/计划达成率）+ 重组 |
| 04 | 库存看板 | 经营 | 卡行×4（资金占用/呆滞占比 nonZero 橙/**临期批次 nonZero 红**/账实相符率）+ 重组——leg17#1/#2 清偿 |
| 05 | 应收应付对账 | 经营 | 卡行×3（应收 ltZero 红/应付/待审批橙）+ 重组；四表数字/日期/枚举列同口径 |
| 06 | 任务列表 | 协同 | statcardRegen×3 + hub_pj_tasks.status/priority fieldEnum |
| 07 | 项目 | 协同 | statcardRegen + projects.status（脏值 Active/Done/On hold 英文残留 v3 化） |
| 08 | 里程碑 | 协同 | statcardRegen + milestones.status（pending=待达成 override） |
| 09 | 工单 | 协同 | statcardRegen×3 + tickets.status/category fieldEnum（八类工单态+类别中性化） |
| 10 | 知识文章 | 协同 | statcardRegen×2 + articles.status（published 绿） |
| 11 | 审批中心 | 协同 | statcardRegen×3 + wfl_approval_records/todos 全枚举面（action 动词族/紫→蓝清零） |
| 12 | 审批流配置 | 协同 | wfl_flow_states/transitions 枚举面 + 表格六检查点 |
| 13 | 任务看板 | 形态 | 泳道七道 v3（todo 橙/in_progress 蓝/review 蓝/done 青/blocked 红）+ 分组字段 fieldEnum |
| 14 | 任务日历 | 形态 | colorFieldName=status 接线；事件条按状态 soft 色（实测 4 色 7 条） |
| 15 | 销售看板 | 形态 | 泳道 doc_status v3（pending_level2 purple→blue） |
| 16 | 采购看板 | 形态 | 泳道 doc_status v3 同上 |
| 17 | 生产订单看板 | 形态 | 泳道十道 v3（in_progress 橙→蓝、completed→青） |
| 18 | 质检看板 | 形态 | 泳道三道 v3（pending=待检 override） |
| 19 | 处置看板 | 形态 | 泳道 action 四道 v3（concession purple→橙、scrap magenta→红）+ 卡 statcard×3 |
| 20 | 整改跟踪 | 形态 | 泳道 CAPA 四道 v3（verifying purple→蓝） |
| 21 | 交期日历 | 形态 | pur/so 两块 colorFieldName=doc_status（3 色 17 条） |
| 22 | 计划日历 | 形态 | mps doc_status + mrp status 两块接线（3 色 9 条） |
| 23 | 经营总览 | 顶级 | shot-only（JSBlock 驾驶舱归 B5 层 3b；w6b9 回归绿） |
| 24 | AI 工作台 | 顶级 | 表格面 heal（tickets 列）+ 六检查点（C 级微调） |
| 25 | 排产甘特 | v1 | globalStyle 包覆：网格线锚定/行分隔/今天列橙描边/标签基线/选中描边（leg18#1/3/5/6/7） |
| 26 | 任务甘特 | v1 | 同上（含 barHandle 页同样生效） |
| 27 | 应用中心 | v1 | B0 卡片基底（radius/border/shadow）继承 + shot |

B1 补债复截 5 页（22 抽 5）：客户/销售线索/采购订单/销售订单/比价表——fieldEnum 生效（Tag 色=列 props 同源 v3）。

## 审计美学问题清偿（02-pc-aesthetic-findings.md 本批域）

| 发现 | 处置 |
|---|---|
| leg17#1 首屏无图表卡、名为看板实为明细表 | 五页 grid maps 重组：统计卡行置顶 + 图表区前移 + 明细殿后（DOM 断言 cardsFirst 11/11）✓ |
| leg17#2 呆滞 0 与临期 2 视觉等价 | statCardRaw alertWhen：临期 2 红（#AA0808）、呆滞 0% 中性黑、待审批 6 橙——卡面数值条件着色 ✓ |
| leg17#3 同指标多日期行糊成一片 | 图表前置后明细表退居次屏 + B0 斑马/行分隔基底；表格行分组属平台组件面（B6 复核） |
| leg17#4/#5 数值列字重/空维列 | B0 tnum + 行高基底 ✓；「维度（可空）」列收窄属列宽平台面（B6） |
| leg17#6 antd 默认色直出 | B0 主题层已清（本批 DOM 断言 noLegacyHex 全过）✓ |
| leg18#1 刻度无网格锚定 | globalStyle `.gridTick` stroke #E8E8E6 ✓（计算样式断言） |
| leg18#2 甘特条 #5B8FF9 无进度语义 | 条色已随 B0 token → #1e4e8c 品牌主色；进度填充/里程碑菱形/依赖箭头需组件重写——W2/W4 裁定维持，记遗留 |
| leg18#3 文字基线 ±2px 抖动 | `.barLabelOutside { dominant-baseline: middle }` ✓ |
| leg18#4 整页无工具栏 | v1 组件级能力（不重写组件裁定）→ 遗留（B6 复核平台面） |
| leg18#5 行高无分隔 | `.gridRowLine` stroke #EFEFEF ✓ |
| leg18#6 今天列仅淡黄铺底 | `.today rect` 橙描边 + 微染 ✓（顶部红线+浮签需 DOM 注入，超出 CSS 包覆，遗留） |
| leg18#7 选中态不一致 | `.bar.active/.selected rect` 品牌描边 ✓ |
| §3 TOP10 共性 | 本批域内由 B0+B4 共同达成（DOM 断言逐页过）；#7 JSBlock→B5；#8 空态→平台（B6） |

## 证据链

| 类别 | 结果 / 路径 |
|---|---|
| B1 补债断言 | `w7-b4-b1-debt-run.txt`：fieldEnum=23/23；assert 常设项 `b1FieldEnumMismatch=0/23` ✓ |
| heal 断言 | `w7b4-heal --assert` OK（`w7-b4-assert-final.log`）：pages=24/24、colorMismatch=0、numberNoRight=0/12、dateNoFormat=0/21、bareNumeric=0、statcardLegacy=0/35、columnOptionMismatch=0/20、fieldEnumMismatch=0/32、**kanbanLaneMismatch=0/40、calendarNoColor=0/5、kpiGridBad=0/5、v1Overlay=ok** |
| DOM 断言 | 32/32（`.w7b4-shot-report.json`）：table 7/7 六检查点、kpi 11/11（cardsFirst+形态面）、kanban 7/7、calendar 3/3（事件 4/3/3 色、7/17/9 条）、v1gantt 2/2（ganttTick/todayStroke/labelBaseline）；shot-only 2（经营总览/应用中心） |
| after 截图 | `after/w7-b4-01..27-*.png`（1440×900）+ `w7-b4-r01..05-*.png`（B1 复截）已拷 `demos/acceptance-w7/`（32 张） |
| 库存看板口径实证 | 卡面=最新快照日值：资金占用 ¥11,067,342.78 / 临期 2 红 / 呆滞 0% 黑（首跑全历史均值 875K 已由 statcardQuery 修正） |
| W6 回归 | `w6b2-rules` assert 全过（`w7-b4-regr-w6b2.log`）；`w6b9-cockpit` --demo + assert 全绿（`w7-b4-regr-w6b9*.log`；首轮 3 失败=缺演练 seed，非 heal 回归） |
| 主题断言 | `w7b0-theme --assert` OK（themes=6 defaults=w7-forge，globalStyle 含 B4 包覆段） |
| gates | `pnpm run typecheck` exit 0；oxlint（w7b4-heal/w7b0-theme/flow-page-lib）0 warnings 0 errors |
| 回滚面 | `w7-b4-heal-rollback.json`（138 条，含 fieldEnum before-enum / statcardQuery before-stepParams / gridLayout before-maps） |

## 遗留（进入后续批次）

- **kpi_snapshots percent 口径分裂**：毛利率 −2.18（百分数值）与账实相符率 0.9825（0-1 比例）同用 unit=percent——卡面无法统一换算，数据侧归一口径后 statcardQuery 重放即可。
- **统计卡日期钉定**：kpi 卡 filter 钉 calc_date=最新快照日；新快照日入库后需重跑一次 `w7b4-heal --apply`（幂等，statcardQuery 自动推进）。
- v1 甘特进度填充/里程碑菱形/依赖箭头/页面工具栏：组件级能力，W2/W4「不重写组件」裁定维持；甘特条已随 B0 主色。
- 经营总览/效期看板/维保日历 JSBlock 内部 → B5 层 3b；表格行分组、列宽收窄、空态双文案 → 平台组件面（B6 终验复核）。
- 看板卡内部样式保持平台渲染；本批拥有的块级面=泳道色 + 卡面 Tag（经分组字段 fieldEnum）。
- 生产订单看板 in_progress 泳道橙→蓝后与 released 同蓝（v3 语义执行态同色），如需道级区分度需按字段分 palette（同 B23 frozen 一词两义类遗留）。
