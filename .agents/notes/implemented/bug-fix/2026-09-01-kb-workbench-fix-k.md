# Agent Note: kb workbench FIX-K blocking batch — lint zero, shared toast, browse race, locale truth, narrow viewport, recent searches, honest usage, ingest failure copy

Status: implemented

English | [中文](2026-09-01-kb-workbench-fix-k.zh.md)

## Problem

The unified verification of the kb workbench redesign scored 75/100 FAIL (code-review 70, design-system-consistency 65 forced failures) with eleven fix classes, K1–K11, spread across lint debt, a hand-rolled toast, a browse race, hardcoded Chinese prompt templates, a narrow-viewport regression that pushed the composer's plan chip out of the 800×720 viewport, missing product surfaces, a dishonest usage card, and a closed-loop e2e that could never boot.

## Decision

### K1: lint reached zero by fixing eight errors and deleting sixty build artifacts, not by narrowing rules

The eight real errors: `unbound-method` at `KbWorkbench.tsx:87` (`inputActions.setDraft` handed over unbound) and `client/index.ts:220` (`bridge.provide`) became arrow wrappers with explicit parameter types; the fixture's `store.subscribe` became `.bind(store)`; four spec `t` stubs narrowed `params` from `Record<string, unknown>` to `Record<string, string | number>` so template interpolation is explicit; one redundant type assertion in `skeleton.client.spec.tsx` was deleted. The other 955 errors came from sixty untracked tsc artifacts (`.js`/`.d.ts`/`.js.map` beside live `.ts` sources) across ten directories; each was listed and confirmed build output before deletion, except `ui-kb/src/css-modules.d.ts`, which is the repo-wide client convention file the other thirty client packages track — it stayed. Final `pnpm run lint`: 0 warnings, 0 errors.

### K2: the workbench toast is the shared `Toast` primitive

The hand-rolled `div.toast` with its own `TOAST_MS` timer and stylesheet rule was replaced by `ui-primitives`' portal-rendered `Toast` (the WorkspaceBrowser pattern: a `{seq, text}` state, `key={seq}` to restart the cycle). Because the primitive renders through a body portal, the ingest-success toast can no longer sit under the ingest modal's mask; the browser evidence capture (`light-ingest-toast.png`) shows the banner over a closed dialog.

### K3: the browse race is guarded by a sequence token, tested through StrictMode

`browse()` now stamps each dispatch with `++browseSeq.current` and drops resolutions (success, failure, or both) whose token a newer browse superseded; the skeleton that replaces the level rows is the in-flight disable. A plain in-flight rejection flag was rejected: the UI already serializes user dispatches (the clickable rows unmount while loading), so the only reachable concurrent dispatch is React StrictMode's double mount effect — which is exactly what the regression test drives: two listDirectory promises, the newer resolves first, the stale first response (a late resolve in one test, a late rejection in the other) lands nowhere and the failure copy stays hidden.

### K4: model-visible prompt templates moved into the locale dictionaries

The carry-to-chat draft template became `result.carryDraft` (`关于「{label}」：{query}，请结合上下文进一步说明` / `About "{label}": {query} — please elaborate with the retrieved context`); each scenario's `probe` split into `probeZh`/`probeEn` with the dock resolving by the active language. Browser evidence: on the English interface the Cite & ask button prefills the English draft.

### K5: the narrow-viewport regression had two causes, both fixed below 900px

The verifier's proposed fix (hide the KB header entry button at ≤900px, keeping the golden contract) was applied — `entry.module.css` gained the media query — but the golden still failed: the real pressure at 800px was the portal dock itself, whose scenario rail stacks eight category groups tall in the 768–900px gap where no media query applied, pushing the composer (and its plan chip and model trigger) below the fold. `hero.module.css` now caps `.portal` at `max-height: 50vh` with internal scrolling in that band. `plan-control-row.e2e.ts` passes again with its golden unchanged (`fully in viewport: true` for both controls). Note for reproduction: the web lane serves built products, so a CSS-only change needs the root build (the client bundle inlines CSS modules) plus the frontend vite build before the e2e reflects it.

### K6: recent searches live in localStorage behind a five-entry log

A new `recentSearches.ts` module owns the log (dedupe, newest-first, cap five, clear, corrupted-entry fallback to empty, in-memory fallback when localStorage is unavailable — the runtime store's persistence contract). The workbench records each completed search; the portal dock renders the rail as its fourth zone with `hero.recent`/`hero.recentEmpty`/`hero.recentClear` copy, reading on mount (the dock is unmounted whenever a search runs, so a mount-time read is always current).

### K7: the usage card states what it measures

The fabricated `订阅：专业版 · 有效` badge is gone (key deleted from the dictionaries, DOM, and stylesheet), and `usage.title` now reads 累计用量 / Total usage — the gateway's usage query has no time window, so "this month" was a claim the backend cannot back.

### K8: ingest failure atomicity is locked by tests at both layers, and the failure copy never leaks transport text

The seam was already embed-before-store with a transactional `putDocument`; what the batch adds is the lock: a runtime spec case for the short-vector embed failure (`putCalls` and `usageCalls` both empty) beside the existing network-failure case, and an apiproxy domain case shaping a seam refusal as the `kb-ingest-failed` wire error. On the client, `classifyIngestFailure` collapsed to three classes — unknown and server faults both read the new `ingest.failed` copy instead of the raw rejection string — and a failed ingest now reloads the shared counters (`onFailed`).

### K9: search and ingest now refresh usage symmetrically, with a synchronous double-dispatch guard

A completed search calls `refresh()` (the search count increments server-side); `runWith` consults a `busyRef` before `setBusy` commits, so a same-frame double dispatch cannot double-count. Browser evidence: the usage card moved 49→50 immediately after one search.

### K10: the empty-KB CTA tells the truth

`hero.emptyAction` now reads 试试检索 / Try a search, matching what the button actually does (fill the first sample question into the composer). Behavior unchanged; the copy test locks the pairing.

### K11: the closed-loop e2e boots again

`fixtures/kb-closed-loop.cordis.yml` declares `dsh-web` and `dsh-web-fetch-http`, but `kb-closed-loop.e2e.ts`'s in-process import map never registered them, so any keyed run died on `unexpected Loader import`. The map (and imports) now mirror `kb-closed-loop.spec.ts`, which had been correct all along.

## Alternatives considered

- **K3 via an in-flight rejection flag alone**: rejected — unreachable through the public UI (the rows unmount while loading) and blind to the StrictMode double effect, which is the one concurrent dispatch that actually happens.
- **K8 by mapping transport failures to the existing `urlUnreachable` copy**: rejected as dishonest — an embed fault or a 500 is not an unreachable page; the new `ingest.failed` key says only what is known.
- **K6 via a shared store subscription instead of a mount-time read**: rejected — the dock and the workbench are never mounted together, so a localStorage read on mount is always current and needs no event plumbing.
- **K5 by hiding the scenario rail below 900px**: rejected — it would remove the portal's primary navigation on narrow screens; capping the dock's height keeps every zone reachable through internal scrolling.

## Consequences

- `packages/client/ui-kb/src/client/` — `KbWorkbench.tsx` (shared toast, `onFailed`, arrow-wrapped `setDraft`), `KbSearch.tsx` (locale carry template, `refresh`, `busyRef`, recent-search recording), `KbIngestDialog.tsx` (sequence-token browse guard, three-class failure copy, `onFailed`), `KbUsageCard.tsx` (no subscription line), `hero/KbHeroDock.tsx` (bilingual probes, recent-search rail), `hero/scenarios.ts` (`probeZh`/`probeEn`), `locales.ts` (five new keys, two deleted, two rephrased), new `recentSearches.ts`; `workbench.module.css`/`hero.module.css`/`entry.module.css`.
- `packages/client/ui-kb/tests/` — five specs updated to the new behavior, new `recentsearches.client.spec.ts`; `client/index.ts` arrow types; `tests/kb-fixture.client.ts` bind.
- `packages/kb/kb/tests/runtime.spec.ts` (short-output atomicity case), `packages/host/apiproxy/tests/kb-domain.spec.ts` (wire-error shape), `examples/kb-agent/tests/kb-closed-loop.e2e.ts` (import map), `packages/client/ui-conversation/tests/skeleton.client.spec.tsx` (assertion cleanup).
- Focused suites green: ui-kb (107), ui-conversation + kb + apiproxy (1254), examples/kb-agent (3), web e2e kb-workbench + new-session-lifecycle + plan-control-row (12); `typecheck`, `lint` (0/0), `build`, `doc-sync` (28), `duplication` (0 clones) all pass; changed src at per-file 100% (`client/ui-kb/src` all columns).
- Browser evidence in `screenshots/kb-redesign/fix-k/`: light hero (empty recent rail) and workbench, ingest toast over a closed dialog, dark workbench, English carry draft, 800×720 with the KB header button hidden and the model trigger fully in viewport, recent-searches rail with a recorded query.
