# Agent Note: kb blank-first workbench entry — additive view ring on the hero, cross-entry bridge mount mirror

Status: implemented

English | [中文](2026-09-02-kb-blank-first-workbench-entry.zh.md)

## Problem

The workbench was unreachable from the product's first screen: a blank session hid the session header entirely (`hideChrome = blank && composerPhase === 'blank'`), so the view ring with the kb tab rendered only after the first message, and the sidebar's KB entry degraded its blank-session click to a stats refresh with no feedback. Reaching the workbench at all required typing a message first — the portal advertised a knowledge product whose own workbench could not be opened. Three smaller findings rode along: the scenario confirm's probe separator was a JSX-hardcoded full-width colon (English rendered "Example question：…"), an arbitrarily long recent-search chip could stretch the hero portal, and the recent log's whole-value `localStorage` write had no documented multi-tab degradation.

## Decision

### The shell weakens two blank-phase guards, additively

`ui-conversation` keeps its resident hero but stops treating "blank" as "no ring": `ConversationSessionHeader` hides the whole header only while `tabs.length <= 1`, so a blank session with a deployed ring (chat + kb + trajectory) renders title row, header actions, and tabs as ordinary column chrome — ring-less blank sessions keep the exact prior posture. `ConversationSession` returns null only while the blank phase's *chat* view would own the body; any other resolved view renders the view area directly. Both guards read the slot ledger (`tabs.length`, `resolveActiveView`), never a kb literal — feature detection stays "is a second view registered", per the shell's additive contract. The chat view's stable fallback id moved to `contract/views.ts` (`DEFAULT_VIEW_ID`) because the root now shares it.

### The root learns the active view through a report-back mirror

The resident `ConversationRoot` computes the hero posture but could not see the per-session chat store (root scope has none), so `apply.ts` mints one root-level `createSnapshotStore<string | undefined>` and wires it both ways: the body's inject gains `reportActiveView` (the body publishes its resolved view id in a `useEffect`, withdrawing it on unmount) and the conversation inject exposes it as the `useActiveView` hook. The hero condition now also requires the mirror to be `undefined` or the chat fallback: while a blank session sits on a non-chat view, the column takes the active posture (tabs + view body + docked composer), and switching back to chat restores the hero. A root-owned mirror — not reading the session store from the root — preserves the scope split; the report is effect-driven so a remounting body cannot inherit the previous session's view.

### The bridge grows a workbench mount mirror; the portal steps aside

The kb view bridge (`kbStore.ts`) now carries a `workbench` snapshot store. `KbWorkbench` publishes `settleWorkbench(true/false)` on mount/unmount, and `KbHeroDock` subscribes: the dock stays mounted while the workbench tab owns the column (the input-dock seat renders whenever a session zone exists), renders nothing for that occupation, and returns when the tab leaves. Because that occupation is exactly the window in which the workbench records searches, the recent-search rail re-reads `localStorage` on mount *and* after each workbench stand-down — the original mount-only read assumed the dock was unmounted while recording happened, which the always-mounted dock broke. The sidebar entry dispatches on session existence instead of blankness: any session (blank included) requests the kb view — the bridge is armed because the ring-bearing blank header keeps the header-action publisher mounted — while no session at all keeps the portal-refresh behavior.

### Copy and clipping follow the locale and the row width

The probe separator moved into the `kb` namespace (`scenario.probeColon`: zh `：`, en `: `), restoring the 78→79 key symmetry across en/zh/spec. The hero recent row caps each chip at `max-width: 100%` with single-line ellipsis (the query is stored whole; only the chip clips), and the portal gained an unconditional `max-height: 50vh` scroll backstop that subsumes the former ≤900px-only rule — a long chip wraps the row rather than pushing the composer's controls off-viewport at any width. The multi-tab last-write-wins degradation of `dsh-kb-recent-searches` is documented in the kb-agent README's Known Limitations (both languages) with its trigger condition; the e2e lane carries a `[skip-multitab]` comment explaining why a deterministic reproduction is out of scope for a one-world lane.

## Alternatives considered

- **Rendering the ring inside the hero portal instead of the shell header**: rejected — the portal is a ui-kb seat; only the shell can render another package's view tabs, and a portal-local "open workbench" button would re-encode the ring the shell already owns.
- **Reading the chat store from the root for the hero gate**: rejected — the root is session-maybe and owns no per-session store; the report-back mirror keeps the scope split while giving the root exactly the one bit it needs.
- **Unmount-gating the dock on the workbench occupation** (skip rendering the dock seat while the workbench is active): rejected — the input-dock seat is a shared list other entries (todo, queue) ride; a kb-specific unmount would fight the seat's owner. Rendering nothing from inside `KbHeroDock` is the additive move.
- **Per-character truncation of stored queries** (store a clipped query): rejected — the log's value is exact re-run; clipping at render keeps storage faithful and the chip cheap.

## Consequences

- A deployment without ui-kb keeps pixel-identical blank-hero behavior (single-tab guard), which the ring-less skeleton case pins; the kb deployment gains first-screen workbench reachability, cross-view recent-search sync, locale-correct probe punctuation, clipped long chips, and an honest multi-tab limitation record.
- The root-level view mirror is one frame behind the body's store commit on mount (report is a passive effect); the settling window already covers that ambiguity and no assertion depends on the interim frame.
- The workbench mirror makes the dock's recent rail correct only because the re-read listens to stand-down; a future dock that records its own searches must extend the re-read triggers.

## Testing

- `packages/client/ui-conversation/tests/skeleton.client.spec.tsx`: ring-bearing blank header renders; a non-chat view takes the column (`data-phase` active, hero text gone) and chat restores the hero; the ring-less hero case pins the unchanged posture.
- `packages/client/ui-kb/tests/`: entry dispatch (blank session requests the tab, no-session refreshes), workbench settle publication, portal stand-down/return with recent re-read, `scenario.probeColon` in both dictionaries, and the apply-level bridge mirror round trip.
- `apps/web/tests/kb-workbench.e2e.ts`: blank-hero entry through the sidebar (search, hero return), cross-view recent-sync with the `dsh-kb-recent-searches` hard assertion, and the long-chip geometry case (nowrap + row-capped + whole text in the DOM); `[skip-multitab]` placeholder documents the uncovered degradation.
