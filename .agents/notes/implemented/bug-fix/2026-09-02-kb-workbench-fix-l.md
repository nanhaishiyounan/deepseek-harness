# Agent Note: kb workbench FIX-L polish batch — blank-session workbench entry, cross-view recent-search e2e, half-width colon locale, long-query chip cap, multi-tab degradation docs

Status: implemented

English | [中文](2026-09-02-kb-workbench-fix-l.zh.md)

## Problem

The FIX-K verification passed at 95/100 with five lessons (#9–#13) carrying exact remedies: a blank session hid the view ring until the first message, no e2e pinned the hero's recent-search rail to the workbench history, the scenario modal's colon sat in the dictionary as a full-width glyph for both languages, an arbitrarily long recorded query could stretch the portal past the composer, and the multi-tab last-write-wins degradation was documented nowhere.

## Decision

### L1: the blank session renders the view ring additively; the shell stays deployment-agnostic

The lesson proposed weakening the `messages.length === 0` guard. The landed rule is stated in tab count, not message count: `ConversationSessionHeader` hides only while `blank && composerPhase === 'blank' && tabs.length <= 1`, so a ring beyond the chat fallback keeps the header (and its tab row) mounted before the first message, while a ring-less deployment keeps the exact prior posture — the ui-conversation shell never learns that a kb exists. The body side gets the matching exemption: the blank phase's chat view still yields the column to the hero, but any other resolved view (a deployed workbench tab) owns the body through the normal `conversation.view` slot render. `KbEntry` dispatches on session state: with a session (blank included) it calls the view bridge's `requestKbView()` — a no-op until a bridge publisher mounts, in which case the tabs stay manually clickable — and only a session-less page falls back to refreshing the portal stats. Feature presence is decided by the view-ledger registrations (slot existence), never a hardcoded kb constant.

### L2: the cross-view recent-search flow is e2e-pinned with a storage-level hard assertion

`kb-workbench.e2e.ts` gained "syncs the hero recent-search rail with the workbench history across views": three distinct queries run through the workbench's real gateway face, then the chat tab's hero rail must list them newest-first, and `page.evaluate` reading `localStorage('dsh-kb-recent-searches')` must equal the exact array — the rendered copy alone proves nothing.

### L3: the scenario modal's colon became a locale key

The JSX concatenation now reads `t('scenario.probeLabel') + t('scenario.probeColon')`; the key is `：` in zh and `: ` in en, symmetric across the `KbKey` union and both dictionaries.

### L4: a recorded query caps at the row width and ellipsizes

`.recentRow > button` gets `max-width: 100%` + `overflow: hidden` + `text-overflow: ellipsis` + `white-space: nowrap`; FIX-K's `.portal { max-height: 50vh }` backstop already covers the >900px band, so no duplicate cap was added. The e2e case submits an 81-character query, then proves the geometry: computed `text-overflow: ellipsis`, `white-space: nowrap`, chip width within the row width, and the full text still stored whole in localStorage.

### L5: the multi-tab degradation is documented, not silently dropped

Both kb-agent READMEs gained the Known Limitations entry: `dsh-kb-recent-searches` persists whole-value, so two tabs completing workbench searches inside one write window interleave writes and can drop one recorded query; single-tab use is unaffected. The e2e file carries a `[skip-multitab]` placeholder comment explaining why no runnable case exists (one-world lane, no cross-tab storage coordination) and pointing at the README entry.

### Re-recording lifecycle-chrome goldens was part of the change, not collateral

L1 legitimately alters the blank hero's accessibility tree (the header banner with the three-tab ring and the recent-search region now render there), so `hero.expected.md`, `plan-active.expected.md`, and `reloaded.expected.md` were re-recorded under `DSH_SNAPSHOT=refresh` and re-verified under replay. The first replay after the source change served stale goldens because the web lane serves built products — the record ran against the rebuilt bundle.

## Alternatives considered

- **L1 by keying the guard off `messages.length`**: rejected — the header does not read the message list; the tab ledger is the authoritative signal for whether a ring exists, and it keeps ring-less deployments byte-identical.
- **L1 by mounting the kb entry's own workbench route**: rejected — the view ring is the shell's navigation contract; a parallel route would fork the back-to-hero behavior the e2e pins.
- **L4 by clamping the recorded query length at write time**: rejected — the log must store what the user searched; presentation caps at render.
- **L5 by a BroadcastChannel-based merge**: rejected for this batch — a correct cross-tab merge needs its own protocol and tests; documenting the degradation is the honest scope.

## Consequences

- `packages/client/ui-conversation/src/client/skeleton/ConversationSession.tsx` (header guard, body exemption), `ui-kb/src/client/KbEntry.tsx` (session-state dispatch), `ui-kb/src/client/locales.ts` (`scenario.probeColon`), `ui-kb/src/client/hero/KbHeroDock.tsx` (colon via `t`), `ui-kb/src/client/hero/hero.module.css` (chip cap).
- `apps/web/tests/kb-workbench.e2e.ts` (+3 cases: blank entry round-trip, cross-view sync with the localStorage hard assertion, long-query chip cap), re-recorded `snapshots/lifecycle-chrome/*.expected.md`; `examples/kb-agent/README.md` + `README.zh.md` Known Limitations entry.
- Focused suites green: ui-kb + ui-conversation units (594), kb-workbench e2e (8), new-session-lifecycle + cold-blank + lifecycle-chrome e2e; browser evidence in `screenshots/kb-redesign/fix-l/` (six shots: blank hero with the ring and sidebar entry, workbench open from blank, cross-view recent rail, en/zh probe colon, capped long chip).
