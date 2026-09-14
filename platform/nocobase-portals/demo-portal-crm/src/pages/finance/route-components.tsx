import {
  BarChart3,
  CalendarClock,
  CreditCard,
  PieChart,
  PiggyBank,
  Receipt,
  TrendingUp,
} from "lucide-react";
import { useParams } from "react-router";

import {
  defineAppRoutes,
  type AppRouteDefinition,
} from "@nocobase/portal-sdk/routing";
import { AccessDenied } from "@/components/access-control/access-denied";
import { CanAccess } from "@/components/access-control/can-access";
import { ArAging } from "@/pages/finance/aging";
import { BudgetVsActual } from "@/pages/finance/budget";
import { CashFlow } from "@/pages/finance/cash-flow";
import { FinanceDashboard } from "@/pages/finance/dashboard";
import { ExpenseDecision } from "@/pages/finance/expenses/decision";
import { ExpenseCreate, ExpenseEdit } from "@/pages/finance/expenses/form";
import { ExpenseListPage } from "@/pages/finance/expenses/list";
import { ExpenseShow } from "@/pages/finance/expenses/show";
import { InvoiceCreate, InvoiceEdit } from "@/pages/finance/invoices/form";
import { ItemCreate, ItemEdit } from "@/pages/finance/invoices/items-form";
import { InvoiceListPage } from "@/pages/finance/invoices/list";
import { InvoiceShow } from "@/pages/finance/invoices/show";
import { FinanceReports } from "@/pages/finance/reports";
import { financeRoutes } from "@/pages/finance/routes";

const denied = <AccessDenied />;

// --- Nested invoice-scoped surfaces (inside the invoice detail drawer) ------
// The line item belongs to the invoice via its scalar invoice_id FK, so the
// create/edit forms carry the parent invoice id from the URL.

function InvoiceScopedItemCreate() {
  const { id } = useParams<{ id: string }>();
  return <ItemCreate presetInvoiceId={id} />;
}

function InvoiceScopedItemEdit() {
  const { id } = useParams<{ id: string }>();
  return <ItemEdit presetInvoiceId={id} idParam="itemId" />;
}

// Nested children rendered inside the invoice detail drawer (2nd URL level):
// /invoices/show/:id/edit, /invoices/show/:id/items/create and
// /invoices/show/:id/items/edit/:itemId (one level deeper — route changes).
const invoiceShowChildren: AppRouteDefinition[] = [
  {
    name: "hub_fin_invoices.show.edit",
    path: "edit",
    element: (
      <CanAccess resource="hub_fin_invoices" action="edit" fallback={denied}>
        <InvoiceEdit />
      </CanAccess>
    ),
  },
  {
    name: "hub_fin_invoices.show.items.create",
    path: "items/create",
    element: (
      <CanAccess resource="hub_fin_invoice_items" action="create" fallback={denied}>
        <InvoiceScopedItemCreate />
      </CanAccess>
    ),
  },
  {
    name: "hub_fin_invoices.show.items.edit",
    path: "items/edit/:itemId",
    element: (
      <CanAccess resource="hub_fin_invoice_items" action="edit" fallback={denied}>
        <InvoiceScopedItemEdit />
      </CanAccess>
    ),
  },
];

// Nested children rendered inside the expense detail drawer (2nd URL level):
// /expenses/show/:id/edit and /expenses/show/:id/decision/:action
const expenseShowChildren: AppRouteDefinition[] = [
  {
    name: "hub_fin_expenses.show.edit",
    path: "edit",
    element: (
      <CanAccess resource="hub_fin_expenses" action="edit" fallback={denied}>
        <ExpenseEdit />
      </CanAccess>
    ),
  },
  {
    name: "hub_fin_expenses.show.decision",
    path: "decision/:action",
    element: (
      <CanAccess resource="hub_fin_expenses" action="edit" fallback={denied}>
        <ExpenseDecision />
      </CanAccess>
    ),
  },
];

// Finance module — accounts receivable (invoices) + employee expense claims,
// plus a spend/AR dashboard. Nav group priority ≥10. The primary list is
// mounted at /invoices (the Home quick-link target).
const routes: AppRouteDefinition[] = defineAppRoutes([
  {
    name: "finance-dashboard",
    path: financeRoutes.dashboard,
    element: <FinanceDashboard />,
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
    element: <InvoiceListPage />,
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
        element: (
          <CanAccess resource="hub_fin_invoices" action="create" fallback={denied}>
            <InvoiceCreate />
          </CanAccess>
        ),
      },
      {
        name: "hub_fin_invoices.edit",
        path: "edit/:id",
        resourceAction: "edit",
        element: (
          <CanAccess resource="hub_fin_invoices" action="edit" fallback={denied}>
            <InvoiceEdit />
          </CanAccess>
        ),
      },
      {
        name: "hub_fin_invoices.show",
        path: "show/:id",
        resourceAction: "show",
        element: (
          <CanAccess resource="hub_fin_invoices" action="show" fallback={denied}>
            <InvoiceShow />
          </CanAccess>
        ),
        children: invoiceShowChildren,
      },
    ],
  },
  {
    name: "hub_fin_expenses",
    path: financeRoutes.expenses,
    element: <ExpenseListPage />,
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
        element: (
          <CanAccess resource="hub_fin_expenses" action="create" fallback={denied}>
            <ExpenseCreate />
          </CanAccess>
        ),
      },
      {
        name: "hub_fin_expenses.edit",
        path: "edit/:id",
        resourceAction: "edit",
        element: (
          <CanAccess resource="hub_fin_expenses" action="edit" fallback={denied}>
            <ExpenseEdit />
          </CanAccess>
        ),
      },
      {
        name: "hub_fin_expenses.show",
        path: "show/:id",
        resourceAction: "show",
        element: (
          <CanAccess resource="hub_fin_expenses" action="show" fallback={denied}>
            <ExpenseShow />
          </CanAccess>
        ),
        children: expenseShowChildren,
      },
    ],
  },
  {
    name: "finance-reports",
    path: financeRoutes.reports,
    element: <FinanceReports />,
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
    element: <CashFlow />,
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
    element: <BudgetVsActual />,
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
    element: <ArAging />,
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
  const route = findMaterializedRoute(financeModule.routes, name);
  if (!route) {
    throw new Error(`Unknown route component: ${name}`);
  }
  return function LazyRouteComponent() {
    return route.element ?? null;
  };
}
