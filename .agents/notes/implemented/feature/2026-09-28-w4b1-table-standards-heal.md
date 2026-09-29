# Agent Note: W4-B1 table standards heal — five factory functions and the 78-page sweep

Status: implemented

English | [中文](2026-09-28-w4b1-table-standards-heal.zh.md)

- Date: 2026-09-28
- Scope: `examples/kb-agent/scripts/nocobase-flow-page-lib.mts` (W4-B1 section), `examples/kb-agent/scripts/w4-heal-b1.mts`, `research/2026-09-28-w4-completeness/.audit-analyze.mjs`, `setup-nocobase.mts` verify
- Evidence: `research/2026-09-28-w4-completeness/w4-b1-*` (heal-run pilot/crm/hub/manufacturing/procurement/quality/salesPlanning/supplyChain/warehousing · rollback-drill · audit basis)

## Problem

The W4 completeness audit found the 78-page table surface failing five standards platform-wide: 78 pages without default sort, 37 without a page-level filter, 151 unformatted money columns, unformatted date columns, 101 association columns showing raw ids, and 14 bare-text status columns. Regenerating pages would discard W3's per-page bindings, so the fix heals the existing trees in place.

## Decision

The platform-wide table standards (default sort / page-level filter / money and date formats / association titleField / status colors) are healed through five flow-page-lib factories plus one sweep script, not by regenerating pages:

- `applyTableDefaultSort` writes the sort to **three homes**: `props.globalSort` (the interaction fallback the table reads), `resourceSettings.init.params.sort` (server-side marker), and the sorted column's `sorter`/`defaultSortOrder` (the visible column-header arrow). The v2 client never applies a persisted sort to the initial list request — verified live: none of the three homes reaches the first `:list` query, and the official Default-sorting settings panel behaves the same. The three-home write is the compatible maximum; first-page ordering stays the platform default until the user interacts.
- `ensureFilterForm` rides `flowSurfaces:addBlock 'filterForm'` with the field list **in the addBlock payload** (object form carrying `defaultTargetUid`). A follow-up `addField` per field duplicates both the field item and the `filterManager` connection — verified live on the pilot page. Association filter fields need `defaults.collections.<target>.fieldGroups` covering **every** non-relational field of the target collection; partial lists are rejected.
- `rebindColumnTitleField`/`enumizeColumn` (via `rebuildColumnField`) destroy the old field subnodes first, then save the replacement, then rewrite the column metadata through `updateSettings`. The destroy step is what makes a swap idempotent — without it each re-run stacks another field submodel under the column. Column props (width/fixed/sorter) are never touched, so a swap cannot drop them.
- `applyColumnDisplayProps` and the sort write go through `flowModels:save` after a read-back merge, because the `updateSettings` props domain rejects the render keys (`globalSort`, `format`, `separator`).

## Pitfalls the heal encodes

- `updateSettings` on the REST wire takes the payload directly (`{target, props}`), not wrapped in `{values}`; `flowSurfaces:get` only accepts `GET ?uid=`.
- Identifier columns (`id`, `*_id`, FK integers) are excluded from number formatting — a thousand-grouped id column is wrong semantics; the audit probe and `--assert` exclude them too.
- Enum options: values covered by the platform palette are forced to the Chinese label (the 维保 English remnants ride here); unknown values keep their existing label.
- `rollback --domain X` must scope **every** journal entry kind to the selected pages. The first version filtered only `tableSort`; rolling back one domain reverted field props and column swaps platform-wide. Clearing a missing key with `null` crashes enum renderers (destructure defaults do not absorb null) — array-valued keys clear to `[]`.
- The flat `fields:list` rows do carry `collectionName` (the initial suspicion was wrong); `/api/collectionFields:list` 404s on this deployment.

## Consequences

`w4-heal-b1.mts --assert` recomputes the five defect counters live over the 78-page/101-table audit basis and fails closed; `setup-nocobase.mts verify` spawns that assert. The archived probe (`.audit-fetch.mjs` + `.audit-analyze.mjs`) uses the same semantics: filter = FilterActionModel **or** a live `filterManager` connection, sort = `globalSort` first, money/date/rel/status counters as above. Before → after: pagesNoSort 78→0, no-filter pages 37→0 (FilterFormBlockModel 0→38), money unformatted 151→0 (145 counted after the 6 identifier columns are excluded), date unformatted →0, association columns without titleField 101→0, bare-text status columns 14→0, enum columns missing colors 2→0.

## Known gap

The h5-built WMS pages (库存查询/盘点管理) render only the actions column header; the column models are intact and the same heal shape renders fine on n17/w3 pages. Reverting one swapped column did not restore the headers, so the gap predates or is orthogonal to the heal — left for B2 to examine with the form-side pass.

## Alternatives considered

- Wholesale page regeneration — rejected: it discards the W3 ACL bindings, jump actions, and guarded edits the pages already carry.
- `flowSurfaces:updateSettings` for every write — rejected: its props domain rejects the render keys (`globalSort`, `format`, `separator`), so render-key writes ride `flowModels:save` read-merge instead.
