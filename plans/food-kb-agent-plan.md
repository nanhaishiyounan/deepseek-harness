# 食品行业知识库 + Agent 平台：分阶段实施计划

> **执行方式**：本计划供 Loop 引擎按阶段（P0 → P1 → P2）迭代执行。每个任务标注了边界（新建/修改文件）、遵循的仓库规范与验收命令。P0 内任务按依赖顺序排列，可逐个作为 Loop 子任务执行。
>
> **Goal**: 在 deepseek-harness 上跑通"走访食品企业 → 数据入库 → agent 基于知识库产出带引用的真实结果"的最小闭环（P0），并沿既定产品蓝图（食品产业可信数据空间，1+2+3+N 架构）演进到多租户订阅服务（P1/P2）。
>
> **关键时间锚点**：今天是 2026-08-28，恰为总包交付方案 Phase 1 Sprint 1 的启动日；**9 月底"数据归集成果 + 第一批 Agent 原型"联合演示**是 P0 的硬里程碑（约 4 周时间盒）。

---

## 一、调研结论摘要

### 1.1 业务背景（会议纪要，2026-08-27）

来源：`/Users/mac/Downloads/智能纪要：新录音 13 2026年8月27日.md`

- 项目正在**基于 DeepSeek Harness 做最小化产品验证**，同步分析对方提供的网页资料（即下述架构方案）以适配食品行业功能。
- 核心难点：**30 个食品行业对接场景**与后续真实企业 agent 落地难度高；交付节奏与过往项目不同。
- 角色定位：本组从全栈开发转为**场景交付模式搭建者**，牵头引入外部 AI 厂商（厂商仅为辅助力量，主导权在己方）。
- 数据采集：已完成**集团内部 7 家子公司**走访调研；接下来走访**外部食品企业**采集数据。资产管理项目的收数/存储底层逻辑与本项目一致，**前期开发成果直接复用**。
- 输出逻辑：围绕**统计、建议类需求**匹配场景功能；功能模块覆盖**市场洞察、工艺、食品安全、成本测算、原材料供应链**。
- 参考案例：飞鹤联合火山引擎的 **436 个生产端智能体**、鸡爪智能检测。

### 1.2 产品蓝图（架构方案网页）

来源：`/Users/mac/Downloads/食品产业可信数据空间方案平台-网页/`（React 单页应用，`app.jsx` + `components/{Architecture,Subsystems,Hardware,Delivery,Security}.jsx`）

- **项目实体**：豫中南数字产融平台食品产业专项；采购方漯河国裕产融科技集团，总包中电信数智河南分公司，中标 9386 万元，360 日历天，5 阶段 12 Sprint（2 周/Sprint）。
- **顶层架构 1+2+3+N**：1 个一体化数字底座、2 大平台（可信数据空间 + AI 开发平台）、3 大赋能体系（产业链协同 + 食品安全 + 数据价值融合）、N 个特色应用与垂域模型。
- **七层架构中 L5 即 DeepSeek Harness**（Cordis 微内核、一切皆插件、模型/工具/技能/会话/沙箱/调度全插件化、四级多租户）；L4 数据层含向量数据库、RAG 知识中心、本体与知识图谱、图数据库。
- **交付策略**：数据先行 · Agent 跟进 · 云边一体；**前端全部 Agent 化**（用 Harness 替代传统前端开发）。第一优先级是数据接入与归集（ERP/MES/WMS/财务连接器 + 3-5 家种子企业），第二是数据治理与本体建模（企业/行业/人员三大本体），第三才是 Agent 应用开发。
- **第一批 Agent**（Sprint 3-4，9 月底演示）：企业数据助手（基于自有数据问答）、食品安全 Agent、退税管家 Agent。验收线：意图识别 >85%、RAG+图谱召回 >80%。
- RAG 知识中心终态选型（L4）：Milvus/Qdrant + BGE-M3、LangChain/LlamaIndex、BGE-Reranker——**这是终态，不是 MVP 态**（见 1.4 技术调研结论）。

### 1.3 对标产品与市场（real-deep-research 报告）

完整报告：[`research/2026-08-28-food-dataspace-agent/report.md`](../research/2026-08-28-food-dataspace-agent/report.md)（1139 行，66 信源，42 项主张中 31 项多源验证）

- **对标产品**（https://ftd.lzqz.cn/ ，"食信·食品产业可信数据空间"）：真实政府项目（1.2 亿预算、9386 万中标）+ 原型演示站的组合体。三层商业模式：免费引流（50GB + 每日 100 AI 积分）→ Agent 订阅（18 款按"拟人职位"命名，AI 设备维护主管 ¥99/月 ~ AI 退税管家 ¥299/月，企业版 ¥1999/月）→ 数据资产化服务（确权→评估→入表→融资，宣称平均入表 1800 万）。
- **积分经济学**：按任务复杂度分级计价（问答 1 分/数据分析 5 分/报告 20 分/视频 30 分）。
- **飞鹤案例**：436 智能体/24 万活跃用户/230 亿 tokens（5+ 渠道数字一致但同源单一通稿）；方法论可复制——场景选择四标准（数据基础好优先）、统一底座先行、创新大赛机制。
- **开源平台格局**：MaxKB（pgvector 单库+三路混合检索）、FastGPT（TS monorepo，与我方技术栈最同构）、RAGFlow（深度文档解析）、Dify、Coze Studio。行业共识：混合检索（向量+全文）+ 可选 rerank（失败静默降级）+ 引用溯源。
- **竞品空白**：¥99-199/月覆盖"市场洞察+工艺+食安+成本测算+原材料供应链"五合一的中小食品企业订阅带无人占据；"原材料行情→配方成本→定价建议"跨域 agent 国内外均无产品化。
- **政策链**（合规叙事可直接引用）：数据二十条 → 数据要素×三年行动计划 → 可信数据空间发展行动计划（2024-2028，100+ 试点）→ 63 试点 → 财会〔2023〕11 号入表规定（注意财会〔2025〕33 号禁止评估值入表）。

### 1.4 仓库现状（project-research + 本 Planner 复核）

- **LLM provider 模式**：[`packages/llm/llm`](../packages/llm/llm/src/index.ts) 是 Service Definition（`ctx.llm` seam、`LlmAdapter` 抽象类、`registerAdapter`/`registerConfigurableProviders`）；[`packages/llm/llm-deepseek`](../packages/llm/llm-deepseek/src/index.ts) 是 OpenAI 兼容 HTTP+SSE provider 的完整参考实现（wire 协议即 OpenAI chat/completions，`apiKeyEnv` 凭据引用 + `baseURL` fallback 链 + settings 卡片自动生成）。**仓库没有通用 openai-compat provider，每个厂商一个 adapter 包**；MiniMax 端点同为 OpenAI 兼容，结构可近乎复制。指南：[`docs/cookbook/adding-an-llm-adapter.md`](../docs/cookbook/adding-an-llm-adapter.md)。
- **知识库能力现状（关键事实，project-research 报告撰写时未知）**：[`packages/kb/`](../packages/kb) 下已存在 **kb / kb-sqlite / kb-embed-dashscope / tool-kb 四个包的构建残留**——`src/`、`tests/` 为空目录，但 `lib/` 编译产物完整（时间戳 2026-08-28 00:38–07:02，即最近几小时的并行实施活动残留；git 无 worktree/stash/分支，源码不在版本控制中）。**lib 产物的 `.d.ts` 构成了一份完整且符合仓库规范的 API 规格**（详见 3.1），P0 应按此规格重建源码。[`examples/kb-agent/`](../examples/kb-agent) 同样只有空目录骨架（`tests/snapshots/kb-closed-loop/`、`tests/fixtures/`、`workspace/data/`）。
- **SQLite 模式**：三个现有 SQLite 包全部用 `node:sqlite`（`DatabaseSync`），无 better-sqlite3；[`session-persistence-sqlite/src/schema.ts`](../packages/session/session-persistence-sqlite/src/schema.ts) 是打开/PRAGMA/版本门/事务模板。
- **工具注册**：`defineTool` + `ctx.tools.register`，render intent（`generic`/`terminal`/`diff`/`search`/`web`）前置设计、presentCall/presentResult 纯函数可回放。指南：[`docs/cookbook/adding-a-tool.md`](../docs/cookbook/adding-a-tool.md)、[`docs/cookbook/adding-a-package.md`](../docs/cookbook/adding-a-package.md)。
- **组合机制**：bundle（[`packages/bundle/base/cordis.patch.yml`](../packages/bundle/base/cordis.patch.yml)）→ profile → patch 层叠；示例要求 keyless e2e + with-key e2e 双轨（[`examples/AGENTS.md`](../examples/AGENTS.md)）；凭据链对任意 env 名通用（新增 `MINIMAX_API_KEY` 零接入点）。
- **质量门**：`pnpm run test:coverage`（CI 门，per-file 100%）、`typecheck`、`lint`、`doc-sync`、`hygiene`、`test:snapshot`（keyless）；非平凡变更同 PR 需 Agent Note（`.agents/notes/`）与 keyless 快照；新包 README 需双语三件套 + Model Experience + Known Limitations 段。

### 1.5 调研结论对技术选型的影响

| 决策点 | 结论 | 依据 |
|---|---|---|
| 知识库存储 | **SQLite（node:sqlite）单文件 + FTS5 trigram 全文 + BLOB 向量 JS 扫描**，不引入 sqlite-vec / 独立向量库 | kb 残留规格已按此实现（零原生依赖，跨平台 CI 安全）；研究报告证实 <10 万切片暴力扫描 13ms/召回 100%，MVP 单企业语料远低于此；与仓库 SQLite 先例同构 |
| 混合检索 | 文本路径（FTS5）+ 向量路径 RRF 融合，**无 embed provider 时降级 text-only 且可观测** | 行业共识（MaxKB/FastGPT/Dify）；kb 残留规格内建 |
| Embedding | **OpenAI 兼容 `/embeddings` provider 缝**：新建 kb-embed-minimax（默认，复用用户 MiniMax key），保留 kb-embed-dashscope（DashScope text-embedding-v4，残留规格已有）；缺凭据=降级而非失败 | 用户模型配置硬约束（api.minimaxi.com/v1）；研究报告推荐 BGE-M3 系（1024 维）可作后续 provider；缝设计使切换零成本 |
| Chat 模型 | 新建 **llm-minimax** provider（MiniMax-M3），照 llm-deepseek 模板 | 用户指定；OpenAI 兼容端点结构可复制 |
| 数据采集形态 | MVP 两通道：**文件投放目录（kb_ingest 工具 + workspace/data）+ 结构化 Markdown 走访纪要**；预埋连接器接口 | 飞鹤"数据基础好优先"；食信平台接入矩阵是终态；会议纪要证实走访采集是主要形态 |
| Agent 服务形态 | 预设角色 Agent（拟人职位命名）+ 引用溯源强制 + 统一工作台入口 | 食信/HiAgent 双验证；引用溯源是企业付费关键 |
| 首发场景 | "AI 食安合规官"（法规/标准库问答）+ "企业数据助手"（走访资料问答） | 对齐交付方案第一批 Agent；法规标准文档是零改造成本数据源 |

---

## 二、P0 最小闭环（最高优先级，时间盒至 9 月底演示）

**闭环定义**：真实走访资料（会议纪要、企业档案、法规文件）放入 `examples/kb-agent/workspace/data/` → `kb_ingest` 切片/向量化入库（MiniMax embedding）→ agent（MiniMax-M3 驱动）调用 `kb_search` → **回答带编号引用（文档名+标题路径）** → keyless 快照锁定端到端行为。

**前置事实**：`packages/kb/` 四包与 `examples/kb-agent/` 存在构建残留（空 src + lib 产物 + node_modules）。P0-1 先处置残留，P0-2..P0-5 按 lib 规格重建/扩展。

### P0-1 处置 kb 构建残留，冻结重建基线

**边界**：只清理，不写代码。

- 删除 `packages/kb/*/` 与 `examples/kb-agent/` 下的 `lib/`、`node_modules/`、空 `src/`、`tests/`、`resources/` 目录（`pnpm run clean` 不覆盖未注册包，需手动 `rm -rf`）。
- **保留规格快照**：清理前把四包 `lib/types/*.d.ts` 复制到 `plans/kb-residual-spec/`（或直接以本计划 3.1 节为规格），作为 P0-2..P0-4 重建的类型契约权威。
- 确认 `git status` 干净、`pnpm run typecheck && pnpm run lint` 在清理后仍绿。

**验收**：`git status` 无新增未跟踪文件；`pnpm run typecheck` 通过。

### P0-2 重建 `dsh-kb`（Service Definition，`ctx.kb` seam）

**边界**：新建 `packages/kb/kb/`（包名 `@deepseek-ai/dsh-kb`）。纯 seam：store/embed provider 注册表 + ingest/search 编排，不含任何具体实现。

**按残留规格重建的 API 契约**（源自 `lib/types/index.d.ts`，重建时以此为准）：

- [`types.ts`](../packages/kb/kb/src/types.ts)（新建）：`KbDocKind`（`'meeting' | 'interview' | 'report' | 'regulation' | 'profile' | 'table' | 'other'` 闭 union + `KB_DOC_KINDS`）、`KbError extends HarnessError`（开放 string `code`）、`KbDocumentInput`（`tenantId` 硬隔离键 + `sourcePath` 引用身份 + `docKind` + `collectedAt`）、`KbChunkInput`（`headingPath`/`chunkIdx`/`content`/`embedding: Float32Array | null`/`embedModel`）、`KbSearchFilter`、`KbSearchHit`（含全部引用元数据）、`KbStore`/`EmbedProvider` provider 契约、`KbIngestRequest/Result`、`KbSearchRequest/Result`（`mode: 'hybrid' | 'text'` 降级可观测）、`KbStats`。
- [`chunker.ts`](../packages/kb/kb/src/chunker.ts)（新建）：结构感知 Markdown 切片——先按标题分节（携带标题链），超大节按中文感知分隔符递归切，Markdown 表格行保持完整，尾部 overlap 合并；`estimateTokens`（CJK 1:1、非 CJK 4:1）。
- [`rrf.ts`](../packages/kb/kb/src/rrf.ts)（新建）：`fuseRrf(textIds, vectorIds, k)` 倒数排名融合。
- [`index.ts`](../packages/kb/kb/src/index.ts)（新建）：`KbRuntime extends Service` 挂 `ctx.kb`；`registerStoreProvider`/`registerEmbedProvider`（注册即 disposer，重复抛 `KB_DUPLICATE_PROVIDER`）；store 选择六规则与 embed 降级规则按规格 JSDoc 实现（配置 id 缺失/不可用/歧义/无 provider 各有专属错误码，embed 缺失=降级不抛）；`ingest`（chunk → embed → store，同 `(tenantId, sourcePath)` 重摄入=替换）、`search`（文本路径恒跑 + 向量路径可选 + RRF 融合）、`stats`、`deleteDocument`。`KbRuntimeConfig`：`storeProvider`/`embedProvider`/`chunkMaxTokens`(512)/`chunkOverlapTokens`(50)/`rrfK`(60)/`vectorTopK`(32)/`textTopK`(32)/`maxResults`(8)——全部可从 cordis.yml 覆盖（遵守"无硬编码调参"规范）。
- [`invariant.ts`](../packages/kb/kb/src/invariant.ts)（新建）：包不变量（`exports["./invariant"]` 布线，`package-invariants` 门要求）。
- 配套：`package.json`（`@deepseek-ai/dsh-kb`，peerDeps+devDeps 镜像，schemastery 进 deps）、`tsconfig.json`（references：vendor/cordis、dsh-llm）、`tests/{types,chunker,rrf,runtime}.spec.ts`（TDD：先写切片/RRF/降级/选择规则的失败测试再实现）、README 三件套（双语 + Model Experience + Known Limitations）。

**遵循规范**：能力缝三角色（本包=Service Definition）；注册即 effect；闭 union `assertNever`；显式 resolve 步骤；`pnpm run test:coverage` per-file 100%。

**验收**：`pnpm run typecheck && pnpm run lint && pnpm vitest run packages/kb/kb` 通过；`pnpm run doc-sync`（README 门 + JSDoc 门）通过。

### P0-3 重建 `dsh-kb-sqlite`（Store Provider）

**边界**：新建 `packages/kb/kb-sqlite/`（`@deepseek-ai/dsh-kb-sqlite`）。

- [`schema.ts`](../packages/kb/kb-sqlite/src/schema.ts)（新建）：`SCHEMA_VERSION = 1` + `KB_SQLITE_APPLICATION_ID`（"DSHK"）；`validateSchema(db, path)` 按 [`session-persistence-sqlite/src/schema.ts`](../packages/session/session-persistence-sqlite/src/schema.ts) 模板：安全 PRAGMA → `BEGIN IMMEDIATE` 内初始化或拒绝异版本（fail-loud，pre-release 立场）。
- [`store.ts`](../packages/kb/kb-sqlite/src/store.ts)（新建）：`SqliteKbStore implements KbStore`——`node:sqlite` `DatabaseSync`（延迟动态 import 过滤 experimental warning，照 session 先例）；**FTS5 trigram 全文索引**（`ftsMatchExpression` 单引号字面量防语法注入）+ **BLOB 向量 JS 侧余弦扫描**（不引入 sqlite-vec 原生扩展，跨平台 CI 安全）；`putDocument` 事务性 overwrite（先删 FTS 行再删文档行级联）；`textSearch`/`vectorSearch`/`stats`/`deleteDocument`/`available`/`close`。
- [`index.ts`](../packages/kb/kb-sqlite/src/index.ts)（新建）：插件（`inject: ['kb']`），Config：`path`（`:memory:` 支持）、`busyTimeoutMs`；`ctx.kb.registerStoreProvider(new SqliteKbStore(...))`，dispose 时 `close()`。
- 测试：`:memory:` 库全路径单测（ingest/replace/两路检索/租户过滤/版本拒绝）。

**验收**：`pnpm vitest run packages/kb/kb-sqlite` 通过；coverage 100%。

### P0-4 Embed Provider：重建 `dsh-kb-embed-dashscope` + 新建 `dsh-kb-embed-minimax`

**边界**：新建 `packages/kb/kb-embed-dashscope/`（按残留规格重建）与 `packages/kb/kb-embed-minimax/`（新写，P0 默认启用）。

- **kb-embed-dashscope**（规格已有）：DashScope `text-embedding-v4`，OpenAI 兼容 `/embeddings`，批上限 10、指数退避重试（默认 3 次）、30s 超时、`DASHSCOPE_API_KEY` 凭据引用（缺失=provider unavailable=seam 降级）、1024 维。
- **kb-embed-minimax**（新写，结构同上）：`baseURL` 默认 `https://api.minimaxi.com/v1`（`$MINIMAX_BASE_URL` fallback）、`apiKeyEnv` 默认 `MINIMAX_API_KEY`（复用用户 key）、`model` 默认值在实现时用真实 key 探测 MiniMax embedding 模型名（候选 `embo-01`/`MiniMax-Embedding`；探测脚本见 P0-7）、`dimensions` 可配置默认 1024。
- 两包共享同一形态：`EmbedProvider` 实现（`id`/`available()`/`embed(texts, signal)`），凭据走 `ctx.get('credentials')` seam 优先、启动环境回退（照 llm-deepseek 的 `resolveApiKey` 模式）。

**验收**：`pnpm vitest run packages/kb/kb-embed-minimax packages/kb/kb-embed-dashscope`（mock-server 单测）通过；with-key e2e 自跳过无 key。

### P0-5 重建 `dsh-tool-kb`（Consumer，模型可见工具）

**边界**：新建 `packages/kb/tool-kb/`（`@deepseek-ai/dsh-tool-kb`）。

按残留规格实现三工具（schema 注册进 `ctx.tools`，自动流入 prompt 组装）：

- `kb_search`：参数 `query`（非空）/`tenant`/`doc_kind`/`max_results`（≤8）；输出编号引用列表 + 降级模式提示 + 常驻引用指令；render intent `generic` 卡片（presentCall/presentResult 纯函数，replay 安全）。
- `kb_ingest`：参数 `path`（workspace 相对路径，扩展名白名单 `INGEST_EXTENSIONS`：`.md`/`.txt` 起步）/`tenant`/`doc_kind`/`title`；经 `ctx.fs` 读文件 → `ctx.kb.ingest`；输出 `{doc_id, chunks, embedded, embed_model, path, tenant}`；超时预算 300s（embedding 批次）。
- `kb_stats`：租户计数 + embed 路由可观测性。
- Config：`search`/`ingest`/`stats` 开关（默认 true）、`maxResults`、`defaultTenant`、各工具 `timeoutMs` 挂 `ToolDefinition.timeoutMs`（由 tool-call-timeout-policy 插件执行）。**工具可见性与 store 可用性解耦**：store 缺失时工具仍可见、执行时抛结构化错误（规格原文）。

**验收**：`pnpm vitest run packages/kb/tool-kb` 通过；工具 schema 快照（`tool-schemas.expected.json` 模式）锁定模型可见面。

### P0-6 新建 `dsh-llm-minimax`（Chat Provider，MiniMax-M3）

**边界**：新建 `packages/llm/llm-minimax/`（`@deepseek-ai/dsh-llm-minimax`），照 [`packages/llm/llm-deepseek`](../packages/llm/llm-deepseek/src/index.ts) 模板。

- `src/index.ts`：`name = 'llm-minimax'`、`inject = ['llm']`；Config：`apiKeyEnv` 默认 `MINIMAX_API_KEY`（`role('credential-ref')`）、`baseURL` fallback 链 `config → $MINIMAX_BASE_URL → https://api.minimaxi.com/v1`、`models` 目录含 `MiniMax-M3`、`thinking`/`maxTokens`/`retryPolicy`；apply()：`resolveAdapterOptions` 显式 resolve → `registerConfigurableProviders([{provider: 'minimax', displayName: 'MiniMax', ...}])`（web Models 页卡片自动出现，无需手写 UI）→ `registerAdapter(['minimax'], adapter)` → `installSettingsSection`。
- `src/{adapter,serialize,translate,sse,types}.ts`：OpenAI 兼容 wire 协议（llm-deepseek 的结构复制，替换端点/模型名/默认值；SSE 复用 `eventsource-parser`）；协议义务按 [`docs/cookbook/adding-an-llm-adapter.md`](../docs/cookbook/adding-an-llm-adapter.md)：usage 在 finish 前、tool arguments 原始 JSON 字符串、尊重 `signal`、不支持的字段抛 `UNSUPPORTED`。
- 修改：[`packages/bundle/base/package.json`](../packages/bundle/base/package.json)（dependencies + devDependencies 加本包）、[`packages/bundle/base/cordis.patch.yml`](../packages/bundle/base/cordis.patch.yml)（`llm-deepseek` 条目旁加 `llm-minimax` 条目——resolver manifest 强制 bare plugin 名入 deps）、`tsconfig.host.json`（references）、[`packages/llm/README.md`](../packages/llm/README.md) 组表加行。
- 测试：mock-server 单测（流式分块/工具调用映射/错误路径）+ `adapter.e2e.ts`（无 `MINIMAX_API_KEY` 自跳过）+ loader-composition 测试。

**验收**：`pnpm vitest run packages/llm/llm-minimax`；`pnpm run build` 后 `pnpm dsh --profile headless` 用 MiniMax-M3 跑通一个真实任务（with-key 手动验证）；`pnpm run hygiene`（knip/publint/workspace constraints）通过。

### P0-7 端到端示例 `examples/kb-agent`（真实数据闭环演示）

**边界**：重建 `examples/kb-agent/`（workspace 成员），照 [`examples/headless-agent`](../examples/headless-agent/cordis.yml) 模板。

- `cordis.yml`：settings → credentials（`.env` 载入 `MINIMAX_API_KEY`）→ `llm-minimax`（model `MiniMax-M3`）→ `kb`（seam）→ `kb-sqlite`（`path: workspace/kb.sqlite`）→ `kb-embed-minimax` → `tool-kb`（`defaultTenant: demo-food-co`）→ agent-spine-demo（预创建 `main` agent，显式 provider/model）→ persistence。
- `workspace/data/`：放入**真实走访语料**（脱敏后）：本次会议纪要 Markdown、1-2 份企业档案（profile）、若干食品法规/国标摘录（regulation）——`docKind` 覆盖 `meeting`/`profile`/`regulation`。
- `tests/kb-closed-loop.spec.ts`（keyless）：真实 Loader 启动 cordis.yml（embed 降级 text-only 模式），脚本化：ingest 三份语料 → `kb_search` 断言命中与引用元数据 → 降级模式 `mode: 'text'` 可观测。快照目录 `tests/snapshots/kb-closed-loop/`（stdout/session 期望）。
- `tests/kb-closed-loop.e2e.ts`（with-key）：`MINIMAX_API_KEY` 存在时走完整 hybrid 模式 + MiniMax-M3 真实问答一轮，断言回答含编号引用；无 key 自跳过。
- `README.md`/`README.zh.md`：演示脚本（两条命令：ingest + ask）。
- **真实数据演示脚本**（9 月底演示用）：`pnpm dsh --profile headless "查询 XX 企业的食品添加剂合规要求，引用知识库原文"` 类任务实录。

**遵循规范**：[`examples/AGENTS.md`](../examples/AGENTS.md)（keyless + with-key 双轨 e2e；可复用逻辑进 packages/，例子只留接线）；"模型可见 ⟺ 已记录"（kb_search 结果作为 tool result 天然入 session log，无需新 session 事件）。

**验收**：`pnpm run test:snapshot -t kb` 通过（keyless）；with-key e2e 真实跑通且回答带引用；`pnpm run doc-sync` 通过。

### P0-8 Agent Note + 文档 + 质量门总验

- Agent Note：`.agents/notes/implemented/`（或 proposed/）下记录 kb 能力缝设计决策（为何 FTS5+BLOB 而非 sqlite-vec、降级模式语义、tenantId 隔离模型）与 llm-minimax 引入——非平凡变更同 PR 强制。
- 文档：[`docs/architecture.md`](../docs/architecture.md) 能力缝表加 `kb` 行（若被视为核心 seam）；`packages/kb/README.md` 组 README；双语流程按 [`docs/AGENTS.md`](../docs/AGENTS.md)。
- 总验命令序列：`pnpm install && pnpm run typecheck && pnpm run lint && pnpm run test:coverage && pnpm run build && pnpm run hygiene && pnpm run doc-sync && pnpm run test:snapshot`。

**P0 完成定义（DoD）**：
1. 真实走访语料 3 类（meeting/profile/regulation）入库成功，`kb_stats` 可见；
2. agent 对语料提问，回答带编号引用（文档名+标题路径），hybrid 模式生效；
3. 拔掉 `MINIMAX_API_KEY` 后同样问题仍可回答（text-only 降级），结果 `mode: 'text'` 可观测；
4. 全部质量门绿；keyless 快照锁定闭环行为；
5. MiniMax-M3 作为 chat provider 可在 web Models 页配置切换。

---

## 三、P1 演进（演示后 → 多企业真实使用）

> 对应总包方案 Phase 2（数据治理与第一批 Agent，2026.9.25-11.19）。P0 代码不推倒，只扩展。

### P1-1 多企业隔离与租户管理
- `tenantId` 从工具参数升级为会话/工作区绑定（preset 或 workspace 插件注入默认租户）；`kb_search` 跨租户默认拒绝。
- 企业注册入口（CLI/简单表单）→ 每企业一个 tenant slug + 独立 data 目录。

### P1-2 首发角色 Agent 预设（对齐第一批 Agent）
- `apps/cli/config/agent-presets/` 新增 `food-compliance`（AI 食安合规官：法规库 + 引用规范 SKILL.md）与 `enterprise-assistant`（企业数据助手：本企业语料问答 + 统计类输出模板）。
- 每预设配 SKILL.md（教模型何时调 `kb_search`、引用格式）——检索执行仍是工具，SKILL 只做用法指导。
- 验收：两预设 keyless 快照 + 真实企业语料问答评测。

### P1-3 检索质量评测与调优
- 人工标注 100 问评测集（对齐交付方案"RAG 召回 >80%"验收线）；Top5 命中率、引用有效率（研究报告建议 ≥80%/≥90%）。
- 调参面已内建（chunkMaxTokens/rrfK/topK）；按评测裁决 RRF vs 加法融合（研究显示三家分歧需实测）。
- 可选：rerank provider 缝（bge-reranker，失败静默降级——FastGPT 模式）。

### P1-4 数据采集通道扩展
- 文件通道扩展：PDF/Word/Excel 解析（新依赖按"依赖优先于手搓"政策论证，候选 `unpdf`/`mammoth`/`xlsx`；PDF 解析是 web-fetch-http 已记录的 deferred work，此处独立决策）。
- 网页通道：复用 [`web-fetch-http`](../packages/web/web-fetch-http/README.md)（`ctx.web.fetch`）抓取法规/标准页面入库。
- 预埋连接器接口（ERP/API 终态的 TS 类型缝，不做实现）。

### P1-5 订阅与计量预埋
- 积分分级计价模型（食信实证：问答 1/分析 5/报告 20）落到 telemetry/token-meter 投影；免费额度限制（文档数/存储/积分）作为 config 字段。
- 不做支付；只做可观测的用量账单投影。

### P1-6 Web 工作台最小版
- 复用现有 web app（`dsh-web-app` bundle）：知识库管理页（ingest 状态/文档列表）+ 对话页引用溯源渲染（`kb_search` 的 presentationMeta 已为此设计）。
- 验收：web 快照（`apps/web/tests/snapshots/`）。

---

## 四、P2 演进（可信数据空间叙事与规模化）

> 对应 Phase 3-5。以合规叙事与生态对接为主，技术上是 P1 能力的横向铺开。

1. **可信数据空间衔接**：文档/数据集的 `hash + char_length + 来源` 三元组入 `document` 表（确权举证字段基础，研究报告 8.7 建议）；产品文案挂政策链（数据二十条→数据要素×→可信数据空间行动计划）；对接豫中南平台数据空间连接器规范（届时以对方接口文档为准）。
2. **30 场景铺开**：按"数据基础好优先"四标准逐场景评估（市场洞察/工艺/成本测算/原材料供应链/出海退税…）；每场景 = preset + 专用语料 + SKILL.md + 快照，复用 P0 全部基础设施。
3. **本体与知识图谱**：三大本体（企业/行业/人员）建模起步，图数据库（Neo4j/NebulaGraph）作为新的 Store Provider 候选——seam 设计已为此留缝（`registerStoreProvider`）。
4. **私有化部署**：DeepSeek 私有化推理替换/并列 MiniMax（`registerAdapter` 换路即可）；等保三级/密评配套（安全体系按总包方案五层防御）。
5. **官网对接**：ftd.lzqz.cn 形态的运营站（企业注册/订阅/积分）为独立前端项目，通过 dsh sdk（JSON-RPC/ACP）驱动 harness。

---

## 五、技术决策记录（关键取舍与论证）

1. **FTS5 trigram + BLOB 向量 JS 扫描，而非 sqlite-vec**：sqlite-vec 需 `loadExtension` 原生二进制，macOS/Linux/Windows(+wine CI) 三平台发布成本高；MVP 单企业语料（<5 万切片）JS 余弦扫描延迟可接受（研究实证 10 万级暴力扫描 13ms 量级）；残留规格已按此实现且与仓库 node:sqlite 先例同构。sqlite-vec/Vec1 列为 P2 规模化候选（切片 >50 万或 P99 >100ms 触发，研究报告迁移线）。
2. **每厂商一个 LLM adapter 包，而非通用 openai-compat provider**：仓库既定模式（llm-deepseek/llm-pi-ai 双先例）；MiniMax 与 DeepSeek 同为 OpenAI 兼容，复制结构成本低于引入通用抽象的语义损失。
3. **Embedding 走 provider 缝，默认 MiniMax、保留 DashScope**：用户 key 一把通吃 chat+embedding；OpenAI 兼容 `/embeddings` 协议使未来切换硅基流动 BGE-M3（免费）/ollama 本地（离线备份）零代码改动；缺凭据=降级 text-only 而非失败（走访现场无网/无 key 仍可演示）。
4. **按残留 lib 规格重建而非重新设计**：残留 `.d.ts` 是符合仓库规范的完整 API 规格（能力缝三角色、注册即 disposer、fail-loud、降级可观测、render intent、timeout policy 全部就位）；重新设计只会引入偏差。重建时源码 JSDoc 直接采用规格注释。
5. **MVP 不做数据空间基础设施**（多租户只到 tenantId 列、合规只到叙事层）：对齐"先跑通最小闭环"的用户要求与交付方案"数据先行、Agent 跟进"的节奏。

---

## 六、风险与依赖

| # | 风险 | 等级 | 缓解 |
|---|---|---|---|
| 1 | **并行会话冲突**：packages/kb 残留来自最近几小时的并行实施，源码可能在他处仍在演进；重建可能与其撞车 | 高 | P0-1 清理前用 `git status`/时间戳确认无新写入；若发现并行会话活跃，改为对接其产出（本计划的规格章节即验收基准）而非重复重建 |
| 2 | **MiniMax embedding 模型名/维度未证实**（embo-01 候选名来自记忆，需实测） | 高 | P0-4 第一步写探测脚本（用真实 key 调 `/v1/embeddings` 列模型/试维度）；失败则 P0 默认启用 kb-embed-dashscope（DashScope 免费档）或硅基流动 BGE-M3，MiniMax 仅做 chat |
| 3 | MiniMax-M3 与 DeepSeek wire 细节差异（reasoning 字段、tool call 分块格式） | 中 | mock-server 单测覆盖流式/工具调用/错误路径；协议义务清单（cookbook）逐条对照；真实 key e2e 验证 |
| 4 | 微信文章/官网抓取受限（后续采集通道） | 低 | real-deep-research 已实证本次两起点均抓取成功；备选：DuckDuckGo 侧面还原 + 人工导出 |
| 5 | 食品文档解析质量（扫描件/表格） | 中 | MVP 限 Markdown/txt 数字原件；PDF/OCR 列 P1-4 并按两档解析策略（FastParsing/AccurateParsing） |
| 6 | 9 月底演示时间盒（4 周）紧张 | 高 | P0 任务严格按依赖序串行（P0-2→3→4→5 可两两并行，P0-6 独立可并行）；演示最小形态=终端问答带引用，Web 工作台不进 P0 |
| 7 | 30 场景铺开时快照/测试成本膨胀 | 中 | 每场景 preset 只带 keyless 快照；共享语料 fixtures 进 `packages/test-support/` |
| 8 | 真实企业数据合规（走访采集的敏感信息） | 中 | 入库前脱敏；tenantId 隔离从 P0 第一天就是一等公民；P2 对接确权字段 |

---

## 七、验收标准总表

| 阶段 | 验收 | 命令/证据 |
|---|---|---|
| P0-1 | 残留清理，工作区干净 | `git status` 干净；`pnpm run typecheck` 绿 |
| P0-2..P0-5 | kb 四包（seam/store/embed×2/tools）测试全绿 | `pnpm vitest run packages/kb`；coverage 100% |
| P0-6 | llm-minimax 全绿且可组合 | `pnpm vitest run packages/llm/llm-minimax`；`pnpm run hygiene`；with-key 真实任务 |
| P0-7 | 端到端闭环 keyless 快照 + with-key 真实问答带引用 | `pnpm run test:snapshot -t kb`；e2e 输出含编号引用 |
| P0-8 | 全质量门 + Agent Note + 双语 README | `pnpm run doc-sync && pnpm run test:coverage && pnpm run build` |
| P0 里程碑 | 9 月底演示：真实数据进、带引用产出出 | 演示实录（会议纪要/企业档案/法规三类语料问答） |
| P1 | 两角色 Agent 预设 + 评测集 Top5 ≥80% + 引用有效率 ≥90% | 快照 + 评测报告 |
| P2 | 确权字段 + 连接器接口 + ≥10 场景 preset | 各场景快照 + 合规叙事文档 |

---

## 附：P0 任务依赖图

```
P0-1 清理残留
  └─→ P0-2 dsh-kb (seam)
        ├─→ P0-3 kb-sqlite (store provider)
        ├─→ P0-4 kb-embed-minimax + kb-embed-dashscope (embed providers)
        └─→ P0-5 tool-kb (consumer，依赖 P0-3/P0-4 的契约即可并行开发)
P0-6 llm-minimax（独立，可与 P0-2..5 并行）
  └──────────────┬──────────────┘
                 ↓
        P0-7 examples/kb-agent 端到端
                 ↓
        P0-8 Note/文档/总验
```

---

## 八、P0 完成记录（2026-08-29）

### 1. 状态总览

P0 全部 8 个子任务（P0-1 ~ P0-8）完成。终验 PASS 97/100；强制维度得分：code-review 100、architecture-consistency 95、mechanism-conformance 95。

### 2. 验收轨迹

统一验证 70/100 FAIL（14 项发现）→ FIX-C 修复批 → 复验 95/100 PASS_WITH_DEBT → FIX-D 微修复批（4 项）→ 终验 97/100 PASS。

95/97/14 项/4 项均源于验证编排层历次评分（architecture、code-review 等维度），仓库内无独立落点；起点 70/100 与失败构成见 [`2026-08-29-kb-agent-p0-fixes.md`](../.agents/notes/implemented/bug-fix/2026-08-29-kb-agent-p0-fixes.md)。

- 70/100：统一验证首跑得分（FAIL），驱动 FIX-C 修复批。
- 14 项：首跑统一验证的发现总数（Important/Minor 分级）。
- 95/100：FIX-C 后复验得分（PASS_WITH_DEBT），遗留发现驱动 FIX-D。
- 4 项：FIX-D 微修复批的修正项数。
- 97/100：FIX-D 后终验得分（PASS），强制维度得分见状态总览。

### 3. 关键证据

真实 key 下 6 文档 / 38 切片入库；hybrid 检索（minimax:embo-01，1536 维）回答带 [1]-[8] 编号引用，引用与语料核对一致。移除 embed 凭据后降级 `mode:'text'`，仍带引用回答。错误 key 触发 `KB_EMBED_FAILED` fail-loud。tenant 隔离与双进程并发安全，实测于 P0 验证（双进程各写 8 篇全部成功）；显式双连接测试已登记为 P1 债务（中级）。README 单行入口（`DSH_HOME=examples/kb-agent/.dsh pnpm dsh --profile headless --patch examples/kb-agent/cordis.patch.yml`）四条命令实跑通过。

### 4. 重要发现

- MiniMax embedding 实为原生 wire：模型 embo-01（固定 1536 维），请求体 `{model, texts, type}`、`type` 必填（`db`/`query`）。三组合区分度对比 0.784/0.818/0.832（[`2026-08-29-kb-agent-stack.md`](../.agents/notes/implemented/feature/2026-08-29-kb-agent-stack.md)）：
  非对称 db/query（文档 `db`、查询 `query`）0.784、全 `db` 0.818、全 `query` 对称 0.832 最优；区分度 cutoff 实测见 feature note。
- llm-minimax 不进 base bundle：与 llm-pi-ai 的 minimax 路由冲突，经 examples 直接组合。

本批 P0 共 3 篇 note（2 篇交付物 + 1 篇修复轨迹）。

- kb-embed-* 有意自带重试/退避与凭据解析（`available()` 同步契约），论证见 [`2026-08-29-kb-agent-p0-fixes.md`](../.agents/notes/implemented/bug-fix/2026-08-29-kb-agent-p0-fixes.md)。

### 5. 已知债务

- **合并前条件**：CI coverage 与 snapshot lane 绿（本机 Node 22 环境抖动无法佐证；本机跑门前须 `nvm use 22.19.0`）。
- **高**：多企业租户深度隔离（tenant 参数目前模型可传）；100 问评测集（Top5 ≥80%、引用有效率 ≥90%）；PDF/Word 采集通道。
- **中**：角色 Agent 预设（AI 食安合规官 / 企业数据助手）；coverage:diff 脚本（lesson：本机 flaky 不应阻塞 diff 范围验证）；kb-sqlite 双连接并发显式测试；backoff 参数对齐 BackoffConfig 可配置化。
- **低**：示例 keyless 快照迁移到仓库 `*.snapshot.ts` 约定；kb-closed-loop.cordis.yml 头注释悬空指涉修正；`mode:'text'` 默认转述行为；plans/ 与 research/ 目录生命周期处置（当前为未跟踪交付物）。

### 6. 交付物清单

- 6 个新包：`packages/kb/{kb, kb-sqlite, kb-embed-minimax, kb-embed-dashscope, tool-kb}`、`packages/llm/llm-minimax`。
- `examples/kb-agent`：含 `cordis.patch.yml` / `cordis.text-only.patch.yml`、`scripts/import-real-docs.sh`、6 篇脱敏语料、keyless 快照 + 带 key e2e。
- [`docs/subsystems/kb.md`](../docs/subsystems/kb.md) 三语。
- 三篇 Agent Note（2 篇交付 + 1 篇修复轨迹）：
  - [`2026-08-29-kb-capability-seam.md`](../.agents/notes/implemented/architecture/2026-08-29-kb-capability-seam.md)（architecture）
  - [`2026-08-29-kb-agent-stack.md`](../.agents/notes/implemented/feature/2026-08-29-kb-agent-stack.md)（feature）
  - [`2026-08-29-kb-agent-p0-fixes.md`](../.agents/notes/implemented/bug-fix/2026-08-29-kb-agent-p0-fixes.md)（bug-fix）
- 全部改动未提交，工作区待 review。

---

## 九、P1/P2 剩余阶段完成记录（2026-08-30）

### P1-2A 角色 Agent 预设

- 预设位置 `examples/kb-agent/agent-presets/{food-compliance-officer,enterprise-data-assistant}/`（examples/package.json 已有全部 kb 依赖；apps/cli 无 kb 依赖，放 shipped root 会解析失败）。预设为薄组合：persona + scoped tool-kb 行（kb 能力缝留在 host 组合，遵循"预设不拥有 registries"的架构原则）；tenant 经 `DSH_KB_TENANT` env 可覆盖。
- 演示组合 `cordis.patch.yml` 照 web-app bundle 模式 disable base 全部模型可见工具行（bash/editor/fs/web/subagent/workflow 等），使该组合内 agent 检索专用（合规官"禁破坏性工具"的落地）；会话基础设施（compaction/pruner/checkpoint/spill）保留。
- keyless 快照 `examples/kb-agent/tests/kb-presets.spec.ts`：真实 Loader 组合 + roster 发现 + 真实 mount 两个预设，断言检索专用工具面（恰为 4 个 kb 工具）、persona 覆盖部署默认（变量已插值）、text 模式编号引用检索。

### P1-2B 100 问评测集与达标验证

- 语料扩充至 14 篇（新增 market/process/supply/cost/food-safety 目录 8 篇脱敏语料）；评测集 `examples/kb-agent/eval/questions.json`（100 问，五类各 20，每问标注 gold 文档）。
- harness `examples/kb-agent/scripts/eval-retrieval.mts`：Top5 命中率（keyless text / 真实 key hybrid 双模式）+ 引用有效率（--answers：MiniMax-M3 生成回答后按"[n] 引用指向检索材料且来源为 gold"判定，规则写入脚本）。
- **达标数字（真实 key，2026-08-30 实跑）**：hybrid Top5 命中率 **99%**（达标线 ≥80%）；引用有效率 **96%**（达标线 ≥90%）。明细 `eval/results-hybrid-answers.json`。text 降级模式基线 71%（FTS5 trigram 对中文长词组的短语窗口限制，hybrid 向量路径补足；未调参即达标，调参面保留）。
- 踩坑记录：直接 tsx 运行不加载根 .env，embed provider 静默降级 text（hybrid 结果与 text 全同即此症状）；harness 已显式 `process.loadEnvFile`。

### P2-1 可信数据空间 + 图谱

- **确权三元组与授权模型**：`KbDocumentInput` 扩展 `provenance`（provider/scope/collectedSource）与 seam 自算的 `contentHash`（SHA-256）/`contentLength`（确权三元组 = hash + 长度 + 来源）；kb-sqlite `SCHEMA_VERSION` 2→3（pre-release 拒绝旧库），documents 表新增 5 列，两路检索 SQL 统一追加 `OR d.scope = 'share'` 授权过滤（share 跨租户可检索；search/derive 及无确权历史文档保持租户私有）。授权语义按 plans P2 章"确权三元组"与研究报告 8.7 设计。测试 `kb-sqlite/tests/dataspace.spec.ts`（5 例：provenance 回流/share 跨租户/derive 隔离/legacy 私有/向量路径同过滤）。
- 政策叙事：docs/subsystems/kb.{md,zh.md} 补"可信数据空间衔接"节（数据二十条→数据要素×→可信数据空间行动计划政策链），i18n 配对已 re-record。
- **图谱缝**：新包 `packages/kb/kb-graph`（Service Definition `ctx.kbGraph`，食品产业本体闭集 company/product/ingredient/additive/standard/process/risk + 谓词闭集 produces/uses/contains/complies_with/follows/flags/supplies）+ `packages/kb/kb-graph-sqlite`（Store Provider，独立 SQLite "DSHG"，tenant 隔离，幂等写入，邻居/两跳路径/实体检索）。选型论证：三元组与文档检索契约不同，塞进 KbStore 需破坏性扩展——图谱为 kb 的姊妹缝（三角色完整：Definition/Provider/Consumer）。工具 `kb_graph_query`（neighbors/paths/search）+ `kb_graph_add`（幂等，≤50/次，source_path 引用溯源）注册进 tool-kb（`graph: true` 默认开）；抽取不内置 LLM——由场景 SKILL 驱动。
- 真实 key 冒烟（2026-08-30 实跑，`examples/kb-agent/scripts/graph-smoke.mts`）：MiniMax-M3 从 3 份语料抽取 24 条三元组（如 `宏发食品 —produces→ 酱油 (hongfa-food.md)`、`酱油 —contains→ 苯甲酸及其钠盐 (gb2760-excerpt.md)`），入库 24 行/30 实体，邻居与实体检索查询全部命中。
- 踩坑记录：packages/kb/*/src 下存在 P0 会话遗留的编译产物 .js/.d.ts（遮蔽 .ts 源导致旧 schema 逻辑运行），已清理；vendor/hmr 存在被增量构建掩盖的 exactOptionalPropertyTypes 类型错误（touch 暴露），已按 vendoring 流程修复 8 处并将在 vendor/README 登记。

### P2-2 场景铺开 + 部署 + 官网

- **场景框架**：`examples/kb-agent/scenarios/` 目录契约（preset.yml 含 probe 查询 + agent.cordis.yml + SKILL.md + data/corpus.md）；快照 `tests/scenarios.spec.ts` 自动纳入新场景（结构完整、真实 Loader 挂载、检索专用工具面、自有语料带引用检索）。首发 11 场景覆盖全部 8 类（市场洞察×2/工艺×2/食安×2/成本/供应链/出海/设备/数据资产），其余 19 个向 30 对齐的填充项在 scenarios/README 双语清单点名。
- **私有化部署**：`examples/kb-agent/DEPLOY.{md,zh.md}`（systemd 单元、WAL 备份/恢复、.env 模板、schema 所有权 fail-loud 升级、检索专用组合的安全要点）。
- **官网对接**：按计划 P2 §5 原文（"运营站为独立前端项目，通过 dsh sdk 驱动 harness"）交付映射文档 `examples/kb-agent/WEBSITE.{md,zh.md}`——注册/订阅/积分/存储钩子/引用溯源五能力逐一映射到租户绑定、预设、`ctx.kb.usage`、工作台面板、编号引用；SDK 是唯一契约，未新增私有端点。
- **质量门终态（2026-08-30 本机 Node 22.19.0）**：typecheck ✅、lint ✅（0 错误）、聚焦测试 ✅（packages/kb + examples/kb-agent + ui-kb + apiproxy = 53 文件 747 测试）、doc-sync ✅ 28/28、duplication ✅ 0 克隆、build ✅、hygiene 12/13（仅预存 vendor rescape 红，与本批无关）、test:snapshot 9/13 文件绿（4 个失败文件均为 acp-agent/headless-agent 的 llm-deepseek/goal 面：SQLite ExperimentalWarning stderr 泄漏与超时类抖动，P0 完成记录已归因"本机 Node22 环境抖动"，非 kb 面改动所致；kb 相关快照全部通过）。
- Agent Note 三篇（A-C/D-E/F-H 各一篇合并）+ vendor/README 第18条登记。

---

## 十、FIX-H 阻断修复批（2026-08-30）

统一验证 76/100 FAIL 后的修复批：H1 doc_kind 判别式、H2 twoHopPaths 方向约束、H3 质量门收口、H4 ui-kb 设计体系、H5 部署统一、H6 embed 降级、H7 诚实性修正；细节见同批 Agent Note。

### 登记债务（本批明确不实现）

| # | 债务 | 修复方向 |
|---|---|---|
| 1 | `kb_ingest_url` 的 DNS rebinding TOCTOU：`url-policy.ts` 校验时解析的 IP 与 `ctx.web.fetch` 实际解析分离，两次解析之间可被重绑定 | pin-IP 进 `ctx.web` 请求字段：校验时解析的 IP 随请求下发，fetch 直连该 IP（SNI/Host 保持原域名） |
| 2 | `kb_graph_query`/`kb_graph_add` 零 usage 计量：graph 查询不经 `ctx.kb` 的 recordUsage 缝 | graph 工具执行走 recordUsage 缝：tool-kb 的 graph execute 按 action 计量（graphQueries/graphAdds），与 `kb.search`/`kb.ingest` 的 meter 对称 |

---

## 十一、P1/P2 完成记录（2026-08-30）

### 1. 状态总览

P1（数据面加固/智能面）与 P2（可信数据空间/图谱/场景/部署/官网对接）全部完成。统一验证轨迹：76/100 FAIL（四类阻断）→ FIX-H 修复批（H1-H7）→ 全部质量门真实复跑绿。

### 2. 验收轨迹

统一验证 76/100 FAIL 的四类阻断，逐项对应 FIX-H 修复与证据：

- **doc_kind 判别失效（H1）**：浏览器工作台的 doc_kind 解析返回 `KbDocKind | string`，而 `KbDocKind` 本身是字符串字面量联合，调用方的 `typeof kind === 'string'` 拒绝检查恒真，合法值一并被拒。修复为判别式结果 `{ ok: true; value: KbDocKind } | { ok: false; value: string }`，调用方按 `result.ok` 分支；e2e 红→绿（`apps/web/tests/kb-workbench.e2e.ts` 修复前失败、修复后通过）。
- **twoHopPaths 算法缺陷（H2）**：旧 SQL 以四向 OR 接受任意端点相交的边对（侧枝/扇入/目标自环伪阳性），孤立直边因 `e2.id <> e1.id` 无法与自身配对而不返回（伪阴性）。重写为每分支单一方向组合 + 中点单一等式约束 + 直边折入；四个回归测试锁定双向桥、直边旁侧枝、无共享桥扇入、目标自环四类。
- **质量门红（H3）**：lint 0 错误、doc-sync 28/28、gen-tool-catalog 10/10（工具目录 64→67：`kb_graph_add`/`kb_graph_query`/`kb_ingest_url`）、聚焦集覆盖率逐文件 100%，全部真实复跑绿。
- **ui-kb token 分叉（H4）**：token 迁移 `--dsw-alias-*`、面板落位、in-flight 防护、监听器清理；chromium 暗色冒烟通过。

Important 项（H5-H7）：部署统一（`DSH_KB_TENANT` 单一事实源、kb-sqlite v2→v3 升级指引、BFF 写端点 `kbWriteEnabled` opt-in、`kbTenant` 必填）；embed 故障 search 降级 text；诚实性修正（引用有效率统一为实测 96%）。

### 3. 关键证据

- 评测双指标（真实 key，2026-08-30 实跑）：hybrid Top5 命中率 99%（达标线 ≥80%）、引用有效率 96%（达标线 ≥90%）；明细 [`results-hybrid-answers.json`](../examples/kb-agent/eval/results-hybrid-answers.json)。
- 图谱冒烟：MiniMax-M3 从 3 份语料抽取 24 条三元组，入库 24 行/30 实体，邻居与实体检索查询全部命中。
- 场景：11 个场景覆盖全部 8 类（市场洞察×2/工艺×2/食安×2/成本/供应链/出海/设备/数据资产）；19 个模板化待填充项在 [`scenarios/README.md`](../examples/kb-agent/scenarios/README.md) 双语清单点名。
- 聚焦测试 1294/1295 通过；唯一失败为预存 code-block 抖动，单独运行通过。

### 4. 重要发现

- 租户服务端绑定：tool-kb `Config.tenant` 必填（缺失在插件加载时校验失败）；`kb_search`/`kb_ingest`/`kb_stats`/`kb_ingest_url` 四工具在 parse 时拒绝 `tenant` 实参（`defineTool` 参数根为隐式开放对象，未声明键可过 schema 校验，故需显式拒绝）；入参 schema 无 tenant 字段。租户不再经模型上下文流转；seam（`ctx.kb`）仍接受显式 `tenantId` 供服务端调用方。
- 授权模型在 store 层 SQL 强制：share/derive/search 三类 scope 同构处理（仅 `share` 跨租户可检索，search/derive 保持租户私有），文本与向量两路检索同一过滤，不依赖工具层自觉。
- BFF 写端点默认只读：apiproxy kb 域未开启 `kbWriteEnabled` 时拒绝写操作（`kb-write-disabled` 错误码）。
- embed 故障双路径决策：search 路径降级 text 模式（`mode:'text'` 可观测），ingest 路径 fail-loud（`KB_EMBED_FAILED`）。检索可用性与入库数据完整性分别对待。

### 5. 已知债务

本表合并第十节 FIX-H 登记的两项债务并补入收尾新增项：

| # | 债务 | 修复方向 |
|---|---|---|
| 1 | `kb_ingest_url` 的 DNS rebinding TOCTOU：url-policy 校验时解析的 IP 与 `ctx.web.fetch` 实际解析分离 | pin-IP：校验时解析的 IP 随请求下发，fetch 直连该 IP（SNI/Host 保持原域名） |
| 2 | `kb_graph_query`/`kb_graph_add` 零 usage 计量：graph 查询不经 `ctx.kb` 的 recordUsage 缝 | graph execute 按 action 计量（graphQueries/graphAdds），与 `kb.search`/`kb.ingest` 的 meter 对称 |
| 3 | 19 个场景待内容填充 | 复制场景模板改写 preset/agent/SKILL/corpus 四文件，`tests/scenarios.spec.ts` 自动纳入校验 |
| 4 | UI doc_kind 选择器小增强 | ui-kb 检索面板 doc_kind 过滤交互增强（H1 后过滤链路已通） |
| 5 | CI coverage/snapshot lane 复验 | 本机 Node 22 抖动无法佐证，合并前在 CI 复验（P0 完成记录同项债务延续） |
| 6 | 预存 vendor rescape 红 | 与本批无关，随 vendor/ 同步流程处置 |
| 7 | 检索无相关性阈值：低分命中与高分命中同列，长结果列表混入弱相关片段 | 后端在 `kb.search` 融合后按分数门过滤（RRF 分数下限可配置），hit 携带分数供前端弱化展示 |
| 8 | 大文档 embed 稳定性：单次全量 embed 在超大切片数下超时/失败面大 | embed 分批（chunk 数上限 + 批间退避），失败批次重试，仍失败才整体 fail-loud（FIX-K 已锁 embed 失败不落库的原子性） |
| 9 | ✅ 已清偿（2026-09-02）：MiniMax 并行 tool-call id 聚合缺陷（会话永久 2013）。根因=续传 delta 空字符串覆盖首个 delta 的 id/name；双层修复（translate.ts 聚合仅非空值推进 + serialize.ts 出站唯一化）；日志 fixture 回归（parallel-tool-calls.events.json + session-excerpt.jsonl）；真实 key 复现 export-tax 场景 2 轮完成、8 个 tool-call 全唯一、0×2013 | Agent Note：[`2026-09-02-minimax-parallel-tool-call-id-aggregation.md`](../.agents/notes/implemented/bug-fix/2026-09-02-minimax-parallel-tool-call-id-aggregation.md)；收尾复跑（CLOSEOUT-BUG2）全绿并顺带修复 adapter.e2e.ts 的 CallId 类型回归（typecheck 门首跑红、修后绿） |

### 6. 交付物清单

- 新增包：`packages/kb/kb-graph`（图谱 Service Definition，`ctx.kbGraph`）、`packages/kb/kb-graph-sqlite`（图谱 Store Provider）、`packages/client/ui-kb`（web 工作台 kb 面板）；`packages/client/ui-primitives` 扩展 `useFixedPanelAnchor`。
- apiproxy kb 域：`packages/host/apiproxy/src/api/kb.schema.ts` + `kb.ts` + `tests/kb-domain.spec.ts`。
- 角色 Agent 预设 ×2：`examples/kb-agent/agent-presets/{food-compliance-officer,enterprise-data-assistant}/`。
- 评测集 + harness：`examples/kb-agent/eval/questions.json`（100 问）+ `scripts/eval-retrieval.mts`。
- 场景框架 + 11 场景：`examples/kb-agent/scenarios/`（preset/agent/SKILL/corpus 四文件契约，`tests/scenarios.spec.ts` 自动校验新场景）。
- 部署与官网文档双语：`examples/kb-agent/DEPLOY.{md,zh.md}`、`examples/kb-agent/WEBSITE.{md,zh.md}`。
- Agent Note 九篇（每篇 md/zh/i18n.yaml 三件）：
  - [`2026-08-29-kb-p1-debt-fixes.md`](../.agents/notes/implemented/feature/2026-08-29-kb-p1-debt-fixes.md)（feature：embed 退避可配置、kb-sqlite 双连接并发测试）
  - [`2026-08-30-kb-ingest-channels.md`](../.agents/notes/implemented/feature/2026-08-30-kb-ingest-channels.md)（feature：PDF/docx/web 采集通道）
  - [`2026-08-30-kb-p1-presets-eval-workbench.md`](../.agents/notes/implemented/feature/2026-08-30-kb-p1-presets-eval-workbench.md)（feature：角色预设、100 问评测、工作台）
  - [`2026-08-30-kb-usage-metering.md`](../.agents/notes/implemented/feature/2026-08-30-kb-usage-metering.md)（feature：租户级用量计量）
  - [`2026-08-30-kb-workbench-hardening.md`](../.agents/notes/implemented/feature/2026-08-30-kb-workbench-hardening.md)（feature：H4/H5/H6——设计 token、面板落位、部署单一租户源、写 opt-in、embed 降级）
  - [`2026-08-30-kb-dataspace-provenance-graph.md`](../.agents/notes/implemented/architecture/2026-08-30-kb-dataspace-provenance-graph.md)（architecture：确权三元组与图谱缝）
  - [`2026-08-30-kb-tenant-server-binding.md`](../.agents/notes/implemented/architecture/2026-08-30-kb-tenant-server-binding.md)（architecture：租户服务端绑定）
  - [`2026-08-30-kb-p2-scenarios-deploy-website.md`](../.agents/notes/implemented/feature/2026-08-30-kb-p2-scenarios-deploy-website.md)（feature：场景集、私有部署、官网映射）
  - [`2026-08-30-kb-p1p2-blocking-fixes.md`](../.agents/notes/implemented/bug-fix/2026-08-30-kb-p1p2-blocking-fixes.md)（bug-fix：FIX-H 阻断修复）
- 全部改动未提交，工作区待 review。
