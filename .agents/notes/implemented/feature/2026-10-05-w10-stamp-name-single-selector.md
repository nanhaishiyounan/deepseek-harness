# Agent Note: W10 — the stamp name's single selector and the three-face same-source rule

Status: implemented

English | [中文](2026-10-05-w10-stamp-name-single-selector.zh.md)

## Problem

The colleague stamp (the two-character avatar block) renders on three faces — the session lists (the chats rows and the home recent rows), the roster page, and the chat surface (header stamp + turn stamps) — but until the W10-R3 close-out each face read a different name source. The roster page read its own row name; the chat surface, since the W10-R2 fix (6b2b9203ff), read the new shared selector `colleagueNameOf` (roster name, else the visual's duty tag); the two list surfaces still read the session title through `titleOf`, so one colleague's stamp drifted per session — a question-text title loaned its own first two characters, a 新会话 title loaned 「新会」, and every session of one preset showed a stamp the roster page it came from never shows. The same preset thus read three different names across the faces, and the chat-side fix alone left four independently-converged debt spots: `MessagesView` row stamps, two `HomeView` recent-row stamps, the roster page's raw `row.name` handoff, and `ChatView`'s header-hint label re-spelling the selector's expression character-for-character.

## Decision

`colleagueNameOf(presetId, rosterRow)` in `colleagues.ts` is the single name template every stamp face reads — the roster row's display name, else the visual's duty tag; a session title never reaches a stamp. The W10-R3 close-out made every face compose `stampAcronymOf(preset, colleagueNameOf(preset, rosterRow))`: `MessagesView` feeds a mounted-once `listAiEmployees` read into a preset-id→row map for the chats rows; `HomeView` builds the same map over its existing roster read for the recent rows; `AgentsView` passes `colleagueNameOf(row.id, row)` instead of the raw `row.name` (behaviorally identical — the row name wins — but the same-source rule now holds by construction); and `ChatView`'s `presetLabelOf` header hint reuses the selector for its non-local branch instead of the duplicated expression (the header/turn stamps themselves had moved in W10-R2). Session titles keep their own places — the row's title line, search matching, the chat header's main title — the constraint is only that a title never feeds a stamp.

## Alternatives considered

**Keep `titleOf` on the list faces (the roster-and-chat-only close-out).** The list stamps keep drifting per session; one colleague shows the roster stamp on the roster page, the borrowed-name stamp in chat, and a per-title stamp on every list row — the same-face disagreement the W10 audit flagged and R2 set out to remove.

**Inline `rosterRow?.name ?? visual.duty` at each call site (the pre-R2 `presetLabelOf` shape).** Four copies of one expression invite exactly the drift the selector exists to prevent; the roster page's copy had already drifted into a raw `row.name` that only matched by coincidence.

**Fold the borrow rule (`stampAcronymOf`) into `colleagueNameOf`.** The two selectors answer different questions — the full display name (header hint, turn name lines) versus the two-character stamp word with its AI-prefix borrow and fallback. Folding them would push stamp-only edges (the 「AI」 fallback word, the `!!` pair, the blank-name guard) into full-name call sites that never want them.

## Consequences

List stamps change what they show: a session titled by its question text no longer loans the title's leading pair — every session of one preset now carries the colleague's own stamp word (「食安」 for AI 食安合规官), matching the roster and chat faces for the same preset. The chats list gained a mounted-once roster read; when the roster read fails or carries no row for a preset, every face falls to the same duty-tag path, so the faces stay same-sourced in degradation too. The borrow's edge cases are pinned in `views.client.spec.tsx` alongside the six title-kind scenarios: a special-character name (`AI!!报警` → `!!`) and blank or whitespace-only names (→ the `AI` word), so the borrow never renders an empty pair and the three-face rule is asserted, not assumed.
