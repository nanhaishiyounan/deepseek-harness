import { BarChart3, PackageOpen, Truck } from "lucide-react";
import type { AppRouteDefinition } from "@nocobase/portal-sdk/routing";
import { AccessDenied } from "@/components/access-control/access-denied";
import { CanAccess } from "@/components/access-control/can-access";
import { procurementRoutes } from "./routes";
import { SpendAnalysisDashboard } from "./spend-analysis";
import { PurchaseOrdersLayout } from "./purchase-orders/list";
import {
  PurchaseOrderCreate,
  PurchaseOrderEdit,
} from "./purchase-orders/create-edit";
import { PurchaseOrderShow } from "./purchase-orders/show";
import { PoItemCreate, PoItemEdit } from "./purchase-orders/item-form";
import { SuppliersLayout } from "./suppliers/list";
import { SupplierCreate, SupplierEdit } from "./suppliers/create-edit";
import { SupplierShow } from "./suppliers/show";

const denied = <AccessDenied />;

// --- Supplier-scoped surfaces (nested inside the supplier detail drawer) ----
// From a supplier's PO sub-list, a PO opens one level deeper as a nested SHOW
// drawer under suppliers/show/:id/po/show/:poId. Its own edit / line-item
// actions resolve against the :poId param so they keep working at this depth.

function SupplierScopedPoShow() {
  return <PurchaseOrderShow idParam="poId" />;
}

function SupplierScopedPoEdit() {
  return <PurchaseOrderEdit idParam="poId" />;
}

function SupplierScopedPoItemCreate() {
  return <PoItemCreate idParam="poId" />;
}

// Children rendered under a nested PO show drawer (edit + line-item CRUD),
// keyed off the :poId param so the deeper PO surface is fully functional.
const nestedPoShowChildren: AppRouteDefinition[] = [
  {
    name: "hub_po_suppliers.show.po.show.edit",
    path: "edit",
    element: (
      <CanAccess resource="hub_po_purchase_orders" action="edit" fallback={denied}>
        <SupplierScopedPoEdit />
      </CanAccess>
    ),
  },
  {
    name: "hub_po_suppliers.show.po.show.items.create",
    path: "items/create",
    element: (
      <CanAccess resource="hub_po_items" action="create" fallback={denied}>
        <SupplierScopedPoItemCreate />
      </CanAccess>
    ),
  },
  {
    name: "hub_po_suppliers.show.po.show.items.edit",
    path: "items/edit/:itemId",
    element: (
      <CanAccess resource="hub_po_items" action="edit" fallback={denied}>
        <PoItemEdit />
      </CanAccess>
    ),
  },
];

const spendAnalysisRoutes: AppRouteDefinition = {
  name: "po-spend",
  path: procurementRoutes.spendAnalysis,
  element: <SpendAnalysisDashboard />,
  resource: {
    meta: {
      label: "Spend analysis",
      i18nKey: "procurement.resources.spendAnalysis",
      i18nOptions: { ns: "starter" },
      descriptionI18nKey: "procurement.resources.spendAnalysis.description",
      priority: 50,
      icon: <BarChart3 />,
      description:
        "Spend by supplier, PO status mix and monthly spend trend.",
      acl: false,
    },
  },
};

const purchaseOrderRoutes: AppRouteDefinition = {
  name: "hub_po_purchase_orders",
  path: procurementRoutes.purchaseOrders,
  element: <PurchaseOrdersLayout />,
  resource: {
    meta: {
      label: "Purchase Orders",
      singularLabel: "Purchase Order",
      i18nKey: "procurement.resources.purchaseOrders",
      i18nSingularKey: "procurement.resources.purchaseOrder",
      i18nOptions: { ns: "starter" },
      descriptionI18nKey: "procurement.resources.purchaseOrders.description",
      priority: 10,
      icon: <Truck />,
      description:
        "Raise and track purchase orders, line items and supplier spend.",
      canCreate: true,
      canDelete: true,
      acl: { type: "collection" },
    },
  },
  children: [
    {
      name: "hub_po_purchase_orders.create",
      path: "create",
      resourceAction: "create",
      element: (
        <CanAccess resource="hub_po_purchase_orders" action="create" fallback={denied}>
          <PurchaseOrderCreate />
        </CanAccess>
      ),
    },
    {
      name: "hub_po_purchase_orders.edit",
      path: "edit/:id",
      resourceAction: "edit",
      element: (
        <CanAccess resource="hub_po_purchase_orders" action="edit" fallback={denied}>
          <PurchaseOrderEdit />
        </CanAccess>
      ),
    },
    {
      name: "hub_po_purchase_orders.show",
      path: "show/:id",
      resourceAction: "show",
      element: (
        <CanAccess resource="hub_po_purchase_orders" action="show" fallback={denied}>
          <PurchaseOrderShow />
        </CanAccess>
      ),
      children: [
        {
          name: "hub_po_purchase_orders.show.edit",
          path: "edit",
          element: (
            <CanAccess resource="hub_po_purchase_orders" action="edit" fallback={denied}>
              <PurchaseOrderEdit />
            </CanAccess>
          ),
        },
        {
          name: "hub_po_purchase_orders.show.items.create",
          path: "items/create",
          element: (
            <CanAccess resource="hub_po_items" action="create" fallback={denied}>
              <PoItemCreate />
            </CanAccess>
          ),
        },
        {
          name: "hub_po_purchase_orders.show.items.edit",
          path: "items/edit/:itemId",
          element: (
            <CanAccess resource="hub_po_items" action="edit" fallback={denied}>
              <PoItemEdit />
            </CanAccess>
          ),
        },
      ],
    },
  ],
};

const supplierRoutes: AppRouteDefinition = {
  name: "hub_po_suppliers",
  path: procurementRoutes.suppliers,
  element: <SuppliersLayout />,
  resource: {
    meta: {
      label: "Suppliers",
      singularLabel: "Supplier",
      i18nKey: "procurement.resources.suppliers",
      i18nSingularKey: "procurement.resources.supplier",
      i18nOptions: { ns: "starter" },
      descriptionI18nKey: "procurement.resources.suppliers.description",
      priority: 11,
      icon: <PackageOpen />,
      description: "Vendors you buy from, with ratings and order history.",
      canCreate: true,
      canDelete: true,
      acl: { type: "collection" },
    },
  },
  children: [
    {
      name: "hub_po_suppliers.create",
      path: "create",
      resourceAction: "create",
      element: (
        <CanAccess resource="hub_po_suppliers" action="create" fallback={denied}>
          <SupplierCreate />
        </CanAccess>
      ),
    },
    {
      name: "hub_po_suppliers.edit",
      path: "edit/:id",
      resourceAction: "edit",
      element: (
        <CanAccess resource="hub_po_suppliers" action="edit" fallback={denied}>
          <SupplierEdit />
        </CanAccess>
      ),
    },
    {
      name: "hub_po_suppliers.show",
      path: "show/:id",
      resourceAction: "show",
      element: (
        <CanAccess resource="hub_po_suppliers" action="show" fallback={denied}>
          <SupplierShow />
        </CanAccess>
      ),
      children: [
        {
          name: "hub_po_suppliers.show.edit",
          path: "edit",
          element: (
            <CanAccess resource="hub_po_suppliers" action="edit" fallback={denied}>
              <SupplierEdit />
            </CanAccess>
          ),
        },
        {
          name: "hub_po_suppliers.show.po.show",
          path: "po/show/:poId",
          element: (
            <CanAccess resource="hub_po_purchase_orders" action="show" fallback={denied}>
              <SupplierScopedPoShow />
            </CanAccess>
          ),
          children: nestedPoShowChildren,
        },
      ],
    },
  ],
};

export const procurementModule: { routes: AppRouteDefinition[] } = {
  routes: [purchaseOrderRoutes, supplierRoutes, spendAnalysisRoutes],
};

export default procurementModule;

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
  const route = findMaterializedRoute(procurementModule.routes, name);
  if (!route) {
    throw new Error(`Unknown route component: ${name}`);
  }
  return function LazyRouteComponent() {
    return route.element ?? null;
  };
}
