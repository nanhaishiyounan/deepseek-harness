import { useTranslate } from "@refinedev/core";
import ReactECharts from "echarts-for-react";
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  BarChart3,
  BookOpen,
  Boxes,
  CalendarCheck,
  CheckCircle2,
  DollarSign,
  FileWarning,
  FolderKanban,
  LifeBuoy,
  Package,
  Pin,
  PinOff,
  RefreshCcw,
  ShoppingCart,
  Ticket,
  Users,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
import { Link, useNavigate } from "react-router";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import {
  BuildStoryBanner,
  type BuildStory,
} from "@/components/build-story/build-story-banner";
import {
  todayIso,
  useCurrentUser,
  useOverviewAggregates,
  useOverviewData,
} from "./data";
import { invoiceAmount } from "@/pages/finance/invoice-metrics";
import { QuickSearch, QuickSearchTrigger } from "./quick-search";
import { useChartTheme } from "./theme";
import { WeekStrip } from "./week-strip";

// How this portal was built — estimates, calibrated to a from-scratch agent
// build. Shown in the pinned banner at the top of the overview.
const BUILD_STORY: BuildStory = {
  models: ["Opus 4.8", "Sonnet 5"],
  moduleCount: 9,
  moduleLabelKey: "buildStory.modules",
  // Tracks sharing a time band ran in parallel (concurrent agents). The three
  // module tracks at 20–65 are the 9 modules built simultaneously; enrichment
  // at 100–140 likewise ran two agents in parallel.
  tracks: [
    { labelKey: "buildStory.track.design", models: ["Opus 4.8"], start: 0, minutes: 20 },
    { labelKey: "buildStory.track.modA", models: ["Sonnet 5"], start: 20, minutes: 45 },
    { labelKey: "buildStory.track.modB", models: ["Sonnet 5"], start: 20, minutes: 45 },
    { labelKey: "buildStory.track.modC", models: ["Opus 4.8"], start: 20, minutes: 45 },
    { labelKey: "buildStory.track.migration", models: ["Opus 4.8"], start: 65, minutes: 35 },
    { labelKey: "buildStory.track.enrich", models: ["Sonnet 5"], start: 100, minutes: 40 },
    { labelKey: "buildStory.track.pages", models: ["Sonnet 5"], start: 100, minutes: 40 },
    { labelKey: "buildStory.track.finalize", models: ["Opus 4.8"], start: 140, minutes: 10 },
  ],
};

type ModuleLink = {
  id: string;
  labelKey: string;
  descKey: string;
  to: string;
  icon: LucideIcon;
  color: string;
};

const MODULES: ModuleLink[] = [
  { id: "sales", labelKey: "home.modules.sales.label", descKey: "home.modules.sales.desc", to: "/deals", icon: BarChart3, color: "text-blue-600 bg-blue-500/12 dark:text-blue-400" },
  { id: "projects", labelKey: "home.modules.projects.label", descKey: "home.modules.projects.desc", to: "/projects", icon: FolderKanban, color: "text-sky-600 bg-sky-500/12 dark:text-sky-400" },
  { id: "hr", labelKey: "home.modules.hr.label", descKey: "home.modules.hr.desc", to: "/employees", icon: Users, color: "text-teal-600 bg-teal-500/12 dark:text-teal-400" },
  { id: "inventory", labelKey: "home.modules.inventory.label", descKey: "home.modules.inventory.desc", to: "/products", icon: Boxes, color: "text-amber-600 bg-amber-500/12 dark:text-amber-400" },
  { id: "procurement", labelKey: "home.modules.procurement.label", descKey: "home.modules.procurement.desc", to: "/purchase-orders", icon: ShoppingCart, color: "text-violet-600 bg-violet-500/12 dark:text-violet-400" },
  { id: "helpdesk", labelKey: "home.modules.helpdesk.label", descKey: "home.modules.helpdesk.desc", to: "/tickets", icon: LifeBuoy, color: "text-rose-600 bg-rose-500/12 dark:text-rose-400" },
  { id: "assets", labelKey: "home.modules.assets.label", descKey: "home.modules.assets.desc", to: "/asset-registry", icon: Package, color: "text-indigo-600 bg-indigo-500/12 dark:text-indigo-400" },
  { id: "finance", labelKey: "home.modules.finance.label", descKey: "home.modules.finance.desc", to: "/invoices", icon: DollarSign, color: "text-emerald-600 bg-emerald-500/12 dark:text-emerald-400" },
  { id: "knowledge", labelKey: "home.modules.knowledge.label", descKey: "home.modules.knowledge.desc", to: "/articles", icon: BookOpen, color: "text-cyan-600 bg-cyan-500/12 dark:text-cyan-400" },
];

const PINS_KEY = "hub.home.pinnedModules";

const currency = (value: number, locale: string) =>
  new Intl.NumberFormat(locale, {
    style: "currency",
    currency: "USD",
    notation: Math.abs(value) >= 100_000 ? "compact" : "standard",
    maximumFractionDigits: Math.abs(value) >= 100_000 ? 1 : 0,
  }).format(value);

export function OverviewPage() {
  const translate = useTranslate();
  const chart = useChartTheme();
  const navigate = useNavigate();
  const user = useCurrentUser();
  const locale =
    typeof navigator !== "undefined" ? navigator.language : "en-US";

  const [scope, setScope] = useState<"team" | "mine">("team");
  const [searchOpen, setSearchOpen] = useState(false);
  const data = useOverviewData(scope === "mine" ? user.id : null);
  const agg = useOverviewAggregates(
    data.deals,
    data.invoices,
    data.projects,
    data.invoiceAmounts
  );

  const [pinned, setPinned] = useState<string[]>(() => {
    if (typeof window === "undefined") return [];
    try {
      return JSON.parse(window.localStorage.getItem(PINS_KEY) ?? "[]");
    } catch {
      return [];
    }
  });

  const togglePin = (id: string) => {
    setPinned((current) => {
      const next = current.includes(id)
        ? current.filter((value) => value !== id)
        : [...current, id];
      try {
        window.localStorage.setItem(PINS_KEY, JSON.stringify(next));
      } catch {
        // Pins are a convenience; a blocked storage is not an error.
      }
      return next;
    });
  };

  const orderedModules = useMemo(
    () =>
      [...MODULES].sort((left, right) => {
        const leftPinned = pinned.includes(left.id) ? 0 : 1;
        const rightPinned = pinned.includes(right.id) ? 0 : 1;
        return leftPinned - rightPinned;
      }),
    [pinned]
  );

  const axisBase = {
    axisLine: { lineStyle: { color: chart.grid } },
    axisTick: { show: false },
    axisLabel: { color: chart.axis, fontSize: 12 },
  };
  const tooltipBase = {
    backgroundColor: chart.tooltipBg,
    borderColor: chart.tooltipBorder,
    textStyle: { color: chart.tooltipText, fontSize: 12 },
    borderWidth: 1,
    padding: [8, 12],
  };

  const revenueOption = {
    color: [chart.palette[0], chart.palette[2]],
    grid: { left: 6, right: 12, top: 28, bottom: 8, containLabel: true },
    legend: {
      right: 0,
      top: 0,
      icon: "circle",
      itemWidth: 8,
      itemHeight: 8,
      textStyle: { color: chart.axis, fontSize: 12 },
    },
    tooltip: {
      trigger: "axis",
      ...tooltipBase,
      valueFormatter: (value: number) => currency(value, locale),
    },
    xAxis: { type: "category", data: agg.months, ...axisBase },
    yAxis: {
      type: "value",
      ...axisBase,
      axisLine: { show: false },
      splitLine: { lineStyle: { color: chart.grid } },
      axisLabel: {
        color: chart.axis,
        fontSize: 12,
        formatter: (value: number) => currency(value, locale),
      },
    },
    series: [
      {
        name: translate("home.series.invoiced", "Invoiced"),
        type: "bar",
        data: agg.invoiced,
        barWidth: 14,
        itemStyle: { borderRadius: [4, 4, 0, 0] },
      },
      {
        name: translate("home.series.collected", "Collected"),
        type: "bar",
        data: agg.collected,
        barWidth: 14,
        itemStyle: { borderRadius: [4, 4, 0, 0] },
      },
    ],
  };

  const workload = [
    {
      name: translate("home.workload.sales", "Sales"),
      value: agg.openDealCount,
    },
    {
      name: translate("home.workload.projects", "Projects"),
      value: data.queues.taskCount,
    },
    {
      name: translate("home.workload.helpdesk", "Helpdesk"),
      value: data.openTicketCount,
    },
    {
      name: translate("home.workload.hr", "HR"),
      value: data.queues.leaveCount,
    },
    {
      name: translate("home.workload.finance", "Finance"),
      value: data.queues.invoiceCount,
    },
  ];

  const workloadOption = {
    color: chart.palette,
    tooltip: { trigger: "item", ...tooltipBase },
    legend: {
      orient: "vertical",
      right: 0,
      top: "center",
      icon: "circle",
      itemWidth: 8,
      itemHeight: 8,
      itemGap: 12,
      textStyle: { color: chart.axis, fontSize: 12 },
    },
    series: [
      {
        type: "pie",
        cursor: "pointer",
        radius: ["58%", "82%"],
        center: ["34%", "50%"],
        avoidLabelOverlap: false,
        padAngle: 2,
        itemStyle: { borderRadius: 6 },
        label: { show: false },
        labelLine: { show: false },
        data: workload,
      },
    ],
  };

  const outcomeOption = {
    color: [chart.palette[2], chart.palette[5]],
    grid: { left: 6, right: 12, top: 28, bottom: 8, containLabel: true },
    legend: {
      right: 0,
      top: 0,
      icon: "circle",
      itemWidth: 8,
      itemHeight: 8,
      textStyle: { color: chart.axis, fontSize: 12 },
    },
    tooltip: { trigger: "axis", ...tooltipBase },
    xAxis: {
      type: "category",
      boundaryGap: false,
      data: agg.outcomeMonths,
      ...axisBase,
    },
    yAxis: {
      type: "value",
      ...axisBase,
      axisLine: { show: false },
      splitLine: { lineStyle: { color: chart.grid } },
    },
    series: [
      {
        name: translate("home.series.won", "Won"),
        type: "line",
        cursor: "pointer",
        smooth: true,
        symbol: "circle",
        symbolSize: 6,
        showSymbol: false,
        data: agg.won,
        lineStyle: { width: 3 },
        areaStyle: {
          color: {
            type: "linear",
            x: 0,
            y: 0,
            x2: 0,
            y2: 1,
            colorStops: [
              { offset: 0, color: hexA(chart.palette[2], 0.28) },
              { offset: 1, color: hexA(chart.palette[2], 0) },
            ],
          },
        },
      },
      {
        name: translate("home.series.lost", "Lost"),
        type: "line",
        cursor: "pointer",
        smooth: true,
        symbol: "circle",
        symbolSize: 6,
        showSymbol: false,
        data: agg.lost,
        lineStyle: { width: 3 },
        areaStyle: {
          color: {
            type: "linear",
            x: 0,
            y: 0,
            x2: 0,
            y2: 1,
            colorStops: [
              { offset: 0, color: hexA(chart.palette[5], 0.22) },
              { offset: 1, color: hexA(chart.palette[5], 0) },
            ],
          },
        },
      },
    ],
  };

  const feed = useMemo(() => {
    type FeedItem = {
      key: string;
      at: string;
      icon: LucideIcon;
      tone: string;
      module: string;
      text: string;
      meta: string;
      to: string;
    };
    const items: FeedItem[] = [];
    for (const activity of data.activities) {
      items.push({
        key: `activity-${activity.id}`,
        at: activity.date ?? "",
        icon: CheckCircle2,
        tone: "text-blue-600 bg-blue-500/12 dark:text-blue-400",
        module: translate("home.workload.sales", "Sales"),
        text: activity.subject ?? "—",
        meta: activity.deal?.title ?? "",
        to: `/activities/show/${activity.id}`,
      });
    }
    for (const ticket of data.openTickets.slice(0, 5)) {
      items.push({
        key: `ticket-${ticket.id}`,
        at: ticket.createdAt ?? "",
        icon: LifeBuoy,
        tone: "text-rose-600 bg-rose-500/12 dark:text-rose-400",
        module: translate("home.workload.helpdesk", "Helpdesk"),
        text: ticket.subject ?? "—",
        meta: [ticket.priority, ticket.category].filter(Boolean).join(" · "),
        to: `/tickets/show/${ticket.id}`,
      });
    }
    for (const leave of data.queues.leave.slice(0, 4)) {
      items.push({
        key: `leave-${leave.id}`,
        at: leave.createdAt ?? "",
        icon: CalendarCheck,
        tone: "text-teal-600 bg-teal-500/12 dark:text-teal-400",
        module: translate("home.workload.hr", "HR"),
        text: translate(
          "home.feed.leaveRequested",
          "{{name}} requested leave"
        ).replace("{{name}}", leave.employee?.name ?? "—"),
        meta: `${leave.type ?? ""} · ${leave.days ?? 0}d`,
        to: `/leave/show/${leave.id}`,
      });
    }
    return items
      .filter((item) => item.at)
      .sort((left, right) => right.at.localeCompare(left.at))
      .slice(0, 8);
  }, [data.activities, data.openTickets, data.queues.leave, translate]);

  const today = todayIso();

  return (
    <div className="flex flex-col gap-6">
      <BuildStoryBanner story={BUILD_STORY} />

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h2 className="text-3xl font-semibold tracking-[-0.035em]">
            {user.name
              ? translate("home.overview.greeting", "Welcome back, {{name}}").replace(
                  "{{name}}",
                  user.name
                )
              : translate("home.overview.title", "Overview")}
          </h2>
          <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
            {translate(
              "home.overview.description",
              "A live pulse across the whole company — sales, delivery, people and support in one place."
            )}
          </p>
        </div>
        <div className="flex min-w-0 flex-wrap items-center justify-end gap-2">
          <QuickSearchTrigger onOpen={() => setSearchOpen(true)} />
          <span className="hidden text-sm text-muted-foreground sm:inline">
            {new Intl.DateTimeFormat(locale, { dateStyle: "full" }).format(
              new Date(today)
            )}
          </span>
          <Button
            variant="outline"
            size="icon-sm"
            onClick={data.refetch}
            aria-label={translate("home.actions.refresh", "Refresh")}
          >
            <RefreshCcw className={cn(data.isFetching && "animate-spin")} />
          </Button>
        </div>
      </div>

      {/* KPI row — every tile opens the module it summarises. */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {data.isLoading ? (
          Array.from({ length: 4 }).map((_, index) => (
            <Card key={index}>
              <CardContent className="pt-6">
                <Skeleton className="h-3 w-24" />
                <Skeleton className="mt-3 h-8 w-32" />
                <Skeleton className="mt-3 h-3 w-20" />
              </CardContent>
            </Card>
          ))
        ) : (
          <>
            <KpiCard
              to="/deals"
              label={translate("home.kpi.pipeline.label", "Open pipeline")}
              value={currency(agg.pipelineValue, locale)}
              hint={translate("home.kpi.pipeline.hint", "{{count}} open deals").replace(
                "{{count}}",
                String(agg.openDealCount)
              )}
              icon={Wallet}
            />
            <KpiCard
              to="/forecast"
              label={translate("home.kpi.won.label", "Closed won this quarter")}
              value={currency(agg.wonThisQuarter, locale)}
              hint={translate("home.kpi.won.hint", "vs last quarter")}
              delta={agg.wonDelta}
              icon={DollarSign}
            />
            <KpiCard
              to="/tickets"
              label={translate("home.kpi.openTickets.label", "Open tickets")}
              value={String(data.openTicketCount)}
              hint={translate(
                "home.kpi.openTickets.hint2",
                "{{count}} active projects alongside"
              ).replace("{{count}}", String(agg.activeProjects))}
              icon={Ticket}
            />
            <KpiCard
              to="/invoices"
              label={translate("home.kpi.overdue.label", "Overdue receivables")}
              value={currency(agg.overdueInvoiceValue, locale)}
              hint={translate("home.kpi.overdue.hint", "{{count}} invoices past due").replace(
                "{{count}}",
                String(data.queues.invoiceCount)
              )}
              icon={FileWarning}
              tone="danger"
            />
          </>
        )}
      </div>

      <WeekStrip />

      {/* Action centre */}
      <Card>
        <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle>{translate("home.actionCenter.title", "My work")}</CardTitle>
            <CardDescription>
              {translate(
                "home.actionCenter.subtitle",
                "Everything waiting on a decision, pulled from every module."
              )}
            </CardDescription>
          </div>
          <div className="flex overflow-hidden rounded-lg border">
            {(
              [
                ["team", translate("home.actionCenter.scope.team", "Everyone")],
                ["mine", translate("home.actionCenter.scope.mine", "Assigned to me")],
              ] as const
            ).map(([value, label]) => (
              <Button
                key={value}
                variant={scope === value ? "secondary" : "ghost"}
                size="sm"
                className="rounded-none"
                disabled={value === "mine" && !user.id}
                onClick={() => setScope(value)}
              >
                {label}
              </Button>
            ))}
          </div>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="approvals">
            <TabsList variant="line" className="mb-2">
              <QueueTab
                value="approvals"
                label={translate("home.queue.approvals", "Leave approvals")}
                count={data.queues.leaveCount}
              />
              <QueueTab
                value="tasks"
                label={translate("home.queue.tasks", "Overdue tasks")}
                count={data.queues.taskCount}
              />
              <QueueTab
                value="tickets"
                label={translate("home.queue.tickets", "Open tickets")}
                count={data.queues.ticketCount}
              />
              <QueueTab
                value="invoices"
                label={translate("home.queue.invoices", "Overdue invoices")}
                count={data.queues.invoiceCount}
              />
            </TabsList>

            <TabsContent value="approvals">
              {scope === "mine" ? (
                <p className="pb-2 text-xs text-muted-foreground">
                  {translate(
                    "home.queue.approvals.scopeNote",
                    "Leave requests have no approver field yet, so this queue always shows the whole team."
                  )}
                </p>
              ) : null}
              <QueueList
                loading={data.isLoading}
                emptyText={translate(
                  "home.queue.approvals.empty",
                  "No leave requests are waiting."
                )}
                items={data.queues.leave.slice(0, 6).map((leave) => ({
                  key: String(leave.id),
                  to: `/leave/show/${leave.id}`,
                  title: leave.employee?.name ?? "—",
                  meta: `${leave.type ?? ""} · ${leave.days ?? 0}d · ${
                    leave.start_date?.slice(0, 10) ?? ""
                  }`,
                  badge: translate("home.queue.badge.pending", "Pending"),
                  tone: "warning" as const,
                }))}
                moreTo="/leave"
                moreLabel={translate("home.queue.viewAll", "View all")}
              />
            </TabsContent>

            <TabsContent value="tasks">
              <QueueList
                loading={data.isLoading}
                emptyText={translate(
                  "home.queue.tasks.empty",
                  "Nothing is overdue. Nice."
                )}
                items={data.queues.tasks.slice(0, 6).map((task) => ({
                  key: String(task.id),
                  to: `/tasks`,
                  title: task.title ?? "—",
                  meta: [task.project?.name, task.assignee?.nickname]
                    .filter(Boolean)
                    .join(" · "),
                  badge: task.due_date?.slice(0, 10) ?? "",
                  tone: "danger" as const,
                }))}
                moreTo="/tasks"
                moreLabel={translate("home.queue.viewAll", "View all")}
              />
            </TabsContent>

            <TabsContent value="tickets">
              <QueueList
                loading={data.isLoading}
                emptyText={translate(
                  "home.queue.tickets.empty",
                  "No open tickets in this scope."
                )}
                items={data.queues.tickets.slice(0, 6).map((ticket) => ({
                  key: String(ticket.id),
                  to: `/tickets/show/${ticket.id}`,
                  title: ticket.subject ?? "—",
                  meta: [ticket.category, ticket.assignee?.nickname]
                    .filter(Boolean)
                    .join(" · "),
                  badge: ticket.priority ?? "",
                  tone:
                    ticket.priority === "urgent" || ticket.priority === "high"
                      ? ("danger" as const)
                      : ("default" as const),
                }))}
                moreTo="/tickets"
                moreLabel={translate("home.queue.viewAll", "View all")}
              />
            </TabsContent>

            <TabsContent value="invoices">
              <QueueList
                loading={data.isLoading}
                emptyText={translate(
                  "home.queue.invoices.empty",
                  "Nothing is past due."
                )}
                items={data.queues.invoices.slice(0, 6).map((invoice) => ({
                  key: String(invoice.id),
                  to: `/invoices/show/${invoice.id}`,
                  title: `${invoice.invoice_number ?? ""} · ${
                    invoice.client_name ?? ""
                  }`,
                  meta: translate("home.queue.invoices.due", "Due {{date}}").replace(
                    "{{date}}",
                    invoice.due_date?.slice(0, 10) ?? "—"
                  ),
                  badge: currency(
                    invoiceAmount(invoice, data.invoiceAmounts),
                    locale
                  ),
                  tone: "danger" as const,
                }))}
                moreTo="/invoices"
                moreLabel={translate("home.queue.viewAll", "View all")}
              />
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {/* Charts */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader>
            <CardTitle>
              {translate("home.chart.cash.title", "Invoiced vs collected")}
            </CardTitle>
            <CardDescription>
              {translate(
                "home.chart.cash.subtitle",
                "Monthly invoiced amount and the share already paid."
              )}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {data.isLoading ? (
              <Skeleton className="h-72 w-full" />
            ) : (
              <ReactECharts
                key={`rev-${chart.isDark}`}
                option={revenueOption}
                style={{ height: 288 }}
                opts={{ renderer: "svg" }}
              />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>
              {translate("home.chart.workload.title", "Workload by area")}
            </CardTitle>
            <CardDescription>
              {translate(
                "home.chart.workload.subtitle2",
                "Open items waiting in each module right now."
              )}
            </CardDescription>
            <p className="text-xs text-muted-foreground">
              {translate(
                "home.chart.workload.drill",
                "Click a segment to open that module."
              )}
            </p>
          </CardHeader>
          <CardContent>
            {data.isLoading ? (
              <Skeleton className="h-72 w-full" />
            ) : (
              <ReactECharts
                key={`wl-${chart.isDark}`}
                option={workloadOption}
                style={{ height: 288, cursor: "pointer" }}
                opts={{ renderer: "svg" }}
                onEvents={{
                  click: (params: { dataIndex?: number }) => {
                    const routes = [
                      "/deals",
                      "/tasks",
                      "/tickets",
                      "/leave",
                      "/invoices",
                    ];
                    const route = routes[params.dataIndex ?? -1];
                    if (route) navigate(route);
                  },
                }}
              />
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader>
            <CardTitle>
              {translate("home.chart.outcomes.title", "Deal outcomes")}
            </CardTitle>
            <CardDescription>
              {translate(
                "home.chart.outcomes.subtitle",
                "Deals won and lost by expected close month."
              )}
            </CardDescription>
            <p className="text-xs text-muted-foreground">
              {translate(
                "home.chart.outcomes.drill",
                "Click a point to see those deals."
              )}
            </p>
          </CardHeader>
          <CardContent>
            {data.isLoading ? (
              <Skeleton className="h-72 w-full" />
            ) : (
              <ReactECharts
                key={`outcome-${chart.isDark}`}
                option={outcomeOption}
                style={{ height: 280, cursor: "pointer" }}
                opts={{ renderer: "svg" }}
                onEvents={{
                  click: (params: { seriesIndex?: number }) => {
                    if (params.seriesIndex === 0) {
                      navigate("/deals?tab=table&stage=won");
                    } else if (params.seriesIndex === 1) {
                      navigate("/deals?tab=table&stage=lost");
                    }
                  },
                }}
              />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>
              {translate("home.chart.activity.title", "Recent activity")}
            </CardTitle>
            <CardDescription>
              {translate("home.chart.activity.subtitle", "The latest across every module.")}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {data.isLoading ? (
              <div className="space-y-3">
                {Array.from({ length: 5 }).map((_, index) => (
                  <Skeleton key={index} className="h-10 w-full" />
                ))}
              </div>
            ) : feed.length === 0 ? (
              <p className="rounded-lg border border-dashed px-4 py-10 text-center text-sm text-muted-foreground">
                {translate("home.feed.empty", "Nothing has happened yet today.")}
              </p>
            ) : (
              <div className="space-y-1">
                {feed.map((item) => {
                  const Icon = item.icon;
                  return (
                    <Link
                      key={item.key}
                      to={item.to}
                      className="flex items-start gap-3 rounded-lg px-2 py-2 hover:bg-accent/60"
                    >
                      <span
                        className={cn(
                          "mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg",
                          item.tone
                        )}
                      >
                        <Icon className="size-4" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm leading-5 text-foreground">
                          {item.text}
                        </p>
                        <p className="truncate text-xs text-muted-foreground">
                          {[item.module, item.meta].filter(Boolean).join(" · ")}
                        </p>
                      </div>
                      <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                        {item.at.slice(0, 10)}
                      </span>
                    </Link>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Announcements — the latest published knowledge-base articles. */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>
              {translate("home.announcements.title", "Company updates")}
            </CardTitle>
            <CardDescription>
              {translate(
                "home.announcements.subtitle",
                "Newest published articles from the knowledge base."
              )}
            </CardDescription>
          </div>
          <Button variant="ghost" size="sm" render={<Link to="/articles" />}>
            {translate("home.queue.viewAll", "View all")}
            <ArrowRight />
          </Button>
        </CardHeader>
        <CardContent>
          {data.articles.length === 0 ? (
            <p className="rounded-lg border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
              {translate(
                "home.announcements.empty",
                "Nothing published yet."
              )}
            </p>
          ) : (
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
              {data.articles.map((article) => (
                <Link
                  key={String(article.id)}
                  to={`/articles/show/${article.id}`}
                  className="flex flex-col gap-1 rounded-xl border p-3 transition-colors hover:border-primary/40 hover:bg-accent/40"
                >
                  <p className="line-clamp-2 text-sm font-medium">
                    {article.title}
                  </p>
                  <p className="line-clamp-2 text-xs text-muted-foreground">
                    {article.summary}
                  </p>
                  <span className="mt-1 text-[11px] text-muted-foreground tabular-nums">
                    {article.createdAt?.slice(0, 10)}
                  </span>
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Module shortcuts, pinnable */}
      <div className="flex flex-col gap-3">
        <div className="flex items-baseline justify-between">
          <h3 className="text-lg font-semibold tracking-tight">
            {translate("home.modules.heading", "Modules")}
          </h3>
          <span className="text-xs text-muted-foreground">
            {translate("home.modules.pinHint", "Pin the ones you use daily")}
          </span>
        </div>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          {orderedModules.map((mod) => {
            const Icon = mod.icon;
            const isPinned = pinned.includes(mod.id);
            return (
              <div
                key={mod.id}
                className={cn(
                  "group/mod relative flex items-center gap-3 rounded-xl border border-border/70 bg-card p-4 shadow-[0_1px_3px_rgba(0,0,0,0.05)] transition-colors hover:border-primary/40 hover:bg-accent/50",
                  isPinned && "border-primary/40"
                )}
              >
                <Link to={mod.to} className="flex min-w-0 flex-1 items-center gap-3">
                  <span
                    className={cn(
                      "flex size-10 shrink-0 items-center justify-center rounded-xl",
                      mod.color
                    )}
                  >
                    <Icon className="size-5" />
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-foreground">
                      {translate(mod.labelKey)}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {translate(mod.descKey)}
                    </p>
                  </div>
                </Link>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  className={cn(
                    "shrink-0 text-muted-foreground",
                    !isPinned && "md:opacity-0 md:group-hover/mod:opacity-100"
                  )}
                  onClick={() => togglePin(mod.id)}
                  aria-label={translate("home.modules.pin", "Pin module")}
                >
                  {isPinned ? <PinOff /> : <Pin />}
                </Button>
              </div>
            );
          })}
        </div>
      </div>

      <QuickSearch open={searchOpen} onOpenChange={setSearchOpen} />
    </div>
  );
}

// ---------------------------------------------------------------------------

function QueueTab({
  value,
  label,
  count,
}: {
  value: string;
  label: string;
  count: number;
}) {
  return (
    <TabsTrigger value={value}>
      {label}
      <span
        className={cn(
          "ml-1.5 rounded px-1.5 py-0.5 text-[11px] font-medium tabular-nums",
          count > 0
            ? "bg-primary/15 text-primary"
            : "bg-muted text-muted-foreground"
        )}
      >
        {count}
      </span>
    </TabsTrigger>
  );
}

type QueueItem = {
  key: string;
  to: string;
  title: string;
  meta: string;
  badge: string;
  tone: "default" | "warning" | "danger";
};

function QueueList({
  items,
  loading,
  emptyText,
  moreTo,
  moreLabel,
}: {
  items: QueueItem[];
  loading: boolean;
  emptyText: string;
  moreTo: string;
  moreLabel: string;
}) {
  if (loading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 4 }).map((_, index) => (
          <Skeleton key={index} className="h-11 w-full" />
        ))}
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed px-4 py-10 text-center">
        <CheckCircle2 className="size-5 text-emerald-500" />
        <p className="text-sm text-muted-foreground">{emptyText}</p>
      </div>
    );
  }

  return (
    <div className="space-y-1">
      {items.map((item) => (
        <Link
          key={item.key}
          to={item.to}
          className="flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-accent/60"
        >
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{item.title}</p>
            {item.meta ? (
              <p className="truncate text-xs text-muted-foreground">{item.meta}</p>
            ) : null}
          </div>
          {item.badge ? (
            <span
              className={cn(
                "shrink-0 rounded-md px-1.5 py-0.5 text-xs font-medium tabular-nums",
                item.tone === "danger"
                  ? "bg-red-500/12 text-red-700 dark:text-red-400"
                  : item.tone === "warning"
                    ? "bg-amber-500/12 text-amber-700 dark:text-amber-400"
                    : "bg-muted text-muted-foreground"
              )}
            >
              {item.badge}
            </span>
          ) : null}
        </Link>
      ))}
      <Button
        variant="ghost"
        size="sm"
        className="mt-1"
        render={<Link to={moreTo} />}
      >
        {moreLabel}
        <ArrowRight />
      </Button>
    </div>
  );
}

function KpiCard({
  label,
  value,
  hint,
  delta,
  icon: Icon,
  to,
  tone,
}: {
  label: string;
  value: string;
  hint: string;
  delta?: number | null;
  icon: LucideIcon;
  to: string;
  tone?: "default" | "danger";
}): ReactNode {
  const isUp = (delta ?? 0) >= 0;

  return (
    <Link to={to}>
      <Card className="h-full overflow-hidden transition-colors hover:border-primary/40 hover:bg-accent/30">
        <CardContent className="pt-6">
          <div className="flex items-center justify-between gap-2">
            <p className="truncate text-sm text-muted-foreground">{label}</p>
            <span
              className={cn(
                "flex size-7 shrink-0 items-center justify-center rounded-lg",
                tone === "danger"
                  ? "bg-red-500/12 text-red-600 dark:text-red-400"
                  : "bg-blue-500/12 text-blue-600 dark:text-blue-400"
              )}
            >
              {tone === "danger" ? (
                <AlertTriangle className="size-4" />
              ) : (
                <Icon className="size-4" />
              )}
            </span>
          </div>
          <p className="mt-2 text-3xl font-semibold tracking-tight tabular-nums">
            {value}
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {delta !== undefined && delta !== null ? (
              <span
                className={cn(
                  "inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 text-xs font-medium",
                  isUp
                    ? "bg-emerald-500/12 text-emerald-700 dark:text-emerald-400"
                    : "bg-red-500/12 text-red-700 dark:text-red-400"
                )}
              >
                {isUp ? (
                  <ArrowUpRight className="size-3" />
                ) : (
                  <ArrowDownRight className="size-3" />
                )}
                {Math.abs(delta)}%
              </span>
            ) : null}
            <span className="truncate text-xs text-muted-foreground">{hint}</span>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

/** Append an alpha channel to a #rrggbb hex for ECharts gradient stops. */
function hexA(hex: string, alpha: number): string {
  const a = Math.round(Math.max(0, Math.min(1, alpha)) * 255)
    .toString(16)
    .padStart(2, "0");
  return `${hex}${a}`;
}
