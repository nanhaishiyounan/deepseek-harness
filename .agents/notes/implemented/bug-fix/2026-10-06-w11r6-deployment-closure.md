# Agent Note: W11-R6 final closure — the narrative gate's self-trigger paraphrase, the ui-mobile lib deployment chain, the live 100-key sweep

Status: implemented

English | [中文](2026-10-06-w11r6-deployment-closure.zh.md)

## Problem

W11-R5 re-verification closed FAIL 84 with three half-hour closure debts; R6 clears all three plus two incidental items:

- **The R5 section's narration quoted the banned wording back.** While narrating what the gate's first run had caught, the INDEX line included the forbidden attribution phrase itself, so the gate's own absent check failed against the committed tree — the 6/6 log had been recorded before that narration was written and no longer described the tree it lived in.
- **The R5 sources never reached the deployment face.** R5 changed ui-mobile sources (the hoistToast anchor, the snapshot sweep) but never ran `build:lib:client`, so apps/web's bare import kept resolving to the pre-R5 `lib/` — the served :3080 bundle carried hoistToast zero times and none of R5's behavior was verifiable live.
- **Two incidental items**: `vfy-w11r4-spec-full.log` sat untracked, and `count-ui-mobile-tests.mjs` printed its failures but always exited 0.

## Decision

- **The quote became a paraphrase** — "the stale attribution wording" in place of the banned phrase — and the gate re-ran 6/6 with EXIT=0 against the committed tree (`w11-r5-narrative-check.log` re-recorded). The w11r5 note (en+zh) carries the R6 re-record timing so its 6/6 statement is true of the tree it ships in. The order is fixed (lesson 11): edit → gate → log → commit.
- **The deployment chain was rebuilt end to end**: `pnpm run build:lib:client` (EXIT=0; `lib/index.js` mtime 14:34:21, grep hoistToast = 8) then apps/web `vite build` (dist mtime 14:34:46, bundle `mobile-CRpPj6AV.js`). The minifier renames the helper inside the served bundle, so the anchor is proven by behavior, not by name: `.verify-w11r6.mjs` runs 7/7 on :3080 (the three-family sweep clears every session key and keeps the theme, the `session-keys.swept` trace counts 3, and the hoistToast batch-failure toast rides the lift anchor at computed bottom 150px with 25px clearance). A 100-key plant on real Chromium Storage — 60 session keys across the three prefixes plus 40 unrelated — sweeps with zero misses and 40 byte-identical survivors (`w11-r6-sweep-100keys.log`, 4/4).
- **The count script now fails its caller**: `process.exitCode = failed ? 1 : 0` at the tail.
- Two probe adaptations (reproduction tooling, not product faces): the logout confirm click dropped `force` — a forced click's events never reach the dialog button's React handler on this build; the unforced R3 form after the entrance animation settles is stable — and the 100-key census asserts the exact planted list, because the shell's own runtime keys (auth, the work projection, its outbox) live in the same storage and the outbox store legitimately persists its empty queue back during the walk to logout, making 61 the honest swept count with every planted key among them.

## Consequences

ui-mobile 757/757 by the convention scope (no new tests — R6 changes no source behavior), `tsc -b tsconfig.client.json` green. The narrative gate's log now describes the tree it ships in, and the live face proves R5's two behavior changes (the single toast anchor, the snapshot sweep) on the rebuilt deployment chain.

## Alternatives considered

- **Re-recording the log without touching the wording** — the gate greps the working tree, so any narration that quotes a banned phrase re-fails it on every rerun; the paraphrase is the only stable form.
- **Pinning the swept trace to exactly 60** — the outbox store's runtime write-back makes 61 the honest count; the zero-miss contract is "every planted session key is in the swept list", which is what the assertion now states.
