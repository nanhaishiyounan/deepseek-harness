# Agent Note：M2 后端核心——本体 + KG + AI 重建（P0+P1）

Status: implemented

[English](2026-09-17-m2-ontology-kg-ai-backend.md) | 中文

## Problem

食品 KB 产品的 M2 批次承诺四项能力——五源接入的本体驱动建模、按本体的 LLM 抽取、手动改图、可回滚的自然语言改图。M2 之前的地基全缺：registry v4 类型没有约束四件套与 FoodOn 锚；抽取是自由 prompt、没有校验闭环；存储没有时序账本（无法回答「这条边来自哪次修改」、无法回滚）；跨源共指只有确定性规则、没有灰区裁决；`kg_query` 只编译固定模板。批次的[计划](../../../../plans/2026-09-17-kg-mobile-ux/02-m2-ontology-kg-ai-rebuild.md)与[深度调研](../../../../research/2026-09-17-ontology-kg-ai-deep-research.md)选定方案 A（在既有 kg-build/kb-graph/kb-graph-sqlite 骨架上纯 TS 自研增强，零 Python 运行时）。

## Decision

**P0（本体升级 + 抽取闭环）。** registry v5：[`KgPropDef`](../../../../packages/kb/kb-graph/src/types.ts) 补约束四件套（`pattern`/`isArray` 加入既有 `required`/`enumValues`）；`KgNodeType` 增 `foodonUri`/`foodonId`/`synonyms`；`KgRelationConstraint` 增每方向对 `cardinality {min,max}`；来源枚举增 `foodon-imported`。FoodOn 导入器（[foodon-import.ts](../../../../packages/kb/kg-build/src/foodon-import.ts)）：裁剪快照（2025-12-30 锁版）覆盖张红喜场景四环链；OWL 多继承单继承化（主父沿产品面，次父降级 `cross-facet` xref）；子树根锚定 builtin 类；kg-build `run()` 首步幂等导入，新类触发 ontology revision 审计。Instruct-KGC 协议（[extract.ts](../../../../packages/kb/kg-build/src/extract.ts)）：schema-dict prompt + split_num 分批，但 A/B 门禁通过前默认保持 `legacy`。SHACL 校验器（[shacl.ts](../../../../packages/kb/kb-graph/src/shacl.ts)，内部 IR，零 RDF 依赖）+ 回灌闭环（[validate.ts](../../../../packages/kb/kg-build/src/validate.ts)）：解释性反馈带「仅重出被点名条目」硬约束（调研实证 0% vs 63% 修复率）；≤3 轮，幸存者隔离——绝不部分落库。SCHEMA_VERSION 4→5：新表 `kg_episode`/`kg_mention`（Graphiti 式时序账本）、`ontology_xref`（SSSOM 通道）、`kg_align_rejects`（共指墓碑）；`kg_edges.expired_at`（记录级退役 = 回滚标记）+ `idx_edge_live` 部分索引；live 语义全线 = `valid_until IS NULL AND expired_at IS NULL`。

**P1（时序 + 共指 v2 + 查询升级）。** store 面增 `putEpisode`/`linkMentions`/`listEpisodes`/`edgeMentions`/`edgeIdsOfEpisode`/`expireEdges`/`restoreEdges`/`liveEdgesBetween`/`liveAdjacency`/`putOntologyXrefs`/`putCorefRejects`；episode 与 build_run 双账本分工（事实级时序 vs 管线级审计）。`kg_edit` 工具（[kg-edit.ts](../../../../packages/kb/tool-kb/src/kg-edit.ts)）：propose（NL→闭集 KGCL ops→diff 预览）→ apply（SHACL 预检、矛盾边退役、episode 留痕含指令原文 + diff）→ rollback（反向 episode）→ episodes；apiproxy 增 `kg.episodes`/`kg.rollback`（kg 域首个写路径）。corefers_with v2（[cross-source.ts](../../../../packages/kb/kg-build/src/cross-source.ts)）：确定性底线收窄为精确匹配，包含对进 pairwise LLM 判决，≥0.9 落边、0.5–0.9 落边进审核队列、否定落墓碑；union-find 等价类计数；每次 pass 落 ingest episode。`kg_query` L1（LLM 只填模板参数）+ PPR（[ppr.ts](../../../../packages/kb/kb-graph/src/ppr.ts)）承担 2 跳探索。`runIncremental()` 包裹 run() 做五系统水位差分。SourceTrail 深链经 view-context pending 通道进入 2 跳游走与种子选中。

## Consequences

- v2 确定性底线必须只留精确匹配：保留包含匹配会让灰区被确定性边占满、LLM 判决空转。
- FakeLlm 夹具回答固定 JSON，instruct-kgc 分批调用时跨批谓词全被闭集裁决 drop（计数虚高）——印证「默认不切协议」规则；A/B 证据见 [research/2026-09-17-m2-extraction-ab-report.md](../../../../research/2026-09-17-m2-extraction-ab-report.md)。
- 无约束 PPR 在无向图收敛到度数稳态：评测断言要用早迭代局部性或度数序，不能假设「近邻 > 远邻」在收敛后仍成立。
- kg_edit 实体解析按计划声明类型优先、违例时按关系合法约束对重解析、新建实体按约束 domain 落型——绝不发明类型；语义正确但本体方向非法的指令拒绝并给出解释。
- 全图串行 pairwise 判决无缓存时是分钟-小时级——性能遗留（缓存/批量裁决/增量灰区）；验证脚本固定 v1 对齐腿保持分钟级，demo 组合保持 v2。
- 验证（2026-09-18 run12，全 PASS）：四包 381 单测绿；真实 API 链（[kg-m2-verify.mts](../../../../examples/kb-agent/scripts/kg-m2-verify.mts)，日志 [m2-verify-real-api-run.log](../../../../examples/kb-agent/demos/m2-verify-real-api-run.log)）覆盖 v5 全库重建（1137 节点/788 边、FoodOn 15 类、xref=7）、SHACL 枚举违例拦截 + 一轮真实 LLM 修复、A/B 同语料多轮、kg_edit 全链含回滚、PPR 召回 ≥ 1-hop 基线、单行增量（一个 scope updated、其余哈希跳过）。

## Alternatives considered

- 整包引入 Python/Java KG 框架（Graphiti 运行时、Kuzu、完整 OWL 推理、自由 Text2Cypher）——调研负面清单；因运行时重量、幻觉面与既有 TS 骨架的契合度而否决。
- 完整 SHACL 引擎替代 <200 行内部 IR——作为最小校验器覆盖不足时的方案 B 逃生口保留。
- 立即把默认抽取协议切到 instruct-kgc——A/B 门禁（drop 谓词稳定性）未过，默认保持 legacy、协议留在配置后面。
- 确定性共指底线保留包含匹配——因灰区饱和（见 Consequences）否决。
