import { useList, useTranslate } from "@refinedev/core";
import ReactECharts from "echarts-for-react";
import { AlertTriangle, Gauge, PiggyBank, Wallet } from "lucide-react";
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
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { EXPENSE_CATEGORIES, optionLabel } from "./constants";
import { KpiStrip, type KpiTile } from "@/lib/table-kit";
import { money, PageHeader } from "./shared";
import type { Budget, Expense } from "./types";

export function BudgetVsActual() {
  const t = useTranslate();
  const chart = useChartTheme();

  const { result: budgetResult, query: budgetQuery } = useList<Budget>({
    resource: "hub_fin_budgets",
    pagination: { mode: "off" },
  });
  const { result: expResult } = useList<Expense>({
    resource: "hub_fin_expenses",
    pagination: { mode: "off" },
  });
  const budgets = budgetResult?.data ?? [];
  const expenses = expResult?.data ?? [];

  const rows = useMemo(() => {
    const budgetByCategory = new Map<string, number>();
    for (const b of budgets) {
      const key = b.category || "other";
      budgetByCategory.set(key, (budgetByCategory.get(key) ?? 0) + (Number(b.amount) || 0));
    }
    const actualByCategory = new Map<string, number>();
    for (const exp of expenses) {
      if (exp.status !== "approved" && exp.status !== "reimbursed") continue;
      const key = exp.category || "other";
      actualByCategory.set(key, (actualByCategory.get(key) ?? 0) + (Number(exp.amount) || 0));
    }
    return EXPENSE_CATEGORIES.map((c) => {
      const budget = Math.round(budgetByCategory.get(c.value) ?? 0);
      const actual = Math.round(actualByCategory.get(c.value) ?? 0);
      const pct = budget > 0 ? Math.round((actual / budget) * 100) : actual > 0 ? 100 : 0;
      return {
        category: c.value,
        label: optionLabel(c, t),
        budget,
        actual,
        pct,
        over: budget > 0 && actual > budget,
      };
    });
  }, [budgets, expenses, t]);

  const totals = useMemo(() => {
    const budget = rows.reduce((sum, r) => sum + r.budget, 0);
    const actual = rows.reduce((sum, r) => sum + r.actual, 0);
    const overspent = rows.filter((r) => r.over);
    // Anything past 85% is a warning: still inside budget, but close enough
    // that a controller wants to see it before the month closes.
    const atRisk = rows.filter((r) => !r.over && r.budget > 0 && r.pct >= 85);
    const overspendAmount = overspent.reduce(
      (sum, r) => sum + (r.actual - r.budget),
      0
    );
    return { budget, actual, overspent, atRisk, overspendAmount };
  }, [rows]);

  const executionRate = totals.budget > 0 ? (totals.actual / totals.budget) * 100 : 0;

  const tiles: KpiTile[] = [
    {
      key: "budget",
      label: t("finance.budget.kpi.budget", "Budgeted"),
      value: money(totals.budget),
      hint: t("finance.budget.kpi.budget.hint", "Across all categories"),
      icon: PiggyBank,
      tone: "text-blue-600 bg-blue-500/12 dark:text-blue-400",
    },
    {
      key: "actual",
      label: t("finance.budget.kpi.actual", "Actual spend"),
      value: money(totals.actual),
      hint: t("finance.budget.kpi.actual.hint", "Approved and reimbursed claims"),
      icon: Wallet,
      tone: "text-teal-600 bg-teal-500/12 dark:text-teal-400",
    },
    {
      key: "rate",
      label: t("finance.budget.kpi.rate", "Execution rate"),
      value: `${Math.round(executionRate)}%`,
      hint: t("finance.budget.kpi.rate.hint", "Actual as a share of budget"),
      icon: Gauge,
      tone:
        executionRate > 100
          ? "text-red-600 bg-red-500/12 dark:text-red-400"
          : "text-emerald-600 bg-emerald-500/12 dark:text-emerald-400",
    },
    {
      key: "over",
      label: t("finance.budget.kpi.over", "Overspend"),
      value: money(totals.overspendAmount),
      hint: t("finance.budget.kpi.over.hint", "{{count}} categories over budget").replace(
        "{{count}}",
        String(totals.overspent.length)
      ),
      icon: AlertTriangle,
      tone: "text-red-600 bg-red-500/12 dark:text-red-400",
    },
  ];

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
  const budgetLabel = t("finance.budget.series.budget", "Budget");
  const actualLabel = t("finance.budget.series.actual", "Actual");

  const option = {
    color: [chart.palette[1], chart.palette[0]],
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
      valueFormatter: (v: number) => money(v),
    },
    xAxis: {
      type: "category",
      data: rows.map((r) => r.label),
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
        name: budgetLabel,
        type: "bar",
        data: rows.map((r) => r.budget),
        barWidth: 18,
        itemStyle: { borderRadius: [4, 4, 0, 0] },
      },
      {
        name: actualLabel,
        type: "bar",
        data: rows.map((r) => r.actual),
        barWidth: 18,
        itemStyle: {
          borderRadius: [4, 4, 0, 0],
          color: (p: { dataIndex: number }) =>
            rows[p.dataIndex]?.over ? "#ef4444" : chart.palette[0],
        },
      },
    ],
  };

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t("finance.budget.title", "Budget vs actual")}
        description={t(
          "finance.budget.subtitle",
          "Approved and reimbursed spend against the monthly budget, by expense category."
        )}
      />

      <KpiStrip tiles={tiles} />

      {totals.overspent.length > 0 && (
        <Alert variant="destructive">
          <AlertTriangle className="size-4" />
          <AlertTitle>
            {t("finance.budget.alert.over.title", "Categories over budget")}
          </AlertTitle>
          <AlertDescription>
            {totals.overspent
              .map(
                (row) =>
                  `${row.label} ${money(row.actual - row.budget)} (${row.pct}%)`
              )
              .join(" · ")}
          </AlertDescription>
        </Alert>
      )}

      {totals.atRisk.length > 0 && (
        <Alert>
          <AlertTriangle className="size-4" />
          <AlertTitle>
            {t("finance.budget.alert.risk.title", "Approaching budget")}
          </AlertTitle>
          <AlertDescription>
            {totals.atRisk.map((row) => `${row.label} ${row.pct}%`).join(" · ")}
          </AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle>{t("finance.budget.progress.title", "By category")}</CardTitle>
          <CardDescription>
            {t(
              "finance.budget.progress.desc",
              "Progress toward each category's budget. Bars past 100% are highlighted."
            )}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {budgetQuery.isLoading ? (
            <p className="py-10 text-center text-sm text-muted-foreground">
              {t("finance.budget.loading", "Loading budgets…")}
            </p>
          ) : (
            <div className="space-y-5">
              {rows.map((r) => (
                <div key={r.category} className="space-y-1.5">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-sm font-medium">{r.label}</span>
                    <span
                      className={cn(
                        "text-xs tabular-nums",
                        r.over ? "font-medium text-red-600 dark:text-red-400" : "text-muted-foreground"
                      )}
                    >
                      {money(r.actual)} / {money(r.budget)} ({r.pct}%)
                    </span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-muted">
                    <div
                      className={cn(
                        "h-full rounded-full transition-all",
                        r.over ? "bg-red-500" : "bg-blue-500"
                      )}
                      style={{ width: `${Math.min(100, r.pct)}%` }}
                    />
                  </div>
                </div>
              ))}
              <div className="flex items-center justify-between border-t pt-3 text-sm">
                <span className="text-muted-foreground">
                  {t("finance.budget.total", "Total")}
                </span>
                <span className="font-medium tabular-nums">
                  {money(totals.actual)} / {money(totals.budget)}
                </span>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("finance.budget.chart.title", "Budget vs actual")}</CardTitle>
          <CardDescription>
            {t("finance.budget.chart.desc", "Budgeted amount against approved & reimbursed spend, per category.")}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ReactECharts
            key={`budget-${chart.isDark}`}
            option={option}
            style={{ height: 300 }}
            opts={{ renderer: "svg" }}
          />
        </CardContent>
      </Card>
    </div>
  );
}
