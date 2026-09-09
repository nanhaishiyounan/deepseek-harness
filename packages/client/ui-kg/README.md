# @deepseek-ai/dsh-client-ui-kg

English | [中文](README.zh.md)

The knowledge-graph-page surface plugin: the sidebar's first-class entry (graph glyph + type-count badge) and the `kg` conversation view tab — the phrase box (natural-language wrappers over subgraph walks: supply-chain / orders / containment templates, any other text walks as a raw seed), the entity seed search with alias resolution, the sigma.js v3 canvas (graphology + force-atlas2 statically inlined in the single client.js artifact — the browser module table serves no relative-path chunks; double-click expands a node's one-hop neighborhood, click selects it), the ontology type legend with per-type canvas filtering (colors ride the ui-theme `--dsw-graph-node-*` ladder, hash-assigned per type id), and the node details panel (type, degree, business key) with the "ask about this" conversation handoff. All data rides the connection's `api.kg` face; a deployment that has not opted into `kgEnabled` shows the structured refusal inline, and hosts without WebGL degrade to the relation-list view with the same click/double-click semantics. The page is read-only: graph writes belong to the kg-build pipeline.

## Model Experience

None, as a browser-side UI plugin layer the surfaces render gateway data and register nothing model-facing.

#### KV Cache effect

None: the surfaces render in the browser and never contribute to a model request; the entity question hands off through the composer draft.

## Known Limitations and Deferred Work

- Path highlighting between two selected nodes (graphology shortest path with non-neighbor dimming) arrives with the two-node selection interaction.
- Layout runs one synchronous FA2 pass per walk; continuous simulation with drag pins returns when walks regularly exceed the ~500-node window.
- The canvas re-renders on each walk (existing node positions are not preserved across a fresh subgraph); incremental position keeping arrives with the persisted-layout store.
