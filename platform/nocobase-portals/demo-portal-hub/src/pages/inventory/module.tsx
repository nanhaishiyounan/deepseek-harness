import {
  ArrowLeftRight,
  Grid3x3,
  LayoutDashboard,
  Package,
  PackageX,
  Repeat,
  Warehouse,
} from "lucide-react";

import type { AppRouteDefinition } from "@nocobase/portal-sdk/routing";
import { inventoryRoutes } from "./routes";

const productContextChildren: AppRouteDefinition[] = [
  {
    name: "hub_inv_products.show.edit",
    path: "edit",
    lazy: () =>
      import("./route-components").then((module) => ({
        default: module.routeComponent("hub_inv_products.show.edit"),
      })),
  },
  {
    name: "hub_inv_products.show.moves.create",
    path: "moves/create",
    lazy: () =>
      import("./route-components").then((module) => ({
        default: module.routeComponent("hub_inv_products.show.moves.create"),
      })),
  },
  {
    name: "hub_inv_products.show.moves.edit",
    path: "moves/edit/:moveId",
    lazy: () =>
      import("./route-components").then((module) => ({
        default: module.routeComponent("hub_inv_products.show.moves.edit"),
      })),
  },
  {
    name: "hub_inv_products.show.moves.show",
    path: "moves/show/:moveId",
    lazy: () =>
      import("./route-components").then((module) => ({
        default: module.routeComponent("hub_inv_products.show.moves.show"),
      })),
  },
];

const warehouseContextChildren: AppRouteDefinition[] = [
  {
    name: "hub_inv_warehouses.show.edit",
    path: "edit",
    lazy: () =>
      import("./route-components").then((module) => ({
        default: module.routeComponent("hub_inv_warehouses.show.edit"),
      })),
  },
  {
    name: "hub_inv_warehouses.show.products.show",
    path: "products/show/:productId",
    lazy: () =>
      import("./route-components").then((module) => ({
        default: module.routeComponent("hub_inv_warehouses.show.products.show"),
      })),
  },
  {
    name: "hub_inv_warehouses.show.moves.show",
    path: "moves/show/:moveId",
    lazy: () =>
      import("./route-components").then((module) => ({
        default: module.routeComponent("hub_inv_warehouses.show.moves.show"),
      })),
  },
];

const stockMoveContextChildren: AppRouteDefinition[] = [
  {
    name: "hub_inv_stock_moves.show.edit",
    path: "edit",
    lazy: () =>
      import("./route-components").then((module) => ({
        default: module.routeComponent("hub_inv_stock_moves.show.edit"),
      })),
  },
];

// Inventory module — products, warehouses and stock moves, plus a stock-level
// dashboard. Nav group priority ≥10. The primary list is mounted at /products
// (the Home quick-link target).
export const inventoryModule = {
  routes: [
    {
      name: "inventory-dashboard",
      path: inventoryRoutes.dashboard,
      lazy: () =>
        import("./route-components").then((module) => ({
          default: module.routeComponent("inventory-dashboard"),
        })),
      resource: {
        meta: {
          label: "Inventory",
          i18nKey: "inventory.resources.dashboard",
          i18nOptions: { ns: "starter" },
          descriptionI18nKey: "inventory.resources.dashboard.description",
          priority: 10,
          icon: <LayoutDashboard />,
          description: "On-hand stock, low-stock alerts and movement trends.",
          acl: false,
        },
      },
    },
    {
      name: "hub_inv_products",
      path: inventoryRoutes.products,
      lazy: () =>
        import("./route-components").then((module) => ({
          default: module.routeComponent("hub_inv_products"),
        })),
      resource: {
        meta: {
          label: "Products",
          singularLabel: "Product",
          i18nKey: "inventory.resources.products",
          i18nSingularKey: "inventory.resources.product",
          i18nOptions: { ns: "starter" },
          descriptionI18nKey: "inventory.resources.products.description",
          priority: 11,
          icon: <Package />,
          description: "The catalog with on-hand levels and reorder points.",
          canCreate: true,
          canDelete: true,
          acl: { type: "collection" },
        },
      },
      children: [
        {
          name: "hub_inv_products.create",
          path: "create",
          resourceAction: "create",
          lazy: () =>
            import("./route-components").then((module) => ({
              default: module.routeComponent("hub_inv_products.create"),
            })),
        },
        {
          name: "hub_inv_products.edit",
          path: "edit/:id",
          resourceAction: "edit",
          lazy: () =>
            import("./route-components").then((module) => ({
              default: module.routeComponent("hub_inv_products.edit"),
            })),
        },
        {
          name: "hub_inv_products.show",
          path: "show/:id",
          resourceAction: "show",
          lazy: () =>
            import("./route-components").then((module) => ({
              default: module.routeComponent("hub_inv_products.show"),
            })),
          children: productContextChildren,
        },
      ],
    },
    {
      name: "hub_inv_warehouses",
      path: inventoryRoutes.warehouses,
      lazy: () =>
        import("./route-components").then((module) => ({
          default: module.routeComponent("hub_inv_warehouses"),
        })),
      resource: {
        meta: {
          label: "Warehouses",
          singularLabel: "Warehouse",
          i18nKey: "inventory.resources.warehouses",
          i18nSingularKey: "inventory.resources.warehouse",
          i18nOptions: { ns: "starter" },
          descriptionI18nKey: "inventory.resources.warehouses.description",
          priority: 12,
          icon: <Warehouse />,
          description: "Stocking locations and units held at each.",
          canCreate: true,
          canDelete: true,
          acl: { type: "collection" },
        },
      },
      children: [
        {
          name: "hub_inv_warehouses.create",
          path: "create",
          resourceAction: "create",
          lazy: () =>
            import("./route-components").then((module) => ({
              default: module.routeComponent("hub_inv_warehouses.create"),
            })),
        },
        {
          name: "hub_inv_warehouses.edit",
          path: "edit/:id",
          resourceAction: "edit",
          lazy: () =>
            import("./route-components").then((module) => ({
              default: module.routeComponent("hub_inv_warehouses.edit"),
            })),
        },
        {
          name: "hub_inv_warehouses.show",
          path: "show/:id",
          resourceAction: "show",
          lazy: () =>
            import("./route-components").then((module) => ({
              default: module.routeComponent("hub_inv_warehouses.show"),
            })),
          children: warehouseContextChildren,
        },
      ],
    },
    {
      name: "hub_inv_stock_moves",
      path: inventoryRoutes.stockMoves,
      lazy: () =>
        import("./route-components").then((module) => ({
          default: module.routeComponent("hub_inv_stock_moves"),
        })),
      resource: {
        meta: {
          label: "Stock moves",
          singularLabel: "Stock move",
          i18nKey: "inventory.resources.stockMoves",
          i18nSingularKey: "inventory.resources.stockMove",
          i18nOptions: { ns: "starter" },
          descriptionI18nKey: "inventory.resources.stockMoves.description",
          priority: 13,
          icon: <ArrowLeftRight />,
          description: "Every receipt, issue and adjustment across warehouses.",
          canCreate: true,
          canDelete: true,
          acl: { type: "collection" },
        },
      },
      children: [
        {
          name: "hub_inv_stock_moves.create",
          path: "create",
          resourceAction: "create",
          lazy: () =>
            import("./route-components").then((module) => ({
              default: module.routeComponent("hub_inv_stock_moves.create"),
            })),
        },
        {
          name: "hub_inv_stock_moves.edit",
          path: "edit/:id",
          resourceAction: "edit",
          lazy: () =>
            import("./route-components").then((module) => ({
              default: module.routeComponent("hub_inv_stock_moves.edit"),
            })),
        },
        {
          name: "hub_inv_stock_moves.show",
          path: "show/:id",
          resourceAction: "show",
          lazy: () =>
            import("./route-components").then((module) => ({
              default: module.routeComponent("hub_inv_stock_moves.show"),
            })),
          children: stockMoveContextChildren,
        },
      ],
    },
    {
      name: "inv-reorder",
      path: inventoryRoutes.reorder,
      lazy: () =>
        import("./route-components").then((module) => ({
          default: module.routeComponent("inv-reorder"),
        })),
      resource: {
        meta: {
          label: "Reorder",
          i18nKey: "inventory.resources.reorder",
          i18nOptions: { ns: "starter" },
          descriptionI18nKey: "inventory.resources.reorder.description",
          priority: 50,
          icon: <PackageX />,
          description: "Products at or below their reorder level with a suggested reorder quantity.",
          acl: false,
        },
      },
    },
    {
      name: "inv-stock-matrix",
      path: inventoryRoutes.stockMatrix,
      lazy: () =>
        import("./route-components").then((module) => ({
          default: module.routeComponent("inv-stock-matrix"),
        })),
      resource: {
        meta: {
          label: "Stock by warehouse",
          i18nKey: "inventory.resources.stockMatrix",
          i18nOptions: { ns: "starter" },
          descriptionI18nKey: "inventory.resources.stockMatrix.description",
          priority: 51,
          icon: <Grid3x3 />,
          description:
            "On-hand quantity for every product in every location, with reorder exposure.",
          acl: false,
        },
      },
    },
    {
      name: "inv-turnover",
      path: inventoryRoutes.turnover,
      lazy: () =>
        import("./route-components").then((module) => ({
          default: module.routeComponent("inv-turnover"),
        })),
      resource: {
        meta: {
          label: "Turnover & dead stock",
          i18nKey: "inventory.resources.turnover",
          i18nOptions: { ns: "starter" },
          descriptionI18nKey: "inventory.resources.turnover.description",
          priority: 52,
          icon: <Repeat />,
          description:
            "Which SKUs move, which sit still, and how much capital the slow ones tie up.",
          acl: false,
        },
      },
    },
  ] satisfies AppRouteDefinition[],
};
