# Agent Note: W11-R1 mobile attachment six-fix round — the outbox double-send closure, secure-context id fallback, failed-chip visibility, one send gate, refresh survival, and the probe truth debt

Status: implemented

English | [中文](2026-10-05-w11r1-mobile-composer-attachment-fixes.zh.md)

## Problem

The W11 final verification FAILED at 80.5 (every core intent landed) with 1 Critical + 5 Important left, all narrow-surface:

- **Outbox attachment double send (Critical)**: the offline-parking branch of `ChatView.send()` only ran `setDraft('')` without `lane.clear()` (asymmetric with the online success path) — after an offline send the ready chip lingered, so the follow-up text sent after recovery re-attached the same `📎` quote (live proof: `vfy-w11-ps-t1-offline-outbox-attach-lingering-375.png`).
- **Bare randomUUID calls**: two id sites in `attachments.ts` and the rpcId in `rpc.ts` called `crypto.randomUUID()` (secure-context-only) — on the LAN HTTP deployment face (no HTTPS) the camera, album, and file lanes plus login all died silently (the pre-existing rpc.ts site fired first; the two attachment sites were W11's new twins).
- **attachError clipped invisible**: `.attachError` sat absolutely at `bottom:-16px` outside the chip, clipped by the `overflow-x:auto` rail, with no Toast — the user never saw why a pick failed.
- **Send gate ignored attachments**: the stamp's `disabled` looked only at `draft.trim()===''` — a ready-attachment-only draft left the button dead, contradicting `composeWithAttachments`' "quotes alone are sendable" semantics.
- **Ready attachments had zero persistence**: plain useState — a refresh or background reclaim lost them and the user re-picked.
- **Truth debt**: `INDEX.md` claimed fillDraft A0–A9 green; the recorded run shows A5 FAIL. Root cause: the probe read the wrong element (the textarea's inputShell parent, while data-fill lives on the inputRow) — no product regression.

## Decision

- **finalizeSend single point**: extracted `finalizeSend()` (clear draft + `lane.clear()`) invoked at all three send terminals (online success / outbox parking / server refusal) — the composer reset is symmetric across terminals and future send-level cleanup has one home. Clearing on refusal is deliberate: a retained-chip "retry" path is the same double-send window as the offline lingering; the ErrorToast names the failure once.
- **uid() fallback**: new `uid()` — prefer `crypto.randomUUID`, else 16 random bytes from `getRandomValues` as 32 hex digits (these ids need only opaque uniqueness; there is no format contract with the server); all three call sites replaced. `getRandomValues` stays available in non-secure contexts.
- **Error line inside the chip**: `.attachChip` gained `flex-wrap: wrap`, `.attachError` became an in-flow second line (`flex-basis:100%` + `--dshm-fs-caption`) — the chip grows its own height and the rail never clips it; the Composer additionally toasts once per newly failed row (a `toasted` Set keyed by id; the chip's own error line carries the detail long-term, the Toast only wins attention).
- **canSend single source**: `canSend = (draft.trim() !== '' || hasReadyAttachment) && !sending` — uploading/failed rows never reach the wire, so they never arm the send (same-source semantics as the compose filter); the stamp and the Enter handler bind the one flag.
- **Session-scoped persistence**: `useAttachments(sessionId?)` — ready descriptors (id/kind/name/sizeBytes/quote) are written under `dsh-mobile-attachments-<sid>` on `visibilitychange→hidden` and `pagehide` (the quote must ride along: once the File handle is gone it is the only recoverable form of the content); the mount rehydrates them as ready rows in the useState initializer (thumbUrl is unrecoverable; an image falls back to the glyph); `commit()` keeps storage in lockstep, so a cleared strip never resurrects after a refresh.
- **Truth-debt repayment**: the probe selector became `slot.closest('div[class*="inputRow"]')`; both INDEX sentences were rewritten to the recorded reality (A1–A4/A6–A9 passed, A5 was a probe error, re-run green after the R1 fix), plus an R1 evidence section.

## Consequences

ui-mobile 743/743 (new composer.client 7 + uid 2 + attachments 4 + composer-skin CSS contract 1 + views outbox double-send 1), apiproxy 488/488, typecheck green, oxlint 0/0. Live re-verification `w11-r1-live-verify.log` 16/16: after offline parking the chip strip is gone (attachRow=0), the wire retries share one clientMsgId (server-side idempotent fold), history holds exactly one quoted message, and the follow-up plain text carries no attachment on both wire and history; the failed error line reads errTop=725 ≤ chipBottom=748 inside the scrollable rail at 12px; an empty draft with one ready attachment arms the stamp; login and the attachment lane both stay ready with randomUUID stubbed undefined; a reload rehydrates the ready strip. The corrected A5 probe re-ran A0–A9 + B 11 routes all green (`w11-b1-regression.log` updated).

## Alternatives considered

- **Only patch lane.clear() into the parking branch** — the minimal diff, but the three terminals stay asymmetric and the next send-level cleanup need would miss a branch again; finalizeSend makes the symmetry structural.
- **A hand-built full UUID v4 (version/variant bits) for uid** — the consumers (server idempotency key, chip keys) read no format; the hand-set bits are ceremony.
- **Keep the failed error line absolute but raise z-index and pad the rail** — still depends on rail geometry cooperating; the two-line layout lets the chip own its own height.
- **Persist attachments as blobs in IndexedDB** — the usable form of a ready attachment is the quote text (the send face is text); storing blobs pays for a "re-upload the original" feature that does not exist.
