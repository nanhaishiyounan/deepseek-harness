# Agent Note: upgrading NocoBase v1 uiSchema pages to v2 flowPages (factory + AI wiring)

Status: implemented

English | [中文](2026-09-13-nocobase-v1-to-v2-flowpage-upgrade.zh.md)

## Problem

The plugin-ai experience (floating ball, in-form AI-employee fill) renders only on v2 flowModel pages. A v1 uiSchema page has no mount point: the ChatButton returns null on v1 pages and no v1 SchemaComponent exists for the AIEmployeeButtonModel. The 项目管理 group shipped as six v1 pages, so its users saw none of the AI surface — the second user report of "no AI linkage" came from a hand-configured Add-new popup on the v1 项目 page.

## Decision

Upgrade table pages by replicating the N17d seed factory (`examples/kb-agent/scripts/nocobase-e1-pj-v2.mts`); never extend vendored plugin-ai.

- **Same-title swap**: find the v1 `desktopRoutes` row by title, merge `{title, parentId, icon, sort, schemaUid}` into the rollback file keyed by title (read-modify-write upsert, so batched runs never overwrite each other) and flush it to disk BEFORE the destroy, create a `flowPage` row in the same menu slot, then save the flowModels tree (RootPageModel → BlockGridModel → TableBlockModel → columns → AddNewActionModel with nested ChildPageModel→ChildPageTabModel→BlockGridModel→CreateFormModel→FormGridModel → RefreshActionModel).
- **Kept requires a tree-integrity check**: a same-title flowPage alone is not enough — re-list flowModels and assert the collection's TableBlockModel, CreateFormModel, and `submit-<formUid>` still exist; any miss marks the page truncated, and every E1 page is torn back to its v1 row (rebuilt from the rollback record) and rebuilt as one batch (per-page healing would destroy each other's trees — n17e1* rows carry no page marker). RouteModel rows are deliberately not asserted: flowModels:save answers 200 to `{use:'RouteModel'}` but never persists it, and every rendered page proves the trees mount without it. A page still incomplete after the heal pass fails loud instead of staying a silent blank.
- **Field kinds beyond the N17 set**: the factory previously generated only input/select/number. m2o edit = `RecordSelectFieldModel` (the flow-engine default for every association interface, `service-helpers.ts`), m2o display = `DisplayTextFieldModel` (field-type-resolver's non-form branch), date = `DateOnlyFieldModel`/`DisplayDateTimeFieldModel`, boolean = `CheckboxFieldModel`/`DisplayCheckboxFieldModel` (core-field-default-bindings matrix). No extra props: `fieldSettings.init.fieldPath` carries the association semantics and the server resolves the rest.
- **m2o display needs target-collection `titleField` metadata**: `users` ships `titleField=nickname` (owner/assignee cells render), but the seed-created hub_pj_* collections lacked one and their project column rendered blank until the script ensured `titleField` on each collection (a top-level column on the collections API, not an options key). Any future m2o column onto a self-built collection needs this check.
- **Self-mount the submit actions**: `FormSubmitActionModel` is normally ensured by n17's pass over top-level CreateFormModels, but the all chain runs n17 before the E1 script — a fresh E1 popup would ship without a submit button. The upgrade script mounts its own (`submit-<formUid>`, same wire as N17).
- **AI buttons are not re-written**: n18's idempotent scan mounts `AIEmployeeButtonModel` on every top-level CreateFormModel automatically; the embedded form uid is server-generated, so button uids are `n18ai-<serverUid>` — rollback matches orphans by form-uid absence exactly like n18's self-heal.
- **Rollback**: `--rollback` first destroys the `n17e1*` flowModels (the embedded forms and their n18ai- buttons cascade away with them), then sweeps orphaned buttons against the post-destroy list — orphans must be judged AFTER the teardown (in a pre-destroy snapshot every E1 button points at a live, doomed form, so the match never fires) — and finally re-creates the recorded v1 rows pointing at their original schemaUids. `desktopRoutes:destroy` does not cascade uiSchemas (probed: row count unchanged), so the v1 tree survives as a non-rendered orphan and the rollback restores the hand-configured popup too.
- **Required title fields**: the three popups' name/title fields carry `required: true` on the FormItemModel props (the same slot the flow-engine `required` step writes), so formily blocks the empty submit in the browser with zero requests; an idempotent sweep backfills already-upgraded pages — flowModels:save merges, keeping the field binding and other props.
- **Full-list guardrails**: every flowModels/desktopRoutes list call asserts `meta.total ≤ returned rows` and fails loud otherwise (a truncated list would silently hide rows from the kept-check and the orphan sweep).
- **Known boundary (F1 revision)**: this note first claimed the 2.2.6 flowModel catalog has no block model for kanban/calendar/gantt — F1 refuted the first half: kanban and calendar ship all four evidence layers (plugin client-v2 registrations, flow-engine node-use-sets whitelisting, support-matrix all-true, official fixtures) and were upgraded by `nocobase-f1-view-v2.mts` (see the [v2 view-block upgrade note](2026-09-13-nocobase-v2-view-block-upgrade.md)). Gantt stays v1: plugin-gantt's client model is registered but absent from flow-engine's server authoring surface (not in node-use-sets or the support matrix, no fixture, no `.define()` metadata) — a programmatic wire has no contract protection and is not UI-maintainable, so it is not worth shipping. The fact that v1 view pages get no floating ball (plugin-ai client hard-codes it) still stands.

## Alternatives considered

**Hand-configure AI components on the v1 page through the UI editor.** Rejected: plugin-ai registers no v1 SchemaComponent/Initializer, so there is nothing to drop onto a v1 tree; adding one means modifying the vendored plugin.

**Replace RecordSelectFieldModel with RecordPickerFieldModel.** Rejected for this surface: the resolver's form-container default for text-type relations is RecordSelect (a dropdown), which is what "pick the owner from a list" wants; the picker form is the popup-selector flavor.

**Defer date/boolean kinds.** Kept: both edit models exist in the core binding matrix and saved + rendered on the first try; dropping them would have shipped a form narrower than the v1 popup it replaced.

## Consequences

- Three table pages (项目/任务列表/里程碑) render with the floating ball, a ten/eight/five-field Add-new popup (m2o dropdowns listing the nine AI-employee users, date pickers, enum selects), submit buttons, and table columns showing related-record names (`demos/acceptance-e1/`, 8 screenshots + probe notes + pg_dump + rollback records).
- The all chain asserts eleven v2 flowPages and eleven `n18ai-` buttons; `nocobase-hub-modules.mts` skips block replay for flowPage-owned titles, so its rerun stays a no-op against upgraded pages.
- Future page upgrades (e.g. kanban v2 when a block model lands) reuse this factory: extend the kind map, keep the same-title idempotency, ensure target titleFields, and let n18 mount the buttons.
