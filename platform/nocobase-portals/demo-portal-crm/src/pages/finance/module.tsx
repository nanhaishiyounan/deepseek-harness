import {
  BarChart3,
  CalendarClock,
  CreditCard,
  PieChart,
  PiggyBank,
  Receipt,
  TrendingUp,
} from "lucide-react";

import {
  defineAppRoutes,
  type AppRouteDefinition,
} from "@nocobase/portal-sdk/routing";
import { financeRoutes } from "@/pages/finance/routes";

// Nested children rendered inside the invoice detail drawer (2nd URL level):
// /invoices/show/:id/edit, /invoices/show/:id/items/create and
// /invoices/show/:id/items/edit/:itemId (one level deeper — route changes).
const invoiceShowChildren: AppRouteDefinition[] = [
  {
    name: "hub_fin_invoices.show.edit",
    path: "edit",
    lazy: () =>
      import("./route-components").then((module) => ({
        default: module.routeComponent("hub_fin_invoices.show.edit"),
      })),
  },
  {
    name: "hub_fin_invoices.show.items.create",
    path: "items/create",
    lazy: () =>
      import("./route-components").then((module) => ({
        default: module.routeComponent("hub_fin_invoices.show.items.create"),
      })),
  },
  {
    name: "hub_fin_invoices.show.items.edit",
    path: "items/edit/:itemId",
    lazy: () =>
      import("./route-components").then((module) => ({
        default: module.routeComponent("hub_fin_invoices.show.items.edit"),
      })),
  },
];

// Nested children rendered inside the expense detail drawer (2nd URL level):
// /expenses/show/:id/edit and /expenses/show/:id/decision/:action
const expenseShowChildren: AppRouteDefinition[] = [
  {
    name: "hub_fin_expenses.show.edit",
    path: "edit",
    lazy: () =>
      import("./route-components").then((module) => ({
        default: module.routeComponent("hub_fin_expenses.show.edit"),
      })),
  },
  {
    name: "hub_fin_expenses.show.decision",
    path: "decision/:action",
    lazy: () =>
      import("./route-components").then((module) => ({
        default: module.routeComponent("hub_fin_expenses.show.decision"),
      })),
  },
];

// Finance module — accounts receivable (invoices) + employee expense claims,
// plus a spend/AR dashboard. Nav group priority ≥10. The primary list is
// mounted at /invoices (the Home quick-link target).
const routes: AppRouteDefinition[] = defineAppRoutes([
  {
    name: "finance-dashboard",
    path: financeRoutes.dashboard,
    lazy: () =>
      import("./route-components").then((module) => ({
        default: module.routeComponent("finance-dashboard"),
      })),
    resource: {
      meta: {
        label: "Finance",
        i18nKey: "finance.resources.dashboard",
        i18nOptions: { ns: "starter" },
        priority: 10,
        icon: <PieChart />,
        acl: false,
      },
    },
  },
  {
    name: "hub_fin_invoices",
    path: financeRoutes.invoices,
    lazy: () =>
      import("./route-components").then((module) => ({
        default: module.routeComponent("hub_fin_invoices"),
      })),
    resource: {
      meta: {
        label: "Invoices",
        singularLabel: "Invoice",
        i18nKey: "finance.resources.invoices",
        i18nSingularKey: "finance.resources.invoice",
        i18nOptions: { ns: "starter" },
        priority: 11,
        icon: <Receipt />,
        canCreate: true,
        canDelete: true,
        acl: { type: "collection" },
      },
    },
    children: [
      {
        name: "hub_fin_invoices.create",
        path: "create",
        resourceAction: "create",
        lazy: () =>
          import("./route-components").then((module) => ({
            default: module.routeComponent("hub_fin_invoices.create"),
          })),
      },
      {
        name: "hub_fin_invoices.edit",
        path: "edit/:id",
        resourceAction: "edit",
        lazy: () =>
          import("./route-components").then((module) => ({
            default: module.routeComponent("hub_fin_invoices.edit"),
          })),
      },
      {
        name: "hub_fin_invoices.show",
        path: "show/:id",
        resourceAction: "show",
        lazy: () =>
          import("./route-components").then((module) => ({
            default: module.routeComponent("hub_fin_invoices.show"),
          })),
        children: invoiceShowChildren,
      },
    ],
  },
  {
    name: "hub_fin_expenses",
    path: financeRoutes.expenses,
    lazy: () =>
      import("./route-components").then((module) => ({
        default: module.routeComponent("hub_fin_expenses"),
      })),
    resource: {
      meta: {
        label: "Expenses",
        singularLabel: "Expense",
        i18nKey: "finance.resources.expenses",
        i18nSingularKey: "finance.resources.expense",
        i18nOptions: { ns: "starter" },
        priority: 12,
        icon: <CreditCard />,
        canCreate: true,
        canDelete: true,
        acl: { type: "collection" },
      },
    },
    children: [
      {
        name: "hub_fin_expenses.create",
        path: "create",
        resourceAction: "create",
        lazy: () =>
          import("./route-components").then((module) => ({
            default: module.routeComponent("hub_fin_expenses.create"),
          })),
      },
      {
        name: "hub_fin_expenses.edit",
        path: "edit/:id",
        resourceAction: "edit",
        lazy: () =>
          import("./route-components").then((module) => ({
            default: module.routeComponent("hub_fin_expenses.edit"),
          })),
      },
      {
        name: "hub_fin_expenses.show",
        path: "show/:id",
        resourceAction: "show",
        lazy: () =>
          import("./route-components").then((module) => ({
            default: module.routeComponent("hub_fin_expenses.show"),
          })),
        children: expenseShowChildren,
      },
    ],
  },
  {
    name: "finance-reports",
    path: financeRoutes.reports,
    lazy: () =>
      import("./route-components").then((module) => ({
        default: module.routeComponent("finance-reports"),
      })),
    resource: {
      meta: {
        label: "Reports",
        i18nKey: "finance.resources.reports",
        i18nOptions: { ns: "starter" },
        priority: 13,
        icon: <BarChart3 />,
        acl: false,
      },
    },
  },
  {
    name: "finance-cashflow",
    path: financeRoutes.cashFlow,
    lazy: () =>
      import("./route-components").then((module) => ({
        default: module.routeComponent("finance-cashflow"),
      })),
    resource: {
      meta: {
        label: "Cash flow",
        i18nKey: "finance.resources.cashflow",
        i18nOptions: { ns: "starter" },
        priority: 50,
        icon: <TrendingUp />,
        acl: false,
      },
    },
  },
  {
    name: "finance-budget",
    path: financeRoutes.budget,
    lazy: () =>
      import("./route-components").then((module) => ({
        default: module.routeComponent("finance-budget"),
      })),
    resource: {
      meta: {
        label: "Budget",
        i18nKey: "finance.resources.budget",
        i18nOptions: { ns: "starter" },
        priority: 51,
        icon: <PiggyBank />,
        acl: false,
      },
    },
  },
  {
    name: "finance-aging",
    path: financeRoutes.aging,
    lazy: () =>
      import("./route-components").then((module) => ({
        default: module.routeComponent("finance-aging"),
      })),
    resource: {
      meta: {
        label: "AR aging",
        i18nKey: "finance.resources.aging",
        i18nOptions: { ns: "starter" },
        priority: 52,
        icon: <CalendarClock />,
        acl: false,
      },
    },
  },
]);

export const financeModule = { routes };
