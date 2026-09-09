# Route surfaces

Route surfaces keep URL navigation separate from visual presentation. The same
business content can be hosted by a routed drawer, dialog, or full page.

This Portal keeps only the reusable route-surface primitives. The Registry Demo
route is intentionally not registered.

`resourceAction` binds a child URL to a Refine resource action; it does not
select a presentation. With the resource route's automatic outlet, the action
element must render a `RouteDrawer` or `RouteDialog`. Use a manual outlet layout
when the child should replace the list as a full page.

## Components

- `RouteDrawer` supports URL-backed nested drawers and push-style stacking.
- `RouteDialog` provides the same close contract for modal routes.
- `RoutePage` provides the close context without an overlay.
- SDK `useRouteSurfaceClose` lets content request a close without knowing how it
  is presented.
- `useRefineUnsavedChangesGuard` adapts Refine's unsaved-change state to the
  route surface close lifecycle and renders a shadcn Alert Dialog confirmation.

Create, edit, show, and related-content surfaces should be declared as child
routes of the page that opens them. Reuse the content component across hosts,
but use relative navigation and a host-specific `closeTo` URL; do not send a
child action to a fixed top-level resource URL. Preserve the complete opening
URL in navigation state so closing restores list filters, pagination, tabs, and
hash state; use the resolved parent route as the direct-entry fallback.
Use `createRouteSurfaceNavigationState` and `resolveRouteSurfaceCloseTo` from
`@nocobase/portal-sdk/routing` for that shared navigation protocol instead of
copying host-specific state helpers.

Route definitions, ACL guards, resource data fetching, and application-specific
paths remain application concerns.
