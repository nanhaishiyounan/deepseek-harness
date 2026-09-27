# Agent Note: hub_po_suppliers read view — procurement group page plus 待审核 enum alignment

Status: implemented

English | [中文](2026-09-25-po-supplier-read-view.zh.md)

## Problem

Mobile chat registrations land in PG `hub_po_suppliers` for real (`nb_create` through the `mobile-form-assistant` preset; rows id=7-10 verified with `status=待审核`), yet no NocoBase page read that table — every existing "供应商" page reads `hub_as_vendors` or `srm_suppliers`. Two compounding gaps:

1. **Read-view absence (P0 root cause).** `hub_po_suppliers` had zero pages across the platform; the data was always in the database, invisible.
2. **Vocabulary mismatch (secondary).** The preset writes `status=待审核` while the collection's select enum only carried `active`/`inactive`, so even a rebuilt page would render the state unmatchable — filters keyed on the enum swallow non-member values.

Full diagnosis with file:line evidence: [research/2026-09-25-w-round/00-p0-diagnosis.md](../../../../research/2026-09-25-w-round/00-p0-diagnosis.md).

## Decision

**The read view rides the F3 v2 flowPage factory, not a fresh v1 page.** All 43 existing table pages are v2 flowPages; the batch acceptance asserts the v2 page count moves 43→44, which pins the route. `nocobase-hub-modules.mts` gained the menu scaffolding (new 采购 group — the home for B3's PR/PO pages — plus the 采购供应商 page entry and its v1 `PAGE_BLOCKS` row), then `nocobase-f3-hub-v2.mts` owns the real page as its eighth `HUB_PAGES` spec: one TableBlock over `hub_po_suppliers`, an Add-new popup with the full field set, submit action, and the n18 AI-fill button. This replays the same three-layer wire the platform's other pages went through (v1 menu row + tabs wire → F3 rollback-records and destroys it → flowPage tree at the same parentId), so no new page-construction risk was introduced.

**`待审核`'s enum value is the literal Chinese string the preset writes, not an English key.** Rows already carry that exact value; any other enum member (e.g. `pending`) would leave the existing four rows unfiltered and untagged. The option appends as `{ value: '待审核', label: '待审核', color: 'orange' }` — orange, not the plan's "amber", because the platform's whole select vocabulary speaks antd preset colors (待执行=orange, 待审批=orange) and antd has no amber preset. Three mirrors stay in sync: the collection definition (fresh installs), `ENUM_ALIGNMENTS` (existing installs — the append-only `fields:update` pass, extended with an optional `color` on its value type), and `KNOWN_ENUMS` in `fieldControls.ts` (the mobile draft card's select widget).

**Columns stay within the table's real columns: name / contact_name / email / rating / status.** The batch doc's column list included `supplier_code`, but the table has no such column and the persona contract is explicit that supplier_code is generated for the draft card only and never persists ([agent.cordis.yml](../../../../examples/kb-agent/agent-presets/mobile-form-assistant/agent.cordis.yml) — "表中无列，只在草稿系统生成区展示，不写库"). A column pointing at a nonexistent field renders empty cells (the N14 field-key lesson).

**Verify gates the vocabulary, not just the page.** `setup-nocobase.mts` asserts the page title in the F3 missing-pages list, the `hub_po_suppliers.status` enum carries 待审核 (so a future enum regression fails loud instead of silently re-swallowing rows), and the n18ai- floor rises 42→43 with the new popup form.

## Consequences

Supplier visibility now has a single page that reads what mobile writes; the three "supplier" surfaces (资产管理·供应商 on `hub_as_vendors`, SRM 供应商档案 on `srm_suppliers`, 采购供应商 on `hub_po_suppliers`) coexist deliberately until B2 unifies registration into the SRM lifecycle. The 采购 menu group is the landing zone for the B3 procurement-chain pages. The preset still writes 待审核 by design — semantically correct for a chat-registered supplier awaiting review; B2's SRM takeover will own the lifecycle states. `ENUM_ALIGNMENTS` values may now carry `color`; portal-vocabulary entries without it are unaffected.

## Alternatives considered

**A plain v1 page (menu + uiSchemas table block only).** Rejected: the platform has no v1 table pages left, the batch's own acceptance counts v2 pages 43→44, and a v1 page would miss the Add-new popup, the n18 AI-fill button, and the flowPage spine every neighboring page has.

**Adding an English `pending` enum member and rewriting the four rows.** Rejected: it mutates user-visible data to serve the schema, leaves a window where old rows mismatch, and buys nothing over matching the written literal. B2 will re-model lifecycle states wholesale when SRM takes ownership.

**Rendering status as a plain text column (no enum options).** Rejected: text renders the raw value but filters and the Add-new form lose the vocabulary; the enum is what makes the column filterable and the tag colored.

## Evidence

- `node --experimental-strip-types examples/kb-agent/scripts/setup-nocobase.mts verify` — OK (new page + enum + n18ai-≥43 assertions included).
- psql: id=7-10 present with 待审核; flowPage count 44 ([research/2026-09-25-w-round/b0-psql.txt](../../../../research/2026-09-25-w-round/b0-psql.txt)).
- Browser: `b0-admin-supplier-page.png` (eleven rows, amber-orange 待审核 tags on id=7-10, green 合作中 / gray 停用), `b0-admin-addnew-enum.png` (Add-new form status select listing 合作中/停用/待审核), `b0-mobile-register.png` (chat registration → execution timeline → 已落库), `b0-mobile-receipt.png` (receipt card №11, SUP-2026-0166, 对话→确认→已落库 all green), `b0-admin-new-row.png` (row 11 B0测试食品 visible after refresh).
- `pnpm vitest run packages/client/ui-mobile` — 613 tests green.
