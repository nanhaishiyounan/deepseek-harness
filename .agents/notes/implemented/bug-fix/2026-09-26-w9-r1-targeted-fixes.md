# Agent Note: W-round R1 targeted fixes — the tableSettings wire, fail-closed list reads, and the rollback prefix

Status: implemented

English | [中文](2026-09-26-w9-r1-targeted-fixes.zh.md)

## Problem

The W-round final verify (84, FAIL on code-review 40 + design-system 70) located five blocking defects and seven advisory ones, all in the B9 dashboard seam: `--rollback` destroyed zero rows (its uid filter never matched), the kept-page block check counted other batches' blocks, list reads reconciled against a truncated first page, the dashboard tables opened on the oldest backfill day, and all four boards displayed the same full snapshot set because no filter ever reached the request.

## Decision

**The v2 table filter/sort wire is `stepParams.tableSettings.{dataScope,defaultSorting}`, not `resourceSettings.init.filter`.** `resourceSettings.init` feeds only dataSourceKey/collectionName into the resource getter; a `filter` key parked there is dead. The `tableSettings` flow declares no `on`/`manual`, so the engine runs it on beforeRender: the `dataScope` action applies its three-part filter group (`{logic, items: [{path, operator, value}]}`) through `resource.addFilterGroup`, the `sortingRule` action its sort through `resource.setSort`. `flowModels:save` replaces `stepParams` wholesale, so every save carries the complete object. The four pages now write `dataScope.filter` (board `$eq` — the page dimension; chosen over a per-page kpi_code enumeration so adding a code never orphans a board) plus `defaultSorting.sort = [{field: 'calc_date', direction: 'desc'}]`. Verified on the live wire: each page's `kpi_snapshots:list` request carries its own board filter and `sort[]=-calc_date`, and the first screen is today's pass.

**Every list read is fail-closed.** `rowsOf` in kpi-run/w9-dashboards/h5-wms/w6-mfg-exec/mrp-run now throws when `meta.total > rows.length` (or the page came back exactly pageSize long with no total) instead of silently reconciling half a truth — the reconciliation at 1982 snapshot rows over pageSize 1000 was the live failure. `kpi-run` exports the pure gate (`assertFullPage`) so the selftest pins both negative shapes; `reconcile` reads at pageSize 4000.

**`--rollback` matches the prefix `withN17Prefix` actually mints.** `withN17Prefix('w9kpi', tag)` returns `w9kpi${tag}${key}` — no `n17-` separator — so `startsWith('n17-w9kpi')` matched nothing; it is now `startsWith('w9kpi')` (the w7mrp convention). Two adjacent dead wires went with it: `collections:destroy` carried `?cascade=true` after a second `?` (never parsed), and the batch now also drops the kpi_snapshots read-only guard row with the collection. A live rollback destroyed 88 spine models with zero residue across TableBlock/TableColumn/RootPage/BlockGrid/chart rows, the group, and the collection.

**The kept-page check is uid- and ownership-scoped.** `pageHasBlock` now rides the lib's `batchScopedRows` (w9kpi prefix rules out other batches on the same collection — the h5-wms wms_lots ledger) plus `gridOwnerRoutes`/`blockOwnedByPage` (the page's own route rules out sibling w9 pages sharing kpi_snapshots).

**口径 corrections the verify named.** `lot_pass_rate` denominates over judged OQC rows only (pending/empty results never enter — an undetermined batch is not a failure); `PRESENT_ONLY` gains pending_approvals/shortage_alerts/inbound_lines so the 90-day replay stops restating today's todo counts on every historical day.

## Consequences

The `tableSettings` wire is the template for any future v2 table block this harness authors; `resourceSettings.init.filter` must never reappear. `verify` asserts the wire per page (a drifted block fails loudly with the rollback instruction), the read-only guard (admin narrowed to view/list/get/export on kpi_snapshots — kpi-run stays the only writer via the root token), and the fail-closed snapshot read. The business-advisor persona carries the 看板查询 skill (the home 「问经营」 chip no longer lands on a colleague without the capability); the KpiFacts interface declares workCenterCount/oqcInspections and ReportFact.duration_min, retiring three `as`-cast escapes.

## Alternatives considered

- **Per-page kpi_code `$in` filters** — same rendered result, but the enumeration drifts from KPI_DEFS the first time a code is added; the board column is the page dimension the collection already carries.
- **Paginating instead of failing on truncation** — every current caller wants the whole set; the throw names the page size to raise, and pagination arrives when a caller genuinely outgrows it.
- **Silently rewriting an old-wire block in place on re-run** — `flowModels:save` replacing stepParams wholesale makes a partial repair risky to reason about; fail-loud with `--rollback` (a two-minute, fully evidenced rebuild) is the deterministic path.
- **The advisory 「N21 dead-link dangling-bracket ×10」 cleanup** — four scan patterns (empty `[]`, `[text]` with no following `(`, `\]` escapes, brackets adjacent to CJK text) matched only legitimate type/mermaid/KaTeX syntax; unverifiable targets are not blind-edited. Recorded in the deliverables doc.

## Verification

`--rollback` before/after model counts and the zero-residue sweep (`r1-01/02/03`); rebuild + 90-day backfill (1982 rows) + `nocobase-w9-dashboards.mts --verify` OK + `setup-nocobase.mts verify` OK (`r1-04..06, r1-08`); `--reconcile` prints the correct latest (today) with no 「（无行）」 (`r1-07`); `--selftest` green including the new truncation negatives; four-page live screenshots with the DevTools network panel filter/sort URLs (`r1-10..14`, under `research/2026-09-25-w-round/r1-evidence/`); `pnpm vitest run packages/client/ui-mobile packages/connector/tool-nocobase` 660/660; typecheck and oxlint clean on every touched file.
