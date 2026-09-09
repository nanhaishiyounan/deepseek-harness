import { useNotification, useTranslate, useUpdate } from "@refinedev/core";
import ReactECharts from "echarts-for-react";
import {
  AlertTriangle,
  CalendarClock,
  Columns3,
  Download,
  LayoutGrid,
  Percent,
  RefreshCcw,
  Rows3,
  Search,
  Table2,
  TrendingUp,
  Wallet,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router";
import { ListView } from "@/components/resources/views/list-view";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Skeleton } from "@/components/ui/skeleton";
import { useChartTheme } from "@/pages/home/theme";
import { cn } from "@/lib/utils";
import {
  DEAL_STAGES,
  canTransition,
  formatCurrency,
  formatCurrencyCompact,
  labelFor,
  nextStages,
} from "../constants";
import { BulkBar, downloadCsv, toCsv, type GridColumn } from "../grid";
import { publishVisibleIds } from "../record-nav";
import { useOpenContextualChild } from "../route-surfaces";
import {
  useCurrentUserId,
  useLocale,
  useOwnerOptions,
  userLabel,
} from "../shared";
import { PipelineBoard } from "./board";
import { DealTable } from "./table";
import { STALE_THRESHOLD_DAYS, useDealData, type EnrichedDeal } from "./use-deal-data";

type QuickFilter = "mine" | "closingSoon" | "needsAttention" | "overdue";

export function PipelinePage() {
  const translate = useTranslate();
  const locale = useLocale();
  const chart = useChartTheme();
  const openChild = useOpenContextualChild();
  const currentUserId = useCurrentUserId();
  const ownerOptions = useOwnerOptions();
  const { open: notify } = useNotification();
  const { mutate: updateDeal } = useUpdate();
  const { deals, isLoading, isError, isFetching, refetch } = useDealData();

  const [searchParams, setSearchParams] = useSearchParams();
  const mode = searchParams.get("tab") === "table" ? "table" : "board";
  const setMode = (next: "board" | "table") => {
    const params = new URLSearchParams(searchParams);
    params.set("tab", next);
    setSearchParams(params, { replace: true });
  };

  // Seeded from the URL so Forecast and Home can deep-link into a narrowed
  // pipeline (?owner=12&stage=negotiation&flag=needsAttention).
  const [search, setSearch] = useState("");
  const [owners, setOwners] = useState<string[]>(() =>
    searchParams.getAll("owner")
  );
  const [stages, setStages] = useState<string[]>(() =>
    searchParams.getAll("stage")
  );
  const [quick, setQuick] = useState<QuickFilter[]>(
    () => searchParams.getAll("flag") as QuickFilter[]
  );
  const [density, setDensity] = useState<"compact" | "comfortable">(
    "comfortable"
  );
  const [selected, setSelected] = useState<Array<string | number>>([]);

  const toggleQuick = (filter: QuickFilter) =>
    setQuick((current) =>
      current.includes(filter)
        ? current.filter((value) => value !== filter)
        : [...current, filter]
    );

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return deals.filter((deal) => {
      if (
        term &&
        !`${deal.title ?? ""} ${deal.account?.name ?? ""}`
          .toLowerCase()
          .includes(term)
      )
        return false;
      if (owners.length > 0 && !owners.includes(String(deal.owner_id ?? "")))
        return false;
      if (stages.length > 0 && !stages.includes(deal.stage ?? "inquiry"))
        return false;
      if (quick.includes("mine") && String(deal.owner_id ?? "") !== currentUserId)
        return false;
      if (
        quick.includes("closingSoon") &&
        !(deal.isOpen && deal.daysToClose !== null && deal.daysToClose >= 0 && deal.daysToClose <= 30)
      )
        return false;
      if (quick.includes("needsAttention") && !deal.isStale) return false;
      if (quick.includes("overdue") && !deal.isOverdue) return false;
      return true;
    });
  }, [deals, search, owners, stages, quick, currentUserId]);

  useEffect(() => {
    publishVisibleIds(
      "deals",
      filtered.map((deal) => deal.id)
    );
  }, [filtered]);

  const stats = useMemo(() => {
    const open = filtered.filter((deal) => deal.isOpen);
    const won = filtered.filter((deal) => deal.stage === "won");
    const lost = filtered.filter((deal) => deal.stage === "lost");
    const decided = won.length + lost.length;
    const sum = (list: EnrichedDeal[]) =>
      list.reduce((total, deal) => total + Number(deal.amount ?? 0), 0);
    return {
      pipelineValue: sum(open),
      weighted: open.reduce((total, deal) => total + deal.weighted, 0),
      openCount: open.length,
      wonValue: sum(won),
      winRate: decided === 0 ? 0 : Math.round((won.length / decided) * 100),
      stale: filtered.filter((deal) => deal.isStale).length,
      overdue: filtered.filter((deal) => deal.isOverdue).length,
      closingSoon: open.filter(
        (deal) =>
          deal.daysToClose !== null &&
          deal.daysToClose >= 0 &&
          deal.daysToClose <= 30
      ).length,
    };
  }, [filtered]);

  const chartOption = useMemo(() => {
    const labels = DEAL_STAGES.map((stage) =>
      labelFor(DEAL_STAGES, stage.value, translate)
    );
    const totals = DEAL_STAGES.map((stage) =>
      filtered
        .filter((deal) => (deal.stage ?? "inquiry") === stage.value)
        .reduce((sum, deal) => sum + Number(deal.amount ?? 0), 0)
    );
    const weighted = DEAL_STAGES.map((stage) =>
      filtered
        .filter((deal) => (deal.stage ?? "inquiry") === stage.value)
        .reduce((sum, deal) => sum + deal.weighted, 0)
    );
    return {
      color: [chart.palette[0], chart.palette[2]],
      grid: { left: 6, right: 16, top: 28, bottom: 8, containLabel: true },
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
        backgroundColor: chart.tooltipBg,
        borderColor: chart.tooltipBorder,
        borderWidth: 1,
        textStyle: { color: chart.tooltipText, fontSize: 12 },
        valueFormatter: (value: number) => formatCurrencyCompact(value, locale),
      },
      xAxis: {
        type: "category",
        data: labels,
        axisTick: { show: false },
        axisLine: { lineStyle: { color: chart.grid } },
        axisLabel: { color: chart.axis, fontSize: 12 },
      },
      yAxis: {
        type: "value",
        axisLine: { show: false },
        splitLine: { lineStyle: { color: chart.grid } },
        axisLabel: {
          color: chart.axis,
          fontSize: 12,
          formatter: (value: number) => formatCurrencyCompact(value, locale),
        },
      },
      series: [
        {
          name: translate(
            "sales.pipeline.chart.total",
            { ns: "starter" },
            "Deal value"
          ),
          type: "bar",
          data: totals,
          barWidth: 18,
          itemStyle: { borderRadius: [4, 4, 0, 0] },
        },
        {
          name: translate(
            "sales.pipeline.chart.weighted",
            { ns: "starter" },
            "Weighted"
          ),
          type: "bar",
          data: weighted,
          barWidth: 18,
          itemStyle: { borderRadius: [4, 4, 0, 0] },
        },
      ],
    };
  }, [filtered, chart, locale, translate]);

  const moveDeal = (deal: EnrichedDeal, stage: string) => {
    if ((deal.stage ?? "inquiry") === stage) return;
    if (!canTransition(deal.stage, stage)) {
      rejectMove(deal);
      return;
    }
    updateDeal(
      { resource: "hub_sales_deals", id: deal.id, values: { stage } },
      { onSuccess: () => refetch() }
    );
  };

  const rejectMove = (deal: EnrichedDeal) => {
    const allowed = nextStages(deal.stage)
      .map((value) => labelFor(DEAL_STAGES, value, translate))
      .join(", ");
    notify?.({
      type: "error",
      message: translate(
        "sales.pipeline.illegalMove.title",
        { ns: "starter" },
        "That stage move isn't allowed"
      ),
      description: translate(
        "sales.pipeline.illegalMove.description",
        { ns: "starter" },
        "{{deal}} is in {{from}}. From there it can only go to: {{allowed}}."
      )
        .replace("{{deal}}", deal.title ?? "")
        .replace(
          "{{from}}",
          labelFor(DEAL_STAGES, deal.stage ?? "inquiry", translate)
        )
        .replace("{{allowed}}", allowed),
    });
  };

  const csvColumns = useMemo<Array<GridColumn<EnrichedDeal>>>(
    () => [
      {
        id: "title",
        header: translate("sales.deals.fields.title", { ns: "starter" }, "Deal"),
        cell: (deal) => deal.title,
        csv: (deal) => deal.title ?? "",
      },
      {
        id: "account",
        header: translate("sales.deals.fields.account", { ns: "starter" }, "Account"),
        cell: (deal) => deal.account?.name,
        csv: (deal) => deal.account?.name ?? "",
      },
      {
        id: "stage",
        header: translate("sales.deals.fields.stage", { ns: "starter" }, "Stage"),
        cell: (deal) => deal.stage,
        csv: (deal) =>
          labelFor(DEAL_STAGES, deal.stage ?? "inquiry", translate),
      },
      {
        id: "amount",
        header: translate("sales.deals.fields.amount", { ns: "starter" }, "Amount"),
        cell: (deal) => deal.amount,
        csv: (deal) => String(deal.amount ?? 0),
      },
      {
        id: "weighted",
        header: translate("sales.deals.columns.weighted", { ns: "starter" }, "Weighted"),
        cell: (deal) => deal.weighted,
        csv: (deal) => deal.weighted.toFixed(0),
      },
      {
        id: "close",
        header: translate(
          "sales.deals.fields.expectedClose",
          { ns: "starter" },
          "Expected close"
        ),
        cell: (deal) => deal.expected_close_date,
        csv: (deal) => deal.expected_close_date ?? "",
      },
      {
        id: "lastTouch",
        header: translate(
          "sales.deals.columns.lastActivity",
          { ns: "starter" },
          "Last activity"
        ),
        cell: (deal) => deal.lastTouchAt,
        csv: (deal) => deal.lastTouchAt?.slice(0, 10) ?? "",
      },
      {
        id: "owner",
        header: translate("sales.deals.fields.owner", { ns: "starter" }, "Owner"),
        cell: (deal) => userLabel(deal.owner),
        csv: (deal) => userLabel(deal.owner),
      },
    ],
    [translate]
  );

  // Only stages every selected deal may legally move to are offered in bulk.
  const bulkStageOptions = useMemo(() => {
    const chosen = deals.filter((deal) => selected.includes(deal.id));
    if (chosen.length === 0) return [];
    return DEAL_STAGES.filter((stage) =>
      chosen.every((deal) => canTransition(deal.stage, stage.value))
    ).map((stage) => ({
      value: stage.value as string,
      label: labelFor(DEAL_STAGES, stage.value, translate),
    }));
  }, [deals, selected, translate]);

  const activeFilterCount =
    quick.length +
    owners.length +
    stages.length +
    (search.trim() ? 1 : 0);

  if (isError) {
    return (
      <ListView resource="hub_sales_deals">
        <div className="flex flex-col items-center gap-3 rounded-xl border border-destructive/30 bg-destructive/5 px-6 py-16 text-center">
          <p className="text-sm font-medium">
            {translate(
              "sales.pipeline.loadError.title",
              { ns: "starter" },
              "Unable to load pipeline"
            )}
          </p>
          <p className="max-w-sm text-sm text-muted-foreground">
            {translate(
              "sales.pipeline.loadError.description",
              { ns: "starter" },
              "Check your connection and try again."
            )}
          </p>
          <Button variant="outline" size="sm" onClick={refetch}>
            <RefreshCcw />
            {translate("sales.grid.error.retry", { ns: "starter" }, "Retry")}
          </Button>
        </div>
      </ListView>
    );
  }

  return (
    <ListView resource="hub_sales_deals">
      {/* KPI strip — every tile narrows the pipeline below. */}
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-5">
        {isLoading
          ? Array.from({ length: 5 }).map((_, index) => (
              <div key={index} className="rounded-xl border bg-card p-4">
                <Skeleton className="h-3 w-24" />
                <Skeleton className="mt-3 h-7 w-20" />
              </div>
            ))
          : [
              {
                id: "value",
                label: translate(
                  "sales.pipeline.kpi.pipelineValue",
                  { ns: "starter" },
                  "Pipeline value"
                ),
                value: formatCurrency(stats.pipelineValue, locale),
                hint: translate(
                  "sales.pipeline.kpi.openDeals.hint",
                  { ns: "starter" },
                  "Inquiry, quote & negotiation"
                ),
                icon: Wallet,
              },
              {
                id: "weighted",
                label: translate(
                  "sales.pipeline.kpi.weighted",
                  { ns: "starter" },
                  "Weighted forecast"
                ),
                value: formatCurrency(stats.weighted, locale),
                hint: translate(
                  "sales.pipeline.kpi.weighted.hint",
                  { ns: "starter" },
                  "Value × stage probability"
                ),
                icon: Percent,
              },
              {
                id: "closing",
                label: translate(
                  "sales.pipeline.kpi.closingSoon",
                  { ns: "starter" },
                  "Closing ≤ 30 days"
                ),
                value: String(stats.closingSoon),
                hint: translate(
                  "sales.pipeline.kpi.closingSoon.hint",
                  { ns: "starter" },
                  "Open deals due this month"
                ),
                icon: CalendarClock,
                onClick: () => toggleQuick("closingSoon"),
                active: quick.includes("closingSoon"),
              },
              {
                id: "attention",
                label: translate(
                  "sales.pipeline.kpi.needsAttention",
                  { ns: "starter" },
                  "Needs attention"
                ),
                value: String(stats.stale),
                hint: translate(
                  "sales.pipeline.kpi.needsAttention.hint",
                  { ns: "starter" },
                  "No activity in {{days}}+ days"
                ).replace("{{days}}", String(STALE_THRESHOLD_DAYS)),
                icon: AlertTriangle,
                onClick: () => toggleQuick("needsAttention"),
                active: quick.includes("needsAttention"),
              },
              {
                id: "winRate",
                label: translate(
                  "sales.pipeline.kpi.winRate",
                  { ns: "starter" },
                  "Win rate"
                ),
                value: `${stats.winRate}%`,
                hint: translate(
                  "sales.pipeline.kpi.winRate.hint",
                  { ns: "starter" },
                  "Won vs decided deals"
                ),
                icon: TrendingUp,
              },
            ].map((tile) => {
              const Icon = tile.icon;
              return (
                <button
                  key={tile.id}
                  type="button"
                  disabled={!tile.onClick}
                  onClick={tile.onClick}
                  className={cn(
                    "flex flex-col items-start rounded-xl border bg-card p-4 text-left shadow-[0_1px_2px_rgba(0,0,0,0.04)] transition-colors",
                    tile.onClick && "hover:border-primary/40 hover:bg-accent/40",
                    tile.active && "border-primary/60 bg-primary/5"
                  )}
                >
                  <div className="flex w-full items-center justify-between gap-2">
                    <span className="truncate text-xs text-muted-foreground">
                      {tile.label}
                    </span>
                    <span className="flex size-6 shrink-0 items-center justify-center rounded-md bg-blue-500/12 text-blue-600 dark:text-blue-400">
                      <Icon className="size-3.5" />
                    </span>
                  </div>
                  <p className="mt-1.5 text-2xl font-semibold tracking-tight tabular-nums">
                    {tile.value}
                  </p>
                  <p className="mt-1 truncate text-xs text-muted-foreground">
                    {tile.hint}
                  </p>
                </button>
              );
            })}
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-52 flex-1 sm:max-w-xs">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(event) => setSearch(event.currentTarget.value)}
            placeholder={translate(
              "sales.pipeline.searchPlaceholder",
              { ns: "starter" },
              "Search deals or accounts…"
            )}
            className="pl-8"
          />
        </div>

        <ChipFilter
          label={translate("sales.deals.fields.stage", { ns: "starter" }, "Stage")}
          options={DEAL_STAGES.map((stage) => ({
            value: stage.value as string,
            label: labelFor(DEAL_STAGES, stage.value, translate),
          }))}
          selected={stages}
          onChange={setStages}
        />
        <ChipFilter
          label={translate("sales.deals.fields.owner", { ns: "starter" }, "Owner")}
          options={ownerOptions}
          selected={owners}
          onChange={setOwners}
          searchable
        />
        <Button
          variant={quick.includes("mine") ? "secondary" : "outline"}
          size="sm"
          disabled={!currentUserId}
          onClick={() => toggleQuick("mine")}
        >
          {translate("sales.pipeline.filter.mine", { ns: "starter" }, "My deals")}
        </Button>
        <Button
          variant={quick.includes("overdue") ? "secondary" : "outline"}
          size="sm"
          onClick={() => toggleQuick("overdue")}
        >
          <AlertTriangle />
          {translate("sales.pipeline.filter.overdue", { ns: "starter" }, "Overdue")}
          <span className="ml-1 tabular-nums text-muted-foreground">
            {stats.overdue}
          </span>
        </Button>
        {activeFilterCount > 0 ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setSearch("");
              setOwners([]);
              setStages([]);
              setQuick([]);
            }}
          >
            <X />
            {translate("sales.toolbar.clearAll", { ns: "starter" }, "Clear")}
          </Button>
        ) : null}

        <div className="ml-auto flex items-center gap-1.5">
          <span className="hidden text-xs text-muted-foreground sm:inline">
            {translate(
              "sales.toolbar.resultCount",
              { ns: "starter" },
              "{{count}} records"
            ).replace("{{count}}", String(filtered.length))}
          </span>
          <div className="flex overflow-hidden rounded-lg border">
            <Button
              variant={mode === "board" ? "secondary" : "ghost"}
              size="sm"
              className="rounded-none"
              onClick={() => setMode("board")}
            >
              <LayoutGrid />
              {translate("sales.pipeline.view.board", { ns: "starter" }, "Board")}
            </Button>
            <Button
              variant={mode === "table" ? "secondary" : "ghost"}
              size="sm"
              className="rounded-none"
              onClick={() => setMode("table")}
            >
              <Table2 />
              {translate("sales.pipeline.view.table", { ns: "starter" }, "Table")}
            </Button>
          </div>
          {mode === "table" ? (
            <Button
              variant="outline"
              size="icon-sm"
              onClick={() =>
                setDensity(density === "compact" ? "comfortable" : "compact")
              }
              aria-label={translate(
                "sales.toolbar.density.compact",
                { ns: "starter" },
                "Compact"
              )}
            >
              {density === "compact" ? <Rows3 /> : <Columns3 />}
            </Button>
          ) : null}
          <Button
            variant="outline"
            size="icon-sm"
            onClick={() => downloadCsv("deals.csv", toCsv(csvColumns, filtered))}
            aria-label={translate(
              "sales.toolbar.export",
              { ns: "starter" },
              "Export CSV"
            )}
          >
            <Download />
          </Button>
          <Button
            variant="outline"
            size="icon-sm"
            onClick={refetch}
            aria-label={translate("sales.toolbar.refresh", { ns: "starter" }, "Refresh")}
          >
            <RefreshCcw className={cn(isFetching && "animate-spin")} />
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="pt-6">
          <div className="mb-2 flex items-baseline justify-between">
            <h3 className="text-sm font-medium">
              {translate(
                "sales.pipeline.chart.title",
                { ns: "starter" },
                "Pipeline value by stage"
              )}
            </h3>
            <span className="text-xs text-muted-foreground">
              {translate(
                "sales.pipeline.chart.hint",
                { ns: "starter" },
                "Weighted uses the default probability for each stage"
              )}
            </span>
          </div>
          {isLoading ? (
            <Skeleton className="h-56 w-full" />
          ) : (
            <ReactECharts
              key={`stage-${chart.isDark}`}
              option={chartOption}
              style={{ height: 220 }}
              opts={{ renderer: "svg" }}
            />
          )}
        </CardContent>
      </Card>

      {isLoading ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-5">
          {DEAL_STAGES.map((stage) => (
            <Skeleton key={stage.value} className="h-72 rounded-xl" />
          ))}
        </div>
      ) : mode === "board" ? (
        <PipelineBoard
          deals={filtered}
          locale={locale}
          onOpen={(deal) => openChild(`show/${deal.id}`)}
          onMove={moveDeal}
          onIllegalMove={(deal) => rejectMove(deal)}
        />
      ) : (
        <DealTable
          deals={filtered}
          locale={locale}
          density={density}
          selected={selected}
          onToggleRow={(id) =>
            setSelected((current) =>
              current.includes(id)
                ? current.filter((value) => value !== id)
                : [...current, id]
            )
          }
          onToggleAll={(ids) =>
            setSelected((current) =>
              ids.every((id) => current.includes(id)) ? [] : ids
            )
          }
          onOpen={(deal) => openChild(`show/${deal.id}`)}
          onEdit={(deal) => openChild(`edit/${deal.id}`)}
        />
      )}

      {mode === "table" ? (
        <BulkBar
          resource="hub_sales_deals"
          selected={selected}
          onClear={() => setSelected([])}
          onDone={() => {
            setSelected([]);
            refetch();
          }}
          fieldActions={
            bulkStageOptions.length > 0
              ? [
                  {
                    field: "stage",
                    label: translate(
                      "sales.deals.fields.stage",
                      { ns: "starter" },
                      "Stage"
                    ),
                    options: bulkStageOptions,
                  },
                ]
              : []
          }
        />
      ) : null}
    </ListView>
  );
}

/** Small multi-select used by the pipeline toolbar (stage, owner). */
function ChipFilter({
  label,
  options,
  selected,
  onChange,
  searchable,
}: {
  label: string;
  options: Array<{ value: string; label: string }>;
  selected: string[];
  onChange: (values: string[]) => void;
  searchable?: boolean;
}) {
  const translate = useTranslate();
  const [typed, setTyped] = useState("");
  const visible = searchable
    ? options.filter((option) =>
        option.label.toLowerCase().includes(typed.trim().toLowerCase())
      )
    : options;

  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button variant={selected.length > 0 ? "secondary" : "outline"} size="sm" />
        }
      >
        {label}
        {selected.length > 0 ? (
          <span className="ml-1 rounded bg-primary/15 px-1.5 py-0.5 text-[11px] font-medium text-primary tabular-nums">
            {selected.length}
          </span>
        ) : null}
      </PopoverTrigger>
      <PopoverContent align="start" className="w-56 p-1">
        {searchable ? (
          <div className="p-1">
            <Input
              value={typed}
              onChange={(event) => setTyped(event.currentTarget.value)}
              placeholder={translate(
                "sales.toolbar.facet.search",
                { ns: "starter" },
                "Filter options…"
              )}
              className="h-8"
            />
          </div>
        ) : null}
        <div className="max-h-64 overflow-y-auto">
          {visible.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() =>
                onChange(
                  selected.includes(option.value)
                    ? selected.filter((value) => value !== option.value)
                    : [...selected, option.value]
                )
              }
              className={cn(
                "flex w-full items-center justify-between rounded-md px-2 py-1.5 text-sm hover:bg-accent",
                selected.includes(option.value) && "font-medium"
              )}
            >
              <span className="truncate">{option.label}</span>
              {selected.includes(option.value) ? (
                <span className="size-1.5 rounded-full bg-primary" />
              ) : null}
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
