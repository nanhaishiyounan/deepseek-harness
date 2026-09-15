# 批次 H3：KG 质量报告落库 + NL 模板查询 + 工具面收敛

> 隶属 [PLAN.md](PLAN.md)。主题二可见侧交付（用户「要可用」的看得见部分）。前置：H2（run report 扩展/mappings API/kg.stats 扩展依赖其字段）。调研依据 [02](02-research-ontology-kg.md)。规模：kg-build/tool-kb/apiproxy/ui-kg 四面；~12 文件改 + 1 新表 + UI 面板。

## 第 0 步（必做）

1. **v1 工具消费方全库盘点**：搜 `kb_graph_query|kb_graph_add`（测试/系统提示/文档/快照）——禁用面清单落档。
2. **质量指标口径定稿**（对照 R4 §06 12 项指标取首期子集）：节点覆盖率=kg_nodes(nocobase 系) / 源表行合计；边覆盖率=活跃边 / 可映射 FK 合计；孤岛=活跃节点度=0 计数（按 type 分组）；冲突=同七列锚多 fact 竞争计数；加 degraded/dropped/merged/tombstoned 过程计数。
3. **短语模板清单定稿**：保留旧 3 模板语义（供货链/订单/包含，[`presentation.ts:45`](../../packages/client/ui-kg/src/client/presentation.ts:45)）+ 新增至 8-10 个中文模板（覆盖关系过滤/两跳/类型过滤槽位）。

## 改动面 1：质量报告落库 + 指标计算（kg-build + kb-graph-sqlite）

1. 新表 `kg_build_runs`（schema v3 内一并建：id/started_at/finished_at/config_hash/report_json/metrics_json）；[`KgBuildRuntime.run()`](../../packages/kb/kg-build/src/index.ts:264) 聚合返回处（[:283](../../packages/kb/kg-build/src/index.ts:283)）落库每次 run 报告（进程退出不再丢失）。
2. 指标计算函数（纯函数，单测友好）：`computeQualityMetrics(store)` ——孤岛一条 SQL（kg_edges 双向反查度=0）、冲突（七列锚内多 fact 分组）、覆盖率（对源系统行数——NocoBase 腿拿 listMeta count，corpus 腿拿文件/chunk 数）。
3. `ctx.kgBuild` 增 `latestRun()`/`qualityReport()` 读数；apiproxy [`kg.stats`](../../packages/host/apiproxy/src/api/kg.ts:78) 扩展返回 `{ ontologyVersion, nodes, edges, islands, conflicts, coverage, lastRunAt }`。

## 改动面 2：图谱 tab 管理面（ui-kg 只读面板）

- 图谱 tab 增「质量与映射」面板（只读，PageHero 下 tab 页/折叠区）：
  - 质量卡：节点/边总数、孤岛数、冲突数、覆盖率、上次构建时间（数据源 `kg.stats` 扩展）；
  - 映射清单：`kg.mappings` 渲染——每 source collection 映射状态（命中节点/边数、skippedRelationFields、规则命中计数）；
  - 本体版本：ontologyVersion + revisions 最近 N 条 summary。
- 不做编辑功能（本体编辑/规则启停编辑列后期轮次；本面板是「可管理可度量」的第一可见面）。

## 改动面 3：NL 查询一期（模板+槽位填充）

- **服务端编译**：apiproxy kg 域增 `kg.query`（NL 文本→`{seeds, relation_types, hops, typeFilter}` 结构化查询）：模板集匹配→槽位抽取（实体名/关系词/跳数）→复用 kg.search 种子解析→kg.subgraph 执行；未命中模板返回明确「不支持的问题形态+可用模板示例」（失败即报错，不猜）。
- **UI 升级**：[`KgView`](../../packages/client/ui-kg/src/client/KgView.tsx) 短语框从 [`parseKgPhrase`](../../packages/client/ui-kg/src/client/presentation.ts:45) 3 正则升级为调 `kg.query`；保留本地 3 模板作离线回退；占位文案给示例问题（「张红喜供货的所有产品」「酱油相关的 2 跳关系」）。
- 闭集校验复用 [`extract.ts`](../../packages/kb/kg-build/src/extract.ts) 模式（relation_types 必须在 registry 闭集内）。

## 改动面 4：工具面收敛（tool-kb）

- v1 `kb_graph_query`/`kb_graph_add` 默认禁用：[`tool-kb/index.ts:143-147`](../../packages/kb/tool-kb/src/index.ts:143) 注册改为配置开关（默认 off），代码保留；
- 系统提示路由 [`kg.ts:258`](../../packages/kb/tool-kb/src/kg.ts:258) 收敛为 v2 双工具（kg_schema/kg_subgraph）+ 版本信息；
- 快照 [`kg-tools.spec.ts`](../../examples/kb-agent/tests/kg-tools.spec.ts)/[`expected.md`](../../examples/kb-agent/tests/snapshots/kg-tools/expected.md) 同步（工具清单变化）。

## 验收断言（证据落 `demos/acceptance-h3/`）

1. 真机 kg-build 跑一次后：`kg_build_runs` 表有 run 行（report+metrics JSON 落库证据）；`kg.stats` 返回扩展字段；
2. 图谱 tab「质量与映射」面板渲染：孤岛/冲突/覆盖率数值与 sqlite 直查一致（psql/sqlite3 对照证据）；映射清单显示 5 collection 命中计数；
3. NL 查询实测 ≥5 个中文问题（含旧 3 模板语义回归+新增模板）：图谱 tab 输入「张红喜供货的所有产品」→画布种子扩展正确；不支持形态返回明确提示（截图）；
4. v1 工具禁用后：模型工具列表无 kb_graph_query/add（快照证据）；agent 问答「图里张红喜供什么」走 kg_subgraph 正常（真机会话证据）；
5. `pnpm run test`（tool-kb/ui-kg/apiproxy 相关）+ typecheck + lint EXIT=0；kg-tools 快照双跑一致；
6. AI 化覆盖新面：AI 会话中问「知识图谱质量怎么样」→ 悬浮球/agent 经 apiproxy 拿到质量数字并回答（真机会话截图）。

## 风险与回滚

| 风险 | 等级 | 预案 |
|---|---|---|
| v1 工具禁用波及存量会话/评测（eval/ 引用？） | 中 | 第 0 步全库盘点清单裁决；eval 命中则改评测走 v2 工具再禁用 |
| 模板槽位中文实体抽取歧义（同名实体多命中） | 中 | 沿用 kg.search 种子解析的 top-k+消歧交互（现有机制）；e2e 实测覆盖 |
| 质量指标口径争议（覆盖率分母） | 低 | 口径注释写进 metrics_json（self-documenting）；面板 tooltip 说明 |
| kg.query 增加 apiproxy 攻击面 | 低 | 只读+闭集校验+限跳数（≤2）限结果（≤200，与 kg_subgraph 一致） |

回滚：四面单提交；revert 后回 H2 终态（v1 工具默认开、无面板、短语框回 3 正则）。
