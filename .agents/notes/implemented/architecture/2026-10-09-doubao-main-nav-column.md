# Agent Note: Doubao-style main nav inside the single sidebar

Status: implemented

English | [中文](2026-10-09-doubao-main-nav-column.zh.md)

## Problem

The desktop shell exposed every function surface as a `conversation.view` tab: with the workbench pages deployed, the session header carried nine tabs (chat, kb, scenarios, market, connectors, kg, business, trajectory, mobile-preview), and the sidebar foot duplicated five of them as icon entries. The product form W24 targets is the Doubao web shape — **one** sidebar that carries both the function menu and the session browser, with the session header keeping only 会话/轨迹. Two mechanics were missing: a plugin-composed menu block that lives inside the sidebar, and a way for a page to stay reachable as a view (its component, per-session state, deep links, and view-context projections all ride the view ring) while its tab disappears from the header.

## Decision

The sidebar grows a `sidebar.nav.host` seat (single, root scope, `{ wide }` owner share) rendered between the New Session button and the session browser, with a hairline separating the menu from the sessions; the sidebar keeps its existing three-track frame geometry (`sidebar | center | details`, 264–420 px drag, 56 px rail) and its own collapse toggle — there is no second left column. `packages/client/ui-nav` occupies the host seat with a chrome-only menu block (`NavRoot`: row spacing plus a 40 vh scroll clamp) and declares the `sidebar.nav` list seat every function page contributes its row into — the chat row ships with ui-nav; kb (10), scenarios (10.5), market (11), connectors (12), kg (13), business (14), mobile-preview (16), and cordis-panel (17) keep their legacy orders for mental continuity. The seat's slot-level inject hands every row `useNavState` (view-context's active screen + switchability, exposed as the new observable `ViewContextService.navState`) and `activate(view)` — switch through the mounted header rider, or open the reusable blank session and retry bounded (~3 s) when no switch is published; rows never wire their own view bridge. On the sidebar rail the rows render as 36 px icon squares with tooltips, riding the column's own collapse animation.

Ring withdrawal is a slot-registry option: list entries may register `hidden: true`. `viewTabs()` projects the flag, and `ConversationSessionHeader` filters it for both the tab ring and the ring-count visibility decisions, while `resolveActiveView` keeps hidden entries resolvable so a nav click that selects a hidden view still renders it. The retired `sidebar.footer.action` slot is deleted outright (declaration, contract type, render site); its five registrants moved to `sidebar.nav`, and `ui-cordis` moved with them. Removing a function plugin removes only its row — verified live by disabling ui-business and rebooting.

The account/login position (bottom-left in the Doubao form) is the sidebar's existing settings seat; the desktop shell has no sign-in surface today (anonymous identity), and the real login lands with the B7 carbon identity swap.

## Alternatives considered

- A fourth dedicated nav column beside the sidebar: built first, then withdrawn on product review — the Doubao form keeps one sidebar with sessions and functions together; a second left column read as two competing rails and re-solved nothing else.
- Withdrawing the seven `conversation.view` registrations entirely and mounting pages in a new center-area slot: rejected — it strands per-session view state, the kg-seed deep link, view-context projections, and every e2e that drives `setView`, for zero behavioral gain.
- Filtering the ring by a ui-nav-owned id set inside ui-conversation: rejected — it couples the conversation package to a sibling plugin and hides the mechanism from any other composition; the `hidden` option keeps the registry the single source of list-entry display facts.

## Consequences

The frame stays a three-track grid; narrow viewports (< 1024 px) collapse the whole sidebar to its rail (menu rows become icons with the sessions). The menu block clamps at 40 vh so a growing function set scrolls inside the block instead of starving the session browser. `activate` is best-effort: with no workspace at all the row click lands on the chat hero (parity with the retired footer entries). Nav rows own their icon/label/badge and carry a copy of the canonical nav-item CSS (36 px rows, soft active fill plus a brand accent bar, rail squares with tooltips) — visual consistency is by convention, like the retired footer entries. Because `hidden` rides `StoredEntry.options` in ui-slots, a stale `lib/` build of that static package silently drops the flag (observed during B1 bring-up): after touching a shell-static package, rerun the full build before probing a live server.

Cross-links: [slot declaration injection](2026-08-05-slot-declaration-injection.md) owns the dormant-until-declared semantics the nav rows rely on; the [slot type chain](2026-07-22-slot-type-chain-implementation.md) note owns the composition model the `hidden` option extends.
