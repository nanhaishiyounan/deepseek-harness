# Agent Note: kg-build 双路管线与 agent 图谱工具面（V4）

Status: implemented

[English](2026-09-06-kg-build-dual-path-pipeline.md) | 中文

**状态**：implemented · **日期**：2026-09-06 · **范围**：packages/kb/kg-build（新）、kb-graph/kb-graph-sqlite/tool-kb（seam 扩展）、examples/kb-agent 组合与轨道

## Problem（问题）

V4 批（plans/nocobase-native-integration/03-batches.md）：把 V3 的属性图存储接上三个数据源（NocoBase collections、湖仓 catalog、连接器 discover，加 KB 语料）并喂给 agent——确定性映射为主、MiniMax 闭集抽取为辅，增量更新保持幂等。

## 决策

1. **结构化路径零 LLM，LLM 只进管线插件。** R01–R13 确定性映射（`kg-build/src/mappers.ts`，规则编号逐条对应调研 §1.3 checklist）把 NocoBase collections/湖仓 catalog/连接器 discover 直映射进属性图；成本立场：NocoBase 直映射零 token，MiniMax 只负责语料补充语义（调研 §3.3「结构化为主 LLM 为辅」）。kb-graph 缝保持纯存储/查询面。
2. **种轨道的跨表引用走显式 FkLink 配置，不做列名推断。** 种子 schema 把引用存为标量列（`expert_services.expertId` 裸整型、`orders.serviceId` 形如 `expert_services/1` 的地址串），未声明 belongsTo——R06 拿不到关系字段。裁决：配置显式声明 `fkLinks`（plain-id / collection-address 两种取值形态），fail-loud、零猜测；这是 R06 对"地址式外键"的扩展而非替代（declared belongsTo 路径同时实现并测试）。
3. **updatedAt 水位在种轨道不可用（实测），对账通道承载更新/删除。** 实探：种子 collections 建表时 `timestamps` 关闭——即便事后注册 date 字段元数据（fields:create 实测可行），Sequelize 也不回填值（create/update 后仍 NULL），且 `sort=-updatedAt`/`filter.updatedAt` 被 resourcer 拒绝（"Invalid SQL column or table reference"）。落地语义＝PLAN C-4 的回退通道：**每次全量分页拉取 + 快照 SHA-256 指纹比对**（未变→零写入跳过；变→幂等全量 MERGE，更新自然流动）+ **id 水位**记录新行高水位 + 消失主键 tombstone（`run_config.knownIds` 记账，规模以本批轨道为界）。`tombstoneBySource` 只灭边不删点（双时态）。
4. **闭集两级校验＋降级桶：幻觉永不入图。** JSON 解析→结构 shape→注册表闭集/方向三级；解析/结构失败带反馈重试一次；闭集违规不重试——未知实体类型降级 `Concept` 桶（summary 记 claimedType），未知/方向违例谓词丢弃并计数（`droppedRelations`）。真实实跑证据：20 篇语料 344 实体、11 降级、32 丢弃谓词、7 对齐合并——防御路径在真实 MiniMax 输出上成立。
5. **实体对齐只在同 type 内做，NocoBase 行是权威主数据。** 归一化（NFKC/公司后缀/括注）→ searchNodes 精确命中→Jaro-Winkler ≥0.9 自动合并（绑 kg_aliases 逻辑合并，可逆）→0.8–0.9 灰区 LLM 终审（无 LLM 则留新）。跨型合并（Expert↔experts 层次兼容）登记为已知限制。
6. **注册表双层化收口在 V4。** runtime `persistNodeType/persistRelation`（祖先链先序落库，FK 约束驱动）+ `kg_node_types/kg_relations` 持久行 + kb-graph-sqlite 启动时 fixpoint 重注册（父先子后；孤儿行 fail-loud `KB_GRAPH_SQLITE_REGISTRY_CORRUPT`）。派生类型 `status:'draft'`（draft 参与抽取闭集但不进 kb_graph 工具的模型可见枚举；kg_schema 全量列出并标注 status）。
7. **kg_* 消费面：k-hop + 聚合 YAML，禁 Text2Cypher。** `kg_subgraph` seeds 经 `searchNodes`（新 seam 原语：名称/别名→铸币 id，对齐与工具共用）解析，`hops≤2/max_nodes≤200`；输出按实体聚合的 YAML + provenance sources + truncated 信号（调研 §4.3 实证最优格式）。
8. **语料源读 workspace/data 文件而非 kb 缝。** kb 缝无文档/chunk 读取面（ingest/search/deleteDocument 之外无列出 API）；V4 以 `corpus.root`（递归 md/txt）+ 内容哈希水位直读文件，`tombstoneBySource('kb', path)` 先灭后重提（delete-then-re-extract）。接入 kb 缝读取面留待后续批。

## 改动面与证据

- seam：`KgStore` 增 `upsertNodeType/upsertRelation/listStoredNodeTypes/listStoredRelations/searchNodes`；`KbGraphRuntime` 增 v2 转发（upsertNode/Edges、subgraph/expand、tombstone、alias、水位、persistNodeType/persistRelation/storedRegistry、searchNodes）。runtime 层对 v2 写做谓词闭集校验（端点闭集由存储层注册表外键权威执行）。
- 工具：tool-kb `kg_schema`/`kg_subgraph`（默认注册，kb_graph 工具族先例）；persona 补第四句分工（关系问题→kg_subgraph）。
- 实跑（2026-09-06，真实 NC :13000 + MINIMAX key）：`examples/kb-agent/scripts/kg-build.mts` 全绿——5 collections（10/3/3/3/49 行）、湖仓 1 表、连接器 16 数据集、语料 20 篇；图 384 节点/254 边；张红喜连通 experts→services→orders（2 跳含 49 单）；水位 experts=10；二次执行全 skip 且计数不变；建单→新节点连通→删单→tombstone。
- 测试：kb-graph 66/66、kb-graph-sqlite 含 registry.spec、kg-build 34/34（mock NC+fake LLM 全管线）、tool-kb 170/170（kg.spec 新增）；examples keyless 快照 `kg-tools.spec`（Loader 真组合）+ with-key/with-NC e2e `kg-pipeline.e2e`（真实闭集抽取 + 工具面回答 + 增量 + tombstone，自跳过）。

## Consequences（后果）

- 图的新鲜度跟随手动或定时的管线运行；两次运行之间的会话看到的是最后一次构建的快照（kg 工具从不触发摄取）。
- 注册表行在构造器种子之外多了第二个写者（管线）；重复运行会就地刷新派生行，手改的派生 label 会在下一次运行被覆盖。
- 语料 kb 节点以语料相对路径铸 id，跨机器与快照运行保持稳定。

## Alternatives considered（备选方案）

- 列名约定式外键推断（`expertId` → `experts`）——否决：对业务语义的静默猜测；显式 `fkLinks` 配置让每条跨表边可审计，拼错即 fail-loud。
- 给种子 collections 补注册 `updatedAt` 字段以恢复水位轮询——实测否决：resourcer 接受字段注册但 Sequelize 从不回填值（`create`/`update` 后仍 NULL），轮询会静默空转；指纹对账如实反映轨道现状。
- 语料绝对路径作为 per-chunk provenance——在 keyless 快照中否决：id 把机器 tmp 目录泄漏进期望输出；语料相对路径让图谱可移植。
- 方向违例关系与未知类型实体同桶降级——否决：未知类型可由后续对齐挽回，方向违例是调用方必须看见的语义错误；计数并丢弃才是可观察契约。

## 已知限制与后续

- 事件回调通道（NocoBase workflow → /kg-ingest）与 apiproxy `kg` 域按批范围裁掉：前者留给低延迟批（当前对账通道分钟级足够轨道语义），后者待 V6 ui-kg 消费时再上（用户核心清单未列）。
- 对账记账 `run_config.knownIds` 随行数线性增长，万级行以上需改为分块对账或按 hash 分桶（本批轨道 <1k 行）。
- 连接器 discover 的合并输出不携带 providerId，`connector:<id>` 节点存在跨 provider 撞名风险；sourced_via 来源边等 seam 暴露 per-provider 归属后补。
- 跨 type（层次兼容）实体对齐、embedding 余弦第二指标（研究 §3.4 双指标）未做——Jaro-Winkler 单指标 + LLM 灰区终审已满足轨道精度，阈值 0.9 保守（无向量合取时上调自研究的 0.85）。
