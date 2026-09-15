# 00 · 执行摘要与阅读指南

> 调研主题：本体知识图谱工程——AI + 开源库（L4 深度调研）
> 调研日期：2026-09-14 ~ 2026-09-15 · 深度等级：Exhaustive · 覆盖 12 个深潜分支 + 4 个仓库/包审计
> 目标读者：deepseek-harness 食品行业 KB+agent 产品的 KG 工程负责人

## 0.1 调研背景与既有体系

deepseek-harness 产品已有一套自研知识图谱：TypeScript/ESM 技术栈，SQLite 存储 ~1100 节点（目标规模 1k~100k），31 类型 + 23 关系的 TS registry，双管线构建（13 条确定性映射规则 + LLM 抽取），React 画布可视化，AI 查询工具。

升级目标为「真可用」：本体工程（schema/约束/版本化）、映射层管理（本体↔数据源映射规则可管理可编辑）、AI 增强（抽取/对齐/质量评估）、质量报告、构建可重跑可增量、自然语言→图查询。

硬约束：TS/ESM、SQLite 嵌入式、无 Java、避免重基建（不引入 triple store / 独立图数据库服务，除非证据压倒性）。

五大调研问题：
1. 本体建模标准对比：LinkML vs OWL/RDFS vs SHACL vs 自定义 TS registry
2. KG 构建管线开源生态：RML 映射工具、LLM-based KG construction、映射规则管理形态
3. 存储与查询：Kùzu vs SQLite 递归 CTE vs 轻量方案；NL→图查询实践与陷阱
4. AI+KG：实体对齐/去重、schema induction、质量指标、本体演化与版本迁移
5. 务实选型输出（最重要）：「最小而正确」路径 + adopt/avoid 清单

## 0.2 十条核心结论（TL;DR）

**结论 1 · 本体 schema：自研 TS registry 保持单一事实源地位，升级而非替换。**
LinkML 工具链（generators / validator / linkml-map）全部以 Python 为中心；官方 JS runtime（npm 包 `linkml-runtime`）最后发布 2022-09-01（4 年前）、周下载仅 5 次、README 自述 EXPERIMENTAL、全库无任何校验能力（源码级审计确认，见 §2.2/§2.6）。证据压倒性地支持：TS registry 继续做单一事实源，升级其表达能力（约束/版本化/派生 JSON Schema）；LinkML 可作为可选的互操作镜像层（编译期 `gen-json-schema` / `gen-typescript`，不进运行时依赖）。

**结论 2 · 约束校验：双轨制。**
主轨 = JSON Schema + ajv（进程内、零转换成本、`additionalProperties:false` 默认闭合）；质量报告轨 = SHACL（`rdf-validate-shacl`：SHACL Core 28/28 约束组件全覆盖、纯 ESM、MIT、W3C 官方测试套件背书），其 ValidationReport（conforms/results/severity/focusNode/message）直接作为质量报告的业界标准格式。

**结论 3 · 映射层管理：声明式 YAML DSL（借鉴 YARRRML 语义子集）+ git 事实源 + 向导式 UI。**
开源世界的铁律：所有映射编辑器 UI（Matey / Karma / Mapping Workbench / Neo4j Data Importer）都以声明式文件为事实源，UI 只生成/编辑文件。Morph-KGC 等 Python 引擎的产物是 RDF 三元组，对非 RDF 团队构成「映射文件→RDF→(第二套映射)→属性图」的两跳连锁负担，不引入运行时；只借鉴 YARRRML 语义自研 TS 执行器。

**结论 4 · LLM 抽取升级为 schema 约束抽取。**
structured output + Zod 契约 + strict 后过滤（白名单外实体连同引用它的边一并丢弃——langchainjs 版 LLMGraphTransformer 恰恰缺这个端点校验，需自补）。prompt 模板直接抄三家开源：GraphRAG（`prompts/index/extract_graph.py`）、Neo4j llm-graph-builder（`schema_extraction.py`）、graphiti（extract_nodes/extract_edges/dedupe 全家桶）。抽取层用 DeepSeek 类便宜模型（实测 120 万 tokens ≈ $8.2，比 gpt-4-turbo 低一个数量级）。

**结论 5 · 存储：留在 SQLite；不引入 Kùzu（已死），也不急着上 LadybugDB（0.x）。**
Kùzu 于 2025-10-10 归档、npm 包同日 deprecated、团队被 Apple acqui-hire（2026-02 欧盟备案确认）。唯一活跃继任 LadybugDB（`@ladybugdb/core` 0.20.4，周下载 94k）仍在 0.x，头部用户 cognee 迁移实录 bug 频出（Cypher 方言差异、连通分量算错等 6+ 实录 issue）。SQLite 递归 CTE 在 10 万节点 3-hop ≈ 10-30ms（两独立来源交叉），覆盖 1k~100k 目标场景。

**结论 6 · 图算法上应用层：graphology。**
周下载 114 万、22 个标准子包（components/louvain/metrics/shortest-path/dag），直接吃边表 `mergeNode/mergeEdge` 幂等构建，孤岛检测 = `connectedComponents()` 一行。SQLite 内不硬写 PageRank/社区检测。

**结论 7 · 向量检索：sqlite-vec。**
vec0 虚拟表 + KNN MATCH 语法，npm 周下载 122 万，与 better-sqlite3 三行集成，实体去重与语义检索共用一套 embedding 基础设施。

**结论 8 · NL→图查询：模板+槽位填充优先、自由生成受控兜底。**
Neo4j 官方基准：text2cypher 执行准确率（ExactMatch）最好模型仅 ~30%；dbt 语义层基准：模板覆盖范围内 100% 且失败模式是「报错」而非「自信给错数」。推荐：确定性图查询工具集（多跳邻居/路径/社区/聚合）+ LLM 槽位填充 + 三段校验门（parse → EXPLAIN → 只读事务）兜底自由 text2SQL；FTS5 + sqlite-vec + RRF 检索式兜底语义探索。

**结论 9 · 去重三层漏斗（抄 graphiti 代码级实现）。**
① sqlite-vec 余弦候选（阈值 ≥0.6，top 15）→ ② 确定性层：精确归一化名匹配 + MinHash/LSH（3-gram、blake2b、32 permutation、band=4）Jaccard ≥0.9、Shannon 熵 ≥1.5 门控（零 API 成本）→ ③ LLM 批量终审（结构化输出 + 防御性校验：缺 id/越界 id 一律忽略，宁漏合不误合）。阈值必须在标注样本上画 PR 曲线自标定，忌拍脑袋 0.85/0.92（无文献背书）。

**结论 10 · 本体演化：semver + 不可变迁移脚本 + 废弃不删除。**
OBO Foundry FP-004 惯例（versionIRI 唯一且永久可解析、已发布制品不可变、bug 只能发新版本）+ db migrations 成熟模式（schema_version 表 + 顺序迁移脚本 + 回填）。加类/加可选关系 = minor；改语义/改域约束/废弃类 = major（deprecated 标记 + 替代 IRI + 双写过渡一个 minor 周期）；本体变更后按受影响类型反查实例做级联重校验。

## 0.3 adopt / avoid 总览表

| 维度 | ✅ ADOPT | ❌ AVOID（理由） |
|---|---|---|
| schema 定义 | 自研 TS registry（升级约束/版本化）+ 生成 JSON Schema；LinkML 作可选互操作镜像 | linkml-runtime npm（4 年弃更、无校验）；OWL DL 推理栈（HermiT/ELK/Pellet 全 Java，TS 无实现） |
| 约束校验 | ajv（主轨，进程内）+ rdf-validate-shacl（质量报告轨，Core 28/28） | 在 TS 里找 OWL DL 推理机（不存在成熟实现） |
| 映射层 | 自研 YAML DSL（YARRRML 语义子集：sources/subject/po/join/when/fn）+ git 事实源 + 向导 UI | Morph-KGC 子进程（产物 RDF，两跳转换负担）；RMLMapper/CARML（Java）；映射规则 DB 化（无业界先例） |
| LLM 抽取 | structured output + Zod + strict 后过滤；DeepSeek 便宜模型做抽取层；GLiNER（Apache-2.0，CPU/ONNX）做零样本 NER 兜底 | 无白名单自由抽取；贵模型全量抽取（GraphRAG gpt-4-turbo 1000 页 PDF=$120） |
| 存储 | SQLite（WAL + 递归 CTE + FTS5 + sqlite-vec + graphology 组合） | kuzu@0.11.3（deprecated + 归档 + 500MB 包）；triple store / 独立图数据库服务（违反硬约束且无必要）；LadybugDB（观察名单：0.x + cognee 迁移实录 bug） |
| 图算法 | graphology + graphology-components/louvain/metrics | levelgraph（2 年零发布、9 依赖 LevelDB 栈、26 dependents，死寂）；SQL 内硬写 PageRank（应用层做） |
| NL 查询 | 确定性工具集 + 槽位填充；三段校验门；FTS5+vec+RRF 检索兜底 | 裸 text2cypher/text2SQL 直连执行（~30% 执行准确率 + 幻觉 join + $40k 扫表事故先例） |
| 时态模型 | bi-temporal 边（valid_at/invalid_at 业务线 + created_at/expired_at 系统线，失效不删除） | 物理删除/覆盖历史边（丢失溯源与回放能力） |

## 0.4 阅读指南

- §02 本体建模标准对比 —— 调研问题 1（LinkML/OWL/SHACL/自研四路线全对比 + 决策矩阵）
- §03 KG 构建管线开源生态 —— 调研问题 2（RML 映射生态 + LLM KGC + 映射管理形态）
- §04 存储与查询选型 —— 调研问题 3（Kùzu 归档剧变 + SQLite 路线 + NL→图查询）
- §05 AI+KG 质量工程 —— 调研问题 4（去重/归纳/指标/演化）
- §06 务实选型与路线图 —— 调研问题 5（目标架构 + adopt/avoid 证据链 + P0/P1/P2 路线）
- §07 可操作产出汇总 —— 全部代码骨架/DDL/SQL/TS 片段/清单集中处
- §08 来源与证据质量 —— 全部 URL 来源表、三角化记录、矛盾清单、不确定性分级

证据分级约定（详见 §08）：**[Critical]** 多独立来源交叉的关键结论；**[Important]** 单一来源但可信（一手文档/源码），使用时注意边界；**[Observation]** 推测性判断，已标注不确定性。
