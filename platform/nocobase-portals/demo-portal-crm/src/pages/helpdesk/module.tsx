import { Gauge, HelpCircle, LifeBuoy, ShieldCheck } from "lucide-react";

import {
  defineAppRoutes,
  type AppRouteDefinition,
} from "@nocobase/portal-sdk/routing";
import { helpdeskRoutes } from "./routes";

const RESOURCE = "hub_hd_tickets";
const REPLIES = "hub_hd_replies";

const routes: AppRouteDefinition[] = defineAppRoutes([
  {
    name: "helpdesk-dashboard",
    path: helpdeskRoutes.dashboard,
    lazy: () =>
      import("./route-components").then((module) => ({
        default: module.routeComponent("helpdesk-dashboard"),
      })),
    resource: {
      meta: {
        label: "Workload",
        i18nKey: "helpdesk.resources.dashboard",
        i18nOptions: { ns: "starter" },
        descriptionI18nKey: "helpdesk.resources.dashboard.description",
        priority: 61,
        icon: <Gauge />,
        description: "SLA health, queue workload and the priority mix.",
        acl: false,
      },
    },
  },
  {
    name: RESOURCE,
    path: helpdeskRoutes.tickets,
    lazy: () =>
      import("./route-components").then((module) => ({
        default: module.routeComponent(RESOURCE),
      })),
    resource: {
      meta: {
        label: "Helpdesk",
        singularLabel: "Ticket",
        i18nKey: "helpdesk.resources.tickets",
        i18nSingularKey: "helpdesk.resources.ticket",
        i18nOptions: { ns: "starter" },
        descriptionI18nKey: "helpdesk.resources.tickets.description",
        priority: 60,
        icon: <LifeBuoy />,
        description: "Support tickets, priorities and the reply thread.",
        canCreate: true,
        canDelete: true,
        acl: { type: "collection" },
      },
    },
    children: [
      {
        name: `${RESOURCE}.create`,
        path: "create",
        resourceAction: "create",
        lazy: () =>
          import("./route-components").then((module) => ({
            default: module.routeComponent(`${RESOURCE}.create`),
          })),
      },
      {
        name: `${RESOURCE}.edit`,
        path: "edit/:id",
        resourceAction: "edit",
        lazy: () =>
          import("./route-components").then((module) => ({
            default: module.routeComponent(`${RESOURCE}.edit`),
          })),
      },
      {
        name: `${RESOURCE}.show`,
        path: "show/:id",
        resourceAction: "show",
        lazy: () =>
          import("./route-components").then((module) => ({
            default: module.routeComponent(`${RESOURCE}.show`),
          })),
        children: [
          {
            name: `${RESOURCE}.show.edit`,
            path: "edit",
            lazy: () =>
              import("./route-components").then((module) => ({
                default: module.routeComponent(`${RESOURCE}.show.edit`),
              })),
          },
          {
            name: `${RESOURCE}.show.status`,
            path: "status",
            lazy: () =>
              import("./route-components").then((module) => ({
                default: module.routeComponent(`${RESOURCE}.show.status`),
              })),
          },
          {
            name: `${RESOURCE}.show.replies.edit`,
            path: "replies/edit/:replyId",
            lazy: () =>
              import("./route-components").then((module) => ({
                default: module.routeComponent(`${RESOURCE}.show.replies.edit`),
              })),
          },
        ],
      },
    ],
  },
  {
    name: "hd-agents",
    path: helpdeskRoutes.agentPerformance,
    lazy: () =>
      import("./route-components").then((module) => ({
        default: module.routeComponent("hd-agents"),
      })),
    resource: {
      meta: {
        label: "Agent performance",
        i18nKey: "helpdesk.resources.agentPerformance",
        i18nOptions: { ns: "starter" },
        descriptionI18nKey:
          "helpdesk.resources.agentPerformance.description",
        priority: 52,
        icon: <Gauge />,
        description: "Workload, response speed and SLA outcomes by agent.",
        acl: false,
      },
    },
  },
  {
    name: "hd-sla",
    path: helpdeskRoutes.slaPolicies,
    lazy: () =>
      import("./route-components").then((module) => ({
        default: module.routeComponent("hd-sla"),
      })),
    resource: {
      meta: {
        label: "SLA policies",
        i18nKey: "helpdesk.resources.slaPolicies",
        i18nOptions: { ns: "starter" },
        descriptionI18nKey: "helpdesk.resources.slaPolicies.description",
        priority: 52,
        icon: <ShieldCheck />,
        description: "Response and resolution targets by priority.",
        acl: false,
      },
    },
    children: [
      {
        name: "hd-sla.create",
        path: "create",
        lazy: () =>
          import("./route-components").then((module) => ({
            default: module.routeComponent("hd-sla.create"),
          })),
      },
      {
        name: "hd-sla.show",
        path: "show/:id",
        lazy: () =>
          import("./route-components").then((module) => ({
            default: module.routeComponent("hd-sla.show"),
          })),
      },
    ],
  },
  {
    name: "hd-faq",
    path: helpdeskRoutes.faq,
    lazy: () =>
      import("./route-components").then((module) => ({
        default: module.routeComponent("hd-faq"),
      })),
    resource: {
      meta: {
        label: "FAQ",
        i18nKey: "helpdesk.resources.faq",
        i18nOptions: { ns: "starter" },
        descriptionI18nKey: "helpdesk.resources.faq.description",
        priority: 51,
        icon: <HelpCircle />,
        description: "Self-service answers to common IT and support questions.",
        acl: false,
      },
    },
    children: [
      {
        name: "hd-faq.create",
        path: "create",
        lazy: () =>
          import("./route-components").then((module) => ({
            default: module.routeComponent("hd-faq.create"),
          })),
      },
      {
        name: "hd-faq.edit",
        path: "edit/:id",
        lazy: () =>
          import("./route-components").then((module) => ({
            default: module.routeComponent("hd-faq.edit"),
          })),
      },
    ],
  },
]);

export const helpdeskModule = { routes };
