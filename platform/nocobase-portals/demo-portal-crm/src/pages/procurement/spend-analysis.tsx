import { useList, useTranslate } from "@refinedev/core";
import ReactECharts from "echarts-for-react";
import {
  CircleX,
  DollarSign,
  Download,
  PackageCheck,
  ReceiptText,
} from "lucide-react";
import { useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useChartTheme } from "@/pages/home/theme";
import { useSupplierOrderStats } from "./aggregates";
import type { SupplierStats } from "./aggregates";
import { PO_STATUSES, formatCurrency, labelFor } from "./constants";
import { AsyncPanel, KpiStrip, exportCsv } from "@/lib/table-kit";
import { getSupplierShowPath } from "./routes";
import { useLocale } from "./shared";
import type { PurchaseOrderRecord } from "./types";

type RangeMonths = 6 | 12 | 24;

type SupplierSpendRow = SupplierStats & {
  key: string;
  name: string;
  supplierId: string | number | null;
};

const RANGE_OPTIONS: RangeMonths[] = [6, 12, 24];

function hexA(hex: string, alpha: number) {
  const value = hex.replace("#", "");
  const r = parseInt(value.slice(0, 2), 16);
  const g = parseInt(value.slice(2, 4), 16);
  const b = parseInt(value.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function monthKey(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function lastMonths(count: number) {
  const now = new Date();
  const months: { key: string; date: Date }[] = [];
  for (let i = count - 1; i >= 0; i -= 1) {
    const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push({
      key: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`,
      date,
    });
  }
  return months;
}

export function SpendAnalysisDashboard() {
  const translate = useTranslate();
  const locale = useLocale();
  const chart = useChartTheme();
  const navigate = useNavigate();
  const [rangeMonths, setRangeMonths] = useState<RangeMonths>(12);

  const { result, query } = useList<PurchaseOrderRecord>({
    resource: "hub_po_purchase_orders",
    pagination: { mode: "server", currentPage: 1, pageSize: 1000 },
    meta: { appends: ["supplier", "owner"] },
    errorNotification: false,
    queryOptions: { retry: false },
  });
  const {
    statsBySupplier,
    isLoading: statsLoading,
    isError: statsError,
    refetch: refetchStats,
  } = useSupplierOrderStats();

  const orders = result.data;
  const unassigned = translate(
    "procurement.spend.unassigned",
    { ns: "starter" },
    "Unassigned"
  );

  const {
    filteredOrders,
    kpis,
    bySupplier,
    byBuyer,
    byStatus,
    trend,
    topSuppliers,
  } = useMemo(() => {
    const months = lastMonths(rangeMonths);
    const rangeStart = months[0]?.date ?? new Date();
    const rangeEnd = new Date(
      rangeStart.getFullYear(),
      rangeStart.getMonth() + rangeMonths,
      1
    );
    const inRange = (po: PurchaseOrderRecord) => {
      if (!po.order_date) return false;
      const date = new Date(po.order_date);
      return (
        !Number.isNaN(date.getTime()) && date >= rangeStart && date < rangeEnd
      );
    };
    const filteredOrders = orders.filter(inRange);
    const committed = filteredOrders.filter(
      (po) => po.status !== "cancelled"
    );
    const totalSpend = committed.reduce(
      (sum, po) => sum + Number(po.total ?? 0),
      0
    );
    const openSpend = filteredOrders
      .filter((po) => po.status === "draft" || po.status === "sent")
      .reduce((sum, po) => sum + Number(po.total ?? 0), 0);
    const receivedSpend = filteredOrders
      .filter((po) => po.status === "received")
      .reduce((sum, po) => sum + Number(po.total ?? 0), 0);
    const cancelled = filteredOrders.filter(
      (po) => po.status === "cancelled"
    );
    const cancelledValue = cancelled.reduce(
      (sum, po) => sum + Number(po.total ?? 0),
      0
    );

    const kpis = [
      {
        key: "total-spend",
        label: translate(
          "procurement.spendAnalysis.kpi.total.label",
          { ns: "starter" },
          "Total spend"
        ),
        value: formatCurrency(totalSpend, locale),
        icon: DollarSign,
        tone: "text-blue-600 bg-blue-500/12 dark:text-blue-400",
      },
      {
        key: "open-commitment",
        label: translate(
          "procurement.spendAnalysis.kpi.open.label",
          { ns: "starter" },
          "Open commitment"
        ),
        value: formatCurrency(openSpend, locale),
        icon: ReceiptText,
        tone: "text-amber-700 bg-amber-500/12 dark:text-amber-300",
      },
      {
        key: "received",
        label: translate(
          "procurement.spendAnalysis.kpi.receivedRange.label",
          { ns: "starter" },
          "Received"
        ),
        value: formatCurrency(receivedSpend, locale),
        icon: PackageCheck,
        tone: "text-emerald-600 bg-emerald-500/12 dark:text-emerald-400",
      },
      {
        key: "cancelled",
        label: translate(
          "procurement.spendAnalysis.kpi.cancelled.label",
          { ns: "starter" },
          "Cancelled value"
        ),
        value: formatCurrency(cancelledValue, locale),
        hint: translate(
          "procurement.spendAnalysis.kpi.cancelled.hint",
          { ns: "starter", count: cancelled.length },
          `${cancelled.length} orders cancelled`
        ),
        icon: CircleX,
        tone: "text-red-600 bg-red-500/12 dark:text-red-400",
      },
    ];

    const excludedBySupplier = new Map<string, SupplierStats>();
    for (const po of orders) {
      if (inRange(po) || po.supplier_id == null) continue;
      const key = String(po.supplier_id);
      const entry = excludedBySupplier.get(key) ?? {
        orders: 0,
        spend: 0,
        openSpend: 0,
        receivedSpend: 0,
        cancelled: 0,
        received: 0,
      };
      const value = Number(po.total ?? 0);
      entry.orders += 1;
      if (po.status !== "cancelled") entry.spend += value;
      if (po.status === "draft" || po.status === "sent") {
        entry.openSpend += value;
      }
      if (po.status === "received") {
        entry.receivedSpend += value;
        entry.received += 1;
      }
      if (po.status === "cancelled") entry.cancelled += 1;
      excludedBySupplier.set(key, entry);
    }

    const supplierMap = new Map<
      string,
      {
        name: string;
        supplierId: string | number | null;
        local: SupplierStats;
      }
    >();
    for (const po of filteredOrders) {
      const supplierId = po.supplier?.id ?? po.supplier_id ?? null;
      const key = supplierId == null ? "unassigned" : String(supplierId);
      const entry = supplierMap.get(key) ?? {
        name: po.supplier?.name || unassigned,
        supplierId,
        local: {
          orders: 0,
          spend: 0,
          openSpend: 0,
          receivedSpend: 0,
          cancelled: 0,
          received: 0,
        },
      };
      const value = Number(po.total ?? 0);
      entry.local.orders += 1;
      if (po.status !== "cancelled") entry.local.spend += value;
      if (po.status === "draft" || po.status === "sent") {
        entry.local.openSpend += value;
      }
      if (po.status === "received") {
        entry.local.receivedSpend += value;
        entry.local.received += 1;
      }
      if (po.status === "cancelled") entry.local.cancelled += 1;
      supplierMap.set(key, entry);
    }

    const supplierRows = [...supplierMap.entries()]
      .map(([key, entry]): SupplierSpendRow => {
        const aggregate =
          entry.supplierId == null ? undefined : statsBySupplier.get(key);
        const excluded = excludedBySupplier.get(key);
        if (!aggregate) return { key, ...entry, ...entry.local };

        // The shared aggregate is lifetime-based; subtracting out-of-range POs
        // keeps its order and commitment metrics aligned with the page window.
        return {
          key,
          name: entry.name,
          supplierId: entry.supplierId,
          orders: Math.max(0, aggregate.orders - (excluded?.orders ?? 0)),
          spend: Math.max(0, aggregate.spend - (excluded?.spend ?? 0)),
          openSpend: Math.max(
            0,
            aggregate.openSpend - (excluded?.openSpend ?? 0)
          ),
          receivedSpend: Math.max(
            0,
            aggregate.receivedSpend - (excluded?.receivedSpend ?? 0)
          ),
          cancelled: Math.max(
            0,
            aggregate.cancelled - (excluded?.cancelled ?? 0)
          ),
          received: Math.max(
            0,
            aggregate.received - (excluded?.received ?? 0)
          ),
        };
      })
      .filter((row) => row.spend > 0)
      .sort((a, b) => b.spend - a.spend);
    const bySupplier = supplierRows.slice(0, 8).reverse();
    const topSuppliers = supplierRows.slice(0, 10);

    const buyerMap = new Map<string, { name: string; spend: number }>();
    for (const po of committed) {
      const key = po.owner_id == null ? "unassigned" : String(po.owner_id);
      const name = po.owner?.nickname || po.owner?.username || unassigned;
      const entry = buyerMap.get(key) ?? { name, spend: 0 };
      entry.spend += Number(po.total ?? 0);
      buyerMap.set(key, entry);
    }
    const byBuyer = [...buyerMap.values()]
      .sort((a, b) => b.spend - a.spend)
      .slice(0, 10)
      .reverse();

    const statusMap = new Map<string, number>();
    for (const po of filteredOrders) {
      const key = po.status ?? "draft";
      statusMap.set(key, (statusMap.get(key) ?? 0) + 1);
    }
    const byStatus = PO_STATUSES.filter(
      (status) => (statusMap.get(status.value) ?? 0) > 0
    ).map((status) => ({
      name: labelFor(PO_STATUSES, status.value, translate),
      value: statusMap.get(status.value) ?? 0,
    }));

    const monthSpend = new Map<string, number>();
    for (const po of committed) {
      const key = monthKey(po.order_date);
      if (!key) continue;
      monthSpend.set(key, (monthSpend.get(key) ?? 0) + Number(po.total ?? 0));
    }
    const trend = months.map((month) => ({
      label: month.date.toLocaleDateString(locale, { month: "short" }),
      value: Math.round(monthSpend.get(month.key) ?? 0),
    }));

    return {
      filteredOrders,
      kpis,
      bySupplier,
      byBuyer,
      byStatus,
      trend,
      topSuppliers,
    };
  }, [orders, rangeMonths, statsBySupplier, locale, translate, unassigned]);

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

  const supplierOption = {
    color: [chart.palette[0]],
    grid: { left: 6, right: 24, top: 10, bottom: 6, containLabel: true },
    tooltip: {
      trigger: "axis",
      axisPointer: { type: "shadow" },
      ...tooltipBase,
      valueFormatter: (value: number) => formatCurrency(value, locale),
    },
    xAxis: {
      type: "value",
      ...axisBase,
      axisLine: { show: false },
      axisLabel: {
        color: chart.axis,
        fontSize: 12,
        formatter: (value: number) => `$${Math.round(value / 1000)}k`,
      },
      splitLine: { lineStyle: { color: chart.grid } },
    },
    yAxis: {
      type: "category",
      data: bySupplier.map((supplier) => supplier.name),
      ...axisBase,
    },
    series: [
      {
        type: "bar",
        data: bySupplier.map((supplier) => supplier.spend),
        barWidth: 14,
        itemStyle: { borderRadius: [0, 4, 4, 0] },
      },
    ],
  };

  const buyerOption = {
    color: [chart.palette[1] ?? chart.palette[0]],
    grid: { left: 6, right: 24, top: 10, bottom: 6, containLabel: true },
    tooltip: {
      trigger: "axis",
      axisPointer: { type: "shadow" },
      ...tooltipBase,
      valueFormatter: (value: number) => formatCurrency(value, locale),
    },
    xAxis: {
      type: "value",
      ...axisBase,
      axisLine: { show: false },
      axisLabel: {
        color: chart.axis,
        fontSize: 12,
        formatter: (value: number) => `$${Math.round(value / 1000)}k`,
      },
      splitLine: { lineStyle: { color: chart.grid } },
    },
    yAxis: {
      type: "category",
      data: byBuyer.map((buyer) => buyer.name),
      ...axisBase,
    },
    series: [
      {
        type: "bar",
        data: byBuyer.map((buyer) => buyer.spend),
        barWidth: 14,
        itemStyle: { borderRadius: [0, 4, 4, 0] },
      },
    ],
  };

  const statusOption = {
    color: chart.palette,
    tooltip: {
      trigger: "item",
      ...tooltipBase,
      valueFormatter: (value: number) =>
        translate(
          "procurement.spendAnalysis.chart.status.tooltip",
          { ns: "starter", count: value },
          `${value} orders`
        ),
    },
    legend: {
      orient: "vertical",
      right: 8,
      top: "middle",
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
        data: byStatus,
      },
    ],
  };

  const trendOption = {
    grid: { left: 6, right: 12, top: 16, bottom: 8, containLabel: true },
    tooltip: {
      trigger: "axis",
      ...tooltipBase,
      valueFormatter: (value: number) => formatCurrency(value, locale),
    },
    xAxis: {
      type: "category",
      boundaryGap: false,
      data: trend.map((point) => point.label),
      ...axisBase,
    },
    yAxis: {
      type: "value",
      ...axisBase,
      axisLine: { show: false },
      axisLabel: {
        color: chart.axis,
        fontSize: 12,
        formatter: (value: number) => `$${Math.round(value / 1000)}k`,
      },
      splitLine: { lineStyle: { color: chart.grid } },
    },
    series: [
      {
        type: "line",
        smooth: true,
        showSymbol: false,
        data: trend.map((point) => point.value),
        lineStyle: { width: 3, color: chart.palette[0] },
        itemStyle: { color: chart.palette[0] },
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
    ],
  };

  const handleExport = () => {
    exportCsv(
      translate(
        "procurement.spendAnalysis.export.filename",
        { ns: "starter" },
        "supplier-spend"
      ),
      [
        {
          header: translate(
            "procurement.suppliers.fields.name",
            { ns: "starter" },
            "Supplier"
          ),
          value: (row: SupplierSpendRow) => row.name,
        },
        {
          header: translate(
            "procurement.suppliers.fields.orders",
            { ns: "starter" },
            "Orders"
          ),
          value: (row: SupplierSpendRow) => row.orders,
        },
        {
          header: translate(
            "procurement.suppliers.fields.spend",
            { ns: "starter" },
            "Total spend"
          ),
          value: (row: SupplierSpendRow) => row.spend,
        },
        {
          header: translate(
            "procurement.suppliers.fields.openSpend",
            { ns: "starter" },
            "Open commitment"
          ),
          value: (row: SupplierSpendRow) => row.openSpend,
        },
        {
          header: translate(
            "procurement.spendAnalysis.export.received",
            { ns: "starter" },
            "Received"
          ),
          value: (row: SupplierSpendRow) => row.receivedSpend,
        },
        {
          header: translate(
            "procurement.spendAnalysis.export.cancelled",
            { ns: "starter" },
            "Cancelled"
          ),
          value: (row: SupplierSpendRow) => row.cancelled,
        },
      ],
      topSuppliers
    );
  };

  const retry = () => {
    void query.refetch();
    void refetchStats();
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-start">
        <div>
          <h2 className="text-3xl font-semibold tracking-[-0.035em]">
            {translate(
              "procurement.spendAnalysis.title",
              { ns: "starter" },
              "Spend analysis"
            )}
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
            {translate(
              "procurement.spendAnalysis.description",
              { ns: "starter" },
              "Where procurement spend is going: by supplier, by order status, and over time."
            )}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div
            className="flex items-center rounded-full border bg-muted/40 p-1"
            role="group"
            aria-label={translate(
              "procurement.spendAnalysis.range.label",
              { ns: "starter" },
              "Time range"
            )}
          >
            {RANGE_OPTIONS.map((months) => (
              <Button
                key={months}
                type="button"
                variant={rangeMonths === months ? "secondary" : "ghost"}
                size="sm"
                className="h-7 rounded-full px-3 text-xs"
                aria-pressed={rangeMonths === months}
                onClick={() => setRangeMonths(months)}
              >
                {translate(
                  `procurement.spendAnalysis.range.${months}`,
                  { ns: "starter" },
                  `${months} months`
                )}
              </Button>
            ))}
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={topSuppliers.length === 0}
            onClick={handleExport}
          >
            <Download className="size-4" />
            {translate(
              "procurement.ops.exportCsv",
              { ns: "starter" },
              "Export CSV"
            )}
          </Button>
        </div>
      </div>

      <AsyncPanel i18nPrefix="procurement.ops"
        isLoading={query.isLoading || statsLoading}
        isError={query.isError || statsError}
        isEmpty={filteredOrders.length === 0}
        onRetry={retry}
        emptyTitle={translate(
          "procurement.spendAnalysis.empty.title",
          { ns: "starter" },
          "No purchase orders in this range"
        )}
        emptyDescription={translate(
          "procurement.spendAnalysis.empty.description",
          { ns: "starter" },
          "Choose a longer time range to see procurement activity."
        )}
        skeletonRows={6}
      >
        <div className="flex flex-col gap-6">
          <KpiStrip tiles={kpis} />

          <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
            <Card className="xl:col-span-2">
              <CardHeader>
                <CardTitle>
                  {translate(
                    "procurement.spendAnalysis.chart.supplier.title",
                    { ns: "starter" },
                    "Spend by supplier"
                  )}
                </CardTitle>
                <CardDescription>
                  {translate(
                    "procurement.spendAnalysis.chart.supplier.description",
                    { ns: "starter" },
                    "Committed spend across active purchase orders."
                  )}
                </CardDescription>
              </CardHeader>
              <CardContent>
                {bySupplier.length === 0 ? (
                  <div className="flex h-72 items-center justify-center text-sm text-muted-foreground">
                    {translate(
                      "procurement.spendAnalysis.chart.supplier.empty",
                      { ns: "starter" },
                      "No spend to chart yet."
                    )}
                  </div>
                ) : (
                  <ReactECharts
                    key={`supplier-${rangeMonths}-${chart.isDark}`}
                    option={supplierOption}
                    style={{ height: 288 }}
                    opts={{ renderer: "svg" }}
                  />
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>
                  {translate(
                    "procurement.spendAnalysis.chart.status.title",
                    { ns: "starter" },
                    "PO status mix"
                  )}
                </CardTitle>
                <CardDescription>
                  {translate(
                    "procurement.spendAnalysis.chart.status.description",
                    { ns: "starter" },
                    "Every purchase order, by current status."
                  )}
                </CardDescription>
              </CardHeader>
              <CardContent>
                {byStatus.length === 0 ? (
                  <div className="flex h-72 items-center justify-center text-sm text-muted-foreground">
                    {translate(
                      "procurement.spendAnalysis.chart.status.empty",
                      { ns: "starter" },
                      "No orders yet."
                    )}
                  </div>
                ) : (
                  <ReactECharts
                    key={`status-${rangeMonths}-${chart.isDark}`}
                    option={statusOption}
                    style={{ height: 288 }}
                    opts={{ renderer: "svg" }}
                  />
                )}
              </CardContent>
            </Card>
          </div>

          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>
                  {translate(
                    "procurement.spendAnalysis.chart.trend.title",
                    { ns: "starter" },
                    "Monthly spend trend"
                  )}
                </CardTitle>
                <CardDescription>
                  {translate(
                    "procurement.spendAnalysis.chart.trend.description",
                    { ns: "starter", months: rangeMonths },
                    `Committed spend by order date over the last ${rangeMonths} months.`
                  )}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ReactECharts
                  key={`trend-${rangeMonths}-${chart.isDark}`}
                  option={trendOption}
                  style={{ height: 288 }}
                  opts={{ renderer: "svg" }}
                />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>
                  {translate(
                    "procurement.spendAnalysis.chart.buyer.title",
                    { ns: "starter" },
                    "Spend by buyer"
                  )}
                </CardTitle>
                <CardDescription>
                  {translate(
                    "procurement.spendAnalysis.chart.buyer.description",
                    { ns: "starter" },
                    "Top buyers by purchase order spend."
                  )}
                </CardDescription>
              </CardHeader>
              <CardContent>
                {byBuyer.length === 0 ? (
                  <div className="flex h-72 items-center justify-center text-sm text-muted-foreground">
                    {translate(
                      "procurement.spendAnalysis.chart.buyer.empty",
                      { ns: "starter" },
                      "No buyer spend to chart yet."
                    )}
                  </div>
                ) : (
                  <ReactECharts
                    key={`buyer-${rangeMonths}-${chart.isDark}`}
                    option={buyerOption}
                    style={{ height: 288 }}
                    opts={{ renderer: "svg" }}
                  />
                )}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>
                {translate(
                  "procurement.spendAnalysis.table.title",
                  { ns: "starter" },
                  "Top suppliers"
                )}
              </CardTitle>
              <CardDescription>
                {translate(
                  "procurement.spendAnalysis.table.description",
                  { ns: "starter" },
                  "Click a supplier to open its detail."
                )}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {topSuppliers.length === 0 ? (
                <div className="flex h-56 items-center justify-center text-sm text-muted-foreground">
                  {translate(
                    "procurement.spendAnalysis.table.empty",
                    { ns: "starter" },
                    "No suppliers with spend yet."
                  )}
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-left text-xs text-muted-foreground">
                        <th className="px-3 py-2 font-medium">
                          {translate(
                            "procurement.suppliers.fields.name",
                            { ns: "starter" },
                            "Supplier"
                          )}
                        </th>
                        <th className="px-3 py-2 text-right font-medium">
                          {translate(
                            "procurement.suppliers.fields.orders",
                            { ns: "starter" },
                            "Orders"
                          )}
                        </th>
                        <th className="px-3 py-2 text-right font-medium">
                          {translate(
                            "procurement.suppliers.fields.spend",
                            { ns: "starter" },
                            "Total spend"
                          )}
                        </th>
                        <th className="px-3 py-2 text-right font-medium">
                          {translate(
                            "procurement.suppliers.fields.openSpend",
                            { ns: "starter" },
                            "Open commitment"
                          )}
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {topSuppliers.map((supplier) => (
                        <tr
                          key={supplier.key}
                          role={supplier.supplierId == null ? undefined : "link"}
                          tabIndex={supplier.supplierId == null ? undefined : 0}
                          aria-label={
                            supplier.supplierId == null
                              ? undefined
                              : translate(
                                  "procurement.spendAnalysis.table.openSupplier",
                                  { ns: "starter", supplier: supplier.name },
                                  `Open ${supplier.name}`
                                )
                          }
                          onClick={() => {
                            if (supplier.supplierId != null) {
                              navigate(getSupplierShowPath(supplier.supplierId));
                            }
                          }}
                          onKeyDown={(event) => {
                            if (
                              supplier.supplierId != null &&
                              (event.key === "Enter" || event.key === " ")
                            ) {
                              event.preventDefault();
                              navigate(getSupplierShowPath(supplier.supplierId));
                            }
                          }}
                          className={
                            supplier.supplierId == null
                              ? "border-b last:border-0"
                              : "cursor-pointer border-b transition-colors hover:bg-accent/60 focus-visible:bg-accent/60 focus-visible:outline-none last:border-0"
                          }
                        >
                          <td className="px-3 py-3 font-medium">
                            {supplier.name}
                          </td>
                          <td className="px-3 py-3 text-right tabular-nums">
                            {supplier.orders}
                          </td>
                          <td className="px-3 py-3 text-right font-semibold tabular-nums">
                            {formatCurrency(supplier.spend, locale)}
                          </td>
                          <td className="px-3 py-3 text-right tabular-nums">
                            {formatCurrency(supplier.openSpend, locale)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </AsyncPanel>
    </div>
  );
}
