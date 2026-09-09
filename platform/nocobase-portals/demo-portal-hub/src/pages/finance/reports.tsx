import { useList, useTranslate } from "@refinedev/core";
import ReactECharts from "echarts-for-react";
import {
  CircleDollarSign,
  Download,
  Percent,
  Scale,
  WalletCards,
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
import { money, PageHeader, SimpleTable } from "./shared";
import type { Expense, Invoice } from "./types";
import { invoiceAmount, useInvoiceAmounts } from "./invoice-metrics";

const MONTH_KEYS = [
  "jan", "feb", "mar", "apr", "may", "jun",
  "jul", "aug", "sep", "oct", "nov", "dec",
] as const;

const REPORT_WINDOWS = [
  { value: "quarter", i18nKey: "finance.reports.window.quarter", label: "This quarter" },
  { value: "year", i18nKey: "finance.reports.window.year", label: "This year" },
  { value: "all", i18nKey: "finance.reports.window.all", label: "All time" },
] as const;

type ReportWindow = (typeof REPORT_WINDOWS)[number]["value"];
type ReportMonth = { key: string; year: number; monthIndex: number };

function employeeName(exp: Expense): string {
  return exp.employee?.nickname || exp.employee?.username || exp.employee?.email || "—";
}

function dateValue(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const value = new Date(`${iso.slice(0, 10)}T00:00:00`).getTime();
  return Number.isNaN(value) ? null : value;
}

function monthKey(iso: string | null | undefined): string | null {
  const value = dateValue(iso);
  if (value === null) return null;
  const date = new Date(value);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function monthsBetween(start: Date, end: Date): ReportMonth[] {
  const months: ReportMonth[] = [];
  const cursor = new Date(start.getFullYear(), start.getMonth(), 1);
  const last = new Date(end.getFullYear(), end.getMonth(), 1);
  while (cursor <= last) {
    months.push({
      key: `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}`,
      year: cursor.getFullYear(),
      monthIndex: cursor.getMonth(),
    });
    cursor.setMonth(cursor.getMonth() + 1);
  }
  return months;
}

export function FinanceReports() {
  const t = useTranslate();
  const chart = useChartTheme();
  const [reportWindow, setReportWindow] = useState<ReportWindow>("year");
  const invoiceAmounts = useInvoiceAmounts();

  const { result: invResult } = useList<Invoice>({
    resource: "hub_fin_invoices",
    pagination: { mode: "off" },
  });
  const { result: expResult } = useList<Expense>({
    resource: "hub_fin_expenses",
    pagination: { mode: "off" },
    meta: { appends: ["employee"] },
  });
  const invoices = invResult?.data ?? [];
  const expenses = expResult?.data ?? [];

  const range = useMemo(() => {
    if (reportWindow === "all") return null;
    const now = new Date();
    if (reportWindow === "quarter") {
      const startMonth = Math.floor(now.getMonth() / 3) * 3;
      return {
        start: new Date(now.getFullYear(), startMonth, 1),
        end: new Date(now.getFullYear(), startMonth + 3, 0, 23, 59, 59, 999),
      };
    }
    return {
      start: new Date(now.getFullYear(), 0, 1),
      end: new Date(now.getFullYear(), 11, 31, 23, 59, 59, 999),
    };
  }, [reportWindow]);

  const filteredInvoices = useMemo(
    () =>
      range
        ? invoices.filter((invoice) => {
            const value = dateValue(invoice.issue_date);
            return value !== null && value >= range.start.getTime() && value <= range.end.getTime();
          })
        : invoices,
    [invoices, range]
  );
  const filteredExpenses = useMemo(
    () =>
      range
        ? expenses.filter((expense) => {
            const value = dateValue(expense.spent_at);
            return value !== null && value >= range.start.getTime() && value <= range.end.getTime();
          })
        : expenses,
    [expenses, range]
  );

  const months = useMemo(() => {
    if (range) return monthsBetween(range.start, range.end);
    const keys = [
      ...filteredInvoices.map((invoice) => monthKey(invoice.issue_date)),
      ...filteredExpenses.map((expense) => monthKey(expense.spent_at)),
    ].filter((key): key is string => key !== null);
    if (keys.length === 0) {
      const now = new Date();
      return monthsBetween(now, now);
    }
    keys.sort();
    const [startYear, startMonth] = keys[0].split("-").map(Number);
    const [endYear, endMonth] = keys[keys.length - 1].split("-").map(Number);
    return monthsBetween(
      new Date(startYear, startMonth - 1, 1),
      new Date(endYear, endMonth - 1, 1)
    );
  }, [filteredExpenses, filteredInvoices, range]);

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

  const monthlyRows = useMemo(() => {
    const revenue = new Map<string, number>();
    const spend = new Map<string, number>();
    for (const invoice of filteredInvoices) {
      if (invoice.status !== "paid") continue;
      const key = monthKey(invoice.issue_date);
      if (key) {
        revenue.set(
          key,
          (revenue.get(key) ?? 0) + invoiceAmount(invoice, invoiceAmounts.byInvoice)
        );
      }
    }
    for (const expense of filteredExpenses) {
      if (expense.status !== "approved" && expense.status !== "reimbursed") continue;
      const key = monthKey(expense.spent_at);
      if (key) spend.set(key, (spend.get(key) ?? 0) + (Number(expense.amount) || 0));
    }
    return months.map((month, index) => {
      const monthRevenue = Math.round(revenue.get(month.key) ?? 0);
      const monthSpend = Math.round(spend.get(month.key) ?? 0);
      return {
        month: monthLabels[index],
        revenue: monthRevenue,
        spend: monthSpend,
        net: monthRevenue - monthSpend,
      };
    });
  }, [filteredExpenses, filteredInvoices, invoiceAmounts.byInvoice, monthLabels, months]);

  const reportKpis = useMemo(() => {
    const revenue = monthlyRows.reduce((sum, row) => sum + row.revenue, 0);
    const spend = monthlyRows.reduce((sum, row) => sum + row.spend, 0);
    const issued = filteredInvoices.reduce(
      (sum, invoice) => sum + invoiceAmount(invoice, invoiceAmounts.byInvoice),
      0
    );
    return {
      revenue,
      spend,
      net: revenue - spend,
      collectionRate: issued > 0 ? (revenue / issued) * 100 : 0,
    };
  }, [filteredInvoices, invoiceAmounts.byInvoice, monthlyRows]);

  const kpiTiles = useMemo<KpiTile[]>(
    () => [
      {
        key: "revenue",
        label: t("finance.reports.kpi.revenue", "Revenue collected"),
        value: money(reportKpis.revenue),
        icon: CircleDollarSign,
        tone: "bg-emerald-500/12 text-emerald-600 dark:text-emerald-400",
      },
      {
        key: "spend",
        label: t("finance.reports.kpi.spend", "Operating spend"),
        value: money(reportKpis.spend),
        icon: WalletCards,
        tone: "bg-amber-500/12 text-amber-600 dark:text-amber-400",
      },
      {
        key: "net",
        label: t("finance.reports.kpi.net", "Net position"),
        value: money(reportKpis.net),
        icon: Scale,
        tone:
          reportKpis.net > 0
            ? "bg-emerald-500/12 text-emerald-600 dark:text-emerald-400"
            : reportKpis.net < 0
              ? "bg-red-500/12 text-red-600 dark:text-red-400"
              : "bg-blue-500/12 text-blue-600 dark:text-blue-400",
      },
      {
        key: "collection-rate",
        label: t("finance.reports.kpi.collectionRate", "Collection rate"),
        value: `${reportKpis.collectionRate.toFixed(1)}%`,
        icon: Percent,
        tone: "bg-blue-500/12 text-blue-600 dark:text-blue-400",
      },
    ],
    [reportKpis, t]
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
    padding: [8, 12] as [number, number],
  };

  const revenueLabel = t("finance.reports.series.revenue", "Revenue");
  const spendLabel = t("finance.reports.series.spend", "Spend");
  const netLabel = t("finance.reports.series.net", "Net");
  const revenueOption = {
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
        name: revenueLabel,
        type: "bar",
        data: monthlyRows.map((row) => row.revenue),
        barWidth: 18,
        itemStyle: { borderRadius: [4, 4, 0, 0] },
      },
      {
        name: spendLabel,
        type: "bar",
        data: monthlyRows.map((row) => row.spend),
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
        data: monthlyRows.map((row) => row.net),
      },
    ],
  };

  const byEmployee = useMemo(() => {
    const totals = new Map<string, number>();
    for (const exp of filteredExpenses) {
      if (exp.status === "rejected") continue;
      const name = employeeName(exp);
      totals.set(name, (totals.get(name) ?? 0) + (Number(exp.amount) || 0));
    }
    return [...totals.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([name, amount]) => ({ name, amount: Math.round(amount) }));
  }, [filteredExpenses]);

  const employeeOption = {
    color: [chart.palette[2]],
    grid: { left: 6, right: 24, top: 8, bottom: 8, containLabel: true },
    tooltip: { trigger: "axis", ...tooltipBase, valueFormatter: (value: number) => money(value) },
    xAxis: {
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
    yAxis: {
      type: "category",
      data: byEmployee.map((employee) => employee.name).reverse(),
      ...axisBase,
    },
    series: [
      {
        type: "bar",
        data: byEmployee.map((employee) => employee.amount).reverse(),
        barWidth: 16,
        itemStyle: { borderRadius: [0, 4, 4, 0] },
      },
    ],
  };

  const byClient = useMemo(() => {
    const rows = new Map<string, { invoiced: number; collected: number; count: number }>();
    for (const inv of filteredInvoices) {
      const key = inv.client_name || "—";
      const row = rows.get(key) ?? { invoiced: 0, collected: 0, count: 0 };
      const amount = invoiceAmount(inv, invoiceAmounts.byInvoice);
      row.invoiced += amount;
      if (inv.status === "paid") row.collected += amount;
      row.count += 1;
      rows.set(key, row);
    }
    return [...rows.entries()]
      .map(([client, value]) => ({
        client,
        ...value,
        rate: value.invoiced > 0 ? Math.round((value.collected / value.invoiced) * 100) : 0,
      }))
      .sort((a, b) => b.invoiced - a.invoiced);
  }, [filteredInvoices, invoiceAmounts.byInvoice]);

  if (invoiceAmounts.isLoading || invoiceAmounts.isError) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader
          title={t("finance.reports.title", "Finance reports")}
          description={t(
            "finance.reports.subtitle",
            "Revenue, spend and reimbursement analysis."
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
        title={t("finance.reports.title", "Reports")}
        description={t(
          "finance.reports.subtitle",
          "Profit and loss performance, spend concentration and client collection."
        )}
        actions={
          <div className="flex flex-wrap items-center gap-1.5">
            {REPORT_WINDOWS.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => setReportWindow(option.value)}
                className={cn(
                  "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                  reportWindow === option.value
                    ? "border-primary/40 bg-primary/10 text-primary"
                    : "border-border/70 text-muted-foreground hover:bg-muted"
                )}
              >
                {t(option.i18nKey, option.label)}
              </button>
            ))}
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                exportCsv(
                  "finance-revenue-vs-spend",
                  [
                    {
                      header: t("finance.reports.csv.month", "Month"),
                      value: (row: (typeof monthlyRows)[number]) => row.month,
                    },
                    {
                      header: t("finance.reports.csv.revenue", "Revenue"),
                      value: (row) => row.revenue,
                    },
                    {
                      header: t("finance.reports.csv.spend", "Spend"),
                      value: (row) => row.spend,
                    },
                    {
                      header: t("finance.reports.csv.net", "Net"),
                      value: (row) => row.net,
                    },
                  ],
                  monthlyRows
                )
              }
            >
              <Download className="size-3.5" />
              {t("finance.reports.export", "Export CSV")}
            </Button>
          </div>
        }
      />

      <KpiStrip tiles={kpiTiles} />

      <Card>
        <CardHeader>
          <CardTitle>{t("finance.reports.chart.title", "Revenue vs spend")}</CardTitle>
          <CardDescription>
            {t(
              "finance.reports.chart.desc",
              "Collected revenue and operating spend by month, with net position."
            )}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ReactECharts
            key={`revenue-spend-${chart.isDark}`}
            option={revenueOption}
            style={{ height: 320 }}
            opts={{ renderer: "svg" }}
          />
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>{t("finance.reports.employee.title", "Top spenders")}</CardTitle>
            <CardDescription>
              {t("finance.reports.employee.desc", "Approved + reimbursed spend by employee.")}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {byEmployee.length === 0 ? (
              <p className="py-10 text-center text-sm text-muted-foreground">
                {t("finance.reports.employee.empty", "No expense claims yet.")}
              </p>
            ) : (
              <ReactECharts
                key={`emp-${chart.isDark}`}
                option={employeeOption}
                style={{ height: Math.max(220, byEmployee.length * 34) }}
                opts={{ renderer: "svg" }}
              />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t("finance.reports.client.title", "Client collection")}</CardTitle>
            <CardDescription>
              {t("finance.reports.client.desc", "Invoiced vs. collected by client.")}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <SimpleTable
              headers={[
                t("finance.reports.client.col.client", "Client"),
                t("finance.reports.client.col.invoiced", "Invoiced"),
                t("finance.reports.client.col.rate", "Collected"),
              ]}
              align={["left", "right", "right"]}
            >
              {byClient.map((row) => (
                <tr key={row.client}>
                  <td className="px-3 py-2 font-medium">{row.client}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{money(row.invoiced)}</td>
                  <td className="px-3 py-2 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <div className="h-1.5 w-16 overflow-hidden rounded-full bg-muted">
                        <div
                          className={cn(
                            "h-full rounded-full",
                            row.rate >= 80
                              ? "bg-emerald-500"
                              : row.rate >= 40
                                ? "bg-blue-500"
                                : "bg-amber-500"
                          )}
                          style={{ width: `${Math.min(100, row.rate)}%` }}
                        />
                      </div>
                      <span className="w-9 tabular-nums text-xs text-muted-foreground">
                        {row.rate}%
                      </span>
                    </div>
                  </td>
                </tr>
              ))}
            </SimpleTable>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
