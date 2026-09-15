# H 轮调研事实底座（00）

> 隶属 [PLAN.md](PLAN.md)。本轮调研 = 9 路并行子任务（3 路 project-research 项目盘点 + 1 路 real-deep-research 开源生态 L4 调研 + 5 路 deep-research 企业域调研）+ 主任务亲证交叉。本文是来源索引与关键事实底座；每主题完整结论见 [01](01-research-scenario-tab.md)/[02](02-research-ontology-kg.md)/[03](03-research-enterprise-systems.md)。基线 HEAD=`0573e344ba`（G 轮终审 PASS 95/100，dev 分支未推送）。

## 1. 调研任务与产出索引

| # | 主题 | 模式 | 产出 |
|---|---|---|---|
| R1 | 场景 hero 挂载机制 + tab 导航结构 | project-research | 本文 §2 + [01](01-research-scenario-tab.md) |
| R2 | KG 全栈现状盘点 | project-research | 本文 §3 + [02](02-research-ontology-kg.md) |
| R3 | NocoBase admin v2 体系 + 自定义区块路径 | project-research | 本文 §4 + [03](03-research-enterprise-systems.md) |
| R4 | 本体 KG 开源生态（AI+开源库）L4 | real-deep-research | [research/2026-09-15-ontology-kg-engineering/report.md](../../research/2026-09-15-ontology-kg-engineering/report.md)（1370 行、72 来源、12 分支全 saturated、sha256 防篡改校验）|
| R5 | CRM+ERP 域模型 | deep-research | [research/2026-09-15-crm-erp-domain-model.md](../../research/2026-09-15-crm-erp-domain-model.md)（40 来源）|
| R6 | MES 域模型 | deep-research | [research/2026-09-14-mes-core-domain-model-nocobase.md](../../research/2026-09-14-mes-core-domain-model-nocobase.md)（46 来源）|
| R7 | WMS 域模型 | deep-research | [research/2026-09-14-wms-domain-model-nocobase.md](../../research/2026-09-14-wms-domain-model-nocobase.md) |
| R8 | PLM 域模型（食品配方合规） | deep-research | [research/2026-09-14-food-plm-domain-model.md](../../research/2026-09-14-food-plm-domain-model.md) |
| R9 | SRM 域模型（食品供应商合规） | deep-research | [research/2026-09-14-srm-food-nocobase.md](../../research/2026-09-14-srm-food-nocobase.md)（48 来源）|

## 2. 主题一关键事实（场景 Tab 独立化）

**根因（用户为何在每个 tab 都看到 hero）**：hero 不挂在知识库 tab 内部，而挂跨 tab 常驻的会话输入区座位 [`conversation.input.dock`](../../packages/client/ui-conversation/src/client/contract/slots.ts:213)（注册 [`ui-kb/src/client/index.ts:187`](../../packages/client/ui-kb/src/client/index.ts:187)，id `kb-portal` order 5）；宿主 [`ConversationRoot.tsx:173`](../../packages/client/ui-conversation/src/client/skeleton/ConversationRoot.tsx:173) 在 composer 堆栈**无条件渲染**该座位；唯一让位信号是 kb workbench 的 mount 镜像（[`kbStore.ts:140`](../../packages/client/ui-kb/src/client/kbStore.ts:140) `bridge.workbench`，由 [`KbWorkbench.tsx:83-86`](../../packages/client/ui-kb/src/client/workbench/KbWorkbench.tsx:83) settle）——只考虑了知识库一种非 chat 视图，连接器/图谱/业务/资产/市场全部漏掉。

**tab 机制**：view 环是纯 slot 名单表（无路由）——[`apply.ts:158-171`](../../packages/client/ui-conversation/src/client/apply.ts:158) `viewTabs()` 遍历 `conversation.view` 投影；现有 8 个 view：chat(0)/kb(10)/market(11)/connectors(12)/kg(13)/business(14)/trajectory(15)。tab 条 [`ConversationSessionHeader`](../../packages/client/ui-conversation/src/client/skeleton/ConversationSession.tsx:149) 纯文字无图标；选中态持久化于会话 chatStore（未知 id 回落 chat）。

**hero 资产**：[`hero/`](../../packages/client/ui-kb/src/client/hero/KbHeroDock.tsx) 四件（KbHeroDock 360 行 / KbHeroHeadline 35 行 / scenarios.ts 402 行 30 场景+8 分类+3 纯函数 / hero.module.css）；统计 chips 走 `api.kb.stats()` → 共享 [`createKbClientStore`](../../packages/client/ui-kb/src/client/kbStore.ts:74)（sidebar 入口/hero/workbench 三处共享）；30 场景与 `examples/kb-agent/scenarios/` 的 id 一致性由 [`scripts/scenario-catalog-sync.spec.ts`](../../scripts/scenario-catalog-sync.spec.ts) 门禁强制。渲染条件 [`KbHeroDock.tsx:86-87`](../../packages/client/ui-kb/src/client/hero/KbHeroDock.tsx:86)：`session.blank && composerPhase==='blank' && !workbenchMounted`。

## 3. 主题二关键事实（本体 KG 真可用）

**路径纠正（主任务亲证）**：KG 包不在 `packages/kg/`（不存在），在 [`packages/kb/`](../../packages/kb) 组：[`kb-graph`](../../packages/kb/kb-graph/src/index.ts)（registry Service，本体 [`ontology.ts:79`](../../packages/kb/kb-graph/src/ontology.ts:79) 31 类型+23 关系纯 TS 硬编码）、[`kb-graph-sqlite`](../../packages/kb/kb-graph-sqlite/resources/sql/schema.sql)（7 张表 SCHEMA_VERSION=2，kg_nodes 带 FTS5 trigram + embedding BLOB 列预留，kg_edges 七列锚 UNIQUE+双时态 tombstone）、[`kg-build`](../../packages/kb/kg-build/src/index.ts)（`ctx.kgBuild.run()` 四腿：NocoBase→lakehouse→connector→corpus；R01-R13 是 [`mappers.ts:1-28`](../../packages/kb/kg-build/src/mappers.ts:1) 文件头注释编号的 TS 硬编码；LLM 抽取 [`extract.ts`](../../packages/kb/kg-build/src/extract.ts) 中文闭集 prompt+一次反馈重试+未知降级 Concept 桶；实体对齐 [`align.ts`](../../packages/kb/kg-build/src/align.ts) NFKC 规范+Jaro-Winkler≥0.9 自动并入+0.8-0.9 LLM 裁决；增量 [`incremental.ts`](../../packages/kb/kg-build/src/incremental.ts) 全快照 SHA-256 指纹+水位+knownIds）、[`tool-kb`](../../packages/kb/tool-kb/src/index.ts)（两代四工具并存默认全开：v2 `kg_schema`/`kg_subgraph` + v1 `kb_graph_query`/`kb_graph_add` 模型可写）、[`ui-kg`](../../packages/client/ui-kg/src/client/index.ts)（sigma.js 只读画布+3 正则短语模板）。组装于 [`examples/kb-agent/cordis.patch.yml:148-308`](../../examples/kb-agent/cordis.patch.yml:148)（5 collection 白名单+2 fkLinks）。

**能力差距（调研 R2 判定）**：增量构建 🟢 基本达标（指纹 skip/七列锚/tombstone/幂等二跑零漂移有硬断言）；本体版本化 🟡 缺版本号/历史/diff/迁移（`SCHEMA_VERSION=2` 是存储格式版本非本体版本；`KgOntologySource` 已预留 `'agent-defined'` 占位未实现）；映射管理 🔴 R01-R13 TS 硬编码、`skippedRelationFields` 有收集无上报、加 collection 要改 yml；质量报告 🔴 只有过程计数且 report 不落库（进程退出即失）、无覆盖率/孤岛/冲突指标；NL 查询 🔴 两层刻意保守（工具面无路径/属性过滤/聚合；UI 面是 3 个硬编码正则）。

**开源生态裁决锚点（调研 R4，证据链见其 report.md §06）**：
- **Kùzu 已死（Critical，五源交叉）**：2025-10-10 归档 + npm deprecated + 核心团队被 Apple 收购——嵌入式图库引入方案出局，**留在 SQLite**（递归 CTE 10 万节点 3-hop ≈10-30ms 三源交叉；graphology 补图算法、sqlite-vec 补向量）。
- **LinkML JS runtime 4 年弃更无校验能力**（源码级审计）——不引 runtime，本体继续自研 TS registry 作单一事实源，补 JSON Schema/ajv 校验 + semver；LinkML 仅列可选编译期镜像（本期不做）。
- **SHACL 用 `rdf-validate-shacl`（纯 ESM，Core 28/28）**——列后期可选，本期质量报告用自研指标集。
- **业界铁律：映射层声明式文件为源、UI 只编辑文件**——YARRRML 语义子集 YAML DSL 方向。
- **NL→图查询：模板+槽位填充优先**（dbt 基准 100% vs 裸生成 64.5% 且失败即报错）+ 三段校验门（parse→EXPLAIN→只读事务）兜底。
- AI+KG 质量参考：三层去重漏斗（sqlite-vec 余弦→MinHash/LSH→LLM 批量终审，graphiti 代码级可移植）、12 项可执行质量指标、本体演化=semver+不可变迁移脚本+废弃不删除。

## 4. 主题三关键事实（五大企业系统）

**基座**：[`platform/nocobase`](../../platform/nocobase/MANIFEST.md) = NocoBase **2.2.6** 源码快照（yarn1 隔离子树，local-modifications 空，快照零修改是既定决策）。

**26 个 v2 flowPage 全部由工厂脚本经 REST 编程建成**（`desktopRoutes:create` + `flowModels:save`），非手工搭建：N17d 8 页（[`nocobase-n17-alignment.mts`](../../examples/kb-agent/scripts/nocobase-n17-alignment.mts)）+ E1 3 页 + F1 2 页 + F2 5 页 + F3 7 页。「UI 可配置」与「编程式」写同一张 `flowModels` 表——两者互通，这正是用户要的 admin 形态。

**区块模型**：17 种 formal 数据/静态区块 + 字段容器 + ~50 种操作按钮（清单源 [`node-use-sets.ts:12`](../../platform/nocobase/packages/plugins/@nocobase/plugin-flow-engine/src/server/flow-surfaces/node-use-sets.ts:12)）；高层授权 API `flowSurfaces:*`（createPage/addBlock/addField/blueprint 等，写需 ACL snippet `ui.flowSurfaces`）。

**工厂五件套（H 轮直接复用）**：① [`nocobase-flow-page-lib.mts`](../../examples/kb-agent/scripts/nocobase-flow-page-lib.mts)（幂等 uid 前缀 + `batchScopedRows` 三元组圈批 + 磁盘回滚 RollbackRecord + fail-closed 分页）；② E1 建页 spine 模板（[`nocobase-e1-pj-v2.mts:394-465`](../../examples/kb-agent/scripts/nocobase-e1-pj-v2.mts:394)）；③ F2/F3 复合页骨架（一页多 TableBlock+AddNew 弹窗）；④ F4 图表必须走 `flowSurfaces:addBlock`（raw save 产出客户端不可读块）；⑤ n18 AI 挂载器扫全库顶层 CreateFormModel 自动挂 `AIEmployeeButtonModel`（新表单零改动覆盖）。

**自定义区块三路**：A=`JSBlockModel`（formal 类型，服务端 runjs 校验，零插件）；B=组合现有（Tree 树/Kanban 看板/Chart 图）；C=写真 NocoBase 插件（动快照树+yarn build ~20min，gantt 前车之鉴：客户端注册≠服务端 authoring，无 catalog 契约保护）。**裁决：五系统首选 A+B，C 仅后备。**

**现有数据模型**：crm_* 11 表 + hub_* 37 表（九域）。差距：ERP 缺 O2C/P2P/财务核算；MES 全缺；WMS 仅 hub_inv 3 表雏形（缺库位/盘点/批次效期）；PLM 缺物料主档/BOM 版本/ECN；SRM 仅采购级（缺准入/绩效/对账）。

**五域调研核心结论**（详见 [03](03-research-enterprise-systems.md)）：CRM+ERP 首期闭环=L2C 升级+O2C/P2P 五单+移动加权计价+应收应付余额（不建复式总账，MRP 排除）；MES=生产订单+工序任务两层粒度，批次追溯=批次消耗关系表+工单锚点，MVP ~80% 标准区块覆盖（Gantt 插件+SQL collection）；WMS=库存 (SKU×库位×批次×状态)+四数量+乐观锁+append-only 流水，库位平面图是唯一 MVP 必需自定义区块；PLM=配方版本头行分离+GB2760 限量规则库（酱油山梨酸钾 12.04 类 1.0g/kg 以山梨酸计已精确验证）+超限硬阻断，多级 BOM 树是唯一 MVP 必需自定义区块；SRM=供应商主数据+证照效期+审核评分+绩效评分卡+CAPA，**零自定义区块**（echarts 雷达图原生支持）。

## 5. 主任务亲证交叉记录

1. `packages/kg/` 不存在（用户口述路径笔误）——实际 [`packages/kb/kg-build`](../../packages/kb/kg-build/package.json)（`@deepseek-ai/dsh-kg-build`），亲证 package.json name/description 与双管线叙述一致；[`packages/kb/`](../../packages/kb) 八包结构确认（kb/kb-embed-*/kb-graph/kb-graph-sqlite/kb-sqlite/kg-build/tool-kb）。
2. [`packages/client/`](../../packages/client) 确认存在 ui-kb/ui-kg/ui-conversation/ui-layout/ui-workspace 等 39 个 ui 包，与调研 R1/R2 叙述吻合。
3. G 轮计划 [`plans/acceptance-fixes-2026-09-14-g/PLAN.md`](../acceptance-fixes-2026-09-14-g/PLAN.md) 通读：验收基调（幂等双跑/真机实测/门禁全绿/截图归档/Agent Note）与批次详档格式为本轮模板；G 轮决策 6 遗留「Hub Portal 物理退役待用户确认」——**不在 H 轮范围**（用户未提，列入范围外事项）。
4. 运行环境：:3080（DSH 工作台+NocoBase 网关）/ :13000（NocoBase admin）/ :5432（PG 17）运行中，admin@nocobase.com/admin123；提交链至 `0573e344ba` 未推送。

## 6. 范围外事项（明确不做，防期待错位）

- **五系统的 PLM/MES/ERP/CRM 升级**：在 I/J/K/L 轮（见 [04 路线图](04-roadmap-five-systems.md)）；H 轮只交付 SRM+WMS 完整闭环+地基。
- **Hub Portal 物理退役**（G 轮遗留 6 处代码/门禁）：待用户单独确认，H 轮不动。
- **KG 重基建**：不引入 Kùzu（已死）/ triple store / OWL 推理机 / SHACL runtime（本期）；不做本体自由编辑器（本期只读管理面）。
- **NocoBase 快照源码修改**：路径 C（真插件）不启用；不升级 NocoBase 版本；不动 multi-app。
- **CRM/Hub Portal 前端**：G 轮刚完成移植收口，H 轮零改动（仅回归验证）。
