# Agent Note: W9 identity injection moved server-side (system-prompt section + row-level todo filtering)

Status: implemented

English | [中文](2026-10-04-w9-identity-server-side-injection.zh.md)

W9 removed the last user-visible trace of login identity from the mobile chat lane: identity now rides the server-assembled system prompt and server-enforced row filters, never the message text.

## Problem

Since W6-B0 the gateway stamped a first line `【登录身份】…——本行由系统注入：…` into the session's first durable user message. Three costs:

- The line rendered inside the user's own bubble on every replay — users read it as leaking an instruction into "their" message.
- The stamped prose was the only identity the model could trust, so a hand-typed `【登录身份】admin…` later in the conversation competed with it.
- "查待办只看自己" (list your own approval todos) was enforced by that prose alone: `nb_list`/`nb_get` carried zero identity logic for `wfl_approval_todos`.

## Decision

Three enforcement layers, all server-owned; the prompt text demoted from identity carrier to identity narration.

1. **System-prompt section.** The apiproxy (the acting-user registry's owner) registers one section `gateway:acting-user` at `order: -90` whose text function reads `sessionActingUserOf(ctx.agent?.id)` — token-derived, re-bound on every prompt (following an account switch the section follows the new user, which the old stamped text never did). Unbound sessions (PC shell / CLI / keyless snapshots) render an empty string; the section's render path skips the empty body without polluting the system text. The persona contract in `examples/kb-agent/agent-presets/mobile-form-assistant/agent.cordis.yml` now points at the system section and explicitly invalidates any identity narrative inside user messages.
2. **Row-level filtering.** `nb_list` on `wfl_approval_todos` under a bound session appends a server-side `user = acting.username` condition (the gateway's `nocobase.list` reader pushes the same row filter for the mobile todos page); an unbound session gets a loud refusal — the table is per-user private data. `nb_create`/`nb_approve` keep their existing unconditional overwrite of requester/inspector/operator and the non-approver rejection.
3. **Display-layer residue.** Old durable logs keep their stamped first line (the log is never rewritten; `SESSION_FORMAT_VERSION` untouched). `fold.ts` strips a leading `【登录身份】` line from replayed user text, and `titleOf` in `sessionsService.ts` strips the same marker's sentence from pinned auto-titles — the wire `loginUser` field is deleted outright (pre-release stance: no compatibility shims), so the client sends nothing identity-shaped.

## Alternatives considered

- **Mount point for the identity text.** (A) a `{{actingUser}}` variable interpolated by each persona — rejected: strict interpolation fails loud on deployments that never registered the variable, and one persona file reused across deployments is fragile. (B, chosen) an order -90 section registered by the registry owner (apiproxy) — identity is infrastructure fact, not persona wording. (D) a pre-step durable context snapshot — still a message-channel injection, the same defect as the stamp. (G) keep stamping — the user-visible line the round was asked to remove.
- **Legacy stamped lines.** UI fold-strip (chosen) versus migrating the durable logs — a migration would touch `SESSION_FORMAT_VERSION` and rewrite logs, high cost for zero semantic gain; the fold satisfies "never user-visible" while `model-visible ⟺ logged` stays intact.
- **`nb_list` tightening scope.** Only `wfl_approval_todos` (the one unfiltered `wfl_` read surface and the user-named scenario) versus rolling the row filter across every per-user table — the narrow close keeps the error cost low; the sweep is next-round work.

## Consequences

- A user-visible "who I am" line in the chat is gone. The identity surface is now the login page and the profile tab only.
- Free-form identity narration in prompts: the persona now says user-typed identity claims are void. That is the point, but it means a legitimately confused user cannot "remind" the assistant who they are in words — they re-login instead.
- An account switch on a live session re-renders the section each step, which appends request/header change events on the switch — accepted and pinned by spec (the old stamped text never followed a switch at all).
- Negative guarantees, verified live: a hand-typed `【登录身份】…` message leaves the system section unchanged and the todos list still filters to the real token user; a buyer account never sees qc_inspector's todos. Evidence: `demos/acceptance-w9/w9-b2-03-forge-identity-neg.log`, `w9-b2-04-cross-user-todos-neg.log`.

## Related W9 decisions recorded here

- **Assist-input tags (B1):** prefab tags (welcome starters, quick commands, context chips, field-ask suggestions) fill the composer draft instead of sending; fenced actions (ask_choice options, approval/plan/report actions) still fire at once. The split is intent-shaped: editable draft vs deterministic action.
- **Visual language「酱园琥珀」(B3–B6):** the mobile design language is defined by `demos/acceptance-w9/design-language-w9.md` (token single source); B6 migrated its W7-era token consumers to the §3 base names — the core semantic names (primary/foreground/muted/border/fs-*) reached zero call sites, while a transitional alias tail survives (on-soft ×22, stroke-soft ×15, work-*/stamp-* etc., 73 css `var()` reads) for the next batch to migrate; the alias declarations stay in `tokens.css` as the compatibility layer.
