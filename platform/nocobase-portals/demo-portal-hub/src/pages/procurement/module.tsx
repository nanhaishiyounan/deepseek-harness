import { BarChart3, PackageOpen, Truck } from "lucide-react";
import type { AppRouteDefinition } from "@nocobase/portal-sdk/routing";
import { procurementRoutes } from "./routes";

// Children rendered under a nested PO show drawer (edit + line-item CRUD),
// keyed off the :poId param so the deeper PO surface is fully functional.
const nestedPoShowChildren: AppRouteDefinition[] = [
  {
    name: "hub_po_suppliers.show.po.show.edit",
    path: "edit",
    lazy: () =>
      import("./route-components").then((module) => ({
        default: module.routeComponent("hub_po_suppliers.show.po.show.edit"),
      })),
  },
  {
    name: "hub_po_suppliers.show.po.show.items.create",
    path: "items/create",
    lazy: () =>
      import("./route-components").then((module) => ({
        default: module.routeComponent("hub_po_suppliers.show.po.show.items.create"),
      })),
  },
  {
    name: "hub_po_suppliers.show.po.show.items.edit",
    path: "items/edit/:itemId",
    lazy: () =>
      import("./route-components").then((module) => ({
        default: module.routeComponent("hub_po_suppliers.show.po.show.items.edit"),
      })),
  },
];

const spendAnalysisRoutes: AppRouteDefinition = {
  name: "po-spend",
  path: procurementRoutes.spendAnalysis,
  lazy: () =>
    import("./route-components").then((module) => ({
      default: module.routeComponent("po-spend"),
    })),
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
  lazy: () =>
    import("./route-components").then((module) => ({
      default: module.routeComponent("hub_po_purchase_orders"),
    })),
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
      lazy: () =>
        import("./route-components").then((module) => ({
          default: module.routeComponent("hub_po_purchase_orders.create"),
        })),
    },
    {
      name: "hub_po_purchase_orders.edit",
      path: "edit/:id",
      resourceAction: "edit",
      lazy: () =>
        import("./route-components").then((module) => ({
          default: module.routeComponent("hub_po_purchase_orders.edit"),
        })),
    },
    {
      name: "hub_po_purchase_orders.show",
      path: "show/:id",
      resourceAction: "show",
      lazy: () =>
        import("./route-components").then((module) => ({
          default: module.routeComponent("hub_po_purchase_orders.show"),
        })),
      children: [
        {
          name: "hub_po_purchase_orders.show.edit",
          path: "edit",
          lazy: () =>
            import("./route-components").then((module) => ({
              default: module.routeComponent("hub_po_purchase_orders.show.edit"),
            })),
        },
        {
          name: "hub_po_purchase_orders.show.items.create",
          path: "items/create",
          lazy: () =>
            import("./route-components").then((module) => ({
              default: module.routeComponent("hub_po_purchase_orders.show.items.create"),
            })),
        },
        {
          name: "hub_po_purchase_orders.show.items.edit",
          path: "items/edit/:itemId",
          lazy: () =>
            import("./route-components").then((module) => ({
              default: module.routeComponent("hub_po_purchase_orders.show.items.edit"),
            })),
        },
      ],
    },
  ],
};

const supplierRoutes: AppRouteDefinition = {
  name: "hub_po_suppliers",
  path: procurementRoutes.suppliers,
  lazy: () =>
    import("./route-components").then((module) => ({
      default: module.routeComponent("hub_po_suppliers"),
    })),
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
      lazy: () =>
        import("./route-components").then((module) => ({
          default: module.routeComponent("hub_po_suppliers.create"),
        })),
    },
    {
      name: "hub_po_suppliers.edit",
      path: "edit/:id",
      resourceAction: "edit",
      lazy: () =>
        import("./route-components").then((module) => ({
          default: module.routeComponent("hub_po_suppliers.edit"),
        })),
    },
    {
      name: "hub_po_suppliers.show",
      path: "show/:id",
      resourceAction: "show",
      lazy: () =>
        import("./route-components").then((module) => ({
          default: module.routeComponent("hub_po_suppliers.show"),
        })),
      children: [
        {
          name: "hub_po_suppliers.show.edit",
          path: "edit",
          lazy: () =>
            import("./route-components").then((module) => ({
              default: module.routeComponent("hub_po_suppliers.show.edit"),
            })),
        },
        {
          name: "hub_po_suppliers.show.po.show",
          path: "po/show/:poId",
          lazy: () =>
            import("./route-components").then((module) => ({
              default: module.routeComponent("hub_po_suppliers.show.po.show"),
            })),
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
