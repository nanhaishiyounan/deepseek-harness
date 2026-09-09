import { useList, useTranslate } from "@refinedev/core";
import ReactECharts from "echarts-for-react";
import { AlertTriangle, Boxes, DollarSign, PackageSearch } from "lucide-react";
import { useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useChartTheme } from "@/pages/home/theme";
import { useOnHandBy, useOutboundSince } from "./aggregates";
import {
  CATEGORIES,
  formatCurrency,
  formatNumber,
  labelFor,
} from "./constants";
import { AsyncPanel, KpiStrip, exportCsv, type KpiTile } from "@/lib/table-kit";
import { inventoryRoutes } from "./routes";
import { EnumBadge, useLocale } from "./shared";
import type { ProductRecord } from "./types";

const WINDOWS = [
  { days: 30, i18nKey: "inventory.reorder.window.30", label: "30 days" },
  { days: 90, i18nKey: "inventory.reorder.window.90", label: "90 days" },
  { days: 180, i18nKey: "inventory.reorder.window.180", label: "180 days" },
] as const;

/** Suggested reorder quantity: enough to bring on-hand back to 2x the reorder level. */
function suggestedQty(qty: number, reorder: number): number {
  const target = reorder * 2;
  return Math.max(reorder - qty + Math.max(0, target - reorder), reorder - qty);
}

export function InventoryReorder() {
  const translate = useTranslate();
  const locale = useLocale();
  const chart = useChartTheme();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [windowDays, setWindowDays] = useState<number>(90);
  const [criticalOnly, setCriticalOnly] = useState(false);
  const [negativeOnly, setNegativeOnly] = useState(
    () => searchParams.get("scope") === "negative"
  );

  const products = useList<ProductRecord>({
    resource: "hub_inv_products",
    pagination: { mode: "server", currentPage: 1, pageSize: 500 },
    errorNotification: false,
    queryOptions: { retry: false },
  });
  const onHand = useOnHandBy("product_id");
  const sinceIso = useMemo(() => {
    const date = new Date();
    date.setHours(0, 0, 0, 0);
    date.setDate(date.getDate() - windowDays);
    return date.toISOString();
  }, [windowDays]);
  const outbound = useOutboundSince(sinceIso);
  const emptyValue = translate(
    "inventory.common.emptyValue",
    { ns: "starter" },
    "—"
  );
  const daysFormatter = useMemo(
    () =>
      new Intl.NumberFormat(locale, {
        minimumFractionDigits: 1,
        maximumFractionDigits: 1,
      }),
    [locale]
  );

  const rows = useMemo(() => {
    return products.result.data
      .filter((product) => product.status === "active")
      .map((product) => {
        const qty = onHand.totals.get(String(product.id)) ?? 0;
        const shipped = outbound.totals.get(String(product.id)) ?? 0;
        const dailyUse = shipped / windowDays;
        const daysOfCover = dailyUse > 0 ? qty / dailyUse : null;
        const reorder = Number(product.reorder_level ?? 0);
        const gap = reorder - qty;
        const urgency =
          qty <= 0 || (daysOfCover !== null && daysOfCover < 7)
            ? ("critical" as const)
            : ("warning" as const);
        const suggested = suggestedQty(qty, reorder);

        return {
          product,
          qty,
          shipped,
          dailyUse,
          daysOfCover,
          reorder,
          gap,
          suggested,
          estimatedCost: suggested * Number(product.unit_price ?? 0),
          urgency,
        };
      })
      .filter((row) => row.qty <= row.reorder)
      .sort((a, b) => {
        if (a.urgency !== b.urgency) {
          return a.urgency === "critical" ? -1 : 1;
        }
        if (a.daysOfCover === null || b.daysOfCover === null) {
          if (a.daysOfCover === null && b.daysOfCover !== null) return 1;
          if (a.daysOfCover !== null && b.daysOfCover === null) return -1;
        } else if (a.daysOfCover !== b.daysOfCover) {
          return a.daysOfCover - b.daysOfCover;
        }
        return b.gap - a.gap;
      });
  }, [onHand.totals, outbound.totals, products.result.data, windowDays]);

  const visibleRows = useMemo(
    () =>
      criticalOnly
        ? rows.filter((row) => row.urgency === "critical")
        : negativeOnly
          ? rows.filter((row) => row.qty < 0)
          : rows,
    [criticalOnly, negativeOnly, rows]
  );
  const summary = useMemo(
    () => ({
      critical: rows.filter((row) => row.urgency === "critical").length,
      negative: rows.filter((row) => row.qty < 0).length,
      units: rows.reduce((sum, row) => sum + row.suggested, 0),
      cost: rows.reduce((sum, row) => sum + row.estimatedCost, 0),
    }),
    [rows]
  );
  const tiles = useMemo<KpiTile[]>(
    () => [
      {
        key: "lines",
        label: translate(
          "inventory.reorder.kpi.lines",
          { ns: "starter" },
          "Lines to reorder"
        ),
        value: formatNumber(rows.length, locale),
        icon: PackageSearch,
        tone: "text-blue-600 bg-blue-500/12 dark:text-blue-400",
      },
      {
        key: "critical",
        label: translate(
          "inventory.reorder.kpi.critical",
          { ns: "starter" },
          "Critical"
        ),
        value: formatNumber(summary.critical, locale),
        icon: AlertTriangle,
        tone: "text-red-600 bg-red-500/12 dark:text-red-400",
        onClick: () => {
          setCriticalOnly((previous) => !previous);
          setNegativeOnly(false);
          setSearchParams({});
        },
        active: criticalOnly,
      },
      {
        key: "negative",
        label: translate(
          "inventory.reorder.kpi.negative",
          { ns: "starter" },
          "Negative stock"
        ),
        value: formatNumber(summary.negative, locale),
        icon: AlertTriangle,
        tone: "text-red-700 bg-red-500/15 dark:text-red-300",
        onClick: () => {
          const next = !negativeOnly;
          setNegativeOnly(next);
          setCriticalOnly(false);
          setSearchParams(next ? { scope: "negative" } : {});
        },
        active: negativeOnly,
      },
      {
        key: "units",
        label: translate(
          "inventory.reorder.kpi.units",
          { ns: "starter" },
          "Units to order"
        ),
        value: formatNumber(summary.units, locale),
        icon: Boxes,
        tone: "text-amber-600 bg-amber-500/12 dark:text-amber-400",
      },
      {
        key: "cost",
        label: translate(
          "inventory.reorder.kpi.cost",
          { ns: "starter" },
          "Cost to replenish"
        ),
        value: formatCurrency(summary.cost, locale),
        icon: DollarSign,
        tone: "text-emerald-600 bg-emerald-500/12 dark:text-emerald-400",
      },
    ],
    [
      criticalOnly,
      locale,
      negativeOnly,
      rows.length,
      setSearchParams,
      summary,
      translate,
    ]
  );
  const topGaps = useMemo(
    () => [...visibleRows].slice(0, 12).reverse(),
    [visibleRows]
  );

  const gapOption = useMemo(() => {
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

    return {
      grid: { left: 6, right: 16, top: 12, bottom: 8, containLabel: true },
      tooltip: {
        trigger: "axis",
        axisPointer: { type: "shadow" },
        ...tooltipBase,
      },
      xAxis: {
        type: "value",
        ...axisBase,
        axisLine: { show: false },
        splitLine: { lineStyle: { color: chart.grid } },
      },
      yAxis: {
        type: "category",
        data: topGaps.map((row) => row.product.name ?? emptyValue),
        ...axisBase,
      },
      series: [
        {
          type: "bar",
          barWidth: 12,
          data: topGaps.map((row) => ({
            value: row.gap,
            itemStyle: {
              color: chart.palette[0],
              borderRadius: [0, 4, 4, 0],
            },
          })),
        },
      ],
    };
  }, [chart, emptyValue, topGaps]);

  const isLoading =
    products.query.isLoading || onHand.isLoading || outbound.isLoading;
  const isError =
    products.query.isError || onHand.isError || outbound.isError;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-3xl font-semibold tracking-[-0.035em]">
            {translate("inventory.reorder.title", { ns: "starter" }, "Reorder")}
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
            {translate(
              "inventory.reorder.description",
              { ns: "starter" },
              "Products at or below their reorder level, with a suggested quantity to bring stock back up."
            )}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {WINDOWS.map((option) => (
            <button
              key={option.days}
              type="button"
              onClick={() => setWindowDays(option.days)}
              className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                windowDays === option.days
                  ? "border-primary/40 bg-primary/10 text-primary"
                  : "border-border/70 text-muted-foreground hover:bg-muted"
              }`}
            >
              {translate(option.i18nKey, { ns: "starter" }, option.label)}
            </button>
          ))}
          <Button
            variant="outline"
            size="sm"
            disabled={isLoading || visibleRows.length === 0}
            onClick={() =>
              exportCsv(
                "inventory-replenishment",
                [
                  {
                    header: translate(
                      "inventory.products.fields.sku",
                      { ns: "starter" },
                      "SKU"
                    ),
                    value: (row: (typeof rows)[number]) => row.product.sku,
                  },
                  {
                    header: translate(
                      "inventory.reorder.list.product",
                      { ns: "starter" },
                      "Product"
                    ),
                    value: (row) => row.product.name,
                  },
                  {
                    header: translate(
                      "inventory.reorder.list.category",
                      { ns: "starter" },
                      "Category"
                    ),
                    value: (row) =>
                      labelFor(CATEGORIES, row.product.category, translate),
                  },
                  {
                    header: translate(
                      "inventory.reorder.list.onHand",
                      { ns: "starter" },
                      "On hand"
                    ),
                    value: (row) => row.qty,
                  },
                  {
                    header: translate(
                      "inventory.reorder.list.reorderLevel",
                      { ns: "starter" },
                      "Reorder level"
                    ),
                    value: (row) => row.reorder,
                  },
                  {
                    header: translate(
                      "inventory.reorder.list.daysOfCover",
                      { ns: "starter" },
                      "Days of cover"
                    ),
                    value: (row) => row.daysOfCover?.toFixed(1),
                  },
                  {
                    header: translate(
                      "inventory.reorder.list.suggestedQty",
                      { ns: "starter" },
                      "Suggested qty"
                    ),
                    value: (row) => row.suggested,
                  },
                  {
                    header: translate(
                      "inventory.reorder.list.estimatedCost",
                      { ns: "starter" },
                      "Est. cost"
                    ),
                    value: (row) => row.estimatedCost,
                  },
                  {
                    header: translate(
                      "inventory.reorder.list.urgency",
                      { ns: "starter" },
                      "Urgency"
                    ),
                    value: (row) =>
                      row.urgency === "critical"
                        ? translate(
                            "inventory.reorder.urgency.critical",
                            { ns: "starter" },
                            "Critical"
                          )
                        : translate(
                            "inventory.reorder.urgency.warning",
                            { ns: "starter" },
                            "Warning"
                          ),
                  },
                ],
                visibleRows
              )
            }
          >
            {translate(
              "inventory.ops.exportCsv",
              { ns: "starter" },
              "Export CSV"
            )}
          </Button>
        </div>
      </div>

      <AsyncPanel i18nPrefix="inventory.ops"
        isLoading={isLoading}
        isError={isError}
        isEmpty={!isLoading && rows.length === 0}
        onRetry={() => {
          void products.query.refetch();
          void onHand.refetch();
          void outbound.refetch();
        }}
        emptyTitle={translate(
          "inventory.reorder.empty.title",
          { ns: "starter" },
          "No replenishment needed"
        )}
        emptyDescription={translate(
          "inventory.reorder.empty",
          { ns: "starter" },
          "Nothing to reorder — every active product is above its reorder level."
        )}
        skeletonRows={8}
      >
        <div className="flex flex-col gap-4">
          <KpiStrip tiles={tiles} />

          <Card>
            <CardHeader>
              <CardTitle>
                {translate(
                  "inventory.reorder.gapChart.title",
                  { ns: "starter" },
                  "Biggest reorder gaps"
                )}
              </CardTitle>
              <CardDescription>
                {translate(
                  "inventory.reorder.gapChart.description",
                  { ns: "starter" },
                  "How far each product's on-hand quantity is below its reorder level."
                )}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {topGaps.length === 0 ? (
                <p className="py-16 text-center text-sm text-muted-foreground">
                  {translate(
                    "inventory.reorder.filter.criticalEmpty",
                    { ns: "starter" },
                    "No critical lines in this worklist."
                  )}
                </p>
              ) : (
                <ReactECharts
                  key={`gap-${chart.isDark}-${windowDays}-${criticalOnly}`}
                  option={gapOption}
                  style={{ height: 320 }}
                  opts={{ renderer: "svg" }}
                />
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>
                {translate(
                  "inventory.reorder.list.title",
                  { ns: "starter" },
                  "Products to reorder"
                )}
              </CardTitle>
              <CardDescription>
                {translate(
                  "inventory.reorder.list.description",
                  { ns: "starter" },
                  "Click a row to open the product details."
                )}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {visibleRows.length === 0 ? (
                <p className="py-10 text-center text-sm text-muted-foreground">
                  {translate(
                    "inventory.reorder.filter.criticalEmpty",
                    { ns: "starter" },
                    "No critical lines in this worklist."
                  )}
                </p>
              ) : (
                <div className="overflow-x-auto rounded-lg border">
                  <table className="w-full min-w-max text-sm">
                    <thead>
                      <tr className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
                        <th className="px-3 py-2 font-medium">
                          {translate(
                            "inventory.reorder.list.product",
                            { ns: "starter" },
                            "Product"
                          )}
                        </th>
                        <th className="px-3 py-2 font-medium">
                          {translate(
                            "inventory.reorder.list.category",
                            { ns: "starter" },
                            "Category"
                          )}
                        </th>
                        <th className="px-3 py-2 text-right font-medium">
                          {translate(
                            "inventory.reorder.list.onHand",
                            { ns: "starter" },
                            "On hand"
                          )}
                        </th>
                        <th className="px-3 py-2 text-right font-medium">
                          {translate(
                            "inventory.reorder.list.reorderLevel",
                            { ns: "starter" },
                            "Reorder level"
                          )}
                        </th>
                        <th className="px-3 py-2 text-right font-medium">
                          {translate(
                            "inventory.reorder.list.daysOfCover",
                            { ns: "starter" },
                            "Days of cover"
                          )}
                        </th>
                        <th className="px-3 py-2 text-right font-medium">
                          {translate(
                            "inventory.reorder.list.suggestedQty",
                            { ns: "starter" },
                            "Suggested qty"
                          )}
                        </th>
                        <th className="px-3 py-2 text-right font-medium">
                          {translate(
                            "inventory.reorder.list.estimatedCost",
                            { ns: "starter" },
                            "Est. cost"
                          )}
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {visibleRows.map((row) => (
                        <tr
                          key={String(row.product.id)}
                          className="cursor-pointer hover:bg-accent"
                          onClick={() =>
                            navigate(
                              `${inventoryRoutes.products}/show/${row.product.id}`
                            )
                          }
                        >
                          <td className="px-3 py-2">
                            <p className="font-medium">
                              {row.product.name || emptyValue}
                            </p>
                            <p className="font-mono text-xs text-muted-foreground">
                              {row.product.sku || emptyValue}
                            </p>
                          </td>
                          <td className="px-3 py-2">
                            <EnumBadge
                              value={row.product.category}
                              label={labelFor(
                                CATEGORIES,
                                row.product.category,
                                translate
                              )}
                            />
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums text-red-600 dark:text-red-400">
                            {formatNumber(row.qty, locale)}
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                            {formatNumber(row.reorder, locale)}
                          </td>
                          <td
                            className={`px-3 py-2 text-right tabular-nums ${
                              row.daysOfCover === null
                                ? "text-muted-foreground"
                                : row.daysOfCover < 7
                                  ? "text-red-600 dark:text-red-400"
                                  : row.daysOfCover < 14
                                    ? "text-amber-600 dark:text-amber-400"
                                    : ""
                            }`}
                          >
                            {row.daysOfCover === null
                              ? emptyValue
                              : daysFormatter.format(row.daysOfCover)}
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums font-medium">
                            {formatNumber(row.suggested, locale)}
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums font-medium">
                            {formatCurrency(row.estimatedCost, locale)}
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
