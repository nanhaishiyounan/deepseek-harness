# @deepseek-ai/dsh-client-ui-connectors

English | [中文](README.zh.md)

The connector-page surface plugin: the sidebar's first-class entry (link icon + provider-count badge) and the `connectors` conversation view tab — the provider catalog with live availability (healthy dot vs the credentials-missing state and its inline explanation), the per-provider delivery aggregates (transfer count, row count, latest landing), the delivery run timeline (newest first, destination labels), and the AI-assisted connect guidance: a conversation handoff that prefills the composer and switches to the chat tab (no form — the assistant recommends the source, fills parameters, and tests the connection). All data rides the connection's `api.connectors` face; a deployment that has not opted into `connectorsEnabled` shows the structured refusal inline, and a deployment without the lakehouse seam reads the delivery surfaces as empty (the documented catalog-only degradation).

## Model Experience

None, as a browser-side UI plugin layer the surfaces render gateway data and register nothing model-facing.

#### KV Cache effect

None: the surfaces render in the browser and never contribute to a model request; the connect guidance hands off through the composer draft.

## Known Limitations and Deferred Work

- The connection state is derived from the delivery trail (latest landing per provider); Airbyte-style six-state health with stream-level breakdown arrives when a scheduler owns recurring syncs.
- The run timeline caps at the gateway's newest-50 window; historical paging and failure drill-down arrive with the run-history API.
- The wizard is the conversation handoff only; an in-page three-tab ingest dialog (the KbIngestDialog pattern) returns when a connector can accept credentials through the gateway.
