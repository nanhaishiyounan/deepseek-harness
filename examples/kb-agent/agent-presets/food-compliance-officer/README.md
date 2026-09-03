# AI Food-Safety Compliance Officer (food-compliance-officer)

English | [中文](README.zh.md)

A food-safety compliance Q&A preset: answers from the knowledge base's GB 2760 / GB 14881 and other regulation standards, with numbered citations (document name + heading path) and a review-checkpoint list.

- `preset.yml` — the preset name and description (the roster discovery entry).
- `agent.cordis.yml` — the agent-plane composition: a persona plus the retrieval-only kb tool rows (kb_search/kb_ingest/kb_ingest_url/kb_stats/kb_graph_*). No shell/editor/web or other destructive tools.
- The tenant stays a deployment binding: this preset's `tool-kb` row and the host composition's `tool-kb`/api-gateway rows read the same `DSH_KB_TENANT` (default `demo-food-co`), and the kb capability seam stays host-plane.

Corpus sources: `workspace/data/regulations/` (regulation excerpts) and `workspace/data/food-safety/`. A web-workbench role only — the one-shot headless CLI never mounts a preset. The example composition mounts this directory as a trusted preset root, so the role is on the roster from any `DSH_HOME` with no copy step; the portal's same-named scenario card (`food-compliance`) is its one-click entry, and only locally authored presets go through the writable `$DSH_HOME/.agent-presets` root. See the 换角色 section of [`QUICKSTART.zh.md`](../../QUICKSTART.zh.md).
