import { useList, useTranslate } from "@refinedev/core";
import {
  AlertTriangle,
  Clock,
  Columns3,
  LayoutGrid,
  Rows3,
  TrendingUp,
  UserCog,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { ListView } from "@/components/resources/views/list-view";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { CrmAIContext, CrmAIShortcut, usePipelineTasks } from "../ai-assistant";
import {
  DEAL_STAGES,
  DEAL_STAGE_PROBABILITY,
  formatCurrency,
  formatDate,
  labelFor,
} from "../constants";
import { csvTimestamp, downloadCsv, type CsvColumn } from "../csv";
import { useCrmIdentity } from "../identity";
import {
  ListDateRange,
  ListFilterSelect,
  ListSearchInput,
  ListToolbar,
  ListToolbarContent,
  dateRangeFilter,
  searchFilter,
  useDebouncedValue,
} from "../list-controls";
import {
  BulkActionBar,
  BulkOwnerDialog,
  ExportCsvButton,
  KpiStrip,
  ListEmptyState,
  ListErrorState,
  SavedViewsMenu,
  SelectCell,
  TableSkeleton,
  useActiveViewName,
  useBulkMutation,
  useRowSelection,
  useSavedViews,
  type BulkAction,
  type ViewPreset,
} from "../list-toolkit";
import { useCustomerOptions, useOwnerOptions } from "../pickers";
import { useRecordCursorSource } from "../record-cursor";
import { useOpenContextualChild } from "../route-surfaces";
import { EnumBadge, useLocale } from "../shared";
import { useUrlState } from "../url-state";
import type { DealRecord } from "../types";
import { useStageTransition } from "./stage-actions";
import {
  daysInStage,
  isOpenStage,
  stageAgeTone,
  todayIso,
  weightedAmount,
} from "./stage-machine";

const PIPELINE_FILTER_DEFAULTS = {
  q: "",
  owner: "all",
  customer: "all",
  stage: "all",
  from: "",
  to: "",
  layout: "board",
};

type PipelineFilterState = typeof PIPELINE_FILTER_DEFAULTS;

export function PipelinePage() {
  const translate = useTranslate();
  const identity = useCrmIdentity();
  const locale = useLocale();
  const openChild = useOpenContextualChild();
  const [dragOverStage, setDragOverStage] = useState<string | null>(null);
  const [ownerDialogOpen, setOwnerDialogOpen] = useState(false);
  const { options: ownerOptions } = useOwnerOptions();
  const { options: customerOptions } = useCustomerOptions();
  const { state, setState, replaceState, reset, isDirty } =
    useUrlState<PipelineFilterState>(PIPELINE_FILTER_DEFAULTS);
  const debouncedSearch = useDebouncedValue(state.q);
  const stageTransition = useStageTransition();
  const bulk = useBulkMutation("crm_deals");

  const filters = useMemo(
    () => [
      ...searchFilter(["title", "notes"], debouncedSearch),
      ...(state.owner === "all"
        ? []
        : [{ field: "ownerId", operator: "eq" as const, value: state.owner }]),
      ...(state.customer === "all"
        ? []
        : [{ field: "customer_id", operator: "eq" as const, value: state.customer }]),
      ...(state.stage === "all"
        ? []
        : [{ field: "stage", operator: "eq" as const, value: state.stage }]),
      ...dateRangeFilter("expected_close_date", state.from, state.to),
    ],
    [debouncedSearch, state.customer, state.from, state.owner, state.stage, state.to]
  );

  const { result, query } = useList<DealRecord>({
    resource: "crm_deals",
    filters,
    // The board renders every stage at once, so it keeps a large page rather
    // than paginating; the filters above are what keep the result set small.
    pagination: { mode: "server", currentPage: 1, pageSize: 300 },
    meta: { appends: ["customer", "owner"] },
    errorNotification: false,
    queryOptions: { retry: false },
  });

  const grouped = useMemo(() => {
    const buckets: Record<string, DealRecord[]> = {};
    for (const stage of DEAL_STAGES) {
      buckets[stage.value] = [];
    }
    for (const deal of result.data) {
      const stage = deal.stage && stageExists(deal.stage) ? deal.stage : "inquiry";
      buckets[stage].push(deal);
    }
    const sortByExpectedClose = (left: DealRecord, right: DealRecord) =>
      (left.expected_close_date ?? "9999").localeCompare(
        right.expected_close_date ?? "9999"
      );
    Object.values(buckets).forEach((bucket) => bucket.sort(sortByExpectedClose));
    return buckets;
  }, [result.data]);

  const today = todayIso();
  const openDeals = result.data.filter((deal) => isOpenStage(deal.stage));
  const openValue = openDeals.reduce((sum, deal) => sum + Number(deal.amount ?? 0), 0);
  const weightedValue = openDeals.reduce((sum, deal) => sum + weightedAmount(deal), 0);
  const wonCount = grouped.won?.length ?? 0;
  const lostCount = grouped.lost?.length ?? 0;
  const winRate = wonCount + lostCount > 0
    ? Math.round((wonCount / (wonCount + lostCount)) * 100)
    : 0;
  const overdue = openDeals.filter(
    (deal) => (deal.expected_close_date ?? "") !== "" && (deal.expected_close_date as string) < today
  );
  const averageSize = openDeals.length ? openValue / openDeals.length : 0;

  const isTable = state.layout === "table";
  const tableRows = useMemo(
    () =>
      [...result.data].sort(
        (left, right) => weightedAmount(right) - weightedAmount(left)
      ),
    [result.data]
  );
  const cursorIds = useMemo(
    () =>
      isTable
        ? tableRows.map((deal) => deal.id)
        : DEAL_STAGES.flatMap((stage) =>
            (grouped[stage.value] ?? []).map((deal) => deal.id)
          ),
    [grouped, isTable, tableRows]
  );
  useRecordCursorSource("deal", cursorIds);
  const selection = useRowSelection(isTable ? tableRows.map((deal) => deal.id) : []);

  const presets = useMemo<ViewPreset<PipelineFilterState>[]>(
    () => [
      ...(identity.userId
        ? [
            {
              id: "mine",
              name: translate(
                "crm.views.mine",
                { ns: "starter" },
                "Assigned to me"
              ),
              state: { owner: identity.userId },
            },
          ]
        : []),
      {
        id: "open",
        name: translate("crm.pipeline.views.negotiation", { ns: "starter" }, "In negotiation"),
        state: { stage: "negotiation" },
      },
      {
        id: "closing",
        name: translate("crm.pipeline.views.closing", { ns: "starter" }, "Closing this month"),
        state: {
          from: today.slice(0, 8) + "01",
          to: new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0)
            .toISOString()
            .slice(0, 10),
        },
      },
      {
        id: "won",
        name: translate("crm.pipeline.views.won", { ns: "starter" }, "Closed won"),
        state: { stage: "won" },
      },
      {
        id: "table",
        name: translate("crm.pipeline.views.forecast", { ns: "starter" }, "Forecast table"),
        state: { layout: "table" },
      },
    ],
    [identity.userId, today, translate]
  );
  const savedViews = useSavedViews<PipelineFilterState>("pipeline");
  const activeView = useActiveViewName(
    state,
    PIPELINE_FILTER_DEFAULTS,
    presets,
    savedViews.views
  );

  const csvColumns = useMemo<CsvColumn<DealRecord>[]>(
    () => [
      { header: translate("crm.deals.fields.title", { ns: "starter" }, "Deal"), value: (deal) => deal.title },
      { header: translate("crm.deals.fields.customer", { ns: "starter" }, "Customer"), value: (deal) => deal.customer?.company_name },
      { header: translate("crm.deals.fields.owner", { ns: "starter" }, "Owner"), value: (deal) => deal.owner?.nickname },
      { header: translate("crm.deals.fields.stage", { ns: "starter" }, "Stage"), value: (deal) => labelFor(DEAL_STAGES, deal.stage, translate) },
      { header: translate("crm.deals.fields.amount", { ns: "starter" }, "Amount"), value: (deal) => Number(deal.amount ?? 0) },
      { header: translate("crm.deals.fields.weighted", { ns: "starter" }, "Weighted"), value: (deal) => Math.round(weightedAmount(deal)) },
      { header: translate("crm.deals.fields.probability", { ns: "starter" }, "Probability %"), value: (deal) => Math.round((DEAL_STAGE_PROBABILITY[deal.stage ?? ""] ?? 0) * 100) },
      { header: translate("crm.deals.fields.expectedClose", { ns: "starter" }, "Expected close"), value: (deal) => deal.expected_close_date ?? "" },
      { header: translate("crm.deals.fields.closedDate", { ns: "starter" }, "Closed date"), value: (deal) => deal.closed_date ?? "" },
      { header: translate("crm.deals.fields.stageAge", { ns: "starter" }, "Days in stage"), value: (deal) => daysInStage(deal) ?? "" },
    ],
    [translate]
  );

  const bulkActions = useMemo<BulkAction[]>(
    () => [
      {
        id: "owner",
        label: translate("crm.bulk.assignOwner", { ns: "starter" }, "Assign owner"),
        icon: <UserCog className="size-4" />,
        onRun: () => setOwnerDialogOpen(true),
      },
    ],
    [translate]
  );

  const aiTasks = usePipelineTasks(translate);

  return (
    <CrmAIContext
      id="crm-pipeline-board"
      title={translate("crm.ai.context.pipeline", { ns: "starter" }, "Deal pipeline")}
      kind="record-list"
      getContext={() => ({
        resource: "crm_deals",
        filters: state,
        forecast: {
          open_value: openValue,
          weighted_value: weightedValue,
          win_rate: winRate,
          overdue: overdue.length,
        },
        stages: DEAL_STAGES.map((stage) => ({
          stage: stage.value,
          count: (grouped[stage.value] ?? []).length,
          value: (grouped[stage.value] ?? []).reduce(
            (sum, deal) => sum + Number(deal.amount ?? 0),
            0
          ),
          deals: (grouped[stage.value] ?? []).map((deal) => ({
            id: deal.id,
            title: deal.title,
            amount: deal.amount,
            weighted_amount: weightedAmount(deal),
            days_in_stage: daysInStage(deal),
            expected_close_date: deal.expected_close_date,
            customer: deal.customer?.company_name ?? null,
            owner: deal.owner?.nickname ?? null,
          })),
        })),
      })}
    >
    <ListView resource="crm_deals">
      <div className="rounded-xl border bg-card shadow-sm">
        <KpiStrip
          loading={query.isLoading}
          chips={[
            {
              id: "open",
              label: translate("crm.pipeline.kpi.open", { ns: "starter" }, "Open pipeline"),
              value: formatCurrency(openValue, locale),
            },
            {
              id: "weighted",
              label: translate("crm.pipeline.kpi.weighted", { ns: "starter" }, "Weighted forecast"),
              value: formatCurrency(weightedValue, locale),
              tone: "success",
            },
            {
              id: "winRate",
              label: translate("crm.pipeline.kpi.winRate", { ns: "starter" }, "Win rate"),
              value: `${winRate}%`,
            },
            {
              id: "average",
              label: translate("crm.pipeline.kpi.average", { ns: "starter" }, "Average deal"),
              value: formatCurrency(averageSize, locale),
            },
            {
              id: "overdue",
              label: translate("crm.pipeline.kpi.overdue", { ns: "starter" }, "Past close date"),
              value: overdue.length,
              tone: overdue.length > 0 ? "danger" : "default",
              active: Boolean(state.to) && state.to === today,
              onClick: () => replaceState({ to: today, layout: state.layout }),
            },
          ]}
        />
        <ListToolbar>
          <ListToolbarContent
            actions={
              <div className="flex flex-wrap items-center gap-2">
                <SavedViewsMenu
                  presets={presets}
                  views={savedViews.views}
                  activeName={activeView}
                  isDirty={isDirty}
                  onApply={(next) => replaceState(next)}
                  onSave={(name) => savedViews.save(name, state)}
                  onDelete={savedViews.remove}
                  onReset={reset}
                />
                <div className="flex items-center rounded-lg border p-0.5">
                  <Button
                    variant={isTable ? "ghost" : "secondary"}
                    size="sm"
                    className="gap-1.5"
                    onClick={() => setState({ layout: "board" })}
                  >
                    <LayoutGrid className="size-4" />
                    {translate("crm.pipeline.layout.board", { ns: "starter" }, "Board")}
                  </Button>
                  <Button
                    variant={isTable ? "secondary" : "ghost"}
                    size="sm"
                    className="gap-1.5"
                    onClick={() => setState({ layout: "table" })}
                  >
                    <Rows3 className="size-4" />
                    {translate("crm.pipeline.layout.table", { ns: "starter" }, "Forecast")}
                  </Button>
                </div>
                <ExportCsvButton
                  disabled={result.data.length === 0}
                  onExport={() =>
                    downloadCsv(`crm-pipeline-${csvTimestamp()}.csv`, csvColumns, result.data)
                  }
                />
                <CrmAIShortcut
                  tasks={aiTasks}
                  label={translate("crm.ai.askAssistant", { ns: "starter" }, "Ask the CRM assistant")}
                />
              </div>
            }
          >
            <ListSearchInput
              value={state.q}
              onChange={(value) => setState({ q: value })}
              placeholder={translate("crm.pipeline.search", { ns: "starter" }, "Search deal title or notes")}
            />
            <ListFilterSelect
              value={state.owner}
              onChange={(value) => setState({ owner: value })}
              options={ownerOptions}
              allLabel={translate("crm.common.allOwners", { ns: "starter" }, "All owners")}
            />
            <ListFilterSelect
              value={state.customer}
              onChange={(value) => setState({ customer: value })}
              options={customerOptions}
              allLabel={translate("crm.common.allCustomers", { ns: "starter" }, "All customers")}
            />
            <ListDateRange
              from={state.from}
              to={state.to}
              onFromChange={(value) => setState({ from: value })}
              onToChange={(value) => setState({ to: value })}
              label={translate("crm.deals.fields.expectedClose", { ns: "starter" }, "Expected close")}
            />
          </ListToolbarContent>
        </ListToolbar>
        {isTable ? (
          <BulkActionBar
            count={selection.selected.length}
            ids={selection.selected}
            actions={bulkActions}
            busy={bulk.running}
            onClear={selection.clear}
          />
        ) : null}
      </div>

      {query.isLoading ? (
        <TableSkeleton columns={6} />
      ) : query.isError ? (
        <ListErrorState
          onRetry={() => void query.refetch()}
          title={translate("crm.pipeline.loadError.title", { ns: "starter" }, "Unable to load pipeline")}
          description={translate(
            "crm.pipeline.loadError.description",
            { ns: "starter" },
            "Check your connection and try again."
          )}
        />
      ) : result.data.length === 0 ? (
        <div className="rounded-xl border bg-card">
          <ListEmptyState
            title={translate("crm.pipeline.empty", { ns: "starter" }, "No deals match the current filters.")}
            description={translate(
              "crm.pipeline.emptyDescription",
              { ns: "starter" },
              "Clear the filters or create a deal to start building the forecast."
            )}
            filtered={isDirty}
            onClearFilters={reset}
          />
        </div>
      ) : isTable ? (
        <ForecastTable
          deals={tableRows}
          locale={locale}
          selection={selection}
          onOpen={(id) => openChild(`show/${id}`)}
        />
      ) : (
        <div className="flex gap-4 overflow-x-auto pb-3">
          {DEAL_STAGES.map((stage) => (
            <PipelineColumn
              key={stage.value}
              stage={stage}
              deals={grouped[stage.value] ?? []}
              locale={locale}
              isDragOver={dragOverStage === stage.value}
              onDragEnter={() => setDragOverStage(stage.value)}
              onDragLeave={() => setDragOverStage(null)}
              onDropDeal={(dealId) => {
                setDragOverStage(null);
                const deal = result.data.find((item) => String(item.id) === dealId);
                if (deal) stageTransition.request(deal, stage.value);
              }}
              onOpen={(id) => openChild(`show/${id}`)}
            />
          ))}
        </div>
      )}

      {stageTransition.dialog}
      <BulkOwnerDialog
        open={ownerDialogOpen}
        onOpenChange={setOwnerDialogOpen}
        count={selection.selected.length}
        onAssign={(ownerId) =>
          void bulk.run(
            selection.selected,
            { ownerId },
            translate("crm.bulk.assigned", { ns: "starter" }, "Owner updated")
          )
        }
      />
    </ListView>
    </CrmAIContext>
  );
}

function stageExists(stage: string): boolean {
  return DEAL_STAGES.some((item) => item.value === stage);
}

/** Forecast table: the same deals as the board, ranked by weighted value. */
function ForecastTable({
  deals,
  locale,
  selection,
  onOpen,
}: {
  deals: DealRecord[];
  locale: string;
  selection: ReturnType<typeof useRowSelection>;
  onOpen: (id: DealRecord["id"]) => void;
}) {
  const translate = useTranslate();
  const today = todayIso();

  return (
    <div className="overflow-x-auto rounded-xl border bg-card shadow-sm">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-10">
              <SelectCell
                checked={selection.allSelected}
                onToggle={selection.toggleAll}
                label={translate("crm.bulk.selectAll", { ns: "starter" }, "Select all rows")}
              />
            </TableHead>
            <TableHead>{translate("crm.deals.fields.title", { ns: "starter" }, "Deal")}</TableHead>
            <TableHead>{translate("crm.deals.fields.stage", { ns: "starter" }, "Stage")}</TableHead>
            <TableHead className="text-right">{translate("crm.deals.fields.amount", { ns: "starter" }, "Amount")}</TableHead>
            <TableHead className="text-right">{translate("crm.deals.fields.weighted", { ns: "starter" }, "Weighted")}</TableHead>
            <TableHead>{translate("crm.deals.fields.expectedClose", { ns: "starter" }, "Expected close")}</TableHead>
            <TableHead className="text-right">{translate("crm.deals.fields.stageAge", { ns: "starter" }, "Days in stage")}</TableHead>
            <TableHead>{translate("crm.deals.fields.owner", { ns: "starter" }, "Owner")}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {deals.map((deal) => {
            const overdue =
              isOpenStage(deal.stage) &&
              Boolean(deal.expected_close_date) &&
              (deal.expected_close_date as string) < today;
            const age = daysInStage(deal);
            return (
              <TableRow
                key={String(deal.id)}
                className="cursor-pointer"
                data-state={selection.isSelected(deal.id) ? "selected" : undefined}
                onClick={() => onOpen(deal.id)}
              >
                <TableCell onClick={(event) => event.stopPropagation()}>
                  <SelectCell
                    checked={selection.isSelected(deal.id)}
                    onToggle={() => selection.toggle(deal.id)}
                    label={translate("crm.bulk.selectRow", { ns: "starter" }, "Select row")}
                  />
                </TableCell>
                <TableCell>
                  <div className="font-medium">{deal.title || "—"}</div>
                  <div className="text-xs text-muted-foreground">
                    {deal.customer?.company_name || "—"}
                  </div>
                </TableCell>
                <TableCell>
                  <EnumBadge
                    value={deal.stage ?? "inquiry"}
                    label={labelFor(DEAL_STAGES, deal.stage ?? "inquiry", translate)}
                  />
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatCurrency(deal.amount, locale)}
                </TableCell>
                <TableCell className="text-right font-semibold tabular-nums">
                  {formatCurrency(weightedAmount(deal), locale)}
                  <span className="ml-1 text-xs text-muted-foreground">
                    {Math.round((DEAL_STAGE_PROBABILITY[deal.stage ?? ""] ?? 0) * 100)}%
                  </span>
                </TableCell>
                <TableCell
                  className={cn(
                    "whitespace-nowrap",
                    overdue && "font-medium text-red-600 dark:text-red-400"
                  )}
                >
                  {overdue ? <AlertTriangle className="mr-1 inline size-3.5" /> : null}
                  {formatDate(deal.expected_close_date, locale)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  <StageAge days={age} />
                </TableCell>
                <TableCell>{deal.owner?.nickname || "—"}</TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

function StageAge({ days }: { days: number | null }) {
  const translate = useTranslate();
  if (days === null) return <span className="text-muted-foreground">—</span>;
  const tone = stageAgeTone(days);
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-medium",
        tone === "danger"
          ? "bg-red-500/15 text-red-700 dark:text-red-300"
          : tone === "warning"
            ? "bg-amber-500/15 text-amber-700 dark:text-amber-300"
            : "text-muted-foreground"
      )}
      title={translate("crm.deals.fields.stageAge", { ns: "starter" }, "Days in stage")}
    >
      <Clock className="size-3" />
      {days}
    </span>
  );
}

// Cards revealed per scroll step. The board keeps the whole (filtered) result in
// memory, so each column renders a growing window and reveals more as the visitor
// scrolls to the bottom — keeps long stages light without a second round-trip.
const COLUMN_PAGE_SIZE = 10;

function PipelineColumn({
  stage,
  deals,
  locale,
  isDragOver,
  onDragEnter,
  onDragLeave,
  onDropDeal,
  onOpen,
}: {
  stage: (typeof DEAL_STAGES)[number];
  deals: DealRecord[];
  locale: string;
  isDragOver: boolean;
  onDragEnter: () => void;
  onDragLeave: () => void;
  onDropDeal: (dealId: string) => void;
  onOpen: (id: DealRecord["id"]) => void;
}) {
  const translate = useTranslate();
  const [visible, setVisible] = useState(COLUMN_PAGE_SIZE);

  // Reset the window whenever the underlying (filtered/sorted) set changes.
  useEffect(() => {
    setVisible(COLUMN_PAGE_SIZE);
  }, [deals]);

  const total = deals.reduce((sum, deal) => sum + Number(deal.amount ?? 0), 0);
  const weighted = deals.reduce((sum, deal) => sum + weightedAmount(deal), 0);
  const today = todayIso();
  const overdue = deals.filter(
    (deal) =>
      isOpenStage(deal.stage) &&
      Boolean(deal.expected_close_date) &&
      (deal.expected_close_date as string) < today
  ).length;
  const shown = deals.slice(0, visible);
  const hasMore = visible < deals.length;
  const revealMore = () =>
    setVisible((current) => Math.min(current + COLUMN_PAGE_SIZE, deals.length));

  return (
    <div
      data-stage={stage.value}
      className={cn(
        "flex max-h-[calc(100vh-15rem)] min-h-72 w-[300px] shrink-0 flex-col rounded-xl border bg-muted/25 transition-colors",
        isDragOver && "border-primary/60 bg-primary/5"
      )}
      onDragOver={(event) => {
        event.preventDefault();
        onDragEnter();
      }}
      onDragLeave={onDragLeave}
      onDrop={(event) => {
        event.preventDefault();
        onDropDeal(event.dataTransfer.getData("text/plain"));
      }}
    >
      <div className="space-y-1 border-b px-3 py-2.5">
        <div className="flex items-baseline justify-between">
          <div className="flex items-baseline gap-2">
            <span className="text-sm font-semibold">
              {labelFor(DEAL_STAGES, stage.value, translate)}
            </span>
            <span className="text-xs text-muted-foreground">{deals.length}</span>
          </div>
          <span className="text-xs font-medium tabular-nums text-muted-foreground">
            {formatCurrency(total, locale)}
          </span>
        </div>
        <div className="flex items-center justify-between text-[11px] text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <TrendingUp className="size-3" />
            {formatCurrency(weighted, locale)}
            <span className="opacity-70">
              ({Math.round((DEAL_STAGE_PROBABILITY[stage.value] ?? 0) * 100)}%)
            </span>
          </span>
          {overdue > 0 ? (
            <span className="inline-flex items-center gap-1 font-medium text-red-600 dark:text-red-400">
              <AlertTriangle className="size-3" />
              {translate(
                "crm.pipeline.overdueCount",
                { ns: "starter", count: overdue },
                `${overdue} overdue`
              )}
            </span>
          ) : null}
        </div>
      </div>
      <div
        className="flex flex-1 flex-col gap-2 overflow-y-auto p-2"
        onScroll={(event) => {
          const el = event.currentTarget;
          if (hasMore && el.scrollHeight - el.scrollTop - el.clientHeight < 120) {
            revealMore();
          }
        }}
      >
        {deals.length === 0 ? (
          <p className="px-2 py-6 text-center text-xs text-muted-foreground">
            {translate("crm.pipeline.emptyColumn", { ns: "starter" }, "Drop a deal here")}
          </p>
        ) : (
          <>
            {shown.map((deal) => (
              <PipelineCard
                key={String(deal.id)}
                deal={deal}
                locale={locale}
                onOpen={() => onOpen(deal.id)}
              />
            ))}
            {hasMore && (
              <button
                type="button"
                onClick={revealMore}
                className="mt-1 rounded-md border border-dashed py-1.5 text-xs text-muted-foreground transition-colors hover:bg-muted/50"
              >
                {translate("crm.pipeline.loadMore", { ns: "starter" }, "Load more")}
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function PipelineCard({
  deal,
  locale,
  onOpen,
}: {
  deal: DealRecord;
  locale: string;
  onOpen: () => void;
}) {
  const translate = useTranslate();
  const isOverdue =
    isOpenStage(deal.stage) &&
    Boolean(deal.expected_close_date) &&
    (deal.expected_close_date as string) < todayIso();
  const age = daysInStage(deal);

  return (
    <button
      type="button"
      draggable
      onDragStart={(event) =>
        event.dataTransfer.setData("text/plain", String(deal.id))
      }
      onClick={onOpen}
      className={cn(
        "group flex cursor-pointer flex-col gap-1.5 rounded-lg border bg-card p-3 text-left shadow-xs transition-shadow hover:shadow-sm",
        isOverdue && "border-red-500/40"
      )}
    >
      <span className="line-clamp-2 text-sm font-medium">{deal.title || "—"}</span>
      <span className="text-xs text-muted-foreground">
        {deal.customer?.company_name ||
          translate("crm.pipeline.noCustomer", { ns: "starter" }, "No customer")}
        {deal.owner?.nickname ? ` · ${deal.owner.nickname}` : ""}
      </span>
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-semibold tabular-nums">
          {formatCurrency(deal.amount, locale)}
        </span>
        {deal.expected_close_date ? (
          <span
            className={cn(
              "flex items-center gap-1 text-xs tabular-nums",
              isOverdue
                ? "font-medium text-red-600 dark:text-red-400"
                : "text-muted-foreground"
            )}
          >
            {isOverdue ? <AlertTriangle className="size-3" /> : null}
            {formatDate(deal.expected_close_date, locale)}
          </span>
        ) : null}
      </div>
      <div className="flex items-center justify-between gap-2 border-t pt-1.5 text-[11px] text-muted-foreground">
        <span className="inline-flex items-center gap-1 tabular-nums">
          <Columns3 className="size-3" />
          {formatCurrency(weightedAmount(deal), locale)}
        </span>
        <StageAge days={age} />
      </div>
    </button>
  );
}
