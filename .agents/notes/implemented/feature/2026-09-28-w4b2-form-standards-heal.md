# W4-B2 form standards heal — three factories, assignRules first use, and the 105-form sweep

English | [中文](2026-09-28-w4b2-form-standards-heal.zh.md)

- Date: 2026-09-28
- Status: implemented
- Scope: `examples/kb-agent/scripts/nocobase-flow-page-lib.mts` (W4-B2 section), `examples/kb-agent/scripts/w4-heal-b2.mts`, `examples/kb-agent/scripts/setup-nocobase.mts` verify

## Decision

The platform-wide form standards (two-column sectioned layouts / business-key required / default-value quartet / format placeholders / Chinese enum options / Edit-Delete completion) ride three new flow-page-lib factories plus one sweep script over the 105 live form grids, with zero page regeneration:

- `assignFormDefaults` writes the form-level default rules to the **FormGridModel row's** `stepParams.formModelSettings.assignRules` — the grid-delegated storage `FormBlockModel.GRID_DELEGATED_STEP_KEYS` reads back. `mode: 'default'` only fills empty values, so Edit forms never overwrite existing row values. The rule `value` for "today" must be `{{ctx.date.preset.today}}` — the engine's ctx-date contract (flow-engine `dateVariable.ts`) requires the `preset` segment; a bare `{{ctx.date.today}}` validates nowhere and silently resolves to undefined (rule skipped), which is how the pilot caught it.
- `formTwoColumnLayout` emits GridLayoutV2 rows: each section renders a full-width divider row (sizes `[24]`) then pairs its field items into `[12,12]` rows (a lone trailing item keeps `[12]`). The grid renders from `props.layout.rows`, so FormItemModel rows never move — field reordering (F-8') is layout-only. Config-template forms and forms with fewer than 4 fields stay single-column (21 exempt grids: 12 config collections + 9 small forms).
- `formItemExtras` emits `props.required` **plus** `props.rules[{required,message}]` — the marker alone does not block submit; the rules entry is what the antd validator reads (actions/required.tsx semantics). Required markers never gate the 9-step chain: its scripts ride REST `:create/:update` directly and never open UI forms.
- Divider labels must persist in **both** `props.label` and `stepParams.markdownItemSetting.title.label`: the runtime materializes the title step's `'{{t("Text")}}'` default over a bare props.label, so a props-only write renders every section as "文本".
- Create forms the page builders left without a `FormSubmitActionModel` (30 of 83, including the w3pur purchase-order popup) get one (`w4b2fs` prefix): a form without a submit has no F-10' negative channel at all.
- The D5 Edit/Delete whitelist is **engine-registry-driven**, not prefix-driven: `hub_*`/`crm_*` (minus the read-only `hub_po_suppliers` archive) plus the five srm auxiliary collections `wfl_flow_configs` does not govern (certificates / audit checklists / score cards / audit records / capas). The engine-governed document domains keep their W3-B2 guarded Edit and never gain a Delete.

## Pitfalls the heal encodes

- The flat `flowModels:list` carries **no parent edges** for form subtrees: FormItemModel rows all share a null parentId and field submodels cannot be associated flat. Every form walk resolves fields through `flowSurfaces:get`'s nested `layout.rows[].cells[].items[]` references, and each node write is a read-merge-save (`mergeNodeProps`) so no sibling prop key is dropped.
- `flowModels:save` persists embedded `subModels` children as **flat rows too** — the 36 Edit-popup grids the B2 Edit actions saved became countable flat FormGridModel rows (grids 105→141), which the audit probe then heals as ordinary forms (they converge to the same sectioned layout on the next pass; the sweep is idempotent from the second run).
- antd DatePicker renders the picked value into the readonly input's `value` attribute, never into `textContent`; and a page's B1 FilterForm is also a `<form>` — popup-form audits must scope to the visible drawer/modal layer or they measure the filter form instead.
- The member pilot leg: qc_inspector holds no create grant on srm_suppliers, so the hidden 添加 button is the correct W3-B5 ACL fence, not a defect; deep member verification rides a member-creatable page (hub_pj_tasks).
- The B1 leftover (h5 WMS pages rendering only the actions column) is a **client long-session module cache**, not data: every server channel (flowModels rows, flowSurfaces:get, the exact browser findOne URL) returns all columns intact, a whole-tree rewrite changes nothing, and a fresh browser context renders all columns. Hard refresh / re-login recovers; nothing to fix in flowModels.

## Acceptance

`w4-heal-b2.mts --assert` recomputes the five metrics live and fails closed; `setup-nocobase.mts verify` spawns it after the w4b1 assert. Before → after: single-column eligible forms 105→0 (21 exempt: 12 config + 9 small), required fields 128→318 (floor 260; srm_suppliers 8, mfg_orders 6, crm_customers 5, hub_hr_employees 5), placeholders 0→307 (floor 200), assignRules grids 0→64 (floor 60), pages with Edit 18→49 (floor 44; 31 B2 pages + engine pages keep the W3 guarded Edit), engine-domain UI openings 0. Zero drift on every B1 metric (sort/filter/money/date/titleField/status all stay at 0 defects), ledger balanced, `.trees.mjs` anomalies 0 with AddNew subtrees 100% online, b9-chain s9 audit trail + movements reconciliation green, and `verify` fully green. Evidence: `research/2026-09-28-w4-completeness/w4-b2-*` (pilot txt+8 png, journey txt+7 png, rollback drill, probe-after json, heal logs).
