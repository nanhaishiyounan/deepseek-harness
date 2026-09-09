import {
  CalendarCheck,
  CalendarDays,
  Network,
  UserPlus,
  Users,
} from "lucide-react";

import {
  defineAppRoutes,
  type AppRouteDefinition,
} from "@nocobase/portal-sdk/routing";
import { hrRoutes } from "@/pages/hr/routes";

function makeLeaveShowChildren(prefix: string): AppRouteDefinition[] {
  return [
    {
      name: `${prefix}.edit`,
      path: "edit",
      lazy: () =>
        import("./route-components").then((module) => ({
          default: module.routeComponent(`${prefix}.edit`),
        })),
    },
  ];
}

function makeEmployeeLeaveChildren(
  prefix: string,
  _empParam: string
): AppRouteDefinition[] {
  return [
    {
      name: `${prefix}.leave.create`,
      path: "leave/create",
      lazy: () =>
        import("./route-components").then((module) => ({
          default: module.routeComponent(`${prefix}.leave.create`),
        })),
    },
    {
      name: `${prefix}.leave.show`,
      path: "leave/show/:leaveId",
      lazy: () =>
        import("./route-components").then((module) => ({
          default: module.routeComponent(`${prefix}.leave.show`),
        })),
      children: makeLeaveShowChildren(`${prefix}.leave.show`),
    },
    {
      name: `${prefix}.leave.edit`,
      path: "leave/edit/:leaveId",
      lazy: () =>
        import("./route-components").then((module) => ({
          default: module.routeComponent(`${prefix}.leave.edit`),
        })),
    },
  ];
}

const employeeShowChildren: AppRouteDefinition[] = [
  {
    name: "hub_hr_employees.show.edit",
    path: "edit",
    lazy: () =>
      import("./route-components").then((module) => ({
        default: module.routeComponent("hub_hr_employees.show.edit"),
      })),
  },
  ...makeEmployeeLeaveChildren("hub_hr_employees.show", "id"),
];

// One level deeper: from a department drawer, an employee row opens a nested
// employee *show* drawer, which carries its own edit + leave sub-surfaces.
const departmentEmployeeShowChildren: AppRouteDefinition[] = [
  {
    name: "hub_hr_departments.show.employee.edit",
    path: "edit",
    lazy: () =>
      import("./route-components").then((module) => ({
        default: module.routeComponent("hub_hr_departments.show.employee.edit"),
      })),
  },
  ...makeEmployeeLeaveChildren("hub_hr_departments.show.employee", "empId"),
];

const departmentShowChildren: AppRouteDefinition[] = [
  {
    name: "hub_hr_departments.show.edit",
    path: "edit",
    lazy: () =>
      import("./route-components").then((module) => ({
        default: module.routeComponent("hub_hr_departments.show.edit"),
      })),
  },
  {
    name: "hub_hr_departments.show.employee.show",
    path: "employees/show/:empId",
    lazy: () =>
      import("./route-components").then((module) => ({
        default: module.routeComponent("hub_hr_departments.show.employee.show"),
      })),
    children: departmentEmployeeShowChildren,
  },
];

const leaveShowChildren: AppRouteDefinition[] = [
  {
    name: "hub_hr_leave_requests.show.edit",
    path: "edit",
    lazy: () =>
      import("./route-components").then((module) => ({
        default: module.routeComponent("hub_hr_leave_requests.show.edit"),
      })),
  },
];

const routes: AppRouteDefinition[] = defineAppRoutes([
  {
    name: "hub_hr_employees",
    path: hrRoutes.employees,
    lazy: () =>
      import("./route-components").then((module) => ({
        default: module.routeComponent("hub_hr_employees"),
      })),
    resource: {
      meta: {
        label: "Employees",
        singularLabel: "Employee",
        i18nKey: "hr.resources.employees",
        i18nSingularKey: "hr.resources.employee",
        i18nOptions: { ns: "starter" },
        descriptionI18nKey: "hr.resources.employees.description",
        priority: 10,
        icon: <Users />,
        description:
          "The people directory — profiles, reporting lines and leave.",
        canCreate: true,
        canDelete: true,
        acl: { type: "collection" },
      },
    },
    children: [
      {
        name: "hub_hr_employees.create",
        path: "create",
        resourceAction: "create",
        lazy: () =>
          import("./route-components").then((module) => ({
            default: module.routeComponent("hub_hr_employees.create"),
          })),
      },
      {
        name: "hub_hr_employees.edit",
        path: "edit/:id",
        resourceAction: "edit",
        lazy: () =>
          import("./route-components").then((module) => ({
            default: module.routeComponent("hub_hr_employees.edit"),
          })),
      },
      {
        name: "hub_hr_employees.show",
        path: "show/:id",
        resourceAction: "show",
        lazy: () =>
          import("./route-components").then((module) => ({
            default: module.routeComponent("hub_hr_employees.show"),
          })),
        children: employeeShowChildren,
      },
    ],
  },
  {
    name: "hub_hr_departments",
    path: hrRoutes.departments,
    lazy: () =>
      import("./route-components").then((module) => ({
        default: module.routeComponent("hub_hr_departments"),
      })),
    resource: {
      meta: {
        label: "Departments",
        singularLabel: "Department",
        i18nKey: "hr.resources.departments",
        i18nSingularKey: "hr.resources.department",
        i18nOptions: { ns: "starter" },
        descriptionI18nKey: "hr.resources.departments.description",
        priority: 11,
        icon: <Network />,
        description: "The org structure as a team tree.",
        canCreate: true,
        canDelete: true,
        acl: { type: "collection" },
      },
    },
    children: [
      {
        name: "hub_hr_departments.create",
        path: "create",
        resourceAction: "create",
        lazy: () =>
          import("./route-components").then((module) => ({
            default: module.routeComponent("hub_hr_departments.create"),
          })),
      },
      {
        name: "hub_hr_departments.edit",
        path: "edit/:id",
        resourceAction: "edit",
        lazy: () =>
          import("./route-components").then((module) => ({
            default: module.routeComponent("hub_hr_departments.edit"),
          })),
      },
      {
        name: "hub_hr_departments.show",
        path: "show/:id",
        resourceAction: "show",
        lazy: () =>
          import("./route-components").then((module) => ({
            default: module.routeComponent("hub_hr_departments.show"),
          })),
        children: departmentShowChildren,
      },
    ],
  },
  {
    name: "hub_hr_leave_requests",
    path: hrRoutes.leave,
    lazy: () =>
      import("./route-components").then((module) => ({
        default: module.routeComponent("hub_hr_leave_requests"),
      })),
    resource: {
      meta: {
        label: "Leave approvals",
        singularLabel: "Leave request",
        i18nKey: "hr.resources.leave",
        i18nSingularKey: "hr.resources.leaveRequest",
        i18nOptions: { ns: "starter" },
        descriptionI18nKey: "hr.resources.leave.description",
        priority: 12,
        icon: <CalendarCheck />,
        description: "Review time-off requests and approve or reject them.",
        canCreate: true,
        canDelete: true,
        acl: { type: "collection" },
      },
    },
    children: [
      {
        name: "hub_hr_leave_requests.create",
        path: "create",
        resourceAction: "create",
        lazy: () =>
          import("./route-components").then((module) => ({
            default: module.routeComponent("hub_hr_leave_requests.create"),
          })),
      },
      {
        name: "hub_hr_leave_requests.edit",
        path: "edit/:id",
        resourceAction: "edit",
        lazy: () =>
          import("./route-components").then((module) => ({
            default: module.routeComponent("hub_hr_leave_requests.edit"),
          })),
      },
      {
        name: "hub_hr_leave_requests.show",
        path: "show/:id",
        resourceAction: "show",
        lazy: () =>
          import("./route-components").then((module) => ({
            default: module.routeComponent("hub_hr_leave_requests.show"),
          })),
        children: leaveShowChildren,
      },
    ],
  },
  {
    name: "hr-org-chart",
    path: hrRoutes.orgChart,
    lazy: () =>
      import("./route-components").then((module) => ({
        default: module.routeComponent("hr-org-chart"),
      })),
    resource: {
      meta: {
        label: "Org chart",
        i18nKey: "hr.resources.orgChart",
        i18nOptions: { ns: "starter" },
        descriptionI18nKey: "hr.resources.orgChart.description",
        priority: 50,
        icon: <Network />,
        description: "Reporting lines by department, as a visual tree.",
        acl: false,
      },
    },
  },
  {
    name: "hr-leave-calendar",
    path: hrRoutes.leaveCalendar,
    lazy: () =>
      import("./route-components").then((module) => ({
        default: module.routeComponent("hr-leave-calendar"),
      })),
    resource: {
      meta: {
        label: "Leave calendar",
        i18nKey: "hr.resources.leaveCalendar",
        i18nOptions: { ns: "starter" },
        descriptionI18nKey: "hr.resources.leaveCalendar.description",
        priority: 51,
        icon: <CalendarDays />,
        description: "A month view of who's off and when.",
        acl: false,
      },
    },
  },
  {
    name: "hr-lifecycle",
    path: hrRoutes.lifecycle,
    lazy: () =>
      import("./route-components").then((module) => ({
        default: module.routeComponent("hr-lifecycle"),
      })),
    resource: {
      meta: {
        label: "Joiners & leavers",
        i18nKey: "hr.resources.lifecycle",
        i18nOptions: { ns: "starter" },
        descriptionI18nKey: "hr.resources.lifecycle.description",
        priority: 52,
        icon: <UserPlus />,
        description: "Onboarding progress for new hires, plus who has left.",
        acl: false,
      },
    },
  },
]);

export const hrModule = { routes };
