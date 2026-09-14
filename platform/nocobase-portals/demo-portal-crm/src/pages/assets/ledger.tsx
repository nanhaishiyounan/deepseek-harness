import { useList, useTranslate } from "@refinedev/core";
import ReactECharts from "echarts-for-react";
import { Coins, PiggyBank, TrendingDown, Timer } from "lucide-react";
import { useMemo } from "react";
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
import { useChartTheme } from "@/pages/home/theme";
import {
  ASSET_CATEGORIES,
  ASSET_STATUSES,
  USEFUL_LIFE_MONTHS,
  depreciationFor,
  formatCurrency,
  formatDate,
  labelFor,
  statusBadgeClass,
} from "./constants";
import {
  AsyncPanel,
  KpiStrip,
  exportCsv,
  type KpiTile,
} from "@/lib/table-kit";
import { getAssetShowPath } from "./routes";
import { EmptyRow, Pill, SimpleTable, useLocale } from "./shared";
import type { AssetRecord } from "./types";

/**
 * The book-value view of the register: what the fleet cost, what it is worth
 * today, and which devices have run past their useful life. Depreciation is
 * straight-line over the per-category schedule in `constants.ts`.
 */
export function AssetLedger() {
  const translate = useTranslate();
  const locale = useLocale();
  const chart = useChartTheme();
  const navigate = useNavigate();

  const { result, query } = useList<AssetRecord>({
    resource: "hub_as_assets",
    pagination: { mode: "server", currentPage: 1, pageSize: 500 },
    errorNotification: false,
    queryOptions: { retry: false },
  });

  const analysis = useMemo(() => {
    const assets = result.data;
    let cost = 0;
    let netBookValue = 0;
    let accumulated = 0;
    let fullyDepreciated = 0;

    const byCategory = new Map<string, { cost: number; nbv: number; count: number }>();
    const byStatusValue = new Map<string, number>();
    const byYear = new Map<string, number>();

    for (const asset of assets) {
      const assetCost = Number(asset.value ?? 0);
      const depreciation = depreciationFor(asset);
      const nbv = depreciation ? depreciation.netBookValue : assetCost;

      cost += assetCost;
      netBookValue += nbv;
      accumulated += depreciation?.accumulated ?? 0;
      if (depreciation?.isFullyDepreciated) fullyDepreciated += 1;

      const category = asset.category ?? "other";
      const bucket = byCategory.get(category) ?? { cost: 0, nbv: 0, count: 0 };
      bucket.cost += assetCost;
      bucket.nbv += nbv;
      bucket.count += 1;
      byCategory.set(category, bucket);

      const status = asset.status ?? "in_stock";
      byStatusValue.set(status, (byStatusValue.get(status) ?? 0) + nbv);

      if (asset.purchase_date) {
        const year = String(asset.purchase_date).slice(0, 4);
        byYear.set(year, (byYear.get(year) ?? 0) + assetCost);
      }
    }

    // Refresh candidates: past their useful life, most over-run first.
    const refreshCandidates = assets
      .map((asset) => ({ asset, depreciation: depreciationFor(asset) }))
      .filter(
        (entry) =>
          entry.depreciation?.isFullyDepreciated && entry.asset.status !== "retired"
      )
      .sort(
        (a, b) =>
          (b.depreciation?.monthsInService ?? 0) - (a.depreciation?.monthsInService ?? 0)
      )
      .slice(0, 12);

    return {
      assets,
      cost,
      netBookValue,
      accumulated,
      fullyDepreciated,
      categoryRows: ASSET_CATEGORIES.map((category) => ({
        value: category.value,
        label: labelFor(ASSET_CATEGORIES, category.value, translate),
        ...(byCategory.get(category.value) ?? { cost: 0, nbv: 0, count: 0 }),
      })),
      statusRows: ASSET_STATUSES.map((status) => ({
        value: status.value,
        label: labelFor(ASSET_STATUSES, status.value, translate),
        nbv: byStatusValue.get(status.value) ?? 0,
      })),
      yearRows: [...byYear.entries()].sort((a, b) => a[0].localeCompare(b[0])),
      refreshCandidates,
    };
  }, [result.data, translate]);

  const tiles = useMemo<KpiTile[]>(
    () => [
      {
        key: "cost",
        label: translate("assets.ledger.kpi.cost", { ns: "starter" }, "Acquisition cost"),
        value: formatCurrency(analysis.cost, locale),
        hint: translate(
          "assets.ledger.kpi.cost.hint",
          { ns: "starter" },
          "{{count}} devices on the register"
        ).replace("{{count}}", String(analysis.assets.length)),
        icon: Coins,
        tone: "text-blue-600 bg-blue-500/12 dark:text-blue-400",
      },
      {
        key: "nbv",
        label: translate("assets.ledger.kpi.nbv", { ns: "starter" }, "Net book value"),
        value: formatCurrency(analysis.netBookValue, locale),
        hint: translate(
          "assets.ledger.kpi.nbv.hint",
          { ns: "starter" },
          "After straight-line depreciation"
        ),
        icon: PiggyBank,
        tone: "text-teal-600 bg-teal-500/12 dark:text-teal-400",
      },
      {
        key: "accumulated",
        label: translate(
          "assets.ledger.kpi.accumulated",
          { ns: "starter" },
          "Accumulated depreciation"
        ),
        value: formatCurrency(analysis.accumulated, locale),
        hint: translate(
          "assets.ledger.kpi.accumulated.hint",
          { ns: "starter" },
          "{{percent}}% of acquisition cost"
        ).replace(
          "{{percent}}",
          analysis.cost > 0
            ? String(Math.round((analysis.accumulated / analysis.cost) * 100))
            : "0"
        ),
        icon: TrendingDown,
        tone: "text-amber-600 bg-amber-500/12 dark:text-amber-400",
      },
      {
        key: "refresh",
        label: translate("assets.ledger.kpi.refresh", { ns: "starter" }, "Refresh candidates"),
        value: String(analysis.fullyDepreciated),
        hint: translate(
          "assets.ledger.kpi.refresh.hint",
          { ns: "starter" },
          "Past their useful life"
        ),
        icon: Timer,
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

  const categoryOption = {
    color: chart.palette,
    grid: { left: 6, right: 12, top: 32, bottom: 8, containLabel: true },
    tooltip: { trigger: "axis", ...tooltipBase },
    legend: { top: 0, textStyle: { color: chart.axis, fontSize: 12 } },
    xAxis: {
      type: "category",
      data: analysis.categoryRows.map((row) => row.label),
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
        name: translate("assets.ledger.series.cost", { ns: "starter" }, "Acquisition cost"),
        type: "bar",
        data: analysis.categoryRows.map((row) => Math.round(row.cost)),
        barWidth: 18,
        itemStyle: { borderRadius: [4, 4, 0, 0] },
      },
      {
        name: translate("assets.ledger.series.nbv", { ns: "starter" }, "Net book value"),
        type: "bar",
        data: analysis.categoryRows.map((row) => Math.round(row.nbv)),
        barWidth: 18,
        itemStyle: { borderRadius: [4, 4, 0, 0] },
      },
    ],
  };

  const yearOption = {
    color: [chart.palette[0]],
    grid: { left: 6, right: 12, top: 16, bottom: 8, containLabel: true },
    tooltip: { trigger: "axis", ...tooltipBase },
    xAxis: {
      type: "category",
      data: analysis.yearRows.map(([year]) => year),
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
        name: translate("assets.ledger.series.spend", { ns: "starter" }, "Capital spend"),
        type: "line",
        smooth: true,
        areaStyle: { opacity: 0.12 },
        symbolSize: 6,
        data: analysis.yearRows.map(([, value]) => Math.round(value)),
      },
    ],
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <div className="flex items-center text-muted-foreground">
          <Breadcrumb />
        </div>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-3xl font-semibold tracking-[-0.035em]">
              {translate("assets.ledger.title", { ns: "starter" }, "Asset ledger")}
            </h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
              {translate(
                "assets.ledger.description",
                { ns: "starter" },
                "Book value, accumulated depreciation and refresh exposure across the register."
              )}
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              exportCsv<AssetRecord>(
                "asset-ledger",
                [
                  { header: "Tag", value: (row) => row.tag },
                  { header: "Name", value: (row) => row.name },
                  { header: "Category", value: (row) => labelFor(ASSET_CATEGORIES, row.category) },
                  { header: "Status", value: (row) => labelFor(ASSET_STATUSES, row.status) },
                  { header: "Purchase date", value: (row) => row.purchase_date?.slice(0, 10) },
                  { header: "Acquisition cost", value: (row) => row.value ?? 0 },
                  {
                    header: "Useful life (months)",
                    value: (row) => USEFUL_LIFE_MONTHS[row.category ?? "other"] ?? 48,
                  },
                  {
                    header: "Accumulated depreciation",
                    value: (row) => Math.round(depreciationFor(row)?.accumulated ?? 0),
                  },
                  {
                    header: "Net book value",
                    value: (row) =>
                      Math.round(depreciationFor(row)?.netBookValue ?? Number(row.value ?? 0)),
                  },
                ],
                analysis.assets
              )
            }
          >
            {translate("assets.ops.exportCsv", { ns: "starter" }, "Export CSV")}
          </Button>
        </div>
      </div>

      <AsyncPanel i18nPrefix="assets.ops"
        isLoading={query.isLoading}
        isError={query.isError}
        isEmpty={!query.isLoading && analysis.assets.length === 0}
        onRetry={() => void query.refetch()}
        emptyTitle={translate(
          "assets.ledger.empty.title",
          { ns: "starter" },
          "Nothing on the register yet"
        )}
        emptyDescription={translate(
          "assets.ledger.empty.description",
          { ns: "starter" },
          "Add assets to see book value and depreciation."
        )}
        skeletonRows={6}
      >
        <div className="flex flex-col gap-4">
          <KpiStrip tiles={tiles} />

          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>
                  {translate("assets.ledger.byCategory.title", { ns: "starter" }, "Cost vs book value")}
                </CardTitle>
                <CardDescription>
                  {translate(
                    "assets.ledger.byCategory.description",
                    { ns: "starter" },
                    "How much value each device class still carries."
                  )}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ReactECharts
                  key={`ledger-cat-${chart.isDark}`}
                  option={categoryOption}
                  style={{ height: 260 }}
                  opts={{ renderer: "svg" }}
                />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>
                  {translate("assets.ledger.byYear.title", { ns: "starter" }, "Capital spend by year")}
                </CardTitle>
                <CardDescription>
                  {translate(
                    "assets.ledger.byYear.description",
                    { ns: "starter" },
                    "Acquisition cost of everything purchased in each year."
                  )}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ReactECharts
                  key={`ledger-year-${chart.isDark}`}
                  option={yearOption}
                  style={{ height: 260 }}
                  opts={{ renderer: "svg" }}
                />
              </CardContent>
            </Card>
          </div>

          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>
                  {translate("assets.ledger.categoryTable.title", { ns: "starter" }, "Ledger by category")}
                </CardTitle>
                <CardDescription>
                  {translate(
                    "assets.ledger.categoryTable.description",
                    { ns: "starter" },
                    "Depreciation schedule and remaining value per class."
                  )}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <SimpleTable
                  headers={[
                    translate("assets.assets.fields.category", { ns: "starter" }, "Category"),
                    translate("assets.ledger.headers.count", { ns: "starter" }, "Units"),
                    translate("assets.ledger.headers.life", { ns: "starter" }, "Life"),
                    translate("assets.ledger.headers.cost", { ns: "starter" }, "Cost"),
                    translate("assets.ledger.headers.nbv", { ns: "starter" }, "Book value"),
                  ]}
                >
                  {analysis.categoryRows.map((row) => (
                    <tr key={row.value}>
                      <td className="px-3 py-2 font-medium">{row.label}</td>
                      <td className="px-3 py-2 tabular-nums">{row.count}</td>
                      <td className="px-3 py-2 tabular-nums text-muted-foreground">
                        {`${USEFUL_LIFE_MONTHS[row.value] ?? 48}m`}
                      </td>
                      <td className="px-3 py-2 tabular-nums">
                        {formatCurrency(row.cost, locale)}
                      </td>
                      <td className="px-3 py-2 tabular-nums">
                        {formatCurrency(row.nbv, locale)}
                      </td>
                    </tr>
                  ))}
                </SimpleTable>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>
                  {translate("assets.ledger.refresh.title", { ns: "starter" }, "Refresh candidates")}
                </CardTitle>
                <CardDescription>
                  {translate(
                    "assets.ledger.refresh.description",
                    { ns: "starter" },
                    "Devices past their useful life that are still in service."
                  )}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <SimpleTable
                  headers={[
                    translate("assets.assets.fields.name", { ns: "starter" }, "Name"),
                    translate("assets.assets.fields.status", { ns: "starter" }, "Status"),
                    translate("assets.assets.fields.purchased", { ns: "starter" }, "Purchased"),
                    translate("assets.ledger.headers.overrun", { ns: "starter" }, "Over life by"),
                  ]}
                >
                  {analysis.refreshCandidates.length === 0 ? (
                    <EmptyRow
                      colSpan={4}
                      text={translate(
                        "assets.ledger.refresh.empty",
                        { ns: "starter" },
                        "Nothing is past its useful life."
                      )}
                    />
                  ) : (
                    analysis.refreshCandidates.map(({ asset, depreciation }) => (
                      <tr
                        key={String(asset.id)}
                        className="cursor-pointer hover:bg-muted/40"
                        onClick={() => navigate(getAssetShowPath(asset.id))}
                      >
                        <td className="px-3 py-2">
                          <div className="flex flex-col">
                            <span className="font-medium">{asset.name || "—"}</span>
                            <span className="font-mono text-xs text-muted-foreground">
                              {asset.tag || ""}
                            </span>
                          </div>
                        </td>
                        <td className="px-3 py-2">
                          <Pill
                            label={labelFor(ASSET_STATUSES, asset.status ?? "in_stock", translate)}
                            className={statusBadgeClass(asset.status ?? "in_stock")}
                          />
                        </td>
                        <td className="px-3 py-2 whitespace-nowrap">
                          {formatDate(asset.purchase_date, locale)}
                        </td>
                        <td className="px-3 py-2 tabular-nums text-destructive">
                          {`${Math.max(
                            0,
                            (depreciation?.monthsInService ?? 0) -
                              (depreciation?.usefulLifeMonths ?? 0)
                          )}m`}
                        </td>
                      </tr>
                    ))
                  )}
                </SimpleTable>
              </CardContent>
            </Card>
          </div>
        </div>
      </AsyncPanel>
    </div>
  );
}
