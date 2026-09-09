import { CalendarDays, Flag, FolderKanban, Gauge, ListChecks, SquareKanban } from "lucide-react";
import { useParams } from "react-router";

import {
  defineAppRoutes,
  type AppRouteDefinition,
} from "@nocobase/portal-sdk/routing";
import { AccessDenied } from "@/components/access-control/access-denied";
import { CanAccess } from "@/components/access-control/can-access";
import { ProjectCalendarPage } from "@/pages/projects/calendar";
import { MilestonesLayout } from "@/pages/projects/milestones/list";
import { MilestoneCreate, MilestoneEdit } from "@/pages/projects/milestones/form";
import { MilestoneShow } from "@/pages/projects/milestones/show";
import { MyTasksPage } from "@/pages/projects/my-tasks";
import { ProjectsLayout } from "@/pages/projects/projects/list";
import { ProjectCreate, ProjectEdit } from "@/pages/projects/projects/form";
import { ProjectShow } from "@/pages/projects/projects/show";
import { projectRoutes } from "@/pages/projects/routes";
import { WorkloadPage } from "@/pages/projects/workload";
import { TaskBoardPage } from "@/pages/projects/tasks/board";
import { ChecklistCreate, ChecklistEdit } from "@/pages/projects/tasks/checklist";
import { TaskCreate, TaskEdit } from "@/pages/projects/tasks/form";
import { TaskShow } from "@/pages/projects/tasks/show";

const denied = <AccessDenied />;

// --- Nested project-scoped surfaces (inside the project detail drawer) ------

function ProjectScopedTaskCreate() {
  const { id } = useParams<{ id: string }>();
  return <TaskCreate presetProjectId={id} />;
}

function ProjectScopedTaskEdit() {
  const { id } = useParams<{ id: string }>();
  return <TaskEdit presetProjectId={id} idParam="taskId" />;
}

function ProjectScopedMilestoneCreate() {
  const { id } = useParams<{ id: string }>();
  return <MilestoneCreate presetProjectId={id} />;
}

function ProjectScopedMilestoneEdit() {
  const { id } = useParams<{ id: string }>();
  return <MilestoneEdit presetProjectId={id} idParam="msId" />;
}

// --- Nested task-scoped surfaces (inside the task detail drawer) -----------

function TaskScopedChecklistCreate() {
  const { id } = useParams<{ id: string }>();
  return <ChecklistCreate presetTaskId={id} />;
}

function TaskScopedChecklistEdit() {
  const { id } = useParams<{ id: string }>();
  return <ChecklistEdit presetTaskId={id} />;
}

const taskShowChildren: AppRouteDefinition[] = [
  {
    name: "hub_pj_tasks.show.edit",
    path: "edit",
    element: (
      <CanAccess resource="hub_pj_tasks" action="edit" fallback={denied}>
        <TaskEdit />
      </CanAccess>
    ),
  },
  {
    name: "hub_pj_tasks.show.checklist.create",
    path: "checklist/create",
    element: (
      <CanAccess resource="hub_pj_checklist" action="create" fallback={denied}>
        <TaskScopedChecklistCreate />
      </CanAccess>
    ),
  },
  {
    name: "hub_pj_tasks.show.checklist.edit",
    path: "checklist/edit/:itemId",
    element: (
      <CanAccess resource="hub_pj_checklist" action="edit" fallback={denied}>
        <TaskScopedChecklistEdit />
      </CanAccess>
    ),
  },
];

const milestoneShowChildren: AppRouteDefinition[] = [
  {
    name: "hub_pj_milestones.show.edit",
    path: "edit",
    element: (
      <CanAccess resource="hub_pj_milestones" action="edit" fallback={denied}>
        <MilestoneEdit />
      </CanAccess>
    ),
  },
];

const projectShowChildren: AppRouteDefinition[] = [
  {
    name: "hub_pj_projects.show.edit",
    path: "edit",
    element: (
      <CanAccess resource="hub_pj_projects" action="edit" fallback={denied}>
        <ProjectEdit />
      </CanAccess>
    ),
  },
  {
    name: "hub_pj_projects.show.tasks.create",
    path: "tasks/create",
    element: (
      <CanAccess resource="hub_pj_tasks" action="create" fallback={denied}>
        <ProjectScopedTaskCreate />
      </CanAccess>
    ),
  },
  {
    name: "hub_pj_projects.show.tasks.edit",
    path: "tasks/edit/:taskId",
    element: (
      <CanAccess resource="hub_pj_tasks" action="edit" fallback={denied}>
        <ProjectScopedTaskEdit />
      </CanAccess>
    ),
  },
  {
    name: "hub_pj_projects.show.milestones.create",
    path: "milestones/create",
    element: (
      <CanAccess resource="hub_pj_milestones" action="create" fallback={denied}>
        <ProjectScopedMilestoneCreate />
      </CanAccess>
    ),
  },
  {
    name: "hub_pj_projects.show.milestones.edit",
    path: "milestones/edit/:msId",
    element: (
      <CanAccess resource="hub_pj_milestones" action="edit" fallback={denied}>
        <ProjectScopedMilestoneEdit />
      </CanAccess>
    ),
  },
];

export const projectsModule = {
  routes: defineAppRoutes([
    {
      name: "hub_pj_projects",
      path: projectRoutes.projects,
      element: <ProjectsLayout />,
      resource: {
        meta: {
          label: "Projects",
          singularLabel: "Project",
          i18nKey: "projects.resources.projects",
          i18nSingularKey: "projects.resources.project",
          i18nOptions: { ns: "starter" },
          descriptionI18nKey: "projects.resources.projects.description",
          priority: 10,
          icon: <FolderKanban />,
          description: "Projects, their tasks and delivery milestones.",
          canCreate: true,
          canDelete: true,
          acl: { type: "collection" },
        },
      },
      children: [
        {
          name: "hub_pj_projects.create",
          path: "create",
          resourceAction: "create",
          element: (
            <CanAccess resource="hub_pj_projects" action="create" fallback={denied}>
              <ProjectCreate />
            </CanAccess>
          ),
        },
        {
          name: "hub_pj_projects.edit",
          path: "edit/:id",
          resourceAction: "edit",
          element: (
            <CanAccess resource="hub_pj_projects" action="edit" fallback={denied}>
              <ProjectEdit />
            </CanAccess>
          ),
        },
        {
          name: "hub_pj_projects.show",
          path: "show/:id",
          resourceAction: "show",
          element: (
            <CanAccess resource="hub_pj_projects" action="show" fallback={denied}>
              <ProjectShow />
            </CanAccess>
          ),
          children: projectShowChildren,
        },
      ],
    },
    {
      name: "hub_pj_tasks",
      path: projectRoutes.tasks,
      element: (
        <CanAccess resource="hub_pj_tasks" action="list" fallback={denied}>
          <TaskBoardPage />
        </CanAccess>
      ),
      resource: {
        meta: {
          label: "Task board",
          singularLabel: "Task",
          i18nKey: "projects.resources.tasks",
          i18nSingularKey: "projects.resources.task",
          i18nOptions: { ns: "starter" },
          descriptionI18nKey: "projects.resources.tasks.description",
          priority: 11,
          icon: <SquareKanban />,
          description: "A kanban board of every task by status.",
          canCreate: true,
          acl: { type: "collection" },
        },
      },
      children: [
        {
          name: "hub_pj_tasks.create",
          path: "create",
          resourceAction: "create",
          element: (
            <CanAccess resource="hub_pj_tasks" action="create" fallback={denied}>
              <TaskCreate />
            </CanAccess>
          ),
        },
        {
          name: "hub_pj_tasks.edit",
          path: "edit/:id",
          resourceAction: "edit",
          element: (
            <CanAccess resource="hub_pj_tasks" action="edit" fallback={denied}>
              <TaskEdit />
            </CanAccess>
          ),
        },
        {
          name: "hub_pj_tasks.show",
          path: "show/:id",
          resourceAction: "show",
          element: (
            <CanAccess resource="hub_pj_tasks" action="show" fallback={denied}>
              <TaskShow />
            </CanAccess>
          ),
          children: taskShowChildren,
        },
      ],
    },
    {
      name: "hub_pj_milestones",
      path: projectRoutes.milestones,
      element: <MilestonesLayout />,
      resource: {
        meta: {
          label: "Milestones",
          singularLabel: "Milestone",
          i18nKey: "projects.resources.milestones",
          i18nSingularKey: "projects.resources.milestone",
          i18nOptions: { ns: "starter" },
          descriptionI18nKey: "projects.resources.milestones.description",
          priority: 12,
          icon: <Flag />,
          description: "Key dates across all projects.",
          canCreate: true,
          canDelete: true,
          acl: { type: "collection" },
        },
      },
      children: [
        {
          name: "hub_pj_milestones.create",
          path: "create",
          resourceAction: "create",
          element: (
            <CanAccess resource="hub_pj_milestones" action="create" fallback={denied}>
              <MilestoneCreate />
            </CanAccess>
          ),
        },
        {
          name: "hub_pj_milestones.edit",
          path: "edit/:id",
          resourceAction: "edit",
          element: (
            <CanAccess resource="hub_pj_milestones" action="edit" fallback={denied}>
              <MilestoneEdit />
            </CanAccess>
          ),
        },
        {
          name: "hub_pj_milestones.show",
          path: "show/:id",
          resourceAction: "show",
          element: (
            <CanAccess resource="hub_pj_milestones" action="show" fallback={denied}>
              <MilestoneShow />
            </CanAccess>
          ),
          children: milestoneShowChildren,
        },
      ],
    },
    {
      name: "projects-my-tasks",
      path: projectRoutes.myTasks,
      element: <MyTasksPage />,
      resource: {
        meta: {
          label: "My tasks",
          i18nKey: "projects.resources.myTasks",
          i18nOptions: { ns: "starter" },
          descriptionI18nKey: "projects.resources.myTasks.description",
          priority: 50,
          icon: <ListChecks />,
          description: "Tasks assigned to you, grouped by status.",
          acl: false,
        },
      },
    },
    {
      name: "projects-calendar",
      path: projectRoutes.projectCalendar,
      element: <ProjectCalendarPage />,
      resource: {
        meta: {
          label: "Calendar",
          i18nKey: "projects.resources.calendar",
          i18nOptions: { ns: "starter" },
          descriptionI18nKey: "projects.resources.calendar.description",
          priority: 51,
          icon: <CalendarDays />,
          description: "Month view of task due dates and project milestones.",
          acl: false,
        },
      },
    },
    {
      name: "projects-workload",
      path: projectRoutes.workload,
      element: <WorkloadPage />,
      resource: {
        meta: {
          label: "Resource load",
          i18nKey: "projects.resources.workload",
          i18nOptions: { ns: "starter" },
          descriptionI18nKey: "projects.resources.workload.description",
          priority: 52,
          icon: <Gauge />,
          description: "Open work per person, with overdue pressure highlighted.",
          acl: false,
        },
      },
    },
  ]),
};

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
  const route = findMaterializedRoute(projectsModule.routes, name);
  if (!route) {
    throw new Error(`Unknown route component: ${name}`);
  }
  return function LazyRouteComponent() {
    return route.element ?? null;
  };
}
