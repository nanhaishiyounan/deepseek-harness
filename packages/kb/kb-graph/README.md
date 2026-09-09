# @deepseek-ai/dsh-kb-graph

English | [中文](README.zh.md)

The knowledge-graph capability seam (`ctx.kbGraph`): a store provider registry, the runtime ontology registry, and the query orchestration over entity-relation triples. A sibling of the document seam (`ctx.kb`) — triples and retrieval hits have different contracts, so each owns its seam; both share the tenant isolation model.

The ontology is a three-layer, runtime registry: five schema.org-style top anchors (Object/Process/Event/Role/Concept), business-domain modules (Customer, Supplier, Product, Order, …), and the food-compliance 7×7 as the `builtin-food` seed. Node types and predicates are branded open-set ids (`KgNodeTypeId`/`KgRelationId`); plugins extend the ontology with `registerNodeType`/`registerRelation` (ctx.effect-backed disposers, duplicate ids refuse), and closed-set validation lives at the registry boundary — writes with unregistered types or predicates fail loud with machine-routable codes (`KB_GRAPH_UNKNOWN_ENTITY_TYPE`, `KB_GRAPH_UNKNOWN_PREDICATE`). `validateEdge` checks direction constraints (SHACL-style shapes over the registry snapshot).

The runtime also forwards the property-graph v2 face — merge upserts, k-hop `subgraph`/`expand` reads, tombstoning, aliases, source-run watermarks, registry persistence (`persistNodeType`/`persistRelation` over the two-layer registry), and `searchNodes` (the name→id resolution primitive behind seed lookup and entity alignment).

## Model Experience

Indirectly, through the kb tool suite: this seam registers no prompt, schema, or tool of its own; the consumer package owns every model-facing projection of graph queries and writes, materializing the registry's active entries into its tool descriptions at registration.

#### KV Cache effect

Independent of the model request stream: graph queries produce tool results consumed by a later request, so this package neither appends to nor invalidates any reusable request prefix.

## Known Limitations and Deferred Work

- Store selection is auto only: exactly one usable provider wins; multiple usable providers throw `KB_GRAPH_STORE_AMBIGUOUS` (configure by composing one).
- Two-hop is the deepest path query on the v1 face; the v2 `KgStore.subgraph` walks k-hop neighborhoods but is not yet forwarded through the runtime (consumers take the store directly until the kg-build batch).
- The registry is per-context in memory plus the sqlite seed rows; cross-process registration sync arrives with the kg-build pipeline (registry upserts).
