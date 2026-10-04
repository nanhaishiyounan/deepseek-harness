# W6-R6 证据 05：statcard 单列归因四处修正摘录

实测事实链（R6）：
- psql 实测（预警页 grid）：`w6b10cards-a = [[4 uid]]`、`w6b10cards-b = [[4 uid]]`——首轮落库的卡行 cell 是一格多 uid（一格内多卡纵向堆叠 → 单列）。
- 代码（`w6b10-statcard-order.mts` 第 68-74 行）：当前写法已是每格一 uid 分格（`rows[head[index]] = chunk.map(uid => [uid])`，注释明示「a cell holding several uids stacks them in one column; separate cells give the 4-per-row strip」）。
- 复跑行为：卡行已含 card uid 且在 rowOrder 头部 → `existingCardRows` 非空 → head=已有行、不重写 cell（no-op）。

结论：单列不是「一格多 uid 渲染限制」（平台不可改），而是首轮 cell 形态遗留 + 复跑 no-op 未重写；四列条带清除旧卡行重跑即可得。生效机制本身=重写 grid rows/rowOrder。

## 四处传播位置与修正后文字

1. `research/2026-10-01-w6-rework/99-w6-deliverables.md` §四.3——「呈现单列的成因是首轮落库的卡行 cell 为一格多 uid（psql 实测 `w6b10cards-a=[[4 uid]]`……）——四列条带清除旧卡行重跑即可得，非平台渲染限制（R6 归因修正，早前版本把单列记作『一格多 uid』渲染限制，与代码相反）」；§六 W7 表第 3 行同步改为「预警统计卡四列条带落铺（机制已具备：清旧卡行重跑 `w6b10-statcard-order.mts` 即每格一 uid 分格成形，R6 归因修正）」。

2. `.agents/notes/implemented/feature/2026-10-03-w6-b10-final-acceptance.zh.md` §4——「单列成因是首轮落库的卡行 cell 为一格多 uid（psql 实测 `w6b10cards-a=[[4 uid]]` 纵向堆叠），当前脚本已是每格一 uid 分格写法、复跑时卡行已在前被 no-op 跳过未重写——四列条带清旧卡行重跑即可得，非平台渲染限制（R6 归因修正，与代码对齐）」。

3. `.agents/notes/implemented/feature/2026-10-03-w6-b10-final-acceptance.md` §4（en）——「The single-column shape comes from the first-run cell layout, one cell holding four uids (psql: `w6b10cards-a=[[4 uid]]` stacking vertically); the script now writes one cell per card … the four-per-row strip is one cleanup-plus-rerun away, not a platform rendering limit (R6 attribution fix, aligned with the code)」。

4. `demos/acceptance-w6/w6-b10-05b-statcard-dom.log` 复核注释尾段——「单列纵排是首轮落库的一格多 uid cell 形态（psql 实测 w6b10cards-a=[[4 uid]] 纵向堆叠；R6 归因修正）——当前脚本已是每格一 uid 分格写法，第二轮 no-op（行已在前）未重写 cell；四列条带清旧卡行重跑即可得，非平台渲染限制」。

（B10 Note i18n.yaml 为 pairing hash 记录文件，不含正文，改写后已重录。）
