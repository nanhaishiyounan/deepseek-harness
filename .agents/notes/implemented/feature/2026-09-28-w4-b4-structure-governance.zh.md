# W4-B4 结构治理 —— 退役协议执行化 + 双通道改名 + 重复组消解

[English](2026-09-28-w4-b4-structure-governance.md) | 中文

- 日期：2026-09-28
- 状态：已实现
- 范围：`examples/kb-agent/scripts/w4-heal-b4.mts`、`examples/kb-agent/scripts/setup-nocobase.mts` verify（missingV2Hub / n18ai 计数 / w4b4 断言段）、`examples/kb-agent/scripts/w4-heal-b1.mts`（FilterForm 下限）、`examples/kb-agent/QUICKSTART.zh.md`（菜单导览）

## 决策

页面存废终裁全部落在 `w4-heal-b4.mts` 顶部的裁决台账常量（`V1_VERDICTS` / `RETIRE_SPECS` / `RENAMES` / `MOVE_SPEC` / `DUPLICATE_GROUPS`），`--all` 每次运行把它完整投影为 `research/2026-09-28-w4-completeness/w4-b4-verdicts.json`——台账与执行体不可分叉。

- **退役协议（N14 教训的执行化）**：① psql `COPY ... TO STDOUT WITH (FORMAT csv, HEADER true)` 全量留档（行数与 `COUNT(*)` 对拍，不等则拒绝删除）② flowModels 外部引用对账（其他页的行 JSON 里出现该 schemaUid 即 fail-loud——入口未清理不许退役）③ 先 DELETE tabs 子行、再 DELETE flowPage 行（`desktopRoutes:destroy` 级联删 flowModels 树）④ 集合与数据只读保留（不变式 3）。两页退役：采购联系人（历史）（hub_po_suppliers，功能死页）、工作台（hub_pj_tasks + hub_tk_tickets 双表聚合页，与 AI 工作台/工单三重叠）。
- **v1 三页裁决**：任务甘特保留（v2 无甘特块等价物）、排产甘特保留（与表格形态互补）、应用中心归组「基础数据」（`desktopRoutes:update parentId`，v1 page 行的菜单标题只走路由行，无第二通道）。
- **重复组 13 组**：11 组保留（多视图/多职能分工），工作台退役同时消解 hub_tk_tickets×3 与 hub_pj_tasks×2 两组（盘点口径=TableBlockModel 集合绑定，assert 锁定 hub_tk=2 / hub_pj=1 / hub_po_suppliers=0）。
- **回滚通道**：不手工重建 flowModels 树（半吊子树重建比缺页更危险）；`--rollback` 指引重放 `nocobase-f3-hub-v2.mts`（旧标题下重建页与块树）→ `nocobase-w2-supplier.mts`（retitle），destroy ledger 与子树 JSON 全量在档。

## 坑

- **侧栏菜单标题读 RootPageModel，不读 desktopRoutes.title**。改名「排产看板→排程明细」先改了路由行：API 断言全绿、路由快照正确，但侧栏与面包屑仍是旧名。第二通道是 flowPage schemaUid 直接子行的 `RootPageModel`，title 冗余存两处：`props.title` 与 `stepParams.pageSettings.general.title`，必须 `flowModels:save` 双写。此后任何改名（B5 清单）都要双通道对拍。
- **既有断言的 title/计数硬编码随行为变更同步**，本批四例：setup missingV2Hub 名单（去掉两退役页）、missingB5「排产看板」→「排程明细」、missingB8「AQL抽样方案」→「AQL 抽样方案」、n18ai- 按钮 ≥82 → ≥79（destroy 级联删走工作台 2 个 + 采购联系人 1 个弹窗 AI 按钮）；w4b1 FilterForm 下限 37→36（退役页带走 1 块）。
- **psql 计数必须 `-t -A`**：默认输出带表头与 `(1 row)` 尾注，`Number()` 解析成 NaN，对拍必失败且报错信息误导（csv=11 psql=NaN）。
- **v1 `page` 行也有 tabs 子行**：孤儿断言的 tabs 合法父集是 flowPage ∪ page，只认 flowPage 会把三个 v1 页误报为孤儿。
- **`nocobase-f3-hub-v2.mts` 是退役页的再生源**：重跑会在旧标题下重建两页（w2 retitle 随后复活「采购联系人（历史）」）。B4 后不要重跑 f3 的 hub 段；setup verify 的 missingV2Hub 断言已改为「必须保持消失」。
- Playwright 侧栏文字探测要在**目标页自己的上下文**做：`/admin` 首页手风琴折叠未展开组，body.innerText 拿不到折叠组文字，会误报「菜单没改名」。

## 验收口径

- `w4-heal-b4.mts --assert`（进 setup verify）：退役页 schemaUid 零残留、路由计数 206→202（16g/90f/93t/3p）、「采购」组空壳保留（B5 处置）、四项改名双通道 title 对拍、应用中心在基础数据组（children=2）、三份 CSV 行数==psql count（11/20/40）、v1 三页 getProperties 200、退役页 flowSurface 404、孤儿 tabs/flowPage=0、重复组计数达标。
- 旅程取证（`w4-b4-journey.txt` + 截图）：管理员打开「排程明细」功能完好（表格 16 行 9 列 + ViewActionModel×1 + FilterFormBlockModel×1，B1/W3 成果不回归）；两退役页 URL 前端 404（文案 + 无表格双证）。
- 幂等：二次 `--all` 全 skip（removed/added/retitled/moved 四列表全空），`w4-b4-idempotent.txt` 在档。
- 零回归：setup verify 全绿（w4b1–b4 四段）；`--assert-ledger` 平衡；`.trees.mjs` anomalies=0；b9 链 s9（wfl 留痕 + movements 勾稽）通过——hub_pj_tasks/hub_tk_tickets 数据行未动，引擎不依赖被退役页的 UI。

## 遗留

- 「采购」组成为空组（children=0）：B4 有意保留组行，空组合并/删除归 B5 菜单 IA（D8 先迁后删）。
- RootPageModel 双通道改名约束对 B5 的全量重命名清单生效：B5 脚本必须复用本批的双通道改名逻辑（或抽入 flow-page-lib），否则重蹈侧栏旧名。
- member 390px 双端抽查未在本批展开（B4 变更全是菜单层，member 视角由 B6 八角色旅程统一覆盖）。
