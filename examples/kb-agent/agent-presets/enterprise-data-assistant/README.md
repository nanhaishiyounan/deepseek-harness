# Enterprise Data Assistant (enterprise-data-assistant)

English | [中文](README.zh.md)

An internal-data Q&A and statistics-advice preset: covers market insight, process, food safety, cost estimation, and supply-chain needs, cites enterprise profiles and interview notes with numbered citations, and outputs structured recommendations.

- `preset.yml` — the preset name and description (the roster discovery entry).
- `agent.cordis.yml` — the agent-plane composition: a persona plus the retrieval-only kb tool rows (kb_search/kb_ingest/kb_ingest_url/kb_stats/kb_graph_*). No shell/editor/web or other destructive tools.
- The tenant stays a deployment binding: this preset's `tool-kb` row and the host composition's `tool-kb`/api-gateway rows read the same `DSH_KB_TENANT` (default `demo-food-co`), and the kb capability seam stays host-plane.

Corpus sources: `workspace/data/` (enterprise profiles, interview notes, market/process/supply/cost corpora). A web-workbench role only — the one-shot headless CLI never mounts a preset. The example composition mounts this directory as a trusted preset root, so the role is on the roster from any `DSH_HOME` with no copy step; the portal's same-named scenario card (`enterprise-data`) is its one-click entry, and only locally authored presets go through the writable `$DSH_HOME/.agent-presets` root. See the 换角色 section of [`QUICKSTART.zh.md`](../../QUICKSTART.zh.md).
