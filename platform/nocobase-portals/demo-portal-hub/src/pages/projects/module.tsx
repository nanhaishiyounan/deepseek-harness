import { CalendarDays, Flag, FolderKanban, Gauge, ListChecks, SquareKanban } from "lucide-react";

import {
  defineAppRoutes,
  type AppRouteDefinition,
} from "@nocobase/portal-sdk/routing";
import { projectRoutes } from "@/pages/projects/routes";

const taskShowChildren: AppRouteDefinition[] = [
  {
    name: "hub_pj_tasks.show.edit",
    path: "edit",
    lazy: () =>
      import("./route-components").then((module) => ({
        default: module.routeComponent("hub_pj_tasks.show.edit"),
      })),
  },
  {
    name: "hub_pj_tasks.show.checklist.create",
    path: "checklist/create",
    lazy: () =>
      import("./route-components").then((module) => ({
        default: module.routeComponent("hub_pj_tasks.show.checklist.create"),
      })),
  },
  {
    name: "hub_pj_tasks.show.checklist.edit",
    path: "checklist/edit/:itemId",
    lazy: () =>
      import("./route-components").then((module) => ({
        default: module.routeComponent("hub_pj_tasks.show.checklist.edit"),
      })),
  },
];

const milestoneShowChildren: AppRouteDefinition[] = [
  {
    name: "hub_pj_milestones.show.edit",
    path: "edit",
    lazy: () =>
      import("./route-components").then((module) => ({
        default: module.routeComponent("hub_pj_milestones.show.edit"),
      })),
  },
];

const projectShowChildren: AppRouteDefinition[] = [
  {
    name: "hub_pj_projects.show.edit",
    path: "edit",
    lazy: () =>
      import("./route-components").then((module) => ({
        default: module.routeComponent("hub_pj_projects.show.edit"),
      })),
  },
  {
    name: "hub_pj_projects.show.tasks.create",
    path: "tasks/create",
    lazy: () =>
      import("./route-components").then((module) => ({
        default: module.routeComponent("hub_pj_projects.show.tasks.create"),
      })),
  },
  {
    name: "hub_pj_projects.show.tasks.edit",
    path: "tasks/edit/:taskId",
    lazy: () =>
      import("./route-components").then((module) => ({
        default: module.routeComponent("hub_pj_projects.show.tasks.edit"),
      })),
  },
  {
    name: "hub_pj_projects.show.milestones.create",
    path: "milestones/create",
    lazy: () =>
      import("./route-components").then((module) => ({
        default: module.routeComponent("hub_pj_projects.show.milestones.create"),
      })),
  },
  {
    name: "hub_pj_projects.show.milestones.edit",
    path: "milestones/edit/:msId",
    lazy: () =>
      import("./route-components").then((module) => ({
        default: module.routeComponent("hub_pj_projects.show.milestones.edit"),
      })),
  },
];

export const projectsModule = {
  routes: defineAppRoutes([
    {
      name: "hub_pj_projects",
      path: projectRoutes.projects,
      lazy: () =>
        import("./route-components").then((module) => ({
          default: module.routeComponent("hub_pj_projects"),
        })),
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
          lazy: () =>
            import("./route-components").then((module) => ({
              default: module.routeComponent("hub_pj_projects.create"),
            })),
        },
        {
          name: "hub_pj_projects.edit",
          path: "edit/:id",
          resourceAction: "edit",
          lazy: () =>
            import("./route-components").then((module) => ({
              default: module.routeComponent("hub_pj_projects.edit"),
            })),
        },
        {
          name: "hub_pj_projects.show",
          path: "show/:id",
          resourceAction: "show",
          lazy: () =>
            import("./route-components").then((module) => ({
              default: module.routeComponent("hub_pj_projects.show"),
            })),
          children: projectShowChildren,
        },
      ],
    },
    {
      name: "hub_pj_tasks",
      path: projectRoutes.tasks,
      lazy: () =>
        import("./route-components").then((module) => ({
          default: module.routeComponent("hub_pj_tasks"),
        })),
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
          lazy: () =>
            import("./route-components").then((module) => ({
              default: module.routeComponent("hub_pj_tasks.create"),
            })),
        },
        {
          name: "hub_pj_tasks.edit",
          path: "edit/:id",
          resourceAction: "edit",
          lazy: () =>
            import("./route-components").then((module) => ({
              default: module.routeComponent("hub_pj_tasks.edit"),
            })),
        },
        {
          name: "hub_pj_tasks.show",
          path: "show/:id",
          resourceAction: "show",
          lazy: () =>
            import("./route-components").then((module) => ({
              default: module.routeComponent("hub_pj_tasks.show"),
            })),
          children: taskShowChildren,
        },
      ],
    },
    {
      name: "hub_pj_milestones",
      path: projectRoutes.milestones,
      lazy: () =>
        import("./route-components").then((module) => ({
          default: module.routeComponent("hub_pj_milestones"),
        })),
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
          lazy: () =>
            import("./route-components").then((module) => ({
              default: module.routeComponent("hub_pj_milestones.create"),
            })),
        },
        {
          name: "hub_pj_milestones.edit",
          path: "edit/:id",
          resourceAction: "edit",
          lazy: () =>
            import("./route-components").then((module) => ({
              default: module.routeComponent("hub_pj_milestones.edit"),
            })),
        },
        {
          name: "hub_pj_milestones.show",
          path: "show/:id",
          resourceAction: "show",
          lazy: () =>
            import("./route-components").then((module) => ({
              default: module.routeComponent("hub_pj_milestones.show"),
            })),
          children: milestoneShowChildren,
        },
      ],
    },
    {
      name: "projects-my-tasks",
      path: projectRoutes.myTasks,
      lazy: () =>
        import("./route-components").then((module) => ({
          default: module.routeComponent("projects-my-tasks"),
        })),
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
      lazy: () =>
        import("./route-components").then((module) => ({
          default: module.routeComponent("projects-calendar"),
        })),
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
      lazy: () =>
        import("./route-components").then((module) => ({
          default: module.routeComponent("projects-workload"),
        })),
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
