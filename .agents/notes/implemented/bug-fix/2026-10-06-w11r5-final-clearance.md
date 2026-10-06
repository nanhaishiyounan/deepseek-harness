# Agent Note: W11-R5 final clearance — the counting-scope errata with a machine reproducer, the snapshot key sweep, the hoisted chat toast anchor, the acceptance-narrative gate

Status: implemented

English | [中文](2026-10-06-w11r5-final-clearance.zh.md)

## Problem

W11-R4 re-verification closed PASS_WITH_DEBT 88.3 (go-live released) and registered one debt plus three incidental items; R5 clears all four:

- **D-1: the ledger attributed the 9-case gap to the wrong cause.** INDEX and the R4 note read R2's 745 as an undercount of 754; the gap is the counting scope. The mechanism surfaced while building the reproducer: the vitest CLI takes substring filters, so `packages/client/ui-mobile` also matches `packages/client/ui-mobile-preview/…` — the convention command has included the preview package's constant 9 tests (first present in the mobile-v3 commit 15ca104ab8, still 9 after the v6 rewrite 1654107d68) since before W11. R2's own 745 is the pure package figure its narrow tests/ command produced; R2's real additions were 11 (743→754).
- **The logout sweep walks the live collection while mutating it**: `sweepSessionKeys()` iterates `localStorage.key(index)` backwards and removes inside the loop — correct on paper, but the walk reads a collection being reindexed under it; a snapshot decides the doomed set up front.
- **The chat input face's toasts ride two anchors**: the batch and send-failure toasts lift through `css.toastLift` (W11-R3/R4) while the uploading-blocked send (ChatView), the voice lane's error (ChatView), the unsupported-environment notice (QuickPanel), and the two pick guards (attachments) call bare `Toast.show`.
- **Acceptance narratives had no machine gate**: wording like「R2 期实增 11」lives in INDEX but nothing checks it against the files or the git history it describes.

## Decision

- **INDEX opens with a counting-scope definition** (one paragraph, both figures, the constant-9 provenance, the reproducer's path) and the R2/R3/R4 ledger lines restate the corrected attribution; the w11r4 note (en + zh) carries the same correction inline; `verify-translation-pairing --write` re-recorded the pair. `demos/acceptance-w11/scripts/count-ui-mobile-tests.mjs` reproduces both figures by running vitest over explicit tests/ paths (the pure scope must pin `packages/client/ui-mobile/tests` — the substring behavior is what the convention rides) and writes `w11-r5-test-count.json`; one retry per scope absorbs busy-host jsdom timeouts without hiding a second failure.
- **The sweep snapshots first**: `Object.keys(localStorage)` decides the doomed set, then the removals run against the frozen list. The local-keys spec's sweep case now seeds 12 session keys across the three families plus 5 unrelated keys and asserts all 12 die while the 5 survive byte-identical.
- **`chat/toast.ts` is the chat input face's one anchor**: `hoistToast({ content })` shows at the bottom position with the `toastLift` mask; ChatView (two call sites), QuickPanel (one), attachments (two), and Composer (batch + ErrorToast, the two hand-spread call sites folded in) all route through it. `toast-anchor.client.spec.tsx` pins the runtime options and walks the chat input face's source asserting no `Toast.show` call outside the helper.
- **`verify-acceptance-narrative.mjs` gates narratives mechanically**: each claim is a `{ claim, file-glob, must-contain | absent }` triple plus optional commit facts checked against `git show --name-status` (plain `--stat` truncates long paths — the gate's own first run caught that). The R5 batch runs it 6/6 (`w11-r5-narrative-check.log`), including two commit facts: the R2 commit touched ui-mobile's tests but not the preview package, and the preview spec first landed in the mobile-v3 milestone. A W11-R6 follow-up re-recorded that log: the R5 section's own narration quoted the banned wording back (while narrating what the gate had caught) and self-triggered the absent check against the committed tree; the quote became a paraphrase and the gate re-ran 6/6.

## Consequences

ui-mobile 757/757 by the convention scope (pure package 748 + preview 9; new: toast-anchor 2; the 12+5 sweep fixture replaced the 3-key case with no count change), `tsc -b tsconfig.client.json` green, oxlint 0 errors on changed files. The reproducer's figures cross-check the full-tree run (757) and pin delta=9. One busy-host flake, unrelated to the changed surfaces: `views.client.spec.tsx > rejects from the review card…` brushed its 5s timeout at 5017ms in two parallel full-tree runs; the single file passes 106/106 three times in a row.

## Alternatives considered

- **Keeping the backwards walk** — it is correct against the documented reindexing behavior, but the snapshot states the same contract without asking every reader to re-derive why removing inside a backwards walk is safe; the spec's byte-identical survivors pin the stronger property.
- **Hoisting every app toast (40 call sites) to the lift anchor** — toasts outside the chat screen (home, alerts, work) never compete with the composer band; the anchor's domain is the chat input face, and the static scan pins exactly that boundary.
- **Baking the R5 claims into the gate script** — a JSON claim file keeps the gate generic and the claims reviewable as evidence.
