import { useGetIdentity, useList, type CrudFilter } from "@refinedev/core";
import { useMemo } from "react";
import type {
  ActivityLite,
  ArticleLite,
  DealLite,
  InvoiceLite,
  LeaveLite,
  ProjectLite,
  TaskLite,
  TicketLite,
} from "./types";
import {
  invoiceAmount,
  isInvoiceOverdue,
  useInvoiceAmounts,
} from "@/pages/finance/invoice-metrics";

/** Local YYYY-MM-DD; not toISOString(), which shifts across timezones. */
export const todayIso = () => {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
};

export const monthsBack = (count: number) => {
  const keys: string[] = [];
  const now = new Date();
  for (let index = count - 1; index >= 0; index -= 1) {
    const date = new Date(now.getFullYear(), now.getMonth() - index, 1);
    keys.push(
      `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`
    );
  }
  return keys;
};

/** Calendar-quarter bounds for an offset from the current quarter. */
export const quarterBounds = (offset = 0) => {
  const now = new Date();
  const quarterIndex = Math.floor(now.getMonth() / 3) + offset;
  const year = now.getFullYear() + Math.floor(quarterIndex / 4);
  const normalized = ((quarterIndex % 4) + 4) % 4;
  const startMonth = normalized * 3;
  const start = new Date(year, startMonth, 1);
  const end = new Date(year, startMonth + 3, 0);
  const pad = (value: number) => String(value).padStart(2, "0");
  return {
    from: `${start.getFullYear()}-${pad(start.getMonth() + 1)}-01`,
    to: `${end.getFullYear()}-${pad(end.getMonth() + 1)}-${pad(end.getDate())}`,
  };
};

export function useCurrentUser() {
  const { data } = useGetIdentity<{
    id?: string | number;
    nickname?: string;
    username?: string;
  }>();
  return {
    id: data?.id === undefined || data?.id === null ? null : String(data.id),
    name: data?.nickname || data?.username || null,
  };
}

const listOptions = {
  errorNotification: false as const,
  queryOptions: { retry: false },
};

type WeekActivity = {
  id: string | number;
  type?: string | null;
  subject?: string;
  date?: string | null;
  deal_id?: string | number | null;
};

type WeekTask = {
  id: string | number;
  title?: string;
  status?: string | null;
  priority?: string | null;
  due_date?: string | null;
};

type WeekDeal = {
  id: string | number;
  title?: string;
  stage?: string | null;
  amount?: number | null;
  expected_close_date?: string | null;
};

/** The current local-time Monday through Sunday, as date-only keys. */
const currentWeekKeys = () => {
  const now = new Date();
  const monday = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate() - ((now.getDay() + 6) % 7)
  );

  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(
      monday.getFullYear(),
      monday.getMonth(),
      monday.getDate() + index
    );
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${date.getFullYear()}-${month}-${day}`;
  });
};

export function useWeekAhead() {
  const days = currentWeekKeys();
  const monday = days[0];
  const sunday = days[6];

  const activities = useList<WeekActivity>({
    resource: "hub_sales_activities",
    pagination: { mode: "server", currentPage: 1, pageSize: 200 },
    filters: [
      { field: "date", operator: "gte", value: `${monday}T00:00:00` },
      { field: "date", operator: "lte", value: `${sunday}T23:59:59` },
    ],
    sorters: [{ field: "date", order: "asc" }],
    meta: { fields: ["id", "type", "subject", "date", "deal_id"] },
    ...listOptions,
  });

  const tasks = useList<WeekTask>({
    resource: "hub_pj_tasks",
    pagination: { mode: "server", currentPage: 1, pageSize: 200 },
    filters: [
      { field: "status", operator: "ne", value: "done" },
      { field: "due_date", operator: "gte", value: monday },
      { field: "due_date", operator: "lte", value: sunday },
    ],
    sorters: [{ field: "due_date", order: "asc" }],
    meta: { fields: ["id", "title", "status", "priority", "due_date"] },
    ...listOptions,
  });

  const deals = useList<WeekDeal>({
    resource: "hub_sales_deals",
    pagination: { mode: "server", currentPage: 1, pageSize: 200 },
    filters: [
      {
        field: "stage",
        operator: "in",
        value: ["inquiry", "quote", "negotiation"],
      },
      { field: "expected_close_date", operator: "gte", value: monday },
      { field: "expected_close_date", operator: "lte", value: sunday },
    ],
    meta: {
      fields: ["id", "title", "stage", "amount", "expected_close_date"],
    },
    ...listOptions,
  });

  return {
    days,
    activities: activities.result.data,
    tasks: tasks.result.data,
    deals: deals.result.data,
    isLoading:
      activities.query.isLoading ||
      tasks.query.isLoading ||
      deals.query.isLoading,
  };
}

/**
 * Everything the Overview shows comes from these queries. The page is the
 * front door of the whole hub, so it reads live records from every module
 * rather than rendering canned numbers.
 */
export function useOverviewData(scopeUserId: string | null) {
  const today = todayIso();
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayValue = `${yesterday.getFullYear()}-${String(
    yesterday.getMonth() + 1
  ).padStart(2, "0")}-${String(yesterday.getDate()).padStart(2, "0")}`;
  const invoiceAmounts = useInvoiceAmounts();

  const deals = useList<DealLite>({
    resource: "hub_sales_deals",
    pagination: { mode: "server", currentPage: 1, pageSize: 500 },
    meta: { appends: ["account"] },
    ...listOptions,
  });

  const projects = useList<ProjectLite>({
    resource: "hub_pj_projects",
    pagination: { mode: "server", currentPage: 1, pageSize: 200 },
    ...listOptions,
  });

  const invoices = useList<InvoiceLite>({
    resource: "hub_fin_invoices",
    pagination: { mode: "server", currentPage: 1, pageSize: 500 },
    ...listOptions,
  });

  const openTickets = useList<TicketLite>({
    resource: "hub_hd_tickets",
    pagination: { mode: "server", currentPage: 1, pageSize: 500 },
    filters: [{ field: "status", operator: "in", value: ["open", "pending"] }],
    meta: { appends: ["assignee", "requester"] },
    sorters: [{ field: "createdAt", order: "desc" }],
    ...listOptions,
  });

  // --- action-centre queues ------------------------------------------------
  const overdueTaskFilters: CrudFilter[] = [
    { field: "status", operator: "ne", value: "done" },
    { field: "due_date", operator: "lt", value: today },
    ...(scopeUserId
      ? ([
          {
            field: "hub_pj_task_assignee_id",
            operator: "eq",
            value: scopeUserId,
          },
        ] as CrudFilter[])
      : []),
  ];

  const overdueTasks = useList<TaskLite>({
    resource: "hub_pj_tasks",
    pagination: { mode: "server", currentPage: 1, pageSize: 50 },
    filters: overdueTaskFilters,
    sorters: [{ field: "due_date", order: "asc" }],
    meta: { appends: ["project", "assignee"] },
    ...listOptions,
  });

  const myTickets = useList<TicketLite>({
    resource: "hub_hd_tickets",
    pagination: { mode: "server", currentPage: 1, pageSize: 50 },
    filters: [
      { field: "status", operator: "in", value: ["open", "pending"] },
      ...(scopeUserId
        ? ([
            { field: "assigneeId", operator: "eq", value: scopeUserId },
          ] as CrudFilter[])
        : []),
    ],
    sorters: [{ field: "createdAt", order: "desc" }],
    meta: { appends: ["assignee", "requester"] },
    ...listOptions,
  });

  const pendingLeave = useList<LeaveLite>({
    resource: "hub_hr_leave_requests",
    pagination: { mode: "server", currentPage: 1, pageSize: 50 },
    filters: [{ field: "status", operator: "eq", value: "pending" }],
    sorters: [{ field: "start_date", order: "asc" }],
    meta: { appends: ["employee"] },
    ...listOptions,
  });

  const overdueInvoices = useList<InvoiceLite>({
    resource: "hub_fin_invoices",
    pagination: { mode: "server", currentPage: 1, pageSize: 50 },
    filters: [
      { field: "status", operator: "in", value: ["sent", "overdue"] },
      { field: "due_date", operator: "lte", value: yesterdayValue },
    ],
    sorters: [{ field: "due_date", order: "asc" }],
    ...listOptions,
  });

  // --- feed ---------------------------------------------------------------
  const recentActivities = useList<ActivityLite>({
    resource: "hub_sales_activities",
    pagination: { mode: "server", currentPage: 1, pageSize: 8 },
    sorters: [{ field: "date", order: "desc" }],
    meta: { appends: ["deal"] },
    ...listOptions,
  });

  const articles = useList<ArticleLite>({
    resource: "hub_kb_articles",
    pagination: { mode: "server", currentPage: 1, pageSize: 4 },
    filters: [{ field: "status", operator: "eq", value: "published" }],
    sorters: [{ field: "createdAt", order: "desc" }],
    meta: { appends: ["author"] },
    ...listOptions,
  });

  const isLoading =
    deals.query.isLoading ||
    invoices.query.isLoading ||
    projects.query.isLoading ||
    openTickets.query.isLoading ||
    invoiceAmounts.isLoading;

  const isError =
    deals.query.isError ||
    invoices.query.isError ||
    projects.query.isError ||
    openTickets.query.isError ||
    invoiceAmounts.isError;

  const refetch = () => {
    void deals.query.refetch();
    void projects.query.refetch();
    void invoices.query.refetch();
    void openTickets.query.refetch();
    void overdueTasks.query.refetch();
    void myTickets.query.refetch();
    void pendingLeave.query.refetch();
    void overdueInvoices.query.refetch();
    void recentActivities.query.refetch();
    void invoiceAmounts.refetch();
  };

  return {
    deals: deals.result.data,
    projects: projects.result.data,
    invoices: invoices.result.data,
    invoiceAmounts: invoiceAmounts.byInvoice,
    openTickets: openTickets.result.data,
    openTicketCount: openTickets.result.total ?? 0,
    queues: {
      tasks: overdueTasks.result.data,
      taskCount: overdueTasks.result.total ?? 0,
      tickets: myTickets.result.data,
      ticketCount: myTickets.result.total ?? 0,
      leave: pendingLeave.result.data,
      leaveCount: pendingLeave.result.total ?? 0,
      invoices: overdueInvoices.result.data,
      invoiceCount: overdueInvoices.result.total ?? 0,
    },
    activities: recentActivities.result.data,
    articles: articles.result.data,
    isLoading,
    isError,
    isFetching:
      deals.query.isFetching ||
      overdueTasks.query.isFetching ||
      pendingLeave.query.isFetching,
    refetch,
  };
}

const OPEN_STAGES = ["inquiry", "quote", "negotiation"];

/** KPI + chart aggregates, all derived from the live records above. */
export function useOverviewAggregates(
  deals: DealLite[],
  invoices: InvoiceLite[],
  projects: ProjectLite[],
  invoiceAmounts: Map<string, number>
) {
  return useMemo(() => {
    const thisQuarter = quarterBounds(0);
    const lastQuarter = quarterBounds(-1);

    const openDeals = deals.filter((deal) =>
      OPEN_STAGES.includes(deal.stage ?? "")
    );
    const pipelineValue = openDeals.reduce(
      (total, deal) => total + Number(deal.amount ?? 0),
      0
    );

    const wonIn = (range: { from: string; to: string }) =>
      deals
        .filter(
          (deal) =>
            deal.stage === "won" &&
            deal.expected_close_date &&
            deal.expected_close_date >= range.from &&
            deal.expected_close_date <= range.to
        )
        .reduce((total, deal) => total + Number(deal.amount ?? 0), 0);

    const wonThisQuarter = wonIn(thisQuarter);
    const wonLastQuarter = wonIn(lastQuarter);
    const wonDelta =
      wonLastQuarter === 0
        ? null
        : Math.round(
            ((wonThisQuarter - wonLastQuarter) / wonLastQuarter) * 100
          );

    const overdueInvoiceValue = invoices
      .filter((invoice) => isInvoiceOverdue(invoice))
      .reduce(
        (total, invoice) => total + invoiceAmount(invoice, invoiceAmounts),
        0
      );

    const activeProjects = projects.filter(
      (project) => project.status === "active"
    ).length;

    // Invoiced vs collected by month — the closest thing to a revenue trend
    // the data model supports (there is no recognised-revenue table).
    const months = monthsBack(8);
    const invoiced = months.map((month) =>
      invoices
        .filter((invoice) => invoice.issue_date?.startsWith(month))
        .reduce(
          (total, invoice) => total + invoiceAmount(invoice, invoiceAmounts),
          0
        )
    );
    const collected = months.map((month) =>
      invoices
        .filter(
          (invoice) =>
            invoice.status === "paid" && invoice.issue_date?.startsWith(month)
        )
        .reduce(
          (total, invoice) => total + invoiceAmount(invoice, invoiceAmounts),
          0
        )
    );

    // Won vs lost by close month.
    const outcomeMonths = monthsBack(8);
    const won = outcomeMonths.map(
      (month) =>
        deals.filter(
          (deal) =>
            deal.stage === "won" && deal.expected_close_date?.startsWith(month)
        ).length
    );
    const lost = outcomeMonths.map(
      (month) =>
        deals.filter(
          (deal) =>
            deal.stage === "lost" && deal.expected_close_date?.startsWith(month)
        ).length
    );

    return {
      pipelineValue,
      openDealCount: openDeals.length,
      wonThisQuarter,
      wonDelta,
      overdueInvoiceValue,
      activeProjects,
      months,
      invoiced,
      collected,
      outcomeMonths,
      won,
      lost,
    };
  }, [deals, invoiceAmounts, invoices, projects]);
}
