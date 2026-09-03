# @deepseek-ai/dsh-kb-graph

English | [中文](README.zh.md)

The knowledge-graph capability seam (`ctx.kbGraph`): a store provider registry and the query orchestration over food-industry entity-relation triples. A sibling of the document seam (`ctx.kb`) — triples and retrieval hits have different contracts, so each owns its seam; both share the tenant isolation model.

The ontology is closed on both ends: entity types (`company`, `product`, `ingredient`, `additive`, `standard`, `process`, `risk`) and predicates (`produces`, `uses`, `contains`, `complies_with`, `follows`, `flags`, `supplies`) are closed unions; consumers `switch` ending in `assertNever`.

## Model Experience

Indirectly, through the kb tool suite: this seam registers no prompt, schema, or tool of its own; the consumer package owns every model-facing projection of graph queries and writes.

#### KV Cache effect

Independent of the model request stream: graph queries produce tool results consumed by a later request, so this package neither appends to nor invalidates any reusable request prefix.

## Known Limitations and Deferred Work

- Store selection is auto only: exactly one usable provider wins; multiple usable providers throw `KB_GRAPH_STORE_AMBIGUOUS` (configure by composing one).
- Two-hop is the deepest path query; longer paths need a future `paths(depth)` extension with a cost bound.
- No graph-specific usage counters yet; the kb document seam's counters do not cover triples.
