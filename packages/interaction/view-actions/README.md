# @deepseek-ai/dsh-view-actions

English | [中文](README.zh.md)

Abstract view-actions seam (`ctx.viewActions`): an agent tool call can adjust the browser workbench view — filters, focus, in-view queries, tab switches — and await the executor's readable summary. The Service Definition keeps the single-provider slot and the caller-liveness boundary; the gateway registers the provider that rides the `view-action/requested` wire channel (the question channel's isomorphic sibling), and the model-facing tools live in `@deepseek-ai/dsh-tool-view-actions`.

## Ownership boundary

`apply()` enforces the same runtime-ownership boundary as user-questions: a supplied agent must be the registry's exact live instance and must not be owned by another live agent. An owned child has no browser to serve it and would block until the provider timeout; a lineage-bearing session resumed as a new runtime root applies normally.

## Model Experience

Indirectly, through the view tools: this seam registers no prompt, schema, or tool of its own; `dsh-tool-view-actions` owns every model-facing projection, and executor summaries return to the model as that tool's results.

#### KV Cache effect

Independent of the model request stream: applies produce tool results consumed by a later request, so this package neither appends to nor invalidates any reusable request prefix.

## Known Limitations and Deferred Work

- The seam carries one action per call; composing several actions into one transactional apply is deferred (the model composes by sequencing calls).
- The provider is process-single: a second registration fails loud rather than load-balancing browsers.
- The `apply_view_patch` document-patch tool (RFC 6902 subset over a tab ViewModel) is deferred to a later round.
