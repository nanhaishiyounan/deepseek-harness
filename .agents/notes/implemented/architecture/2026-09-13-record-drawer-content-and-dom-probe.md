# Agent Note: Record-scoped drawer content and the DOM-probe pitfalls behind two F-round "defects"

Status: implemented

English | [中文](2026-09-13-record-drawer-content-and-dom-probe.zh.md)

## Problem

The F-round unified verification flagged two runtime defects: kanban/calendar card drawers opening blank, and form AI buttons "not rendering" (`n18ai=0` across the form DOM including shadow roots). F6 diagnosed both against the vendored NocoBase 2.2.6 client: the first was real and is fixed, the second was a probe false negative with the button fully working.

## Decision

- **Record-scoped popups load, create-popups create.** `FlowPage` (core client-v2) takes the `loadModel`-only branch when the view input carries `filterByTk` (card/event click) and the `loadOrCreateModel` branch otherwise (Add new). A record drawer therefore needs a PERSISTED page subtree under its action (`findOne?parentId=<actionUid>&subKey=page`), while an Add-new popup synthesizes its default page client-side. Persisting `ChildPageModel → ChildPageTabModel → BlockGridModel → DetailsBlockModel` (details-fixture dual shape, layout rows referencing DetailsItemModel uids) under `KanbanCardViewActionModel`/`CalendarEventViewActionModel` wires the drawer end to end; an openView `uid` pointing at the action's own uid is equivalent to omitting it.
- **Same-collection pages need tree ownership, not just uid prefixes.** Batch prefixes (n17f2 vs E1/N17 rows) rule out OTHER batches on the same collection, but 回款 and 销售仪表盘 are both n17f2 on crm_payments — only walking a block's parent grid to its tabs route row and the flowPage schemaUid separates them. Deep popup nodes carry no parentId in list snapshots (the closure table holds the tree), so the form check goes through `findOne?subKey=page` on the page's own AddNewActionModel.
- **UI probes must match how a component actually renders.** AIEmployeeButtonModel renders as a bare 40px ant-avatar next to the submit button (no uid, no marker class, no a11y role); flowModels uids never enter the runtime DOM. A "search the DOM for n18ai" probe is a guaranteed false negative even though the button, its click-to-chat, and its workContext binding all work (verified: the chat opens with 表单（添加）: 任务 bound). Acceptance asserts the flowModels row server-side and verifies the render layer by the avatar shape or screenshots.

## Alternatives considered

- Downgrading the kanban drawer to "no drawer on card click" per the F-task exit clause was unnecessary: the probe showed the 2.2.6 form IS programmatically wireable — the drawer just needed its content subtree persisted.
- Fixing the "AI button not rendering" in n18's mount logic had no defect to fix: the server tree, the client render, the click interaction, and the form context all check out; the fix is the probe/acceptance wording (setup-nocobase verify comment + QUICKSTART render-shape note), not the mount.
- Statically injecting chart card titles was tried and rejected: `props.title` and `stepParams.cardSettings.title` both fail to render (BlockItemCard.title reads the runtime decoratorProps that only the UI Editor cardSettings panel sets); registered as a vendored-pipeline boundary.

## Consequences

- Drawer content rides the same flowModels:save path as every other persisted node, so heal/rollback sweeps (n17f1 prefix) cover it; ensureCardDrawers is idempotent per action (an existing page child keeps).
- The completeness predicates live as pure functions in `nocobase-flow-page-lib.mts` so the keyless spec (`tests/nocobase-f2-heal.spec.ts`) drives them with row fixtures instead of a server.
