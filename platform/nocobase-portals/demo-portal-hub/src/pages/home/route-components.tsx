import { LayoutDashboard } from "lucide-react";

import type { AppRouteDefinition } from "@nocobase/portal-sdk/routing";
import { OverviewPage } from "@/pages/home/overview";
import { homeRoutes } from "@/pages/home/routes";

// Overview is the default landing page (priority 0) — mirrors how crm's
// dashboard route is defined, but with no nested children.
const routes: AppRouteDefinition[] = [
  {
    name: "home",
    path: homeRoutes.overview,
    element: <OverviewPage />,
    resource: {
      meta: {
        label: "Overview",
        i18nKey: "home.resources.overview",
        i18nOptions: { ns: "starter" },
        priority: 0,
        icon: <LayoutDashboard />,
        acl: false,
      },
    },
  },
];

export const homeModule = { routes };

type MaterializedRoute = {
  name?: string;
  element?: import("react").ReactNode;
  children?: MaterializedRoute[];
};

function findMaterializedRoute(
  routes: readonly MaterializedRoute[],
  name: string
): MaterializedRoute | undefined {
  for (const route of routes) {
    if (route.name === name) return route;
    const child = route.children
      ? findMaterializedRoute(route.children, name)
      : undefined;
    if (child) return child;
  }
  return undefined;
}

export function routeComponent(name: string) {
  const route = findMaterializedRoute(homeModule.routes, name);
  if (!route) {
    throw new Error(`Unknown route component: ${name}`);
  }
  return function LazyRouteComponent() {
    return route.element ?? null;
  };
}
