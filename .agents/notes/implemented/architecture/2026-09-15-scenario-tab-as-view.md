# Agent Note: Scenario portal as its own view tab

Status: implemented

English | [中文](2026-09-15-scenario-tab-as-view.zh.md)

## Problem

The 30-scenario hero portal (精选场景) rendered inside the conversation input dock — a slot that stays mounted across every business tab. Opening connectors, graph, business, or assets therefore re-showed the scenario portal each time, which was the user's loudest complaint ("不要每次点连接器、图谱什么的都展示！！！！").

## Decision

The hero moves from a dock seat to a first-class view. Tabs are a pure slot-name list with no router, so the change is one registration: ui-kb declares the `scenarios` view and stops registering `kb-portal` on `conversation.input.dock` (the seat declaration itself stays for the queue/todo/goal tenants). `KbHeroDock` becomes a view component: the render condition widens from blank-only to any scenarios-tab activation, the `workbenchMounted` yield is deleted, and `KbHeroHeadline` stays behind on chat. `scenarios.ts` is untouched, so the catalog-sync gate sees no change.

## Consequences

The scenario portal renders exactly once per navigation into its own tab and nowhere else; the input dock keeps its remaining tenants unchanged. Blank chat sessions keep the headline and example questions. The scenarios catalog and its sync gate are untouched, so future scenario edits carry no tab-side coupling.
## Alternatives considered

**Keeping the dock seat and hiding per-tab.** Every tab would need to know about the scenario portal; the leak class returned with the next tab added. The view seat makes the hiding structural.

**A route for the tab.** The tab strip is slot-name driven on purpose; a route would fork navigation state for one pane.

**Moving the portal into the KB workbench.** The workbench already yields for its own views; nesting a second yield chain there re-created the same conditional leak one level down.
