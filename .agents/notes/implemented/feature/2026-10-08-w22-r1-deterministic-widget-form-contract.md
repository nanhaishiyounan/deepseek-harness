# Agent Note: W22-R1 — widget and required-field decisions move to the server (deterministic resolver + form contract)

Status: implemented

English | [中文](2026-10-08-w22-r1-deterministic-widget-form-contract.zh.md)

## Problem

The W22 verification scored 70/100 with B1/B2 satisfied; every failing dimension lived on the model-output side. The ×10 same-prompt repeater over the real gateway showed: `widget` hit rate 50% (run 2 declared `quantity`/`unit_price`/`amount` as `text` while schema and few-shot teaching were both in place), the pur_orders required set vanished in 3/10 runs (品名/数量/单价 fields absent entirely — the user cannot correct a value that is not on the card), run 1 drifted the collection to `hub_inv_products` and invented a `sku`, and the wms_receipts scenario flipped `receipt_type` between `select`+options and bare `text` across runs. Teaching could not close these: the model kept rolling dice on mechanically decidable facts.

## Decision

- **Field-name → widget resolver** ([widget.ts](../../../../packages/interaction/tool-present-card/src/widget.ts)): after structural validation, `resolvePresentCardPayload` rewrites the widget on `form_draft.fields[]` and `ask_field.field` — quantity/money names and labels (`quantity`/`qty`/`unit_price`/`price`/`amount`/`total_est`/`forecast_qty`/`lot_qty`/`sample_qty`/`qty_scrap`/`defect_*`, `_qty`/`_price`/`_amount`/`_cost` suffixes, label fragments 数量/单价/价格/金额/总额/合计/成本/费用) → `number`; date names (`need_date`/`received_at`/`inspected_at`/…, `_date`/`_at` suffixes, label fragments 日期/到期/交期/截止) → `date`; a non-empty `options` array → `select`. Name evidence outranks label, both outrank the options heuristic, and an unclassifiable field keeps the declared widget (fail-open by intent: mechanically decidable facts never reach the model's decision surface; enum vocabularies still do). The rewritten payload keeps riding the full validation. W22-R1 initially claimed "the client needs no mirror change" — that was wrong: the rewritten payload never leaves the server (the session log and the model context keep the declaration, and the execute result is only `{presented: true}`), so the render followed the declared widget and the resolver was verification-dead. W22-R2 wired the render: the client folds the same classification over both payload channels (see the follow-up section).
- **Form contract** ([form-contract.ts](../../../../packages/interaction/tool-present-card/src/form-contract.ts)): a new `formCollections` config (schemastery-validated) whose keys are the collection whitelist — an unregistered `form.collection` rejects the whole draft card with the legal candidates — and whose per-collection `requiredFields` state the field floor: each group lists synonym column names plus the business label, and a group missing from the card rejects with a pathed error (`payload.fields缺少必答字段 quantity/qty（数量）——必答字段必须出现在卡片上，值可预填`). Values may stay prefilled or null; only the field's presence is enforced. An empty or absent config enforces nothing, so generic deployments keep the contract-free behavior, and the execute path concatenates the contract errors after the existing bound violations as `ToolArgsError` (the model lands the fix in one retry).
- **Single-source registry config** ([cordis.patch.yml](../../../../examples/kb-agent/cordis.patch.yml)): the kb-agent overlay pins all 17 persona-registry collections as the whitelist, with the required-field floor on the five high-traffic tables (pur_orders, srm_suppliers, qm_inspections, wms_receipts, hub_wms_inbound); the other twelve stay whitelist-only so unmodeled tables are not falsely rejected. The config comment points at the persona registry for lockstep maintenance.
- **Teaching updated to match the mechanism**: persona step 4 now states the value-may-be-absent-but-the-field-must-appear rule, the widget sentence notes that quantity/date widgets are system-decided by field name (declare normally, mismatches are auto-corrected), and the retry discipline adds the whitelist + required-field self-checks. The `.dsh` preset projection is byte-identical (`cmp`).

## Consequences

- The three verified failure families are now unreachable regardless of model variance: a `text`-declared `quantity` renders as a number keypad, a pur_orders card without 品名/数量 on it bounces back with a one-retry error, and `hub_inv_products` drafts reject wholesale.
- `select`↔`text` drift narrows but does not vanish: `receipt_type`-style fields are only forced to `select` when the model already carries options; a status field without options keeps degrading to text (the W22-note honest-degradation stance). The persona teaching pushes options where vocabularies exist.
- The widget rewrite is silent (no tool-result notice): the model sees only the success receipt. This is deliberate — the rewrite is a mechanical correction, not a contract violation, and a notice would invite the model to re-litigate a settled fact.

## Alternatives considered

- Hardcoding the 17-table registry inside the package — rejected: deployment-varying data belongs in validated config (repo convention), and the package must stay contract-free for non-kb-agent consumers.
- Parsing the persona's natural-language registry to derive the whitelist — rejected: the prose is model teaching, not a machine-readable source; the config is the machine view and its comment pins the lockstep duty.
- Forcing `select` on status-like field names without options — rejected: the server cannot invent the option vocabulary (per-collection enums live in NocoBase), so the rewrite would have to either reject (a new false-rejection surface) or leave `select` without candidates (the client degrades anyway).

## Follow-up

- The twelve whitelist-only tables carry no required-field floor yet; add groups when a table's verification shows the same missing-field failure family.
- The W22-note follow-ups stand (page-level CTA grading, legacy e2e login drift).

## W22-R2 correction: the render-side wiring the resolver always needed

The W22-R1 verification (FAIL 80) proved the bypass with a live probe: a model told to declare `quantity widget:"text"` produced a card whose session-log payload carried `text` and whose rendered control was the plain text input — the server rewrite verified nothing user-visible. The R2 batch closed it:

- **Client mirror** (`dsh-client-ui-mobile` `src/client/widget.ts`): `inferWidgetKind`/`applyDeterministicWidgets` mirrored from this package's `widget.ts` (the client bundle purity gate rejects cross-plugin value imports — an interaction package is not an inline-safe wire layer), applied in the fold's shared `appendPayloadItem` so the `present_card` tool channel and the legacy ```dsh fence channel classify identically. The session log and model context keep the declared widget; only the rendered control follows the classification. Rule refinement shipped in the same change: note-family names (`note`/`remark`/`comment`/`description`/`memo` + suffixes) and 备注/说明/描述/摘要 label tokens pin the declared widget before money/date fragments fire, and fragments match label-token head words (compound tails like 入库数量/合计金额) instead of raw substrings, with connector-glued tokens (含单价) inert — the `customer_note` labeled 客户备注（含单价上限说明） false positive is pinned by a test on both mirrors.
- **Rejected-card collapse** (the second FAIL-80 root): the fold pre-scans `tool/result` events and a `present_card` call whose result landed `isError` folds to the collapsed degraded notice instead of the interactive card — a bounced draft can no longer be confirmed against its corrected retry.
- **Config fail-loud**: the entry now value-exports `Config` (cordis validates and defaults it) and `apply` rejects unknown top-level config keys at startup — schemastery's object resolver merges unknown keys silently, so a mistyped `formCollections` used to read as "no contract" and skip the whitelist and the required-field floor without a word.
- The R1 ten-run 10/10 reading is therefore attributed to persona teaching plus the render-side classification double-checking the model's declaration — not to the server rewrite, which by itself never touched a rendered control.

## W22-R3/R4 follow-up: relation meta fallback and the opaque 引用 #N face

Go-live probes caught the model declaring `supplier_id` while the NocoBase meta table keys the association column `supplier`: the direct lookup missed, `fieldControlOf` degraded the declared relation to text, and a prefilled id rendered as a bare editable `47` that reads like a quantity. Two mechanisms closed it. [`metaFieldOf`](../../../../packages/client/ui-mobile/src/client/fieldControls.ts) retries the `_id`-stripped spelling once, so a declared relation whose meta keys the association column still resolves its target. A declared relation both reads miss with a numeric value rests on the read-only `引用 #N` face instead of the bare number — the derived tier since W22-R3, the required tier's edit row since W22-R4 (one condition on both faces; a non-numeric value keeps the raw text, an empty value stays editable).
