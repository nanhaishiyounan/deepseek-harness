import {
  Activity,
  BarChart3,
  Boxes,
  Building2,
  CalendarClock,
  Contact,
  FileText,
  LayoutDashboard,
  LayoutGrid,
  LineChart,
  Package,
  Target,
  TrendingUp,
  UserPlus,
  Users,
  Workflow,
} from "lucide-react";

import {
  defineAppRoutes,
  type AppRouteDefinition,
} from "@nocobase/portal-sdk/routing";
import { Navigate } from "react-router";
import { crmRoutes } from "@/pages/crm/routes";
import { helpdeskModule } from "@/pages/helpdesk/module";

export const registryRoutesEnabled = false;

// Children mounted under a Deal drawer keep related records URL-addressable.
const dealContextChildren = (
  prefix: string,
  dealParam: "id" | "dealId"
): AppRouteDefinition[] => {
  const nestedUnderCustomer = dealParam === "dealId";

  return [
    {
      name: `${prefix}.edit`,
      path: "edit",
      lazy: () =>
        import("@/pages/crm/deals/route-components").then((module) => ({
          default: nestedUnderCustomer
            ? module.CustomerDealEditRoute
            : module.DealEditRoute,
        })),
    },
    {
      name: `${prefix}.activities.create`,
      path: "activities/create",
      lazy: () =>
        import("@/pages/crm/activities/route-components").then((module) => ({
          default: nestedUnderCustomer
            ? module.CustomerDealActivityCreateRoute
            : module.DealActivityCreateRoute,
        })),
    },
    {
      name: `${prefix}.activities.edit`,
      path: "activities/edit/:activityId",
      lazy: () =>
        import("@/pages/crm/activities/route-components").then(
          ({ NestedActivityEditRoute }) => ({
            default: NestedActivityEditRoute,
          })
        ),
    },
    {
      name: `${prefix}.quotes.create`,
      path: "quotes/create",
      lazy: () =>
        import("@/pages/crm/quotes/route-components").then((module) => ({
          default: nestedUnderCustomer
            ? module.CustomerDealQuoteCreateRoute
            : module.DealQuoteCreateRoute,
        })),
    },
    {
      name: `${prefix}.quotes.show`,
      path: "quotes/show/:quoteId",
      lazy: () =>
        import("@/pages/crm/quotes/route-components").then(
          ({ NestedQuoteShowRoute }) => ({ default: NestedQuoteShowRoute })
        ),
    },
  ];
};
const customerContextChildren = (
  prefix: string
): AppRouteDefinition[] => [
  {
    name: `${prefix}.edit`,
    path: "edit",
    lazy: () =>
      import("@/pages/crm/customers/route-components").then(
        ({ CustomerEditRoute }) => ({ default: CustomerEditRoute })
      ),
  },
  {
    name: `${prefix}.contacts.create`,
    path: "contacts/create",
    lazy: () =>
      import("@/pages/crm/contacts/route-components").then(
        ({ ContactCreateRoute }) => ({ default: ContactCreateRoute })
      ),
  },
  {
    name: `${prefix}.contacts.edit`,
    path: "contacts/edit/:contactId",
    lazy: () =>
      import("@/pages/crm/contacts/route-components").then(
        ({ ContactEditRoute }) => ({ default: ContactEditRoute })
      ),
  },
  {
    name: `${prefix}.deals.create`,
    path: "deals/create",
    lazy: () =>
      import("@/pages/crm/deals/route-components").then(
        ({ CustomerDealCreateRoute }) => ({ default: CustomerDealCreateRoute })
      ),
  },
  {
    name: `${prefix}.deals.edit`,
    path: "deals/edit/:dealId",
    lazy: () =>
      import("@/pages/crm/deals/route-components").then(
        ({ CustomerDealEditRoute }) => ({ default: CustomerDealEditRoute })
      ),
  },
  {
    name: `${prefix}.deals.show`,
    path: "deals/show/:dealId",
    lazy: () =>
      import("@/pages/crm/deals/route-components").then(
        ({ CustomerDealShowRoute }) => ({ default: CustomerDealShowRoute })
      ),
    children: dealContextChildren(`${prefix}.deals.show`, "dealId"),
  },
  {
    name: `${prefix}.activities.create`,
    path: "activities/create",
    lazy: () =>
      import("@/pages/crm/activities/route-components").then(
        ({ CustomerActivityCreateRoute }) => ({
          default: CustomerActivityCreateRoute,
        })
      ),
  },
  {
    name: `${prefix}.activities.edit`,
    path: "activities/edit/:activityId",
    lazy: () =>
      import("@/pages/crm/activities/route-components").then(
        ({ CustomerActivityEditRoute }) => ({
          default: CustomerActivityEditRoute,
        })
      ),
  },
  {
    name: `${prefix}.followUps.create`,
    path: "follow-ups/create",
    lazy: () =>
      import("@/pages/crm/follow-ups/route-components").then(
        ({ CustomerFollowUpCreateRoute }) => ({
          default: CustomerFollowUpCreateRoute,
        })
      ),
  },
  {
    name: `${prefix}.followUps.edit`,
    path: "follow-ups/edit/:followUpId",
    lazy: () =>
      import("@/pages/crm/follow-ups/route-components").then(
        ({ CustomerFollowUpEditRoute }) => ({
          default: CustomerFollowUpEditRoute,
        })
      ),
  },
];

// Sidebar section headers. These carry no page of their own (`resource.meta.group`
// tells the sidebar to render a static, non-clickable heading) and only exist to
// nest the real resources below under `meta.parent`. The placeholder `path` is
// required by `AppRouteDefinition` whenever `resource` is set, but is otherwise
// unreachable and unlinked from the UI.
const navGroupOverview = "crm_nav_overview";
const navGroupCustomers = "crm_nav_customers";
const navGroupSales = "crm_nav_sales";
const navGroupProducts = "crm_nav_products";
const navGroupAnalytics = "crm_nav_analytics";

export const appRoutes = defineAppRoutes([
  {
    name: navGroupOverview,
    path: "/nav/overview",
    element: <Navigate to={crmRoutes.dashboard} replace />,
    resource: {
      meta: {
        label: "Overview",
        i18nKey: "crm.groups.overview",
        i18nOptions: { ns: "starter" },
        priority: 0,
        icon: <LayoutGrid />,
        group: true,
        acl: false,
      },
    },
  },
  {
    name: navGroupCustomers,
    path: "/nav/customers",
    element: <Navigate to={crmRoutes.customers} replace />,
    resource: {
      meta: {
        label: "Customers",
        i18nKey: "crm.groups.customers",
        i18nOptions: { ns: "starter" },
        priority: 10,
        icon: <Users />,
        group: true,
        acl: false,
      },
    },
  },
  {
    name: navGroupSales,
    path: "/nav/sales",
    element: <Navigate to={crmRoutes.pipeline} replace />,
    resource: {
      meta: {
        label: "Sales",
        i18nKey: "crm.groups.sales",
        i18nOptions: { ns: "starter" },
        priority: 20,
        icon: <TrendingUp />,
        group: true,
        acl: false,
      },
    },
  },
  {
    name: navGroupProducts,
    path: "/nav/products",
    element: <Navigate to={crmRoutes.products} replace />,
    resource: {
      meta: {
        label: "Products",
        i18nKey: "crm.groups.products",
        i18nOptions: { ns: "starter" },
        priority: 30,
        icon: <Boxes />,
        group: true,
        acl: false,
      },
    },
  },
  {
    name: navGroupAnalytics,
    path: "/nav/analytics",
    element: <Navigate to={crmRoutes.reports} replace />,
    resource: {
      meta: {
        label: "Analytics",
        i18nKey: "crm.groups.analytics",
        i18nOptions: { ns: "starter" },
        priority: 40,
        icon: <LineChart />,
        group: true,
        acl: false,
      },
    },
  },
  {
    name: "dashboard",
    path: crmRoutes.dashboard,
    lazy: () =>
      import("@/pages/crm/dashboard").then(({ DashboardPage }) => ({
        default: DashboardPage,
      })),
    resource: {
      meta: {
        label: "Dashboard",
        i18nKey: "crm.resources.dashboard",
        i18nOptions: { ns: "starter" },
        priority: 1,
        icon: <LayoutDashboard />,
        parent: navGroupOverview,
        acl: false,
      },
    },
    children: [
      {
        name: "dashboard.deal.edit",
        path: "deals/edit/:id",
        lazy: () =>
          import("@/pages/crm/deals/route-components").then(
            ({ DealEditRoute }) => ({ default: DealEditRoute })
          ),
      },
      {
        name: "dashboard.customer.show",
        path: "customers/show/:id",
        lazy: () =>
          import("@/pages/crm/customers/route-components").then(
            ({ CustomerShowRoute }) => ({ default: CustomerShowRoute })
          ),
        children: customerContextChildren("dashboard.customer.show"),
      },
      {
        name: "dashboard.followUp.edit",
        path: "follow-ups/edit/:id",
        lazy: () =>
          import("@/pages/crm/follow-ups/route-components").then(
            ({ FollowUpEditRoute }) => ({ default: FollowUpEditRoute })
          ),
      },
    ],
  },
  {
    name: "crm_leads",
    path: crmRoutes.leads,
    lazy: () =>
      import("@/pages/crm/leads/route-components").then(
        ({ LeadsRoute }) => ({ default: LeadsRoute })
      ),
    resource: {
      meta: {
        label: "Leads",
        singularLabel: "Lead",
        i18nKey: "crm.resources.leads",
        i18nSingularKey: "crm.resources.lead",
        i18nOptions: { ns: "starter" },
        descriptionI18nKey: "crm.resources.leads.description",
        priority: 22,
        icon: <UserPlus />,
        parent: navGroupSales,
        description: "Score, qualify and convert inbound demand.",
        canCreate: true,
        acl: { type: "collection" },
      },
    },
    children: [
      {
        name: "crm_leads.create",
        path: "create",
        resourceAction: "create",
        lazy: () =>
          import("@/pages/crm/leads/route-components").then(
            ({ LeadCreateRoute }) => ({ default: LeadCreateRoute })
          ),
      },
      {
        name: "crm_leads.edit",
        path: "edit/:id",
        resourceAction: "edit",
        lazy: () =>
          import("@/pages/crm/leads/route-components").then(
            ({ LeadEditRoute }) => ({ default: LeadEditRoute })
          ),
      },
      {
        name: "crm_leads.show",
        path: "show/:id",
        resourceAction: "show",
        lazy: () =>
          import("@/pages/crm/leads/route-components").then(
            ({ LeadShowRoute }) => ({ default: LeadShowRoute })
          ),
      },
    ],
  },
  {
    name: "crm_deals",
    path: crmRoutes.pipeline,
    lazy: () =>
      import("@/pages/crm/deals/route-components").then(
        ({ PipelineRoute }) => ({ default: PipelineRoute })
      ),
    resource: {
      meta: {
        label: "Pipeline",
        singularLabel: "Deal",
        i18nKey: "crm.resources.pipeline",
        i18nSingularKey: "crm.resources.deal",
        i18nOptions: { ns: "starter" },
        descriptionI18nKey: "crm.resources.pipeline.description",
        priority: 21,
        icon: <Workflow />,
        parent: navGroupSales,
        description: "Every deal from inquiry to quote to won / lost.",
        canCreate: true,
        acl: { type: "collection" },
      },
    },
    children: [
      {
        name: "crm_deals.create",
        path: "create",
        resourceAction: "create",
        lazy: () =>
          import("@/pages/crm/deals/route-components").then(
            ({ DealCreateRoute }) => ({ default: DealCreateRoute })
          ),
      },
      {
        name: "crm_deals.edit",
        path: "edit/:id",
        resourceAction: "edit",
        lazy: () =>
          import("@/pages/crm/deals/route-components").then(
            ({ DealEditRoute }) => ({ default: DealEditRoute })
          ),
      },
      {
        name: "crm_deals.show",
        path: "show/:id",
        resourceAction: "show",
        lazy: () =>
          import("@/pages/crm/deals/route-components").then(
            ({ DealShowRoute }) => ({ default: DealShowRoute })
          ),
        children: dealContextChildren("crm_deals.show", "id"),
      },
    ],
  },
  {
    name: "crm_quotes",
    path: crmRoutes.quotes,
    lazy: () =>
      import("@/pages/crm/quotes/route-components").then(
        ({ QuotesRoute }) => ({ default: QuotesRoute })
      ),
    resource: {
      meta: {
        label: "Quotes",
        singularLabel: "Quote",
        i18nKey: "crm.resources.quotes",
        i18nSingularKey: "crm.resources.quote",
        i18nOptions: { ns: "starter" },
        descriptionI18nKey: "crm.resources.quotes.description",
        priority: 23,
        icon: <FileText />,
        parent: navGroupSales,
        description: "Commercial proposals with priced line items.",
        canCreate: true,
        acl: { type: "collection" },
      },
    },
    children: [
      {
        name: "crm_quotes.create",
        path: "create",
        resourceAction: "create",
        lazy: () =>
          import("@/pages/crm/quotes/route-components").then(
            ({ QuoteCreateRoute }) => ({ default: QuoteCreateRoute })
          ),
      },
      {
        name: "crm_quotes.edit",
        path: "edit/:id",
        resourceAction: "edit",
        lazy: () =>
          import("@/pages/crm/quotes/route-components").then(
            ({ QuoteEditRoute }) => ({ default: QuoteEditRoute })
          ),
      },
      {
        name: "crm_quotes.show",
        path: "show/:id",
        resourceAction: "show",
        lazy: () =>
          import("@/pages/crm/quotes/route-components").then(
            ({ QuoteShowRoute }) => ({ default: QuoteShowRoute })
          ),
      },
    ],
  },
  {
    name: "crm_customers",
    path: crmRoutes.customers,
    lazy: () =>
      import("@/pages/crm/customers/list").then(({ CustomersLayout }) => ({
        default: CustomersLayout,
      })),
    resource: {
      meta: {
        label: "Customers",
        singularLabel: "Customer",
        i18nKey: "crm.resources.customers",
        i18nSingularKey: "crm.resources.customer",
        i18nOptions: { ns: "starter" },
        descriptionI18nKey: "crm.resources.customers.description",
        priority: 11,
        icon: <Building2 />,
        parent: navGroupCustomers,
        description: "Client companies and the people you deal with.",
        canCreate: true,
        canDelete: true,
        acl: { type: "collection" },
      },
    },
    children: [
      {
        name: "crm_customers.create",
        path: "create",
        resourceAction: "create",
        lazy: () =>
          import("@/pages/crm/customers/route-components").then(
            ({ CustomerCreateRoute }) => ({ default: CustomerCreateRoute })
          ),
      },
      {
        name: "crm_customers.edit",
        path: "edit/:id",
        resourceAction: "edit",
        lazy: () =>
          import("@/pages/crm/customers/route-components").then(
            ({ CustomerEditRoute }) => ({ default: CustomerEditRoute })
          ),
      },
      {
        name: "crm_customers.show",
        path: "show/:id",
        resourceAction: "show",
        lazy: () =>
          import("@/pages/crm/customers/route-components").then(
            ({ CustomerShowRoute }) => ({ default: CustomerShowRoute })
          ),
        children: customerContextChildren("crm_customers.show"),
      },
    ],
  },
  {
    name: "crm_contacts",
    path: crmRoutes.contacts,
    lazy: () =>
      import("@/pages/crm/contacts/route-components").then(
        ({ ContactsRoute }) => ({ default: ContactsRoute })
      ),
    resource: {
      meta: {
        label: "Contacts",
        singularLabel: "Contact",
        i18nKey: "crm.resources.contacts",
        i18nSingularKey: "crm.resources.contact",
        i18nOptions: { ns: "starter" },
        descriptionI18nKey: "crm.resources.contacts.description",
        priority: 12,
        icon: <Contact />,
        parent: navGroupCustomers,
        description: "Every person you deal with, across all accounts.",
        canCreate: true,
        acl: { type: "collection" },
      },
    },
    children: [
      {
        name: "crm_contacts.create",
        path: "create",
        resourceAction: "create",
        lazy: () =>
          import("@/pages/crm/contacts/route-components").then(
            ({ ContactCreateRoute }) => ({ default: ContactCreateRoute })
          ),
      },
      {
        name: "crm_contacts.edit",
        path: "edit/:contactId",
        resourceAction: "edit",
        lazy: () =>
          import("@/pages/crm/contacts/route-components").then(
            ({ ContactEditRoute }) => ({ default: ContactEditRoute })
          ),
      },
      {
        name: "crm_contacts.show",
        path: "show/:id",
        resourceAction: "show",
        lazy: () =>
          import("@/pages/crm/contacts/route-components").then(
            ({ ContactShowRoute }) => ({ default: ContactShowRoute })
          ),
      },
    ],
  },
  {
    name: "crm_products",
    path: crmRoutes.products,
    lazy: () =>
      import("@/pages/crm/products/route-components").then(
        ({ ProductsRoute }) => ({ default: ProductsRoute })
      ),
    resource: {
      meta: {
        label: "Products",
        singularLabel: "Product",
        i18nKey: "crm.resources.products",
        i18nSingularKey: "crm.resources.product",
        i18nOptions: { ns: "starter" },
        descriptionI18nKey: "crm.resources.products.description",
        priority: 31,
        icon: <Package />,
        parent: navGroupProducts,
        description: "Active SKUs and list prices used in quotes.",
        canCreate: true,
        acl: { type: "collection" },
      },
    },
    children: [
      {
        name: "crm_products.create",
        path: "create",
        resourceAction: "create",
        lazy: () =>
          import("@/pages/crm/products/route-components").then(
            ({ ProductCreateRoute }) => ({ default: ProductCreateRoute })
          ),
      },
      {
        name: "crm_products.edit",
        path: "edit/:id",
        resourceAction: "edit",
        lazy: () =>
          import("@/pages/crm/products/route-components").then(
            ({ ProductEditRoute }) => ({ default: ProductEditRoute })
          ),
      },
      {
        name: "crm_products.show",
        path: "show/:id",
        resourceAction: "show",
        lazy: () =>
          import("@/pages/crm/products/route-components").then(
            ({ ProductShowRoute }) => ({ default: ProductShowRoute })
          ),
      },
    ],
  },
  {
    name: "crm_activities",
    path: crmRoutes.activities,
    lazy: () =>
      import("@/pages/crm/activities/list").then(({ ActivitiesLayout }) => ({
        default: ActivitiesLayout,
      })),
    resource: {
      meta: {
        label: "Activities",
        singularLabel: "Activity",
        i18nKey: "crm.resources.activities",
        i18nSingularKey: "crm.resources.activity",
        i18nOptions: { ns: "starter" },
        descriptionI18nKey: "crm.resources.activities.description",
        priority: 25,
        icon: <Activity />,
        parent: navGroupSales,
        description: "Calls, meetings and emails logged against customers.",
        canCreate: true,
        acl: { type: "collection" },
      },
    },
    children: [
      {
        name: "crm_activities.create",
        path: "create",
        resourceAction: "create",
        lazy: () =>
          import("@/pages/crm/activities/route-components").then(
            ({ ActivityCreateRoute }) => ({ default: ActivityCreateRoute })
          ),
      },
      {
        name: "crm_activities.edit",
        path: "edit/:id",
        resourceAction: "edit",
        lazy: () =>
          import("@/pages/crm/activities/route-components").then(
            ({ ActivityEditRoute }) => ({ default: ActivityEditRoute })
          ),
      },
      {
        name: "crm_activities.show",
        path: "show/:id",
        resourceAction: "show",
        lazy: () =>
          import("@/pages/crm/activities/route-components").then(
            ({ ActivityShowRoute }) => ({ default: ActivityShowRoute })
          ),
      },
    ],
  },
  {
    name: "crm_follow_ups",
    path: crmRoutes.followUps,
    lazy: () =>
      import("@/pages/crm/follow-ups/list").then(({ FollowUpsLayout }) => ({
        default: FollowUpsLayout,
      })),
    resource: {
      meta: {
        label: "Follow-ups",
        singularLabel: "Follow-up",
        i18nKey: "crm.resources.followUps",
        i18nSingularKey: "crm.resources.followUp",
        i18nOptions: { ns: "starter" },
        descriptionI18nKey: "crm.resources.followUps.description",
        priority: 24,
        icon: <CalendarClock />,
        parent: navGroupSales,
        description: "Reminders so nothing slips.",
        canCreate: true,
        acl: { type: "collection" },
      },
    },
    children: [
      {
        name: "crm_follow_ups.create",
        path: "create",
        resourceAction: "create",
        lazy: () =>
          import("@/pages/crm/follow-ups/route-components").then(
            ({ FollowUpCreateRoute }) => ({ default: FollowUpCreateRoute })
          ),
      },
      {
        name: "crm_follow_ups.edit",
        path: "edit/:id",
        resourceAction: "edit",
        lazy: () =>
          import("@/pages/crm/follow-ups/route-components").then(
            ({ FollowUpEditRoute }) => ({ default: FollowUpEditRoute })
          ),
      },
      {
        name: "crm_follow_ups.show",
        path: "show/:id",
        resourceAction: "show",
        lazy: () =>
          import("@/pages/crm/follow-ups/route-components").then(
            ({ FollowUpShowRoute }) => ({ default: FollowUpShowRoute })
          ),
      },
    ],
  },
  {
    name: "crm_targets",
    path: crmRoutes.targets,
    lazy: () =>
      import("@/pages/crm/targets/route-components").then(
        ({ TargetsRoute }) => ({ default: TargetsRoute })
      ),
    resource: {
      meta: {
        label: "Targets",
        i18nKey: "crm.resources.targets",
        i18nOptions: { ns: "starter" },
        descriptionI18nKey: "crm.resources.targets.description",
        priority: 42,
        icon: <Target />,
        parent: navGroupAnalytics,
        description: "Monthly quotas, attainment and owner rankings.",
        acl: { type: "collection" },
      },
    },
  },
  {
    name: "crm_reports",
    path: crmRoutes.reports,
    lazy: () =>
      import("@/pages/crm/reports/route-components").then(
        ({ ReportsRoute }) => ({ default: ReportsRoute })
      ),
    resource: {
      meta: {
        label: "Reports",
        i18nKey: "crm.resources.reports",
        i18nOptions: { ns: "starter" },
        descriptionI18nKey: "crm.resources.reports.description",
        priority: 41,
        icon: <BarChart3 />,
        parent: navGroupAnalytics,
        description: "Pivot views of pipeline ownership and won revenue.",
        acl: false,
      },
    },
  },
  ...helpdeskModule.routes,
]);
