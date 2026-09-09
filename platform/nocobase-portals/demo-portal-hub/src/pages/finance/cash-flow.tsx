import { useList, useTranslate } from "@refinedev/core";
import ReactECharts from "echarts-for-react";
import {
  ArrowDownRight,
  ArrowUpRight,
  Download,
  Scale,
  TrendingUp,
} from "lucide-react";
import { useMemo, useState } from "react";

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
import { AsyncPanel, exportCsv, KpiStrip, type KpiTile } from "@/lib/table-kit";
import { money, PageHeader } from "./shared";
import type { Expense, Invoice } from "./types";
import { invoiceAmount, useInvoiceAmounts } from "./invoice-metrics";

const MONTH_KEYS = [
  "jan", "feb", "mar", "apr", "may", "jun",
  "jul", "aug", "sep", "oct", "nov", "dec",
] as const;

const CASH_FLOW_WINDOWS = [
  { count: 6, i18nKey: "finance.cashflow.window.6", label: "6 months" },
  { count: 12, i18nKey: "finance.cashflow.window.12", label: "12 months" },
  { count: 24, i18nKey: "finance.cashflow.window.24", label: "24 months" },
] as const;

type CashFlowWindow = (typeof CASH_FLOW_WINDOWS)[number]["count"];

function lastMonths(count: number) {
  const out: { key: string; year: number; monthIndex: number }[] = [];
  const now = new Date();
  for (let index = count - 1; index >= 0; index--) {
    const date = new Date(now.getFullYear(), now.getMonth() - index, 1);
    out.push({
      key: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`,
      year: date.getFullYear(),
      monthIndex: date.getMonth(),
    });
  }
  return out;
}

function monthKey(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const date = new Date(`${iso.slice(0, 10)}T00:00:00`);
  if (Number.isNaN(date.getTime())) return null;
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

export function CashFlow() {
  const t = useTranslate();
  const chart = useChartTheme();
  const [windowMonths, setWindowMonths] = useState<CashFlowWindow>(6);
  const invoiceAmounts = useInvoiceAmounts();

  const { result: invResult } = useList<Invoice>({
    resource: "hub_fin_invoices",
    pagination: { mode: "off" },
  });
  const { result: expResult } = useList<Expense>({
    resource: "hub_fin_expenses",
    pagination: { mode: "off" },
  });
  const invoices = invResult?.data ?? [];
  const expenses = expResult?.data ?? [];

  const months = useMemo(() => lastMonths(windowMonths), [windowMonths]);
  const monthLabels = useMemo(
    () =>
      months.map((month) =>
        t("finance.monthYear", "{{month}} {{year}}")
          .replace(
            "{{month}}",
            t(
              `finance.months.${MONTH_KEYS[month.monthIndex]}`,
              MONTH_KEYS[month.monthIndex].replace(/^\w/, (character) => character.toUpperCase())
            )
          )
          .replace("{{year}}", String(month.year))
      ),
    [months, t]
  );

  const series = useMemo(() => {
    const inflow = new Map<string, number>();
    for (const invoice of invoices) {
      if (invoice.status !== "paid") continue;
      const key = monthKey(invoice.issue_date);
      if (!key) continue;
      inflow.set(
        key,
        (inflow.get(key) ?? 0) + invoiceAmount(invoice, invoiceAmounts.byInvoice)
      );
    }
    const outflow = new Map<string, number>();
    for (const expense of expenses) {
      if (expense.status !== "approved" && expense.status !== "reimbursed") continue;
      const key = monthKey(expense.spent_at);
      if (!key) continue;
      outflow.set(key, (outflow.get(key) ?? 0) + (Number(expense.amount) || 0));
    }
    const inflowSeries = months.map((month) => Math.round(inflow.get(month.key) ?? 0));
    const outflowSeries = months.map((month) => Math.round(outflow.get(month.key) ?? 0));
    const netSeries = months.map((_, index) => inflowSeries[index] - outflowSeries[index]);
    return { inflowSeries, outflowSeries, netSeries };
  }, [expenses, invoiceAmounts.byInvoice, invoices, months]);

  const monthlyRows = useMemo(() => {
    let cumulative = 0;
    return months.map((month, index) => {
      const net = series.netSeries[index];
      cumulative += net;
      return {
        key: month.key,
        month: monthLabels[index],
        inflow: series.inflowSeries[index],
        outflow: series.outflowSeries[index],
        net,
        cumulative,
      };
    });
  }, [monthLabels, months, series]);

  const kpis = useMemo(() => {
    const inflow = series.inflowSeries.reduce((sum, value) => sum + value, 0);
    const outflow = series.outflowSeries.reduce((sum, value) => sum + value, 0);
    const bestMonth = monthlyRows.reduce(
      (best, row) => (row.net > best.net ? row : best),
      monthlyRows[0]
    );
    return { inflow, outflow, net: inflow - outflow, bestMonth };
  }, [monthlyRows, series]);

  const kpiTiles = useMemo<KpiTile[]>(
    () => [
      {
        key: "inflow",
        label: t("finance.cashflow.kpi.totalInflow", "Total inflow"),
        value: money(kpis.inflow),
        icon: ArrowUpRight,
        tone: "bg-emerald-500/12 text-emerald-600 dark:text-emerald-400",
      },
      {
        key: "outflow",
        label: t("finance.cashflow.kpi.totalOutflow", "Total outflow"),
        value: money(kpis.outflow),
        icon: ArrowDownRight,
        tone: "bg-red-500/12 text-red-600 dark:text-red-400",
      },
      {
        key: "net",
        label: t("finance.cashflow.kpi.netCashFlow", "Net cash flow"),
        value: money(kpis.net),
        icon: Scale,
        tone:
          kpis.net > 0
            ? "bg-emerald-500/12 text-emerald-600 dark:text-emerald-400"
            : kpis.net < 0
              ? "bg-red-500/12 text-red-600 dark:text-red-400"
              : "bg-blue-500/12 text-blue-600 dark:text-blue-400",
      },
      {
        key: "best-month",
        label: t("finance.cashflow.kpi.bestMonth", "Best month"),
        value: money(kpis.bestMonth?.net ?? 0),
        hint: kpis.bestMonth?.month,
        icon: TrendingUp,
        tone: "bg-blue-500/12 text-blue-600 dark:text-blue-400",
      },
    ],
    [kpis, t]
  );

  const inflowLabel = t("finance.cashflow.series.inflow", "Inflow");
  const outflowLabel = t("finance.cashflow.series.outflow", "Outflow");
  const netLabel = t("finance.cashflow.series.net", "Net");

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
    padding: [8, 12] as [number, number],
  };

  const option = {
    color: [chart.palette[0], chart.palette[5] ?? chart.palette[1], chart.palette[2]],
    grid: { left: 6, right: 12, top: 40, bottom: 8, containLabel: true },
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
      axisPointer: { type: "shadow" },
      ...tooltipBase,
      valueFormatter: (value: number) => money(value),
    },
    xAxis: { type: "category", data: monthLabels, ...axisBase },
    yAxis: {
      type: "value",
      ...axisBase,
      axisLine: { show: false },
      splitLine: { lineStyle: { color: chart.grid } },
      axisLabel: {
        color: chart.axis,
        fontSize: 12,
        formatter: (value: number) => `$${value / 1000}k`,
      },
    },
    series: [
      {
        name: inflowLabel,
        type: "bar",
        data: series.inflowSeries,
        barWidth: 18,
        itemStyle: { borderRadius: [4, 4, 0, 0] },
      },
      {
        name: outflowLabel,
        type: "bar",
        data: series.outflowSeries,
        barWidth: 18,
        itemStyle: { borderRadius: [4, 4, 0, 0] },
      },
      {
        name: netLabel,
        type: "line",
        yAxisIndex: 0,
        smooth: true,
        symbol: "circle",
        symbolSize: 6,
        lineStyle: { width: 3 },
        data: series.netSeries,
      },
    ],
  };

  if (invoiceAmounts.isLoading || invoiceAmounts.isError) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader
          title={t("finance.cashflow.title", "Cash flow")}
          description={t(
            "finance.cashflow.subtitle",
            "Cash moving in and out over time."
          )}
        />
        <AsyncPanel
          i18nPrefix="finance.ops"
          isLoading={invoiceAmounts.isLoading}
          isError={invoiceAmounts.isError}
          onRetry={() => void invoiceAmounts.refetch()}
        >
          <span />
        </AsyncPanel>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t("finance.cashflow.title", "Cash flow")}
        description={t(
          "finance.cashflow.subtitle",
          "Monthly cash in versus cash out over the selected window."
        )}
        actions={
          <div className="flex flex-wrap items-center gap-1.5">
            {CASH_FLOW_WINDOWS.map((windowOption) => (
              <button
                key={windowOption.count}
                type="button"
                onClick={() => setWindowMonths(windowOption.count)}
                className={cn(
                  "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                  windowMonths === windowOption.count
                    ? "border-primary/40 bg-primary/10 text-primary"
                    : "border-border/70 text-muted-foreground hover:bg-muted"
                )}
              >
                {t(windowOption.i18nKey, windowOption.label)}
              </button>
            ))}
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                exportCsv(
                  "finance-cash-flow",
                  [
                    {
                      header: t("finance.cashflow.table.month", "Month"),
                      value: (row: (typeof monthlyRows)[number]) => row.month,
                    },
                    {
                      header: t("finance.cashflow.table.inflow", "Inflow"),
                      value: (row) => row.inflow,
                    },
                    {
                      header: t("finance.cashflow.table.outflow", "Outflow"),
                      value: (row) => row.outflow,
                    },
                    {
                      header: t("finance.cashflow.table.net", "Net"),
                      value: (row) => row.net,
                    },
                    {
                      header: t("finance.cashflow.table.cumulative", "Cumulative"),
                      value: (row) => row.cumulative,
                    },
                  ],
                  monthlyRows
                )
              }
            >
              <Download className="size-3.5" />
              {t("finance.cashflow.export", "Export CSV")}
            </Button>
          </div>
        }
      />

      <KpiStrip tiles={kpiTiles} />

      <Card>
        <CardHeader>
          <CardTitle>{t("finance.cashflow.chart.title", "Inflow vs outflow")}</CardTitle>
          <CardDescription>
            {t(
              "finance.cashflow.chart.desc",
              "Paid invoices by issue date against approved/reimbursed expense spend by spend date, with net cash flow."
            )}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ReactECharts
            key={`cashflow-${chart.isDark}-${windowMonths}`}
            option={option}
            style={{ height: 320 }}
            opts={{ renderer: "svg" }}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("finance.cashflow.runway.title", "Runway signal")}</CardTitle>
          <CardDescription>
            {t(
              "finance.cashflow.runway.desc",
              "Monthly net movement and its cumulative effect across the selected window."
            )}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full min-w-max text-sm">
              <thead>
                <tr className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
                  <th className="px-3 py-2 font-medium">
                    {t("finance.cashflow.table.month", "Month")}
                  </th>
                  <th className="px-3 py-2 text-right font-medium">
                    {t("finance.cashflow.table.inflow", "Inflow")}
                  </th>
                  <th className="px-3 py-2 text-right font-medium">
                    {t("finance.cashflow.table.outflow", "Outflow")}
                  </th>
                  <th className="px-3 py-2 text-right font-medium">
                    {t("finance.cashflow.table.net", "Net")}
                  </th>
                  <th className="px-3 py-2 text-right font-medium">
                    {t("finance.cashflow.table.cumulative", "Cumulative")}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {monthlyRows.map((row) => (
                  <tr key={row.key} className="hover:bg-accent">
                    <td className="px-3 py-2 font-medium whitespace-nowrap">{row.month}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{money(row.inflow)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{money(row.outflow)}</td>
                    <td
                      className={cn(
                        "px-3 py-2 text-right tabular-nums",
                        row.net < 0 && "text-red-600 dark:text-red-400"
                      )}
                    >
                      {money(row.net)}
                    </td>
                    <td
                      className={cn(
                        "px-3 py-2 text-right font-medium tabular-nums",
                        row.cumulative < 0 && "text-red-600 dark:text-red-400"
                      )}
                    >
                      {money(row.cumulative)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
