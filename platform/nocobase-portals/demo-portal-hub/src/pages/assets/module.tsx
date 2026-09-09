import { ClipboardList, Package, Scale, Wrench } from "lucide-react";
import type { AppRouteDefinition } from "@nocobase/portal-sdk/routing";
import { assetsRoutes } from "./routes";

const assetShowChildren: AppRouteDefinition[] = [
  {
    name: "hub_as_assets.show.edit",
    path: "edit",
    lazy: () =>
      import("./route-components").then((module) => ({
        default: module.routeComponent("hub_as_assets.show.edit"),
      })),
  },
  {
    name: "hub_as_assets.show.assign",
    path: "assign",
    lazy: () =>
      import("./route-components").then((module) => ({
        default: module.routeComponent("hub_as_assets.show.assign"),
      })),
  },
  {
    name: "hub_as_assets.show.assignments.show",
    path: "assignments/show/:asgId",
    lazy: () =>
      import("./route-components").then((module) => ({
        default: module.routeComponent("hub_as_assets.show.assignments.show"),
      })),
    children: [
      {
        name: "hub_as_assets.show.assignments.show.edit",
        path: "edit",
        lazy: () =>
          import("./route-components").then((module) => ({
            default: module.routeComponent("hub_as_assets.show.assignments.show.edit"),
          })),
      },
    ],
  },
  {
    name: "hub_as_assets.show.maintenance.create",
    path: "maintenance/create",
    lazy: () =>
      import("./route-components").then((module) => ({
        default: module.routeComponent("hub_as_assets.show.maintenance.create"),
      })),
  },
  {
    name: "hub_as_assets.show.maintenance.show",
    path: "maintenance/show/:mId",
    lazy: () =>
      import("./route-components").then((module) => ({
        default: module.routeComponent("hub_as_assets.show.maintenance.show"),
      })),
    children: [
      {
        name: "hub_as_assets.show.maintenance.show.edit",
        path: "edit",
        lazy: () =>
          import("./route-components").then((module) => ({
            default: module.routeComponent("hub_as_assets.show.maintenance.show.edit"),
          })),
      },
    ],
  },
];

const assignmentShowChildren: AppRouteDefinition[] = [
  {
    name: "hub_as_assignments.show.edit",
    path: "edit",
    lazy: () =>
      import("./route-components").then((module) => ({
        default: module.routeComponent("hub_as_assignments.show.edit"),
      })),
  },
];

const maintenanceShowChildren: AppRouteDefinition[] = [
  {
    name: "hub_as_maintenance.show.edit",
    path: "edit",
    lazy: () =>
      import("./route-components").then((module) => ({
        default: module.routeComponent("hub_as_maintenance.show.edit"),
      })),
  },
];

const ledgerRoute: AppRouteDefinition = {
  name: "assets-ledger",
  path: assetsRoutes.ledger,
  lazy: () =>
    import("./route-components").then((module) => ({
      default: module.routeComponent("assets-ledger"),
    })),
  resource: {
    meta: {
      label: "Asset ledger",
      i18nKey: "assets.resources.ledger",
      i18nOptions: { ns: "starter" },
      descriptionI18nKey: "assets.resources.ledger.description",
      priority: 51,
      icon: <Scale />,
      description:
        "Book value, accumulated depreciation and refresh exposure across the register.",
      acl: false,
    },
  },
};

const routes: AppRouteDefinition[] = [
  {
    name: "hub_as_assets",
    path: assetsRoutes.assets,
    lazy: () =>
      import("./route-components").then((module) => ({
        default: module.routeComponent("hub_as_assets"),
      })),
    resource: {
      meta: {
        label: "Assets",
        singularLabel: "Asset",
        i18nKey: "assets.resources.assets",
        i18nSingularKey: "assets.resources.asset",
        i18nOptions: { ns: "starter" },
        descriptionI18nKey: "assets.resources.assets.description",
        priority: 10,
        icon: <Package />,
        description:
          "The company asset register — every device, its category, status and value.",
        canCreate: true,
        canDelete: true,
        acl: { type: "collection" },
      },
    },
    children: [
      {
        name: "hub_as_assets.create",
        path: "create",
        resourceAction: "create",
        lazy: () =>
          import("./route-components").then((module) => ({
            default: module.routeComponent("hub_as_assets.create"),
          })),
      },
      {
        name: "hub_as_assets.edit",
        path: "edit/:id",
        resourceAction: "edit",
        lazy: () =>
          import("./route-components").then((module) => ({
            default: module.routeComponent("hub_as_assets.edit"),
          })),
      },
      {
        name: "hub_as_assets.show",
        path: "show/:id",
        resourceAction: "show",
        lazy: () =>
          import("./route-components").then((module) => ({
            default: module.routeComponent("hub_as_assets.show"),
          })),
        children: assetShowChildren,
      },
    ],
  },
  {
    name: "hub_as_assignments",
    path: assetsRoutes.assignments,
    lazy: () =>
      import("./route-components").then((module) => ({
        default: module.routeComponent("hub_as_assignments"),
      })),
    resource: {
      meta: {
        label: "Assignments",
        singularLabel: "Assignment",
        i18nKey: "assets.resources.assignments",
        i18nSingularKey: "assets.resources.assignment",
        i18nOptions: { ns: "starter" },
        descriptionI18nKey: "assets.resources.assignments.description",
        priority: 11,
        icon: <ClipboardList />,
        description:
          "Who has what — active and returned device assignments across the company.",
        canCreate: true,
        canDelete: true,
        acl: { type: "collection" },
      },
    },
    children: [
      {
        name: "hub_as_assignments.create",
        path: "create",
        resourceAction: "create",
        lazy: () =>
          import("./route-components").then((module) => ({
            default: module.routeComponent("hub_as_assignments.create"),
          })),
      },
      {
        name: "hub_as_assignments.edit",
        path: "edit/:id",
        resourceAction: "edit",
        lazy: () =>
          import("./route-components").then((module) => ({
            default: module.routeComponent("hub_as_assignments.edit"),
          })),
      },
      {
        name: "hub_as_assignments.show",
        path: "show/:id",
        resourceAction: "show",
        lazy: () =>
          import("./route-components").then((module) => ({
            default: module.routeComponent("hub_as_assignments.show"),
          })),
        children: assignmentShowChildren,
      },
    ],
  },
  {
    name: "hub_as_maintenance",
    path: assetsRoutes.maintenance,
    lazy: () =>
      import("./route-components").then((module) => ({
        default: module.routeComponent("hub_as_maintenance"),
      })),
    resource: {
      meta: {
        label: "Maintenance",
        singularLabel: "Maintenance record",
        i18nKey: "assets.resources.maintenance",
        i18nSingularKey: "assets.resources.maintenanceRecord",
        i18nOptions: { ns: "starter" },
        descriptionI18nKey: "assets.resources.maintenance.description",
        priority: 50,
        icon: <Wrench />,
        description:
          "Scheduled and completed service work — repairs, inspections and preventive maintenance across the fleet.",
        canCreate: true,
        canDelete: true,
        acl: { type: "collection" },
      },
    },
    children: [
      {
        name: "hub_as_maintenance.create",
        path: "create",
        resourceAction: "create",
        lazy: () =>
          import("./route-components").then((module) => ({
            default: module.routeComponent("hub_as_maintenance.create"),
          })),
      },
      {
        name: "hub_as_maintenance.edit",
        path: "edit/:id",
        resourceAction: "edit",
        lazy: () =>
          import("./route-components").then((module) => ({
            default: module.routeComponent("hub_as_maintenance.edit"),
          })),
      },
      {
        name: "hub_as_maintenance.show",
        path: "show/:id",
        resourceAction: "show",
        lazy: () =>
          import("./route-components").then((module) => ({
            default: module.routeComponent("hub_as_maintenance.show"),
          })),
        children: maintenanceShowChildren,
      },
    ],
  },
  ledgerRoute,
];

export const assetsModule = { routes };
