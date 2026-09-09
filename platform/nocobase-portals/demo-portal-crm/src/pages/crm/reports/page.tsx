import { useTranslate } from "@refinedev/core";
import ReactECharts from "echarts-for-react";
import { Download, Layers3, LineChart, Percent, Rows3, TrendingUp } from "lucide-react";
import { useMemo } from "react";
import { useNavigate } from "react-router";
import { ListView } from "@/components/resources/views/list-view";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { rangeForPreset, useReportAnalytics, type AggregateRow } from "../analytics";
import {
  CRM_CHART_COLORS,
  DEAL_STAGES,
  DEAL_STAGE_PROBABILITY,
  LEAD_SOURCES,
  OPEN_DEAL_STAGES,
  formatCurrency,
  labelFor,
} from "../constants";
import { ListErrorState } from "../list-toolkit";
import { ChartCard, MetricCard } from "../overview-cards";
import { crmRoutes } from "../routes";
import { useLocale } from "../shared";
import { useUrlState } from "../url-state";

const REPORT_DEFAULTS = { range: "year", from: "", to: "" };

const NO_ROWS: AggregateRow[] = [];

type ReportState = typeof REPORT_DEFAULTS;

const RANGE_PRESETS = ["month", "quarter", "year", "trailing12", "all"] as const;

export function ReportsPage() {
  const translate = useTranslate();
  const locale = useLocale();
  const navigate = useNavigate();
  const { state, setState } = useUrlState<ReportState>(REPORT_DEFAULTS);

  // Custom dates win over the preset, so a shared report URL always resolves to
  // the same window.
  const range = useMemo(() => {
    if (state.from && state.to) return { from: state.from, to: state.to };
    return rangeForPreset(state.range);
  }, [state.from, state.range, state.to]);

  const analytics = useReportAnalytics(range);
  const pipeline = analytics.data?.pipeline ?? NO_ROWS;
  const monthly = analytics.data?.monthly ?? [];
  const byStage = analytics.data?.byStage ?? NO_ROWS;
  const wonLoss = analytics.data?.wonLoss ?? NO_ROWS;
  const leadsBySource = analytics.data?.leadsBySource ?? NO_ROWS;
  const unassignedLabel = translate("crm.reports.unassigned", { ns: "starter" }, "Unassigned");

  /** Owners keep their id so a chart click can drill into the pipeline. */
  const owners = useMemo(() => {
    const map = new Map<string, { id: string; name: string }>();
    for (const row of pipeline) {
      const name = String(row.owner_name ?? unassignedLabel);
      if (!map.has(name)) {
        map.set(name, { id: String(row.owner_id ?? ""), name });
      }
    }
    return [...map.values()].sort((left, right) => left.name.localeCompare(right.name));
  }, [pipeline, unassignedLabel]);

  const cell = (owner: string, stage: string) =>
    pipeline.find(
      (row) => String(row.owner_name ?? unassignedLabel) === owner && row.stage === stage
    );

  const totalPipeline = byStage
    .filter((row) => OPEN_DEAL_STAGES.includes(String(row.stage ?? "")))
    .reduce((sum, row) => sum + Number(row.amount ?? 0), 0);
  const weightedPipeline = byStage
    .filter((row) => OPEN_DEAL_STAGES.includes(String(row.stage ?? "")))
    .reduce(
      (sum, row) =>
        sum +
        Number(row.amount ?? 0) * (DEAL_STAGE_PROBABILITY[String(row.stage ?? "")] ?? 0),
      0
    );
  const wonTotal = monthly.reduce((sum, row) => sum + row.amount, 0);
  const wonCount = Number(wonLoss.find((row) => row.stage === "won")?.count ?? 0);
  const lostCount = Number(wonLoss.find((row) => row.stage === "lost")?.count ?? 0);
  const winRate = wonCount + lostCount > 0
    ? Math.round((wonCount / (wonCount + lostCount)) * 100)
    : 0;
  const averageWon = wonCount ? wonTotal / wonCount : 0;

  const drillToPipeline = (params: Record<string, string>) => {
    const search = new URLSearchParams(params).toString();
    navigate(`${crmRoutes.pipeline}?${search}`);
  };

  const stageFunnel = DEAL_STAGES.filter((stage) => stage.value !== "lost").map(
    (stage) => ({
      name: labelFor(DEAL_STAGES, stage.value, translate),
      stage: stage.value,
      value: Number(
        byStage.find((row) => row.stage === stage.value)?.amount ?? 0
      ),
    })
  );
  const funnelOption = {
    color: CRM_CHART_COLORS,
    tooltip: {
      trigger: "item",
      valueFormatter: (value: number) => formatCurrency(value, locale),
    },
    series: [
      {
        type: "funnel",
        left: 16,
        right: 16,
        top: 12,
        bottom: 12,
        sort: "descending",
        gap: 3,
        minSize: "22%",
        label: { color: "var(--muted-foreground)", formatter: "{b}" },
        itemStyle: { borderColor: "var(--card)", borderWidth: 2 },
        data: stageFunnel,
      },
    ],
  };

  const pipelineOption = {
    color: CRM_CHART_COLORS,
    tooltip: {
      trigger: "axis",
      axisPointer: { type: "shadow" },
      valueFormatter: (value: number) => formatCurrency(value, locale),
    },
    legend: { bottom: 0, textStyle: { color: "var(--muted-foreground)" } },
    grid: { left: 8, right: 12, top: 16, bottom: 52, containLabel: true },
    xAxis: {
      type: "category",
      data: owners.map((owner) => owner.name),
      axisLabel: {
        color: "var(--muted-foreground)",
        rotate: owners.length > 5 ? 18 : 0,
      },
      axisLine: { lineStyle: { color: "var(--border)" } },
    },
    yAxis: {
      type: "value",
      axisLabel: { color: "var(--muted-foreground)" },
      splitLine: { lineStyle: { color: "var(--border)", opacity: 0.55 } },
    },
    series: DEAL_STAGES.map((stage) => ({
      name: labelFor(DEAL_STAGES, stage.value, translate),
      type: "bar",
      stack: "pipeline",
      data: owners.map((owner) => Number(cell(owner.name, stage.value)?.amount ?? 0)),
      emphasis: { focus: "series" },
    })),
  };

  const monthlyOption = {
    color: ["#2563eb"],
    tooltip: {
      trigger: "axis",
      valueFormatter: (value: number) => formatCurrency(value, locale),
    },
    grid: { left: 8, right: 36, top: 16, bottom: 28, containLabel: true },
    xAxis: {
      type: "category",
      boundaryGap: false,
      data: monthly.map((row) => row.month),
      axisLabel: { color: "var(--muted-foreground)", interval: 0 },
      axisLine: { lineStyle: { color: "var(--border)" } },
    },
    yAxis: {
      type: "value",
      axisLabel: { color: "var(--muted-foreground)" },
      splitLine: { lineStyle: { color: "var(--border)", opacity: 0.55 } },
    },
    series: [
      {
        type: "line",
        smooth: true,
        symbolSize: 8,
        lineStyle: { width: 3 },
        areaStyle: { color: "rgba(37,99,235,0.14)" },
        data: monthly.map((row) => row.amount),
      },
    ],
  };

  const sourceRows = LEAD_SOURCES.map((source) => ({
    name: labelFor(LEAD_SOURCES, source.value, translate),
    value: leadsBySource
      .filter((row) => row.source === source.value)
      .reduce((sum, row) => sum + Number(row.count ?? 0), 0),
  })).filter((row) => row.value > 0);
  const sourceOption = {
    color: CRM_CHART_COLORS,
    tooltip: { trigger: "item" },
    legend: { bottom: 0, textStyle: { color: "var(--muted-foreground)" } },
    series: [
      {
        type: "pie",
        radius: ["48%", "72%"],
        center: ["50%", "44%"],
        itemStyle: { borderColor: "var(--card)", borderWidth: 3 },
        label: { color: "var(--muted-foreground)", formatter: "{b}\n{c}" },
        data: sourceRows,
      },
    ],
  };

  const winLossOption = {
    color: ["#2563eb", "#f87171"],
    tooltip: { trigger: "item" },
    legend: { bottom: 0, textStyle: { color: "var(--muted-foreground)" } },
    series: [
      {
        type: "pie",
        radius: ["48%", "72%"],
        center: ["50%", "44%"],
        itemStyle: { borderColor: "var(--card)", borderWidth: 3 },
        label: { color: "var(--muted-foreground)", formatter: "{b}\n{c}" },
        data: [
          { name: labelFor(DEAL_STAGES, "won", translate), value: wonCount },
          { name: labelFor(DEAL_STAGES, "lost", translate), value: lostCount },
        ],
      },
    ],
  };

  const exportCsv = () => {
    const headers = [
      translate("crm.reports.csv.owner", { ns: "starter" }, "Owner"),
      ...DEAL_STAGES.map((stage) => labelFor(DEAL_STAGES, stage.value, translate)),
      translate("crm.reports.csv.total", { ns: "starter" }, "Total"),
    ];
    const rows = owners.map((owner) => {
      const amounts = DEAL_STAGES.map((stage) =>
        Number(cell(owner.name, stage.value)?.amount ?? 0)
      );
      return [owner.name, ...amounts, amounts.reduce((sum, amount) => sum + amount, 0)];
    });
    const monthlyHeader = [
      translate("crm.reports.csv.month", { ns: "starter" }, "Month"),
      translate("crm.reports.csv.wonAmount", { ns: "starter" }, "Won amount"),
      translate("crm.reports.csv.deals", { ns: "starter" }, "Won deals"),
    ];
    const escape = (value: string | number) => `"${String(value).replaceAll('"', '""')}"`;
    const csv = [
      [translate("crm.reports.csv.range", { ns: "starter" }, "Range"), range.from || "—", range.to || "—"],
      [],
      headers,
      ...rows,
      [],
      monthlyHeader,
      ...monthly.map((row) => [row.month, row.amount, row.count]),
    ]
      .map((row) => row.map(escape).join(","))
      .join("\n");
    const url = URL.createObjectURL(
      new Blob(["﻿", csv], { type: "text/csv;charset=utf-8" })
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = "crm-sales-report.csv";
    link.click();
    URL.revokeObjectURL(url);
  };

  if (analytics.isError) {
    return (
      <ListView resource="crm_reports">
        <div className="rounded-xl border bg-card">
          <ListErrorState onRetry={() => void analytics.refetch()} />
        </div>
      </ListView>
    );
  }

  return (
    <ListView resource="crm_reports">
      <div className="flex flex-wrap items-center gap-3 rounded-xl border bg-card p-3 shadow-sm">
        <div className="flex flex-wrap items-center gap-1 rounded-lg border p-0.5">
          {RANGE_PRESETS.map((preset) => (
            <Button
              key={preset}
              size="sm"
              variant={
                !state.from && !state.to && state.range === preset ? "secondary" : "ghost"
              }
              onClick={() => setState({ range: preset, from: "", to: "" })}
            >
              {translate(
                `crm.reports.range.${preset}`,
                { ns: "starter" },
                preset === "month"
                  ? "This month"
                  : preset === "quarter"
                    ? "This quarter"
                    : preset === "year"
                      ? "This year"
                      : preset === "trailing12"
                        ? "Last 12 months"
                        : "All time"
              )}
            </Button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">
            {translate("crm.reports.range.custom", { ns: "starter" }, "Custom")}
          </span>
          <Input
            type="date"
            className="w-40"
            value={state.from}
            onChange={(event) => setState({ from: event.target.value })}
          />
          <span className="text-muted-foreground">–</span>
          <Input
            type="date"
            className="w-40"
            value={state.to}
            onChange={(event) => setState({ to: event.target.value })}
          />
        </div>
        <Button className="ml-auto" onClick={exportCsv}>
          <Download />
          {translate("crm.reports.export", { ns: "starter" }, "Export CSV")}
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <MetricCard label={translate("crm.reports.metrics.pipeline", { ns: "starter" }, "Open pipeline")} value={formatCurrency(totalPipeline, locale)} icon={<Layers3 className="size-5" />} loading={analytics.isLoading} />
        <MetricCard label={translate("crm.reports.metrics.weighted", { ns: "starter" }, "Weighted forecast")} value={formatCurrency(weightedPipeline, locale)} icon={<Percent className="size-5" />} loading={analytics.isLoading} />
        <MetricCard label={translate("crm.reports.metrics.won", { ns: "starter" }, "Won revenue")} value={formatCurrency(wonTotal, locale)} icon={<TrendingUp className="size-5" />} loading={analytics.isLoading} />
        <MetricCard label={translate("crm.reports.metrics.winRate", { ns: "starter" }, "Win rate")} value={`${winRate}%`} detail={translate("crm.reports.metrics.winRateDetail", { ns: "starter", count: wonCount + lostCount }, `${wonCount + lostCount} closed deals`)} icon={<Percent className="size-5" />} loading={analytics.isLoading} />
        <MetricCard label={translate("crm.reports.metrics.averageWon", { ns: "starter" }, "Average won deal")} value={formatCurrency(averageWon, locale)} icon={<LineChart className="size-5" />} loading={analytics.isLoading} />
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <ChartCard
          title={translate("crm.reports.funnel.title", { ns: "starter" }, "Pipeline funnel")}
          description={translate(
            "crm.reports.funnel.description",
            { ns: "starter" },
            "Value at each stage. Click a band to open that stage in the pipeline."
          )}
        >
          {analytics.isLoading ? (
            <Skeleton className="h-[340px] w-full" />
          ) : (
            <ReactECharts
              option={funnelOption}
              opts={{ renderer: "svg" }}
              style={{ height: 340 }}
              onEvents={{
                click: (params: { dataIndex?: number }) => {
                  const entry = stageFunnel[params.dataIndex ?? -1];
                  if (entry) drillToPipeline({ stage: entry.stage, layout: "table" });
                },
              }}
            />
          )}
        </ChartCard>
        <ChartCard
          title={translate("crm.reports.monthlyChart.title", { ns: "starter" }, "Monthly won revenue")}
          description={translate("crm.reports.monthlyChart.description", { ns: "starter" }, "Closed-won value consolidated by month.")}
        >
          {analytics.isLoading ? (
            <Skeleton className="h-[340px] w-full" />
          ) : (
            <ReactECharts option={monthlyOption} opts={{ renderer: "svg" }} style={{ height: 340 }} />
          )}
        </ChartCard>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.5fr_1fr_1fr]">
        <ChartCard
          title={translate("crm.reports.pipelineChart.title", { ns: "starter" }, "Pipeline by owner and stage")}
          description={translate(
            "crm.reports.pipelineChart.description",
            { ns: "starter" },
            "Stacked pipeline value per owner. Click a bar to drill into those deals."
          )}
        >
          {analytics.isLoading ? (
            <Skeleton className="h-[320px] w-full" />
          ) : (
            <ReactECharts
              option={pipelineOption}
              opts={{ renderer: "svg" }}
              style={{ height: 320 }}
              onEvents={{
                click: (params: { dataIndex?: number; seriesIndex?: number }) => {
                  const owner = owners[params.dataIndex ?? -1];
                  const stage = DEAL_STAGES[params.seriesIndex ?? -1];
                  if (owner?.id) {
                    drillToPipeline({
                      owner: owner.id,
                      ...(stage ? { stage: stage.value } : {}),
                      layout: "table",
                    });
                  }
                },
              }}
            />
          )}
        </ChartCard>
        <ChartCard
          title={translate("crm.reports.sources.title", { ns: "starter" }, "Lead sources")}
          description={translate("crm.reports.sources.description", { ns: "starter" }, "Where demand comes from.")}
        >
          {analytics.isLoading ? (
            <Skeleton className="h-[320px] w-full" />
          ) : (
            <ReactECharts option={sourceOption} opts={{ renderer: "svg" }} style={{ height: 320 }} />
          )}
        </ChartCard>
        <ChartCard
          title={translate("crm.reports.winLoss.title", { ns: "starter" }, "Win / loss")}
          description={translate("crm.reports.winLoss.description", { ns: "starter" }, "Closed deals split by outcome.")}
        >
          {analytics.isLoading ? (
            <Skeleton className="h-[320px] w-full" />
          ) : (
            <ReactECharts option={winLossOption} opts={{ renderer: "svg" }} style={{ height: 320 }} />
          )}
        </ChartCard>
      </div>

      <ChartCard
        title={translate("crm.reports.pivot.title", { ns: "starter" }, "Pipeline pivot")}
        description={translate(
          "crm.reports.pivot.description",
          { ns: "starter" },
          "Owners on rows, deal stages on columns. Click a row to open that owner's deals."
        )}
        action={<Rows3 className="size-5 text-blue-600" />}
      >
        <div className="overflow-x-auto rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{translate("crm.reports.csv.owner", { ns: "starter" }, "Owner")}</TableHead>
                {DEAL_STAGES.map((stage) => (
                  <TableHead key={stage.value} className="text-right">
                    {labelFor(DEAL_STAGES, stage.value, translate)}
                  </TableHead>
                ))}
                <TableHead className="text-right">
                  {translate("crm.reports.csv.total", { ns: "starter" }, "Total")}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {owners.map((owner) => {
                const amounts = DEAL_STAGES.map((stage) =>
                  Number(cell(owner.name, stage.value)?.amount ?? 0)
                );
                return (
                  <TableRow
                    key={owner.name}
                    className={cn(owner.id && "cursor-pointer")}
                    onClick={() =>
                      owner.id && drillToPipeline({ owner: owner.id, layout: "table" })
                    }
                  >
                    <TableCell className="font-medium">{owner.name}</TableCell>
                    {amounts.map((amount, index) => (
                      <TableCell key={DEAL_STAGES[index].value} className="text-right tabular-nums">
                        {formatCurrency(amount, locale)}
                      </TableCell>
                    ))}
                    <TableCell className="text-right font-semibold tabular-nums">
                      {formatCurrency(amounts.reduce((sum, amount) => sum + amount, 0), locale)}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </ChartCard>

      <ChartCard
        title={translate("crm.reports.monthlyTable.title", { ns: "starter" }, "Won by month")}
        description={translate("crm.reports.monthlyTable.description", { ns: "starter" }, "A pivot-ready monthly revenue series.")}
      >
        <div className="overflow-hidden rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{translate("crm.reports.csv.month", { ns: "starter" }, "Month")}</TableHead>
                <TableHead className="text-right">{translate("crm.reports.csv.deals", { ns: "starter" }, "Won deals")}</TableHead>
                <TableHead className="text-right">{translate("crm.reports.csv.wonAmount", { ns: "starter" }, "Won amount")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {monthly.map((row) => (
                <TableRow key={row.month}>
                  <TableCell className="font-medium">{row.month}</TableCell>
                  <TableCell className="text-right tabular-nums">{row.count}</TableCell>
                  <TableCell className="text-right font-semibold tabular-nums">
                    {formatCurrency(row.amount, locale)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </ChartCard>
    </ListView>
  );
}
