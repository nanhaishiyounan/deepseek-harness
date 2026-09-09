import { useTranslate } from "@refinedev/core";
import ReactECharts from "echarts-for-react";
import { Medal, Pencil, RefreshCcw, Target } from "lucide-react";
import { useMemo, useState } from "react";
import { Link } from "react-router";
import { ListView } from "@/components/resources/views/list-view";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Skeleton } from "@/components/ui/skeleton";
import { useChartTheme } from "@/pages/home/theme";
import { cn } from "@/lib/utils";
import {
  DEAL_STAGES,
  OPEN_DEAL_STAGES,
  formatCurrency,
  formatCurrencyCompact,
  labelFor,
} from "../constants";
import { useDealData } from "../deals/use-deal-data";
import { salesRoutes } from "../module";
import { EmptyRow, SimpleTable, useLocale, userLabel } from "../shared";

type PeriodId = "thisQuarter" | "nextQuarter" | "thisYear" | "all";
type GroupBy = "owner" | "stage" | "month";

const QUOTA_KEY = "hub.sales.forecast.quota";

/**
 * Salesforce forecast categories, derived from the stage. There is no forecast
 * category column on hub_sales_deals, so the mapping lives here and is stated
 * in the UI rather than implied.
 */
const CATEGORY_OF: Record<string, "closed" | "commit" | "bestCase" | "pipeline"> = {
  won: "closed",
  negotiation: "commit",
  quote: "bestCase",
  inquiry: "pipeline",
};

function periodRange(period: PeriodId): { from: string; to: string } | null {
  const now = new Date();
  const year = now.getFullYear();
  const quarter = Math.floor(now.getMonth() / 3);
  const pad = (value: number) => String(value).padStart(2, "0");
  const quarterRange = (targetYear: number, targetQuarter: number) => {
    const startMonth = targetQuarter * 3 + 1;
    const endMonth = startMonth + 2;
    const endDay = new Date(targetYear, endMonth, 0).getDate();
    return {
      from: `${targetYear}-${pad(startMonth)}-01`,
      to: `${targetYear}-${pad(endMonth)}-${pad(endDay)}`,
    };
  };
  switch (period) {
    case "thisQuarter":
      return quarterRange(year, quarter);
    case "nextQuarter":
      return quarter === 3
        ? quarterRange(year + 1, 0)
        : quarterRange(year, quarter + 1);
    case "thisYear":
      return { from: `${year}-01-01`, to: `${year}-12-31` };
    default:
      return null;
  }
}

export function ForecastPage() {
  const translate = useTranslate();
  const locale = useLocale();
  const chart = useChartTheme();
  const { deals, isLoading, isError, refetch } = useDealData();

  const [period, setPeriod] = useState<PeriodId>("thisQuarter");
  const [groupBy, setGroupBy] = useState<GroupBy>("owner");
  const [quota, setQuota] = useState<number | null>(() => {
    if (typeof window === "undefined") return null;
    const raw = window.localStorage.getItem(QUOTA_KEY);
    return raw ? Number(raw) : null;
  });

  const inPeriod = useMemo(() => {
    const range = periodRange(period);
    if (!range) return deals;
    return deals.filter((deal) => {
      const close = deal.expected_close_date;
      return Boolean(close && close >= range.from && close <= range.to);
    });
  }, [deals, period]);

  const buckets = useMemo(() => {
    const totals = { closed: 0, commit: 0, bestCase: 0, pipeline: 0, lost: 0 };
    for (const deal of inPeriod) {
      const amount = Number(deal.amount ?? 0);
      if (deal.stage === "lost") {
        totals.lost += amount;
        continue;
      }
      const category = CATEGORY_OF[deal.stage ?? "inquiry"] ?? "pipeline";
      totals[category] += amount;
    }
    return totals;
  }, [inPeriod]);

  const weighted = useMemo(
    () =>
      inPeriod
        .filter((deal) => deal.isOpen)
        .reduce((total, deal) => total + deal.weighted, 0),
    [inPeriod]
  );

  // Forecast = already-closed revenue plus the weighted value of what is open.
  const forecast = buckets.closed + weighted;

  // No quota table exists on the backend, so the target defaults to a round
  // number near the period's own forecast and is then user-editable.
  const suggestedQuota = useMemo(() => {
    const base = buckets.closed + buckets.commit + buckets.bestCase;
    if (base <= 0) return 0;
    return Math.max(50_000, Math.round((base * 0.8) / 50_000) * 50_000);
  }, [buckets]);

  const effectiveQuota = quota ?? suggestedQuota;
  const attainment =
    effectiveQuota > 0 ? Math.round((forecast / effectiveQuota) * 100) : 0;

  const rows = useMemo(() => {
    type Row = {
      key: string;
      label: string;
      href?: string;
      closed: number;
      commit: number;
      bestCase: number;
      weighted: number;
      count: number;
      wonCount: number;
      decided: number;
    };
    const map = new Map<string, Row>();
    const bucket = (key: string, label: string, href?: string) => {
      const existing = map.get(key);
      if (existing) return existing;
      const created: Row = {
        key,
        label,
        href,
        closed: 0,
        commit: 0,
        bestCase: 0,
        weighted: 0,
        count: 0,
        wonCount: 0,
        decided: 0,
      };
      map.set(key, created);
      return created;
    };

    for (const deal of inPeriod) {
      let key: string;
      let label: string;
      let href: string | undefined;
      if (groupBy === "owner") {
        key = deal.owner ? String(deal.owner.id) : "unassigned";
        label = deal.owner
          ? userLabel(deal.owner)
          : translate(
              "sales.forecast.leaderboard.unassigned",
              { ns: "starter" },
              "Unassigned"
            );
        href = deal.owner
          ? `${salesRoutes.pipeline}?tab=table&owner=${deal.owner.id}`
          : undefined;
      } else if (groupBy === "stage") {
        key = deal.stage ?? "inquiry";
        label = labelFor(DEAL_STAGES, key, translate);
        href = `${salesRoutes.pipeline}?tab=table&stage=${key}`;
      } else {
        key = deal.expected_close_date?.slice(0, 7) ?? "—";
        label = key;
      }
      const entry = bucket(key, label, href);
      const amount = Number(deal.amount ?? 0);
      entry.count += 1;
      if (deal.stage === "won") {
        entry.closed += amount;
        entry.wonCount += 1;
        entry.decided += 1;
      } else if (deal.stage === "lost") {
        entry.decided += 1;
      } else if (deal.stage === "negotiation") {
        entry.commit += amount;
      } else if (deal.stage === "quote") {
        entry.bestCase += amount;
      }
      if (OPEN_DEAL_STAGES.includes(deal.stage ?? "")) {
        entry.weighted += deal.weighted;
      }
    }

    const list = Array.from(map.values());
    return groupBy === "month"
      ? list.sort((left, right) => left.key.localeCompare(right.key))
      : list.sort(
          (left, right) =>
            right.closed + right.weighted - (left.closed + left.weighted)
        );
  }, [inPeriod, groupBy, translate]);

  const maxRow = Math.max(
    1,
    ...rows.map((row) => row.closed + row.weighted)
  );

  const monthlyOption = useMemo(() => {
    const months = new Map<string, { closed: number; weighted: number }>();
    for (const deal of inPeriod) {
      const key = deal.expected_close_date?.slice(0, 7);
      if (!key) continue;
      const entry = months.get(key) ?? { closed: 0, weighted: 0 };
      if (deal.stage === "won") entry.closed += Number(deal.amount ?? 0);
      if (deal.isOpen) entry.weighted += deal.weighted;
      months.set(key, entry);
    }
    const keys = Array.from(months.keys()).sort();
    return {
      color: [chart.palette[2], chart.palette[0]],
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
        backgroundColor: chart.tooltipBg,
        borderColor: chart.tooltipBorder,
        borderWidth: 1,
        textStyle: { color: chart.tooltipText, fontSize: 12 },
        valueFormatter: (value: number) => formatCurrencyCompact(value, locale),
      },
      xAxis: {
        type: "category",
        data: keys,
        axisTick: { show: false },
        axisLine: { lineStyle: { color: chart.grid } },
        axisLabel: { color: chart.axis, fontSize: 12 },
      },
      yAxis: {
        type: "value",
        axisLine: { show: false },
        splitLine: { lineStyle: { color: chart.grid } },
        axisLabel: {
          color: chart.axis,
          fontSize: 12,
          formatter: (value: number) => formatCurrencyCompact(value, locale),
        },
      },
      series: [
        {
          name: translate("sales.forecast.series.closed", { ns: "starter" }, "Closed won"),
          type: "bar",
          stack: "forecast",
          data: keys.map((key) => months.get(key)?.closed ?? 0),
          barWidth: 22,
          itemStyle: { borderRadius: [0, 0, 0, 0] },
        },
        {
          name: translate(
            "sales.forecast.series.weighted",
            { ns: "starter" },
            "Weighted open"
          ),
          type: "bar",
          stack: "forecast",
          data: keys.map((key) => months.get(key)?.weighted ?? 0),
          barWidth: 22,
          itemStyle: { borderRadius: [4, 4, 0, 0] },
        },
      ],
    };
  }, [inPeriod, chart, locale, translate]);

  const funnelOption = useMemo(() => {
    const rank: Record<string, number> = {
      inquiry: 0,
      quote: 1,
      negotiation: 2,
      won: 3,
      lost: 0,
    };
    const stages = ["inquiry", "quote", "negotiation", "won"];
    return {
      color: chart.palette,
      tooltip: {
        trigger: "item",
        backgroundColor: chart.tooltipBg,
        borderColor: chart.tooltipBorder,
        borderWidth: 1,
        textStyle: { color: chart.tooltipText, fontSize: 12 },
      },
      series: [
        {
          type: "funnel",
          left: "6%",
          right: "6%",
          top: 10,
          bottom: 10,
          width: "88%",
          minSize: "24%",
          gap: 3,
          label: {
            show: true,
            position: "inside",
            color: "#fff",
            fontSize: 12,
            formatter: "{b}\n{c}",
          },
          itemStyle: { borderColor: chart.tooltipBg, borderWidth: 1 },
          data: stages.map((stage, index) => ({
            name: labelFor(DEAL_STAGES, stage, translate),
            value: inPeriod.filter(
              (deal) => rank[deal.stage ?? "inquiry"] >= rank[stage]
            ).length,
            itemStyle: { color: chart.palette[index % chart.palette.length] },
          })),
        },
      ],
    };
  }, [inPeriod, chart, translate]);

  if (isError) {
    return (
      <ListView resource="hub_sales_deals">
        <div className="flex flex-col items-center gap-3 rounded-xl border border-destructive/30 bg-destructive/5 px-6 py-16 text-center">
          <p className="text-sm font-medium">
            {translate(
              "sales.forecast.loadError.title",
              { ns: "starter" },
              "Unable to load forecast"
            )}
          </p>
          <Button variant="outline" size="sm" onClick={refetch}>
            <RefreshCcw />
            {translate("sales.grid.error.retry", { ns: "starter" }, "Retry")}
          </Button>
        </div>
      </ListView>
    );
  }

  const periods: Array<{ id: PeriodId; label: string }> = [
    {
      id: "thisQuarter",
      label: translate("sales.forecast.period.thisQuarter", { ns: "starter" }, "This quarter"),
    },
    {
      id: "nextQuarter",
      label: translate("sales.forecast.period.nextQuarter", { ns: "starter" }, "Next quarter"),
    },
    {
      id: "thisYear",
      label: translate("sales.forecast.period.thisYear", { ns: "starter" }, "This year"),
    },
    {
      id: "all",
      label: translate("sales.forecast.period.all", { ns: "starter" }, "All open"),
    },
  ];

  return (
    <ListView resource="hub_sales_deals">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          {periods.map((entry) => (
            <Button
              key={entry.id}
              variant={period === entry.id ? "secondary" : "ghost"}
              size="sm"
              onClick={() => setPeriod(entry.id)}
            >
              {entry.label}
            </Button>
          ))}
        </div>
        <div className="ml-auto flex items-center gap-1.5">
          <QuotaEditor
            quota={effectiveQuota}
            isCustom={quota !== null}
            onChange={(value) => {
              setQuota(value);
              if (value === null) window.localStorage.removeItem(QUOTA_KEY);
              else window.localStorage.setItem(QUOTA_KEY, String(value));
            }}
          />
          <Button
            variant="outline"
            size="icon-sm"
            onClick={refetch}
            aria-label={translate("sales.toolbar.refresh", { ns: "starter" }, "Refresh")}
          >
            <RefreshCcw />
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
          <Skeleton className="h-40 rounded-xl xl:col-span-2" />
          <Skeleton className="h-40 rounded-xl" />
        </div>
      ) : (
        <>
          {/* Forecast vs target */}
          <Card>
            <CardContent className="pt-6">
              <div className="flex flex-wrap items-end justify-between gap-4">
                <div>
                  <p className="text-sm text-muted-foreground">
                    {translate(
                      "sales.forecast.headline.label",
                      { ns: "starter" },
                      "Forecast for this period"
                    )}
                  </p>
                  <p className="mt-1 text-4xl font-semibold tracking-tight tabular-nums">
                    {formatCurrency(forecast, locale)}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {translate(
                      "sales.forecast.headline.hint",
                      { ns: "starter" },
                      "Closed won + weighted value of open deals"
                    )}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-sm text-muted-foreground">
                    {translate("sales.forecast.target", { ns: "starter" }, "Target")}
                  </p>
                  <p className="mt-1 text-2xl font-semibold tabular-nums">
                    {formatCurrency(effectiveQuota, locale)}
                  </p>
                  <p
                    className={cn(
                      "mt-1 text-xs font-medium tabular-nums",
                      attainment >= 100
                        ? "text-emerald-600 dark:text-emerald-400"
                        : attainment >= 70
                          ? "text-amber-600 dark:text-amber-400"
                          : "text-red-600 dark:text-red-400"
                    )}
                  >
                    {translate(
                      "sales.forecast.attainment",
                      { ns: "starter" },
                      "{{value}}% of target"
                    ).replace("{{value}}", String(attainment))}
                  </p>
                </div>
              </div>

              {/* Stacked commit bar */}
              <div className="mt-5 space-y-2">
                <div className="flex h-3 w-full overflow-hidden rounded-full bg-muted">
                  {(
                    [
                      ["closed", buckets.closed, chart.palette[2]],
                      ["commit", buckets.commit, chart.palette[0]],
                      ["bestCase", buckets.bestCase, chart.palette[1]],
                      ["pipeline", buckets.pipeline, chart.palette[3]],
                    ] as const
                  ).map(([key, value, color]) => (
                    <div
                      key={key}
                      style={{
                        width: `${
                          effectiveQuota > 0
                            ? Math.min(100, (value / effectiveQuota) * 100)
                            : 0
                        }%`,
                        backgroundColor: color,
                      }}
                    />
                  ))}
                </div>
                <div className="flex flex-wrap gap-4">
                  {(
                    [
                      ["closed", buckets.closed, chart.palette[2], "Closed won"],
                      ["commit", buckets.commit, chart.palette[0], "Commit"],
                      ["bestCase", buckets.bestCase, chart.palette[1], "Best case"],
                      ["pipeline", buckets.pipeline, chart.palette[3], "Pipeline"],
                    ] as const
                  ).map(([key, value, color, fallback]) => (
                    <div key={key} className="flex items-center gap-1.5">
                      <span
                        className="size-2 rounded-full"
                        style={{ backgroundColor: color }}
                      />
                      <span className="text-xs text-muted-foreground">
                        {translate(
                          `sales.forecast.category.${key}`,
                          { ns: "starter" },
                          fallback
                        )}
                      </span>
                      <span className="text-xs font-medium tabular-nums">
                        {formatCurrencyCompact(value, locale)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 gap-4 xl:grid-cols-5">
            <Card className="xl:col-span-3">
              <CardContent className="pt-6">
                <h3 className="mb-2 text-sm font-medium">
                  {translate(
                    "sales.forecast.monthly.title",
                    { ns: "starter" },
                    "Forecast by close month"
                  )}
                </h3>
                <ReactECharts
                  key={`monthly-${chart.isDark}`}
                  option={monthlyOption}
                  style={{ height: 260 }}
                  opts={{ renderer: "svg" }}
                />
              </CardContent>
            </Card>
            <Card className="xl:col-span-2">
              <CardContent className="pt-6">
                <h3 className="mb-2 text-sm font-medium">
                  {translate(
                    "sales.forecast.funnel.title",
                    { ns: "starter" },
                    "Conversion funnel"
                  )}
                </h3>
                <ReactECharts
                  key={`funnel-${chart.isDark}`}
                  option={funnelOption}
                  style={{ height: 260 }}
                  opts={{ renderer: "svg" }}
                />
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardContent className="pt-6">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-sm font-medium">
                  {translate(
                    "sales.forecast.breakdown.title",
                    { ns: "starter" },
                    "Breakdown"
                  )}
                </h3>
                <div className="flex items-center gap-1">
                  {(
                    [
                      ["owner", "By owner"],
                      ["stage", "By stage"],
                      ["month", "By month"],
                    ] as const
                  ).map(([key, fallback]) => (
                    <Button
                      key={key}
                      variant={groupBy === key ? "secondary" : "ghost"}
                      size="sm"
                      onClick={() => setGroupBy(key)}
                    >
                      {translate(
                        `sales.forecast.groupBy.${key}`,
                        { ns: "starter" },
                        fallback
                      )}
                    </Button>
                  ))}
                </div>
              </div>

              <SimpleTable
                headers={[
                  "#",
                  translate("sales.forecast.breakdown.group", { ns: "starter" }, "Group"),
                  translate("sales.forecast.category.closed", { ns: "starter" }, "Closed won"),
                  translate("sales.forecast.category.commit", { ns: "starter" }, "Commit"),
                  translate("sales.forecast.series.weighted", { ns: "starter" }, "Weighted open"),
                  translate("sales.forecast.leaderboard.winRate", { ns: "starter" }, "Win rate"),
                  translate("sales.forecast.leaderboard.deals", { ns: "starter" }, "Deals"),
                ]}
              >
                {rows.length === 0 ? (
                  <EmptyRow
                    colSpan={7}
                    text={translate(
                      "sales.forecast.breakdown.empty",
                      { ns: "starter" },
                      "No deals close in this period."
                    )}
                  />
                ) : (
                  rows.map((row, index) => (
                    <tr key={row.key}>
                      <td className="px-3 py-2 text-muted-foreground">
                        {groupBy === "owner" && index < 3 ? (
                          <Medal
                            className={cn(
                              "size-4",
                              index === 0 && "text-amber-500",
                              index === 1 && "text-slate-400",
                              index === 2 && "text-orange-700"
                            )}
                          />
                        ) : (
                          index + 1
                        )}
                      </td>
                      <td className="px-3 py-2 font-medium">
                        <div className="flex flex-col gap-1">
                          {row.href ? (
                            <Link
                              to={row.href}
                              className="text-primary underline-offset-2 hover:underline"
                            >
                              {row.label}
                            </Link>
                          ) : (
                            <span>{row.label}</span>
                          )}
                          <div className="h-1.5 w-full max-w-32 overflow-hidden rounded-full bg-muted">
                            <div
                              className="h-full rounded-full"
                              style={{
                                width: `${Math.max(
                                  4,
                                  Math.round(
                                    ((row.closed + row.weighted) / maxRow) * 100
                                  )
                                )}%`,
                                backgroundColor: chart.palette[0],
                              }}
                            />
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-2 tabular-nums">
                        {formatCurrencyCompact(row.closed, locale)}
                      </td>
                      <td className="px-3 py-2 tabular-nums">
                        {formatCurrencyCompact(row.commit, locale)}
                      </td>
                      <td className="px-3 py-2 tabular-nums">
                        {formatCurrencyCompact(row.weighted, locale)}
                      </td>
                      <td className="px-3 py-2 tabular-nums">
                        {row.decided === 0
                          ? "—"
                          : `${Math.round((row.wonCount / row.decided) * 100)}%`}
                      </td>
                      <td className="px-3 py-2 tabular-nums">{row.count}</td>
                    </tr>
                  ))
                )}
              </SimpleTable>
            </CardContent>
          </Card>
        </>
      )}
    </ListView>
  );
}

function QuotaEditor({
  quota,
  isCustom,
  onChange,
}: {
  quota: number;
  isCustom: boolean;
  onChange: (value: number | null) => void;
}) {
  const translate = useTranslate();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(String(quota));

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) setDraft(String(quota));
      }}
    >
      <PopoverTrigger render={<Button variant="outline" size="sm" />}>
        <Target />
        {translate("sales.forecast.setTarget", { ns: "starter" }, "Target")}
        <Pencil />
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 space-y-2">
        <p className="text-xs text-muted-foreground">
          {translate(
            "sales.forecast.targetHint",
            { ns: "starter" },
            "There is no quota field on the backend yet, so the target is stored in this browser."
          )}
        </p>
        <Input
          type="number"
          min={0}
          step={10000}
          value={draft}
          onChange={(event) => setDraft(event.currentTarget.value)}
        />
        <div className="flex justify-between gap-2">
          <Button
            variant="ghost"
            size="sm"
            disabled={!isCustom}
            onClick={() => {
              onChange(null);
              setOpen(false);
            }}
          >
            {translate("sales.forecast.targetReset", { ns: "starter" }, "Reset")}
          </Button>
          <Button
            size="sm"
            onClick={() => {
              const parsed = Number(draft);
              onChange(Number.isFinite(parsed) && parsed > 0 ? parsed : null);
              setOpen(false);
            }}
          >
            {translate("sales.toolbar.views.saveAction", { ns: "starter" }, "Save")}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
