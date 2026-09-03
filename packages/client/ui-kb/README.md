# @deepseek-ai/dsh-client-ui-kb

English | [中文](README.zh.md)

The knowledge-base workbench surface plugin: the sidebar's first-class entry (document icon + document-count badge), the blank-session portal (product headline through the additive `conversation.hero.headline` seat, usage chips, sample questions, the scenario rail, and the recent-search rail over `conversation.input.dock`), the `kb` conversation view tab (cited retrieval with highlight and carry-to-chat, the ingest wizard over web links and browsed workspace folders, the session-local document list, and the usage card), the session-header switch button, the `kb_*` toolview rows (numbered source cards for `kb_search`, receipts for the ingest pair, and the usage counters for `kb_stats`, registered under `tool.call.toolview`), and the knowledge-base settings section (the usage card again, under `settings.section`). All data rides the connection's `api.kb` face (plus `agentPresets` for the portal scenarios and `host.listDirectory` for the wizard); a deployment without the kb capability shows the structured refusal inline.

## Model Experience

None, as a browser-side UI plugin layer the surfaces render gateway data and register nothing model-facing.

#### KV Cache effect

None: the surfaces render in the browser and never contribute to a model request; workbench searches reuse the gateway's kb.search face.

## Known Limitations and Deferred Work

- The scenario catalog (`src/client/hero/scenarios.ts`) is a static display table kept in sync by hand with `examples/kb-agent/scenarios/<id>/preset.yml`; the roster itself comes from `agentPresets.list`.
- `host.listDirectory` serves directories only, so the wizard's file tab browses folders visually while the file name stays typed; there is no upload API for local files.
- The document list is session-local state (ingest receipts plus search sightings); a refresh falls back to the stats totals, and there is no delete or re-ingest entry (no API).
- The subscription badge on the usage card is a static placeholder until a billing API exists.
- The `kb_*` toolview rows parse the tools' model-facing result text (the citation list, the ingest sentence, the coverage sentence); a host that rewords those texts falls back to rendering them raw.
