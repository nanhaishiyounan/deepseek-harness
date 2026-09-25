# Agent Note: Mobile v6 D1 — the user-screenshot diagnosis fix batch

Status: implemented

English | [中文](2026-09-25-mobile-v6-d1-user-screenshot-fixes.zh.md)

## Problem

The user sent two live-device screenshots ("look at this, it's ugly"): the form-assistant chat with the create-task sheet open, and the home tab. Vision-model inspection plus computed-style probes against `:3080` (evidence: `research/2026-09-24-mobile-v6-audit/USER-SCREENSHOT-DIAGNOSIS.md`) confirmed sixteen defects. The sheet mixed two field languages (a boxed title input over underline-style picker rows), nested the due-date clear X inside the value chip as a span sharing the primary color with the chevron, and had no viewport cap — on real-phone Safari viewports (~650px) the pinned-looking action row scrolled offscreen and 创建任务 became unreachable. The source strip tripled the AI suggestion into itself, and the suggestion block read at the same weight as the source strip. Home clipped every roster name to an ellipsis (38 colleagues, 6–9-character names against a 64px single line), laid the quick-task chips at four uneven widths that wrapped at 375px, and gave statsCard/recentList no shadow while every work-domain card carried one.

## Decision

- **Sheet = pinned-footer bottom sheet (the NewChatSheet pattern).** `.sheetBody` caps at `calc(100dvh - 76px)`; the sheet becomes a flex column of head / `.sheetScroller` (overflow-y auto, overscroll contain) / `.sheetActions`, so the cancel/create pair stays glued above the safe area on every viewport instead of being pushed offscreen.
- **One field language.** `.pickerRow` takes the title input's boxed face (1px border, 10px radius, 44px, 12px padding, muted press), so all three form rows read as the same control; the chevron drops to `--dshm-muted-foreground` (chrome, not value) and the due-date clear affordance gets its own `.pickerClear` muted hit circle (a span-role button — it nests inside the row button, so it cannot be a native button).
- **Information de-duplication.** The source strip keeps only the source title (two-line clip); the suggestion text lives exactly once, in the suggestion block, which takes the work detail's quote language (muted fill + 3px brand left bar) to separate it from the primary-10 source strip.
- **Home rhythm.** Roster names clamp to two centered lines on 76px cards (all 38 names render in full); quick-task chips ride a `repeat(4, 1fr)` grid so they never wrap and always tie; statsCard/recentList/recentSkelGroup carry `--dshm-shadow-card` like every work card; the ledger grid rules its columns with the solid border token, lifts the number to 22px, and mutes the label; recent rows take the chats layer's 64px + hairline-divider language; the unread dot drops to 8px; the roster rail's right fade widens to 26px.

## Alternatives considered

- A numeric unread badge (the design mock's `.conv-badge`) was rejected: the draftStore watermark is boolean, and inventing a count would fake data.
- Deepening the ledger column rules beyond `--dshm-border` or the card shadows beyond `--dshm-shadow-card` was rejected — the hairline family and the 0.07 halo are the cross-page system; one page deepening its own would fork the card language.
- Word-boundary breaking for roster names (`word-break: keep-all`) was rejected: CJK names without spaces would overflow into the clamp instead of wrapping, trading a normal mid-word wrap for a worse cut.

## Consequences

- `pnpm vitest run packages/client/ui-mobile` runs 613 tests green (the sheet's structure change nests picker/date portals unchanged); repo typecheck, lint (0/0), and build (220 artifacts) stay green; `mobile-assistant.e2e` passes. The snapshot suite's 5-file red and the kb-agent/NocoBase e2e reds are pre-existing (a clean-HEAD stash run reproduces both) and untouched by this batch.
- The `:3080` dev server serves ui-mobile from built client artifacts, so every visual change needs a `pnpm run build` before reshoots — the 03:19 archive (`d1-fix-2~5`) predates the final column-rule token swap and is re-verified by `d1-fix-1-home.png` + `.d1-home-reshoot-evidence.json` after the rebuild.
- The original server (PID 51859) died with its terminal session before the final reshoot (unrelated to this batch); it was restarted with the identical command as PID 63453, and the in-memory demo sessions of that day went with it — user-screenshot session states replay only while the server process lives.
- Screenshot evidence: `research/2026-09-24-mobile-v6-audit/` — `d1-user-1~4` (before), `d1-fix-1-home / 2-chat / 3-taskform / 4-taskform-small / 5-taskform-dark` (after), probes in `.d1-user-evidence.json` / `.d1-fix-evidence.json`.
