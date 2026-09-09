import { useMenu } from "@refinedev/core";
import type { TreeMenuItem } from "@refinedev/core";
import { filterMenuItemsByAcl, useAclState } from "@nocobase/portal-sdk/acl";
import { Navigate } from "react-router";

import { AccessDenied } from "./access-denied";

// The CRM sidebar groups its pages under label-only nav headers
// (crm_nav_*, meta.group === true) that carry a placeholder /nav/* path but no
// page. The portal-sdk's findFirstAccessibleRoute would land the portal root on
// that first group route, showing a blank page before its redirect fires. Walk
// the (ACL-filtered) menu ourselves and return the first real page instead,
// descending into group headers rather than stopping on them.
function findFirstPageRoute(
  items: TreeMenuItem[] | undefined
): string | undefined {
  for (const item of items ?? []) {
    if (item.meta?.group) {
      const childRoute = findFirstPageRoute(item.children);
      if (childRoute) return childRoute;
      continue;
    }
    if (item.route) return item.route;
    const childRoute = findFirstPageRoute(item.children);
    if (childRoute) return childRoute;
  }
  return undefined;
}

export function NavigateToAccessibleResource() {
  const { menuItems } = useMenu();
  const state = useAclState();
  const route =
    state.status === "ready"
      ? findFirstPageRoute(
          filterMenuItemsByAcl(menuItems, state.permissions)
        )
      : undefined;

  return route ? <Navigate to={route} replace /> : <AccessDenied />;
}
