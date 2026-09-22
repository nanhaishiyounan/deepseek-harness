# Agent Note: M1 — DSH Web ask-the-data UX redesign

Status: implemented

English | [中文](2026-09-17-m1-web-ux-redesign.zh.md)

## Problem

The kb-agent web workbench worked but read as a tool panel: answers had no visible provenance, numeric results rendered as markdown tables with zero charts, the blank-session portal was thirty unranked scenario cards, the business page flattened ninety-five NocoBase collections into one `<select>` and jumped to the chat tab on every question, and the graph page never said how fresh its data was. The [M1 plan](../../../../plans/2026-09-17-kg-mobile-ux/01-m1-dsh-web-ux-redesign.md) set five surfaces against the [18 UX pain points](../../../../research/2026-09-17-mobile-prototype-analysis.md).

## Decision

- **Source trail extracts from the frozen turn slice, not from new wire metadata.** `SourceTrail` under the closing turn-tail aggregates kb citations (`[n] …` lines), lakehouse tables (the `Data source:` line), NocoBase collections (call args), and kg provenance (`sources:` YAML line) purely from the already-logged tool results — no session-event additions, satisfying "model-visible ⟺ logged" with zero host changes. A newer host that rewords a result line drops that source chip instead of breaking the card.
- **Charts are self-drawn SVG, and they live in ui-tool.** The plan placed charts under ui-conversation, but ui-conversation cannot depend on ui-tool (the dependency runs the other way), so `LakehouseToolRow` and its number cards / line / bar / table toggle / CSV export / SQL disclosure live in ui-tool where the keyed toolview rows already are. No chart library; `chartPlanOf` picks a temporal line when the first column reads as a period, otherwise horizontal bars.
- **Overview KPIs are deployment config, not code.** A new `lakehouse.overview` gateway RPC reads a JSON seed of `{id, label, sql}` definitions and evaluates each against the lakehouse seam; one broken KPI degrades to its error text, never blanking the band. The same rpc-map + fetch handler + IApiClient + fixture surface pattern as `assets.stats` carries the wiring. The kb-agent overlay pins its seed at `examples/kb-agent/workspace/data/overview/kpis.json`.
- **Inline edit takes the gateway fast path; high-risk changes stay conversational.** `nocobase.update` is a new write RPC gated behind `nocobaseWriteEnabled` (absent = refused, the `ordersEnabled` stance). Only whitelist fields (备注/数量/日期 semantics, `isInlineEditable`) offer inline edit; every other change keeps the nb_update preview→confirm→receipt flow. "No forms" narrows to "high-risk goes through the conversation".
- **Asking from the business page never jumps.** `askInPlace` fills the conversation draft and shows an inline hop link; the view switch became the user's click. The grouped navigator (domain buckets + live search + frecency 常用 rail in localStorage) replaces the flat `<select>`, and supplier-like collections render a 360 zone (cert/audit chips with expiry warnings) while order-like collections render status badges.
- **KG freshness and trace phrases.** The graph page shows `数据截至 {last_run_at}` from the already-served `kg.stats` extension (no new read), and `kg-nl` grows five trace templates (`X的原料来自哪些供应商`, `X批次流向哪些客户`, `X的供应商`, `X的客户`, `X由哪些原料制成`) with the offline fallback table in ui-kg mirroring them 3→8.

## Alternatives considered

- **The assembled mixed-source fixture turn.** The session projection renders one root tool call per turn, so a four-tool-in-one-turn fixture render did not materialize; the assembled snapshot pins single-call turns (kb trail + lakehouse chart) while the four-surface aggregation is pinned by the ui-conversation unit suite over the same wire shapes. A future fixture that wants a genuine multi-call turn needs the projection to render sibling calls first.
- **Cross-package kg deep link.** The kg chip's evidence jump switches the view ring to `kg`, but seed-positioning (walking the chip's entity in the graph) needs a ui-kg-owned bridge that ui-conversation cannot reach; deferred with M2's path-highlighting work.
- **A dedicated doc page.** `docs/subsystems/web.zh.md` is the web-fetch capability, not the workbench; this note plus the JSDoc contracts carry the decisions.

## Consequences

Unit suites per touched package (source-trail, lakehouse row, scenario overview + pinning, biz navigator, kg phrase), four new assembled keyless snapshots (`source-trail`, `lakehouse-row`, `overview-home`, `biz-navigator`) over the fixture transport, `doc-sync` 28 gates, oxlint clean on the touched trees, and the real-server/real-API pass in the batch report.
