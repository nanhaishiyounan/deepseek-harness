import { useList, useTranslate } from "@refinedev/core";
import ReactECharts from "echarts-for-react";
import { AlertTriangle, Boxes, DollarSign, PackageX } from "lucide-react";
import { useMemo, useState } from "react";
import { useNavigate } from "react-router";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { useChartTheme } from "@/pages/home/theme";
import { useOnHandBy } from "./aggregates";
import {
  CATEGORIES,
  MOVE_TYPES,
  formatCurrency,
  formatNumber,
  labelFor,
} from "./constants";
import { AsyncPanel, KpiStrip, type KpiTile } from "@/lib/table-kit";
import { inventoryRoutes } from "./routes";
import { EnumBadge, hexA, useLocale } from "./shared";
import type { ProductRecord, StockMoveRecord, WarehouseRecord } from "./types";

const WINDOWS = [
  { weeks: 8, i18nKey: "inventory.dashboard.window.8", label: "8 weeks" },
  { weeks: 12, i18nKey: "inventory.dashboard.window.12", label: "12 weeks" },
  { weeks: 26, i18nKey: "inventory.dashboard.window.26", label: "26 weeks" },
] as const;

export function InventoryDashboard() {
  const translate = useTranslate();
  const locale = useLocale();
  const chart = useChartTheme();
  const navigate = useNavigate();
  const [windowWeeks, setWindowWeeks] = useState<number>(12);
  const emptyValue = translate(
    "inventory.common.emptyValue",
    { ns: "starter" },
    "—"
  );

  const products = useList<ProductRecord>({
    resource: "hub_inv_products",
    pagination: { mode: "server", currentPage: 1, pageSize: 500 },
    errorNotification: false,
    queryOptions: { retry: false },
  });
  const warehouses = useList<WarehouseRecord>({
    resource: "hub_inv_warehouses",
    pagination: { mode: "server", currentPage: 1, pageSize: 500 },
    errorNotification: false,
    queryOptions: { retry: false },
  });
  const onHand = useOnHandBy("product_id");

  const trendSince = useMemo(() => {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - windowWeeks * 7);
    return cutoff.toISOString();
  }, [windowWeeks]);

  const moves = useList<StockMoveRecord>({
    resource: "hub_inv_stock_moves",
    pagination: { mode: "server", currentPage: 1, pageSize: 1000 },
    filters: [{ field: "moved_at", operator: "gte", value: trendSince }],
    sorters: [{ field: "moved_at", order: "desc" }],
    meta: { appends: ["warehouse"] },
    errorNotification: false,
    queryOptions: { retry: false },
  });

  const enriched = useMemo(
    () =>
      products.result.data.map((product) => {
        const qty = onHand.totals.get(String(product.id)) ?? 0;
        const reorder = Number(product.reorder_level ?? 0);
        return {
          product,
          qty,
          reorder,
          low: qty <= reorder,
          value: qty * Number(product.unit_price ?? 0),
        };
      }),
    [onHand.totals, products.result.data]
  );

  const metrics = useMemo(() => {
    const lowStock = enriched
      .filter(
        (entry) =>
          entry.low && (entry.product.status ?? "active") === "active"
      )
      .sort((a, b) => a.qty - b.qty);

    return {
      totalUnits: enriched.reduce((sum, entry) => sum + entry.qty, 0),
      totalValue: enriched.reduce((sum, entry) => sum + entry.value, 0),
      negativeStock: enriched.filter((entry) => entry.qty < 0),
      lowStock,
    };
  }, [enriched]);

  const tiles = useMemo<KpiTile[]>(
    () => [
      {
        key: "skus",
        label: translate(
          "inventory.dashboard.kpi.skusTracked",
          { ns: "starter" },
          "SKUs tracked"
        ),
        value: formatNumber(products.result.data.length, locale),
        hint: translate(
          "inventory.dashboard.kpi.skusTracked.sub",
          { ns: "starter" },
          "Products in the catalog"
        ),
        icon: Boxes,
        tone: "text-blue-600 bg-blue-500/12 dark:text-blue-400",
      },
      {
        key: "units",
        label: translate(
          "inventory.dashboard.kpi.unitsOnHand",
          { ns: "starter" },
          "Units on hand"
        ),
        value: formatNumber(metrics.totalUnits, locale),
        hint: translate(
          "inventory.dashboard.kpi.unitsOnHand.sub",
          { ns: "starter" },
          "Across all warehouses"
        ),
        icon: Boxes,
        tone: "text-sky-600 bg-sky-500/12 dark:text-sky-400",
      },
      {
        key: "value",
        label: translate(
          "inventory.dashboard.kpi.stockValue",
          { ns: "starter" },
          "Stock value"
        ),
        value: formatCurrency(metrics.totalValue, locale),
        hint: translate(
          "inventory.dashboard.kpi.stockValue.sub",
          { ns: "starter" },
          "On-hand units × unit price"
        ),
        icon: DollarSign,
        tone: "text-emerald-600 bg-emerald-500/12 dark:text-emerald-400",
      },
      {
        key: "negative",
        label: translate(
          "inventory.dashboard.kpi.negativeStock",
          { ns: "starter" },
          "Negative-stock SKUs"
        ),
        value: formatNumber(metrics.negativeStock.length, locale),
        hint: translate(
          "inventory.dashboard.kpi.negativeStock.sub",
          { ns: "starter" },
          "Inventory exceptions requiring reconciliation"
        ),
        icon: PackageX,
        tone: "text-red-600 bg-red-500/12 dark:text-red-400",
        onClick: () => navigate(`${inventoryRoutes.reorder}?scope=negative`),
      },
      {
        key: "low",
        label: translate(
          "inventory.dashboard.kpi.lowStockSkus",
          { ns: "starter" },
          "Low-stock SKUs"
        ),
        value: formatNumber(metrics.lowStock.length, locale),
        hint: translate(
          "inventory.dashboard.kpi.lowStock.sub",
          { ns: "starter" },
          "At or below reorder level"
        ),
        icon: AlertTriangle,
        tone: "text-red-600 bg-red-500/12 dark:text-red-400",
        onClick: () => navigate(inventoryRoutes.reorder),
      },
    ],
    [locale, metrics, navigate, products.result.data.length, translate]
  );

  const byProduct = useMemo(
    () =>
      [...enriched]
        .sort((a, b) => b.qty - a.qty)
        .slice(0, 12)
        .reverse(),
    [enriched]
  );

  const trend = useMemo(() => {
    const now = new Date();
    const buckets = Array.from({ length: windowWeeks }, (_, index) => ({
      label: `W-${windowWeeks - 1 - index}`,
      inQty: 0,
      outQty: 0,
    }));

    for (const move of moves.result.data) {
      if (!move.moved_at) continue;
      const days = Math.floor(
        (now.getTime() - new Date(move.moved_at).getTime()) / 86400000
      );
      const weekAgo = Math.floor(days / 7);
      if (weekAgo < 0 || weekAgo >= windowWeeks) continue;
      const bucket = buckets[windowWeeks - 1 - weekAgo];
      const qty = Number(move.qty ?? 0);
      if (move.type === "out") bucket.outQty += Math.abs(qty);
      else if (move.type === "in") bucket.inQty += qty;
    }

    return buckets;
  }, [moves.result.data, windowWeeks]);

  const movementByWarehouse = useMemo(() => {
    const totals = new Map<
      string,
      { name: string; inQty: number; outQty: number; adjustQty: number }
    >();

    for (const warehouse of warehouses.result.data) {
      const key = String(warehouse.id);
      totals.set(key, {
        name: warehouse.name ?? warehouse.code ?? key,
        inQty: 0,
        outQty: 0,
        adjustQty: 0,
      });
    }

    for (const move of moves.result.data) {
      if (move.warehouse_id == null) continue;
      const key = String(move.warehouse_id);
      const current = totals.get(key) ?? {
        name: move.warehouse?.name ?? move.warehouse?.code ?? key,
        inQty: 0,
        outQty: 0,
        adjustQty: 0,
      };
      const qty = Number(move.qty ?? 0);
      if (move.type === "in") current.inQty += Math.abs(qty);
      else if (move.type === "out") current.outQty += Math.abs(qty);
      else if (move.type === "adjust") current.adjustQty += qty;
      totals.set(key, current);
    }

    return Array.from(totals.values()).sort((a, b) =>
      a.name.localeCompare(b.name)
    );
  }, [moves.result.data, warehouses.result.data]);

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
    padding: [8, 12],
  };

  const stockOption = {
    grid: { left: 6, right: 16, top: 12, bottom: 8, containLabel: true },
    tooltip: { trigger: "axis", axisPointer: { type: "shadow" }, ...tooltipBase },
    xAxis: {
      type: "value",
      ...axisBase,
      axisLine: { show: false },
      splitLine: { lineStyle: { color: chart.grid } },
    },
    yAxis: {
      type: "category",
      data: byProduct.map((entry) => entry.product.name ?? emptyValue),
      ...axisBase,
    },
    series: [
      {
        type: "bar",
        barWidth: 12,
        data: byProduct.map((entry) => ({
          value: entry.qty,
          itemStyle: {
            color: entry.low ? chart.palette[5] : chart.palette[0],
            borderRadius: [0, 4, 4, 0],
          },
        })),
      },
    ],
  };

  const trendOption = {
    color: [chart.palette[0], chart.palette[5]],
    grid: { left: 6, right: 12, top: 28, bottom: 8, containLabel: true },
    legend: {
      right: 0,
      top: 0,
      icon: "circle",
      itemWidth: 8,
      itemHeight: 8,
      textStyle: { color: chart.axis, fontSize: 12 },
    },
    tooltip: { trigger: "axis", ...tooltipBase },
    xAxis: {
      type: "category",
      boundaryGap: false,
      data: trend.map((bucket) => bucket.label),
      ...axisBase,
    },
    yAxis: {
      type: "value",
      ...axisBase,
      axisLine: { show: false },
      splitLine: { lineStyle: { color: chart.grid } },
    },
    series: [
      {
        name: translate(
          "inventory.dashboard.trend.received",
          { ns: "starter" },
          "Received"
        ),
        type: "line",
        smooth: true,
        showSymbol: false,
        data: trend.map((bucket) => bucket.inQty),
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
        name: translate(
          "inventory.dashboard.trend.issued",
          { ns: "starter" },
          "Issued"
        ),
        type: "line",
        smooth: true,
        showSymbol: false,
        data: trend.map((bucket) => bucket.outQty),
        lineStyle: { width: 3 },
        areaStyle: {
          color: {
            type: "linear",
            x: 0,
            y: 0,
            x2: 0,
            y2: 1,
            colorStops: [
              { offset: 0, color: hexA(chart.palette[5], 0.24) },
              { offset: 1, color: hexA(chart.palette[5], 0) },
            ],
          },
        },
      },
    ],
  };

  const warehouseOption = {
    color: [chart.palette[0], chart.palette[5], chart.palette[3]],
    grid: { left: 6, right: 16, top: 36, bottom: 8, containLabel: true },
    legend: {
      right: 0,
      top: 0,
      icon: "circle",
      itemWidth: 8,
      itemHeight: 8,
      textStyle: { color: chart.axis, fontSize: 12 },
    },
    tooltip: { trigger: "axis", axisPointer: { type: "shadow" }, ...tooltipBase },
    xAxis: {
      type: "category",
      data: movementByWarehouse.map((warehouse) => warehouse.name),
      ...axisBase,
      axisLabel: {
        ...axisBase.axisLabel,
        interval: 0,
        rotate: movementByWarehouse.length > 6 ? 24 : 0,
      },
    },
    yAxis: {
      type: "value",
      ...axisBase,
      axisLine: { show: false },
      splitLine: { lineStyle: { color: chart.grid } },
    },
    series: [
      {
        name: labelFor(MOVE_TYPES, "in", translate),
        type: "bar",
        stack: "moves",
        barMaxWidth: 42,
        data: movementByWarehouse.map((warehouse) => warehouse.inQty),
      },
      {
        name: labelFor(MOVE_TYPES, "out", translate),
        type: "bar",
        stack: "moves",
        barMaxWidth: 42,
        data: movementByWarehouse.map((warehouse) => warehouse.outQty),
      },
      {
        name: labelFor(MOVE_TYPES, "adjust", translate),
        type: "bar",
        stack: "moves",
        barMaxWidth: 42,
        data: movementByWarehouse.map((warehouse) => warehouse.adjustQty),
      },
    ],
  };

  const isLoading =
    products.query.isLoading ||
    warehouses.query.isLoading ||
    moves.query.isLoading ||
    onHand.isLoading;
  const isError =
    products.query.isError ||
    warehouses.query.isError ||
    moves.query.isError ||
    onHand.isError;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-3xl font-semibold tracking-[-0.035em]">
            {translate("inventory.dashboard.title", { ns: "starter" }, "Inventory")}
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
            {translate(
              "inventory.dashboard.description",
              { ns: "starter" },
              "On-hand stock across every warehouse, what's running low, and how goods are moving in and out."
            )}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {WINDOWS.map((option) => (
            <button
              key={option.weeks}
              type="button"
              onClick={() => setWindowWeeks(option.weeks)}
              className={cn(
                "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                windowWeeks === option.weeks
                  ? "border-primary/40 bg-primary/10 text-primary"
                  : "border-border/70 text-muted-foreground hover:bg-muted"
              )}
            >
              {translate(option.i18nKey, { ns: "starter" }, option.label)}
            </button>
          ))}
        </div>
      </div>

      <AsyncPanel i18nPrefix="inventory.ops"
        isLoading={isLoading}
        isError={isError}
        isEmpty={!isLoading && products.result.data.length === 0}
        onRetry={() => {
          void products.query.refetch();
          void warehouses.query.refetch();
          void moves.query.refetch();
          void onHand.refetch();
        }}
        emptyTitle={translate(
          "inventory.dashboard.empty.title",
          { ns: "starter" },
          "No inventory data"
        )}
        emptyDescription={translate(
          "inventory.dashboard.empty.description",
          { ns: "starter" },
          "Add products and stock movements to populate this dashboard."
        )}
        skeletonRows={8}
      >
        <div className="flex flex-col gap-4">
          <KpiStrip tiles={tiles} />

          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>
                  {translate(
                    "inventory.dashboard.stockByProduct.title",
                    { ns: "starter" },
                    "Stock level by product"
                  )}
                </CardTitle>
                <CardDescription>
                  {translate(
                    "inventory.dashboard.stockByProduct.description",
                    { ns: "starter" },
                    "On-hand units for the best-stocked products. Red bars are at or below reorder level."
                  )}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ReactECharts
                  key={`stock-${chart.isDark}`}
                  option={stockOption}
                  style={{ height: 320 }}
                  opts={{ renderer: "svg" }}
                />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>
                  {translate(
                    "inventory.dashboard.lowStock.title",
                    { ns: "starter" },
                    "Low-stock alerts"
                  )}
                </CardTitle>
                <CardDescription>
                  {translate(
                    "inventory.dashboard.lowStock.description",
                    { ns: "starter" },
                    "Active products at or below their reorder level — reorder these soon."
                  )}
                </CardDescription>
              </CardHeader>
              <CardContent>
                {metrics.lowStock.length === 0 ? (
                  <div className="flex h-72 flex-col items-center justify-center gap-2 text-center">
                    <PackageX className="size-8 text-muted-foreground/40" />
                    <p className="text-sm text-muted-foreground">
                      {translate(
                        "inventory.dashboard.lowStock.empty",
                        { ns: "starter" },
                        "Everything is above its reorder level. Nice."
                      )}
                    </p>
                  </div>
                ) : (
                  <div className="max-h-80 space-y-1 overflow-y-auto">
                    {metrics.lowStock.map((entry) => (
                      <button
                        type="button"
                        key={String(entry.product.id)}
                        onClick={() =>
                          navigate(
                            `${inventoryRoutes.products}/show/${entry.product.id}`
                          )
                        }
                        className="flex w-full items-center justify-between gap-3 rounded-lg px-2 py-2 text-left hover:bg-accent"
                      >
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">
                            {entry.product.name || emptyValue}
                          </p>
                          <p className="truncate text-xs text-muted-foreground">
                            {entry.product.sku || emptyValue} ·{" "}
                            {labelFor(
                              CATEGORIES,
                              entry.product.category,
                              translate
                            )}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <EnumBadge
                            value="out"
                            label={translate(
                              "inventory.dashboard.lowStock.onHand",
                              { ns: "starter", qty: entry.qty },
                              `${entry.qty} on hand`
                            )}
                          />
                          <span className="text-xs text-muted-foreground tabular-nums">
                            {translate(
                              "inventory.dashboard.lowStock.reorder",
                              { ns: "starter", level: entry.reorder },
                              `reorder ${entry.reorder}`
                            )}
                          </span>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>
                {translate(
                  "inventory.dashboard.trend.title",
                  { ns: "starter" },
                  "Stock movement trend"
                )}
              </CardTitle>
              <CardDescription>
                {translate(
                  "inventory.dashboard.trend.description",
                  { ns: "starter", weeks: windowWeeks },
                  `Units received vs issued over the last ${windowWeeks} weeks.`
                )}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ReactECharts
                key={`trend-${chart.isDark}-${windowWeeks}`}
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
                  "inventory.dashboard.byWarehouse.title",
                  { ns: "starter" },
                  "Movement by warehouse"
                )}
              </CardTitle>
              <CardDescription>
                {translate(
                  "inventory.dashboard.byWarehouse.description",
                  { ns: "starter", weeks: windowWeeks },
                  `Inbound, outbound, and adjustment units over the last ${windowWeeks} weeks.`
                )}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ReactECharts
                key={`warehouse-${chart.isDark}-${windowWeeks}`}
                option={warehouseOption}
                style={{ height: 320 }}
                opts={{ renderer: "svg" }}
              />
            </CardContent>
          </Card>
        </div>
      </AsyncPanel>
    </div>
  );
}
