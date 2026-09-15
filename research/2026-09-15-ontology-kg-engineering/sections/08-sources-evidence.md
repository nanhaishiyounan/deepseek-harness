# 08 · 来源清单、三角化与证据质量

## 8.1 来源总表（按簇）

### A 簇 · 本体建模标准

| 来源 | URL | 用途 |
|---|---|---|
| LinkML 官方文档（slots/inheritance/generators/json-schema/typescript/validating-data/manage-releases） | https://linkml.io/linkml/ | schema 能力/generators/校验/版本化一手 |
| linkml-runtime npm | https://www.npmjs.com/package/linkml-runtime | JS runtime 死寂证据 |
| linkml/linkml-runtime.js 源码（本地克隆） | https://github.com/linkml/linkml-runtime.js → sources/linkml-runtime.js/ | API 面/无校验能力/ESM 审计 |
| linkml-map | https://github.com/linkml/linkml-map | 映射规范语义 + transform 样例 |
| W3C SHACL 规范 | https://www.w3.org/TR/shacl/ | Core 28 组件/ValidationReport/targets |
| zazuko/rdf-validate-shacl（zip 落盘） | https://github.com/zazuko/rdf-validate-shacl → sources/rdf-validate-shacl/ | 源码级约束矩阵/API/维护度 |
| rdf-ext/shacl-engine | https://github.com/rdf-ext/shacl-engine | 竞品对比（SPARQL 支持/性能声称） |
| W3C OWL2 / RDFS | https://www.w3.org/TR/owl2-syntax/ | OWL 表达力 |
| eyeling / EYE | https://eyereasoner.github.io/ | TS 可用 N3 推理 |
| K-CAP 2025 OWL+SHACL 协同论文 | https://dl.acm.org/doi/full/10.1145/3731443.3771340 | 分工教训（转述级） |
| OBO Foundry FP-004 | https://obofoundry.org/principles/fp-004-versioning.html | 版本化原则 |
| CIKM 2025 石化 LinkML 案例 | https://dl.acm.org/doi/10.1145/3746252.3761514 | 工业级案例 |
| OWA 工程陷阱 | https://tesseract.academy | OWA/CWA 直觉解释 |

### B 簇 · 构建管线

| 来源 | URL | 用途 |
|---|---|---|
| YARRRML 教程 | https://rml.io/yarrrml/tutorial/getting-started/ | DSL 全量样例 |
| RML vs R2RML | https://rml.io/docs/rml/rmlvsr2rml/ | 标准演进 |
| Morph-KGC | https://github.com/morph-kgc/morph-kgc | 物化引擎/配置样例/局限 |
| Morph-KGC 2025 论文 | https://journals.sagepub.com/doi/pdf/10.3233/SSW250005 | 优化计划 |
| SPARQL-Anything | https://github.com/SPARQL-Anything/sparql.anything + https://sparql-anything.cc/ | facade-x 虚拟化 |
| awesome-kgc-tools 工具矩阵 | https://kg-construct.github.io/awesome-kgc-tools/ | 映射管理形态盘点（14+11 工具） |
| OWL2YARRRML | https://github.com/kg-construct/OWL2YARRRML | 本体→映射模板生成 |
| yarrrml-parser（npm） | https://www.npmjs.com/package/@rmlio/yarrrml-parser | JS 生态证据 |
| example-yarrrml-rules | https://github.com/RMLio/example-yarrrml-rules | 官方样例库 |
| Microsoft GraphRAG | https://microsoft.github.io/graphrag/ + https://github.com/microsoft/graphrag | 架构/prompt 路径/成本 |
| GraphRAG 成本实测 | https://baeke.info/2024/07/11/token-consumption-in-microsofts-graph-rag/ + github.com/microsoft/graphrag/discussions/440 | token 数字 |
| LLMGraphTransformer（py/js） | https://reference.langchain.com/python/langchain-neo4j/graph_transformers/llm/LLMGraphTransformer + reference.langchain.com/javascript | API/差异 |
| Neo4j llm-graph-builder | https://github.com/neo4j-labs/llm-graph-builder | schema UI 先例/prompt 路径 |
| GLiNER | https://github.com/urchade/GLiNER | 零样本 NER 兜底 |
| LightRAG | https://github.com/HKUDS/LightRAG | 增量索引/成本旋钮 |
| 综述三篇 | arXiv 2411.09601 / 2510.20345 / 2507.03226 | 方法分类/94% 降本证据 |

### C 簇 · 存储与查询

| 来源 | URL | 用途 |
|---|---|---|
| Kùzu 归档 repo | https://github.com/kuzudb/kuzu | 归档横幅/v0.11.3 |
| Apple 收购报道 | https://betakit.com/apple-strikes-deal-to-acquire-canadian-database-software-startup-kuzu/ + https://www.macrumors.com/2026/02/11/apple-acquires-new-database-app/ | acqui-hire 证据 |
| kuzu npm（tarball 落盘 + NOTES.md） | https://www.npmjs.com/package/kuzu → sources/kuzu-npm/ | deprecated/500MB/API 面/加载机制 |
| LadybugDB | https://github.com/LadybugDB/ladybug + https://ladybugdb.com + registry.npmjs.org/@ladybugdb/core | fork 现状/分包架构 |
| gdotv 全景文 | https://gdotv.com/blog/kuzu-legacy-embedded-graph-database-landscape/ | 后继生态全景 |
| FalkorDB 迁移博客 | https://www.falkordb.com/blog/kuzudb-to-falkordb-migration/ | 迁移路径 |
| cognee 迁移实录 | https://github.com/topoteretes/cognee（issues #3529/#4474/#4365/#3491/#5031/#5042） | fork 磨合 bug |
| SQLite WITH RECURSIVE 官方 | https://www.sqlite.org/lang_with.html | 图遍历官方三例 |
| SQLite 论坛最短路帖 | https://sqlite.org/forum/info/a79ba01a941c29b3 | 递归 CTE 硬限制权威论证 |
| mako.ai CTE 进阶 | https://mako.ai/guides/sqlite/common-table-expressions-advanced | 环检测三式 |
| CongraphDB 基准 | https://congraph-ai.github.io/congraphdb-benchmark/engines/sqlite/ | 遍历矩阵（利益相关标注） |
| dev.to ctxgraph | https://dev.to/rohansx/sqlite-as-a-graph-database-recursive-ctes-semantic-search-and-why-we-ditched-neo4j-1ai | SQLite 图实证 |
| graphology | https://graphology.github.io/ + https://github.com/graphology/graphology | 生态/子包/TS |
| sqlite-vec | https://github.com/asg017/sqlite-vec + https://alexgarcia.xyz/sqlite-vec/js.html | vec0/Node 集成 |
| levelgraph | https://github.com/levelgraph/levelgraph | 死寂证据 |
| Neo4j Text2Cypher Guide | https://neo4j.com/blog/genai/text2cypher-guide/ | 七步管线/四象限 |
| Neo4j text2cypher 基准 | https://neo4j.com/blog/developer/benchmarking-neo4j-text2cypher-dataset/ + .../text2cypher-model-struggles-dataset-improvements/ | ~30% 数字/错误分组 |
| LangChain GraphCypherQAChain | https://docs.langchain.com/oss/python/integrations/graphs/neo4j_cypher | 参数全表 |
| text2sql 生产指南 | https://aiworkflowlab.dev/article/text-to-sql-llm-production-schema-linking-guardrails-2026 | 路由/三段门/事故 |
| dbt 语义层基准 | https://docs.getdbt.com/blog/semantic-layer-vs-text-to-sql-2026 | 100% vs 64.5% |
| memgraph 三类问题 | https://memgraph.com/blog/text-to-cypher-graphrag-analytical-questions | 分流框架 |
| LlamaIndex PGRetriever | https://developers.llamaindex.ai | 五检索器/模板化一等公民 |
| LLM 递归 SQL 反模式 | https://github.com/ctoth/sql-skills-plugin（common-mistakes.md） | 8 反模式 |

### D 簇 · AI+KG 质量

| 来源 | URL | 用途 |
|---|---|---|
| graphiti（本地克隆） | https://github.com/getzep/graphiti → sources/graphiti/ | 三层去重/bi-temporal/prompt 全家桶 |
| Zep 论文 | https://arxiv.org/abs/2501.13956 | 时态 KG 架构（转述级） |
| splink Fellegi-Sunter | https://moj-analytical-services.github.io/splink/topic_guides/theory/fellegi_sunter.html | m/u/λ 框架 |
| embedding-at-scale ER 章 | https://snowch.github.io/embeddings-at-scale-book/chapters/ch28_entity_resolution.html | blocking/阈值经验 |
| Zaveri 2016 框架 | https://www.emse.fr/~zimmermann/KGBook/Multifile/quality-assessment/ | 质量维度（开放全文） |
| OntoQA 论文 | https://budakarpinar.github.io/papers/ontoqa.pdf | RR/AR/IR 公式 |
| EMNLP 2024 schema 构建 | https://aclanthology.org/2024.emnlp-main.548/ | 抽取-定义-规范化三段式 |
| Graphiti issue #1728 | https://github.com/getzep/graphiti/issues/1728 | 失效全图误伤缺陷 |

## 8.2 关键结论三角化记录

| 关键结论 | 独立来源数 | 来源 |
|---|---|---|
| Kùzu 归档 + deprecated + Apple 收购 | 5 | GitHub 横幅 / npm registry / BetaKit / MacRumors / gdotv |
| SQLite 递归 CTE 在 10 万节点级可用 | 3 | sqlite.org 官方 / dev.to ctxgraph / CongraphDB（方向性） |
| rdf-validate-shacl Core 全覆盖 | 2 | 源码 28 validator / W3C data-shapes 套件测试记录 |
| linkml-runtime.js 不可生产用 | 3 | npm 元数据 / 源码审计 / 官方文档自述 |
| 模板化优于自由生成 | 4 | dbt 基准 / Neo4j 四象限 / LlamaIndex 检索器 / aiworkflowlab 路由数据 |
| 声明式文件是映射管理主流 | 2 | awesome-kgc-tools 矩阵 / rml.io 教程与样例库实践 |
| graphiti 去重/失效算法细节 | 2 | 源码克隆 / DeepWiki 代码解析 + 论文摘要转述 |

## 8.3 未解决矛盾清单（显式呈现，不隐藏）

| # | 矛盾 | 处置 |
|---|---|---|
| 1 | Kùzu 归档日期 Oct-10（社区）vs Oct-11（GitHub 横幅） | 跨 UTC 日界差异，无实质影响；npm 末版发布 10-10T18:52Z 为锚 |
| 2 | CongraphDB「100K 4-hop 35ms 且 1M 超时」vs dev.to「depth4×分支10 毫秒级」 | 规模与分支因子不同所致；采信区间 100K 3-hop ≈10-30ms；CongraphDB 为利益方自测已降权 |
| 3 | shacl-engine 15-26x 性能声称 vs rdf-validate-shacl 540 使用者的生态惯性 | 性能为作者自测无第三方复核 [Important]；接口同构可平替，选型不受阻塞 |
| 4 | text2cypher ~30%（ExactMatch）vs NL2SQL 75-85%（EX） | 评测协议不同（字符串精确匹配 vs 无序结果集）；量级结论一致：复杂输入下崩塌 |
| 5 | LadybugDB 能否直接打开 Kùzu data.kz | gdotv 称可以，官方路径是 EXPORT/IMPORT；未获权威确认 [Observation]；不影响 avoid-现采用判定 |
| 6 | GraphRAG v2 是否保留增量索引（v1 有 --method update） | 未能确认 [Observation]；不依赖（增量自建 hash 幂等） |
| 7 | embedding 去重阈值 0.85/0.92 | 无文献背书；以 0.9+/0.5-0.7 经验带 + PR 曲线自标定替代 [Critical 反面证据] |
| 8 | gen-json-schema 默认 draft 档位（$defs vs #/definitions 混见） | 文档未明示；P0 本机 ajv compile 冒烟确认 |
| 9 | graphiti 语言构成 | README 提及 TS/Go SDK 指商业平台；本框架 Python 99.3%（实测语言统计）——以代码为准 |

## 8.4 不确定性分级汇总

- **Critical（多源交叉，可直接采信）**：Kùzu 归档链、SQLite CTE 性能区间、SHACL-in-TS 可行性、模板化优先、LinkML 工具链 Python 中心、DeepSeek 成本量级、graphiti 算法细节、YARRRML 语义
- **Important（单一手源，使用注意边界）**：shacl-engine 性能数字、CongraphDB 矩阵、LadybugDB 发版节奏细节（registry 一手）、GLiNER 家族划分（README）、LightRAG 运维教训（README/issue）、OntoQA 公式（论文镜像）、K-CAP 论文教训（转述）
- **Observation（推测/未闭环，已标注）**：LadybugDB 文件级兼容、GraphRAG v2 增量、gen-json-schema draft 档位、LadybugDB 商业可持续性、CIKM 案例代码生成产物语言

## 8.5 本地归档资产清单

```
research/2026-09-15-ontology-kg-engineering/
├── report.md                 # 本报告（sections/ 合并产物）
├── metadata.json             # 调研元数据
├── sections/                 # 00-08 九节源文件
├── sources/
│   ├── linkml-runtime.js/    # 克隆（.git 已删）
│   ├── graphiti/             # 克隆（.git 已删，363 文件）
│   ├── rdf-validate-shacl/   # codeload zip 解包
│   └── kuzu-npm/             # npm pack tarball 解包 + NOTES.md 审计笔记
├── images/                   # （预留；本报告图表以 Mermaid 内嵌）
└── attachments/              # （预留）
```

报告完 · 生成于 2026-09-15 · Real Deep Research（SCOUT→MAP→DIVE×12→SATURATE→SYNTHESIZE→DELIVER）
