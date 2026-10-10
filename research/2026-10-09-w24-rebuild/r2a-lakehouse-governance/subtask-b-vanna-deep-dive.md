# 子任务 B：vanna-ai/vanna 深挖（prompt 模板 + 训练数据组织）

研究日期：2026-10-09。源码获取方式：`git clone --depth 1`（成功，`.git` 已删除，11MB 快照留在 `sources/vanna/`）。本报告所有行号以该快照为准（main 分支，pyproject version = 2.0.2）。

## 元数据与 license

| 项 | 值 | 证据 |
| --- | --- | --- |
| stars | 23,825 | `api.github.com/repos/vanna-ai/vanna`（首次匿名请求遇 rate limit，重试成功） |
| license | **MIT**（三方证实） | `LICENSE` 文件（"MIT License, Copyright (c) 2024 Vanna.AI"）+ `pyproject.toml` classifiers（`License :: OSI Approved :: MIT License`）+ GitHub API `.license.spdx_id = "MIT"` |
| 语言 | Python（requires-python >=3.9） | pyproject.toml |
| pushed_at | 2026-02-02T14:14:20Z | GitHub API |
| 版本 | 2.0.2（flit 构建） | pyproject.toml |

**关键背景（影响全部结论）**：main 分支已是 **Vanna 2.0 完全重写**（Agent-based、user-aware、流式组件），README.md 自述 "Vanna 2.0 is a complete rewrite"。经典 0.x 代码（`VannaBase`、train/RAG、`base.py`）整体移入 `src/vanna/legacy/`。任务书所指 `src/vanna/base/base.py` 实际路径为 `src/vanna/legacy/base/base.py`（README_LEGACY.md 里的链接 `src/vanna/base/base.py` 是 0.x 时代路径，已过时）。

## 适配器清单

**v2 新架构**（`src/vanna/integrations/`，29 个）：anthropic, azureopenai, azuresearch, bigquery, chromadb, clickhouse, duckdb, faiss, google, hive, local, marqo, milvus, mock, mssql, mysql, ollama, openai, opensearch, oracle, pinecone, plotly, postgres, premium, presto, qdrant, snowflake, sqlite, weaviate。注意 v2 的 chromadb 集成是 `ChromaAgentMemory`（Agent 记忆检索），不再是 0.x 的训练数据向量库。

**legacy 0.x 架构**（`src/vanna/legacy/`，30+ 个目录）：LLM 侧 anthropic, bedrock, cohere, **deepseek**, google, hf, mistral, ollama, openai, qianfan, qianwen, vllm, xinference, ZhipuAI, remote, vannadb；向量库侧 azuresearch, chromadb, faiss, marqo, milvus, opensearch, oracle, pgvector, pinecone, qdrant, weaviate, mock；另有 flask（内嵌 REST server）。**官方 README_LEGACY "Supported VectorStores" 列 11 个**：AzureSearch, Opensearch, PgVector, PineCone, ChromaDB, FAISS, Marqo, Milvus, Qdrant, Weaviate, Oracle。

**chromadb 是否默认：否。** `pyproject.toml` `[project].dependencies`（无条件依赖）仅 10 项：`pydantic>=2.0.0, click>=8.0.0, pandas, httpx>=0.28.0, PyYAML, plotly, tabulate, sqlparse, sqlalchemy, requests`。chromadb 只出现在 optional-dependencies（`chromadb = ["chromadb>=1.1.0"]` 及聚合的 `all`）。核心思路是"LLM 类 × 向量库类"多继承组合（如 `class MyVanna(ChromaDB_VectorStore, OpenAI_Chat)`），全部按需 extra 安装。

## 训练接口源码摘录（带路径行号）

### train() 五参签名 — `src/vanna/legacy/base/base.py:1807-1860`

```python
def train(
    self,
    question: str = None,
    sql: str = None,
    ddl: str = None,
    documentation: str = None,
    plan: TrainingPlan = None,
) -> str:
    if question and not sql:
        raise ValidationError("Please also provide a SQL query")
    if documentation:
        return self.add_documentation(documentation)
    if sql:
        if question is None:
            question = self.generate_question(sql)   # LLM 反向生成问题
        return self.add_question_sql(question=question, sql=sql)
    if ddl:
        return self.add_ddl(ddl)
    if plan:
        for item in plan._plan:
            if item.item_type == TrainingPlanItem.ITEM_TYPE_DDL:
                self.add_ddl(item.item_value)
            elif item.item_type == TrainingPlanItem.ITEM_TYPE_IS:
                self.add_documentation(item.item_value)
            elif item.item_type == TrainingPlanItem.ITEM_TYPE_SQL:
                self.add_question_sql(question=item.item_name, sql=item.item_value)
```

### 抽象存储接口（VannaBase，均 @abstractmethod）— `src/vanna/legacy/base/base.py:445-516`

- `add_question_sql(question, sql) -> str`（L446）— 存问答对
- `add_ddl(ddl) -> str`（L460）— 存 DDL
- `add_documentation(documentation) -> str`（L473）— 存文档
- `get_training_data(**kwargs) -> pd.DataFrame`（L486）— 列出全部训练数据
- `remove_training_data(id) -> bool`（L501）— 按 id 删除
- 检索三接口：`get_similar_question_sql(question)`（L407）/ `get_related_ddl(question)`（L420）/ `get_related_documentation(question)`（L433）

### 训练数据物理组织：ChromaDB 三 collection 单轨 — `src/vanna/legacy/chromadb/chromadb_vector.py`

```python
# L45-59：三个独立 collection，各自 embedding 检索
self.documentation_collection = self.chroma_client.get_or_create_collection(name="documentation", ...)
self.ddl_collection = self.chroma_client.get_or_create_collection(name="ddl", ...)
self.sql_collection = self.chroma_client.get_or_create_collection(name="sql", ...)

# L67-82 add_question_sql：document 存 {"question","sql"} JSON，id = 内容哈希 + 后缀
question_sql_json = json.dumps({"question": question, "sql": sql}, ensure_ascii=False)
id = deterministic_uuid(question_sql_json) + "-sql"
self.sql_collection.add(documents=question_sql_json, embeddings=..., ids=id)

# L84-91 add_ddl：document = DDL 原文
id = deterministic_uuid(ddl) + "-ddl"
# L93-100 add_documentation：
id = deterministic_uuid(documentation) + "-doc"
```

结论：**纯向量库单轨存储**（无独立 sqlite 双轨；持久化由 ChromaDB 自身实现，`PersistentClient(path=...)` L31-34）。id = `deterministic_uuid(内容) + "-sql"/"-ddl"/"-doc"`，天然内容去重。检索 top-k 默认 10（`n_results_sql/documentation/ddl` 可分别配置，L25-29）。`get_training_data`（L102-165）把三个 collection `.get()` 全量拼成 DataFrame（列：id/question/content/training_data_type ∈ sql|ddl|documentation）。

### TrainingPlan 自动生成 — `base.py:1882-1936`

`get_training_plan_generic(df)`：吃 `INFORMATION_SCHEMA.COLUMNS` 查询结果 DataFrame，按 database→schema→table 三层分组，每表生成一条 markdown 文档（"The following columns are in the {table} table in the {database} database:\n\n" + 列名/类型/注释表）作为 ITEM_TYPE_IS（文档类）训练项。配套 `_get_databases()`（L1862）走 `INFORMATION_SCHEMA.DATABASES` 失败则 `SHOW DATABASES`。

## prompt 模板拼接逻辑（最高价值，逐段摘录）

### 主入口 generate_sql — `src/vanna/legacy/base/base.py:93-160`

```python
def generate_sql(self, question, allow_llm_to_see_data=False, **kwargs) -> str:
    if self.config is not None:
        initial_prompt = self.config.get("initial_prompt", None)     # L121 用户可覆写
    question_sql_list = self.get_similar_question_sql(question, **kwargs)   # L124 向量检索 few-shot
    ddl_list = self.get_related_ddl(question, **kwargs)                     # L125
    doc_list = self.get_related_documentation(question, **kwargs)           # L126
    prompt = self.get_sql_prompt(initial_prompt=..., question=..., ...)     # L127
    llm_response = self.submit_prompt(prompt, **kwargs)                     # L136
    # L139-160 intermediate_sql 二次机制：响应含 "intermediate_sql" 且 allow_llm_to_see_data=True 时，
    # 执行中间 SQL，把 df.to_markdown() 追加进 doc_list 重新生成 prompt 再提交一轮
```

### 核心 get_sql_prompt — `base.py:586-658`（完整结构）

```python
def get_sql_prompt(self, initial_prompt, question, question_sql_list, ddl_list, doc_list, **kwargs):
    if initial_prompt is None:                                   # L619-623 系统提示头
        initial_prompt = (
            f"You are a {self.dialect} expert. "
            + "Please help to generate a SQL query to answer the question. "
            + "Your response should ONLY be based on the given context "
          + "and follow the response guidelines and format instructions. "
        )
    initial_prompt = self.add_ddl_to_prompt(initial_prompt, ddl_list, max_tokens=self.max_tokens)  # L625
    if self.static_documentation != "":                          # L629-630 静态文档总是追加
        doc_list.append(self.static_documentation)
    initial_prompt = self.add_documentation_to_prompt(initial_prompt, doc_list, ...)  # L632
    initial_prompt += (                                          # L636-644 响应规范 6 条
        "===Response Guidelines \n"
        "1. If the provided context is sufficient, please generate a valid SQL query without any explanations for the question. \n"
        "2. If the provided context is almost sufficient but requires knowledge of a specific string in a particular column, please generate an intermediate SQL query to find the distinct strings in that column. Prepend the query with a comment saying intermediate_sql \n"
        "3. If the provided context is insufficient, please explain why it can't be generated. \n"
        "4. Please use the most relevant table(s). \n"
        "5. If the question has been asked and answered before, please repeat the answer exactly as it was given before. \n"
        f"6. Ensure that the output SQL is {self.dialect}-compliant and executable, and free of syntax errors. \n"
    )
    message_log = [self.system_message(initial_prompt)]          # L646 单条 system 消息
    for example in question_sql_list:                            # L648-654 few-shot 为 user/assistant 对
        message_log.append(self.user_message(example["question"]))
        message_log.append(self.assistant_message(example["sql"]))
    message_log.append(self.user_message(question))              # L656 真实问题作最后一条 user
    return message_log
```

### 三个分块拼接函数（`===` 分隔符协议）— `base.py:535-584`

```python
def add_ddl_to_prompt(self, initial_prompt, ddl_list, max_tokens=14000):        # L535-549
    if len(ddl_list) > 0:
        initial_prompt += "\n===Tables \n"
        for ddl in ddl_list:
            if self.str_to_approx_token_count(initial_prompt) + self.str_to_approx_token_count(ddl) < max_tokens:
                initial_prompt += f"{ddl}\n\n"

def add_documentation_to_prompt(self, initial_prompt, documentation_list, ...): # L551-568
    if len(documentation_list) > 0:
        initial_prompt += "\n===Additional Context \n\n"
        for documentation in documentation_list:
            if ... < max_tokens:
                initial_prompt += f"{documentation}\n\n"

def add_sql_to_prompt(self, initial_prompt, sql_list, ...):                     # L570-584（用于 followup prompt，不进 SQL 主 prompt）
    if len(sql_list) > 0:
        initial_prompt += "\n===Question-SQL Pairs\n\n"
        for question in sql_list:
            if ... < max_tokens:
                initial_prompt += f"{question['question']}\n{question['sql']}\n\n"
```

**最终 system 消息文本形态**（拼接顺序，逐段）：

```
You are a {dialect} expert. Please help to generate a SQL query to answer the question. Your response should ONLY be based on the given context and follow the response guidelines and format instructions.
===Tables
<ddl_1>

<ddl_2>

===Additional Context

<doc_1>

<doc_2>

===Response Guidelines
1. ... 2. ... 3. ... 4. ... 5. ... 6. ...
```

之后消息序列 = `system(上述文本)` + N 对 `user(历史问题)/assistant(历史SQL)`（few-shot 逐对）+ `user(当前问题)`。

**token 预算机制**：`str_to_approx_token_count(s) = len(s)/4`（L532-533），`self.max_tokens` 默认 14000（L82），逐条累加、超预算即跳过该条（不是截断）。`dialect` 默认 "SQL"（L80），config 可设 "PostgreSQL" 等，注入两处（专家身份 + 合规规则 6）。`language` 配置时另有 `Respond in the {language} language.`（`_response_language` L87-91，用于 summary/explanation 类 prompt，不在 SQL 主 prompt 中）。

变体：`get_followup_questions_prompt`（L660-689）复用同一拼接（ddl→docs→sql pairs 全进 system），user 消息固定 "Generate a list of followup questions ... one per line. Do not answer with any explanations -- just the questions."

### v2 新架构的 prompt 面

v2（`src/vanna/agents/`、`src/vanna/core/agent/`）改为 Agent + tools（`src/vanna/tools/run_sql.py` 等）+ Enricher（`src/vanna/core/enricher/base.py`，README L258："Context Enrichers — Add RAG, memory, or documentation"）。v2 `components/simple/` 下无 RAG；训练/检索作为 enricher 或 memory 外挂（`integrations/chromadb/agent_memory.py` 的 `ChromaAgentMemory` 做 tool-usage 记忆检索）。v2 的 SQL 生成 prompt 分散在 Agent 系统提示（`examples/custom_system_prompt_example.py` 可覆写），不再是 0.x 的单一 get_sql_prompt 模板。

## REST/TS 集成面

### v2 内置 server（Flask 与 FastAPI 双实现，`src/vanna/servers/`）

端点清单（flask/routes.py 与 fastapi/routes.py 一致）：

| 端点 | 方法 | 说明 |
| --- | --- | --- |
| `/` | GET | 内置 web UI（HTML） |
| `/api/vanna/v2/chat_sse` | POST | SSE 流式对话（表→图→摘要流式返回） |
| `/api/vanna/v2/chat_websocket` | WS | WebSocket 版 |
| `/api/vanna/v2/chat_poll` | POST | 轮询版 |

CLI 入口：`[project.scripts] vanna = "vanna.servers.cli.server_runner:main"`（click 实现，加载 `src/vanna/examples/` 里的示例 Agent）。extras：`flask`、`fastapi`、`servers = vanna[flask,fastapi]`。README 生产示例：把 `register_chat_routes` 挂进自己的 FastAPI 应用，自带 user-resolver 对接自有鉴权（README.md L158-200）。

### legacy 0.x Flask REST（`src/vanna/legacy/flask/__init__.py`，`/api/v0/*` 全 22 条 route）

GET：`get_config`、`generate_questions`、**`generate_sql`**、`generate_rewritten_question`、`get_function`、`get_all_functions`、**`run_sql`**、`download_csv`、`generate_plotly_figure`、**`get_training_data`**、`create_function`、`generate_followup_questions`、`generate_summary`、`load_question`、`get_question_history`；POST：**`train`**、`remove_training_data`、`fix_sql`、`update_sql`、`update_function`、`delete_function`；另有 `/auth/login|callback|logout`、静态资源与 SPA fallback。带缓存装饰器 `requires_cache`（内存 DataFrame 缓存）与 `requires_auth`。

### TS/JS 客户端

- npm `vanna` 包：**不存在**（registry.npmjs.org 返回 `{"error":"Not found"}`）。
- 官方 TS 资产在主仓 `frontends/webcomponent/`：`@vanna/webcomponent` v2.0.0（package.json），Lit 3 + plotly.js-dist-min，tsc + vite 构建，MIT，**未发布到 npm**（name 带 scope，但 registry 查无——由 CDN 分发 `https://img.vanna.ai/vanna-components.js`）。
- 组件（`frontends/webcomponent/src/components/`）：`vanna-chat`（入口）、`vanna-message`、`plotly-chart`、`dataframe-component`、`rich-card`、`rich-task-list`、`rich-progress-bar`、`vanna-progress-tracker`、`vanna-status-bar`；`src/services/api-client.ts` 封装 SSE 对接。用法（README L49-56）：`<script src="https://img.vanna.ai/vanna-components.js">` + `<vanna-chat sse-endpoint="..." theme="dark">`，与 React/Vue/原生 HTML 兼容，用宿主 cookie/JWT。
- org 仓库（`api.github.com/orgs/vanna-ai/repos`，20 个可见）：vanna, vanna-streamlit, vanna-slack, vanna-flask, vanna-streamlit-simple, vanna-chainlit, vanna-nextjs-flask, vanna-gradio, vanna-gpt-starter, multi-agent, poc-to-prod 等。**无独立 vanna-js/vanna-front 仓**；唯一 TS 仓是主仓内 frontends/webcomponent。历史上有 vanna-flask（旧 REST UI）与 vanna-nextjs-flask（Next.js + Flask 组合示例）。

### README 训练数据结构图（任务 3g）

v2 README 无训练三类示意图，仅 `img/architecture.png` / `img/vanna2.svg` 与 How-It-Works mermaid **时序图**（User→`<vanna-chat>`→Your Server→Agent→Tools，SSE 流回）。0.x 三类训练说明在 `README_LEGACY.md` L113-142：`vn.train(ddl=...)`（"DDL statements contain information about the table names, columns, data types, and relationships"）、`vn.train(documentation="Our business defines XYZ as ...")`、`vn.train(sql="SELECT ...")`，配图 `img/vanna-readme-diagram.png`（train→RAG→ask 两步图，非 mermaid）。base.py 文件头 docstring（L1-49）有 mermaid 结构图：VannaBase{ask,train} ← OpenAI_Chat{get_sql_prompt,submit_prompt,...} + ChromaDB_VectorStore{generate_embedding,add_question_sql,add_ddl,add_documentation,get_similar_question_sql,get_related_ddl,get_related_documentation}。

## 对 TypeScript 项目的集成代价

1. **Python 运行时不可绕过（若复用库本身）**：RAG 训练/检索、LLM 适配器、SQL 执行（pandas/sqlalchemy）全在 Python；v2 server 也是 Python（Flask/FastAPI）。README 快速开始是 `pip install vanna`。TS 项目只能以 sidecar 服务（SSE `/api/vanna/v2/chat_sse` 或 legacy `/api/v0/*`）+ `<vanna-chat>` web component 方式集成，或走 vanna-nextjs-flask 模式（Next.js 前端 + Flask 后端）。
2. **prompt 模板本身移植成本极低**：`get_sql_prompt` 全部逻辑 = 字符串拼接（`===Tables` / `===Additional Context` / `===Response Guidelines` 三段 + 6 条规则文案）+ `len/4` token 估算 + 14000 预算逐条跳过 + few-shot 消息对组装。无框架依赖，TS 重写约百行。
3. **真正的依赖面在检索与执行**：0.x 架构把存储绑在 ChromaDB 等 Python 向量库生态（三 collection、内容哈希 id、top-10 检索）。TS 侧需自选向量方案（或直连 Chroma HTTP API / pgvector）；SQL 执行侧需自建。
4. **版本分裂风险**：main 已是 2.0.2 重写（legacy 仅靠 `LegacyVannaAdapter` 兼容），0.x 的经典 train/RAG API 在 legacy 命名空间；跟踪 v2 演进（pushed_at 2026-02）需同时消化 Agent/tools/enricher 新概念。
5. **许可无障碍**：MIT（仓库 LICENSE、pyproject classifiers、npm 侧 webcomponent package.json 均 MIT），无 CLA/AGPL 顾虑。
6. **无官方 npm SDK**：`vanna` npm 名不存在；web component 走 CDN 脚本。若需程序化 TS 客户端只能自己封 SSE/REST。

## 来源 URL

- https://api.github.com/repos/vanna-ai/vanna （元数据：stars/license/pushed_at）
- https://api.github.com/orgs/vanna-ai/repos?per_page=30 （org 仓库清单）
- https://github.com/vanna-ai/vanna （git smart-http shallow clone，main 分支，2026-10-09 抓取）
- https://registry.npmjs.org/vanna （404 证据）
- 本地快照：`research/2026-10-09-w24-rebuild/r2a-lakehouse-governance/sources/vanna/`（`.git` 已删除）
