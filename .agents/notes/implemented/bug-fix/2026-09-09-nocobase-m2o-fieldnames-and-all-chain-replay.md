# Agent Note: NocoBase m2o N/A cells — fieldNames, not appends; one-chain replay

Status: implemented

English | [中文](2026-09-09-nocobase-m2o-fieldnames-and-all-chain-replay.zh.md)

## Problem

Three loose ends from the N13/N14 batches blocked the "reset then single `all` run" promise: the AI-workbench page and the 30/20/40/24 data widening existed only as manually replayed scripts, the CRM quotes page rendered "N/A" in every m2o column, and experiment-era flowModels outlived their deleted test page. N14 had logged the N/A as "list rows lack appends" — that diagnosis turned out to be wrong, and the wrong root cause is the part worth recording.

## Decision

### m2o cells read `fieldNames.label`, not the appended object's shape

Browser capture proved the v1 table request already carries `appends[]=customer&appends[]=deal` (the v1 `BlockProvider` computes association appends from the block schema) and the response rows carry fully expanded association objects. The N/A comes from rendering: `AssociationField`'s `useFieldNames` defaults to `{ label: 'label' }`, and the expanded object has no `label` key, so `InternalViewer` renders `toValue(undefined, 'N/A')`. System fields show the fix — `users.mainDepartment` carries `x-component-props: { multiple: false, fieldNames: { label: 'title', value: 'id' } }`.

Consequence for every REST-created belongsTo field: the uiSchema must name the target's display column. Both module scripts' `belongsTo()` factory now writes `fieldNames: { label: 'name', value: 'id' }`, and `ensureAssociationFieldNames` backfills existing fields through `fields:update`, which deep-merges uiSchema — so the step is idempotent and doubles as the repair path. `stepVerify` asserts `crm_quotes`'s two m2o fields carry `fieldNames.label` so a replayed-from-scratch database cannot regress silently.

### `all` owns the whole replay chain; verify anchors it

The `all` chain now replays `nocobase-n13-rebuild.mts` (default mode: workbench ensure + orphan cleanup), `nocobase-n13-seed.mts` (top-up to the row floors), and `nocobase-n14-fix.mts` (tabs backfill, a no-op safety net since the module scripts create the tabs child at page creation). Verify gained the anchors a wiped database could silently miss: the AI-workbench flowPage route exists, the four widened tables meet their floors (30/20/40/24), and the m2o fieldNames check above. A reset followed by one `all` run yields the full system with zero manual scripts.

### Experiment leftovers are deleted at their owner, and column creation matches the official dual shape

The N13-registered experiment columns (`n13wkcol1-3`) had already been rebuilt by N14 through the UI editor; the surviving residue was the deleted N13 test page's orphaned flowModels. `nocobase-n13-rebuild.mts` now drops that family on every run (`flowModels:destroy` cascades the subtree, so one call removes table + columns; absent uids skip). Fresh workbench columns are saved in the editor's own shape — a `TableColumnModel` plus its `Display*FieldModel` child on subKey `field` with enum `options` in both props — so replayed pages match hand-configured ones instead of relying on the renderer's fallback for the missing child.

### A string column fed an object stringifies

`hub_tk_tickets.customer` is a plain input string field; the old widening factory posted `customer: { id }`, and Sequelize wrote `[object Object]` into 20 rows. The factory passes the company name now, and `repairTicketsCustomer` rewrites marked rows by matching the title prefix (the company vocabulary contains no dash, so `title.split('-')[0]` is exact).

## Alternatives considered

**Patching the list request with explicit appends.** The request already appends; adding `params.appends` to the table block schema would change nothing visible and duplicate what the client computes.

**Deleting and recreating the m2o fields.** `fields:update` merges uiSchema without touching the column or the seeded foreign keys; recreation would drop and rebuild associations for no benefit.

**Leaving the tabs backfill out of the chain.** The module scripts already wire tabs at page creation; the backfill costs one idempotent pass and covers any page a future code path might create the old way.

## Consequences

The quotes page shows customer and deal names (zero N/A across the table), the replay chain is one command end to end, and the fieldNames requirement is now encoded in the factories rather than folklore — the same class of trap as the select-interface and column-name rules recorded in earlier notes. Batch evidence and screenshots: [01-batches.md N16](../../../../plans/nocobase-full-features/01-batches.md) · handoff [handoff-2026-09-08.zh.md](../../../../plans/handoff-2026-09-08.zh.md).
