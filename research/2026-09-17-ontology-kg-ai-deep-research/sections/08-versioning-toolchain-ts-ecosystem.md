# 第 8 章 本体版本化、工具链与 TS 原生生态

## 8.1 OWL2 版本原语与变更语言

**OWL2 五原语**（owl:Ontology 头部 annotation，纯声明性）：versionIRI（具体版本工件持久 IRI）/ versionInfo / priorVersion / backwardCompatibleWith / incompatibleWith + deprecated 标记。OBO Foundry FP-004（FoodOn 遵循）工程规则：正式 release 必有唯一 versionIRI 且永久可解析；版本号 YYYY-MM-DD 或 semver；已发布文件内容不可变。核心结论：**原语只表达"版本关系"，不表达"变更内容"——变更内容需要 diff/变更语言**。

**KGCL（Knowledge Graph Change Language，arXiv 2409.13906，MODO 思想的标准后继）**：Change → SimpleChange（EdgeChange / NodeChange）与 ComplexChange。EdgeChange 细分 EdgeCreation（PlaceUnder=加 subClassOf 边）/ EdgeDeletion / EdgeRewiring / NodeMove（NodeDeepening/Shallowing）/ PredicateChange；NodeChange 细分 NodeCreation / NodeDeletion / **NodeObsoletion（OBO 生态信条：废弃不删除，replaced_by 指针，数据永不悬空）** / NodeRename / NodeSynonymChange。支持 apply patch（前瞻变更请求）与 diff（回溯描述）双向语义 + controlled natural language（"add synonym 'arm' to 'forelimb'"）供 LLM/非专家使用。KGCL 团队已落地 GitHub ontology repo 监控 agent + BioPortal 内嵌变更请求 UI——LLM 提案→人工裁决→apply 正是"LLM 辅助演化"的实现形态。

**registry v5 变更操作枚举**（映射四类目标物，判别联合闭合）：

```ts
type ChangeOp =
  | { op: 'add_node' | 'deprecate_node' | 'restore_node' | 'rename_node' | 'merge_nodes' | 'update_desc';
      target: 'class'|'relation'|'property'|'enum'; after: NodeSnap; replacedBy?: string }
  | { op: 'set_parent'; target: 'class'; oldParent?: string; newParent: string }
  | { op: 'change_domain' | 'change_range'; target: 'relation'; before: string; after: string }
  | { op: 'change_cardinality'; target: 'relation'|'property'; before: Cardinality; after: Cardinality }
  | { op: 'add_enum_value' | 'deprecate_enum_value' | 'rename_enum_value'; target: 'enum_value'; enumId: string };
```

**破坏性判定规则表**（judgeBreaking 纯函数可直接抄）：add_node/add_enum_value/set_parent(新增父)/deprecate_node(带 replacedBy)/restore/update_desc/rename_node(保留 aliases 存旧名) = 非破坏；**change_cardinality 收紧（minCount↑/maxCount↓/required false→true）= 破坏**（minCount 0→1 是最危险"假安全"变更）；change_domain 收窄/change_range 换类型 = 破坏；remove/deprecate_enum_value(无 replacedBy) = 破坏；merge_nodes = 破坏；set_parent 使子树脱离原父（若有查询消费者）= 破坏。非破坏=minor、破坏=major（对应 SCHEMA_VERSION 语义分档）。

**SQLite 变更日志——统一事件流 + 分离迁移表**：

```sql
CREATE TABLE ontology_change (
  id INTEGER PRIMARY KEY, tx_id TEXT NOT NULL, seq INTEGER NOT NULL,   -- KGCL Transaction：原子变更组
  op TEXT NOT NULL, target_type TEXT NOT NULL, target_id TEXT NOT NULL,
  before_json TEXT, after_json TEXT, breaking INTEGER NOT NULL DEFAULT 0,
  ontology_version INTEGER NOT NULL REFERENCES ontology_version(id),
  source TEXT NOT NULL,            -- 'user' | 'llm_proposal' | 'migration'
  reason TEXT, created_at TEXT NOT NULL);
CREATE TABLE graph_migration (     -- 本体升级 → 图数据的派生迁移
  id INTEGER PRIMARY KEY, from_version INTEGER NOT NULL, to_version INTEGER NOT NULL,
  strategy TEXT NOT NULL,          -- 'none' | 'in_place' | 'rebuild_subgraph'
  affected_node_count INTEGER NOT NULL, status TEXT NOT NULL,  -- 'pending'|'applied'|'rolled_back'
  applied_at TEXT, checksum TEXT);
```

**迁移策略选择（1159 节点小规模）**：**变更日志驱动的 eager 定向迁移**——非破坏性变更零迁移；破坏性变更仅按 target_id 精确迁移受影响子图（改类型/搬运边/标记枚举值）；废弃节点 deprecate+replacedBy 图数据重定向而非删除；孤儿标 orphaned_since_version 不物理删除。不用 lazy 视图化（复杂度永久压进查询层）、不用 dual-write（六段 playbook 为多团队生态设计，单租户小图过度）。1159 节点全图重放兜底也秒级，eager 无规模风险。

## 8.2 本体工具链选型决策表

| 能力面 | 决策 | 依据 |
|---|---|---|
| RDF import/export（FoodOn 互操作） | **TS 自研适配层：@rdfjs/types + n3**（Turtle/TriG/N-Quads P0；JSON-LD/RDF-XML 按需加 parser）。P0 工程量 3-5 人日；全格式+SPARQL 只读（@comunica/query-sparql-rdfjs）约 2 周 | n3 15.7 万周下载/2 deps/活跃；不引 rdf-ext（19 deps 增量小）；不引 quadstore（LevelDB 后端违背单 SQLite 原则，周下载仅 546） |
| 存储 | 维持自研 SQLite 邻接表；OWL-RL 物化结果写回自有表（inferred 标记列区分 assert/infer） | TS 生态无 SQLite RDF store（负结论） |
| OWL RL 子集推理 | 自研前向链规则循环至不动点：subClassOf/subPropertyOf 传递、domain/range 传播、equivalentClass/Property、inverseOf、实例上推；sameAs 二期。蓝本=Python owlrl | 万级三元组 TS 毫秒-秒级 |
| 本体编辑 UI | 借 WebProtégé 三件套语义（Change Summary 全局原子变更流 + Watches 订阅推送 + Revisions 快照导出；threaded notes 挂实体 IRI）——用 SQLite 变更日志表（event sourcing）实现同构语义，不借鉴其 MongoDB/GWT 技术栈 | ICD-11 万人级实证；OWL API 变更对象模型（AddAxiom/RemoveAxiom 原子单位） |
| SHACL 质控 | shacl-engine（见第 5 章） | MIT/活跃 |
| **必须 sidecar 的最低清单** | **仅 1 项：完整 OWL DL 推理（一致性检查+自动分类+实例重分类）→ owlready2 Python sidecar**（LGPL v3 进程隔离无传染；内置 HermiT；SQLite quadstore；多 World 隔离做推理沙箱） | Java 链路（OWL API/Protégé）整体出局 |

## 8.3 TS 原生图/RDF 生态盘点（2026-09-17 npm 实测）

| 库 | 定位 | 健康 | 许可/ESM |
|---|---|---|---|
| **graphology**（+metrics/communities-louvain/components/shortest-path） | TS 图算法事实标准：连通分量/**Louvain 社区**（Leiden 近亲）/pagerank/betweenness/HITS/最短路/拓扑；**sigma.js 官方数据后端** | 主包周下载 114.5 万 | MIT，ESM+CJS 双发，1 依赖 |
| **Kuzu** | 嵌入式 Cypher 图库（C++ 内核+Node binding；v0.11.3 起预装 vector 扩展 HNSW/fts/algo/json） | ⚠️ **项目已归档**（README 归档公告，团队转型，npm 周下载 3,724，type:commonjs） | MIT 但维护断档 |
| node-oxigraph (npm: oxigraph) | Rust→WASM RDF store：SPARQL 1.1 Query+Update 完整；**仅内存**（无磁盘持久化）；Turtle/JSON-LD 等全格式 | v0.5.11，随主仓库活跃，周下载 22,772 | MIT/Apache 双 |
| quadstore | 纯 TS RDF store，AbstractLevel 后端（classic-level/memory/browser） | 周下载仅 546 | MIT，ESM-only |
| comunica | 模块化 SPARQL 引擎家族（主引擎/@comunica/query-sparql-rdfjs 挂内存 store/RDF/JS Lite——shacl-engine 内部即用） | 活跃（Comunica Association） | MIT |
| @rdfjs/types + @rdfjs/data-model + @rdfjs/dataset | RDF/JS 规范类型与数据模型 | 16.9 万/6.6 万/4.1 万周下载 | MIT |
| n3 | Turtle/TriG/N-Quads 解析序列化 + 内存 Store | **15.7 万周下载**，2026-09 活跃 | MIT |
| graphy | — | 2023-10 停更 | 淘汰 |
| @zazuko/rdf-vocabularies | — | 2023 后未发版 | 淘汰（rdf-validate-shacl 仍维护） |

**可视化升级对比**：sigma.js 无内置层级布局（discussion #1477 官方确认；出路 dagre 桥接/@ouestware 实验性树布局）；G6 v5 布局最全（antv-dagre/dendrogram/radial/concentric 20+）但整套渲染引擎；cytoscape（1228 万周下载）dagre/klay 扩展成熟；**@xyflow/react（856 万周下载）自定义 DAG 最自由（节点=React 组件，自管 dagre/d3-hierarchy）**。行业惯例（Protégé OWLViz/LodLive）：**双层视图 = schema 层级树 + 实例 force 图**——reactflow 做本体树 + sigma（现有）做实例图组合最贴近。

## 8.4 全 TS KG 链路最短技术栈（最终清单）

| 层 | 推荐 | 工程量 | 备选判据 |
|---|---|---|---|
| 存储 | SQLite 邻接表（nodes/edges + 递归 CTE） | S（沿用现有） | Kuzu 双轨：仅当需 Cypher 多跳+进程内 HNSW 向量一体时（M；已归档风险自担，双库文件） |
| 算法 | graphology：communities-louvain + pagerank + components + shortest-path（SQLite 装载内存 Graph 后计算） | S | 无需备选 |
| 校验 | 自研最小 shapes 校验器（第 5.5 节）→ 量大切 shacl-engine | S~M | — |
| 序列化 | @rdfjs/types + n3（Turtle/N-Quads 双向 P0） | S（3-5 人日） | oxigraph.parse/serialize 零依赖单点替代 |
| 查询 | 自研模板（SQL+graphology traversal）；开放 SPARQL 后置 @comunica/query-sparql-rdfjs | S / M | — |
| 可视化 | @xyflow/react 本体 class 层级树 + sigma.js 实例 force 图（按 louvain 社区着色）双层视图 | M~L | 纯 sigma+dagre 桥（M，大图性能好层级感弱）；G6 整体替换（L） |

**一句话**：全链 MIT 系、除 Kuzu（不推荐）外全部 ESM 可用、零 Python 运行时——与 deepseek-harness ESM monorepo 约定完全兼容。graphology 的 louvain/pagerank 即 HippoRAG-PPR 与 GraphRAG-社区检测的 TS 等价物，是本轮生态盘点的最大即战力发现。
