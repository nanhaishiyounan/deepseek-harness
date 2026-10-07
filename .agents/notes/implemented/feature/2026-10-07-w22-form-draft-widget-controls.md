# Agent Note: W22 — form_draft card buttons ride the small dial; draft fields render their widget

Status: implemented

English | [中文](2026-10-07-w22-form-draft-widget-controls.zh.md)

## Problem

Two user reports on the form_draft card. (1) The 驳回/确认写入 buttons rendered at a 44px font — `Button size="large"` consumes `--adm-font-size-10`, which the W9 token remap pinned to 44px (the display grade), so every large card button was a display-grade giant. (2) Every draft field rendered as a text input: `EditableValue` branched only relation (Picker via `RelationSelect`) and number (`inputMode=decimal`), while the protocol's `fields[].widget` already carries `text|number|date|select|relation` on both mirrors and `fields[].options` (label/value pairs) has been legal schema since W21 — the card just ignored them.

## Decision

- **Buttons ride the small dial and the report-card pill grade** (W22-B1): `size="small"` plus `height: var(--dshm-touch-sm)` (40px), `padding-block: 0; padding-inline: 15px`, weight 600 in `.actions :global(.adm-button)` — the exact grade `.reportPrimary/.reportSecondary` already pin for the approval/report cards. Applied to the v3 DraftCard, the legacy task-cards pair, and the ReceiptCard footer. TaskFormModal and ProfileView still carry `size="large"` (page-level CTAs, same 44px dial); recorded below as follow-up, not expanded in this batch.
- **The widget drives the control** (W22-B2): select fields with options mount an antd-mobile Picker over the payload's own `options` (trigger `role="button"` span on the boxed `fieldPicker` face, label shown, value fed back on confirm), date fields mount the DatePicker (precision day, `YYYY-MM-DD` in and out), number keeps the `inputMode=decimal` input, text stays the boxed input. A select without options degrades to the boxed input; a locked card rests select/date fields on a read-only `fieldStatic` line. The blank-required focus gate's selector now includes `[role="button"]` so picker triggers take focus too.
- **Date vocabulary extracted** to [dateText.ts](../../../../packages/client/ui-mobile/src/client/forms/dateText.ts): the form-page `FieldWidget` and the v3 DraftCard share `parseDateText`/`formatDateText` instead of a second private copy.
- **Options mirror parity closed**: `parseFieldOptions` used to swallow a present-but-invalid `options` member (the draft stayed legal) while the tool schema walk rejects the same payload. It now returns null for the invalid case and the whole draft rejects — both mirrors reject alike; fixtures `form-draft.widgets.valid.json` (all four widgets, options in required and derived tiers) and `form-draft.bad-options.json` (options as a string) assert both sides.
- **Teaching follows the schema**: the form_draft branch description and the persona's step-4 payload template + widget sentence teach when each widget applies (select = closed enumeration and must carry options; date = YYYY-MM-DD; number = quantities/amounts; text = codes/notes/names; relation = cross-table row, no options), and the few-shot now shows date/number/select-with-options fields. The `.dsh` preset projection is byte-identical (`cmp`).

## Consequences

- A model that cannot name an enumeration's vocabulary (no registry entry) omits options and the field degrades to text — honest degradation, verified live; a model that has the vocabulary emits select+options and the card mounts the Picker (verified live on `srm_suppliers.lifecycle_status` with the eight-state vocabulary).
- The e2e `mobile-assistant.e2e.ts` (legacy fence) fails on the pre-existing 「6 位验证码」 login-form drift (W12 account/password rework); stash-verified independent of this batch. The toolcard e2e (4/4, golden aria snapshot) carries the replay-regression anchor.
- Running the web e2e suite rebuilds `apps/web/dist` (and can rebuild client `lib/`) — after any stash-during-e2e or parallel run, re-run `build:lib:client` + the web build before trusting the gateway-served bundle, or the gateway serves a stale hash.

## Alternatives considered

- Pinning `--font-size` explicitly to 14px on the card buttons — rejected: the approval/report/plan cards all ride the small dial (20px through `--adm-font-size-7`), and re-grading just the draft card would fork the in-card action family; the dial fix keeps one grade.
- Requiring options whenever `widget:"select"` at the schema level — rejected: it adds a rejection surface the model hits whenever it lacks the vocabulary; degradation-to-text keeps the leniency contract while the teaching pushes options where they exist.
- Cascading selects and multi-column pickers — out of scope; the widget vocabulary would need new schema branches on both mirrors, recorded as follow-up below.

## Follow-up

- TaskFormModal (取消/提交) and ProfileView (退出登录) still ride `size="large"` = the 44px dial; they are page-level CTAs, but the 44px grade dwarfs their headings the same way — re-grade deliberately.
- `mobile-assistant.e2e.ts` / `mobile-shell.e2e.ts` / `mobile-preview-iframe.e2e.ts` still assert the pre-W12 verification-code login form; they need the account/password handshake or a localStorage preset like the toolcard e2e.
- Enumeration vocabularies the model can cite (per-collection select options) live only in the persona prose; a registry-driven source (the client's `KNOWN_ENUMS` table is client-side) would let every collection's select carry options without the user supplying them.
