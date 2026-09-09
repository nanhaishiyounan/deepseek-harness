import { useList, useTranslate } from "@refinedev/core";
import ReactECharts from "echarts-for-react";
import { Gauge, PackageX, Repeat, Snowflake } from "lucide-react";
import { useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { Breadcrumb } from "@/components/app-shell/breadcrumb";
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
  { days: 30, i18nKey: "inventory.turnover.window.30", label: "30 days" },
  { days: 90, i18nKey: "inventory.turnover.window.90", label: "90 days" },
  { days: 180, i18nKey: "inventory.turnover.window.180", label: "180 days" },
] as const;

const sinceIso = (days: number) => {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() - days);
  return date.toISOString();
};

/**
 * Turnover and dead-stock analysis. Turnover is outbound units in the window
 * divided by units on hand — the "how many times did this shelf empty" ratio.
 * Anything with stock and zero outbound in the window is dead stock.
 */
export function InventoryTurnover() {
  const translate = useTranslate();
  const locale = useLocale();
  const chart = useChartTheme();
  const navigate = useNavigate();
  const [windowDays, setWindowDays] = useState<number>(90);

  const products = useList<ProductRecord>({
    resource: "hub_inv_products",
    pagination: { mode: "server", currentPage: 1, pageSize: 500 },
    errorNotification: false,
    queryOptions: { retry: false },
  });

  const onHand = useOnHandBy("product_id");
  const outbound = useOutboundSince(useMemo(() => sinceIso(windowDays), [windowDays]));

  const analysis = useMemo(() => {
    const rows = products.result.data.map((product) => {
      const qty = onHand.totals.get(String(product.id)) ?? 0;
      const shipped = outbound.totals.get(String(product.id)) ?? 0;
      const unitPrice = Number(product.unit_price ?? 0);
      // Ratio against on-hand; with no stock left the shipped units are the
      // whole story, so the denominator falls back to the shipped volume.
      const denominator = qty > 0 ? qty : shipped;
      return {
        product,
        qty,
        shipped,
        stockValue: qty * unitPrice,
        shippedValue: shipped * unitPrice,
        turnover: denominator > 0 ? shipped / denominator : 0,
        isDead: qty > 0 && shipped === 0,
      };
    });

    const dead = rows
      .filter((row) => row.isDead)
      .sort((a, b) => b.stockValue - a.stockValue);
    const fastest = [...rows]
      .filter((row) => row.shipped > 0)
      .sort((a, b) => b.turnover - a.turnover)
      .slice(0, 12);

    return {
      rows,
      dead,
      fastest,
      deadValue: dead.reduce((sum, row) => sum + row.stockValue, 0),
      stockValue: rows.reduce((sum, row) => sum + row.stockValue, 0),
      shippedUnits: rows.reduce((sum, row) => sum + row.shipped, 0),
      averageTurnover:
        rows.length === 0
          ? 0
          : rows.reduce((sum, row) => sum + row.turnover, 0) / rows.length,
    };
  }, [onHand.totals, outbound.totals, products.result.data]);

  const tiles = useMemo<KpiTile[]>(
    () => [
      {
        key: "turnover",
        label: translate("inventory.turnover.kpi.ratio", { ns: "starter" }, "Average turnover"),
        value: analysis.averageTurnover.toFixed(2),
        hint: translate(
          "inventory.turnover.kpi.ratio.hint",
          { ns: "starter" },
          "Outbound units per unit held"
        ),
        icon: Repeat,
        tone: "text-blue-600 bg-blue-500/12 dark:text-blue-400",
      },
      {
        key: "shipped",
        label: translate("inventory.turnover.kpi.shipped", { ns: "starter" }, "Units shipped"),
        value: formatNumber(analysis.shippedUnits, locale),
        hint: translate(
          "inventory.turnover.kpi.shipped.hint",
          { ns: "starter" },
          "In the selected window"
        ),
        icon: Gauge,
        tone: "text-teal-600 bg-teal-500/12 dark:text-teal-400",
      },
      {
        key: "dead",
        label: translate("inventory.turnover.kpi.dead", { ns: "starter" }, "Dead SKUs"),
        value: String(analysis.dead.length),
        hint: translate(
          "inventory.turnover.kpi.dead.hint",
          { ns: "starter" },
          "Stock on hand, nothing shipped"
        ),
        icon: Snowflake,
        tone: "text-amber-600 bg-amber-500/12 dark:text-amber-400",
      },
      {
        key: "deadValue",
        label: translate("inventory.turnover.kpi.deadValue", { ns: "starter" }, "Capital tied up"),
        value: formatCurrency(analysis.deadValue, locale),
        hint: translate(
          "inventory.turnover.kpi.deadValue.hint",
          { ns: "starter" },
          "{{percent}}% of total stock value"
        ).replace(
          "{{percent}}",
          analysis.stockValue > 0
            ? String(Math.round((analysis.deadValue / analysis.stockValue) * 100))
            : "0"
        ),
        icon: PackageX,
        tone: "text-red-600 bg-red-500/12 dark:text-red-400",
      },
    ],
    [analysis, locale, translate]
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
    padding: [8, 12],
  };

  const fastestOption = {
    grid: { left: 6, right: 24, top: 12, bottom: 8, containLabel: true },
    tooltip: { trigger: "axis", axisPointer: { type: "shadow" }, ...tooltipBase },
    xAxis: {
      type: "value",
      ...axisBase,
      axisLine: { show: false },
      splitLine: { lineStyle: { color: chart.grid } },
    },
    yAxis: {
      type: "category",
      data: [...analysis.fastest].reverse().map((row) => row.product.name ?? "—"),
      ...axisBase,
    },
    series: [
      {
        type: "bar",
        barWidth: 12,
        data: [...analysis.fastest]
          .reverse()
          .map((row) => Number(row.turnover.toFixed(2))),
        itemStyle: { color: chart.palette[0], borderRadius: [0, 4, 4, 0] },
      },
    ],
  };

  const isLoading =
    products.query.isLoading || onHand.isLoading || outbound.isLoading;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <div className="flex items-center text-muted-foreground">
          <Breadcrumb />
        </div>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-3xl font-semibold tracking-[-0.035em]">
              {translate("inventory.turnover.title", { ns: "starter" }, "Turnover & dead stock")}
            </h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
              {translate(
                "inventory.turnover.description",
                { ns: "starter" },
                "Which SKUs move, which sit still, and how much capital the slow ones tie up."
              )}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            {WINDOWS.map((option) => (
              <button
                key={option.days}
                type="button"
                onClick={() => setWindowDays(option.days)}
                className={cn(
                  "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                  windowDays === option.days
                    ? "border-primary/40 bg-primary/10 text-primary"
                    : "border-border/70 text-muted-foreground hover:bg-muted"
                )}
              >
                {translate(option.i18nKey, { ns: "starter" }, option.label)}
              </button>
            ))}
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                exportCsv(
                  "inventory-turnover",
                  [
                    { header: "SKU", value: (row: (typeof analysis.rows)[number]) => row.product.sku },
                    { header: "Product", value: (row) => row.product.name },
                    { header: "Category", value: (row) => labelFor(CATEGORIES, row.product.category) },
                    { header: "On hand", value: (row) => row.qty },
                    { header: `Shipped (${windowDays}d)`, value: (row) => row.shipped },
                    { header: "Turnover", value: (row) => row.turnover.toFixed(2) },
                    { header: "Stock value", value: (row) => Math.round(row.stockValue) },
                    { header: "Dead stock", value: (row) => (row.isDead ? "yes" : "no") },
                  ],
                  analysis.rows
                )
              }
            >
              {translate("inventory.ops.exportCsv", { ns: "starter" }, "Export CSV")}
            </Button>
          </div>
        </div>
      </div>

      <AsyncPanel i18nPrefix="inventory.ops"
        isLoading={isLoading}
        isError={products.query.isError || onHand.isError || outbound.isError}
        isEmpty={!isLoading && analysis.rows.length === 0}
        onRetry={() => {
          void products.query.refetch();
          void outbound.refetch();
        }}
        emptyTitle={translate(
          "inventory.turnover.empty.title",
          { ns: "starter" },
          "No catalog data"
        )}
        skeletonRows={8}
      >
        <div className="flex flex-col gap-4">
          <KpiStrip tiles={tiles} />

          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>
                  {translate("inventory.turnover.fastest.title", { ns: "starter" }, "Fastest movers")}
                </CardTitle>
                <CardDescription>
                  {translate(
                    "inventory.turnover.fastest.description",
                    { ns: "starter" },
                    "Highest outbound-to-stock ratio in the selected window."
                  )}
                </CardDescription>
              </CardHeader>
              <CardContent>
                {analysis.fastest.length === 0 ? (
                  <p className="py-16 text-center text-sm text-muted-foreground">
                    {translate(
                      "inventory.turnover.fastest.empty",
                      { ns: "starter" },
                      "Nothing shipped in this window."
                    )}
                  </p>
                ) : (
                  <ReactECharts
                    key={`turnover-${chart.isDark}-${windowDays}`}
                    option={fastestOption}
                    style={{ height: 320 }}
                    opts={{ renderer: "svg" }}
                  />
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>
                  {translate("inventory.turnover.dead.title", { ns: "starter" }, "Dead stock")}
                </CardTitle>
                <CardDescription>
                  {translate(
                    "inventory.turnover.dead.description",
                    { ns: "starter" },
                    "Stock on the shelf with no outbound movement in the window."
                  )}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="max-h-80 overflow-y-auto rounded-lg border">
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 bg-muted/40">
                      <tr className="border-b text-left text-xs text-muted-foreground">
                        <th className="px-3 py-2 font-medium">
                          {translate("inventory.reorder.list.product", { ns: "starter" }, "Product")}
                        </th>
                        <th className="px-3 py-2 font-medium">
                          {translate("inventory.reorder.list.category", { ns: "starter" }, "Category")}
                        </th>
                        <th className="px-3 py-2 text-right font-medium">
                          {translate("inventory.reorder.list.onHand", { ns: "starter" }, "On hand")}
                        </th>
                        <th className="px-3 py-2 text-right font-medium">
                          {translate("inventory.matrix.headers.value", { ns: "starter" }, "Value")}
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {analysis.dead.length === 0 ? (
                        <tr>
                          <td
                            colSpan={4}
                            className="px-3 py-10 text-center text-muted-foreground"
                          >
                            {translate(
                              "inventory.turnover.dead.empty",
                              { ns: "starter" },
                              "Everything on the shelf moved in this window."
                            )}
                          </td>
                        </tr>
                      ) : (
                        analysis.dead.map((row) => (
                          <tr
                            key={String(row.product.id)}
                            className="cursor-pointer hover:bg-accent"
                            onClick={() =>
                              navigate(`${inventoryRoutes.products}/show/${row.product.id}`)
                            }
                          >
                            <td className="px-3 py-2">
                              <p className="font-medium">{row.product.name || "—"}</p>
                              <p className="font-mono text-xs text-muted-foreground">
                                {row.product.sku || "—"}
                              </p>
                            </td>
                            <td className="px-3 py-2">
                              <EnumBadge
                                value={row.product.category}
                                label={labelFor(CATEGORIES, row.product.category, translate)}
                              />
                            </td>
                            <td className="px-3 py-2 text-right tabular-nums">
                              {formatNumber(row.qty, locale)}
                            </td>
                            <td className="px-3 py-2 text-right tabular-nums font-medium">
                              {formatCurrency(row.stockValue, locale)}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </AsyncPanel>
    </div>
  );
}
