# @deepseek-ai/dsh-client-ui-business

English | [中文](README.zh.md)

The business-management surface plugin: the sidebar's first-class entry (ledger glyph + object-count badge) and the `business` conversation view tab — the collection switcher over the `nocobase.listMeta` roster (hidden collections filtered), the ask bar (a conversation handoff, not a query box), the conversation-first entity card stream (main label from title-ish fields, a three-pair scalar preview, per-record "ask" and "edit (in chat)" handoffs plus collection-level "new (in chat)"), the auxiliary table view (hasNext paging over `nocobase.list`), and the NocoBase external entry — a new-window link card (`target="_blank" rel="noopener noreferrer"`) pointing at the webserver's opt-in `/nocobase` proxy, the low-frequency admin aid. No forms anywhere: every write routes through the conversation, where the nb_* tools carry the in-conversation preview → go-ahead → receipt flow. A deployment that has not opted into `nocobaseEnabled` shows the structured refusal inline.

## Model Experience

None, as a browser-side UI plugin layer the surfaces render gateway data and register nothing model-facing.

#### KV Cache effect

None: the surfaces render in the browser and never contribute to a model request; record changes hand off through the composer draft.

## Known Limitations and Deferred Work

- The card stream and table read the first pages only (20 rows per page, hasNext "load more"); column filters and sort controls arrive with the table's column-header interaction.
- The external entry opens the backend through the `/nocobase` proxy in a new window — no credential exchange; the backend keeps its own login. The same-origin proxy keeps the DSH-domain login cookie working in the opened window. A token-exchange embed (plugin-embed pages with a signed link) returns when a deployment publishes embed pages.
- Row-level change feeds arrive with the NocoBase workflow event channel; until then an edited record refreshes on the next page load, not live.
