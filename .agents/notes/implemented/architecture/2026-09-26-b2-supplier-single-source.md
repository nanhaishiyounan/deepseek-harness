# Agent Note: B2 supplier single source — admission into the wfl engine, the lifecycle gate, and the legacy-table demotion

Status: implemented

English | [中文](2026-09-26-b2-supplier-single-source.zh.md)

## Problem

Supplier data lived in three disconnected tables: `srm_suppliers` (the SRM eight-state lifecycle with a create-triggered NocoBase manual workflow), `hub_po_suppliers` (what the mobile form-assistant wrote, six columns, status=待审核), and `hub_as_vendors` (asset vendors, unrelated). WMS receipts referenced `srm_suppliers` while mobile registrations and purchase orders referenced `hub_po_suppliers` — a cross-domain break. The B2 batch (plans/2026-09-25-mfg-closure/03-b2-supplier-lifecycle.md) had to unify this into one source with a real admission flow (potential → review → qualified before any PO), an AVL gate on PO creation, both ends operable (mobile approval card + NocoBase approval center / admission pages), and a disposition for the five legacy 待审核 rows (id=7~11).

## Decision

**`srm_suppliers` is the single supplier source; `hub_po_suppliers` demotes to read-only 采购联系人（历史）.** Mobile registration now writes `srm_suppliers` (formRegistry switches the entry; the persona contract, fieldControls enums, and rich.ts labels move with it; the `.dsh/.agent-presets` deploy copy is synced in the same change). The w2 script retitles the B0 采购供应商 v2 page to 采购联系人（历史）and never migrates historical rows out — only the five 待审核 mobile registrations migrate, as `potential`/`internal` rows with fresh `SUP-YYYY-NNNN` codes (name-deduped; migrated ids ledgered on disk for rollback; the hub rows stay). The mobile-generated code sequence continues over `srm_suppliers.code`; the h4 seed's `SUP-001`-style codes never collide (different pattern).

**Admission runs on the W1 engine as a second vocabulary, not as a second engine.** `wfl_flow_configs` already carried `state_field`; B2 makes the word-set pluggable: a flow whose `state_field='lifecycle_status'` rides the supplier-admission vocabulary (potential → reviewing → qualified | rejected, qualified is the effective state, `admitted_at` is the effective-date extras column, reviewing locks direct edits) while the six-state doc_status machine is untouched. `approval-rules.ts` (the single code source both entry points import) gained `FlowVocabulary` — states/labels/anchors/effectiveState/lockedStates/nextOf/illegalMessage — plus `vocabularyForStateField` resolving the flow config's field, failing loud on unknown fields. The script engine and `nb_approve` each resolve the vocabulary once per act and share every message. Submit after either vocabulary's entry state (draft/potential) and resubmit after either refusal state (rejected) are the same rule.

**The h4 create-triggered admission workflow is retired, disabled by the w2 script.** Leaving it enabled would double-track every new potential row (NocoBase manual queue + wfl todo). Retire rides `workflows:update` with `enabled: false` — 2.2.6 exposes no `:toggle` action on workflows (the route 404s silently through the flow-page lib's `call`), a wire fact the script comment now records. Verify asserts the disabled state and that the h4 seed supplier 珠海鲜丰水产科技有限公司 stays qualified (the lifecycle change never touches pre-existing rows).

**The AVL gate is the B1 gate grown an enum set.** `wfl_gate_configs` gains `upstream_state_field` (empty = doc_status, backward compatible) and `required_status` accepts a comma-separated set. The seeded row binds `hub_po_purchase_orders.supplier_id → srm_suppliers.lifecycle_status ∈ {qualified, preferred}`; `nb_create`'s precondition (both the tool side and the engine's `enforceGates`) refuses with the 未准入/不合格供方 message naming the actual lifecycle state and the admitted set. A lifecycle gate with an empty required set fails loud as a seed error — an empty set would admit nothing, which is configuration, not policy.

**Both ends operate the same admission flow.** Mobile: the registration receipt appends 已进入准入审核，审核通过后可下单; a status query reads the real row back as a report card; 提交准入 and the approval card drive `nb_approve` (the wfl todos table feeds the card regardless of doc_type). NocoBase: the approval center's intent form (source=page → workflow → :13110 `/act`) writes the same five-element audit row; the SRM 供应商准入/供应商档案 pages read the same `lifecycle_status` column. The `approval_result` fence protocol widened its closed state set to the four admission states (potential/reviewing/qualified plus shared rejected) with Chinese normalization, and the approval card grew their seal/label/chip view rows.

## Alternatives considered

- Keep the h4 manual chain as the admission engine (the batch doc's literal wording) — rejected: the mobile approval card and the approval-center page both project `wfl_approval_todos`/`nb_approve`; serving them from NocoBase manual nodes would need a second, unproven projection path and break the single-transition-truth invariant the W1 note owns. The lifecycle vocabulary keeps one engine.
- Extend `WorkflowState` with the lifecycle words — rejected: the six-state machine is closed and shared with B3+ documents; mixing word-sets would let `qualified` read as a legal `doc_status`. The per-flow vocabulary keeps each machine total.
- A generic "gate DSL" instead of enum sets — rejected: the only current need is membership in a fixed set; `parseRequiredStatuses` is the whole surface and fails loud on empties.
- Migrating all hub_po_suppliers rows — rejected: non-待审核 rows are historical contacts, not pending admissions; migrating them would fabricate admission work.

## Consequences

- `pnpm vitest run packages/connector/tool-nocobase` (29 tests, admission chain + gate negative/positive) and `packages/client/ui-mobile` (623) stay green; `approval-engine.mts --selftest` covers the admission sequence, the reviewing edit lock, the illegal-action message, and the gate pair in-memory.
- `setup-nocobase.mts` runs w2 after w1 (before n18) and verify asserts the admission flow config, the supplier gate, the retired h4 workflow, the untouched h4 seed, and the 采购联系人（历史） page title.
- Long-running deployments must restart both the `dsh web` gateway and the :13110 engine to pick up the vocabulary (the 3080 module-graph freeze bit once during acceptance: the mobile submit failed against the old six-state tool code until the restart).
- The legacy table's row count is the no-growth guard: mobile registrations land in `srm_suppliers`; `hub_po_suppliers` stays at its baseline (asserted in research/2026-09-25-w-round/b2-psql.txt).

## Verification

- psql (read-only, research/2026-09-25-w-round/b2-psql.txt): migrated rows potential/internal with SUP-2026-NNNN codes; h4 seeds untouched; the gate row with `qualified,preferred`; the admission flow config and its four transitions; the h4 workflow disabled; the full engine sequence over the real library (submit → reviewing → approve → qualified + admitted_at; gate refusal for a potential supplier naming 未准入/不合格供方; gate pass for qualified/preferred); dual-entry audit rows (engine and page) for the same doc.
- Browsers: b2-mobile-register.png (real-LLM conversation → draft card → confirm → receipt + admission notice), b2-mobile-status.png (report card reading the real row), b2-mobile-approve.png (approval card → 同意 → qualified), b2-admin-approve-before/after.png (admission page state flow), b2-admin-approval-center.png (todos + audit with both sources).
