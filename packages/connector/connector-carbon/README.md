# dsh-connector-carbon

[English](README.md) | 中文

Carbon connector capability (`ctx.carbon`): the HTTP provider over the carbon community Data API (session cookie + PostgREST/kong), with credentials resolved from `CARBON_URL`/`CARBON_ANON_KEY`/`CARBON_EMAIL`/`CARBON_PASSWORD`.

## Model Experience

Indirectly, through the carbon tool suite's own registrations: this provider only carries the HTTP capability; every prompt, schema, and tool surface lives in dsh-tool-carbon.

#### KV Cache effect

Independent of the model request stream: connector results produce tool results consumed by a later request, so this package neither appends to nor invalidates any reusable request prefix.

## Known Limitations and Deferred Work

- Deferred: write-tier expansion beyond the B3-enabled tables rides later batches; the community Data API surface stays read-mostly.
