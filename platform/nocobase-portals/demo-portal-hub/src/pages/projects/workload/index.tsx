import { useList, useTranslate } from "@refinedev/core";
import ReactECharts from "echarts-for-react";
import { AlertTriangle, ListChecks, Users } from "lucide-react";
import { useMemo, useState } from "react";
import { Breadcrumb } from "@/components/app-shell/breadcrumb";
import { LoadingState } from "@/components/app-shell/loading-state";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { useChartTheme } from "@/pages/home/theme";
import {
  TASK_PRIORITIES,
  TASK_STATUSES,
  formatDate,
  labelFor,
  todayIso,
  userLabel,
} from "../constants";
import { useOpenAbsolute } from "../route-surfaces";
import { PriorityPill, useLocale } from "../shared";
import {
  EmptyState,
  ErrorState,
  ExportCsvButton,
  KpiBar,
  Toolbar,
  ToolbarSearch,
  downloadCsv,
} from "@/lib/table-kit";
import type { ProjectRecord, TaskRecord } from "../types";

type Row = {
  key: string;
  name: string;
  open: number;
  overdue: number;
  dueThisWeek: number;
  high: number;
  byStatus: Record<string, number>;
  tasks: TaskRecord[];
};

const inDaysIso = (days: number) =>
  new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);

/**
 * Who is carrying what. Open tasks are bucketed per assignee with the overdue
 * and high-priority share called out, so an over-committed person is obvious
 * before the sprint slips.
 */
export function WorkloadPage() {
  const translate = useTranslate();
  const locale = useLocale();
  const openAbsolute = useOpenAbsolute();
  const chart = useChartTheme();
  const [search, setSearch] = useState("");
  const [projectFilter, setProjectFilter] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);

  const { result, query } = useList<TaskRecord>({
    resource: "hub_pj_tasks",
    pagination: { mode: "server", currentPage: 1, pageSize: 500 },
    meta: { appends: ["project", "assignee"] },
    errorNotification: false,
    queryOptions: { retry: false },
  });

  const { result: projectResult } = useList<ProjectRecord>({
    resource: "hub_pj_projects",
    pagination: { mode: "server", currentPage: 1, pageSize: 300 },
    sorters: [{ field: "name", order: "asc" }],
    errorNotification: false,
    queryOptions: { retry: false },
  });

  const today = todayIso();
  const weekAhead = inDaysIso(7);
  const unassignedLabel = translate(
    "projects.board.unassigned",
    { ns: "starter" },
    "Unassigned"
  );

  const rows = useMemo<Row[]>(() => {
    const map = new Map<string, Row>();
    for (const task of result.data) {
      if (task.status === "done") continue;
      if (
        projectFilter &&
        String(
          (task as TaskRecord & { hub_pj_task_project_id?: string | number })
            .hub_pj_task_project_id ?? task.project?.id ?? ""
        ) !== projectFilter
      ) {
        continue;
      }
      const key = String(task.assignee?.id ?? "");
      const name = task.assignee ? userLabel(task.assignee) : unassignedLabel;
      const row =
        map.get(key) ??
        ({
          key,
          name,
          open: 0,
          overdue: 0,
          dueThisWeek: 0,
          high: 0,
          byStatus: {},
          tasks: [],
        } as Row);
      row.open += 1;
      row.tasks.push(task);
      row.byStatus[task.status ?? "todo"] =
        (row.byStatus[task.status ?? "todo"] ?? 0) + 1;
      if (task.due_date && task.due_date < today) row.overdue += 1;
      else if (task.due_date && task.due_date <= weekAhead) row.dueThisWeek += 1;
      if (task.priority === "high") row.high += 1;
      map.set(key, row);
    }
    return [...map.values()]
      .map((row) => ({
        ...row,
        tasks: row.tasks.sort((a, b) =>
          (a.due_date ?? "9999").localeCompare(b.due_date ?? "9999")
        ),
      }))
      .sort((a, b) => b.open - a.open);
  }, [projectFilter, result.data, today, unassignedLabel, weekAhead]);

  const term = search.trim().toLowerCase();
  const visible = rows.filter(
    (row) => !term || row.name.toLowerCase().includes(term)
  );

  const maxOpen = visible.reduce((max, row) => Math.max(max, row.open), 0) || 1;

  const summary = useMemo(
    () => ({
      people: rows.filter((row) => row.key).length,
      open: rows.reduce((total, row) => total + row.open, 0),
      overdue: rows.reduce((total, row) => total + row.overdue, 0),
      unassigned: rows.find((row) => !row.key)?.open ?? 0,
    }),
    [rows]
  );

  const stackedOption = useMemo(() => {
    const top = visible.slice(0, 12);
    return {
      grid: { left: 8, right: 16, top: 24, bottom: 8, containLabel: true },
      tooltip: {
        trigger: "axis",
        axisPointer: { type: "shadow" },
        backgroundColor: chart.tooltipBg,
        borderColor: chart.tooltipBorder,
        borderWidth: 1,
        textStyle: { color: chart.tooltipText, fontSize: 12 },
      },
      legend: {
        top: 0,
        textStyle: { color: chart.axis, fontSize: 12 },
        icon: "circle",
      },
      xAxis: {
        type: "value",
        axisLabel: { color: chart.axis, fontSize: 12 },
        splitLine: { lineStyle: { color: chart.grid } },
        minInterval: 1,
      },
      yAxis: {
        type: "category",
        inverse: true,
        data: top.map((row) => row.name),
        axisLabel: { color: chart.axis, fontSize: 12 },
        axisLine: { lineStyle: { color: chart.grid } },
        axisTick: { show: false },
      },
      series: TASK_STATUSES.filter((status) => status.value !== "done").map(
        (status, index) => ({
          name: labelFor(TASK_STATUSES, status.value, translate),
          type: "bar",
          stack: "load",
          barWidth: 16,
          itemStyle: { color: chart.palette[index % chart.palette.length] },
          data: top.map((row) => row.byStatus[status.value] ?? 0),
        })
      ),
    };
  }, [chart, translate, visible]);

  const kpiItems = [
    {
      key: "people",
      label: translate("projects.workload.kpi.people", { ns: "starter" }, "People loaded"),
      value: String(summary.people),
      hint: translate(
        "projects.workload.kpi.peopleHint",
        { ns: "starter" },
        "With at least one open task"
      ),
      icon: <Users className="size-4" />,
      tone: "text-blue-600 bg-blue-500/12 dark:text-blue-400",
    },
    {
      key: "open",
      label: translate("projects.workload.kpi.open", { ns: "starter" }, "Open tasks"),
      value: String(summary.open),
      hint: translate(
        "projects.workload.kpi.openHint",
        { ns: "starter", avg: summary.people ? Math.round(summary.open / summary.people) : 0 },
        "Across the portfolio"
      ),
      icon: <ListChecks className="size-4" />,
      tone: "text-emerald-600 bg-emerald-500/12 dark:text-emerald-400",
    },
    {
      key: "overdue",
      label: translate("projects.workload.kpi.overdue", { ns: "starter" }, "Overdue"),
      value: String(summary.overdue),
      hint: translate(
        "projects.workload.kpi.overdueHint",
        { ns: "starter" },
        "Already past due"
      ),
      icon: <AlertTriangle className="size-4" />,
      tone: "text-red-600 bg-red-500/12 dark:text-red-400",
    },
    {
      key: "unassigned",
      label: unassignedLabel,
      value: String(summary.unassigned),
      hint: translate(
        "projects.workload.kpi.unassignedHint",
        { ns: "starter" },
        "Waiting for an owner"
      ),
      tone: "text-amber-600 bg-amber-500/12 dark:text-amber-400",
    },
  ];

  const handleExport = () =>
    downloadCsv(
      `workload-${today}.csv`,
      [
        translate("projects.workload.columns.person", { ns: "starter" }, "Person"),
        translate("projects.workload.columns.open", { ns: "starter" }, "Open"),
        translate("projects.workload.columns.overdue", { ns: "starter" }, "Overdue"),
        translate("projects.workload.columns.week", { ns: "starter" }, "Due this week"),
        translate("projects.workload.columns.high", { ns: "starter" }, "High priority"),
      ],
      visible.map((row) => [
        row.name,
        row.open,
        row.overdue,
        row.dueThisWeek,
        row.high,
      ])
    );

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <div className="flex items-center text-muted-foreground">
          <Breadcrumb />
        </div>
        <div>
          <h2 className="text-3xl font-semibold tracking-[-0.035em]">
            {translate("projects.workload.title", { ns: "starter" }, "Resource load")}
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
            {translate(
              "projects.workload.subtitle",
              { ns: "starter" },
              "Open work per person, with overdue and high-priority pressure called out."
            )}
          </p>
        </div>
      </div>

      <KpiBar items={kpiItems} />

      <Toolbar>
        <div className="flex flex-1 flex-wrap items-center gap-2">
          <ToolbarSearch i18nPrefix="projects.toolkit"
            value={search}
            onChange={setSearch}
            placeholder={translate(
              "projects.workload.search",
              { ns: "starter" },
              "Find a person..."
            )}
          />
          <select
            value={projectFilter}
            onChange={(event) => setProjectFilter(event.currentTarget.value)}
            className="h-9 rounded-md border border-input bg-transparent px-2.5 text-sm shadow-xs"
          >
            <option value="">
              {translate("projects.board.allProjects", { ns: "starter" }, "All projects")}
            </option>
            {projectResult.data.map((project) => (
              <option key={String(project.id)} value={String(project.id)}>
                {project.name}
              </option>
            ))}
          </select>
        </div>
        <ExportCsvButton i18nPrefix="projects.toolkit" onExport={handleExport} />
      </Toolbar>

      {query.isError ? (
        <ErrorState i18nPrefix="projects.toolkit" onRetry={() => query.refetch()} />
      ) : query.isLoading ? (
        <LoadingState className="min-h-64" />
      ) : visible.length === 0 ? (
        <EmptyState
          title={translate(
            "projects.workload.empty",
            { ns: "starter" },
            "No open work to distribute"
          )}
          description={translate(
            "projects.workload.emptyDesc",
            { ns: "starter" },
            "Everything in scope is already done."
          )}
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1.1fr_1fr]">
          <Card>
            <CardHeader>
              <CardTitle>
                {translate(
                  "projects.workload.table.title",
                  { ns: "starter" },
                  "Load by person"
                )}
              </CardTitle>
              <CardDescription>
                {translate(
                  "projects.workload.table.desc",
                  { ns: "starter" },
                  "Click a row to see the tasks behind the number."
                )}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-1.5">
              {visible.map((row) => (
                <div key={row.key || "unassigned"}>
                  <button
                    type="button"
                    onClick={() =>
                      setExpanded((current) =>
                        current === row.key ? null : row.key
                      )
                    }
                    className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left hover:bg-accent/50"
                  >
                    <span className="w-36 shrink-0 truncate text-sm font-medium">
                      {row.name}
                    </span>
                    <span className="relative h-2 flex-1 overflow-hidden rounded-full bg-muted">
                      <span
                        className={cn(
                          "absolute inset-y-0 left-0 rounded-full",
                          row.overdue > 0 ? "bg-amber-500" : "bg-blue-500"
                        )}
                        style={{ width: `${(row.open / maxOpen) * 100}%` }}
                      />
                    </span>
                    <span className="w-8 shrink-0 text-right text-sm font-semibold tabular-nums">
                      {row.open}
                    </span>
                    {row.overdue > 0 ? (
                      <span className="shrink-0 rounded-md bg-red-500/15 px-1.5 py-0.5 text-[11px] font-medium text-red-700 tabular-nums dark:text-red-300">
                        {translate(
                          "projects.workload.overdueBadge",
                          { ns: "starter", count: row.overdue },
                          `${row.overdue} overdue`
                        )}
                      </span>
                    ) : null}
                  </button>
                  {expanded === row.key ? (
                    <ul className="mb-2 ml-2 space-y-1 border-l border-border/60 pl-4">
                      {row.tasks.slice(0, 8).map((task) => (
                        <li key={String(task.id)}>
                          <button
                            type="button"
                            onClick={() => openAbsolute(`/tasks/show/${task.id}`)}
                            className="flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent/50"
                          >
                            <span className="truncate">{task.title}</span>
                            <span className="flex shrink-0 items-center gap-2">
                              <PriorityPill value={task.priority} />
                              <span
                                className={cn(
                                  "text-xs tabular-nums",
                                  task.due_date && task.due_date < today
                                    ? "font-medium text-red-600 dark:text-red-400"
                                    : "text-muted-foreground"
                                )}
                              >
                                {formatDate(task.due_date, locale)}
                              </span>
                            </span>
                          </button>
                        </li>
                      ))}
                      {row.tasks.length > 8 ? (
                        <li className="px-2 py-1 text-xs text-muted-foreground">
                          {translate(
                            "projects.workload.more",
                            { ns: "starter", count: row.tasks.length - 8 },
                            `+${row.tasks.length - 8} more`
                          )}
                        </li>
                      ) : null}
                    </ul>
                  ) : null}
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>
                {translate(
                  "projects.workload.chart.title",
                  { ns: "starter" },
                  "Open work by stage"
                )}
              </CardTitle>
              <CardDescription>
                {translate(
                  "projects.workload.chart.desc",
                  { ns: "starter" },
                  "Top 12 people, stacked by task status."
                )}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ReactECharts
                key={`workload-${chart.isDark}`}
                option={stackedOption}
                style={{ height: Math.max(260, visible.slice(0, 12).length * 34) }}
                opts={{ renderer: "svg" }}
              />
            </CardContent>
          </Card>
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        {translate(
          "projects.workload.footnote",
          { ns: "starter" },
          "Load counts open tasks only; priority mix is shown per person when a row is expanded."
        )}
        {" "}
        {TASK_PRIORITIES.map((priority) =>
          labelFor(TASK_PRIORITIES, priority.value, translate)
        ).join(" · ")}
      </p>
    </div>
  );
}
