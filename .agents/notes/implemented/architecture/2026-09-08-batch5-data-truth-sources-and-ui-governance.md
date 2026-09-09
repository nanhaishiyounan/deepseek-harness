# Agent Note: Batch-5 data truth sources, workflow-trigger residue, and targeted UI governance

Status: implemented

English | [中文](2026-09-08-batch5-data-truth-sources-and-ui-governance.zh.md)

## Problem

The workbench's business face was thin (20 market cards mostly e2e/demo residue, one real expert profile, orders clustered into four noisy days, 25 corpus documents, 567 graph nodes) while the seven pages carried audited clutter: system tables (Roles/Users) and an untranslated `{{t("Roles")}}` key inside the business-object switcher, a placeholder option as its first entry, the trajectory tab wedged mid-ring against the design baseline's ordering, a 37-item KG legend with duplicated "expert" labels and no context, and a connector page whose delivery timeline was an exposed empty state.

## Decision

Three decisions, each preserving what already worked:

1. **Expansion truth sources live in their own files; dataset.json stays untouched.** `workspace/data/experts/dataset.json` is the authoritative 张红喜 dataset consumed by six test surfaces — `seed-experts.spec.ts` asserts exact counts (`{ experts: 1, expertServices: 3, datasets: 3, sourceRows: 3 }`) and three spec suites' mock servers and snapshots feed off its row content. Batch-5 expansion therefore uses `workspace/data/experts/roster-batch5.json` (32 experts + 49 services + 23 knowledge assets) and `workspace/data/market/assets-batch5.json` (63 assets across eight domains), each seeded by a per-domain script (`seed-experts-roster.mts` / `seed-market.mts` / `seed-orders.mts` / `seed-lakehouse.mts` / `seed-kb.mts`) idempotent by name / title / `ORD-B5-` prefix / table name / (tenantId, sourcePath). Market-asset metadata (domain/source/pricing/summary) lands as first-class fields: `seed-market.mts` extends the `datasets` collection idempotently, and the connector-nocobase provider picks `summary` into descriptionFields (card blurbs) and the new fields into searchable.
2. **Seeding history into `orders` must sweep the collection trigger's residue.** Measured on NocoBase 2.2.6: with the production workflow toggled off, the CREATE collection trigger still queues an execution per created row, parked at the manual node. The seed's 24 pending manual tasks later got resolved by `demo-full-journey`'s `drainPendingApprovals` prelude, whose residue executions POSTed to the demo's already-closed ephemeral callback port (ECONNREFUSED) and stalled scenario 3 at "order status delivered". `seed-orders.mts` therefore destroys pending executions and manual tasks whose order numbers carry the seed prefix after seeding; same-cause historical residue (kg-build scenario ⑥) was swept by hand. Any bulk insert into `orders` carries the same sweep.
3. **UI governance follows the 02-design baseline with minimal targeted fixes** (each audited item got a fix/keep verdict): the switcher filters NocoBase admin-plane collections (listMeta has no system flag; the list lives in ui-business citing 02-design §3.4) and auto-selects the first business object; trajectory's tab order moves 10→15 behind the four business tabs; the KG legend groups by source into "general types" and "business data types"; the market catalog gains 24-per-page load-more pagination; domain tag strings render with interpunct separators. `Session log` belongs to the shared session-log-export plugin — recorded, not changed.

## Consequences

- The business face is operationally thick: 174 market items (63 assets + 23 knowledge assets + 33 experts + 52 services), 46 corpus documents with real embo-01 embeddings, three lakehouse tables (240/120/108 rows) with a delivery-trail record each, 24 historical orders across 30 days, and a 1280-node / 858-edge graph whose subgraph spot check (张红喜, 2 hops) returns 72 nodes including every orderable service and the order cluster.
- Tests that pinned the old expert-card description format (comma-joined domains) were updated with the behavior; the locale pairs and market pagination string landed bilingual.
- NocoBase row counts and the DSH pages agree (experts 33 / expert_services 52 / datasets 89 / orders 92), and the seed scripts re-run with zero duplicates.

## Alternatives considered

- Extending dataset.json directly: rejected — it breaks six test surfaces by construction and couples demo-scale fixtures with operational data.
- Pausing the production workflow around order seeding (WorkflowLease): rejected after measurement — the trigger queues regardless; the sweep is the only reliable close.
- Serving a paged `assets.list` from the BFF: deferred — the catalog fits one response today; the client-side load-more covers the audited density without a wire change.
