# 批次 2（M2）：本体 + 知识图谱 + AI 重建（方案 A 纯 TS 自研增强）

> 依据：[总纲](PLAN.md)、[本体+KG+AI L4 深度调研](../../research/2026-09-17-ontology-kg-ai-deep-research.md)（第 2 章仓库审计 / 第 4 章 FoodOn 映射 / 第 5 章 SHACL 闭环 / 第 6 章抽取与共指 / 第 7 章查询升级 / 第 9 章选型 / 第 10 章目标架构）。
> 主路线：**方案 A**——以现有 [kg-build](../../packages/kb/kg-build/src)/[kb-graph](../../packages/kb/kb-graph/src)/[kb-graph-sqlite](../../packages/kb/kb-graph-sqlite) 为骨架，保留既有资产（七列锚幂等写、双时态 tombstone、闭集防幻觉抽取链、模板优先查询、[kb-corpus.yml](../../examples/kb-agent/kb-corpus.yml) manifest），按 8 层注入表逐层增强。零 Python 运行时。

## 1. 四能力目标（用户逐字要求 → 技术答案）

| 能力 | 用户表述 | 技术答案（调研实证） |
|---|---|---|
| ① 数据先行 | 五源接入的本体驱动建模 | registry v5（约束四件套 required/isArray/enumValues/regex + foodon_uri/foodon_id/ontology_xref）+ FoodOn 5 棵子树裁剪导入 + KGCL 变更事件流 |
| ② AI 分析 | LLM 按本体抽取候选 | Instruct-KGC JSON 协议（schema dict + split_num，协议层 100% 可移植到 DeepSeek API）→ 闭集裁决（保留）→ SHACL shapes 校验闭环（解释性回灌，实证 63% vs 0% 修复率）→ Grounder 断言验证（第二 LLM Yes/No，削 35% 幻觉） |
| ③ 手动修改 | 可视化编辑器改图+改本体 | @xyflow/react 本体树 + sigma 实例图（语义着色升级）+ 本体/图写 RPC（apiproxy kg 域扩写路径）+ WebProtégé 三件套（Change Summary/Watches/Revisions）SQLite 语义复刻 |
| ④ AI 语义化修改 | 自然语言指令改图（"把张红喜的供应商关系改成 X"） | Graphiti episode 模型：kg_episode/kg_mention 表 + 边表四时间戳（valid_at/invalid_at/created_at/expired_at）+ 失效不删除 + NL→ChangeOp→diff 预览→确认→apply=episode + 反向 episode 回滚 |

## 2. 分段实施（P0 → P1 → P2，每段独立可验收）

### P0（1-2 周）：本体升级 + 抽取闭环

| # | 任务 | 落点 | 要点 |
|---|---|---|---|
| P0-1 | registry v5 类型扩展 | [packages/kb/kb-graph/src/types.ts](../../packages/kb/kb-graph/src/types.ts)、[ontology.ts](../../packages/kb/kb-graph/src/ontology.ts) | KgNodeType/KgRelation 增约束四件套 + foodon_uri 字段；[builtinOntology ONTOLOGY_VERSION](../../packages/kb/tool-kb/src/kg.ts) 单调升 v5；registry 来源枚举已含 builtin-ontology/builtin-food/nocobase-derived/agent-defined（[kg.schema.ts](../../packages/host/apiproxy/src/api/kg.schema.ts)），新增 foodon-imported |
| P0-2 | FoodOn 导入器 | packages/kb/kg-build/src/foodon-import.ts（新） | OLS API 拉 5 棵子树（food product 主树/organism material 骨架/工艺/包材/法规分类）→ OWL 多继承单继承化（主父沿产品面 + 横切边表）→ 7 个 object property→Relation 映射 → 落 ontology_xref 表（锁版本 2025-12-30 快照）；产出 scripts/foodon-import.mts 手动运行 |
| P0-3 | Instruct-KGC 抽取协议 | [packages/kb/kg-build/src/extract.ts](../../packages/kb/kg-build/src/extract.ts) | prompt 换 JSON 协议（schema dict：关系 label→定义+domain/range Class 描述+代表实体；split_num 分批；温度 0）；**保留**现有闭集裁决链（UNCLASSIFIED 降级桶+违规谓词 drop 带原因）；先 A/B 门禁（中文语料 hits@5 + 人工抽检，不过则保留旧 prompt 仅叠加 SHACL） |
| P0-4 | SHACL 最小校验器 + 回灌 | packages/kb/kb-graph/src/shacl.ts（新，<200 行内部 IR）+ kg-build/src/validate.ts（新） | registry→shapes 编译（约束四件套→IR）；接 extract 后置钩子：violation→解释性回灌（"仅重出被点名条目"硬约束防附带损伤）→≤3 轮→隔离区（绝不部分落库）；量大切 shacl-engine（方案 B 备选） |
| P0-5 | schema 升版 | packages/kb/kb-graph-sqlite/src | SCHEMA_VERSION 单调升（仓库约定：backends reject old on-disk formats）；新表 ontology_xref；既有表加列迁移 |

**P0 验收**：①张红喜场景全链路（供应商→大豆→豆腐→包材→合规）在本体上有 FoodOn 落点（导入后 kg.schema 展示 foodon_uri）；②构造违例抽取样本被 SHACL 拦截且回灌 ≤3 轮内修复（单测）；③A/B 报告落 research/；④kg-build 全量重建成功，规模基线 1159/855/163 不回退；⑤快照+单测+Agent Note 同 PR。

### P1（约 1 月）：时序 + 共指 v2 + 查询升级

| # | 任务 | 落点 | 要点 |
|---|---|---|---|
| P1-1 | episode 时序模型 | packages/kb/kb-graph-sqlite/src（kg_episode/kg_mention 表 + kg_edges 四时间戳列 + 部分索引 idx_edge_live） | DDL 见调研第 10.2 章；与 kg_build_runs 双账本语义分工（episode=事实级时序，build_run=管线级审计） |
| P1-2 | AI 语义化改图 | packages/kb/tool-kb/src/kg-edit.ts（新工具 kg_edit）+ apiproxy kg 域写路径 | NL 指令→LLM 生成 ChangeOp 集合（KGCL 枚举+SHACL 预检）→ diff 预览（UI 确认位）→ apply=episode（source='ai-edit'，content=指令原文+diff JSON）+ 边失效判定（resolve_edge_contradictions 40 行直译）→ 回滚 API=反向 episode；全程 UPDATE/INSERT 永不删数据（与 dsh-session append-only 同构） |
| P1-3 | corefers_with v2 | [packages/kb/kg-build/src/cross-source.ts](../../packages/kb/kg-build/src/cross-source.ts) | 三段式：blocking（DeepSeek embedding top-20 召回+规则 OR 并集）→ pairwise LLM 判决 → union-find 等价类物化+tombstone 防复活；置信分层→人工审核队列（UI 在 P2-3） |
| P1-4 | kg_query L1+PPR | [packages/kb/kb-graph/src/kg-nl.ts](../../packages/kb/kb-graph/src/kg-nl.ts) + [packages/kb/tool-kb/src/kg-query.ts](../../packages/kb/tool-kb/src/kg-query.ts) | L0 保留（9 模板）；L1 参数化模板 LLM 填参（模板先验防幻觉）；L1.5 PPR 邻域检索（15 行 power iteration）；context 装配改 GraphRAG 管道表格式+evidence 溯源列；RPC 与模型工具共用编译器不变 |
| P1-5 | 增量同步入口 | [packages/kb/kg-build/src/incremental.ts](../../packages/kb/kg-build/src/incremental.ts) + scripts/kg-build.mts | 快照指纹调度从"手动脚本"升级为可触发增量（web UI 一键重建 → M1 3.5 时效徽标闭环）；NocoBase 行级变更按 watermark 进图 |

**P1 验收**：①AI 改图端到端：NL"把张红喜的供应商关系改成 X"→diff→确认→图更新+episode 记录→回滚恢复原状（成功率 100%，实测脚本）；②kg_mention 反查"这条边来自哪次修改"返回指令原文；③对齐审核队列消化率>80%（人工操作计入）；④PPR hits@5 对比 L0 提升（评测集落 research/）；⑤张红喜场景+9 模板回归；⑥真实 API 实跑截图（AI 改图 diff 预览+回滚）。

### P2（2-3 月内滚动）：可视化双层 + 变更流 + 社区

| # | 任务 | 落点 | 要点 |
|---|---|---|---|
| P2-1 | 本体树视图 | packages/client/ui-kg/src/client/OntoTree.tsx（新，@xyflow/react） | class 层级树+约束展示+FoodOn URI 链接+KGCL 提案入口；与实例图双视图切换 |
| P2-2 | sigma 语义着色 | [KgGraphCanvas.tsx](../../packages/client/ui-kg/src/client/KgGraphCanvas.tsx) + [presentation.ts](../../packages/client/ui-kg/src/client/presentation.ts) | nodeColorOf() 按 layer/extends 语义着色 + louvain 社区色（graphology-communities-louvain，MIT）；islands 诊断视图（343 孤岛定位） |
| P2-3 | 变更流+审核卡片 | packages/client/ui-kg/src/client/ChangeFeed.tsx（新） | ontology_change 事件流（Change Summary 式）+ 对齐审核队列卡片（P1-3 的 UI）+ Watches 订阅 + Revisions 快照导出 |
| P2-4 | 社区物化 | kg-build（kg_cluster/community 表，graphology louvain 物化进 SQLite） | 供着色与 islands 统计（替代现有自研连通分量） |
| P2-5 | L2 受限 DSL（可选） | kg-nl.ts | 模板覆盖不了的查询走受限 DSL 白名单；不做自由 Text2Cypher（负面清单） |

**P2 验收**：本体树 CRUD→ontology_change 事件留痕；编辑 class 即时反映到实例图着色；变更流时间线可回放任意 revision；islands 视图截图证据。

## 3. 涉及文件/包汇总

| 层 | 包/文件 | 变更 |
|---|---|---|
| 本体 | packages/kb/kb-graph/src/{types,ontology,kg-nl,shacl}.ts | v5 类型+FoodOn 字段+shapes 编译 |
| 存储 | packages/kb/kb-graph-sqlite/src | SCHEMA_VERSION 升版+episode/mention/xref/cluster 表+四时间戳列 |
| 构建 | packages/kb/kg-build/src/{extract,validate,cross-source,incremental,foodon-import}.ts | 抽取协议+校验闭环+共指 v2+增量+FoodOn |
| 工具 | packages/kb/tool-kb/src/{kg.ts,kg-query.ts,kg-edit.ts} | kg_edit 新工具+kg_query L1/PPR |
| RPC | packages/host/apiproxy/src/api/{kg.schema.ts,kg.ts} | 写路径（edit/rollback/ontology CRUD）+ stats 扩时效口径 |
| UI | packages/client/ui-kg/src/client/* | 本体树/语义着色/变更流/AI 改图对话框 |
| 组合 | examples/kb-agent/cordis.patch.yml + kg-mappings.yml | mappings 增 FoodOn 域映射+新表声明 |
| 算法 | graphology + graphology-communities-louvain（新依赖） | louvain/pagerank/components；需过 dependencies-over-hand-rolling 政策评审 |

## 4. 验收标准（汇总，真实可验证）

- **量化锚点**（每段必测，基线 2026-09-17 实测）：islands 343↓、coverage 49.7%↑、PPR hits@5、SHACL 违例拦截率、AI 改图回滚成功率 100%、对齐审核队列消化率。
- **回归**：张红喜供应商方案场景（kg_subgraph 追问链）+ 既有 9 模板查询 + apps/web/tests/kg-graph-page.e2e.ts 快照。
- **真实 API 实跑**：kg_edit 的 NL 改图→diff→确认→回滚全程（DeepSeek/MiniMax）+ 浏览器截图；kg-build 全量重建日志留档。
- **测试政策**：每段 keyless 快照（assembled 真实 example）+ 单测（kg-nl 新模板、shacl IR、episode 回滚）+ SDK 双投影不动（无 loop/session 事件变更则豁免，kg 域新增 RPC 需 ts client 快照）；Agent Note 同 PR。

## 5. 依赖与风险

- **依赖**：无前序批次硬依赖（可与 M1 并行）；P2-2 着色为 M1 3.5 路径高亮提供 graphology。
- **风险与缓解**（调研 10.4 章全表摘录）：①中文语料 Instruct-KGC 未验证→A/B 门禁；②SHACL 回灌附带损伤（实证 99/180）→"仅重出被点名条目"+全量 diff 检测+隔离区兜底；③AI 改图歧义→强制 diff 预览+人工确认；④FoodOn 上游变动→锁版本快照+xref 记录导入版本（OBO FP-004 永久可解析）；⑤episode/build_run 双账本→语义分工表入 Agent Note；⑥graphology 新依赖→按 dependencies-over-hand-rolling 政策证明"删 owned code"。
- **明确不做**（负面清单）：整包引入任何 Python/Java 框架、Kuzu、自由 Text2Cypher、FoodEx2/LanguaL 单独引入、OWL 完整推理进主链、global search 近期上线。
