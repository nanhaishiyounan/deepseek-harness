# Agent Note: kb-agent P1/P2 验证阻断修复——doc_kind 判别式、两跳方向、质量门收口

Status: implemented

[English](2026-08-30-kb-p1p2-blocking-fixes.md) | 中文

## 问题

kb-agent P1/P2 工作的统一验证得 76/100 FAIL，四类阻断。其中两个是正确性 bug 且共享同一根因——一个编译器无法质疑的类型层谎言；一个是质量门欠账簇；一个是诚实性簇（汇报里的数字与文件在树里对不上）。

## 决策

### H1：doc_kind 收窄用判别式，不用并集

`parseKbWorkbenchDocKind` 返回 `KbDocKind | string`，而 `KbDocKind` 本身就是字符串字面量 union，调用方的 `typeof kind === 'string'` 拒绝检查恒真：浏览器工作台的每次入库与按 doc_kind 过滤的检索全部被拒——合法值也在内。修复遵循闭 union 约定：parse 改返回 `{ ok: true; value: KbDocKind } | { ok: false; value: string }`，调用方按 `result.ok` 分支，拒绝消息列出 `KB_DOC_KINDS` 且每个成员真的被接受。同一改动顺带消除了旧签名引发的三处 `oxlint` 类型健全性错误（`no-redundant-type-constituents`、`no-unnecessary-type-assertion`、`no-unnecessary-condition`——lint 一直在标记验证器发现的这个 bug）。

验收红→绿：修复前 `apps/web/tests/kb-workbench.e2e.ts` 在入库拒绝上失败，修复后通过（web lane 从构建产物 `lib/` 加载网关，所以修复与复测之间要跑 `build:lib:host`）。

### H2：两跳路径按方向约束，不按端点共享

旧 `twoHopPaths` SQL 接受任何端点集合相交的边对——一个 4 路 OR。这会把共享 start 的 spur 边、共享 target 的 fan-in 边、以及 target 自环当"第二跳"放进来（假阳性），而仅有直连边时因为 `e2.id <> e1.id` 排除与自身配对而一条都不返回（对 `at most two edges` 契约的假阴性）。重写后每个分支钉死一个方向组合——`e1` 接触 start、`e2` 接触 target、中间点由该分支内的单一等式确定且不得是任一端点——再把直连边（双向）并入结果，这本来就是契约"至多两条边"所允许的。四个回归测试锁定各类：双向干净桥、直连旁的 spur、无共享桥的 fan-in、target 自环；外加仅直连可返回。

### H3：门靠复跑收口，不靠声称

- 四个 lint 错误随 H1 消除，加上 `kb-graph-sqlite/src/store.ts` 的 `jscpd:ignore-end` 缩进与 `ui-kb/src/client/index.ts` 两条过期的 `oxlint-disable`。
- `gen-tool-catalog.spec.ts` 期望 64 个工具；kb 图谱/URL 新增后为 67（`kb_graph_add`、`kb_graph_query`、`kb_ingest_url`）。
- `docs/config-catalog.md` 过期（kb 包的 Config 块从未生成过）；`gen-config-catalog` 重写两侧语言并用 `verify-translation-pairing --write` 重录配对。
- 聚焦集覆盖补齐到逐文件 100%：`kb-graph-sqlite`（store 分支——回滚、关闭后拒绝、去重/截断、无租户 stats；schema 门——带身份的未版本库、外来 application id、重开；invariant companion；插件 apply 的 fallback 分支，照 kb-sqlite 直调 `apply` 的先例）、`tool-kb/graph.ts`（参数校验拒绝、输出格式化、presentation 包装、seam 缺席拒绝）、`ui-kb`（入口挂载、面板分支、host 半边）。两个死防御分支按简化处理而非 ignore：按 id 回查的存在性检查（id 来自同一同步连接）与实体 map 的重复检查（SQL `UNION` 已去重）。

### H7：诚实性修正

计划文件的引用有效率改为实测 96%（`eval/results-hybrid-answers.json`：`citationValidRate = 96`、`top5HitRate = 99`）；两个角色预设目录补上如实描述自身文件的 README；工作台 e2e 头注释直说没有 fixture 文件——kb 栈经 `ctx.plugin` 进程内挂载，写能力经场景 overlay 开启。

## 考虑过的替代方案

- **H1 用 `KbDocKind | undefined`**（undefined = 非法）：否决——search 路径已用 undefined 表示"未提供过滤"，两种语义会在同一变量上相撞；判别式结果让每个调用点都穷尽。
- **H2 用 JS 图遍历**（载邻居再走）：否决——store 契约是租户内 SQL 侧过滤，方向约束恰好表达为四个 SQL 分支、每支一个中间点等式。
- **死防御分支用 `v8 ignore`**：在不变量可证明处（同连接 id、UNION 去重）否决——简化直接删掉分支，而不是给不可达路径写注释。

## 后果

- `packages/host/apiproxy/src/api-proxy.ts`、`src/api/rpc.ts`、`src/api/rpc.schema.ts`——判别式 doc_kind parse，新增 `kb-tenant-unbound`/`kb-write-disabled` 错误码（后者随 H5）。
- `packages/kb/kb-graph-sqlite/src/store.ts`——方向约束的两跳 SQL 加直连并入；两处死防御简化。
- `packages/kb/kb-graph-sqlite/tests/store.spec.ts`、`tests/invariant.spec.ts`；`packages/kb/tool-kb/tests/graph.spec.ts`、`tests/presentation.spec.ts`；`packages/core/tools/tests/gen-tool-catalog.spec.ts`；`apps/web/tests/kb-workbench.e2e.ts`。
- `docs/config-catalog.{md,zh.md}` 再生成；`plans/food-kb-agent-plan.md` 修正。
