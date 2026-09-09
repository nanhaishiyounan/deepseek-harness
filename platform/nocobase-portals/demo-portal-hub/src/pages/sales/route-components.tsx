import {
  Activity,
  Building2,
  CalendarDays,
  Contact,
  TrendingUp,
  UserPlus,
  Workflow,
} from "lucide-react";
import { useParams } from "react-router";

import {
  defineAppRoutes,
  type AppRouteDefinition,
} from "@nocobase/portal-sdk/routing";
import { AccessDenied } from "@/components/access-control/access-denied";
import { CanAccess } from "@/components/access-control/can-access";
import { ActivityCreate, ActivityEdit } from "@/pages/sales/activities/form";
import { ActivitiesLayout } from "@/pages/sales/activities/list";
import { ActivityShow } from "@/pages/sales/activities/show";
import { AccountCreate, AccountEdit } from "@/pages/sales/accounts/form";
import { AccountsLayout } from "@/pages/sales/accounts/list";
import { AccountShow } from "@/pages/sales/accounts/show";
import { ContactCreate, ContactEdit } from "@/pages/sales/contacts/form";
import { ContactsLayout } from "@/pages/sales/contacts/list";
import { ContactShow } from "@/pages/sales/contacts/show";
import { DealCreate, DealEdit } from "@/pages/sales/deals/form";
import { PipelinePage } from "@/pages/sales/deals/pipeline";
import { DealShow } from "@/pages/sales/deals/show";
import { SalesCalendarPage } from "@/pages/sales/insights/calendar";
import { ForecastPage } from "@/pages/sales/insights/forecast";
import { LeadCreate, LeadEdit } from "@/pages/sales/leads/form";
import { LeadsLayout } from "@/pages/sales/leads/list";
import { ConvertLead, LeadShow } from "@/pages/sales/leads/show";

// Path constants for the Sales module. The pipeline board is the primary
// surface and is mounted at /deals (Home quick-links target this).
export const salesRoutes = {
  pipeline: "/deals",
  accounts: "/accounts",
  contacts: "/contacts",
  leads: "/leads",
  activities: "/activities",
  salesCalendar: "/sales-calendar",
  forecast: "/forecast",
} as const;

const denied = <AccessDenied />;

// Deals opened from inside an account drawer: preset the account and return to
// that account's detail drawer on close (via contextual navigation state).
function AccountNestedDealCreate() {
  const { id } = useParams<{ id: string }>();
  return <DealCreate presetAccountId={id} />;
}

function AccountNestedDealEdit() {
  const { id } = useParams<{ id: string }>();
  return <DealEdit presetAccountId={id} idParam="dealId" />;
}

// Activity logged from inside a deal drawer: preset the deal.
function DealNestedActivityCreate() {
  const { id } = useParams<{ id: string }>();
  return <ActivityCreate presetDealId={id} />;
}

// One-level-deeper nested SHOW drawers opened from inside an account drawer.
// Route: /accounts/show/:id/deals/show/:dealId and .../contacts/show/:contactId.
// Each reuses the existing show component via a scoped id param so the deeper
// popup is url-addressable in its own right.
function AccountNestedDealShow() {
  return <DealShow idParam="dealId" />;
}

function AccountNestedContactShow() {
  return <ContactShow idParam="contactId" />;
}

// Sub-actions inside the deeper deal-show drawer, scoped to :dealId.
function AccountNestedDealShowActivityCreate() {
  const { dealId } = useParams<{ dealId: string }>();
  return <ActivityCreate presetDealId={dealId} />;
}

const accountContextChildren = (prefix: string): AppRouteDefinition[] => [
  {
    name: `${prefix}.edit`,
    path: "edit",
    element: (
      <CanAccess resource="hub_sales_accounts" action="edit" fallback={denied}>
        <AccountEdit />
      </CanAccess>
    ),
  },
  {
    name: `${prefix}.contacts.create`,
    path: "contacts/create",
    element: (
      <CanAccess resource="hub_sales_contacts" action="create" fallback={denied}>
        <ContactCreate />
      </CanAccess>
    ),
  },
  {
    name: `${prefix}.contacts.edit`,
    path: "contacts/edit/:contactId",
    element: (
      <CanAccess resource="hub_sales_contacts" action="edit" fallback={denied}>
        <ContactEdit />
      </CanAccess>
    ),
  },
  {
    name: `${prefix}.deals.create`,
    path: "deals/create",
    element: (
      <CanAccess resource="hub_sales_deals" action="create" fallback={denied}>
        <AccountNestedDealCreate />
      </CanAccess>
    ),
  },
  {
    name: `${prefix}.deals.edit`,
    path: "deals/edit/:dealId",
    element: (
      <CanAccess resource="hub_sales_deals" action="edit" fallback={denied}>
        <AccountNestedDealEdit />
      </CanAccess>
    ),
  },
  // Deeper nested SHOW: the related deal opens its own url-addressable drawer.
  {
    name: `${prefix}.deals.show`,
    path: "deals/show/:dealId",
    element: (
      <CanAccess resource="hub_sales_deals" action="show" fallback={denied}>
        <AccountNestedDealShow />
      </CanAccess>
    ),
    children: [
      {
        name: `${prefix}.deals.show.edit`,
        path: "edit",
        element: (
          <CanAccess resource="hub_sales_deals" action="edit" fallback={denied}>
            <DealEdit idParam="dealId" />
          </CanAccess>
        ),
      },
      {
        name: `${prefix}.deals.show.activities.create`,
        path: "activities/create",
        element: (
          <CanAccess
            resource="hub_sales_activities"
            action="create"
            fallback={denied}
          >
            <AccountNestedDealShowActivityCreate />
          </CanAccess>
        ),
      },
    ],
  },
  // Deeper nested SHOW: the related contact opens its own url-addressable drawer.
  {
    name: `${prefix}.contacts.show`,
    path: "contacts/show/:contactId",
    element: (
      <CanAccess resource="hub_sales_contacts" action="show" fallback={denied}>
        <AccountNestedContactShow />
      </CanAccess>
    ),
    children: [
      {
        name: `${prefix}.contacts.show.edit`,
        path: "edit",
        element: (
          <CanAccess resource="hub_sales_contacts" action="edit" fallback={denied}>
            <ContactEdit idParam="contactId" />
          </CanAccess>
        ),
      },
    ],
  },
];

const dealContextChildren = (prefix: string): AppRouteDefinition[] => [
  {
    name: `${prefix}.edit`,
    path: "edit",
    element: (
      <CanAccess resource="hub_sales_deals" action="edit" fallback={denied}>
        <DealEdit />
      </CanAccess>
    ),
  },
  {
    name: `${prefix}.activities.create`,
    path: "activities/create",
    element: (
      <CanAccess
        resource="hub_sales_activities"
        action="create"
        fallback={denied}
      >
        <DealNestedActivityCreate />
      </CanAccess>
    ),
  },
];

const leadContextChildren = (prefix: string): AppRouteDefinition[] => [
  {
    name: `${prefix}.edit`,
    path: "edit",
    element: (
      <CanAccess resource="hub_sales_leads" action="edit" fallback={denied}>
        <LeadEdit />
      </CanAccess>
    ),
  },
  {
    name: `${prefix}.convert`,
    path: "convert",
    element: (
      <CanAccess resource="hub_sales_accounts" action="create" fallback={denied}>
        <ConvertLead />
      </CanAccess>
    ),
  },
];

const activityContextChildren = (prefix: string): AppRouteDefinition[] => [
  {
    name: `${prefix}.edit`,
    path: "edit",
    element: (
      <CanAccess
        resource="hub_sales_activities"
        action="edit"
        fallback={denied}
      >
        <ActivityEdit />
      </CanAccess>
    ),
  },
];

const contactContextChildren = (prefix: string): AppRouteDefinition[] => [
  {
    name: `${prefix}.edit`,
    path: "edit",
    element: (
      <CanAccess resource="hub_sales_contacts" action="edit" fallback={denied}>
        <ContactEdit idParam="id" />
      </CanAccess>
    ),
  },
];

const routes = defineAppRoutes([
  {
    // Pipeline board (primary, mounted at /deals)
    name: "hub_sales_deals",
    path: salesRoutes.pipeline,
    element: (
      <CanAccess resource="hub_sales_deals" action="list" fallback={denied}>
        <PipelinePage />
      </CanAccess>
    ),
    resource: {
      meta: {
        label: "Pipeline",
        singularLabel: "Deal",
        i18nKey: "sales.resources.pipeline",
        i18nSingularKey: "sales.resources.deal",
        i18nOptions: { ns: "starter" },
        descriptionI18nKey: "sales.resources.pipeline.description",
        priority: 10,
        icon: <Workflow />,
        description: "Every deal from inquiry to won or lost.",
        canCreate: true,
        acl: { type: "collection" },
      },
    },
    children: [
      {
        name: "hub_sales_deals.create",
        path: "create",
        resourceAction: "create",
        element: (
          <CanAccess resource="hub_sales_deals" action="create" fallback={denied}>
            <DealCreate />
          </CanAccess>
        ),
      },
      {
        name: "hub_sales_deals.edit",
        path: "edit/:id",
        resourceAction: "edit",
        element: (
          <CanAccess resource="hub_sales_deals" action="edit" fallback={denied}>
            <DealEdit />
          </CanAccess>
        ),
      },
      {
        name: "hub_sales_deals.show",
        path: "show/:id",
        resourceAction: "show",
        element: (
          <CanAccess resource="hub_sales_deals" action="show" fallback={denied}>
            <DealShow />
          </CanAccess>
        ),
        children: dealContextChildren("hub_sales_deals.show"),
      },
    ],
  },
  {
    name: "hub_sales_forecast",
    path: salesRoutes.forecast,
    element: (
      <CanAccess resource="hub_sales_deals" action="list" fallback={denied}>
        <ForecastPage />
      </CanAccess>
    ),
    resource: {
      meta: {
        label: "Forecast",
        singularLabel: "Forecast",
        i18nKey: "sales.resources.forecast",
        i18nSingularKey: "sales.resources.forecast",
        i18nOptions: { ns: "starter" },
        descriptionI18nKey: "sales.resources.forecast.description",
        priority: 14,
        icon: <TrendingUp />,
        description: "Win-rate funnel and owner leaderboard.",
        canCreate: false,
        acl: { type: "collection" },
      },
    },
  },
  {
    name: "hub_sales_accounts",
    path: salesRoutes.accounts,
    element: <AccountsLayout />,
    resource: {
      meta: {
        label: "Accounts",
        singularLabel: "Account",
        i18nKey: "sales.resources.accounts",
        i18nSingularKey: "sales.resources.account",
        i18nOptions: { ns: "starter" },
        descriptionI18nKey: "sales.resources.accounts.description",
        priority: 11,
        icon: <Building2 />,
        description: "Client companies, their contacts and deals.",
        canCreate: true,
        canDelete: true,
        acl: { type: "collection" },
      },
    },
    children: [
      {
        name: "hub_sales_accounts.create",
        path: "create",
        resourceAction: "create",
        element: (
          <CanAccess
            resource="hub_sales_accounts"
            action="create"
            fallback={denied}
          >
            <AccountCreate />
          </CanAccess>
        ),
      },
      {
        name: "hub_sales_accounts.edit",
        path: "edit/:id",
        resourceAction: "edit",
        element: (
          <CanAccess resource="hub_sales_accounts" action="edit" fallback={denied}>
            <AccountEdit />
          </CanAccess>
        ),
      },
      {
        name: "hub_sales_accounts.show",
        path: "show/:id",
        resourceAction: "show",
        element: (
          <CanAccess resource="hub_sales_accounts" action="show" fallback={denied}>
            <AccountShow />
          </CanAccess>
        ),
        children: accountContextChildren("hub_sales_accounts.show"),
      },
    ],
  },
  {
    name: "hub_sales_leads",
    path: salesRoutes.leads,
    element: <LeadsLayout />,
    resource: {
      meta: {
        label: "Leads",
        singularLabel: "Lead",
        i18nKey: "sales.resources.leads",
        i18nSingularKey: "sales.resources.lead",
        i18nOptions: { ns: "starter" },
        descriptionI18nKey: "sales.resources.leads.description",
        priority: 12,
        icon: <UserPlus />,
        description: "Inbound and prospected leads to qualify.",
        canCreate: true,
        acl: { type: "collection" },
      },
    },
    children: [
      {
        name: "hub_sales_leads.create",
        path: "create",
        resourceAction: "create",
        element: (
          <CanAccess resource="hub_sales_leads" action="create" fallback={denied}>
            <LeadCreate />
          </CanAccess>
        ),
      },
      {
        name: "hub_sales_leads.edit",
        path: "edit/:id",
        resourceAction: "edit",
        element: (
          <CanAccess resource="hub_sales_leads" action="edit" fallback={denied}>
            <LeadEdit />
          </CanAccess>
        ),
      },
      {
        name: "hub_sales_leads.show",
        path: "show/:id",
        resourceAction: "show",
        element: (
          <CanAccess resource="hub_sales_leads" action="show" fallback={denied}>
            <LeadShow />
          </CanAccess>
        ),
        children: leadContextChildren("hub_sales_leads.show"),
      },
    ],
  },
  {
    name: "hub_sales_activities",
    path: salesRoutes.activities,
    element: <ActivitiesLayout />,
    resource: {
      meta: {
        label: "Activities",
        singularLabel: "Activity",
        i18nKey: "sales.resources.activities",
        i18nSingularKey: "sales.resources.activity",
        i18nOptions: { ns: "starter" },
        descriptionI18nKey: "sales.resources.activities.description",
        priority: 13,
        icon: <Activity />,
        description: "Calls, emails and meetings logged against deals.",
        canCreate: true,
        acl: { type: "collection" },
      },
    },
    children: [
      {
        name: "hub_sales_activities.create",
        path: "create",
        resourceAction: "create",
        element: (
          <CanAccess
            resource="hub_sales_activities"
            action="create"
            fallback={denied}
          >
            <ActivityCreate />
          </CanAccess>
        ),
      },
      {
        name: "hub_sales_activities.edit",
        path: "edit/:id",
        resourceAction: "edit",
        element: (
          <CanAccess
            resource="hub_sales_activities"
            action="edit"
            fallback={denied}
          >
            <ActivityEdit />
          </CanAccess>
        ),
      },
      {
        name: "hub_sales_activities.show",
        path: "show/:id",
        resourceAction: "show",
        element: (
          <CanAccess
            resource="hub_sales_activities"
            action="show"
            fallback={denied}
          >
            <ActivityShow />
          </CanAccess>
        ),
        children: activityContextChildren("hub_sales_activities.show"),
      },
    ],
  },
  {
    name: "hub_sales_contacts",
    path: salesRoutes.contacts,
    element: <ContactsLayout />,
    resource: {
      meta: {
        label: "Contacts",
        singularLabel: "Contact",
        i18nKey: "sales.resources.contacts",
        i18nSingularKey: "sales.resources.contact",
        i18nOptions: { ns: "starter" },
        descriptionI18nKey: "sales.resources.contacts.description",
        priority: 50,
        icon: <Contact />,
        description: "People you deal with at each account.",
        canCreate: true,
        canDelete: true,
        acl: { type: "collection" },
      },
    },
    children: [
      {
        name: "hub_sales_contacts.create",
        path: "create",
        resourceAction: "create",
        element: (
          <CanAccess
            resource="hub_sales_contacts"
            action="create"
            fallback={denied}
          >
            <ContactCreate />
          </CanAccess>
        ),
      },
      {
        name: "hub_sales_contacts.edit",
        path: "edit/:id",
        resourceAction: "edit",
        element: (
          <CanAccess resource="hub_sales_contacts" action="edit" fallback={denied}>
            <ContactEdit idParam="id" />
          </CanAccess>
        ),
      },
      {
        name: "hub_sales_contacts.show",
        path: "show/:id",
        resourceAction: "show",
        element: (
          <CanAccess resource="hub_sales_contacts" action="show" fallback={denied}>
            <ContactShow />
          </CanAccess>
        ),
        children: contactContextChildren("hub_sales_contacts.show"),
      },
    ],
  },
  {
    // Name-only virtual resource — no collection, mirrors the forecast page.
    name: "sales-calendar",
    path: salesRoutes.salesCalendar,
    element: (
      <CanAccess resource="hub_sales_activities" action="list" fallback={denied}>
        <SalesCalendarPage />
      </CanAccess>
    ),
    resource: {
      meta: {
        label: "Activity calendar",
        singularLabel: "Activity calendar",
        i18nKey: "sales.resources.salesCalendar",
        i18nSingularKey: "sales.resources.salesCalendar",
        i18nOptions: { ns: "starter" },
        descriptionI18nKey: "sales.resources.salesCalendar.description",
        priority: 51,
        icon: <CalendarDays />,
        description: "Calls, emails and meetings by day.",
        acl: false,
      },
    },
  },
]);

export const salesModule = { routes };

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
  const route = findMaterializedRoute(salesModule.routes, name);
  if (!route) {
    throw new Error(`Unknown route component: ${name}`);
  }
  return function LazyRouteComponent() {
    return route.element ?? null;
  };
}
