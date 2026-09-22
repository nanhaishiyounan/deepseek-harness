# 第 9 章 选型结论：2-3 个候选方案排序推荐（硬性要求 5）

## 9.1 判定前提

- 仓库硬约束：全 TypeScript + ESM everywhere + 无 Python 运行时依赖 + SQLite 单库心智 + capability seam 插件架构。
- 用户默认倾向：纯 TS 架构借鉴。本轮 16 分支证据全部支持该倾向——7 个重点框架无一可整包引入（语言栈/图库绑定/schema 版本化缺失三重障碍，见第 3 章总表），而其可移植核心（prompt 模板/校验链/检索组装/时序模型）均为纯逻辑，clone 审计已逐文件抄录。
- 现有系统资产必须保留（第 2.8 节）：七列锚幂等写、双时态墓碑、闭集防幻觉链、模板优先查询、kb-corpus manifest。

## 9.2 方案排序

### 🥇 方案 A：纯 TS 自研增强管线（强烈推荐，唯一主路线）

**思路**：以现有 kg-build/kb-graph/kb-graph-sqlite 为骨架，按「一篇框架抄一个最佳设计」的原则逐层注入：

| 注入层 | 抄谁 | 抄什么 | 工程量 |
|---|---|---|---|
| 本体层（registry v5） | FoodOn + SPG + KGCL | FoodOn 5 棵子树裁剪导入（OLS API 导入器）+ foodon_uri/xref 字段；SPG 约束四件套扩展 KgPropDef（required/isArray/enum/regex）；KGCL 变更操作枚举 + ontology_change/graph_migration 事件表；owlready2 仅留作可选 sidecar（完整 OWL DL 推理） | M |
| 抽取层 | Instruct-KGC + Neo4j Builder + ODKE+ | JSON 协议 schema dict + split_num 分批 + 温度 0；prompt 三段式 + 防注入条款；Grounder 断言式验证（第二 LLM 判 Yes/No）+ Corroborator 频次合并 | M |
| 校验层 | SHACL + kg-correction-loop | 自研最小 shapes 校验器（<200 行，内部 IR）→ 量大切 shacl-engine；回灌格式带解释句（实证 0% vs 63% 修复率差距）；防附带损伤条款 | S~M |
| 对齐层 | Splink + MatchGPT + Graphiti | blocking（DeepSeek embedding top-20 召回 + 规则 OR 并集）→ pairwise LLM 判决 → union-find 等价类物化 + tombstone 防复活；置信分层人工审核队列 | M |
| 时序层（四能力之四） | Graphiti | kg_episode/kg_mention 表 + 边表四时间戳列；失效不删除（resolve_edge_contradictions 40 行直译）；AI 改图 = episode（source='ai-edit'，content=指令原文+diff JSON）；回滚 = 反向 episode | M |
| 查询层 | HippoRAG + GraphRAG local | L1 参数化模板（LLM 只填参）+ L1.5 PPR（15 行 power iteration）+ GraphRAG 式管道表 context 装配 + evidence 溯源列 | S~M |
| 算法层 | graphology | louvain 社区（按社区着色可视化+islands 诊断）+ pagerank（PPR 已自实现则备选）+ components（islands 统计即连通分量，替代现有自研） | S |
| 可视化层 | WebProtégé + 行业惯例 | @xyflow/react 本体 class 层级树（新增）+ sigma 实例图（现有，按 layer/社区语义着色升级 presentation.ts）+ 变更流/审核卡片（Change Summary/对齐审核） | M~L |

**总量估计**：约 8 个 PR 级增量，2-3 人月；每一步都落在第 2.7 节的既有缝合位上，不动现有七列锚/tombstone/闭集链。

**为何第一**：唯一同时满足（a)仓库 ESM/TS 约定、(b)现有资产保留、(c)四能力全覆盖、(d)许可证全清洁（MIT/Apache/CC-BY）的方案。所有借鉴源的许可均允许代码级移植（Apache-2.0/MIT 保留声明即可）。

### 🥈 方案 B：TS 库组合直引（备选实现路径）

在方案 A 的骨架上，直接引入 shacl-engine + n3 + @rdfjs 家族 + graphology 作运行时依赖，把「自研最小校验器/自研 RDF 适配层」换成现成库。

- 优点：校验层与 RDF 互操作层工程量各减约一半；获得完整 SHACL 生态（SPARQL 约束/AF 规则预留）与标准 RDF/JS 数据模型。
- 代价与风险：RDF/JS Dataset 抽象进入 harness 核心依赖树（11 依赖链）；candidatesToRDF 转换层仍要自写（~50 行/批）；kz 哲学上引入"另一套数据模型"与 registry v4 的 TS 类型体系并存，心智成本上升。
- **定位**：方案 A 校验层/RDF 层的实现备选——当 shapes 复杂度超出最小校验器 6 组件范围（需要属性对约束/逻辑组合/SPARQL）或 FoodOn 双向序列化需求爆发时切换。

### 🥉 方案 C：Graphiti Python sidecar（应急对照，不推荐为路线）

引入 getzep/graphiti 作独立 Python 进程（Apache-2.0），经 HTTP/RPC 承接时序事实管理，TS 主链只发 episode 与查询。

- 优点：最快获得生产级时序事实能力（episode/invalidation/双路检索开箱即用）；论文指标（LongMemEval +18.5%/延迟 -90%）可直接引用。
- 代价：违背无 Python 运行时约定；部署面 +1 进程 +1 图库（FalkorDB/Neo4j/Kuzu 均有坑：Kuzu extra 已弃用）；跨进程边界使七列锚幂等写/tombstone 协议失去意义（两套真相源）。
- **定位**：仅当方案 A 的 episode 模型实现受阻（如 invalidation 判定在中文语料效果不佳）时，作为功能对照基准运行，不进产品链路。

## 9.3 明确不做清单（负面选型）

| 不做 | 理由 |
|---|---|
| 整包引入任何 Python/Java 框架 | 语言栈硬冲突（第 3 章逐框架证据） |
| Kuzu 作主存储或查询投影 | **项目已归档**（README 公告）+ LlamaIndex 已移出其集成 + CJS + 双库文件——三方证据 |
| 自由 Text2Cypher/GQL（L3） | SQLite 非图库；高频场景已被模板+受限 DSL 覆盖；幻觉风险不抵收益（Neo4j 四象限第三象限） |
| FoodEx2 / LanguaL 单独引入 | FoodOn 是其超集且官方 SSSOM 映射在推进——跟 FoodOn 即可 |
| OWL 完整推理进主链 | 仅作 owlready2 可选 sidecar（一致性检查/自动分类场景） |
| quadstore / graphy / @zazuko/rdf-vocabularies | 周下载过低/停更（546/2023-10/2023） |
| global search（社区报告 map-reduce）近期上线 | 千节点图上无文献支持其优于 PPR+局部；等 L1.5 落地后自有 benchmark 判定 |

## 9.4 实施顺序建议（P0→P2）

- **P0（立即，1-2 周）**：registry v5 字段扩展（约束四件套+foodon_uri+xref 表）→ FoodOn 5 棵子树导入器（OLS API）→ Instruct-KGC JSON 协议替换 extract.ts 的 prompt 构建（保留闭集裁决链）→ SHACL 最小校验器接 upsert 前钩子 + 解释性回灌。
- **P1（1 个月）**：kg_episode/kg_mention + 四时间戳列 + AI 改图 episode 化 + 回滚 API → corefers_with 升级（blocking→pairwise→union-find→审核队列）→ kg_query L1 填参 + PPR。
- **P2（2-3 个月）**：可视化双层视图（reactflow 本体树+sigma 语义着色）+ 变更流/审核卡片 → kg_cluster/community 表（graphology louvain 物化）→ L2 受限 DSL → owlready2 sidecar（若需完整推理）。

每步验收锚点：islands 数下降（343→）、coverage 上升（49.7%→）、对齐审核队列消化率、PPR hits@5、SHACL 违例拦截率、AI 改图回滚成功率 100%。
