# 子任务 C2：大厂参考架构（Genie / Cortex Analyst）+ text-to-SQL 评测基准（BIRD / Spider2.0）+ MCP 规范 SQL 能力面

调研日期：2026-10-09。方法：全部论断以 curl 实抓原文为准（HTML 去 HTML 标签后提炼），每条带 URL；抓不到的路径在文末如实标注。DB-GPT 不在本子任务范围。

## Databricks Genie

### 1. 自然语言转 SQL 的定位（2026-10 文档实况）

- Genie 是 Databricks 面向用户的 AI 数据问答体验：用户用自然语言问数据问题，Genie "selects relevant names and descriptions from annotated tables and columns to convert natural language questions to an equivalent SQL query"，返回生成的 SQL + 结果表 + 可视化；无法回答时会追问澄清（https://docs.databricks.com/aws/en/genie-agents/concepts）。
- 2026 年产品已重构为三件套（https://docs.databricks.com/aws/en/genie/）：
  - Genie One：业务用户的统一入口（发现数据资产、问答、AI/BI 仪表板、Databricks Apps，含移动端）；
  - Genie Agents：领域数据环境，数据团队配置 trusted data / metrics / business rules 供 Genie One 消费（前身 Genie Spaces）；
  - Genie Code：开发者 AI 编码助手。
  - 官方口径："Every answer is grounded in your organization's data and governed through Unity Catalog."（同上）
- Genie Agents 是 compound AI system（多组件组合而非单模型）（https://docs.databricks.com/aws/en/genie-agents/concepts）。

### 2. 语义模型：旧 YAML 已退役，现行等价物是 Knowledge store + serialized_space

- 重要考古结论：任务书预设的 `docs.databricks.com/en/genie/semantic-models` 页面 404；全站 sitemap（https://docs.databricks.com/sitemap.xml）中 genie 路径下已无 semantic-model 页面；GitHub 仓 `databricks/genie-semantic-model-examples` 整仓 404（尝试路径见文末）。即 2023-2025 时代的 "Genie semantic model YAML"（手工 YAML 上传到 space）已被新架构取代。
- 现行语义配置分两层：
  - a) Knowledge store（agent 级语义定义，作用域限于该 agent、不污染 Unity Catalog 元数据）：表/列描述、列同义词（synonyms）、join relationships、SQL expressions（filters / measures / fields，各自带 display_name + synonyms）、prompt matching settings；上限 200 snippets（instructions、example SQL、SQL functions、column descriptions 不占额度）（https://docs.databricks.com/aws/en/genie-agents/tune-quality）。
  - b) Instructions / Example SQL / Trusted assets / Benchmarks：instructions 是纯文本业务规则；example SQL 供检索式 few-shot；trusted assets = 参数化 example query 与 SQL 函数（作者验证过逻辑），命中时给 "verified answer"；benchmarks 是仅供评估的测试题集，明确"不进入 Genie 上下文"（https://docs.databricks.com/aws/en/genie-agents/concepts、https://docs.databricks.com/aws/en/genie-agents/tune-quality）。
- API 视角的完整结构（新版 "semantic model" 的 JSON 等价物）：`POST /api/2.0/genie/spaces` 的 `serialized_space` 字段包含：`config.sample_questions`、`data_sources.tables[]`（identifier + description + `column_configs[]`：`get_example_values` / `build_value_dictionary` / `enable_format_assistance` / `enable_entity_matching`）、`data_sources.metric_views[]`、`instructions.text_instructions[]`、`instructions.example_question_sqls[]`（可带 `parameters[]`：name/type_hint/description/default_value）、`instructions.sql_functions[]`、`instructions.join_specs[]`（含 `--rt=FROM_RELATIONSHIP_TYPE_MANY_TO_ONE--` 基数注释）、`instructions.sql_snippets{filters,expressions,measures}`、`benchmarks.questions[]`（question + 期望 SQL）（https://docs.databricks.com/aws/en/genie-agents/conversation-api）。
- 语义层长期资产另由 uc-semantics（metric views）承担（https://docs.databricks.com/aws/en/uc-semantics/metric-views/）。

### 3. 监控与反馈机制（用户可标记错误答案）

- 每条回答都有 "Is this correct?" 三态反馈：Yes（确认准确）；Fix it（标记错误，选常见问题或自填原因，可 "Submit and try again" 带反馈重试）；Request review（转人工复核，作者在监控页确认/纠正）。官方明确：仅靠用户反馈不会自动改变 agent 行为，反馈用于定位改进点（https://docs.databricks.com/aws/en/genie-agents/monitor）。
- 回答级操作：Copy CSV（约 1GB 上限）、Show code（查看生成的 SQL）、Add as instruction（把该问答固化为 example SQL）、Add as benchmark（固化为评测题）、Regenerate（https://docs.databricks.com/aws/en/genie-agents/monitor）。
- 质量自检：Inspect（Public Preview）会为初始 SQL 再写小验证语句核对过滤值/日期窗口/join/聚合，发现问题则生成改进 SQL 并对比择优（https://docs.databricks.com/aws/en/genie-agents/concepts）。
- 学习闭环：作者 thumbs-up 或下载结果时 Genie 分析该查询，自动建议新的 measures/filters/joins 进 knowledge store（"knowledge mining"）（https://docs.databricks.com/aws/en/genie-agents/tune-quality）。

### 4. REST API 供 agent/程序接入

- Conversation API（异步轮询模型）：创建 agent `POST /api/2.0/genie/spaces`；会话增删 `GET/DELETE /api/2.0/genie/spaces/{space_id}/conversations[/{conversation_id}]`；官方轮询规范：1-5 秒间隔 + 指数退避（上限 1 分钟），10 分钟未出结论按超时处理；认证走 OAuth U2M（有人）或 service principal M2M（无人）（https://docs.databricks.com/aws/en/genie-agents/conversation-api）。
- Agent mode 也有独立 API（多步研究式问答的程序化入口）（https://docs.databricks.com/aws/en/genie-agents/concepts）。

### 5. 对第三方 agent 暴露的边界：官方 MCP server

- Genie One MCP server（经 Unity Gateway 下发 URL）：暴露 5 个 tool——`genie_ask`（提问，返回 conversation_id/response_id/status）、`genie_poll_response`（轮询进度与最终答案）、`genie_get_query_result`（取完整 SQL 结果含列 schema 与行）、`genie_cancel_response`、`view_ask`（MCP Apps 客户端的交互式变体）；推荐 on-behalf-of 用户 OAuth，也支持 service principal；`system.ai.genie_one_mcp` 策略可管控（https://docs.databricks.com/aws/en/agents/mcp-tools/genie-mcp）。
- 边界要点（同页）：UC 权限每次请求强制执行（结果按用户可见范围裁剪）；`genie_ask`/`genie_poll_response` 返回截断结果以保护模型上下文窗口，需要全量再调 `genie_get_query_result`；可传 `warehouse_id`；MCP App 扩展可在客户端内嵌交互式 View（进度、可视化、最终答案）。
- 数据访问双凭证模型：SQL 在作者嵌入的 compute credentials 上跑，但数据权限按终端用户身份由 UC 评估（row filters / column masks 自动生效，query history 归因到终端用户）——第三方 agent 拿不到超出该用户权限的任何数据（https://docs.databricks.com/aws/en/genie-agents/concepts）。

## Snowflake Cortex Analyst

### 1. Semantic model specification（现行 = semantic views，YAML）

- 2026 年官方推荐 semantic views：schema 级对象，接 RBAC / sharing / metadata catalog；旧版 stage 上的 semantic model YAML 文件仅向后兼容保留，managed MCP 只认 semantic views（https://docs.snowflake.com/en/user-guide/views-semantic/semantic-view-yaml-spec、https://docs.snowflake.com/en/user-guide/snowflake-cortex/cortex-agents-mcp）。
- YAML 结构（https://docs.snowflake.com/en/user-guide/views-semantic/semantic-view-yaml-spec）：
  - 顶层：`name`、`description`、`max_staleness`（物化新鲜度）、`tags`。
  - `tables[]`（逻辑表）：`base_table`（database/schema/table 或 `definition:` SQL 查询）、`primary_key`/`unique_keys`、`dimensions[]`（synonyms/expr/data_type/`cortex_search_service`+`is_enum`/labels/tags）、`time_dimensions[]`、`facts[]`（含 `access_modifier: public_access|private_access`）、表级 `metrics[]`（`non_additive_dimensions`、`using_relationships`）、`filters[]`。
  - `relationships[]`：left/right_table + `relationship_columns[]`，join 类型支持 equality / `asof` / `range`（start/end_column）。
  - `variables[]`（参数化语义视图）、视图级 `metrics[]`（跨表 derived metrics）。
  - `verified_queries[]`：`name` / `question` / `verified_at`（UNIX 秒）/ `verified_by` / `use_as_onboarding_question` / `sql`（SQL 必须用逻辑表/逻辑列名，不是底层物理名）。
  - `custom_instructions`（legacy）与 `module_custom_instructions`（`sql_generation` / `question_categorization` 两模块）。
  - 创建途径：YAML + `SYSTEM$CREATE_SEMANTIC_VIEW_FROM_YAML` 存储过程，或 DDL。
- Verified Query Repository（VQR）：verified queries 是提升准确度与可信度的核心机制，Cortex Analyst 回答相似问题时复用仓库中的 SQL（https://docs.snowflake.com/en/user-guide/views-semantic/verified-query-repository）。

### 2. REST API 端点

- `POST /api/v2/cortex/analyst/message`（https://docs.snowflake.com/en/user-guide/snowflake-cortex/cortex-analyst/rest-api）：
  - 请求：`messages[]`（最后一条 `role: user`，`content[].type: text`）；语义模型三选一指定——stage 文件路径 `semantic_model_file`、请求体内联 `semantic_model`、多模型 `semantic_models[]`（多模型时 Analyst 自选最合适的一个，响应带 `semantic_model_selection`）；`stream: true` 走 SSE 流式；鉴权 `Authorization` + `X-Snowflake-Authorization-Token-Type`（默认 OAuth）。
  - 响应：`message.role: analyst`，`content[].type` 三种互斥——`text` / `suggestion`（问题歧义无法出 SQL 时的澄清建议）/ `sql`（`statement` + `confidence.verified_query_used`：命中 VQR 时返回其 name/question/sql，否则 null）。

### 3. Agentic 集成：官方 managed MCP server

- Snowflake managed MCP server（https://docs.snowflake.com/en/user-guide/snowflake-cortex/cortex-agents-mcp）：统一 tool 发现与调用 + RBAC 治理；tool 类型五种：`CORTEX_AGENT_RUN`（Cortex Agent 编排）、`CORTEX_SEARCH_SERVICE_QUERY`、`CORTEX_ANALYST_MESSAGE`（NL→SQL 生成）、`SYSTEM_EXECUTE_SQL`（直连 SQL 执行）、`GENERIC`（UDF/存储过程）。
- 官方治理建议（同页）：面向受治理业务问答时，推荐把 Cortex Agent 作为 MCP server 上唯一 client-facing tool（由 agent 内部编排 Analyst/Search/自定义工具）；`SYSTEM_EXECUTE_SQL` 若与 agent 同 server 暴露会绕过 semantic views / verified queries / 编排，需要时应单列一个最小权限 MCP server；工具权限最小化（server 访问权 ≠ 工具访问权）；防递归循环（外部 client→agent 工具→另一 MCP server→回到 agent），平台强制最大递归深度 10；主机名用连字符不用下划线；警惕第三方 server 的 tool poisoning / tool shadowing。

### 4. 错误反馈与评估机制

- Cortex Analyst evaluations（https://docs.snowflake.com/en/user-guide/snowflake-cortex/cortex-analyst-evaluations）：以 semantic view 自己的 verified queries 为 ground truth；执行生成的 SQL 与 VQ 结果比对算准确率；跟踪回归指标（以前对、现在错的 VQ）与延迟。关键防泄漏设计：被选为评测的 VQ 会从"临时拷贝的 semantic view"中移除再生成 SQL，防止评估题泄漏进上下文（"A verified query can either guide Cortex Analyst at runtime or be used as evaluation ground truth, but not both at the same time"）。
- 评估可经 Snowsight UI 或 SQL 函数 `EXECUTE_AI_EVALUATION`（START/STATUS/CANCEL/DELETE）驱动；SQL 正确性判分器有 v1/v2/v3 版本可选（同上）。
- 页首官方提示：推荐向 Cortex Agents 迁移（覆盖 Analyst 全能力且答案质量更高）（同上）。

## BIRD / Spider2.0

### 1. BIRD 考核点

- 规模：12,751 个去重 question-SQL 对、95 个大库共 33.4 GB、37+ 专业领域（区块链、冰球、医疗、教育等）（https://bird-bench.github.io/）。
- 三大设计动机（同上）：① parser 需要外部知识（external knowledge / schema linking）；② 需要对"脏值"（dirty values）做推理（真实库中不一致/有噪声的字符串值）；③ 执行效率计入考核（效率指标 R-VES，Reward-based Valid Efficiency Score，2024-08-04 起为正式效率指标）（同上）。
- 2025-2026 演进线（同上）：BIRD-Interact（ICLR 2026 Oral，交互式澄清，GPT-5 (Med) 在 c-Interact 仅 8.67% SR）；BIRD-CRITIC 1.0（SQL 调试/issue 修复任务，顶尖模型全是 reasoning 型）；LiveSQLBench-Large-v1（约 1K 列、单库约 54 表、平均 84K prompt tokens、Business Rule Drift——外部知识会随版本漂移甚至矛盾）；SWE-SQL（NeurIPS 2025，SQL agent 调试训练配方）；SHARE（ACL Main，自我纠偏：把 SQL 转成程序化步骤 + on-policy 多 agent 微调，缓解 self-enhancement bias）。
- 榜单证据（EX，Test，2026-10 快照，https://bird-bench.github.io/）：GrainSQL 82.95%、DataGallery-Text2SQL（华为）82.39%、SiriusAI-SQL（腾讯）82.28%、AskData + GPT-4o（AT&T）81.95%——前四名全部勾选 Oracle Knowledge（外部知识供给）；人类基线：有 oracle 92.96%、无 oracle 72.37%。量化结论：高质量外部知识/语义注入约值 10-20 个百分点，且榜首方法尚未追平"有知识的人类"。

### 2. Spider2.0 考核点

- 定位：632 个真实企业级 text-to-SQL workflow 问题；库源自真实数据应用，常超 1,000 列（复杂场景 >3,000 列），存放于 BigQuery / Snowflake 等云数仓；要求多 SQL、多操作（转换+分析）、单条 SQL 常超 100 行（https://spider2-sql.github.io/）。
- 难度锚点（同上）：o1-preview 仅解 17.1%，GPT-4o 仅 10.1%（对比其在 Spider 1.0 的 86.6%）。
- 三个 setting（同上）：Spider2.0-Snow（547 例，全 Snowflake，免费额度）；Spider2.0-Lite（547 例：BigQuery 214 / Snowflake 198 / SQLite 135，自包含）；Spider2.0-DBT（68 例，代码 agent 任务，DBT + DuckDB，输出为 CSV 文件而非 SQL，2025-05-22 起取代原 Spider2 setting）。
- 公平性规则（同上）：2025-04-20 起提供 ground-truth tables 加速评测，但必须标注 "using oracle tables"；官方不建议用 Gold SQL 做 SFT（会破坏评测公平并高估能力），其定位是帮助设计 prompt。
- 榜单证据（2026-10 快照，同上）：Spider2-Snow 榜首 Genloop's Sentinel Agent v2 Pro 96.70、Native mini 96.53、QUVI-3 + Gemini-3-pro-preview 94.15；Spider2-DBT 榜首 SignalPilot Agent 65.6、Databao（JetBrains）60.29、GPT-5 系 agent 约 40。量化结论：单方言受控环境（Snow）已接近饱和，而项目级/代码 agent 型任务（DBT）仍有 30+ 点空间——瓶颈从"写对 SQL"转移到"在项目级多文件上下文里找对表、理解方言与工程约定"。

### 3. 对工程实践的启示（以上证据的综合）

- Schema linking 是第一杠杆：BIRD 榜首清一色 Oracle Knowledge、人类对照 92.96 vs 72.37；Spider2 提供 oracle tables 但强制标注。落地做法 = Databricks/ Snowflake 的语义层（knowledge store / semantic views + synonyms + verified queries），而不是把全量 schema 塞 prompt。
- 脏值与枚举值治理：BIRD 专设 dirty value 考核；Genie 的 `build_value_dictionary`/`get_example_values`、Cortex 的 `cortex_search_service` + `is_enum` + `sample_values` 都是为"值级 grounding"设计的通道。
- Error feedback loop 有量化证据：SHARE（程序化 SQL 表示 + on-policy 多 agent 微调缓解自我纠偏偏置）、BIRD-Interact（交互澄清让前沿模型可靠性显著提升）、两家大厂产品都内置 Fix it/Request review→知识沉淀（Add as instruction；VQ 评估回归防护）。
- Few-shot 选择应检索式而非全量：Genie "intelligently selects relevant examples from the agent's query library"；VQR 命中以 confidence 字段显式回报。
- 评测防泄漏是硬要求：Cortex Analyst 评估时移除被测 VQ；Spider2 警告 Gold SQL 不可 SFT；自建评估集要复用同一纪律。
- 多方言与企业上下文：Spider2 证明 BigQuery/Snowflake 方言 + 项目级上下文是真实瓶颈；生产系统应把方言特性与工程约定（如 fiscal calendar、join 基数）写进语义层（Genie join_specs 的 `--rt=FROM_RELATIONSHIP_TYPE_MANY_TO_ONE--`、Cortex relationships 的 asof/range）。

## MCP 规范 SQL 能力面

### 1. Server 三能力（规范原文口径）

- resources：server 向 client 暴露"为语言模型提供上下文的数据"，官方例证第一项就是 "files, database schemas"，URI 唯一标识，application-driven（由宿主应用决定如何纳入上下文），支持 resource templates（参数化 URI）与订阅变更（https://modelcontextprotocol.io/specification/2026-07-28/server/resources；concept 版重定向自 /docs/concepts/resources）。
- tools：模型可调用的函数，官方例证即 "querying databases, calling APIs"；2025-03-26 起有 tool annotations（read-only / destructive 等行为标注）；2025-06-18 起支持结构化输出（outputSchema）；tool 结果可携带 resource links（https://modelcontextprotocol.io/specification/2026-07-28/server/tools）。
- prompts：可复用 prompt 模板，user-controlled（用户显式选择，典型形态是 slash command），支持参数与 listChanged（https://modelcontextprotocol.io/specification/2025-06-18/server/prompts）。
- 架构：Host（AI 应用）为每个 server 建一个 Client；数据层 JSON-RPC 2.0（tools/resources/prompts 原语），传输层 STDIO（本地、单 client）/ Streamable HTTP（远程、多 client）（https://modelcontextprotocol.io/docs/2026-07-28/learn/architecture）。

### 2. SQL 类 server 的行业惯例分布（2026-10 实况）

- 官方 servers 仓已收敛：活跃参考实现仅 7 个——Everything（测试综合）、Fetch、Filesystem、Git、Memory、Sequential Thinking、Time；SQL 类的 SQLite（"Database interaction and business intelligence capabilities"）与 PostgreSQL（"Read-only database access with schema inspection"）均已移入 archived 仓（servers-archived），Brave Search/GitHub/GitLab/GDrive/GMaps/Puppeteer/Redis/Sentry/Slack/AWS KB/EverArt 同批归档；官方 README 明示 server 清单的正式场所已转为 MCP Registry（https://registry.modelcontextprotocol.io/），本仓只保留 steering group 维护的少量参考实现（https://cdn.jsdelivr.net/gh/modelcontextprotocol/servers@main/README.md）。
- 惯例归纳（以归档 SQLite/PostgreSQL server 与两家云厂 managed server 为证据）：tool 承载动作面（query/execute、list_tables、schema 描述；PostgreSQL 归档实现即"只读 + schema inspection"，SQLite 实现即"交互 + BI"）；resource 承载受控只读上下文（schema 文档——规范原文把 database schemas 列为 resource 首选例证）；prompt 承载分析模板（规范定位 user-controlled 模板）。归档的 SQLite server 历史上即以 resource 暴露 schema、以 tool 暴露 read_query/write_query/list_tables/describe-table（仓 README 对其的定位描述可佐证该分工，实现细节以 archived 仓为准，本任务未展开）。
- 趋势判断（证据同上）：通用 SQL MCP server 从官方参考集退场，治理型平台原生 MCP 补位——Databricks Genie One MCP（5 工具 + UC 每请求权限 + 结果截断护上下文）与 Snowflake managed MCP server（5 类 tool + RBAC per-tool + 递归深度限制 + "agent 作为唯一 client-facing tool" 官方建议）。两家都把"语义层 + verified queries + 权限"内化为 server 侧治理，而不是裸 SQL 直通。

### 3. Spec 版本要点

- 2025-03-26（相对 2024-11-05）：OAuth 2.1 授权框架；HTTP+SSE 传输替换为 Streamable HTTP；引入 JSON-RPC batching；tool annotations（read-only/destructive）；audio 内容类型；completions capability（https://modelcontextprotocol.io/specification/2025-03-26/changelog）。
- 2025-06-18（相对 2025-03-26）：移除 JSON-RPC batching；结构化 tool 输出；MCP server 定位为 OAuth Resource Servers（protected resource metadata 发现授权服务器）；client 必须实现 RFC 8707 Resource Indicators 防 token 盗用；elicitation（server 反向向用户要补充信息）；tool 结果内 resource links；HTTP 后续请求须带 MCP-Protocol-Version 头；Lifecycle Operation 由 SHOULD 升 MUST（https://modelcontextprotocol.io/specification/2025-06-18/changelog）。
- 现行最新版本为 2026-07-28（concepts 页自动重定向至该版；GitHub README 的 schema 路径为 schema/2026-07-28/schema.ts，https://raw.githubusercontent.com/modelcontextprotocol/modelcontextprotocol/main/README.md）；2026-07-28 相对 2025-06-18 的增量未在本任务展开（未抓其 changelog）。
- 官方 SDK 十种：C#/Go/Java/Kotlin/PHP/Python/Ruby/Rust/Swift/TypeScript（https://cdn.jsdelivr.net/gh/modelcontextprotocol/servers@main/README.md）。

## 来源 URL

### Databricks（docs.databricks.com，en 全部重定向至 /aws/en/）
- https://docs.databricks.com/en/genie/index.html → 200（终态 https://docs.databricks.com/aws/en/genie）
- https://docs.databricks.com/aws/en/genie-agents/concepts
- https://docs.databricks.com/aws/en/genie-agents/set-up
- https://docs.databricks.com/aws/en/genie-agents/tune-quality
- https://docs.databricks.com/aws/en/genie-agents/monitor
- https://docs.databricks.com/aws/en/genie-agents/conversation-api
- https://docs.databricks.com/aws/en/agents/mcp-tools/genie-mcp
- https://docs.databricks.com/sitemap.xml（semantic-model 路径检索依据）
- https://docs.databricks.com/aws/en/uc-semantics/metric-views/（语义层长期资产佐证）

### Snowflake（docs.snowflake.com）
- https://docs.snowflake.com/en/user-guide/snowflake-cortex/cortex-analyst
- https://docs.snowflake.com/en/user-guide/snowflake-cortex/cortex-analyst/rest-api
- https://docs.snowflake.com/en/user-guide/views-semantic/semantic-view-yaml-spec
- https://docs.snowflake.com/en/user-guide/views-semantic/verified-query-repository
- https://docs.snowflake.com/en/user-guide/snowflake-cortex/cortex-analyst-evaluations
- https://docs.snowflake.com/en/user-guide/snowflake-cortex/cortex-agents-mcp
- https://docs.snowflake.com/en/user-guide/snowflake-cortex/cortex-analyst/tutorials/tutorial-1（抓取成功，正文未逐条展开）

### 评测基准
- https://bird-bench.github.io/
- https://spider2-sql.github.io/

### MCP
- https://modelcontextprotocol.io/docs/concepts/architecture → 200（终态 /docs/2026-07-28/learn/architecture）
- https://modelcontextprotocol.io/docs/concepts/tools → 200（终态 /specification/2026-07-28/server/tools）
- https://modelcontextprotocol.io/docs/concepts/resources → 200（终态 /specification/2026-07-28/server/resources）
- https://modelcontextprotocol.io/specification/2025-06-18/server/prompts
- https://modelcontextprotocol.io/specification/2025-03-26 与 /specification/2025-06-18（主 spec 页）
- https://modelcontextprotocol.io/specification/2025-03-26/changelog、/specification/2025-06-18/changelog
- https://raw.githubusercontent.com/modelcontextprotocol/modelcontextprotocol/main/README.md
- https://cdn.jsdelivr.net/gh/modelcontextprotocol/servers@main/README.md

### 尝试过但失败的路径（如实记录）
- https://docs.databricks.com/en/genie/semantic-models 与 /aws/en/genie/semantic-models → 404（semantic-model 文档页已不存在）
- https://cdn.jsdelivr.net/gh/databricks/genie-semantic-model-examples@main/README.md → 404
- https://raw.githubusercontent.com/databricks/genie-semantic-model-examples/main/README.md 与 /master/ → 均 404
- https://github.com/databricks/genie-semantic-model-examples（HTML 页）→ 404（整仓不存在）
- https://docs.snowflake.com/en/user-guide/snowflake-cortex/cortex-analyst-tutorial → 404（正确路径为 /tutorials/tutorial-1）
- https://spider2-sql.github.io/spider2/ → 404（正确入口为根路径）
- duckduckgo / google 搜索引擎不可达；api.github.com 限流未使用（按任务约束）
