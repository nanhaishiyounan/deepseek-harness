# @deepseek-ai/dsh-governance

English | [中文](README.zh.md)

Service Definition for the governance capability seam: the shared types plus the `ctx.governance` declaration covering the cross-source inventory (the five W24 sources through their live surfaces), lineage edges, lakehouse-evaluated quality rules, and alert events. The seam package owns the contract only — `apply` is intentionally empty, and mounting it alone leaves `ctx.governance` unset. The engine provider (`@deepseek-ai/dsh-governance-engine`) registers the service; the consumers are the gateway's governance domain and the governance panel (`@deepseek-ai/dsh-client-ui-governance`).

## Model Experience

Indirectly, through the gateway's governance reads; the seam registers no prompt, schema, or tool of its own.

#### KV Cache effect

None: the seam contributes no request content, so it neither appends to nor invalidates any reusable request prefix; governance rows reach a session only when it asks through the gateway domain.

## Known Limitations and Deferred Work

- The seam's `apply` is a no-op by design: a composition that mounts the seam without the engine provider fails on the first `ctx.governance` call instead of degrading silently.
- `inventory()` is a live-surface snapshot ("every asset the sources expose right now"); persisted inventory snapshots with history arrive with the cross-source audit log.
