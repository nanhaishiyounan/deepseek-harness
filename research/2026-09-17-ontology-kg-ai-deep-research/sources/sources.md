# 第 12 章 来源清单

## 12.1 仓库（clone 审计）

| 来源 | URL | 许可证 |
|---|---|---|
| Neo4j LLM Knowledge Graph Builder | https://github.com/neo4j-labs/llm-graph-builder | Apache-2.0 |
| langchain-neo4j（LLMGraphTransformer 抽取引擎真身） | https://github.com/langchain-ai/langchain-neo4j | MIT |
| Microsoft GraphRAG | https://github.com/microsoft/graphrag | MIT |
| graspologic-native（Leiden Rust 内核） | https://github.com/graspologic-org/graspologic-native | — |
| LightRAG | https://github.com/HKUDS/LightRAG | MIT |
| Graphiti (Zep) | https://github.com/getzep/graphiti | Apache-2.0 |
| OpenSPG | https://github.com/OpenSPG/openspg | Apache-2.0 |
| KAG | https://github.com/OpenSPG/KAG | Apache-2.0 |
| DeepKE | https://github.com/zjunlp/DeepKE | MIT |
| OneKE | https://github.com/zjunlp/OneKE | MIT |
| IEPile | https://github.com/zjunlp/IEPile | MIT |
| LlamaIndex | https://github.com/run-llama/llama_index | MIT |
| llama-index-graph-stores-kuzu | https://pypi.org/project/llama-index-graph-stores-kuzu/ | MIT |
| Kuzu | https://github.com/kuzudb/kuzu（已归档） | MIT |
| FoodOn | https://github.com/FoodOntology/foodon | CC-BY-4.0 |
| graphology | https://github.com/graphology/graphology | MIT |
| shacl-engine | https://github.com/rdf-ext/shacl-engine | MIT |
| rdf-validate-shacl | https://github.com/zazuko/rdf-validate-shacl | MIT |
| pySHACL | https://github.com/RDFLib/pySHACL | Apache-2.0 |
| rdflib / OWL-RL | https://github.com/RDFLib/rdflib ／ https://github.com/RDFLib/OWL-RL | BSD-3 |
| quadstore / comunica / oxigraph / n3 | https://github.com/jacoscaz/quadstore ／ https://github.com/comunica/comunica ／ https://github.com/oxigraph/oxigraph ／ https://github.com/rdfjs/N3.js | MIT |
| GLiNER / GLiNER.js | https://github.com/urchade/GLiNER ／ https://github.com/Knowledgator/GLiNER.js | Apache-2.0 / MIT |
| MatchGPT | https://github.com/wbsg-uni-mannheim/MatchGPT | — |
| kg-correction-loop（SHACL+LLM 修复闭环实证） | https://github.com/erdemonal/kg-correction-loop | — |
| xpSHACL | https://github.com/gcpdev/xpshacl | — |
| owl2shacl / SHACL Play | https://github.com/sparna-git/owl2shacl ／ https://shacl-play.sparna.fr/ | — |
| WebProtégé | https://github.com/protegeproject/webprotege | BSD-2 |
| SKEMA | https://github.com/ml4ai/skema（休眠） | NOASSERTION |
| OntoLearner | https://github.com/sciknoworg/OntoLearner | — |
| neo4j text2cypher | https://github.com/neo4j-labs/text2cypher | — |

## 12.2 论文

| 论文 | 出处 |
|---|---|
| Zep: A Temporal Knowledge Graph Architecture for Agent Memory | arXiv 2501.13956 |
| From Local to Global: A Graph RAG Approach to Query-Focused Summarization | arXiv 2404.16130 |
| LightRAG: Simple and Fast Retrieval-Augmented Generation | arXiv 2410.05779 |
| HippoRAG: Neurobiologically Inspired Long-Term Memory for LLMs | arXiv 2405.14831 |
| LLM-empowered Knowledge Graph Construction: A Survey | arXiv 2510.20345 |
| ODKE+（production trustworthy extraction） | arXiv 2509.04696 |
| AutoSchemaKG / ATLAS | arXiv 2505.23628 |
| GraphJudge | arXiv 2411.17388（EMNLP 2025 main） |
| KGCL: A Change Language for Ontologies and Knowledge Graphs | arXiv 2409.13906 |
| OM4OV（本体版本化演进史） | arXiv 2409.20302 |
| IEPile: Unifying Information Extraction Data | arXiv 2402.14710（ACL 2024） |
| KAG 论文 | arXiv 2409.13731 |
| OpenSPG 白皮书 | https://openspg.github.io/v2/blog/design_philosophy/white_paper/openspg |
| LLM 直接实体匹配（MatchGPT/Peeters-Bizer） | arXiv 2310.11244 |
| EntGPT | arXiv 2402.06738 |
| LLM-Align | arXiv 2412.04690 |
| KG 域跨文档共指 | arXiv 2504.05767 |
| 子图序列化格式对比（triples 优于 NL） | arXiv 2402.11541（KBS 2025） |
| SubGraphRAG | arXiv 2410.20724（ICLR 2025） |
| xpSHACL | arXiv 2507.08432 |
| Text2Onto | NLDB 2005, LNCS 3513 |
| TNO GPT-4o 本体学习复现 | gitlab.com/knowledge-graphs/text2onto |

## 12.3 官方文档与规范

- W3C SHACL：https://www.w3.org/TR/shacl/ ／ SHACL-AF：https://www.w3.org/TR/shacl-af/
- GraphRAG 文档：https://microsoft.github.io/graphrag/（local/global/drift search + default dataflow）
- LlamaIndex LPG 指南：https://developers.llamaindex.ai/python/framework/module_guides/indexing/lpg_index_guide/
- FoodOn：https://foodon.org/（design/foodon-relations/foodon-structure/foodon-and-langual）＋ EBI OLS API：https://www.ebi.ac.uk/ols4/api/ontologies/foodon/
- OBO Foundry FP-004 版本化：https://obofoundry.org/principles/fp-004-versioning.html
- KGCL 规范：https://incatools.github.io/kgcl/
- OpenSPG 文档（语雀）：类型系统 fghnz04etmg0g6ug / 谓词 tdoyn0flcw42o50o / KGDSL slp1imkhhqw48dwr / Builder gf9ogysbvdu3hfcg / LLM $schema ufkl4apfip57ymd7
- DeepKE InstructKGC：kg2instruction README + OneKE.md（zjunlp 仓库内）
- Splink：https://moj-analytical-services.github.io/splink/（blocking/clustering 教程）
- Neo4j Text2Cypher 指南：https://neo4j.com/blog/genai/text2cypher-guide/ ／ GraphAcademy 重构教程
- WrenAI：https://docs.getwren.ai/oss/overview/how_wrenai_works
- owlready2：https://owlready2.readthedocs.io/（world/backend 章节）
- GLiNER 架构：https://urchade.github.io/GLiNER/architectures.html
- graphology 标准库：https://graphology.github.io/standard-library/
- Kuzu 文档（迁移后）：https://kuzudb.github.io/docs/（Node.js API / vector 扩展）
- G6 dagre 布局：https://g6.antv.antgroup.com/en/manual/layout/dagre-layout
- sigma.js 分层布局讨论：https://github.com/jacomyal/sigma.js/discussions/1477
- shacl-engine 基准：https://www.bergnet.org/2023/03/2023/shacl-engine/
- thedatapraxis KG Operations：https://thedatapraxis.com/blog/knowledge-graph-operations-versioning
- RDA Mapping Commons FoodOn 案例：https://mapping-commons.github.io/rda-fair-mappings/case-study/case-study-food/
- WhyHow 遗存：https://deepwiki.com/whyhow-ai/knowledge-graph-studio

## 12.4 本仓库内部证据（整合成本基准）

- [`packages/kb/kb-graph/src/types.ts`](packages/kb/kb-graph/src/types.ts) / [`ontology.ts`](packages/kb/kb-graph/src/ontology.ts) / [`kg-nl.ts`](packages/kb/kb-graph/src/kg-nl.ts) / [`index.ts`](packages/kb/kb-graph/src/index.ts)
- [`packages/kb/kb-graph-sqlite/`](packages/kb/kb-graph-sqlite/src/schema.ts)（SCHEMA_VERSION=4 九表 + resources/sql）
- [`packages/kb/kg-build/src/`](packages/kb/kg-build/src/index.ts)（extract/align/cross-source/incremental/quality/mappings）
- [`packages/kb/tool-kb/src/`](packages/kb/tool-kb/src/kg-query.ts)（kg-query/kg/ingest）
- [`packages/client/ui-kg/src/client/`](packages/client/ui-kg/src/client/index.ts)（KgView/KgGraphCanvas/presentation）
- [`examples/kb-agent/`](examples/kb-agent/cordis.patch.yml)（cordis.patch.yml/kg-mappings.yml/kb-corpus.yml/kg-build.mts）
- 实测图库查询（2026-09-17）：1159 节点 / 855 边（853 live）/ 163 共指边 / islands 343 / conflicts 5 / coverage 49.7%

---

*报告完。生成于 2026-09-17，由 real-deep-research 编排器基于 17 个子任务的全量返回综合而成；各章节数据与代码片段均可溯源至上述来源与 /tmp/drr-kg-sources/ 克隆。*
