# Agent Note: W24-B5 graph Neo4j storage + LLM ontology induction (auto-primary, manual fallback)

Status: implemented

English | [中文](2026-10-11-w24-b5-graph-neo4j-ontology-induction.zh.md)

## Problem

「图谱本体功能现在都没完善，显示可以参考 obsidian，要实现给你资料，自动生成本体，手动只是备选」——图谱缺真实图库存储、缺自动本体生成主路径、可视化缺 Obsidian 范式、业务数据未成链入图（孤岛 343+）。

## Decision

1. 新增 `dsh-graph-neo4j`（`ctx.neo4jGraph`：bolt 存储 + 只读 Cypher 闸门 + 只增不改本体版本链 + 业务 ETL manifest）与 `dsh-tool-graph`（`kg_graph_query`/`kg_ontology`），lakehouse-engine 降级模式与 sql-guard 防御范式复用。
2. 新增纯函数库 `dsh-ontology-induction`：分块→OntoGPT 式结构化输出→合并→SHACL 语义闸门→界限修复→确定性 JSON-LD；模型永不写语法。归纳产物以 draft 入 registry v5（模型不可见），手动 KGCL 工作台为备选（修订审计行只增不改）。
3. `kg.graphPage` RPC（global/local/search/node）+ ui-kg Obsidian 画布（react-force-graph-2d 静态导入——单产物 client 契约；全局力导向/Local Graph 跳数/hover 卡/出入边面板），保留 sigma 语料子图为副画布。
4. 湖仓行版本（updatedAt watermark 追加）在 ETL 读侧按 id 去重取最新（item 344→43 与任务书示例一致），对账覆盖 source↔planned↔landed 三层；孤岛 436→375（桥接 223 条 SAME_AS），<100 未达并归因（语料单例无业务名可桥）。

## Implementation notes

- `dsh-graph-neo4j` (`ctx.neo4jGraph`): the bolt connection (password rides the credentials env chain — `.env` refuses `DSH_*` keys, deployments export `DSH_NEO4J_PASSWORD`); a missing password or unreachable server logs one operator warning and every method fails loud with `NEO4J_DRIVER_UNAVAILABLE`.
- Read-only Cypher guard (`cypher-guard.ts`, the lakehouse sql-guard pattern): single read clause (`MATCH`/`OPTIONAL MATCH`/`WITH`/`UNWIND` opener + `RETURN` required); write/DDL/procedure tokens rejected on the literal-stripped text; multi-statement and blank refused.
- Ontology version chain in Neo4j: `__OntologyVersion` nodes store the full JSON-LD document; `storeOntologyVersion` appends only (the previous head loses `head`, gains `PREV`) — never overwrites.
- `dsh-ontology-induction` (pure lib): chunk → structured output (one retry) → merge (first definition wins, later chunks add missing props/constraints) → SHACL gate → bounded repair loop (the repair output REPLACES the merge; a non-improving repair is discarded) → deterministic JSON-LD (`@graph` sorted by `@id`; parsing preserves declaration order via each `sh:NodeShape`'s `sh:property` list; multi-constraint relations carry the authoritative `constraints` list).
- Registry v5 wiring: induced classes register `status: 'draft'` in dependency order (draft order is document order and the registry refuses forward references). The manual fallback = the existing KGCL workbench: one `add_node` op set appends audit revision 3; reruns hit the append-only duplicate refusal, itself the history-preservation evidence.
- Business ETL (`etl.ts` + `examples/kb-agent/scripts/b5-etl-run.mts`): manifest v2 maps lake.carbon item/customer/supplier/salesOrder/purchaseOrder (+ job/location/itemStockQuantities as the first expansion entries beyond the five-core minimum). Lake parquet rows carry versions (updatedAt-watermark appends): the script keeps each id's last row; the line tables and customer read through the same DuckDB stack over a READ_ONLY postgres attach while the web app holds the lake catalog lock. Reconciliation asserts source↔planned all-OK and discloses landed counts (orderedItem 36→34 — two line rows reference items absent from the current item versions).
- Unified graph + islands: the corpus ledger (1139 nodes/794 live edges) imports as the baseline → 436 islands; the business graph (134 nodes/304 edges incl. SO↔customer, SO↔item lines, PO↔supplier, job→SO/item, stock→location) + name bridges (legacy experts/services SAME_AS, 223 edges) → 375 islands (largest component 489→581). <100 not reached: the corpus Concept/Dataset singleton nodes carry no business-table names to bridge; documented next steps are crossSource v2 over carbon sources, the WeKnora entity channel, and mapping the remaining tables.
- `kg.graphPage` RPC + the Obsidian canvas: the apiproxy kg domain gains graphPage (structured refusal `kg-graph-store-not-composed` when the store is absent); ui-kg renders `KgObsidianCanvas` (react-force-graph-2d statically imported per the single-artifact client contract; jsdom specs stub the module like sigma): global view with the island-stats footer, search-to-locate → Local Graph (1–3 hops, breadcrumb), hover cards, and the out/in relations panel with click-through.

## Why these decisions

- **Two packages, not one**: the master plan's §4.1 lists `graph-neo4j` and `ontology-induction` separately; the induction lib stays dependency-free (pure functions, testable without cordis), the store owns the driver — scripts compose both.
- **Guard over driver auth**: Neo4j auth cannot express "read-only session" on Community; the statement-shape guard (pre-driver, pure, unit-tested on every refusal path) is the same defense layer B2 validated for SQL.
- **Version-dedupe at the ETL, not the sync**: the lakehouse's append-only files intentionally keep row versions; the graph wants current state only. Deduping last-writer-wins at read time keeps the sync contract untouched (B2's watermark proof owns that behavior).
- **Neo4j islands metric in TS (union-find)**: GDS is not bundled with Community; a deterministic TS pass over the edge list matches the kb-graph sqlite metric definition exactly (cross-check row in `04-islands-report.json`).

## Operational notes

- Neo4j runs as docker `dsh-neo4j` (image `neo4j:5.26-community` via the `docker.m.daocloud.io` CN mirror; colima x86_64), ports 7474/7687, volume `dsh-neo4j-data`, auth `neo4j/<set at first boot>`.
- The ETL clears the graph (`MATCH (n) DETACH DELETE n`) at start for reproducible runs — reruns rebuild the identical state (idempotent MERGE by gid would converge anyway, but the report then reflects exactly one run).
- `kg_node_types` in the kb-agent sqlite ledger now carries the induced draft classes (revision 3 audit row); draft entries stay out of model-facing enumerations until the workbench promotes them.

## Consequences

- 新增运行依赖 `neo4j-driver`（Apache-2.0）与 client 依赖 `react-force-graph-2d`（MIT）；THIRD_PARTY_NOTICES 由门禁再生成。
- kg 域面扩 `kg.graphPage`（新错误码 `kg-graph-store-not-composed`/`kg-node-not-found`）；connection/runtime 两套 fixture 同步扩。
- kb-agent sqlite 账本新增归纳 draft 类与修订 3 审计行（append-only）；重跑命中重复注册即历史保全证据。
- 孤岛收敛至 375（<100 未达），归因与下一步已写入证据 04-islands-report.json——B6+ 的 crossSource v2 与 WeKnora 实体通道接手。

## Alternatives considered

- GDS 连通分量 vs TS union-find：Community 版不带 GDS，且与 kb-graph sqlite 同算法口径可直接对账——选 TS。
- 修复循环「重复合并」vs「修复输出替换合并」：实测前者让违规约束残留（repair 追加不消除）——改为替换语义。
- 动态 import react-force-graph-2d vs 静态：单产物 client 契约禁止 chunk——静态导入，jsdom 用模块 stub（sigma 同法）。
