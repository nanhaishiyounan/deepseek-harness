import { useTranslate } from "@refinedev/core";
import ReactECharts from "echarts-for-react";
import { Boxes, PackageCheck, ShieldCheck, Wrench } from "lucide-react";
import { useMemo } from "react";
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
  formatCurrency,
  labelFor,
} from "../constants";
import { KpiStrip, type KpiTile } from "@/lib/table-kit";
import type { AssetRecord } from "../types";

type AssetsKpiProps = {
  assets: AssetRecord[];
  locale: string;
  /** Currently applied status filter, so the matching tile reads as selected. */
  activeStatus?: string;
  onSelectStatus?: (status: string) => void;
};

export function AssetsKpi({
  assets,
  locale,
  activeStatus,
  onSelectStatus,
}: AssetsKpiProps) {
  const translate = useTranslate();
  const chart = useChartTheme();

  const { tiles, statusData, categoryData } = useMemo(() => {
    const byStatus: Record<string, number> = {};
    const byCategory: Record<string, number> = {};
    let totalValue = 0;
    for (const asset of assets) {
      const status = asset.status ?? "in_stock";
      const category = asset.category ?? "other";
      byStatus[status] = (byStatus[status] ?? 0) + 1;
      byCategory[category] = (byCategory[category] ?? 0) + 1;
      totalValue += Number(asset.value ?? 0);
    }

    const statusData = ASSET_STATUSES.map((status) => ({
      name: labelFor(ASSET_STATUSES, status.value, translate),
      value: byStatus[status.value] ?? 0,
      statusValue: status.value,
    })).filter((item) => item.value > 0);

    const categoryData = ASSET_CATEGORIES.map((category) => ({
      name: labelFor(ASSET_CATEGORIES, category.value, translate),
      value: byCategory[category.value] ?? 0,
    }));

    const tiles: KpiTile[] = [
      {
        key: "total",
        label: translate("assets.kpi.totalAssets", { ns: "starter" }, "Total assets"),
        value: String(assets.length),
        hint: translate(
          "assets.kpi.totalAssets.hint",
          { ns: "starter" },
          "{{value}} book value"
        ).replace("{{value}}", formatCurrency(totalValue, locale)),
        icon: Boxes,
        tone: "text-blue-600 bg-blue-500/12 dark:text-blue-400",
      },
      {
        key: "assigned",
        label: translate("assets.kpi.assigned", { ns: "starter" }, "Assigned"),
        value: String(byStatus["assigned"] ?? 0),
        hint: translate("assets.kpi.assigned.hint", { ns: "starter" }, "In use by staff"),
        icon: ShieldCheck,
        tone: "text-sky-600 bg-sky-500/12 dark:text-sky-400",
        onClick: onSelectStatus ? () => onSelectStatus("assigned") : undefined,
        active: activeStatus === "assigned",
      },
      {
        key: "in_stock",
        label: translate("assets.kpi.inStock", { ns: "starter" }, "In stock"),
        value: String(byStatus["in_stock"] ?? 0),
        hint: translate("assets.kpi.inStock.hint", { ns: "starter" }, "Ready to assign"),
        icon: PackageCheck,
        tone: "text-teal-600 bg-teal-500/12 dark:text-teal-400",
        onClick: onSelectStatus ? () => onSelectStatus("in_stock") : undefined,
        active: activeStatus === "in_stock",
      },
      {
        key: "repair",
        label: translate("assets.kpi.inRepair", { ns: "starter" }, "In repair"),
        value: String(byStatus["repair"] ?? 0),
        hint: translate("assets.kpi.inRepair.hint", { ns: "starter" }, "Out for service"),
        icon: Wrench,
        tone: "text-amber-600 bg-amber-500/12 dark:text-amber-400",
        onClick: onSelectStatus ? () => onSelectStatus("repair") : undefined,
        active: activeStatus === "repair",
      },
    ];

    return { tiles, statusData, categoryData };
  }, [activeStatus, assets, locale, onSelectStatus, translate]);

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

  const statusOption = {
    color: chart.palette,
    tooltip: { trigger: "item", ...tooltipBase },
    legend: {
      orient: "vertical",
      right: 0,
      top: "center",
      icon: "circle",
      itemWidth: 8,
      itemHeight: 8,
      itemGap: 10,
      textStyle: { color: chart.axis, fontSize: 12 },
    },
    series: [
      {
        type: "pie",
        radius: ["58%", "82%"],
        center: ["32%", "50%"],
        avoidLabelOverlap: false,
        padAngle: 2,
        itemStyle: { borderRadius: 6 },
        label: { show: false },
        labelLine: { show: false },
        data: statusData,
      },
    ],
  };

  const categoryOption = {
    color: [chart.palette[0]],
    grid: { left: 6, right: 12, top: 16, bottom: 8, containLabel: true },
    tooltip: { trigger: "axis", ...tooltipBase },
    xAxis: { type: "category", data: categoryData.map((d) => d.name), ...axisBase },
    yAxis: {
      type: "value",
      ...axisBase,
      axisLine: { show: false },
      splitLine: { lineStyle: { color: chart.grid } },
      minInterval: 1,
    },
    series: [
      {
        name: translate("assets.charts.seriesAssets", { ns: "starter" }, "Assets"),
        type: "bar",
        data: categoryData.map((d) => d.value),
        barWidth: 26,
        itemStyle: { borderRadius: [4, 4, 0, 0] },
      },
    ],
  };

  return (
    <div className="flex flex-col gap-4">
      <KpiStrip tiles={tiles} />

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>
              {translate("assets.charts.byStatus.title", { ns: "starter" }, "By status")}
            </CardTitle>
            <CardDescription>
              {translate(
                "assets.charts.byStatus.description",
                { ns: "starter" },
                "Where every device sits right now."
              )}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ReactECharts
              key={`as-status-${chart.isDark}`}
              option={statusOption}
              style={{ height: 240 }}
              opts={{ renderer: "svg" }}
              onEvents={{
                // Slice click drills the table down to that lifecycle state.
                click: (params: { data?: { statusValue?: string } }) => {
                  const value = params.data?.statusValue;
                  if (value) onSelectStatus?.(value);
                },
              }}
            />
          </CardContent>
        </Card>

        <Card className="xl:col-span-2">
          <CardHeader>
            <CardTitle>
              {translate("assets.charts.byCategory.title", { ns: "starter" }, "By category")}
            </CardTitle>
            <CardDescription>
              {translate(
                "assets.charts.byCategory.description",
                { ns: "starter" },
                "Inventory mix across device types."
              )}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ReactECharts
              key={`as-cat-${chart.isDark}`}
              option={categoryOption}
              style={{ height: 240 }}
              opts={{ renderer: "svg" }}
            />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
