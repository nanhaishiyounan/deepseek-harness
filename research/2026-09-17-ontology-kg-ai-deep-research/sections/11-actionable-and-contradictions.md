# 第 11 章 可操作产出汇总、矛盾与限制

## 11.1 从克隆仓库提取的可复用实现（本地路径 + 核心逻辑）

审计后的浅克隆保留在 `/tmp/drr-kg-sources/`（均删 .git，可随时 re-clone 对照）：

| 仓库 | 可复用文件 | 核心逻辑 |
|---|---|---|
| llm-graph-builder | `backend/src/shared/schema_extraction.py`（88 行） | 3 个 schema 抽取 prompt 模板 + pydantic structured output，可整体 TS 移植 |
| llm-graph-builder | `backend/src/llm.py` | 11-provider 工厂、structured output 探测降级、sanitize_additional_instruction、get_combined_chunks 分档 |
| llm-graph-builder | `backend/src/shared/constants.py:827-905` | 防注入指令原文、GRAPH_CLEANUP_PROMPT（类目合并治理） |
| llm-graph-builder | `backend/src/make_relationships.py:12-143` | chunk 内容寻址（sha1）+ UNWIND 批量写入 + FIRST_CHUNK/NEXT_CHUNK 链 |
| llm-graph-builder | `/tmp/lcn-pkg/.../langchain_neo4j/graph_transformers/llm.py:213-440,883-912` | **抽取引擎真身**：create_unstructured_prompt 三段式、optional_enum_field、strict_mode 过滤 |
| graphrag | `packages/graphrag/graphrag/prompts/index/extract_graph.py` | GRAPH_EXTRACTION_PROMPT 全文（四段式+虚构世界 few-shot+gleaning） |
| graphrag | `.../prompts/index/community_report.py` | JSON 报告 schema + Grounding Rules（record-id 引用格式） |
| graphrag | `.../graphs/hierarchical_leiden.py` + `operations/summarize_communities/` | Leiden 接口签名 + 逐层 map-reduce 主循环（TS 移植蓝本） |
| graphrag | `.../index/update/incremental_index.py` | title-diff 增量合并三段式 |
| lightrag | `lightrag/prompt.py:14-330` | 全套 prompt 原文（抽取/continue/JSON 变体/关键词抽取/kg_query_context/rag_response 引用格式） |
| lightrag | `lightrag/operate.py:5280-5498, 6200-6313, 2429-2782, 4252-4334` | mode 分流+round-robin 合并、局部子图组装排序、增量 upsert 合并、gleaning 循环 |
| lightrag | `lightrag/base.py:89-1110` | QueryParam + 三存储抽象接口（TS interface 直译） |
| graphiti | `graphiti_core/utils/maintenance/edge_operations.py:325,538` | **resolve_edge_contradictions（40 行纯代码时间区间失效判定，直译 TS）** + resolve_extracted_edges 编排 |
| graphiti | `graphiti_core/prompts/dedupe_edges.py` + `dedupe_nodes.py` | invalidation prompt（duplicate/contradicted 二分+few-shot）/ 实体去重 prompt（同名异义/缩写/同义 4 例） |
| graphiti | `graphiti_core/prompts/extract_edges.py` | 事实抽取 prompt（NEVER generalize + DATETIME RULES + REFERENCE_TIME 相对时间解析） |
| graphiti | `graphiti_core/utils/maintenance/community_operations.py:93` | label propagation 40 行 |
| graphiti | `graphiti_core/search/search_utils.py:1775` | RRF 3 行融合 |
| graphiti | `graphiti_core/driver/kuzu/` | 关系型图库驱动全套先例（边=节点表——SQLite 承载图模型的证明） |

## 11.2 立即可用的检查清单（P0 执行版）

- [ ] registry v5：KgPropDef 加 required/isArray/enumValues/regex；class 表加 foodon_uri/foodon_id/langual_code；新表 ontology_xref
- [ ] FoodOn 导入器：OLS API children/ancestors 翻页拉 5 棵子树（food product 全量 / organism material 2-3 层 / transformation process 2 层 / contact material / regulated+agency 顶级）
- [ ] 抽取协议：buildExtractionPrompt 改 Instruct-KGC JSON 协议（schema dict + split_num 分批 + 温度 0）；解析器双轨容错
- [ ] 校验闭环：shapes 编译器（registry→IR）+ 6 组件校验器 + 解释性回灌格式（带"仅重出点名条目"硬约束）+ 隔离区表
- [ ] 评测基线：30-50 问 demo 集（hits@5/recall@10）+ LLM-as-judge 四指标成对对比框架
- [ ] islands 诊断：graphology components 直跑现有 1159 节点导出，定位 343 孤岛的源分布（预计 kb: 腿居多，决定 coref P1 优先级）

## 11.3 未解决的矛盾（显式呈现，不隐藏）

| 矛盾 | 状态 | 对选型的影响 |
|---|---|---|
| Kuzu 生态位：LlamaIndex 集成 PyPI 活跃（0.9.1@2025-09）vs 主仓库移除+项目归档 | 已裁决：以归档公告为准，**不选 Kuzu** | 排除一个候选存储 |
| 用户记忆的"Graphiti INVALIDATED_BY 双向边"vs 论文 v1/代码 0.30.2 四时间戳 | 已裁决：现行设计是四时间戳字段失效，早期双边设计已废弃 | 采用四时间戳模型 |
| 用户必查"KGLIB" | 已证伪：Spear-AI/IBM 双 404，无此知名库 | 从清单剔除 |
| 用户必查"WhyHow.AI" | 已证伪：公司关停（DNS+org 404），架构经 DeepWiki 镜像可考 | 只作设计参考不作依赖 |
| 用户必查"OpenSPG GRE 建图" | 已证伪：全文档/论文无此术语；实际对应 KAG ner→std→triple→event 链 | 术语勘误 |
| 1093/665/134（用户口径）vs 1159/855/163（实测） | 口径更新：图在持续重建，实测为准（2026-09-17） | 基准数字更新 |
| GraphRAG 文档"semantic ranking" vs 源码"关系度数" | 以源码为准 | 7.1 已标注 |
| kg-correction-loop：SHACL 检出最强(150/180) 但最终可用图仅 117/180 | 解释：附带损伤是回灌副作用，非检出问题 | 回灌格式必须带解释+防改动条款 |
| MatchGPT 零样本≈微调 vs EntGPT 朴素 prompt -36% F1 | 调和：效果强依赖 prompt 结构与输出约束 | 6.4 已采纳结构化档案输入 |
| LightRAG 论文"gleaning 多轮" vs 代码 DEFAULT_MAX_GLEANING=1 | 演进简化非矛盾 | 照抄默认 1 轮 |

## 11.4 本报告的限制（诚实声明）

1. **未深挖分支**：cognee（28K stars，scout 发现）未派独立分支——其图+向量+关系混合检索定位与 LightRAG 重叠，且同为 Python，不影响"整包引入 NO"结论；如后续需要 AI 记忆平台对照可补查。OntoGPT（SPIRES）同样只在侦察层确认存在，未深挖（其 grounding 校验报告思想已被 ODKE+ Grounder 覆盖）。
2. **Text2Onto 算法缩写映射**（HC/PO/CLE/CV/FRT）未在线验证（PDF 不可提取）——三层构成（术语/层次/关系）确证，缩写对应是推断。
3. **AutoSchemaKG 92% 对齐**的判定方法细节（谁当裁判/逐概念还是逐边）未见正文——引用时须带"零人工+开放域"条件。
4. **性能数字出处**：shacl-engine 40ms 是作者自建基准（zazuko 正在独立复测）；GraphRAG/GraphRAG 论文指标均为作者自报。已标注证据等级。
5. **中文实体对齐实证**主要来自情报学报单篇 + 工程通则，未做跨论文系统综述——中文 EL 研究整体稀缺是领域现状。
6. 本报告所有 npm 周下载数据为 2026-09-17 快照，随时间漂移。
