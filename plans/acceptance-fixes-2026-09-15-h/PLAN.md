# 用户验收反馈修复计划（第七轮 H）：场景 Tab 独立化 + 本体 KG 真可用 + 五大企业系统首期（2026-09-15 起）

> 面向下一位实施者（Loop 批次/code 模式）：本文回答"为什么与做什么裁决"，每批"怎么做"在 [10](10-h1-scenario-tab.md)~[70](70-h7-closeout.md)。所有根因结论附 `文件:行号` 或实机证据；调研经 9 路并行子任务（3 路 project-research + 1 路 real-deep-research L4 + 5 路 deep-research）+ 主任务亲证交叉完成，事实底座见 [00-research-notes.md](00-research-notes.md)，三主题报告见 [01](01-research-scenario-tab.md)/[02](02-research-ontology-kg.md)/[03](03-research-enterprise-systems.md)，五系统多期路线图见 [04](04-roadmap-five-systems.md)。基线 HEAD=`0573e344ba`（G 轮终审 PASS 95/100，dev 分支 B~G 提交未推送）。

**目标一句话**：① 场景 hero 从会话输入区座位迁出为独立第七业务 tab（其他 tab 不再渲染它）+ 全 tab UIUX 收口；② KG 从「有数据可看」升级为「真可用」——本体版本化+映射文件化+质量报告落库+NL 模板查询（务实在 TS/sqlite 体系内，不重基建）；③ 五大企业系统（CRM ERP/MES/WMS/PLM/SRM）启动：H 轮交付**地基+SRM+WMS 两个完整闭环**（NocoBase admin v2 flowPage 形态、可 UI 配置），PLM/MES/ERP/CRM 升级按 I/J/K/L 轮路线图分期。

**北极星（用户原话）**：

1. 「把dsh这个文档 21 检索 6 次 30 个场景 酱油中山梨酸钾的最大使用量？…精选场景 AI 营销洞察主管…按分类浏览 市场洞察5 工艺4…**这个模块做成单独的tab，不要每次点连接器、图谱什么的都展示！！！！uiux都调整下**」
2. 「知识图谱的构建，不要只有个样子，要可用，要把本体、数据、映射等都做起来，**深度调研下本体知识图谱怎么做的，ai+开源库**」
3. 「crmerp、mes、wms、plm、srm都要做起来，不是有个菜单就是可以了，每个都要做深度调研，然后根据nocobase的架构，搭建一个nocobase 的综合业务系统，不是hub+noco的后端，而是类似admin的系统，可以ui配置的，这个肯定需要定义很多新的区块的，要完整实现所有系统，**这是企业级别的真实项目！**」

**期待管理（最重要的一条）**：第 3 项是数周-数月级工程（[04 路线图](04-roadmap-five-systems.md) 合计约 24-36 个工作日）。H 轮只交付五系统中的 SRM+WMS 完整闭环+共享地基；PLM（含酱油山梨酸钾 GB2760 硬阻断场景）/MES/ERP+CRM 升级/全链打通在 I/J/K/L 轮，**每期在用户确认上期成果后启动**。本轮不建空菜单壳（用户明确反对），未建系统的菜单组不出现。

---

## 1. 调研结论摘要

### 1.1 主题一：hero 跨 tab 泄露根因 = 挂错座位，不是知识库 tab 的问题

- hero 挂在跨 tab 常驻的会话输入区座位 [`conversation.input.dock`](../../packages/client/ui-conversation/src/client/contract/slots.ts:213)（注册 [`ui-kb/index.ts:187`](../../packages/client/ui-kb/src/client/index.ts:187) id `kb-portal`），宿主 [`ConversationRoot.tsx:173`](../../packages/client/ui-conversation/src/client/skeleton/ConversationRoot.tsx:173) 无条件渲染；唯一让位信号只认 kb workbench 一种视图（[`kbStore.ts:140`](../../packages/client/ui-kb/src/client/kbStore.ts:140)）——连接器/图谱/业务/资产全漏。
- tab 是纯 slot 名单表（无路由）：现有 8 view（chat0/kb10/market11/connectors12/kg13/business14/trajectory15），**壳层零改动即可加 tab**；新增「场景」view = ui-kb 包内一次注册（[01 §2](01-research-scenario-tab.md)）。
- 关键语义变化：渲染条件 [`KbHeroDock.tsx:86`](../../packages/client/ui-kb/src/client/hero/KbHeroDock.tsx:86) 的 blank-only 限制必须放宽（否则有历史的会话里场景 tab 空白）。

### 1.2 主题二：KG 现状五成达标，开源生态调研否决了所有重基建选项

- 现状（路径纠正：[`packages/kb/`](../../packages/kb) 非 packages/kg）：双管线（R01-R13 确定性映射+LLM 闭集抽取）与增量（指纹 skip/七列锚/tombstone/幂等二跑零漂移硬断言）**🟢 达标**；本体版本化 🟡 半缺、映射管理 🔴、质量报告 🔴（report 不落库，进程退出即失）、NL 查询 🔴（[02 §1.3](02-research-ontology-kg.md)）。
- L4 调研（[R4 报告](../../research/2026-09-15-ontology-kg-engineering/report.md)，72 来源）：**Kùzu 已归档+核心团队被 Apple 收购（Critical 五源）→ 留在 SQLite**；LinkML JS runtime 4 年弃更 → 自研 TS registry 升级为单一事实源+JSON Schema/ajv+semver；映射层业界铁律=声明式文件为源 UI 只编辑；NL 查询=模板+槽位填充优先（dbt 基准 100% vs 裸生成 64.5%）；质量=12 项指标+落库+SHACL 风格报告（SHACL runtime 列后期）。
- 可用性验收口径五条（本体/映射/流水线/质量/查询）定义在 [02 §3.3](02-research-ontology-kg.md)。

### 1.3 主题三：五系统通道成熟，「类似 admin 可 UI 配置」= v2 flowPage 体系（26 页既成事实）

- **26 个 v2 flowPage 全部由工厂脚本经 REST 编程建成**（desktopRoutes:create + flowModels:save）——「UI 可配置」与「编程式」写同一张 flowModels 表，两者互通；用户排除的「hub+noco 后端」= Portal React 路线，H 轮不碰 Portal。
- **工厂五件套齐备**（[00 §4](00-research-notes.md)）：flow-page-lib 幂等基建/E1 spine/F2F3 复合页/F4 图表授权通道/n18 AI 挂载器（新表单零改动自动覆盖）。
- **自定义区块三路**：A=JSBlockModel（零插件）/B=组合现有（Tree/Kanban/Chart/Gantt/SQL collection）/C=真插件（动快照+yarn build，gantt 前车之鉴）——**五系统 MVP 裁决 A+B**；H 轮唯一自定义区块=WMS 库位图（A 路探针）；PLM BOM 树（I 轮）用 TreeBlockModel 单表自关联降级。
- **五域调研**（各报告落 research/）：SRM 零自定义区块最快成型（H4）；WMS 库位平面图唯一必需区块（H5）；MES ~80% 现成（Gantt+SQL collection，J）；PLM 王牌=GB2760 酱油山梨酸钾 1.0g/kg 硬阻断（已精确验证规则，I）；CRM+ERP=O2C/P2P 五单+移动加权+应收应付余额（MRP 排除，K）。
- **分期裁决**（[04](04-roadmap-five-systems.md)）：SRM+WMS 先行（上游依赖最少+区块探针）→ PLM → MES → ERP+CRM → 全链+AI 场景化。

---

## 2. 技术决策（已定，实施不再讨论）

1. **场景 tab = 新增 view `scenarios`**（order 10.5 或整数重排，H1 第 0 步裁决）：KbHeroDock 改造为视图组件（props dock→view、渲染条件放宽、删除 workbenchMounted 让位）；删除 input.dock 的 kb-portal 注册（座位声明保留，queue/todo/goal 住户不动）；KbHeroHeadline 留守 chat；scenarios.ts 不动（catalog-sync 门禁不受影响）。
2. **KG 存储/本体不换底**：留在 SQLite（Kùzu 死讯证据）；TS registry 是唯一事实源，升级=版本列+`kg_ontology_revisions` 审计表+semver+JSON Schema(ajv) 定义面校验+JSON 导出；不引 OWL/SHACL runtime/LinkML runtime（后期可选清单见 [02 §3.2](02-research-ontology-kg.md)）。
3. **映射规则文件化**：cordis.patch.yml 的 collections/fkLinks 提升为独立版本化 `kg-mappings.yml`（YARRRML 语义子集方向），旧键 fail loud；`skippedRelationFields` 与规则命中计数补进 run report；`ctx.kgBuild.mappings()` + apiproxy `kg.mappings` 供 UI。
4. **质量报告先落库再算指标**：新表 `kg_build_runs`（run 级 JSON 快照）——先解决「进程退出即失」，指标首期集=覆盖率/孤岛/冲突/过程计数；`kg.stats` 扩展出口；图谱 tab 只读「质量与映射」面板。
5. **NL 查询一期=模板+槽位填充**（服务端 `kg.query` 编译为 {seeds, relation_types, hops}），复用闭集校验；不做自由生成；UI 旧 3 正则语义保留为模板集前 3 项。
6. **KG 工具面收敛**：v1 `kb_graph_query`/`kb_graph_add` 配置开关默认禁用（保留代码），消除两代词汇分裂；快照链同 PR 更新。
7. **五系统形态=单 NocoBase admin 应用+每系统一菜单组**；不走多子应用/不新建 Portal/不动快照源码（路径 C 后备）；SCHEMA_VERSION 2→3（v2 拒绝，重建链第 0 步验证）。
8. **复用防分裂**：仓库复用 hub_inv_warehouses、物料复用 hub_inv_products 幂等加列（食品五字段，为 PLM 预埋）；供应商 srm_suppliers 新建独立（hub_po 保留，集成列后期）；批次新建 wms_lots（效期四日期+供应商追溯锚）。
9. **工厂复用与幂等**：h4/h5 脚本照 F2/F3 骨架+flow-page-lib（uid 前缀 `h4srm*`/`h5wms*`、batchScopedRows 圈批、磁盘回滚、marker+fingerprint 种子幂等）；图表一律 F4 `flowSurfaces:addBlock` 通道；JSBlockModel 先 PoC 三岔预案（[50-h5 第 0 步](50-h5-wms.md)）。
10. **验收基调延续 G 轮**：两轮幂等（setup 链×2 零漂移）、真机实测（:3080/:13000/:5432 + admin@nocobase.com/admin123，每系统端到端闭环剧本非仅页面渲染）、门禁全绿（typecheck/lint/doc-sync/verify 扩断言/n18ai- 计数上调）、AI 化覆盖新面（n18 自动挂+KG 三问+填充实测）、证据归档 demos/acceptance-h{1..7}/。
11. **每批独立提交可独立 revert**（E~G 惯例）；H 轮提交链叠在 `0573e344ba` 上不推送。
12. **范围外**（[00 §6](00-research-notes.md)）：Hub Portal 物理退役（G 轮遗留待用户确认）、五系统 I/J/K/L 期、KG 重基建项、CRM/Hub Portal 前端改动——本轮一律不动。

---

## 3. 批次总览（7 批，顺序执行；H1-H3 与 H4-H5 两线可交错）

| 批次 | 一句话 | 文档 | 规模 | 依赖 | 预估 |
|---|---|---|---|---|---|
| H1 场景 Tab 独立化 + UIUX 收口 | hero 迁 view 座位成第七业务 tab，他 tab 零渲染，全 tab 页头统一 | [10](10-h1-scenario-tab.md) | ~8 文件+2 测试大改 | 无 | 1 天 |
| H2 KG 本体版本化 + 映射文件化 | registry 版本列+审计表+semver+ajv 校验；kg-mappings.yml+规则命中上报；SCHEMA v3 | [20](20-h2-kg-ontology-mapping.md) | 3 包+2 新表+1 配置文件 | 无 | 1 天 |
| H3 KG 质量报告 + NL 模板查询 + 工具收敛 | kg_build_runs 落库+指标集+图谱 tab 面板；kg.query 模板编译；v1 工具默认禁用 | [30](30-h3-kg-quality-query.md) | 4 面+1 新表+UI 面板 | H2 | 1 天 |
| H4 五系统地基 + SRM 闭环 | 物料食品字段+工厂扩容+verify 框架；SRM 6 表 8 页+准入 workflow+种子 | [40](40-h4-foundation-srm.md) | 1 脚本+6 表+8 页 | 无 | 1.5 天 |
| H5 WMS 闭环 + 库位图探针 | WMS 9 表 9 页+FEFO 推荐+盘点+append-only 流水；JSBlockModel 库位图 PoC 三岔 | [50](50-h5-wms.md) | 1 脚本+9 表+9 页+1 自定义区块 | H4 | 2 天 |
| H6 AI 化覆盖 + 文档同步 | n18 新表单全量实测+KG 三问+QUICKSTART/kb.md/Agent Note×3+handoff | [60](60-h6-ai-docs.md) | ~8 文件 | H1-H5 | 0.5 天 |
| H7 终审回归 | 幂等双跑全链+门禁全绿+真机全回归+证据归档 | [70](70-h7-closeout.md) | — | H1-H6 | 0.5 天 |

顺序理由：H1 最小批先解用户最刺眼的问题（三诉求中唯一「每次点击都烦」的即时痛点）；H2→H3 是主题二工程→可见的依赖链；H4→H5 五系统两腿（SRM 最轻验证五件套扩容→WMS 带区块探针）；两线（H1-H3 / H4-H5）相互独立可交错排程；H6/H7 收口。合计约 6-8 个工作日。

---

## 4. 验收标准（本轮完成定义）

1. **H1**：7 业务 tab（场景独立完整，非 blank 会话可见）；连接器/图谱/业务/资产 tab 无场景门户（截图对照）；blank chat 保留 headline+示例问题；kb-workbench e2e/cold-blank-session 快照/apply 断言改写后全绿；typecheck/lint EXIT=0。
2. **H2**：kg-build.mts 六段+新增断言全绿且幂等二跑零漂移；改 kg-mappings.yml 白名单重跑即出新 collection 节点（改映射零改代码实证）；ontologyVersion 在工具/网关输出出现；v2 旧库被拒（单测）；快照双跑一致。
3. **H3**：kg_build_runs 落库（JSON 证据）；图谱 tab 质量与映射面板数值与 sqlite 直查一致；NL 模板查询 ≥5 中文问题实测（含旧 3 模板回归）；v1 工具禁用后 agent 走 kg_subgraph 正常；AI 三问回答正确。
4. **H4**：SRM 端到端闭环实测（注册→AI 填充→准入审批→审核评分→合格→评分卡雷达图→CAPA 看板）；证照 30/60/90 预警分组渲染；verify（missingV2H4+srm_* probes+n18ai- 新下限）全绿；幂等 ×2 kept。
5. **H5**：WMS 9 步闭环实测（收货→上架温层匹配→效期染色→FEFO 拣货→过账→盘点→差异调整→流水）；库位图渲染（PoC 裁决形态）；stock=movements 聚合一致（psql 对照）；乐观锁 fail loud；幂等 ×2 kept。
6. **H6**：新表单 AI 填充实测（≥5 formId）；KG 三问正确；doc-sync EXIT=0；Agent Note ×3 通过格式门禁。
7. **H7**：幂等双跑全链零漂移；typecheck/lint/doc-sync/test 相关面 EXIT=0；真机全回归（7 tab+26 旧页+G 轮 Portal 资产+新 17 页全活零回归）；PG tail 无新增错误；证据归档 demos/acceptance-h{1..7}/；提交链独立可 revert。

---

## 5. 硬约束（实施全程有效）

- **不动 [`platform/nocobase`](../../platform/nocobase/MANIFEST.md) 快照源码**（local-modifications 保持空）；自定义区块只走 A/B 路径；不升级 NocoBase；不动 multi-app。
- **不动 CRM/Hub Portal 前端**（G 轮资产，仅回归验证）；不动 crm_*/hub_* 既有表结构（hub_inv_products 仅 nullable 加列）；不 reset 用户库。
- **KG 不重基建**：不引 Kùzu/triple store/OWL 推理/SHACL runtime/LinkML runtime；v1 工具禁用走配置默认值非删码。
- **scenarios.ts 的 30 场景清单默认不动**（catalog-sync 门禁）；联动叙事降级路线见 [60-h6](60-h6-ai-docs.md)。
- **每批验收前探活**：:13000 NocoBase、:3080 网关、:5432 PG、admin 登录可用。
- **提交链维持未推送基线**（`0573e344ba` 之上叠 H 轮提交）；每批独立提交、可独立 revert。
- 非平凡变更随 PR 附 Agent Note（H6 统一收口三条）；快照与测试同 PR 更新（AGENTS.md 惯例）。

---

## 6. 风险总览

| 风险 | 等级 | 预案 | 所属批 |
|---|---|---|---|
| **期待错位**：用户要「完整实现所有系统」，H 轮只交付 SRM+WMS | **高（沟通）** | 本文件期待管理段+[04 路线图](04-roadmap-five-systems.md)+attempt_completion 显式告知分期边界与每期规模 | 全 |
| JSBlockModel runjs 扫描约束挡住库位图（连带 I/J 轮区块路线） | 中 | [50-h5 第 0 步](50-h5-wms.md) PoC 三岔预案（A 受限→B 回退功能等价）；探针结论进 Agent Note | H5 |
| 非 blank 会话 `selectScenario` 行为未验证（场景 tab 语义变化） | 中 | H1 第 0 步真机实测；异常降级「场景 tab 内先开新会话」 | H1 |
| SCHEMA_VERSION 2→3 拒旧库且 sqlite 是唯一幸存副本 | 中 | H2 第 0 步先跑通重建链+留存 sqlite 副本作回滚资产；setup-dsh-data 重放保底 | H2 |
| v1 KG 工具禁用波及存量会话/评测 | 中 | H3 第 0 步全库盘点消费方清单裁决 | H3 |
| WMS 过账并发一致性（workflow 两节点非原子） | 中 | 乐观锁 version 校验 fail loud+单据串行过账交互约束 | H5 |
| flowModels:list pageSize 上限（五系统全上后 >2000） | 低 | H4 预留分页扩容 TODO；当前规模实测够用 | H4 |
| 单批规模历史最大（H5 9 表 9 页） | 中 | 表/页/种子三段分提交仍属一批；kept-spine 逐页断言 | H5 |
| kg-mappings.yml 双源期漂移 | 低 | 旧键存在即 fail loud；单测覆盖 | H2 |
| verify 计数断言漂移（n18ai- 手工按钮混入） | 低 | KNOWN_HAND_CONFIGURED_AI_BUTTONS 白名单沿用 | H4/H7 |
