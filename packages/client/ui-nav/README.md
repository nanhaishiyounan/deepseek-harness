# @deepseek-ai/dsh-client-ui-nav

English | [中文](README.zh.md)

Doubao-style main navigation column for the dsh web client. The plugin occupies the layout-owned `nav` column with a shell that declares the `sidebar.nav` menu seat; every function page (kb workbench, scenario portal, market, connectors, kg, business, mobile preview, …) contributes its own menu row into that seat, so the nav is fully plugin-composed — remove a page plugin and its row disappears with it.

## Composition

- `ctx.slots.inject('nav', …)` registers `NavRoot` (column chrome: the scrollable menu area and the foot collapse toggle) and declares the `sidebar.nav` list seat.
- The seat's common inject face hands every row:
  - `useNavState` — the view-context navigation state hook (resolved active screen + switch availability), for active-row highlighting;
  - `activate(view)` — the activation channel: switches the current session's view through the mounted header rider, or opens the reusable blank session and retries bounded when no session exists.
- The plugin registers the `chat` row itself (`ChatNavItem`, order 0). Function pages register rows with their legacy `conversation.view` orders (kb=10 … mobile-preview=16) to keep mental continuity.

## API

- `apply` / `inject` — cordis client plugin body (`slots`, `locale`, `layout`, `workspaces`, `viewContext`).
- Contract exports: `SidebarNavItemOwnerProps` (`{ wide }`), `SidebarNavSlotInject` (the seat's common inject face), `NavRootComponentProps`, `ChatNavItemProps`.

## Events

None. The plugin is presentation-only; view switching rides the view-context service and panel geometry rides the layout service. Nothing here is model-visible, so no session events are involved.

## Extension points

Register into `sidebar.nav` (list, root scope): `{ id, order, label }` plus your row component. Your component receives `{ wide }` owner props, the seat's `useNavState`/`activate` inject, and the standard locale seat. Mark the matching `conversation.view` entry `hidden: true` so the header tab ring withholds its tab while the view stays resolvable.

## Model Experience

None, as this client page renders model-independent reads only; every prompt, schema, and tool surface lives in server packages.

#### KV Cache effect

Independent of the model request stream: client page reads never enter a request, so this package neither appends to nor invalidates any reusable request prefix.


## Known Limitations and Deferred Work

- Activation is best-effort: with no workspace at all, opening the blank session is impossible and the row click lands on the chat hero (parity with the retired footer-action entries).
- Rows own their icon/label/badge and their own copy of the canonical nav-item CSS; the shell owns only column chrome and ordering.
