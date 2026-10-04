# Agent Note: W7-B2+B3 legacy-domain heal (53 pages, page-scoped walk + the uiSchema.enum render channel)

Status: implemented

English | [中文](2026-10-03-w7-b23-legacy-domain-heal.zh.md)

B2+B3 is the second stock-page batch under the Forge design language: 53 pages (production 15 + warehousing 14 + quality 7 + supply-chain 8 + organization 5 + assets 3 + base-data 1 — the legacy-stock rows of audit §3.4–3.8; the W6-built pages in those chains stay out of scope). One heal script, one shot/assert rig, one attempt covering both batch ids.

## Problem

After the global reskin, 53 production/warehouse/quality/organization/asset pages still rendered the pre-W7 look, and the W6 domain asserts had to re-earn green under the healed schema.

## Decision

- **Page scoping replaces B1's collection regex** (`examples/kb-agent/scripts/w7b23-heal.mts` `B23_PAGES`): these domains share collections with W6 pages that own their v2 base (`mfg_boms` ↔ 配方版本, `qm_*` ↔ 检验工作台, `mfg_ccp_*` ↔ CCP 两页), so a bare `mfg_*` matcher would repaint W6 pages. Every row is attributed to its owning flowPage by climbing the parentId chain to a BlockGridModel and reading `gridOwnerRoutes` (grid → tabs route → flowPage); only rows under the 53 audited schemaUids heal. Assert additionally requires all 53 pages to appear in the ownership graph (kanban/iframe pages carry grids too), so a misnamed uid fails loudly instead of healing nothing.
- **The runtime enum Tag source is the collection field's `uiSchema.enum`, a fourth option surface B1 missed.** The v2 renderer reads the field definition's enum, not the flowModels option lists; B1's recolor repainted the three flowModels surfaces while W4-era labels/colors (供应商分类 rainbow, `normal`=blue, `A级(低)` annotated pills, the `standard` raw value on row 11) survived on screen behind passing soft-color probes. B2B3 adds the `fieldEnum` walk: for each (collection, fieldPath) the scoped enum columns actually render, recolor the `uiSchema.enum` through STATUS_PALETTE v3 and persist via `/api/collections/<c>/fields:update?filterByTk=<f>` (whole-enum rewrite, other uiSchema keys preserved); assert gained `fieldEnumMismatch=0/N`, rollback writes the journaled before-enum back through the same API. **B1's 22 pages still carry their W4-era field enums — a render-plane debt B1's deliverables overclaimed; backfilling crm_/so_/pur_ field enums is B4's prerequisite, not optional polish.**
- **STATUS_PALETTE v3 extended with 111+ measured values** (dry-run enumerated, then mapped under the v3 rules: neutral metadata → default, execution → blue, attention → orange, negative → red, complete → cyan): certificate expiry windows (`ok`/`w90`/`w60`/`w30` green→red), IQC rigor (`relaxed` 免检 green / `tightened` 加严 orange / `suspended` 暂停检验 red), WMS movement types neutral, count/reservation/transfer states, asset/maintenance families, HR status/leave types, MRP plan types and confirm actions, QM inspection types (neutral) vs rigor (three-state). One known compromise: `frozen` serves both state semantics (冻结 stock/lots/bins, orange) and the warehouse temp-zone metadata (冷冻), where it paints orange on a metadata column — logged as residue, a per-field palette would be the fix if it matters.
- **Data-plane vs schema-plane split for out-of-enum values**: one `srm_suppliers.iqc_level='standard'` row rendered the raw value because the value sat outside the enum; normalized to `normal` by SQL (seed-era dirty value), distinct from the options/fieldEnum recolor which never rewrites data.

## Verification

- `w7b23-heal --assert` OK across the batch: 71 enum columns colorMismatch=0 enumNoLeft=0, 104 numeric columns right-aligned+separated, 29 date columns formatted, 0 bare-text money/qty, 69/69 statcards forge-marked, 70 column-header + 3 select lists at v3, **61 field-enum render sources at v3 (fieldEnumMismatch=0)**, all 53 pages present in the ownership graph (46 with column/statcard surfaces + 7 form-only).
- Live DOM probes over all 53 pages (`.w7b23-shot.mjs`): 44 table pages pass the six-checkpoint set (thead≥600, header bg, tag soft, tag pill, numeric right+tnum, no legacy hex in v2 surfaces), 6 kanban/matrix pages pass the form-face subset, 3 iframe terminals shot-only (B5 owns the shells). One first-pass false negative (检验读数 captured mid-load) retaken with an explicit thead wait — probes pass on the settled DOM.
- W6 regression legs re-run green after the field-enum writes: `w6b4-assert` ALL PASS, `w6b5-insp` assert PASS (after reseeding rehearsal rows and replaying the wizard leg — the two initial failures were missing readings/reports, data-plane, not the heal), `w6b8-assert` PASS. `w7b0-theme --assert` OK; `pnpm run typecheck` exit 0; oxlint staged on the new script 0/0.

## Pitfalls pinned

- **A heal assertion is only as good as its claim about the render source.** Probing stored options proves nothing about what the renderer reads; after any option-surface change, verify one live page's computed Tag text+background before declaring victory (the 供应商档案 probe caught the W4-era enums surviving behind passing schema assertions).
- **Journal writes must not be the first filesystem effect of a batch**: the first `--apply` died on ENOENT (research dir absent) after one save had landed, leaving one unjournaled column. The diff between dry-run and rerun counts names the column; the before-state was reconstructed and appended. mkdir before the first write.
- **Vision-model screenshot review misreads small DOM text** (claimed white headers and left-aligned numerals on a page whose computed styles are 600/#fafafa and 100 right-aligned cells). For acceptance evidence, computed-style probes are the authority; screenshots are for humans.
- **Batch screenshot rigs need a settle condition, not a fixed sleep**: the fixed 2.6s wait captured a loading spinner once in 53 pages; waiting for the first thead cell removes the class of false negatives without slowing the other 52.

## Alternatives considered

Heal per page by hand vs one domain-matched walk — the walk keeps B2/B3 on the B1 code path and surfaces unknown enum values in dry-run output instead of skipping them.

## Consequences

- B4 (经营分析/项目协同/预警/食品合规 + any B1 render-plane backfill) reruns this script's pattern with its own page set; the fieldEnum walk is collection-wide by construction, so shared-collection pages outside the set must be regression-anchored (as w6b4/b5/b8 were here).
- Batch rollback is one journal (`b23/w7-b23-heal-rollback.json`, 264 entries: 69 statcardRegen + 64 columnOptions + 56 fieldOptions + 56 fieldEnum + 16 numberProps + 3 selectOptions) reverse-replayed; fieldEnum entries restore the stored enum through fields:update.
- Residue carried forward: the `frozen` dual-use label; JSBlock/iframe interiors (B5); the B1-domain field-enum backfill; sparkline/trend statcards still deferred pending data feasibility (B1 ruling stands).
