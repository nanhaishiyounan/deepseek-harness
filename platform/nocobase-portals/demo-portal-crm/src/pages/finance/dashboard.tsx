import { useList, useTranslate } from "@refinedev/core";
import ReactECharts from "echarts-for-react";
import { AlertTriangle, DollarSign, Receipt, Wallet } from "lucide-react";
import { useMemo } from "react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useChartTheme } from "@/pages/home/theme";
import { EXPENSE_CATEGORIES, INVOICE_STATUSES, optionLabel } from "./constants";
import { money, PageHeader, StatCard } from "./shared";
import type { Expense, Invoice } from "./types";
import {
  invoiceAmount,
  invoiceDisplayStatus,
  isInvoiceOverdue,
  useInvoiceAmounts,
} from "./invoice-metrics";
import { AsyncPanel } from "@/lib/table-kit";

function hexA(hex: string, alpha: number): string {
  const a = Math.round(Math.max(0, Math.min(1, alpha)) * 255)
    .toString(16)
    .padStart(2, "0");
  return `${hex}${a}`;
}

const MONTH_KEYS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

/** Last six calendar months as [{ key: "2026-03", monthIndex: 2 }]. */
function lastSixMonths() {
  const out: { key: string; monthIndex: number }[] = [];
  const now = new Date();
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    out.push({
      key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`,
      monthIndex: d.getMonth(),
    });
  }
  return out;
}

function monthKey(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function FinanceDashboard() {
  const t = useTranslate();
  const chart = useChartTheme();
  const invoiceAmounts = useInvoiceAmounts();

  const { result: expResult } = useList<Expense>({
    resource: "hub_fin_expenses",
    pagination: { mode: "off" },
  });
  const { result: invResult } = useList<Invoice>({
    resource: "hub_fin_invoices",
    pagination: { mode: "off" },
  });
  const expenses = expResult?.data ?? [];
  const invoices = invResult?.data ?? [];

  // ---- KPIs ----------------------------------------------------------------
  const kpis = useMemo(() => {
    let outstanding = 0;
    let overdue = 0;
    let collected = 0;
    for (const inv of invoices) {
      const amt = invoiceAmount(inv, invoiceAmounts.byInvoice);
      if (inv.status === "paid") collected += amt;
      else outstanding += amt;
      if (isInvoiceOverdue(inv)) overdue += amt;
    }
    const pendingExpenses = expenses.filter((e) => e.status === "pending");
    const pendingAmount = pendingExpenses.reduce(
      (sum, e) => sum + (Number(e.amount) || 0),
      0
    );
    return {
      outstanding,
      overdue,
      collected,
      pendingCount: pendingExpenses.length,
      pendingAmount,
    };
  }, [invoiceAmounts.byInvoice, invoices, expenses]);

  // ---- Spend by category (bar) --------------------------------------------
  const spendByCategory = useMemo(() => {
    const totals = new Map<string, number>();
    for (const exp of expenses) {
      if (exp.status === "rejected") continue;
      const key = exp.category || "other";
      totals.set(key, (totals.get(key) ?? 0) + (Number(exp.amount) || 0));
    }
    return EXPENSE_CATEGORIES.map((c) => ({
      label: optionLabel(c, t),
      value: Math.round(totals.get(c.value) ?? 0),
    }));
  }, [expenses, t]);

  // ---- AR by status (donut) -----------------------------------------------
  const arByStatus = useMemo(() => {
    const totals = new Map<string, number>();
    for (const inv of invoices) {
      const key = invoiceDisplayStatus(inv) || "draft";
      totals.set(key, (totals.get(key) ?? 0) + invoiceAmount(inv, invoiceAmounts.byInvoice));
    }
    return INVOICE_STATUSES.filter((s) => (totals.get(s.value) ?? 0) > 0).map(
      (s) => ({ name: optionLabel(s, t), value: Math.round(totals.get(s.value) ?? 0) })
    );
  }, [invoiceAmounts.byInvoice, invoices, t]);

  // ---- Monthly trend: invoiced vs collected (line) ------------------------
  const trend = useMemo(() => {
    const months = lastSixMonths();
    const invoiced = new Map<string, number>();
    const collected = new Map<string, number>();
    for (const inv of invoices) {
      const amt = invoiceAmount(inv, invoiceAmounts.byInvoice);
      const issued = monthKey(inv.issue_date);
      if (issued) invoiced.set(issued, (invoiced.get(issued) ?? 0) + amt);
      if (inv.status === "paid" && issued) {
        collected.set(issued, (collected.get(issued) ?? 0) + amt);
      }
    }
    return {
      labels: months.map((m) =>
        t(`finance.months.${MONTH_KEYS[m.monthIndex]}`, MONTH_KEYS[m.monthIndex].replace(/^\w/, (c) => c.toUpperCase()))
      ),
      invoiced: months.map((m) => Math.round(invoiced.get(m.key) ?? 0)),
      collected: months.map((m) => Math.round(collected.get(m.key) ?? 0)),
    };
  }, [invoiceAmounts.byInvoice, invoices, t]);

  const invoicedLabel = t("finance.dashboard.series.invoiced", "Invoiced");
  const collectedLabel = t("finance.dashboard.series.collected", "Collected");

  // ---- ECharts option bases -----------------------------------------------
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

  const categoryOption = {
    color: [chart.palette[0]],
    grid: { left: 6, right: 12, top: 16, bottom: 8, containLabel: true },
    tooltip: {
      trigger: "axis",
      axisPointer: { type: "shadow" },
      ...tooltipBase,
      valueFormatter: (v: number) => money(v),
    },
    xAxis: {
      type: "category",
      data: spendByCategory.map((d) => d.label),
      ...axisBase,
    },
    yAxis: {
      type: "value",
      ...axisBase,
      axisLine: { show: false },
      splitLine: { lineStyle: { color: chart.grid } },
      axisLabel: {
        color: chart.axis,
        fontSize: 12,
        formatter: (v: number) => `$${v / 1000}k`,
      },
    },
    series: [
      {
        type: "bar",
        data: spendByCategory.map((d) => d.value),
        barWidth: 30,
        itemStyle: { borderRadius: [6, 6, 0, 0] },
      },
    ],
  };

  const arOption = {
    color: chart.palette,
    tooltip: {
      trigger: "item",
      ...tooltipBase,
      valueFormatter: (v: number) => money(v),
    },
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
        data: arByStatus,
      },
    ],
  };

  const trendOption = {
    color: [chart.palette[0], chart.palette[2]],
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
      ...tooltipBase,
      valueFormatter: (v: number) => money(v),
    },
    xAxis: {
      type: "category",
      boundaryGap: false,
      data: trend.labels,
      ...axisBase,
    },
    yAxis: {
      type: "value",
      ...axisBase,
      axisLine: { show: false },
      splitLine: { lineStyle: { color: chart.grid } },
      axisLabel: {
        color: chart.axis,
        fontSize: 12,
        formatter: (v: number) => `$${v / 1000}k`,
      },
    },
    series: [
      {
        name: invoicedLabel,
        type: "line",
        smooth: true,
        symbol: "circle",
        symbolSize: 6,
        showSymbol: false,
        data: trend.invoiced,
        lineStyle: { width: 3 },
        areaStyle: {
          color: {
            type: "linear",
            x: 0,
            y: 0,
            x2: 0,
            y2: 1,
            colorStops: [
              { offset: 0, color: hexA(chart.palette[0], 0.28) },
              { offset: 1, color: hexA(chart.palette[0], 0) },
            ],
          },
        },
      },
      {
        name: collectedLabel,
        type: "line",
        smooth: true,
        symbol: "circle",
        symbolSize: 6,
        showSymbol: false,
        data: trend.collected,
        lineStyle: { width: 3 },
        areaStyle: {
          color: {
            type: "linear",
            x: 0,
            y: 0,
            x2: 0,
            y2: 1,
            colorStops: [
              { offset: 0, color: hexA(chart.palette[2], 0.24) },
              { offset: 1, color: hexA(chart.palette[2], 0) },
            ],
          },
        },
      },
    ],
  };

  if (invoiceAmounts.isLoading || invoiceAmounts.isError) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader
          title={t("finance.dashboard.title", "Finance")}
          description={t(
            "finance.dashboard.subtitle",
            "Cash in, cash out — receivables and expense spend at a glance."
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
        title={t("finance.dashboard.title", "Finance")}
        description={t(
          "finance.dashboard.subtitle",
          "Cash in, cash out — receivables and expense spend at a glance."
        )}
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label={t("finance.dashboard.kpi.outstanding", "Outstanding AR")}
          value={money(kpis.outstanding)}
          hint={t("finance.dashboard.kpi.outstanding.hint", "Awaiting collection")}
          icon={<Wallet className="size-4" />}
          tone="bg-blue-500/12 text-blue-600 dark:text-blue-400"
        />
        <StatCard
          label={t("finance.dashboard.kpi.overdue", "Overdue")}
          value={money(kpis.overdue)}
          hint={t("finance.dashboard.kpi.overdue.hint", "Past due date")}
          icon={<AlertTriangle className="size-4" />}
          tone="bg-red-500/12 text-red-600 dark:text-red-400"
        />
        <StatCard
          label={t("finance.dashboard.kpi.collected", "Collected")}
          value={money(kpis.collected)}
          hint={t("finance.dashboard.kpi.collected.hint", "Paid invoices")}
          icon={<DollarSign className="size-4" />}
          tone="bg-emerald-500/12 text-emerald-600 dark:text-emerald-400"
        />
        <StatCard
          label={t("finance.dashboard.kpi.toApprove", "Expenses to approve")}
          value={String(kpis.pendingCount)}
          hint={t(
            "finance.dashboard.kpi.toApprove.hint",
            { ns: "starter", amount: money(kpis.pendingAmount) },
            `${money(kpis.pendingAmount)} pending`
          )}
          icon={<Receipt className="size-4" />}
          tone="bg-amber-500/12 text-amber-600 dark:text-amber-400"
        />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader>
            <CardTitle>{t("finance.dashboard.chart.spend.title", "Spend by category")}</CardTitle>
            <CardDescription>
              {t("finance.dashboard.chart.spend.desc", "Approved & pending expense spend.")}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ReactECharts
              key={`cat-${chart.isDark}`}
              option={categoryOption}
              style={{ height: 288 }}
              opts={{ renderer: "svg" }}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t("finance.dashboard.chart.ar.title", "AR by status")}</CardTitle>
            <CardDescription>
              {t("finance.dashboard.chart.ar.desc", "Receivable value per invoice state.")}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ReactECharts
              key={`ar-${chart.isDark}`}
              option={arOption}
              style={{ height: 288 }}
              opts={{ renderer: "svg" }}
            />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t("finance.dashboard.chart.trend.title", "Invoiced vs collected")}</CardTitle>
          <CardDescription>
            {t("finance.dashboard.chart.trend.desc", "Monthly trend over the last six months.")}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ReactECharts
            key={`trend-${chart.isDark}`}
            option={trendOption}
            style={{ height: 280 }}
            opts={{ renderer: "svg" }}
          />
        </CardContent>
      </Card>
    </div>
  );
}
