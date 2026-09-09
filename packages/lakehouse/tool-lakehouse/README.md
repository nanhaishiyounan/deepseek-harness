# @deepseek-ai/dsh-tool-lakehouse

English | [中文](README.zh.md)

Model-facing `lakehouse_tables` and `lakehouse_query` tools over the lakehouse seam (`ctx.lakehouse`). This package owns schemas, validation, prompt guidance, budgets, and presentation, never concrete catalog or engine providers. The tenant is a deployment-side binding (`Config.tenant`, required): the model never supplies one, and a `tenant` argument on any call is rejected. Enablement controls tool registration; an enabled tool remains visible when no query engine is usable and fails with a structured error at execution time — the seam's documented degraded mode, where the catalog listing keeps answering.

## Tools

- **`lakehouse_tables`** — lists the bound tenant's registered tables with each table's columns, SQL types, row counts, and formats; pass `table` to narrow to one table (an unknown name fails loud). The rendered inventory is schema-first so the model can write SQL immediately; an empty inventory explains that tabular uploads land through the data upload channel. Default budget 10 s.
- **`lakehouse_query`** — runs one single-statement read SQL query over the bound tenant's registered tables. The engine only ever sees that tenant's tables, so cross-tenant references fail as unknown tables. The canonical value carries the columns, the row set, the truncation marker (the seam's `maxRows` cap), and `tables_used` — the registered tables the statement names, by word-boundary match. The rendered text is a markdown table plus a `Data source: lakehouse table <name>` attribution line and a standing instruction to name the source tables in the answer. Default budget 30 s; concurrency-safe (read-only).

## Configuration (schemastery)

- `tables?: boolean` — register `lakehouse_tables` (default `true`).
- `query?: boolean` — register `lakehouse_query` (default `true`).
- `tenant: string` (required) — the deployment-side tenant binding every tool operates on.
- `tablesTimeoutMs?: number` — cooperative budget for `lakehouse_tables` (default `10000`).
- `queryTimeoutMs?: number` — cooperative budget for `lakehouse_query` (default `30000`).

## Extension points

Everything below `ctx.lakehouse` is swappable: the catalog store (`dsh-lakehouse-sqlite-catalog` today) and the query engine (`dsh-lakehouse-duckdb` today) register on the seam, and this package never imports either. `maxRows` truncation is the seam runtime's config, not a tool knob — the tool reports the marker rather than re-capping.

## Presentation (UI render intent)

Both tools render `generic` cards: the pending card titles by the asked table or the statement's first SQL line (capped); the completed card restates the table/row totals (tables) or the row count, truncation flag, and source tables (query). Presentation is a pure function of `args` + `meta`, replayable from the session log.


## Model Experience

### System prompt

#### What the model sees

Two guidance sections ride the system prompt while the tools are enabled, verbatim below.

##### lakehouse-tables guidance

```markdown
Use the lakehouse_tables tool before writing SQL: it lists the tenant's registered lakehouse tables with each table's columns, SQL types, and row counts. When asked for numbers, statistics, aggregates, or record lists that live in uploaded tabular data, call lakehouse_tables first, then query with lakehouse_query.
```

##### lakehouse-query guidance

```markdown
Use the lakehouse_query tool to run one read SQL statement (SELECT) over the tenant's registered lakehouse tables when a question needs numbers, statistics, aggregates, or record lists. Call lakehouse_tables first to see the exact columns and types. Results are capped rows plus a truncation marker; the output names the source tables — mention them in your answer. For document passages and prose facts, use kb_search instead.
```

#### Token effect

Two fixed-cost guidance sections (~120 tokens), registered once per composition — negligible against the tools' own schemas.

#### KV Cache effect

Static text keyed by section name; identical across sessions, so it sits at the head of every cached prefix.

### Tool schemas

#### What the model sees

The model sees the generated [`lakehouse_tables` and `lakehouse_query` schemas](../../../docs/tool-catalog.md#deepseek-aidsh-tool-lakehouse). `lakehouse_tables` declares one optional `table` string; `lakehouse_query` declares one required `sql` string. Neither declares `tenant`.

#### Token effect

~60 tokens for both schemas — among the smallest in a composition.

#### KV Cache effect

Static schema text; cache-stable.

### Query result

#### What the model sees

A markdown table of the result rows, a truncation note when the cap was hit, a `Data source: lakehouse table <name>` attribution line, and the standing instruction to name the source table(s) in the answer. NULL cells render as `NULL`; pipes and newlines inside cells escape.

#### Token effect

Linear in rows × columns, capped by the seam's `maxRows` (default 200). The attribution and instruction add a constant ~40 tokens.

#### KV Cache effect

Tool results are per-turn content; they never enter a cached prefix.

## Known Limitations and Deferred Work

- `tables_used` attribution is a word-boundary scan of the SQL text against registered table names: SQL that builds a table name dynamically (impossible in a single read statement) or references a table inside a string literal could mis-attribute.
- The result cap is the seam's `maxRows`; there is no paging parameter. The truncation note tells the model to refine the query — deliberate, to keep the surface minimal.
- Write SQL (CREATE/INSERT/UPDATE/DELETE) is out of scope: uploads own the load path (`data.upload`), and the engine wrapper rejects statements the provider cannot expose as reads.
