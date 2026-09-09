import { useList, useTranslate } from "@refinedev/core";
import ReactECharts from "echarts-for-react";
import { useMemo } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useChartTheme } from "@/pages/home/theme";
import { OPEN_PO_STATUSES, formatCurrency } from "../constants";
import { useLocale } from "../shared";
import type { PurchaseOrderRecord } from "../types";

type Kpi = { label: string; value: string; hint: string };

export function SpendPanel() {
  const translate = useTranslate();
  const locale = useLocale();
  const chart = useChartTheme();

  const { result } = useList<PurchaseOrderRecord>({
    resource: "hub_po_purchase_orders",
    pagination: { mode: "server", currentPage: 1, pageSize: 500 },
    meta: { appends: ["supplier"] },
    errorNotification: false,
    queryOptions: { retry: false },
  });

  const orders = result.data;

  const { kpis, bySupplier } = useMemo(() => {
    const committed = orders.filter((po) => po.status !== "cancelled");
    const totalSpend = committed.reduce(
      (sum, po) => sum + Number(po.total ?? 0),
      0
    );
    const openCount = orders.filter((po) =>
      OPEN_PO_STATUSES.includes((po.status ?? "draft") as never)
    ).length;
    const receivedCount = orders.filter(
      (po) => po.status === "received"
    ).length;
    const avg = committed.length ? totalSpend / committed.length : 0;

    const unassigned = translate(
      "procurement.spend.unassigned",
      { ns: "starter" },
      "Unassigned"
    );
    const spendMap = new Map<string, number>();
    for (const po of committed) {
      const name = po.supplier?.name || unassigned;
      spendMap.set(name, (spendMap.get(name) ?? 0) + Number(po.total ?? 0));
    }
    const bySupplier = [...spendMap.entries()]
      .map(([name, value]) => ({ name, value: Math.round(value) }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 8)
      .reverse();

    const kpis: Kpi[] = [
      {
        label: translate(
          "procurement.spend.kpi.committed.label",
          { ns: "starter" },
          "Committed spend"
        ),
        value: formatCurrency(totalSpend, locale),
        hint: translate(
          "procurement.spend.kpi.committed.hint",
          { ns: "starter", count: committed.length },
          `${committed.length} active orders`
        ),
      },
      {
        label: translate(
          "procurement.spend.kpi.open.label",
          { ns: "starter" },
          "Open orders"
        ),
        value: String(openCount),
        hint: translate(
          "procurement.spend.kpi.open.hint",
          { ns: "starter" },
          "draft + sent"
        ),
      },
      {
        label: translate(
          "procurement.spend.kpi.received.label",
          { ns: "starter" },
          "Received"
        ),
        value: String(receivedCount),
        hint: translate(
          "procurement.spend.kpi.received.hint",
          { ns: "starter" },
          "goods delivered"
        ),
      },
      {
        label: translate(
          "procurement.spend.kpi.avg.label",
          { ns: "starter" },
          "Avg. order value"
        ),
        value: formatCurrency(avg, locale),
        hint: translate(
          "procurement.spend.kpi.avg.hint",
          { ns: "starter" },
          "excl. cancelled"
        ),
      },
    ];

    return { kpis, bySupplier };
  }, [orders, locale, translate]);

  const spendOption = {
    color: [chart.palette[0]],
    grid: { left: 6, right: 24, top: 10, bottom: 6, containLabel: true },
    tooltip: {
      trigger: "axis",
      axisPointer: { type: "shadow" },
      backgroundColor: chart.tooltipBg,
      borderColor: chart.tooltipBorder,
      textStyle: { color: chart.tooltipText, fontSize: 12 },
      borderWidth: 1,
      padding: [8, 12],
      valueFormatter: (v: number) => formatCurrency(v, locale),
    },
    xAxis: {
      type: "value",
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: {
        color: chart.axis,
        fontSize: 12,
        formatter: (v: number) => `$${Math.round(v / 1000)}k`,
      },
      splitLine: { lineStyle: { color: chart.grid } },
    },
    yAxis: {
      type: "category",
      data: bySupplier.map((s) => s.name),
      axisLine: { lineStyle: { color: chart.grid } },
      axisTick: { show: false },
      axisLabel: { color: chart.axis, fontSize: 12 },
    },
    series: [
      {
        type: "bar",
        data: bySupplier.map((s) => s.value),
        barWidth: 14,
        itemStyle: { borderRadius: [0, 4, 4, 0] },
      },
    ],
  };

  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
      <div className="grid grid-cols-2 gap-4 xl:col-span-1 xl:grid-cols-1 xl:content-start">
        {kpis.map((kpi) => (
          <Card key={kpi.label} className="overflow-hidden">
            <CardContent className="pt-6">
              <p className="text-sm text-muted-foreground">{kpi.label}</p>
              <p className="mt-2 text-2xl font-semibold tabular-nums tracking-tight">
                {kpi.value}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">{kpi.hint}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="xl:col-span-2">
        <CardHeader>
          <CardTitle>
            {translate(
              "procurement.spend.chart.title",
              { ns: "starter" },
              "Spend by supplier"
            )}
          </CardTitle>
          <CardDescription>
            {translate(
              "procurement.spend.chart.description",
              { ns: "starter" },
              "Committed spend across active purchase orders."
            )}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {bySupplier.length === 0 ? (
            <div className="flex h-[280px] items-center justify-center text-sm text-muted-foreground">
              {translate(
                "procurement.spend.chart.empty",
                { ns: "starter" },
                "No spend to chart yet."
              )}
            </div>
          ) : (
            <ReactECharts
              key={`spend-${chart.isDark}`}
              option={spendOption}
              style={{ height: 280 }}
              opts={{ renderer: "svg" }}
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
