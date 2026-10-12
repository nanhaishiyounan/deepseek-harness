# @deepseek-ai/dsh-client-ui-governance

English | [中文](README.zh.md)

The governance panel surface: a sidebar nav row (order 12.6) plus the `governance` conversation view with four tabs — the cross-source catalog with search, the lineage edge list, the quality rules with run-evaluation, and the alert events with the webhook test. Reads ride the gateway's governance domain over `ctx.governance`; a deployment without the governance engine shows the structured refusal inline. The node half is an empty `apply` that exists so the Loader sees the plugin; the browser half ships via the `./client` export through the package.json `dsh.client` declaration.

## Model Experience

None, as a browser-side UI plugin layer the panel renders gateway governance reads and registers nothing model-facing.

#### KV Cache effect

None: the panel renders in the browser and never contributes to a model request; governance findings reach a session through the gateway domain, not through this surface.

## Known Limitations and Deferred Work

- Lineage renders as an edge list; graph-style lineage visualization (the ui-kg canvas treatment) arrives with cross-source lineage growth.
- Rule evaluation runs on demand from the panel; no scheduled evaluation surface exists yet, so alerts appear only after a manual run or an explicit record.
- The catalog tab's search is a case-insensitive substring over qualified names; faceted filtering by source or kind arrives with the inventory column registry.
