import { useList, useTranslate } from "@refinedev/core";
import ReactECharts from "echarts-for-react";
import { ChartNoAxesColumn, Clock3, ShieldCheck, Users } from "lucide-react";
import { useMemo } from "react";
import { Breadcrumb } from "@/components/app-shell/breadcrumb";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { useChartTheme } from "@/pages/home/theme";
import { TICKET_PRIORITIES, TICKET_STATUSES, labelFor } from "./constants";
import { AsyncPanel, KpiStrip, exportCsv, type KpiTile } from "@/lib/table-kit";
import {
  OPEN_TICKET_STATUSES,
  formatDuration,
  slaStateFor,
  useSlaByPriority,
} from "./sla";
import { UserChip, userLabel } from "./shared";
import type { ReplyRecord, TicketRecord, UserRef } from "./types";

const TICKETS_RESOURCE = "hub_hd_tickets";
const REPLIES_RESOURCE = "hub_hd_replies";
const UNASSIGNED_KEY = "unassigned";
const KNOWN_PRIORITIES = new Set<string>(
  TICKET_PRIORITIES.map((priority) => priority.value)
);
const OPEN_STATUSES = new Set<string>(
  OPEN_TICKET_STATUSES.filter((status) =>
    TICKET_STATUSES.some((option) => option.value === status)
  )
);

type AgentPerformanceRow = {
  key: string;
  user: UserRef | null;
  assigned: number;
  open: number;
  solved: number;
  solveRate: number;
  slaAttainment: number;
  breached: number;
  repliesAuthored: number;
  averageFirstResponse: number | null;
};

const percentage = (value: number) => `${Math.round(value)}%`;

const median = (values: number[]) => {
  if (values.length === 0) return null;
  const ordered = [...values].sort((left, right) => left - right);
  const middle = Math.floor(ordered.length / 2);
  return ordered.length % 2 === 0
    ? ((ordered[middle - 1] ?? 0) + (ordered[middle] ?? 0)) / 2
    : (ordered[middle] ?? null);
};

export function AgentPerformance() {
  const translate = useTranslate();
  const chart = useChartTheme();
  const { byPriority, isLoading: isSlaLoading } = useSlaByPriority();

  const ticketsQuery = useList<TicketRecord>({
    resource: TICKETS_RESOURCE,
    meta: { appends: ["assignee", "requester"] },
    pagination: { mode: "server", currentPage: 1, pageSize: 500 },
    errorNotification: false,
    queryOptions: { retry: false },
  });

  const repliesQuery = useList<ReplyRecord>({
    resource: REPLIES_RESOURCE,
    meta: { appends: ["author"] },
    pagination: { mode: "server", currentPage: 1, pageSize: 1000 },
    errorNotification: false,
    queryOptions: { retry: false },
  });

  const analysis = useMemo(() => {
    const tickets = ticketsQuery.result.data ?? [];
    const replies = repliesQuery.result.data ?? [];
    const repliesByTicket = new Map<string, ReplyRecord[]>();
    const repliesByAuthor = new Map<string, number>();

    for (const reply of replies) {
      if (reply.ticketId !== null && reply.ticketId !== undefined) {
        const ticketKey = String(reply.ticketId);
        const ticketReplies = repliesByTicket.get(ticketKey) ?? [];
        ticketReplies.push(reply);
        repliesByTicket.set(ticketKey, ticketReplies);
      }
      if (reply.authorId !== null && reply.authorId !== undefined) {
        const authorKey = String(reply.authorId);
        repliesByAuthor.set(authorKey, (repliesByAuthor.get(authorKey) ?? 0) + 1);
      }
    }

    const grouped = new Map<
      string,
      { user: UserRef | null; tickets: TicketRecord[] }
    >();
    for (const ticket of tickets) {
      const key =
        ticket.assigneeId === null || ticket.assigneeId === undefined
          ? UNASSIGNED_KEY
          : String(ticket.assigneeId);
      const group = grouped.get(key) ?? {
        user: key === UNASSIGNED_KEY ? null : (ticket.assignee ?? null),
        tickets: [],
      };
      if (!group.user && ticket.assignee) group.user = ticket.assignee;
      group.tickets.push(ticket);
      grouped.set(key, group);
    }

    const firstResponseMinutes: number[] = [];
    const rows = [...grouped.entries()].map(([key, group]) => {
      let open = 0;
      let solved = 0;
      let breached = 0;
      const agentResponseMinutes: number[] = [];

      for (const ticket of group.tickets) {
        if (OPEN_STATUSES.has(ticket.status ?? "")) open += 1;
        else solved += 1;

        const slaState = KNOWN_PRIORITIES.has(ticket.priority ?? "")
          ? slaStateFor(ticket, byPriority)
          : null;
        if (slaState?.isBreached) breached += 1;

        if (!ticket.createdAt) continue;
        const openedAt = new Date(ticket.createdAt).getTime();
        if (Number.isNaN(openedAt)) continue;
        const requesterKey =
          ticket.requesterId === null || ticket.requesterId === undefined
            ? null
            : String(ticket.requesterId);
        let earliestAt: number | null = null;
        for (const reply of repliesByTicket.get(String(ticket.id)) ?? []) {
          if (reply.authorId === null || reply.authorId === undefined || !reply.createdAt) {
            continue;
          }
          if (requesterKey !== null && String(reply.authorId) === requesterKey) continue;
          const repliedAt = new Date(reply.createdAt).getTime();
          if (Number.isNaN(repliedAt)) continue;
          if (earliestAt === null || repliedAt < earliestAt) earliestAt = repliedAt;
        }
        if (earliestAt !== null) {
          const minutes = (earliestAt - openedAt) / 60000;
          agentResponseMinutes.push(minutes);
          firstResponseMinutes.push(minutes);
        }
      }

      const assigned = group.tickets.length;
      return {
        key,
        user: group.user,
        assigned,
        open,
        solved,
        solveRate: assigned > 0 ? (solved / assigned) * 100 : 0,
        slaAttainment: assigned > 0 ? ((assigned - breached) / assigned) * 100 : 100,
        breached,
        repliesAuthored:
          key === UNASSIGNED_KEY ? 0 : (repliesByAuthor.get(key) ?? 0),
        averageFirstResponse:
          agentResponseMinutes.length > 0
            ? agentResponseMinutes.reduce((sum, value) => sum + value, 0) /
              agentResponseMinutes.length
            : null,
      } satisfies AgentPerformanceRow;
    });

    const assignedRows = rows
      .filter((row) => row.key !== UNASSIGNED_KEY)
      .sort((left, right) => right.open - left.open || right.assigned - left.assigned);
    const unassigned = rows.find((row) => row.key === UNASSIGNED_KEY);
    const sortedRows = unassigned ? [...assignedRows, unassigned] : assignedRows;
    const assigned = rows.reduce((sum, row) => sum + row.assigned, 0);
    const solved = rows.reduce((sum, row) => sum + row.solved, 0);
    const breached = rows.reduce((sum, row) => sum + row.breached, 0);

    return {
      rows: sortedRows,
      chartRows: [...rows]
        .sort((left, right) => right.open - left.open || right.assigned - left.assigned)
        .slice(0, 10),
      activeAgents: rows.filter(
        (row) => row.key !== UNASSIGNED_KEY && row.open > 0
      ).length,
      teamSolveRate: assigned > 0 ? (solved / assigned) * 100 : 0,
      teamSlaAttainment: assigned > 0 ? ((assigned - breached) / assigned) * 100 : 100,
      medianFirstResponse: median(firstResponseMinutes),
    };
  }, [byPriority, repliesQuery.result.data, ticketsQuery.result.data]);

  const tiles = useMemo<KpiTile[]>(
    () => [
      {
        key: "active-agents",
        label: translate(
          "helpdesk.agentPerformance.kpi.activeAgents",
          { ns: "starter" },
          "Active agents"
        ),
        value: String(analysis.activeAgents),
        hint: translate(
          "helpdesk.agentPerformance.kpi.activeAgents.hint",
          { ns: "starter" },
          "Agents holding open work"
        ),
        icon: Users,
        tone: "text-blue-600 bg-blue-500/12 dark:text-blue-400",
      },
      {
        key: "solve-rate",
        label: translate(
          "helpdesk.agentPerformance.kpi.solveRate",
          { ns: "starter" },
          "Team solve rate"
        ),
        value: percentage(analysis.teamSolveRate),
        hint: translate(
          "helpdesk.agentPerformance.kpi.solveRate.hint",
          { ns: "starter" },
          "Resolved or closed tickets"
        ),
        icon: ChartNoAxesColumn,
        tone: "text-teal-600 bg-teal-500/12 dark:text-teal-400",
      },
      {
        key: "sla-attainment",
        label: translate(
          "helpdesk.agentPerformance.kpi.slaAttainment",
          { ns: "starter" },
          "Team SLA attainment"
        ),
        value: percentage(analysis.teamSlaAttainment),
        hint: translate(
          "helpdesk.agentPerformance.kpi.slaAttainment.hint",
          { ns: "starter" },
          "Tickets completed within SLA"
        ),
        icon: ShieldCheck,
        tone: "text-emerald-600 bg-emerald-500/12 dark:text-emerald-400",
      },
      {
        key: "first-response",
        label: translate(
          "helpdesk.agentPerformance.kpi.firstResponse",
          { ns: "starter" },
          "Median first response"
        ),
        value:
          analysis.medianFirstResponse === null
            ? translate(
                "helpdesk.agentPerformance.noResponse",
                { ns: "starter" },
                "—"
              )
            : formatDuration(Math.round(analysis.medianFirstResponse)),
        hint: translate(
          "helpdesk.agentPerformance.kpi.firstResponse.hint",
          { ns: "starter" },
          "Across tickets with an agent reply"
        ),
        icon: Clock3,
        tone: "text-amber-600 bg-amber-500/12 dark:text-amber-400",
      },
    ],
    [analysis, translate]
  );

  const chartOptions = useMemo(() => {
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
    const reversed = [...analysis.chartRows].reverse();
    const labels = reversed.map((row) => userLabel(row.user, translate));
    const openLabel = labelFor(TICKET_STATUSES, "open", translate);
    const solvedLabel = translate(
      "helpdesk.agentPerformance.chart.solved",
      { ns: "starter" },
      "Solved"
    );

    return {
      open: {
        grid: { left: 6, right: 24, top: 12, bottom: 8, containLabel: true },
        tooltip: { trigger: "axis", axisPointer: { type: "shadow" }, ...tooltipBase },
        xAxis: {
          type: "value",
          ...axisBase,
          axisLine: { show: false },
          splitLine: { lineStyle: { color: chart.grid } },
          minInterval: 1,
        },
        yAxis: { type: "category", data: labels, ...axisBase },
        series: [
          {
            name: openLabel,
            type: "bar",
            barWidth: 14,
            data: reversed.map((row) => row.open),
            itemStyle: {
              color: chart.palette[0],
              borderRadius: [0, 4, 4, 0],
            },
          },
        ],
      },
      stacked: {
        grid: { left: 6, right: 24, top: 12, bottom: 8, containLabel: true },
        tooltip: { trigger: "axis", axisPointer: { type: "shadow" }, ...tooltipBase },
        legend: {
          top: 0,
          icon: "circle",
          itemWidth: 8,
          itemHeight: 8,
          textStyle: { color: chart.axis, fontSize: 12 },
        },
        xAxis: {
          type: "value",
          ...axisBase,
          axisLine: { show: false },
          splitLine: { lineStyle: { color: chart.grid } },
          minInterval: 1,
        },
        yAxis: { type: "category", data: labels, ...axisBase },
        series: [
          {
            name: solvedLabel,
            type: "bar",
            stack: "tickets",
            barWidth: 14,
            data: reversed.map((row) => row.solved),
            itemStyle: { color: chart.palette[1] ?? chart.palette[0] },
          },
          {
            name: openLabel,
            type: "bar",
            stack: "tickets",
            barWidth: 14,
            data: reversed.map((row) => row.open),
            itemStyle: {
              color: chart.palette[0],
              borderRadius: [0, 4, 4, 0],
            },
          },
        ],
      },
    };
  }, [analysis.chartRows, chart, translate]);

  const isLoading =
    ticketsQuery.query.isLoading || repliesQuery.query.isLoading || isSlaLoading;
  const isError = ticketsQuery.query.isError || repliesQuery.query.isError;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <div className="flex items-center text-muted-foreground">
          <Breadcrumb />
        </div>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-3xl font-semibold tracking-[-0.035em]">
              {translate(
                "helpdesk.agentPerformance.title",
                { ns: "starter" },
                "Agent performance"
              )}
            </h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
              {translate(
                "helpdesk.agentPerformance.description",
                { ns: "starter" },
                "Compare workload, response speed, solve rate and SLA outcomes across the support team."
              )}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                exportCsv(
                  "helpdesk-agent-performance",
                  [
                    {
                      header: translate(
                        "helpdesk.agentPerformance.table.agent",
                        { ns: "starter" },
                        "Agent"
                      ),
                      value: (row: AgentPerformanceRow) =>
                        userLabel(row.user, translate),
                    },
                    {
                      header: translate(
                        "helpdesk.agentPerformance.table.assigned",
                        { ns: "starter" },
                        "Assigned"
                      ),
                      value: (row) => row.assigned,
                    },
                    {
                      header: translate(
                        "helpdesk.agentPerformance.table.open",
                        { ns: "starter" },
                        "Open"
                      ),
                      value: (row) => row.open,
                    },
                    {
                      header: translate(
                        "helpdesk.agentPerformance.table.solved",
                        { ns: "starter" },
                        "Solved"
                      ),
                      value: (row) => row.solved,
                    },
                    {
                      header: translate(
                        "helpdesk.agentPerformance.table.solveRate",
                        { ns: "starter" },
                        "Solve rate"
                      ),
                      value: (row) => percentage(row.solveRate),
                    },
                    {
                      header: translate(
                        "helpdesk.agentPerformance.table.slaAttainment",
                        { ns: "starter" },
                        "SLA attainment"
                      ),
                      value: (row) => percentage(row.slaAttainment),
                    },
                    {
                      header: translate(
                        "helpdesk.agentPerformance.table.breached",
                        { ns: "starter" },
                        "Breached"
                      ),
                      value: (row) => row.breached,
                    },
                    {
                      header: translate(
                        "helpdesk.agentPerformance.table.replies",
                        { ns: "starter" },
                        "Replies authored"
                      ),
                      value: (row) => row.repliesAuthored,
                    },
                    {
                      header: translate(
                        "helpdesk.agentPerformance.table.firstResponse",
                        { ns: "starter" },
                        "Avg. first response"
                      ),
                      value: (row) =>
                        row.averageFirstResponse === null
                          ? null
                          : formatDuration(Math.round(row.averageFirstResponse)),
                    },
                  ],
                  analysis.rows
                )
              }
            >
              {translate(
                "helpdesk.ops.exportCsv",
                { ns: "starter" },
                "Export CSV"
              )}
            </Button>
          </div>
        </div>
      </div>

      <AsyncPanel i18nPrefix="helpdesk.ops"
        isLoading={isLoading}
        isError={isError}
        isEmpty={!isLoading && analysis.rows.length === 0}
        onRetry={() => {
          void ticketsQuery.query.refetch();
          void repliesQuery.query.refetch();
        }}
        emptyTitle={translate(
          "helpdesk.agentPerformance.empty.title",
          { ns: "starter" },
          "No agent activity"
        )}
        emptyDescription={translate(
          "helpdesk.agentPerformance.empty.description",
          { ns: "starter" },
          "Agent performance appears after tickets have been assigned."
        )}
        skeletonRows={8}
      >
        <div className="flex flex-col gap-4">
          <KpiStrip tiles={tiles} />

          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>
                  {translate(
                    "helpdesk.agentPerformance.chart.open.title",
                    { ns: "starter" },
                    "Open tickets by agent"
                  )}
                </CardTitle>
                <CardDescription>
                  {translate(
                    "helpdesk.agentPerformance.chart.open.description",
                    { ns: "starter" },
                    "The ten busiest queues by open and pending ticket count."
                  )}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ReactECharts
                  key={`agent-open-${chart.isDark}`}
                  option={chartOptions.open}
                  style={{ height: 320 }}
                  opts={{ renderer: "svg" }}
                />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>
                  {translate(
                    "helpdesk.agentPerformance.chart.mix.title",
                    { ns: "starter" },
                    "Solved versus open"
                  )}
                </CardTitle>
                <CardDescription>
                  {translate(
                    "helpdesk.agentPerformance.chart.mix.description",
                    { ns: "starter" },
                    "Completed work compared with the current queue for the same agents."
                  )}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ReactECharts
                  key={`agent-mix-${chart.isDark}`}
                  option={chartOptions.stacked}
                  style={{ height: 320 }}
                  opts={{ renderer: "svg" }}
                />
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>
                {translate(
                  "helpdesk.agentPerformance.table.title",
                  { ns: "starter" },
                  "Agent scorecard"
                )}
              </CardTitle>
              <CardDescription>
                {translate(
                  "helpdesk.agentPerformance.table.description",
                  { ns: "starter" },
                  "Rows with breached tickets are highlighted."
                )}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto rounded-lg border">
                <table className="w-full min-w-max text-sm">
                  <thead>
                    <tr className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
                      <th className="px-3 py-2 font-medium">
                        {translate(
                          "helpdesk.agentPerformance.table.agent",
                          { ns: "starter" },
                          "Agent"
                        )}
                      </th>
                      <th className="px-3 py-2 text-right font-medium">
                        {translate(
                          "helpdesk.agentPerformance.table.assigned",
                          { ns: "starter" },
                          "Assigned"
                        )}
                      </th>
                      <th className="px-3 py-2 text-right font-medium">
                        {translate(
                          "helpdesk.agentPerformance.table.open",
                          { ns: "starter" },
                          "Open"
                        )}
                      </th>
                      <th className="px-3 py-2 text-right font-medium">
                        {translate(
                          "helpdesk.agentPerformance.table.solved",
                          { ns: "starter" },
                          "Solved"
                        )}
                      </th>
                      <th className="min-w-36 px-3 py-2 text-right font-medium">
                        {translate(
                          "helpdesk.agentPerformance.table.solveRate",
                          { ns: "starter" },
                          "Solve rate"
                        )}
                      </th>
                      <th className="px-3 py-2 text-right font-medium">
                        {translate(
                          "helpdesk.agentPerformance.table.slaAttainment",
                          { ns: "starter" },
                          "SLA attainment"
                        )}
                      </th>
                      <th className="px-3 py-2 text-right font-medium">
                        {translate(
                          "helpdesk.agentPerformance.table.breached",
                          { ns: "starter" },
                          "Breached"
                        )}
                      </th>
                      <th className="px-3 py-2 text-right font-medium">
                        {translate(
                          "helpdesk.agentPerformance.table.replies",
                          { ns: "starter" },
                          "Replies authored"
                        )}
                      </th>
                      <th className="px-3 py-2 text-right font-medium">
                        {translate(
                          "helpdesk.agentPerformance.table.firstResponse",
                          { ns: "starter" },
                          "Avg. first response"
                        )}
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {analysis.rows.map((row) => (
                      <tr
                        key={row.key}
                        className={cn(row.breached > 0 && "bg-destructive/5")}
                      >
                        <td className="px-3 py-2">
                          <UserChip user={row.user} />
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {row.assigned}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {row.open}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {row.solved}
                        </td>
                        <td className="px-3 py-2">
                          <div className="flex items-center justify-end gap-2">
                            <div className="h-1.5 w-20 overflow-hidden rounded-full bg-muted">
                              <div
                                className="h-full rounded-full bg-primary"
                                style={{ width: percentage(row.solveRate) }}
                              />
                            </div>
                            <span className="w-10 text-right tabular-nums">
                              {percentage(row.solveRate)}
                            </span>
                          </div>
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {percentage(row.slaAttainment)}
                        </td>
                        <td
                          className={cn(
                            "px-3 py-2 text-right tabular-nums",
                            row.breached > 0 && "font-medium text-destructive"
                          )}
                        >
                          {row.breached}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {row.repliesAuthored}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {row.averageFirstResponse === null
                            ? translate(
                                "helpdesk.agentPerformance.noResponse",
                                { ns: "starter" },
                                "—"
                              )
                            : formatDuration(
                                Math.round(row.averageFirstResponse)
                              )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </div>
      </AsyncPanel>
    </div>
  );
}
