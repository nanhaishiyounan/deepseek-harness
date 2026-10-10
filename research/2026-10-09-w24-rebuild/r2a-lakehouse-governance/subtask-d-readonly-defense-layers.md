# 子任务D：只读安全边界引擎语法证据（纵深防御四层）

- 日期：2026-10-09。方法：`curl -sL --max-time 25` 直抓官方文档站；抓取失败按三路径降级（域名变体 / GitHub raw 源码或文档源 / cdn.jsdelivr.net gh 镜像）。禁用 `api.github.com`（出口 IP 限流）。
- 本机实况：dev.mysql.com、doris.apache.org、docs.starrocks.io(.com)、duckdb.org、docs.getwren.ai、cdn.jsdelivr.net、raw.githubusercontent.com 均实测可达（200）。
- 以下摘录均为原文（HTML 去标签后逐字摘录），未做转述改写；未获得原文处明确标注。

---

## 用户级

### MySQL 8.0 — GRANT SELECT 只读账号

来源：<https://dev.mysql.com/doc/refman/8.0/en/grant.html>（200，210 KB）

语法 synopsis 原文：

```
GRANT
    priv_type [(column_list)]
      [, priv_type [(column_list)]] ...
    ON [object_type] priv_level
    TO user_or_role [, user_or_role] ...
    [WITH GRANT OPTION]
```

`priv_level` 对象粒度原文：

```
priv_level : { * | *.* | db_name.* | db_name.tbl_name | tbl_name | db_name.routine_name }
```

官方示例原文（库级只读授权）：

```
GRANT SELECT ON world.* TO 'role3';
```

（同页另有 `GRANT ALL ON db1.* TO 'jeffrey'@'localhost';`、`GRANT SELECT ON db2.invoice TO 'jeffrey'@'localhost';`，佐证 `db.*` 与 `db.tbl` 两级粒度。）

### MySQL 8.0 — read_only / super_read_only（服务器级兜底）

来源：<https://dev.mysql.com/doc/refman/8.0/en/server-system-variables.html>（200，1 MB）

`read_only` 原文：

> read_only … Scope Global … Dynamic Yes … Type Boolean … Default Value OFF … If the read_only system variable is enabled, the server permits no client updates except from users who have the CONNECTION_ADMIN privilege (or the deprecated SUPER privilege). This variable is disabled by default.

`super_read_only` 原文（与 read_only 的联动 + 覆盖面）：

> If super_read_only is enabled, the server prohibits client updates, even from users who have the CONNECTION_ADMIN or SUPER privilege. Setting super_read_only to ON implicitly forces read_only to ON. Setting read_only to OFF implicitly forces super_read_only to OFF.
>
> Client updates prevented when super_read_only is enabled include operations that do not necessarily appear to be updates, such as CREATE FUNCTION (to install a loadable function), INSTALL PLUGIN, and INSTALL COMPONENT. These operations are prohibited because they involve changes to tables in the mysql system schema.

（要点：`super_read_only` 连"看起来不是写操作"的 `CREATE FUNCTION`/`INSTALL PLUGIN` 也一并禁止——只读兜底必须用 super_read_only 而非 read_only，因为后者对 CONNECTION_ADMIN/SUPER 例外。）

### Apache Doris 3.x — GRANT SELECT_PRIV / CREATE USER

任务给定路径 `.../account-management/GRANT` 返回 404。降级：抓 `https://doris.apache.org/sitemap.xml`（200，1 MB）定位到真实页面 `GRANT-TO`。

来源：<https://doris.apache.org/docs/3.x/sql-manual/sql-statements/account-management/GRANT-TO/>（200，129 KB）

官方示例原文：

```
GRANT SELECT_PRIV ON *.*.* TO 'jack'@'%';
```
```
GRANT SELECT_PRIV, ALTER_PRIV, LOAD_PRIV ON ctl1.db1.tbl1 TO 'jack'@'192.8.%';
```
```
GRANT LOAD_PRIV ON ctl1.db1.* TO ROLE 'my_role';
```

（粒度为三段式 `ctl.db.tbl`；只读账号即只授 `SELECT_PRIV`。）

来源：<https://doris.apache.org/docs/3.x/sql-manual/sql-statements/account-management/CREATE-USER/>（200，117 KB）

语法原文：

```
CREATE USER [IF EXISTS] <user_identity> [IDENTIFIED BY <password>] [DEFAULT ROLE <role_name>] [<password_policy>] [<comment>]
```

官方示例原文：

```
CREATE USER jack@'172.10.1.10' IDENTIFIED BY '123456';
```

### StarRocks — GRANT SELECT（表级/库级/全局）

来源：<https://docs.starrocks.io/docs/sql-reference/sql-statements/account-management/GRANT/>（经 docs.starrocks.com 同路径 200 抓取，199 KB；sitemap 中 canonical 域为 .io）

表级语法原文：

```
-- Grant privileges on SPECIFIC TABLES.
GRANT { ALTER | DROP | SELECT | INSERT | EXPORT | UPDATE | DELETE | ALL [PRIVILEGES] }
    ON TABLE <table_name> [, <table_name>, ...]
    TO { ROLE | USER } { <role_name> | <user_identity> } [WITH GRANT OPTION]

-- Grant privileges on ALL TABLES in a specific database or all databases.
GRANT { ALTER | DROP | SELECT | INSERT | EXPORT | UPDATE | DELETE | ALL [PRIVILEGES] }
    ON ALL TABLES IN { { DATABASE <database_name> } | ALL DATABASES }
    TO { ROLE | USER } { <role_name> | <user_identity> } [WITH GRANT OPTION]
```

库级语法原文：

```
GRANT { ALTER | DROP | CREATE TABLE | CREATE VIEW | CREATE FUNCTION | CREATE MATERIALIZED VIEW | ALL [PRIVILEGES] }
    ON { DATABASE <database_name> [, <database_name>, ...] | ALL DATABASES }
    TO { ROLE | USER } { <role_name> | <user_identity> } [WITH GRANT OPTION]
```

官方示例原文：

> Example 1: Grant the privilege to read data from all tables in all databases to user jack.
> `GRANT SELECT ON *.* TO 'jack'@'%';`
> Example 2: Grant the privilege to load data into all tables of database db1 to role my_role.
> `GRANT INSERT ON db1.* TO ROLE 'my_role';`

---

## 会话级

### MySQL 8.0 — max_execution_time（毫秒、仅只读 SELECT、错误 3024）

来源：<https://dev.mysql.com/doc/refman/8.0/en/server-system-variables.html>（同上页）

`max_execution_time` 原文：

> max_execution_time … Scope Global, Session … Dynamic Yes … Type Integer … Default Value 0 … Unit milliseconds … The execution timeout for SELECT statements, in milliseconds. If the value is 0, timeouts are not enabled. … The global max_execution_time value provides the default for the session value for new connections. The session value applies to SELECT executions executed within the session that include no MAX_EXECUTION_TIME(N) optimizer hint or for which N is 0.
>
> max_execution_time applies to read-only SELECT statements. Statements that are not read only are those that invoke a stored function that modifies data as a side effect. max_execution_time is ignored for SELECT statements in stored programs.

（三条硬事实：单位毫秒；仅作用于只读 SELECT（带写副作用的存储函数不算只读）；语句级可用 `MAX_EXECUTION_TIME(N)` optimizer hint 覆盖。）

超时报错原文。refman 域 `server-error-reference.html` 返回 404，降级到 mysql-errors 域：<https://dev.mysql.com/doc/mysql-errors/8.0/en/server-error-reference.html>（200，4.3 MB）

> Error number: 3024; Symbol: ER_QUERY_TIMEOUT; SQLSTATE: HY000
> Message: Query execution was interrupted, maximum statement execution time exceeded
>
> Error number: 3025; Symbol: ER_NON_RO_SELECT_DISABLE_TIMER; SQLSTATE: HY000
> Message: Select is not a read only statement, disabling timer

（3025 是"仅只读 SELECT"的直接引擎证据：非只读 SELECT 会被引擎主动停掉执行计时器。）

### Apache Doris — query_timeout / exec_mem_limit

官网变量页降级记录：`https://doris.apache.org/docs/3.x/advanced/variables/` 返回 404；sitemap 无 session-variable 语法页（只有 information_schema 系统表页）。降级到 GitHub raw 源码（FE 会话变量权威定义处）：

来源：<https://raw.githubusercontent.com/apache/doris/master/fe/fe-core/src/main/java/org/apache/doris/qe/SessionVariable.java>（200，303 KB）

`query_timeout` 原文（源码注释 + 声明，含默认值）：

```java
// query timeout in second.
@VarAttrDef.VarAttr(name = QUERY_TIMEOUT, needForward = true,
        checker = "checkQueryTimeoutValid", setter = "setQueryTimeoutS")
private int queryTimeoutS = 900;
```

（默认 900 秒；同文件 L103 `public static final String QUERY_TIMEOUT = "query_timeout";`。）

`exec_mem_limit` 原文：

```java
// max memory used on every backend. Default value to 100G.
@VarAttrDef.VarAttr(name = EXEC_MEM_LIMIT, needForward = true)
public long maxExecMemByte = 100147483648L;
```

（默认 100 GB；L92 `public static final String EXEC_MEM_LIMIT = "exec_mem_limit";`。同文件还有语句上限语义的近邻证据：`DEFAULT_ORDER_BY_LIMIT` 注释——"the number of Limit items after OrderBy is changed from 65535 items before v1.2.0, to return all items by default"，即 Doris 曾默认 65535 行 ORDER BY 截断。）

`SET query_timeout = ...` / `SELECT ... LIMIT n` 为标准会话语法；本次未从 doris.apache.org 直接获得 SET 语法页原文（该页 404，已列尝试路径），源码级证据如上。

### StarRocks — query_timeout / query_mem_limit / SET_VAR hint

来源：<https://docs.starrocks.io/docs/sql-reference/System_variable/>（200，319 KB）

`query_timeout` 条目原文（该页此条目仅含默认值与引入版本）：

> query_timeout . Default : 14400 Introduced in : v3.4.0

语义佐证（同页 `insert_timeout` 条目原文，划清 query_timeout 的作用域）：

> insert_timeout — The timeout duration of the INSERT job. Unit: Seconds. From v3.4.0 onwards, insert_timeout applies to operations involved INSERT (for example, UPDATE, DELETE, CTAS, materialized view refresh, statistics collection, and PIPE), replacing query_timeout. Default : 14400

（即 v3.4.0 起 INSERT/UPDATE/DELETE/CTAS 等归 insert_timeout 管，query_timeout 专管查询。）

会话内 SET 与语句级 hint 原文：

```
SET query_mem_limit = 137438953472; -- Apply to the current session.
SET GLOBAL query_mem_limit = 137438953472; -- Apply to all future sessions.
```
```
SELECT /*+ SET_VAR(query_timeout = 1) */ sleep(3);
```

按用户设默认值原文（同页）：

```
ALTER USER 'jack' SET PROPERTIES ('session.query_timeout' = '600');
```

变量层级原文：

> Global variables take effect on global level, and can be overridden by session variables and SET_VAR hints. Session variables take effect only on the current session, and can be overridden by SET_VAR hints. SET_VAR hints take effect only on the current query statement.

### DuckDB — memory_limit / threads / temp_directory / enable_external_access / ATTACH READ_ONLY

任务给定 URL `https://duckdb.org/docs/stable/configuration/overview.html` 返回 200 但仅 581 B 重定向壳（`location="https://duckdb.org/docs/current/configuration/overview.html"`）。按域名/版本变体降级后实际抓取 current（1.5）版全文。

来源：<https://duckdb.org/docs/current/configuration/overview>（200，422 KB；stable 链接自动重定向至此）

设置机制总述原文：

> The configuration options can be set using either the SET statement or the PRAGMA statement. They can be reset to their original values using the RESET statement. The values of configuration options can be queried via the current_setting() scalar function or using the duckdb_settings() table function.

设置表原文行（名称 | 描述 | 类型 | 默认值）：

> `max_memory` , `memory_limit` — The maximum memory of the system (e.g., 1GB) — VARCHAR — 80% of RAM
>
> `threads` , `worker_threads` — The number of total threads used by the system. — BIGINT — # CPU cores
>
> `temp_directory` — Set the directory to which to write temp files — VARCHAR — ⟨database_name⟩.tmp or .tmp (in in-memory mode)
>
> `enable_external_access` — Allow the database to access external state (through e.g., loading/installing modules, COPY TO/FROM, CSV readers, pandas replacement scans, etc) — BOOLEAN — true
>
> `allowed_paths` — List of files that are ALWAYS allowed to be queried - even when enable_external_access is false — VARCHAR[] — []

SET 示例原文：

```
SET memory_limit = '10GB';
```

（另有读取方式原文：`SELECT current_setting('memory_limit') AS memlimit;` 或 `SELECT value AS memlimit FROM duckdb_settings() WHERE name = 'memory_limit';`）

ATTACH 只读挂载。来源：<https://duckdb.org/docs/current/sql/statements/attach>（200，387 KB）

官方示例原文：

```
ATTACH 'file.db';
ATTACH 'file.db' AS file_db;
ATTACH 'file.db' (READ_ONLY);
```

> Attach the database file.db in read only mode: ATTACH 'file.db' (READ_ONLY);

（选项拼写确认为下划线 `READ_ONLY`，非 `READONLY`。）

### DuckDB 外部访问锁核实（enable_external_access 专项）

针对"默认值、语义是否仅影响扩展读外部文件、'只能在构建时启用'是否属实"三个问题，`https://duckdb.org/docs/current/configuration/overview`（1.5 current）settings 表原文逐字回答：

1. 默认值：`BOOLEAN true`（默认开启，非关闭）。
2. 语义：`Allow the database to access external state (through e.g., loading/installing modules, COPY TO/FROM, CSV readers, pandas replacement scans, etc)`——覆盖面是"模块加载/安装、COPY TO/FROM、CSV reader、pandas replacement scan 等外部状态访问"，明确不限于"扩展读外部文件"。
3. "只能在构建时启用"：该文档页对 `enable_external_access` 无任何 build/构建时 相关措辞（对页面 grep `build` 无与该选项相关的命中）；它是运行时设置项（settings 表项，随 SET/PRAGMA 体系配置），且同表存在与之联动的运行时例外机制 `allowed_paths`（"List of files that are ALWAYS allowed to be queried - even when enable_external_access is false"）。结论：就本文档页而言，"只能在构建时启用"的说法无出处、不属实。

---

## 语句级（AST 白名单 parse-then-reject 实践）

### sqlglot

来源：<https://cdn.jsdelivr.net/gh/tobymao/sqlglot@main/README.md>（200，24 KB）

定位原文：

> SQLGlot is a no-dependency SQL parser, transpiler, optimizer, and engine. It can be used to format SQL or translate between over 30 dialects like DuckDB, Presto / Trino, Spark / Databricks, Snowflake, and BigQuery.

parse/transpile 用法原文：

> Always pass the dialect when you know it, e.g. `parse_one(sql, dialect="spark")`.
>
> For example, to transpile a query from Spark SQL to DuckDB, do `parse_one(sql, dialect="spark").sql(dialect="duckdb")`, or `transpile(sql, read="spark", write="duckdb")`.

对"parse-then-reject"最重要的边界声明原文（README FAQ）：

> The parser is intentionally lenient, so it can accept queries that a real engine would reject. SQLGlot is a transpiler, not a validator. A query that parses successfully may still fail at execution time.

AST 白名单可用的遍历接口原文（AST Introspection 一节）：

```python
from sqlglot import parse_one, exp

for column in parse_one("SELECT a, b + 1 AS c FROM d").find_all(exp.Column):
    ...
for select in parse_one("SELECT a, b + 1 AS c FROM d").find_all(exp.Select):
    ...
```

本地验证：`python3 -c "import sqlglot"` → `ModuleNotFoundError: No module named 'sqlglot'`（本机未安装；按任务约束禁止 pip install，跳过本地实跑）。

### 实践证据1 — Vanna（本地已克隆源码）

路径：`research/2026-10-09-w24-rebuild/r2a-lakehouse-governance/sources/vanna/src/vanna/legacy/base/base.py`

**重要事实修正**：Vanna 的只读判定用的是 **sqlparse**（非 sqlglot）。`base.py:65` 原文 `import sqlparse`（全文件无 sqlglot import）。

`is_sql_valid`（`base.py:238` 起）原文：

```python
def is_sql_valid(self, sql: str) -> bool:
    """...
    Checks if the SQL query is valid. This is usually used to check if we should run the SQL query or not.
    By default it checks if the SQL query is a SELECT statement. You can override this method to enable running other types of SQL queries.
    ...
    """
    parsed = sqlparse.parse(sql)

    for statement in parsed:
        if statement.get_type() == "SELECT":
            return True

    return False
```

（parse-then-reject 实例：先 parse 再按语句类型白名单判定，且注释明确默认只放行 SELECT。）

上游 SQL 提取（`base.py` `extract_sql`，约 L197–236）先于校验执行，正则白名单原文：

```python
sqls = re.findall(r"\bCREATE\s+TABLE\b.*?\bAS\b.*?;", llm_response, re.DOTALL | re.IGNORECASE)  # CTAS 放行
sqls = re.findall(r"\bWITH\b .*?;", llm_response, re.DOTALL | re.IGNORECASE)
sqls = re.findall(r"\bSELECT\b .*?;", llm_response, re.DOTALL | re.IGNORECASE)
```

Web 出口处的强制门（`src/vanna/legacy/flask/__init__.py:346` 起）原文：

```python
if vn.is_sql_valid(sql=sql):
    return jsonify({"type": "sql", "id": id, "text": sql})
else:
    return jsonify({"type": "text", "id": id, "text": sql})
```

（未过 SELECT 校验的 LLM 输出被降级为纯文本返回，不标记为可执行 SQL。）

### 实践证据2 — WrenAI

尝试路径与结果：

1. `https://docs.getwren.ai/`（200）→ 首页 grep mcp 命中唯一入口 `/cp/guide/integrations/wrenai-mcp`；
2. `https://docs.getwren.ai/cp/guide/integrations/wrenai-mcp`（200，54 KB）→ 全文正则 `read only|read-only|readonly|read_only` **0 命中**；
3. `https://cdn.jsdelivr.net/gh/Canner/wrenai-mcp@main/README.md`（200，6.6 KB）与 `https://cdn.jsdelivr.net/gh/Canner/WrenAI@main/README.md`（200，16 KB）→ 同样 0 命中。

**未获得 "read only" 字样原文**。但 wrenai-mcp README 提供了另一形态的只读边界证据（服务端按账号管控）：

> Data security (row/column-level) is applied **per user**, server-side — you only see what your WrenAI account is allowed to see.

工具面原文（同 README）：

```
https://cloud.getwren.ai/api/mcp          ← one endpoint for your whole org
   ├── list_projects            (discover which projects you can query)
   ├── get_project_metadata     (table schema for a project)
   ├── ask                      (end-to-end natural-language Q&A)
   ├── generate_sql / run_sql
   ├── generate_chart           (Vega spec)
   └── generate_summary
```

（WrenAI 的 agent 面暴露 `run_sql`，安全边界不靠语句白名单而靠服务端行/列级权限；与 Vanna 的客户端 parse-then-reject 形成两条互补路线。）

---

## 应用级

### Vanna — 行数截断 / 分页

路径：`research/2026-10-09-w24-rebuild/r2a-lakehouse-governance/sources/vanna/src/vanna/components/rich/data/dataframe.py`

原文（L20 及以下）：

```python
max_rows_displayed: int = 100  # Limit rows shown in UI
```
```python
paginated: bool = True
page_size: int = 25
```

（应用层 UI 截断：展示上限 100 行、分页 25 行/页。注意 `base.py` 的 `run_sql` 本体无 max_rows 参数（`grep max_rows` 全 src 仅此一处非测试命中），截断发生在展示组件而非执行层。）

`base.py` 中唯一的 LIMIT 用法是训练数据示例（L600）：

```python
question_sql_list=[{"question": "What are the top 10 customers by sales?", "sql": "SELECT * FROM customers ORDER BY sales DESC LIMIT 10"}],
```

Vanna README 中的应用级安全承诺原文（`sources/vanna/README.md` L24/L84）：

> 🔒 **Enterprise Security** — Row-level security, audit logs, rate limiting
>
> **Row-level security** — Queries automatically filtered per user permissions

### DuckDB — 对应用的定位

`https://duckdb.org/how_duckdb_runs_app` 未获得（stable guides 下该路径未命中）。替代佐证来源：<https://duckdb.org/why_duckdb>（200）原文：

> DuckDB is a relational (table-oriented) DBMS that supports the Structured Query Language (SQL). … Simplicity in installation, and embedded in-process operation are central…

（DuckDB 以嵌入式进程内（in-process）形态供应用集成：应用侧直接拥有连接与结果集，行数截断/大结果落文件由应用层决定——与上文 vanna 的 UI 截断互为印证。）

---

## 汇总对照表（层 × 引擎）

| 层 | MySQL 8.0 | Apache Doris 3.x | StarRocks | DuckDB |
|---|---|---|---|---|
| 用户级 | `GRANT SELECT ON db.* TO user`；服务器兜底 `read_only`/`super_read_only`（后者连 INSTALL PLUGIN/CREATE FUNCTION 也禁） | `CREATE USER ... IDENTIFIED BY ...` + `GRANT SELECT_PRIV ON ctl.db.tbl TO user` | `GRANT SELECT ON TABLE t / ON ALL TABLES IN DATABASE db / ON db.*` | 文件级只读挂载 `ATTACH 'file.db' (READ_ONLY)` |
| 会话级 | `SET max_execution_time`（毫秒；仅只读 SELECT；hint 可覆盖；超时 ER_QUERY_TIMEOUT 3024 / 非只读 3025） | `query_timeout`（默认 900 s）/ `exec_mem_limit`（默认 100 G） | `SET query_timeout`（默认 14400 s）/ `SET query_mem_limit`；语句级 `/*+ SET_VAR(...) */`；按用户 `ALTER USER ... SET PROPERTIES ('session.query_timeout'='600')` | `SET memory_limit='10GB'`（别名 max_memory，默认 80% RAM）；`threads`（默认 # CPU cores）；`temp_directory`；`enable_external_access`（默认 true） |
| 语句级 | 引擎原生无 AST 白名单，仅 `MAX_EXECUTION_TIME(N)` optimizer hint（3025 证明引擎只对只读 SELECT 计时） | 引擎原生无（DEFAULT_ORDER_BY_LIMIT 历史 65535 截断为近邻机制） | 引擎原生无（SET_VAR hint 仅调参） | 引擎原生无；应用实践用 sqlglot `parse_one(...).find_all(exp.Select)` / Vanna 用 sqlparse `statement.get_type() == "SELECT"` 做 parse-then-reject |
| 应用级 | `SELECT ... LIMIT n` 封装 | `SELECT ... LIMIT n` 封装 | `SELECT ... LIMIT n` 封装 | vanna `max_rows_displayed: int = 100` + `page_size: int = 25`（展示层截断）；WrenAI 服务端 row/column-level per-user 管控 |

结构性结论（证据支持）：四层中用户级/会话级是引擎原生能力（各引擎语法齐备且粒度可达 db.tbl）；语句级白名单在四款引擎中均无原生等价物，是应用侧实践（Vanna=客户端 sqlparse 白名单 + Web 出口降级；WrenAI=服务端账号级行列权限）；应用级行数截断普遍在展示/出口层完成，而非执行层。
