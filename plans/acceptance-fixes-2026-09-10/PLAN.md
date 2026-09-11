# 用户验收反馈修复计划：市场故障 + 本体图谱内置 + UI/UX 重设计（2026-09-10）

> 面向下一位实施者（Loop 批次/code 模式）：本文回答"为什么与做什么裁决"，每批"怎么做"在 [01](01-market-enoent.md)~[05](05-closeout.md) 批次文档。所有根因结论附 `文件:行号` 证据，均已在 HEAD=c8eaf64e76 现场核实。

**目标一句话**：修复「数据资产」tab ENOENT 故障；让本体+知识图谱成为 setup 幂等链产出的内置数据（重置后单跑 `setup all` 即有图）；重新设计 DSH 工作台信息架构与全页面视觉（30 场景收纳治理 + 六页签设计感提升）。

**北极星（用户原话）**：

1. 「DSH『数据资产』tab 打开报：市场暂不可用 — ENOENT: scandir `.../workspace/data/connector-files`」
2. 「图谱页是空的。初始化时必须准备内置数据——幂等接入 setup 链，重置后单跑 `setup all` 即有图。这是本体知识图谱：把湖仓、知识库、业务系统综合起来建立本体与知识图谱。」（参考方案：`/Users/mac/Downloads/历史会话.md`，要点摘录见 §3）
3. 「dsh页面本身uiux不合理！！！30个场景怎么一直都在，其他页面怎么展示，其他页面的uiux也不行，没有设计感！！！！，使用技能skill进行优化设计！！！」

---

## 1. 调研结论摘要（三问题根因）

### 1.1 问题一：市场 ENOENT（scandir connector-files）

**调用链**：侧栏「数据资产」入口（[ui-assets/src/client/index.ts:98](../../packages/client/ui-assets/src/client/index.ts)）→ `refresh()` 并发 `api.assets.stats/list`（[index.ts:82,90](../../packages/client/ui-assets/src/client/index.ts)）→ BFF [`assets.stats/list`](../../packages/host/apiproxy/src/api-proxy.ts:4004)（:4010/:4044 调 `connector.discover`）→ [`ConnectorRuntime.discover()`](../../packages/connector/connector/src/index.ts:171) 顺序 fan-out → [`FileConnectorProvider.discover()`](../../packages/connector/connector-file/src/provider.ts:51) 内 [`readdir(this.root)`](../../packages/connector/connector-file/src/provider.ts:53) 抛 ENOENT → 错误经 [`assetsRejected`](../../packages/host/apiproxy/src/api-proxy.ts:1424) 原文透传 500 → 前端 [MarketView.tsx:105](../../packages/client/ui-assets/src/client/MarketView.tsx) 错误条显示「市场暂不可用」（文案 [locales.ts:113](../../packages/client/ui-assets/src/client/locales.ts)）。

**根因（三重缺口叠加）**：

1. **无人创建目录**：产品代码、组合配置（[cordis.patch.yml:239](../../examples/kb-agent/cordis.patch.yml) 仅引用不创建）、全部 setup/seed/kg 脚本均无 `mkdir connector-files`；唯一指引是 QUICKSTART 手动 mkdir（[QUICKSTART.zh.md:22](../../examples/kb-agent/QUICKSTART.zh.md)），且其 FAQ :314 明示干净检出首启即报此错。
2. **git 无法保存空目录**：[.gitignore:21](../../examples/kb-agent/.gitignore) 忽略 `workspace/data/*`，[:33](../../examples/kb-agent/.gitignore) 白名单 `!workspace/data/connector-files/`，但目录内无被跟踪文件（无 .gitkeep），git 不追踪空目录 ⇒ clone/重置后必缺。现场实测 `workspace/data/` 下 17 个语料子目录均在、唯缺 `connector-files`。
3. **fail-loud 放大**：file provider [`available()` 恒 true](../../packages/connector/connector-file/src/provider.ts:40)，且 runtime [任一 provider 抛错整体失败](../../packages/connector/connector/src/index.ts:176)——一个空目录缺失把整个市场（含 NocoBase 侧资产）打挂成 500。

**「174+ 资产」与 connector-files 的关系（两套数据源判定）**：市场目录 = 运行时 `connector.discover` 聚合两类 provider——① connector-nocobase（三集合 `datasets`/`expert_services`/`experts` 映射，[COLLECTIONS](../../packages/connector/connector-nocobase/src/provider.ts:63)）；② connector-file（目录内 7 类扩展名文件，[ROUTED_EXTENSIONS](../../packages/connector/connector-file/src/provider.ts:19)）。176 项市场目录（datasets 89 + experts 35 + services 52，[handoff-2026-09-10.zh.md:40](../handoff-2026-09-10.zh.md)）全部来自 NocoBase 运行态；featured 精选栏另读 [seed.json](../../examples/kb-agent/workspace/data/market/seed.json)（`assetsSeedPath`，[cordis.patch.yml:300](../../examples/kb-agent/cordis.patch.yml)）。**connector-files 只是 file-kind 的第 N 个 provider，缺失本应只少一类资产**。种子真源：[assets-batch5.json](../../examples/kb-agent/workspace/data/market/assets-batch5.json)（63 条）经 [seed-market.mts](../../examples/kb-agent/scripts/seed-market.mts) 按 title 幂等种入 NocoBase；其余来自 setup init/crm/hub/N13 脚本。

### 1.2 问题二：图谱页空

**结构性根因（成立）**：图谱数据历史上全部靠手动一次性跑 [`kg-build.mts`](../../examples/kb-agent/scripts/kg-build.mts) 生成（QUICKSTART 冷启动链第 4 步是独立命令，[QUICKSTART.zh.md:244-258](../../examples/kb-agent/QUICKSTART.zh.md)；[handoff-2026-09-10.zh.md:53-54](../handoff-2026-09-10.zh.md) 同），**从未进入 `setup-nocobase.mts all` 链**（all 顺序见 [setup-nocobase.mts](../../examples/kb-agent/scripts/setup-nocobase.mts) `main()`，含 install→build→start→init→plugins→ai→7 个模块重放→verify，无任何 kg 步）。而 `kg-graph.sqlite`/`kb.sqlite`/`lakehouse-catalog.sqlite` 均为 gitignored 运行态（[.gitignore:1-8](../../examples/kb-agent/.gitignore)）——clone 或 workspace 重置后三库必缺且无人重建；provider 对缺失文件 [新建空库+31 类型种子](../../packages/kb/kb-graph-sqlite/src/schema.ts:112)，页面呈「图例 31 类型正常、实体 0」的空图态。

**现场态修正（重要，纠正调研误报）**：截至 2026-09-10 实测（`sqlite3` 直查），当前机器 `workspace/` 三份 sqlite **均在盘且 kg 库有数据**：`kg_nodes=1293、kg_edges=867、kg_node_types=36、kg_relations=25、kg_source_runs=73`（2026-09-09 02:15 生成，wal 4MB 未 checkpoint）；`kb.sqlite` 98MB；`lakehouse-catalog.sqlite` 24KB；湖仓 parquet 在 `workspace/lakehouse/demo-food-co/`。（注意：子任务 `list_files` 尊重 .gitignore 会看不到这些文件，**以 `ls`/`sqlite3` 直查为准**。）因此当前用户所见「图谱页是空的」另有一层页面侧原因待实证——[ui-kg 页面设计](../../packages/client/ui-kg/src/client)需要用户在短语框输入实体种子/模板短语才发起 `api.kg.subgraph` 游走（[index.ts:97](../../packages/client/ui-kg/src/client/index.ts)），**初始画布为空+图例是现状设计**。批次 2 第一步必须起服实测 `api.kg.stats` 返回值：若 nodes>0 而页面空 ⇒ 默认视图缺口（修复=初始默认游走）；若 nodes=0/报错 ⇒ 按 [`kgGates` 三关](../../packages/host/apiproxy/src/api-proxy.ts:1449)（kgEnabled/seam/kgTenant）与 cwd 相对路径解析（[`store.ts:244-245`](../../packages/kb/kb-graph-sqlite/src/store.ts) `resolve(path)` 按 dsh web 进程 cwd）排查。

**路径/环境变量指错（不成立）**：写入侧 [kg-build.mts:34](../../examples/kb-agent/scripts/kg-build.mts) 与读取侧 [cordis.patch.yml:156-159](../../examples/kb-agent/cordis.patch.yml) 指向同一相对路径；kb-graph-sqlite config 仅 `path` 字段无环境变量旁路（[index.ts:30-40](../../packages/kb/kb-graph-sqlite/src/index.ts)）。

### 1.3 问题三：UI/UX 现状

- **页面结构**：无集中路由，6 个 view tab 经 `conversation.view` slot ring 按 `order` 装配：对话(0)/知识库(10)/数据资产市场(11)/连接器与交付(12)/知识图谱(13)/业务管理(14)，注册处分别为 [ui-conversation apply.ts:390](../../packages/client/ui-conversation/src/client/apply.ts)、[ui-kb index.ts:205](../../packages/client/ui-kb/src/client/index.ts)、[ui-assets index.ts:110](../../packages/client/ui-assets/src/client/index.ts)、[ui-connectors index.ts:119](../../packages/client/ui-connectors/src/client/index.ts)、[ui-kg index.ts:146](../../packages/client/ui-kg/src/client/index.ts)、[ui-business index.ts:129](../../packages/client/ui-business/src/client/index.ts)。
- **「30 个场景」数据源**：[`KB_SCENARIOS`](../../packages/client/ui-kb/src/client/hero/scenarios.ts) 硬编码 30 条（:42-333），8 分类（:34）；与 `examples/kb-agent/scenarios/<id>/preset.yml`（实测 33 项 −3 个 README = **30 个场景目录**）人工同步，被 [scenario-catalog-sync.spec.ts:37](../../scripts/scenario-catalog-sync.spec.ts) + [scenarios.spec.ts:156](../../examples/kb-agent/tests/scenarios.spec.ts) 双门禁锁死。展示在 blank 会话 hero 门户：[KbHeroDock.tsx:109-148](../../packages/client/ui-kb/src/client/hero/KbHeroDock.tsx) 按 8 分类分组后**组内全量平铺 30 卡，无检索、无分页、无折叠**；文案「{n} 个场景 · 滚动查看」[locales.ts:139](../../packages/client/ui-kb/src/client/locales.ts)。点击走 `agentPresets.select`（[ui-kb index.ts:196](../../packages/client/ui-kb/src/client/index.ts)）——roster 本身来自后端，目录表纯静态。
- **样式体系**：token 已就绪（[ui-theme/src/styles/design-platform.css](../../packages/client/ui-theme/src/styles/design-platform.css)，`--dsw-static-*`/`--dsh-alias-*`）；规则 [docs/web-styling.md](../../docs/web-styling.md)：CSS Modules + clsx，**禁组件库与 Tailwind**；原子件全手写于 [ui-primitives](../../packages/client/ui-primitives)。问题：6 个域各自复制同名 `hero/toolbar/emptyState/errorStrip/*Skeleton` class（域级 module.css 合计 ~2200 行：market 461/workbench 532/hero 296/kg 422/business 276/connectors 242），无共享页面骨架；空态为两行文字、骨架为纯色 div；布局全部单列纵向平铺。
- **包边界红线**：[verify-client-domain-graph.ts](../../scripts/verify-client-domain-graph.ts) 禁域目录互引，跨域共享只能走 ui-primitives/ui-slots 或域内 `contract/` 层。
- **门禁影响面**：[kb-workbench.e2e.ts](../../apps/web/tests/kb-workbench.e2e.ts)（tab 名 :320/:348、placeholder :321、aria-label :324/:442、hero 文案 :393/:407、**'30 个场景' 字面断言 :412/:423/:454**、场景卡文案 :416-431、最近检索 class :473-516、零 console error 全局门禁 :251-259）；[market-pages.e2e.ts](../../apps/web/tests/market-pages.e2e.ts)（heading/计数/下单链路文案）+ [market-pages.overlay.yml](../../apps/web/tests/market-pages.overlay.yml)（域开关 opt-in patch 机制，:7-13）；域包单测（[marketview.client.spec.tsx](../../packages/client/ui-assets/tests) 等）与 [css-tokens.client.spec.ts](../../packages/client/ui-theme/tests)。
- **实测工作流**：起服 `DSH_HOME=examples/kb-agent/.dsh pnpm dsh web --patch examples/kb-agent/cordis.patch.yml --no-open`（:3080）；截图先例 [demos/nocobase-full-features/n*-capture.mjs](../../examples/kb-agent/demos/nocobase-full-features)（Playwright + `shot()` ready-poll/settle 封装，PNG 落脚本同目录，`N<批次>-<序号>-<名>.png` 命名）；源码 HMR 走 `pnpm run dev:web`；**客户端改动需 `pnpm run build:lib:client && pnpm run build:web` 后重启**（BUG-4 契约，[handoff-2026-09-10.zh.md:65](../handoff-2026-09-10.zh.md)）。

---

## 2. KG 能力现状盘点（批次 2 依据）

| 组件 | 事实 | 证据 |
|---|---|---|
| 本体注册表 kb-graph | 31 节点类型（5 顶层锚点+19 业务域类+7 食品闭集）+23 关系（7 食品谓词+2 SKOS+14 域模块），`builtinOntology()` 每次重建克隆 | [ontology.ts:79-172](../../packages/kb/kb-graph/src/ontology.ts) |
| 存储 kb-graph-sqlite | 七表属性图 v2（node_types/relations/nodes+FTS5/edges/aliases/source_runs/usage_counters），`SCHEMA_VERSION=2`，v1 库拒绝不迁移；建库物化 31+23 种子 | [schema.sql](../../packages/kb/kb-graph-sqlite/resources/sql/schema.sql)、[schema.ts:62,112](../../packages/kb/kb-graph-sqlite/src/schema.ts) |
| 管线 kg-build | Service `run()` 四腿：NocoBase 结构化映射(R01-R13)→湖仓 catalog→connector discover→corpus 闭集 LLM 抽取（MiniMax 默认）；per-scope 内容哈希+水位+tombstone 天然幂等 | [index.ts:264-282,368-408](../../packages/kb/kg-build/src/index.ts)、R01-R13 全文 [mappers.ts:2-27](../../packages/kb/kg-build/src/mappers.ts) |
| 工具面 tool-kb | `kg_schema`/`kg_subgraph`（YAML 聚合、禁 Text2Cypher）+ kb_search/ingest/ingest_url/stats + v1 图谱两件 | [kg.ts](../../packages/kb/tool-kb/src/kg.ts)、[index.ts:70-80](../../packages/kb/tool-kb/src/index.ts) |
| BFF kg 域 | 五方法 handler + 三道结构化拒绝（kg-not-composed/kg-graph-missing/kg-tenant-unbound）；空库时 schema 返 31 类型、stats 全 0、subgraph 报 kg-seed-unresolved | [api-proxy.ts:4114-4220,1449-1468](../../packages/host/apiproxy/src/api-proxy.ts) |

**三源输入现状**（对齐历史会话"湖仓+KB+业务系统综合"）：

| 腿 | 输入 | 当前状态 |
|---|---|---|
| 业务系统 | NocoBase 五集合（experts/expert_services/datasets/customs_export/orders）REST `listMeta`+`list` | 需 :13000 dev-server + PG17（本机 PG 已起）；seed 链幂等可重放 |
| 湖仓 | `lakehouse.listTables`（sqlite catalog + DuckDB parquet） | parquet 在盘（demo-food-co/ 4 文件）；catalog 可由 seed-lakehouse 幂等重建 |
| 知识库语料 | `corpus.root` 递归扫 .md（`workspace/data/`，15 目录 46+ 篇 git 跟踪） | 完好；LLM 抽取腿需 MINIMAX_API_KEY |

---

## 3. 历史会话.md 方案要点摘录（本体+图谱构建，行号=该文件行）

该文件（1174 行）是关于本体/知识图谱构建的方法论问答，核心要点：

1. **概念模型**（L43, L304-312, L470-473）：本体 = "类型+属性+关系+约束"的机器可读模型；本体 ≠ 知识图谱——本体是"数据库结构+业务规则"，图谱是"把真实数据按结构装进去"。一句话：本体=定规则，图谱=按规则组织真实知识，RAG=把知识找出来给 AI，Agent=用知识完成任务。
2. **八步流程**（L49-65）：①领域分析→②定义概念(Class)→③定义属性(Property)→④定义关系(Object Property)→⑤定义约束(Cardinality)→⑥形成本体模型→⑦映射真实数据→⑧生成知识图谱；①-⑥是构建本体，⑦⑧是组织数据生成图谱。
3. **食品本体示例类型体系**（L83-95, L107-113, L122-147）：11 类核心对象（产品/企业/原料/添加剂/营养成分/检测指标/检测结果/标准/生产工艺/生产设备/生产批次）；属性如 `Food{name,brand,category,barcode,producer,shelfLife,standard}`、`Company{name,creditCode,address,legalPerson,industry}`；核心关系（L159-163）：企业→生产→产品、产品→包含→原料、产品→使用→添加剂、产品→执行→标准、产品→检测→检测指标；基数约束（L222-229）：如 producer 恰好 1 个、ingredient 可多个。
4. **数据先行模式（推荐）**（L665-691, L693-755）：湖仓先存数据→数据治理→AI 分析数据结构→自动发现概念/属性/关系→生成本体→人工审核→按本体生成图谱；并强调循环迭代（L834-848）：数据→自动发现→本体 V1→图谱→发现新实体/关系→本体 V2→图谱更新。
5. **架构定位**（L428-471, L881-906）：本体构建+图谱构建+图谱存储放湖仓层（语义层），AI 开发平台（Agent/RAG/图谱应用）在上层消费；推荐产品流程：数据接入+治理→数据资产沉淀→【本体构建/发现】（AI 自动生成+人工设计）→本体→知识图谱构建→图谱查询 + AI/RAG/Agent。
6. **完整技术架构**（L1090-1137）：数据源→湖仓→数据资产/元数据→**数据理解引擎**（Schema 分析/字段语义分析/实体发现/关系发现）→**AI 本体生成器**（Class/Property/Relation/Constraint）→本体 V1→人工审核→本体 V2→本体+原始数据→知识图谱→AI 开发平台（RAG/GraphRAG/Agent/Workflow）。
7. **开源组件选型表**（L1140-1148）：schema-driven-ontology-rules（表→Class/字段→属性/外键→关系/约束→OWL）、OntoGen（CSV→OWL）、RDB2OWL-Bench 方案（SQL Schema→LLM→本体）、DeepOnto（本体对齐/推理）、OntoGPT（LLM+Schema 从文本抽实体关系）、Protégé/WebProtégé（编辑/协作）、Neo4j/Jena/RDF4J（存储）。

**与本仓库现状的映射评估（裁决）**：

- 本仓 R01-R13 确定性映射 ≈ 历史会话的 "schema-driven" 路线（表→类型、列→属性、FK→边）；corpus 闭集抽取 ≈ OntoGPT 路线（按闭集 schema 从语料抽取）。**双路管线与历史会话方案已实质对齐**，31 类型+23 关系注册表即已发布的"本体 V1"。
- 三源综合已具备：kg-build 四腿恰好覆盖 业务系统(NocoBase)+湖仓(catalog)+连接器(file)+知识库语料(corpus)。**本轮缺口不是管线，而是初始化编排（接入 setup 链）与页面默认视图**。
- 历史会话中的 Protégé/OWL/Neo4j 等开源组件**不引入**（仓库栈为注册表+node:sqlite 属性图，"方案对齐、实现沿用现有栈"）；"人工审核/本体迭代 V2/本体编辑器"超出本轮范围（本轮以修复+内置数据+UI/UX 为主），在图谱页以本体图例+类型过滤作为本体的可视化呈现即可。

---

## 4. 技术决策（已定，实施不再讨论）

1. **市场修复主路径 = connector-file 插件 apply() 自动建目录**：ENOENT → `mkdir(root, {recursive:true})` 后放行；非 ENOENT（如 ENOTDIR，root 父级是文件）仍 fail loud——保持"misconfiguration fails the composition"语义（[connector-file/src/index.ts:47-50](../../packages/connector/connector-file/src/index.ts) 现注释）。加固：`discover()` 对运行期 ENOENT（目录被删）降级空结果并注明吞的是哪一种情形。
2. **connector-files 内置数据 = git 跟踪示例文件**：.gitignore 白名单已就位（[:33](../../examples/kb-agent/.gitignore)），直接提交 2-3 个食品行业示例数据文件进该目录（clone 即有目录+数据），并在 setup 链加幂等 ensure 双保险。
3. **不新增 `setup all` 命令，扩展现有链**：新建 [`setup-dsh-data.mts`](../../examples/kb-agent/scripts)（编排 connector-files ensure → seed-lakehouse → seed-market → kg-build[分级] → 可选 seed-kb），以子进程重放模式挂进 [setup-nocobase.mts](../../examples/kb-agent/scripts/setup-nocobase.mts) `all` 链（ai/模块重放之后、verify 之前）——与 crm/hub/n13 系列同一模式（[setup-nocobase.mts:854-862](../../examples/kb-agent/scripts/setup-nocobase.mts)）。
4. **kg-build 分级语义**：有 MINIMAX_API_KEY → 全四腿（终态 ≈1292/858）；无 key → 跳过 corpus LLM 腿并 console 明示，确定性三腿照跑（节点>0）。幂等由 kg-build 自带内容哈希+水位保证，二跑全 skip。
5. **图谱页默认视图**：初始加载即发起一次默认游走（预置种子或 stats 驱动 top 实体），保证打开 tab 断言画布节点>0；具体取数（复用 `kg.subgraph` 预置种子 vs 新增轻端点 `kg.overview`）由批次 2 实施时按最小改动裁决，验收锁定结果不锁定实现。
6. **场景治理不动数据模型**：30 场景仍静态 `KB_SCENARIOS` + preset.yml 双门禁（id 集合不变），只改信息架构（精选+分类收纳+检索）；'30 个场景' e2e 文案断言同步更新，不破坏 scenario-catalog-sync/spec 门禁。
7. **UI 重设计守三条红线**：禁组件库/Tailwind（[docs/web-styling.md](../../docs/web-styling.md)）；共享组件落 ui-primitives（域间禁互引，[verify-client-domain-graph.ts](../../scripts/verify-client-domain-graph.ts)）；明暗主题分支归 ui-theme。视觉升级必须真实起 dev server 浏览器实测并留截图（先例 n*-capture.mjs）。
8. **UI 批次任务书必须指定加载执行设计技能**：ui-ux-pro-max、high-end-visual-design、redesign-existing-projects（~/.roo/skills/）——规划阶段不执行技能工作流，批次文档写明技能名+关键要求。

## 5. 批次总览（5 批，顺序执行；2026-09-11 全部完成）

| 批次 | 一句话 | 文档 | 依赖 | 预估 | 状态 |
|---|---|---|---|---|---|
| B1 市场 ENOENT 小修 | connector-file 自动建目录+git 内置示例文件+fail-safe 加固 | [01-market-enoent.md](01-market-enoent.md) | 无 | 0.5 天 | ✅ 完成 |
| B2 本体图谱内置数据 | setup-dsh-data 编排+接入 all 链+图谱页默认视图+空因实证 | [02-kg-builtin-data.md](02-kg-builtin-data.md) | B1（connector-files ensure 复用） | 1 天 | ✅ 完成 |
| B3 场景信息架构 | 30 场景精选+分类收纳+检索（hero 门户重设计第一刀） | [03-scenario-ia.md](03-scenario-ia.md) | 无（可与 B2 并行，建议串行控风险） | 1 天 | ✅ 完成 |
| B4 全页面视觉提升 | 共享页面骨架沉淀+六页签 token 化视觉升级（明暗） | [04-pages-visual.md](04-pages-visual.md) | B3（hero IA 已定） | 1.5-2 天 | ✅ 完成 |
| B5 收口回归 | 全量回归+幂等实证+文档/Agent Note/handoff 终态 | [05-closeout.md](05-closeout.md) | B1-B4 | 0.5 天 | ✅ 完成（图谱 1073/594、demo 5/5、test:web 除 hmr-live 上游缺陷豁免外全绿——见 Agent Note `2026-09-11-b5-closeout-regression`） |

## 6. 验收标准（本轮完成定义）

1. **市场**：干净临时 world（模拟 clone，无 connector-files）起服后 `assets.stats` HTTP 200 且 products>0；既有 e2e `market-pages.e2e.ts` 全绿；新增"目录缺失不再 500"用例。
2. **图谱**：删除三份 sqlite 后单跑 `node --import tsx/esm examples/kb-agent/scripts/setup-nocobase.mts`（默认 all）EXIT=0，`sqlite3` 直查 `kg_nodes>0 && kg_edges>0`（有 key ≥600/400，无 key >0）；二跑 all 幂等（kg 计数增量 0）；浏览器打开图谱 tab 默认有图（截图证据）。
3. **UI/UX**：hero 门户 30 场景不再全量平铺（精选+收纳+检索可断言）；六页签明暗两套截图留档 demos/；`pnpm run test:web` 全绿；`pnpm run lint && pnpm run typecheck && pnpm run doc-sync` EXIT=0。
4. **过程资产**：每批验收实录（截图/命令输出）+ Agent Note（非平凡改动同 PR）+ 本 PLAN 批次勾选更新。

## 7. 硬约束（实施全程有效）

- 所有数据初始化幂等并接入 setup 链；不破坏 `setup all` 既有语义（NocoBase 域步骤行为不变，只追加）。
- 不引入 NocoBase Pro 等商业插件依赖；不引入组件库/Tailwind/OWL/Neo4j 等外部图谱栈。
- 不破坏 `pnpm run lint / typecheck / test / doc-sync / test:web` 门禁；受影响 e2e/snapshot 同 PR 更新。
- UI 改动遵守包边界（域间禁互引）与 BUG-4 重启契约（client 改动 build:lib:client+build:web 后重启）。
- 范围控制：不做本体编辑器、不做本体 LLM 迭代 V2、不做无关重构；历史会话方案只取"数据先行+三源综合+双路管线"对齐，不搬其开源组件。

## 8. 风险总览

| 风险 | 等级 | 预案 |
|---|---|---|
| connector-file 自动 mkdir 与 fail-loud 约定冲突争议 | 中 | 决策 1 已限定"仅 ENOENT 建、其他照抛"并留注释；Agent Note 记录裁决 |
| kg 页空因实证发现新问题（cwd 解析/门控） | 中 | B2 第一步实证前置，修复方案按实证结果收敛；三关排查路径已给 |
| 无 key 环境图谱确定性腿产出低于预期 | 低 | kg-build 四腿中三腿确定性（NocoBase+湖仓+连接器），批次 2 定阈值时以实测为准 |
| 场景 IA 改动破坏 '30 个场景' 等字面断言 | 中 | B3 列出全部受影响断言清单，同 PR 更新；双 spec 门禁（sync/scenarios）不动 id 集合 |
| UI 视觉改动波及 tab-ring 组件（navigation-panes 等批次） | 中 | B4 只改域内 view 与 ui-primitives 新增件，不动 tab ring 本体 |
| setup all 时长显著增加（kg-build LLM 腿） | 低 | 全量跑约数分钟；幂等水位使二跑秒级；verify 报告各步耗时 |
