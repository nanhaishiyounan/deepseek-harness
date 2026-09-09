import { useList, useTranslate } from "@refinedev/core";
import ReactECharts from "echarts-for-react";
import {
  Award,
  CalendarDays,
  DollarSign,
  Gauge,
  TrendingDown,
  TrendingUp,
  Trophy,
} from "lucide-react";
import { useMemo } from "react";
import { ListView } from "@/components/resources/views/list-view";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
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
import { useWonByOwner } from "../analytics";
import { CRM_CHART_COLORS, formatCurrency } from "../constants";
import { csvTimestamp, downloadCsv, type CsvColumn } from "../csv";
import { ExportCsvButton } from "../list-toolkit";
import { ChartCard, MetricCard } from "../overview-cards";
import { useLocale } from "../shared";
import { useUrlState } from "../url-state";
import type { TargetRecord } from "../types";

const TARGET_DEFAULTS = {
  period: new Date().toISOString().slice(0, 7),
  mode: "month",
};

type TargetState = typeof TARGET_DEFAULTS;

type AttainmentRow = TargetRecord & {
  ownerName: string;
  quota: number;
  won: number;
  dealCount: number;
  attainment: number;
  gap: number;
};

const iso = (date: Date) => date.toISOString().slice(0, 10);

/** Start/end of the reporting window plus the months its quotas come from. */
function resolveWindow(period: string, mode: string) {
  const [year, month] = period.split("-").map(Number);
  if (mode === "quarter") {
    const quarterStart = Math.floor((month - 1) / 3) * 3;
    const months = [0, 1, 2].map(
      (offset) => `${year}-${String(quarterStart + offset + 1).padStart(2, "0")}`
    );
    return {
      from: iso(new Date(Date.UTC(year, quarterStart, 1))),
      to: iso(new Date(Date.UTC(year, quarterStart + 3, 0))),
      months,
      previous: {
        from: iso(new Date(Date.UTC(year, quarterStart - 3, 1))),
        to: iso(new Date(Date.UTC(year, quarterStart, 0))),
      },
    };
  }
  return {
    from: iso(new Date(Date.UTC(year, month - 1, 1))),
    to: iso(new Date(Date.UTC(year, month, 0))),
    months: [period],
    previous: {
      from: iso(new Date(Date.UTC(year, month - 2, 1))),
      to: iso(new Date(Date.UTC(year, month - 1, 0))),
    },
  };
}

export function TargetsPage() {
  const translate = useTranslate();
  const locale = useLocale();
  const { state, setState } = useUrlState<TargetState>(TARGET_DEFAULTS);
  const window = useMemo(
    () => resolveWindow(state.period, state.mode),
    [state.mode, state.period]
  );

  const { result, query } = useList<TargetRecord>({
    resource: "crm_targets",
    pagination: { mode: "server", currentPage: 1, pageSize: 100 },
    sorters: [{ field: "period", order: "desc" }],
    meta: { appends: ["owner"] },
    errorNotification: false,
    queryOptions: { retry: false },
  });
  const actuals = useWonByOwner(window.from, window.to);
  const previousActuals = useWonByOwner(window.previous.from, window.previous.to);

  const rows = useMemo<AttainmentRow[]>(() => {
    const byOwner = new Map<string, AttainmentRow>();
    for (const target of result.data) {
      const period = String(target.period ?? "").slice(0, 7);
      if (!window.months.includes(period)) continue;
      const key = String(target.owner_id ?? target.id);
      const existing = byOwner.get(key);
      const quota = Number(target.quota_amount ?? 0);
      if (existing) {
        existing.quota += quota;
      } else {
        byOwner.set(key, {
          ...target,
          ownerName: target.owner?.nickname ?? "—",
          quota,
          won: 0,
          dealCount: 0,
          attainment: 0,
          gap: 0,
        });
      }
    }
    for (const [key, row] of byOwner) {
      const actual = actuals.data?.find((item) => String(item.owner_id) === key);
      row.ownerName =
        row.owner?.nickname ?? String(actual?.owner_name ?? row.ownerName);
      row.won = Number(actual?.won_amount ?? 0);
      row.dealCount = Number(actual?.deal_count ?? 0);
      row.attainment = row.quota > 0 ? (row.won / row.quota) * 100 : 0;
      row.gap = row.quota - row.won;
    }
    return [...byOwner.values()].sort(
      (left, right) => right.attainment - left.attainment
    );
  }, [actuals.data, result.data, window.months]);

  const quotaTotal = rows.reduce((sum, row) => sum + row.quota, 0);
  const wonTotal = rows.reduce((sum, row) => sum + row.won, 0);
  const attainment = quotaTotal ? (wonTotal / quotaTotal) * 100 : 0;
  const previousWon = (previousActuals.data ?? []).reduce(
    (sum, row) => sum + Number(row.won_amount ?? 0),
    0
  );
  const growth = previousWon ? ((wonTotal - previousWon) / previousWon) * 100 : 0;

  /**
   * Where the team should be today if revenue landed evenly across the window —
   * the "pace" line every quota dashboard draws so a mid-period number can be
   * read as ahead or behind rather than just "not 100% yet".
   */
  const elapsed = useMemo(() => {
    const start = new Date(`${window.from}T00:00:00`).getTime();
    const end = new Date(`${window.to}T23:59:59`).getTime();
    const now = Date.now();
    if (now <= start) return 0;
    if (now >= end) return 1;
    return (now - start) / (end - start);
  }, [window.from, window.to]);
  const expectedToDate = quotaTotal * elapsed;
  const onTrack = wonTotal >= expectedToDate;

  const chartOption = {
    color: CRM_CHART_COLORS,
    tooltip: {
      trigger: "axis",
      axisPointer: { type: "shadow" },
      valueFormatter: (value: number) => formatCurrency(value, locale),
    },
    legend: { bottom: 0, textStyle: { color: "var(--muted-foreground)" } },
    grid: { left: 12, right: 16, top: 12, bottom: 42, containLabel: true },
    xAxis: {
      type: "category",
      data: rows.map((row) => row.ownerName),
      axisLabel: { color: "var(--muted-foreground)" },
      axisLine: { lineStyle: { color: "var(--border)" } },
    },
    yAxis: {
      type: "value",
      axisLabel: { color: "var(--muted-foreground)" },
      splitLine: { lineStyle: { color: "var(--border)", opacity: 0.55 } },
    },
    series: [
      {
        name: translate("crm.targets.quota", { ns: "starter" }, "Quota"),
        type: "bar",
        barMaxWidth: 34,
        data: rows.map((row) => row.quota),
        itemStyle: { color: "#bfdbfe", borderRadius: [6, 6, 0, 0] },
      },
      {
        name: translate("crm.targets.actual", { ns: "starter" }, "Won revenue"),
        type: "bar",
        barMaxWidth: 34,
        data: rows.map((row) => row.won),
        itemStyle: { color: "#2563eb", borderRadius: [6, 6, 0, 0] },
      },
      {
        name: translate("crm.targets.pace", { ns: "starter" }, "Pace to date"),
        type: "line",
        symbolSize: 7,
        lineStyle: { width: 2, type: "dashed" },
        itemStyle: { color: "#f59e0b" },
        data: rows.map((row) => Math.round(row.quota * elapsed)),
      },
    ],
  };

  const csvColumns = useMemo<CsvColumn<AttainmentRow>[]>(
    () => [
      { header: translate("crm.targets.owner", { ns: "starter" }, "Owner"), value: (row) => row.ownerName },
      { header: translate("crm.targets.quota", { ns: "starter" }, "Quota"), value: (row) => row.quota },
      { header: translate("crm.targets.actual", { ns: "starter" }, "Won revenue"), value: (row) => row.won },
      { header: translate("crm.targets.gap", { ns: "starter" }, "Gap to quota"), value: (row) => Math.round(row.gap) },
      { header: translate("crm.targets.attainment", { ns: "starter" }, "Attainment"), value: (row) => `${row.attainment.toFixed(1)}%` },
      { header: translate("crm.targets.dealsWonHeader", { ns: "starter" }, "Won deals"), value: (row) => row.dealCount },
    ],
    [translate]
  );

  const loading = query.isLoading || actuals.isLoading;

  return (
    <ListView resource="crm_targets">
      <div className="flex flex-wrap items-end gap-4 rounded-xl border bg-card p-4 shadow-sm">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-300">
          <CalendarDays className="size-5" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="target-month">
            {translate("crm.targets.period", { ns: "starter" }, "Target month")}
          </Label>
          <Input
            id="target-month"
            type="month"
            value={state.period}
            onChange={(event) => setState({ period: event.target.value })}
          />
        </div>
        <div className="flex items-center gap-1 rounded-lg border p-0.5">
          <Button
            size="sm"
            variant={state.mode === "month" ? "secondary" : "ghost"}
            onClick={() => setState({ mode: "month" })}
          >
            {translate("crm.targets.mode.month", { ns: "starter" }, "Month")}
          </Button>
          <Button
            size="sm"
            variant={state.mode === "quarter" ? "secondary" : "ghost"}
            onClick={() => setState({ mode: "quarter" })}
          >
            {translate("crm.targets.mode.quarter", { ns: "starter" }, "Quarter")}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          {window.from} – {window.to}
        </p>
        <div className="ml-auto">
          <ExportCsvButton
            disabled={rows.length === 0}
            onExport={() =>
              downloadCsv(`crm-attainment-${csvTimestamp()}.csv`, csvColumns, rows)
            }
          />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <MetricCard label={translate("crm.targets.totalQuota", { ns: "starter" }, "Team quota")} value={formatCurrency(quotaTotal, locale)} icon={<DollarSign className="size-5" />} loading={query.isLoading} />
        <MetricCard label={translate("crm.targets.won", { ns: "starter" }, "Won revenue")} value={formatCurrency(wonTotal, locale)} icon={<Trophy className="size-5" />} loading={actuals.isLoading} />
        <MetricCard label={translate("crm.targets.attainment", { ns: "starter" }, "Team attainment")} value={`${attainment.toFixed(1)}%`} detail={translate("crm.targets.gapDetail", { ns: "starter" }, "Gap") + `: ${formatCurrency(Math.max(quotaTotal - wonTotal, 0), locale)}`} icon={<Award className="size-5" />} loading={actuals.isLoading} />
        <MetricCard
          label={translate("crm.targets.pace", { ns: "starter" }, "Pace to date")}
          value={`${Math.round(elapsed * 100)}%`}
          detail={
            onTrack
              ? translate("crm.targets.onTrack", { ns: "starter" }, "Ahead of pace")
              : translate("crm.targets.behind", { ns: "starter" }, "Behind pace") +
                ` · ${formatCurrency(Math.max(expectedToDate - wonTotal, 0), locale)}`
          }
          icon={<Gauge className="size-5" />}
          loading={actuals.isLoading}
        />
        <MetricCard
          label={translate("crm.targets.growth", { ns: "starter" }, "vs previous period")}
          value={`${growth >= 0 ? "+" : ""}${growth.toFixed(1)}%`}
          detail={formatCurrency(previousWon, locale)}
          icon={growth >= 0 ? <TrendingUp className="size-5" /> : <TrendingDown className="size-5" />}
          loading={previousActuals.isLoading}
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.2fr_1fr]">
        <ChartCard
          title={translate("crm.targets.chart.title", { ns: "starter" }, "Quota versus actual")}
          description={translate(
            "crm.targets.chart.description",
            { ns: "starter" },
            "Won revenue against each owner's target, with the dashed line showing where they should be today."
          )}
        >
          {loading ? (
            <Skeleton className="h-[340px] w-full" />
          ) : (
            <ReactECharts option={chartOption} opts={{ renderer: "svg" }} style={{ height: 340 }} />
          )}
        </ChartCard>
        <ChartCard
          title={translate("crm.targets.leaderboard.title", { ns: "starter" }, "Owner leaderboard")}
          description={translate("crm.targets.leaderboard.description", { ns: "starter" }, "Ranked by percentage of quota attained.")}
        >
          <div className="overflow-x-auto rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12">#</TableHead>
                  <TableHead>{translate("crm.targets.owner", { ns: "starter" }, "Owner")}</TableHead>
                  <TableHead className="text-right">{translate("crm.targets.actual", { ns: "starter" }, "Won revenue")}</TableHead>
                  <TableHead className="text-right">{translate("crm.targets.gap", { ns: "starter" }, "Gap to quota")}</TableHead>
                  <TableHead className="w-32">{translate("crm.targets.attainment", { ns: "starter" }, "Attainment")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="py-10 text-center text-sm text-muted-foreground">
                      {translate(
                        "crm.targets.empty",
                        { ns: "starter" },
                        "No quotas are defined for this period."
                      )}
                    </TableCell>
                  </TableRow>
                ) : (
                  rows.map((row, index) => {
                    const ownerOnTrack = row.won >= row.quota * elapsed;
                    return (
                      <TableRow key={String(row.id)}>
                        <TableCell className="font-semibold text-blue-600">{index + 1}</TableCell>
                        <TableCell>
                          <div className="font-medium">{row.ownerName}</div>
                          <div className="text-xs text-muted-foreground">
                            {translate(
                              "crm.targets.dealsWon",
                              { ns: "starter", count: row.dealCount },
                              `${row.dealCount} won deals`
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-right font-semibold tabular-nums">
                          {formatCurrency(row.won, locale)}
                        </TableCell>
                        <TableCell
                          className={cn(
                            "text-right tabular-nums",
                            row.gap > 0
                              ? "text-amber-600 dark:text-amber-400"
                              : "text-emerald-600 dark:text-emerald-400"
                          )}
                        >
                          {row.gap > 0
                            ? formatCurrency(row.gap, locale)
                            : translate("crm.targets.met", { ns: "starter" }, "Met")}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Progress value={Math.min(row.attainment, 100)} className="w-20" />
                            <span
                              className={cn(
                                "text-xs font-semibold tabular-nums",
                                ownerOnTrack
                                  ? "text-emerald-600 dark:text-emerald-400"
                                  : "text-amber-600 dark:text-amber-400"
                              )}
                            >
                              {row.attainment.toFixed(0)}%
                            </span>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </ChartCard>
      </div>
    </ListView>
  );
}
