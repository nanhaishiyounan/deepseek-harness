# Agent Note: W11-R3 go-live tail items — logout disclosure, sweep trace, batch-toast re-anchor, verification-count erratum

Status: implemented

English | [中文](2026-10-06-w11r3-go-live-tail-items.zh.md)

## Problem

W11-R2 re-verification closed PASS 87.7 (LAN HTTP deliverable) with four hour-scale go-live suggestions. All four ride the R2 batch's own surfaces:

- **Verification-count erratum**: the R2 INDEX entry and note (en + zh) claimed `w11-r2-live-verify.log` 11/11; the log actually carries nine assertions (R2-0, R2-1a..1f, R2-2, R2-3).
- **Logout disclosure debt**: W11-R2's sweep clears drafts, parked outbox messages, and attachment strips on logout, but the confirm dialog still said only「会话与业务数据保留在服务端」— the enlarged local clearing face went undisclosed at the destructive tap.
- **Silent sweep**: `sweepSessionKeys()` returned the removed keys and nothing consumed them — an operator could not grep how many keys a logout dropped, while outboxStore and the attachment hygiene both leave structured traces.
- **Batch-failure toast overlaps the strip**: antd-mobile's bottom toast anchors over the same viewport band the attachment rail occupies; the failed chips it names sit underneath it (measured clearance −15px on a 375×812 viewport).

## Decision

- **The count reads what the log says** — three files corrected to 9/9, then `verify-translation-pairing --write` re-recorded the note pair's blob hash.
- **The dialog discloses the sweep's local face**:「退出后需重新输入账号密码登录；会话与业务数据保留在服务端；本地草稿与待发消息将被清除。」The views spec now pins the disclosure line on the confirm dialog before the destructive tap.
- **The sweep leaves one trace**: `App.onLogout` consumes the returned key list — `console.info(JSON.stringify({ type: 'session-keys.swept', count, keys, at }))` — the outboxStore observation format; `localKeys.ts`'s `@returns` JSDoc already named the key list as the trace detail.
- **The toast re-anchors on its bottom edge, not its top**: live measurement showed the open-state toast main rides `position: absolute` with its bottom edge pinned near the viewport floor — overriding the inline `top: 80%` merely stretches the box's height (the rect bottom never moves). The lift therefore sets `top: auto !important; bottom: 150px !important` through the toast's `maskClassName` (CSS-module class scoped in chat.module.css): the bottom edge lands 25px above the strip's top rail and stays there regardless of toast height (one- to three-line batches measured); `ToastShowProps` has no style passthrough, and `maskClassName` reaches the mask the main element hangs under.

## Consequences

ui-mobile 754/754 (new: views logout-disclosure 1, composer maskClassName 1), `tsc -b tsconfig.client.json` green, oxlint 0 errors on changed files. Live verification `w11-r3-live-verify.log` 6/6 on the rebuilt :3080 dist: the page identity is seeded straight into localStorage (every item under test is pure front-end behavior — no product seam stubbed) and the `nocobase-unauthorized` bounce a seeded token provokes is isolated with a `not-composed` refusal; the toast geometry asserts clearance=25.0px ≥15px with computed bottom=150px, the dialog text discloses verbatim, and the logout leaves `session-keys.swept` with count=3 covering all three seeded key families while the theme key survives. Screenshots `w11-r3-{toast-lift-clearance, logout-disclosure}-375.png`.

## Alternatives considered

- **Override the inline top with `!important` (the first attempt)** — measured: computed top moves, the rect bottom does not; the box stretches between the top offset and the pinned bottom edge, so the chips stay covered.
- **A larger top-based lift (calc(80% − 300px))** — the needed offset scales with the toast's own height (a two-failure batch runs ~153px); a bottom anchor makes the clearance height-independent by construction.
- **Toast position `center`** — clears the strip too, but abandons the bottom-toast convention every other toast on the surface keeps; the re-anchor preserves it.
- **Trace inside `localKeys.ts`** — the sweep module would then own console policy; the logout path in App.tsx is where the other logout traces already live.
