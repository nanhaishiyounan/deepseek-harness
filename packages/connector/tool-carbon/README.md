# dsh-tool-carbon

[English](README.md) | 中文

Model-facing carbon tool suite (`cb_collections`/`cb_list`/`cb_get` reads, `cb_create`/`cb_update` confirmed writes with risk labels from the carbon manifest) over the `ctx.carbon` connector capability.

## Model Experience

Indirectly, through the cb_* tool registrations: carbon rows reach the model only as tool results with their session-logged envelopes; this package owns the schemas, prompt guidance, and risk labels.

#### KV Cache effect

Independent of the model request stream: cb_* results are tool results consumed by a later request, so this package neither appends to nor invalidates any reusable request prefix.


## Known Limitations and Deferred Work

- Deferred: additional cb_* tools beyond the B3 set ride later batches alongside write-tier expansion.
