import { LayoutDashboard } from "lucide-react";

import type { AppRouteDefinition } from "@nocobase/portal-sdk/routing";
import { homeRoutes } from "@/pages/home/routes";

// Overview is the default landing page. In this CRM portal it takes priority
// -1 so it precedes the crm_nav_* groups (all priority >= 0) in the menu and
// the root NavigateToAccessibleResource lands on /overview instead of the
// legacy sales dashboard.
const routes: AppRouteDefinition[] = [
  {
    name: "home",
    path: homeRoutes.overview,
    lazy: () =>
      import("./route-components").then((module) => ({
        default: module.routeComponent("home"),
      })),
    resource: {
      meta: {
        label: "Overview",
        i18nKey: "home.resources.overview",
        i18nOptions: { ns: "starter" },
        priority: -1,
        icon: <LayoutDashboard />,
        acl: false,
      },
    },
  },
];

export const homeModule = { routes };
