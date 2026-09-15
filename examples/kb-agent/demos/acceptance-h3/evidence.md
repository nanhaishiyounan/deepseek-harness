# H3 验收证据：质量报告落库 + NL 模板查询 + 工具面收敛（2026-09-15）

真机环境：NocoBase :13000 / dsh 网关 :3080（源码 dev server，H3 代码重建 lib 后重启）/ PG :5432；`workspace/kg-graph.sqlite` 为 SCHEMA v4 重建库（v3 库留存于本目录 `kg-graph.v3-backup.sqlite`）。

## 断言 1：kg_build_runs 落库 + kg.stats 扩展

- `node --import tsx/esm examples/kb-agent/scripts/kg-build.mts` → **ALL CHECKS PASSED**（18 断言，含 H2 的 ontologyVersion=1.0.0 / mappings 5 collections / 幂等二跑零漂移 1093→1093、665→665 / 增量场景）。全量输出存 `kg-build-idempotent.log`。
- sqlite 直查：`SELECT count(*) FROM kg_build_runs` → 首轮全量 run 1 行（05:09:50→06:00:31，含 LLM 语料抽取）+ 幂等 run + 增量场景 run + 复验 run。
- 最新 metrics_json（run 4）：`{"nodes":1093,"edges":665,"islands":401,"conflicts":4,"nodeCoverage":{"numerator":209,"denominator":431,"ratio":0.485},"degraded":0,"droppedRelations":0,"mergedEntities":0,"tombstonedEdges":0}` —— 分母 431 = 五 collection 行数（33+52+89+3+28）+ lakehouse 3 + connector 177 + corpus 47，口径自述于 `kg-build/src/quality.ts` 模块注释。

## 断言 2：图谱 tab「质量与映射」面板（:3080 实测，页面 DOM 文本）

```
质量与映射 节点 1095 边 665 孤岛节点 403 冲突事实 4 节点覆盖 211/431（49%） 上次构建 2026-09-15 06:04:24
映射清单 experts 节点 0 · 边 0 / expert_services … / datasets … / customs_export … / orders 节点 27 · 边 0
```

- 面板数值与 sqlite 直查一致（面板 1095/665/403/4 = 增量场景后的当前活跃集；与最新 metrics 的 1093/665/401 差 2 节点 2 孤岛 = 增量订单行及其服务锚点，结构计数是实时读数）。
- 映射清单 lastRun 来自持久层：dev server 重启后（进程内无 lastReport）`KgBuildRuntime.mappings()` 以 `latestRun()` 兜底——「进程退出不再丢失」的直接证明。
- tab 条：对话 / 知识库 / **场景** / 数据资产 / 连接器 / 图谱 / 业务管理 / 轨迹（H1 七业务 tab + chat）。

## 断言 3：NL 模板查询实测（短语框逐问，restated 为服务端编译回显）

| 问题 | 服务端编译结果（restated） | 模板 |
|---|---|---|
| 宏发食品的供货链 | 宏发食品 · 2 hops | supply-chain（旧1） |
| 张红喜的订单 | 张红喜 · 1 hops | orders（旧2） |
| 含山梨酸钾的产品 | 山梨酸钾 · 1 hops | contains（旧3） |
| 张红喜供货的所有产品 | 张红喜 · 1 hops · supplies | supplies-products（关系过滤） |
| 宏发食品相关的2跳关系 | 宏发食品 · 2 hops | n-hop（跳数槽位） |
| 酱油使用的原料 | 酱油 · 1 hops · uses | uses-inputs（关系过滤） |
| 今天天气怎么样 | 暂不支持这种问法，换个模板试试（如：宏发食品的供货链 · 含山梨酸钾的产品 · 张红喜供货的所有产品 · 宏发食品相关的2跳关系） | kg-query-unsupported |

旧 3 正则语义在服务端模板集中保持；不支持的形态明确报错并给示例（不猜、不盲走）。编译器单测 `packages/host/apiproxy/tests/kg-nl.spec.ts`（7 cases：模板槽位/闭集守卫/空槽 miss/示例全编译）。

## 断言 4：v1 工具禁用（快照证据）

- `examples/kb-agent/tests/kg-tools.spec.ts` 快照新增首段：`tools: kb_ingest, kb_ingest_url, kb_search, kb_stats, kg_schema, kg_subgraph`（v1 `kb_graph_query`/`kb_graph_add` 不在默认面）。
- `tool-kb` Config `graph` 默认 `false`（`packages/kb/tool-kb/src/index.ts`）；`graph: true` 显式开启的兼容路径由 `stats-index.spec.ts`/`graph.spec.ts`/`presentation.spec.ts` 保持覆盖。
- 30 个场景 `agent.cordis.yml` 移除 `graph: true`；`scenarios.spec.ts`/`kb-presets.spec.ts` 断言 6 工具面；`docs/tool-catalog.md`（生成）与中文对侧同步。

## 断言 5：SCHEMA v4（本批将 kg_build_runs 纳入版本纪律）

- `SCHEMA_VERSION` 3→4（`packages/kb/kb-graph-sqlite/src/schema.ts`）；v3 库被拒单测：`store.spec.ts` 'rejects a v3 database (the pre-ledger schema) with the rebuild instruction'。
- 重建链实测：删旧库 → `kg-build.mts` 全量重建（v4）→ 18 断言全绿 → 幂等二跑零漂移。

## 断言 6：门禁

- `pnpm run typecheck` EXIT=0；`pnpm run lint` 0 errors；`pnpm run doc-sync` 28/28（translation-pairing 1106 对全绿，含 tool-catalog/config-catalog 双侧再生成与配对重录）；受影响包 vitest 全绿（apiproxy / kb-graph-sqlite / kg-build / tool-kb / ui-kg / connection / runtime / kb-agent 327+1007 用例）。
