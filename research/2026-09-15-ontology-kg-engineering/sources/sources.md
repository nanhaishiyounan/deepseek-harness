# 调研来源清单（Sources）

> 与报告 §8.1 对应；按调研五簇组织。标注「本地」的来源已归档在 sources/ 下。

## A 簇 · 本体建模标准

- LinkML 官方文档站（slots/inheritance/generators/json-schema/typescript/validating-data/manage-releases）— https://linkml.io/linkml/
- linkml-runtime npm（死寂证据）— https://www.npmjs.com/package/linkml-runtime
- linkml/linkml-runtime.js【本地克隆】— https://github.com/linkml/linkml-runtime.js
- linkml-map — https://github.com/linkml/linkml-map
- LinkML 官方样例（transform）— https://github.com/linkml/linkml-map/tree/main/tests/input/examples/personinfo_basic
- LinkML Schema Registry — https://linkml.io/linkml-registry/
- W3C SHACL 规范 — https://www.w3.org/TR/shacl/
- zazuko/rdf-validate-shacl【本地 zip】— https://github.com/zazuko/rdf-validate-shacl
- rdf-ext/shacl-engine — https://github.com/rdf-ext/shacl-engine
- SHACL Playground（rdf-ext）— https://playground.rdf-ext.org/shacl/
- W3C OWL 2 — https://www.w3.org/TR/owl2-syntax/
- eyeling / EYE（JS/WASM N3 推理）— https://eyereasoner.github.io/
- rdfjs-inference-engine — https://github.com/pietercolpaert/rdfjs-inference-engine
- K-CAP 2025 OWL+SHACL 协同论文 — https://dl.acm.org/doi/full/10.1145/3731443.3771340
- OBO Foundry FP-004 版本化原则 — https://obofoundry.org/principles/fp-004-versioning.html
- Cell Ontology 术语维护惯例 — https://obophenotype.github.io/cell-ontology/Keeping_ontology_terms_up_to_date/
- CIKM 2025 石化 LinkML 案例 — https://dl.acm.org/doi/10.1145/3746252.3761514
- OWA 工程直觉讲解 — https://tesseract.academy
- ISWC 2025 "OWL or SHACL" 教程 — https://semanticmasterclass.github.io/iswc2025/

## B 簇 · KG 构建管线

- YARRRML 教程（全量样例）— https://rml.io/yarrrml/tutorial/getting-started/
- RML vs R2RML — https://rml.io/docs/rml/rmlvsr2rml/
- RML-Core 规范仓库 — https://github.com/kg-construct/rml-core
- Morph-KGC — https://github.com/morph-kgc/morph-kgc
- Morph-KGC 2025 优化计划论文 — https://journals.sagepub.com/doi/pdf/10.3233/SSW250005
- SPARQL-Anything（现址）— https://github.com/SPARQL-Anything/sparql.anything
- Façade-X W3C 规范组 — https://w3c-facade-x.github.io/facade-x-specs/
- awesome-kgc-tools 工具矩阵（14 物化器 + 11 编辑器）— https://kg-construct.github.io/awesome-kgc-tools/
- OWL2YARRRML（本体→映射模板）— https://github.com/kg-construct/OWL2YARRRML
- yarrrml-parser npm — https://www.npmjs.com/package/@rmlio/yarrrml-parser
- example-yarrrml-rules 官方样例库 — https://github.com/RMLio/example-yarrrml-rules
- Neo4j Data Importer — https://data-importer.neo4j.io/ 及 https://neo4j.com/docs/data-importer/current/
- neosemantics（RDF→LPG 桥接负担证据）— https://github.com/neo4j-labs/neosemantics
- Microsoft GraphRAG — https://microsoft.github.io/graphrag/ 及 https://github.com/microsoft/graphrag
- GraphRAG 成本实测（baeke.info）— https://baeke.info/2024/07/11/token-consumption-in-microsofts-graph-rag/
- GraphRAG 成本讨论 #440 — https://github.com/microsoft/graphrag/discussions/440
- LLMGraphTransformer（Python）— https://reference.langchain.com/python/langchain-neo4j/graph_transformers/llm/LLMGraphTransformer
- LLMGraphTransformer（langchainjs）— https://reference.langchain.com/javascript/langchain-community/experimental/graph_transformers/llm/LLMGraphTransformer
- Neo4j llm-graph-builder — https://github.com/neo4j-labs/llm-graph-builder
- llm-graph-builder schema prompt 源码 — https://github.com/neo4j-labs/llm-graph-builder/blob/main/backend/src/shared/schema_extraction.py
- GLiNER — https://github.com/urchade/GLiNER
- LightRAG — https://github.com/HKUDS/LightRAG
- arXiv 2411.09601（LLM 本体工程综述）— https://arxiv.org/abs/2411.09601
- arXiv 2510.20345（LLM KGC 综述）— https://arxiv.org/abs/2510.20345
- arXiv 2507.03226（Practical GraphRAG）— https://arxiv.org/abs/2507.03226

## C 簇 · 存储与查询

- Kùzu 归档仓库 — https://github.com/kuzudb/kuzu
- kuzu npm（deprecated）— https://www.npmjs.com/package/kuzu【本地 tarball + NOTES.md】
- BetaKit：Apple 收购 Kùzu — https://betakit.com/apple-strikes-deal-to-acquire-canadian-database-software-startup-kuzu/
- MacRumors 收购报道 — https://www.macrumors.com/2026/02/11/apple-acquires-new-database-app/
- gdotv：Kùzu 遗产与后继生态全景 — https://gdotv.com/blog/kuzu-legacy-embedded-graph-database-landscape/
- gdotv：Ladybug Spreading Its Wings — https://gdotv.com/blog/（Ladybug 路线图文）
- LadybugDB 主仓 — https://github.com/LadybugDB/ladybug
- LadybugDB 官网 — https://ladybugdb.com
- @ladybugdb/core（npm）— https://registry.npmjs.org/@ladybugdb/core
- LadybugDB Node API 文档 — https://docs.ladybugdb.com/client-apis/nodejs/
- FalkorDB：Kùzu 迁移路径 — https://www.falkordb.com/blog/kuzudb-to-falkordb-migration/
- cognee 迁移实录（issues #3529/#4474/#4365/#3491/#5031/#5042）— https://github.com/topoteretes/cognee
- SQLite WITH RECURSIVE 官方文档 — https://www.sqlite.org/lang_with.html
- SQLite 论坛：递归 CTE 最短路权威帖 — https://sqlite.org/forum/info/a79ba01a941c29b3
- mako.ai CTE 进阶指南 — https://mako.ai/guides/sqlite/common-table-expressions-advanced
- CongraphDB SQLite 基准（利益相关标注）— https://congraph-ai.github.io/congraphdb-benchmark/engines/sqlite/
- dev.to ctxgraph：SQLite 图实证 — https://dev.to/rohansx/sqlite-as-a-graph-database-recursive-ctes-semantic-search-and-why-we-ditched-neo4j-1ai
- sqlite3-bfsvtab-ext（C 扩展 BFS）— https://github.com/abetlen/sqlite3-bfsvtab-ext
- shwetarkadam/sqlite-graph（同构参考）— https://github.com/shwetarkadam/sqlite-graph
- graphology 主站与标准库 — https://graphology.github.io/
- graphology GitHub — https://github.com/graphology/graphology
- sqlite-vec — https://github.com/asg017/sqlite-vec
- sqlite-vec JS 集成文档 — https://alexgarcia.xyz/sqlite-vec/js.html
- levelgraph（死寂证据）— https://github.com/levelgraph/levelgraph
- Neo4j Text2Cypher Guide — https://neo4j.com/blog/genai/text2cypher-guide/
- Neo4j text2cypher 基准 — https://neo4j.com/blog/developer/benchmarking-neo4j-text2cypher-dataset/
- Neo4j 模型挣扎分析 — https://neo4j.com/blog/developer/text2cypher-model-struggles-dataset-improvements/
- neo4j-labs/text2cypher 数据集 — https://github.com/neo4j-labs/text2cypher
- LangChain GraphCypherQAChain — https://docs.langchain.com/oss/python/integrations/graphs/neo4j_cypher
- text2sql 生产指南（aiworkflowlab）— https://aiworkflowlab.dev/article/text-to-sql-llm-production-schema-linking-guardrails-2026
- dbt 语义层 vs text-to-SQL 基准 — https://docs.getdbt.com/blog/semantic-layer-vs-text-to-sql-2026
- memgraph：三类问题分流 — https://memgraph.com/blog/text-to-cypher-graphrag-analytical-questions
- LlamaIndex PropertyGraph 检索器指南 — https://developers.llamaindex.ai/
- LLM 递归 SQL 反模式（sql-skills-plugin）— https://github.com/ctoth/sql-skills-plugin
- neo4j-field/query-subschema — https://github.com/neo4j-field/query-subschema

## D 簇 · AI+KG 质量

- getzep/graphiti【本地克隆】— https://github.com/getzep/graphiti
- Zep 论文 — https://arxiv.org/abs/2501.13956
- graphiti 边失效算法解析（DeepWiki）— https://deepwiki.com/getzep/graphiti/5.3-edge-extraction-and-resolution
- splink Fellegi-Sunter 理论 — https://moj-analytical-services.github.io/splink/topic_guides/theory/fellegi_sunter.html
- embeddings-at-scale：实体解析工程章 — https://snowch.github.io/embeddings-at-scale-book/chapters/ch28_entity_resolution.html
- KG Book 第 7 章（Zaveri 2016 框架开放全文）— https://www.emse.fr/~zimmermann/KGBook/Multifile/quality-assessment/
- OntoQA 论文镜像 — https://budakarpinar.github.io/papers/ontoqa.pdf
- EMNLP 2024 Extract-Define-Canonicalize — https://aclanthology.org/2024.emnlp-main.548/
- AutoSchemaKG 主题综述 — https://emergentmind.com/topics/autoschemakg
- graphiti issue #1728（失效全图误伤）— https://github.com/getzep/graphiti/issues/1728

## E 簇 · 其余锚点

- arXiv 2511.16935（LinkML 修订版论文）— https://arxiv.org/abs/2511.16935
- deepwiki linkml 最佳实践 — https://deepwiki.com/linkml/linkml/8.1-schema-best-practices
- oeg-upm/kgc-eval（RML 引擎评测）— https://github.com/oeg-upm/kgc-eval
- KGC Workshop（kg-construct）— https://kg-construct.github.io/
- awesome-cypher（Cypher 实现清单）— https://github.com/szarnyasg/awesome-cypher
- validatingrdf.com（免费书）— https://www.validatingrf.com/
