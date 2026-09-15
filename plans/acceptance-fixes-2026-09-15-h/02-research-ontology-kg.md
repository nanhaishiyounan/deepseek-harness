# 主题二调研报告：本体 KG 真可用（02）

> 隶属 [PLAN.md](PLAN.md)。调研来源：project-research（R2 现状盘点）+ real-deep-research L4（[R4 报告](../../research/2026-09-15-ontology-kg-engineering/report.md)，72 来源、12 分支饱和、sha256 `159e0978…`）。用户原话：「知识图谱的构建，不要只有个样子，要可用，要把本体、数据、映射等都做起来，深度调研下本体知识图谱怎么做的，ai+开源库」。批次实施见 [20-h2](20-h2-kg-ontology-mapping.md)/[30-h3](30-h3-kg-quality-query.md)。

## 1. 现状盘点（R2）

### 1.1 资产清单（路径纠正：`packages/kb/` 非 `packages/kg/`）

| 层 | 资产 | 位置 | 现状 |
|---|---|---|---|
| 本体 registry | `ctx.kbGraph` Service | [`kb-graph/src/index.ts:55`](../../packages/kb/kb-graph/src/index.ts:55) | 双层 registry（内存 Map+持久化行）；内置本体 [`ontology.ts:79`](../../packages/kb/kb-graph/src/ontology.ts:79) **纯 TS 硬编码** 31 类型（5 顶层锚+19 业务域+7 食品域）+23 关系（7 食品谓词+2 SKOS+14 业务域）；`KgNodeType` 含 `extends/naturalKey/status(draft\|active)/source`（[`types.ts:73`](../../packages/kb/kb-graph/src/types.ts:73)）；方向闭集校验 `validateEdge`（[`index.ts:187`](../../packages/kb/kb-graph/src/index.ts:187)） |
| 构建管线 | `ctx.kgBuild` Service | [`kg-build/src/index.ts:264`](../../packages/kb/kg-build/src/index.ts:264) | `run()` 四腿：NocoBase→lakehouse→connector→corpus；**R01-R13 规则=TS 硬编码**（[`mappers.ts:1-28`](../../packages/kb/kg-build/src/mappers.ts:1) 文件头注释编号）；LLM 抽取 [`extract.ts`](../../packages/kb/kg-build/src/extract.ts)（中文闭集 prompt→校验链→一次反馈重试→未知降级 Concept 桶）；对齐 [`align.ts`](../../packages/kb/kg-build/src/align.ts)（NFKC+剥公司后缀→同型精确→JW≥0.9 自动并入→0.8-0.9 LLM 裁决→`kg_aliases` 可回滚）；增量 [`incremental.ts`](../../packages/kb/kg-build/src/incremental.ts)（全快照 SHA-256+id 水位+knownIds 消失检测）；无 CLI，cordis 服务定时/手动 `run()` |
| 存储 | sqlite store | [`kb-graph-sqlite/resources/sql/schema.sql`](../../packages/kb/kb-graph-sqlite/resources/sql/schema.sql) | 7 张表 SCHEMA_VERSION=2：kg_node_types/kg_relations/kg_nodes（UNIQUE(tenant,type,natural_key) 合并锚+FTS5+embedding BLOB 预留）/kg_edges（**七列锚** UNIQUE+双时态 tombstone）/kg_aliases/kg_source_runs（水位）/kg_usage_counters；查询面 40 个 SQL 资源（k-hop 递归 CTE/两跳四方向/邻居/FTS 搜索） |
| AI 工具 | tool-kb | [`tool-kb/src/index.ts:143-147`](../../packages/kb/tool-kb/src/index.ts:143) | **两代四工具默认全开**：v2 `kg_schema`（本体浏览）+`kg_subgraph`（种子→k-hop→YAML 聚合，刻意不做自由查询生成）；v1 `kb_graph_query`（triple 邻居/路径/搜索）+`kb_graph_add`（模型可写 triple ≤50/次——唯一写入口，无审批防线） |
| 网关 | apiproxy kg 域 | [`apiproxy/src/api/kg.ts:78`](../../packages/host/apiproxy/src/api/kg.ts:78) | 只读五方法 kg.schema/search/subgraph/expand/stats；门控 kgEnabled+kgTenant |
| 画布 | ui-kg | [`ui-kg/src/client/KgView.tsx`](../../packages/client/ui-kg/src/client/KgView.tsx) | sigma.js v3 只读画布+图例过滤+种子搜索+详情面板；NL 入口=3 个正则短语模板（[`presentation.ts:45`](../../packages/client/ui-kg/src/client/presentation.ts:45)） |
| 组装 | kb-agent | [`cordis.patch.yml:148-308`](../../examples/kb-agent/cordis.patch.yml:148) | 5 collection 白名单+2 fkLinks；验收脚本 [`scripts/kg-build.mts`](../../examples/kb-agent/scripts/kg-build.mts)（六段断言电池含幂等二跑零漂移）；[`setup-nocobase.mts:1026-1045`](../../examples/kb-agent/scripts/setup-nocobase.mts:1026) 对 kg_nodes 非空硬断言 |

### 1.2 双管线数据流（跨管线汇合是设计核心）

```
管线A 确定性映射（零LLM confidence=1.0）: NocoBase REST → R12过滤×白名单 → R01/R02/R05/R10 派生类型+行→节点(id=nocobase:col:pk)
  + R06 belongsTo→边 + R11空FK不出边 + fkLinks标量引用解析 → 七列锚 upsert → 消失pk→tombstone → 水位
管线B 闭集语料LLM抽取（默认 minimax/MiniMax-M3）: corpus .md/.txt 前50 → 内容哈希skip → chunk≤4000字×4
  → 闭集prompt → 校验链（JSON→shape→闭集+方向；失败反馈重试一次）→ 未知类型降级Concept/违规谓词丢弃计数
  → alignEntity: 优先并入NocoBase规范行（业务数据为权威）→ 语料新实体 id=kb:<scope>#<name>
```

### 1.3 能力差距表（现状 vs 目标）

| 目标 | 判定 | 差距 |
|---|---|---|
| 构建可重跑可增量 | 🟢 达标 | 指纹 skip/七列锚/tombstone/水位/幂等二跑零漂移硬断言全齐；残留：全量快照 O(全表)（NocoBase 无 updatedAt）、corpus 是 delete-then-re-extract |
| 本体 schema 版本化 | 🟡 半缺 | registry 行有 created/updated/status；**缺版本号/变更历史/diff/迁移语义**；`KgOntologySource` 预留 `'agent-defined'` 未实现 |
| 映射规则管理 | 🔴 缺 | R01-R13 TS 硬编码；唯一外置=yml 白名单+fkLinks；`skippedRelationFields` 有收集无上报；无规则启停/单规则报告 |
| 质量报告 | 🔴 缺 | run report 只有过程计数（degraded/dropped/merged/tombstoned）；**report 不落库**（进程退出即失）；无覆盖率/孤岛/冲突指标 |
| NL→图查询 | 🔴 缺 | 工具面无路径/属性过滤/聚合（刻意保守）；UI 面 3 个硬编码正则 |

## 2. 开源生态调研结论（R4，证据见其报告）

| 领域 | 结论 | 关键证据 |
|---|---|---|
| 本体标准 | **自研 TS registry 升级为单一事实源**（JSON Schema/ajv 校验+semver+迁移）；LinkML 不引 runtime（JS 生态 4 年弃更、无校验，源码级审计），仅列编译期可选镜像；SHACL 用 `rdf-validate-shacl`（纯 ESM，Core 28/28 W3C 套件）列**后期可选**；避开 OWL DL 推理（全 Java，TS 无实现） | 报告 §02/§03 |
| 构建管线 | 映射层自研 **YARRRML 语义子集 YAML DSL**+git 事实源+向导式 UI（业界铁律：声明式文件为源、UI 只编辑文件）；Morph-KGC 子进程不引入（RDF 两跳负担）；LLM 抽取升级 schema 约束抽取（structured output+strict 后过滤），prompt 可抄 GraphRAG/llm-graph-builder/graphiti | 报告 §04 |
| 存储查询 | **留在 SQLite**：Kùzu 2025-10-10 归档+npm deprecated+Apple 收购（Critical 五源）；SQLite 递归 CTE 10 万节点 3-hop ≈10-30ms（三源交叉）；graphology 补图算法、sqlite-vec 补向量 | 报告 §05 |
| NL→查询 | 模板+槽位填充优先（dbt 基准 100% vs 裸生成 64.5%，失败即报错）；三段校验门（parse→EXPLAIN→只读事务）兜底 | 报告 §05 |
| AI+KG 质量 | 三层去重漏斗（sqlite-vec 余弦→MinHash/LSH→LLM 终审，graphiti 代码级可移植）；12 项质量指标+SHACL 风格报告+CI 门禁；本体演化=semver+不可变迁移+废弃不删除+级联重校验 | 报告 §06/§07 |

## 3. 务实选型裁决（H 轮采纳子集 + 后期留白）

### 3.1 本期做（H2/H3 批）

1. **本体版本化**（对齐 R4 P0）：registry 是唯一真源——`kg_node_types`/`kg_relations` 加 `version` 与变更审计（旁挂 `kg_ontology_revisions` 历史表），本体可导出为带 semver 的 JSON 文档；TS 内置种子声明补 JSON Schema（ajv）校验（闭集方向校验已有 `validateEdge`，补「定义面」校验）；SCHEMA_VERSION 2→3（pre-release 立场：拒绝旧库，kg-build 可重建）。
2. **映射规则文件化**：把 [`cordis.patch.yml`](../../examples/kb-agent/cordis.patch.yml) 的 `collections` 白名单+`fkLinks` 提升为独立版本化 YAML 映射文件（YARRRML 语义子集方向：`sources`/`subjects`/`predicates` 结构化声明），kg-build 读取该文件驱动管线 A；`skippedRelationFields` 补进 `CollectionRunReport` 上报。
3. **质量报告落库+指标**：新表 `kg_build_runs`（run 级 JSON 快照+指标列）；指标首期集：节点/边覆盖率（vs 源行数）、孤岛（度=0 活节点）、冲突（同锚多 fact）、degraded/dropped/merged/tombstoned 过程计数归档；`kg.stats` 网关方法扩展暴露；ui-kg 图谱 tab 增质量面板（只读）。
4. **NL 查询一期（保守）**：UI 短语框从 3 正则升级为**服务端模板+槽位填充**编译（NL→{seeds, relation_types, hops}），复用 [`extract.ts`](../../packages/kb/kg-build/src/extract.ts) 的闭集校验模式；不做自由生成（text2cypher 列后期，配三段校验门）。
5. **工具面收敛**：v1 `kb_graph_query`/`kb_graph_add` 默认禁用（配置开关保留代码），消除两代词汇分裂；快照链（[`kg-tools.spec.ts`](../../examples/kb-agent/tests/kg-tools.spec.ts)+[`snapshots/kg-tools/expected.md`](../../examples/kb-agent/tests/snapshots/kg-tools/expected.md)）同 PR 更新。

### 3.2 后期留白（I+ 轮，按需启动）

SHACL 校验（rdf-validate-shacl）、三层去重漏斗（sqlite-vec+MinHash+LLM 终审，替换 Jaro-Winkler 单层）、本体编辑 UI（本期只读管理面）、自由 NL 查询（三段校验门）、事件驱动增量（NocoBase webhook→单 scope 重算）、连接器腿 providerId 隔离、embedding 列启用（语义对齐）。

### 3.3 可用性验收口径（用户「要可用」的定义）

| 面 | 验收 |
|---|---|
| 本体 | 版本化+审计+JSON 导出+定义面校验；ui-kg 可浏览本体层级（extends 树）与版本 |
| 映射 | 映射规则独立文件版本化；图谱 tab 规则清单（每规则命中节点/边数、skip 原因）；改白名单零改代码 |
| 流水线 | 可重跑（幂等二跑零漂移保持）+增量（指纹 skip）——现有断言电池全绿并扩质量断言 |
| 质量 | 每次构建产出质量报告（落库+UI 面板）：覆盖率/孤岛/冲突/过程计数 |
| 查询 | 模板槽位 NL 查询在图谱 tab 实测中文问题（如「张红喜供货的所有产品」）；AI 工具 kg_schema/kg_subgraph 带版本信息 |

## 4. 风险

| 风险 | 等级 | 预案 |
|---|---|---|
| SCHEMA_VERSION 2→3 拒旧库：若 sqlite 是唯一幸存副本（NocoBase 已清库）则重建不可达 | 中 | 迁移策略写入 H2 详档：检测 v2 库→`kg-build.mts` 重建流程跑通后才 bump；setup-dsh-data 无条件重放链保底 |
| 本体版本化触碰快照链（registry 枚举文本入 [`expected.md`](../../examples/kb-agent/tests/snapshots/kg-tools/expected.md)） | 中 | 同 PR 更新快照（AGENTS.md 惯例）；kg-build.mts 断言电池同步扩 |
| v1 工具禁用的存量消费方（测试/系统提示路由 [`kg.ts:258`](../../packages/kb/tool-kb/src/kg.ts:258)） | 中 | H3 第 0 步全库盘点 `kb_graph_query|kb_graph_add` 引用；禁用走配置默认值非删码 |
| 映射文件化后 yml 与新文件双源漂移 | 低 | cordis.patch.yml 的 collections/fkLinks 标注 deprecated 指向新文件；verify 断言新文件存在且被读取 |
| NL 模板槽位覆盖不足（3 正则→模板集的迁移损失） | 低 | 保留旧 3 模板语义作为模板集前 3 项；e2e 中文问题清单逐条实测 |
