# Agent Note: web New Session — preset reachability and surfacing action failures

Status: implemented

English | [中文](2026-09-01-web-new-session-preset-reachability.zh.md)

## Problem

Clicking New Session in the kb-agent web workbench did nothing visible. A live reproduction showed both halves of the failure: `session.create` returned `agent-preset-not-found` for `enterprise-data-assistant` (the roster held only the shipped presets), and the client's `WorkspaceRuntime.startSession` swallowed the rejection into `console.warn`, so the user saw no error at all. The same silent death hit the startup auto-selection.

## Decision

### The example's default preset must ride the composition, not a copy step

`examples/kb-agent/cordis.patch.yml` set `agent-presets.default: enterprise-data-assistant`, but that preset only existed after the QUICKSTART's manual copy into `$DSH_HOME/.agent-presets`. Launching `pnpm dsh web --patch examples/kb-agent/cordis.patch.yml` without the `DSH_HOME` pin (the task's documented command shape) left the roster without it, and every New Session press failed host-side. `apps/cli`'s `composeProfile` made this unfixable from a patch: it overwrote `roots` with only the shipped root, so a composition could never carry its own preset directory.

`composePresetRoots` now appends the shipped root after roots the composed config names explicitly (earlier-root-wins precedence), and the kb patch mounts `examples/kb-agent/agent-presets` as a `user`-trust root. The example presets are reachable from any `DSH_HOME` with no copy step; the writable `$DSH_HOME/.agent-presets` root keeps serving locally authored presets. Trust does not widen: a `--patch` overlay already inserts arbitrary plugins, so naming a preset directory adds no authority the patch did not have.

### New Session failures surface on the workspace list state

`WorkspaceListState` gained `lastActionError` (seq-keyed `{ seq, text }`); `startSession`'s rejection writes it (console diagnostics stay). The startup auto-selection keeps its console-only handling deliberately: it is an automatic retry policy, and re-raising a toast per retry would spam. `WorkspaceBrowser` — the data-reading region, since the sidebar shell's contract keeps it off global hooks — turns the cell into the shared transient `Toast` (`role="alert"`), keyed by seq so a repeated failure restarts the hold-and-fade cycle. This honors the `IWorkspaces.startSession` JSDoc's old "failures surface" promise, which no implementation had ever kept.

## Alternatives considered

- **Falling back to the `standard` preset when the default is missing** — violates fail-loud: a wrong-but-working agent composition is worse than a named error.
- **Rendering the toast inside `SidebarRoot`** — the shell's tests pin that it never reads global hooks (`neverHook` throws); the browsing region already reads `useWorkspaces`, so the toast lives there.
- **Clearing `lastActionError` on a later success** — the toast is transient by design and seq-keying already prevents stale re-presentation; a clear would add state churn for nothing observable.

## Consequences

- A deployment whose default preset no root supplies still fails loud host-side, but the user now sees `New session failed: … (agent-preset-not-found)` instead of a dead button.
- Compositions can ship preset directories beside their patch; the shipped root stays last so a deployment cannot shadow a shipped id by accident (explicit roots win duplicates on purpose).
- `WorkspaceListState` consumers (test fixtures across client packages) carry the new `lastActionError: null` cell.

## Verification

- Live browser (Playwright over `pnpm dsh web --patch examples/kb-agent/cordis.patch.yml`, no `DSH_HOME`): before — `session.create` → `agent-preset-not-found`, console-only; after — 200, blank session opens, console clean.
- `pnpm vitest run apps/web/tests/new-session-lifecycle.e2e.ts`: 5/5 — composer-grown turn, sidebar mint (host agent count as navigation barrier), switch-back history load, console tripwire, and the failure lane asserting the alert toast names `agent-preset-not-found` from both the adoption flow and the button.
- `pnpm vitest run packages/client/runtime/tests/workspaces-service.client.spec.ts packages/client/ui-workspace/tests/workspace-browser.client.spec.tsx`: 68 green, including the new action-error cell and toast cases; `apps/cli/tests/profile-boot.spec.ts` locks `composePresetRoots` ordering.
- `pnpm run typecheck` and `pnpm run build` green after the fixture sweep.
