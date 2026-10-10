# 分域计划 05｜本体自动生成 + 图谱完善（B5）

- Spec 溯源：主计划 §1.1 指令 5/6 + §3 选型表；[`r2b-kb-graph-ontology/sections/04-本体建模与LLM自动本体生成.md`](../../r2b-kb-graph-ontology/sections/04-本体建模与LLM自动本体生成.md:1) + [`sections/05-图谱可视化Obsidian范式与选型.md`](../../r2b-kb-graph-ontology/sections/05-图谱可视化Obsidian范式与选型.md:1) + [`sections/06-五源互通参考架构.md`](../../r2b-kb-graph-ontology/sections/06-五源互通参考架构.md:1)
- 架构决策：**治理面保留 kb-graph registry v5（纯 TS，已七成落地）+ 存储面新增 Neo4j 主存储 + 生成面 LLM schema induction 管线 + 可视化 Obsidian 范式换轨**。「图谱没完善」的真实短板（R3 §4.3）= 映射广度（5/49 表）+ 图质量（343 孤岛/coverage 49.7%）+ 检索产品化——本批全部正面清偿。

## 现状基线（R3 §4.3）

- registry v5：约束四元组 + naturalKey + FoodOn 锚点 + 五类来源 + draft/deprecated 状态门（[`kb-graph/README.md:7`](../../../packages/kb/kb-graph/README.md:7)）
- 纯算法层：kgcl（实例+模式级操作）/ shacl（registry→shapes 编译）/ kg-nl / ppr（L1.5）/ louvain
- 时间账本：episode/expireEdges/snapshotAt(t)/共指 reject 墓碑——**保留**（sqlite 账本继续承担时间旅行）
- 构建：kg-build（extract 闭集 instruct-kgc + shaclGate + crossSource v2 已开）；映射真源 [`kg-mappings.yml:10`](../../../examples/kb-agent/kg-mappings.yml:10) 仅 5 collections
- 可视化：ui-kg sigma.js + force-atlas2（动态加载无 WebGL 降级清单）
- 质量：1159 节点 / 855 边 / islands=343 / coverage=49.7%

## 存储层：packages/graph/graph-neo4j

```ts
// Consumes：kb-graph 的 registry v5 与 KGCL 词表；neo4j-driver（Apache-2.0，bolt）
// Produces：
//   ctx 存储能力面：本体 schema 物化（约束四元组→节点标签/关系类型/属性约束→Neo4j）
//   实例写入：KGCL 操作的 Neo4j 投影（与 kb-graph-sqlite 账本双写——sqlite 留 episode/时间旅行，Neo4j 承查询/向量/大图）
//   向量索引：Neo4j CE vector index（实体嵌入，kg_vector 工具底座）
//   label 隔离：与 WeKnora GraphRAG 组件共用实例时的命名空间约定
// Config：neo4jUrl / neo4jUser / neo4jPassword（credentials env 链）/ database / labelPrefix
```

- 部署：docker 起 Neo4j Community 5.26 LTS（arm64，compose profile `graph`）；GPLv3 内部使用零传染（R2b §03 结论）

## 生成层：packages/kb/ontology-induction（自动生成为主，手动备选）

管线（指令 5 的字面落地——「给你资料，自动生成本体，手动只是备选」）：

1. **语料输入**：KB 语料（WeKnora tenant）/ 湖仓表 schema（legacy 49 表 + carbon 表 DDL 反向工程）/ 既有 FoodOn 锚点
2. **LLM 归纳**：OntoGPT/OneKE prompt 范式（自写 TS，DeepSeek/MiniMax 通道）——出 JSON（类/属性/关系候选 + 证据引文），**杜绝 LLM 直写 Turtle/OWL**
3. **确定性序列化**：代码 JSON→JSON-LD（RDFS + 少量 OWL RL 词汇 + SKOS 分类）
4. **SHACL 闸门**：rdf-validate-shacl 校验 → 失败回喂 LLM 修复（有界循环，超出转人工队列）
5. **registry 入册**：draft 状态入 registry v5（沿用状态门）→ 人工 approve 是备选路径（KG 工作台既有）
6. **Neo4j 物化**：approve（或 auto-approve Config）后 schema 物化 + 存量实例重对齐

## 查询层：packages/graph/tool-graph

- 工具行：kg_schema（registry+Neo4j schema 摘要）/ kg_subgraph（邻域展开）/ kg_cypher（受控只读 Cypher，白名单+限额）/ kg_vector（语义近邻）
- 既有 tool-kb 的 kg.ts/kg-query.ts/kg-edit.ts 语义迁移，SessionEventMap 全落日志

## 映射广度与图质量

- kg-mappings v2：sources[].system 扩 `carbon`（[`kg-mappings.yml:5`](../../../examples/kb-agent/kg-mappings.yml:5) 现仅 nocobase 闭集——B7 前过渡期双 system 并存）；映射 5→49 表全量（业务库确定性 ETL：carbon PG→实体，APOC load.jdbc 范式 TS 等价实现，零 LLM 成本）
- KB→图通道：WeKnora GraphRAG 实体抽取入图（B4 已铺）
- 湖仓→图：legacy Parquet BYOG（GraphRAG 社区摘要范式参考）
- 孤岛收敛：跨源共指对齐（crossSource 已有 v2）+ FoodOn 锚定扩面 + 孤岛检测报告（目标 islands 343→<100，coverage 49.7%→≥80%，实测记录）
- PPR/louvain 产品化：kg-nl 短语→游走计划 + 社区摘要进检索面

## 可视化：ui-kg Obsidian 式改造

- 库换轨：sigma.js → **react-force-graph-2d**（d3-force-3d 与 Obsidian 同族；expandable-nodes 增量展开；>1万节点降级 sigma WebGL 备选路径保留）
- 范式落地（R2b §05 规格）：
  - **Local Graph**：点选节点→只渲染 k-hop 邻域，逐步展开（expandable nodes），面包屑回溯
  - **hover 预览**：节点悬浮卡片（类型/属性摘要/FoodOn xref/入边出边计数）
  - **backlink**：选中节点的反向引用面板（哪些实体/文档/业务行指向它）
  - 全局图 + 社区着色（louvain）+ 孤岛分组折叠

## 实施步骤

- [ ] docker 起 Neo4j + graph-neo4j 包（schema 物化 + 双写 + 向量索引）
- [ ] ontology-induction 包：六步管线 + SHACL 回喂 + draft 状态门接线
- [ ] tool-graph 工具行 + 旧 kg 工具语义迁移
- [ ] kg-mappings v2 + 49 表确定性 ETL + 孤岛收敛批处理
- [ ] ui-kg 换轨 + Local Graph/hover/backlink + 社区着色
- [ ] 五源互通接线（carbon→图 / WeKnora→图 / 湖仓 BYOG）
- [ ] 图质量审计报告（重建前后对比：节点/边/islands/coverage）
- [ ] Agent Note + doc-sync + lefthook

## 验收标准（R5 验证轮）

1. **自动生成本体全程无手写**：投喂一批食品资料（≥10 篇新语料）→ induction 管线自动出本体 → SHACL 过闸记录 → registry draft → Neo4j 物化可查（transcript 全链）
2. Local Graph 邻域展开 / hover 预览 / backlink 面板真浏览器实跑（截图）
3. 会话 kg_subgraph/kg_vector 查询真实返回（工具调用 transcript）
4. 图质量：islands <100、coverage ≥80%（实测对比报告）
5. 49 表全量映射对账（源表计数 vs 图节点计数）

## 风险

| 风险 | 缓解 |
|---|---|
| LLM 归纳质量不稳定（幻觉 schema） | SHACL 闸门 + 有界修复循环 + draft 状态门（人工兜底是备选通道，符合指令 5） |
| 双写一致性（sqlite 账本 vs Neo4j 投影） | KGCL 操作为单一入口顺序双写；对账批处理定期校验 |
| 49 表 ETL 映射设计量大 | 优先核心 8 域表；映射 DSL 复用 kg-mappings 既有规则形态 |
| 大图渲染性能 | force-graph 增量展开天然限幅；>1万节点 sigma 降级路径 |
