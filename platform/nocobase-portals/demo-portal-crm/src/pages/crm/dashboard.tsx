import { useList, useTranslate } from "@refinedev/core";
import { useQuery } from "@tanstack/react-query";
import { addDays, endOfMonth, format, startOfMonth } from "date-fns";
import ReactECharts from "echarts-for-react";
import { Outlet, useNavigate } from "react-router";
import { LoadingState } from "@/components/app-shell/loading-state";
import {
  BuildStoryBanner,
  type BuildStory,
} from "@/components/build-story/build-story-banner";
import { Skeleton } from "@/components/ui/skeleton";
import { nocobaseClient } from "@nocobase/portal-sdk/client";
import {
  ACTIVITY_TYPES,
  CRM_CHART_COLORS,
  DEAL_STAGE_PROBABILITY,
  DEAL_STAGES,
  FOLLOW_UP_STATUSES,
  OPEN_DEAL_STAGES,
  formatCurrency,
  formatDate,
  labelFor,
} from "./constants";
import { useReportAnalytics } from "./analytics";
import { ChartCard, MetricCard } from "./overview-cards";
import { crmRoutes } from "./routes";
import { useOpenContextualChild } from "./route-surfaces";
import { EnumBadge, useLocale } from "./shared";
import type { CustomerRecord, DealRecord, FollowUpRecord } from "./types";

type AggregateRow = Record<string, string | number | null>;

// How this portal was built — effective (active) time, derived from the build's
// git commit bursts. Shown in the pinned banner on the dashboard.
const BUILD_STORY: BuildStory = {
  models: ["GPT-5.6 sol", "Opus 4.8"],
  moduleCount: 5,
  moduleLabelKey: "buildStory.modules",
  tracks: [
    { labelKey: "buildStory.phase.scaffold", models: ["GPT-5.6 sol"], start: 0, minutes: 20 },
    { labelKey: "buildStory.phase.style", models: ["Opus 4.8"], start: 20, minutes: 15 },
    { labelKey: "buildStory.phase.enrich", models: ["Opus 4.8"], start: 35, minutes: 15 },
    { labelKey: "buildStory.phase.finalize", models: ["Opus 4.8"], start: 50, minutes: 10 },
  ],
};

const todayIso = () => new Date().toISOString().slice(0, 10);

const sumMeasure = { field: ["amount"], aggregation: "sum", alias: "total" };
const countMeasure = { field: ["id"], aggregation: "count", alias: "count" };

function usePipelineSummary() {
  const monthStart = format(startOfMonth(new Date()), "yyyy-MM-dd");
  const monthEnd = format(endOfMonth(new Date()), "yyyy-MM-dd");
  const soon = format(addDays(new Date(), 30), "yyyy-MM-dd");
  const today = todayIso();

  return useQuery({
    queryKey: ["crm", "pipeline-summary", monthStart, soon],
    queryFn: async () => {
      const openFilter = { stage: { $in: OPEN_DEAL_STAGES } };
      const [open, closingSoon, wonThisMonth, byStage] = await Promise.all([
        nocobaseClient.action<AggregateRow[]>("crm_deals", "query", {
          body: {
            measures: [sumMeasure, countMeasure],
            filter: openFilter,
          },
        }),
        nocobaseClient.action<AggregateRow[]>("crm_deals", "query", {
          body: {
            measures: [sumMeasure, countMeasure],
            filter: {
              ...openFilter,
              expected_close_date: { $between: [today, soon] },
            },
          },
        }),
        nocobaseClient.action<AggregateRow[]>("crm_deals", "query", {
          body: {
            measures: [sumMeasure, countMeasure],
            filter: {
              stage: "won",
              closed_date: { $between: [monthStart, monthEnd] },
            },
          },
        }),
        nocobaseClient.action<AggregateRow[]>("crm_deals", "query", {
          body: {
            measures: [sumMeasure, countMeasure],
            dimensions: [{ field: ["stage"], alias: "stage" }],
          },
        }),
      ]);
      return {
        open: open[0] ?? {},
        closingSoon: closingSoon[0] ?? {},
        wonThisMonth: wonThisMonth[0] ?? {},
        byStage: byStage ?? [],
      };
    },
  });
}

function useDormantAccounts() {
  return useQuery({
    queryKey: ["crm", "dormant-accounts"],
    queryFn: async () => {
      const [lastTouch, customers] = await Promise.all([
        nocobaseClient.action<AggregateRow[]>("crm_activities", "query", {
          body: {
            measures: [{ field: ["date"], aggregation: "max", alias: "last_date" }],
            dimensions: [{ field: ["customer_id"], alias: "customer_id" }],
          },
        }),
        nocobaseClient.action<CustomerRecord[]>("crm_customers", "list", {
          query: { page: 1, pageSize: 250, sort: "company_name" },
        }),
      ]);
      const lastTouchByCustomer = new Map<string, string>();
      for (const row of lastTouch ?? []) {
        const customerId = row.customer_id;
        const lastDate = row.last_date;
        if (customerId !== null && customerId !== undefined && lastDate) {
          lastTouchByCustomer.set(String(customerId), String(lastDate));
        }
      }
      const cutoff = addDays(new Date(), -30);
      const dormant = customers
        .filter((customer) => (customer.status ?? "active") === "active")
        .map((customer) => ({
          customer,
          lastDate: lastTouchByCustomer.get(String(customer.id)) ?? null,
        }))
        .filter(
          ({ lastDate }) =>
            lastDate === null || new Date(lastDate).getTime() < cutoff.getTime()
        )
        .sort((left, right) =>
          (left.lastDate ?? "").localeCompare(right.lastDate ?? "")
        )
        .slice(0, 8);
      return { dormant, total: dormant.length };
    },
  });
}

export function DashboardPage() {
  const translate = useTranslate();
  const locale = useLocale();
  const navigate = useNavigate();
  const openChild = useOpenContextualChild();
  const summary = usePipelineSummary();

  // Every headline number opens the records behind it, so the dashboard is a
  // way into the data rather than a wall of totals.
  const drillToPipeline = (params: Record<string, string>) =>
    navigate(`${crmRoutes.pipeline}?${new URLSearchParams(params).toString()}`);
  const dormant = useDormantAccounts();
  const analytics = useReportAnalytics();

  const soon = format(addDays(new Date(), 30), "yyyy-MM-dd");
  const closingSoon = useList<DealRecord>({
    resource: "crm_deals",
    pagination: { mode: "server", currentPage: 1, pageSize: 8 },
    sorters: [{ field: "expected_close_date", order: "asc" }],
    filters: [
      { field: "stage", operator: "in", value: OPEN_DEAL_STAGES },
      { field: "expected_close_date", operator: "lte", value: soon },
    ],
    meta: { appends: ["customer"] },
    errorNotification: false,
    queryOptions: { retry: false },
  });

  const nextFollowUps = useList<FollowUpRecord>({
    resource: "crm_follow_ups",
    pagination: { mode: "server", currentPage: 1, pageSize: 5 },
    sorters: [{ field: "due_date", order: "asc" }],
    filters: [{ field: "status", operator: "eq", value: "pending" }],
    meta: { appends: ["customer"] },
    errorNotification: false,
    queryOptions: { retry: false },
  });

  const openTotal = Number(summary.data?.open?.total ?? 0);
  const openCount = Number(summary.data?.open?.count ?? 0);
  const soonTotal = Number(summary.data?.closingSoon?.total ?? 0);
  const soonCount = Number(summary.data?.closingSoon?.count ?? 0);
  const wonTotal = Number(summary.data?.wonThisMonth?.total ?? 0);
  const wonCount = Number(summary.data?.wonThisMonth?.count ?? 0);
  const dormantTotal = dormant.data?.total ?? 0;
  const weightedForecast = (analytics.data?.byStage ?? [])
    .filter((row) => OPEN_DEAL_STAGES.some((stage) => stage === row.stage))
    .reduce(
      (sum, row) => sum + Number(row.amount ?? 0) * (DEAL_STAGE_PROBABILITY[String(row.stage ?? "")] ?? 0),
      0
    );

  const byStage = DEAL_STAGES.map((stage) => {
    const row = summary.data?.byStage.find(
      (item) => item.stage === stage.value
    );
    return {
      ...stage,
      label: labelFor(DEAL_STAGES, stage.value, translate),
      total: Number(row?.total ?? 0),
      count: Number(row?.count ?? 0),
    };
  });

  const chartOption = {
    color: CRM_CHART_COLORS,
    grid: { left: 8, right: 8, top: 16, bottom: 24, containLabel: true },
    tooltip: { trigger: "axis" },
    xAxis: {
      type: "category",
      data: byStage.map((stage) => stage.label),
      axisLine: { lineStyle: { color: "var(--border)" } },
      axisLabel: { color: "var(--muted-foreground)" },
    },
    yAxis: {
      type: "value",
      axisLabel: { color: "var(--muted-foreground)" },
      splitLine: { lineStyle: { color: "var(--border)", opacity: 0.5 } },
    },
    series: [
      {
        type: "bar",
        barWidth: "45%",
        data: byStage.map((stage, index) => ({
          value: stage.total,
          itemStyle: {
            color: CRM_CHART_COLORS[index % CRM_CHART_COLORS.length],
            borderRadius: [6, 6, 0, 0],
          },
        })),
      },
    ],
  };

  const wonLossRows = analytics.data?.wonLoss ?? [];
  const winLossOption = {
    color: ["#2563eb", "#93c5fd"],
    tooltip: { trigger: "item" },
    legend: { bottom: 0, textStyle: { color: "var(--muted-foreground)" } },
    series: [{
      type: "pie",
      radius: ["52%", "72%"],
      center: ["50%", "45%"],
      itemStyle: { borderColor: "var(--card)", borderWidth: 3 },
      label: { color: "var(--muted-foreground)", formatter: "{b}\n{c}" },
      data: ["won", "lost"].map((stage) => ({
        name: labelFor(DEAL_STAGES, stage, translate),
        value: Number(wonLossRows.find((row) => row.stage === stage)?.count ?? 0),
      })),
    }],
  };
  const monthlyRows = analytics.data?.monthly ?? [];
  const monthlyOption = {
    color: ["#2563eb"],
    tooltip: { trigger: "axis" },
    grid: { left: 8, right: 36, top: 20, bottom: 28, containLabel: true },
    xAxis: { type: "category", boundaryGap: false, data: monthlyRows.map((row) => row.month), axisLabel: { color: "var(--muted-foreground)", interval: 0 }, axisLine: { lineStyle: { color: "var(--border)" } } },
    yAxis: { type: "value", axisLabel: { color: "var(--muted-foreground)" }, splitLine: { lineStyle: { color: "var(--border)", opacity: 0.55 } } },
    series: [{ type: "line", smooth: true, symbolSize: 8, lineStyle: { width: 3 }, areaStyle: { color: "rgba(37,99,235,.13)" }, data: monthlyRows.map((row) => row.amount) }],
  };
  const activityRows = ACTIVITY_TYPES.map((type) => ({
    label: labelFor(ACTIVITY_TYPES, type.value, translate),
    count: Number(analytics.data?.activity.find((row) => row.type === type.value)?.count ?? 0),
  }));
  const activityOption = {
    color: CRM_CHART_COLORS,
    tooltip: { trigger: "axis", axisPointer: { type: "shadow" } },
    grid: { left: 8, right: 16, top: 20, bottom: 28, containLabel: true },
    xAxis: { type: "category", data: activityRows.map((row) => row.label), axisLabel: { color: "var(--muted-foreground)" }, axisLine: { lineStyle: { color: "var(--border)" } } },
    yAxis: { type: "value", minInterval: 1, axisLabel: { color: "var(--muted-foreground)" }, splitLine: { lineStyle: { color: "var(--border)", opacity: 0.55 } } },
    series: [{ type: "bar", barMaxWidth: 44, data: activityRows.map((row, index) => ({ value: row.count, itemStyle: { color: CRM_CHART_COLORS[index], borderRadius: [6, 6, 0, 0] } })) }],
  };
  const leaderboard = (analytics.data?.pipeline ?? [])
    .filter((row) => row.stage === "won" && row.owner_name)
    .map((row) => ({ name: String(row.owner_name), amount: Number(row.amount ?? 0), count: Number(row.count ?? 0) }))
    .sort((left, right) => right.amount - left.amount);

  const today = todayIso();

  return (
    <div className="flex flex-col gap-6">
      <BuildStoryBanner story={BUILD_STORY} />

      <div>
        <h2 className="text-3xl font-semibold tracking-[-0.035em]">
          {translate("crm.dashboard.title", { ns: "starter" }, "Dashboard")}
        </h2>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
          {translate(
            "crm.dashboard.description",
            { ns: "starter" },
            "This month's pipeline, what's likely to close, and accounts that need attention."
          )}
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <MetricCard
          loading={summary.isLoading}
          label={translate("crm.dashboard.openPipeline", { ns: "starter" }, "Open pipeline")}
          value={formatCurrency(openTotal, locale)}
          detail={translate(
            "crm.dashboard.openPipeline.sub",
            { ns: "starter", count: openCount },
            `${openCount} active deals`
          )}
          onClick={() => drillToPipeline({ layout: "table" })}
        />
        <MetricCard
          loading={analytics.isLoading}
          label={translate("crm.dashboard.weightedForecast", { ns: "starter" }, "Weighted forecast")}
          value={formatCurrency(weightedForecast, locale)}
          detail={translate("crm.dashboard.weightedForecast.sub", { ns: "starter" }, "Stage probability applied to every deal")}
          onClick={() => drillToPipeline({ layout: "table" })}
        />
        <MetricCard
          loading={summary.isLoading}
          label={translate("crm.dashboard.closingSoon", { ns: "starter" }, "Expected to close (30 days)")}
          value={formatCurrency(soonTotal, locale)}
          detail={translate(
            "crm.dashboard.closingSoon.sub",
            { ns: "starter", count: soonCount },
            `${soonCount} deals with dates set`
          )}
          onClick={() => drillToPipeline({ from: todayIso(), to: soon, layout: "table" })}
        />
        <MetricCard
          loading={summary.isLoading}
          label={translate("crm.dashboard.wonThisMonth", { ns: "starter" }, "Won this month")}
          value={formatCurrency(wonTotal, locale)}
          detail={translate(
            "crm.dashboard.wonThisMonth.sub",
            { ns: "starter", count: wonCount },
            `${wonCount} deals closed won`
          )}
          onClick={() => drillToPipeline({ stage: "won", layout: "table" })}
        />
        <MetricCard
          loading={dormant.isLoading}
          label={translate("crm.dashboard.dormant", { ns: "starter" }, "Untouched 30+ days")}
          value={String(dormantTotal)}
          detail={translate(
            "crm.dashboard.dormant.sub",
            { ns: "starter" },
            "Active accounts with no activity"
          )}
          onClick={() => navigate(`${crmRoutes.customers}?status=active`)}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <ChartCard
          title={translate("crm.dashboard.byStage.title", { ns: "starter" }, "Pipeline by stage")}
          description={translate(
            "crm.dashboard.byStage.description",
            { ns: "starter" },
            "Total deal value in each stage."
          )}
        >
          {summary.isLoading ? (
            <Skeleton className="h-64 w-full" />
          ) : (
            <ReactECharts
              option={chartOption}
              opts={{ renderer: "svg" }}
              style={{ height: 256 }}
              onEvents={{
                click: (params: { dataIndex?: number }) => {
                  const stage = byStage[params.dataIndex ?? -1];
                  if (stage) drillToPipeline({ stage: stage.value, layout: "table" });
                },
              }}
            />
          )}
        </ChartCard>

        <ChartCard
          title={translate("crm.dashboard.closingList.title", { ns: "starter" }, "Likely to close")}
          description={translate(
            "crm.dashboard.closingList.description",
            { ns: "starter" },
            "Open deals with an expected close in the next 30 days."
          )}
        >
          {closingSoon.query.isLoading ? (
            <LoadingState className="min-h-40" />
            ) : closingSoon.result.data.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                {translate(
                  "crm.dashboard.closingList.empty",
                  { ns: "starter" },
                  "No open deals are expected to close in the next 30 days."
                )}
              </p>
            ) : (
              <div className="space-y-1">
                {closingSoon.result.data.map((deal) => (
                  <button
                    type="button"
                    key={String(deal.id)}
                    onClick={() => openChild(`deals/edit/${deal.id}`)}
                    className="flex w-full items-center justify-between gap-3 rounded-lg px-2 py-2.5 text-left hover:bg-accent"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">
                        {deal.title || "—"}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        {deal.customer?.company_name || "—"} ·{" "}
                        {labelFor(DEAL_STAGES, deal.stage ?? "inquiry", translate)}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-semibold tabular-nums">
                        {formatCurrency(deal.amount, locale)}
                      </p>
                      <p className="text-xs text-muted-foreground tabular-nums">
                        {formatDate(deal.expected_close_date, locale)}
                      </p>
                    </div>
                  </button>
                ))}
              </div>
            )}
        </ChartCard>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <ChartCard
          title={translate("crm.dashboard.dormantList.title", { ns: "starter" }, "Accounts to touch")}
          description={translate(
            "crm.dashboard.dormantList.description",
            { ns: "starter" },
            "Active accounts with no logged call, meeting or email in 30 days."
          )}
        >
            {dormant.isLoading ? (
              <LoadingState className="min-h-40" />
            ) : (dormant.data?.dormant.length ?? 0) === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                {translate(
                  "crm.dashboard.dormantList.empty",
                  { ns: "starter" },
                  "Every active account has been touched recently. Nice work."
                )}
              </p>
            ) : (
              <div className="space-y-1">
                {dormant.data?.dormant.map(({ customer, lastDate }) => (
                  <button
                    type="button"
                    key={String(customer.id)}
                    onClick={() => openChild(`customers/show/${customer.id}`)}
                    className="flex w-full items-center justify-between gap-3 rounded-lg px-2 py-2.5 text-left hover:bg-accent"
                  >
                    <span className="truncate text-sm font-medium">
                      {customer.company_name || "—"}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {lastDate
                        ? translate(
                            "crm.dashboard.dormantList.lastTouch",
                            { ns: "starter" },
                            "Last touch"
                          ) + ` ${formatDate(lastDate, locale)}`
                        : translate(
                            "crm.dashboard.dormantList.never",
                            { ns: "starter" },
                            "Never contacted"
                          )}
                    </span>
                  </button>
                ))}
              </div>
            )}
        </ChartCard>

        <ChartCard
          title={translate("crm.dashboard.followUps.title", { ns: "starter" }, "Next follow-ups")}
          description={translate(
            "crm.dashboard.followUps.description",
            { ns: "starter" },
            "The reminders due soonest."
          )}
        >
            {nextFollowUps.query.isLoading ? (
              <LoadingState className="min-h-40" />
            ) : nextFollowUps.result.data.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                {translate(
                  "crm.dashboard.followUps.empty",
                  { ns: "starter" },
                  "No pending follow-ups."
                )}
              </p>
            ) : (
              <div className="space-y-1">
                {nextFollowUps.result.data.map((followUp) => {
                  const overdue = (followUp.due_date ?? "") < today;
                  return (
                    <button
                      type="button"
                      key={String(followUp.id)}
                      onClick={() => openChild(`follow-ups/edit/${followUp.id}`)}
                      className="flex w-full items-center justify-between gap-3 rounded-lg px-2 py-2.5 text-left hover:bg-accent"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">
                          {followUp.subject || "—"}
                        </p>
                        <p className="truncate text-xs text-muted-foreground">
                          {followUp.customer?.company_name || "—"}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <EnumBadge
                          value="pending"
                          label={labelFor(FOLLOW_UP_STATUSES, "pending", translate)}
                        />
                        <span
                          className={
                            "text-xs tabular-nums " +
                            (overdue
                              ? "font-medium text-red-600 dark:text-red-400"
                              : "text-muted-foreground")
                          }
                        >
                          {formatDate(followUp.due_date, locale)}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
        </ChartCard>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <ChartCard title={translate("crm.dashboard.winLoss.title", { ns: "starter" }, "Win / loss analysis")} description={translate("crm.dashboard.winLoss.description", { ns: "starter" }, "Closed deals split by outcome.")}>
          {analytics.isLoading ? <Skeleton className="h-72 w-full" /> : <ReactECharts option={winLossOption} opts={{ renderer: "svg" }} style={{ height: 288 }} />}
        </ChartCard>
        <ChartCard className="xl:col-span-2" title={translate("crm.dashboard.monthly.title", { ns: "starter" }, "Monthly won revenue")} description={translate("crm.dashboard.monthly.description", { ns: "starter" }, "Closed-won value by month.")}>
          {analytics.isLoading ? <Skeleton className="h-72 w-full" /> : <ReactECharts option={monthlyOption} opts={{ renderer: "svg" }} style={{ height: 288 }} />}
        </ChartCard>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <ChartCard title={translate("crm.dashboard.activityVolume.title", { ns: "starter" }, "Activity volume")} description={translate("crm.dashboard.activityVolume.description", { ns: "starter" }, "Logged calls, meetings and emails.")}>
          {analytics.isLoading ? <Skeleton className="h-72 w-full" /> : <ReactECharts option={activityOption} opts={{ renderer: "svg" }} style={{ height: 288 }} />}
        </ChartCard>
        <ChartCard title={translate("crm.dashboard.topAccounts.title", { ns: "starter" }, "Top accounts")} description={translate("crm.dashboard.topAccounts.description", { ns: "starter" }, "Accounts ranked by total deal value.")}>
          <div className="space-y-1">
            {(analytics.data?.topAccounts ?? []).map((row, index) => (
              <div key={String(row.customer_id ?? index)} className="flex items-center justify-between gap-3 rounded-lg px-2 py-2.5 hover:bg-accent">
                <div className="flex min-w-0 items-center gap-3"><span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-blue-500/10 text-xs font-semibold text-blue-700 dark:text-blue-300">{index + 1}</span><div className="min-w-0"><p className="truncate text-sm font-medium">{row.customer_name ?? translate("crm.reports.unassigned", { ns: "starter" }, "Unassigned")}</p><p className="text-xs text-muted-foreground">{translate("crm.dashboard.dealCount", { ns: "starter", count: Number(row.count ?? 0) }, `${Number(row.count ?? 0)} deals`)}</p></div></div>
                <span className="text-sm font-semibold tabular-nums">{formatCurrency(Number(row.amount ?? 0), locale)}</span>
              </div>
            ))}
          </div>
        </ChartCard>
        <ChartCard title={translate("crm.dashboard.leaderboard.title", { ns: "starter" }, "Sales leaderboard")} description={translate("crm.dashboard.leaderboard.description", { ns: "starter" }, "Owners ranked by won revenue.")}>
          <div className="space-y-1">
            {leaderboard.map((row, index) => (
              <div key={row.name} className="flex items-center justify-between gap-3 rounded-lg px-2 py-2.5 hover:bg-accent">
                <div className="flex min-w-0 items-center gap-3"><span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-sky-500/10 text-xs font-semibold text-sky-700 dark:text-sky-300">{index + 1}</span><div className="min-w-0"><p className="truncate text-sm font-medium">{row.name}</p><p className="text-xs text-muted-foreground">{translate("crm.dashboard.wonDeals", { ns: "starter", count: row.count }, `${row.count} won deals`)}</p></div></div>
                <span className="text-sm font-semibold tabular-nums">{formatCurrency(row.amount, locale)}</span>
              </div>
            ))}
          </div>
        </ChartCard>
      </div>
      <Outlet />
    </div>
  );
}
