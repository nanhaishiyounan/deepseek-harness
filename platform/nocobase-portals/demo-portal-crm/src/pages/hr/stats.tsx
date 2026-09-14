import { useTranslate } from "@refinedev/core";
import ReactECharts from "echarts-for-react";
import { useMemo, useState } from "react";
import { useNavigate } from "react-router";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useChartTheme } from "@/pages/home/theme";
import type { EmployeeRecord } from "./types";

type Grouping = "department" | "tenure" | "hiring";

/**
 * The workforce analytics block under the employee directory: headcount mix,
 * tenure profile and the hiring trend, all computed from the same employee
 * rows the list already loaded. Bars drill through to a filtered directory.
 */
export function HrCharts({
  employees,
  isLoading,
}: {
  employees: EmployeeRecord[];
  isLoading?: boolean;
}) {
  const translate = useTranslate();
  const navigate = useNavigate();
  const chart = useChartTheme();
  const [grouping, setGrouping] = useState<Grouping>("department");

  const unassignedLabel = translate(
    "hr.stats.unassigned",
    { ns: "starter" },
    "Unassigned"
  );
  const peopleSuffix = translate("hr.stats.peopleSuffix", { ns: "starter" }, "people");

  const { byDept, byTenure, byHireYear, statusCounts } = useMemo(() => {
    const deptCounts = new Map<string, { name: string; value: number; id: string }>();
    for (const employee of employees) {
      if (employee.status === "terminated") continue;
      const id =
        employee.department_id != null ? String(employee.department_id) : "";
      const name = employee.department?.name ?? unassignedLabel;
      const entry = deptCounts.get(id) ?? { name, value: 0, id };
      entry.value += 1;
      deptCounts.set(id, entry);
    }

    const now = Date.now();
    const yearsAgo = (years: number) => now - years * 365.25 * 86400000;
    const tenureBuckets = [
      { key: "lt1", min: yearsAgo(1), max: Infinity },
      { key: "1to3", min: yearsAgo(3), max: yearsAgo(1) },
      { key: "3to5", min: yearsAgo(5), max: yearsAgo(3) },
      { key: "5plus", min: -Infinity, max: yearsAgo(5) },
    ];
    const tenureCounts = new Map(tenureBuckets.map((bucket) => [bucket.key, 0]));
    const hireYears = new Map<string, number>();

    for (const employee of employees) {
      if (!employee.hire_date) continue;
      const hired = new Date(employee.hire_date).getTime();
      if (Number.isNaN(hired)) continue;
      const year = String(new Date(employee.hire_date).getFullYear());
      hireYears.set(year, (hireYears.get(year) ?? 0) + 1);
      if (employee.status === "terminated") continue;
      const bucket = tenureBuckets.find(
        (item) => hired > item.min && hired <= item.max
      );
      if (bucket) {
        tenureCounts.set(bucket.key, (tenureCounts.get(bucket.key) ?? 0) + 1);
      }
    }

    return {
      byDept: [...deptCounts.values()].sort((a, b) => b.value - a.value),
      byTenure: tenureBuckets.map((bucket) => ({
        key: bucket.key,
        value: tenureCounts.get(bucket.key) ?? 0,
      })),
      byHireYear: [...hireYears.entries()].sort((a, b) =>
        a[0].localeCompare(b[0])
      ),
      statusCounts: {
        active: employees.filter((row) => row.status === "active").length,
        onleave: employees.filter((row) => row.status === "onleave").length,
        terminated: employees.filter((row) => row.status === "terminated").length,
      },
    };
  }, [employees, unassignedLabel]);

  const tenureLabels: Record<string, string> = {
    lt1: translate("hr.stats.tenure.lt1", { ns: "starter" }, "< 1 year"),
    "1to3": translate("hr.stats.tenure.1to3", { ns: "starter" }, "1–3 years"),
    "3to5": translate("hr.stats.tenure.3to5", { ns: "starter" }, "3–5 years"),
    "5plus": translate("hr.stats.tenure.5plus", { ns: "starter" }, "5+ years"),
  };

  const tooltip = {
    backgroundColor: chart.tooltipBg,
    borderColor: chart.tooltipBorder,
    borderWidth: 1,
    textStyle: { color: chart.tooltipText, fontSize: 12 },
    valueFormatter: (value: number) => `${value} ${peopleSuffix}`,
  };

  const departmentOption = {
    color: [chart.palette[0]],
    grid: { left: 6, right: 16, top: 12, bottom: 8, containLabel: true },
    tooltip: { trigger: "axis", axisPointer: { type: "shadow" }, ...tooltip },
    xAxis: {
      type: "value",
      axisLine: { show: false },
      axisTick: { show: false },
      splitLine: { lineStyle: { color: chart.grid } },
      axisLabel: { color: chart.axis, fontSize: 12 },
      minInterval: 1,
    },
    yAxis: {
      type: "category",
      inverse: true,
      data: byDept.map((item) => item.name),
      axisLine: { lineStyle: { color: chart.grid } },
      axisTick: { show: false },
      axisLabel: { color: chart.axis, fontSize: 12 },
    },
    series: [
      {
        type: "bar",
        data: byDept.map((item) => item.value),
        barWidth: 14,
        itemStyle: { borderRadius: [0, 4, 4, 0] },
      },
    ],
  };

  const tenureOption = {
    color: [chart.palette[1]],
    grid: { left: 6, right: 16, top: 12, bottom: 8, containLabel: true },
    tooltip: { trigger: "axis", axisPointer: { type: "shadow" }, ...tooltip },
    xAxis: {
      type: "category",
      data: byTenure.map((item) => tenureLabels[item.key]),
      axisLine: { lineStyle: { color: chart.grid } },
      axisTick: { show: false },
      axisLabel: { color: chart.axis, fontSize: 12 },
    },
    yAxis: {
      type: "value",
      axisLine: { show: false },
      axisTick: { show: false },
      splitLine: { lineStyle: { color: chart.grid } },
      axisLabel: { color: chart.axis, fontSize: 12 },
      minInterval: 1,
    },
    series: [
      {
        type: "bar",
        data: byTenure.map((item) => item.value),
        barWidth: 28,
        itemStyle: { borderRadius: [4, 4, 0, 0] },
      },
    ],
  };

  const hiringOption = {
    color: [chart.palette[2]],
    grid: { left: 6, right: 16, top: 12, bottom: 8, containLabel: true },
    tooltip: { trigger: "axis", axisPointer: { type: "line" }, ...tooltip },
    xAxis: {
      type: "category",
      data: byHireYear.map(([year]) => year),
      axisLine: { lineStyle: { color: chart.grid } },
      axisTick: { show: false },
      axisLabel: { color: chart.axis, fontSize: 12 },
    },
    yAxis: {
      type: "value",
      axisLine: { show: false },
      axisTick: { show: false },
      splitLine: { lineStyle: { color: chart.grid } },
      axisLabel: { color: chart.axis, fontSize: 12 },
      minInterval: 1,
    },
    series: [
      {
        type: "line",
        smooth: true,
        symbolSize: 7,
        areaStyle: { opacity: 0.12 },
        data: byHireYear.map(([, count]) => count),
      },
    ],
  };

  const statusPieOption = {
    color: [chart.palette[0], chart.palette[3], chart.palette[5]],
    tooltip: { trigger: "item", ...tooltip },
    legend: {
      bottom: 0,
      textStyle: { color: chart.axis, fontSize: 12 },
      itemWidth: 10,
      itemHeight: 10,
    },
    series: [
      {
        type: "pie",
        radius: ["45%", "72%"],
        center: ["50%", "42%"],
        avoidLabelOverlap: true,
        itemStyle: { borderColor: chart.tooltipBg, borderWidth: 2 },
        label: { show: false },
        data: [
          {
            name: translate("hr.stats.active.label", { ns: "starter" }, "Active"),
            value: statusCounts.active,
          },
          {
            name: translate("hr.stats.onLeave.label", { ns: "starter" }, "On leave"),
            value: statusCounts.onleave,
          },
          {
            name: translate(
              "hr.enums.employeeStatus.terminated",
              { ns: "starter" },
              "Terminated"
            ),
            value: statusCounts.terminated,
          },
        ],
      },
    ],
  };

  const groupings: Array<{ value: Grouping; label: string }> = [
    {
      value: "department",
      label: translate("hr.stats.group.department", { ns: "starter" }, "Department"),
    },
    {
      value: "tenure",
      label: translate("hr.stats.group.tenure", { ns: "starter" }, "Tenure"),
    },
    {
      value: "hiring",
      label: translate("hr.stats.group.hiring", { ns: "starter" }, "Hiring trend"),
    },
  ];

  const emptyText = translate(
    "hr.stats.chart.empty",
    { ns: "starter" },
    "No staff assigned yet."
  );

  const primaryOption =
    grouping === "department"
      ? departmentOption
      : grouping === "tenure"
        ? tenureOption
        : hiringOption;

  const primaryHeight =
    grouping === "department" ? Math.max(200, byDept.length * 34) : 260;

  const drillDown = (params: { dataIndex: number }) => {
    if (grouping !== "department") return;
    const entry = byDept[params.dataIndex];
    if (!entry) return;
    navigate(entry.id ? `/employees?dept=${entry.id}` : "/employees");
  };

  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1.6fr_1fr]">
      <Card>
        <CardHeader>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <CardTitle>
                {translate(
                  "hr.stats.chart.title",
                  { ns: "starter" },
                  "Workforce breakdown"
                )}
              </CardTitle>
              <CardDescription>
                {translate(
                  "hr.stats.chart.description",
                  { ns: "starter" },
                  "Switch the dimension; click a department bar to open its people."
                )}
              </CardDescription>
            </div>
            <Tabs
              value={grouping}
              onValueChange={(value) => setGrouping(value as Grouping)}
            >
              <TabsList>
                {groupings.map((option) => (
                  <TabsTrigger key={option.value} value={option.value}>
                    {option.label}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <Skeleton className="h-56 w-full" />
          ) : employees.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">
              {emptyText}
            </p>
          ) : (
            <ReactECharts
              key={`${grouping}-${chart.isDark}`}
              option={primaryOption}
              style={{ height: primaryHeight }}
              opts={{ renderer: "svg" }}
              onEvents={{ click: drillDown }}
            />
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>
            {translate(
              "hr.stats.statusChart.title",
              { ns: "starter" },
              "Status breakdown"
            )}
          </CardTitle>
          <CardDescription>
            {translate(
              "hr.stats.statusChart.description",
              { ns: "starter" },
              "Active, on-leave and terminated headcount."
            )}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <Skeleton className="h-56 w-full" />
          ) : employees.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">
              {emptyText}
            </p>
          ) : (
            <ReactECharts
              key={`status-${chart.isDark}`}
              option={statusPieOption}
              style={{ height: 260 }}
              opts={{ renderer: "svg" }}
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
