# 第 6 章 LLM 工具调用面：把湖仓暴露给 agent

本章回答调研问题 6：schema introspection（information_schema / Iceberg REST metadata）→ text-to-SQL → 只读执行（只读用户/资源限额/超时）→ 结果回填会话的行业实践；agent + lakehouse 的现成参考架构。本章含 5 处对任务书预设假设的**修正性负发现**（6.6 节）。过程取证文件：`subtask-a-wrenai-mcp-ecosystem.md`、`subtask-b-vanna-deep-dive.md`、`subtask-c2-bigtech-benchmarks-mcp-spec.md`、`subtask-d-readonly-defense-layers.md`（本归档目录下）。

## 6.1 WrenAI —— 多许可 + MCP 一等支持（Apache-2.0 可整用）

**License（颠覆常识）[Critical]**：github.com/Canner/WrenAI（17,832★/2,041 forks，Python+Rust，pushed 2026-10-09 当日活跃）。根 LICENSE 是**多许可概述**：`core/**`、`sdk/**`、`skills/**`、`examples/**`、根文件 = **Apache-2.0**；`docs/**` = CC BY 4.0；**AGPL-3.0 全文仅为"未来模块"预置，当前零路径映射**——"WrenAI=AGPL"的说法与 main 分支现状不符（浏览器直读与 raw 实抓双重印证）。商标归 Canner；open-core 商业边界 = 行列级安全、GenBI UI/云端。

**架构（已重构）[Critical]**：main 分支为 CLI+引擎形态——`core/wren-core`（Rust 语义引擎，基于 Apache DataFusion）+ `wren-core-py`（PyPI: wren-core）+ `wren-core-wasm`（npm: wren-core-wasm）+ `wren`（Python SDK/CLI，PyPI: wrenai）+ `wren-mdl`（MDL JSON Schema——**业务语义定义入 Git 的载体**）。四层：Agent workflow(skills) → Project context(MDL/instructions/profiles/memory) → Planning engine(sqlglot CTE rewrite + wren-core) → Execution(22+ connectors)。旧 Docker 多容器版（wren-ui/ai-service/ibis-server/qdrant）冻结在 legacy/v1 分支（2026-05-07 wren-engine 并入 core/）。

**MCP 官方一等支持 [Critical]**：`pip install 'wrenai[mcp]'` → `wren serve mcp`（默认 stdio；`--transport http` 走 Streamable HTTP 但无鉴权，官方明示 keep it local）。引擎 in-process（无独立 ibis-server）。**16 工具 + 5 资源**：Query 组 `run_sql` / `dry_run` / `dry_plan` / `query_cube`；Schema 组 `get_mdl` / `list_models` / `describe_model` / `list_functions` 等；Knowledge 组 `get_instructions` / `recall_queries` 等；写工具 `store_query` 需 `--allow-write` 默认关。资源 `wren://mdl` 等 5 个；连接 secrets 不跨 MCP 边界。（来源：docs.getwren.ai/oss/guides/mcp——docs.wren.ai 已不可达 000）

**对 dsh 借鉴**：可整用作 MCP sidecar（Apache-2.0 无障碍）；其 dry_run/dry_plan 与 knowledge(recall_queries) 工具设计、MDL JSON Schema 均可直接抄。

## 6.2 Vanna —— MIT + prompt 模板金矿（含克隆审计）

**基本盘 [Critical]**：github.com/vanna-ai/vanna，23,825★，**MIT 三方证实**，Python，pushed 2026-02-02（**8 个月未更新**——引用时须注意）。**版本分裂是第一事实**：main 已是 **2.0.2 完全重写**（Agent-based、tools、enricher、SSE server），经典 0.x train/RAG 代码整体在 `src/vanna/legacy/`。

**Agentic RAG 模式（0.x 经典）[Critical]**：三类训练数据 = **DDL / documentation / question-SQL 对**，存 ChromaDB **三个独立 collection**（id = 内容哈希 + `-sql/-ddl/-doc` 后缀，天然去重，top-k 默认 10）；`train()` 五参分派（question+sql 时可 LLM 反向生成 question）。向量库可插拔：官方列 11 个（ChromaDB/FAISS/PgVector/Pinecone/Milvus/Qdrant/Weaviate/AzureSearch/Opensearch/Marqo/Oracle），**chromadb 非默认依赖**（仅 optional extra，核心依赖仅 10 项）。v2 另有 29 个 integrations。

**REST 服务 [Critical]**：v2 = Flask/FastAPI 双实现（`/api/vanna/v2/chat_sse|chat_websocket|chat_poll`）；legacy `/api/v0/*` 22 条 route（generate_sql/train/run_sql/fix_sql/get_training_data 等）。**无官方 npm SDK**（registry.npmjs.org/vanna 404）；TS 资产仅主仓 frontends/webcomponent/（Lit 3 Web Component，`<vanna-chat sse-endpoint>` CDN 分发）。**TS 集成代价**：复用库本体则 Python sidecar 不可避免；但 prompt 拼接逻辑百行内可 TS 重写，真正依赖面在向量检索与 SQL 执行（可自选 pgvector / Chroma HTTP API）。

**克隆审计可复用资产 [Critical]**（`sources/vanna/src/vanna/`）：
- `legacy/base/base.py`：L535-549/L551-568/L570-584 三段拼接函数（`===Tables` / `===Additional Context` / `===Question-SQL Pairs` 分隔符协议 + max_tokens 逐条预算）；**L586-658 `get_sql_prompt` 全模板**（6 条 Response Guidelines 原文可直译）；L93-160 generate_sql + **intermediate_sql 二次回填**；L238 `is_sql_valid`（sqlparse SELECT 白名单——TS 移植首选抄这段）；L1807-1860 `train()` 五参分派；**L1882-1936 `get_training_plan_generic`**（INFORMATION_SCHEMA.COLUMNS → 按表 markdown 文档的自动语义化——introspection 压缩的现成配方）。
- `legacy/chromadb/chromadb_vector.py`：L45-100 三 collection 组织 + `deterministic_uuid(内容)-{sql,ddl,doc}` 内容寻址 id（天然幂等去重——dsh 训练数据落 PG/向量库可复用此 id 策略）。
- `components/rich/data/dataframe.py`：L20 `max_rows_displayed=100` / `page_size=25` 展示层截断先例。
- 2.x 结构情报：`servers/{flask,fastapi}` + `core/{agent,enricher,evaluation,audit}` + `frontends/webcomponent`——展示"LLM×向量库多继承"如何演化为"Agent+tools+enricher"。

## 6.3 DB-GPT —— MIT（修正假设），平台型过重

**[Critical]** github.com/eosphoros-ai/DB-GPT：**MIT——修正任务书 Apache-2.0 假设**（README badge + "Licence: The MIT License (MIT)" 双证据）。定位 "Open-Source Agentic AI Data Assistant"：连数据库/CSV/仓库/知识库、AI 自主写 SQL、代码驱动分析、sandbox 执行、图表/报告；平台含 agents + **AWEL（Agentic Workflow Expression Language）** + RAG + multi-model。**资源重量级：中量**——`pip install dbgpt-app` 单命令（默认含 CLI/FastAPI/Agent/OpenAI 兼容 LLM/ChromaDB），`dbgpt start` 起 Web UI :5670；无需本地模型；vLLM/llama.cpp/Docker 为进阶。对 dsh：整体过重（Python 平台型），借鉴 AWEL 编排思想与 ChatData 场景设计即可。三篇 arXiv（2312.17449 架构 / 2412.13520 ROMAS 多 agent）。stars 数因限流未获得（如实标注）。

## 6.4 引擎 MCP server 生态清单（2026-10-09 实抓）

| 目标 | 首选 | 证据要点 |
|---|---|---|
| Doris | **apache/doris-mcp-server**（Apache 官方，351★，Apache-2.0，push 2026-10-01） | v1.0.0，MCP 2026-07-28 协议，stdio + Streamable HTTP GA，"8 域 55 能力"，**read-only 定位**；另有 morningman/mcp-doris(15★ 停更19个月)、selectdb/doris-new-mcp(6★) |
| Trino | 无官方；社区 **tuannvm/mcp-trino**（121★，MIT，Go，push 2026-07-01） | OAuth2.1/JWT、Docker 镜像；alaturqua Python 版 25★ |
| DuckDB 云版 | **motherduckdb/mcp-server-motherduck**（527★，MIT，push 2026-10-07） | **npm @motherduck/mcp-server-motherduck 404——实际走 PyPI/uvx**；支持 `:memory:`/本地路径/`md:`、read-only 模式 |
| DuckDB 本地 | 社区 ktanaka101/mcp-server-duckdb（179★，停更17个月）+ **teaguesterling/duckdb_mcp**（66★，**扩展形态** `LOAD 'duckdb_mcp'`，push 2026-10-06 活跃） | 后者双向：既是 server 又可作 client 查外部 MCP |
| 通用 | **FreePeak/db-mcp-server**（435★，MIT，push 2026-09-24） | 任务书所指 minitragonia/db-mcp-server **未证实存在**（raw 双分支 404 + 搜索首屏无此仓） |
| 官方收录 | modelcontextprotocol/servers 仅 7 个参考实现 | **PostgreSQL/SQLite 均已归档**；Doris/Trino/DuckDB 零收录；生态由引擎厂商 + 社区承担；正式清单转 registry.modelcontextprotocol.io |

**MCP 规范结论性要点 [Critical]**：resources = 受控只读上下文（**规范原文把 "database schemas" 列为 resource 首选例证**，支持参数化 template 与订阅）；tools = 模型可调动作（2025-03-26 起有 `read-only`/`destructive` **annotations**、2025-06-18 起结构化输出 outputSchema 与 resource links）；prompts = user-controlled 模板。趋势：**通用 SQL server 从官方参考集退场，治理型平台原生 MCP（权限+语义层+verified queries 内化到 server 侧）补位**——dsh 的湖仓工具面应走同样路线而非裸 SQL 直通。

## 6.5 只读安全边界四层防御（原文级语法证据）

**用户级 [Critical]**：MySQL `GRANT SELECT ON world.* TO 'role3'` + `read_only` / `super_read_only`（后者连 CREATE FUNCTION/INSTALL PLUGIN 也禁，是正确的兜底选择）；Doris `GRANT SELECT_PRIV ON ctl.db.tbl`（三段式粒度）；StarRocks `GRANT SELECT ON ALL TABLES IN DATABASE db`；DuckDB `ATTACH 'file.db' (READ_ONLY)`。

**会话级 [Critical]**：MySQL `max_execution_time`（**毫秒、仅只读 SELECT**，超时 ER_QUERY_TIMEOUT 3024，非只读 3025 主动停计时器）；**Doris `query_timeout` 默认 900s + `exec_mem_limit` 默认 100G（FE 源码 SessionVariable.java 原文）**；StarRocks `SET query_timeout` 默认 14400s + `/*+ SET_VAR(query_timeout=1) */` 语句级 hint + `ALTER USER ... SET PROPERTIES ('session.query_timeout'='600')` 按用户默认；DuckDB `SET memory_limit='10GB'`（默认 80% RAM）/ `threads` / `allowed_paths`。

**语句级（引擎原生无，全是应用侧实践）[Critical]**：sqlglot 官方自述 "a transpiler, **not a validator**"——AST 白名单用 `parse_one(sql).find_all(exp.Select)` 可行但解析宽松；**Vanna 实际用 sqlparse**：`statement.get_type() == "SELECT"`（base.py L238 `is_sql_valid`），Web 出口未过校验的 LLM 输出降级为纯文本；WrenAI 走服务端 per-user 行列权限路线（客户端不做语句白名单）。两条互补路线。

**应用级 [Critical]**：vanna `max_rows_displayed=100` + `page_size=25`（展示层截断，执行层无 max_rows）；DuckDB `enable_external_access` 默认 **true**、语义覆盖模块加载/COPY/pandas replacement scan，**"只能在构建时启用"的说法在文档无出处（证伪）**，且配套 `allowed_paths` 运行时白名单。

**错误反馈回路（text-to-SQL 闭环）[Critical]**：Vanna `intermediate_sql` 机制（规则 2 让模型先查 distinct 值，`allow_llm_to_see_data` 时执行中间 SQL 以 `df.to_markdown()` 回填再生成一轮）+ legacy `/api/v0/fix_sql` 端点；WrenAI MCP 暴露 `dry_run`/`dry_plan`；Genie "Is this correct?" 三态（Yes / Fix it+Submit and try again 带反馈重试 / Request review）+ Inspect（为初稿 SQL 生成小验证语句比对过滤值/join 后择优）；Cortex evaluations 用 VQ 做 ground truth 且**评估时移除被测 VQ 防泄漏**。**固定的"N 次重试"行业数字无实证**（如实标注），普遍模式是 1 轮修正 + 人工/知识沉淀兜底。

**Schema introspection 最佳实践 [Critical]**：Vanna `get_training_plan_generic` 吃 `INFORMATION_SCHEMA.COLUMNS` 按表生成 markdown 文档（列名/类型/注释）作为训练数据——**按需生成 + 语义化压缩**而非全量 DDL dump；BIRD 证明 schema linking（外部知识注入）值 **10-20 个点**（前四名全用 Oracle Knowledge、人类有/无知识 92.96 vs 72.37）；Genie `build_value_dictionary` / `get_example_values` 与 Cortex `cortex_search_service + is_enum` 都是**值级 grounding** 通道。**结果回填形态**：Markdown 表（vanna `df.to_markdown()`）；Genie MCP **结果截断护上下文 + `genie_get_query_result` 按需取全量**、Copy CSV 约 1GB 上限；行业宽表列截断/大结果落文件无直接实抓证据（本章 6.7 的设计建议标注为 [Observation]）。

## 6.6 大厂参考架构

**Databricks Genie（2026 已重构为 One/Agents/Code 三件套）[Critical]**：旧 semantic model YAML 整体退役（文档页+示例仓双 404）；现行 = Genie Agents 的 **knowledge store**（表列描述/同义词/join 关系/SQL 表达式，200 snippet 上限）+ instructions + example SQL（检索式 few-shot）+ trusted assets（命中给 "verified answer"）+ benchmarks（明确不进上下文）；API 全量结构为 `serialized_space` JSON。反馈闭环：三态反馈 + Add as instruction/benchmark 沉淀 + thumbs-up 自动 knowledge mining。对 agent：**Genie One MCP server 5 工具**（genie_ask / genie_poll_response / genie_get_query_result / genie_cancel_response / view_ask），UC 权限每请求强制 + **双凭证模型**（SQL 跑作者凭证、数据权限按终端用户评估）；会话轮询规范 1-5s 指数退避。（来源：docs.databricks.com/aws/en/genie-agents/conversation-api）

**Snowflake Cortex Analyst [Critical]**：现行 **semantic views**（schema 级 YAML 对象接 RBAC；旧 stage YAML 仅兼容）：dimensions/facts/metrics/**verified_queries**（带 verified_at/verified_by、SQL 用逻辑名）/relationships（equality/asof/range）/module_custom_instructions；REST `POST /api/v2/cortex/analyst/message`（SSE 流式、响应 `confidence.verified_query_used` 显式回报命中）；managed MCP 五类 tool（官方治理建议：受治理问答把 Cortex Agent 作唯一 client-facing tool；`SYSTEM_EXECUTE_SQL` 单列最小权限 server；平台强制递归深度 10）。（来源：docs.snowflake.com/en/user-guide/views-semantic/semantic-view-yaml-spec）

**评测启示 [Critical]**：BIRD（bird-bench.github.io）前四名全用 Oracle Knowledge——**外部语义注入值 10-20 点**；Spider2.0（spider2-sql.github.io）GPT-4o 仅 **10.1%**（对比 Spider1.0 86.6%）——**瓶颈从"写对 SQL"转向"项目级上下文 + 方言 + 工程约定"**，few-shot 必须检索式、评测集须防泄漏。

## 6.7 dsh 湖仓工具面设计草案（可操作产出，[Observation] 级设计建议）

**工具签名**（对齐 WrenAI/官方归档 server 的行业惯例——tool 承载动作、语义上下文走 system prompt 注入）：

```
introspect_schema({ database?: string, table?: string, pattern?: string })
  → { tables: [{ name, columns: [{name,type,comment}], rowCount≈, primaryKey }] }
  // 按需两级：省略 table 时仅返回表名+列数摘要（schema linking 由 LLM 二次点名）

execute_readonly({ sql: string, maxRows?: number ≤ 200, timeoutMs?: number ≤ 30000 })
  → { columns, rows(≤maxRows), truncated: bool, rowCount, durationMs, csvPath?: string }

dry_run({ sql }) → { valid, tablesUsed, estimatedCost? }  // EXPLAIN-first：先 dry_run 再 execute 是推荐工作流
```

**安全参数清单（Config 字段，非硬编码）**：`readonly: true`（默认；store_query 类写工具显式关）、`maxRowsDefault: 200`、`timeoutMsDefault: 30_000`、`memoryLimit`（DuckDB `SET memory_limit`）、`threads`、`allowedPaths`（DuckDB）、`attachMode: READ_ONLY`。

**只读校验三重伪代码（Vanna/WrenAI 两路线合流）**：

```
1. 引擎级：只读账号（Doris SELECT_PRIV / MySQL GRANT SELECT）或 DuckDB ATTACH(..., READ_ONLY)——信任根
2. 语句级：parse(sql) → 顶层语句 ∈ {Select, Union, With(只含读体)} 且零 {Insert,Update,Delete,Drop,Alter,
   Create,Attach,Copy,Install,Call,Pragma写} 节点；正则预筛 \b(insert|update|delete|drop|alter|create|
   attach|copy|install)\b 先行短路
   // TS 侧：sqlglot WASM 或 node-sql-parser（后者需另行核实），失败即拒绝（fail closed）
3. 执行级：会话 SET query_timeout / max_execution_time / memory_limit；无 LIMIT 的 SELECT 包一层
   SELECT * FROM (…) LIMIT maxRows+1（+1 用于截断判定）
```

**回填默认值建议**：≤50 行 → Markdown 表（vanna `df.to_markdown()` 模式）；>8 列截断显示前 8 列 + 省略计数；>200 行 → 写 session 文件（CSV）+ 路径引用（Genie 模式：截断护上下文、全量按需取）；数值/时间原样、超长字符串 200 字符截断。

**可抄 prompt 模板结构**（Vanna base.py:586-658 直接改写）：system = `You are a {dialect} expert...` + `\n===Tables\n<DDL 按需>` + `\n===Additional Context\n<业务文档/列同义词>` + `\n===Response Guidelines\n` 6 条规则（**保留规则 2 intermediate_sql：上下文缺具体列值时先出中间查询取 distinct 值**——配合 dry_run 是最廉价的 error feedback loop）+ few-shot 以 user/assistant 消息对追加 + 末条 user(question)；token 预算 `len/4` 估算、逐条超限跳过（默认 14000）。

**决策检查清单**：① 引擎侧只读账号是否可用（不可用才依赖 AST 白名单单层）？② dry_run 是否已置入工具描述引导模型先验证？③ 每个 Config 可调项是否进 cordis.yml 而非常量？④ 结果回填是否走 session 事件（model-visible ⟺ logged——仓库 AGENTS.md 纪律）？⑤ 语义定义（列注释/verified SQL）是否有 Git 落点（对齐 MDL/knowledge store 思路）？⑥ 评估集与 few-shot 库是否分离（防泄漏，Cortex 纪律）？
