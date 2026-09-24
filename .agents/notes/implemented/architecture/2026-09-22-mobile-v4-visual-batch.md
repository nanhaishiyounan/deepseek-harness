# Agent Note: Mobile v4 — the ticket-quad material system and the antd-mobile full pass

Status: implemented

English | [中文](2026-09-22-mobile-v4-visual-batch.zh.md)

## Problem

The D round (15ca104ab8) shipped v3's color token tracks, the dark dual-track, the motions, and the receipt skeleton, but `ChoiceBubble` still self-described as "Minimal v3 scaffolding; the visual batch owns the final look" — the visual batch had never happened, and the user rejected exactly that scaffolding. The E1 audit (research/2026-09-22-mobile-v4-audit/report.md) listed 30 defects; this batch landed the visual execution layer without touching v3's product logic or IA.

## Decision

**The ticket-quad material system (breaking the white-card-on-white-card, E1 T5).** Four card families encode semantics through background + border + divider, token-driven (the dark track follows automatically): narrative bubbles (话) frost with a cool rim and a light shadow; ask cards (问) wash `--dshm-primary-soft` with a 3px ink-teal left edge and no shadow; draft cards (票) frost with a cool rim and a shadow, the derived tier on a `--dshm-muted` washed panel with the rationale right-aligned under the value and the system tier in an antd Collapse; receipt cards (讫) on `--dshm-success-10` with a `--dshm-success-rim` border, white metric cells, a ticketStrip dashed row-number line, and a green check stamp on the head row. In one line: 话是白、问是青、票是纸、讫是绿. The full design lives in plans/2026-09-22-mobile-v4-redesign/01-visual-batch.md.

**Structure and list governance.** The chat detail page is a full-screen layer: under `#/chat/<id>` the shell renders no TabBar (the 56px return to content), with an antd NavBar and its own back control. Session-list subtitles switch from the roster description to a last-message projection (messages/projection.ts): receipt → 「已登记 №1042 · 采购单」, an unanswered ask → 「等你选择：…」, the last bubble clipped to 24 chars; the projection caches by updatedAt and lazily reads the visible window (a 30-event window, 15 rows), the roster duty demoted to fallback. The list gains SwipeAction pin/mark-read (a pin set in draftStore), a pinned row's ink-teal left edge, a brick-red unread dot on the timestamp, and SearchBar/CapsuleTabs/Tag/ErrorBlock/PullToRefresh/InfiniteScroll all on antd-mobile. The profile page reworks onto the antd List settings group with recent receipts, shortcut chips, a standalone destructive logout block with Dialog.confirm. The empty session renders a vertically centered welcome screen (72px stamp logo, 28px display title, capabilities, starters).

**Unicode glyphs out, lucide in.** ‹/➤/✓/◌/✕/▾/› all become lucide or antd chevrons; the composer is a TextArea autoSize 1–4 lines; errors ride Toast.show (`.adm-toast-main`); the display layer scrubs bare FK references (rich.ts ID_REF removes `id 7`/`（id 7）` patterns in sanitizeBizText). The login page makes the stamp ring's 2px solid border visible, sizes the inner seal to 76px, and merges the double footer.

**relation fields resolve names once (E1 D3).** The new forms/RelationSelect.tsx shared picker reads the target table's first page for options, displays the target row's name on the trigger, falls back to a relation-label read and then the bare id when options miss, and submits the id on every confirm. Both the v2 FieldWidget's relation branch and the v3 DraftCard consume it, deleting the old RelationWidget copy. The v3 draft card's derived relation static row shows names through useRelationLabel; ChatView passes the collection meta into the v3 card.

**The component pass (E1 §3 map).** Sixteen antd-mobile component surfaces join: NavBar, SwipeAction, SearchBar, CapsuleTabs, Badge, Tag, ErrorBlock (Empty deprecated — empties and errors both route through it), Toast, List, Collapse, InfiniteScroll, PullToRefresh, TextArea (autoSize), ImageViewer (the RichContent image fallback), SpinLoading (tool rows running), Dialog.confirm (logout). The `--adm-*` theme mapping keeps the tokens.css track.

## Consequences

- usePoll gains refresh (PullToRefresh); every PollRead union arm carries one more refresh field.
- readHistory gains an optional maxMessages (the 30-event projection window).
- antd-mobile Empty is deprecated — do not add uses; ErrorBlock status="empty" owns empties and status="disconnected" owns service errors (there is no serverError enum).
- CapsuleTabs tab DOM carries no role="tab" (unlike Tabs): tests click via getByText.
- antd-mobile Toast's DOM class names are adm-toast-mask/wrap/main with no bare `.adm-toast`; jsdom assertions use `.adm-toast-main`.
- The v8-ignore budget and test snapshots: 355 tests green (the original 350 + projection 5), behavior changes updated with their tests (the Collapse folds open before asserting system values, logout takes two confirms, headerHint uses the duty name, error assertions check the Toast text).

## Alternatives considered

- **Keeping the v3 scaffolding with token-only tweaks.** Rejected — the user's verdict was on the scaffolding look itself, not on the palette.
- **Two copies of the relation picker (v2 FieldWidget and v3 DraftCard each their own).** Eliminated by the shared RelationSelect; the copy was the defect (E1 D3).
- **Empty for empty states.** Deprecated upstream; ErrorBlock owns both empty and error states, keeping one vocabulary.
