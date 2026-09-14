import { useList, useTranslate } from "@refinedev/core";
import ReactECharts from "echarts-for-react";
import {
  CheckCircle2,
  FolderKanban,
  ListTodo,
  TriangleAlert,
  type LucideIcon,
} from "lucide-react";
import { useMemo } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { useChartTheme } from "@/pages/home/theme";
import { PROJECT_STATUSES, TASK_STATUSES, todayIso } from "../constants";
import type { ProjectRecord, TaskRecord } from "../types";

export function ProjectStats() {
  const chart = useChartTheme();
  const translate = useTranslate();

  const { result: projectResult } = useList<ProjectRecord>({
    resource: "hub_pj_projects",
    pagination: { mode: "server", currentPage: 1, pageSize: 300 },
    errorNotification: false,
    queryOptions: { retry: false },
  });
  const { result: taskResult } = useList<TaskRecord>({
    resource: "hub_pj_tasks",
    pagination: { mode: "server", currentPage: 1, pageSize: 500 },
    errorNotification: false,
    queryOptions: { retry: false },
  });

  const projects = projectResult.data;
  const tasks = taskResult.data;

  const kpis = useMemo(() => {
    const today = todayIso();
    const activeProjects = projects.filter((p) => p.status === "active").length;
    const openTasks = tasks.filter((t) => t.status !== "done").length;
    const overdue = tasks.filter(
      (t) => t.status !== "done" && t.due_date && t.due_date < today
    ).length;
    const doneTasks = tasks.filter((t) => t.status === "done").length;
    const completion = tasks.length
      ? Math.round((doneTasks / tasks.length) * 100)
      : 0;
    return { activeProjects, openTasks, overdue, completion };
  }, [projects, tasks]);

  const projectStatusData = useMemo(
    () =>
      PROJECT_STATUSES.map((status) => ({
        name: translate(status.i18nKey, { ns: "starter" }, status.label),
        value: projects.filter((p) => p.status === status.value).length,
      })).filter((entry) => entry.value > 0),
    [projects, translate]
  );

  const taskStatusData = useMemo(
    () => TASK_STATUSES.map((status) => ({
      label: translate(status.i18nKey, { ns: "starter" }, status.label),
      value: tasks.filter((t) => (t.status ?? "todo") === status.value).length,
    })),
    [tasks, translate]
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

  const donutOption = {
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
        radius: ["58%", "82%"],
        center: ["34%", "50%"],
        avoidLabelOverlap: false,
        padAngle: 2,
        itemStyle: { borderRadius: 6 },
        label: { show: false },
        labelLine: { show: false },
        data: projectStatusData,
      },
    ],
  };

  const barOption = {
    color: [chart.palette[0]],
    grid: { left: 6, right: 12, top: 16, bottom: 8, containLabel: true },
    tooltip: { trigger: "axis", ...tooltipBase },
    xAxis: {
      type: "category",
      data: taskStatusData.map((entry) => entry.label),
      ...axisBase,
    },
    yAxis: {
      type: "value",
      ...axisBase,
      axisLine: { show: false },
      minInterval: 1,
      splitLine: { lineStyle: { color: chart.grid } },
    },
    series: [
      {
        type: "bar",
        data: taskStatusData.map((entry, index) => ({
          value: entry.value,
          itemStyle: {
            color: chart.palette[index % chart.palette.length],
            borderRadius: [4, 4, 0, 0],
          },
        })),
        barWidth: 34,
      },
    ],
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <KpiCard
          label={translate("projects.stats.kpi.activeProjects", { ns: "starter" }, "Active projects")}
          value={String(kpis.activeProjects)}
          hint={translate(
            "projects.stats.kpi.totalCount",
            { ns: "starter", count: projects.length },
            `${projects.length} total`
          )}
          icon={FolderKanban}
          tone="text-blue-600 bg-blue-500/12 dark:text-blue-400"
        />
        <KpiCard
          label={translate("projects.stats.kpi.openTasks", { ns: "starter" }, "Open tasks")}
          value={String(kpis.openTasks)}
          hint={translate(
            "projects.stats.kpi.totalCount",
            { ns: "starter", count: tasks.length },
            `${tasks.length} total`
          )}
          icon={ListTodo}
          tone="text-sky-600 bg-sky-500/12 dark:text-sky-400"
        />
        <KpiCard
          label={translate("projects.stats.kpi.overdue", { ns: "starter" }, "Overdue")}
          value={String(kpis.overdue)}
          hint={translate("projects.stats.kpi.overdueHint", { ns: "starter" }, "past due date")}
          icon={TriangleAlert}
          tone="text-red-600 bg-red-500/12 dark:text-red-400"
        />
        <KpiCard
          label={translate("projects.stats.kpi.completion", { ns: "starter" }, "Task completion")}
          value={`${kpis.completion}%`}
          hint={translate("projects.stats.kpi.completionHint", { ns: "starter" }, "across all tasks")}
          icon={CheckCircle2}
          tone="text-emerald-600 bg-emerald-500/12 dark:text-emerald-400"
        />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>
              {translate(
                "projects.stats.charts.projectsByStatus",
                { ns: "starter" },
                "Projects by status"
              )}
            </CardTitle>
            <CardDescription>
              {translate(
                "projects.stats.charts.projectsByStatus.desc",
                { ns: "starter" },
                "Portfolio breakdown."
              )}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ReactECharts
              key={`pj-donut-${chart.isDark}`}
              option={donutOption}
              style={{ height: 240 }}
              opts={{ renderer: "svg" }}
            />
          </CardContent>
        </Card>

        <Card className="xl:col-span-2">
          <CardHeader>
            <CardTitle>
              {translate(
                "projects.stats.charts.tasksByStatus",
                { ns: "starter" },
                "Tasks by status"
              )}
            </CardTitle>
            <CardDescription>
              {translate(
                "projects.stats.charts.tasksByStatus.desc",
                { ns: "starter" },
                "Where work sits on the board."
              )}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ReactECharts
              key={`pj-bar-${chart.isDark}`}
              option={barOption}
              style={{ height: 240 }}
              opts={{ renderer: "svg" }}
            />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function KpiCard({
  label,
  value,
  hint,
  icon: Icon,
  tone,
}: {
  label: string;
  value: string;
  hint: string;
  icon: LucideIcon;
  tone: string;
}) {
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="text-sm text-muted-foreground">{label}</p>
            <p className="mt-2 text-3xl font-semibold tabular-nums tracking-tight">
              {value}
            </p>
          </div>
          <span
            className={cn(
              "flex size-9 shrink-0 items-center justify-center rounded-xl",
              tone
            )}
          >
            <Icon className="size-5" />
          </span>
        </div>
        <p className="mt-3 text-xs text-muted-foreground">{hint}</p>
      </CardContent>
    </Card>
  );
}
