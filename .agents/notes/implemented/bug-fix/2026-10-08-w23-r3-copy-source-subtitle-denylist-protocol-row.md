# Agent Note: W23-R3 — verification-F clearance (copy source + subtitle denylist + protocol-row contract + stable cluster keys)

Status: implemented

English | [中文](2026-10-08-w23-r3-copy-source-subtitle-denylist-protocol-row.zh.md)

## Problem

The W23-B2 verification (85/100, FAIL) left three Important findings and four Minor ones:

- **F1 (P0-grade user value)**: the rejected `present_card` card's 复制原文 copied the hardcoded explanation line, not the payload. `foldPresentCard`'s two degraded arms (`rejected`, payload-parse failure) both dropped the in-hand `rawArguments`; only the ```dsh fence path kept the original text.
- **F2**: the body layer has `sanitizeBizText`, but no subtitle pass existed — a persona soft-constraint miss leaked `wfl_approval_todos` into live report-card subtitles (z2 turn2/turn3 ×2, body ×1), because the leak token is not in the business-term map and open-set enforcement had been declined in B2.
- **F3**: a protocol-marked tool row that landed `error` (the model emitting an `ask_field` fence as a tool call that bounced) still joined a tool cluster and read as a query that ran and failed — the neutral-status-line contract only lived inside `FlowItem`'s render branch.
- Minor: cluster/group React keys derived from the first row's seq/title (an insert mid-run re-derives a different key and the user's expanded state collapses); the tool-cluster CSS comment claimed visual interleaving the render never does; and the b2-08 evidence screenshot was byte-identical to b2-01 (same sha256) while the batch's stated count (17) undercounted the actual `b2-*` files (19).

## Decision

- **F1**: one shared `buildCopyableText(raw, fallback)` in `fold.ts` now feeds all three degraded arms — the fence segment, the rejected present_card, and the malformed-arguments present_card. The raw wire text (the exact string 复制原文 hands to the clipboard) is the item's `text`; the people-language fallback line only covers a genuinely absent source (non-string or blank wire value). The people-language summary stays on the `<summary>` element, so the collapsed notice stays cause-neutral while the payload stays one tap away.
- **F2**: a new shared module `client/sanitize.ts` exports `sanitizeBody` / `sanitizeSubtitle`. Both ride the existing `sanitizeBizText` mapping and then strip a **closed** protocol-token denylist (`wfl_*`, `ask_*`, `suggestions`); the subtitle pass additionally strips the closed tool/protocol-name families (`nb_*`, `kg_*`, `kb_search`, `lakehouse_*`, `connector_*`, `form_draft`, `form_confirm`, `reject_flow`, `submit_receipt`, `present_card`). This is deliberately not the open-set enforcement B2 declined: closed families cannot begin a legitimate people-language word (OTIF, GB 2760, P50 pass through untouched). `FlowItem`'s report branch sanitizes `payload.subtitle` before `ReportCard` consumes it; a fully-stripped subtitle renders as absent (`ReportCard` now treats `''` like the blank-as-omitted equivalence W21-R4 set). The three card-bearing presets also gained the named `wfl_approval_todos` example in their card-face and body discipline lines (belt-and-braces; the leak was a soft-constraint miss, not a missing rule).
- **F3**: `fold.ts` exports `isProtocolToolRow` (type predicate `ChatToolRow & { protocol: true }`); `FlowItem`'s neutral-line branch and `ToolClusterRow`'s `isSettledTool` both consume it, so a protocol row — failed or not — never joins a cluster and always renders as the neutral status line.
- **Stable keys (Minor)**: the cluster key derives from the member set (`seq::name` pairs, sorted, joined) instead of the first row's seq, so a re-ordered re-fold re-derives the same key and React keeps the expanded component; `AlertsView`'s group key derives `band::ruleType::entityId` with `::` separators from the group's one shared entity (its non-empty code, else its one shared title). The CSS comment now describes the actual render order (all rows, then the notes; no interleaving).
- **Evidence (Minor)**: b2-08 was retaken as an independent frame (`r3/r3-b2-08-retake-buyer-hero-line.png`) and `b2-verify-report.md` carries the correction note recording both the duplicate frame and the 17-vs-19 count.

## Consequences

- ui-mobile 888/888 (new: fold F1 3 assertions-rewritten + 2 cases, tool-cluster protocol guard + key-stability 3, sanitize 10 incl. the DOM-level subtitle assertions; updated: the two degraded-text expectations that previously pinned the fallback line), tool-present-card + session-title 200/200, toolcard e2e 6/6, `pnpm run typecheck` green, staged lint via lefthook.
- Live probes (`demos/acceptance-w23/r3-*`): the rejected-card 复制原文 clipboard equals the raw payload; the subtitle leak scenarios ×3 render zero protocol tokens; the cluster stays expanded across a re-ordered re-fold.
- The AlertsView key change is a defensive normalization — the grouping rule already guarantees the head-independent shared entity, and no live title/code carries `::` — so its coverage is the existing alerts suite, not a new behavior case.
- The fallback wording arms are now reachable only through the non-string/blank wire shape (covered by unit test), which narrows what「the notice shows the fallback」means from here on.

## Alternatives considered

- **Sanitizing inside `ReportCard`** — the card is a pure payload renderer; the leak is a render-site consumption decision, and keeping it in `FlowItem` leaves `ReportCard` reusable for already-clean payloads (tests, previews).
- **Adding `wfl_approval_todos` to `BIZ_TERMS` as a mapping** — mapping is the open-set trap B2 declined; the denylist strips the family (`wfl_*`) without pretending to translate it.
- **Interleaving notes between tool rows** — the wedge narration has no per-row anchor (a note may sit between two calls only positionally); the CSS-only comment fix records the actual order instead of inventing one.
- **A `callId`-bearing key** — `ChatToolRow` carries no callId (the fold keys result-matching through an internal map); `seq::name` is the member's stable identity at this layer.
