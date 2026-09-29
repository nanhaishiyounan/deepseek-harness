# Agent Note: W3-B7 final acceptance — five-role task-completion journeys and the three "second-time" defects they exposed

Status: implemented

English | [中文](2026-09-28-w3-b7-acceptance-journeys.zh.md)

## Problem

The user's framing for W3:「这不是演示 要实际交付使用」. Every batch B1–B6 had verified its own surface (drawer probes, endpoint smoke, page wires), but nothing had ever walked a real operator's daily line end-to-end through the assembled system. B7's job was to make task completion — not page existence — the acceptance bar, across five roles and seven journeys (J1 buyer, J2 planner, J3 shop-floor lead, J4 inspector, J5 warehouse, J6 admin governance, J7 member read-only audit), each with a screenshot sequence plus row-level psql proof.

## Decision

- **A journey is a business loop, not a page tour.** J1's PO is the same PO J5 receives, whose IQC J4 judges — one chain: RFQ 比价下单 → two-level approval → 扫码收货 (hold) → 逐项打分 → verdict → release *or* disposition (return moves stock RETURN_VENDOR). J2's MRP suggestion becomes the MO J3 kits, staffs, reports, and completes. Cross-journey data hand-offs are the point: they exercise the seams single-batch verification never touches.
- **Journey scripts are idempotent replays.** Every data step is find-else-create keyed on stable codes (PO-B7J1 / QI-B7J4-* / MC-B7J2-0014 …); document-code generators embed the MO suffix (MI-B7J2-0014-01) because bare sequence numbers collide across replay rounds and orphan MOs; single-shot verbs (inspect, release, dispose) skip on non-pending state and re-assert from the DB row. The UI interaction legs screenshot whatever state they find and fall back to the first pass's shots on replay.
- **Three engine defects surfaced, all fixed in place with the defect bodies kept as evidence** ([w3-b7-defects.md](../../../../research/2026-09-27-w3-usability/w3-b7-defects.md)): (1) `nextDocCode` scanned a `code` column that `wms_receipts` does not have — every receive past the first hit "already exists"; (2) `Number(null) === 0` turned sensory rows (both spec bounds null) into numeric rows judged `0 ∈ [0,0]` = pass — an inspector's explicit 不合格 silently flipped to Accepted, and a numeric row with a missing reading judged 0 instead of failing loud; (3) `availabilityCheck` re-entry released the old reserved rows but `reserve()` is code-idempotent and kept the released rows — the kit read `assigned` while `post-issue` found no reserved rows, a deadlock only a check→check→issue sequence reveals.
- **The 9-leg chain grew an s5 idempotence guard, same family as s3/s7.** The journeys legitimately consumed every open MO suggestion (two MOs now carry BOM-0002's net need), so a fresh MRP run yields no new MO suggestion; s5 now accepts "suggestions confirmed, net need carried by in-flight MOs" as the replay state instead of throwing for missing staging material.

## Alternatives considered

- **Separate per-batch re-verification instead of cross-role journeys** — rejected: each batch already re-proved its own surface; the seams between batches (approval ↔ receiving ↔ quality ↔ inventory ↔ manufacturing) are exactly what page-level checks cannot see, and all three defects lived in those seams.
- **Fresh isolated data per journey (reset between roles)** — rejected: the shared PO/lot/MO hand-offs are the test material; isolation would have hidden the numbering and re-entry defects again.
- **Treating the three engine fixes as W4 work to keep B7 evidence-only** — rejected: two of the three make the real operator's positive path impossible (no second receipt, no kit→issue), which fails the delivery bar the batch exists to enforce; fix-in-place with defect bodies kept as evidence (QI-B7J4-C) is both honest and auditable.

## Consequences

- J1–J7 all pass with dual proof (journey logs + [`w3-b7-psql.txt`](../../../../research/2026-09-27-w3-usability/w3-b7-psql.txt)); the full gate stack re-ran green after the fixes — 9-leg chain ×3 rounds, assert-ledger (36 groups / 189 movements), both selftests, backfill×2 (2081 = 2081), setup verify (every B1–B6 assertion), wire probe (anomalies=0), and the 99 deliverables table answers the user's three feedback points item by item.
- The kanban column-count assertion pattern (board header counts vs SQL GROUP BY, at a 2560px viewport so all nine columns fit) is the honest way to "kanban reflects the data" — single-card lookups lose to pagination and virtualized columns.
- member's governance boundary is three-layered and must be asserted as such: page entry (404), REST write path (403 probe), and the deliberately broad collection-wide view grants (B1) that are *not* the security boundary.

## Notes (pitfalls found live)

- **Every defect hid in "the second time."** Endpoint smoke proved the first document; the crash needed the second (numbering), the other verdict path (sensory flip), or a re-entry sequence (kit deadlock). Acceptance journeys must replay multi-document, both-verdict, and re-entry shapes or they are page tours with extra steps.
- **A live localStorage token swap loses the race against the SPA boot read** — member sessions need a fresh browser context with the token seeded via `addInitScript` (the B1 pattern), not an evaluate-and-reload on the admin page.
- **Full-page cold loads run 5.8–8.6s in dev** (unbuilt NocoBase frontend behind the :3080 gateway) while every interaction (drawer open 1496ms, B1 baseline 786ms) is well inside budget — report both numbers separately; blaming "slow pages" on either alone misleads.
- **Playwright `page.goto` + a table that legitimately spans pages**: paginate (`ant-pagination-next`) before declaring a row missing; nine-column kanbans need the viewport widened or half the board is invisible to innerText assertions.
- **Monthly balance snapshots lag live journey movements by design** — after any acceptance run that posts stock movements, run `--recalc` before `setup verify`, or the reconcile assertion fails on freshness, not correctness.
