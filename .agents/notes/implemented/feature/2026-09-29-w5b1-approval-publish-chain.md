# Agent Note: W5-B1 approval-flow publish chain — graph → wfl one-way compile, fail-loud gates, atomic CAS publish

Status: implemented

English | [中文](2026-09-29-w5b1-approval-publish-chain.zh.md)

- Date: 2026-09-29
- Status: implemented
- Scope: `examples/kb-agent/scripts/approval-engine.mts` (compiler + publish verb + selftest matrix), `examples/kb-agent/scripts/w5b1-publish.mts` (evidence runner), `examples/kb-agent/designer/src/` + `dist/` (publish button + feedback + published tag), `examples/kb-agent/scripts/nocobase-w3-approval-visual.mts` (textarea retirement), `examples/kb-agent/demos/acceptance-w5/b1-capture.mjs`

## Problem

B0 persisted the designer graph as the editing truth but the engine still consumed the seeded states/transitions rows — editing a canvas changed nothing at runtime, and the config center still edited approver_map/extras through hand-written JSON textareas (the user's original complaint). Publishing needed: a one-way compiler from graph to engine rows, fail-loud gates, a reverse importer proving the compiler faithfully reproduces current rows before replacing them, and an atomic publish that races safely against concurrent saves.

## Decision

**graph stays the editing truth; publish derives the wfl rows through fixed vocabulary templates with canonical roles; every publish passes a round-trip equivalence gate first; the write is one data-modifying-CTE statement.** The engine's transition code never changes (the B1 red line).

- `compileGraphToRows(graph, ctx)` maps the main chain (cc nodes collapse as pass-throughs) onto the seed templates: doc vocabulary → 6 states + the 8 PILOT-shape transitions with roles `manager`/`gm`; admission vocabulary → 4 + 4 with `srm_manager`. Canonical role keys (not node ids) make derived rows byte-match the seeds, which is what makes the reverse importer and the equivalence assertion exact inverses. The optional condition node compiles to the two-level amount routing: `extras.amount_field`/`amount_threshold` plus the `field <= N` literal on the direct-approve row (the code-side `nextStateOf` threshold stays authoritative); no condition → those extras keys are deleted (graph-owned keys only — invoice_match_tolerance passes through).
- Gates (all collected, all readable, every refusal 400 with the full list): structural (via validateFlowGraph), orphan nodes, exactly-one start, at-least-one end, cycles (DFS gray/black, reported before degree symptoms), reachability, per-kind degree contracts, the condition DSL (exactly one row, op `>`, numeric value, field inside the /designer/meta vocabulary), and the engine-consumable feature matrix — B1 publishes user/role assignees (roles snapshot to usernames at publish through the psql rolesUsers join), or-sign-off, and autoReject/transferAdmin empty policies; supervisorChain/formField/deptLeader/sequential/countersign/autoPass/assignUser refuse with B2-annotated reasons (each needs runtime semantics the zero-change engine cannot express).
- `rowsToGraph` reverses live rows into a graph draft (the ≤ literal becomes the condition node's `field > N` row; structural two-level flows without a literal — the pur_rfqs shape — import as two approvals without a condition). The publish route first re-derives the CURRENT rows through import + compile + `assertRowsEquivalent` (role keys normalized through the approver_map values) and refuses on any drift — the compiler must prove it can reproduce the live config before it is trusted to replace it. All three live shapes round-trip: threshold two-level (pur_orders), structural two-level (pur_rfqs), admission (srm_suppliers).
- `POST /flow-graph/publish {doc_type, base_version}` rides the same graph_version CAS counter as save (a concurrent save/publish pair lands exactly one winner; live evidence: two rounds, one 200 + one 409 each). The rewrite is ONE psql statement: `WITH bumped AS (UPDATE wfl_flow_configs SET … WHERE id AND doc_type AND graph_version = base RETURNING id)` plus DELETE/INSERT arms all keyed to `bumped` — a lost CAS no-ops every arm. A multi-statement string would NOT do this: psql's implicit transaction commits a clean "UPDATE 0" and would still run the DELETEs (derivation landing with no version move). The pre-publish rows snapshot into config_note as the replayable rollback anchor; `published_graph_version`/`published_at` columns (idempotently added) feed the designer's published tag and /designer/meta.
- The designer topbar gains 发布 (auto-saves dirty edits first, chains onto the returned version): success shows the derived stats (N states / M transitions, vocabulary, roles, timestamp), refusal lists every gate error line by line, 409 prompts a reload. The config-center textarea channel retired: CONFIG_EDIT_FIELDS/CONFIG_CREATE_FIELDS drop approver_map/extras, and `retireTextareaEditing` destroys the four persisted FormItemModels (row-edit + add-new forms) plus their child field models and heals the FormGridModel layout rows; --assert now fails if any w3b4 form binds those fields again.

## Pitfalls (now encoded)

- **A publish refusal must not bump the version**: the negative matrix asserts `graph_version` unmoved after each 400 — gates run entirely before the CTE, and the browser publish also bumps the counter (a scripted save after an in-browser publish 409s unless it re-reads the version).
- **`SELECT user` in psql evaluates to CURRENT_USER** (the DB role), not the todos column — quote `"user"` or every todo-owner assertion silently reads `nocobase`.
- **role keys are canonical, not node ids**: byte-matching the seed templates is what lets assertRowsEquivalent compare live and derived rows exactly; inventing per-node role keys would break round-trip and the W3 consistency probe's threshold-literal alignment.
- **The row Edit action opens an in-place ChildPage (role=dialog), not a drawer** — deeper links (`/view/<tree-uid>/filterbytk/<id>`) render the same form and are the stable capture path; two edit trees exist on the page, so "first 编辑 button" can open the detail view instead.

## Consequences

- Evidence (`w5b1-publish.mts --run`, all real PG + real engine HTTP): snapshot → reverse-import baseline → scripted designer edit (level-1 approver admin→chenliqun) → publish 200 (6 states / 8 transitions, published_at set) → psql asserts (approver_map carries the edit, row counts match, allowed_role resolves) → ten-case HTTP negative matrix (each 400 + readable + version unmoved) → real RFQ run (submit → chenliqun todo → approve → approved, records 2, todo closed) → save∥publish CAS race ×2 (exactly one winner each) → rollback republish (rows equal the pre-run snapshot) → regression run (todo lands on the baseline approver again) → cleanup (0 residue, diff disclosed).
- `--selftest` gains the compiler matrix (gate negatives, compile positives, both round-trips, threshold-drift detection); `w5b1-publish.mts --selftest` runs it standalone. R1 regressions all green: `w5r1-concurrent-cas` PASS, `pnpm run lint` at the 26-error baseline, designer `tsc --noEmit` clean, engine `--selftest` OK, `setup-nocobase.mts verify` full chain OK (including the w3b4 consistency probe over the published rows).
- Screenshots `demos/acceptance-w5/b1-01..04` (publish success modal + published tag, refusal list with the orphan node visible on canvas, the run's open todo JSON, the retired edit form showing only 流程名/激活/配置变更留痕); capture script `b1-capture.mjs` is repeatable and leaves the flow restored + republished.

## Alternatives considered

- Multi-statement psql transaction (BEGIN/UPDATE/DELETE/INSERT/COMMIT) — rejected: the CAS check would need a second round-trip with a crash window between "version moved" and "rows rewritten"; the single CTE statement is all-or-nothing by construction.
- Per-node role keys derived from node ids — rejected: breaks byte-equivalence with the seed templates and the round-trip gate; canonical manager/gm/srm_manager keep the engine row vocabulary closed.
- Compiling supervisorChain/formField/deptLeader/countersign onto approximations (all-members department, any-one-approves) — rejected: silent semantic widening; each refuses at publish with a readable B2 pointer instead.
