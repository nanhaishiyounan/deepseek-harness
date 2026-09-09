import { ClipboardList, Package, Scale, Wrench } from "lucide-react";
import type { AppRouteDefinition } from "@nocobase/portal-sdk/routing";
import { AccessDenied } from "@/components/access-control/access-denied";
import { CanAccess } from "@/components/access-control/can-access";
import { AssetCreate, AssetEdit } from "./assets/create-edit";
import { AssetsLayout } from "./assets/layout";
import { AssetShow } from "./assets/show";
import {
  AssetNestedAssign,
  AssignmentCreate,
  AssignmentEdit,
} from "./assignments/create-edit";
import { AssignmentShow } from "./assignments/show";
import { AssignmentsLayout } from "./assignments/layout";
import {
  AssetNestedMaintenance,
  MaintenanceCreate,
  MaintenanceEdit,
} from "./maintenance/create-edit";
import { MaintenanceShow } from "./maintenance/show";
import { MaintenanceLayout } from "./maintenance/layout";
import { AssetLedger } from "./ledger";
import { assetsRoutes } from "./routes";

const denied = <AccessDenied />;

// --- Nested asset-scoped assignment surfaces --------------------------------
// Opened from inside the asset detail drawer at
// `/asset-registry/show/:id/assignments/show/:asgId`. The record id comes from
// the `asgId` param so it does not collide with the parent asset `:id`.

function AssetScopedAssignmentShow() {
  return <AssignmentShow idParam="asgId" />;
}

function AssetScopedAssignmentEdit() {
  return <AssignmentEdit idParam="asgId" />;
}

// Maintenance records opened from the asset detail drawer at
// `/asset-registry/show/:id/maintenance/show/:mId`. `mId` avoids colliding with
// the parent asset `:id`.

function AssetScopedMaintenanceShow() {
  return <MaintenanceShow idParam="mId" />;
}

function AssetScopedMaintenanceEdit() {
  return <MaintenanceEdit idParam="mId" />;
}

const assetShowChildren: AppRouteDefinition[] = [
  {
    name: "hub_as_assets.show.edit",
    path: "edit",
    element: (
      <CanAccess resource="hub_as_assets" action="edit" fallback={denied}>
        <AssetEdit />
      </CanAccess>
    ),
  },
  {
    name: "hub_as_assets.show.assign",
    path: "assign",
    element: (
      <CanAccess resource="hub_as_assignments" action="create" fallback={denied}>
        <AssetNestedAssign />
      </CanAccess>
    ),
  },
  {
    name: "hub_as_assets.show.assignments.show",
    path: "assignments/show/:asgId",
    element: (
      <CanAccess resource="hub_as_assignments" action="show" fallback={denied}>
        <AssetScopedAssignmentShow />
      </CanAccess>
    ),
    children: [
      {
        name: "hub_as_assets.show.assignments.show.edit",
        path: "edit",
        element: (
          <CanAccess resource="hub_as_assignments" action="edit" fallback={denied}>
            <AssetScopedAssignmentEdit />
          </CanAccess>
        ),
      },
    ],
  },
  {
    name: "hub_as_assets.show.maintenance.create",
    path: "maintenance/create",
    element: (
      <CanAccess resource="hub_as_maintenance" action="create" fallback={denied}>
        <AssetNestedMaintenance />
      </CanAccess>
    ),
  },
  {
    name: "hub_as_assets.show.maintenance.show",
    path: "maintenance/show/:mId",
    element: (
      <CanAccess resource="hub_as_maintenance" action="show" fallback={denied}>
        <AssetScopedMaintenanceShow />
      </CanAccess>
    ),
    children: [
      {
        name: "hub_as_assets.show.maintenance.show.edit",
        path: "edit",
        element: (
          <CanAccess resource="hub_as_maintenance" action="edit" fallback={denied}>
            <AssetScopedMaintenanceEdit />
          </CanAccess>
        ),
      },
    ],
  },
];

const assignmentShowChildren: AppRouteDefinition[] = [
  {
    name: "hub_as_assignments.show.edit",
    path: "edit",
    element: (
      <CanAccess resource="hub_as_assignments" action="edit" fallback={denied}>
        <AssignmentEdit />
      </CanAccess>
    ),
  },
];

const maintenanceShowChildren: AppRouteDefinition[] = [
  {
    name: "hub_as_maintenance.show.edit",
    path: "edit",
    element: (
      <CanAccess resource="hub_as_maintenance" action="edit" fallback={denied}>
        <MaintenanceEdit />
      </CanAccess>
    ),
  },
];

const ledgerRoute: AppRouteDefinition = {
  name: "assets-ledger",
  path: assetsRoutes.ledger,
  element: <AssetLedger />,
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
    element: <AssetsLayout />,
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
        element: (
          <CanAccess resource="hub_as_assets" action="create" fallback={denied}>
            <AssetCreate />
          </CanAccess>
        ),
      },
      {
        name: "hub_as_assets.edit",
        path: "edit/:id",
        resourceAction: "edit",
        element: (
          <CanAccess resource="hub_as_assets" action="edit" fallback={denied}>
            <AssetEdit />
          </CanAccess>
        ),
      },
      {
        name: "hub_as_assets.show",
        path: "show/:id",
        resourceAction: "show",
        element: (
          <CanAccess resource="hub_as_assets" action="show" fallback={denied}>
            <AssetShow />
          </CanAccess>
        ),
        children: assetShowChildren,
      },
    ],
  },
  {
    name: "hub_as_assignments",
    path: assetsRoutes.assignments,
    element: <AssignmentsLayout />,
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
        element: (
          <CanAccess
            resource="hub_as_assignments"
            action="create"
            fallback={denied}
          >
            <AssignmentCreate />
          </CanAccess>
        ),
      },
      {
        name: "hub_as_assignments.edit",
        path: "edit/:id",
        resourceAction: "edit",
        element: (
          <CanAccess
            resource="hub_as_assignments"
            action="edit"
            fallback={denied}
          >
            <AssignmentEdit />
          </CanAccess>
        ),
      },
      {
        name: "hub_as_assignments.show",
        path: "show/:id",
        resourceAction: "show",
        element: (
          <CanAccess
            resource="hub_as_assignments"
            action="show"
            fallback={denied}
          >
            <AssignmentShow />
          </CanAccess>
        ),
        children: assignmentShowChildren,
      },
    ],
  },
  {
    name: "hub_as_maintenance",
    path: assetsRoutes.maintenance,
    element: <MaintenanceLayout />,
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
        element: (
          <CanAccess resource="hub_as_maintenance" action="create" fallback={denied}>
            <MaintenanceCreate />
          </CanAccess>
        ),
      },
      {
        name: "hub_as_maintenance.edit",
        path: "edit/:id",
        resourceAction: "edit",
        element: (
          <CanAccess resource="hub_as_maintenance" action="edit" fallback={denied}>
            <MaintenanceEdit />
          </CanAccess>
        ),
      },
      {
        name: "hub_as_maintenance.show",
        path: "show/:id",
        resourceAction: "show",
        element: (
          <CanAccess resource="hub_as_maintenance" action="show" fallback={denied}>
            <MaintenanceShow />
          </CanAccess>
        ),
        children: maintenanceShowChildren,
      },
    ],
  },
  ledgerRoute,
];

export const assetsModule = { routes };

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
  const route = findMaterializedRoute(assetsModule.routes, name);
  if (!route) {
    throw new Error(`Unknown route component: ${name}`);
  }
  return function LazyRouteComponent() {
    return route.element ?? null;
  };
}
