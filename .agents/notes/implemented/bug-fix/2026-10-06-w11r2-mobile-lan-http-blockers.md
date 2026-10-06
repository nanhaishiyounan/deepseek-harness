# Agent Note: W11-R2 mobile LAN-HTTP delivery blockers — idempotency-key secure-context fallback, attachment persistence hygiene, batch failure toast, logout key sweep

Status: implemented

English | [中文](2026-10-06-w11r2-mobile-lan-http-blockers.zh.md)

## Problem

W11-R1 re-verification closed PASS_WITH_DEBT 87.8; the go-live verdict held that the LAN HTTP deployment face must not ship until this batch lands. Four debts, all with recipes:

- **`newClientMsgId` bare `crypto.randomUUID()` (critical carry-over, w7-era)**: `sessionsService.ts` built the send's idempotency key with a bare secure-context-only call — on LAN HTTP (`isSecureContext === false`) the tap on 发送 threw `TypeError: crypto.randomUUID is not a function` before the wire attempt, `setSending(true)` never reset, the composer deadlocked, and the message vanished silently. W11-R1's `uid()` fallback had covered attachment ids and rpcIds; this call site predates it and survived.
- **Attachment persistence with no hygiene**: `loadPersisted`/`savePersisted` trusted `localStorage` — a corrupt strip parsed to `[]` and stayed; a quota-exceeded write threw through `commit()` and killed the pick pipeline; nothing logged a key name an operator could grep.
- **Batch failure toast reported one of N**: the Composer's one-shot failed-attachment toast `find`-ed the first fresh failed row, so three failed picks stacked three separate render cycles of partial truth (and a same-commit batch named only its first member).
- **Logout left attachment keys behind**: the W11-R1 strip persisted under `dsh-mobile-attachments-<sid>`, but the logout path cleared only the outbox and work queue — a departed account's attachment strips (and any draft-edit residue) leaked into the next login's storage.

## Decision

- **The idempotency key rides `uid()`** (`newClientMsgId` = `uid().replace(/-/g,'').slice(0,8)` as the nonce — dash-stripped so both the UUID and the 16-byte-hex fallback arms yield 8 hex chars), and the key build moved **inside the try** of `ChatView.send()`: any failure there rides the same catch/finally, so `setSending(false)` always runs. The catch's TypeError arm re-derives a fresh key when the build itself died — safe because nothing was ever dispatched under a failed build.
- **Persistence hygiene mirrors outboxStore**: `savePersisted` wraps `setItem` in try/catch with structured `console.warn` traces (`attachments.persist-failed` / `attachments.persist-quota` / `attachments.persist-corrupt`, all naming the key); quota exhaustion evicts the **oldest other session's strip** (ranked by a new `savedAt` field, version bumped 1→2 — a strip that fails to parse ranks oldest, so eviction clears residue) and retries once; `loadPersisted` deletes a corrupt or non-conforming key instead of leaving it. `isQuotaExceeded` reads `name === 'QuotaExceededError'` without requiring `instanceof Error` — the spec's DOMException is not an Error subclass.
- **The batch toast aggregates**: the Composer collects *all* fresh failed rows per commit (`filter` over `attachments`) and toasts once — `「N项附件上传失败：『a』原因A；『b』原因B」` — with the `toasted` set still deduped by row id.
- **The logout sweep has one source**: new `localKeys.ts` exports `MOBILE_SESSION_KEY_PREFIXES = ['dsh-mobile-draft', 'dsh-mobile-outbox', 'dsh-mobile-attachments']` plus `sweepSessionKeys()`; `App.onLogout` runs it after `clearOutbox`/`clearWorkOutbox`/`clearIdentity` (those still own timers and in-memory state; the sweep owns only the key space). Keys outside the prefixes — theme, read watermarks, pins — survive logout by design.

## Consequences

ui-mobile 754/754 (R2-era additions: views LAN-HTTP terminal-state 2, attachments hygiene 4, composer batch toast 1, local-keys 4; the ledger read 745, undercounting by 9 — corrected in W11-R4), typecheck green, oxlint 0 errors on changed files. Live re-verification `w11-r2-live-verify.log` 9/9 under a **genuinely insecure context** — `http://w11lan.test:3080` mapped to 127.0.0.1 via Chromium `--host-resolver-rules` (the CLI refuses non-loopback binds by design; the /api trust fence whitelists the authority via `--trusted-host`): environment face asserts `isSecureContext === false` and `randomUUID === undefined` with no stubs; send taps reach terminal states (wire carries an `m_`-prefixed `clientMsgId` from the uid fallback, draft clears, sending resets after the opened turn, second message sends with a distinct key, history lands the message); a ready attachment strip rehydrates after reload under the same face; logout drops all three seeded key families while the theme key survives. Screenshots `w11-r2-{01-lan-http-send-terminal, 02-attach-rehydrate-insecure, 03-logout-swept}-375.png`.

The lib-contract lesson re-confirmed: `apps/web` imports `@deepseek-ai/dsh-client-ui-mobile` bare (main → `lib/`), so a source fix reaches the served dist only after `pnpm run build:lib:client` **then** the apps/web vite build — the first live run served a fresh dist over a stale lib and reproduced the pre-fix crash faithfully.

## Alternatives considered

- **Keep the key build outside the try and only swap in `uid()`** — fixes the known crash but leaves every future line added above `promptSession` one refactor away from the same stuck-sending deadlock; the try covers the whole attempt.
- **Evict by key-name order instead of `savedAt`** — session ids carry no order; a persisted timestamp is one number per strip and ranks eviction correctly.
- **Compat-read version-1 strips in `loadPersisted`** — the strip is a refresh cache, not a ledger; pre-release stance says reject old on-disk formats (the corrupt-key deletion handles the residue).
- **Have each store register its own keys into the sweep** — three registration calls to keep in sync versus one array next to the only consumer that walks it.
