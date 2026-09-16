# @deepseek-ai/dsh-tool-view-actions

English | [中文](README.zh.md)

Model-facing view tools over the view-actions seam: `switch_view` (tab navigation), `view_apply` (one whitelisted action inside a view, awaited to its summary), and `view_state_get` (the cached workbench state). Registration requires `ctx.viewActions` (the seam) and `ctx.viewState` (the cache) — mount `dsh-view-actions` and `dsh-view-context` alongside.

View manipulation is reversible UI state, so these tools carry no approval; destructive data writes stay on the `nb_*` in-conversation confirmation contract. `view_apply` fails loud with a readable message when the frontend is unreachable (timeout) or the action is not registered.

## Known Limitations and Deferred Work

- The known-action list in the tool description is prose, not a per-view JSON Schema; tightening it to a generated catalog is deferred.
- `view_state_get` reads only the active view's cache; a `view` parameter for background-tab reads is deferred with multi-tab context.
- Failed `view_apply` calls surface the executor's message verbatim; structured error taxonomy on the tool result is deferred.
