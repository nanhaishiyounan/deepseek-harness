import { useList, useTranslate } from "@refinedev/core";
import ReactECharts from "echarts-for-react";
import { AlertTriangle, Clock3, ShieldCheck, Users } from "lucide-react";
import { useMemo } from "react";
import { useNavigate } from "react-router";
import { Breadcrumb } from "@/components/app-shell/breadcrumb";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { AsyncPanel } from "@/lib/table-kit";
import { useChartTheme } from "@/pages/home/theme";
import {
  TICKET_PRIORITIES,
  labelFor,
} from "./constants";
import { getTicketShowPath } from "./routes";
import { userLabel } from "./shared";
import type { TicketRecord } from "./types";
import { slaStateFor, slaTone, useSlaByPriority } from "./sla";

const RESOURCE = "hub_hd_tickets";
const OPEN_STATUSES = new Set(["open", "pending"]);

type SlaBucket = "onTrack" | "atRisk" | "breached";

function slaBucketFor(
  ticket: TicketRecord,
  policies: ReturnType<typeof useSlaByPriority>["byPriority"]
): SlaBucket {
  const state = slaStateFor(ticket, policies);
  if (!state) return "atRisk";
  const tone = slaTone(state);
  return tone === "breached"
    ? "breached"
    : tone === "risk"
      ? "atRisk"
      : "onTrack";
}

export function HelpdeskDashboard() {
  const translate = useTranslate();
  const chart = useChartTheme();
  const navigate = useNavigate();
  const {
    byPriority: slaPolicies,
    isLoading: slaLoading,
    isError: slaError,
    refetch: refetchSla,
  } = useSlaByPriority();

  const { result, query } = useList<TicketRecord>({
    resource: RESOURCE,
    pagination: { mode: "server", currentPage: 1, pageSize: 500 },
    sorters: [{ field: "createdAt", order: "desc" }],
    meta: { appends: ["assignee"] },
    errorNotification: false,
    queryOptions: { retry: false },
  });

  const loading = query.isLoading || slaLoading;
  const tickets = result.data ?? [];
  const open = useMemo(
    () => tickets.filter((t) => OPEN_STATUSES.has(t.status ?? "")),
    [tickets]
  );

  const sla = useMemo(() => {
    const buckets = { onTrack: 0, atRisk: 0, breached: 0 };
    const breachedList: TicketRecord[] = [];
    for (const ticket of open) {
      const bucket = slaBucketFor(ticket, slaPolicies);
      buckets[bucket] += 1;
      if (bucket !== "onTrack") breachedList.push(ticket);
    }
    breachedList.sort((a, b) => {
      const rank = (t: TicketRecord) =>
        slaBucketFor(t, slaPolicies) === "breached" ? 0 : 1;
      return rank(a) - rank(b);
    });
    return { buckets, watchlist: breachedList.slice(0, 8) };
  }, [open, slaPolicies]);

  const slaHealth = open.length
    ? Math.round((sla.buckets.onTrack / open.length) * 100)
    : 100;

  const queue = useMemo(() => {
    const map = new Map<string, { label: string; count: number }>();
    for (const ticket of open) {
      const key = ticket.assignee ? String(ticket.assignee.id) : "unassigned";
      const label = ticket.assignee
        ? userLabel(ticket.assignee, translate)
        : translate("helpdesk.common.unassigned", { ns: "starter" }, "Unassigned");
      const entry = map.get(key) ?? { label, count: 0 };
      entry.count += 1;
      map.set(key, entry);
    }
    return [...map.values()].sort((a, b) => b.count - a.count).slice(0, 10);
  }, [open, translate]);

  const priorityMix = useMemo(
    () =>
      TICKET_PRIORITIES.map((p) => ({
        name: labelFor(TICKET_PRIORITIES, p.value, translate),
        value: open.filter((t) => t.priority === p.value).length,
      })),
    [open, translate]
  );

  const axisBase = {
    axisLine: { lineStyle: { color: chart.grid } },
    axisTick: { show: false },
    axisLabel: { color: chart.axis, fontSize: 11 },
  };
  const tooltipBase = {
    backgroundColor: chart.tooltipBg,
    borderColor: chart.tooltipBorder,
    textStyle: { color: chart.tooltipText, fontSize: 12 },
    borderWidth: 1,
    padding: [8, 12],
  };

  const queueOption = {
    color: [chart.palette[0]],
    grid: { left: 6, right: 16, top: 6, bottom: 0, containLabel: true },
    tooltip: { trigger: "axis", axisPointer: { type: "shadow" }, ...tooltipBase },
    xAxis: {
      type: "value",
      ...axisBase,
      axisLine: { show: false },
      splitLine: { lineStyle: { color: chart.grid } },
      minInterval: 1,
    },
    yAxis: {
      type: "category",
      data: [...queue].reverse().map((q) => q.label),
      ...axisBase,
    },
    series: [
      {
        type: "bar",
        barWidth: 14,
        data: [...queue].reverse().map((q) => q.count),
        itemStyle: { borderRadius: [0, 4, 4, 0] },
      },
    ],
  };

  const priorityOption = {
    tooltip: { trigger: "item", ...tooltipBase },
    legend: {
      bottom: 0,
      icon: "circle",
      itemWidth: 8,
      itemHeight: 8,
      textStyle: { color: chart.axis, fontSize: 12 },
    },
    series: [
      {
        type: "pie",
        radius: ["45%", "72%"],
        center: ["50%", "42%"],
        avoidLabelOverlap: true,
        itemStyle: { borderColor: chart.tooltipBg, borderWidth: 2 },
        label: { show: false },
        data: priorityMix.map((p, i) => ({
          name: p.name,
          value: p.value,
          itemStyle: { color: chart.palette[i % chart.palette.length] },
        })),
      },
    ],
  };

  if (query.isError || slaError) {
    return (
      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-3">
          <div className="flex items-center text-muted-foreground">
            <Breadcrumb />
          </div>
          <h2 className="text-2xl font-semibold tracking-tight">
            {translate("helpdesk.dashboard.title", { ns: "starter" }, "Workload & SLA")}
          </h2>
        </div>
        <AsyncPanel
          i18nPrefix="helpdesk.ops"
          isError
          onRetry={() => {
            void query.refetch();
            void refetchSla();
          }}
        >
          <span />
        </AsyncPanel>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <div className="flex items-center text-muted-foreground">
          <Breadcrumb />
        </div>
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">
            {translate("helpdesk.dashboard.title", { ns: "starter" }, "Workload & SLA")}
          </h2>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">
            {translate(
              "helpdesk.dashboard.subtitle",
              { ns: "starter" },
              "How healthy the queue is right now, who is carrying the load, and where priority sits."
            )}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          loading={loading}
          icon={ShieldCheck}
          tone="text-emerald-600 bg-emerald-500/12 dark:text-emerald-400"
          label={translate("helpdesk.dashboard.kpi.health.label", { ns: "starter" }, "SLA health")}
          value={`${slaHealth}%`}
          sub={translate(
            "helpdesk.dashboard.kpi.health.sub",
            { ns: "starter", count: open.length },
            `Of ${open.length} open tickets on track`
          )}
        />
        <KpiCard
          loading={loading}
          icon={Clock3}
          tone="text-amber-600 bg-amber-500/12 dark:text-amber-400"
          label={translate("helpdesk.dashboard.kpi.atRisk.label", { ns: "starter" }, "At risk")}
          value={String(sla.buckets.atRisk)}
          sub={translate(
            "helpdesk.dashboard.kpi.atRisk.sub",
            { ns: "starter" },
            "Past 70% of their SLA window"
          )}
        />
        <KpiCard
          loading={loading}
          icon={AlertTriangle}
          tone="text-red-600 bg-red-500/12 dark:text-red-400"
          label={translate("helpdesk.dashboard.kpi.breached.label", { ns: "starter" }, "SLA breached")}
          value={String(sla.buckets.breached)}
          sub={translate(
            "helpdesk.dashboard.kpi.breached.sub",
            { ns: "starter" },
            "Over the priority's response window"
          )}
        />
        <KpiCard
          loading={loading}
          icon={Users}
          tone="text-blue-600 bg-blue-500/12 dark:text-blue-400"
          label={translate("helpdesk.dashboard.kpi.agents.label", { ns: "starter" }, "Agents with load")}
          value={String(queue.filter((q) => q.label !== translate("helpdesk.common.unassigned", { ns: "starter" }, "Unassigned")).length)}
          sub={translate(
            "helpdesk.dashboard.kpi.agents.sub",
            { ns: "starter" },
            "Currently holding open tickets"
          )}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>
              {translate("helpdesk.dashboard.queue.title", { ns: "starter" }, "Queue workload")}
            </CardTitle>
            <CardDescription>
              {translate(
                "helpdesk.dashboard.queue.description",
                { ns: "starter" },
                "Open + pending tickets currently sitting with each agent."
              )}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-64 w-full" />
            ) : queue.length === 0 ? (
              <p className="flex h-64 items-center justify-center text-sm text-muted-foreground">
                {translate("helpdesk.dashboard.queue.empty", { ns: "starter" }, "Nothing in the queue.")}
              </p>
            ) : (
              <ReactECharts
                key={`queue-${chart.isDark}`}
                option={queueOption}
                style={{ height: Math.max(220, queue.length * 32) }}
                opts={{ renderer: "svg" }}
              />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>
              {translate("helpdesk.dashboard.priority.title", { ns: "starter" }, "Open tickets by priority")}
            </CardTitle>
            <CardDescription>
              {translate(
                "helpdesk.dashboard.priority.description",
                { ns: "starter" },
                "The priority mix of everything still open."
              )}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-64 w-full" />
            ) : (
              <ReactECharts
                key={`prio-mix-${chart.isDark}`}
                option={priorityOption}
                style={{ height: 260 }}
                opts={{ renderer: "svg" }}
              />
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>
            {translate("helpdesk.dashboard.watchlist.title", { ns: "starter" }, "SLA watchlist")}
          </CardTitle>
          <CardDescription>
            {translate(
              "helpdesk.dashboard.watchlist.description",
              { ns: "starter" },
              "At-risk and breached tickets, most urgent first."
            )}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-2">
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
            </div>
          ) : sla.watchlist.length === 0 ? (
            <p className="flex h-24 items-center justify-center text-sm text-muted-foreground">
              {translate(
                "helpdesk.dashboard.watchlist.empty",
                { ns: "starter" },
                "Nothing at risk right now."
              )}
            </p>
          ) : (
            <div className="space-y-1">
              {sla.watchlist.map((ticket) => {
                const bucket = slaBucketFor(ticket, slaPolicies);
                return (
                  <button
                    type="button"
                    key={String(ticket.id)}
                    onClick={() => navigate(getTicketShowPath(ticket.id))}
                    className="flex w-full items-center justify-between gap-3 rounded-lg px-2 py-2 text-left hover:bg-accent"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">
                        {ticket.subject ||
                          translate("helpdesk.board.untitled", { ns: "starter" }, "Untitled ticket")}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        {labelFor(TICKET_PRIORITIES, ticket.priority, translate)} ·{" "}
                        {userLabel(ticket.assignee, translate)}
                      </p>
                    </div>
                    <span
                      className={cn(
                        "inline-flex shrink-0 items-center rounded-md px-1.5 py-0.5 text-xs font-medium",
                        bucket === "breached"
                          ? "bg-red-500/15 text-red-700 dark:text-red-300"
                          : "bg-amber-500/15 text-amber-700 dark:text-amber-300"
                      )}
                    >
                      {bucket === "breached"
                        ? translate("helpdesk.dashboard.watchlist.breached", { ns: "starter" }, "Breached")
                        : translate("helpdesk.dashboard.watchlist.atRisk", { ns: "starter" }, "At risk")}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function KpiCard({
  icon: Icon,
  tone,
  label,
  value,
  sub,
  loading,
}: {
  icon: typeof Clock3;
  tone: string;
  label: string;
  value: string;
  sub: string;
  loading: boolean;
}) {
  return (
    <Card className="overflow-hidden">
      <CardContent className="pt-6">
        <div className="flex items-start justify-between gap-2">
          <p className="text-sm text-muted-foreground">{label}</p>
          <span
            className={cn(
              "flex size-8 shrink-0 items-center justify-center rounded-lg",
              tone
            )}
          >
            <Icon className="size-4" />
          </span>
        </div>
        {loading ? (
          <Skeleton className="mt-2 h-8 w-24" />
        ) : (
          <p className="mt-1 text-2xl font-semibold tabular-nums tracking-tight">
            {value}
          </p>
        )}
        <p className="mt-1 text-xs text-muted-foreground">{sub}</p>
      </CardContent>
    </Card>
  );
}
