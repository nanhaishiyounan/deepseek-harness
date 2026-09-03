# Agent Note: Portal IA for the kb-agent web workbench

Status: implemented

English | [中文](2026-09-01-kb-workbench-portal-ia.zh.md)

## Problem

The first kb workbench shipped as a fixed 360px panel that a sidebar footer action toggled over the conversation. It held three disconnected capabilities — usage stats, citation search, and ingest — but search there could not feed the conversation, and the conversation's `kb_search` results rendered as raw tool text with no numbered-source card. The blank-session first screen still showed the generic harness hero ("探索未至之境"), which is ui-conversation locale copy with no deployment override path, and the eleven scenarios under `examples/kb-agent/scenarios` were invisible to the web UI because the preset roster did not include that directory. The product walkthrough ([plans/kb-workbench-redesign/01-product.md](../../../../plans/kb-workbench-redesign/01-product.md)) named retrieval as the center of gravity and asked for one line from ingest to cited answer.

## Decision

### The KB overview is the blank-session hero portal, not a pane or a redirect

The portal (headline, usage chips, sample questions, scenario rail) registers into `conversation.input.dock`, the one additive slot that renders in the hero phase above the composer, and gates itself on the blank-session state the owner passes. Two structural facts forced this landing:

- The layout root exposes exactly `sidebar` / `conversation` / `details` / `shell.overlay`; there is no third main pane, and `shell.overlay` is a click-through floating layer that cannot host a primary workspace.
- A blank session is both the first-open state and the state every "new session" click returns to, so the portal gets maximum exposure without any redirect. A redirect would also fight the blank-session semantics: the view ring and header are not rendered there at all.

The headline swap is a new single-seat `conversation.hero.headline` slot declared by ui-conversation with the original copy as fallback. The locale namespace is single-occupancy (duplicate registration throws), so deployment-level copy override was not a path; an additive slot keeps unregistered deployments pixel-identical.

### The fixed panel is gone; the three capabilities live in an in-session view tab

`conversation.view` gained a `kb` tab (the same mechanism ui-trajectory uses), holding the search zone (large search box, numbered result cards with business-language source lines, hit highlighting, and a carry-to-chat action), the document zone (ingest wizard plus session ingest records), and the usage card. The sidebar entry became a first-class KB icon with a document-count badge, and a `kb` settings section shows usage detail. The carry-to-chat action is the point of the reorganization: it writes the hit's document into the composer draft and switches back to the chat tab, so panel retrieval and conversation questioning are one flow instead of two. Cross-package tab switching rides one additive owner prop — ui-conversation passes an optional `setView` to `conversation.session.header.actions` — with a no-`setView` degradation where the KB header button simply stays hidden.

### Scenario cards reuse the agent-preset roster plus a static in-package catalog

`cordis.patch.yml` adds `examples/kb-agent/scenarios` as an agent-presets root; scenario directories are preset-shaped (`preset.yml` + `agent.cordis.yml`), so `agentPresets.list`/`select` serve them with zero new API. But the roster rows carry only name/description/order, while the portal rail groups by eight categories and offers a probe question per scenario — so display metadata comes from a static catalog constant in ui-kb ([scenarios.ts](../../../../packages/client/ui-kb/src/client/hero/scenarios.ts)): selection semantics always go through the roster, the constant drives grouping and display only.

### The ingest wizard's file tab rides `host.listDirectory` and degrades under the default picker

`host.listDirectory` serves directories only, so the wizard's server-file tab is browse-to-directory plus type-the-file-name. It also requires the browse capability: the default `-auto` directory picker resolves to the native capability on a desktop, and the wizard then shows its "暂无法浏览服务器文件" guidance instead of a browser. That is the accepted posture for this example — the URL tab and the agent's `kb_ingest` tool keep working, and the guidance names who places files.

## Alternatives considered

- **A dedicated KB pane or a `shell.overlay` workspace** — the four-slot layout topology has no third main pane, and the overlay layer is click-through by contract; either would require changing the shell, which the redesign's constraints forbid.
- **Redirecting the blank session to a KB route** — breaks the new-session default state, and the view ring and header do not render on a blank session, so the redirect target itself would need a new surface.
- **Deployment-level locale override for the hero headline** — the locale namespace is single-occupancy and duplicate registration throws; only an additive slot declaration can swap the copy without touching ui-conversation's own behavior.
- **Keeping the fixed panel and adding a carry button inside it** — the panel and the conversation were mutually exclusive surfaces; the carry would still cross a modal boundary and the panel itself overflowed 375px viewports.
- **Extending `agentPresets.list` to return category/probe (single source)** — an API-face change across the gateway schema, the preset loader, and every consumer, deferred until a second deployment wants the same metadata; the dual source covers this example now.
- **`host.pickDirectory` for the ingest wizard** — also capability-gated, and it selects directories only, which does not name a file; browsing plus a filename field is the honest shape of the API that exists.

## Consequences

- ui-conversation gains two additive extensions with fallbacks: the `conversation.hero.headline` slot declaration and the optional `setView` owner prop on `conversation.session.header.actions`; unregistered compositions render exactly as before.
- Panel retrieval and conversation questioning are one flow: the workbench result card carries its source into the composer draft and lands the chat tab active, pinned by the web e2e lane.
- The static scenario catalog and `examples/kb-agent/scenarios/` are two sources of one truth, synchronized by hand (name/description/probe mirror `preset.yml`; category and the English mirror exist only in the constant). Adding a scenario touches both; nothing mechanically fails on drift, which is the known gap — the long-term fix is returning display metadata from the roster itself.
- On default desktop deployments the wizard's server-file tab shows degraded guidance; browsing requires a composition that mounts the browse picker. Evidence shots live in `screenshots/kb-redesign/` (including the degraded tab).
- The hero, workbench, and settings section share one stats cache and one `kb` locale namespace (68 zh keys plus 7 workbench additions, with the English mirror).

## Verification

- [kb-workbench.e2e.ts](../../../../apps/web/tests/kb-workbench.e2e.ts) drives the real composition in Chinese: the portal hero (headline, usage chips, sample-question fill, scenario rail), the seeded `kb_search` toolview row with numbered sources, the workbench search-and-carry flow, the ingest wizard's browsed-file path, and the sidebar badge count.
- The ui-kb package specs cover the hero dock's chip matrix (loading/error/empty/ready), the workbench's state matrix (idle/busy/results/empty/failure), the toolrow citation parsing, and the settings section.
- Real-composition evidence was captured 2026-09-01 over `pnpm dsh web --patch examples/kb-agent/cordis.patch.yml` (Node 22.19.0): ten screenshots in `screenshots/kb-redesign/` covering light and dark heroes, workbench search in both themes, the ingest wizard (URL tab plus the degraded file tab), the sidebar badge, a live `kb_search` toolview with a real MiniMax-M3 turn, a no-hit query's low-relevance results, and the 375px hero (measured: no horizontal overflow).
