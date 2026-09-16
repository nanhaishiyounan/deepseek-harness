# Agent Note: Composer mode selector — a persistent agent-preset picker above the textarea

Status: implemented

English | [中文](2026-09-16-j1-composer-mode-selector.zh.md)

## Problem

The agent-preset choice surface existed only as the hero chip, which renders while no conversation has started (blank session, chat view). In the workbench's steady state — a running session or a business tab — no preset control existed anywhere on the page, and the scenario cards failed outright (`agent-preset-locked`) against a started session. Users reported "the mode cannot be selected" not because the roster was empty but because the selection window had closed.

## Decision

A new list slot `conversation.input.mode` (scope `session-maybe`, marker-only owner `InputModeOwnerProps`) renders into the composer bar's existing `accessory` hole; `ConversationRoot` projects it unconditionally and `ui-agent-preset` registers the selector. The selector's posture follows the seat store's new `session` projection (kept current by `syncSession` on every session-list change):

- **No session or a blank session** — a pick is `select()`: staged, then applied to the session the flow hands over to (the hero chip's own semantics).
- **A started session** — the host's `agent-preset-locked` stands (a session's recorded tool calls cannot be re-composed under a different preset); a different pick runs `startSessionOn` — stage without applying, then `workspaces.startSession()` (the creator-draft path). Re-picking the running composition is a no-op.

Two mechanical facts diverged from the plan and were resolved mechanically:

- The plan said "pass `undefined` for the accessory when the list is empty", but `renderSlot` returns an empty fragment (not `undefined`) for an empty list, which would keep the wrapper's padding. The empty seat collapses via `.accessory:empty { display: none }` in `InputBar.module.css` — the bar's TypeScript is untouched.
- The plan drafted the slot as scope `session`, but the three-state contract (no session renders too) requires `session-maybe`.

The "stage then start a session" sequence has one home: the optional `ctx.agentPresetMode` service (`mode-bridge.ts`, the `chatFileMentions` optional-service convention), provided while the conversation flow is mounted. The scenario portal's `selectScenario` degrades precisely on the `agent-preset-locked` error code to `startSessionOn(scenarioId)` — the red "场景切换失败" path becomes a new session on the scenario; every other failure still throws.

## Consequences

The hero chip keeps its narrow window (blank + chat); the selector is the always-mounted seat and both read one store, so the two entries cannot disagree. Compositions without `ui-agent-preset` see no row at all (the empty accessory collapses). The e2e lane's preset-name button selectors are now scoped to the hero row because the trigger names duplicate across the two surfaces.

## Alternatives considered

**Host-side hot-swap of a running session's preset** — rejected. The lock exists because a session's history was produced under its preset's tool set; the composition owns the recorded tool calls (documented in `packages/preset/agent-presets/README.md`).

**Detecting an empty list at the projection site to pass `undefined`** — rejected. The retained `renderSlot` authorization exposes no entries probe, and a CSS collapse achieves the same no-height empty state without widening the slot contract.

**A second roster/store for the selector** — rejected. The selector shares the hero chip's `AgentPresetSeatController` store and roster readers; one source of truth for staged picks, the applied composition, and now the current-session posture.
