# Agent Note: upgrading NocoBase v1 uiSchema pages to v2 flowPages (factory + AI wiring)

Status: implemented

English | [中文](2026-09-13-nocobase-v1-to-v2-flowpage-upgrade.zh.md)

## Problem

The plugin-ai experience (floating ball, in-form AI-employee fill) renders only on v2 flowModel pages. A v1 uiSchema page has no mount point: the ChatButton returns null on v1 pages and no v1 SchemaComponent exists for the AIEmployeeButtonModel. The 项目管理 group shipped as six v1 pages, so its users saw none of the AI surface — the second user report of "no AI linkage" came from a hand-configured Add-new popup on the v1 项目 page.

## Decision

Upgrade table pages by replicating the N17d seed factory (`examples/kb-agent/scripts/nocobase-e1-pj-v2.mts`); never extend vendored plugin-ai.

- **Same-title swap**: find the v1 `desktopRoutes` row by title, record `{title, parentId, icon, sort, schemaUid}` to a rollback file, destroy the row, create a `flowPage` row in the same menu slot, then save the flowModels tree (RouteModel×2 → RootPageModel → BlockGridModel → TableBlockModel → columns → AddNewActionModel with nested ChildPageModel→ChildPageTabModel→BlockGridModel→CreateFormModel→FormGridModel → RefreshActionModel). Idempotency is by same-title flowPage presence — a kept page keeps its form uids, which keeps the n18 buttons stable.
- **Field kinds beyond the N17 set**: the factory previously generated only input/select/number. m2o edit = `RecordSelectFieldModel` (the flow-engine default for every association interface, `service-helpers.ts`), m2o display = `DisplayTextFieldModel` (field-type-resolver's non-form branch), date = `DateOnlyFieldModel`/`DisplayDateTimeFieldModel`, boolean = `CheckboxFieldModel`/`DisplayCheckboxFieldModel` (core-field-default-bindings matrix). No extra props: `fieldSettings.init.fieldPath` carries the association semantics and the server resolves the rest.
- **m2o display needs target-collection `titleField` metadata**: `users` ships `titleField=nickname` (owner/assignee cells render), but the seed-created hub_pj_* collections lacked one and their project column rendered blank until the script ensured `titleField` on each collection (a top-level column on the collections API, not an options key). Any future m2o column onto a self-built collection needs this check.
- **Self-mount the submit actions**: `FormSubmitActionModel` is normally ensured by n17's pass over top-level CreateFormModels, but the all chain runs n17 before the E1 script — a fresh E1 popup would ship without a submit button. The upgrade script mounts its own (`submit-<formUid>`, same wire as N17).
- **AI buttons are not re-written**: n18's idempotent scan mounts `AIEmployeeButtonModel` on every top-level CreateFormModel automatically; the embedded form uid is server-generated, so button uids are `n18ai-<serverUid>` — rollback matches orphans by form-uid absence exactly like n18's self-heal.
- **Rollback**: `--rollback` destroys the `n17e1*` flowModels, orphaned buttons, and v2 route rows, then re-creates the recorded v1 rows pointing at their original schemaUids. `desktopRoutes:destroy` does not cascade uiSchemas (probed: row count unchanged), so the v1 tree survives as a non-rendered orphan and the rollback restores the hand-configured popup too.
- **Known boundary**: kanban/calendar/gantt stay v1 — the 2.2.6 flowModel catalog has no block model for those views; forcing the upgrade would lose the views. No floating ball on v1 view pages (plugin-ai client hard-codes it).

## Alternatives considered

**Hand-configure AI components on the v1 page through the UI editor.** Rejected: plugin-ai registers no v1 SchemaComponent/Initializer, so there is nothing to drop onto a v1 tree; adding one means modifying the vendored plugin.

**Replace RecordSelectFieldModel with RecordPickerFieldModel.** Rejected for this surface: the resolver's form-container default for text-type relations is RecordSelect (a dropdown), which is what "pick the owner from a list" wants; the picker form is the popup-selector flavor.

**Defer date/boolean kinds.** Kept: both edit models exist in the core binding matrix and saved + rendered on the first try; dropping them would have shipped a form narrower than the v1 popup it replaced.

## Consequences

- Three table pages (项目/任务列表/里程碑) render with the floating ball, a ten/eight/five-field Add-new popup (m2o dropdowns listing the nine AI-employee users, date pickers, enum selects), submit buttons, and table columns showing related-record names (`demos/acceptance-e1/`, 8 screenshots + probe notes + pg_dump + rollback records).
- The all chain asserts eleven v2 flowPages and eleven `n18ai-` buttons; `nocobase-hub-modules.mts` skips block replay for flowPage-owned titles, so its rerun stays a no-op against upgraded pages.
- Future page upgrades (e.g. kanban v2 when a block model lands) reuse this factory: extend the kind map, keep the same-title idempotency, ensure target titleFields, and let n18 mount the buttons.
