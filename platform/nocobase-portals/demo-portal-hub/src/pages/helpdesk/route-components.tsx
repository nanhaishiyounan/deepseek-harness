import { Gauge, HelpCircle, LifeBuoy, ShieldCheck } from "lucide-react";
import { useParams } from "react-router";

import {
  defineAppRoutes,
  type AppRouteDefinition,
} from "@nocobase/portal-sdk/routing";
import { AccessDenied } from "@/components/access-control/access-denied";
import { CanAccess } from "@/components/access-control/can-access";
import { AgentPerformance } from "./agent-performance";
import { HelpdeskDashboard } from "./dashboard";
import { FaqCreate, FaqEdit, FaqPage } from "./faq";
import { helpdeskRoutes } from "./routes";
import { SlaPolicyCreate, SlaPoliciesLayout, SlaPolicyShow } from "./sla-policies";
import { TicketCreate, TicketEdit } from "./tickets/create-edit";
import { TicketsLayout } from "./tickets/list";
import { ReplyEdit } from "./tickets/replies";
import { TicketShow } from "./tickets/show";
import { TicketStatusChange } from "./tickets/status-change";

const RESOURCE = "hub_hd_tickets";
const REPLIES = "hub_hd_replies";
const denied = <AccessDenied />;

// --- Nested ticket-scoped surfaces (inside the ticket detail drawer) -------

function TicketScopedReplyEdit() {
  const { id } = useParams<{ id: string }>();
  return <ReplyEdit presetTicketId={id} />;
}

const routes: AppRouteDefinition[] = defineAppRoutes([
  {
    name: "helpdesk-dashboard",
    path: helpdeskRoutes.dashboard,
    element: <HelpdeskDashboard />,
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
    element: <TicketsLayout />,
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
        element: (
          <CanAccess resource={RESOURCE} action="create" fallback={denied}>
            <TicketCreate />
          </CanAccess>
        ),
      },
      {
        name: `${RESOURCE}.edit`,
        path: "edit/:id",
        resourceAction: "edit",
        element: (
          <CanAccess resource={RESOURCE} action="edit" fallback={denied}>
            <TicketEdit />
          </CanAccess>
        ),
      },
      {
        name: `${RESOURCE}.show`,
        path: "show/:id",
        resourceAction: "show",
        element: (
          <CanAccess resource={RESOURCE} action="show" fallback={denied}>
            <TicketShow />
          </CanAccess>
        ),
        children: [
          {
            name: `${RESOURCE}.show.edit`,
            path: "edit",
            element: (
              <CanAccess resource={RESOURCE} action="edit" fallback={denied}>
                <TicketEdit returnTo="show" />
              </CanAccess>
            ),
          },
          {
            name: `${RESOURCE}.show.status`,
            path: "status",
            element: (
              <CanAccess resource={RESOURCE} action="edit" fallback={denied}>
                <TicketStatusChange />
              </CanAccess>
            ),
          },
          {
            name: `${RESOURCE}.show.replies.edit`,
            path: "replies/edit/:replyId",
            element: (
              <CanAccess resource={REPLIES} action="edit" fallback={denied}>
                <TicketScopedReplyEdit />
              </CanAccess>
            ),
          },
        ],
      },
    ],
  },
  {
    name: "hd-agents",
    path: helpdeskRoutes.agentPerformance,
    element: <AgentPerformance />,
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
    element: <SlaPoliciesLayout />,
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
        element: <SlaPolicyCreate />,
      },
      {
        name: "hd-sla.show",
        path: "show/:id",
        element: <SlaPolicyShow />,
      },
    ],
  },
  {
    name: "hd-faq",
    path: helpdeskRoutes.faq,
    element: <FaqPage />,
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
        element: <FaqCreate />,
      },
      {
        name: "hd-faq.edit",
        path: "edit/:id",
        element: <FaqEdit />,
      },
    ],
  },
]);

export const helpdeskModule = { routes };

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
  const route = findMaterializedRoute(helpdeskModule.routes, name);
  if (!route) {
    throw new Error(`Unknown route component: ${name}`);
  }
  return function LazyRouteComponent() {
    return route.element ?? null;
  };
}
