# 第 1 章 方法论与调研范围

## 1.1 调研编排

本次调研采用「编排器纯委派」模式：主任务不执行任何检索/阅读/分析，全部工作拆分为 17 个子任务（1 侦察 + 1 仓库审计 + 15 外部数据源分支），每个分支由独立子任务深挖至「信息饱和」（新信息重复或与目标无关）后才停止，最后由编排器在完整保留各分支原始发现的前提下综合成文。

| 阶段 | 子任务 | 模式 | 产出 |
|---|---|---|---|
| SCOUT | 全景侦察（6 组 DuckDuckGo 查询×10 条结果） | ask | 范式格局确认 + 12 个清单外新发现（Graphiti/cognee/OntoGPT/shacl-engine 等） |
| MAP | 16 分支知识图谱 | — | DIVE 计划 |
| DIVE | repo-audit（本仓库只读审计） | code | 整合成本基准（registry v4 数据模型/扩展点清单） |
| DIVE | Neo4j LLM Graph Builder | code | clone 审计（/tmp/drr-kg-sources/llm-graph-builder） |
| DIVE | Microsoft GraphRAG | code | clone 审计（/tmp/drr-kg-sources/graphrag） |
| DIVE | LightRAG | code | clone 审计（/tmp/drr-kg-sources/lightrag） |
| DIVE | LlamaIndex PropertyGraph | ask | 文档+main 分支源码逐文件审计 |
| DIVE | Graphiti (Zep) | code | clone 审计（/tmp/drr-kg-sources/graphiti）+ 论文全文 |
| DIVE | OpenSPG | ask | 官方文档站+GitHub+KAG 论文 |
| DIVE | DeepKE/Instruct-KGC | ask | GitHub README/协议文件+OneKE+IEPile 演进线 |
| DIVE | FoodOn | ask | OLS API 实测层级树+GitHub src/ontology 结构+关系页全文 |
| DIVE | SHACL 闭环 | ask | W3C 规范+两个 TS 库+kg-correction-loop 实证 |
| DIVE | 本体工具链 | ask | rdflib/owlready2/Protégé/WebProtégé/RDF-JS npm 实测 |
| DIVE | 本体版本化 | ask | OWL2 原语/KGCL/OM4OV/工业迁移实践 |
| DIVE | 学术脉络 | ask | Text2Onto/SKEMA/KGLIB 证伪/WhyHow.AI 遗存/ODKE+/GraphJudge/综述 |
| DIVE | 实体链接与共指 | ask | GLiNER/Splink/MatchGPT/LLM-Align/中文挑战 |
| DIVE | GraphRAG 问答整合 | ask | local/global/DRIFT 源码级/HippoRAG PPR/text2cypher 四象限 |
| DIVE | TS 图/RDF 生态 | ask | graphology/Kuzu（归档确认）/oxigraph/quadstore/comunica/可视化对比 |

## 1.2 搜索工具与查询

所有外部搜索经 chrome-devtools 驱动的 DuckDuckGo（`https://duckduckgo.com/?q=QUERY&ia=web`），evaluate_script 提取 organic 结果并过滤广告；进入平台后执行 in-region 探索（GitHub 组织页/Issues、文档站内搜索、arXiv 引文追踪）。代表性查询：

- `LLM knowledge graph construction framework 2025 2026` / `ontology-grounded LLM extraction schema constrained`
- `Neo4j LLM Knowledge Graph Builder` / `Graphiti Zep temporal knowledge graph` / `cognee knowledge graph memory`
- `TypeScript RDF SHACL rdfjs library` / `FoodOn food ontology` / `FoodEx2 FoodOn mapping`
- `entity linking survey LLM era` / `GLiNER zero-shot NER` / `Splink entity resolution blocking matching`
- `owl versionIRI versioning ontology best practice` / `MODO minimal ontology diff` / `KGCL change language`
- `knowledge graph schema evolution migration` / `LLM ontology evolution 2025`
- `graphrag local global drift search` / `HippoRAG personalized pagerank` / `text to cypher benchmark`
- `WebProtégé change tracking` / `quadstore sqlite rdf` / `owlready2 sqlite backend`

## 1.3 证据等级与三角验证

- **Critical（多源）**：关键选型结论均有 ≥2 独立来源（例：「Kuzu 已归档」由 Kuzu README 归档公告 + LlamaIndex 主仓库移除其集成 + PyPI 社区接管三方印证；「Graphiti 用四时间戳而非 INVALIDATED_BY 边」由论文 v1 全文 + 0.30.2 源码 grep 零命中双证）。
- **Important（单源，已标注）**：如 kg-correction-loop 的修复率数字（该仓库 180 例受控实验）；LightRAG gleaning 默认 1 轮（源码常量）。
- **Observation（推断，已标记）**：如「kg-construct 并入 kg2instruction」为目录命名+功能重合的高置信推断。

## 1.4 克隆仓库清单（审计后保留于 /tmp/drr-kg-sources/，均已删除 .git）

| 仓库 | 版本 | 许可证 | 审计深度 |
|---|---|---|---|
| neo4j-labs/llm-graph-builder | main@2026-09 | Apache-2.0 | 后端核心文件逐行 + 外部包 langchain_neo4j v0.10.0 pip 提取 |
| microsoft/graphrag | v3.1.2 | MIT | prompt 模板全文 + workflow 工厂 + 检索三路源码 |
| HKUDS/LightRAG | main@2026-09 | MIT | prompt.py/operate.py/base.py 关键段逐行 + WebUI package.json |
| getzep/graphiti | 0.30.2 | Apache-2.0 | nodes/edges/prompts/maintenance 全链 + 论文 arXiv 2501.13956 |

## 1.5 饱和判定

16 个数据源分支全部返回 SATURATED 判定；末轮分支（实体链接/GraphRAG 问答/TS 生态）的新发现节点（GLiNER.js、Splink、HippoRAG、Kuzu 归档、sigma 分层布局缺口）均已在各自分支内完成深挖，无未探索的高价值节点遗留。矛盾全部显式化（见第 11 章）。
