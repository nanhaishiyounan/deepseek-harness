# W4-B3 页面层补强：统计卡直写通道、grid rows 重排、iframe 配置化

- 日期：2026-09-28 · 批次：W4-B3（plans/2026-09-28-w4-completeness/03-b3-stats-pages.md）
- 代码：`examples/kb-agent/scripts/w4-heal-b3.mts`（heal/assert/reconcile/rollback/levels）；`examples/kb-agent/scripts/nocobase-flow-page-lib.mts`（`metricChart`/`ensureMarkdownHint`/`statCardRaw`/`seatGridTopBlocks`）；`examples/kb-agent/scripts/setup-nocobase.mts`（verify 增 w4b3 断言）；`examples/kb-agent/scripts/nocobase-w3-views.mts`（终端源 env 统一）；`examples/kb-agent/DEPLOY.md`+`DEPLOY.zh.md`（W3_TERMINAL_BASE 部署项）
- 证据：`research/2026-09-28-w4-completeness/w4-b3-*`（page-levels 台账 / heal-run / probe-after / psql-reconcile / iframe-env / journey-*.png / statcard-*.png）

## 决策

1. **统计卡 = ChartBlockModel 单值聚合 + `visual.mode:'custom'` raw 大数字模板，直写 flowModels:save**（D3 绕行通道的落地形态）。raw 首行嵌 `/* w4b3 statcard */` 标记；markdown 说明块尾部嵌 `<!--w4b3-->`（渲染不可见）——addBlock 铸随机 uid 无法按前缀回滚，标记 + `w4b3` 前缀 uid（直写块）双轨识别。
2. **addBlock 在带 kanban 的页面被 authoring 校验拦截**（处置看板：`kanban cardViewAction popup invalid`——addBlock 会重建 surface 上全部 inline popup，kanban 卡片 popup 缺集合 fieldGroups 时整体 400，与新增 chart 无关）。绕行：统计卡/说明块全部直写 `flowModels:save`。
3. **直写必须写渲染器实际读取的 canonical 形态**：query 用 `collectionPath: ['main', collection]`（`resource` 对象被查询执行层忽略 → 图表渲染「请配置图表」占位）；filter 用 `{logic:'$and', items:[{path,operator,value}]}` 三元组；markdown 正文写 `stepParams.markdownBlockSettings.editMarkdown.content`（仅 `props.content` 渲染演示占位文本）；`name` 镜像 uid、`sortIndex` 必带。
4. **grid 块顺序由 `stepParams.gridSettings.grid.rows/sizes/rowOrder`（props 双写镜像）决定**，sortIndex 不参与排序，addBlock 恒 appendRow 尾插。`seatGridTopBlocks` 重排：hint 一行（24）+ 卡并排一行（n 卡均分 24 栅格），原行序保留在后；重跑收敛（先剥离本批 uid、空行删除、两行重建于 rowOrder 头部）。
5. **「本月」卡口径物化**：builder query 无相对日期表达式，heal 时计算 `${YYYY-MM}-01` 写死进 filter，卡上口径脚注标注起算日与口径动词（如「按审批日，非创建日」防 P-2' 误导）；跨月重跑 heal 刷新。
6. **iframe 配置化（D10）**：`W3_TERMINAL_BASE`（优先）> 旧 `W3_TERMINAL_ORIGIN` > 默认 `http://127.0.0.1:13110`；heal `--iframe` 只做 origin 替换（path+operator 保留），不设 env 重跑即回默认零漂移。w3-views 的建页通道同读该 env。
7. **L1/L2 分级台账**（`w4-b3-page-levels.json`）：L1=30 单据页（每页 3-5 卡+说明块）、L2=20 主数据页（1-2 计数卡）、L3/L4 零新增（完备性≠堆满）；assert 按 marker 块判定分级越界。

## 坑（会再踩）

- addBlock 的「页面级副作用」：不是只建新块——它重校验/重建 surface 全部 inline popup，任意既有块不合法即整体失败。给带历史遗留 popup 的页面程序化加块，优先直写。
- 直写块与 addBlock 块的 flat 行看起来几乎一样（props/stepParams.configure 都在），唯一判别法是渲染：chart 看 query.collectionPath，markdown 看 editMarkdown.content。探针读得到 ≠ 前端渲染得到。
- 负 sortIndex / 大 sortIndex 都不能移动 grid 块——不要在排序上浪费时间，直接改 rows。
- ECharts canvas 内文字不进 `innerText`：DOM 审计判不了卡内容，必须像素判读（截图）或读 `toLocaleString` 期望值对拍。
- 「所有/任意」下拉是空值语义筛选（null/any），不是状态筛选；制造空列表要选无数据枚举值（如「已驳回」）并确认 FilterForm 提交（请假审批的提交按钮文案是「筛 选」）。

## 验收口径

- `w4-heal-b3.mts --assert`（进 setup verify）：L1 30 页 marker 卡 ≥3、L2 20 页 ≥1、L1 说明块全覆盖、全部 ChartBlockModel props.title 非空（18 既有 + 新卡）、终端 iframe url 前缀 = W3_TERMINAL_BASE、L3/L4 marker 卡零越界。
- 数值对拍：`--reconcile` 对六页（采购订单/生产订单/销售订单/入库单/质检单/库存查询）每卡生成 psql 期望值（`research/.../w4-b3-psql-reconcile.txt`），旅程截图人工判读一致（采购订单 3/10/¥1,474,740/22、请假审批 3/20天/5、处置看板 7/1/¥9,781.15 均与 psql 相符）。
- iframe 负例：`W3_TERMINAL_BASE=http://127.0.0.1:9999 --iframe` 三块 url 变 9999；不设 env 重跑回 13110（`w4-b3-iframe-env.txt`）。
- 回滚演练：`--rollback --page 比价表`（4 marker 块 destroy）→ `--all` 幂等重建 → assert 全绿。
- 零回归：setup verify 全绿（w4b1/w4b2/w4b3 三段）；`--assert-ledger` 平衡；`.trees.mjs` anomalies=0；audit 对拍 pagesChart 8→58（92 页中 58 页有图表块）、iframe 3 块随 env。

## 遗留

- **member 角色下统计卡渲染占位（上游 ACL 交互）**：`POST /api/charts:queryData` 在非 root 角色被 `plugin-data-visualization` 的 `checkPermission → applyQueryPermission`（plugin-acl）403——即使 member 对目标集合持有 view/list（字段全列+补 id/`*` 试验均不通过）。admin/root 全部正常（桌面+390px 双端验证）。已落 member 的 `charts:queryData` 授权行（必要不充分，assert 只断言行存在）；qc_inspector 390px 取证（w4-b3-member-390-qm.png）记录：布局/说明块/表格数据正常，卡占位。B4/B6 或独立课题在上游确认 applyQueryPermission 对聚合查询的语义后收口。
- 「本月」卡窗口物化（heal 时点写死 `${YYYY-MM}-01`）：跨月由重跑 `--all` 刷新——部署清单已注明。
