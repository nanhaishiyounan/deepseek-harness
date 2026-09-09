# Agent Note：kg 本体注册表化与 sqlite 属性图 v2（七表）

Status: implemented

[English](2026-09-06-kg-ontology-registry-sqlite-v2.md) | 中文

## 问题

V3 批（plans/nocobase-native-integration/03-batches.md）：企业知识图谱目标下，v1 图谱的"本体是编译期闭集"成为承载点缺口——10 个业务域与开放演进无法塞进 7×7 字面量联合（2026-09-05 expert-dataset-discovery 决策 D5"图谱本体不动"的深层原因正是类型系统没有扩展缝）。同时单表 `triples` 缺 confidence/双时态/独立 provenance/边属性/别名/水位，无法支撑 kg-build 管线（V4）的幂等合并、增量消费与实体对齐。

## 决策

- **注册表化推翻 D5，保留两条内核**（C 报告 §6.2 论证）：`KbGraphEntityType`/`KbGraphPredicate` 字面量联合 → `Branded` 开放集 id（`KgNodeTypeId`/`KgRelationId`，dsh-brand）；闭集校验从工具边界**移到注册表边界**（`KbGraphRuntime.putTriples` 前置校验，未知类型/谓词以 `KB_GRAPH_UNKNOWN_ENTITY_TYPE`/`KB_GRAPH_UNKNOWN_PREDICATE` 机读拒绝）；"抽取绝不内置 LLM"完整保留（缝仍纯存储/查询面，LLM 在 V4 的 kg-build 管线插件）。
- **三层本体种子**（`kb-graph/src/ontology.ts`，`builtinOntology()`）：5 顶层锚点（Object/Process/Event/Role/Concept，schema.org 风格）+ 19 业务域类（Customer/Supplier/Product/ProductCategory/Order/OrderItem/Shipment/Carrier/Warehouse/StockLevel/Expert/ExpertService/Service/Deliverable/Dataset/Connector/Region/Address/Ingredient）+ 食品 7 型（extends 到对应域/顶层类，`source: 'builtin-food'`）。谓词侧：食品 7 谓词的方向约束（原 JSDoc 逐条）迁入 `constraints: {domain, range}[]`——`uses`（product→ingredient/additive）与 `complies_with`/`flags`（双 domain）证明单值 domain/range 不足以表达 v1 语义，故采约束对数组而非 C 报告草案的单值字段；与域关系同名的 produces/supplies/contains 合并注册（constraints 跨层并集，source 保持 `builtin-food`）。broader/related 为无约束 hierarchical（SKOS 自反语义）。`KgOntologySource` 在深研三值上扩 `builtin-ontology`（三层本体引入后枚举不足）。
- **注册表 API**：`registerNodeType`/`registerRelation`（ctx.effect + disposer + `KB_GRAPH_DUPLICATE_NODE_TYPE`/`KB_GRAPH_DUPLICATE_RELATION`；extends/constraints/inverseOf 引用存在性 fail-loud）、`nodeType`/`relation`/`listNodeTypes(layer?)`/`listRelations`/`validateEdge`（SHACL 式：未知关系/未知端点/方向违例三码）。种子在构造器直填（不走 effect，不可卸载）。
- **七表 DDL**（`kb-graph-sqlite/resources/sql/schema.sql`，照 C 报告 §2.2，两处现场裁决偏差）：①`kg_node_types` ②`kg_relations`（**加 `constraints_json` 列**承载全量约束对——单 domain/range 列只存首对，且**两列可空**以容纳无约束 hierarchical）③`kg_nodes`+FTS5 trigram（external content，3 触发器同步）+ `UNIQUE(tenant, type, natural_key)` 幂等锚 ④`kg_edges` 七列 UNIQUE（v1 六元组语义完整保留 + provenance 对扩展：多源平行断言各自幂等）+ 双时态 + 三索引 ⑤`kg_aliases`（逻辑合并，删行即回滚）⑥`kg_source_runs`（水位+内容哈希+run_config 快照）⑦`kg_usage_counters`。APP_ID "DSHG" 沿用（同一存储身份的版本演进）。
- **SCHEMA_VERSION 1→2 纯拒绝**（无迁移，pre-release 立场）：实测 v1 库打开报 `schema version 1, incompatible with this build (2); delete the file and rebuild`。论据链：AGENTS "Backends reject old on-disk formats" 宪法 + 图谱是 provenance 可溯的派生数据（重建即恢复）+ v1 六元组缺 confidence/双时态，机械迁移等于回源重放等于重建。
- **建库时种子物化**（两层注册表的持久半边）：`insertBuiltinOntology` 把 31 类型 + 23 关系写入注册表表（`INSERT OR IGNORE`，该语句兼任建库种子与写路径 ensure——运行时注册的类型在首次写入时自动落库，注册表 FK 因此恒可满足）。
- **v2 存储面**（`KgStore extends GraphStore`，定义在 kb-graph types.ts）：`upsertNode`（natural-key 锚优先、id 锚兜底，返回 merged 判定）、`upsertEdges`（探测 + MERGE：confidence 取 MAX、fact/props COALESCE 新值、valid_until 复活 NULL；新插计数）、`subgraph`（递归 CTE，UNION 去重防环，json_each 传 seeds 保持全参数化，min(depth) 聚合，maxNodes+1 探测截断信号）、`expand`（hops=1 特化）、`tombstoneBySource`（跨源存活）、`putAlias`（同 node 幂等/异 node `KB_GRAPH_ALIAS_CONFLICT`）、`putSourceRun`/`getSourceRun`（水位 upsert）。
- **putTriples 兼容转译**：节点 minting `kb:${encodeURIComponent(type)}:${encodeURIComponent(id)}`；边 provenance `{sourceSystem:'kb', sourceId: sourcePath ?? graph:派生锚}`——sourcePath 存在时即锚（C 报告"sourcePath 升格 provenance"），缺失时用 `graph:` 前缀的六元组派生锚保住 v1 幂等语义；读路径以 `graph:` 前缀区分有无引用还原 `sourcePath`。**边界行为差异**（登记）：同一六元组"先无 sourcePath 后有"在 v2 产生两条并存断言（v1 是 no-op）——多源并存本就是 v2 特性，既有消费者（30 场景 SKILL、graph-smoke）按同形态重放不受影响。
- **读路径等价重写**：`neighbors`/`twoHopPaths`/`searchEntities`/`stats` 在 kg_edges/kg_nodes 上重写；twoHopPaths 先解析端点 minted id 再四分支（中点按节点 id 相等判定——`UNIQUE(tenant,type,natural_key)` 保证 (type,key)↔节点一一对应，与 v1 (type,id) 比较等价）；searchEntities 覆盖 natural_key 与 name 双列（v1 的 id 兼作名称）+ 别名命中；stats 只数有效边（valid_until IS NULL）。store 读回的 branded 值一律经 owning-package 工厂（kgNodeTypeId/kgRelationId）重建，写入边界的注册表校验保证成员资格。
- **tool-kb 快照物化**（触点 7/8）：`graphOntologySnapshot(registry)` 在工具注册时冻结 active 类型/谓词清单（kbGraph 未组合时回退 builtin 种子——工具仍可见、执行时结构化拒绝）；parse 函数签名加 snapshot 参数；工具 description/系统提示的枚举由快照生成（描述仍是冻结快照的纯函数；会话中期的注册表变更下会话生效）。graph-smoke.mts 改从注册表按 `source === 'builtin-food'` 取 7×7（冒烟语义不变）+ 工厂构造 branded。

## 备选方案

- **单值 domain/range**（C 报告 §1.4 草案形态）——否决：v1 的 uses（product→ingredient/additive）与 complies_with（product/process→standard）无法表达，会把合法抽取误拒。
- **putTriples 锚含 sourcePath 但读路径丢弃**——否决：`source_path` 是工具面的可观测契约（neighbors 返回值），丢弃破坏等价。
- **运行时注册表与持久表靠同步协议对齐**——否决：双写不一致是新故障面；ensure-on-write（OR IGNORE）让 FK 恒可满足且零协议。
- **KgStore 接口放 kb-graph-sqlite 自有导出**——否决：capability seam 三角色中 Service Definition 拥有契约；V4 的 kg-build 将作为消费者 import 同一接口。

## 后果

- 测试：kb-graph 14（注册表 API/种子/闭集校验）+ kb-graph-sqlite 既有 20 等价演进 + v2 新面 14（merge 幂等/复活/环/自环/深度边界/截断/拒绝 v1 库/别名冲突/水位）+ tool-kb 127（快照签名）全绿；examples/kb-agent 442 无回归。graph-smoke.mts 7×7 语义保持。
- 30 个食品场景 SKILL 流零改动（builtin-food 种子等价）；`KbGraphStoredTriple.rowId`（kg_edges.rowid）与租户隔离模型不变。
- V4 交接面就绪：kg-build 将注入 `kbGraph` + `lakehouse`/`connector`/`kb`/`llm`，用 `KgStore.upsertNode/upsertEdges/tombstoneBySource/putSourceRun` 走完"结构化映射 + LLM 抽取 + 对齐 + 增量"；注册表 upsert（nocobase-derived 推导）与 `kg_schema`/`kg_subgraph` 工具、`subgraph` 的 runtime 转发留 V4。
- 工具枚举现为全部 active 类型（~31）而非食品 7——description 变长但注册表语义正确；若抽取质量受稀释影响，V4 可按 layer/source 过滤快照（graph-smoke 已示范）。
