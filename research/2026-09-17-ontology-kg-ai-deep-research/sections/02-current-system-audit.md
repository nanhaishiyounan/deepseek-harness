# 第 2 章 现有系统审计——整合成本基准

> 本章由仓库只读审计子任务产出（2026-09-17 实测）。外部框架的全部评估都以此为对标基准。

## 2.1 本体数据模型（registry v4）

本体定义位于 [`packages/kb/kb-graph/src/types.ts`](packages/kb/kb-graph/src/types.ts:21)，核心模型：

- `KgNodeTypeId = Branded<'KgNodeTypeId'>` —— 品牌化 id，注册表治理闭集。
- [`KgNodeType`](packages/kb/kb-graph/src/types.ts:73)：`{ id, label, layer: 'top' | 'domain', extends(owl:subClassOf), props: readonly KgPropDef[], naturalKey, aliases(skos:altLabel), source: 'builtin-ontology'|'builtin-food'|'nocobase-derived'|'agent-defined', status: 'draft'|'active' }`。
- [`KgRelation`](packages/kb/kb-graph/src/types.ts:104)：`constraints: readonly { domain, range }[]`（多合法方向对）+ `kind: 'object' | 'hierarchical'` + `inverseOf`。
- `KgPropDef`：`datatype: string|number|boolean|date|json` + `required/enumValues`。

要点：**没有独立的 Enum 节点类型**——枚举是 `KgPropDef.enumValues` 字段而非图节点（用户描述的「四类节点」实际是 Class/Relation/Property + Enum-as-property）。内置种子 [`ontology.ts`](packages/kb/kb-graph/src/ontology.ts:79)：5 个 top anchor（Object/Process/Event/Role/Concept）+ 19 domain + 7 food = **31 类型、24 关系**（含 `corefers_with`），本体语义版本 `ONTOLOGY_VERSION='1.1.0'`（semver，新增类型/关系 bump minor）。

存储（[`kb-graph-sqlite/resources/sql/schema.sql`](packages/kb/kb-graph-sqlite/resources/sql/schema.sql:1)）：SQLite `SCHEMA_VERSION=4`（v4 在 v3 注册表上加 build-run ledger；v1–v3 拒绝不迁移——图是派生数据，删库重建）。9 张表：`kg_node_types`/`kg_relations`（含 version 行修订计数器）、`kg_nodes`（+FTS5 trigram）、`kg_edges`（**七列锚 UNIQUE(tenant,src,dst,relation,source_system,source_id)** + 双时态 valid_from/valid_until）、`kg_aliases`、`kg_source_runs`、`kg_build_runs`、`kg_ontology_revisions`、`kg_usage_counters`。注册表双层：运行时 `ctx.kbGraph.registerNodeType/registerRelation`（引用完整性在注册边界 fail-loud）+ 建库时种子物化落盘。

## 2.2 五源接入与 leg（跨源实体腿）

构建管线 [`kg-build/src/index.ts`](packages/kb/kg-build/src/index.ts:345) `run()`：

1. **NocoBase 腿**：`kg-mappings.yml` 白名单 5 collection，R01–R13 确定性映射、fkLinks 显式接线、派生类型 persistNodeType。
2. **lakehouse 腿**：每表一 Dataset 节点。
3. **connector 腿**：每数据集一 Dataset 节点。
4. **corpus 腿**：LLM 抽取，节点 id `kb:<scope>#<name>`。
5. **跨源对齐腿**：只产 corefers_with 边。

节点 id 前缀即源身份（`nocobase:`/`lakehouse:`/`connector:`/`kb:`）。实测分布：kb=758 / nocobase=221 / connector=177 / lakehouse=3。**勘误**：用户口径的「五源」中 assets/platform 并非独立腿——assets 是 connector 的市场投影，platform 即 NocoBase 腿；独立数据腿 4 条 + 1 条对齐腿。

## 2.3 corefers_with 现状

- 关系定义 [`ontology.ts:148`](packages/kb/kb-graph/src/ontology.ts:148)：端点无约束、只建边不合并、可逆。
- 边生成 [`cross-source.ts:59`](packages/kb/kg-build/src/cross-source.ts:59) `crossSourceEdges()`：**纯字符串规则**（normalizeName 归一化相等→confidence 1.0；行名包含文档名→0.75；Expert 类型排除；无 LLM、无 embedding）。
- tombstone 协议：每次重跑先对全部 `kb:` 节点 `tombstoneBySource('kg-align', doc.id)` 再重建（七列锚幂等复活），manifest 外幽灵保持墓碑。

**关键缺口**：跨源对齐是「边加法」模型——A-B、B-C 有边而 A-C 无边时等价性无人负责（无 union-find/连通分量派生）。第 6 章给出升级方案。

## 2.4 抽取链现状（LLM 已深度参与）

[`extract.ts`](packages/kb/kg-build/src/extract.ts:60) 闭集抽取五步链：

```
buildExtractionPrompt()（注册表全部类型+关系方向注入中文 system prompt + few-shot）
  → MiniMax-M3 调用
  → JSON parse → 形状校验
  → 闭集裁决：未知类型降级 Concept/UNCLASSIFIED 桶并记 claimedType；谓词闭集外/方向违规 drop 带原因
  → 一次反馈重试
```

对齐 [`align.ts`](packages/kb/kg-build/src/align.ts:41)：NFKC 归一化 + 公司后缀剥离、Jaro-Winkler ≥0.9 自动合并、0.8–0.9 灰区 LLM 裁决（`AdjudicatingLlm.adjudicateSame`）、合并 = 写 `kg_aliases` 逻辑别名（可逆）。

## 2.5 增量与质量

- [`incremental.ts:100`](packages/kb/kg-build/src/incremental.ts:100) `planScopeRun()`：全量快照 SHA-256 指纹比对 skip/ingest、数字 pk 水位（NocoBase 无 updatedAt 时的回退）、disappeared pk tombstone；corpus 腿 per-文档 contentHash skip + delete-then-re-extract。
- 质量度量 [`quality.ts`](packages/kb/kg-build/src/quality.ts)：**实测 islands=343 / conflicts=5 / coverage=49.7%**——孤岛数是本次重建的最硬论据（1159 节点中 343 个与主图不连通）。

## 2.6 工具链与 UI

- `kg_query`（[`tool-kb/src/kg-query.ts:128`](packages/kb/tool-kb/src/kg-query.ts:128)）：模板化中文短语 →「kg-template」即 [`kb-graph/src/kg-nl.ts:55`](packages/kb/kb-graph/src/kg-nl.ts:55) 的 **9 个正则模板编译器**（supplies-products/n-hop/pair 等 → `KgQueryPlan{seeds,hops,relationTypes}`），与 apiproxy `kg.query` RPC 同一编译器防漂移；miss 时报支持句式回退 `kg_schema + kg_subgraph`。
- `kb_ingest` 是 KB 向量库入库（[`tool-kb/src/ingest.ts:140`](packages/kb/tool-kb/src/ingest.ts:140)），不进 KG——KG 语料由 kg-build corpus 腿处理，两者由 `kb-corpus.yml` manifest 统一。
- UI [`packages/client/ui-kg/`](packages/client/ui-kg/src/client/index.ts:1)：**sigma.js v3 + graphology + forceatlas2**（静态导入单 bundle、降级列表回退、相机跨渲染存活）；KgView = 短语框+种子搜索+画布+详情+quality 面板。**只读设计——不存在本体编辑器**，图写权独属 build pipeline；apiproxy 7 个 RPC（schema/query/search/subgraph/expand/stats/mappings）全部只读。

## 2.7 扩展点清单（外部方案对接缝合位）

| 目标能力 | 缝合位置 | 需扩展的类型 |
|---|---|---|
| (a) LLM ontology-grounded 抽取增强 | [`extract.ts:17`](packages/kb/kg-build/src/extract.ts:17) `OntologyView`（扩展携带 props 定义/naturalKey/few-shot 动态样例）→ `buildExtractionPrompt()`；`ExtractConfig` 加 few-shot/温度/结构化输出模式；保留既有降级/dropped 可观测 | `ExtractConfig` |
| (b) SHACL 式约束校验 | `KgPropDef` 已定义但**运行时未接线**（upsertNode 只验类型闭集）；挂 `KgStore.upsertNode/upsertEdges` 前或 kg-build 写入侧；SCHEMA_VERSION bump 4→5 落 props_schema | `KgPropDef`（min/max/cardinality/regex）、`KgShapeViolation`（现仅 3 码） |
| (c) 图 diff/审计/回滚 | `kg_ontology_revisions`（{added,removed,changed}×{types,relations} diff JSON）+ `kg_build_runs` ledger + 双时态 tombstone 已是半成品；`recordOntologyRevision()` 现仅 runNocoBase 一处调用，需泛化到人工/AI 编辑面；细粒度回滚需 KgStore 新 API | 边表时间戳列 |
| (d) 语义分层可视化 | `layer:'top'|'domain'` 数据已在（KgNodeTypeView.layer 透传）；缝合 [`presentation.ts`](packages/client/ui-kg/src/client/presentation.ts) `nodeColorOf()` 改按 layer/extends 分组；本体编辑工作台需新增写 RPC + apiproxy 域 | — |

## 2.8 整合成本结论

该链路已实现「本体注册表 + 确定性映射 + 闭集 LLM 抽取 + 跨源对齐 + 增量 + 审计账本 + 模板查询 + 可视化」全环。其差异化资产（外部框架没有的）：**七列锚幂等写、双时态墓碑、闭集防幻觉链、模板优先查询、kb-corpus manifest 单清单**。短板（本次重建目标）：属性 shape 校验未接线、无本体编辑面、无细粒度回滚、跨源对齐无等价类、islands 高企、可视化无语义分层。**结论：重建 = 在既有骨架上增强，不是换引擎。**
