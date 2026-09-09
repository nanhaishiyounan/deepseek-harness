import {
  Suspense,
  type PropsWithChildren,
  type ReactNode,
} from "react";
import type { ResourceProps } from "@refinedev/core";
import {
  Boxes,
  BookOpen,
  LifeBuoy,
  TrendingUp,
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

const extensionContributions = collectAppExtensionContributions({
  extensions: Object.values(extensionModules).map((module) => module.default),
  appRoutes,
  registryRoutesEnabled,
});

export const appExtensions = extensionContributions.extensions;

// --- Sidebar grouping -----------------------------------------------------
// Each group is a route-less parent nav item; the template renders a
// parent-with-children (no meta.group) as a collapsible row when the sidebar is
// open and a hover dropdown when collapsed. Children attach via meta.parent (see
// the map below) without touching the module files. Group priorities sit above
// Overview (0) and below every child (>=10) so the parent rows order correctly
// at the sidebar root.
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
  makeGroup("group_revenue", "Revenue", "groups.revenue", <TrendingUp />, 1),
  makeGroup("group_delivery", "Delivery", "groups.delivery", <Truck />, 2),
  makeGroup("group_people", "People", "groups.people", <Users />, 3),
  makeGroup("group_operations", "Operations", "groups.operations", <Boxes />, 4),
  makeGroup("group_finance", "Finance", "groups.finance", <Wallet />, 5),
  makeGroup("group_support", "Support", "groups.support", <LifeBuoy />, 6),
  makeGroup("group_knowledge", "Knowledge", "groups.knowledge", <BookOpen />, 7),
];

// Which group each module nav resource belongs to.
const resourceGroupParent: Record<string, string> = {
  // Revenue — Sales
  hub_sales_deals: "group_revenue",
  hub_sales_accounts: "group_revenue",
  hub_sales_leads: "group_revenue",
  hub_sales_activities: "group_revenue",
  // Delivery — Projects
  hub_pj_projects: "group_delivery",
  hub_pj_tasks: "group_delivery",
  hub_pj_milestones: "group_delivery",
  // People — HR
  hub_hr_employees: "group_people",
  hub_hr_departments: "group_people",
  hub_hr_leave_requests: "group_people",
  // Operations — Inventory, Procurement, Assets
  "inventory-dashboard": "group_operations",
  hub_inv_products: "group_operations",
  hub_inv_warehouses: "group_operations",
  hub_inv_stock_moves: "group_operations",
  hub_po_purchase_orders: "group_operations",
  hub_po_suppliers: "group_operations",
  hub_as_assets: "group_operations",
  hub_as_assignments: "group_operations",
  hub_as_maintenance: "group_operations",
  // Finance
  "finance-dashboard": "group_finance",
  hub_fin_invoices: "group_finance",
  hub_fin_expenses: "group_finance",
  // Support — Helpdesk
  hub_hd_tickets: "group_support",
  // --- added pages (page-addition round; safe even before the resources exist) ---
  hub_sales_contacts: "group_revenue",
  "sales-calendar": "group_revenue",
  "projects-my-tasks": "group_delivery",
  "projects-calendar": "group_delivery",
  "hr-org-chart": "group_people",
  "hr-leave-calendar": "group_people",
  "inv-reorder": "group_operations",
  "po-spend": "group_operations",
  "finance-cashflow": "group_finance",
  "finance-budget": "group_finance",
  "hd-sla": "group_support",
  "hd-faq": "group_support",
  "kb-search": "group_knowledge",
  "kb-tags": "group_knowledge",
  "helpdesk-dashboard": "group_support",
  hub_sales_forecast: "group_revenue",
  "finance-reports": "group_finance",
  // Knowledge
  knowledge_overview: "group_knowledge",
  hub_kb_articles: "group_knowledge",
  hub_kb_categories: "group_knowledge",
};

// Inventory, Procurement and Assets each start their nav priorities at 10, so
// inside the shared Operations group they would interleave. Nudge Procurement
// and Assets after Inventory to keep each module's items contiguous.
const priorityOverride: Record<string, number> = {
  hub_po_purchase_orders: 20,
  hub_po_suppliers: 21,
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
