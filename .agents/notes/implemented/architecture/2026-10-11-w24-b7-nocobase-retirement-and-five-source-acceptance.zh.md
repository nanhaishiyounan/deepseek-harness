# Agent Note: W24-B7 退役收尾——NocoBase 物理退役决策 + 五源联合验收

Status: implemented

[English](2026-10-11-w24-b7-nocobase-retirement-and-five-source-acceptance.md) | 中文

日期：2026-10-11 ｜ 批次：W24-B7（退役收尾） ｜ 证据目录：[research/2026-10-09-w24-rebuild/b7-final/](../../../../research/2026-10-09-w24-rebuild/b7-final/README.md)

## Problem

W24 主计划把仓库重构为「湖仓+知识库+carbon 业务+本体+图谱」五源架构，B0~B6 已完成数据保全与等价面切换，B7 要按六步序物理拆除 NocoBase（源码树 7.1G/15,341 文件、两 connector 包、网关域、反向代理、examples 脚本群、文档），同时清偿各批存量债（B2 快照债、lint 债、浏览器基线债），并以一条真实 LLM 会话问题串联五源作为用户验收底稿。

## Decision

### 1. 退役顺序遵循「先停服务、数据三态在档复核、再拆引用、最后删树」

dsh web(:3080) 先于 NocoBase(:13000) 停（网关持已删库 inode 教训）；数据放行条件在六步序第 2 步复核：138 表行数对账全 OK（`workspace/lakehouse/legacy/rowcount-reconciliation.md`）+ pg_dump 归档（`nocobase-full-20261010.sql.gz`）+ DuckLake `legacy_nocobase`/`synced_carbon`/`synced_nocobase` 三 schema 在湖。platform/ 整树删除为独立大删除（git 可 revert 回滚）。

### 2. 删除链按依赖闭包整链退役，不保留半死面

- **apiproxy nocobase 域 8 方法 + orders 域 5 方法 + signIn session 签发体系**：NocoBase REST 后端已死，保留只会制造永远 refuse 的死方法；orders 链（apiproxy→expert-orders→connector-nocobase）与 kg-build 包（结构化腿走 NocoBaseClient）同链退役——湖仓→图 ETL 已由 graph-neo4j 承担、本体生成已由 ontology-induction 承担（B5），`kg.mappings` RPC 与 ui-kg 映射面板随之退役（kg.stats structural counters 保留）。
- **tool-connector 的 order_create/order_status**：同链的 model-facing 工具行一并拆除（`ctx.orders` 无实现方）。

### 3. mobile 身份不换轨 carbon，免身份直进（以现状为准的裁决）

主计划 §4.2 写「signIn → carbon 身份面」，但现状 carbon 侧只有 dev 栈种子账号 `test@carbon.ms`（无八角色）；给 GoTrue admin 造八角色超出 B7「纯代码删除」定性。裁决：ui-mobile 改免身份直进（本地昵称身份，默认「移动访客」），登录门/台账/待办/预警/文档深链/表单同步等功能面随 NocoBase 退役（明确空态文案），保留四 Tab 壳 + AI 同事聊天 + kg + 湖仓 + 附件工具。历史 token 身份记录按昵称宽容解析。

### 4. 数据语义值保留（grep 豁免的裁定依据）

以下「nocobase」字样是数据层语义而非连接代码，保留：kg `asserted_by: 'nocobase'` 与 `source: 'nocobase-derived'` 枚举（历史三元组断言者，kg-graph.sqlite/Neo4j 已有数据在用，JSDoc 标注 legacy）；湖仓 `legacy_nocobase`/`synced_nocobase` schema 名（138 表冻结命名空间）；图谱 `nocobase:` 节点 id 前缀（kb-graph 历史节点）；governance `legacy_nocobase`→`legacy` 分类。`scripts/publication-payload.ts` 的 nocobase/ 发布拒绝规则保留（防复活闸门）。

### 5. bundle 默认湖仓同步 DSN 换轨 carbon

`packages/bundle/web-app/cordis.patch.yml` 的 `DSH_LAKEHOUSE_SYNC_DSN` 默认值从旧 NocoBase PG（:5432/nocobase）改为 carbon PG（:51538/postgres，supabase_admin/postgres）——B3 后同步主线是 carbon 表；env 全量覆盖仍然优先。

### 6. B2~B6 存量债集中清偿

- tsconfig.base.json 补 `dsh-graph-neo4j`/`dsh-tool-graph`/`dsh-client-ui-governance` 三条 Raw 插件 paths（verify-cordis-config 首次暴露的各批漏项）；
- B2 快照债 5 失败（工具改名+引擎注入面）：fixture 补 `dsh-lakehouse-engine` 挂载、断言面换 `cb_*`/湖仓三工具名、upload→`engine.ingestParquet` 显式交接（复刻 sync 管线）；
- examples/package.json 补 `dsh-lakehouse-engine` 依赖行；
- 全仓 oxlint 190 错（B2~B6 各包从未过严格版全仓 lint 的存量债）：等价变换清偿（no-unnecessary-type-conversion/condition/assertion、no-confusing-void-expression 等），不改规则不加抑制；
- tsc -b 引用面：apiproxy references 误删的 `dsh-connector` 加回（tsc -b 不再预构建其类型产物导致 exports 回退解析 src 的 TS6307）。

## Consequences

- NocoBase 全链退役后五源各就其位：业务真源 carbon、分析真源湖仓（Tier0+Tier1）、知识 WeKnora/kb-sqlite、本体 ontology-induction、图谱 graph-neo4j；`grep -rli nocobase` 剩余命中全部落入数据语义豁免清单。
- mobile 形态永久变化：免身份直进（本地昵称身份，默认「移动访客」），登录门/台账/待办/预警/文档深链/表单同步随退役消失（明确空态文案）；若需恢复业务身份，等 carbon 账号体系明确后另批。
- kg.mappings RPC 与 ui-kg 映射面板退役；kg.stats structural counters 保留。
- 138 表数据三态在档（行数对账 + pg_dump 归档 + 湖仓冻结 schema），platform/ 整树删除可经 git revert 回滚。
- bundle 默认湖仓同步 DSN 指 carbon PG（:51538），env 覆盖仍然优先。

## Alternatives considered

- **NocoBase 冻结运行、不物理删除**：被否——B0 VERDICT 定性退役，7.1G/15,341 文件源码树与维护面不可持续；数据已三态在档（决策 1）。
- **mobile signIn 换轨 carbon GoTrue + 补造八角色**：被否——超出 B7「纯代码删除」定性（决策 3）。
- **apiproxy nocobase/orders 域保留为空壳方法**：被否——REST 后端已死，保留只制造永远 refuse 的死方法（决策 2）。
- **kg-build 结构化腿保留待复活**：被否——湖仓→图 ETL 与本体生成均已有 B5 承担者（graph-neo4j/ontology-induction）（决策 2）。
- **数据语义值一并改名去 nocobase 字样**：被否——断言者枚举/schema 命名空间/节点 id 前缀是在档数据标识，改名破坏 kg 与湖仓既有数据（决策 4）。

## Verification

- 六步序留证：停服/对账/删除清单见 [b7-final/README.md](../../../../research/2026-10-09-w24-rebuild/b7-final/README.md)；
- grep 判据：全仓 `grep -rli nocobase`（排除 research/plans/.agents/demos/.roo）剩余命中全部落入豁免清单（生成文档随 doc-sync 重生成消失）；
- 回归门禁：typecheck/build/test/lint/hygiene/doc-sync 全绿（结果回填 b7-final）；
- 五源联合验收：一条问题实跑串联 kb_search→cb_*→lakehouse_*→kg_graph_query→kg_ontology，轨迹+截图落 b7-final（结果回填）；
- 冷启动演练：按 QUICKSTART 五源版从 colima 起到 web :3080 全源在线实测留证。

## Follow-ups

- carbon 商业许可询价结果（O-7）决定 approval-engine 去留（W25 候选题：食品行业层自建插件群/SeaTunnel 真 CDC/Doris 混合检索）；
- mobile 免身份形态若需恢复业务身份，等 carbon 侧账号体系明确后另批处理。
