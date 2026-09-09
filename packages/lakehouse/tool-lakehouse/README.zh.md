# @deepseek-ai/dsh-tool-lakehouse

[English](README.md) | 中文

湖仓能力缝（`ctx.lakehouse`）之上的模型可见工具 `lakehouse_tables` 与 `lakehouse_query`。本包只拥有 schema、参数校验、提示词指引、预算与呈现，从不引入具体的 catalog 或引擎 provider。租户是部署侧绑定（`Config.tenant`，必填）：模型永远不提供租户，任何调用携带 `tenant` 实参都会被拒绝。开关控制工具注册；引擎不可用时已注册的工具保持可见，在执行时以结构化错误失败——即能力缝文档化的降级模式（此时表清单仍可应答）。

## 工具

- **`lakehouse_tables`** — 列出绑定租户已注册的表：每张表的列、SQL 类型、行数与格式；传 `table` 可收窄到单表（未知表名响亮失败）。渲染出的清单以 schema 优先，模型可立即写 SQL；空清单会说明表格数据经统一上传通道落地。默认预算 10 秒。
- **`lakehouse_query`** — 在绑定租户已注册的表上执行单条只读 SQL。引擎只会看到该租户的表，因此跨租户引用会以"未知表"失败。规范值携带列元数据、行集、截断标记（能力缝的 `maxRows` 上限）与 `tables_used`（按词边界匹配语句中出现的已注册表）。渲染文本是 markdown 表格，附 `Data source: lakehouse table <名>` 溯源行与"回答中注明来源表"的常驻指引。默认预算 30 秒；只读，可并发。

## 配置（schemastery）

- `tables?: boolean` — 是否注册 `lakehouse_tables`（默认 `true`）。
- `query?: boolean` — 是否注册 `lakehouse_query`（默认 `true`）。
- `tenant: string`（必填）— 所有工具操作的部署侧租户绑定。
- `tablesTimeoutMs?: number` — `lakehouse_tables` 的协作预算（默认 `10000`）。
- `queryTimeoutMs?: number` — `lakehouse_query` 的协作预算（默认 `30000`）。

## 扩展点

`ctx.lakehouse` 以下皆可替换：catalog store（现为 `dsh-lakehouse-sqlite-catalog`）与查询引擎（现为 `dsh-lakehouse-duckdb`）注册在能力缝上，本包不 import 任何一个。`maxRows` 截断是缝运行时的配置而非工具参数——工具只透传标记，不重复设限。

## 呈现（UI render intent）

两个工具都渲染 `generic` 卡：等待中的卡以所问表名或语句首行（截断）命名；完成后的卡复述表/行合计（tables）或行数、截断标记与来源表（query）。呈现是 `args` + `meta` 的纯函数，可从会话日志回放。


## 模型体验（Model Experience）

### 系统提示

#### 模型看到什么

工具启用时系统提示携带两段指引，逐字如下。

##### lakehouse-tables guidance

```markdown
Use the lakehouse_tables tool before writing SQL: it lists the tenant's registered lakehouse tables with each table's columns, SQL types, and row counts. When asked for numbers, statistics, aggregates, or record lists that live in uploaded tabular data, call lakehouse_tables first, then query with lakehouse_query.
```

##### lakehouse-query guidance

```markdown
Use the lakehouse_query tool to run one read SQL statement (SELECT) over the tenant's registered lakehouse tables when a question needs numbers, statistics, aggregates, or record lists. Call lakehouse_tables first to see the exact columns and types. Results are capped rows plus a truncation marker; the output names the source tables — mention them in your answer. For document passages and prose facts, use kb_search instead.
```

#### Token 开销

两段固定开销指引（约 120 token），每个组合注册一次——相对工具自身的 schema 可忽略。

#### KV Cache 影响

按 section 名索引的静态文本，跨会话完全一致，位于每个缓存前缀的头部。

### 工具 schema

#### 模型看到什么

模型看到生成的 [`lakehouse_tables` 与 `lakehouse_query` schema](../../../docs/tool-catalog.zh.md#deepseek-aidsh-tool-lakehouse)。`lakehouse_tables` 声明一个可选 `table` 字符串；`lakehouse_query` 声明一个必填 `sql` 字符串。二者都不声明 `tenant`。

#### Token 开销

两个 schema 合计约 60 token，是组合中最小的一档。

#### KV Cache 影响

静态 schema 文本，缓存稳定。

### 查询结果

#### 模型看到什么

结果行的 markdown 表格、命中上限时的截断提示、`Data source: lakehouse table <名>` 溯源行，以及"回答中注明来源表"的常驻指引。NULL 单元格渲染为 `NULL`；单元格内的竖线与换行转义。

#### Token 开销

随行×列线性增长，受缝的 `maxRows`（默认 200）封顶。溯源行与指引合计常量约 40 token。

#### KV Cache 影响

工具结果是按轮内容，永不进入缓存前缀。

## 已知限制与遗留工作

- `tables_used` 溯源是对 SQL 文本与已注册表名做词边界扫描：在字符串字面量里出现的表名可能被误归因（单条只读语句无法动态构造表名，故实际影响面极小）。
- 结果上限是缝的 `maxRows`，没有翻页参数。截断提示引导模型收窄查询——刻意保持面最小。
- 写 SQL（CREATE/INSERT/UPDATE/DELETE）不在范围内：入库归上传通道（`data.upload`）所有，provider 无法以只读形式暴露的语句会被引擎包装层拒绝。
