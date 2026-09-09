import {
  CalendarCheck,
  CalendarDays,
  Network,
  UserPlus,
  Users,
} from "lucide-react";
import { useParams } from "react-router";

import {
  defineAppRoutes,
  type AppRouteDefinition,
} from "@nocobase/portal-sdk/routing";
import { AccessDenied } from "@/components/access-control/access-denied";
import { CanAccess } from "@/components/access-control/can-access";
import {
  DepartmentCreate,
  DepartmentEdit,
} from "@/pages/hr/departments/create-edit";
import { DepartmentsLayout } from "@/pages/hr/departments/tree";
import { DepartmentShow } from "@/pages/hr/departments/show";
import { EmployeeCreate, EmployeeEdit } from "@/pages/hr/employees/create-edit";
import { EmployeesLayout } from "@/pages/hr/employees/list";
import { EmployeeShow } from "@/pages/hr/employees/show";
import { LeaveCreate, LeaveEdit } from "@/pages/hr/leave/create-edit";
import { LeaveLayout } from "@/pages/hr/leave/list";
import { LeaveShow } from "@/pages/hr/leave/show";
import { LeaveCalendarPage } from "@/pages/hr/leave-calendar";
import { LifecyclePage } from "@/pages/hr/lifecycle";
import { OrgChartPage } from "@/pages/hr/org-chart";
import { hrRoutes } from "@/pages/hr/routes";

const denied = <AccessDenied />;

// Leave entries opened from inside an employee drawer: preset the employee
// (read from whichever route param carries the employee id) and return to
// that employee's detail drawer on close (contextual nav state).
function ScopedLeaveCreate({ empParam }: { empParam: string }) {
  const params = useParams();
  return <LeaveCreate presetEmployeeId={params[empParam]} />;
}

// A nested leave *show* drawer (opened from a leave row inside an employee
// drawer) can itself open an edit drawer one level deeper.
function makeLeaveShowChildren(prefix: string): AppRouteDefinition[] {
  return [
    {
      name: `${prefix}.edit`,
      path: "edit",
      element: (
        <CanAccess resource="hub_hr_leave_requests" action="edit" fallback={denied}>
          <LeaveEdit idParam="leaveId" />
        </CanAccess>
      ),
    },
  ];
}

// Leave sub-surfaces that live inside an employee detail drawer. `empParam` is
// the route param carrying the employee id at this depth (`id` at top level,
// `empId` when the employee drawer is itself nested under a department).
function makeEmployeeLeaveChildren(
  prefix: string,
  empParam: string
): AppRouteDefinition[] {
  return [
    {
      name: `${prefix}.leave.create`,
      path: "leave/create",
      element: (
        <CanAccess resource="hub_hr_leave_requests" action="create" fallback={denied}>
          <ScopedLeaveCreate empParam={empParam} />
        </CanAccess>
      ),
    },
    {
      name: `${prefix}.leave.show`,
      path: "leave/show/:leaveId",
      element: (
        <CanAccess resource="hub_hr_leave_requests" action="show" fallback={denied}>
          <LeaveShow idParam="leaveId" />
        </CanAccess>
      ),
      children: makeLeaveShowChildren(`${prefix}.leave.show`),
    },
    {
      name: `${prefix}.leave.edit`,
      path: "leave/edit/:leaveId",
      element: (
        <CanAccess resource="hub_hr_leave_requests" action="edit" fallback={denied}>
          <LeaveEdit idParam="leaveId" />
        </CanAccess>
      ),
    },
  ];
}

const employeeShowChildren: AppRouteDefinition[] = [
  {
    name: "hub_hr_employees.show.edit",
    path: "edit",
    element: (
      <CanAccess resource="hub_hr_employees" action="edit" fallback={denied}>
        <EmployeeEdit />
      </CanAccess>
    ),
  },
  ...makeEmployeeLeaveChildren("hub_hr_employees.show", "id"),
];

// One level deeper: from a department drawer, an employee row opens a nested
// employee *show* drawer, which carries its own edit + leave sub-surfaces.
const departmentEmployeeShowChildren: AppRouteDefinition[] = [
  {
    name: "hub_hr_departments.show.employee.edit",
    path: "edit",
    element: (
      <CanAccess resource="hub_hr_employees" action="edit" fallback={denied}>
        <EmployeeEdit idParam="empId" />
      </CanAccess>
    ),
  },
  ...makeEmployeeLeaveChildren("hub_hr_departments.show.employee", "empId"),
];

const departmentShowChildren: AppRouteDefinition[] = [
  {
    name: "hub_hr_departments.show.edit",
    path: "edit",
    element: (
      <CanAccess resource="hub_hr_departments" action="edit" fallback={denied}>
        <DepartmentEdit />
      </CanAccess>
    ),
  },
  {
    name: "hub_hr_departments.show.employee.show",
    path: "employees/show/:empId",
    element: (
      <CanAccess resource="hub_hr_employees" action="show" fallback={denied}>
        <EmployeeShow idParam="empId" />
      </CanAccess>
    ),
    children: departmentEmployeeShowChildren,
  },
];

const leaveShowChildren: AppRouteDefinition[] = [
  {
    name: "hub_hr_leave_requests.show.edit",
    path: "edit",
    element: (
      <CanAccess resource="hub_hr_leave_requests" action="edit" fallback={denied}>
        <LeaveEdit />
      </CanAccess>
    ),
  },
];

const routes: AppRouteDefinition[] = defineAppRoutes([
  {
    name: "hub_hr_employees",
    path: hrRoutes.employees,
    element: <EmployeesLayout />,
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
        element: (
          <CanAccess resource="hub_hr_employees" action="create" fallback={denied}>
            <EmployeeCreate />
          </CanAccess>
        ),
      },
      {
        name: "hub_hr_employees.edit",
        path: "edit/:id",
        resourceAction: "edit",
        element: (
          <CanAccess resource="hub_hr_employees" action="edit" fallback={denied}>
            <EmployeeEdit />
          </CanAccess>
        ),
      },
      {
        name: "hub_hr_employees.show",
        path: "show/:id",
        resourceAction: "show",
        element: (
          <CanAccess resource="hub_hr_employees" action="show" fallback={denied}>
            <EmployeeShow />
          </CanAccess>
        ),
        children: employeeShowChildren,
      },
    ],
  },
  {
    name: "hub_hr_departments",
    path: hrRoutes.departments,
    element: <DepartmentsLayout />,
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
        element: (
          <CanAccess resource="hub_hr_departments" action="create" fallback={denied}>
            <DepartmentCreate />
          </CanAccess>
        ),
      },
      {
        name: "hub_hr_departments.edit",
        path: "edit/:id",
        resourceAction: "edit",
        element: (
          <CanAccess resource="hub_hr_departments" action="edit" fallback={denied}>
            <DepartmentEdit />
          </CanAccess>
        ),
      },
      {
        name: "hub_hr_departments.show",
        path: "show/:id",
        resourceAction: "show",
        element: (
          <CanAccess resource="hub_hr_departments" action="show" fallback={denied}>
            <DepartmentShow />
          </CanAccess>
        ),
        children: departmentShowChildren,
      },
    ],
  },
  {
    name: "hub_hr_leave_requests",
    path: hrRoutes.leave,
    element: <LeaveLayout />,
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
        element: (
          <CanAccess resource="hub_hr_leave_requests" action="create" fallback={denied}>
            <LeaveCreate />
          </CanAccess>
        ),
      },
      {
        name: "hub_hr_leave_requests.edit",
        path: "edit/:id",
        resourceAction: "edit",
        element: (
          <CanAccess resource="hub_hr_leave_requests" action="edit" fallback={denied}>
            <LeaveEdit />
          </CanAccess>
        ),
      },
      {
        name: "hub_hr_leave_requests.show",
        path: "show/:id",
        resourceAction: "show",
        element: (
          <CanAccess resource="hub_hr_leave_requests" action="show" fallback={denied}>
            <LeaveShow />
          </CanAccess>
        ),
        children: leaveShowChildren,
      },
    ],
  },
  {
    name: "hr-org-chart",
    path: hrRoutes.orgChart,
    element: <OrgChartPage />,
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
    element: <LeaveCalendarPage />,
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
    element: <LifecyclePage />,
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
  const route = findMaterializedRoute(hrModule.routes, name);
  if (!route) {
    throw new Error(`Unknown route component: ${name}`);
  }
  return function LazyRouteComponent() {
    return route.element ?? null;
  };
}
