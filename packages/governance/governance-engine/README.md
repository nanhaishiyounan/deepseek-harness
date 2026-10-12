# @deepseek-ai/dsh-governance-engine

English | [中文](README.zh.md)

Governance engine provider: implements `ctx.governance` over a SQLite store (lineage edges, quality rules, alert events), live five-source inventory collectors, the lakehouse-backed quality evaluator, and an optional webhook channel for alert delivery (Config-switched, off by default). Collectors degrade per source — Neo4j falls back to the kg-graph SQLite registry and the WeKnora API to the kb-sqlite document table — so a deployment without external credentials still inventories all five sources (B6: 252 assets). Quality evaluation resolves the lakehouse engine lazily inside `evaluate()`: plugin load order cannot break it, and a deployment without the engine keeps every other surface working.

## Model Experience

Indirectly, through the gateway governance domain the panel renders; the engine registers no prompt, schema, or tool of its own.

#### KV Cache effect

None: engine reads and evaluations never enter a request on their own; records surface only through gateway responses a session explicitly requests.

## Known Limitations and Deferred Work

- Quality evaluation needs the lakehouse engine; without it `evaluate()` reports the structured refusal while inventory, lineage, rules, and alerts keep working.
- Rule evaluation runs on demand (`evaluate()` and the panel's run button); no scheduled evaluation exists yet, so alert events appear only when something evaluates or records.
- The webhook channel delivers alert events only; rule-change and inventory notifications arrive with a richer notification surface.
- Lineage edges are recorded, not derived: ingestion pipelines and sync runs append them explicitly, so hand-run jobs outside those pipelines leave no edge.
