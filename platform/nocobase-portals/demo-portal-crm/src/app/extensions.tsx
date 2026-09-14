import {
  Suspense,
  type PropsWithChildren,
  type ReactNode,
} from "react";
import type { ResourceProps } from "@refinedev/core";
import {
  BookOpen,
  Boxes,
  LifeBuoy,
  Truck,
  Users,
  Wallet,
} from "lucide-react";
import {
  collectAppExtensionContributions,
  type AppExtension,
} from "@nocobase/portal-sdk/extensions";
import {
  buildRouteResources,
  renderAppRoutes,
} from "@nocobase/portal-sdk/routing";
import { LoadingState } from "@/components/app-shell/loading-state";
import { appRoutes, registryRoutesEnabled } from "@/routes";
import { createDevelopmentRoute } from "./development";
import { RouteAccessGuard } from "./route-access-guard";

const extensionModules = import.meta.glob<{ default: AppExtension }>(
  "@/extensions/*/extension.tsx",
  { eager: true }
);

const unavailableOptionalRuntimeExtensions = new Set([
  "nocobase-auth-oidc",
  "nocobase-auth-saml",
]);

const configuredExtensions: AppExtension[] = Object.values(extensionModules).map(
  ({ default: extension }) => {
    if (extension.id === "nocobase-mail") {
      return { ...extension, Provider: undefined };
    }
    if (unavailableOptionalRuntimeExtensions.has(extension.id)) {
      return { ...extension, AuthRuntimeProvider: undefined };
    }
    return extension;
  }
);

const extensionContributions = collectAppExtensionContributions({
  // Mail demos remain installed, but this CRM runtime does not expose the
  // unread-count API. Compose out only its global polling provider so the
  // production shell does not issue a failing optional request on every page.
  // OIDC and SAML demos also remain installed, while their auto-redirect
  // providers are omitted because this runtime does not expose those APIs.
  extensions: configuredExtensions,
  appRoutes,
  registryRoutesEnabled,
});

export const appExtensions = extensionContributions.extensions;

// --- Sidebar grouping (migrated Hub domains) -------------------------------
// Each group is a route-less parent nav item; the template renders a
// parent-with-children as a collapsible row when the sidebar is open and a
// hover dropdown when collapsed. Migrated Hub resources attach via meta.parent
// (see the map below) without touching the module files. The CRM-native groups
// (crm_nav_*) keep their inline priorities 0-40 in src/routes.tsx; the Hub
// groups follow at 50+ so the sales domain stays first.
const makeGroup = (
  name: string,
  label: string,
  i18nKey: string,
  icon: ReactNode,
  priority: number
): ResourceProps => ({
  name,
  meta: {
    label,
    i18nKey,
    i18nOptions: { ns: "starter" },
    icon,
    priority,
  },
});

const sidebarGroups: ResourceProps[] = [
  makeGroup("group_delivery", "Delivery", "groups.delivery", <Truck />, 50),
  makeGroup("group_people", "People", "groups.people", <Users />, 51),
  makeGroup("group_operations", "Operations", "groups.operations", <Boxes />, 52),
  makeGroup("group_finance", "Finance", "groups.finance", <Wallet />, 53),
  makeGroup("group_support", "Support", "groups.support", <LifeBuoy />, 54),
  makeGroup("group_knowledge", "Knowledge", "groups.knowledge", <BookOpen />, 55),
];

// Which migrated module nav resource belongs to which group. Resources absent
// from this map (all CRM-native ones) keep their inline meta untouched.
const resourceGroupParent: Record<string, string> = {
  // Delivery — Projects
  hub_pj_projects: "group_delivery",
  hub_pj_tasks: "group_delivery",
  hub_pj_milestones: "group_delivery",
  "projects-my-tasks": "group_delivery",
  "projects-calendar": "group_delivery",
  // People — HR
  hub_hr_employees: "group_people",
  hub_hr_departments: "group_people",
  hub_hr_leave_requests: "group_people",
  "hr-org-chart": "group_people",
  "hr-leave-calendar": "group_people",
  // Operations — Inventory, Assets (Procurement lands in G5)
  "inventory-dashboard": "group_operations",
  hub_inv_products: "group_operations",
  hub_inv_warehouses: "group_operations",
  hub_inv_stock_moves: "group_operations",
  "inv-reorder": "group_operations",
  hub_as_assets: "group_operations",
  hub_as_assignments: "group_operations",
  hub_as_maintenance: "group_operations",
  // Support — Helpdesk
  hub_hd_tickets: "group_support",
  "helpdesk-dashboard": "group_support",
  "hd-agents": "group_support",
  "hd-sla": "group_support",
  "hd-faq": "group_support",
};

// Assets items start at nav priorities 10/11/50, interleaving with the
// Inventory items (10-13) inside the shared Operations group. Nudge Assets
// after Inventory to keep each module's items contiguous (Procurement takes
// the 20s band when it lands in G5).
const priorityOverride: Record<string, number> = {
  hub_as_assets: 30,
  hub_as_assignments: 31,
  hub_as_maintenance: 32,
};

const groupedRouteResources = buildRouteResources(
  extensionContributions.routeDefinitions
).map((resource) => {
  const parent = resourceGroupParent[resource.name];
  const priority = priorityOverride[resource.name];
  if (!parent && priority === undefined) return resource;
  return {
    ...resource,
    meta: {
      ...resource.meta,
      ...(parent ? { parent } : {}),
      ...(priority !== undefined ? { priority } : {}),
    },
  };
});

export const configuredResources = [
  ...sidebarGroups,
  ...groupedRouteResources,
  ...extensionContributions.resources,
];

export const configuredRouteElements = renderAppRoutes(
  extensionContributions.routeDefinitions,
  {
    AccessGuard: RouteAccessGuard,
  }
);

export const extensionStandaloneRouteElements = import.meta.env.DEV
  ? [createDevelopmentRoute(appExtensions)]
  : [];

export const extensionUserMenuItems = extensionContributions.userMenuItems;

export const extensionAuthAdapters = extensionContributions.authAdapters;

export function AppExtensionProviders({ children }: PropsWithChildren) {
  return extensionContributions.providerExtensions.reduceRight<ReactNode>(
    (content, extension) => {
      const Provider = extension.Provider;
      return Provider ? <Provider>{content}</Provider> : content;
    },
    children
  );
}

export function AppAuthRuntimeProviders({ children }: PropsWithChildren) {
  return extensionContributions.authRuntimeExtensions.reduceRight<ReactNode>(
    (content, extension) => {
      const Provider = extension.AuthRuntimeProvider!;
      return (
        <Suspense fallback={<LoadingState fullscreen />}>
          <Provider>{content}</Provider>
        </Suspense>
      );
    },
    children
  );
}
