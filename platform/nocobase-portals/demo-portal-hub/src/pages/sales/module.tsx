import {
  Activity,
  Building2,
  CalendarDays,
  Contact,
  TrendingUp,
  UserPlus,
  Workflow,
} from "lucide-react";

import {
  defineAppRoutes,
  type AppRouteDefinition,
} from "@nocobase/portal-sdk/routing";

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

const accountContextChildren = (prefix: string): AppRouteDefinition[] => [
  {
    name: `${prefix}.edit`,
    path: "edit",
    lazy: () =>
      import("./route-components").then((module) => ({
        default: module.routeComponent(`${prefix}.edit`),
      })),
  },
  {
    name: `${prefix}.contacts.create`,
    path: "contacts/create",
    lazy: () =>
      import("./route-components").then((module) => ({
        default: module.routeComponent(`${prefix}.contacts.create`),
      })),
  },
  {
    name: `${prefix}.contacts.edit`,
    path: "contacts/edit/:contactId",
    lazy: () =>
      import("./route-components").then((module) => ({
        default: module.routeComponent(`${prefix}.contacts.edit`),
      })),
  },
  {
    name: `${prefix}.deals.create`,
    path: "deals/create",
    lazy: () =>
      import("./route-components").then((module) => ({
        default: module.routeComponent(`${prefix}.deals.create`),
      })),
  },
  {
    name: `${prefix}.deals.edit`,
    path: "deals/edit/:dealId",
    lazy: () =>
      import("./route-components").then((module) => ({
        default: module.routeComponent(`${prefix}.deals.edit`),
      })),
  },
  // Deeper nested SHOW: the related deal opens its own url-addressable drawer.
  {
    name: `${prefix}.deals.show`,
    path: "deals/show/:dealId",
    lazy: () =>
      import("./route-components").then((module) => ({
        default: module.routeComponent(`${prefix}.deals.show`),
      })),
    children: [
      {
        name: `${prefix}.deals.show.edit`,
        path: "edit",
        lazy: () =>
          import("./route-components").then((module) => ({
            default: module.routeComponent(`${prefix}.deals.show.edit`),
          })),
      },
      {
        name: `${prefix}.deals.show.activities.create`,
        path: "activities/create",
        lazy: () =>
          import("./route-components").then((module) => ({
            default: module.routeComponent(`${prefix}.deals.show.activities.create`),
          })),
      },
    ],
  },
  // Deeper nested SHOW: the related contact opens its own url-addressable drawer.
  {
    name: `${prefix}.contacts.show`,
    path: "contacts/show/:contactId",
    lazy: () =>
      import("./route-components").then((module) => ({
        default: module.routeComponent(`${prefix}.contacts.show`),
      })),
    children: [
      {
        name: `${prefix}.contacts.show.edit`,
        path: "edit",
        lazy: () =>
          import("./route-components").then((module) => ({
            default: module.routeComponent(`${prefix}.contacts.show.edit`),
          })),
      },
    ],
  },
];

const dealContextChildren = (prefix: string): AppRouteDefinition[] => [
  {
    name: `${prefix}.edit`,
    path: "edit",
    lazy: () =>
      import("./route-components").then((module) => ({
        default: module.routeComponent(`${prefix}.edit`),
      })),
  },
  {
    name: `${prefix}.activities.create`,
    path: "activities/create",
    lazy: () =>
      import("./route-components").then((module) => ({
        default: module.routeComponent(`${prefix}.activities.create`),
      })),
  },
];

const leadContextChildren = (prefix: string): AppRouteDefinition[] => [
  {
    name: `${prefix}.edit`,
    path: "edit",
    lazy: () =>
      import("./route-components").then((module) => ({
        default: module.routeComponent(`${prefix}.edit`),
      })),
  },
  {
    name: `${prefix}.convert`,
    path: "convert",
    lazy: () =>
      import("./route-components").then((module) => ({
        default: module.routeComponent(`${prefix}.convert`),
      })),
  },
];

const activityContextChildren = (prefix: string): AppRouteDefinition[] => [
  {
    name: `${prefix}.edit`,
    path: "edit",
    lazy: () =>
      import("./route-components").then((module) => ({
        default: module.routeComponent(`${prefix}.edit`),
      })),
  },
];

const contactContextChildren = (prefix: string): AppRouteDefinition[] => [
  {
    name: `${prefix}.edit`,
    path: "edit",
    lazy: () =>
      import("./route-components").then((module) => ({
        default: module.routeComponent(`${prefix}.edit`),
      })),
  },
];

const routes = defineAppRoutes([
  {
    // Pipeline board (primary, mounted at /deals)
    name: "hub_sales_deals",
    path: salesRoutes.pipeline,
    lazy: () =>
      import("./route-components").then((module) => ({
        default: module.routeComponent("hub_sales_deals"),
      })),
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
        lazy: () =>
          import("./route-components").then((module) => ({
            default: module.routeComponent("hub_sales_deals.create"),
          })),
      },
      {
        name: "hub_sales_deals.edit",
        path: "edit/:id",
        resourceAction: "edit",
        lazy: () =>
          import("./route-components").then((module) => ({
            default: module.routeComponent("hub_sales_deals.edit"),
          })),
      },
      {
        name: "hub_sales_deals.show",
        path: "show/:id",
        resourceAction: "show",
        lazy: () =>
          import("./route-components").then((module) => ({
            default: module.routeComponent("hub_sales_deals.show"),
          })),
        children: dealContextChildren("hub_sales_deals.show"),
      },
    ],
  },
  {
    name: "hub_sales_forecast",
    path: salesRoutes.forecast,
    lazy: () =>
      import("./route-components").then((module) => ({
        default: module.routeComponent("hub_sales_forecast"),
      })),
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
    lazy: () =>
      import("./route-components").then((module) => ({
        default: module.routeComponent("hub_sales_accounts"),
      })),
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
        lazy: () =>
          import("./route-components").then((module) => ({
            default: module.routeComponent("hub_sales_accounts.create"),
          })),
      },
      {
        name: "hub_sales_accounts.edit",
        path: "edit/:id",
        resourceAction: "edit",
        lazy: () =>
          import("./route-components").then((module) => ({
            default: module.routeComponent("hub_sales_accounts.edit"),
          })),
      },
      {
        name: "hub_sales_accounts.show",
        path: "show/:id",
        resourceAction: "show",
        lazy: () =>
          import("./route-components").then((module) => ({
            default: module.routeComponent("hub_sales_accounts.show"),
          })),
        children: accountContextChildren("hub_sales_accounts.show"),
      },
    ],
  },
  {
    name: "hub_sales_leads",
    path: salesRoutes.leads,
    lazy: () =>
      import("./route-components").then((module) => ({
        default: module.routeComponent("hub_sales_leads"),
      })),
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
        lazy: () =>
          import("./route-components").then((module) => ({
            default: module.routeComponent("hub_sales_leads.create"),
          })),
      },
      {
        name: "hub_sales_leads.edit",
        path: "edit/:id",
        resourceAction: "edit",
        lazy: () =>
          import("./route-components").then((module) => ({
            default: module.routeComponent("hub_sales_leads.edit"),
          })),
      },
      {
        name: "hub_sales_leads.show",
        path: "show/:id",
        resourceAction: "show",
        lazy: () =>
          import("./route-components").then((module) => ({
            default: module.routeComponent("hub_sales_leads.show"),
          })),
        children: leadContextChildren("hub_sales_leads.show"),
      },
    ],
  },
  {
    name: "hub_sales_activities",
    path: salesRoutes.activities,
    lazy: () =>
      import("./route-components").then((module) => ({
        default: module.routeComponent("hub_sales_activities"),
      })),
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
        lazy: () =>
          import("./route-components").then((module) => ({
            default: module.routeComponent("hub_sales_activities.create"),
          })),
      },
      {
        name: "hub_sales_activities.edit",
        path: "edit/:id",
        resourceAction: "edit",
        lazy: () =>
          import("./route-components").then((module) => ({
            default: module.routeComponent("hub_sales_activities.edit"),
          })),
      },
      {
        name: "hub_sales_activities.show",
        path: "show/:id",
        resourceAction: "show",
        lazy: () =>
          import("./route-components").then((module) => ({
            default: module.routeComponent("hub_sales_activities.show"),
          })),
        children: activityContextChildren("hub_sales_activities.show"),
      },
    ],
  },
  {
    name: "hub_sales_contacts",
    path: salesRoutes.contacts,
    lazy: () =>
      import("./route-components").then((module) => ({
        default: module.routeComponent("hub_sales_contacts"),
      })),
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
        lazy: () =>
          import("./route-components").then((module) => ({
            default: module.routeComponent("hub_sales_contacts.create"),
          })),
      },
      {
        name: "hub_sales_contacts.edit",
        path: "edit/:id",
        resourceAction: "edit",
        lazy: () =>
          import("./route-components").then((module) => ({
            default: module.routeComponent("hub_sales_contacts.edit"),
          })),
      },
      {
        name: "hub_sales_contacts.show",
        path: "show/:id",
        resourceAction: "show",
        lazy: () =>
          import("./route-components").then((module) => ({
            default: module.routeComponent("hub_sales_contacts.show"),
          })),
        children: contactContextChildren("hub_sales_contacts.show"),
      },
    ],
  },
  {
    // Name-only virtual resource — no collection, mirrors the forecast page.
    name: "sales-calendar",
    path: salesRoutes.salesCalendar,
    lazy: () =>
      import("./route-components").then((module) => ({
        default: module.routeComponent("sales-calendar"),
      })),
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
